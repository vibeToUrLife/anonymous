    function flushLayerData() {
      if (!roomData.layerData) roomData.layerData = {};
      roomData.layerData[currentLayer] = {
        wallPattern:   roomData.wallPattern,
        windowStyle:   roomData.windowStyle,
        placedDecors:  roomData.placedDecors,
        plantPosition: roomData.plantPosition || null,
        plant:         roomData.plant || null,
        floorStyle:    roomData.floorStyle || 'floor_wood'
      };
    }

    /**
     * Switches the active view layer, loading the new layer's decor/wall data,
     * and re-renders the room. Optionally saves after switching.
     */
    function enterLayer(n, doSave) {
      if (n < 1 || n > 3) return;
      const total = roomData.unlockedLayers || 1;
      if (n > total) {
        showToast('Floor ' + n + ' is locked! Unlock it from ⬆ Feed > 🏠 Floors.', 'error');
        return;
      }
      // Persist current layer before switching
      flushLayerData();
      currentLayer = n;
      // Load the new layer's data into the active roomData slots
      const ld = (roomData.layerData || {})[n] || {};
      roomData.wallPattern   = ld.wallPattern  || getLayerDefaultWall(n);
      roomData.windowStyle   = ld.windowStyle  || getLayerDefaultWindow(n);
      roomData.placedDecors  = Array.isArray(ld.placedDecors) ? ld.placedDecors : [];
      roomData.plantPosition = ld.plantPosition || null;
      roomData.plant         = ld.plant != null ? ld.plant : null;
      roomData.floorStyle    = ld.floorStyle || 'floor_wood';
      // Hide outside/farm views and stop their animation loops
      isOutsideView = false;
      document.getElementById('outsideView')?.classList.remove('visible');
      cancelAnimationFrame(_outsideAnimFrame);
      _outsideAnimFrame = null;
      closeFarm();
      // Force full bg redraw (wall pattern may have changed)
      const bgc = document.getElementById('roomBgCanvas');
      if (bgc) bgc.dataset.init = '';
      _lastPetKey   = '';
      _lastPlantKey = '';
      renderAll();
      // Pets on this floor accrue/place their daily drops when you arrive here
      // (load only generates for floor 1; this covers floors 2-3).
      maybeGenerateDailyDrops();
      if (doSave) saveRoom();
    }

    /** Shows the outside view overlay and renders the building on canvas. */
    function goOutside() {
      flushLayerData();
      isOutsideView = true;
      document.getElementById('outsideView')?.classList.add('visible');
      drawOutsideCanvas();
      updateLayerBadge();
    }

    /** Updates the layer badge text inside the room. */
    function updateLayerBadge() {
      const badge = document.getElementById('layerBadge');
      if (!badge) return;
      const total = roomData.unlockedLayers || 1;
      if (isOutsideView) {
        badge.textContent = '🌳 Outside';
      } else if (total > 1) {
        badge.textContent = '🏠 Floor ' + currentLayer + ' / ' + total;
      } else {
        badge.textContent = '🏠 My Room';
      }
    }

    // Stores floor hit-rects for canvas click handling: { floorNum: {x,y,w,h,unlocked} }
    let _outsideFloorRects = {};
    let _farmGateRect = null;     // clickable barn area in the outside scene (own room only)
    let _farmGateHover = false;
    // Pre-computed stable star positions (avoids flickering on re-render)
    let _outsideStars = null;

    /**
     * Draws the full building exterior scene on the #outsideCanvas canvas element.
     * Called whenever the outside view is opened or needs refreshing.
     */
    // ===============================================
    //  Outside View - Hay Day-inspired animated scene
    // ===============================================
    let _outsideAnimFrame = null;
    let _outsideLeaves = null;
    let _outsideClouds = null;
    let _outsideFlowers = null;
    let _outsideGrassTufts = null;
    // Currently hovered floor index (null if none)
    let _outsideHoveredFloor = null;

    // Leaf & flower config (not hardcoded inline - defined once here)
    const OUTSIDE_LEAF_COUNT = 14;
    const LEAF_COLORS_DAY   = ['#5aaa38', '#78c050', '#a0d060', '#d4a020', '#e0b830'];
    const LEAF_COLORS_NIGHT = ['#1a5a10', '#2a6a20', '#3a7a30', '#6a5010', '#8a6a18'];
    const FLOWER_COLORS     = ['#ff6b8a', '#ffb347', '#fff44f', '#87ceeb', '#dda0dd', '#ff69b4', '#ff4500'];
    const CLOUD_COUNT       = 5;
    const FLOWER_COUNT      = 22;
    const GRASS_TUFT_COUNT  = 30;

    /** Create fluffy cloud objects for drifting animation. */
    function initOutsideClouds() {
      _outsideClouds = Array.from({ length: CLOUD_COUNT }, () => ({
        x: Math.random(),
        y: 0.06 + Math.random() * 0.18,
        speed: 0.00008 + Math.random() * 0.00012,
        scale: 0.6 + Math.random() * 0.6,
        opacity: 0.6 + Math.random() * 0.3
      }));
    }

    /** Create small flower spots on the ground. */
    function initOutsideFlowers() {
      _outsideFlowers = Array.from({ length: FLOWER_COUNT }, (_, i) => ({
        x: Math.random(),
        y: 0.72 + Math.random() * 0.22,
        color: FLOWER_COLORS[i % FLOWER_COLORS.length],
        size: 2.5 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2
      }));
    }

    /** Create random grass tufts for ground detail. */
    function initOutsideGrass() {
      _outsideGrassTufts = Array.from({ length: GRASS_TUFT_COUNT }, () => ({
        x: Math.random(),
        y: 0.70 + Math.random() * 0.25,
        h: 4 + Math.random() * 6,
        blades: 3 + Math.floor(Math.random() * 3)
      }));
    }

    /** Create leaf particles with random positions and properties. */
    function initOutsideLeaves() {
      _outsideLeaves = Array.from({ length: OUTSIDE_LEAF_COUNT }, (_, i) => ({
        x: Math.random(),
        y: Math.random() * 0.60,
        vx: 0.0003 + Math.random() * 0.0005,
        vy: 0.0003 + Math.random() * 0.0007,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.03,
        size: 3 + Math.random() * 3.5,
        wobblePhase: Math.random() * Math.PI * 2,
        colorIdx: i % LEAF_COLORS_DAY.length
      }));
    }

    /**
     * Main outside view render loop.
     * Draws a Hay Day-inspired scene with rolling hills, cottage building,
     * wooden fences, flowers, bushes, and animated trees/clouds/leaves.
     */
    function drawOutsideCanvas() {
      cancelAnimationFrame(_outsideAnimFrame);
      const cvs = document.getElementById('outsideCanvas');
      if (!cvs) return;
      const par = cvs.parentElement;
      cvs.width  = par.clientWidth;
      cvs.height = par.clientHeight;
      const W = cvs.width, H = cvs.height;
      const ctx = cvs.getContext('2d');
      _outsideFloorRects = {};

      // Determine day or night based on real-world time
      const night = isNightTime();

      // -- Pre-compute stable star positions using deterministic seeding --
      if (!_outsideStars)      _outsideStars = Array.from({ length: 28 }, (_, i) => ({ x: (Math.sin(i * 7.3 + 2.1) * 0.5 + 0.5), y: (Math.sin(i * 3.7 + 0.9) * 0.5 + 0.5) * 0.35, r: 0.8 + (i % 3) * 0.4 }));
      if (!_outsideClouds)     initOutsideClouds();
      if (!_outsideFlowers)    initOutsideFlowers();
      if (!_outsideGrassTufts) initOutsideGrass();
      if (!_outsideLeaves)     initOutsideLeaves();

      // Last frame timestamp for throttling
      let lastFrame = 0;

      function frame(t) {
        // Throttle to ~24fps to save CPU
        if (t - lastFrame < 42) { _outsideAnimFrame = requestAnimationFrame(frame); return; }
        lastFrame = t;
        ctx.clearRect(0, 0, W, H);

        // Wind sway factor - smooth sine wave for tree/bush movement
        const windSway = Math.sin(t / 1400) * 0.012 + Math.sin(t / 900) * 0.006;

        // -- Sky --
        _drawHDSky(ctx, W, H, night, t);

        // -- Distant rolling hills (behind building) --
        _drawRollingHills(ctx, W, H, night);

        // -- Ground --
        _drawHDGround(ctx, W, H, night);

        // -- Grass tufts --
        _drawGrassTufts(ctx, W, H, windSway, night);

        // -- Stone stepping-path --
        _drawStonePath(ctx, W, H, night);

        // -- Flowers scattered on ground --
        _drawFlowers(ctx, W, H, t, night);

        // -- Wooden fences (left and right) --
        _drawFence(ctx, W * 0.02, H * 0.72, W * 0.20, night);
        _drawFence(ctx, W * 0.80, H * 0.72, W * 0.18, night);

        // -- Trees with wind sway (large foreground + small background) --
        _drawHDTree(ctx, W * 0.10, H * 0.68, H * 0.26, windSway, night);
        _drawHDTree(ctx, W * 0.90, H * 0.68, H * 0.22, windSway * 0.7, night);
        _drawHDTree(ctx, W * 0.22, H * 0.70, H * 0.14, windSway * 0.5, night);
        _drawHDTree(ctx, W * 0.78, H * 0.70, H * 0.12, windSway * 0.4, night);

        // -- Bushes around building --
        _drawBush(ctx, W * 0.30, H * 0.70, 18, windSway, night);
        _drawBush(ctx, W * 0.70, H * 0.70, 16, windSway * 0.8, night);
        _drawBush(ctx, W * 0.34, H * 0.73, 12, windSway * 0.6, night);
        _drawBush(ctx, W * 0.67, H * 0.73, 14, windSway * 0.5, night);

        // -- Building --
        const MAX_FLOORS = 3;
        const bW     = Math.min(W * 0.48, 240);
        const bX     = (W - bW) / 2;
        const floorH = Math.min((H * 0.40) / MAX_FLOORS, 68);
        const bH     = floorH * MAX_FLOORS;
        const bTop   = H * 0.68 - bH;
        const total  = roomData.unlockedLayers || 1;
        _drawHDBuilding(ctx, W, H, bX, bW, bTop, floorH, bH, MAX_FLOORS, total, night);

        // -- Floor hover indicator --
        _drawFloorHover(ctx, W, H);

        // -- Farm barn: gate into the farm view (own room only) --
        if (viewingUid === currentUid) _drawFarmBarn(ctx, W, H, night);
        else _farmGateRect = null;

        // -- Falling leaves --
        _drawHDLeaves(ctx, W, H, t, windSway, night);

        // -- Fluffy clouds (day only) --
        if (!night) _drawClouds(ctx, W, H, t);

        _outsideAnimFrame = requestAnimationFrame(frame);
      }

      _outsideAnimFrame = requestAnimationFrame(frame);
      _attachOutsideClickHandler();
    }

    // -- Sky with warm Hay Day palette, sun/moon follow real time --
    function _drawHDSky(ctx, W, H, night, t) {
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.70);
      if (night) {
        sky.addColorStop(0,   '#0a0e2a');
        sky.addColorStop(0.3, '#101840');
        sky.addColorStop(0.7, '#152850');
        sky.addColorStop(1,   '#1a3a40');
      } else {
        // Bright warm Hay Day sky
        sky.addColorStop(0,   '#58b8f0');
        sky.addColorStop(0.3, '#78ccf8');
        sky.addColorStop(0.6, '#a8e0f8');
        sky.addColorStop(1,   '#d8f0d0');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // --- Compute current fractional hour for sun/moon positioning ---
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;

      if (night) {
        // Twinkling stars
        _outsideStars.forEach(s => {
          const twinkle = 0.5 + 0.5 * Math.sin(t / 700 + s.x * 18 + s.y * 11);
          ctx.fillStyle = 'rgba(255,255,240,' + (twinkle * 0.8).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
        });

        // Moon arc: rises at 18:00 (left), peaks at midnight, sets at 6:00 (right)
        const nightHours = hour >= 18 ? hour - 18 : hour + 6; // 0..12
        const moonProgress = nightHours / 12; // 0 = moonrise, 0.5 = midnight, 1 = moonset
        const moonX = W * (0.10 + moonProgress * 0.80);
        const moonArc = Math.sin(moonProgress * Math.PI);
        const moonY = H * (0.45 - moonArc * 0.38);
        const moonR = Math.min(W, H) * 0.05;
        // Soft moon glow
        ctx.fillStyle = 'rgba(200,210,255,0.08)';
        ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 3, 0, Math.PI * 2); ctx.fill();
        // Crescent moon
        ctx.fillStyle = '#fff9d0';
        ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#101840';
        ctx.beginPath(); ctx.arc(moonX + moonR * 0.35, moonY - moonR * 0.1, moonR * 0.8, 0, Math.PI * 2); ctx.fill();
      } else {
        // Sun arc: rises at 6:00 (left), peaks at 12:00, sets at 18:00 (right)
        const dayHours = hour - 6; // 0..12
        const sunProgress = dayHours / 12; // 0 = sunrise, 0.5 = noon, 1 = sunset
        const sunX = W * (0.10 + sunProgress * 0.80);
        const sunArc = Math.sin(sunProgress * Math.PI);
        const sunY = H * (0.50 - sunArc * 0.42);
        const sunR = Math.min(W, H) * 0.06;
        // Warm halo glow
        const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 3);
        glow.addColorStop(0,   'rgba(255,250,200,0.5)');
        glow.addColorStop(0.5, 'rgba(255,220,140,0.15)');
        glow.addColorStop(1,   'rgba(255,200,100,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2); ctx.fill();
        // Sun body
        ctx.fillStyle = '#ffe868';
        ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
        // Sun bright center
        ctx.fillStyle = '#fff8d0';
        ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 0.55, 0, Math.PI * 2); ctx.fill();
      }
    }

    // -- Soft rolling hills behind the scene --
    function _drawRollingHills(ctx, W, H, night) {
      // Far hill
      ctx.fillStyle = night ? '#1a3a18' : '#6ab850';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.68);
      ctx.quadraticCurveTo(W * 0.25, H * 0.60, W * 0.5, H * 0.66);
      ctx.quadraticCurveTo(W * 0.75, H * 0.58, W, H * 0.65);
      ctx.lineTo(W, H * 0.70); ctx.lineTo(0, H * 0.70);
      ctx.closePath(); ctx.fill();
      // Near hill
      ctx.fillStyle = night ? '#1e4a1a' : '#5aaa40';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.70);
      ctx.quadraticCurveTo(W * 0.3, H * 0.65, W * 0.6, H * 0.69);
      ctx.quadraticCurveTo(W * 0.85, H * 0.64, W, H * 0.68);
      ctx.lineTo(W, H * 0.72); ctx.lineTo(0, H * 0.72);
      ctx.closePath(); ctx.fill();
    }

    // -- Lush ground area with gradient --
    function _drawHDGround(ctx, W, H, night) {
      const g = ctx.createLinearGradient(0, H * 0.70, 0, H);
      if (night) {
        g.addColorStop(0,   '#1e5018');
        g.addColorStop(0.4, '#164010');
        g.addColorStop(1,   '#0e2a08');
      } else {
        g.addColorStop(0,   '#5cb838');
        g.addColorStop(0.3, '#4aa030');
        g.addColorStop(0.7, '#3a8a28');
        g.addColorStop(1,   '#2e7820');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.70, W, H * 0.30);
    }

    // -- Grass tufts swaying in wind --
    function _drawGrassTufts(ctx, W, H, windSway, night) {
      if (!_outsideGrassTufts) return;
      const buildingLeft  = W * 0.28;
      const buildingRight = W * 0.72;
      const buildingBottom = H * 0.78;
      _outsideGrassTufts.forEach(g => {
        const gx = g.x * W, gy = g.y * H;
        // Skip tufts that would overlap the building footprint
        if (gx > buildingLeft && gx < buildingRight && gy < buildingBottom) return;
        ctx.strokeStyle = night ? '#2a6a20' : '#5cb838';
        ctx.lineWidth = 1.2;
        for (let b = 0; b < g.blades; b++) {
          const angle = -0.3 + b * 0.15 + windSway * 3;
          ctx.beginPath();
          ctx.moveTo(gx + b * 2, gy);
          ctx.quadraticCurveTo(
            gx + b * 2 + Math.sin(angle) * g.h * 0.5,
            gy - g.h * 0.6,
            gx + b * 2 + Math.sin(angle) * g.h,
            gy - g.h
          );
          ctx.stroke();
        }
      });
    }

    // -- Charming stone stepping-path (Hay Day style) --
    function _drawStonePath(ctx, W, H, night) {
      const cx = W / 2;
      // Irregular stepping stones leading to the door
      const stones = [
        { x: 0,  y: H * 0.70, w: 20, h: 12 },
        { x: 4,  y: H * 0.74, w: 18, h: 10 },
        { x: -3, y: H * 0.78, w: 22, h: 11 },
        { x: 2,  y: H * 0.82, w: 16, h: 10 },
        { x: -2, y: H * 0.86, w: 20, h: 12 },
        { x: 5,  y: H * 0.90, w: 18, h: 10 },
        { x: -1, y: H * 0.94, w: 22, h: 12 },
        { x: 3,  y: H * 0.98, w: 18, h: 10 },
      ];
      stones.forEach(s => {
        const sx = cx + s.x - s.w / 2;
        // Shadow under stone
        ctx.fillStyle = night ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(sx + s.w / 2, s.y + s.h / 2 + 1, s.w / 2 + 1, s.h / 2 + 1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Stone surface
        ctx.fillStyle = night ? '#6a6050' : '#c8bca0';
        ctx.beginPath();
        ctx.ellipse(sx + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Small highlight
        ctx.fillStyle = night ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.ellipse(sx + s.w / 2 - 2, s.y + s.h / 2 - 1, s.w / 3, s.h / 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // -- Flowers scattered on the ground --
    function _drawFlowers(ctx, W, H, t, night) {
      if (!_outsideFlowers) return;
      const buildingLeft  = W * 0.28;
      const buildingRight = W * 0.72;
      const buildingBottom = H * 0.78;
      _outsideFlowers.forEach(f => {
        const fx = f.x * W, fy = f.y * H;
        // Skip flowers under building area
        if (fx > buildingLeft && fx < buildingRight && fy < buildingBottom) return;
        const sway = Math.sin(t / 800 + f.phase) * 1.5;
        // Stem
        ctx.strokeStyle = night ? '#1a5010' : '#4a9030';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + sway, fy - f.size * 2, fx + sway * 0.5, fy - f.size * 3);
        ctx.stroke();
        // 5 small petals
        const petalY = fy - f.size * 3;
        const petalX = fx + sway * 0.5;
        const pr = f.size * 0.7;
        ctx.fillStyle = night ? 'rgba(150,120,160,0.5)' : f.color;
        for (let p = 0; p < 5; p++) {
          const angle = (p / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.arc(petalX + Math.cos(angle) * pr, petalY + Math.sin(angle) * pr, pr * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // Center dot
        ctx.fillStyle = night ? '#aaa060' : '#ffe040';
        ctx.beginPath();
        ctx.arc(petalX, petalY, pr * 0.35, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // -- Wooden fence posts (Hay Day style) --
    function _drawFence(ctx, startX, y, length, night) {
      const postSpacing = 18;
      const postH = 22;
      const postW = 4;
      const railH = 2;
      const posts = Math.floor(length / postSpacing);
      // Two horizontal rails
      for (let r = 0; r < 2; r++) {
        const ry = y - postH * 0.3 - r * postH * 0.35;
        ctx.fillStyle = night ? '#4a3820' : '#b08850';
        ctx.fillRect(startX, ry, length, railH);
        // Rail highlight
        ctx.fillStyle = night ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(startX, ry, length, 1);
      }
      // Vertical posts with rounded caps
      for (let i = 0; i <= posts; i++) {
        const px = startX + i * postSpacing;
        ctx.fillStyle = night ? '#3a2810' : '#a07840';
        ctx.fillRect(px - postW / 2, y - postH, postW, postH);
        ctx.fillStyle = night ? '#5a4828' : '#c8a060';
        ctx.beginPath();
        ctx.arc(px, y - postH, postW * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // -- Round bush cluster --
    function _drawBush(ctx, bx, by, size, sway, night) {
      const sx = bx + sway * size * 2;
      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.ellipse(sx + 1, by + 2, size * 0.8, size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Overlapping circles for a full bush shape
      const offsets = [
        { x: -size * 0.3,  y: 0,              r: size * 0.5  },
        { x: size * 0.3,   y: -size * 0.05,   r: size * 0.45 },
        { x: 0,            y: -size * 0.2,    r: size * 0.55 },
      ];
      offsets.forEach(o => {
        const bg = ctx.createRadialGradient(
          sx + o.x - o.r * 0.2, by + o.y - o.r * 0.3, o.r * 0.1,
          sx + o.x, by + o.y, o.r
        );
        if (night) {
          bg.addColorStop(0, '#2a7a28'); bg.addColorStop(1, '#0e3a0e');
        } else {
          bg.addColorStop(0, '#6cc050'); bg.addColorStop(1, '#3a8a28');
        }
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(sx + o.x, by + o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      });
      // Tiny highlight dots (daylight sparkle)
      if (!night) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath();
          ctx.arc(sx - size * 0.2 + i * size * 0.2, by - size * 0.15, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // -- Fluffy drifting clouds --
    function _drawClouds(ctx, W, H, t) {
      if (!_outsideClouds) return;
      _outsideClouds.forEach(c => {
        // Drift right and wrap around
        c.x += c.speed;
        if (c.x > 1.15) c.x = -0.15;
        const cx = c.x * W, cy = c.y * H;
        const s = c.scale * 25;
        ctx.globalAlpha = c.opacity;
        ctx.fillStyle = '#fff';
        // Overlapping puffs for a fluffy shape
        const puffs = [
          { x: 0,         y: 0,          r: s * 0.7  },
          { x: -s * 0.6,  y: s * 0.1,    r: s * 0.5  },
          { x: s * 0.6,   y: s * 0.05,   r: s * 0.55 },
          { x: -s * 0.2,  y: -s * 0.25,  r: s * 0.5  },
          { x: s * 0.25,  y: -s * 0.2,   r: s * 0.45 },
        ];
        puffs.forEach(p => {
          ctx.beginPath();
          ctx.arc(cx + p.x, cy + p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      });
    }

    // -- Realistic tree with rounded canopy and wind sway --
    function _drawHDTree(ctx, tx, ty, treeH, sway, night) {
      const trunkW = treeH * 0.055;
      const trunkH = treeH * 0.35;
      ctx.save();
      // Trunk (tapered, swaying at top)
      ctx.fillStyle = night ? '#3a2510' : '#6a4a28';
      ctx.beginPath();
      ctx.moveTo(tx - trunkW, ty);
      ctx.lineTo(tx + trunkW, ty);
      ctx.lineTo(tx + trunkW * 0.5 + sway * treeH, ty - trunkH);
      ctx.lineTo(tx - trunkW * 0.5 + sway * treeH, ty - trunkH);
      ctx.closePath(); ctx.fill();
      // Bark texture lines
      ctx.strokeStyle = night ? 'rgba(20,10,0,0.25)' : 'rgba(40,20,0,0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        const lx = tx - trunkW * 0.3 + i * trunkW * 0.3;
        ctx.beginPath();
        ctx.moveTo(lx, ty);
        ctx.lineTo(lx + sway * treeH * 0.4, ty - trunkH * 0.85);
        ctx.stroke();
      }
      // Canopy: 4 overlapping circles (rounded Hay Day look)
      const cb = ty - trunkH;
      const layers = [
        { dx: 0,               dy: 0,               r: treeH * 0.16 },
        { dx: -treeH * 0.08,   dy: -treeH * 0.10,   r: treeH * 0.18 },
        { dx: treeH * 0.06,    dy: -treeH * 0.12,   r: treeH * 0.17 },
        { dx: 0,               dy: -treeH * 0.22,   r: treeH * 0.14 },
      ];
      layers.forEach((l, idx) => {
        const ls = sway * treeH * (1 + idx * 0.35);
        const cx = tx + l.dx + ls;
        const cy = cb + l.dy;
        // Shadow
        ctx.fillStyle = night ? 'rgba(0,20,0,0.2)' : 'rgba(0,30,0,0.1)';
        ctx.beginPath(); ctx.arc(cx + 2, cy + 2, l.r, 0, Math.PI * 2); ctx.fill();
        // Fill with gradient
        const cg = ctx.createRadialGradient(cx - l.r * 0.25, cy - l.r * 0.3, l.r * 0.1, cx, cy, l.r);
        if (night) {
          cg.addColorStop(0, '#2a7a28'); cg.addColorStop(0.7, '#1a5a18'); cg.addColorStop(1, '#0e3a0c');
        } else {
          cg.addColorStop(0, '#68c848'); cg.addColorStop(0.5, '#4aaa38'); cg.addColorStop(1, '#388a28');
        }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(cx, cy, l.r, 0, Math.PI * 2); ctx.fill();
        // Highlight for depth
        ctx.fillStyle = night ? 'rgba(50,120,50,0.12)' : 'rgba(180,240,140,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx - l.r * 0.15, cy - l.r * 0.2, l.r * 0.6, l.r * 0.4, -0.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // -- Falling leaves with wind drift --
    function _drawHDLeaves(ctx, W, H, t, windSway, night) {
      if (!_outsideLeaves) return;
      const colors = night ? LEAF_COLORS_NIGHT : LEAF_COLORS_DAY;
      _outsideLeaves.forEach(leaf => {
        leaf.x += leaf.vx + windSway * 0.25;
        leaf.y += leaf.vy;
        leaf.rot += leaf.rotSpeed;
        leaf.x += Math.sin(t / 500 + leaf.wobblePhase) * 0.0003;
        // Respawn leaf when it passes ground
        if (leaf.y > 0.68 || leaf.x > 1.05 || leaf.x < -0.05) {
          leaf.x = Math.random() * 0.8 + 0.1;
          leaf.y = -0.02 - Math.random() * 0.04;
        }
        const px = leaf.x * W, py = leaf.y * H;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(leaf.rot);
        ctx.fillStyle = colors[leaf.colorIdx];
        // Almond-shaped leaf
        const s = leaf.size;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.8, -s * 0.3, 0, s);
        ctx.quadraticCurveTo(-s * 0.8, -s * 0.3, 0, -s);
        ctx.fill();
        // Leaf vein (center line)
        ctx.strokeStyle = night ? 'rgba(0,30,0,0.25)' : 'rgba(0,50,0,0.15)';
        ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke();
        ctx.restore();
      });
    }

    // -- Charming cottage building (Hay Day barn style) --
    function _drawHDBuilding(ctx, W, H, bX, bW, bTop, floorH, bH, MAX_FLOORS, total, night) {
      // Drop shadow
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur  = 16;
      ctx.fillStyle   = '#3a2a18';
      ctx.fillRect(bX - 3, bTop - 1, bW + 6, bH + 4);
      ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent';

      // -- Each floor --
      for (let i = 1; i <= MAX_FLOORS; i++) {
        const fi = MAX_FLOORS - i;
        const fy = bTop + fi * floorH;
        const unlocked  = i <= total;
        const isCurrent = i === currentLayer;
        const ld = (roomData.layerData || {})[i] || {};
        const wallColor = getWallPreviewColor(ld.wallPattern || getLayerDefaultWall(i));

        if (unlocked) {
          ctx.fillStyle = wallColor;
          ctx.fillRect(bX, fy, bW, floorH);
          // Subtle warm overlay
          const tex = ctx.createLinearGradient(bX, fy, bX + bW, fy + floorH);
          tex.addColorStop(0,   'rgba(255,250,230,0.08)');
          tex.addColorStop(0.5, 'rgba(255,255,255,0.0)');
          tex.addColorStop(1,   'rgba(0,0,0,0.05)');
          ctx.fillStyle = tex;
          ctx.fillRect(bX, fy, bW, floorH);
        } else {
          ctx.fillStyle = night ? '#1a1525' : '#2a2035';
          ctx.fillRect(bX, fy, bW, floorH);
          ctx.strokeStyle = 'rgba(100,80,160,0.10)';
          ctx.lineWidth = 0.6;
          for (let lx = -floorH; lx < bW + floorH; lx += 14) {
            ctx.beginPath();
            ctx.moveTo(bX + lx, fy);
            ctx.lineTo(bX + lx + floorH, fy + floorH);
            ctx.stroke();
          }
        }

        // Floor border (highlight current floor)
        ctx.strokeStyle = (isCurrent && unlocked) ? '#f7c97e' : 'rgba(60,40,20,0.35)';
        ctx.lineWidth   = (isCurrent && unlocked) ? 2.5 : 1;
        ctx.strokeRect(
          bX + (isCurrent ? 1 : 0), fy + (isCurrent ? 1 : 0),
          bW - (isCurrent ? 2 : 0), floorH - (isCurrent ? 2 : 0)
        );

        // Windows with decorative shutters
        const winW = bW * 0.14, winH = floorH * 0.48;
        const winY = fy + (floorH - winH) / 2;
        [bX + bW * 0.20, bX + bW * 0.64].forEach(wx => {
          if (unlocked) {
            // Window frame (wooden)
            ctx.fillStyle = night ? '#4a3a20' : '#8a6840';
            ctx.fillRect(wx - 3, winY - 2, winW + 6, winH + 4);
            // Shutters (green, Hay Day cottage style)
            ctx.fillStyle = night ? '#3a5a50' : '#5a9a78';
            ctx.fillRect(wx - 6, winY, 4, winH);
            ctx.fillRect(wx + winW + 2, winY, 4, winH);
            // Glass pane - warm glow at night, sky-blue by day
            const wg = ctx.createLinearGradient(wx, winY, wx + winW, winY + winH);
            if (night) {
              wg.addColorStop(0, 'rgba(255,240,180,0.55)');
              wg.addColorStop(1, 'rgba(255,220,140,0.35)');
            } else {
              wg.addColorStop(0, 'rgba(200,235,255,0.7)');
              wg.addColorStop(1, 'rgba(170,215,255,0.5)');
            }
            ctx.fillStyle = wg;
            ctx.fillRect(wx, winY, winW, winH);
            // Pane cross dividers
            ctx.strokeStyle = night ? 'rgba(100,80,50,0.5)' : 'rgba(80,100,140,0.5)';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(wx + winW / 2, winY); ctx.lineTo(wx + winW / 2, winY + winH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(wx, winY + winH / 2); ctx.lineTo(wx + winW, winY + winH / 2); ctx.stroke();
          } else {
            // Locked - dark boarded-up windows
            ctx.fillStyle = 'rgba(30,20,10,0.7)';
            ctx.fillRect(wx, winY, winW, winH);
            ctx.strokeStyle = 'rgba(80,60,30,0.4)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(wx, winY); ctx.lineTo(wx + winW, winY + winH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(wx + winW, winY); ctx.lineTo(wx, winY + winH); ctx.stroke();
          }
        });

        // Floor label
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        if (unlocked) {
          ctx.fillStyle = isCurrent ? '#f7c97e' : 'rgba(0,0,0,0.55)';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(isCurrent ? '\u2605 Floor ' + i : 'Floor ' + i, bX + bW / 2, fy + floorH - 16);
        } else {
          ctx.fillStyle = 'rgba(180,150,220,0.75)';
          ctx.font = '10px sans-serif';
          const UNLOCK_COST = { 2: 10000, 3: 20000 };
          ctx.fillText('\uD83D\uDD12 ' + (UNLOCK_COST[i] || '') + ' coins', bX + bW / 2, fy + floorH - 16);
        }
        ctx.textBaseline = 'alphabetic';
        _outsideFloorRects[i] = { x: bX, y: fy, w: bW, h: floorH, unlocked };
      }

      // -- Red barn / cottage roof --
      const roofPeakX = W / 2;
      const roofPeakY = bTop - bW * 0.26;
      const roofOverhang = 14;
      const rg = ctx.createLinearGradient(bX, bTop, roofPeakX, roofPeakY);
      rg.addColorStop(0, '#c0503a'); rg.addColorStop(0.4, '#a84030'); rg.addColorStop(1, '#8a3020');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(bX - roofOverhang, bTop);
      ctx.lineTo(roofPeakX, roofPeakY);
      ctx.lineTo(bX + bW + roofOverhang, bTop);
      ctx.closePath(); ctx.fill();
      // Roof outline
      ctx.strokeStyle = 'rgba(60,20,10,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      // Roof ridge highlight
      ctx.strokeStyle = night ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(roofPeakX, roofPeakY + 2);
      ctx.lineTo(bX + bW + roofOverhang - 4, bTop);
      ctx.stroke();

      // -- Chimney --
      const chimX = bX + bW * 0.70;
      const chimSlope = (bTop - roofPeakY) / (bW / 2 + roofOverhang);
      const chimTopY = roofPeakY + chimSlope * (chimX - bX + roofOverhang - bW / 2 - roofOverhang) + (bTop - roofPeakY) * 0.15;
      ctx.fillStyle = night ? '#6a4a20' : '#a07040';
      ctx.fillRect(chimX, chimTopY - 20, 14, 24);
      ctx.fillStyle = night ? '#5a3a10' : '#8a5a30';
      ctx.fillRect(chimX - 2, chimTopY - 22, 18, 4);

      // -- Arched front door --
      const doorW = bW * 0.12, doorH = floorH * 0.78;
      const doorX = W / 2 - doorW / 2;
      const doorY = H * 0.68 - doorH;
      // Door frame
      ctx.fillStyle = night ? '#4a3018' : '#7a5030';
      ctx.fillRect(doorX - 4, doorY + doorH * 0.12, doorW + 8, doorH * 0.88 + 3);
      // Door surface
      const dg = ctx.createLinearGradient(doorX, doorY, doorX + doorW, doorY + doorH);
      dg.addColorStop(0, '#8a5838'); dg.addColorStop(1, '#5a3820');
      ctx.fillStyle = dg;
      ctx.fillRect(doorX, doorY + doorH * 0.12, doorW, doorH * 0.88);
      // Arch top
      ctx.fillStyle = '#6a4428';
      ctx.beginPath();
      ctx.arc(doorX + doorW / 2, doorY + doorH * 0.12, doorW / 2, Math.PI, 0);
      ctx.fill();
      // Door panel lines
      ctx.strokeStyle = 'rgba(40,20,5,0.4)'; ctx.lineWidth = 0.8;
      ctx.strokeRect(doorX + 3, doorY + doorH * 0.18, doorW - 6, doorH * 0.30);
      ctx.strokeRect(doorX + 3, doorY + doorH * 0.52, doorW - 6, doorH * 0.32);
      // Golden door knob
      ctx.fillStyle = '#f0c050';
      ctx.beginPath();
      ctx.arc(doorX + doorW * 0.75, doorY + doorH * 0.55, 3, 0, Math.PI * 2);
      ctx.fill();
      // Welcome mat
      ctx.fillStyle = night ? '#4a3828' : '#c8a060';
      ctx.fillRect(doorX - 6, H * 0.68, doorW + 12, 4);
    }

    /**
     * Draws a hover highlight and tooltip on whichever floor the mouse is over.
     * Uses _outsideHoveredFloor set by the mousemove handler.
     */
    function _drawFloorHover(ctx, W, H) {
      if (_outsideHoveredFloor == null) return;
      const r = _outsideFloorRects[_outsideHoveredFloor];
      if (!r) return;

      // Semi-transparent highlight overlay
      ctx.fillStyle = r.unlocked
        ? 'rgba(255,220,100,0.18)'
        : 'rgba(120,100,180,0.15)';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // Border glow
      ctx.strokeStyle = r.unlocked ? 'rgba(255,200,60,0.65)' : 'rgba(160,140,220,0.50)';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      // Tooltip label above the hovered floor
      const label = r.unlocked
        ? 'Floor ' + _outsideHoveredFloor + ' (click to enter)'
        : 'Floor ' + _outsideHoveredFloor + ' (locked)';
      ctx.font = 'bold 11px sans-serif';
      const tw = ctx.measureText(label).width;
      const tx = r.x + (r.w - tw) / 2 - 6;
      const ty = r.y - 22;
      // Tooltip background (rounded rect)
      const pad = 5;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw + pad * 2 + 2, 18, 4);
      ctx.fill();
      // Tooltip text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(label, tx + pad + 1, ty + 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    }

    /** Attaches click and mousemove handlers on #outsideCanvas. */
    /**
     * Little red barn in the bottom-left foreground — the gate into the farm.
     * Stores its clickable rect in _farmGateRect for the hover/click handlers.
     */
    function _drawFarmBarn(ctx, W, H, night) {
      const bw = Math.min(W * 0.20, 120);          // barn body width
      const bh = bw * 0.52;                        // barn body height
      const bx = W * 0.04;
      const by = H * 0.90 - bh;                    // body top (base sits at 0.90H)
      const roofH = bh * 0.55;

      ctx.save();
      // Body
      ctx.fillStyle = night ? '#7a2820' : '#c0392b';
      ctx.fillRect(bx, by, bw, bh);
      // Gambrel roof
      ctx.fillStyle = night ? '#4a1812' : '#8e2418';
      ctx.beginPath();
      ctx.moveTo(bx - bw * 0.06, by);
      ctx.lineTo(bx + bw * 0.22, by - roofH);
      ctx.lineTo(bx + bw * 0.78, by - roofH);
      ctx.lineTo(bx + bw * 1.06, by);
      ctx.closePath();
      ctx.fill();
      // Door with white X-brace
      const dw = bw * 0.34, dh = bh * 0.72, dx = bx + (bw - dw) / 2, dy = by + bh - dh;
      ctx.fillStyle = night ? '#3a1410' : '#6e1c12';
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeStyle = night ? 'rgba(255,255,255,.45)' : '#f5e8d8';
      ctx.lineWidth = Math.max(1.5, bw * 0.022);
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.beginPath();
      ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy + dh);
      ctx.moveTo(dx + dw, dy); ctx.lineTo(dx, dy + dh);
      ctx.stroke();
      // A couple of residents peeking beside the barn
      const animals = roomData.farmAnimals || [];
      if (animals.length) {
        ctx.font = Math.round(bw * 0.18) + 'px sans-serif';
        ctx.textAlign = 'center';
        const seen = [...new Set(animals.map(a => a.type))].slice(0, 2);
        seen.forEach((type, i) => {
          const def = FARM_ANIMALS.find(f => f.id === type);
          if (def) ctx.fillText(def.emoji, bx + bw * (1.14 + i * 0.18), by + bh * 0.92);
        });
      }
      // Sign
      ctx.font = '700 ' + Math.max(10, Math.round(bw * 0.13)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
      ctx.fillText('🚜 Farm', bx + bw / 2, by - roofH - 6);
      ctx.shadowBlur = 0;
      // Hover glow
      if (_farmGateHover) {
        ctx.strokeStyle = 'rgba(247,201,126,.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 4, by - roofH - 4, bw + 8, bh + roofH + 8);
      }
      ctx.restore();
      _farmGateRect = { x: bx - 4, y: by - roofH - 18, w: bw + 8, h: bh + roofH + 22 };
    }

    function _attachOutsideClickHandler() {
      const cvs = document.getElementById('outsideCanvas');
      if (!cvs) return;

      /** Converts a mouse/pointer event to canvas coordinates. */
      function canvasCoords(e) {
        const rect = cvs.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (cvs.width  / rect.width),
          y: (e.clientY - rect.top)  * (cvs.height / rect.height)
        };
      }

      /** Returns the floor index under (cx, cy), or null. */
      function hitTestFloor(cx, cy) {
        for (const [fi, r] of Object.entries(_outsideFloorRects)) {
          if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
            return Number(fi);
          }
        }
        return null;
      }

      /** True when (cx, cy) is inside the farm barn gate. */
      function hitTestFarm(cx, cy) {
        const r = _farmGateRect;
        return !!r && cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
      }

      // Mousemove — update hovered floor / farm gate for the hover indicators
      cvs.onmousemove = (e) => {
        const { x, y } = canvasCoords(e);
        const floor = hitTestFloor(x, y);
        _outsideHoveredFloor = floor;
        _farmGateHover = hitTestFarm(x, y);
        cvs.style.cursor = (floor != null || _farmGateHover) ? 'pointer' : 'default';
      };

      // Mouse leaves canvas — clear hover state
      cvs.onmouseleave = () => {
        _outsideHoveredFloor = null;
        _farmGateHover = false;
        cvs.style.cursor = 'default';
      };

      // Click — enter the farm, enter a floor, or show locked message
      cvs.onclick = (e) => {
        const { x, y } = canvasCoords(e);
        if (hitTestFarm(x, y)) { openFarm(); return; }
        const floor = hitTestFloor(x, y);
        if (floor == null) return;
        const r = _outsideFloorRects[floor];
        if (r.unlocked) {
          enterLayer(floor);
        } else {
          const ownRoom = viewingUid === currentUid;
          showToast(ownRoom ? 'Unlock from ⬆ Feed → 🏠 Floors' : 'Floor is locked.', 'error');
        }
      };
    }

    /**
     * @deprecated - HTML floor tiles replaced by canvas.
     * Kept as a thin wrapper so existing callers (upgrade tab, etc.) still work.
     */
    function renderOutsideView() {
      if (isOutsideView) drawOutsideCanvas();
    }

    /**
     * Returns a representative CSS background colour for a wall pattern
     * used in the outside-view floor preview tiles.
     */
    function getWallPreviewColor(wallId) {
      const map = {
        wall_default: '#d4c4a0', wall_brick:   '#b5745a', wall_wood:    '#a08060',
        wall_stripe:  '#e0d8cc', wall_dots:    '#e8e0d8', wall_diamond: '#d8d0c4',
        wall_pastel:  '#ffd1dc', wall_mint:    '#b8e8d0', wall_navy:    '#2c3e6b',
        wall_sunset:  '#ff7b54', wall_marble:  '#e8e4e0', wall_galaxy:  '#1a1035',
        wall_lavender:'#d4bcf0', wall_forest:  '#2d5a27', wall_bamboo:  '#a8c878',
        wall_cherry:  '#f5d0d8'
      };
      return map[wallId] || '#d4c4a0';
    }

    /**
     * Unlocks a new floor layer, deducting coins and initialising the layer's
     * default wall/window settings. Called from the 🏠 Floors upgrade sub-tab.
     */
    async function unlockLayer(n) {
      if (viewingUid !== currentUid) return;
      const UNLOCK_COST = { 2: 10000, 3: 20000 };
      const cost = UNLOCK_COST[n];
      if (!cost) return;
      if ((roomData.unlockedLayers || 1) >= n) return showToast('Floor ' + n + ' already unlocked!', 'error');
      if ((roomData.unlockedLayers || 1) < n - 1)
        return showToast('Unlock Floor ' + (n - 1) + ' first!', 'error');
      if (roomData.coins < cost)
        return showToast('Not enough coins! Need ' + cost + ' 🪙', 'error');
      roomData.coins -= cost;
      roomData.unlockedLayers = n;
      // Initialise the new floor with its default wall/window and empty decors
      if (!roomData.layerData) roomData.layerData = {};
      roomData.layerData[n] = {
        wallPattern:   getLayerDefaultWall(n),
        windowStyle:   getLayerDefaultWindow(n),
        placedDecors:  [],
        plantPosition: null
      };
      // Ensure the default window style is in the owned list
      const defWin = getLayerDefaultWindow(n);
      if (!roomData.ownedWindows.includes(defWin)) roomData.ownedWindows.push(defWin);
      await saveRoom();
      renderAll();
      showToast('🏠 Floor ' + n + ' unlocked! Tap it to enter.', 'success');
    }

    function getPlayerName() {
      const custom = currentUid ? localStorage.getItem('flappy_custom_name_' + currentUid) : null;
      if (custom) return custom;
      // Prefer current Firebase user's displayName over potentially stale localStorage
      if (currentUser && currentUser.displayName) return currentUser.displayName;
      return localStorage.getItem('flappy_name') || 'Anonymous';
    }

