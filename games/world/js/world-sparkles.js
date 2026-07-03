/* ════════════════════════════════════════════════════════════════
   world-sparkles.js — the Daily Sparkle Hunt. Each day, `perScene` hidden
   sparkles hide in every scene at positions seeded from the date+scene, so
   every client sees the SAME spots with zero networking — yet each player
   collects their OWN set (persisted to rooms/{uid}.worldSparkles). Sparkles
   stay invisible until the player is near (a hot/cold search) and are collected
   by simply walking onto them (mobile-first: no key, no tap). Pure placement +
   reveal math lives in world-logic.js (unit-tested); this module owns the
   Firebase load/save, the per-frame collection check, and the canvas draw.
   ════════════════════════════════════════════════════════════════ */
const WorldSparkles = (function () {
  let db = null, uid = null;
  let serverNow = function () { return Date.now(); };
  let flashHint = function () {};
  let triggerSparkle = function () {};   // fire the 'sparkle' emote so others see a find
  let onProgress = function () {};

  let dayKey = '';
  const found = new Set();      // "sceneId:index" collected today (this player)
  const spotCache = {};         // sceneId → [{x,y}] for today
  const bursts = [];            // collect celebrations { x, y, start }
  let total = 0;
  let celebrateUntil = 0;       // completion sparkle-rain end time (server ms)

  function cfg() {
    return (typeof WORLD_SPARKLES !== 'undefined') ? WORLD_SPARKLES
      : { perScene: 3, collectRadius: 0.055, revealRadius: 0.22, margin: 0.06, tzOffsetMin: 480 };
  }
  function sceneCount() { return (typeof WORLD_SCENES !== 'undefined') ? WORLD_SCENES.length : 3; }

  function spotsFor(sceneId) {
    if (spotCache[sceneId]) return spotCache[sceneId];
    const c = cfg();
    const s = worldSceneById(sceneId);
    spotCache[sceneId] = sparkleSpots(dayKey, sceneId, s.bounds, c.perScene, c.margin);
    return spotCache[sceneId];
  }

  function resetDay(newKey) {
    dayKey = newKey;
    found.clear();
    for (const k in spotCache) delete spotCache[k];
    onProgress(found.size, total);
  }

  function persist() {
    if (!db || !uid) return;
    db.collection('rooms').doc(uid).set(
      { worldSparkles: { d: dayKey, f: Array.from(found) } }, { merge: true }
    ).catch(function () {});
  }

  function init(opts) {
    db = opts.db || null; uid = opts.uid || null;
    serverNow = opts.serverNow || serverNow;
    flashHint = opts.flashHint || flashHint;
    triggerSparkle = opts.triggerSparkle || triggerSparkle;
    onProgress = opts.onProgress || onProgress;
    total = sceneCount() * cfg().perScene;
    dayKey = worldDayKey(serverNow(), cfg().tzOffsetMin);
    // Load today's collected set (ignore a stale prior day).
    if (db && uid) {
      db.collection('rooms').doc(uid).get().then(function (d) {
        const x = d.exists && d.data().worldSparkles;
        if (x && x.d === dayKey && Array.isArray(x.f)) x.f.forEach(function (k) { found.add(k); });
        onProgress(found.size, total);
      }).catch(function () { onProgress(found.size, total); });
    } else {
      onProgress(found.size, total);
    }
  }

  // Per-frame: roll the day over if needed, then collect any spot walked onto.
  function update(me) {
    if (!me || !me.scene) return;
    const c = cfg();
    const today = worldDayKey(serverNow(), c.tzOffsetMin);
    if (today !== dayKey) resetDay(today);
    const spots = spotsFor(me.scene);
    for (let i = 0; i < spots.length; i++) {
      const key = me.scene + ':' + i;
      if (found.has(key)) continue;
      if (worldDist(me, spots[i]) > c.collectRadius) continue;
      found.add(key);
      bursts.push({ x: spots[i].x, y: spots[i].y, start: serverNow() });
      persist();
      onProgress(found.size, total);
      triggerSparkle();                 // nearby players see the ✨ — a free social signal
      if (found.size >= total) { flashHint('✨ You found every sparkle today! 🎉'); celebrateUntil = serverNow() + 2400; }
      else { flashHint('✨ Sparkle found! ' + found.size + '/' + total + ' today'); }
    }
  }

  // ── Draw ──
  function drawSparkle(ctx, px, py, ds, glow, t) {
    const twinkle = 0.55 + 0.45 * Math.sin(t * 6 + px * 0.05);
    const size = ds * (10 + glow * 14);
    ctx.save();
    // soft warm halo, faint when far and bright up close
    ctx.globalAlpha = glow * 0.6 * twinkle;
    const g = ctx.createRadialGradient(px, py, 0, px, py, size * 1.8);
    g.addColorStop(0, 'rgba(255,240,170,0.9)');
    g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, size * 1.8, 0, Math.PI * 2); ctx.fill();
    // the sparkle glyph
    ctx.globalAlpha = Math.min(1, glow * (0.4 + 0.6 * glow));
    ctx.font = (size | 0) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✨', px, py);
    ctx.restore();
  }

  function drawBurst(ctx, px, py, ds, p) {
    const n = 8, r = ds * (8 + p * 48);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = ((ds * 16) | 0) + 'px serif';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + p * 1.5;
      ctx.fillText(i % 2 ? '⭐' : '✨', px + Math.cos(a) * r, py + Math.sin(a) * r * 0.6 - p * ds * 20);
    }
    ctx.restore();
  }

  function drawCelebration(ctx, W, H, t, k) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 24; i++) {
      const sx = worldRnd(i + 1) * W;
      const sy = ((t * 0.12 + worldRnd(i + 50)) % 1) * H;
      const sz = 14 + worldRnd(i + 90) * 18;
      ctx.font = (sz | 0) + 'px serif';
      ctx.fillText(i % 2 ? '✨' : '⭐', sx, sy);
    }
    ctx.restore();
  }

  function draw(ctx, W, H, t, me, sceneId) {
    if (!me) return;
    const c = cfg();
    const spots = spotsFor(sceneId);
    for (let i = 0; i < spots.length; i++) {
      if (found.has(sceneId + ':' + i)) continue;
      const sp = spots[i];
      const glow = sparkleGlow(worldDist(me, sp), c.revealRadius);
      if (glow <= 0) continue;       // hidden until the player is near
      drawSparkle(ctx, sp.x * W, sp.y * H, depthScale(sp.y), glow, t);
    }
    const now = serverNow();
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], p = (now - b.start) / 900;
      if (p >= 1) { bursts.splice(i, 1); continue; }
      drawBurst(ctx, b.x * W, b.y * H, depthScale(b.y), p);
    }
    if (now < celebrateUntil) drawCelebration(ctx, W, H, t, (celebrateUntil - now) / 2400);
  }

  return { init, update, draw };
})();
