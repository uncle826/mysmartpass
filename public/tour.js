/* SmartPass first-time tour.
   1. A green and white swirl, "Welcome to SmartPass!", then the logo.
   2. Guided steps: each one spotlights a real button with an arrow. Tapping the highlighted button (or Next)
      moves on; Skip ends the tour. It plays once per person, and "Take the tour" in the profile menu replays it.
   Pages opt in with <body data-tour="student"> or <body data-tour="teacher">. */

(function () {
  const role = document.body.dataset.tour;
  if (!role) return;

  const person = (localStorage.getItem("smartpass_name") || "").trim().toLowerCase();
  const DONE_KEY = `smartpass_tour_done_${role}_${person}`;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STEPS = {
    student: [
      {
        target: ["#create-pass-hero-btn", "#create-pass-nav-btn"],
        title: "Create a pass",
        text: "Going somewhere? Tap Create Pass, pick where you are headed, and choose how long you need.",
      },
      {
        target: ["#schedule-pass-btn"],
        title: "Schedule a pass",
        text: "Know you will need to leave later? Schedule a pass and it starts by itself at the time you pick.",
      },
      {
        target: ["#nav-calendar"],
        title: "Your calendar",
        text: "See every pass you have taken and the ones coming up, by day or by week.",
      },
      {
        target: ["#nav-flex"],
        title: "Flex time",
        text: "Sign up for Flex activities here, and leave one if your plans change.",
      },
      {
        target: ["#avatar-btn"],
        title: "Your profile",
        text: "Change your icon color, show your digital ID card, or sign out. You can replay this tour from here any time.",
      },
      {
        title: "You are ready!",
        text: "That is everything. Tap Create Pass whenever you need to go somewhere.",
        last: true,
      },
    ],
    teacher: [
      {
        target: [".tb-search"],
        title: "Find any student",
        text: "Type a name to jump straight to a student and see their passes.",
      },
      {
        target: ['.nav-item[data-view="students"]'],
        title: "Home",
        text: "Every student in one list. Open one to see their passes, set a daily limit, or turn on Request only.",
      },
      {
        target: ['.nav-item[data-view="hall"]'],
        title: "Hall Monitor",
        text: "Watch who is out right now, with live timers, and approve pass requests.",
      },
      {
        target: ['.nav-item[data-view="calendar"]'],
        title: "Calendar",
        text: "Every pass on a calendar, including passes scheduled for later.",
      },
      {
        target: ['.nav-item[data-view="flex"]'],
        title: "Flex",
        text: "Create Flex activities, set how many students can join, and take attendance.",
      },
      {
        target: ['.nav-item[data-view="settings"]'],
        title: "Admin",
        text: "Analytics, accounts, rooms, the bell schedule, ID cards and Emergency mode all live here.",
      },
      {
        target: ["#top-create-pass"],
        title: "Create a pass",
        text: "Make a pass for any student, with a destination and a time limit.",
      },
      {
        target: ["#avatar-btn"],
        title: "Your profile",
        text: "Change your photo or sign out. You can replay this tour from here any time.",
      },
      {
        title: "You are all set!",
        text: "That is the tour. Open Admin whenever you want to change rules or print ID cards.",
        last: true,
      },
    ],
  };

  const LOGO_MARK =
    '<svg viewBox="0 0 52 40" class="tour-logo-mark" aria-hidden="true"><path d="M4,4 L22,20 L4,36" fill="none" stroke="#1ed17a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M22,4 L40,20 L22,36" fill="none" stroke="#1ed17a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARROW =
    '<svg viewBox="0 0 48 64" aria-hidden="true"><path d="M24 62V12M8 28 24 8l16 20" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 62V12M8 28 24 8l16 20" fill="none" stroke="#00b476" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let running = false;
  let intro = null;
  let layer = null;
  let steps = [];
  let index = 0;
  let timers = [];
  let swirlFrame = 0;

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  };

  function markDone() {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* storage unavailable: it will just show again next time */
    }
  }

  function loadFont() {
    if (document.getElementById("tour-font")) return;
    const link = document.createElement("link");
    link.id = "tour-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap";
    document.head.appendChild(link);
  }

  /* ---------- intro: swirl, welcome, logo ---------- */

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function runSwirl(canvas, duration, done) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (canvas.width = Math.round(window.innerWidth * dpr));
    const H = (canvas.height = Math.round(window.innerHeight * dpr));
    const ctx = canvas.getContext("2d");
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.hypot(cx, cy);
    const arms = 8;
    const colors = ["#ffffff", "#067a4f", "#1ed17a", "#ffffff", "#00b476", "#c6f4de", "#ffffff", "#0a9a63"];
    const start = performance.now();

    function frame(now) {
      const p = Math.min(1, (now - start) / duration);

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      bg.addColorStop(0, "#27dc86");
      bg.addColorStop(1, "#009e68");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const grow = easeOut(Math.min(1, p / 0.7));
      const spin = easeInOut(p) * Math.PI * 4;

      for (let a = 0; a < arms; a++) {
        const base = (a * 2 * Math.PI) / arms;
        const steps = 70;
        const outer = [];
        const inner = [];
        for (let i = 1; i <= steps; i++) {
          const s = i / steps;
          const r = s * maxR * grow;
          const theta = base + s * 4.4 + spin;
          const half = 0.04 + 0.16 * Math.sqrt(s);
          outer.push([cx + Math.cos(theta + half) * r, cy + Math.sin(theta + half) * r]);
          inner.push([cx + Math.cos(theta - half) * r, cy + Math.sin(theta - half) * r]);
        }
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        outer.forEach((pt) => ctx.lineTo(pt[0], pt[1]));
        for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
        ctx.closePath();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = colors[a % colors.length];
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // the swirl blooms into white, which is what "Welcome" appears on
      if (p > 0.68) {
        const q = easeInOut((p - 0.68) / 0.32);
        ctx.beginPath();
        ctx.arc(cx, cy, q * maxR * 1.08, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      if (p < 1) swirlFrame = requestAnimationFrame(frame);
      else done();
    }
    swirlFrame = requestAnimationFrame(frame);
  }

  function playIntro(onFinish) {
    loadFont();
    intro = document.createElement("div");
    intro.className = "tour-intro";
    intro.innerHTML = `
      <canvas class="tour-swirl"></canvas>
      <div class="tour-welcome" aria-live="polite">
        <div class="tour-welcome-small">Welcome to</div>
        <div class="tour-welcome-big">${"SmartPass!"
          .split("")
          .map((c, i) => `<span style="--d:${i * 60}ms">${c}</span>`)
          .join("")}</div>
      </div>
      <div class="tour-logo">
        <div class="tour-logo-row"><span class="tour-logo-title">SmartPass</span>${LOGO_MARK}</div>
        <div class="tour-logo-sub">A <b>RAPTOR</b> TECHNOLOGIES COMPANY</div>
      </div>
      <button type="button" class="tour-intro-skip">Skip</button>`;
    document.body.appendChild(intro);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(swirlFrame);
      intro.classList.add("leaving");
      later(() => {
        if (intro) intro.remove();
        intro = null;
        onFinish();
      }, 450);
    };
    intro.querySelector(".tour-intro-skip").addEventListener("click", finish);

    if (reduceMotion) {
      intro.querySelector(".tour-swirl").style.background = "#ffffff";
      intro.classList.add("show-welcome");
      later(() => {
        intro.classList.remove("show-welcome");
        intro.classList.add("show-logo");
      }, 1200);
      later(finish, 2400);
      return;
    }

    runSwirl(intro.querySelector(".tour-swirl"), 2700, () => {});
    later(() => intro && intro.classList.add("show-welcome"), 2350);
    later(() => intro && intro.classList.remove("show-welcome"), 4350);
    later(() => intro && intro.classList.add("show-logo"), 4650);
    later(finish, 6350);
  }

  /* ---------- guided steps ---------- */

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findTarget(step) {
    if (!step.target) return null;
    for (const sel of step.target) {
      const el = document.querySelector(sel);
      if (visible(el)) return el;
    }
    return null;
  }

  function buildLayer() {
    layer = document.createElement("div");
    layer.className = "tour-layer";
    layer.innerHTML = `
      <div class="tour-block"></div>
      <div class="tour-spot"></div>
      <div class="tour-hit" title="Tap to continue"></div>
      <div class="tour-arrow">${ARROW}</div>
      <div class="tour-card" role="dialog" aria-live="polite">
        <div class="tour-dots"></div>
        <h3 class="tour-title"></h3>
        <p class="tour-text"></p>
        <p class="tour-hint"></p>
        <div class="tour-actions">
          <button type="button" class="tour-skip">Skip</button>
          <button type="button" class="tour-next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(layer);
    layer.querySelector(".tour-next").addEventListener("click", next);
    layer.querySelector(".tour-skip").addEventListener("click", end);
    layer.querySelector(".tour-hit").addEventListener("click", next);
    // tapping the dimmed area nudges the card instead of doing anything behind it
    layer.querySelector(".tour-block").addEventListener("click", () => {
      const card = layer.querySelector(".tour-card");
      card.classList.remove("nudge");
      void card.offsetWidth;
      card.classList.add("nudge");
    });
  }

  function show() {
    const step = steps[index];
    const el = findTarget(step);
    const spot = layer.querySelector(".tour-spot");
    const hit = layer.querySelector(".tour-hit");
    const arrow = layer.querySelector(".tour-arrow");
    const card = layer.querySelector(".tour-card");
    const isLast = index === steps.length - 1;

    // text
    layer.querySelector(".tour-title").textContent = step.title;
    layer.querySelector(".tour-text").textContent = step.text;
    layer.querySelector(".tour-hint").textContent = el ? "Tap the highlighted button, or press Next." : "";
    layer.querySelector(".tour-dots").innerHTML = steps.map((_, i) => `<i class="${i === index ? "on" : i < index ? "past" : ""}"></i>`).join("");
    layer.querySelector(".tour-next").textContent = isLast ? "Done" : "Next";
    layer.querySelector(".tour-skip").classList.toggle("hidden", isLast);

    // swap animation
    card.classList.remove("swap");
    void card.offsetWidth;
    card.classList.add("swap");

    const cardW = Math.min(360, window.innerWidth - 24);
    card.style.width = `${cardW}px`;
    const cardH = card.offsetHeight;

    if (!el) {
      // no target: a centered card over a dimmed page
      spot.style.cssText = `left:${window.innerWidth / 2}px;top:${window.innerHeight / 2}px;width:0;height:0;border-radius:0`;
      hit.style.display = "none";
      arrow.style.display = "none";
      card.style.left = `${(window.innerWidth - cardW) / 2}px`;
      card.style.top = `${Math.max(12, (window.innerHeight - cardH) / 2)}px`;
      return;
    }

    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const pad = 8;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 10;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${radius + pad}px`;
    hit.style.cssText = `display:block;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${radius + pad}px`;

    const cx = r.left + r.width / 2;
    const gap = 70; // room for the arrow
    const below = r.bottom + pad + gap + cardH < window.innerHeight - 12;
    let top;
    if (below) top = r.bottom + pad + gap;
    else top = Math.max(12, r.top - pad - gap - cardH);
    const left = Math.min(Math.max(12, cx - cardW / 2), window.innerWidth - cardW - 12);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    arrow.style.display = "block";
    arrow.classList.toggle("down", !below);
    const arrowTop = below ? r.bottom + pad + 4 : r.top - pad - 4 - 64;
    arrow.style.left = `${Math.min(Math.max(cx - 24, 12), window.innerWidth - 60)}px`;
    arrow.style.top = `${arrowTop}px`;
  }

  function next() {
    if (!layer) return;
    if (index >= steps.length - 1) return end();
    index++;
    show();
  }

  function onKey(e) {
    if (!layer) return;
    if (e.key === "Escape") end();
    else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  }

  function onResize() {
    if (layer) show();
  }

  function end() {
    markDone();
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    if (layer) {
      const l = layer;
      layer = null;
      l.classList.add("leaving");
      setTimeout(() => l.remove(), 350);
    }
    if (intro) {
      cancelAnimationFrame(swirlFrame);
      intro.remove();
      intro = null;
    }
    timers.forEach(clearTimeout);
    timers = [];
    running = false;
  }

  function beginSteps() {
    // keep only steps whose button is on screen right now (plus the final card)
    steps = STEPS[role].filter((s) => !s.target || findTarget(s));
    index = 0;
    buildLayer();
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    show();
  }

  function start(force) {
    if (running) return;
    if (!force) {
      try {
        if (localStorage.getItem(DONE_KEY)) return;
      } catch {
        /* storage unavailable: show it once per visit */
      }
    }
    running = true;
    playIntro(beginSteps);
  }

  window.startSmartPassTour = () => start(true);

  const replay = document.getElementById("tour-btn");
  if (replay) {
    replay.addEventListener("click", () => {
      const menu = document.getElementById("avatar-menu");
      if (menu) menu.classList.add("hidden");
      start(true);
    });
  }

  // first time here: play it as soon as the dashboard is up
  if (person) start(false);
})();
