/* ════════════════════════════════════════════════════════════════
   🛠️  SITE-WIDE MAINTENANCE MODE
   ----------------------------------------------------------------
   Two ways to turn it on:

   1) EMERGENCY OVERRIDE (instant, no network): flip the flag below to
      true. The maintenance screen shows immediately, before anything
      else loads. Use this only if Firestore itself is unreachable.

   2) ADMIN DASHBOARD (normal way): leave the flag false and toggle it
      from admin.html. That writes app_state/maintenance = {enabled,
      message}; every page reads it on load and shows the screen when
      enabled — no code change / redeploy needed.
   ════════════════════════════════════════════════════════════════ */
window.SITE_MAINTENANCE = false;

(function () {
  'use strict';

  var DEFAULT_MSG =
    "We're doing some upgrades right now. Please check back again a little later. Thanks for your patience! 🙏";

  // Build (once) and show the full-screen maintenance overlay.
  function showMaintenance(message) {
    if (document.getElementById('maintenanceScreen')) return;

    var style = document.createElement('style');
    style.textContent =
      'body>*:not(#maintenanceScreen){display:none!important}' +
      'html,body{margin:0;background:#0b0e14}';
    (document.head || document.documentElement).appendChild(style);

    var build = function () {
      if (document.getElementById('maintenanceScreen')) return;
      var d = document.createElement('div');
      d.id = 'maintenanceScreen';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0e14;color:#e8eaf0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;font-family:system-ui,-apple-system,sans-serif';
      var p = document.createElement('p');
      p.style.cssText = 'margin:0;max-width:340px;font-size:14px;color:#9aa0ad;line-height:1.6';
      p.textContent = message || DEFAULT_MSG;   // textContent → no HTML injection from the custom message
      d.innerHTML =
        '<div style="font-size:64px">🛠️</div>' +
        '<h1 style="margin:0;font-size:22px">Under Maintenance</h1>';
      d.appendChild(p);
      document.body.appendChild(d);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
  }
  window.showMaintenance = showMaintenance;

  // 1) Emergency override — instant, no network needed.
  if (window.SITE_MAINTENANCE) { showMaintenance(); return; }

  // 2) Remote switch — wait for Firebase (initialised by app.js / each game page),
  //    then read the maintenance doc ONCE on load. A single get() (not a live
  //    listener) keeps the cost to one Firestore read per page view.
  var tries = 0;
  var iv = setInterval(function () {
    if (window.firebase && firebase.apps && firebase.apps.length) {
      clearInterval(iv);
      try {
        firebase.firestore().doc('app_state/maintenance').get()
          .then(function (snap) {
            if (snap.exists && snap.data().enabled) showMaintenance(snap.data().message);
          })
          .catch(function () {});
      } catch (e) {}
    } else if (++tries > 100) {
      clearInterval(iv);   // ~10s — Firebase never showed up; skip silently.
    }
  }, 100);
})();
