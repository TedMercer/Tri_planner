/* ══════════════════════════════════════════
   TriPlan — Strava Integration (Firebase Edition)
   ══════════════════════════════════════════ */

const STRAVA_CLIENT_ID = '218965'; 
const STRAVA_PROXY_URL = 'https://strava-proxy.edwardmercer2001.workers.dev'; 
const STRAVA_REDIRECT_URI = window.location.origin + window.location.pathname;
const STRAVA_SCOPE = 'read,activity:read_all';


function isStravaConfigured() { return STRAVA_CLIENT_ID && STRAVA_PROXY_URL; }

function buildStravaProfileSection(a) {
  let html = '<div class="strava-section">';
  html += '<div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Strava Integration</div>';
  if (!isStravaConfigured()) {
    html += '<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">Strava integration needs configuration. See <code style="background:var(--surface-3);padding:2px 5px;border-radius:3px;font-size:11px;">js/strava.js</code>.</div>';
  } else if (a.strava && a.strava.accessToken) {
    html += '<button class="strava-btn connected" disabled>✓ Connected to Strava</button>';
    html += `<div class="strava-status">Synced as: ${escapeHtml(a.strava.athleteName || 'Unknown')}</div>`;
    if (hasEditAccess()) {
      html += '<button class="strava-sync-btn" onclick="syncStravaActivities()">↻ Sync Recent Activities</button>';
      html += ' <button class="strava-sync-btn" onclick="disconnectStrava()" style="color:var(--danger);margin-left:4px;">Disconnect</button>';
    }
    html += '<div id="stravaSyncStatus" style="font-size:11px;color:var(--text-dim);margin-top:6px;"></div>';
  } else if (hasEditAccess()) {
    html += '<button class="strava-btn" onclick="connectStrava()">🔗 Connect Strava</button>';
    html += '<div class="strava-status">Link your Strava account to auto-import actual activities.</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--text-dim);">No Strava account linked.</div>';
  }
  html += '</div>';
  return html;
}

function connectStrava() {
  if (!isStravaConfigured()) { alert('Strava not configured. See js/strava.js'); return; }
  localStorage.setItem('triplan_strava_connecting', viewingAthleteId);
  window.location.href = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}&response_type=code&scope=${STRAVA_SCOPE}`;
}

function handleStravaCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;
  window.history.replaceState({}, '', window.location.pathname);
  if (!isStravaConfigured()) return;
  const connectingId = localStorage.getItem('triplan_strava_connecting');
  localStorage.removeItem('triplan_strava_connecting');
  if (!connectingId) return;
  exchangeStravaToken(code, connectingId);
}

async function exchangeStravaToken(code, athleteId) {
  try {
    const resp = await fetch(`${STRAVA_PROXY_URL}/exchange`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ code })
    });
    if (!resp.ok) throw new Error('Token exchange failed');
    const data = await resp.json();
    const a = athleteById(athleteId);
    if (!a) return;
    a.strava = {
      accessToken: data.access_token, refreshToken: data.refresh_token,
      expiresAt: data.expires_at, athleteId: data.athlete?.id,
      athleteName: data.athlete ? `${data.athlete.firstname} ${data.athlete.lastname}` : 'Connected'
    };
    await saveAthlete(a);
    renderProfileBanner();
    viewingAthleteId = athleteId;
    await syncStravaActivities();
  } catch (err) { console.error('Strava token exchange error:', err); alert('Failed to connect Strava.'); }
}

async function ensureValidToken(a) {
  if (!a.strava || !a.strava.refreshToken) return false;
  if (a.strava.expiresAt > Math.floor(Date.now()/1000) + 60) return true;
  try {
    const resp = await fetch(`${STRAVA_PROXY_URL}/refresh`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ refresh_token: a.strava.refreshToken })
    });
    if (!resp.ok) throw new Error('Refresh failed');
    const data = await resp.json();
    a.strava.accessToken = data.access_token;
    a.strava.refreshToken = data.refresh_token;
    a.strava.expiresAt = data.expires_at;
    await saveAthlete(a);
    return true;
  } catch (err) { console.error('Token refresh error:', err); return false; }
}

async function syncStravaActivities() {
  const a = currentAthlete();
  if (!a || !a.strava) return;
  const statusEl = document.getElementById('stravaSyncStatus');
  if (statusEl) statusEl.textContent = 'Syncing...';
  const valid = await ensureValidToken(a);
  if (!valid) { if (statusEl) statusEl.textContent = 'Token expired. Please reconnect.'; return; }
  try {
    const after = Math.floor(Date.now()/1000) - (30 * 86400);
    const resp = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, {
      headers: {'Authorization': `Bearer ${a.strava.accessToken}`}
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const activities = await resp.json();
    let imported = 0;
    if (!a.actuals) a.actuals = {};
    activities.forEach(act => {
      const dk = act.start_date_local ? act.start_date_local.slice(0,10) : null;
      if (!dk) return;
      let type = null, qty = 0;
      if (['Run','TrailRun','VirtualRun'].includes(act.type)) { type = 'run'; qty = parseFloat((act.distance/1609.34).toFixed(2)); }
      else if (['Ride','VirtualRide','GravelRide','MountainBikeRide'].includes(act.type)) { type = 'bike'; qty = parseFloat((act.distance/1609.34).toFixed(2)); }
      else if (act.type === 'Swim') { type = 'swim'; qty = Math.round(act.distance * 1.09361); }
      else return;
      if (!a.actuals[dk]) a.actuals[dk] = [];
      const isDupe = a.actuals[dk].some(e => e.type === type && Math.abs(e.qty - qty) < 0.1);
      if (!isDupe) { a.actuals[dk].push({ type, qty, notes: act.name || '', stravaId: act.id }); imported++; }
    });
    await saveAthlete(a);
    if (statusEl) statusEl.textContent = `Synced! ${imported} new activities imported.`;
    render();
  } catch (err) { console.error('Strava sync error:', err); if (statusEl) statusEl.textContent = 'Sync failed.'; }
}

async function disconnectStrava() {
  if (!confirm('Disconnect Strava? Synced activities will remain.')) return;
  const a = currentAthlete(); a.strava = null;
  await saveAthlete(a);
  openProfileView();
}
