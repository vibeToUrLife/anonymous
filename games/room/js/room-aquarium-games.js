/* ============================================================
   Aquarium mini-games — three short coin bursts played on the tank
   canvas: Feeding Frenzy (tap flakes), Fish Race (bet on a racer),
   Bubble Pop (tap rising bubbles). Each takes over #aquariumCanvas
   while active, then restores the idle tank. Owner only. Cast + odds
   come from the placed fish (roomData.aquariumFish + FISH_TYPES).
   ============================================================ */
let _aqGame = null;       // 'frenzy' | 'race' | 'bubble' while a game runs, else null
let _aqGameRAF = null;
let _aqGameTap = null;    // active canvas pointer handler (so we can detach it)

function _aqGameToday() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function _aqCanvasEl() { return document.getElementById('aquariumCanvas'); }
function _aqCanvasPos(e, cvs) {
  const r = cvs.getBoundingClientRect();
  const px = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - r.left;
  const py = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY) - r.top;
  return { x: px * (cvs.width / r.width), y: py * (cvs.height / r.height) };
}
function _aqDrawWater(ctx, W, H, time) {
  const theme = (typeof AQUARIUM_THEMES !== 'undefined' && AQUARIUM_THEMES.find(t => t.id === (roomData.aquariumTheme || 'tropical'))) || { grad: ['#1a3a5c', '#15406a', '#0a1e38'], caustic: '100,200,255' };
  const water = ctx.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, theme.grad[0]); water.addColorStop(0.3, theme.grad[1]); water.addColorStop(1, theme.grad[2]);
  ctx.fillStyle = water; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 8; i++) {
    const cx = (Math.sin(time * 0.3 + i * 1.7) * 0.5 + 0.5) * W;
    const cy = (Math.cos(time * 0.2 + i * 2.3) * 0.5 + 0.5) * H;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
    g.addColorStop(0, 'rgba(' + theme.caustic + ',1)'); g.addColorStop(1, 'rgba(' + theme.caustic + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
}
function _aqHud(ctx, W, lines) {
  ctx.save();
  ctx.textAlign = 'center';
  for (let i = 0; i < lines.length; i++) {
    ctx.font = (i === 0 ? 'bold 16px' : 'bold 14px') + ' "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(lines[i], W / 2 + 1, 27 + i * 22);
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillText(lines[i], W / 2, 26 + i * 22);
  }
  ctx.restore();
}
function _aqGameBegin(type) {
  const cvs = _aqCanvasEl();
  if (!cvs) return null;
  cancelAnimationFrame(_aqAnimFrame); _aqAnimFrame = null;   // pause the idle tank loop
  _aqGame = type;
  return cvs;
}
function _aqGameEnd() {
  cancelAnimationFrame(_aqGameRAF); _aqGameRAF = null;
  const cvs = _aqCanvasEl();
  if (cvs && _aqGameTap) cvs.removeEventListener('pointerdown', _aqGameTap);
  _aqGameTap = null;
  _aqGame = null;
  if (typeof isAquariumView !== 'undefined' && isAquariumView) drawAquariumCanvas();  // restore the swimming tank
}
function _aqAward(coins) {
  if (coins > 0) { roomData.coins += coins; logCoin(coins, 'Aquarium game 🐟'); saveRoom(); if (typeof renderAll === 'function') renderAll(); }
}
function _aqResultModal(title, sub, coins) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;background:var(--g-scrim);backdrop-filter:blur(6px)';
  ov.innerHTML =
    '<div class="ws-box">' +
      '<div class="ws-head">' + title + '</div>' +
      '<div class="ws-sub">' + sub + '</div>' +
      (coins != null ? '<div class="ws-slot"><span class="ws-slot-no">🪙 Coins</span><span class="ws-slot-state">' + (coins >= 0 ? '+' : '') + coins + '</span></div>' : '') +
      '<button class="cp-crop" style="justify-content:center;font-weight:800">OK</button>' +
    '</div>';
  const close = function () { ov.remove(); };
  ov.querySelector('.cp-crop').addEventListener('click', close);
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  document.body.appendChild(ov);
}

/* ── How-to-play tutorials (the ℹ️ buttons in the panel) ── */
const _AQ_TUTORIALS = {
  frenzy: { title: '🍤 Feeding Frenzy', lines: [
    'Tap the falling food flakes before they sink.',
    'Every flake eaten counts as a bite.',
    'Tap in quick succession to build a 🔥 combo for bonus coins.',
    'Runs 15 seconds · 5-minute cooldown.'
  ] },
  race: { title: '🏁 Fish Race & Bet', lines: [
    'Pick a stake, then tap one of your fish to bet on it.',
    'Faster fish have lower odds (a smaller payout).',
    'If your fish wins the race, you earn stake × odds.',
    'Once a day · needs at least 3 fish in your tank.'
  ] },
  bubble: { title: '🫧 Bubble Pop', lines: [
    'Tap the rising bubbles before they reach the surface.',
    '🔵 coin = a little · 🟣 pearl = more · ⭐ jackpot = a lot!',
    'The more legendary fish you own, the more jackpots appear.',
    'Runs 20 seconds · once a day.'
  ] },
};
function showAquariumTutorial(type) {
  const t = _AQ_TUTORIALS[type];
  if (!t) return;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9650;display:flex;align-items:center;justify-content:center;background:var(--g-scrim);backdrop-filter:blur(6px)';
  ov.innerHTML =
    '<div class="ws-box">' +
      '<div class="ws-head">' + t.title + '</div>' +
      '<div class="ws-sub">How to play</div>' +
      '<ul class="aq-tut-list">' + t.lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' +
      '<button class="cp-crop" style="justify-content:center;font-weight:800">Got it!</button>' +
    '</div>';
  const close = function () { ov.remove(); };
  ov.querySelector('.cp-crop').addEventListener('click', close);
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  document.body.appendChild(ov);
}

/* ── Feeding Frenzy ── */
function startFeedingFrenzy() {
  if (viewingUid !== currentUid || _aqGame) return;
  const now = Date.now();
  if (now - (roomData.aquariumFrenzyAt || 0) < AQUARIUM_FRENZY_COOLDOWN_MS) {
    const mins = Math.ceil((AQUARIUM_FRENZY_COOLDOWN_MS - (now - roomData.aquariumFrenzyAt)) / 60000);
    showToast('🍤 Feeding Frenzy ready in ~' + mins + ' min', ''); return;
  }
  if (!(roomData.aquariumFish || []).length) { showToast('Place some fish first! 🐠', ''); return; }
  roomData.aquariumFrenzyAt = now; saveRoom();
  const cvs = _aqGameBegin('frenzy'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const flakes = []; let bites = 0, combo = 0, maxCombo = 0, lastBite = 0, lastSpawn = 0;
  const fish = (roomData.aquariumFish || []).map((name, i) => {
    const type = FISH_TYPES.find(f => f.name === name) || { size: 20 };
    return { type: type, x: Math.random() * W, y: H * (0.3 + Math.random() * 0.5), dir: 1, wob: i };
  });
  const start = performance.now();
  _aqGameTap = function (e) {
    const p = _aqCanvasPos(e, cvs);
    for (let i = flakes.length - 1; i >= 0; i--) {
      if (Math.hypot(flakes[i].x - p.x, flakes[i].y - p.y) < 26) {
        flakes.splice(i, 1); bites++;
        const tt = performance.now();
        combo = (tt - lastBite < 1500) ? combo + 1 : 1;
        lastBite = tt; if (combo > maxCombo) maxCombo = combo;
        break;
      }
    }
  };
  cvs.addEventListener('pointerdown', _aqGameTap);
  function frame(t) {
    if (typeof isAquariumView !== 'undefined' && !isAquariumView) { _aqGameEnd(); return; }
    const elapsed = t - start, time = t / 1000, left = Math.max(0, AQUARIUM_FRENZY_MS - elapsed);
    ctx.clearRect(0, 0, W, H);
    _aqDrawWater(ctx, W, H, time);
    if (t - lastSpawn > 600 && elapsed < AQUARIUM_FRENZY_MS - 1500) { lastSpawn = t; flakes.push({ x: 30 + Math.random() * (W - 60), y: -10, vy: 0.8 + Math.random() * 0.8 }); }
    for (let i = flakes.length - 1; i >= 0; i--) { flakes[i].y += flakes[i].vy * 2; if (flakes[i].y > H + 20) { flakes.splice(i, 1); combo = 0; } }
    fish.forEach(fsh => {
      let tgt = null, td = 1e9;
      for (const fl of flakes) { const d = Math.hypot(fl.x - fsh.x, fl.y - fsh.y); if (d < td) { td = d; tgt = fl; } }
      if (tgt) { const ang = Math.atan2(tgt.y - fsh.y, tgt.x - fsh.x); fsh.x += Math.cos(ang) * 1.7; fsh.y += Math.sin(ang) * 1.7; fsh.dir = Math.cos(ang) >= 0 ? 1 : -1; }
      fsh.wob += 0.1;
      ctx.save(); ctx.translate(fsh.x, fsh.y); ctx.scale(fsh.dir, 1); drawFish(ctx, fsh.type, fsh.type.size || 20, { phase: fsh.wob }); ctx.restore();
    });
    ctx.fillStyle = '#ffcf6b';
    flakes.forEach(fl => { ctx.beginPath(); ctx.arc(fl.x, fl.y, 6, 0, 7); ctx.fill(); });
    _aqHud(ctx, W, ['🍤 Feeding Frenzy — ' + (left / 1000).toFixed(1) + 's', 'Bites ' + bites + (combo > 1 ? '   🔥 x' + combo : '')]);
    if (left <= 0) {
      const coins = frenzyPayout(bites, maxCombo);
      _aqAward(coins); _aqGameEnd();
      _aqResultModal('🍤 Feeding Frenzy!', bites + ' bites · best combo x' + maxCombo, coins);
      return;
    }
    _aqGameRAF = requestAnimationFrame(frame);
  }
  _aqGameRAF = requestAnimationFrame(frame);
}

/* ── Bubble Pop ── */
function startBubblePop() {
  if (viewingUid !== currentUid || _aqGame) return;
  if ((roomData.aquariumBubbleDay || '') === _aqGameToday()) { showToast('🫧 Bubble Pop — come back tomorrow!', ''); return; }
  if (!(roomData.aquariumFish || []).length) { showToast('Place some fish first! 🐠', ''); return; }
  roomData.aquariumBubbleDay = _aqGameToday(); saveRoom();
  const legendaries = (roomData.aquariumFish || []).filter(n => { const f = FISH_TYPES.find(x => x.name === n); return f && f.rarity === 'legendary'; }).length;
  const jackChance = bubbleJackpotChance(legendaries);
  const cvs = _aqGameBegin('bubble'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const bubbles = []; let coins = 0, popped = 0, lastSpawn = 0;
  const start = performance.now();
  _aqGameTap = function (e) {
    const p = _aqCanvasPos(e, cvs);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (Math.hypot(bubbles[i].x - p.x, bubbles[i].y - p.y) < bubbles[i].r + 6) {
        coins += bubbles[i].value; popped++; bubbles.splice(i, 1); break;
      }
    }
  };
  cvs.addEventListener('pointerdown', _aqGameTap);
  function frame(t) {
    if (typeof isAquariumView !== 'undefined' && !isAquariumView) { _aqGameEnd(); return; }
    const elapsed = t - start, time = t / 1000, left = Math.max(0, AQUARIUM_BUBBLE_MS - elapsed);
    ctx.clearRect(0, 0, W, H);
    _aqDrawWater(ctx, W, H, time);
    if (t - lastSpawn > 420) {
      lastSpawn = t;
      const speedUp = 1 + elapsed / AQUARIUM_BUBBLE_MS, roll = Math.random();
      let value, color, r;
      if (roll < jackChance) { value = 100; color = '#ffd76a'; r = 18; }
      else if (roll < jackChance + 0.18) { value = 8; color = '#c9b6ff'; r = 13; }
      else { value = 2; color = 'rgba(150,220,255,0.9)'; r = 10; }
      bubbles.push({ x: 24 + Math.random() * (W - 48), y: H + 20, vy: (0.9 + Math.random() * 0.7) * speedUp, r: r, value: value, color: color });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.y -= b.vy * 2; if (b.y < -20) { bubbles.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.globalAlpha = 0.85; ctx.fillStyle = b.color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (b.value >= 100) { ctx.fillStyle = '#7a5a10'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', b.x, b.y + 4); }
    }
    _aqHud(ctx, W, ['🫧 Bubble Pop — ' + (left / 1000).toFixed(1) + 's', '🪙 ' + coins]);
    if (left <= 0) { _aqAward(coins); _aqGameEnd(); _aqResultModal('🫧 Bubble Pop!', 'Popped ' + popped + ' bubbles', coins); return; }
    _aqGameRAF = requestAnimationFrame(frame);
  }
  _aqGameRAF = requestAnimationFrame(frame);
}

/* ── Fish Race & Bet ── */
function startFishRace() {
  if (viewingUid !== currentUid || _aqGame) return;
  if ((roomData.aquariumRaceDay || '') === _aqGameToday()) { showToast('🏁 Fish Race — once a day! Come back tomorrow.', ''); return; }
  const placed = (roomData.aquariumFish || []);
  if (placed.length < 3) { showToast('Need at least 3 fish in your tank to race!', ''); return; }
  const racers = placed.slice(0, 4);
  const odds = raceOdds(FISH_TYPES, racers);
  _aqShowRaceBet(racers, odds);
}
function _aqShowRaceBet(racers, odds) {
  let stake = AQUARIUM_RACE_STAKES[0];
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;background:var(--g-scrim);backdrop-filter:blur(6px)';
  function render() {
    ov.innerHTML =
      '<div class="ws-box">' +
        '<div class="ws-head">🏁 Fish Race</div>' +
        '<div class="ws-sub">Pick a stake, then tap a fish to bet &amp; start.</div>' +
        '<div class="aq-themes" style="margin-bottom:8px">' +
          AQUARIUM_RACE_STAKES.map(s => '<button class="aq-theme-btn' + (s === stake ? ' active' : '') + '" data-stake="' + s + '"' + (roomData.coins < s ? ' disabled' : '') + '>🪙 ' + s + '</button>').join('') +
        '</div>' +
        odds.map((o, i) => '<div class="farm-shop-row"><span class="farm-shop-animal">' + o.name + '</span><span class="farm-shop-drop">x' + o.odds + '</span><button class="farm-shop-buy" data-pick="' + i + '"' + (roomData.coins < stake ? ' disabled' : '') + '>Bet</button></div>').join('') +
        '<button class="cp-close" style="margin-top:8px">Cancel</button>' +
      '</div>';
    ov.querySelectorAll('[data-stake]').forEach(b => b.addEventListener('click', () => { stake = +b.dataset.stake; render(); }));
    ov.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      if (roomData.coins < stake) return;
      ov.remove();
      _aqRunRace(racers, odds, +b.dataset.pick, stake);
    }));
    ov.querySelector('.cp-close').addEventListener('click', () => ov.remove());
  }
  render();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}
function _aqRunRace(racers, odds, pickIdx, stake) {
  roomData.coins = Math.max(0, roomData.coins - stake);
  logCoin(-stake, 'Game stake');
  roomData.aquariumRaceDay = _aqGameToday();
  saveRoom(); if (typeof renderAll === 'function') renderAll();
  const cvs = _aqGameBegin('race'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height, finish = W - 40;
  const lanes = racers.map((name, i) => {
    const f = FISH_TYPES.find(x => x.name === name) || { size: 20, speed: 1 };
    return { type: f, x: 30, y: H * (0.22 + i * 0.18), base: (f.speed || 1), wob: i };
  });
  let winner = -1;
  function frame(t) {
    if (typeof isAquariumView !== 'undefined' && !isAquariumView) { _aqGameEnd(); return; }
    const time = t / 1000;
    ctx.clearRect(0, 0, W, H);
    _aqDrawWater(ctx, W, H, time);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(finish, 0); ctx.lineTo(finish, H); ctx.stroke(); ctx.setLineDash([]);
    lanes.forEach((ln, i) => {
      if (winner < 0) { ln.x += ln.base * (0.8 + Math.random() * 1.6); if (ln.x >= finish) { ln.x = finish; winner = i; } }
      ln.wob += 0.2;
      ctx.save(); ctx.translate(ln.x, ln.y + Math.sin(ln.wob) * 4); drawFish(ctx, ln.type, ln.type.size || 20, { phase: ln.wob }); ctx.restore();
      if (i === pickIdx) { ctx.fillStyle = 'rgba(255,214,106,0.95)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('▼ you', ln.x, ln.y - (ln.type.size || 20)); }
    });
    _aqHud(ctx, W, ['🏁 Fish Race']);
    if (winner >= 0) {
      const won = winner === pickIdx;
      const payout = won ? Math.floor(stake * odds[pickIdx].odds) : 0;
      _aqAward(payout); _aqGameEnd();
      _aqResultModal(won ? '🏆 You won!' : '🐟 ' + odds[winner].name + ' won', won ? 'Your ' + odds[pickIdx].name + ' finished first!' : 'Better luck next time!', won ? payout : -stake);
      return;
    }
    _aqGameRAF = requestAnimationFrame(frame);
  }
  _aqGameRAF = requestAnimationFrame(frame);
}
