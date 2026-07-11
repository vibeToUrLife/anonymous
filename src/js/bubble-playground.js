/**
 * bubble-playground.js — A playful physics mode for the bubble board.
 *
 * Toggle it on and the current messages become floating balls in a full-screen
 * overlay: they drift and bounce off the walls, you can grab and fling them,
 * and tapping one pops it for a coin (with a confetti burst).
 *
 * TWO MODES:
 *
 *  · SHARED (default when the Realtime Database is reachable): true shared
 *    physics. One player is the HOST — their browser simulates the balls in
 *    the fixed virtual space from playground-shared-logic.js and streams
 *    positions to RTDB at PS.NET_MS. Everyone renders the same balls in the
 *    same places; pops are write-once RTDB claims (first tap wins, exactly the
 *    Coin Rush robbing pattern); flings from non-hosts travel as input events;
 *    chain-pop cascades are refereed by the host so all screens see the same
 *    chain; a shared daily co-op counter celebrates every milestone. If the
 *    host disappears the earliest-joined player takes over automatically.
 *
 *  · LOCAL (fallback): the original solo mode, used when RTDB is missing,
 *    the pg_shared feature flag is off, or joining the shared room fails
 *    (e.g. database rules not deployed yet).
 *
 * The coin economy is untouched: BoardLive.grantPopCoins caps earnings per day
 * with a tiny localStorage state (zero extra reads), and granted coins are
 * batched into a single Firestore increment on close / tab-hide / every few
 * seconds — never one write per pop. Chain combos are celebration only.
 *
 * Depends on globals from app.js (db, auth, firebase), board-live-logic.js
 * (BoardLive) and playground-shared-logic.js (PlaygroundShared). Loaded after
 * all three.
 */
(function () {
  'use strict';

  if (typeof db === 'undefined' || typeof auth === 'undefined' || typeof firebase === 'undefined') return;
  const L = (typeof BoardLive !== 'undefined') ? BoardLive : null;
  if (!L) return;
  const PS = (typeof PlaygroundShared !== 'undefined') ? PlaygroundShared : null;

  const toggleBtn = document.getElementById('pgToggle');
  if (!toggleBtn) return;

  const FieldValue = firebase.firestore.FieldValue;
  const CAP_KEY    = 'board_pop_cap';   // localStorage: {day, count}

  // Realtime DB (shared mode). Guarded like coin-rush.js: if RTDB isn't
  // configured firebase.database() throws and we quietly stay local-only.
  let rtdb = null;
  try { rtdb = (PS && firebase.database) ? firebase.database() : null; } catch (e) { rtdb = null; }

  let overlay = null, field = null, coinEl = null, liveEl = null, coopEl = null;
  let rafId = null, lastT = 0;
  let active = false;
  let mode = 'local';       // 'local' | 'shared' for the CURRENT session
  let myUid = null;
  let sessionCoins = 0;     // coins earned this playground session (display)
  let pendingCoins = 0;     // coins awaiting a batched Firestore flush
  let flushTimer = null;
  let cappedNotice = false; // show the "daily max" hint only once per session

  auth.onAuthStateChanged((u) => { myUid = u ? u.uid : null; });

  /* ── Daily pop-coin cap (pure logic + localStorage, no extra reads) ── */
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function loadCap() { try { return JSON.parse(localStorage.getItem(CAP_KEY)) || null; } catch (e) { return null; } }
  function saveCap(s) { try { localStorage.setItem(CAP_KEY, JSON.stringify(s)); } catch (e) {} }

  function awardPop(n) {
    const res = L.grantPopCoins(loadCap(), todayKey(), n || 1);
    saveCap(res.state);
    if (res.granted > 0) {
      pendingCoins += res.granted;
      sessionCoins += res.granted;
      scheduleFlush();
    } else {
      cappedNotice = true;
    }
    updateCoinLabel();
    return res.granted;
  }

  /* ── Batched coin flush ──────────────────────────────────── */
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushCoins, 8000);
  }
  function flushCoins() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!pendingCoins || !myUid) return;
    const amt = pendingCoins;
    pendingCoins = 0;
    db.collection('rooms').doc(myUid)
      .set({ coins: FieldValue.increment(amt) }, { merge: true })
      .catch(() => { pendingCoins += amt; });   // restore so we retry later
  }

  /* ── Extract a short label from a rendered message bubble ── */
  function extractText(bubbleEl) {
    const pollQ = bubbleEl.querySelector('.poll-question');
    if (pollQ) return ('📊 ' + (pollQ.textContent || '').trim()).slice(0, 60);
    // Shared-space card → use its title (e.g. "🏠 Alex's Room").
    const spaceTitle = bubbleEl.querySelector('.space-card-title');
    if (spaceTitle) return (spaceTitle.textContent || '').trim().slice(0, 60);
    const clone = bubbleEl.cloneNode(true);
    clone.querySelectorAll(
      '.bubble-hp-wrapper,.bubble-reactions,.bubble-footer,.bubble-deco,.replies-container,.answer-sender,img'
    ).forEach(n => n.remove());
    let t = (clone.textContent || '').trim().replace(/\s+/g, ' ');
    if (!t) t = '💬';
    return t.slice(0, 60);
  }

  function boardLabels() {
    const bubbles = Array.prototype.slice.call(document.querySelectorAll('#bubbleWrap .bubble'));
    let items = bubbles.map(extractText);
    // Never let it be empty — seed a few friendly placeholders.
    if (!items.length) items = ['Hi! 👋', '🎉', 'pop me', 'bubble', '😄', 'play!'];
    return items;
  }

  /* ── Overlay scaffolding ─────────────────────────────────── */
  function buildOverlay(shared) {
    overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div class="pg-header">' +
        '<span class="pg-title">🫧 Bubble Playground</span>' +
        (shared ? '<span class="pg-live" id="pgLive" title="playing right now">🟢 1</span>' : '') +
        '<span class="pg-coins" id="pgCoins">🪙 0</span>' +
        '<button class="pg-close" id="pgClose" title="Close (Esc)">✕</button>' +
      '</div>' +
      '<div class="pg-hint">Drag to fling · tap a bubble to pop it for a coin</div>' +
      (shared ? '<div class="pg-coop" id="pgCoop">🤝 今日一起 pop 了 <b>0</b> 个</div>' : '') +
      '<div class="pg-field" id="pgField"></div>';
    document.body.appendChild(overlay);
    field  = overlay.querySelector('#pgField');
    coinEl = overlay.querySelector('#pgCoins');
    liveEl = overlay.querySelector('#pgLive');
    coopEl = overlay.querySelector('#pgCoop');
    overlay.querySelector('#pgClose').addEventListener('click', deactivate);
  }

  function updateCoinLabel() {
    if (!coinEl) return;
    coinEl.textContent = '🪙 ' + sessionCoins + (cappedNotice ? ' (daily max)' : '');
  }

  /* ── Confetti burst (both modes) ─────────────────────────── */
  function spawnBurstAt(cx, cy, colorCss) {
    if (!field) return;
    const N = 10;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('div');
      p.className = 'pg-pop';
      const ang = (Math.PI * 2) * (i / N);
      const dist = 30 + Math.random() * 30;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = colorCss;
      p.style.setProperty('--px', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--py', Math.sin(ang) * dist + 'px');
      field.appendChild(p);
      (function (node) { setTimeout(() => node.remove(), 600); })(p);
    }
  }

  /* ══════════════════════════════════════════════════════════
     LOCAL MODE — the original solo physics (fallback)
     ══════════════════════════════════════════════════════════ */
  let lBalls = [];

  function lSpawnBalls() {
    if (!field) return;
    const W = field.clientWidth, H = field.clientHeight;
    boardLabels().forEach((text, i) => {
      const size = Math.round(60 + Math.min(70, text.length * 1.6) + Math.random() * 10);
      const el = document.createElement('div');
      el.className = 'pg-ball';
      el.textContent = text;
      el.style.background = L.PG_COLORS[i % L.PG_COLORS.length];
      el.style.width = el.style.height = size + 'px';
      field.appendChild(el);
      const b = {
        el: el, size: size,
        x: Math.random() * Math.max(1, W - size),
        y: Math.random() * Math.max(1, H - size),
        vx: (Math.random() * 2 - 1) * 90,
        vy: (Math.random() * 2 - 1) * 90,
        dragging: false,
        px: 0, py: 0, lastMoveT: 0, moved: 0
      };
      lBindBall(b);
      lApply(b);
      lBalls.push(b);
    });
  }

  function lApply(b) { b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; }

  function lClampBall(b) {
    const W = field.clientWidth, H = field.clientHeight;
    b.x = Math.max(0, Math.min(W - b.size, b.x));
    b.y = Math.max(0, Math.min(H - b.size, b.y));
  }

  function lTick(now) {
    if (!active || mode !== 'local') return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    const W = field.clientWidth, H = field.clientHeight;
    lBalls.forEach((b) => {
      if (b.dragging) return;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x <= 0)             { b.x = 0;          b.vx =  Math.abs(b.vx) * 0.9; }
      else if (b.x + b.size >= W) { b.x = W - b.size; b.vx = -Math.abs(b.vx) * 0.9; }
      if (b.y <= 0)             { b.y = 0;          b.vy =  Math.abs(b.vy) * 0.9; }
      else if (b.y + b.size >= H) { b.y = H - b.size; b.vy = -Math.abs(b.vy) * 0.9; }
      b.vx *= 0.995; b.vy *= 0.995;     // light air drag so flings settle
      lApply(b);
    });
    rafId = requestAnimationFrame(lTick);
  }

  function lBindBall(b) {
    b.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.dragging = true; b.moved = 0;
      b.px = e.clientX; b.py = e.clientY;
      b.lastMoveT = performance.now();
      b.vx = b.vy = 0;
      try { b.el.setPointerCapture(e.pointerId); } catch (_) {}
      b.el.classList.add('grabbed');
    });
    b.el.addEventListener('pointermove', (e) => {
      if (!b.dragging) return;
      const dx = e.clientX - b.px, dy = e.clientY - b.py;
      b.x += dx; b.y += dy;
      b.moved += Math.abs(dx) + Math.abs(dy);
      const t = performance.now();
      const dtt = Math.max(8, t - b.lastMoveT);
      b.vx = dx / dtt * 1000;            // px/s carried into the fling
      b.vy = dy / dtt * 1000;
      b.px = e.clientX; b.py = e.clientY; b.lastMoveT = t;
      lClampBall(b); lApply(b);
    });
    function release(e) {
      if (!b.dragging) return;
      b.dragging = false;
      b.el.classList.remove('grabbed');
      try { b.el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (b.moved < 8) lPopBall(b);      // negligible movement = a tap = pop
    }
    b.el.addEventListener('pointerup', release);
    b.el.addEventListener('pointercancel', release);
  }

  function lPopBall(b) {
    spawnBurstAt(b.x + b.size / 2, b.y + b.size / 2, b.el.style.background);
    b.el.remove();
    lBalls = lBalls.filter(x => x !== b);
    awardPop(1);
    // Refill when the field empties so there's always something to pop.
    if (lBalls.length === 0) setTimeout(() => { if (active && mode === 'local') lSpawnBalls(); }, 400);
  }

  function activateLocal() {
    mode = 'local';
    if (!overlay) buildOverlay(false);
    requestAnimationFrame(() => {
      if (!active) return;
      lSpawnBalls();
      lastT = performance.now();
      rafId = requestAnimationFrame(lTick);
    });
  }

  function deactivateLocal() {
    lBalls = [];
  }

  /* ══════════════════════════════════════════════════════════
     SHARED MODE — true shared physics over RTDB
     ══════════════════════════════════════════════════════════ */
  let sBase = null;             // rtdb.ref('pg/{day}')
  let sPlayerRef = null;
  let sSession = '';            // per-open random token (ball ids, host slot)
  let sPlayerKey = '';          // uid_session — two tabs of one user ≠ one player
  let sBallSeq = 0;
  let sHb = 0;                  // pos heartbeat (idle field must not look dead)
  let sJoinTimer = null;        // offline RTDB buffers writes forever — bail to solo
  let sChainPending = new Set();// balls mid-cascade: keep on-screen, block claims
  let sHosting = false;
  let sHostUid = null;
  let sPlayers = {};
  let sBalls = new Map();       // id → {id,x,y,vx,vy,size,text,colorIdx,el,dragging,held,...}
  let sTf = null;               // virtual → screen transform
  let sLastNetAt = 0;           // performance.now() of the last pos snapshot
  let sListeners = [];          // {ref, type, cb} to detach on close
  let sNetTimer = null;         // host broadcast interval
  let sStaleTimer = null;       // host-liveness checker
  let sRefillTimer = null;
  let sEventsQuery = null, sEventsCb = null;
  let sChainTimeouts = [];
  let sProcessedClaims = new Set();
  let sProcessedChains = new Set();
  let sCoopPrev = null;
  let sDragSendAt = 0;
  let sSeedPos = null;          // host-only: positions for balls I just spawned

  function sharedAvailable() {
    return !!(rtdb && PS && myUid) &&
           !(window.FEATURES && window.FEATURES.pg_shared === false);
  }

  function listen(ref, type, cb) {
    ref.on(type, cb);
    sListeners.push({ ref: ref, type: type, cb: cb });
  }

  function sRecomputeTf() {
    if (!field) return;
    sTf = PS.fieldTransform(field.clientWidth, field.clientHeight);
    sBalls.forEach((b) => { sSizeEl(b); sRenderBall(b); });
  }

  function sSizeEl(b) {
    const px = Math.max(24, Math.round(b.size * sTf.scale));
    b.el.style.width = b.el.style.height = px + 'px';
    b.el.style.fontSize = Math.max(9, Math.round(12 * Math.min(1, sTf.scale * 1.6))) + 'px';
  }

  function sRenderBall(b) {
    const p = PS.toScreen(b.x, b.y, sTf);
    b.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
  }

  function sBallCenterScreen(b) {
    const p = PS.toScreen(b.x + b.size / 2, b.y + b.size / 2, sTf);
    return p;
  }

  /* ── Join / leave ────────────────────────────────────────── */
  function sPlayerName() {
    const name = localStorage.getItem('flappy_name') ||
                 (auth.currentUser && auth.currentUser.displayName) || 'Anonymous';
    return String(name).slice(0, 40);
  }

  function activateShared() {
    mode = 'shared';
    buildOverlay(true);

    const day = todayKey();
    sBase = rtdb.ref('pg/' + day);
    sSession = Math.random().toString(36).slice(2, 8);
    sPlayerKey = myUid + '_' + sSession;
    sBallSeq = 0; sHb = 0;
    sHosting = false; sHostUid = null;
    sPlayers = {}; sBalls = new Map(); sChainPending = new Set();
    sProcessedClaims = new Set(); sProcessedChains = new Set();
    sCoopPrev = null; sLastNetAt = 0; sSeedPos = null;
    sTf = PS.fieldTransform(1, 1);   // safe default until the field has layout

    requestAnimationFrame(() => { if (active) sRecomputeTf(); });
    window.addEventListener('resize', sRecomputeTf);

    const sess = sSession;           // stale async callbacks must not touch a
                                     // newer session (fast close→reopen)
    sPlayerRef = sBase.child('players/' + sPlayerKey);
    // An unreachable RTDB never rejects (writes just buffer) — don't hang on
    // an empty field forever, go solo instead.
    sJoinTimer = setTimeout(() => { sFallbackToLocal(sess); }, 5000);
    sPlayerRef.set({ j: firebase.database.ServerValue.TIMESTAMP, n: sPlayerName() })
      .then(() => {
        if (!active || mode !== 'shared' || sSession !== sess) return;
        if (sJoinTimer) { clearTimeout(sJoinTimer); sJoinTimer = null; }
        sPlayerRef.onDisconnect().remove();
        sAttachListeners();
        lastT = performance.now();
        rafId = requestAnimationFrame(sTick);
      })
      .catch(() => { sFallbackToLocal(sess); });
  }

  // Rules not deployed / no permission / unreachable → quietly go solo.
  function sFallbackToLocal(sess) {
    if (!active || mode !== 'shared' || sSession !== sess) return;
    teardownShared();
    if (overlay) { overlay.remove(); overlay = null; field = null; coinEl = null; liveEl = null; coopEl = null; }
    activateLocal();
  }

  // Take over hosting if the slot is empty/stale and I'm the elected
  // candidate. Called whenever players/host change (so the FIRST joiner hosts
  // immediately) and from the 1s liveness timer.
  function sMaybeTakeover() {
    if (!active || mode !== 'shared' || sHosting || document.hidden) return;
    const sinceNet = sLastNetAt ? (performance.now() - sLastNetAt) : Infinity;
    if (PS.shouldTakeOver(sPlayers, sPlayerKey, sHostUid, sinceNet)) sAttemptTakeover();
  }

  function sAttachListeners() {
    listen(sBase.child('players'), 'value', (snap) => {
      sPlayers = snap.val() || {};
      if (liveEl) liveEl.textContent = '🟢 ' + Math.max(1, Object.keys(sPlayers).length);
      sMaybeTakeover();
    });

    listen(sBase.child('host'), 'value', (snap) => {
      const v = snap.val();
      sHostUid = v ? v.u : null;      // NB: a player KEY (uid_session)
      // Demoted (someone legitimately replaced a host they considered dead —
      // e.g. this tab was hidden): stop simulating, become a viewer.
      if (sHosting && (!v || v.u !== sPlayerKey || v.s !== sSession)) sStopHosting(false);
      sMaybeTakeover();
    });

    // meta = which balls exist (and their label/colour/size).
    listen(sBase.child('meta'), 'value', (snap) => {
      const meta = snap.val() || {};
      // Hard cap on the receive side: a poisoned/oversized meta node must
      // never explode the DOM or the host's pos payload.
      const ids = Object.keys(meta).slice(0, PS.MAX_BALLS * 2);
      // Add new balls.
      for (const id of ids) {
        if (sBalls.has(id)) continue;
        const m = meta[id] || {};
        const b = {
          id: id,
          x: PS.VIRT_W / 2, y: PS.VIRT_H / 2, vx: 0, vy: 0,
          size: m.s || 100,
          text: m.t || '💬',
          colorIdx: m.c || 0,
          el: null, dragging: false, held: null,
          px: 0, py: 0, lastMoveT: 0, moved: 0
        };
        // The host applies its own freshly-rolled positions here (its pos
        // listener ignores the network echo — the sim is the source of truth).
        if (sSeedPos && sSeedPos[id]) {
          const sp = sSeedPos[id];
          b.x = sp[0]; b.y = sp[1]; b.vx = sp[2]; b.vy = sp[3];
          delete sSeedPos[id];
        }
        b.el = document.createElement('div');
        b.el.className = 'pg-ball';
        b.el.textContent = b.text;
        b.el.style.background = L.PG_COLORS[b.colorIdx % L.PG_COLORS.length];
        field.appendChild(b.el);
        sSizeEl(b);
        sBindBall(b);
        sRenderBall(b);
        sBalls.set(id, b);
      }
      // Drop balls that no longer exist (popped while we were joining, or a
      // new host respawned the field). Mid-cascade balls stay: their meta is
      // already gone but their pop FX hasn't fired yet.
      sBalls.forEach((b, id) => {
        if (!meta[id] && !sChainPending.has(id)) { b.el.remove(); sBalls.delete(id); }
      });
    });

    listen(sBase.child('pos'), 'value', (snap) => {
      sLastNetAt = performance.now();
      if (sHosting) return;                       // my own echo — the sim is the source
      PS.unpackPos(snap.val()).forEach((p) => {
        const b = sBalls.get(p.id);
        if (!b || b.dragging) return;             // don't rubber-band my drag
        b.x = p.x; b.y = p.y; b.vx = p.vx; b.vy = p.vy;
      });
    });

    listen(sBase.child('claims'), 'child_added', (snap) => {
      sOnClaim(snap.key, snap.val());
    });

    listen(sBase.child('chains'), 'child_added', (snap) => {
      sOnChain(snap.key, snap.val() || {});
    });

    listen(sBase.child('coop'), 'value', (snap) => {
      sOnCoop(snap.val() || 0);
    });

    // Host-liveness check. Runs on a timer (not rAF) so a stale host is
    // replaced even while this tab renders nothing.
    sStaleTimer = setInterval(sMaybeTakeover, 1000);
  }

  function sAttemptTakeover() {
    const believedDead = sHostUid;
    sBase.child('host').transaction((cur) => {
      // Replace only the host we believe is dead (or an empty slot). If the
      // slot changed hands meanwhile, someone else won — abort.
      if (cur && cur.u && cur.u !== believedDead) return;
      return { u: sPlayerKey, s: sSession };
    }, (err, committed, snap) => {
      const v = snap && snap.val();
      if (!err && committed && v && v.u === sPlayerKey && v.s === sSession) sStartHosting();
    });
  }

  /* ── Hosting ─────────────────────────────────────────────── */
  function sStartHosting() {
    if (sHosting || !active || mode !== 'shared') return;
    sHosting = true;
    sBase.child('host').onDisconnect().remove();

    // Consume only INPUT EVENTS sent after this moment (a fresh push key is a
    // clean, clock-skew-free watermark; keys sort by time).
    const marker = sBase.child('events').push().key;
    sEventsQuery = sBase.child('events').orderByKey().startAt(marker);
    sEventsCb = sEventsQuery.on('child_added', (snap) => sApplyEvent(snap.val() || {}));

    // First host of an empty field spawns it; a MIGRATED host adopts its own
    // dead-reckoned state instead, so a takeover never resets everyone's play
    // (also survives a crashed predecessor's late onDisconnect bouncing the
    // host slot).
    if (sBalls.size === 0) sSpawnBalls();

    sNetTimer = setInterval(() => {
      if (!sHosting) return;
      const pos = PS.packPos(Array.from(sBalls.values()));
      // RTDB suppresses events for identical writes, so a settled, untouched
      // field would look like a dead host to every viewer. The counter makes
      // each frame distinct (unpackPos skips non-array entries).
      pos._hb = ++sHb;
      sBase.child('pos').set(pos).catch(() => {});
    }, PS.NET_MS);
  }

  function sStopHosting(clearSlot) {
    if (!sHosting) return;
    sHosting = false;
    if (sNetTimer) { clearInterval(sNetTimer); sNetTimer = null; }
    if (sEventsQuery && sEventsCb) { sEventsQuery.off('child_added', sEventsCb); }
    sEventsQuery = null; sEventsCb = null;
    try { sBase.child('host').onDisconnect().cancel(); } catch (e) {}
    if (clearSlot) {
      // Only vacate the slot if it is still mine (never clobber a successor).
      sBase.child('host').transaction((cur) =>
        (cur && cur.u === sPlayerKey && cur.s === sSession) ? null : undefined
      );
    }
  }

  function sSpawnBalls() {
    const items = boardLabels().slice(0, PS.MAX_BALLS);
    const meta = {}, ids = [];
    items.forEach((text, i) => {
      const id = PS.makeBallId(sSession, sBallSeq++);
      const size = Math.round(PS.ballSize(text.length) * PS.SHARED_BALL_SCALE + Math.random() * 10);
      meta[id] = { t: text, c: i % L.PG_COLORS.length, s: size };
      ids.push(id);
    });
    const seed = {};
    ids.forEach((id) => {
      const m = meta[id];
      seed[id] = [
        Math.random() * Math.max(1, PS.VIRT_W - m.s),
        Math.random() * Math.max(1, PS.VIRT_H - m.s),
        (Math.random() * 2 - 1) * 90,
        (Math.random() * 2 - 1) * 90
      ];
    });
    sSeedPos = seed;             // my meta listener reads these for my own sim
    // meta first so viewers can build elements, then the first positions.
    sBase.child('meta').set(meta).catch(() => {});
    sBase.child('pos').set(seed).catch(() => {});
  }

  function sApplyEvent(ev) {
    if (!ev || !ev.b || ev.by === myUid) return;
    const b = sBalls.get(ev.b);
    if (!b) return;
    if (ev.t === 'd') {              // remote finger holds the ball
      b.held = {
        x: Math.max(0, Math.min(PS.VIRT_W - b.size, +ev.x || 0)),
        y: Math.max(0, Math.min(PS.VIRT_H - b.size, +ev.y || 0)),
        exp: performance.now() + PS.HOLD_TTL_MS
      };
      b.vx = 0; b.vy = 0;
    } else if (ev.t === 'f') {       // remote fling releases it
      b.held = null;
      b.vx = +ev.vx || 0; b.vy = +ev.vy || 0;
    }
  }

  /* ── Frame loop (host simulates; viewers dead-reckon) ────── */
  function sTick(now) {
    if (!active || mode !== 'shared') return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    sBalls.forEach((b) => {
      if (b.dragging) return;                        // my finger owns it
      if (sHosting && b.held) {                      // a remote finger owns it
        if (now > b.held.exp) { b.held = null; }
        else { b.x = b.held.x; b.y = b.held.y; sRenderBall(b); return; }
      }
      const n = PS.stepBall(b, dt);
      b.x = n.x; b.y = n.y; b.vx = n.vx; b.vy = n.vy;
      sRenderBall(b);
    });
    rafId = requestAnimationFrame(sTick);
  }

  /* ── Pointer interaction ─────────────────────────────────── */
  function sBindBall(b) {
    b.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.dragging = true; b.moved = 0;
      b.px = e.clientX; b.py = e.clientY;
      b.lastMoveT = performance.now();
      b.vx = 0; b.vy = 0;
      try { b.el.setPointerCapture(e.pointerId); } catch (_) {}
      b.el.classList.add('grabbed');
    });
    b.el.addEventListener('pointermove', (e) => {
      if (!b.dragging) return;
      const dxs = e.clientX - b.px, dys = e.clientY - b.py;   // screen px
      const dx = dxs / sTf.scale, dy = dys / sTf.scale;       // virtual units
      b.x = Math.max(0, Math.min(PS.VIRT_W - b.size, b.x + dx));
      b.y = Math.max(0, Math.min(PS.VIRT_H - b.size, b.y + dy));
      b.moved += Math.abs(dxs) + Math.abs(dys);
      const t = performance.now();
      const dtt = Math.max(8, t - b.lastMoveT);
      b.vx = dx / dtt * 1000;            // virtual units/s carried into the fling
      b.vy = dy / dtt * 1000;
      b.px = e.clientX; b.py = e.clientY; b.lastMoveT = t;
      sRenderBall(b);
      // Tell the host where my finger is (throttled) so everyone sees the drag.
      if (!sHosting && t - sDragSendAt >= PS.DRAG_SEND_MS) {
        sDragSendAt = t;
        sBase.child('events').push({
          t: 'd', b: b.id, x: Math.round(b.x), y: Math.round(b.y),
          by: myUid, ts: Date.now()
        }).catch(() => {});
      }
    });
    function release(e) {
      if (!b.dragging) return;
      b.dragging = false;
      b.el.classList.remove('grabbed');
      try { b.el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (b.moved < 8) { sClaimBall(b); return; }  // a tap = try to pop it
      if (!sHosting) {
        sBase.child('events').push({
          t: 'f', b: b.id, vx: Math.round(b.vx), vy: Math.round(b.vy),
          by: myUid, ts: Date.now()
        }).catch(() => {});
      }
    }
    b.el.addEventListener('pointerup', release);
    b.el.addEventListener('pointercancel', release);
  }

  function sClaimBall(b) {
    if (!myUid || sProcessedClaims.has(b.id)) return;
    b.el.classList.add('claiming');                // instant squish feedback
    sBase.child('claims/' + b.id).transaction(
      (cur) => (cur === null ? myUid : undefined), // first tap wins
      (err, committed) => {
        // Lost the race → the winner's claim event removes the ball for us;
        // just drop the squish. (On success the confirmed child_added fires
        // the burst/coin path, so there is exactly one pop pipeline.)
        if (b.el) b.el.classList.remove('claiming');
      },
      false  // no optimistic local echo: never award a coin the server may
             // still hand to someone else's earlier tap
    );
  }

  function sOnClaim(ballId, uid) {
    if (sProcessedClaims.has(ballId)) return;
    sProcessedClaims.add(ballId);
    const b = sBalls.get(ballId);
    if (!b) return;                                // historical claim from earlier today

    // The host referees the chain BEFORE the origin ball disappears, and
    // drops popped balls from meta so late joiners never see ghosts.
    if (sHosting) {
      const waves = PS.resolveChain(
        Array.from(sBalls.values()).map(x => ({ id: x.id, x: x.x, y: x.y, size: x.size })),
        ballId
      );
      const chained = PS.chainCount(waves);
      if (chained > 0) {
        sBase.child('chains/' + ballId).set({ by: uid, w: waves }).catch(() => {});
        // Chained meta goes NOW (one multi-path update): a rejoiner can never
        // rebuild these balls and replay the chain award. On live screens
        // sChainPending keeps them visible until their wave FX fires.
        const gone = {};
        waves.flat().forEach((id) => { gone[id] = null; });
        sBase.child('meta').update(gone).catch(() => {});
      }
      sBase.child('meta/' + ballId).remove().catch(() => {});
      sBase.child('coop').transaction((n) => (n || 0) + 1 + chained);
    }

    const c = sBallCenterScreen(b);
    spawnBurstAt(c.x, c.y, b.el.style.background);
    b.el.remove();
    sBalls.delete(ballId);
    if (uid === myUid) awardPop(1);

    sMaybeRefill();
  }

  function sOnChain(originId, val) {
    if (sProcessedChains.has(originId)) return;
    sProcessedChains.add(originId);
    const waves = Array.isArray(val.w) ? val.w : [];
    // Ignore replays of today's earlier chains (their balls are long gone) —
    // this also stops a rejoining initiator from re-awarding itself.
    const flat = waves.flat();
    const present = flat.filter((id) => sBalls.has(id));
    if (!present.length) return;

    // Freeze the chain set: no direct claims on balls that are already
    // popping, and keep them on-screen (their meta is gone) until their wave.
    flat.forEach((id) => { sProcessedClaims.add(id); sChainPending.add(id); });

    let popped = 1;                                // the origin tap
    waves.forEach((wave, k) => {
      const timer = setTimeout(() => {
        if (!active || mode !== 'shared') return;
        (wave || []).forEach((id) => {
          sChainPending.delete(id);
          const b = sBalls.get(id);
          if (!b) return;                          // claimed directly meanwhile
          const c = sBallCenterScreen(b);
          spawnBurstAt(c.x, c.y, b.el.style.background);
          b.el.remove();
          sBalls.delete(id);
          popped++;
        });
        if (popped > 1) sShowCombo(popped);
        sMaybeRefill();
      }, (k + 1) * PS.CHAIN_WAVE_MS);
      sChainTimeouts.push(timer);
    });

    // Chain coins go to whoever started it (visual multiplier only — every
    // ball still pays the normal 1 coin, inside the same daily cap).
    if (val.by === myUid) awardPop(present.length);
  }

  function sShowCombo(n) {
    if (!field) return;
    const el = document.createElement('div');
    el.className = 'pg-combo pg-combo-' + PS.comboTier(n);
    el.textContent = PS.comboLabel(n) + ' COMBO!';
    field.appendChild(el);
    field.classList.remove('pg-shake');
    void field.offsetWidth;                        // restart the shake animation
    field.classList.add('pg-shake');
    setTimeout(() => el.remove(), 900);
  }

  function sMaybeRefill() {
    if (!sHosting || sBalls.size > 0 || sRefillTimer) return;
    sRefillTimer = setTimeout(() => {
      sRefillTimer = null;
      if (active && mode === 'shared' && sHosting && sBalls.size === 0) sSpawnBalls();
    }, 500);
  }

  function sOnCoop(n) {
    if (coopEl) coopEl.innerHTML = '🤝 今日一起 pop 了 <b>' + n + '</b> 个';
    const crossed = (sCoopPrev == null) ? 0 : PS.milestoneCrossed(sCoopPrev, n);
    sCoopPrev = n;
    if (crossed && coopEl) {
      coopEl.classList.remove('celebrate');
      void coopEl.offsetWidth;
      coopEl.classList.add('celebrate');
      if (typeof showToast === 'function') showToast('🎉 大家一起 pop 满 ' + crossed + ' 个啦！');
    }
  }

  function teardownShared() {
    sListeners.forEach((l) => { try { l.ref.off(l.type, l.cb); } catch (e) {} });
    sListeners = [];
    if (sJoinTimer) { clearTimeout(sJoinTimer); sJoinTimer = null; }
    if (sStaleTimer) { clearInterval(sStaleTimer); sStaleTimer = null; }
    if (sRefillTimer) { clearTimeout(sRefillTimer); sRefillTimer = null; }
    sChainTimeouts.forEach(clearTimeout); sChainTimeouts = [];
    sChainPending = new Set();
    sStopHosting(true);
    if (sPlayerRef) {
      try { sPlayerRef.onDisconnect().cancel(); } catch (e) {}
      sPlayerRef.remove().catch(() => {});
      sPlayerRef = null;
    }
    window.removeEventListener('resize', sRecomputeTf);
    sBalls.forEach((b) => b.el && b.el.remove());
    sBalls = new Map();
    sBase = null;
  }

  /* ── Activate / deactivate ───────────────────────────────── */
  function activate() {
    if (active) return;
    active = true;
    sessionCoins = 0; cappedNotice = false;
    document.body.classList.add('pg-open');
    toggleBtn.classList.add('active');
    if (sharedAvailable()) activateShared();
    else activateLocal();
    updateCoinLabel();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    flushCoins();
    if (mode === 'shared') teardownShared();
    else deactivateLocal();
    if (overlay) { overlay.remove(); overlay = null; field = null; coinEl = null; liveEl = null; coopEl = null; }
    document.body.classList.remove('pg-open');
    toggleBtn.classList.remove('active');
  }

  toggleBtn.addEventListener('click', () => { active ? deactivate() : activate(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) deactivate(); });
  window.addEventListener('beforeunload', flushCoins);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushCoins();
      // A hidden tab can't simulate (rAF pauses) and must not block the
      // election either — hand hosting over AND step out of the player list,
      // otherwise the room deadlocks on a candidate who can never act.
      if (active && mode === 'shared') {
        if (sHosting) sStopHosting(true);
        if (sPlayerRef) sPlayerRef.remove().catch(() => {});
      }
    } else if (active && mode === 'shared' && sPlayerRef) {
      // Back → rejoin the room (at the back of the host queue).
      const sess = sSession;
      sPlayerRef.set({ j: firebase.database.ServerValue.TIMESTAMP, n: sPlayerName() })
        .then(() => {
          if (active && mode === 'shared' && sSession === sess) sPlayerRef.onDisconnect().remove();
        })
        .catch(() => {});
    }
  });
})();
