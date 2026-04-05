/* ══════════════════════════════════════════
   TriPlan — Core App Logic (Firebase Edition)
   ══════════════════════════════════════════ */

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ADMIN_HASH = simpleHash('Dson1923');
const MAX_ATHLETES = 5;
const WEEKS_PER_LOAD = 8;

// ── State ──
let athletes = []; // Array of athlete objects from Firestore
let currentAthleteId = null;  // doc ID of logged-in athlete
let viewingAthleteId = null;  // doc ID of athlete being viewed
let canEdit = false;
let viewStartWeekOffset = 0;
let weeksRendered = 0;
let selectedReturnerId = null;
let modalDateKey = null;
let selectedType = 'run';
let currentDataMode = 'planned';
let currentMainView = 'calendar';
let unsubscribeListener = null;

// ══════════════════════════════════════════
// HASH
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
// FIREBASE HELPERS
// ══════════════════════════════════════════
function athletesCol() { return window.FB.collection(window.FB.db, 'athletes'); }
function athleteDoc(id) { return window.FB.doc(window.FB.db, 'athletes', id); }

async function loadAllAthletes() {
  const snap = await window.FB.getDocs(athletesCol());
  athletes = [];
  snap.forEach(d => { athletes.push({ id: d.id, ...d.data() }); });
  // Sort by creation order (name as fallback)
  athletes.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function currentAthlete() {
  return athletes.find(a => a.id === viewingAthleteId) || athletes[0];
}

function athleteById(id) {
  return athletes.find(a => a.id === id);
}

async function saveAthlete(a) {
  const { id, ...data } = a;
  await window.FB.setDoc(athleteDoc(id), data, { merge: true });
}

// Listen for real-time changes to the viewed athlete
function listenToAthlete(id) {
  if (unsubscribeListener) unsubscribeListener();
  unsubscribeListener = window.FB.onSnapshot(athleteDoc(id), (snap) => {
    if (!snap.exists()) return;
    const idx = athletes.findIndex(a => a.id === id);
    if (idx >= 0) {
      athletes[idx] = { id: snap.id, ...snap.data() };
    }
    // Re-render if we're viewing this athlete
    if (viewingAthleteId === id && document.getElementById('mainApp').classList.contains('active')) {
      renderProfileBanner();
      render();
      if (currentMainView === 'analytics') renderAnalytics();
    }
  });
}

// ══════════════════════════════════════════
// MIGRATION FROM LOCALSTORAGE
// ══════════════════════════════════════════
async function migrateFromLocalStorage() {
  // Check if we have old data and Firestore is empty
  const oldKeys = ['triplan_data_v4', 'triplan_data_v3'];
  let oldData = null;
  for (const key of oldKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { oldData = JSON.parse(raw); break; }
    } catch(e) {}
  }
  if (!oldData || !oldData.athletes || oldData.athletes.length === 0) return;

  // Only migrate if Firestore is empty
  const snap = await window.FB.getDocs(athletesCol());
  if (snap.size > 0) return;

  console.log('Migrating localStorage data to Firestore...');
  for (const a of oldData.athletes) {
    if (!a.actuals) a.actuals = {};
    if (!a.strava) a.strava = null;
    const docRef = window.FB.doc(athletesCol());
    await window.FB.setDoc(docRef, {
      name: a.name,
      birthday: a.birthday || null,
      passwordHash: a.passwordHash,
      races: a.races || {},
      activities: a.activities || {},
      actuals: a.actuals || {},
      goals: a.goals || {},
      strava: a.strava || null,
      createdAt: Date.now()
    });
  }
  console.log('Migration complete.');
  // Clear old data flag
  localStorage.setItem('triplan_migrated', 'true');
}

// ══════════════════════════════════════════
// SEED DEFAULT DATA
// ══════════════════════════════════════════
async function seedDefaultAthlete() {
  const snap = await window.FB.getDocs(athletesCol());
  if (snap.size > 0) return;

  const docRef = window.FB.doc(athletesCol());
  await window.FB.setDoc(docRef, {
    name: 'Teddy Mercer',
    birthday: '2001-06-06',
    passwordHash: simpleHash('default_change_me'),
    races: {
      a: { name: 'Jones Beach', date: '2026-09-26', distance: '70.3' },
      b: { name: 'Cohasset', date: '2026-06-28', distance: 'Sprint' },
      c: { name: 'Hopkinton Season Opener', date: '2026-05-17', distance: 'Sprint' }
    },
    activities: {},
    actuals: {},
    goals: {},
    strava: null,
    createdAt: Date.now()
  });
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
function getSundayForOffset(offset) { const s = getThisSunday(); s.setDate(s.getDate() + offset * 7); return s; }
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function weekKey(d) { return dateKey(d); }
function todayKey() { return dateKey(new Date()); }
function formatDate(d) { return `${MONTHS[d.getMonth()]} ${d.getDate()}`; }
function calcAge(birthday) {
  const bd = new Date(birthday + 'T00:00:00'); const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() - bd.getMonth() < 0 || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return age;
}
function formatRaceDate(ds) { if (!ds) return ''; const d = new Date(ds + 'T00:00:00'); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function daysUntil(ds) { if (!ds) return null; const t = new Date(ds + 'T00:00:00'); const n = new Date(); n.setHours(0,0,0,0); return Math.ceil((t - n) / 86400000); }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ══════════════════════════════════════════
// GET ACTIVITIES
// ══════════════════════════════════════════
function getActivities(a) {
  a = a || currentAthlete();
  if (!a) return {};
  return currentDataMode === 'actual' ? (a.actuals || {}) : (a.activities || {});
}

// ══════════════════════════════════════════
// VIEW SWITCHING
// ══════════════════════════════════════════
function switchMainView(view) {
  currentMainView = view;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.getElementById('calendarView').style.display = view === 'calendar' ? '' : 'none';
  document.getElementById('analyticsView').style.display = view === 'analytics' ? '' : 'none';
  if (view === 'analytics') { populateCompareDropdown(); renderAnalytics(); }
}
function switchDataMode(mode) {
  currentDataMode = mode;
  document.querySelectorAll('.data-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  render();
  if (currentMainView === 'analytics') renderAnalytics();
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
  if (unsubscribeListener) unsubscribeListener();
  showScreen('screenAdminLogin');
  document.getElementById('adminPassInput').value = '';
  setTimeout(() => document.getElementById('adminPassInput').focus(), 100);
}

async function showReturnerScreen() {
  selectedReturnerId = null;
  await loadAllAthletes();
  const list = document.getElementById('returnerUserList');
  list.innerHTML = '';
  if (athletes.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px;">No profiles yet.</p>';
    showScreen('screenReturner'); return;
  }
  athletes.forEach(a => {
    const initials = a.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const age = a.birthday ? calcAge(a.birthday) : '';
    const aRace = a.races?.a?.name ? `A: ${a.races.a.name}` : '';
    const card = document.createElement('div');
    card.className = 'user-select-card';
    card.innerHTML = `<div class="user-avatar">${initials}</div><div class="user-info"><div class="name">${escapeHtml(a.name)}</div><div class="meta">${age ? 'Age '+age : ''} ${aRace ? '· '+aRace : ''}</div></div>`;
    card.onclick = () => {
      document.querySelectorAll('.user-select-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedReturnerId = a.id;
    };
    list.appendChild(card);
  });
  showScreen('screenReturner');
}

function attemptUserLogin() {
  if (!selectedReturnerId) { document.getElementById('returnerError').textContent = 'Select a profile first.'; return; }
  const pass = document.getElementById('returnerPassInput').value;
  const a = athleteById(selectedReturnerId);
  if (simpleHash(pass) === a.passwordHash) {
    currentAthleteId = selectedReturnerId;
    viewingAthleteId = selectedReturnerId;
    canEdit = true;
    document.getElementById('returnerPassInput').value = '';
    launchApp();
  } else {
    document.getElementById('returnerError').textContent = 'Incorrect password for this profile.';
  }
}

function enterViewOnly() {
  if (!selectedReturnerId) { document.getElementById('returnerError').textContent = 'Select a profile to view.'; return; }
  currentAthleteId = selectedReturnerId;
  viewingAthleteId = selectedReturnerId;
  canEdit = false;
  document.getElementById('returnerPassInput').value = '';
  launchApp();
}

function showNewUser() {
  if (athletes.length >= MAX_ATHLETES) { alert('Maximum of 5 athlete profiles reached.'); return; }
  showScreen('screenNewUser');
  document.getElementById('newName').focus();
}

async function createNewUser() {
  const name = document.getElementById('newName').value.trim();
  const birthday = document.getElementById('newBirthday').value;
  const password = document.getElementById('newPassword').value;
  if (!name) { document.getElementById('newUserError').textContent = 'Name is required.'; return; }
  if (!password) { document.getElementById('newUserError').textContent = 'Password is required.'; return; }

  const docRef = window.FB.doc(athletesCol());
  const data = {
    name, birthday: birthday || null, passwordHash: simpleHash(password),
    races: {
      a: { name: document.getElementById('newARaceName').value.trim(), date: document.getElementById('newARaceDate').value, distance: document.getElementById('newARaceDist').value },
      b: { name: document.getElementById('newBRaceName').value.trim(), date: document.getElementById('newBRaceDate').value, distance: document.getElementById('newBRaceDist').value },
      c: { name: document.getElementById('newCRaceName').value.trim(), date: document.getElementById('newCRaceDate').value, distance: document.getElementById('newCRaceDist').value },
    },
    activities: {}, actuals: {}, goals: {}, strava: null, createdAt: Date.now()
  };
  await window.FB.setDoc(docRef, data);
  await loadAllAthletes();

  currentAthleteId = docRef.id;
  viewingAthleteId = docRef.id;
  canEdit = true;

  ['newName','newBirthday','newPassword','newARaceName','newARaceDate','newBRaceName','newBRaceDate','newCRaceName','newCRaceDate'].forEach(id => document.getElementById(id).value = '');
  ['newARaceDist','newBRaceDist','newCRaceDist'].forEach(id => document.getElementById(id).selectedIndex = 0);
  launchApp();
}

// ══════════════════════════════════════════
// LAUNCH
// ══════════════════════════════════════════
function launchApp() {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('mainApp').classList.add('active');
  viewStartWeekOffset = 0; currentDataMode = 'planned'; currentMainView = 'calendar';
  switchMainView('calendar'); switchDataMode('planned');
  buildAthleteTabs(); renderProfileBanner(); updateAccessBadge(); render();
  listenToAthlete(viewingAthleteId);
  handleStravaCallback();
}

function switchUser() { canEdit = false; if (unsubscribeListener) unsubscribeListener(); showScreen('screenUserChoice'); }

// ══════════════════════════════════════════
// ATHLETE TABS
// ══════════════════════════════════════════
function buildAthleteTabs() {
  const container = document.getElementById('athleteTabs');
  container.innerHTML = '';
  athletes.forEach(a => {
    const btn = document.createElement('button');
    btn.className = `athlete-tab${a.id === viewingAthleteId ? ' active' : ''}`;
    btn.textContent = a.name.split(' ')[0];
    btn.onclick = () => {
      viewingAthleteId = a.id;
      buildAthleteTabs(); renderProfileBanner(); updateAccessBadge();
      viewStartWeekOffset = 0; render();
      listenToAthlete(a.id);
      if (currentMainView === 'analytics') { populateCompareDropdown(); renderAnalytics(); }
    };
    container.appendChild(btn);
  });
}

function updateAccessBadge() {
  const badge = document.getElementById('accessBadge');
  const isOwner = canEdit && viewingAthleteId === currentAthleteId;
  badge.innerHTML = isOwner ? '<span class="edit-badge">Editing</span>' : '<span class="view-badge">View Only</span>';
  const a = currentAthlete();
  document.getElementById('appSubtitle').textContent = a ? a.name : '';
}

function hasEditAccess() { return canEdit && viewingAthleteId === currentAthleteId; }

// ══════════════════════════════════════════
// PROFILE BANNER
// ══════════════════════════════════════════
function renderProfileBanner() {
  const a = currentAthlete(); if (!a) return;
  const initials = a.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  const age = a.birthday ? calcAge(a.birthday) : null;
  let racesHtml = '';
  [['a','A'],['b','B'],['c','C']].forEach(([key, letter]) => {
    const r = a.races?.[key]; if (r && r.name) {
      const du = daysUntil(r.date);
      const duStr = du !== null ? (du > 0 ? `${du}d away` : du === 0 ? 'Today!' : `${Math.abs(du)}d ago`) : '';
      racesHtml += `<div class="race-chip ${key}-race"><div class="race-letter">${letter}</div><div class="race-text"><div class="race-name">${escapeHtml(r.name)}</div><div class="race-meta">${r.distance||''} · ${formatRaceDate(r.date)} ${duStr?'· '+duStr:''}</div></div></div>`;
    }
  });
  document.getElementById('profileBanner').innerHTML = `<div class="profile-info"><div class="profile-avatar">${initials}</div><div class="profile-details"><h3>${escapeHtml(a.name)}</h3><div class="profile-meta">${age!==null?'Age '+age:''} ${a.birthday?'· Born '+formatRaceDate(a.birthday):''}</div></div></div><div class="profile-races">${racesHtml||'<span style="color:var(--text-dim);font-size:12px;">No races set</span>'}</div>`;
}

// ══════════════════════════════════════════
// PROFILE MODAL
// ══════════════════════════════════════════
function openProfileView() {
  const a = currentAthlete(); if (!a) return;
  const age = a.birthday ? calcAge(a.birthday) : '—';
  let html = `<div style="margin-bottom:14px;"><div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Name</div><div style="font-size:15px;font-weight:600;">${escapeHtml(a.name)}</div></div>
    <div style="display:flex;gap:20px;margin-bottom:16px;"><div><div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Age</div><div style="font-size:15px;font-weight:600;">${age}</div></div><div><div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Birthday</div><div style="font-size:15px;font-weight:600;">${a.birthday?formatRaceDate(a.birthday):'—'}</div></div></div>`;

  [['a','A Race','run-primary'],['b','B Race','bike-primary'],['c','C Race','swim-primary']].forEach(([key,label,color]) => {
    const r = a.races?.[key]; if (r && r.name) {
      const du = daysUntil(r.date); const duStr = du!==null?(du>0?`${du} days away`:du===0?'Race day!':`${Math.abs(du)} days ago`):'';
      html += `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--${color});margin-bottom:4px;">${label}</div><div style="font-weight:600;">${escapeHtml(r.name)}</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${r.distance||''} · ${formatRaceDate(r.date)} ${duStr?'· '+duStr:''}</div></div>`;
    }
  });

  // Strava
  if (typeof buildStravaProfileSection === 'function') html += buildStravaProfileSection(a);

  // Change password
  if (hasEditAccess()) {
    html += `<div style="border-top:1px solid var(--border);margin-top:16px;padding-top:16px;"><div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Change Password</div><div><div style="margin-bottom:8px;"><label style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;display:block;">Confirm Your Birthday</label><input type="date" id="cpBirthday" style="width:100%;background:var(--surface-3);border:1px solid var(--border);border-radius:7px;padding:8px 10px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;"></div><div style="margin-bottom:8px;"><input type="password" id="cpNew" placeholder="New password" style="width:100%;background:var(--surface-3);border:1px solid var(--border);border-radius:7px;padding:8px 10px;color:var(--text);font-family:'Space Mono',monospace;font-size:13px;letter-spacing:1px;"></div><div style="margin-bottom:8px;"><input type="password" id="cpConfirm" placeholder="Confirm new password" style="width:100%;background:var(--surface-3);border:1px solid var(--border);border-radius:7px;padding:8px 10px;color:var(--text);font-family:'Space Mono',monospace;font-size:13px;letter-spacing:1px;"></div><div id="cpError" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:6px;"></div><div id="cpSuccess" style="color:var(--success);font-size:12px;min-height:18px;margin-bottom:6px;"></div><button onclick="changePassword()" style="background:var(--accent);border:1px solid var(--accent);color:#fff;padding:8px 16px;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Update Password</button></div></div>`;
  }
  document.getElementById('profileModalContent').innerHTML = html;
  document.getElementById('profileModal').classList.add('visible');
}

async function changePassword() {
  const birthday = document.getElementById('cpBirthday').value;
  const newPw = document.getElementById('cpNew').value;
  const confirm = document.getElementById('cpConfirm').value;
  const err = document.getElementById('cpError'); const suc = document.getElementById('cpSuccess');
  err.textContent = ''; suc.textContent = '';
  const a = currentAthlete();
  if (!birthday) { err.textContent = 'Please enter your birthday.'; return; }
  if (birthday !== a.birthday) { err.textContent = 'Birthday does not match profile.'; return; }
  if (!newPw) { err.textContent = 'New password cannot be empty.'; return; }
  if (newPw !== confirm) { err.textContent = 'New passwords do not match.'; return; }
  a.passwordHash = simpleHash(newPw);
  await saveAthlete(a);
  document.getElementById('cpBirthday').value = '';
  document.getElementById('cpNew').value = '';
  document.getElementById('cpConfirm').value = '';
  suc.textContent = 'Password updated successfully.';
}

function closeProfileModal() { document.getElementById('profileModal').classList.remove('visible'); }

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
    container.appendChild(buildWeekBlock(viewStartWeekOffset + weeksRendered));
    weeksRendered++;
  }
}

function buildWeekBlock(weekOffset) {
  const sunday = getSundayForOffset(weekOffset);
  const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
  const wk = weekKey(sunday);
  const thisSunday = getThisSunday();
  const weekNum = Math.round((sunday - thisSunday) / (7 * 86400000));
  let weekLabel;
  if (weekNum === 0) weekLabel = 'This Week'; else if (weekNum === 1) weekLabel = 'Next Week';
  else if (weekNum === -1) weekLabel = 'Last Week'; else if (weekNum > 0) weekLabel = `+${weekNum} Weeks`;
  else weekLabel = `${weekNum} Weeks`;

  const block = document.createElement('div');
  block.className = 'week-block';
  const a = currentAthlete(); if (!a) return block;
  const goals = (a.goals || {})[wk] || {};
  const editing = hasEditAccess() && currentDataMode === 'planned';

  block.innerHTML = `<div class="week-header"><div><span class="week-label">${weekLabel}</span> <span class="week-dates">${formatDate(sunday)} – ${formatDate(saturday)}, ${saturday.getFullYear()}</span></div>${editing ? `<button class="week-goals-toggle" onclick="toggleGoals('${wk}')">🎯 Goals</button>` : ''}</div>
    ${editing ? `<div class="week-goals" id="goals-${wk}"><div class="goal-input-group"><label>🏃 Run:</label><input type="number" step="0.1" min="0" value="${goals.run||''}" onchange="setGoal('${wk}','run',this.value)" placeholder="—"><span class="unit">mi</span></div><div class="goal-input-group"><label>🚴 Bike:</label><input type="number" step="0.1" min="0" value="${goals.bike||''}" onchange="setGoal('${wk}','bike',this.value)" placeholder="—"><span class="unit">mi</span></div><div class="goal-input-group"><label>🏊 Swim:</label><input type="number" step="1" min="0" value="${goals.swim||''}" onchange="setGoal('${wk}','swim',this.value)" placeholder="—"><span class="unit">yd</span></div></div>` : ''}
    <div class="days-grid">${buildDays(sunday, editing)}</div>${buildSummary(sunday, wk)}`;
  return block;
}

function buildDays(sunday, editing) {
  const tk = todayKey(); const acts = getActivities(); const isActual = currentDataMode === 'actual';
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i); const dk = dateKey(d);
    const dayActs = acts[dk] || [];
    let cards = '';
    dayActs.forEach((act, idx) => {
      const u = act.type === 'swim' ? 'yd' : 'mi';
      cards += `<div class="activity-card ${act.type} ${isActual?'actual-data':''}">${editing?`<button class="remove-activity" onclick="removeActivity('${dk}',${idx})">×</button>`:''}<div class="activity-type">${act.type}</div><div class="activity-qty">${act.qty}<span class="unit-label"> ${u}</span></div>${act.notes?`<div class="activity-notes">${escapeHtml(act.notes)}</div>`:''}</div>`;
    });
    html += `<div class="day-column"><div class="day-header ${dk===tk?'today':''}">${DAYS[i]}<span class="day-date">${d.getDate()}</span></div><div class="day-body">${cards}<button class="add-activity-btn ${editing?'':'disabled'}" onclick="${editing?`openModal('${dk}')`:''}" >+</button></div></div>`;
  }
  return html;
}

function buildSummary(sunday, wk) {
  let rT=0,bT=0,sT=0,sess=0; const acts = getActivities();
  for (let i=0;i<7;i++) { const d=new Date(sunday); d.setDate(sunday.getDate()+i); const da=acts[dateKey(d)]||[];
    sess+=da.length; da.forEach(a=>{if(a.type==='run')rT+=parseFloat(a.qty)||0;else if(a.type==='bike')bT+=parseFloat(a.qty)||0;else if(a.type==='swim')sT+=parseFloat(a.qty)||0;}); }
  const a = currentAthlete(); const goals = a ? ((a.goals||{})[wk]||{}) : {};
  const gh=(t,g,u)=>{if(!g)return'';const v=parseFloat(g);return`<div class="stat-goal ${t>=v?'met':'unmet'}">/ ${v} ${u} ${t>=v?'✓':''}</div>`;};
  return `<div class="week-summary"><div class="summary-stat run"><div class="stat-label">Run</div><div class="stat-value">${rT.toFixed(1)} <span style="font-size:10px;color:var(--text-muted)">mi</span></div>${gh(rT,goals.run,'mi')}</div><div class="summary-stat bike"><div class="stat-label">Bike</div><div class="stat-value">${bT.toFixed(1)} <span style="font-size:10px;color:var(--text-muted)">mi</span></div>${gh(bT,goals.bike,'mi')}</div><div class="summary-stat swim"><div class="stat-label">Swim</div><div class="stat-value">${sT.toFixed(0)} <span style="font-size:10px;color:var(--text-muted)">yd</span></div>${gh(sT,goals.swim,'yd')}</div><div class="summary-stat total"><div class="stat-label">Sessions</div><div class="stat-value">${sess}</div></div></div>`;
}

// ══════════════════════════════════════════
// ACTIVITY MODAL
// ══════════════════════════════════════════
function openModal(dk) {
  if (!hasEditAccess()) return;
  modalDateKey = dk; selectedType = 'run'; updateTypeButtons();
  document.getElementById('activityQty').value = '';
  document.getElementById('activityNotes').value = '';
  const d = new Date(dk + 'T00:00:00');
  document.getElementById('modalTitle').textContent = `Add ${currentDataMode==='actual'?'Actual':'Planned'} Activity — ${DAYS[d.getDay()]} ${formatDate(d)}`;
  document.getElementById('modalOverlay').classList.add('visible');
  updateQtyLabel();
  setTimeout(() => document.getElementById('activityQty').focus(), 100);
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('visible'); }
function selectType(type) { selectedType = type; updateTypeButtons(); updateQtyLabel(); }
function updateTypeButtons() { document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === selectedType)); }
function updateQtyLabel() { document.getElementById('qtyLabel').textContent = selectedType === 'swim' ? 'Distance (yards)' : 'Distance (miles)'; }

async function saveActivity() {
  const qty = parseFloat(document.getElementById('activityQty').value);
  const notes = document.getElementById('activityNotes').value.trim();
  if (!qty || qty <= 0) { document.getElementById('activityQty').style.borderColor = 'var(--danger)'; setTimeout(()=>document.getElementById('activityQty').style.borderColor='',1500); return; }
  const a = currentAthlete();
  const field = currentDataMode === 'actual' ? 'actuals' : 'activities';
  if (!a[field]) a[field] = {};
  if (!a[field][modalDateKey]) a[field][modalDateKey] = [];
  a[field][modalDateKey].push({ type: selectedType, qty: selectedType === 'swim' ? Math.round(qty) : parseFloat(qty.toFixed(2)), notes });
  await saveAthlete(a);
  closeModal(); render();
}

async function removeActivity(dk, idx) {
  if (!hasEditAccess()) return;
  const a = currentAthlete();
  const field = currentDataMode === 'actual' ? 'actuals' : 'activities';
  if (a[field] && a[field][dk]) {
    a[field][dk].splice(idx, 1);
    if (a[field][dk].length === 0) delete a[field][dk];
    await saveAthlete(a);
    render();
  }
}

// ══════════════════════════════════════════
// GOALS
// ══════════════════════════════════════════
function toggleGoals(wk) { const el = document.getElementById(`goals-${wk}`); if (el) el.classList.toggle('visible'); }
async function setGoal(wk, type, value) {
  if (!hasEditAccess()) return;
  const a = currentAthlete();
  if (!a.goals) a.goals = {};
  if (!a.goals[wk]) a.goals[wk] = {};
  const v = parseFloat(value);
  if (v > 0) a.goals[wk][type] = v; else delete a.goals[wk][type];
  await saveAthlete(a);
  render();
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function shiftView(weeks) { viewStartWeekOffset += weeks; render(); }
function jumpToToday() { viewStartWeekOffset = 0; render(); window.scrollTo({top:0,behavior:'smooth'}); }
function updateViewLabel() {
  const s = getSundayForOffset(viewStartWeekOffset);
  const e = getSundayForOffset(viewStartWeekOffset+weeksRendered-1); e.setDate(e.getDate()+6);
  document.getElementById('currentView').textContent = `${formatDate(s)} — ${formatDate(e)}, ${e.getFullYear()}`;
}

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════
function exportData() {
  const data = { athletes: athletes.map(a => { const {id, ...rest} = a; return rest; }) };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a'); el.href = url; el.download = `triplan_backup_${dateKey(new Date())}.json`; el.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════
document.getElementById('adminPassInput').addEventListener('keydown', e => { if (e.key === 'Enter') attemptAdminLogin(); });
document.getElementById('returnerPassInput').addEventListener('keydown', e => { if (e.key === 'Enter') attemptUserLogin(); });
document.getElementById('btnReturner').addEventListener('click', showReturnerScreen);

document.addEventListener('keydown', e => {
  if (document.getElementById('modalOverlay').classList.contains('visible')) { if (e.key==='Escape') closeModal(); if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); saveActivity(); } return; }
  if (document.getElementById('profileModal').classList.contains('visible')) { if (e.key==='Escape') closeProfileModal(); return; }
  if (!document.getElementById('mainApp').classList.contains('active')) return;
  if (e.key==='ArrowLeft') shiftView(-1); if (e.key==='ArrowRight') shiftView(1);
  if (e.key==='t'||e.key==='T') jumpToToday();
});

document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id==='modalOverlay') closeModal(); });
document.getElementById('profileModal').addEventListener('click', e => { if (e.target.id==='profileModal') closeProfileModal(); });

// ══════════════════════════════════════════
// INIT — Wait for Firebase, then boot
// ══════════════════════════════════════════
async function init() {
  try {
    await migrateFromLocalStorage();
    await seedDefaultAthlete();
    await loadAllAthletes();
  } catch(err) {
    console.error('Firebase init error:', err);
  }
  // Hide loading, show admin login
  document.getElementById('loadingOverlay').style.display = 'none';
  showScreen('screenAdminLogin');
  document.getElementById('adminPassInput').focus();
}

if (window.firebaseReady) {
  init();
} else {
  window.addEventListener('firebase-ready', init);
}
