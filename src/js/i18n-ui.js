/* ============================================================
   The language switch, shared by every page that has one.

   Looks for #langSelect containing buttons with data-lang-val, marks
   the active one, and switches on click. Pages differ in what they
   need to repaint afterwards, so this only fires `langchange` (from
   I18N.setLang) and sweeps static markup — each page listens and
   re-renders whatever it draws itself.
   ============================================================ */
(function () {
  if (typeof document === 'undefined' || typeof I18N === 'undefined') return;

  function paintActive() {
    const box = document.getElementById('langSelect');
    if (!box) return;
    const cur = I18N.getLang();
    box.querySelectorAll('[data-lang-val]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang-val') === cur);
    });
  }

  function init() {
    // Mark <html lang> and translate the static markup for the stored choice,
    // without firing langchange — nothing has rendered yet to listen for it.
    I18N.setLang(I18N.getLang(), { silent: true });
    try { document.documentElement.setAttribute('lang', I18N.getLang() === 'zh' ? 'zh-CN' : 'en'); } catch (e) {}
    I18N.applyStatic();
    paintActive();

    const box = document.getElementById('langSelect');
    if (box) {
      box.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-lang-val]');
        if (!btn) return;
        I18N.setLang(btn.getAttribute('data-lang-val'));   // fires langchange
        paintActive();
        // Follow the account, like every other preference (app.js owns the
        // debounced write; on pages without it the local choice still sticks).
        if (typeof syncSettingsToAccount === 'function') syncSettingsToAccount();
      });
    }
    // Another device changed it, or something else called setLang.
    window.addEventListener('langchange', paintActive);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
