/**
 * live-reactions.js — Floating live emoji reactions for the bubble board.
 *
 * Tap an emoji in the reaction bar and it floats up the screen. The tap is also
 * broadcast to everyone currently online, so you see each other's reactions in
 * real time. Everything rides on ONE tiny shared Firestore doc
 * (board_reactions/live) holding a short rolling list of recent events.
 *
 * Firestore optimisation:
 *  - Taps are coalesced (BoardLive.REACTION_THROTTLE_MS) into a single write,
 *    appended with arrayUnion so concurrent senders never clobber each other.
 *  - The list is trimmed to BoardLive.REACTION_CAP opportunistically, and only
 *    when it has grown well past the cap, so trims are rare.
 *  - One document listener for the whole feature; the doc stays tiny.
 *
 * Depends on globals from app.js (db, auth, firebase) and board-live-logic.js
 * (BoardLive). Loaded after both.
 */
(function () {
  'use strict';

  if (typeof db === 'undefined' || typeof auth === 'undefined' || typeof firebase === 'undefined') return;
  const L = (typeof BoardLive !== 'undefined') ? BoardLive : null;
  if (!L) return;

  const FieldValue   = firebase.firestore.FieldValue;
  const reactionDoc  = db.collection('board_reactions').doc('live');
  const bar          = document.getElementById('reactionBar');

  let layer   = null;        // full-screen float layer (created lazily)
  let myUid   = null;
  let seq     = 0;           // per-session counter → unique event ids
  let pending = [];          // events queued for the next throttled write
  let flushTimer = null;
  let unsub   = null;
  let primed  = false;       // first snapshot just records ids (no load burst)
  const seen  = new Set();   // event ids already animated

  /* ── Floating animation ──────────────────────────────────── */
  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'reactionLayer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  function spawnFloat(emojiIdx) {
    const el = document.createElement('div');
    el.className = 'reaction-float';
    el.textContent = L.REACTIONS[emojiIdx] || L.REACTIONS[0];
    // Random lane, drift, size and speed for an organic confetti feel.
    const x     = 8 + Math.random() * 84;        // vw
    const drift = (Math.random() * 60 - 30);     // px sideways
    const size  = 22 + Math.random() * 16;       // px
    const dur   = 2.6 + Math.random() * 1.2;     // s
    el.style.left = x + 'vw';
    el.style.fontSize = size + 'px';
    el.style.setProperty('--drift', drift + 'px');
    el.style.setProperty('--dur', dur + 's');
    ensureLayer().appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), dur * 1000 + 400); // safety net
  }

  /* ── Broadcast (throttled) ───────────────────────────────── */
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, L.REACTION_THROTTLE_MS);
  }

  function flush() {
    flushTimer = null;
    if (!pending.length || !myUid) { pending = []; return; }
    const batch = pending;
    pending = [];
    reactionDoc
      .set({ events: FieldValue.arrayUnion.apply(null, batch) }, { merge: true })
      .catch(() => {});
  }

  function onTap(emojiIdx) {
    spawnFloat(emojiIdx);                         // instant local feedback
    const ev = L.makeReactionEvent(myUid, seq++, Math.floor(Math.random() * 1e6), emojiIdx);
    seen.add(ev.id);                              // don't double-spawn our own echo
    pending.push(ev);
    scheduleFlush();
  }

  function buildBar() {
    if (!bar || bar._built) return;
    bar._built = true;
    L.REACTIONS.forEach((emoji, idx) => {
      const b = document.createElement('button');
      b.className = 'reaction-btn';
      b.type = 'button';
      b.textContent = emoji;
      b.title = 'Send ' + emoji;
      b.addEventListener('click', () => onTap(idx));
      bar.appendChild(b);
    });
  }

  /* ── Receive ─────────────────────────────────────────────── */
  function maybeTrim(events) {
    // Only trim when the list has grown well past the cap, and at most once
    // every few seconds, so clients don't fight over the doc. Losing a couple
    // of in-flight confetti events is harmless.
    if (events.length <= L.REACTION_CAP * 2) return;
    if (maybeTrim._t && Date.now() - maybeTrim._t < 5000) return;
    maybeTrim._t = Date.now();
    reactionDoc.set({ events: L.trimEvents(events, L.REACTION_CAP) }).catch(() => {});
  }

  function subscribe() {
    if (unsub) unsub();
    unsub = reactionDoc.onSnapshot((doc) => {
      const data   = doc.exists ? doc.data() : null;
      const events = (data && Array.isArray(data.events)) ? data.events : [];
      const fresh  = L.unseenEvents(events, seen);
      fresh.forEach(e => seen.add(e.id));
      // The first snapshot only seeds ids so a freshly opened board doesn't
      // replay a backlog of old reactions.
      if (primed) fresh.forEach(e => spawnFloat(e.i));
      primed = true;
      maybeTrim(events);
      // Bound the seen set; rebuild from current doc so nothing replays.
      if (seen.size > 400) {
        seen.clear();
        events.forEach(e => { if (e && e.id) seen.add(e.id); });
      }
    }, () => {});
  }

  /* ── Lifecycle ───────────────────────────────────────────── */
  auth.onAuthStateChanged((user) => {
    if (!user) return;
    myUid = user.uid;
    buildBar();
    if (!unsub) subscribe();
  });
})();
