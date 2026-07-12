/**
 * live-reactions.js — Shared live-effects hub for the bubble board.
 *
 * The tap-to-float emoji bar was removed; this module now only powers:
 *  - window.fireSuperReaction(type) — full-screen hearts / rain / fireworks,
 *    fired from the coin center after payment and seen by everyone online.
 *  - window.LiveFx.send(fields) — the shared outgoing lane bubble-knock.js uses
 *    to broadcast knock / ripple events.
 * Incoming events (super / knock / ripple) are received here and dispatched.
 * Everything rides on ONE tiny shared Firestore doc (board_reactions/live)
 * holding a short rolling list of recent events, coalesced with arrayUnion and
 * trimmed opportunistically so the doc stays tiny.
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

  /* ── Full-screen Super Reaction effects (paid, seen by everyone) ── */
  const FX_COLORS = ['#ff5f6d', '#ffc371', '#5ee7df', '#fde047', '#c084fc', '#34d399', '#60a5fa', '#f472b6'];

  // A quick full-screen colour wash so the effect feels big.
  function superFlash(color) {
    const f = document.createElement('div');
    f.className = 'super-flash';
    f.style.background = 'radial-gradient(circle at 50% 45%, ' + color + ' 0%, transparent 70%)';
    ensureLayer().appendChild(f);
    setTimeout(() => f.remove(), 750);
  }

  // One firework: a rocket streaks up, then bursts into a glowing, gravity-fed ring.
  function fireworkBurst() {
    const cx = 10 + Math.random() * 80, cy = 14 + Math.random() * 42;
    const color = FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];
    // Rocket trail rising to the burst point.
    const rocket = document.createElement('div');
    rocket.className = 'fw-rocket';
    rocket.style.left = cx + 'vw';
    rocket.style.top = cy + 'vh';
    rocket.style.background = color;
    rocket.style.boxShadow = '0 0 10px ' + color;
    ensureLayer().appendChild(rocket);
    setTimeout(() => rocket.remove(), 520);
    // The explosion (slightly after the rocket arrives).
    setTimeout(() => {
      const flash = document.createElement('div');
      flash.className = 'fw-flash';
      flash.style.left = cx + 'vw'; flash.style.top = cy + 'vh'; flash.style.background = color;
      ensureLayer().appendChild(flash);
      setTimeout(() => flash.remove(), 500);
      const N = 28;
      for (let i = 0; i < N; i++) {
        const p = document.createElement('div');
        p.className = 'fw-spark';
        const ang = (Math.PI * 2) * (i / N) + Math.random() * 0.18;
        const dist = 70 + Math.random() * 100;
        const col = Math.random() < 0.28 ? '#ffffff' : color;
        p.style.left = cx + 'vw'; p.style.top = cy + 'vh';
        p.style.background = col;
        p.style.boxShadow = '0 0 8px ' + col;
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        p.style.setProperty('--dur', (1.3 + Math.random() * 1.0) + 's');
        ensureLayer().appendChild(p);
        (function (node) { setTimeout(() => node.remove(), 2600); })(p);
      }
    }, 480);
  }
  function spawnFireworks() {
    superFlash('rgba(255,215,0,0.18)');
    for (let b = 0; b < 26; b++) setTimeout(fireworkBurst, b * 300);
  }

  function spawnHearts() {
    superFlash('rgba(255,77,109,0.2)');
    // Giant pulsing heart in the middle.
    const big = document.createElement('div');
    big.className = 'super-bigheart';
    big.textContent = '❤️';
    ensureLayer().appendChild(big);
    setTimeout(() => big.remove(), 1500);
    // A fountain of assorted hearts rising with sway.
    const hearts = ['❤️', '💖', '💕', '💗', '💓', '💘', '😍', '💝'];
    for (let i = 0; i < 90; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'super-heart';
        el.textContent = hearts[Math.floor(Math.random() * hearts.length)];
        el.style.left = (4 + Math.random() * 92) + 'vw';
        el.style.fontSize = (18 + Math.random() * 30) + 'px';
        const dur = 3.2 + Math.random() * 2.2;
        el.style.setProperty('--dur', dur + 's');
        el.style.setProperty('--sway', (Math.random() * 90 - 45) + 'px');
        ensureLayer().appendChild(el);
        (function (n, d) { setTimeout(() => n.remove(), (d + 0.5) * 1000); })(el, dur);
      }, i * 55);
    }
  }

  function spawnRain() {
    superFlash('rgba(94,231,223,0.16)');
    const emojis = ['🎉', '🎊', '⭐', '💫', '✨', '🌟', '💰', '🍀', '🎈'];
    for (let i = 0; i < 110; i++) {
      const conf = Math.random() < 0.5;
      const el = document.createElement('div');
      if (conf) {
        el.className = 'super-confetti';
        el.style.background = FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];
      } else {
        el.className = 'super-fall';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.fontSize = (16 + Math.random() * 22) + 'px';
      }
      el.style.left = (Math.random() * 99) + 'vw';
      const dur = 3.0 + Math.random() * 2.6;
      el.style.setProperty('--dur', dur + 's');
      el.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      el.style.setProperty('--sway', (Math.random() * 120 - 60) + 'px');
      const delay = Math.random() * 3;
      el.style.animationDelay = delay + 's';
      ensureLayer().appendChild(el);
      (function (node, t) { setTimeout(() => node.remove(), t); })(el, (delay + dur + 1.0) * 1000);
    }
  }

  function spawnSuper(type) {
    if (type === 'hearts') spawnHearts();
    else if (type === 'rain') spawnRain();
    else if (type === 'fireworks') spawnFireworks();
  }

  // Fire an effect for everyone online (called by coin-center after payment).
  window.fireSuperReaction = function (type) {
    spawnSuper(type);                              // instant local feedback
    const ev = { id: (myUid || 'anon') + ':s' + (seq++) + ':' + Math.floor(Math.random() * 1e6), sx: type };
    seen.add(ev.id);                              // don't double-spawn our own echo
    reactionDoc.set({ events: FieldValue.arrayUnion(ev) }, { merge: true }).catch(() => {});
  };

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

  // Shared outgoing lane for other live-layer features (bubble-knock.js):
  // builds the event, marks it seen (no self-echo) and rides the same
  // coalesced write. Accepts {k: bubbleId} or {rp: [xPct, yPct]}.
  window.LiveFx = {
    send: function (fields) {
      if (!fields) return;
      const rnd = Math.floor(Math.random() * 1e6);
      let ev = null;
      if (fields.k != null)            ev = L.makeKnockEvent(myUid, seq++, rnd, fields.k);
      else if (Array.isArray(fields.rp)) ev = L.makeRippleEvent(myUid, seq++, rnd, fields.rp[0], fields.rp[1]);
      if (!ev) return;
      seen.add(ev.id);
      pending.push(ev);
      scheduleFlush();
    }
  };

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
      if (primed) fresh.forEach(e => {
        const kind = L.classifyLiveEvent(e);
        if (kind === 'super') spawnSuper(e.sx);
        else if (kind === 'knock' || kind === 'ripple') { if (window.BubbleKnock) BubbleKnock.play(e); }
      });
      // Firestore persistence serves a CACHED doc first, so events that
      // arrived while we were away would look "fresh" on the first server
      // snapshot and replay as a burst — stay in seed-only mode until a
      // snapshot actually from the server.
      primed = primed || !(doc.metadata && doc.metadata.fromCache);
      maybeTrim(events);
      // Bound the seen set; rebuild from current doc so nothing replays.
      if (seen.size > 400) {
        seen.clear();
        events.forEach(e => { if (e && e.id) seen.add(e.id); });
        // Our own queued/in-flight events aren't in the doc yet — keep their
        // ids or they'd self-echo when the flush lands.
        pending.forEach(e => { if (e && e.id) seen.add(e.id); });
      }
    }, () => {});
  }

  /* ── Lifecycle ───────────────────────────────────────────── */
  auth.onAuthStateChanged((user) => {
    if (!user) return;
    myUid = user.uid;
    if (!unsub) subscribe();
  });
})();
