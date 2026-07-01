/* ════════════════════════════════════════════════════════════════
   world-scene-grassland.js — background painter for the "grassland"
   World scene. A lush green meadow: a bright blue sky with fluffy
   clouds and a warm sun up top, rolling hills below, a grassy field
   full of swaying tufts, scattered flowers, a couple of soft bushes
   and lazy drifting butterflies. Bright, cozy, claymorphism.

   Contract: pure Canvas 2D, no assets, no imports. Registers itself
   as window.WORLD_SCENE_DRAW.grassland = (ctx, W, H, t) => {...}.
   t is time in seconds. Ground/grass band lives at y≈0.52..0.93.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Small deterministic pseudo-random so props stay put every frame.
  function rnd(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // Rounded-rect helper for soft claymorphism shapes.
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // One fluffy cloud built from overlapping soft blobs.
  function cloud(ctx, cx, cy, s) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(cx,            cy,            s * 0.62, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.9,  cy + s * 0.16, s * 0.5,  0, Math.PI * 2);
    ctx.arc(cx + s * 0.9,  cy + s * 0.18, s * 0.52, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.35, cy - s * 0.28, s * 0.5,  0, Math.PI * 2);
    ctx.arc(cx + s * 0.4,  cy - s * 0.22, s * 0.46, 0, Math.PI * 2);
    ctx.fill();
    // flat soft base so the cloud sits like a pillow
    roundRect(ctx, cx - s * 1.35, cy + s * 0.1, s * 2.7, s * 0.55, s * 0.3);
    ctx.fill();
    ctx.restore();
  }

  // A single bushy tree: brown clay trunk + rounded leaf cluster.
  function tree(ctx, x, groundY, s, sway) {
    ctx.save();
    // soft ground shadow
    ctx.fillStyle = 'rgba(40,80,40,0.16)';
    ctx.beginPath();
    ctx.ellipse(x, groundY + s * 0.05, s * 0.9, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // trunk
    ctx.fillStyle = '#a9713f';
    roundRect(ctx, x - s * 0.14, groundY - s * 0.9, s * 0.28, s * 0.95, s * 0.12);
    ctx.fill();
    // canopy — three overlapping green blobs, gently swaying at the top
    var wob = Math.sin(sway) * s * 0.05;
    ctx.fillStyle = '#5fbf55';
    ctx.beginPath();
    ctx.arc(x + wob,           groundY - s * 1.35, s * 0.7,  0, Math.PI * 2);
    ctx.arc(x - s * 0.55 + wob, groundY - s * 1.05, s * 0.55, 0, Math.PI * 2);
    ctx.arc(x + s * 0.55 + wob, groundY - s * 1.05, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // brighter highlight on the sunny (upper-left) side of the canopy
    ctx.fillStyle = 'rgba(180,240,150,0.6)';
    ctx.beginPath();
    ctx.arc(x - s * 0.2 + wob, groundY - s * 1.5, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A rounded flower on a thin stem; petals nod with the breeze.
  function flower(ctx, x, y, s, color, phase) {
    ctx.save();
    var nod = Math.sin(phase) * 0.12;
    ctx.translate(x, y);
    ctx.rotate(nod);
    // stem
    ctx.strokeStyle = '#3f9e46';
    ctx.lineWidth = s * 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -s * 1.6);
    ctx.stroke();
    // petals
    ctx.translate(0, -s * 1.6);
    ctx.fillStyle = color;
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, s * 0.42, s * 0.28, a, 0, Math.PI * 2);
      ctx.fill();
    }
    // center
    ctx.fillStyle = '#ffd25a';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  window.WORLD_SCENE_DRAW = window.WORLD_SCENE_DRAW || {};
  window.WORLD_SCENE_DRAW.grassland = function (ctx, W, H, t) {
    ctx.save();

    // ── Sky: bright blue vertical gradient over the top half ──
    var sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#6ec6ff');
    sky.addColorStop(1, '#c6ecff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.62);

    // ── Warm sun with a soft glow, upper-right ──
    var sunX = W * 0.82, sunY = H * 0.16, sunR = Math.min(W, H) * 0.075;
    var glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 3);
    glow.addColorStop(0, 'rgba(255,238,170,0.9)');
    glow.addColorStop(1, 'rgba(255,238,170,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // ── Drifting clouds (wrap around slowly) ──
    for (var c = 0; c < 4; c++) {
      var cs = Math.min(W, H) * (0.05 + rnd(c + 1) * 0.04);
      var speed = 0.006 + rnd(c + 9) * 0.006;
      var cx = ((rnd(c + 3) + t * speed) % 1.25 - 0.15) * W;
      var cy = H * (0.09 + rnd(c + 5) * 0.22);
      cloud(ctx, cx, cy, cs);
    }

    // ── Rolling hills behind the field (two soft layers) ──
    var hb = H * 0.56; // where hills begin
    ctx.fillStyle = '#8ed86f';
    ctx.beginPath();
    ctx.moveTo(0, hb);
    for (var hx = 0; hx <= W; hx += W / 24) {
      ctx.lineTo(hx, hb - Math.sin(hx / W * Math.PI * 2 + 0.5) * H * 0.03 - H * 0.02);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();

    // ── Main grass band: y≈0.52..0.93, green gradient ──
    var grass = ctx.createLinearGradient(0, H * 0.52, 0, H);
    grass.addColorStop(0, '#79cf5f');
    grass.addColorStop(1, '#4ea63f');
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.6);
    for (var gx = 0; gx <= W; gx += W / 20) {
      ctx.lineTo(gx, H * 0.6 - Math.sin(gx / W * Math.PI * 3) * H * 0.015);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();

    // ── Trees / bushes at the back edge of the field ──
    var baseH = Math.min(W, H);
    tree(ctx, W * 0.13, H * 0.64, baseH * 0.11, t * 0.9);
    tree(ctx, W * 0.9,  H * 0.66, baseH * 0.13, t * 0.9 + 1.3);
    // a rounded bush (canopy only) for variety
    ctx.save();
    ctx.fillStyle = '#57b84a';
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.63, baseH * 0.05, 0, Math.PI * 2);
    ctx.arc(W * 0.66, H * 0.645, baseH * 0.04, 0, Math.PI * 2);
    ctx.arc(W * 0.74, H * 0.645, baseH * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Scattered flowers across the meadow ──
    var flowerCols = ['#ff8fb8', '#ffe27a', '#ffffff', '#ff8fb8', '#ffffff'];
    for (var f = 0; f < 14; f++) {
      var fx = rnd(f + 20) * W;
      var fy = H * (0.66 + rnd(f + 40) * 0.24);
      var fs = baseH * (0.016 + rnd(f + 60) * 0.012);
      flower(ctx, fx, fy, fs, flowerCols[f % flowerCols.length], t * 1.4 + f);
    }

    // ── Many little grass tufts that sway gently ──
    ctx.lineCap = 'round';
    for (var s = 0; s < 90; s++) {
      var tx = rnd(s + 100) * W;
      var ty = H * (0.62 + rnd(s + 200) * 0.31);
      var th = baseH * (0.02 + rnd(s + 300) * 0.03);
      // blades further down are larger & greener (closer to camera)
      var depth = (ty / H - 0.62) / 0.31;
      ctx.strokeStyle = depth > 0.5 ? '#3f9e46' : '#66c455';
      ctx.lineWidth = th * 0.16;
      var swayAmt = Math.sin(t * 1.6 + tx * 0.03) * th * 0.28;
      for (var b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(tx + b * th * 0.18, ty);
        ctx.quadraticCurveTo(
          tx + b * th * 0.18 + swayAmt * 0.5, ty - th * 0.6,
          tx + b * th * 0.18 + swayAmt,       ty - th
        );
        ctx.stroke();
      }
    }

    // ── A couple of butterflies drifting lazily around ──
    for (var bf = 0; bf < 2; bf++) {
      var bt = t * 0.5 + bf * 3.1;
      var bx = W * (0.25 + bf * 0.4) + Math.sin(bt) * W * 0.16;
      var by = H * (0.5 + bf * 0.08) + Math.cos(bt * 1.3) * H * 0.06;
      var flap = Math.abs(Math.sin(t * 9 + bf)) * 0.9 + 0.2; // wing beat
      ctx.save();
      ctx.translate(bx, by);
      ctx.fillStyle = bf === 0 ? '#ff9ad1' : '#ffd76a';
      // two wing pairs squished by the flap factor
      ctx.beginPath();
      ctx.ellipse(-baseH * 0.014 * flap, -baseH * 0.008, baseH * 0.014 * flap, baseH * 0.012, 0, 0, Math.PI * 2);
      ctx.ellipse( baseH * 0.014 * flap, -baseH * 0.008, baseH * 0.014 * flap, baseH * 0.012, 0, 0, Math.PI * 2);
      ctx.ellipse(-baseH * 0.012 * flap,  baseH * 0.006, baseH * 0.011 * flap, baseH * 0.009, 0, 0, Math.PI * 2);
      ctx.ellipse( baseH * 0.012 * flap,  baseH * 0.006, baseH * 0.011 * flap, baseH * 0.009, 0, 0, Math.PI * 2);
      ctx.fill();
      // slim body
      ctx.fillStyle = '#5a4636';
      roundRect(ctx, -baseH * 0.0025, -baseH * 0.012, baseH * 0.005, baseH * 0.024, baseH * 0.0025);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  };
})();
