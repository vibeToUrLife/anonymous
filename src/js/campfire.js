/* ════════════════════════════════════════════════════════════════
   campfire.js — a pixel-art diorama in the bottom-left of the bubble
   board: a campfire under a sky that follows the viewer's local clock
   (sun / moon / stars / clouds) with date-seeded daily weather.
   MULTIPLAYER: every online person is a little villager you can walk
   around — tap the ground to move yours; everyone sees everyone move
   (positions synced over RTDB at campfire/{day}/players/{uid}, 0..1
   coords, throttled + onDisconnect cleanup). If RTDB is unavailable it
   falls back to non-interactive villagers = #liveOnlineCount.
   Tap the fire to toss a spark. Toggle in Settings → 🔥 营火.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const W = 128, H = 80, HORIZON = 46;
  const fx = 70, fy = 64;
  // walkable ground rectangle (logical px) that 0..1 coords map into
  const GX0 = 10, GXW = 108, GY0 = 52, GYH = 24;
  const MAX_PEOPLE = 14;
  const SHIRTS = ['#e05a5a', '#5a86e0', '#5ec27a', '#e0c24a', '#a45ee0',
                  '#4ec2c2', '#e0894a', '#e07ab0', '#7ec24e', '#c24e8a'];

  /* ── DOM ─────────────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'campfire'; wrap.id = 'campfire'; wrap.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const tapZone = document.createElement('div'); tapZone.className = 'cf-tap'; tapZone.title = '点天空放烟花 · 点火堆丢火星 · 点地面走过去';
  const collapseBtn = document.createElement('button'); collapseBtn.className = 'cf-collapse'; collapseBtn.textContent = '–'; collapseBtn.title = '收起';
  const mini = document.createElement('button'); mini.className = 'cf-mini'; mini.textContent = '🔥'; mini.title = '展开营火小景';
  wrap.appendChild(canvas); wrap.appendChild(tapZone); wrap.appendChild(collapseBtn); wrap.appendChild(mini);
  document.body.appendChild(wrap);
  const ctx = canvas.getContext('2d'); if (ctx) ctx.imageSmoothingEnabled = false;

  /* collapse / expand — default OPEN everywhere; only stays collapsed if the user
     collapsed it themselves (remembered). */
  let collapsed = (localStorage.getItem('cf_collapsed') === '1');
  wrap.classList.toggle('collapsed', collapsed);
  function applyCollapsed(c) { collapsed = c; wrap.classList.toggle('collapsed', c); try { localStorage.setItem('cf_collapsed', c ? '1' : '0'); } catch (e) {} if (!c) startLoop(); }
  collapseBtn.addEventListener('click', function (e) { e.stopPropagation(); applyCollapsed(true); });
  mini.addEventListener('click', function (e) { e.stopPropagation(); applyCollapsed(false); });

  /* Sit just above the (variable-height, wrapping) input bar so it is never
     clipped behind it on mobile. Measured live, so it adapts to the input bar
     growing/wrapping and the keyboard. */
  function positionAboveInput() {
    const ia = document.querySelector('.input-area');
    const h = (ia && ia.offsetHeight) ? ia.offsetHeight : 80;
    wrap.style.bottom = (h + 10) + 'px';
  }
  positionAboveInput();
  window.addEventListener('resize', positionAboveInput);
  try { const ia = document.querySelector('.input-area'); if (ia && window.ResizeObserver) new ResizeObserver(positionAboveInput).observe(ia); } catch (e) {}

  /* ── helpers ─────────────────────────────────────────────────── */
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }
  function px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); }
  function hx(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(c1, c2, f) { const a = hx(c1), b = hx(c2); return 'rgb(' + ((a[0] + (b[0] - a[0]) * f) | 0) + ',' + ((a[1] + (b[1] - a[1]) * f) | 0) + ',' + ((a[2] + (b[2] - a[2]) * f) | 0) + ')'; }
  const clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  function hashUid(u) { let h = 0; u = u || ''; for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0; return h; }
  function gx(nx) { return GX0 + nx * GXW; }
  function gy(ny) { return GY0 + ny * GYH; }

  /* ── State ───────────────────────────────────────────────────── */
  let flare = 0, tick = 0, sparks = [];

  /* ── Sky (local clock) ───────────────────────────────────────── */
  const SKY = [
    { h: 0, t: '#0e1030', b: '#1b2350' }, { h: 5, t: '#2a2a58', b: '#6a5578' }, { h: 6.5, t: '#6a6aa0', b: '#f0b083' },
    { h: 8, t: '#5aa0e0', b: '#c3e6f6' }, { h: 13, t: '#4a95e0', b: '#a8d8f0' }, { h: 17, t: '#5a88c8', b: '#d2e2ee' },
    { h: 18.5, t: '#4a3a7a', b: '#ef8a52' }, { h: 20, t: '#1c1e48', b: '#402f5c' }, { h: 24, t: '#0e1030', b: '#1b2350' }
  ];
  function skyCols(h) {
    for (let i = 0; i < SKY.length - 1; i++) if (h >= SKY[i].h && h <= SKY[i + 1].h) { const f = (h - SKY[i].h) / (SKY[i + 1].h - SKY[i].h); return { top: mix(SKY[i].t, SKY[i + 1].t, f), bot: mix(SKY[i].b, SKY[i + 1].b, f) }; }
    return { top: SKY[0].t, bot: SKY[0].b };
  }
  function nightAmt(h) { if (h >= 19 || h < 5) return 1; if (h >= 17 && h < 19) return (h - 17) / 2; if (h >= 5 && h < 7) return 1 - (h - 5) / 2; return 0; }
  let seed = 9301; const rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const STARS = []; for (let i = 0; i < 26; i++) STARS.push({ x: (rnd() * W) | 0, y: (rnd() * (HORIZON - 6)) | 0, p: rnd() });
  const CLOUDS = [{ x: 20, y: 10, s: .06 }, { x: 70, y: 18, s: .04 }, { x: 110, y: 7, s: .05 }];
  const RAIN = []; for (let i = 0; i < 34; i++) RAIN.push({ x: rnd() * W, y: rnd() * H, v: 1.6 + rnd() });
  const SNOW = []; for (let i = 0; i < 26; i++) SNOW.push({ x: rnd() * W, y: rnd() * H, v: .25 + rnd() * .35, sw: rnd() * 6.28 });

  function drawSky(h) {
    const c = skyCols(h);
    for (let y = 0; y < HORIZON; y++) rect(0, y, W, 1, mix(c.top, c.bot, y / HORIZON));
    const na = nightAmt(h);
    if (na > 0.02) STARS.forEach(function (st) { const tw = 0.55 + 0.45 * Math.sin(tick * 0.15 + st.p * 7); const a = na * tw; if (a > 0.15) px(st.x, st.y, 'rgba(255,255,240,' + a.toFixed(2) + ')'); });
    const isDay = h >= 6 && h < 18;
    const prog = isDay ? (h - 6) / 12 : ((h >= 18 ? h : h + 24) - 18) / 12;
    const bx = 14 + prog * (W - 28), by = HORIZON - 4 - Math.sin(clamp01(prog) * Math.PI) * (HORIZON - 12);
    if (isDay) { ctx.fillStyle = 'rgba(255,226,122,.5)'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, 6.29); ctx.fill(); ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(bx, by, 4, 0, 6.29); ctx.fill(); }
    else { ctx.fillStyle = '#eef0ff'; ctx.beginPath(); ctx.arc(bx, by, 4, 0, 6.29); ctx.fill(); ctx.fillStyle = mix(c.top, c.bot, 0.3); ctx.beginPath(); ctx.arc(bx + 1.6, by - 1.4, 3.4, 0, 6.29); ctx.fill(); }
    const ca = 0.85 - na * 0.55;
    CLOUDS.forEach(function (cl) { cl.x = (cl.x + cl.s) % (W + 30); const x = cl.x - 15, y = cl.y, col = 'rgba(240,240,255,' + ca.toFixed(2) + ')'; rect(x + 2, y + 2, 10, 3, col); rect(x, y + 4, 16, 3, col); rect(x + 5, y, 7, 3, col); });
  }
  function drawGround() {
    rect(0, HORIZON, W, H - HORIZON, '#3a6a2e'); rect(0, HORIZON, W, 2, '#4e8038');
    for (let i = 0; i < 40; i++) { const g = (i * 17 + 7) % W; px(g, HORIZON + 3 + (i % 3), '#2e5624'); px((g + 9) % W, HORIZON + 6, '#57883c'); }
    rect(20, HORIZON - 2, 3, 10, '#5a3a1e'); ctx.fillStyle = '#3f7a33'; ctx.beginPath(); ctx.arc(21, HORIZON - 6, 7, 0, 6.29); ctx.fill();
    rect(16, HORIZON - 9, 4, 3, '#4e9040'); rect(22, HORIZON - 11, 5, 4, '#4e9040');
  }

  /* ── Fire + spark ────────────────────────────────────────────── */
  function drawFire() {
    ctx.fillStyle = 'rgba(255,150,50,0.18)'; ctx.beginPath(); ctx.ellipse(fx, fy - 2, 16, 9, 0, 0, 6.29); ctx.fill();
    rect(fx - 8, fy + 2, 16, 3, '#6b4a2a'); rect(fx - 6, fy + 4, 12, 2, '#4a3018');
    const boost = flare > 0 ? 4 : 0; if (flare > 0) flare--;
    for (let g = -6; g <= 6; g++) { const d = Math.abs(g), base = 14 - d * 2.1 + boost, hh = Math.max(0, base + (Math.random() * 4 - 2)); for (let k = 0; k < hh; k++) { const f = k / (hh || 1); const c = f < 0.22 ? '#ff5a1a' : f < 0.5 ? '#ff8c2a' : f < 0.78 ? '#ffd24a' : '#fff2b0'; px(fx + g, fy + 2 - k, c); } }
    if (Math.random() < 0.4) sparks.push({ x: fx + (Math.random() * 8 - 4), y: fy - 8, vy: 0.7, life: 1 });
    sparks = sparks.filter(function (s) { return s.life > 0; });
    sparks.forEach(function (s) { s.y -= s.vy; s.x += (Math.random() * .8 - .4); s.life -= .045; px(s.x, s.y, s.life > .5 ? '#ffd24a' : '#ff8c2a'); });
  }
  function doSpark() {
    for (let i = 0; i < 12; i++) sparks.push({ x: fx + (Math.random() * 10 - 5), y: fy - 4, vy: 0.8 + Math.random() * 1.2, life: 1 });
    flare = 7; if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
  }
  /* ── Fireworks (tap the sky; everyone online sees them) ──────── */
  const FW_COLORS = ['#ff5a7a', '#5ad0ff', '#ffe27a', '#7affa0', '#c890ff', '#ff9e4a'];
  let fireworks = [], lastFw = 0;
  function launchFirework(bx, by, col) { fireworks.push({ bx: bx, by: by, x: bx, y: H, col: col, phase: 'rise', sparks: [], done: false }); }
  function updateFireworks() {
    fireworks = fireworks.filter(function (f) { return !f.done; });
    fireworks.forEach(function (f) {
      if (f.phase === 'rise') {
        f.y -= 2.3;
        if (f.y <= f.by) { f.phase = 'burst'; const n = 22 + (Math.random() * 8 | 0); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 0.5 + Math.random() * 1.5; f.sparks.push({ x: f.bx, y: f.by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 }); } }
      } else {
        f.sparks = f.sparks.filter(function (s) { return s.life > 0; });
        f.sparks.forEach(function (s) { s.x += s.vx; s.y += s.vy; s.vy += 0.055; s.vx *= 0.98; s.life -= 0.028; });
        if (!f.sparks.length) f.done = true;
      }
    });
  }
  function drawFireworks() {
    fireworks.forEach(function (f) {
      if (f.phase === 'rise') { px(f.x, f.y, '#fff2b0'); px(f.x, f.y + 1, f.col); if (Math.random() < 0.6) px(f.x, f.y + 2, 'rgba(255,210,140,.5)'); }
      else f.sparks.forEach(function (s) { if (s.life > 0) px(s.x, s.y, s.life > 0.62 ? '#fff2c8' : f.col); });
    });
  }

  /* ── Weather (date-seeded, same for everyone that day) ───────── */
  let _wxDay = -1, _wx = 'clear';
  function currentWeather(now) {
    const day = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    if (day === _wxDay) return _wx;
    _wxDay = day;
    let h = (day ^ (day >>> 4)) >>> 0; h = ((h & 0xffff) * 0x9d3d + (((h >>> 16) * 0x9d3d) << 16)) >>> 0; h %= 100;
    const winter = (now.getMonth() === 11 || now.getMonth() <= 1);
    _wx = (h < 74) ? 'clear' : (winter ? 'snow' : 'rain');
    return _wx;
  }
  function drawWeather(w) {
    if (w === 'rain') { ctx.strokeStyle = 'rgba(150,190,255,.7)'; ctx.lineWidth = 1; RAIN.forEach(function (r) { r.y += r.v; r.x -= 0.4; if (r.y > H) { r.y = -2; r.x = Math.random() * W; } if (r.x < 0) r.x += W; ctx.beginPath(); ctx.moveTo(r.x | 0, r.y | 0); ctx.lineTo((r.x - 1) | 0, (r.y + 3) | 0); ctx.stroke(); }); }
    else if (w === 'snow') { SNOW.forEach(function (f) { f.y += f.v; f.sw += 0.05; f.x += Math.sin(f.sw) * 0.25; if (f.y > H) { f.y = -2; f.x = Math.random() * W; } px(f.x, f.y, 'rgba(255,255,255,.9)'); }); }
  }

  /* ── Avatars: multiplayer (RTDB) with count fallback ─────────── */
  const countEl = document.getElementById('liveOnlineCount');
  function readCount() { const n = parseInt(countEl && countEl.textContent, 10); return (isFinite(n) && n > 0) ? n : 1; }
  let fallbackCount = countEl ? readCount() : 1;
  if (countEl) new MutationObserver(function () { fallbackCount = readCount(); }).observe(countEl, { childList: true, characterData: true, subtree: true });

  let rtdb = null; try { rtdb = firebase.database ? firebase.database() : null; } catch (e) { rtdb = null; }
  let myUid = null, joined = false, playersRef = null, meRef = null, hbTimer = null, joinedDay = null;
  let fwRef = null, fwQuery = null; const fwSeen = new Set(); let fwPrimed = false, fwPrimeT = null;
  const me = { x: 0.4 + Math.random() * 0.2, y: 0.45 + Math.random() * 0.35, tx: null, ty: null, moving: false };
  const players = {};                                    // uid -> {x,y,tx,ty,ts}
  let lastWriteMs = 0, lastWx = -1, lastWy = -1;

  function dayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function join() {
    if (!rtdb || !myUid || joined || !enabled) return;
    joined = true;
    const dk = dayKey(); joinedDay = dk;
    playersRef = rtdb.ref('campfire/' + dk + '/players');
    meRef = playersRef.child(myUid);
    try { meRef.onDisconnect().remove(); } catch (e) {}
    meRef.set({ x: +me.x.toFixed(3), y: +me.y.toFixed(3), ts: Date.now() }).catch(function () {});
    playersRef.on('value', onPlayers);
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(function () {
      if (dayKey() !== joinedDay) { leave(); join(); return; }   // re-bind to the new day at local midnight
      if (meRef) meRef.update({ ts: Date.now() }).catch(function () {});
    }, 15000);
    // fireworks broadcast channel
    fwRef = rtdb.ref('campfire/' + dk + '/fireworks');
    fwQuery = fwRef.limitToLast(8);
    fwPrimed = false; if (fwPrimeT) clearTimeout(fwPrimeT); fwPrimeT = setTimeout(function () { fwPrimed = true; }, 700);
    fwQuery.on('child_added', onFw);
  }
  function leave() {
    joined = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (playersRef) { try { playersRef.off('value', onPlayers); } catch (e) {} }
    if (fwQuery) { try { fwQuery.off('child_added', onFw); } catch (e) {} }
    if (fwPrimeT) { clearTimeout(fwPrimeT); fwPrimeT = null; } fwPrimed = false;
    if (meRef) { try { meRef.onDisconnect().cancel(); } catch (e) {} meRef.remove().catch(function () {}); }
    meRef = null; playersRef = null; fwRef = null; fwQuery = null;
    for (const k in players) delete players[k];
  }
  function onFw(snap) {
    const key = snap.key; if (fwSeen.has(key)) return; fwSeen.add(key); if (fwSeen.size > 200) fwSeen.clear();
    if (!fwPrimed || collapsed) return;                    // no backlog replay; don't spawn while collapsed
    const v = snap.val(); if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') return;
    if (v.ts && Date.now() - v.ts > 8000) return;          // too old to be "live"
    launchFirework(clamp01(v.x) * W, clamp01(v.y) * H, FW_COLORS[(v.c | 0) % FW_COLORS.length]);
  }
  function fireLaunch(bx, by) {
    const now = Date.now(); if (now - lastFw < 1400) return;   // rate-limit (client)
    lastFw = now;
    const ci = (Math.random() * FW_COLORS.length) | 0;
    launchFirework(bx, by, FW_COLORS[ci]);                 // show it locally right away
    if (fwRef && myUid) { try {
      const rr = fwRef.push(); fwSeen.add(rr.key);
      rr.set({ x: +clamp01(bx / W).toFixed(3), y: +clamp01(by / H).toFixed(3), c: ci, ts: now, by: myUid }).catch(function () {});
      try { rr.onDisconnect().remove(); } catch (e) {}      // clean up if I disconnect
      setTimeout(function () { rr.remove().catch(function () {}); }, 10000);   // ephemeral: self-remove after 10s
    } catch (e) {} }
  }
  function onPlayers(snap) {
    const val = snap.val() || {}; const now = Date.now();
    Object.keys(val).forEach(function (uid) {
      const p = val[uid]; if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
      if (uid === myUid) return;
      if (p.ts && now - p.ts > 60000) { delete players[uid]; return; }   // stale → evict ghost
      if (!players[uid]) players[uid] = { x: p.x, y: p.y, tx: p.x, ty: p.y, ts: p.ts || now };
      else { players[uid].tx = p.x; players[uid].ty = p.y; players[uid].ts = p.ts || now; }
    });
    Object.keys(players).forEach(function (uid) { if (!val[uid]) delete players[uid]; });
  }
  function pushMe(t) {
    if (!meRef) return;
    if (t - lastWriteMs < 150) return;
    if (Math.abs(me.x - lastWx) < 0.006 && Math.abs(me.y - lastWy) < 0.006) return;
    lastWriteMs = t; lastWx = me.x; lastWy = me.y;
    meRef.set({ x: +me.x.toFixed(3), y: +me.y.toFixed(3), ts: Date.now() }).catch(function () {});
  }
  try {
    if (firebase && firebase.auth) firebase.auth().onAuthStateChanged(function (u) {
      if (u) { if (joined && myUid !== u.uid) leave(); myUid = u.uid; join(); }   // re-join under the new uid on account switch
      else { leave(); myUid = null; }
    });
  } catch (e) {}

  /* tap → walk (ground) or spark (fire) */
  tapZone.addEventListener('click', function (e) {
    const r = canvas.getBoundingClientRect();
    const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
    if (ly < HORIZON - 2) { fireLaunch(lx, Math.max(6, ly)); return; }                    // sky → firework
    if (Math.abs(lx - fx) < 11 && ly > fy - 14 && ly < fy + 8) { doSpark(); return; }      // fire → spark
    if (joined) { me.tx = clamp01((lx - GX0) / GXW); me.ty = clamp01((ly - GY0) / GYH); me.moving = true; }  // ground → walk
  });

  function drawWalker(nx, ny, sh, moving, isMe) {
    const x = Math.round(gx(nx)), y = Math.round(gy(ny)), step = moving ? (Math.floor(tick * 0.5) % 2) : 0;
    rect(x - 1, y + 2, 3, 1, 'rgba(0,0,0,.28)');                       // shadow
    if (moving) { px(x - 1, y, '#3a2a1a'); px(x + 1, y - step, '#3a2a1a'); }   // walking legs
    else rect(x - 1, y, 3, 1, '#3a2a1a');
    rect(x - 1, y - 2, 3, 2, sh); rect(x, y - 4, 2, 2, '#e8b48c'); rect(x, y - 5, 2, 1, '#43301c');
    if (isMe) px(x, y - 7, '#ffe27a');                                // little marker over you
  }
  function buildAvatars() {
    const list = [];
    if (joined) {
      list.push({ x: me.x, y: me.y, sh: SHIRTS[hashUid(myUid) % SHIRTS.length], moving: me.moving, me: true });
      const others = Object.keys(players);
      for (let i = 0; i < others.length && list.length < MAX_PEOPLE; i++) { const p = players[others[i]]; list.push({ x: p.x, y: p.y, sh: SHIRTS[hashUid(others[i]) % SHIRTS.length], moving: (Math.abs(p.x - p.tx) > 0.004 || Math.abs(p.y - p.ty) > 0.004), me: false }); }
    } else {                                                          // fallback: villagers = online count, sitting in a ring
      const n = Math.min(fallbackCount, MAX_PEOPLE);
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i + 0.5) / n * 6.283; list.push({ x: clamp01(((fx + Math.cos(a) * 20) - GX0) / GXW), y: clamp01(((fy - 2 + Math.sin(a) * 8) - GY0) / GYH), sh: SHIRTS[i % SHIRTS.length], moving: false, me: false }); }
    }
    return list;
  }

  /* ── Frame ───────────────────────────────────────────────────── */
  function step(t) {
    // move me toward my target + broadcast
    if (joined && me.tx != null) {
      const dx = me.tx - me.x, dy = me.ty - me.y, dist = Math.hypot(dx, dy), spd = 0.022;
      if (dist < spd) { me.x = me.tx; me.y = me.ty; me.tx = null; me.moving = false; }
      else { me.x += dx / dist * spd; me.y += dy / dist * spd; me.moving = true; }
      pushMe(t);
    }
    // interpolate others toward their latest synced pos
    Object.keys(players).forEach(function (uid) { const p = players[uid]; p.x += (p.tx - p.x) * 0.25; p.y += (p.ty - p.y) * 0.25; });
    updateFireworks();
  }
  function render() {
    if (!ctx) return;
    const now = new Date(), hours = now.getHours() + now.getMinutes() / 60, w = currentWeather(now);
    ctx.clearRect(0, 0, W, H);
    drawSky(hours); drawGround();
    const av = buildAvatars();
    av.filter(function (a) { return gy(a.y) < fy; }).forEach(function (a) { drawWalker(a.x, a.y, a.sh, a.moving, a.me); });
    drawFire();
    av.filter(function (a) { return gy(a.y) >= fy; }).forEach(function (a) { drawWalker(a.x, a.y, a.sh, a.moving, a.me); });
    drawWeather(w);
    drawFireworks();
    const na = nightAmt(hours); if (na > 0) rect(0, HORIZON, W, H - HORIZON, 'rgba(10,10,30,' + (na * 0.28).toFixed(2) + ')');
    const total = joined ? (1 + Object.keys(players).length) : fallbackCount;
    if (total > MAX_PEOPLE) { ctx.fillStyle = '#ffe6a0'; ctx.font = '8px monospace'; ctx.textBaseline = 'top'; ctx.fillText('+' + (total - MAX_PEOPLE), W - 16, HORIZON + 2); }
  }

  /* ── Enable/disable (Settings → 🔥 营火) + pause when hidden ──── */
  let enabled = (localStorage.getItem('campfire') !== '0');
  let looping = false, last = 0;
  function needsRun() { return enabled && !collapsed && !document.hidden; }
  function loop(t) {
    if (!needsRun()) { looping = false; return; }
    if (t - last > 95) { last = t; tick++; step(t); render(); }
    requestAnimationFrame(loop);
  }
  function startLoop() { if (looping || !needsRun()) return; looping = true; last = 0; requestAnimationFrame(loop); }
  function applyEnabled(on) { enabled = on; wrap.style.display = on ? '' : 'none'; if (on) { join(); startLoop(); } else { leave(); } }

  document.addEventListener('visibilitychange', startLoop);
  applyEnabled(enabled);
  window.addEventListener('beforeunload', function () { if (meRef) meRef.remove().catch(function () {}); });

  const toggle = document.getElementById('campfireToggle');
  if (toggle) {
    toggle.checked = enabled;
    toggle.addEventListener('change', function () { const on = toggle.checked; try { localStorage.setItem('campfire', on ? '1' : '0'); } catch (e) {} applyEnabled(on); });
  }
})();
