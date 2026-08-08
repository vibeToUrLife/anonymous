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
      // Tom: sit → wave → dance → a show-off backflip.
      tom:     [{ id: 'trick_sit', name: 'Sit', minAffection: 80 }, { id: 'trick_wave', name: 'Wave', minAffection: 250 }, { id: 'trick_dance', name: 'Dance', minAffection: 550 }, { id: 'trick_backflip', name: 'Backflip', minAffection: 1100 }],
      // Jerry: stand up → spin → a quick hop → dance.
      jerry:   [{ id: 'trick_stand', name: 'Stand Up', minAffection: 60 }, { id: 'trick_spin', name: 'Spin', minAffection: 200 }, { id: 'trick_binky', name: 'Hop', minAffection: 450 }, { id: 'trick_dance', name: 'Dance', minAffection: 800 }],
      // Capybara: sit → wave → dance. No roll and no spin — both are full 360°
      // rotations, and on sprite artwork that reads as a picture turning round.
      capybara:[{ id: 'trick_sit', name: 'Sit', minAffection: 80 }, { id: 'trick_wave', name: 'Wave', minAffection: 300 }, { id: 'trick_dance', name: 'Dance', minAffection: 700 }],
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
      const petName = petDisplayName(pet);
      showToast('🎪 ' + T('{name} does a trick!', { name: petName || T('Pet') }), 'success');
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
          '<canvas class="acc-preview-cvs" data-acc="' + acc.id + '" style="display:block;margin:0 auto 4px;width:60px;height:60px"></canvas>' +
          '<div class="acc-name">' + T(acc.name) + '</div>';
        if (isOwned) {
          html += '<div class="acc-price" style="color:#34d399">' + T('Owned') + '</div>';
          if (activePets.length) {
            html += '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">';
            activePets.forEach(pet => {
              const equipped = pet.accessory === acc.id;
              if (equipped) {
                html += '<button class="food-btn" style="font-size:11px;padding:8px 6px;background:rgba(239,68,68,.2);color:#f87171;width:100%;position:relative;z-index:5" onclick="window.removePetAcc(\'' + pet.id + '\');return false;">✕ ' + petDisplayName(pet) + '</button>';
              } else {
                html += '<button class="food-btn" style="font-size:11px;padding:8px 6px;width:100%;position:relative;z-index:5" onclick="window.equipPetAcc(\'' + pet.id + '\',\'' + acc.id + '\');return false;">' + petDisplayName(pet) + '</button>';
              }
            });
            html += '</div>';
          }
        } else {
          html += '<div class="acc-price" style="color:rgba(255,255,255,.35);font-size:11px">🎰 ' + T('Gacha Only') + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';

      // Pet Tricks section
      if (activePets.length) {
        html += '<div class="shop-section-title" style="margin-top:20px">🎪 ' + T('Pet Tricks') + '</div>';
        html += '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:10px;text-align:center">' + T('Pets learn tricks as affection grows!') + '</div>';
        activePets.forEach(pet => {
          const petDef = PETS.find(p => p.id === pet.type);
          const affection = pet.affection || 0;
          const tricks = PET_TRICKS[pet.type] || [];
          if (!tricks.length) return;
          html += '<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px">' + (petDef?.emoji || '') + ' ' + petDisplayName(pet) + ' (❤️ ' + affection + ')</div>';
          html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
          tricks.forEach(tr => {
            const unlocked = affection >= tr.minAffection;
            html += '<button class="food-btn" style="font-size:10px;' + (unlocked ? '' : 'opacity:.4;cursor:not-allowed') + '" ' +
              (unlocked ? 'onclick="window.triggerPetTrick(\'' + pet.id + '\',\'' + tr.id + '\');return false;"' : 'disabled') +
              '>' + T(tr.name) + (unlocked ? '' : ' (❤️' + tr.minAffection + ')') + '</button>';
          });
          html += '</div></div>';
        });
      }
      el.innerHTML = html;

      // Draw accessory previews on canvases
      el.querySelectorAll('.acc-preview-cvs').forEach(cvs => {
        // The CSS box these are pinned to; the buffer behind it is bigger by the
        // screen's pixel ratio, which is what keeps the little preview crisp.
        fitCanvas(cvs, 60, 60);
        drawAccessoryPreview(cvs.getContext('2d'), cvs.dataset.acc, 60);
      });
    }

    async function buyAccessory(accId) {
      return showToast(T('Accessories can only be obtained from Gacha!'), 'error');
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
      showToast(T('Accessory removed!'), 'success');
    }

    // Expose accessory functions to window for onclick handlers
    window.removePetAcc = removePetAcc;
    window.equipPetAcc = equipPetAcc;
    window.buyAccessory = buyAccessory;
    window.triggerPetTrick = triggerPetTrick;

    // Draw accessory on pet canvas — offset to each pet's actual head position
    const PET_HEAD_OFFSETS = {
      /* Cat, dog, bunny and panda come from artwork (pets/img/*.png) and change
         pose: they walk side-on, idle sitting and facing you, and sleep curled
         up. The head moves half a body between those, so one anchor cannot
         serve all three — these carry a set instead, and the caller says which
         pose is showing. Each was read off the packed sheet, not from path
         geometry: hy is the centre of the skull's box with the ears left out,
         and r is about half its width, so a hat lands on the crown. */
      // `side` is the average across both walk cells — the head bobs a
      // little between them, and a hat pinned to one rides high or low in the other.
      cat: {
        front: { hx:  0.01, hy: -0.47, r: 0.25 },
        side:  { hx:  0.43, hy: -0.30, r: 0.22 },
        sleep: { hx:  0.40, hy:  0.00, r: 0.22 },
      },
      dog: {
        front: { hx:  0.00, hy: -0.51, r: 0.27 },
        side:  { hx:  0.45, hy: -0.31, r: 0.22 },
        sleep: { hx:  0.41, hy:  0.01, r: 0.22 },
      },
      /* Bunny's ears are excluded on purpose: they are half its height, and an
         anchor that covered them would hang a hat in mid-air above the skull.
         A hat lands at the ear bases instead, which is where one sits on a
         rabbit anyway. */
      bunny: {
        front: { hx:  0.00, hy: -0.33, r: 0.22 },
        side:  { hx:  0.28, hy: -0.20, r: 0.20 },
        sleep: { hx:  0.26, hy:  0.05, r: 0.23 },
      },
      panda: {
        front: { hx:  0.00, hy: -0.34, r: 0.29 },
        side:  { hx:  0.45, hy: -0.23, r: 0.24 },
        sleep: { hx:  0.28, hy:  0.04, r: 0.27 },
      },
      fox: {
        // Slightly left of centre because the packer centres each cell on its
        // centre of mass, and that tail is heavy — the fox's head is not over
        // the middle of its own picture.
        front: { hx: -0.03, hy: -0.32, r: 0.25 },
        side:  { hx:  0.43, hy: -0.29, r: 0.18 },
        sleep: { hx:  0.20, hy:  0.09, r: 0.24 },
      },
      /* The hamster has no neck to speak of, so "head" here is the front third
         of the ball: hy splits the difference between the eye line, where the
         glasses go, and a crown high enough for the hat to clear the ears. */
      hamster: {
        front: { hx:  0.00, hy: -0.45, r: 0.35 },
        side:  { hx:  0.41, hy: -0.30, r: 0.22 },
        // Asleep the hamster's back rises higher than its head, so r is read off
        // the head alone — measured against the mound the hat floats over it.
        sleep: { hx:  0.34, hy:  0.09, r: 0.19 },
      },
      /* Goose's head is small and rides high on a long neck, so its anchor is
         nearly a body-length above the others' — and it swings furthest between
         poses, from -0.84 standing to +0.13 with the head tucked in asleep. */
      goose: {
        front: { hx:  0.00, hy: -0.84, r: 0.14 },
        side:  { hx:  0.24, hy: -0.83, r: 0.14 },
        sleep: { hx:  0.41, hy:  0.13, r: 0.19 },
      },
      /* Tom comes from artwork (pets/img/tom.png), so these were measured off
         the sheet, not read from path geometry. Standing and walking share one
         value: his head sits lower walking than standing (eye line -0.46 vs
         -0.60) and -0.52 splits the difference, because tuned to either pose
         alone a hat floats in the other. Asleep is a set apart — curled up, his
         head is down by the floor and off to one side, most of a body from
         where it stands. */
      /* Measured off the sheet's own silhouette, front and walk cells apart.
         Both used to carry r 0.14, which put Tom's crown at -0.66 when the
         artwork's head reaches -0.78 — a hat sank into his face, and once the
         accessories were sized to the head as well, it was a doll's hat. He
         crouches to walk, so the walking head sits lower and smaller. */
      tom: {
        front: { hx:  0,    hy: -0.56, r: 0.20, ey: -0.52 },
        side:  { hx:  0,    hy: -0.51, r: 0.17 },
        sleep: { hx:  0.25, hy:  0.12, r: 0.17 },
      },
      /* Jerry is upright with a big head centred over the body. Read off the
         silhouette like Tom's: his ears are two circles wider than the skull
         between them, so r follows the FACE and a hat lands between the ears.
         The old pair sat 0.09 low, which hung every hat off the back of his
         head. Asleep is measured off the sheet's own cell. */
      jerry: {
        front: { hx:  0,    hy: -0.37, r: 0.23 },
        side:  { hx:  0,    hy: -0.30, r: 0.24 },
        sleep: { hx:  0.20, hy:  0.12, r: 0.22 },
      },
      /* Both read off the sheet, which is drawn 1.15x the pet size with its feet
         at +0.40. The capybara used to carry the SIDE anchor alone, and its
         front cell is a sitting pose seen head-on — head centred, not a quarter
         of a body to the right — so anything it wore sat out beside its ear
         whenever it stopped and turned to face you. */
      capybara: {
        front: { hx:  0.00, hy: -0.28, r: 0.22 },
        side:  { hx:  0.25, hy: -0.23, r: 0.15 },
      },
    };

    /* The head anchor for one pet in one pose, always as a plain {hx,hy,r}.

       Half the table is a SET — the sprite pets whose head moves half a body
       between walking, sitting and sleeping — and half is a single anchor for
       the pets that keep one silhouette all their life. Everything that puts a
       hat on a head asks here rather than reaching into the table, because
       reaching in is exactly how the accessory shop and the gacha came to draw
       nothing at all: a set has no hx of its own, `s * undefined` is NaN, and a
       canvas quietly ignores every NaN it is handed. */
    function petHeadAnchor(petType, pose) {
      const entry = PET_HEAD_OFFSETS[petType] || { hx: 0, hy: -0.3, r: 0.28 };
      return entry.side ? (entry[pose] || entry.side) : entry;
    }

    /* One accessory worn by a stand-in head, filling a `size` × `size` square.
       The shop card and the gacha both show this — one picture, so it is drawn
       in one place. `ctx` is expected to be already scaled to CSS pixels.

       The backdrop is a MID tone on purpose. These accessories run from near
       black (the top hat, the ninja hood, the cape) to near white (the wings,
       the bandana), so a dark card hides half of them and a light card hides
       the other half. In the room they are worn against a pet, which is what
       this grey stands in for. */
    function drawAccessoryPreview(ctx, accId, size) {
      /* Sized so the TALLEST accessory fits the square, not so the head fills
         it: the wizard hat stands well above the crown and the cape hangs most
         of a body below the head, and at a bigger scale both ran off the card. */
      const s = size * 0.66;
      // The head below faces the viewer — two ears, two eyes — so the accessory
      // is anchored to the FRONT pose. On the side anchor it would land where a
      // walking cat's head is, off past the edge of this square.
      const ho = petHeadAnchor('cat', 'front');
      ctx.clearRect(0, 0, size, size);
      const bg = ctx.createLinearGradient(0, 0, 0, size);
      bg.addColorStop(0, '#8b7d6b'); bg.addColorStop(1, '#6b5f52');
      ctx.fillStyle = bg;
      roundRectPath(ctx, 0, 0, size, size, Math.round(size * 0.18));
      ctx.fill();

      ctx.save();
      /* Centre so the cat's head anchor lands in the middle of the square —
         nudged UP rather than down, because far more of an accessory hangs
         below a head (scarf, cape, wings) than stands above it. */
      ctx.translate(size / 2 - s * ho.hx, size / 2 - s * 0.12 - s * ho.hy);
      const hx = s * ho.hx, hy = s * ho.hy;
      // Anything worn BEHIND the pet — the wings, the cape — goes down first.
      drawPetAccessory(ctx, 'cat', accId, s, 'back', 'front');
      // Stand-in head: skull, ears, eyes
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.beginPath(); ctx.arc(hx, hy, s * ho.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx - s*0.22, hy - s*0.18); ctx.lineTo(hx - s*0.16, hy - s*0.38); ctx.lineTo(hx - s*0.06, hy - s*0.22); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx + s*0.22, hy - s*0.18); ctx.lineTo(hx + s*0.16, hy - s*0.38); ctx.lineTo(hx + s*0.06, hy - s*0.22); ctx.fill();
      ctx.fillStyle = 'rgba(35,28,22,0.55)';
      ctx.beginPath(); ctx.arc(hx - s*0.08, hy - s*0.02, s*0.03, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + s*0.08, hy - s*0.02, s*0.03, 0, Math.PI*2); ctx.fill();
      drawPetAccessory(ctx, 'cat', accId, s, 'front', 'front');
      ctx.restore();
    }

    /* Which pose a sprite pet is showing. Asked of the pet's own module, never
       recomputed here — the accessory anchor and the picture underneath it have
       to agree, and two copies of this rule would drift apart. Pets drawn from
       paths never change silhouette, so 'side' covers them. */
    /* `typeof` guards every name because each pet is a separate script: a page
       that does not load one leaves the binding undeclared, and naming it any
       other way throws. Hence a switch rather than a lookup table — a table
       would evaluate all seven names to build itself, so one absent module
       would take the other six down with it. */
    /* `view` is only read by the capybara. Its front cell is a SITTING pose, so
       whether it is showing depends on something no pet module can see — the
       room shows it to whoever has the capybara selected, the World to anyone
       standing still — and the caller that already worked that out passes it
       in rather than having this guess. */
    function petPoseOf(type, moving, action, view) {
      switch (type) {
        case 'cat':     return typeof catPose     === 'function' ? catPose(moving, action)     : 'side';
        case 'dog':     return typeof dogPose     === 'function' ? dogPose(moving, action)     : 'side';
        case 'bunny':   return typeof bunnyPose   === 'function' ? bunnyPose(moving, action)   : 'side';
        case 'panda':   return typeof pandaPose   === 'function' ? pandaPose(moving, action)   : 'side';
        case 'fox':     return typeof foxPose     === 'function' ? foxPose(moving, action)     : 'side';
        case 'hamster': return typeof hamsterPose === 'function' ? hamsterPose(moving, action) : 'side';
        case 'goose':   return typeof goosePose   === 'function' ? goosePose(moving, action)   : 'side';
        case 'tom':     return typeof tomPose     === 'function' ? tomPose(moving, action)     : 'side';
        case 'jerry':   return typeof jerryPose   === 'function' ? jerryPose(moving, action)   : 'side';
        case 'capybara': return view === 'front' ? 'front' : 'side';
        default: return 'side';
      }
    }

    /* Worn BEHIND the pet: drawn before the body, so the pet stands in front
       of it. The cape joined the wings when the artwork landed — it is a real
       drawing of a cape now, opaque, and in front it covered the pet wearing
       it. */
    const BACK_LAYER_ACCESSORIES = ['wings', 'cape'];

    /* ── Drawing the accessories ──────────────────────────────────────────
       Every piece is drawn here rather than loaded as a picture, and every one
       is measured in HEADS: `u` below is the wearer's head radius, so a hat is
       a hat on the goose (whose head is 0.14 of its body) and on the hamster
       (0.35), instead of one fixed slice of the animal that fits neither. The
       four worn on the BODY — scarf, cape, wings, badge — measure in `b`, the
       pet size, because a cape drapes over an animal, not over its skull.

       Everything carries its own dark outline. These are seen at forty pixels
       against fur that runs from the bunny's white to the panda's black, and
       an unoutlined shape disappears into one end or the other. */
    const ACC_INK = 'rgba(38,30,26,0.85)';

    /* Fill a path and outline it in that one ink. `lw` is in pixels already —
       every caller scales it off the head, so a hat on a small pet gets a
       proportionally fine line rather than a thick one. */
    function accShape(ctx, fill, lw, path) {
      ctx.beginPath();
      path();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (lw > 0) {
        ctx.strokeStyle = ACC_INK; ctx.lineWidth = lw;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // A vertical two-stop gradient over a box, for the pieces that want a
    // little roundness — gold, silk, lacquer.
    function accGrad(ctx, y0, y1, a, c) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, a); g.addColorStop(1, c);
      return g;
    }

    // An n-pointed star, as a path. Used by the badge and the hat spangles.
    function accStarPath(ctx, cx, cy, rOuter, rInner, points) {
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? rInner : rOuter;
        const a = -Math.PI / 2 + i * Math.PI / points;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }

    /* `pose` is only read for pets whose entry above is a set — the sprite pets
       that change silhouette. Everything else keeps one head all its life and
       ignores it, so callers that do not know the pose can leave it out. */
    function drawPetAccessory(ctx, petType, accId, s, layer, pose) {
      if (!accId) return;
      const acc = PET_ACCESSORIES.find(a => a.id === accId);
      if (!acc) return;
      const isBack = BACK_LAYER_ACCESSORIES.includes(acc.draw);
      // If layer is specified, only draw matching layer
      if (layer === 'back' && !isBack) return;
      if (layer === 'front' && isBack) return;
      const ho = petHeadAnchor(petType, pose);
      const hx = s * ho.hx;   // head centre X
      const hy = s * ho.hy;   // head centre Y
      const u  = s * ho.r;    // ONE HEAD RADIUS — the unit every head piece uses
      /* Where the EYES are, which is the head centre on almost every pet and is
         written down separately where it is not: a tall head (Tom's) has its
         box centred above its eyes, and glasses hung off the centre ride up the
         forehead. Hats keep using the crown, which is the same either way. */
      const ey = s * (ho.ey === undefined ? ho.hy : ho.ey);
      const top = hy - u;     // the crown: what a hat stands on
      const b = s;            // the unit for the pieces worn on the body
      const ink = u * 0.055;  // outline weight, so it thins with the head

      switch (acc.draw) {

        case 'tophat': {
          const brimY = top + u * 0.06, hatH = u * 0.95;
          // Brim first, so the crown of the hat sits on top of its own ellipse.
          accShape(ctx, '#23212e', ink, () => ctx.ellipse(hx, brimY, u * 0.98, u * 0.20, 0, 0, Math.PI * 2));
          accShape(ctx, accGrad(ctx, brimY - hatH, brimY, '#3a3750', '#1a1826'), ink, () => {
            ctx.moveTo(hx - u * 0.56, brimY);
            ctx.lineTo(hx - u * 0.50, brimY - hatH);
            ctx.lineTo(hx + u * 0.50, brimY - hatH);
            ctx.lineTo(hx + u * 0.56, brimY);
            ctx.closePath();
          });
          // Band, and one soft highlight down the left of the silk.
          accShape(ctx, '#c0392b', 0, () => ctx.rect(hx - u * 0.545, brimY - u * 0.28, u * 1.09, u * 0.22));
          ctx.globalAlpha = 0.28;
          accShape(ctx, '#ffffff', 0, () => ctx.rect(hx - u * 0.40, brimY - hatH + u * 0.10, u * 0.13, hatH - u * 0.48));
          ctx.globalAlpha = 1;
          break;
        }

        case 'crown': {
          const baseY = top + u * 0.12, tipY = baseY - u * 0.82, w = u * 0.88;
          const gold = accGrad(ctx, tipY, baseY + u * 0.2, '#ffe486', '#c8890f');
          accShape(ctx, gold, ink, () => {
            ctx.moveTo(hx - w, baseY);
            ctx.lineTo(hx - w, tipY + u * 0.22);
            ctx.lineTo(hx - w * 0.55, baseY - u * 0.30);
            ctx.lineTo(hx - w * 0.28, tipY);
            ctx.lineTo(hx, baseY - u * 0.34);
            ctx.lineTo(hx + w * 0.28, tipY);
            ctx.lineTo(hx + w * 0.55, baseY - u * 0.30);
            ctx.lineTo(hx + w, tipY + u * 0.22);
            ctx.lineTo(hx + w, baseY);
            ctx.closePath();
          });
          // Rim, then the balls on the points, then the stones.
          accShape(ctx, '#e0a51c', ink * 0.8, () => ctx.rect(hx - w, baseY - u * 0.20, w * 2, u * 0.22));
          [[-0.28, tipY], [0.28, tipY], [-1, tipY + u * 0.22], [1, tipY + u * 0.22]].forEach(([fx, ty]) =>
            accShape(ctx, '#ffd75e', ink * 0.7, () => ctx.arc(hx + w * fx, ty, u * 0.10, 0, Math.PI * 2)));
          accShape(ctx, '#e5484d', ink * 0.6, () => ctx.ellipse(hx, baseY - u * 0.09, u * 0.11, u * 0.14, 0, 0, Math.PI * 2));
          accShape(ctx, '#3fa4c8', 0, () => ctx.arc(hx - w * 0.60, baseY - u * 0.09, u * 0.07, 0, Math.PI * 2));
          accShape(ctx, '#43b581', 0, () => ctx.arc(hx + w * 0.60, baseY - u * 0.09, u * 0.07, 0, Math.PI * 2));
          break;
        }

        case 'glasses': {
          const lx = u * 0.46, ly = ey, rw = u * 0.40, rh = u * 0.30;
          // Arms first — they run back to the ears behind the lenses.
          accShape(ctx, null, ink * 1.3, () => {
            ctx.moveTo(hx - lx - rw, ly - rh * 0.35); ctx.lineTo(hx - u * 1.05, ly - rh * 0.55);
            ctx.moveTo(hx + lx + rw, ly - rh * 0.35); ctx.lineTo(hx + u * 1.05, ly - rh * 0.55);
          });
          accShape(ctx, null, ink * 1.4, () => {
            ctx.moveTo(hx - lx + rw, ly - rh * 0.2); ctx.lineTo(hx + lx - rw, ly - rh * 0.2);
          });
          [-1, 1].forEach(sgn => {
            accShape(ctx, '#1d2027', ink, () => ctx.ellipse(hx + sgn * lx, ly, rw, rh, 0, 0, Math.PI * 2));
            ctx.globalAlpha = 0.45;
            accShape(ctx, '#9fd3ff', 0, () => {
              ctx.moveTo(hx + sgn * lx - rw * 0.55, ly + rh * 0.35);
              ctx.lineTo(hx + sgn * lx - rw * 0.05, ly - rh * 0.60);
              ctx.lineTo(hx + sgn * lx + rw * 0.30, ly - rh * 0.60);
              ctx.lineTo(hx + sgn * lx - rw * 0.20, ly + rh * 0.35);
              ctx.closePath();
            });
            ctx.globalAlpha = 1;
          });
          break;
        }

        case 'bow': {
          const cx = hx + u * 0.10, cy = top + u * 0.02, w = u * 0.52, h = u * 0.40;
          const red = accGrad(ctx, cy - h, cy + h, '#ef4b52', '#b3252c');
          [-1, 1].forEach(sgn => accShape(ctx, red, ink, () => {
            ctx.moveTo(cx, cy);
            ctx.quadraticCurveTo(cx + sgn * w * 1.15, cy - h * 1.25, cx + sgn * w * 1.05, cy - h * 0.15);
            ctx.quadraticCurveTo(cx + sgn * w * 0.95, cy + h * 0.95, cx, cy);
            ctx.closePath();
          }));
          accShape(ctx, '#d13a41', ink * 0.8, () => ctx.ellipse(cx, cy - h * 0.05, u * 0.15, u * 0.15, 0, 0, Math.PI * 2));
          break;
        }

        case 'scarf': {
          // Round the neck, which is below the head and belongs to the body.
          const ny = hy + u * 0.86, w = b * 0.26, red = accGrad(ctx, ny - b * 0.06, ny + b * 0.10, '#e8464d', '#a81f27');
          accShape(ctx, red, ink, () => {
            ctx.moveTo(hx - w, ny - b * 0.05);
            ctx.quadraticCurveTo(hx, ny + b * 0.07, hx + w, ny - b * 0.05);
            ctx.quadraticCurveTo(hx + w * 1.05, ny + b * 0.06, hx + w * 0.9, ny + b * 0.08);
            ctx.quadraticCurveTo(hx, ny + b * 0.18, hx - w * 0.9, ny + b * 0.08);
            ctx.quadraticCurveTo(hx - w * 1.05, ny + b * 0.06, hx - w, ny - b * 0.05);
            ctx.closePath();
          });
          // The loose end, hanging down the pet's left with a fringe on it.
          const tx = hx + w * 0.55, ty = ny + b * 0.06, tl = b * 0.20;
          accShape(ctx, '#c9333a', ink, () => {
            ctx.moveTo(tx - b * 0.055, ty);
            ctx.quadraticCurveTo(tx - b * 0.02, ty + tl * 0.6, tx - b * 0.045, ty + tl);
            ctx.lineTo(tx + b * 0.055, ty + tl);
            ctx.quadraticCurveTo(tx + b * 0.075, ty + tl * 0.6, tx + b * 0.055, ty);
            ctx.closePath();
          });
          accShape(ctx, null, ink * 0.9, () => {
            for (let i = -1; i <= 1; i++) {
              ctx.moveTo(tx + i * b * 0.035, ty + tl);
              ctx.lineTo(tx + i * b * 0.035, ty + tl + b * 0.045);
            }
          });
          break;
        }

        case 'flower': {
          const cx = hx + u * 0.68, cy = top + u * 0.02, pr = u * 0.25;
          accShape(ctx, '#4ba14b', ink * 0.8, () => {
            ctx.moveTo(cx - u * 0.02, cy + pr * 0.6);
            ctx.quadraticCurveTo(cx - u * 0.30, cy + pr * 1.5, cx - u * 0.34, cy + pr * 0.7);
            ctx.quadraticCurveTo(cx - u * 0.16, cy + pr * 0.5, cx - u * 0.02, cy + pr * 0.6);
            ctx.closePath();
          });
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
            accShape(ctx, '#ff86bd', ink * 0.7, () =>
              ctx.ellipse(cx + Math.cos(a) * pr * 0.95, cy + Math.sin(a) * pr * 0.95, pr * 0.62, pr * 0.62, 0, 0, Math.PI * 2));
          }
          accShape(ctx, '#ffd54a', ink * 0.7, () => ctx.arc(cx, cy, pr * 0.46, 0, Math.PI * 2));
          break;
        }

        case 'bandana': {
          /* Tied over the crown, pirate-fashion, with the knot and two tails at
             the side. It used to be a band across the eyes, which read as a
             bandit's mask and hid the face of every pet that wore it. */
          const capY = top + u * 0.52;
          const cloth = accGrad(ctx, top - u * 0.12, capY, '#e8464d', '#ad2129');
          accShape(ctx, cloth, ink, () => {
            ctx.moveTo(hx - u * 1.0, capY);
            ctx.quadraticCurveTo(hx - u * 1.02, top - u * 0.28, hx, top - u * 0.30);
            ctx.quadraticCurveTo(hx + u * 1.02, top - u * 0.28, hx + u * 1.0, capY);
            ctx.quadraticCurveTo(hx, capY - u * 0.22, hx - u * 1.0, capY);
            ctx.closePath();
          });
          // Knot and tails, off to the pet's left.
          accShape(ctx, '#c9333a', ink, () => ctx.ellipse(hx + u * 0.98, capY - u * 0.12, u * 0.20, u * 0.17, 0, 0, Math.PI * 2));
          accShape(ctx, '#c9333a', ink, () => {
            ctx.moveTo(hx + u * 1.05, capY - u * 0.20);
            ctx.lineTo(hx + u * 1.55, capY - u * 0.02);
            ctx.lineTo(hx + u * 1.02, capY + u * 0.12);
            ctx.closePath();
          });
          ctx.globalAlpha = 0.35;
          accShape(ctx, '#ffffff', 0, () => {
            ctx.ellipse(hx - u * 0.42, top - u * 0.02, u * 0.10, u * 0.07, -0.5, 0, Math.PI * 2);
          });
          ctx.globalAlpha = 1;
          break;
        }

        case 'monocle': {
          const cx = hx + u * 0.46, cy = ey, r = u * 0.34;
          ctx.globalAlpha = 0.30;
          accShape(ctx, '#cfe8ff', 0, () => ctx.arc(cx, cy, r, 0, Math.PI * 2));
          ctx.globalAlpha = 1;
          accShape(ctx, null, ink * 1.9, () => ctx.arc(cx, cy, r, 0, Math.PI * 2));
          ctx.strokeStyle = '#e0a51c'; ctx.lineWidth = ink * 1.3;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.55;
          accShape(ctx, '#ffffff', 0, () => {
            ctx.moveTo(cx - r * 0.45, cy + r * 0.30);
            ctx.lineTo(cx + r * 0.05, cy - r * 0.55);
            ctx.lineTo(cx + r * 0.35, cy - r * 0.50);
            ctx.lineTo(cx - r * 0.20, cy + r * 0.35);
            ctx.closePath();
          });
          ctx.globalAlpha = 1;
          // The chain, swinging off towards the collar.
          ctx.strokeStyle = '#c9952a'; ctx.lineWidth = ink;
          ctx.setLineDash([ink * 1.6, ink * 1.2]);
          ctx.beginPath();
          ctx.moveTo(cx + r * 0.5, cy + r * 0.75);
          ctx.quadraticCurveTo(cx + r * 1.5, cy + r * 1.6, cx + r * 1.1, cy + r * 2.6);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        }

        case 'halo': {
          const cy = top - u * 0.42, rx = u * 0.60, ry = u * 0.19;
          ctx.globalAlpha = 0.30;
          ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = u * 0.30;
          ctx.beginPath(); ctx.ellipse(hx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = u * 0.13;
          ctx.beginPath(); ctx.ellipse(hx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = '#fff3bf'; ctx.lineWidth = u * 0.05;
          ctx.beginPath(); ctx.ellipse(hx - rx * 0.15, cy - ry * 0.45, rx * 0.55, ry * 0.35, 0, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
          // Three little ticks of light above it.
          ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = u * 0.06;
          ctx.beginPath();
          [-0.62, 0, 0.62].forEach(fx => {
            ctx.moveTo(hx + rx * fx, cy - ry - u * 0.14);
            ctx.lineTo(hx + rx * fx * 1.12, cy - ry - u * 0.34);
          });
          ctx.stroke();
          break;
        }

        case 'wizard': {
          const brimY = top + u * 0.06, tipX = hx + u * 0.62, tipY = top - u * 1.62;
          accShape(ctx, accGrad(ctx, tipY, brimY, '#7b4fd1', '#3b1f73'), ink, () => {
            ctx.moveTo(hx - u * 0.78, brimY);
            ctx.quadraticCurveTo(hx - u * 0.34, top - u * 0.85, tipX, tipY);
            ctx.quadraticCurveTo(hx + u * 0.30, top - u * 0.62, hx + u * 0.80, brimY);
            ctx.closePath();
          });
          accShape(ctx, '#5b34a8', ink, () => ctx.ellipse(hx, brimY, u * 1.02, u * 0.22, 0, 0, Math.PI * 2));
          ctx.fillStyle = '#ffd23f';
          [[-0.30, -0.55, 0.13], [0.16, -1.02, 0.10], [-0.06, -0.24, 0.09]].forEach(([fx, fy, r]) => {
            ctx.beginPath(); accStarPath(ctx, hx + u * fx, top + u * fy, u * r, u * r * 0.42, 4); ctx.fill();
          });
          break;
        }

        case 'partyhat': {
          const baseY = top + u * 0.04, tipX = hx + u * 0.06, tipY = top - u * 1.30, hw = u * 0.46;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(hx - hw, baseY); ctx.lineTo(tipX, tipY); ctx.lineTo(hx + hw, baseY); ctx.closePath();
          ctx.clip();
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(hx - u * 1.2, tipY, u * 2.4, baseY - tipY);
          ctx.fillStyle = '#5b8dee';
          for (let i = -3; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(hx + i * u * 0.42, baseY + u * 0.1);
            ctx.lineTo(hx + i * u * 0.42 + u * 0.20, baseY + u * 0.1);
            ctx.lineTo(hx + i * u * 0.42 + u * 0.62, tipY - u * 0.1);
            ctx.lineTo(hx + i * u * 0.42 + u * 0.42, tipY - u * 0.1);
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          accShape(ctx, null, ink, () => {
            ctx.moveTo(hx - hw, baseY); ctx.lineTo(tipX, tipY); ctx.lineTo(hx + hw, baseY); ctx.closePath();
          });
          // Pompom, and the scalloped trim round the brim.
          accShape(ctx, '#ff9ecb', ink * 0.8, () => ctx.arc(tipX, tipY - u * 0.06, u * 0.15, 0, Math.PI * 2));
          accShape(ctx, '#ff9ecb', ink * 0.7, () => {
            for (let i = -2; i <= 2; i++) ctx.ellipse(hx + i * u * 0.21, baseY, u * 0.12, u * 0.09, 0, 0, Math.PI * 2);
          });
          break;
        }

        case 'heartglass': {
          /* The lobes and the notch between them have to survive at forty
             pixels, or these are just the sunglasses again in a red frame:
             hence two full circles for the top and a deep V under them, rather
             than one smooth bezier that rounds itself away at this size. */
          const lx = u * 0.50, ly = ey, w = u * 0.52, h = u * 0.46;
          accShape(ctx, null, ink * 1.4, () => {
            ctx.moveTo(hx - lx + w * 0.55, ly - h * 0.35); ctx.lineTo(hx + lx - w * 0.55, ly - h * 0.35);
            ctx.moveTo(hx - lx - w * 0.85, ly - h * 0.30); ctx.lineTo(hx - u * 1.06, ly - h * 0.55);
            ctx.moveTo(hx + lx + w * 0.85, ly - h * 0.30); ctx.lineTo(hx + u * 1.06, ly - h * 0.55);
          });
          [-1, 1].forEach(sgn => {
            const cx = hx + sgn * lx, lobe = w * 0.40;
            const heart = () => {
              ctx.moveTo(cx - w * 0.80, ly - h * 0.22);
              ctx.arc(cx - lobe, ly - h * 0.30, lobe, Math.PI, Math.PI * 1.92);
              ctx.arc(cx + lobe, ly - h * 0.30, lobe, Math.PI * 1.08, 0);
              ctx.lineTo(cx + w * 0.80, ly - h * 0.14);
              ctx.quadraticCurveTo(cx + w * 0.45, ly + h * 0.42, cx, ly + h * 0.72);
              ctx.quadraticCurveTo(cx - w * 0.45, ly + h * 0.42, cx - w * 0.80, ly - h * 0.14);
              ctx.closePath();
            };
            accShape(ctx, '#f0505a', ink * 2.0, heart);   // frame, drawn as a fat outline
            accShape(ctx, '#3a1220', 0, () => {           // the tinted glass inside it
              ctx.save(); ctx.translate(cx, ly - h * 0.05); ctx.scale(0.74, 0.74);
              ctx.translate(-cx, -(ly - h * 0.05)); heart(); ctx.restore();
            });
            ctx.globalAlpha = 0.5;
            accShape(ctx, '#ffd9e4', 0, () =>
              ctx.ellipse(cx - w * 0.32, ly - h * 0.30, w * 0.20, h * 0.13, -0.6, 0, Math.PI * 2));
            ctx.globalAlpha = 1;
          });
          break;
        }

        case 'devil': {
          const bandY = top + u * 0.14;
          [-1, 1].forEach(sgn => accShape(ctx, accGrad(ctx, bandY - u * 0.85, bandY, '#ff6b5e', '#a8201a'), ink, () => {
            const bx = hx + sgn * u * 0.58;
            ctx.moveTo(bx - sgn * u * 0.20, bandY);
            ctx.quadraticCurveTo(bx - sgn * u * 0.30, bandY - u * 0.62, bx + sgn * u * 0.24, bandY - u * 0.82);
            ctx.quadraticCurveTo(bx + sgn * u * 0.06, bandY - u * 0.44, bx + sgn * u * 0.18, bandY);
            ctx.closePath();
          }));
          accShape(ctx, '#2b2b33', ink * 0.8, () => {
            ctx.moveTo(hx - u * 0.92, bandY + u * 0.04);
            ctx.quadraticCurveTo(hx, bandY - u * 0.30, hx + u * 0.92, bandY + u * 0.04);
            ctx.quadraticCurveTo(hx, bandY - u * 0.12, hx - u * 0.92, bandY + u * 0.04);
            ctx.closePath();
          });
          break;
        }

        case 'wings': {
          /* Behind the pet, on the body. Built from three overlapping feather
             lobes a side rather than one smooth blade — a blade at this size
             reads as a fin — and outlined, because they are the same white as
             the goose wearing them. */
          const wy = hy + b * 0.14;
          [-1, 1].forEach(sgn => {
            const rx = hx + sgn * b * 0.09;
            const quill = accGrad(ctx, wy - b * 0.22, wy + b * 0.10, '#ffffff', '#bccbe3');
            [[0.40, -0.20, 0.09], [0.33, -0.07, 0.085], [0.24, 0.04, 0.075]].forEach(([len, lift, th]) => {
              accShape(ctx, quill, ink * 0.8, () => {
                ctx.moveTo(rx, wy + b * 0.05);
                ctx.quadraticCurveTo(rx + sgn * b * len * 0.55, wy + b * (lift - th * 1.5),
                                     rx + sgn * b * len, wy + b * lift);
                ctx.quadraticCurveTo(rx + sgn * b * len * 0.50, wy + b * (lift + th),
                                     rx, wy + b * 0.05);
                ctx.closePath();
              });
            });
          });
          break;
        }

        case 'cape': {
          // Also behind the pet: hangs from the neck and flares out past it.
          const ny = hy + u * 0.80, hem = hy + b * 0.62, w = b * 0.42;
          accShape(ctx, accGrad(ctx, ny, hem, '#e0454c', '#8e1b22'), ink, () => {
            ctx.moveTo(hx - b * 0.13, ny);
            ctx.quadraticCurveTo(hx - w * 0.9, hem - b * 0.20, hx - w, hem);
            ctx.quadraticCurveTo(hx - w * 0.45, hem + b * 0.05, hx, hem - b * 0.01);
            ctx.quadraticCurveTo(hx + w * 0.45, hem + b * 0.05, hx + w, hem);
            ctx.quadraticCurveTo(hx + w * 0.9, hem - b * 0.20, hx + b * 0.13, ny);
            ctx.closePath();
          });
          ctx.globalAlpha = 0.22;
          accShape(ctx, '#3d0c10', 0, () => {
            ctx.moveTo(hx + b * 0.02, ny + b * 0.02);
            ctx.quadraticCurveTo(hx + w * 0.35, hem - b * 0.16, hx + w * 0.42, hem - b * 0.01);
            ctx.lineTo(hx + w * 0.14, hem - b * 0.01);
            ctx.closePath();
          });
          ctx.globalAlpha = 1;
          // Collar and clasp, at the throat.
          accShape(ctx, '#c9333a', ink, () => {
            ctx.moveTo(hx - b * 0.15, ny - b * 0.02);
            ctx.quadraticCurveTo(hx, ny + b * 0.05, hx + b * 0.15, ny - b * 0.02);
            ctx.quadraticCurveTo(hx, ny - b * 0.06, hx - b * 0.15, ny - b * 0.02);
            ctx.closePath();
          });
          accShape(ctx, '#ffd23f', ink * 0.7, () => ctx.arc(hx, ny + b * 0.005, b * 0.028, 0, Math.PI * 2));
          break;
        }

        case 'ninja': {
          /* Two pieces with a gap between them, and the gap is the eye slit —
             the pet looks THROUGH the mask. Drawn as one hood and the slit cut
             out of it, the eyes went behind the cloth on every pet whose face
             is not proportioned like the drawing. */
          const slitTop = ey - u * 0.24, slitBot = ey + u * 0.20;
          const cloth = accGrad(ctx, top - u * 0.2, hy + u, '#33343d', '#17181f');
          accShape(ctx, cloth, ink, () => {
            ctx.moveTo(hx - u * 1.03, slitTop);
            ctx.quadraticCurveTo(hx - u * 1.06, top - u * 0.30, hx, top - u * 0.32);
            ctx.quadraticCurveTo(hx + u * 1.06, top - u * 0.30, hx + u * 1.03, slitTop);
            ctx.quadraticCurveTo(hx, slitTop - u * 0.14, hx - u * 1.03, slitTop);
            ctx.closePath();
          });
          accShape(ctx, cloth, ink, () => {
            ctx.moveTo(hx - u * 1.0, slitBot);
            ctx.quadraticCurveTo(hx, slitBot - u * 0.12, hx + u * 1.0, slitBot);
            ctx.quadraticCurveTo(hx + u * 0.92, hy + u * 0.92, hx, hy + u * 1.0);
            ctx.quadraticCurveTo(hx - u * 0.92, hy + u * 0.92, hx - u * 1.0, slitBot);
            ctx.closePath();
          });
          // The knot, and its two tails streaming off to one side.
          accShape(ctx, '#22232b', ink, () => ctx.ellipse(hx + u * 1.0, slitTop + u * 0.18, u * 0.17, u * 0.15, 0, 0, Math.PI * 2));
          accShape(ctx, '#22232b', ink, () => {
            ctx.moveTo(hx + u * 1.05, slitTop + u * 0.08);
            ctx.lineTo(hx + u * 1.62, slitTop - u * 0.10);
            ctx.lineTo(hx + u * 1.55, slitTop + u * 0.22);
            ctx.closePath();
            ctx.moveTo(hx + u * 1.05, slitTop + u * 0.26);
            ctx.lineTo(hx + u * 1.58, slitTop + u * 0.44);
            ctx.lineTo(hx + u * 1.10, slitTop + u * 0.40);
            ctx.closePath();
          });
          break;
        }

        case 'pirate': {
          const px = hx - u * 0.46, py = ey;
          accShape(ctx, null, ink * 1.5, () => {
            ctx.moveTo(px - u * 0.52, py - u * 0.16);
            ctx.quadraticCurveTo(hx - u * 0.1, py - u * 0.62, hx + u * 1.02, py - u * 0.34);
          });
          accShape(ctx, '#1c1c22', ink, () => {
            ctx.moveTo(px - u * 0.36, py - u * 0.26);
            ctx.quadraticCurveTo(px + u * 0.40, py - u * 0.30, px + u * 0.34, py + u * 0.06);
            ctx.quadraticCurveTo(px + u * 0.24, py + u * 0.36, px - u * 0.14, py + u * 0.32);
            ctx.quadraticCurveTo(px - u * 0.42, py + u * 0.20, px - u * 0.36, py - u * 0.26);
            ctx.closePath();
          });
          // Skull: two sockets and a jaw, which is all that survives at this size.
          ctx.fillStyle = '#f0ece4';
          [[-0.13, -0.04], [0.09, -0.05]].forEach(([fx, fy]) => {
            ctx.beginPath(); ctx.arc(px + u * fx, py + u * fy, u * 0.075, 0, Math.PI * 2); ctx.fill();
          });
          ctx.beginPath(); ctx.ellipse(px - u * 0.02, py + u * 0.14, u * 0.10, u * 0.05, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }

        case 'tiara': {
          /* An open band with three spires standing off it — filled in as one
             solid arch (which is what a first pass gives you) it reads as a
             helmet. The gaps between the spires ARE the tiara. Outlined
             heavily too: silver on a white bunny is nearly the fur's colour. */
          const baseY = top + u * 0.12, w = u * 0.80;
          const silver = accGrad(ctx, baseY - u * 0.90, baseY, '#ffffff', '#8199bd');
          const bandTop = (x) => baseY - u * 0.30 * (1 - (x / w) * (x / w));
          // The three spires, tallest in the middle.
          [[-0.60, 0.44], [0, 0.78], [0.60, 0.44]].forEach(([fx, hgt]) => {
            const sx = hx + w * fx, sy = bandTop(w * fx);
            accShape(ctx, silver, ink * 1.1, () => {
              ctx.moveTo(sx - u * 0.17, sy);
              ctx.quadraticCurveTo(sx - u * 0.11, sy - u * hgt * 0.75, sx, sy - u * hgt);
              ctx.quadraticCurveTo(sx + u * 0.11, sy - u * hgt * 0.75, sx + u * 0.17, sy);
              ctx.closePath();
            });
            accShape(ctx, '#eaf4ff', ink * 0.6, () => ctx.arc(sx, sy - u * hgt - u * 0.06, u * 0.075, 0, Math.PI * 2));
          });
          // The band itself, laid over the feet of the spires.
          accShape(ctx, silver, ink * 1.1, () => {
            ctx.moveTo(hx - w, baseY);
            ctx.quadraticCurveTo(hx, baseY - u * 0.56, hx + w, baseY);
            ctx.quadraticCurveTo(hx + w * 0.55, baseY + u * 0.14, hx, baseY + u * 0.16);
            ctx.quadraticCurveTo(hx - w * 0.55, baseY + u * 0.14, hx - w, baseY);
            ctx.closePath();
          });
          accShape(ctx, '#4fc3f7', ink * 0.85, () => ctx.ellipse(hx, baseY - u * 0.13, u * 0.16, u * 0.18, 0, 0, Math.PI * 2));
          accShape(ctx, '#bde9ff', 0, () => ctx.ellipse(hx - u * 0.05, baseY - u * 0.19, u * 0.055, u * 0.065, -0.5, 0, Math.PI * 2));
          break;
        }

        case 'starbadge': {
          // Pinned on the chest, which belongs to the body, not the head.
          const cx = hx + b * 0.11, cy = hy + b * 0.30, r = b * 0.075;
          const gold = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
          gold.addColorStop(0, '#ffe98a'); gold.addColorStop(0.55, '#fbbf24'); gold.addColorStop(1, '#c97d09');
          accShape(ctx, gold, ink * 0.9, () => accStarPath(ctx, cx, cy, r, r * 0.44, 5));
          accShape(ctx, '#d98a0c', ink * 0.6, () => ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2));
          ctx.globalAlpha = 0.55;
          accShape(ctx, '#fffbe8', 0, () => ctx.ellipse(cx - r * 0.28, cy - r * 0.34, r * 0.20, r * 0.11, -0.7, 0, Math.PI * 2));
          ctx.globalAlpha = 1;
          break;
        }
      }
    }

