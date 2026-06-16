    async function saveRoom() {
      if (viewingUid !== currentUid) return;
      if (!_roomLoaded) return; // Don't save defaults before Firestore data loads
      // Sync active layer's mutable state (wall/window/decors/plantPos) into layerData
      flushLayerData();
      const data = {
        coins: roomData.coins,
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
        farmCapLevel: roomData.farmCapLevel || 0,
        farmAutoCollect: roomData.farmAutoCollect || false,
        farmVariants: roomData.farmVariants || {},
        farmPlots: roomData.farmPlots || [],
        farmOrdersDay: roomData.farmOrdersDay || '',
        farmOrdersDone: roomData.farmOrdersDone || [],
        farmMachines: roomData.farmMachines || {},
        farmCartLeftAt: roomData.farmCartLeftAt || 0,
        farmCartWanted: roomData.farmCartWanted || null,
        farmCartSold: roomData.farmCartSold || null,
        farmTroughLevel: roomData.farmTroughLevel || 0,
        aquariumFish: roomData.aquariumFish || [],
        aquariumTheme: roomData.aquariumTheme || 'tropical',
        aquariumLastCollect: roomData.aquariumLastCollect || 0,
        aquariumRaceDay: roomData.aquariumRaceDay || '',
        aquariumBubbleDay: roomData.aquariumBubbleDay || '',
        aquariumFrenzyAt: roomData.aquariumFrenzyAt || 0,
        // NOTE: aquariumLikes is intentionally NOT written here — only visitors
        // change it (via increment), so an owner save must never clobber it.
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
      _lastLocalSaveTime = Date.now();
      await userDocRef().set(data, { merge: true });
    }

    // ── Room "while you were away" coin modal (mirrors the farm offline modal).
    // Mandatory: no Close; the button OR a backdrop tap collects (auto-collect).
    let _roomCoinAwayPlan = null;
    function _showRoomCoinAway(plan) {
      _roomCoinAwayPlan = plan;
      const el = document.getElementById('roomCoinModal');
      if (!el) return;
      el.innerHTML =
        '<div class="ws-box">' +
          '<div class="ws-head">🌱 While you were away…</div>' +
          '<div class="ws-sub">Your ' + plan.name + ' earned coins. Collect them to keep it growing!</div>' +
          '<div class="ws-slot"><span class="ws-slot-no">🪙 Coins</span><span class="ws-slot-state">+' + plan.earned + '</span></div>' +
          '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="collectRoomCoinAway()">📦 Collect</button>' +
        '</div>';
      el.style.display = 'flex';
    }
    function _hideRoomCoinAway() {
      _roomCoinAwayPlan = null;
      const el = document.getElementById('roomCoinModal');
      if (el) el.style.display = 'none';
    }
    // Collect the offline coins (button OR backdrop tap). Only here do the coins get
    // added and the timer reset — until collected they stay pending (recomputed on reload).
    async function collectRoomCoinAway() {
      const plan = _roomCoinAwayPlan;
      _hideRoomCoinAway();
      if (!plan || viewingUid !== currentUid) return;
      roomData.coins += plan.earned;
      roomData.lastCoinCollect = Date.now();
      await saveRoom();
      showToast('💰 Collected ' + plan.earned + ' coins!', 'success');
      renderAllDebounced();
    }

    /* ═══════════════════════════════
       Init
       ═══════════════════════════════ */
    let _offlineCoinsCollected = false;
    let _farmCatchupDone = false;
    let _plantCoinInterval = null;
    let _lastLocalSaveTime = 0;
    let _unsubRoomSnap = null;
    let _roomLoaded = false;

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
      if (snap.exists) {
        // Check displayName sync once on first snapshot
        if (!_offlineCoinsCollected) {
          const currentName = getPlayerName();
          if (snap.data().displayName !== currentName) {
            userDocRef().update({ displayName: currentName });
          }
        }
        const d = snap.data();
        roomData.coins = Math.floor(d.coins ?? 0); // coins are always whole
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
        roomData.aquariumLastCollect = d.aquariumLastCollect || 0;
        roomData.aquariumRaceDay = d.aquariumRaceDay || '';
        roomData.aquariumBubbleDay = d.aquariumBubbleDay || '';
        roomData.aquariumFrenzyAt = d.aquariumFrenzyAt || 0;
        roomData.aquariumLikes = d.aquariumLikes || 0;
        roomData.farmDrops = Array.isArray(d.farmDrops) ? d.farmDrops : [];
        roomData.farmDecors = Array.isArray(d.farmDecors) ? d.farmDecors : [];
        roomData.farmFood = d.farmFood || 0;
        roomData.farmFoodAt = d.farmFoodAt || 0;
        roomData.farmStock = d.farmStock || {};
        roomData.farmTotalCollected = d.farmTotalCollected || 0;
        roomData.farmCapLevel = d.farmCapLevel || 0;
        roomData.farmAutoCollect = d.farmAutoCollect || false;
        roomData.farmVariants = d.farmVariants || {};
        roomData.farmPlots = Array.isArray(d.farmPlots) ? d.farmPlots : [];
        roomData.farmOrdersDay = d.farmOrdersDay || '';
        roomData.farmOrdersDone = Array.isArray(d.farmOrdersDone) ? d.farmOrdersDone : [];
        roomData.farmMachines = d.farmMachines || {};
        roomData.farmCartLeftAt = d.farmCartLeftAt || 0;
        roomData.farmCartWanted = d.farmCartWanted || null;
        roomData.farmCartSold = d.farmCartSold || null;
        roomData.farmTroughLevel = d.farmTroughLevel || 0;
        _roomLoaded = true;
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
        // Revenue follows the single best-earning plant across all floors.
        const bestOffline = getBestPlantIncome();
        if (!_offlineCoinsCollected && bestOffline) {
          _offlineCoinsCollected = true;
          const plantLvl = bestOffline.plantLvl;
          const plantDef = bestOffline.plantDef;
          const coinsPerCycle = bestOffline.perCycle;
          const lastCollect = roomData.lastCoinCollect || Date.now();
          // Cap offline elapsed time to PLANT_OFFLINE_CAP_MS (2 hours)
          const rawElapsed = Date.now() - lastCollect;
          const elapsed = Math.min(rawElapsed, PLANT_OFFLINE_CAP_MS);
          const cycles = Math.floor(elapsed / (5 * 60 * 1000));
          if (cycles > 0) {
            const earned = cycles * coinsPerCycle;
            const _name = 'Lv.' + plantLvl + ' ' + (plantDef ? plantDef.name : 'plant');
            if (rawElapsed >= PLANT_OFFLINE_MODAL_MS) {
              // ≥1h away → mandatory collect modal. Coins are added (and the timer
              // reset) only on collect — until then they stay pending.
              setTimeout(function () { _showRoomCoinAway({ earned: earned, name: _name }); }, 800);
            } else {
              // Short trip → bank it straight away (no modal).
              roomData.coins += earned;
              roomData.lastCoinCollect = Date.now();
              saveRoom();
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
            const _afSpent = _afPlan.coinsSpent;
            setTimeout(function () {
              showToast('🤖 Auto-Feeder kept your pets fed — spent ' + _afSpent + ' coins while you were away!', 'success');
            }, 1000);
          }
          saveRoom();
        }
        // Farm offline produce is no longer applied on load — it's banked and shown
        // in the mandatory "while you were away" collect modal when you open the farm
        // (see openFarm / _offlinePlan in room-farm-view.js).
        maybeGenerateDailyDrops();
        _roomLoaded = true;
      } else {
        // New user — create room document
        _roomLoaded = true;
        roomData.displayName = getPlayerName();
        saveRoom();
      }
      // Hide loading overlay and always render on first snapshot
      const _loadOv = document.getElementById('roomLoadingOverlay');
      const _wasFirstLoad = _loadOv && _loadOv.style.display !== 'none';
      if (_loadOv) _loadOv.style.display = 'none';
      // Deep-link: index.html "Farm" button links to room.html?view=farm — open it
      // once the room has loaded (own room only).
      if (_wasFirstLoad) _maybeOpenFarmFromUrl();
      // Always render on first load; skip only if a local save just triggered this snapshot
      if (!_wasFirstLoad && Date.now() - _lastLocalSaveTime < 2000) return;
      renderAllDebounced();
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
          changed = true;
        }
      }
      return changed;
    }

    async function initRoom() {
      _offlineCoinsCollected = false;
      _farmCatchupDone = false;
      _roomLoaded = false;
      // Unsubscribe previous room listener (account switch)
      _unsubscribeRoomSnap();
      if (unsubVisitList) { unsubVisitList(); unsubVisitList = null; }
      // Reset roomData to defaults for clean account switch
      roomData = { coins: 0, petDrops: [], petCollections: {}, autoFeeder: false, autoFeedOn: false, farmAnimals: [], farmDrops: [], farmDecors: [], farmFood: 0, farmFoodAt: 0, farmStock: {}, farmTotalCollected: 0, farmCapLevel: 0, farmAutoCollect: false, farmVariants: {}, farmPlots: [], farmOrdersDay: '', farmOrdersDone: [], farmMachines: {}, farmCartLeftAt: 0, farmTroughLevel: 0, aquariumFish: [], aquariumTheme: 'tropical', aquariumLastCollect: 0, aquariumRaceDay: '', aquariumBubbleDay: '', aquariumFrenzyAt: 0, aquariumLikes: 0, pets: [], plant: null, plantLevels: {}, plantPosition: null, ownedPlants: [], ownedDecors: [], placedDecors: [], ownedWalls: ['wall_default'], wallPattern: 'wall_default', ownedWindows: ['win_none','win_classic'], windowStyle: 'win_classic', ownedFloors: ['floor_wood'], floorStyle: 'floor_wood', ownedAccessories: [], displayName: getPlayerName(), lastCoinCollect: 0, loginStreak: 0, lastLoginDay: '', achievements: [], gachaPulls: 0, giftsGiven: 0, giftsReceived: 0, jukeboxTrack: null, jukeboxVol: 0.5, unlockedLayers: 1, layerData: {} };
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
          // Collect plant coins earned while tab was hidden (capped at 2 hours)
          const bestHidden = getBestPlantIncome();
          if (viewingUid === currentUid && bestHidden && roomData.lastCoinCollect && !_roomCoinAwayPlan) {
            const plantLvl = bestHidden.plantLvl;
            const plantDef = bestHidden.plantDef;
            const coinsPerCycle = bestHidden.perCycle;
            const rawElapsed = Date.now() - roomData.lastCoinCollect;
            const elapsed = Math.min(rawElapsed, PLANT_OFFLINE_CAP_MS);
            const cycles = Math.floor(elapsed / (5 * 60 * 1000));
            if (cycles > 0) {
              const earned = cycles * coinsPerCycle;
              roomData.coins += earned;
              roomData.lastCoinCollect = Date.now();
              saveRoom();
              showToast('🌱 ' + (plantDef ? plantDef.name : 'Plant') + ' earned ' + earned + ' coins while tab was hidden!', 'success');
            }
          }
          // Reattach room listener to resume real-time updates
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
        const bestOnline = getBestPlantIncome();
        if (!bestOnline) return;
        const plantDef = bestOnline.plantDef;
        const earned = bestOnline.perCycle;
        roomData.coins += earned;
        roomData.lastCoinCollect = Date.now();
        await saveRoom();
        renderAllDebounced();
        showToast('🌱 ' + (plantDef ? plantDef.name : 'Plant') + ' earned ' + earned + ' coins!', 'success');
      }, 5 * 60 * 1000);

      // Check daily login reward & achievements on load
      setTimeout(() => { checkDailyOnLogin(); checkAchievements(); }, 1500);
    }

