const loginForm = document.getElementById("login-form");
const nameInput = document.getElementById("name") || document.getElementById("username");
const loadingView = document.getElementById("loading-view");
const loadingText = document.getElementById("loading-text");
const schoolView = document.getElementById("school-view");
const codeForm = document.getElementById("code-form");
const signupForm = document.getElementById("signup-form");
const role = document.body.dataset.role || "student";

const allViews = [loginForm, codeForm, signupForm, loadingView, schoolView].filter(Boolean);

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
  setTimeout(() => showView(schoolView), 1000 + Math.random() * 4000);
}

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  clearError(loginForm);
  const typed = nameInput.value.trim();
  if (!typed) return;

  setBusy(loginForm, true);
  if (role === "teacher") {
    const res = await apiFetch("/api/teacher/login", {
      body: { username: typed, password: document.getElementById("password").value },
    });
    setBusy(loginForm, false);
    if (!res.ok) return showError(loginForm, res.data.error || "Incorrect username or password.");
    localStorage.setItem("smartpass_teacher_token", res.data.token);
    finishSignIn(res.data.name);
  } else {
    const res = await apiFetch("/api/student/login", { body: { name: typed, tz: tzOffset() } });
    setBusy(loginForm, false);
    if (!res.ok) return showError(loginForm, res.data.error || "Couldn't sign in. Please try again.");
    finishSignIn(res.data.name);
  }
});

/* Teacher "Create account": access code first, then the account form */
let verifiedCode = "";

if (codeForm) {
  document.getElementById("create-account-link").addEventListener("click", (e) => {
    e.preventDefault();
    clearError(codeForm);
    showView(codeForm);
    document.getElementById("access-code").focus();
  });

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
    clearError(signupForm);
    showView(signupForm);
    document.getElementById("new-username").focus();
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
}

document.querySelectorAll(".school-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const school = btn.dataset.school;
    localStorage.setItem("smartpass_school", school);

    loadingText.textContent = "Taking you to your school…";
    showView(loadingView);

    const delay = 800 + Math.random() * 1700;
    setTimeout(() => {
      document.body.classList.add("fade-out");
      setTimeout(() => {
        window.location.href = school.toLowerCase() + ".html";
      }, 400);
    }, delay);
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
