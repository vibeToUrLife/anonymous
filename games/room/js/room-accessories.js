    /* ═══════════════════════════════
       5. PET TRICKS (extends PET_ACTIONS)
       ═══════════════════════════════ */
    // Each pet's tricks are chosen to FIT the animal, and every trick id maps
    // 1:1 to a dedicated, recognizable body animation (see trickActionMap +
    // applyActionTransform). Thresholds rise so harder tricks unlock later.
    const PET_TRICKS = {
      // Agile cat: sit → spin → dance → a real backflip.
      cat:     [{ id: 'trick_sit', name: 'Sit', minAffection: 100 }, { id: 'trick_spin', name: 'Spin', minAffection: 300 }, { id: 'trick_dance', name: 'Dance', minAffection: 600 }, { id: 'trick_backflip', name: 'Backflip', minAffection: 1200 }],
      // Classic dog repertoire: sit → shake a paw → roll over → dance.
      dog:     [{ id: 'trick_sit', name: 'Sit', minAffection: 50 },  { id: 'trick_shake', name: 'Shake', minAffection: 200 }, { id: 'trick_roll', name: 'Roll Over', minAffection: 500 }, { id: 'trick_dance', name: 'Dance', minAffection: 1000 }],
      // Bunny: stand up → spin → the signature happy binky jump.
      bunny:   [{ id: 'trick_stand', name: 'Stand Up', minAffection: 80 }, { id: 'trick_spin', name: 'Spin', minAffection: 250 }, { id: 'trick_binky', name: 'Binky Jump', minAffection: 600 }],
      // Hamster: spin (like a wheel) → stand up → roll.
      hamster: [{ id: 'trick_spin', name: 'Spin', minAffection: 60 }, { id: 'trick_stand', name: 'Stand Up', minAffection: 200 }, { id: 'trick_roll', name: 'Roll', minAffection: 500 }],
      // Fox: a quick pounce → spin → dance.
      fox:     [{ id: 'trick_pounce', name: 'Pounce', minAffection: 150 }, { id: 'trick_spin', name: 'Spin', minAffection: 400 }, { id: 'trick_dance', name: 'Dance', minAffection: 800 }],
      // Panda: a friendly wave → roll → dance.
      panda:   [{ id: 'trick_wave', name: 'Wave', minAffection: 100 }, { id: 'trick_roll', name: 'Roll', minAffection: 300 }, { id: 'trick_dance', name: 'Dance', minAffection: 700 }],
      // Goose: flap its wings → spin → waddle-dance.
      goose:   [{ id: 'trick_flap', name: 'Flap', minAffection: 80 }, { id: 'trick_spin', name: 'Spin', minAffection: 250 }, { id: 'trick_dance', name: 'Dance', minAffection: 600 }],
    };

    function triggerPetTrick(petId, trickId) {
      // petStates is keyed by pet INSTANCE id (not pet type)
      const st = petStates[petId];
      if (!st) return;
      // Don't let an open status bar / drag freeze the trick animation
      st.stopped = false;
      st.dragging = false;
      const pet = getPet(petId);
      // Each trick maps 1:1 to its own dedicated, recognizable animation
      // (defined in applyActionTransform), so the move always matches its name.
      const trickActionMap = {
        'trick_sit': 'sit', 'trick_shake': 'shake', 'trick_roll': 'roll',
        'trick_spin': 'spin', 'trick_dance': 'dance', 'trick_backflip': 'backflip',
        'trick_stand': 'standup', 'trick_pounce': 'pounce', 'trick_binky': 'binky',
        'trick_wave': 'wave', 'trick_flap': 'flap'
      };
      st.action = trickActionMap[trickId] || 'sit';
      st.actionDur = 3000;
      st.actionEnd = Date.now() + 3000;
      st.actionCooldown = st.actionEnd + 2000; // don't override with a random idle action
      const petName = pet ? pet.name : '';
      showToast('🎪 ' + (petName || 'Pet') + ' does a trick!', 'success');
    }

    /* ═══════════════════════════════
       6. PET ACCESSORIES — render & shop
       ═══════════════════════════════ */
    function renderAccessoryShop() {
      const el = document.getElementById('accShop');
      if (!el) return;
      const activePets = getActivePets();
      let html = '';

      // Accessory cards
      html += '<div class="acc-grid">';
      PET_ACCESSORIES.forEach(acc => {
        const isOwned = (roomData.ownedAccessories || []).includes(acc.id);
        // Check if currently equipped on any pet instance
        const equippedOn = activePets.filter(pet => pet.accessory === acc.id);
        const isEquipped = equippedOn.length > 0;
        let cls = isEquipped ? 'equipped' : isOwned ? 'owned' : '';
        html += '<div class="acc-card ' + cls + '">' +
          '<canvas class="acc-preview-cvs" data-acc="' + acc.id + '" width="60" height="60" style="display:block;margin:0 auto 4px"></canvas>' +
          '<div class="acc-name">' + acc.name + '</div>';
        if (isOwned) {
          html += '<div class="acc-price" style="color:#34d399">Owned</div>';
          if (activePets.length) {
            html += '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">';
            activePets.forEach(pet => {
              const equipped = pet.accessory === acc.id;
              if (equipped) {
                html += '<button class="food-btn" style="font-size:11px;padding:8px 6px;background:rgba(239,68,68,.2);color:#f87171;width:100%;position:relative;z-index:5" onclick="window.removePetAcc(\'' + pet.id + '\');return false;">✕ ' + pet.name + '</button>';
              } else {
                html += '<button class="food-btn" style="font-size:11px;padding:8px 6px;width:100%;position:relative;z-index:5" onclick="window.equipPetAcc(\'' + pet.id + '\',\'' + acc.id + '\');return false;">' + pet.name + '</button>';
              }
            });
            html += '</div>';
          }
        } else {
          html += '<div class="acc-price" style="color:rgba(255,255,255,.35);font-size:11px">🎰 Gacha Only</div>';
        }
        html += '</div>';
      });
      html += '</div>';

      // Pet Tricks section
      if (activePets.length) {
        html += '<div class="shop-section-title" style="margin-top:20px">🎪 Pet Tricks</div>';
        html += '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:10px;text-align:center">Pets learn tricks as affection grows!</div>';
        activePets.forEach(pet => {
          const petDef = PETS.find(p => p.id === pet.type);
          const affection = pet.affection || 0;
          const tricks = PET_TRICKS[pet.type] || [];
          if (!tricks.length) return;
          html += '<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px">' + (petDef?.emoji || '') + ' ' + pet.name + ' (❤️ ' + affection + ')</div>';
          html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
          tricks.forEach(tr => {
            const unlocked = affection >= tr.minAffection;
            html += '<button class="food-btn" style="font-size:10px;' + (unlocked ? '' : 'opacity:.4;cursor:not-allowed') + '" ' +
              (unlocked ? 'onclick="window.triggerPetTrick(\'' + pet.id + '\',\'' + tr.id + '\');return false;"' : 'disabled') +
              '>' + tr.name + (unlocked ? '' : ' (❤️' + tr.minAffection + ')') + '</button>';
          });
          html += '</div></div>';
        });
      }
      el.innerHTML = html;

      // Draw accessory previews on canvases
      el.querySelectorAll('.acc-preview-cvs').forEach(cvs => {
        const accId = cvs.dataset.acc;
        const ctx = cvs.getContext('2d');
        const w = cvs.width, h = cvs.height;
        const s = w * 0.7;
        const ho = PET_HEAD_OFFSETS['cat'] || { hx: 0, hy: -0.3, r: 0.28 };
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        // Centre so the cat head offset lands in the middle of canvas
        ctx.translate(w / 2 - s * ho.hx, h / 2 + s * 0.1 - s * ho.hy);
        // Simple pet head silhouette at the head offset position
        const hx = s * ho.hx, hy = s * ho.hy;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(hx, hy, s * ho.r, 0, Math.PI * 2); ctx.fill();
        // Ears
        ctx.beginPath(); ctx.moveTo(hx - s*0.22, hy - s*0.18); ctx.lineTo(hx - s*0.16, hy - s*0.38); ctx.lineTo(hx - s*0.06, hy - s*0.22); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx + s*0.22, hy - s*0.18); ctx.lineTo(hx + s*0.16, hy - s*0.38); ctx.lineTo(hx + s*0.06, hy - s*0.22); ctx.fill();
        // Eyes
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(hx - s*0.08, hy - s*0.02, s*0.03, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + s*0.08, hy - s*0.02, s*0.03, 0, Math.PI*2); ctx.fill();
        // Draw the accessory on top
        drawPetAccessory(ctx, 'cat', accId, s);
        ctx.restore();
      });
    }

    async function buyAccessory(accId) {
      return showToast('Accessories can only be obtained from Gacha!', 'error');
    }

    async function equipPetAcc(petId, accId) {
      if (viewingUid !== currentUid) return;
      const pet = getPet(petId);
      if (!pet) return;
      pet.accessory = accId;
      _lastPetKey = '';
      _lastLocalSaveTime = Date.now();
      const panelInner = document.querySelector('.panel-inner');
      const scrollTop = panelInner ? panelInner.scrollTop : 0;
      await saveRoom();
      renderAccessoryShop();
      if (panelInner) panelInner.scrollTop = scrollTop;
    }

    async function removePetAcc(petId) {
      if (viewingUid !== currentUid) return;
      const pet = getPet(petId);
      if (!pet) return;
      pet.accessory = null;
      _lastPetKey = '';
      _lastLocalSaveTime = Date.now();
      const panelInner = document.querySelector('.panel-inner');
      const scrollTop = panelInner ? panelInner.scrollTop : 0;
      await saveRoom();
      renderAccessoryShop();
      if (panelInner) panelInner.scrollTop = scrollTop;
      showToast('Accessory removed!', 'success');
    }

    // Expose accessory functions to window for onclick handlers
    window.removePetAcc = removePetAcc;
    window.equipPetAcc = equipPetAcc;
    window.buyAccessory = buyAccessory;
    window.triggerPetTrick = triggerPetTrick;

    // Draw accessory on pet canvas — offset to each pet's actual head position
    const PET_HEAD_OFFSETS = {
      cat:     { hx:  0.35, hy: -0.18, r: 0.28 },
      dog:     { hx:  0.35, hy: -0.14, r: 0.28 },
      bunny:   { hx:  0.30, hy: -0.16, r: 0.26 },
      hamster: { hx:  0.25, hy: -0.10, r: 0.30 },
      fox:     { hx:  0.38, hy: -0.14, r: 0.27 },
      panda:   { hx:  0.05, hy: -0.30, r: 0.30 }
    };

    // Accessories that render behind the pet body
    const BACK_LAYER_ACCESSORIES = ['wings'];

    function drawPetAccessory(ctx, petType, accId, s, layer) {
      if (!accId) return;
      const acc = PET_ACCESSORIES.find(a => a.id === accId);
      if (!acc) return;
      const isBack = BACK_LAYER_ACCESSORIES.includes(acc.draw);
      // If layer is specified, only draw matching layer
      if (layer === 'back' && !isBack) return;
      if (layer === 'front' && isBack) return;
      const ho = PET_HEAD_OFFSETS[petType] || { hx: 0, hy: -0.3, r: 0.28 };
      const hx = s * ho.hx;   // head centre X
      const hy = s * ho.hy;   // head centre Y
      const hr = s * ho.r;    // head radius
      switch (acc.draw) {
        case 'tophat':
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(hx - s*0.12, hy - hr - s*0.2, s*0.24, s*0.2);
          ctx.fillRect(hx - s*0.18, hy - hr - s*0.02, s*0.36, s*0.07);
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(hx - s*0.1, hy - hr - s*0.08, s*0.2, s*0.03);
          break;
        case 'crown':
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.15, hy - hr + s*0.02);
          ctx.lineTo(hx - s*0.18, hy - hr - s*0.16);
          ctx.lineTo(hx - s*0.08, hy - hr - s*0.08);
          ctx.lineTo(hx, hy - hr - s*0.20);
          ctx.lineTo(hx + s*0.08, hy - hr - s*0.08);
          ctx.lineTo(hx + s*0.18, hy - hr - s*0.16);
          ctx.lineTo(hx + s*0.15, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath(); ctx.arc(hx, hy - hr - s*0.12, s*0.025, 0, Math.PI*2); ctx.fill();
          break;
        case 'glasses':
          ctx.strokeStyle = '#333'; ctx.lineWidth = s*0.02;
          ctx.beginPath(); ctx.arc(hx - s*0.08, hy, s*0.06, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(hx + s*0.08, hy, s*0.06, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(hx - s*0.02, hy); ctx.lineTo(hx + s*0.02, hy); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.arc(hx - s*0.08, hy, s*0.055, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(hx + s*0.08, hy, s*0.055, 0, Math.PI*2); ctx.fill();
          break;
        case 'bow':
          ctx.fillStyle = '#ff69b4';
          ctx.beginPath(); ctx.ellipse(hx - s*0.08, hy - hr, s*0.08, s*0.05, -0.3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(hx + s*0.08, hy - hr, s*0.08, s*0.05, 0.3, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#ff1493';
          ctx.beginPath(); ctx.arc(hx, hy - hr, s*0.025, 0, Math.PI*2); ctx.fill();
          break;
        case 'scarf':
          // Scarf wraps around the neck area (positioned relative to body, below the head)
          ctx.fillStyle = '#e74c3c';
          // Main scarf band (sits at neck level, just below the head)
          ctx.beginPath();
          ctx.ellipse(hx, hy + hr + s*0.02, s*0.22, s*0.05, 0, 0, Math.PI * 2);
          ctx.fill();
          // Scarf knot
          ctx.fillStyle = '#c0392b';
          ctx.beginPath(); ctx.arc(hx + s*0.08, hy + hr + s*0.04, s*0.035, 0, Math.PI * 2); ctx.fill();
          // Hanging tail piece 1
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath();
          ctx.moveTo(hx + s*0.06, hy + hr + s*0.06);
          ctx.quadraticCurveTo(hx + s*0.14, hy + hr + s*0.14, hx + s*0.10, hy + hr + s*0.24);
          ctx.lineTo(hx + s*0.04, hy + hr + s*0.22);
          ctx.quadraticCurveTo(hx + s*0.08, hy + hr + s*0.12, hx + s*0.02, hy + hr + s*0.06);
          ctx.closePath(); ctx.fill();
          // Hanging tail piece 2 (shorter)
          ctx.beginPath();
          ctx.moveTo(hx + s*0.08, hy + hr + s*0.06);
          ctx.quadraticCurveTo(hx + s*0.18, hy + hr + s*0.10, hx + s*0.16, hy + hr + s*0.18);
          ctx.lineTo(hx + s*0.12, hy + hr + s*0.16);
          ctx.quadraticCurveTo(hx + s*0.14, hy + hr + s*0.08, hx + s*0.08, hy + hr + s*0.06);
          ctx.closePath(); ctx.fill();
          // Green stripe pattern on the scarf
          ctx.fillStyle = '#27ae60';
          ctx.beginPath();
          ctx.ellipse(hx, hy + hr + s*0.02, s*0.20, s*0.015, 0, 0, Math.PI * 2);
          ctx.fill();
          // Fringe at end of tail
          ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = s*0.01; ctx.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(hx + s*0.08 + i*s*0.025, hy + hr + s*0.22);
            ctx.lineTo(hx + s*0.08 + i*s*0.025, hy + hr + s*0.27);
            ctx.stroke();
          }
          break;
        case 'flower': {
          const fc = ['#ff69b4','#ff69b4','#ff69b4','#ff69b4','#ff69b4'];
          fc.forEach((c, i) => {
            const a = (i / 5) * Math.PI * 2;
            ctx.fillStyle = c;
            ctx.beginPath(); ctx.arc(hx + Math.cos(a)*s*0.06, hy - hr + Math.sin(a)*s*0.06, s*0.03, 0, Math.PI*2); ctx.fill();
          });
          ctx.fillStyle = '#ffd700';
          ctx.beginPath(); ctx.arc(hx, hy - hr, s*0.025, 0, Math.PI*2); ctx.fill();
          break;
        }
        case 'bandana':
          ctx.fillStyle = '#2c3e50';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.18, hy - s*0.02); ctx.lineTo(hx + s*0.18, hy - s*0.02);
          ctx.lineTo(hx + s*0.14, hy + s*0.06); ctx.lineTo(hx - s*0.14, hy + s*0.06);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ecf0f1';
          ctx.beginPath(); ctx.arc(hx, hy + s*0.02, s*0.015, 0, Math.PI*2); ctx.fill();
          break;
        case 'monocle':
          ctx.strokeStyle = '#c9952a'; ctx.lineWidth = s*0.015;
          ctx.beginPath(); ctx.arc(hx + s*0.08, hy, s*0.07, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = 'rgba(200,220,255,0.15)';
          ctx.beginPath(); ctx.arc(hx + s*0.08, hy, s*0.06, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#c9952a'; ctx.lineWidth = s*0.008;
          ctx.beginPath(); ctx.moveTo(hx + s*0.08, hy + s*0.07); ctx.lineTo(hx + s*0.08, hy + s*0.3); ctx.stroke();
          break;
        case 'halo':
          ctx.strokeStyle = '#ffd700'; ctx.lineWidth = s*0.025;
          ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.ellipse(hx, hy - hr - s*0.06, s*0.14, s*0.04, 0, 0, Math.PI*2); ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'wizard':
          ctx.fillStyle = '#2c1654';
          ctx.beginPath();
          ctx.moveTo(hx, hy - hr - s*0.35);
          ctx.lineTo(hx - s*0.2, hy - hr + s*0.02);
          ctx.lineTo(hx + s*0.2, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffd700';
          ctx.beginPath(); ctx.arc(hx, hy - hr - s*0.28, s*0.025, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#8b5cf6';
          ctx.fillRect(hx - s*0.2, hy - hr - s*0.02, s*0.4, s*0.04);
          break;
        case 'partyhat':
          ctx.fillStyle = '#ff6b6b';
          ctx.beginPath();
          ctx.moveTo(hx, hy - hr - s*0.28);
          ctx.lineTo(hx - s*0.14, hy - hr + s*0.02);
          ctx.lineTo(hx + s*0.14, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          // Stripes
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.04, hy - hr - s*0.16);
          ctx.lineTo(hx - s*0.1, hy - hr - s*0.04);
          ctx.lineTo(hx + s*0.02, hy - hr - s*0.04);
          ctx.closePath(); ctx.fill();
          // Pom pom
          ctx.fillStyle = '#34d399';
          ctx.beginPath(); ctx.arc(hx, hy - hr - s*0.28, s*0.03, 0, Math.PI*2); ctx.fill();
          break;
        case 'heartglass':
          ctx.fillStyle = '#ff1493';
          // Left heart lens
          ctx.beginPath();
          ctx.moveTo(hx - s*0.08, hy + s*0.02);
          ctx.bezierCurveTo(hx - s*0.08, hy - s*0.04, hx - s*0.16, hy - s*0.04, hx - s*0.16, hy);
          ctx.bezierCurveTo(hx - s*0.16, hy + s*0.04, hx - s*0.08, hy + s*0.06, hx - s*0.08, hy + s*0.02);
          ctx.fill();
          // Right heart lens
          ctx.beginPath();
          ctx.moveTo(hx + s*0.08, hy + s*0.02);
          ctx.bezierCurveTo(hx + s*0.08, hy - s*0.04, hx + s*0.16, hy - s*0.04, hx + s*0.16, hy);
          ctx.bezierCurveTo(hx + s*0.16, hy + s*0.04, hx + s*0.08, hy + s*0.06, hx + s*0.08, hy + s*0.02);
          ctx.fill();
          // Bridge
          ctx.strokeStyle = '#ff1493'; ctx.lineWidth = s*0.015;
          ctx.beginPath(); ctx.moveTo(hx - s*0.02, hy); ctx.lineTo(hx + s*0.02, hy); ctx.stroke();
          break;
        case 'devil':
          // Left horn — curved, tapered with depth shading
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.12, hy - hr + s*0.02);
          ctx.quadraticCurveTo(hx - s*0.22, hy - hr - s*0.18, hx - s*0.10, hy - hr - s*0.14);
          ctx.lineTo(hx - s*0.08, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          // Left horn dark inner side
          ctx.fillStyle = '#991b1b';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.10, hy - hr + s*0.02);
          ctx.quadraticCurveTo(hx - s*0.18, hy - hr - s*0.12, hx - s*0.10, hy - hr - s*0.10);
          ctx.lineTo(hx - s*0.09, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          // Left horn highlight
          ctx.fillStyle = 'rgba(255,100,100,0.3)';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.13, hy - hr);
          ctx.quadraticCurveTo(hx - s*0.20, hy - hr - s*0.14, hx - s*0.12, hy - hr - s*0.12);
          ctx.lineTo(hx - s*0.11, hy - hr);
          ctx.closePath(); ctx.fill();
          // Right horn — curved, tapered with depth shading
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.moveTo(hx + s*0.12, hy - hr + s*0.02);
          ctx.quadraticCurveTo(hx + s*0.22, hy - hr - s*0.18, hx + s*0.10, hy - hr - s*0.14);
          ctx.lineTo(hx + s*0.08, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          // Right horn dark inner side
          ctx.fillStyle = '#991b1b';
          ctx.beginPath();
          ctx.moveTo(hx + s*0.10, hy - hr + s*0.02);
          ctx.quadraticCurveTo(hx + s*0.18, hy - hr - s*0.12, hx + s*0.10, hy - hr - s*0.10);
          ctx.lineTo(hx + s*0.09, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          // Right horn highlight
          ctx.fillStyle = 'rgba(255,100,100,0.3)';
          ctx.beginPath();
          ctx.moveTo(hx + s*0.13, hy - hr);
          ctx.quadraticCurveTo(hx + s*0.20, hy - hr - s*0.14, hx + s*0.12, hy - hr - s*0.12);
          ctx.lineTo(hx + s*0.11, hy - hr);
          ctx.closePath(); ctx.fill();
          // Horn base ring
          ctx.fillStyle = '#b91c1c';
          ctx.beginPath(); ctx.ellipse(hx - s*0.10, hy - hr + s*0.02, s*0.04, s*0.015, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(hx + s*0.10, hy - hr + s*0.02, s*0.04, s*0.015, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'wings':
          // Angel wings — side view, natural proportions, not too tall
          ctx.save();
          const wingRootX = -s * 0.08;
          const wingRootY = -s * 0.22;

          // Soft glow
          ctx.globalAlpha = 0.08;
          const wingGlowGrad = ctx.createRadialGradient(wingRootX, wingRootY - s*0.12, 0, wingRootX, wingRootY - s*0.12, s*0.45);
          wingGlowGrad.addColorStop(0, '#fff');
          wingGlowGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = wingGlowGrad;
          ctx.fillRect(wingRootX - s*0.5, wingRootY - s*0.5, s*1.0, s*0.8);
          ctx.globalAlpha = 1;

          // --- Far wing (behind body, slightly to the left) ---
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#c8d0e8';
          ctx.beginPath();
          ctx.moveTo(wingRootX - s*0.04, wingRootY + s*0.02);
          ctx.quadraticCurveTo(wingRootX - s*0.22, wingRootY - s*0.20, wingRootX - s*0.14, wingRootY - s*0.36);
          ctx.quadraticCurveTo(wingRootX - s*0.04, wingRootY - s*0.42, wingRootX + s*0.06, wingRootY - s*0.30);
          ctx.quadraticCurveTo(wingRootX + s*0.10, wingRootY - s*0.16, wingRootX + s*0.04, wingRootY - s*0.04);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(160,170,200,0.3)'; ctx.lineWidth = s*0.004;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(wingRootX - s*0.02, wingRootY + s*0.00 - i*s*0.015);
            ctx.quadraticCurveTo(wingRootX - s*0.14, wingRootY - s*0.18 - i*s*0.04, wingRootX - s*0.06, wingRootY - s*0.30 - i*s*0.02);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // --- Near wing (front, slightly to the right, bigger) ---
          ctx.fillStyle = '#e0e7ff';
          ctx.beginPath();
          ctx.moveTo(wingRootX + s*0.04, wingRootY + s*0.02);
          ctx.quadraticCurveTo(wingRootX - s*0.10, wingRootY - s*0.22, wingRootX - s*0.02, wingRootY - s*0.42);
          ctx.quadraticCurveTo(wingRootX + s*0.14, wingRootY - s*0.48, wingRootX + s*0.28, wingRootY - s*0.34);
          ctx.quadraticCurveTo(wingRootX + s*0.34, wingRootY - s*0.18, wingRootX + s*0.24, wingRootY - s*0.04);
          ctx.quadraticCurveTo(wingRootX + s*0.16, wingRootY + s*0.06, wingRootX + s*0.04, wingRootY + s*0.02);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(180,190,220,0.35)'; ctx.lineWidth = s*0.005;
          ctx.stroke();
          // Mid feathers
          ctx.fillStyle = 'rgba(200,210,240,0.7)';
          ctx.beginPath();
          ctx.moveTo(wingRootX + s*0.04, wingRootY + s*0.02);
          ctx.quadraticCurveTo(wingRootX - s*0.02, wingRootY - s*0.14, wingRootX + s*0.04, wingRootY - s*0.32);
          ctx.quadraticCurveTo(wingRootX + s*0.14, wingRootY - s*0.38, wingRootX + s*0.22, wingRootY - s*0.24);
          ctx.quadraticCurveTo(wingRootX + s*0.24, wingRootY - s*0.10, wingRootX + s*0.16, wingRootY);
          ctx.closePath(); ctx.fill();
          // Inner highlight
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          ctx.moveTo(wingRootX + s*0.06, wingRootY);
          ctx.quadraticCurveTo(wingRootX + s*0.04, wingRootY - s*0.12, wingRootX + s*0.10, wingRootY - s*0.22);
          ctx.quadraticCurveTo(wingRootX + s*0.16, wingRootY - s*0.18, wingRootX + s*0.14, wingRootY - s*0.06);
          ctx.closePath(); ctx.fill();
          // Feather lines
          ctx.strokeStyle = 'rgba(170,180,215,0.3)'; ctx.lineWidth = s*0.004;
          for (let i = 0; i < 5; i++) {
            const t = i / 4;
            ctx.beginPath();
            ctx.moveTo(wingRootX + s*0.04, wingRootY + s*0.01 - i*s*0.012);
            ctx.quadraticCurveTo(wingRootX + s*(0.00 + t*0.16), wingRootY - s*(0.25 + t*0.10),
                                 wingRootX + s*(0.02 + t*0.20), wingRootY - s*(0.36 + t*0.04));
            ctx.stroke();
          }
          // Sparkles
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          [[0.04, -0.36], [0.20, -0.38], [0.30, -0.24], [0.16, -0.18], [0.26, -0.10],
           [-0.18, -0.28], [-0.24, -0.18], [-0.10, -0.32]].forEach(([dx, dy]) => {
            ctx.beginPath(); ctx.arc(wingRootX + s*dx, wingRootY + s*dy, s*0.008, 0, Math.PI*2); ctx.fill();
          });
          ctx.restore();
          break;
        case 'cape':
          // Majestic pet cape with embroidery, gold trim, and rich textures
          ctx.save();
          const capeX1 = s * 0.15;
          const capeX2 = -s * 0.45;
          const capeTopY = -s * 0.38;
          const capeHangY = s * 0.22;
          // Drop shadow
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.moveTo(capeX1 + s*0.01, capeTopY + s*0.04);
          ctx.quadraticCurveTo(s*0.02, capeTopY, -s*0.15, capeTopY + s*0.03);
          ctx.quadraticCurveTo(-s*0.30, capeTopY + s*0.06, capeX2, capeTopY + s*0.12);
          ctx.quadraticCurveTo(capeX2 - s*0.03, 0, capeX2 + s*0.02, capeHangY + s*0.02);
          ctx.quadraticCurveTo(-s*0.25, capeHangY + s*0.06, -s*0.05, capeHangY + s*0.04);
          ctx.quadraticCurveTo(s*0.06, capeHangY + s*0.02, capeX1 + s*0.01, capeHangY - s*0.04);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          // Cape body — rich velvet gradient
          const capeGrad = ctx.createLinearGradient(capeX1, capeTopY, capeX2, capeHangY);
          capeGrad.addColorStop(0, '#8b5cf6');
          capeGrad.addColorStop(0.25, '#7c3aed');
          capeGrad.addColorStop(0.55, '#6d28d9');
          capeGrad.addColorStop(0.8, '#5b21b6');
          capeGrad.addColorStop(1, '#4c1d95');
          ctx.fillStyle = capeGrad;
          ctx.beginPath();
          ctx.moveTo(capeX1, capeTopY + s*0.02);
          ctx.quadraticCurveTo(s*0.02, capeTopY - s*0.01, -s*0.15, capeTopY + s*0.01);
          ctx.quadraticCurveTo(-s*0.30, capeTopY + s*0.04, capeX2, capeTopY + s*0.10);
          ctx.quadraticCurveTo(capeX2 - s*0.03, 0, capeX2 + s*0.02, capeHangY);
          ctx.quadraticCurveTo(-s*0.25, capeHangY + s*0.04, -s*0.05, capeHangY + s*0.02);
          ctx.quadraticCurveTo(s*0.06, capeHangY, capeX1, capeHangY - s*0.06);
          ctx.closePath(); ctx.fill();
          // Gold trim along top edge
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = s*0.010;
          ctx.beginPath();
          ctx.moveTo(capeX1, capeTopY + s*0.02);
          ctx.quadraticCurveTo(s*0.02, capeTopY - s*0.01, -s*0.15, capeTopY + s*0.01);
          ctx.quadraticCurveTo(-s*0.30, capeTopY + s*0.04, capeX2, capeTopY + s*0.10);
          ctx.stroke();
          // Gold trim along bottom hem
          ctx.lineWidth = s*0.008;
          ctx.beginPath();
          ctx.moveTo(capeX2 + s*0.02, capeHangY);
          ctx.quadraticCurveTo(-s*0.25, capeHangY + s*0.04, -s*0.05, capeHangY + s*0.02);
          ctx.quadraticCurveTo(s*0.06, capeHangY, capeX1, capeHangY - s*0.06);
          ctx.stroke();
          // Inner dark gold shimmer along trim
          ctx.strokeStyle = '#d97706'; ctx.lineWidth = s*0.004;
          ctx.beginPath();
          ctx.moveTo(capeX1, capeTopY + s*0.04);
          ctx.quadraticCurveTo(s*0.02, capeTopY + s*0.01, -s*0.15, capeTopY + s*0.03);
          ctx.quadraticCurveTo(-s*0.30, capeTopY + s*0.06, capeX2, capeTopY + s*0.12);
          ctx.stroke();
          // Inner lining peek at hem — dark red silk
          ctx.fillStyle = '#881337'; ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.moveTo(capeX1 - s*0.02, capeHangY - s*0.08);
          ctx.quadraticCurveTo(0, capeHangY, -s*0.15, capeHangY + s*0.01);
          ctx.quadraticCurveTo(-s*0.30, capeHangY + s*0.02, capeX2 + s*0.06, capeHangY - s*0.04);
          ctx.lineTo(capeX2 + s*0.06, capeHangY - s*0.10);
          ctx.quadraticCurveTo(-s*0.15, capeHangY - s*0.04, capeX1 - s*0.02, capeHangY - s*0.08);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          // Royal emblem / crest at centre of cape
          const embX = -s*0.12, embY = capeTopY + s*0.14;
          // Shield shape
          ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
          ctx.beginPath();
          ctx.moveTo(embX, embY - s*0.05);
          ctx.lineTo(embX + s*0.04, embY - s*0.03);
          ctx.lineTo(embX + s*0.04, embY + s*0.02);
          ctx.quadraticCurveTo(embX, embY + s*0.06, embX - s*0.04, embY + s*0.02);
          ctx.lineTo(embX - s*0.04, embY - s*0.03);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255, 200, 0, 0.4)'; ctx.lineWidth = s*0.004;
          ctx.stroke();
          // Crown on emblem
          ctx.fillStyle = 'rgba(255, 200, 0, 0.3)';
          ctx.beginPath();
          ctx.moveTo(embX - s*0.025, embY - s*0.01);
          ctx.lineTo(embX - s*0.02, embY - s*0.03);
          ctx.lineTo(embX - s*0.008, embY - s*0.015);
          ctx.lineTo(embX, embY - s*0.035);
          ctx.lineTo(embX + s*0.008, embY - s*0.015);
          ctx.lineTo(embX + s*0.02, embY - s*0.03);
          ctx.lineTo(embX + s*0.025, embY - s*0.01);
          ctx.closePath(); ctx.fill();
          // Fabric fold lines
          ctx.strokeStyle = 'rgba(80, 30, 160, 0.18)'; ctx.lineWidth = s*0.004;
          for (let fi = 0; fi < 3; fi++) {
            const fy = capeTopY + s*0.06 + fi * s*0.09;
            ctx.beginPath();
            ctx.moveTo(capeX1 - s*0.04 - fi*s*0.02, fy);
            ctx.quadraticCurveTo(-s*0.10, fy - s*0.015, capeX2 + s*0.12 + fi*s*0.04, fy + s*0.02);
            ctx.stroke();
          }
          // Light sheen across cape surface
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(capeX1 - s*0.02, capeTopY + s*0.04);
          ctx.quadraticCurveTo(-s*0.05, capeTopY, -s*0.25, capeTopY + s*0.06);
          ctx.quadraticCurveTo(-s*0.15, capeTopY + s*0.12, capeX1 - s*0.02, capeTopY + s*0.10);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          // Scalloped rear edge
          ctx.strokeStyle = '#9333ea'; ctx.lineWidth = s*0.005;
          ctx.beginPath();
          const rearTopSc = capeTopY + s*0.10;
          const rearBotSc = capeHangY;
          ctx.moveTo(capeX2 + s*0.02, rearTopSc);
          for (let i = 0; i < 3; i++) {
            const ry = rearTopSc + i * (rearBotSc - rearTopSc) / 3;
            const ry2 = rearTopSc + (i + 1) * (rearBotSc - rearTopSc) / 3;
            ctx.quadraticCurveTo(capeX2 - s*0.02, (ry + ry2)/2, capeX2 + s*0.02, ry2);
          }
          ctx.stroke();
          // Ornate gold clasp at collar
          const clY = capeTopY + s*0.02 + (capeHangY - capeTopY)*0.15;
          // Clasp outer ring
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath(); ctx.arc(capeX1, clY, s*0.035, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#92400e'; ctx.lineWidth = s*0.005;
          ctx.stroke();
          // Clasp inner ring
          ctx.strokeStyle = '#d97706'; ctx.lineWidth = s*0.003;
          ctx.beginPath(); ctx.arc(capeX1, clY, s*0.025, 0, Math.PI*2); ctx.stroke();
          // Clasp gem
          ctx.fillStyle = '#dc2626';
          ctx.beginPath(); ctx.arc(capeX1, clY, s*0.015, 0, Math.PI*2); ctx.fill();
          // Gem facet highlight
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath(); ctx.arc(capeX1 - s*0.004, clY - s*0.005, s*0.006, 0, Math.PI*2); ctx.fill();
          // Small decorative dots on clasp
          ctx.fillStyle = '#fbbf24';
          for (let d = 0; d < 4; d++) {
            const da = Math.PI/2 * d;
            ctx.beginPath(); ctx.arc(capeX1 + Math.cos(da)*s*0.028, clY + Math.sin(da)*s*0.028, s*0.004, 0, Math.PI*2); ctx.fill();
          }
          ctx.restore();
          break;
        case 'ninja':
          // Ninja face mask — covers nose/mouth only, headband above eyes
          ctx.fillStyle = '#1a1a2e';
          // Lower face mask (covers below eyes, wraps around face)
          ctx.beginPath();
          ctx.moveTo(hx - hr*0.85, hy + s*0.02);
          ctx.quadraticCurveTo(hx - hr*0.90, hy + hr*0.6, hx - hr*0.5, hy + hr*0.85);
          ctx.quadraticCurveTo(hx, hy + hr*0.95, hx + hr*0.5, hy + hr*0.85);
          ctx.quadraticCurveTo(hx + hr*0.90, hy + hr*0.6, hx + hr*0.85, hy + s*0.02);
          ctx.closePath(); ctx.fill();
          // Slight wrinkle lines on cloth
          ctx.strokeStyle = 'rgba(60,60,90,0.3)'; ctx.lineWidth = s*0.003;
          ctx.beginPath();
          ctx.moveTo(hx - hr*0.5, hy + s*0.04);
          ctx.quadraticCurveTo(hx, hy + s*0.06, hx + hr*0.5, hy + s*0.04);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hx - hr*0.4, hy + s*0.07);
          ctx.quadraticCurveTo(hx, hy + s*0.09, hx + hr*0.4, hy + s*0.07);
          ctx.stroke();
          // Headband across forehead (above eyes)
          ctx.fillStyle = '#2d2d4e';
          const hbY = hy - hr*0.35; // headband position above eyes
          ctx.beginPath();
          ctx.moveTo(hx - hr*0.95, hbY - s*0.02);
          ctx.lineTo(hx + hr*0.95, hbY - s*0.02);
          ctx.lineTo(hx + hr*0.95, hbY + s*0.03);
          ctx.lineTo(hx - hr*0.95, hbY + s*0.03);
          ctx.closePath(); ctx.fill();
          // Metal forehead plate on headband
          ctx.fillStyle = '#6b7280';
          roundRectPath(ctx, hx - s*0.05, hbY - s*0.015, s*0.10, s*0.04, 2);
          ctx.fill();
          // Plate engraving line
          ctx.strokeStyle = 'rgba(200,200,200,0.4)'; ctx.lineWidth = s*0.004;
          ctx.beginPath();
          ctx.moveTo(hx - s*0.025, hbY + s*0.005);
          ctx.lineTo(hx + s*0.025, hbY + s*0.005);
          ctx.stroke();
          // Plate shine
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(hx - s*0.04, hbY - s*0.012, s*0.03, s*0.015);
          // Headband knot at back (trailing tails)
          ctx.fillStyle = '#1a1a2e';
          // Tail 1
          ctx.beginPath();
          ctx.moveTo(hx + hr*0.90, hbY);
          ctx.quadraticCurveTo(hx + hr*1.3, hbY - s*0.03, hx + hr*1.4, hbY + s*0.04);
          ctx.lineTo(hx + hr*1.35, hbY + s*0.06);
          ctx.quadraticCurveTo(hx + hr*1.15, hbY, hx + hr*0.90, hbY + s*0.01);
          ctx.closePath(); ctx.fill();
          // Tail 2
          ctx.beginPath();
          ctx.moveTo(hx + hr*0.90, hbY + s*0.01);
          ctx.quadraticCurveTo(hx + hr*1.2, hbY + s*0.02, hx + hr*1.30, hbY + s*0.10);
          ctx.lineTo(hx + hr*1.25, hbY + s*0.12);
          ctx.quadraticCurveTo(hx + hr*1.05, hbY + s*0.04, hx + hr*0.90, hbY + s*0.02);
          ctx.closePath(); ctx.fill();
          break;
        case 'pirate':
          // Eye patch — leather with stitching
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.ellipse(hx - s*0.08, hy, s*0.065, s*0.055, 0.1, 0, Math.PI*2); ctx.fill();
          // Patch border
          ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = s*0.008;
          ctx.beginPath(); ctx.ellipse(hx - s*0.08, hy, s*0.065, s*0.055, 0.1, 0, Math.PI*2); ctx.stroke();
          // Stitch lines on the patch
          ctx.strokeStyle = '#555'; ctx.lineWidth = s*0.004;
          ctx.beginPath(); ctx.moveTo(hx - s*0.08, hy - s*0.04); ctx.lineTo(hx - s*0.08, hy + s*0.04); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(hx - s*0.12, hy); ctx.lineTo(hx - s*0.04, hy); ctx.stroke();
          // Skull & crossbones on patch
          ctx.fillStyle = '#aaa';
          ctx.beginPath(); ctx.arc(hx - s*0.08, hy - s*0.005, s*0.015, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#666';
          ctx.fillRect(hx - s*0.105, hy + s*0.01, s*0.05, s*0.006);
          // Strap — leather band going over head
          ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = s*0.018;
          ctx.beginPath();
          ctx.moveTo(hx - s*0.08, hy - s*0.05);
          ctx.quadraticCurveTo(hx + s*0.02, hy - hr - s*0.06, hx + s*0.14, hy - s*0.02);
          ctx.stroke();
          // Strap edge highlight
          ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = s*0.006;
          ctx.beginPath();
          ctx.moveTo(hx - s*0.08, hy - s*0.05);
          ctx.quadraticCurveTo(hx + s*0.02, hy - hr - s*0.07, hx + s*0.14, hy - s*0.02);
          ctx.stroke();
          // Strap buckle
          ctx.fillStyle = '#c9952a';
          roundRectPath(ctx, hx + s*0.10, hy - s*0.035, s*0.04, s*0.035, 1);
          ctx.fill();
          ctx.fillStyle = '#a07820';
          ctx.fillRect(hx + s*0.115, hy - s*0.025, s*0.01, s*0.02);
          break;
        case 'tiara':
          ctx.fillStyle = '#f0abfc';
          ctx.beginPath();
          ctx.moveTo(hx - s*0.16, hy - hr + s*0.02);
          ctx.lineTo(hx - s*0.12, hy - hr - s*0.1);
          ctx.lineTo(hx - s*0.06, hy - hr - s*0.04);
          ctx.lineTo(hx, hy - hr - s*0.15);
          ctx.lineTo(hx + s*0.06, hy - hr - s*0.04);
          ctx.lineTo(hx + s*0.12, hy - hr - s*0.1);
          ctx.lineTo(hx + s*0.16, hy - hr + s*0.02);
          ctx.closePath(); ctx.fill();
          // Centre gem
          ctx.fillStyle = '#ec4899';
          ctx.beginPath(); ctx.arc(hx, hy - hr - s*0.08, s*0.02, 0, Math.PI*2); ctx.fill();
          // Side gems
          ctx.fillStyle = '#a78bfa';
          ctx.beginPath(); ctx.arc(hx - s*0.1, hy - hr - s*0.04, s*0.015, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(hx + s*0.1, hy - hr - s*0.04, s*0.015, 0, Math.PI*2); ctx.fill();
          break;
        case 'starbadge':
          // Gold star badge with depth, shine, and pin
          const sx3 = hx + s*0.14, sy3 = hy - s*0.02;
          const badgeR = s*0.07;
          // Badge shadow
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI/2 + i * Math.PI*2/5;
            const ai = a + Math.PI/5;
            ctx.lineTo(sx3 + 1 + Math.cos(a)*badgeR, sy3 + 1 + Math.sin(a)*badgeR);
            ctx.lineTo(sx3 + 1 + Math.cos(ai)*badgeR*0.42, sy3 + 1 + Math.sin(ai)*badgeR*0.42);
          }
          ctx.closePath(); ctx.fill();
          // Star body — gradient gold
          const starGrad = ctx.createRadialGradient(sx3 - s*0.015, sy3 - s*0.015, 0, sx3, sy3, badgeR);
          starGrad.addColorStop(0, '#ffe066');
          starGrad.addColorStop(0.5, '#fbbf24');
          starGrad.addColorStop(1, '#d97706');
          ctx.fillStyle = starGrad;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI/2 + i * Math.PI*2/5;
            const ai = a + Math.PI/5;
            ctx.lineTo(sx3 + Math.cos(a)*badgeR, sy3 + Math.sin(a)*badgeR);
            ctx.lineTo(sx3 + Math.cos(ai)*badgeR*0.42, sy3 + Math.sin(ai)*badgeR*0.42);
          }
          ctx.closePath(); ctx.fill();
          // Star outline
          ctx.strokeStyle = '#b45309'; ctx.lineWidth = s*0.006;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI/2 + i * Math.PI*2/5;
            const ai = a + Math.PI/5;
            ctx.lineTo(sx3 + Math.cos(a)*badgeR, sy3 + Math.sin(a)*badgeR);
            ctx.lineTo(sx3 + Math.cos(ai)*badgeR*0.42, sy3 + Math.sin(ai)*badgeR*0.42);
          }
          ctx.closePath(); ctx.stroke();
          // Centre circle
          ctx.fillStyle = '#d97706';
          ctx.beginPath(); ctx.arc(sx3, sy3, badgeR * 0.25, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#92400e'; ctx.lineWidth = s*0.004;
          ctx.beginPath(); ctx.arc(sx3, sy3, badgeR * 0.25, 0, Math.PI * 2); ctx.stroke();
          // Shine highlight
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.moveTo(sx3 - s*0.02, sy3 - badgeR * 0.6);
          ctx.quadraticCurveTo(sx3, sy3 - badgeR * 0.4, sx3 + s*0.01, sy3 - badgeR * 0.3);
          ctx.quadraticCurveTo(sx3 - s*0.01, sy3 - badgeR * 0.4, sx3 - s*0.02, sy3 - badgeR * 0.6);
          ctx.closePath(); ctx.fill();
          // Pin on back (small line)
          ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = s*0.006;
          ctx.beginPath(); ctx.moveTo(sx3, sy3 + badgeR * 0.6); ctx.lineTo(sx3 + s*0.02, sy3 + badgeR * 0.9); ctx.stroke();
          break;
      }
    }

