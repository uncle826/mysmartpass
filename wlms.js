const loadingText = document.getElementById("loading-text");

const messages = ["Welcome to WLMS!", "Loading your dashboard…", "Almost there…"];
let i = 0;

const messageInterval = setInterval(() => {
  i = (i + 1) % messages.length;
  loadingText.textContent = messages[i];
}, 900);

const delay = 1500 + Math.random() * 3500;
setTimeout(() => {
  clearInterval(messageInterval);
  document.body.classList.add("fade-out");
  setTimeout(() => {
    window.location.href = "dashboard.html";
  }, 400);
}, delay);
