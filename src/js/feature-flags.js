/* ════════════════════════════════════════════════════════════════
   feature-flags.js — site-wide feature kill-switches.
   ----------------------------------------------------------------
   Reads app_state/features once on load. Any feature whose flag is
   explicitly false has its entry point hidden, so users can't open it.
   A missing or true flag means the feature stays ON (default).
   Toggle these from the admin dashboard → Site → Feature switches.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // feature key → the element id(s) that are its entry point on this page.
  // Some flags have no entry-point element and are instead checked in code
  // via window.FEATURES at event time:
  //   knock     — bubble-knock.js (false = no knocks or ambient ripples)
  var MAP = {
    coin_rush:      ['crBanner'],
    riddle:         ['riddleFab'],
    chengyu:        ['cjFab'],
    quote_comments: ['quoteCommentSection', 'quoteCommentToggle'],
    world:          ['worldEntry'],
    jar:            ['jarToggle'],   // per-bubble 收藏 buttons: bubble-jar.js
    doodle:         ['doodleBtn'],
    wall:           ['wallToggle']
  };

  function apply(flags) {
    window.FEATURES = flags || {};
    Object.keys(MAP).forEach(function (key) {
      if (flags && flags[key] === false) {
        MAP[key].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
      }
    });
  }

  function load() {
    try {
      firebase.firestore().doc('app_state/features').get()
        .then(function (snap) { apply(snap.exists ? snap.data() : {}); })
        .catch(function () {});
    } catch (e) {}
  }

  // Wait until Firebase is initialised (by app.js) before reading.
  if (window.firebase && firebase.apps && firebase.apps.length) load();
  else {
    var tries = 0, iv = setInterval(function () {
      if (window.firebase && firebase.apps && firebase.apps.length) { clearInterval(iv); load(); }
      else if (++tries > 100) clearInterval(iv);
    }, 100);
  }
})();
