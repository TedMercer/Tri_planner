/* ══════════════════════════════════════════
   TriPlan — Strava Integration
   ══════════════════════════════════════════

   SETUP INSTRUCTIONS:
   1. Go to https://www.strava.com/settings/api
   2. Create an application (use your GitHub Pages URL as the Authorization Callback Domain)
   3. Set STRAVA_CLIENT_ID below to your Client ID
   4. Deploy a Cloudflare Worker (see /worker/strava-proxy.js) and set STRAVA_PROXY_URL
   5. The worker handles the token exchange so your client secret stays safe

   Until configured, the Strava buttons will show setup instructions.
   ══════════════════════════════════════════ */

// ── CONFIGURE THESE ──
const STRAVA_CLIENT_ID = '218965';  // Your Strava API Client ID
const STRAVA_PROXY_URL = 'https://strava-proxy.edwardmercer2001.workers.dev'; // Your Cloudflare Worker URL (e.g., https://strava-proxy.yourname.workers.dev)
const STRAVA_REDIRECT_URI = window.location.origin + window.location.pathname;
const STRAVA_SCOPE = 'read,activity:read_all';

function isStravaConfigured() {
  return STRAVA_CLIENT_ID && STRAVA_PROXY_URL;
}

// ══════════════════════════════════════════
// PROFILE SECTION
// ══════════════════════════════════════════
function buildStravaProfileSection(a) {
  let html = '<div class="strava-section">';
  html += '<div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Strava Integration</div>';

  if (!isStravaConfigured()) {
    html += `<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">
      Strava integration is available but needs configuration.<br>
      See <code style="background:var(--surface-3);padding:2px 5px;border-radius:3px;font-size:11px;">js/strava.js</code> for setup instructions.
    </div>`;
  } else if (a.strava && a.strava.accessToken) {
    html += `<button class="strava-btn connected" disabled>✓ Connected to Strava</button>`;
    html += `<div class="strava-status">Synced as: ${escapeHtml(a.strava.athleteName || 'Unknown')}</div>`;
    if (hasEditAccess()) {
      html += `<button class="strava-sync-btn" onclick="syncStravaActivities()">↻ Sync Recent Activities</button>`;
      html += ` <button class="strava-sync-btn" onclick="disconnectStrava()" style="color:var(--danger);margin-left:4px;">Disconnect</button>`;
    }
    html += `<div id="stravaSyncStatus" style="font-size:11px;color:var(--text-dim);margin-top:6px;"></div>`;
  } else {
    if (hasEditAccess()) {
      html += `<button class="strava-btn" onclick="connectStrava()">🔗 Connect Strava</button>`;
      html += `<div class="strava-status">Link your Strava account to auto-import actual activities.</div>`;
    } else {
      html += `<div style="font-size:12px;color:var(--text-dim);">No Strava account linked.</div>`;
    }
  }

  html += '</div>';
  return html;
}

// ══════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════
function connectStrava() {
  if (!isStravaConfigured()) {
    alert('Strava is not yet configured. See js/strava.js for setup instructions.');
    return;
  }
  // Store which athlete is connecting
  localStorage.setItem('triplan_strava_connecting', viewingAthleteIndex);

  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}&response_type=code&scope=${STRAVA_SCOPE}`;
  window.location.href = url;
}

function handleStravaCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  if (!isStravaConfigured()) return;

  const connectingAthlete = parseInt(localStorage.getItem('triplan_strava_connecting'));
  localStorage.removeItem('triplan_strava_connecting');
  if (isNaN(connectingAthlete)) return;

  // Exchange code for token via proxy
  exchangeStravaToken(code, connectingAthlete);
}

async function exchangeStravaToken(code, athleteIdx) {
  try {
    const resp = await fetch(`${STRAVA_PROXY_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!resp.ok) throw new Error('Token exchange failed');

    const data = await resp.json();
    const a = appData.athletes[athleteIdx];
    a.strava = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athleteId: data.athlete?.id,
      athleteName: data.athlete ? `${data.athlete.firstname} ${data.athlete.lastname}` : 'Connected'
    };
    saveData();
    renderProfileBanner();
    // Auto-sync
    viewingAthleteIndex = athleteIdx;
    await syncStravaActivities();
  } catch (err) {
    console.error('Strava token exchange error:', err);
    alert('Failed to connect to Strava. Please try again.');
  }
}

// ══════════════════════════════════════════
// TOKEN REFRESH
// ══════════════════════════════════════════
async function ensureValidToken(a) {
  if (!a.strava || !a.strava.refreshToken) return false;

  const now = Math.floor(Date.now() / 1000);
  if (a.strava.expiresAt > now + 60) return true; // Still valid

  try {
    const resp = await fetch(`${STRAVA_PROXY_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: a.strava.refreshToken })
    });

    if (!resp.ok) throw new Error('Refresh failed');

    const data = await resp.json();
    a.strava.accessToken = data.access_token;
    a.strava.refreshToken = data.refresh_token;
    a.strava.expiresAt = data.expires_at;
    saveData();
    return true;
  } catch (err) {
    console.error('Token refresh error:', err);
    return false;
  }
}

// ══════════════════════════════════════════
// SYNC ACTIVITIES
// ══════════════════════════════════════════
async function syncStravaActivities() {
  const a = athlete();
  if (!a.strava) return;

  const statusEl = document.getElementById('stravaSyncStatus');
  if (statusEl) statusEl.textContent = 'Syncing...';

  const valid = await ensureValidToken(a);
  if (!valid) {
    if (statusEl) statusEl.textContent = 'Token expired. Please reconnect Strava.';
    return;
  }

  try {
    // Fetch last 30 days of activities
    const after = Math.floor(Date.now() / 1000) - (30 * 86400);
    const resp = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, {
      headers: { 'Authorization': `Bearer ${a.strava.accessToken}` }
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);

    const activities = await resp.json();
    let imported = 0;

    activities.forEach(act => {
      const dk = act.start_date_local ? act.start_date_local.slice(0, 10) : null;
      if (!dk) return;

      let type = null;
      let qty = 0;

      if (act.type === 'Run' || act.type === 'TrailRun' || act.type === 'VirtualRun') {
        type = 'run';
        qty = parseFloat((act.distance / 1609.34).toFixed(2)); // meters to miles
      } else if (act.type === 'Ride' || act.type === 'VirtualRide' || act.type === 'GravelRide' || act.type === 'MountainBikeRide') {
        type = 'bike';
        qty = parseFloat((act.distance / 1609.34).toFixed(2));
      } else if (act.type === 'Swim') {
        type = 'swim';
        qty = Math.round(act.distance * 1.09361); // meters to yards
      } else {
        return; // Skip other activity types
      }

      if (!a.actuals[dk]) a.actuals[dk] = [];

      // Check for duplicate (same type, same qty on same day)
      const isDupe = a.actuals[dk].some(existing =>
        existing.type === type && Math.abs(existing.qty - qty) < 0.1
      );

      if (!isDupe) {
        a.actuals[dk].push({
          type,
          qty,
          notes: act.name || '',
          stravaId: act.id
        });
        imported++;
      }
    });

    saveData();
    if (statusEl) statusEl.textContent = `Synced! ${imported} new activities imported from last 30 days.`;
    render();
  } catch (err) {
    console.error('Strava sync error:', err);
    if (statusEl) statusEl.textContent = 'Sync failed. Check console for details.';
  }
}

function disconnectStrava() {
  if (!confirm('Disconnect Strava? Your synced activities will remain.')) return;
  const a = athlete();
  a.strava = null;
  saveData();
  openProfileView(); // Refresh modal
}
