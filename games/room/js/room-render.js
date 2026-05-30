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

      // Coin display
      document.getElementById('coinAmount').textContent = roomData.coins;

      // Title
      const name = roomData.displayName || 'Anonymous';
      document.getElementById('pageTitle').textContent = isOwner ? 'My Room' : name + "'s Room";
      document.getElementById('ownerName').textContent = isOwner ? ('Welcome, ' + name) : '';

      // Tabs visibility
      document.getElementById('tabsBar').style.display = isOwner ? 'flex' : 'none';
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
          petSlot.innerHTML = '<canvas id="petCanvas"></canvas>';
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
            '<div class="plant-canvas-wrap"><canvas id="plantCanvas" width="120" height="140"></canvas></div>' +
            '<div class="plant-level">Lv.' + plantLvl + ' ' + lvl.label + '</div>';
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
        '<span style="display:block;font-size:10px;color:rgba(255,255,255,0.45);margin-top:4px">🌱 Only 1 plant at a time — buy a pricier plant to inherit upgrade progress!</span>');
      // Only render decor shop if its sub-panel is visible (avoids 99 canvas preview draws)
      const decorPanel = document.getElementById('decorShopWrap');
      if (decorPanel && decorPanel.classList.contains('active')) renderDecorShop();
    }

    function drawPetPreview(cvs, petType) {
      const w = cvs.width = 64, h = cvs.height = 52;
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
      drawPetCanvas(ctx, petType, size, 0, false, 100, 0, null, 0);
      ctx.restore();
    }

    function renderPetShop() {
      const el = document.getElementById('petShop');
      const titleEl = el.previousElementSibling;
      const petCount = roomData.pets.length;
      const layerPetCount = getPetsOnLayer(currentLayer).length;
      if (titleEl) titleEl.innerHTML = '🐾 Pets <span class="slot-badge">' + petCount + ' adopted</span>';
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
            if (p.layer && p.layer > 0) return '🏠 Floor ' + p.layer;
            return '📦 Unplaced';
          }).join(', ');
        }

        // Check if there's an unplaced pet of this type available
        const hasUnplaced = ownedPetsOfType.some(p => !p.layer || p.layer === 0);

        return '<div class="shop-card' + (ownedCount > 0 ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="pet" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + item.name + '</div>' +
          (ownedCount > 0 ? '<div style="font-size:11px;color:#34d399">Owned: ' + ownedCount + (typeMaxed ? ' (max)' : '') + '</div>' : '') +
          (placementInfo ? '<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">' + placementInfo + '</div>' : '') +
          '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>' +
          '<button class="shop-btn buy" onclick="buyItem(\'pet\',\'' + item.id + '\')" ' +
            (canAfford && !typeMaxed ? '' : 'disabled') + '>🐾 Adopt</button>' +
          (typeMaxed
            ? '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">Max 2 ' + item.name + 's adopted</div>'
            : '') +
          // Show "Place on Floor X" if there's an unplaced pet and current floor has space
          (hasUnplaced && !floorFull
            ? '<button class="shop-btn" style="margin-top:4px;background:rgba(52,211,153,0.2);color:#34d399;border:1px solid rgba(52,211,153,0.3)" ' +
              ' onclick="placePetInRoom(\'' + item.id + '\')">📥 Place on Floor ' + currentLayer + '</button>'
            : '') +
          // Show "Swap" if current floor is full and there's an unplaced pet
          (floorFull && hasUnplaced
            ? '<button class="shop-btn" style="margin-top:4px;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3)" ' +
              ' onclick="swapPet(\''+item.id+'\')">\uD83D\uDD04 Swap on Floor ' + currentLayer + '</button>'
            : '') +
          // Show individual "Remove" buttons for each pet of this type on the current floor
          ownedPetsOfType.filter(p => p.layer === currentLayer).map((p, i) => {
            const petLabel = p.name || item.name;
            // Show index label only when multiple same-type pets are on this floor
            const label = ownedPetsOfType.filter(q => q.layer === currentLayer).length > 1
              ? '📤 Remove ' + petLabel + ' #' + (i + 1)
              : '📤 Remove from Floor ' + currentLayer;
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
        titleEl.innerHTML = '🌱 Plants' + slotHtml;
      }
      el.innerHTML = items.map(item => {
        const isOwned = owned.includes(item.id);
        const isEquipped = equippedArr.includes(item.id);
        const canAfford = roomData.coins >= item.cost;
        let btnHtml = '';
        if (isEquipped) {
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ In Room</button>' +
            '<button class="shop-btn" style="margin-top:4px;background:rgba(239,68,68,0.2);color:#f87171" onclick="unequipItem(\'' + type + '\',\'' + item.id + '\')">Remove</button>';
        } else if (isOwned) {
          btnHtml = '<button class="shop-btn equip" onclick="equipItem(\'' + type + '\',\'' + item.id + '\')">Place in Room</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyItem(\'' + type + '\',\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>Buy</button>';
        }
        return '<div class="shop-card' + (isEquipped ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<span class="shop-emoji">' + item.emoji + '</span>' +
          '<div class="shop-name">' + item.name + '</div>' +
          (item.coinRate ? '<div style="font-size:10px;color:#f7c97e;margin:2px 0">' + coinSVG(10) + ' ' + item.coinRate + '/5min × Lv</div>' : '') +
          (isOwned ? '<div style="font-size:11px;color:#34d399">Owned ✓</div>' :
            '<div class="shop-price">' + coinSVG(14) + ' ' + item.cost + '</div>') +
          btnHtml + '</div>';
      }).join('');
    }

    /* ── Shop Preview Drawing ── */
    function drawWallPreview(cvs, wallId) {
      const w = cvs.width = 64, h = cvs.height = 52;
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
      const w = cvs.width = 64, h = cvs.height = 52;
      const ctx = cvs.getContext('2d');
      // floorY = -6 so the floor area (floorY + 6) starts at the top of the thumbnail
      drawFloorPattern(ctx, floorId, w, h, -6, h / 7);
    }

    function drawWindowPreview(cvs, winId) {
      const w = cvs.width = 64, h = cvs.height = 52;
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
      const w = cvs.width = 64, h = cvs.height = 52;
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
      if (decorId === 'clock') {
        const cr = 14;
        ctx.fillStyle = '#f5efe6'; ctx.strokeStyle = '#8B7355'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6d5a42';
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI * 2 / 12) - Math.PI / 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * cr * 0.72, cy + Math.sin(a) * cr * 0.72, 1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - cr * 0.45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + cr * 0.55, cy); ctx.stroke();
      } else if (decorId === 'shelf') {
        const sw = 36, sh = 4, sx = cx - sw / 2, sy = cy + 4;
        ctx.fillStyle = '#7a6550'; ctx.fillRect(sx + sw * 0.15, sy + sh, 2, 8); ctx.fillRect(sx + sw * 0.75, sy + sh, 2, 8);
        ctx.fillStyle = '#a08868'; ctx.fillRect(sx, sy, sw, sh);
        const cols = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
        let bx = sx + 2;
        cols.forEach((c, i) => { const bw = 5 + (i % 3); ctx.fillStyle = c; ctx.fillRect(bx, sy - 10 - (i % 2) * 3, bw, 10 + (i % 2) * 3); bx += bw + 1; });
      } else if (decorId === 'hangplant') {
        ctx.strokeStyle = '#c8b898'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx - 6, cy - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx + 6, cy - 4); ctx.stroke();
        ctx.fillStyle = '#c97b4b';
        ctx.beginPath(); ctx.moveTo(cx - 7, cy - 4); ctx.lineTo(cx - 5, cy + 4); ctx.lineTo(cx + 5, cy + 4); ctx.lineTo(cx + 7, cy - 4); ctx.fill();
        ctx.strokeStyle = '#5a9a4a'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 2, cy + 2); ctx.quadraticCurveTo(cx - 12, cy + 8, cx - 10, cy + 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 2, cy + 2); ctx.quadraticCurveTo(cx + 10, cy + 6, cx + 12, cy + 14); ctx.stroke();
      } else if (decorId === 'stringlights') {
        ctx.strokeStyle = 'rgba(120,100,80,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 4; x < w - 4; x += 2) ctx.lineTo(x, cy - 4 + Math.sin(x * 0.15) * 3);
        ctx.stroke();
        const colors = ['#ffdd57', '#ff6b6b', '#48dbfb', '#ff9ff3', '#55efc4'];
        for (let i = 0; i < 8; i++) {
          const bx = 6 + i * 7; ctx.fillStyle = colors[i % colors.length]; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.arc(bx, cy - 3 + Math.sin(bx * 0.15) * 3, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (decorId === 'banner') {
        const bw = 14, bh = 30, bx = cx - bw / 2, by = 6;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(bx - 1, by, bw + 2, 2);
        const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
        bg.addColorStop(0, '#e85d75'); bg.addColorStop(1, '#c44060');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.moveTo(bx, by + 2); ctx.lineTo(bx, by + bh); ctx.lineTo(cx, by + bh - 6); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + 2); ctx.fill();
      } else if (decorId === 'photo') {
        const pw = 28, ph = 22, px = cx - pw / 2, py = cy - ph / 2;
        ctx.fillStyle = '#8B6F47'; ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
        ctx.fillStyle = '#87CEEB'; ctx.fillRect(px, py, pw, ph * 0.55);
        ctx.fillStyle = '#7bc96f'; ctx.fillRect(px, py + ph * 0.55, pw, ph * 0.45);
        ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(px + pw * 0.7, py + 5, 3, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'mirror') {
        const mw = 20, mh = 30;
        ctx.fillStyle = '#B8860B'; roundRectPath(ctx, cx - mw / 2 - 2, cy - mh / 2 - 2, mw + 4, mh + 4, 4); ctx.fill();
        const mg = ctx.createLinearGradient(cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2);
        mg.addColorStop(0, '#e8f4fd'); mg.addColorStop(1, '#aed6f1');
        ctx.fillStyle = mg; roundRectPath(ctx, cx - mw / 2, cy - mh / 2, mw, mh, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 5, cy - 8); ctx.lineTo(cx - 2, cy - 4); ctx.stroke();
      } else if (decorId === 'antlers') {
        ctx.strokeStyle = '#8B6F47'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.quadraticCurveTo(cx - 12, cy - 4, cx - 16, cy - 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 10, cy - 4); ctx.lineTo(cx - 16, cy - 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.quadraticCurveTo(cx + 12, cy - 4, cx + 16, cy - 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 4); ctx.lineTo(cx + 16, cy - 14); ctx.stroke();
        ctx.fillStyle = '#6B4226'; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'neon') {
        ctx.shadowColor = '#ff6ec7'; ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(255,110,199,0.8)';
        ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HELLO', cx, cy);
        ctx.shadowBlur = 0;
      } else if (decorId === 'poster') {
        const pw = 22, ph = 30, px = cx - pw / 2, py = cy - ph / 2;
        ctx.fillStyle = '#1a1a2e'; ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = '#e94560'; ctx.beginPath(); ctx.arc(px + 8, py + 10, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f3460'; ctx.fillRect(px + 12, py + 6, 6, 12);
        ctx.fillStyle = '#f9a825'; ctx.beginPath(); ctx.moveTo(px + 14, py + 22); ctx.lineTo(px + 6, py + 16); ctx.lineTo(px + 18, py + 18); ctx.fill();
      } else if (decorId === 'dartboard') {
        const r = 16;
        const rings = [[r, '#1a1a1a'], [r * 0.85, '#c0392b'], [r * 0.65, '#f1f1f1'], [r * 0.45, '#1a1a1a'], [r * 0.25, '#c0392b'], [r * 0.1, '#27ae60']];
        rings.forEach(([rr, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill(); });
      } else if (decorId === 'wreath') {
        const wr = 14;
        ctx.fillStyle = '#c44'; ctx.beginPath(); ctx.moveTo(cx - 3, cy - wr - 2); ctx.lineTo(cx, cy - wr - 6); ctx.lineTo(cx + 3, cy - wr - 2); ctx.fill();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.fillStyle = i % 3 === 0 ? '#2d8a4e' : '#3da65a';
          ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * wr, cy + Math.sin(a) * wr, 4, 2.5, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#c0392b';
        [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(a => { ctx.beginPath(); ctx.arc(cx + Math.cos(a) * wr, cy + Math.sin(a) * wr, 2, 0, Math.PI * 2); ctx.fill(); });
      } else if (decorId === 'tapestry') {
        const tw = 22, th = 30, tx = cx - tw / 2, ty = cy - th / 2;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(tx - 2, ty - 2, tw + 4, 3);
        ctx.fillStyle = '#6d5a42'; ctx.beginPath(); ctx.arc(tx - 2, ty - 0.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(tx + tw + 2, ty - 0.5, 2, 0, Math.PI * 2); ctx.fill();
        const tg = ctx.createLinearGradient(tx, ty, tx, ty + th);
        tg.addColorStop(0, '#8B2252'); tg.addColorStop(0.5, '#a0304a'); tg.addColorStop(1, '#6B1838');
        ctx.fillStyle = tg; ctx.fillRect(tx, ty + 1, tw, th);
        ctx.strokeStyle = '#d4a040'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, ty + 6); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx, ty + th - 4); ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = '#e8c86a'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx, ty + 10); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, ty + th - 8); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#d4a040'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d4a040'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) { const fx = tx + 2 + i * (tw - 4) / 4; ctx.beginPath(); ctx.moveTo(fx, ty + th + 1); ctx.lineTo(fx, ty + th + 5); ctx.stroke(); }
      } else if (decorId === 'sconce') {
        ctx.fillStyle = '#B8860B'; roundRectPath(ctx, cx - 5, cy - 12, 10, 10, 2); ctx.fill();
        ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.quadraticCurveTo(cx + 8, cy - 2, cx + 6, cy + 4); ctx.stroke();
        ctx.fillStyle = '#DAA520';
        ctx.beginPath(); ctx.moveTo(cx + 2, cy + 4); ctx.lineTo(cx + 3, cy + 8); ctx.lineTo(cx + 9, cy + 8); ctx.lineTo(cx + 10, cy + 4); ctx.fill();
        ctx.fillStyle = '#f5f0e0'; ctx.fillRect(cx + 4, cy - 2, 4, 6);
        ctx.fillStyle = '#ffaa33';
        ctx.beginPath(); ctx.moveTo(cx + 6, cy - 8); ctx.quadraticCurveTo(cx + 9, cy - 4, cx + 6, cy - 2); ctx.quadraticCurveTo(cx + 3, cy - 4, cx + 6, cy - 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,80,0.15)'; ctx.beginPath(); ctx.arc(cx + 6, cy - 4, 12, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'map') {
        const mw = 32, mh = 22, mx = cx - mw / 2, my = cy - mh / 2;
        ctx.fillStyle = '#6B4226'; ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
        const pg = ctx.createLinearGradient(mx, my, mx, my + mh);
        pg.addColorStop(0, '#f5e6c8'); pg.addColorStop(1, '#e8d4a8');
        ctx.fillStyle = pg; ctx.fillRect(mx, my, mw, mh);
        ctx.fillStyle = 'rgba(100,160,200,0.25)'; ctx.fillRect(mx, my, mw, mh);
        ctx.fillStyle = '#c8b078';
        ctx.beginPath(); ctx.ellipse(mx + 8, my + 7, 4, 3, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(mx + 10, my + 14, 2.5, 3, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(mx + 18, my + 8, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(mx + 18, my + 14, 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(mx + 25, my + 8, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a08040'; ctx.font = '6px serif'; ctx.textAlign = 'center'; ctx.fillText('N', mx + 26, my + 17);
      } else if (decorId === 'cuckoo') {
        // Cuckoo clock miniature
        ctx.fillStyle = '#6B4226'; ctx.fillRect(cx - 8, cy - 6, 16, 22);
        ctx.fillStyle = '#5a3518';
        ctx.beginPath(); ctx.moveTo(cx - 10, cy - 6); ctx.lineTo(cx, cy - 16); ctx.lineTo(cx + 10, cy - 6); ctx.fill();
        ctx.fillStyle = '#f5efe6'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 2, cy - 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy + 1); ctx.stroke();
        ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(cx, cy + 18, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#8B7355'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx, cy + 16); ctx.lineTo(cx, cy + 18); ctx.stroke();
      } else if (decorId === 'macrame') {
        // Macramé miniature
        ctx.fillStyle = '#a08060'; ctx.fillRect(cx - 12, cy - 14, 24, 2);
        ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
          const sx = cx - 10 + i * 5;
          ctx.beginPath(); ctx.moveTo(sx, cy - 12);
          for (let y = 0; y < 20; y += 4) { ctx.lineTo(sx + Math.sin(y * 0.3 + i) * 2, cy - 12 + y); }
          ctx.stroke();
        }
        ctx.strokeStyle = '#d4c8b0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - 8, cy - 4); ctx.lineTo(cx + 8, cy - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 8, cy + 4); ctx.lineTo(cx + 8, cy + 4); ctx.stroke();
        ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 7; i++) { const fx = cx - 8 + i * 2.5; ctx.beginPath(); ctx.moveTo(fx, cy + 8); ctx.lineTo(fx, cy + 14); ctx.stroke(); }
      } else if (decorId === 'thermometer') {
        // Thermometer miniature
        ctx.fillStyle = '#f0e8d8'; roundRectPath(ctx, cx - 4, cy - 14, 8, 28, 3); ctx.fill();
        ctx.strokeStyle = '#b0a080'; ctx.lineWidth = 0.8; roundRectPath(ctx, cx - 4, cy - 14, 8, 28, 3); ctx.stroke();
        ctx.fillStyle = '#ddd'; ctx.fillRect(cx - 1, cy - 8, 2, 16);
        ctx.fillStyle = '#e03030'; ctx.fillRect(cx - 1, cy + 2, 2, 6);
        ctx.fillStyle = '#e03030'; ctx.beginPath(); ctx.arc(cx, cy + 10, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.4;
        for (let i = 0; i < 5; i++) { const yy = cy - 8 + i * 4; ctx.beginPath(); ctx.moveTo(cx + 2, yy); ctx.lineTo(cx + 5, yy); ctx.stroke(); }
      } else if (decorId === 'plate') {
        // Decorative plate miniature
        ctx.fillStyle = '#f8f4ee'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#2060a0';
        for (let i = 0; i < 6; i++) { const a = (Math.PI * 2 / 6) * i; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 1.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#c0382a'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'floorlamp') {
        const base = h - 6;
        ctx.fillStyle = '#555'; ctx.beginPath(); ctx.ellipse(cx, base, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, 12); ctx.stroke();
        ctx.fillStyle = '#f5e6c8';
        ctx.beginPath(); ctx.moveTo(cx - 10, 14); ctx.lineTo(cx - 7, 6); ctx.lineTo(cx + 7, 6); ctx.lineTo(cx + 10, 14); ctx.fill();
      } else if (decorId === 'sidetable') {
        const tw = 28, th = 18, tx = cx - tw / 2, ty = h - 8 - th;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(tx + 2, ty + 4, 2, th - 2); ctx.fillRect(tx + tw - 4, ty + 4, 2, th - 2);
        ctx.fillStyle = '#b89a6e'; ctx.fillRect(tx, ty, tw, 4);
        ctx.fillStyle = '#7faac8'; ctx.beginPath(); ctx.moveTo(tx + tw * 0.35, ty); ctx.lineTo(tx + tw * 0.3, ty - 8); ctx.quadraticCurveTo(tx + tw * 0.5, ty - 12, tx + tw * 0.7, ty - 8); ctx.lineTo(tx + tw * 0.65, ty); ctx.fill();
      } else if (decorId === 'cushion') {
        const cw = 20, ch = 10;
        ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.beginPath(); ctx.ellipse(cx, cy + 3, cw, ch, 0, 0, Math.PI * 2); ctx.fill();
        const cg = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, cw);
        cg.addColorStop(0, '#e8a0c0'); cg.addColorStop(1, '#d080a0');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'toybox') {
        const bw = 24, bh = 18, bx = cx - bw / 2, by = cy - bh / 2 + 4;
        ctx.fillStyle = '#d4a06a'; roundRectPath(ctx, bx, by, bw, bh, 2); ctx.fill();
        ctx.fillStyle = '#c49058'; ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        ctx.fillStyle = '#f7c97e'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', cx, by + bh / 2 + 3);
        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(bx + 6, by - 2, 4, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'bookcase') {
        const bw = 28, bh = 36, bx = cx - bw / 2, by = h - 8 - bh;
        ctx.fillStyle = '#7a6550'; roundRectPath(ctx, bx, by, bw, bh, 1); ctx.fill();
        ctx.fillStyle = '#a08868'; ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        const sh = (bh - 6) / 3;
        const cols = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
        for (let i = 0; i < 3; i++) {
          const sy = by + 3 + i * sh;
          ctx.fillStyle = '#8a7355'; ctx.fillRect(bx + 2, sy + sh - 2, bw - 4, 2);
          let bkx = bx + 4;
          for (let j = 0; j < 3; j++) { const bkw = 5 + j; ctx.fillStyle = cols[(i * 3 + j) % 5]; ctx.fillRect(bkx, sy + sh - 2 - (sh * 0.6), bkw, sh * 0.6); bkx += bkw + 1; }
        }
      } else if (decorId === 'aquarium') {
        const aw = 36, ah = 24, ax = cx - aw / 2, ay = cy - ah / 2;
        ctx.fillStyle = '#555'; ctx.fillRect(ax + 4, ay + ah, 2, 6); ctx.fillRect(ax + aw - 6, ay + ah, 2, 6);
        ctx.fillStyle = 'rgba(100,180,220,0.3)'; roundRectPath(ctx, ax, ay, aw, ah, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(150,200,230,0.5)'; ctx.lineWidth = 1; roundRectPath(ctx, ax, ay, aw, ah, 2); ctx.stroke();
        ctx.fillStyle = '#ff6b35'; ctx.beginPath(); ctx.ellipse(cx - 5, cy, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 12, cy - 2); ctx.lineTo(cx - 12, cy + 2); ctx.fill();
        ctx.fillStyle = '#48dbfb'; ctx.beginPath(); ctx.ellipse(cx + 6, cy + 3, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'guitar') {
        ctx.fillStyle = '#6B4226'; ctx.fillRect(cx - 1.5, 6, 3, 22);
        ctx.fillStyle = '#4a3020'; roundRectPath(ctx, cx - 3, 2, 6, 8, 1); ctx.fill();
        ctx.fillStyle = '#D4A06A';
        ctx.beginPath(); ctx.ellipse(cx, 34, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx, 27, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(cx, 33, 3, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'globe') {
        const gr = 12, gcy = cy - 4;
        ctx.fillStyle = '#8B7355'; ctx.fillRect(cx - 1, gcy + gr, 2, 10);
        ctx.beginPath(); ctx.ellipse(cx, cy + gr + 6, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, gcy, gr + 2, 0, Math.PI * 2); ctx.stroke();
        const gg = ctx.createRadialGradient(cx - 3, gcy - 3, 0, cx, gcy, gr);
        gg.addColorStop(0, '#5bb5e0'); gg.addColorStop(1, '#2174a8');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, gcy, gr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a9a4a';
        ctx.beginPath(); ctx.ellipse(cx + 3, gcy - 3, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx - 4, gcy + 3, 4, 2.5, -0.2, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'trashcan') {
        const tw = 14, th = 20, base = h - 8;
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.moveTo(cx - tw / 2, base); ctx.lineTo(cx - tw / 2 + 1, base - th); ctx.lineTo(cx + tw / 2 - 1, base - th); ctx.lineTo(cx + tw / 2, base); ctx.fill();
        ctx.fillStyle = '#999'; roundRectPath(ctx, cx - tw / 2 - 1, base - th - 2, tw + 2, 3, 1); ctx.fill();
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, base - th - 4, 3, Math.PI, 0); ctx.stroke();
      } else if (decorId === 'fan') {
        const base = h - 6;
        ctx.fillStyle = '#666'; ctx.beginPath(); ctx.ellipse(cx, base, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, 16); ctx.stroke();
        ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(cx, 12, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, 12, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(100,100,100,0.5)';
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 4, 12 + Math.sin(a) * 4, 6, 2, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(cx, 12, 2, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'beanpillow') {
        ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
        const bg = ctx.createRadialGradient(cx - 3, cy - 4, 0, cx, cy, 18);
        bg.addColorStop(0, '#7c5cbf'); bg.addColorStop(1, '#5a3d8a');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(cx, cy, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.ellipse(cx - 4, cy - 6, 8, 4, -0.3, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'tv') {
        const tw = 34, th = 20, tx = cx - tw / 2, base = h - 8;
        ctx.fillStyle = '#444'; ctx.fillRect(cx - 8, base - 4, 16, 4);
        ctx.fillRect(cx - 2, base - th + 6, 4, th - 10);
        ctx.fillStyle = '#111'; roundRectPath(ctx, tx, base - th - 6, tw, th - 2, 2); ctx.fill();
        const sg = ctx.createLinearGradient(tx + 2, 0, tx + tw - 2, 0);
        sg.addColorStop(0, '#2c3e6b'); sg.addColorStop(0.5, '#3d6b8a'); sg.addColorStop(1, '#2c3e6b');
        ctx.fillStyle = sg; roundRectPath(ctx, tx + 2, base - th - 4, tw - 4, th - 6, 1); ctx.fill();
      } else if (decorId === 'piano') {
        // Detailed Upright Piano preview
        const pw = 32, ph = 38, px = cx - pw / 2, base = h - 4;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.06)'; roundRectPath(ctx, px + 2, base - ph + 2, pw, ph - 2, 2); ctx.fill();
        // Main body
        const bodyGrad = ctx.createLinearGradient(px, 0, px + pw, 0);
        bodyGrad.addColorStop(0, '#1a1a1a'); bodyGrad.addColorStop(0.3, '#282828'); bodyGrad.addColorStop(0.7, '#222'); bodyGrad.addColorStop(1, '#111');
        ctx.fillStyle = bodyGrad; roundRectPath(ctx, px, base - ph, pw, ph - 4, 3); ctx.fill();
        // Top panel with lid detail
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(px + 1, base - ph + 1, pw - 2, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(px + 2, base - ph + 1, pw - 4, 2);
        // Music stand area
        ctx.fillStyle = '#333'; roundRectPath(ctx, px + 4, base - ph + 8, pw - 8, 8, 1); ctx.fill();
        // Sheet music page
        ctx.fillStyle = '#f5f0e0'; ctx.fillRect(px + 6, base - ph + 9, pw - 12, 6);
        // Staff lines on sheet music
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.3;
        for (let i = 0; i < 5; i++) {
          const ly = base - ph + 10 + i * 1;
          ctx.beginPath(); ctx.moveTo(px + 7, ly); ctx.lineTo(px + pw - 7, ly); ctx.stroke();
        }
        // Tiny notes on the sheet
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        [0, 3, 5, 8, 11, 14].forEach(ox => {
          ctx.beginPath(); ctx.ellipse(px + 8 + ox, base - ph + 11 + (ox % 3), 1, 0.6, -0.3, 0, Math.PI * 2); ctx.fill();
        });
        // Panel middle section (dark wood feel)
        ctx.fillStyle = '#1e1e1e'; ctx.fillRect(px + 2, base - ph + 17, pw - 4, ph - 30);
        // Subtle wood grain lines
        ctx.strokeStyle = 'rgba(255,255,255,0.015)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 3; i++) {
          const gx = px + 6 + i * 8;
          ctx.beginPath(); ctx.moveTo(gx, base - ph + 18); ctx.lineTo(gx, base - 12); ctx.stroke();
        }
        // Key area frame
        ctx.fillStyle = '#2a2a2a'; roundRectPath(ctx, px + 2, base - 14, pw - 4, 10, 1); ctx.fill();
        // White keys
        ctx.fillStyle = '#f5f0e0'; ctx.fillRect(px + 3, base - 13, pw - 6, 8);
        // White key divisions
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.4;
        const wkw = (pw - 6) / 14;
        for (let i = 1; i < 14; i++) {
          const kx = px + 3 + i * wkw;
          ctx.beginPath(); ctx.moveTo(kx, base - 13); ctx.lineTo(kx, base - 5); ctx.stroke();
        }
        // Black keys with proper pattern (2-3-2-3)
        ctx.fillStyle = '#111';
        const blackKeyPattern = [1, 2, 4, 5, 6, 8, 9, 11, 12, 13];
        blackKeyPattern.forEach(i => {
          if (i < 14) {
            const bkGrad = ctx.createLinearGradient(0, base - 13, 0, base - 8);
            bkGrad.addColorStop(0, '#111'); bkGrad.addColorStop(1, '#222');
            ctx.fillStyle = bkGrad;
            ctx.fillRect(px + 3 + i * wkw - wkw * 0.32, base - 13, wkw * 0.64, 5);
          }
        });
        // Key reflection
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 3, base - 13, pw - 6, 1);
        // Legs
        ctx.fillStyle = '#0e0e0e';
        ctx.fillRect(px + 2, base - 4, 4, 4); ctx.fillRect(px + pw - 6, base - 4, 4, 4);
        // Pedals (3 brass pedals)
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(cx - 6, base - 2, 2.5, 2); ctx.fillRect(cx - 1.5, base - 2, 2.5, 2); ctx.fillRect(cx + 3, base - 2, 2.5, 2);
        // Pedal rods
        ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 0.4;
        [-4.5, 0, 4.5].forEach(ox => {
          ctx.beginPath(); ctx.moveTo(cx + ox, base - 4); ctx.lineTo(cx + ox, base - 2); ctx.stroke();
        });
        // Top highlight edge
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px + 1, base - ph, pw - 2, 1);
      } else if (decorId === 'telescope') {
        const base = h - 6;
        ctx.strokeStyle = '#8B7355'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx - 12, base); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 10, base); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 2, base); ctx.stroke();
        ctx.fillStyle = '#B8860B';
        ctx.save(); ctx.translate(cx, cy - 4); ctx.rotate(-0.5);
        roundRectPath(ctx, -3, -18, 6, 20, 2); ctx.fill();
        ctx.fillStyle = '#5bb5e0'; ctx.beginPath(); ctx.ellipse(0, -18, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(-2, 2, 4, 4);
        ctx.restore();
      } else if (decorId === 'cactus') {
        const base = h - 6;
        ctx.fillStyle = '#c97b4b';
        ctx.beginPath(); ctx.moveTo(cx - 8, base - 12); ctx.lineTo(cx - 6, base); ctx.lineTo(cx + 6, base); ctx.lineTo(cx + 8, base - 12); ctx.fill();
        ctx.fillStyle = '#b56a3a'; ctx.fillRect(cx - 9, base - 14, 18, 3);
        ctx.fillStyle = '#3d8a4a'; roundRectPath(ctx, cx - 5, base - 28, 10, 16, 4); ctx.fill();
        ctx.fillStyle = '#4a9a58';
        ctx.beginPath(); ctx.moveTo(cx - 5, base - 20); ctx.lineTo(cx - 10, base - 22); ctx.lineTo(cx - 10, base - 28);
        ctx.lineTo(cx - 7, base - 28); ctx.lineTo(cx - 7, base - 22); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 5, base - 22); ctx.lineTo(cx + 8, base - 24); ctx.lineTo(cx + 8, base - 30);
        ctx.lineTo(cx + 5, base - 30); ctx.fill();
        ctx.strokeStyle = '#aad4a0'; ctx.lineWidth = 0.5;
        [[-3, -24], [2, -22], [-1, -18], [3, -26]].forEach(([ox, oy]) => {
          ctx.beginPath(); ctx.moveTo(cx + ox, base + oy); ctx.lineTo(cx + ox + (ox > 0 ? 2 : -2), base + oy - 2); ctx.stroke();
        });
        ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.arc(cx, base - 29, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffaa33'; ctx.beginPath(); ctx.arc(cx, base - 29, 1.2, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'candles') {
        const base = h - 6;
        ctx.fillStyle = '#c8b898'; ctx.beginPath(); ctx.ellipse(cx, base, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
        [{ ox: -8, ch: 14 }, { ox: 0, ch: 18 }, { ox: 8, ch: 12 }].forEach(c => {
          ctx.fillStyle = '#f5ede0'; ctx.fillRect(cx + c.ox - 2, base - c.ch, 4, c.ch - 2);
          ctx.fillStyle = '#ffaa33';
          ctx.beginPath(); ctx.moveTo(cx + c.ox, base - c.ch - 5); ctx.quadraticCurveTo(cx + c.ox + 3, base - c.ch - 1, cx + c.ox, base - c.ch + 1); ctx.quadraticCurveTo(cx + c.ox - 3, base - c.ch - 1, cx + c.ox, base - c.ch - 5); ctx.fill();
        });
      } else if (decorId === 'skateboard') {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.moveTo(cx - 18, cy); ctx.quadraticCurveTo(cx - 22, cy - 4, cx - 20, cy - 6);
        ctx.lineTo(cx + 18, cy - 2); ctx.quadraticCurveTo(cx + 22, cy - 6, cx + 20, cy - 8);
        ctx.lineTo(cx + 18, cy - 2); ctx.lineTo(cx - 18, cy); ctx.fill();
        ctx.fillStyle = '#e8c840'; ctx.fillRect(cx - 6, cy - 3, 12, 2);
        ctx.fillStyle = '#555';
        [-10, -6, 6, 10].forEach(ox => { ctx.beginPath(); ctx.arc(cx + ox, cy + 2, 2, 0, Math.PI * 2); ctx.fill(); });
      } else if (decorId === 'vinylplayer') {
        const vw = 30, vh = 12, vx = cx - vw / 2, vy = cy - 2;
        ctx.fillStyle = '#3a2a18'; roundRectPath(ctx, vx, vy, vw, vh, 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx - 3, vy + vh / 2, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(60,60,60,0.4)'; ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.arc(cx - 3, vy + vh / 2, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e04040'; ctx.beginPath(); ctx.arc(cx - 3, vy + vh / 2, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + 10, vy + 2); ctx.lineTo(cx + 3, vy + vh / 2 + 1); ctx.stroke();
      } else if (decorId === 'umbrella') {
        const base = h - 6;
        ctx.fillStyle = '#8B7355';
        ctx.beginPath(); ctx.moveTo(cx - 6, base - 10); ctx.lineTo(cx - 5, base); ctx.lineTo(cx + 5, base); ctx.lineTo(cx + 6, base - 10); ctx.fill();
        ctx.fillStyle = '#7a6548'; ctx.fillRect(cx - 7, base - 12, 14, 3);
        ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 2, base - 12); ctx.lineTo(cx - 2, base - 30); ctx.quadraticCurveTo(cx - 2, base - 34, cx + 3, base - 34); ctx.stroke();
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx + 3, base - 12); ctx.lineTo(cx + 3, base - 28); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + 3, base - 28 - 2, 2, 0, Math.PI); ctx.stroke();
      } else if (decorId === 'terrarium') {
        const base = h - 6;
        ctx.strokeStyle = 'rgba(180,200,220,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, base - 14, 12, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(200,220,240,0.12)'; ctx.beginPath(); ctx.arc(cx, base - 14, 12, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#8B7355'; ctx.fillRect(cx - 12, base - 4, 24, 5);
        ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.ellipse(cx, base - 8, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3d8a4a'; ctx.beginPath(); ctx.ellipse(cx - 4, base - 15, 3, 6, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a9a58'; ctx.beginPath(); ctx.ellipse(cx + 3, base - 14, 2.5, 5, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e04040'; ctx.beginPath(); ctx.arc(cx - 1, base - 11, 1.5, Math.PI, 0); ctx.fill();
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
      } else if (decorId === 'speaker') {
        // Wall Speaker preview
        ctx.fillStyle = '#222';
        roundRectPath(ctx, cx - 14, cy - 18, 28, 36, 3);
        ctx.fill();
        ctx.fillStyle = '#2a2a2a';
        roundRectPath(ctx, cx - 12, cy - 16, 24, 32, 2);
        ctx.fill();
        // Grille dots
        ctx.fillStyle = 'rgba(80,80,80,0.6)';
        for (let r = 0; r < 5; r++) {
          for (let c2 = 0; c2 < 4; c2++) {
            ctx.beginPath(); ctx.arc(cx - 7 + c2 * 5, cy - 10 + r * 5, 1, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Main woofer
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy + 4, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(100,100,100,0.4)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(cx, cy + 4, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(cx, cy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
        // Tweeter
        ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(cx, cy - 10, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(cx, cy - 10, 2, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'mask') {
        // Theater Masks preview
        // Comedy mask (left)
        ctx.save();
        ctx.translate(cx - 10, cy + 2);
        ctx.rotate(-0.12);
        ctx.fillStyle = '#f5e6c8';
        ctx.beginPath();
        ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-10, 0, -6, 8);
        ctx.quadraticCurveTo(0, 12, 6, 8); ctx.quadraticCurveTo(10, 0, 8, -10);
        ctx.quadraticCurveTo(0, -12, -8, -10);
        ctx.fill();
        ctx.strokeStyle = '#c8a870'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-10, 0, -6, 8);
        ctx.quadraticCurveTo(0, 12, 6, 8); ctx.quadraticCurveTo(10, 0, 8, -10);
        ctx.quadraticCurveTo(0, -12, -8, -10);
        ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(-3, -3, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3, -3, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 2, 4, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.restore();
        // Tragedy mask (right)
        ctx.save();
        ctx.translate(cx + 10, cy + 2);
        ctx.rotate(0.12);
        ctx.fillStyle = '#e8d8c0';
        ctx.beginPath();
        ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-10, 0, -6, 8);
        ctx.quadraticCurveTo(0, 12, 6, 8); ctx.quadraticCurveTo(10, 0, 8, -10);
        ctx.quadraticCurveTo(0, -12, -8, -10);
        ctx.fill();
        ctx.strokeStyle = '#b89860'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-10, 0, -6, 8);
        ctx.quadraticCurveTo(0, 12, 6, 8); ctx.quadraticCurveTo(10, 0, 8, -10);
        ctx.quadraticCurveTo(0, -12, -8, -10);
        ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(-3, -3, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3, -3, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 8, 4, Math.PI + 0.2, -0.2); ctx.stroke();
        ctx.restore();
        // Ribbon
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - 10); ctx.quadraticCurveTo(cx, cy - 16, cx + 6, cy - 10); ctx.stroke();
      } else if (decorId === 'katana') {
        // Crossed Swords preview
        // Shield mount
        ctx.fillStyle = '#6B4226';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8); ctx.quadraticCurveTo(cx + 8, cy - 6, cx + 8, cy + 2);
        ctx.quadraticCurveTo(cx + 6, cy + 10, cx, cy + 12);
        ctx.quadraticCurveTo(cx - 6, cy + 10, cx - 8, cy + 2);
        ctx.quadraticCurveTo(cx - 8, cy - 6, cx, cy - 8);
        ctx.fill();
        ctx.fillStyle = '#8B6F47';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 5); ctx.quadraticCurveTo(cx + 6, cy - 4, cx + 6, cy + 2);
        ctx.quadraticCurveTo(cx + 4, cy + 8, cx, cy + 10);
        ctx.quadraticCurveTo(cx - 4, cy + 8, cx - 6, cy + 2);
        ctx.quadraticCurveTo(cx - 6, cy - 4, cx, cy - 5);
        ctx.fill();
        // Sword 1
        ctx.save(); ctx.translate(cx, cy + 1); ctx.rotate(0.6);
        ctx.fillStyle = '#d0d0d0';
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-1, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.ellipse(0, -1, 3, 1.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a1810'; ctx.fillRect(-1.5, 0, 3, 10);
        ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(0, 10, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Sword 2
        ctx.save(); ctx.translate(cx, cy + 1); ctx.rotate(-0.6);
        ctx.fillStyle = '#c8c8c8';
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-1, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.ellipse(0, -1, 3, 1.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a1810'; ctx.fillRect(-1.5, 0, 3, 10);
        ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(0, 10, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (decorId === 'butterfly') {
        // Butterfly Frame preview
        ctx.fillStyle = '#6B4226'; ctx.fillRect(cx - 16, cy - 13, 32, 26);
        ctx.fillStyle = '#f8f4ee'; ctx.fillRect(cx - 14, cy - 11, 28, 22);
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 0.5, cy - 5, 1, 8);
        ctx.fillStyle = '#ff8a00';
        ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.quadraticCurveTo(cx - 10, cy - 10, cx - 8, cy);
        ctx.quadraticCurveTo(cx - 5, cy + 3, cx, cy + 1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.quadraticCurveTo(cx + 10, cy - 10, cx + 8, cy);
        ctx.quadraticCurveTo(cx + 5, cy + 3, cx, cy + 1); ctx.fill();
        ctx.fillStyle = '#e07000';
        ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.quadraticCurveTo(cx - 7, cy + 2, cx - 5, cy + 6);
        ctx.quadraticCurveTo(cx - 3, cy + 7, cx, cy + 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.quadraticCurveTo(cx + 7, cy + 2, cx + 5, cy + 6);
        ctx.quadraticCurveTo(cx + 3, cy + 7, cx, cy + 3); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx - 5, cy - 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 5, cy - 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.quadraticCurveTo(cx - 3, cy - 10, cx - 4, cy - 9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.quadraticCurveTo(cx + 3, cy - 10, cx + 4, cy - 9); ctx.stroke();
      } else if (decorId === 'medal') {
        // Medal Display preview
        ctx.fillStyle = '#2a2040'; roundRectPath(ctx, cx - 14, cy - 14, 28, 28, 2); ctx.fill();
        ctx.strokeStyle = '#8B6F47'; ctx.lineWidth = 1.5; roundRectPath(ctx, cx - 14, cy - 14, 28, 28, 2); ctx.stroke();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.moveTo(cx - 4, cy - 10); ctx.lineTo(cx - 6, cy - 2); ctx.lineTo(cx + 6, cy - 2); ctx.lineTo(cx + 4, cy - 10); ctx.fill();
        ctx.fillStyle = '#e8c840'; ctx.fillRect(cx - 0.8, cy - 9, 1.6, 6);
        ctx.fillStyle = '#DAA520'; ctx.beginPath(); ctx.arc(cx, cy + 5, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy + 5, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; const aI = a + Math.PI / 5;
          ctx.lineTo(cx + Math.cos(a) * 3, cy + 5 + Math.sin(a) * 3);
          ctx.lineTo(cx + Math.cos(aI) * 1.2, cy + 5 + Math.sin(aI) * 1.2);
        } ctx.closePath(); ctx.fill();
      } else if (decorId === 'lantern') {
        // Paper Lantern preview
        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, 10); ctx.stroke();
        const lr = 12;
        const lg = ctx.createRadialGradient(cx, cy, 3, cx, cy, lr);
        lg.addColorStop(0, '#ff4040'); lg.addColorStop(1, '#cc1010');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.ellipse(cx, cy, lr * 0.75, lr, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.4;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(cx, cy + i * 4, lr * 0.75 * (1 - Math.abs(i) * 0.15), 0.8, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#c8a040';
        ctx.fillRect(cx - 3, cy - lr - 1, 6, 2);
        ctx.fillRect(cx - 2.5, cy + lr - 1, 5, 2);
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, cy + lr + 1); ctx.lineTo(cx, cy + lr + 5); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy + lr + 6, 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'dreamcatcher') {
        // Dreamcatcher preview
        const dr = 12;
        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx, cy - dr); ctx.stroke();
        ctx.strokeStyle = '#8B6F47'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy - 4, dr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(200,190,170,0.5)'; ctx.lineWidth = 0.4;
        for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.arc(cx, cy - 4, dr * r / 4, 0, Math.PI * 2); ctx.stroke(); }
        for (let i = 0; i < 6; i++) { const a = (Math.PI * 2 / 6) * i;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 3, cy - 4 + Math.sin(a) * 3);
          ctx.lineTo(cx + Math.cos(a) * dr * 0.9, cy - 4 + Math.sin(a) * dr * 0.9); ctx.stroke();
        }
        ctx.fillStyle = '#5bb5e0'; ctx.beginPath(); ctx.arc(cx, cy - 4, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c8b898'; ctx.lineWidth = 0.6;
        [-4, 0, 4].forEach((ox, i) => {
          ctx.beginPath(); ctx.moveTo(cx + ox, cy - 4 + dr); ctx.lineTo(cx + ox, cy + dr + 4 + i * 2); ctx.stroke();
          ctx.fillStyle = i === 1 ? '#5bb5e0' : '#c8b898';
          ctx.beginPath(); ctx.moveTo(cx + ox, cy + dr + 4 + i * 2); ctx.quadraticCurveTo(cx + ox - 2, cy + dr + 8 + i * 2, cx + ox, cy + dr + 10 + i * 2);
          ctx.quadraticCurveTo(cx + ox + 2, cy + dr + 8 + i * 2, cx + ox, cy + dr + 4 + i * 2); ctx.fill();
        });
      } else if (decorId === 'diploma') {
        // Diploma preview
        const pw = 30, ph = 22;
        ctx.fillStyle = '#8B6F47'; ctx.fillRect(cx - pw / 2 - 2, cy - ph / 2 - 2, pw + 4, ph + 4);
        ctx.fillStyle = '#B8960B'; ctx.fillRect(cx - pw / 2 - 1, cy - ph / 2 - 1, pw + 2, ph + 2);
        ctx.fillStyle = '#f5efe6'; ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
        ctx.fillStyle = '#333'; ctx.font = '6px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('DIPLOMA', cx, cy - 5);
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.4;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 8, cy + i * 4); ctx.lineTo(cx + 8, cy + i * 4); ctx.stroke(); }
        ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(cx + 8, cy + 6, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'coffeemaker') {
        // Coffee Maker preview
        const base = h - 6;
        ctx.fillStyle = '#333'; roundRectPath(ctx, cx - 12, base - 4, 24, 4, 1); ctx.fill();
        ctx.fillStyle = '#444'; roundRectPath(ctx, cx - 10, base - 28, 20, 24, 2); ctx.fill();
        ctx.fillStyle = 'rgba(100,180,220,0.2)'; ctx.fillRect(cx - 7, base - 24, 14, 8);
        ctx.fillStyle = '#555'; ctx.fillRect(cx - 6, base - 14, 12, 2);
        ctx.fillStyle = 'rgba(100,60,20,0.3)';
        ctx.beginPath(); ctx.moveTo(cx - 5, base - 4); ctx.lineTo(cx - 4, base - 12); ctx.lineTo(cx + 4, base - 12); ctx.lineTo(cx + 5, base - 4); ctx.fill();
        ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(cx + 7, base - 6, 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'gaming') {
        // Game Console preview
        const base = h - 6;
        ctx.fillStyle = '#1a1a2e'; roundRectPath(ctx, cx - 14, base - 10, 28, 8, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(cx - 5, base - 7); ctx.lineTo(cx + 5, base - 7); ctx.stroke();
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(cx + 8, base - 6, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c2c3e'; roundRectPath(ctx, cx - 12, base - 2, 18, 8, 3); ctx.fill();
        ctx.fillStyle = '#444'; ctx.fillRect(cx - 9, base, 4, 2); ctx.fillRect(cx - 8, base - 1, 2, 4);
        ctx.fillStyle = '#e04040'; ctx.beginPath(); ctx.arc(cx + 3, base, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4090e0'; ctx.beginPath(); ctx.arc(cx + 5, base + 2, 1.2, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'camera') {
        // Camera Tripod preview
        const base = h - 6;
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.lineTo(cx - 10, base); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.lineTo(cx + 8, base); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.lineTo(cx + 1, base); ctx.stroke();
        ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(cx, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222'; roundRectPath(ctx, cx - 10, cy - 14, 20, 12, 2); ctx.fill();
        ctx.fillStyle = '#5bb5e0'; ctx.beginPath(); ctx.arc(cx, cy - 8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; roundRectPath(ctx, cx - 3, cy - 16, 6, 2, 1); ctx.fill();
      } else if (decorId === 'fountain') {
        // Mini Fountain preview
        const base = h - 6;
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.moveTo(cx - 16, base - 6); ctx.quadraticCurveTo(cx - 18, base, cx, base + 1);
        ctx.quadraticCurveTo(cx + 18, base, cx + 16, base - 6); ctx.fill();
        ctx.fillStyle = 'rgba(64,164,223,0.3)'; ctx.beginPath(); ctx.ellipse(cx, base - 4, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#999'; ctx.fillRect(cx - 2, base - 20, 4, 14);
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.moveTo(cx - 8, base - 18); ctx.quadraticCurveTo(cx - 10, base - 12, cx, base - 11);
        ctx.quadraticCurveTo(cx + 10, base - 12, cx + 8, base - 18); ctx.fill();
        ctx.fillStyle = 'rgba(64,164,223,0.4)';
        ctx.beginPath(); ctx.moveTo(cx - 1, base - 20); ctx.quadraticCurveTo(cx, base - 28, cx + 1, base - 20); ctx.fill();
      } else if (decorId === 'chessset') {
        // Chess Set preview
        const base = h - 6;
        ctx.fillStyle = '#8B6F47'; roundRectPath(ctx, cx - 18, base - 5, 36, 4, 1); ctx.fill();
        ctx.fillStyle = '#d4b87a'; ctx.fillRect(cx - 16, base - 4, 32, 3);
        const sq = 4;
        for (let r = 0; r < 1; r++) { for (let c2 = 0; c2 < 8; c2++) {
          if ((r + c2) % 2 === 0) { ctx.fillStyle = '#5a4220'; ctx.fillRect(cx - 16 + c2 * sq, base - 4 + r * 3, sq, 3); }
        }}
        ctx.fillStyle = '#f5f0e0'; ctx.fillRect(cx - 6, base - 14, 3, 8);
        ctx.beginPath(); ctx.arc(cx - 4.5, base - 16, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f5f0e0'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx - 4.5, base - 19); ctx.lineTo(cx - 4.5, base - 21); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 6, base - 20); ctx.lineTo(cx - 3, base - 20); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.fillRect(cx + 3, base - 14, 3, 8);
        ctx.beginPath(); ctx.arc(cx + 4.5, base - 16, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 2, base - 18); ctx.lineTo(cx + 3, base - 21);
        ctx.lineTo(cx + 4.5, base - 18); ctx.lineTo(cx + 6, base - 21); ctx.lineTo(cx + 7, base - 18); ctx.fill();
      } else if (decorId === 'bonsai') {
        // Bonsai Tree preview
        const base = h - 6;
        ctx.fillStyle = '#6d5040';
        ctx.beginPath(); ctx.moveTo(cx - 9, base - 8); ctx.lineTo(cx - 7, base);
        ctx.lineTo(cx + 7, base); ctx.lineTo(cx + 9, base - 8); ctx.fill();
        ctx.fillStyle = '#7a5a48'; ctx.fillRect(cx - 10, base - 10, 20, 2);
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, base - 10);
        ctx.quadraticCurveTo(cx - 4, base - 20, cx + 2, base - 28); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 1, base - 18); ctx.quadraticCurveTo(cx - 10, base - 20, cx - 12, base - 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 1, base - 25); ctx.quadraticCurveTo(cx + 8, base - 23, cx + 10, base - 26); ctx.stroke();
        ctx.fillStyle = '#2d7a3a';
        ctx.beginPath(); ctx.arc(cx + 2, base - 32, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 4, base - 29, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a9a4a';
        ctx.beginPath(); ctx.arc(cx + 6, base - 30, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 12, base - 25, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 10, base - 27, 4, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'speaker2') {
        // Bluetooth Speaker preview
        const base = h - 6;
        ctx.fillStyle = '#2a2a3e';
        roundRectPath(ctx, cx - 10, base - 16, 20, 16, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,100,120,0.4)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 5; i++) { const gy = base - 14 + i * 2.5;
          ctx.beginPath(); ctx.moveTo(cx - 6, gy); ctx.lineTo(cx + 6, gy); ctx.stroke();
        }
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(cx, base - 4, 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'shoe_rack') {
        // Shoe Rack preview
        const base = h - 6;
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(cx - 16, base - 28, 2, 28);
        ctx.fillRect(cx + 14, base - 28, 2, 28);
        ctx.fillStyle = '#a08868';
        ctx.fillRect(cx - 16, base - 14, 32, 2);
        ctx.fillRect(cx - 16, base - 2, 32, 2);
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.moveTo(cx - 10, base - 16); ctx.lineTo(cx - 12, base - 22); ctx.quadraticCurveTo(cx - 4, base - 24, cx - 2, base - 18); ctx.lineTo(cx - 2, base - 16); ctx.fill();
        ctx.fillStyle = '#3498db';
        ctx.beginPath(); ctx.moveTo(cx + 2, base - 16); ctx.lineTo(cx, base - 22); ctx.quadraticCurveTo(cx + 8, base - 24, cx + 10, base - 18); ctx.lineTo(cx + 10, base - 16); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(cx - 8, base - 4); ctx.lineTo(cx - 10, base - 10); ctx.quadraticCurveTo(cx - 2, base - 12, cx, base - 6); ctx.lineTo(cx, base - 4); ctx.fill();
        ctx.fillStyle = '#e8a0c0'; ctx.beginPath(); ctx.ellipse(cx + 7, base - 5, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      } else if (decorId === 'rocket') {
        // Model Rocket preview
        const base = h - 6;
        ctx.fillStyle = '#666'; ctx.fillRect(cx - 6, base - 4, 12, 4);
        ctx.fillRect(cx - 1.5, base - 8, 3, 4);
        ctx.fillStyle = '#f0f0f0'; roundRectPath(ctx, cx - 5, base - 34, 10, 26, 4); ctx.fill();
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.moveTo(cx, base - 40); ctx.quadraticCurveTo(cx - 6, base - 32, cx - 5, base - 30);
        ctx.lineTo(cx + 5, base - 30); ctx.quadraticCurveTo(cx + 6, base - 32, cx, base - 40); ctx.fill();
        ctx.fillStyle = '#5bb5e0'; ctx.beginPath(); ctx.arc(cx, base - 24, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(cx, base - 24, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e04040'; ctx.fillRect(cx - 5, base - 16, 10, 2);
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.moveTo(cx - 5, base - 8); ctx.lineTo(cx - 9, base - 5); ctx.lineTo(cx - 5, base - 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 5, base - 8); ctx.lineTo(cx + 9, base - 5); ctx.lineTo(cx + 5, base - 12); ctx.fill();
      } else if (decorId === 'minifridge') {
        // Mini Fridge preview
        const base = h - 6;
        ctx.fillStyle = '#ddd'; roundRectPath(ctx, cx - 12, base - 36, 24, 36, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx - 10, base - 24); ctx.lineTo(cx + 10, base - 24); ctx.stroke();
        ctx.fillStyle = '#bbb'; ctx.fillRect(cx + 6, base - 32, 2, 6); ctx.fillRect(cx + 6, base - 20, 2, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx - 10, base - 35, 20, 2);
        ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.arc(cx, base - 30, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(cx - 4, base - 16, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#55efc4'; roundRectPath(ctx, cx + 2, base - 12, 6, 5, 1); ctx.fill();
      } else if (decorId === 'calendar') {
        // Wall Calendar preview
        const cw2 = 38, ch2 = 44;
        const cl = cx - cw2 / 2, ct = cy - ch2 / 2 + 2;
        // Nail
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(cx, ct - 3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#999'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx, ct - 2); ctx.lineTo(cx, ct + 1); ctx.stroke();
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; roundRectPath(ctx, cl + 1, ct + 2, cw2, ch2, 2); ctx.fill();
        // Paper body
        ctx.fillStyle = '#faf8f3'; roundRectPath(ctx, cl, ct, cw2, ch2, 2); ctx.fill();
        ctx.strokeStyle = '#c8c0b0'; ctx.lineWidth = 0.6; roundRectPath(ctx, cl, ct, cw2, ch2, 2); ctx.stroke();
        // Red header
        const hH = ch2 * 0.18;
        ctx.fillStyle = '#c0392b'; roundRectPath(ctx, cl, ct, cw2, hH + 1, 2); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(cl, ct + hH - 1, cw2, 2);
        // Month text
        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        ctx.fillStyle = '#fff'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(months[new Date().getMonth()], cx, ct + hH * 0.5);
        // Spiral rings
        const spY = ct + hH + 2;
        for (let i = 0; i < 5; i++) {
          const sx = cl + 4 + i * (cw2 - 8) / 4;
          ctx.strokeStyle = '#aaa'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(sx, spY, 2, 0, Math.PI * 2); ctx.stroke();
        }
        // Day grid
        const gTop = spY + 5, gH = ct + ch2 - 3 - gTop;
        const cellW2 = (cw2 - 6) / 7, cellH2 = gH / 7;
        // Day-of-week headers
        ctx.font = '3px sans-serif'; ctx.fillStyle = '#999';
        ['S','M','T','W','T','F','S'].forEach((d, i) => {
          ctx.fillText(d, cl + 3 + i * cellW2 + cellW2 / 2, gTop + cellH2 * 0.4);
        });
        // Day numbers
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        ctx.font = '3px sans-serif';
        for (let d = 1; d <= daysInMonth && d <= 31; d++) {
          const cellIdx = firstDay + d - 1;
          const col = cellIdx % 7, row = Math.floor(cellIdx / 7) + 1;
          if (row >= 7) break;
          ctx.fillStyle = d === now.getDate() ? '#c0392b' : '#555';
          if (d === now.getDate()) {
            ctx.fillStyle = 'rgba(192,57,43,0.15)';
            ctx.beginPath(); ctx.arc(cl + 3 + col * cellW2 + cellW2 / 2, gTop + row * cellH2 + cellH2 * 0.35, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#c0392b';
          }
          ctx.fillText(String(d), cl + 3 + col * cellW2 + cellW2 / 2, gTop + row * cellH2 + cellH2 * 0.4);
        }
      } else if (decorId === 'xmastree') {
        // Christmas Tree preview
        const base = h - 4;
        // Presents at base
        ctx.fillStyle = '#e04040'; roundRectPath(ctx, cx - 14, base - 6, 8, 5, 1); ctx.fill();
        ctx.fillStyle = '#ffd700'; ctx.fillRect(cx - 11, base - 6, 1.5, 5); ctx.fillRect(cx - 14, base - 4, 8, 1);
        ctx.fillStyle = '#4090e0'; roundRectPath(ctx, cx + 5, base - 7, 7, 6, 1); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(cx + 8, base - 7, 1.2, 6); ctx.fillRect(cx + 5, base - 5, 7, 1);
        // Pot
        ctx.fillStyle = '#6d3a1f';
        ctx.beginPath(); ctx.moveTo(cx - 5, base - 8); ctx.lineTo(cx - 4, base); ctx.lineTo(cx + 4, base); ctx.lineTo(cx + 5, base - 8); ctx.fill();
        ctx.fillStyle = '#8B4513'; ctx.fillRect(cx - 6, base - 9, 12, 2);
        // Trunk
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 1.5, base - 12, 3, 3);
        // Tree layers (4 triangular tiers with jagged edges)
        const tiers = [
          { w: 22, y: base - 12, h: 8 },
          { w: 17, y: base - 18, h: 8 },
          { w: 12, y: base - 24, h: 8 },
          { w: 7, y: base - 30, h: 8 },
        ];
        tiers.forEach((tier, i) => {
          ctx.fillStyle = i % 2 === 0 ? '#1a7830' : '#1e8a38';
          ctx.beginPath();
          ctx.moveTo(cx, tier.y - tier.h);
          ctx.lineTo(cx + tier.w / 2, tier.y);
          // Jagged bottom
          const jags = 4;
          for (let j = jags; j >= 0; j--) {
            const jx = cx - tier.w / 2 + (j / jags) * tier.w;
            const jy = tier.y + (j % 2 === 0 ? 0 : -1.5);
            ctx.lineTo(jx, jy);
          }
          ctx.closePath(); ctx.fill();
          // Darker edge
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.beginPath();
          ctx.moveTo(cx, tier.y - tier.h);
          ctx.lineTo(cx + tier.w / 2, tier.y);
          ctx.lineTo(cx, tier.y); ctx.closePath(); ctx.fill();
        });
        // Star on top
        ctx.fillStyle = '#ffd700';
        const starY = base - 38;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * 4, starY + Math.sin(a) * 4);
        }
        ctx.closePath(); ctx.fill();
        // Star glow
        ctx.fillStyle = 'rgba(255,215,0,0.2)'; ctx.beginPath(); ctx.arc(cx, starY, 6, 0, Math.PI * 2); ctx.fill();
        // Ornaments
        const ornaments = [
          { x: cx - 6, y: base - 16, c: '#e04040' },
          { x: cx + 4, y: base - 14, c: '#ffd700' },
          { x: cx - 3, y: base - 22, c: '#4090e0' },
          { x: cx + 2, y: base - 26, c: '#ff69b4' },
          { x: cx, y: base - 19, c: '#55efc4' },
        ];
        ornaments.forEach(o => {
          ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(o.x, o.y, 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(o.x - 0.5, o.y - 0.5, 0.8, 0, Math.PI * 2); ctx.fill();
        });
        // Tinsel
        ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx - 8, base - 14); ctx.quadraticCurveTo(cx, base - 18, cx + 6, base - 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 5, base - 22); ctx.quadraticCurveTo(cx, base - 25, cx + 4, base - 22); ctx.stroke();
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
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ Active</button>';
        } else if (isOwned || item.cost === 0) {
          btnHtml = '<button class="shop-btn equip" onclick="equipWall(\'' + item.id + '\')">Use</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyWall(\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>Buy</button>';
        }
        return '<div class="shop-card' + (isActive ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="wall" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + item.name + '</div>' +
          (isOwned || item.cost === 0 ? '<div style="font-size:11px;color:#34d399">Owned ✓</div>' :
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
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ Active</button>';
        } else if (isOwned || item.cost === 0) {
          btnHtml = '<button class="shop-btn equip" onclick="equipFloor(\'' + item.id + '\')">Use</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyFloor(\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>Buy</button>';
        }
        return '<div class="shop-card' + (isActive ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="floor" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + item.name + '</div>' +
          (isOwned || item.cost === 0 ? '<div style="font-size:11px;color:#34d399">Owned ✓</div>' :
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
          btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ Active</button>';
        } else if (isOwned || item.cost === 0) {
          btnHtml = '<button class="shop-btn equip" onclick="equipWindow(\'' + item.id + '\')">Use</button>';
        } else {
          btnHtml = '<button class="shop-btn buy" onclick="buyWindow(\'' + item.id + '\')" ' +
            (canAfford ? '' : 'disabled') + '>Buy</button>';
        }
        return '<div class="shop-card' + (isActive ? ' equipped' : isOwned ? ' owned' : '') + '">' +
          '<canvas class="shop-preview" data-preview="window" data-pid="' + item.id + '"></canvas>' +
          '<div class="shop-name">' + item.name + '</div>' +
          (isOwned || item.cost === 0 ? '<div style="font-size:11px;color:#34d399">Owned ✓</div>' :
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
        const items = DECORATIONS.filter(d => d.category === filterCat);
        targetEl.innerHTML = items.map(item => {
          const isOwned = roomData.ownedDecors.includes(item.id);
          const isPlaced = roomData.placedDecors.some(d => d.id === item.id);
          const canAfford = roomData.coins >= item.cost;
          let btnHtml = '';
          if (isPlaced) {
            btnHtml = '<button class="shop-btn equipped-btn" disabled>✓ In Room</button>' +
              '<button class="shop-btn" style="margin-top:4px;background:rgba(239,68,68,0.2);color:#f87171" onclick="removeDecor(\'' + item.id + '\')">Remove</button>';
          } else if (isOwned) {
            btnHtml = '<button class="shop-btn equip" onclick="placeDecor(\'' + item.id + '\')">Place</button>';
          } else {
            btnHtml = '<button class="shop-btn buy" onclick="buyDecor(\'' + item.id + '\')" ' +
              (canAfford ? '' : 'disabled') + '>Buy</button>';
          }
          return '<div class="shop-card' + (isPlaced ? ' equipped' : isOwned ? ' owned' : '') + '">' +
            '<canvas class="shop-preview" data-preview="decor" data-pid="' + item.id + '" data-cat="' + item.category + '"></canvas>' +
            '<div class="shop-name">' + item.name + '</div>' +
            (isOwned ? '<div style="font-size:11px;color:#34d399">Owned ✓</div>' :
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
        petHtml += '<div style="display:flex;justify-content:center;gap:16px;padding:6px 0 10px;flex-wrap:wrap">';
        activePets.forEach(pet => {
          const petDef = PETS.find(p => p.id === pet.type);
          const hunger = pet.hunger ?? 100;
          const thirst = pet.thirst ?? 100;
          const hColor = hunger > 50 ? '#34d399' : hunger > 20 ? '#fbbf24' : '#f87171';
          const tColor = thirst > 50 ? '#60a5fa' : thirst > 20 ? '#fbbf24' : '#f87171';
          petHtml += '<div style="text-align:center;font-size:11px;color:rgba(255,255,255,0.7)">' +
            (petDef?.emoji || '🐾') + ' ' + pet.name +
            ' <span style="color:' + hColor + '">🍖' + Math.round(hunger) + '%</span>' +
            ' <span style="color:' + tColor + '">💧' + Math.round(thirst) + '%</span></div>';
        });
        petHtml += '</div>';
        petHtml += '<div class="shop-section-title">🍖 Drag food to your pet!</div>';
        petHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 0 8px;text-align:center">Drag food to pet, or tap food then tap your pet</div>';
        petHtml += '<div class="food-grid">';
        petHtml += FOODS.map(f => {
          const canAfford = roomData.coins >= f.cost;
          return '<div class="food-card' + (canAfford ? '' : ' disabled') + '" draggable="' + canAfford + '" ondragstart="onFoodDragStart(event,\'' + f.id + '\')" data-food="' + f.id + '">' +
            '<span class="food-emoji">' + f.emoji + '</span>' +
            '<div class="food-name">' + f.name + '</div>' +
            '<div class="food-restore">+' + f.restore + '%</div>' +
            '<div class="shop-price" style="margin-top:4px">' + coinSVG(11) + ' ' + f.cost + '</div>' +
            '</div>';
        }).join('');
        petHtml += '</div>';

        // Drinks section (restores thirst)
        petHtml += '<div class="shop-section-title" style="margin-top:12px">💧 Drinks — restore thirst!</div>';
        petHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 0 8px;text-align:center">Tap drink then tap your pet to hydrate</div>';
        petHtml += '<div class="food-grid">';
        petHtml += DRINKS.map(d => {
          const canAfford = roomData.coins >= d.cost;
          return '<div class="food-card' + (canAfford ? '' : ' disabled') + '" data-drink="' + d.id + '">' +
            '<span class="food-emoji">' + d.emoji + '</span>' +
            '<div class="food-name">' + d.name + '</div>' +
            '<div class="food-restore" style="color:#60a5fa">+' + d.restore + '%</div>' +
            '<div class="shop-price" style="margin-top:4px">' + coinSVG(11) + ' ' + d.cost + '</div>' +
            '</div>';
        }).join('');
        petHtml += '</div></div>';
      } else {
        petHtml = '<div class="visit-empty">Buy a pet first to feed it!</div>';
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
            (petDef?.emoji || '🐾') + ' ' + pet.name +
            ' <span style="color:#ff8aab">♥ ' + aff + '</span>' +
            ' <span style="color:#fbbf24;font-size:10px">' + ms.title + '</span></div>';
        });
        toyHtml += '</div>';
        toyHtml += '<div class="shop-section-title">🧸 Tap toy then tap your pet!</div>';
        toyHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 0 8px;text-align:center">Toys increase your pet\'s affection</div>';
        toyHtml += '<div class="food-grid">';
        toyHtml += TOYS.map(t => {
          const canAfford = roomData.coins >= t.cost;
          return '<div class="food-card' + (canAfford ? '' : ' disabled') + '" data-toy="' + t.id + '">' +
            '<span class="food-emoji">' + t.emoji + '</span>' +
            '<div class="food-name">' + t.name + '</div>' +
            '<div class="food-restore" style="color:#ff8aab">♥+' + t.affection + '</div>' +
            '<div class="shop-price" style="margin-top:4px">' + coinSVG(11) + ' ' + t.cost + '</div>' +
            '</div>';
        }).join('');
        toyHtml += '</div></div>';
      } else {
        toyHtml = '<div class="visit-empty">Buy a pet first to play with it!</div>';
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
        const best = getBestPlantIncome();
        const isBest = best && best.layer === currentLayer && best.plant === roomData.plant;
        plantHtml += '<div class="shop-section"><div class="shop-section-title">🌱 ' + (plantDef?.name || 'Plant') + ' — Lv.' + lvl + ' (Floor ' + currentLayer + ')</div>';
        plantHtml += '<div style="text-align:center;font-size:11px;color:#98e4b0;padding:4px 0 4px">' +
          '🌿 This plant produces ' + coinSVG(12) + ' ' + coinsPerCycle + ' / 5 min</div>';
        // Revenue follows the single best-earning plant across all floors
        plantHtml += '<div style="text-align:center;font-size:11px;padding:0 0 8px;color:' + (isBest ? '#fbbf24' : 'rgba(255,255,255,0.55)') + '">' +
          (best
            ? (isBest
                ? '⭐ Best on all floors — your room earns ' + coinSVG(12) + ' ' + best.perCycle + ' / 5 min'
                : '💰 Room earns ' + coinSVG(12) + ' ' + best.perCycle + ' / 5 min (from Floor ' + best.layer + ')')
            : '') + '</div>';
        if (nextDef && scaledCost !== null) {
          const nextCoins = nextDef.level * (plantDef ? plantDef.coinRate : 1);
          plantHtml += '<div class="shop-card" style="text-align:center">' +
            '<span class="shop-emoji">' + (plantDef?.emoji || '🌱') + '</span>' +
            '<div class="shop-name">Upgrade to Lv.' + nextDef.level + ' (' + nextDef.label + ')</div>' +
            '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:4px">Earns ' + nextCoins + ' coins / 5 min</div>' +
            '<div class="shop-price">' + coinSVG(14) + ' ' + scaledCost + '</div>' +
            '<button class="shop-btn upgrade" onclick="upgradePlant()" ' +
            (roomData.coins >= scaledCost ? '' : 'disabled') + '>Upgrade</button></div>';
        } else {
          plantHtml += '<div style="text-align:center;color:#98e4b0;padding:20px">★ Max Level! ★</div>';
        }
        plantHtml += '</div>';
      } else {
        plantHtml = '<div class="visit-empty">Buy a plant first to upgrade it!</div>';
      }
      plantEl.innerHTML = plantHtml;

      // ── 🏠 Floors / Layers sub-tab ──
      const layerEl = document.getElementById('feedLayerContent');
      if (!layerEl) return;
      const UNLOCK_COST = { 2: 10000, 3: 20000 };
      const unlockedLayers = roomData.unlockedLayers || 1;
      let layerHtml = '<div class="shop-section">';
      layerHtml += '<div class="shop-section-title">🏠 Floors &amp; Layers</div>';
      layerHtml += '<div style="font-size:11px;color:rgba(255,255,255,0.4);padding:0 12px 12px;text-align:center">' +
        'Unlock new floors for your home! Each floor has its own wall, window, and decor layout.</div>';
      // Render cards for floors 1–3
      for (let i = 1; i <= 3; i++) {
        const unlocked  = i <= unlockedLayers;
        const isCurrent = i === currentLayer;
        const cost      = UNLOCK_COST[i];
        const label     = i === 1 ? '🏡 Base Floor' : i === 2 ? '🏢 2nd Floor' : '🌟 Top Floor';
        const defWall   = getLayerDefaultWall(i).replace('wall_', '');
        layerHtml += '<div class="shop-card" style="text-align:center;' +
          (unlocked ? 'border-color:rgba(247,201,126,0.35)' : '') + '">';
        layerHtml += '<span class="shop-emoji">' + (i === 1 ? '🏡' : i === 2 ? '🏢' : '🌟') + '</span>';
        layerHtml += '<div class="shop-name">' + label + '</div>';
        if (i === 1) {
          // Base floor is always free and unlocked
          layerHtml += '<div style="font-size:11px;color:#34d399;margin-bottom:6px">✓ Free — always unlocked</div>';
          if (isCurrent) {
            layerHtml += '<button class="shop-btn equipped-btn" disabled>✓ Here now</button>';
          } else {
            layerHtml += '<button class="shop-btn equip" onclick="enterLayer(1)">Go to Floor 1</button>';
          }
        } else if (unlocked) {
          layerHtml += '<div style="font-size:11px;color:#34d399;margin-bottom:6px">' +
            '✓ Unlocked' + (isCurrent ? ' <span style="color:#f7c97e">(Current)</span>' : '') + '</div>';
          if (isCurrent) {
            layerHtml += '<button class="shop-btn equipped-btn" disabled>✓ Here now</button>';
          } else {
            layerHtml += '<button class="shop-btn equip" onclick="enterLayer(' + i + ')">Go to Floor ' + i + '</button>';
          }
        } else {
          // Locked — show unlock requirements
          const prevOk = (i - 1) <= unlockedLayers;
          layerHtml += '<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:4px">' +
            'Unlocks with ' + defWall + ' wall</div>';
          layerHtml += '<div class="shop-price">' + coinSVG(14) + ' ' + cost + '</div>';
          if (prevOk) {
            layerHtml += '<button class="shop-btn buy" onclick="unlockLayer(' + i + ')" ' +
              (roomData.coins >= cost ? '' : 'disabled') + '>🔓 Unlock Floor ' + i + '</button>';
          } else {
            layerHtml += '<button class="shop-btn" disabled>Unlock Floor ' + (i - 1) + ' first</button>';
          }
        }
        layerHtml += '</div>';
      }
      // Outside view shortcut
      layerHtml += '<div style="text-align:center;margin-top:4px;padding:0 12px 8px">';
      layerHtml += '<button class="shop-btn equip" style="width:100%" onclick="goOutside()">🌳 Outside View</button>';
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
          el.innerHTML = '<div class="visit-empty">No other rooms yet. Invite friends!</div>';
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
            '<div class="visit-name">' + dot + escapeHtml(r.displayName || 'Anonymous') + '</div>' +
            '<span class="visit-peek">' + (peekItems.length ? peekItems.join(' ') : '<span style="font-size:12px;opacity:0.4">Empty room</span>') + '</span>' +
            '</div>' +
            '<button class="food-btn" style="font-size:10px;padding:6px 10px;margin-right:6px" onclick="event.stopPropagation();showGiftModal(\'' + r.uid + '\',\'' + escapeHtml(r.displayName || 'Anonymous').replace(/'/g, "\\'") + '\')">🎁</button>' +
            '<span class="visit-arrow">›</span></div>';
        }).join('');
      }, () => {
        el.innerHTML = '<div class="visit-empty">Failed to load rooms</div>';
      });
    }

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

