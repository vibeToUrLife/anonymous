    /* ═══════════════════════════════
       Farm view — outside farm with animals that produce coin drops.
       All animals eat from one shared trough (refill with coins); fed
       animals get happier and produce faster. Pure math in room-farm.js,
       constants in room-base.js, animal drawers in pets/farm-animals.js.
       Reuses the outside scene's sky/hills/fence drawers (shared globals).
       ═══════════════════════════════ */
    let isFarmView = false;
    let _farmTab = 'animals';   // active sub-tab inside the farm's own tab bar
    let _farmAnimFrame = null;
    let _farmTickInterval = null;
    let _farmAnimStates = {};   // ephemeral wander state per animal id (not saved)
    let _farmParticles = [];    // floating hearts / +coins effects
    let _farmDropSeq = 0;
    let _selectedCrop = 'wheat'; // crop planted when you tap an empty plot
    let _farmHerdCollapsed = null; // null = auto; true/false once the user toggles
    const FARM_HERD_COLLAPSE_AT = 4; // herd longer than this auto-collapses the list
    let _farmButcherConfirmId = null; // animal id awaiting butcher confirmation
    let _cartSheetOpen = false;       // merchant-cart sell sheet visible?
    let _cartSoldThisVisit = false;   // sold to the cart this visit → it leaves on close
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
    const FARM_CART_X = 0.84, FARM_CART_Y = 0.50; // where the cart parks (normalized)

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

    // Screen-normalized position of garden plot index i (a row near the bottom).
    // Plots laid out in rows of 10 across the soil strip (fits up to FARM_PLOT_MAX).
    function _farmPlotPos(i) {
      const perRow = 10;
      const col = i % perRow, row = Math.floor(i / perRow);
      return { x: 0.09 + col * 0.087, y: 0.82 + row * 0.075 };
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

    function openFarm() {
      isFarmView = true;
      _cartSoldThisVisit = false;
      document.getElementById('farmView')?.classList.add('visible');
      _setFarmPanelMode(true);
      _syncRoomPanel();   // hide the side panel; widens the stage before we draw
      const isOwner = viewingUid === currentUid;
      if (isOwner) {
        let _changed = false;
        if ((roomData.farmDecors || []).length) { roomData.farmDecors = []; _changed = true; } // decor feature removed
        if (runFarmProduction() > 0) _changed = true;
        if (_ensureFarmOrders()) _changed = true;
        if (_changed) saveRoom();
      }
      renderFarmPanel();
      drawFarmCanvas();
      // Herd eats + produces once a minute while the farm is open (owner only).
      clearInterval(_farmTickInterval);
      if (isOwner) {
        _farmTickInterval = setInterval(() => {
          if (document.hidden || !isFarmView) return;
          if (runFarmProduction() > 0) saveRoom();
          renderFarmPanel(); // keep food count + happiness fresh
        }, 60 * 1000);
      }
    }

    function closeFarm() {
      isFarmView = false;
      closeCropPicker();
      closeCartSheet();
      closeRgbPreview();
      closeWorkshopModal();
      closeAnimalModal();
      closeProduceModal();
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
          '<div class="farm-panel-hint">You\'re visiting — cheer to show some love!</div>';
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
      const stockHtml =
        cartHtml +
        '<div class="farm-section-title" style="margin-top:12px">📦 Produce</div>' +
        (!stockIds.length
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
              const mark = a.variant === 'rgb' ? ' 🌈' : ((FARM_VARIANTS[a.type] || []).some(v => v.id === a.variant && v.rare) ? ' ✨' : '');
              const butcherCtl = _farmButcherConfirmId === a.id
                ? '<span class="farm-butcher-confirm"><button class="farm-mini-btn danger" onclick="butcherAnimal(\'' + a.id + '\')">✓ Butcher</button><button class="farm-mini-btn" onclick="cancelButcher()">✗</button></span>'
                : '<button class="farm-mini-btn" title="Butcher for meat" onclick="askButcher(\'' + a.id + '\')">🔪</button>';
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
          '👆 Tap a plot to pick a seed.<br>' +
          '✋ <b>Hold and drag</b> across plots to plant a whole row at once.<br>' +
          '⏳ Tap any ripe crop to harvest <b>everything that\'s ready</b>.' +
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

      const card = (s) => '<section class="farm-card">' + s + '</section>';
      // The farm page is long, so it's split into its own tabs.
      const FARM_TABS = [
        { id: 'animals',  label: '🐮 Animals' },
        { id: 'garden',   label: '🌱 Garden' },
        { id: 'market',   label: '📦 Market' },
        { id: 'upgrades', label: '⚙️ Upgrades' },
      ];
      const groups = {
        animals:  card(foodHtml) + card(herdHtml) + card(shopHtml),
        garden:   card(gardenHtml) + card(buildHtml),
        market:   card(stockHtml) + card(ordersHtml),
        upgrades: card(upgradesHtml),
      };
      const hints = {
        animals:  'Keep the trough filled — fed animals are happy and produce faster!',
        garden:   'Plant on the farm soil. Build machines here — then tap a machine on your farm to make goods.',
        market:   'Tap produce on the farm to collect it, then sell it or fill the daily orders.',
        upgrades: 'Expand your farm, automate collecting, and drag decor to arrange it.',
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
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock[recipe.out.id] = (roomData.farmStock[recipe.out.id] || 0) + recipe.out.qty;
      m.jobs[slot] = 0;
      await saveRoom();
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
    function selectFarmCrop(id) { _selectedCrop = id; renderFarmPanel(); }

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

    // Tap a plot: plant the selected seed if empty, harvest if ripe, else show time.
    function _plantOrHarvestPlot(plot, pos) {
      const now = Date.now();
      if (!plot.crop) {
        const crop = FARM_CROPS.find(c => c.id === _selectedCrop);
        if (!crop) return;
        if (roomData.coins < crop.seedCost) return showToast('Not enough coins for ' + crop.name + ' seed!', 'error');
        roomData.coins -= crop.seedCost;
        plot.crop = crop.id; plot.plantedAt = now;
        _farmParticles.push({ text: crop.emoji, x: pos.x, y: pos.y - 0.05, vy: -0.0008, life: 900, born: performance.now() });
        saveRoom(); renderFarmPanel(); renderAll();
        return;
      }
      const crop = FARM_CROPS.find(c => c.id === plot.crop);
      if (!crop) { plot.crop = null; plot.plantedAt = 0; saveRoom(); return; }
      if (cropProgress(plot.plantedAt, now, crop.growMs) < 1) {
        const left = Math.ceil((crop.growMs - (now - plot.plantedAt)) / 60000);
        return showToast(crop.emoji + ' ' + crop.name + ' growing — ' + left + 'm left', '');
      }
      // Ripe → one tap collects EVERY ready crop, not just this one.
      harvestAllFarm();
    }

    /* ── Crop picker (tap an empty plot) + plant helpers ── */
    function _fmtFarmTime(ms) {
      const m = Math.max(0, Math.ceil(ms / 60000));
      if (m < 60) return m + 'm';
      return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
    }

    // Plant the currently-armed seed (_selectedCrop) into plot i. Silent on
    // failure so drag-planting just stops when you run out of coins.
    function _plantArmed(i) {
      const plot = (roomData.farmPlots || [])[i];
      if (!plot || plot.crop) return false;
      const crop = FARM_CROPS.find(c => c.id === _selectedCrop);
      if (!crop || roomData.coins < crop.seedCost) return false;
      roomData.coins -= crop.seedCost;
      plot.crop = crop.id; plot.plantedAt = Date.now();
      const pos = _farmPlotPos(i);
      _farmParticles.push({ text: crop.emoji, x: pos.x, y: pos.y - 0.05, vy: -0.0008, life: 900, born: performance.now() });
      return true;
    }

    function openCropPicker(plotIndex) {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      picker.innerHTML =
        '<div class="cp-head">🌱 Plant what?</div>' +
        FARM_CROPS.map(c => {
          const afford = roomData.coins >= c.seedCost;
          return '<button class="cp-crop"' + (afford ? '' : ' disabled') + ' onclick="pickCrop(' + plotIndex + ',\'' + c.id + '\')">' +
            '<span class="cp-emoji">' + c.emoji + '</span>' +
            '<span class="cp-info"><b>' + c.name + '</b><small>grows in ' + _fmtFarmTime(c.growMs) + '</small></span>' +
            '<span class="cp-cost">' + c.seedCost + '🪙</span>' +
            '</button>';
        }).join('') +
        '<div class="farm-panel-empty" style="padding:2px 2px 0">✋ Hold &amp; drag across plots to plant a whole row.</div>' +
        '<button class="cp-close" onclick="closeCropPicker()">Close</button>';
      picker.style.display = 'block';
    }
    function closeCropPicker() {
      const p = document.getElementById('cropPicker');
      if (p) p.style.display = 'none';
    }
    function pickCrop(plotIndex, cropId) {
      _selectedCrop = cropId;
      closeCropPicker();
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (crop && roomData.coins < crop.seedCost) return showToast('Not enough coins for ' + crop.name + ' seed!', 'error');
      if (plotIndex != null && _plantArmed(plotIndex)) { saveRoom(); renderFarmPanel(); renderAll(); }
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
    // produce/drops — those are ingredients. Wanted-list prefers made goods you
    // currently have in stock, padded with other made goods.
    function _cartBuildWanted(visitStart) {
      const stock = roomData.farmStock || {};
      const made = {};
      FARM_MACHINES.forEach(m => m.recipes.forEach(r => { made[r.out.id] = true; }));
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
    // Cart state for `now`: the cart PARKS and waits (present) until you sell to
    // it; after a sale it leaves for FARM_CART_COOLDOWN_MS, then returns.
    // `farmCartLeftAt` (persisted) = when it last left. Wanted-list is built live
    // from your current made-goods stock, with stable per-item quotas.
    function _farmCart(now) {
      now = now || Date.now();
      const left = roomData.farmCartLeftAt || 0;
      const present = !left || (now - left) >= FARM_CART_COOLDOWN_MS;
      const visitStart = left ? (left + FARM_CART_COOLDOWN_MS) : 0;
      return {
        present: present,
        wanted: _cartBuildWanted(visitStart),
        visitStart: visitStart,
        nextInMs: present ? 0 : (FARM_CART_COOLDOWN_MS - (now - left)),
      };
    }

    // Draw the parked merchant wagon. offsetX/alpha let the render loop slide it
    // off-screen + fade it for the leave animation.
    function _drawMerchantCart(ctx, W, H, t, offsetX, alpha) {
      const cx = (FARM_CART_X + (offsetX || 0)) * W, cy = FARM_CART_Y * H;
      const s = Math.max(40, Math.min(W, H) * 0.11);
      ctx.save();
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(30,62,20,.22)';                      // ground shadow
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.44, s * 0.58, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      // wheels
      [-s * 0.28, s * 0.28].forEach(dx => {
        ctx.fillStyle = '#5b3a22'; ctx.beginPath(); ctx.arc(cx + dx, cy + s * 0.36, s * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#caa46a'; ctx.beginPath(); ctx.arc(cx + dx, cy + s * 0.36, s * 0.06, 0, Math.PI * 2); ctx.fill();
      });
      // body
      ctx.fillStyle = '#9b6b3f';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx - s * 0.44, cy - s * 0.06, s * 0.88, s * 0.44, s * 0.07); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx - s * 0.44, cy + s * 0.18, s * 0.88, s * 0.20, s * 0.06); ctx.fill(); }
      // striped awning + scalloped edge
      const ax = cx - s * 0.5, ay = cy - s * 0.42, seg = s / 5;
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#e8533f'; ctx.fillRect(ax + i * seg, ay, seg, s * 0.18); }
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#e8533f'; ctx.beginPath(); ctx.arc(ax + (i + 0.5) * seg, ay + s * 0.18, s * 0.05, 0, Math.PI); ctx.fill(); }
      // produce basket
      ctx.font = Math.round(s * 0.36) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🧺', cx, cy + s * 0.12);
      // floating prompt
      const bob = Math.sin(t / 300) * 3;
      ctx.font = '800 ' + Math.round(Math.max(11, s * 0.17)) + 'px sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.fillStyle = '#fff';
      ctx.strokeText('Tap to sell!', cx, cy - s * 0.64 + bob);
      ctx.fillText('Tap to sell!', cx, cy - s * 0.64 + bob);
      ctx.restore();
    }

    // Draw a signpost where the cart parks while it's AWAY — tap it for the
    // countdown + what the next cart will want.
    function _drawCartAway(ctx, W, H, t, cart) {
      const cx = FARM_CART_X * W, cy = FARM_CART_Y * H, s = Math.max(34, Math.min(W, H) * 0.095);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(30,62,20,.18)';                       // shadow
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.42, s * 0.4, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5230';                                  // post
      ctx.fillRect(cx - s * 0.05, cy - s * 0.28, s * 0.1, s * 0.7);
      ctx.fillStyle = '#caa46a';                                  // sign board
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx - s * 0.42, cy - s * 0.52, s * 0.84, s * 0.4, s * 0.06); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,.12)'; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx - s * 0.42, cy - s * 0.18, s * 0.84, s * 0.06, s * 0.03); ctx.fill(); }
      ctx.font = Math.round(s * 0.24) + 'px serif'; ctx.fillText('🛒', cx, cy - s * 0.4);
      ctx.font = '800 ' + Math.round(Math.max(9, s * 0.13)) + 'px sans-serif'; ctx.fillStyle = '#4a3320';
      ctx.fillText(_fmtFarmTime(cart.nextInMs), cx, cy - s * 0.22);
      ctx.restore();
    }

    // Fixed slot position for machine `slot` (its hut). Kept left of the cart's
    // tap zone (cart at x 0.84, r 0.14) so taps never collide.
    function _workshopPos(slot) { return { x: 0.22 + slot * 0.11, y: 0.45 }; }

    // Zones animals must not walk into: owned machine huts + the cart (when here).
    function _farmBlockedZones() {
      const zones = [];
      const machines = roomData.farmMachines || {};
      FARM_MACHINES.forEach((m, slot) => {
        if (machines[m.id] && machines[m.id].owned) { const p = _workshopPos(slot); zones.push({ x: p.x, y: p.y, r: 0.06 }); }
      });
      if (_farmCart().present) zones.push({ x: FARM_CART_X, y: FARM_CART_Y, r: 0.08 });
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
        const cx = p.x * W, cy = p.y * H, s = Math.max(30, Math.min(W, H) * 0.085);
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
      if (cart.visitStart !== _cartVisitKey) { _cartSold = {}; _cartVisitKey = cart.visitStart; }  // fresh visit
      _cartSheetOpen = true; renderCartSheet();
    }
    function _hideCartSheet() {
      _cartSheetOpen = false;
      const el = document.getElementById('cartSheet');
      if (el) el.style.display = 'none';
    }
    function closeCartSheet() {
      // Sold via single taps this visit → roll the cart off (no auto next-modal).
      if (_cartSoldThisVisit) { _departCart(false); return; }
      _hideCartSheet();
    }
    // Send the cart off: start the roll-off animation + 4h cooldown. showNext pops
    // the next-cart info modal once the wagon has left.
    function _departCart(showNext) {
      roomData.farmCartLeftAt = Date.now();
      _cartSoldThisVisit = false; _cartSold = {};
      _cartLeaveStart = Date.now();
      _hideCartSheet();
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
      // Present → one square per sellable unit (tap to sell one → that square closes).
      let squares = '';
      cart.wanted.forEach(w => {
        const m = meta[w.id] || { emoji: '❓', name: w.id };
        const n = _cartSellable(w, stock);
        for (let k = 0; k < n; k++) {
          squares += '<button class="cart-sq" onclick="sellOneToCart(\'' + w.id + '\')">' +
            '<span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap">+' + (prices[w.id] || 0) + '🪙</span></button>';
        }
      });
      const wantsLine = cart.wanted.map(w => (meta[w.id] || { emoji: '❓' }).emoji + '×' + Math.max(0, w.qty - (_cartSold[w.id] || 0))).join('  ');
      el.innerHTML =
        '<div class="cp-head">🛒 Merchant Cart</div>' +
        '<div class="farm-panel-empty" style="padding:0 2px 4px">Wants: ' + wantsLine + ' · tap a square to sell one, then it\'s off for 4h.</div>' +
        (squares
          ? '<div class="cart-grid">' + squares + '</div>' +
            '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="sellAllToCart()">💰 Sell all it wants</button>'
          : '<div class="ws-status">Nothing it wants in your stock right now.</div>' +
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
      _cartSoldThisVisit = true;   // cart leaves when the sheet is closed
      await saveRoom();
      const m = farmProductMeta()[prodId];
      showToast('Sold 1 ' + (m ? m.emoji + ' ' + m.name : prodId) + ' for ' + price + '🪙', 'success');
      checkAchievements();
      renderCartSheet(); renderFarmPanel(); renderAll();
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
      showToast('🛒 Sold ' + sold + ' items for ' + total + '🪙! The cart rolls on.', 'success');
      checkAchievements();
      renderFarmPanel(); renderAll();
      _departCart(true);   // roll-off animation, then show the next-cart modal
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
          ctx.filter = 'hue-rotate(' + Math.round((t / 14) % 360) + 'deg) saturate(1.7)';
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

    // Garden plots: brown soil tiles; growing crops show a progress bar, ripe
    // crops bob with a ✨ to invite a harvest tap.
    function _drawFarmPlots(ctx, W, H, t) {
      const plots = roomData.farmPlots || [];
      const now = Date.now();
      const tile = Math.max(22, Math.min(W, H) * 0.05);
      ctx.textAlign = 'center';
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
        let _ai = 0;
        for (const a of _herd) {
          const idx = _ai++;
          const st = _farmAnimState(a, idx, _herd.length);
          if (t > st.nextWander) {
            // each animal roams within its own lane -> stays spread across the pasture
            const lane = (idx + 0.5) / Math.max(1, _herd.length);
            const laneW = 0.80 / Math.max(1, _herd.length);
            st.tx = Math.max(0.08, Math.min(0.92, 0.10 + lane * 0.80 + (Math.random() - 0.5) * laneW));
            st.ty = penTop + Math.random() * (penBot - penTop);
            // don't pick a spot on the workshop or the cart — re-roll if blocked
            for (let _try = 0; _try < 6 && _inBlocked(st.tx, st.ty, _blocked, 0.02); _try++) {
              st.tx = Math.max(0.08, Math.min(0.92, 0.10 + Math.random() * 0.80));
              st.ty = penTop + Math.random() * (penBot - penTop);
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
          // shove the animal out of any blocked zone it drifted into
          for (const z of _blocked) {
            const bdx = st.x - z.x, bdy = st.y - z.y, bd = Math.hypot(bdx, bdy), minR = z.r + 0.02;
            if (bd < minR) {
              if (bd < 1e-4) st.x = z.x + minR;
              else { st.x = z.x + (bdx / bd) * minR; st.y = z.y + (bdy / bd) * minR; }
              st.nextWander = Math.min(st.nextWander, t + 300);
            }
          }
          st.y = Math.max(penTop, Math.min(penBot, st.y));
          const px = st.x * W, py = st.y * H;
          const size = Math.max(34, Math.min(W, H) * 0.085);
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
          if (a.variant === 'rgb') ctx.filter = 'hue-rotate(' + Math.round((t / 14 + idx * 60) % 360) + 'deg) saturate(1.7)';
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

        // Merchant cart: rolling-off animation → present wagon → away signpost
        if (viewingUid === currentUid) {
          const _cartS = _farmCart();
          if (_cartLeaveStart && Date.now() - _cartLeaveStart < CART_LEAVE_MS) {
            const lp = (Date.now() - _cartLeaveStart) / CART_LEAVE_MS;
            _drawMerchantCart(ctx, W, H, t, lp * 0.55, 1 - lp * 0.85);  // roll right + fade
          } else {
            if (_cartLeaveStart) _cartLeaveStart = 0;
            if (_cartS.present) _drawMerchantCart(ctx, W, H, t);
            else _drawCartAway(ctx, W, H, t, _cartS);
          }
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
    const FARM_PLOT_HIT = 0.06;       // tap radius around a plot (bigger = easier on mobile)
    let _farmPlantStartIdx = null;    // empty plot a plant-drag started on
    let _farmPlantDrag = false;       // dragging across plots to plant the armed seed
    let _farmPlantedSet = null;       // plot indices already planted this drag

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
        // Press anywhere in the crop field (bottom strip) → arm a sow-drag, so a
        // swipe across plots plants them. A plain tap still opens the picker /
        // harvests via onclick. (Plots live at y≈0.82 & 0.90, well below animals.)
        if (p.y > 0.75) {
          _farmPlantStartIdx = 1; _farmPlantDrag = false; _farmPlantedSet = new Set();
          _farmDragStartX = p.x; _farmDragStartY = p.y;
        }
      }

      function onMove(e) {
        // Plant-drag: paint the armed seed across empty plots.
        if (_farmPlantStartIdx != null) {
          const p = pos(e);
          if (!_farmPlantDrag) {
            const dx = p.x - _farmDragStartX, dy = p.y - _farmDragStartY;
            if (dx * dx + dy * dy < FARM_DRAG_THRESHOLD * FARM_DRAG_THRESHOLD) return;
            _farmPlantDrag = true;
            _hideFarmTip();
          }
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          const plots = roomData.farmPlots || [];
          for (let i = 0; i < plots.length; i++) {
            if (_farmPlantedSet.has(i)) continue;
            const pp = _farmPlotPos(i);
            if (Math.hypot(pp.x - p.x, pp.y - p.y) < FARM_PLOT_HIT && _plantArmed(i)) _farmPlantedSet.add(i);
          }
          return;
        }

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
        // End a plant-drag (a non-moving press falls through to the click → picker).
        if (_farmPlantStartIdx != null) {
          if (_farmPlantDrag) {
            _farmDragSuppressClick = true;
            saveRoom(); renderFarmPanel(); renderAll();
            if (e && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }
          _farmPlantStartIdx = null; _farmPlantDrag = false; _farmPlantedSet = null;
          return;
        }
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
        if (viewingUid !== currentUid) { closeCartSheet(); return; }
        const rect = cvs.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width;
        const cy = (e.clientY - rect.top) / rect.height;

        // Machine huts FIRST (their small, specific targets must win over the
        // cart's big zone) — nearest owned hut within a generous radius.
        const _wm = roomData.farmMachines || {};
        let _hi = -1, _hd = 0.09;
        for (let _s = 0; _s < FARM_MACHINES.length; _s++) {
          const _mm = FARM_MACHINES[_s];
          if (_wm[_mm.id] && _wm[_mm.id].owned) {
            const _p = _workshopPos(_s);
            const _d = Math.hypot(_p.x - cx, _p.y - cy);
            if (_d < _hd) { _hd = _d; _hi = _s; }
          }
        }
        if (_hi >= 0) { openMachineModal(FARM_MACHINES[_hi].id); return; }

        // Merchant cart / away signpost: big tap zone (sell sheet, or next-cart info).
        if (Math.hypot(FARM_CART_X - cx, FARM_CART_Y - cy) < 0.14) { openCartSheet(); return; }
        closeCartSheet();   // tapping elsewhere on the farm dismisses the sheet

        // Garden plots first: pick the NEAREST plot within the tap radius (easier
        // to hit on mobile than the old first-within-a-tight-circle test).
        const plots = roomData.farmPlots || [];
        let plotIdx = -1, plotDist = FARM_PLOT_HIT;
        for (let i = 0; i < plots.length; i++) {
          const pp = _farmPlotPos(i);
          const d = Math.hypot(pp.x - cx, pp.y - cy);
          if (d < plotDist) { plotDist = d; plotIdx = i; }
        }
        if (plotIdx >= 0) {
          const pos = _farmPlotPos(plotIdx);
          if (!plots[plotIdx].crop) openCropPicker(plotIdx);
          else _plantOrHarvestPlot(plots[plotIdx], pos);
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
