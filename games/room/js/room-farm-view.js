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
        levels: FARM_LEVELS,
        levelSpeedup: FARM_LEVEL_SPEEDUP,
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
      if (roomData.farmAutoCollect) _autoCollectAll(); // straight into stock, no tapping
      return plan.spawns.length;
    }

    // Current animal cap (base + expansions).
    function farmAnimalCap() {
      return FARM_MAX_ANIMALS + 10 * (roomData.farmCapLevel || 0);
    }

    // Screen-normalized position of garden plot index i (a row near the bottom).
    function _farmPlotPos(i) {
      return { x: 0.30 + i * 0.085, y: 0.86 };
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
      document.getElementById('farmView')?.classList.add('visible');
      _setFarmPanelMode(true);
      const isOwner = viewingUid === currentUid;
      if (isOwner) {
        const _ch1 = runFarmProduction() > 0;
        const _ch2 = _ensureFarmOrders();
        if (_ch1 || _ch2) saveRoom();
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
      document.getElementById('farmView')?.classList.remove('visible');
      _setFarmPanelMode(false);
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

      // Produce stock — collected products, each sellable (Sell / Sell all)
      const prices = farmProductPrices(), meta = farmProductMeta();
      const stock = roomData.farmStock || {};
      const stockIds = Object.keys(stock).filter(k => stock[k] > 0);
      const sellAllVal = farmSellAllValue(stock, prices);
      const stockHtml =
        '<div class="farm-section-title">📦 Produce' +
          (sellAllVal > 0 ? ' <button class="farm-shop-buy" onclick="sellAllFarm()">Sell all · ' + sellAllVal + '🪙</button>' : '') +
        '</div>' +
        (!stockIds.length
          ? '<div class="farm-panel-empty">Tap produce on the farm to collect it here.</div>'
          : stockIds.map(id => {
              const m = meta[id] || { emoji: '❓', name: id };
              return '<div class="farm-shop-row">' +
                '<span class="farm-shop-animal">' + m.emoji + ' ' + m.name + ' <small>×' + stock[id] + '</small></span>' +
                '<span class="farm-shop-drop">' + (prices[id] || 0) + '🪙 ea</span>' +
                '<button class="farm-shop-buy" onclick="sellFarmProduct(\'' + id + '\')">Sell ' + (stock[id] * (prices[id] || 0)) + '🪙</button>' +
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
              const lvl = animalLevel(a.collected, FARM_LEVELS);
              const waiting = dropCounts[a.id] || 0;
              return '<div class="farm-herd-row">' +
                '<span class="farm-herd-emoji">' + def.emoji + '</span>' +
                '<span class="farm-herd-info">' +
                  '<span class="farm-herd-name">' + def.name + ' <small>Lv' + lvl + '</small> · ' + h + '%</span>' +
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

      // Garden: plot count + Add-plot, and crop seeds you can select to plant
      const plots = roomData.farmPlots || [];
      const usedPlots = plots.filter(p => p.crop).length;
      const gardenHtml =
        '<div class="farm-section-title">🌱 Garden ' +
          (plots.length < FARM_PLOT_MAX
            ? '<button class="farm-shop-buy" onclick="addFarmPlot()"' + (roomData.coins < FARM_PLOT_COST ? ' disabled' : '') + '>+ Plot · ' + FARM_PLOT_COST + '🪙</button>'
            : '<span class="farm-panel-cap">' + plots.length + ' plots</span>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding-bottom:2px">' + usedPlots + '/' + plots.length + ' plots planted · tap soil on the farm to plant the selected seed</div>' +
        FARM_CROPS.map(c => {
          const sel = _selectedCrop === c.id;
          const yld = c.yield.food ? ('+' + c.yield.food + ' 🌾food') : (FARM_PRODUCTS[c.yield.product].emoji + ' ' + farmProductPrices()[c.yield.product] + '🪙');
          return '<div class="farm-shop-row" style="' + (sel ? 'background:rgba(247,201,126,.12);border-radius:8px' : '') + '">' +
            '<span class="farm-shop-animal">' + c.emoji + ' ' + c.name + ' <small>' + Math.round(c.growMs / 60000) + 'm → ' + yld + '</small></span>' +
            '<button class="farm-shop-buy" onclick="selectFarmCrop(\'' + c.id + '\')">' + (sel ? '✓ Seed ' : 'Seed ') + c.seedCost + '🪙</button>' +
            '</div>';
        }).join('');

      // Workshop: processing machines (buy → make → collect)
      const machines = roomData.farmMachines || {};
      const nowMs = Date.now();
      const workshopHtml =
        '<div class="farm-section-title">🏭 Workshop</div>' +
        FARM_MACHINES.map(mc => {
          const st = machines[mc.id] || {};
          const inStr = Object.keys(mc.in).map(id => (meta[id] ? meta[id].emoji : id) + '×' + mc.in[id]).join('+');
          const outM = meta[mc.out.id] || { emoji: '❓' };
          const recipe = inStr + ' → ' + outM.emoji;
          let right;
          if (!st.owned) {
            right = '<button class="farm-shop-buy" onclick="buyFarmMachine(\'' + mc.id + '\')"' + (roomData.coins < mc.cost ? ' disabled' : '') + '>' + mc.cost + '🪙</button>';
          } else if (st.startedAt) {
            const prog = cropProgress(st.startedAt, nowMs, mc.timeMs);
            right = prog >= 1
              ? '<button class="farm-shop-buy" onclick="collectFarmMachine(\'' + mc.id + '\')">Collect ' + outM.emoji + '</button>'
              : '<span class="farm-shop-drop">' + Math.ceil((mc.timeMs - (nowMs - st.startedAt)) / 60000) + 'm</span>';
          } else {
            const canStart = Object.keys(mc.in).every(id => (stock[id] || 0) >= mc.in[id]);
            right = '<button class="farm-shop-buy" onclick="startFarmMachine(\'' + mc.id + '\')"' + (canStart ? '' : ' disabled') + '>Make</button>';
          }
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + mc.emoji + ' ' + mc.name + ' <small>' + recipe + '</small></span>' + right +
            '</div>';
        }).join('');

      const expLvl = roomData.farmCapLevel || 0;
      const expandCost = expLvl < FARM_EXPAND_COSTS.length ? FARM_EXPAND_COSTS[expLvl] : null;
      const upgradesHtml =
        '<div class="farm-section-title">⚙️ Upgrades</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🏞️ Expand farm <small>cap ' + farmAnimalCap() + '</small></span>' +
          (expandCost == null
            ? '<span class="farm-shop-drop">MAX</span>'
            : '<button class="farm-shop-buy" onclick="expandFarm()"' + (roomData.coins < expandCost ? ' disabled' : '') + '>+10 · ' + expandCost + '🪙</button>') +
        '</div>' +
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
        { id: 'upgrades', label: '⚙️ More' },
      ];
      const groups = {
        animals:  card(foodHtml) + card(herdHtml) + card(shopHtml),
        garden:   card(gardenHtml) + card(workshopHtml),
        market:   card(stockHtml) + card(ordersHtml),
        upgrades: card(upgradesHtml) + card(decorHtml),
      };
      const hints = {
        animals:  'Keep the trough filled — fed animals are happy and produce faster!',
        garden:   'Tap soil on the farm to plant the selected seed; process crops in the Workshop.',
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
      if (roomData.farmAnimals.length >= farmAnimalCap()) return showToast('Farm is full! (' + farmAnimalCap() + ' max) — expand it for more.', 'error');
      if (roomData.coins < def.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= def.cost;
      const now = Date.now();
      // Roll a coat variant (first = common default, second = rare).
      const variants = FARM_VARIANTS[def.id] || [];
      const variant = (variants.length > 1 && Math.random() < FARM_RARE_CHANCE) ? variants[1] : (variants[0] || { id: null });
      roomData.farmAnimals.push({
        id: 'fa' + now + '_' + Math.floor(Math.random() * 1e4),
        type: def.id,
        variant: variant.id,
        collected: 0,
        happiness: FARM_START_HAPPINESS,
        lastDropTime: now,
        posX: 0.15 + Math.random() * 0.7,
        posY: 0.55 + Math.random() * 0.3,
      });
      roomData.farmVariants = roomData.farmVariants || {};
      roomData.farmVariants[def.id + '_' + (variant.id || 'default')] = true;
      if (!roomData.farmFoodAt) roomData.farmFoodAt = now; // start the feeding clock
      await saveRoom();
      showToast((variant.rare ? '✨ Rare ' + variant.name + ' ' : def.emoji + ' ') + def.name + ' joined your farm!', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll(); // refresh coin counter
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

    /* ── Workshop (processing machines) ── */
    async function buyFarmMachine(id) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id);
      if (!mc) return;
      roomData.farmMachines = roomData.farmMachines || {};
      if (roomData.farmMachines[id] && roomData.farmMachines[id].owned) return;
      if (roomData.coins < mc.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= mc.cost;
      roomData.farmMachines[id] = { owned: true, startedAt: 0 };
      await saveRoom();
      showToast(mc.emoji + ' ' + mc.name + ' built!', 'success');
      renderFarmPanel();
      renderAll();
    }

    async function startFarmMachine(id) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id);
      const st = (roomData.farmMachines || {})[id];
      if (!mc || !st || !st.owned || st.startedAt) return;
      const stockNow = roomData.farmStock || {};
      if (!Object.keys(mc.in).every(k => (stockNow[k] || 0) >= mc.in[k])) return showToast('Not enough ingredients!', 'error');
      Object.keys(mc.in).forEach(k => { stockNow[k] -= mc.in[k]; });
      roomData.farmStock = stockNow;
      st.startedAt = Date.now();
      await saveRoom();
      showToast(mc.emoji + ' ' + mc.name + ' started…', 'success');
      renderFarmPanel();
      renderAll();
    }

    async function collectFarmMachine(id) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id);
      const st = (roomData.farmMachines || {})[id];
      if (!mc || !st || !st.owned || !st.startedAt) return;
      if (cropProgress(st.startedAt, Date.now(), mc.timeMs) < 1) return showToast('Still processing…', '');
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock[mc.out.id] = (roomData.farmStock[mc.out.id] || 0) + mc.out.qty;
      st.startedAt = 0;
      await saveRoom();
      const outM = farmProductMeta()[mc.out.id];
      showToast('Collected ' + mc.out.qty + ' ' + (outM ? outM.emoji + ' ' + outM.name : mc.out.id) + '!', 'success');
      renderFarmPanel();
      renderAll();
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
      // Ripe → harvest
      if (crop.yield.food) {
        roomData.farmFood = Math.min(FARM_FOOD_MAX, (roomData.farmFood || 0) + crop.yield.food);
        if (!roomData.farmFoodAt) roomData.farmFoodAt = now;
        _farmParticles.push({ text: '+' + crop.yield.food + ' 🌾', x: pos.x, y: pos.y - 0.05, vy: -0.0009, life: 1200, born: performance.now() });
      } else {
        roomData.farmStock = roomData.farmStock || {};
        roomData.farmStock[crop.yield.product] = (roomData.farmStock[crop.yield.product] || 0) + crop.yield.qty;
        const m = FARM_PRODUCTS[crop.yield.product];
        _farmParticles.push({ text: '+' + crop.yield.qty + ' ' + (m ? m.emoji : ''), x: pos.x, y: pos.y - 0.05, vy: -0.0009, life: 1200, born: performance.now() });
      }
      plot.crop = null; plot.plantedAt = 0;
      saveRoom(); renderFarmPanel(); renderAll();
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
        // Soil
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(px - tile / 2, py - tile / 2, tile, tile);
        ctx.fillStyle = '#5a3d24';
        ctx.fillRect(px - tile / 2, py - tile / 2, tile, tile * 0.18);
        ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 2;
        ctx.strokeRect(px - tile / 2, py - tile / 2, tile, tile);
        if (!plot.crop) return;
        const crop = FARM_CROPS.find(c => c.id === plot.crop);
        if (!crop) return;
        const prog = cropProgress(plot.plantedAt, now, crop.growMs);
        if (prog >= 1) {
          const bob = Math.sin(t / 250 + i) * 2;
          ctx.font = Math.round(tile * 0.9) + 'px sans-serif';
          ctx.fillText(crop.emoji, px, py + tile * 0.32 + bob);
          ctx.font = Math.round(tile * 0.4) + 'px sans-serif';
          ctx.fillText('✨', px + tile * 0.42, py - tile * 0.34 + bob);
        } else {
          // Sprout + growth bar
          ctx.font = Math.round(tile * (0.3 + prog * 0.5)) + 'px sans-serif';
          ctx.fillText('🌱', px, py + tile * 0.28);
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fillRect(px - tile * 0.4, py + tile * 0.42, tile * 0.8, 4);
          ctx.fillStyle = '#6dd56d';
          ctx.fillRect(px - tile * 0.4, py + tile * 0.42, tile * 0.8 * prog, 4);
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
        _drawFarmPlots(ctx, W, H, t);

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
          drawFarmAnimal(ctx, a.type, size, t / 120, st.moving, _farmVariantPal(a));
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

        // Garden plots first (fixed tiles — clearest intent)
        const plots = roomData.farmPlots || [];
        for (let i = 0; i < plots.length; i++) {
          const pos = _farmPlotPos(i);
          if (Math.hypot(pos.x - cx, pos.y - cy) < 0.05) { _plantOrHarvestPlot(plots[i], pos); return; }
        }

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
