/* ════════════════════════════════════════════════════════════════
   world-critters.js — little ambient creatures that make each scene feel alive:
   fish in the pool, lizards in the desert, butterflies in the meadow. Each one
   sits near a home spot and DARTS AWAY when a pet walks close, then drifts back
   once the coast is clear — a reaction to pets passing by, no buttons. Homes are
   seeded deterministically from the scene id (world-logic hashing) so they don't
   need networking; the flee is computed locally from the already-synced pet
   positions, so every screen sees roughly the same scatter for free.
   Drawn by world-core under the pets, each frame.
   ════════════════════════════════════════════════════════════════ */
const WorldCritters = (function () {
  const scenes = {};   // sceneId → { type, fleeRadius, list:[{hx,hy,x,y,ph}] }

  function cfg() { return (typeof WORLD_REACTIVE !== 'undefined' && WORLD_REACTIVE.critters) ? WORLD_REACTIVE.critters : {}; }

  function build(sceneId) {
    const c = cfg()[sceneId];
    const s = worldSceneById(sceneId);
    if (!c || !s) return null;
    const b = s.bounds, m = c.margin || 0.08;
    const x0 = b.minX + m, x1 = b.maxX - m, y0 = b.minY + m, y1 = b.maxY - m;
    const list = [];
    for (let i = 0; i < c.count; i++) {
      const rx = worldRnd(worldStrHash('critter|' + sceneId + '|' + i + '|x') % 100000);
      const ry = worldRnd(worldStrHash('critter|' + sceneId + '|' + i + '|y') % 100000);
      const ph = worldRnd(worldStrHash('critter|' + sceneId + '|' + i + '|p') % 100000) * Math.PI * 2;
      const hx = x0 + rx * (x1 - x0), hy = y0 + ry * (y1 - y0);
      list.push({ hx: hx, hy: hy, x: hx, y: hy, ph: ph });
    }
    return { type: c.type, fleeRadius: c.fleeRadius || 0.16, bounds: b, margin: m, list: list };
  }
  function stateFor(sceneId) { return scenes[sceneId] || (scenes[sceneId] = build(sceneId)); }

  function reset() { for (const k in scenes) delete scenes[k]; }

  // Ease speed per creature (how fast it darts / drifts back).
  function easeFor(type) { return type === 'lizard' ? 9 : (type === 'fish' ? 6 : 4); }

  function actors(me, remotes) {
    const list = [];
    if (me && me.uid) list.push(me);
    if (remotes) Object.keys(remotes).forEach(function (k) { list.push(remotes[k]); });
    return list;
  }

  function update(dtSec, me, remotes, sceneId) {
    const st = stateFor(sceneId);
    if (!st) return;
    const pets = actors(me, remotes);
    const fr = st.fleeRadius, fleeDist = fr, ease = Math.min(1, dtSec * easeFor(st.type));
    const b = st.bounds, m = st.margin;
    for (let i = 0; i < st.list.length; i++) {
      const cr = st.list[i];
      // Nearest pet to the creature right now.
      let nd = 1e9, ndx = 0, ndy = 0;
      for (let j = 0; j < pets.length; j++) {
        const dx = cr.x - pets[j].x, dy = cr.y - pets[j].y, d = Math.hypot(dx, dy);
        if (d < nd) { nd = d; ndx = dx; ndy = dy; }
      }
      let tx = cr.hx, ty = cr.hy;
      if (nd < fr && nd > 1e-4) {
        const push = (fr - nd) / fr;                 // 1 when the pet is right on it
        tx = cr.hx + (ndx / nd) * push * fleeDist;    // flee outward from the pet
        ty = cr.hy + (ndy / nd) * push * fleeDist;
        tx = wClamp(tx, b.minX + m * 0.4, b.maxX - m * 0.4);
        ty = wClamp(ty, b.minY + m * 0.4, b.maxY - m * 0.4);
      }
      cr.x += (tx - cr.x) * ease;
      cr.y += (ty - cr.y) * ease;
    }
  }

  // ── Draw ──
  function drawFish(ctx, px, py, ds, t, cr) {
    const s = ds * 9, bob = Math.sin(t * 2 + cr.ph) * s * 0.18;
    const dir = Math.cos(t * 0.6 + cr.ph) >= 0 ? 1 : -1;   // gentle facing sway
    ctx.save(); ctx.translate(px, py + bob); ctx.scale(dir, 1);
    ctx.fillStyle = '#ff9f43';
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.5, -s * 0.5); ctx.lineTo(-s * 1.5, s * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.12, s * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.12, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawLizard(ctx, px, py, ds, t, cr) {
    const s = ds * 8, wig = Math.sin(t * 3 + cr.ph) * s * 0.25;
    ctx.save(); ctx.translate(px, py);
    ctx.strokeStyle = '#6fae3d'; ctx.lineWidth = s * 0.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 1.4, wig); ctx.quadraticCurveTo(0, -wig, s * 1.1, 0); ctx.stroke();
    ctx.fillStyle = '#7cc24a'; ctx.beginPath(); ctx.arc(s * 1.1, 0, s * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5f9c34'; ctx.lineWidth = s * 0.18;
    for (let k = -1; k <= 1; k += 2) {
      ctx.beginPath(); ctx.moveTo(-s * 0.3, 0); ctx.lineTo(-s * 0.6, k * s * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.5, 0); ctx.lineTo(s * 0.8, k * s * 0.6); ctx.stroke();
    }
    ctx.restore();
  }

  function drawButterfly(ctx, px, py, ds, t, cr) {
    const s = ds * 8, flap = Math.abs(Math.sin(t * 6 + cr.ph));
    const hover = s * 1.4 + Math.sin(t * 2 + cr.ph) * s * 0.5; // floats above the ground
    // faint ground shadow
    ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(px, py, s * 0.6, s * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(px, py - hover);
    const wing = ['#ff8fb8', '#ffd166'][((cr.ph * 10) | 0) % 2];
    for (let k = -1; k <= 1; k += 2) {
      ctx.save(); ctx.scale(k * (0.4 + flap * 0.6), 1); ctx.fillStyle = wing;
      ctx.beginPath(); ctx.ellipse(s * 0.7, -s * 0.3, s * 0.7, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.6, s * 0.35, s * 0.5, s * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = '#5b3a29'; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, s * 0.55); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, W, H, t, sceneId) {
    const st = stateFor(sceneId);
    if (!st) return;
    const tt = t / 1000;
    for (let i = 0; i < st.list.length; i++) {
      const cr = st.list[i], ds = depthScale(cr.y), px = cr.x * W, py = cr.y * H;
      if (st.type === 'fish') drawFish(ctx, px, py, ds, tt, cr);
      else if (st.type === 'lizard') drawLizard(ctx, px, py, ds, tt, cr);
      else drawButterfly(ctx, px, py, ds, tt, cr);
    }
  }

  return { update, draw, reset };
})();
