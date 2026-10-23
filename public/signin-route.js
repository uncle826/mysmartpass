// already signed in on this device: skip the sign-in page, or use the one for your own role
{
  const home = signedInHome();
  const role = signedInRole();
  const pageRole = location.pathname.includes("teacher") ? "teacher" : "student";
  if (home) location.replace(home);
  else if (role && role !== pageRole) location.replace(signInPageFor(role));
}
