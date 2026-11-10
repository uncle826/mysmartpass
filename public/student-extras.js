/* Student extras: the school-day pill (current period), Flex sign-ups, and the digital ID card.
   Runs after dashboard.js and calendar.js and uses their globals (name, apiFetch, showToast, avatarMenu, studentProfile). */

/* ---------- school-day pill ---------- */

let bellSchedule = null;

function paintBellPill() {
  const el = document.getElementById("bell-pill");
  const info = bellInfo(bellSchedule);
  if (!info) return el.classList.add("hidden");
  el.className = `bell-pill ${info.kind}`;
  el.innerHTML = `<b>${idEscape(info.title)}</b><span>${idEscape(info.detail)}</span>`;
}

async function loadBellSchedule() {
  const res = await apiFetch("/api/schedule");
  if (res.ok) bellSchedule = res.data.schedule;
  paintBellPill();
}

loadBellSchedule();
setInterval(paintBellPill, 20000);
setInterval(loadBellSchedule, 5 * 60000);

/* ---------- Flex ---------- */

let fsActivities = [];
const fsError = document.getElementById("fs-error");

function fsDayLabel(day) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function renderFlexStudent() {
  const list = document.getElementById("fs-list");
  if (fsActivities.length === 0) {
    list.innerHTML = `<div class="fs-empty"><b>No activities yet</b><span>When your teachers add Flex activities, they show up here.</span></div>`;
    return;
  }
  let lastDay = "";
  list.innerHTML = fsActivities
    .map((a) => {
      const header = a.day !== lastDay ? `<h2 class="fs-day">${fsDayLabel(a.day)}</h2>` : "";
      lastDay = a.day;
      const left = a.capacity > 0 ? a.capacity - a.count : null;
      const full = left !== null && left <= 0 && !a.mine;
      const going = `${a.count} going${left !== null ? ` · ${Math.max(0, left)} spot${left === 1 ? "" : "s"} left` : ""}`;
      let action;
      if (a.mine && a.locked) action = `<span class="fs-locked">Your teacher added you</span>`;
      else if (a.mine) action = `<button type="button" class="fs-btn leave" data-leave="${a.id}">You're in · Leave</button>`;
      else if (full) action = `<span class="fs-full">Full</span>`;
      else action = `<button type="button" class="fs-btn" data-join="${a.id}">Sign up</button>`;
      return `${header}
        <article class="fs-card ${a.mine ? "mine" : ""}" style="--c:${a.color}">
          <div class="fs-main">
            <h3>${idEscape(a.name)}</h3>
            <p class="fs-when">${bellClock(a.start)} – ${bellClock(a.end)}${a.location ? ` · ${idEscape(a.location)}` : ""}</p>
            ${a.description ? `<p class="fs-desc">${idEscape(a.description)}</p>` : ""}
            <p class="fs-going">${going}</p>
          </div>
          <div class="fs-action">${action}</div>
        </article>`;
    })
    .join("");

  list.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => fsChange("signup", Number(b.dataset.join), b)));
  list.querySelectorAll("[data-leave]").forEach((b) => b.addEventListener("click", () => fsChange("leave", Number(b.dataset.leave), b)));
}

async function loadFlexStudent() {
  const res = await apiFetch(`/api/student/flex?name=${encodeURIComponent(name)}`);
  if (!res.ok) return;
  fsActivities = res.data.activities || [];
  renderFlexStudent();
}

async function fsChange(action, id, btn) {
  fsError.classList.add("hidden");
  btn.disabled = true;
  const res = await apiFetch(`/api/student/flex/${action}`, { body: { name, id } });
  if (!res.ok) {
    btn.disabled = false;
    fsError.textContent = res.data.error || "Couldn't do that. Please try again.";
    fsError.classList.remove("hidden");
    return loadFlexStudent();
  }
  fsActivities = res.data.activities || [];
  renderFlexStudent();
  if (action === "signup") showToast("You're signed up!", "success");
}

// keep the sign-up counts fresh while the page is open
setInterval(() => {
  if (!document.getElementById("flex-page").classList.contains("hidden")) loadFlexStudent();
}, 8000);

/* ---------- digital ID card ---------- */

const idOverlay = document.getElementById("idcard-overlay");
let idSettings = null;
let idSettingsAt = 0;

async function loadIdSettings() {
  if (idSettings && Date.now() - idSettingsAt < 60000) return idSettings;
  const res = await apiFetch("/api/idcard-settings");
  idSettings = res.ok && res.data.settings ? res.data.settings : { enabled: true, color: "#00b476", school: "", backText: "", barcode: "barcode" };
  idSettingsAt = Date.now();
  return idSettings;
}

async function openIdCard() {
  avatarMenu.classList.add("hidden");
  const settings = await loadIdSettings();
  if (settings.enabled === false) return showToast("Digital ID cards are turned off at your school.", "info");
  if (!studentProfile) return showToast("One moment, your card is still loading.", "info");

  const holder = document.getElementById("idcard-holder");
  holder.innerHTML = idCardMarkup(studentProfile, settings);
  holder.querySelector(".idc-card").addEventListener("click", (e) => e.currentTarget.classList.toggle("flipped"));
  clearTimeout(idOverlay._timer);
  idOverlay.classList.remove("closing", "hidden");
}

function closeIdCard() {
  idOverlay.classList.add("closing");
  clearTimeout(idOverlay._timer);
  idOverlay._timer = setTimeout(() => {
    idOverlay.classList.add("hidden");
    idOverlay.classList.remove("closing");
  }, 180);
}

document.getElementById("id-card-btn").addEventListener("click", openIdCard);
document.getElementById("idcard-close").addEventListener("click", closeIdCard);
document.getElementById("idcard-print").addEventListener("click", async () => {
  const settings = await loadIdSettings();
  if (studentProfile) printIdCards([studentProfile], settings);
});
idOverlay.addEventListener("click", (e) => {
  if (e.target === idOverlay) closeIdCard();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !idOverlay.classList.contains("hidden")) closeIdCard();
});
