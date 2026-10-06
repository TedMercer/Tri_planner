/* TriPlan — Admin role
 * -------------------------------------------------------------------------
 * Adds an administrator login with elevated privileges:
 *   • delete any athlete profile (requires deleteDoc in window.FB — see index.html)
 *   • reset any athlete's password (no birthday challenge)
 *   • "admin edit mode" — edit any profile you're viewing
 *   • export all data
 *
 * SECURITY NOTE: this is a client-side convenience gate on a public site.
 * It does NOT stop someone from bypassing it via the browser console or by
 * reading this file. For real enforcement, add Firebase Auth + Firestore
 * Security Rules. Treat this as UX, not a security boundary.
 *
 * Setup:
 *   1. Set ADMIN_PASSWORD below.
 *   2. Ensure index.html exposes deleteDoc on window.FB (see notes).
 *   3. Add `<script src="js/admin.js"></script>` before </body>, AFTER app.js.
 *
 * It reuses these app.js globals: athletes, athleteById, saveAthlete,
 * simpleHash, loadAllAthletes, buildAthleteTabs, renderProfileBanner,
 * listenToAthlete, render, showToast, updateAccessBadge, hasEditAccess,
 * calcAge, exportData, launchApp, switchMainView, MAX_ATHLETES,
 * viewingAthleteId, currentAthleteId, canEdit.
 */
(function () {
  "use strict";

  // =========================================================================
  // CONFIG — change this.
  // =========================================================================
  const ADMIN_PASSWORD = "change-me-admin"; // <- set your admin password

  // Shared admin flags on window so wrapped functions can see them.
  window.__isAdmin = window.__isAdmin || false;
  window.__adminEditMode = window.__adminEditMode || false;

  // =========================================================================
  // STYLES
  // =========================================================================
  const CSS = `
  #adminView { padding: 20px; max-width: 900px; margin: 0 auto; }
  .adm-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .adm-card h3 { margin: 0 0 10px; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 16px; }
  .adm-meta { font-size: 12px; color: var(--text-muted, #B4B9C9); line-height: 1.55; }
  .adm-btn { border: none; border-radius: 9px; padding: 8px 14px; font-weight: 600; font-size: 12px;
    cursor: pointer; font-family: inherit; color: #fff; }
  .adm-btn-ghost { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
  .adm-danger { background: rgba(231,111,81,0.14); border: 1px solid var(--danger, #E76F51); color: var(--danger,#E76F51); }
  .adm-athlete { display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 10px 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 11px; margin-bottom: 8px; flex-wrap: wrap; }
  .adm-ath-name { font-weight: 600; font-size: 14px; }
  .adm-ath-meta { font-size: 11px; color: var(--text-dim, #8B90A0); margin-top: 2px; }
  .adm-ath-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .adm-tag { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; background: rgba(106,123,219,0.2);
    color: #9aa8ff; padding: 2px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }
  .admin-badge { font-size: 9px; font-weight: 700; letter-spacing: .08em; background: var(--danger,#E76F51);
    color: #fff; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }
  #adminAccessBtn { margin-top: 10px; }
  `;

  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // =========================================================================
  // DOM — admin-access button on the Returner/New-User screen
  // =========================================================================
  function injectAdminButton() {
    const card = document.querySelector("#screenUserChoice .auth-card");
    if (!card || document.getElementById("adminAccessBtn")) return;
    const btn = document.createElement("button");
    btn.id = "adminAccessBtn";
    btn.className = "back-link";
    btn.textContent = "🛡 Admin access";
    btn.addEventListener("click", adminLogin);
    card.appendChild(btn);
  }

  // =========================================================================
  // DOM — admin view + tab (only after admin login)
  // =========================================================================
  function buildView() {
    if (document.getElementById("adminView")) return;
    const view = document.createElement("div");
    view.id = "adminView";
    view.style.display = "none";
    view.innerHTML = `<div id="adminPanel"></div>`;
    (document.getElementById("mainApp") || document.body).appendChild(view);
  }

  function injectAdminTab() {
    const tabs = document.querySelector(".view-tabs");
    if (!tabs || document.querySelector('[data-view="admin"]')) return;
    const btn = document.createElement("button");
    btn.className = "view-tab";
    btn.dataset.view = "admin";
    btn.textContent = "🛡 Admin";
    btn.addEventListener("click", openAdmin);
    tabs.appendChild(btn);
  }

  function openAdmin() {
    ["calendarView", "analyticsView", "stackupView", "guideView"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    const v = document.getElementById("adminView");
    if (v) v.style.display = "block";
    document.querySelectorAll(".view-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === "admin")
    );
    const toggle = document.getElementById("dataModeToggle");
    if (toggle) toggle.style.display = "none";
    renderAdminPanel();
  }

  function wrapSwitchMainView() {
    const orig = window.switchMainView;
    if (typeof orig !== "function" || orig.__admWrapped) return;
    const wrapped = function (view) {
      const v = document.getElementById("adminView");
      if (v && view !== "admin") v.style.display = "none";
      return orig.apply(this, arguments);
    };
    wrapped.__admWrapped = true;
    window.switchMainView = wrapped;
  }

  // =========================================================================
  // PRIVILEGE HOOKS — edit-any-profile + admin badge
  // =========================================================================
  function enableAdminHooks() {
    if (typeof window.hasEditAccess === "function" && !window.hasEditAccess.__admWrapped) {
      const origHAE = window.hasEditAccess;
      const w = function () { return origHAE() || (window.__isAdmin && window.__adminEditMode); };
      w.__admWrapped = true;
      window.hasEditAccess = w;
    }
    if (typeof window.updateAccessBadge === "function" && !window.updateAccessBadge.__admWrapped) {
      const origUAB = window.updateAccessBadge;
      const w = function () {
        origUAB.apply(this, arguments);
        if (window.__isAdmin) {
          const b = document.getElementById("accessBadge");
          if (b) b.insertAdjacentHTML("beforeend", '<span class="admin-badge">ADMIN</span>');
        }
      };
      w.__admWrapped = true;
      window.updateAccessBadge = w;
    }
  }

  // Reset admin state + remove admin UI when leaving the session.
  function wrapExits() {
    ["logout", "switchUser"].forEach((name) => {
      const orig = window[name];
      if (typeof orig !== "function" || orig.__admWrapped) return;
      const w = function () {
        window.__isAdmin = false;
        window.__adminEditMode = false;
        const tab = document.querySelector('[data-view="admin"]');
        if (tab) tab.remove();
        const v = document.getElementById("adminView");
        if (v) v.style.display = "none";
        return orig.apply(this, arguments);
      };
      w.__admWrapped = true;
      window[name] = w;
    });
  }

  // =========================================================================
  // LOGIN
  // =========================================================================
  async function adminLogin() {
    const pw = prompt("Admin password:");
    if (pw === null) return;
    if (typeof simpleHash !== "function" || simpleHash(pw) !== simpleHash(ADMIN_PASSWORD)) {
      alert("Incorrect admin password.");
      return;
    }
    window.__isAdmin = true;
    try { if (typeof loadAllAthletes === "function") await loadAllAthletes(); } catch (e) {}

    // Admin owns no profile; view the first one, no implicit edit rights.
    viewingAthleteId = (typeof athletes !== "undefined" && athletes[0]) ? athletes[0].id : null;
    currentAthleteId = null;
    canEdit = false;

    enableAdminHooks();
    if (typeof launchApp === "function") launchApp();
    injectAdminTab();
    openAdmin();
  }

  // =========================================================================
  // PANEL
  // =========================================================================
  function countPlanned(a) {
    let n = 0; const m = a.activities || {};
    for (const k in m) n += (m[k] || []).length;
    return n;
  }

  function renderAdminPanel() {
    const el = document.getElementById("adminPanel");
    if (!el) return;
    const list = (typeof athletes !== "undefined" ? athletes : []);
    const max = (typeof MAX_ATHLETES !== "undefined" ? MAX_ATHLETES : 5);

    const rows = list.map((a) => {
      const age = a.birthday && typeof calcAge === "function" ? calcAge(a.birthday) : "—";
      const aRace = a.races && a.races.a && a.races.a.name ? "A: " + esc(a.races.a.name) : "no A race";
      const viewing = a.id === viewingAthleteId;
      return `<div class="adm-athlete">
        <div class="adm-ath-info">
          <div class="adm-ath-name">${esc(a.name)}${viewing ? '<span class="adm-tag">viewing</span>' : ""}</div>
          <div class="adm-ath-meta">Age ${age} · ${aRace} · ${countPlanned(a)} planned sessions</div>
        </div>
        <div class="adm-ath-actions">
          <button class="adm-btn adm-btn-ghost" onclick="window.__admView('${a.id}')">View</button>
          <button class="adm-btn adm-btn-ghost" onclick="window.__admResetPw('${a.id}')">Reset PW</button>
          <button class="adm-btn adm-danger" onclick="window.__admDelete('${a.id}')">Delete</button>
        </div>
      </div>`;
    }).join("");

    el.innerHTML = `
      <div class="adm-card">
        <h3>🛡 Administrator</h3>
        <div class="adm-meta">You can delete profiles, reset passwords, and edit any profile you view.</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:12px;">
          <label class="adm-meta" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="admEditToggle" ${window.__adminEditMode ? "checked" : ""}
              onchange="window.__admToggleEdit()" style="width:auto;">
            Admin edit mode — edit any profile you view
          </label>
          <button class="adm-btn adm-btn-ghost" onclick="exportData()">⬇ Export all data</button>
        </div>
      </div>
      <div class="adm-card">
        <h3>Profiles (${list.length}/${max})</h3>
        ${rows || '<div class="adm-meta">No profiles exist.</div>'}
      </div>`;
  }

  // =========================================================================
  // ACTIONS
  // =========================================================================
  window.__admView = function (id) {
    viewingAthleteId = id;
    if (typeof buildAthleteTabs === "function") buildAthleteTabs();
    if (typeof renderProfileBanner === "function") renderProfileBanner();
    if (typeof updateAccessBadge === "function") updateAccessBadge();
    if (typeof listenToAthlete === "function") listenToAthlete(id);
    if (typeof render === "function") render();
    if (typeof switchMainView === "function") switchMainView("calendar");
  };

  window.__admResetPw = async function (id) {
    const a = athleteById(id); if (!a) return;
    const pw = prompt(`New password for ${a.name}:`);
    if (!pw) return;
    a.passwordHash = simpleHash(pw);
    await saveAthlete(a);
    if (typeof showToast === "function") showToast(`Password reset for ${a.name}`);
  };

  window.__admDelete = async function (id) {
    const a = athleteById(id); if (!a) return;
    if (!window.FB || !window.FB.deleteDoc) {
      alert("Delete needs deleteDoc. Add it to the Firebase import and window.FB in index.html, then reload.");
      return;
    }
    if (!confirm(`Permanently delete "${a.name}" and ALL their training data?\nThis cannot be undone.`)) return;
    if (!confirm(`Last chance — really delete ${a.name}?`)) return;
    try {
      await window.FB.deleteDoc(window.FB.doc(window.FB.db, "athletes", id));
      if (typeof loadAllAthletes === "function") await loadAllAthletes();
      if (viewingAthleteId === id) viewingAthleteId = (athletes[0] ? athletes[0].id : null);
      if (currentAthleteId === id) currentAthleteId = null;
      if (typeof buildAthleteTabs === "function") buildAthleteTabs();
      if (viewingAthleteId) {
        if (typeof renderProfileBanner === "function") renderProfileBanner();
        if (typeof listenToAthlete === "function") listenToAthlete(viewingAthleteId);
      }
      if (typeof render === "function") render();
      renderAdminPanel();
      if (typeof showToast === "function") showToast(`Deleted ${a.name}`);
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  };

  window.__admToggleEdit = function () {
    window.__adminEditMode = !window.__adminEditMode;
    if (typeof updateAccessBadge === "function") updateAccessBadge();
    if (typeof render === "function") render();
    renderAdminPanel();
    if (typeof showToast === "function") showToast(window.__adminEditMode ? "Admin edit mode ON" : "Admin edit mode OFF");
  };

  // =========================================================================
  // HELPERS
  // =========================================================================
  function esc(str) {
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
    wrapExits();
    let tries = 0;
    const timer = setInterval(() => {
      injectAdminButton();
      wrapSwitchMainView();
      if (document.getElementById("adminAccessBtn") || ++tries > 40) clearInterval(timer);
    }, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();