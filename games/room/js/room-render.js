    /* ═══════════════════════════════
       Render
       ═══════════════════════════════ */
    let _renderAllTimer = null;
    function renderAllDebounced() {
      if (_renderAllTimer) return;
      _renderAllTimer = requestAnimationFrame(() => { _renderAllTimer = null; renderAll(); });
    }
    function renderAll() {
      const isOwner = viewingUid === currentUid;

      // Coin display — always whole coins (guards any stray fractional balance)
      document.getElementById('coinAmount').textContent = Math.floor(roomData.coins || 0);

      // Title
      const name = roomData.displayName || T('Anonymous');
      document.getElementById('pageTitle').textContent = isOwner ? T('My Room') : T("{name}'s Room", { name: name });
      document.getElementById('ownerName').textContent = isOwner ? T('Welcome, {name}', { name: name }) : '';

      // Tabs visibility (hidden while the farm or aquarium — each with its own
      // panel — is open; both views replace the room's tab bar)
      document.getElementById('tabsBar').style.display = (isOwner && !isFarmView && !(typeof isAquariumView !== 'undefined' && isAquariumView)) ? 'flex' : 'none';
      document.querySelectorAll('.tab-panel').forEach(p => {
        if (!isOwner) p.classList.remove('active');
      });
      if (!isOwner) document.getElementById('panel-visit').classList.add('active');

      renderRoom();
      const activeTab = document.querySelector('.tab-btn.active');
      const tabId = activeTab ? activeTab.dataset.tab : 'shop';
      if (isOwner) {
        renderActiveTab(tabId);
      }
      if (!isOwner || tabId === 'extras') renderGuestbook();
      renderVisitList();
      // Keep the floor badge in sync with the current layer / view state
      updateLayerBadge();
    }

    function renderActiveTab(tabId) {
      if (tabId === 'shop') { renderShop(); }
      else if (tabId === 'upgrade') { renderUpgrade(); }
      else if (tabId === 'extras') { renderAccessoryShop(); renderJukebox(); renderGachaTab(); }
    }

    function coinSVG(size) {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" style="vertical-align:-2px">' +
        '<circle cx="50" cy="50" r="46" fill="#f7c97e" stroke="#c9952a" stroke-width="6"/>' +
        '<circle cx="50" cy="50" r="34" fill="none" stroke="#c9952a" stroke-width="3" opacity=".4"/>' +
        '<text x="50" y="58" text-anchor="middle" font-size="40" font-weight="bold" fill="#8a5e1f" font-family="sans-serif">$</text></svg>';
    }

    /* ═══════════════════════════════
       Coin history modal
       ───────────────────────────────
       Tapping the coin badge (shared across room / farm / aquarium) opens a
       readable log of how the balance moved. Rows come from roomData.coinHistory
       (see logCoin / reconcileCoinHistory in room-state.js). Newest first. */
    function _coinHistEscape(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function _coinHistTime(ts) {
      if (!ts) return '';
      const diff = Date.now() - ts;
      if (diff < 60000) return T('just now');
      if (diff < 3600000) return T('{n}m ago', { n: Math.floor(diff / 60000) });
      if (diff < 86400000) return T('{n}h ago', { n: Math.floor(diff / 3600000) });
      if (diff < 604800000) return T('{n}d ago', { n: Math.floor(diff / 86400000) });
      try {
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } catch (e) { return ''; }
    }
    function renderCoinHistory() {
      const listEl = document.getElementById('coinHistList');
      const balEl = document.getElementById('coinHistBalance');
      if (!listEl) return;
      if (balEl) balEl.textContent = Math.floor(roomData.coins || 0).toLocaleString();
      const hist = Array.isArray(roomData.coinHistory) ? roomData.coinHistory : [];
      if (!hist.length) {
        listEl.innerHTML = '<div class="coinhist-empty">' + T('No coin activity yet.') + '<br>' +
          T('Earn or spend some coins and it\'ll show up here!') + '</div>';
        return;
      }
      let html = '';
      for (let i = hist.length - 1; i >= 0; i--) {   // newest first
        const e = hist[i] || {};
        const d = Math.round(e.d || 0);
        const cls = d > 0 ? 'pos' : (d < 0 ? 'neg' : 'zero');
        const deltaTxt = d > 0 ? ('+' + d.toLocaleString()) : (d < 0 ? ('−' + Math.abs(d).toLocaleString()) : '—');
        const bal = Math.floor(e.b || 0).toLocaleString();
        html += '<div class="coinhist-row">' +
          '<div class="chr-mid">' +
            '<div class="chr-reason">' + _coinHistEscape(e.r || T('Coins')) + '</div>' +
            '<div class="chr-time">' + _coinHistEscape(_coinHistTime(e.t)) + '</div>' +
          '</div>' +
          '<div class="chr-delta ' + cls + '">' + deltaTxt + '</div>' +
          '<div class="chr-bal">' + bal + '</div>' +
        '</div>';
      }
      listEl.innerHTML = html;
    }
    function openCoinHistory() {
      renderCoinHistory();
      const ov = document.getElementById('coinHistOverlay');
      if (ov) ov.classList.remove('hidden');
    }
    function closeCoinHistory() {
      const ov = document.getElementById('coinHistOverlay');
      if (ov) ov.classList.add('hidden');
    }
    (function wireCoinHistory() {
      const badge = document.getElementById('coinDisplay');
      if (badge) {
        badge.addEventListener('click', openCoinHistory);
        badge.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCoinHistory(); }
        });
      }
      const x = document.getElementById('coinHistXBtn');
      if (x) x.addEventListener('click', closeCoinHistory);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeCoinHistory();
      });
    })();

    let _lastPetKey = '';
    let _lastPlantKey = '';

    function renderRoom() {
      const petSlot = document.getElementById('petSlot');
      const plantSlot = document.getElementById('plantSlot');
      const isOwner = viewingUid === currentUid;

      // Canvas-drawn room background (only init once)
      if (!document.getElementById('roomBgCanvas')?.dataset.init) {
        startRoomBgAnimation();
        const bgc = document.getElementById('roomBgCanvas');
        if (bgc) bgc.dataset.init = '1';
      }

      // Pet — canvas drawn, walks in 2D wander path
      const activePets = getActivePets();
      const petKey = activePets.map(p => p.id + ':' + (p.color || '') + ':' + p.type).join(',');
      if (activePets.length) {
        // Only recreate canvas if pet list changed
        if (petKey !== _lastPetKey) {
          _lastPetKey = petKey;
          petSlot.innerHTML = '<canvas id="petCanvas" draggable="false" style="user-select:none"></canvas>';
          const petInfos = activePets.map(p => ({
            id: p.id,
            type: p.type,
            hunger: p.hunger ?? 100,
            color: p.color || null
          }));
          startPetAnimation(petInfos);
        }
      } else {
        _lastPetKey = '';
        petSlot.innerHTML = '';
      }

      // Plant — canvas drawn, grows per level
      const plantKey = roomData.plant ? (roomData.plant + ':' + (roomData.plantLevels[roomData.plant] || 1)) : '';
      if (roomData.plant) {
        if (plantKey !== _lastPlantKey) {
          _lastPlantKey = plantKey;
          const plantDef = PLANTS.find(p => p.id === roomData.plant);
          const plantLvl = roomData.plantLevels[roomData.plant] || 1;
          const clampedLvl = Math.min(plantLvl, 30);
          const lvl = PLANT_LEVELS[clampedLvl - 1];
          plantSlot.innerHTML =
            '<div class="plant-canvas-wrap"><canvas id="plantCanvas" style="width:120px;height:140px"></canvas></div>' +
            '<div class="plant-level">' + T('Lv.{n} {label}', { n: plantLvl, label: T(lvl.label) }) + '</div>';
          // Apply saved position or default
          const pos = roomData.plantPosition || { left: 80, bottom: 18 };
          plantSlot.style.left = pos.left + '%';
          plantSlot.style.bottom = pos.bottom + '%';
          plantSlot.style.right = '';
          plantSlot.style.transform = 'translateX(-50%)';
          drawPlant(plantDef?.id || 'seedling', clampedLvl);
          if (isOwner) initPlantDrag(plantSlot);
        }
      } else {
        _lastPlantKey = '';
        plantSlot.innerHTML = '';
        plantSlot.style.left = '80%';
        plantSlot.style.bottom = '18%';
        plantSlot.style.right = '';
        plantSlot.style.transform = 'translateX(-50%)';
      }
    }

    function renderShop() {
      // Pet shop — adopt only, no color/equip
      renderPetShop();
      renderShopSection('plantShop', PLANTS, roomData.ownedPlants, [roomData.plant], 'plant',
        '<span style="display:block;font-size:10px;color:rgba(255,255,255,0.45);margin-top:4px">🌱 ' +
        T('One unique plant per floor — every placed tree earns coins!') + '</span>');
      // Only render decor shop if its sub-panel is visible (avoids 99 canvas preview draws)
      const decorPanel = document.getElementById('decorShopWrap');
      if (decorPanel && decorPanel.classList.contains('active')) renderDecorShop();
    }

    function drawPetPreview(cvs, petType) {
      // 64x52 is the CSS size (.shop-preview pins it); fitCanvas gives the buffer
      // the screen's real pixels so these little cards are not soft.
      const w = 64, h = 52;
      fitCanvas(cvs, w, h);
      const ctx = cvs.getContext('2d');
      // Soft background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, 'rgba(200,210,220,0.3)'); bg.addColorStop(1, 'rgba(180,160,140,0.3)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // Floor
      ctx.fillStyle = 'rgba(139,115,85,0.2)'; ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.save();
      ctx.translate(w / 2, h * 0.65);
      const size = 18;
      // moving=false, so sprite pets give their idle pose — which for the cat
      // and the dog is the head-on sit, exactly what a card wants.
      drawPetCanvas(ctx, petType, size, 0, false, 100, 0, null, 0);
      ctx.restore();
      /* Sprite-drawn pets paint nothing until their sheet lands, and this card
         is painted once — so repaint it when the art arrives. Every sprite pet
         has to be listed: for a long time only Tom was, which is why Jerry and
         the capybara showed an empty card whenever their sheet had not already
         been fetched by the room. */
      const sheetOf = {
        tom:      () => typeof tomSheet === 'function' && tomSheet(),
        jerry:    () => typeof jerrySheet === 'function' && jerrySheet(),
        cat:      () => typeof catSheet === 'function' && catSheet(),
        dog:      () => typeof dogSheet === 'function' && dogSheet(),
        bunny:    () => typeof bunnySheet === 'function' && bunnySheet(),
        panda:    () => typeof pandaSheet === 'function' && pandaSheet(),
        fox:      () => typeof foxSheet === 'function' && foxSheet(),
        hamster:  () => typeof hamsterSheet === 'function' && hamsterSheet(),
        goose:    () => typeof gooseSheet === 'function' && gooseSheet(),
        capybara: () => typeof CAPY_SHEET !== 'undefined' && CAPY_SHEET,
      };
      const art = sheetOf[petType] ? sheetOf[petType]() : null;
      if (art && !art.naturalWidth) {
        art.addEventListener('load', () => drawPetPreview(cvs, petType), { once: true });
      }
    }

    function renderPetShop() {
      const el = document.getElementById('petShop');
      const titleEl = el.previousElementSibling;
      const petCount = roomData.pets.length;
      const layerPetCount = getPetsOnLayer(currentLayer).length;
      if (titleEl) titleEl.innerHTML = '🐾 ' + T('Pets') + ' <span class="slot-badge">' + T('{n} adopted', { n: petCount }) + '</span>';
      el.innerHTML = PETS.map(item => {
        const ownedCount = roomData.pets.filter(p => p.type === item.id).length;
        const typeMaxed = ownedCount >= 2; // Max 2 of each type
        const canAfford = roomData.coins >= item.cost;
        const floorFull = layerPetCount >= MAX_PETS_PER_LAYER;

        // Build per-pet placement info: show which floor each owned pet is on
        const ownedPetsOfType = roomData.pets.filter(p => p.type === item.id);
        let placementInfo = '';
        if (ownedPetsOfType.length > 0) {
          placementInfo = ownedPetsOfType.map(p => {
            if (p.layer && p.layer > 0) return '🏠 ' + T('Floor {n}', { n: p.layer });
            return '📦 ' + T('Unplaced');
          }).join(', ');
        }

        // Check if there's an unplaced pet of this type available
        const hasUnplaced = ownedPetsOfType.some(p => !p.layer || p.layer === 0);

        return '<div class="shop-card' + (ownedCount > 0 ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="pet" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + T(item.name) + '</div>' +
          (ownedCount > 0 ? '<div style="font-size:11px;color:#34d399">' +
            (typeMaxed ? T('Owned: {n} (max)', { n: ownedCount }) : T('Owned: {n}', { n: ownedCount })) + '</div>' : '') +
          (placementInfo ? '<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">' + placementInfo + '</div>' : '') +
          '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>' +
          '<button class="shop-btn buy" onclick="buyItem(\'pet\',\'' + item.id + '\')" ' +
            (canAfford && !typeMaxed ? '' : 'disabled') + '>🐾 ' + T('Adopt') + '</button>' +
          (typeMaxed
            ? '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">' +
              T('Max 2 {name}s adopted', { name: T(item.name) }) + '</div>'
            : '') +
          // Show "Place on Floor X" if there's an unplaced pet and current floor has space
          (hasUnplaced && !floorFull
            ? '<button class="shop-btn" style="margin-top:4px;background:rgba(52,211,153,0.2);color:#34d399;border:1px solid rgba(52,211,153,0.3)" ' +
              ' onclick="placePetInRoom(\'' + item.id + '\')">📥 ' + T('Place on Floor {n}', { n: currentLayer }) + '</button>'
            : '') +
          // Show "Swap" if current floor is full and there's an unplaced pet
          (floorFull && hasUnplaced
            ? '<button class="shop-btn" style="margin-top:4px;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3)" ' +
              ' onclick="swapPet(\''+item.id+'\')">\uD83D\uDD04 ' + T('Swap on Floor {n}', { n: currentLayer }) + '</button>'
            : '') +
          // Show individual "Remove" buttons for each pet of this type on the current floor
          ownedPetsOfType.filter(p => p.layer === currentLayer).map((p, i) => {
            const petLabel = p.name || T(item.name);
            // Show index label only when multiple same-type pets are on this floor
            const label = ownedPetsOfType.filter(q => q.layer === currentLayer).length > 1
              ? '📤 ' + T('Remove {name} #{n}', { name: petLabel, n: i + 1 })
              : '📤 ' + T('Remove from Floor {n}', { n: currentLayer });
            return '<button class="shop-btn" style="margin-top:4px;background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.3)" ' +
              ' onclick="removePetById(\'' + p.id + '\')">' + label + '</button>';
          }).join('') +
          '</div>';
      }).join('');
      el.querySelectorAll('canvas[data-preview="pet"]').forEach(c => _lazyDrawPreview(c, 'pet'));
    }

    function renderShopSection(containerId, items, owned, equippedArr, type, slotHtml) {
      const el = document.getElementById(containerId);
      const titleEl = el.previousElementSibling;
      if (titleEl && slotHtml) {
        titleEl.innerHTML = '🌱 ' + T('Plants') + slotHtml;
      }
      // Plants must be unique per floor — map each plant already on ANOTHER floor → its floor.
      const plantFloor = {};
      if (type === 'plant') {
        getAllLayerPlants().forEach(p => { if (p.layer !== currentLayer) plantFloor[p.plant] = p.layer; });
      }
      el.innerHTML = items.map(item => {
        const isOwned = owned.includes(item.id);
        const isEquipped = equippedArr.includes(item.id);
        const canAfford = roomData.coins >= item.cost;
        let btnHtml = '';
        if (isEquipped) {
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ ' + T('In Room') + '</button>' +
            '<button class="shop-btn" style="margin-top:4px;background:rgba(239,68,68,0.2);color:#f87171" onclick="unequipItem(\'' + type + '\',\'' + item.id + '\')">' + T('Remove') + '</button>';
        } else if (isOwned && plantFloor[item.id]) {
          // Already placed on another floor — can't duplicate it here.
          btnHtml = '<button class="shop-btn" disabled>' + T('On Floor {n}', { n: plantFloor[item.id] }) + '</button>';
        } else if (isOwned) {
          btnHtml = '<button class="shop-btn equip" onclick="equipItem(\'' + type + '\',\'' + item.id + '\')">' + T('Place in Room') + '</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyItem(\'' + type + '\',\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>' + T('Buy') + '</button>';
        }
        return '<div class="shop-card' + (isEquipped ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<span class="shop-emoji">' + item.emoji + '</span>' +
          '<div class="shop-name">' + T(item.name) + '</div>' +
          (item.coinRate ? '<div style="font-size:10px;color:#f7c97e;margin:2px 0">' + coinSVG(10) + ' ' + T('{n}/5min × Lv', { n: item.coinRate }) + '</div>' : '') +
          (isOwned ? '<div style="font-size:11px;color:#34d399">' + T('Owned') + ' ✓</div>' :
            '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>') +
          btnHtml + '</div>';
      }).join('');
    }

    /* ── Shop Preview Drawing ── */
    function drawWallPreview(cvs, wallId) {
      // 64x52 is the CSS size (.shop-preview pins it); fitCanvas gives the buffer
      // the screen's real pixels so these little cards are not soft.
      const w = 64, h = 52;
      fitCanvas(cvs, w, h);
      const ctx = cvs.getContext('2d');
      if (wallId === 'wall_brick') {
        ctx.fillStyle = '#b5745a'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(180,140,110,0.35)'; ctx.lineWidth = 0.8;
        const bh = 8, bw = 16;
        for (let row = 0; row * bh < h; row++) {
          const off = (row % 2) * bw / 2;
          for (let x = -bw + off; x < w + bw; x += bw) ctx.strokeRect(x, row * bh, bw - 1, bh - 1);
        }
      } else if (wallId === 'wall_wood') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#a08060'); g.addColorStop(1, '#7a6040');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(60,40,20,0.12)'; ctx.lineWidth = 0.8;
        for (let x = 0; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      } else if (wallId === 'wall_stripe') {
        ctx.fillStyle = '#e0d8cc'; ctx.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 10) {
          ctx.fillStyle = (x / 10) % 2 === 0 ? 'rgba(180,160,140,0.15)' : 'rgba(200,180,160,0.08)';
          ctx.fillRect(x, 0, 5, h);
        }
      } else if (wallId === 'wall_dots') {
        ctx.fillStyle = '#e8e0d8'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(180,160,140,0.22)';
        for (let y = 5; y < h; y += 10) for (let x = 5 + (Math.floor(y / 10) % 2) * 5; x < w; x += 10) {
          ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
        }
      } else if (wallId === 'wall_diamond') {
        ctx.fillStyle = '#d8d0c4'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(160,140,120,0.18)'; ctx.lineWidth = 0.7;
        const ds = 14;
        for (let y = 0; y < h + ds; y += ds) for (let x = 0; x < w + ds; x += ds) {
          ctx.beginPath(); ctx.moveTo(x, y - ds / 2); ctx.lineTo(x + ds / 2, y); ctx.lineTo(x, y + ds / 2); ctx.lineTo(x - ds / 2, y); ctx.closePath(); ctx.stroke();
        }
      } else if (wallId === 'wall_pastel') {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#ffd1dc'); g.addColorStop(0.5, '#c5e1f5'); g.addColorStop(1, '#d4f0c0');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } else if (wallId === 'wall_mint') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#b8e8d0'); g.addColorStop(1, '#8cc8a8');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(100,160,130,0.08)'; ctx.lineWidth = 0.8;
        for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      } else if (wallId === 'wall_navy') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#2c3e6b'); g.addColorStop(1, '#1a2744');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(60,80,120,0.15)'; ctx.lineWidth = 0.8;
        for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      } else if (wallId === 'wall_sunset') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#ff7b54'); g.addColorStop(0.4, '#ffb26b'); g.addColorStop(0.7, '#ffd56b'); g.addColorStop(1, '#e8ddd0');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } else if (wallId === 'wall_marble') {
        ctx.fillStyle = '#e8e4e0'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(160,140,130,0.12)'; ctx.lineWidth = 0.6;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath(); ctx.moveTo(Math.random()*w, 0); ctx.bezierCurveTo(Math.random()*w, h*0.3, Math.random()*w, h*0.7, Math.random()*w, h); ctx.stroke();
        }
      } else if (wallId === 'wall_lavender') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#c8a8e8'); g.addColorStop(1, '#a888c8');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } else if (wallId === 'wall_forest') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#3a6b4a'); g.addColorStop(1, '#2a4a3a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(80,140,90,0.1)'; ctx.lineWidth = 0.8;
        for (let y = 0; y < h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      } else if (wallId === 'wall_galaxy') {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#0a0a2a'); g.addColorStop(0.5, '#1a1040'); g.addColorStop(1, '#0a0a2a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 20; i++) { ctx.fillRect(Math.random()*w, Math.random()*h, 1, 1); }
      } else if (wallId === 'wall_bamboo') {
        ctx.fillStyle = '#d8cc98'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(140,120,60,0.2)'; ctx.lineWidth = 2;
        for (let x = 6; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(100,90,40,0.15)'; ctx.lineWidth = 0.5;
        for (let x = 6; x < w; x += 12) for (let y = 8; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(x-2, y); ctx.lineTo(x+2, y); ctx.stroke(); }
      } else if (wallId === 'wall_cherry') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#fce4ec'); g.addColorStop(1, '#f8bbd0');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(240,150,180,0.3)'; ctx.font = '8px sans-serif';
        for (let i = 0; i < 6; i++) ctx.fillText('🌸', Math.random()*w, Math.random()*h);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#c8dff0'); g.addColorStop(0.5, '#d6e5ee'); g.addColorStop(1, '#e8ddd0');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(180,170,155,0.08)'; ctx.lineWidth = 0.8;
        for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      }
    }

    // Floor preview reuses the same renderer as the room background.
    function drawFloorPreview(cvs, floorId) {
      // 64x52 is the CSS size (.shop-preview pins it); fitCanvas gives the buffer
      // the screen's real pixels so these little cards are not soft.
      const w = 64, h = 52;
      fitCanvas(cvs, w, h);
      const ctx = cvs.getContext('2d');
      // floorY = -6 so the floor area (floorY + 6) starts at the top of the thumbnail
      drawFloorPattern(ctx, floorId, w, h, -6, h / 7);
    }

    function drawWindowPreview(cvs, winId) {
      // 64x52 is the CSS size (.shop-preview pins it); fitCanvas gives the buffer
      // the screen's real pixels so these little cards are not soft.
      const w = 64, h = 52;
      fitCanvas(cvs, w, h);
      const ctx = cvs.getContext('2d');
      // Background wall
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#c8dff0'); bg.addColorStop(1, '#e8ddd0');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      if (winId === 'win_none') {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', w / 2, h / 2);
        return;
      }
      const cx = w / 2, cy = h / 2;
      if (winId === 'win_round') {
        const r = 16;
        ctx.fillStyle = '#8B7355'; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a08868'; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.fill();
        const sg = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
        sg.addColorStop(0, '#6cb4ee'); sg.addColorStop(1, '#c5e8c5');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
      } else if (winId === 'win_arch') {
        const ww = 24, wh = 34, wx = cx - ww / 2, wy = 6, ar = ww / 2;
        ctx.fillStyle = '#8B7355';
        ctx.beginPath(); ctx.moveTo(wx - 2, wy + wh + 2); ctx.lineTo(wx - 2, wy + ar); ctx.arc(cx, wy + ar, ar + 2, Math.PI, 0); ctx.lineTo(wx + ww + 2, wy + wh + 2); ctx.fill();
        const sg = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        sg.addColorStop(0, '#6cb4ee'); sg.addColorStop(1, '#c5e8c5');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + ar); ctx.arc(cx, wy + ar, ar, Math.PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.fill();
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, wy); ctx.lineTo(cx, wy + wh); ctx.moveTo(wx, wy + wh * 0.55); ctx.lineTo(wx + ww, wy + wh * 0.55); ctx.stroke();
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 4, wy + wh, ww + 8, 3);
      } else if (winId === 'win_double') {
        const ww = 44, wh = 30, wx = cx - ww / 2, wy = 8;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
        const sg = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        sg.addColorStop(0, '#6cb4ee'); sg.addColorStop(1, '#c5e8c5');
        ctx.fillStyle = sg; ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx + ww / 3, wy); ctx.lineTo(wx + ww / 3, wy + wh);
        ctx.moveTo(wx + ww * 2 / 3, wy); ctx.lineTo(wx + ww * 2 / 3, wy + wh);
        ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 4, wy + wh, ww + 8, 3);
      } else if (winId === 'win_skylight') {
        const ww = 36, wh = 18, wx = cx - ww / 2, wy = 3;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(wx - 3, wy - 2, ww + 6, wh + 4);
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 1, wy, ww + 2, wh);
        const sg = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        sg.addColorStop(0, '#87ceeb'); sg.addColorStop(1, '#fff8dc');
        ctx.fillStyle = sg; ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(255,255,200,0.4)'; ctx.beginPath(); ctx.arc(wx + ww*0.7, wy+6, 5, 0, Math.PI*2); ctx.fill();
      } else if (winId === 'win_stained') {
        const ww = 26, wh = 36, wx = cx - ww / 2, wy = 5;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        const colors = ['#ff6b6b','#4ecdc4','#ffe66d','#a855f7','#60a5fa'];
        const segH = wh / colors.length;
        for (let i = 0; i < colors.length; i++) {
          ctx.fillStyle = colors[i]; ctx.globalAlpha = 0.7;
          ctx.fillRect(wx, wy + i * segH, ww, segH);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, wy); ctx.lineTo(cx, wy + wh); ctx.stroke();
        for (let i = 1; i < colors.length; i++) { ctx.beginPath(); ctx.moveTo(wx, wy + i*segH); ctx.lineTo(wx+ww, wy+i*segH); ctx.stroke(); }
      } else if (winId === 'win_porthole') {
        const r = 14;
        ctx.fillStyle = '#6d5a42'; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#8B7355'; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI*2); ctx.fill();
        const sg = ctx.createLinearGradient(cx-r, cy-r, cx+r, cy+r);
        sg.addColorStop(0, '#4a90d9'); sg.addColorStop(1, '#87ceeb');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx-r, cy); ctx.lineTo(cx+r, cy); ctx.moveTo(cx, cy-r); ctx.lineTo(cx, cy+r); ctx.stroke();
      } else if (winId === 'win_large') {
        const ww = 34, wh = 34, wx = cx - ww / 2, wy = 6;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
        const sg = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        sg.addColorStop(0, '#6cb4ee'); sg.addColorStop(1, '#c5e8c5');
        ctx.fillStyle = sg; ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, wy); ctx.lineTo(cx, wy + wh); ctx.moveTo(wx, cy); ctx.lineTo(wx + ww, cy); ctx.stroke();
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 4, wy + wh, ww + 8, 3);
      } else {
        // Classic
        const ww = 26, wh = 30, wx = cx - ww / 2, wy = 8;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
        const sg = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        sg.addColorStop(0, '#6cb4ee'); sg.addColorStop(1, '#c5e8c5');
        ctx.fillStyle = sg; ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = '#6d5a42'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, wy); ctx.lineTo(cx, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
        ctx.fillStyle = '#a08868'; ctx.fillRect(wx - 4, wy + wh, ww + 8, 3);
      }
    }

    function drawDecorPreview(cvs, decorId, category) {
      // 64x52 is the CSS size (.shop-preview pins it); fitCanvas gives the buffer
      // the screen's real pixels so these little cards are not soft.
      const w = 64, h = 52;
      fitCanvas(cvs, w, h);
      const ctx = cvs.getContext('2d');
      const cx = w / 2, cy = h / 2;
      // Background
      if (category === 'wall') {
        const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#c8dff0'); bg.addColorStop(1, '#ddd8cc');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      } else if (category === 'rug') {
        ctx.fillStyle = '#a08868'; ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#a08868'; ctx.fillRect(0, 0, w, h * 0.3);
        const fg = ctx.createLinearGradient(0, h * 0.3, 0, h);
        fg.addColorStop(0, '#b89a6e'); fg.addColorStop(1, '#8B7355');
        ctx.fillStyle = fg; ctx.fillRect(0, h * 0.3, w, h * 0.7);
      }

      // Each decor — mini version
      const art = typeof decorArt === 'function' ? decorArt(decorId) : null;
      if (art) {
        // Furniture and wall hangings are artwork in the room, so the card shows
        // that very picture — a shop that promises one thing and delivers
        // another is a shop nobody trusts twice. Floor pieces stand on the
        // card's floor line; wall pieces hang, so they sit centred.
        if (art.naturalWidth) {
          const maxW = w - 10, maxH = h - 6;
          let iw = maxW, ih = iw * art.naturalHeight / art.naturalWidth;
          if (ih > maxH) { ih = maxH; iw = ih * art.naturalWidth / art.naturalHeight; }
          ctx.drawImage(art, cx - iw / 2, category === 'wall' ? cy - ih / 2 : h - 3 - ih, iw, ih);
        } else {
          // Still downloading — repaint this card once it lands.
          art.addEventListener('load', () => drawDecorPreview(cvs, decorId, category), { once: true });
        }
      } else if (decorId.startsWith('rug_')) {
        const rx = 14, ry = 10;
        let fill = '#9c3c3c';
        if (decorId === 'rug_blue') fill = '#3c64b4';
        else if (decorId === 'rug_green') fill = '#3c9c50';
        else if (decorId === 'rug_pink') fill = '#c8508c';
        else if (decorId === 'rug_star') fill = '#b4963c';
        else if (decorId === 'rug_rainbow') {
          const cols = ['#e04040','#e88a28','#e0d020','#28c828','#2870e0','#8020e0'];
          for (let i = 0; i < cols.length; i++) {
            const s = 1 - i * 0.13;
            ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(cx, cy, rx * s, ry * s, 0, 0, Math.PI * 2); ctx.fill();
          }
          return;
        } else if (decorId === 'rug_cream') fill = 'rgba(240,230,210,0.5)';
        else if (decorId === 'rug_persian') {
          ctx.fillStyle = 'rgba(140,40,40,0.45)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(200,160,60,0.4)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.75, ry * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = 'rgba(200,160,60,0.3)';
          for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx * 0.62, cy + Math.sin(a) * ry * 0.62, 1.5, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = 'rgba(180,60,40,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.2, ry * 0.2, 0, 0, Math.PI * 2); ctx.fill();
          return;
        } else if (decorId === 'rug_zebra') {
          ctx.fillStyle = 'rgba(240,235,225,0.5)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
          ctx.fillStyle = 'rgba(30,30,30,0.35)';
          for (let i = -3; i <= 3; i++) {
            ctx.save(); ctx.translate(cx + i * 4, cy); ctx.rotate(0.15);
            ctx.fillRect(-1.2, -ry, 2.4, ry * 2); ctx.restore();
          }
          ctx.restore();
          return;
        } else if (decorId === 'rug_red') fill = '#b83030';
        else if (decorId === 'rug_purple') fill = '#7040a0';
        else if (decorId === 'rug_ocean') fill = '#2080b0';
        else if (decorId === 'rug_forest') fill = '#2a6a3a';
        else if (decorId === 'rug_gold') fill = '#c8a020';
        else if (decorId === 'rug_galaxy') fill = '#1a1040';
        else if (decorId === 'rug_heart') fill = '#c03060';
        else if (decorId === 'rug_checker') {
          ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
          const sq = 4;
          for (let r = -ry; r < ry; r += sq) { for (let c2 = -rx; c2 < rx; c2 += sq) {
            if ((Math.floor((r + ry) / sq) + Math.floor((c2 + rx) / sq)) % 2 === 0) { ctx.fillStyle = '#3a3a3a'; ctx.fillRect(cx + c2, cy + r, sq, sq); }
          }}
          ctx.restore();
          return;
        }
        ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
        if (decorId === 'rug_star') {
          ctx.fillStyle = 'rgba(200,170,80,0.3)';
          const sr = 6;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) { const a = (i * 4 * Math.PI / 5) - Math.PI / 2; ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * sr, cy + Math.sin(a) * sr * (ry / rx)); }
          ctx.closePath(); ctx.fill();
        }
      } else if (decorId === 'decor_capybara_onsen') {
        // Made of artwork rather than paths — the card has to show the same
        // picture the room draws, or the shop would promise a ♨️ and deliver a pool.
        const art = onsenArt();
        if (art.naturalWidth) {
          const iw = w - 6, ih = iw * art.naturalHeight / art.naturalWidth;
          ctx.drawImage(art, 3, cy - ih / 2, iw, ih);
        } else {
          // Still downloading — repaint this card once it lands.
          art.addEventListener('load', () => drawDecorPreview(cvs, decorId, category), { once: true });
        }
      } else {
        // Generic fallback: draw the emoji
        const item = DECORATIONS.find(d => d.id === decorId);
        if (item) {
          ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(item.emoji, cx, cy + 2);
        }
      }
    }

    // Lazy-draw preview canvases only when visible
    let _previewObserver = null;
    function _lazyDrawPreview(canvas, type) {
      if (!_previewObserver) {
        _previewObserver = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (!e.isIntersecting) return;
            const c = e.target;
            _previewObserver.unobserve(c);
            const pid = c.dataset.pid;
            if (c.dataset.preview === 'wall') drawWallPreview(c, pid);
            else if (c.dataset.preview === 'floor') drawFloorPreview(c, pid);
            else if (c.dataset.preview === 'window') drawWindowPreview(c, pid);
            else if (c.dataset.preview === 'decor') drawDecorPreview(c, pid, c.dataset.cat);
            else if (c.dataset.preview === 'pet') drawPetPreview(c, pid);
          });
        }, { rootMargin: '100px' });
      }
      _previewObserver.observe(canvas);
    }

    function renderDecorShop() {
      const activeDecorTab = document.querySelector('#decorShopWrap .decor-tab.active');
      const cat = activeDecorTab ? activeDecorTab.dataset.dcategory : 'wallpaper';
      _renderDecorCategory(cat);
    }

    function _renderDecorCategory(cat) {
      if (cat === 'wallpaper') {
      // ── Wall Patterns ──
      const wallEl = document.getElementById('wallShop');
      wallEl.innerHTML = WALL_PATTERNS.map(item => {
        const isOwned = roomData.ownedWalls.includes(item.id);
        const isActive = roomData.wallPattern === item.id;
        const canAfford = roomData.coins >= item.cost;
        let btnHtml = '';
        if (isActive) {
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ ' + T('Active') + '</button>';
        } else if (isOwned || item.cost === 0) {
          btnHtml = '<button class="shop-btn equip" onclick="equipWall(\'' + item.id + '\')">' + T('Use') + '</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyWall(\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>' + T('Buy') + '</button>';
        }
        return '<div class="shop-card' + (isActive ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="wall" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + T(item.name) + '</div>' +
          (isOwned || item.cost === 0 ? '<div style="font-size:11px;color:#34d399">' + T('Owned') + ' ✓</div>' :
            '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>') +
          btnHtml + '</div>';
      }).join('');
      wallEl.querySelectorAll('canvas[data-preview="wall"]').forEach(c => _lazyDrawPreview(c, 'wall'));

      } else if (cat === 'floor') {
      // ── Floor Patterns ──
      const floorEl = document.getElementById('floorShop');
      if (!Array.isArray(roomData.ownedFloors)) roomData.ownedFloors = ['floor_wood'];
      floorEl.innerHTML = FLOOR_PATTERNS.map(item => {
        const isOwned = roomData.ownedFloors.includes(item.id);
        const isActive = (roomData.floorStyle || 'floor_wood') === item.id;
        const canAfford = roomData.coins >= item.cost;
        let btnHtml = '';
        if (isActive) {
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ ' + T('Active') + '</button>';
        } else if (isOwned || item.cost === 0) {
          btnHtml = '<button class="shop-btn equip" onclick="equipFloor(\'' + item.id + '\')">' + T('Use') + '</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyFloor(\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>' + T('Buy') + '</button>';
        }
        return '<div class="shop-card' + (isActive ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="floor" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + T(item.name) + '</div>' +
          (isOwned || item.cost === 0 ? '<div style="font-size:11px;color:#34d399">' + T('Owned') + ' ✓</div>' :
            '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>') +
          btnHtml + '</div>';
      }).join('');
      floorEl.querySelectorAll('canvas[data-preview="floor"]').forEach(c => _lazyDrawPreview(c, 'floor'));

      } else if (cat === 'window') {
      // ── Windows ──
      const winEl = document.getElementById('windowShop');
      winEl.innerHTML = WINDOWS.map(item => {
        const isOwned = roomData.ownedWindows.includes(item.id);
        const isActive = roomData.windowStyle === item.id;
        const canAfford = roomData.coins >= item.cost;
        let btnHtml = '';
        if (isActive) {
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ ' + T('Active') + '</button>';
        } else if (isOwned || item.cost === 0) {
          btnHtml = '<button class="shop-btn equip" onclick="equipWindow(\'' + item.id + '\')">' + T('Use') + '</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyWindow(\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>' + T('Buy') + '</button>';
        }
        return '<div class="shop-card' + (isActive ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="window" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + T(item.name) + '</div>' +
          (isOwned || item.cost === 0 ? '<div style="font-size:11px;color:#34d399">' + T('Owned') + ' ✓</div>' :
            '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>') +
          btnHtml + '</div>';
      }).join('');
      winEl.querySelectorAll('canvas[data-preview="window"]').forEach(c => _lazyDrawPreview(c, 'window'));

      } else if (cat === 'wallart') {
      _renderDecorGrid(document.getElementById('wallDecorShop'), 'wall');

      } else if (cat === 'furniture') {
      _renderDecorGrid(document.getElementById('floorDecorShop'), 'floor');

      } else if (cat === 'rug') {
      _renderDecorGrid(document.getElementById('rugDecorShop'), 'rug');
      }
    }

    function _renderDecorGrid(targetEl, filterCat) {
        // Hide unlock-only collection rewards from the shop UNTIL they're earned;
        // once owned they appear here so they can be placed (never shown as buyable).
        const items = DECORATIONS.filter(d => d.category === filterCat && (!d.unlockOnly || roomData.ownedDecors.includes(d.id)));
        targetEl.innerHTML = items.map(item => {
          const isOwned = roomData.ownedDecors.includes(item.id);
          const isPlaced = roomData.placedDecors.some(d => d.id === item.id);
          const canAfford = roomData.coins >= item.cost;
          let btnHtml = '';
          if (isPlaced) {
            btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ ' + T('In Room') + '</button>' +
              '<button class="shop-btn" style="margin-top:4px;background:rgba(239,68,68,0.2);color:#f87171" onclick="removeDecor(\'' + item.id + '\')">' + T('Remove') + '</button>';
          } else if (isOwned) {
            btnHtml = '<button class="shop-btn equip" onclick="placeDecor(\'' + item.id + '\')">' + T('Place') + '</button>';
          } else {
            btnHtml = '<button class="shop-btn buy" onclick="buyDecor(\'' + item.id + '\')" ' +
              (canAfford ? '' : 'disabled') + '>' + T('Buy') + '</button>';
          }
          return '<div class="shop-card' + (isPlaced ? ' equipped' : isOwned ? ' owned' : '') + '">' +
            '<canvas class="shop-preview" data-preview="decor" data-pid="' + item.id + '" data-cat="' + item.category + '"></canvas>' +
            '<div class="shop-name">' + T(item.name) + '</div>' +
            (isOwned ? '<div style="font-size:11px;color:#34d399">' + T('Owned') + ' ✓</div>' :
              '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>') +
            btnHtml + '</div>';
        }).join('');
        targetEl.querySelectorAll('canvas[data-preview="decor"]').forEach(c => _lazyDrawPreview(c, 'decor'));
    }

    function renderUpgrade() {
      // Pet Food sub-tab
      const petEl = document.getElementById('feedPetContent');
      let petHtml = '';
      const activePets = getActivePets();

      if (activePets.length) {
        petHtml += '<div class="shop-section">';
        // ── Auto-Feeder ──
        const _afOwned = roomData.autoFeeder;
        const _afOn = roomData.autoFeedOn;
        petHtml += '<div style="background:rgba(255,210,61,0.08);border:1px solid rgba(255,210,61,0.25);border-radius:12px;padding:10px 12px;margin-bottom:12px">';
        petHtml += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
        petHtml += '<div style="font-size:12px;font-weight:700;color:#ffd23d">🤖 ' + T('Auto-Feeder') + '</div>';
        if (!_afOwned) {
          const _afCan = roomData.coins >= AUTO_FEEDER_COST;
          petHtml += '<button onclick="buyAutoFeeder()" ' + (_afCan ? '' : 'disabled') +
            ' style="font-size:11px;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,210,61,0.4);' +
            'background:' + (_afCan ? 'rgba(255,210,61,0.18)' : 'rgba(255,255,255,0.05)') + ';color:' +
            (_afCan ? '#ffd23d' : 'rgba(255,255,255,0.35)') + ';cursor:' + (_afCan ? 'pointer' : 'not-allowed') + '">' +
            coinSVG(11) + ' ' + AUTO_FEEDER_COST + ' · ' + T('Buy') + '</button>';
        } else {
          petHtml += '<button onclick="toggleAutoFeed()" style="font-size:11px;padding:6px 14px;border-radius:8px;border:1px solid ' +
            (_afOn ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.2)') + ';background:' +
            (_afOn ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)') + ';color:' +
            (_afOn ? '#34d399' : 'rgba(255,255,255,0.5)') + ';cursor:pointer;font-weight:700">' +
            (_afOn ? T('ON') : T('OFF')) + '</button>';
        }
        petHtml += '</div>';
        petHtml += '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:6px">' +
          T('Keeps every pet\'s hunger & thirst topped up automatically — even while you\'re away. Spends your coins.') + '</div>';
        petHtml += '</div>';
        petHtml += '<div style="display:flex;justify-content:center;gap:16px;padding:6px 0 10px;flex-wrap:wrap">';
        activePets.forEach(pet => {
          const petDef = PETS.find(p => p.id === pet.type);
          const hunger = pet.hunger ?? 100;
          const thirst = pet.thirst ?? 100;
          const hColor = hunger > 50 ? '#34d399' : hunger > 20 ? '#fbbf24' : '#f87171';
          const tColor = thirst > 50 ? '#60a5fa' : thirst > 20 ? '#fbbf24' : '#f87171';
          petHtml += '<div style="text-align:center;font-size:11px;color:rgba(255,255,255,0.7)">' +
            (petDef?.emoji || '🐾') + ' ' + petDisplayName(pet) +
            ' <span style="color:' + hColor + '">🍖' + Math.round(hunger) + '%</span>' +
            ' <span style="color:' + tColor + '">💧' + Math.round(thirst) + '%</span></div>';
        });
        petHtml += '</div>';
        petHtml += '<div class="shop-section-title">🍖 ' + T('Drag food to your pet!') + '</div>';
        petHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 0 8px;text-align:center">' +
          T('Drag food to pet, or tap food then tap your pet') + '</div>';
        petHtml += '<div class="food-grid">';
        petHtml += FOODS.map(f => {
          const canAfford = roomData.coins >= f.cost;
          return '<div class="food-card' + (canAfford ? '' : ' disabled') + '" draggable="' + canAfford + '" ondragstart="onFoodDragStart(event,\'' + f.id + '\')" data-food="' + f.id + '">' +
            '<span class="food-emoji">' + f.emoji + '</span>' +
            '<div class="food-name">' + T(f.name) + '</div>' +
            '<div class="food-restore">+' + f.restore + '%</div>' +
            '<div class="shop-price" style="margin-top:4px">' + coinSVG(11) + ' ' + f.cost + '</div>' +
            '</div>';
        }).join('');
        petHtml += '</div>';

        // Drinks section (restores thirst)
        petHtml += '<div class="shop-section-title" style="margin-top:12px">💧 ' + T('Drinks — restore thirst!') + '</div>';
        petHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 0 8px;text-align:center">' +
          T('Tap drink then tap your pet to hydrate') + '</div>';
        petHtml += '<div class="food-grid">';
        petHtml += DRINKS.map(d => {
          const canAfford = roomData.coins >= d.cost;
          return '<div class="food-card' + (canAfford ? '' : ' disabled') + '" data-drink="' + d.id + '">' +
            '<span class="food-emoji">' + d.emoji + '</span>' +
            '<div class="food-name">' + T(d.name) + '</div>' +
            '<div class="food-restore" style="color:#60a5fa">+' + d.restore + '%</div>' +
            '<div class="shop-price" style="margin-top:4px">' + coinSVG(11) + ' ' + d.cost + '</div>' +
            '</div>';
        }).join('');
        petHtml += '</div></div>';
      } else {
        petHtml = '<div class="visit-empty">' + T('Buy a pet first to feed it!') + '</div>';
      }
      petEl.innerHTML = petHtml;

      // Pet Toy sub-tab
      const toyEl = document.getElementById('feedToyContent');
      let toyHtml = '';
      if (activePets.length) {
        toyHtml += '<div class="shop-section">';
        toyHtml += '<div style="display:flex;justify-content:center;gap:16px;padding:6px 0 10px;flex-wrap:wrap">';
        activePets.forEach(pet => {
          const petDef = PETS.find(p => p.id === pet.type);
          const aff = pet.affection ?? 0;
          const ms = getAffectionTitle(aff);
          toyHtml += '<div style="text-align:center;font-size:11px;color:rgba(255,255,255,0.7)">' +
            (petDef?.emoji || '🐾') + ' ' + petDisplayName(pet) +
            ' <span style="color:#ff8aab">♥ ' + aff + '</span>' +
            ' <span style="color:#fbbf24;font-size:10px">' + T(ms.title) + '</span></div>';
        });
        toyHtml += '</div>';
        toyHtml += '<div class="shop-section-title">🧸 ' + T('Tap toy then tap your pet!') + '</div>';
        toyHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 0 8px;text-align:center">' +
          T('Toys increase your pet\'s affection') + '</div>';
        toyHtml += '<div class="food-grid">';
        toyHtml += TOYS.map(t => {
          const canAfford = roomData.coins >= t.cost;
          return '<div class="food-card' + (canAfford ? '' : ' disabled') + '" data-toy="' + t.id + '">' +
            '<span class="food-emoji">' + t.emoji + '</span>' +
            '<div class="food-name">' + T(t.name) + '</div>' +
            '<div class="food-restore" style="color:#ff8aab">♥+' + t.affection + '</div>' +
            '<div class="shop-price" style="margin-top:4px">' + coinSVG(11) + ' ' + t.cost + '</div>' +
            '</div>';
        }).join('');
        toyHtml += '</div></div>';
      } else {
        toyHtml = '<div class="visit-empty">' + T('Buy a pet first to play with it!') + '</div>';
      }
      toyEl.innerHTML = toyHtml;

      // Plant Upgrade sub-tab
      const plantEl = document.getElementById('feedPlantContent');
      let plantHtml = '';

      if (roomData.plant) {
        const plantDef = PLANTS.find(p => p.id === roomData.plant);
        const lvl = roomData.plantLevels[roomData.plant] || 1;
        const nextDef = PLANT_LEVELS[lvl];
        const scaledCost = getPlantUpgradeCost(roomData.plant, lvl);
        const coinsPerCycle = lvl * (plantDef ? plantDef.coinRate : 1);
        const income = getTotalPlantIncome();
        plantHtml += '<div class="shop-section"><div class="shop-section-title">🌱 ' +
          T('{name} — Lv.{lvl} (Floor {floor})', { name: T(plantDef?.name || 'Your plant'), lvl: lvl, floor: currentLayer }) + '</div>';
        plantHtml += '<div style="text-align:center;font-size:11px;color:#98e4b0;padding:4px 0 4px">' +
          '🌿 ' + T('This tree produces {coins} / 5 min', { coins: coinSVG(12) + ' ' + coinsPerCycle }) + '</div>';
        // Every tree on every floor earns — show the combined room total.
        plantHtml += '<div style="text-align:center;font-size:11px;padding:0 0 8px;color:#fbbf24">' +
          (income
            ? '💰 ' + I18N.plural(income.count,
                '1 tree across your floors earns {coins} / 5 min total',
                '{n} trees across your floors earn {coins} / 5 min total',
                { coins: coinSVG(12) + ' ' + income.perCycle })
            : '') + '</div>';
        if (nextDef && scaledCost !== null) {
          const nextCoins = nextDef.level * (plantDef ? plantDef.coinRate : 1);
          plantHtml += '<div class="shop-card" style="text-align:center">' +
            '<span class="shop-emoji">' + (plantDef?.emoji || '🌱') + '</span>' +
            '<div class="shop-name">' + T('Upgrade to Lv.{n} ({label})', { n: nextDef.level, label: T(nextDef.label) }) + '</div>' +
            '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:4px">' + T('Earns {n} coins / 5 min', { n: nextCoins }) + '</div>' +
            '<div class="shop-price">' + coinSVG(14) + ' ' + scaledCost + '</div>' +
            '<button class="shop-btn upgrade" onclick="upgradePlant()" ' +
            (roomData.coins >= scaledCost ? '' : 'disabled') + '>' + T('Upgrade') + '</button></div>';
        } else {
          plantHtml += '<div style="text-align:center;color:#98e4b0;padding:20px">★ ' + T('Max Level!') + ' ★</div>';
        }
        plantHtml += '</div>';
      } else {
        plantHtml = '<div class="visit-empty">' + T('Buy a plant first to upgrade it!') + '</div>';
      }
      plantEl.innerHTML = plantHtml;

      // ── 🏠 Floors / Layers sub-tab ──
      const layerEl = document.getElementById('feedLayerContent');
      if (!layerEl) return;
      const UNLOCK_COST = { 2: 10000, 3: 20000 };
      const unlockedLayers = roomData.unlockedLayers || 1;
      let layerHtml = '<div class="shop-section">';
      layerHtml += '<div class="shop-section-title">🏠 ' + T('Floors & Layers') + '</div>';
      layerHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 12px 12px;text-align:center">' +
        T('Unlock new floors for your home! Each floor has its own wall, window, and decor layout.') + '</div>';
      // Render cards for floors 1–3
      for (let i = 1; i <= 3; i++) {
        const unlocked  = i <= unlockedLayers;
        const isCurrent = i === currentLayer;
        const cost      = UNLOCK_COST[i];
        const label     = i === 1 ? '🏡 ' + T('Base Floor') : i === 2 ? '🏢 ' + T('2nd Floor') : '🌟 ' + T('Top Floor');
        const defWall   = WALL_PATTERNS.find(w => w.id === getLayerDefaultWall(i));
        layerHtml += '<div class="shop-card" style="text-align:center;' +
          (unlocked ? 'border-color:rgba(247,201,126,0.35)' : '') + '">';
        layerHtml += '<span class="shop-emoji">' + (i === 1 ? '🏡' : i === 2 ? '🏢' : '🌟') + '</span>';
        layerHtml += '<div class="shop-name">' + label + '</div>';
        if (i === 1) {
          // Base floor is always free and unlocked
          layerHtml += '<div style="font-size:11px;color:#34d399;margin-bottom:6px">✓ ' + T('Free — always unlocked') + '</div>';
          if (isCurrent) {
            layerHtml += '<button class="shop-btn equipped-btn" disabled>✓ ' + T('Here now') + '</button>';
          } else {
            layerHtml += '<button class="shop-btn equip" onclick="enterLayer(1)">' + T('Go to Floor {n}', { n: 1 }) + '</button>';
          }
        } else if (unlocked) {
          layerHtml += '<div style="font-size:11px;color:#34d399;margin-bottom:6px">' +
            '✓ ' + T('Unlocked') + (isCurrent ? ' <span style="color:#f7c97e">' + T('(Current)') + '</span>' : '') + '</div>';
          if (isCurrent) {
            layerHtml += '<button class="shop-btn equipped-btn" disabled>✓ ' + T('Here now') + '</button>';
          } else {
            layerHtml += '<button class="shop-btn equip" onclick="enterLayer(' + i + ')">' + T('Go to Floor {n}', { n: i }) + '</button>';
          }
        } else {
          // Locked — show unlock requirements
          const prevOk = (i - 1) <= unlockedLayers;
          layerHtml += '<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:4px">' +
            T('Unlocks with {wall}', { wall: defWall ? T(defWall.name) : '' }) + '</div>';
          layerHtml += '<div class="shop-price">' + coinSVG(14) + ' ' + cost + '</div>';
          if (prevOk) {
            layerHtml += '<button class="shop-btn buy" onclick="unlockLayer(' + i + ')" ' +
              (roomData.coins >= cost ? '' : 'disabled') + '>🔓 ' + T('Unlock Floor {n}', { n: i }) + '</button>';
          } else {
            layerHtml += '<button class="shop-btn" disabled>' + T('Unlock Floor {n} first', { n: i - 1 }) + '</button>';
          }
        }
        layerHtml += '</div>';
      }
      // Outside view shortcut
      layerHtml += '<div style="text-align:center;margin-top:4px;padding:0 12px 8px">';
      layerHtml += '<button class="shop-btn equip" style="width:100%" onclick="goOutside()">🌳 ' + T('Outside View') + '</button>';
      layerHtml += '</div>';
      layerHtml += '</div>';
      layerEl.innerHTML = layerHtml;
    }

    let unsubVisitList = null;
    function renderVisitList() {
      if (unsubVisitList) return; // Listener already active, snapshot handles DOM updates
      const el = document.getElementById('visitList');
      unsubVisitList = db.collection('rooms').orderBy('updatedAt', 'desc').limit(20).onSnapshot((snap) => {
        const rooms = [];
        const now = Date.now();
        const ONLINE_THRESHOLD = 60 * 1000; // 60 seconds
        snap.forEach(doc => {
          if (doc.id === currentUid) return; // skip self
          const d = doc.data();
          const isOnline = d.lastSeen && (now - d.lastSeen) < ONLINE_THRESHOLD;
          rooms.push({ uid: doc.id, isOnline, ...d });
        });
        // Sort: online users first
        rooms.sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0));
        const onlineCount = rooms.filter(r => r.isOnline).length;
        document.getElementById('onlineCountNum').textContent = onlineCount;
        if (!rooms.length) {
          el.innerHTML = '<div class="visit-empty">' + T('No other rooms yet. Invite friends!') + '</div>';
          return;
        }
        el.innerHTML = rooms.map(r => {
          // Support both old (active boolean) and new (layer number) pet formats
          const petEmojis = (r.pets || []).filter(p => (p.layer != null && p.layer > 0) || p.active).map(p => PETS.find(x => x.id === p.type)?.emoji || '🐾');
          // Fallback for old format
          if (!petEmojis.length) {
            if (r.pet) petEmojis.push(PETS.find(p => p.id === r.pet)?.emoji || '🐾');
            if (r.pet2) petEmojis.push(PETS.find(p => p.id === r.pet2)?.emoji || '');
          }
          const plantEmoji = r.plant ? (PLANTS.find(p => p.id === r.plant)?.emoji || '🌱') : '';
          const peekItems = [...petEmojis, plantEmoji].filter(Boolean);
          const dot = r.isOnline ? '<span class="visit-online-dot"></span>' : '<span class="visit-offline-dot"></span>';
          return '<div class="visit-card" onclick="visitRoom(\'' + r.uid + '\')">' +
            '<span class="visit-avatar">🏠</span>' +
            '<div class="visit-info">' +
            '<div class="visit-name">' + dot + escapeHtml(r.displayName || T('Anonymous')) + '</div>' +
            '<span class="visit-peek">' + (peekItems.length ? peekItems.join(' ') : '<span style="font-size:12px;opacity:0.4">' + T('Empty room') + '</span>') + '</span>' +
            '</div>' +
            '<button class="food-btn" style="font-size:10px;padding:6px 10px;margin-right:6px" onclick="event.stopPropagation();showGiftModal(\'' + r.uid + '\',\'' + escapeHtml(r.displayName || T('Anonymous')).replace(/'/g, "\\'") + '\')">🎁</button>' +
            '<span class="visit-arrow">›</span></div>';
        }).join('');
      }, () => {
        el.innerHTML = '<div class="visit-empty">' + T('Failed to load rooms') + '</div>';
      });
    }

    /* ── Repaint the visit list when the language changes ──
       Every other panel redraws through renderAll(), but this one bails out
       while its snapshot listener is alive — so the 'Anonymous' fallback and
       the empty / error states would keep the language that drew them until
       Firestore happened to push again. Drop the listener and re-subscribe. */
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('langchange', function () {
      try {
        if (!unsubVisitList) return;
        unsubVisitList();
        unsubVisitList = null;
        renderVisitList();
      } catch (e) {}
    });

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

