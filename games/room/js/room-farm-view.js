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
    let _plantPlot = 0;          // the exact plot the tap landed on (used by the 'one' scope)
    let _pendingPlant = null;    // { cropId, count, total } awaiting partial-plant confirm
    // How much the crop picker plants: one bed, its row, or every empty bed.
    // Remembered across sessions so the choice doesn't reset every visit.
    const FARM_SCOPE_KEY = 'farm_plant_scope';
    let _plantScope = 'row';
    try {
      const _s = localStorage.getItem(FARM_SCOPE_KEY);
      if (_s === 'one' || _s === 'row' || _s === 'all') _plantScope = _s;
    } catch (e) { /* private mode — keep the default */ }
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

    /* ── Social layer state ──
       A visitor drops an item into the host's farm_inbox; the host claims the
       batch from the 📮 mailbox on their own farm. Nothing here writes to
       another player's farm data — see room-base.js FARM_CHEER_COIN & co. */
    let _farmInbox = null;            // pending inbox items (null = not loaded yet)
    let _farmInboxUnsub = null;       // live listener on my own inbox (while the farm is open)
    let _farmInboxOpen = false;       // mailbox modal visible?
    let _farmInboxBusy = false;       // a claim is in flight (blocks a double-tap double-claim)
    let _sentHere = null;             // kinds I've already sent the farm I'm VISITING today (null = not read yet)
    let _sentHereUid = '';            // whose farm _sentHere describes, so a stale answer can't leak across a hop
    let _myHelpLeft = null;           // rewarded helps I have left today (null = not fetched yet)
    let _myStock = null;              // MY produce, fetched when the gift picker opens (roomData holds the HOST's)
    let _giftOpen = false;            // gift picker modal visible?
    let _giftProd = null, _giftQty = 1;
    let _farmBoards = null;           // { pop: […], prod: […] } built from one rooms scan
    let _farmBoardTab = 'pop';        // which weekly board the Visit tab shows
    let _farmLastWeek = null;         // last week's paid winners, once settlement has run
    let _farmSettleTried = false;     // settlement attempted this page load (it only ever needs to run once)
    // The three things a visitor can do, in the order they're shown.
    const FARM_HELP_LABEL = {
      cheer: { emoji: '👍', name: 'Cheer', done: 'cheered', hint: 'Give them a boost' },
      water: { emoji: '💧', name: 'Water crops', done: 'watered', hint: 'Crops finish 10 min sooner' },
      feed:  { emoji: '🌾', name: 'Feed',  done: 'fed',     hint: 'Trough +5' },
    };
    const FARM_HELP_KINDS = ['cheer', 'water', 'feed'];
    // Tuning passed to the pure settlement in room-farm.js.
    const FARM_INBOX_OPTS = {
      cheerCoin: FARM_CHEER_COIN, cheerCapPerDay: FARM_CHEER_DAILY_CAP,
      waterMs: FARM_WATER_MS, feedUnits: FARM_FEED_UNITS, giftMaxQty: FARM_GIFT_MAX_QTY,
    };
    const FARM_CART_X = 0.84, FARM_CART_Y = 0.135; // where the sky merchant plane hovers (normalized; up in the sky band)
    /* On a narrow stage the plane moves in from the corner and grows. At 0.84 it
       hovers right against the tree at 0.94, and a 47px sprite camouflaged
       against a canopy in the hardest corner of a phone to reach is hard to
       FIND — its tap zone was already ~130x166px, so the trouble was never the
       hit-test. Wide stages keep the corner: there the plane is 78px with room
       around it. */
    /* It shares this corner with the floating "🧺 Collect" button — 10px from the
       top and at least 44px tall on touch, and on a narrow stage it sits right
       above the plane. That button is a DOM element over the canvas, so anything
       that drifts under it loses its taps outright. However high we ask the
       plane to fly, keep its wingtip below the button's floor. */
    const FARM_CART_CLEAR_PX = 60;
    function _farmCartPos(W, H) {
      const ceil = (FARM_CART_CLEAR_PX + _farmCartSize(W, H) * 0.45) / Math.max(1, H || 1);
      return {
        x: (W < FARM_NARROW_W) ? 0.70 : FARM_CART_X,
        y: H ? Math.max(ceil, FARM_CART_Y) : FARM_CART_Y,
      };
    }
    /* The plane has to fit between that button's floor and the tops of the
       workshop huts. The width-only floor below (56px so a phone sprite stays
       findable) ignores height entirely, and on a short stage it is taller than
       the whole gap — which used to leave the plane tucked under the button AND
       parked among the huts. Solving
           CLEAR + 0.45s (top half) + 0.45s (bottom half) + 0.4s (hut roof)  ≤  FARM_HUT_Y·H
       for s gives the largest plane the sky can actually hold; the 1.4 divisor
       is that 1.3 plus a little air. It only bites below ~460px of stage, and
       the tap rect covers the banner either way, so a smaller plane there costs
       nothing in reachability. */
    function _farmCartSize(W, H) {
      const want = (W < FARM_NARROW_W) ? Math.max(56, W * 0.16) : Math.max(44, Math.min(W, H) * 0.12);
      if (!H) return want;
      return Math.min(want, Math.max(28, (FARM_HUT_Y * H - FARM_CART_CLEAR_PX) / 1.4));
    }

    // The trough stands on the open grass between the top fence and the pens,
    // to the left of the workshop huts (which start at x 0.22). It used to sit
    // at (0.14, 0.50) — inside the pen band, where the pens' tint and rail are
    // drawn straight over it, so a full pasture buried it.
    const FARM_TROUGH_X = 0.085;
    // Base of the trough: clear of the pen label tabs that hang above the rail.
    // Those are a fixed ~19-24px tall whatever the stage is, so on a short stage
    // they claim a bigger share of it and a flat fraction here isn't enough.
    function _farmTroughY(W, H) {
      const labelH = Math.max(11, Math.min(16, W * 0.03)) + 8;   // matches _drawPenLabels
      return FARM_PEN_TOP - (labelH + 12) / Math.max(1, H);
    }

    // The 📮 mailbox stands on the same clear grass strip as the trough, but on
    // the far side — left of the workshop huts is the trough, right of them is
    // the mail. Own farm only: a visitor has no mail here to read.
    const FARM_MAIL_X = 0.90;
    function _farmMailPos(W, H) { return { x: FARM_MAIL_X, y: _farmTroughY(W, H) }; }
    // Sprite size. The old 26px floor drew a box 26px WIDE and 16px tall — under
    // half a finger, and hard to even spot against the tree behind it.
    function _farmMailSize(W, H) { return Math.max(34, Math.min(W, H) * 0.078); }
    // How far a finger may miss any fixed farm target and still hit it, in REAL
    // pixels — see farmPickTarget in room-farm.js for why not normalized units.
    const FARM_TAP_REACH_PX = 44;

    /* ── Scene vertical budget (fractions of canvas height) ──
       Single source of truth for the horizon and the animal band. The whole
       pasture sits higher than the sky/grass split alone would suggest: the
       garden beds are capped by their row slot, so the only way to grow them is
       to hand the soil band more height, and the only place that height can
       come from is the sky and the grass above it. */
    const FARM_SKY_Y      = 0.22;   // sky → grass
    const FARM_TOPFENCE_Y = 0.26;   // top fence + the two trees that stand on it
    // A hut is about 0.05 of the stage tall either side of its centre, so this
    // leaves ~0.04 of clear grass between the hut bases and the pen rails.
    const FARM_HUT_Y      = 0.29;   // workshop huts sit above the pen band
    const FARM_PEN_TOP    = 0.38;   // animal pen band top
    // Grass between the pens' bottom rail and the dividing fence. At 0.02 the
    // two rails nearly touched (13px on a laptop) and the pasture read as one
    // crowded band. Every 0.01 here costs the pen band 0.01 of height, so this
    // is the point where the gap is clearly visible and the animals give up
    // about a tenth of their size rather than a fifth.
    const FARM_PEN_GAP    = 0.04;

    /* ── Farm tick (shared by load catch-up, farm open, live tick) ──
       Herd eats from the trough (happiness up/down), production clocks
       advance, spawned produce lands near its animal. Returns the number
       of drops spawned; caller decides whether to saveRoom(). Owner-only. */
    function runFarmProduction() {
      if (viewingUid !== currentUid || !(roomData.farmAnimals || []).length) return 0;
      roomData.farmDrops = roomData.farmDrops || [];
      // Production is uncapped: an animal never stops because nobody came to
      // collect. What bounds a catch-up is TIME (capMs), not a pile size.
      const typeCount = {};
      for (const d of roomData.farmDrops) typeCount[d.type] = (typeCount[d.type] || 0) + 1;
      // The feeder tops the trough up BEFORE the herd eats from it, so a tick
      // never starts the animals on an empty trough it was about to refill.
      // Bill the same window planFarmTick will account for, never the raw gap:
      // the interval skips while the tab is hidden, so coming back to a tab left
      // open all night hands us hours of elapsed time that the tick then clamps
      // to capMs — funding the unclamped gap would charge for feed nobody ate.
      const _now = Date.now();
      const fed = _autoFeedPlan(Math.min(_now - (roomData.farmFoodAt || _now), farmOfflineCapMs()));
      if (fed.coinsSpent > 0) {
        roomData.coins = Math.max(0, (roomData.coins || 0) - fed.coinsSpent);
        if (typeof logCoin === 'function') logCoin(-fed.coinsSpent, '🤖 ' + T('Auto-Feeder'));
        showToast('🤖 ' + T('Auto-feeder bought {n} feed · −{cost}', { n: fed.units, cost: fed.coinsSpent + '🪙' }), '');
      }
      const plan = planFarmTick({
        animals: roomData.farmAnimals,
        dropCounts: {},
        foodStock: fed.foodStock,
        foodAt: roomData.farmFoodAt || 0,
        now: _now,
        slowMs: FARM_CYCLE_SLOW_MS,
        fastMs: FARM_CYCLE_FAST_MS,
        dropCap: Infinity,        // never pause production on an uncollected pile
        foodPerDay: FARM_FOOD_PER_DAY,
        gainPerDay: FARM_HAPPY_GAIN_PER_DAY,
        decayPerDay: FARM_HAPPY_DECAY_PER_DAY,
        levels: FARM_LEVELS,
        levelSpeedup: FARM_LEVEL_SPEEDUP,
        capMs: farmOfflineCapMs(),   // cap any single catch-up (live ticks are tiny, so unaffected)
      });
      roomData.farmAnimals = plan.animals;
      roomData.farmFood = plan.foodStock;
      roomData.farmFoodAt = plan.foodAt;
      let added = 0;
      for (const s of plan.spawns) {
        added++;
        const a = plan.animals.find(an => an.id === s.animalId);
        roomData.farmDrops.push({
          id: 'fd' + Date.now() + '_' + (_farmDropSeq++),
          animalId: s.animalId,
          type: s.type,
          x: Math.max(0.05, Math.min(0.95, (a?.posX ?? 0.5) + (Math.random() - 0.5) * 0.18)),
          y: Math.max(FARM_PEN_TOP, Math.min(0.92, (a?.posY ?? 0.7) + (Math.random() - 0.5) * 0.12)),
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
    // How much of an absence the farm banks. The cold store extends it.
    function farmOfflineCapMs() {
      return FARM_OFFLINE_CAP_MS + (roomData.farmColdLevel || 0) * FARM_COLD_STEP_MS;
    }
    // Is the auto-feeder bought AND switched on?
    function farmAutoFeeding() {
      return !!(roomData.farmAutoFeed && roomData.farmAutoFeedOn);
    }
    // Run the feeder over `elapsedMs` and charge for it. Returns the pre-drain
    // food stock to hand planFarmTick, plus what it cost, so the caller can
    // decide when to actually debit (the offline path plans first, pays later).
    function _autoFeedPlan(elapsedMs) {
      const stock = roomData.farmFood || 0;
      if (!farmAutoFeeding()) return { foodStock: stock, units: 0, coinsSpent: 0 };
      return planFarmAutoFeed({
        herd: (roomData.farmAnimals || []).length,
        foodPerDay: FARM_FOOD_PER_DAY,
        elapsedMs: elapsedMs,
        foodStock: stock,
        foodMax: farmFoodMax(),
        coins: roomData.coins || 0,
        costPerUnit: FARM_FOOD_COST,
        threshold: FARM_AUTOFEED_AT,
      });
    }

    // Normalized y of the fence that divides the animal pasture (above) from the
    // crop garden (below). It drops as the farm is expanded so each upgrade
    // visibly enlarges the pasture, but is capped so the crop rows below always
    // keep enough room to stay inside their plank (not overlap the animals).
    function _farmDivY() {
      return Math.min(0.68, 0.58 + 0.04 * (roomData.farmCapLevel || 0));
    }

    // The pasture band the herd lives in: from the fixed top down to just above
    // the dividing fence, so expanding the farm (which lowers divY) also grows
    // the band. Everything that places something on the pasture — pens, animal
    // spawns, produce drops — derives from this.
    function _farmPenBand() {
      return { top: FARM_PEN_TOP, bot: Math.max(FARM_PEN_TOP + 0.10, _farmDivY() - FARM_PEN_GAP) };
    }

    // The soil band the garden plots live in: below the dividing fence, split
    // into the max plot rows so every owned row sits inside the plank at any
    // expansion level. `rows` is fixed (max) so a row's screen slot doesn't
    // shift as you buy more plots.
    function _farmCropBand(H, W) {
      const top = _farmDivY() + 0.03;
      // Stop short of the tap hint pinned to the bottom of the stage. That hint
      // is a fixed ~30px of HTML, so on a short stage it claims a bigger share.
      const bot = Math.min(0.95, 1 - 30 / Math.max(1, H || 600));
      const rows = Math.max(1, farmRowCount(FARM_PLOT_MAX, _farmPerRow(W)));
      return { top: top, bot: bot, rows: rows, rowGap: (bot - top) / rows };
    }

    // Beds per row for this stage. See FARM_PER_ROW in room-base.js: ten columns
    // can't be individually tappable on a phone, so a narrow stage gets eight.
    function _farmPerRow(W) {
      return (W || _farmWH().W) < FARM_NARROW_W ? FARM_PER_ROW_NARROW : FARM_PER_ROW;
    }

    // Signboard width, or 0 on a narrow stage — there the sign is too small to
    // read anyway, and its width is the difference between the beds clearing the
    // 44px touch floor and missing it.
    function _farmSignW(W, H) {
      if (W < FARM_NARROW_W) return 0;
      const band = _farmCropBand(H, W);
      return Math.max(32, Math.min(Math.min(W, H) * 0.095, band.rowGap * H * 1.2));
    }

    // Side of one garden bed, capped two ways: by the row slot's height, and by
    // the width the whole row needs. Layout below keeps
    // groupW = signW + tile*1.45*perRow, so the width cap is that solved for
    // tile. With no signboard the row may use more of the stage, which is what
    // lifts a narrow stage's columns over the 44px touch floor.
    function _farmTile(W, H) {
      const band = _farmCropBand(H, W);
      const signW = _farmSignW(W, H);
      const byRow  = band.rowGap * H * 0.82;
      const byWide = (W * (signW ? 0.90 : 0.97) - signW) / (1.45 * _farmPerRow(W));
      return Math.max(18, Math.min(Math.min(W, H) * 0.095, byRow, byWide));
    }

    // Horizontal geometry of a garden row. The signboard and the beds are laid
    // out as ONE group and centred, so the field reads as wide as the pasture
    // above it instead of huddling in the middle.
    function _farmRowGeom(W, H) {
      const tile = _farmTile(W, H);
      const signW = _farmSignW(W, H);
      // Spacing is relative to the bed, never to the canvas width. Driving it
      // from W spread the beds out on a wide stage — the bed is capped by the
      // row slot (so by H), so extra width only ever became extra gap: at 3440px
      // the gaps ran 2.9x the bed and the field read as scattered dots.
      const step = tile * 1.45;
      const gap = signW ? tile * 0.45 : 0;               // signboard → first bed
      const groupW = signW + gap + tile + (_farmPerRow(W) - 1) * step;
      const x0 = Math.max(0, (W - groupW) / 2);
      return {
        tile: tile, signW: signW,
        signX: (x0 + signW / 2) / W,
        plotX0: (x0 + signW + gap + tile / 2) / W,
        step: step / W,
      };
    }

    // Screen-normalized position of garden plot index i. Plots sit in rows of
    // _farmPerRow across the soil strip, to the right of the row signboard.
    function _farmPlotPos(i, W, H) {
      const per = _farmPerRow(W);
      const col = i % per, row = Math.floor(i / per);
      const band = _farmCropBand(H, W), geom = _farmRowGeom(W, H);
      return { x: geom.plotX0 + col * geom.step, y: band.top + (row + 0.5) * band.rowGap };
    }

    // Normalized position of the signboard sitting to the LEFT of grid row `row`.
    // Narrow stages have no signboards — callers check _farmSignW first.
    function _farmSignPos(row, W, H) {
      const band = _farmCropBand(H, W);
      return { x: _farmRowGeom(W, H).signX, y: band.top + (row + 0.5) * band.rowGap };
    }

    // Canvas pixel size, for the places outside the draw loop that still need
    // scene coordinates (harvest particles, hover tooltip, taps).
    function _farmWH() {
      const v = document.getElementById('farmView');
      return { W: (v && v.clientWidth) || 900, H: (v && v.clientHeight) || 600 };
    }

    // Local YYYY-MM-DD — the daily orders seed and the inbox's "once a day" key.
    function _farmToday() { return farmDayKey(new Date()); }
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
      _farmWeekAddProduce(n);
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
        _farmVisitUnsub = db.collection('rooms').orderBy('updatedAt', 'desc').limit(FARM_ROOMS_SCAN)
          .onSnapshot(function (snap) {
            const rooms = [], all = [], now = Date.now();
            snap.forEach(function (doc) {
              const d = doc.data();
              // The boards rank EVERYONE (me included); the visit list is the
              // same scan minus myself. One query, two consumers.
              all.push(Object.assign({}, d, { uid: doc.id, name: d.displayName }));
              if (doc.id === currentUid) return;                 // never list myself
              rooms.push({ uid: doc.id, name: d.displayName, animals: (d.farmAnimals || []).length, cheers: d.farmCheersTotal || 0, online: !!(d.lastSeen && (now - d.lastSeen) < 60000) });
            });
            rooms.sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0); });   // online first
            _farmVisitRooms = rooms.slice(0, FARM_VISIT_MAX);
            _farmBoards = _buildFarmBoards(all);
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
      if (_farmVisitRooms == null) return '<div class="farm-panel-empty">' + T('Loading farms…') + '</div>';
      if (!_farmVisitRooms.length) return '<div class="farm-panel-empty">' + T('No other farms to visit yet.') + '</div>';
      return _farmVisitRooms.map(function (r) {
        const peek = (r.animals ? '🐮 ×' + r.animals : '<span style="opacity:.5">' + T('Empty farm') + '</span>') +
                     (r.cheers ? '　🔥 ' + r.cheers : '');
        return '<div class="farm-visit-row" onclick="visitFarm(\'' + r.uid + '\')">' +
          '<span class="farm-visit-emoji">🚜</span>' +
          '<span class="farm-visit-info">' +
            '<span class="farm-visit-name">' + (r.online ? '🟢 ' : '') + escapeHtml(r.name || T('Anonymous')) + '</span>' +
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
      _myHelpLeft = null;   // allowance is mine; what I've sent is per-farm — re-read both on landing
      _sentHere = null; _sentHereUid = '';
      _myStock = null;
      _unsubFarmInbox();    // my mailbox listener doesn't follow me to someone else's farm
      closeFarmInbox();
      closeGiftPicker();
      openFarm();
    }

    /* ══════════════════════════════════════════════════════════════
       Social layer — visitor inbox, gifts, weekly boards
       A visitor never writes to the host's farm. They create ONE doc in
       rooms/{host}/farm_inbox, and the host applies it when they claim.
       The doc id is `${day}_${fromUid}_${kind}`, and the rules allow create
       but never update — so "once a day per farm" is enforced by the server,
       not by this file.
       ══════════════════════════════════════════════════════════════ */

    function _inboxCol(uid) { return db.collection('rooms').doc(uid).collection('farm_inbox'); }
    function _inboxId(kind, prod) {
      return _farmToday() + '_' + currentUid + '_' + kind + (prod ? '_' + prod : '');
    }
    function _farmInboxCount() { return (_farmInbox || []).length; }

    // Live listener on MY inbox while my farm is open, so mail that arrives
    // mid-session lights the mailbox up without a reload. Owner only.
    function _subFarmInbox() {
      if (_farmInboxUnsub || typeof db === 'undefined' || !currentUid || viewingUid !== currentUid) return;
      try {
        _farmInboxUnsub = _inboxCol(currentUid).limit(FARM_INBOX_MAX).onSnapshot(function (snap) {
          const items = [];
          snap.forEach(function (doc) { items.push(Object.assign({ id: doc.id }, doc.data())); });
          items.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
          _farmInbox = items;
          if (isFarmView) { renderFarmPanel(); if (_farmInboxOpen) renderFarmInbox(); }
        }, function (e) {
          console.warn('farm: inbox listener failed —', e && (e.code || e.message), e);
          _farmInbox = [];
        });
      } catch (e) { console.warn('farm: inbox listener failed —', e); _farmInbox = []; }
    }
    function _unsubFarmInbox() {
      if (_farmInboxUnsub) { _farmInboxUnsub(); _farmInboxUnsub = null; }
      _farmInbox = null;
    }

    /* ── Visitor side ── */

    // Two things the visit panel needs, both read fresh when a farm is opened:
    //   • how many REWARDED helps I have left today — my own counter, on my own
    //     doc (roomData holds the HOST's farm while visiting, so never that);
    //   • what I have already sent THIS farm today — read back from the farm's
    //     own inbox, which is the record the server itself checks. Asking the
    //     source means a second device, a refresh, or anything that happened
    //     before this code shipped all read correctly; a mirror kept on my own
    //     doc would only be as good as the last write that touched it.
    // The rules let me read only the items whose fromUid is me, which is exactly
    // what the query pins, so this never exposes anyone else's mail.
    let _helpStateFetching = false;
    async function _refreshMyHelpLeft() {
      const host = viewingUid;
      if (typeof db === 'undefined' || !currentUid || host === currentUid) return;
      if (_helpStateFetching) return;
      if (_myHelpLeft != null && _sentHere != null && _sentHereUid === host) return;
      _helpStateFetching = true;
      const today = _farmToday();
      try {
        const [mine, sent] = await Promise.all([
          userDocRef(currentUid).get(),
          _inboxCol(host).where('fromUid', '==', currentUid).limit(FARM_INBOX_MAX).get(),
        ]);
        const d = mine.exists ? mine.data() : {};
        _myHelpLeft = farmHelpAllowance(d.farmHelpDay, today, d.farmHelpCount, FARM_HELP_DAILY_CAP);
        const items = [];
        sent.forEach(function (doc) { items.push(doc.data()); });
        _sentHere = farmSentKinds(items, today);
      } catch (e) {
        // Can't tell — leave the buttons live rather than locking someone out of
        // helping. A repeat is refused by the rules anyway. Say so out loud: a
        // permission error here is silent on screen (the buttons just never grey
        // out), which is a miserable thing to debug from the symptom alone.
        console.warn('farm: could not read help state —', e && (e.code || e.message), e);
        if (_myHelpLeft == null) _myHelpLeft = FARM_HELP_DAILY_CAP;
        if (_sentHere == null) _sentHere = [];
      }
      _sentHereUid = host;
      _helpStateFetching = false;
      if (isFarmView && viewingUid !== currentUid) renderFarmPanel();
    }

    // What I have already sent this host today (kinds, plus 'gift:<product>').
    function _sentToHost(hostUid) {
      return (_sentHereUid === (hostUid || viewingUid) && _sentHere) ? _sentHere : [];
    }

    // Post the help AND settle my side of it in one transaction: the host's
    // inbox item, my daily allowance, my record of having helped this farm, and
    // the coins. Two farms helped at once can't both pay from the same slot —
    // Firestore retries the loser — and the rules reject a same-day repeat at
    // commit, which rolls the whole thing back. Returns the coins actually paid
    // (0 once the daily cap is spent; helping still works, it just stops paying).
    async function _sendHelpTxn(hostUid, kind) {
      const today = _farmToday();
      const ref = userDocRef(currentUid);
      const inboxRef = _inboxCol(hostUid).doc(_inboxId(kind));
      return await db.runTransaction(async function (tx) {
        const snap = await tx.get(ref);                   // all reads before writes
        const d = snap.exists ? snap.data() : {};
        const left = farmHelpAllowance(d.farmHelpDay, today, d.farmHelpCount, FARM_HELP_DAILY_CAP);
        const pay = left > 0 ? FARM_HELP_REWARD : 0;
        tx.set(inboxRef, {                                // create-only: the rules forbid update
          kind: kind, fromUid: currentUid, fromName: getPlayerName(), day: today, at: Date.now(),
        });
        tx.set(ref, {
          farmHelpDay: today,
          farmHelpCount: (d.farmHelpDay === today ? (d.farmHelpCount || 0) : 0) + 1,
          coins: firebase.firestore.FieldValue.increment(pay),
        }, { merge: true });
        return pay;
      });
    }

    // Grey the button out at once, rather than waiting for the next read. This is
    // only the on-screen echo of what just landed — the next visit re-reads the
    // inbox, so it can't be what the answer depends on.
    function _noteHelped(hostUid, kind) {
      if (_sentHereUid !== hostUid) { _sentHereUid = hostUid; _sentHere = []; }
      if (!_sentHere) _sentHere = [];
      if (_sentHere.indexOf(kind) < 0) _sentHere.push(kind);
    }

    // 👍 / 💧 / 🌾 — post one item to the host's inbox, spend one of today's
    // rewarded helps and record that this farm has now been helped. All three in
    // ONE transaction: if the rules reject the post (already sent today) nothing
    // is paid and nothing is recorded, and a payment can't land without the
    // help landing with it.
    async function helpFarm(kind) {
      if (viewingUid === currentUid || typeof db === 'undefined') return;
      const hostUid = viewingUid;
      if (_sentToHost(hostUid).indexOf(kind) >= 0) {
        return showToast(T('You already {action} this farm today!', { action: T(FARM_HELP_LABEL[kind].done) }), '');
      }
      const host = roomData.displayName || T('this farmer');
      let paid = 0;
      try {
        paid = await _sendHelpTxn(hostUid, kind);
      } catch (e) {
        // The rules forbid update, so a same-day repeat is rejected — that's the
        // only error that means "already done". Anything else (offline, a flaky
        // write) must stay retryable, so nothing is marked as spent.
        if (e && e.code === 'permission-denied') {
          _noteHelped(hostUid, kind);
          renderFarmPanel();
          return showToast(T('You already {action} this farm today!', { action: T(FARM_HELP_LABEL[kind].done) }), '');
        }
        return showToast(T("Couldn't send that — the network looks unhappy. Try again?"), 'error');
      }
      _noteHelped(hostUid, kind);
      if (paid > 0) {
        roomData.coins = (roomData.coins || 0) + paid;   // visitRoom leaves coins mine, so this is my balance
        if (typeof logCoin === 'function') logCoin(paid, T('Lend a hand') + ' ' + FARM_HELP_LABEL[kind].emoji);
        if (_myHelpLeft != null) _myHelpLeft = Math.max(0, _myHelpLeft - 1);
        // Write the header directly rather than renderAll() — we're standing in
        // someone else's room, and roomData's room fields are theirs, not ours.
        const _ca = document.getElementById('coinAmount');
        if (_ca) _ca.textContent = Math.floor(roomData.coins || 0);
      } else if (_myHelpLeft != null) {
        _myHelpLeft = 0;
      }
      for (let i = 0; i < 6; i++) {
        _farmParticles.push({ text: FARM_HELP_LABEL[kind].emoji, x: 0.2 + Math.random() * 0.6, y: 0.7 + Math.random() * 0.1, vy: -0.0012 - Math.random() * 0.0008, life: 1500, born: performance.now() });
      }
      renderFarmPanel();
      showToast(FARM_HELP_LABEL[kind].emoji + ' ' +
                T("You {action} {name}'s farm", { action: T(FARM_HELP_LABEL[kind].done), name: host }) +
                (paid > 0 ? ' · +' + paid + '🪙' : ' · ' + T('Daily reward spent')), 'success');
    }

    /* ── Gift picker (send produce from MY barn to the farm I'm visiting) ── */

    async function openGiftPicker() {
      if (viewingUid === currentUid) return;
      _giftOpen = true; _giftProd = null; _giftQty = 1;
      renderGiftPicker();
      if (_myStock == null) {
        try {
          const snap = await userDocRef(currentUid).get();   // roomData holds the HOST's barn — read my own
          _myStock = (snap.exists ? snap.data().farmStock : null) || {};
        } catch (e) { _myStock = {}; }
        renderGiftPicker();
      }
    }
    function closeGiftPicker() {
      _giftOpen = false;
      const el = document.getElementById('farmGiftModal');
      if (el) el.style.display = 'none';
    }
    function pickGiftProd(id) {
      if (_sentToHost(viewingUid).indexOf('gift:' + id) >= 0) return;
      _giftProd = id;
      _giftQty = Math.min(_giftQty, Math.min(FARM_GIFT_MAX_QTY, (_myStock || {})[id] || 1));
      renderGiftPicker();
    }
    function setGiftQty(d) {
      const max = Math.min(FARM_GIFT_MAX_QTY, (_myStock || {})[_giftProd] || 1);
      _giftQty = Math.max(1, Math.min(max, _giftQty + d));
      renderGiftPicker();
    }
    function renderGiftPicker() {
      const el = document.getElementById('farmGiftModal');
      if (!el) return;
      if (!_giftOpen) { el.style.display = 'none'; return; }
      const meta = farmProductMeta();
      const stock = _myStock || {};
      const ids = Object.keys(stock).filter(k => stock[k] > 0);
      let body;
      if (_myStock == null) {
        body = '<div class="farm-panel-empty">' + T('Reading your barn…') + '</div>';
      } else if (!ids.length) {
        body = '<div class="farm-panel-empty">' + T('Your barn is empty — go collect something first.') + '</div>';
      } else {
        // One of EACH product per farm per day, so a product already sent today
        // greys out on its own rather than closing the whole picker.
        const sent = _sentToHost(viewingUid);
        const done = (id) => sent.indexOf('gift:' + id) >= 0;
        const max = _giftProd ? Math.min(FARM_GIFT_MAX_QTY, stock[_giftProd] || 1) : 1;
        const left = ids.filter(id => !done(id));
        body = '<div class="farm-gift-grid">' + ids.map(function (id) {
          const m = meta[id] || { emoji: '❓', name: id };
          const spent = done(id);
          return '<button class="farm-gift-item' + (id === _giftProd ? ' on' : '') + (spent ? ' done' : '') + '"' +
            (spent ? ' disabled' : ' onclick="pickGiftProd(\'' + id + '\')"') + '>' +
            '<span class="farm-gift-emoji">' + m.emoji + '</span>' +
            '<span class="farm-gift-name">' + escapeHtml(T(m.name)) + '</span>' +
            '<span class="farm-gift-have">' + (spent ? T('Sent today') : '×' + stock[id]) + '</span>' +
          '</button>';
        }).join('') + '</div>' +
        (_giftProd && !done(_giftProd)
          ? '<div class="farm-gift-qty">' +
              '<button onclick="setGiftQty(-1)"' + (_giftQty <= 1 ? ' disabled' : '') + '>−</button>' +
              '<span>' + (meta[_giftProd] || {}).emoji + ' ×' + _giftQty + '</span>' +
              '<button onclick="setGiftQty(1)"' + (_giftQty >= max ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<button class="cp-crop farm-gift-send" onclick="sendFarmGift()">🎁 ' + T('Send {item}', { item: (meta[_giftProd] || {}).emoji + ' ×' + _giftQty }) + '</button>'
          : !left.length
          ? '<div class="farm-panel-empty">' + T("You've already sent this farm everything in your barn today — try tomorrow.") + '</div>'
          : '<div class="farm-panel-empty">' + T('Pick something to send (one of each per day, up to {max}).', { max: FARM_GIFT_MAX_QTY }) + '</div>');
      }
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🎁 ' + T('Send to {name}', { name: escapeHtml(roomData.displayName || T('this farmer')) }) + '</div>' +
          '<div class="ws-sub">' + T('From your own barn — they claim it next time they visit their farm.') + '</div>' +
          body +
          '<button class="cp-crop farm-gift-cancel" onclick="closeGiftPicker()">' + T('Cancel') + '</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    // Move produce from my barn into the host's inbox in ONE transaction, so it
    // can never be deducted without arriving (or arrive without being deducted).
    async function sendFarmGift() {
      if (viewingUid === currentUid || !_giftProd || typeof db === 'undefined') return;
      const prod = _giftProd, host = viewingUid;
      const qty = Math.max(1, Math.min(FARM_GIFT_MAX_QTY, Math.floor(_giftQty) || 1));
      const meta = farmProductMeta()[prod] || { emoji: '🎁', name: prod };
      const meRef = userDocRef(currentUid);
      const inboxRef = _inboxCol(host).doc(_inboxId('gift', prod));
      try {
        await db.runTransaction(async function (tx) {
          const snap = await tx.get(meRef);
          const d = snap.exists ? snap.data() : {};
          const mine = d.farmStock || {};
          if ((mine[prod] || 0) < qty) throw new Error('nostock');
          const next = Object.assign({}, mine);
          next[prod] -= qty;
          if (next[prod] <= 0) delete next[prod];
          const today = _farmToday();
          tx.set(meRef, { farmStock: next }, { merge: true });   // a gift costs no daily allowance
          tx.set(inboxRef, {                       // create-only: a repeat today is denied by the rules
            kind: 'gift', prod: prod, qty: qty,
            fromUid: currentUid, fromName: getPlayerName(), day: today, at: Date.now(),
          });
        });
      } catch (e) {
        if (e && e.message === 'nostock') return showToast(T('Not enough in your barn!'), 'error');
        if (e && e.code === 'permission-denied') {
          _noteHelped(host, 'gift:' + prod);
          renderGiftPicker();
          return showToast(T('You already sent {item} to this farm today.', { item: meta.emoji }), '');
        }
        return showToast(T("Couldn't send that — the network looks unhappy. Try again?"), 'error');
      }
      if (_myStock) {                              // keep the picker's numbers honest
        _myStock[prod] = (_myStock[prod] || 0) - qty;
        if (_myStock[prod] <= 0) delete _myStock[prod];
      }
      _noteHelped(host, 'gift:' + prod);
      closeGiftPicker();
      for (let i = 0; i < 6; i++) {
        _farmParticles.push({ text: meta.emoji, x: 0.2 + Math.random() * 0.6, y: 0.7 + Math.random() * 0.1, vy: -0.0012, life: 1500, born: performance.now() });
      }
      renderFarmPanel();
      showToast('🎁 ' + T('Sent {item} to {name}!', { item: meta.emoji + ' ×' + qty, name: roomData.displayName || T('them') }), 'success');
    }

    /* ── Owner side: the 📮 mailbox ── */

    function openFarmInbox() {
      if (viewingUid !== currentUid) return;
      _farmInboxOpen = true;
      renderFarmInbox();
    }
    function closeFarmInbox() {
      _farmInboxOpen = false;
      const el = document.getElementById('farmInboxModal');
      if (el) el.style.display = 'none';
    }
    function renderFarmInbox() {
      const el = document.getElementById('farmInboxModal');
      if (!el) return;
      if (!_farmInboxOpen) { el.style.display = 'none'; return; }
      const items = _farmInbox || [];
      const meta = farmProductMeta();
      const eff = farmInboxEffects(items, FARM_INBOX_OPTS);
      const rows = items.map(function (it) {
        const who = escapeHtml(it.fromName || T('a farmer'));
        let what;
        if (it.kind === 'cheer') what = '👍 ' + T('cheered you');
        else if (it.kind === 'water') what = '💧 ' + T('watered your crops');
        else if (it.kind === 'feed') what = '🌾 ' + T('topped up your trough');
        else if (it.kind === 'gift') {
          const m = meta[it.prod] || { emoji: '🎁', name: it.prod };
          what = '🎁 ' + T('sent {item}', { item: m.emoji + ' ×' + (it.qty || 0) });
        } else what = '❓';
        return '<div class="ws-slot"><span class="ws-slot-no">' + who + '</span><span class="ws-slot-state">' + what + '</span></div>';
      }).join('');
      const gained = [];
      if (eff.coins) gained.push(eff.coins + '🪙');
      if (eff.food) gained.push('🌾 ' + T('Trough +{n}', { n: eff.food }));
      if (eff.waterMs) gained.push('💧 ' + T('crops {time} sooner', { time: _fmtFarmTime(eff.waterMs) }));
      if (eff.gifts) gained.push('🎁 ' + T('{n} produce', { n: eff.gifts }));
      const unpaid = eff.cheers - eff.paidCheers;
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">📮 ' + T('Farm Mailbox') + ' <span class="farm-panel-cap">' + items.length + '</span></div>' +
          (items.length
            ? '<div class="ws-sub">' + T('Visitors left these for you.') + '</div>' + rows +
              '<div class="farm-inbox-sum">' + T('You get: {list}', { list: gained.join(' · ') || '—' }) + '</div>' +
              (unpaid > 0
                ? '<div class="farm-panel-empty">' +
                  T('{n} of those cheers passed the {cap}-a-day coin limit — they still count for popularity.',
                    { n: unpaid, cap: FARM_CHEER_DAILY_CAP }) + '</div>'
                : '') +
              '<button class="cp-crop farm-inbox-claim" onclick="claimFarmInbox()"' + (_farmInboxBusy ? ' disabled' : '') + '>📬 ' + T('Claim all') + '</button>'
            : '<div class="ws-sub">' + T("Nobody has visited yet. Lend a hand at someone else's farm — they usually visit back.") + '</div>') +
          '<button class="cp-crop farm-gift-cancel" onclick="closeFarmInbox()">' + T('Close') + '</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    // Claim the whole inbox. The room-doc update and the inbox deletes go in ONE
    // batch — Firestore batches are atomic across documents, so the mail can
    // never be consumed without paying out, nor paid out twice.
    async function claimFarmInbox() {
      if (viewingUid !== currentUid || _farmInboxBusy) return;
      const items = (_farmInbox || []).slice();
      if (!items.length) return;
      _farmInboxBusy = true;
      renderFarmInbox();
      const eff = farmInboxEffects(items, FARM_INBOX_OPTS);
      const now = Date.now();

      // Build the new field values WITHOUT touching roomData — if the batch
      // fails we must be left exactly where we started.
      const coins = (roomData.coins || 0) + eff.coins;
      const food = Math.min(farmFoodMax(), (roomData.farmFood || 0) + eff.food);
      const stock = Object.assign({}, roomData.farmStock || {});
      for (const k in eff.stock) stock[k] = (stock[k] || 0) + eff.stock[k];
      // Watering only helps crops that are still growing; a ripe bed is already
      // waiting for you, so pulling its clock back further buys nothing.
      const plots = (roomData.farmPlots || []).map(function (p) {
        if (!p || !p.crop || !eff.waterMs) return p;
        const c = FARM_CROPS.find(x => x.id === p.crop);
        if (!c || cropProgress(p.plantedAt, now, c.growMs) >= 1) return p;
        return Object.assign({}, p, { plantedAt: p.plantedAt - eff.waterMs });
      });
      const week = farmWeekBump(roomData, farmWeekIdFor(new Date()), eff.cheers, 0);
      const fields = Object.assign({
        coins: coins,
        farmFood: food,
        farmFoodAt: roomData.farmFoodAt || now,
        farmStock: stock,
        farmPlots: plots,
        farmCheersTotal: (roomData.farmCheersTotal || 0) + eff.cheers,
      }, week);

      try {
        const batch = db.batch();
        batch.set(userDocRef(currentUid), fields, { merge: true });
        items.forEach(function (it) { batch.delete(_inboxCol(currentUid).doc(it.id)); });
        await batch.commit();
      } catch (e) {
        _farmInboxBusy = false;
        renderFarmInbox();
        return showToast(T('Claim failed — try again in a moment.'), 'error');
      }

      Object.assign(roomData, fields);             // now mirror what we just wrote
      if (eff.coins && typeof logCoin === 'function') logCoin(eff.coins, T('Farm popularity') + ' 👍');
      // The batch wrote only the fields the claim changes. Follow it with a
      // normal save so the coin-history row lands too — and so anything the
      // 60s production tick left pending (new drops, happiness) goes with it.
      saveRoom();
      _farmInbox = [];
      _farmInboxBusy = false;
      closeFarmInbox();
      renderFarmPanel();
      renderAll();
      const bits = [];
      if (eff.coins) bits.push('+' + eff.coins + '🪙');
      if (eff.food) bits.push('🌾+' + eff.food);
      if (eff.waterMs) bits.push('💧 ' + T('crops {time} sooner', { time: _fmtFarmTime(eff.waterMs) }));
      if (eff.gifts) bits.push('🎁 ' + T('{n} produce', { n: eff.gifts }));
      for (let i = 0; i < 8; i++) {
        _farmParticles.push({ text: ['👍', '💧', '🎁', '✨'][i % 4], x: 0.2 + Math.random() * 0.6, y: 0.6 + Math.random() * 0.1, vy: -0.0012, life: 1600, born: performance.now() });
      }
      showToast('📬 ' + T('Claimed {n} — {list}', { n: items.length, list: bits.join(' · ') || T('thanks, everyone!') }), 'success');
    }

    /* ── Weekly boards (🔥 popularity + 🌾 produce) ── */

    // Count produce toward this week's 🌾 board, rolling the week over if the
    // stored counters belong to an older one. Called wherever produce lands.
    function _farmWeekAddProduce(n) {
      if (viewingUid !== currentUid || !(n > 0)) return;
      Object.assign(roomData, farmWeekBump(roomData, farmWeekIdFor(new Date()), 0, n));
    }

    // Coarse countdown for the weekly board — _fmtFarmTime would render five
    // days as "119h 30m", which nobody can read at a glance.
    function _fmtFarmDays(ms) {
      const h = Math.max(0, Math.ceil(ms / 3600000));
      if (h < 24) return T('{n}h', { n: h });
      return T('{n}d', { n: Math.floor(h / 24) }) + (h % 24 ? ' ' + T('{n}h', { n: h % 24 }) : '');
    }

    // ms until this week's board closes (Sunday 00:00 local).
    function _farmWeekLeftMs() {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end.setDate(end.getDate() + (7 - end.getDay()));
      return end.getTime() - now.getTime();
    }

    // One scan of the rooms collection serves the visit list AND both boards —
    // the collection is small (a friend group), so a second query per board
    // would be pure waste. Returns the raw rows.
    function _buildFarmBoards(rows) {
      const week = farmWeekIdFor(new Date());
      const board = (field) => rows
        .map(r => ({ uid: r.uid, name: r.name, score: farmWeekScore(r, week, field) }))
        .filter(r => r.score > 0)
        .sort((a, b) => (b.score - a.score) || (a.uid < b.uid ? -1 : 1))
        .slice(0, FARM_WEEK_BOARD_N);
      return { pop: board('Cheers'), prod: board('Produce') };
    }

    function switchFarmBoard(id) { _farmBoardTab = id; renderFarmPanel(); }

    function _farmBoardHtml() {
      const b = _farmBoards;
      const rows = b ? (_farmBoardTab === 'pop' ? b.pop : b.prod) : null;
      const unit = _farmBoardTab === 'pop' ? '👍' : '🌾';   // a count's unit, not a word
      const medals = ['🥇', '🥈', '🥉'];
      let list;
      if (!rows) list = '<div class="farm-panel-empty">' + T('Loading the board…') + '</div>';
      else if (!rows.length) list = '<div class="farm-panel-empty">' + T('Nobody is on the board yet — one visit gets you started.') + '</div>';
      else list = rows.map(function (r, i) {
        return '<div class="farm-board-row' + (r.uid === currentUid ? ' me' : '') + '">' +
          '<span class="farm-board-rank">' + (medals[i] || (i + 1)) + '</span>' +
          '<span class="farm-board-name">' + escapeHtml(r.name || T('Anonymous')) + '</span>' +
          '<span class="farm-board-score">' + r.score + ' ' + unit + '</span>' +
        '</div>';
      }).join('');
      const mine = rows && rows.some(r => r.uid === currentUid);
      const last = _farmLastWeek && _farmLastWeek.length
        ? '<div class="farm-panel-empty" style="padding-top:6px">' +
          T('Last week: {list}', { list: _farmLastWeek.map(function (w) {
            return (w.board === 'prod' ? '🌾 ' : '🔥 ') + escapeHtml(w.name || T('Anonymous')) + ' +' + w.prize + '🪙';
          }).join(' · ') }) + '</div>'
        : '';
      return '<div class="farm-section-title">🏅 ' + T('Farm Weekly') +
          ' <span class="farm-panel-cap">' + T('settles in {time}', { time: _fmtFarmDays(_farmWeekLeftMs()) }) + '</span></div>' +
        '<div class="farm-board-tabs">' +
          '<button class="farm-board-tab' + (_farmBoardTab === 'pop' ? ' active' : '') + '" onclick="switchFarmBoard(\'pop\')">🔥 ' + T('Popularity') + '</button>' +
          '<button class="farm-board-tab' + (_farmBoardTab === 'prod' ? ' active' : '') + '" onclick="switchFarmBoard(\'prod\')">🌾 ' + T('Produce ranking') + '</button>' +
        '</div>' +
        list +
        (rows && rows.length && !mine ? '<div class="farm-panel-empty">' + T("You're not in the top {n} yet.", { n: FARM_WEEK_BOARD_N }) + '</div>' : '') +
        '<div class="farm-panel-empty" style="padding-top:6px">' +
          T('Settles Sunday 00:00. Each board pays {prizes}.', { prizes: FARM_WEEK_PRIZES.join(' / ') + '🪙' }) + '</div>' +
        last;
    }

    // The first client to open the farm in a NEW week pays last week's top 3 on
    // BOTH boards and writes a one-time marker, all in one transaction guarded by
    // that marker — so the payout can never run twice however many clients race.
    // Same shape as the 成语接龙 weekly settlement.
    async function _maybeSettleFarmWeek() {
      if (_farmSettleTried || typeof db === 'undefined' || !currentUid) return;
      _farmSettleTried = true;
      const now = new Date();
      const prevWeek = farmWeekIdFor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
      const markerRef = db.collection('farm_week').doc(prevWeek);
      try {
        const marker = await markerRef.get();
        if (marker.exists && (marker.data() || {}).settled) {
          _farmLastWeek = ((marker.data() || {}).winners || []).filter(w => w && w.prize);
          if (isFarmView) renderFarmPanel();
          return;
        }
        const snap = await db.collection('rooms').orderBy('updatedAt', 'desc').limit(FARM_ROOMS_SCAN).get();
        const rows = [];
        snap.forEach(function (doc) {
          const d = doc.data() || {};
          rows.push(Object.assign({}, d, { uid: doc.id, name: d.displayName }));
        });
        const score = (field) => rows.map(r => ({ uid: r.uid, name: r.name, score: farmWeekScore(r, prevWeek, field) }));
        const pop = farmWeekWinners(score('Cheers'), FARM_WEEK_PRIZES);
        const prod = farmWeekWinners(score('Produce'), FARM_WEEK_PRIZES);
        const winners = await db.runTransaction(async function (tx) {
          const m = await tx.get(markerRef);
          if (m.exists && (m.data() || {}).settled) return (m.data() || {}).winners || [];   // someone beat us to it
          const paid = [];
          const total = {};
          pop.forEach(function (w) { paid.push(Object.assign({ board: 'pop' }, w)); });
          prod.forEach(function (w) { paid.push(Object.assign({ board: 'prod' }, w)); });
          paid.forEach(function (w) {                     // top both boards → both prizes, paid once
            if (w.prize > 0) total[w.uid] = (total[w.uid] || 0) + w.prize;
          });
          for (const uid in total) {
            tx.set(db.collection('rooms').doc(uid),
                   { coins: firebase.firestore.FieldValue.increment(total[uid]) }, { merge: true });
          }
          tx.set(markerRef, { settled: true, winners: paid, at: Date.now() });   // create-once (rules forbid update/delete)
          return paid;
        });
        _farmLastWeek = (winners || []).filter(w => w && w.prize);
        if (isFarmView) renderFarmPanel();
      } catch (e) {
        // Another client settled it, or we're offline — safe to skip, but a rules
        // rejection looks identical from here, so leave a trace.
        console.warn('farm: weekly settlement skipped —', e && (e.code || e.message), e);
      }
    }

    function openFarm() {
      isFarmView = true;
      document.getElementById('farmView')?.classList.add('visible');
      _setFarmPanelMode(true);
      _syncRoomPanel();   // hide the side panel; widens the stage before we draw
      _maybeSettleFarmWeek();   // pays last week's board winners, once per page load
      if (viewingUid === currentUid) {
        if ((roomData.farmDecors || []).length) roomData.farmDecors = []; // decor feature removed
        _subFarmInbox();
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
            setTimeout(function () { showToast('🤖 ' + T('Auto-Collector banked {n} produce while you were away!', { n: _n }), 'success'); }, 600);
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
    // capped at farmOfflineCapMs() (3h, more with a cold store). Pure time cap —
    // no per-type count cap — so
    // the only offline limit is time. Returns { plan, batch:{prodId:count}, total, awayMs }.
    function _offlinePlan() {
      const now = Date.now();
      const animals = roomData.farmAnimals || [];
      let lastActive = 0;
      for (const a of animals) lastActive = Math.max(lastActive, a.lastDropTime || 0);
      const awayMs = lastActive ? (now - lastActive) : 0;
      // The feeder covers the banked window too — that's the whole point of
      // owning one. Planned here, charged in _applyOfflinePlan, because this
      // runs before the player has agreed to collect anything.
      const fed = _autoFeedPlan(Math.min(awayMs, farmOfflineCapMs()));
      const plan = planFarmTick({
        animals: animals,
        dropCounts: {},          // ignore the field-drop count cap; time is the only offline limit
        foodStock: fed.foodStock,
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
        capMs: farmOfflineCapMs(),
      });
      const batch = {};
      for (const s of plan.spawns) {
        const def = FARM_ANIMALS.find(f => f.id === s.type);
        const pid = def ? def.drop.id : s.type;
        batch[pid] = (batch[pid] || 0) + 1;
      }
      return { plan: plan, batch: batch, total: plan.spawns.length, awayMs: awayMs, fed: fed };
    }

    // Commit an offline plan: advance clocks/happiness/food and bank the produce
    // straight into stock (+collection XP). Moves each animal's clock to ~now, so
    // the next offline window starts fresh — i.e. you must collect to keep earning.
    function _applyOfflinePlan(off) {
      const plan = off.plan;
      if (off.fed && off.fed.coinsSpent > 0) {          // pay for what the feeder bought while away
        roomData.coins = Math.max(0, (roomData.coins || 0) - off.fed.coinsSpent);
        if (typeof logCoin === 'function') logCoin(-off.fed.coinsSpent, '🤖 ' + T('Auto-Feeder') + ' (' + T('offline') + ')');
      }
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
      _farmWeekAddProduce(plan.spawns.length);
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
        return '<div class="ws-slot"><span class="ws-slot-no">' + m.emoji + ' ' + T(m.name) + '</span>' +
               '<span class="ws-slot-state">×' + off.batch[pid] + '</span></div>';
      }).join('');
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🐔 ' + T('While you were away…') + '</div>' +
          '<div class="ws-sub">' + T('Your animals produced this. Collect it to keep them going!') + '</div>' +
          rows +
          '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="collectFarmAway()">📦 ' + T('Collect all') + '</button>' +
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
      if (n > 0) showToast('📦 ' + T('Collected {n} produce from your animals!', { n: n }), 'success');
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
      closeFarmInbox();
      closeGiftPicker();
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
      _unsubFarmInbox();
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

      // Visiting someone else's farm — read-only summary plus the three helping
      // hands and a gift. None of these touch the host's farm: each drops one
      // doc in their inbox for them to claim (see helpFarm / sendFarmGift).
      if (viewingUid !== currentUid) {
        const herd = roomData.farmAnimals || [];
        const counts = {};
        for (const a of herd) counts[a.type] = (counts[a.type] || 0) + 1;
        const herdLine = FARM_ANIMALS.filter(d => counts[d.id]).map(d => d.emoji + '×' + counts[d.id]).join('  ') || T('No animals yet');
        _refreshMyHelpLeft();   // fire-and-forget; re-renders once my allowance is known
        const left = _myHelpLeft;
        const sent = _sentToHost(viewingUid);
        const helpBtns = FARM_HELP_KINDS.map(function (k) {
          const L = FARM_HELP_LABEL[k];
          const done = sent.indexOf(k) >= 0;
          return '<button class="farm-help-btn' + (done ? ' done' : '') + '" onclick="helpFarm(\'' + k + '\')"' + (done ? ' disabled' : '') + '>' +
            '<span class="farm-help-emoji">' + L.emoji + '</span>' +
            '<span class="farm-help-name">' + (done ? T('Already {action}', { action: T(L.done) }) : T(L.name)) + '</span>' +
            '<span class="farm-help-hint">' + T(done ? 'Come back tomorrow' : L.hint) + '</span>' +
          '</button>';
        }).join('');
        panel.innerHTML =
          '<div class="farm-panel-head">🚜 ' + T("{name}'s Farm", { name: escapeHtml(roomData.displayName || T('Their')) }) + ' ' +
            '<span class="farm-panel-cap">🔥 ' + (roomData.farmCheersTotal || 0) + '</span></div>' +
          '<section class="farm-card">' +
            '<div class="farm-section-title">🐮 ' + T('Their Herd') +
              ' <span class="farm-panel-cap">' + T('Lv {n} top', { n: herd.reduce((m, a) => Math.max(m, animalLevel(a.collected, FARM_LEVELS)), 0) }) + '</span></div>' +
            '<div class="farm-shop-row"><span class="farm-shop-animal">' + T('{n} animals', { n: herd.length }) + '</span></div>' +
            '<div class="farm-shop-row"><span class="farm-shop-animal">' + herdLine + '</span></div>' +
            '<div class="farm-shop-row"><span class="farm-shop-animal">🌱 ' + T('{n} plots', { n: (roomData.farmPlots || []).length }) + '</span></div>' +
          '</section>' +
          '<section class="farm-card">' +
            '<div class="farm-section-title">🤝 ' + T('Lend a hand') + ' ' +
              '<span class="farm-panel-cap">' +
                (left == null ? '…' : left > 0 ? T('{n} rewarded left today', { n: left }) : T('Daily reward used up')) +
              '</span></div>' +
            '<div class="farm-help-row">' + helpBtns + '</div>' +
            '<button class="farm-shop-buy" style="width:100%;padding:9px;font-size:13px;margin-top:8px" onclick="openGiftPicker()">🎁 ' + T('Send them some produce') + '</button>' +
            '<div class="farm-panel-empty" style="padding-top:6px">' +
              T('One of each per day · +{coins} per help (first {cap} a day) · they claim it next time they visit their farm',
                { coins: FARM_HELP_REWARD + '🪙', cap: FARM_HELP_DAILY_CAP }) + '</div>' +
          '</section>' +
          '<button class="farm-visit-home" onclick="visitFarm(\'' + currentUid + '\')">🏠 ' + T('Back to my farm') + '</button>' +
          '<section class="farm-card" style="margin-top:10px">' +
            '<div class="farm-section-title">🚜 ' + T('Visit other farms') + ' <span class="farm-panel-cap">' + T('live') + '</span></div>' +
            _farmVisitListHtml() +
          '</section>' +
          '<div class="farm-panel-hint">' + T("Lend a hand and you both gain — they're far likelier to visit you back.") + '</div>';
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
        '<div class="farm-section-title">🌾 ' + T('Food Trough') + '</div>' +
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
        '<div class="farm-section-title">🛒 ' + T('Merchant Cart') + '</div>' +
        (cart.present
          ? '<div class="farm-cart-status here">🛒 ' + T('The cart is here — tap it on the farm, or:') + '</div>' +
            '<div class="farm-panel-empty" style="padding-top:4px">' + T('Buying this visit: {list}', { list: wantMeta || '—' }) + '</div>' +
            '<button class="farm-shop-buy" style="width:100%;margin-top:6px" onclick="openCartSheet()">' + T('Open cart →') + '</button>'
          : '<div class="farm-cart-status">🛒 ' + T('Sold out & rolled on — back in {time}.', { time: '<b>' + _fmtFarmTime(cart.nextInMs) + '</b>' }) + '</div>' +
            '<div class="farm-panel-empty" style="padding-top:4px">' + T('It buys a different set each visit — stock up!') + '</div>');
      // Produce list is collapsible (it grows as you collect more types).
      const _produceCollapsed = _farmProduceCollapsed == null ? stockIds.length > FARM_PRODUCE_COLLAPSE_AT : _farmProduceCollapsed;
      const stockHtml =
        cartHtml +
        '<div class="farm-section-title farm-collapse-head" style="margin-top:12px" onclick="toggleFarmProduce()">' +
          '<span>📦 ' + T('Produce') + ' <small>(' + stockIds.length + ')</small></span>' +
          '<span class="farm-collapse-arrow">' + (_produceCollapsed ? '▸' : '▾') + '</span>' +
        '</div>' +
        (_produceCollapsed
          ? ''
          : !stockIds.length
          ? '<div class="farm-panel-empty">' + T('Tap produce on the farm to collect it here.') + '</div>'
          : stockIds.map(id => {
              const m = meta[id] || { emoji: '❓', name: id };
              const wanted = cart.present && cart.wanted.some(w => w.id === id);
              return '<div class="farm-shop-row">' +
                '<span class="farm-shop-animal">' + m.emoji + ' ' + T(m.name) + ' <small>×' + stock[id] + '</small>' + (wanted ? ' <span class="farm-want-tag">' + T('cart wants') + '</span>' : '') + '</span>' +
                '<span class="farm-shop-drop">' + (prices[id] || 0) + '🪙 ' + T('ea') + '</span>' +
                '</div>';
            }).join(''));

      // Daily delivery orders
      const ordersList = _farmOrders();
      const ordersDone = roomData.farmOrdersDone || [];
      const ordersHtml =
        '<div class="farm-section-title">📋 ' + T('Orders') + ' <span class="farm-panel-cap">' + T('resets daily') + '</span></div>' +
        ordersList.map((o, i) => {
          const isDone = ordersDone.includes(i);
          const canDo = !isDone && o.items.every(it => (stock[it.id] || 0) >= it.qty);
          const itemsStr = o.items.map(it => { const mm = meta[it.id] || { emoji: '❓' }; return mm.emoji + '×' + it.qty; }).join('  ');
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + itemsStr + '</span>' +
            '<span class="farm-shop-drop">+' + o.reward + '🪙</span>' +
            (isDone
              ? '<span class="farm-shop-drop">✓ ' + T('done') + '</span>'
              : '<button class="farm-shop-buy" onclick="fulfillFarmOrder(' + i + ')"' + (canDo ? '' : ' disabled') + '>' + T('Deliver') + '</button>') +
            '</div>';
        }).join('');

      const shopHtml =
        '<div class="farm-section-title">🛒 ' + T('Animal Shop') +
          '<button class="farm-mini-btn" onclick="openRgbPreview()" title="' + T('Preview the rare rainbow coats') + '">🌈 ' + T('RGB?') + '</button>' +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:0 2px 6px">' + T('Every buy has a tiny chance to be a 🌈 rainbow (cosmetic).') + '</div>' +
        FARM_ANIMALS.map(def => {
          const afford = roomData.coins >= def.cost;
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + def.emoji + ' ' + T(def.name) + ' <small>×' + (counts[def.id] || 0) + '</small></span>' +
            '<span class="farm-shop-drop">' + def.drop.emoji + ' ' + def.drop.coins + '🪙</span>' +
            '<button class="farm-shop-buy" onclick="buyFarmAnimal(\'' + def.id + '\')"' + (full || !afford ? ' disabled' : '') + '>' + def.cost + '🪙</button>' +
            '</div>';
        }).join('');

      // Herd list is collapsible (it grows long). _farmHerdCollapsed: null = auto
      // (collapse once the herd passes FARM_HERD_COLLAPSE_AT), else explicit bool.
      const _herdCollapsed = _farmHerdCollapsed == null ? animals.length > FARM_HERD_COLLAPSE_AT : _farmHerdCollapsed;
      const herdRows =
        (!animals.length
          ? '<div class="farm-panel-empty">' + T('No animals yet — buy one above to start earning!') + '</div>'
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
                : '<span class="farm-herd-meat" title="' + T('Butcher → this much meat') + '">🥩×' + meat + '</span>' +
                  '<button class="farm-mini-btn" title="' + T('Butcher for meat') + '" onclick="askButcher(\'' + a.id + '\')">🔪</button>';
              return '<div class="farm-herd-row">' +
                '<span class="farm-herd-emoji">' + def.emoji + '</span>' +
                '<span class="farm-herd-info">' +
                  '<span class="farm-herd-name">' + T(def.name) + mark + ' <small>' + T('Lv {n}', { n: lvl }) + '</small> · ' + h + '%</span>' +
                  '<span class="farm-herd-bar"><span style="width:' + h + '%;background:' + color + '"></span></span>' +
                '</span>' +
                (waiting ? '<span class="farm-herd-drops">' + def.drop.emoji + ' ×' + waiting + '</span>' : '') +
                butcherCtl +
                '</div>';
            }).join(''));
      const herdHtml =
        '<div class="farm-section-title farm-collapse-head" onclick="toggleFarmHerd()">' +
          '<span>🐮 ' + T('My Animals') + ' <small>(' + animals.length + ')</small></span>' +
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
        '<div class="farm-section-title">🌱 ' + T('Garden') + ' ' +
          '<span class="farm-panel-cap">' + T('{n}/{max} plots', { n: plots.length, max: FARM_PLOT_MAX }) + '</span>' +
          (atMax
            ? ''
            : '<button class="farm-shop-buy" onclick="addFarmPlot()"' + (roomData.coins < FARM_PLOT_COST ? ' disabled' : '') + '>' + T('+ Plot · {cost}', { cost: FARM_PLOT_COST + '🪙' }) + '</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding-bottom:2px">' +
          T('{used}/{total} planted · {ripe} ripe', { used: usedPlots, total: plots.length, ripe: ripePlots }) + '</div>' +
        '<div class="farm-howto">' +
          '🪧 ' + T("Tap a row's signboard to plant that whole row.") + '<br>' +
          '⏳ ' + T('Tap a ripe row to harvest everything that\'s ready.') +
        '</div>';

      // Build Machines: buy here; built ones appear on the farm where you operate them.
      const _bm = roomData.farmMachines || {};
      const buildHtml =
        '<div class="farm-section-title">🏭 ' + T('Build Machines') + '</div>' +
        '<div class="farm-panel-empty" style="padding:0 2px 6px">' + T('Built machines appear on your farm — tap one there to make goods.') + '</div>' +
        FARM_MACHINES.map(mc => {
          const owned = _bm[mc.id] && _bm[mc.id].owned;
          const makes = mc.recipes.map(rc => (meta[rc.out.id] ? meta[rc.out.id].emoji : '?')).join(' ');
          const note = mc.id === 'butcher' ? ' · ' + T('needs meat') : '';
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">' + mc.emoji + ' ' + T(mc.name) + ' <small>' + T('makes {list}', { list: makes }) + note + '</small></span>' +
            (owned
              ? '<span class="farm-shop-drop">✓ ' + T('on farm') + '</span>'
              : '<button class="farm-shop-buy" onclick="buyFarmMachine(\'' + mc.id + '\')"' + (roomData.coins < mc.cost ? ' disabled' : '') + '>' + T('Build · {cost}', { cost: mc.cost + '🪙' }) + '</button>') +
            '</div>';
        }).join('');

      const expLvl = roomData.farmCapLevel || 0;
      const expandCost = expLvl < FARM_EXPAND_COSTS.length ? FARM_EXPAND_COSTS[expLvl] : null;
      const trLvl = roomData.farmTroughLevel || 0;
      const trCost = trLvl < FARM_TROUGH_COSTS.length ? FARM_TROUGH_COSTS[trLvl] : null;
      const upgradesHtml =
        '<div class="farm-section-title">⚙️ ' + T('Upgrades') + '</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🏞️ ' + T('Bigger pasture') + ' <small>' +
            T('Lv {n}/{max} · holds {cap} animals', { n: expLvl, max: FARM_EXPAND_COSTS.length, cap: farmAnimalCap() }) + '</small></span>' +
          (expandCost == null
            ? '<span class="farm-shop-drop">' + T('MAX') + '</span>'
            : '<button class="farm-shop-buy" onclick="expandFarm()"' + (roomData.coins < expandCost ? ' disabled' : '') + '>+10 · ' + expandCost + '🪙</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:2px 0 4px">' + T('Pushes the crop fence down — more grass for a bigger herd.') + '</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🪣 ' + T('Bigger trough') + ' <small>' +
            T('Lv {n}/{max} · holds {cap} food', { n: trLvl, max: FARM_TROUGH_COSTS.length, cap: farmFoodMax() }) + '</small></span>' +
          (trCost == null
            ? '<span class="farm-shop-drop">' + T('MAX') + '</span>'
            : '<button class="farm-shop-buy" onclick="buyFarmTrough()"' + (roomData.coins < trCost ? ' disabled' : '') + '>+' + FARM_TROUGH_STEP + ' · ' + trCost + '🪙</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:2px 0 4px">' + T('A bigger trough holds more food, so it lasts longer between refills.') + '</div>' +
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🤖 ' + T('Auto-Collector') + ' <small>' + T('produce → stock') + '</small></span>' +
          (roomData.farmAutoCollect
            ? '<span class="farm-shop-drop">✓ ' + T('ON') + '</span>'
            : '<button class="farm-shop-buy" onclick="buyFarmAutoCollect()"' + (roomData.coins < FARM_AUTOCOLLECT_COST ? ' disabled' : '') + '>' + FARM_AUTOCOLLECT_COST + '🪙</button>') +
        '</div>' +
        // ── automation & storage ──
        '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">🤖 ' + T('Auto-Feeder') + ' <small>' +
            (roomData.farmAutoFeed
              ? T('Refills at {pct}% · {cost} per feed', { pct: Math.round(FARM_AUTOFEED_AT * 100), cost: FARM_FOOD_COST + '🪙' })
              : T('Never top up the trough by hand again')) + '</small></span>' +
          (roomData.farmAutoFeed
            ? '<button class="farm-shop-buy" onclick="toggleFarmAutoFeed()">' + (roomData.farmAutoFeedOn ? '✓ ' + T('ON') : T('OFF')) + '</button>'
            : '<button class="farm-shop-buy" onclick="buyFarmAutoFeed()"' + (roomData.coins < FARM_AUTOFEED_COST ? ' disabled' : '') + '>' + FARM_AUTOFEED_COST + '🪙</button>') +
        '</div>' +
        '<div class="farm-panel-empty" style="padding:2px 0 4px">' + T('Buys feed with your coins — it stops when they run out, and never overdraws.') + '</div>' +
        (function () {
          const lvl = roomData.farmColdLevel || 0;
          const cost = lvl < FARM_COLD_COSTS.length ? FARM_COLD_COSTS[lvl] : null;
          const locked = !roomData.farmAutoCollect;
          return '<div class="farm-shop-row">' +
            '<span class="farm-shop-animal">❄️ ' + T('Cold Store') + ' <small>' +
              T('Lv {n}/{max} · banks {time} offline', { n: lvl, max: FARM_COLD_COSTS.length, time: _fmtFarmTime(farmOfflineCapMs()) }) + '</small></span>' +
            (cost == null
              ? '<span class="farm-shop-drop">' + T('MAX') + '</span>'
              : locked
              ? '<button class="farm-shop-buy" disabled>🔒 ' + T('Needs 🤖') + '</button>'
              : '<button class="farm-shop-buy" onclick="buyFarmCold()"' + (roomData.coins < cost ? ' disabled' : '') + '>+' + _fmtFarmTime(FARM_COLD_STEP_MS) + ' · ' + cost + '🪙</button>') +
          '</div>' +
          '<div class="farm-panel-empty" style="padding:2px 0 4px">' +
            T(locked
              ? 'Install the 🤖 Auto-Collector above first — without it, the longer you bank, the bigger the pile you have to tap through on your way back in.'
              : "How long your animals keep producing while you're away. Pair it with the 🤖 Auto-Feeder so they don't go hungry.") +
          '</div>';
        })() +
        _farmSkinsHtml();

      // Built (and subscribed) only when the Visit tab is active, so opening the
      // farm for normal play never spins up the rooms-list listener.
      const visitHtml = _farmTab === 'visit'
        ? '<div class="farm-section-title">🚜 ' + T('Visit other farms') + ' <span class="farm-panel-cap">' + T('live') + '</span></div>' +
          '<div class="farm-panel-empty" style="padding:0 2px 6px">' + T('Pick a farmer and lend a hand — cheer, water, feed or gift. You both gain.') + '</div>' +
          _farmVisitListHtml()
        : '';

      const card = (s) => '<section class="farm-card">' + s + '</section>';
      // The farm page is long, so it's split into its own tabs.
      const FARM_TABS = [
        { id: 'animals',  emoji: '🐮', label: 'Animals' },
        { id: 'garden',   emoji: '🌱', label: 'Garden' },
        { id: 'market',   emoji: '📦', label: 'Market' },
        { id: 'upgrades', emoji: '⚙️', label: 'Upgrades' },
        { id: 'visit',    emoji: '🚜', label: 'Visit' },
      ];
      const groups = {
        animals:  card(foodHtml) + card(herdHtml) + card(shopHtml),
        garden:   card(gardenHtml) + card(buildHtml),
        market:   card(stockHtml) + card(ordersHtml),
        upgrades: card(upgradesHtml),
        visit:    card(visitHtml) + card(_farmBoardHtml()),
      };
      const hints = {
        animals:  'Keep the trough filled — fed animals are happy and produce faster!',
        garden:   'Plant on the farm soil. Build machines here — then tap a machine on your farm to make goods.',
        market:   'Tap produce on the farm to collect it, then sell it or fill the daily orders.',
        upgrades: 'Expand your farm, automate collecting, and drag decor to arrange it.',
        visit:    "Helping at other farms earns coins — and puts you on this week's popularity board.",
      };
      if (!groups[_farmTab]) _farmTab = 'animals';
      // Mail waiting is worth surfacing on every tab, not just where the 📮 on
      // the farm happens to be in view.
      const mailN = _farmInboxCount();
      const mailHtml = mailN
        ? '<button class="farm-mail-cta" onclick="openFarmInbox()">📮 ' + T('{n} in your mailbox — tap to claim', { n: mailN }) + '</button>'
        : '';
      panel.innerHTML =
        '<div class="farm-panel-head">🚜 ' + T('Farm') + ' <span class="farm-panel-cap">🔥 ' + (roomData.farmCheersTotal || 0) + ' · ' +
          T('{n}/{cap} animals', { n: animals.length, cap: farmAnimalCap() }) + '</span></div>' +
        '<div class="farm-tabs">' +
          FARM_TABS.map(tb => '<button class="farm-tab' + (tb.id === _farmTab ? ' active' : '') + '" onclick="switchFarmTab(\'' + tb.id + '\')">' + tb.emoji + ' ' + T(tb.label) + '</button>').join('') +
        '</div>' +
        mailHtml +
        groups[_farmTab] +
        '<div class="farm-panel-hint">' + T(hints[_farmTab]) + '</div>';
    }

    /* ── Actions ── */
    async function refillFarmFood() {
      if (viewingUid !== currentUid) return;
      const food = roomData.farmFood || 0, max = farmFoodMax();
      const gap = max - food;
      if (gap < 0.5) return showToast(T('Trough is already full!'), '');
      const affordable = Math.floor(roomData.coins / FARM_FOOD_COST);
      if (affordable <= 0) return showToast(T('Not enough coins!'), 'error');
      const units = Math.min(Math.ceil(gap), affordable);          // whole units toward the brim
      roomData.coins -= units * FARM_FOOD_COST;
      logCoin(-(units * FARM_FOOD_COST), T('Farm food refill'));
      roomData.farmFood = Math.min(max, food + units);             // clamp so it reaches exactly max
      roomData.farmFoodAt = roomData.farmFoodAt || Date.now();
      await saveRoom();
      showToast('🌾 ' + T('Refilled the trough with {n} feed · −{cost}', { n: units, cost: units * FARM_FOOD_COST + '🪙' }), 'success');
      renderFarmPanel();
      renderAll(); // refresh coin counter
    }

    async function buyFarmAnimal(typeId) {
      if (viewingUid !== currentUid) return;
      const def = FARM_ANIMALS.find(f => f.id === typeId);
      if (!def) return;
      roomData.farmAnimals = roomData.farmAnimals || [];
      if (roomData.farmAnimals.length >= farmAnimalCap()) return showToast(T('Your pasture is full — expand it first.'), 'error');
      if (roomData.coins < def.cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= def.cost;
      logCoin(-def.cost, T('Bought {name}', { name: T(def.name) }));
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
      const band = _farmPenBand();                 // spawn inside the pasture, not on the crops
      roomData.farmAnimals.push({
        id: 'fa' + now + '_' + Math.floor(Math.random() * 1e4),
        type: def.id,
        variant: variant.id,
        collected: 0,
        happiness: FARM_START_HAPPINESS,
        lastDropTime: now,
        posX: 0.15 + Math.random() * 0.7,
        posY: band.top + Math.random() * (band.bot - band.top),
      });
      roomData.farmVariants = roomData.farmVariants || {};
      roomData.farmVariants[def.id + '_' + (variant.id || 'default')] = true;
      if (!roomData.farmFoodAt) roomData.farmFoodAt = now; // start the feeding clock
      await saveRoom();
      showToast(variant.rgb
        ? '🌈 ' + T('RGB {name} — jackpot!', { name: T(def.name) })
        : variant.rare
        ? '✨ ' + T('Rare {variant} {name} joined your farm!', { variant: T(variant.name), name: T(def.name) })
        : def.emoji + ' ' + T('{name} joined your farm!', { name: T(def.name) }), 'success');
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
      if (!_ownsButcher()) { showToast('🔪 ' + T('Build the Butcher first — Garden tab → Build Machines.'), 'error'); switchFarmTab('garden'); return; }
      _farmButcherConfirmId = id; renderFarmPanel();
    }
    function cancelButcher() { _farmButcherConfirmId = null; renderFarmPanel(); }
    async function butcherAnimal(id) {
      if (viewingUid !== currentUid) return;
      _farmButcherConfirmId = null;
      if (!_ownsButcher()) { renderFarmPanel(); return showToast('🔪 ' + T('Build the Butcher first — Garden tab → Build Machines.'), 'error'); }
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
      showToast('🔪 ' + T('Butchered {name} → 🥩 ×{n} meat', { name: def ? T(def.name) : T('animal'), n: yield_ }), 'success');
      renderFarmPanel();
      renderAll();
    }

    async function expandFarm() {
      if (viewingUid !== currentUid) return;
      const lvl = roomData.farmCapLevel || 0;
      if (lvl >= FARM_EXPAND_COSTS.length) return showToast(T('Farm is fully expanded!'), '');
      const cost = FARM_EXPAND_COSTS[lvl];
      if (roomData.coins < cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= cost;
      logCoin(-cost, T('Farm expansion'));
      roomData.farmCapLevel = lvl + 1;
      await saveRoom();
      showToast('🏞️ ' + T('Pasture expanded — it now holds {n} animals!', { n: farmAnimalCap() }), 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    async function buyFarmTrough() {
      if (viewingUid !== currentUid) return;
      const lvl = roomData.farmTroughLevel || 0;
      if (lvl >= FARM_TROUGH_COSTS.length) return showToast(T('Trough is fully upgraded!'), '');
      const cost = FARM_TROUGH_COSTS[lvl];
      if (roomData.coins < cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= cost;
      logCoin(-cost, T('Trough upgrade'));
      roomData.farmTroughLevel = lvl + 1;
      await saveRoom();
      showToast('🪣 ' + T('Bigger trough — it now holds {n} feed!', { n: farmFoodMax() }), 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    // 🤖 Auto-Feeder — one-time buy, then a toggle. It spends YOUR coins on feed,
    // so it ships switched on but has to be switchable off.
    async function buyFarmAutoFeed() {
      if (viewingUid !== currentUid) return;
      if (roomData.farmAutoFeed) return;
      if ((roomData.coins || 0) < FARM_AUTOFEED_COST) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= FARM_AUTOFEED_COST;
      logCoin(-FARM_AUTOFEED_COST, '🤖 ' + T('Auto-Feeder'));
      roomData.farmAutoFeed = true;
      roomData.farmAutoFeedOn = true;
      runFarmProduction();          // top the trough up right away if it's already low
      await saveRoom();
      renderFarmPanel(); renderAll();
      showToast('🤖 ' + T('Auto-Feeder installed — the trough refills itself below {pct}%.', { pct: Math.round(FARM_AUTOFEED_AT * 100) }), 'success');
    }
    async function toggleFarmAutoFeed() {
      if (viewingUid !== currentUid || !roomData.farmAutoFeed) return;
      roomData.farmAutoFeedOn = !roomData.farmAutoFeedOn;
      if (roomData.farmAutoFeedOn) runFarmProduction();
      await saveRoom();
      renderFarmPanel(); renderAll();
      showToast('🤖 ' + T(roomData.farmAutoFeedOn ? 'Auto-feeding is ON' : 'Auto-feeding is OFF — top the trough up yourself'), '');
    }

    // ❄️ Cold store — how much of an absence the farm banks.
    // Gated on the Auto-Collector, because without it a longer window only means
    // a bigger blocking "while you were away" modal to tap through every time
    // (see openFarm). Automate the collecting first, then buy more to collect.
    async function buyFarmCold() {
      if (viewingUid !== currentUid) return;
      if (!roomData.farmAutoCollect) {
        return showToast('❄️ ' + T('Install the 🤖 Auto-Collector first — otherwise banking longer just means more to clear by hand.'), 'error');
      }
      const lvl = roomData.farmColdLevel || 0;
      if (lvl >= FARM_COLD_COSTS.length) return;
      const cost = FARM_COLD_COSTS[lvl];
      if ((roomData.coins || 0) < cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= cost;
      logCoin(-cost, '❄️ ' + T('Cold Store') + ' ' + T('Lv {n}', { n: lvl + 1 }));
      roomData.farmColdLevel = lvl + 1;
      await saveRoom();
      renderFarmPanel(); renderAll();
      showToast('❄️ ' + T('Cold Store extended — the farm now banks {time}!', { time: _fmtFarmTime(farmOfflineCapMs()) }), 'success');
    }

    /* ── Farm skins ──
       Bought once, then free to switch between. The swatch is a real preview:
       it is built from the same day colours the canvas paints with, so a name
       alone never has to carry the difference. */
    function _farmSwatch(theme) {
      const d = theme.day || {};
      const g = d.grass || [], s = d.soil || [];
      // A mini cross-section of the real thing: tinted sky, grass, soil, with a
      // dot for the canopy. Built from the very colours the canvas paints with,
      // so the row cannot promise a look the farm does not deliver.
      const sky = d.sky || 'rgba(150,205,245,0.55)';
      return '<span style="position:relative;display:inline-block;width:26px;height:18px;border-radius:4px;' +
        'vertical-align:-4px;margin-right:7px;border:1px solid rgba(0,0,0,.25);overflow:hidden;' +
        'background:linear-gradient(180deg,' + sky + ' 0%,' + sky + ' 26%,' +
        (g[0] || '#9ed26b') + ' 26%,' + (g[2] || '#5ba23c') + ' 66%,' +
        (s[0] || '#8a6238') + ' 66%,' + (s[1] || '#5e4324') + ' 100%)">' +
        '<span style="position:absolute;left:3px;top:6px;width:7px;height:7px;border-radius:50%;background:' +
        (d.leaf || '#3f9a30') + '"></span></span>';
    }

    function _farmSkinsHtml() {
      if (typeof FARM_THEMES === 'undefined') return '';
      const activeId = (farmThemeOf(FARM_THEMES, roomData.farmTheme, roomData.ownedFarmThemes) || {}).id;
      const rows = FARM_THEMES.map(function (th) {
        const owned = farmThemeOwned(th, roomData.ownedFarmThemes);
        const action = th.id === activeId
          ? '<span class="farm-shop-drop">✓ ' + T('In use') + '</span>'
          : owned
          ? '<button class="farm-shop-buy" onclick="setFarmTheme(\'' + th.id + '\')">' + T('Use') + '</button>'
          : '<button class="farm-shop-buy" onclick="buyFarmTheme(\'' + th.id + '\')"' +
            (roomData.coins < th.cost ? ' disabled' : '') + '>' + th.cost + '🪙</button>';
        return '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">' + _farmSwatch(th) + th.emoji + ' ' + T(th.name) +
            (th.blurb ? ' <small>' + T(th.blurb) + '</small>' : '') + '</span>' +
          action +
        '</div>';
      }).join('');
      return '<div class="farm-section-title" style="margin-top:12px">🎨 ' + T('Farm look') + '</div>' +
        rows +
        '<div class="farm-panel-empty" style="padding:2px 0 4px">' +
          T('Buy a look once, then switch whenever you like. Visitors see your farm in it too.') +
        '</div>';
    }

    async function buyFarmTheme(id) {
      if (viewingUid !== currentUid) return;
      const th = (FARM_THEMES || []).find(function (t) { return t.id === id; });
      if (!th || farmThemeOwned(th, roomData.ownedFarmThemes)) return;
      if (roomData.coins < th.cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= th.cost;
      logCoin(-th.cost, T('Farm look'));
      roomData.ownedFarmThemes = (roomData.ownedFarmThemes || []).concat([th.id]);
      roomData.farmTheme = th.id;                       // buying it puts it on
      await saveRoom();
      showToast(th.emoji + ' ' + T('{name} — your farm is wearing it now!', { name: T(th.name) }), 'success');
      renderFarmPanel();
      renderAll();
    }

    async function setFarmTheme(id) {
      if (viewingUid !== currentUid) return;
      const th = (FARM_THEMES || []).find(function (t) { return t.id === id; });
      if (!th || !farmThemeOwned(th, roomData.ownedFarmThemes)) return;
      if (roomData.farmTheme === id) return;
      roomData.farmTheme = id;
      await saveRoom();
      renderFarmPanel();                                // the canvas picks it up on its next frame
    }

    async function buyFarmAutoCollect() {
      if (viewingUid !== currentUid) return;
      if (roomData.farmAutoCollect) return;
      if (roomData.coins < FARM_AUTOCOLLECT_COST) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= FARM_AUTOCOLLECT_COST;
      logCoin(-FARM_AUTOCOLLECT_COST, T('Auto-collector'));
      roomData.farmAutoCollect = true;
      if (runFarmProduction() >= 0) { /* sweep any drops already on the ground */ }
      await saveRoom();
      showToast('🤖 ' + T('Auto-Collector installed — produce goes straight to your stock!'), 'success');
      renderFarmPanel();
      renderAll();
    }

    async function buyFarmDecor(typeId) {
      if (viewingUid !== currentUid) return;
      const def = FARM_DECORS.find(f => f.id === typeId);
      if (!def) return;
      if (roomData.coins < def.cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= def.cost;
      logCoin(-def.cost, T('Bought {name}', { name: T(def.name) }));
      roomData.farmDecors = roomData.farmDecors || [];
      roomData.farmDecors.push({
        id: 'fdc' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
        type: def.id,
        x: 0.15 + Math.random() * 0.7,
        y: 0.50 + Math.random() * 0.38,
      });
      await saveRoom();
      showToast(def.emoji + ' ' + T('{name} placed — drag it anywhere!', { name: T(def.name) }), 'success');
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
      if (roomData.coins < mc.cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= mc.cost;
      logCoin(-mc.cost, T('Built {name}', { name: T(mc.name) }));
      roomData.farmMachines[id] = { owned: true, slots: 1, jobs: [0] };
      await saveRoom();
      showToast(mc.emoji + ' ' + T('{name} built! Tap it on your farm to make goods.', { name: T(mc.name) }), 'success');
      renderFarmPanel();
      renderAll();
    }

    async function buyMachineSlot(id) {
      if (viewingUid !== currentUid) return;
      const m = _machineState(id);
      if (!m) return;
      if (m.slots >= FARM_MAX_SLOTS) return showToast(T('All {n} slots are open already.', { n: FARM_MAX_SLOTS }), '');
      if (roomData.coins < FARM_SLOT_COST) return showToast(T('Not enough coins!') + ' (' + FARM_SLOT_COST + '🪙)', 'error');
      roomData.coins -= FARM_SLOT_COST;
      logCoin(-FARM_SLOT_COST, T('Machine slot'));
      m.slots += 1; m.jobs.push(0);
      _slotConfirm = false;
      await saveRoom();
      showToast('🧰 ' + T('New production slot opened!'), 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    async function startMachineSlot(id, slot, r) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id), m = _machineState(id);
      if (!mc || !m || m.jobs[slot]) return;
      const recipe = mc.recipes[r]; if (!recipe) return;
      const stockNow = roomData.farmStock || {};
      if (!Object.keys(recipe.in).every(k => (stockNow[k] || 0) >= recipe.in[k])) return showToast(T('Not enough ingredients!'), 'error');
      Object.keys(recipe.in).forEach(k => { stockNow[k] -= recipe.in[k]; });
      roomData.farmStock = stockNow;
      m.jobs[slot] = { at: Date.now(), r: r };
      _makeChoiceSlot = null;
      await saveRoom();
      const outM = farmProductMeta()[recipe.out.id];
      showToast(mc.emoji + ' ' + T('making {item}…', { item: outM ? outM.emoji + ' ' + T(outM.name) : recipe.out.id }), 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    async function collectMachineSlot(id, slot) {
      if (viewingUid !== currentUid) return;
      const mc = FARM_MACHINES.find(m => m.id === id), m = _machineState(id);
      if (!mc || !m || !m.jobs[slot]) return;
      const job = m.jobs[slot], recipe = mc.recipes[job.r] || mc.recipes[0];
      if (cropProgress(job.at, Date.now(), recipe.timeMs) < 1) return showToast(T('Still processing…'), '');
      // Apply locally, then persist. If the save fails, roll back — otherwise the
      // collected item silently disappears when the next snapshot overwrites it.
      roomData.farmStock = roomData.farmStock || {};
      roomData.farmStock[recipe.out.id] = (roomData.farmStock[recipe.out.id] || 0) + recipe.out.qty;
      m.jobs[slot] = 0;
      const ok = await saveRoom();
      if (!ok) {
        roomData.farmStock[recipe.out.id] -= recipe.out.qty;
        m.jobs[slot] = job;
        return showToast(T('Could not collect — save failed. Check your connection and try again.'), 'error');
      }
      const outM = farmProductMeta()[recipe.out.id];
      showToast(T('Collected {n} {item}!', { n: recipe.out.qty, item: outM ? outM.emoji + ' ' + T(outM.name) : recipe.out.id }), 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    /* ── Orders ── */
    async function fulfillFarmOrder(idx) {
      if (viewingUid !== currentUid) return;
      _ensureFarmOrders();
      const o = _farmOrders()[idx];
      if (!o || (roomData.farmOrdersDone || []).includes(idx)) return;
      const stockNow = roomData.farmStock || {};
      if (!o.items.every(it => (stockNow[it.id] || 0) >= it.qty)) return showToast(T('Not enough produce for this order.'), 'error');
      o.items.forEach(it => { stockNow[it.id] -= it.qty; });
      roomData.farmStock = stockNow;
      roomData.coins += o.reward;
      logCoin(o.reward, T('Farm order reward'));
      roomData.farmOrdersDone = [...(roomData.farmOrdersDone || []), idx];
      await saveRoom();
      showToast('📦 ' + T('Order delivered!') + ' +' + o.reward + '🪙', 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    /* ── Garden ── */
    async function addFarmPlot() {
      if (viewingUid !== currentUid) return;
      roomData.farmPlots = roomData.farmPlots || [];
      if (roomData.farmPlots.length >= FARM_PLOT_MAX) return showToast(T('Max plots reached!'), '');
      if (roomData.coins < FARM_PLOT_COST) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= FARM_PLOT_COST;
      logCoin(-FARM_PLOT_COST, T('Bought plot'));
      roomData.farmPlots.push({ id: 'fp' + Date.now() + '_' + Math.floor(Math.random() * 1e4), crop: null, plantedAt: 0 });
      await saveRoom();
      showToast('🌱 ' + T('New garden plot added!'), 'success');
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
      const _wh = _farmWH();
      let n = 0;
      for (let i = 0; i < plots.length; i++) {
        const plot = plots[i];
        if (!plot.crop) continue;
        const crop = FARM_CROPS.find(c => c.id === plot.crop);
        if (!crop) { plot.crop = null; plot.plantedAt = 0; continue; }
        if (cropProgress(plot.plantedAt, now, crop.growMs) < 1) continue;
        const pos = _farmPlotPos(i, _wh.W, _wh.H);
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
      if (!n) return showToast(T('Nothing ripe to harvest yet.'), '');
      _farmWeekAddProduce(n);
      saveRoom(); renderFarmPanel(); renderAll();
      showToast('🧺 ' + I18N.plural(n, 'Harvested 1 bed', 'Harvested {n} beds'), 'success');
    }

    // Tap in the garden → ripe harvests every ready crop on the farm, an empty
    // bed opens the crop picker, a growing bed reports its time left.
    // `plotIdx` is the bed the tap landed on, or null when a signboard won.
    function _farmRowClick(row, plotIdx) {
      if (viewingUid !== currentUid) return;
      const plots = roomData.farmPlots || [];
      const idxs = farmRowIndices(plots.length, row, _farmPerRow());
      if (!idxs.length) return;
      const st = farmRowState(idxs.map(i => plots[i]), FARM_CROPS, Date.now());
      if (st.state === 'ripe') return harvestAllFarm();
      // An empty bed opens the picker even when the ROW reads as growing: one
      // seedling used to lock every other bed in its row out of being planted,
      // because farmRowState calls any partly-planted row 'growing'.
      const tapped = plotIdx != null ? plots[plotIdx] : null;
      if (st.state === 'growing' && (!tapped || tapped.crop)) {
        const crop = FARM_CROPS.find(c => c.id === st.cropId);
        return showToast(T('{crop} growing — {time} left',
          { crop: crop ? crop.emoji + ' ' + T(crop.name) : T('Crop'), time: _fmtFarmTime(st.msLeft) }), '');
      }
      openCropPicker(row, plotIdx);
    }

    /* ── Crop picker (tap an empty plot) + plant helpers ── */
    function _fmtFarmTime(ms) {
      const m = Math.max(0, Math.ceil(ms / 60000));
      if (m < 60) return T('{n}m', { n: m });
      return T('{h}h {m}m', { h: Math.floor(m / 60), m: m % 60 });
    }

    // Empty plot indices that `scope` would plant into, given the tapped bed.
    function _farmPlantIdxs(scope) {
      const plots = roomData.farmPlots || [];
      if (scope === 'one') {
        return (plots[_plantPlot] && !plots[_plantPlot].crop) ? [_plantPlot] : [];
      }
      if (scope === 'all') {
        return plots.reduce((out, p, i) => { if (!p.crop) out.push(i); return out; }, []);
      }
      return farmRowIndices(plots.length, _plantRow, _farmPerRow()).filter(i => !plots[i].crop);
    }

    // Scope switcher in the picker header.
    function setPlantScope(scope) {
      if (scope !== 'one' && scope !== 'row' && scope !== 'all') return;
      _plantScope = scope;
      try { localStorage.setItem(FARM_SCOPE_KEY, scope); } catch (e) { /* private mode */ }
      _pendingPlant = null;
      _renderCropPicker();
    }

    function openCropPicker(row, plotIdx) {
      _plantRow = row || 0;
      _plantPlot = plotIdx != null ? plotIdx : _plantRow * _farmPerRow();
      _pendingPlant = null;
      // The remembered scope may have nothing to plant where this tap landed
      // (e.g. 'one' onto an already-planted bed). Fall back to one that does,
      // without persisting it — only an explicit choice is remembered.
      if (!_farmPlantIdxs(_plantScope).length) {
        _plantScope = ['one', 'row', 'all'].find(s => _farmPlantIdxs(s).length) || _plantScope;
      }
      _renderCropPicker();
      const picker = document.getElementById('cropPicker');
      if (picker) picker.style.display = 'block';
    }
    function closeCropPicker() {
      _pendingPlant = null;
      const p = document.getElementById('cropPicker');
      if (p) p.style.display = 'none';
    }
    // Crop chooser: pick how much to plant, then pick the crop. Each scope tab
    // shows how many beds it covers, and each crop row shows what that costs, so
    // "All" can never spend the coins as a surprise.
    function _renderCropPicker() {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      const counts = { one: _farmPlantIdxs('one').length,
                       row: _farmPlantIdxs('row').length,
                       all: _farmPlantIdxs('all').length };
      const empties = counts[_plantScope];
      // Keys, not translations: the render below runs each through T(), so a
      // language change repaints them without rebuilding this table.
      const SCOPES = [['one', '1 bed'], ['row', 'This row'], ['all', 'All empty']];
      picker.innerHTML =
        '<div class="cp-head">🌱 ' + T('Plant') + '</div>' +
        '<div class="cp-scope">' +
          SCOPES.map(s =>
            '<button class="cp-scope-btn' + (_plantScope === s[0] ? ' active' : '') + '"' +
              (counts[s[0]] ? '' : ' disabled') +
              ' onclick="setPlantScope(\'' + s[0] + '\')">' +
              T(s[1]) + '<small>' + T('{n} empty', { n: counts[s[0]] }) + '</small></button>').join('') +
        '</div>' +
        '<div class="cp-bulk-info">' +
          I18N.plural(empties, 'Planting <b>1</b> bed', 'Planting <b>{n}</b> beds') +
          ' · ' + T('Coins: {n}', { n: '<b>' + roomData.coins + '</b>' }) + '</div>' +
        FARM_CROPS.map(c => {
          const afford = roomData.coins >= c.seedCost;
          return '<button class="cp-crop"' + (afford && empties ? '' : ' disabled') + ' onclick="plantRow(\'' + c.id + '\')">' +
            '<span class="cp-emoji">' + c.emoji + '</span>' +
            '<span class="cp-info"><b>' + T(c.name) + '</b><small>' +
              T('grows in {time} · {cost} a bed', { time: _fmtFarmTime(c.growMs), cost: c.seedCost + '🪙' }) + '</small></span>' +
            '<span class="cp-cost">' + (c.seedCost * empties) + '🪙</span>' +
            '</button>';
        }).join('') +
        '<button class="cp-close" onclick="closeCropPicker()">' + T('Close') + '</button>';
    }

    // Chose a crop in the picker → plant the current scope. Plants the lot when
    // affordable, else a confirmation to plant as many as coins allow.
    function plantRow(cropId) {
      if (viewingUid !== currentUid) return;
      const emptyIdxs = _farmPlantIdxs(_plantScope);
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (!crop || !emptyIdxs.length) { closeCropPicker(); return; }
      const affordable = farmAffordableCount(roomData.coins, crop.seedCost, emptyIdxs.length);
      if (affordable <= 0) { closeCropPicker(); return showToast(T('Not enough coins for {crop} seed!', { crop: T(crop.name) }), 'error'); }
      if (affordable >= emptyIdxs.length) return _doPlant(cropId, emptyIdxs);
      _pendingPlant = { cropId: cropId, count: affordable, total: emptyIdxs.length };
      _renderPlantConfirm(crop, emptyIdxs.length, affordable);
    }

    // Plant `crop` into the given plot indices (stops early if coins run out).
    function _doPlant(cropId, idxs) {
      const plots = roomData.farmPlots || [];
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (!crop) { closeCropPicker(); return; }
      const now = Date.now();
      const _wh = _farmWH();
      let planted = 0;
      for (const i of idxs) {
        if (roomData.coins < crop.seedCost) break;
        roomData.coins -= crop.seedCost;
        plots[i].crop = crop.id; plots[i].plantedAt = now;
        const pos = _farmPlotPos(i, _wh.W, _wh.H);
        _farmParticles.push({ text: crop.emoji, x: pos.x, y: pos.y - 0.05, vy: -0.0008, life: 900, born: performance.now() });
        planted++;
      }
      closeCropPicker();
      if (planted) {
        saveRoom(); renderFarmPanel(); renderAll();
        showToast('🌱 ' + I18N.plural(planted, 'Planted 1 {crop}', 'Planted {n} {crop}', { crop: T(crop.name) }), 'success');
      }
    }

    // Not-enough-coins confirmation (detailed wording), reusing #cropPicker.
    function _renderPlantConfirm(crop, total, affordable) {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      const what = _plantScope === 'all' ? T('Every empty bed') : _plantScope === 'one' ? T('That bed') : T('A full row');
      picker.innerHTML =
        '<div class="cp-head">🪙 ' + T('Not enough coins') + '</div>' +
        '<div class="cp-bulk-info" style="line-height:1.5">' +
          T('{what} of {crop} costs {cost} ({n} beds).',
            { what: what, crop: '<b>' + crop.emoji + ' ' + T(crop.name) + '</b>',
              cost: '<b>' + (crop.seedCost * total) + '🪙</b>', n: total }) + '<br>' +
          T('You have {coins} — enough for {n} beds.',
            { coins: '<b>' + roomData.coins + '🪙</b>', n: '<b>' + affordable + '</b>' }) + '</div>' +
        '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="confirmPlantPartial()">🌱 ' +
          T('Plant {n} · {cost}', { n: affordable, cost: affordable * crop.seedCost + '🪙' }) + '</button>' +
        '<button class="cp-close" onclick="closeCropPicker()">' + T('Cancel') + '</button>';
      picker.style.display = 'block';
    }

    // Confirmed the partial plant → fill as many of the scope's empty beds as
    // the coins reach.
    function confirmPlantPartial() {
      if (!_pendingPlant) return closeCropPicker();
      const idxs = _farmPlantIdxs(_plantScope).slice(0, _pendingPlant.count);
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
      _farmWeekAddProduce(1);
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
      logCoin((qty * price), T('Sold produce'));
      roomData.farmStock[prodId] = 0;
      await saveRoom();
      const m = farmProductMeta()[prodId];
      showToast(T('Sold {n} {item} for {coins}', { n: qty, item: m ? m.emoji + ' ' + T(m.name) : prodId, coins: (qty * price) + '🪙' }), 'success');
      checkAchievements();
      renderFarmPanel();
      renderAll();
    }

    async function sellAllFarm() {
      if (viewingUid !== currentUid) return;
      const total = farmSellAllValue(roomData.farmStock || {}, farmProductPrices());
      if (total <= 0) return showToast(T('No produce to sell.'), '');
      roomData.coins += total;
      logCoin(total, T('Sold all produce'));
      roomData.farmStock = {};
      await saveRoom();
      showToast(T('Sold everything for {coins}!', { coins: total + '🪙' }), 'success');
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
      const s = _farmCartSize(W, H);
      const hover = Math.sin(t / 600) * (s * 0.08);
      const at = _farmCartPos(W, H);
      const cx = (at.x + (offsetX || 0)) * W, cy = at.y * H + hover;
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
      ctx.fillText(T('Tap to sell!'), bnX + bnW / 2, bnY + bnH / 2 + flap);
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
      const s = _farmCartSize(W, H) * 0.84;   // the away cloud reads a touch smaller than the plane
      const hover = Math.sin(t / 700) * (s * 0.06);
      const at = _farmCartPos(W, H);
      const cx = at.x * W, cy = at.y * H + hover;
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

    // Fixed slot position for machine `slot` (its hut), on the grass below the
    // plane's sky lane. Overlap with the plane's tap rect is resolved by
    // _farmSkyTarget, which picks the nearest target rather than the first.
    function _workshopPos(slot) { return { x: 0.22 + slot * 0.11, y: FARM_HUT_Y }; }

    // Which fixed target a tap in the farm's upper half lands on: an owned
    // machine hut's id, '#cart' for the merchant plane, '#mail' for the mailbox,
    // or null. Split out of the click handler so the geometry is testable —
    // see room-farm-hit.test.js.
    //
    // One nearest-wins pass in real pixels, NOT a priority chain of normalized
    // circles. The chain used to check huts first with a 0.13 "radius" which on
    // a phone is a 47×68px ellipse — tall enough to reach up into the sky and
    // swallow every tap meant for the plane, banner included.
    function _farmSkyTarget(cx, cy, W, H) {
      const targets = [];
      if (viewingUid === currentUid) {
        // Mail first: on a wide stage the plane's rect clips the mailbox's badge
        // corner, and an exact tie goes to whoever is listed first. The mailbox
        // is drawn on top there, so it should win there too.
        targets.push(Object.assign({ id: '#mail' },
          farmMailTapRect(_farmMailPos(W, H), _farmMailSize(W, H), W, H)));
        targets.push(Object.assign({ id: '#cart' },
          farmCartTapRect(_farmCartPos(W, H), _farmCartSize(W, H), W, H, _farmCart().present)));
      }
      const owned = roomData.farmMachines || {};
      FARM_MACHINES.forEach(function (m, slot) {
        if (owned[m.id] && owned[m.id].owned) {
          const p = _workshopPos(slot);
          targets.push({ id: m.id, x: p.x, y: p.y });
        }
      });
      return farmPickTarget({ x: cx, y: cy }, W, H, targets, FARM_TAP_REACH_PX);
    }

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
      showToast('🛒 ' + T('Sent the cart off — back in {time} with a new list.', { time: _fmtFarmTime(FARM_CART_COOLDOWN_MS) }), '');
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
          '<div class="cp-head">🛒 ' + T('Cart is away') + '</div>' +
          '<div class="farm-panel-empty" style="padding:0 2px 8px">' +
            T('Back in {time}. The next cart will want:', { time: '<b>' + _fmtFarmTime(cart.nextInMs) + '</b>' }) + '</div>' +
          '<div class="cart-grid">' + want + '</div>' +
          '<button class="cp-close" onclick="closeCartSheet()">' + T('Close') + '</button>';
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
        const mk = _farmMachineFor(w.id);
        for (let k = 0; k < remaining; k++) {
          if (k < sellable) {
            squares += '<button class="cart-sq" onclick="sellOneToCart(\'' + w.id + '\')">' +
              '<span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap">+' + (prices[w.id] || 0) + '🪙</span></button>';
            continue;
          }
          // Don't have it yet — send them to the workshop that makes it rather
          // than leaving a dead square that only says "make".
          squares += mk
            ? '<button class="cart-sq make" onclick="goMakeForCart(\'' + mk.id + '\')" title="' + T('Make {product} in the {machine}', { product: T(m.name), machine: T(mk.name) }) + '">' +
                '<span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap">' + mk.emoji + ' ' + T('make') + '</span></button>'
            : '<div class="cart-sq locked" title="' + T('Make this in the workshop, then sell it') + '">' +
                '<span class="cart-sq-icon">' + m.emoji + '</span><span class="cart-sq-cap">' + T('make') + '</span></div>';
        }
      });
      const wantsLine = cart.wanted.map(w => (meta[w.id] || { emoji: '❓' }).emoji + '×' + Math.max(0, w.qty - (_cartSold[w.id] || 0))).join('  ');
      el.innerHTML =
        '<div class="cp-head">🛒 ' + T('Merchant Cart') + '</div>' +
        (cart.wanted.length
          ? '<div class="farm-panel-empty" style="padding:0 2px 4px">' +
              T('Wants: {list}', { list: wantsLine }) + ' · ' +
              T('tap a square to sell it; tap a “make” square to go to the workshop that makes it.') + '</div>' +
            '<div class="cart-grid">' + squares + '</div>' +
            (sellableTotal > 0
              ? '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="sellAllToCart()">💰 ' + T('Sell all it wants') + '</button>'
              : '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="dismissCart()">🐴 ' + T('Send it off (new cart in {time})', { time: _fmtFarmTime(FARM_CART_COOLDOWN_MS) }) + '</button>')
          : '<div class="ws-status">' + T('Build a workshop first — then the cart buys what it makes.') + '</div>' +
            '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="dismissCart()">🐴 ' + T('Send it off (new cart in {time})', { time: _fmtFarmTime(FARM_CART_COOLDOWN_MS) }) + '</button>') +
        '<button class="cp-close" onclick="closeCartSheet()">' + T('Close') + '</button>';
      el.style.display = 'block';
    }

    async function sellOneToCart(prodId) {
      if (viewingUid !== currentUid) return;
      const cart = _farmCart();
      if (!cart.present) { closeCartSheet(); return showToast(T("The cart has left — it'll be back later."), ''); }
      const want = cart.wanted.find(w => w.id === prodId);
      if (!want) return showToast(T("The cart isn't buying that this visit."), '');
      if (_cartSellable(want, roomData.farmStock || {}) <= 0) return showToast(T('The cart has had enough of that.'), '');
      const price = farmProductPrices()[prodId] || 0;
      roomData.coins += price;
      logCoin(price, T('Sold to cart'));
      roomData.farmStock[prodId] = (roomData.farmStock[prodId] || 0) - 1;
      _cartSold[prodId] = (_cartSold[prodId] || 0) + 1;
      roomData.farmCartSold = { visitStart: cart.visitStart, sold: _cartSold };
      await saveRoom();
      const m = farmProductMeta()[prodId];
      showToast(T('Sold 1 {item} for {coins}', { item: m ? m.emoji + ' ' + T(m.name) : prodId, coins: price + '🪙' }), 'success');
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
      if (!cart.present) { closeCartSheet(); return showToast(T("The cart has left — it'll be back later."), ''); }
      const stock = roomData.farmStock || {}, prices = farmProductPrices();
      let total = 0, sold = 0;
      for (const w of cart.wanted) {
        const n = _cartSellable(w, stock);
        if (n > 0) { total += n * (prices[w.id] || 0); sold += n; stock[w.id] = (stock[w.id] || 0) - n; _cartSold[w.id] = (_cartSold[w.id] || 0) + n; }
      }
      if (!sold) return showToast(T('Nothing the cart wants right now.'), '');
      roomData.coins += total;
      logCoin(total, T('Sold to cart'));
      roomData.farmStock = stock;
      roomData.farmCartSold = { visitStart: cart.visitStart, sold: _cartSold };
      checkAchievements();
      // Fully fulfilled → the plane flies off (new one in 4h); otherwise it stays
      // so you can finish the rest (or tap "Send it off").
      if (cart.wanted.every(w => (w.qty - (_cartSold[w.id] || 0)) <= 0)) {
        showToast('🛒 ' + T('Sold {n} items for {coins} — off it goes.', { n: sold, coins: total + '🪙' }), 'success');
        renderFarmPanel(); renderAll();
        return _departCart(true);
      }
      await saveRoom();
      showToast('🛒 ' + T('Sold {n} items for {coins}.', { n: sold, coins: total + '🪙' }), 'success');
      renderCartSheet(); renderFarmPanel(); renderAll();
    }

    // ── RGB coat preview — a little gallery of each animal's rainbow variant ──
    let _rgbPreviewAnim = null;
    function openRgbPreview() {
      const el = document.getElementById('rgbPreview');
      if (!el) return;
      el.innerHTML =
        '<div class="rgb-box">' +
          '<div class="rgb-head">🌈 ' + T('Rainbow (RGB) coats') + '</div>' +
          '<div class="rgb-sub">' + T('~{pct}% chance on any animal you buy. Cosmetic only — same value as a normal one.', { pct: Math.round(FARM_RGB_CHANCE * 100) }) + '</div>' +
          '<div class="rgb-grid">' +
            FARM_ANIMALS.map(d => '<div class="rgb-cell"><canvas class="rgb-canvas" data-type="' + d.id + '" width="120" height="120"></canvas><span>' + d.emoji + ' ' + T(d.name) + '</span></div>').join('') +
          '</div>' +
          '<button class="cp-close" onclick="closeRgbPreview()">' + T('Close') + '</button>' +
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
      const next = Math.max(0, (a.lastDropTime || Date.now()) + cycleMs - Date.now());
      const prodLine = T('Makes {item} every ~{cycle} · next in {next}',
          { item: def.drop.emoji + ' ' + T(def.drop.name), cycle: _fmtFarmTime(cycleMs),
            next: next <= 0 ? T('soon') : _fmtFarmTime(next) }) +
        (waiting ? ' · ' + T('{n} waiting', { n: waiting }) : '');
      const nextThresh = FARM_LEVELS[lvl];                                  // threshold for next level
      const lvlInfo = nextThresh != null
        ? T('{have}/{need} to Lv{lvl}', { have: a.collected || 0, need: nextThresh, lvl: lvl + 1 })
        : T('max level');
      let actions;
      if (_animalButcherConfirm) {
        actions = '<div class="ws-status">' +
          T('Butcher {name}? You get 🥩×{n} (tier {base} + Lv bonus {bonus}) — gone for good.',
            { name: T(def.name), n: meat, base: meatBase, bonus: meat - meatBase }) + '</div>' +
          '<button class="cp-crop" style="justify-content:center;font-weight:800;background:var(--g-danger);color:#fff" onclick="confirmButcherAnimal()">✓ ' + T('Butcher') + '</button>' +
          '<button class="cp-crop" style="justify-content:center" onclick="cancelAnimalButcher()">✗ ' + T('Keep it') + '</button>';
      } else if (_ownsButcher()) {
        actions = '<button class="cp-crop" style="justify-content:center;color:#f87171" onclick="askAnimalButcher()">🔪 ' + T('Butcher for meat (🥩×{n})', { n: meat }) + '</button>';
      } else {
        actions = '<div class="ws-status">🔪 ' + T('Build the Butcher (Garden tab) to butcher animals.') + '</div>';
      }
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">' + def.emoji + ' ' + T(def.name) + mark + '</div>' +
          '<div class="ws-sub">' + T('Lv {n}', { n: lvl }) + ' · ' + lvlInfo + '</div>' +
          '<div class="ws-status" style="margin:2px 0 6px">' + T('Happiness') + ' <b style="color:' + color + '">' + h + '%</b></div>' +
          '<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:0 0 8px"><div style="height:100%;width:' + h + '%;background:' + color + '"></div></div>' +
          '<div class="ws-status" style="margin:0 0 12px">' + prodLine + '</div>' +
          actions +
          '<button class="cp-close" onclick="closeAnimalModal()">' + T('Close') + '</button>' +
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
      _farmWeekAddProduce(drops.length);
      await saveRoom();
      showToast(T('Collected {n} {item}!', { n: drops.length, item: def ? def.drop.emoji + ' ' + T(def.drop.name) : type }), 'success');
      checkAchievements(); renderProduceModal(); renderFarmPanel(); renderAll();
    }
    async function collectAllProduce() {
      if (viewingUid !== currentUid) return;
      const n = _autoCollectAll();   // every drop → stock (+XP)
      if (!n) return;
      await saveRoom();
      showToast(T('Collected {n} produce!', { n: n }), 'success');
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
          '<span class="ws-slot-no">' + def.drop.emoji + ' ' + T(def.drop.name) + '</span>' +
          '<span class="ws-slot-state">×' + n + '</span>' +
          '<button class="farm-shop-buy" onclick="collectProduceType(\'' + type + '\')"' + (n > 0 ? '' : ' disabled') + '>' + T('Collect') + '</button>' +
          '</div>';
      }).join('') : '<div class="ws-status">' + T('No animals yet — buy one in the Animals tab.') + '</div>';
      const total = Object.keys(counts).reduce((s, k) => s + counts[k], 0);
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🧺 ' + T('Produce') + '</div>' +
          '<div class="ws-sub">' + T('Your animals keep producing whether you collect or not.') + '</div>' +
          rows +
          (total > 0 ? '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="collectAllProduce()">📦 ' + T('Collect all ({n})', { n: total }) + '</button>' : '') +
          '<button class="cp-close" onclick="closeProduceModal()">' + T('Close') + '</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    // ── Single-machine modal — tap a machine's hut on the farm to make goods with
    // just THAT machine (start a batch / collect it). Machines are BUILT in the
    // Garden tab; this modal only operates an already-built one.
    function openMachineModal(id) { _workshopModalId = id; _makeChoiceSlot = null; _slotConfirm = false; _workshopModalOpen = true; renderWorkshopModal(); }

    // Which workshop makes `prodId`. _cartBuildWanted only ever asks for goods
    // from machines you already own, so this resolves for anything the cart
    // wants — but callers still handle null.
    function _farmMachineFor(prodId) {
      return FARM_MACHINES.find(m => (m.recipes || []).some(r => r.out && r.out.id === prodId)) || null;
    }

    // A "make" square in the cart sheet → go straight to the workshop that makes
    // it. Closes the cart sheet first so the two sheets never stack.
    function goMakeForCart(machineId) {
      closeCartSheet();
      openMachineModal(machineId);
    }
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
      const haveLine = '<div class="ws-status" style="margin:2px 0 8px">' + T('In stock: {list}', { list: haveStr }) + '</div>';
      let body;
      if (!m) {
        body = '<div class="ws-status">' + T('Not built yet — build it in the 🌱 Garden tab.') + '</div>';
      } else {
        // A grid of FARM_MAX_SLOTS squares: locked (buy) · idle (tap to choose) ·
        // making (shows the product + timer) · ready (tap to collect).
        let cells = '';
        for (let i = 0; i < FARM_MAX_SLOTS; i++) {
          if (i >= m.slots) {                                   // not opened yet
            const afford = roomData.coins >= FARM_SLOT_COST;
            cells += '<button class="ws-cell locked"' + (afford ? '' : ' disabled') + ' onclick="askOpenSlot()">' +
              '<span class="ws-cell-icon">🔒</span><span class="ws-cell-cap">' + T('Open · {cost}', { cost: Math.round(FARM_SLOT_COST / 1000) + 'k🪙' }) + '</span></button>';
            continue;
          }
          const job = m.jobs[i];
          if (!job) {                                           // open + empty
            cells += '<button class="ws-cell idle' + (_makeChoiceSlot === i ? ' picking' : '') + '" onclick="chooseMake(' + i + ')">' +
              '<span class="ws-cell-icon">➕</span><span class="ws-cell-cap">' + T('Make') + '</span></button>';
          } else {
            const recipe = mc.recipes[job.r] || mc.recipes[0];
            const oM = meta[recipe.out.id] || { emoji: '❓' };
            if (cropProgress(job.at, now, recipe.timeMs) >= 1) {
              cells += '<button class="ws-cell ready" onclick="collectMachineSlot(\'' + mc.id + '\',' + i + ')">' +
                '<span class="ws-cell-icon">' + oM.emoji + '</span><span class="ws-cell-cap">✅ ' + T('Collect') + '</span></button>';
            } else {
              cells += '<div class="ws-cell busy">' +
                '<span class="ws-cell-icon">' + oM.emoji + '</span><span class="ws-cell-cap">⏳ ' + T('{n}m', { n: Math.ceil((recipe.timeMs - (now - job.at)) / 60000) }) + '</span></div>';
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
            return '<button class="farm-shop-buy ws-recipe" onclick="startMachineSlot(\'' + mc.id + '\',' + _makeChoiceSlot + ',' + r + ')"' + (can ? '' : ' disabled') + '>' + oM.emoji + ' ' + T(oM.name) + ' <small>' + inStr + ' · ' + T('{n}m', { n: Math.round(rc.timeMs / 60000) }) + '</small></button>';
          }).join('');
          chooser = '<div class="ws-choose"><div class="ws-slot-no">' + T('Slot {n} — pick a product', { n: _makeChoiceSlot + 1 }) + ' <span class="ws-x" onclick="cancelMake()">✕</span></div>' + choices + '</div>';
        }
        // confirmation before spending coins to open a new slot
        let confirmBanner = '';
        if (_slotConfirm) {
          confirmBanner = '<div class="ws-choose"><div class="ws-slot-no">' + T('Open a new slot for {cost}?', { cost: FARM_SLOT_COST + '🪙' }) + ' <span class="ws-x" onclick="cancelOpenSlot()">✕</span></div>' +
            '<button class="farm-shop-buy ws-recipe" onclick="buyMachineSlot(\'' + mc.id + '\')"' + (roomData.coins < FARM_SLOT_COST ? ' disabled' : '') + '>✓ ' + T('Open slot · {cost}', { cost: FARM_SLOT_COST + '🪙' }) + '</button></div>';
        }
        body = grid + chooser + confirmBanner;
      }
      const butcherNote = mc.id === 'butcher'
        ? '<div class="ws-status" style="margin-top:8px">🔪 ' + T('Get meat by butchering an animal: 🐮 Animals tab → tap 🔪 on it.') + '</div>' : '';
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">' + mc.emoji + ' ' + T(mc.name) + '</div>' +
          '<div class="ws-sub">' + T('Makes: {list} · each slot makes one', { list: makesStr }) + '</div>' +
          haveLine + body + butcherNote +
          '<button class="cp-close" onclick="closeWorkshopModal()">' + T('Close') + '</button>' +
        '</div>';
      el.style.display = 'flex';
    }

    /* ── Scene ── */
    function _farmAnimState(a, idx, n) {
      if (!_farmAnimStates[a.id]) {
        const ix = (idx != null && n) ? (0.10 + ((idx + 0.5) / n) * 0.80) : (a.posX ?? 0.5);
        const band = _farmPenBand();                 // seed inside the pasture band
        const iy = band.top + (band.bot - band.top) * (0.3 + (idx != null ? (idx % 3) * 0.2 : Math.random() * 0.4));
        _farmAnimStates[a.id] = { x: ix, y: iy, tx: ix, ty: iy, nextWander: 0, facingRight: Math.random() < 0.5, moving: false };
      }
      return _farmAnimStates[a.id];
    }

    // Group the herd into one fenced pen per animal type. Every animal is given a
    // square `cell`, so a pen is only as wide as its own herd needs and the pens
    // are centred on the pasture with grass showing either side. Previously the
    // widths were renormalized back onto the full 0.05–0.95 span, so three geese
    // got a pen stretched across 90% of the canvas.
    function _buildAnimalPens(herd, penTop, penBot, W, H) {
      const order = ['goose', 'pig', 'cow', 'horse'];
      const counts = {};
      for (const a of herd) counts[a.type] = (counts[a.type] || 0) + 1;
      const types = order.filter(tp => counts[tp] > 0);
      const byType = {}, list = [];
      const padX = 0.012, padTop = 0.036, padBot = 0.012;
      if (!types.length) return { list, byType, cell: 0 };
      const PX0 = 0.05, PX1 = 0.95, GAP = 0.012;
      const span = (PX1 - PX0) - GAP * (types.length - 1);  // widest the pens may total
      // Cell side: as large as the band allows, shrinking only once the whole
      // herd can no longer fit the pasture area.
      const bandPx = Math.max(1, (penBot - penTop - padTop - padBot) * H);
      const spanPx = Math.max(1, (span - types.length * padX * 2) * W);
      const cell = Math.max(26, Math.min(
        bandPx * 0.9,                                       // one row must fit the band
        Math.min(W, H) * 0.115,                             // comfortable absolute cap
        Math.sqrt(bandPx * spanPx * 0.55 / herd.length)     // shrink for a big herd
      ));
      // Stack into a second/third row only when one row genuinely overflows the
      // span — a small herd looks better as one row of larger animals.
      let rows = 1, cellR = cell;
      const needPx = (r, c) => types.reduce((s, tp) => s + Math.ceil(counts[tp] / r) * c, 0);
      while (rows < 4 && needPx(rows, cellR) > spanPx) {
        rows++;
        cellR = Math.max(22, Math.min(cell, bandPx / rows));
      }
      const minPen = Math.max(64, cellR * 1.5);             // one animal still gets a tappable pen
      let w = types.map(tp =>
        Math.max(minPen, Math.ceil(counts[tp] / rows) * cellR + padX * 2 * W) / W);
      const wSum = w.reduce((s, v) => s + v, 0);
      if (wSum > span) w = w.map(v => v * span / wSum);     // compress only when it overflows
      const used = w.reduce((s, v) => s + v, 0) + GAP * (types.length - 1);
      let x = PX0 + Math.max(0, (PX1 - PX0 - used) / 2);    // centre when there is slack
      types.forEach((tp, i) => {
        const def = FARM_ANIMALS.find(f => f.id === tp) || { emoji: '🐾', name: tp };
        const pen = {
          type: tp, emoji: def.emoji, count: counts[tp],
          x0: x, x1: x + w[i], y0: penTop, y1: penBot,
          ix0: x + padX, ix1: x + w[i] - padX, iy0: penTop + padTop, iy1: penBot - padBot,
        };
        byType[tp] = pen; list.push(pen);
        x += w[i] + GAP;
      });
      return { list, byType, cell: cellR };
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
      // Badge size is keyed to the stage, not the pen, so every pen's badge
      // matches whatever the herd looks like. It sits in the pen's padTop strip,
      // which _buildAnimalPens already keeps clear of animal anchors.
      const fs = Math.max(10, Math.min(14, W * 0.026));
      const pad = 6, inset = 4;
      ctx.font = '800 ' + Math.round(fs) + 'px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const p of pens) {
        const penW = (p.x1 - p.x0) * W;
        // The species is already obvious from the animals inside, so the emoji
        // is the first thing to go if even that won't fit.
        let txt = p.emoji + ' ' + p.count;
        if (ctx.measureText(txt).width + pad * 2 + inset * 2 > penW) txt = String(p.count);
        const bw = ctx.measureText(txt).width + pad * 2, bh = fs + 6;
        const bx = p.x1 * W - inset - bw, by = p.y0 * H + inset;
        ctx.fillStyle = night ? 'rgba(20,14,6,0.82)' : 'rgba(40,26,12,0.78)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, bh / 2); else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(txt, bx + pad, by + bh / 2 + 0.5);
      }
    }

    function _drawFarmTrough(ctx, W, H, night) {
      const trLvl = roomData.farmTroughLevel || 0;
      const tx = FARM_TROUGH_X * W, ty = _farmTroughY(W, H) * H;
      // Grows with upgrades, but capped against H as well as W — keyed to width
      // alone it reached 470px on an ultrawide stage, taller than the pen band
      // and well up into the sky once it moved onto the grass strip.
      let tw = Math.max(44, Math.min(W * 0.105, H * 0.125)) * (1 + trLvl * 0.14);
      let th = tw * 0.34;
      // Then clamp to the grass actually available between the top fence and the
      // base, so a fully upgraded trough on a short stage shrinks instead of
      // standing through the fence.
      const roomAbove = ty - FARM_TOPFENCE_Y * H - 3;
      if (th > roomAbove) { th = Math.max(9, roomAbove); tw = th / 0.34; }
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
    // 📮 The mailbox on your own farm — a post-mounted box whose flag stands up
    // (with a count badge) whenever visitors have left something to claim. Same
    // wood/clay palette as the signboards and pen rails.
    function _drawFarmMailbox(ctx, W, H, t, night) {
      const p = _farmMailPos(W, H);
      const gx = p.x * W, gy = p.y * H;
      const s = _farmMailSize(W, H);                       // box width, and the unit for everything else
      const n = _farmInboxCount();
      const bob = n ? Math.sin(t / 260) * (s * 0.06) : 0;  // a gentle nudge while mail is waiting

      ctx.fillStyle = night ? 'rgba(0,0,0,.32)' : 'rgba(30,62,20,.24)';
      ctx.beginPath(); ctx.ellipse(gx, gy, s * 0.34, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = night ? '#4a3620' : '#714a26';       // post
      ctx.fillRect(gx - s * 0.07, gy - s * 0.80, s * 0.14, s * 0.80);

      const bh = s * 0.60, by = gy - s * 0.80 - bh + bob;  // box: arched roof, flat base
      const g = ctx.createLinearGradient(gx - s / 2, by, gx + s / 2, by + bh);
      g.addColorStop(0, night ? '#7a3f36' : '#c25b43');
      g.addColorStop(1, night ? '#5a2a24' : '#9b4636');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(gx - s / 2, by, s, bh, [s * 0.30, s * 0.30, s * 0.06, s * 0.06]);
      else ctx.rect(gx - s / 2, by, s, bh);
      ctx.fill();
      ctx.fillStyle = night ? 'rgba(0,0,0,.30)' : 'rgba(40,20,12,.28)';   // door
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(gx - s * 0.30, by + bh * 0.30, s * 0.60, bh * 0.52, s * 0.06);
      else ctx.rect(gx - s * 0.30, by + bh * 0.30, s * 0.60, bh * 0.52);
      ctx.fill();
      ctx.fillStyle = night ? '#d8c08a' : '#ffe9b8';                      // knob
      ctx.beginPath(); ctx.arc(gx, by + bh * 0.62, s * 0.05, 0, Math.PI * 2); ctx.fill();

      const fx = gx + s * 0.52;                                            // flag: up only when there's mail
      const flagY = n ? by - bh * 0.25 : by + bh * 0.45;
      ctx.strokeStyle = night ? '#c9b487' : '#f0e2c0';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath(); ctx.moveTo(fx, by + bh * 0.92); ctx.lineTo(fx, flagY); ctx.stroke();
      ctx.fillStyle = n ? '#eb5757' : (night ? '#5c5348' : '#9a927f');
      ctx.beginPath();
      ctx.moveTo(fx, flagY); ctx.lineTo(fx + s * 0.30, flagY + s * 0.10); ctx.lineTo(fx, flagY + s * 0.20);
      ctx.closePath(); ctx.fill();

      if (n) {                                                             // unread count, opposite the flag
        const r = Math.max(8, s * 0.22), bx = gx - s * 0.42, byy = by - r * 0.15;
        ctx.fillStyle = '#eb5757';
        ctx.beginPath(); ctx.arc(bx, byy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '800 ' + Math.round(r * 1.1) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.min(99, n)), bx, byy + 0.5);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      }
    }

    function _drawFarmSign(ctx, W, H, row, st) {
      const pos = _farmSignPos(row, W, H);
      const cx = pos.x * W, cy = pos.y * H;
      // Keep the signboard within its row slot so stacked rows never collide
      // when the soil band is compressed at high expansion levels.
      const _slot = _farmCropBand(H, W).rowGap * H;
      const w = _farmRowGeom(W, H).signW;
      const h = Math.min(w * 0.72, _slot * 0.86);
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
        ctx.fillText(T('tap to'), cx, cy - 1);
        ctx.fillText(T('plant'), cx, cy + 9);
        return;
      }
      const crop = FARM_CROPS.find(c => c.id === st.cropId);
      ctx.fillStyle = '#fff3d6';
      ctx.font = Math.round(h * 0.34) + 'px system-ui,sans-serif';
      ctx.fillText(crop ? crop.emoji : '🌱', cx, cy - h * 0.08);
      ctx.font = '800 9px system-ui,sans-serif';
      ctx.fillText(st.state === 'ripe' ? '✨ ' + T('Ready') : (crop ? T(crop.name) : ''), cx, cy + h * 0.24);
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
      // Tile height is capped to the row slot so beds never overlap the next row
      // (or the animals) when the soil band is compressed at high expansion levels.
      const tile = _farmTile(W, H);
      ctx.textAlign = 'center';
      // Row signboards (left of each row that owns ≥1 plot). A narrow stage has
      // none — _farmSignW returns 0 there and the width goes to the beds.
      if (_farmSignW(W, H) > 0) {
        const _rows = farmRowCount(plots.length, _farmPerRow(W));
        for (let _r = 0; _r < _rows; _r++) {
          const _st = farmRowState(farmRowIndices(plots.length, _r, _farmPerRow(W)).map(k => plots[k]), FARM_CROPS, now);
          _drawFarmSign(ctx, W, H, _r, _st);
        }
      }
      plots.forEach((plot, i) => {
        const pos = _farmPlotPos(i, W, H);
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

        // The skin in force this frame. Resolved per frame rather than per
        // draw call so buying or switching one repaints without a reload, and
        // so a skin the player no longer owns falls back on its own.
        const _theme = farmThemeOf(FARM_THEMES, roomData.farmTheme, roomData.ownedFarmThemes);
        const pal = farmThemePalette(_theme, night) || {};

        _drawHDSky(ctx, W, H, night, t, H * FARM_SKY_Y);   // arc the sun/moon inside the farm's shallower sky
        // A skin tints the farm's OWN sky band. The sky painter itself is shared
        // with the room's Outside View, so the wash goes on top of it here
        // rather than into it — the room stays exactly as it was.
        if (pal.sky) {
          const sw = ctx.createLinearGradient(0, 0, 0, H * FARM_SKY_Y);
          sw.addColorStop(0, pal.sky);
          sw.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sw;
          ctx.fillRect(0, 0, W, H * FARM_SKY_Y);
        }
        _drawRollingHills(ctx, W, H, night, pal);

        // The dividing fence between the animal pasture (above) and the crop
        // garden (below). It moves DOWN as the farm is expanded, so each
        // "Expand farm" visibly enlarges the pasture.
        const divY = _farmDivY();
        const gy = H * divY;

        // Animal pasture — grass from the horizon down to the dividing fence
        const skyY = H * FARM_SKY_Y;
        const grass = ctx.createLinearGradient(0, skyY, 0, gy);
        grass.addColorStop(0, pal.grass[0]);                      // soft sunny top
        grass.addColorStop(0.5, pal.grass[1]);
        grass.addColorStop(1, pal.grass[2]);                      // richer deep bottom
        ctx.fillStyle = grass;
        ctx.fillRect(0, skyY, W, gy - skyY);

        // 3D mown field — alternating stripes converging to the horizon point
        ctx.save();
        ctx.beginPath(); ctx.rect(0, skyY, W, gy - skyY); ctx.clip();
        const vpx = W / 2, vpy = skyY - H * 0.02;
        const gSeg = 12, gSpread = W * 1.7, gx0 = W / 2 - gSpread / 2;
        for (let i = 0; i < gSeg; i++) {
          const xA = gx0 + (i / gSeg) * gSpread, xB = gx0 + ((i + 1) / gSeg) * gSpread;
          ctx.fillStyle = (i % 2) ? pal.mowLight : pal.mowDark;
          ctx.beginPath(); ctx.moveTo(xA, gy); ctx.lineTo(xB, gy); ctx.lineTo(vpx, vpy); ctx.closePath(); ctx.fill();
        }
        // horizontal depth bands (tighter toward the horizon)
        ctx.strokeStyle = pal.band; ctx.lineWidth = 1;
        for (let k = 1; k <= 5; k++) { const f = k / 6; const yy = gy - (gy - skyY) * (f * f); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
        ctx.restore();

        // Crop garden — a tilled soil band below the dividing fence
        const soil = ctx.createLinearGradient(0, gy, 0, H);
        soil.addColorStop(0, pal.soil[0]);                        // warmer tilled earth
        soil.addColorStop(1, pal.soil[1]);
        ctx.fillStyle = soil;
        ctx.fillRect(0, gy, W, H - gy);
        // 3D tilled rows — alternating stripes converging to the dividing fence
        ctx.save();
        ctx.beginPath(); ctx.rect(0, gy, W, H - gy); ctx.clip();
        const sSeg = 16, sSpread = W * 1.5, sx0 = W / 2 - sSpread / 2;
        for (let i = 0; i < sSeg; i++) {
          const xA = sx0 + (i / sSeg) * sSpread, xB = sx0 + ((i + 1) / sSeg) * sSpread;
          ctx.fillStyle = (i % 2) ? pal.tillLight : pal.tillDark;
          ctx.beginPath(); ctx.moveTo(xA, H); ctx.lineTo(xB, H); ctx.lineTo(W / 2, gy); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = pal.furrow; ctx.lineWidth = 1;
        for (let fy = gy + (H - gy) * 0.42; fy < H - 2; fy += (H - gy) * 0.30) { ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke(); }
        ctx.restore();

        // Fences: top of the pasture and the divider (farm | crops). No bottom
        // fence — its posts are a fixed 22px tall, so on a short stage they cut
        // through the last bed row, and the soil band reads fine without it.
        const topFenceY = H * FARM_TOPFENCE_Y;
        _drawFence(ctx, W * 0.02, topFenceY, W * 0.96, night);
        _drawFence(ctx, W * 0.02, gy, W * 0.96, night);
        _drawHDTree(ctx, W * 0.06, topFenceY, H * 0.18, windSway, night, pal);
        _drawHDTree(ctx, W * 0.94, topFenceY, H * 0.15, windSway * 0.7, night, pal);

        _drawFarmTrough(ctx, W, H, night);
        if (viewingUid === currentUid) _drawFarmMailbox(ctx, W, H, t, night);   // your mail only
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
        const _band = _farmPenBand();
        const penTop = _band.top, penBot = _band.bot;
        _drawWorkshopMachines(ctx, W, H, t, night);   // huts behind the herd
        const _blocked = _farmBlockedZones();           // workshop + cart: animals keep out
        const _herd = roomData.farmAnimals || [];
        // Group the herd into one fenced pen per type, then keep each animal in its pen.
        const _pens = _buildAnimalPens(_herd, penTop, penBot, W, H);
        _drawAnimalPens(ctx, W, H, _pens.list, night);
        // One animal per cell, drawn a little smaller so it has room inside it.
        const _aSize = Math.max(22, (_pens.cell || 0) * 0.72);
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
          const lvTxt = T('Lv {n}', { n: animalLevel(a.collected, FARM_LEVELS) });
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
        // Weather LAST, so snow and petals fall in front of the animals rather
        // than behind them — that one ordering is most of why it reads as
        // weather at all.
        _drawFarmWeather(ctx, W, H, t, pal.weather);

        _farmAnimFrame = requestAnimationFrame(frame);
      }
      _farmAnimFrame = requestAnimationFrame(frame);
      _attachFarmPointerHandlers(cvs);
    }

    /* A skin's particle layer: snow, petals or drifting motes.

       Every particle's position is a pure function of its index and the clock,
       so there is no array to allocate, nothing to seed, and nothing to keep in
       sync when the canvas is resized or the farm is reopened. The scatter comes
       from the usual sin·large-constant hash — good enough to look random, and
       identical on every frame so a particle never teleports. */
    function _drawFarmWeather(ctx, W, H, t, wx) {
      if (!wx || !wx.count) return;
      const hash = (n) => { const v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
      const fall = H + 24;
      ctx.save();
      for (let i = 0; i < wx.count; i++) {
        const rx = hash(i * 12.9898), rz = hash(i * 78.233 + 1.7);
        const depth = 0.55 + rz * 0.45;                       // nearer ones fall faster and bigger
        const y = ((rz * fall) + (t / 1000) * wx.speed * depth) % fall - 12;
        const drift = Math.sin(t / 1300 + i * 0.7) * wx.sway * depth;
        const x = ((rx * W + drift) % W + W) % W;
        const r = wx.size * depth;
        ctx.globalAlpha = wx.alpha * (0.6 + rz * 0.4);
        // A second tone, sprinkled through, is what stops a petal fall reading
        // as one flat pink wash — roughly a third of them take it.
        ctx.fillStyle = 'rgba(' + ((wx.color2 && rx > 0.66) ? wx.color2 : wx.color) + ',1)';
        if (wx.kind === 'petal') {
          // a petal turns as it falls, so it flashes between edge-on and flat
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t / 700 + i);
          ctx.beginPath();
          ctx.ellipse(0, 0, r, r * (0.35 + 0.45 * Math.abs(Math.sin(t / 900 + i))), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
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
          const _twh = _farmWH();
          if (Math.hypot(p.x - FARM_TROUGH_X, p.y - _farmTroughY(_twh.W, _twh.H)) < 0.08) {
            tip = '🌾 ' + T('Food') + '  ' + Math.floor(roomData.farmFood || 0) + ' / ' + farmFoodMax();
            // Ask the same resolver the tap uses, so the cursor never promises a
            // mailbox that a click would hand to a hut (or the plane).
          } else if (_farmSkyTarget(p.x, p.y, _twh.W, _twh.H) === '#mail') {
            const _mn = _farmInboxCount();
            tip = '📮 ' + (_mn ? T('Mailbox — {n} unclaimed', { n: _mn }) : T('Mailbox — empty'));
          } else {
            const plots = roomData.farmPlots || [];
            const _wh = _farmWH();
            for (let i = 0; i < plots.length; i++) {
              const pp = _farmPlotPos(i, _wh.W, _wh.H);
              if (Math.hypot(pp.x - p.x, pp.y - p.y) < 0.045) {
                const plot = plots[i];
                if (!plot.crop) { tip = '🌱 ' + T('Empty — tap to plant'); }
                else {
                  const crop = FARM_CROPS.find(c => c.id === plot.crop);
                  if (crop) {
                    const left = crop.growMs - (Date.now() - plot.plantedAt);
                    tip = crop.emoji + ' ' + (left <= 0 ? T('Ready to harvest!') : T('{time} left', { time: _fmtFarmTime(left) }));
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

        // Everything fixed in the upper half of the farm — huts, mailbox, plane.
        const _hit = _farmSkyTarget(cx, cy, rect.width, rect.height);
        if (_hit === '#cart') { openCartSheet(); return; }
        if (_hit === '#mail') { openFarmInbox(); return; }
        if (_hit) { openMachineModal(_hit); return; }
        closeCartSheet();   // tapping elsewhere on the farm dismisses the sheet

        // Garden strip: any tap picks the nearest plot OR signboard, then acts on
        // that whole row (plant / harvest / status). No precision needed on phones.
        // Anything below the dividing fence is garden — derived, not a literal,
        // so raising the fence can't leave the top bed row unreachable.
        const plots = roomData.farmPlots || [];
        if (plots.length && cy > _farmDivY()) {
          const _wh = { W: rect.width, H: rect.height };
          let rowIdx = 0, plotIdx = null, best = Infinity;
          for (let i = 0; i < plots.length; i++) {
            const pp = _farmPlotPos(i, _wh.W, _wh.H);
            const d = Math.hypot(pp.x - cx, pp.y - cy);
            if (d < best) { best = d; rowIdx = Math.floor(i / _farmPerRow(_wh.W)); plotIdx = i; }
          }
          // Signboards are targets only where they're drawn. On a narrow stage
          // there are none, and every tap resolves to a bed — which is the point:
          // no invisible target can steal a tap meant for a bed.
          if (_farmSignW(_wh.W, _wh.H) > 0) {
            const _rows = farmRowCount(plots.length, _farmPerRow(_wh.W));
            for (let r = 0; r < _rows; r++) {
              const sp = _farmSignPos(r, _wh.W, _wh.H);
              const d = Math.hypot(sp.x - cx, sp.y - cy);
              if (d < best) { best = d; rowIdx = r; plotIdx = null; }   // signboard means the row, not one bed
            }
          }
          _farmRowClick(rowIdx, plotIdx);
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

    /* ── Repaint everything when the language changes ──
       The switch can be thrown on another page (index.html's settings) or
       another device, so this listens rather than being called by the toggle.
       Canvas needs no help: it redraws every frame and picks up T() on its own.
       Each render is guarded — whichever views are closed simply do nothing. */
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('langchange', function () {
      try { if (typeof renderAll === 'function') renderAll(); } catch (e) {}
      try { if (isFarmView) { renderFarmPanel(); renderWorkshopModal(); renderAnimalModal(); renderProduceModal(); } } catch (e) {}
      try { if (_farmInboxOpen) renderFarmInbox(); } catch (e) {}
      try { if (_giftOpen) renderGiftPicker(); } catch (e) {}
      try { if (_cartSheetOpen) renderCartSheet(); } catch (e) {}
      try { if (typeof renderAquariumPanel === 'function' && typeof isAquariumView !== 'undefined' && isAquariumView) renderAquariumPanel(); } catch (e) {}
      // The room's own tabs and overlays render through T() too. A tab panel is
      // open while it carries .active; an overlay while it has NOT got .hidden.
      const _tabOpen = function (id) { const el = document.getElementById(id); return !!el && el.classList.contains('active'); };
      const _ovOpen = function (id) { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
      try { if (typeof renderShop === 'function' && _tabOpen('panel-shop')) renderShop(); } catch (e) {}
      try { if (typeof renderJukebox === 'function' && _tabOpen('panel-extras')) renderJukebox(); } catch (e) {}
      try { if (typeof renderGachaTab === 'function' && _tabOpen('panel-extras')) renderGachaTab(); } catch (e) {}
      try { if (typeof showGachaPrizeModal === 'function' && _ovOpen('gachaPrizeOverlay')) showGachaPrizeModal(); } catch (e) {}
      try { if (typeof updatePetStatusBar === 'function' && typeof _selectedPetId !== 'undefined' && _selectedPetId) updatePetStatusBar(); } catch (e) {}
      try { if (typeof showAchievements === 'function' && _ovOpen('achieveOverlay')) showAchievements(); } catch (e) {}
      try { if (typeof showDailyReward === 'function' && _ovOpen('dailyOverlay')) showDailyReward(); } catch (e) {}
      try { if (typeof renderLeaderboardTabs === 'function' && _ovOpen('lbOverlay')) renderLeaderboardTabs(); } catch (e) {}
      try { if (typeof renderCoinHistory === 'function' && _ovOpen('coinHistOverlay')) renderCoinHistory(); } catch (e) {}
    });
