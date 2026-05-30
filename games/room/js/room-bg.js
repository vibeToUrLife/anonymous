    /* ═══════════════════════════════
       Canvas Room Background
       ═══════════════════════════════ */
    function isNightTime() {
      const h = new Date().getHours();
      return h >= 18 || h < 6;
    }

    // Seeded stars so they don't flicker each frame
    let _nightStars = null;
    function getNightStars(count) {
      if (_nightStars && _nightStars.length === count) return _nightStars;
      _nightStars = [];
      for (let i = 0; i < count; i++) {
        _nightStars.push({
          x: Math.random(), y: Math.random() * 0.7,
          r: 0.5 + Math.random() * 1.2,
          twinkleSpeed: 1500 + Math.random() * 3000,
          ph: Math.random() * Math.PI * 2,
          driftX: (Math.random() - 0.5) * 0.00001,
          driftY: (Math.random() - 0.5) * 0.000004
        });
      }
      return _nightStars;
    }

    // Shooting star state
    let _shootingStar = null;
    function updateShootingStar(t, w, h) {
      if (!_shootingStar || t > _shootingStar.endTime) {
        // Spawn a new one every 4-8 seconds
        _shootingStar = {
          startTime: t + 500,
          endTime: t + 800 + Math.random() * 400,
          x0: Math.random() * 0.6, y0: Math.random() * 0.3,
          dx: 0.3 + Math.random() * 0.3, dy: 0.15 + Math.random() * 0.15,
          nextSpawn: t + 4000 + Math.random() * 4000
        };
        // Only actually draw every few cycles
        if (Math.random() > 0.35) _shootingStar.endTime = _shootingStar.nextSpawn;
      }
      return _shootingStar;
    }

    function drawNightSky(ctx, x, y, w, h, t) {
      // Twinkling & drifting stars
      const stars = getNightStars(25);
      stars.forEach(s => {
        const driftedX = ((s.x + t * s.driftX) % 1 + 1) % 1;
        const driftedY = ((s.y + t * s.driftY) % 0.7 + 0.7) % 0.7;
        const sx = x + driftedX * w;
        const sy = y + driftedY * h;
        const a = 0.5 + 0.4 * Math.sin(t / s.twinkleSpeed + s.ph);
        ctx.fillStyle = `rgba(255,255,240,${a})`;
        ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
        // Tiny glow around brighter stars
        if (s.r > 1) {
          ctx.fillStyle = `rgba(200,220,255,${a * 0.15})`;
          ctx.beginPath(); ctx.arc(sx, sy, s.r * 2.5, 0, Math.PI * 2); ctx.fill();
        }
      });

      // Moon with pulsing glow
      const mx = x + w * 0.75, my = y + h * 0.22, mr = Math.min(w, h) * 0.1;
      const glowPulse = 1.4 + 0.3 * Math.sin(t / 2000);
      ctx.fillStyle = `rgba(200,210,255,${0.06 + 0.02 * Math.sin(t / 2000)})`;
      ctx.beginPath(); ctx.arc(mx, my, mr * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(240,232,192,${0.12 + 0.04 * Math.sin(t / 2000)})`;
      ctx.beginPath(); ctx.arc(mx, my, mr * glowPulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0e8c0';
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      // Crescent shadow
      ctx.fillStyle = '#0b0b2e';
      ctx.beginPath(); ctx.arc(mx + mr * 0.35, my - mr * 0.15, mr * 0.85, 0, Math.PI * 2); ctx.fill();

      // Shooting star
      const ss = updateShootingStar(t, w, h);
      if (t >= ss.startTime && t < ss.endTime) {
        const prog = (t - ss.startTime) / (ss.endTime - ss.startTime);
        const sx = x + (ss.x0 + ss.dx * prog) * w;
        const sy = y + (ss.y0 + ss.dy * prog) * h;
        const tailLen = w * 0.08;
        const angle = Math.atan2(ss.dy, ss.dx);
        const tailX = sx - Math.cos(angle) * tailLen;
        const tailY = sy - Math.sin(angle) * tailLen;
        const grad = ctx.createLinearGradient(tailX, tailY, sx, sy);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,240,${0.8 * (1 - prog)})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,240,${0.9 * (1 - prog)})`;
        ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
      }

      // Wispy night clouds (dark, slow-moving)
      ctx.fillStyle = 'rgba(20,20,50,0.25)';
      const cloudT = t * 0.00003;
      for (let i = 0; i < 3; i++) {
        const cx = x + (((i * 0.35 + cloudT * (0.8 + i * 0.3)) % 1.4) - 0.2) * w;
        const cy = y + h * (0.5 + i * 0.15);
        const cw = w * (0.15 + i * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, cw * 0.3, 0, Math.PI * 2);
        ctx.arc(cx + cw * 0.25, cy - cw * 0.08, cw * 0.22, 0, Math.PI * 2);
        ctx.arc(cx + cw * 0.45, cy + cw * 0.03, cw * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Seeded birds for daytime
    let _dayBirds = null;
    function getDayBirds(count) {
      if (_dayBirds && _dayBirds.length === count) return _dayBirds;
      _dayBirds = [];
      for (let i = 0; i < count; i++) {
        _dayBirds.push({
          x: Math.random(),
          y: 0.08 + Math.random() * 0.3,
          speed: 0.00004 + Math.random() * 0.00003,
          wingSpeed: 2000 + Math.random() * 1500,
          size: 3 + Math.random() * 3,
          ph: Math.random() * Math.PI * 2
        });
      }
      return _dayBirds;
    }

    function drawDaySky(ctx, x, y, w, h, t, bgClouds) {
      // Sun with animated rays
      const sunX = x + w * 0.2, sunY = y + h * 0.18, sunR = Math.min(w, h) * 0.08;
      // Outer glow pulse
      const glowR = sunR * (2.2 + 0.3 * Math.sin(t / 1800));
      ctx.fillStyle = 'rgba(255,240,150,0.08)';
      ctx.beginPath(); ctx.arc(sunX, sunY, glowR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,245,180,0.15)';
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 1.5, 0, Math.PI * 2); ctx.fill();
      // Sun body
      ctx.fillStyle = '#ffe566';
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
      // Animated rays
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(t / 8000);
      ctx.strokeStyle = 'rgba(255,235,100,0.18)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        const rayLen = sunR * (1.4 + 0.3 * Math.sin(t / 1200 + i));
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * sunR * 1.1, Math.sin(angle) * sunR * 1.1);
        ctx.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
        ctx.stroke();
      }
      ctx.restore();

      // Clouds
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      bgClouds.forEach(c => {
        const cx = x + (((c.x + t * c.speed * 0.0001) % 1.3) - 0.15) * w;
        drawBgCloud(ctx, cx, y + c.y * h, c.w * w);
      });

      // Flying birds
      const birds = getDayBirds(4);
      ctx.strokeStyle = 'rgba(40,40,40,0.5)';
      ctx.lineWidth = 1;
      birds.forEach(b => {
        const bx = x + (((b.x + t * b.speed) % 1.3) - 0.15) * w;
        const by = y + b.y * h + Math.sin(t / 3000 + b.ph) * h * 0.03;
        const wing = Math.sin(t / b.wingSpeed + b.ph) * b.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(bx - b.size, by + wing);
        ctx.quadraticCurveTo(bx - b.size * 0.3, by - Math.abs(wing) * 0.3, bx, by);
        ctx.quadraticCurveTo(bx + b.size * 0.3, by - Math.abs(wing) * 0.3, bx + b.size, by + wing);
        ctx.stroke();
      });

      // Swaying greenery at bottom
      ctx.fillStyle = 'rgba(100,160,100,0.3)';
      ctx.beginPath(); ctx.moveTo(x, y + h);
      for (let lx = 0; lx <= w; lx += 4) {
        const sway = Math.sin(t / 2000 + lx * 0.03) * h * 0.012;
        ctx.lineTo(x + lx, y + h * 0.7 + Math.sin(lx * 0.04) * h * 0.06 + sway);
      }
      ctx.lineTo(x + w, y + h); ctx.fill();
      // Little tree silhouettes
      ctx.fillStyle = 'rgba(70,130,70,0.35)';
      const treePositions = [0.15, 0.45, 0.78];
      treePositions.forEach(tp => {
        const tx = x + tp * w;
        const ty = y + h * 0.65;
        const th = h * 0.2, tw2 = w * 0.05;
        const treeSway = Math.sin(t / 2500 + tp * 10) * tw2 * 0.1;
        ctx.beginPath();
        ctx.moveTo(tx - tw2 + treeSway, ty + th * 0.15);
        ctx.lineTo(tx + treeSway, ty - th);
        ctx.lineTo(tx + tw2 + treeSway, ty + th * 0.15);
        ctx.fill();
      });
    }

    let _bgWallCanvas = null;
    let _bgWallCacheKey = '';
    let _bgFloorCanvas = null;
    let _bgFloorCacheKey = '';
    let _lastBgFrame = 0;
    let _galaxyStars = [];
    let _marbleVeins = [];
    let _cherryBlossoms = [];

    /**
     * Renders the chosen floor pattern onto a context. Shared by the room
     * background and by shop preview thumbnails.
     * @param {CanvasRenderingContext2D} fc
     * @param {string} fp     floor pattern id (FLOOR_PATTERNS)
     * @param {number} rw,rh  canvas size
     * @param {number} floorY top of the floor area
     * @param {number} plankH plank height (used by the wood pattern)
     */
    function drawFloorPattern(fc, fp, rw, rh, floorY, plankH) {
      const top = floorY + 6, fh = rh - floorY - 6;
      const ph = plankH || fh / 7;
      if (fp === 'floor_tile') {
        const ts = Math.max(14, rw / 14);
        for (let y = top, r = 0; y < rh; y += ts, r++) {
          for (let x = 0, c = 0; x < rw; x += ts, c++) {
            fc.fillStyle = (r + c) % 2 === 0 ? '#e8e0d4' : '#b8a890';
            fc.fillRect(x, y, ts, ts);
          }
        }
        fc.strokeStyle = 'rgba(120,110,95,0.25)'; fc.lineWidth = 1;
        for (let y = top; y < rh; y += ts) { fc.beginPath(); fc.moveTo(0, y); fc.lineTo(rw, y); fc.stroke(); }
        for (let x = 0; x < rw; x += ts) { fc.beginPath(); fc.moveTo(x, top); fc.lineTo(x, rh); fc.stroke(); }
      } else if (fp === 'floor_marble') {
        const g = fc.createLinearGradient(0, top, rw, rh);
        g.addColorStop(0, '#eceaf0'); g.addColorStop(0.5, '#dcd8e2'); g.addColorStop(1, '#c8c4d2');
        fc.fillStyle = g; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(150,140,160,0.3)'; fc.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
          const x1 = (i * rw / 14); const y1 = top + (i * 23) % fh;
          fc.beginPath(); fc.moveTo(x1, y1);
          fc.bezierCurveTo(x1 + 40, y1 + 10, x1 + 80, y1 - 14, x1 + 130, y1 + 6); fc.stroke();
        }
      } else if (fp === 'floor_carpet') {
        const g = fc.createLinearGradient(0, top, 0, rh);
        g.addColorStop(0, '#c0392b'); g.addColorStop(1, '#922b21');
        fc.fillStyle = g; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(255,215,120,0.25)'; fc.lineWidth = 3;
        fc.strokeRect(8, top + 8, rw - 16, fh - 16);
        fc.strokeStyle = 'rgba(0,0,0,0.08)'; fc.lineWidth = 1;
        for (let y = top; y < rh; y += 4) { fc.beginPath(); fc.moveTo(0, y); fc.lineTo(rw, y); fc.stroke(); }
      } else if (fp === 'floor_stone') {
        fc.fillStyle = '#9a958c'; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(70,66,60,0.35)'; fc.lineWidth = 1.5;
        const ss = Math.max(26, rw / 8);
        for (let y = top, r = 0; y < rh; y += ss * 0.6, r++) {
          const off = (r % 2) * ss / 2;
          for (let x = -ss + off; x < rw; x += ss) {
            fc.strokeRect(x, y, ss - 2, ss * 0.6 - 2);
          }
        }
      } else if (fp === 'floor_grass') {
        const g = fc.createLinearGradient(0, top, 0, rh);
        g.addColorStop(0, '#6cae4a'); g.addColorStop(1, '#4e8c34');
        fc.fillStyle = g; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(40,90,30,0.4)'; fc.lineWidth = 1;
        for (let i = 0; i < rw; i += 7) {
          const gy = top + ((i * 13) % fh);
          fc.beginPath(); fc.moveTo(i, gy); fc.lineTo(i + 2, gy - 6); fc.stroke();
        }
      } else if (fp === 'floor_sand') {
        const g = fc.createLinearGradient(0, top, 0, rh);
        g.addColorStop(0, '#ecd9a8'); g.addColorStop(1, '#d8c089');
        fc.fillStyle = g; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(180,160,110,0.4)'; fc.lineWidth = 1;
        for (let y = top + 6; y < rh; y += 10) {
          fc.beginPath();
          for (let x = 0; x <= rw; x += 6) fc.lineTo(x, y + Math.sin(x * 0.08) * 3);
          fc.stroke();
        }
      } else if (fp === 'floor_galaxy') {
        const g = fc.createLinearGradient(0, top, rw, rh);
        g.addColorStop(0, '#0a0a2a'); g.addColorStop(0.5, '#1a1040'); g.addColorStop(1, '#0a0a2a');
        fc.fillStyle = g; fc.fillRect(0, top, rw, fh);
        fc.fillStyle = '#fff';
        for (let i = 0; i < 70; i++) {
          fc.globalAlpha = 0.3 + ((i * 37) % 70) / 100;
          fc.beginPath(); fc.arc((i * 53) % rw, top + (i * 29) % fh, ((i % 3) * 0.5) + 0.5, 0, Math.PI * 2); fc.fill();
        }
        fc.globalAlpha = 1;
      } else if (fp === 'floor_lava') {
        fc.fillStyle = '#2a1410'; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(255,90,20,0.6)'; fc.lineWidth = 2;
        const ls = Math.max(28, rw / 8);
        for (let y = top, r = 0; y < rh; y += ls * 0.6, r++) {
          const off = (r % 2) * ls / 2;
          for (let x = -ls + off; x < rw; x += ls) {
            fc.strokeRect(x, y, ls - 2, ls * 0.6 - 2);
          }
        }
      } else if (fp === 'floor_ice') {
        const g = fc.createLinearGradient(0, top, 0, rh);
        g.addColorStop(0, '#cfeaf5'); g.addColorStop(1, '#a8d4e8');
        fc.fillStyle = g; fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(255,255,255,0.5)'; fc.lineWidth = 1;
        for (let i = 0; i < 16; i++) {
          const x1 = (i * rw / 16), y1 = top + (i * 19) % fh;
          fc.beginPath(); fc.moveTo(x1, y1); fc.lineTo(x1 + 24, y1 - 12); fc.moveTo(x1, y1); fc.lineTo(x1 - 18, y1 - 8); fc.stroke();
        }
      } else {
        // Default wood planks
        const floorGrad = fc.createLinearGradient(0, top, 0, rh);
        floorGrad.addColorStop(0, '#b89a6e');
        floorGrad.addColorStop(0.3, '#a68a5e');
        floorGrad.addColorStop(1, '#8B7355');
        fc.fillStyle = floorGrad;
        fc.fillRect(0, top, rw, fh);
        fc.strokeStyle = 'rgba(90,70,48,0.25)';
        fc.lineWidth = 1;
        for (let i = 1; i < 7; i++) {
          const py = top + i * ph;
          fc.beginPath(); fc.moveTo(0, py); fc.lineTo(rw, py); fc.stroke();
        }
        for (let i = 0; i < 7; i++) {
          const off = (i % 2) * rw * 0.15;
          for (let x = off; x < rw; x += rw * 0.22) {
            fc.beginPath();
            fc.moveTo(x, top + i * ph);
            fc.lineTo(x, top + (i + 1) * ph);
            fc.stroke();
          }
        }
        fc.strokeStyle = 'rgba(120,90,55,0.06)';
        fc.lineWidth = 0.5;
        for (let i = 0; i < 30; i++) {
          const gx = (i * rw / 30) + 5;
          const gy = top + 4 + (i * 17) % Math.max(1, fh - 14);
          fc.beginPath();
          fc.moveTo(gx, gy);
          fc.quadraticCurveTo(gx + 15, gy + 3, gx + 30, gy - 1);
          fc.stroke();
        }
      }
    }

    function startRoomBgAnimation() {
      cancelAnimationFrame(bgAnimFrame);
      const cvs = document.getElementById('roomBgCanvas');
      if (!cvs) return;
      const room = cvs.parentElement;
      const rw = room.clientWidth, rh = room.clientHeight;
      cvs.width = rw; cvs.height = rh;
      const ctx = cvs.getContext('2d');
      initBgParticles(rw, rh);
      // Init weather
      currentWeather = getWeatherForDate();
      const wCount = currentWeather === 'snow' ? 40 : currentWeather === 'rain' ? 60 : currentWeather === 'leaves' ? 25 : currentWeather === 'petals' ? 30 : currentWeather === 'fireflies' ? 15 : currentWeather === 'sunny' ? 20 : 0;
      initWeatherParticles(currentWeather, wCount);

      const floorY = rh * 0.65;
      const plankH = (rh - floorY) / 7;

      // Pre-compute random positions for wall patterns
      _galaxyStars = Array.from({length: 60}, () => ({x: Math.random()*rw, y: Math.random()*floorY, r: 0.5 + Math.random()*1.2, a: 0.4 + Math.random()*0.6}));
      _marbleVeins = Array.from({length: 30}, () => ({x1: Math.random()*rw, cp1x: Math.random()*rw, cp2x: Math.random()*rw, x2: Math.random()*rw}));
      _cherryBlossoms = Array.from({length: 12}, () => ({x: Math.random()*rw, y: Math.random()*floorY}));
      // Invalidate wall and floor cache on resize/init
      _bgWallCacheKey = '';
      _bgFloorCanvas = null;
      _bgFloorCacheKey = '';

      function frame(t) {
        // Throttle to ~30fps to save CPU
        if (t - (_lastBgFrame || 0) < 33) { bgAnimFrame = requestAnimationFrame(frame); return; }
        _lastBgFrame = t;
        ctx.clearRect(0, 0, rw, rh);
        const nightMode = isNightTime();
        const skyTop = nightMode ? '#0b0b2e' : '#6cb4ee';
        const skyMid = nightMode ? '#141435' : '#a8d8ea';
        const skyBot = nightMode ? '#0d1a28' : '#c5e8c5';

        /* ── Wall ── */
        const wp = roomData.wallPattern || 'wall_default';
        const _wallCK = wp + ':' + rw + ':' + Math.round(floorY);
        if (_wallCK === _bgWallCacheKey && _bgWallCanvas) {
          ctx.drawImage(_bgWallCanvas, 0, 0);
        } else {
        if (wp === 'wall_brick') {
          ctx.fillStyle = '#b5745a';
          ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(180,140,110,0.3)'; ctx.lineWidth = 1;
          const bh = 14, bw = 32;
          for (let row = 0; row * bh < floorY; row++) {
            const off = (row % 2) * bw / 2;
            for (let x = -bw + off; x < rw + bw; x += bw) {
              ctx.strokeRect(x, row * bh, bw - 2, bh - 2);
            }
          }
        } else if (wp === 'wall_wood') {
          const wGrad = ctx.createLinearGradient(0, 0, 0, floorY);
          wGrad.addColorStop(0, '#a08060'); wGrad.addColorStop(1, '#7a6040');
          ctx.fillStyle = wGrad; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(60,40,20,0.12)'; ctx.lineWidth = 1;
          for (let x = 0; x < rw; x += 28) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorY); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(100,70,40,0.06)'; ctx.lineWidth = 0.5;
          for (let i = 0; i < 20; i++) {
            const gx = (i * rw / 20) + 5, gy = Math.random() * floorY;
            ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + 10, gy + 2, gx + 20, gy - 1); ctx.stroke();
          }
        } else if (wp === 'wall_stripe') {
          ctx.fillStyle = '#e0d8cc'; ctx.fillRect(0, 0, rw, floorY);
          for (let x = 0; x < rw; x += 18) {
            ctx.fillStyle = (x / 18) % 2 === 0 ? 'rgba(180,160,140,0.15)' : 'rgba(200,180,160,0.08)';
            ctx.fillRect(x, 0, 9, floorY);
          }
        } else if (wp === 'wall_dots') {
          ctx.fillStyle = '#e8e0d8'; ctx.fillRect(0, 0, rw, floorY);
          ctx.fillStyle = 'rgba(180,160,140,0.18)';
          for (let y = 8; y < floorY; y += 16) {
            for (let x = 8 + (Math.floor(y / 16) % 2) * 8; x < rw; x += 16) {
              ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
            }
          }
        } else if (wp === 'wall_diamond') {
          ctx.fillStyle = '#d8d0c4'; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(160,140,120,0.15)'; ctx.lineWidth = 1;
          const ds = 24;
          for (let y = 0; y < floorY + ds; y += ds) {
            for (let x = 0; x < rw + ds; x += ds) {
              ctx.beginPath();
              ctx.moveTo(x, y - ds/2); ctx.lineTo(x + ds/2, y); ctx.lineTo(x, y + ds/2); ctx.lineTo(x - ds/2, y);
              ctx.closePath(); ctx.stroke();
            }
          }
        } else if (wp === 'wall_pastel') {
          const pg = ctx.createLinearGradient(0, 0, rw, floorY);
          pg.addColorStop(0, '#ffd1dc'); pg.addColorStop(0.5, '#c5e1f5'); pg.addColorStop(1, '#d4f0c0');
          ctx.fillStyle = pg; ctx.fillRect(0, 0, rw, floorY);
        } else if (wp === 'wall_mint') {
          const mg = ctx.createLinearGradient(0, 0, 0, floorY);
          mg.addColorStop(0, '#b8e8d0'); mg.addColorStop(1, '#8cc8a8');
          ctx.fillStyle = mg; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(100,160,130,0.06)'; ctx.lineWidth = 1;
          for (let y = 0; y < floorY; y += 18) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rw, y); ctx.stroke();
          }
        } else if (wp === 'wall_navy') {
          const ng = ctx.createLinearGradient(0, 0, 0, floorY);
          ng.addColorStop(0, '#2c3e6b'); ng.addColorStop(1, '#1a2744');
          ctx.fillStyle = ng; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(60,80,120,0.12)'; ctx.lineWidth = 1;
          for (let y = 0; y < floorY; y += 18) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rw, y); ctx.stroke();
          }
        } else if (wp === 'wall_sunset') {
          const sg = ctx.createLinearGradient(0, 0, 0, floorY);
          sg.addColorStop(0, '#ff7b54'); sg.addColorStop(0.4, '#ffb26b'); sg.addColorStop(0.7, '#ffd56b'); sg.addColorStop(1, '#e8ddd0');
          ctx.fillStyle = sg; ctx.fillRect(0, 0, rw, floorY);
        } else if (wp === 'wall_marble') {
          ctx.fillStyle = '#e8e4e0'; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(160,140,130,0.08)'; ctx.lineWidth = 0.8;
          _marbleVeins.forEach(v => {
            ctx.beginPath(); ctx.moveTo(v.x1, 0);
            ctx.bezierCurveTo(v.cp1x, floorY*0.3, v.cp2x, floorY*0.7, v.x2, floorY);
            ctx.stroke();
          });
        } else if (wp === 'wall_lavender') {
          const lg = ctx.createLinearGradient(0, 0, 0, floorY);
          lg.addColorStop(0, '#c8a8e8'); lg.addColorStop(1, '#a888c8');
          ctx.fillStyle = lg; ctx.fillRect(0, 0, rw, floorY);
        } else if (wp === 'wall_forest') {
          const fg = ctx.createLinearGradient(0, 0, 0, floorY);
          fg.addColorStop(0, '#3a6b4a'); fg.addColorStop(1, '#2a4a3a');
          ctx.fillStyle = fg; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(80,140,90,0.08)'; ctx.lineWidth = 1;
          for (let y = 0; y < floorY; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rw, y); ctx.stroke(); }
        } else if (wp === 'wall_galaxy') {
          const gg = ctx.createLinearGradient(0, 0, rw, floorY);
          gg.addColorStop(0, '#0a0a2a'); gg.addColorStop(0.3, '#1a1040'); gg.addColorStop(0.7, '#0a1030'); gg.addColorStop(1, '#0a0a2a');
          ctx.fillStyle = gg; ctx.fillRect(0, 0, rw, floorY);
          ctx.fillStyle = '#fff';
          _galaxyStars.forEach(s => {
            ctx.globalAlpha = s.a;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
          });
          ctx.globalAlpha = 1;
        } else if (wp === 'wall_bamboo') {
          ctx.fillStyle = '#d8cc98'; ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(140,120,60,0.18)'; ctx.lineWidth = 3;
          for (let x = 10; x < rw; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorY); ctx.stroke(); }
          ctx.strokeStyle = 'rgba(100,90,40,0.12)'; ctx.lineWidth = 0.8;
          for (let x = 10; x < rw; x += 22) for (let y = 15; y < floorY; y += 20) { ctx.beginPath(); ctx.moveTo(x-4, y); ctx.lineTo(x+4, y); ctx.stroke(); }
        } else if (wp === 'wall_cherry') {
          const cg = ctx.createLinearGradient(0, 0, 0, floorY);
          cg.addColorStop(0, '#fce4ec'); cg.addColorStop(1, '#f8bbd0');
          ctx.fillStyle = cg; ctx.fillRect(0, 0, rw, floorY);
          ctx.font = '14px sans-serif'; ctx.globalAlpha = 0.25;
          _cherryBlossoms.forEach(b => ctx.fillText('🌸', b.x, b.y));
          ctx.globalAlpha = 1;
        } else {
          // Default wall
          const wallGrad = ctx.createLinearGradient(0, 0, 0, floorY);
          wallGrad.addColorStop(0, '#c8dff0');
          wallGrad.addColorStop(0.5, '#d6e5ee');
          wallGrad.addColorStop(1, '#e8ddd0');
          ctx.fillStyle = wallGrad;
          ctx.fillRect(0, 0, rw, floorY);
          ctx.strokeStyle = 'rgba(180,170,155,0.06)';
          ctx.lineWidth = 1;
          for (let y = 0; y < floorY; y += 18) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rw, y); ctx.stroke();
          }
        }
        // Cache the wall drawing for future frames
        if (!_bgWallCanvas) _bgWallCanvas = document.createElement('canvas');
        _bgWallCanvas.width = rw;
        _bgWallCanvas.height = Math.ceil(floorY);
        _bgWallCanvas.getContext('2d').drawImage(cvs, 0, 0, rw, Math.ceil(floorY), 0, 0, rw, Math.ceil(floorY));
        _bgWallCacheKey = _wallCK;
        } // end wall cache miss

        /* ── Window (conditional on style) ── */
        const winStyle = roomData.windowStyle || 'win_classic';
        if (winStyle !== 'win_none') {
        let winW, winH, winX, winY;
        if (winStyle === 'win_large') {
          winW = rw * 0.26; winH = rh * 0.38;
        } else if (winStyle === 'win_double') {
          winW = rw * 0.32; winH = rh * 0.3;
        } else if (winStyle === 'win_skylight') {
          winW = rw * 0.30; winH = rh * 0.15;
        } else if (winStyle === 'win_porthole') {
          winW = rw * 0.14; winH = rw * 0.14;
        } else {
          winW = rw * 0.18; winH = rh * 0.3;
        }
        winX = rw * 0.5 - winW / 2; winY = rh * 0.04;

        if (winStyle === 'win_round') {
          // Round window
          const cr = Math.min(winW, winH) * 0.45;
          const cx = rw * 0.5, cy = winY + cr + 5;
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.beginPath(); ctx.arc(cx + 2, cy + 3, cr + 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8B7355';
          ctx.beginPath(); ctx.arc(cx, cy, cr + 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#a08868';
          ctx.beginPath(); ctx.arc(cx, cy, cr + 2, 0, Math.PI * 2); ctx.fill();
          // Sky
          ctx.save();
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.clip();
          const skyG = ctx.createLinearGradient(cx, cy - cr, cx, cy + cr);
          skyG.addColorStop(0, skyTop); skyG.addColorStop(0.6, skyMid); skyG.addColorStop(1, skyBot);
          ctx.fillStyle = skyG; ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
          if (nightMode) {
            drawNightSky(ctx, cx - cr, cy - cr, cr * 2, cr * 2, t);
          } else {
            drawDaySky(ctx, cx - cr, cy - cr, cr * 2, cr * 2, t, bgClouds);
          }
          ctx.restore();
          // Cross
          ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx, cy - cr); ctx.lineTo(cx, cy + cr);
          ctx.moveTo(cx - cr, cy); ctx.lineTo(cx + cr, cy); ctx.stroke();
        } else if (winStyle === 'win_arch') {
          // Arched window
          const archR = winW / 2;
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(winX - 2, winY + 4, winW + 4, winH + 4);
          ctx.fillStyle = '#8B7355';
          ctx.beginPath();
          ctx.moveTo(winX - 5, winY + winH + 5); ctx.lineTo(winX - 5, winY + archR);
          ctx.arc(winX + archR, winY + archR, archR + 5, Math.PI, 0);
          ctx.lineTo(winX + winW + 5, winY + winH + 5); ctx.fill();
          ctx.fillStyle = '#a08868';
          ctx.beginPath();
          ctx.moveTo(winX - 2, winY + winH + 2); ctx.lineTo(winX - 2, winY + archR);
          ctx.arc(winX + archR, winY + archR, archR + 2, Math.PI, 0);
          ctx.lineTo(winX + winW + 2, winY + winH + 2); ctx.fill();
          // Sky
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(winX, winY + winH); ctx.lineTo(winX, winY + archR);
          ctx.arc(winX + archR, winY + archR, archR, Math.PI, 0);
          ctx.lineTo(winX + winW, winY + winH); ctx.clip();
          const skyG = ctx.createLinearGradient(winX, winY, winX, winY + winH);
          skyG.addColorStop(0, skyTop); skyG.addColorStop(0.6, skyMid); skyG.addColorStop(1, skyBot);
          ctx.fillStyle = skyG; ctx.fillRect(winX, winY, winW, winH);
          if (nightMode) {
            drawNightSky(ctx, winX, winY, winW, winH, t);
            ctx.fillStyle = 'rgba(30,50,30,0.35)';
            ctx.beginPath(); ctx.moveTo(winX, winY + winH);
            for (let x = 0; x <= winW; x += 4) ctx.lineTo(winX + x, winY + winH * 0.7 + Math.sin(x * 0.04) * winH * 0.06);
            ctx.lineTo(winX + winW, winY + winH); ctx.fill();
          } else {
            drawDaySky(ctx, winX, winY, winW, winH, t, bgClouds);
          }
          ctx.restore();
          // Cross
          ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH);
          ctx.moveTo(winX, winY + winH * 0.5); ctx.lineTo(winX + winW, winY + winH * 0.5); ctx.stroke();
          // Sill
          ctx.fillStyle = '#a08868';
          roundRectPath(ctx, winX - 8, winY + winH, winW + 16, 7, 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(winX - 6, winY + winH, winW + 12, 2);
        } else if (winStyle === 'win_skylight') {
          // Wide horizontal skylight at top
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(winX - 2, winY + 4, winW + 4, winH + 4);
          ctx.fillStyle = '#8B7355'; ctx.fillRect(winX - 5, winY - 5, winW + 10, winH + 10);
          ctx.fillStyle = '#a08868'; ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);
          const skyG = ctx.createLinearGradient(winX, winY, winX, winY + winH);
          skyG.addColorStop(0, skyTop); skyG.addColorStop(1, skyMid);
          ctx.fillStyle = skyG; ctx.fillRect(winX, winY, winW, winH);
          ctx.save(); ctx.beginPath(); ctx.rect(winX, winY, winW, winH); ctx.clip();
          if (nightMode) { drawNightSky(ctx, winX, winY, winW, winH, t); }
          else { drawDaySky(ctx, winX, winY, winW, winH, t, bgClouds); }
          ctx.restore();
          // Sun/moon glow
          ctx.fillStyle = nightMode ? 'rgba(200,210,230,0.15)' : 'rgba(255,255,200,0.2)';
          ctx.beginPath(); ctx.arc(winX + winW * 0.7, winY + winH * 0.4, winH * 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(winX + winW * 0.33, winY); ctx.lineTo(winX + winW * 0.33, winY + winH);
          ctx.moveTo(winX + winW * 0.66, winY); ctx.lineTo(winX + winW * 0.66, winY + winH); ctx.stroke();
          ctx.fillStyle = '#a08868'; roundRectPath(ctx, winX - 8, winY + winH, winW + 16, 5, 2); ctx.fill();
        } else if (winStyle === 'win_stained') {
          // Tall stained glass window
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(winX - 2, winY + 4, winW + 4, winH + 4);
          ctx.fillStyle = '#8B7355'; ctx.fillRect(winX - 5, winY - 5, winW + 10, winH + 10);
          ctx.fillStyle = '#a08868'; ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);
          const stColors = ['rgba(255,107,107,0.6)','rgba(78,205,196,0.6)','rgba(255,230,109,0.6)','rgba(168,85,247,0.6)','rgba(96,165,250,0.6)'];
          const segH = winH / stColors.length;
          for (let i = 0; i < stColors.length; i++) {
            ctx.fillStyle = stColors[i]; ctx.fillRect(winX, winY + i * segH, winW, segH);
          }
          ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH);
          for (let i = 1; i < stColors.length; i++) { ctx.moveTo(winX, winY + i * segH); ctx.lineTo(winX + winW, winY + i * segH); }
          ctx.stroke();
          // Colored light cast
          ctx.save(); ctx.globalAlpha = 0.08;
          for (let i = 0; i < stColors.length; i++) {
            ctx.fillStyle = stColors[i]; ctx.fillRect(winX - 10, winY + winH + 5 + i * 8, winW + 20, 8);
          }
          ctx.restore();
          ctx.fillStyle = '#a08868'; roundRectPath(ctx, winX - 8, winY + winH, winW + 16, 7, 2); ctx.fill();
        } else if (winStyle === 'win_porthole') {
          // Small circular porthole
          const pr = Math.min(winW, winH) * 0.45;
          const px = rw * 0.5, py = winY + pr + 8;
          ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.arc(px+2, py+3, pr+7, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#6d5a42'; ctx.beginPath(); ctx.arc(px, py, pr + 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8B7355'; ctx.beginPath(); ctx.arc(px, py, pr + 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#a08868'; ctx.beginPath(); ctx.arc(px, py, pr + 2, 0, Math.PI * 2); ctx.fill();
          ctx.save();
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
          const skyG = ctx.createLinearGradient(px, py - pr, px, py + pr);
          skyG.addColorStop(0, skyTop); skyG.addColorStop(0.6, skyMid); skyG.addColorStop(1, skyBot);
          ctx.fillStyle = skyG; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
          if (nightMode) { drawNightSky(ctx, px - pr, py - pr, pr * 2, pr * 2, t); }
          else { drawDaySky(ctx, px - pr, py - pr, pr * 2, pr * 2, t, bgClouds); }
          ctx.restore();
          ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(px - pr, py); ctx.lineTo(px + pr, py);
          ctx.moveTo(px, py - pr); ctx.lineTo(px, py + pr); ctx.stroke();
        } else {
          // Classic / Large / Double — rectangular window
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(winX - 2, winY + 4, winW + 4, winH + 4);
          ctx.fillStyle = '#8B7355';
          ctx.fillRect(winX - 5, winY - 5, winW + 10, winH + 10);
          ctx.fillStyle = '#a08868';
          ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);
          const skyGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
          skyGrad.addColorStop(0, skyTop); skyGrad.addColorStop(0.6, skyMid); skyGrad.addColorStop(1, skyBot);
          ctx.fillStyle = skyGrad;
          ctx.fillRect(winX, winY, winW, winH);
          ctx.save();
          ctx.beginPath(); ctx.rect(winX, winY, winW, winH); ctx.clip();
          if (nightMode) {
            drawNightSky(ctx, winX, winY, winW, winH, t);
            ctx.fillStyle = 'rgba(30,50,30,0.35)';
            ctx.beginPath(); ctx.moveTo(winX, winY + winH);
            for (let x = 0; x <= winW; x += 4) ctx.lineTo(winX + x, winY + winH * 0.7 + Math.sin(x * 0.04) * winH * 0.06);
            ctx.lineTo(winX + winW, winY + winH); ctx.fill();
          } else {
            drawDaySky(ctx, winX, winY, winW, winH, t, bgClouds);
          }
          ctx.restore();
          // Cross bars
          ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 3;
          ctx.beginPath();
          if (winStyle === 'win_double') {
            // Two panes side by side
            ctx.moveTo(winX + winW / 3, winY); ctx.lineTo(winX + winW / 3, winY + winH);
            ctx.moveTo(winX + winW * 2 / 3, winY); ctx.lineTo(winX + winW * 2 / 3, winY + winH);
            ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2);
          } else {
            ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH);
            ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2);
          }
          ctx.stroke();
          // Sill
          ctx.fillStyle = '#a08868';
          roundRectPath(ctx, winX - 8, winY + winH, winW + 16, 7, 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(winX - 6, winY + winH, winW + 12, 2);
        }

        /* ── Sunlight / Moonlight beam from window ── */
        ctx.save();
        if (nightMode) {
          ctx.globalAlpha = 0.025 + Math.sin(t / 4000) * 0.008;
          ctx.fillStyle = '#b0c4de';
        } else {
          ctx.globalAlpha = 0.04 + Math.sin(t / 3000) * 0.01;
          ctx.fillStyle = '#fffbe0';
        }
        ctx.beginPath();
        ctx.moveTo(winX, winY + winH + 7);
        ctx.lineTo(winX + winW, winY + winH + 7);
        ctx.lineTo(winX + winW + rw * 0.1, rh);
        ctx.lineTo(winX - rw * 0.05, rh);
        ctx.fill();
        ctx.restore();
        // ── Weather effects on window ──
        if (weatherParticles.length && typeof winX !== 'undefined') {
          drawWeatherEffects(ctx, rw, rh, winX, winY, winW, winH, t);
        }
        } // end if winStyle !== 'win_none'

        /* ── Wall Decorations (drawn over wall, before baseboard) ── */
        drawWallDecorations(ctx, rw, rh, floorY, t);

        /* ── Baseboard + Floor (cached, keyed by floor style) ── */
        const fp = roomData.floorStyle || 'floor_wood';
        const _floorCK = fp + ':' + rw + ':' + Math.round(rh) + ':' + Math.round(floorY);
        if (_floorCK !== _bgFloorCacheKey) {
          _bgFloorCanvas = document.createElement('canvas');
          _bgFloorCanvas.width = rw;
          _bgFloorCanvas.height = rh;
          const fc = _bgFloorCanvas.getContext('2d');
          // Baseboard strip
          fc.fillStyle = '#6d5a42';
          fc.fillRect(0, floorY - 2, rw, 8);
          fc.fillStyle = 'rgba(255,255,255,0.06)';
          fc.fillRect(0, floorY - 2, rw, 2);
          drawFloorPattern(fc, fp, rw, rh, floorY, plankH);
          _bgFloorCacheKey = _floorCK;
        }
        ctx.drawImage(_bgFloorCanvas, 0, 0);

        /* ── Oval rug (dynamic based on placed rug decor) ── */
        drawRug(ctx, rw, rh, floorY);

        /* ── Floor Decorations ── */
        drawFloorDecorations(ctx, rw, rh, floorY, t);

        /* ── Floating dust motes ── */
        bgDust.forEach(p => {
          const px = p.x * rw + Math.sin(t / 2500 + p.ph) * 18;
          const py = p.y * rh + Math.cos(t / 3500 + p.ph) * 12;
          const a = 0.12 + Math.sin(t / 1200 + p.ph) * 0.08;
          ctx.fillStyle = nightMode ? `rgba(180,200,255,${a * 0.6})` : `rgba(255,255,230,${a})`;
          ctx.beginPath(); ctx.arc(px, py, p.sz, 0, Math.PI * 2); ctx.fill();
        });

        /* ── Night ambient overlay ── */
        if (nightMode) {
          ctx.save();
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = '#0a0a2a';
          ctx.fillRect(0, 0, rw, rh);
          ctx.restore();
        }

        bgAnimFrame = requestAnimationFrame(frame);
      }
      bgAnimFrame = requestAnimationFrame(frame);
    }

