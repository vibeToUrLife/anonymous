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
      tom: {
        front: { hx:  0,    hy: -0.52, r: 0.14 },
        side:  { hx:  0,    hy: -0.52, r: 0.14 },
        sleep: { hx:  0.25, hy:  0.12, r: 0.17 },
      },
      /* Jerry is upright with a big head centred over the body (front view);
         the standing value came from his head geometry (arc 0,-0.26 r0.30) and
         is kept for the walk too. Asleep is measured off the sheet's own cell. */
      jerry: {
        front: { hx:  0,    hy: -0.28, r: 0.28 },
        side:  { hx:  0,    hy: -0.28, r: 0.28 },
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
         it: a wizard hat reaches 0.6 of the pet size above the crown and a cape
         hangs 0.77 below the head, and at the old 0.7 the cape and the scarf
         ran off the bottom of every card. */
      const s = size * 0.62;
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
      ctx.translate(size / 2 - s * ho.hx, size / 2 - s * 0.05 - s * ho.hy);
      const hx = s * ho.hx, hy = s * ho.hy;
      /* This square is painted ONCE, unlike the room, so a picture that has not
         arrived yet would leave a bare head sitting on the card for good. Draw
         the whole square again when it lands. */
      const again = () => drawAccessoryPreview(ctx, accId, size);
      // Anything worn BEHIND the pet — the wings, the cape — goes down first.
      drawPetAccessory(ctx, 'cat', accId, s, 'back', 'front', again);
      // Stand-in head: skull, ears, eyes
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.beginPath(); ctx.arc(hx, hy, s * ho.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx - s*0.22, hy - s*0.18); ctx.lineTo(hx - s*0.16, hy - s*0.38); ctx.lineTo(hx - s*0.06, hy - s*0.22); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx + s*0.22, hy - s*0.18); ctx.lineTo(hx + s*0.16, hy - s*0.38); ctx.lineTo(hx + s*0.06, hy - s*0.22); ctx.fill();
      ctx.fillStyle = 'rgba(35,28,22,0.55)';
      ctx.beginPath(); ctx.arc(hx - s*0.08, hy - s*0.02, s*0.03, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + s*0.08, hy - s*0.02, s*0.03, 0, Math.PI*2); ctx.fill();
      drawPetAccessory(ctx, 'cat', accId, s, 'front', 'front', again);
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

    /* ── The pictures ─────────────────────────────────────────────────────
       Each accessory is one drawing now (img/accessories/<draw>.png) where it
       used to be twenty-odd canvas paths. The file says what it looks like;
       this table says only how big it is drawn and where it sits.

       `w` is the drawn width as a fraction of the pet size — kept at the width
       each path version occupied, so nothing changes size on any pet.

       `x`/`y` place the picture, in that same fraction of the pet size, from
       the head centre — except under `ref: 'top'`, where y is measured from the
       CROWN (the head centre less its radius). Hats use the crown because heads
       differ between pets: a fox's is 0.18 of its body and a panda's 0.29, and
       a hat measured from the centre sinks into one while hovering over the
       other. This is what the paths did too, in the arithmetic.

       `ax`/`ay` say which point OF THE PICTURE lands there, as a fraction of
       its own width and height. The middle (0.5) unless said otherwise; ay:1 is
       the bottom edge a hat stands on, ay:0 the top edge a scarf hangs from.
       The monocle and the pirate patch name a point inside their own drawing —
       the lens, the patch — because both pictures are mostly chain and strap,
       and it is the lens that has to land on the eye. */
    const ACC_ART = {
      // Worn on the crown.
      tophat:     { w: 0.40, y:  0.06, ay: 1,    ref: 'top' },
      crown:      { w: 0.44, y:  0.04, ay: 1,    ref: 'top' },
      wizard:     { w: 0.46, y:  0.05, ay: 1,    ref: 'top' },
      partyhat:   { w: 0.30, y:  0.04, ay: 1,    ref: 'top' },
      tiara:      { w: 0.40, y:  0.06, ay: 1,    ref: 'top' },
      devil:      { w: 0.44, y:  0.06, ay: 1,    ref: 'top' },
      bow:        { w: 0.30, x: 0.02, y: 0.05, ay: 1, ref: 'top' },
      flower:     { w: 0.20, x: 0.13, y: 0.06, ay: 1, ref: 'top' },
      // The halo hangs ABOVE the crown, and it is the ring that has to hang
      // there — the sparkles above it are half the picture's height.
      halo:       { w: 0.34, y: -0.06, ay: 0.69, ref: 'top' },
      // A head-wrap: the opening goes over the crown and the cloth falls round.
      bandana:    { w: 0.54, y:  0.02, ay: 0,    ref: 'top' },
      // Worn on the face. The eye line is the head centre.
      glasses:    { w: 0.42, y: -0.01 },
      heartglass: { w: 0.42, y: -0.01 },
      ninja:      { w: 0.62, x:  0.02, y: -0.03 },
      monocle:    { w: 0.36, x:  0.07,  y:  0.02, ax: 0.36, ay: 0.34 },
      pirate:     { w: 0.50, x: -0.10, y:  0.01, ax: 0.33, ay: 0.62 },
      // Worn on the body, below the head.
      scarf:      { w: 0.48, x: -0.04, y: 0.14, ay: 0 },
      starbadge:  { w: 0.22, x: 0.11, y: 0.30 },
      cape:       { w: 0.74, y: 0.10, ay: 0 },
      wings:      { w: 0.95, y: 0.22 },
    };

    /* One file per accessory, fetched on FIRST WEAR rather than at page load: a
       room of bare pets must not pay for nineteen drawings. Resolved against
       this script's own URL, because the room and the World load it from
       different depths, and carrying the script's own ?v= so new artwork ships
       with the version that places it. */
    const _accArtScript = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
    function accArtUrl(draw) {
      const q = _accArtScript.indexOf('?');
      const file = draw + '.png' + (q >= 0 ? _accArtScript.slice(q) : '');
      // The fallback is the room's own path, for anything that loads this file
      // without a resolvable URL to hang the picture off.
      try { return new URL('../img/accessories/' + file, _accArtScript).href; }
      catch (e) { return 'room/img/accessories/' + file; }
    }

    const _accImgs = {};
    /* The picture for one accessory, or null while it is still coming down the
       wire. `onReady` matters for the pictures drawn ONCE — a shop card, a
       gacha prize — which would otherwise stay empty for the one frame they
       have; the room and the World redraw every frame and pass nothing. */
    function accArtImage(draw, onReady) {
      if (!ACC_ART[draw] || typeof Image === 'undefined') return null;
      let img = _accImgs[draw];
      if (!img) {
        img = _accImgs[draw] = new Image();
        img.src = accArtUrl(draw);
      }
      if (img.naturalWidth) return img;
      if (onReady) img.addEventListener('load', onReady, { once: true });
      return null;
    }

    /* `pose` is only read for pets whose entry above is a set — the sprite pets
       that change silhouette. Everything else keeps one head all its life and
       ignores it, so callers that do not know the pose can leave it out. */
    function drawPetAccessory(ctx, petType, accId, s, layer, pose, onReady) {
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
      const hr = s * ho.r;    // head radius
      const art = ACC_ART[acc.draw];
      if (!art) return;
      const img = accArtImage(acc.draw, onReady);
      if (!img) return;                       // still downloading
      const w = s * art.w;
      const h = w * img.naturalHeight / img.naturalWidth;
      // y is measured from the crown for anything worn on top of the head, and
      // from the head centre for everything else.
      const originY = art.ref === 'top' ? hy - hr : hy;
      ctx.drawImage(img,
        hx + s * (art.x || 0) - w * (art.ax === undefined ? 0.5 : art.ax),
        originY + s * (art.y || 0) - h * (art.ay === undefined ? 0.5 : art.ay),
        w, h);
    }

