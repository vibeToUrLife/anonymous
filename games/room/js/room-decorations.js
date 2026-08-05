    /* ═══════════════════════════════
       Decoration Drawing
       ═══════════════════════════════ */
    function hasDecor(id) {
      return roomData.placedDecors && roomData.placedDecors.some(d => d.id === id);
    }

    function getDecorPos(id) {
      const p = roomData.placedDecors && roomData.placedDecors.find(d => d.id === id);
      const def = DECORATIONS.find(d => d.id === id);
      return p || (def ? { id, x: def.dx, y: def.dy } : { id, x: 0.5, y: 0.5 });
    }

    /* Is this placed piece mirrored? The flag rides on the placed entry next to
       x and y, so it is per floor and per room and travels with a save the same
       way a position does. Anything never flipped simply has no flag. */
    function isDecorFlipped(id) {
      const p = roomData.placedDecors && roomData.placedDecors.find(d => d.id === id);
      return !!(p && p.flip);
    }

    /* Draw `paint` mirrored left-to-right about the vertical line through `cx`
       (canvas pixels). Every box below is symmetric about that same line, so a
       mirrored piece keeps its footprint and its tap target exactly — the only
       thing that turns round is what is painted inside it. */
    function drawMirrored(ctx, cx, flipped, paint) {
      if (!flipped) { paint(); return; }
      ctx.save();
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
      paint();
      ctx.restore();
    }

    /* The hot spring is a picture, not canvas paths. Loaded on FIRST DRAW, not
       on page load: only a player who finished the capybara's collection ever
       places it, so nobody else pays for the download. */
    const ONSEN_W = 0.42;      // drawn width, as a fraction of the room width
    const ONSEN_WATER = 0.42;  // water surface, as a fraction of the spring height
    let _onsenImg = null;
    function onsenArt() {
      if (!_onsenImg) {
        _onsenImg = new Image();
        _onsenImg.src = 'room/img/hotspring.png';
      }
      return _onsenImg;
    }

    /* The spring's water surface, which is where a soaking pet is parked — its
       cropped artwork is cut off exactly at that line. The height depends on
       the room's width and the picture's shape, both of which live here, so
       the pet code asks instead of guessing an offset. Null with no spring. */
    function onsenSoakPoint(rw, rh) {
      if (!hasDecor('decor_capybara_onsen')) return null;
      const art = onsenArt();
      if (!art.naturalWidth) return null;
      const pos = getDecorPos('decor_capybara_onsen');
      const h = rw * ONSEN_W * art.naturalHeight / art.naturalWidth;
      // baseY is where the spring STANDS, which is not where a pet in it is
      // drawn: the water is a good way up the picture. The caller needs both —
      // one to place the pet, the other to size it, since how far away a thing
      // looks is set by where it stands.
      return { x: pos.x, y: pos.y - h * ONSEN_WATER / rh, baseY: pos.y };
    }

    function drawRug(ctx, rw, rh, floorY) {
      // Find placed rug
      const placedRug = (roomData.placedDecors || []).find(d => d.id.startsWith('rug_'));

      ctx.save();
      const pos = placedRug ? placedRug : null;
      const rugCX = pos ? pos.x * rw : rw * 0.38;
      const rugCY = pos ? pos.y * rh : floorY + (rh - floorY) * 0.5;
      const rugRX = rw * 0.13, rugRY = (rh - floorY) * 0.2;

      /* A mirrored rug turns about its own centre. Only the patterned ones
         change — the zebra's slanted stripes, the checker's offset — but the
         flip is offered on every placed piece, so it is honoured on every one. */
      if (placedRug && placedRug.flip) {
        ctx.translate(rugCX, 0); ctx.scale(-1, 1); ctx.translate(-rugCX, 0);
      }

      let fillColor = '#9c3c3c';
      let borderColor = '#8c3232';
      let centerColor = '#b4503c';
      let isStar = false;
      let isRainbow = false;
      let isPersian = false;
      let isZebra = false;
      let isChecker = false;

      if (placedRug) {
        if (placedRug.id === 'rug_blue')  { fillColor = '#3c64b4'; borderColor = '#3250a0'; centerColor = '#5078c8'; }
        else if (placedRug.id === 'rug_green') { fillColor = '#3c9c50'; borderColor = '#32823c'; centerColor = '#50aa5a'; }
        else if (placedRug.id === 'rug_pink')  { fillColor = '#c8508c'; borderColor = '#b43c78'; centerColor = '#dc64a0'; }
        else if (placedRug.id === 'rug_star')  { fillColor = '#b4963c'; borderColor = '#a08228'; centerColor = '#c8aa50'; isStar = true; }
        else if (placedRug.id === 'rug_rainbow') { isRainbow = true; fillColor = '#c8b43c'; borderColor = '#b4a028'; }
        else if (placedRug.id === 'rug_cream')  { fillColor = '#e8dcc0'; borderColor = '#d2c8b4'; centerColor = '#e0d4c0'; }
        else if (placedRug.id === 'rug_persian') { fillColor = '#8c2828'; borderColor = '#6a1a1a'; centerColor = '#b44040'; isPersian = true; }
        else if (placedRug.id === 'rug_zebra')   { fillColor = '#f0ebe0'; borderColor = '#aaa'; isZebra = true; }
        else if (placedRug.id === 'rug_red')     { fillColor = '#b83030'; borderColor = '#981818'; centerColor = '#d04848'; }
        else if (placedRug.id === 'rug_purple')  { fillColor = '#7040a0'; borderColor = '#5a2e88'; centerColor = '#8858b8'; }
        else if (placedRug.id === 'rug_checker') { fillColor = '#e8e0d0'; borderColor = '#888'; isChecker = true; }
        else if (placedRug.id === 'rug_ocean')   { fillColor = '#2080b0'; borderColor = '#1868a0'; centerColor = '#40a0d0'; }
        else if (placedRug.id === 'rug_forest')  { fillColor = '#2a6a3a'; borderColor = '#1e5a2e'; centerColor = '#3c8a50'; }
        else if (placedRug.id === 'rug_gold')    { fillColor = '#c8a020'; borderColor = '#b08818'; centerColor = '#e0b830'; }
        else if (placedRug.id === 'rug_galaxy')  { fillColor = '#1a1040'; borderColor = '#100830'; centerColor = '#3020a0'; }
        else if (placedRug.id === 'rug_heart')   { fillColor = '#c03060'; borderColor = '#a02848'; centerColor = '#e04878'; }
      }

      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.ellipse(rugCX, rugCY + 3, rugRX + 2, rugRY + 2, 0, 0, Math.PI * 2); ctx.fill();

      if (isRainbow) {
        // Rainbow concentric rings
        const rainColors = ['#e04040','#e88a28','#e0d020','#28c828','#2870e0','#8020e0'];
        for (let i = 0; i < rainColors.length; i++) {
          const scale = 1 - i * 0.13;
          ctx.fillStyle = rainColors[i];
          ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * scale, rugRY * scale, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (isZebra) {
        // Zebra stripe rug
        ctx.fillStyle = fillColor;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.fill();
        // Clip to ellipse for stripes
        ctx.save();
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX - 1, rugRY - 1, 0, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = 'rgba(30,30,30,0.7)';
        const stripeCount = 9;
        for (let i = 0; i < stripeCount; i++) {
          const sx = rugCX - rugRX + (i * 2 + 1) * rugRX / stripeCount;
          ctx.save(); ctx.translate(sx, rugCY); ctx.rotate(0.12);
          const sw = rugRX / stripeCount * 0.6;
          ctx.fillRect(-sw / 2, -rugRY, sw, rugRY * 2);
          ctx.restore();
        }
        ctx.restore();
        ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (isChecker) {
        // Checker pattern rug
        ctx.fillStyle = fillColor;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX - 1, rugRY - 1, 0, 0, Math.PI * 2); ctx.clip();
        const sqSize = rugRX * 0.22;
        const cols = Math.ceil(rugRX * 2 / sqSize);
        const rows = Math.ceil(rugRY * 2 / sqSize);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if ((r + c) % 2 === 0) {
              ctx.fillStyle = '#3a3a3a';
              ctx.fillRect(rugCX - rugRX + c * sqSize, rugCY - rugRY + r * sqSize, sqSize, sqSize);
            }
          }
        }
        ctx.restore();
        ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (isPersian) {
        // Persian ornate rug
        ctx.fillStyle = fillColor;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.fill();
        // Outer border ring
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * 0.92, rugRY * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
        // Inner border ring
        ctx.strokeStyle = '#e8c868'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * 0.78, rugRY * 0.78, 0, 0, Math.PI * 2); ctx.stroke();
        // Ornamental dots around the ring
        ctx.fillStyle = '#c8a040';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(rugCX + Math.cos(a) * rugRX * 0.85, rugCY + Math.sin(a) * rugRY * 0.85, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Central medallion
        ctx.fillStyle = '#b44040';
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * 0.3, rugRY * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e8c868'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * 0.3, rugRY * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        // Diamond in center
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rugCX, rugCY - rugRY * 0.2); ctx.lineTo(rugCX + rugRX * 0.15, rugCY);
        ctx.lineTo(rugCX, rugCY + rugRY * 0.2); ctx.lineTo(rugCX - rugRX * 0.15, rugCY);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#d4a040';
        ctx.beginPath(); ctx.arc(rugCX, rugCY, 3, 0, Math.PI * 2); ctx.fill();
        // Outer edge
        ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = fillColor;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX, rugRY, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * 0.78, rugRY * 0.78, 0, 0, Math.PI * 2); ctx.stroke();
        if (isStar) {
          ctx.fillStyle = centerColor;
          const sr = rugRX * 0.25;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
            const method = i === 0 ? 'moveTo' : 'lineTo';
            ctx[method](rugCX + Math.cos(a) * sr, rugCY + Math.sin(a) * sr * (rugRY / rugRX));
          }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = centerColor;
          ctx.beginPath(); ctx.ellipse(rugCX, rugCY, rugRX * 0.35, rugRY * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    /* ── Decoration artwork ──
       Every piece of furniture and every wall hanging is a picture rather than
       canvas paths, so the room shows the same thing the shop card promises.
       `w` is the drawn width as a fraction of the room width — the hot spring
       above is sized the same way — and the height follows each picture's own
       shape, so nothing is squashed. Floor pieces are anchored at the bottom
       because they stand on the floor; wall pieces hang, so they are centred on
       their hook instead.

       The widths are calibrated against what each object really measures, but
       only part of the way there: a strictly-to-scale bluetooth speaker next to
       a strictly-to-scale piano is a speck nobody can see or grab. Each piece is
       pulled a little under halfway from its own scale toward the set's common
       one, which leaves the room reading as a room — a lamp taller than the
       table beside it — while keeping the small things findable. The tank is the
       one deliberate exception: tapping it opens the aquarium, so its picture is
       also its tap target and has to stay thumb-sized. */
    const DECOR_ART = {
      // Floor furniture
      floorlamp:  { dir: 'furniture', w: 0.080 },
      sidetable:  { dir: 'furniture', w: 0.061 },
      cushion:    { dir: 'furniture', w: 0.049 },
      toybox:     { dir: 'furniture', w: 0.062 },
      bookcase:   { dir: 'furniture', w: 0.116 },
      // The tank is drawn a size up on purpose: tapping it opens the aquarium,
      // and the picture is the tap target now, so it has to stay thumb-sized.
      aquarium:   { dir: 'furniture', w: 0.095 },
      guitar:     { dir: 'furniture', w: 0.065 },
      globe:      { dir: 'furniture', w: 0.079 },
      trashcan:   { dir: 'furniture', w: 0.046 },
      fan:        { dir: 'furniture', w: 0.074 },
      beanpillow: { dir: 'furniture', w: 0.098 },
      tv:         { dir: 'furniture', w: 0.075 },
      piano:      { dir: 'furniture', w: 0.146 },
      telescope:  { dir: 'furniture', w: 0.095 },
      cactus:     { dir: 'furniture', w: 0.048 },
      candles:    { dir: 'furniture', w: 0.034 },
      skateboard: { dir: 'furniture', w: 0.103 },
      vinylplayer:{ dir: 'furniture', w: 0.049 },
      umbrella:   { dir: 'furniture', w: 0.049 },
      terrarium:  { dir: 'furniture', w: 0.046 },
      xmastree:   { dir: 'furniture', w: 0.146 },
      coffeemaker:{ dir: 'furniture', w: 0.044 },
      gaming:     { dir: 'furniture', w: 0.038 },
      camera:     { dir: 'furniture', w: 0.086 },
      fountain:   { dir: 'furniture', w: 0.061 },
      chessset:   { dir: 'furniture', w: 0.067 },
      bonsai:     { dir: 'furniture', w: 0.052 },
      speaker2:   { dir: 'furniture', w: 0.025 },
      shoe_rack:  { dir: 'furniture', w: 0.087 },
      rocket:     { dir: 'furniture', w: 0.032 },
      minifridge: { dir: 'furniture', w: 0.081 },
      // The pet collection rewards. Bigger than the shop furniture because each
      // one is a whole habitat rather than a single object, and sized straight
      // onto the set's common scale — they are new, so there is no old drawing
      // to stay compatible with.
      decor_cat_throne:         { dir: 'furniture', w: 0.115 },
      decor_dog_doghouse:       { dir: 'furniture', w: 0.149 },
      decor_bunny_garden:       { dir: 'furniture', w: 0.232 },
      decor_hamster_playground: { dir: 'furniture', w: 0.139 },
      decor_fox_den:            { dir: 'furniture', w: 0.156 },
      decor_panda_garden:       { dir: 'furniture', w: 0.255 },
      decor_goose_pond:         { dir: 'furniture', w: 0.209 },
      decor_tom_armchair:       { dir: 'furniture', w: 0.146 },
      decor_jerry_mousehole:    { dir: 'furniture', w: 0.152 },
      // Wall hangings
      clock:       { dir: 'wall', w: 0.056, hangs: true },
      shelf:       { dir: 'wall', w: 0.119, hangs: true },
      hangplant:   { dir: 'wall', w: 0.068, hangs: true },
      stringlights:{ dir: 'wall', w: 0.382, hangs: true },
      banner:      { dir: 'wall', w: 0.070, hangs: true },
      photo:       { dir: 'wall', w: 0.066, hangs: true },
      mirror:      { dir: 'wall', w: 0.069, hangs: true },
      antlers:     { dir: 'wall', w: 0.101, hangs: true },
      neon:        { dir: 'wall', w: 0.100, hangs: true },
      poster:      { dir: 'wall', w: 0.067, hangs: true },
      dartboard:   { dir: 'wall', w: 0.072, hangs: true },
      wreath:      { dir: 'wall', w: 0.076, hangs: true },
      tapestry:    { dir: 'wall', w: 0.087, hangs: true },
      sconce:      { dir: 'wall', w: 0.045, hangs: true },
      map:         { dir: 'wall', w: 0.143, hangs: true },
      cuckoo:      { dir: 'wall', w: 0.054, hangs: true },
      macrame:     { dir: 'wall', w: 0.079, hangs: true },
      thermometer: { dir: 'wall', w: 0.025, hangs: true },
      plate:       { dir: 'wall', w: 0.054, hangs: true },
      butterfly:   { dir: 'wall', w: 0.061, hangs: true },
      medal:       { dir: 'wall', w: 0.072, hangs: true },
      lantern:     { dir: 'wall', w: 0.054, hangs: true },
      dreamcatcher:{ dir: 'wall', w: 0.049, hangs: true },
      speaker:     { dir: 'wall', w: 0.047, hangs: true },
      mask:        { dir: 'wall', w: 0.081, hangs: true },
      calendar:    { dir: 'wall', w: 0.067, hangs: true },
      katana:      { dir: 'wall', w: 0.134, hangs: true },
      diploma:     { dir: 'wall', w: 0.074, hangs: true },
    };

    const _decorImgs = {};

    /* Loaded on FIRST DRAW, not on page load: a room only pays for the pieces
       it actually owns. Null for anything with no artwork of its own. */
    function decorArt(id) {
      if (!DECOR_ART[id]) return null;
      let img = _decorImgs[id];
      if (!img) {
        img = _decorImgs[id] = new Image();
        img.src = 'room/img/' + DECOR_ART[id].dir + '/' + id + '.png';
      }
      return img;
    }

    /* Where a piece lands on the canvas. The height depends on the picture's
       shape, so there is no box until the file has arrived. */
    function decorArtBox(id, x, y, rw, rh) {
      const spec = DECOR_ART[id];
      const art = decorArt(id);
      if (!art || !art.naturalWidth) return null;
      const w = rw * spec.w;
      const h = w * art.naturalHeight / art.naturalWidth;
      return { art, x: x * rw - w / 2, y: y * rh - (spec.hangs ? h / 2 : h), w, h };
    }

    /* The picture for any decoration that has one, hot spring included. The
       spring is drawn by its own code because a pet soaks in it and the water
       line has to be known, but to anything that only wants to SHOW the thing —
       the collection grid, a shop card — it is just another picture. */
    function decorArtAny(id) {
      return id === 'decor_capybara_onsen' ? onsenArt() : decorArt(id);
    }

    /* The same box in room fractions, which is what the drag code hit-tests in.
       Asking rather than keeping a second copy is what stops what you grab from
       drifting away from what you see. */
    function decorArtHitBox(id, x, y) {
      const room = document.getElementById('roomView');
      if (!room || !room.clientWidth || !room.clientHeight) return null;
      const b = decorArtBox(id, x, y, room.clientWidth, room.clientHeight);
      if (!b) return null;
      return {
        x0: b.x / room.clientWidth,  x1: (b.x + b.w) / room.clientWidth,
        y0: b.y / room.clientHeight, y1: (b.y + b.h) / room.clientHeight,
      };
    }

    /* Draws every placed decoration of one kind. `order` sorts them; the floor
       needs it so a piece standing further down covers what is behind it, the
       wall is flat and keeps whatever order they were placed in. */
    function drawDecorArt(ctx, rw, rh, hangs, order) {
      const placed = (roomData.placedDecors || [])
        .filter(d => DECOR_ART[d.id] && !!DECOR_ART[d.id].hangs === hangs);
      if (order) placed.sort(order);
      placed.forEach(d => {
        const box = decorArtBox(d.id, d.x, d.y, rw, rh);
        if (!box) return;
        drawMirrored(ctx, box.x + box.w / 2, d.flip, () => {
          ctx.drawImage(box.art, box.x, box.y, box.w, box.h);
        });
      });
    }

    /* Emoji stand-in for decorations that have no artwork yet — the pet
       collection rewards, and anything added to the catalogue before its
       picture exists. */
    function drawDecorEmoji(ctx, rw, rh, category, size) {
      (roomData.placedDecors || []).filter(d => {
        if (DECOR_ART[d.id] || d.id === 'decor_capybara_onsen') return false;
        const def = DECORATIONS.find(x => x.id === d.id);
        return def && def.category === category;
      }).forEach(d => {
        const def = DECORATIONS.find(x => x.id === d.id);
        ctx.save();
        ctx.font = Math.round(rw * size) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        drawMirrored(ctx, d.x * rw, d.flip, () => {
          ctx.fillText(def.emoji, d.x * rw, d.y * rh);
        });
        ctx.restore();
      });
    }

    function drawWallDecorations(ctx, rw, rh) {
      drawDecorArt(ctx, rw, rh, true, null);
      drawDecorEmoji(ctx, rw, rh, 'wall', 0.06);
    }


    function drawFloorDecorations(ctx, rw, rh) {
      /* Back to front. A piece standing further down the floor is nearer the
         viewer, so it has to cover whatever stands behind it. */
      drawDecorArt(ctx, rw, rh, false, (a, b) => a.y - b.y);

      // The capybara's collection reward, drawn last: a pet soaks in it, so the
      // pool has to read as the front-most thing on the floor.
      if (hasDecor('decor_capybara_onsen')) {
        const art = onsenArt();
        if (art.naturalWidth) {
          const pos = getDecorPos('decor_capybara_onsen');
          const w = rw * ONSEN_W;
          const h = w * art.naturalHeight / art.naturalWidth;
          // pos.y is the base line, same convention the furniture uses. The
          // mirror turns about the spring's centre, which is exactly where a
          // soaking pet is parked — so flipping the bath never moves the bather.
          drawMirrored(ctx, pos.x * rw, pos.flip, () => {
            ctx.drawImage(art, pos.x * rw - w / 2, pos.y * rh - h, w, h);
          });
        }
      }

      drawDecorEmoji(ctx, rw, rh, 'floor', 0.07);
    }
