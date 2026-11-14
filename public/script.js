const loginForm = document.getElementById("login-form");
const nameInput = document.getElementById("name") || document.getElementById("username");
const loadingView = document.getElementById("loading-view");
const loadingText = document.getElementById("loading-text");
const schoolView = document.getElementById("school-view");
const codeForm = document.getElementById("code-form");
const signupForm = document.getElementById("signup-form");
const resetForm = document.getElementById("reset-form");
const passwordForm = document.getElementById("password-form");
const scanView = document.getElementById("scan-view");
const role = document.body.dataset.role || "student";

const allViews = [loginForm, codeForm, signupForm, resetForm, passwordForm, scanView, loadingView, schoolView].filter(Boolean);

// students sign in with their name, then a "Learn" password: the word Learn plus exactly 5 numbers
const STUDENT_PASSWORD_RE = /^learn\d{5}$/i;

function showView(view) {
  allViews.forEach((v) => v.classList.add("hidden"));
  view.classList.remove("hidden");
}

function showError(form, message) {
  const el = form.querySelector(".auth-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearError(form) {
  form.querySelector(".auth-error").classList.add("hidden");
}

function setBusy(form, busy) {
  form.querySelectorAll("button[type=submit]").forEach((b) => (b.disabled = busy));
}

function finishSignIn(displayName) {
  localStorage.setItem("smartpass_name", displayName);
  localStorage.setItem("smartpass_role", role);
  loadingText.textContent = `Welcome, ${displayName}!`;
  showView(loadingView);
  setTimeout(() => showView(schoolView), 350);
}

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  clearError(loginForm);
  const typed = nameInput.value.trim();
  if (!typed) return;

  if (role === "teacher") {
    setBusy(loginForm, true);
    const res = await apiFetch("/api/teacher/login", {
      body: { username: typed, password: document.getElementById("password").value },
    });
    setBusy(loginForm, false);
    if (!res.ok) return showError(loginForm, res.data.error || "Incorrect username or password.");
    localStorage.setItem("smartpass_teacher_token", res.data.token);
    finishSignIn(res.data.name);
  } else {
    // students: name and the Learn password on the same screen
    const typedPassword = document.getElementById("learn-password").value.trim();
    if (!STUDENT_PASSWORD_RE.test(typedPassword)) {
      return showError(loginForm, "Your password is Learn followed by 5 numbers, like Learn12345.");
    }
    setBusy(loginForm, true);
    const res = await apiFetch("/api/student/login", {
      body: { name: typed, password: typedPassword, tz: tzOffset() },
    });
    setBusy(loginForm, false);
    if (!res.ok) return showError(loginForm, res.data.error || "Couldn't sign in. Please try again.");
    localStorage.setItem("smartpass_student_token", res.data.token);
    finishSignIn(res.data.name);
  }
});

// there's no email to send a reset to, so a forgotten password is looked up by the teacher
const forgotStudent = document.getElementById("forgot-password");
if (forgotStudent) {
  forgotStudent.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("forgot-note").classList.toggle("hidden");
  });
}

/* Students: sign in with the barcode on a digital ID card (camera), or by typing the number under it */

if (scanView) {
  const scanVideo = document.getElementById("scan-video");
  const scanStatus = document.getElementById("scan-status");
  const scanOk = document.getElementById("scan-ok");
  let scanner = null;
  let scanning = false;

  const setScanStatus = (text, isError) => {
    scanStatus.textContent = text;
    scanStatus.classList.toggle("err", !!isError);
  };

  const stopScan = () => {
    scanning = false;
    if (scanner) scanner.stop();
    scanner = null;
  };

  // the browser's own answer: "granted", "prompt" (it will ask), "denied" (blocked), or null when it can't say
  async function cameraState() {
    try {
      return (await navigator.permissions.query({ name: "camera" })).state;
    } catch {
      return null;
    }
  }

  // returns true when the camera is on, "blocked" when the browser refused, false for any other problem
  async function startScan(fromHelp) {
    stopScan();
    scanning = true;
    setScanStatus("Starting the camera…");
    // opening the camera makes the browser show its own "Allow camera access?" popup: point at it
    if ((await cameraState()) === "prompt") {
      showBanner("Allow the camera.", "Your browser is asking to use the camera. Click Allow in the popup near the address bar.");
    }
    try {
      const s = await startBarcodeScanner(scanVideo, handleScanned);
      if (!scanning) {
        s.stop(); // they went back while the camera was starting
        return false;
      }
      scanner = s;
      hideCameraHelp();
      setScanStatus("Hold your ID card’s barcode inside the box.");
      return true;
    } catch (err) {
      scanning = false;
      setScanStatus(err.message, true);
      if (err.blocked) {
        if (!fromHelp) showCameraHelp();
        return "blocked";
      }
      camBanner.classList.add("hidden");
      return false;
    }
  }

  /* camera blocked: a popup with the steps, plus a tip pinned to the top (where the address bar is) */

  const camModal = document.getElementById("cam-modal");
  const camBanner = document.getElementById("cam-banner");
  let camWatch = null;

  // the steps depend on the browser, so only show the ones that fit
  function cameraSteps() {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      return {
        short: "Tap the AA icon in the address bar, choose Website Settings, and set Camera to Allow.",
        steps: [
          "Tap the <b>AA</b> icon at the left of the address bar (or open Settings → Safari → Camera).",
          "Tap <b>Website Settings</b>, then set <b>Camera</b> to <b>Allow</b>.",
          "Come back here and tap the green button.",
        ],
      };
    }
    if (/Firefox/.test(ua)) {
      return {
        short: "Click the camera icon with a line through it in the address bar, remove the block, then reload.",
        steps: [
          "Click the <b>camera icon</b> (crossed out) in the address bar at the top.",
          "Next to <b>Use the Camera</b>, click the <b>×</b> to remove the block.",
          "Click the green button below, and choose <b>Allow</b> when asked.",
        ],
      };
    }
    const where = /Edg\//.test(ua) ? "Edge" : "Chrome";
    return {
      short: `Click the camera or lock icon in the address bar, set Camera to Allow, then reload (${where}).`,
      steps: [
        "Click the <b>camera icon</b> or the <b>lock icon</b> at the left of the address bar at the top.",
        "Switch <b>Camera</b> to <b>Allow</b> (or choose <b>Reset permission</b>).",
        "Click the green button below. If the page asks to reload, say yes.",
      ],
    };
  }

  function hideCameraHelp() {
    camModal.classList.add("hidden");
    camBanner.classList.add("hidden");
    document.getElementById("cam-err").classList.add("hidden");
  }

  function showBanner(title, text) {
    document.getElementById("cam-banner-title").textContent = title;
    document.getElementById("cam-banner-how").textContent = text;
    camBanner.classList.remove("hidden");
  }

  // Chrome often keeps refusing until the page is reloaded, even after the setting says Allow.
  // So: try the camera; if it still says blocked but the setting is now Allow, reload straight back into scanning.
  async function retryCamera() {
    const btn = document.getElementById("cam-retry");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Checking…";
    document.getElementById("cam-err").classList.add("hidden");
    const result = await startScan(true);
    btn.disabled = false;
    btn.textContent = label;
    if (result === true) return;
    if (result === "blocked") {
      if ((await cameraState()) === "granted") {
        try {
          sessionStorage.setItem("smartpass_resume_scan", "1");
        } catch {
          /* fine: they just tap the button again after the reload */
        }
        return location.reload();
      }
      const err = document.getElementById("cam-err");
      err.textContent = "It's still blocked. Use the camera or lock icon in the address bar to set Camera to Allow, then try again.";
      err.classList.remove("hidden");
      camModal.classList.remove("hidden");
      showBanner("Camera is blocked.", cameraSteps().short);
    } else {
      hideCameraHelp();
    }
  }

  function showCameraHelp() {
    const help = cameraSteps();
    document.getElementById("cam-steps").innerHTML = help.steps.map((s) => `<li>${s}</li>`).join("");
    document.getElementById("cam-err").classList.add("hidden");
    showBanner("Camera is blocked.", help.short);
    camModal.classList.remove("hidden");

    // as soon as they flip the setting, try the camera by themselves
    if (!camWatch && navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "camera" })
        .then((status) => {
          camWatch = status;
          status.onchange = () => {
            if (status.state !== "denied" && !scanView.classList.contains("hidden") && !camModal.classList.contains("hidden")) retryCamera();
          };
        })
        .catch(() => {});
    }
  }

  document.getElementById("cam-retry").addEventListener("click", retryCamera);
  document.getElementById("cam-type").addEventListener("click", () => {
    camModal.classList.add("hidden"); // keep the top tip, hide the popup
    document.getElementById("scan-number").focus();
  });
  document.getElementById("cam-banner-x").addEventListener("click", () => camBanner.classList.add("hidden"));

  // came back from the reload above: go straight back to the scanner
  try {
    if (sessionStorage.getItem("smartpass_resume_scan")) {
      sessionStorage.removeItem("smartpass_resume_scan");
      setTimeout(() => document.getElementById("id-signin-btn").click(), 300);
    }
  } catch {
    /* storage unavailable */
  }

  async function signInWithId(code) {
    setScanStatus("Checking your ID…");
    const res = await apiFetch("/api/student/login-id", { body: { studentId: code, tz: tzOffset() } });
    if (!res.ok) {
      setScanStatus(res.data.error || "Couldn’t sign in with that ID.", true);
      return false;
    }
    stopScan();
    scanOk.classList.remove("hidden");
    localStorage.setItem("smartpass_student_token", res.data.token);
    setScanStatus(`Welcome, ${res.data.name}!`);
    setTimeout(() => {
      finishSignIn(res.data.name);
      // a device that already knows the school goes straight in, so scanning is one step
      const saved = localStorage.getItem("smartpass_school");
      const btn = saved && document.querySelector(`.school-btn[data-school="${saved}"]`);
      if (btn) setTimeout(() => btn.click(), 400);
    }, 600);
    return true;
  }

  async function handleScanned(code) {
    const good = await signInWithId(code);
    if (!good && !scanView.classList.contains("hidden")) setTimeout(startScan, 1800); // not recognized: look again
  }

  document.getElementById("id-signin-btn").addEventListener("click", () => {
    scanOk.classList.add("hidden");
    showView(scanView);
    startScan();
  });

  document.getElementById("scan-back").addEventListener("click", (e) => {
    e.preventDefault();
    stopScan();
    hideCameraHelp();
    showView(loginForm);
  });

  document.getElementById("scan-manual").addEventListener("submit", async (e) => {
    e.preventDefault();
    const digits = document.getElementById("scan-number").value.replace(/\D/g, "");
    if (digits.length < 3) return setScanStatus("Type the number printed under the barcode.", true);
    stopScan();
    if (!(await signInWithId(digits))) setTimeout(() => !scanView.classList.contains("hidden") && startScan(), 1800);
  });

  // the camera shouldn’t stay on if they switch away
  document.addEventListener("visibilitychange", () => document.hidden && scanning && stopScan());
}

/* Teacher "Create account" / "Forgot password?": access code first, then either form */
let verifiedCode = "";
let codeFlowMode = "signup";

if (codeForm) {
  document.getElementById("create-account-link").addEventListener("click", (e) => {
    e.preventDefault();
    codeFlowMode = "signup";
    clearError(codeForm);
    showView(codeForm);
    document.getElementById("access-code").focus();
  });

  const forgotLink = document.getElementById("forgot-password-link");
  if (forgotLink && resetForm) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      codeFlowMode = "reset";
      clearError(codeForm);
      showView(codeForm);
      document.getElementById("access-code").focus();
    });
  }

  document.querySelectorAll("[data-back]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showView(loginForm);
    })
  );

  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(codeForm);
    const code = document.getElementById("access-code").value;
    setBusy(codeForm, true);
    const res = await apiFetch("/api/teacher/verify-code", { body: { code } });
    setBusy(codeForm, false);
    if (!res.ok) return showError(codeForm, res.data.error || "Incorrect access code.");
    verifiedCode = code;
    if (codeFlowMode === "reset" && resetForm) {
      clearError(resetForm);
      showView(resetForm);
      document.getElementById("reset-username").focus();
    } else {
      clearError(signupForm);
      showView(signupForm);
      document.getElementById("new-username").focus();
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(signupForm);
    const username = document.getElementById("new-username").value.trim();
    const password = document.getElementById("new-password").value;
    if (password !== document.getElementById("new-password2").value) {
      return showError(signupForm, "Passwords don't match.");
    }
    setBusy(signupForm, true);
    const res = await apiFetch("/api/teacher/signup", { body: { code: verifiedCode, username, password } });
    setBusy(signupForm, false);
    if (!res.ok) return showError(signupForm, res.data.error || "Couldn't create the account.");
    localStorage.setItem("smartpass_teacher_token", res.data.token);
    finishSignIn(res.data.name);
  });

  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError(resetForm);
      const username = document.getElementById("reset-username").value.trim();
      const password = document.getElementById("reset-password").value;
      if (password !== document.getElementById("reset-password2").value) {
        return showError(resetForm, "Passwords don't match.");
      }
      setBusy(resetForm, true);
      const res = await apiFetch("/api/teacher/reset-password", { body: { code: verifiedCode, username, password } });
      setBusy(resetForm, false);
      if (!res.ok) return showError(resetForm, res.data.error || "Couldn't reset that password.");
      showView(loginForm);
      const note = document.getElementById("auth-note");
      note.textContent = "Password updated. Sign in with your new password.";
      note.classList.remove("hidden");
    });
  }
}

document.querySelectorAll(".school-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const school = btn.dataset.school;
    localStorage.setItem("smartpass_school", school);

    loadingText.textContent = "Taking you to your school…";
    showView(loadingView);

    setTimeout(() => {
      document.body.classList.add("fade-out");
      setTimeout(() => {
        window.location.href = school.toLowerCase() + ".html";
      }, 250);
    }, 300);
  });
});

document.querySelectorAll("[data-soon]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const note = document.getElementById("auth-note");
    note.textContent = link.dataset.soon;
    note.classList.remove("hidden");
  });
});
