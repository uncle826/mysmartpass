// Where someone belongs, decided in one place for every page:
// - nobody signed in on this device: the sign-in page
// - signed in and a school picked: their own dashboard (or the LHS "coming soon" page)
// - signed in but no school picked yet: the sign-in page, which then opens on the school picker

function signedInRole() {
  const role = localStorage.getItem("smartpass_role");
  if (role === "teacher" && localStorage.getItem("smartpass_teacher_token")) return "teacher";
  if (role === "student" && localStorage.getItem("smartpass_student_token") && localStorage.getItem("smartpass_name")) return "student";
  return null;
}

// the page a signed-in person should be on, or null when they still need the sign-in page
function signedInHome() {
  const role = signedInRole();
  const school = localStorage.getItem("smartpass_school");
  if (!role || !school) return null;
  if (school === "LHS") return "/lhs";
  return role === "teacher" ? "/teacher-dashboard" : "/dashboard";
}

function signInPageFor(role) {
  return role === "teacher" ? "/teacher-signin" : "/student-signin";
}

// a page that only makes sense for one place: anyone who belongs somewhere else is sent there.
// It also stops the calling script, so the page doesn't make requests without a valid sign-in, whose
// "please sign in" answers would sign the person out of the account they do have.
function stayOnlyIfHome(path, fallbackRole) {
  const home = signedInHome();
  if (home === path) return;
  const target = home || signInPageFor(signedInRole() || fallbackRole);
  location.replace(target);
  throw new Error(`Not signed in for ${path}; going to ${target}`);
}
