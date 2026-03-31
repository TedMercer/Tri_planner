/* ══════════════════════════════════════════
   TriPlan — App Logic
   ══════════════════════════════════════════ */

// ── Constants ──
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STORAGE_KEY = 'triplan_data_v3';
const ADMIN_HASH = simpleHash('14_MA_Street_DSon1923!!!');
const MAX_ATHLETES = 5;
const WEEKS_PER_LOAD = 8;

// ── State ──
let appData = loadData();
let currentAthleteIndex = 0;   // who logged in
let viewingAthleteIndex = 0;   // whose calendar is showing
let canEdit = false;
let viewStartWeekOffset = 0;
let weeksRendered = 0;
let selectedReturnerIndex = null;
let modalDateKey = null;
let selectedType = 'run';

// ══════════════════════════════════════════
// HASH (simple obfuscation — not crypto)
// ══════════════════════════════════════════
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ══════════════════════════════════════════
// DATA PERSISTENCE
// ══════════════════════════════════════════
function defaultData() {
  return {
    athletes: [
      {
        name: 'Teddy Mercer',
        birthday: '2001-06-06',
        passwordHash: simpleHash('default_change_me'),
        races: {
          a: { name: 'Jones Beach', date: '2026-09-26', distance: '70.3' },
          b: { name: 'Cohasset', date: '2026-06-28', distance: 'Sprint' },
          c: { name: 'Hopkinton Season Opener', date: '2026-05-17', distance: 'Sprint' }
        },
        activities: {},
        goals: {}
      }
    ]
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.athletes) return d;
    }
  } catch (e) { /* ignore */ }
  return defaultData();
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function athlete(idx) {
  return appData.athletes[idx !== undefined ? idx : viewingAthleteIndex];
}

// ══════════════════════════════════════════
// DATE HELPERS
// ══════════════════════════════════════════
function getThisSunday() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getSundayForOffset(offset) {
  const s = getThisSunday();
  s.setDate(s.getDate() + offset * 7);
  return s;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekKey(d) { return dateKey(d); }
function todayKey() { return dateKey(new Date()); }
function formatDate(d) { return `${MONTHS[d.getMonth()]} ${d.getDate()}`; }

function calcAge(birthday) {
  const bd = new Date(birthday + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

function formatRaceDate(ds) {
  if (!ds) return '';
  const d = new Date(ds + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function daysUntil(ds) {
  if (!ds) return null;
  const target = new Date(ds + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ══════════════════════════════════════════
// AUTH SCREENS
// ══════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('mainApp').classList.remove('active');
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');
}

function attemptAdminLogin() {
  const pass = document.getElementById('adminPassInput').value;
  if (simpleHash(pass) === ADMIN_HASH) {
    document.getElementById('adminPassInput').value = '';
    showScreen('screenUserChoice');
  } else {
    document.getElementById('adminError').textContent = 'Incorrect admin password.';
  }
}

function logout() {
  canEdit = false;
  showScreen('screenAdminLogin');
  document.getElementById('adminPassInput').value = '';
  setTimeout(() => document.getElementById('adminPassInput').focus(), 100);
}

// ── Returner ──
function showReturnerScreen() {
  selectedReturnerIndex = null;
  const list = document.getElementById('returnerUserList');
  list.innerHTML = '';

  if (appData.athletes.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px;">No profiles yet. Go back and create one.</p>';
    showScreen('screenReturner');
    return;
  }

  appData.athletes.forEach((a, i) => {
    const initials = a.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const age = a.birthday ? calcAge(a.birthday) : '';
    const aRace = a.races?.a?.name ? `A: ${a.races.a.name}` : '';
    const card = document.createElement('div');
    card.className = 'user-select-card';
    card.dataset.index = i;
    card.innerHTML = `
      <div class="user-avatar">${initials}</div>
      <div class="user-info">
        <div class="name">${escapeHtml(a.name)}</div>
        <div class="meta">${age ? 'Age ' + age : ''} ${aRace ? '· ' + aRace : ''}</div>
      </div>
    `;
    card.onclick = () => {
      document.querySelectorAll('.user-select-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedReturnerIndex = i;
    };
    list.appendChild(card);
  });

  showScreen('screenReturner');
}

function attemptUserLogin() {
  if (selectedReturnerIndex === null) {
    document.getElementById('returnerError').textContent = 'Select a profile first.';
    return;
  }
  const pass = document.getElementById('returnerPassInput').value;
  const a = appData.athletes[selectedReturnerIndex];
  if (simpleHash(pass) === a.passwordHash) {
    currentAthleteIndex = selectedReturnerIndex;
    viewingAthleteIndex = selectedReturnerIndex;
    canEdit = true;
    document.getElementById('returnerPassInput').value = '';
    launchApp();
  } else {
    document.getElementById('returnerError').textContent = 'Incorrect password for this profile.';
  }
}

function enterViewOnly() {
  if (selectedReturnerIndex === null) {
    document.getElementById('returnerError').textContent = 'Select a profile to view.';
    return;
  }
  currentAthleteIndex = selectedReturnerIndex;
  viewingAthleteIndex = selectedReturnerIndex;
  canEdit = false;
  document.getElementById('returnerPassInput').value = '';
  launchApp();
}

// ── New User ──
function showNewUser() {
  if (appData.athletes.length >= MAX_ATHLETES) {
    alert('Maximum of 5 athlete profiles reached. Remove one before adding another.');
    return;
  }
  showScreen('screenNewUser');
  document.getElementById('newName').focus();
}

function createNewUser() {
  const name = document.getElementById('newName').value.trim();
  const birthday = document.getElementById('newBirthday').value;
  const password = document.getElementById('newPassword').value;

  if (!name) { document.getElementById('newUserError').textContent = 'Name is required.'; return; }
  if (!password) { document.getElementById('newUserError').textContent = 'Password is required.'; return; }

  const profile = {
    name,
    birthday: birthday || null,
    passwordHash: simpleHash(password),
    races: {
      a: { name: document.getElementById('newARaceName').value.trim(), date: document.getElementById('newARaceDate').value, distance: document.getElementById('newARaceDist').value },
      b: { name: document.getElementById('newBRaceName').value.trim(), date: document.getElementById('newBRaceDate').value, distance: document.getElementById('newBRaceDist').value },
      c: { name: document.getElementById('newCRaceName').value.trim(), date: document.getElementById('newCRaceDate').value, distance: document.getElementById('newCRaceDist').value },
    },
    activities: {},
    goals: {}
  };

  appData.athletes.push(profile);
  saveData();

  currentAthleteIndex = appData.athletes.length - 1;
  viewingAthleteIndex = currentAthleteIndex;
  canEdit = true;

  // Clear form
  ['newName', 'newBirthday', 'newPassword', 'newARaceName', 'newARaceDate', 'newBRaceName', 'newBRaceDate', 'newCRaceName', 'newCRaceDate'].forEach(id => document.getElementById(id).value = '');
  ['newARaceDist', 'newBRaceDist', 'newCRaceDist'].forEach(id => document.getElementById(id).selectedIndex = 0);

  launchApp();
}

// ══════════════════════════════════════════
// LAUNCH / SWITCH
// ══════════════════════════════════════════
function launchApp() {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('mainApp').classList.add('active');
  viewStartWeekOffset = 0;
  buildAthleteTabs();
  renderProfileBanner();
  updateAccessBadge();
  render();
}

function switchUser() {
  canEdit = false;
  showScreen('screenUserChoice');
}

// ══════════════════════════════════════════
// ATHLETE TABS
// ══════════════════════════════════════════
function buildAthleteTabs() {
  const container = document.getElementById('athleteTabs');
  container.innerHTML = '';
  appData.athletes.forEach((a, i) => {
    const btn = document.createElement('button');
    btn.className = `athlete-tab${i === viewingAthleteIndex ? ' active' : ''}`;
    btn.textContent = a.name.split(' ')[0];
    btn.onclick = () => {
      viewingAthleteIndex = i;
      buildAthleteTabs();
      renderProfileBanner();
      updateAccessBadge();
      viewStartWeekOffset = 0;
      render();
    };
    container.appendChild(btn);
  });
}

function updateAccessBadge() {
  const badge = document.getElementById('accessBadge');
  const isOwner = canEdit && viewingAthleteIndex === currentAthleteIndex;
  badge.innerHTML = isOwner
    ? '<span class="edit-badge">Editing</span>'
    : '<span class="view-badge">View Only</span>';
  document.getElementById('appSubtitle').textContent = athlete().name;
}

function hasEditAccess() {
  return canEdit && viewingAthleteIndex === currentAthleteIndex;
}

// ══════════════════════════════════════════
// PROFILE BANNER
// ══════════════════════════════════════════
function renderProfileBanner() {
  const a = athlete();
  const initials = a.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const age = a.birthday ? calcAge(a.birthday) : null;

  let racesHtml = '';
  [['a', 'A'], ['b', 'B'], ['c', 'C']].forEach(([key, letter]) => {
    const r = a.races?.[key];
    if (r && r.name) {
      const du = daysUntil(r.date);
      const duStr = du !== null ? (du > 0 ? `${du}d away` : du === 0 ? 'Today!' : `${Math.abs(du)}d ago`) : '';
      racesHtml += `
        <div class="race-chip ${key}-race">
          <div class="race-letter">${letter}</div>
          <div class="race-text">
            <div class="race-name">${escapeHtml(r.name)}</div>
            <div class="race-meta">${r.distance || ''} · ${formatRaceDate(r.date)} ${duStr ? '· ' + duStr : ''}</div>
          </div>
        </div>
      `;
    }
  });

  document.getElementById('profileBanner').innerHTML = `
    <div class="profile-info">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-details">
        <h3>${escapeHtml(a.name)}</h3>
        <div class="profile-meta">${age !== null ? 'Age ' + age : ''} ${a.birthday ? '· Born ' + formatRaceDate(a.birthday) : ''}</div>
      </div>
    </div>
    <div class="profile-races">${racesHtml || '<span style="color:var(--text-dim);font-size:12px;">No races set</span>'}</div>
  `;
}

// ══════════════════════════════════════════
// PROFILE MODAL
// ══════════════════════════════════════════
function openProfileView() {
  const a = athlete();
  const age = a.birthday ? calcAge(a.birthday) : '—';
  let html = `
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Name</div>
      <div style="font-size:15px;font-weight:600;">${escapeHtml(a.name)}</div>
    </div>
    <div style="display:flex;gap:20px;margin-bottom:16px;">
      <div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Age</div>
        <div style="font-size:15px;font-weight:600;">${age}</div>
      </div>
      <div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Birthday</div>
        <div style="font-size:15px;font-weight:600;">${a.birthday ? formatRaceDate(a.birthday) : '—'}</div>
      </div>
    </div>
  `;

  [['a', 'A Race', 'run-primary'], ['b', 'B Race', 'bike-primary'], ['c', 'C Race', 'swim-primary']].forEach(([key, label, color]) => {
    const r = a.races?.[key];
    if (r && r.name) {
      const du = daysUntil(r.date);
      const duStr = du !== null ? (du > 0 ? `${du} days away` : du === 0 ? 'Race day!' : `${Math.abs(du)} days ago`) : '';
      html += `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--${color});margin-bottom:4px;">${label}</div>
          <div style="font-weight:600;">${escapeHtml(r.name)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${r.distance || ''} · ${formatRaceDate(r.date)} ${duStr ? '· ' + duStr : ''}</div>
        </div>
      `;
    }
  });

  document.getElementById('profileModalContent').innerHTML = html;
  document.getElementById('profileModal').classList.add('visible');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('visible');
}

// ══════════════════════════════════════════
// RENDER CALENDAR
// ══════════════════════════════════════════
function render() {
  weeksRendered = 0;
  document.getElementById('weeksContainer').innerHTML = '';
  loadMoreWeeks();
  updateViewLabel();
}

function loadMoreWeeks() {
  const container = document.getElementById('weeksContainer');
  for (let i = 0; i < WEEKS_PER_LOAD; i++) {
    const offset = viewStartWeekOffset + weeksRendered;
    container.appendChild(buildWeekBlock(offset));
    weeksRendered++;
  }
}

function buildWeekBlock(weekOffset) {
  const sunday = getSundayForOffset(weekOffset);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const wk = weekKey(sunday);

  const thisSunday = getThisSunday();
  const weekNum = Math.round((sunday - thisSunday) / (7 * 86400000));
  let weekLabel;
  if (weekNum === 0) weekLabel = 'This Week';
  else if (weekNum === 1) weekLabel = 'Next Week';
  else if (weekNum === -1) weekLabel = 'Last Week';
  else if (weekNum > 0) weekLabel = `+${weekNum} Weeks`;
  else weekLabel = `${weekNum} Weeks`;

  const block = document.createElement('div');
  block.className = 'week-block';
  block.id = `week-${wk}`;

  const goals = athlete().goals[wk] || {};
  const editing = hasEditAccess();

  block.innerHTML = `
    <div class="week-header">
      <div>
        <span class="week-label">${weekLabel}</span>
        <span class="week-dates">${formatDate(sunday)} – ${formatDate(saturday)}, ${saturday.getFullYear()}</span>
      </div>
      ${editing ? `<button class="week-goals-toggle" onclick="toggleGoals('${wk}')">🎯 Goals</button>` : ''}
    </div>
    ${editing ? `
    <div class="week-goals" id="goals-${wk}">
      <div class="goal-input-group">
        <label>🏃 Run:</label>
        <input type="number" step="0.1" min="0" value="${goals.run || ''}" onchange="setGoal('${wk}','run',this.value)" placeholder="—">
        <span class="unit">mi</span>
      </div>
      <div class="goal-input-group">
        <label>🚴 Bike:</label>
        <input type="number" step="0.1" min="0" value="${goals.bike || ''}" onchange="setGoal('${wk}','bike',this.value)" placeholder="—">
        <span class="unit">mi</span>
      </div>
      <div class="goal-input-group">
        <label>🏊 Swim:</label>
        <input type="number" step="1" min="0" value="${goals.swim || ''}" onchange="setGoal('${wk}','swim',this.value)" placeholder="—">
        <span class="unit">yd</span>
      </div>
    </div>` : ''}
    <div class="days-grid">${buildDays(sunday, editing)}</div>
    ${buildSummary(sunday, wk)}
  `;

  return block;
}

function buildDays(sunday, editing) {
  const tk = todayKey();
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dk = dateKey(d);
    const isToday = dk === tk;

    const activities = athlete().activities[dk] || [];
    let cardsHtml = '';
    activities.forEach((act, idx) => {
      const unitLabel = act.type === 'swim' ? 'yd' : 'mi';
      cardsHtml += `
        <div class="activity-card ${act.type}">
          ${editing ? `<button class="remove-activity" onclick="removeActivity('${dk}',${idx})" title="Remove">×</button>` : ''}
          <div class="activity-type">${act.type}</div>
          <div class="activity-qty">${act.qty}<span class="unit-label"> ${unitLabel}</span></div>
          ${act.notes ? `<div class="activity-notes">${escapeHtml(act.notes)}</div>` : ''}
        </div>
      `;
    });

    html += `
      <div class="day-column">
        <div class="day-header ${isToday ? 'today' : ''}">
          ${DAYS[i]}
          <span class="day-date">${d.getDate()}</span>
        </div>
        <div class="day-body">
          ${cardsHtml}
          <button class="add-activity-btn ${editing ? '' : 'disabled'}" onclick="${editing ? `openModal('${dk}')` : ''}" title="${editing ? 'Add activity' : 'View only'}">+</button>
        </div>
      </div>
    `;
  }
  return html;
}

function buildSummary(sunday, wk) {
  let runTotal = 0, bikeTotal = 0, swimTotal = 0, sessionCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dk = dateKey(d);
    const acts = athlete().activities[dk] || [];
    sessionCount += acts.length;
    acts.forEach(a => {
      if (a.type === 'run') runTotal += parseFloat(a.qty) || 0;
      else if (a.type === 'bike') bikeTotal += parseFloat(a.qty) || 0;
      else if (a.type === 'swim') swimTotal += parseFloat(a.qty) || 0;
    });
  }

  const goals = athlete().goals[wk] || {};
  const goalHtml = (total, goal, unit) => {
    if (!goal) return '';
    const g = parseFloat(goal);
    const met = total >= g;
    return `<div class="stat-goal ${met ? 'met' : 'unmet'}">/ ${g} ${unit} ${met ? '✓' : ''}</div>`;
  };

  return `
    <div class="week-summary">
      <div class="summary-stat run">
        <div class="stat-label">Run</div>
        <div class="stat-value">${runTotal.toFixed(1)} <span style="font-size:10px;color:var(--text-muted)">mi</span></div>
        ${goalHtml(runTotal, goals.run, 'mi')}
      </div>
      <div class="summary-stat bike">
        <div class="stat-label">Bike</div>
        <div class="stat-value">${bikeTotal.toFixed(1)} <span style="font-size:10px;color:var(--text-muted)">mi</span></div>
        ${goalHtml(bikeTotal, goals.bike, 'mi')}
      </div>
      <div class="summary-stat swim">
        <div class="stat-label">Swim</div>
        <div class="stat-value">${swimTotal.toFixed(0)} <span style="font-size:10px;color:var(--text-muted)">yd</span></div>
        ${goalHtml(swimTotal, goals.swim, 'yd')}
      </div>
      <div class="summary-stat total">
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${sessionCount}</div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
// ACTIVITY MODAL
// ══════════════════════════════════════════
function openModal(dk) {
  if (!hasEditAccess()) return;
  modalDateKey = dk;
  selectedType = 'run';
  updateTypeButtons();
  document.getElementById('activityQty').value = '';
  document.getElementById('activityNotes').value = '';
  const d = new Date(dk + 'T00:00:00');
  document.getElementById('modalTitle').textContent = `Add Activity — ${DAYS[d.getDay()]} ${formatDate(d)}`;
  document.getElementById('modalOverlay').classList.add('visible');
  updateQtyLabel();
  setTimeout(() => document.getElementById('activityQty').focus(), 100);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('visible');
}

function selectType(type) {
  selectedType = type;
  updateTypeButtons();
  updateQtyLabel();
}

function updateTypeButtons() {
  document.querySelectorAll('.type-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.type === selectedType));
}

function updateQtyLabel() {
  document.getElementById('qtyLabel').textContent = selectedType === 'swim' ? 'Distance (yards)' : 'Distance (miles)';
}

function saveActivity() {
  const qty = parseFloat(document.getElementById('activityQty').value);
  const notes = document.getElementById('activityNotes').value.trim();

  if (!qty || qty <= 0) {
    document.getElementById('activityQty').style.borderColor = 'var(--danger)';
    setTimeout(() => document.getElementById('activityQty').style.borderColor = '', 1500);
    return;
  }

  const a = athlete();
  if (!a.activities[modalDateKey]) a.activities[modalDateKey] = [];

  a.activities[modalDateKey].push({
    type: selectedType,
    qty: selectedType === 'swim' ? Math.round(qty) : parseFloat(qty.toFixed(2)),
    notes
  });

  saveData();
  closeModal();
  render();
}

function removeActivity(dk, idx) {
  if (!hasEditAccess()) return;
  const a = athlete();
  if (a.activities[dk]) {
    a.activities[dk].splice(idx, 1);
    if (a.activities[dk].length === 0) delete a.activities[dk];
    saveData();
    render();
  }
}

// ══════════════════════════════════════════
// GOALS
// ══════════════════════════════════════════
function toggleGoals(wk) {
  const el = document.getElementById(`goals-${wk}`);
  if (el) el.classList.toggle('visible');
}

function setGoal(wk, type, value) {
  if (!hasEditAccess()) return;
  const a = athlete();
  if (!a.goals[wk]) a.goals[wk] = {};
  const v = parseFloat(value);
  if (v > 0) a.goals[wk][type] = v;
  else delete a.goals[wk][type];
  saveData();
  render();
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function shiftView(weeks) {
  viewStartWeekOffset += weeks;
  render();
}

function jumpToToday() {
  viewStartWeekOffset = 0;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateViewLabel() {
  const start = getSundayForOffset(viewStartWeekOffset);
  const end = getSundayForOffset(viewStartWeekOffset + weeksRendered - 1);
  end.setDate(end.getDate() + 6);
  document.getElementById('currentView').textContent = `${formatDate(start)} — ${formatDate(end)}, ${end.getFullYear()}`;
}

// ══════════════════════════════════════════
// EXPORT / IMPORT
// ══════════════════════════════════════════
function exportData() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `triplan_backup_${dateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  document.getElementById('importFile').click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.athletes && Array.isArray(data.athletes)) {
        appData = data;
        saveData();
        viewingAthleteIndex = 0;
        currentAthleteIndex = 0;
        buildAthleteTabs();
        renderProfileBanner();
        updateAccessBadge();
        render();
      } else {
        alert('Invalid data format.');
      }
    } catch (err) {
      alert('Could not parse file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════

// Admin login enter key
document.getElementById('adminPassInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') attemptAdminLogin();
});

// Returner password enter key
document.getElementById('returnerPassInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') attemptUserLogin();
});

// Returner button
document.getElementById('btnReturner').addEventListener('click', showReturnerScreen);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Modal open
  if (document.getElementById('modalOverlay').classList.contains('visible')) {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveActivity(); }
    return;
  }
  // Profile modal
  if (document.getElementById('profileModal').classList.contains('visible')) {
    if (e.key === 'Escape') closeProfileModal();
    return;
  }
  // Only in main app
  if (!document.getElementById('mainApp').classList.contains('active')) return;
  if (e.key === 'ArrowLeft') shiftView(-1);
  if (e.key === 'ArrowRight') shiftView(1);
  if (e.key === 't' || e.key === 'T') jumpToToday();
});

// Close modals on overlay click
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target.id === 'modalOverlay') closeModal();
});
document.getElementById('profileModal').addEventListener('click', e => {
  if (e.target.id === 'profileModal') closeProfileModal();
});
