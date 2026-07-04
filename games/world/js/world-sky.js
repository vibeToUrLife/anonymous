/* ════════════════════════════════════════════════════════════════
   world-sky.js — the living "Sky Clock": a real time-of-day tint drifting
   through dawn, golden hour, day, dusk and a starry night. It's a pure function
   of the shared server clock (world-logic skyState), so every client painting at
   the same moment shows the same sky with ZERO networking — two pets standing
   together see an identical sunset. Nothing is synced, nothing is stored.

   Two layers, both driven by one skyState() per frame:
     drawBg   — a translucent gradient laid over the scene's own sky (UNDER the
                pets, so they stay bright), plus a seeded star field + arcing moon
                at night. At midday it's fully transparent (scenes look untouched).
     drawWash — a subtle warm glow over EVERYTHING at golden hour, so pets catch
                the low sun. Skipped otherwise.
   ════════════════════════════════════════════════════════════════ */
const WorldSky = (function () {
  let serverNow = function () { return Date.now(); };
  const STAR_N = 60;

  function tz() { return (typeof WORLD_SPARKLES !== 'undefined' && WORLD_SPARKLES.tzOffsetMin) || 480; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function init(opts) { serverNow = (opts && opts.serverNow) || serverNow; }
  function state() { return skyState(serverNow(), tz()); }

  // Where the moon sits across the night (0 rising at left … 1 setting at right),
  // or -1 during daylight. Night runs ~19:00 → 05:00 across midnight.
  function moonProgress(hour) {
    if (hour >= 19) return (hour - 19) / 10;
    if (hour < 5) return (hour + 5) / 10;
    return -1;
  }

  // Time-of-day tint + stars + moon, drawn right over the scene background.
  function drawBg(ctx, W, H, t, sky) {
    if (sky.alpha <= 0.001 && sky.star <= 0.001) return; // clear day → leave the scene as-is
    ctx.save();
    if (sky.alpha > 0.001) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgba(sky.top, sky.alpha));
      g.addColorStop(1, rgba(sky.bottom, sky.alpha));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (sky.star > 0.02) {
      const tt = t / 1000;
      // Moon — soft glowing disc arcing across the upper sky.
      const mp = moonProgress(sky.hour);
      if (mp >= 0 && mp <= 1) {
        const mx = W * (0.12 + mp * 0.76), my = H * (0.30 - Math.sin(mp * Math.PI) * 0.14);
        const mr = Math.min(W, H) * 0.05;
        ctx.globalAlpha = sky.star;
        const gg = ctx.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 2.6);
        gg.addColorStop(0, 'rgba(255,250,220,0.9)'); gg.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(mx, my, mr * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fdf6d8'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Stars — seeded so they hold still, twinkling; kept to the upper sky.
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < STAR_N; i++) {
        const sx = worldRnd(i * 2 + 1) * W;
        const sy = worldRnd(i * 2 + 2) * H * 0.55;
        const tw = 0.5 + 0.5 * Math.sin(tt * 2 + i * 1.3);
        ctx.globalAlpha = sky.star * (0.3 + 0.55 * tw);
        const r = 0.6 + tw * 1.1;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Subtle warm glow over the whole frame at golden hour (pets catch the low sun).
  function drawWash(ctx, W, H, sky) {
    if (sky.warm <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = 0.12 * sky.warm;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,180,90,1)');
    g.addColorStop(1, 'rgba(255,140,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  return { init, state, drawBg, drawWash };
})();
