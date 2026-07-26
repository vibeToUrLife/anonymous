/* ============================================================
   i18n — one lookup function, with ENGLISH AS THE KEY.

   T('Bigger pasture') returns the Chinese when the language is zh,
   and returns the key itself when it is en. That means English needs
   no dictionary at all, and a string nobody has translated yet falls
   back to readable English instead of a bare `farm.upgrade.pasture`.
   It also means the key is the source text: when the English wording
   changes the old key stops matching, which shows up as English on a
   Chinese screen — visible, and fixable — rather than silently
   serving a stale translation.

   Dictionaries register themselves per area, so a page only carries
   the strings it can actually show. Pages that never load a
   dictionary still work; they just stay English.

   Runs as a browser global. Also loads under Node for tests.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.I18N = api;
  // Bare T() everywhere — this is called from template strings in hot render
  // paths and `I18N.t(...)` at every call site would drown them.
  root.T = api.t;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const LANGS = ['en', 'zh'];
  const STORE_KEY = 'app_lang';
  // The key is normally the English source, so `en` needs no entries. It gets a
  // dictionary anyway for the pages whose markup was WRITTEN in Chinese: there
  // the key is Chinese, zh finds nothing and correctly returns it unchanged,
  // while en looks it up and translates. So a key may be in either language and
  // each dictionary only carries what isn't already in its own.
  const dicts = { en: {}, zh: {} };
  let lang = null;

  // Chinese unless the reader has said otherwise. This app's readers are
  // Chinese speakers; the UI merely happens to be WRITTEN in English, which is
  // a fact about the source, not about the audience. Browser language isn't
  // consulted — a phone set to English is a weak signal next to that, and a
  // wrong guess is worse than a consistent default anyone can change in one tap.
  const DEFAULT_LANG = 'zh';
  function _read() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (LANGS.indexOf(v) >= 0) return v;
    } catch (e) { /* private mode */ }
    return DEFAULT_LANG;
  }

  function getLang() {
    if (lang == null) lang = _read();
    return lang;
  }

  // Switch language. Stores the choice, marks <html lang>, and fires
  // `langchange` so every open view can re-render. Returns the language in
  // effect (unchanged if `next` isn't one we speak).
  function setLang(next, opts) {
    if (LANGS.indexOf(next) < 0) return getLang();
    const was = getLang();
    lang = next;
    try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* private mode */ }
    try { document.documentElement.setAttribute('lang', next === 'zh' ? 'zh-CN' : 'en'); } catch (e) {}
    if (was !== next && !(opts && opts.silent)) {
      try { applyStatic(); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('langchange', { detail: next })); } catch (e) {}
    }
    return next;
  }

  // Add entries for a language. Called by each area's dictionary file, so
  // loading order doesn't matter and a page can carry only what it needs.
  function register(code, entries) {
    if (!entries) return;
    if (!dicts[code]) dicts[code] = {};
    for (const k in entries) if (Object.prototype.hasOwnProperty.call(entries, k)) dicts[code][k] = entries[k];
  }

  // Fill {name} placeholders. Missing values are left as-is rather than
  // printed as "undefined" — a visible {n} is a bug report, "undefined" is a
  // mystery.
  function _fill(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
    });
  }

  // The lookup. `key` is the English source text.
  function t(key, vars) {
    if (key == null) return '';
    const d = dicts[getLang()];
    const hit = d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key;
    return _fill(hit, vars);
  }

  // English pluralisation at the call site, so the dictionary doesn't have to
  // model plural rules for languages that don't have them. Chinese maps both
  // forms to the same entry and simply ignores the distinction.
  function plural(n, one, many, vars) {
    const v = Object.assign({ n: n }, vars || {});
    return t(n === 1 ? one : many, v);
  }

  // Swap static markup in place. Elements opt in:
  //   <span data-i18n>Bigger pasture</span>          → textContent
  //   <input data-i18n-placeholder="Say something">  → that attribute
  // The FIRST sweep records each element's original English in a data slot, so
  // switching back and forth can't compound (translating a translation).
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'value'];
  function applyStatic(rootEl) {
    let scope;
    try { scope = rootEl || document; } catch (e) { return; }
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (el.dataset.i18nSrc == null) el.dataset.i18nSrc = el.textContent.trim();
      el.textContent = t(el.dataset.i18nSrc);
    });
    ATTRS.forEach(function (a) {
      scope.querySelectorAll('[data-i18n-' + a + ']').forEach(function (el) {
        const slot = 'i18nSrc' + a.replace(/(^|-)(\w)/g, function (m, d, c) { return c.toUpperCase(); });
        if (el.dataset[slot] == null) el.dataset[slot] = el.getAttribute(a) || '';
        el.setAttribute(a, t(el.dataset[slot]));
      });
    });
  }

  // Language codes this build speaks, in menu order.
  function langs() { return LANGS.slice(); }
  function label(code) { return code === 'zh' ? '中文' : 'English'; }

  return { t: t, plural: plural, getLang: getLang, setLang: setLang, register: register,
           applyStatic: applyStatic, langs: langs, label: label, _dicts: dicts };
});
