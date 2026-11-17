// Dashboard-generated recovery emails may return to the site root.
// Forward before creating an Auth client so the recovery page receives the link.
(function () {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('type') === 'recovery' || params.has('error')) {
    location.replace(new URL('reset.html', location.href).href.split('#')[0] + location.hash);
  }
})();
