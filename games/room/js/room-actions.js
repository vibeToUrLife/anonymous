    /* -------------------------------
       Actions
       ------------------------------- */
    async function buyItem(type, id) {
      if (viewingUid !== currentUid) return;
      if (type === 'pet') {
        // Adopt a new pet instance (inactive � not placed in room yet)
        const petDef = PETS.find(p => p.id === id);
        // Per-type limit: max 2 of each pet type (no total cap)
        const typeCount = roomData.pets.filter(p => p.type === id).length;
        if (typeCount >= 2) return showToast('Already adopted 2 ' + (petDef ? petDef.name : id) + 's!', 'error');
        if (!petDef || roomData.coins < petDef.cost) return showToast('Not enough coins!', 'error');
        roomData.coins -= petDef.cost;
        const layerPetCount = getPetsOnLayer(currentLayer).length;
        const newPet = {
          id: makePetId(), type: id, name: petDef.name,
          hunger: 100, thirst: 100, affection: 0,
          color: PET_COLORS[id] ? PET_COLORS[id][0].key : null,
          layer: layerPetCount < MAX_PETS_PER_LAYER ? currentLayer : null, // Auto-place on current floor if space
          accessory: null,
          lastDropDay: '',
          pendingDrops: 0
        };
        roomData.pets.push(newPet);
        await saveRoom();
        renderAll();
        showToast('Adopted ' + petDef.emoji + ' ' + petDef.name + '!' + (newPet.layer ? '' : ' Place it from the shop.'), 'success');
        return;
      }
      // Plant buying logic
      const item = PLANTS.find(i => i.id === id);
      if (!item || roomData.coins < item.cost) return showToast('Not enough coins!', 'error');
      if (roomData.ownedPlants.includes(id)) return;

      roomData.coins -= item.cost;
      roomData.ownedPlants.push(id);
      // Inherit only from CHEAPER plants (prevent exploit loop)
      const newPlantCost = item.cost;
      let totalInvest = 0;
      for (const pid of roomData.ownedPlants) {
        if (pid === id) continue;
        const oldDef = PLANTS.find(p => p.id === pid);
        if (!oldDef || oldDef.cost >= newPlantCost) continue;
        const pLvl = roomData.plantLevels[pid] || 1;
        totalInvest += getTotalPlantInvestment(pid, pLvl);
      }
      const inherited = totalInvest > 0 ? getInheritedLevel(id, totalInvest) : 1;
      roomData.plantLevels[id] = inherited;
      if (inherited > 1) showToast('Inherited Lv.' + inherited + ' from previous upgrades!', 'success');
      if (!roomData.plant) roomData.plant = id;
      await saveRoom();
      renderAll();
      showToast('Bought ' + item.emoji + ' ' + item.name + '!', 'success');
    }

    async function equipItem(type, id) {
      if (viewingUid !== currentUid) return;
      if (type === 'plant') {
        roomData.plant = id;
        const targetDef = PLANTS.find(p => p.id === id);
        const targetCost = targetDef ? targetDef.cost : 0;
        let totalInvest = 0;
        for (const pid of roomData.ownedPlants) {
          if (pid === id) continue;
          const oldDef = PLANTS.find(p => p.id === pid);
          if (!oldDef || oldDef.cost >= targetCost) continue;
          const pLvl = roomData.plantLevels[pid] || 1;
          totalInvest += getTotalPlantInvestment(pid, pLvl);
        }
        if (totalInvest > 0) {
          const inherited = getInheritedLevel(id, totalInvest);
          const currentLvl = roomData.plantLevels[id] || 1;
          if (inherited > currentLvl) {
            roomData.plantLevels[id] = inherited;
            showToast('Inherited Lv.' + inherited + ' from previous upgrades!', 'success');
          }
        }
      }
      await saveRoom();
      renderAll();
      showToast('Placed in room!', 'success');
    }

    async function unequipItem(type, id) {
      if (viewingUid !== currentUid) return;
      if (type === 'plant') {
        roomData.plant = null;
      }
      await saveRoom();
      renderAll();
      showToast('Removed from room!', 'success');
    }

    /* -- Pet Swap — swap an owned unplaced pet into the current floor by replacing one -- */
    let _swapNewTypeId = null;

    function swapPet(typeId) {
      if (viewingUid !== currentUid) return;
      const petDef = PETS.find(p => p.id === typeId);
      if (!petDef) return;

      // Find an unplaced pet of this type (not on any layer)
      const unplacedPet = roomData.pets.find(p => p.type === typeId && (!p.layer || p.layer === 0));
      if (!unplacedPet) return showToast('No unplaced ' + petDef.name + ' to swap in!', 'error');

      _swapNewTypeId = typeId;
      const overlay = document.getElementById('swapOverlay');
      const listEl = document.getElementById('swapPetList');
      document.getElementById('swapDesc').textContent =
        'Move ' + petDef.emoji + ' ' + petDef.name + ' into Floor ' + currentLayer + '. Pick which pet to take out:';

      // Show pets on the CURRENT layer to choose which to remove
      const layerPets = getPetsOnLayer(currentLayer);
      listEl.innerHTML = layerPets.map(p => {
        const def = PETS.find(d => d.id === p.type);
        const emoji = def ? def.emoji : '?';
        const affTitle = getAffectionTitle(p.affection ?? 0).title;
        return '<div class="swap-pet-card" onclick="confirmSwap(\'' + p.id + '\')">' 
          + '<span class="swap-pet-emoji">' + emoji + '</span>'
          + '<div class="swap-pet-info">'
          + '<div class="swap-pet-name">' + (p.name || def?.name || p.type) + '</div>'
          + '<div class="swap-pet-stats">❤ ' + (p.affection ?? 0) + ' (' + affTitle + ') · 🍖 ' + (p.hunger ?? 100) + '%</div>'
          + '</div>'
          + '<span class="swap-pet-arrow">➡</span>'
          + '</div>';
      }).join('');

      overlay.classList.remove('hidden');
    }

    async function confirmSwap(deactivatePetId) {
      if (viewingUid !== currentUid) return;
      if (!_swapNewTypeId) return;

      // Remove the chosen pet from the current layer
      const petOut = getPet(deactivatePetId);
      if (petOut) petOut.layer = null;

      // Place the first unplaced pet of the swap type onto current layer
      const petIn = roomData.pets.find(p => p.type === _swapNewTypeId && (!p.layer || p.layer === 0));
      if (petIn) petIn.layer = currentLayer;

      _swapNewTypeId = null;
      document.getElementById('swapOverlay').classList.add('hidden');
      _lastPetKey = ''; // Force pet canvas redraw
      await saveRoom();
      renderAll();
      const inDef = PETS.find(d => d.id === petIn?.type);
      showToast('Swapped! ' + (inDef ? inDef.emoji + ' ' + inDef.name : 'Pet') + ' is now on Floor ' + currentLayer + '.', 'success');
    }

    /* -- Place / Remove pet from current floor -- */
    async function placePetInRoom(typeId) {
      if (viewingUid !== currentUid) return;
      if (getPetsOnLayer(currentLayer).length >= MAX_PETS_PER_LAYER) {
        return showToast('Floor ' + currentLayer + ' is full! Remove a pet first or use Swap.', 'error');
      }
      // Find an unplaced pet of this type that is NOT on any layer
      const pet = roomData.pets.find(p => p.type === typeId && (!p.layer || p.layer === 0));
      if (!pet) return showToast('No unplaced pet of this type!', 'error');
      pet.layer = currentLayer;
      _lastPetKey = ''; // Force pet canvas redraw
      await saveRoom();
      renderAll();
      const def = PETS.find(d => d.id === typeId);
      showToast((def ? def.emoji + ' ' + def.name : 'Pet') + ' placed on Floor ' + currentLayer + '!', 'success');
    }

    async function removePetFromRoom(typeId) {
      if (viewingUid !== currentUid) return;
      // Remove a pet of this type from the current layer
      const pet = roomData.pets.find(p => p.type === typeId && p.layer === currentLayer);
      if (!pet) return;
      pet.layer = null;
      _lastPetKey = ''; // Force pet canvas redraw
      await saveRoom();
      renderAll();
      const def = PETS.find(d => d.id === typeId);
      showToast((def ? def.emoji + ' ' + def.name : 'Pet') + ' removed from Floor ' + currentLayer + '.', 'success');
    }

    /** Remove a specific pet instance by its unique ID (for when multiple same-type pets are on a floor). */
    async function removePetById(petId) {
      if (viewingUid !== currentUid) return;
      const pet = getPet(petId);
      if (!pet || !pet.layer) return;
      const prevLayer = pet.layer;
      pet.layer = null;
      _lastPetKey = ''; // Force pet canvas redraw
      await saveRoom();
      renderAll();
      const def = PETS.find(d => d.id === pet.type);
      showToast((def ? def.emoji : '🐾') + ' ' + (pet.name || def?.name || pet.type) + ' removed from Floor ' + prevLayer + '.', 'success');
    }

    // Close swap modal
    document.getElementById('swapCloseBtn').addEventListener('click', () => {
      document.getElementById('swapOverlay').classList.add('hidden');
      _swapNewTypeId = null;
    });
    document.getElementById('swapOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'swapOverlay') {
        document.getElementById('swapOverlay').classList.add('hidden');
        _swapNewTypeId = null;
      }
    });

    async function setPetColor(petInstanceId, colorKey) {
      if (viewingUid !== currentUid) return;
      const pet = getPet(petInstanceId);
      if (!pet) return;
      pet.color = colorKey;
      _lastPetKey = ''; // Force canvas redraw
      await saveRoom();
      renderRoom();
      updatePetStatusBar();
    }

    async function buyDecor(id) {
      if (viewingUid !== currentUid) return;
      const item = DECORATIONS.find(d => d.id === id);
      if (!item || roomData.coins < item.cost) return showToast('Not enough coins!', 'error');
      if (roomData.ownedDecors.includes(id)) return;
      roomData.coins -= item.cost;
      roomData.ownedDecors.push(id);
      // Auto-place; if rug, replace any existing rug
      if (item.category === 'rug') {
        roomData.placedDecors = roomData.placedDecors.filter(d => {
          const def = DECORATIONS.find(x => x.id === d.id);
          return !def || def.category !== 'rug';
        });
      }
      roomData.placedDecors.push({ id: id, x: item.dx, y: item.dy });
      await saveRoom();
      renderDecorShop();
      showToast('Bought ' + item.emoji + ' ' + item.name + '!', 'success');
    }

    async function placeDecor(id) {
      if (viewingUid !== currentUid) return;
      const item = DECORATIONS.find(d => d.id === id);
      if (!item) return;
      if (roomData.placedDecors.some(d => d.id === id)) return;
      // If rug, remove other rugs first
      if (item.category === 'rug') {
        roomData.placedDecors = roomData.placedDecors.filter(d => {
          const def = DECORATIONS.find(x => x.id === d.id);
          return !def || def.category !== 'rug';
        });
      }
      roomData.placedDecors.push({ id: id, x: item.dx, y: item.dy });
      await saveRoom();
      renderDecorShop();
      showToast('Placed ' + item.emoji + ' in room!', 'success');
    }

    async function removeDecor(id) {
      if (viewingUid !== currentUid) return;
      roomData.placedDecors = roomData.placedDecors.filter(d => d.id !== id);
      await saveRoom();
      renderDecorShop();
      showToast('Removed from room!', 'success');
    }

    async function buyWall(id) {
      if (viewingUid !== currentUid) return;
      const item = WALL_PATTERNS.find(w => w.id === id);
      if (!item || roomData.coins < item.cost) return showToast('Not enough coins!', 'error');
      if (roomData.ownedWalls.includes(id)) return;
      roomData.coins -= item.cost;
      roomData.ownedWalls.push(id);
      roomData.wallPattern = id;
      _forceRedrawBg();
      await saveRoom();
      renderDecorShop();
      showToast('Bought ' + item.emoji + ' ' + item.name + '!', 'success');
    }

    async function equipWall(id) {
      if (viewingUid !== currentUid) return;
      roomData.wallPattern = id;
      _forceRedrawBg();
      await saveRoom();
      renderDecorShop();
      showToast('Wall pattern changed!', 'success');
    }

    async function buyFloor(id) {
      if (viewingUid !== currentUid) return;
      const item = FLOOR_PATTERNS.find(f => f.id === id);
      if (!item || roomData.coins < item.cost) return showToast('Not enough coins!', 'error');
      if (!Array.isArray(roomData.ownedFloors)) roomData.ownedFloors = ['floor_wood'];
      if (roomData.ownedFloors.includes(id)) return;
      roomData.coins -= item.cost;
      roomData.ownedFloors.push(id);
      roomData.floorStyle = id;
      _forceRedrawBg();
      await saveRoom();
      renderDecorShop();
      showToast('Bought ' + item.emoji + ' ' + item.name + '!', 'success');
    }

    async function equipFloor(id) {
      if (viewingUid !== currentUid) return;
      roomData.floorStyle = id;
      _forceRedrawBg();
      await saveRoom();
      renderDecorShop();
      showToast('Floor changed!', 'success');
    }

    async function buyWindow(id) {
      if (viewingUid !== currentUid) return;
      const item = WINDOWS.find(w => w.id === id);
      if (!item || roomData.coins < item.cost) return showToast('Not enough coins!', 'error');
      if (roomData.ownedWindows.includes(id)) return;
      roomData.coins -= item.cost;
      roomData.ownedWindows.push(id);
      roomData.windowStyle = id;
      _forceRedrawBg();
      await saveRoom();
      renderDecorShop();
      showToast('Bought ' + item.emoji + ' ' + item.name + '!', 'success');
    }

    async function equipWindow(id) {
      if (viewingUid !== currentUid) return;
      roomData.windowStyle = id;
      _forceRedrawBg();
      await saveRoom();
      renderDecorShop();
      showToast('Window changed!', 'success');
    }

    function _forceRedrawBg() {
      // Force background to re-init by clearing the init flag
      const bgc = document.getElementById('roomBgCanvas');
      if (bgc) { bgc.dataset.init = ''; }
      cancelAnimationFrame(bgAnimFrame);
      startRoomBgAnimation();
      if (bgc) bgc.dataset.init = '1';
    }

    async function feedPet(foodId, petInstanceId) {
      if (viewingUid !== currentUid) return;
      const pet = petInstanceId ? getPet(petInstanceId) : getActivePets()[0];
      if (!pet) return;
      const food = FOODS.find(f => f.id === foodId);
      if (!food || roomData.coins < food.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= food.cost;
      pet.hunger = Math.min(100, (pet.hunger ?? 100) + food.restore);
      await saveRoom();
      showToast(food.emoji + ' Fed ' + pet.name + '! +' + food.restore + '%', 'success');
      updatePetStatusBar();
    }

    async function useToy(toyId, petInstanceId) {
      if (viewingUid !== currentUid) return;
      const pet = petInstanceId ? getPet(petInstanceId) : getActivePets()[0];
      if (!pet) return;
      const toy = TOYS.find(t => t.id === toyId);
      if (!toy || roomData.coins < toy.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= toy.cost;
      const curAff = pet.affection ?? 0;
      const oldMilestone = getAffectionTitle(curAff);
      pet.affection = curAff + toy.affection;
      const newMilestone = getAffectionTitle(pet.affection);
      await saveRoom();
      if (newMilestone.min > oldMilestone.min && newMilestone.reward > 0) {
        roomData.coins += newMilestone.reward;
        await saveRoom();
        showToast('?? ' + pet.name + ' reached "' + newMilestone.title + '"! +' + newMilestone.reward + ' coins!', 'success');
      } else {
        showToast(toy.emoji + ' Played with ' + pet.name + '! ?+' + toy.affection, 'success');
      }
      updatePetStatusBar();
    }

    async function drinkPet(drinkId, petInstanceId) {
      if (viewingUid !== currentUid) return;
      const pet = petInstanceId ? getPet(petInstanceId) : getActivePets()[0];
      if (!pet) return;
      const drink = DRINKS.find(d => d.id === drinkId);
      if (!drink || roomData.coins < drink.cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= drink.cost;
      pet.thirst = Math.min(100, (pet.thirst ?? 100) + drink.restore);
      await saveRoom();
      showToast(drink.emoji + ' Gave ' + pet.name + ' a drink! +' + drink.restore + '%', 'success');
      updatePetStatusBar();
    }

    async function buyAutoFeeder() {
      if (viewingUid !== currentUid) return;
      if (roomData.autoFeeder) return;
      if (roomData.coins < AUTO_FEEDER_COST) return showToast('Not enough coins!', 'error');
      roomData.coins -= AUTO_FEEDER_COST;
      roomData.autoFeeder = true;
      roomData.autoFeedOn = true;
      runLiveAutoFeed();   // top up any already-hungry pet the moment it's installed
      await saveRoom();
      showToast('🤖 Auto-Feeder installed! Your pets will stay fed automatically.', 'success');
      renderAll();        // refresh coin counter
      renderUpgrade();    // refresh the Feed panel
    }

    async function toggleAutoFeed() {
      if (viewingUid !== currentUid) return;
      if (!roomData.autoFeeder) return;
      roomData.autoFeedOn = !roomData.autoFeedOn;
      const _fed = roomData.autoFeedOn && runLiveAutoFeed();   // feed hungry pets the moment it's switched on
      await saveRoom();
      showToast(roomData.autoFeedOn ? '🤖 Auto-Feeder ON' : '🤖 Auto-Feeder OFF', 'success');
      renderUpgrade();
      if (_fed) renderAll();   // reflect refilled stats + spent coins
    }

    // Drag-and-drop food to pet
    function onFoodDragStart(e, foodId) {
      e.dataTransfer.setData('text/plain', foodId);
      e.dataTransfer.effectAllowed = 'move';
    }

    /* -- Mobile tap-to-feed/toy system -- */
    let selectedFood = null;
    let selectedToy = null;
    let selectedDrink = null;

    function initMobileFoodTap() {
      document.addEventListener('click', (e) => {
        // Tap a food card to select it
        const foodCard = e.target.closest('.food-card[data-food]');
        if (foodCard && !foodCard.classList.contains('disabled')) {
          const foodId = foodCard.dataset.food;
          if (selectedFood === foodId) {
            selectedFood = null;
            document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
            showToast('Deselected food', '');
            return;
          }
          selectedFood = foodId; selectedToy = null; selectedDrink = null;
          document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
          foodCard.classList.add('selected');
          const food = FOODS.find(f => f.id === foodId);
          showToast(food.emoji + ' Selected! Tap your pet to feed', 'success');
          return;
        }

        // Tap a toy card to select it
        const toyCard = e.target.closest('.food-card[data-toy]');
        if (toyCard && !toyCard.classList.contains('disabled')) {
          const toyId = toyCard.dataset.toy;
          if (selectedToy === toyId) {
            selectedToy = null;
            document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
            showToast('Deselected toy', '');
            return;
          }
          selectedToy = toyId; selectedFood = null; selectedDrink = null;
          document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
          toyCard.classList.add('selected');
          const toy = TOYS.find(t => t.id === toyId);
          showToast(toy.emoji + ' Selected! Tap your pet to play', 'success');
          return;
        }

        // Tap a drink card to select it
        const drinkCard = e.target.closest('.food-card[data-drink]');
        if (drinkCard && !drinkCard.classList.contains('disabled')) {
          const drinkId = drinkCard.dataset.drink;
          if (selectedDrink === drinkId) {
            selectedDrink = null;
            document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
            showToast('Deselected drink', '');
            return;
          }
          selectedDrink = drinkId; selectedFood = null; selectedToy = null;
          document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
          drinkCard.classList.add('selected');
          const drink = DRINKS.find(d => d.id === drinkId);
          showToast(drink.emoji + ' Selected! Tap your pet to hydrate', 'success');
          return;
        }

        // Tap anywhere on room to feed/play/drink
        if (!selectedFood && !selectedToy && !selectedDrink) return;
        const room = document.getElementById('roomView');
        if (!room) return;
        const roomRect = room.getBoundingClientRect();
        const cx = e.clientX, cy = e.clientY;
        if (cx < roomRect.left || cx > roomRect.right || cy < roomRect.top || cy > roomRect.bottom) return;

        const tapX = (cx - roomRect.left) / roomRect.width;
        const tapY = (cy - roomRect.top) / roomRect.height;

        const activePets = getActivePets();
        if (!activePets.length) return;

        let closestPet = activePets[0];
        let closestDist = Infinity;
        for (const pet of activePets) {
          const st = petStates[pet.id];
          if (!st) continue;
          const dx = st.x - tapX;
          const dy = st.y - tapY;
          const dist = dx * dx + dy * dy;
          if (dist < closestDist) { closestDist = dist; closestPet = pet; }
        }
        if (selectedFood) feedPet(selectedFood, closestPet.id);
        else if (selectedToy) useToy(selectedToy, closestPet.id);
        else if (selectedDrink) drinkPet(selectedDrink, closestPet.id);
        selectedFood = null; selectedToy = null; selectedDrink = null;
        document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
      });
    }

    function initRoomDropZone() {
      const room = document.getElementById('roomView');
      room.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        room.style.outline = '2px solid rgba(247,201,126,0.5)';
      });
      room.addEventListener('dragleave', () => {
        room.style.outline = '';
      });
      room.addEventListener('drop', (e) => {
        e.preventDefault();
        room.style.outline = '';
        const foodId = e.dataTransfer.getData('text/plain');
        if (!foodId) return;

        const rect = room.getBoundingClientRect();
        const dropX = (e.clientX - rect.left) / rect.width;
        const dropY = (e.clientY - rect.top) / rect.height;

        const activePets = getActivePets();
        if (!activePets.length) return;

        let closestPet = activePets[0];
        let closestDist = Infinity;
        for (const pet of activePets) {
          const st = petStates[pet.id];
          if (!st) continue;
          const dx = st.x - dropX;
          const dy = st.y - dropY;
          const dist = dx * dx + dy * dy;
          if (dist < closestDist) {
            closestDist = dist;
            closestPet = pet;
          }
        }
        feedPet(foodId, closestPet.id);
      });
    }

    /* -- Decoration drag-to-reposition -- */
    // base: true = pos.y is the bottom of the item (hit area extends upward)
    const DECOR_HIT_SIZES = {
      clock: { w: 0.12, h: 0.12 },
      shelf: { w: 0.20, h: 0.12 },
      hangplant: { w: 0.12, h: 0.22 },
      stringlights: { w: 1.0, h: 0.08 },
      banner: { w: 0.10, h: 0.22 },
      photo: { w: 0.14, h: 0.14 },
      mirror: { w: 0.12, h: 0.18 },
      antlers: { w: 0.18, h: 0.14 },
      neon: { w: 0.22, h: 0.10 },
      poster: { w: 0.14, h: 0.18 },
      dartboard: { w: 0.14, h: 0.14 },
      wreath: { w: 0.14, h: 0.14 },
      tapestry: { w: 0.12, h: 0.20 },
      sconce: { w: 0.10, h: 0.16 },
      map: { w: 0.16, h: 0.12 },
      cuckoo: { w: 0.10, h: 0.18 },
      macrame: { w: 0.10, h: 0.22 },
      thermometer: { w: 0.06, h: 0.16 },
      plate: { w: 0.12, h: 0.12 },
      floorlamp: { w: 0.12, h: 0.30, base: true },
      sidetable: { w: 0.14, h: 0.16 },
      cushion: { w: 0.12, h: 0.10 },
      toybox: { w: 0.12, h: 0.12 },
      bookcase: { w: 0.16, h: 0.30, base: true },
      aquarium: { w: 0.18, h: 0.16 },
      guitar: { w: 0.10, h: 0.26, base: true },
      globe: { w: 0.12, h: 0.16, base: true },
      trashcan: { w: 0.10, h: 0.12, base: true },
      fan: { w: 0.12, h: 0.28, base: true },
      beanpillow: { w: 0.16, h: 0.14 },
      tv: { w: 0.20, h: 0.18, base: true },
      piano: { w: 0.14, h: 0.30, base: true },
      telescope: { w: 0.10, h: 0.26, base: true },
      cactus: { w: 0.10, h: 0.18, base: true },
      candles: { w: 0.12, h: 0.10 },
      skateboard: { w: 0.16, h: 0.06 },
      vinylplayer: { w: 0.14, h: 0.14 },
      umbrella: { w: 0.08, h: 0.24, base: true },
      terrarium: { w: 0.14, h: 0.16, base: true },
      rug_blue: { w: 0.30, h: 0.18 },
      rug_green: { w: 0.30, h: 0.18 },
      rug_pink: { w: 0.30, h: 0.18 },
      rug_star: { w: 0.30, h: 0.18 },
      rug_rainbow: { w: 0.30, h: 0.18 },
      rug_cream: { w: 0.30, h: 0.18 },
      rug_persian: { w: 0.30, h: 0.18 },
      rug_zebra: { w: 0.30, h: 0.18 },
      rug_red: { w: 0.30, h: 0.18 },
      rug_purple: { w: 0.30, h: 0.18 },
      rug_checker: { w: 0.30, h: 0.18 },
      // New wall decorations
      butterfly: { w: 0.14, h: 0.14 },
      medal: { w: 0.10, h: 0.14 },
      lantern: { w: 0.10, h: 0.16 },
      dreamcatcher: { w: 0.12, h: 0.20 },
      speaker: { w: 0.12, h: 0.12 },
      mask: { w: 0.16, h: 0.12 },
      calendar: { w: 0.16, h: 0.20 },
      katana: { w: 0.18, h: 0.14 },
      diploma: { w: 0.14, h: 0.12 },
      // New floor decorations
      coffeemaker: { w: 0.12, h: 0.14, base: true },
      gaming: { w: 0.14, h: 0.10 },
      camera: { w: 0.10, h: 0.22, base: true },
      fountain: { w: 0.14, h: 0.18, base: true },
      chessset: { w: 0.14, h: 0.10 },
      bonsai: { w: 0.12, h: 0.14, base: true },
      speaker2: { w: 0.12, h: 0.18, base: true },
      shoe_rack: { w: 0.16, h: 0.16, base: true },
      xmastree: { w: 0.18, h: 0.50, base: true },
      rocket: { w: 0.10, h: 0.22, base: true },
      minifridge: { w: 0.12, h: 0.16, base: true },
      // New rugs
      rug_ocean: { w: 0.30, h: 0.18 },
      rug_forest: { w: 0.30, h: 0.18 },
      rug_gold: { w: 0.30, h: 0.18 },
      rug_galaxy: { w: 0.30, h: 0.18 },
      rug_heart: { w: 0.30, h: 0.18 },
    };

    function decorHitTest(mx, my, p) {
      const hs = DECOR_HIT_SIZES[p.id];
      if (!hs) return false;
      const halfW = hs.w / 2;
      if (mx < p.x - halfW || mx > p.x + halfW) return false;
      if (hs.base) {
        // pos.y is bottom � hit area extends upward
        return my >= p.y - hs.h && my <= p.y;
      }
      return my >= p.y - hs.h / 2 && my <= p.y + hs.h / 2;
    }

    let decorDrag = null; // { id, offsetX, offsetY }
    let decorSaveTimer = null;

    function initDecorDrag() {
      const cvs = document.getElementById('roomBgCanvas');
      // Listen on the room container so events aren't blocked by overlapping
      // elements (e.g. pet canvas sitting on top of the background canvas)
      const room = document.getElementById('roomView');
      if (!cvs || !room) return;
      const isOwner = () => viewingUid === currentUid;

      room.addEventListener('mousedown', (e) => {
        if (!isOwner()) return;
        const rect = cvs.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;

        // Hit-test placed decorations (reverse order for z-order priority)
        const placed = [...(roomData.placedDecors || [])].reverse();
        for (const p of placed) {
          if (decorHitTest(mx, my, p)) {
            decorDrag = { id: p.id, offsetX: mx - p.x, offsetY: my - p.y };
            cvs.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation(); // Prevent pet click from firing
            return;
          }
        }
      });

      // Hover cursor � listen on room container for same reason
      room.addEventListener('mousemove', (e) => {
        if (decorDrag) return;
        if (!isOwner()) return;
        const rect = cvs.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;
        const placed = roomData.placedDecors || [];
        let over = false;
        for (const p of placed) {
          if (decorHitTest(mx, my, p)) {
            over = true; break;
          }
        }
        cvs.style.cursor = over ? 'grab' : '';
      });

      // Use document-level listeners so drag continues over overlapping elements
      document.addEventListener('mousemove', (e) => {
        if (!decorDrag) return;
        e.preventDefault();
        const rect = cvs.getBoundingClientRect();
        let nx = (e.clientX - rect.left) / rect.width - decorDrag.offsetX;
        let ny = (e.clientY - rect.top) / rect.height - decorDrag.offsetY;

        const def = DECORATIONS.find(d => d.id === decorDrag.id);
        if (def) {
          if (def.category === 'wall') { ny = Math.max(0.01, Math.min(0.60, ny)); }
          else if (def.category === 'floor' || def.category === 'rug') { ny = Math.max(0.66, Math.min(0.96, ny)); }
        }
        nx = Math.max(0.02, Math.min(0.98, nx));

        const p = roomData.placedDecors.find(d => d.id === decorDrag.id);
        if (p) { p.x = nx; p.y = ny; }
      });

      const endDrag = () => {
        if (!decorDrag) return;
        cvs.style.cursor = '';
        decorDrag = null;
        // Debounce save
        clearTimeout(decorSaveTimer);
        decorSaveTimer = setTimeout(() => saveRoom(), 300);
      };
      document.addEventListener('mouseup', endDrag);

      // Touch support — listen on room container to avoid being blocked by pet canvas
      room.addEventListener('touchstart', (e) => {
        if (!isOwner() || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const rect = cvs.getBoundingClientRect();
        const mx = (touch.clientX - rect.left) / rect.width;
        const my = (touch.clientY - rect.top) / rect.height;
        const placed = [...(roomData.placedDecors || [])].reverse();
        for (const p of placed) {
          if (decorHitTest(mx, my, p)) {
            decorDrag = { id: p.id, offsetX: mx - p.x, offsetY: my - p.y };
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }, { passive: false });

      document.addEventListener('touchmove', (e) => {
        if (!decorDrag || e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = cvs.getBoundingClientRect();
        let nx = (touch.clientX - rect.left) / rect.width - decorDrag.offsetX;
        let ny = (touch.clientY - rect.top) / rect.height - decorDrag.offsetY;
        const def = DECORATIONS.find(d => d.id === decorDrag.id);
        if (def) {
          if (def.category === 'wall') { ny = Math.max(0.01, Math.min(0.60, ny)); }
          else if (def.category === 'floor' || def.category === 'rug') { ny = Math.max(0.66, Math.min(0.96, ny)); }
        }
        nx = Math.max(0.02, Math.min(0.98, nx));
        const p = roomData.placedDecors.find(d => d.id === decorDrag.id);
        if (p) { p.x = nx; p.y = ny; }
      }, { passive: false });

      document.addEventListener('touchend', endDrag);
      document.addEventListener('touchcancel', endDrag);
    }

    /* -- Plant drag-to-reposition -- */
    let plantDragState = null; // { startX, startY, origLeft, origBottom }
    let plantSaveTimer = null;

    function initPlantDrag(el) {
      // Remove old listeners by cloning
      const room = el.parentElement;
      if (!room) return;

      el.addEventListener('mousedown', (e) => {
        if (viewingUid !== currentUid) return;
        if (e.target.closest('.empty-slot')) return;
        e.preventDefault();
        const roomRect = room.getBoundingClientRect();
        plantDragState = {
          startX: e.clientX,
          startY: e.clientY,
          origLeft: parseFloat(el.style.left) || 80,
          origBottom: parseFloat(el.style.bottom) || 18,
          roomW: roomRect.width,
          roomH: roomRect.height
        };
        el.style.cursor = 'grabbing';
      });

      el.addEventListener('touchstart', (e) => {
        if (viewingUid !== currentUid) return;
        if (e.target.closest('.empty-slot')) return;
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const roomRect = room.getBoundingClientRect();
        plantDragState = {
          startX: touch.clientX,
          startY: touch.clientY,
          origLeft: parseFloat(el.style.left) || 80,
          origBottom: parseFloat(el.style.bottom) || 18,
          roomW: roomRect.width,
          roomH: roomRect.height
        };
        e.preventDefault();
      }, { passive: false });

      document.addEventListener('mousemove', (e) => {
        if (!plantDragState) return;
        e.preventDefault();
        const dx = e.clientX - plantDragState.startX;
        const dy = e.clientY - plantDragState.startY;
        let newLeft = plantDragState.origLeft + (dx / plantDragState.roomW) * 100;
        let newBottom = plantDragState.origBottom - (dy / plantDragState.roomH) * 100;
        newLeft = Math.max(5, Math.min(95, newLeft));
        newBottom = Math.max(2, Math.min(30, newBottom));
        el.style.left = newLeft + '%';
        el.style.bottom = newBottom + '%';
      });

      document.addEventListener('touchmove', (e) => {
        if (!plantDragState || e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - plantDragState.startX;
        const dy = touch.clientY - plantDragState.startY;
        let newLeft = plantDragState.origLeft + (dx / plantDragState.roomW) * 100;
        let newBottom = plantDragState.origBottom - (dy / plantDragState.roomH) * 100;
        newLeft = Math.max(5, Math.min(95, newLeft));
        newBottom = Math.max(2, Math.min(30, newBottom));
        el.style.left = newLeft + '%';
        el.style.bottom = newBottom + '%';
      }, { passive: false });

      const endPlantDrag = () => {
        if (!plantDragState) return;
        el.style.cursor = 'grab';
        roomData.plantPosition = {
          left: parseFloat(el.style.left) || 80,
          bottom: parseFloat(el.style.bottom) || 18
        };
        plantDragState = null;
        clearTimeout(plantSaveTimer);
        plantSaveTimer = setTimeout(() => saveRoom(), 300);
      };
      document.addEventListener('mouseup', endPlantDrag);
      document.addEventListener('touchend', endPlantDrag);
      document.addEventListener('touchcancel', endPlantDrag);
    }

    async function upgradePlant() {
      if (viewingUid !== currentUid) return;
      const plantId = roomData.plant;
      if (!plantId) return;
      const lvl = roomData.plantLevels[plantId] || 1;
      const cost = getPlantUpgradeCost(plantId, lvl);
      if (cost === null || roomData.coins < cost) return showToast('Not enough coins!', 'error');
      roomData.coins -= cost;
      roomData.plantLevels[plantId] = PLANT_LEVELS[lvl].level;
      await saveRoom();
      showToast('Plant upgraded to Lv.' + PLANT_LEVELS[lvl].level + '!', 'success');
    }

    async function visitRoom(uid) {
      viewingUid = uid;
      const snap = await userDocRef(uid).get();
      if (!snap.exists) return showToast('Room not found', 'error');
      const d = snap.data();
      // Migrate visited room's pet data to new format
      roomData.pets = migratePets(d);
      roomData.plant = d.plant ?? null;
      roomData.plantLevels = d.plantLevels ?? {};
      roomData.displayName = d.displayName ?? 'Anonymous';
      roomData.ownedWalls = d.ownedWalls ?? ['wall_default'];
      roomData.ownedWindows = d.ownedWindows ?? ['win_none','win_classic'];
      roomData.jukeboxTrack = d.jukeboxTrack ?? null;
      roomData.jukeboxVol = d.jukeboxVol ?? 0.5;
      roomData.ownedDecors = d.ownedDecors ?? [];
      // Show the host's floor drops read-only (collection is blocked by the
      // viewingUid===currentUid guard in the click handler).
      roomData.petDrops = Array.isArray(d.petDrops) ? d.petDrops : [];
      roomData.petCollections = d.petCollections || {};
      // Mirror the host's Auto-Feeder flags so a visit doesn't show our own state
      // (auto-feed never runs while viewing — it's owner-gated).
      roomData.autoFeeder = d.autoFeeder || false;
      roomData.autoFeedOn = d.autoFeedOn || false;
      // Mirror the host's farm too (farm entry + production are owner-gated).
      roomData.farmAnimals = Array.isArray(d.farmAnimals) ? d.farmAnimals : [];
      roomData.farmDrops = Array.isArray(d.farmDrops) ? d.farmDrops : [];
      roomData.farmDecors = Array.isArray(d.farmDecors) ? d.farmDecors : [];
      roomData.farmFood = d.farmFood || 0;
      roomData.farmFoodAt = d.farmFoodAt || 0;
      // Load multi-layer data for visited room (visitor starts on floor 1)
      roomData.unlockedLayers = d.unlockedLayers ?? 1;
      const rawLayerData = d.layerData ? JSON.parse(JSON.stringify(d.layerData)) : {};
      if (!rawLayerData[1]) {
        const rawPlaced = d.placedDecors ?? [];
        rawLayerData[1] = {
          wallPattern: d.wallPattern ?? 'wall_default',
          windowStyle: d.windowStyle ?? 'win_classic',
          placedDecors: rawPlaced.map(pd => {
            if (typeof pd === 'string') {
              const def = DECORATIONS.find(x => x.id === pd);
              return { id: pd, x: def ? def.dx : 0.5, y: def ? def.dy : 0.5 };
            }
            return pd;
          }),
          plantPosition: d.plantPosition ?? null,
          plant: d.plant ?? null,
          floorStyle: d.floorStyle ?? 'floor_wood'
        };
      }
      roomData.layerData = rawLayerData;
      // Visitors always start on floor 1
      currentLayer = 1;
      isOutsideView = false;
      document.getElementById('outsideView')?.classList.remove('visible');
      closeFarm();
      const visitLD = roomData.layerData[1] || {};
      roomData.wallPattern = visitLD.wallPattern || 'wall_default';
      roomData.windowStyle = visitLD.windowStyle || 'win_classic';
      roomData.placedDecors = Array.isArray(visitLD.placedDecors) ? visitLD.placedDecors : [];
      roomData.plantPosition = visitLD.plantPosition || null;
      roomData.plant = visitLD.plant != null ? visitLD.plant : (d.plant ?? null);
      roomData.floorStyle = visitLD.floorStyle || 'floor_wood';
      roomData.ownedFloors = d.ownedFloors ?? ['floor_wood'];
      // Reset render keys so room fully redraws for visited user
      _lastPetKey = '';
      _lastPlantKey = '';
      closePetStatus();
      const bgc = document.getElementById('roomBgCanvas');
      if (bgc) delete bgc.dataset.init;
      // Keep own coins visible
      renderAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goHome() {
      viewingUid = currentUid;
      // Reset render keys so room fully redraws for own data
      _lastPetKey = '';
      _lastPlantKey = '';
      const bgc = document.getElementById('roomBgCanvas');
      if (bgc) delete bgc.dataset.init;
      // Re-init to get own data
      initRoom();
    }

    /* -------------------------------
       Canvas plant drawing � 30 levels
       ------------------------------- */
