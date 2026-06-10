    /* ═══════════════════════════════
       State
       ═══════════════════════════════ */
    let roomData = { coins: 0, petDrops: [], petCollections: {}, autoFeeder: false, autoFeedOn: false, farmAnimals: [], farmDrops: [], farmDecors: [], farmFood: 0, farmFoodAt: 0, farmStock: {}, farmTotalCollected: 0, farmCapLevel: 0, farmAutoCollect: false, farmVariants: {}, farmPlots: [], farmOrdersDay: '', farmOrdersDone: [], farmMachines: {}, pets: [], plant: null, plantLevels: {}, plantPosition: null, ownedPlants: [], ownedDecors: [], placedDecors: [], ownedWalls: ['wall_default'], wallPattern: 'wall_default', ownedWindows: ['win_none','win_classic'], windowStyle: 'win_classic', ownedFloors: ['floor_wood'], floorStyle: 'floor_wood', ownedAccessories: [], displayName: '', lastCoinCollect: 0, loginStreak: 0, lastLoginDay: '', achievements: [], gachaPulls: 0, giftsGiven: 0, giftsReceived: 0, jukeboxTrack: null, jukeboxVol: 0.5, unlockedLayers: 1, layerData: {} };
    // Active layer (1–3) and view mode — local UI state, NOT saved to Firestore
    let currentLayer = 1;
    let isOutsideView = false;

    /* ═══════════════════════════════
       Helpers
       ═══════════════════════════════ */
    const toastEl = document.getElementById('toast');
    let toastTimer = null;
    function showToast(msg, type) {
      toastEl.textContent = msg;
      toastEl.className = 'toast ' + (type || '') + ' show';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
    }

    // Pet instance helpers
    // Maximum number of pets allowed on a single layer/floor
    const MAX_PETS_PER_LAYER = 2;

    function getPet(id) { return roomData.pets.find(p => p.id === id); }
    /** Returns pets assigned to the current active layer. */
    function getActivePets() { return roomData.pets.filter(p => p.layer === currentLayer); }
    /** Returns pets assigned to a specific layer. */
    function getPetsOnLayer(n) { return roomData.pets.filter(p => p.layer === n); }
    /** Returns all pets placed on any layer (across all floors). */
    function getAllPlacedPets() { return roomData.pets.filter(p => p.layer != null && p.layer > 0); }
    /** Checks if a specific pet is already placed on a different layer than the given one. */
    function isPetOnOtherLayer(petId, layerNum) {
      const pet = getPet(petId);
      return pet && pet.layer != null && pet.layer > 0 && pet.layer !== layerNum;
    }
    function makePetId() { return 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4); }

    /**
     * Migrate old pet format to new layer-based pets array.
     * Old formats:
     *   - pet/pet2 + ownedPets (very old)
     *   - pets[].active (boolean) → convert to pets[].layer (number|null)
     */
    function migratePets(d) {
      if (d.pets && d.pets.length) {
        // Migrate from active (boolean) to layer (number) if needed
        return d.pets.map(p => {
          const withLayer = (p.layer === undefined)
            ? { ...p, layer: p.active ? 1 : null }
            : p;
          return { lastDropDay: '', pendingDrops: 0, ...withLayer };
        });
      }
      const pets = [];
      const addPet = (type, layer) => {
        const def = PETS.find(p => p.id === type);
        pets.push({
          id: makePetId(),
          type: type,
          name: def ? def.name : type,
          hunger: (d.petHunger && d.petHunger[type]) ?? 100,
          thirst: 100,
          affection: (d.petAffection && d.petAffection[type]) ?? 0,
          color: (d.petColors && d.petColors[type]) || null,
          layer: layer,
          accessory: (d.petAccessories && d.petAccessories[type]) || null,
          lastDropDay: '',
          pendingDrops: 0
        });
      };
      if (d.pet) addPet(d.pet, 1);
      if (d.pet2 && d.pet2 !== d.pet) addPet(d.pet2, 1);
      const equipped = [d.pet, d.pet2].filter(Boolean);
      for (const type of (d.ownedPets || [])) {
        if (!equipped.includes(type)) addPet(type, null);
      }
      return pets;
    }

    function userDocRef(uid) { return db.collection('rooms').doc(uid || currentUid); }

    /* ═══════════════════════════════
       Multi-Layer Helpers
       ═══════════════════════════════ */

    /** Returns the default wall pattern applied when a new layer is unlocked. */
    function getLayerDefaultWall(n) {
      const defaults = { 1: 'wall_default', 2: 'wall_brick', 3: 'wall_galaxy' };
      return defaults[n] || 'wall_default';
    }

    /** Returns the default window style applied when a new layer is unlocked. */
    function getLayerDefaultWindow(n) {
      const defaults = { 1: 'win_classic', 2: 'win_round', 3: 'win_arch' };
      return defaults[n] || 'win_classic';
    }

    /**
     * Returns every plant currently placed across all floors as
     * [{ plant, level, layer }]. The active layer reads the live roomData.plant
     * (which may not yet be flushed into layerData).
     */
    function getAllLayerPlants() {
      const result = [];
      if (roomData.plant) {
        result.push({ plant: roomData.plant, level: roomData.plantLevels[roomData.plant] || 1, layer: currentLayer });
      }
      const ld = roomData.layerData || {};
      for (const k of Object.keys(ld)) {
        if (Number(k) === currentLayer) continue; // active layer already counted above
        const pl = ld[k] && ld[k].plant;
        if (pl) result.push({ plant: pl, level: roomData.plantLevels[pl] || 1, layer: Number(k) });
      }
      return result;
    }

    /**
     * Revenue follows the single best-earning plant across all floors.
     * Returns { perCycle, plant, plantDef, plantLvl, layer } or null if no plants.
     * perCycle = coins earned every 5-minute cycle (coinRate × level).
     */
    function getBestPlantIncome() {
      let best = null;
      for (const p of getAllLayerPlants()) {
        const def = PLANTS.find(x => x.id === p.plant);
        const perCycle = (def ? def.coinRate : 1) * p.level;
        if (!best || perCycle > best.perCycle) {
          best = { perCycle, plant: p.plant, plantDef: def, plantLvl: p.level, layer: p.layer };
        }
      }
      return best;
    }

    /**
     * Writes the current in-memory wall/window/decors/plantPosition back into
     * roomData.layerData[currentLayer] so the data is always consistent before saving.
     */
