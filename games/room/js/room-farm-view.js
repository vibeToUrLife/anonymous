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
    let _binModalIdx = null;          // …or which locked compost bin's, sharing the same box
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
    /* EVERY stage parks it in this corner. A narrow one used to move it in to
       0.70 as well as growing it, because at 0.84 a 47px sprite went camouflaged
       against the tree at 0.94 — but 0.70 is where the forge stands (0.674), so
       what the move actually bought was a plane parked on a workshop roof with
       23px of air under it, and an away-cloud marking that same spot. There is no
       third option: the plane's body is 77px on a 360 stage and the clear sky
       between the forge's right edge and the tree's crown is 53px, so it sits
       over one or the other. The corner is the one to sit over — it is scenery,
       the forge is a target, and the plane is drawn after the trees so the canopy
       never hides it, only sits behind it.
       What DOES survive from that change is the size: a narrow stage still grows
       the plane (see _farmCartSize), and 58-64px against the leaves is the part
       that was actually doing the finding, not the 0.14 of stage it moved. */
    /* It shares this corner with the floating "🧺 Collect" button — 10px from the
       top and at least 44px tall on touch, and on a narrow stage it sits right
       above the plane. That button is a DOM element over the canvas, so anything
       that drifts under it loses its taps outright. However high we ask the
       plane to fly, keep its wingtip below the button's floor. */
    const FARM_CART_CLEAR_PX = 60;
    function _farmCartPos(W, H) {
      const ceil = (FARM_CART_CLEAR_PX + _farmCartSize(W, H) * 0.45) / Math.max(1, H || 1);
      return {
        x: FARM_CART_X,
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

    /* ── The land is wider than the window ────────────────────────────────
       Nothing that was already on the farm moves. Every pen, bed, hut, tree
       and the trough keep the exact normalised position they have always had,
       so with the camera at 0 the view is what it was before this existed —
       and on a farm that has never been expanded there is nowhere to scroll
       to at all. What grows is the GROUND: the world runs 0..worldW in the
       same units the farm has always used, and swiping only ever reveals land
       that was not there to see.

       Drawing does this with one transform per layer rather than a coordinate
       change inside each of the 27 painters. Two layers only:

         world  the ground and everything standing on it — it slides. That is
                EVERYTHING the farm owns, mailbox and merchant plane included:
                they belong to the farm at their own spot on it, so panning to a
                plot leaves them behind exactly as it leaves the pens behind.
         fixed  sky, hills, clouds, weather — the view, not the ground

       The sky does NOT drift with the ground. Parallax would have to paint
       wider than the window to avoid a gap opening on the right, and the sky
       painter lays its sun out against the width it is handed — so a wider
       sky would move the sun. A still sky costs nothing and reads fine. */
    const FARM_PAN_DEADZONE = 10;    // px of finger travel before a tap becomes a pan
    let _farmCamX = 0;               // left edge of the view, in window widths

    /* The farm itself is ALWAYS 0..1, and stays there. Land bought either side is
       added outside that: the world runs -landL .. 1+landR, so the origin never
       moves and every pen, bed, hut, tree and the trough keeps the exact
       normalised position it has always had. Camera 0 is the farm, which is where
       it opens. (This used to be derived from farmCapLevel, so buying a bigger
       pasture silently grew the ground to the right; the two are separate
       purchases now — see FARM_LAND_COSTS.) */
    function _farmLandL() { return roomData.farmLandL ? FARM_LAND_STEP : 0; }
    function _farmLandR() { return roomData.farmLandR ? FARM_LAND_STEP : 0; }
    function _farmWorldW() { return _farmLandL() + 1 + _farmLandR(); }   // total width, in windows
    function _farmCamMin() { return -_farmLandL(); }
    function _farmCamMax() { return _farmLandR(); }
    function _farmClampCam() { _farmCamX = Math.max(_farmCamMin(), Math.min(_farmCamMax(), _farmCamX)); }
    // Is there anywhere to pan to at all? Both plots unbought → no.
    function _farmCanPan() { return _farmCamMax() > _farmCamMin(); }

    /* Nothing on screen used to say the land continued past the right edge, so a
       farm expanded four times looked exactly like one that never had been — the
       only ways across were a drag or a trackpad swipe, and neither announces
       itself. These two arrows are that affordance. They are DOM rather than
       canvas for the same reason "🧺 Collect" is: a button over the canvas
       swallows its own taps, so it can never fight the hit-test underneath. */
    // One tap crosses exactly one plot, so the camera always comes to rest either
    // on the farm or squarely on a plot — never straddling the two.
    const FARM_PAN_STEP = FARM_LAND_STEP;
    let _farmCamTo = null;       // glide target; null whenever the camera is at rest
    let _farmPanBtns = '';       // arrows currently shown — so we touch the DOM only on change

    function farmPan(dir) {
      const from = _farmCamTo == null ? _farmCamX : _farmCamTo;   // tapping twice queues two steps
      _farmCamTo = Math.max(_farmCamMin(), Math.min(_farmCamMax(), from + dir * FARM_PAN_STEP));
    }

    // Ease toward the glide target. A drag or a wheel clears _farmCamTo, so a
    // finger on the land always wins over a button that is still gliding.
    function _farmStepCam() {
      if (_farmCamTo == null) return;
      const d = _farmCamTo - _farmCamX;
      if (Math.abs(d) < 0.004) { _farmCamX = _farmCamTo; _farmCamTo = null; }
      else _farmCamX += d * 0.18;
    }

    // An arrow shows only where there is land left to reach on that side.
    function _syncFarmPanBtns() {
      const lo = _farmCamMin(), hi = _farmCamMax();
      const key = hi <= lo ? ''
        : (_farmCamX > lo + 0.01 ? 'L' : '') + (_farmCamX < hi - 0.01 ? 'R' : '');
      if (key === _farmPanBtns) return;
      _farmPanBtns = key;
      const l = document.getElementById('farmPanL'), r = document.getElementById('farmPanR');
      if (l) l.style.display = key.indexOf('L') >= 0 ? 'flex' : 'none';
      if (r) r.style.display = key.indexOf('R') >= 0 ? 'flex' : 'none';
    }
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
      if (viewingUid !== currentUid) return 0;
      // Settled before the early return below, so a farm that was empty for a
      // week doesn't come back to a stale clock and a free instant binful.
      _settleCompost(Date.now());
      if (!(roomData.farmAnimals || []).length) return 0;
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

    /* Compost accrues off the herd — the trough's own pattern, settled against
       farmCompostAt the way food is settled against farmFoodAt. The rate does
       not change with how many bins are open; only the cap does, so the bin
       unlocks buy how long you can leave it rather than how fast it fills.
       Bins stop at the cap, which makes the cap the offline cap too. */
    function _settleCompost(now) {
      if (!roomData.farmLandL) return;
      if (!roomData.farmCompostAt) { roomData.farmCompostAt = now; return; }
      const hours = Math.max(0, now - roomData.farmCompostAt) / 3600000;
      roomData.farmCompostAt = now;
      const herd = (roomData.farmAnimals || []).length;
      if (!hours || !herd) return;
      roomData.farmCompost = Math.min(_compostCap(),
        (roomData.farmCompost || 0) + herd * FARM_COMPOST_PER_ANIMAL_HR * hours);
    }

    /* Tap a bin: clear the whole yard, or open the unlock modal if that bin is
       locked.

       It used to take one bin's worth off the pile, which looked broken: the
       yard is ONE pool that the bins display in order (bin 0 shows the first 10,
       bin 1 the next 10…), so taking 10 from a yard holding 25 left bin 0 still
       reading completely full — 15 is more than its 10 — and emptied part of
       bin 1 instead. You tapped a bin, collected, and the bin you tapped did not
       move while a different one did.

       One pool, one tap, everything: every bin visibly empties together, which
       is the only outcome that matches what the bins are actually showing. */
    async function tapCompostBin(i) {
      if (viewingUid !== currentUid) return;
      if (i >= _compostBins()) { openBinUnlock(i); return; }
      _settleCompost(Date.now());
      const got = Math.floor(roomData.farmCompost || 0);   // settled just above — never the drifting display figure
      if (got < 1) return showToast('🪵 ' + T('The yard is still filling up.'), '');
      roomData.farmCompost = Math.max(0, (roomData.farmCompost || 0) - got);
      roomData.farmFertilizer = (roomData.farmFertilizer || 0) + got;
      await saveRoom();
      showToast('🌱 ' + T('Collected {n} fertilizer!', { n: got }), 'success');
      renderFarmPanel();
    }

    async function unlockCompostBin(i) {
      if (viewingUid !== currentUid) return;
      const have = _compostBins();
      if (!have || i !== have) return;                     // bins open in order
      const cost = FARM_COMPOST_BIN_COSTS[i];
      if (cost == null) return;
      if (roomData.coins < cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= cost;
      logCoin(-cost, T('Compost bin'));
      roomData.farmCompostBins = have + 1;
      closeWorkshopModal();
      await saveRoom();
      showToast('🪵 ' + T('Bin {n} opened — the yard holds {cap} fertilizer now.', { n: have + 1, cap: _compostCap() }), 'success');
      renderFarmPanel();
      renderAll();
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

    /* ── Live meter figures ──
       The trough and the compost yard are both SETTLED models: the number in
       roomData only moves when its settle runs — the 60s farm tick for food,
       _settleCompost for compost. Every readout therefore showed a figure up to
       a minute old, and at ordinary herd sizes a minute of eating is a FRACTION
       of a unit, so the integer sat on the same digit for five or ten minutes
       and the farm looked like nothing was being consumed at all.

       These add the time since the last settle back on, for DISPLAY only. They
       never write, so they cannot double-count against the settle that does. */

    // Units the herd eats per hour — the trough's drain rate.
    function _foodPerHr() {
      return (roomData.farmAnimals || []).length * FARM_FOOD_PER_DAY / 24;
    }
    function _foodNow() {
      const base = roomData.farmFood || 0, rate = _foodPerHr();
      if (!roomData.farmFoodAt || !rate) return base;
      // Capped the way planFarmTick caps its own window, so a farm reopened
      // after a week reads what the tick is about to charge, not a week of
      // eating it will never bill.
      const ms = Math.min(Math.max(0, Date.now() - roomData.farmFoodAt), farmOfflineCapMs());
      return Math.max(0, base - rate * ms / 3600000);
    }
    /* The trough's figure as a player should read it — rounded UP, unlike every
       other count on the farm.

       Flooring it made a trough the player had just filled to the brim read
       279/280 on the very next frame, because the herd had eaten a ten-thousandth
       of a unit and 279.9999 floors to 279. Rounding up is also the only rule
       that keeps the badge honest with its own animation: the number holds while
       the sliver crosses one unit, and steps down at the exact instant the
       sliver wraps and the −1 pops. Floor stepped down at the top of each unit
       and then sat still through the whole of it. */
    function _foodShown(v) { return Math.ceil(Math.max(0, v)); }
    // Hours of feeding left in the trough at the current herd size.
    function _foodEmptyInMs() {
      const rate = _foodPerHr();
      return rate > 0 ? (_foodNow() / rate) * 3600000 : Infinity;
    }
    // Fertilizer the yard gains per hour. Zero once it is at its cap — a full
    // yard has stopped earning, and saying "+1.6/hr" over one that isn't moving
    // is the same lie the stale count was.
    function _compostPerHr() {
      if (!roomData.farmLandL) return 0;
      if (_compostNow() >= _compostCap()) return 0;
      return (roomData.farmAnimals || []).length * FARM_COMPOST_PER_ANIMAL_HR;
    }
    // A rate for reading, not for arithmetic: one decimal while it is small
    // enough for the decimal to matter, whole numbers once it isn't.
    function _fmtRate(perHr) {
      return perHr >= 10 ? String(Math.round(perHr)) : String(Math.round(perHr * 10) / 10);
    }

    /* How far a meter has moved TOWARD its next whole unit, 0..1. `rising` for a
       meter filling up (compost), false for one draining (food) — both count
       0→1 and then pop, so one readout serves both.

       This is the fastest-moving honest figure either meter has. The level
       track spans a whole bin (ten units) or a whole trough, so at a herd of 20
       it crawls about EIGHT PIXELS AN HOUR — mathematically invisible, which is
       why the yard looked stopped. One unit is ten times narrower: the trough
       crosses it every 4 minutes at that herd, which is plainly watchable; the
       compost yard takes 37, which is merely better. Compost's real "it is
       working" cue is the steam on the filling bin, not a bar — a quantity that
       changes twice an hour cannot be made to look like motion without lying
       about it. What this is NOT is decoration: it is the next unit's progress,
       so when it reaches the end the number really does change. */
    function _unitFrac(value, rising) {
      const f = rising ? value - Math.floor(value) : Math.ceil(value) - value;
      return Math.max(0, Math.min(1, f));
    }

    /* How long ago (ms) a meter last crossed a whole unit — the moment worth
       showing, because a count that ticks once every few minutes never reads as
       movement while you are watching it.

       DERIVED from the figure rather than remembered: there is no queue of
       pending pops to keep in step with the numbers, nothing to replay when the
       tab wakes up after an hour asleep, and the first frame after a reload is
       already correct. Returns -1 when nothing is flowing. */
    function _unitCrossedAgo(value, perHr, rising) {
      if (!(perHr > 0)) return -1;
      return _unitFrac(value, rising) * 3600000 / perHr;
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
            '<span class="farm-gift-emoji">' + _prodIcon(id, 30, m) + '</span>' +
            '<span class="farm-gift-name">' + escapeHtml(T(m.name)) + '</span>' +
            '<span class="farm-gift-have">' + (spent ? T('Sent today') : '×' + stock[id]) + '</span>' +
          '</button>';
        }).join('') + '</div>' +
        (_giftProd && !done(_giftProd)
          ? '<div class="farm-gift-qty">' +
              '<button onclick="setGiftQty(-1)"' + (_giftQty <= 1 ? ' disabled' : '') + '>−</button>' +
              '<span>' + _prodIcon(_giftProd, 18, meta[_giftProd]) + ' ×' + _giftQty + '</span>' +
              '<button onclick="setGiftQty(1)"' + (_giftQty >= max ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<button class="cp-crop farm-gift-send" onclick="sendFarmGift()">🎁 ' + T('Send {item}', { item: _prodIcon(_giftProd, 18, meta[_giftProd]) + ' ×' + _giftQty }) + '</button>'
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
          what = '🎁 ' + T('sent {item}', { item: _prodIcon(it.prod, 16, m) + ' ×' + (it.qty || 0) });
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
      _fertArmed = false; _fertDrag = null;   // never open with the sack already up
      _fertLastTap = 0; _fertAllPending = false;   // nor mid-double-tap, nor with a stale sheet live
            _farmCamX = 0; _farmCamTo = null;   // always open on the near end of the land, at rest
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
        return '<div class="ws-slot"><span class="ws-slot-no">' + _prodIcon(pid, 20, m) + ' ' + T(m.name) + '</span>' +
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

      // Food trough: stock bar + drain rate + refill button (fills the trough,
      // coins permitting). The figure is the LIVE one so the panel and the badge
      // on the farm never disagree about how much is left.
      const foodMax = farmFoodMax();
      const foodRaw = _foodNow(), food = _foodShown(foodRaw);
      const foodPct = Math.round((food / foodMax) * 100);
      const refillUnits = Math.min(Math.max(0, Math.ceil(foodMax - foodRaw)), Math.floor(roomData.coins / FARM_FOOD_COST));
      const foodColor = foodPct > 40 ? '#6dd56d' : foodPct > 15 ? '#f2c94c' : '#eb5757';
      /* What is actually being deducted, in words. A herd of ten eats one unit
         about every eight minutes, so the count alone can sit on the same digit
         for most of a session and read as "nothing is happening" — the rate and
         the run-out time are the part a player can act on. */
      const foodRate = _foodPerHr();
      const foodNote = !foodRate
        ? T('Nobody eating yet — buy an animal.')
        : food <= 0
          ? '⚠️ ' + T('Empty — the herd is going hungry.')
          : T('−{n}/hr · empty in {time}', { n: _fmtRate(foodRate), time: _fmtFarmTime(_foodEmptyInMs()) });
      const foodHtml =
        '<div class="farm-section-title">🌾 ' + T('Food Trough') + '</div>' +
        '<div class="farm-food-row">' +
          '<span class="farm-herd-info">' +
            '<span class="farm-herd-name">' + food + ' / ' + foodMax + '</span>' +
            '<span class="farm-herd-bar"><span style="width:' + foodPct + '%;background:' + foodColor + '"></span></span>' +
            '<span class="farm-food-rate' + (foodRate && food <= 0 ? ' hungry' : '') + '">' + foodNote + '</span>' +
          '</span>' +
          '<button class="farm-shop-buy" onclick="refillFarmFood()"' + (refillUnits <= 0 ? ' disabled' : '') + '>+' + refillUnits + ' · ' + (refillUnits * FARM_FOOD_COST) + '🪙</button>' +
        '</div>';

      // Produce inventory (read-only) + merchant-cart status. Selling happens only
      // at the cart when it visits — see _farmCart() and the cart sell sheet.
      const prices = farmProductPrices(), meta = farmProductMeta();
      const stock = roomData.farmStock || {};
      const agedStock = roomData.farmAged || {};
      /* Produce is grouped by the building it comes out of, in the FIXED order
         farmProductGroups() gives — so the list never re-sequences when a newly
         collected product lands in stock, and a good always sits under the thing
         that made it. Groups you hold nothing from are dropped. */
      const stockGroups = farmProductGroups()
        .map(g => ({ g: g, ids: g.ids.filter(id => ((g.aged ? agedStock : stock)[id] || 0) > 0) }))
        .filter(r => r.ids.length);
      const stockKinds = stockGroups.reduce((n, r) => n + r.ids.length, 0);
      const cart = _farmCart();
      const wantMeta = cart.wanted.map(w => _prodIcon(w.id, 16, meta[w.id]) + '×' + w.qty).join('  ');
      const cartHtml =
        '<div class="farm-section-title">🛒 ' + T('Merchant Cart') + '</div>' +
        (cart.present
          ? '<div class="farm-cart-status here">🛒 ' + T('The cart is here — tap it on the farm, or:') + '</div>' +
            '<div class="farm-panel-empty" style="padding-top:4px">' + T('Buying this visit: {list}', { list: wantMeta || '—' }) + '</div>' +
            '<button class="farm-shop-buy" style="width:100%;margin-top:6px" onclick="openCartSheet()">' + T('Open cart →') + '</button>'
          : '<div class="farm-cart-status">🛒 ' + T('Sold out & rolled on — back in {time}.', { time: '<b>' + _fmtFarmTime(cart.nextInMs) + '</b>' }) + '</div>' +
            '<div class="farm-panel-empty" style="padding-top:4px">' + T('It buys a different set each visit — stock up!') + '</div>');
      // Produce list is collapsible (it grows as you collect more types).
      const _produceCollapsed = _farmProduceCollapsed == null ? stockKinds > FARM_PRODUCE_COLLAPSE_AT : _farmProduceCollapsed;
      const stockHtml =
        cartHtml +
        '<div class="farm-section-title farm-collapse-head" style="margin-top:12px" onclick="toggleFarmProduce()">' +
          '<span>📦 ' + T('Produce') + ' <small>(' + stockKinds + ')</small></span>' +
          '<span class="farm-collapse-arrow">' + (_produceCollapsed ? '▸' : '▾') + '</span>' +
        '</div>' +
        (_produceCollapsed
          ? ''
          : !stockKinds
          ? '<div class="farm-panel-empty">' + T('Tap produce on the farm to collect it here.') + '</div>'
          : stockGroups.map(r =>
              '<div class="farm-produce-group">' + r.g.emoji + ' ' + T(r.g.name) + '</div>' +
              r.ids.map(id => {
                const m = meta[id] || { emoji: '❓', name: id };
                const n = (r.g.aged ? agedStock : stock)[id];
                // Only tier-1 goods reach the cart; the aged ones show the price
                // the tier-2 buyer pays, because nothing else can buy them.
                const wanted = !r.g.aged && cart.present && cart.wanted.some(w => w.id === id);
                const price = r.g.aged
                  ? ((FARM_AGED[id] || {}).coins || 0) + '🪙 ' + T('buyer')
                  : (prices[id] || 0) + '🪙 ' + T('ea');
                return '<div class="farm-shop-row">' +
                  '<span class="farm-shop-animal">' + _prodIcon(id, 20, m) + ' ' + T(m.name) + ' <small>×' + n + '</small>' + (wanted ? ' <span class="farm-want-tag">' + T('cart wants') + '</span>' : '') + '</span>' +
                  '<span class="farm-shop-drop">' + price + '</span>' +
                  '</div>';
              }).join('')
            ).join(''));

      // Daily delivery orders
      const ordersList = _farmOrders();
      const ordersDone = roomData.farmOrdersDone || [];
      const ordersHtml =
        '<div class="farm-section-title">📋 ' + T('Orders') + ' <span class="farm-panel-cap">' + T('resets daily') + '</span></div>' +
        ordersList.map((o, i) => {
          const isDone = ordersDone.includes(i);
          const canDo = !isDone && o.items.every(it => (stock[it.id] || 0) >= it.qty);
          const itemsStr = o.items.map(it => { const mm = meta[it.id] || { emoji: '❓' }; return _prodIcon(it.id, 18, mm) + '×' + it.qty; }).join('  ');
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
            '<span class="farm-shop-animal">' + _animIcon(def.id, 20, def) + ' ' + T(def.name) + ' <small>×' + (counts[def.id] || 0) + '</small></span>' +
            '<span class="farm-shop-drop">' + _prodIcon(def.drop.id, 16, def.drop) + ' ' + def.drop.coins + '🪙</span>' +
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
                ? '<span class="farm-butcher-confirm"><button class="farm-mini-btn danger" onclick="butcherAnimal(\'' + a.id + '\')">✓ ' + _prodIcon('meat', 14) + '×' + meat + '</button><button class="farm-mini-btn" onclick="cancelButcher()">✗</button></span>'
                : '<span class="farm-herd-meat" title="' + T('Butcher → this much meat') + '">' + _prodIcon('meat', 14) + '×' + meat + '</span>' +
                  '<button class="farm-mini-btn" title="' + T('Butcher for meat') + '" onclick="askButcher(\'' + a.id + '\')">🔪</button>';
              return '<div class="farm-herd-row">' +
                '<span class="farm-herd-emoji">' + _animIcon(def.id, 22, def) + '</span>' +
                '<span class="farm-herd-info">' +
                  '<span class="farm-herd-name">' + T(def.name) + mark + ' <small>' + T('Lv {n}', { n: lvl }) + '</small> · ' + h + '%</span>' +
                  '<span class="farm-herd-bar"><span style="width:' + h + '%;background:' + color + '"></span></span>' +
                '</span>' +
                (waiting ? '<span class="farm-herd-drops">' + _prodIcon(def.drop.id, 14, def.drop) + ' ×' + waiting + '</span>' : '') +
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

      /* The "🏭 Build Machines" card used to live here. Machines are now bought
         by tapping them on the farm — every one of them stands on the pasture
         from the start, locked ones faded with a padlock. A list in the panel
         hid the farm's future and made a bought machine appear out of nowhere
         on grass that had looked empty. */

      const expLvl = roomData.farmCapLevel || 0;
      const expandCost = expLvl < FARM_EXPAND_COSTS.length ? FARM_EXPAND_COSTS[expLvl] : null;
      const trLvl = roomData.farmTroughLevel || 0;
      const trCost = trLvl < FARM_TROUGH_COSTS.length ? FARM_TROUGH_COSTS[trLvl] : null;
      const coldLvl = roomData.farmColdLevel || 0;
      const coldCost = coldLvl < FARM_COLD_COSTS.length ? FARM_COLD_COSTS[coldLvl] : null;
      const coldLocked = !roomData.farmAutoCollect;

      /* Two groups instead of one flat list of seven: what the farm HAS (pasture,
         land, trough) and what it does BY ITSELF (collector, feeder, cold store).
         They used to be interleaved — the auto-collector sat between the trough
         and the auto-feeder — so working out what to save up for meant reading
         the whole tab. Each group is its own card, the way the Animals and Garden
         tabs are already built. */
      const scaleHtml =
        '<div class="farm-section-title">🏞️ ' + T('Room to grow') + '</div>' +
        _upRow('🏞️', T('Bigger pasture'),
          T('Lv {n}/{max} · holds {cap} animals', { n: expLvl, max: FARM_EXPAND_COSTS.length, cap: farmAnimalCap() }),
          expandCost == null ? _upTag(T('MAX'))
            : _upBuy('expandFarm()', '+10 · ' + expandCost + '🪙', roomData.coins >= expandCost),
          expandCost == null ? '' : T('Pushes the crop fence down — more grass for a bigger herd.')) +
        _farmLandHtml(expandCost == null) +
        _upRow('🪣', T('Bigger trough'),
          T('Lv {n}/{max} · holds {cap} food', { n: trLvl, max: FARM_TROUGH_COSTS.length, cap: farmFoodMax() }),
          trCost == null ? _upTag(T('MAX'))
            : _upBuy('buyFarmTrough()', '+' + FARM_TROUGH_STEP + ' · ' + trCost + '🪙', roomData.coins >= trCost),
          trCost == null ? '' : T('A bigger trough holds more food, so it lasts longer between refills.'));

      const autoHtml =
        '<div class="farm-section-title">🤖 ' + T('Automation') + '</div>' +
        _upRow('🤖', T('Auto-Collector'), T('produce → stock'),
          roomData.farmAutoCollect ? _upTag('✓ ' + T('ON'))
            : _upBuy('buyFarmAutoCollect()', FARM_AUTOCOLLECT_COST + '🪙', roomData.coins >= FARM_AUTOCOLLECT_COST),
          roomData.farmAutoCollect ? '' : T('Produce goes straight to your stock — no tapping it up off the grass.')) +
        _upRow('🤖', T('Auto-Feeder'),
          roomData.farmAutoFeed
            ? T('Refills at {pct}% · {cost} per feed', { pct: Math.round(FARM_AUTOFEED_AT * 100), cost: FARM_FOOD_COST + '🪙' })
            : T('Never top up the trough by hand again'),
          roomData.farmAutoFeed
            ? _upBuy('toggleFarmAutoFeed()', roomData.farmAutoFeedOn ? '✓ ' + T('ON') : T('OFF'), true)
            : _upBuy('buyFarmAutoFeed()', FARM_AUTOFEED_COST + '🪙', roomData.coins >= FARM_AUTOFEED_COST),
          roomData.farmAutoFeed ? '' : T('Buys feed with your coins — it stops when they run out, and never overdraws.')) +
        _upRow('❄️', T('Cold Store'),
          T('Lv {n}/{max} · banks {time} offline', { n: coldLvl, max: FARM_COLD_COSTS.length, time: _fmtFarmTime(farmOfflineCapMs()) }),
          coldCost == null ? _upTag(T('MAX'))
            : coldLocked ? '<button class="farm-shop-buy" disabled>🔒 ' + T('Needs 🤖') + '</button>'
            : _upBuy('buyFarmCold()', '+' + _fmtFarmTime(FARM_COLD_STEP_MS) + ' · ' + coldCost + '🪙', roomData.coins >= coldCost),
          coldCost == null ? ''
            : coldLocked ? T('Install the 🤖 Auto-Collector first — otherwise banking longer just means more to clear by hand.')
            : T("How long your animals keep producing while you're away. Pair it with the 🤖 Auto-Feeder so they don't go hungry."));

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
        garden:   card(gardenHtml),
        market:   card(stockHtml) + card(ordersHtml),
        upgrades: card(scaleHtml) + card(autoHtml) + card(_farmSkinsHtml()),
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
      if (!_ownsButcher()) { showToast('🔪 ' + T('Unlock the Butcher first — tap its hut on the farm.'), 'error'); return; }
      _farmButcherConfirmId = id; renderFarmPanel();
    }
    function cancelButcher() { _farmButcherConfirmId = null; renderFarmPanel(); }
    async function butcherAnimal(id) {
      if (viewingUid !== currentUid) return;
      _farmButcherConfirmId = null;
      if (!_ownsButcher()) { renderFarmPanel(); return showToast('🔪 ' + T('Unlock the Butcher first — tap its hut on the farm.'), 'error'); }
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

    /* One shape for every upgrade row, so the tab reads as a list instead of six
       hand-rolled variants. `note` is rendered ONLY while it still tells the
       player something: a maxed or already-running upgrade drops its line. That
       is most of what made this tab a wall — seven permanent paragraphs, and on a
       developed farm four of them described things already finished. */
    function _upRow(icon, name, sub, action, note) {
      return '<div class="farm-shop-row">' +
          '<span class="farm-shop-animal">' + icon + ' ' + name +
            (sub ? ' <small>' + sub + '</small>' : '') + '</span>' + action +
        '</div>' +
        (note ? '<div class="farm-panel-empty" style="padding:2px 0 4px">' + note + '</div>' : '');
    }
    const _upTag = (s) => '<span class="farm-shop-drop">' + s + '</span>';
    const _upBuy = (call, label, afford) =>
      '<button class="farm-shop-buy" onclick="' + call + '"' + (afford ? '' : ' disabled') + '>' + label + '</button>';

    /* ONE row, shaped like every other upgrade: icon, name, "n/max · what it
       costs next", action. It was two rows sharing one description — the only
       entry built that way — and with both sides showing 50000 it read as
       "100000 for the pair" when the second plot is 120000. The price belongs to
       the NEXT plot whichever side it is, so it is stated once, where the other
       rows put their level. Both sides keep their slot whether owned or not, so
       the row never reshuffles and a lone ✓ can't be read as the wrong side. */
    function _farmLandHtml(pastureMaxed) {
      const max = FARM_LAND_COSTS.length;
      const owned = (roomData.farmLandL ? 1 : 0) + (roomData.farmLandR ? 1 : 0);
      const cost = owned < max ? FARM_LAND_COSTS[owned] : null;
      /* Owning everything is checked FIRST. The gate is about the NEXT plot, so
         once there isn't one it has nothing left to say — and said anyway it
         read as a claim about the plots already standing there: "2/2 · needs a
         full pasture", beside a MAX tag, on ground bought long ago. */
      const note = cost == null ? ''
                 : !pastureMaxed ? T('needs a full pasture')
                 : T('next {cost}', { cost: cost + '🪙' });
      const side = (key, dir, label) =>
        roomData[key] ? _upTag(T(label) + ' ✓')
        : _upBuy("buyFarmLand('" + dir + "')", T(label), pastureMaxed && roomData.coins >= cost);
      return _upRow('🗺️', T('Land beside the farm'),
        owned + '/' + max + (note ? ' · ' + note : ''),
        cost == null ? _upTag(T('MAX'))
          : side('farmLandL', 'L', '← left') + side('farmLandR', 'R', 'right →'),
        cost == null ? '' : T('New ground either side. Nothing already on the farm moves.'));
    }

    async function buyFarmLand(side) {
      if (viewingUid !== currentUid) return;
      if ((roomData.farmCapLevel || 0) < FARM_EXPAND_COSTS.length) {
        return showToast(T('Fully expand the pasture first!'), 'error');
      }
      const key = side === 'L' ? 'farmLandL' : 'farmLandR';
      if (roomData[key]) return;
      const cost = FARM_LAND_COSTS[(roomData.farmLandL ? 1 : 0) + (roomData.farmLandR ? 1 : 0)];
      if (cost == null) return;
      if (roomData.coins < cost) return showToast(T('Not enough coins!'), 'error');
      // Both the gate and the price are re-checked on the server's copy: the OTHER
      // side may have been bought on another device since this panel was drawn,
      // which makes this plot the second one and the dearer of the two.
      const r = await _farmScaleTxn(function (d) {
        if (farmCapLevelOf(d) < FARM_EXPAND_COSTS.length || d[key]) return null;
        const at = FARM_LAND_COSTS[(d.farmLandL ? 1 : 0) + (d.farmLandR ? 1 : 0)];
        if (at !== cost) return null;
        const f = {}; f[key] = true; return f;
      });
      if (!r.ok) return _farmScaleBehind(r);
      roomData.coins -= cost;
      logCoin(-cost, T('Farm land'));
      roomData[key] = true;
      await saveRoom();
      showToast('🏞️ ' + (side === 'L' ? T('Opened up the land on the left!') : T('Opened up the land on the right!')), 'success');
      renderFarmPanel();
      renderAll();
      farmPan(side === 'L' ? -1 : 1);   // glide over so the new ground is what you see
    }

    /* The pasture level and the two plots are one-way, paid progression, and
       saveRoom() deliberately no longer carries them (see the NOTE there). They
       move only through here, and only against what the SERVER holds: the
       transaction re-reads the document and re-checks the gate on THAT copy, so a
       client running on an out-of-date one — a first snapshot answered out of the
       device's offline cache, a second tab, a tick that fired before the server
       replied — loses the race instead of posting its stale level over a newer.
       `plan(d)` is handed the server document and returns the fields to write, or
       null to refuse. The server's own numbers come back either way, so a refused
       caller can adopt them and redraw rather than argue with a stale copy. */
    async function _farmScaleTxn(plan) {
      const ref = userDocRef(currentUid);
      return await db.runTransaction(async function (tx) {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : {};
        const fields = plan(d);
        if (fields) tx.set(ref, fields, { merge: true });
        return { ok: !!fields, level: farmCapLevelOf(d), landL: !!d.farmLandL, landR: !!d.farmLandR };
      });
    }

    // Nothing was bought and nothing charged — this client priced a step the
    // server does not agree is next. Take the server's numbers and redraw, so the
    // panel stops offering something that has already happened.
    function _farmScaleBehind(r) {
      roomData.farmCapLevel = r.level;
      roomData.farmLandL = r.landL;
      roomData.farmLandR = r.landR;
      renderFarmPanel();
      renderAll();
      showToast(T('Your farm has moved on — this is what it holds now.'), '');
    }

    async function expandFarm() {
      if (viewingUid !== currentUid) return;
      const lvl = roomData.farmCapLevel || 0;
      if (lvl >= FARM_EXPAND_COSTS.length) return showToast(T('Farm is fully expanded!'), '');
      const cost = FARM_EXPAND_COSTS[lvl];
      if (roomData.coins < cost) return showToast(T('Not enough coins!'), 'error');
      // Only buy the rung the server also thinks is next — priced off its level,
      // not ours, so a stale client can neither pay twice nor step down.
      const r = await _farmScaleTxn(function (d) {
        return farmCapLevelOf(d) === lvl ? { farmCapLevel: lvl + 1 } : null;
      });
      if (!r.ok) return _farmScaleBehind(r);
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
      const g = d.grass || [], dk = d.deck || {};
      // A mini cross-section of the real thing: tinted sky, grass, soil, with a
      // dot for the canopy. Built from the very colours the canvas paints with,
      // so the row cannot promise a look the farm does not deliver.
      const sky = d.sky || 'rgba(150,205,245,0.55)';
      return '<span style="position:relative;display:inline-block;width:26px;height:18px;border-radius:4px;' +
        'vertical-align:-4px;margin-right:7px;border:1px solid rgba(0,0,0,.25);overflow:hidden;' +
        'background:linear-gradient(180deg,' + sky + ' 0%,' + sky + ' 26%,' +
        (g[0] || '#9ed26b') + ' 26%,' + (g[2] || '#5ba23c') + ' 66%,' +
        'rgb(' + (dk.top || [122, 86, 48]).join(',') + ') 66%,' +
        'rgb(' + (dk.bottom || [86, 58, 30]).join(',') + ') 100%)">' +
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
          '<span class="farm-shop-animal">' + _farmSwatch(th) + _skinIcon(th.id, 20, th) + ' ' + T(th.name) +
            (th.blurb ? ' <small>' + T(th.blurb) + '</small>' : '') + '</span>' +
          action +
        '</div>';
      }).join('');
      // No margin-top any more: this used to be tacked onto the end of the one
      // upgrades card and needed to fake a gap. It is its own card now.
      return '<div class="farm-section-title">🎨 ' + T('Farm look') + '</div>' +
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
      // Aged goods are in here for LABELS only (the ageing modal and the buyer
      // need an emoji and a name). They are deliberately absent from
      // farmProductPrices below, so nothing that sells by list price can price
      // one — see farmAged.
      for (const id in FARM_AGED) m[id] = { emoji: FARM_AGED[id].emoji, name: FARM_AGED[id].name };
      return m;
    }
    function farmProductPrices() {
      const p = {};
      FARM_ANIMALS.forEach(a => { p[a.drop.id] = a.drop.coins; });
      for (const id in FARM_PRODUCTS) p[id] = FARM_PRODUCTS[id].coins;
      return p;
    }
    /* Where each product comes from, in the order the Produce panel groups them:
       the raw goods first, then every workshop machine, then every ageing
       factory. Built from the same tables the farm runs on, so adding a recipe
       files its output under the right building without a second edit here.
       `aged` marks the tier-2 groups, whose stock and price live apart from the
       rest (roomData.farmAged / FARM_AGED) — see the note on FARM_AGED. */
    function farmProductGroups() {
      // First group to claim a product keeps it, so a good listed by two recipes
      // is shown (and counted) once.
      const seen = {};
      const only = ids => ids.filter(id => !seen[id] && (seen[id] = 1));
      const groups = [
        { emoji: '🐄', name: 'Animals', ids: only(FARM_ANIMALS.map(a => a.drop.id)) },
        { emoji: '🌾', name: 'Garden',  ids: only(FARM_CROPS.map(c => c.yield.product)) },
      ];
      const addAll = (list, aged) => list.forEach(d => groups.push({
        emoji: d.emoji, name: d.name, aged: aged, ids: only(d.recipes.map(r => r.out.id)),
      }));
      addAll(FARM_MACHINES, false);
      addAll(FARM_AGERS, true);
      // Whatever no table claims — meat, off the butcher's block — is raw too, so
      // it belongs beside the other raw goods rather than after the factories.
      groups.splice(2, 0, { emoji: '📦', name: 'Other', ids: Object.keys(FARM_PRODUCTS).filter(id => !seen[id]) });
      return groups;
    }
    // Every kind currently held, tier 1 and tier 2 — the count on the Produce header.
    function farmProduceKinds() {
      const stock = roomData.farmStock || {}, aged = roomData.farmAged || {};
      return farmProductGroups()
        .reduce((n, g) => n + g.ids.filter(id => ((g.aged ? aged : stock)[id] || 0) > 0).length, 0);
    }

    // Tap a drop → it goes into farm stock (sell later / use for orders), and the
    // producing animal gains collection XP toward its level.
    /* ── Social ── */
    // Cheer a friend's farm — cosmetic celebration (no cross-user writes, so no
    // rules change). A coin/host-side reward would need a firestore.rules update.
    /* ── Workshop (processing machines, parallel slots) ──
       Two lists share this code: FARM_MACHINES on the pasture (tier 1) and
       FARM_AGERS on the right plot (tier 2). FARM_AGERS has the same
       id/cost/recipes shape on purpose, so state, unlocking, slots, starting,
       collecting and the modal are each written ONCE and resolve which list
       (and which inventory) an id belongs to. The one real difference is where
       the output lands: tier 1 → farmStock, tier 2 → farmAged, which is what
       keeps aged goods out of every list-price sell path. */
    function _farmBuildDef(id) {
      return FARM_MACHINES.find(m => m.id === id) || FARM_AGERS.find(m => m.id === id) || null;
    }
    function _isAger(id) { return FARM_AGERS.some(m => m.id === id); }
    // The owned-map an id lives in. `create` only when about to write to it, so
    // merely drawing a visitor's farm never invents state on their data.
    function _farmBuildMap(id, create) {
      const key = _isAger(id) ? 'farmAgers' : 'farmMachines';
      if (create && !roomData[key]) roomData[key] = {};
      return roomData[key] || {};
    }
    function _buildSlotCost(id) { return _isAger(id) ? FARM_AGER_SLOT_COST : FARM_SLOT_COST; }

    /* A building can be owned with no stored record. The Cheese Cave is marked
       `free` and comes WITH the right plot, the way the first compost bin comes
       with the left one — the plot is what was paid for, so there is nothing left
       to unlock and no reason to make the player tap a padlock to claim it.

       Derived rather than written at purchase time, so anyone who already bought
       the plot gets it too, and the flag can never drift from the plot it
       depends on. */
    function _farmBuildFree(id) {
      const def = _farmBuildDef(id);
      return !!(def && def.free && _isAger(id) && roomData.farmLandR);
    }
    function _farmBuildOwned(id) {
      if (_farmBuildFree(id)) return true;
      const m = _farmBuildMap(id)[id];
      return !!(m && m.owned);
    }

    // Normalize a machine to the slot model, migrating the old single-job shape
    // ({owned, startedAt}) to {owned, slots, jobs:[startedAt,…]}. Returns it or null.
    function _machineState(id) {
      let m = _farmBuildMap(id)[id];
      /* A free building has no stored record until something is written to it.
         Materialise one on your OWN farm — callers mutate what this returns
         (slots, jobs) and then save. On someone else's farm hand back a throwaway
         instead, so drawing a visitor's plot never invents state on their data. */
      if (!m && _farmBuildFree(id)) {
        if (viewingUid !== currentUid) return { owned: true, slots: 1, jobs: [0] };
        m = _farmBuildMap(id, true)[id] = { owned: true, slots: 1, jobs: [0] };
      }
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

    // Unlock a building by tapping it on the land — machines and ageing
    // factories both. Same three lines the panel button used to run.
    async function buyFarmMachine(id) {
      if (viewingUid !== currentUid) return;
      const mc = _farmBuildDef(id);
      if (!mc) return;
      if (_farmBuildOwned(id)) return;          // includes the free Cheese Cave
      const map = _farmBuildMap(id, true);
      if (roomData.coins < mc.cost) return showToast(T('Not enough coins!'), 'error');
      roomData.coins -= mc.cost;
      logCoin(-mc.cost, T('Built {name}', { name: T(mc.name) }));
      map[id] = { owned: true, slots: 1, jobs: [0] };
      await saveRoom();
      showToast(mc.emoji + ' ' + T('{name} built! Tap it on your farm to make goods.', { name: T(mc.name) }), 'success');
      renderWorkshopModal();
      renderFarmPanel();
      renderAll();
    }

    async function buyMachineSlot(id) {
      if (viewingUid !== currentUid) return;
      const m = _machineState(id);
      if (!m) return;
      const cost = _buildSlotCost(id);
      if (m.slots >= FARM_MAX_SLOTS) return showToast(T('All {n} slots are open already.', { n: FARM_MAX_SLOTS }), '');
      if (roomData.coins < cost) return showToast(T('Not enough coins!') + ' (' + cost + '🪙)', 'error');
      roomData.coins -= cost;
      logCoin(-cost, T('Machine slot'));
      m.slots += 1; m.jobs.push(0);
      _slotConfirm = false;
      await saveRoom();
      showToast('🧰 ' + T('New production slot opened!'), 'success');
      renderWorkshopModal(); renderFarmPanel(); renderAll();
    }

    async function startMachineSlot(id, slot, r) {
      if (viewingUid !== currentUid) return;
      const mc = _farmBuildDef(id), m = _machineState(id);
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
      const mc = _farmBuildDef(id), m = _machineState(id);
      if (!mc || !m || !m.jobs[slot]) return;
      const job = m.jobs[slot], recipe = mc.recipes[job.r] || mc.recipes[0];
      if (cropProgress(job.at, Date.now(), recipe.timeMs) < 1) return showToast(T('Still processing…'), '');
      // Apply locally, then persist. If the save fails, roll back — otherwise the
      // collected item silently disappears when the next snapshot overwrites it.
      // Tier 2 lands in farmAged, which no list-price sell path can reach.
      const bin = _isAger(id) ? 'farmAged' : 'farmStock';
      roomData[bin] = roomData[bin] || {};
      roomData[bin][recipe.out.id] = (roomData[bin][recipe.out.id] || 0) + recipe.out.qty;
      m.jobs[slot] = 0;
      const ok = await saveRoom();
      if (!ok) {
        roomData[bin][recipe.out.id] -= recipe.out.qty;
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
      const n = farmProduceKinds();
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
        // A bed sown with fertilizer yields ×2. The flag was set at planting and
        // is spent here along with the crop.
        const mult = plot.fert ? FARM_FERT_MULT : 1;
        if (crop.yield.food) {
          const got = crop.yield.food * mult;
          roomData.farmFood = Math.min(farmFoodMax(), (roomData.farmFood || 0) + got);
          if (!roomData.farmFoodAt) roomData.farmFoodAt = now;
          _farmParticles.push({ text: '+' + got + ' 🌾', x: pos.x, y: pos.y - 0.05, vy: -0.0009, life: 1200, born: performance.now() });
        } else {
          const got = crop.yield.qty * mult;
          roomData.farmStock = roomData.farmStock || {};
          roomData.farmStock[crop.yield.product] = (roomData.farmStock[crop.yield.product] || 0) + got;
          const m = FARM_PRODUCTS[crop.yield.product];
          _farmParticles.push({ text: '+' + got + ' ' + (m ? m.emoji : ''), x: pos.x, y: pos.y - 0.05, vy: -0.0009, life: 1200, born: performance.now() });
        }
        plot.crop = null; plot.plantedAt = 0; plot.fert = false; n++;
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
        const now = Date.now();
        /* Tapping a BED reports that bed. It used to report the row's slowest
           crop whatever you touched, so on a mixed row you could tap the corn
           and be told about the wheat. */
        if (tapped && tapped.crop) {
          const c = FARM_CROPS.find(x => x.id === tapped.crop);
          return showToast(T('{crop} growing — {time} left', {
            crop: c ? c.emoji + ' ' + T(c.name) : T('Crop'),
            time: _fmtFarmTime(c ? c.growMs - (now - tapped.plantedAt) : 0),
          }), '');
        }
        /* Tapping the SIGNBOARD reports the row — and a row may hold several
           crops, each finishing at its own time. One crop and one number was
           only ever right for a row planted all at once. Nothing here is ripe:
           a single ripe bed makes the row 'ripe' and it harvested above. */
        const each = (st.kinds || [st.cropId]).map(function (id) {
          const c = FARM_CROPS.find(x => x.id === id);
          if (!c) return null;
          let ms = 0;
          idxs.forEach(function (i) {
            const p = plots[i];
            if (p && p.crop === id) ms = Math.max(ms, c.growMs - (now - p.plantedAt));
          });
          return { c: c, ms: ms };
        }).filter(Boolean);
        if (each.length === 1) {
          return showToast(T('{crop} growing — {time} left',
            { crop: each[0].c.emoji + ' ' + T(each[0].c.name), time: _fmtFarmTime(each[0].ms) }), '');
        }
        return showToast('🌱 ' + each.map(e => e.c.emoji + ' ' + _fmtFarmTime(e.ms)).join('  ·  '), '');
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

    // "Sow fertilised" on/off. Not remembered between openings: it spends a
    // limited resource, so it should be chosen each time rather than left on.

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
      _fertAllPending = false;
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
      // Sowing never spends fertilizer any more — you fertilise a bed that is
      // already growing, from the sack on the left of the field. Clearing the
      // flag matters: beds are reused, and a bed that was fertilised last season
      // must not come back already fertilised.
      let planted = 0;
      for (const i of idxs) {
        if (roomData.coins < crop.seedCost) break;
        roomData.coins -= crop.seedCost;
        plots[i].crop = crop.id; plots[i].plantedAt = now; plots[i].fert = false;
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
    function _visitQty(id, visitStart, maxQty) {
      let h = 5381; const s = id + '|' + visitStart;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return 1 + (Math.abs(h) % maxQty);
    }
    function _cartQty(id, visitStart) { return _visitQty(id, visitStart, FARM_CART_MAX_QTY); }
    // Pick this visit's list out of `ids`: what you already hold first (so a
    // visit is usually sellable on arrival), padded with the rest so the list
    // still shows you what to go and make. Shared by the plane and the tier-2
    // buyer — same rule, different shelf.
    function _pickWanted(ids, have, visitStart, count, maxQty, salt) {
      const rng = _mulberry32((Math.floor(visitStart / 60000) ^ (salt || 0)) >>> 0);
      const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
      let pool = shuffle(ids.filter(id => (have[id] || 0) > 0));
      if (pool.length < count) pool = pool.concat(shuffle(ids.filter(id => pool.indexOf(id) < 0)));
      return pool.slice(0, Math.min(count, pool.length))
        .map(id => ({ id: id, qty: _visitQty(id, visitStart, maxQty) }));
    }
    /* Present/away for anything on the plane's cycle. `leftAt` is when it last
       left (0 = never, i.e. it is here and always has been), and the visit it is
       on — or the one it will arrive with — is keyed by when that visit STARTS,
       which is what freezes a wanted-list across reloads and devices. */
    function _visitCycle(leftAt, cooldownMs, now) {
      const left = leftAt || 0;
      const present = !left || (now - left) >= cooldownMs;
      return {
        present: present,
        visitStart: left ? (left + cooldownMs) : 0,
        nextInMs: present ? 0 : (cooldownMs - (now - left)),
      };
    }
    // The cart only buys WORKSHOP-MADE goods (cheese, bread, sausage…), never raw
    // produce/drops — those are ingredients. Goods are limited to workshops you
    // OWN, so the cart never asks for things you have no way to make. Wanted-list
    // prefers made goods you currently have in stock, padded with other owned-made goods.
    function _cartBuildWanted(visitStart) {
      const machines = roomData.farmMachines || {};
      const made = {};
      FARM_MACHINES.forEach(m => {
        if (machines[m.id] && machines[m.id].owned) m.recipes.forEach(r => { made[r.out.id] = true; });
      });
      return _pickWanted(Object.keys(made), roomData.farmStock || {}, visitStart,
        FARM_CART_WANT_COUNT, FARM_CART_MAX_QTY, 0);
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
      const c = _visitCycle(roomData.farmCartLeftAt, FARM_CART_COOLDOWN_MS, now || Date.now());
      c.wanted = _cartWantedFor(c.visitStart);
      return c;
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
    /* Where each workshop hut stands, and how big it is drawn. One source for
       all four users — the tap resolver, the animals' keep-out zones, the
       painter, and the size below.

       Taps here resolve nearest-wins, so a hut owns exactly half the step to
       its neighbour. The bug that made huts feel unhittable was that the hut
       was drawn WIDER than the half-step it owns: with the roof overhang a hut
       covers 1.26x its size, which at the old numbers came to 52px of drawing
       inside a 50px slot. The outer few pixels of every hut you could see
       belonged to the one next door, so aiming at what you saw missed.

       So the rule is: the drawing must fit inside the slot, with a seam left
       over that you can actually see. Three things bound it, and all of them
       are checked at 360x520, the tightest stage that matters:

         seam    step - 1.26s  must stay positive          → +6.8px
         forge   the last hut sits nearest the mailbox, whose tap rect starts
                 at 0.832. Its drawn right edge has to stop short of the
                 midpoint between them, or the mailbox owns part of it → +5.5px
         plane   the roof reaches 0.52s above centre and the plane's tap rect
                 hangs down to y 0.185. They must not meet            → +10px
         trough  the first hut's left edge clears the trough at 0.085  → +15px

       Those four are why the numbers look arbitrary: they are the solution to
       the four inequalities, not a guess. Change one and re-check all four. */
    const FARM_HUT_X0 = 0.17, FARM_HUT_DX = 0.126;
    function _workshopPos(slot) { return { x: FARM_HUT_X0 + slot * FARM_HUT_DX, y: FARM_HUT_Y }; }
    function _workshopSize(W, H) { return Math.max(28, Math.min(W, H) * 0.085); }

    // Which fixed target a tap in the farm's upper half lands on: an owned
    // machine hut's id, '#cart' for the merchant plane, '#mail' for the mailbox,
    // or null. Split out of the click handler so the geometry is testable —
    // see room-farm-hit.test.js.
    //
    // One nearest-wins pass in real pixels, NOT a priority chain of normalized
    // circles. The chain used to check huts first with a 0.13 "radius" which on
    // a phone is a 47×68px ellipse — tall enough to reach up into the sky and
    // swallow every tap meant for the plane, banner included.
    /* `camX` is where the land has been scrolled to, in window widths. A tap
       arrives in WINDOW coordinates; the huts, the mailbox and the plane all
       stand on the LAND, so every target here is shifted by the camera to meet
       it. Defaults to 0 — which is exactly the farm before any of this existed,
       and is what room-farm-hit.test.js measures. */
    function _farmSkyTarget(cx, cy, W, H, camX) {
      camX = camX || 0;
      const targets = [];
      // Every target here stands on the LAND, so each shifts by the camera to
      // meet a tap that arrives in window coordinates.
      const shift = (r) => ({ x0: r.x0 - camX, x1: r.x1 - camX, y0: r.y0, y1: r.y1 });
      if (viewingUid === currentUid) {
        // Mail first: on a wide stage the plane's rect clips the mailbox's badge
        // corner, and an exact tie goes to whoever is listed first. The mailbox
        // is drawn on top there, so it should win there too.
        targets.push(Object.assign({ id: '#mail' },
          shift(farmMailTapRect(_farmMailPos(W, H), _farmMailSize(W, H), W, H))));
        targets.push(Object.assign({ id: '#cart' },
          shift(farmCartTapRect(_farmCartPos(W, H), _farmCartSize(W, H), W, H, _farmCart().present))));
      }
      // Every hut is a target whether built or not — tapping an unbuilt one is
      // how it is bought, so skipping it would make the lock un-openable.
      FARM_MACHINES.forEach(function (m, slot) {
        const p = _workshopPos(slot);
        targets.push({ id: m.id, x: p.x - camX, y: p.y });     // land → window
      });
      // Side land, once its plot is owned. Locked buildings are targets for the
      // same reason the huts are: tapping one is how it is unlocked.
      // Collecting a bin and selling at the buyer are your own actions, so those
      // two are targets only on your own farm — the same rule the mailbox and
      // the plane already follow above.
      // Rects, sized from the same _plotSizeAt the drawing uses, then shifted by
      // the camera the way the huts above are — so the target is always exactly
      // the building that was painted.
      const plot = (id, p) => _plotTapRect(id, { x: p.x - camX, y: p.y }, _plotSizeAt(p.y, W, H), W, H);
      if (roomData.farmLandL && viewingUid === currentUid) {
        for (let i = 0; i < FARM_COMPOST_BINS_MAX; i++) targets.push(plot('#bin' + i, _binPos(i, W, H)));
      }
      if (roomData.farmLandR) {
        FARM_AGERS.forEach(function (a, i) { targets.push(plot(a.id, _agerPos(i, W, H))); });
        if (viewingUid === currentUid) targets.push(plot('#buyer', _buyerPos(W, H)));
      }
      return farmPickTarget({ x: cx, y: cy }, W, H, targets, FARM_TAP_REACH_PX);
    }

    /* Which tooltip the pointer is over. Split out of the move handler for the
       same reason _farmSkyTarget was split out of the click handler: the geometry
       is the thing that keeps going wrong, and inside an event handler it cannot
       be tested.

       `cx, cy` arrive in WINDOW coordinates. The trough and the garden beds stand
       on the LAND, so both are compared in land space — they were not, and once
       the land could be panned that meant the checks were reading whatever
       happened to sit at that screen position on the farm. With the camera at the
       left plot the trough's own x of 0.085 lands squarely on a compost bin,
       which is why pointing at a bin popped up the trough's food count.

       `tg` is whatever _farmTargetAt already resolved for this same point, passed
       in rather than resolved again so the tooltip can never name something a tap
       would not open. */
    function _farmHoverTip(cx, cy, W, H, camX, tg) {
      const wx = cx + (camX || 0);
      if (Math.hypot(wx - FARM_TROUGH_X, cy - _farmTroughY(W, H)) < 0.08) {
        // The level is on the badge now, so what the tooltip adds is the RATE —
        // the answer to "is it going down, and how fast".
        const rate = _foodPerHr();
        return '🌾 ' + T('Food') + '  ' + _foodShown(_foodNow()) + ' / ' + farmFoodMax() +
          (rate > 0 ? '  ·  ' + T('−{n}/hr', { n: _fmtRate(rate) }) : '');
      }
      if (tg && tg.kind === 'sky' && String(tg.id).indexOf('#bin') === 0) {
        // Bins carry their level on a badge now, so this only names the thing and
        // says what tapping it does.
        const bi = +String(tg.id).slice(4);
        if (bi >= _compostBins()) return '🔒 ' + T('Compost bin — tap to open it');
        const cRate = _compostPerHr();
        return '🪵 ' + T('Compost') + '  ' + Math.floor(_binFill(bi) * FARM_COMPOST_PER_BIN) +
          ' / ' + FARM_COMPOST_PER_BIN +
          (cRate > 0 ? '  ·  ' + T('+{n}/hr', { n: _fmtRate(cRate) }) : '') +
          (Math.floor(roomData.farmCompost || 0) >= 1 ? '  ·  ' + T('tap to collect the yard') : '');
      }
      if (tg && tg.kind === 'fert') {
        const n = farmFertCount();
        return '🌱 ' + (n
          ? T('Fertilizer ×{n} — tap then tap a bed · double-tap for the whole field', { n: n })
          : T('No fertilizer — collect a compost bin on the west plot.'));
      }
      if (tg && tg.kind === 'sky' && tg.id === '#mail') {
        const mn = _farmInboxCount();
        return '📮 ' + (mn ? T('Mailbox — {n} unclaimed', { n: mn }) : T('Mailbox — empty'));
      }
      if (tg && tg.kind === 'sky' && tg.id === '#buyer') {
        const b = farmBuyerState();
        const list = b.wanted.map(w => (FARM_AGED[w.id] || { emoji: '❓' }).emoji + '×' + _buyerRemaining(w)).join(' ');
        return '🏛️ ' + (b.present
          ? T('Taking today: {list}', { list: list || '—' })
          : T('Closed — opens in {time}', { time: _fmtFarmTime(b.nextInMs) }));
      }
      const plots = roomData.farmPlots || [];
      for (let i = 0; i < plots.length; i++) {
        const pp = _farmPlotPos(i, W, H);
        if (Math.hypot(pp.x - wx, pp.y - cy) >= 0.045) continue;
        const plot = plots[i];
        if (!plot.crop) return '🌱 ' + T('Empty — tap to plant');
        const crop = FARM_CROPS.find(c => c.id === plot.crop);
        if (!crop) return '';
        const left = crop.growMs - (Date.now() - plot.plantedAt);
        return crop.emoji + ' ' + (left <= 0 ? T('Ready to harvest!') : T('{time} left', { time: _fmtFarmTime(left) }));
      }
      return '';
    }

    /* ── Fertilising a bed that is already growing ──
       Fertilizer used to be a checkbox in the planting sheet, which meant you had
       to decide before the crop existed and could never change your mind. It is a
       sack on the left of the field now, and it works the two ways a thing you
       carry should: drag it onto a bed, or tap it and then tap a bed.

       Tap-then-tap is the primary path, not the fallback. Drag is a poor primary
       on a phone — it fights the swipe that pans the land, and it needs a steady
       finger on a 44px target — so arming is what the button does on a plain tap,
       and the drag is an extra for whoever reaches for it.

       A DOUBLE tap is the third way, and it means the whole field at once — see
       askFertAll() below for why that one asks before it spends.

       The sack is a DOM button over the canvas, like "🧺 Collect" and the pan
       arrows: that guarantees the touch target, gets its own hover and pressed
       states, and keeps it out of the canvas hit-test entirely. */
    let _fertArmed = false;          // tapped the sack: the next bed gets it
    let _fertDrag = null;            // {x,y} in LAND coords while dragging
    let _fertPress = null;           // press that started on the sack, before it became a drag
    let _fertPainted = null;         // bed indices done in this one drag
    let _fertPaintN = 0;             // how many this drag has done, for the toast at the end
    let _fertLastTap = 0;            // when the sack was last tapped, to spot the second one
    let _fertAllPending = false;     // a "fertilise the whole field" sheet is waiting on yes/no
    const FARM_FERT_DBLTAP_MS = 340; // two taps on the sack closer than this are one double-tap

    function farmFertCount() { return Math.floor(roomData.farmFertilizer || 0); }

    /* Where the sack stands. It belongs to the FIELD, not to the screen — it is
       drawn in the world layer and pans away with everything else, so it reads as
       a thing sitting by the crops rather than a control bolted to the viewport.

       It goes in the clear strip left of the row signboards, which is where the
       field has spare room. A narrow stage has no such strip (the beds take 97%
       of the width there), so it moves to the gap just above the first row
       instead — still beside the crops, and still nowhere near a bed. */
    function _fertBagSize(W, H) {
      const tile = _farmTile(W, H);
      return Math.max(30, Math.min(tile * 1.15, Math.min(W, H) * 0.075));
    }
    function _fertBagPos(W, H) {
      const band = _farmCropBand(H, W), geom = _farmRowGeom(W, H), s = _fertBagSize(W, H);
      // px from the left edge of the field to the first thing standing in it
      const firstX = geom.signW ? geom.signX * W - geom.signW / 2 : geom.plotX0 * W - geom.tile / 2;
      if (firstX >= s * 1.25) {
        return { x: (firstX / 2) / W, y: band.top + (band.bot - band.top) * 0.42 };
      }
      // No margin: sit above the first row, hard left.
      return { x: (s * 0.7) / W, y: Math.max(_farmDivY() + 0.012, band.top - band.rowGap * 0.42) };
    }
    // Generous, because it is the one thing here you are meant to grab.
    function _fertBagHit(wx, cy, W, H) {
      const p = _fertBagPos(W, H), s = _fertBagSize(W, H);
      return Math.abs(wx - p.x) * W < s * 0.85 && Math.abs(cy - p.y) * H < s * 0.85;
    }
    // A bed can take fertilizer if it is growing something and has not had any.
    // Re-fertilising is refused rather than silently wasted.
    function _fertable(i) {
      const p = (roomData.farmPlots || [])[i];
      return !!(p && p.crop && !p.fert);
    }
    // Every bed the sack could go on right now, in field order — which is also
    // the order a short sack gets spent in, first row first.
    function _fertableIdxs() {
      const plots = roomData.farmPlots || [], out = [];
      for (let i = 0; i < plots.length; i++) if (_fertable(i)) out.push(i);
      return out;
    }

    function toggleFertArm() {
      if (viewingUid !== currentUid) return;
      if (!_fertArmed && farmFertCount() < 1) {
        return showToast('🌱 ' + T('No fertilizer — collect a compost bin on the west plot.'), '');
      }
      _fertArmed = !_fertArmed;
    }
    function _disarmFert() { _fertArmed = false; _fertDrag = null; _fertPress = null; _fertPainted = null; }

    /* The bare act, with no saving and no toast: a paint drag calls this once
       per bed it crosses and reports the whole run at the end, so a swipe over a
       row is one save and one message rather than ten of each. */
    function _fertBed(i) {
      if (viewingUid !== currentUid) return false;
      if (!_fertable(i) || farmFertCount() < 1) return false;
      roomData.farmFertilizer -= 1;
      roomData.farmPlots[i].fert = true;
      const wh = _farmWH(), pos = _farmPlotPos(i, wh.W, wh.H);
      _farmParticles.push({ text: '🌱', x: pos.x, y: pos.y - 0.04, vy: -0.0009, life: 900, born: performance.now() });
      return true;
    }

    // The single-tap path: says why when it refuses, because a tap that does
    // nothing and says nothing is indistinguishable from a missed tap.
    async function applyFert(i) {
      if (viewingUid !== currentUid) return false;
      const p = (roomData.farmPlots || [])[i];
      if (!p || !p.crop) { showToast('🌱 ' + T('Fertilizer goes on a growing crop.'), ''); return false; }
      if (p.fert) { showToast('🌱 ' + T('That bed is already fertilised.'), ''); return false; }
      if (farmFertCount() < 1) { showToast('🌱 ' + T('No fertilizer left.'), 'error'); return false; }
      _fertBed(i);
      // Stay armed while there is more to give, so a whole row is one tap each.
      if (farmFertCount() < 1) _fertArmed = false;   // the last one puts the sack down
      await saveRoom();
      showToast('🌱 ' + T('Fertilised — this bed yields ×{n}', { n: FARM_FERT_MULT }), 'success');
      renderFarmPanel();
      return true;
    }

    // End of a paint drag: one save, one message for the whole sweep.
    async function _endFertPaint() {
      const n = _fertPaintN;
      _fertDrag = null; _fertPainted = null; _fertPaintN = 0;
      if (farmFertCount() < 1) _fertArmed = false;
      if (!n) return;
      await saveRoom();
      showToast('🌱 ' + I18N.plural(n, 'Fertilised 1 bed — yields ×{m}', 'Fertilised {n} beds — yields ×{m}',
        { m: FARM_FERT_MULT }), 'success');
      renderFarmPanel();
    }

    /* ── Double-tap the sack: the whole field in one go ──
       Bed by bed is fine for a row and a chore for forty, and the drag-paint
       cannot reach a bed that is panned off the side of the window. So the sack
       takes a double tap too, and that means "everything it can reach".

       Every tap on the sack arrives here. The single tap is the common path and
       stays instant — nothing is deferred waiting to see whether a second one
       follows, because that lag would be paid on every tap by every player,
       including the ones who never discover the gesture. So the pair is spotted
       after the fact from the timestamps, and the second tap takes back the
       arming the first one did. Zeroing the stamp on the double means a third
       tap starts a fresh pair rather than asking all over again. */
    function _fertSackTap(now) {
      const t = now || Date.now();
      if (t - _fertLastTap < FARM_FERT_DBLTAP_MS) { _fertLastTap = 0; askFertAll(); return 'all'; }
      _fertLastTap = t;
      toggleFertArm();
      return 'arm';
    }

    /* The reminder, and it is not a nicety — it is the reason the gesture is
       safe to have. This is the only thing on the farm that spends a resource
       you waited hours of composting for, all of it, on beds you never pointed
       at, and a mis-aimed double tap is an easy thing to do on a phone. So it
       asks first, with the numbers on it: how many beds, what it costs, and what
       survives it. Nothing moves until "yes". When the sack cannot cover the
       field it says so and names the number it CAN do, rather than quietly doing
       a partial job and leaving the rest looking skipped. */
    function askFertAll() {
      if (viewingUid !== currentUid) return;
      const have = farmFertCount();
      if (have < 1) return showToast('🌱 ' + T('No fertilizer — collect a compost bin on the west plot.'), '');
      const targets = _fertableIdxs().length;
      if (!targets) return showToast('🌱 ' + T('Nothing to fertilise — no growing bed is waiting for it.'), '');
      _disarmFert();                       // the sheet takes over from the armed sack
      _fertAllPending = true;
      _renderFertAllConfirm(have, targets);
    }

    // The reminder itself, reusing #cropPicker the way the partial-plant
    // confirmation does — same sheet, same buttons, one thing to learn.
    function _renderFertAllConfirm(have, targets) {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      const n = Math.min(have, targets);
      picker.innerHTML =
        '<div class="cp-head">🌱 ' + T('Fertilise the whole field?') + '</div>' +
        '<div class="cp-bulk-info" style="line-height:1.5">' +
          I18N.plural(targets, '<b>1</b> bed is growing and unfertilised.',
                               '<b>{n}</b> beds are growing and unfertilised.') + '<br>' +
          (targets > have
            ? T('You have {have} — enough for the first {n}, and the rest stay as they are.',
                { have: '<b>' + have + ' 🌱</b>', n: '<b>' + n + '</b>' })
            : T('This spends {n} and leaves {left} in the sack.',
                { n: '<b>' + n + ' 🌱</b>', left: '<b>' + (have - n) + ' 🌱</b>' })) + '<br>' +
          T('Every bed it reaches yields ×{m}.', { m: FARM_FERT_MULT }) +
        '</div>' +
        '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="confirmFertAll()">🌱 ' +
          I18N.plural(n, 'Fertilise 1 bed', 'Fertilise {n} beds') + '</button>' +
        '<button class="cp-close" onclick="closeCropPicker()">' + T('Cancel') + '</button>';
      picker.style.display = 'block';
    }

    // Said yes → walk the field, stopping when the sack runs dry. One save and
    // one message for the lot, like the paint drag, plus what is left over:
    // after a sweep that big the next thing you want to know is whether there
    // is any fertilizer to come back with.
    async function confirmFertAll() {
      if (!_fertAllPending) return closeCropPicker();
      closeCropPicker();
      if (viewingUid !== currentUid) return 0;
      let n = 0;
      for (const i of _fertableIdxs()) {
        if (farmFertCount() < 1) break;
        if (_fertBed(i)) n++;
      }
      _disarmFert();
      if (!n) return 0;
      await saveRoom();
      showToast('🌱 ' + I18N.plural(n, 'Fertilised 1 bed — yields ×{m}', 'Fertilised {n} beds — yields ×{m}',
        { m: FARM_FERT_MULT }) + ' · ' + T('{n} left in the sack', { n: farmFertCount() }), 'success');
      renderFarmPanel();
      return n;
    }

    /* While the sack is up, every bed that can take it gets a ring. Without this
       the player has to work out which beds are eligible by tapping them and
       being told no — and "already fertilised" is invisible otherwise. */
    function _drawFertTargets(ctx, W, H, t) {
      if (!_fertArmed && !_fertDrag) return;
      const plots = roomData.farmPlots || [], tile = _farmTile(W, H);
      const pulse = 0.55 + Math.sin(t / 260) * 0.25;
      ctx.save();
      ctx.lineWidth = Math.max(2, tile * 0.07);
      for (let i = 0; i < plots.length; i++) {
        if (!_fertable(i)) continue;
        const p = _farmPlotPos(i, W, H);
        ctx.strokeStyle = 'rgba(126,220,110,' + pulse.toFixed(3) + ')';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(p.x * W - tile / 2, p.y * H - tile / 2, tile, tile, tile * 0.18);
        else ctx.rect(p.x * W - tile / 2, p.y * H - tile / 2, tile, tile);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* The sack, standing in the field. Drawn rather than badged, like everything
       else on the two plots: a hessian sack slumped open with compost spilling
       over the lip, and the count on it so you never have to pick it up to see
       how many you have. */
    function _drawFertBag(ctx, W, H, t, night, pal) {
      if (!roomData.farmLandL || viewingUid !== currentUid) return;
      const p = _fertBagPos(W, H), s = _fertBagSize(W, H);
      const n = farmFertCount();
      const cx = p.x * W, cy = p.y * H;
      const armed = _fertArmed || !!_fertDrag;
      ctx.save();
      if (!n && !armed) ctx.globalAlpha = 0.62;         // empty: still there, plainly idle
      _drawFarmBaseShadow(ctx, cx, cy + s * 0.44, s * 0.46, s * 0.13, night, pal);
      // body — a sack is a trapezium with a rolled rim, wider at the foot
      const bw = s * 0.72, bh = s * 0.82, x0 = cx - bw / 2, y0 = cy - bh * 0.55;
      const g = ctx.createLinearGradient(x0, y0, x0 + bw, y0 + bh);
      g.addColorStop(0, night ? '#8a7550' : '#cbb083');
      g.addColorStop(1, night ? '#5d4c33' : '#9c8259');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 + bw * 0.14, y0);
      ctx.lineTo(x0 + bw * 0.86, y0);
      ctx.lineTo(x0 + bw, y0 + bh);
      ctx.lineTo(x0, y0 + bh);
      ctx.closePath(); ctx.fill();
      // rolled-down rim
      ctx.fillStyle = night ? '#6d5b3c' : '#b39868';
      ctx.beginPath();
      ctx.ellipse(cx, y0, bw * 0.40, s * 0.10, 0, 0, Math.PI * 2);
      ctx.fill();
      // compost heaped in the mouth
      ctx.fillStyle = night ? '#3f2d1a' : '#5a4126';
      ctx.beginPath();
      ctx.ellipse(cx, y0 - s * 0.02, bw * 0.30, s * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      // a couple of shoots, so it reads as compost and not as flour
      ctx.strokeStyle = night ? '#5c8a3a' : '#7fc04b';
      ctx.lineWidth = Math.max(1, s * 0.045); ctx.lineCap = 'round';
      [[-0.16, -0.20], [0.10, -0.26]].forEach(function (o) {
        ctx.beginPath();
        ctx.moveTo(cx + bw * o[0], y0 - s * 0.02);
        ctx.quadraticCurveTo(cx + bw * o[0] * 1.6, y0 + s * o[1], cx + bw * o[0] * 2.1, y0 + s * (o[1] - 0.06));
        ctx.stroke();
      });
      ctx.restore();
      // count, on the sack
      const fs = Math.max(10, s * 0.30);
      ctx.save();
      ctx.font = '800 ' + Math.round(fs) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(28,20,10,.72)';
      const bwn = ctx.measureText(String(n)).width + fs * 0.9, bhn = fs + 6;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - bwn / 2, cy + bh * 0.06, bwn, bhn, bhn / 2);
      else ctx.rect(cx - bwn / 2, cy + bh * 0.06, bwn, bhn);
      ctx.fill();
      ctx.fillStyle = n ? '#ffe9b0' : '#c9b899';
      ctx.fillText(String(n), cx, cy + bh * 0.06 + bhn / 2 + 0.5);
      ctx.restore();
      // Armed: a pulsing ring, the same amber the farm uses for "this is live".
      if (armed) {
        const pulse = 0.5 + Math.sin(t / 240) * 0.28;
        ctx.save();
        ctx.strokeStyle = 'rgba(126,220,110,' + pulse.toFixed(3) + ')';
        ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.72, s * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }


    // Zones animals must not walk into: the machine huts. Locked huts count too —
    // they are still buildings standing on the grass, so walking through one
    // would give the game away. (The merchant is now an aeroplane that hovers in
    // the sky, so it no longer blocks the pasture.)
    function _farmBlockedZones() {
      return FARM_MACHINES.map((m, slot) => {
        const p = _workshopPos(slot);
        return { x: p.x, y: p.y, r: 0.10 };
      });
    }
    function _inBlocked(x, y, zones, pad) {
      for (const z of zones) if (Math.hypot(z.x - x, z.y - y) < z.r + (pad || 0)) return true;
      return false;
    }

    /* ── Locked buildings ──
       Everything buyable stands on the land from the moment its ground is
       owned; unowned ones draw faded with a padlock, and tapping one opens the
       unlock modal. The panel used to hide the farm's future: a player who had
       never built the Forge had no idea a Forge existed, and a bought machine
       appeared out of nowhere on grass that had looked empty.

       The padlock is DRAWN, not the 🔒 emoji — an emoji renders differently on
       every device, and it would be the one thing on a faded building that
       can't be told to stay at full strength. */
    const FARM_LOCK_ALPHA = 0.42;    // how faded a locked building draws
    function _drawFarmPadlock(ctx, cx, cy, s) {
      const bw = s * 0.82, bh = s * 0.62, bx = cx - bw / 2, by = cy - bh * 0.28;
      ctx.save();
      ctx.globalAlpha = 1;           // sits on top of a faded building at full strength
      // shackle, with a shaded left limb so it reads as a loop and not a bar
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d7dee6'; ctx.lineWidth = Math.max(1.6, s * 0.14);
      ctx.beginPath(); ctx.arc(cx, by, bw * 0.30, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath(); ctx.arc(cx, by, bw * 0.30, Math.PI, Math.PI * 1.4); ctx.stroke();
      // brass body
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, '#ffd76a'); g.addColorStop(1, '#dd9c26');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, s * 0.16); else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,48,8,.5)'; ctx.lineWidth = 1; ctx.stroke();
      // keyhole
      ctx.fillStyle = 'rgba(66,40,8,.85)';
      ctx.beginPath(); ctx.arc(cx, by + bh * 0.38, s * 0.10, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - s * 0.045, by + bh * 0.38, s * 0.09, bh * 0.36);
      ctx.restore();
    }

    // Draw the machine huts on the pasture — owned normally, unbuilt faded with
    // a padlock on the door. All five always have their spot, so nothing shuffles
    // when one is bought and the farm always shows what it can become.
    function _drawWorkshopMachines(ctx, W, H, t, night, pal) {
      const machines = roomData.farmMachines || {};
      const now = Date.now();
      FARM_MACHINES.forEach((m, slot) => {
        const st = machines[m.id];
        const locked = !st || !st.owned;
        const p = _workshopPos(slot);
        const cx = p.x * W, cy = p.y * H, s = _workshopSize(W, H);
        const wallW = s * 0.78, wallH = s * 0.52, D = s * 0.24, dy = D * 0.5;
        const fx = cx - wallW / 2, fy = cy - s * 0.04;   // front wall top-left
        ctx.save();
        const _hkM = _farmHoverK('sky', m.id);           // pointed at → grows a little
        if (_hkM !== 1) { ctx.translate(cx, cy); ctx.scale(_hkM, _hkM); ctx.translate(-cx, -cy); }
        if (locked) ctx.globalAlpha = FARM_LOCK_ALPHA;   // still tappable, plainly inactive
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // ground shadow
        ctx.fillStyle = night ? 'rgba(0,0,0,.34)' : ((pal && pal.groundShadow) || 'rgba(30,62,20,.24)');
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

        /* Snow settles on a roof from the ridge DOWN, and it stops short of the
           eaves where it slid off — a roof painted white to the edge reads as a
           white roof, not a snowy one. So: the receding slope carries most of
           it, the gable gets a band along each rake, and a couple of lumps hang
           over the eave where it is about to drop. */
        if (pal && pal.roofSnow) {
          const sn = pal.roofSnow;
          ctx.fillStyle = sn;
          // the slope we look down on
          ctx.beginPath();
          ctx.moveTo(cx, rTop); ctx.lineTo(cx + D, rTop - dy);
          ctx.lineTo(fx + wallW + rOver + D - s * 0.05, fy - dy - s * 0.06);
          ctx.lineTo(fx + wallW + rOver - s * 0.05, fy - s * 0.06);
          ctx.closePath(); ctx.fill();
          // a band down each rake of the gable
          ctx.lineWidth = Math.max(2, s * 0.055); ctx.lineCap = 'round'; ctx.strokeStyle = sn;
          ctx.beginPath(); ctx.moveTo(fx - rOver + s * 0.02, fy - s * 0.01); ctx.lineTo(cx, rTop); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, rTop); ctx.lineTo(fx + wallW + rOver - s * 0.02, fy - s * 0.01); ctx.stroke();
          // the ridge, and what is hanging off the edge
          ctx.lineWidth = Math.max(2.5, s * 0.07);
          ctx.beginPath(); ctx.moveTo(cx, rTop); ctx.lineTo(cx + D, rTop - dy); ctx.stroke();
          ctx.fillStyle = sn;
          [[0.22, 0.030], [0.52, 0.022], [0.78, 0.026]].forEach(function (d2) {
            const ex = fx - rOver + (wallW + rOver * 2) * d2[0];
            ctx.beginPath(); ctx.ellipse(ex, fy + s * 0.005, s * d2[1] * 1.6, s * d2[1], 0, 0, Math.PI * 2); ctx.fill();
          });
        }
        // round sign on the gable, carrying the machine's own little drawing
        // (churn / oven / cleaver …) instead of an emoji.
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(cx, fy - s * 0.04, s * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; ctx.stroke();
        const _gimg = _buildImage(m.id), _gs = s * 0.30;
        if (_gimg && _gimg.complete && _gimg.naturalWidth > 0) {
          ctx.drawImage(_gimg, cx - _gs / 2, fy - s * 0.04 - _gs / 2, _gs, _gs);
        } else {
          ctx.font = Math.round(s * 0.22) + 'px serif'; ctx.fillText(m.emoji, cx, fy - s * 0.03);
        }
        // Unbuilt: a padlock on the door, and no job state to show.
        if (locked) { _drawFarmPadlock(ctx, cx, ddy + dh * 0.42, s * 0.30); ctx.restore(); return; }
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

    /* ══ Side land ══════════════════════════════════════════════════════════
       Left plot: the compost yard. Right plot: three ageing factories with the
       tier-2 buyer in front of them. Positions are LAND coordinates — the farm
       itself is 0..1, the left plot -0.5..0 and the right plot 1..1.5 — so they
       slide with the camera like everything else standing on the ground.

       None of these use an emoji or a sign. The five tier-1 huts share one hut
       shape and are told apart by a badge on the gable, which works for a row
       of five identical sheds; here each building is its own silhouette, so it
       says what it is instead of wearing a label. That also gives the two tiers
       a visual difference matching the mechanical one, and keeps them legible
       when they are dimmed and their colour is washed out. */
    /* ── Where the plot buildings stand, and how big ──
       They used to sit on one dead-straight row each — same y, even x spacing,
       and all at _workshopSize — which is what made a plot read as a spreadsheet
       row rather than a yard. Each building now has its own x AND y, and y is
       also what drives its size: lower on the stage is nearer, so it draws
       bigger. That one rule supplies the depth the plots had none of.

       Bin order still runs left to right, because compost fills them in order
       and the yard is meant to read full → half → empty across.

       A plot is only ever bought with the pasture maxed, so _farmDivY() is
       pinned at 0.68 here: the grass runs 0.26–0.68 and these all sit inside it
       with room to spare. */
    /* A plot is laid out in units of its buildings' own size, measured out from
       the plot's centre — NOT as fixed fractions of the window.

       Fixed fractions were the bug behind buildings standing on each other. The
       x positions were fractions of W while the size came from min(W,H), so as
       the window narrowed the gaps closed while the buildings kept their size.
       Measured on the tables that replaced: the buyer covered 24% of the third
       factory on a 1280 stage and 32% on a 900 one, and the first factory hung
       over the plot's edge. Laid out this way the composition is the same shape
       at every stage size, because every distance in it scales with the thing it
       is separating.

       `lane` runs -1 … +1 across the plot. y is still absolute, because it is
       depth: it decides both the row and, through _plotDepth, the size.

       The buyer sits slightly LEFT of centre on purpose. It is the biggest thing
       on the plot and it stands at the front, so whatever is behind it at the
       same lane gets hidden — the tall smokehouse survives that (its roof clears
       the awning) but the smoke pit is a flat thing on the ground and simply
       disappeared. Offsetting the buyer leaves the pit's lane clear. */
    const FARM_BIN_LANES  = [{ lane: -1, y: 0.36 }, { lane: 0, y: 0.52 }, { lane: 1, y: 0.43 }];
    const FARM_AGER_LANES = [{ lane: -1, y: 0.38 }, { lane: 0, y: 0.35 }, { lane: 1, y: 0.42 }];
    const FARM_BUYER_LANE = { lane: -0.30, y: 0.58 };

    function _plotCentre(side) { return side === 'L' ? -FARM_LAND_STEP / 2 : 1 + FARM_LAND_STEP / 2; }
    // How far the outer lanes sit from the centre: as wide as the plot allows,
    // capped so a wide stage does not fling them apart, and floored so a narrow
    // one still separates them.
    function _plotSpread(W, H) {
      const s = _plotBuildSize(W, H), half = (FARM_LAND_STEP * W) / 2;
      return Math.min(2.6 * s, Math.max(s * 0.9, half - s * 0.8));
    }
    function _plotSpot(side, item, W, H) {
      return { x: _plotCentre(side) + (item.lane * _plotSpread(W, H)) / W, y: item.y };
    }
    function _binPos(i, W, H)  { return _plotSpot('L', FARM_BIN_LANES[i], W, H); }
    function _agerPos(i, W, H) { return _plotSpot('R', FARM_AGER_LANES[i], W, H); }
    function _buyerPos(W, H)   { return _plotSpot('R', FARM_BUYER_LANE, W, H); }

    /* Plot buildings get their own base size. _workshopSize is tuned for five
       huts sharing the pasture with the pens, the herd and the trough; a plot
       holds three or four buildings and nothing else at all, so at that size
       they read as models dropped in an empty field.

       Capped so that three of them plus their gaps fit across the plot — that
       divisor is what keeps the lanes above from ever running off the edge. */
    function _plotBuildSize(W, H) {
      return Math.max(40, Math.min(Math.min(W, H) * 0.185, (FARM_LAND_STEP * W) / 4.9));
    }
    // Depth from height on the stage: the far end of the band is 0.85x, the near
    // end 1.28x. Nothing else in the scene needs to change for the plots to stop
    // looking flat.
    function _plotDepth(y) {
      const k = Math.max(0, Math.min(1, (y - 0.34) / (0.60 - 0.34)));
      return 0.85 + k * 0.43;
    }
    function _plotSizeAt(y, W, H) { return _plotBuildSize(W, H) * _plotDepth(y); }

    /* A plot building's tap rect. These were point targets sharing one 44px
       reach, which was about right while every building was 51px; now that they
       differ in size a point would leave the top of a near, large one
       untappable. Generous on the right and above, which is where the 3/4 depth
       offset and the roofs go. */
    function _plotTapRect(id, p, s, W, H) {
      const cx = p.x * W, cy = p.y * H;
      return { id: id,
        x0: (cx - s * 0.60) / W, x1: (cx + s * 0.80) / W,
        y0: (cy - s * 0.90) / H, y1: (cy + s * 0.50) / H };
    }

    // Bins unlocked. The plot always comes with one; 0 means the plot is unbought.
    function _compostBins() {
      return roomData.farmLandL ? Math.max(1, Math.min(FARM_COMPOST_BINS_MAX, roomData.farmCompostBins || 1)) : 0;
    }
    function _compostCap() { return _compostBins() * FARM_COMPOST_PER_BIN; }
    // How full bin `i` is, 0..1. Compost fills the unlocked bins in order, so a
    // partly-filled yard reads left to right: full, half, empty.
    /* What the yard holds RIGHT NOW, for display: the settled figure plus the
       time since it was settled. _settleCompost only runs on the 60s farm tick
       and on a tap, so reading roomData.farmCompost straight made the bins step
       once a minute; this makes them move with the clock. It never writes, so it
       cannot double-count against the settle that does. */
    function _compostNow() {
      const base = roomData.farmCompost || 0;
      const herd = (roomData.farmAnimals || []).length;
      if (!roomData.farmCompostAt || !herd) return Math.min(_compostCap(), base);
      const hours = Math.max(0, Date.now() - roomData.farmCompostAt) / 3600000;
      return Math.min(_compostCap(), base + herd * FARM_COMPOST_PER_ANIMAL_HR * hours);
    }
    function _binFill(i) {
      const left = _compostNow() - i * FARM_COMPOST_PER_BIN;
      return Math.max(0, Math.min(1, left / FARM_COMPOST_PER_BIN));
    }

    /* Whether the yard has a +1 to show. The +1 means "a whole unit was just
       GAINED", and it is derived rather than remembered: _unitCrossedAgo reads
       a value sitting on a whole number as a crossing that happened this
       instant. Collecting empties the yard onto exactly 0 — a whole number —
       so tapping a full bin threw a +1 up at the same moment the toast said it
       had collected ten, over a yard that had just gone DOWN by ten.

       You cannot have just gained your zeroth unit. Hold the pop until the yard
       is carrying a whole one, which is also the first honest thing it can
       announce. The trough holds its −1 after a refill for the same reason. */
    function _compostPopDue(yard) {
      return Math.floor(yard) >= 1;
    }

    // A slow rising wisp — the machines' steam loop, re-coloured and re-timed.
    // Used by a full compost bin (brown, slow) and the smokehouse (grey).
    function _drawFarmWisp(ctx, cx, topY, s, t, colour, rate) {
      ctx.fillStyle = colour;
      for (let k = 0; k < 3; k++) {
        const yy = topY - k * s * 0.14 - ((t / rate) % (s * 0.14));
        ctx.beginPath();
        ctx.arc(cx + Math.sin(t / 520 + k) * s * 0.05, yy, s * 0.055 - k * s * 0.009, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // "Something is ready in here" — a small amber lamp with a soft glow, pulsing
    // slowly. The huts show a ✅; these buildings say it in their own art.
    function _drawFarmReadyLamp(ctx, cx, cy, s, t) {
      const pulse = 0.72 + Math.sin(t / 420) * 0.28;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.32);
      g.addColorStop(0, 'rgba(255,196,84,' + (0.55 * pulse).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,196,84,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd06a';
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.075, 0, Math.PI * 2); ctx.fill();
    }
    /* ── The farm's meter badge ──
       A dark pill holding the figure, with a coloured track behind it showing
       how full the thing is. The compost bins wear one; so does the trough,
       which until now carried no number on the canvas at all — only a hover
       tooltip, which is no answer on a phone.

       Two tracks, because the two things worth knowing move at wildly different
       speeds. The BACKGROUND track is the level — ten units wide on a bin, and
       therefore about eight pixels an hour, which is a state readout and not
       motion. The thin SLIVER along the bottom is the next unit's progress: it
       crosses the same width every few minutes, so there is always something
       visibly moving, and when it finishes the number really does change.

       `hot` turns it amber for the state worth crossing the farm for: a full
       bin (stopped earning) or an empty trough (stopped feeding). */
    function _drawMeterBadge(ctx, cx, topY, txt, fill, fs, night, hot, sub, minX) {
      ctx.save();
      ctx.font = '800 ' + Math.round(fs) + 'px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const pad = 6, bw = ctx.measureText(txt).width + pad * 2, bh = fs + 7;
      // `minX` keeps a badge wider than the thing it labels on the land. The
      // trough sits at x=0.085 and its badge is nearly as wide as the trough,
      // so on a phone with an upgraded trough it hung off the west edge of the
      // farm. Clamped to the LAND, not the viewport — a badge that slid about
      // as you panned would be the "it follows you" problem all over again.
      const bx = minX != null ? Math.max(minX, cx - bw / 2) : cx - bw / 2, by = topY;
      const pill = function () {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, bh / 2); else ctx.rect(bx, by, bw, bh);
      };
      pill();
      ctx.fillStyle = night ? 'rgba(20,14,6,0.82)' : 'rgba(40,26,12,0.78)';
      ctx.fill();
      if (fill > 0 || sub != null) {
        ctx.save();
        pill(); ctx.clip();
        if (fill > 0) {
          // Dimmer where the sliver has to be read over it — two greens at the
          // same weight made the moving one indistinguishable from the still one.
          ctx.fillStyle = hot ? 'rgba(255,196,106,0.42)'
            : (sub != null ? 'rgba(126,220,110,0.22)' : 'rgba(126,220,110,0.30)');
          ctx.fillRect(bx, by, bw * Math.min(1, fill), bh);
        }
        if (sub != null) {
          const sh = Math.max(3, bh * 0.22);
          ctx.fillStyle = 'rgba(0,0,0,0.45)';                     // its own dark track
          ctx.fillRect(bx, by + bh - sh, bw, sh);
          ctx.fillStyle = hot ? '#ffc46a' : '#a8f57a';
          ctx.fillRect(bx, by + bh - sh, bw * Math.max(0, Math.min(1, sub)), sh);
        }
        ctx.restore();
      }
      ctx.fillStyle = hot ? '#ffc46a' : '#ffe9b0';
      ctx.fillText(txt, bx + pad, by + bh / 2 + 0.5);
      ctx.restore();
      return { bx: bx, by: by, bw: bw, bh: bh };
    }

    /* A −1 lifting off the trough the instant a whole unit of feed comes off it,
       and a +1 off the compost yard when one lands. The badge is the STATE; this
       is the EVENT, and the event is the only part that reads as movement when
       the underlying rate is a unit every few minutes. Age comes from
       _unitCrossedAgo, so this draws itself from the clock with nothing stored. */
    const FARM_UNIT_POP_MS = 1500;
    function _drawUnitPop(ctx, cx, cy, s, ageMs, txt, colour) {
      if (ageMs < 0 || ageMs > FARM_UNIT_POP_MS) return;
      const k = ageMs / FARM_UNIT_POP_MS;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.8);          // hold, then fade
      ctx.font = '800 ' + Math.round(Math.max(11, s * 0.30)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Straight up out of the badge, a short lift of about one text height.
      // Beside the badge was the other option and it is the worse one: the
      // trough's badge is nearly as wide as the trough, so anything hung off
      // its right edge falls off the land at the left end of the farm.
      const y = cy - k * s * 0.30;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,4,.6)'; ctx.lineJoin = 'round';
      ctx.strokeText(txt, cx, y);
      ctx.fillStyle = colour;
      ctx.fillText(txt, cx, y);
      ctx.restore();
    }

    // The soft ground shadow every building on the farm stands on.
    function _drawFarmBaseShadow(ctx, cx, cy, rx, ry, night, pal) {
      ctx.fillStyle = night ? 'rgba(0,0,0,.34)' : ((pal && pal.groundShadow) || 'rgba(30,62,20,.24)');
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }

    /* ── Three-quarter view for the plot buildings ──
       ONE projection for the whole plot: depth runs back and to the RIGHT,
       climbing the screen as it goes. Light comes from the front-left and
       above, so every solid is three tones — top lightest, front middle, right
       face darkest — and every ground shadow leans the same way.

       Two faces read as a sticker propped up on the grass. The third face, and
       the fact that all of them agree about where the sun is, is the whole
       difference: the compost bins already had it, the ageing plot did not, and
       side by side the ageing plot looked painted on. */
    const PLOT_DEPTH = 0.22;                       // depth as a share of the piece's size
    const PLOT_RISE = 0.55;                        // how far that depth climbs
    function _plotD(s) { const D = s * PLOT_DEPTH; return { D: D, dy: D * PLOT_RISE }; }

    // A box: right face, top cap, front face, then a catch-light along the two
    // top ridges. `edge` is optional — pass null for a piece in shadow.
    function _plotBox(ctx, x0, y0, w, h, D, dy, front, right, top, edge) {
      ctx.beginPath();
      ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w + D, y0 - dy);
      ctx.lineTo(x0 + w + D, y0 - dy + h); ctx.lineTo(x0 + w, y0 + h);
      ctx.closePath(); ctx.fillStyle = right; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + D, y0 - dy);
      ctx.lineTo(x0 + w + D, y0 - dy); ctx.lineTo(x0 + w, y0);
      ctx.closePath(); ctx.fillStyle = top; ctx.fill();
      ctx.fillStyle = front; ctx.fillRect(x0, y0, w, h);
      if (edge) {
        ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, D * 0.1); ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + D, y0 - dy); ctx.lineTo(x0 + w + D, y0 - dy);
        ctx.stroke();
      }
    }

    /* A recess: the same opening cut twice, the inner copy pushed back along the
       depth axis, so you see the thickness of the wall on its left and bottom.
       An opening drawn as one flat shape is a hole painted on a wall; this is a
       hole IN one. `shape(x, y)` draws the outline at an offset. */
    function _plotRecess(ctx, shape, D, dy, wall, dark) {
      ctx.fillStyle = wall;                        // the wall's cut thickness
      shape(0, 0); ctx.fill();
      ctx.fillStyle = dark;                        // the inside, set back
      shape(D * 0.34, -dy * 0.34); ctx.fill();
    }

    /* ── The compost yard (left plot) ──
       An open slat box. The FILL LEVEL is the readout — no number, no badge: a
       full bin heaps over the rim and steams, and a full bin is one that has
       stopped earning, so it should catch the eye from across the plot. */
    function _drawCompostBin(ctx, cx, cy, s, fill, locked, night, pal, t, working) {
      const w = s * 0.94, h = s * 0.56, D = s * 0.24, dy = D * 0.5;
      const x0 = cx - w / 2, y0 = cy - h * 0.4;          // y0 = top of the front wall
      ctx.save();
      if (locked) ctx.globalAlpha = FARM_LOCK_ALPHA;
      _drawFarmBaseShadow(ctx, cx + D * 0.4, y0 + h + s * 0.03, w * 0.62, s * 0.11, night, pal);
      // dark interior seen through the open top
      ctx.fillStyle = night ? '#241a12' : '#3d2b1c';
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0);
      ctx.lineTo(x0 + w + D, y0 - dy); ctx.lineTo(x0 + D, y0 - dy);
      ctx.closePath(); ctx.fill();
      // the heap, growing out of the box as it fills
      if (fill > 0.02) {
        const hh = s * 0.34 * fill;
        const mg = ctx.createLinearGradient(0, y0 - dy - hh, 0, y0);
        mg.addColorStop(0, night ? '#5a4227' : '#7d5c33');
        mg.addColorStop(1, night ? '#332515' : '#4a3520');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.moveTo(x0 + s * 0.04, y0 - dy * 0.4);
        ctx.quadraticCurveTo(cx + D * 0.5, y0 - dy - hh, x0 + w + D - s * 0.04, y0 - dy * 0.4);
        ctx.lineTo(x0 + w - s * 0.02, y0 - dy * 0.1);
        ctx.lineTo(x0 + s * 0.06, y0 - dy * 0.1);
        ctx.closePath(); ctx.fill();
        // a few shoots once it is heaped up
        if (fill > 0.85) {
          ctx.strokeStyle = night ? '#5c8a3a' : '#7fc04b';
          ctx.lineWidth = Math.max(1, s * 0.03); ctx.lineCap = 'round';
          [[-0.16, 0.72], [0.04, 1], [0.2, 0.8]].forEach(function (sh) {
            const bx = cx + D * 0.5 + w * sh[0], by = y0 - dy - hh * sh[1] * 0.7;
            ctx.beginPath(); ctx.moveTo(bx, by + s * 0.08);
            ctx.quadraticCurveTo(bx + s * 0.03, by, bx + s * 0.07, by - s * 0.02); ctx.stroke();
          });
        }
      }
      // right-hand face, then the front planks over it
      ctx.fillStyle = night ? '#5b452e' : '#8d6a44';
      ctx.beginPath();
      ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w + D, y0 - dy);
      ctx.lineTo(x0 + w + D, y0 - dy + h); ctx.lineTo(x0 + w, y0 + h);
      ctx.closePath(); ctx.fill();
      const pg = ctx.createLinearGradient(0, y0, 0, y0 + h);
      pg.addColorStop(0, night ? '#8a6a45' : '#c79a63');
      pg.addColorStop(1, night ? '#6a4f31' : '#a67c4c');
      ctx.fillStyle = pg; ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1;     // plank seams
      for (let k = 1; k < 3; k++) {
        const yy = y0 + (h * k) / 3;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke();
      }
      // rim board and the two corner posts standing proud of it
      ctx.fillStyle = night ? '#6d5335' : '#b98b55';
      ctx.fillRect(x0 - s * 0.02, y0 - s * 0.03, w + s * 0.04, s * 0.055);
      ctx.fillStyle = night ? '#5b452e' : '#96703f';
      ctx.fillRect(x0 - s * 0.02, y0 - s * 0.07, s * 0.09, h + s * 0.07);
      ctx.fillRect(x0 + w - s * 0.07, y0 - s * 0.07, s * 0.09, h + s * 0.07);
      /* Steam. A heap that is rotting down is warm, so the wisp is the bin's own
         way of saying it is WORKING — the bin currently taking compost gets a
         faint slow one, which answers "is anything even happening in there?"
         without a number. A brim-full bin keeps the stronger, quicker wisp it
         always had: that one means STOPPED, and it reads louder for a reason. */
      if (fill > 0.98) _drawFarmWisp(ctx, cx + D * 0.4, y0 - s * 0.42, s, t, 'rgba(158,128,86,.34)', 110);
      else if (working) _drawFarmWisp(ctx, cx + D * 0.4, y0 - s * 0.30, s, t, 'rgba(176,150,108,.26)', 175);
      if (locked) _drawFarmPadlock(ctx, cx, y0 + h * 0.5, s * 0.30);
      ctx.restore();
    }

    /* ── The floor each plot stands on ──
       Three objects adrift in an untouched field is what made the plots feel
       monotonous: over half of each one was plain grass, identical to the grass
       either side of it, so nothing said a yard was there at all. A worn floor
       under the buildings turns a group of props into a place, gives the two
       plots different ground from each other AND from the pasture, and costs a
       handful of overlapping ellipses.

       Drawn before the buildings, so their own base shadows land on top of it. */
    function _plotFloor(ctx, W, H, spots, night, pal, kind, side) {
      const base = _plotBuildSize(W, H);
      /* ONE continuous floor across the whole group. A blob per building was the
         first attempt and it read as a second shadow round each one — it made
         them look more isolated, not less. What ties a yard together is the
         ground being different from the field, everywhere between the things
         standing on it. */
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      spots.forEach(function (p) {
        const s = base * _plotDepth(p.y);
        x0 = Math.min(x0, p.x * W - s * 1.0); x1 = Math.max(x1, p.x * W + s * 1.1);
        y0 = Math.min(y0, p.y * H - s * 0.10); y1 = Math.max(y1, p.y * H + s * 0.60);
      });
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      const rgb = kind === 'stone' ? (night ? '44,48,56' : '126,127,130')
                                   : (night ? '46,34,22' : '115,88,56');
      ctx.save();
      /* Clip to this plot. The floor is sized off the buildings plus their own
         width, and the near ones are large, so the left edge of the right plot's
         apron reached about 20px PAST the boundary — i.e. onto the farm's own
         grass, which nothing on a plot is allowed to touch. */
      const cl0 = (side === 'L' ? -_farmLandL() : 1) * W;
      const cl1 = (side === 'L' ? 0 : 1 + _farmLandR()) * W;
      ctx.beginPath(); ctx.rect(cl0, 0, cl1 - cl0, H); ctx.clip();
      /* A radial fade, not a filled ellipse with a rim. A hard elliptical edge
         reads as a dish sunk into the field; ground that thins out toward its
         edge reads as ground. Drawn as a circle under a scale, because a radial
         gradient is always circular. */
      const r = Math.max(rx, ry, 1);
      ctx.save();   // NOT setTransform to undo — that would wipe the camera too
      ctx.translate(cx, cy); ctx.scale(rx / r, ry / r);
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, 'rgba(' + rgb + ',0.62)');
      g.addColorStop(0.62, 'rgba(' + rgb + ',0.55)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Scatter: straw on the compost floor, loose cobbles on the stone one.
      // Hashed off the index so it never crawls between frames.
      const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
      spots.forEach(function (p, i) {
        const s = base * _plotDepth(p.y);
        for (let k = 0; k < 7; k++) {
          const a = hash(i * 9.7 + k), b = hash(i * 4.1 + k * 3.3 + 1.7);
          const x = p.x * W + (a - 0.45) * s * 1.9, y = p.y * H + s * (0.16 + b * 0.42);
          if (kind === 'stone') {
            ctx.fillStyle = night ? 'rgba(74,78,88,0.55)' : 'rgba(150,152,156,0.55)';
            ctx.beginPath(); ctx.ellipse(x, y, s * 0.09, s * 0.05, a * 3, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.strokeStyle = night ? 'rgba(122,102,62,0.45)' : 'rgba(196,168,96,0.55)';
            ctx.lineWidth = Math.max(1, s * 0.022); ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x + (a - 0.5) * s * 0.26, y - s * 0.05);
            ctx.stroke();
          }
        }
      });
      ctx.restore();
    }

    /* Each bin's own level, over its own bin, always — the number used to be
       hover-only, which is no answer at all on a phone. Same badge shape the pen
       counts use, so it reads as the farm's own labelling and not an overlay.

       A LOCKED bin gets no badge: it holds nothing, and "0/10" over a padlocked
       bin says "empty" when the truth is "not yours yet". The padlock is the
       whole message there.

       A FULL bin has stopped earning, which is the one state worth crossing the
       farm for, so it says so three ways: the badge turns amber, the heap grows
       shoots and steams (in _drawCompostBin), and it gets the same pulsing amber
       lamp every other building on the farm uses for "something is ready here". */
    // `sub` only on the bin compost is actually landing in — a bin that is
    // already full or not yet reached has no next unit coming, and a sliver
    // sitting still under two of the three badges would say the opposite.
    function _drawBinBadge(ctx, cx, cy, s, fill, night, t, sub) {
      const cap = FARM_COMPOST_PER_BIN, full = fill >= 1;
      const b = _drawMeterBadge(ctx, cx, cy - s * 0.98,   // clear of the heaped-up rim
        Math.floor(fill * cap) + '/' + cap, fill,
        Math.max(10, Math.min(15, s * 0.24)), night, full, sub);
      if (full) _drawFarmReadyLamp(ctx, b.bx + b.bw + s * 0.16, b.by + b.bh / 2, s, t);
      return b;
    }

    function _drawCompostYard(ctx, W, H, t, night, pal) {
      if (!roomData.farmLandL) return;
      _plotFloor(ctx, W, H, FARM_BIN_LANES.map(function (b, i) { return _binPos(i, W, H); }), night, pal, 'earth', 'L');
      const bins = _compostBins();
      // The bin compost is landing in right now: the first one not yet full,
      // and only while the yard is actually gaining. It gets the working steam,
      // and it is where the +1 lifts off.
      const yard = _compostNow(), rate = _compostPerHr();
      const fillingIdx = rate > 0 ? Math.min(bins - 1, Math.floor(yard / FARM_COMPOST_PER_BIN)) : -1;
      // Far to near, so a nearer bin overlaps the one behind it rather than the
      // other way round — the overlap is most of what sells the depth.
      const order = FARM_BIN_LANES.map(function (p, i) { return i; })
        .sort(function (a, b) { return FARM_BIN_LANES[a].y - FARM_BIN_LANES[b].y; });
      let fillingBadge = null;
      order.forEach(function (i) {
        const p = _binPos(i, W, H), s = _plotSizeAt(p.y, W, H);
        const open = i < bins;
        _hoverScaled(ctx, _farmHoverK('sky', '#bin' + i), p.x * W, p.y * H, function () {
          _drawCompostBin(ctx, p.x * W, p.y * H, s, open ? _binFill(i) : 0, !open, night, pal, t, i === fillingIdx);
        });
        // Badge outside _hoverScaled so pointing at a bin does not scale the
        // text, and after the bin so it is never drawn behind its own heap.
        if (open) {
          const b = _drawBinBadge(ctx, p.x * W, p.y * H, s, _binFill(i), night, t,
            i === fillingIdx ? _unitFrac(yard, true) : null);
          if (i === fillingIdx) fillingBadge = { box: b, s: s };
        }
      });
      // +1 off the badge of the bin taking it, when the yard gains a whole unit.
      if (fillingBadge && _compostPopDue(yard)) {
        const fs = Math.max(10, Math.min(15, fillingBadge.s * 0.24));
        _drawUnitPop(ctx, fillingBadge.box.bx + fillingBadge.box.bw / 2,
          fillingBadge.box.by - fs * 0.45, fs * 3.4,
          _unitCrossedAgo(yard, rate, true), '+1', '#c6f09a');
      }
    }

    /* ── The three ageing factories (right plot) ──
       Told apart by SHAPE, which is what still works when they are dimmed:
       a round-topped cave, a tall narrow shed, and a thing with no walls at all. */
    function _agerJobState(id) {
      const m = _machineState(id);              // resolves the free Cheese Cave too
      if (!m || !Array.isArray(m.jobs)) return { ready: false, busy: false };
      const def = _farmBuildDef(id), now = Date.now();
      let ready = false, busy = false;
      m.jobs.forEach(function (j) {
        if (!j) return;
        const rec = (def.recipes || [])[j.r || 0] || def.recipes[0];
        if (now - j.at >= rec.timeMs) ready = true; else busy = true;
      });
      return { ready: ready, busy: busy };
    }

    // 1 — Cheese Cave: a stone arch set into a grassy mound. The only round-topped
    // building on the farm; everything else is gabled or square.
    function _drawCheeseCave(ctx, cx, cy, s, night, pal, t, st) {
      const r = s * 0.72, D = _plotD(s).D, dy = _plotD(s).dy;
      const ay = cy + s * 0.3;                     // ground line at the mouth
      _drawFarmBaseShadow(ctx, cx + D * 0.45, ay + s * 0.04, r * 1.02, s * 0.12, night, pal);

      /* The mound as a DOME. It used to be a half-ellipse under a top-to-bottom
         gradient, which is the shading a cylinder has, not a hill: evenly lit
         all the way across, so the thing had a silhouette and no volume. A
         radial highlight up and to the left — where this plot's sun is — plus a
         terminator curving away to the right is what turns it round. */
      const dome = ctx.createRadialGradient(
        cx - r * 0.34, ay - r * 0.62, r * 0.06, cx - r * 0.1, ay - r * 0.24, r * 1.24);
      dome.addColorStop(0, night ? '#4e6f3c' : '#a3d16a');
      dome.addColorStop(0.45, night ? '#3c5830' : '#7cae4e');
      dome.addColorStop(1, night ? '#243a1d' : '#456d2b');
      ctx.fillStyle = dome;
      ctx.beginPath(); ctx.ellipse(cx, ay, r, r * 0.86, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(cx - r, ay - 1, r * 2, s * 0.05);
      // Where the hill meets its own ground: a soft dark band, so it is planted
      // in the grass rather than sitting on it.
      ctx.fillStyle = night ? 'rgba(0,0,0,.22)' : 'rgba(28,54,18,.20)';
      ctx.beginPath(); ctx.ellipse(cx, ay + s * 0.03, r * 0.99, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();

      /* A stone SURROUND, only as wide as the arch needs. A full facade wall was
         the first attempt and it cost the building its identity: the grey slab
         covered the hill, and the one round-topped building on the farm became
         a grey box with a hole in it. The portal is what needs thickness — the
         hill just needs to be round. */
      const aw = s * 0.52, ah = s * 0.56, ax = cx - aw / 2;
      const fw = aw + s * 0.26, fh = ah * 0.62, fx = cx - fw / 2, fyTop = ay - fh;
      _plotBox(ctx, fx, fyTop, fw, fh, D * 0.5, dy * 0.5,
        night ? '#6a635b' : '#b6ada0', night ? '#4c463f' : '#8d8477',
        night ? '#7c746a' : '#cdc4b5', night ? 'rgba(255,240,210,.14)' : 'rgba(255,250,236,.42)');

      // The mouth, cut through that surround: the inner copy is pushed back
      // along the depth axis, which is what shows the stone's thickness.
      const mouth = function (ox, oy) {
        ctx.beginPath();
        ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(ax + ox, ay + oy - ah * 0.5);
        ctx.arc(cx + ox, ay + oy - ah * 0.5, aw / 2, Math.PI, 0);
        ctx.lineTo(ax + aw + ox, ay + oy); ctx.closePath();
      };
      _plotRecess(ctx, mouth, D * 0.5, dy * 0.5,
        night ? '#4a443d' : '#7f776a', night ? '#0d0a06' : '#241a11');
      if (st.busy || st.ready) {   // warm light from inside
        const g = ctx.createRadialGradient(cx, ay - ah * 0.35, 0, cx, ay - ah * 0.35, aw * 0.62);
        g.addColorStop(0, 'rgba(255,178,86,.42)'); g.addColorStop(1, 'rgba(255,178,86,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, ay - ah * 0.35, aw * 0.62, 0, Math.PI * 2); ctx.fill();
      }

      // Voussoirs, lit round the top-left of the arch and shaded round the right.
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI + (Math.PI * k) / 6;
        const sx = cx + Math.cos(a) * (aw / 2 + s * 0.07), sy = ay - ah * 0.5 + Math.sin(a) * (aw / 2 + s * 0.07);
        const lit = Math.cos(a + Math.PI * 0.25) < 0;      // face turned toward the sun
        ctx.fillStyle = lit ? (night ? '#7d766e' : '#d2c9ba') : (night ? '#5d5750' : '#9d9488');
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-s * 0.075, -s * 0.055, s * 0.15, s * 0.11, s * 0.02);
        else ctx.rect(-s * 0.075, -s * 0.055, s * 0.15, s * 0.11);
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
      // Footing stones, each a little box of its own.
      [-1, 1].forEach(function (side) {
        const bx = side < 0 ? ax - s * 0.13 : ax + aw + s * 0.02;
        _plotBox(ctx, bx, ay - s * 0.12, s * 0.11, s * 0.12, D * 0.4, dy * 0.4,
          night ? '#5f5a55' : '#a79f93', night ? '#494440' : '#867e72',
          night ? '#6f6a63' : '#bdb5a7', null);
      });
      // Grass over the crown, so the hill reads as turf and not a painted lump.
      ctx.strokeStyle = night ? '#4a6a38' : '#8fc45c';
      ctx.lineWidth = Math.max(1, s * 0.022); ctx.lineCap = 'round';
      [[-0.62, 0.34], [-0.36, 0.62], [0.34, 0.60], [0.63, 0.30]].forEach(function (g2) {
        const gx = cx + r * g2[0], gy = ay - r * 0.86 * Math.sqrt(Math.max(0, 1 - g2[0] * g2[0])) * 0.96;
        ctx.beginPath(); ctx.moveTo(gx, gy + s * 0.02);
        ctx.quadraticCurveTo(gx + s * 0.02, gy - s * 0.04, gx + s * 0.05 * g2[1], gy - s * 0.07); ctx.stroke();
      });
      if (st.ready) _drawFarmReadyLamp(ctx, cx, fyTop - s * 0.14, s, t);
    }

    // 2 — Smokehouse: tall and narrow, the inverse of the wide tier-1 huts, so
    // the two can never be confused at small size.
    function _drawSmokehouse(ctx, cx, cy, s, night, pal, t, st) {
      const w = s * 0.54, h = s * 0.92, dd = _plotD(s), D = dd.D, dy = dd.dy;
      const x0 = cx - w / 2, y0 = cy - h * 0.42, base = y0 + h;
      _drawFarmBaseShadow(ctx, cx + D * 0.5, base + s * 0.03, w * 1.05, s * 0.1, night, pal);

      // Stone plinth: a course of footing the timber stands on, which is what
      // stops the walls looking like they were pasted onto the grass.
      const pH = s * 0.09;
      _plotBox(ctx, x0 - s * 0.03, base - pH, w + s * 0.06, pH, D, dy,
        night ? '#4a4540' : '#918a7e', night ? '#38342f' : '#6e685e',
        night ? '#585249' : '#a9a194', null);

      // Tarred timber walls. The right face is the shaded one, as everywhere on
      // this plot; the front carries a soft vertical gradient for the same
      // reason a real wall does — it is further from the sky at the bottom.
      const wallH = h - pH;
      ctx.fillStyle = night ? '#2a211a' : '#453427';       // right face
      ctx.beginPath();
      ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w + D, y0 - dy);
      ctx.lineTo(x0 + w + D, y0 - dy + wallH); ctx.lineTo(x0 + w, y0 + wallH); ctx.closePath(); ctx.fill();
      const wg = ctx.createLinearGradient(0, y0, 0, y0 + wallH);
      wg.addColorStop(0, night ? '#4f3c2c' : '#74573e');
      wg.addColorStop(1, night ? '#2f231a' : '#463424');
      ctx.fillStyle = wg; ctx.fillRect(x0, y0, w, wallH);
      // Plank seams run across BOTH faces, so the two read as one solid rather
      // than two flat panels that happen to touch.
      ctx.strokeStyle = 'rgba(0,0,0,.24)'; ctx.lineWidth = 1;
      for (let k = 1; k < 5; k++) {
        const yy = y0 + (wallH * k) / 5;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy);
        ctx.lineTo(x0 + w + D, yy - dy); ctx.stroke();
      }

      // Narrow door, cut INTO the wall — the frame's thickness is what makes it
      // a doorway rather than a dark rectangle.
      const dW = w * 0.44, dH = wallH * 0.6, dX = cx - dW / 2, dY = y0 + wallH - dH;
      const door = function (ox, oy) { ctx.beginPath(); ctx.rect(dX + ox, dY + oy, dW, dH); };
      _plotRecess(ctx, door, D * 0.5, dy * 0.5,
        night ? '#584431' : '#8a6845', night ? '#160f0a' : '#241a11');
      if (st.busy || st.ready) {
        ctx.fillStyle = 'rgba(255,164,72,.5)';
        ctx.fillRect(cx - dW * 0.08, dY + dH * 0.04, dW * 0.16, dH * 0.94);
      }

      /* Gabled roof with its RIGHT SLOPE showing. A single triangle is a gable
         seen dead-on, which is the one angle nothing else on this plot is seen
         from — the eye reads it as a cardboard cut-out sitting behind the walls.
         Two planes meeting at a ridge, with the ridge running back along the
         same depth axis as everything else, is the whole fix. */
      const rTop = y0 - s * 0.22, ov = s * 0.08;      // ridge height, eaves overhang
      const lx = x0 - ov, rx = x0 + w + ov;
      ctx.fillStyle = night ? '#443327' : '#6d5138';   // front slope (lit side)
      ctx.beginPath();
      ctx.moveTo(lx, y0); ctx.lineTo(cx, rTop); ctx.lineTo(rx, y0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = night ? '#2c2018' : '#4a3524';   // right slope, running back
      ctx.beginPath();
      ctx.moveTo(rx, y0); ctx.lineTo(cx, rTop);
      ctx.lineTo(cx + D, rTop - dy); ctx.lineTo(rx + D, y0 - dy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = night ? '#5a4433' : '#8a6845';   // ridge cap catching the sky
      ctx.lineWidth = Math.max(1.2, s * 0.03);
      ctx.strokeStyle = night ? '#5a4433' : '#8a6845';
      ctx.beginPath(); ctx.moveTo(cx, rTop); ctx.lineTo(cx + D, rTop - dy); ctx.stroke();
      // The shadow the eaves throw on the wall below them.
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(x0, y0, w, s * 0.035);

      // Chimney, three faces and a cap like everything else.
      const chW = s * 0.16, chX = cx + w * 0.10, chY = rTop - s * 0.16;
      _plotBox(ctx, chX, chY, chW, s * 0.30, D * 0.5, dy * 0.5,
        night ? '#4a4540' : '#8f887c', night ? '#37332e' : '#6b6459',
        night ? '#585249' : '#a8a094', night ? 'rgba(255,240,210,.12)' : 'rgba(255,250,236,.34)');
      ctx.fillStyle = night ? '#615a51' : '#b3ab9d';         // flared cap
      ctx.fillRect(chX - s * 0.02, chY - s * 0.03, chW + s * 0.04, s * 0.035);

      if (pal && pal.roofSnow) {
        ctx.strokeStyle = pal.roofSnow; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lx, y0 - s * 0.01); ctx.lineTo(cx, rTop);
        ctx.lineTo(cx + D, rTop - dy); ctx.stroke();
      }
      if (st.busy || st.ready) _drawFarmWisp(ctx, chX + chW * 0.5 + D * 0.25, chY - s * 0.12, s, t, 'rgba(96,92,88,.4)', 60);
      if (st.ready) _drawFarmReadyLamp(ctx, x0 - s * 0.12, y0 + wallH * 0.34, s, t);
    }

    // 3 — Ham Cellar: half buried, and the only building on the farm that is
    // mostly a HOLE — a stone collar, a shaft going down, and two doors thrown
    // open over it. Nothing else on the plot reads as below the ground line.
    function _drawHamCellar(ctx, cx, cy, s, night, pal, t, st) {
      const w = s * 1.02, d = s * 0.46, y0 = cy + s * 0.1;
      const dd = _plotD(s), D = dd.D;
      _drawFarmBaseShadow(ctx, cx + D * 0.3, y0 + d * 0.66, w * 0.64, s * 0.1, night, pal);

      /* The collar as a raised RING, not two stacked ellipses. Flat ellipse on
         flat ellipse is how you draw a puddle; a ring has a wall, and the wall
         is what says the ground opens downward here. Outer wall first, then the
         cap on top of it, then the shaft going down inside. */
      const orx = w * 0.58, ory = d * 0.72, lip = s * 0.075;
      ctx.fillStyle = night ? '#3c3730' : '#6e6659';               // outer wall
      ctx.beginPath(); ctx.ellipse(cx, y0 + d * 0.2 + lip, orx, ory, 0, 0, Math.PI); ctx.fill();
      ctx.fillRect(cx - orx, y0 + d * 0.2, orx * 2, lip);
      ctx.fillStyle = night ? '#5d564d' : '#a49a8b';               // cap, catching the sky
      ctx.beginPath(); ctx.ellipse(cx, y0 + d * 0.2, orx, ory, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = night ? 'rgba(255,240,210,.10)' : 'rgba(255,250,236,.34)';
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.beginPath(); ctx.ellipse(cx, y0 + d * 0.2, orx, ory, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      /* The shaft. DARK AT THE BOTTOM: what you see looking into a hole from
         above and in front is the far wall catching a little light near the rim,
         and blackness underneath it. The gradient ran the other way at first —
         light pooling at the bottom — and the cellar read as a bowl of soup in a
         stone ring, which is what a filled shape always reads as. */
      const irx = w * 0.45, iry = d * 0.56, sy = y0 + d * 0.24;
      ctx.fillStyle = night ? '#0a0806' : '#140e09';
      ctx.beginPath(); ctx.ellipse(cx, sy, irx, iry, 0, 0, Math.PI * 2); ctx.fill();
      const far = ctx.createLinearGradient(0, sy - iry, 0, sy + iry * 0.35);
      far.addColorStop(0, night ? '#332e28' : '#5a5145');
      far.addColorStop(1, night ? 'rgba(10,8,6,0)' : 'rgba(20,14,9,0)');
      ctx.fillStyle = far;
      ctx.beginPath(); ctx.ellipse(cx, sy, irx, iry, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      // Steps descending AWAY from you along the far wall, each darker than the
      // one above it. Stacked full ellipses were the other way to draw this and
      // they build a bowl — the one shape a cellar mouth must not have.
      [[0.74, 0.34], [0.52, 0.24]].forEach(function (k, i) {
        ctx.fillStyle = i ? (night ? '#191510' : '#2a2117') : (night ? '#241f19' : '#3d342a');
        ctx.beginPath();
        ctx.ellipse(cx, sy - iry * k[1], irx * k[0], iry * k[0], 0, Math.PI, Math.PI * 2);
        ctx.closePath(); ctx.fill();
      });

      /* Light climbing out of the shaft, BEFORE the leaves — so the doors are
         lit from below by their own cellar rather than sitting on the glow. */
      if (st.busy || st.ready) {
        // On the far wall near the rim, where a lamp down there would actually
        // land — not a wash over the whole opening, which just refills the bowl.
        const g = ctx.createRadialGradient(cx, sy - iry * 0.55, 0, cx, sy - iry * 0.55, irx * 0.8);
        g.addColorStop(0, 'rgba(255,170,74,.55)'); g.addColorStop(1, 'rgba(255,170,74,0)');
        ctx.save();
        ctx.beginPath(); ctx.ellipse(cx, sy, irx, iry, 0, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = g; ctx.fillRect(cx - irx, sy - iry, irx * 2, iry * 2);
        ctx.restore();
      }

      /* The two leaves, THROWN OPEN to either side, and the shaft left showing
         between them. They used to meet at a ridge over the middle of the hole,
         which drew a four-sided pyramid — from this angle that is the silhouette
         of a hip roof, and the cellar read as a little tent standing in a stone
         ring. Open leaves say the same thing the closed ones were trying to
         (a way down, under the ground) and say it without lying about the form. */
      const hinge = y0 + d * 0.04;
      const leaf = function (dir, lit) {
        const hx = cx + dir * irx * 0.86;                  // hinged at the collar
        const tipX = cx + dir * w * 0.72, tipY = y0 - d * 0.52;
        // Deeper at the hinge than at the tip: a slab swung away from you keeps
        // its near edge tall and foreshortens the far one.
        const hTop = hinge - d * 0.30, hBot = hinge + d * 0.42;
        const g = ctx.createLinearGradient(0, tipY, 0, hBot);
        g.addColorStop(0, lit ? (night ? '#8a6640' : '#bb8a55') : (night ? '#5c4227' : '#8a6238'));
        g.addColorStop(1, night ? '#3d2c1a' : '#65482a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(hx, hTop);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(tipX, tipY + d * 0.34);
        ctx.lineTo(hx, hBot);
        ctx.closePath(); ctx.fill();
        // iron banding, running with the leaf rather than across the hole
        ctx.strokeStyle = night ? '#2a2622' : '#463f36';
        ctx.lineWidth = Math.max(1.2, s * 0.03);
        [0.34, 0.72].forEach(function (f) {
          const ax2 = hx + (tipX - hx) * f;
          const ay2 = hTop + (tipY - hTop) * f, by2 = hBot + (tipY + d * 0.34 - hBot) * f;
          ctx.beginPath(); ctx.moveTo(ax2, ay2); ctx.lineTo(ax2, by2); ctx.stroke();
        });
        // the leaf's own top edge, catching the sky on the near side
        ctx.strokeStyle = lit ? (night ? '#a07c50' : '#dcaa6c') : (night ? '#4a361f' : '#75542f');
        ctx.lineWidth = Math.max(1.2, s * 0.03); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hTop); ctx.lineTo(tipX, tipY); ctx.stroke();
      };
      leaf(-1, false);
      leaf(1, true);
      if (st.ready) _drawFarmReadyLamp(ctx, cx, y0 - d * 0.62, s, t);
    }

    const _AGER_ART = { cheesecave: _drawCheeseCave, smokehouse: _drawSmokehouse, hamcellar: _drawHamCellar };

    function _drawAgeingFactories(ctx, W, H, t, night, pal) {
      if (!roomData.farmLandR) return;
      // A stone apron, so the factory yard reads as a different place from the
      // compost yard and from the pasture. The buyer stands on it too.
      _plotFloor(ctx, W, H, FARM_AGER_LANES.map(function (a, i) { return _agerPos(i, W, H); }).concat([_buyerPos(W, H)]), night, pal, 'stone', 'R');
      // Far to near, same reason as the compost yard.
      const order = FARM_AGERS.map(function (d, i) { return i; })
        .sort(function (a, b) { return FARM_AGER_LANES[a].y - FARM_AGER_LANES[b].y; });
      order.forEach(function (i) {
        const def = FARM_AGERS[i];
        const p = _agerPos(i, W, H), cx = p.x * W, cy = p.y * H, s = _plotSizeAt(p.y, W, H);
        const locked = !_farmBuildOwned(def.id);
        const st = locked ? { ready: false, busy: false } : _agerJobState(def.id);
        _hoverScaled(ctx, _farmHoverK('sky', def.id), cx, cy, function () {
          ctx.save();
          if (locked) ctx.globalAlpha = FARM_LOCK_ALPHA;
          _AGER_ART[def.id](ctx, cx, cy, s, night, pal, t, st);
          if (locked) _drawFarmPadlock(ctx, cx, cy + s * 0.18, s * 0.32);
          ctx.restore();
        });
      });
    }

    /* ── The tier-2 buyer (right plot) ──
       Permanent, always open, and the ONLY outlet for aged goods. Drawn like its
       neighbours rather than left as an emoji. */
    function _drawTier2Buyer(ctx, W, H, t, night, pal) {
      if (!roomData.farmLandR) return;
      // The nearest thing on the plot and its destination, so it is also the
      // biggest — _plotSizeAt already gives it that from its y.
      const bp = _buyerPos(W, H);
      const s = _plotSizeAt(bp.y, W, H);
      const cx = bp.x * W, cy = bp.y * H;
      const b = farmBuyerState(), open = b.present;
      ctx.save();
      const w = s * 1.1, h = s * 0.42, x0 = cx - w / 2, y0 = cy - h * 0.1;
      const dd = _plotD(s), D = dd.D, dy = dd.dy;
      _hoverScaled(ctx, _farmHoverK('sky', '#buyer'), cx, cy, function () {
        _drawFarmBaseShadow(ctx, cx + D * 0.5, y0 + h + s * 0.03, w * 0.62, s * 0.1, night, pal);
        // Posts, each a thin box so the frame has a near and a far side.
        [x0 + s * 0.02, x0 + w - s * 0.09].forEach(function (px) {
          _plotBox(ctx, px, y0 - s * 0.52, s * 0.07, s * 0.6, D * 0.42, dy * 0.42,
            night ? '#4e3a28' : '#7d5c3c', night ? '#372718' : '#5a3f28',
            night ? '#5e4832' : '#96714b', null);
        });
        /* Striped awning with an UNDERSIDE and an end. It used to be a flat
           striped band — a flag pinned across the front, with nothing to say
           which way it faced. The canopy plane slopes forward and down, the
           strip beneath it is the shade it casts on itself, and the right end
           closes the shape off. */
        const aw = w + s * 0.16, ax = cx - aw / 2, ay = y0 - s * 0.56, ah = s * 0.17;
        for (let k = 0; k < 6; k++) {
          const f0 = ax + (aw * k) / 6, f1 = ax + (aw * (k + 1)) / 6;
          ctx.fillStyle = k % 2 ? (night ? '#8c423a' : '#e56b53') : (night ? '#d6cab4' : '#fffaef');
          ctx.beginPath();                               // canopy top, tilting back
          ctx.moveTo(f0, ay); ctx.lineTo(f1, ay);
          ctx.lineTo(f1 + D * 0.5, ay - dy * 0.5); ctx.lineTo(f0 + D * 0.5, ay - dy * 0.5);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = k % 2 ? (night ? '#7d3a32' : '#d4614c') : (night ? '#c9bda8' : '#f6efe0');
          ctx.fillRect(f0, ay, f1 - f0, ah);             // the valance hanging down
        }
        ctx.fillStyle = night ? 'rgba(0,0,0,.34)' : 'rgba(60,34,26,.26)';   // right end, in shade
        ctx.beginPath();
        ctx.moveTo(ax + aw, ay); ctx.lineTo(ax + aw + D * 0.5, ay - dy * 0.5);
        ctx.lineTo(ax + aw + D * 0.5, ay - dy * 0.5 + ah); ctx.lineTo(ax + aw, ay + ah);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.16)';               // shade thrown on the counter
        ctx.fillRect(x0, y0 - s * 0.05, w, s * 0.04);

        /* The stone counter, as a counter: the thing that makes one is the flat
           TOP you put goods on, and it had none — just a rectangle with a lighter
           strip along its edge, which reads as a wall. */
        const cg = ctx.createLinearGradient(0, y0, 0, y0 + h);
        cg.addColorStop(0, night ? '#6a635b' : '#c2b8a6');
        cg.addColorStop(1, night ? '#4b453e' : '#8f8676');
        _plotBox(ctx, x0, y0, w, h, D, dy, cg,
          night ? '#3f3a34' : '#7a7263', night ? '#847b71' : '#e3d9c6',
          night ? 'rgba(255,240,210,.12)' : 'rgba(255,252,242,.5)');
        // the worn front edge of the top slab, standing a little proud
        ctx.fillStyle = night ? '#7b736a' : '#d8cebc';
        ctx.fillRect(x0 - s * 0.03, y0 - s * 0.03, w + s * 0.06, s * 0.05);
        // a set of scales on the counter
        const bx = cx, by = y0 - s * 0.09;
        ctx.strokeStyle = night ? '#9a9284' : '#7d735f';
        ctx.lineWidth = Math.max(1, s * 0.028); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - s * 0.16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - s * 0.13, by - s * 0.16); ctx.lineTo(bx + s * 0.13, by - s * 0.16); ctx.stroke();
        ctx.fillStyle = night ? '#b6ac9a' : '#e6dcc6';
        [-0.13, 0.13].forEach(function (o) {
          ctx.beginPath();
          ctx.ellipse(bx + s * o, by - s * 0.08, s * 0.07, s * 0.035, 0, 0, Math.PI);
          ctx.fill();
        });
        // Waiting stock — crates standing ON the counter top, each with its own
        // lid and side, so they sit on the slab instead of floating over it.
        const n = Math.min(3, Object.keys(roomData.farmAged || {}).filter(k => (roomData.farmAged[k] || 0) > 0).length);
        for (let k = 0; k < n; k++) {
          const kx = x0 + s * 0.12 + k * s * 0.19;
          _plotBox(ctx, kx, y0 - s * 0.15, s * 0.14, s * 0.1, D * 0.3, dy * 0.3,
            night ? '#8a6a3e' : '#c99a52', night ? '#63492a' : '#9d7439',
            night ? '#a1804f' : '#e2b46a', null);
        }
        /* What the stall is taking, painted on its own front — icons only.
           This used to hang above the awning as a ×N pill, which is the one
           place on this plot where a readout floated free of the thing it
           described. The counter face is where a market stall says what it
           deals in, and the counts belong in the sheet you open, not over the
           plot: the amounts move with every sale, and a number nobody can act
           on from here is just noise on the sky. Inside _hoverScaled, so this
           scales WITH the stall — it is part of the object now, not a sign. */
        if (open && b.wanted.length) {
          const gn = b.wanted.length, ggap = s * 0.04;
          const gs = Math.min(s * 0.22, h * 0.62, (w - s * 0.14 - ggap * (gn - 1)) / gn);
          let gx = cx - (gs * gn + ggap * (gn - 1)) / 2;
          const gy = y0 + (h - gs) / 2;
          b.wanted.forEach(function (wd) {
            const gimg = _prodImage(wd.id);
            if (gimg && gimg.complete && gimg.naturalWidth > 0) {
              ctx.drawImage(gimg, gx, gy, gs, gs);
            } else {
              // Same one-frame fallback the rest of the farm uses while an SVG decodes.
              ctx.save();
              ctx.font = Math.round(gs * 0.9) + 'px serif';
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
              ctx.fillText((FARM_AGED[wd.id] || { emoji: '❓' }).emoji, gx, gy + gs / 2);
              ctx.restore();
            }
            gx += gs + ggap;
          });
        }

        /* Shutters. The stall now keeps hours, so it has to LOOK shut from
           across the plot — dimming alone reads as "not unlocked yet", which is
           what every locked building on this plot already means. */
        if (!open) {
          const sh0 = y0 - s * 0.50, shH = s * 0.44;
          ctx.fillStyle = night ? '#463b31' : '#8d8071';
          ctx.fillRect(x0 + s * 0.02, sh0, w - s * 0.04, shH);
          ctx.strokeStyle = night ? 'rgba(0,0,0,.30)' : 'rgba(0,0,0,.18)';
          ctx.lineWidth = 1;
          for (let k = 1; k < 5; k++) {
            const yy = sh0 + (shH * k) / 5;
            ctx.beginPath(); ctx.moveTo(x0 + s * 0.02, yy); ctx.lineTo(x0 + w - s * 0.02, yy); ctx.stroke();
          }
          ctx.fillStyle = night ? '#6b5d4e' : '#b3a596';           // the pull handle
          ctx.fillRect(x0 + w / 2 - s * 0.06, sh0 + shH - s * 0.04, s * 0.12, s * 0.035);
        }
      });

      /* No sign over the stall any more — what it takes is painted on the
         counter, and the shutters already say it is shut. Both of the things
         that pill used to spell out stay one point away: the hover/tap hint on
         #buyer reads "Taking today: …" or "Closed — opens in …".

         The ready lamp used to hang off the pill's right edge, so it needs its
         own anchor now: just clear of the awning's right end (which reaches
         x0 + w + s*0.08), at the height of the shutter line. */
      // The same amber lamp the rest of the farm uses for "something to do here":
      // lit only when a sale can actually be made right now.
      if (open && b.wanted.some(function (w) { return _buyerSellable(w) > 0; })) {
        _drawFarmReadyLamp(ctx, x0 + w + s * 0.18, y0 - s * 0.5, s, t);
      }
      ctx.restore();
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
          return '<div class="cart-sq" style="cursor:default;border-style:dashed;border-color:var(--g-border);background:rgba(255,255,255,.04)"><span class="cart-sq-icon">' + _prodIcon(w.id, 34, m) + '</span><span class="cart-sq-cap" style="color:var(--g-ink-soft)">×' + w.qty + '</span></div>';
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
              '<span class="cart-sq-icon">' + _prodIcon(w.id, 34, m) + '</span><span class="cart-sq-cap">+' + (prices[w.id] || 0) + '🪙</span></button>';
            continue;
          }
          // Don't have it yet — send them to the workshop that makes it rather
          // than leaving a dead square that only says "make".
          squares += mk
            ? '<button class="cart-sq make" onclick="goMakeForCart(\'' + mk.id + '\')" title="' + T('Make {product} in the {machine}', { product: T(m.name), machine: T(mk.name) }) + '">' +
                '<span class="cart-sq-icon">' + _prodIcon(w.id, 34, m) + '</span><span class="cart-sq-cap">' + _buildIcon(mk.id, 15, mk) + ' ' + T('make') + '</span></button>'
            : '<div class="cart-sq locked" title="' + T('Make this in the workshop, then sell it') + '">' +
                '<span class="cart-sq-icon">' + _prodIcon(w.id, 34, m) + '</span><span class="cart-sq-cap">' + T('make') + '</span></div>';
        }
      });
      const wantsLine = cart.wanted.map(w => _prodIcon(w.id, 16, meta[w.id]) + '×' + Math.max(0, w.qty - (_cartSold[w.id] || 0))).join('  ');
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
          : '<div class="ws-status">' + T('Unlock a machine first — tap one on your farm. Then the plane buys what it makes.') + '</div>' +
            '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="dismissCart()">🐴 ' + T('Send it off (new cart in {time})', { time: _fmtFarmTime(FARM_CART_COOLDOWN_MS) }) + '</button>') +
        '<button class="cp-close" onclick="closeCartSheet()">' + T('Close') + '</button>';
      el.style.display = 'block';
    }

    /* ── The tier-2 buyer ──
       The only outlet for aged goods, and it runs the plane's mechanic: a set it
       wants THIS visit, at full price, then it shuts for a day and reopens
       wanting different things. While it is shut it shows the next list, so the
       plot always tells you what to be ageing.

       It replaced a flat "20 items a day" quota. The quota braked tier 2 but
       said nothing and asked for nothing — you sold whatever you happened to
       have until a counter stopped you. A list does the same braking while
       being a reason to come back, and it makes the ageing factories a planning
       problem instead of a queue to empty. */

    /* ── Drawn aged-good icons ──
       The five aged goods used to borrow their tier-1 emoji (aged cheese wore
       the plain 🧀, cultured butter the plain 🧈…), so in the buyer they were
       indistinguishable from the everyday goods they are made from — and from
       each other where two came from one machine. An emoji is a shared label;
       these are the farm's most valuable goods, so each gets its OWN little
       drawing instead, the same reasoning that gives every side-land building
       its own silhouette rather than a badge (see _drawWorkshopMachines).

       Inline SVG (like coinSVG), so it scales crisply from the 34px sell square
       down to the 16px wants line, greys out cleanly under .cart-sq.locked's
       filter, and needs no image asset. viewBox is a shared 64×64; one warm
       outline holds them together on both the dark panel and the cream theme. */
    const _AGED_OUT = '#5a3418';   // shared outline — reads on cream and on dark
    const FARM_AGED_ART = {
      // Rinded cheese WHEEL with a cut wedge (holes), not the flat fresh emoji.
      agedcheese:
        '<ellipse cx="30" cy="53" rx="22" ry="4.5" fill="rgba(0,0,0,.16)"/>' +
        '<path d="M10 28 v10 a16 8 0 0 0 32 0 v-10 z" fill="#c08a2a"/>' +
        '<ellipse cx="26" cy="28" rx="16" ry="8" fill="#edbb4f"/>' +
        '<ellipse cx="22" cy="27" rx="2.5" ry="1.5" fill="#cf9a35"/>' +
        '<ellipse cx="31" cy="30" rx="1.9" ry="1.1" fill="#cf9a35"/>' +
        '<path d="M10 28 v10 a16 8 0 0 0 32 0 v-10" fill="none" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<ellipse cx="26" cy="28" rx="16" ry="8" fill="none" stroke="' + _AGED_OUT + '" stroke-width="2.4"/>' +
        '<path d="M32 33 L55 42 L42 56 Z" fill="#f2c85f" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M32 33 L55 42" stroke="#c08a2a" stroke-width="4.6" stroke-linecap="round"/>' +
        '<path d="M32 33 L55 42" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linecap="round"/>' +
        '<circle cx="43" cy="45" r="2.2" fill="#d3a13a"/>' +
        '<circle cx="46" cy="50" r="1.6" fill="#d3a13a"/>',
      // Cultured-butter block on peeled wax paper, with a curl on top.
      culturedbutter:
        '<ellipse cx="32" cy="53" rx="22" ry="4.5" fill="rgba(0,0,0,.16)"/>' +
        '<path d="M7 41 L13 20 L53 24 L48 51 Z" fill="#f3ecdb" stroke="#c9bda3" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M16 35 L44 35 L44 48 L16 48 Z" fill="#f1d271"/>' +
        '<path d="M16 35 L24 28 L52 28 L44 35 Z" fill="#f9e6a0"/>' +
        '<path d="M44 35 L52 28 L52 41 L44 48 Z" fill="#e4bd52"/>' +
        '<path d="M16 35 L24 28 L52 28 L52 41 L44 48 L16 48 Z" fill="none" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M16 35 H44 M44 35 L44 48 M44 35 L52 28" fill="none" stroke="' + _AGED_OUT + '" stroke-width="1.6"/>' +
        '<path d="M27 32 q4 -4.5 9 0 q-4.5 3.3 -9 0 z" fill="#fff1c1" stroke="' + _AGED_OUT + '" stroke-width="1.5" stroke-linejoin="round"/>',
      // Cured salami hung by twine, mottled casing + a cut slice beside it.
      curedsausage:
        '<path d="M32 5 q-7 3.5 0 9" fill="none" stroke="#cbb48b" stroke-width="2.6"/>' +
        '<path d="M32 12 q14 4 13 23 q-1 17 -13 21 q-12 -4 -13 -21 q-1 -19 13 -23 z" fill="#9a3f30" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M23 16 q9 -4 18 0" fill="none" stroke="#e8d9b6" stroke-width="2.2"/>' +
        '<path d="M22 27 h20 M21 35 h22 M22 43 h20" stroke="#772d22" stroke-width="1.3" opacity=".55"/>' +
        '<path d="M28 15 V54 M37 15 V54" stroke="#772d22" stroke-width="1.1" opacity=".4"/>' +
        '<circle cx="27" cy="31" r="1" fill="#dcccb4"/><circle cx="38" cy="37" r="1.1" fill="#dcccb4"/><circle cx="31" cy="47" r="1" fill="#dcccb4"/>' +
        '<circle cx="50" cy="49" r="8.5" fill="#b5473a" stroke="' + _AGED_OUT + '" stroke-width="2.3"/>' +
        '<circle cx="50" cy="49" r="8.5" fill="none" stroke="#ecd9c8" stroke-width="1.6"/>' +
        '<circle cx="47" cy="47" r="1.3" fill="#eddcce"/><circle cx="52" cy="50" r="1.5" fill="#eddcce"/><circle cx="49" cy="52" r="1.1" fill="#eddcce"/>',
      // Smoked, streaky slab: dark smoked crust, fat bands, a smoke wisp.
      smokedbacon:
        '<ellipse cx="31" cy="52" rx="22" ry="4.5" fill="rgba(0,0,0,.16)"/>' +
        '<path d="M12 31 L48 31 L48 49 L12 49 Z" fill="#b0402f"/>' +
        '<path d="M12 35 H48 M12 40 H48 M12 45 H48" stroke="#f0d9c4" stroke-width="2.6"/>' +
        '<path d="M12 31 L20 25 L56 25 L48 31 Z" fill="#5e2b1c"/>' +
        '<path d="M48 31 L56 25 L56 43 L48 49 Z" fill="#7d2c1e"/>' +
        '<path d="M12 31 L20 25 L56 25 L56 43 L48 49 L12 49 Z" fill="none" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M12 31 H48 M48 31 V49 M48 31 L56 25" fill="none" stroke="' + _AGED_OUT + '" stroke-width="1.7"/>' +
        '<path d="M23 23 q-3.5 -5 1 -8 q3.5 -3 0 -6" fill="none" stroke="#cfc4bb" stroke-width="1.8" opacity=".6" stroke-linecap="round"/>',
      // Whole cured leg (jamón) clamped on a wooden ham stand: hoof, fat cap, string.
      agedham:
        '<rect x="11" y="50" width="36" height="5.5" rx="2.5" fill="#9b6a38" stroke="' + _AGED_OUT + '" stroke-width="2"/>' +
        '<rect x="14" y="19" width="5.5" height="32" rx="2.5" fill="#9b6a38" stroke="' + _AGED_OUT + '" stroke-width="2"/>' +
        '<path d="M17 23 q11 -7 21 -2" fill="none" stroke="#9b6a38" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M23 31 q6 -11 20 -6 q14 6 11 21 q-3 12 -17 12 q-16 0 -16 -14 q0 -8 2 -13 z" fill="#c25a4e" stroke="' + _AGED_OUT + '" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M25 31 q8 -8 20 -5 q6 2 9 7" fill="none" stroke="#f0dcc4" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M18 22 q4 -3 8.5 0 l-2 6.5 q-3.5 1.5 -6.5 -1 z" fill="#3a2418" stroke="#241209" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M31 27 q6 2 4 8.5" fill="none" stroke="#e8dcc0" stroke-width="2"/>' +
        '<path d="M33 43 q7 1 11 5" stroke="#d98b7f" stroke-width="1.6" fill="none" opacity=".7"/>',
    };
    /* ── Drawn tier-1 workshop products ──
       The same treatment for what the machines make, so a good is a drawing
       wherever it shows — the workshop, the market list, the plane's cart. Each
       fresh good is drawn DISTINCT from its aged twin (fresh cheese is a bright
       wedge, not the rinded wheel; fresh bacon is pink rashers, not the smoked
       slab), so the two tiers never read alike. Raw crops and animal drops keep
       their emoji — they are ingredients, not products. Same 64×64 box and warm
       outline as the aged set. */
    const FARM_PROD_ART = {
      cheese: '<ellipse cx="33" cy="51" rx="20" ry="4" fill="rgba(0,0,0,.14)"/><path d="M11 32 L38 22 L55 33 L28 43 Z" fill="#ffe07a"/><path d="M11 32 L11 42 L28 49 L28 43 Z" fill="#eeb52a"/><path d="M28 43 L28 49 L55 39 L55 33 Z" fill="#ffcf3f"/><path d="M11 32 L38 22 L55 33 L55 39 L28 49 L11 42 Z" fill="none" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M11 32 L28 43 L55 33 M28 43 L28 49" fill="none" stroke="#5a3418" stroke-width="2.2" stroke-linejoin="round"/><circle cx="37" cy="41" r="2.3" fill="#e0a91e"/><circle cx="45" cy="37" r="1.8" fill="#e0a91e"/><circle cx="34" cy="45" r="1.5" fill="#e0a91e"/>',
      yogurt: '<ellipse cx="32" cy="52" rx="16" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M18 31 L46 31 L43 50 Q32 53 21 50 Z" fill="#f4eee1" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="32" cy="31" rx="14" ry="4.6" fill="#fff" stroke="#5a3418" stroke-width="2.4"/><path d="M24 30 q4 -5 8 0 q4 5 8 0" fill="none" stroke="#f0a0bc" stroke-width="2.6" stroke-linecap="round"/><circle cx="32" cy="24" r="3.2" fill="#e0567e" stroke="#5a3418" stroke-width="1.6"/><path d="M31 21 q1 -2.5 3 -1.5" stroke="#5a8a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
      butter: '<ellipse cx="32" cy="49" rx="20" ry="4" fill="rgba(0,0,0,.14)"/><path d="M11 45 Q9 41 15 41 L49 41 Q55 41 53 45 Q52 48 32 48 Q12 48 11 45 Z" fill="#eae3d3" stroke="#5a3418" stroke-width="2.2" stroke-linejoin="round"/><path d="M18 41 L44 41 L44 33 L18 33 Z" fill="#ffd86b"/><path d="M18 33 L24 28 L50 28 L44 33 Z" fill="#ffe89a"/><path d="M44 33 L50 28 L50 36 L44 41 Z" fill="#f0c247"/><path d="M18 33 L24 28 L50 28 L50 36 L44 41 L18 41 Z" fill="none" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M18 33 L44 33 L44 41 M44 33 L50 28" fill="none" stroke="#5a3418" stroke-width="1.6"/>',
      bread: '<ellipse cx="32" cy="50" rx="21" ry="4" fill="rgba(0,0,0,.14)"/><path d="M10 47 Q7 31 20 27 Q32 24 44 27 Q57 31 54 47 Z" fill="#dfa155"/><path d="M14 47 Q13 34 22 31 Q32 29 42 31 Q51 34 50 47 Z" fill="#f4cd8a"/><path d="M10 47 Q7 31 20 27 Q32 24 44 27 Q57 31 54 47" fill="none" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 31 l-3 5 M31 29 l-3 5 M40 31 l-3 5" stroke="#a86a2e" stroke-width="2.2" stroke-linecap="round"/><path d="M10 46 L54 46" stroke="#5a3418" stroke-width="2.4"/>',
      cookie: '<ellipse cx="32" cy="50" rx="18" ry="3.5" fill="rgba(0,0,0,.14)"/><circle cx="32" cy="31" r="19" fill="#d99a4e" stroke="#5a3418" stroke-width="2.4"/><circle cx="26" cy="25" r="2.6" fill="#4a2c14"/><circle cx="38" cy="23" r="2.2" fill="#4a2c14"/><circle cx="41" cy="34" r="2.6" fill="#4a2c14"/><circle cx="24" cy="37" r="2.2" fill="#4a2c14"/><circle cx="33" cy="40" r="2" fill="#4a2c14"/><circle cx="32" cy="30" r="1.8" fill="#4a2c14"/><path d="M21 24 q4 -4 9 -3" stroke="#eec084" stroke-width="2" fill="none" stroke-linecap="round"/>',
      pie: '<ellipse cx="32" cy="52" rx="21" ry="4" fill="rgba(0,0,0,.14)"/><path d="M10 40 Q10 30 32 30 Q54 30 54 40 L52 46 Q32 51 12 46 Z" fill="#e6b061" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="32" cy="34" rx="21" ry="8" fill="#f0c67e" stroke="#5a3418" stroke-width="2.4"/><ellipse cx="32" cy="34" rx="14.5" ry="5.2" fill="#c6552c"/><path d="M22 31 L28 39 M30 29.5 L36 40 M38 31 L43 39" stroke="#eebf74" stroke-width="2.4" stroke-linecap="round"/><path d="M19 34.5 L45 34.5" stroke="#eebf74" stroke-width="2.4"/>',
      baguette: '<ellipse cx="32" cy="50" rx="22" ry="4" fill="rgba(0,0,0,.14)"/><path d="M11 45 Q5 41 11 35 Q19 27 40 24 Q55 22.5 57 30 Q58 37.5 46 43 Q30 49 11 45 Z" fill="#dca558" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 33 l4 4 M30 31 l4 4 M38 30 l4 4" stroke="#8a5522" stroke-width="2.2" stroke-linecap="round"/><path d="M16 37 q10 -6 30 -8" stroke="#f0cd8e" stroke-width="2" fill="none" opacity=".55"/>',
      pizza: '<ellipse cx="32" cy="52" rx="17" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M32 10 L52 48 Q32 54 12 48 Z" fill="#f2c568" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 16 L47 45 Q32 50 17 45 Z" fill="#e05a2e"/><path d="M32 21 L44 43 Q32 47 20 43 Z" fill="#ffce6a" opacity=".55"/><circle cx="30" cy="30" r="3" fill="#b83322"/><circle cx="37" cy="38" r="3" fill="#b83322"/><circle cx="27" cy="41" r="2.6" fill="#b83322"/><path d="M32 10 L52 48 Q32 54 12 48 Z" fill="none" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/>',
      risotto: '<ellipse cx="32" cy="51" rx="20" ry="4" fill="rgba(0,0,0,.14)"/><path d="M12 35 Q32 31 52 35 Q50 49 32 51 Q14 49 12 35 Z" fill="#e6ddca" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="32" cy="34.5" rx="20" ry="6" fill="#f5eeda" stroke="#5a3418" stroke-width="2.4"/><g fill="#dccca4"><ellipse cx="26" cy="33.5" rx="2" ry="1"/><ellipse cx="35" cy="35.5" rx="2" ry="1"/><ellipse cx="38" cy="32.5" rx="2" ry="1"/><ellipse cx="30" cy="36" rx="2" ry="1"/></g><ellipse cx="42" cy="31" rx="3.4" ry="2.2" fill="#3a2418"/><path d="M36 30 l6 -1" stroke="#3a2418" stroke-width="1.6" stroke-linecap="round"/>',
      cake: '<ellipse cx="32" cy="51" rx="18" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M16 46 L16 30 L52 34 L46 48 Z" fill="#f6e3c4"/><path d="M16 34 L52 38" stroke="#e6547e" stroke-width="3.4"/><path d="M16 40 L49 43" stroke="#fff6ea" stroke-width="3.4"/><path d="M16 30 L30 25 L54 29 L52 34 Z" fill="#fdeede"/><path d="M16 46 L16 30 L30 25 L54 29 L52 34 L46 48 Z" fill="none" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 30 L52 34" fill="none" stroke="#5a3418" stroke-width="2"/><circle cx="34" cy="21" r="4.6" fill="#e83b55" stroke="#5a3418" stroke-width="1.6"/><path d="M32 17 q2 -3 4 0" fill="none" stroke="#4e8a34" stroke-width="2" stroke-linecap="round"/>',
      pancake: '<ellipse cx="32" cy="52" rx="19" ry="3.5" fill="rgba(0,0,0,.14)"/><ellipse cx="32" cy="44" rx="18" ry="6" fill="#e3a552" stroke="#5a3418" stroke-width="2.2"/><ellipse cx="32" cy="38" rx="18" ry="6" fill="#efb45f" stroke="#5a3418" stroke-width="2.2"/><ellipse cx="32" cy="32" rx="18" ry="6" fill="#f3bd68" stroke="#5a3418" stroke-width="2.2"/><path d="M16 31 Q19 41 23 34 Q26 43 31 33 Q35 44 41 33 Q45 41 48 31" fill="#b5701f" opacity=".85"/><rect x="27" y="24" width="10" height="7.5" rx="1.6" fill="#ffe07a" stroke="#5a3418" stroke-width="1.6"/>',
      carrotcake: '<ellipse cx="32" cy="52" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M20 34 L44 34 L40 50 Q32 52 24 50 Z" fill="#c9762e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 37 L22 49 M28 36 L27 51 M32 36 L32 51 M36 36 L37 51 M40 37 L42 49" stroke="#a85f22" stroke-width="1.4"/><path d="M18 35 Q19 22 32 22 Q45 22 46 35 Z" fill="#f3ead8" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M23 31 q9 -6 18 0" stroke="#e0d3b8" stroke-width="1.6" fill="none"/><path d="M32 22 l-2.5 -7 l5 0 Z" fill="#f08a2e" stroke="#5a3418" stroke-width="1.4" stroke-linejoin="round"/><path d="M31 15 l-1.5 -3 M33 15 l1.5 -3" stroke="#5a8a3a" stroke-width="1.6" stroke-linecap="round"/>',
      sausage: '<ellipse cx="32" cy="50" rx="20" ry="4" fill="rgba(0,0,0,.14)"/><path d="M14 41 Q9 31 19 26 Q29 21 34 30 Q38 37 30 43 Q21 48 14 41 Z" fill="#c06a4a" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M31 45 Q26 34 36 29 Q46 24 51 33 Q55 40 47 46 Q38 51 31 45 Z" fill="#b85f40" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M18 33 q6 -4 12 -2" stroke="#d98f6e" stroke-width="2" fill="none" opacity=".6"/><path d="M35 35 q6 -3 12 -1" stroke="#cf8464" stroke-width="2" fill="none" opacity=".6"/>',
      bacon: '<ellipse cx="32" cy="50" rx="21" ry="4" fill="rgba(0,0,0,.14)"/><path d="M9 27 Q21 21 33 27 Q45 33 55 27 L55 35 Q45 41 33 35 Q21 29 9 35 Z" fill="#d96a5a" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 35 Q21 29 33 35 Q45 41 55 35 L55 43 Q45 49 33 43 Q21 37 9 43 Z" fill="#e07a68" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 30 Q21 24 33 30 Q45 36 54 30" stroke="#f5ddc9" stroke-width="2.4" fill="none"/><path d="M10 38 Q21 32 33 38 Q45 44 54 38" stroke="#f5ddc9" stroke-width="2.4" fill="none"/>',
      ham: '<ellipse cx="32" cy="52" rx="18" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M21 45 Q12 37 18 26 Q24 16 37 20 Q51 25 49 39 Q48 49 34 49 Q26 49 21 45 Z" fill="#c65a4e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M25 26 q9 -4 15 3" stroke="#e08a7a" stroke-width="2.4" fill="none" opacity=".6"/><path d="M22 44 L14 51" stroke="#5a3418" stroke-width="7.5" stroke-linecap="round"/><path d="M22 44 L14 51" stroke="#f2e8d5" stroke-width="5" stroke-linecap="round"/><circle cx="12.5" cy="52" r="3.4" fill="#f2e8d5" stroke="#5a3418" stroke-width="1.6"/><circle cx="16" cy="49" r="2.6" fill="#f2e8d5" stroke="#5a3418" stroke-width="1.6"/>',
      tools: '<ellipse cx="32" cy="53" rx="16" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M16 49 L31 34" stroke="#c8792f" stroke-width="6.5" stroke-linecap="round"/><path d="M31 34 L41 24" stroke="#b9c0c8" stroke-width="4" stroke-linecap="round"/><path d="M41 24 l4.5 -0.5 -1.5 4 Z" fill="#b9c0c8" stroke="#5a3418" stroke-width="1.4" stroke-linejoin="round"/><path d="M48 49 L34 35" stroke="#9aa3ad" stroke-width="5.5" stroke-linecap="round"/><path d="M34 35 a6.5 6.5 0 1 1 -9 -9 l3.5 4 1.5 -1.5 4 3.5 Z" fill="#9aa3ad" stroke="#5a3418" stroke-width="2" stroke-linejoin="round"/>',
      bell: '<ellipse cx="32" cy="52" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><circle cx="32" cy="13" r="2.8" fill="#e0a828" stroke="#5a3418" stroke-width="2"/><path d="M32 15 Q34 15 34 18 Q47 23 47 42 L17 42 Q17 23 30 18 Q30 15 32 15 Z" fill="#f0b93e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 42 Q32 38 50 42 L50 46 Q32 50 14 46 Z" fill="#d99a26" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><circle cx="32" cy="50" r="3.4" fill="#c98a1e" stroke="#5a3418" stroke-width="2"/><path d="M26 25 q3 -4 8 -3" stroke="#ffe9a8" stroke-width="2" fill="none" opacity=".7"/>',
      // Raw materials — garden crops, the butcher's meat, and the animal drops.
      // Kept in the product registry so _prodIcon draws them at every recipe /
      // market / gift site with no extra plumbing; they read as ingredients.
      wheat: '<ellipse cx="32" cy="56" rx="11" ry="2.5" fill="rgba(0,0,0,.14)"/><path d="M32 54 L25 22 M32 54 L32 16 M32 54 L39 22" stroke="#c79a34" stroke-width="2.4" fill="none" stroke-linecap="round"/><g fill="#e8b84a" stroke="#5a3418" stroke-width="0.9"><ellipse cx="25" cy="21" rx="4" ry="7" transform="rotate(-12 25 21)"/><ellipse cx="32" cy="16" rx="4.2" ry="7.6"/><ellipse cx="39" cy="21" rx="4" ry="7" transform="rotate(12 39 21)"/></g><path d="M25 15 v12 M32 10 v13 M39 15 v12" stroke="#a87e28" stroke-width="0.8" opacity=".55"/><path d="M22 55 q10 4 20 0" stroke="#a87e28" stroke-width="2.2" fill="none"/>',
      carrot: '<ellipse cx="30" cy="54" rx="12" ry="3" fill="rgba(0,0,0,.14)"/><path d="M22 22 L38 24 L30 53 Z" fill="#f0842e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M25 29 h9 M26 35 h8 M27 41 h6" stroke="#d16a1e" stroke-width="1.4"/><path d="M28 22 q-2 -8 -6 -10 M31 21 q0 -9 1 -12 M34 22 q2 -8 6 -10" stroke="#4e8a34" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
      corn: '<ellipse cx="32" cy="54" rx="12" ry="3" fill="rgba(0,0,0,.14)"/><path d="M32 14 q9 2 9 18 q0 18 -9 20 q-9 -2 -9 -20 q0 -16 9 -18 z" fill="#f6cf49" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><g stroke="#caa128" stroke-width="1" fill="none" opacity=".8"><path d="M24 26 h16 M23 33 h18 M23 40 h18 M25 47 h14"/><path d="M28 16 v36 M32 14 v40 M36 16 v36"/></g><path d="M23 45 Q15 51 19 58 Q26 54 26 47 Z" fill="#6faa3e" stroke="#5a3418" stroke-width="1.6" stroke-linejoin="round"/><path d="M41 45 Q49 51 45 58 Q38 54 38 47 Z" fill="#7cb84a" stroke="#5a3418" stroke-width="1.6" stroke-linejoin="round"/>',
      meat: '<ellipse cx="32" cy="50" rx="20" ry="4" fill="rgba(0,0,0,.14)"/><path d="M14 34 Q12 22 26 20 Q44 17 50 28 Q54 38 44 44 Q30 50 18 44 Q13 40 14 34 Z" fill="#d15a4e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M18 33 Q30 29 44 34" stroke="#f0d9c4" stroke-width="3" fill="none" opacity=".85"/><path d="M22 40 Q32 37 42 40" stroke="#e8b8a4" stroke-width="1.6" fill="none" opacity=".6"/><path d="M46 23 q7 -2 9 3 q-3 5 -9 2 Z" fill="#f2e8d5" stroke="#5a3418" stroke-width="1.8" stroke-linejoin="round"/>',
      egg: '<ellipse cx="32" cy="53" rx="12" ry="3" fill="rgba(0,0,0,.14)"/><path d="M32 14 Q44 26 44 40 Q44 52 32 52 Q20 52 20 40 Q20 26 32 14 Z" fill="#fbf3e2" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="27" cy="30" rx="3.2" ry="5" fill="#fff" opacity=".75"/>',
      milk: '<ellipse cx="32" cy="53" rx="11" ry="3" fill="rgba(0,0,0,.14)"/><path d="M23 20 L41 20 L38 50 Q32 53 26 50 Z" fill="#eef4f7" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M24.6 31 L39.4 31 L38 50 Q32 53 26 50 Z" fill="#fff"/><path d="M24.6 31 Q32 28 39.4 31" stroke="#dbe6ec" stroke-width="1.5" fill="none"/><path d="M23 20 L41 20 L38 50 Q32 53 26 50 Z" fill="none" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/>',
      truffle: '<ellipse cx="32" cy="53" rx="12" ry="3" fill="rgba(0,0,0,.14)"/><path d="M28 38 L36 38 L35 50 Q32 52 29 50 Z" fill="#f2e6cf" stroke="#5a3418" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 38 Q16 22 32 22 Q48 22 48 38 Q40 42 32 42 Q24 42 16 38 Z" fill="#c0492f" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><circle cx="24" cy="31" r="2.6" fill="#f7ecd8"/><circle cx="34" cy="28" r="3" fill="#f7ecd8"/><circle cx="41" cy="33" r="2.2" fill="#f7ecd8"/>',
      horseshoe: '<ellipse cx="32" cy="52" rx="13" ry="3" fill="rgba(0,0,0,.14)"/><path d="M20 47 Q15 24 32 22 Q49 24 44 47" fill="none" stroke="#9aa3ad" stroke-width="7.5" stroke-linecap="round"/><path d="M24 45 Q20 28 32 26" stroke="#cfd6de" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="22" cy="41" r="1.4" fill="#4a3020"/><circle cx="23.5" cy="32" r="1.4" fill="#4a3020"/><circle cx="40.5" cy="32" r="1.4" fill="#4a3020"/><circle cx="42" cy="41" r="1.4" fill="#4a3020"/>',
    };
    // Animals, buildings and farm skins each get their own registry — same
    // 64×64 SVG, drawn wherever they show as a label (shop rows, the workshop
    // header, the skin picker) and rasterised (_animImage/_buildImage) for the
    // farm canvas. Not products, so they live apart from _prodArtOf.
    const FARM_ANIM_ART = {
      goose: '<ellipse cx="32" cy="54" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M26 52 Q15 48 18 36 Q21 26 34 27 Q47 28 46 41 Q45 51 35 52 Z" fill="#fdfdfb" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 32 Q19 16 26 11 Q31 13 29 22 Q28 29 31 31 Z" fill="#fdfdfb" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 15 l-7 1 l6 3.5 Z" fill="#f0a02e" stroke="#5a3418" stroke-width="1.4" stroke-linejoin="round"/><circle cx="26" cy="14" r="1.6" fill="#3a2418"/><path d="M31 41 q8 -3 13 1" stroke="#e6e2d8" stroke-width="1.6" fill="none"/>',
      pig: '<ellipse cx="32" cy="53" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M19 27 l-3 -7 l7 3 Z" fill="#f3a6b4" stroke="#5a3418" stroke-width="1.8" stroke-linejoin="round"/><path d="M45 27 l3 -7 l-7 3 Z" fill="#f3a6b4" stroke="#5a3418" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="32" cy="38" rx="17" ry="13" fill="#f3a6b4" stroke="#5a3418" stroke-width="2.4"/><ellipse cx="32" cy="42" rx="7.5" ry="5.5" fill="#e88a9c" stroke="#5a3418" stroke-width="1.8"/><circle cx="30" cy="42" r="1.2" fill="#7a3b48"/><circle cx="34" cy="42" r="1.2" fill="#7a3b48"/><circle cx="25" cy="34" r="1.7" fill="#3a2418"/><circle cx="39" cy="34" r="1.7" fill="#3a2418"/>',
      cow: '<ellipse cx="32" cy="53" rx="16" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M21 25 q-4 -4 -7 -3 q1 4 5 6 M43 25 q4 -4 7 -3 q-1 4 -5 6" stroke="#5a3418" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="38" rx="17.5" ry="13.5" fill="#fbfbf7" stroke="#5a3418" stroke-width="2.4"/><path d="M20 30 q-3 5 0 10 q6 0 8 -5 q-3 -4 -8 -5 z" fill="#3a2a1c"/><path d="M44 43 q5 -1 6 4 q-4 4 -8 1 q-1 -3 2 -5 z" fill="#3a2a1c"/><ellipse cx="32" cy="45" rx="6.5" ry="4.5" fill="#f3c0c8" stroke="#5a3418" stroke-width="1.8"/><circle cx="30" cy="45" r="1" fill="#b07a86"/><circle cx="34" cy="45" r="1" fill="#b07a86"/><circle cx="26" cy="34" r="1.7" fill="#3a2418"/><circle cx="38" cy="34" r="1.7" fill="#3a2418"/>',
      horse: '<ellipse cx="34" cy="54" rx="13" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M26 51 Q21 39 23 30 Q25 20 35 18 Q41 17 43 22 L47 35 Q48 41 43 43 L39 51 Z" fill="#b5763e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M35 18 q3 -6 1 -12 q6 4 7 12 z" fill="#8a5628" stroke="#5a3418" stroke-width="1.6" stroke-linejoin="round"/><path d="M23 31 Q14 29 12 35 Q19 35 23 39 Z" fill="#6e4420" stroke="#5a3418" stroke-width="1.6" stroke-linejoin="round"/><circle cx="36" cy="28" r="1.8" fill="#2e1c10"/><ellipse cx="44" cy="37" rx="2.4" ry="3" fill="#8a5628"/><circle cx="44" cy="38" r="0.9" fill="#2e1c10"/>',
    };
    const FARM_BUILD_ART = {
      dairy: '<ellipse cx="32" cy="54" rx="14" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M22 24 L42 24 L44 50 Q32 54 20 50 Z" fill="#c9d2d8" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M21 38 h22 M20.5 44 h23" stroke="#9aa3ad" stroke-width="2"/><ellipse cx="32" cy="24" rx="10" ry="3.6" fill="#e2e8ec" stroke="#5a3418" stroke-width="2.2"/><circle cx="32" cy="20" r="2.4" fill="#c9d2d8" stroke="#5a3418" stroke-width="1.6"/>',
      bakery: '<ellipse cx="32" cy="53" rx="16" ry="3.5" fill="rgba(0,0,0,.14)"/><rect x="12" y="49" width="40" height="4" rx="1.5" fill="#a85636" stroke="#5a3418" stroke-width="1.6"/><path d="M14 49 L14 34 Q14 22 32 22 Q50 22 50 34 L50 49 Z" fill="#c86a44" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 49 L22 38 Q22 32 32 32 Q42 32 42 38 L42 49 Z" fill="#3a2418"/><path d="M26 44 q6 -3 12 0" stroke="#e8a24a" stroke-width="2.4" fill="none"/><path d="M40 22 q3 -6 -1 -10" stroke="#cfc4bb" stroke-width="1.8" fill="none" opacity=".55" stroke-linecap="round"/>',
      oven: '<ellipse cx="32" cy="54" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><rect x="16" y="20" width="32" height="32" rx="4" fill="#d8dde0" stroke="#5a3418" stroke-width="2.4"/><rect x="20" y="22" width="24" height="4" rx="1.5" fill="#eef1f3" stroke="#5a3418" stroke-width="1.2"/><circle cx="22" cy="24" r="1.6" fill="#f08a3a"/><circle cx="42" cy="24" r="1.6" fill="#9aa3ad"/><rect x="20" y="30" width="24" height="18" rx="3" fill="#3a2c22" stroke="#5a3418" stroke-width="2"/><path d="M24 44 q8 -4 16 0" stroke="#f0a24a" stroke-width="2.6" fill="none"/>',
      butcher: '<ellipse cx="32" cy="54" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><rect x="16" y="40" width="32" height="12" rx="2" fill="#c58f52" stroke="#5a3418" stroke-width="2.4"/><path d="M18 44 h28 M18 48 h28" stroke="#a5722f" stroke-width="1" opacity=".55"/><rect x="28" y="15" width="15" height="13" rx="2" fill="#c9d2d8" stroke="#5a3418" stroke-width="2.2"/><path d="M43 19 L52 17 L52 24 L43 26 Z" fill="#8a5628" stroke="#5a3418" stroke-width="2" stroke-linejoin="round"/><circle cx="33" cy="21" r="1.5" fill="#9aa3ad"/>',
      forge: '<ellipse cx="32" cy="54" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M14 40 Q9 38 12 33 L27 33 L27 40 Z" fill="#7a828a" stroke="#5a3418" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 40 L50 40 L44 44 L45 46 L50 51 L18 51 L23 46 L20 44 Z" fill="#7a828a" stroke="#5a3418" stroke-width="2.2" stroke-linejoin="round"/><rect x="30" y="16" width="13" height="7" rx="1.5" fill="#9aa3ad" stroke="#5a3418" stroke-width="2"/><path d="M36 23 L34 34" stroke="#8a5628" stroke-width="3" stroke-linecap="round"/><path d="M28 30 l-3 -3 M30 26 l-1 -4 M23 32 l-4 -1" stroke="#f0a83a" stroke-width="1.8" stroke-linecap="round"/>',
      cheesecave: '<ellipse cx="32" cy="53" rx="17" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M12 50 Q12 26 32 26 Q52 26 52 50 Z" fill="#7cae4e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 50 Q22 36 32 36 Q42 36 42 50 Z" fill="#3a2c22" stroke="#5a3418" stroke-width="2" stroke-linejoin="round"/><ellipse cx="32" cy="46" rx="6" ry="4" fill="#edbb4f" stroke="#5a3418" stroke-width="1.6"/><path d="M18 31 q6 -3 12 -2 M36 30 q5 0 9 3" stroke="#9ad46a" stroke-width="1.8" fill="none" opacity=".5"/>',
      smokehouse: '<ellipse cx="32" cy="53" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><rect x="18" y="32" width="28" height="20" fill="#a5714a" stroke="#5a3418" stroke-width="2.4"/><path d="M14 33 L32 17 L50 33 Z" fill="#8a4a30" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><rect x="37" y="13" width="6" height="11" fill="#7a4a2c" stroke="#5a3418" stroke-width="2"/><path d="M40 11 q-4 -4 0 -8 q4 -3 1 -7" stroke="#cfc4bb" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/><rect x="27" y="40" width="10" height="12" rx="1.5" fill="#3a2418"/>',
      hamcellar: '<ellipse cx="32" cy="53" rx="15" ry="3.5" fill="rgba(0,0,0,.14)"/><path d="M16 51 L16 34 Q16 22 32 22 Q48 22 48 34 L48 51 Z" fill="#8a5a34" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 51 L22 36 Q22 28 32 28 Q42 28 42 36 L42 51 Z" fill="#2e2016" stroke="#5a3418" stroke-width="2" stroke-linejoin="round"/><path d="M30 34 q5 1 5 7 q0 5 -5 6 q-5 -1 -5 -6 q0 -6 5 -7 z" fill="#c25a4e" stroke="#5a3418" stroke-width="1.6"/><path d="M30 32 v3" stroke="#e8dcc0" stroke-width="1.6"/><path d="M16 40 h6 M42 40 h6" stroke="#6e4628" stroke-width="1.2" opacity=".55"/>',
    };
    const FARM_SKIN_ART = {
      meadow: '<circle cx="43" cy="21" r="8" fill="#ffd54a" stroke="#5a3418" stroke-width="2"/><path d="M43 9 v-4 M55 21 h4 M51 13 l3 -3 M51 29 l3 3" stroke="#f0b83a" stroke-width="2" stroke-linecap="round"/><path d="M6 50 Q24 33 40 42 Q52 47 58 50 Z" fill="#7cae4e" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 46 v-4 M24 44 v-4 M32 45 v-4" stroke="#4e8a34" stroke-width="1.6" stroke-linecap="round"/>',
      harvest: '<path d="M6 50 Q24 40 40 44 Q52 47 58 50 Z" fill="#e0a83a" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><g stroke="#c79a34" stroke-width="2.2" stroke-linecap="round"><path d="M22 44 L22 26"/><path d="M32 44 L32 22"/><path d="M42 44 L42 26"/></g><g fill="#e8b84a" stroke="#5a3418" stroke-width="1"><ellipse cx="22" cy="24" rx="3.6" ry="6"/><ellipse cx="32" cy="20" rx="3.8" ry="6.6"/><ellipse cx="42" cy="24" rx="3.6" ry="6"/></g>',
      winter: '<path d="M6 50 Q24 40 40 44 Q52 47 58 50 Z" fill="#eaf2f7" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M13 44 L18 33 L23 44 Z" fill="#4e8a34" stroke="#5a3418" stroke-width="1.6" stroke-linejoin="round"/><g stroke="#7cc0ee" stroke-width="2.6" stroke-linecap="round"><path d="M40 12 v20 M31 17 l18 10 M49 17 l-18 10"/></g><g stroke="#7cc0ee" stroke-width="1.6" stroke-linecap="round"><path d="M40 15 l-3 3 M40 15 l3 3 M40 29 l-3 -3 M40 29 l3 -3"/></g>',
      sakura: '<path d="M6 50 Q24 40 40 44 Q52 47 58 50 Z" fill="#f3d0dd" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round"/><g fill="#f48fb4" stroke="#5a3418" stroke-width="1.4"><ellipse cx="32" cy="17" rx="4" ry="6.2"/><ellipse cx="42" cy="24" rx="4" ry="6.2" transform="rotate(72 42 24)"/><ellipse cx="38" cy="35" rx="4" ry="6.2" transform="rotate(144 38 35)"/><ellipse cx="26" cy="35" rx="4" ry="6.2" transform="rotate(216 26 35)"/><ellipse cx="22" cy="24" rx="4" ry="6.2" transform="rotate(288 22 24)"/></g><circle cx="32" cy="26" r="3" fill="#ffe08a" stroke="#5a3418" stroke-width="1.2"/>',
    };
    function _svgWrap(art, size) {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" ' +
        'style="vertical-align:middle;overflow:visible" aria-hidden="true">' + art + '</svg>';
    }
    function _animIcon(id, size, m)  { const a = FARM_ANIM_ART[id];  return a ? _svgWrap(a, size) : ((m && m.emoji) || '❓'); }
    function _buildIcon(id, size, m) { const a = FARM_BUILD_ART[id]; return a ? _svgWrap(a, size) : ((m && m.emoji) || '❓'); }
    function _skinIcon(id, size, m)  { const a = FARM_SKIN_ART[id];  return a ? _svgWrap(a, size) : ((m && m.emoji) || '❓'); }

    // The drawing for ANY product or ingredient that has one, else null.
    function _prodArtOf(id) { return FARM_PROD_ART[id] || FARM_AGED_ART[id] || null; }

    // The <svg> markup for a product that has art, else null.
    function _iconSvg(id, size) {
      const art = _prodArtOf(id);
      return art ? _svgWrap(art, size) : null;
    }
    // Aged-good icon for the buyer sheet — the drawing, or the good's emoji.
    function _agedIcon(id, size) {
      return _iconSvg(id, size) || (FARM_AGED[id] || { emoji: '❓' }).emoji;
    }
    /* Any product draws its own icon if it has one; raw crops and animal drops
       (no art) keep their emoji. One helper for EVERY product render site —
       workshop in/out, market list, plane cart, orders — so a good looks the
       same wherever it shows. `m` is the caller's already-resolved meta entry. */
    function _prodIcon(id, size, m) {
      return _iconSvg(id, size) || (m && m.emoji) || (farmProductMeta()[id] || { emoji: '❓' }).emoji;
    }

    /* ── The same drawings, on the canvas ──
       The stall sign floating over the tier-2 buyer lists what it is taking
       today, and it was the last place aged goods were still an emoji — drawn
       with ctx.fillText, where an inline <svg> cannot reach. So each aged icon
       is rasterised once (SVG → data-URL Image, cached) and drawn into the sign
       in place of the glyph. An Image not yet decoded falls back to the emoji
       for that one frame rather than leaving a gap; the farm's animation loop
       repaints it as a drawing the moment it is ready. */
    const _imgCache = {};
    function _artImage(key, art) {
      if (key in _imgCache) return _imgCache[key];
      if (!art) { _imgCache[key] = null; return null; }
      const img = new Image();
      img.decoding = 'async';
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' + art + '</svg>');
      _imgCache[key] = img;
      return img;
    }
    function _prodImage(id)  { return _artImage('p:' + id, _prodArtOf(id)); }
    function _buildImage(id) { return _artImage('b:' + id, FARM_BUILD_ART[id]); }
    function _animImage(id)  { return _artImage('a:' + id, FARM_ANIM_ART[id]); }
    let _buyerOpen = false;
    let _buyerSold = {};        // this visit's progress, id → units sold
    let _buyerVisitKey = null;  // which visit _buyerSold belongs to

    /* What the buyer lists: the outputs of the ageing factories you actually
       own, whether or not any have been made yet. Listing them at zero is the
       point — the buyer is also where you read what tier 2 is worth, and a price
       you can work toward is worth more than a blank sheet.

       A LOCKED factory's output must never appear. The buyer would otherwise be
       advertising goods the farm has no way to make, which reads as a promise it
       cannot keep — and the locked building on the plot is already where that
       future is meant to be shown. */
    function _agedListable() {
      const ids = [];
      FARM_AGERS.forEach(function (def) {
        if (!_farmBuildOwned(def.id)) return;
        (def.recipes || []).forEach(function (r) {
          if (FARM_AGED[r.out.id] && ids.indexOf(r.out.id) < 0) ids.push(r.out.id);
        });
      });
      // Plus anything already in the crate, so a good can never become
      // unsellable if the data ever gets ahead of the buildings.
      const held = roomData.farmAged || {};
      Object.keys(held).forEach(function (id) {
        if ((held[id] || 0) > 0 && FARM_AGED[id] && ids.indexOf(id) < 0) ids.push(id);
      });
      return ids;
    }

    // This visit's list, frozen the way the plane's is: built once, kept in
    // roomData so it survives a reload and is the same on every device — and so
    // the list previewed while the shutters are down is the list that opens.
    function _buyerBuildWanted(visitStart) {
      return _pickWanted(_agedListable(), roomData.farmAged || {}, visitStart,
        FARM_BUYER_WANT_COUNT, FARM_BUYER_MAX_QTY, 0x5EED);   // its own salt, or it
    }                                                          // shadows the plane's picks
    function _buyerWantedFor(visitStart) {
      const snap = roomData.farmBuyerWanted;
      if (snap && snap.visitStart === visitStart && Array.isArray(snap.wanted) && snap.wanted.length) return snap.wanted;
      const wanted = _buyerBuildWanted(visitStart);
      if (wanted.length) roomData.farmBuyerWanted = { visitStart: visitStart, wanted: wanted };
      return wanted;
    }
    function farmBuyerState(now) {
      const b = _visitCycle(roomData.farmBuyerLeftAt, FARM_BUYER_COOLDOWN_MS, now || Date.now());
      b.wanted = _buyerWantedFor(b.visitStart);
      return b;
    }
    // Units of `w` still wanted this visit, and how many of those you can cover.
    function _buyerRemaining(w) { return Math.max(0, w.qty - (_buyerSold[w.id] || 0)); }
    function _buyerSellable(w) {
      return Math.min(_buyerRemaining(w), (roomData.farmAged || {})[w.id] || 0);
    }

    function openBuyerSheet() {
      const b = farmBuyerState();
      // New visit (or first open after a reload) → restore this visit's progress
      // so refreshing never re-offers units already sold.
      if (b.visitStart !== _buyerVisitKey) {
        _buyerVisitKey = b.visitStart;
        const snap = roomData.farmBuyerSold;
        _buyerSold = (snap && snap.visitStart === b.visitStart && snap.sold) ? Object.assign({}, snap.sold) : {};
      }
      _buyerOpen = true; renderBuyerSheet();
    }
    function closeBuyerSheet() {
      // Closing never shuts the stall — it stays open until it is cleared out or
      // you tap "close up". Same rule as the plane.
      _buyerOpen = false;
      const el = document.getElementById('buyerSheet');
      if (el) el.style.display = 'none';
    }
    function renderBuyerSheet() {
      const el = document.getElementById('buyerSheet');
      if (!el) return;
      if (!_buyerOpen) { el.style.display = 'none'; return; }
      const b = farmBuyerState(), aged = roomData.farmAged || {};

      if (!b.present) {
        // Shut → the NEXT list, dashed out. The whole point of showing it is
        // that ageing takes hours: you need to know today what to load tonight.
        const want = b.wanted.map(w => {
          return '<div class="cart-sq" style="cursor:default;border-style:dashed;border-color:var(--g-border);background:rgba(255,255,255,.04)">' +
            '<span class="cart-sq-icon">' + _agedIcon(w.id, 34) + '</span>' +
            '<span class="cart-sq-cap" style="color:var(--g-ink-soft)">×' + w.qty + '</span></div>';
        }).join('');
        el.innerHTML =
          '<div class="cp-head">🏛️ ' + T('Buyer is closed') + '</div>' +
          '<div class="farm-panel-empty" style="padding:0 2px 8px">' +
            T('Opens in {time}. Tomorrow it will take:', { time: '<b>' + _fmtFarmTime(b.nextInMs) + '</b>' }) + '</div>' +
          '<div class="cart-grid">' + want + '</div>' +
          '<button class="cp-close" onclick="closeBuyerSheet()">' + T('Close') + '</button>';
        el.style.display = 'block';
        return;
      }

      // Open → a square per unit it still wants. Ones you hold sell on a tap;
      // ones you don't point at the factory that ages them, so an empty crate
      // still tells you what to go and load.
      let squares = '', sellableTotal = 0;
      b.wanted.forEach(w => {
        const a = FARM_AGED[w.id] || { emoji: '❓', name: w.id, coins: 0 };
        const sellable = _buyerSellable(w);
        sellableTotal += sellable;
        const ag = _agerFor(w.id);
        for (let k = 0; k < _buyerRemaining(w); k++) {
          if (k < sellable) {
            squares += '<button class="cart-sq" onclick="sellOneToBuyer(\'' + w.id + '\')">' +
              '<span class="cart-sq-icon">' + _agedIcon(w.id, 34) + '</span><span class="cart-sq-cap">+' + a.coins + '🪙</span></button>';
            continue;
          }
          squares += ag
            ? '<button class="cart-sq make" onclick="goAgeForBuyer(\'' + ag.id + '\')" title="' + T('Age {product} in the {machine}', { product: T(a.name), machine: T(ag.name) }) + '">' +
                '<span class="cart-sq-icon">' + _agedIcon(w.id, 34) + '</span><span class="cart-sq-cap">' + _buildIcon(ag.id, 15, ag) + ' ' + T('age') + '</span></button>'
            : '<div class="cart-sq locked"><span class="cart-sq-icon">' + _agedIcon(w.id, 34) + '</span><span class="cart-sq-cap">' + T('age') + '</span></div>';
        }
      });
      const wantsLine = b.wanted.map(w => _agedIcon(w.id, 16) + '×' + _buyerRemaining(w)).join('  ');
      el.innerHTML =
        '<div class="cp-head">🏛️ ' + T('Aged goods buyer') + '</div>' +
        (b.wanted.length
          ? '<div class="farm-panel-empty" style="padding:0 2px 4px">' +
              T('Taking today: {list}', { list: wantsLine }) + ' · ' +
              T('tap a square to sell it; tap an “age” square to go to the factory that makes it.') + '</div>' +
            '<div class="cart-grid">' + squares + '</div>' +
            (sellableTotal > 0
              ? '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="sellAllToBuyer()">💰 ' + T('Sell all it takes') + '</button>'
              : '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="dismissBuyer()">🏛️ ' + T('Close up (reopens in {time})', { time: _fmtFarmTime(FARM_BUYER_COOLDOWN_MS) }) + '</button>')
          : '<div class="ws-status">' + T('Nothing aged yet. Load a factory on this plot and come back in a few hours.') + '</div>') +
        '<button class="cp-close" onclick="closeBuyerSheet()">' + T('Close') + '</button>';
      el.style.display = 'block';
    }

    // Which ageing factory produces `agedId` — for the "go and age this" squares.
    function _agerFor(agedId) {
      return FARM_AGERS.find(function (d) {
        return (d.recipes || []).some(function (r) { return r.out.id === agedId; });
      });
    }
    function goAgeForBuyer(agerId) { closeBuyerSheet(); openMachineModal(agerId); }

    /* Shut the stall: start the cooldown and pre-build the next list, so the
       preview is available the instant it closes rather than on the next tap. */
    async function _closeBuyerUp(quiet) {
      roomData.farmBuyerLeftAt = Date.now();
      _buyerSold = {}; _buyerVisitKey = null;
      roomData.farmBuyerSold = null;
      roomData.farmBuyerWanted = null;
      _buyerWantedFor(roomData.farmBuyerLeftAt + FARM_BUYER_COOLDOWN_MS);
      await saveRoom();
      if (!quiet) {
        showToast('🏛️ ' + T('Closed up — new list in {time}.', { time: _fmtFarmTime(FARM_BUYER_COOLDOWN_MS) }), '');
      }
      renderBuyerSheet(); renderFarmPanel(); renderAll();
    }
    async function dismissBuyer() { if (viewingUid === currentUid) await _closeBuyerUp(false); }

    async function sellOneToBuyer(id) {
      if (viewingUid !== currentUid) return;
      const b = farmBuyerState();
      if (!b.present) { closeBuyerSheet(); return showToast('🏛️ ' + T('The buyer is closed — come back tomorrow.'), ''); }
      const w = b.wanted.find(x => x.id === id);
      if (!w) return showToast('🏛️ ' + T("The buyer isn't taking that today."), '');
      if (_buyerSellable(w) <= 0) return showToast('🏛️ ' + T('It has taken all it wants of that.'), '');
      const a = FARM_AGED[id];
      roomData.farmAged[id] -= 1;
      roomData.coins += a.coins;
      logCoin(a.coins, T('Sold {name}', { name: T(a.name) }));
      _buyerSold[id] = (_buyerSold[id] || 0) + 1;
      roomData.farmBuyerSold = { visitStart: b.visitStart, sold: _buyerSold };
      showToast(T('Sold 1 {item} for {coins}', { item: a.emoji + ' ' + T(a.name), coins: a.coins + '🪙' }), 'success');
      // Cleared out → it closes on its own, exactly as the plane leaves.
      if (b.wanted.every(x => _buyerRemaining(x) <= 0)) return _closeBuyerUp(true);
      await saveRoom();
      renderBuyerSheet(); renderFarmPanel(); renderAll();
    }

    async function sellAllToBuyer() {
      if (viewingUid !== currentUid) return;
      const b = farmBuyerState();
      if (!b.present) { closeBuyerSheet(); return showToast('🏛️ ' + T('The buyer is closed — come back tomorrow.'), ''); }
      let sold = 0, coins = 0;
      b.wanted.forEach(w => {
        const n = _buyerSellable(w);
        if (n <= 0) return;
        roomData.farmAged[w.id] -= n;
        _buyerSold[w.id] = (_buyerSold[w.id] || 0) + n;
        sold += n; coins += n * (FARM_AGED[w.id] || { coins: 0 }).coins;
      });
      if (!sold) return;
      roomData.coins += coins;
      logCoin(coins, T('Sold aged goods'));
      roomData.farmBuyerSold = { visitStart: b.visitStart, sold: _buyerSold };
      showToast('🏛️ ' + T('Sold {n} aged goods for {coins}', { n: sold, coins: coins + '🪙' }), 'success');
      if (b.wanted.every(x => _buyerRemaining(x) <= 0)) return _closeBuyerUp(true);
      await saveRoom();
      renderBuyerSheet(); renderFarmPanel(); renderAll();
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
            FARM_ANIMALS.map(d => '<div class="rgb-cell"><canvas class="rgb-canvas" data-type="' + d.id + '"></canvas><span>' + d.emoji + ' ' + T(d.name) + '</span></div>').join('') +
          '</div>' +
          '<button class="cp-close" onclick="closeRgbPreview()">' + T('Close') + '</button>' +
        '</div>';
      el.style.display = 'flex';
      cancelAnimationFrame(_rgbPreviewAnim);
      const canvases = Array.from(el.querySelectorAll('.rgb-canvas'));
      // The CSS size of .rgb-canvas. Sized here rather than in the markup so the
      // buffer can carry the screen's real pixels — the drawing stays in these.
      const RGB_BOX = 108;
      canvases.forEach(c => fitCanvas(c, RGB_BOX, RGB_BOX));
      function frame(t) {
        for (const c of canvases) {
          const ctx = c.getContext('2d');
          const v = (FARM_VARIANTS[c.dataset.type] || []).find(x => x.rgb);
          ctx.clearRect(0, 0, RGB_BOX, RGB_BOX);
          ctx.save();
          ctx.translate(RGB_BOX / 2, RGB_BOX * 0.6);
          ctx.filter = 'hue-rotate(' + Math.round((t / 5) % 360) + 'deg) saturate(1.7)';
          drawFarmAnimal(ctx, c.dataset.type, RGB_BOX * 0.42, t / 120, false, v ? v.pal : null);
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
          { item: _prodIcon(def.drop.id, 16, def.drop) + ' ' + T(def.drop.name), cycle: _fmtFarmTime(cycleMs),
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
        actions = '<div class="ws-status">🔪 ' + T('Unlock the Butcher (tap its hut on the farm) to butcher animals.') + '</div>';
      }
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">' + _animIcon(def.id, 22, def) + ' ' + T(def.name) + mark + '</div>' +
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
          '<span class="ws-slot-no">' + _prodIcon(def.drop.id, 18, def.drop) + ' ' + T(def.drop.name) + '</span>' +
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

    // ── Single-building modal — tap a hut or an ageing factory on the land to
    // work just THAT one (start a batch / collect it), or to unlock it if it is
    // still locked. Buying happens here, where the building is, rather than from
    // a list in the side panel.
    function openMachineModal(id) { _workshopModalId = id; _binModalIdx = null; _makeChoiceSlot = null; _slotConfirm = false; _workshopModalOpen = true; renderWorkshopModal(); }

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
      _binModalIdx = null;
      const el = document.getElementById('workshopModal');
      if (el) el.style.display = 'none';
    }
    // A locked compost bin uses the SAME modal box as a locked building, so
    // "locked" behaves and looks identical wherever you meet it.
    function openBinUnlock(i) { _binModalIdx = i; _workshopModalOpen = true; _workshopModalId = null; renderWorkshopModal(); }
    function _renderBinUnlock(el, i) {
      const have = _compostBins(), cost = FARM_COMPOST_BIN_COSTS[i];
      const next = i === have;                       // bins open left to right
      const afford = roomData.coins >= cost;
      const capNow = _compostCap(), capThen = (have + 1) * FARM_COMPOST_PER_BIN;
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🪵 ' + T('Compost bin {n}', { n: i + 1 }) + '</div>' +
          '<div class="ws-sub">' + T('Holds {n} more fertilizer — the yard fills at the same speed, it just takes longer to run out of room.', { n: FARM_COMPOST_PER_BIN }) + '</div>' +
          '<div class="ws-status">' + T('Yard holds {now} now · {then} with this bin', { now: capNow, then: capThen }) + '</div>' +
          '<div class="ws-choose">' +
            (next
              ? '<button class="farm-shop-buy ws-recipe" onclick="unlockCompostBin(' + i + ')"' + (afford ? '' : ' disabled') + '>' +
                  (afford ? '🔓 ' + T('Unlock · {cost}', { cost: cost + '🪙' })
                          : T('Need {n} more', { n: (cost - (roomData.coins || 0)) + '🪙' })) + '</button>'
              : '<div class="ws-status">' + T('Open bin {n} first.', { n: have + 1 }) + '</div>') +
          '</div>' +
          '<button class="cp-close" onclick="closeWorkshopModal()">' + T('Close') + '</button>' +
        '</div>';
      el.style.display = 'flex';
    }
    function chooseMake(slot) { _makeChoiceSlot = slot; _slotConfirm = false; renderWorkshopModal(); }
    function cancelMake() { _makeChoiceSlot = null; renderWorkshopModal(); }
    function askOpenSlot() { _slotConfirm = true; _makeChoiceSlot = null; renderWorkshopModal(); }
    function cancelOpenSlot() { _slotConfirm = false; renderWorkshopModal(); }
    function renderWorkshopModal() {
      const el = document.getElementById('workshopModal');
      if (!el) return;
      if (_workshopModalOpen && _binModalIdx != null) { _renderBinUnlock(el, _binModalIdx); return; }
      const mc = _farmBuildDef(_workshopModalId);
      if (!_workshopModalOpen || !mc) { el.style.display = 'none'; return; }
      const meta = farmProductMeta(), stock = roomData.farmStock || {}, now = Date.now();
      // Both tiers take their ingredients out of farmStock; only where the OUTPUT
      // lands differs, so that is the only thing this needs the tier for.
      const agedStock = roomData.farmAged || {};
      const outStock = _isAger(mc.id) ? agedStock : stock;
      const m = _machineState(mc.id);
      const slotCost = _buildSlotCost(mc.id);
      // Ageing runs in hours against the machines' 20–60 minutes, so "240m" would
      // be a worse answer than "4h" for exactly the buildings that need it.
      const dur = ms => ms >= 90 * 60000
        ? T('{n}h', { n: Math.round(ms / 3600000) })
        : T('{n}m', { n: Math.ceil(ms / 60000) });
      const makesStr = mc.recipes.map(rc => _prodIcon(rc.out.id, 18, meta[rc.out.id])).join(' ');
      // What you have of the ingredients this machine uses (e.g. 🥛×3).
      const ingIds = mc.recipes.reduce((a, rc) => { Object.keys(rc.in).forEach(k => { if (a.indexOf(k) < 0) a.push(k); }); return a; }, []);
      const haveStr = ingIds.map(id => _prodIcon(id, 16, meta[id]) + '×' + (stock[id] || 0)).join('   ');
      const haveLine = '<div class="ws-status" style="margin:2px 0 8px">' + T('In stock: {list}', { list: haveStr }) + '</div>';
      let body;
      if (!m) {
        /* Locked. This IS the shop now — the building is bought here, where you
           tapped it, instead of from a list in the side panel. One modal serves
           every locked building, so "locked" behaves the same everywhere. */
        const afford = roomData.coins >= mc.cost && viewingUid === currentUid;
        const makesList = mc.recipes.map(rc => {
          const oM = meta[rc.out.id] || { emoji: '❓', name: rc.out.id };
          const inStr = Object.keys(rc.in).map(k => _prodIcon(k, 16, meta[k]) + '×' + rc.in[k]).join('+');
          return '<div class="ws-status">' + _prodIcon(rc.out.id, 20, oM) + ' ' + T(oM.name) + ' <small>' + inStr + ' · ' + dur(rc.timeMs) + '</small></div>';
        }).join('');
        body = '<div class="ws-status">🔒 ' + T('Locked — unlock it to start using it.') + '</div>' + makesList +
          '<div class="ws-choose"><button class="farm-shop-buy ws-recipe" onclick="buyFarmMachine(\'' + mc.id + '\')"' + (afford ? '' : ' disabled') + '>' +
            (afford ? '🔓 ' + T('Unlock · {cost}', { cost: mc.cost + '🪙' })
                    : T('Need {n} more', { n: (mc.cost - (roomData.coins || 0)) + '🪙' })) +
          '</button></div>';
      } else {
        // A grid of FARM_MAX_SLOTS squares: locked (buy) · idle (tap to choose) ·
        // making (shows the product + timer) · ready (tap to collect).
        let cells = '';
        for (let i = 0; i < FARM_MAX_SLOTS; i++) {
          if (i >= m.slots) {                                   // not opened yet
            const afford = roomData.coins >= slotCost;
            cells += '<button class="ws-cell locked"' + (afford ? '' : ' disabled') + ' onclick="askOpenSlot()">' +
              '<span class="ws-cell-icon">🔒</span><span class="ws-cell-cap">' + T('Open · {cost}', { cost: Math.round(slotCost / 1000) + 'k🪙' }) + '</span></button>';
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
                '<span class="ws-cell-icon">' + _prodIcon(recipe.out.id, 40, oM) + '</span><span class="ws-cell-cap">✅ ' + T('Collect') + '</span></button>';
            } else {
              cells += '<div class="ws-cell busy">' +
                '<span class="ws-cell-icon">' + _prodIcon(recipe.out.id, 40, oM) + '</span><span class="ws-cell-cap">⏳ ' + dur(recipe.timeMs - (now - job.at)) + '</span></div>';
            }
          }
        }
        const grid = '<div class="ws-grid">' + cells + '</div>';
        // recipe chooser shown below the grid while picking for an empty square
        let chooser = '';
        if (_makeChoiceSlot != null && _makeChoiceSlot < m.slots && !m.jobs[_makeChoiceSlot]) {
          const choices = mc.recipes.map((rc, r) => {
            const oM = meta[rc.out.id] || { emoji: '❓', name: rc.out.id };
            const inStr = Object.keys(rc.in).map(k => _prodIcon(k, 16, meta[k]) + '×' + rc.in[k]).join('+');
            const can = Object.keys(rc.in).every(k => (stock[k] || 0) >= rc.in[k]);
            // How many of this recipe's OUTPUT is already in the barn, so the
            // choice can be made on what you are short of, not on what it costs.
            const have = outStock[rc.out.id] || 0;
            return '<button class="farm-shop-buy ws-recipe" onclick="startMachineSlot(\'' + mc.id + '\',' + _makeChoiceSlot + ',' + r + ')"' + (can ? '' : ' disabled') + '>' +
              '<span class="ws-have' + (have ? '' : ' none') + '">' + T('have') + ' ×' + have + '</span>' +
              _prodIcon(rc.out.id, 24, oM) + ' ' + T(oM.name) + ' <small>' + inStr + ' · ' + dur(rc.timeMs) + '</small></button>';
          }).join('');
          chooser = '<div class="ws-choose"><div class="ws-slot-no">' + T('Slot {n} — pick a product', { n: _makeChoiceSlot + 1 }) + ' <span class="ws-x" onclick="cancelMake()">✕</span></div>' + choices + '</div>';
        }
        // confirmation before spending coins to open a new slot
        let confirmBanner = '';
        if (_slotConfirm) {
          confirmBanner = '<div class="ws-choose"><div class="ws-slot-no">' + T('Open a new slot for {cost}?', { cost: slotCost + '🪙' }) + ' <span class="ws-x" onclick="cancelOpenSlot()">✕</span></div>' +
            '<button class="farm-shop-buy ws-recipe" onclick="buyMachineSlot(\'' + mc.id + '\')"' + (roomData.coins < slotCost ? ' disabled' : '') + '>✓ ' + T('Open slot · {cost}', { cost: slotCost + '🪙' }) + '</button></div>';
        }
        body = grid + chooser + confirmBanner;
      }
      const butcherNote = mc.id === 'butcher'
        ? '<div class="ws-status" style="margin-top:8px">🔪 ' + T('Get meat by butchering an animal: 🐮 Animals tab → tap 🔪 on it.') + '</div>'
        : _isAger(mc.id)
        ? '<div class="ws-status" style="margin-top:8px">🏛️ ' + T('Aged goods sell only at the buyer on this plot — the plane never takes them.') + '</div>' : '';
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">' + _buildIcon(mc.id, 24, mc) + ' ' + T(mc.name) + '</div>' +
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
      /* Pinned to the WINDOW, never to the land. Expanding the farm widens the
         ground, and nothing that was already standing on it may move — see the
         camera notes above. The pens keep the exact span they have always had. */
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
    function _drawAnimalPens(ctx, W, H, pens, night, pal) {
      for (const p of pens) {
        const x = p.x0 * W, y = p.y0 * H, w = (p.x1 - p.x0) * W, h = (p.y1 - p.y0) * H;
        const r = Math.min(14, w * 0.2, h * 0.3);
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
        ctx.fillStyle = (pal && pal.penTint) || (night ? 'rgba(80,120,60,0.16)' : 'rgba(150,200,90,0.14)');   // paddock tint
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
      const pad = 6, inset = 4, gap = 3, icon = fs * 1.5;
      ctx.font = '800 ' + Math.round(fs) + 'px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const p of pens) {
        const penW = (p.x1 - p.x0) * W;
        const cnt = String(p.count), cntW = ctx.measureText(cnt).width;
        const img = _animImage(p.type);
        // Prefer the drawn animal + count; fall back to the emoji, then — if even
        // that won't fit — to a bare count, since the herd itself names the pen.
        let mode = (img && img.complete && img.naturalWidth > 0) ? 'icon' : 'emoji';
        let contentW = mode === 'icon' ? icon + gap + cntW : ctx.measureText(p.emoji + ' ' + cnt).width;
        if (contentW + pad * 2 + inset * 2 > penW) { mode = 'count'; contentW = cntW; }
        const bh = mode === 'icon' ? Math.max(fs + 6, icon + 4) : fs + 6;
        const bw = contentW + pad * 2;
        const bx = p.x1 * W - inset - bw, by = p.y0 * H + inset, midY = by + bh / 2;
        ctx.fillStyle = night ? 'rgba(20,14,6,0.82)' : 'rgba(40,26,12,0.78)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, bh / 2); else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = '#ffe9b0';
        let tx = bx + pad;
        if (mode === 'icon') { ctx.drawImage(img, tx, midY - icon / 2, icon, icon); tx += icon + gap; ctx.fillText(cnt, tx, midY + 0.5); }
        else if (mode === 'emoji') ctx.fillText(p.emoji + ' ' + cnt, tx, midY + 0.5);
        else ctx.fillText(cnt, tx, midY + 0.5);
      }
    }

    function _drawFarmTrough(ctx, W, H, night, t) {
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
      // The LIVE figure, not the settled one, so the grain visibly sinks with
      // the clock instead of stepping down once a minute.
      const foodMax = farmFoodMax(), food = _foodNow();
      const pct = Math.max(0, Math.min(1, food / foodMax));

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

      const herd = (roomData.farmAnimals || []).length;

      // Empty-trough alert — a little speech bubble so it reads at a glance
      if (pct === 0 && herd) {
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

      /* The count, on the trough, always — same badge the compost bins wear.
         It used to live in a hover tooltip, which on a phone means the feed
         level was invisible right up until the herd went hungry. Stacked above
         the empty-alert bubble when that is showing, so the two never collide. */
      const rate = _foodPerHr(), eating = rate > 0 && food > 0;
      const fs = Math.max(9, Math.min(14, tw * 0.20));
      const badgeY = topY - th * (pct === 0 && herd ? 1.25 : 0.42) - (fs + 7);
      const b = _drawMeterBadge(ctx, tx, badgeY, '🌾 ' + _foodShown(food) + '/' + foodMax, pct, fs, night,
        pct === 0, eating ? _unitFrac(food, false) : null, 2);

      /* −1 the instant a whole unit is eaten: the badge is the level, this is
         the deduction, and only the deduction reads as "they are eating it".
         It hangs off the badge rather than off the trough, so it can never fly
         up through the number it is explaining.

         Held for the first moments after a refill. A refill lands the trough on
         exactly foodMax, and sitting on a whole number is what fires a pop — so
         the "+15 feed bought" toast used to arrive with a −1 beside it, over a
         number that had not moved. Nothing has been eaten yet; wait until at
         least one pop's worth of eating actually has been. */
      if (eating && (foodMax - food) * 3600000 / rate >= FARM_UNIT_POP_MS) {
        _drawUnitPop(ctx, b.bx + b.bw / 2, b.by - fs * 0.45, fs * 3.4,
          _unitCrossedAgo(food, rate, false), '−1', '#ffbfa8');
      }
    }

    // A wooden signboard on a post, drawn to the left of a garden row. `st` is a
    // farmRowState() result: blank when empty, crop emoji + name (+ % or ✨) else.
    // 📮 The mailbox on your own farm — a post-mounted box whose flag stands up
    // (with a count badge) whenever visitors have left something to claim. Same
    // wood/clay palette as the signboards and pen rails.
    function _drawFarmMailbox(ctx, W, H, t, night, pal) {
      const p = _farmMailPos(W, H);
      const gx = p.x * W, gy = p.y * H;
      const s = _farmMailSize(W, H);                       // box width, and the unit for everything else
      const n = _farmInboxCount();
      const bob = n ? Math.sin(t / 260) * (s * 0.06) : 0;  // a gentle nudge while mail is waiting

      ctx.fillStyle = night ? 'rgba(0,0,0,.32)' : ((pal && pal.groundShadow) || 'rgba(30,62,20,.24)');
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
      /* A mixed row shows every crop in it, not just the first one planted. The
         sign used to name whichever crop happened to be in the lowest bed, so a
         row of wheat, carrot and corn called itself wheat — and could say
         "✨ Ready" (which fires on ANY ripe bed) while naming a crop that was
         still growing. Three kinds is the most there are, so they all fit. */
      const kinds = (st.kinds && st.kinds.length ? st.kinds : [st.cropId])
        .map(id => FARM_CROPS.find(c => c.id === id)).filter(Boolean);
      const mixed = kinds.length > 1;
      ctx.fillStyle = '#fff3d6';
      ctx.font = Math.round(h * (mixed ? 0.26 : 0.34)) + 'px system-ui,sans-serif';
      ctx.fillText(kinds.length ? kinds.map(c => c.emoji).join('') : '🌱', cx, cy - h * 0.08);
      ctx.font = '800 9px system-ui,sans-serif';
      ctx.fillText(
        st.state === 'ripe' ? '✨ ' + T('Ready')
          : mixed ? T('{n} kinds', { n: kinds.length })
          : (kinds[0] ? T(kinds[0].name) : ''),
        cx, cy + h * 0.24);
      if (st.state === 'growing') {
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(Math.round(st.progress * 100) + '%', cx, cy + h * 0.42);
      }
    }

    // Garden plots: brown soil tiles; growing crops show a progress bar, ripe
    // crops bob with a ✨ to invite a harvest tap.
    /* The front board of a raised bed.

       It used to be one flat brown rectangle with a single seam ruled across
       it, which reads as plastic. Wood is cheap to suggest properly: two
       stacked planks each shaded light-top to dark-bottom so they look round,
       grain streaks running the LENGTH of the board (grain follows the plank,
       and drawing it any other way is the tell), an end joint where two boards
       meet, and a knot on some beds but not all.

       Every variation comes from `seed` — the plot's own index — so a bed's
       grain belongs to that bed and is identical on every frame. Grain rolled
       per frame would crawl, which is worse than no grain at all. */
    function _drawBedBoard(ctx, x, y, w, h, seed) {
      const hash = (n) => { const v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
      const planks = 2, ph = h / planks;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

      for (let k = 0; k < planks; k++) {
        const py = y + k * ph;
        const tone = 0.86 + hash(seed * 3.1 + k) * 0.28;          // each plank cut from a different board
        const gr = ctx.createLinearGradient(0, py, 0, py + ph);
        gr.addColorStop(0, 'rgb(' + Math.round(82 * tone) + ',' + Math.round(58 * tone) + ',' + Math.round(32 * tone) + ')');
        gr.addColorStop(1, 'rgb(' + Math.round(52 * tone) + ',' + Math.round(35 * tone) + ',' + Math.round(18 * tone) + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(x, py, w, ph);

        // grain — long, shallow arcs along the plank
        ctx.lineWidth = Math.max(0.6, ph * 0.07);
        for (let n = 0; n < 3; n++) {
          const f = hash(seed * 5.7 + k * 2.3 + n);
          const gy = py + ph * (0.22 + f * 0.6);
          ctx.strokeStyle = 'rgba(30,18,6,' + (0.10 + f * 0.12).toFixed(2) + ')';
          ctx.beginPath();
          ctx.moveTo(x - 1, gy);
          ctx.quadraticCurveTo(x + w * (0.3 + f * 0.4), gy + ph * (f - 0.5) * 0.35, x + w + 1, gy);
          ctx.stroke();
        }

        // where two boards meet end to end
        const jx = x + w * (0.3 + hash(seed * 9.4 + k) * 0.4);
        ctx.strokeStyle = 'rgba(24,14,4,0.35)';
        ctx.lineWidth = Math.max(0.7, w * 0.008);
        ctx.beginPath(); ctx.moveTo(jx, py); ctx.lineTo(jx, py + ph); ctx.stroke();

        // a knot, on some planks
        const kf = hash(seed * 13.7 + k * 4.1);
        if (kf > 0.78) {                                     // a knot is a feature, not a texture
          const kx = x + w * (0.15 + hash(seed * 17.3 + k) * 0.7), ky = py + ph * 0.5;
          const kr = Math.max(1, ph * 0.16);
          ctx.fillStyle = 'rgba(28,16,5,0.45)';
          ctx.beginPath(); ctx.ellipse(kx, ky, kr, kr * 0.72, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(28,16,5,0.22)'; ctx.lineWidth = Math.max(0.5, kr * 0.35);
          ctx.beginPath(); ctx.ellipse(kx, ky, kr * 1.9, kr * 1.25, 0, 0, Math.PI * 2); ctx.stroke();
        }

        // the lit edge of each plank, and the shadow it casts on the one below
        ctx.fillStyle = 'rgba(255,226,180,0.16)';
        ctx.fillRect(x, py, w, Math.max(0.7, ph * 0.09));
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.fillRect(x, py + ph - Math.max(0.7, ph * 0.08), w, Math.max(0.7, ph * 0.08));
      }
      ctx.restore();
    }

    function _drawFarmPlots(ctx, W, H, t) {
      const plots = roomData.farmPlots || [];
      const now = Date.now();
      // Tile height is capped to the row slot so beds never overlap the next row
      // (or the animals) when the soil band is compressed at high expansion levels.
      const tile = _farmTile(W, H);
      // Every bed in a row shares its top edge, so the soil gradient is the same
      // for all of them. One per row rather than one per bed — there were 30 of
      // these a frame. Per call, so it cannot go stale when the stage resizes.
      const _soilGrad = {};
      ctx.textAlign = 'center';
      // Row signboards (left of each row that owns ≥1 plot). A narrow stage has
      // none — _farmSignW returns 0 there and the width goes to the beds.
      if (_farmSignW(W, H) > 0) {
        const _rows = farmRowCount(plots.length, _farmPerRow(W));
        for (let _r = 0; _r < _rows; _r++) {
          const _st = farmRowState(farmRowIndices(plots.length, _r, _farmPerRow(W)).map(k => plots[k]), FARM_CROPS, now);
          const _sp = _farmSignPos(_r, W, H);
          _hoverScaled(ctx, _farmHoverK('sign', _r), _sp.x * W, _sp.y * H, () => _drawFarmSign(ctx, W, H, _r, _st));
        }
      }
      plots.forEach((plot, i) => {
        const pos = _farmPlotPos(i, W, H);
        const px = pos.x * W, py = pos.y * H;
        /* Pointed at → the bed and its crop grow together. Wrapped as a callback
           rather than a bare save/restore because the body returns early on an
           empty bed, and a bare save would leak the transform on that path. The
           body below keeps its own indentation, so this stays two added lines. */
        _hoverScaled(ctx, _farmHoverK('plot', i), px, py, () => {
        // 3D raised garden bed: front (wooden) face for depth + top soil face
        const _x0 = px - tile / 2, _y0 = py - tile / 2, _r = Math.max(3, tile * 0.16);
        const _depth = tile * 0.30;
        _drawBedBoard(ctx, _x0, _y0 + tile - _r, tile, _depth + _r, i + 1);   // front face
        ctx.fillStyle = 'rgba(0,0,0,0.22)';                          // where it meets the ground
        ctx.fillRect(_x0, _y0 + tile + _depth - 2, tile, 2);
        const _gk = Math.round(_y0);                                  // top soil face
        let _tg = _soilGrad[_gk];
        if (!_tg) {
          _tg = _soilGrad[_gk] = ctx.createLinearGradient(0, _y0, 0, _y0 + tile);
          _tg.addColorStop(0, '#8a6038'); _tg.addColorStop(1, '#6b4a2c');
        }
        ctx.fillStyle = _tg;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0, _y0, tile, tile, _r); ctx.fill(); }
        else ctx.fillRect(_x0, _y0, tile, tile);
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0, _y0, tile, tile * 0.30, _r); ctx.fill(); }
        else ctx.fillRect(_x0, _y0, tile, tile * 0.16);
        /* Worked earth inside the bed. The ruled tilled lines are gone the same
           way the band's furrows went; what is left is the soil itself — a
           handful of clods with a lit top and a shadow under each, keyed to the
           plot index so a bed's earth is its own and never crawls. Without this
           the beds would be the smoothest thing on a field of grainy ground. */
        (function () {
          const hb = (n2) => { const v = Math.sin(n2) * 43758.5453; return v - Math.floor(v); };
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(_x0, _y0, tile, tile, _r); else ctx.rect(_x0, _y0, tile, tile);
          ctx.clip();
          for (let c = 0; c < 7; c++) {
            const a1 = hb((i + 1) * 12.3 + c * 3.7), a2 = hb((i + 1) * 27.1 + c * 5.3), a3 = hb((i + 1) * 41.9 + c * 7.1);
            const cx2 = _x0 + tile * (0.12 + a1 * 0.76);
            const cy2 = _y0 + tile * (0.30 + a2 * 0.62);      // below the lit upper lip
            const cr = Math.max(0.9, tile * (0.045 + a3 * 0.05));
            ctx.fillStyle = 'rgba(58,38,18,0.34)';
            ctx.beginPath(); ctx.ellipse(cx2, cy2, cr, cr * 0.6, a3 * Math.PI, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(190,146,92,0.26)';
            ctx.beginPath(); ctx.ellipse(cx2 - cr * 0.2, cy2 - cr * 0.24, cr * 0.6, cr * 0.28, a3 * Math.PI, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        })();
        // Wooden frame edge — two passes so the rim reads as the same timber as
        // the front board: the dark line is the wood, the lighter inset is the
        // sunlit top of the frame.
        ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 2;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0, _y0, tile, tile, _r); ctx.stroke(); }
        else ctx.strokeRect(_x0, _y0, tile, tile);
        ctx.strokeStyle = 'rgba(214,168,110,0.42)'; ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_x0 + 1.2, _y0 + 1.2, tile - 2.4, tile - 2.4, Math.max(1, _r - 1)); ctx.stroke(); }
        else ctx.strokeRect(_x0 + 1.2, _y0 + 1.2, tile - 2.4, tile - 2.4);
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
        });   // end of the hover-scaled bed
      });
    }

    /* ── What the mouse is pointing at ────────────────────────────────────
       One resolver answers this, and the CLICK handler asks the same one.
       That is the whole point: two copies would drift, and the highlight
       would start promising a bed that the tap hands to a signboard. The
       farm already states the rule for the cursor further down — "the cursor
       never promises a mailbox that a click would hand to a hut".

       Only one thing can be pointed at, so a single record and a single clock
       carry the grow animation. The clock is the frame timestamp rather than
       performance.now(), so it cannot drift from the loop that draws it. */
    let _farmHover = null;       // target record below, or null over bare ground
    let _farmHoverKey = '';      // its identity, so the draw loop can spot a change
    let _farmHoverSeen = '';     // the key the draw loop last noticed
    let _farmHoverAt = 0;        // frame time this target was first pointed at
    let _farmHoverNow = 0;       // this frame's timestamp
    const FARM_HOVER_SCALE = 0.12;   // how much bigger a pointed-at thing grows
    const FARM_HOVER_MS = 120;       // how long it takes to get there

    function _farmTargetId(tg) {
      if (!tg) return null;
      return tg.id != null ? tg.id : tg.idx != null ? tg.idx : tg.row;
    }
    function _farmTargetKey(tg) {
      return tg ? tg.kind + ':' + _farmTargetId(tg) : '';
    }

    /* What a tap at (cx, cy) would hit — normalised coords, null for bare
       ground. This is the click handler's own logic, moved here unchanged and
       in its original order: sky, then beds/signs but only below the fence,
       then produce, then animals. */
    function _farmTargetAt(cx, cy, W, H) {
      // The tap arrives in window coordinates. The mailbox and plane live there
      // too, so _farmSkyTarget takes it as-is and shifts the huts to meet it.
      // Everything below stands on the land, so the tap moves onto the land
      // instead — one conversion, here, rather than in each hit-test.
      const sky = _farmSkyTarget(cx, cy, W, H, _farmCamX);
      if (sky) return { kind: 'sky', id: sky };
      const wx = cx + _farmCamX;
      /* The bed strip is a nearest-wins partition with no distance limit, which
         is right ON the farm — a tap below the fence always means SOME bed. Off
         the farm it is not: every bed lives in 0..1, so without this bound a tap
         on the empty deck of a bought plot would plant in whichever bed happened
         to be closest, one screen away and out of sight. */
      // The sack stands in the field, so it has to win before the nearest-bed
      // partition below claims every tap under the fence.
      if (roomData.farmLandL && viewingUid === currentUid && _fertBagHit(wx, cy, W, H)) return { kind: 'fert' };
      const plots = (wx >= 0 && wx <= 1) ? (roomData.farmPlots || []) : [];
      if (plots.length && cy > _farmDivY()) {
        let row = 0, idx = null, best = Infinity;
        for (let i = 0; i < plots.length; i++) {
          const pp = _farmPlotPos(i, W, H);
          const d = Math.hypot(pp.x - wx, pp.y - cy);
          if (d < best) { best = d; row = Math.floor(i / _farmPerRow(W)); idx = i; }
        }
        if (_farmSignW(W, H) > 0) {
          const rows = farmRowCount(plots.length, _farmPerRow(W));
          for (let r = 0; r < rows; r++) {
            const sp = _farmSignPos(r, W, H);
            const d = Math.hypot(sp.x - wx, sp.y - cy);
            if (d < best) { best = d; row = r; idx = null; }   // the row, not one bed
          }
        }
        return idx == null ? { kind: 'sign', row: row } : { kind: 'plot', row: row, idx: idx };
      }
      const drops = roomData.farmDrops || [];
      for (let i = 0; i < drops.length; i++) {
        if (Math.hypot(drops[i].x - wx, drops[i].y - cy) < 0.07) return { kind: 'drop', idx: i };
      }
      let animal = null, aDist = 0.10;
      for (const a of (roomData.farmAnimals || [])) {
        const st = _farmAnimStates[a.id];
        if (!st) continue;
        const d = Math.hypot(st.x - wx, st.y - cy);
        if (d < aDist) { aDist = d; animal = a; }
      }
      return animal ? { kind: 'animal', id: animal.id } : null;
    }

    // This frame's scale for one thing: 1 unless it is the pointed-at one.
    function _farmHoverK(kind, ident) {
      if (!_farmHover || _farmHover.kind !== kind || _farmTargetId(_farmHover) !== ident) return 1;
      const p = Math.min(1, Math.max(0, (_farmHoverNow - _farmHoverAt) / FARM_HOVER_MS));
      return 1 + FARM_HOVER_SCALE * (1 - (1 - p) * (1 - p));    // ease out
    }

    // Grow `paint` about (px, py). A no-op at rest, so every call site stays cheap.
    function _hoverScaled(ctx, k, px, py, paint) {
      if (k === 1) { paint(); return; }
      ctx.save();
      ctx.translate(px, py); ctx.scale(k, k); ctx.translate(-px, -py);
      paint();
      ctx.restore();
    }

    /* An animal costs 63-80 canvas calls, and the herd paid every one of them
       for every animal on every frame — at 20 animals that is more than the
       whole field costs, and the cap rises by 10 per expansion.

       But almost none of it moves. Only the legs swing (a sine of the walk
       phase), and a standing animal is identical frame to frame. So each pose
       is painted ONCE into a small offscreen canvas and blitted from then on:
       80 calls become 1.

       The walk is quantised into _ANIM_POSES steps around the cycle — at ~750ms
       per cycle that is about 3 frames a step, which reads as a walk rather
       than a slideshow. Standing is one extra pose.

       Two things keep the cache small: it is keyed by type + variant (there are
       only ever 4 x 3 of those), and it is thrown away whenever the drawn size
       changes, which is the only other thing a sprite depends on. */
    const _ANIM_POSES = 6;
    let _animSprites = {};
    let _animSpriteSize = 0;

    function _farmAnimalSprite(type, variant, size, moving, lp, pal) {
      const sz = Math.round(size);                     // a sub-pixel wobble must not thrash the cache
      if (sz !== _animSpriteSize) { _animSprites = {}; _animSpriteSize = sz; }
      const TAU = Math.PI * 2;
      const pose = moving ? Math.floor((((lp % TAU) + TAU) % TAU) / TAU * _ANIM_POSES) : -1;
      const key = type + '|' + variant + '|' + pose;
      if (_animSprites[key]) return _animSprites[key];
      // The widest painter reaches about 1.1x its size once offsets stack, so
      // 1.4 leaves room rather than clipping a horn or a tail.
      const R = Math.ceil(sz * 1.4);
      let cvs;
      try { cvs = document.createElement('canvas'); } catch (e) { return null; }
      if (!cvs || !cvs.getContext) return null;
      // Baked in device pixels and blitted back at CSS size, or every animal on
      // the farm would be a soft copy of a sharp drawing.
      fitCanvas(cvs, R * 2, R * 2);
      const c = cvs.getContext('2d');
      c.translate(R, R);                               // the painters draw around the origin
      drawFarmAnimal(c, type, sz, pose < 0 ? 0 : (pose + 0.5) / _ANIM_POSES * TAU, moving, pal);
      return (_animSprites[key] = { cvs: cvs, R: R });
    }

    /* Measuring text means shaping the glyphs, and it was the priciest call in
       the animal loop — once per animal per frame, for a level badge that only
       changes when the animal levels up. Keyed by font AND text, so a resize
       (which changes the font size) simply measures each badge once more. */
    const _lvBadgeW = {};
    function _lvTextW(ctx, font, txt) {
      const k = font + '|' + txt;
      if (_lvBadgeW[k] === undefined) _lvBadgeW[k] = ctx.measureText(txt).width;
      return _lvBadgeW[k];
    }

    function drawFarmCanvas() {
      cancelAnimationFrame(_farmAnimFrame);
      const view = document.getElementById('farmView');
      const cvs = document.getElementById('farmCanvas');
      if (!view || !cvs) return;
      const ctx = cvs.getContext('2d');
      let W = view.clientWidth, H = view.clientHeight;
      fitCanvas(cvs, W, H);
      const hour = new Date().getHours();
      const night = hour >= 19 || hour < 6;
      let lastFrame = 0;

      function frame(t) {
        if (!isFarmView) return;
        if (t - lastFrame < 42) { _farmAnimFrame = requestAnimationFrame(frame); return; }
        lastFrame = t;
        // Hover clock, taken from the frame timestamp so the grow animation can
        // never drift from the loop drawing it.
        _farmHoverNow = t;
        if (_farmHoverKey !== _farmHoverSeen) { _farmHoverSeen = _farmHoverKey; _farmHoverAt = t; }
        const nw = view.clientWidth, nh = view.clientHeight;
        if (nw && nh && (nw !== W || nh !== H)) { W = nw; H = nh; fitCanvas(cvs, W, H); }
        ctx.clearRect(0, 0, W, H);
        const windSway = Math.sin(t / 1400) * 0.012;

        /* Two layers. `world()` slides the ground and everything standing on
           it; `fixed()` puts the pen back at the window's own origin for the
           sky, the weather, and the two targets that must never scroll out of
           reach. setTransform rather than save/restore, because painters do
           their own save/restore inside and would otherwise unwind ours. */
        _farmStepCam();
        _farmClampCam();
        _syncFarmPanBtns();
        const _camPx = _farmCamX * W;
        const LAND = _farmWorldW() * W;              // the ground's full width in px
        const LEFT = -_farmLandL() * W;              // …and where its left edge is, in world px
        /* Both carry the device-pixel scale: setTransform REPLACES the matrix, so
           leaving it at 1 here would throw away what fitCanvas set up and paint
           the whole farm at a quarter size on a retina screen. */
        const _dpr = canvasDpr();
        const world = function () { ctx.setTransform(_dpr, 0, 0, _dpr, -_camPx * _dpr, 0); };
        const fixed = function () { ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0); };

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

        // Everything from here to the weather is ground, and slides with it.
        world();

        // Animal pasture — grass from the horizon down to the dividing fence
        const skyY = H * FARM_SKY_Y;
        const grass = ctx.createLinearGradient(0, skyY, 0, gy);
        grass.addColorStop(0, pal.grass[0]);                      // soft sunny top
        grass.addColorStop(0.5, pal.grass[1]);
        grass.addColorStop(1, pal.grass[2]);                      // richer deep bottom
        ctx.fillStyle = grass;
        ctx.fillRect(LEFT, skyY, LAND, gy - skyY);


        /* Both bands get their grain from one baked texture, blitted after the
           two fills. No mown stripes, no depth bands, no tilled rows and no
           furrows any more: the pasture's depth comes from tufts drawn smaller
           toward the horizon, and the crop band's from clods doing the same —
           which is how ground actually recedes, rather than ruled lines
           pretending it does. */
        // Baked at the LAND's width, not the window's, so the new ground carries
        // the same tufts and clods as the old. The width is in the cache key, so
        // buying an expansion rebuilds it once and never again.
        const _tex = _farmGroundTexture(LAND, H, skyY, gy, pal,
          Math.round(LAND) + 'x' + H + '|' + (_theme ? _theme.id : '?') + '|' + (night ? 'n' : 'd') + '|' + Math.round(gy));
        if (_tex) ctx.drawImage(_tex, LEFT, 0, LAND, H);
        else {
          // Same origin shift for the un-baked path, or the fallback scatter would
          // start at the farm's left edge and leave the left plot bare.
          ctx.save(); ctx.translate(LEFT, 0);
          _drawFarmScatter(ctx, LAND, H, skyY, gy, pal.groundFx);
          _drawFarmDeck(ctx, LAND, H, gy, H, pal);
          ctx.restore();
        }

        // Fences: top of the pasture and the divider (farm | crops). No bottom
        // fence — its posts are a fixed 22px tall, so on a short stage they cut
        // through the last bed row, and the soil band reads fine without it.
        const topFenceY = H * FARM_TOPFENCE_Y;
        // Both fences run the length of the land. _drawFence spaces its posts a
        // fixed 18px apart and derives the count from the length, so a longer
        // run simply gets more posts — nothing stretches.
        _drawFence(ctx, LEFT + LAND * 0.02, topFenceY, LAND * 0.96, night);
        _drawFence(ctx, LEFT + LAND * 0.02, gy, LAND * 0.96, night);
        // A skin can swap the SHAPE of the trees, not just their colour.
        if (pal.treeShape === 'conifer') {
          _drawFarmConifer(ctx, W * 0.06, topFenceY, H * 0.18, windSway, pal, t);
          _drawFarmConifer(ctx, W * 0.94, topFenceY, H * 0.15, windSway * 0.7, pal, t);
        } else {
          _drawHDTree(ctx, W * 0.06, topFenceY, H * 0.18, windSway, night, pal);
          _drawHDTree(ctx, W * 0.94, topFenceY, H * 0.15, windSway * 0.7, night, pal);
        }

        _drawFarmSnowman(ctx, W, H, pal);   // before the trough and the herd, so both pass in front
        _drawFarmTrough(ctx, W, H, night, t);
        if (viewingUid === currentUid) {                                            // your mail only
          // On the land, like everything else the farm owns: the post stands at
          // its own spot on the farm and stays there, so panning to a plot
          // leaves it behind rather than dragging it along overhead.
          const _mp = _farmMailPos(W, H);
          _hoverScaled(ctx, _farmHoverK('sky', '#mail'), _mp.x * W, _mp.y * H, () => _drawFarmMailbox(ctx, W, H, t, night, pal));
        }
        _drawFarmPlots(ctx, W, H, t);
        _drawFertTargets(ctx, W, H, t);   // rings on the beds the sack can still reach
        _drawFertBag(ctx, W, H, t, night, pal);

        // Drops on the ground (visual juice) — collected via the Produce modal.
        // Cap how many we draw so a full pool (up to 20/type) doesn't clutter.
        ctx.textAlign = 'center';
        const pulse = 1 + Math.sin(t / 300) * 0.08;
        const _dd = roomData.farmDrops || [];
        for (let i = 0; i < Math.min(_dd.length, 14); i++) {
          const def = FARM_ANIMALS.find(f => f.id === _dd[i].type);
          if (!def) continue;
          const size = Math.max(20, Math.min(W, H) * 0.045) * pulse * _farmHoverK('drop', i);
          const dx = _dd[i].x * W, dy = _dd[i].y * H, dimg = _prodImage(def.drop.id);
          if (dimg && dimg.complete && dimg.naturalWidth > 0) {
            ctx.drawImage(dimg, dx - size / 2, dy - size / 2, size, size);
          } else {
            ctx.font = Math.round(size) + 'px sans-serif';
            ctx.fillText(def.drop.emoji, dx, dy);
          }
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
        _drawWorkshopMachines(ctx, W, H, t, night, pal);   // huts behind the herd
        // Side land. Each returns immediately if its plot is unbought, so the
        // farm before any expansion draws exactly what it always did.
        _drawCompostYard(ctx, W, H, t, night, pal);
        _drawAgeingFactories(ctx, W, H, t, night, pal);
        _drawTier2Buyer(ctx, W, H, t, night, pal);
        const _blocked = _farmBlockedZones();           // workshop + cart: animals keep out
        const _herd = roomData.farmAnimals || [];
        // Group the herd into one fenced pen per type, then keep each animal in its pen.
        const _pens = _buildAnimalPens(_herd, penTop, penBot, W, H);
        _drawAnimalPens(ctx, W, H, _pens.list, night, pal);
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
          ctx.fillStyle = night ? 'rgba(0,0,0,.30)' : (pal.groundShadow || 'rgba(30,62,20,.24)');
          ctx.beginPath();
          ctx.ellipse(px, py + size * 0.30, size * 0.40, size * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(px, py + bob);
          const _hkA = _farmHoverK('animal', a.id);
          if (_hkA !== 1) ctx.scale(_hkA, _hkA);   // pointed at → lifts toward the player
          if (!st.facingRight) ctx.scale(-1, 1); // drawers face right
          // RGB coat: animated rainbow shimmer (filter is reset by ctx.restore()).
          // ~1.8s per full color cycle so it visibly shimmers (was t/14 ≈ 5s, too slow).
          if (a.variant === 'rgb') ctx.filter = 'hue-rotate(' + Math.round((t / 5 + idx * 60) % 360) + 'deg) saturate(1.7)';
          // Blit the baked pose. The mirror and the RGB filter still apply here,
          // so a left-facing or rainbow animal looks exactly as it always did.
          const _spr = _farmAnimalSprite(a.type, a.variant || '', size, st.moving, t / 120, _farmVariantPal(a));
          if (_spr) ctx.drawImage(_spr.cvs, -_spr.R, -_spr.R, _spr.R * 2, _spr.R * 2);
          else drawFarmAnimal(ctx, a.type, size, t / 120, st.moving, _farmVariantPal(a));
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
          const lvFont = '800 ' + Math.round(Math.max(9, size * 0.15)) + 'px sans-serif';
          ctx.font = lvFont;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const lw = _lvTextW(ctx, lvFont, lvTxt) + size * 0.16, lh = Math.max(12, size * 0.2);
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

        // Back to the window for the rest: sky furniture, the plane and the
        // weather all belong to the view, not to the ground under it.
        fixed();
        if (!night) _drawClouds(ctx, W, H, t, pal.cloud);

        // The skin's sky set piece — after the clouds so it reads as nearer
        // than them, before the plane so it can never sit on top of a tap target.
        _drawFarmSkyFx(ctx, W, H, t, pal, windSway);

        /* Sky merchant plane. Still drawn LAST so drifting clouds never hide the
           tappable prompt — but back on the LAND while it draws: it parks over
           the farm at FARM_CART_X and stays over the farm, so panning to a plot
           leaves it behind instead of towing it across the new ground. Order and
           layer are separate concerns; only the transform changes here. */
        if (viewingUid === currentUid) {
          world();
          const _cartS = _farmCart();
          if (_cartLeaveStart && Date.now() - _cartLeaveStart < CART_LEAVE_MS) {
            const lp = (Date.now() - _cartLeaveStart) / CART_LEAVE_MS;
            _drawMerchantCart(ctx, W, H, t, lp * 0.7, 1 - lp * 0.9);  // fly right + fade
          } else {
            if (_cartLeaveStart) _cartLeaveStart = 0;
            const _cp = _farmCartPos(W, H), _hkC = _farmHoverK('sky', '#cart');
            if (_cartS.present) _hoverScaled(ctx, _hkC, _cp.x * W, _cp.y * H, () => _drawMerchantCart(ctx, W, H, t));
            else _hoverScaled(ctx, _hkC, _cp.x * W, _cp.y * H, () => _drawCartAway(ctx, W, H, t, _cartS));
          }
          fixed();   // weather below belongs to the view again
        }
        // Weather LAST, so snow and petals fall in front of the animals rather
        // than behind them — that one ordering is most of why it reads as
        // weather at all.
        _drawFarmWeather(ctx, W, H, t, pal.weather);

        fixed();   // leave the pen where the next frame expects it
        _farmAnimFrame = requestAnimationFrame(frame);
      }
      _farmAnimFrame = requestAnimationFrame(frame);
      _attachFarmPointerHandlers(cvs);
    }

    /* What is lying ON the grass.

       A pink fill reads as paint; what makes it read as a carpet of blossom is
       seeing the individual petals that formed it. Scattered in NORMALISED
       coordinates from a hash of the index, so the drift is stable frame to
       frame and simply rescales when the stage resizes — a scatter that
       reshuffled every frame would shimmer, and one keyed to pixels would jump
       when the panel opens.

       Drawn straight after the ground and before anything interactive, so it
       always sits UNDER the animals, drops, plots and the trough. It is texture,
       never a target. */
    /* The winter farm's trees are firs, dressed for Christmas.

       A skin cannot do this by recolouring: a round canopy painted white is a
       snowy oak, not a fir. So the farm draws its own tree when the skin asks
       for one, and room-layers.js — which the room's Outside View shares —
       keeps the only tree it has ever had.

       The base tier is 0.30 of the tree's height half-wide, deliberately under
       the round canopy's 0.316, so swapping shapes cannot push the right-hand
       tree further over the mailbox than the tree already standing there does.

       Sway comes from the same wind the rest of the farm uses, and grows toward
       the top so the tree bends rather than slides. */
    function _drawFarmConifer(ctx, tx, ty, treeH, sway, pal, t) {
      const p = pal || {};
      const trunkW = treeH * 0.055, trunkH = treeH * 0.16;
      ctx.save();

      ctx.fillStyle = p.groundShadow || 'rgba(90,120,150,.22)';
      ctx.beginPath(); ctx.ellipse(tx, ty + 1, treeH * 0.20, treeH * 0.045, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = p.coniferTrunk || '#5a3f28';
      ctx.fillRect(tx - trunkW / 2, ty - trunkH, trunkW, trunkH);

      // four tiers, each narrower and shorter than the one below
      const TIERS = 4;
      const base = ty - trunkH * 0.75;
      for (let k = 0; k < TIERS; k++) {
        const f = k / TIERS;
        const halfW = treeH * 0.30 * (1 - f * 0.62);
        const tierTop = base - treeH * (0.20 + k * 0.20);
        const tierBot = base - treeH * (k * 0.20);
        const lean = sway * treeH * (0.6 + k * 0.5);          // the top moves most

        ctx.fillStyle = p.conifer || '#2f6b3c';
        ctx.beginPath();
        ctx.moveTo(tx + lean, tierTop);
        ctx.lineTo(tx + halfW, tierBot);
        ctx.lineTo(tx - halfW, tierBot);
        ctx.closePath(); ctx.fill();

        // shaded right half, so the tier is not a flat triangle
        ctx.fillStyle = p.coniferDark || 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        ctx.moveTo(tx + lean, tierTop);
        ctx.lineTo(tx + halfW, tierBot);
        ctx.lineTo(tx + lean * 0.5, tierBot);
        ctx.closePath(); ctx.fill();

        // snow lying along the tier's shoulders
        if (p.coniferSnow) {
          ctx.strokeStyle = p.coniferSnow;
          ctx.lineWidth = Math.max(1.6, treeH * 0.022);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(tx - halfW * 0.94, tierBot - treeH * 0.008);
          ctx.lineTo(tx + lean, tierTop + treeH * 0.012);
          ctx.lineTo(tx + halfW * 0.94, tierBot - treeH * 0.008);
          ctx.stroke();
        }
      }

      // baubles, breathing slowly and out of phase with each other
      const spots = [[-0.16, 0.30], [0.15, 0.34], [-0.10, 0.56], [0.12, 0.62], [-0.05, 0.80], [0.07, 0.86]];
      const cols = p.baubles || ['#e05a4a', '#f0c04a', '#5aa8e0'];
      spots.forEach(function (d, i) {
        const bx = tx + treeH * d[0] + sway * treeH * (d[1] * 2.2);
        const by2 = base - treeH * d[1];
        ctx.globalAlpha = 0.72 + 0.28 * Math.sin(t / 620 + i * 1.7);
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath(); ctx.arc(bx, by2, Math.max(1.3, treeH * 0.022), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // and a star on top
      const sx = tx + sway * treeH * 1.1, sy = base - treeH * 1.0;
      const sr = treeH * 0.055;
      ctx.fillStyle = p.star || '#ffd24a';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5;
        const r = (k % 2 ? sr * 0.42 : sr);
        ctx[k ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* Somebody built a snowman.

       It stands on the open strip between the workshop huts and the pens — the
       same band the trough and the mailbox use — at x 0.78, which is the only
       gap wide enough: the trough owns 0.085, the huts run 0.22 to 0.66, and
       the mailbox tap rect reaches left from 0.90. Nothing here is tappable, so
       it must not sit under anything that is; a check measures the real gaps in
       pixels rather than trusting these numbers.

       Drawn with the fixed props rather than baked into the ground texture,
       because it stands in front of the fence and needs the animals to be able
       to pass in front of it. */
    /* 0.74, not 0.78: at 0.78 the right twig arm reached 5px INTO the mailbox
       tap rect on a 320-wide stage — the same mistake the blossom branch made,
       and the same check caught it. The gap it has to live in is the strip
       between the last hut (0.66) and where the mailbox rect starts. */
    const FARM_SNOWMAN_X = 0.74;

    function _farmSnowmanPos(W, H) { return { x: FARM_SNOWMAN_X, y: _farmTroughY(W, H) }; }
    // The floor is 26 rather than 30 because on the narrowest stage that floor
    // is what makes it relatively widest, and this is the tightest gap on the farm.
    function _farmSnowmanSize(W, H) { return Math.max(26, Math.min(W, H) * 0.072); }

    function _drawFarmSnowman(ctx, W, H, pal) {
      if (!pal || pal.groundProp !== 'snowman') return;
      const p = _farmSnowmanPos(W, H);
      const s = _farmSnowmanSize(W, H);
      const cx = p.x * W, by = p.y * H;                 // by = where it meets the ground
      const snow = pal.propSnow || '#f7fbff';
      const shade = pal.propShade || 'rgba(150,175,200,0.55)';

      ctx.save();
      ctx.fillStyle = pal.groundShadow || 'rgba(90,120,150,.22)';
      ctx.beginPath(); ctx.ellipse(cx + s * 0.05, by, s * 0.52, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();

      const balls = [[0.00, -0.34, 0.36], [0.01, -0.86, 0.26], [0.02, -1.28, 0.19]];
      balls.forEach(function (b) {
        const x = cx + s * b[0], y = by + s * b[1], r = s * b[2];
        ctx.fillStyle = shade;                          // shaded underside first
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = snow;                           // then the lit body, offset up-left
        ctx.beginPath(); ctx.arc(x - r * 0.10, y - r * 0.12, r * 0.93, 0, Math.PI * 2); ctx.fill();
      });

      const hx = cx + s * 0.02, hy = by - s * 1.28, hr = s * 0.19;
      // twig arms, out of the middle ball
      ctx.strokeStyle = '#6b4a2e'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, s * 0.035);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.24, by - s * 0.92); ctx.lineTo(cx - s * 0.60, by - s * 1.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.46, by - s * 1.06); ctx.lineTo(cx - s * 0.56, by - s * 1.24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.26, by - s * 0.92); ctx.lineTo(cx + s * 0.62, by - s * 1.08); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.48, by - s * 1.00); ctx.lineTo(cx + s * 0.58, by - s * 1.18); ctx.stroke();

      ctx.fillStyle = '#2b2b2b';                        // coal eyes and a coal smile
      ctx.beginPath(); ctx.arc(hx - hr * 0.36, hy - hr * 0.22, hr * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + hr * 0.30, hy - hr * 0.24, hr * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1, s * 0.022);
      ctx.beginPath(); ctx.arc(hx - hr * 0.02, hy + hr * 0.12, hr * 0.42, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();

      ctx.fillStyle = '#e8792b';                        // carrot
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.02, hy + hr * 0.02);
      ctx.lineTo(hx + hr * 0.92, hy + hr * 0.14);
      ctx.lineTo(hx - hr * 0.02, hy + hr * 0.24);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#c8443a';                        // scarf, with a tail the wind never moves
      ctx.fillRect(cx - s * 0.22, by - s * 1.10, s * 0.46, s * 0.10);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.10, by - s * 1.06);
      ctx.lineTo(cx + s * 0.30, by - s * 0.86);
      ctx.lineTo(cx + s * 0.18, by - s * 0.82);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* The decking the garden beds stand on.

       Boards run across the stage and get THINNER toward the fence, because
       that is what a plank floor does as it recedes — even spacing would read
       as a flat wallpaper of stripes, which is the thing we just took out of
       this band. Each board is cut from its own tone, grained along its length,
       jointed where two boards meet, and knotted now and then.

       Everything is keyed to the board index, so the deck is identical on every
       frame; it is baked into the ground texture with the pasture scatter and
       blitted, not redrawn. */
    function _drawFarmDeck(ctx, W, H, top, bot, pal) {
      const d = pal.deck;
      if (!d) return;
      const band = bot - top;
      if (band <= 0) return;
      const hash = (n) => { const v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };

      const base = ctx.createLinearGradient(0, top, 0, bot);
      base.addColorStop(0, d.dark); base.addColorStop(1, d.light);
      ctx.fillStyle = base;
      ctx.fillRect(0, top, W, band);

      ctx.save();
      ctx.beginPath(); ctx.rect(0, top, W, band); ctx.clip();

      // Board edges laid out so each is a little deeper than the one behind it.
      const N = 7;
      const edges = [];
      for (let k = 0; k <= N; k++) {
        const f = k / N;
        edges.push(top + band * (f * f * 0.72 + f * 0.28));   // quadratic ease → perspective
      }

      for (let k = 0; k < N; k++) {
        const y0 = edges[k], h = edges[k + 1] - y0;
        const tone = 0.88 + hash(k * 7.3) * 0.26;
        const shade = (c) => 'rgb(' + c.map((v) => Math.round(v * tone)).join(',') + ')';
        const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, shade(d.top));
        g.addColorStop(1, shade(d.bottom));
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, W, h);

        // grain along the board
        ctx.lineWidth = Math.max(0.5, h * 0.05);
        for (let n = 0; n < 3; n++) {
          const f = hash(k * 11.9 + n * 3.1);
          const gy2 = y0 + h * (0.2 + f * 0.62);
          ctx.strokeStyle = 'rgba(' + d.grain + ',' + (0.08 + f * 0.10).toFixed(2) + ')';
          ctx.beginPath();
          ctx.moveTo(-2, gy2);
          ctx.quadraticCurveTo(W * (0.25 + f * 0.5), gy2 + h * (f - 0.5) * 0.3, W + 2, gy2);
          ctx.stroke();
        }

        // end joints — one or two per board, never lining up with the row behind
        const joints = 1 + (hash(k * 19.7) > 0.5 ? 1 : 0);
        ctx.strokeStyle = 'rgba(' + d.seam + ',0.5)';
        ctx.lineWidth = Math.max(0.8, h * 0.06);
        for (let j = 0; j < joints; j++) {
          const jx = W * (0.12 + hash(k * 23.3 + j * 5.9) * 0.76);
          ctx.beginPath(); ctx.moveTo(jx, y0); ctx.lineTo(jx, y0 + h); ctx.stroke();
        }

        if (hash(k * 29.1) > 0.62 && h > 6) {
          const kx = W * (0.1 + hash(k * 31.7) * 0.8), ky = y0 + h * 0.52;
          const kr = Math.max(1.2, h * 0.14);
          ctx.fillStyle = 'rgba(' + d.knot + ',0.5)';
          ctx.beginPath(); ctx.ellipse(kx, ky, kr, kr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(' + d.knot + ',0.22)'; ctx.lineWidth = Math.max(0.5, kr * 0.3);
          ctx.beginPath(); ctx.ellipse(kx, ky, kr * 1.9, kr * 1.2, 0, 0, Math.PI * 2); ctx.stroke();
        }

        // the gap between boards: a dark line with the lit edge of the next below it
        ctx.fillStyle = 'rgba(' + d.seam + ',0.55)';
        ctx.fillRect(0, y0 + h - Math.max(0.8, h * 0.05), W, Math.max(0.8, h * 0.05));
        ctx.fillStyle = 'rgba(' + d.lit + ',0.20)';
        ctx.fillRect(0, y0, W, Math.max(0.6, h * 0.04));
      }
      ctx.restore();
    }

    /* The ground scatter never moves, so it should not be redrawn 24 times a
       second. Bake both bands into one offscreen canvas and blit it; rebuild
       only when something it depends on actually changes — the stage size, the
       skin, day flipping to night, or the fence moving after an expansion.

       Measured before and after on the most expensive skin with a full field:
       4,594 canvas calls per frame became about 1,500. The texture work in the
       last few rounds is only affordable because of this. */
    let _farmTexCache = null;

    function _farmGroundTexture(W, H, top, bot, pal, key) {
      if (_farmTexCache && _farmTexCache.key === key) return _farmTexCache.cvs;
      let cvs;
      try { cvs = document.createElement('canvas'); } catch (e) { return null; }
      if (!cvs || !cvs.getContext) return null;
      // Baked in device pixels — blitted back at CSS size by the caller, so the
      // ground is as sharp as the animals standing on it.
      fitCanvas(cvs, W, H);
      const c = cvs.getContext('2d');
      _drawFarmScatter(c, W, H, top, bot, pal.groundFx);     // tufts and flowers on the pasture
      _drawFarmDeck(c, W, H, bot, H, pal);                   // plank decking under the beds
      _farmTexCache = { key: key, cvs: cvs };
      return cvs;
    }

    function _drawFarmScatter(ctx, W, H, top, bot, layers) {
      if (!layers || !layers.length) return;
      const band = bot - top;
      if (band <= 0) return;
      const hash = (n) => { const v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
      ctx.save();
      ctx.beginPath(); ctx.rect(0, top, W, band); ctx.clip();

      layers.forEach(function (fx, li) {
        if (!fx || !fx.count) return;
        const seed = li * 7.3;                       // each layer scatters differently
        for (let i = 0; i < fx.count; i++) {
          const rx = hash(seed + i * 31.7), ry = hash(seed + i * 57.3 + 2.1), rr = hash(seed + i * 91.1 + 5.5);
          // Perspective: the field recedes to the horizon, so anything near the
          // top of the band is further away and has to be drawn smaller, or the
          // scatter reads as flat confetti pasted over the grass. This is also
          // what carries the depth the mown stripes used to fake.
          const depth = 0.35 + ry * 0.65;
          const x = rx * W;
          const y = top + ry * band;
          const r = fx.size * depth;
          ctx.globalAlpha = (fx.alpha || 0.9) * (0.55 + rr * 0.45);

          if (fx.kind === 'tuft') {
            // three blades fanning from one root, then a bloom on some of them
            ctx.strokeStyle = 'rgba(' + fx.color + ',1)';
            ctx.lineWidth = Math.max(0.8, r * 0.30);
            ctx.lineCap = 'round';
            for (let k = -1; k <= 1; k++) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.quadraticCurveTo(x + k * r * 0.5, y - r * 0.8, x + k * r * 1.05 + (rr - 0.5) * r, y - r * 1.5);
              ctx.stroke();
            }
            if (fx.bloom && rr > (fx.bloomAt == null ? 0.62 : fx.bloomAt)) {
              const bx = x + (rr - 0.5) * r * 1.2, by = y - r * 1.55;
              ctx.fillStyle = 'rgba(' + ((fx.bloom2 && rx > 0.5) ? fx.bloom2 : fx.bloom) + ',1)';
              for (let k = 0; k < 5; k++) {
                const a = rr * 6 + k * (Math.PI * 2 / 5);
                ctx.beginPath();
                ctx.arc(bx + Math.cos(a) * r * 0.26, by + Math.sin(a) * r * 0.26, r * 0.22, 0, Math.PI * 2);
                ctx.fill();
              }
              if (fx.bloomCore) {
                ctx.fillStyle = fx.bloomCore;
                ctx.beginPath(); ctx.arc(bx, by, r * 0.16, 0, Math.PI * 2); ctx.fill();
              }
            }
          } else if (fx.kind === 'clod') {
            /* Broken earth. A clod is not a dot: it is a lump with a lit top
               and a shadow under it, and that pairing is what makes tilled soil
               read as lumpy rather than as speckled paint. A few are stones
               instead — paler, rounder, and rarer. */
            const stone = fx.stone && rx > 0.88;
            ctx.fillStyle = 'rgba(' + (stone ? fx.stone : fx.color) + ',1)';
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * (stone ? 0.78 : 0.55), rr * Math.PI, 0, Math.PI * 2);
            ctx.fill();
            if (fx.lit) {                                  // sun on the upper face
              ctx.fillStyle = 'rgba(' + fx.lit + ',1)';
              ctx.beginPath();
              ctx.ellipse(x - r * 0.16, y - r * 0.22, r * 0.6, r * 0.26, rr * Math.PI, 0, Math.PI * 2);
              ctx.fill();
            }
            if (fx.shade) {                                // and the shadow it sits in
              ctx.fillStyle = 'rgba(' + fx.shade + ',1)';
              ctx.beginPath();
              ctx.ellipse(x + r * 0.12, y + r * 0.34, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillStyle = 'rgba(' + ((fx.color2 && rr > 0.6) ? fx.color2 : fx.color) + ',1)';
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 0.62, rr * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* A skin's one big set piece in the sky.

       Kept to the TOP-LEFT on purpose: the merchant plane hovers at x 0.84
       (0.70 on a narrow screen) and it is a tap target, so anything decorative
       up there has to stay well clear of it. Nothing here is tappable.

       Blossom branch — the view from under a cherry tree looking up. It sways
       on the same wind value the farm's trees use, so the whole scene moves
       together instead of each piece drifting on its own clock. */
    function _drawFarmSkyFx(ctx, W, H, t, pal, sway) {
      if (pal.skyFx !== 'blossom-branch') return;
      const s = Math.min(W, H * 2.2);              // scale off the smaller side so a phone gets a smaller branch
      /* SPAN is what keeps the branch off the merchant plane. The plane's tap
         rect reaches far LEFT of the plane itself — its banner is drawn about
         1.7 plane-widths out — so on a narrow stage that rect starts around
         0.40W. Everything drawn here stays inside SPAN of the left edge, and
         a check measures the real gap at every viewport rather than trusting
         this comment. */
      const SPAN = s * 0.32;
      const bx = -s * 0.04, by = H * 0.012;        // anchored just off the top-left corner
      const drift = sway * s * 1.6;                // the tip travels further than the root
      ctx.save();

      // limb + two forks, drawn as tapering strokes
      const limb = (x1, y1, cx, cy, x2, y2, w) => {
        ctx.strokeStyle = pal.branch || '#6b4a3a';
        ctx.lineCap = 'round';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
        ctx.stroke();
      };
      // every x below is a fraction of SPAN, so the whole branch scales together
      const X = (f) => bx + SPAN * f;
      limb(X(0), by, X(0.48), by + H * 0.005, X(1) + drift, by + H * 0.10, Math.max(2.5, s * 0.011));
      limb(X(0.35), by + H * 0.028, X(0.52), by + H * 0.075,
           X(0.65) + drift * 0.6, by + H * 0.085, Math.max(1.6, s * 0.006));
      limb(X(0.65), by + H * 0.052, X(0.78), by + H * 0.015,
           X(0.87) + drift * 0.8, by + H * 0.008, Math.max(1.4, s * 0.005));

      // blossom clusters along the limbs — five petals and a gold centre
      const spots = [
        [0.17, 0.010, 1.00], [0.33, 0.030, 0.85], [0.46, 0.020, 1.05], [0.57, 0.062, 0.80],
        [0.65, 0.038, 0.95], [0.74, 0.070, 0.75], [0.78, 0.020, 0.90], [0.87, 0.052, 0.85],
        [0.93, 0.086, 0.70], [0.97, 0.030, 0.80], [0.43, 0.062, 0.70], [0.26, 0.048, 0.75],
      ];
      const R = Math.max(3.2, s * 0.017);
      spots.forEach(function (p, i) {
        const px = X(p[0]) + drift * p[0];
        const py = by + H * p[1];
        const r = R * p[2];
        // Fixed, not animated: a blossom still on the branch does not spin.
        // The index still varies the angle so the twelve are not identical.
        const spin = i * 1.13;
        ctx.fillStyle = (i % 3 === 0) ? (pal.blossomAlt || '#fff') : (pal.blossom || '#ff9ec4');
        for (let k = 0; k < 5; k++) {
          const a = spin + k * (Math.PI * 2 / 5);
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(a) * r * 0.62, py + Math.sin(a) * r * 0.62, r * 0.52, r * 0.42, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = pal.blossomCore || 'rgba(255,214,120,0.95)';
        ctx.beginPath(); ctx.arc(px, py, r * 0.22, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
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

      /* Dragging the land sideways. A visitor may do it too — it moves the
         camera, never the farm. Nothing happens until the finger clears the
         dead-zone, so an ordinary tap is still an ordinary tap; once it does
         move, the click that would follow is suppressed the same way a decor
         drag used to suppress it. */
      let _panLive = false, _panMoved = false, _panFrom = 0, _panCam0 = 0;

      function onDown(e) {
        /* A press that lands on the sack is a fertilise gesture, never a land
           pan — starting both would drag the field out from under the beds you
           are trying to paint. */
        if (viewingUid === currentUid) {
          const _fp = pos(e), _fw = _farmWH();
          if (roomData.farmLandL && _fertBagHit(_fp.x + _farmCamX, _fp.y, _fw.W, _fw.H)) {
            _fertPress = { x: _fp.x, y: _fp.y }; _fertPainted = {}; _fertPaintN = 0;
            if (e.cancelable && e.type !== 'mousedown') e.preventDefault();
            return;
          }
        }
        if (_farmCanPan()) {
          const src = (e.touches && e.touches[0]) || e;
          _panLive = true; _panMoved = false;
          _panFrom = src.clientX; _panCam0 = _farmCamX;
        }
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
        /* Painting. Past the dead-zone the press becomes a sweep, and every bed
           the finger crosses is fertilised once — which is the whole point of
           dragging rather than tapping: a row in one gesture. */
        if (_fertPress) {
          const src = (e.touches && e.touches[0]) || e;
          const r = cvs.getBoundingClientRect();
          const cx = (src.clientX - r.left) / r.width, cy = (src.clientY - r.top) / r.height;
          if (!_fertDrag && Math.hypot(cx - _fertPress.x, cy - _fertPress.y) * r.width < FARM_PAN_DEADZONE) return;
          _fertDrag = { x: cx + _farmCamX, y: cy };
          const tg = _farmTargetAt(cx, cy, r.width, r.height);
          if (tg && tg.kind === 'plot' && !_fertPainted[tg.idx] && _fertBed(tg.idx)) {
            _fertPainted[tg.idx] = 1; _fertPaintN++;
          }
          _hideFarmTip();
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (_panLive) {
          const src = (e.touches && e.touches[0]) || e;
          const dx = src.clientX - _panFrom;
          if (!_panMoved && Math.abs(dx) < FARM_PAN_DEADZONE) return;   // still a tap
          _panMoved = true;
          _farmCamTo = null;                 // a finger on the land beats a gliding arrow
          _farmCamX = _panCam0 - dx / Math.max(1, cvs.getBoundingClientRect().width);
          _farmClampCam();
          _hideFarmTip();
          if (e.cancelable) e.preventDefault();
          return;
        }
        // Hover tooltip (mouse only, when not dragging): crop time / trough food.
        if (e.type === 'mousemove' && !_farmDragDecorId) {
          const p = pos(e);
          let tip = '';
          const _twh = _farmWH();
          // One resolve per move, shared with the click AND with the highlight
          // the canvas draws — so all three can never disagree.
          const _tg = _farmTargetAt(p.x, p.y, _twh.W, _twh.H);
          const _tk = _farmTargetKey(_tg);
          if (_tk !== _farmHoverKey) { _farmHoverKey = _tk; _farmHover = _tg; }
          tip = _farmHoverTip(p.x, p.y, _twh.W, _twh.H, _farmCamX, _tg);
          if (tip) _showFarmTip(tip, e); else _hideFarmTip();
          cvs.style.cursor = (tip || _tg) ? 'pointer' : 'default';
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
        if (_fertPress) {
          const swept = !!_fertDrag;
          _fertPress = null;
          if (swept) { _fertArmed = false; _farmDragSuppressClick = true; _endFertPaint(); }
          // A press that never moved falls through to click(), which arms it.
          if (swept) return;
        }
        if (_panLive) {
          _panLive = false;
          // A drag that actually moved must not also count as a tap on whatever
          // happened to end up under the finger.
          if (_panMoved) { _panMoved = false; _farmDragSuppressClick = true; }
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
      cvs.onmouseleave = () => { _hideFarmTip(); _farmHover = null; _farmHoverKey = ''; _panLive = false; };

      // Desktop: a trackpad swipe or a shift-wheel slides the land too.
      cvs.onwheel = (e) => {
        if (!_farmCanPan()) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!d) return;
        _farmCamTo = null;                   // same: a real swipe cancels the glide
        _farmCamX += d / Math.max(1, cvs.getBoundingClientRect().width);
        _farmClampCam();
        if (e.cancelable) e.preventDefault();
      };
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

        /* What a tap hits is decided by _farmTargetAt, and the hover highlight
           asks that same function — so whatever grew under the cursor is
           exactly what opens here, and no later edit can pull the two apart.
           The order it walks (huts/mailbox/plane, then the garden strip below
           the fence, then produce, then animals) is the order that used to be
           written out here, moved wholesale and otherwise untouched. */
        const tg = _farmTargetAt(cx, cy, rect.width, rect.height);
        /* Armed with the fertilizer sack, a tap on the field means fertilise and
           nothing else — it must not fall through and open the planting sheet.
           A tap anywhere that is not a bed puts the sack down, which is the
           escape hatch: there is no separate cancel to find. */
        if (tg && tg.kind === 'fert') { _fertSackTap(); return; }   // one tap arms, two do the field
        if (_fertArmed) {
          if (tg && tg.kind === 'plot') { applyFert(tg.idx); return; }
          _disarmFert();
          if (tg && tg.kind === 'sign') return;   // swallow it: you meant a bed, not the row
        }
        if (tg && tg.kind === 'sky') {
          if (tg.id === '#cart') { openCartSheet(); return; }
          if (tg.id === '#mail') { openFarmInbox(); return; }
          if (tg.id === '#buyer') { openBuyerSheet(); return; }
          if (tg.id.indexOf('#bin') === 0) { tapCompostBin(+tg.id.slice(4)); return; }
          openMachineModal(tg.id); return;      // hut or ageing factory, locked or not
        }
        closeCartSheet();   // tapping elsewhere on the farm dismisses the sheets
        closeBuyerSheet();
        if (!tg) return;
        // A signboard means the whole row, a bed means that one bed.
        if (tg.kind === 'plot' || tg.kind === 'sign') { _farmRowClick(tg.row, tg.idx != null ? tg.idx : null); return; }
        if (tg.kind === 'drop') { openProduceModal(); return; }
        if (tg.kind === 'animal') openAnimalModal(tg.id);
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
      try { if (_buyerOpen) renderBuyerSheet(); } catch (e) {}
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
