/* Hall Monitor in the style of SmartPass: a tall colored tile for each student who is out (the color comes from their
   profile icon; custom photos get a steady random color), and clicking a tile opens a pass box with Add Time / End Pass.
   Runs after teacher-rooms.js and replaces hallCardMarkup, requestCardMarkup and tickHall from teacher-dashboard.js. */

// SmartPass's own tile colors, used when a student has a photo or no icon color picked
const HALL_PALETTE = ["#139be6", "#da389d", "#f59602", "#f86f4d", "#12c29e", "#6651f1", "#ac0cdf", "#07abc3", "#72cc1b", "#e3447c"];
const HALL_DEFAULT_GRAY = "#d3d7de"; // the "no color chosen" icon on the student screen

const HALL_TARDY_RED = "#e2443a";

function hallColorOf(s) {
  // a tardy pass is always red
  if (s.active && s.active.kind === "class") return HALL_TARDY_RED;
  const c = s.avatarColor;
  if (!s.photo && c && /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== HALL_DEFAULT_GRAY) return c;
  let h = 0;
  for (const ch of s.key || s.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HALL_PALETTE[h % HALL_PALETTE.length];
}

// the two-tone gradient pair for a color (same drift SmartPass uses on its tiles)
function hallPair(hex) {
  if (typeof rtPair === "function") return rtPair(hex);
  return [hex, shade(hex, 24)];
}

function hallAvatar(s, size) {
  const photo = s.photo ? `background-image:url('${s.photo}')` : "";
  const initial = s.photo ? "" : escapeHtml(s.name.charAt(0).toUpperCase());
  return `<span class="hc-avatar ${size || ""} ${s.photo ? "has-photo" : ""}" style="${photo}">${initial}</span>`;
}

function hallStyleVars(s) {
  const [c1, c2] = hallPair(hallColorOf(s));
  return `--c1:${c1};--c2:${c2}`;
}

/* ---------- the tiles ---------- */

hallCardMarkup = function (s, enter) {
  return `
    <button type="button" class="hc-card ${enter ? "hc-enter" : ""}" data-pass="${s.key}" style="${hallStyleVars(s)}" aria-label="${escapeHtml(s.name)}, going to ${escapeHtml(s.active.room.name)}. Open pass options">
      <span class="hc-main">
        ${hallAvatar(s)}
        <span class="hc-name">${escapeHtml(s.name)}</span>
        <span class="hc-dest">${s.active.kind === "class" ? "Tardy to " : ""}${escapeHtml(s.active.room.name)}</span>
      </span>
      <span class="hc-time js-h-time" data-key="${s.key}"></span>
    </button>`;
};

requestCardMarkup = function (s, enter) {
  const r = s.request;
  return `
    <div class="hc-card hc-request ${enter ? "hc-enter" : ""}" data-key="${s.key}" style="${hallStyleVars(s)}">
      <button type="button" class="hc-main hc-open" data-open="${s.key}">
        ${hallAvatar(s)}
        <span class="hc-name">${escapeHtml(s.name)}</span>
        <span class="hc-dest">Wants ${escapeHtml(r.dest.name)}</span>
        <span class="hc-ask">for ${r.minutes} min</span>
      </button>
      <span class="hc-actions">
        <button type="button" class="hc-deny" data-decide="deny" data-id="${r.id}">Deny</button>
        <button type="button" class="hc-approve" data-decide="approve" data-id="${r.id}">Approve</button>
      </span>
    </div>`;
};

tickHall = function (now) {
  document.querySelectorAll(".hc-time.js-h-time").forEach((el) => {
    const s = studentMap.get(el.dataset.key);
    if (!s || !s.active) return;
    const remaining = s.active.endTime - now;
    const late = remaining <= 0;
    el.closest(".hc-card").classList.toggle("overtime", late);
    el.textContent = late ? `+${clock(-remaining, false)}` : clock(remaining, true);
  });
  hallPopupTick(now);
};

// tapping a tile opens its pass box (the request tiles keep their own Approve / Deny buttons)
hallView.addEventListener("click", (e) => {
  const card = e.target.closest(".hc-card[data-pass]");
  if (card) openHallPopup(card.dataset.pass);
});

/* ---------- the pass box ---------- */

const HP_RING = 2 * Math.PI * 96;
const HP_TARDY_ICON = '<svg viewBox="0 0 24 24"><path d="M19.4 9.4A8.6 8.6 0 1 0 9.2 19.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M11 5.8V11H6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17.4" cy="17.4" r="4.9" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M17.4 15.1v2.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="17.4" cy="19.5" r="1.05" fill="#fff"/></svg>';
const HP_ADD_CHOICES = [1, 2, 5, 10];
let hallPop = null; // { host, key }

function hpHtml(s) {
  const a = s.active;
  const cat = categoryByKey(a.room.categoryKey);
  const tardy = a.kind === "class";
  const bits = [];
  if (tardy) {
    bits.push(`<span class="hp-from-word">From:</span><span class="hp-from-chip">${escapeHtml(a.from ? a.from.name : "—")}</span>`);
    bits.push(`<span class="hp-from-word">Going to:</span><span class="hp-from-chip">${escapeHtml(a.room.name)}</span>`);
  } else if (a.from && a.from.name) bits.push(`<span class="hp-from-word">from</span><span class="hp-from-chip">${escapeHtml(a.from.name)}</span>`);
  if (a.createdBy) bits.push(`<span class="hp-from-word">sent by</span><span class="hp-from-chip">${escapeHtml(a.createdBy)}</span>`);
  const fromRow = `<div class="hp-from"><i></i>${bits.length ? bits.join("") : '<span class="hp-from-word">round-trip</span>'}</div>`;
  return `
    <div class="hp-card" style="${hallStyleVars(s)}" role="dialog" aria-modal="true" aria-labelledby="hp-dest">
      <button type="button" class="hp-x" id="hp-x" aria-label="Close">&times;</button>
      <div class="hp-who">${hallAvatar(s, "sm")}<span><b>${escapeHtml(s.name)}</b><em>Left at ${timeOfDay(a.startTime)}</em></span></div>
      <div class="hp-dest-row"><span class="hp-dest-ic">${tardy ? HP_TARDY_ICON : roomIconMarkup(a.room.name, a.room.categoryKey)}</span><h2 id="hp-dest">${tardy ? "TARDY PASS" : escapeHtml(a.room.name)}</h2></div>
      ${fromRow}
      ${a.message ? `<p class="hp-msg">${escapeHtml(a.message)}</p>` : ""}
      <div class="hp-ring">
        <svg viewBox="0 0 210 210" aria-hidden="true"><circle class="hp-track" cx="105" cy="105" r="96"/><circle class="hp-prog" id="hp-prog" cx="105" cy="105" r="96" stroke-dasharray="${HP_RING}" stroke-dashoffset="0"/></svg>
        <div class="hp-ring-in"><img src="walking-icon.png" alt=""><b id="hp-time"></b><small id="hp-label"></small></div>
      </div>
      <div class="hp-actions" id="hp-actions">
        <button type="button" class="hp-btn" id="hp-add">Add Time</button>
        <button type="button" class="hp-btn hp-end" id="hp-end">End Pass</button>
      </div>
      <div class="hp-more hidden" id="hp-more">
        <p>Add how much time?</p>
        <div class="hp-chips">${HP_ADD_CHOICES.map((m) => `<button type="button" class="hp-chip" data-min="${m}">+${m}<small>min</small></button>`).join("")}</div>
        <button type="button" class="hp-back" id="hp-back">Back</button>
      </div>
      <div class="hp-links">
        <button type="button" id="hp-profile">View profile</button>
        <button type="button" id="hp-bounce">${a.bounce ? "Stop bouncing" : "Bounce"}</button>
      </div>
    </div>`;
}

function openHallPopup(key) {
  const s = studentMap.get(key);
  if (!s || !s.active || hallPop) return;
  const host = document.createElement("div");
  host.className = "hp-overlay";
  host.innerHTML = hpHtml(s);
  document.body.appendChild(host);
  hallPop = { host, key };
  host.addEventListener("mousedown", (e) => {
    if (e.target === host) closeHallPopup();
  });
  document.addEventListener("keydown", hpEsc);

  const $ = (id) => document.getElementById(id);
  $("hp-x").addEventListener("click", closeHallPopup);
  $("hp-end").addEventListener("click", async () => {
    $("hp-end").disabled = true;
    await endStudentPass(s);
    closeHallPopup();
  });
  $("hp-add").addEventListener("click", () => {
    $("hp-actions").classList.add("hidden");
    $("hp-more").classList.remove("hidden");
  });
  $("hp-back").addEventListener("click", () => {
    $("hp-more").classList.add("hidden");
    $("hp-actions").classList.remove("hidden");
  });
  host.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => hallAddTime(s, Number(b.dataset.min), b)));
  $("hp-profile").addEventListener("click", () => {
    closeHallPopup();
    setView("students");
    selectStudent(key);
    const row = listEl.querySelector(`.t-student[data-key="${key}"]`);
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  $("hp-bounce").addEventListener("click", () => {
    if (s.active) setBounce(s, !s.active.bounce);
    $("hp-bounce").textContent = s.active && s.active.bounce ? "Stop bouncing" : "Bounce";
  });
  hallPopupTick(serverTime());
}

function hpEsc(e) {
  if (e.key === "Escape") closeHallPopup();
}

function closeHallPopup() {
  if (!hallPop) return;
  const { host } = hallPop;
  hallPop = null;
  document.removeEventListener("keydown", hpEsc);
  host.classList.add("leaving");
  setTimeout(() => host.remove(), 170);
}

async function hallAddTime(s, minutes, btn) {
  if (!s.active) return;
  btn.disabled = true;
  const res = await teacherApi("/api/teacher/pass/extend", { key: s.key, minutes });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) {
    btn.disabled = false;
    return showToast(res.data.error || "Couldn't add time.", "warn");
  }
  s.active.endTime = res.data.endTime;
  showToast(`Added ${minutes} minute${minutes === 1 ? "" : "s"} for ${s.name}`, "success");
  if (hallPop) {
    document.getElementById("hp-more").classList.add("hidden");
    document.getElementById("hp-actions").classList.remove("hidden");
    btn.disabled = false;
  }
  hallPopupTick(serverTime());
  refresh(true);
}

// keeps the ring and clock in the open pass box moving, and closes it if the pass ended
function hallPopupTick(now) {
  if (!hallPop) return;
  const s = studentMap.get(hallPop.key);
  if (!s || !s.active) {
    closeHallPopup();
    return;
  }
  const remaining = s.active.endTime - now;
  const late = remaining <= 0;
  const total = Math.max(1, s.active.endTime - s.active.startTime);
  const left = late ? 0 : Math.min(1, remaining / total);
  const prog = document.getElementById("hp-prog");
  const time = document.getElementById("hp-time");
  const label = document.getElementById("hp-label");
  if (!prog || !time) return;
  prog.style.strokeDashoffset = String(HP_RING * (1 - left));
  time.textContent = late ? `+${clock(-remaining, false)}` : clock(remaining, true);
  label.textContent = late ? "overtime" : "remaining";
  hallPop.host.querySelector(".hp-card").classList.toggle("overtime", late);
}

// the first render can happen before this file has loaded: redraw once so the tiles are always the new ones
renderHall();
