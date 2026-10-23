const backLink = document.getElementById("back-link");
if (localStorage.getItem("smartpass_role") === "teacher") backLink.href = "/teacher-signin";
backLink.addEventListener("click", () => localStorage.removeItem("smartpass_school"));
