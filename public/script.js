const loginForm = document.getElementById("login-form");
const nameInput = document.getElementById("name") || document.getElementById("username");
const loadingView = document.getElementById("loading-view");
const loadingText = document.getElementById("loading-text");
const schoolView = document.getElementById("school-view");
const codeForm = document.getElementById("code-form");
const signupForm = document.getElementById("signup-form");
const resetForm = document.getElementById("reset-form");
const passwordForm = document.getElementById("password-form");
const role = document.body.dataset.role || "student";

const allViews = [loginForm, codeForm, signupForm, resetForm, passwordForm, loadingView, schoolView].filter(Boolean);

// students sign in with their name, then a "Learn" password: the word Learn plus exactly 5 numbers
const STUDENT_PASSWORD_RE = /^learn\d{5}$/i;
let pendingStudentName = "";

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
    // students: name first, then the Learn password
    pendingStudentName = typed;
    clearError(passwordForm);
    document.getElementById("learn-password").value = "";
    showView(passwordForm);
    document.getElementById("learn-password").focus();
  }
});

if (passwordForm) {
  document.getElementById("password-back").addEventListener("click", (e) => {
    e.preventDefault();
    showView(loginForm);
    nameInput.focus();
  });

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(passwordForm);
    const typedPassword = document.getElementById("learn-password").value.trim();
    if (!STUDENT_PASSWORD_RE.test(typedPassword)) {
      return showError(passwordForm, "Your password is Learn followed by 5 numbers, like Learn12345.");
    }

    setBusy(passwordForm, true);
    const res = await apiFetch("/api/student/login", {
      body: { name: pendingStudentName, password: typedPassword, tz: tzOffset() },
    });
    setBusy(passwordForm, false);
    if (!res.ok) return showError(passwordForm, res.data.error || "Couldn't sign in. Please try again.");
    localStorage.setItem("smartpass_student_token", res.data.token);
    finishSignIn(res.data.name);
  });
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
