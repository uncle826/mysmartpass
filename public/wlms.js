const loadingText = document.getElementById("loading-text");

const messages = ["Welcome to WLMS!", "Loading your dashboard…"];
let i = 0;

const messageInterval = setInterval(() => {
  i = (i + 1) % messages.length;
  loadingText.textContent = messages[i];
}, 450);

setTimeout(() => {
  clearInterval(messageInterval);
  document.body.classList.add("fade-out");
  setTimeout(() => {
    window.location.href = localStorage.getItem("smartpass_role") === "teacher" ? "teacher-dashboard.html" : "dashboard.html";
  }, 250);
}, 600);
