    /* ═══════════════════════════════
       Saving — a field at a time, never the whole document
       ═══════════════════════════════

       The room document belongs to the ACCOUNT, not to a device, and every
       device signed in holds its own copy of it in roomData. This save used to
       post all ~90 fields out of whichever copy the client happened to be
       holding, so the last device to save won the whole document — and it never
       announced itself as a race. Reported as: the laptop and the phone open
       together, work done on one comes back undone, "手机做其他东西然后没得到这个东西".

       Two rules make that structurally impossible now.

       1. _syncedState remembers the document as it stood when this device last
          APPLIED a snapshot, and a save writes only the fields that differ from
          it. A field this device did not touch is not in the patch at all, so
          it cannot land on top of what another device wrote. Being stale stops
          being dangerous: behind on farmStock now only means we don't write
          farmStock.
       2. coins travels as an atomic increment of the delta THIS device caused,
          never as an absolute balance. Earning 50 on the laptop while the phone
          spends 30 settles at +20 instead of one number winning outright.

       This generalises the opt-outs that were being added one reported loss at a
       time (farmCapLevel, farmHelpDay, aquariumLikes…). The default is now
       "don't write it", so those fields stay out for free — they are simply
       never changed locally by anything but their own transaction. */

    // Written on every save whatever the diff says: they describe THIS device's
    // session, so there is no other device's value to lose.
    const _SAVE_ALWAYS = ['lastSeen', 'updatedAt'];

    // Order-independent value key. Firestore hands maps back in whatever key
    // order it likes, and a plain JSON.stringify would read that reshuffle as a
    // change and write the field — which is the exact clobber this is here to
    // prevent. undefined and null compare equal: a field the document has never
    // held reads as absent either way, and a key whose value is undefined is
    // dropped for the same reason — Firestore cannot store one, and _cloneValue
    // drops it, so keeping it would make a value and its own clone disagree.
    function _valueKey(v) {
      if (v === undefined || v === null) return 'null';
      if (typeof v !== 'object') return JSON.stringify(v);
      if (Array.isArray(v)) return '[' + v.map(_valueKey).join(',') + ']';
      return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
        .map(k => JSON.stringify(k) + ':' + _valueKey(v[k])).join(',') + '}';
    }

    function _cloneValue(v) {
      return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    /* The save baseline, DETACHED from the live game state.
       ─────────────────────────────────────────────────────
       _roomDocFields() hands back roomData's own arrays and maps by reference —
       farmStock, farmPlots, coinHistory, plantLevels and the rest are the very
       objects the game mutates. Keeping one of those as the baseline compares a
       field against itself, so anything changed IN PLACE reads as unchanged and
       never reaches the patch. It cost real work, silently:

         • harvest empties the beds and adds to farmStock in place, so the save
           carried neither — reload and the ripe crops were standing again with
           the barn no fuller;
         • logCoin() pushes a row onto roomData.coinHistory, so plant income,
           purchases, everything stopped appearing in the coin log;
         • upgradePlant() writes plantLevels[id] in place while the coins for it
           go out as an increment — paid for, then gone on the next snapshot.

       Only a whole-value REPLACEMENT (roomData.x = […]) survived, which is why
       the diff looked right in the tests that replaced fields. So the baseline
       is taken as a deep copy, and there is no path that stores a live one. */
    function _takeBaseline() {
      return _cloneValue(_roomDocFields());
    }

    // firebase is a global from the SDK room.html loads. Returns null if it isn't
    // there rather than something increment-shaped: writing a plain object where
    // a sentinel belongs would replace the balance with a map and destroy it, so
    // the caller drops the field and leaves the coins alone instead.
    function _coinIncrement(n) {
      if (typeof firebase === 'undefined' || !firebase.firestore) return null;
      return firebase.firestore.FieldValue.increment(n);
    }

    // The document as this device would write it, built from roomData. Split out
    // of saveRoom so the snapshot handler can use the same projection to take its
    // baseline — the two have to agree field for field or the diff is meaningless.
    function _roomDocFields() {
      return {
        coins: roomData.coins,
        coinHistory: roomData.coinHistory || [],
        pets: roomData.pets.map(p => ({ id: p.id, type: p.type, name: p.name, hunger: p.hunger, thirst: p.thirst, affection: p.affection, color: p.color, layer: p.layer ?? null, accessory: p.accessory || null, posX: p.posX ?? null, posY: p.posY ?? null, parked: p.parked ?? false, lastDropDay: p.lastDropDay || '', pendingDrops: p.pendingDrops || 0 })),
        petDrops: roomData.petDrops || [],
        petCollections: roomData.petCollections || {},
        autoFeeder: roomData.autoFeeder || false,
        autoFeedOn: roomData.autoFeedOn || false,
        farmAnimals: roomData.farmAnimals || [],
        farmDrops: roomData.farmDrops || [],
        farmDecors: roomData.farmDecors || [],
        farmFood: roomData.farmFood || 0,
        farmFoodAt: roomData.farmFoodAt || 0,
        farmStock: roomData.farmStock || {},
        farmTotalCollected: roomData.farmTotalCollected || 0,
        // NOTE: farmCapLevel / farmLandL / farmLandR stay out of this projection
        // entirely, and so does farmHelpDay/farmHelpCount below. The diff already
        // keeps an untouched field out of the patch, but these are one-way PAID
        // progression that a local repair may legitimately change — and a local
        // change is exactly what the diff would then let through. expandFarm /
        // buyFarmLand own them, in a transaction against the server's own copy.
        // Left in a routine save, a stale level walked them BACKWARDS: a maxed
        // pasture came back as Lv 1 with the plots it had paid for still standing
        // beside it.
        farmAutoCollect: roomData.farmAutoCollect || false,
        farmVariants: roomData.farmVariants || {},
        farmPlots: roomData.farmPlots || [],
        farmOrdersDay: roomData.farmOrdersDay || '',
        farmOrdersDone: roomData.farmOrdersDone || [],
        farmMachines: roomData.farmMachines || {},
        // Side land: the compost yard (left) and the ageing factories (right).
        farmCompost: roomData.farmCompost || 0,
        farmCompostAt: roomData.farmCompostAt || 0,
        farmCompostBins: roomData.farmCompostBins || 0,
        farmFertilizer: roomData.farmFertilizer || 0,
        farmAgers: roomData.farmAgers || {},
        farmAged: roomData.farmAged || {},
        farmBuyerLeftAt: roomData.farmBuyerLeftAt || 0,
        farmBuyerWanted: roomData.farmBuyerWanted || null,
        farmBuyerSold: roomData.farmBuyerSold || null,
        farmCartLeftAt: roomData.farmCartLeftAt || 0,
        farmCartWanted: roomData.farmCartWanted || null,
        farmCartSold: roomData.farmCartSold || null,
        farmTroughLevel: roomData.farmTroughLevel || 0,
        farmColdLevel: roomData.farmColdLevel || 0,
        farmAutoFeed: roomData.farmAutoFeed || false,
        farmAutoFeedOn: roomData.farmAutoFeedOn || false,
        // Farm social layer. farmCheersTotal is the lifetime cheer count and the
        // farmWeek* pair powers the two weekly boards (the prev* slot keeps the
        // week that just ended, which settlement reads). All owner-written: a
        // visitor's cheer lands in the inbox, and only claiming it moves these.
        farmCheersTotal: roomData.farmCheersTotal || 0,
        farmWeekId: roomData.farmWeekId || '',
        farmWeekCheers: roomData.farmWeekCheers || 0,
        farmWeekProduce: roomData.farmWeekProduce || 0,
        farmWeekPrevId: roomData.farmWeekPrevId || '',
        farmWeekPrevCheers: roomData.farmWeekPrevCheers || 0,
        farmWeekPrevProduce: roomData.farmWeekPrevProduce || 0,
        // NOTE: farmHelpDay / farmHelpCount are intentionally NOT projected here.
        // Only the help transaction moves them, and it reads the server value
        // first — a save carrying a locally-rolled day would reset the daily
        // allowance and hand back helps that were already spent (the same
        // reason aquariumLikes is left out below).
        aquariumFish: roomData.aquariumFish || [],
        aquariumTheme: roomData.aquariumTheme || 'tropical',
        farmTheme: roomData.farmTheme || 'meadow',
        ownedFarmThemes: roomData.ownedFarmThemes || [],
        aquariumLastCollect: roomData.aquariumLastCollect || 0,
        aquariumRaceDay: roomData.aquariumRaceDay || '',
        aquariumRaceN: roomData.aquariumRaceN || 0,
        aquariumBubbleDay: roomData.aquariumBubbleDay || '',
        aquariumBubbleN: roomData.aquariumBubbleN || 0,
        aquariumFilter: roomData.aquariumFilter || 0,
        aquariumLight: roomData.aquariumLight || 0,
        aquariumPump: roomData.aquariumPump || 0,
        aquariumFrenzyAt: roomData.aquariumFrenzyAt || 0,
        // NOTE: aquariumLikes is intentionally NOT projected here — only visitors
        // change it (via increment), so an owner save must never carry it.
        plant: roomData.plant,
        plantLevels: roomData.plantLevels,
        ownedPlants: roomData.ownedPlants,
        ownedDecors: roomData.ownedDecors,
        // Top-level layer-1 fields kept for backward compatibility with older clients
        placedDecors: (roomData.layerData[1] || {}).placedDecors || roomData.placedDecors,
        ownedWalls: roomData.ownedWalls,
        wallPattern: (roomData.layerData[1] || {}).wallPattern || roomData.wallPattern,
        ownedWindows: roomData.ownedWindows,
        windowStyle: (roomData.layerData[1] || {}).windowStyle || roomData.windowStyle,
        ownedFloors: roomData.ownedFloors || ['floor_wood'],
        floorStyle: (roomData.layerData[1] || {}).floorStyle || roomData.floorStyle || 'floor_wood',
        ownedAccessories: roomData.ownedAccessories || [],
        plantPosition: (roomData.layerData[1] || {}).plantPosition || null,
        displayName: getPlayerName(),
        lastCoinCollect: roomData.lastCoinCollect || Date.now(),
        lastSeen: Date.now(),
        updatedAt: Date.now(),
        loginStreak: roomData.loginStreak || 0,
        lastLoginDay: roomData.lastLoginDay || '',
        achievements: roomData.achievements || [],
        gachaPulls: roomData.gachaPulls || 0,
        giftsGiven: roomData.giftsGiven || 0,
        giftsReceived: roomData.giftsReceived || 0,
        jukeboxTrack: roomData.jukeboxTrack || null,
        jukeboxVol: roomData.jukeboxVol ?? 0.5,
        // Multi-layer fields
        unlockedLayers: roomData.unlockedLayers || 1,
        layerData: roomData.layerData || {}
      };
    }

    async function saveRoom() {
      if (viewingUid !== currentUid) return false;
      if (!_roomLoaded) return false; // Don't save defaults before Firestore data loads
      // Sync active layer's mutable state (wall/window/decors/plantPos) into layerData
      flushLayerData();
      const data = _roomDocFields();

      // Only what this device actually moved since the last applied snapshot.
      const patch = {};
      for (const k of Object.keys(data)) {
        if (k === 'coins') continue;                       // travels as a delta, below
        if (_SAVE_ALWAYS.indexOf(k) >= 0) { patch[k] = data[k]; continue; }
        if (_valueKey(data[k]) !== _valueKey(_syncedState[k])) patch[k] = data[k];
      }
      // Coins: post the change we caused, not the balance we believe in. The
      // balance is shared with the board, the mini-games, the shop and every
      // other device, so an absolute write here loses whatever moved it
      // elsewhere while this copy was in hand.
      let coinDelta = Math.floor(data.coins || 0) - Math.floor(_syncedState.coins || 0);
      if (coinDelta !== 0) {
        const inc = _coinIncrement(coinDelta);
        if (inc) patch.coins = inc;
        else { console.error('saveRoom: no Firestore increment available, coins not written'); coinDelta = 0; }
      }

      _lastLocalSaveTime = Date.now();

      // Adopt the patch as the new baseline HERE — at the moment the write is
      // issued, not when it comes back.
      //
      // A set() with offline persistence doesn't settle until the SERVER
      // acknowledges it, which offline is however long the tunnel lasts. Waiting
      // for that would leave every save in the meantime measuring its delta from
      // the same untouched baseline, so a coin increment would be queued once per
      // save and they would ALL land on reconnect: earn 10, then 10 again, and
      // the account gains 30. Firestore's queue is durable across reloads, so the
      // moment a write is issued is the honest moment to call the change ours.
      const seq = ++_saveSeq;
      const previous = {};
      for (const k of Object.keys(patch)) {
        previous[k] = _syncedState[k];
        if (k !== 'coins') _syncedState[k] = _cloneValue(data[k]);
      }
      if (coinDelta !== 0) _syncedState.coins = Math.floor(_syncedState.coins || 0) + coinDelta;

      // Report success/failure so callers can roll back optimistic local changes
      // (e.g. workshop collect) instead of silently desyncing on a failed write.
      try {
        await userDocRef().set(patch, { merge: true });
        return true;
      } catch (e) {
        console.error('saveRoom failed:', e);
        // Rejected for good — put the baseline back so the change is posted again
        // next time. Unless a later save has already moved it: that one's
        // baseline is the current truth, and a snapshot will settle the rest.
        if (_saveSeq === seq) {
          for (const k of Object.keys(previous)) _syncedState[k] = previous[k];
        }
        return false;
      }
    }

    /* ── Coins that moved on the SERVER without going through saveRoom ──
       The daily reward, a gift, a farm help, an inbox claim: each tells the
       server the new balance itself, in a transaction or a batch that reads or
       increments the server's own copy. The local balance then has to be brought
       into line — and so does the save baseline, or the next saveRoom reads the
       difference as an earning THIS device made and posts it a second time. A
       10-coin daily reward became 20, a gift of 500 charged 1000.

       So: after telling the server, move roomData.coins through one of these two
       and never around them. adoptServerCoins takes the balance the server
       settled on; adoptServerCoinDelta takes the amount an increment() moved. */
    function adoptServerCoins(balance) {
      roomData.coins = Math.floor(balance || 0);
      _syncedState.coins = roomData.coins;
    }
    function adoptServerCoinDelta(delta) {
      adoptServerCoins(Math.floor(roomData.coins || 0) + Math.floor(delta || 0));
    }

    // ── Room "while you were away" plant coins.
    // No blocking modal: once you're in the room the coins are auto-banked and a
    // top notice (showToast) simply tells you how much — see the on-load and
    // tab-refocus handlers below.

    /* ═══════════════════════════════
       Init
       ═══════════════════════════════ */
    let _offlineCoinsCollected = false;
    let _farmCatchupDone = false;
    let _plantCoinInterval = null;
    let _lastLocalSaveTime = 0;
    // The document as it stood when this device last APPLIED a snapshot — the
    // baseline saveRoom diffs against. Taken from ANY snapshot, cache or server:
    // it only has to answer "did THIS device change the field?", and this
    // device's own cache answers that as well as the server does. That keeps a
    // player who is genuinely offline saving normally, through Firestore's own
    // write queue, instead of silently dropping their session.
    let _syncedState = {};
    // Bumped per save, so a failed write only rolls the baseline back if it is
    // still the one that save put there.
    let _saveSeq = 0;
    // Set when the tab comes back to the foreground, cleared by the first server
    // snapshot after it — see the visibilitychange handler for why the catch-up
    // waits rather than paying out against a frozen copy.
    let _pendingWakeCatchUp = false;
    let _unsubRoomSnap = null;
    let _roomLoaded = false;
    let _postLoadHooksDone = false;   // daily-reward / achievements run once, after data loads

    // ── Helpers to detach/reattach room listener on visibility change ──
    function _subscribeRoomSnap() {
      if (_unsubRoomSnap) return; // already subscribed
      _unsubRoomSnap = userDocRef().onSnapshot(_handleRoomSnap, _handleRoomSnapError);
    }
    function _unsubscribeRoomSnap() {
      if (_unsubRoomSnap) { _unsubRoomSnap(); _unsubRoomSnap = null; }
    }
    function _handleRoomSnapError(err) {
      console.error('Room onSnapshot error:', err);
      const _loadOv = document.getElementById('roomLoadingOverlay');
      if (_loadOv) _loadOv.style.display = 'none';
    }
    function _handleRoomSnap(snap) {
      // Guard: if currentUid changed mid-flight, ignore stale snapshot
      if (!currentUid) return;
      if (viewingUid !== currentUid) return; // Don't overwrite visited room data
      // While our own writes are still pending (server hasn't acknowledged them),
      // roomData already holds the latest local intent. Applying the snapshot now
      // would overwrite an un-acknowledged change — e.g. a crop you just harvested
      // or a cake you just collected — and the 60s production tick could then
      // re-save that stale state, so it "comes back" after you leave and return.
      // …but ONLY after the first load. The very first snapshot after a refresh can
      // arrive from the offline cache with pending (un-acked) farm writes still queued;
      // skipping it then would leave roomData on defaults and the loading overlay stuck.
      if (_roomLoaded && snap.metadata && snap.metadata.hasPendingWrites) return;
      if (snap.exists) {
        // Check displayName sync once on first snapshot
        if (!_offlineCoinsCollected) {
          const currentName = getPlayerName();
          if (snap.data().displayName !== currentName) {
            userDocRef().update({ displayName: currentName });
          }
        }
        const d = snap.data();
        // Load the coin log first, THEN the balance, THEN reconcile: coins are
        // shared with the board / mini-games / gifts, so the loaded balance may
        // have moved outside this app. reconcileCoinHistory folds that gap into a
        // catch-all row so the history's running total always matches reality.
        roomData.coinHistory = Array.isArray(d.coinHistory) ? d.coinHistory
          : (Array.isArray(roomData.coinHistory) ? roomData.coinHistory : []);
        roomData.coins = Math.floor(d.coins ?? 0); // coins are always whole
        reconcileCoinHistory();
        // Migrate old pet format or load new pets array
        roomData.pets = migratePets(d);
        roomData.plant = d.plant ?? null;
        roomData.plantLevels = d.plantLevels ?? {};
        roomData.ownedPlants = d.ownedPlants ?? [];
        roomData.ownedDecors = d.ownedDecors ?? [];
        roomData.ownedWalls = d.ownedWalls ?? ['wall_default'];
        roomData.ownedWindows = d.ownedWindows ?? ['win_none','win_classic'];
        // ── Multi-layer: load unlockedLayers + layerData ──
        roomData.unlockedLayers = d.unlockedLayers ?? 1;
        // Build layerData from Firestore; fall back to top-level fields for backward compat
        const rawLayerData = d.layerData ? JSON.parse(JSON.stringify(d.layerData)) : {};
        if (!rawLayerData[1]) {
          // Migrate existing single-layer Firestore data into layerData[1]
          const rawPlaced = d.placedDecors ?? [];
          rawLayerData[1] = {
            wallPattern: d.wallPattern ?? 'wall_default',
            windowStyle: d.windowStyle ?? 'win_classic',
            placedDecors: rawPlaced.map(p => {
              if (typeof p === 'string') {
                const def = DECORATIONS.find(x => x.id === p);
                return { id: p, x: def ? def.dx : 0.5, y: def ? def.dy : 0.5 };
              }
              return p;
            }),
            plantPosition: d.plantPosition ?? null,
            plant: d.plant ?? null,
            floorStyle: d.floorStyle ?? 'floor_wood'
          };
        }
        // Migrate any layer-specific placedDecors still in old string format
        for (const k of Object.keys(rawLayerData)) {
          const ld = rawLayerData[k];
          if (ld && Array.isArray(ld.placedDecors)) {
            ld.placedDecors = ld.placedDecors.map(p => {
              if (typeof p === 'string') {
                const def = DECORATIONS.find(x => x.id === p);
                return { id: p, x: def ? def.dx : 0.5, y: def ? def.dy : 0.5 };
              }
              return p;
            });
          }
        }
        roomData.layerData = rawLayerData;
        // One-time migration: the old rule let the SAME plant sit on multiple floors.
        // Each floor now needs a UNIQUE plant, so keep the first floor that has each
        // plant and unplace the duplicates (they stay owned — re-placeable later).
        let _plantDedupChanged = false;
        {
          const _seenPlants = new Set();
          const _floors = Object.keys(rawLayerData).map(Number).sort((a, b) => a - b);
          for (const f of _floors) {
            const pl = rawLayerData[f] && rawLayerData[f].plant;
            if (!pl) continue;
            if (_seenPlants.has(pl)) { rawLayerData[f].plant = null; _plantDedupChanged = true; }
            else _seenPlants.add(pl);
          }
        }
        // Load the currently active layer's data into the main roomData slots
        const activeLD = roomData.layerData[currentLayer] || {};
        roomData.wallPattern = activeLD.wallPattern || 'wall_default';
        roomData.windowStyle = activeLD.windowStyle || 'win_classic';
        roomData.placedDecors = Array.isArray(activeLD.placedDecors) ? activeLD.placedDecors : [];
        roomData.plantPosition = activeLD.plantPosition || null;
        // Per-layer plant & floor (fall back to legacy global plant for layer 1)
        roomData.plant = activeLD.plant != null ? activeLD.plant : (d.plant ?? null);
        roomData.floorStyle = activeLD.floorStyle || 'floor_wood';
        roomData.ownedFloors = d.ownedFloors ?? ['floor_wood'];
        roomData.displayName = d.displayName ?? '';
        roomData.lastCoinCollect = d.lastCoinCollect ?? d.updatedAt ?? Date.now();
        roomData.ownedAccessories = d.ownedAccessories ?? [];
        roomData.loginStreak = d.loginStreak ?? 0;
        roomData.lastLoginDay = d.lastLoginDay ?? '';
        roomData.achievements = d.achievements ?? [];
        roomData.gachaPulls = d.gachaPulls ?? 0;
        roomData.giftsGiven = d.giftsGiven ?? 0;
        roomData.giftsReceived = d.giftsReceived ?? 0;
        roomData.jukeboxTrack = d.jukeboxTrack ?? null;
        roomData.jukeboxVol = d.jukeboxVol ?? 0.5;
        roomData.petDrops = Array.isArray(d.petDrops) ? d.petDrops : [];
        roomData.petCollections = d.petCollections || {};
        roomData.autoFeeder = d.autoFeeder || false;
        roomData.autoFeedOn = d.autoFeedOn || false;
        roomData.farmAnimals = Array.isArray(d.farmAnimals) ? d.farmAnimals : [];
        roomData.aquariumFish = Array.isArray(d.aquariumFish) ? d.aquariumFish : [];
        roomData.aquariumTheme = d.aquariumTheme || 'tropical';
        // My own skin, kept live with my document. This handler returns early
        // while visiting, so it is NOT what paints a host's farm — visitRoom()
        // mirrors farmTheme/ownedFarmThemes for that.
        roomData.farmTheme = d.farmTheme || 'meadow';
        roomData.ownedFarmThemes = Array.isArray(d.ownedFarmThemes) ? d.ownedFarmThemes : [];
        roomData.aquariumLastCollect = d.aquariumLastCollect || 0;
        roomData.aquariumRaceDay = d.aquariumRaceDay || '';
        roomData.aquariumBubbleDay = d.aquariumBubbleDay || '';
        // Play counters, normalised HERE rather than where they are read. A
        // document written before the counters existed carries a day and no
        // count, and that day was only ever set by playing — aquariumPlaysUsed
        // turns that into "one play used". It has to happen on the way in,
        // because the first saveRoom would otherwise write the missing count out
        // as a 0 and hand back a play that was already spent.
        const _aqDay = _aqGameToday();
        roomData.aquariumRaceN = aquariumPlaysUsed(d.aquariumRaceDay || '', _aqDay, d.aquariumRaceN);
        roomData.aquariumBubbleN = aquariumPlaysUsed(d.aquariumBubbleDay || '', _aqDay, d.aquariumBubbleN);
        // The three equipment levels.
        roomData.aquariumFilter = d.aquariumFilter || 0;
        roomData.aquariumLight = d.aquariumLight || 0;
        roomData.aquariumPump = d.aquariumPump || 0;
        roomData.aquariumFrenzyAt = d.aquariumFrenzyAt || 0;
        roomData.aquariumLikes = d.aquariumLikes || 0;
        roomData.farmDrops = Array.isArray(d.farmDrops) ? d.farmDrops : [];
        roomData.farmDecors = Array.isArray(d.farmDecors) ? d.farmDecors : [];
        roomData.farmFood = d.farmFood || 0;
        roomData.farmFoodAt = d.farmFoodAt || 0;
        roomData.farmStock = d.farmStock || {};
        roomData.farmTotalCollected = d.farmTotalCollected || 0;
        // farmCapLevelOf, not d.farmCapLevel: a save holding land beside the farm
        // has a maxed pasture behind it whatever the stored level says. The next
        // saveRoom() writes the repaired level back, so this heals the document.
        roomData.farmCapLevel = farmCapLevelOf(d);
        roomData.farmLandL = d.farmLandL || false;
        roomData.farmLandR = d.farmLandR || false;
        roomData.farmAutoCollect = d.farmAutoCollect || false;
        roomData.farmVariants = d.farmVariants || {};
        roomData.farmPlots = Array.isArray(d.farmPlots) ? d.farmPlots : [];
        roomData.farmOrdersDay = d.farmOrdersDay || '';
        roomData.farmOrdersDone = Array.isArray(d.farmOrdersDone) ? d.farmOrdersDone : [];
        roomData.farmMachines = d.farmMachines || {};
        roomData.farmCompost = d.farmCompost || 0;
        roomData.farmCompostAt = d.farmCompostAt || 0;
        roomData.farmCompostBins = d.farmCompostBins || 0;
        roomData.farmFertilizer = d.farmFertilizer || 0;
        roomData.farmAgers = d.farmAgers || {};
        roomData.farmAged = d.farmAged || {};
        roomData.farmBuyerLeftAt = d.farmBuyerLeftAt || 0;
        roomData.farmBuyerWanted = d.farmBuyerWanted || null;
        roomData.farmBuyerSold = d.farmBuyerSold || null;
        roomData.farmCartLeftAt = d.farmCartLeftAt || 0;
        roomData.farmCartWanted = d.farmCartWanted || null;
        roomData.farmCartSold = d.farmCartSold || null;
        roomData.farmTroughLevel = d.farmTroughLevel || 0;
        roomData.farmColdLevel = d.farmColdLevel || 0;
        roomData.farmAutoFeed = d.farmAutoFeed || false;
        roomData.farmAutoFeedOn = d.farmAutoFeedOn || false;
        roomData.farmCheersTotal = d.farmCheersTotal || 0;
        roomData.farmWeekId = d.farmWeekId || '';
        roomData.farmWeekCheers = d.farmWeekCheers || 0;
        roomData.farmWeekProduce = d.farmWeekProduce || 0;
        roomData.farmWeekPrevId = d.farmWeekPrevId || '';
        roomData.farmWeekPrevCheers = d.farmWeekPrevCheers || 0;
        roomData.farmWeekPrevProduce = d.farmWeekPrevProduce || 0;
        roomData.farmHelpDay = d.farmHelpDay || '';
        roomData.farmHelpCount = d.farmHelpCount || 0;
        _roomLoaded = true;
        // ── The diff baseline, taken HERE ──
        // Right after the document has been loaded into roomData and before the
        // catch-up blocks below start changing it, so it holds the document as
        // it arrived and nothing this device has since done to it. Everything
        // saveRoom writes from here on is measured against this. A deep copy —
        // see _takeBaseline for what sharing it with roomData cost.
        _syncedState = _takeBaseline();
        // …with one exception. The two layer migrations above (legacy single-layer
        // data lifted into layerData[1], and the same-plant-on-two-floors dedup)
        // have already rewritten roomData.layerData, so baselining on the result
        // would hide the repair from the diff and it would never be persisted.
        // Baseline on what the DOCUMENT holds and the repair reads as a change.
        _syncedState.layerData = _cloneValue(d.layerData) || {};
        // Persist the unique-plant migration now that the full room is loaded.
        if (_plantDedupChanged) {
          saveRoom();
          showToast('🌱 ' + T('Floors with the same plant were tidied — duplicates are back in your inventory. Each floor needs a different plant now.'), 'success');
        }
        // Decay hunger based on elapsed time (1% per 10 min)
        const lastUpdate = d.updatedAt ?? Date.now();
        const elapsed = Date.now() - lastUpdate;
        const decay = Math.floor(elapsed / (10 * 60 * 1000));
        const _autoFeedActive = roomData.autoFeeder && roomData.autoFeedOn && viewingUid === currentUid;
        if (decay > 0 && !_autoFeedActive) {
          let changed = false;
          for (const pet of roomData.pets) {
            const oldH = pet.hunger ?? 100;
            const newH = Math.max(0, oldH - decay);
            const newT = Math.max(0, (pet.thirst ?? 100) - decay);
            // Starvation: cycles the pet spent at 0 hunger erode its affection
            const starveCycles = Math.max(0, decay - oldH);
            if (starveCycles > 0 && (pet.affection ?? 0) > 0) {
              pet.affection = Math.max(0, (pet.affection ?? 0) - starveCycles * STARVE_AFFECTION_LOSS);
              changed = true;
            }
            if (newH !== pet.hunger || newT !== (pet.thirst ?? 100)) {
              pet.hunger = newH; pet.thirst = newT; changed = true;
            }
          }
          if (changed) saveRoom();
        }
        // Plant passive coin generation (offline earnings, capped to 2 hours).
        // Every placed tree earns — revenue is the SUM across all floors.
        const incomeOffline = getTotalPlantIncome();
        if (!_offlineCoinsCollected && incomeOffline) {
          _offlineCoinsCollected = true;
          const coinsPerCycle = incomeOffline.perCycle;
          const lastCollect = roomData.lastCoinCollect || Date.now();
          // Cap offline elapsed time to PLANT_OFFLINE_CAP_MS (2 hours)
          const rawElapsed = Date.now() - lastCollect;
          const elapsed = Math.min(rawElapsed, PLANT_OFFLINE_CAP_MS);
          const cycles = Math.floor(elapsed / (5 * 60 * 1000));
          if (cycles > 0) {
            const earned = cycles * coinsPerCycle;
            const _top = incomeOffline.top;
            const _name = incomeOffline.count > 1
              ? T('Your {n} trees', { n: incomeOffline.count })
              : (_top.plantDef
                  ? T('Lv.{lvl} {name}', { lvl: _top.plantLvl, name: T(_top.plantDef.name) })
                  : T('Lv.{lvl} plant', { lvl: _top.plantLvl }));
            // Bank it straight away — no gating modal now that you're in the room.
            roomData.coins += earned;
            logCoin(earned, T('Plant income') + ' 🌱');
            roomData.lastCoinCollect = Date.now();
            saveRoom();
            if (rawElapsed >= PLANT_OFFLINE_MODAL_MS) {
              // Away a while → pop a top notice so they know, without interrupting.
              setTimeout(function () { showToast('🌱 ' + T('{name} earned {n} coins while you were away!', { name: _name, n: earned }), 'success'); }, 800);
            }
          } else {
            // No cycles earned but reset the timer on page load
            roomData.lastCoinCollect = Date.now();
            saveRoom();
          }
        }
        // Auto-Feeder offline catch-up — after plant income so idle earnings can pay.
        if (decay > 0 && _autoFeedActive) {
          const _afPlan = planOfflineAutoFeed({
            pets: roomData.pets.map(p => ({ hunger: p.hunger ?? 100, thirst: p.thirst ?? 100, affection: p.affection ?? 0 })),
            coins: roomData.coins,
            decay: decay,
            foodRate: bestCoinsPerPoint(FOODS),
            drinkRate: bestCoinsPerPoint(DRINKS),
            target: AUTOFEED_TARGET,
            starveLoss: STARVE_AFFECTION_LOSS
          });
          roomData.pets.forEach((p, i) => {
            p.hunger = _afPlan.pets[i].hunger;
            p.thirst = _afPlan.pets[i].thirst;
            p.affection = _afPlan.pets[i].affection;
          });
          if (_afPlan.coinsSpent > 0) {
            roomData.coins = Math.max(0, roomData.coins - _afPlan.coinsSpent);
            logCoin(-_afPlan.coinsSpent, T('Auto-Feeder') + ' 🤖');
            const _afSpent = _afPlan.coinsSpent;
            setTimeout(function () {
              showToast('🤖 ' + T('Auto-Feeder kept your pets fed — spent {n} coins while you were away!', { n: _afSpent }), 'success');
            }, 1000);
          }
          saveRoom();
        }
        // Farm offline produce is no longer applied on load — it's banked and shown
        // in the mandatory "while you were away" collect modal when you open the farm
        // (see openFarm / _offlinePlan in room-farm-view.js).
        // The tab came back to the foreground and this is the first server
        // snapshot since — now the copy in hand is current, bank what the plants
        // earned while we weren't listening.
        if (_pendingWakeCatchUp && !(snap.metadata && snap.metadata.fromCache)) {
          _pendingWakeCatchUp = false;
          _bankPlantIncomeOnWake();
        }
        maybeGenerateDailyDrops();
        _roomLoaded = true;
      } else {
        // New user — create room document. Only on the SERVER's word: offline
        // persistence answers the first read out of this device's own IndexedDB,
        // and a cache that has never seen this account says "no document" just as
        // loudly as an empty account does. Creating one on that evidence posts
        // coins: 0 and empty arrays — and the moment the connection comes back,
        // that write lands on a real, fully-played room. Offline, we simply wait:
        // roomData keeps its defaults, saveRoom stays shut (_roomLoaded is still
        // false), and the real document arrives when the network does.
        if (snap.metadata && snap.metadata.fromCache) {
          console.warn('Room doc missing from cache — waiting for the server before creating one');
        } else {
          _roomLoaded = true;
          _syncedState = {};
          roomData.displayName = getPlayerName();
          saveRoom();
        }
      }
      // Hide loading overlay and always render on first snapshot
      const _loadOv = document.getElementById('roomLoadingOverlay');
      const _wasFirstLoad = _loadOv && _loadOv.style.display !== 'none';
      if (_loadOv) _loadOv.style.display = 'none';
      // One-time post-load hooks — gated on the room data actually being applied
      // (_roomLoaded), NOT a blind timer, so the daily reward can never re-prompt
      // against empty/default roomData after a refresh.
      //
      // …and gated on that data having come from the SERVER. Persistence means
      // the first snapshot is answered out of THIS device's IndexedDB copy,
      // which on a second device is whatever it last saw — so asking it "was
      // today's reward claimed?" re-popped a reward the other device had already
      // taken. Offline the whole session the modal simply doesn't auto-open;
      // Settings → 🎁 Daily Reward still does.
      if (!_postLoadHooksDone && _roomLoaded && !(snap.metadata && snap.metadata.fromCache)) {
        _postLoadHooksDone = true;
        checkDailyOnLogin();
        checkAchievements();
      }
      // Deep-link: a shared "visit" link (?visit=<uid>) opens a read-only tour of
      // someone else's space; otherwise the "Farm/Aquarium" own-view links apply.
      if (_wasFirstLoad) { if (!_maybeVisitFromUrl()) _maybeOpenFarmFromUrl(); }
      // Always render on first load; skip only if a local save just triggered this snapshot
      if (!_wasFirstLoad && Date.now() - _lastLocalSaveTime < 2000) return;
      renderAllDebounced();
    }

    // One-time: if the URL asks to VISIT someone's space (?visit=<uid> with an
    // optional &view=farm|aquarium), open a READ-ONLY tour of THEIR room/farm/
    // aquarium via the existing visit* helpers. Returns true if it handled a
    // visit link (so the own-view handler below is skipped). A link pointing at
    // your OWN uid falls through to the normal own-view behaviour.
    let _visitUrlHandled = false;
    function _maybeVisitFromUrl() {
      if (_visitUrlHandled) return false;
      try {
        const p = new URLSearchParams(location.search);
        const uid = p.get('visit');
        if (!uid || uid === currentUid) return false;
        _visitUrlHandled = true;
        const v = p.get('view');
        if (v === 'farm' && typeof visitFarm === 'function') visitFarm(uid);
        else if (v === 'aquarium' && typeof visitAquarium === 'function') visitAquarium(uid);
        else if (typeof visitRoom === 'function') visitRoom(uid);
        return true;
      } catch (e) { return false; }
    }

    // One-time: if the URL asks for the farm view, open it after load.
    let _farmUrlHandled = false;
    function _maybeOpenFarmFromUrl() {
      if (_farmUrlHandled) return;
      _farmUrlHandled = true;
      try {
        const v = new URLSearchParams(location.search).get('view');
        if (v === 'farm' && viewingUid === currentUid && typeof openFarm === 'function') openFarm();
        else if (v === 'aquarium' && viewingUid === currentUid && typeof openAquarium === 'function') openAquarium();
      } catch (e) { /* ignore malformed URL */ }
    }

    // Plant coins earned while the tab was hidden. Mirrors the on-load behaviour:
    // bank them straight away and pop a top notice — whether they were away an
    // hour or just tabbed out for a bit — so returning by re-focusing an
    // already-open tab (common on mobile) stays consistent with a fresh page
    // load. No blocking modal either way.
    //
    // Called from _handleRoomSnap rather than from the visibilitychange handler
    // itself, so lastCoinCollect is the server's and not this tab's frozen copy.
    function _bankPlantIncomeOnWake() {
      const incomeHidden = getTotalPlantIncome();
      if (viewingUid !== currentUid || !incomeHidden || !roomData.lastCoinCollect) return;
      const coinsPerCycle = incomeHidden.perCycle;
      const rawElapsed = Date.now() - roomData.lastCoinCollect;
      const elapsed = Math.min(rawElapsed, PLANT_OFFLINE_CAP_MS);
      const cycles = Math.floor(elapsed / (5 * 60 * 1000));
      if (cycles <= 0) return;
      const earned = cycles * coinsPerCycle;
      roomData.coins += earned;
      logCoin(earned, T('Plant income') + ' 🌱');
      roomData.lastCoinCollect = Date.now();
      saveRoom();
      const _label = incomeHidden.count > 1 ? T('Your {n} trees', { n: incomeHidden.count }) : (incomeHidden.top.plantDef ? T(incomeHidden.top.plantDef.name) : T('Your plant'));
      const _msg = rawElapsed >= PLANT_OFFLINE_MODAL_MS
        ? T('{name} earned {n} coins while you were away!', { name: _label, n: earned })
        : T('{name} earned {n} coins while tab was hidden!', { name: _label, n: earned });
      showToast('🌱 ' + _msg, 'success');
    }

    // Live Auto-Feeder top-up: refill any owned pet at/below threshold back to
    // target, bounded by coins. Shared by the decay tick and the buy/toggle-on
    // actions so enabling the device feeds an already-hungry pet immediately
    // instead of waiting for the next 10-min tick. Returns true if any pet was
    // fed (caller persists + re-renders).
    function runLiveAutoFeed() {
      if (!(roomData.autoFeeder && roomData.autoFeedOn) || viewingUid !== currentUid) return false;
      const food = bestCoinsPerPoint(FOODS), drink = bestCoinsPerPoint(DRINKS);
      let changed = false;
      for (const pet of roomData.pets) {
        const r = liveRefillPlan(pet, roomData.coins, food, drink, { threshold: AUTOFEED_THRESHOLD, target: AUTOFEED_TARGET });
        if (r.coinsSpent > 0) {
          pet.hunger = r.hunger; pet.thirst = r.thirst;
          roomData.coins = Math.max(0, roomData.coins - r.coinsSpent);
          logCoin(-r.coinsSpent, T('Auto-Feeder') + ' 🤖');
          changed = true;
        }
      }
      return changed;
    }

    async function initRoom() {
      _offlineCoinsCollected = false;
      _farmCatchupDone = false;
      _roomLoaded = false;
      _postLoadHooksDone = false;
      // A different account's document is a different baseline; keeping the old
      // one would read every field of the new room as "changed by this device".
      _syncedState = {};
      _pendingWakeCatchUp = false;
      // Unsubscribe previous room listener (account switch)
      _unsubscribeRoomSnap();
      if (unsubVisitList) { unsubVisitList(); unsubVisitList = null; }
      // Reset roomData to defaults for clean account switch
      roomData = { coins: 0, petDrops: [], petCollections: {}, autoFeeder: false, autoFeedOn: false, farmAnimals: [], farmDrops: [], farmDecors: [], farmFood: 0, farmFoodAt: 0, farmStock: {}, farmTotalCollected: 0, farmCapLevel: 0, farmLandL: false, farmLandR: false, farmAutoCollect: false, farmVariants: {}, farmPlots: [], farmOrdersDay: '', farmOrdersDone: [], farmMachines: {}, farmCompost: 0, farmCompostAt: 0, farmCompostBins: 0, farmFertilizer: 0, farmAgers: {}, farmAged: {}, farmBuyerLeftAt: 0, farmBuyerWanted: null, farmBuyerSold: null, farmCartLeftAt: 0, farmTroughLevel: 0, farmColdLevel: 0, farmAutoFeed: false, farmAutoFeedOn: false, farmTheme: 'meadow', ownedFarmThemes: [], farmCheersTotal: 0, farmWeekId: '', farmWeekCheers: 0, farmWeekProduce: 0, farmWeekPrevId: '', farmWeekPrevCheers: 0, farmWeekPrevProduce: 0, farmHelpDay: '', farmHelpCount: 0, aquariumFish: [], aquariumTheme: 'tropical', aquariumLastCollect: 0, aquariumRaceDay: '', aquariumRaceN: 0, aquariumBubbleDay: '', aquariumBubbleN: 0, aquariumFrenzyAt: 0, aquariumLikes: 0, aquariumFilter: 0, aquariumLight: 0, aquariumPump: 0, pets: [], plant: null, plantLevels: {}, plantPosition: null, ownedPlants: [], ownedDecors: [], placedDecors: [], ownedWalls: ['wall_default'], wallPattern: 'wall_default', ownedWindows: ['win_none','win_classic'], windowStyle: 'win_classic', ownedFloors: ['floor_wood'], floorStyle: 'floor_wood', ownedAccessories: [], displayName: getPlayerName(), lastCoinCollect: 0, loginStreak: 0, lastLoginDay: '', achievements: [], gachaPulls: 0, giftsGiven: 0, giftsReceived: 0, jukeboxTrack: null, jukeboxVol: 0.5, unlockedLayers: 1, layerData: {} };
      // Reset to floor 1 when re-initialising (e.g. account switch)
      currentLayer = 1;
      isOutsideView = false;
      document.getElementById('outsideView')?.classList.remove('visible');
      closeFarm();
      renderAll(); // Immediately show current user before Firestore loads
      initRoomDropZone();
      initDecorDrag();
      initMobileFoodTap();
      // Listen to own room data
      // Ensure room doc exists and displayName is current — use onSnapshot for reads,
      // only write if needed (avoids redundant .get())
      _subscribeRoomSnap();

      // Periodic hunger/thirst decay: -1% every 10 min while page is open
      setInterval(async () => {
        if (document.hidden) return; // Skip when tab is hidden to reduce Firestore reads
        if (viewingUid !== currentUid) return;
        let changed = false;
        for (const pet of roomData.pets) {
          if (pet.hunger > 0) { pet.hunger = pet.hunger - 1; changed = true; }
          else if ((pet.affection ?? 0) > 0) {
            // Pet is starving (0 hunger) — its affection slowly drops
            pet.affection = Math.max(0, (pet.affection ?? 0) - STARVE_AFFECTION_LOSS);
            changed = true;
          }
          if ((pet.thirst ?? 100) > 0) { pet.thirst = (pet.thirst ?? 100) - 1; changed = true; }
        }
        if (runLiveAutoFeed()) changed = true;
        /* The farm runs on this heartbeat too. Its OWN tick lives behind
           `isFarmView` and only turns while the farm is on screen, so a player
           idling in the room came back to a trough nothing had touched — an
           auto-feeder they had bought and switched on did nothing at all until
           they next opened the farm.

           Pets are fed first on purpose. Coins are finite, and a starving pet
           bleeds affection while a hungry herd only slows down.

           Settling here also means the 3h offline cap stops binding while the
           page is open. That is the deal and it is even: the herd is charged
           for every hour it eats, and produces for every hour it is fed. */
        if (typeof runFarmProduction === 'function' && (roomData.farmAnimals || []).length) {
          runFarmProduction();
          changed = true;   // a settle always moves the food clock forward
        }
        if (changed) { await saveRoom(); renderAllDebounced(); }
      }, 10 * 60 * 1000);

      // Heartbeat: update lastSeen every 30s so others see you online
      userDocRef().update({ lastSeen: Date.now() }).catch(() => {});
      setInterval(() => {
        if (document.hidden) return; // Skip when tab is hidden to reduce Firestore reads
        if (viewingUid !== currentUid) return;
        userDocRef().update({ lastSeen: Date.now() }).catch(() => {});
      }, 30 * 1000);

      // Mark offline on page close / tab switch; detach listener when hidden to reduce reads
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && currentUid) {
          userDocRef().update({ lastSeen: 0 }).catch(() => {});
          // Detach room listener to stop Firestore reads while tab is hidden
          _unsubscribeRoomSnap();
        } else if (document.visibilityState === 'visible' && currentUid) {
          userDocRef().update({ lastSeen: Date.now() }).catch(() => {});
          // Re-attach FIRST, and let the snapshot that follows do the catching up.
          //
          // The listener was detached the whole time the tab was hidden, so
          // roomData is frozen at whatever it held when we left — including
          // lastCoinCollect. Paying plant income out against that frozen mark
          // pays for a window another device may already have been paid for:
          // put the phone down at 9:00 with the laptop's tab open, play on the
          // phone until 10:00, come back to the laptop and it bills the hour a
          // second time. Nothing local can tell the difference, so we wait for
          // the server's copy and bank it from there instead.
          _pendingWakeCatchUp = true;
          _subscribeRoomSnap();
        }
      });
      window.addEventListener('beforeunload', () => {
        if (currentUid) userDocRef().update({ lastSeen: 0 }).catch(() => {});
      });

      // Plant passive coin generation: every 5 min while online
      if (_plantCoinInterval) clearInterval(_plantCoinInterval);
      _plantCoinInterval = setInterval(async () => {
        if (document.hidden) return; // Skip when tab is hidden to reduce Firestore reads
        if (viewingUid !== currentUid) return;
        const incomeOnline = getTotalPlantIncome();
        if (!incomeOnline) return;
        const earned = incomeOnline.perCycle;
        roomData.coins += earned;
        logCoin(earned, T('Plant income') + ' 🌱');
        roomData.lastCoinCollect = Date.now();
        await saveRoom();
        renderAllDebounced();
        const _label = incomeOnline.count > 1 ? T('Your {n} trees', { n: incomeOnline.count }) : (incomeOnline.top.plantDef ? T(incomeOnline.top.plantDef.name) : T('Your plant'));
        showToast('🌱 ' + T('{name} earned {n} coins!', { name: _label, n: earned }), 'success');
      }, 5 * 60 * 1000);

      // Daily login reward & achievements now run from _handleRoomSnap once the room
      // data has actually loaded (see _postLoadHooksDone) — no blind timer race.
    }

