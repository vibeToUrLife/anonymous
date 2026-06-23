/* ════════════════════════════════════════════════════════════════
   🛠️  SITE-WIDE MAINTENANCE MODE
   ----------------------------------------------------------------
   This is the ONLY place you change. Flip the flag below:
     true  → the WHOLE site shows the "Under Maintenance" screen
     false → the site works normally again
   ════════════════════════════════════════════════════════════════ */
window.SITE_MAINTENANCE = true;

if (window.SITE_MAINTENANCE) {
  // Hide all real page content immediately (prevents any flash of the page)
  // and keep only the maintenance screen visible.
  var _mStyle = document.createElement('style');
  _mStyle.textContent =
    'body>*:not(#maintenanceScreen){display:none!important}' +
    'html,body{margin:0;background:#0b0e14}';
  (document.head || document.documentElement).appendChild(_mStyle);

  var _mBuild = function () {
    if (document.getElementById('maintenanceScreen')) return;
    var d = document.createElement('div');
    d.id = 'maintenanceScreen';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0e14;color:#e8eaf0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;font-family:system-ui,-apple-system,sans-serif';
    d.innerHTML =
      '<div style="font-size:64px">🛠️</div>' +
      '<h1 style="margin:0;font-size:22px">Under Maintenance</h1>' +
      '<p style="margin:0;max-width:340px;font-size:14px;color:#9aa0ad;line-height:1.6">We\'re doing some upgrades right now. Please check back again a little later. Thanks for your patience! 🙏</p>';
    document.body.appendChild(d);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mBuild);
  else _mBuild();
}
