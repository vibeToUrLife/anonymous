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

    function drawRug(ctx, rw, rh, floorY) {
      // Find placed rug
      const placedRug = (roomData.placedDecors || []).find(d => d.id.startsWith('rug_'));

      ctx.save();
      const pos = placedRug ? placedRug : null;
      const rugCX = pos ? pos.x * rw : rw * 0.38;
      const rugCY = pos ? pos.y * rh : floorY + (rh - floorY) * 0.5;
      const rugRX = rw * 0.13, rugRY = (rh - floorY) * 0.2;

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

    function drawWallDecorations(ctx, rw, rh, floorY, t) {
      // String lights — spans full width, y-position from stored pos
      if (hasDecor('stringlights')) {
        ctx.save();
        const pos = getDecorPos('stringlights');
        const lY = pos.y * rh;
        ctx.strokeStyle = 'rgba(120,100,80,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, lY + 6);
        for (let x = 0; x <= rw; x += 20) {
          ctx.lineTo(x, lY + 6 + Math.sin(x * 0.03) * 5);
        }
        ctx.stroke();
        const colors = ['#ffdd57','#ff6b6b','#48dbfb','#ff9ff3','#55efc4','#fd79a8'];
        for (let i = 0; i < Math.floor(rw / 28); i++) {
          const bx = 14 + i * 28;
          const by = lY + 8 + Math.sin(bx * 0.03) * 5;
          const glow = 0.3 + Math.sin(t / 600 + i * 0.8) * 0.15;
          ctx.fillStyle = colors[i % colors.length];
          ctx.globalAlpha = glow + 0.4;
          ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = glow * 0.3;
          ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Wall clock
      if (hasDecor('clock')) {
        ctx.save();
        const pos = getDecorPos('clock');
        const cx = pos.x * rw, cy = pos.y * rh, cr = rw * 0.035;
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath(); ctx.arc(cx + 1, cy + 2, cr + 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f5efe6';
        ctx.strokeStyle = '#8B7355'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(139,115,85,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, cr * 0.85, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#6d5a42';
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI * 2 / 12) - Math.PI / 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * cr * 0.72, cy + Math.sin(a) * cr * 0.72, 1.2, 0, Math.PI * 2); ctx.fill();
        }
        const now = new Date();
        const sec = now.getSeconds() + now.getMilliseconds() / 1000;
        const min = now.getMinutes() + sec / 60;
        const hr = (now.getHours() % 12) + min / 60;
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        const ha = (hr / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * cr * 0.45, cy + Math.sin(ha) * cr * 0.45); ctx.stroke();
        ctx.lineWidth = 1.5;
        const ma = (min / 60) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ma) * cr * 0.65, cy + Math.sin(ma) * cr * 0.65); ctx.stroke();
        ctx.strokeStyle = '#c44'; ctx.lineWidth = 0.7;
        const sa = (sec / 60) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sa) * cr * 0.7, cy + Math.sin(sa) * cr * 0.7); ctx.stroke();
        ctx.fillStyle = '#4a3a2a';
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Book shelf
      if (hasDecor('shelf')) {
        ctx.save();
        const pos = getDecorPos('shelf');
        const sx = pos.x * rw, sy = pos.y * rh, sw = rw * 0.12, sh = 6;
        ctx.fillStyle = '#7a6550';
        ctx.fillRect(sx + sw * 0.15, sy + sh, 3, 10);
        ctx.fillRect(sx + sw * 0.75, sy + sh, 3, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(sx + 1, sy + 2, sw, sh + 2);
        ctx.fillStyle = '#a08868';
        roundRectPath(ctx, sx, sy, sw, sh, 1);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(sx, sy, sw, 2);
        const bookColors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6'];
        let bx = sx + 3;
        for (let i = 0; i < 5; i++) {
          const bw = sw * 0.12 + (i % 3) * 2;
          const bh = 14 + (i % 2) * 4;
          ctx.fillStyle = bookColors[i];
          roundRectPath(ctx, bx, sy - bh, bw, bh, 1);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, sy - bh + 3); ctx.lineTo(bx + bw * 0.5, sy - 2); ctx.stroke();
          bx += bw + 1.5;
        }
        ctx.restore();
      }

      // Hanging plant
      if (hasDecor('hangplant')) {
        ctx.save();
        const pos = getDecorPos('hangplant');
        const hx = pos.x * rw, hy = pos.y * rh;
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(hx, hy, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c8b898'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        const potY = hy + rh * 0.12;
        ctx.beginPath(); ctx.moveTo(hx - 8, potY - 4); ctx.quadraticCurveTo(hx - 4, hy + 4, hx, hy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 8, potY - 4); ctx.quadraticCurveTo(hx + 4, hy + 4, hx, hy); ctx.stroke();
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(hx - 6, potY - 15); ctx.lineTo(hx + 6, potY - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 6, potY - 15); ctx.lineTo(hx - 6, potY - 8); ctx.stroke();
        ctx.fillStyle = '#c97b4b';
        ctx.beginPath();
        ctx.moveTo(hx - 9, potY - 4); ctx.lineTo(hx - 7, potY + 8); ctx.lineTo(hx + 7, potY + 8); ctx.lineTo(hx + 9, potY - 4); ctx.fill();
        ctx.fillStyle = '#b56a3a';
        ctx.fillRect(hx - 10, potY - 6, 20, 3);
        ctx.strokeStyle = '#5a9a4a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        const sway = Math.sin(t / 2000) * 2;
        ctx.beginPath(); ctx.moveTo(hx - 3, potY - 2); ctx.quadraticCurveTo(hx - 18 + sway, potY + 10, hx - 14 + sway, potY + 22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 3, potY - 2); ctx.quadraticCurveTo(hx + 16 + sway, potY + 8, hx + 18 + sway, potY + 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx, potY - 3); ctx.quadraticCurveTo(hx - 10 + sway, potY + 14, hx - 6 + sway, potY + 26); ctx.stroke();
        ctx.fillStyle = '#6aaa4c';
        [-14, 6, 18].forEach((ox, i) => {
          const lx = hx + ox + sway * (i % 2 ? 1 : -1);
          const ly = potY + 16 + i * 3;
          ctx.beginPath(); ctx.ellipse(lx, ly, 5, 3, (i - 1) * 0.4, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }

      // Wall banner
      if (hasDecor('banner')) {
        ctx.save();
        const pos = getDecorPos('banner');
        const bx = pos.x * rw, by = pos.y * rh;
        const bw = rw * 0.05, bh = rh * 0.16;
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(bx - 2, by, bw + 4, 3);
        const banGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
        banGrad.addColorStop(0, '#e85d75');
        banGrad.addColorStop(1, '#c44060');
        ctx.fillStyle = banGrad;
        ctx.beginPath();
        ctx.moveTo(bx, by + 3); ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx + bw / 2, by + bh - 10);
        ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        const dcx = bx + bw / 2, dcy = by + bh * 0.4;
        ctx.beginPath();
        ctx.moveTo(dcx, dcy - 8); ctx.lineTo(dcx + 6, dcy);
        ctx.lineTo(dcx, dcy + 8); ctx.lineTo(dcx - 6, dcy);
        ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = '#d4a040'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx + bw / 2, by + bh - 10); ctx.lineTo(bx + bw / 2, by + bh - 2); ctx.stroke();
        ctx.fillStyle = '#d4a040';
        ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh - 1, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Photo frame
      if (hasDecor('photo')) {
        ctx.save();
        const pos = getDecorPos('photo');
        const px = pos.x * rw, py = pos.y * rh, pw = rw * 0.07, ph = rw * 0.055;
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(px - pw/2 + 2, py - ph/2 + 2, pw, ph);
        ctx.fillStyle = '#8B6F47';
        ctx.fillRect(px - pw/2 - 3, py - ph/2 - 3, pw + 6, ph + 6);
        ctx.fillStyle = '#f0e6d6';
        ctx.fillRect(px - pw/2, py - ph/2, pw, ph);
        // Photo scene: sky + grass
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(px - pw/2 + 2, py - ph/2 + 2, pw - 4, ph * 0.55);
        ctx.fillStyle = '#7bc96f';
        ctx.fillRect(px - pw/2 + 2, py - ph/2 + 2 + ph * 0.55, pw - 4, ph * 0.4);
        // Sun
        ctx.fillStyle = '#FFD700';
        ctx.beginPath(); ctx.arc(px + pw/4, py - ph/3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Mirror
      if (hasDecor('mirror')) {
        ctx.save();
        const pos = getDecorPos('mirror');
        const mx = pos.x * rw, my = pos.y * rh, mw = rw * 0.05, mh = rw * 0.075;
        ctx.fillStyle = '#B8860B';
        roundRectPath(ctx, mx - mw/2 - 3, my - mh/2 - 3, mw + 6, mh + 6, 6);
        ctx.fill();
        const mirGrad = ctx.createLinearGradient(mx - mw/2, my - mh/2, mx + mw/2, my + mh/2);
        mirGrad.addColorStop(0, '#e8f4fd');
        mirGrad.addColorStop(0.4, '#d6eaf8');
        mirGrad.addColorStop(1, '#aed6f1');
        ctx.fillStyle = mirGrad;
        roundRectPath(ctx, mx - mw/2, my - mh/2, mw, mh, 4);
        ctx.fill();
        // Shine
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(mx - mw*0.3, my - mh*0.3); ctx.lineTo(mx - mw*0.1, my - mh*0.1); ctx.stroke();
        ctx.restore();
      }

      // Antlers
      if (hasDecor('antlers')) {
        ctx.save();
        const pos = getDecorPos('antlers');
        const ax = pos.x * rw, ay = pos.y * rh;
        ctx.strokeStyle = '#8B6F47'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        // Left antler
        ctx.beginPath(); ctx.moveTo(ax, ay + 8); ctx.quadraticCurveTo(ax - 16, ay - 2, ax - 22, ay - 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 14, ay - 4); ctx.lineTo(ax - 20, ay - 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 18, ay - 10); ctx.lineTo(ax - 26, ay - 18); ctx.stroke();
        // Right antler
        ctx.beginPath(); ctx.moveTo(ax, ay + 8); ctx.quadraticCurveTo(ax + 16, ay - 2, ax + 22, ay - 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + 14, ay - 4); ctx.lineTo(ax + 20, ay - 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + 18, ay - 10); ctx.lineTo(ax + 26, ay - 18); ctx.stroke();
        // Mount plate
        ctx.fillStyle = '#6B4226';
        ctx.beginPath(); ctx.ellipse(ax, ay + 10, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8B6F47';
        ctx.beginPath(); ctx.ellipse(ax, ay + 10, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Neon sign
      if (hasDecor('neon')) {
        ctx.save();
        const pos = getDecorPos('neon');
        const nx = pos.x * rw, ny = pos.y * rh;
        const glow = 0.6 + Math.sin(t / 400) * 0.2;
        ctx.shadowColor = '#ff6ec7'; ctx.shadowBlur = 12 * glow;
        ctx.strokeStyle = 'rgba(255,110,199,' + glow + ')';
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.font = (rw * 0.028) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(255,110,199,' + glow + ')';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HELLO', nx, ny);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Poster
      if (hasDecor('poster')) {
        ctx.save();
        const pos = getDecorPos('poster');
        const px = pos.x * rw, py = pos.y * rh, pw = rw * 0.06, ph = rw * 0.08;
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(px - pw/2 + 1, py - ph/2 + 1, pw, ph);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(px - pw/2, py - ph/2, pw, ph);
        // Abstract art
        ctx.fillStyle = '#e94560';
        ctx.beginPath(); ctx.arc(px - pw * 0.15, py - ph * 0.1, pw * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f3460';
        ctx.fillRect(px, py - ph * 0.2, pw * 0.3, ph * 0.4);
        ctx.fillStyle = '#f9a825';
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.1, py + ph * 0.3);
        ctx.lineTo(px - pw * 0.2, py + ph * 0.1);
        ctx.lineTo(px + pw * 0.35, py + ph * 0.15);
        ctx.fill();
        ctx.restore();
      }

      // Dartboard
      if (hasDecor('dartboard')) {
        ctx.save();
        const pos = getDecorPos('dartboard');
        const dx = pos.x * rw, dy = pos.y * rh, dr = rw * 0.035;
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath(); ctx.arc(dx + 1, dy + 2, dr + 2, 0, Math.PI * 2); ctx.fill();
        const rings = [[dr, '#1a1a1a'], [dr * 0.85, '#c0392b'], [dr * 0.65, '#f1f1f1'], [dr * 0.45, '#1a1a1a'], [dr * 0.25, '#c0392b'], [dr * 0.1, '#27ae60']];
        rings.forEach(([r, c]) => {
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
        });
        // Wire frame
        ctx.strokeStyle = 'rgba(200,200,200,0.3)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(a) * dr, dy + Math.sin(a) * dr); ctx.stroke();
        }
        ctx.restore();
      }

      // Wreath
      if (hasDecor('wreath')) {
        ctx.save();
        const pos = getDecorPos('wreath');
        const wx = pos.x * rw, wy = pos.y * rh, wr = rw * 0.032;
        // Hanger
        ctx.fillStyle = '#c44'; ctx.beginPath();
        ctx.moveTo(wx - 4, wy - wr - 2); ctx.lineTo(wx, wy - wr - 8); ctx.lineTo(wx + 4, wy - wr - 2); ctx.fill();
        // Leaves circle
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const lx = wx + Math.cos(a) * wr, ly = wy + Math.sin(a) * wr;
          ctx.fillStyle = i % 3 === 0 ? '#2d8a4e' : '#3da65a';
          ctx.beginPath(); ctx.ellipse(lx, ly, 5, 3, a, 0, Math.PI * 2); ctx.fill();
        }
        // Berries
        ctx.fillStyle = '#c0392b';
        [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].forEach(a => {
          ctx.beginPath(); ctx.arc(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, 2.5, 0, Math.PI * 2); ctx.fill();
        });
        // Bow
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(wx, wy - wr + 2); ctx.quadraticCurveTo(wx - 8, wy - wr - 4, wx - 3, wy - wr + 6);
        ctx.quadraticCurveTo(wx, wy - wr + 2, wx + 3, wy - wr + 6);
        ctx.quadraticCurveTo(wx + 8, wy - wr - 4, wx, wy - wr + 2);
        ctx.fill();
        ctx.restore();
      }

      // Tapestry
      if (hasDecor('tapestry')) {
        ctx.save();
        const pos = getDecorPos('tapestry');
        const tx = pos.x * rw, ty = pos.y * rh;
        const tw = rw * 0.06, th = rw * 0.09;
        // Rod
        ctx.fillStyle = '#8B7355'; ctx.fillRect(tx - tw / 2 - 4, ty - 3, tw + 8, 4);
        ctx.fillStyle = '#6d5a42';
        ctx.beginPath(); ctx.arc(tx - tw / 2 - 4, ty - 1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(tx + tw / 2 + 4, ty - 1, 3, 0, Math.PI * 2); ctx.fill();
        // Fabric
        const tg = ctx.createLinearGradient(tx - tw / 2, ty, tx - tw / 2, ty + th);
        tg.addColorStop(0, '#8B2252'); tg.addColorStop(0.5, '#a0304a'); tg.addColorStop(1, '#6B1838');
        ctx.fillStyle = tg;
        ctx.fillRect(tx - tw / 2, ty + 1, tw, th);
        // Geometric diamond pattern
        ctx.strokeStyle = '#d4a040'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty + th * 0.12); ctx.lineTo(tx + tw * 0.4, ty + th * 0.5);
        ctx.lineTo(tx, ty + th * 0.88); ctx.lineTo(tx - tw * 0.4, ty + th * 0.5);
        ctx.closePath(); ctx.stroke();
        // Inner diamond
        ctx.strokeStyle = '#e8c86a'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(tx, ty + th * 0.25); ctx.lineTo(tx + tw * 0.25, ty + th * 0.5);
        ctx.lineTo(tx, ty + th * 0.75); ctx.lineTo(tx - tw * 0.25, ty + th * 0.5);
        ctx.closePath(); ctx.stroke();
        // Center medallion
        ctx.fillStyle = '#d4a040';
        ctx.beginPath(); ctx.arc(tx, ty + th * 0.5, 3, 0, Math.PI * 2); ctx.fill();
        // Tassels
        ctx.strokeStyle = '#d4a040'; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const fx = tx - tw / 2 + 3 + i * (tw - 6) / 4;
          ctx.beginPath(); ctx.moveTo(fx, ty + th + 1); ctx.lineTo(fx, ty + th + 8); ctx.stroke();
        }
        ctx.restore();
      }

      // Wall sconce
      if (hasDecor('sconce')) {
        ctx.save();
        const pos = getDecorPos('sconce');
        const sx = pos.x * rw, sy = pos.y * rh;
        const glow = 0.5 + Math.sin(t / 500) * 0.15;
        // Warm glow behind
        ctx.fillStyle = 'rgba(255,200,80,' + (glow * 0.08) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, rw * 0.05, 0, Math.PI * 2); ctx.fill();
        // Mount plate
        ctx.fillStyle = '#B8860B';
        roundRectPath(ctx, sx - 6, sy - 16, 12, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#DAA520';
        ctx.fillRect(sx - 4, sy - 14, 8, 10);
        // Arm
        ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy - 4); ctx.quadraticCurveTo(sx + 12, sy - 2, sx + 10, sy + 6); ctx.stroke();
        // Cup
        ctx.fillStyle = '#DAA520';
        ctx.beginPath();
        ctx.moveTo(sx + 4, sy + 6); ctx.lineTo(sx + 5, sy + 12); ctx.lineTo(sx + 15, sy + 12); ctx.lineTo(sx + 16, sy + 6);
        ctx.fill();
        // Candle
        ctx.fillStyle = '#f5f0e0';
        ctx.fillRect(sx + 7, sy - 4, 6, 10);
        // Wick
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(sx + 10, sy - 4); ctx.lineTo(sx + 10, sy - 6); ctx.stroke();
        // Flame
        ctx.fillStyle = 'rgba(255,170,50,' + glow + ')';
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy - 14); ctx.quadraticCurveTo(sx + 14, sy - 8, sx + 10, sy - 6);
        ctx.quadraticCurveTo(sx + 6, sy - 8, sx + 10, sy - 14);
        ctx.fill();
        // Inner flame
        ctx.fillStyle = 'rgba(255,240,150,' + (glow * 0.8) + ')';
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy - 12); ctx.quadraticCurveTo(sx + 12, sy - 9, sx + 10, sy - 7);
        ctx.quadraticCurveTo(sx + 8, sy - 9, sx + 10, sy - 12);
        ctx.fill();
        ctx.restore();
      }

      // World map
      if (hasDecor('map')) {
        ctx.save();
        const pos = getDecorPos('map');
        const mx = pos.x * rw, my = pos.y * rh;
        const mw = rw * 0.08, mh = rw * 0.055;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(mx - mw / 2 + 2, my - mh / 2 + 2, mw, mh);
        // Frame
        ctx.fillStyle = '#6B4226';
        ctx.fillRect(mx - mw / 2 - 3, my - mh / 2 - 3, mw + 6, mh + 6);
        // Parchment
        const pg = ctx.createLinearGradient(mx - mw / 2, my - mh / 2, mx - mw / 2, my + mh / 2);
        pg.addColorStop(0, '#f5e6c8'); pg.addColorStop(1, '#e8d4a8');
        ctx.fillStyle = pg;
        ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
        // Ocean tint
        ctx.fillStyle = 'rgba(100,160,200,0.2)';
        ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
        // Continents
        ctx.fillStyle = '#c8b078';
        const ox = mx - mw / 2, oy = my - mh / 2;
        ctx.beginPath(); ctx.ellipse(ox + mw * 0.22, oy + mh * 0.32, mw * 0.08, mh * 0.14, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ox + mw * 0.28, oy + mh * 0.65, mw * 0.05, mh * 0.14, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ox + mw * 0.52, oy + mh * 0.35, mw * 0.04, mh * 0.15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ox + mw * 0.52, oy + mh * 0.65, mw * 0.04, mh * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ox + mw * 0.74, oy + mh * 0.35, mw * 0.1, mh * 0.14, 0, 0, Math.PI * 2); ctx.fill();
        // Compass
        ctx.fillStyle = '#a08040'; ctx.font = (mw * 0.08) + 'px serif'; ctx.textAlign = 'center';
        ctx.fillText('N', ox + mw * 0.88, oy + mh * 0.85);
        // Grid lines
        ctx.strokeStyle = 'rgba(160,128,64,0.15)'; ctx.lineWidth = 0.5;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(ox, oy + mh * i / 4); ctx.lineTo(ox + mw, oy + mh * i / 4); ctx.stroke(); }
        for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(ox + mw * i / 6, oy); ctx.lineTo(ox + mw * i / 6, oy + mh); ctx.stroke(); }
        ctx.restore();
      }

      // Cuckoo clock
      if (hasDecor('cuckoo')) {
        ctx.save();
        const pos = getDecorPos('cuckoo');
        const cx = pos.x * rw, cy = pos.y * rh;
        const cw = rw * 0.035, ch = rw * 0.06;
        // Body
        ctx.fillStyle = '#6B4226';
        ctx.fillRect(cx - cw / 2, cy - ch * 0.3, cw, ch);
        // Roof
        ctx.fillStyle = '#5a3518';
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.6, cy - ch * 0.3);
        ctx.lineTo(cx, cy - ch * 0.65);
        ctx.lineTo(cx + cw * 0.6, cy - ch * 0.3);
        ctx.fill();
        // Face circle
        ctx.fillStyle = '#f5efe6';
        ctx.beginPath(); ctx.arc(cx, cy, cw * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, cw * 0.32, 0, Math.PI * 2); ctx.stroke();
        // Hands
        const now = new Date();
        const hr = (now.getHours() % 12 + now.getMinutes() / 60) * Math.PI / 6 - Math.PI / 2;
        const mn = (now.getMinutes() + now.getSeconds() / 60) * Math.PI / 30 - Math.PI / 2;
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(hr) * cw * 0.18, cy + Math.sin(hr) * cw * 0.18); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(mn) * cw * 0.26, cy + Math.sin(mn) * cw * 0.26); ctx.stroke();
        // Pendulum
        const pendAngle = Math.sin(t / 800) * 0.4;
        const pendY = cy + ch * 0.65;
        const pendX = cx + Math.sin(pendAngle) * cw * 0.25;
        ctx.strokeStyle = '#8B7355'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy + ch * 0.7 - ch * 0.3); ctx.lineTo(pendX, pendY); ctx.stroke();
        ctx.fillStyle = '#c8a040';
        ctx.beginPath(); ctx.arc(pendX, pendY, cw * 0.1, 0, Math.PI * 2); ctx.fill();
        // Door
        ctx.fillStyle = '#5a3518';
        ctx.fillRect(cx - cw * 0.1, cy - ch * 0.3 - 2, cw * 0.2, cw * 0.12);
        ctx.restore();
      }

      // Macramé wall hanging
      if (hasDecor('macrame')) {
        ctx.save();
        const pos = getDecorPos('macrame');
        const mx = pos.x * rw, my = pos.y * rh;
        const mw = rw * 0.035, mh = rw * 0.07;
        // Rod
        ctx.fillStyle = '#a08060';
        ctx.fillRect(mx - mw * 0.6, my, mw * 1.2, 3);
        // Main weave pattern
        ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 2;
        const strands = 7;
        for (let i = 0; i < strands; i++) {
          const sx = mx - mw * 0.5 + (mw / (strands - 1)) * i;
          ctx.beginPath(); ctx.moveTo(sx, my + 3);
          for (let y = 0; y < mh; y += 6) {
            const wave = Math.sin(y * 0.15 + i * 0.8) * mw * 0.08;
            ctx.lineTo(sx + wave, my + 3 + y);
          }
          ctx.stroke();
        }
        // Horizontal knots
        ctx.strokeStyle = '#d4c8b0'; ctx.lineWidth = 2.5;
        for (let j = 0; j < 3; j++) {
          const ky = my + 3 + mh * (0.2 + j * 0.25);
          ctx.beginPath(); ctx.moveTo(mx - mw * 0.4, ky); ctx.lineTo(mx + mw * 0.4, ky); ctx.stroke();
        }
        // Fringe at bottom
        ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 1;
        for (let i = 0; i < 9; i++) {
          const fx = mx - mw * 0.4 + (mw * 0.8 / 8) * i;
          const flen = mh * 0.15 + Math.sin(i * 1.2) * mh * 0.05;
          ctx.beginPath(); ctx.moveTo(fx, my + 3 + mh * 0.85); ctx.lineTo(fx, my + 3 + mh * 0.85 + flen); ctx.stroke();
        }
        ctx.restore();
      }

      // Thermometer
      if (hasDecor('thermometer')) {
        ctx.save();
        const pos = getDecorPos('thermometer');
        const tx = pos.x * rw, ty = pos.y * rh;
        const tw = rw * 0.012, th = rw * 0.05;
        // Backing
        ctx.fillStyle = '#f0e8d8';
        roundRectPath(ctx, tx - tw, ty - th / 2, tw * 2, th, tw * 0.4); ctx.fill();
        ctx.strokeStyle = '#b0a080'; ctx.lineWidth = 1;
        roundRectPath(ctx, tx - tw, ty - th / 2, tw * 2, th, tw * 0.4); ctx.stroke();
        // Mercury tube
        ctx.fillStyle = '#ddd';
        ctx.fillRect(tx - tw * 0.15, ty - th * 0.35, tw * 0.3, th * 0.7);
        // Mercury level (animated slightly)
        const level = 0.4 + Math.sin(t / 5000) * 0.08;
        ctx.fillStyle = '#e03030';
        ctx.fillRect(tx - tw * 0.15, ty - th * 0.35 + th * 0.7 * (1 - level), tw * 0.3, th * 0.7 * level);
        // Bulb
        ctx.fillStyle = '#e03030';
        ctx.beginPath(); ctx.arc(tx, ty + th * 0.4, tw * 0.3, 0, Math.PI * 2); ctx.fill();
        // Tick marks
        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 5; i++) {
          const yy = ty - th * 0.35 + (th * 0.7 / 4) * i;
          ctx.beginPath(); ctx.moveTo(tx + tw * 0.25, yy); ctx.lineTo(tx + tw * 0.6, yy); ctx.stroke();
        }
        ctx.restore();
      }

      // Decorative plate
      if (hasDecor('plate')) {
        ctx.save();
        const pos = getDecorPos('plate');
        const px = pos.x * rw, py = pos.y * rh;
        const pr = rw * 0.028;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath(); ctx.arc(px + 1, py + 2, pr + 2, 0, Math.PI * 2); ctx.fill();
        // Plate
        ctx.fillStyle = '#f8f4ee';
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        // Rim
        ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, pr * 0.88, 0, Math.PI * 2); ctx.stroke();
        // Inner pattern (little flower)
        ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, pr * 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#2060a0';
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 / 6) * i;
          ctx.beginPath(); ctx.arc(px + Math.cos(a) * pr * 0.3, py + Math.sin(a) * pr * 0.3, pr * 0.08, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#c0382a';
        ctx.beginPath(); ctx.arc(px, py, pr * 0.12, 0, Math.PI * 2); ctx.fill();
        // Bottom decorative dots on rim
        ctx.fillStyle = '#2060a0';
        for (let i = 0; i < 12; i++) {
          const a = (Math.PI * 2 / 12) * i;
          ctx.beginPath(); ctx.arc(px + Math.cos(a) * pr * 0.78, py + Math.sin(a) * pr * 0.78, 1.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // Wall Calendar — detailed canvas-drawn monthly calendar
      if (hasDecor('calendar')) {
        ctx.save();
        const pos = getDecorPos('calendar');
        const cx = pos.x * rw, cy = pos.y * floorY;
        const cw = rw * 0.10, ch = cw * 1.35;
        const left = cx - cw / 2, top = cy - ch / 2;

        // Hanging nail
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(cx, top - 4, 2, 0, Math.PI * 2); ctx.fill();
        // String from nail to calendar
        ctx.strokeStyle = '#999'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, top - 3); ctx.lineTo(cx, top + 2); ctx.stroke();

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        roundRectPath(ctx, left + 2, top + 3, cw, ch, 3);
        ctx.fill();

        // Main paper body with subtle paper texture
        const paperGrad = ctx.createLinearGradient(left, top, left, top + ch);
        paperGrad.addColorStop(0, '#faf8f3');
        paperGrad.addColorStop(1, '#f0ece4');
        ctx.fillStyle = paperGrad;
        roundRectPath(ctx, left, top, cw, ch, 3);
        ctx.fill();
        // Paper border
        ctx.strokeStyle = '#c8c0b0'; ctx.lineWidth = 1;
        roundRectPath(ctx, left, top, cw, ch, 3);
        ctx.stroke();

        // Red header area
        const headerH = ch * 0.18;
        ctx.fillStyle = '#c0392b';
        roundRectPath(ctx, left, top, cw, headerH + 2, 3);
        ctx.fill();
        // Clean bottom edge of header (square corners)
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(left, top + headerH - 2, cw, 4);
        // Subtle gradient on header
        const hGrad = ctx.createLinearGradient(left, top, left, top + headerH);
        hGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
        hGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
        ctx.fillStyle = hGrad;
        ctx.fillRect(left, top, cw, headerH);

        // Month & year in header
        const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
        const now = new Date();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.round(cw * 0.11) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(months[now.getMonth()], cx, top + headerH * 0.35);
        ctx.font = Math.round(cw * 0.08) + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(String(now.getFullYear()), cx, top + headerH * 0.72);

        // Spiral binding between header and body
        const spiralY = top + headerH + 1;
        const spiralCount = 7;
        const spiralStep = (cw - 8) / (spiralCount - 1);
        for (let i = 0; i < spiralCount; i++) {
          const sx = left + 4 + i * spiralStep;
          // Ring shadow
          ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(sx, spiralY + 1, 3, 0, Math.PI * 2); ctx.stroke();
          // Metal ring
          ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(sx, spiralY, 3, 0, Math.PI * 2); ctx.stroke();
          // Highlight
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.arc(sx, spiralY, 2.5, -0.8, 0.5); ctx.stroke();
        }

        // Day grid area
        const gridTop = spiralY + 8;
        const gridBottom = top + ch - 4;
        const gridH = gridBottom - gridTop;
        const cols = 7, rows = 6;
        const gridInset = 4;
        const gridLeft = left + gridInset;
        const gridW = cw - gridInset * 2;
        const cellW = gridW / cols;
        const cellH = gridH / (rows + 1); // +1 for header row

        // Day-of-week header row — gray background
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(gridLeft, gridTop, gridW, cellH);
        // Bottom border for header row
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(gridLeft, gridTop + cellH); ctx.lineTo(gridLeft + gridW, gridTop + cellH); ctx.stroke();

        const dayLabels = ['S','M','T','W','T','F','S'];
        ctx.font = 'bold ' + Math.round(cellW * 0.42) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let c = 0; c < 7; c++) {
          ctx.fillStyle = (c === 0 || c === 6) ? '#c0392b' : '#888';
          ctx.fillText(dayLabels[c], gridLeft + c * cellW + cellW / 2, gridTop + cellH * 0.5);
        }

        // Grid lines (horizontal)
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5;
        for (let r = 2; r <= rows; r++) {
          const ly = gridTop + r * cellH;
          ctx.beginPath(); ctx.moveTo(gridLeft, ly); ctx.lineTo(gridLeft + gridW, ly); ctx.stroke();
        }
        // Grid lines (vertical)
        for (let c = 1; c < cols; c++) {
          const lx = gridLeft + c * cellW;
          ctx.beginPath(); ctx.moveTo(lx, gridTop + cellH); ctx.lineTo(lx, gridBottom); ctx.stroke();
        }

        // Day numbers
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const today = now.getDate();

        ctx.font = Math.round(cellW * 0.40) + 'px sans-serif';
        let day = 1;
        for (let r = 0; r < rows && day <= daysInMonth; r++) {
          for (let c = 0; c < 7 && day <= daysInMonth; c++) {
            if (r === 0 && c < firstDay) continue;
            const dx = gridLeft + c * cellW + cellW / 2;
            const dy = gridTop + (r + 1) * cellH + cellH / 2;

            // Highlight current day with red circle
            if (day === today) {
              ctx.fillStyle = '#c0392b';
              ctx.beginPath(); ctx.arc(dx, dy, cellW * 0.38, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.font = 'bold ' + Math.round(cellW * 0.40) + 'px sans-serif';
            } else {
              ctx.fillStyle = (c === 0 || c === 6) ? '#c0392b' : '#444';
              ctx.font = Math.round(cellW * 0.40) + 'px sans-serif';
            }
            ctx.fillText(String(day), dx, dy);
            day++;
          }
        }

        // Subtle page curl at bottom-right corner
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath();
        ctx.moveTo(left + cw, top + ch);
        ctx.lineTo(left + cw - 6, top + ch);
        ctx.quadraticCurveTo(left + cw - 3, top + ch - 3, left + cw, top + ch - 6);
        ctx.closePath(); ctx.fill();

        ctx.restore();
      }

      // Wall Speaker — canvas-drawn speaker with cone and grille
      if (hasDecor('speaker')) {
        ctx.save();
        const pos = getDecorPos('speaker');
        const sx = pos.x * rw, sy = pos.y * rh;
        const sw = rw * 0.045, sh = rw * 0.055;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        roundRectPath(ctx, sx - sw / 2 + 2, sy - sh / 2 + 2, sw, sh, 4);
        ctx.fill();
        // Body
        ctx.fillStyle = '#222';
        roundRectPath(ctx, sx - sw / 2, sy - sh / 2, sw, sh, 4);
        ctx.fill();
        // Inner panel
        ctx.fillStyle = '#2a2a2a';
        roundRectPath(ctx, sx - sw / 2 + 2, sy - sh / 2 + 2, sw - 4, sh - 4, 3);
        ctx.fill();
        // Speaker grille dots
        ctx.fillStyle = 'rgba(80,80,80,0.6)';
        const gridCols = 5, gridRows = 7;
        const dotR = sw * 0.03;
        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            const dx = sx - sw * 0.3 + (c / (gridCols - 1)) * sw * 0.6;
            const dy = sy - sh * 0.35 + (r / (gridRows - 1)) * sh * 0.7;
            ctx.beginPath(); ctx.arc(dx, dy, dotR, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Main woofer cone
        const wR = sw * 0.28;
        const wY = sy + sh * 0.08;
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, wY, wR, 0, Math.PI * 2); ctx.stroke();
        // Cone rings
        ctx.strokeStyle = 'rgba(100,100,100,0.4)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(sx, wY, wR * 0.7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, wY, wR * 0.4, 0, Math.PI * 2); ctx.stroke();
        // Center dome
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(sx, wY, wR * 0.2, 0, Math.PI * 2); ctx.fill();
        // Tweeter (small speaker at top)
        const tY = sy - sh * 0.25;
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, tY, wR * 0.4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath(); ctx.arc(sx, tY, wR * 0.2, 0, Math.PI * 2); ctx.fill();
        // Edge highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
        roundRectPath(ctx, sx - sw / 2 + 1, sy - sh / 2 + 1, sw - 2, 3, 3);
        ctx.stroke();
        ctx.restore();
      }

      // Theater Masks — canvas-drawn comedy/tragedy masks
      if (hasDecor('mask')) {
        ctx.save();
        const pos = getDecorPos('mask');
        const mx = pos.x * rw, my = pos.y * rh;
        const ms = rw * 0.035;
        // Hanging hook
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(mx, my - ms * 0.9, 2, 0, Math.PI * 2); ctx.fill();
        // Comedy mask (left, slightly tilted)
        ctx.save();
        ctx.translate(mx - ms * 0.55, my + ms * 0.15);
        ctx.rotate(-0.15);
        // Face shape
        ctx.fillStyle = '#f5e6c8';
        ctx.beginPath();
        ctx.moveTo(-ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(-ms * 0.5, 0, -ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(0, ms * 0.6, ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(ms * 0.5, 0, ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(0, -ms * 0.6, -ms * 0.4, -ms * 0.5);
        ctx.fill();
        ctx.strokeStyle = '#c8a870'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(-ms * 0.5, 0, -ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(0, ms * 0.6, ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(ms * 0.5, 0, ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(0, -ms * 0.6, -ms * 0.4, -ms * 0.5);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(-ms * 0.15, -ms * 0.15, ms * 0.1, ms * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ms * 0.15, -ms * 0.15, ms * 0.1, ms * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        // Happy mouth (smile)
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, ms * 0.05, ms * 0.2, 0.2, Math.PI - 0.2);
        ctx.stroke();
        // Eyebrows (raised)
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(-ms * 0.15, -ms * 0.3, ms * 0.1, Math.PI + 0.3, -0.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(ms * 0.15, -ms * 0.3, ms * 0.1, Math.PI + 0.3, -0.3); ctx.stroke();
        ctx.restore();
        // Tragedy mask (right, slightly tilted opposite)
        ctx.save();
        ctx.translate(mx + ms * 0.55, my + ms * 0.15);
        ctx.rotate(0.15);
        // Face shape
        ctx.fillStyle = '#e8d8c0';
        ctx.beginPath();
        ctx.moveTo(-ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(-ms * 0.5, 0, -ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(0, ms * 0.6, ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(ms * 0.5, 0, ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(0, -ms * 0.6, -ms * 0.4, -ms * 0.5);
        ctx.fill();
        ctx.strokeStyle = '#b89860'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(-ms * 0.5, 0, -ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(0, ms * 0.6, ms * 0.3, ms * 0.4);
        ctx.quadraticCurveTo(ms * 0.5, 0, ms * 0.4, -ms * 0.5);
        ctx.quadraticCurveTo(0, -ms * 0.6, -ms * 0.4, -ms * 0.5);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(-ms * 0.15, -ms * 0.15, ms * 0.1, ms * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ms * 0.15, -ms * 0.15, ms * 0.1, ms * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        // Sad mouth (frown)
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, ms * 0.3, ms * 0.2, Math.PI + 0.2, -0.2);
        ctx.stroke();
        // Eyebrows (angled down)
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-ms * 0.25, -ms * 0.35); ctx.lineTo(-ms * 0.08, -ms * 0.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ms * 0.25, -ms * 0.35); ctx.lineTo(ms * 0.08, -ms * 0.25); ctx.stroke();
        ctx.restore();
        // Ribbon connecting masks
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mx - ms * 0.3, my - ms * 0.4);
        ctx.quadraticCurveTo(mx, my - ms * 0.9, mx + ms * 0.3, my - ms * 0.4);
        ctx.stroke();
        ctx.restore();
      }

      // Crossed Swords — canvas-drawn X-crossed katanas
      if (hasDecor('katana')) {
        ctx.save();
        const pos = getDecorPos('katana');
        const kx = pos.x * rw, ky = pos.y * rh;
        const ks = rw * 0.06;
        // Mount plate (shield shape)
        ctx.fillStyle = '#6B4226';
        ctx.beginPath();
        ctx.moveTo(kx, ky - ks * 0.35);
        ctx.quadraticCurveTo(kx + ks * 0.25, ky - ks * 0.3, kx + ks * 0.25, ky);
        ctx.quadraticCurveTo(kx + ks * 0.2, ky + ks * 0.3, kx, ky + ks * 0.4);
        ctx.quadraticCurveTo(kx - ks * 0.2, ky + ks * 0.3, kx - ks * 0.25, ky);
        ctx.quadraticCurveTo(kx - ks * 0.25, ky - ks * 0.3, kx, ky - ks * 0.35);
        ctx.fill();
        ctx.fillStyle = '#8B6F47';
        ctx.beginPath();
        ctx.moveTo(kx, ky - ks * 0.28);
        ctx.quadraticCurveTo(kx + ks * 0.2, ky - ks * 0.24, kx + ks * 0.2, ky);
        ctx.quadraticCurveTo(kx + ks * 0.16, ky + ks * 0.24, kx, ky + ks * 0.33);
        ctx.quadraticCurveTo(kx - ks * 0.16, ky + ks * 0.24, kx - ks * 0.2, ky);
        ctx.quadraticCurveTo(kx - ks * 0.2, ky - ks * 0.24, kx, ky - ks * 0.28);
        ctx.fill();
        // Sword 1 (top-left to bottom-right)
        ctx.save();
        ctx.translate(kx, ky);
        ctx.rotate(0.7);
        // Blade
        const bladeGrad1 = ctx.createLinearGradient(-2, 0, 2, 0);
        bladeGrad1.addColorStop(0, '#c0c0c0');
        bladeGrad1.addColorStop(0.5, '#e8e8e8');
        bladeGrad1.addColorStop(1, '#a0a0a0');
        ctx.fillStyle = bladeGrad1;
        ctx.beginPath();
        ctx.moveTo(0, -ks * 0.65);
        ctx.lineTo(-1.5, -ks * 0.1);
        ctx.lineTo(1.5, -ks * 0.1);
        ctx.closePath(); ctx.fill();
        // Guard (tsuba)
        ctx.fillStyle = '#c8a040';
        ctx.beginPath(); ctx.ellipse(0, -ks * 0.08, ks * 0.08, ks * 0.03, 0, 0, Math.PI * 2); ctx.fill();
        // Handle (tsuka)
        ctx.fillStyle = '#3a1810';
        roundRectPath(ctx, -2.5, -ks * 0.06, 5, ks * 0.35, 2);
        ctx.fill();
        // Handle wrap
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) {
          const hy = -ks * 0.04 + i * ks * 0.08;
          ctx.beginPath(); ctx.moveTo(-2.5, hy); ctx.lineTo(2.5, hy + ks * 0.04); ctx.stroke();
        }
        // Pommel
        ctx.fillStyle = '#c8a040';
        ctx.beginPath(); ctx.arc(0, ks * 0.3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Sword 2 (top-right to bottom-left)
        ctx.save();
        ctx.translate(kx, ky);
        ctx.rotate(-0.7);
        // Blade
        const bladeGrad2 = ctx.createLinearGradient(-2, 0, 2, 0);
        bladeGrad2.addColorStop(0, '#b8b8b8');
        bladeGrad2.addColorStop(0.5, '#e0e0e0');
        bladeGrad2.addColorStop(1, '#989898');
        ctx.fillStyle = bladeGrad2;
        ctx.beginPath();
        ctx.moveTo(0, -ks * 0.65);
        ctx.lineTo(-1.5, -ks * 0.1);
        ctx.lineTo(1.5, -ks * 0.1);
        ctx.closePath(); ctx.fill();
        // Guard
        ctx.fillStyle = '#c8a040';
        ctx.beginPath(); ctx.ellipse(0, -ks * 0.08, ks * 0.08, ks * 0.03, 0, 0, Math.PI * 2); ctx.fill();
        // Handle
        ctx.fillStyle = '#3a1810';
        roundRectPath(ctx, -2.5, -ks * 0.06, 5, ks * 0.35, 2);
        ctx.fill();
        // Handle wrap
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) {
          const hy = -ks * 0.04 + i * ks * 0.08;
          ctx.beginPath(); ctx.moveTo(-2.5, hy); ctx.lineTo(2.5, hy + ks * 0.04); ctx.stroke();
        }
        // Pommel
        ctx.fillStyle = '#c8a040';
        ctx.beginPath(); ctx.arc(0, ks * 0.3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.restore();
      }

      // Butterfly Frame
      if (hasDecor('butterfly')) {
        ctx.save();
        const pos = getDecorPos('butterfly');
        const bx = pos.x * rw, by = pos.y * rh;
        const bw = rw * 0.06, bh = rw * 0.05;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(bx - bw / 2 + 2, by - bh / 2 + 2, bw, bh);
        // Frame
        ctx.fillStyle = '#6B4226';
        ctx.fillRect(bx - bw / 2 - 3, by - bh / 2 - 3, bw + 6, bh + 6);
        // Background
        ctx.fillStyle = '#f8f4ee';
        ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
        // Butterfly body
        ctx.fillStyle = '#333';
        ctx.fillRect(bx - 1, by - bh * 0.25, 2, bh * 0.4);
        // Wings (upper)
        ctx.fillStyle = '#ff8a00';
        ctx.beginPath();
        ctx.moveTo(bx, by - bh * 0.15);
        ctx.quadraticCurveTo(bx - bw * 0.35, by - bh * 0.45, bx - bw * 0.3, by - bh * 0.1);
        ctx.quadraticCurveTo(bx - bw * 0.15, by + bh * 0.05, bx, by);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx, by - bh * 0.15);
        ctx.quadraticCurveTo(bx + bw * 0.35, by - bh * 0.45, bx + bw * 0.3, by - bh * 0.1);
        ctx.quadraticCurveTo(bx + bw * 0.15, by + bh * 0.05, bx, by);
        ctx.fill();
        // Wings (lower)
        ctx.fillStyle = '#e07000';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx - bw * 0.25, by + bh * 0.05, bx - bw * 0.2, by + bh * 0.2);
        ctx.quadraticCurveTo(bx - bw * 0.1, by + bh * 0.3, bx, by + bh * 0.1);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + bw * 0.25, by + bh * 0.05, bx + bw * 0.2, by + bh * 0.2);
        ctx.quadraticCurveTo(bx + bw * 0.1, by + bh * 0.3, bx, by + bh * 0.1);
        ctx.fill();
        // Wing spots
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(bx - bw * 0.18, by - bh * 0.12, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + bw * 0.18, by - bh * 0.12, 2, 0, Math.PI * 2); ctx.fill();
        // Antennae
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, by - bh * 0.25); ctx.quadraticCurveTo(bx - 4, by - bh * 0.45, bx - 6, by - bh * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by - bh * 0.25); ctx.quadraticCurveTo(bx + 4, by - bh * 0.45, bx + 6, by - bh * 0.4); ctx.stroke();
        ctx.restore();
      }

      // Medal Display
      if (hasDecor('medal')) {
        ctx.save();
        const pos = getDecorPos('medal');
        const mx = pos.x * rw, my = pos.y * rh;
        const mr = rw * 0.025;
        // Backing board
        ctx.fillStyle = '#2a2040';
        roundRectPath(ctx, mx - mr * 2.2, my - mr * 1.8, mr * 4.4, mr * 4.2, 3);
        ctx.fill();
        ctx.strokeStyle = '#8B6F47'; ctx.lineWidth = 2;
        roundRectPath(ctx, mx - mr * 2.2, my - mr * 1.8, mr * 4.4, mr * 4.2, 3);
        ctx.stroke();
        // Ribbon
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(mx - mr * 0.5, my - mr * 1.2);
        ctx.lineTo(mx - mr * 0.8, my - mr * 0.2);
        ctx.lineTo(mx + mr * 0.8, my - mr * 0.2);
        ctx.lineTo(mx + mr * 0.5, my - mr * 1.2);
        ctx.fill();
        // Ribbon stripe
        ctx.fillStyle = '#e8c840';
        ctx.fillRect(mx - 1, my - mr * 1.1, 2, mr * 0.8);
        // Medal circle
        ctx.fillStyle = '#DAA520';
        ctx.beginPath(); ctx.arc(mx, my + mr * 0.5, mr, 0, Math.PI * 2); ctx.fill();
        // Inner circle
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(mx, my + mr * 0.5, mr * 0.7, 0, Math.PI * 2); ctx.stroke();
        // Star on medal
        ctx.fillStyle = '#fff';
        const starR = mr * 0.35;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
          const aI = a + Math.PI / 5;
          ctx.lineTo(mx + Math.cos(a) * starR, my + mr * 0.5 + Math.sin(a) * starR);
          ctx.lineTo(mx + Math.cos(aI) * starR * 0.4, my + mr * 0.5 + Math.sin(aI) * starR * 0.4);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // Paper Lantern
      if (hasDecor('lantern')) {
        ctx.save();
        const pos = getDecorPos('lantern');
        const lx = pos.x * rw, ly = pos.y * rh;
        const lr = rw * 0.025;
        // String
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx, ly - lr * 1.5); ctx.lineTo(lx, ly - lr - 2); ctx.stroke();
        // Lantern body
        const lanGrad = ctx.createRadialGradient(lx, ly, lr * 0.2, lx, ly, lr);
        lanGrad.addColorStop(0, '#ff4040');
        lanGrad.addColorStop(1, '#cc1010');
        ctx.fillStyle = lanGrad;
        ctx.beginPath(); ctx.ellipse(lx, ly, lr * 0.8, lr, 0, 0, Math.PI * 2); ctx.fill();
        // Horizontal ribs
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5;
        for (let i = -2; i <= 2; i++) {
          const ry = ly + i * lr * 0.3;
          ctx.beginPath(); ctx.ellipse(lx, ry, lr * 0.8 * (1 - Math.abs(i) * 0.15), 1, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // Top and bottom caps
        ctx.fillStyle = '#c8a040';
        ctx.fillRect(lx - lr * 0.3, ly - lr - 1, lr * 0.6, 3);
        ctx.fillRect(lx - lr * 0.25, ly + lr - 1, lr * 0.5, 3);
        // Tassel
        ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx, ly + lr + 2); ctx.lineTo(lx, ly + lr + 8); ctx.stroke();
        ctx.fillStyle = '#c8a040';
        ctx.beginPath(); ctx.arc(lx, ly + lr + 9, 2, 0, Math.PI * 2); ctx.fill();
        // Inner glow
        ctx.fillStyle = 'rgba(255,200,100,0.15)';
        ctx.beginPath(); ctx.ellipse(lx, ly, lr * 1.5, lr * 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Dreamcatcher
      if (hasDecor('dreamcatcher')) {
        ctx.save();
        const pos = getDecorPos('dreamcatcher');
        const dx = pos.x * rw, dy = pos.y * rh;
        const dr = rw * 0.03;
        // Hanging string
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(dx, dy - dr - 4); ctx.lineTo(dx, dy - dr); ctx.stroke();
        // Outer ring
        ctx.strokeStyle = '#8B6F47'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.stroke();
        // Inner web
        ctx.strokeStyle = 'rgba(200,190,170,0.5)'; ctx.lineWidth = 0.6;
        const webRings = 4;
        for (let r = 1; r <= webRings; r++) {
          const wr = dr * (r / (webRings + 1));
          ctx.beginPath(); ctx.arc(dx, dy, wr, 0, Math.PI * 2); ctx.stroke();
        }
        // Web spokes
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 / 8) * i;
          ctx.beginPath();
          ctx.moveTo(dx + Math.cos(a) * dr * 0.15, dy + Math.sin(a) * dr * 0.15);
          ctx.lineTo(dx + Math.cos(a) * dr * 0.95, dy + Math.sin(a) * dr * 0.95);
          ctx.stroke();
        }
        // Center bead
        ctx.fillStyle = '#5bb5e0';
        ctx.beginPath(); ctx.arc(dx, dy, dr * 0.1, 0, Math.PI * 2); ctx.fill();
        // Feathers hanging
        const featherAngles = [-0.4, 0, 0.4];
        featherAngles.forEach((offset, i) => {
          const fx = dx + offset * dr;
          const fy = dy + dr;
          // String
          ctx.strokeStyle = '#c8b898'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + dr * 0.8 + i * 3); ctx.stroke();
          // Feather
          const fBot = fy + dr * 0.8 + i * 3;
          ctx.fillStyle = i === 1 ? '#5bb5e0' : '#c8b898';
          ctx.beginPath();
          ctx.moveTo(fx, fBot);
          ctx.quadraticCurveTo(fx - 3, fBot + 6, fx, fBot + 10);
          ctx.quadraticCurveTo(fx + 3, fBot + 6, fx, fBot);
          ctx.fill();
          // Beads on string
          ctx.fillStyle = '#c8a040';
          ctx.beginPath(); ctx.arc(fx, fy + 3, 1.5, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }

      // Diploma
      if (hasDecor('diploma')) {
        ctx.save();
        const pos = getDecorPos('diploma');
        const px = pos.x * rw, py = pos.y * rh;
        const pw = rw * 0.07, ph = rw * 0.05;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(px - pw / 2 + 2, py - ph / 2 + 2, pw, ph);
        // Frame
        ctx.fillStyle = '#8B6F47';
        ctx.fillRect(px - pw / 2 - 3, py - ph / 2 - 3, pw + 6, ph + 6);
        // Inner frame
        ctx.fillStyle = '#B8960B';
        ctx.fillRect(px - pw / 2 - 1, py - ph / 2 - 1, pw + 2, ph + 2);
        // Paper
        ctx.fillStyle = '#f5efe6';
        ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);
        // Text lines
        ctx.fillStyle = '#333';
        ctx.font = Math.round(pw * 0.1) + 'px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('DIPLOMA', px, py - ph * 0.25);
        ctx.fillStyle = '#888';
        ctx.font = Math.round(pw * 0.06) + 'px sans-serif';
        // Decorative lines
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 3; i++) {
          const ly = py - ph * 0.05 + i * ph * 0.15;
          ctx.beginPath(); ctx.moveTo(px - pw * 0.3, ly); ctx.lineTo(px + pw * 0.3, ly); ctx.stroke();
        }
        // Seal
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(px + pw * 0.25, py + ph * 0.25, pw * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.arc(px + pw * 0.25, py + ph * 0.25, pw * 0.035, 0, Math.PI * 2); ctx.fill();
        // Ribbon
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.25 - 3, py + ph * 0.25 + pw * 0.05);
        ctx.lineTo(px + pw * 0.25 - 6, py + ph * 0.25 + pw * 0.12);
        ctx.lineTo(px + pw * 0.25 - 1, py + ph * 0.25 + pw * 0.08);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.25 + 3, py + ph * 0.25 + pw * 0.05);
        ctx.lineTo(px + pw * 0.25 + 6, py + ph * 0.25 + pw * 0.12);
        ctx.lineTo(px + pw * 0.25 + 1, py + ph * 0.25 + pw * 0.08);
        ctx.fill();
        ctx.restore();
      }

      // Generic fallback: draw emoji for any wall decoration with no specific drawing code
      const knownWallDecors = ['stringlights','clock','shelf','hangplant','banner','photo','mirror','antlers','neon','poster','dartboard','wreath','tapestry','sconce','map','cuckoo','macrame','thermometer','plate','calendar','speaker','mask','katana','butterfly','medal','lantern','dreamcatcher','diploma'];
      (roomData.placedDecors || []).filter(d => {
        const def = DECORATIONS.find(x => x.id === d.id);
        return def && def.category === 'wall' && !knownWallDecors.includes(d.id);
      }).forEach(d => {
        const def = DECORATIONS.find(x => x.id === d.id);
        const px = d.x * rw, py = d.y * floorY;
        ctx.save();
        ctx.font = Math.round(rw * 0.06) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.emoji, px, py);
        ctx.restore();
      });
    }

    function drawFloorDecorations(ctx, rw, rh, floorY, t) {
      // Floor lamp — pos.y is base (feet), draws upward
      if (hasDecor('floorlamp')) {
        ctx.save();
        const pos = getDecorPos('floorlamp');
        const lx = pos.x * rw;
        const baseY = pos.y * rh;
        const lampH = (rh - floorY) * 0.65;
        // Base ellipse (feet)
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.ellipse(lx, baseY, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
        // Pole from base upward
        ctx.strokeStyle = '#777'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lx, baseY); ctx.lineTo(lx, baseY - lampH + 8); ctx.stroke();
        // Shade at top
        const shadeY = baseY - lampH;
        ctx.fillStyle = '#f5e6c8';
        ctx.beginPath();
        ctx.moveTo(lx - 14, shadeY + 8); ctx.lineTo(lx - 10, shadeY - 6);
        ctx.lineTo(lx + 10, shadeY - 6); ctx.lineTo(lx + 14, shadeY + 8);
        ctx.fill();
        ctx.strokeStyle = '#c8a876'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx - 14, shadeY + 8); ctx.lineTo(lx - 10, shadeY - 6);
        ctx.lineTo(lx + 10, shadeY - 6); ctx.lineTo(lx + 14, shadeY + 8);
        ctx.closePath(); ctx.stroke();
        // Glow
        ctx.fillStyle = 'rgba(255,240,200,0.08)';
        ctx.beginPath(); ctx.ellipse(lx, baseY - lampH * 0.5, 30, lampH * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Side table
      if (hasDecor('sidetable')) {
        ctx.save();
        const pos = getDecorPos('sidetable');
        const tx = pos.x * rw, ty = pos.y * rh;
        const tw = rw * 0.08, th = (rh - floorY) * 0.28;
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(tx + tw / 2, ty + th + 2, tw * 0.5, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(tx + 2, ty + 4, 3, th - 2);
        ctx.fillRect(tx + tw - 5, ty + 4, 3, th - 2);
        const topGrad = ctx.createLinearGradient(tx, ty, tx, ty + 5);
        topGrad.addColorStop(0, '#b89a6e');
        topGrad.addColorStop(1, '#a08868');
        ctx.fillStyle = topGrad;
        roundRectPath(ctx, tx - 1, ty, tw + 2, 5, 1.5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(tx, ty, tw, 2);
        ctx.fillStyle = '#7faac8';
        ctx.beginPath();
        ctx.moveTo(tx + tw * 0.35, ty); ctx.lineTo(tx + tw * 0.3, ty - 12);
        ctx.quadraticCurveTo(tx + tw * 0.5, ty - 16, tx + tw * 0.7, ty - 12);
        ctx.lineTo(tx + tw * 0.65, ty); ctx.fill();
        ctx.fillStyle = '#ff8a8a';
        ctx.beginPath(); ctx.arc(tx + tw * 0.5, ty - 17, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a9a4a'; ctx.strokeStyle = '#5a9a4a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx + tw * 0.5, ty - 14); ctx.lineTo(tx + tw * 0.5, ty - 5); ctx.stroke();
        ctx.restore();
      }

      // Floor cushion
      if (hasDecor('cushion')) {
        ctx.save();
        const pos = getDecorPos('cushion');
        const cx = pos.x * rw, cy = pos.y * rh;
        const cw = 22, ch = 10;
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(cx, cy + 3, cw + 1, ch + 1, 0, 0, Math.PI * 2); ctx.fill();
        const cushGrad = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, cw);
        cushGrad.addColorStop(0, '#e8a0c0');
        cushGrad.addColorStop(1, '#d080a0');
        ctx.fillStyle = cushGrad;
        ctx.beginPath(); ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.ellipse(cx - 4, cy - 3, cw * 0.5, ch * 0.4, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(180,80,120,0.3)';
        ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Toy box
      if (hasDecor('toybox')) {
        ctx.save();
        const pos = getDecorPos('toybox');
        const bx = pos.x * rw, by = pos.y * rh;
        const bw = 30, bh = 22;
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(bx + 2, by + bh - 1, bw, 3);
        ctx.fillStyle = '#d4a06a';
        roundRectPath(ctx, bx, by, bw, bh, 3);
        ctx.fill();
        ctx.fillStyle = '#c49058';
        ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        ctx.fillStyle = '#f7c97e';
        ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('★', bx + bw / 2, by + bh / 2 + 3);
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath(); ctx.arc(bx + 8, by - 2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5b9bd5';
        ctx.fillRect(bx + bw - 10, by - 6, 4, 8);
        ctx.fillStyle = '#55efc4';
        ctx.fillRect(bx + bw - 8, by - 8, 4, 6);
        ctx.restore();
      }

      // Bookcase — pos.y is base (bottom), draws upward
      if (hasDecor('bookcase')) {
        ctx.save();
        const pos = getDecorPos('bookcase');
        const bx = pos.x * rw;
        const baseY = pos.y * rh;
        const bw = rw * 0.1, bh = (rh - floorY) * 0.7;
        const by = baseY - bh; // top of bookcase
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(bx + 2, by + 2, bw + 1, bh + 1);
        ctx.fillStyle = '#7a6550';
        roundRectPath(ctx, bx, by, bw, bh, 2);
        ctx.fill();
        ctx.fillStyle = '#a08868';
        ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        const shelfH = (bh - 8) / 3;
        for (let i = 0; i < 3; i++) {
          const sy = by + 4 + i * shelfH;
          ctx.fillStyle = '#8a7355';
          ctx.fillRect(bx + 2, sy + shelfH - 3, bw - 4, 3);
          const bkColors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#e67e22','#1abc9c'];
          let bkx = bx + 4;
          for (let j = 0; j < 3 + (i % 2); j++) {
            const bkw = bw * 0.15 + (j % 3) * 1.5;
            const bkh = shelfH * 0.65 + (j % 2) * shelfH * 0.12;
            ctx.fillStyle = bkColors[(i * 3 + j) % bkColors.length];
            ctx.fillRect(bkx, sy + shelfH - 3 - bkh, bkw, bkh);
            bkx += bkw + 1;
          }
        }
        ctx.restore();
      }

      // Aquarium
      if (hasDecor('aquarium')) {
        ctx.save();
        const pos = getDecorPos('aquarium');
        const ax = pos.x * rw, ay = pos.y * rh;
        const aw = rw * 0.14, ah = rw * 0.09;
        // Stand legs
        ctx.fillStyle = '#555';
        ctx.fillRect(ax - aw/2 + 3, ay + ah/2, 3, 10);
        ctx.fillRect(ax + aw/2 - 6, ay + ah/2, 3, 10);
        // Tank glass
        ctx.fillStyle = 'rgba(100,180,220,0.25)';
        roundRectPath(ctx, ax - aw/2, ay - ah/2, aw, ah, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,200,230,0.4)'; ctx.lineWidth = 1.5;
        roundRectPath(ctx, ax - aw/2, ay - ah/2, aw, ah, 3);
        ctx.stroke();
        // Water
        ctx.fillStyle = 'rgba(64,164,223,0.15)';
        ctx.fillRect(ax - aw/2 + 2, ay - ah/2 + 6, aw - 4, ah - 8);
        // Fish
        const fishT = t / 800;
        const fx = ax - aw * 0.2 + Math.sin(fishT) * aw * 0.2;
        const fy = ay - 2 + Math.cos(fishT * 1.3) * 3;
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath(); ctx.ellipse(fx, fy, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx - 7, fy); ctx.lineTo(fx - 13, fy - 4); ctx.lineTo(fx - 13, fy + 4); ctx.fill();
        // Second fish
        const fx2 = ax + aw * 0.15 + Math.sin(fishT + 2) * aw * 0.15;
        const fy2 = ay + 4 + Math.cos(fishT * 0.9 + 1) * 2;
        ctx.fillStyle = '#48dbfb';
        ctx.beginPath(); ctx.ellipse(fx2, fy2, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx2 + 6, fy2); ctx.lineTo(fx2 + 10, fy2 - 3); ctx.lineTo(fx2 + 10, fy2 + 3); ctx.fill();
        // Bubbles
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        const bub1y = ay - ah * 0.1 - ((t / 20) % ah * 0.4);
        ctx.beginPath(); ctx.arc(ax - 4, bub1y, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ax + 6, bub1y + 5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Guitar
      if (hasDecor('guitar')) {
        ctx.save();
        const pos = getDecorPos('guitar');
        const gx = pos.x * rw, baseY = pos.y * rh;
        const gh = rh * 0.12;
        // Neck
        ctx.fillStyle = '#6B4226';
        ctx.fillRect(gx - 2, baseY - gh, 4, gh * 0.6);
        // Headstock
        ctx.fillStyle = '#4a3020';
        roundRectPath(ctx, gx - 4, baseY - gh - 6, 8, 10, 2);
        ctx.fill();
        // Tuning pegs
        ctx.fillStyle = '#ccc';
        ctx.beginPath(); ctx.arc(gx - 5, baseY - gh - 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(gx + 5, baseY - gh, 1.5, 0, Math.PI * 2); ctx.fill();
        // Body
        ctx.fillStyle = '#D4A06A';
        ctx.beginPath(); ctx.ellipse(gx, baseY - gh * 0.2, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(gx, baseY - gh * 0.35, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
        // Sound hole
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath(); ctx.arc(gx, baseY - gh * 0.22, 4, 0, Math.PI * 2); ctx.fill();
        // Strings
        ctx.strokeStyle = 'rgba(200,200,200,0.4)'; ctx.lineWidth = 0.5;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(gx + i, baseY - gh + 4); ctx.lineTo(gx + i, baseY - gh * 0.1); ctx.stroke();
        }
        ctx.restore();
      }

      // Globe
      if (hasDecor('globe')) {
        ctx.save();
        const pos = getDecorPos('globe');
        const gx = pos.x * rw, baseY = pos.y * rh;
        const gr = rw * 0.028;
        // Stand
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(gx - 1.5, baseY - gr * 1.5, 3, gr * 1.5);
        ctx.beginPath(); ctx.ellipse(gx, baseY, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Globe frame arc
        ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, baseY - gr * 1.5 - gr, gr + 3, 0, Math.PI * 2); ctx.stroke();
        // Globe sphere
        const gcy = baseY - gr * 1.5 - gr;
        const globeGrad = ctx.createRadialGradient(gx - gr * 0.3, gcy - gr * 0.3, 0, gx, gcy, gr);
        globeGrad.addColorStop(0, '#5bb5e0');
        globeGrad.addColorStop(0.7, '#3498db');
        globeGrad.addColorStop(1, '#2174a8');
        ctx.fillStyle = globeGrad;
        ctx.beginPath(); ctx.arc(gx, gcy, gr, 0, Math.PI * 2); ctx.fill();
        // Continents
        ctx.fillStyle = '#5a9a4a';
        const spin = (t / 3000) % (Math.PI * 2);
        ctx.beginPath(); ctx.ellipse(gx + Math.cos(spin) * gr * 0.3, gcy - gr * 0.2, gr * 0.25, gr * 0.15, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(gx + Math.cos(spin + 1) * gr * 0.4, gcy + gr * 0.15, gr * 0.2, gr * 0.12, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Trash can
      if (hasDecor('trashcan')) {
        ctx.save();
        const pos = getDecorPos('trashcan');
        const tx = pos.x * rw, baseY = pos.y * rh;
        const tw = 16, th = 22;
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.moveTo(tx - tw/2, baseY); ctx.lineTo(tx - tw/2 + 2, baseY - th);
        ctx.lineTo(tx + tw/2 - 2, baseY - th); ctx.lineTo(tx + tw/2, baseY);
        ctx.fill();
        // Lid
        ctx.fillStyle = '#999';
        roundRectPath(ctx, tx - tw/2 - 1, baseY - th - 3, tw + 2, 4, 1.5);
        ctx.fill();
        // Handle
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(tx, baseY - th - 5, 4, Math.PI, 0); ctx.stroke();
        // Lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(tx - 3, baseY - th + 4); ctx.lineTo(tx - 2, baseY - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx + 3, baseY - th + 4); ctx.lineTo(tx + 2, baseY - 2); ctx.stroke();
        ctx.restore();
      }

      // Standing fan
      if (hasDecor('fan')) {
        ctx.save();
        const pos = getDecorPos('fan');
        const fx = pos.x * rw, baseY = pos.y * rh;
        const fh = rh * 0.13;
        // Base
        ctx.fillStyle = '#666';
        ctx.beginPath(); ctx.ellipse(fx, baseY, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        // Pole
        ctx.strokeStyle = '#888'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(fx, baseY); ctx.lineTo(fx, baseY - fh + 14); ctx.stroke();
        // Fan housing
        const fcy = baseY - fh + 6;
        ctx.fillStyle = '#ddd';
        ctx.beginPath(); ctx.arc(fx, fcy, 14, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fx, fcy, 14, 0, Math.PI * 2); ctx.stroke();
        // Spinning blades
        const spin = (t / 100) % (Math.PI * 2);
        ctx.fillStyle = 'rgba(100,100,100,0.4)';
        for (let i = 0; i < 3; i++) {
          const a = spin + (i * Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(a) * 6, fcy + Math.sin(a) * 6, 8, 3, a, 0, Math.PI * 2);
          ctx.fill();
        }
        // Center hub
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(fx, fcy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Bean pillow
      if (hasDecor('beanpillow')) {
        ctx.save();
        const pos = getDecorPos('beanpillow');
        const bx = pos.x * rw, by = pos.y * rh;
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(bx, by + 4, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
        const beanGrad = ctx.createRadialGradient(bx - 4, by - 6, 0, bx, by, 20);
        beanGrad.addColorStop(0, '#7c5cbf');
        beanGrad.addColorStop(1, '#5a3d8a');
        ctx.fillStyle = beanGrad;
        ctx.beginPath(); ctx.ellipse(bx, by - 2, 20, 14, 0, 0, Math.PI * 2); ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath(); ctx.ellipse(bx - 5, by - 8, 10, 5, -0.3, 0, Math.PI * 2); ctx.fill();
        // Seam line
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(bx - 8, by - 12); ctx.quadraticCurveTo(bx, by + 6, bx + 10, by - 10); ctx.stroke();
        ctx.restore();
      }

      // TV
      if (hasDecor('tv')) {
        ctx.save();
        const pos = getDecorPos('tv');
        const tx = pos.x * rw, baseY = pos.y * rh;
        const tw = rw * 0.1, th = rw * 0.06;
        // Stand
        ctx.fillStyle = '#444';
        ctx.fillRect(tx - 12, baseY - 6, 24, 6);
        ctx.fillRect(tx - 3, baseY - th - 2, 6, th - 4);
        // Screen
        ctx.fillStyle = '#111';
        roundRectPath(ctx, tx - tw/2, baseY - th - th * 0.8, tw, th * 0.82, 3);
        ctx.fill();
        // Screen content (animated color bars / glow)
        const scrGrad = ctx.createLinearGradient(tx - tw/2 + 3, 0, tx + tw/2 - 3, 0);
        const hue = (t / 30) % 360;
        scrGrad.addColorStop(0, 'hsl(' + hue + ',60%,30%)');
        scrGrad.addColorStop(0.5, 'hsl(' + ((hue + 120) % 360) + ',60%,35%)');
        scrGrad.addColorStop(1, 'hsl(' + ((hue + 240) % 360) + ',60%,30%)');
        ctx.fillStyle = scrGrad;
        roundRectPath(ctx, tx - tw/2 + 3, baseY - th - th * 0.78, tw - 6, th * 0.76, 2);
        ctx.fill();
        // Screen glare
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(tx - tw/4, baseY - th - th * 0.7, tw * 0.3, th * 0.5);
        ctx.restore();
      }

      // Upright piano
      if (hasDecor('piano')) {
        ctx.save();
        const pos = getDecorPos('piano');
        const px = pos.x * rw, baseY = pos.y * rh;
        const pw = rw * 0.1, ph = (rh - floorY) * 0.65;
        const py = baseY - ph;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(px - pw / 2 + 2, py + 2, pw + 1, ph + 1);
        // Body
        ctx.fillStyle = '#1a1a1a';
        roundRectPath(ctx, px - pw / 2, py, pw, ph - 4, 3);
        ctx.fill();
        // Top panel
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(px - pw / 2 + 2, py + 2, pw - 4, ph * 0.18);
        // Music stand
        ctx.fillStyle = '#333';
        ctx.fillRect(px - pw / 2 + pw * 0.2, py + ph * 0.18, pw * 0.6, ph * 0.14);
        // Sheet music
        ctx.fillStyle = '#f5f0e0';
        ctx.fillRect(px - pw / 2 + pw * 0.25, py + ph * 0.2, pw * 0.5, ph * 0.1);
        // Tiny note marks
        ctx.fillStyle = '#333';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(px - pw * 0.15 + i * pw * 0.08, py + ph * 0.22, pw * 0.04, 1);
        }
        // Key area
        const keyY = baseY - ph * 0.22;
        const keyH = ph * 0.14;
        ctx.fillStyle = '#f5f0e0';
        ctx.fillRect(px - pw / 2 + 3, keyY, pw - 6, keyH);
        // White key divisions
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.5;
        const wkw = (pw - 6) / 10;
        for (let i = 1; i < 10; i++) {
          const kx = px - pw / 2 + 3 + i * wkw;
          ctx.beginPath(); ctx.moveTo(kx, keyY); ctx.lineTo(kx, keyY + keyH); ctx.stroke();
        }
        // Black keys
        ctx.fillStyle = '#111';
        const bkPattern = [1, 2, 4, 5, 6, 8, 9];
        bkPattern.forEach(i => {
          if (i < 10) ctx.fillRect(px - pw / 2 + 3 + i * wkw - wkw * 0.3, keyY, wkw * 0.6, keyH * 0.6);
        });
        // Legs
        ctx.fillStyle = '#111';
        ctx.fillRect(px - pw / 2 + 3, baseY - 5, 4, 5);
        ctx.fillRect(px + pw / 2 - 7, baseY - 5, 4, 5);
        // Pedals
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(px - 5, baseY - 3, 3, 3);
        ctx.fillRect(px + 2, baseY - 3, 3, 3);
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(px - pw / 2 + 2, py + 2, pw - 4, 3);
        ctx.restore();
      }

      // Telescope
      if (hasDecor('telescope')) {
        ctx.save();
        const pos = getDecorPos('telescope');
        const tx = pos.x * rw, baseY = pos.y * rh;
        const th = (rh - floorY) * 0.55;
        const pivotY = baseY - th * 0.6;
        // Tripod legs
        ctx.strokeStyle = '#8B7355'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, pivotY); ctx.lineTo(tx - 16, baseY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, pivotY); ctx.lineTo(tx + 14, baseY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, pivotY); ctx.lineTo(tx + 3, baseY); ctx.stroke();
        // Tripod joint
        ctx.fillStyle = '#6d5a42';
        ctx.beginPath(); ctx.arc(tx, pivotY, 3, 0, Math.PI * 2); ctx.fill();
        // Telescope tube
        ctx.save();
        ctx.translate(tx, pivotY);
        ctx.rotate(-0.45);
        // Main tube
        const tubeGrad = ctx.createLinearGradient(-4, 0, 4, 0);
        tubeGrad.addColorStop(0, '#C5952C'); tubeGrad.addColorStop(0.5, '#DAA520'); tubeGrad.addColorStop(1, '#B8860B');
        ctx.fillStyle = tubeGrad;
        roundRectPath(ctx, -4, -th * 0.55, 8, th * 0.55, 3);
        ctx.fill();
        // Decorative rings
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(-5, -th * 0.45, 10, 3);
        ctx.fillRect(-5, -th * 0.2, 10, 3);
        // Lens
        ctx.fillStyle = '#5bb5e0';
        ctx.beginPath(); ctx.ellipse(0, -th * 0.55, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, -th * 0.55, 5.5, 3, 0, 0, Math.PI * 2); ctx.stroke();
        // Lens glare
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(-2, -th * 0.56, 1.5, 0, Math.PI * 2); ctx.fill();
        // Eyepiece
        ctx.fillStyle = '#333';
        roundRectPath(ctx, -3, 0, 6, 6, 1);
        ctx.fill();
        ctx.restore();
        ctx.restore();
      }

      // Potted cactus
      if (hasDecor('cactus')) {
        ctx.save();
        const pos = getDecorPos('cactus');
        const cx = pos.x * rw, baseY = pos.y * rh;
        const ch = (rh - floorY) * 0.35;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(cx, baseY, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Pot
        const potH = ch * 0.35;
        ctx.fillStyle = '#c97b4b';
        ctx.beginPath();
        ctx.moveTo(cx - 10, baseY - potH); ctx.lineTo(cx - 8, baseY);
        ctx.lineTo(cx + 8, baseY); ctx.lineTo(cx + 10, baseY - potH);
        ctx.fill();
        // Pot rim
        ctx.fillStyle = '#b56a3a';
        ctx.fillRect(cx - 11, baseY - potH - 3, 22, 4);
        // Soil
        ctx.fillStyle = '#5a3a1a';
        ctx.beginPath(); ctx.ellipse(cx, baseY - potH, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Main body
        const bodyH = ch * 0.5;
        ctx.fillStyle = '#3d8a4a';
        roundRectPath(ctx, cx - 6, baseY - potH - bodyH, 12, bodyH, 5);
        ctx.fill();
        // Highlight ridge
        ctx.fillStyle = 'rgba(100,180,100,0.2)';
        ctx.fillRect(cx - 1, baseY - potH - bodyH + 4, 2, bodyH - 8);
        // Left arm
        ctx.fillStyle = '#4a9a58';
        ctx.beginPath();
        ctx.moveTo(cx - 6, baseY - potH - bodyH * 0.5);
        ctx.lineTo(cx - 14, baseY - potH - bodyH * 0.6);
        ctx.quadraticCurveTo(cx - 16, baseY - potH - bodyH * 0.9, cx - 12, baseY - potH - bodyH * 0.95);
        ctx.quadraticCurveTo(cx - 8, baseY - potH - bodyH * 0.85, cx - 6, baseY - potH - bodyH * 0.55);
        ctx.fill();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(cx + 6, baseY - potH - bodyH * 0.6);
        ctx.lineTo(cx + 12, baseY - potH - bodyH * 0.7);
        ctx.quadraticCurveTo(cx + 14, baseY - potH - bodyH, cx + 10, baseY - potH - bodyH * 1.05);
        ctx.quadraticCurveTo(cx + 7, baseY - potH - bodyH * 0.9, cx + 6, baseY - potH - bodyH * 0.65);
        ctx.fill();
        // Spines
        ctx.strokeStyle = '#aad4a0'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
        const spines = [[-4, -0.7], [3, -0.6], [-2, -0.4], [4, -0.8], [0, -0.9], [-5, -0.55]];
        spines.forEach(([ox, frac]) => {
          const sy = baseY - potH + bodyH * frac;
          ctx.beginPath(); ctx.moveTo(cx + ox, sy);
          ctx.lineTo(cx + ox + (ox > 0 ? 3 : -3), sy - 2);
          ctx.stroke();
        });
        // Flower on top
        ctx.fillStyle = '#ff6b8a';
        ctx.beginPath(); ctx.arc(cx, baseY - potH - bodyH - 2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff8fab';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * 3, baseY - potH - bodyH - 2 + Math.sin(a) * 3, 2.5, 1.5, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffaa33';
        ctx.beginPath(); ctx.arc(cx, baseY - potH - bodyH - 2, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Candle set
      if (hasDecor('candles')) {
        ctx.save();
        const pos = getDecorPos('candles');
        const cx = pos.x * rw, cy = pos.y * rh;
        const cs = rw * 0.01;
        // Tray
        ctx.fillStyle = '#c8b898';
        ctx.beginPath(); ctx.ellipse(cx, cy + cs * 1.5, cs * 5, cs * 1.5, 0, 0, Math.PI * 2); ctx.fill();
        // 3 candles
        const candleData = [{ ox: -cs * 2.5, h: cs * 5 }, { ox: 0, h: cs * 7 }, { ox: cs * 2.5, h: cs * 4 }];
        candleData.forEach(c => {
          // Body
          ctx.fillStyle = '#f5ede0';
          ctx.fillRect(cx + c.ox - cs * 0.7, cy - c.h + cs * 1.5, cs * 1.4, c.h);
          // Wick
          ctx.fillStyle = '#333';
          ctx.fillRect(cx + c.ox - 0.5, cy - c.h + cs * 0.8, 1, cs * 0.7);
          // Flame
          const flicker = Math.sin(t / 200 + c.ox) * cs * 0.15;
          ctx.fillStyle = 'rgba(255,200,50,0.7)';
          ctx.beginPath();
          ctx.moveTo(cx + c.ox + flicker, cy - c.h - cs * 0.5);
          ctx.quadraticCurveTo(cx + c.ox + cs * 0.5, cy - c.h + cs * 0.5, cx + c.ox, cy - c.h + cs * 1);
          ctx.quadraticCurveTo(cx + c.ox - cs * 0.5, cy - c.h + cs * 0.5, cx + c.ox + flicker, cy - c.h - cs * 0.5);
          ctx.fill();
          // Glow
          ctx.fillStyle = 'rgba(255,220,80,0.08)';
          ctx.beginPath(); ctx.arc(cx + c.ox, cy - c.h, cs * 2, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }

      // Skateboard
      if (hasDecor('skateboard')) {
        ctx.save();
        const pos = getDecorPos('skateboard');
        const sx = pos.x * rw, sy = pos.y * rh;
        const sw = rw * 0.06, sh = rw * 0.012;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, sw / 2, sh, 0, 0, Math.PI * 2); ctx.fill();
        // Board
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(sx - sw / 2 + sh, sy - sh / 2);
        ctx.lineTo(sx + sw / 2 - sh, sy - sh / 2);
        ctx.quadraticCurveTo(sx + sw / 2 + sh * 0.5, sy - sh, sx + sw / 2, sy - sh * 1.5);
        ctx.quadraticCurveTo(sx + sw / 2 + sh * 0.3, sy + sh * 0.3, sx + sw / 2 - sh, sy + sh / 2);
        ctx.lineTo(sx - sw / 2 + sh, sy + sh / 2);
        ctx.quadraticCurveTo(sx - sw / 2 - sh * 0.5, sy - sh, sx - sw / 2, sy - sh * 1.5);
        ctx.quadraticCurveTo(sx - sw / 2 - sh * 0.3, sy + sh * 0.3, sx - sw / 2 + sh, sy - sh / 2);
        ctx.fill();
        // Stripe
        ctx.fillStyle = '#e8c840';
        ctx.fillRect(sx - sw * 0.2, sy - sh * 0.3, sw * 0.4, sh * 0.6);
        // Wheels
        ctx.fillStyle = '#555';
        const wheelY = sy + sh * 0.8;
        [-sw * 0.28, -sw * 0.18, sw * 0.18, sw * 0.28].forEach(ox => {
          ctx.beginPath(); ctx.arc(sx + ox, wheelY, sh * 0.35, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }

      // Vinyl player
      if (hasDecor('vinylplayer')) {
        ctx.save();
        const pos = getDecorPos('vinylplayer');
        const vx = pos.x * rw, baseY = pos.y * rh;
        const vw = rw * 0.055, vh = vw * 0.35;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(vx - vw / 2 + 2, baseY - vh + 2, vw, vh);
        // Body
        ctx.fillStyle = '#3a2a18';
        roundRectPath(ctx, vx - vw / 2, baseY - vh, vw, vh, 3); ctx.fill();
        // Lid highlight
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(vx - vw / 2 + 2, baseY - vh + 1, vw - 4, 3);
        // Record (vinyl)
        const ry = baseY - vh * 0.5;
        const rr = vw * 0.3;
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(vx - vw * 0.05, ry, rr, 0, Math.PI * 2); ctx.fill();
        // Grooves
        ctx.strokeStyle = 'rgba(60,60,60,0.4)'; ctx.lineWidth = 0.5;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath(); ctx.arc(vx - vw * 0.05, ry, rr * (0.3 + i * 0.2), 0, Math.PI * 2); ctx.stroke();
        }
        // Label
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.arc(vx - vw * 0.05, ry, rr * 0.2, 0, Math.PI * 2); ctx.fill();
        // Center hole
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(vx - vw * 0.05, ry, 1.5, 0, Math.PI * 2); ctx.fill();
        // Tonearm
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        const armAngle = -0.8 + Math.sin(t / 10000) * 0.15;
        const armPivX = vx + vw * 0.35, armPivY = baseY - vh * 0.75;
        ctx.beginPath(); ctx.moveTo(armPivX, armPivY);
        ctx.lineTo(armPivX + Math.cos(armAngle) * vw * 0.4, armPivY + Math.sin(armAngle) * vw * 0.4);
        ctx.stroke();
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(armPivX, armPivY, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Umbrella stand
      if (hasDecor('umbrella')) {
        ctx.save();
        const pos = getDecorPos('umbrella');
        const ux = pos.x * rw, baseY = pos.y * rh;
        const uh = (rh - floorY) * 0.4;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(ux, baseY, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Bucket
        ctx.fillStyle = '#8B7355';
        ctx.beginPath();
        ctx.moveTo(ux - 8, baseY - uh * 0.35); ctx.lineTo(ux - 6, baseY);
        ctx.lineTo(ux + 6, baseY); ctx.lineTo(ux + 8, baseY - uh * 0.35);
        ctx.fill();
        // Rim
        ctx.fillStyle = '#7a6548';
        ctx.fillRect(ux - 9, baseY - uh * 0.37, 18, 3);
        // Umbrella handle sticking out
        ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ux - 2, baseY - uh * 0.35);
        ctx.lineTo(ux - 3, baseY - uh * 0.9);
        ctx.quadraticCurveTo(ux - 3, baseY - uh, ux + 3, baseY - uh);
        ctx.stroke();
        // Second umbrella (red)
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ux + 3, baseY - uh * 0.35);
        ctx.lineTo(ux + 4, baseY - uh * 0.85);
        ctx.stroke();
        // Handle curve
        ctx.beginPath();
        ctx.arc(ux + 4, baseY - uh * 0.85 - 3, 3, 0, Math.PI); ctx.stroke();
        ctx.restore();
      }

      // Terrarium
      if (hasDecor('terrarium')) {
        ctx.save();
        const pos = getDecorPos('terrarium');
        const tx = pos.x * rw, baseY = pos.y * rh;
        const tr = rw * 0.03;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(tx, baseY, tr * 0.8, tr * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        // Glass dome
        ctx.strokeStyle = 'rgba(180,200,220,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(tx, baseY - tr * 0.6, tr, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(200,220,240,0.1)';
        ctx.beginPath(); ctx.arc(tx, baseY - tr * 0.6, tr, Math.PI, 0); ctx.fill();
        // Base
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(tx - tr, baseY - tr * 0.15, tr * 2, tr * 0.3);
        // Soil
        ctx.fillStyle = '#5a3a1a';
        ctx.beginPath(); ctx.ellipse(tx, baseY - tr * 0.3, tr * 0.75, tr * 0.15, 0, 0, Math.PI * 2); ctx.fill();
        // Tiny plants inside
        ctx.fillStyle = '#3d8a4a';
        ctx.beginPath(); ctx.ellipse(tx - tr * 0.3, baseY - tr * 0.6, tr * 0.15, tr * 0.3, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a9a58';
        ctx.beginPath(); ctx.ellipse(tx + tr * 0.15, baseY - tr * 0.55, tr * 0.12, tr * 0.25, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a7a3a';
        ctx.beginPath(); ctx.ellipse(tx + tr * 0.4, baseY - tr * 0.5, tr * 0.1, tr * 0.2, 0.1, 0, Math.PI * 2); ctx.fill();
        // Tiny mushroom
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.arc(tx - tr * 0.1, baseY - tr * 0.45, tr * 0.08, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f0e0c0';
        ctx.fillRect(tx - tr * 0.12, baseY - tr * 0.45, tr * 0.04, tr * 0.1);
        // Glass shine
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(tx - tr * 0.3, baseY - tr * 0.9, tr * 0.25, 0.5, 1.8); ctx.stroke();
        ctx.restore();
      }

      // Christmas Tree — detailed canvas-drawn tree with branches, ornaments, tinsel, and presents
      if (hasDecor('xmastree')) {
        ctx.save();
        const pos = getDecorPos('xmastree');
        const tx = pos.x * rw, baseY = pos.y * rh;
        const tw = rw * 0.16;
        const th = (rh - floorY) * 0.80;

        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.ellipse(tx, baseY, tw * 0.45, 5, 0, 0, Math.PI * 2); ctx.fill();

        // ── Presents at base ──
        const presents = [
          { x: -0.22, w: 14, h: 10, color: '#e04040', ribbon: '#ffd700' },
          { x: 0.18, w: 12, h: 12, color: '#4090e0', ribbon: '#fff' },
          { x: -0.05, w: 10, h: 8, color: '#ff69b4', ribbon: '#ffe0f0' },
        ];
        for (const p of presents) {
          const px = tx + p.x * tw, py = baseY - p.h;
          // Box
          ctx.fillStyle = p.color;
          roundRectPath(ctx, px - p.w / 2, py, p.w, p.h, 2);
          ctx.fill();
          // Darker bottom edge
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.fillRect(px - p.w / 2, py + p.h - 2, p.w, 2);
          // Ribbon vertical
          ctx.fillStyle = p.ribbon;
          ctx.fillRect(px - 1.2, py, 2.4, p.h);
          // Ribbon horizontal
          ctx.fillRect(px - p.w / 2, py + p.h * 0.45, p.w, 2);
          // Bow on top
          ctx.fillStyle = p.ribbon;
          ctx.beginPath();
          ctx.ellipse(px - 3, py - 1, 3, 2, -0.3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath();
          ctx.ellipse(px + 3, py - 1, 3, 2, 0.3, 0, Math.PI * 2); ctx.fill();
        }

        // ── Pot / tree stand ──
        const potW = tw * 0.18, potH = th * 0.06;
        const potTop = baseY - potH;
        // Pot body (trapezoid)
        ctx.fillStyle = '#6d3a1f';
        ctx.beginPath();
        ctx.moveTo(tx - potW * 0.6, potTop);
        ctx.lineTo(tx - potW * 0.45, baseY);
        ctx.lineTo(tx + potW * 0.45, baseY);
        ctx.lineTo(tx + potW * 0.6, potTop);
        ctx.closePath(); ctx.fill();
        // Pot rim
        ctx.fillStyle = '#8B4513';
        roundRectPath(ctx, tx - potW * 0.65, potTop - 3, potW * 1.3, 5, 2);
        ctx.fill();
        // Pot highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(tx - potW * 0.3, potTop, potW * 0.2, potH);

        // ── Trunk ──
        const trunkH = th * 0.05;
        const trunkW = tw * 0.06;
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(tx - trunkW / 2, potTop - trunkH, trunkW, trunkH);
        // Bark lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(tx - 1, potTop - trunkH); ctx.lineTo(tx - 1, potTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx + 2, potTop - trunkH + 2); ctx.lineTo(tx + 2, potTop); ctx.stroke();

        // ── Tree body — 4 layers of branches with jagged edges ──
        const treeBase = potTop - trunkH;
        const layerDefs = [
          { widthRatio: 1.00, heightRatio: 0.22, yOffset: 0 },
          { widthRatio: 0.80, heightRatio: 0.22, yOffset: 0.18 },
          { widthRatio: 0.58, heightRatio: 0.22, yOffset: 0.36 },
          { widthRatio: 0.36, heightRatio: 0.22, yOffset: 0.54 },
        ];

        for (let li = 0; li < layerDefs.length; li++) {
          const ld = layerDefs[li];
          const lw = tw * ld.widthRatio * 0.55;
          const lh = th * ld.heightRatio;
          const ly = treeBase - th * ld.yOffset;
          const peakY = ly - lh;

          // Main branch shape with jagged bottom edge (needle-like)
          ctx.fillStyle = li % 2 === 0 ? '#1a7830' : '#1e8a38';
          ctx.beginPath();
          ctx.moveTo(tx, peakY);
          // Right side with slight curve
          ctx.quadraticCurveTo(tx + lw * 0.3, peakY + lh * 0.4, tx + lw, ly);
          // Jagged bottom edge (right to left)
          const jags = 6 + li * 2;
          for (let j = jags; j >= 0; j--) {
            const jx = tx - lw + (j / jags) * lw * 2;
            const jy = ly + (j % 2 === 0 ? 0 : -lh * 0.08);
            ctx.lineTo(jx, jy);
          }
          // Left side
          ctx.quadraticCurveTo(tx - lw * 0.3, peakY + lh * 0.4, tx, peakY);
          ctx.closePath(); ctx.fill();

          // Branch shadow / depth
          ctx.fillStyle = 'rgba(0,50,0,0.15)';
          ctx.beginPath();
          ctx.moveTo(tx + lw * 0.1, peakY + lh * 0.3);
          ctx.lineTo(tx + lw, ly);
          ctx.lineTo(tx + lw * 0.3, ly);
          ctx.closePath(); ctx.fill();

          // Branch highlight (left)
          ctx.fillStyle = 'rgba(100,200,120,0.15)';
          ctx.beginPath();
          ctx.moveTo(tx, peakY);
          ctx.lineTo(tx - lw * 0.6, ly - lh * 0.2);
          ctx.lineTo(tx - lw * 0.2, peakY + lh * 0.5);
          ctx.closePath(); ctx.fill();
        }

        // ── Tinsel / garland — wavy gold lines ──
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        for (let g = 0; g < 3; g++) {
          const gRatio = 0.18 + g * 0.20;
          const gY = treeBase - th * gRatio;
          const gHalfW = tw * (0.50 - gRatio * 0.40) * 0.55;
          ctx.beginPath();
          ctx.moveTo(tx - gHalfW, gY);
          for (let step = 0; step <= 10; step++) {
            const frac = step / 10;
            const sx = tx - gHalfW + frac * gHalfW * 2;
            const sy = gY + Math.sin(frac * Math.PI * 3 + g) * 4;
            ctx.lineTo(sx, sy);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ── Ornaments ──
        const ornColors = ['#e04040','#4090e0','#ff69b4','#ff8c00','#a855f7','#34d399','#ffd700'];
        const ornaments = [
          // Layer 1 (bottom)
          { x: -0.28, y: 0.12 }, { x: 0.00, y: 0.10 }, { x: 0.24, y: 0.14 },
          // Layer 2
          { x: -0.18, y: 0.28 }, { x: 0.10, y: 0.26 }, { x: 0.22, y: 0.30 },
          // Layer 3
          { x: -0.12, y: 0.44 }, { x: 0.05, y: 0.42 }, { x: 0.16, y: 0.46 },
          // Layer 4 (top)
          { x: -0.06, y: 0.58 }, { x: 0.08, y: 0.57 },
        ];
        const ornR = Math.max(3, tw * 0.035);
        for (let i = 0; i < ornaments.length; i++) {
          const ox = tx + ornaments[i].x * tw;
          const oy = treeBase - ornaments[i].y * th;
          const color = ornColors[i % ornColors.length];

          // Animated glow
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.18 + Math.sin(t / 650 + i * 1.3) * 0.10;
          ctx.beginPath(); ctx.arc(ox, oy, ornR * 2.5, 0, Math.PI * 2); ctx.fill();

          // Ornament ball
          ctx.globalAlpha = 1;
          const ballGrad = ctx.createRadialGradient(ox - ornR * 0.3, oy - ornR * 0.3, 0, ox, oy, ornR);
          ballGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
          ballGrad.addColorStop(0.5, color);
          ballGrad.addColorStop(1, color);
          ctx.fillStyle = ballGrad;
          ctx.beginPath(); ctx.arc(ox, oy, ornR, 0, Math.PI * 2); ctx.fill();

          // Small highlight
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(ox - ornR * 0.25, oy - ornR * 0.3, ornR * 0.28, 0, Math.PI * 2); ctx.fill();

          // Tiny hook/cap on top
          ctx.fillStyle = '#ccc';
          ctx.fillRect(ox - 1, oy - ornR - 2, 2, 3);
        }

        // ── Star on top ──
        const starCy = treeBase - th * 0.76;
        const starR = Math.max(6, tw * 0.065);

        // Star glow (outer)
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = 0.10 + Math.sin(t / 400) * 0.06;
        ctx.beginPath(); ctx.arc(tx, starCy, starR * 3.5, 0, Math.PI * 2); ctx.fill();

        // Star body
        ctx.globalAlpha = 0.9 + Math.sin(t / 400) * 0.1;
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
          const aInner = a + Math.PI / 5;
          ctx.lineTo(tx + Math.cos(a) * starR, starCy + Math.sin(a) * starR);
          ctx.lineTo(tx + Math.cos(aInner) * starR * 0.4, starCy + Math.sin(aInner) * starR * 0.4);
        }
        ctx.closePath(); ctx.fill();

        // Star inner highlight
        ctx.fillStyle = 'rgba(255,255,200,0.5)';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
          const aInner = a + Math.PI / 5;
          ctx.lineTo(tx + Math.cos(a) * starR * 0.6, starCy + Math.sin(a) * starR * 0.6);
          ctx.lineTo(tx + Math.cos(aInner) * starR * 0.25, starCy + Math.sin(aInner) * starR * 0.25);
        }
        ctx.closePath(); ctx.fill();

        // Light rays from star
        ctx.strokeStyle = 'rgba(255,215,0,0.15)'; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 / 8) * i + t / 3000;
          ctx.beginPath();
          ctx.moveTo(tx + Math.cos(a) * starR * 1.3, starCy + Math.sin(a) * starR * 1.3);
          ctx.lineTo(tx + Math.cos(a) * starR * 2.2, starCy + Math.sin(a) * starR * 2.2);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Coffee Maker
      if (hasDecor('coffeemaker')) {
        ctx.save();
        const pos = getDecorPos('coffeemaker');
        const cx = pos.x * rw, baseY = pos.y * rh;
        const cw = rw * 0.04, ch = (rh - floorY) * 0.35;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(cx, baseY, cw * 0.6, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Base
        ctx.fillStyle = '#333';
        roundRectPath(ctx, cx - cw * 0.6, baseY - ch * 0.12, cw * 1.2, ch * 0.12, 2);
        ctx.fill();
        // Body
        ctx.fillStyle = '#444';
        roundRectPath(ctx, cx - cw * 0.45, baseY - ch, cw * 0.9, ch * 0.88, 3);
        ctx.fill();
        // Water tank (top back)
        ctx.fillStyle = 'rgba(100,180,220,0.2)';
        ctx.fillRect(cx - cw * 0.35, baseY - ch + 4, cw * 0.7, ch * 0.3);
        // Drip area
        ctx.fillStyle = '#555';
        ctx.fillRect(cx - cw * 0.3, baseY - ch * 0.35, cw * 0.6, ch * 0.08);
        // Coffee pot (carafe)
        ctx.fillStyle = 'rgba(100,60,20,0.3)';
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.25, baseY - ch * 0.12);
        ctx.lineTo(cx - cw * 0.2, baseY - ch * 0.28);
        ctx.lineTo(cx + cw * 0.2, baseY - ch * 0.28);
        ctx.lineTo(cx + cw * 0.25, baseY - ch * 0.12);
        ctx.fill();
        // Pot handle
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx + cw * 0.2, baseY - ch * 0.25); ctx.lineTo(cx + cw * 0.35, baseY - ch * 0.22); ctx.lineTo(cx + cw * 0.35, baseY - ch * 0.15); ctx.lineTo(cx + cw * 0.2, baseY - ch * 0.12); ctx.stroke();
        // Power light
        ctx.fillStyle = '#34d399';
        ctx.beginPath(); ctx.arc(cx + cw * 0.3, baseY - ch * 0.08, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Game Console
      if (hasDecor('gaming')) {
        ctx.save();
        const pos = getDecorPos('gaming');
        const gx = pos.x * rw, baseY = pos.y * rh;
        const gw = rw * 0.06, gh = rw * 0.025;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(gx, baseY, gw * 0.4, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Console body
        ctx.fillStyle = '#1a1a2e';
        roundRectPath(ctx, gx - gw * 0.35, baseY - gh * 1.2, gw * 0.7, gh, 3);
        ctx.fill();
        // Disc slot
        ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(gx - gw * 0.15, baseY - gh * 0.8); ctx.lineTo(gx + gw * 0.15, baseY - gh * 0.8); ctx.stroke();
        // Power button
        ctx.fillStyle = '#3498db';
        ctx.beginPath(); ctx.arc(gx + gw * 0.2, baseY - gh * 0.6, 2, 0, Math.PI * 2); ctx.fill();
        // Controller on floor
        const ctrlX = gx - gw * 0.15, ctrlY = baseY - 3;
        ctx.fillStyle = '#2c2c3e';
        roundRectPath(ctx, ctrlX - 10, ctrlY - 5, 20, 10, 4);
        ctx.fill();
        // D-pad
        ctx.fillStyle = '#444';
        ctx.fillRect(ctrlX - 7, ctrlY - 1.5, 5, 3);
        ctx.fillRect(ctrlX - 5.5, ctrlY - 3, 3, 6);
        // Buttons
        ctx.fillStyle = '#e04040'; ctx.beginPath(); ctx.arc(ctrlX + 5, ctrlY - 1, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4090e0'; ctx.beginPath(); ctx.arc(ctrlX + 7, ctrlY + 1, 1.5, 0, Math.PI * 2); ctx.fill();
        // Thumbsticks
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(ctrlX - 3, ctrlY + 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ctrlX + 3, ctrlY + 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Camera Tripod
      if (hasDecor('camera')) {
        ctx.save();
        const pos = getDecorPos('camera');
        const cx = pos.x * rw, baseY = pos.y * rh;
        const ch = (rh - floorY) * 0.5;
        const pivotY = baseY - ch * 0.65;
        // Tripod legs
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(cx - 14, baseY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(cx + 12, baseY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(cx + 2, baseY); ctx.stroke();
        // Joint
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(cx, pivotY, 3, 0, Math.PI * 2); ctx.fill();
        // Camera body
        const camW = rw * 0.03, camH = camW * 0.65;
        ctx.fillStyle = '#222';
        roundRectPath(ctx, cx - camW / 2, pivotY - camH - 4, camW, camH, 2);
        ctx.fill();
        // Lens
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(cx, pivotY - camH * 0.5 - 4, camW * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5bb5e0';
        ctx.beginPath(); ctx.arc(cx, pivotY - camH * 0.5 - 4, camW * 0.12, 0, Math.PI * 2); ctx.fill();
        // Flash bump
        ctx.fillStyle = '#333';
        roundRectPath(ctx, cx - camW * 0.15, pivotY - camH - 7, camW * 0.3, 3, 1);
        ctx.fill();
        // Viewfinder
        ctx.fillStyle = '#444';
        ctx.fillRect(cx + camW * 0.15, pivotY - camH - 2, camW * 0.12, camH * 0.3);
        ctx.restore();
      }

      // Mini Fountain
      if (hasDecor('fountain')) {
        ctx.save();
        const pos = getDecorPos('fountain');
        const fx = pos.x * rw, baseY = pos.y * rh;
        const fw = rw * 0.06, fh = (rh - floorY) * 0.35;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(fx, baseY, fw * 0.5, 4, 0, 0, Math.PI * 2); ctx.fill();
        // Base bowl
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.moveTo(fx - fw * 0.45, baseY - fh * 0.15);
        ctx.quadraticCurveTo(fx - fw * 0.5, baseY, fx, baseY + 2);
        ctx.quadraticCurveTo(fx + fw * 0.5, baseY, fx + fw * 0.45, baseY - fh * 0.15);
        ctx.fill();
        // Water in bowl
        ctx.fillStyle = 'rgba(64,164,223,0.3)';
        ctx.beginPath(); ctx.ellipse(fx, baseY - fh * 0.1, fw * 0.35, fh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        // Pillar
        ctx.fillStyle = '#999';
        ctx.fillRect(fx - 3, baseY - fh * 0.6, 6, fh * 0.45);
        // Top bowl
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.moveTo(fx - fw * 0.25, baseY - fh * 0.55);
        ctx.quadraticCurveTo(fx - fw * 0.3, baseY - fh * 0.4, fx, baseY - fh * 0.38);
        ctx.quadraticCurveTo(fx + fw * 0.3, baseY - fh * 0.4, fx + fw * 0.25, baseY - fh * 0.55);
        ctx.fill();
        // Water spout
        ctx.fillStyle = 'rgba(64,164,223,0.4)';
        const spoutH = fh * 0.2;
        ctx.beginPath();
        ctx.moveTo(fx - 1, baseY - fh * 0.6);
        ctx.quadraticCurveTo(fx, baseY - fh * 0.6 - spoutH, fx + 1, baseY - fh * 0.6);
        ctx.fill();
        // Water drops
        ctx.fillStyle = 'rgba(100,200,255,0.4)';
        const dropT = t / 600;
        ctx.beginPath(); ctx.arc(fx - 4, baseY - fh * 0.35 + Math.sin(dropT) * 3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(fx + 3, baseY - fh * 0.3 + Math.sin(dropT + 1) * 3, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Chess Set
      if (hasDecor('chessset')) {
        ctx.save();
        const pos = getDecorPos('chessset');
        const cx = pos.x * rw, baseY = pos.y * rh;
        const cw = rw * 0.06, ch = rw * 0.04;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(cx, baseY, cw * 0.45, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Board
        ctx.fillStyle = '#8B6F47';
        roundRectPath(ctx, cx - cw / 2, baseY - ch, cw, ch * 0.15, 1);
        ctx.fill();
        // Board surface
        ctx.fillStyle = '#d4b87a';
        ctx.fillRect(cx - cw * 0.45, baseY - ch + 1, cw * 0.9, ch * 0.12);
        // Checker pattern
        const sq = cw * 0.9 / 8;
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 0) {
              ctx.fillStyle = '#5a4220';
              ctx.fillRect(cx - cw * 0.45 + c * sq, baseY - ch + 1 + r * (ch * 0.06), sq, ch * 0.06);
            }
          }
        }
        // Chess pieces (simplified)
        // White king
        ctx.fillStyle = '#f5f0e0';
        ctx.fillRect(cx - cw * 0.2 - 2, baseY - ch - 6, 4, 8);
        ctx.beginPath(); ctx.arc(cx - cw * 0.2, baseY - ch - 8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f5f0e0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - cw * 0.2, baseY - ch - 11); ctx.lineTo(cx - cw * 0.2, baseY - ch - 13); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - cw * 0.2 - 2, baseY - ch - 12); ctx.lineTo(cx - cw * 0.2 + 2, baseY - ch - 12); ctx.stroke();
        // Black queen
        ctx.fillStyle = '#222';
        ctx.fillRect(cx + cw * 0.15 - 2, baseY - ch - 6, 4, 8);
        ctx.beginPath(); ctx.arc(cx + cw * 0.15, baseY - ch - 8, 3, 0, Math.PI * 2); ctx.fill();
        // Crown points
        ctx.beginPath();
        ctx.moveTo(cx + cw * 0.15 - 3, baseY - ch - 10);
        ctx.lineTo(cx + cw * 0.15 - 2, baseY - ch - 13);
        ctx.lineTo(cx + cw * 0.15, baseY - ch - 10);
        ctx.lineTo(cx + cw * 0.15 + 2, baseY - ch - 13);
        ctx.lineTo(cx + cw * 0.15 + 3, baseY - ch - 10);
        ctx.fill();
        // Pawns
        ctx.fillStyle = '#f5f0e0';
        ctx.beginPath(); ctx.arc(cx - cw * 0.35, baseY - ch - 3, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(cx + cw * 0.32, baseY - ch - 3, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Bonsai Tree
      if (hasDecor('bonsai')) {
        ctx.save();
        const pos = getDecorPos('bonsai');
        const bx = pos.x * rw, baseY = pos.y * rh;
        const bh = (rh - floorY) * 0.35;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(bx, baseY, 14, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Pot
        ctx.fillStyle = '#6d5040';
        ctx.beginPath();
        ctx.moveTo(bx - 12, baseY - bh * 0.2);
        ctx.lineTo(bx - 10, baseY);
        ctx.lineTo(bx + 10, baseY);
        ctx.lineTo(bx + 12, baseY - bh * 0.2);
        ctx.fill();
        ctx.fillStyle = '#7a5a48';
        ctx.fillRect(bx - 13, baseY - bh * 0.22, 26, 3);
        // Soil
        ctx.fillStyle = '#4a3018';
        ctx.beginPath(); ctx.ellipse(bx, baseY - bh * 0.2, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Trunk (curved)
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, baseY - bh * 0.2);
        ctx.quadraticCurveTo(bx - 6, baseY - bh * 0.5, bx + 2, baseY - bh * 0.65);
        ctx.stroke();
        // Branch left
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bx - 2, baseY - bh * 0.45);
        ctx.quadraticCurveTo(bx - 14, baseY - bh * 0.5, bx - 16, baseY - bh * 0.55);
        ctx.stroke();
        // Branch right
        ctx.beginPath();
        ctx.moveTo(bx + 1, baseY - bh * 0.6);
        ctx.quadraticCurveTo(bx + 10, baseY - bh * 0.55, bx + 14, baseY - bh * 0.6);
        ctx.stroke();
        // Foliage blobs
        ctx.fillStyle = '#2d7a3a';
        ctx.beginPath(); ctx.arc(bx + 2, baseY - bh * 0.72, 10, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx - 6, baseY - bh * 0.68, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a9a4a';
        ctx.beginPath(); ctx.arc(bx + 6, baseY - bh * 0.7, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx - 16, baseY - bh * 0.58, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 14, baseY - bh * 0.64, 6, 0, Math.PI * 2); ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(100,200,100,0.15)';
        ctx.beginPath(); ctx.arc(bx - 2, baseY - bh * 0.76, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Bluetooth Speaker (floor)
      if (hasDecor('speaker2')) {
        ctx.save();
        const pos = getDecorPos('speaker2');
        const sx = pos.x * rw, baseY = pos.y * rh;
        const sw = rw * 0.04, sh = rw * 0.02;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(sx, baseY, sw * 0.4, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Body (cylinder)
        ctx.fillStyle = '#2a2a3e';
        roundRectPath(ctx, sx - sw * 0.4, baseY - sh * 1.5, sw * 0.8, sh * 1.5, sw * 0.3);
        ctx.fill();
        // Speaker grille
        ctx.strokeStyle = 'rgba(100,100,120,0.4)'; ctx.lineWidth = 0.6;
        for (let i = 0; i < 6; i++) {
          const gy = baseY - sh * 1.3 + i * sh * 0.2;
          ctx.beginPath(); ctx.moveTo(sx - sw * 0.3, gy); ctx.lineTo(sx + sw * 0.3, gy); ctx.stroke();
        }
        // Status LED
        ctx.fillStyle = '#3498db';
        ctx.beginPath(); ctx.arc(sx, baseY - sh * 0.3, 1.5, 0, Math.PI * 2); ctx.fill();
        // Sound waves
        ctx.strokeStyle = 'rgba(100,160,255,0.2)'; ctx.lineWidth = 1;
        for (let i = 1; i <= 2; i++) {
          const wR = sw * 0.3 + i * 4;
          ctx.beginPath(); ctx.arc(sx, baseY - sh * 0.8, wR, -0.5, 0.5); ctx.stroke();
        }
        ctx.restore();
      }

      // Shoe Rack
      if (hasDecor('shoe_rack')) {
        ctx.save();
        const pos = getDecorPos('shoe_rack');
        const rx = pos.x * rw, baseY = pos.y * rh;
        const rw2 = rw * 0.06, rh2 = (rh - floorY) * 0.3;
        const ry = baseY - rh2;
        // Frame
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(rx - rw2 / 2, ry, 3, rh2);
        ctx.fillRect(rx + rw2 / 2 - 3, ry, 3, rh2);
        // Shelves (2 tiers)
        ctx.fillStyle = '#a08868';
        ctx.fillRect(rx - rw2 / 2, ry + rh2 * 0.45, rw2, 3);
        ctx.fillRect(rx - rw2 / 2, baseY - 3, rw2, 3);
        // Shoes on top shelf
        // Shoe 1 (sneaker)
        ctx.fillStyle = '#e04040';
        ctx.beginPath();
        ctx.moveTo(rx - rw2 * 0.3, ry + rh2 * 0.42);
        ctx.lineTo(rx - rw2 * 0.35, ry + rh2 * 0.3);
        ctx.quadraticCurveTo(rx - rw2 * 0.1, ry + rh2 * 0.25, rx - rw2 * 0.05, ry + rh2 * 0.35);
        ctx.lineTo(rx - rw2 * 0.05, ry + rh2 * 0.42);
        ctx.fill();
        // Shoe 2
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.moveTo(rx + rw2 * 0.05, ry + rh2 * 0.42);
        ctx.lineTo(rx + rw2 * 0.02, ry + rh2 * 0.3);
        ctx.quadraticCurveTo(rx + rw2 * 0.25, ry + rh2 * 0.25, rx + rw2 * 0.3, ry + rh2 * 0.35);
        ctx.lineTo(rx + rw2 * 0.3, ry + rh2 * 0.42);
        ctx.fill();
        // Shoes on bottom shelf
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(rx - rw2 * 0.25, baseY - 5);
        ctx.lineTo(rx - rw2 * 0.3, baseY - rh2 * 0.18);
        ctx.quadraticCurveTo(rx - rw2 * 0.05, baseY - rh2 * 0.22, rx, baseY - rh2 * 0.12);
        ctx.lineTo(rx, baseY - 5);
        ctx.fill();
        // Slipper
        ctx.fillStyle = '#e8a0c0';
        ctx.beginPath(); ctx.ellipse(rx + rw2 * 0.2, baseY - 6, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Model Rocket
      if (hasDecor('rocket')) {
        ctx.save();
        const pos = getDecorPos('rocket');
        const rx = pos.x * rw, baseY = pos.y * rh;
        const rh2 = (rh - floorY) * 0.45;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath(); ctx.ellipse(rx, baseY, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Stand
        ctx.fillStyle = '#666';
        ctx.fillRect(rx - 8, baseY - 5, 16, 5);
        ctx.fillRect(rx - 2, baseY - rh2 * 0.15, 4, rh2 * 0.12);
        // Rocket body
        const rBody = rh2 * 0.7;
        const rBot = baseY - rh2 * 0.15;
        ctx.fillStyle = '#f0f0f0';
        roundRectPath(ctx, rx - 6, rBot - rBody, 12, rBody, 5);
        ctx.fill();
        // Nose cone
        ctx.fillStyle = '#e04040';
        ctx.beginPath();
        ctx.moveTo(rx, rBot - rBody - 10);
        ctx.quadraticCurveTo(rx - 7, rBot - rBody + 2, rx - 6, rBot - rBody + 5);
        ctx.lineTo(rx + 6, rBot - rBody + 5);
        ctx.quadraticCurveTo(rx + 7, rBot - rBody + 2, rx, rBot - rBody - 10);
        ctx.fill();
        // Window
        ctx.fillStyle = '#5bb5e0';
        ctx.beginPath(); ctx.arc(rx, rBot - rBody * 0.65, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(rx, rBot - rBody * 0.65, 3.5, 0, Math.PI * 2); ctx.stroke();
        // Stripe
        ctx.fillStyle = '#e04040';
        ctx.fillRect(rx - 6, rBot - rBody * 0.35, 12, rBody * 0.06);
        // Fins
        ctx.fillStyle = '#e04040';
        ctx.beginPath(); ctx.moveTo(rx - 6, rBot); ctx.lineTo(rx - 12, rBot + 4); ctx.lineTo(rx - 6, rBot - rBody * 0.15); ctx.fill();
        ctx.beginPath(); ctx.moveTo(rx + 6, rBot); ctx.lineTo(rx + 12, rBot + 4); ctx.lineTo(rx + 6, rBot - rBody * 0.15); ctx.fill();
        // Engine nozzle
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.moveTo(rx - 3, rBot); ctx.lineTo(rx - 4, rBot + 4); ctx.lineTo(rx + 4, rBot + 4); ctx.lineTo(rx + 3, rBot); ctx.fill();
        ctx.restore();
      }

      // Mini Fridge
      if (hasDecor('minifridge')) {
        ctx.save();
        const pos = getDecorPos('minifridge');
        const fx = pos.x * rw, baseY = pos.y * rh;
        const fw = rw * 0.045, fh = (rh - floorY) * 0.5;
        const fy = baseY - fh;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(fx - fw / 2 + 2, fy + 2, fw + 1, fh + 1);
        // Body
        ctx.fillStyle = '#ddd';
        roundRectPath(ctx, fx - fw / 2, fy, fw, fh, 3);
        ctx.fill();
        // Door line (top freezer / bottom fridge)
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx - fw / 2 + 2, fy + fh * 0.35); ctx.lineTo(fx + fw / 2 - 2, fy + fh * 0.35); ctx.stroke();
        // Top door handle
        ctx.fillStyle = '#bbb';
        ctx.fillRect(fx + fw / 2 - 6, fy + fh * 0.12, 3, fh * 0.15);
        // Bottom door handle
        ctx.fillRect(fx + fw / 2 - 6, fy + fh * 0.45, 3, fh * 0.15);
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(fx - fw / 2 + 2, fy + 2, fw - 4, 3);
        // Brand logo area
        ctx.fillStyle = '#ccc';
        ctx.beginPath(); ctx.arc(fx, fy + fh * 0.18, 3, 0, Math.PI * 2); ctx.fill();
        // Magnetic sticker
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath(); ctx.arc(fx - fw * 0.15, fy + fh * 0.55, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#55efc4';
        roundRectPath(ctx, fx + fw * 0.05, fy + fh * 0.65, 8, 6, 1);
        ctx.fill();
        ctx.restore();
      }

      // Generic emoji fallback for new floor decorations without specific drawing code
      const knownFloorDecors = ['floorlamp','sidetable','cushion','toybox','bookcase','aquarium','guitar','globe','trashcan','fan','beanpillow','tv','piano','telescope','cactus','candles','skateboard','vinylplayer','umbrella','terrarium','xmastree','coffeemaker','gaming','camera','fountain','chessset','bonsai','speaker2','shoe_rack','rocket','minifridge'];
      (roomData.placedDecors || []).filter(d => {
        const def = DECORATIONS.find(x => x.id === d.id);
        return def && def.category === 'floor' && !knownFloorDecors.includes(d.id);
      }).forEach(d => {
        const def = DECORATIONS.find(x => x.id === d.id);
        const px = d.x * rw, py = d.y * rh;
        ctx.save();
        ctx.font = Math.round(rw * 0.07) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.emoji, px, py);
        ctx.restore();
      });
    }

