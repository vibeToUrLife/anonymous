/* ════════════════════════════════════════════════════════════════
   campfire.js — a pixel-art campfire in the bottom-left corner of the
   bubble board. One little villager sits around the fire per person
   currently online (read live from #liveOnlineCount, which presence.js
   keeps updated — so zero new Firebase reads). Fixed position, so it
   never scrolls. Tap the fire to toss a spark.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const W = 104, H = 64;          // logical pixel resolution (CSS scales it up)
  const cx = 52, cy = 46;         // fire base centre
  const MAX_PEOPLE = 12;          // villagers drawn; extras shown as "+N"
  const SHIRTS = ['#e05a5a', '#5a86e0', '#5ec27a', '#e0c24a', '#a45ee0',
                  '#4ec2c2', '#e0894a', '#e07ab0', '#7ec24e', '#c24e8a'];

  /* ── DOM ─────────────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'campfire';
  wrap.id = 'campfire';
  wrap.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const hit = document.createElement('div');   // small tap target over the fire only
  hit.className = 'cf-hit';
  hit.title = '戳一下火堆';
  wrap.appendChild(canvas);
  wrap.appendChild(hit);
  document.body.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* ── State ───────────────────────────────────────────────────── */
  let count = 1, flare = 0;
  let sparks = [];

  /* ── Online count (from presence.js's #liveOnlineCount) ──────── */
  const countEl = document.getElementById('liveOnlineCount');
  function readCount() {
    const n = parseInt(countEl && countEl.textContent, 10);
    return (isFinite(n) && n > 0) ? n : 1;
  }
  if (countEl) {
    count = readCount();
    new MutationObserver(function () { count = readCount(); })
      .observe(countEl, { childList: true, characterData: true, subtree: true });
  }

  /* ── Tap → toss a spark ──────────────────────────────────────── */
  hit.addEventListener('click', function () {
    for (let i = 0; i < 12; i++) {
      sparks.push({ x: cx + (Math.random() * 10 - 5), y: cy - 4,
                    vx: (Math.random() * 2 - 1), vy: 0.8 + Math.random() * 1.2, life: 1 });
    }
    flare = 7;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
  });

  /* ── Pixel helpers ───────────────────────────────────────────── */
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }
  function px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); }

  // deterministic ring layout so villagers are stable for a given count
  function layout(n) {
    n = Math.min(n, MAX_PEOPLE);
    const pts = [], rx = 34, ry = 15;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i + 0.5) / n * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, i: i });
    }
    return pts;
  }

  function drawPerson(p) {
    const x = Math.round(p.x), y = Math.round(p.y);
    const shirt = SHIRTS[p.i % SHIRTS.length];
    rect(x - 1, y + 2, 3, 1, 'rgba(0,0,0,.28)');   // shadow
    rect(x - 1, y, 3, 2, '#3a2a1a');               // sitting base
    rect(x - 1, y - 2, 3, 2, shirt);               // body
    rect(x, y - 4, 2, 2, '#e8b48c');               // head
    rect(x, y - 5, 2, 1, '#43301c');               // hair
    px(x + (p.x < cx ? 2 : -1), y - 1, shirt);     // little arm toward the fire
  }

  function drawFire() {
    ctx.fillStyle = 'rgba(255,150,50,0.16)';       // glow
    ctx.beginPath(); ctx.ellipse(cx, cy - 2, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
    rect(cx - 9, cy + 2, 18, 3, '#6b4a2a');        // logs
    rect(cx - 7, cy + 4, 14, 2, '#4a3018');
    px(cx - 9, cy + 2, '#8a6238'); px(cx + 8, cy + 2, '#8a6238');
    const boost = flare > 0 ? 4 : 0; if (flare > 0) flare--;
    for (let gx = -6; gx <= 6; gx++) {             // flickering flame columns
      const d = Math.abs(gx);
      const base = 15 - d * 2.1 + boost;
      const h = Math.max(0, base + (Math.random() * 4 - 2));
      for (let k = 0; k < h; k++) {
        const f = k / (h || 1);
        const c = f < 0.22 ? '#ff5a1a' : f < 0.5 ? '#ff8c2a' : f < 0.78 ? '#ffd24a' : '#fff2b0';
        px(cx + gx, cy + 2 - k, c);
      }
    }
    if (Math.random() < 0.4) sparks.push({ x: cx + (Math.random() * 8 - 4), y: cy - 8, vx: 0, vy: 0.7, life: 1 });
    sparks = sparks.filter(function (s) { return s.life > 0; });
    sparks.forEach(function (s) {
      s.y -= s.vy; s.x += (s.vx || (Math.random() * 0.8 - 0.4)); s.life -= 0.045;
      px(s.x, s.y, s.life > 0.5 ? '#ffd24a' : '#ff8c2a');
    });
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    const pts = layout(count);
    pts.filter(function (p) { return p.y < cy; }).forEach(drawPerson);   // back row
    drawFire();
    pts.filter(function (p) { return p.y >= cy; }).forEach(drawPerson);  // front row
    if (count > MAX_PEOPLE) {
      ctx.fillStyle = '#ffe6a0'; ctx.font = '8px monospace'; ctx.textBaseline = 'top';
      ctx.fillText('+' + (count - MAX_PEOPLE), W - 16, 2);
    }
  }

  /* ── Enable/disable (Settings → 🔥 营火) + pause when hidden ──── */
  let enabled = (localStorage.getItem('campfire') !== '0');   // default on
  let looping = false, last = 0;
  function needsRun() { return enabled && !document.hidden; }
  function loop(t) {
    if (!needsRun()) { looping = false; return; }             // stop scheduling when off/hidden
    if (t - last > 110) { last = t; render(); }               // ~9fps pixel flicker
    requestAnimationFrame(loop);
  }
  function startLoop() { if (looping || !needsRun()) return; looping = true; last = 0; requestAnimationFrame(loop); }

  function applyEnabled(on) {
    enabled = on;
    wrap.style.display = on ? '' : 'none';
    if (on) startLoop();
  }

  document.addEventListener('visibilitychange', startLoop);   // resume when the tab returns
  applyEnabled(enabled);                                      // initial state (+ start if on)

  /* ── Settings toggle (self-wired) ────────────────────────────── */
  const toggle = document.getElementById('campfireToggle');
  if (toggle) {
    toggle.checked = enabled;
    toggle.addEventListener('change', function () {
      const on = toggle.checked;
      try { localStorage.setItem('campfire', on ? '1' : '0'); } catch (e) {}
      applyEnabled(on);
    });
  }
})();
