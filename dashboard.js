requestAnimationFrame(() => document.body.classList.add("loaded"));

const name = localStorage.getItem("smartpass_name") || "there";
document.getElementById("user-name").textContent = name.toUpperCase();

function userKey(base) {
  return `${base}__${name.trim().toLowerCase()}`;
}

/* Avatar menu: profile color + sign out */

const AVATAR_COLORS = ["#9aa2af", "#1ed17a", "#2599d6", "#7b68ee", "#fb6d4c", "#f2994a", "#b21cc4", "#14a3a1"];

const avatarBtn = document.getElementById("avatar-btn");
const avatarMenu = document.getElementById("avatar-menu");
const avatarColorGrid = document.getElementById("avatar-color-grid");
const navAvatars = document.querySelectorAll(".avatar");

document.getElementById("avatar-menu-name").textContent = name.toUpperCase();

function applyAvatarColor(color) {
  navAvatars.forEach((el) => {
    el.style.background = color;
  });
}

function renderAvatarColors() {
  const current = localStorage.getItem(userKey("smartpass_avatar_color")) || AVATAR_COLORS[0];
  avatarColorGrid.innerHTML = AVATAR_COLORS.map((c) => {
    const selected = c === current ? "selected" : "";
    const check = c === current
      ? '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : "";
    return `<button type="button" class="avatar-color-swatch ${selected}" style="background:${c}" data-color="${c}">${check}</button>`;
  }).join("");

  avatarColorGrid.querySelectorAll(".avatar-color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.color;
      localStorage.setItem(userKey("smartpass_avatar_color"), color);
      applyAvatarColor(color);
      renderAvatarColors();
    });
  });
}

applyAvatarColor(localStorage.getItem(userKey("smartpass_avatar_color")) || AVATAR_COLORS[0]);
renderAvatarColors();

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
  localStorage.removeItem(userKey("smartpass_active_pass"));
  localStorage.removeItem("smartpass_name");
  localStorage.removeItem("smartpass_school");
  document.body.classList.add("fade-out");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 400);
});

function updateDateTime() {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  const day = now.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  document.getElementById("datetime").textContent =
    `${weekday}, ${month} ${day}${suffix} · ${time}`.toUpperCase();
}

updateDateTime();
setInterval(updateDateTime, 30000);

/* Browser notifications */

const notice = document.getElementById("notice");

function sendBrowserNotification(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "favicon.svg" });
}

function updateNoticeVisibility() {
  if (typeof Notification === "undefined" || Notification.permission === "granted") {
    notice.classList.add("hidden");
  } else {
    notice.classList.remove("hidden");
  }
}

updateNoticeVisibility();

notice.addEventListener("click", () => {
  if (typeof Notification === "undefined") return;
  Notification.requestPermission().then((permission) => {
    updateNoticeVisibility();
    if (permission === "granted") {
      sendBrowserNotification("SmartPass", "Notifications are turned on.");
    }
  });
});

document.getElementById("notice-close").addEventListener("click", (e) => {
  e.stopPropagation();
  notice.classList.add("hidden");
});

/* Create Pass modal */

const overlay = document.getElementById("pass-modal-overlay");
const roomList = document.getElementById("modal-room-list");
const comingFromField = document.getElementById("coming-from-field");
const comingFromInput = document.getElementById("coming-from");
const goingToField = document.getElementById("going-to-field");
const goingToInput = document.getElementById("going-to");
const listTitle = document.getElementById("modal-list-title");
const modalBack = document.getElementById("modal-back");
const pickerView = document.getElementById("picker-view");
const durationView = document.getElementById("duration-view");
const durationBack = document.getElementById("duration-back");
const durationDestIcon = document.getElementById("duration-dest-icon");
const durationDestName = document.getElementById("duration-dest-name");
const durationFrom = document.getElementById("duration-from");
const durationSlider = document.getElementById("duration-slider");
const durationValue = document.getElementById("duration-value");
const startPassBtn = document.getElementById("start-pass-btn");

let activeField = "comingFrom";
let currentCategory = null;
let comingFromRoom = null;
let goingToRoom = null;

function categoryByKey(key) {
  return CATEGORIES.find((c) => c.key === key);
}

function setActiveField(field) {
  activeField = field;
  comingFromField.classList.toggle("active", field === "comingFrom");
  goingToField.classList.toggle("active", field === "goingTo");
}

function currentSelection() {
  return activeField === "comingFrom" ? comingFromRoom : goingToRoom;
}

function roomRowMarkup(r, extraClass) {
  const category = categoryByKey(r.categoryKey);
  const selected = currentSelection();
  const isSelected = selected && selected.name === r.name ? "selected" : "";
  return `
        <button type="button" class="room-row ${isSelected} ${extraClass || ""}" data-name="${r.name}">
          <span class="room-icon" style="background:${category.color}">${categoryIconMarkup(category)}</span>
          <span class="room-name">${r.name}</span>
          <span class="room-code">
            <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            ${r.room || "—"}
          </span>
        </button>`;
}

function recommendedRooms(from) {
  if (!from) return [];
  const firstDigit = /^[123]/.exec(from.room || "");
  let prefix = null;
  if (firstDigit) prefix = `${firstDigit[0]}00's`;
  else if (from.categoryKey === "mainOffice" || from.categoryKey === "admins") prefix = "Office";
  if (!prefix) return [];

  return [
    ["restrooms", "Restroom"],
    ["waterFountain", "Fountain"],
  ]
    .map(([key, word]) => {
      const match = categoryByKey(key).rooms.find((room) => room.name === `${prefix} ${word}`);
      return match ? { name: match.name, room: match.room, categoryKey: key } : null;
    })
    .filter(Boolean);
}

function renderCategoryGrid(categories, recommended = []) {
  if (categories.length === 0) {
    roomList.innerHTML = `<div class="no-results">No matches</div>`;
    return;
  }

  const recMarkup = recommended.length
    ? `<div class="rec-block">${recommended.map((r) => roomRowMarkup(r, "recommended")).join("")}</div><h3 class="modal-list-title rec-sub">All Rooms</h3>`
    : "";

  roomList.innerHTML = `${recMarkup}<div class="category-grid">${categories
    .map((c, idx) => {
      const chevron = c.leaf
        ? ""
        : '<svg class="category-tile-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return `
        <button type="button" class="category-tile" style="background:${c.color}; --i:${idx}" data-key="${c.key}">
          <span class="category-tile-icon">${categoryIconMarkup(c)}</span>
          <span class="category-tile-footer">
            <span class="category-tile-label">${c.label}</span>
            ${chevron}
          </span>
        </button>`;
    })
    .join("")}</div>`;

  roomList.querySelectorAll(".room-row.recommended").forEach((row) => {
    row.addEventListener("click", () => selectRoom(recommended.find((r) => r.name === row.dataset.name)));
  });

  roomList.querySelectorAll(".category-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const cat = categoryByKey(tile.dataset.key);
      if (cat.leaf) {
        selectRoom({ name: cat.leaf.name, room: cat.leaf.room, categoryKey: cat.key });
      } else {
        currentCategory = cat;
        renderPicker("");
      }
    });
  });
}

function renderFlatList(rooms) {
  if (rooms.length === 0) {
    roomList.innerHTML = `<div class="no-results">No matches</div>`;
    return;
  }

  roomList.innerHTML = rooms.map((r) => roomRowMarkup(r)).join("");

  roomList.querySelectorAll(".room-row").forEach((row) => {
    row.addEventListener("click", () => {
      const room = rooms.find((r) => r.name === row.dataset.name);
      selectRoom(room);
    });
  });
}

const DESTINATION_ONLY = ["restrooms", "waterFountain"];

function searchableRooms() {
  return activeField === "comingFrom"
    ? FLAT_ROOMS.filter((r) => !DESTINATION_ONLY.includes(r.categoryKey))
    : FLAT_ROOMS;
}

function renderPicker(filterText) {
  const term = filterText.trim().toLowerCase();

  if (term) {
    modalBack.classList.add("hidden");
    listTitle.textContent = "Results";
    const matches = searchableRooms().filter((r) => r.name.toLowerCase().includes(term));
    renderFlatList(matches);
    return;
  }

  if (activeField === "comingFrom") {
    modalBack.classList.add("hidden");
    listTitle.textContent = "All Rooms";
    renderFlatList(searchableRooms());
    return;
  }

  if (currentCategory) {
    modalBack.classList.remove("hidden");
    listTitle.textContent = currentCategory.label;
    if (currentCategory.rooms.length === 0) {
      roomList.innerHTML = `<div class="no-rooms-yet">More rooms coming soon</div>`;
      return;
    }
    const rooms = currentCategory.rooms.map((r) => ({
      name: r.name,
      room: r.room,
      categoryKey: currentCategory.key,
    }));
    renderFlatList(rooms);
  } else {
    modalBack.classList.add("hidden");
    const recommended = recommendedRooms(comingFromRoom);
    listTitle.textContent = recommended.length ? "Recommended" : "All Rooms";
    renderCategoryGrid(CATEGORIES, recommended);
  }
}

function selectRoom(room) {
  if (activeField === "comingFrom") {
    comingFromRoom = room;
    comingFromInput.value = room.name;
    currentCategory = null;
    setActiveField("goingTo");
    renderPicker("");
    goingToInput.focus();
  } else {
    goingToRoom = room;
    goingToInput.value = room.name;
    currentCategory = null;
    showDurationView(room);
  }
}

function showPickerView() {
  durationView.classList.add("hidden");
  pickerView.classList.remove("hidden");
}

function updateDurationValueText() {
  durationValue.textContent = `${durationSlider.value} min`;
}

function showDurationView(room) {
  const category = categoryByKey(room.categoryKey);
  pickerView.classList.add("hidden");
  durationView.classList.remove("hidden");
  durationDestIcon.style.background = category.color;
  durationDestIcon.innerHTML = categoryIconMarkup(category);
  durationDestName.textContent = room.name;
  durationFrom.textContent = comingFromRoom ? comingFromRoom.name : "—";
  durationSlider.value = 5;
  updateDurationValueText();
}

durationSlider.addEventListener("input", updateDurationValueText);

durationBack.addEventListener("click", () => {
  goingToRoom = null;
  showPickerView();
  renderPicker("");
});

function openModal() {
  activeField = "comingFrom";
  currentCategory = null;
  comingFromRoom = null;
  goingToRoom = null;
  comingFromInput.value = "";
  goingToInput.value = "";
  showPickerView();
  setActiveField("comingFrom");
  renderPicker("");
  clearTimeout(closeTimer);
  overlay.classList.remove("closing");
  overlay.classList.remove("hidden");
  comingFromInput.focus();
}

let closeTimer = null;

function closeModal() {
  overlay.classList.add("closing");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("closing");
  }, 160);
}

document.getElementById("create-pass-nav-btn").addEventListener("click", openModal);
document.getElementById("create-pass-hero-btn").addEventListener("click", openModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});

modalBack.addEventListener("click", () => {
  currentCategory = null;
  renderPicker("");
});

comingFromField.addEventListener("click", () => comingFromInput.focus());
goingToField.addEventListener("click", () => goingToInput.focus());

comingFromInput.addEventListener("focus", () => {
  setActiveField("comingFrom");
  currentCategory = null;
  renderPicker("");
  comingFromInput.select();
});

goingToInput.addEventListener("focus", () => {
  setActiveField("goingTo");
  currentCategory = null;
  renderPicker("");
  goingToInput.select();
});

comingFromInput.addEventListener("input", () => renderPicker(comingFromInput.value));
goingToInput.addEventListener("input", () => renderPicker(goingToInput.value));

/* Active pass state */

const goingSomewhere = document.getElementById("going-somewhere");
const activePass = document.getElementById("active-pass");
const passCard = document.getElementById("pass-card");
const activePassDestination = document.getElementById("active-pass-destination");
const activePassFrom = document.getElementById("active-pass-from");
const activePassTimer = document.getElementById("active-pass-timer");
const createPassNavBtn = document.getElementById("create-pass-nav-btn");
const overtimePill = document.getElementById("pass-overtime-pill");

let timerInterval = null;

const OVERTIME_BG = "linear-gradient(160deg, #7a1f3d, #4a1226)";
const OVERTIME_CARD = "linear-gradient(160deg, #e0466f, #c22a56)";

function formatRemaining(endTime) {
  const totalSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatOvertime(endTime) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - endTime) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shadeColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function enterOvertime() {
  activePass.classList.add("overtime");
  overtimePill.classList.remove("hidden");
  activePass.style.background = OVERTIME_BG;
  passCard.style.background = OVERTIME_CARD;
  sendBrowserNotification(
    "You're overtime",
    currentPass ? `Your pass to ${currentPass.room.name} has gone overtime.` : "Your pass has gone overtime."
  );
}

const ringProgress = document.getElementById("pass-ring-progress");
const RING_CIRCUMFERENCE = 2 * Math.PI * 96;
ringProgress.style.strokeDasharray = RING_CIRCUMFERENCE;

function updateRing() {
  const total = currentPass.endTime - currentPass.startTime;
  const fraction = total > 0 ? Math.max(0, Math.min(1, (currentPass.endTime - Date.now()) / total)) : 0;
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
  ringProgress.style.opacity = fraction > 0 ? 1 : 0;
}

function updateActivePassTimer(endTime) {
  updateRing();
  const remaining = endTime - Date.now();
  if (remaining <= 0) {
    if (!activePass.classList.contains("overtime")) enterOvertime();
    activePassTimer.textContent = formatOvertime(endTime);
  } else {
    activePassTimer.textContent = formatRemaining(endTime);
  }
}

let currentPass = null;

function startActivePass(room, endTime, fromRoom, startTime) {
  goingSomewhere.classList.add("hidden");
  activePass.classList.remove("hidden");
  createPassNavBtn.disabled = true;
  createPassNavBtn.style.opacity = "0.5";
  createPassNavBtn.style.cursor = "not-allowed";

  activePass.classList.remove("overtime");
  overtimePill.classList.add("hidden");

  currentPass = { room, endTime, startTime: startTime || Date.now() };

  const category = categoryByKey(room.categoryKey);
  activePass.style.background = `linear-gradient(160deg, ${shadeColor(category.color, -110)}, ${shadeColor(category.color, -155)})`;
  passCard.style.background = `linear-gradient(160deg, ${shadeColor(category.color, 25)}, ${shadeColor(category.color, -20)})`;
  activePassDestination.textContent = room.name;
  activePassFrom.textContent = fromRoom ? fromRoom.name : "—";

  updateActivePassTimer(endTime);
  clearInterval(timerInterval);
  timerInterval = setInterval(() => updateActivePassTimer(endTime), 1000);
}

function endActivePass() {
  clearInterval(timerInterval);
  localStorage.removeItem(userKey("smartpass_active_pass"));
  activePass.classList.add("hidden");
  goingSomewhere.classList.remove("hidden");
  createPassNavBtn.disabled = false;
  createPassNavBtn.style.opacity = "";
  createPassNavBtn.style.cursor = "";

  if (currentPass) {
    const finishedAt = Date.now();
    recordPassCompleted({
      name: currentPass.room.name,
      categoryKey: currentPass.room.categoryKey,
      startTime: currentPass.startTime,
      endTime: finishedAt,
      overtime: finishedAt > currentPass.endTime,
    });
    sendBrowserNotification("Pass ended", `You ended your pass to ${currentPass.room.name}.`);
    currentPass = null;
  }
}

document.getElementById("end-pass-btn").addEventListener("click", endActivePass);

/* Notifications: completed pass log */

function getPassLog() {
  try {
    return JSON.parse(localStorage.getItem(userKey("smartpass_pass_log"))) || [];
  } catch {
    return [];
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatClockTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function renderNotifications() {
  const log = getPassLog();
  const overtimeCount = log.filter((p) => p.overtime).length;

  document.getElementById("notif-overtime-count").textContent = overtimeCount;
  document.getElementById("notif-total-count").textContent = log.length;

  const list = document.getElementById("notif-list");
  const empty = document.getElementById("notif-empty");

  if (log.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = log
    .slice()
    .reverse()
    .map((p, idx) => {
      const category = categoryByKey(p.categoryKey);
      const duration = formatDuration(p.endTime - p.startTime);
      const overtimeTag = p.overtime ? ' · <span class="notif-overtime-tag">Overtime</span>' : "";
      return `
        <div class="notif-item" style="--i:${idx}">
          <span class="notif-icon" style="background:${category.color}">${categoryIconMarkup(category)}</span>
          <div class="notif-info">
            <span class="notif-name">${p.name}</span>
            <span class="notif-meta">${formatClockTime(p.startTime)} · ${duration}${overtimeTag}</span>
          </div>
        </div>`;
    })
    .join("");
}

function recordPassCompleted(entry) {
  const log = getPassLog();
  log.push(entry);
  localStorage.setItem(userKey("smartpass_pass_log"), JSON.stringify(log));
  renderNotifications();
}

renderNotifications();

startPassBtn.addEventListener("click", () => {
  if (!goingToRoom) return;
  const minutes = parseInt(durationSlider.value, 10);
  const startTime = Date.now();
  const endTime = startTime + minutes * 60000;
  localStorage.setItem(
    userKey("smartpass_active_pass"),
    JSON.stringify({ room: goingToRoom, from: comingFromRoom, startTime, endTime })
  );
  sendBrowserNotification("Pass created", `Heading to ${goingToRoom.name}.`);
  startActivePass(goingToRoom, endTime, comingFromRoom, startTime);
  closeModal();
});

const savedPass = localStorage.getItem(userKey("smartpass_active_pass"));
if (savedPass) {
  const { room, from, endTime, startTime } = JSON.parse(savedPass);
  startActivePass(room, endTime, from, startTime);
}
