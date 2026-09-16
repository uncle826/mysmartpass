requestAnimationFrame(() => document.body.classList.add("loaded"));

const name = localStorage.getItem("smartpass_name") || "there";
document.getElementById("user-name").textContent = name.toUpperCase();

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
  const current = localStorage.getItem("smartpass_avatar_color") || AVATAR_COLORS[0];
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
      localStorage.setItem("smartpass_avatar_color", color);
      applyAvatarColor(color);
      renderAvatarColors();
    });
  });
}

applyAvatarColor(localStorage.getItem("smartpass_avatar_color") || AVATAR_COLORS[0]);
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
  localStorage.removeItem("smartpass_name");
  localStorage.removeItem("smartpass_school");
  localStorage.removeItem("smartpass_active_pass");
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

document.getElementById("notice-close").addEventListener("click", () => {
  document.getElementById("notice").classList.add("hidden");
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

function renderCategoryGrid(categories) {
  if (categories.length === 0) {
    roomList.innerHTML = `<div class="no-results">No matches</div>`;
    return;
  }

  roomList.innerHTML = `<div class="category-grid">${categories
    .map((c) => {
      const chevron = c.leaf
        ? ""
        : '<svg class="category-tile-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return `
        <button type="button" class="category-tile" style="background:${c.color}" data-key="${c.key}">
          <span class="category-tile-icon">${categoryIconMarkup(c)}</span>
          <span class="category-tile-footer">
            <span class="category-tile-label">${c.label}</span>
            ${chevron}
          </span>
        </button>`;
    })
    .join("")}</div>`;

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

  const selected = currentSelection();

  roomList.innerHTML = rooms
    .map((r) => {
      const category = categoryByKey(r.categoryKey);
      const isSelected = selected && selected.name === r.name ? "selected" : "";
      return `
        <button type="button" class="room-row ${isSelected}" data-name="${r.name}">
          <span class="room-icon" style="background:${category.color}">${categoryIconMarkup(category)}</span>
          <span class="room-name">${r.name}</span>
          <span class="room-code">
            <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            ${r.room || "—"}
          </span>
        </button>`;
    })
    .join("");

  roomList.querySelectorAll(".room-row").forEach((row) => {
    row.addEventListener("click", () => {
      const room = rooms.find((r) => r.name === row.dataset.name);
      selectRoom(room);
    });
  });
}

function renderPicker(filterText) {
  const term = filterText.trim().toLowerCase();

  if (term) {
    modalBack.classList.add("hidden");
    listTitle.textContent = "Results";
    const matches = FLAT_ROOMS.filter((r) => r.name.toLowerCase().includes(term));
    renderFlatList(matches);
    return;
  }

  if (activeField === "comingFrom") {
    modalBack.classList.add("hidden");
    listTitle.textContent = "All Rooms";
    renderFlatList(FLAT_ROOMS);
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
    listTitle.textContent = "All Rooms";
    renderCategoryGrid(CATEGORIES);
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
  overlay.classList.remove("hidden");
  comingFromInput.focus();
}

function closeModal() {
  overlay.classList.add("hidden");
}

document.getElementById("create-pass-nav-btn").addEventListener("click", openModal);
document.getElementById("create-pass-hero-btn").addEventListener("click", openModal);
document.getElementById("modal-close").addEventListener("click", closeModal);
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

let timerInterval = null;

function formatRemaining(endTime) {
  const totalSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
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

function startActivePass(room, endTime, fromRoom) {
  goingSomewhere.classList.add("hidden");
  activePass.classList.remove("hidden");
  createPassNavBtn.disabled = true;
  createPassNavBtn.style.opacity = "0.5";
  createPassNavBtn.style.cursor = "not-allowed";

  const category = categoryByKey(room.categoryKey);
  activePass.style.background = `linear-gradient(160deg, ${shadeColor(category.color, -110)}, ${shadeColor(category.color, -155)})`;
  passCard.style.background = `linear-gradient(160deg, ${shadeColor(category.color, 25)}, ${shadeColor(category.color, -20)})`;
  activePassDestination.textContent = room.name;
  activePassFrom.textContent = fromRoom ? fromRoom.name : "—";

  activePassTimer.textContent = formatRemaining(endTime);
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    activePassTimer.textContent = formatRemaining(endTime);
    if (endTime - Date.now() <= 0) clearInterval(timerInterval);
  }, 1000);
}

function endActivePass() {
  clearInterval(timerInterval);
  localStorage.removeItem("smartpass_active_pass");
  activePass.classList.add("hidden");
  goingSomewhere.classList.remove("hidden");
  createPassNavBtn.disabled = false;
  createPassNavBtn.style.opacity = "";
  createPassNavBtn.style.cursor = "";
}

document.getElementById("end-pass-btn").addEventListener("click", endActivePass);

/* Pass stats (today / this week / this month) */

function getPassHistory() {
  try {
    return JSON.parse(localStorage.getItem("smartpass_pass_history")) || [];
  } catch {
    return [];
  }
}

function renderStats() {
  const history = getPassHistory();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - now.getDay() * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  document.getElementById("stat-today").textContent = history.filter((t) => t >= startOfToday).length;
  document.getElementById("stat-week").textContent = history.filter((t) => t >= startOfWeek).length;
  document.getElementById("stat-month").textContent = history.filter((t) => t >= startOfMonth).length;
}

function recordPassCreated() {
  const history = getPassHistory();
  history.push(Date.now());
  localStorage.setItem("smartpass_pass_history", JSON.stringify(history));
  renderStats();
}

renderStats();

startPassBtn.addEventListener("click", () => {
  if (!goingToRoom) return;
  const minutes = parseInt(durationSlider.value, 10);
  const endTime = Date.now() + minutes * 60000;
  localStorage.setItem(
    "smartpass_active_pass",
    JSON.stringify({ room: goingToRoom, from: comingFromRoom, endTime })
  );
  recordPassCreated();
  startActivePass(goingToRoom, endTime, comingFromRoom);
  closeModal();
});

const savedPass = localStorage.getItem("smartpass_active_pass");
if (savedPass) {
  const { room, from, endTime } = JSON.parse(savedPass);
  startActivePass(room, endTime, from);
}
