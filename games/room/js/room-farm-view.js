    /* ═══════════════════════════════
       Farm view — outside farm with animals that produce coin drops.
       All animals eat from one shared trough (refill with coins); fed
       animals get happier and produce faster. Pure math in room-farm.js,
       constants in room-base.js, animal drawers in pets/farm-animals.js.
       Reuses the outside scene's sky/hills/fence drawers (shared globals).
       ═══════════════════════════════ */
    let isFarmView = false;
    let _farmTab = 'animals';   // active sub-tab inside the farm's own tab bar
    let _farmVisitRooms = null; // cached "other farms" list (null = not loaded yet)
    let _farmVisitUnsub = null; // live subscription to the rooms list (while a farm is open)
    let _farmAnimFrame = null;
    let _farmTickInterval = null;
    let _farmAwayPlan = null;   // pending "while you were away" offline produce (awaiting collect)
    let _farmAnimStates = {};   // ephemeral wander state per animal id (not saved)
    let _farmParticles = [];    // floating hearts / +coins effects
    let _farmDropSeq = 0;
    let _plantRow = 0;           // grid row the crop picker is planting into
    let _pendingPlant = null;    // { row, cropId, count } awaiting partial-plant confirm
    let _farmHerdCollapsed = null; // null = auto; true/false once the user toggles
    const FARM_HERD_COLLAPSE_AT = 4; // herd longer than this auto-collapses the list
    let _farmProduceCollapsed = null; // null = auto; true/false once the user toggles
    const FARM_PRODUCE_COLLAPSE_AT = 4; // produce list longer than this auto-collapses
    let _farmButcherConfirmId = null; // animal id awaiting butcher confirmation
    let _cartSheetOpen = false;       // merchant-cart sell sheet visible?
    let _cartSold = {};               // units sold per item this visit (enforces the quota)
    let _cartVisitKey = -1;           // visitStart of the run _cartSold belongs to
    let _cartLeaveStart = 0;          // Date.now() when the wagon began rolling off (0 = not leaving)
    const CART_LEAVE_MS = 1600;       // roll-off animation length
    let _animalModalId = null;        // animal whose status panel is open
    let _animalButcherConfirm = false;// awaiting butcher confirmation in the animal panel
    let _lastProduceN = -1;           // last pending-produce count shown on the Collect button
    let _workshopModalOpen = false;   // single-machine modal visible?
    let _workshopModalId = null;      // which machine's modal is open
    let _makeChoiceSlot = null;       // slot index currently choosing a recipe (or null)
    let _slotConfirm = false;         // awaiting confirmation to open (buy) a new slot
    const FARM_CART_X = 0.84, FARM_CART_Y = 0.24; // where the sky merchant plane hovers (normalized; up in the sky band)

    // Trough position on the pasture (normalized)
    const FARM_TROUGH_X = 0.14, FARM_TROUGH_Y = 0.58;

    /* ── Farm tick (shared by load catch-up, farm open, live tick) ──
       Herd eats from the trough (happiness up/down), production clocks
       advance, spawned produce lands near its animal. Returns the number
       of drops spawned; caller decides whether to saveRoom(). Owner-only. */
    function runFarmProduction() {
      if (viewingUid !== currentUid || !(roomData.farmAnimals || []).length) return 0;
      roomData.farmDrops = roomData.farmDrops || [];
      // Produce is pooled PER ANIMAL TYPE and capped at FARM_PRODUCE_CAP. Feed the
      // type pool to planFarmTick (per-animal) so a type's animals stop at the cap.
      const typeCount = {};
      for (const d of roomData.farmDrops) typeCount[d.type] = (typeCount[d.type] || 0) + 1;
      const dropCounts = {};
      for (const a of roomData.farmAnimals) dropCounts[a.id] = typeCount[a.type] || 0;
      const plan = planFarmTick({
        animals: roomData.farmAnimals,
        dropCounts: dropCounts,
        foodStock: roomData.farmFood || 0,
        foodAt: roomData.farmFoodAt || 0,
        now: Date.now(),
        slowMs: FARM_CYCLE_SLOW_MS,
        fastMs: FARM_CYCLE_FAST_MS,
        dropCap: FARM_PRODUCE_CAP,
        foodPerDay: FARM_FOOD_PER_DAY,
        gainPerDay: FARM_HAPPY_GAIN_PER_DAY,
        decayPerDay: FARM_HAPPY_DECAY_PER_DAY,
        levels: FARM_LEVELS,
        levelSpeedup: FARM_LEVEL_SPEEDUP,
        capMs: FARM_OFFLINE_CAP_MS,   // cap any single catch-up at 3h (live ticks are tiny, so unaffected)
      });
      roomData.farmAnimals = plan.animals;
      roomData.farmFood = plan.foodStock;
      roomData.farmFoodAt = plan.foodAt;
      let added = 0;
      const live = Object.assign({}, typeCount);
      for (const s of plan.spawns) {
        if ((live[s.type] || 0) >= FARM_PRODUCE_CAP) continue;   // this type's pool is full
        live[s.type] = (live[s.type] || 0) + 1; added++;
        const a = plan.animals.find(an => an.id === s.animalId);
        roomData.farmDrops.push({
          id: 'fd' + Date.now() + '_' + (_farmDropSeq++),
          animalId: s.animalId,
          type: s.type,
          x: Math.max(0.05, Math.min(0.95, (a?.posX ?? 0.5) + (Math.random() - 0.5) * 0.18)),
          y: Math.max(0.50, Math.min(0.92, (a?.posY ?? 0.7) + (Math.random() - 0.5) * 0.12)),
        });
      }
      if (roomData.farmAutoCollect) _autoCollectAll(); // straight into stock, no tapping
      return added;
    }

    // Current trough capacity (base + upgrades).
    function farmFoodMax() {
      return FARM_FOOD_MAX + (roomData.farmTroughLevel || 0) * FARM_TROUGH_STEP;
    }

    // Current animal cap (base + expansions).
    function farmAnimalCap() {
      return FARM_MAX_ANIMALS + 10 * (roomData.farmCapLevel || 0);
    }

    // Screen-normalized position of garden plot index i. Plots sit in rows of 7
    // across the soil strip, shifted right to leave room for the row signboard.
    function _farmPlotPos(i) {
      const perRow = 7;
      const col = i % perRow, row = Math.floor(i / perRow);
      return { x: 0.20 + col * 0.088, y: 0.72 + row * 0.066 };
    }

    // Normalized position of the signboard sitting to the LEFT of grid row `row`.
    function _farmSignPos(row) {
      return { x: 0.085, y: 0.72 + row * 0.066 };
    }

    // Local YYYY-MM-DD for the daily orders seed.
    function _farmToday() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    // Today's deterministic delivery orders (same for everyone that day).
    function _farmOrders() {
      const prices = farmProductPrices();
      const prods = FARM_ORDER_PRODUCTS.map(id => ({ id: id, coins: prices[id] || 0 }));
      return generateFarmOrders(_farmToday(), prods, FARM_ORDER_COUNT, FARM_ORDER_MARKUP, FARM_ORDER_BONUS);
    }
    // Roll the order board over to a new day; returns true if it changed.
    function _ensureFarmOrders() {
      const today = _farmToday();
      if (roomData.farmOrdersDay !== today) {
        roomData.farmOrdersDay = today;
        roomData.farmOrdersDone = [];
        return true;
      }
      return false;
    }

    // Coat-variant palette for an animal (null = default colours).
    function _farmVariantPal(a) {
      const list = (typeof FARM_VARIANTS !== 'undefined' && FARM_VARIANTS[a.type]) || [];
      const v = list.find(x => x.id === a.variant);
      return v ? (v.pal || null) : null;
    }

    // Move every ground drop into stock (+XP). Used by the Auto-Collector and on
    // offline catch-up when it's owned. Returns how many were collected.
    function _autoCollectAll() {
      const drops = roomData.farmDrops || [];
      if (!drops.length) return 0;
      roomData.farmStock = roomData.farmStock || {};
      for (const d of drops) {
        const def = FARM_ANIMALS.find(f => f.id === d.type);
        const pid = def ? def.drop.id : d.type;
        roomData.farmStock[pid] = (roomData.farmStock[pid] || 0) + 1;
        roomData.farmTotalCollected = (roomData.farmTotalCollected || 0) + 1;
        const a = (roomData.farmAnimals || []).find(an => an.id === d.animalId);
        if (a) a.collected = (a.collected || 0) + 1;
      }
      const n = drops.length;
      roomData.farmDrops = [];
      return n;
    }

    /* ── Open / close ── */
    // Swap the room tabs/panels for the farm panel (coins stay shared in the
    // header). Driven by inline styles AND a class so it works even if a stale
    // room.css is cached — inline styles always win over the stylesheet.
    function _setFarmPanelMode(on) {
      const wrap = document.getElementById('panelWrap');
      if (wrap) wrap.classList.toggle('farm-mode', on);
      // In the farm, the room's tabs are replaced by the farm's own tab bar.
      const tabs = document.getElementById('tabsBar');
      if (tabs) tabs.style.display = on ? 'none' : '';
      document.querySelectorAll('#panelWrap .tab-panel').forEach(p => { p.style.display = on ? 'none' : ''; });
      const fp = document.getElementById('farmPanel');
      if (fp) fp.style.display = on ? 'block' : 'none';
    }

    function switchFarmTab(id) { _farmTab = id; renderFarmPanel(); }

    /* ── Visit other players' farms (read-only) ── */

    // Live list of other players (same rooms query the room's Visit tab uses).
    // Idempotent: subscribes once per farm session; the listener detaches in
    // closeFarm. The cache is kept across the visitRoom→openFarm hop so the list
    // never flickers back to "loading".
    function _subFarmVisitList() {
      if (_farmVisitUnsub || typeof db === 'undefined') return;
      try {
        _farmVisitUnsub = db.collection('rooms').orderBy('updatedAt', 'desc').limit(20)
          .onSnapshot(function (snap) {
            const rooms = [], now = Date.now();
            snap.forEach(function (doc) {
              if (doc.id === currentUid) return;                 // never list myself
              const d = doc.data();
              rooms.push({ uid: doc.id, name: d.displayName, animals: (d.farmAnimals || []).length, online: !!(d.lastSeen && (now - d.lastSeen) < 60000) });
            });
            rooms.sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0); });   // online first
            _farmVisitRooms = rooms;
            // Repaint only if the list is currently on screen.
            if (isFarmView && (viewingUid !== currentUid || _farmTab === 'visit')) renderFarmPanel();
          }, function () {});
      } catch (e) {}
    }
    function _unsubFarmVisitList() {
      if (_farmVisitUnsub) { _farmVisitUnsub(); _farmVisitUnsub = null; }   // keep _farmVisitRooms cache
    }

    function _farmVisitListHtml() {
      _subFarmVisitList();
      if (_farmVisitRooms == null) return '<div class="farm-panel-empty">加载农场列表中…</div>';
      if (!_farmVisitRooms.length) return '<div class="farm-panel-empty">暂时没有其他农场可参观。</div>';
      return _farmVisitRooms.map(function (r) {
        const peek = r.animals ? '🐮 ×' + r.animals : '<span style="opacity:.5">空农场</span>';
        return '<div class="farm-visit-row" onclick="visitFarm(\'' + r.uid + '\')">' +
          '<span class="farm-visit-emoji">🚜</span>' +
          '<span class="farm-visit-info">' +
            '<span class="farm-visit-name">' + (r.online ? '🟢 ' : '') + escapeHtml(r.name || 'Anonymous') + '</span>' +
            '<span class="farm-visit-peek">' + peek + '</span>' +
          '</span>' +
          '<span class="farm-visit-go">›</span>' +
        '</div>';
      }).join('');
    }

    // Go to a player's farm (or back to your own when uid === currentUid):
    // visitRoom loads their data + lands in their room, then we reopen the farm.
    async function visitFarm(uid) {
      if (typeof visitRoom !== 'function') return;
      await visitRoom(uid);
      openFarm();
    }

    function openFarm() {
      isFarmView = true;
      document.getElementById('farmView')?.classList.add('visible');
      _setFarmPanelMode(true);
      _syncRoomPanel();   // hide the side panel; widens the stage before we draw
      if (viewingUid === currentUid) {
        if ((roomData.farmDecors || []).length) roomData.farmDecors = []; // decor feature removed
        _ensureFarmOrders();
        // Offline "while you were away" produce (capped at 3h). Owner only.
        const off = _offlinePlan();
        if (off.total > 0 && off.awayMs >= FARM_OFFLINE_MODAL_MS && !roomData.farmAutoCollect) {
          // Mandatory collect modal — gate the farm until the player collects.
          renderFarmPanel();
          drawFarmCanvas();
          _showFarmAway(off);
          return;
        }
        // Short trip, or Auto-Collector owned → bank it straight away, no modal.
        if (off.total > 0) {
          _applyOfflinePlan(off);
          if (off.awayMs >= FARM_OFFLINE_MODAL_MS) {
            const _n = off.total;
            setTimeout(function () { showToast('🤖 Auto-Collector banked ' + _n + ' produce while you were away!', 'success'); }, 600);
          }
        }
        saveRoom();
      }
      _startFarmLive();
    }

    // Render the farm + start the once-a-minute live production tick (owner only).
    function _startFarmLive() {
      renderFarmPanel();
      drawFarmCanvas();
      clearInterval(_farmTickInterval);
      if (viewingUid === currentUid) {
        _farmTickInterval = setInterval(() => {
          if (document.hidden || !isFarmView) return;
          if (runFarmProduction() > 0) saveRoom();
          renderFarmPanel(); // keep food count + happiness fresh
          renderWorkshopModal(); // flip a just-finished job to ✅ Collect if its modal is open
        }, 60 * 1000);
      }
    }

    // Compute (WITHOUT applying) the offline produce since the farm was last active,
    // capped at FARM_OFFLINE_CAP_MS (3h). Pure time cap — no per-type count cap — so
    // the only offline limit is time. Returns { plan, batch:{prodId:count}, total, awayMs }.
    function _offlinePlan() {
      const now = Date.now();
      const animals = roomData.farmAnimals || [];
      let lastActive = 0;
      for (const a of animals) lastActive = Math.max(lastActive, a.lastDropTime || 0);
      const awayMs = lastActive ? (now - lastActive) : 0;
      const plan = planFarmTick({
        animals: animals,
        dropCounts: {},          // ignore the field-drop count cap; time is the only offline limit
        foodStock: roomData.farmFood || 0,
        foodAt: roomData.farmFoodAt || 0,
        now: now,
        slowMs: FARM_CYCLE_SLOW_MS,
        fastMs: FARM_CYCLE_FAST_MS,
        dropCap: Infinity,
        foodPerDay: FARM_FOOD_PER_DAY,
        gainPerDay: FARM_HAPPY_GAIN_PER_DAY,
        decayPerDay: FARM_HAPPY_DECAY_PER_DAY,
        levels: FARM_LEVELS,
        levelSpeedup: FARM_LEVEL_SPEEDUP,
        capMs: FARM_OFFLINE_CAP_MS,
      });
      const batch = {};
      for (const s of plan.spawns) {
        const def = FARM_ANIMALS.find(f => f.id === s.type);
        const pid = def ? def.drop.id : s.type;
        batch[pid] = (batch[pid] || 0) + 1;
      }
      return { plan: plan, batch: batch, total: plan.spawns.length, awayMs: awayMs };
    }

    // Commit an offline plan: advance clocks/happiness/food and bank the produce
    // straight into stock (+collection XP). Moves each animal's clock to ~now, so
    // the next offline window starts fresh — i.e. you must collect to keep earning.
    function _applyOfflinePlan(off) {
      const plan = off.plan;
      roomData.farmAnimals = plan.animals;
      roomData.farmFood = plan.foodStock;
      roomData.farmFoodAt = plan.foodAt;
      roomData.farmStock = roomData.farmStock || {};
      for (const s of plan.spawns) {
        const def = FARM_ANIMALS.find(f => f.id === s.type);
        const pid = def ? def.drop.id : s.type;
        roomData.farmStock[pid] = (roomData.farmStock[pid] || 0) + 1;
        roomData.farmTotalCollected = (roomData.farmTotalCollected || 0) + 1;
        const a = roomData.farmAnimals.find(an => an.id === s.animalId);
        if (a) a.collected = (a.collected || 0) + 1;
      }
    }

    // The mandatory "while you were away" collect modal. No close button; tapping
    // the button OR the backdrop collects (backdrop tap auto-collects via room.html).
    function _showFarmAway(off) {
      _farmAwayPlan = off;
      const el = document.getElementById('farmAwayModal');
      if (!el) return;
      const meta = farmProductMeta();
      const rows = Object.keys(off.batch).map(function (pid) {
        const m = meta[pid] || { emoji: '❓', name: pid };
        return '<div class="ws-slot"><span class="ws-slot-no">' + m.emoji + ' ' + m.name + '</span>' +
               '<span class="ws-slot-state">×' + off.batch[pid] + '</span></div>';
      }).join('');
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🐔 While you were away…</div>' +
          '<div class="ws-sub">Your animals produced this. Collect it to keep them going!</div>' +
          rows +
          '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="collectFarmAway()">📦 Collect all</button>' +
        '</div>';
      el.style.display = 'flex';
    }
    function _hideFarmAway() {
      _farmAwayPlan = null;
      const el = document.getElementById('farmAwayModal');
      if (el) el.style.display = 'none';
    }
    // Collect the offline produce (button OR backdrop tap), then enter the farm.
    async function collectFarmAway() {
      if (viewingUid !== currentUid) { _hideFarmAway(); _startFarmLive(); return; }
      const n = _farmAwayPlan ? _farmAwayPlan.total : 0;
      if (_farmAwayPlan) _applyOfflinePlan(_farmAwayPlan);
      _hideFarmAway();
      await saveRoom();
      checkAchievements();
      if (n > 0) showToast('📦 Collected ' + n + ' produce from your animals!', 'success');
      _startFarmLive();
      renderAll();
    }

    function closeFarm() {
      isFarmView = false;
      closeCropPicker();
      closeCartSheet();
      closeRgbPreview();
      closeWorkshopModal();
      closeAnimalModal();
      closeProduceModal();
      _hideFarmAway();
      _hideFarmTip();
      document.getElementById('farmView')?.classList.remove('visible');
      _setFarmPanelMode(false);
      // Returning to the outside view keeps the panel hidden (still outside);
      // returning all the way inside (via enterLayer) brings it back.
      _syncRoomPanel();
      cancelAnimationFrame(_farmAnimFrame);
      _farmAnimFrame = null;
      clearInterval(_farmTickInterval);
      _farmTickInterval = null;
      _unsubFarmVisitList();
    }

    // Farm "← Back": a visitor returns to their OWN farm (so they keep farming);
    // the owner just closes the farm back to the outside view.
    function farmBack() {
      if (viewingUid !== currentUid) { visitFarm(currentUid); return; }
      closeFarm();
    }

    /* ── Farm panel (own panel — replaces the room tabs while the farm is open) ── */
    function renderFarmPanel() {
      const panel = document.getElementById('farmPanel');
      if (!panel) return;

      // Visiting someone else's farm — read-only summary + a friendly cheer.
      if (viewingUid !== currentUid) {
        const herd = roomData.farmAnimals || [];
        const counts = {};
        for (const a of herd) counts[a.type] = (counts[a.type] || 0) + 1;
        const herdLine = FARM_ANIMALS.filter(d => counts[d.id]).map(d => d.emoji + '×' + counts[d.id]).join('  ') || 'No animals yet';
        panel.innerHTML =
          '<div class="farm-panel-head">🚜 ' + (roomData.displayName || 'Their') + '\'s Farm</div>' +
          '<section class="farm-card">' +
            '<div class="farm-section-title">🐮 Their Herd <span class="farm-panel-cap">Lv ' + (roomData.farmAnimals || []).reduce((m, a) => Math.max(m, animalLevel(a.collected, FARM_LEVELS)), 0) + ' top</span></div>' +
            '<div class="farm-shop-row"><span class="farm-shop-animal">' + herd.length + ' animals</span></div>' +
            '<div class="farm-shop-row"><span class="farm-shop-animal">' + herdLine + '</span></div>' +
            '<div class="farm-shop-row"><span class="farm-shop-animal">🌻 ' + (roomData.farmDecors || []).length + ' decorations · 🌱 ' + (roomData.farmPlots || []).length + ' plots</span></div>' +
          '</section>' +
          '<button class="farm-shop-buy" style="width:100%;padding:9px;font-size:13px" onclick="cheerFarm()">👍 Cheer this farm</button>' +
          '<button class="farm-visit-home" onclick="visitFarm(\'' + currentUid + '\')">🏠 回我的农场</button>' +
          '<section class="farm-card" style="margin-top:10px">' +
            '<div class="farm-section-title">🚜 参观其他农场 <span class="farm-panel-cap">live</span></div>' +
            _farmVisitListHtml() +
          '</section>' +
          '<div class="farm-panel-hint">你正在参观 — 点赞鼓励，或去逛逛别的农场吧！</div>';
        return;
      }

      const animals = roomData.farmAnimals || [];
      const drops = roomData.farmDrops || [];
      const counts = {}, dropCounts = {};
      for (const a of animals) counts[a.type] = (counts[a.type] || 0) + 1;
      for (const d of drops) dropCounts[d.animalId] = (dropCounts[d.animalId] || 0) + 1;
      const full = animals.length >= farmAnimalCap();

      // Food trough: stock bar + refill button (fills the trough, coins permitting)
      const foodMax = farmFoodMax();
      const food = Math.floor(roomData.farmFood || 0);
      const foodPct = Math.round((food / foodMax) * 100);
      const refillUnits = Math.min(Math.max(0, Math.ceil(foodMax - (roomData.farmFood || 0))), Math.floor(roomData.coins / FARM_FOOD_COST));
      const foodColor = foodPct > 40 ? '#6dd56d' : foodPct > 15 ? '#f2c94c' : '#eb5757';
      const foodHtml =
        '<div class="farm-section-title">🌾 Food Trough</div>' +
        '<div class="farm-food-row">' +
          '<span class="farm-herd-info">' +
            '<span class="farm-herd-name">' + food + ' / ' + foodMax + '</span>' +
            '<span class="farm-herd-bar"><span style="width:' + foodPct + '%;background:' + foodColor + '"></span></span>' +
          '</span>' +
          '<button class="farm-shop-buy" onclick="refillFarmFood()"' + (refillUnits <= 0 ? ' disabled' : '') + '>+' + refillUnits + ' · ' + (refillUnits * FARM_FOOD_COST) + '🪙</button>' +
        '</div>';

      // Produce inventory (read-only) + merchant-cart status. Selling happens only
      // at the cart when it visits — see _farmCart() and the cart sell sheet.
      const prices = farmProductPrices(), meta = farmProductMeta();
      const stock = roomData.farmStock || {};
      // Show produce in a FIXED canonical order (meta key order) so the list
      // never re-sequences when a newly-collected product is added to stock.
      const _order = Object.keys(meta);
      const stockIds = Object.keys(stock).filter(k => stock[k] > 0)
        .sort((a, b) => { const ia = _order.indexOf(a), ib = _order.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
      const cart = _farmCart();
      const wantMeta = cart.wanted.map(w => (meta[w.id] || { emoji: '❓' }).emoji + '×' + w.qty).join('  ');
      const cartHtml =
        '<div class="farm-section-title">🛒 Merchant Cart</div>' +
        (cart.present
          ? '<div class="farm-cart-status here">🛒 The cart is here — tap it on the farm, or:</div>' +
            '<div class="farm-panel-empty" style="padding-top:4px">Buying this visit: ' + (wantMeta || '—') + '</div>' +
            '<button class="farm-shop-buy" style="width:100%;margin-top:6px" onclick="openCartSheet()">Open cart →</button>'
          : '<div class="farm-cart-status">🛒 Sold out & rolled on — back in <b>' + _fmtFarmTime(cart.nextInMs) + '</b>.</div>' +
            '<div class="farm-panel-empty" style="padding-top:4px">It buys a different set each visit — stock up!</div>');
      // Produce list is collapsible (it grows as you collect more types).
      const _produceCollapsed = _farmProduceCollapsed == null ? stockIds.length > FARM_PRODUCE_COLLAPSE_AT : _farmProduceCollapsed;
      const stockHtml =
        cartHtml +
        '<div class="farm-section-title farm-collapse-head" style="margin-top:12px" onclick="toggleFarmProduce()">' +
          '<span>📦 Produce <small>(' + stockIds.length + ')</small></span>' +
          '<span class="farm-collapse-arrow">' + (_produceCollapsed ? '▸' : '▾') + '</span>' +
        '</div>' +
        (_produceCollapsed
          ? ''
          : !stockIds.length
          ? '<div class="farm-panel-empty">Tap produce on the farm to collect it here.</div>'
          : stockIds.map(id => {
              const m = meta[id] || { emoji: '❓', name: id };
              const wanted = cart.present && cart.wanted.some(w => w.id === id);
              return '<div class="farm-shop-row">' +
                '<span class="farm-shop-animal">' + m.emoji + ' ' + m.name + ' <small>×' + stock[id] + '</small>' + (wanted ? ' <span class="farm-want-tag">cart wants</span>' : '') + '</span>' +
                '<span class="farm-shop-drop">' + (prices[id] || 0) + '🪙 ea</span>' +
                '</div>';
            }).join(''));

      // Daily delivery orders
      const ordersList = _farmOrders();
      const ordersDone = roomData.farmOrdersDone || [];
      const ordersHtml =
        '<div class="farm-section-title">📋 Orders <span class="farm-panel-cap">resets daily</span></div>' +
        ordersList.map((o, i) => {
          const isDone = ordersDone.includes(i);
          const canDo = !isDone && o.items.every(it => (stock[it.id] || 0) >= it.qty);
          const itemsStr = o.items.map(it => { const mm = meta[it.id] || { emoji: '❓' }; return mm.emoji + '×' + it.qty; }).join('  ');
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + itemsStr + '</span>' +
            '<span class="farm-shop-drop">+' + o.reward + '🪙</span>' +
            (isDone
              ? '<span class="farm-shop-drop">✓ done</span>'
              : '<button class="farm-shop-buy" onclick="fulfillFarmOrder(' + i + ')"' + (canDo ? '' : ' disabled') + '>Deliver</button>') +
            '</div>';
        }).join('');

      const shopHtml =
        '<div class="farm-section-title">🛒 Animal Shop' +
          '<button class="farm-mini-btn" onclick="openRgbPreview()" title="Preview the rare rainbow coats">🌈 RGB?</button>' +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:0 2px 6px">Every buy has a tiny chance to be a 🌈 rainbow (cosmetic).</div>' +
        FARM_ANIMALS.map(def => {
          const afford = roomData.coins >= def.cost;
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + def.emoji + ' ' + def.name + ' <small>×' + (counts[def.id] || 0) + '</small></span>' +
            '<span class="farm-shop-drop">' + def.drop.emoji + ' ' + def.drop.coins + '🪙</span>' +
            '<button class="farm-shop-buy" onclick="buyFarmAnimal(\'' + def.id + '\')"' + (full || !afford ? ' disabled' : '') + '>' + def.cost + '🪙</button>' +
            '</div>';
        }).join('');

      // Herd list is collapsible (it grows long). _farmHerdCollapsed: null = auto
      // (collapse once the herd passes FARM_HERD_COLLAPSE_AT), else explicit bool.
      const _herdCollapsed = _farmHerdCollapsed == null ? animals.length > FARM_HERD_COLLAPSE_AT : _farmHerdCollapsed;
      const herdRows =
        (!animals.length
          ? '<div class="farm-panel-empty">No animals yet — buy one above to start earning!</div>'
          : animals.map(a => {
              const def = FARM_ANIMALS.find(f => f.id === a.type);
              if (!def) return '';
              const h = Math.round(a.happiness);
              const color = h > 60 ? '#6dd56d' : h > 30 ? '#f2c94c' : '#eb5757';
              const lvl = animalLevel(a.collected, FARM_LEVELS);
              const waiting = dropCounts[a.id] || 0;
              const meat = _meatYield(a);   // 🥩 yield if butchered now (tier base + level bonus)
              const mark = a.variant === 'rgb' ? ' 🌈' : ((FARM_VARIANTS[a.type] || []).some(v => v.id === a.variant && v.rare) ? ' ✨' : '');
              const butcherCtl = _farmButcherConfirmId === a.id
                ? '<span class="farm-butcher-confirm"><button class="farm-mini-btn danger" onclick="butcherAnimal(\'' + a.id + '\')">✓ 🥩×' + meat + '</button><button class="farm-mini-btn" onclick="cancelButcher()">✗</button></span>'
                : '<span class="farm-herd-meat" title="Butcher → this much meat">🥩×' + meat + '</span>' +
                  '<button class="farm-mini-btn" title="Butcher for meat" onclick="askButcher(\'' + a.id + '\')">🔪</button>';
              return '<div class="farm-herd-row">' +
                '<span class="farm-herd-emoji">' + def.emoji + '</span>' +
                '<span class="farm-herd-info">' +
                  '<span class="farm-herd-name">' + def.name + mark + ' <small>Lv' + lvl + '</small> · ' + h + '%</span>' +
                  '<span class="farm-herd-bar"><span style="width:' + h + '%;background:' + color + '"></span></span>' +
                '</span>' +
                (waiting ? '<span class="farm-herd-drops">' + def.drop.emoji + ' ×' + waiting + '</span>' : '') +
                butcherCtl +
                '</div>';
            }).join(''));
      const herdHtml =
        '<div class="farm-section-title farm-collapse-head" onclick="toggleFarmHerd()">' +
          '<span>🐮 My Animals <small>(' + animals.length + ')</small></span>' +
          '<span class="farm-collapse-arrow">' + (_herdCollapsed ? '▸' : '▾') + '</span>' +
        '</div>' +
        (_herdCollapsed ? '' : '<div class="farm-herd-list">' + herdRows + '</div>');

      // Garden: owned/max plots + Add-plot + how-to. Harvesting any ripe crop
      // collects ALL ripe crops at once (no buttons needed).
      const plots = roomData.farmPlots || [];
      const usedPlots = plots.filter(p => p.crop).length;
      const nowG = Date.now();
      const ripePlots = plots.filter(p => {
        if (!p.crop) return false;
        const c = FARM_CROPS.find(x => x.id === p.crop);
        return c && cropProgress(p.plantedAt, nowG, c.growMs) >= 1;
      }).length;
      const atMax = plots.length >= FARM_PLOT_MAX;
      const gardenHtml =
        '<div class="farm-section-title">🌱 Garden ' +
          '<span class="farm-panel-cap">' + plots.length + '/' + FARM_PLOT_MAX + ' plots</span>' +
          (atMax
            ? ''
            : '<button class="farm-shop-buy" onclick="addFarmPlot()"' + (roomData.coins < FARM_PLOT_COST ? ' disabled' : '') + '>+ Plot · ' + FARM_PLOT_COST + '🪙</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding-bottom:2px">' + usedPlots + '/' + plots.length + ' planted · ' + ripePlots + ' ripe</div>' +
        '<div class="farm-howto">' +
          '🪧 Tap a row\'s <b>signboard</b> to plant that whole row.<br>' +
          '⏳ Tap a ripe row to harvest <b>everything that\'s ready</b>.' +
        '</div>';

      // Build Machines: buy here; built ones appear on the farm where you operate them.
      const _bm = roomData.farmMachines || {};
      const buildHtml =
        '<div class="farm-section-title">🏭 Build Machines</div>' +
        '<div class="farm-panel-empty" style="padding:0 2px 6px">Built machines appear on your farm — tap one there to make goods.</div>' +
        FARM_MACHINES.map(mc => {
          const owned = _bm[mc.id] && _bm[mc.id].owned;
          const makes = mc.recipes.map(rc => (meta[rc.out.id] ? meta[rc.out.id].emoji : '?')).join(' ');
          const note = mc.id === 'butcher' ? ' · needs meat' : '';
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + mc.emoji + ' ' + mc.name + ' <small>makes ' + makes + note + '</small></span>' +
            (owned
              ? '<span class="farm-shop-drop">✓ on farm</span>'
              : '<button class="farm-shop-buy" onclick="buyFarmMachine(\'' + mc.id + '\')"' + (roomData.coins < mc.cost ? ' disabled' : '') + '>Build · ' + mc.cost + '🪙</button>') +
            '</div>';
        }).join('');

      const expLvl = roomData.farmCapLevel || 0;
      const expandCost = expLvl < FARM_EXPAND_COSTS.length ? FARM_EXPAND_COSTS[expLvl] : null;
      const trLvl = roomData.farmTroughLevel || 0;
      const trCost = trLvl < FARM_TROUGH_COSTS.length ? FARM_TROUGH_COSTS[trLvl] : null;
      const upgradesHtml =
        '<div class="farm-section-title">⚙️ Upgrades</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🏞️ Bigger pasture <small>Lv ' + expLvl + '/' + FARM_EXPAND_COSTS.length + ' · holds ' + farmAnimalCap() + ' animals</small></span>' +
          (expandCost == null
            ? '<span class="farm-shop-drop">MAX</span>'
            : '<button class="farm-shop-buy" onclick="expandFarm()"' + (roomData.coins < expandCost ? ' disabled' : '') + '>+10 · ' + expandCost + '🪙</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:2px 0 4px">Pushes the crop fence down — more grass for a bigger herd.</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🪣 Bigger trough <small>Lv ' + trLvl + '/' + FARM_TROUGH_COSTS.length + ' · holds ' + farmFoodMax() + ' food</small></span>' +
          (trCost == null
            ? '<span class="farm-shop-drop">MAX</span>'
            : '<button class="farm-shop-buy" onclick="buyFarmTrough()"' + (roomData.coins < trCost ? ' disabled' : '') + '>+' + FARM_TROUGH_STEP + ' · ' + trCost + '🪙</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:2px 0 4px">A bigger trough holds more food, so it lasts longer between refills.</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🤖 Auto-Collector <small>produce → stock</small></span>' +
          (roomData.farmAutoCollect
            ? '<span class="farm-shop-drop">✓ ON</span>'
            : '<button class="farm-shop-buy" onclick="buyFarmAutoCollect()"' + (roomData.coins < FARM_AUTOCOLLECT_COST ? ' disabled' : '') + '>' + FARM_AUTOCOLLECT_COST + '🪙</button>') +
        '</div>';

      // Built (and subscribed) only when the Visit tab is active, so opening the
      // farm for normal play never spins up the rooms-list listener.
      const visitHtml = _farmTab === 'visit'
        ? '<div class="farm-section-title">🚜 参观农场 <span class="farm-panel-cap">live</span></div>' +
          '<div class="farm-panel-empty" style="padding:0 2px 6px">点一位农场主，去逛逛他的农场（只看不改）。</div>' +
          _farmVisitListHtml()
        : '';

      const card = (s) => '<section class="farm-card">' + s + '</section>';
      // The farm page is long, so it's split into its own tabs.
      const FARM_TABS = [
        { id: 'animals',  label: '🐮 Animals' },
        { id: 'garden',   label: '🌱 Garden' },
        { id: 'market',   label: '📦 Market' },
        { id: 'upgrades', label: '⚙️ Upgrades' },
        { id: 'visit',    label: '🚜 Visit' },
      ];
      const groups = {
        animals:  card(foodHtml) + card(herdHtml) + card(shopHtml),
        garden:   card(gardenHtml) + card(buildHtml),
        market:   card(stockHtml) + card(ordersHtml),
        upgrades: card(upgradesHtml),
        visit:    card(visitHtml),
      };
      const hints = {
        animals:  'Keep the trough filled — fed animals are happy and produce faster!',
        garden:   'Plant on the farm soil. Build machines here — then tap a machine on your farm to make goods.',
        market:   'Tap produce on the farm to collect it, then sell it or fill the daily orders.',
        upgrades: 'Expand your farm, automate collecting, and drag decor to arrange it.',
        visit:    '参观别人的农场，给他们点赞，再回到自己的农场。',
      };
      if (!groups[_farmTab]) _farmTab = 'animals';
      panel.innerHTML =
        '<div class="farm-panel-head">🚜 Farm <span class="farm-panel-cap">' + animals.length + '/' + farmAnimalCap() + ' animals</span></div>' +
        '<div class="farm-tabs">' +
          FARM_TABS.map(t => '<button class="farm-tab' + (t.id === _farmTab ? ' active' : '') + '" onclick="switchFarmTab(\'' + t.id + '\')">' + t.label + '</button>').join('') +
        '</div>' +
        groups[_farmTab] +
        '<div class="farm-panel-hint">' + hints[_farmTab] + '</div>';
    }

    /* ── Actions ── */
    async function refillFarmFood() {
      if (viewingUid !== currentUid) return;
      const food = roomData.farmFood || 0, max = farmFoodMax();
      const gap = max - food;
      if (gap < 0.5) return showToast('Trough is already full!', '');
      const affordable = Math.floor(roomData.coins / FARM_FOOD_COST);
      if (affordable <= 0) return showToast('Not enough coins!', 'error');
      const units = Math.min(Math.ceil(gap), affordable);          // whole units toward the brim
      roomData.coins -= units * FARM_FOOD_COST;
      roomData.farmFood = Math.min(max, food + units);             // clamp so it reaches exactly max
      roomData.farmFoodAt = roomData.farmFoodAt || Date.now();
      await saveRoom();
      showToast('🌾 Filled the trough! (+' + units + ')', 'success');
      renderFarmPanel();
      renderAll(); // refresh coin counter
    }

    async function buyFarmAnimal(typeId) {
      if (viewingUid !== currentUid) return;
      const def = FARM_ANIMALS.find(f => f.id === typeId);
      if (!def) return;
      roomData.farmAnimals = roomData.farmAnimals || [];
      if (roomData.farmAnimals.length >= farmAnimalCap()) return showToast('Farm is full! (' + farmAnimalCap() + ' max) — expand it for more.', 'error');
      if (roomData.coins < def.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= def.cost;
      const now = Date.now();
      // Roll a coat variant: rgb (rarest) → rare → common. Layered thresholds, so
      // FARM_RGB_CHANCE must stay below FARM_RARE_CHANCE.
      const variants = FARM_VARIANTS[def.id] || [];
      const rgbV = variants.find(v => v.rgb);
      const roll = Math.random();
      let variant;
      if (rgbV && roll < FARM_RGB_CHANCE) variant = rgbV;
      else if (variants.length > 1 && roll < FARM_RARE_CHANCE) variant = variants[1];
      else variant = variants[0] || { id: null };
      roomData.farmAnimals.push({
        id: 'fa' + now + '_' + Math.floor(Math.random() * 1e4),
        type: def.id,
        variant: variant.id,
        collected: 0,
        happiness: FARM_START_HAPPINESS,
        lastDropTime: now,
        posX: 0.15 + Math.random() * 0.7,
        posY: 0.54 + Math.random() * 0.13,   // stay in the pasture (above the crop fence)
      });
      roomData.farmVariants = roomData.farmVariants || {};
      roomData.farmVariants[def.id + '_' + (variant.id || 'default')] = true;
      if (!roomData.farmFoodAt) roomData.farmFoodAt = now; // start the feeding clock
      await saveRoom();
      showToast((variant.rgb ? '🌈 RGB ' : variant.rare ? '✨ Rare ' + variant.name + ' ' : def.emoji + ' ') + def.name + (variant.rgb ? ' — jackpot!' : ' joined your farm!'), 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll(); // refresh coin counter
    }

    // ── Butcher (retire an animal for meat) — needs the Butcher built; two-tap confirm ──
    function _ownsButcher() {
      return !!(roomData.farmMachines && roomData.farmMachines.butcher && roomData.farmMachines.butcher.owned);
    }
    // Meat from butchering = tier base + 1 per level above 1 (bigger/older = more meat).
    function _meatYield(a) {
      return (FARM_MEAT_YIELD[a.type] || 1) + Math.max(0, animalLevel(a.collected, FARM_LEVELS) - 1);
    }
    function askButcher(id) {
      if (!_ownsButcher()) { showToast('🔪 Build the Butcher first — Garden tab → Build Machines.', 'error'); switchFarmTab('garden'); return; }
      _farmButcherConfirmId = id; renderFarmPanel();
    }
    function cancelButcher() { _farmButcherConfirmId = null; renderFarmPanel(); }
    async function butcherAnimal(id) {
      if (viewingUid !== currentUid) return;
      _farmButcherConfirmId = null;
      if (!_ownsButcher()) { renderFarmPanel(); return showToast('🔪 Build the Butcher first — Garden tab → Build Machines.', 'error'); }
      const animals = roomData.farmAnimals || [];
      const a = animals.find(x => x.id === id);
      if (!a) { renderFarmPanel(); return; }
      const yield_ = _meatYield(a);
      roomData.farmAnimals = animals.filter(x => x.id !== id);
      roomData.farmDrops = (roomData.farmDrops || []).filter(d => d.animalId !== id); // drop its pending produce
      delete _farmAnimStates[id];
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock.meat = (roomData.farmStock.meat || 0) + yield_;
      await saveRoom();
      const def = FARM_ANIMALS.find(f => f.id === a.type);
      showToast('🔪 Butchered ' + (def ? def.name : 'animal') + ' → 🥩 ×' + yield_ + ' meat', 'success');
      renderFarmPanel();
      renderAll();
    }

    async function expandFarm() {
      if (viewingUid !== currentUid) return;
      const lvl = roomData.farmCapLevel || 0;
      if (lvl >= FARM_EXPAND_COSTS.length) return showToast('Farm is fully expanded!', '');
      const cost = FARM_EXPAND_COSTS[lvl];
      if (roomData.coins < cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= cost;
      roomData.farmCapLevel = lvl + 1;
      await saveRoom();
      showToast('🏞️ Farm expanded — now holds ' + farmAnimalCap() + ' animals!', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    async function buyFarmTrough() {
      if (viewingUid !== currentUid) return;
      const lvl = roomData.farmTroughLevel || 0;
      if (lvl >= FARM_TROUGH_COSTS.length) return showToast('Trough is fully upgraded!', '');
      const cost = FARM_TROUGH_COSTS[lvl];
      if (roomData.coins < cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= cost;
      roomData.farmTroughLevel = lvl + 1;
      await saveRoom();
      showToast('🪣 Bigger trough — now holds ' + farmFoodMax() + ' food!', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    async function buyFarmAutoCollect() {
      if (viewingUid !== currentUid) return;
      if (roomData.farmAutoCollect) return;
      if (roomData.coins < FARM_AUTOCOLLECT_COST) return showToast('Not enough coins!', 'error');
      roomData.coins -= FARM_AUTOCOLLECT_COST;
      roomData.farmAutoCollect = true;
      if (runFarmProduction() >= 0) { /* sweep any drops already on the ground */ }
      await saveRoom();
      showToast('🤖 Auto-Collector installed — produce goes straight to your stock!', 'success');
      renderFarmPanel();
      renderAll();
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

    // Product metadata/prices keyed by product id, sourced from the animals'
    // drops (processing adds more in a later phase).
    function farmProductMeta() {
      const m = {};
      FARM_ANIMALS.forEach(a => { m[a.drop.id] = { emoji: a.drop.emoji, name: a.drop.name }; });
      for (const id in FARM_PRODUCTS) m[id] = { emoji: FARM_PRODUCTS[id].emoji, name: FARM_PRODUCTS[id].name };
      return m;
    }
    function farmProductPrices() {
      const p = {};
      FARM_ANIMALS.forEach(a => { p[a.drop.id] = a.drop.coins; });
      for (const id in FARM_PRODUCTS) p[id] = FARM_PRODUCTS[id].coins;
      return p;
    }

    // Tap a drop → it goes into farm stock (sell later / use for orders), and the
    // producing animal gains collection XP toward its level.
    /* ── Social ── */
    // Cheer a friend's farm — cosmetic celebration (no cross-user writes, so no
    // rules change). A coin/host-side reward would need a firestore.rules update.
    function cheerFarm() {
      if (viewingUid === currentUid) return;
      for (let i = 0; i < 8; i++) {
        _farmParticles.push({ text: ['👍', '❤️', '🎉', '✨'][i % 4], x: 0.2 + Math.random() * 0.6, y: 0.7 + Math.random() * 0.1, vy: -0.0012 - Math.random() * 0.0008, life: 1500, born: performance.now() });
      }
      showToast('👍 You cheered ' + (roomData.displayName || 'this') + '\'s farm!', 'success');
    }

    /* ── Workshop (processing machines, parallel slots) ── */
    // Normalize a machine to the slot model, migrating the old single-job shape
    // ({owned, startedAt}) to {owned, slots, jobs:[startedAt,…]}. Returns it or null.
    function _machineState(id) {
      const m = (roomData.farmMachines || {})[id];
      if (!m || !m.owned) return null;
      if (!m.slots) m.slots = 1;
      if (!Array.isArray(m.jobs)) m.jobs = [m.startedAt || 0];   // migrate old single job
      // Each job is 0 (idle) or { at, r } (recipe index). Migrate legacy numbers → recipe 0.
      m.jobs = m.jobs.map(j => (j ? (typeof j === 'number' ? { at: j, r: 0 } : j) : 0));
      while (m.jobs.length < m.slots) m.jobs.push(0);
      if (m.jobs.length > m.slots) m.jobs.length = m.slots;
      if ('startedAt' in m) delete m.startedAt;                  // drop legacy field
      return m;
    }

    async function buyFarmMachine(id) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id);
      if (!mc) return;
      roomData.farmMachines = roomData.farmMachines || {};
      if (roomData.farmMachines[id] && roomData.farmMachines[id].owned) return;
      if (roomData.coins < mc.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= mc.cost;
      roomData.farmMachines[id] = { owned: true, slots: 1, jobs: [0] };
      await saveRoom();
      showToast(mc.emoji + ' ' + mc.name + ' built! Tap it on your farm to make goods.', 'success');
      renderFarmPanel();
      renderAll();
    }

    async function buyMachineSlot(id) {
      if (viewingUid !== currentUid) return;
      const m = _machineState(id);
      if (!m) return;
      if (m.slots >= FARM_MAX_SLOTS) return showToast('Max ' + FARM_MAX_SLOTS + ' slots reached!', '');
      if (roomData.coins < FARM_SLOT_COST) return showToast('Not enough coins! (' + FARM_SLOT_COST + '🪙)', 'error');
      roomData.coins -= FARM_SLOT_COST;
      m.slots += 1; m.jobs.push(0);
      _slotConfirm = false;
      await saveRoom();
      showToast('🧰 New production slot opened!', 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    async function startMachineSlot(id, slot, r) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id), m = _machineState(id);
      if (!mc || !m || m.jobs[slot]) return;
      const recipe = mc.recipes[r]; if (!recipe) return;
      const stockNow = roomData.farmStock || {};
      if (!Object.keys(recipe.in).every(k => (stockNow[k] || 0) >= recipe.in[k])) return showToast('Not enough ingredients!', 'error');
      Object.keys(recipe.in).forEach(k => { stockNow[k] -= recipe.in[k]; });
      roomData.farmStock = stockNow;
      m.jobs[slot] = { at: Date.now(), r: r };
      _makeChoiceSlot = null;
      await saveRoom();
      const outM = farmProductMeta()[recipe.out.id];
      showToast(mc.emoji + ' making ' + (outM ? outM.emoji + ' ' + outM.name : recipe.out.id) + '…', 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    async function collectMachineSlot(id, slot) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id), m = _machineState(id);
      if (!mc || !m || !m.jobs[slot]) return;
      const job = m.jobs[slot], recipe = mc.recipes[job.r] || mc.recipes[0];
      if (cropProgress(job.at, Date.now(), recipe.timeMs) < 1) return showToast('Still processing…', '');
      // Apply locally, then persist. If the save fails, roll back — otherwise the
      // collected item silently disappears when the next snapshot overwrites it.
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock[recipe.out.id] = (roomData.farmStock[recipe.out.id] || 0) + recipe.out.qty;
      m.jobs[slot] = 0;
      const ok = await saveRoom();
      if (!ok) {
        roomData.farmStock[recipe.out.id] -= recipe.out.qty;
        m.jobs[slot] = job;
        return showToast('Could not collect — save failed. Check your connection and try again.', 'error');
      }
      const outM = farmProductMeta()[recipe.out.id];
      showToast('Collected ' + recipe.out.qty + ' ' + (outM ? outM.emoji + ' ' + outM.name : recipe.out.id) + '!', 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    /* ── Orders ── */
    async function fulfillFarmOrder(idx) {
      if (viewingUid !== currentUid) return;
      _ensureFarmOrders();
      const o = _farmOrders()[idx];
      if (!o || (roomData.farmOrdersDone || []).includes(idx)) return;
      const stockNow = roomData.farmStock || {};
      if (!o.items.every(it => (stockNow[it.id] || 0) >= it.qty)) return showToast('Not enough produce for this order.', 'error');
      o.items.forEach(it => { stockNow[it.id] -= it.qty; });
      roomData.farmStock = stockNow;
      roomData.coins += o.reward;
      roomData.farmOrdersDone = [...(roomData.farmOrdersDone || []), idx];
      await saveRoom();
      showToast('📦 Order delivered! +' + o.reward + '🪙', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    /* ── Garden ── */
    async function addFarmPlot() {
      if (viewingUid !== currentUid) return;
      roomData.farmPlots = roomData.farmPlots || [];
      if (roomData.farmPlots.length >= FARM_PLOT_MAX) return showToast('Max plots reached!', '');
      if (roomData.coins < FARM_PLOT_COST) return showToast('Not enough coins!', 'error');
      roomData.coins -= FARM_PLOT_COST;
      roomData.farmPlots.push({ id: 'fp' + Date.now() + '_' + Math.floor(Math.random() * 1e4), crop: null, plantedAt: 0 });
      await saveRoom();
      showToast('🌱 New garden plot added!', 'success');
      renderFarmPanel();
      renderAll();
    }

    // Collapse / expand the herd list (UI-only, not persisted).
    function toggleFarmHerd() {
      const n = (roomData.farmAnimals || []).length;
      const cur = _farmHerdCollapsed == null ? n > FARM_HERD_COLLAPSE_AT : _farmHerdCollapsed;
      _farmHerdCollapsed = !cur;
      renderFarmPanel();
    }

    // Collapse / expand the produce list (UI-only, not persisted).
    function toggleFarmProduce() {
      const stock = roomData.farmStock || {};
      const n = Object.keys(stock).filter(k => stock[k] > 0).length;
      const cur = _farmProduceCollapsed == null ? n > FARM_PRODUCE_COLLAPSE_AT : _farmProduceCollapsed;
      _farmProduceCollapsed = !cur;
      renderFarmPanel();
    }

    // Harvest every ripe plot at once (food → trough, products → stock). Tapping
    // any ripe crop on the farm calls this, so a single tap collects the lot.
    function harvestAllFarm() {
      if (viewingUid !== currentUid) return;
      const plots = roomData.farmPlots || [];
      const now = Date.now();
      let n = 0;
      for (let i = 0; i < plots.length; i++) {
        const plot = plots[i];
        if (!plot.crop) continue;
        const crop = FARM_CROPS.find(c => c.id === plot.crop);
        if (!crop) { plot.crop = null; plot.plantedAt = 0; continue; }
        if (cropProgress(plot.plantedAt, now, crop.growMs) < 1) continue;
        const pos = _farmPlotPos(i);
        if (crop.yield.food) {
          roomData.farmFood = Math.min(farmFoodMax(), (roomData.farmFood || 0) + crop.yield.food);
          if (!roomData.farmFoodAt) roomData.farmFoodAt = now;
          _farmParticles.push({ text: '+' + crop.yield.food + ' 🌾', x: pos.x, y: pos.y - 0.05, vy: -0.0009, life: 1200, born: performance.now() });
        } else {
          roomData.farmStock = roomData.farmStock || {};
          roomData.farmStock[crop.yield.product] = (roomData.farmStock[crop.yield.product] || 0) + crop.yield.qty;
          const m = FARM_PRODUCTS[crop.yield.product];
          _farmParticles.push({ text: '+' + crop.yield.qty + ' ' + (m ? m.emoji : ''), x: pos.x, y: pos.y - 0.05, vy: -0.0009, life: 1200, born: performance.now() });
        }
        plot.crop = null; plot.plantedAt = 0; n++;
      }
      if (!n) return showToast('Nothing ripe to harvest yet.', '');
      saveRoom(); renderFarmPanel(); renderAll();
      showToast('🧺 Harvested ' + n + ' plot' + (n > 1 ? 's' : ''), 'success');
    }

    // Tap anywhere in a garden row → act on the whole row: ripe harvests all
    // ready crops, growing shows time left, empty opens the crop picker.
    function _farmRowClick(row) {
      if (viewingUid !== currentUid) return;
      const plots = roomData.farmPlots || [];
      const idxs = farmRowIndices(plots.length, row, 7);
      if (!idxs.length) return;
      const st = farmRowState(idxs.map(i => plots[i]), FARM_CROPS, Date.now());
      if (st.state === 'ripe') return harvestAllFarm();
      if (st.state === 'growing') {
        const crop = FARM_CROPS.find(c => c.id === st.cropId);
        return showToast((crop ? crop.emoji + ' ' + crop.name : 'Crop') + ' growing — ' + _fmtFarmTime(st.msLeft) + ' left', '');
      }
      openCropPicker(row);
    }

    /* ── Crop picker (tap an empty plot) + plant helpers ── */
    function _fmtFarmTime(ms) {
      const m = Math.max(0, Math.ceil(ms / 60000));
      if (m < 60) return m + 'm';
      return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
    }

    function openCropPicker(row) {
      _plantRow = row || 0;
      _pendingPlant = null;
      _renderCropPicker();
      const picker = document.getElementById('cropPicker');
      if (picker) picker.style.display = 'block';
    }
    function closeCropPicker() {
      _pendingPlant = null;
      const p = document.getElementById('cropPicker');
      if (p) p.style.display = 'none';
    }
    // Simple crop chooser for the target row: pick a crop → plant the row.
    function _renderCropPicker() {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      const plots = roomData.farmPlots || [];
      const empties = farmRowIndices(plots.length, _plantRow, 7).filter(i => !plots[i].crop).length;
      picker.innerHTML =
        '<div class="cp-head">🌱 Plant this row</div>' +
        '<div class="cp-bulk-info">Empty plots in row: <b>' + empties + '</b> · Coins: <b>' + roomData.coins + '</b></div>' +
        FARM_CROPS.map(c => {
          const afford = roomData.coins >= c.seedCost;
          return '<button class="cp-crop"' + (afford ? '' : ' disabled') + ' onclick="plantRow(\'' + c.id + '\')">' +
            '<span class="cp-emoji">' + c.emoji + '</span>' +
            '<span class="cp-info"><b>' + c.name + '</b><small>grows in ' + _fmtFarmTime(c.growMs) + ' · ' + c.seedCost + '🪙/plot</small></span>' +
            '<span class="cp-cost">' + (c.seedCost * empties) + '🪙</span>' +
            '</button>';
        }).join('') +
        '<button class="cp-close" onclick="closeCropPicker()">Close</button>';
    }

    // Chose a crop in the picker → plant the target row. Full-row when affordable,
    // else a confirmation to plant as many as coins allow.
    function plantRow(cropId) {
      if (viewingUid !== currentUid) return;
      const plots = roomData.farmPlots || [];
      const emptyIdxs = farmRowIndices(plots.length, _plantRow, 7).filter(i => !plots[i].crop);
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (!crop || !emptyIdxs.length) { closeCropPicker(); return; }
      const affordable = farmAffordableCount(roomData.coins, crop.seedCost, emptyIdxs.length);
      if (affordable <= 0) { closeCropPicker(); return showToast('Not enough coins for ' + crop.name + ' seed!', 'error'); }
      if (affordable >= emptyIdxs.length) return _doPlant(cropId, emptyIdxs);
      _pendingPlant = { row: _plantRow, cropId: cropId, count: affordable, total: emptyIdxs.length };
      _renderPlantConfirm(crop, emptyIdxs.length, affordable);
    }

    // Plant `crop` into the given plot indices (stops early if coins run out).
    function _doPlant(cropId, idxs) {
      const plots = roomData.farmPlots || [];
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (!crop) { closeCropPicker(); return; }
      const now = Date.now();
      let planted = 0;
      for (const i of idxs) {
        if (roomData.coins < crop.seedCost) break;
        roomData.coins -= crop.seedCost;
        plots[i].crop = crop.id; plots[i].plantedAt = now;
        const pos = _farmPlotPos(i);
        _farmParticles.push({ text: crop.emoji, x: pos.x, y: pos.y - 0.05, vy: -0.0008, life: 900, born: performance.now() });
        planted++;
      }
      closeCropPicker();
      if (planted) {
        saveRoom(); renderFarmPanel(); renderAll();
        showToast('🌱 Planted ' + planted + ' ' + crop.name + (planted > 1 ? 's' : ''), 'success');
      }
    }

    // Not-enough-coins confirmation (detailed wording), reusing #cropPicker.
    function _renderPlantConfirm(crop, total, affordable) {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      picker.innerHTML =
        '<div class="cp-head">🪙 Not enough coins</div>' +
        '<div class="cp-bulk-info" style="line-height:1.5">A full row of <b>' + crop.emoji + ' ' + crop.name + '</b> costs <b>' + (crop.seedCost * total) + '🪙</b> (' + total + ' plots).<br>' +
          'You have <b>' + roomData.coins + '🪙</b> — enough for <b>' + affordable + ' plots</b>.</div>' +
        '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="confirmPlantPartial()">🌱 Plant ' + affordable + ' · ' + (affordable * crop.seedCost) + '🪙</button>' +
        '<button class="cp-close" onclick="closeCropPicker()">Cancel</button>';
      picker.style.display = 'block';
    }

    // Confirmed the partial plant → fill the affordable empty plots in the row.
    function confirmPlantPartial() {
      if (!_pendingPlant) return closeCropPicker();
      const plots = roomData.farmPlots || [];
      const idxs = farmRowIndices(plots.length, _pendingPlant.row, 7)
        .filter(i => !plots[i].crop).slice(0, _pendingPlant.count);
      const cropId = _pendingPlant.cropId;
      _pendingPlant = null;
      _doPlant(cropId, idxs);
    }

    function _showFarmTip(text, e) {
      const tip = document.getElementById('farmTip');
      const view = document.getElementById('farmView');
      if (!tip || !view) return;
      const r = view.getBoundingClientRect();
      const src = (e.touches && e.touches[0]) ? e.touches[0] : e;
      tip.textContent = text;
      tip.style.display = 'block';
      let x = src.clientX - r.left + 14;
      x = Math.min(x, r.width - tip.offsetWidth - 8);
      tip.style.left = Math.max(6, x) + 'px';
      tip.style.top = Math.max(6, src.clientY - r.top - tip.offsetHeight - 6) + 'px';
    }
    function _hideFarmTip() {
      const tip = document.getElementById('farmTip');
      if (tip) tip.style.display = 'none';
    }

    function _collectFarmDrop(drop) {
      const def = FARM_ANIMALS.find(f => f.id === drop.type);
      const prodId = def ? def.drop.id : drop.type;
      roomData.farmDrops = (roomData.farmDrops || []).filter(d => d.id !== drop.id);
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock[prodId] = (roomData.farmStock[prodId] || 0) + 1;
      roomData.farmTotalCollected = (roomData.farmTotalCollected || 0) + 1;
      const animal = (roomData.farmAnimals || []).find(a => a.id === drop.animalId);
      if (animal) animal.collected = (animal.collected || 0) + 1;
      _farmParticles.push({ text: '+1 ' + (def ? def.drop.emoji : ''), x: drop.x, y: drop.y - 0.04, vy: -0.0009, life: 1200, born: performance.now() });
      saveRoom();
      checkAchievements();
      renderFarmPanel();
    }

    async function sellFarmProduct(prodId) {
      if (viewingUid !== currentUid) return;
      const qty = (roomData.farmStock || {})[prodId] || 0;
      if (qty <= 0) return;
      const price = farmProductPrices()[prodId] || 0;
      roomData.coins += qty * price;
      roomData.farmStock[prodId] = 0;
      await saveRoom();
      const m = farmProductMeta()[prodId];
      showToast('Sold ' + qty + ' ' + (m ? m.emoji + ' ' + m.name : prodId) + ' for ' + (qty * price) + '🪙', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    async function sellAllFarm() {
      if (viewingUid !== currentUid) return;
      const total = farmSellAllValue(roomData.farmStock || {}, farmProductPrices());
      if (total <= 0) return showToast('No produce to sell.', '');
      roomData.coins += total;
      roomData.farmStock = {};
      await saveRoom();
      showToast('Sold all produce for ' + total + '🪙!', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    /* ── Merchant cart (visits on a real-time cycle; sell only what it wants) ── */
    // Small deterministic RNG so the wanted-list is stable within a visit and the
    // same on all the user's devices — no server state needed.
    function _mulberry32(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // Stable per-item quota for a visit (same id+visit → same amount).
    function _cartQty(id, visitStart) {
      let h = 5381; const s = id + '|' + visitStart;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return 1 + (Math.abs(h) % FARM_CART_MAX_QTY);
    }
    // The cart only buys WORKSHOP-MADE goods (cheese, bread, sausage…), never raw
    // produce/drops — those are ingredients. Goods are limited to workshops you
    // OWN, so the cart never asks for things you have no way to make. Wanted-list
    // prefers made goods you currently have in stock, padded with other owned-made goods.
    function _cartBuildWanted(visitStart) {
      const stock = roomData.farmStock || {};
      const machines = roomData.farmMachines || {};
      const made = {};
      FARM_MACHINES.forEach(m => {
        if (machines[m.id] && machines[m.id].owned) m.recipes.forEach(r => { made[r.out.id] = true; });
      });
      const madeIds = Object.keys(made);
      const rng = _mulberry32(Math.floor(visitStart / 60000) >>> 0);
      const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
      let pool = shuffle(madeIds.filter(id => (stock[id] || 0) > 0));   // made goods you own first
      if (pool.length < FARM_CART_WANT_COUNT) {
        pool = pool.concat(shuffle(madeIds.filter(id => pool.indexOf(id) < 0)));
      }
      return pool.slice(0, Math.min(FARM_CART_WANT_COUNT, pool.length))
        .map(id => ({ id: id, qty: _cartQty(id, visitStart) }));
    }
    // Freeze the wanted-list ONCE per visit, then reuse it for the rest of that
    // visit. Without this, _cartBuildWanted re-runs on every render and re-orders
    // by *current* stock — so selling an item down to 0 swaps a different item
    // into its slot, and the away "preview" stops matching what the cart actually
    // buys on arrival. The snapshot is keyed by visitStart and persisted
    // (roomData.farmCartWanted) so it survives reloads and is identical across the
    // user's devices and from preview → arrival. (Empty lists — no workshops yet —
    // are left live so the cart picks up your first workshop's goods right away.)
    function _cartWantedFor(visitStart) {
      const snap = roomData.farmCartWanted;
      if (snap && snap.visitStart === visitStart && Array.isArray(snap.wanted) && snap.wanted.length) return snap.wanted;
      const wanted = _cartBuildWanted(visitStart);
      if (wanted.length) roomData.farmCartWanted = { visitStart: visitStart, wanted: wanted };
      return wanted;
    }
    // Cart state for `now`: the cart PARKS and waits (present) until you sell to
    // it; after a sale it leaves for FARM_CART_COOLDOWN_MS, then returns.
    // `farmCartLeftAt` (persisted) = when it last left. Wanted-list is frozen per
    // visit (see _cartWantedFor) so it never changes mid-visit.
    function _farmCart(now) {
      now = now || Date.now();
      const left = roomData.farmCartLeftAt || 0;
      const present = !left || (now - left) >= FARM_CART_COOLDOWN_MS;
      const visitStart = left ? (left + FARM_CART_COOLDOWN_MS) : 0;
      return {
        present: present,
        wanted: _cartWantedFor(visitStart),
        visitStart: visitStart,
        nextInMs: present ? 0 : (FARM_CART_COOLDOWN_MS - (now - left)),
      };
    }

    // Draw the parked sky merchant — a little propeller plane that hovers in the
    // sky and waits, trailing a "Tap to sell!" banner. offsetX/alpha let the
    // render loop fly it off-screen + fade it for the leave animation. (Was a
    // ground wagon; restyled to an aeroplane that stops in the sky.)
    function _drawMerchantCart(ctx, W, H, t, offsetX, alpha) {
      const s = Math.max(44, Math.min(W, H) * 0.12);
      const hover = Math.sin(t / 600) * (s * 0.08);
      const cx = (FARM_CART_X + (offsetX || 0)) * W, cy = FARM_CART_Y * H + hover;
      ctx.save();
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Trailing banner streaming out behind (to the left), advertising the sale
      const bnW = s * 1.1, bnH = s * 0.32, bnX = cx - s * 0.62 - bnW, bnY = cy - bnH / 2;
      const flap = Math.sin(t / 180) * (s * 0.05);
      ctx.strokeStyle = 'rgba(70,50,30,.55)'; ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy); ctx.lineTo(bnX + bnW, bnY + bnH / 2 + flap * 0.5); ctx.stroke();
      ctx.fillStyle = '#e8533f';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bnX, bnY + flap, bnW, bnH, bnH * 0.28); ctx.fill(); }
      else ctx.fillRect(bnX, bnY + flap, bnW, bnH);
      ctx.font = '800 ' + Math.round(Math.max(9, s * 0.15)) + 'px sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('Tap to sell!', bnX + bnW / 2, bnY + bnH / 2 + flap);
      // Tail fin (rear-left)
      ctx.fillStyle = '#c2402f';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.38, cy + s * 0.02); ctx.lineTo(cx - s * 0.6, cy - s * 0.32); ctx.lineTo(cx - s * 0.28, cy - s * 0.05); ctx.closePath(); ctx.fill();
      // Main wing (swept, under the belly)
      ctx.fillStyle = '#caa46a';
      ctx.beginPath(); ctx.moveTo(cx + s * 0.02, cy + s * 0.04); ctx.lineTo(cx - s * 0.26, cy + s * 0.34); ctx.lineTo(cx + s * 0.2, cy + s * 0.12); ctx.closePath(); ctx.fill();
      // Fuselage
      ctx.fillStyle = '#f7eedd';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx - s * 0.48, cy - s * 0.16, s * 0.9, s * 0.32, s * 0.16); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(cx - s * 0.03, cy, s * 0.45, s * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
      // Red nose cap (right tip)
      ctx.fillStyle = '#e8533f';
      ctx.beginPath(); ctx.arc(cx + s * 0.4, cy, s * 0.16, -Math.PI / 2, Math.PI / 2); ctx.fill();
      // Cockpit + passenger windows
      ctx.fillStyle = '#8fd3ff';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - s * 0.26 + i * s * 0.17, cy - s * 0.01, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
      // Spinning propeller at the nose
      ctx.save();
      ctx.translate(cx + s * 0.56, cy); ctx.rotate(t / 28);
      ctx.strokeStyle = 'rgba(55,38,22,.85)'; ctx.lineWidth = Math.max(2, s * 0.045); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.17); ctx.lineTo(0, s * 0.17); ctx.moveTo(-s * 0.17, 0); ctx.lineTo(s * 0.17, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#5b3a22'; ctx.beginPath(); ctx.arc(cx + s * 0.56, cy, s * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // While the plane is AWAY, mark its sky parking spot with a small cloud + a
    // ✈️ and the return countdown — tap it for the next-flight info.
    function _drawCartAway(ctx, W, H, t, cart) {
      const s = Math.max(34, Math.min(W, H) * 0.1);
      const hover = Math.sin(t / 700) * (s * 0.06);
      const cx = FARM_CART_X * W, cy = FARM_CART_Y * H + hover;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // puffy cloud
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      [[-0.34, 0.06, 0.24], [-0.02, -0.05, 0.3], [0.32, 0.06, 0.24], [0, 0.16, 0.28]].forEach(p => {
        ctx.beginPath(); ctx.arc(cx + p[0] * s, cy + p[1] * s, p[2] * s, 0, Math.PI * 2); ctx.fill();
      });
      // ✈️ + return countdown
      ctx.font = Math.round(s * 0.34) + 'px serif'; ctx.fillText('✈️', cx, cy - s * 0.05);
      ctx.font = '800 ' + Math.round(Math.max(9, s * 0.2)) + 'px sans-serif'; ctx.fillStyle = '#3f5d7a';
      ctx.fillText(_fmtFarmTime(cart.nextInMs), cx, cy + s * 0.24);
      ctx.restore();
    }

    // Fixed slot position for machine `slot` (its hut). Sits well left of the sky
    // plane's tap zone (plane at x 0.84, y 0.24, r 0.18); huts are hit-tested
    // first so any overlap resolves to the hut.
    function _workshopPos(slot) { return { x: 0.22 + slot * 0.11, y: 0.45 }; }

    // Zones animals must not walk into: owned machine huts. (The merchant is now
    // an aeroplane that hovers in the sky, so it no longer blocks the pasture.)
    function _farmBlockedZones() {
      const zones = [];
      const machines = roomData.farmMachines || {};
      FARM_MACHINES.forEach((m, slot) => {
        if (machines[m.id] && machines[m.id].owned) { const p = _workshopPos(slot); zones.push({ x: p.x, y: p.y, r: 0.10 }); }
      });
      return zones;
    }
    function _inBlocked(x, y, zones, pad) {
      for (const z of zones) if (Math.hypot(z.x - x, z.y - y) < z.r + (pad || 0)) return true;
      return false;
    }

    // Draw owned machine huts on the pasture (machines are built in the Garden tab).
    function _drawWorkshopMachines(ctx, W, H, t, night) {
      const machines = roomData.farmMachines || {};
      const now = Date.now();
      FARM_MACHINES.forEach((m, slot) => {
        const st = machines[m.id];
        if (!st || !st.owned) return;
        const p = _workshopPos(slot);
        const cx = p.x * W, cy = p.y * H, s = Math.max(38, Math.min(W, H) * 0.115);
        const wallW = s * 0.78, wallH = s * 0.52, D = s * 0.24, dy = D * 0.5;
        const fx = cx - wallW / 2, fy = cy - s * 0.04;   // front wall top-left
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // ground shadow
        ctx.fillStyle = night ? 'rgba(0,0,0,.34)' : 'rgba(30,62,20,.24)';
        ctx.beginPath(); ctx.ellipse(cx + D * 0.4, cy + s * 0.5, s * 0.62, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
        // right side wall (3D depth) — darker
        ctx.fillStyle = night ? '#6f4e33' : '#a9794d';
        ctx.beginPath();
        ctx.moveTo(fx + wallW, fy); ctx.lineTo(fx + wallW + D, fy - dy);
        ctx.lineTo(fx + wallW + D, fy - dy + wallH); ctx.lineTo(fx + wallW, fy + wallH); ctx.closePath(); ctx.fill();
        // front wall + warm gradient
        const wg = ctx.createLinearGradient(0, fy, 0, fy + wallH);
        wg.addColorStop(0, night ? '#9a7048' : '#e8c79a'); wg.addColorStop(1, night ? '#7c5734' : '#cda06f');
        ctx.fillStyle = wg; ctx.fillRect(fx, fy, wallW, wallH);
        // plank seams + base shadow
        ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 1;
        for (let yy = fy + wallH * 0.33; yy < fy + wallH; yy += wallH * 0.33) { ctx.beginPath(); ctx.moveTo(fx, yy); ctx.lineTo(fx + wallW, yy); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(fx, fy + wallH * 0.82, wallW, wallH * 0.18);
        // door
        ctx.fillStyle = night ? '#3a2a1c' : '#7a4a2c';
        const dw = wallW * 0.34, dh = wallH * 0.62, dx = cx - dw / 2, ddy = fy + wallH - dh;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(dx, ddy, dw, dh, dw * 0.45); ctx.fill(); } else ctx.fillRect(dx, ddy, dw, dh);
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(dx + dw * 0.78, ddy + dh * 0.5, s * 0.015, 0, Math.PI * 2); ctx.fill(); // knob
        // 3D roof — receding right slope + front gable + ridge
        const rTop = fy - s * 0.36, rOver = s * 0.12;
        ctx.fillStyle = night ? '#6e2f24' : '#9b4636';        // right slope (shaded)
        ctx.beginPath();
        ctx.moveTo(fx + wallW + rOver, fy); ctx.lineTo(cx, rTop);
        ctx.lineTo(cx + D, rTop - dy); ctx.lineTo(fx + wallW + rOver + D, fy - dy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = night ? '#8a3a2b' : '#c25b43';        // front gable
        ctx.beginPath(); ctx.moveTo(fx - rOver, fy); ctx.lineTo(cx, rTop); ctx.lineTo(fx + wallW + rOver, fy); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = 1.5;     // ridge highlight
        ctx.beginPath(); ctx.moveTo(cx, rTop); ctx.lineTo(cx + D, rTop - dy); ctx.stroke();
        // round sign with the machine emoji on the gable
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(cx, fy - s * 0.04, s * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = Math.round(s * 0.22) + 'px serif'; ctx.fillText(m.emoji, cx, fy - s * 0.03);
        // cooking steam ↑ / ready ✅ (any slot) — jobs are 0 | {at,r} | legacy number
        const jobs = Array.isArray(st.jobs) ? st.jobs : [st.startedAt || 0];
        let anyReady = false, anyCook = false;
        jobs.forEach(j => {
          if (!j) return;
          const at = typeof j === 'number' ? j : j.at;
          const rec = (m.recipes && m.recipes[typeof j === 'number' ? 0 : (j.r || 0)]) || (m.recipes && m.recipes[0]);
          const tMs = rec ? rec.timeMs : 30 * 60 * 1000;
          if (now - at >= tMs) anyReady = true; else anyCook = true;
        });
        if (anyReady) {
          ctx.font = Math.round(s * 0.28) + 'px serif'; ctx.fillText('✅', fx + wallW + D * 0.5, rTop + s * 0.04);
        } else if (anyCook) {
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          for (let k = 0; k < 3; k++) {
            const yy = rTop - s * 0.08 - k * s * 0.13 - ((t / 50) % (s * 0.13));
            ctx.beginPath(); ctx.arc(cx + D + Math.sin(t / 300 + k) * s * 0.04, yy, s * 0.055 - k * s * 0.008, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      });
    }

    function openCartSheet() {
      const cart = _farmCart();
      // New visit (or first open after a reload) → restore how much was already
      // sold this visit from the saved progress, so refreshing never re-offers
      // units you've already sold.
      if (cart.visitStart !== _cartVisitKey) {
        _cartVisitKey = cart.visitStart;
        const snap = roomData.farmCartSold;
        _cartSold = (snap && snap.visitStart === cart.visitStart && snap.sold) ? Object.assign({}, snap.sold) : {};
      }
      _cartSheetOpen = true; renderCartSheet();
    }
    function _hideCartSheet() {
      _cartSheetOpen = false;
      const el = document.getElementById('cartSheet');
      if (el) el.style.display = 'none';
    }
    function closeCartSheet() {
      // Closing never sends the plane off — it stays parked until you've sold
      // everything it wants (auto-leaves) or you tap "Send it off".
      _hideCartSheet();
    }
    // Send the cart off: start the roll-off animation + 4h cooldown. showNext pops
    // the next-cart info modal once the wagon has left.
    function _departCart(showNext) {
      roomData.farmCartLeftAt = Date.now();
      _cartSold = {};
      roomData.farmCartSold = null;   // clear this visit's sold-progress
      _cartLeaveStart = Date.now();
      _hideCartSheet();
      // Lock in (and persist via the saveRoom below) the next visit's wanted-list
      // now, from current stock, so the away preview matches exactly what the cart
      // buys when it returns.
      _cartWantedFor(roomData.farmCartLeftAt + FARM_CART_COOLDOWN_MS);
      saveRoom();
      renderFarmPanel();
      if (showNext) setTimeout(function () { if (isFarmView) { _cartSheetOpen = true; renderCartSheet(); } }, CART_LEAVE_MS + 120);
    }
    async function dismissCart() {
      if (viewingUid !== currentUid) return;
      showToast('🛒 Sent the cart off — back in 4h with new wants.', '');
      _departCart(true);
    }
    // Units still sellable for a wanted item: min(stock, quota − sold-this-visit).
    function _cartSellable(w, stock) {
      return Math.max(0, Math.min(stock[w.id] || 0, w.qty - (_cartSold[w.id] || 0)));
    }
    function renderCartSheet() {
      const el = document.getElementById('cartSheet');
      if (!el) return;
      if (!_cartSheetOpen) { el.style.display = 'none'; return; }
      const cart = _farmCart();
      const meta = farmProductMeta(), prices = farmProductPrices(), stock = roomData.farmStock || {};
      if (!cart.present) {
        // Away: countdown + a preview of what the NEXT cart will want.
        const want = cart.wanted.map(w => {
          const m = meta[w.id] || { emoji: '❓', name: w.id };
          return '<div class="cart-sq" style="cursor:default;border-style:dashed;border-color:var(--g-border);background:rgba(255,255,255,.04)"><span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap" style="color:var(--g-ink-soft)">×' + w.qty + '</span></div>';
        }).join('');
        el.innerHTML =
          '<div class="cp-head">🛒 Cart is away</div>' +
          '<div class="farm-panel-empty" style="padding:0 2px 8px">Back in <b>' + _fmtFarmTime(cart.nextInMs) + '</b>. The next cart will want:</div>' +
          '<div class="cart-grid">' + want + '</div>' +
          '<button class="cp-close" onclick="closeCartSheet()">Close</button>';
        el.style.display = 'block';
        return;
      }
      // Present → a square for EVERY unit the cart still wants. Units you have in
      // stock are sellable (tap to sell one); units you can make but haven't yet
      // show as locked "make" squares. You own the workshop, so the cart still
      // asks for it — this way you always see what to produce, even on empty stock.
      let squares = '', sellableTotal = 0;
      cart.wanted.forEach(w => {
        const m = meta[w.id] || { emoji: '❓', name: w.id };
        const remaining = Math.max(0, w.qty - (_cartSold[w.id] || 0));
        const sellable = _cartSellable(w, stock);
        sellableTotal += sellable;
        for (let k = 0; k < remaining; k++) {
          squares += k < sellable
            ? '<button class="cart-sq" onclick="sellOneToCart(\'' + w.id + '\')">' +
                '<span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap">+' + (prices[w.id] || 0) + '🪙</span></button>'
            : '<div class="cart-sq locked" title="Make this in the workshop, then sell it">' +
                '<span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap">make</span></div>';
        }
      });
      const wantsLine = cart.wanted.map(w => (meta[w.id] || { emoji: '❓' }).emoji + '×' + Math.max(0, w.qty - (_cartSold[w.id] || 0))).join('  ');
      el.innerHTML =
        '<div class="cp-head">🛒 Merchant Cart</div>' +
        (cart.wanted.length
          ? '<div class="farm-panel-empty" style="padding:0 2px 4px">Wants: ' + wantsLine + ' · tap a square to sell; greyed “make” squares you still need to produce.</div>' +
            '<div class="cart-grid">' + squares + '</div>' +
            (sellableTotal > 0
              ? '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="sellAllToCart()">💰 Sell all it wants</button>'
              : '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="dismissCart()">🐴 Send it off (new cart in 4h)</button>')
          : '<div class="ws-status">Build a workshop first — then the cart buys what it makes.</div>' +
            '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="dismissCart()">🐴 Send it off (new cart in 4h)</button>') +
        '<button class="cp-close" onclick="closeCartSheet()">Close</button>';
      el.style.display = 'block';
    }

    async function sellOneToCart(prodId) {
      if (viewingUid !== currentUid) return;
      const cart = _farmCart();
      if (!cart.present) { closeCartSheet(); return showToast('The cart has left — it\'ll be back later.', ''); }
      const want = cart.wanted.find(w => w.id === prodId);
      if (!want) return showToast('The cart isn\'t buying that this visit.', '');
      if (_cartSellable(want, roomData.farmStock || {}) <= 0) return showToast('The cart has had enough of that.', '');
      const price = farmProductPrices()[prodId] || 0;
      roomData.coins += price;
      roomData.farmStock[prodId] = (roomData.farmStock[prodId] || 0) - 1;
      _cartSold[prodId] = (_cartSold[prodId] || 0) + 1;
      roomData.farmCartSold = { visitStart: cart.visitStart, sold: _cartSold };
      await saveRoom();
      const m = farmProductMeta()[prodId];
      showToast('Sold 1 ' + (m ? m.emoji + ' ' + m.name : prodId) + ' for ' + price + '🪙', 'success');
      checkAchievements();
      renderFarmPanel(); renderAll();
      // Sold everything it wanted → the plane flies off (new one in 4h);
      // otherwise keep the sheet open so you can sell/make the rest.
      if (cart.wanted.every(w => (w.qty - (_cartSold[w.id] || 0)) <= 0)) _departCart(true);
      else renderCartSheet();
    }
    async function sellAllToCart() {
      if (viewingUid !== currentUid) return;
      const cart = _farmCart();
      if (!cart.present) { closeCartSheet(); return showToast('The cart has left — it\'ll be back later.', ''); }
      const stock = roomData.farmStock || {}, prices = farmProductPrices();
      let total = 0, sold = 0;
      for (const w of cart.wanted) {
        const n = _cartSellable(w, stock);
        if (n > 0) { total += n * (prices[w.id] || 0); sold += n; stock[w.id] = (stock[w.id] || 0) - n; _cartSold[w.id] = (_cartSold[w.id] || 0) + n; }
      }
      if (!sold) return showToast('Nothing the cart wants right now.', '');
      roomData.coins += total;
      roomData.farmStock = stock;
      roomData.farmCartSold = { visitStart: cart.visitStart, sold: _cartSold };
      checkAchievements();
      // Fully fulfilled → the plane flies off (new one in 4h); otherwise it stays
      // so you can finish the rest (or tap "Send it off").
      if (cart.wanted.every(w => (w.qty - (_cartSold[w.id] || 0)) <= 0)) {
        showToast('🛒 Sold ' + sold + ' items for ' + total + '🪙! Off it goes.', 'success');
        renderFarmPanel(); renderAll();
        return _departCart(true);
      }
      await saveRoom();
      showToast('🛒 Sold ' + sold + ' items for ' + total + '🪙.', 'success');
      renderCartSheet(); renderFarmPanel(); renderAll();
    }

    // ── RGB coat preview — a little gallery of each animal's rainbow variant ──
    let _rgbPreviewAnim = null;
    function openRgbPreview() {
      const el = document.getElementById('rgbPreview');
      if (!el) return;
      el.innerHTML =
        '<div class="rgb-box">' +
          '<div class="rgb-head">🌈 Rainbow (RGB) coats</div>' +
          '<div class="rgb-sub">~' + Math.round(FARM_RGB_CHANCE * 100) + '% chance on any animal you buy. Cosmetic only — same value as a normal one.</div>' +
          '<div class="rgb-grid">' +
            FARM_ANIMALS.map(d => '<div class="rgb-cell"><canvas class="rgb-canvas" data-type="' + d.id + '" width="120" height="120"></canvas><span>' + d.emoji + ' ' + d.name + '</span></div>').join('') +
          '</div>' +
          '<button class="cp-close" onclick="closeRgbPreview()">Close</button>' +
        '</div>';
      el.style.display = 'flex';
      cancelAnimationFrame(_rgbPreviewAnim);
      const canvases = Array.from(el.querySelectorAll('.rgb-canvas'));
      function frame(t) {
        for (const c of canvases) {
          const ctx = c.getContext('2d');
          const v = (FARM_VARIANTS[c.dataset.type] || []).find(x => x.rgb);
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.save();
          ctx.translate(c.width / 2, c.height * 0.6);
          ctx.filter = 'hue-rotate(' + Math.round((t / 5) % 360) + 'deg) saturate(1.7)';
          drawFarmAnimal(ctx, c.dataset.type, c.width * 0.42, t / 120, false, v ? v.pal : null);
          ctx.restore();
        }
        _rgbPreviewAnim = requestAnimationFrame(frame);
      }
      _rgbPreviewAnim = requestAnimationFrame(frame);
    }
    function closeRgbPreview() {
      cancelAnimationFrame(_rgbPreviewAnim); _rgbPreviewAnim = null;
      const el = document.getElementById('rgbPreview');
      if (el) el.style.display = 'none';
    }

    // ── Animal status panel — tap an animal to see its stats, pet it, or butcher it.
    function openAnimalModal(id) { _animalModalId = id; _animalButcherConfirm = false; renderAnimalModal(); }
    function closeAnimalModal() { _animalModalId = null; _animalButcherConfirm = false; const el = document.getElementById('animalModal'); if (el) el.style.display = 'none'; }
    function askAnimalButcher() { _animalButcherConfirm = true; renderAnimalModal(); }
    function cancelAnimalButcher() { _animalButcherConfirm = false; renderAnimalModal(); }
    function confirmButcherAnimal() { const id = _animalModalId; closeAnimalModal(); butcherAnimal(id); }
    function renderAnimalModal() {
      const el = document.getElementById('animalModal');
      if (!el) return;
      const a = (roomData.farmAnimals || []).find(x => x.id === _animalModalId);
      if (!_animalModalId || !a) { el.style.display = 'none'; return; }
      const def = FARM_ANIMALS.find(f => f.id === a.type) || { emoji: '❓', name: a.type, drop: { emoji: '', coins: 0 } };
      const lvl = animalLevel(a.collected, FARM_LEVELS);
      const h = Math.round(a.happiness);
      const color = h > 60 ? '#6dd56d' : h > 30 ? '#f2c94c' : '#eb5757';
      const mark = a.variant === 'rgb' ? ' 🌈' : ((FARM_VARIANTS[a.type] || []).some(v => v.id === a.variant && v.rare) ? ' ✨' : '');
      const waiting = (roomData.farmDrops || []).filter(d => d.type === a.type).length;   // pooled per type
      const meatBase = FARM_MEAT_YIELD[a.type] || 1;
      const meat = _meatYield(a);   // tier base + (level − 1)
      // Production: current cycle (faster when happy / higher level) + next-drop countdown.
      const cycleMs = farmCycleMs(a.happiness, FARM_CYCLE_SLOW_MS, FARM_CYCLE_FAST_MS) / (1 + FARM_LEVEL_SPEEDUP * (lvl - 1));
      let prodLine;
      if (waiting >= FARM_PRODUCE_CAP) {
        prodLine = def.drop.emoji + ' ' + def.drop.name + ' — full (' + waiting + '/' + FARM_PRODUCE_CAP + ') · collect to resume';
      } else {
        const next = Math.max(0, (a.lastDropTime || Date.now()) + cycleMs - Date.now());
        prodLine = 'Makes ' + def.drop.emoji + ' ' + def.drop.name + ' every ~' + _fmtFarmTime(cycleMs) +
          ' · next in ' + (next <= 0 ? 'soon' : _fmtFarmTime(next)) + ' · ' + waiting + '/' + FARM_PRODUCE_CAP + ' waiting';
      }
      const nextThresh = FARM_LEVELS[lvl];                                  // threshold for next level
      const lvlInfo = nextThresh != null ? ((a.collected || 0) + '/' + nextThresh + ' to Lv' + (lvl + 1)) : 'max level';
      let actions;
      if (_animalButcherConfirm) {
        actions = '<div class="ws-status">Butcher ' + def.name + '? You get 🥩×' + meat + ' (tier ' + meatBase + ' + Lv bonus ' + (meat - meatBase) + ') — gone for good.</div>' +
          '<button class="cp-crop" style="justify-content:center;font-weight:800;background:var(--g-danger);color:#fff" onclick="confirmButcherAnimal()">✓ Butcher</button>' +
          '<button class="cp-crop" style="justify-content:center" onclick="cancelAnimalButcher()">✗ Keep it</button>';
      } else if (_ownsButcher()) {
        actions = '<button class="cp-crop" style="justify-content:center;color:#f87171" onclick="askAnimalButcher()">🔪 Butcher for meat (🥩×' + meat + ')</button>';
      } else {
        actions = '<div class="ws-status">🔪 Build the Butcher (Garden tab) to butcher animals.</div>';
      }
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">' + def.emoji + ' ' + def.name + mark + '</div>' +
          '<div class="ws-sub">Lv ' + lvl + ' · ' + lvlInfo + '</div>' +
          '<div class="ws-status" style="margin:2px 0 6px">Happiness <b style="color:' + color + '">' + h + '%</b></div>' +
          '<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:0 0 8px"><div style="height:100%;width:' + h + '%;background:' + color + '"></div></div>' +
          '<div class="ws-status" style="margin:0 0 12px">' + prodLine + '</div>' +
          actions +
          '<button class="cp-close" onclick="closeAnimalModal()">Close</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    // ── Produce modal — how much each animal type has made (capped per type) + collect.
    let _produceModalOpen = false;
    function openProduceModal() { _produceModalOpen = true; renderProduceModal(); }
    function closeProduceModal() { _produceModalOpen = false; const el = document.getElementById('produceModal'); if (el) el.style.display = 'none'; }
    async function collectProduceType(type) {
      if (viewingUid !== currentUid) return;
      const drops = (roomData.farmDrops || []).filter(d => d.type === type);
      if (!drops.length) return;
      const def = FARM_ANIMALS.find(f => f.id === type);
      const pid = def ? def.drop.id : type;
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock[pid] = (roomData.farmStock[pid] || 0) + drops.length;
      roomData.farmTotalCollected = (roomData.farmTotalCollected || 0) + drops.length;
      drops.forEach(d => { const an = (roomData.farmAnimals || []).find(x => x.id === d.animalId); if (an) an.collected = (an.collected || 0) + 1; });
      roomData.farmDrops = (roomData.farmDrops || []).filter(d => d.type !== type);
      await saveRoom();
      showToast('Collected ' + drops.length + ' ' + (def ? def.drop.emoji + ' ' + def.drop.name : type) + '!', 'success');
      checkAchievements(); renderProduceModal(); renderFarmPanel(); renderAll();
    }
    async function collectAllProduce() {
      if (viewingUid !== currentUid) return;
      const n = _autoCollectAll();   // every drop → stock (+XP)
      if (!n) return;
      await saveRoom();
      showToast('Collected ' + n + ' produce!', 'success');
      checkAchievements(); renderProduceModal(); renderFarmPanel(); renderAll();
    }
    function renderProduceModal() {
      const el = document.getElementById('produceModal');
      if (!el) return;
      if (!_produceModalOpen) { el.style.display = 'none'; return; }
      const counts = {};
      for (const d of (roomData.farmDrops || [])) counts[d.type] = (counts[d.type] || 0) + 1;
      const owned = [];
      (roomData.farmAnimals || []).forEach(a => { if (owned.indexOf(a.type) < 0) owned.push(a.type); });
      const order = FARM_ANIMALS.map(d => d.id).filter(id => owned.indexOf(id) >= 0);
      const rows = order.length ? order.map(type => {
        const def = FARM_ANIMALS.find(f => f.id === type) || { drop: { emoji: '❓', name: type } };
        const n = counts[type] || 0;
        return '<div class="ws-slot">' +
          '<span class="ws-slot-no">' + def.drop.emoji + ' ' + def.drop.name + '</span>' +
          '<span class="ws-slot-state">' + n + '/' + FARM_PRODUCE_CAP + (n >= FARM_PRODUCE_CAP ? ' · full!' : '') + '</span>' +
          '<button class="farm-shop-buy" onclick="collectProduceType(\'' + type + '\')"' + (n > 0 ? '' : ' disabled') + '>Collect</button>' +
          '</div>';
      }).join('') : '<div class="ws-status">No animals yet — buy one in the Animals tab.</div>';
      const total = Object.keys(counts).reduce((s, k) => s + counts[k], 0);
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🧺 Produce</div>' +
          '<div class="ws-sub">Each animal type holds up to ' + FARM_PRODUCE_CAP + ' — collect to keep them producing.</div>' +
          rows +
          (total > 0 ? '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="collectAllProduce()">📦 Collect all (' + total + ')</button>' : '') +
          '<button class="cp-close" onclick="closeProduceModal()">Close</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    // ── Single-machine modal — tap a machine's hut on the farm to make goods with
    // just THAT machine (start a batch / collect it). Machines are BUILT in the
    // Garden tab; this modal only operates an already-built one.
    function openMachineModal(id) { _workshopModalId = id; _makeChoiceSlot = null; _slotConfirm = false; _workshopModalOpen = true; renderWorkshopModal(); }
    function closeWorkshopModal() {
      _workshopModalOpen = false; _workshopModalId = null; _makeChoiceSlot = null; _slotConfirm = false;
      const el = document.getElementById('workshopModal');
      if (el) el.style.display = 'none';
    }
    function chooseMake(slot) { _makeChoiceSlot = slot; _slotConfirm = false; renderWorkshopModal(); }
    function cancelMake() { _makeChoiceSlot = null; renderWorkshopModal(); }
    function askOpenSlot() { _slotConfirm = true; _makeChoiceSlot = null; renderWorkshopModal(); }
    function cancelOpenSlot() { _slotConfirm = false; renderWorkshopModal(); }
    function renderWorkshopModal() {
      const el = document.getElementById('workshopModal');
      if (!el) return;
      const mc = FARM_MACHINES.find(m => m.id === _workshopModalId);
      if (!_workshopModalOpen || !mc) { el.style.display = 'none'; return; }
      const meta = farmProductMeta(), stock = roomData.farmStock || {}, now = Date.now();
      const m = _machineState(mc.id);
      const makesStr = mc.recipes.map(rc => (meta[rc.out.id] ? meta[rc.out.id].emoji : '?')).join(' ');
      // What you have of the ingredients this machine uses (e.g. 🥛×3).
      const ingIds = mc.recipes.reduce((a, rc) => { Object.keys(rc.in).forEach(k => { if (a.indexOf(k) < 0) a.push(k); }); return a; }, []);
      const haveStr = ingIds.map(id => (meta[id] ? meta[id].emoji : id) + '×' + (stock[id] || 0)).join('   ');
      const haveLine = '<div class="ws-status" style="margin:2px 0 8px">In stock: ' + haveStr + '</div>';
      let body;
      if (!m) {
        body = '<div class="ws-status">Not built yet — build it in the 🌱 Garden tab.</div>';
      } else {
        // A grid of FARM_MAX_SLOTS squares: locked (buy) · idle (tap to choose) ·
        // making (shows the product + timer) · ready (tap to collect).
        let cells = '';
        for (let i = 0; i < FARM_MAX_SLOTS; i++) {
          if (i >= m.slots) {                                   // not opened yet
            const afford = roomData.coins >= FARM_SLOT_COST;
            cells += '<button class="ws-cell locked"' + (afford ? '' : ' disabled') + ' onclick="askOpenSlot()">' +
              '<span class="ws-cell-icon">🔒</span><span class="ws-cell-cap">Open · ' + Math.round(FARM_SLOT_COST / 1000) + 'k🪙</span></button>';
            continue;
          }
          const job = m.jobs[i];
          if (!job) {                                           // open + empty
            cells += '<button class="ws-cell idle' + (_makeChoiceSlot === i ? ' picking' : '') + '" onclick="chooseMake(' + i + ')">' +
              '<span class="ws-cell-icon">➕</span><span class="ws-cell-cap">Make</span></button>';
          } else {
            const recipe = mc.recipes[job.r] || mc.recipes[0];
            const oM = meta[recipe.out.id] || { emoji: '❓' };
            if (cropProgress(job.at, now, recipe.timeMs) >= 1) {
              cells += '<button class="ws-cell ready" onclick="collectMachineSlot(\'' + mc.id + '\',' + i + ')">' +
                '<span class="ws-cell-icon">' + oM.emoji + '</span><span class="ws-cell-cap">✅ Collect</span></button>';
            } else {
              cells += '<div class="ws-cell busy">' +
                '<span class="ws-cell-icon">' + oM.emoji + '</span><span class="ws-cell-cap">⏳ ' + Math.ceil((recipe.timeMs - (now - job.at)) / 60000) + 'm</span></div>';
            }
          }
        }
        const grid = '<div class="ws-grid">' + cells + '</div>';
        // recipe chooser shown below the grid while picking for an empty square
        let chooser = '';
        if (_makeChoiceSlot != null && _makeChoiceSlot < m.slots && !m.jobs[_makeChoiceSlot]) {
          const choices = mc.recipes.map((rc, r) => {
            const oM = meta[rc.out.id] || { emoji: '❓', name: rc.out.id };
            const inStr = Object.keys(rc.in).map(k => (meta[k] ? meta[k].emoji : k) + '×' + rc.in[k]).join('+');
            const can = Object.keys(rc.in).every(k => (stock[k] || 0) >= rc.in[k]);
            return '<button class="farm-shop-buy ws-recipe" onclick="startMachineSlot(\'' + mc.id + '\',' + _makeChoiceSlot + ',' + r + ')"' + (can ? '' : ' disabled') + '>' + oM.emoji + ' ' + oM.name + ' <small>' + inStr + ' · ' + Math.round(rc.timeMs / 60000) + 'm</small></button>';
          }).join('');
          chooser = '<div class="ws-choose"><div class="ws-slot-no">Slot ' + (_makeChoiceSlot + 1) + ' — pick a product <span class="ws-x" onclick="cancelMake()">✕</span></div>' + choices + '</div>';
        }
        // confirmation before spending coins to open a new slot
        let confirmBanner = '';
        if (_slotConfirm) {
          confirmBanner = '<div class="ws-choose"><div class="ws-slot-no">Open a new slot for ' + FARM_SLOT_COST + '🪙? <span class="ws-x" onclick="cancelOpenSlot()">✕</span></div>' +
            '<button class="farm-shop-buy ws-recipe" onclick="buyMachineSlot(\'' + mc.id + '\')"' + (roomData.coins < FARM_SLOT_COST ? ' disabled' : '') + '>✓ Open slot · ' + FARM_SLOT_COST + '🪙</button></div>';
        }
        body = grid + chooser + confirmBanner;
      }
      const butcherNote = mc.id === 'butcher'
        ? '<div class="ws-status" style="margin-top:8px">🔪 Get meat by butchering an animal: 🐮 Animals tab → tap 🔪 on it.</div>' : '';
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">' + mc.emoji + ' ' + mc.name + '</div>' +
          '<div class="ws-sub">Makes: ' + makesStr + ' · each slot makes one</div>' +
          haveLine + body + butcherNote +
          '<button class="cp-close" onclick="closeWorkshopModal()">Close</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    /* ── Scene ── */
    function _farmAnimState(a, idx, n) {
      if (!_farmAnimStates[a.id]) {
        const ix = (idx != null && n) ? (0.10 + ((idx + 0.5) / n) * 0.80) : (a.posX ?? 0.5);
        const iy = 0.54 + (idx != null ? (idx % 3) * 0.04 : Math.random() * 0.08);
        _farmAnimStates[a.id] = { x: ix, y: iy, tx: ix, ty: iy, nextWander: 0, facingRight: Math.random() < 0.5, moving: false };
      }
      return _farmAnimStates[a.id];
    }

    // Group the herd into one fenced pen per animal type. Pen WIDTHS are proportional
    // to each type's count, so animal density stays even and every animal is visible.
    // Pure normalized (0..1) geometry — no canvas size needed.
    const FARM_PEN_PLURAL = { goose: 'Geese', pig: 'Pigs', cow: 'Cows', horse: 'Horses' };
    function _buildAnimalPens(herd, penTop, penBot) {
      const order = ['goose', 'pig', 'cow', 'horse'];
      const counts = {};
      for (const a of herd) counts[a.type] = (counts[a.type] || 0) + 1;
      const types = order.filter(tp => counts[tp] > 0);
      const byType = {}, list = [];
      if (!types.length) return { list, byType };
      const PX0 = 0.05, PX1 = 0.95, GAP = 0.012;
      const span = (PX1 - PX0) - GAP * (types.length - 1);
      const total = types.reduce((s, tp) => s + counts[tp], 0);
      const MINW = 0.13;                                   // floor so a tiny herd still gets a tappable pen
      let w = types.map(tp => Math.max(MINW, (counts[tp] / total) * span));
      const wSum = w.reduce((s, v) => s + v, 0);
      w = w.map(v => v * span / wSum);                     // renormalize back to the span
      const padX = 0.012, padTop = 0.036, padBot = 0.012;
      let x = PX0;
      types.forEach((tp, i) => {
        const def = FARM_ANIMALS.find(f => f.id === tp) || { emoji: '🐾', name: tp };
        const pen = {
          type: tp, emoji: def.emoji, label: FARM_PEN_PLURAL[tp] || def.name, count: counts[tp],
          x0: x, x1: x + w[i], y0: penTop, y1: penBot,
          ix0: x + padX, ix1: x + w[i] - padX, iy0: penTop + padTop, iy1: penBot - padBot,
        };
        byType[tp] = pen; list.push(pen);
        x += w[i] + GAP;
      });
      return { list, byType };
    }

    // Draw the pens (grass panel + wooden rail + label tab) behind the animals.
    function _drawAnimalPens(ctx, W, H, pens, night) {
      for (const p of pens) {
        const x = p.x0 * W, y = p.y0 * H, w = (p.x1 - p.x0) * W, h = (p.y1 - p.y0) * H;
        const r = Math.min(14, w * 0.2, h * 0.3);
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
        ctx.fillStyle = night ? 'rgba(80,120,60,0.16)' : 'rgba(150,200,90,0.14)';   // soft paddock tint
        ctx.fill();
        ctx.lineWidth = Math.max(2.5, W * 0.006);                                     // wooden rail
        ctx.strokeStyle = night ? '#5a4326' : '#8a5a30';
        ctx.stroke();
        ctx.lineWidth = Math.max(1, W * 0.0022);
        ctx.strokeStyle = night ? 'rgba(255,255,255,0.10)' : 'rgba(255,240,210,0.35)';
        ctx.stroke();
        ctx.restore();
        const ps = Math.max(4, W * 0.011);                                            // corner posts
        ctx.fillStyle = night ? '#4a3620' : '#714a26';
        [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(c => {
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(c[0] - ps / 2, c[1] - ps / 2, ps, ps, 2); else ctx.rect(c[0] - ps / 2, c[1] - ps / 2, ps, ps);
          ctx.fill();
        });
      }
    }

    // Pen name tabs — drawn AFTER the animals so the count is never hidden behind a herd.
    function _drawPenLabels(ctx, W, H, pens, night) {
      for (const p of pens) {
        const x = p.x0 * W, y = p.y0 * H, w = (p.x1 - p.x0) * W;
        const fs = Math.max(11, Math.min(16, W * 0.03));
        ctx.font = '800 ' + Math.round(fs) + 'px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        let txt = p.emoji + ' ' + p.label + ' ' + p.count;
        if (ctx.measureText(txt).width + 18 > w) txt = p.emoji + ' ' + p.count;       // narrow pen -> drop the name
        const tw = ctx.measureText(txt).width, tpad = 8, th = fs + 8;
        const tx = x + 6, ty = y - th + 2;                                            // sit just above the pen rail
        ctx.fillStyle = night ? 'rgba(20,14,6,0.88)' : 'rgba(40,26,12,0.86)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx, ty, tw + tpad * 2, th, th / 2); else ctx.rect(tx, ty, tw + tpad * 2, th);
        ctx.fill();
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(txt, tx + tpad, ty + th / 2 + 0.5);
      }
    }

    function _drawFarmTrough(ctx, W, H, night) {
      const trLvl = roomData.farmTroughLevel || 0;
      const tx = FARM_TROUGH_X * W, ty = FARM_TROUGH_Y * H;
      const tw = Math.max(52, W * 0.11) * (1 + trLvl * 0.14), th = tw * 0.36;  // grows with upgrades
      const topY = ty - th, botY = ty;
      const hTop = tw / 2, hBot = tw * 0.40;   // tapered: wider at the brim
      const pct = Math.max(0, Math.min(1, (roomData.farmFood || 0) / farmFoodMax()));

      // Warm hand-planed wood + iron + golden grain (muted after dark)
      const wood   = night ? '#4a3520' : '#9a6a3c';
      const woodLo = night ? '#2f2210' : '#6c4624';
      const woodHi = night ? '#5d4327' : '#bb8550';
      // Rim tier: bronze → silver → gold as you upgrade the trough
      const RIM_TIERS = night ? ['#6a4e2f', '#7d7d86', '#b9923a', '#d9b84a'] : ['#caa066', '#cdd2da', '#e8c45a', '#ffd86b'];
      const rimCol = RIM_TIERS[Math.min(trLvl, RIM_TIERS.length - 1)];
      const iron   = night ? '#262220' : '#3a342e';
      const ironHi = night ? '#46403a' : '#6a6258';
      const grainA = night ? '#b48f34' : '#f4d262';
      const grainB = night ? '#8a6a24' : '#d9a637';
      const grainHi = night ? '#cda94e' : '#ffe8a3';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.textAlign = 'center';

      // Soft ground shadow
      ctx.fillStyle = 'rgba(0,0,0,' + (night ? 0.34 : 0.20) + ')';
      ctx.beginPath();
      ctx.ellipse(tx, botY + th * 0.34, hTop * 1.08, th * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();

      // Splayed legs
      ctx.fillStyle = woodLo;
      const legH = th * 0.9;
      [-1, 1].forEach(s => {
        const ax = tx + s * hBot * 0.9;
        ctx.beginPath();
        ctx.moveTo(ax - tw * 0.05, botY - 2);
        ctx.lineTo(ax - tw * 0.04, botY + legH);
        ctx.lineTo(ax + tw * 0.04, botY + legH);
        ctx.lineTo(ax + tw * 0.06, botY - 2);
        ctx.closePath();
        ctx.fill();
      });

      // Body (tapered trough) with a vertical wood-grain gradient
      const bodyPath = () => {
        ctx.beginPath();
        ctx.moveTo(tx - hTop, topY);
        ctx.lineTo(tx + hTop, topY);
        ctx.lineTo(tx + hBot, botY);
        ctx.lineTo(tx - hBot, botY);
        ctx.closePath();
      };
      const bodyGrad = ctx.createLinearGradient(0, topY, 0, botY);
      bodyGrad.addColorStop(0, woodHi);
      bodyGrad.addColorStop(0.4, wood);
      bodyGrad.addColorStop(1, woodLo);
      bodyPath(); ctx.fillStyle = bodyGrad; ctx.fill();

      // Plank seams
      ctx.strokeStyle = woodLo; ctx.globalAlpha = 0.45;
      ctx.lineWidth = Math.max(1, tw * 0.012);
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        ctx.beginPath();
        ctx.moveTo(tx - hTop + f * hTop * 2, topY + 2);
        ctx.lineTo(tx - hBot + f * hBot * 2, botY - 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Heaped, textured grain — clipped to the inner opening
      if (pct > 0) {
        const innerTop = topY + th * 0.14, innerBot = botY - 2;
        const ihTop = hTop * 0.78, ihBot = hBot * 0.82;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tx - ihTop, innerTop);
        ctx.lineTo(tx + ihTop, innerTop);
        ctx.lineTo(tx + ihBot, innerBot);
        ctx.lineTo(tx - ihBot, innerBot);
        ctx.closePath();
        ctx.clip();
        const level = innerBot - pct * (innerBot - innerTop);
        const gg = ctx.createLinearGradient(0, level - th * 0.18, 0, innerBot);
        gg.addColorStop(0, grainHi);
        gg.addColorStop(0.45, grainA);
        gg.addColorStop(1, grainB);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(tx - hTop, level + 3);
        ctx.quadraticCurveTo(tx, level - th * 0.20, tx + hTop, level + 3);
        ctx.lineTo(tx + hTop, innerBot + 2);
        ctx.lineTo(tx - hTop, innerBot + 2);
        ctx.closePath();
        ctx.fill();
        // kernels
        ctx.fillStyle = night ? 'rgba(255,236,170,.45)' : 'rgba(110,72,18,.4)';
        for (let s = 0; s < 12; s++) {
          const sx = tx + (((s * 73) % 100) / 100 - 0.5) * ihTop * 1.7;
          const sy = level + 3 + (((s * 47) % 100) / 100) * (innerBot - level);
          ctx.fillRect(sx, sy, 1.7, 1.7);
        }
        // hay strands poking up (visible while not brim-full)
        ctx.strokeStyle = grainB; ctx.lineWidth = 1.4;
        [-0.3, 0.05, 0.34].forEach((hx, i) => {
          ctx.beginPath();
          ctx.moveTo(tx + hx * tw, level + 2);
          ctx.lineTo(tx + hx * tw + (i - 1) * 3, level - th * 0.26);
          ctx.stroke();
        });
        ctx.restore();
      }

      // Front rim / lip (lighter bevel across the brim)
      const rimH = th * 0.17;
      ctx.fillStyle = rimCol;
      ctx.beginPath();
      ctx.moveTo(tx - hTop - 1.5, topY);
      ctx.lineTo(tx + hTop + 1.5, topY);
      ctx.lineTo(tx + hTop - 1, topY + rimH);
      ctx.lineTo(tx - hTop + 1, topY + rimH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = woodHi;
      ctx.fillRect(tx - hTop - 1.5, topY, (hTop + 1.5) * 2, Math.max(1, rimH * 0.3));

      // Iron straps with rivets at each end
      [-0.82, 0.82].forEach(f => {
        const xT = tx + f * hTop, xB = tx + f * hBot, bw = tw * 0.05;
        ctx.fillStyle = iron;
        ctx.beginPath();
        ctx.moveTo(xT - bw, topY); ctx.lineTo(xT + bw, topY);
        ctx.lineTo(xB + bw, botY); ctx.lineTo(xB - bw, botY);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = ironHi;
        ctx.beginPath(); ctx.arc(xT, topY + th * 0.24, bw * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(xB, botY - th * 0.24, bw * 0.34, 0, Math.PI * 2); ctx.fill();
      });

      // Crisp outline
      bodyPath();
      ctx.strokeStyle = woodLo;
      ctx.lineWidth = Math.max(1.5, tw * 0.022);
      ctx.stroke();

      ctx.restore();

      // Empty-trough alert — a little speech bubble so it reads at a glance
      if (pct === 0 && (roomData.farmAnimals || []).length) {
        const bx = tx, by = topY - th * 0.6, r = th * 0.4;
        ctx.save();
        ctx.fillStyle = night ? '#c14a3f' : '#e0613a';
        ctx.beginPath(); ctx.ellipse(bx, by, r * 1.05, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx - r * 0.3, by + r * 0.5);
        ctx.lineTo(bx + r * 0.15, by + r * 1.15);
        ctx.lineTo(bx + r * 0.4, by + r * 0.45);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.round(th * 0.55) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', bx, by + 1);
        ctx.restore();
      }
    }

    // A wooden signboard on a post, drawn to the left of a garden row. `st` is a
    // farmRowState() result: blank when empty, crop emoji + name (+ % or ✨) else.
    function _drawFarmSign(ctx, W, H, row, st) {
      const pos = _farmSignPos(row);
      const cx = pos.x * W, cy = pos.y * H;
      const w = Math.max(36, Math.min(W, H) * 0.095), h = w * 0.72;
      const x0 = cx - w / 2, y0 = cy - h / 2;
      ctx.fillStyle = '#5a3c22';                                   // post
      ctx.fillRect(cx - 2, y0 + h - 3, 4, h * 0.5);
      ctx.fillStyle = '#8a5a2b';                                   // board
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 5); ctx.fill(); }
      else ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = '#6b431f'; ctx.lineWidth = 2;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 5); ctx.stroke(); }
      else ctx.strokeRect(x0, y0, w, h);
      ctx.textAlign = 'center';
      if (st.state === 'empty') {
        ctx.fillStyle = 'rgba(255,243,214,.5)';
        ctx.font = '600 9px system-ui,sans-serif';
        ctx.fillText('tap to', cx, cy - 1);
        ctx.fillText('plant', cx, cy + 9);
        return;
      }
      const crop = FARM_CROPS.find(c => c.id === st.cropId);
      ctx.fillStyle = '#fff3d6';
      ctx.font = Math.round(h * 0.34) + 'px system-ui,sans-serif';
      ctx.fillText(crop ? crop.emoji : '🌱', cx, cy - h * 0.08);
      ctx.font = '800 9px system-ui,sans-serif';
      ctx.fillText(st.state === 'ripe' ? '✨ Ready' : (crop ? crop.name : ''), cx, cy + h * 0.24);
      if (st.state === 'growing') {
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(Math.round(st.progress * 100) + '%', cx, cy + h * 0.42);
      }
    }

    // Garden plots: brown soil tiles; growing crops show a progress bar, ripe
    // crops bob with a ✨ to invite a harvest tap.
    function _drawFarmPlots(ctx, W, H, t) {
      const plots = roomData.farmPlots || [];
      const now = Date.now();
      const tile = Math.max(22, Math.min(W, H) * 0.05);
      ctx.textAlign = 'center';
      // Row signboards (left of each row that owns ≥1 plot).
      const _rows = farmRowCount(plots.length, 7);
      for (let _r = 0; _r < _rows; _r++) {
        const _st = farmRowState(farmRowIndices(plots.length, _r, 7).map(k => plots[k]), FARM_CROPS, now);
        _drawFarmSign(ctx, W, H, _r, _st);
      }
      plots.forEach((plot, i) => {
        const pos = _farmPlotPos(i);
        const px = pos.x * W, py = pos.y * H;
        // 3D raised garden bed: front (wooden) face for depth + top soil face
        const _x0 = px - tile / 2, _y0 = py - tile / 2, _r = Math.max(3, tile * 0.16);
        const _depth = tile * 0.30;
        ctx.fillStyle = '#43301c';                                   // front face
        ctx.fillRect(_x0, _y0 + tile - _r, tile, _depth + _r);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(_x0, _y0 + tile + _depth - 2, tile, 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;     // plank seam on the side
        ctx.beginPath(); ctx.moveTo(_x0 + 2, _y0 + tile + _depth * 0.5); ctx.lineTo(_x0 + tile - 2, _y0 + tile + _depth * 0.5); ctx.stroke();
        const _tg = ctx.createLinearGradient(0, _y0, 0, _y0 + tile);  // top soil face
        _tg.addColorStop(0, '#8a6038'); _tg.addColorStop(1, '#6b4a2c');
        ctx.fillStyle = _tg;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0, _y0, tile, tile, _r); ctx.fill(); }
        else ctx.fillRect(_x0, _y0, tile, tile);
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0, _y0, tile, tile * 0.30, _r); ctx.fill(); }
        else ctx.fillRect(_x0, _y0, tile, tile * 0.16);
        ctx.strokeStyle = 'rgba(40,26,12,.28)'; ctx.lineWidth = 1;    // tilled lines
        for (let ly = _y0 + tile * 0.38; ly < _y0 + tile - 2; ly += tile * 0.26) { ctx.beginPath(); ctx.moveTo(_x0 + 3, ly); ctx.lineTo(_x0 + tile - 3, ly); ctx.stroke(); }
        ctx.strokeStyle = '#5a3c22'; ctx.lineWidth = 1.5;            // wooden frame edge
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0, _y0, tile, tile, _r); ctx.stroke(); }
        else ctx.strokeRect(_x0, _y0, tile, tile);
        if (!plot.crop) return;
        const crop = FARM_CROPS.find(c => c.id === plot.crop);
        if (!crop) return;
        const prog = cropProgress(plot.plantedAt, now, crop.growMs);
        const ccx = px, baseY = _y0 + tile * 0.55;   // "ground" on the bed's top face
        if (prog < 1) {
          // Growing sprout — stem + leaves, scales with progress (shape, always visible)
          const gh = tile * (0.25 + prog * 0.55);
          ctx.strokeStyle = '#3f8f2a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ccx, baseY); ctx.lineTo(ccx, baseY - gh); ctx.stroke();
          ctx.fillStyle = '#6cc24a';
          ctx.beginPath(); ctx.ellipse(ccx - 4, baseY - gh * 0.70, 4.5, 2.6, -0.7, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(ccx + 4, baseY - gh * 0.55, 4.5, 2.6, 0.7, 0, Math.PI * 2); ctx.fill();
          // growth bar
          ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(ccx - tile * 0.4, _y0 + tile + 2, tile * 0.8, 4);
          ctx.fillStyle = '#86d957'; ctx.fillRect(ccx - tile * 0.4, _y0 + tile + 2, tile * 0.8 * prog, 4);
        } else {
          // Ready crop — drawn icon per type (no emoji dependency)
          const bob = Math.sin(t / 250 + i) * 2;
          const s = tile * 0.5;
          ctx.save(); ctx.translate(ccx, baseY - s * 0.45 + bob);
          if (crop.id === 'carrot') {
            ctx.fillStyle = '#e8772e';
            ctx.beginPath(); ctx.moveTo(-s * 0.34, -s * 0.45); ctx.lineTo(s * 0.34, -s * 0.45); ctx.lineTo(0, s * 0.6); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#3f9a35';
            for (const dx of [-0.18, 0, 0.18]) { ctx.beginPath(); ctx.ellipse(dx * s, -s * 0.58, s * 0.10, s * 0.26, dx * 2, 0, Math.PI * 2); ctx.fill(); }
          } else if (crop.id === 'corn') {
            ctx.fillStyle = '#f2c733';
            ctx.beginPath(); ctx.ellipse(0, 0, s * 0.30, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(150,110,20,.5)'; ctx.lineWidth = 1;
            for (let ky = -s * 0.4; ky < s * 0.4; ky += 4) { ctx.beginPath(); ctx.moveTo(-s * 0.22, ky); ctx.lineTo(s * 0.22, ky); ctx.stroke(); }
            ctx.fillStyle = '#3f9a35';
            ctx.beginPath(); ctx.ellipse(-s * 0.28, s * 0.05, s * 0.15, s * 0.5, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(s * 0.28, s * 0.05, s * 0.15, s * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
          } else { // wheat / default — golden bundle
            ctx.strokeStyle = '#d9a72a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
            for (const a2 of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(0, s * 0.55); ctx.lineTo(Math.sin(a2) * s * 0.5, -s * 0.55); ctx.stroke(); }
            ctx.fillStyle = '#f0c64a';
            for (const a2 of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.ellipse(Math.sin(a2) * s * 0.5, -s * 0.5, s * 0.12, s * 0.22, a2, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.restore();
          // sparkle (drawn star, not emoji)
          ctx.fillStyle = '#fff4b0';
          const spx = ccx + tile * 0.42, spy = baseY - s * 0.95 + bob;
          ctx.beginPath();
          for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4; const rr = (k % 2) ? 1.2 : 3.4; ctx.lineTo(spx + Math.cos(ang) * rr, spy + Math.sin(ang) * rr); }
          ctx.closePath(); ctx.fill();
        }
      });
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

        // The dividing fence between the animal pasture (above) and the crop
        // garden (below). It moves DOWN as the farm is expanded, so each
        // "Expand farm" visibly enlarges the pasture.
        const divY = Math.min(0.82, 0.66 + 0.04 * (roomData.farmCapLevel || 0));
        const gy = H * divY;

        // Animal pasture — grass from the horizon down to the dividing fence
        const grass = ctx.createLinearGradient(0, H * 0.42, 0, gy);
        grass.addColorStop(0, night ? '#22432b' : '#9ed26b');    // soft sunny top
        grass.addColorStop(0.5, night ? '#1a3622' : '#79c052');
        grass.addColorStop(1, night ? '#13291a' : '#5ba23c');    // richer deep bottom
        ctx.fillStyle = grass;
        ctx.fillRect(0, H * 0.42, W, gy - H * 0.42);

        // 3D mown field — alternating stripes converging to the horizon point
        ctx.save();
        ctx.beginPath(); ctx.rect(0, H * 0.42, W, gy - H * 0.42); ctx.clip();
        const vpx = W / 2, vpy = H * 0.40;
        const gSeg = 12, gSpread = W * 1.7, gx0 = W / 2 - gSpread / 2;
        for (let i = 0; i < gSeg; i++) {
          const xA = gx0 + (i / gSeg) * gSpread, xB = gx0 + ((i + 1) / gSeg) * gSpread;
          ctx.fillStyle = (i % 2)
            ? (night ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)')
            : (night ? 'rgba(0,0,0,0.13)' : 'rgba(18,70,16,0.13)');
          ctx.beginPath(); ctx.moveTo(xA, gy); ctx.lineTo(xB, gy); ctx.lineTo(vpx, vpy); ctx.closePath(); ctx.fill();
        }
        // horizontal depth bands (tighter toward the horizon)
        ctx.strokeStyle = night ? 'rgba(0,0,0,0.14)' : 'rgba(18,70,16,0.16)'; ctx.lineWidth = 1;
        for (let k = 1; k <= 5; k++) { const f = k / 6; const yy = gy - (gy - H * 0.42) * (f * f); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
        ctx.restore();

        // Crop garden — a tilled soil band below the dividing fence
        const soil = ctx.createLinearGradient(0, gy, 0, H);
        soil.addColorStop(0, night ? '#41301b' : '#8a6238');     // warmer tilled earth
        soil.addColorStop(1, night ? '#251b0e' : '#5e4324');
        ctx.fillStyle = soil;
        ctx.fillRect(0, gy, W, H - gy);
        // 3D tilled rows — alternating stripes converging to the dividing fence
        ctx.save();
        ctx.beginPath(); ctx.rect(0, gy, W, H - gy); ctx.clip();
        const sSeg = 16, sSpread = W * 1.5, sx0 = W / 2 - sSpread / 2;
        for (let i = 0; i < sSeg; i++) {
          const xA = sx0 + (i / sSeg) * sSpread, xB = sx0 + ((i + 1) / sSeg) * sSpread;
          ctx.fillStyle = (i % 2) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)';
          ctx.beginPath(); ctx.moveTo(xA, H); ctx.lineTo(xB, H); ctx.lineTo(W / 2, gy); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
        for (let fy = gy + (H - gy) * 0.42; fy < H - 2; fy += (H - gy) * 0.30) { ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke(); }
        ctx.restore();

        // Fences: top of the pasture, the dividing 围栏 (farm | crops), bottom edge
        _drawFence(ctx, W * 0.02, H * 0.46, W * 0.96, night);
        _drawFence(ctx, W * 0.02, gy, W * 0.96, night);
        _drawFence(ctx, W * 0.02, H * 0.93, W * 0.96, night);
        _drawHDTree(ctx, W * 0.06, H * 0.46, H * 0.18, windSway, night);
        _drawHDTree(ctx, W * 0.94, H * 0.46, H * 0.15, windSway * 0.7, night);

        _drawFarmTrough(ctx, W, H, night);
        _drawFarmPlots(ctx, W, H, t);

        // Drops on the ground (visual juice) — collected via the Produce modal.
        // Cap how many we draw so a full pool (up to 20/type) doesn't clutter.
        ctx.textAlign = 'center';
        const pulse = 1 + Math.sin(t / 300) * 0.08;
        const _dd = roomData.farmDrops || [];
        for (let i = 0; i < Math.min(_dd.length, 14); i++) {
          const def = FARM_ANIMALS.find(f => f.id === _dd[i].type);
          if (!def) continue;
          const size = Math.max(20, Math.min(W, H) * 0.045) * pulse;
          ctx.font = Math.round(size) + 'px sans-serif';
          ctx.fillText(def.drop.emoji, _dd[i].x * W, _dd[i].y * H);
        }
        // Floating "Collect" button reflects total pending produce
        if (_dd.length !== _lastProduceN) {
          _lastProduceN = _dd.length;
          const _pb = document.getElementById('farmProduceBtn');
          if (_pb) _pb.style.display = _dd.length > 0 ? 'block' : 'none';
          const _pn = document.getElementById('farmProduceN');
          if (_pn) _pn.textContent = _dd.length;
          if (_produceModalOpen) renderProduceModal();
        }

        // Animals: wander + drawn renderers, mini happiness bar above
        // Animals stay in the pasture, above the dividing fence (crops are below).
        const penTop = 0.50, penBot = Math.max(0.60, divY - 0.05);
        _drawWorkshopMachines(ctx, W, H, t, night);   // huts behind the herd
        const _blocked = _farmBlockedZones();           // workshop + cart: animals keep out
        const _herd = roomData.farmAnimals || [];
        // Group the herd into one fenced pen per type, then keep each animal in its pen.
        const _pens = _buildAnimalPens(_herd, penTop, penBot);
        _drawAnimalPens(ctx, W, H, _pens.list, night);
        // Even, comfortable animal size: derived from the pasture area and herd size.
        const _bandH = (penBot - penTop) * H, _bandW = 0.90 * W;
        const _aSize = Math.max(28, Math.min(Math.min(W, H) * 0.085, _bandH * 0.80,
                                Math.sqrt((_bandW * _bandH * 0.6) / Math.max(1, _herd.length))));
        let _ai = 0;
        for (const a of _herd) {
          const idx = _ai++;
          const st = _farmAnimState(a, idx, _herd.length);
          const pen = _pens.byType[a.type];
          if (pen && st.penHome !== a.type) {       // first sight: scatter randomly inside the pen (no edge clustering)
            st.x = pen.ix0 + Math.random() * (pen.ix1 - pen.ix0);
            st.y = pen.iy0 + Math.random() * (pen.iy1 - pen.iy0);
            st.tx = st.x; st.ty = st.y; st.penHome = a.type;
          }
          if (t > st.nextWander) {
            // roam to a random spot inside this animal's own pen (avoid huts/cart)
            if (pen) {
              const pw = Math.max(0.001, pen.ix1 - pen.ix0), ph = Math.max(0.001, pen.iy1 - pen.iy0);
              st.tx = pen.ix0 + Math.random() * pw;
              st.ty = pen.iy0 + Math.random() * ph;
              for (let _try = 0; _try < 6 && _inBlocked(st.tx, st.ty, _blocked, 0.02); _try++) {
                st.tx = pen.ix0 + Math.random() * pw;
                st.ty = pen.iy0 + Math.random() * ph;
              }
            }
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
          // keep the animal inside its own pen (also re-homes it if the pen shifts)
          if (pen) {
            st.x = Math.max(pen.ix0, Math.min(pen.ix1, st.x));
            st.y = Math.max(pen.iy0, Math.min(pen.iy1, st.y));
          }
          // shove the animal out of any blocked zone it drifted into (huts/cart)
          for (const z of _blocked) {
            const bdx = st.x - z.x, bdy = st.y - z.y, bd = Math.hypot(bdx, bdy), minR = z.r + 0.02;
            if (bd < minR) {
              if (bd < 1e-4) st.x = z.x + minR;
              else { st.x = z.x + (bdx / bd) * minR; st.y = z.y + (bdy / bd) * minR; }
              st.nextWander = Math.min(st.nextWander, t + 300);
            }
          }
          const px = st.x * W, py = st.y * H;
          const size = _aSize;
          const bob = Math.sin(t / 400 + st.x * 20) * 2;
          // soft ground shadow under the animal -> grounds it in the 3D field
          ctx.fillStyle = night ? 'rgba(0,0,0,.30)' : 'rgba(30,62,20,.24)';
          ctx.beginPath();
          ctx.ellipse(px, py + size * 0.30, size * 0.40, size * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(px, py + bob);
          if (!st.facingRight) ctx.scale(-1, 1); // drawers face right
          // RGB coat: animated rainbow shimmer (filter is reset by ctx.restore()).
          // ~1.8s per full color cycle so it visibly shimmers (was t/14 ≈ 5s, too slow).
          if (a.variant === 'rgb') ctx.filter = 'hue-rotate(' + Math.round((t / 5 + idx * 60) % 360) + 'deg) saturate(1.7)';
          drawFarmAnimal(ctx, a.type, size, t / 120, st.moving, _farmVariantPal(a));
          ctx.restore();
          // Mini happiness bar
          const h = Math.max(0, Math.min(100, a.happiness));
          const bw = size * 0.9, bx = px - bw / 2, byy = py - size * 0.95 + bob;
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fillRect(bx, byy, bw, 4);
          ctx.fillStyle = h > 60 ? '#6dd56d' : h > 30 ? '#f2c94c' : '#eb5757';
          ctx.fillRect(bx, byy, bw * (h / 100), 4);
          // Level badge above the bar
          const lvTxt = 'Lv' + animalLevel(a.collected, FARM_LEVELS);
          ctx.font = '800 ' + Math.round(Math.max(9, size * 0.15)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const lw = ctx.measureText(lvTxt).width + size * 0.16, lh = Math.max(12, size * 0.2);
          const lx = px - lw / 2, ly = byy - lh - 3;
          ctx.fillStyle = 'rgba(20,12,6,.82)';
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, lh / 2); ctx.fill(); } else ctx.fillRect(lx, ly, lw, lh);
          ctx.fillStyle = '#ffd23d';
          ctx.fillText(lvTxt, px, ly + lh / 2 + 0.5);
        }
        _drawPenLabels(ctx, W, H, _pens.list, night);   // pen name tabs on top of the herd

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

        // Sky merchant plane — drawn LAST so drifting clouds never hide the
        // tappable prompt: fly-off animation → hovering plane → away cloud.
        if (viewingUid === currentUid) {
          const _cartS = _farmCart();
          if (_cartLeaveStart && Date.now() - _cartLeaveStart < CART_LEAVE_MS) {
            const lp = (Date.now() - _cartLeaveStart) / CART_LEAVE_MS;
            _drawMerchantCart(ctx, W, H, t, lp * 0.7, 1 - lp * 0.9);  // fly right + fade
          } else {
            if (_cartLeaveStart) _cartLeaveStart = 0;
            if (_cartS.present) _drawMerchantCart(ctx, W, H, t);
            else _drawCartAway(ctx, W, H, t, _cartS);
          }
        }
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
        if (hit) {
          _farmDragDecorId = hit.id;
          _farmDragMoved = false;
          _farmDragStartX = p.x; _farmDragStartY = p.y;
          e.stopPropagation();
          if (e.type === 'mousedown') e.preventDefault();
          return;
        }
      }

      function onMove(e) {
        // Hover tooltip (mouse only, when not dragging): crop time / trough food.
        if (e.type === 'mousemove' && !_farmDragDecorId) {
          const p = pos(e);
          let tip = '';
          if (Math.hypot(p.x - FARM_TROUGH_X, p.y - FARM_TROUGH_Y) < 0.08) {
            tip = '🌾 Food  ' + Math.floor(roomData.farmFood || 0) + ' / ' + farmFoodMax();
          } else {
            const plots = roomData.farmPlots || [];
            for (let i = 0; i < plots.length; i++) {
              const pp = _farmPlotPos(i);
              if (Math.hypot(pp.x - p.x, pp.y - p.y) < 0.045) {
                const plot = plots[i];
                if (!plot.crop) { tip = '🌱 Empty — tap to plant'; }
                else {
                  const crop = FARM_CROPS.find(c => c.id === plot.crop);
                  if (crop) {
                    const left = crop.growMs - (Date.now() - plot.plantedAt);
                    tip = left <= 0 ? (crop.emoji + ' Ready to harvest!') : (crop.emoji + ' ' + _fmtFarmTime(left) + ' left');
                  }
                }
                break;
              }
            }
          }
          if (tip) _showFarmTip(tip, e); else _hideFarmTip();
          cvs.style.cursor = tip ? 'pointer' : 'default';
        }

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
      cvs.onmouseleave = () => { _hideFarmTip(); };
      cvs.ontouchstart = onDown;
      cvs.ontouchmove = onMove;
      cvs.ontouchend = onUp;

      cvs.onclick = (e) => {
        closeCropPicker();   // any tap dismisses an open picker
        if (_farmDragSuppressClick) { _farmDragSuppressClick = false; return; }
        // Tap outside the sell sheet (anywhere on the farm) closes it — taps on
        // the sheet itself hit its own buttons and never reach this canvas.
        if (_cartSheetOpen) { closeCartSheet(); return; }
        if (viewingUid !== currentUid) { closeCartSheet(); return; }
        const rect = cvs.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width;
        const cy = (e.clientY - rect.top) / rect.height;

        // Machine huts FIRST (their specific targets must win over the cart's big
        // zone) — nearest owned hut within a finger-friendly radius. Picks the
        // NEAREST owned hut, so a generous radius can't cause mis-selection.
        const _wm = roomData.farmMachines || {};
        let _hi = -1, _hd = 0.13;
        for (let _s = 0; _s < FARM_MACHINES.length; _s++) {
          const _mm = FARM_MACHINES[_s];
          if (_wm[_mm.id] && _wm[_mm.id].owned) {
            const _p = _workshopPos(_s);
            const _d = Math.hypot(_p.x - cx, _p.y - cy);
            if (_d < _hd) { _hd = _d; _hi = _s; }
          }
        }
        if (_hi >= 0) { openMachineModal(FARM_MACHINES[_hi].id); return; }

        // Sky plane / away cloud: big tap zone covering the plane AND its trailing
        // "Tap to sell!" banner (which streams out to the left of the body).
        if (Math.hypot(FARM_CART_X - cx, FARM_CART_Y - cy) < 0.18) { openCartSheet(); return; }
        closeCartSheet();   // tapping elsewhere on the farm dismisses the sheet

        // Garden strip: any tap picks the nearest plot OR signboard, then acts on
        // that whole row (plant / harvest / status). No precision needed on phones.
        const plots = roomData.farmPlots || [];
        if (plots.length && cy > 0.65) {
          let rowIdx = 0, best = Infinity;
          for (let i = 0; i < plots.length; i++) {
            const pp = _farmPlotPos(i);
            const d = Math.hypot(pp.x - cx, pp.y - cy);
            if (d < best) { best = d; rowIdx = Math.floor(i / 7); }
          }
          const _rows = farmRowCount(plots.length, 7);
          for (let r = 0; r < _rows; r++) {
            const sp = _farmSignPos(r);
            const d = Math.hypot(sp.x - cx, sp.y - cy);
            if (d < best) { best = d; rowIdx = r; }
          }
          _farmRowClick(rowIdx);
          return;
        }

        // Tapping any produce on the ground opens the Produce modal (collect there).
        for (const d of (roomData.farmDrops || [])) {
          if (Math.hypot(d.x - cx, d.y - cy) < 0.07) { openProduceModal(); return; }
        }

        // Tap an animal → open its status panel (stats + pet / butcher)
        let hitAnimal = null, aDist = 0.10;
        for (const a of (roomData.farmAnimals || [])) {
          const st = _farmAnimStates[a.id];
          if (!st) continue;
          const dist = Math.hypot(st.x - cx, st.y - cy);
          if (dist < aDist) { aDist = dist; hitAnimal = a; }
        }
        if (hitAnimal) openAnimalModal(hitAnimal.id);
      };
    }
