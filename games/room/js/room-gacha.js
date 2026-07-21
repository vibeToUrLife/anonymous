    /* ═══════════════════════════════
       9. GACHA / LUCKY DRAW
       ═══════════════════════════════ */
    let _gachaSpinning = false;

    function renderGachaTab() {
      if (_gachaSpinning) return; // Don't rebuild during animation
      const el = document.getElementById('gachaTabContent');
      if (!el) return;
      const canAfford = roomData.coins >= GACHA_COST && !_gachaSpinning;
      let html = '<div style="text-align:center;padding:10px 0">' +
        '<div class="gacha-reel-window" id="gachaReelWindow"><div class="gacha-reel-strip" id="gachaReelStrip">' +
        '<div class="gacha-reel-item" style="opacity:.3">🎲</div></div></div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:14px">Cost: 💰 ' + GACHA_COST + ' per pull</div>' +
        '<button class="gacha-pull-btn" id="gachaPullTabBtn" onclick="pullGacha()" ' + (canAfford ? '' : 'disabled') + '>🎲 Pull!</button>' +
        '<button onclick="showGachaPrizeModal()" style="margin-top:10px;padding:8px 18px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:transparent;color:rgba(255,255,255,.5);font-size:12px;cursor:pointer">📋 View Prizes</button>' +
        '<div id="gachaTabResult" style="margin-top:16px;min-height:80px"></div></div>';
      el.innerHTML = html;
    }

    function _drawAccPreviewOnCanvas(cvs, accId) {
      const ctx = cvs.getContext('2d');
      const w = cvs.width, h = cvs.height;
      const s = w * 0.7;
      const ho = PET_HEAD_OFFSETS['cat'] || { hx: 0, hy: -0.3, r: 0.28 };
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 - s * ho.hx, h / 2 + s * 0.1 - s * ho.hy);
      const hx = s * ho.hx, hy = s * ho.hy;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(hx, hy, s * ho.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx - s*0.22, hy - s*0.18); ctx.lineTo(hx - s*0.16, hy - s*0.38); ctx.lineTo(hx - s*0.06, hy - s*0.22); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx + s*0.22, hy - s*0.18); ctx.lineTo(hx + s*0.16, hy - s*0.38); ctx.lineTo(hx + s*0.06, hy - s*0.22); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(hx - s*0.08, hy - s*0.02, s*0.025, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + s*0.08, hy - s*0.02, s*0.025, 0, Math.PI*2); ctx.fill();
      drawPetAccessory(ctx, 'cat', accId, s);
      ctx.restore();
    }

    function showGachaPrizeModal() {
      const el = document.getElementById('gachaPrizeModalList');
      if (!el) return;
      const totalWeight = GACHA_POOL.reduce((s, i) => s + i.weight, 0);
      const owned = roomData.ownedAccessories || [];
      const rarityColors = { legendary: '#fbbf24', epic: '#c084fc', rare: '#60a5fa', uncommon: '#34d399', common: 'rgba(255,255,255,.5)' };
      const rarityLabels = { legendary: '★ Legendary', epic: '✦ Epic', rare: '◆ Rare', uncommon: '● Uncommon', common: '○ Common' };
      const order = ['legendary','epic','rare','uncommon','common'];
      let html = '';

      order.forEach(rarity => {
        const items = GACHA_POOL.filter(p => p.rarity === rarity);
        if (!items.length) return;
        const groupPct = items.reduce((s, i) => s + (i.weight / totalWeight) * 100, 0).toFixed(1);

        html += '<div style="margin-bottom:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
        html += '<span style="font-size:13px;font-weight:700;color:' + rarityColors[rarity] + '">' + rarityLabels[rarity] + '</span>';
        html += '<span style="font-size:11px;color:rgba(255,255,255,.4);font-weight:600">' + groupPct + '%</span>';
        html += '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
        items.forEach(item => {
          const pct = ((item.weight / totalWeight) * 100).toFixed(1);
          const isAcc = item.type === 'accessory';
          const isOwned = isAcc && owned.includes(item.id);
          const isExcl = isAcc && (PET_ACCESSORIES.find(a => a.id === item.id) || {}).gachaOnly;
          html += '<div style="text-align:center;padding:6px 4px;border-radius:8px;background:rgba(255,255,255,.04);min-width:60px;opacity:' + (isOwned ? '0.45' : '1') + '">';
          if (isAcc) {
            html += '<canvas class="gacha-preview-cvs" data-acc="' + item.id + '" width="48" height="48" style="width:36px;height:36px;display:block;margin:0 auto 3px"></canvas>';
          } else {
            html += '<div style="font-size:24px;line-height:36px;height:36px">' + item.emoji + '</div>';
          }
          html += '<div style="font-size:9px;color:#fff;font-weight:600">' + item.name + '</div>';
          html += '<div style="font-size:8px;color:rgba(255,255,255,.3)">' + pct + '%</div>';
          if (isOwned) html += '<div style="font-size:8px;color:#34d399">✓</div>';
          if (isExcl) html += '<div style="font-size:8px;color:#c084fc">★</div>';
          html += '</div>';
        });
        html += '</div></div>';
      });

      el.innerHTML = html;
      document.getElementById('gachaPrizeOverlay').classList.remove('hidden');
      el.querySelectorAll('.gacha-preview-cvs').forEach(cvs => _drawAccPreviewOnCanvas(cvs, cvs.dataset.acc));
    }

    function spawnGachaConfetti(container, rarity) {
      if (rarity === 'common' || rarity === 'uncommon') return;
      const colors = {
        rare: ['#60a5fa','#93c5fd','#3b82f6'],
        epic: ['#c084fc','#a855f7','#e9d5ff'],
        legendary: ['#fbbf24','#fde68a','#f59e0b','#fff']
      };
      const cols = colors[rarity] || colors.rare;
      const count = rarity === 'legendary' ? 24 : 14;
      for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        dot.className = 'gacha-confetti';
        dot.style.background = cols[Math.floor(Math.random() * cols.length)];
        dot.style.left = (20 + Math.random() * 60) + '%';
        dot.style.top = '30%';
        dot.style.animationDelay = (Math.random() * 0.6) + 's';
        dot.style.animationDuration = (1 + Math.random() * 1) + 's';
        container.style.position = 'relative';
        container.appendChild(dot);
        setTimeout(() => dot.remove(), 2500);
      }
    }

    async function pullGacha() {
      if (viewingUid !== currentUid) return;
      if (_gachaSpinning) return;
      if (roomData.coins < GACHA_COST) return showToast('Not enough coins!', 'error');
      _gachaSpinning = true;

      // Disable button immediately
      const btn = document.getElementById('gachaPullTabBtn');
      if (btn) btn.disabled = true;
      const resultEl = document.getElementById('gachaTabResult');
      if (resultEl) resultEl.innerHTML = '';

      roomData.coins -= GACHA_COST;
      logCoin(-GACHA_COST, 'Gacha pull 🎰');
      roomData.gachaPulls = (roomData.gachaPulls || 0) + 1;

      // Show coin deduction immediately
      document.getElementById('coinAmount').textContent = roomData.coins;

      // Weighted random — pick a single prize
      const totalWeight = GACHA_POOL.reduce((s, i) => s + i.weight, 0);
      let rand = Math.random() * totalWeight;
      let prize = GACHA_POOL[0];
      for (const item of GACHA_POOL) {
        rand -= item.weight;
        if (rand <= 0) { prize = item; break; }
      }

      // ── Spin animation in reel ──
      const strip = document.getElementById('gachaReelStrip');
      const reelWin = document.getElementById('gachaReelWindow');
      if (strip && reelWin) {
        const reelCount = 20;
        let reelHtml = '';
        for (let i = 0; i < reelCount; i++) {
          const rItem = GACHA_POOL[Math.floor(Math.random() * GACHA_POOL.length)];
          reelHtml += '<div class="gacha-reel-item">' + rItem.emoji + '</div>';
        }
        reelHtml += '<div class="gacha-reel-item">' + prize.emoji + '</div>';
        strip.innerHTML = reelHtml;

        const itemH = 90;
        const totalScroll = reelCount * itemH;
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0)';
        strip.offsetHeight;
        strip.style.transition = 'transform 2.5s cubic-bezier(0.12, 0.8, 0.3, 1)';
        strip.style.transform = 'translateY(-' + totalScroll + 'px)';
        reelWin.style.animation = 'gachaGlow 2.5s ease-in-out';

        setTimeout(() => {
          reelWin.style.animation = '';
          _gachaSpinning = false;
          const pullBtn = document.getElementById('gachaPullTabBtn');
          if (pullBtn) pullBtn.disabled = roomData.coins < GACHA_COST;
          revealGachaPrize(prize);
        }, 2700);
      } else {
        _gachaSpinning = false;
        revealGachaPrize(prize);
      }
    }

    async function revealGachaPrize(prize) {
      if (viewingUid !== currentUid) return;
      const revealEl = document.getElementById('gachaTabResult');
      if (!revealEl) return;
      const showRarity = prize.rarity !== 'common' && prize.rarity !== 'uncommon';

      if (prize.type === 'coins') {
        // Coin prize — add coins
        roomData.coins += prize.amount;
        logCoin(prize.amount, 'Gacha prize');
        document.getElementById('coinAmount').textContent = roomData.coins;
        _lastLocalSaveTime = Date.now();
        saveRoom().then(() => checkAchievements());
        revealEl.innerHTML = '<div class="gacha-prize-reveal">' +
          '<div class="gacha-prize-emoji" style="font-size:48px">💰</div>' +
          (showRarity ? '<div class="gacha-prize-rarity ' + prize.rarity + '">' + prize.rarity + '</div>' : '') +
          '<div class="gacha-prize-name">' + prize.name + '</div>' +
          '<div style="font-size:13px;color:#f7c97e;margin-top:6px">+' + prize.amount + ' coins!</div></div>';
        spawnGachaConfetti(revealEl, prize.rarity);

      } else if (prize.type === 'accessory') {
        const owned = roomData.ownedAccessories || [];
        const acc = PET_ACCESSORIES.find(a => a.id === prize.id);

        if (owned.includes(prize.id)) {
          // Already owned — give coin consolation based on rarity
          const refund = { common: 25, uncommon: 50, rare: 100, epic: 200, legendary: 400 }[prize.rarity] || 25;
          roomData.coins += refund;
          logCoin(refund, 'Gacha refund');
          document.getElementById('coinAmount').textContent = roomData.coins;
          _lastLocalSaveTime = Date.now();
          saveRoom().then(() => checkAchievements());
          revealEl.innerHTML = '<div class="gacha-prize-reveal">' +
            '<canvas class="gacha-reveal-cvs" data-acc="' + prize.id + '" width="80" height="80" style="width:80px;height:80px;margin:0 auto 6px;display:block"></canvas>' +
            (showRarity ? '<div class="gacha-prize-rarity ' + prize.rarity + '">' + prize.rarity + '</div>' : '') +
            '<div class="gacha-prize-name">' + prize.name + '</div>' +
            '<div style="font-size:12px;color:#f7c97e;margin-top:4px">Already owned — +' + refund + ' coins</div></div>';
          const rcvs = revealEl.querySelector('.gacha-reveal-cvs');
          if (rcvs) _drawAccPreviewOnCanvas(rcvs, prize.id);
        } else {
          // New accessory — add to collection
          roomData.ownedAccessories = [...owned, prize.id];
          _lastLocalSaveTime = Date.now();
          await saveRoom();
          checkAchievements();
          showToast('🎉 Got ' + (acc ? acc.name : prize.id) + '!', 'success');
          revealEl.innerHTML = '<div class="gacha-prize-reveal">' +
            '<canvas class="gacha-reveal-cvs" data-acc="' + prize.id + '" width="80" height="80" style="width:80px;height:80px;margin:0 auto 6px;display:block;animation:gachaFloat 2s ease-in-out infinite"></canvas>' +
            (showRarity ? '<div class="gacha-prize-rarity ' + prize.rarity + '">' + prize.rarity + '</div>' : '') +
            '<div class="gacha-prize-name">' + (acc ? acc.name : prize.id) + '</div>' +
            '<div style="font-size:12px;color:#34d399;margin-top:4px">Added to collection! Equip it on your pet in the Accessories tab.</div></div>';
          const rcvs = revealEl.querySelector('.gacha-reveal-cvs');
          if (rcvs) _drawAccPreviewOnCanvas(rcvs, prize.id);
          renderAccessoryShop();
        }
        spawnGachaConfetti(revealEl, prize.rarity);
      }
    }

