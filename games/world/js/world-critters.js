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
      const a = worldRnd(worldStrHash('critter|' + sceneId + '|' + i + '|a') % 100000) * Math.PI * 2;
      const hx = x0 + rx * (x1 - x0), hy = y0 + ry * (y1 - y0);
      list.push({ hx: hx, hy: hy, x: hx, y: hy, ph: ph, ang: a, spd: 0 });
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
      const vx = (tx - cr.x) * ease, vy = (ty - cr.y) * ease;
      cr.x += vx; cr.y += vy;
      // Track heading + "runningness" so the lizard faces where it scurries and
      // its legs/tail liven up when darting (local only — critters aren't synced).
      const msp = Math.hypot(vx, vy);
      const run = Math.min(1, msp / 0.006);
      cr.spd += (run - cr.spd) * Math.min(1, dtSec * 10);
      if (msp > 1e-5) {
        const desired = Math.atan2(vy, vx);
        let da = desired - cr.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        cr.ang += da * Math.min(1, dtSec * 12);
      }
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

  // A cute claymorphic desert gecko: a tapering chain of soft segments riding a
  // travelling sine wave (so the tail slithers), four little legs that trot when
  // it darts, a patterned back, beady eyes and a soft ground shadow. The whole
  // body is rotated to face its heading (cr.ang) so it scurries where it runs.
  function drawLizard(ctx, px, py, ds, t, cr) {
    const s = ds * 7.5;
    const ang = cr.ang || 0;
    const run = cr.spd || 0;                     // 0 = resting … 1 = scurrying
    const wigAmp = s * (0.10 + 0.16 * run);      // tail sways wider when running
    const wigSpd = 6 + 7 * run;                  //  … and faster
    const legStep = t * (5 + 9 * run);           // gait cadence

    // Warm olive desert palette (ties into the scene's cacti/palms, pops on sand).
    const BODY = '#8fae54', DORSAL = '#b6d06a', SHADE = '#6d9040', SPOT = '#5c7a30', FOOT = '#5f8038';

    // Soft ground shadow, elongated along the body's heading.
    ctx.save();
    ctx.translate(px, py + s * 0.5); ctx.rotate(ang);
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(-s * 0.2, 0, s * 1.7, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(px, py); ctx.rotate(ang);

    // Spine points from head (+x) back to the tail tip (−x), each with a body
    // radius that tapers toward the tail; the whole spine rides a travelling sine
    // wave so the tail slithers.
    const N = 10, headX = s * 1.05, step = s * 0.4, seg = [];
    for (let i = 0; i < N; i++) {
      const taper = Math.pow(1 - i / N, 0.8);
      const wig = Math.sin(t * wigSpd - i * 0.6 + cr.ph) * wigAmp * (i / N);
      seg.push({ x: headX - i * step, y: wig, r: s * (0.5 * taper + 0.03) });
    }
    // Trace a smooth tapered outline down one side of the spine and back the other
    // (perpendicular offsets by the local radius) for a single clay-smooth body.
    function outline(rs) {
      ctx.beginPath();
      for (let pass = 0; pass < 2; pass++) {
        const from = pass === 0 ? 0 : N - 1, to = pass === 0 ? N : -1, dir = pass === 0 ? 1 : -1;
        for (let i = from; i !== to; i += dir) {
          const a = seg[Math.max(0, i - 1)], b = seg[Math.min(N - 1, i + 1)];
          let dx = b.x - a.x, dy = b.y - a.y; const m = Math.hypot(dx, dy) || 1;
          const nx = -dy / m, ny = dx / m, r = seg[i].r * rs * dir;
          const x = seg[i].x + nx * r, y = seg[i].y + ny * r;
          (pass === 0 && i === 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
    }

    // Legs (under the body) — shoulders by seg[1], hips by seg[5], diagonal trot.
    const legs = [
      { b: seg[1], side: -1, ph: 0 }, { b: seg[1], side: 1, ph: Math.PI },
      { b: seg[5], side: -1, ph: Math.PI }, { b: seg[5], side: 1, ph: 0 },
    ];
    ctx.strokeStyle = SHADE; ctx.lineWidth = s * 0.24; ctx.lineCap = 'round';
    for (let li = 0; li < legs.length; li++) {
      const L = legs[li], swing = Math.sin(legStep + L.ph) * s * 0.35;
      const footX = L.b.x + swing * 1.4;
      const footY = L.b.y + L.side * s * (0.9 + 0.15 * Math.cos(legStep + L.ph));
      ctx.beginPath();
      ctx.moveTo(L.b.x, L.b.y);
      ctx.quadraticCurveTo(L.b.x + swing, L.b.y + L.side * s * 0.5, footX, footY);
      ctx.stroke();
      ctx.fillStyle = FOOT;
      ctx.beginPath(); ctx.arc(footX, footY, s * 0.15, 0, Math.PI * 2); ctx.fill();
    }

    // Body silhouette, a smooth lighter dorsal stripe on top, then banding spots.
    ctx.fillStyle = BODY; outline(1); ctx.fill();
    ctx.fillStyle = DORSAL; outline(0.5); ctx.fill();
    ctx.fillStyle = SPOT;
    for (let i = 2; i < N - 1; i += 2) { ctx.beginPath(); ctx.arc(seg[i].x, seg[i].y, seg[i].r * 0.32, 0, Math.PI * 2); ctx.fill(); }

    // Head — rounded with a little snout and clay highlight, riding seg[0].
    const hx = seg[0].x, hy = seg[0].y, hr = s * 0.6;
    ctx.fillStyle = BODY;
    ctx.beginPath(); ctx.ellipse(hx, hy, hr, hr * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + hr * 0.72, hy, hr * 0.46, hr * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = DORSAL;
    ctx.beginPath(); ctx.ellipse(hx, hy - hr * 0.22, hr * 0.58, hr * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    // Eyes set on the sides of the head, each with a tiny catch-light.
    for (let k = -1; k <= 1; k += 2) {
      const ex = hx + hr * 0.2, ey = hy + k * hr * 0.52;
      ctx.fillStyle = '#2a3618';
      ctx.beginPath(); ctx.arc(ex, ey, hr * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(ex + hr * 0.07, ey - hr * 0.07, hr * 0.07, 0, Math.PI * 2); ctx.fill();
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
