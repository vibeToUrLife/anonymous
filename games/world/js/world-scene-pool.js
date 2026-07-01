/*
 * world-scene-pool.js  —  Scene id: "pool"
 * A bright, kid-friendly SPLASH POOL background (pure Canvas 2D, no assets).
 *   - Top ~half: sunny light-blue sky gradient with soft drifting clouds.
 *   - Lower area: tiled poolside deck wrapping a big rectangular pool of
 *     shimmering blue water with animated caustic ripples + surface shimmer.
 *   - Claymorphism props: pool floats/ring, beach umbrella, two lounge chairs,
 *     and a striped beach ball. Soft rounded shapes and gentle shadows.
 * Pets walk on the deck + shallow water (visual ground band ~y=0.56..0.90).
 * Registers itself into window.WORLD_SCENE_DRAW.pool at load. No globals,
 * no clearRect, no canvas resizing. t is time in SECONDS.
 */
(function () {
  'use strict';

  // Rounded-rectangle path helper (claymorphism-friendly soft corners).
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A single fluffy clay cloud made of overlapping soft blobs.
  function cloud(ctx, x, y, s) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 1.3, s * 0.85, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 1.1, y + s * 0.25, s * 0.9, s * 0.62, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 1.15, y + s * 0.22, s, s * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    // Soft warm underside for a puffy clay look.
    ctx.fillStyle = 'rgba(214,229,245,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.42, s * 1.7, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A colorful clay lounge chair (reclined back + seat + legs).
  function lounger(ctx, x, y, s, top, bottom) {
    ctx.save();
    ctx.translate(x, y);
    // Soft ground shadow.
    ctx.fillStyle = 'rgba(60,80,110,0.18)';
    ctx.beginPath();
    ctx.ellipse(s * 1.2, s * 1.15, s * 2.2, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Frame legs.
    ctx.strokeStyle = bottom;
    ctx.lineWidth = s * 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.4); ctx.lineTo(-s * 0.4, s * 1.1);
    ctx.moveTo(s * 2.4, s * 0.4); ctx.lineTo(s * 2.8, s * 1.1);
    ctx.stroke();
    // Reclined back cushion.
    ctx.fillStyle = top;
    ctx.save();
    ctx.translate(0, s * 0.4);
    ctx.rotate(-0.5);
    roundRect(ctx, -s * 0.1, -s * 1.6, s * 1.5, s * 0.55, s * 0.25);
    ctx.fill();
    ctx.restore();
    // Flat seat cushion.
    roundRect(ctx, 0, s * 0.2, s * 2.4, s * 0.55, s * 0.25);
    ctx.fill();
    ctx.restore();
  }

  window.WORLD_SCENE_DRAW = window.WORLD_SCENE_DRAW || {};
  window.WORLD_SCENE_DRAW.pool = function (ctx, W, H, t) {
    // ── Sky gradient (top ~half) ──────────────────────────────────────────
    var sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, '#8fd4ff');
    sky.addColorStop(0.6, '#bfe8ff');
    sky.addColorStop(1, '#e6f6ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Warm sun glow, upper-right.
    var sunX = W * 0.82, sunY = H * 0.14, sunR = H * 0.16;
    var glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.4);
    glow.addColorStop(0, 'rgba(255,246,205,0.95)');
    glow.addColorStop(1, 'rgba(255,246,205,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H * 0.55);
    ctx.fillStyle = '#fff4c2';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Slowly drifting clouds (wrap around the screen width).
    var cs = H * 0.05;
    var drift = (t * 6) % (W + 260);
    cloud(ctx, (drift - 130), H * 0.12, cs * 1.1);
    cloud(ctx, ((drift + W * 0.5) % (W + 260) - 130), H * 0.2, cs * 0.85);
    cloud(ctx, ((drift + W * 0.78) % (W + 260) - 130), H * 0.08, cs);

    // ── Poolside deck (from y≈0.5 down): tiled band ───────────────────────
    var deckTop = H * 0.5;
    var deck = ctx.createLinearGradient(0, deckTop, 0, H);
    deck.addColorStop(0, '#ffe6c2');
    deck.addColorStop(1, '#f6cfa0');
    ctx.fillStyle = deck;
    ctx.fillRect(0, deckTop, W, H - deckTop);

    // Diagonal tile seams for a soft tiled-deck feel.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, deckTop, W, H - deckTop);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    var tile = H * 0.11;
    for (var gx = -H; gx < W + H; gx += tile) {
      ctx.beginPath();
      ctx.moveTo(gx, deckTop);
      ctx.lineTo(gx + (H - deckTop), H);
      ctx.stroke();
    }
    ctx.restore();

    // ── The pool: big rounded rectangle of blue water ─────────────────────
    var px = W * 0.14, py = H * 0.58, pw = W * 0.72, ph = H * 0.3;
    // Pool coping (light rim) for a raised clay edge.
    ctx.fillStyle = '#eaf6ff';
    roundRect(ctx, px - W * 0.02, py - H * 0.02, pw + W * 0.04, ph + H * 0.04, H * 0.06);
    ctx.fill();

    // Water body gradient.
    var water = ctx.createLinearGradient(0, py, 0, py + ph);
    water.addColorStop(0, '#38b6e6');
    water.addColorStop(1, '#1c7fc4');
    ctx.save();
    roundRect(ctx, px, py, pw, ph, H * 0.05);
    ctx.fillStyle = water;
    ctx.fill();
    ctx.clip(); // Clip caustics + shimmer to the pool.

    // Animated caustic light ripples (layered sine-scaled ellipses).
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 26; i++) {
      var rx = px + ((i * 97.3) % pw);
      var ry = py + ((i * 53.7) % ph);
      var puls = 0.5 + 0.5 * Math.sin(t * 1.5 + i * 1.3);
      ctx.fillStyle = 'rgba(180,240,255,' + (0.05 + 0.09 * puls) + ')';
      ctx.beginPath();
      ctx.ellipse(rx, ry, 14 + 10 * puls, 6 + 4 * puls, i * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Gentle horizontal surface shimmer lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (var s2 = 0; s2 < 5; s2++) {
      var yy = py + ph * (0.18 + s2 * 0.17);
      ctx.beginPath();
      for (var xx = px; xx <= px + pw; xx += 12) {
        var wob = Math.sin(xx * 0.05 + t * 1.8 + s2) * 3;
        if (xx === px) ctx.moveTo(xx, yy + wob);
        else ctx.lineTo(xx, yy + wob);
      }
      ctx.stroke();
    }
    ctx.restore();

    // ── Floating props on the water ───────────────────────────────────────
    var bobA = Math.sin(t * 1.2) * 4, bobB = Math.sin(t * 1.2 + 1.7) * 4;
    // Pink swim ring (donut).
    var ringX = px + pw * 0.26, ringY = py + ph * 0.4 + bobA;
    ctx.fillStyle = '#ff9ec2';
    ctx.beginPath(); ctx.arc(ringX, ringY, H * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.arc(ringX, ringY, H * 0.024, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ringX - H * 0.02, ringY - H * 0.02, H * 0.012, 0, Math.PI * 2); ctx.fill();
    // Yellow round float.
    var fX = px + pw * 0.68, fY = py + ph * 0.55 + bobB;
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath(); ctx.arc(fX, fY, H * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(fX - H * 0.015, fY - H * 0.015, H * 0.014, 0, Math.PI * 2); ctx.fill();

    // ── Deck props: umbrella, loungers, beach ball ────────────────────────
    // Two clay lounge chairs on the near deck.
    lounger(ctx, W * 0.06, H * 0.72, H * 0.05, '#ff8a5c', '#c96a44');
    lounger(ctx, W * 0.72, H * 0.7, H * 0.05, '#6ec6ff', '#3f8fd0');

    // Beach umbrella, upper-right deck.
    var uX = W * 0.9, uY = H * 0.6;
    ctx.save();
    ctx.strokeStyle = '#cbb892';
    ctx.lineWidth = H * 0.012;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(uX, uY); ctx.lineTo(uX, uY + H * 0.22); ctx.stroke();
    var canopy = H * 0.12;
    var cols = ['#ff5d6c', '#fff'];
    for (var k = 0; k < 6; k++) {
      ctx.fillStyle = cols[k % 2];
      ctx.beginPath();
      ctx.moveTo(uX, uY - canopy * 0.35);
      ctx.arc(uX, uY - canopy * 0.35, canopy, Math.PI + k * (Math.PI / 6),
        Math.PI + (k + 1) * (Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Striped beach ball resting on the deck with a soft shadow.
    var bX = W * 0.34, bY = H * 0.86, bR = H * 0.045;
    ctx.fillStyle = 'rgba(60,80,110,0.2)';
    ctx.beginPath(); ctx.ellipse(bX, bY + bR * 0.9, bR * 1.1, bR * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    var ball = ['#ff5d6c', '#ffd84d', '#5ccf8f', '#6ec6ff'];
    for (var b = 0; b < 4; b++) {
      ctx.fillStyle = ball[b];
      ctx.beginPath();
      ctx.moveTo(bX, bY);
      ctx.arc(bX, bY, bR, b * (Math.PI / 2) - 0.3, (b + 1) * (Math.PI / 2) - 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(bX, bY, bR * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(bX - bR * 0.3, bY - bR * 0.35, bR * 0.28, 0, Math.PI * 2); ctx.fill();
  };
})();
