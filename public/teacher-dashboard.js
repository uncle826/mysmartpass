const teacherToken = localStorage.getItem("smartpass_teacher_token");
if (localStorage.getItem("smartpass_role") !== "teacher" || !teacherToken) {
  localStorage.removeItem("smartpass_role");
  localStorage.removeItem("smartpass_teacher_token");
  location.replace("/teacher-signin");
}

function teacherApi(path, body) {
  return apiFetch(path, { body, token: teacherToken, method: body ? "POST" : "GET" });
}

function kickToSignIn() {
  localStorage.removeItem("smartpass_role");
  localStorage.removeItem("smartpass_name");
  localStorage.removeItem("smartpass_school");
  localStorage.removeItem("smartpass_teacher_token");
  location.replace("/teacher-signin");
}

requestAnimationFrame(() => document.body.classList.add("loaded"));

const teacherName = localStorage.getItem("smartpass_name") || "Teacher";
document.getElementById("teacher-name").textContent = teacherName.toUpperCase();

const AVATAR_PALETTE = ["#2599d6", "#7b68ee", "#fb6d4c", "#f2994a", "#b21cc4", "#14a3a1", "#1ed17a", "#e2574c"];
const LIMIT_OPTIONS = [
  { value: null, label: "Off" },
  { value: 3, label: "3" },
  { value: 2, label: "2" },
  { value: 1, label: "1" },
  { value: 0, label: "None" },
];

const listEl = document.getElementById("t-student-list");
const emptyEl = document.getElementById("t-empty");
const countEl = document.getElementById("t-count");
const searchEl = document.getElementById("t-search");
const detailEl = document.getElementById("t-detail");
const studentsView = document.getElementById("students-view");
const hallView = document.getElementById("hall-view");
const settingsView = document.getElementById("settings-view");
const VIEWS = { students: studentsView, hall: hallView, settings: settingsView };

let students = [];
let studentMap = new Map();
let selectedKey = null;
let currentView = "students";
let teacherPhoto = null;
let listAnimated = false;
let hallShown = new Set();
let knownRequestIds = null;
let showHidden = false;
let customClasses = [];

/* ---------- helpers ---------- */

function avatarColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function avatarHtml(s, extraClass = "") {
  const color = s.avatarColor || avatarColor(s.name);
  const photo = s.photo ? `;background-image:url('${s.photo}')` : "";
  const initial = s.photo ? "" : escapeHtml(s.name.charAt(0).toUpperCase());
  return `<span class="t-avatar ${s.photo ? "has-photo" : ""} ${extraClass}" style="background-color:${color}${photo}">${initial}</span>`;
}

function shade(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function clock(ms, roundUp) {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

function timeOfDay(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(ts) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function statusInfo(s, now) {
  if (!s.active) {
    if (s.request) return { cls: "requesting", text: `Asking to go to ${s.request.dest.name}` };
    const n = s.log.length;
    return { cls: "", text: `In class · ${n} pass${n === 1 ? "" : "es"}` };
  }
  const remaining = s.active.endTime - now;
  if (remaining > 0) {
    return { cls: "on-pass", text: `On a pass · ${s.active.room.name} · ${clock(remaining, true)} left` };
  }
  return { cls: "overtime", text: `Overtime · ${s.active.room.name} · +${clock(-remaining, false)}` };
}

function limitSummary(s) {
  if (s.dailyLimit === null) return `No daily limit · ${s.usedToday} today`;
  if (s.dailyLimit === 0) return "Passes are turned off";
  return `${s.usedToday} of ${s.dailyLimit} used today`;
}

function popElement(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

/* ---------- views ---------- */

function setView(view) {
  currentView = VIEWS[view] ? view : "students";
  document.querySelectorAll(".main-nav .nav-item").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === currentView);
  });
  Object.entries(VIEWS).forEach(([key, el]) => el.classList.toggle("hidden", key !== currentView));
  const show = VIEWS[currentView];
  show.classList.remove("view-enter");
  void show.offsetWidth;
  show.classList.add("view-enter");
  if (location.hash !== `#${currentView}`) history.replaceState(null, "", `#${currentView}`);
  if (currentView === "settings") renderClassSettings();
  tick();
}

document.querySelectorAll(".main-nav .nav-item").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    setView(a.dataset.view);
  });
});

/* ---------- student list ---------- */

function renderList() {
  const term = searchEl.value.trim().toLowerCase();
  const visible = students.filter((s) => showHidden || !s.hidden);
  const shown = visible.filter((s) => !term || s.name.toLowerCase().includes(term));
  const hiddenCount = students.filter((s) => s.hidden).length;
  const now = serverTime();

  if (countEl.textContent !== String(visible.length)) {
    countEl.textContent = visible.length;
    popElement(countEl);
  }
  emptyEl.classList.toggle("hidden", visible.length > 0);

  const stagger = !listAnimated && shown.length > 0;
  if (stagger) listAnimated = true;

  listEl.innerHTML = shown
    .map((s, i) => {
      const st = statusInfo(s, now);
      const chip = s.request ? '<span class="t-chip amber">Request</span>' : s.requestOnly ? '<span class="t-chip">Approval</span>' : "";
      const rowAction = s.hidden
        ? `<button type="button" class="t-delete-btn t-unhide-btn" data-unhide="${s.key}" title="Add back to your list" aria-label="Add ${escapeHtml(s.name)} back to your list">
            <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 1 2.6 6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 7v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>`
        : `<button type="button" class="t-delete-btn t-remove-btn" data-remove="${s.key}" title="Remove from list" aria-label="Remove ${escapeHtml(s.name)} from your list">
            <svg viewBox="0 0 24 24"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>`;
      return `
        <div class="t-student ${s.key === selectedKey ? "selected" : ""} ${stagger ? "stagger" : ""} ${s.hidden ? "is-hidden" : ""}" style="--i:${Math.min(i, 14)}" data-key="${s.key}" role="button" tabindex="0">
          ${avatarHtml(s)}
          <span class="t-student-info">
            <span class="t-student-name">${escapeHtml(s.name)}</span>
            <span class="t-student-sub js-status ${st.cls}" data-key="${s.key}">${escapeHtml(st.text)}</span>
          </span>
          <span class="t-row-right">
            ${chip}
            ${rowAction}
          </span>
        </div>`;
    })
    .join("");

  listEl.querySelectorAll(".t-student").forEach((row) => {
    row.addEventListener("click", () => selectStudent(row.dataset.key));
    row.addEventListener("keydown", (e) => {
      if (e.target !== row) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectStudent(row.dataset.key);
      }
    });
  });
  listEl.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = studentMap.get(btn.dataset.remove);
      if (s) setHidden(s, true);
    });
  });
  listEl.querySelectorAll("[data-unhide]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = studentMap.get(btn.dataset.unhide);
      if (s) setHidden(s, false);
    });
  });

  const toggleEl = document.getElementById("t-hidden-toggle");
  if (hiddenCount === 0) {
    toggleEl.classList.add("hidden");
  } else {
    toggleEl.classList.remove("hidden");
    toggleEl.textContent = showHidden ? "Hide removed students" : `${hiddenCount} removed student${hiddenCount === 1 ? "" : "s"} — show`;
  }
}

document.getElementById("t-hidden-toggle").addEventListener("click", () => {
  showHidden = !showHidden;
  renderList();
});

async function setHidden(s, hidden) {
  const res = await teacherApi("/api/teacher/student/hide", { key: s.key, hidden });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showToast(res.data.error || "Couldn't update that.", "warn");
  s.hidden = hidden;
  if (hidden && selectedKey === s.key) selectedKey = null;
  renderList();
  renderDetail(true);
  if (hidden) {
    showToast(`Removed ${s.name} from your list`, "info", { label: "Undo", onClick: () => setHidden(s, false) });
  }
  refresh(true);
}

function selectStudent(key) {
  const changed = key !== selectedKey;
  selectedKey = key;
  listEl.querySelectorAll(".t-student").forEach((b) => b.classList.toggle("selected", b.dataset.key === key));
  renderDetail(changed);
}

/* ---------- student detail ---------- */

function renderRules(s) {
  const options = LIMIT_OPTIONS.map((o) => {
    const active = o.value === s.dailyLimit ? "active" : "";
    return `<button type="button" class="seg-btn ${active}" data-limit="${o.value === null ? "off" : o.value}">${o.label}</button>`;
  }).join("");

  return `
    <div class="t-rules">
      <div class="t-rule">
        <div class="t-rule-text">
          <div class="t-rule-title">Request only</div>
          <div class="t-rule-sub">${s.requestOnly ? "They must ask you before going anywhere" : "They can create passes on their own"}</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="t-request-only" ${s.requestOnly ? "checked" : ""}>
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="t-rule">
        <div class="t-rule-text">
          <div class="t-rule-title">Passes per day</div>
          <div class="t-rule-sub" id="t-limit-sub">${escapeHtml(limitSummary(s))}</div>
        </div>
        <div class="segmented" id="t-limit">${options}</div>
      </div>
      <div class="t-rule">
        <div class="t-rule-text">
          <div class="t-rule-title">Bounce passes</div>
          <div class="t-rule-sub">New passes for them start bouncing around their screen</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="t-always-bounce" ${s.alwaysBounce ? "checked" : ""}>
          <span class="switch-track"></span>
        </label>
      </div>
    </div>`;
}

function renderDetail(animate = true) {
  detailEl.classList.toggle("no-anim", !animate);
  const s = studentMap.get(selectedKey);

  if (!s) {
    detailEl.innerHTML = `
      <div class="t-placeholder">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.8 19.5c0-3.4 2.8-5.5 6.2-5.5s6.2 2.1 6.2 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M17.5 14.2c2.4 0 4.2 1.6 4.2 4.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span>Select a student to see where they've been</span>
      </div>`;
    return;
  }

  const total = s.log.length;
  const overtime = s.log.filter((p) => p.overtime).length;
  const avg = total ? s.log.reduce((sum, p) => sum + (p.endTime - p.startTime), 0) / total : 0;

  let activeBlock = "";
  if (s.active) {
    const cat = categoryByKey(s.active.room.categoryKey);
    const activeMsg = s.active.message ? `<div class="t-active-message">${escapeHtml(s.active.message)}</div>` : "";
    activeBlock = `
      <div class="t-bounce-row">
        <div class="t-bounce-text">
          <div class="t-bounce-title">Bounce this pass</div>
          <div class="t-bounce-sub">Bouncing right now, on or off</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="t-bounce-toggle" ${s.active.bounce ? "checked" : ""}>
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="t-active" style="background:linear-gradient(135deg, ${cat.color}, ${shade(cat.color, -45)})">
        <span class="t-active-icon">${roomIconMarkup(s.active.room.name, s.active.room.categoryKey)}</span>
        <div class="t-active-info">
          <div class="t-active-label" id="t-active-label">On a pass to</div>
          <div class="t-active-name">${escapeHtml(s.active.room.name)}</div>
          ${activeMsg}
        </div>
        <div class="t-active-time" id="t-active-time"></div>
      </div>`;
  }

  const hiddenBanner = s.hidden
    ? `<div class="t-hidden-banner">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span>Removed from your list — they'll reappear on their own once they make a pass.</span>
        <button type="button" class="btn btn-outline" id="t-unhide-btn">Add back</button>
      </div>`
    : "";

  let requestBlock = "";
  if (s.request) {
    const from = s.request.from ? ` from ${escapeHtml(s.request.from.name)}` : "";
    requestBlock = `
      <div class="t-request">
        <div class="t-request-info">
          <div class="t-request-label">Pass request</div>
          <div class="t-request-dest">${escapeHtml(s.name)} wants to go to <b>${escapeHtml(s.request.dest.name)}</b>${from} · ${s.request.minutes} min</div>
        </div>
        <div class="t-request-actions">
          <button type="button" class="btn btn-danger-outline" data-decide="deny" data-id="${s.request.id}">Deny</button>
          <button type="button" class="btn btn-primary" data-decide="approve" data-id="${s.request.id}">Approve</button>
        </div>
      </div>`;
  }

  const entries = s.log.slice().reverse();
  let historyHtml = "";
  if (entries.length === 0) {
    historyHtml = `<p class="t-no-history">${escapeHtml(s.name)} hasn't been anywhere yet.</p>`;
  } else {
    let lastDay = "";
    historyHtml = entries
      .map((p, i) => {
        const day = dayLabel(p.startTime);
        const heading = day !== lastDay ? `<div class="t-day">${day}</div>` : "";
        lastDay = day;
        const cat = categoryByKey(p.categoryKey);
        const tag = p.overtime ? ' · <span class="notif-overtime-tag">Overtime</span>' : "";
        return `${heading}
          <div class="notif-item t-history-item" style="--i:${Math.min(i, 12)}">
            <span class="notif-icon" style="background:${cat.color}">${roomIconMarkup(p.name, p.categoryKey)}</span>
            <div class="notif-info">
              <span class="notif-name">${escapeHtml(p.name)}</span>
              <span class="notif-meta">${timeOfDay(p.startTime)} · ${formatDuration(p.endTime - p.startTime)}${tag}</span>
            </div>
            <button type="button" class="t-delete-btn" data-delete-id="${p.id}" title="Delete this entry" aria-label="Delete this pass from history">
              <svg viewBox="0 0 24 24"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>`;
      })
      .join("");
  }

  const actions = s.active
    ? `<button type="button" class="btn btn-danger-outline" id="t-end-btn">End pass</button>`
    : `<button type="button" class="btn btn-primary" id="t-create-btn">
         <svg viewBox="0 0 24 24" class="btn-icon"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
         Create Pass
       </button>`;

  detailEl.innerHTML = `
    ${hiddenBanner}
    <div class="t-detail-head">
      <button type="button" class="t-avatar-btn" id="t-photo-btn" title="Change photo" aria-label="Change photo">
        ${avatarHtml(s)}
        <span class="t-avatar-cam"><svg viewBox="0 0 24 24"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></span>
      </button>
      <div class="t-detail-title">
        <h2>${escapeHtml(s.name)}</h2>
        <div class="t-status" id="t-status"></div>
      </div>
      <div class="t-actions">${actions}</div>
    </div>

    ${requestBlock}

    <div class="notif-stats">
      <div class="notif-stat"><span class="notif-stat-value">${total}</span><span class="notif-stat-label">Passes</span></div>
      <div class="notif-stat"><span class="notif-stat-value">${overtime}</span><span class="notif-stat-label">Overtime Passes</span></div>
      <div class="notif-stat"><span class="notif-stat-value">${total ? formatDuration(avg) : "—"}</span><span class="notif-stat-label">Average Time</span></div>
    </div>

    ${renderRules(s)}

    ${activeBlock}

    <h3 class="t-history-title">Where ${escapeHtml(s.name)} has been</h3>
    ${historyHtml}

    ${s.hidden ? "" : `
    <button type="button" class="btn btn-danger-outline t-delete-student-btn" id="t-delete-student-btn">
      <svg viewBox="0 0 24 24"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Delete student
    </button>`}`;

  const createBtn = document.getElementById("t-create-btn");
  if (createBtn) createBtn.addEventListener("click", () => openCreate(s));
  const endBtn = document.getElementById("t-end-btn");
  if (endBtn) endBtn.addEventListener("click", () => endStudentPass(s));
  document.getElementById("t-photo-btn").addEventListener("click", () => openPhotoDialog({ type: "student", key: s.key, name: s.name }));
  const unhideBtn = document.getElementById("t-unhide-btn");
  if (unhideBtn) unhideBtn.addEventListener("click", () => setHidden(s, false));
  const deleteStudentBtn = document.getElementById("t-delete-student-btn");
  if (deleteStudentBtn) deleteStudentBtn.addEventListener("click", () => setHidden(s, true));

  detailEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteHistoryEntry(s, Number(btn.dataset.deleteId));
    });
  });

  detailEl.querySelectorAll("[data-decide]").forEach((btn) => {
    btn.addEventListener("click", () => decideRequest(Number(btn.dataset.id), btn.dataset.decide === "approve", btn));
  });

  document.getElementById("t-request-only").addEventListener("change", (e) => {
    saveSettings(s, { requestOnly: e.target.checked });
  });
  document.getElementById("t-always-bounce").addEventListener("change", (e) => {
    saveSettings(s, { alwaysBounce: e.target.checked });
  });
  const bounceToggle = document.getElementById("t-bounce-toggle");
  if (bounceToggle) bounceToggle.addEventListener("change", (e) => setBounce(s, e.target.checked));
  document.querySelectorAll("#t-limit .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.limit === "off" ? null : Number(btn.dataset.limit);
      if (v !== s.dailyLimit) saveSettings(s, { dailyLimit: v });
    });
  });

  tick();
}

function tick() {
  const now = serverTime();

  document.querySelectorAll(".js-status").forEach((el) => {
    const s = studentMap.get(el.dataset.key);
    if (!s) return;
    const st = statusInfo(s, now);
    el.className = `t-student-sub js-status ${st.cls}`;
    el.textContent = st.text;
  });

  const s = studentMap.get(selectedKey);
  if (s && currentView === "students") {
    const statusEl = document.getElementById("t-status");
    if (statusEl) {
      const st = statusInfo(s, now);
      statusEl.className = `t-status ${st.cls}`;
      statusEl.textContent = st.text;
    }

    if (s.active) {
      const remaining = s.active.endTime - now;
      const timeEl = document.getElementById("t-active-time");
      const labelEl = document.getElementById("t-active-label");
      if (timeEl) {
        timeEl.innerHTML = remaining > 0
          ? `${clock(remaining, true)}<small>remaining</small>`
          : `+${clock(-remaining, false)}<small>overtime</small>`;
      }
      if (labelEl) labelEl.textContent = remaining > 0 ? "On a pass to" : "Overtime on a pass to";
    }
  }

  tickHall(now);
}

/* ---------- hall monitor ---------- */

function hallCardMarkup(s, enter) {
  const cat = categoryByKey(s.active.room.categoryKey);
  const from = s.active.from ? ` from ${escapeHtml(s.active.from.name)}` : "";
  const by = s.active.createdBy ? ` · sent by ${escapeHtml(s.active.createdBy)}` : "";
  const msg = s.active.message ? `<div class="h-message">${escapeHtml(s.active.message)}</div>` : "";
  return `
    <div class="h-card ${enter ? "enter" : ""}" data-key="${s.key}" style="--accent:${cat.color}">
      <button type="button" class="h-card-top" data-open="${s.key}">
        ${avatarHtml(s)}
        <span class="h-who">
          <span class="h-name">${escapeHtml(s.name)}</span>
          <span class="h-sub">Left at ${timeOfDay(s.active.startTime)}${from}${by}</span>
        </span>
        <span class="h-dest-icon" style="background:${cat.color}">${roomIconMarkup(s.active.room.name, s.active.room.categoryKey)}</span>
      </button>
      <div class="h-dest">Going to <b>${escapeHtml(s.active.room.name)}</b></div>
      ${msg}
      <div class="h-time js-h-time" data-key="${s.key}"></div>
      <div class="h-bar"><div class="h-bar-fill js-h-bar" data-key="${s.key}"></div></div>
      <button type="button" class="h-bounce-btn ${s.active.bounce ? "active" : ""}" data-bounce="${s.key}">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="2.8" fill="currentColor"/><path d="M12 9.3v3.2m-5.2 7.5 5.2-5 5.2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        ${s.active.bounce ? "Bouncing" : "Bounce"}
      </button>
      <button type="button" class="btn btn-danger-outline h-end" data-end="${s.key}">End pass</button>
    </div>`;
}

function requestCardMarkup(s, enter) {
  const r = s.request;
  const cat = categoryByKey(r.dest.categoryKey);
  const from = r.from ? ` from ${escapeHtml(r.from.name)}` : "";
  return `
    <div class="h-card request ${enter ? "enter" : ""}" data-key="${s.key}" style="--accent:${cat.color}">
      <button type="button" class="h-card-top" data-open="${s.key}">
        ${avatarHtml(s)}
        <span class="h-who">
          <span class="h-name">${escapeHtml(s.name)}</span>
          <span class="h-sub">Asking to leave${from}</span>
        </span>
        <span class="h-dest-icon" style="background:${cat.color}">${roomIconMarkup(r.dest.name, r.dest.categoryKey)}</span>
      </button>
      <div class="h-dest">Wants to go to <b>${escapeHtml(r.dest.name)}</b> · ${r.minutes} min</div>
      <div class="h-actions">
        <button type="button" class="btn btn-danger-outline" data-decide="deny" data-id="${r.id}">Deny</button>
        <button type="button" class="btn btn-primary" data-decide="approve" data-id="${r.id}">Approve</button>
      </div>
    </div>`;
}

function setBadge(el, count, danger) {
  const text = String(count);
  const changed = el.textContent !== text;
  el.textContent = text;
  el.classList.toggle("hidden", count === 0);
  el.classList.toggle("danger", !!danger);
  if (changed && count > 0) popElement(el);
}

function renderHall() {
  const now = serverTime();
  const out = students
    .filter((s) => s.active)
    .sort((a, b) => a.active.endTime - b.active.endTime);
  const requests = students.filter((s) => s.request && !s.active);

  const gridEl = document.getElementById("hall-grid");
  const reqEl = document.getElementById("hall-requests");

  gridEl.innerHTML = out.map((s) => hallCardMarkup(s, !hallShown.has(s.key))).join("");
  hallShown = new Set(out.map((s) => s.key));

  reqEl.innerHTML = requests.map((s) => requestCardMarkup(s, true)).join("");
  document.getElementById("hall-requests-wrap").classList.toggle("hidden", requests.length === 0);
  document.getElementById("hall-req-count").textContent = requests.length;
  document.getElementById("hall-empty").classList.toggle("hidden", out.length > 0);
  document.getElementById("hall-count").textContent = out.length;

  const late = out.filter((s) => s.active.endTime < now).length;
  document.getElementById("hall-sub").textContent = out.length === 0
    ? "Nobody is out right now"
    : `${out.length} out${late ? ` · ${late} overtime` : ""}`;

  setBadge(document.getElementById("hall-badge"), out.length, late > 0);
  setBadge(document.getElementById("req-badge"), requests.length, false);

  hallView.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setView("students");
      selectStudent(btn.dataset.open);
      const row = listEl.querySelector(`.t-student[data-key="${btn.dataset.open}"]`);
      if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
  hallView.querySelectorAll("[data-end]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = studentMap.get(btn.dataset.end);
      if (s) endStudentPass(s);
    });
  });
  hallView.querySelectorAll("[data-bounce]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = studentMap.get(btn.dataset.bounce);
      if (s && s.active) setBounce(s, !s.active.bounce);
    });
  });
  hallView.querySelectorAll("[data-decide]").forEach((btn) => {
    btn.addEventListener("click", () => decideRequest(Number(btn.dataset.id), btn.dataset.decide === "approve", btn));
  });

  tickHall(now);
}

function tickHall(now) {
  document.querySelectorAll(".js-h-time").forEach((el) => {
    const s = studentMap.get(el.dataset.key);
    if (!s || !s.active) return;
    const remaining = s.active.endTime - now;
    const card = el.closest(".h-card");
    const late = remaining <= 0;
    card.classList.toggle("overtime", late);
    el.innerHTML = late
      ? `+${clock(-remaining, false)}<small>overtime</small>`
      : `${clock(remaining, true)}<small>remaining</small>`;

    const total = Math.max(1, s.active.endTime - s.active.startTime);
    const pct = late ? 100 : Math.min(100, Math.max(0, ((now - s.active.startTime) / total) * 100));
    const bar = card.querySelector(".js-h-bar");
    if (bar) bar.style.width = `${pct}%`;
  });
}

/* ---------- actions ---------- */

let lastSignature = "";
let loadingList = false;

async function refresh(force) {
  if (loadingList) return;
  loadingList = true;
  const res = await teacherApi("/api/teacher/students");
  loadingList = false;

  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return;

  const list = res.data.students || [];
  const signature = JSON.stringify(list);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;

  const previousSelected = selectedKey;
  students = list
    .map((s) => ({ ...s, log: s.log || [] }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  studentMap = new Map(students.map((s) => [s.key, s]));
  if (!selectedKey && students.length > 0) selectedKey = students[0].key;
  if (selectedKey && !studentMap.has(selectedKey)) selectedKey = null;

  announceNewRequests();
  renderList();
  renderDetail(selectedKey !== previousSelected);
  renderHall();
}

function announceNewRequests() {
  const ids = new Set(students.filter((s) => s.request).map((s) => s.request.id));
  if (knownRequestIds) {
    students.forEach((s) => {
      if (s.request && !knownRequestIds.has(s.request.id)) {
        showToast(`${s.name} is asking to go to ${s.request.dest.name}`, "info");
      }
    });
  }
  knownRequestIds = ids;
}

async function endStudentPass(s) {
  if (!s.active) return;
  const res = await teacherApi("/api/teacher/pass/end", { key: s.key });
  if (res.status === 401) return kickToSignIn();
  showToast(`Ended ${s.name}'s pass`, "info");
  refresh(true);
}

async function decideRequest(id, approve, btn) {
  if (btn) btn.disabled = true;
  const res = await teacherApi("/api/teacher/request/decide", { id, approve });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) showToast(res.data.error || "Couldn't update that request.", "warn");
  else showToast(approve ? "Request approved. Their pass has started." : "Request denied.", approve ? "success" : "info");
  refresh(true);
}

async function deleteHistoryEntry(s, id) {
  const res = await teacherApi("/api/teacher/pass/delete", { key: s.key, id });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showToast(res.data.error || "Couldn't delete that entry.", "warn");
  s.log = s.log.filter((p) => p.id !== id);
  renderDetail(false);
  refresh(true);
}

async function setBounce(s, bounce) {
  if (!s.active) return;
  s.active.bounce = bounce;
  renderDetail(false);
  renderHall();
  const res = await teacherApi("/api/teacher/pass/bounce", { key: s.key, bounce });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) {
    s.active.bounce = !bounce;
    renderDetail(false);
    renderHall();
    showToast(res.data.error || "Couldn't update that.", "warn");
  }
}

async function saveSettings(s, change) {
  Object.assign(s, change);
  renderDetail(false);
  renderList();
  const res = await teacherApi("/api/teacher/student/settings", { key: s.key, ...change });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) showToast(res.data.error || "Couldn't save that setting.", "warn");
  refresh(true);
}

/* ---------- create pass dialog ---------- */

const modalOverlay = document.getElementById("t-modal-overlay");
const modalSub = document.getElementById("t-modal-sub");
const destModeEl = document.getElementById("t-dest-mode");
const roomModeEl = document.getElementById("t-room-mode");
const roomSearch = document.getElementById("t-room-search");
const roomListEl = document.getElementById("t-room-list");
const customPlaceInput = document.getElementById("t-custom-place");
const durationInput = document.getElementById("t-duration-input");
const durationPresetsEl = document.getElementById("t-duration-presets");
const messageInput = document.getElementById("t-message");
const createBtnModal = document.getElementById("t-modal-create");
let modalStudent = null;
let modalRoom = null;
let destMode = "room";

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60];
durationPresetsEl.innerHTML = DURATION_PRESETS.map((m) => `<button type="button" class="chip-btn" data-minutes="${m}">${m}</button>`).join("");

function markDurationPreset() {
  durationPresetsEl.querySelectorAll("[data-minutes]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.minutes === String(durationInput.value));
  });
}
durationPresetsEl.querySelectorAll("[data-minutes]").forEach((btn) => {
  btn.addEventListener("click", () => {
    durationInput.value = btn.dataset.minutes;
    markDurationPreset();
  });
});
durationInput.addEventListener("input", markDurationPreset);

function setDestMode(mode) {
  destMode = mode;
  destModeEl.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  roomModeEl.classList.toggle("hidden", mode !== "room");
  customPlaceInput.classList.toggle("hidden", mode !== "custom");
  modalRoom = null;
  createBtnModal.disabled = true;
  if (mode === "room") {
    customPlaceInput.value = "";
    renderRooms();
  } else {
    roomSearch.value = "";
    customPlaceInput.focus();
  }
}
destModeEl.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => setDestMode(btn.dataset.mode));
});

customPlaceInput.addEventListener("input", () => {
  const name = customPlaceInput.value.trim();
  if (name) {
    modalRoom = { name, room: "", categoryKey: "custom" };
    createBtnModal.disabled = false;
  } else {
    modalRoom = null;
    createBtnModal.disabled = true;
  }
});

function renderRooms() {
  const term = roomSearch.value.trim().toLowerCase();
  const matches = FLAT_ROOMS.filter((r) => !term || r.name.toLowerCase().includes(term));

  if (matches.length === 0) {
    roomListEl.innerHTML = `<p class="t-no-history" style="text-align:center">No matches</p>`;
    return;
  }

  roomListEl.innerHTML = matches
    .map((r) => {
      const cat = categoryByKey(r.categoryKey);
      const selected = modalRoom && modalRoom.name === r.name ? "selected" : "";
      return `
        <button type="button" class="room-row ${selected}" data-name="${escapeHtml(r.name)}">
          <span class="room-icon" style="background:${cat.color}">${roomIconMarkup(r.name, r.categoryKey)}</span>
          <span class="room-name">${escapeHtml(r.name)}</span>
          <span class="room-code">${escapeHtml(r.room || "—")}</span>
        </button>`;
    })
    .join("");

  roomListEl.querySelectorAll(".room-row").forEach((row) => {
    row.addEventListener("click", () => {
      modalRoom = FLAT_ROOMS.find((r) => r.name === row.dataset.name);
      createBtnModal.disabled = false;
      roomListEl.querySelectorAll(".room-row").forEach((r) => r.classList.toggle("selected", r === row));
    });
  });
}

function openOverlay(overlay) {
  clearTimeout(overlay._timer);
  overlay.classList.remove("closing");
  overlay.classList.remove("hidden");
}

function closeOverlay(overlay) {
  overlay.classList.add("closing");
  clearTimeout(overlay._timer);
  overlay._timer = setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("closing");
  }, 180);
}

function openCreate(s) {
  modalStudent = s;
  modalSub.textContent = `Create a pass for ${s.name}.`;
  roomSearch.value = "";
  messageInput.value = "";
  durationInput.value = 5;
  markDurationPreset();
  setDestMode("room");
  openOverlay(modalOverlay);
  roomSearch.focus();
}

function closeCreate() {
  closeOverlay(modalOverlay);
}

roomSearch.addEventListener("input", renderRooms);
document.getElementById("t-modal-cancel").addEventListener("click", closeCreate);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeCreate();
});

createBtnModal.addEventListener("click", async () => {
  if (!modalStudent || !modalRoom) return;
  const minutes = parseInt(durationInput.value, 10);
  if (!Number.isFinite(minutes) || minutes < 1) return showToast("Enter a time of at least 1 minute.", "warn");
  createBtnModal.disabled = true;
  const res = await teacherApi("/api/teacher/pass", {
    key: modalStudent.key,
    dest: { name: modalRoom.name, room: modalRoom.room, categoryKey: modalRoom.categoryKey },
    minutes,
    message: messageInput.value.trim(),
  });
  if (res.status === 401) return kickToSignIn();
  closeCreate();
  if (!res.ok) showToast(res.data.error || "Couldn't create that pass.", "warn");
  else showToast(`Pass created for ${modalStudent.name}`, "success");
  refresh(true);
});

/* ---------- add a class ---------- */

const classOverlay = document.getElementById("class-overlay");
const classNameInput = document.getElementById("class-name");
const classRoomInput = document.getElementById("class-room");
const classLogoPreview = document.getElementById("class-logo-preview");
const classPresetsEl = document.getElementById("class-logo-presets");
const classError = document.getElementById("class-error");
const classSave = document.getElementById("class-save");
const classFile = document.getElementById("class-logo-file");
let classLogo = null;

function classLogoIconMarkup(value) {
  if (value && value.startsWith("preset:")) {
    const cat = CATEGORIES.find((c) => c.key === value.slice(7));
    return cat ? categoryIconMarkup(cat) : "";
  }
  if (value) return `<img src="${value}" alt="">`;
  return categoryIconMarkup(categoryByKey("classrooms"));
}

function renderClassPresets() {
  const options = CATEGORIES.filter((c) => c.key !== "classrooms");
  classPresetsEl.innerHTML = options
    .map(
      (c) =>
        `<button type="button" class="preset class-preset" data-logo="preset:${c.key}" style="background:${c.color}" aria-label="${escapeHtml(c.label)} icon">${categoryIconMarkup(c)}</button>`
    )
    .join("");
  classPresetsEl.querySelectorAll(".class-preset").forEach((b) => {
    b.addEventListener("click", () => setClassLogo(b.dataset.logo));
  });
}

function setClassLogo(value) {
  classLogo = value;
  const isImage = value && !value.startsWith("preset:");
  classLogoPreview.style.backgroundImage = isImage ? `url("${value}")` : "";
  classLogoPreview.classList.toggle("has-photo", !!isImage);
  const cat = value && value.startsWith("preset:") ? CATEGORIES.find((c) => c.key === value.slice(7)) : categoryByKey("classrooms");
  classLogoPreview.style.backgroundColor = isImage ? "" : cat.color;
  classLogoPreview.innerHTML = isImage ? "" : classLogoIconMarkup(value);
  classPresetsEl.querySelectorAll(".class-preset").forEach((b) => {
    b.classList.toggle("selected", b.dataset.logo === value);
  });
}

function classIconColor(c) {
  if (c.logo && c.logo.startsWith("preset:")) {
    const cat = CATEGORIES.find((x) => x.key === c.logo.slice(7));
    if (cat) return cat.color;
  }
  return categoryByKey("classrooms").color;
}

function renderClassSettings() {
  const listEl = document.getElementById("settings-class-list");
  const emptyEl = document.getElementById("settings-class-empty");
  const sorted = customClasses.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  emptyEl.classList.toggle("hidden", sorted.length > 0);
  listEl.innerHTML = sorted
    .map(
      (c) => `
      <div class="t-class-card">
        <span class="t-class-icon" style="background:${classIconColor(c)}">${classLogoIconMarkup(c.logo)}</span>
        <div class="t-class-info">
          <div class="t-class-name">${escapeHtml(c.name)}</div>
          <div class="t-class-room">${c.room ? escapeHtml(c.room) : "No room set"}</div>
        </div>
        <span class="t-class-actions">
          <button type="button" class="t-class-edit-btn" data-edit-id="${c.id}" title="Edit ${escapeHtml(c.name)}" aria-label="Edit ${escapeHtml(c.name)}">
            <svg viewBox="0 0 24 24"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="t-delete-btn" data-delete-class-id="${c.id}" title="Delete ${escapeHtml(c.name)}" aria-label="Delete ${escapeHtml(c.name)}">
            <svg viewBox="0 0 24 24"><path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </span>
      </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = customClasses.find((x) => String(x.id) === btn.dataset.editId);
      if (c) openClassDialog(c);
    });
  });
  listEl.querySelectorAll("[data-delete-class-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = customClasses.find((x) => String(x.id) === btn.dataset.deleteClassId);
      if (c) deleteClass(c);
    });
  });
}

async function deleteClass(c) {
  customClasses = customClasses.filter((x) => x.id !== c.id);
  applyCustomClasses(customClasses);
  renderClassSettings();
  const res = await teacherApi("/api/teacher/class/delete", { id: c.id });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) {
    customClasses.push(c);
    applyCustomClasses(customClasses);
    renderClassSettings();
    return showToast(res.data.error || "Couldn't delete that class.", "warn");
  }
  showToast(`Removed ${c.name}`, "info", {
    label: "Undo",
    onClick: async () => {
      const r = await teacherApi("/api/teacher/class", { name: c.name, room: c.room, logo: c.logo });
      if (!r.ok) return showToast(r.data.error || "Couldn't bring that class back.", "warn");
      customClasses.push({ ...c, id: r.data.id });
      applyCustomClasses(customClasses);
      renderClassSettings();
    },
  });
}

let editingClassId = null;

function openClassDialog(existing) {
  editingClassId = existing ? existing.id : null;
  document.getElementById("class-title").textContent = existing ? "Edit class" : "Add a class";
  classSave.textContent = existing ? "Save changes" : "Add class";
  classNameInput.value = existing ? existing.name : "";
  classRoomInput.value = existing ? existing.room || "" : "";
  classError.classList.add("hidden");
  classSave.disabled = !existing;
  renderClassPresets();
  setClassLogo(existing ? existing.logo || null : null);
  openOverlay(classOverlay);
  classNameInput.focus();
}

document.getElementById("settings-add-class-btn").addEventListener("click", () => openClassDialog());
document.getElementById("class-cancel").addEventListener("click", () => closeOverlay(classOverlay));
classOverlay.addEventListener("click", (e) => {
  if (e.target === classOverlay) closeOverlay(classOverlay);
});
classNameInput.addEventListener("input", () => {
  classSave.disabled = classNameInput.value.trim().length === 0;
});

document.getElementById("class-logo-upload-btn").addEventListener("click", () => classFile.click());
classFile.addEventListener("change", async () => {
  const file = classFile.files && classFile.files[0];
  classFile.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    classError.textContent = "Please choose an image file.";
    return classError.classList.remove("hidden");
  }
  try {
    setClassLogo(await fileToAvatar(file));
  } catch {
    classError.textContent = "That image couldn't be read. Try a different one.";
    classError.classList.remove("hidden");
  }
});

classSave.addEventListener("click", async () => {
  const name = classNameInput.value.trim();
  const room = classRoomInput.value.trim();
  if (!name) return;
  classSave.disabled = true;
  const isEdit = editingClassId !== null;
  const res = await teacherApi(isEdit ? "/api/teacher/class/update" : "/api/teacher/class", {
    ...(isEdit ? { id: editingClassId } : {}),
    name,
    room,
    logo: classLogo,
  });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) {
    classError.textContent = res.data.error || "Couldn't save that class.";
    classError.classList.remove("hidden");
    classSave.disabled = false;
    return;
  }
  if (isEdit) {
    const existing = customClasses.find((c) => c.id === editingClassId);
    if (existing) Object.assign(existing, { name, room, logo: classLogo });
  } else {
    customClasses.push({ id: res.data.id, name, room, logo: classLogo });
  }
  applyCustomClasses(customClasses);
  renderClassSettings();
  closeOverlay(classOverlay);
  showToast(isEdit ? `Saved changes to ${name}` : `Added ${name} to Classrooms`, "success");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !classOverlay.classList.contains("hidden")) closeOverlay(classOverlay);
});

/* ---------- profile photos ---------- */

const PRESETS = [
  ["🦊", "#f2994a"], ["🐼", "#8fa1b5"], ["🐸", "#1ed17a"], ["🦁", "#f2b544"],
  ["🐙", "#b21cc4"], ["🦄", "#7b68ee"], ["🐢", "#14a3a1"], ["🚀", "#2599d6"],
  ["⚽", "#4b5261"], ["🎸", "#fb6d4c"], ["🌟", "#e2574c"], ["🐶", "#a1887f"],
];
const PHOTO_SIZE = 112;

const photoOverlay = document.getElementById("photo-overlay");
const photoPreview = document.getElementById("photo-preview");
const photoSave = document.getElementById("photo-save");
const photoError = document.getElementById("photo-error");
const photoFile = document.getElementById("photo-file");
let photoTarget = null;
let photoPending; // undefined = unchanged, null = remove, string = new photo
let presetUrls = null;

function presetDataUrl([emoji, color]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const g = canvas.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  g.font = `${Math.round(PHOTO_SIZE * 0.58)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, PHOTO_SIZE / 2, PHOTO_SIZE / 2 + 4);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PHOTO_SIZE;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

function currentPhotoFor(target) {
  if (target.type === "me") return teacherPhoto;
  const s = studentMap.get(target.key);
  return s ? s.photo : null;
}

function showPhotoPreview(photo) {
  photoPreview.style.backgroundImage = photo ? `url("${photo}")` : "";
  photoPreview.classList.toggle("has-photo", !!photo);
  photoPreview.style.backgroundColor = photo ? "" : "#c3c9d6";
  const label = photoTarget.type === "me" ? teacherName : photoTarget.name;
  photoPreview.textContent = photo ? "" : label.charAt(0).toUpperCase();
}

function setPendingPhoto(value) {
  photoPending = value;
  photoError.classList.add("hidden");
  showPhotoPreview(value === undefined ? currentPhotoFor(photoTarget) : value);
  photoSave.disabled = value === undefined;
  document.querySelectorAll("#photo-presets .preset").forEach((b) => {
    b.classList.toggle("selected", typeof value === "string" && b.dataset.url === value);
  });
}

function openPhotoDialog(target) {
  photoTarget = target;
  document.getElementById("photo-sub").textContent =
    target.type === "me" ? "This is what students see next to your name." : `Choose a photo for ${target.name}.`;

  if (!presetUrls) presetUrls = PRESETS.map(presetDataUrl);
  document.getElementById("photo-presets").innerHTML = presetUrls
    .map((url, i) => `<button type="button" class="preset" data-url="${url}" style="background-image:url('${url}')" aria-label="Choose image ${i + 1}"></button>`)
    .join("");
  document.querySelectorAll("#photo-presets .preset").forEach((b) => {
    b.addEventListener("click", () => setPendingPhoto(b.dataset.url));
  });

  setPendingPhoto(undefined);
  openOverlay(photoOverlay);
}

document.getElementById("photo-upload-btn").addEventListener("click", () => photoFile.click());
photoFile.addEventListener("change", async () => {
  const file = photoFile.files && photoFile.files[0];
  photoFile.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    photoError.textContent = "Please choose an image file.";
    return photoError.classList.remove("hidden");
  }
  try {
    setPendingPhoto(await fileToAvatar(file));
  } catch {
    photoError.textContent = "That image couldn't be read. Try a different one.";
    photoError.classList.remove("hidden");
  }
});
document.getElementById("photo-remove-btn").addEventListener("click", () => setPendingPhoto(null));
document.getElementById("photo-cancel").addEventListener("click", () => closeOverlay(photoOverlay));
photoOverlay.addEventListener("click", (e) => {
  if (e.target === photoOverlay) closeOverlay(photoOverlay);
});

photoSave.addEventListener("click", async () => {
  if (photoPending === undefined || !photoTarget) return;
  photoSave.disabled = true;
  const isMe = photoTarget.type === "me";
  const res = await teacherApi(isMe ? "/api/teacher/photo" : "/api/teacher/student/photo", {
    ...(isMe ? {} : { key: photoTarget.key }),
    photo: photoPending,
  });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) {
    photoError.textContent = res.data.error || "Couldn't save that photo.";
    photoError.classList.remove("hidden");
    photoSave.disabled = false;
    return;
  }
  if (isMe) {
    teacherPhoto = photoPending;
    applyTeacherPhoto();
  }
  closeOverlay(photoOverlay);
  showToast("Photo updated", "success");
  refresh(true);
});

function applyTeacherPhoto() {
  applyPhoto(document.getElementById("avatar-btn"), teacherPhoto);
  applyPhoto(document.getElementById("teacher-avatar-preview"), teacherPhoto);
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!photoOverlay.classList.contains("hidden")) closeOverlay(photoOverlay);
  else if (!modalOverlay.classList.contains("hidden")) closeCreate();
});

/* ---------- account menu ---------- */

const avatarBtn = document.getElementById("avatar-btn");
const avatarMenu = document.getElementById("avatar-menu");

avatarBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  avatarMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!avatarMenu.classList.contains("hidden") && !avatarMenu.contains(e.target) && e.target !== avatarBtn) {
    avatarMenu.classList.add("hidden");
  }
});

document.getElementById("change-photo-btn").addEventListener("click", () => {
  avatarMenu.classList.add("hidden");
  openPhotoDialog({ type: "me" });
});

document.getElementById("sign-out-btn").addEventListener("click", () => {
  teacherApi("/api/teacher/logout", {});
  localStorage.removeItem("smartpass_role");
  localStorage.removeItem("smartpass_name");
  localStorage.removeItem("smartpass_school");
  localStorage.removeItem("smartpass_teacher_token");
  document.body.classList.add("fade-out");
  setTimeout(() => {
    window.location.href = "/teacher-signin";
  }, 400);
});

/* ---------- start ---------- */

searchEl.addEventListener("input", renderList);
window.addEventListener("focus", () => refresh());
window.addEventListener("hashchange", () => setView(location.hash.slice(1)));

(async () => {
  const me = await teacherApi("/api/teacher/me");
  if (me.status === 401) return kickToSignIn();
  if (me.ok) {
    teacherPhoto = me.data.photo || null;
    applyTeacherPhoto();
  }
})();

(async () => {
  const res = await apiFetch("/api/classes");
  if (res.ok) {
    customClasses = res.data.classes || [];
    applyCustomClasses(customClasses);
    if (currentView === "settings") renderClassSettings();
  }
})();

setView(location.hash.slice(1));
refresh(true);
setInterval(() => refresh(), 3000);
setInterval(tick, 1000);
