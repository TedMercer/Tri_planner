/* TriPlan — Import Plan tab
 * -------------------------------------------------------------------------
 * Adds an "Import" tab: pick an athlete, load a training-plan JSON file
 * (or paste it), review/edit the week, then import it into Planned data.
 *
 * No backend, no API key. Pure client-side file read.
 * Wired to app.js: reads the global `athletes` roster and writes planned
 * sessions into `athlete.activities` via `saveAthlete()` (one batched save).
 *
 * Setup: add `<script src="js/import-plan.js"></script>` before </body>,
 * AFTER js/app.js.
 *
 * Expected JSON shape (all metadata optional; only `days` is required):
 *   {
 *     "week_start_date": "2026-10-12",      // used to assign dates if days omit them
 *     "phase": "build",                      // optional, display only
 *     "week_summary": "...",                 // optional, display only
 *     "rationale": "...",                    // optional, display only
 *     "days": [
 *       { "label": "Mon", "date": "2026-10-12",   // date optional
 *         "sessions": [
 *           { "discipline": "run|bike|swim|strength|rest",
 *             "distance": 5, "unit": "mi|yd|min",
 *             "title": "Interval run", "notes": "6x800m @ 5k pace" }
 *         ] }
 *     ]
 *   }
 * `days` may also be a bare array (the top-level object is then optional).
 */
(function () {
  "use strict";

  // =========================================================================
  // ADAPTERS — wired to app.js's data model.
  // =========================================================================

  // app.js keeps the roster in the global `athletes` array.
  async function impGetAthletes() {
    return (typeof athletes !== "undefined" && Array.isArray(athletes)) ? athletes : [];
  }

  // Batched import: write all planned sessions for one athlete, then save once.
  // sessions: [{ date:'YYYY-MM-DD', type:'run'|'bike'|'swim', qty:Number, notes:String }]
  async function impImportSessions(athleteId, sessions, clearDates) {
    const target = (typeof athleteById === "function" ? athleteById(athleteId) : null)
      || (typeof currentAthlete === "function" ? currentAthlete() : null);
    if (!target) throw new Error("No athlete found to import into.");

    // Respect app.js edit rules: you can only write to the profile you logged
    // in as. (canEdit + currentAthleteId are globals from app.js.)
    const editable = (typeof canEdit !== "undefined" && canEdit) &&
      (typeof currentAthleteId !== "undefined" && target.id === currentAthleteId);
    if (!editable) {
      throw new Error(`You have view-only access to ${target.name || "this profile"}. ` +
        `Switch User and log in as ${target.name || "it"} (with its password) to import.`);
    }

    if (!target.activities) target.activities = {};

    // Optional: wipe existing planned sessions on the days we're about to fill,
    // so re-importing the same week replaces instead of stacking.
    if (Array.isArray(clearDates)) {
      for (const d of clearDates) delete target.activities[d];
    }

    for (const s of sessions) {
      const qty = s.type === "swim" ? Math.round(s.qty) : parseFloat((+s.qty).toFixed(2));
      if (!target.activities[s.date]) target.activities[s.date] = [];
      target.activities[s.date].push({ type: s.type, qty, notes: s.notes || "" });
    }

    await saveAthlete(target);              // single Firestore write (merge)
    if (typeof render === "function") render();
    return target;
  }

  // =========================================================================
  // STATE
  // =========================================================================
  let currentPlan = null;
  let athleteCache = [];

  // =========================================================================
  // STYLES
  // =========================================================================
  const CSS = `
  #importView { padding: 20px; max-width: 900px; margin: 0 auto; }
  .imp-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .imp-card h3 { margin: 0 0 12px; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 16px; }
  .imp-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .imp-field { flex: 1; min-width: 160px; margin-bottom: 12px; }
  .imp-field label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--text-dim, #8B90A0); margin-bottom: 5px; }
  .imp-field input, .imp-field select, .imp-field textarea {
    width: 100%; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 9px; color: #fff; padding: 9px 11px; font-size: 13px; font-family: inherit; }
  .imp-field textarea { min-height: 120px; resize: vertical; font-family: 'Space Mono', monospace; font-size: 12px; }
  .imp-btn { border: none; border-radius: 10px; padding: 11px 18px; font-weight: 600; font-size: 13px;
    cursor: pointer; font-family: inherit; }
  .imp-btn-primary { background: linear-gradient(135deg,#E07B39,#2A9D8F,#6A7BDB); color: #fff; }
  .imp-btn-ghost { background: rgba(255,255,255,0.06); color: #fff; border: 1px solid rgba(255,255,255,0.14); }
  .imp-file { display: inline-block; cursor: pointer; }
  .imp-file input { display: none; }
  .imp-day { border: 1px solid rgba(255,255,255,0.08); border-radius: 11px; margin-bottom: 10px; overflow: hidden; }
  .imp-day-head { display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; background: rgba(255,255,255,0.04); font-size: 12px; }
  .imp-day-head .d-label { font-weight: 700; font-family: 'Space Mono', monospace; }
  .imp-day-head .d-date { color: var(--text-dim, #8B90A0); }
  .imp-sess { display: flex; gap: 8px; align-items: flex-start; padding: 8px 12px; flex-wrap: wrap;
    border-top: 1px dashed rgba(255,255,255,0.07); }
  .imp-sess select, .imp-sess input, .imp-sess textarea {
    background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12); border-radius: 7px;
    color: #fff; padding: 6px 8px; font-size: 12px; font-family: inherit; }
  .imp-sess .s-disc { width: 92px; }
  .imp-sess .s-dist { width: 70px; }
  .imp-sess .s-unit { width: 54px; }
  .imp-sess .s-notes { flex: 1; min-width: 160px; }
  .imp-disc-run  { border-left: 3px solid var(--run-primary, #E07B39); }
  .imp-disc-bike { border-left: 3px solid var(--bike-primary, #2A9D8F); }
  .imp-disc-swim { border-left: 3px solid var(--swim-primary, #6A7BDB); }
  .imp-disc-strength, .imp-disc-rest { border-left: 3px solid rgba(255,255,255,0.2); }
  .imp-x { background: none; border: none; color: var(--danger, #E76F51); cursor: pointer; font-size: 15px; }
  .imp-meta { font-size: 12px; color: var(--text-muted, #B4B9C9); line-height: 1.55; }
  .imp-phase { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
    background: rgba(106,123,219,0.2); color: #9aa8ff; padding: 3px 8px; border-radius: 20px; margin-bottom: 8px; }
  .imp-error { color: var(--danger, #E76F51); font-size: 13px; margin-top: 8px; white-space: pre-wrap; }
  .imp-totals { font-family: 'Space Mono', monospace; font-size: 12px; color: var(--text-dim,#8B90A0); }
  `;

  // =========================================================================
  // DOM INJECTION
  // =========================================================================
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildView() {
    const view = document.createElement("div");
    view.id = "importView";
    view.style.display = "none";
    view.innerHTML = `
      <div class="imp-card">
        <h3>📥 Import Training Plan</h3>
        <div class="imp-row">
          <div class="imp-field">
            <label>Athlete</label>
            <select id="impAthlete"></select>
          </div>
          <div class="imp-field">
            <label>Week start (used only if the file has no dates)</label>
            <input id="impWeekStart" type="date" />
          </div>
        </div>
        <div class="imp-row" style="align-items:center;">
          <label class="imp-file imp-btn imp-btn-ghost">
            Choose JSON file…<input id="impFile" type="file" accept=".json,application/json" />
          </label>
          <span id="impFileName" class="imp-meta"></span>
        </div>
        <div class="imp-field" style="margin-top:12px;">
          <label>…or paste JSON here</label>
          <textarea id="impPaste" placeholder='{ "week_start_date": "2026-10-12", "days": [ ... ] }'></textarea>
        </div>
        <button id="impLoad" class="imp-btn imp-btn-primary">Load &amp; preview</button>
        <div id="impError" class="imp-error"></div>
      </div>
      <div id="impOutput"></div>
    `;
    (document.getElementById("mainApp") || document.body).appendChild(view);
  }

  function injectTab() {
    const tabs = document.querySelector(".view-tabs");
    if (!tabs || document.querySelector('[data-view="import"]')) return;
    const btn = document.createElement("button");
    btn.className = "view-tab";
    btn.dataset.view = "import";
    btn.textContent = "📥 Import";
    btn.addEventListener("click", openImport);
    tabs.appendChild(btn);
  }

  function openImport() {
    ["calendarView", "analyticsView", "stackupView", "guideView"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    const v = document.getElementById("importView");
    if (v) v.style.display = "block";
    document.querySelectorAll(".view-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === "import")
    );
    const toggle = document.getElementById("dataModeToggle");
    if (toggle) toggle.style.display = "none"; // import is planned-only
    populateForm();
  }

  function wrapSwitchMainView() {
    const orig = window.switchMainView;
    if (typeof orig !== "function") return;
    window.switchMainView = function (view) {
      const v = document.getElementById("importView");
      if (v && view !== "import") v.style.display = "none";
      return orig.apply(this, arguments);
    };
  }

  // =========================================================================
  // FORM
  // =========================================================================
  async function populateForm() {
    athleteCache = await impGetAthletes();
    const aSel = document.getElementById("impAthlete");
    if (aSel) {
      aSel.innerHTML = athleteCache
        .map((a, i) => `<option value="${i}">${escapeHtml(a.name || "Athlete " + (i + 1))}</option>`)
        .join("");
      // Default to the profile you can actually edit.
      if (typeof currentAthleteId !== "undefined") {
        const idx = athleteCache.findIndex((a) => a.id === currentAthleteId);
        if (idx >= 0) aSel.value = String(idx);
      }
    }
    const wk = document.getElementById("impWeekStart");
    if (wk && !wk.value) wk.value = defaultNextWeekStart(currentAthlete_());
  }

  function currentAthlete_() {
    const idx = +(document.getElementById("impAthlete")?.value || 0);
    return athleteCache[idx] || null;
  }

  function defaultNextWeekStart(a) {
    const startDay = a && a.weekStartDay === 1 ? 1 : 0; // app.js uses weekStartDay
    const d = new Date();
    d.setDate(d.getDate() + 7);
    while (d.getDay() !== startDay) d.setDate(d.getDate() - 1);
    return isoDate(d);
  }

  // =========================================================================
  // LOAD + PARSE
  // =========================================================================
  function wireInputs() {
    const fileEl = document.getElementById("impFile");
    if (fileEl) {
      fileEl.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        document.getElementById("impFileName").textContent = f.name;
        const reader = new FileReader();
        reader.onload = () => {
          document.getElementById("impPaste").value = reader.result;
          loadFromText(reader.result);
        };
        reader.onerror = () => showError("Could not read that file.");
        reader.readAsText(f);
      });
    }
    const loadBtn = document.getElementById("impLoad");
    if (loadBtn) loadBtn.addEventListener("click", () => {
      loadFromText(document.getElementById("impPaste").value);
    });
  }

  function loadFromText(text) {
    showError("");
    if (!text || !text.trim()) { showError("Paste some JSON or choose a file first."); return; }
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      showError("That isn't valid JSON:\n" + e.message);
      return;
    }
    try {
      currentPlan = normalizePlan(raw);
      renderPlan(currentPlan);
    } catch (e) {
      showError(e.message);
    }
  }

  // Accept the documented object, or a bare array of days.
  function normalizePlan(raw) {
    const obj = Array.isArray(raw) ? { days: raw } : (raw || {});
    if (!Array.isArray(obj.days) || obj.days.length === 0) {
      throw new Error('No "days" array found in the plan.');
    }
    const uiStart = document.getElementById("impWeekStart").value;
    const start = obj.week_start_date || uiStart;
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const days = obj.days.map((d, i) => {
      let date = d.date;
      if (!date) {
        if (!start) throw new Error('Day ' + (i + 1) + ' has no "date", and no "week_start_date" or week-start picker value to derive one from.');
        const base = new Date(start + "T00:00:00");
        base.setDate(base.getDate() + i);
        date = isoDate(base);
      }
      const dObj = new Date(date + "T00:00:00");
      const label = d.label || labels[dObj.getDay()];
      const sessions = (d.sessions || []).map((s) => ({
        discipline: String(s.discipline || "rest").toLowerCase(),
        distance: num(s.distance),
        unit: s.unit || defaultUnit(s.discipline),
        title: s.title || "",
        notes: s.notes || "",
      }));
      return { date, label, sessions };
    });

    return {
      phase: obj.phase || "",
      week_summary: obj.week_summary || "",
      rationale: obj.rationale || "",
      weekly_totals: obj.weekly_totals || computeTotals(days),
      days,
    };
  }

  function defaultUnit(disc) {
    const d = String(disc || "").toLowerCase();
    if (d === "swim") return "yd";
    if (d === "run" || d === "bike") return "mi";
    return "";
  }

  function computeTotals(days) {
    const t = { run_mi: 0, bike_mi: 0, swim_yd: 0 };
    days.forEach((day) => (day.sessions || []).forEach((s) => {
      if (s.discipline === "run") t.run_mi += num(s.distance);
      else if (s.discipline === "bike") t.bike_mi += num(s.distance);
      else if (s.discipline === "swim") t.swim_yd += num(s.distance);
    }));
    return t;
  }

  // =========================================================================
  // RENDER (editable)
  // =========================================================================
  function renderPlan(plan) {
    const out = document.getElementById("impOutput");
    if (!plan || !Array.isArray(plan.days)) { out.innerHTML = ""; return; }

    const daysHtml = plan.days.map((day, di) => {
      const sess = (day.sessions || []).map((s, si) => sessionRow(di, si, s)).join("");
      return `
        <div class="imp-day">
          <div class="imp-day-head">
            <span><span class="d-label">${escapeHtml(day.label || "")}</span>
              <span class="d-date">${escapeHtml(day.date || "")}</span></span>
            <button class="imp-btn imp-btn-ghost" style="padding:4px 10px;font-size:11px;"
              onclick="window.__impAddSession(${di})">+ session</button>
          </div>
          ${sess}
        </div>`;
    }).join("");

    const t = plan.weekly_totals || {};
    out.innerHTML = `
      <div class="imp-card">
        ${plan.phase ? `<span class="imp-phase">${escapeHtml(plan.phase)} phase</span><br>` : ""}
        ${plan.week_summary ? `<div class="imp-meta"><strong>${escapeHtml(plan.week_summary)}</strong></div>` : ""}
        ${plan.rationale ? `<div class="imp-meta" style="margin-top:6px;">${escapeHtml(plan.rationale)}</div>` : ""}
        <div class="imp-totals" style="margin-top:10px;">
          Run ${num(t.run_mi)} mi · Bike ${num(t.bike_mi)} mi · Swim ${num(t.swim_yd)} yd
        </div>
      </div>
      <div class="imp-card">
        <h3>Preview <span style="font-weight:400;font-size:12px;color:var(--text-dim,#8B90A0);">— edit anything, then import</span></h3>
        ${daysHtml}
        <label class="imp-meta" style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;">
          <input type="checkbox" id="impClearFirst" style="width:auto;" />
          Clear existing planned sessions on these days before importing (prevents doubling on re-import)
        </label>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button class="imp-btn imp-btn-primary" onclick="window.__impImport()">Import to Planned week</button>
          <button class="imp-btn imp-btn-ghost" onclick="window.__impClear()">Clear</button>
        </div>
        <div id="impImportMsg" class="imp-meta" style="margin-top:10px;"></div>
      </div>`;
  }

  function sessionRow(di, si, s) {
    const disc = (s.discipline || "rest").toLowerCase();
    const discOpts = ["run", "bike", "swim", "strength", "rest"]
      .map((d) => `<option value="${d}"${d === disc ? " selected" : ""}>${d}</option>`).join("");
    const notesVal = (s.title ? s.title + " — " : "") + (s.notes || "");
    return `
      <div class="imp-sess imp-disc-${disc}">
        <select class="s-disc" onchange="window.__impEdit(${di},${si},'discipline',this.value)">${discOpts}</select>
        <input class="s-dist" type="number" step="0.1" min="0" value="${num(s.distance)}"
          onchange="window.__impEdit(${di},${si},'distance',this.value)" />
        <input class="s-unit" value="${escapeHtml(s.unit || "")}"
          onchange="window.__impEdit(${di},${si},'unit',this.value)" />
        <textarea class="s-notes" rows="1"
          onchange="window.__impEdit(${di},${si},'notes',this.value)">${escapeHtml(notesVal)}</textarea>
        <button class="imp-x" title="remove" onclick="window.__impDelSession(${di},${si})">✕</button>
      </div>`;
  }

  // Editing hooks
  window.__impEdit = (di, si, field, val) => {
    const s = currentPlan.days[di].sessions[si];
    if (field === "distance") s.distance = parseFloat(val) || 0;
    else if (field === "notes") { s.notes = val; s.title = ""; }
    else s[field] = val;
  };
  window.__impAddSession = (di) => {
    currentPlan.days[di].sessions.push({ discipline: "run", distance: 0, unit: "mi", title: "", notes: "" });
    renderPlan(currentPlan);
  };
  window.__impDelSession = (di, si) => {
    currentPlan.days[di].sessions.splice(si, 1);
    renderPlan(currentPlan);
  };
  window.__impClear = () => {
    currentPlan = null;
    document.getElementById("impOutput").innerHTML = "";
    document.getElementById("impPaste").value = "";
    document.getElementById("impFileName").textContent = "";
    const f = document.getElementById("impFile"); if (f) f.value = "";
  };

  // =========================================================================
  // IMPORT
  // =========================================================================
  window.__impImport = async () => {
    const msg = document.getElementById("impImportMsg");
    const a = currentAthlete_();
    if (!a || !currentPlan) return;

    // Collect importable sessions (run/bike/swim with a positive distance).
    const sessions = [];
    let skipped = 0;
    for (const day of currentPlan.days) {
      for (const s of day.sessions || []) {
        const type = (s.discipline || "").toLowerCase();
        if (!["run", "bike", "swim"].includes(type)) { skipped++; continue; }
        const qty = parseFloat(s.distance) || 0;
        if (qty <= 0) { skipped++; continue; }
        const notes = ((s.title ? s.title + " — " : "") + (s.notes || "")).trim();
        sessions.push({ date: day.date, type, qty, notes });
      }
    }
    if (sessions.length === 0) {
      msg.innerHTML = `<span class="imp-error">Nothing to import — no run/bike/swim sessions with a distance.</span>`;
      return;
    }

    const clearFirst = !!document.getElementById("impClearFirst")?.checked;
    const clearDates = clearFirst ? [...new Set(currentPlan.days.map((d) => d.date))] : null;

    msg.textContent = "Importing…";
    try {
      await impImportSessions(a.id, sessions, clearDates);
      const clearedNote = clearFirst ? ` (cleared ${clearDates.length} day${clearDates.length === 1 ? "" : "s"} first)` : "";
      msg.innerHTML = `✓ Imported ${sessions.length} session${sessions.length === 1 ? "" : "s"} into ` +
        `${escapeHtml(a.name || "the profile")}'s planned week${clearedNote}` +
        (skipped ? ` (skipped ${skipped} rest/strength).` : ".") +
        ` Open the Calendar tab to review.`;
      // If you're viewing that athlete, drop into Planned mode so it shows.
      if (typeof viewingAthleteId !== "undefined" && viewingAthleteId === a.id &&
          typeof switchDataMode === "function") {
        switchDataMode("planned");
      }
    } catch (e) {
      msg.innerHTML = `<span class="imp-error">${escapeHtml(e.message)}</span>`;
    }
  };

  // =========================================================================
  // HELPERS
  // =========================================================================
  function showError(t) { const el = document.getElementById("impError"); if (el) el.textContent = t || ""; }
  // Local-date ISO (matches app.js dateKey; avoids toISOString UTC off-by-one).
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // =========================================================================
  // INIT
  // =========================================================================
  function init() {
    injectStyles();
    buildView();
    wireInputs();
    let tries = 0;
    const timer = setInterval(() => {
      injectTab();
      if (document.querySelector('[data-view="import"]') || ++tries > 30) {
        clearInterval(timer);
        wrapSwitchMainView();
      }
    }, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();