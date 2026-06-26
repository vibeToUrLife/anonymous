/**
 * stay-time.js — Site-wide 停留时间 (active-time) tracker.
 *
 * Loaded on EVERY user-facing page (the board, every mini-game, and the
 * room / farm / aquarium). It measures only time the page is genuinely in use —
 * the tab must be visible AND the user must have interacted within IDLE_MS —
 * and folds those whole seconds into rooms/{uid}.totalStaySec with
 * FieldValue.increment. The bubble board reads that single field to show the
 * user's running total and to build the 停留榜 (see stay-ranking.js).
 *
 * Cheap & resilient, mirroring presence.js / bubble-playground.js:
 *  - accrues locally; writes at most once per FLUSH_MS, plus on tab-hide and
 *    on unload, so idle / background tabs cost zero Firestore writes,
 *  - self-contained: it never calls initializeApp itself (each page already
 *    does), it just waits for the app to be ready, then hooks the auth state.
 */
(function () {
  'use strict';
  if (typeof firebase === 'undefined') return;

  var FLUSH_MS = 60000;    // push accrued seconds at most once a minute
  var IDLE_MS  = 300000;   // 5 min with no interaction → pause the clock
  var TICK_MS  = 1000;

  var auth = null, db = null, FieldValue = null;
  var uid = null, accruedMs = 0, lastActive = 0, lastTick = 0;
  var tickTimer = null, flushTimer = null;

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }
  function markActive() { lastActive = now(); }
  function counting() {
    return uid && !document.hidden && (now() - lastActive) < IDLE_MS;
  }

  function tick() {
    var t = now(), dt = t - lastTick;
    lastTick = t;
    // Ignore long gaps (throttled background timers / device sleep) — only
    // contiguous foreground time should count.
    if (dt > 0 && dt < TICK_MS * 2 && counting()) accruedMs += dt;
  }

  function flush() {
    if (!uid) return;
    var sec = Math.floor(accruedMs / 1000);
    if (sec <= 0) return;
    accruedMs -= sec * 1000;
    db.collection('rooms').doc(uid)
      .set({ totalStaySec: FieldValue.increment(sec) }, { merge: true })
      .catch(function () { accruedMs += sec * 1000; });   // restore → retry later
  }

  function start() {
    try {
      auth = firebase.auth();
      db = firebase.firestore();
      FieldValue = firebase.firestore.FieldValue;
    } catch (e) { return; }

    ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(function (ev) {
      window.addEventListener(ev, markActive, { passive: true });
    });

    auth.onAuthStateChanged(function (u) {
      uid = u ? u.uid : null;
      if (!uid) return;
      markActive();
      lastTick = now();
      if (!tickTimer)  tickTimer  = setInterval(tick, TICK_MS);
      if (!flushTimer) flushTimer = setInterval(flush, FLUSH_MS);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
      else { lastTick = now(); markActive(); }
    });
    window.addEventListener('beforeunload', flush);
  }

  // Each page initialises Firebase itself; just wait until it has, then start.
  if (firebase.apps && firebase.apps.length) start();
  else {
    var tries = 0;
    var iv = setInterval(function () {
      if (firebase.apps && firebase.apps.length) { clearInterval(iv); start(); }
      else if (++tries > 100) clearInterval(iv);   // give up after ~10s
    }, 100);
  }
})();
