    /* ═══════════════════════════════
       Canvas Pet — 2D wander + drawing
       ═══════════════════════════════ */
    let petAnimFrame = null;
    let petStates = {};
    let _selectedPetId = null; // Currently selected pet for status bar
    let _petDragCleanup = null; // Removes window drag listeners from a previous init

    function getPetState(id, idx, petInst) {
      if (!petStates[id]) {
        // Start from the last dropped position if the pet was dragged before,
        // but the pet still wanders freely afterwards (no permanent parking).
        const hasDropPos = petInst && petInst.posX != null && petInst.posY != null;
        petStates[id] = {
          x: hasDropPos ? petInst.posX : 0.15 + idx * 0.25,
          y: hasDropPos ? petInst.posY : 0.75 + Math.random() * 0.08,
          tx: 0.5, ty: 0.78,
          speed: 0.0004, nextWander: 0, facingRight: true,
          action: null, actionEnd: 0, actionCooldown: 0,
          vx: 0, vy: 0,
          pauseUntil: 0,
          idlePhase: Math.random() * Math.PI * 2,
          stopped: false, // When true, pet stops for status bar
          parked: false   // Dragging only repositions; pet keeps walking after drop
        };
      }
      return petStates[id];
    }

    const PET_ACTIONS = {
      cat:     ['groom', 'stretch', 'nap', 'yawn', 'sleep', 'pawlick', 'tailflick', 'headtilt', 'knead'],
      dog:     ['sit', 'pant', 'scratch', 'playbow', 'sleep', 'tailwag', 'headtilt', 'shake', 'sniff'],
      bunny:   ['sniff', 'hop', 'standup', 'eartwitch', 'sleep', 'nosewiggle', 'binky', 'flop', 'groom'],
      hamster: ['stuff', 'groom', 'spin', 'sleep', 'wash', 'peek', 'dig', 'stretch'],
      fox:     ['pounce', 'yawn', 'crouch', 'sneak', 'sleep', 'tailflick', 'headtilt', 'stretch', 'dig'],
      panda:   ['eat', 'roll', 'wave', 'sit', 'sleep', 'stretch', 'yawn', 'headtilt', 'tumble'],
      goose:   ['sleep', 'stretch', 'yawn', 'headtilt', 'groom', 'sit']
    };

    let _lastPetAction = {};
    function pickAction(type) {
      const acts = PET_ACTIONS[type] || PET_ACTIONS.cat;
      // Avoid repeating the same action twice in a row
      let choice;
      do { choice = acts[Math.floor(Math.random() * acts.length)]; }
      while (choice === _lastPetAction[type] && acts.length > 1);
      _lastPetAction[type] = choice;
      return choice;
    }

    function startPetAnimation(pets) {
      cancelAnimationFrame(petAnimFrame);
      const cvs = document.getElementById('petCanvas');
      if (!cvs) return;
      const room = cvs.parentElement.parentElement;
      let rw = room.clientWidth, rh = room.clientHeight;
      cvs.width = rw; cvs.height = rh;
      const ctx = cvs.getContext('2d');

      // Ensure each pet has a state (keyed by instance ID).
      // Look up the real pet instance so a previously dropped position is restored.
      pets.forEach((p, i) => getPetState(p.id, i, getPet(p.id)));

      // Remove drag listeners from a previous animation init (avoids leaks)
      if (_petDragCleanup) { _petDragCleanup(); _petDragCleanup = null; }

      // ── Drag-and-drop: let the owner pick up a pet and drop it anywhere ──
      let _dragPetId = null;      // pet currently being dragged
      let _dragMoved = false;     // became a real drag (vs a click)
      let _dragSuppressClick = false;

      function _canvasPos(e) {
        const rect = cvs.getBoundingClientRect();
        const src = e.touches && e.touches[0] ? e.touches[0] : e;
        return {
          x: (src.clientX - rect.left) / rect.width,
          y: (src.clientY - rect.top) / rect.height
        };
      }

      function _petAt(nx, ny) {
        let closest = null, closestDist = Infinity;
        for (const p of pets) {
          const st = petStates[p.id];
          if (!st) continue;
          const dx = st.x - nx, dy = (st.y - 0.04) - ny;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.13 && dist < closestDist) { closestDist = dist; closest = p; }
        }
        return closest;
      }

      function onPetPointerDown(e) {
        if (viewingUid !== currentUid) return; // can only drag your own pets
        if (selectedFood || selectedToy || selectedDrink) return; // feeding mode
        const pos = _canvasPos(e);
        const p = _petAt(pos.x, pos.y);
        if (!p) return;
        _dragPetId = p.id;
        _dragMoved = false;
        // Block browser native drag & prevent the event reaching any element behind the canvas
        e.preventDefault();
        e.stopPropagation();
      }

      function onPetPointerMove(e) {
        if (!_dragPetId) return;
        const st = petStates[_dragPetId];
        if (!st) return;
        const pos = _canvasPos(e);
        if (!_dragMoved) {
          _dragMoved = true;
          st.dragging = true;
        }
        // Always suppress scroll/native-drag while dragging a pet
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        st.x = Math.max(0.02, Math.min(0.98, pos.x));
        st.y = Math.max(0.10, Math.min(0.96, pos.y));
        st.vx = 0; st.vy = 0;
      }

      function onPetPointerUp(e) {
        if (!_dragPetId) return;
        const st = petStates[_dragPetId];
        const petInst = getPet(_dragPetId);
        if (_dragMoved && st && petInst && viewingUid === currentUid) {
          // Move the pet to the dropped spot, then let it keep wandering from there.
          petInst.posX = st.x;
          petInst.posY = st.y;
          petInst.parked = false;
          st.parked = false;
          st.dragging = false;
          st.nextWander = 0;          // pick a fresh wander target right away
          _dragSuppressClick = true;  // prevent the trailing click from feeding/status
          saveRoom();
          if (e && e.cancelable) e.preventDefault();
          e.stopPropagation();
        }
        _dragPetId = null;
        _dragMoved = false;
      }

      cvs.addEventListener('mousedown', onPetPointerDown);
      window.addEventListener('mousemove', onPetPointerMove);
      window.addEventListener('mouseup', onPetPointerUp);
      // Use { passive: false } so preventDefault() can block native touch drag/scroll
      cvs.addEventListener('touchstart', onPetPointerDown, { passive: false });
      window.addEventListener('touchmove', onPetPointerMove, { passive: false });
      window.addEventListener('touchend', onPetPointerUp);
      // Cleanup so a future re-init doesn't stack duplicate window listeners
      _petDragCleanup = function() {
        window.removeEventListener('mousemove', onPetPointerMove);
        window.removeEventListener('mouseup', onPetPointerUp);
        window.removeEventListener('touchmove', onPetPointerMove);
        window.removeEventListener('touchend', onPetPointerUp);
      };

      // Pet click handler — feed/play if item selected, otherwise show status bar
      cvs.onclick = function(e) {
        if (_dragSuppressClick) { _dragSuppressClick = false; return; } // ignore click right after a drag
        const rect = cvs.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;
        let closestPet = null;
        let closestDist = Infinity;
        for (const p of pets) {
          const st = petStates[p.id];
          if (!st) continue;
          const dx = st.x - clickX;
          const dy = st.y - clickY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.12 && dist < closestDist) {
            closestDist = dist;
            closestPet = p;
          }
        }
        if (closestPet) {
          // If food or toy is selected, feed/play instead of showing status bar
          if (selectedFood) {
            feedPet(selectedFood, closestPet.id);
            selectedFood = null;
            document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
            e.stopPropagation();
            return;
          }
          if (selectedToy) {
            useToy(selectedToy, closestPet.id);
            selectedToy = null;
            document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
            e.stopPropagation();
            return;
          }
          if (selectedDrink) {
            drinkPet(selectedDrink, closestPet.id);
            selectedDrink = null;
            document.querySelectorAll('.food-card').forEach(c => c.classList.remove('selected'));
            e.stopPropagation();
            return;
          }
          // No item selected — toggle status bar
          if (_selectedPetId === closestPet.id) {
            closePetStatus();
          } else {
            if (_selectedPetId && petStates[_selectedPetId]) petStates[_selectedPetId].stopped = false;
            _selectedPetId = closestPet.id;
            petStates[closestPet.id].stopped = true;
            showPetStatus(closestPet.id);
          }
          e.stopPropagation();
        } else {
          closePetStatus();
        }
      };

      let _lastPetFrame = 0;
      function frame(t) {
        if (t - _lastPetFrame < 33) { petAnimFrame = requestAnimationFrame(frame); return; }
        _lastPetFrame = t;
        const nw = room.clientWidth, nh = room.clientHeight;
        if (nw && nh && (nw !== rw || nh !== rh)) {
          rw = nw; rh = nh; cvs.width = rw; cvs.height = rh;
        }
        ctx.clearRect(0, 0, rw, rh);
        const now = Date.now();

        for (const p of pets) { try {
          const st = petStates[p.id];
          // Read hunger/affection from pet instance in roomData
          const petInst = getPet(p.id);
          const hunger = petInst ? (petInst.hunger ?? 100) : (p.hunger ?? 100);
          let moving = false;
          let actionProgress = -1;
          let currentAction = null;
          const color = petInst ? petInst.color : p.color;

          // If pet is stopped (status bar open) or being dragged, don't wander or act
          if (st.stopped || st.dragging) {
            moving = false;
            st.vx = 0; st.vy = 0;
          } else {
            // Action system
            if (st.action && now < st.actionEnd) {
              currentAction = st.action;
              const dur = st.actionDur || 2500;
              actionProgress = (now - (st.actionEnd - dur)) / dur;
              actionProgress = Math.max(0, Math.min(1, actionProgress));
            } else {
              if (st.action) {
                st.action = null;
                st.actionCooldown = now + 4000 + Math.random() * 5000;
              }
              if (!st.action && now > st.actionCooldown && Math.random() < 0.008) {
                st.action = pickAction(p.type);
                if (st.action === 'sleep' || st.action === 'nap' || st.action === 'flop') {
                  st.actionDur = 5000 + Math.random() * 3000;
                } else if (st.action === 'yawn' || st.action === 'headtilt' || st.action === 'peek' || st.action === 'nosewiggle') {
                  st.actionDur = 1500 + Math.random() * 1000;
                } else if (st.action === 'binky' || st.action === 'tumble' || st.action === 'shake') {
                  st.actionDur = 1800 + Math.random() * 800;
                } else {
                  st.actionDur = 2200 + Math.random() * 1200;
                }
                st.actionEnd = now + st.actionDur;
              }

              // Wander
              if (now > st.nextWander) {
                st.tx = 0.06 + Math.random() * 0.60;
                st.ty = 0.72 + Math.random() * 0.18;
                st.nextWander = now + 4000 + Math.random() * 6000;
                if (Math.random() < 0.35) {
                  st.pauseUntil = now + 800 + Math.random() * 1500;
                }
              }

              if (now < st.pauseUntil) {
                moving = false;
                st.vx *= 0.9; st.vy *= 0.9;
              } else {
                const dx = st.tx - st.x;
                const dy = st.ty - st.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const wantMove = dist > 0.005;

                if (wantMove) {
                  const maxSpeed = st.speed * (hunger > 30 ? 1 : 0.5);
                  const easeIn = 0.08;
                  const decelDist = 0.08;
                  const speedMult = dist < decelDist ? (dist / decelDist) * 0.6 + 0.4 : 1;
                  const targetVx = (dx / dist) * maxSpeed * speedMult * 16;
                  const targetVy = (dy / dist) * maxSpeed * speedMult * 16;
                  st.vx += (targetVx - st.vx) * easeIn;
                  st.vy += (targetVy - st.vy) * easeIn;
                  st.x += st.vx;
                  st.y += st.vy;
                  moving = true;
                  if (Math.abs(dx) > 0.01) st.facingRight = dx > 0;
                } else {
                  st.vx *= 0.85;
                  st.vy *= 0.85;
                  st.x += st.vx;
                  st.y += st.vy;
                  moving = Math.abs(st.vx) > 0.00005 || Math.abs(st.vy) > 0.00005;
                }
              }
            }
          }

          // Parked/dragged pets may be placed anywhere; others stay on the floor
          if (st.parked || st.dragging) {
            st.x = Math.max(0.02, Math.min(0.98, st.x));
            st.y = Math.max(0.10, Math.min(0.96, st.y));
          } else {
            st.x = Math.max(0.04, Math.min(0.70, st.x));
            st.y = Math.max(0.70, Math.min(0.92, st.y));
          }

          const px = st.x * rw;
          const py = st.y * rh;
          const depthScale = Math.max(0.4, 0.6 + (st.y - 0.6) * 2.0);
          const baseSize = PET_SIZES[p.type] || 44;
          const size = baseSize * depthScale;

          ctx.save();
          ctx.translate(px, py);
          ctx.scale(st.facingRight ? depthScale : -depthScale, depthScale);

          let bob = 0;
          let legPhase = 0;
          if (moving) {
            const walkSpeed = Math.sqrt(st.vx * st.vx + st.vy * st.vy) * 800;
            bob = Math.sin(t / 100) * (1.5 + walkSpeed * 0.5);
            legPhase = t / 100;
          } else {
            bob = Math.sin(t / 800 + st.idlePhase) * 0.8;
            ctx.rotate(Math.sin(t / 1200 + st.idlePhase) * 0.015);
          }
          ctx.translate(0, bob);

          if (currentAction && actionProgress >= 0) {
            applyActionTransform(ctx, p.type, currentAction, actionProgress, size, t);
          }

          // Draw back-layer accessories (cape, wings) behind the pet
          const accId = petInst ? petInst.accessory : null;
          if (accId) drawPetAccessory(ctx, p.type, accId, size, 'back');
          drawPetCanvas(ctx, p.type, size, legPhase, moving, hunger, t, currentAction, actionProgress, color);
          // Draw front-layer accessories on top of the pet
          if (accId) drawPetAccessory(ctx, p.type, accId, size, 'front');
          ctx.restore();

          // Action floating effects
          if (currentAction && actionProgress >= 0) {
            ctx.save();
            drawActionEffect(ctx, px, py, size, depthScale, p.type, currentAction, actionProgress, t);
            ctx.restore();
          }

          // Hunger bar above pet
          const barW = 52 * depthScale;
          const barH = 6 * depthScale;
          const barX = px - barW / 2;
          const barY = py - size * 1.5;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          roundRectPath(ctx, barX, barY, barW, barH, 3);
          ctx.fill();
          const hColor = hunger > 50 ? '#34d399' : hunger > 20 ? '#fbbf24' : '#f87171';
          ctx.fillStyle = hColor;
          roundRectPath(ctx, barX, barY, barW * (hunger / 100), barH, 3);
          ctx.fill();

          // Hunger percentage
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = 'bold ' + Math.round(8 * depthScale) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(Math.round(hunger) + '%', px, barY + barH + 10 * depthScale);

          // Pet name (from instance)
          const petName = petInst ? petInst.name : (PETS.find(x => x.id === p.type)?.name || 'Pet');
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = 'bold ' + Math.round(10 * depthScale) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(petName, px, barY - 12 * depthScale);

          // Affection + title
          const aff = petInst ? (petInst.affection ?? 0) : 0;
          const affTitle = getAffectionTitle(aff);
          ctx.fillStyle = 'rgba(255,150,180,0.9)';
          ctx.font = Math.round(7 * depthScale) + 'px sans-serif';
          ctx.fillText('♥ ' + aff + '  ' + affTitle.title, px, barY - 2 * depthScale);

          // Selection highlight
          if (_selectedPetId === p.id) {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.arc(px, py - size * 0.3, size * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } catch(e) { ctx.restore(); } }

        petAnimFrame = requestAnimationFrame(frame);
      }
      petAnimFrame = requestAnimationFrame(frame);
    }

    /* ── Pet Status Bar ── */
    function showPetStatus(petId) {
      _selectedPetId = petId;
      const bar = document.getElementById('petStatusBar');
      bar.style.display = 'block';
      updatePetStatusBar();
    }

    function closePetStatus() {
      if (_selectedPetId && petStates[_selectedPetId]) {
        petStates[_selectedPetId].stopped = false;
      }
      _selectedPetId = null;
      document.getElementById('petStatusBar').style.display = 'none';
    }

    function updatePetStatusBar() {
      if (!_selectedPetId) return;
      const pet = getPet(_selectedPetId);
      if (!pet) { closePetStatus(); return; }

      const nameInput = document.getElementById('petStatusName');
      nameInput.value = pet.name || '';
      nameInput.readOnly = viewingUid !== currentUid;

      const hunger = pet.hunger ?? 100;
      const hBar = document.getElementById('petStatusHunger');
      hBar.style.width = hunger + '%';
      hBar.style.background = hunger > 50 ? '#34d399' : hunger > 20 ? '#fbbf24' : '#f87171';
      document.getElementById('petStatusHungerVal').textContent = Math.round(hunger) + '%';

      const thirst = pet.thirst ?? 100;
      const tBar = document.getElementById('petStatusThirst');
      tBar.style.width = thirst + '%';
      tBar.style.background = thirst > 50 ? '#60a5fa' : thirst > 20 ? '#fbbf24' : '#f87171';
      document.getElementById('petStatusThirstVal').textContent = Math.round(thirst) + '%';

      const aff = pet.affection ?? 0;
      const ms = getAffectionTitle(aff);
      const maxAff = AFFECTION_MILESTONES[AFFECTION_MILESTONES.length - 1].min * 1.5 || 500;
      document.getElementById('petStatusAffection').style.width = Math.min(100, (aff / maxAff) * 100) + '%';
      document.getElementById('petStatusAffectionVal').textContent = '♥' + aff + ' ' + ms.title;

      // Color dots (owner only)
      const colorsEl = document.getElementById('petStatusColors');
      if (viewingUid !== currentUid) {
        colorsEl.innerHTML = '';
      } else {
        const colors = PET_COLORS[pet.type];
        if (colors && colors.length) {
          colorsEl.innerHTML = colors.map(c =>
            '<div onclick="setPetColor(\'' + pet.id + '\',\'' + c.key + '\')" title="' + c.name + '" style="' +
            'width:20px;height:20px;border-radius:50%;background:' + (c.body || c.key) + ';cursor:pointer;' +
            'border:2px solid ' + (c.key === pet.color ? '#fff' : 'rgba(255,255,255,0.2)') + ';' +
            'box-shadow:' + (c.key === pet.color ? '0 0 6px rgba(255,255,255,0.5)' : 'none') +
            '"></div>'
          ).join('');
        } else {
          colorsEl.innerHTML = '';
        }
      }

      // Pet tricks — show unlocked tricks right inside the status panel
      const tricksWrap = document.getElementById('petStatusTricks');
      const tricksBtns = document.getElementById('petStatusTricksBtns');
      if (tricksWrap && tricksBtns) {
        const tricks = (typeof PET_TRICKS !== 'undefined' && PET_TRICKS[pet.type]) || [];
        if (tricks.length) {
          tricksWrap.style.display = 'block';
          tricksBtns.innerHTML = tricks.map(tr => {
            const unlocked = aff >= tr.minAffection;
            return '<button onclick="triggerPetTrick(\'' + pet.id + '\',\'' + tr.id + '\')" ' +
              (unlocked ? '' : 'disabled') + ' style="font-size:10px;padding:5px 9px;border-radius:8px;cursor:' +
              (unlocked ? 'pointer' : 'not-allowed') + ';border:1px solid rgba(255,255,255,0.15);' +
              'background:' + (unlocked ? 'rgba(255,138,171,0.18)' : 'rgba(255,255,255,0.05)') + ';' +
              'color:' + (unlocked ? '#ff8aab' : 'rgba(255,255,255,0.35)') + '">' +
              tr.name + (unlocked ? '' : ' ♥' + tr.minAffection) + '</button>';
          }).join('');
        } else {
          tricksWrap.style.display = 'none';
          tricksBtns.innerHTML = '';
        }
      }
    }

    let _petNameTimer = null;
    function onPetNameChange(val) {
      if (viewingUid !== currentUid) return;
      if (!_selectedPetId) return;
      const pet = getPet(_selectedPetId);
      if (!pet) return;
      pet.name = val.trim() || PETS.find(p => p.id === pet.type)?.name || 'Pet';
      clearTimeout(_petNameTimer);
      _petNameTimer = setTimeout(() => {
        _lastPetKey = ''; // Force canvas to pick up new name
        saveRoom();
      }, 600);
    }

    function roundRectPath(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    /* ── Action body transforms ── */
    function applyActionTransform(ctx, type, action, ap, s, t) {
      const ease = Math.sin(ap * Math.PI); // 0→1→0 bell curve
      switch (action) {
        // ── Shared-ish poses ──
        case 'nap': case 'sleep': {
          // Lie down: tilt sideways, squish flat, gentle breathing
          const settle = Math.min(1, ap * 5); // quick settle into pose (first 20%)
          const breath = Math.sin(t / 600) * 0.02 * settle; // gentle breathing
          ctx.translate(0, s * 0.15 * settle); // sink lower
          ctx.rotate(0.25 * settle);           // tilt to lie on side
          ctx.scale(1.12 + breath, 0.75 - breath * 0.5); // flatten wide + breathe
          break;
        }
        case 'stretch':
          ctx.scale(1 + 0.18 * ease, 1 - 0.06 * ease);
          break;
        case 'yawn':
          ctx.rotate(Math.sin(ap * Math.PI * 2) * 0.04);
          break;
        case 'sit':
          ctx.translate(0, s * 0.05 * ease);
          ctx.rotate(-0.08 * ease);
          break;
        case 'hop':
          ctx.translate(0, -s * 0.35 * Math.sin(ap * Math.PI));
          break;
        case 'spin': case 'roll':
          ctx.rotate(ap * Math.PI * 2);
          break;
        case 'pounce':
          if (ap < 0.4) {
            ctx.translate(0, s * 0.1 * (ap / 0.4));
            ctx.scale(1 + 0.08 * (ap / 0.4), 1 - 0.1 * (ap / 0.4));
          } else {
            const jump = (ap - 0.4) / 0.6;
            ctx.translate(0, -s * 0.4 * Math.sin(jump * Math.PI));
          }
          break;
        case 'playbow':
          ctx.rotate(0.15 * ease);
          ctx.translate(0, s * 0.04 * ease);
          break;
        case 'scratch':
          ctx.rotate(Math.sin(t / 60) * 0.08 * ease);
          break;
        case 'pant':
          ctx.translate(0, Math.sin(t / 80) * s * 0.02);
          break;
        case 'standup':
          ctx.rotate(-0.3 * ease);
          ctx.translate(0, -s * 0.15 * ease);
          break;
        case 'sniff': case 'eartwitch':
          ctx.translate(Math.sin(t / 50) * s * 0.01 * ease, 0);
          break;
        case 'stuff':
          ctx.scale(1 + 0.06 * ease, 1 + 0.08 * ease); // inflate
          break;
        case 'groom':
          ctx.rotate(-0.06 * ease);
          break;
        case 'crouch': case 'sneak':
          ctx.translate(0, s * 0.06 * ease);
          ctx.scale(1 + 0.08 * ease, 1 - 0.12 * ease);
          break;
        case 'wave':
          ctx.rotate(Math.sin(t / 150) * 0.06 * ease);
          break;
        case 'eat':
          ctx.translate(Math.sin(t / 200) * s * 0.01, 0);
          break;
        // ── New natural actions ──
        case 'pawlick': {
          const lick = Math.sin(ap * Math.PI * 4) * 0.04;
          ctx.rotate(-0.12 * ease);
          ctx.translate(s * 0.03 * ease, s * 0.05 * ease);
          ctx.rotate(lick);
          break;
        }
        case 'tailflick': {
          ctx.rotate(Math.sin(t / 80 + ap * 8) * 0.06 * ease);
          break;
        }
        case 'headtilt': {
          const tilt = Math.sin(ap * Math.PI) * 0.18;
          ctx.rotate(tilt);
          ctx.translate(0, -s * 0.02 * ease);
          break;
        }
        case 'knead': {
          const k = Math.sin(ap * Math.PI * 6) * 0.03;
          ctx.translate(0, s * 0.04 * ease);
          ctx.scale(1 + k, 1 - k * 0.5);
          break;
        }
        case 'tailwag': {
          ctx.rotate(Math.sin(t / 50) * 0.1 * ease);
          ctx.translate(0, Math.abs(Math.sin(t / 100)) * s * 0.02 * ease);
          break;
        }
        case 'shake': {
          const shk = Math.sin(ap * Math.PI * 8) * 0.12 * (1 - ap);
          ctx.rotate(shk);
          break;
        }
        case 'nosewiggle': {
          ctx.translate(Math.sin(t / 40) * s * 0.015 * ease, 0);
          ctx.scale(1 + Math.sin(t / 60) * 0.02 * ease, 1);
          break;
        }
        case 'binky': {
          // Joyful jump with twist
          const jumpH = Math.sin(ap * Math.PI);
          ctx.translate(Math.sin(ap * Math.PI * 3) * s * 0.08, -s * 0.4 * jumpH);
          ctx.rotate(Math.sin(ap * Math.PI * 2) * 0.2);
          break;
        }
        case 'flop': {
          const settle = Math.min(1, ap * 3);
          ctx.translate(0, s * 0.12 * settle);
          ctx.rotate(0.35 * settle);
          ctx.scale(1.15, 0.78);
          break;
        }
        case 'wash': {
          ctx.rotate(Math.sin(t / 70) * 0.08 * ease);
          ctx.translate(0, s * 0.03 * ease);
          break;
        }
        case 'peek': {
          const peekUp = Math.sin(ap * Math.PI);
          ctx.translate(0, s * 0.08 * (1 - peekUp));
          ctx.scale(1, 0.85 + 0.15 * peekUp);
          break;
        }
        case 'dig': {
          ctx.translate(Math.sin(t / 40) * s * 0.02 * ease, s * 0.06 * ease);
          ctx.rotate(Math.sin(t / 60) * 0.06 * ease);
          ctx.scale(1, 1 - 0.08 * ease);
          break;
        }
        case 'tumble': {
          ctx.translate(s * 0.15 * ap - s * 0.075, -s * 0.2 * Math.sin(ap * Math.PI));
          ctx.rotate(ap * Math.PI * 1.5);
          break;
        }
      }
    }

    /* ── Action floating effects ── */
    function drawActionEffect(ctx, px, py, size, ds, type, action, ap, t) {
      const ease = Math.sin(ap * Math.PI);
      ctx.save();

      switch (action) {
        case 'nap': case 'sleep': {
          // Floating Z's — continuously visible, close to pet head
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const zCount = 3;
          const cycle = (t % 3000) / 3000; // 0→1 loop every 3s
          for (let i = 0; i < zCount; i++) {
            const phase = (cycle + i / zCount) % 1; // staggered
            const zy = py - size * 0.4 - phase * 30 * ds;
            const zx = px + (5 + i * 5) * ds + Math.sin(t / 500 + i * 2) * 3 * ds;
            const fadeIn = Math.min(1, phase * 4);
            const fadeOut = Math.max(0, 1 - (phase - 0.6) / 0.4);
            const alpha = fadeIn * fadeOut * 0.75 * ease;
            if (alpha <= 0) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(150,180,255,0.85)';
            ctx.font = 'bold ' + Math.round((11 + i * 4) * ds) + 'px sans-serif';
            ctx.fillText('z', zx, zy);
          }
          break;
        }
        case 'yawn': {
          // Sparkle/tear near mouth
          ctx.globalAlpha = ease * 0.5;
          ctx.fillStyle = '#88ccff';
          const tx = px + size * 0.5 * ((petStates[type]?.facingRight) ? 1 : -1);
          const ty = py - size * 0.1;
          ctx.beginPath(); ctx.arc(tx, ty, 2 * ds, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'groom': case 'stuff': {
          // Motion lines near face
          ctx.strokeStyle = 'rgba(200,200,200,0.4)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            const angle = -0.5 + i * 0.5 + Math.sin(t / 100) * 0.3;
            const fx = px + Math.cos(angle) * size * 0.6;
            const fy = py - size * 0.3 + Math.sin(angle) * size * 0.3;
            ctx.globalAlpha = ease * 0.4;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx + Math.cos(angle) * 6 * ds, fy + Math.sin(angle) * 6 * ds);
            ctx.stroke();
          }
          break;
        }
        case 'headtilt': {
          // Question mark / curiosity sparkle
          if (ease > 0.3) {
            ctx.globalAlpha = (ease - 0.3) * 0.7;
            ctx.fillStyle = '#f7c97e';
            ctx.font = 'bold ' + Math.round(14 * ds) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('?', px + size * 0.4, py - size * 0.45 - Math.sin(t / 400) * 3);
          }
          break;
        }
        case 'tailwag': case 'tailflick': {
          // Happy sparkles
          ctx.globalAlpha = ease * 0.4;
          const sparkleCount = 3;
          for (let i = 0; i < sparkleCount; i++) {
            const angle = (t / 300 + i * 2.1) % (Math.PI * 2);
            const dist = size * 0.55 + Math.sin(t / 200 + i) * 4;
            const sx = px + Math.cos(angle) * dist;
            const sy = py - size * 0.1 + Math.sin(angle) * dist * 0.5;
            ctx.fillStyle = 'rgba(255,220,100,0.6)';
            ctx.beginPath(); ctx.arc(sx, sy, 1.5 * ds, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'binky': case 'tumble': {
          // Joy lines radiating out
          ctx.strokeStyle = 'rgba(255,200,100,0.35)';
          ctx.lineWidth = 1;
          ctx.globalAlpha = ease * 0.5;
          for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 + t / 500;
            const r1 = size * 0.5, r2 = size * 0.7;
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(angle) * r1, py - size * 0.15 + Math.sin(angle) * r1 * 0.6);
            ctx.lineTo(px + Math.cos(angle) * r2, py - size * 0.15 + Math.sin(angle) * r2 * 0.6);
            ctx.stroke();
          }
          break;
        }
        case 'dig': {
          // Dirt particles
          ctx.globalAlpha = ease * 0.5;
          ctx.fillStyle = 'rgba(160,120,80,0.5)';
          for (let i = 0; i < 4; i++) {
            const dx = px + (Math.sin(t / 60 + i * 1.5)) * size * 0.3;
            const dy = py + size * 0.05 - Math.abs(Math.sin(t / 80 + i * 2)) * size * 0.2;
            ctx.beginPath(); ctx.arc(dx, dy, 2 * ds, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'knead': case 'pawlick': case 'wash': {
          // Soft motion lines
          ctx.strokeStyle = 'rgba(200,200,255,0.3)';
          ctx.lineWidth = 1;
          ctx.globalAlpha = ease * 0.4;
          for (let i = 0; i < 2; i++) {
            const mx = px + (i === 0 ? -1 : 1) * size * 0.25;
            const my = py + size * 0.1;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + Math.sin(t / 80 + i) * 4 * ds, my + 5 * ds);
            ctx.stroke();
          }
          break;
        }
        case 'shake': {
          // Water/fur droplets
          ctx.globalAlpha = ease * 0.5;
          ctx.fillStyle = 'rgba(150,200,255,0.5)';
          for (let i = 0; i < 5; i++) {
            const angle = (t / 40 + i * 1.3) % (Math.PI * 2);
            const r = size * (0.45 + ap * 0.3);
            ctx.beginPath();
            ctx.arc(px + Math.cos(angle) * r, py - size * 0.1 + Math.sin(angle) * r * 0.5, 1.5 * ds, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'flop': case 'peek': case 'nosewiggle':
          break; // Subtle — no extra effect needed
        case 'stretch': {
          // Stretch lines
          ctx.strokeStyle = 'rgba(255,220,150,0.3)';
          ctx.lineWidth = 1;
          ctx.globalAlpha = ease * 0.5;
          for (let i = 0; i < 4; i++) {
            const sy = py - size * 0.2 + i * size * 0.12;
            const dir = (i % 2 === 0) ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(px + dir * size * 0.5, sy);
            ctx.lineTo(px + dir * size * 0.7, sy);
            ctx.stroke();
          }
          break;
        }
        case 'hop': case 'pounce': {
          // Dust puffs below during jump
          if (ap > 0.05 && ap < 0.3) {
            ctx.globalAlpha = (0.3 - ap) * 2;
            ctx.fillStyle = 'rgba(180,160,130,0.3)';
            for (let i = 0; i < 3; i++) {
              const dx = px + (i - 1) * 8 * ds;
              const dy = py + size * 0.3;
              ctx.beginPath(); ctx.arc(dx, dy, (3 + i) * ds, 0, Math.PI * 2); ctx.fill();
            }
          }
          break;
        }
        case 'spin': case 'roll': {
          // Circular motion lines
          ctx.strokeStyle = 'rgba(200,200,200,0.25)';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = ease * 0.4;
          for (let i = 0; i < 3; i++) {
            const a = t / 200 + i * Math.PI * 0.7;
            const r = size * 0.8;
            ctx.beginPath();
            ctx.arc(px, py, r, a, a + 0.5);
            ctx.stroke();
          }
          break;
        }
        case 'sit': case 'wave': {
          // Floating heart
          if (ap > 0.3 && ap < 0.8) {
            ctx.globalAlpha = Math.sin((ap - 0.3) / 0.5 * Math.PI) * 0.6;
            ctx.fillStyle = '#ff6b8a';
            ctx.font = Math.round(11 * ds) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('♥', px + 15 * ds, py - size * 1.4 - (ap - 0.3) * 25 * ds);
          }
          break;
        }
        case 'scratch': {
          // Scratch lines near ear
          ctx.strokeStyle = 'rgba(200,180,150,0.35)';
          ctx.lineWidth = 1;
          ctx.globalAlpha = ease * 0.5;
          const earX = px + size * 0.3 * ((petStates[type]?.facingRight) ? -1 : 1);
          const earY = py - size * 0.8;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(earX + (i - 1) * 3 * ds, earY);
            ctx.lineTo(earX + (i - 1) * 3 * ds + Math.sin(t / 50) * 4, earY + 8 * ds);
            ctx.stroke();
          }
          break;
        }
        case 'pant': {
          // Drool drop
          if (ap > 0.3) {
            const dripY = py + size * 0.1 + (ap - 0.3) * 15 * ds;
            ctx.globalAlpha = Math.min(1, (ap - 0.3) * 2) * 0.4;
            ctx.fillStyle = '#88ccff';
            ctx.beginPath();
            const dripX = px + size * 0.35 * ((petStates[type]?.facingRight) ? 1 : -1);
            ctx.arc(dripX, dripY, 1.5 * ds, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'playbow': {
          // Exclamation
          if (ap > 0.2 && ap < 0.7) {
            ctx.globalAlpha = Math.sin((ap - 0.2) / 0.5 * Math.PI) * 0.6;
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold ' + Math.round(13 * ds) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', px + 18 * ds, py - size * 1.5);
          }
          break;
        }
        case 'sniff': case 'eartwitch': {
          // Question mark / curiosity
          if (ap > 0.2 && ap < 0.8) {
            ctx.globalAlpha = Math.sin((ap - 0.2) / 0.6 * Math.PI) * 0.5;
            ctx.fillStyle = '#ccc';
            ctx.font = Math.round(10 * ds) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('?', px + 14 * ds, py - size * 1.4);
          }
          break;
        }
        case 'standup': {
          // Sparkle stars
          ctx.fillStyle = 'rgba(255,230,100,0.5)';
          ctx.globalAlpha = ease * 0.5;
          for (let i = 0; i < 2; i++) {
            const sx = px + (i * 20 - 10) * ds + Math.sin(t / 300 + i) * 5;
            const sy = py - size * 1.6 - i * 8 * ds;
            drawStar(ctx, sx, sy, 3 * ds);
          }
          break;
        }
        case 'crouch': case 'sneak': {
          // Ellipsis (...) sneaking
          if (ap > 0.15 && ap < 0.85) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#aaa';
            ctx.font = Math.round(10 * ds) + 'px sans-serif';
            ctx.textAlign = 'center';
            const dots = '.'.repeat(1 + Math.floor((t / 300) % 3));
            ctx.fillText(dots, px + 16 * ds, py - size * 1.3);
          }
          break;
        }
        case 'eat': {
          // Crumbs falling
          ctx.fillStyle = 'rgba(120,160,80,0.4)';
          ctx.globalAlpha = ease * 0.5;
          for (let i = 0; i < 3; i++) {
            const cx = px + (Math.sin(t / 200 + i * 2) * 8 - 4) * ds;
            const cy = py - size * 0.2 + (ap * 30 + i * 6) * ds;
            ctx.beginPath(); ctx.arc(cx, cy, 1.5 * ds, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
      }
      ctx.restore();
    }

    function drawStar(ctx, x, y, r) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }

    /* ── Draw pet by type ── */
    function drawPetCanvas(ctx, type, size, legPhase, moving, hunger, t, action, ap, colorKey) {
      const pal = getPetPalette(type, colorKey);
      switch (type) {
        case 'cat':    drawCatPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal); break;
        case 'dog':    drawDogPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal); break;
        case 'bunny':  drawBunnyPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal); break;
        case 'hamster':drawHamsterPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal); break;
        case 'fox':    drawFoxPet(ctx, size, legPhase, moving, hunger, action, ap, t); break;
        case 'panda':  drawPandaPet(ctx, size, legPhase, moving, hunger, action, ap, t); break;
        case 'goose':  drawGoosePet(ctx, size, legPhase, moving, hunger, action, ap, t, pal); break;
        default:       drawCatPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
      }
    }

    /* Pet drawing functions loaded from pets/*.js */

