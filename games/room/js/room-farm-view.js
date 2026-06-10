    /* ═══════════════════════════════
       Farm view — outside farm with animals that produce coin drops.
       Pure math lives in room-farm.js; constants in room-base.js.
       Reuses the outside scene's sky/hills/fence drawers (shared globals).
       ═══════════════════════════════ */
    let isFarmView = false;
    let _farmAnimFrame = null;
    let _farmTickInterval = null;
    let _farmAnimStates = {};   // ephemeral wander state per animal id (not saved)
    let _farmParticles = [];    // floating hearts / +coins effects
    let _farmDropSeq = 0;

    /* ── Production (shared by load catch-up, farm open, live tick) ──
       Advances every animal's clock via planFarmProduction, drops spawned
       produce near its animal, and returns how many drops were spawned.
       Caller decides whether to saveRoom(). Owner-only. */
    function runFarmProduction() {
      if (viewingUid !== currentUid || !(roomData.farmAnimals || []).length) return 0;
      roomData.farmDrops = roomData.farmDrops || [];
      const dropCounts = {};
      for (const d of roomData.farmDrops) dropCounts[d.animalId] = (dropCounts[d.animalId] || 0) + 1;
      const plan = planFarmProduction({
        animals: roomData.farmAnimals,
        dropCounts: dropCounts,
        now: Date.now(),
        slowMs: FARM_CYCLE_SLOW_MS,
        fastMs: FARM_CYCLE_FAST_MS,
        dropCap: FARM_DROP_CAP,
        decayPerDay: FARM_HAPPY_DECAY_PER_DAY,
      });
      roomData.farmAnimals = plan.animals;
      for (const s of plan.spawns) {
        const a = plan.animals.find(an => an.id === s.animalId);
        roomData.farmDrops.push({
          id: 'fd' + Date.now() + '_' + (_farmDropSeq++),
          animalId: s.animalId,
          type: s.type,
          x: Math.max(0.05, Math.min(0.95, (a?.posX ?? 0.5) + (Math.random() - 0.5) * 0.18)),
          y: Math.max(0.50, Math.min(0.92, (a?.posY ?? 0.7) + (Math.random() - 0.5) * 0.12)),
        });
      }
      return plan.spawns.length;
    }

    /* ── Open / close ── */
    function openFarm() {
      if (viewingUid !== currentUid) return;
      isFarmView = true;
      document.getElementById('farmView')?.classList.add('visible');
      // Swap the room tabs for the farm panel (coins stay shared in the header)
      document.getElementById('panelWrap')?.classList.add('farm-mode');
      if (runFarmProduction() > 0) saveRoom();
      renderFarmPanel();
      drawFarmCanvas();
      // Top up produce once a minute while the farm is open
      clearInterval(_farmTickInterval);
      _farmTickInterval = setInterval(() => {
        if (document.hidden || !isFarmView) return;
        if (runFarmProduction() > 0) { saveRoom(); renderFarmPanel(); }
      }, 60 * 1000);
    }

    function closeFarm() {
      isFarmView = false;
      document.getElementById('farmView')?.classList.remove('visible');
      document.getElementById('panelWrap')?.classList.remove('farm-mode');
      cancelAnimationFrame(_farmAnimFrame);
      _farmAnimFrame = null;
      clearInterval(_farmTickInterval);
      _farmTickInterval = null;
    }

    /* ── Farm panel (own panel — replaces the room tabs while the farm is open) ── */
    function renderFarmPanel() {
      const panel = document.getElementById('farmPanel');
      if (!panel) return;
      const animals = roomData.farmAnimals || [];
      const drops = roomData.farmDrops || [];
      const counts = {}, dropCounts = {};
      for (const a of animals) counts[a.type] = (counts[a.type] || 0) + 1;
      for (const d of drops) dropCounts[d.animalId] = (dropCounts[d.animalId] || 0) + 1;
      const full = animals.length >= FARM_MAX_ANIMALS;
      const now = Date.now();

      const shopHtml =
        '<div class="farm-section-title">🛒 Animal Shop</div>' +
        FARM_ANIMALS.map(def => {
          const afford = roomData.coins >= def.cost;
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + def.emoji + ' ' + def.name + ' <small>×' + (counts[def.id] || 0) + '</small></span>' +
            '<span class="farm-shop-drop">' + def.drop.emoji + ' ' + def.drop.coins + '🪙</span>' +
            '<button class="farm-shop-buy" onclick="buyFarmAnimal(\'' + def.id + '\')"' + (full || !afford ? ' disabled' : '') + '>' + def.cost + '🪙</button>' +
            '</div>';
        }).join('');

      const herdHtml =
        '<div class="farm-section-title">🐮 My Animals</div>' +
        (!animals.length
          ? '<div class="farm-panel-empty">No animals yet — buy one above to start earning!</div>'
          : animals.map(a => {
              const def = FARM_ANIMALS.find(f => f.id === a.type);
              if (!def) return '';
              const h = Math.round(decayedHappiness(a.happiness, a.happyAt, now, FARM_HAPPY_DECAY_PER_DAY));
              const color = h > 60 ? '#6dd56d' : h > 30 ? '#f2c94c' : '#eb5757';
              const waiting = dropCounts[a.id] || 0;
              return '<div class="farm-herd-row">' +
                '<span class="farm-herd-emoji">' + def.emoji + '</span>' +
                '<span class="farm-herd-info">' +
                  '<span class="farm-herd-name">' + def.name + ' · ' + h + '%</span>' +
                  '<span class="farm-herd-bar"><span style="width:' + h + '%;background:' + color + '"></span></span>' +
                '</span>' +
                '<span class="farm-herd-drops">' + (waiting ? def.drop.emoji + ' ×' + waiting : '') + '</span>' +
                '</div>';
            }).join(''));

      panel.innerHTML =
        '<div class="farm-panel-head">🚜 Farm <span class="farm-panel-cap">' + animals.length + '/' + FARM_MAX_ANIMALS + ' animals</span></div>' +
        shopHtml + herdHtml +
        '<div class="farm-panel-hint">Pet animals daily — happy animals produce faster!</div>';
    }

    async function buyFarmAnimal(typeId) {
      if (viewingUid !== currentUid) return;
      const def = FARM_ANIMALS.find(f => f.id === typeId);
      if (!def) return;
      roomData.farmAnimals = roomData.farmAnimals || [];
      if (roomData.farmAnimals.length >= FARM_MAX_ANIMALS) return showToast('Farm is full! (' + FARM_MAX_ANIMALS + ' max)', 'error');
      if (roomData.coins < def.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= def.cost;
      const now = Date.now();
      roomData.farmAnimals.push({
        id: 'fa' + now + '_' + Math.floor(Math.random() * 1e4),
        type: def.id,
        happiness: FARM_START_HAPPINESS,
        happyAt: now,
        lastPet: 0,
        lastDropTime: now,
        posX: 0.15 + Math.random() * 0.7,
        posY: 0.55 + Math.random() * 0.3,
      });
      await saveRoom();
      showToast(def.emoji + ' ' + def.name + ' joined your farm!', 'success');
      renderFarmPanel();
      renderAll(); // refresh coin counter
    }

    /* ── Interactions ── */
    function _petFarmAnimal(animal, px, py) {
      const updated = applyPet(animal, Date.now(), {
        boost: FARM_PET_BOOST,
        cooldownMs: FARM_PET_COOLDOWN_MS,
        decayPerDay: FARM_HAPPY_DECAY_PER_DAY,
      });
      if (!updated) {
        _farmParticles.push({ text: '💤', x: px, y: py - 0.08, vy: -0.0006, life: 900, born: performance.now() });
        return;
      }
      Object.assign(animal, updated);
      for (let i = 0; i < 3; i++) {
        _farmParticles.push({ text: '❤️', x: px + (Math.random() - 0.5) * 0.06, y: py - 0.05, vy: -0.001 - Math.random() * 0.0006, life: 1200, born: performance.now() });
      }
      saveRoom();
      renderFarmPanel(); // happiness changed
    }

    function _collectFarmDrop(drop) {
      const def = FARM_ANIMALS.find(f => f.id === drop.type);
      const coins = def ? def.drop.coins : 0;
      roomData.farmDrops = (roomData.farmDrops || []).filter(d => d.id !== drop.id);
      roomData.coins += coins;
      _farmParticles.push({ text: '+' + coins + '🪙', x: drop.x, y: drop.y - 0.04, vy: -0.0009, life: 1300, born: performance.now() });
      saveRoom();
      renderFarmPanel(); // waiting-drop counts + shop affordability changed
      renderAll(); // refresh coin counter
    }

    /* ── Scene ── */
    function _farmAnimState(a) {
      if (!_farmAnimStates[a.id]) {
        _farmAnimStates[a.id] = { x: a.posX ?? 0.5, y: a.posY ?? 0.7, tx: a.posX ?? 0.5, ty: a.posY ?? 0.7, nextWander: 0, facingRight: Math.random() < 0.5 };
      }
      return _farmAnimStates[a.id];
    }

    function drawFarmCanvas() {
      cancelAnimationFrame(_farmAnimFrame);
      const view = document.getElementById('farmView');
      const cvs = document.getElementById('farmCanvas');
      if (!view || !cvs) return;
      const ctx = cvs.getContext('2d');
      let W = view.clientWidth, H = view.clientHeight;
      cvs.width = W; cvs.height = H;
      const hour = new Date().getHours();
      const night = hour >= 19 || hour < 6;
      let lastFrame = 0;

      function frame(t) {
        if (!isFarmView) return;
        if (t - lastFrame < 42) { _farmAnimFrame = requestAnimationFrame(frame); return; }
        lastFrame = t;
        const nw = view.clientWidth, nh = view.clientHeight;
        if (nw && nh && (nw !== W || nh !== H)) { W = nw; H = nh; cvs.width = W; cvs.height = H; }
        ctx.clearRect(0, 0, W, H);
        const windSway = Math.sin(t / 1400) * 0.012;

        _drawHDSky(ctx, W, H, night, t);
        _drawRollingHills(ctx, W, H, night);

        // Pasture: one big grass field from the horizon down
        const grass = ctx.createLinearGradient(0, H * 0.42, 0, H);
        grass.addColorStop(0, night ? '#1d4028' : '#7ec850');
        grass.addColorStop(1, night ? '#15301e' : '#5aa838');
        ctx.fillStyle = grass;
        ctx.fillRect(0, H * 0.42, W, H * 0.58);

        // Fence ring around the pasture
        _drawFence(ctx, W * 0.02, H * 0.46, W * 0.96, night);
        _drawFence(ctx, W * 0.02, H * 0.93, W * 0.96, night);
        _drawHDTree(ctx, W * 0.06, H * 0.46, H * 0.18, windSway, night);
        _drawHDTree(ctx, W * 0.94, H * 0.46, H * 0.15, windSway * 0.7, night);

        // Drops first (behind animals), gentle pulse
        const pulse = 1 + Math.sin(t / 300) * 0.08;
        ctx.textAlign = 'center';
        for (const d of (roomData.farmDrops || [])) {
          const def = FARM_ANIMALS.find(f => f.id === d.type);
          if (!def) continue;
          const size = Math.max(20, Math.min(W, H) * 0.045) * pulse;
          ctx.font = Math.round(size) + 'px sans-serif';
          ctx.fillText(def.drop.emoji, d.x * W, d.y * H);
        }

        // Animals: wander + bob, mini happiness bar above
        const now = Date.now();
        for (const a of (roomData.farmAnimals || [])) {
          const st = _farmAnimState(a);
          if (t > st.nextWander) {
            st.tx = 0.08 + Math.random() * 0.84;
            st.ty = 0.52 + Math.random() * 0.36;
            st.nextWander = t + 4000 + Math.random() * 8000;
          }
          const dx = st.tx - st.x, dy = st.ty - st.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.004) {
            st.x += (dx / dist) * 0.0009;
            st.y += (dy / dist) * 0.0009;
            st.facingRight = dx > 0;
          }
          const def = FARM_ANIMALS.find(f => f.id === a.type);
          if (!def) continue;
          const px = st.x * W, py = st.y * H;
          const size = Math.max(26, Math.min(W, H) * 0.065);
          const bob = Math.sin(t / 400 + st.x * 20) * 2;
          ctx.font = Math.round(size) + 'px sans-serif';
          ctx.save();
          ctx.translate(px, py + bob);
          if (st.facingRight) ctx.scale(-1, 1); // emoji animals face left by default
          ctx.fillText(def.emoji, 0, 0);
          ctx.restore();
          // Mini happiness bar
          const h = decayedHappiness(a.happiness, a.happyAt, now, FARM_HAPPY_DECAY_PER_DAY);
          const bw = size * 0.9, bx = px - bw / 2, byy = py - size * 0.95 + bob;
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fillRect(bx, byy, bw, 4);
          ctx.fillStyle = h > 60 ? '#6dd56d' : h > 30 ? '#f2c94c' : '#eb5757';
          ctx.fillRect(bx, byy, bw * (h / 100), 4);
        }

        // Floating particles (hearts, +coins)
        _farmParticles = _farmParticles.filter(p => t - p.born < p.life);
        for (const p of _farmParticles) {
          const age = t - p.born;
          ctx.globalAlpha = 1 - age / p.life;
          ctx.font = Math.round(Math.max(14, Math.min(W, H) * 0.03)) + 'px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(p.text, p.x * W, (p.y + p.vy * age) * H);
          ctx.globalAlpha = 1;
        }

        if (!night) _drawClouds(ctx, W, H, t);
        _farmAnimFrame = requestAnimationFrame(frame);
      }
      _farmAnimFrame = requestAnimationFrame(frame);
      _attachFarmClickHandler(cvs);
    }

    function _attachFarmClickHandler(cvs) {
      cvs.onclick = (e) => {
        if (viewingUid !== currentUid) return;
        const rect = cvs.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width;
        const cy = (e.clientY - rect.top) / rect.height;

        // Drops take priority (they're the payout)
        let hitDrop = null, hitDist = Infinity;
        for (const d of (roomData.farmDrops || [])) {
          const dist = Math.hypot(d.x - cx, d.y - cy);
          if (dist < 0.07 && dist < hitDist) { hitDist = dist; hitDrop = d; }
        }
        if (hitDrop) { _collectFarmDrop(hitDrop); return; }

        // Then animals (generous radius — mobile-friendly)
        let hitAnimal = null, aDist = Infinity;
        for (const a of (roomData.farmAnimals || [])) {
          const st = _farmAnimStates[a.id];
          if (!st) continue;
          const dist = Math.hypot(st.x - cx, st.y - cy);
          if (dist < 0.09 && dist < aDist) { aDist = dist; hitAnimal = a; }
        }
        if (hitAnimal) _petFarmAnimal(hitAnimal, _farmAnimStates[hitAnimal.id].x, _farmAnimStates[hitAnimal.id].y);
      };
    }
