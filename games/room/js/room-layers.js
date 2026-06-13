    function flushLayerData() {
      if (!roomData.layerData) roomData.layerData = {};
      roomData.layerData[currentLayer] = {
        wallPattern:   roomData.wallPattern,
        windowStyle:   roomData.windowStyle,
        placedDecors:  roomData.placedDecors,
        plantPosition: roomData.plantPosition || null,
        plant:         roomData.plant || null,
        floorStyle:    roomData.floorStyle || 'floor_wood',
        exteriorWall:  (roomData.layerData[currentLayer] || {}).exteriorWall || null
      };
    }

    /**
     * Hides the side panel ONLY in the bare Outside View (building exterior),
     * so that scene fills the whole stage. The farm keeps its panel — it holds
     * the farm's controls (feed, sell, orders, shop, workshop), and inside a
     * room the panel shows the room tabs. The farm is opened from the outside
     * view, so isOutsideView stays true there; gate on !isFarmView.
     * Call AFTER updating isOutsideView/isFarmView and BEFORE redrawing a
     * canvas (toggling the class reflows the stage to its new width).
     */
    function _syncRoomPanel() {
      const wrap = document.querySelector('.main-wrap');
      if (!wrap) return;
      const out  = typeof isOutsideView !== 'undefined' && isOutsideView;
      const farm = typeof isFarmView    !== 'undefined' && isFarmView;
      wrap.classList.toggle('no-panel', !!(out && !farm));
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
      _syncRoomPanel();   // back inside → bring the side panel back
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
      _syncRoomPanel();   // hide the side panel; widens the stage before we draw
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
    let _outsideFireflies = null;   // drifting glow motes at night
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

        // -- Cozy night atmosphere: porch light, warm ground pool, fireflies --
        if (night) _drawNightGlow(ctx, W, H, bX, bW, bTop, bH, t);

        // -- Floor hover indicator --
        _drawFloorHover(ctx, W, H);

        // -- Farm barn: gate into the farm view (own farm, or a friend's read-only) --
        _drawFarmBarn(ctx, W, H, night);

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
        // Soft "Bubble Pop" day sky — gentle blue up top, warm peach-cream glow at the horizon
        sky.addColorStop(0,    '#6bb6e8');
        sky.addColorStop(0.42, '#a7daf0');
        sky.addColorStop(0.72, '#ffe6c8');
        sky.addColorStop(1,    '#ffd7a6');
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
      ctx.fillStyle = night ? '#1a3a18' : '#7cc25a';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.68);
      ctx.quadraticCurveTo(W * 0.25, H * 0.60, W * 0.5, H * 0.66);
      ctx.quadraticCurveTo(W * 0.75, H * 0.58, W, H * 0.65);
      ctx.lineTo(W, H * 0.70); ctx.lineTo(0, H * 0.70);
      ctx.closePath(); ctx.fill();
      // Near hill
      ctx.fillStyle = night ? '#1e4a1a' : '#66ad46';
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
        g.addColorStop(0,   '#6cc046');
        g.addColorStop(0.3, '#58a838');
        g.addColorStop(0.7, '#46912c');
        g.addColorStop(1,   '#387d24');
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
      const postW = 5;
      const railH = 3;
      const posts = Math.floor(length / postSpacing);
      // soft ground shadow under the fence (3D grounding)
      ctx.fillStyle = night ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.13)';
      ctx.fillRect(startX, y + 1, length, 3);
      // Two horizontal rails with a dark bottom edge for depth
      for (let r = 0; r < 2; r++) {
        const ry = y - postH * 0.3 - r * postH * 0.35;
        ctx.fillStyle = night ? '#4a3820' : '#b08850';
        ctx.fillRect(startX, ry, length, railH);
        ctx.fillStyle = night ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.16)'; // top highlight
        ctx.fillRect(startX, ry, length, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';                                          // bottom shade
        ctx.fillRect(startX, ry + railH - 1, length, 1);
      }
      // Vertical posts — 3D rounded with light/shadow sides + a highlighted cap
      for (let i = 0; i <= posts; i++) {
        const px = startX + i * postSpacing;
        ctx.fillStyle = night ? '#3a2810' : '#a07840';
        ctx.fillRect(px - postW / 2, y - postH, postW, postH);
        ctx.fillStyle = night ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.20)'; // left light
        ctx.fillRect(px - postW / 2, y - postH, 1.5, postH);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';                                          // right shadow
        ctx.fillRect(px + postW / 2 - 1.5, y - postH, 1.5, postH);
        ctx.fillStyle = night ? '#5a4828' : '#c8a060';                               // cap
        ctx.beginPath(); ctx.arc(px, y - postH, postW * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.32)'; // cap highlight
        ctx.beginPath(); ctx.arc(px - 1, y - postH - 1, postW * 0.3, 0, Math.PI * 2); ctx.fill();
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

    // -- Lush soft "clay" tree: full rounded crown, unified light/shade, sway --
    function _drawHDTree(ctx, tx, ty, treeH, sway, night) {
      const trunkW = treeH * 0.06;
      const trunkH = treeH * 0.34;
      const topX = tx + sway * treeH;
      ctx.save();

      // soft ground shadow (grounds the tree)
      ctx.fillStyle = night ? 'rgba(0,0,0,0.22)' : 'rgba(20,45,12,0.18)';
      ctx.beginPath(); ctx.ellipse(tx, ty + 1, treeH * 0.20, treeH * 0.045, 0, 0, Math.PI * 2); ctx.fill();

      // Trunk — tapered, warm gradient, with a root flare + soft highlight
      const tg = ctx.createLinearGradient(tx - trunkW, 0, tx + trunkW, 0);
      tg.addColorStop(0, night ? '#3a2510' : '#7a5430');
      tg.addColorStop(0.5, night ? '#4a3018' : '#8a6038');
      tg.addColorStop(1, night ? '#281607' : '#5e3e20');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(tx - trunkW * 1.3, ty);
      ctx.quadraticCurveTo(tx - trunkW, ty - trunkH * 0.45, topX - trunkW * 0.5, ty - trunkH);
      ctx.lineTo(topX + trunkW * 0.5, ty - trunkH);
      ctx.quadraticCurveTo(tx + trunkW, ty - trunkH * 0.45, tx + trunkW * 1.3, ty);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = night ? 'rgba(255,250,235,0.05)' : 'rgba(255,242,212,0.20)';
      ctx.fillRect(tx - trunkW * 0.65, ty - trunkH, trunkW * 0.4, trunkH);

      // Canopy — lush rounded clay crown
      const cb = ty - trunkH;
      const R = treeH * 0.20;
      const swayTop = sway * treeH;
      const blobs = [
        { dx: 0,         dy: R * 0.10,  r: R * 0.98 },
        { dx: -R * 0.80, dy: -R * 0.04, r: R * 0.78 },
        { dx: R * 0.80,  dy: -R * 0.02, r: R * 0.74 },
        { dx: -R * 0.42, dy: -R * 0.64, r: R * 0.72 },
        { dx: R * 0.42,  dy: -R * 0.66, r: R * 0.70 },
        { dx: 0,         dy: -R * 0.98, r: R * 0.62 },
      ];
      const cxy = (b, idx) => ({ cx: tx + b.dx + swayTop * (0.6 + idx * 0.12), cy: cb + b.dy });
      // 1) base silhouette (one unified deep-green mass)
      ctx.fillStyle = night ? '#185016' : '#3f9a30';
      blobs.forEach((b, idx) => { const { cx, cy } = cxy(b, idx); ctx.beginPath(); ctx.arc(cx, cy, b.r, 0, Math.PI * 2); ctx.fill(); });
      // 2) clay shading clipped to the crown: top-left light + bottom ambient shade
      ctx.save();
      ctx.beginPath();
      blobs.forEach((b, idx) => { const { cx, cy } = cxy(b, idx); ctx.moveTo(cx + b.r, cy); ctx.arc(cx, cy, b.r, 0, Math.PI * 2); });
      ctx.clip();
      const lg = ctx.createRadialGradient(tx - R * 0.5 + swayTop, cb - R * 0.7, R * 0.1, tx + swayTop * 0.6, cb - R * 0.2, R * 1.8);
      lg.addColorStop(0, night ? 'rgba(95,175,85,0.55)' : 'rgba(152,226,112,0.68)');
      lg.addColorStop(0.55, night ? 'rgba(40,110,40,0.18)' : 'rgba(92,190,70,0.24)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(tx - R * 2.4, cb - R * 2.7, R * 4.8, R * 3.9);
      const sg = ctx.createLinearGradient(0, cb - R * 0.2, 0, cb + R * 1.2);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, night ? 'rgba(0,0,0,0.38)' : 'rgba(8,42,6,0.30)');
      ctx.fillStyle = sg; ctx.fillRect(tx - R * 2.4, cb - R * 0.2, R * 4.8, R * 1.6);
      ctx.restore();
      // 3) dapple highlights on the sunlit side
      ctx.fillStyle = night ? 'rgba(120,200,110,0.4)' : 'rgba(195,242,155,0.6)';
      [[-R * 0.5, -R * 0.72, R * 0.13], [-R * 0.08, -R * 0.98, R * 0.09], [R * 0.32, -R * 0.7, R * 0.10], [-R * 0.74, -R * 0.12, R * 0.08]]
        .forEach(d => { ctx.beginPath(); ctx.arc(tx + d[0] + swayTop, cb + d[1], d[2], 0, Math.PI * 2); ctx.fill(); });
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
    // Warm lighting + fireflies that make the night scene feel lived-in.
    function _drawNightGlow(ctx, W, H, bX, bW, bTop, bH, t) {
      const doorX = W / 2, doorY = bTop + bH;   // entrance at the building base
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // warm pool of light spilling onto the grass from the doorway
      const pool = ctx.createRadialGradient(doorX, doorY + 6, 4, doorX, doorY + 6, bW * 0.8);
      pool.addColorStop(0, 'rgba(255,190,90,0.26)');
      pool.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(doorX - bW, doorY - bW * 0.45, bW * 2, bW);
      // porch lantern glow over the door
      const lamp = ctx.createRadialGradient(doorX, doorY - 18, 1, doorX, doorY - 18, 36);
      lamp.addColorStop(0, 'rgba(255,224,150,0.55)');
      lamp.addColorStop(1, 'rgba(255,210,130,0)');
      ctx.fillStyle = lamp;
      ctx.fillRect(doorX - 42, doorY - 60, 84, 84);
      ctx.restore();

      // Fireflies drifting over the grass
      if (!_outsideFireflies) {
        _outsideFireflies = Array.from({ length: 14 }, (_, i) => ({
          bx: 0.10 + 0.80 * ((i * 0.137) % 1),
          by: 0.50 + 0.22 * ((i * 0.317) % 1),
          ph: i * 1.7, sp: 0.6 + (i % 5) * 0.12,
        }));
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of _outsideFireflies) {
        const fx = (f.bx + Math.sin(t / 1300 * f.sp + f.ph) * 0.02) * W;
        const fy = (f.by + Math.cos(t / 1700 * f.sp + f.ph) * 0.02) * H;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 420 * f.sp + f.ph));
        const r = 2.4;
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 2.6);
        g.addColorStop(0, 'rgba(190,255,120,' + (0.5 * tw).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(150,230,90,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx, fy, r * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(225,255,165,' + (0.7 * tw).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(fx, fy, 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    function _drawHDBuilding(ctx, W, H, bX, bW, bTop, floorH, bH, MAX_FLOORS, total, night) {
      // 3D extrusion depth — the house recedes up-and-right so we see its right
      // side + the roof top, reading as a solid block instead of a flat front.
      const D3 = bW * 0.16, dyTop = D3 * 0.5;

      // Soft ground contact shadow — grounds the house on the grass (clay look)
      ctx.save();
      ctx.filter = 'blur(6px)';
      ctx.fillStyle = night ? 'rgba(0,0,0,0.32)' : 'rgba(40,28,12,0.22)';
      ctx.beginPath();
      ctx.ellipse(W / 2 + D3 * 0.3, bTop + bH + 8, bW * 0.62 + D3 * 0.45, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soft backing shadow behind the façade
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur  = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle   = '#2a1d10';
      ctx.beginPath(); ctx.roundRect(bX - 2, bTop, bW + 4, bH + 2, 13); ctx.fill();
      ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

      // Right side wall — derives from the front wall colour, then shaded (3D depth)
      const _ld1 = (roomData.layerData || {})[1] || {};
      const sideBase = getWallPreviewColor(_ld1.exteriorWall || _ld1.wallPattern || getLayerDefaultWall(1));
      const sidePath = () => { ctx.beginPath(); ctx.moveTo(bX + bW, bTop); ctx.lineTo(bX + bW + D3, bTop - dyTop); ctx.lineTo(bX + bW + D3, bTop + bH - dyTop); ctx.lineTo(bX + bW, bTop + bH); ctx.closePath(); };
      ctx.fillStyle = sideBase; sidePath(); ctx.fill();
      const sideShade = ctx.createLinearGradient(bX + bW, 0, bX + bW + D3, 0);
      sideShade.addColorStop(0, night ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.34)');
      sideShade.addColorStop(1, night ? 'rgba(0,0,0,0.66)' : 'rgba(0,0,0,0.50)');
      ctx.fillStyle = sideShade; sidePath(); ctx.fill();
      // floor course hints on the side
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
      for (let fi2 = 1; fi2 < MAX_FLOORS; fi2++) {
        const sy = bTop + fi2 * floorH;
        ctx.beginPath(); ctx.moveTo(bX + bW, sy); ctx.lineTo(bX + bW + D3, sy - dyTop); ctx.stroke();
      }
      // Windows on the visible side wall (drawn in perspective), upper floors
      {
        const sw = (xx) => -dyTop * ((xx - (bX + bW)) / D3);     // vertical skew along the side
        const wx0 = bX + bW + D3 * 0.24, wx1 = bX + bW + D3 * 0.78;
        const ins = 2, wh = floorH * 0.42;
        for (const fk of [0, 1]) {
          const wy = bTop + fk * floorH + floorH * 0.30;
          ctx.fillStyle = night ? '#2e2014' : '#6a4a32';            // frame
          ctx.beginPath();
          ctx.moveTo(wx0, wy + sw(wx0)); ctx.lineTo(wx1, wy + sw(wx1));
          ctx.lineTo(wx1, wy + wh + sw(wx1)); ctx.lineTo(wx0, wy + wh + sw(wx0));
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = night ? 'rgba(255,228,150,0.5)' : 'rgba(186,218,255,0.62)'; // glass
          ctx.beginPath();
          ctx.moveTo(wx0 + ins, wy + ins + sw(wx0)); ctx.lineTo(wx1 - ins, wy + ins + sw(wx1));
          ctx.lineTo(wx1 - ins, wy + wh - ins + sw(wx1)); ctx.lineTo(wx0 + ins, wy + wh - ins + sw(wx0));
          ctx.closePath(); ctx.fill();
        }
      }

      // Clip the front facade to a softly rounded silhouette
      ctx.save();
      ctx.beginPath(); ctx.roundRect(bX, bTop, bW, bH, 10); ctx.clip();

      // -- Each floor --
      for (let i = 1; i <= MAX_FLOORS; i++) {
        const fi = MAX_FLOORS - i;
        const fy = bTop + fi * floorH;
        const unlocked  = i <= total;
        const isCurrent = i === currentLayer;
        const ld = (roomData.layerData || {})[i] || {};
        // Exterior house wall is INDEPENDENT of the interior wall: use the
        // dedicated exteriorWall if set, else fall back to the interior wallPattern.
        const exWall = ld.exteriorWall || ld.wallPattern || getLayerDefaultWall(i);
        const wallColor = getWallPreviewColor(exWall);

        if (unlocked) {
          _drawWallPattern(ctx, bX, fy, bW, floorH, exWall, wallColor, night);
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
            // Warm bloom spilling from a lit window at night — the cozy signature
            if (night) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const cgx = wx + winW / 2, cgy = winY + winH / 2, rr = winW * 1.8;
              const gl = ctx.createRadialGradient(cgx, cgy, 1, cgx, cgy, rr);
              gl.addColorStop(0, 'rgba(255,206,120,0.42)');
              gl.addColorStop(1, 'rgba(255,196,110,0)');
              ctx.fillStyle = gl;
              ctx.fillRect(cgx - rr, cgy - rr, rr * 2, rr * 2);
              ctx.restore();
            }
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

      // Soft 3D light over the whole facade (sun-lit top -> shaded base) for clay depth
      const _fade = ctx.createLinearGradient(bX, bTop, bX + bW, bTop + bH);
      _fade.addColorStop(0,   'rgba(255,245,220,0.10)');
      _fade.addColorStop(0.5, 'rgba(255,255,255,0)');
      _fade.addColorStop(1,   'rgba(0,0,0,0.13)');
      ctx.fillStyle = _fade;
      ctx.fillRect(bX, bTop, bW, bH);
      ctx.restore(); // end facade rounding clip

      // -- Stone foundation footing (front + side), staggered blocks --
      const fH = 16;
      // side footing (parallelogram, shaded)
      ctx.fillStyle = night ? '#3b3a3e' : '#8a8480';
      ctx.beginPath();
      ctx.moveTo(bX + bW, bTop + bH - fH);
      ctx.lineTo(bX + bW + D3, bTop + bH - fH - dyTop);
      ctx.lineTo(bX + bW + D3, bTop + bH - dyTop);
      ctx.lineTo(bX + bW, bTop + bH);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
      // front footing (slightly wider than the walls) with staggered stone blocks
      ctx.save();
      ctx.beginPath(); ctx.rect(bX - 3, bTop + bH - fH, bW + 6, fH); ctx.clip();
      const fg = ctx.createLinearGradient(0, bTop + bH - fH, 0, bTop + bH);
      fg.addColorStop(0, night ? '#55545a' : '#c2bcb4'); fg.addColorStop(1, night ? '#33323a' : '#8c857f');
      ctx.fillStyle = fg; ctx.fillRect(bX - 3, bTop + bH - fH, bW + 6, fH);
      const sbw = 24, sbh = 8; let frow = 0;
      for (let yy = bTop + bH - fH; yy < bTop + bH; yy += sbh, frow++) {
        const soff = (frow % 2) ? sbw / 2 : 0;
        ctx.strokeStyle = night ? 'rgba(0,0,0,0.45)' : 'rgba(70,66,62,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bX - 3, yy); ctx.lineTo(bX + bW + 3, yy); ctx.stroke();
        for (let xx = bX - 3 + soff; xx < bX + bW + 3; xx += sbw) {
          ctx.strokeStyle = night ? 'rgba(0,0,0,0.45)' : 'rgba(70,66,62,0.55)';
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + sbh); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath(); ctx.moveTo(xx + 1, yy + 1); ctx.lineTo(xx + sbw - 1, yy + 1); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bX - 3, bTop + bH - fH); ctx.lineTo(bX + bW + 3, bTop + bH - fH); ctx.stroke();

      // -- 3D cottage roof: front gable face + right slope receding up-right --
      const roofPeakX = W / 2;
      const roofPeakY = bTop - bW * 0.26;
      const roofOverhang = 14;
      const peakBX = roofPeakX + D3, peakBY = roofPeakY - dyTop;
      const eaveRF = bX + bW + roofOverhang;
      const eaveRBx = eaveRF + D3, eaveRBy = bTop - dyTop;
      // Right roof slope (shaded darker — the side facing away from the light)
      ctx.fillStyle = night ? '#5a1e14' : '#7e2e20';
      ctx.beginPath();
      ctx.moveTo(eaveRF, bTop);
      ctx.lineTo(roofPeakX, roofPeakY);
      ctx.lineTo(peakBX, peakBY);
      ctx.lineTo(eaveRBx, eaveRBy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,20,10,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();
      // Front gable face (lit)
      const rg = ctx.createLinearGradient(bX, bTop, roofPeakX, roofPeakY);
      rg.addColorStop(0, '#c0503a'); rg.addColorStop(0.4, '#a84030'); rg.addColorStop(1, '#8a3020');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(bX - roofOverhang, bTop);
      ctx.lineTo(roofPeakX, roofPeakY);
      ctx.lineTo(eaveRF, bTop);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,20,10,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      // Shingle courses on both roof planes (3D texture)
      ctx.save();
      ctx.beginPath(); ctx.moveTo(bX - roofOverhang, bTop); ctx.lineTo(roofPeakX, roofPeakY); ctx.lineTo(eaveRF, bTop); ctx.closePath(); ctx.clip();
      ctx.lineWidth = 1;
      for (let yy = bTop - 6; yy > roofPeakY; yy -= 6) {
        ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.moveTo(bX - roofOverhang, yy); ctx.lineTo(eaveRF, yy); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(bX - roofOverhang, yy + 1.5); ctx.lineTo(eaveRF, yy + 1.5); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.moveTo(eaveRF, bTop); ctx.lineTo(roofPeakX, roofPeakY); ctx.lineTo(peakBX, peakBY); ctx.lineTo(eaveRBx, eaveRBy); ctx.closePath(); ctx.clip();
      ctx.lineWidth = 1;
      for (let s = 0.14; s < 1; s += 0.17) {
        const ax = eaveRF + (roofPeakX - eaveRF) * s, ay = bTop + (roofPeakY - bTop) * s;
        const bx = eaveRBx + (peakBX - eaveRBx) * s, by = eaveRBy + (peakBY - eaveRBy) * s;
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.restore();
      // Ridge line (front peak -> back peak) with a highlight
      ctx.strokeStyle = night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(roofPeakX, roofPeakY); ctx.lineTo(peakBX, peakBY); ctx.stroke();
      // Eave / fascia boards along the roofline (front + side) for a proper edge
      ctx.strokeStyle = night ? '#6a5638' : '#efe4cd'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bX - roofOverhang, bTop); ctx.lineTo(eaveRF, bTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eaveRF, bTop); ctx.lineTo(eaveRBx, eaveRBy); ctx.stroke();

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
      // Stone doorstep (two steps) — a proper entrance
      const stepY = H * 0.68 + 4;
      ctx.fillStyle = night ? '#55545a' : '#c4beb6';
      ctx.fillRect(doorX - 8, stepY, doorW + 16, 4);
      ctx.fillStyle = night ? '#45444a' : '#aaa49c';
      ctx.fillRect(doorX - 12, stepY + 4, doorW + 24, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      ctx.strokeRect(doorX - 8, stepY, doorW + 16, 4);
      ctx.strokeRect(doorX - 12, stepY + 4, doorW + 24, 4);

      // -- Small porch awning (eyebrow roof) over the door --
      const awBotY = doorY + doorH * 0.12 - 1;
      const awTopY = awBotY - 9;
      const awHalf = doorW * 0.5 + 9;
      ctx.fillStyle = night ? '#8a3020' : '#bb4a32';
      ctx.beginPath();
      ctx.moveTo(W / 2 - awHalf, awBotY);
      ctx.lineTo(W / 2 + awHalf, awBotY);
      ctx.lineTo(W / 2 + awHalf - 5, awTopY);
      ctx.lineTo(W / 2 - awHalf + 5, awTopY);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,20,10,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(W / 2 - awHalf + 5, awTopY); ctx.lineTo(W / 2 + awHalf - 5, awTopY); ctx.stroke();
      // little support brackets
      ctx.strokeStyle = night ? '#5a4028' : '#7a5030'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - awHalf + 3, awBotY); ctx.lineTo(W / 2 - awHalf + 7, awBotY + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 + awHalf - 3, awBotY); ctx.lineTo(W / 2 + awHalf - 7, awBotY + 7); ctx.stroke();
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
      const D = bw * 0.18, ddy = D * 0.55;         // 3D depth (recede up-right)

      ctx.save();

      // Soft ground shadow
      ctx.save();
      ctx.filter = 'blur(5px)';
      ctx.fillStyle = night ? 'rgba(0,0,0,0.32)' : 'rgba(30,20,10,0.22)';
      ctx.beginPath(); ctx.ellipse(bx + bw / 2 + D * 0.3, by + bh + 5, bw * 0.6, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Right side wall (shaded red) -> 3D depth
      ctx.fillStyle = night ? '#5a1c16' : '#922a20';
      ctx.beginPath();
      ctx.moveTo(bx + bw, by);
      ctx.lineTo(bx + bw + D, by - ddy);
      ctx.lineTo(bx + bw + D, by + bh - ddy);
      ctx.lineTo(bx + bw, by + bh);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let pyl = by + bh * 0.3; pyl < by + bh; pyl += bh * 0.3) { ctx.beginPath(); ctx.moveTo(bx + bw, pyl); ctx.lineTo(bx + bw + D, pyl - ddy); ctx.stroke(); }

      // Front body (red) + vertical planks + top-lit depth gradient
      ctx.fillStyle = night ? '#7a2820' : '#c0392b';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
      for (let xx = bx + bw * 0.12; xx < bx + bw; xx += bw * 0.12) { ctx.beginPath(); ctx.moveTo(xx, by); ctx.lineTo(xx, by + bh); ctx.stroke(); }
      const _bgr = ctx.createLinearGradient(bx, by, bx, by + bh);
      _bgr.addColorStop(0, 'rgba(255,255,255,0.10)'); _bgr.addColorStop(0.5, 'rgba(255,255,255,0)'); _bgr.addColorStop(1, 'rgba(0,0,0,0.14)');
      ctx.fillStyle = _bgr; ctx.fillRect(bx, by, bw, bh);

      // Proper 3D GAMBREL barn roof: two slopes per side, receding right side
      const oh = bw * 0.06;
      const eaveL = bx - oh, eaveR = bx + bw + oh;
      const kneeLx = bx + bw * 0.12, kneeRx = bx + bw * 0.88, kneeY = by - roofH * 0.52;
      const peakX = bx + bw * 0.5, peakY = by - roofH;
      // right side of the roof, receding up-right (shaded) — follows the gambrel profile
      ctx.fillStyle = night ? '#3a120d' : '#702012';
      ctx.beginPath();
      ctx.moveTo(eaveR, by);
      ctx.lineTo(kneeRx, kneeY);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(peakX + D, peakY - ddy);
      ctx.lineTo(kneeRx + D, kneeY - ddy);
      ctx.lineTo(eaveR + D, by - ddy);
      ctx.closePath(); ctx.fill();
      // front gambrel face (lit) — pentagon with the double-slope barn profile
      const rgf = ctx.createLinearGradient(0, peakY, 0, by);
      rgf.addColorStop(0, night ? '#5a1d16' : '#a32c1e'); rgf.addColorStop(1, night ? '#4a1812' : '#8e2418');
      ctx.fillStyle = rgf;
      ctx.beginPath();
      ctx.moveTo(eaveL, by);
      ctx.lineTo(kneeLx, kneeY);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(kneeRx, kneeY);
      ctx.lineTo(eaveR, by);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,15,8,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      // slope-break (knee) line + ridge highlight
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(kneeLx, kneeY); ctx.lineTo(kneeRx, kneeY); ctx.stroke();
      ctx.strokeStyle = night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(peakX, peakY); ctx.lineTo(peakX + D, peakY - ddy); ctx.stroke();
      // hay-loft window on the upper gambrel face
      ctx.fillStyle = night ? '#caa24a' : '#f0c64a';
      ctx.beginPath(); ctx.arc(peakX, by - roofH * 0.66, bw * 0.055, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = night ? '#3a120d' : '#702012'; ctx.lineWidth = 1; ctx.stroke();

      // Door with white X-brace (front)
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
          if (def) ctx.fillText(def.emoji, bx + bw * (1.20 + i * 0.18), by + bh * 0.92);
        });
      }
      // Sign
      ctx.font = '700 ' + Math.max(10, Math.round(bw * 0.13)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
      ctx.fillText('🚜 Farm', bx + bw / 2, by - roofH - ddy - 6);
      ctx.shadowBlur = 0;
      // Hover glow
      if (_farmGateHover) {
        ctx.strokeStyle = 'rgba(247,201,126,.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 4, by - roofH - ddy - 4, bw + D + 8, bh + roofH + ddy + 8);
      }
      ctx.restore();
      _farmGateRect = { x: bx - 4, y: by - roofH - ddy - 18, w: bw + D + 8, h: bh + roofH + ddy + 22 };
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
        wall_cherry:  '#f5d0d8', wall_white_plank: '#f1ebe0'
      };
      return map[wallId] || '#d4c4a0';
    }

    /**
     * Renders a wall's ACTUAL pattern (brick courses, wood planks, stripes,
     * dots, diamonds, marble veins, galaxy stars, bamboo) onto a floor rect —
     * replacing the old flat colour fill. `base` is the pattern's preview hex.
     */
    function _drawWallPattern(ctx, x, y, w, h, wallId, base, night) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
      const D = a => 'rgba(0,0,0,' + a + ')';
      const L = a => 'rgba(255,255,255,' + a + ')';

      switch (wallId) {
        case 'wall_brick': {
          // 3D raised bricks: recessed dark mortar + each brick beveled (light
          // top-left edge, dark bottom-right edge) with a top sheen + base shade.
          const bh = 12, bw = 26, gap = 2.5;
          ctx.fillStyle = night ? 'rgba(0,0,0,0.50)' : 'rgba(86,56,42,0.60)';
          ctx.fillRect(x, y, w, h);
          let r = 0;
          for (let by = y; by < y + h; by += bh, r++) {
            const off = (r % 2) ? -(bw / 2) : 0;
            for (let bx = x + off; bx < x + w; bx += bw) {
              const rx = bx + gap, ry = by + gap, rw = bw - gap * 2, rh = bh - gap * 2;
              if (rw <= 0) continue;
              ctx.fillStyle = base;            ctx.fillRect(rx, ry, rw, rh);                       // brick face
              ctx.fillStyle = L(0.16);         ctx.fillRect(rx, ry, rw, rh * 0.45);               // top sheen
              ctx.fillStyle = D(0.20);         ctx.fillRect(rx, ry + rh * 0.70, rw, rh * 0.30);   // base shade
              ctx.strokeStyle = L(0.38); ctx.lineWidth = 1;                                        // light bevel (top+left)
              ctx.beginPath(); ctx.moveTo(rx + 0.5, ry + rh); ctx.lineTo(rx + 0.5, ry + 0.5); ctx.lineTo(rx + rw, ry + 0.5); ctx.stroke();
              ctx.strokeStyle = D(0.42);                                                            // dark bevel (bottom+right)
              ctx.beginPath(); ctx.moveTo(rx + rw - 0.5, ry); ctx.lineTo(rx + rw - 0.5, ry + rh - 0.5); ctx.lineTo(rx, ry + rh - 0.5); ctx.stroke();
            }
          }
          break;
        }
        case 'wall_wood': {
          const ph = 13;
          for (let py = y + ph; py < y + h; py += ph) {
            ctx.strokeStyle = night ? D(0.32) : 'rgba(90,58,28,0.38)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
            ctx.strokeStyle = L(0.06);
            ctx.beginPath(); ctx.moveTo(x, py + 1.5); ctx.lineTo(x + w, py + 1.5); ctx.stroke();
          }
          break;
        }
        case 'wall_stripe': {
          const sw = 15; ctx.fillStyle = D(0.07);
          for (let sx = x; sx < x + w; sx += sw * 2) ctx.fillRect(sx, y, sw, h);
          break;
        }
        case 'wall_dots': {
          ctx.fillStyle = night ? L(0.10) : D(0.10); const g = 18; let r = 0;
          for (let dy = y + 10; dy < y + h; dy += g, r++)
            for (let dx = x + 10 + ((r % 2) ? g / 2 : 0); dx < x + w; dx += g) { ctx.beginPath(); ctx.arc(dx, dy, 2.4, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case 'wall_diamond': {
          ctx.strokeStyle = D(0.10); ctx.lineWidth = 1; const s = 20;
          for (let d = -h; d < w + h; d += s) {
            ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + d + h, y); ctx.lineTo(x + d, y + h); ctx.stroke();
          }
          break;
        }
        case 'wall_marble': {
          ctx.strokeStyle = night ? L(0.07) : 'rgba(150,150,165,0.28)'; ctx.lineWidth = 1.1;
          for (let m = 0; m < 5; m++) {
            const my = y + h * (0.12 + m * 0.19);
            ctx.beginPath(); ctx.moveTo(x, my);
            ctx.quadraticCurveTo(x + w * 0.35, my - 9, x + w * 0.6, my + 5);
            ctx.quadraticCurveTo(x + w * 0.85, my + 12, x + w, my - 3); ctx.stroke();
          }
          break;
        }
        case 'wall_galaxy': {
          // deep-space gradient base
          const bg = ctx.createLinearGradient(x, y, x, y + h);
          bg.addColorStop(0, '#2a1450'); bg.addColorStop(0.55, '#1a1035'); bg.addColorStop(1, '#0e0822');
          ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
          // two soft nebula blobs (purple + blue)
          const n1 = ctx.createRadialGradient(x + w * 0.30, y + h * 0.28, 2, x + w * 0.30, y + h * 0.28, w * 0.55);
          n1.addColorStop(0, 'rgba(150,90,220,0.32)'); n1.addColorStop(1, 'rgba(150,90,220,0)');
          ctx.fillStyle = n1; ctx.fillRect(x, y, w, h);
          const n2 = ctx.createRadialGradient(x + w * 0.72, y + h * 0.64, 2, x + w * 0.72, y + h * 0.64, w * 0.50);
          n2.addColorStop(0, 'rgba(80,130,230,0.24)'); n2.addColorStop(1, 'rgba(80,130,230,0)');
          ctx.fillStyle = n2; ctx.fillRect(x, y, w, h);
          // stars — varied size + brightness, a few golden with a sparkle cross (deterministic)
          for (let gy = y + 4; gy < y + h; gy += 10)
            for (let gx = x + 4 + ((((gy - y) / 10) | 0) % 2 ? 5 : 0); gx < x + w; gx += 11) {
              const k = (gx * 17 + gy * 11) % 11;
              if (k === 3) continue; // gaps -> organic scatter
              const big = (k === 0);
              ctx.globalAlpha = 0.3 + (k % 5) / 6;
              ctx.fillStyle = big ? '#ffe9a8' : '#ffffff';
              ctx.beginPath(); ctx.arc(gx, gy, big ? 1.6 : 0.7, 0, Math.PI * 2); ctx.fill();
              if (big) {
                ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(gx - 3, gy); ctx.lineTo(gx + 3, gy);
                ctx.moveTo(gx, gy - 3); ctx.lineTo(gx, gy + 3); ctx.stroke();
              }
            }
          ctx.globalAlpha = 1;
          break;
        }
        case 'wall_bamboo': {
          const cw = 15;
          for (let cx = x + cw; cx < x + w; cx += cw) {
            ctx.strokeStyle = D(0.16); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); ctx.stroke();
            ctx.strokeStyle = L(0.10);
            ctx.beginPath(); ctx.moveTo(cx - cw * 0.4, y); ctx.lineTo(cx - cw * 0.4, y + h); ctx.stroke();
          }
          ctx.strokeStyle = D(0.12); ctx.lineWidth = 1.4;
          for (let ny = y + 18; ny < y + h; ny += 26) { ctx.beginPath(); ctx.moveTo(x, ny); ctx.lineTo(x + w, ny); ctx.stroke(); }
          break;
        }
        case 'wall_white_plank': {
          // white horizontal clapboard siding with 3D overlap shadows
          const ph = 10;
          for (let py = y; py < y + h; py += ph) {
            const pg = ctx.createLinearGradient(0, py, 0, py + ph);
            pg.addColorStop(0, 'rgba(255,255,255,0.45)');
            pg.addColorStop(0.6, 'rgba(255,255,255,0.05)');
            pg.addColorStop(1, 'rgba(0,0,0,0.05)');
            ctx.fillStyle = pg; ctx.fillRect(x, py, w, ph);
            ctx.fillStyle = night ? 'rgba(0,0,0,0.32)' : 'rgba(110,92,72,0.32)'; // overlap groove (3D depth)
            ctx.fillRect(x, py + ph - 1.6, w, 1.6);
            ctx.fillStyle = 'rgba(255,255,255,0.55)';                           // highlight lip above the groove
            ctx.fillRect(x, py + ph - 2.4, w, 0.8);
          }
          break;
        }
        default: {
          // solid colours (default/pastel/mint/navy/sunset/lavender/forest/cherry):
          // soft top-light -> base shade so the wall has gentle clay dimension
          const g = ctx.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, L(0.10)); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, D(0.12));
          ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        }
      }
      // soft shade at the floor's base to separate stacked floors
      const sh = ctx.createLinearGradient(x, y + h - 8, x, y + h);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, D(0.10));
      ctx.fillStyle = sh; ctx.fillRect(x, y + h - 8, w, 8);
      ctx.restore();
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

