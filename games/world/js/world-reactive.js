/* ════════════════════════════════════════════════════════════════
   world-reactive.js — the world reacts to pets as they MOVE (no buttons).
   Two layers, both driven purely by the already-synced pet positions, so every
   client renders the same reactions with zero networking:
     1. Ambient contact marks under every moving pet — ripples in the pool,
        dust/prints in the desert, parted grass + petals in the meadow (flavoured
        by the scene's fx).
     2. One signature prop per scene (beach ball / palm / bush, from
        WORLD_REACTIVE.props) that bumps in the push direction and springs back
        when a pet walks into it, with a scene-flavoured burst.
   Called each frame by world-core between the scene background and the actors.
   ════════════════════════════════════════════════════════════════ */
const WorldReactive = (function () {
  const trails = {};      // uid → [{ x, y, born }] recent contact marks
  const propState = {};   // sceneId → { react, pushX, pushY, inside, burstAt }

  function cfg() { return (typeof WORLD_REACTIVE !== 'undefined') ? WORLD_REACTIVE : { contact: 0.07, props: {} }; }
  function propFor(s) { return cfg().props[s] || null; }
  function stateFor(s) { return propState[s] || (propState[s] = { react: 0, pushX: 0, pushY: 1, inside: false, burstAt: -1e9 }); }

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
    const prop = propFor(sceneId);
    if (!prop) return;
    const st = stateFor(sceneId);
    let inside = false, hit = null;
    for (let i = 0; i < actors.length; i++) {
      if (worldDist(actors[i], prop) <= cfg().contact) { inside = true; hit = actors[i]; break; }
    }
    if (inside && !st.inside && hit) {         // fresh contact → bump away from the pet, then settle
      st.react = 1; st.burstAt = t;
      const dx = prop.x - hit.x, dy = prop.y - hit.y, m = Math.hypot(dx, dy) || 1;
      st.pushX = dx / m; st.pushY = dy / m;
    }
    st.inside = inside;
    st.react = Math.max(0, st.react - dtSec * 2.4); // spring back over ~0.4s
  }

  // ── Draw ──
  function drawMark(ctx, px, py, ds, age, fx) {
    ctx.save();
    if (fx === 'water') {
      ctx.globalAlpha = (1 - age) * 0.5; ctx.strokeStyle = '#cdefff'; ctx.lineWidth = ds * 2.2;
      ctx.beginPath(); ctx.ellipse(px, py, ds * (5 + age * 26), ds * (2 + age * 11), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (fx === 'sand') {
      ctx.globalAlpha = (1 - age) * 0.4; ctx.fillStyle = '#d8b878';
      ctx.beginPath(); ctx.ellipse(px, py, ds * (5 + age * 7), ds * (2.5 + age * 3), 0, 0, Math.PI * 2); ctx.fill();
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

  function drawBall(ctx, W, H, t, prop, st, fx) {
    const ds = depthScale(prop.y), r = ds * 15;
    const px = (prop.x + st.pushX * st.react * 0.03) * W;
    const py = prop.y * H - st.react * ds * 16; // pops up on bump, settles
    shadow(ctx, prop.x * W, prop.y * H + ds * 2, r * 0.9, r * 0.32);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(st.pushX * st.react * 0.6);
    const cols = ['#ff6b6b', '#ffd93b', '#4dd0e1', '#ffffff'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawBurst(ctx, prop.x * W, prop.y * H, ds, t, st, fx);
  }

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

  function draw(ctx, W, H, t, sceneId) {
    const fx = (worldSceneById(sceneId) || {}).fx;
    // Ambient contact marks under the pets.
    Object.keys(trails).forEach(function (uid) {
      const arr = trails[uid];
      for (let i = arr.length - 1; i >= 0; i--) {
        const mk = arr[i], age = (t - mk.born) / 1200;
        if (age >= 1) { arr.splice(i, 1); continue; }
        drawMark(ctx, mk.x * W, mk.y * H, depthScale(mk.y), age, fx);
      }
    });
    // Signature prop.
    const prop = propFor(sceneId);
    if (!prop) return;
    const st = stateFor(sceneId);
    if (prop.type === 'ball') drawBall(ctx, W, H, t, prop, st, fx);
    else if (prop.type === 'palm') drawPalm(ctx, W, H, t, prop, st, fx);
    else if (prop.type === 'bush') drawBush(ctx, W, H, t, prop, st, fx);
  }

  return { update, draw, reset };
})();
