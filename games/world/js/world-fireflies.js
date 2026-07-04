/* ════════════════════════════════════════════════════════════════
   world-fireflies.js — dusk & night fireflies. The inverse of world-critters:
   instead of FLEEING an approaching pet, they home toward and gently orbit the
   NEAREST one, so standing still gathers a warm glow around you (walk and they
   trail behind, then scatter). Two pets close together pool a brighter swarm.

   They only exist while the Sky Clock is dark (darkness = skyState().star), fading
   in at dusk and out at dawn, and they steer purely off the already-synced pet
   positions — so like the other ambient creatures they need ZERO networking and
   every client sees roughly the same swarm for free. Drawn OVER the pets (additive
   glow) so they read like little lanterns.
   ════════════════════════════════════════════════════════════════ */
const WorldFireflies = (function () {
  const N = 16;              // fireflies per scene
  const DARK_MIN = 0.12;     // below this darkness they're gone (daytime)
  let flies = [];
  let sceneId = null;

  function build(sid) {
    const s = worldSceneById(sid), b = s.bounds, arr = [];
    for (let i = 0; i < N; i++) {
      const rx = worldRnd(worldStrHash('fly|' + sid + '|' + i + '|x') % 100000);
      const ry = worldRnd(worldStrHash('fly|' + sid + '|' + i + '|y') % 100000);
      const ph = worldRnd(worldStrHash('fly|' + sid + '|' + i + '|p') % 100000) * Math.PI * 2;
      arr.push({
        x: b.minX + rx * (b.maxX - b.minX), y: b.minY + ry * (b.maxY - b.minY),
        vx: 0, vy: 0, ph: ph, wob: worldRnd(i + 7),
      });
    }
    return arr;
  }
  function reset() { flies = []; sceneId = null; }

  function pets(me, remotes) {
    const list = [me];
    if (remotes) for (const k in remotes) list.push(remotes[k]);
    return list;
  }

  function update(dt, me, remotes, darkness, t) {
    if (!me || !me.scene || darkness <= DARK_MIN) { return; }
    if (sceneId !== me.scene) { sceneId = me.scene; flies = build(sceneId); }
    const s = worldSceneById(sceneId), b = s.bounds, herd = pets(me, remotes);
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      f.ph += dt * (1.2 + f.wob * 1.6);
      // Nearest pet to this firefly.
      let nd = 1e9, np = null;
      for (let j = 0; j < herd.length; j++) {
        const p = herd[j]; if (!p || typeof p.x !== 'number') continue;
        const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < nd) { nd = d; np = p; }
      }
      let tx, ty, k;
      if (np && nd < 0.5) {
        // Orbit the pet at a spread of radii/heights so they read as a loose,
        // twinkly swarm rather than a single clump; they trail as the pet moves.
        const r = 0.06 + 0.11 * f.wob;
        tx = np.x + Math.cos(f.ph) * r;
        ty = np.y - (0.02 + 0.07 * f.wob) + Math.sin(f.ph) * r * 0.7;
        k = 2.6;
      } else {
        // No pet near — drift gently in place.
        tx = f.x + Math.cos(f.ph * 0.7) * 0.02;
        ty = f.y + Math.sin(f.ph) * 0.02;
        k = 1.1;
      }
      f.vx += (tx - f.x) * k * dt; f.vy += (ty - f.y) * k * dt;
      f.vx *= 0.86; f.vy *= 0.86;
      f.x = wClamp(f.x + f.vx * dt, b.minX, b.maxX);
      f.y = wClamp(f.y + f.vy * dt, b.minY, b.maxY);
    }
  }

  function draw(ctx, W, H, t, darkness) {
    if (darkness <= DARK_MIN || !flies.length) return;
    const tt = t / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // additive → warm glow that reads at night
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      const blink = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(tt * 3 + f.ph * 2), 2);
      const a = Math.min(1, darkness * 1.1) * blink;
      const px = f.x * W, py = f.y * H, ds = depthScale(f.y), r = ds * 2.4;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
      g.addColorStop(0, 'rgba(226,255,150,' + (0.9 * a) + ')');
      g.addColorStop(0.5, 'rgba(180,240,90,' + (0.32 * a) + ')');
      g.addColorStop(1, 'rgba(180,240,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(244,255,196,' + a + ')';
      ctx.beginPath(); ctx.arc(px, py, r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  return { update, draw, reset };
})();
