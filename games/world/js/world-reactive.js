/* ════════════════════════════════════════════════════════════════
   world-reactive.js — the world reacts to pets as they MOVE (no buttons).
   Two layers, both driven purely by the already-synced pet positions, so every
   client renders the same reactions with zero networking:
     1. Ambient contact marks under every moving pet — ripples in the pool,
        deeper paw-prints in the desert sand, parted grass + petals in the
        meadow (flavoured by the scene's fx).
     2. Props that respond when a pet walks into them (WORLD_REACTIVE.props),
        each with a `react` style:
          bump  — springs away in the push direction, then settles
                  (palm / bush / cactus / mushroom / floatie)
          sink  — presses down while a pet stands on it, ripples (lily pads)
          bloom — opens/scales up while a pet is near, then closes (flowers)
   (The pool's kickable ball is its own module, world-ball.js.)
   Called each frame by world-core between the scene background and the actors.
   ════════════════════════════════════════════════════════════════ */
const WorldReactive = (function () {
  const trails = {};      // uid → [{ x, y, born }] recent contact marks
  const propState = {};   // "sceneId:i" → { react, pushX, pushY, inside, burstAt, press, bloom }

  function cfg() { return (typeof WORLD_REACTIVE !== 'undefined') ? WORLD_REACTIVE : { contact: 0.07, props: {} }; }
  function propsFor(s) { const p = cfg().props[s]; return Array.isArray(p) ? p : []; }
  function stateFor(key) { return propState[key] || (propState[key] = { react: 0, pushX: 0, pushY: 1, inside: false, burstAt: -1e9, press: 0, bloom: 0 }); }

  // Scene switch: reactions/marks don't carry across scenes.
  function reset() { for (const k in trails) delete trails[k]; for (const k in propState) delete propState[k]; }

  function actorsList(me, remotes) {
    const list = [];
    if (me && me.uid) list.push({ uid: me.uid, x: me.x, y: me.y, moving: !!me.moving });
    Object.keys(remotes).forEach(function (k) {
      const r = remotes[k];
      const moving = Math.hypot((r.targetX != null ? r.targetX : r.x) - r.x, (r.targetY != null ? r.targetY : r.y) - r.y) > 0.0025;
      list.push({ uid: k, x: r.x, y: r.y, moving: moving });
    });
    return list;
  }

  function addTrail(a, t) {
    if (!a.uid || !a.moving) return;          // marks only where a pet is actually moving
    const arr = trails[a.uid] || (trails[a.uid] = []);
    const last = arr.length ? arr[arr.length - 1] : null;
    if (!last || Math.hypot(a.x - last.x, a.y - last.y) > 0.02) {
      arr.push({ x: a.x, y: a.y, born: t });
      if (arr.length > 20) arr.shift();
    }
  }

  function update(t, dtSec, me, remotes, sceneId) {
    const actors = actorsList(me, remotes);
    for (let i = 0; i < actors.length; i++) addTrail(actors[i], t);

    const props = propsFor(sceneId);
    const contact = cfg().contact, bloomR = contact * 1.8;
    for (let pi = 0; pi < props.length; pi++) {
      const prop = props[pi], st = stateFor(sceneId + ':' + pi);
      let inside = false, insideBloom = false, hit = null;
      for (let i = 0; i < actors.length; i++) {
        const d = worldDist(actors[i], prop);
        if (d <= contact) { inside = true; if (!hit) hit = actors[i]; }
        if (d <= bloomR) insideBloom = true;
      }
      if (prop.react === 'sink') {
        if (inside && !st.inside) st.burstAt = t;                 // ripple on step-on
        st.press += ((inside ? 1 : 0) - st.press) * Math.min(1, dtSec * 6);
      } else if (prop.react === 'bloom') {
        st.bloom += ((insideBloom ? 1 : 0) - st.bloom) * Math.min(1, dtSec * 4);
      } else { // bump (default)
        if (inside && !st.inside && hit) {                        // fresh contact → bump away
          st.react = 1; st.burstAt = t;
          const dx = prop.x - hit.x, dy = prop.y - hit.y, m = Math.hypot(dx, dy) || 1;
          st.pushX = dx / m; st.pushY = dy / m;
        }
        st.react = Math.max(0, st.react - dtSec * 2.4);            // spring back over ~0.4s
      }
      st.inside = inside;
    }
  }

  // ── Draw: ambient marks ──
  function drawMark(ctx, px, py, ds, age, fx) {
    ctx.save();
    if (fx === 'water') {
      ctx.globalAlpha = (1 - age) * 0.5; ctx.strokeStyle = '#cdefff'; ctx.lineWidth = ds * 2.2;
      ctx.beginPath(); ctx.ellipse(px, py, ds * (5 + age * 26), ds * (2 + age * 11), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (fx === 'sand') {
      // Deeper footprints: a paw pad + three toe beans, pressed into the sand and
      // slow to fade.
      ctx.globalAlpha = (1 - age) * 0.5; ctx.fillStyle = '#c79a5b';
      ctx.beginPath(); ctx.ellipse(px, py, ds * 3.2, ds * 2.4, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(px + k * ds * 2.4, py - ds * 3.0, ds * 1.1, ds * 1.3, 0, 0, Math.PI * 2); ctx.fill(); }
    } else { // grassland — a parted-grass flick that greens then drifts a petal up
      ctx.globalAlpha = (1 - age) * 0.7; ctx.fillStyle = age < 0.5 ? '#8fd07f' : '#ffd1e8';
      ctx.beginPath(); ctx.ellipse(px, py - age * ds * 16, ds * 3.4, ds * 2, age * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Scene-flavoured burst at a bumped prop (reuses WORLD_SCENE_FX from world-actions).
  function drawBurst(ctx, px, py, ds, t, st, fx) {
    const p = (t - st.burstAt) / 700;
    if (p < 0 || p >= 1) return;
    const pal = (typeof WORLD_SCENE_FX !== 'undefined' && WORLD_SCENE_FX[fx]) || null;
    const n = 8;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = p * ds * 40;
      const x = px + Math.cos(a) * r, y = py - Math.abs(Math.sin(a)) * r * 0.6 - p * ds * 12;
      if (pal && pal.emoji) { ctx.font = ((ds * 10) | 0) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pal.emoji, x, y); }
      else { ctx.fillStyle = pal ? pal.colors[i % pal.colors.length] : '#fff'; ctx.beginPath(); ctx.arc(x, y, ds * 3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function shadow(ctx, px, py, rx, ry) {
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  // ── Draw: bump props ──
  function drawPalm(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), bx = prop.x * W, by = prop.y * H, s = ds * 58;
    const sway = st.react * (0.18 + 0.12 * Math.sin(t * 0.02));
    shadow(ctx, bx, by + ds * 2, s * 0.4, s * 0.12);
    ctx.save();
    ctx.strokeStyle = '#a9713f'; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway * s * 0.3, by - s * 0.6, bx + sway * s, by - s); ctx.stroke();
    const tx = bx + sway * s, ty = by - s;
    ctx.strokeStyle = '#4fae4a'; ctx.lineWidth = s * 0.08;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5 + sway * 0.3;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * s * 0.4, ty + Math.sin(a) * s * 0.4, tx + Math.cos(a) * s * 0.72, ty + Math.sin(a) * s * 0.72 + s * 0.14);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b4423';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(tx + (i - 1) * s * 0.12, ty + s * 0.1 + Math.abs(Math.sin(st.react * 6 + i)) * st.react * s * 0.1, s * 0.08, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    drawBurst(ctx, bx, by, ds, t, st, fx);
  }

  function drawBush(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), bx = prop.x * W, by = prop.y * H, s = ds * 32;
    const shake = st.react * Math.sin(t * 0.03) * s * 0.14;
    shadow(ctx, bx, by + ds * 2, s * 0.95, s * 0.26);
    ctx.save();
    ctx.translate(bx + shake, by);
    ctx.fillStyle = '#57b84a';
    ctx.beginPath();
    ctx.arc(0, -s * 0.3, s * 0.6, 0, Math.PI * 2);
    ctx.arc(-s * 0.5, -s * 0.1, s * 0.45, 0, Math.PI * 2);
    ctx.arc(s * 0.5, -s * 0.1, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    const fc = ['#ff8fb8', '#ffe27a', '#ffffff'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = fc[i]; ctx.beginPath(); ctx.arc((i - 1) * s * 0.4, -s * 0.45, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc((i - 1) * s * 0.4, -s * 0.45, s * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    drawBurst(ctx, bx, by - s * 0.3, ds, t, st, fx);
  }

  function drawCactus(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), bx = prop.x * W, by = prop.y * H, s = ds * 34;
    const lean = st.react * st.pushX * 0.18;
    shadow(ctx, bx, by + ds * 2, s * 0.7, s * 0.18);
    ctx.save(); ctx.translate(bx, by); ctx.rotate(lean);
    ctx.fillStyle = '#3f9d54'; ctx.strokeStyle = '#2f7d40';
    const rr = s * 0.32;
    // trunk
    ctx.beginPath(); ctx.moveTo(-rr, 0); ctx.lineTo(-rr, -s * 1.1);
    ctx.arc(0, -s * 1.1, rr, Math.PI, 0); ctx.lineTo(rr, 0); ctx.closePath(); ctx.fill();
    // arms
    ctx.lineWidth = rr * 1.2; ctx.lineCap = 'round';
    ctx.strokeStyle = '#3f9d54';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.5, -s * 0.7); ctx.lineTo(s * 0.5, -s * 1.0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.55); ctx.lineTo(-s * 0.45, -s * 0.55); ctx.lineTo(-s * 0.45, -s * 0.85); ctx.stroke();
    // spines
    ctx.strokeStyle = '#dfeecf'; ctx.lineWidth = Math.max(1, s * 0.04);
    for (let i = 0; i < 4; i++) { const y = -s * (0.2 + i * 0.24); ctx.beginPath(); ctx.moveTo(-rr * 0.4, y); ctx.lineTo(rr * 0.4, y); ctx.stroke(); }
    // little flower on top
    ctx.fillStyle = '#ff6b9d'; ctx.beginPath(); ctx.arc(0, -s * 1.2, s * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawBurst(ctx, bx, by - s * 0.6, ds, t, st, fx);
  }

  function drawMushroom(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), bx = prop.x * W, by = prop.y * H, s = ds * 26;
    const squish = st.react * (0.5 + 0.5 * Math.sin(t * 0.05));
    shadow(ctx, bx, by + ds * 2, s * 0.8, s * 0.22);
    ctx.save(); ctx.translate(bx, by);
    // stem
    ctx.fillStyle = '#f3ead2';
    ctx.beginPath(); ctx.moveTo(-s * 0.3, 0); ctx.quadraticCurveTo(-s * 0.22, -s * 0.7, -s * 0.28, -s * 0.8);
    ctx.lineTo(s * 0.28, -s * 0.8); ctx.quadraticCurveTo(s * 0.22, -s * 0.7, s * 0.3, 0); ctx.closePath(); ctx.fill();
    // cap (squishes down a touch on bump)
    const capY = -s * 0.75 + squish * s * 0.12, capW = s * (0.95 + squish * 0.12), capH = s * (0.62 - squish * 0.12);
    ctx.fillStyle = '#e5484d';
    ctx.beginPath(); ctx.ellipse(0, capY, capW, capH, 0, Math.PI, 0); ctx.lineTo(capW, capY); ctx.ellipse(0, capY, capW, capH * 0.4, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.35, capY - s * 0.1, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.3, capY - s * 0.05, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, capY - s * 0.25, s * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawBurst(ctx, bx, by - s * 0.6, ds, t, st, fx);
  }

  function drawFloatie(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), r = ds * 17;
    const px = (prop.x + st.pushX * st.react * 0.03) * W;
    const py = prop.y * H - st.react * ds * 10;
    shadow(ctx, prop.x * W, prop.y * H + ds * 2, r * 1.0, r * 0.34);
    ctx.save(); ctx.translate(px, py); ctx.rotate(st.pushX * st.react * 0.5);
    const cols = ['#ff5d5d', '#ffffff', '#ffd93b', '#ffffff'];
    ctx.lineWidth = r * 0.62; ctx.lineCap = 'butt';
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── Draw: sink prop (lily pad) ──
  function drawLilypad(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), bx = prop.x * W, s = ds * 22;
    const by = prop.y * H + st.press * ds * 5;   // presses into the water
    // ripple when stepped on
    const rp = (t - st.burstAt) / 600;
    if (rp >= 0 && rp < 1) {
      ctx.save(); ctx.globalAlpha = (1 - rp) * 0.5; ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = ds * 1.6;
      ctx.beginPath(); ctx.ellipse(bx, by, s * (0.8 + rp * 1.6), s * (0.3 + rp * 0.6), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 1 - st.press * 0.25;
    // pad
    ctx.fillStyle = '#3f9d54';
    ctx.beginPath(); ctx.ellipse(bx, by, s, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#357f45';
    ctx.beginPath(); ctx.ellipse(bx, by, s, s * 0.42, 0, -0.35, 0.35); ctx.lineTo(bx, by); ctx.fill(); // notch wedge
    // small lotus
    ctx.fillStyle = '#ff9ec7';
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(bx + Math.cos(a) * s * 0.28, by - s * 0.18 + Math.sin(a) * s * 0.12, s * 0.16, s * 0.1, a, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(bx, by - s * 0.18, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Draw: bloom prop (flower) ──
  function drawFlower(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), bx = prop.x * W, by = prop.y * H, s = ds * 24;
    const open = st.bloom;                       // 0 = bud, 1 = fully open
    shadow(ctx, bx, by + ds * 2, s * 0.3, s * 0.1);
    ctx.save();
    // stem + leaf
    ctx.strokeStyle = '#3f9d40'; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - s * 0.9); ctx.stroke();
    ctx.fillStyle = '#4fae4a'; ctx.beginPath(); ctx.ellipse(bx + s * 0.22, by - s * 0.4, s * 0.22, s * 0.1, -0.6, 0, Math.PI * 2); ctx.fill();
    const hy = by - s * 0.9;
    // petals open with bloom
    const petal = s * (0.14 + open * 0.34);
    ctx.fillStyle = '#ff7fb0';
    for (let i = 0; i < 6; i++) {
      const a = i * (Math.PI * 2 / 6) - Math.PI / 2;
      const dx = Math.cos(a) * petal * 0.8, dy = Math.sin(a) * petal * 0.8;
      ctx.beginPath(); ctx.ellipse(bx + dx, hy + dy, petal * 0.55, petal * 0.34, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = open > 0.4 ? '#ffd84d' : '#7fc06a';
    ctx.beginPath(); ctx.arc(bx, hy, s * (0.14 + open * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const DRAW = { palm: drawPalm, bush: drawBush, cactus: drawCactus, mushroom: drawMushroom, floatie: drawFloatie, lilypad: drawLilypad, flower: drawFlower };

  function draw(ctx, W, H, t, sceneId) {
    const fx = (worldSceneById(sceneId) || {}).fx;
    // Ambient contact marks under the pets (sand footprints linger longer).
    Object.keys(trails).forEach(function (uid) {
      const arr = trails[uid];
      for (let i = arr.length - 1; i >= 0; i--) {
        const mk = arr[i], life = fx === 'sand' ? 2000 : 1200, age = (t - mk.born) / life;
        if (age >= 1) { arr.splice(i, 1); continue; }
        drawMark(ctx, mk.x * W, mk.y * H, depthScale(mk.y), age, fx);
      }
    });
    // Props.
    const props = propsFor(sceneId);
    for (let pi = 0; pi < props.length; pi++) {
      const prop = props[pi], fn = DRAW[prop.type];
      if (fn) fn(ctx, W, H, t, prop, stateFor(sceneId + ':' + pi), fx);
    }
  }

  return { update, draw, reset };
})();
