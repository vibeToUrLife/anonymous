/**
 * feedback-corner.js — the site-wide way into the 💬 Feedback Corner.
 *
 * The corner itself (games/feedback.html) always worked; nobody could find
 * it. It hung off a single unlabelled 💬 button on the board — and 💬 on a
 * message board reads as "chat", not "report a problem" — while every
 * mini-game, the room and Pet World, which is where things actually break,
 * had no way in at all.
 *
 * This file is that way in, and it is deliberately ONE file: drop the tag on
 * a page and the page gets the button, its styling and the nudge, with no
 * stylesheet to remember and no per-page toast surgery. It does three things:
 *
 *   1. Puts the button on the page — skipped where the page ships its own,
 *      since the board stacks it with the mood / riddle FABs and owns its spot.
 *   2. Watches showToast() for errors. Every page has one, but no two are the
 *      same function: the board, the room, chess, toto and fishing each wrote
 *      their own, and two of them stack toasts in a container instead of
 *      reusing one node. So this wraps whatever global is there rather than
 *      editing five implementations and hoping they stay in step.
 *   3. After ERR_TO_NUDGE errors close together, pulses the button and pops a
 *      small "tell us" bubble beside it. That is the whole point of the file:
 *      the moment someone has just hit a bug is the one moment they have
 *      something concrete to say, and the one moment they are likely to say
 *      it. A first-visit tour cannot buy that — it arrives before there is
 *      anything to report and is forgotten by the time there is.
 *
 * Deliberately quiet. The bubble is rate-limited to once per NUDGE_COOLDOWN_MS
 * so a flaky connection can't turn it into nagging, the streak expires after
 * ERR_WINDOW_MS so two failures an hour apart aren't "close together", and any
 * successful toast clears the streak so unrelated blips don't add up into one.
 */
(function () {
  'use strict';

  var CFG = {
    PAGE:              'games/feedback.html',  // resolved against the site root, not the current page
    SELF_FILE:         'feedback-corner.js',   // used to find our own <script> when currentScript is unavailable
    ICON:              '🛠️',                   // NOT 💬 — see the header note about the board reading it as "chat"
    FAB_ID:            'feedbackFab',
    FAB_CLASS:         'feedback-fab',
    HINT_ID:           'fbcHint',
    NUDGE_CLASS:       'has-new',
    ERROR_TYPE:        'error',                // the 2nd arg every showToast() call site uses for failures
    ERR_TO_NUDGE:      2,                      // consecutive error toasts before we say anything
    ERR_WINDOW_MS:     120000,                 // 2 min — errors older than this no longer count toward the streak
    HINT_MS:           8000,                   // how long the bubble stays up
    NUDGE_COOLDOWN_MS: 21600000,               // 6 h — at most one bubble per this, per device
    NUDGE_KEY:         'fbc_nudged_at',
    POLL_MS:           200,
    POLL_TRIES:        50,                     // ~10 s waiting for a showToast() defined by a deferred script
  };

  // Our own <script> URL, captured at parse time. currentScript is null inside
  // callbacks, so this has to happen here, at module top level.
  var SELF_SRC = (document.currentScript && document.currentScript.src) || '';

  /* ── Translation ────────────────────────────────────────────────
     English is the key everywhere in this app (see i18n.js), so T() is the
     right call when it exists. But this file loads on pages that never took
     i18n at all — chess, toto and fishing have no dictionary — and the site
     default is Chinese, so falling through to the English key there would
     read as a bug rather than as a language choice. Hence the tiny built-in
     map: same keys, same values as the dictionaries, used only as a fallback.
     ─────────────────────────────────────────────────────────────── */
  var ZH = {
    'Feedback Corner': '意见角',
    'Having trouble? Tell us →': '出问题了？跟我们说一声 →'
  };

  function lang() {
    try {
      var v = localStorage.getItem('app_lang');   // same key i18n.js stores under
      if (v === 'en' || v === 'zh') return v;
    } catch (e) { /* private mode */ }
    return 'zh';                                  // i18n.js's DEFAULT_LANG
  }

  function _t(s) {
    if (typeof T === 'function') return T(s);
    return (lang() === 'zh' && ZH[s]) ? ZH[s] : s;
  }

  /* ── Where is the feedback page from here? ──────────────────────
     Pages sit at three depths (/, /games/, /games/world/) and the site can be
     served from a sub-path, so neither a relative literal nor an absolute one
     works everywhere. Our own script URL is the one thing on the page that
     always points at a known place in the tree, so derive the root from that
     and only fall back to guessing by depth if we somehow can't find it.
     ─────────────────────────────────────────────────────────────── */
  function selfSrc() {
    if (SELF_SRC) return SELF_SRC;
    var tags = document.getElementsByTagName('script');
    for (var i = tags.length - 1; i >= 0; i--) {
      if (tags[i].src && tags[i].src.indexOf(CFG.SELF_FILE) >= 0) return tags[i].src;
    }
    return '';
  }

  function pageUrl() {
    var src = selfSrc();
    if (src) return src.replace(/src\/js\/[^/?#]*(?:[?#].*)?$/, '') + CFG.PAGE;
    // Fallback: place ourselves by path depth instead. Covers the three real depths.
    var p = location.pathname;
    if (p.indexOf('/games/world/') >= 0) return '../' + CFG.PAGE.replace('games/', '');
    if (p.indexOf('/games/') >= 0) return CFG.PAGE.replace('games/', '');
    return CFG.PAGE;
  }

  /* ── Styles ─────────────────────────────────────────────────────
     Injected rather than shipped as a stylesheet so a page needs exactly one
     tag, and PREPENDED to <head> so anything the page itself says wins: the
     board positions this button inside its own FAB stack and must keep that.
     Everything tunable is a custom property, so a page overrides by setting a
     variable instead of restating the rule.

     The pulse lives on ::before, not on box-shadow, on purpose — the board
     themes .feedback-fab's box-shadow with !important, which a keyframe cannot
     beat, so a shadow-based pulse would silently do nothing there.
     ─────────────────────────────────────────────────────────────── */
  var CSS = [
    ':root{',
    '  --fbc-bottom:20px; --fbc-right:18px; --fbc-z:90;',
    '  --fbc-size:48px; --fbc-accent:#3b82f6; --fbc-accent-2:#60a5fa;',
    '}',

    '.' + CFG.FAB_CLASS + '{',
    '  position:fixed; bottom:var(--fbc-bottom); right:var(--fbc-right); z-index:var(--fbc-z);',
    '  width:var(--fbc-size); height:var(--fbc-size);',
    '  border:none; border-radius:50%; text-decoration:none; cursor:pointer;',
    '  background:linear-gradient(135deg,var(--fbc-accent-2) 0%,var(--fbc-accent) 100%);',
    '  color:#fff; font-size:22px; line-height:1;',
    '  box-shadow:0 4px 16px rgba(59,130,246,.4);',
    '  display:flex; align-items:center; justify-content:center;',
    '  transition:transform .2s, box-shadow .2s;',
    '}',
    '.' + CFG.FAB_CLASS + ':hover{transform:scale(1.1); box-shadow:0 6px 24px rgba(59,130,246,.5)}',

    /* Attention state: an expanding ring plus the same red dot the riddle FAB uses. */
    '.' + CFG.FAB_CLASS + '.' + CFG.NUDGE_CLASS + '::before{',
    '  content:""; position:absolute; inset:0; border-radius:50%;',
    '  border:2px solid var(--fbc-accent-2); pointer-events:none;',
    '  animation:fbcRing 1.8s ease-out infinite;',
    '}',
    '.' + CFG.FAB_CLASS + '.' + CFG.NUDGE_CLASS + '::after{',
    '  content:""; position:absolute; top:2px; right:2px;',
    '  width:11px; height:11px; border-radius:50%;',
    '  background:#ef4444; box-shadow:0 0 0 2px rgba(0,0,0,.35); pointer-events:none;',
    '}',
    '@keyframes fbcRing{',
    '  0%{transform:scale(1); opacity:.9}',
    '  70%{transform:scale(1.55); opacity:0}',
    '  100%{transform:scale(1.55); opacity:0}',
    '}',

    /* The bubble sits to the LEFT of the button, never above it: on the board
       the space above is already taken by the riddle FAB. */
    '#' + CFG.HINT_ID + '{',
    '  position:fixed; z-index:var(--fbc-z);',
    '  right:calc(var(--fbc-right) + var(--fbc-size) + 10px);',
    '  bottom:calc(var(--fbc-bottom) + 6px);',
    '  max-width:min(240px,calc(100vw - var(--fbc-size) - 44px));',
    '  padding:9px 13px; border-radius:14px 14px 4px 14px;',
    '  background:linear-gradient(135deg,var(--fbc-accent-2) 0%,var(--fbc-accent) 100%);',
    '  color:#fff; font-size:13px; font-weight:600; line-height:1.45;',
    '  text-decoration:none; box-shadow:0 6px 20px rgba(59,130,246,.42);',
    '  opacity:0; transform:translateY(6px) scale(.96); pointer-events:none;',
    '  transition:opacity .25s ease, transform .25s ease;',
    '}',
    '#' + CFG.HINT_ID + '.show{opacity:1; transform:none; pointer-events:auto}',

    '@media (prefers-reduced-motion:reduce){',
    '  .' + CFG.FAB_CLASS + '.' + CFG.NUDGE_CLASS + '::before{animation:none; opacity:.9}',
    '  #' + CFG.HINT_ID + '{transition:none}',
    '}'
  ].join('');

  function injectStyles() {
    var head = document.head || document.documentElement;
    var el = document.createElement('style');
    el.id = 'fbcStyles';
    el.textContent = CSS;
    head.insertBefore(el, head.firstChild);   // first, so page CSS always wins
  }

  /* ── The button ─────────────────────────────────────────────── */
  function ensureFab() {
    var existing = document.getElementById(CFG.FAB_ID);
    if (existing) return existing;            // the board ships its own, stacked with the other FABs
    var a = document.createElement('a');
    a.id = CFG.FAB_ID;
    a.className = CFG.FAB_CLASS;
    a.href = pageUrl();
    a.textContent = CFG.ICON;
    a.title = _t('Feedback Corner');
    // Re-translate on a language switch. i18n's applyStatic() would otherwise
    // adopt whatever text is in the attribute AS the key on its first sweep,
    // and we just put a translation there — so hand it the English key up front.
    a.setAttribute('data-i18n-title', '');
    a.dataset.i18nSrcTitle = 'Feedback Corner';
    document.body.appendChild(a);
    return a;
  }

  /* ── The nudge ──────────────────────────────────────────────── */
  var streak = 0;
  var streakAt = 0;
  var hintTimer = null;

  function nudgedRecently() {
    try {
      var at = parseInt(localStorage.getItem(CFG.NUDGE_KEY) || '0', 10);
      return at > 0 && (Date.now() - at) < CFG.NUDGE_COOLDOWN_MS;
    } catch (e) { return false; }
  }

  function markNudged() {
    try { localStorage.setItem(CFG.NUDGE_KEY, String(Date.now())); } catch (e) { /* private mode */ }
  }

  function showHint() {
    var fab = document.getElementById(CFG.FAB_ID);
    if (fab) fab.classList.add(CFG.NUDGE_CLASS);

    var hint = document.getElementById(CFG.HINT_ID);
    if (!hint) {
      hint = document.createElement('a');
      hint.id = CFG.HINT_ID;
      hint.href = pageUrl();
      hint.setAttribute('data-i18n', '');
      hint.dataset.i18nSrc = 'Having trouble? Tell us →';   // the key, not the translation — see ensureFab()
      document.body.appendChild(hint);
    }
    hint.textContent = _t('Having trouble? Tell us →');
    // Next frame, so the element has its start state before .show transitions it.
    requestAnimationFrame(function () { hint.classList.add('show'); });

    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.classList.remove('show'); }, CFG.HINT_MS);
  }

  // Is the button actually on screen, or is something over it? The mini-games
  // stack login gates and game-over cards well above the FAB layer, and that
  // ordering is deliberate — a feedback button floating on top of a sign-in
  // screen would be worse than one you have to close a card to reach.
  function fabReachable() {
    var fab = document.getElementById(CFG.FAB_ID);
    if (!fab) return false;
    var r = fab.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === fab || fab.contains(hit));
  }

  function noteError() {
    var now = Date.now();
    if (streakAt && (now - streakAt) > CFG.ERR_WINDOW_MS) streak = 0;  // too long ago to be the same trouble
    streak++;
    streakAt = now;
    if (streak < CFG.ERR_TO_NUDGE || nudgedRecently()) return;
    // Covered right now: spending the once-per-6h nudge on a bubble nobody can
    // see would waste it entirely. Hold the streak one below the threshold so
    // the very next error tries again, by which time the card is usually gone.
    if (!fabReachable()) { streak = CFG.ERR_TO_NUDGE - 1; return; }
    streak = 0;
    markNudged();
    showHint();
  }

  /* ── Toast hook ─────────────────────────────────────────────────
     showToast is a plain global on every page that has one, but it can be
     defined by a deferred script that runs after us, so poll briefly instead
     of assuming it is already there. The wrapper is marked so a second load
     of this file can't double-wrap.
     ─────────────────────────────────────────────────────────────── */
  function hookToast() {
    var tries = 0;
    var iv = setInterval(function () {
      var fn = window.showToast;
      if (typeof fn === 'function' && !fn.__fbc) {
        clearInterval(iv);
        var wrapped = function (msg, type) {
          try {
            if (type === CFG.ERROR_TYPE) noteError();
            else streak = 0;                  // anything that worked ends the streak
          } catch (e) { /* never let the nudge break a toast */ }
          return fn.apply(this, arguments);
        };
        wrapped.__fbc = true;
        window.showToast = wrapped;
      } else if (++tries > CFG.POLL_TRIES) {
        clearInterval(iv);                    // no toast on this page; the button alone is still a win
      }
    }, CFG.POLL_MS);
  }

  function init() {
    if (document.getElementById('fbcStyles')) return;   // already ran
    injectStyles();
    ensureFab();
    hookToast();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
