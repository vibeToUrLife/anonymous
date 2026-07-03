/**
 * bubble-playground.js — A playful physics mode for the bubble board.
 *
 * Toggle it on and the current messages become floating balls in a full-screen
 * overlay: they drift and bounce off the walls, you can grab and fling them,
 * and tapping one pops it for a coin (with a confetti burst).
 *
 * The physics/animation is entirely client-side. The only Firestore touch is
 * the coin reward, which is:
 *  - capped per day (BoardLive.grantPopCoins) using a tiny localStorage state,
 *    so it costs ZERO extra reads to enforce, and
 *  - batched — granted coins accumulate and are flushed in a single increment
 *    on close / tab-hide / every few seconds, never one write per pop.
 *
 * Depends on globals from app.js (db, auth, firebase) and board-live-logic.js
 * (BoardLive). Loaded after both.
 */
(function () {
  'use strict';

  if (typeof db === 'undefined' || typeof auth === 'undefined' || typeof firebase === 'undefined') return;
  const L = (typeof BoardLive !== 'undefined') ? BoardLive : null;
  if (!L) return;

  const toggleBtn = document.getElementById('pgToggle');
  if (!toggleBtn) return;

  const FieldValue = firebase.firestore.FieldValue;
  const CAP_KEY    = 'board_pop_cap';   // localStorage: {day, count}

  let overlay = null, field = null, coinEl = null;
  let rafId = null, lastT = 0;
  let balls = [];
  let active = false;
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

  function awardPop() {
    const res = L.grantPopCoins(loadCap(), todayKey(), 1);
    saveCap(res.state);
    if (res.granted > 0) { pendingCoins += res.granted; scheduleFlush(); }
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

  /* ── Overlay scaffolding ─────────────────────────────────── */
  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div class="pg-header">' +
        '<span class="pg-title">🫧 Bubble Playground</span>' +
        '<span class="pg-coins" id="pgCoins">🪙 0</span>' +
        '<button class="pg-close" id="pgClose" title="Close (Esc)">✕</button>' +
      '</div>' +
      '<div class="pg-hint">Drag to fling · tap a bubble to pop it for a coin</div>' +
      '<div class="pg-field" id="pgField"></div>';
    document.body.appendChild(overlay);
    field  = overlay.querySelector('#pgField');
    coinEl = overlay.querySelector('#pgCoins');
    overlay.querySelector('#pgClose').addEventListener('click', deactivate);
  }

  function updateCoinLabel() {
    if (!coinEl) return;
    coinEl.textContent = '🪙 ' + sessionCoins + (cappedNotice ? ' (daily max)' : '');
  }

  /* ── Ball creation ───────────────────────────────────────── */
  function spawnBalls() {
    if (!field) return;
    const W = field.clientWidth, H = field.clientHeight;
    const bubbles = Array.prototype.slice.call(document.querySelectorAll('#bubbleWrap .bubble'));
    let items = bubbles.map(extractText);
    // Never let it be empty — seed a few friendly placeholders.
    if (!items.length) items = ['Hi! 👋', '🎉', 'pop me', 'bubble', '😄', 'play!'];

    items.forEach((text, i) => {
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
      bindBall(b);
      apply(b);
      balls.push(b);
    });
  }

  function apply(b) { b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; }

  function clampBall(b) {
    const W = field.clientWidth, H = field.clientHeight;
    b.x = Math.max(0, Math.min(W - b.size, b.x));
    b.y = Math.max(0, Math.min(H - b.size, b.y));
  }

  /* ── Physics loop (wall-bounce + gentle drag) ────────────── */
  function tick(now) {
    if (!active) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    const W = field.clientWidth, H = field.clientHeight;
    balls.forEach((b) => {
      if (b.dragging) return;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x <= 0)             { b.x = 0;          b.vx =  Math.abs(b.vx) * 0.9; }
      else if (b.x + b.size >= W) { b.x = W - b.size; b.vx = -Math.abs(b.vx) * 0.9; }
      if (b.y <= 0)             { b.y = 0;          b.vy =  Math.abs(b.vy) * 0.9; }
      else if (b.y + b.size >= H) { b.y = H - b.size; b.vy = -Math.abs(b.vy) * 0.9; }
      b.vx *= 0.995; b.vy *= 0.995;     // light air drag so flings settle
      apply(b);
    });
    rafId = requestAnimationFrame(tick);
  }

  /* ── Pointer interaction: drag/fling, quick-tap = pop ────── */
  function bindBall(b) {
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
      clampBall(b); apply(b);
    });
    function release(e) {
      if (!b.dragging) return;
      b.dragging = false;
      b.el.classList.remove('grabbed');
      try { b.el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (b.moved < 8) popBall(b);       // negligible movement = a tap = pop
    }
    b.el.addEventListener('pointerup', release);
    b.el.addEventListener('pointercancel', release);
  }

  function popBall(b) {
    spawnPopFx(b);
    b.el.remove();
    balls = balls.filter(x => x !== b);
    const granted = awardPop();
    if (granted > 0) sessionCoins += granted;
    else cappedNotice = true;
    updateCoinLabel();
    // Refill when the field empties so there's always something to pop.
    if (balls.length === 0) setTimeout(() => { if (active) spawnBalls(); }, 400);
  }

  function spawnPopFx(b) {
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    const N = 10;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('div');
      p.className = 'pg-pop';
      const ang = (Math.PI * 2) * (i / N);
      const dist = 30 + Math.random() * 30;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = b.el.style.background;
      p.style.setProperty('--px', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--py', Math.sin(ang) * dist + 'px');
      field.appendChild(p);
      (function (node) { setTimeout(() => node.remove(), 600); })(p);
    }
  }

  /* ── Activate / deactivate ───────────────────────────────── */
  function activate() {
    if (active) return;
    active = true;
    sessionCoins = 0; cappedNotice = false;
    buildOverlay();
    document.body.classList.add('pg-open');
    toggleBtn.classList.add('active');
    // Wait a frame so the field has real dimensions before placing balls.
    requestAnimationFrame(() => {
      if (!active) return;
      spawnBalls();
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    });
  }

  function deactivate() {
    if (!active) return;
    active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    flushCoins();
    balls = [];
    if (overlay) { overlay.remove(); overlay = null; field = null; coinEl = null; }
    document.body.classList.remove('pg-open');
    toggleBtn.classList.remove('active');
  }

  toggleBtn.addEventListener('click', () => { active ? deactivate() : activate(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) deactivate(); });
  window.addEventListener('beforeunload', flushCoins);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushCoins(); });
})();
