/* theme.js — light/dark control for the Clay design system.
   Pure helpers (resolveTheme/nextTheme) are unit-tested; DOM/localStorage
   wiring runs only in the browser. Dual-export: CommonJS for tests + window global. */
(function (root) {
  'use strict';
  var STORAGE_KEY = 'theme'; // stored value: 'dark' | 'light'

  function resolveTheme(stored) { return (stored === 'dark' || stored === 'terminal') ? stored : 'light'; } // default light
  function nextTheme(current) { return current === 'dark' ? 'light' : 'dark'; }

  var api = { resolveTheme: resolveTheme, nextTheme: nextTheme, STORAGE_KEY: STORAGE_KEY };

  if (typeof document !== 'undefined') {
    function apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      // Back-compat: legacy CSS/JS keyed on body.light-theme (removed by Task 16).
      if (document.body) document.body.classList.toggle('light-theme', theme === 'light');
    }
    function getStored() { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }
    function setTheme(theme) { try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {} apply(theme); }
    api.apply = apply;
    api.getTheme = function () { return resolveTheme(getStored()); };
    api.setTheme = setTheme;
    api.toggle = function () { setTheme(nextTheme(api.getTheme())); };
    api.init = function () { apply(api.getTheme()); };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Theme = api;
})(typeof window !== 'undefined' ? window : globalThis);
