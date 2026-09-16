const loginForm = document.getElementById("login-form");
const loadingView = document.getElementById("loading-view");
const loadingText = document.getElementById("loading-text");
const schoolView = document.getElementById("school-view");

function showView(view) {
  [loginForm, loadingView, schoolView].forEach((v) => v.classList.add("hidden"));
  view.classList.remove("hidden");
}

loginForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  if (!name) return;

  localStorage.setItem("smartpass_name", name);

  loadingText.textContent = `Welcome, ${name}!`;
  showView(loadingView);

  const delay = 1000 + Math.random() * 4000;
  setTimeout(() => showView(schoolView), delay);
});

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
