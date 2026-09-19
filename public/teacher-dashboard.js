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

const listEl = document.getElementById("t-student-list");
const emptyEl = document.getElementById("t-empty");
const countEl = document.getElementById("t-count");
const searchEl = document.getElementById("t-search");
const detailEl = document.getElementById("t-detail");

let students = [];
let studentMap = new Map();
let selectedKey = null;

/* ---------- helpers ---------- */

function categoryByKey(key) {
  return CATEGORIES.find((c) => c.key === key);
}

function titleCase(text) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function avatarColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
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

/* ---------- data ---------- */

function statusInfo(s, now) {
  if (!s.active) {
    const n = s.log.length;
    return { cls: "", text: `In class · ${n} pass${n === 1 ? "" : "es"}` };
  }
  const remaining = s.active.endTime - now;
  if (remaining > 0) {
    return { cls: "on-pass", text: `On a pass · ${s.active.room.name} · ${clock(remaining, true)} left` };
  }
  return { cls: "overtime", text: `Overtime · ${s.active.room.name} · +${clock(-remaining, false)}` };
}

/* ---------- student list ---------- */

function renderList() {
  const term = searchEl.value.trim().toLowerCase();
  const shown = students.filter((s) => !term || s.name.toLowerCase().includes(term));
  const now = serverTime();

  countEl.textContent = students.length;
  emptyEl.classList.toggle("hidden", students.length > 0);

  listEl.innerHTML = shown
    .map((s) => {
      const st = statusInfo(s, now);
      return `
        <button type="button" class="t-student ${s.key === selectedKey ? "selected" : ""}" data-key="${s.key}">
          <span class="t-avatar" style="background:${avatarColor(s.name)}">${escapeHtml(s.name.charAt(0).toUpperCase())}</span>
          <span class="t-student-info">
            <span class="t-student-name">${escapeHtml(s.name)}</span>
            <span class="t-student-sub js-status ${st.cls}" data-key="${s.key}">${escapeHtml(st.text)}</span>
          </span>
        </button>`;
    })
    .join("");

  listEl.querySelectorAll(".t-student").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedKey = btn.dataset.key;
      renderList();
      renderDetail();
    });
  });
}

/* ---------- student detail ---------- */

function renderDetail() {
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
    const cat = categoryByKey(s.active.room.categoryKey) || CATEGORIES[0];
    activeBlock = `
      <div class="t-active" style="background:linear-gradient(135deg, ${cat.color}, ${shade(cat.color, -45)})">
        <span class="t-active-icon">${categoryIconMarkup(cat)}</span>
        <div class="t-active-info">
          <div class="t-active-label" id="t-active-label">On a pass to</div>
          <div class="t-active-name">${escapeHtml(s.active.room.name)}</div>
        </div>
        <div class="t-active-time" id="t-active-time"></div>
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
        const cat = categoryByKey(p.categoryKey) || CATEGORIES[0];
        const tag = p.overtime ? ' · <span class="notif-overtime-tag">Overtime</span>' : "";
        return `${heading}
          <div class="notif-item" style="--i:${Math.min(i, 12)}">
            <span class="notif-icon" style="background:${cat.color}">${categoryIconMarkup(cat)}</span>
            <div class="notif-info">
              <span class="notif-name">${escapeHtml(p.name)}</span>
              <span class="notif-meta">${timeOfDay(p.startTime)} · ${formatDuration(p.endTime - p.startTime)}${tag}</span>
            </div>
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
    <div class="t-detail-head">
      <span class="t-avatar" style="background:${avatarColor(s.name)}">${escapeHtml(s.name.charAt(0).toUpperCase())}</span>
      <div class="t-detail-title">
        <h2>${escapeHtml(s.name)}</h2>
        <div class="t-status" id="t-status"></div>
      </div>
      <div class="t-actions">${actions}</div>
    </div>

    <div class="notif-stats">
      <div class="notif-stat"><span class="notif-stat-value">${total}</span><span class="notif-stat-label">Passes</span></div>
      <div class="notif-stat"><span class="notif-stat-value">${overtime}</span><span class="notif-stat-label">Overtime Passes</span></div>
      <div class="notif-stat"><span class="notif-stat-value">${total ? formatDuration(avg) : "—"}</span><span class="notif-stat-label">Average Time</span></div>
    </div>

    ${activeBlock}

    <h3 class="t-history-title">Where ${escapeHtml(s.name)} has been</h3>
    ${historyHtml}`;

  const createBtn = document.getElementById("t-create-btn");
  if (createBtn) createBtn.addEventListener("click", () => openCreate(s));
  const endBtn = document.getElementById("t-end-btn");
  if (endBtn) endBtn.addEventListener("click", () => endStudentPass(s));

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
  if (!s) return;

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

  students = list
    .map((s) => ({ ...s, log: s.log || [] }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  studentMap = new Map(students.map((s) => [s.key, s]));
  if (!selectedKey && students.length > 0) selectedKey = students[0].key;
  if (selectedKey && !studentMap.has(selectedKey)) selectedKey = null;
  renderList();
  renderDetail();
}

async function endStudentPass(s) {
  if (!s.active) return;
  const res = await teacherApi("/api/teacher/pass/end", { key: s.key });
  if (res.status === 401) return kickToSignIn();
  refresh(true);
}

/* ---------- create pass dialog ---------- */

const modalOverlay = document.getElementById("t-modal-overlay");
const modalSub = document.getElementById("t-modal-sub");
const roomSearch = document.getElementById("t-room-search");
const roomListEl = document.getElementById("t-room-list");
const slider = document.getElementById("t-duration-slider");
const durationValue = document.getElementById("t-duration-value");
const createBtnModal = document.getElementById("t-modal-create");
let modalStudent = null;
let modalRoom = null;
let modalTimer = null;

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
          <span class="room-icon" style="background:${cat.color}">${categoryIconMarkup(cat)}</span>
          <span class="room-name">${escapeHtml(r.name)}</span>
          <span class="room-code">${escapeHtml(r.room || "—")}</span>
        </button>`;
    })
    .join("");

  roomListEl.querySelectorAll(".room-row").forEach((row) => {
    row.addEventListener("click", () => {
      modalRoom = FLAT_ROOMS.find((r) => r.name === row.dataset.name);
      createBtnModal.disabled = false;
      renderRooms();
    });
  });
}

function updateDuration() {
  durationValue.textContent = `${slider.value} min`;
}

function openCreate(s) {
  modalStudent = s;
  modalRoom = null;
  modalSub.textContent = `Create a pass for ${s.name}.`; // textContent: safe
  roomSearch.value = "";
  slider.value = 5;
  updateDuration();
  createBtnModal.disabled = true;
  renderRooms();
  clearTimeout(modalTimer);
  modalOverlay.classList.remove("closing");
  modalOverlay.classList.remove("hidden");
  roomSearch.focus();
}

function closeCreate() {
  modalOverlay.classList.add("closing");
  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => {
    modalOverlay.classList.add("hidden");
    modalOverlay.classList.remove("closing");
  }, 180);
}

roomSearch.addEventListener("input", renderRooms);
slider.addEventListener("input", updateDuration);
document.getElementById("t-modal-cancel").addEventListener("click", closeCreate);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeCreate();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeCreate();
});

createBtnModal.addEventListener("click", async () => {
  if (!modalStudent || !modalRoom) return;
  createBtnModal.disabled = true;
  const res = await teacherApi("/api/teacher/pass", {
    key: modalStudent.key,
    dest: { name: modalRoom.name, room: modalRoom.room, categoryKey: modalRoom.categoryKey },
    minutes: parseInt(slider.value, 10),
  });
  if (res.status === 401) return kickToSignIn();
  closeCreate();
  refresh(true);
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

refresh(true);
setInterval(() => refresh(), 3000);
setInterval(tick, 1000);
