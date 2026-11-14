/* Swaps the hand-drawn nav and sidebar icons for the icon set SmartPass itself uses (the same library the room
   icons come from). Each icon is only swapped once it has loaded, so if the library can't be reached the drawn
   icons simply stay. The library serves white icons; CSS tints them (see the sp-* filters in the page). */
(function () {
  const BASE = "https://storage.googleapis.com/sp-img-cdn/icons8-ios/";
  const ICONS = [
    ['.main-nav .nav-item[data-view="students"]', "school-house"],
    ['.main-nav .nav-item[data-view="hall"]', "crowd"],
    ['.main-nav .nav-item[data-view="calendar"]', "calendar"],
    ['.main-nav .nav-item[data-view="flex"]', "workflow"],
    // the student dashboard's top bar uses the same icons as the teacher's
    ["#nav-home", "school-house"],
    ["#nav-calendar", "calendar"],
    ["#nav-flex", "workflow"],
    ['.main-nav .nav-item[data-view="settings"]', "design"],
    ['.t-side-item[data-settings-tab="dashboard"]', "compass"],
    ['.t-side-item[data-settings-tab="analytics"]', "bar-chart"],
    ["#explore-toggle", "zoom-in"],
    ['.t-side-item[data-settings-tab="bell"]', "alarm-clock"],
    ['.t-side-item[data-settings-tab="accounts"]', "teamwork"],
    ['.t-side-item[data-settings-tab="rooms"]', "classroom"],
    ['.t-side-item[data-settings-tab="classes"]', "picture"],
    ['.t-side-item[data-settings-tab="flex"]', "timetable"],
    ['.t-side-item[data-settings-tab="idcards"]', "badge"],
    ['.t-side-item[data-settings-tab="emergency"]', "buoy"],
  ];

  ICONS.forEach(([selector, name]) => {
    const host = document.querySelector(selector);
    const drawn = host && host.querySelector("svg:not(.t-chev):not(.t-spark)");
    if (!drawn) return;
    const img = new Image();
    img.onload = () => {
      img.className = "sp-ic";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      drawn.replaceWith(img);
    };
    img.src = `${BASE}${name}/FFFFFF.png`;
  });
})();
