/* ===========================================================================
 * world-scene-egypt.js  —  Background scene: "Desert of Egypt"
 * ---------------------------------------------------------------------------
 * A warm, cozy, kid-friendly desert. Top half is a golden/peach sky with a big
 * soft sun and a gentle heat-haze shimmer. The lower area is layered warm sand
 * dunes where pets walk (ground band ~y=0.58..0.92). Distant pyramids, a Sphinx
 * silhouette, swaying palm trees, an obelisk, cacti/rocks and tiny sand sparkles.
 * Pure Canvas 2D, claymorphism (soft rounded shapes, soft shadows). No assets.
 * =========================================================================== */
(function () {
  'use strict';

  // ── Small helpers (kept private inside the IIFE) ──────────────────────────
  function lerp(a, b, u) { return a + (b - a) * u; }

  // Rounded-rectangle path (claymorphism building block).
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

  // A soft filled blob shadow used to give props a grounded, clay-like feel.
  function softShadow(ctx, cx, cy, rw, rh, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Prop: a single pyramid (two clay-shaded faces + soft cap highlight) ───
  function drawPyramid(ctx, baseX, baseY, halfW, height, lightHex, darkHex) {
    const apexX = baseX, apexY = baseY - height;
    // Lit left face.
    ctx.fillStyle = lightHex;
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(baseX - halfW, baseY);
    ctx.lineTo(baseX, baseY);
    ctx.closePath();
    ctx.fill();
    // Shaded right face.
    ctx.fillStyle = darkHex;
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(baseX + halfW, baseY);
    ctx.lineTo(baseX, baseY);
    ctx.closePath();
    ctx.fill();
    // Soft capstone highlight for a rounded clay look.
    ctx.fillStyle = 'rgba(255,246,214,0.55)';
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(apexX - halfW * 0.22, apexY + height * 0.22);
    ctx.lineTo(apexX + halfW * 0.22, apexY + height * 0.22);
    ctx.closePath();
    ctx.fill();
  }

  // ── Prop: a palm tree that sways gently with time ─────────────────────────
  function drawPalm(ctx, x, groundY, scale, sway) {
    ctx.save();
    ctx.translate(x, groundY);
    // Trunk (slightly curved, rounded segments).
    const th = 150 * scale;
    ctx.strokeStyle = '#a9743f';
    ctx.lineWidth = 14 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(10 * scale + sway * 6, -th * 0.55, sway * 14, -th);
    ctx.stroke();
    // Trunk shading rings.
    ctx.strokeStyle = 'rgba(120,74,34,0.5)';
    ctx.lineWidth = 4 * scale;
    for (let i = 1; i <= 4; i++) {
      const yy = -th * (i / 5);
      ctx.beginPath();
      ctx.moveTo(sway * 14 * (i / 5) - 6 * scale, yy);
      ctx.lineTo(sway * 14 * (i / 5) + 6 * scale, yy);
      ctx.stroke();
    }
    // Crown of fronds.
    const cx = sway * 14, cy = -th;
    for (let i = 0; i < 7; i++) {
      const ang = (-Math.PI * 0.5) + (i - 3) * 0.42 + sway * 0.05;
      const len = 70 * scale;
      const ex = cx + Math.cos(ang) * len;
      const ey = cy + Math.sin(ang) * len * 0.9;
      const mx = cx + Math.cos(ang) * len * 0.5;
      const my = cy + Math.sin(ang) * len * 0.5 - 16 * scale;
      ctx.strokeStyle = i % 2 ? '#3f9b58' : '#4bb268';
      ctx.lineWidth = 9 * scale;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
    // Coconuts.
    ctx.fillStyle = '#7a4a22';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * 9 * scale, cy + 6 * scale, 6 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Prop: a rounded cactus ────────────────────────────────────────────────
  function drawCactus(ctx, x, groundY, scale) {
    ctx.save();
    ctx.translate(x, groundY);
    ctx.fillStyle = '#4f9d5e';
    roundRect(ctx, -9 * scale, -60 * scale, 18 * scale, 62 * scale, 9 * scale); ctx.fill();   // body
    roundRect(ctx, -30 * scale, -44 * scale, 15 * scale, 30 * scale, 7 * scale); ctx.fill();   // left arm
    roundRect(ctx, 15 * scale, -52 * scale, 15 * scale, 34 * scale, 7 * scale); ctx.fill();     // right arm
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -6 * scale, -56 * scale, 5 * scale, 50 * scale, 3 * scale); ctx.fill();      // highlight
    ctx.restore();
  }

  // ── The scene ─────────────────────────────────────────────────────────────
  function drawEgypt(ctx, W, H, t) {
    ctx.save();

    // 1) SKY — warm golden/peach vertical gradient across the top ~60%.
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0.0, '#ffe1a8');
    sky.addColorStop(0.5, '#ffcf94');
    sky.addColorStop(1.0, '#ffb98a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 2) SUN — big soft glowing disc, high and slightly right of centre.
    const sunX = W * 0.68, sunY = H * 0.24, sunR = Math.min(W, H) * 0.12;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.6);
    glow.addColorStop(0, 'rgba(255,246,214,0.95)');
    glow.addColorStop(0.4, 'rgba(255,224,160,0.45)');
    glow.addColorStop(1, 'rgba(255,224,160,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4d0';
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();

    // 3) HEAT HAZE — faint drifting horizontal bands near the horizon.
    for (let i = 0; i < 4; i++) {
      const hy = H * (0.40 + i * 0.045) + Math.sin(t * 0.8 + i) * 3;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.05 - i * 0.008) + ')';
      ctx.fillRect(0, hy, W, H * 0.02);
    }

    // 4) DISTANT PYRAMIDS — sitting on the horizon line (~y=0.58).
    const horizon = H * 0.58;
    drawPyramid(ctx, W * 0.20, horizon, W * 0.13, H * 0.20, '#e9b26f', '#cf9350');
    drawPyramid(ctx, W * 0.36, horizon, W * 0.10, H * 0.15, '#e6ac66', '#c98c49');
    drawPyramid(ctx, W * 0.86, horizon, W * 0.11, H * 0.16, '#e9b26f', '#cf9350');

    // 5) SPHINX — simple warm silhouette resting on the sand near the pyramids.
    ctx.fillStyle = 'rgba(196,140,80,0.85)';
    ctx.beginPath();
    ctx.moveTo(W * 0.50, horizon);
    ctx.lineTo(W * 0.50, horizon - H * 0.05);          // body back
    ctx.quadraticCurveTo(W * 0.56, horizon - H * 0.07, W * 0.585, horizon - H * 0.11); // head/neck
    ctx.lineTo(W * 0.605, horizon - H * 0.11);
    ctx.lineTo(W * 0.61, horizon - H * 0.06);          // face front
    ctx.lineTo(W * 0.66, horizon);                     // outstretched paws
    ctx.closePath();
    ctx.fill();

    // 6) OBELISK — tall thin monument to the left with a bright cap.
    const obX = W * 0.075, obTop = horizon - H * 0.20, obW = W * 0.020;
    ctx.fillStyle = '#dba05a';
    ctx.beginPath();
    ctx.moveTo(obX - obW, horizon);
    ctx.lineTo(obX - obW * 0.7, obTop);
    ctx.lineTo(obX + obW * 0.7, obTop);
    ctx.lineTo(obX + obW, horizon);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff0c8';
    ctx.beginPath();
    ctx.moveTo(obX, obTop - H * 0.02);
    ctx.lineTo(obX - obW * 0.7, obTop);
    ctx.lineTo(obX + obW * 0.7, obTop);
    ctx.closePath(); ctx.fill();

    // 7) SAND DUNES — layered warm bands filling the walkable ground.
    const dunes = [
      { y: 0.58, c: '#f0c98a' },
      { y: 0.66, c: '#eebe78' },
      { y: 0.76, c: '#e7b268' },
      { y: 0.86, c: '#dea75a' }
    ];
    dunes.forEach(function (d, idx) {
      const baseY = H * d.y;
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      // Gently rolling top edge (static per layer for a calm horizon).
      for (let x = 0; x <= W; x += W / 8) {
        const wob = Math.sin(x * 0.006 + idx * 1.7) * H * 0.02;
        ctx.lineTo(x, baseY + wob);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H);
      ctx.closePath(); ctx.fill();
    });

    // 8) PROPS on the sand — soft shadows first, then the objects.
    const gy = H * 0.80;
    softShadow(ctx, W * 0.24, gy + 6, 70, 12, 'rgba(150,95,40,0.20)');
    softShadow(ctx, W * 0.80, gy + 10, 62, 11, 'rgba(150,95,40,0.20)');
    softShadow(ctx, W * 0.60, H * 0.90, 40, 8, 'rgba(150,95,40,0.18)');

    // Two swaying palms (sway derived from time for gentle motion).
    drawPalm(ctx, W * 0.24, gy, 1.0, Math.sin(t * 0.9));
    drawPalm(ctx, W * 0.80, H * 0.84, 0.85, Math.sin(t * 0.9 + 1.3));

    // Cacti + a couple of scattered rocks.
    drawCactus(ctx, W * 0.60, H * 0.90, 0.9);
    drawCactus(ctx, W * 0.44, H * 0.94, 0.6);
    ctx.fillStyle = '#c69257';
    softShadow(ctx, W * 0.14, H * 0.93, 34, 14, '#c69257');
    softShadow(ctx, W * 0.90, H * 0.90, 26, 11, '#c69257');
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    softShadow(ctx, W * 0.13, H * 0.925, 16, 6, 'rgba(255,255,255,0.15)');

    // 9) SAND SPARKLES — tiny twinkles that shimmer in and out over time.
    for (let i = 0; i < 26; i++) {
      const sx = (i * 97.3 % 100) / 100 * W;
      const sy = H * (0.62 + ((i * 53.7 % 100) / 100) * 0.30);
      const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.7);
      ctx.fillStyle = 'rgba(255,252,230,' + (0.15 + tw * 0.35) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4 + tw * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Register the scene (the only global assignment) ───────────────────────
  window.WORLD_SCENE_DRAW = window.WORLD_SCENE_DRAW || {};
  window.WORLD_SCENE_DRAW.egypt = function (ctx, W, H, t) { drawEgypt(ctx, W, H, t); };
})();
