    /* ═══════════════════════════════
       Farm view — outside farm with animals that produce coin drops.
       All animals eat from one shared trough (refill with coins); fed
       animals get happier and produce faster. Pure math in room-farm.js,
       constants in room-base.js, animal drawers in pets/farm-animals.js.
       Reuses the outside scene's sky/hills/fence drawers (shared globals).
       ═══════════════════════════════ */
    let isFarmView = false;
    let _farmAnimFrame = null;
    let _farmTickInterval = null;
    let _farmAnimStates = {};   // ephemeral wander state per animal id (not saved)
    let _farmParticles = [];    // floating hearts / +coins effects
    let _farmDropSeq = 0;

    // Trough position on the pasture (normalized)
    const FARM_TROUGH_X = 0.14, FARM_TROUGH_Y = 0.58;

    /* ── Farm tick (shared by load catch-up, farm open, live tick) ──
       Herd eats from the trough (happiness up/down), production clocks
       advance, spawned produce lands near its animal. Returns the number
       of drops spawned; caller decides whether to saveRoom(). Owner-only. */
    function runFarmProduction() {
      if (viewingUid !== currentUid || !(roomData.farmAnimals || []).length) return 0;
      roomData.farmDrops = roomData.farmDrops || [];
      const dropCounts = {};
      for (const d of roomData.farmDrops) dropCounts[d.animalId] = (dropCounts[d.animalId] || 0) + 1;
      const plan = planFarmTick({
        animals: roomData.farmAnimals,
        dropCounts: dropCounts,
        foodStock: roomData.farmFood || 0,
        foodAt: roomData.farmFoodAt || 0,
        now: Date.now(),
        slowMs: FARM_CYCLE_SLOW_MS,
        fastMs: FARM_CYCLE_FAST_MS,
        dropCap: FARM_DROP_CAP,
        foodPerDay: FARM_FOOD_PER_DAY,
        gainPerDay: FARM_HAPPY_GAIN_PER_DAY,
        decayPerDay: FARM_HAPPY_DECAY_PER_DAY,
      });
      roomData.farmAnimals = plan.animals;
      roomData.farmFood = plan.foodStock;
      roomData.farmFoodAt = plan.foodAt;
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
      // Herd eats + produces once a minute while the farm is open
      clearInterval(_farmTickInterval);
      _farmTickInterval = setInterval(() => {
        if (document.hidden || !isFarmView) return;
        if (runFarmProduction() > 0) saveRoom();
        renderFarmPanel(); // keep food count + happiness fresh
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

      // Food trough: stock bar + refill button (fills the trough, coins permitting)
      const food = Math.floor(roomData.farmFood || 0);
      const foodPct = Math.round((food / FARM_FOOD_MAX) * 100);
      const refillUnits = farmRefillUnits(food, FARM_FOOD_MAX, roomData.coins, FARM_FOOD_COST);
      const foodColor = foodPct > 40 ? '#6dd56d' : foodPct > 15 ? '#f2c94c' : '#eb5757';
      const foodHtml =
        '<div class="farm-section-title">🌾 Food Trough</div>' +
        '<div class="farm-food-row">' +
          '<span class="farm-herd-info">' +
            '<span class="farm-herd-name">' + food + ' / ' + FARM_FOOD_MAX + '</span>' +
            '<span class="farm-herd-bar"><span style="width:' + foodPct + '%;background:' + foodColor + '"></span></span>' +
          '</span>' +
          '<button class="farm-shop-buy" onclick="refillFarmFood()"' + (refillUnits <= 0 ? ' disabled' : '') + '>+' + refillUnits + ' · ' + (refillUnits * FARM_FOOD_COST) + '🪙</button>' +
        '</div>';

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
              const h = Math.round(a.happiness);
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

      const decorHtml =
        '<div class="farm-section-title">🌻 Decor</div>' +
        FARM_DECORS.map(def => {
          const owned = (roomData.farmDecors || []).filter(dc => dc.type === def.id).length;
          const afford = roomData.coins >= def.cost;
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + def.emoji + ' ' + def.name + ' <small>×' + owned + '</small></span>' +
            '<button class="farm-shop-buy" onclick="buyFarmDecor(\'' + def.id + '\')"' + (!afford ? ' disabled' : '') + '>' + def.cost + '🪙</button>' +
            '</div>';
        }).join('');

      panel.innerHTML =
        '<div class="farm-panel-head">🚜 Farm <span class="farm-panel-cap">' + animals.length + '/' + FARM_MAX_ANIMALS + ' animals</span></div>' +
        foodHtml + shopHtml + herdHtml + decorHtml +
        '<div class="farm-panel-hint">Keep the trough filled — fed animals are happy and produce faster! Drag decor to arrange your farm.</div>';
    }

    /* ── Actions ── */
    async function refillFarmFood() {
      if (viewingUid !== currentUid) return;
      const food = roomData.farmFood || 0;
      const units = farmRefillUnits(food, FARM_FOOD_MAX, roomData.coins, FARM_FOOD_COST);
      if (units <= 0) return showToast(roomData.coins < FARM_FOOD_COST ? 'Not enough coins!' : 'Trough is already full!', 'error');
      roomData.coins -= units * FARM_FOOD_COST;
      roomData.farmFood = food + units;
      roomData.farmFoodAt = roomData.farmFoodAt || Date.now();
      await saveRoom();
      showToast('🌾 Added ' + units + ' food to the trough!', 'success');
      renderFarmPanel();
      renderAll(); // refresh coin counter
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
        lastDropTime: now,
        posX: 0.15 + Math.random() * 0.7,
        posY: 0.55 + Math.random() * 0.3,
      });
      if (!roomData.farmFoodAt) roomData.farmFoodAt = now; // start the feeding clock
      await saveRoom();
      showToast(def.emoji + ' ' + def.name + ' joined your farm!', 'success');
      renderFarmPanel();
      renderAll(); // refresh coin counter
    }

    async function buyFarmDecor(typeId) {
      if (viewingUid !== currentUid) return;
      const def = FARM_DECORS.find(f => f.id === typeId);
      if (!def) return;
      if (roomData.coins < def.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= def.cost;
      roomData.farmDecors = roomData.farmDecors || [];
      roomData.farmDecors.push({
        id: 'fdc' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
        type: def.id,
        x: 0.15 + Math.random() * 0.7,
        y: 0.50 + Math.random() * 0.38,
      });
      await saveRoom();
      showToast(def.emoji + ' ' + def.name + ' placed — drag it anywhere!', 'success');
      renderFarmPanel();
      renderAll(); // refresh coin counter
    }

    function _collectFarmDrop(drop) {
      const def = FARM_ANIMALS.find(f => f.id === drop.type);
      const coins = def ? def.drop.coins : 0;
      roomData.farmDrops = (roomData.farmDrops || []).filter(d => d.id !== drop.id);
      roomData.coins += coins;
      _farmParticles.push({ text: '+' + coins + '🪙', x: drop.x, y: drop.y - 0.04, vy: -0.0009, life: 1300, born: performance.now() });
      saveRoom();
      renderFarmPanel(); // waiting-drop counts + affordability changed
      renderAll(); // refresh coin counter
    }

    /* ── Scene ── */
    function _farmAnimState(a) {
      if (!_farmAnimStates[a.id]) {
        _farmAnimStates[a.id] = { x: a.posX ?? 0.5, y: a.posY ?? 0.7, tx: a.posX ?? 0.5, ty: a.posY ?? 0.7, nextWander: 0, facingRight: Math.random() < 0.5, moving: false };
      }
      return _farmAnimStates[a.id];
    }

    function _drawFarmTrough(ctx, W, H, night) {
      const tx = FARM_TROUGH_X * W, ty = FARM_TROUGH_Y * H;
      const tw = Math.max(50, W * 0.10), th = tw * 0.32;
      // Legs
      ctx.fillStyle = night ? '#3a2a1a' : '#6e4e2e';
      ctx.fillRect(tx - tw * 0.38, ty, tw * 0.08, th * 0.9);
      ctx.fillRect(tx + tw * 0.30, ty, tw * 0.08, th * 0.9);
      // Box
      ctx.fillStyle = night ? '#4a3520' : '#8a5e36';
      ctx.fillRect(tx - tw / 2, ty - th, tw, th);
      ctx.strokeStyle = night ? '#2a1d10' : '#5e3e1e';
      ctx.lineWidth = 2;
      ctx.strokeRect(tx - tw / 2, ty - th, tw, th);
      // Grain fill scaled by stock
      const pct = Math.max(0, Math.min(1, (roomData.farmFood || 0) / FARM_FOOD_MAX));
      if (pct > 0) {
        ctx.fillStyle = night ? '#a8862e' : '#e8c44a';
        const gh = (th - 6) * pct;
        ctx.fillRect(tx - tw / 2 + 3, ty - 3 - gh, tw - 6, gh);
      }
      // Empty-trough alert
      if (pct === 0 && (roomData.farmAnimals || []).length) {
        ctx.font = Math.round(th * 0.8) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❗', tx, ty - th - 6);
      }
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

        _drawFarmTrough(ctx, W, H, night);

        // Decor (behind animals), drawn renderers, drag-aware
        for (const dc of (roomData.farmDecors || [])) {
          const def = FARM_DECORS.find(f => f.id === dc.type);
          if (!def) continue;
          const size = Math.max(28, Math.min(W, H) * 0.07) * (def.scale || 1);
          ctx.save();
          ctx.translate(dc.x * W, dc.y * H);
          if (_farmDragDecorId === dc.id) ctx.scale(1.15, 1.15); // lift while dragging
          drawFarmDecor(ctx, dc.type, size);
          ctx.restore();
        }

        // Drops (behind animals), gentle pulse
        ctx.textAlign = 'center';
        const pulse = 1 + Math.sin(t / 300) * 0.08;
        for (const d of (roomData.farmDrops || [])) {
          const def = FARM_ANIMALS.find(f => f.id === d.type);
          if (!def) continue;
          const size = Math.max(20, Math.min(W, H) * 0.045) * pulse;
          ctx.font = Math.round(size) + 'px sans-serif';
          ctx.fillText(def.drop.emoji, d.x * W, d.y * H);
        }

        // Animals: wander + drawn renderers, mini happiness bar above
        for (const a of (roomData.farmAnimals || [])) {
          const st = _farmAnimState(a);
          if (t > st.nextWander) {
            st.tx = 0.08 + Math.random() * 0.84;
            st.ty = 0.52 + Math.random() * 0.36;
            st.nextWander = t + 4000 + Math.random() * 8000;
          }
          const dx = st.tx - st.x, dy = st.ty - st.y;
          const dist = Math.hypot(dx, dy);
          st.moving = dist > 0.004;
          if (st.moving) {
            st.x += (dx / dist) * 0.0009;
            st.y += (dy / dist) * 0.0009;
            st.facingRight = dx > 0;
          }
          const px = st.x * W, py = st.y * H;
          const size = Math.max(34, Math.min(W, H) * 0.085);
          const bob = Math.sin(t / 400 + st.x * 20) * 2;
          ctx.save();
          ctx.translate(px, py + bob);
          if (!st.facingRight) ctx.scale(-1, 1); // drawers face right
          drawFarmAnimal(ctx, a.type, size, t / 120, st.moving);
          ctx.restore();
          // Mini happiness bar
          const h = Math.max(0, Math.min(100, a.happiness));
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
          ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x * W, (p.y + p.vy * age) * H);
          ctx.globalAlpha = 1;
        }

        if (!night) _drawClouds(ctx, W, H, t);
        _farmAnimFrame = requestAnimationFrame(frame);
      }
      _farmAnimFrame = requestAnimationFrame(frame);
      _attachFarmPointerHandlers(cvs);
    }

    /* ── Pointer handling: tap = collect/react, drag = move decor ── */
    let _farmDragDecorId = null;
    let _farmDragMoved = false;
    let _farmDragSuppressClick = false;
    let _farmDragStartX = 0, _farmDragStartY = 0;
    const FARM_DRAG_THRESHOLD = 0.03; // dead-zone: finger jitter stays a tap

    function _attachFarmPointerHandlers(cvs) {
      function pos(e) {
        const rect = cvs.getBoundingClientRect();
        const src = e.touches && e.touches[0] ? e.touches[0] : e;
        return { x: (src.clientX - rect.left) / rect.width, y: (src.clientY - rect.top) / rect.height };
      }

      function onDown(e) {
        if (viewingUid !== currentUid) return;
        const p = pos(e);
        let hit = null, hitDist = Infinity;
        for (const dc of (roomData.farmDecors || [])) {
          const dist = Math.hypot(dc.x - p.x, dc.y - p.y);
          if (dist < 0.06 && dist < hitDist) { hitDist = dist; hit = dc; }
        }
        if (!hit) return;
        _farmDragDecorId = hit.id;
        _farmDragMoved = false;
        _farmDragStartX = p.x; _farmDragStartY = p.y;
        e.stopPropagation();
        if (e.type === 'mousedown') e.preventDefault();
      }

      function onMove(e) {
        if (!_farmDragDecorId) return;
        const dc = (roomData.farmDecors || []).find(d => d.id === _farmDragDecorId);
        if (!dc) { _farmDragDecorId = null; return; }
        const p = pos(e);
        if (!_farmDragMoved) {
          const dx = p.x - _farmDragStartX, dy = p.y - _farmDragStartY;
          if (dx * dx + dy * dy < FARM_DRAG_THRESHOLD * FARM_DRAG_THRESHOLD) return;
          _farmDragMoved = true;
        }
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        dc.x = Math.max(0.04, Math.min(0.96, p.x));
        dc.y = Math.max(0.48, Math.min(0.94, p.y));
      }

      function onUp(e) {
        if (!_farmDragDecorId) return;
        if (_farmDragMoved) {
          _farmDragSuppressClick = true;
          saveRoom();
          if (e && e.cancelable) e.preventDefault();
          e.stopPropagation();
        }
        _farmDragDecorId = null;
        _farmDragMoved = false;
      }

      cvs.onmousedown = onDown;
      cvs.onmousemove = onMove;
      cvs.onmouseup = onUp;
      cvs.ontouchstart = onDown;
      cvs.ontouchmove = onMove;
      cvs.ontouchend = onUp;

      cvs.onclick = (e) => {
        if (_farmDragSuppressClick) { _farmDragSuppressClick = false; return; }
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

        // Tap an animal — a friendly reaction (happiness comes from food, not taps)
        let hitAnimal = null, aDist = Infinity;
        for (const a of (roomData.farmAnimals || [])) {
          const st = _farmAnimStates[a.id];
          if (!st) continue;
          const dist = Math.hypot(st.x - cx, st.y - cy);
          if (dist < 0.09 && dist < aDist) { aDist = dist; hitAnimal = a; }
        }
        if (hitAnimal) {
          const st = _farmAnimStates[hitAnimal.id];
          _farmParticles.push({ text: hitAnimal.happiness > 30 ? '❤️' : '🌾', x: st.x, y: st.y - 0.08, vy: -0.0008, life: 1000, born: performance.now() });
        }
      };
    }
