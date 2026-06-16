/* ============================================================
   Aquarium view — a fish tank showing the species you unlocked in
   the Fishing game (one fish per species). Mirrors the farm view:
   a ?view=aquarium mode inside room.html with its own canvas RAF
   loop and side panel. Phase A: place/remove fish + completion %
   + badges. (Idle coins, themes, mini-games, social: later phases.)
   ============================================================ */
let isAquariumView = false;
let _aqAnimFrame = null;
let _aquariumStates = {};     // ephemeral swim state per species name (NEVER saved)
let _aquariumCaught = null;   // Set of unlocked species names from Fishing; null = not loaded
let _aqTickInterval = null;   // live idle-coin tick while the aquarium is open

// ── Open / close ──────────────────────────────────────────────
async function openAquarium() {
  isAquariumView = true;
  document.getElementById('aquariumView')?.classList.add('visible');
  _setAquariumPanelMode(true);
  _syncRoomPanel();                 // hide the room side panel; widen the stage
  await _loadAquariumUnlocks();     // refresh which species are unlocked in Fishing
  _openAquariumIdle();              // greet with the collect modal if fish earned coins (owner only)
  renderAquariumPanel();
  drawAquariumCanvas();
  _startAquariumLive();             // keep earning coins while the tank is open
}

function closeAquarium() {
  isAquariumView = false;
  document.getElementById('aquariumView')?.classList.remove('visible');
  _setAquariumPanelMode(false);
  _syncRoomPanel();
  cancelAnimationFrame(_aqAnimFrame);
  _aqAnimFrame = null;
  clearInterval(_aqTickInterval);
  _aqTickInterval = null;
}

// Replace the room tabs + panels with the aquarium panel (mirrors _setFarmPanelMode).
// The `aquarium-mode` class on #panelWrap is the DURABLE hide (CSS beats the
// .tab-panel.active rule by specificity), so a room re-render can't re-show the
// shop/feed tabs; the inline styles are belt-and-suspenders for immediate effect.
function _setAquariumPanelMode(on) {
  const wrap = document.getElementById('panelWrap');
  if (wrap) wrap.classList.toggle('aquarium-mode', on);
  const tabs = document.getElementById('tabsBar');
  if (tabs) tabs.style.display = on ? 'none' : '';
  document.querySelectorAll('#panelWrap .tab-panel').forEach(p => { p.style.display = on ? 'none' : ''; });
  const ap = document.getElementById('aquariumPanel');
  if (ap) ap.style.display = on ? 'block' : 'none';
}

// ── Read unlocked species from the Fishing leaderboard doc ────
async function _loadAquariumUnlocks() {
  _aquariumCaught = new Set();
  if (typeof db === 'undefined' || !currentUid) return;
  try {
    const doc = await db.collection('leaderboard_fishing').doc(currentUid).get();
    if (doc.exists) _aquariumCaught = new Set(doc.data().caughtFishNames || []);
  } catch (e) { /* offline / no fishing data yet → empty set */ }
}

// ── Place / remove (owner only; anti-tamper) ──────────────────
function placeAquariumFish(name) {
  if (viewingUid !== currentUid) return;
  if (!_aquariumCaught || !_aquariumCaught.has(name)) return;   // must be unlocked (never trust the client)
  roomData.aquariumFish = roomData.aquariumFish || [];
  if (roomData.aquariumFish.includes(name)) return;             // one fish per species
  roomData.aquariumFish.push(name);
  saveRoom();
  checkAchievements();
  renderAquariumPanel();
}

function removeAquariumFish(name) {
  if (viewingUid !== currentUid) return;
  roomData.aquariumFish = (roomData.aquariumFish || []).filter(n => n !== name);
  delete _aquariumStates[name];
  saveRoom();
  renderAquariumPanel();
}

// ── Side panel: completion header + per-rarity bars + roster ──
function renderAquariumPanel() {
  const panel = document.getElementById('aquariumPanel');
  if (!panel) return;
  const placed = roomData.aquariumFish || [];
  const caught = _aquariumCaught || new Set();
  const comp = aquariumCompletion(placed, FISH_TYPES);
  const pending = _aquariumPending();

  const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
  const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const bars = RARITY_ORDER.map(r => {
    const t = comp.byRarity[r] || { placed: 0, total: 0 };
    const pct = t.total ? Math.round((t.placed / t.total) * 100) : 0;
    const color = RARITY_COLORS_DOM[r] || 'var(--g-accent)';
    return '<div class="aq-bar-row">' +
      '<span class="aq-bar-label" style="color:' + color + '">' + RARITY_LABEL[r] + ' ' + t.placed + '/' + t.total + '</span>' +
      '<span class="farm-herd-bar"><span style="width:' + pct + '%;background:' + color + '"></span></span>' +
    '</div>';
  }).join('');

  const roster = FISH_TYPES.filter(f => f.rarity !== 'junk').map(f => {
    const isCaught = caught.has(f.name);
    const isPlaced = placed.includes(f.name);
    const cls = 'aq-fish-card' + (isPlaced ? ' placed' : '') + (isCaught ? '' : ' locked');
    const onclick = isCaught
      ? (isPlaced ? 'removeAquariumFish(\'' + f.name + '\')' : 'placeAquariumFish(\'' + f.name + '\')')
      : '';
    return '<div class="' + cls + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' +
      '<canvas class="aq-fish-canvas" width="64" height="44" data-fish="' + f.name + '" data-sil="' + (isCaught ? '0' : '1') + '"></canvas>' +
      '<div class="aq-fish-name">' + (isCaught ? f.name : '???') + '</div>' +
      '<div class="aq-fish-tag">' + (isPlaced ? '✓ in tank' : isCaught ? 'tap to add' : f.rarity) + '</div>' +
    '</div>';
  }).join('');

  panel.innerHTML =
    '<div class="farm-panel-head">🐠 My Aquarium</div>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">Collection <span class="farm-panel-cap">' + comp.placed + '/' + comp.total + ' · ' + comp.pct + '%</span></div>' +
      bars +
      '<div class="farm-panel-empty">🪙 Earning ' + aquariumCoinsPerHour(placed, FISH_TYPES, AQUARIUM_IDLE_RATES) + ' / hr</div>' +
      '<button class="farm-shop-buy" style="width:100%;margin-top:6px" onclick="openAquariumCollect()"' + (pending > 0 ? '' : ' disabled') + '>💰 Collect ' + pending + ' coin' + (pending === 1 ? '' : 's') + '</button>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🐟 Your Fish <span class="farm-panel-cap">tap to place</span></div>' +
      '<div class="aq-roster">' + roster + '</div>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🎮 Mini-Games</div>' +
      '<div class="aq-game-row">' +
        '<button class="farm-shop-buy" style="flex:1" onclick="startFeedingFrenzy()">🍤 Feeding Frenzy</button>' +
        '<button class="aq-info-btn" title="How to play" onclick="showAquariumTutorial(\'frenzy\')">ℹ️</button>' +
      '</div>' +
      '<div class="aq-game-row">' +
        '<button class="farm-shop-buy" style="flex:1" onclick="startFishRace()">🏁 Fish Race &amp; Bet</button>' +
        '<button class="aq-info-btn" title="How to play" onclick="showAquariumTutorial(\'race\')">ℹ️</button>' +
      '</div>' +
      '<div class="aq-game-row">' +
        '<button class="farm-shop-buy" style="flex:1" onclick="startBubblePop()">🫧 Bubble Pop</button>' +
        '<button class="aq-info-btn" title="How to play" onclick="showAquariumTutorial(\'bubble\')">ℹ️</button>' +
      '</div>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🎨 Theme</div>' +
      '<div class="aq-themes">' + AQUARIUM_THEMES.map(t => '<button class="aq-theme-btn' + (t.id === (roomData.aquariumTheme || 'tropical') ? ' active' : '') + '" onclick="setAquariumTheme(\'' + t.id + '\')">' + t.name + '</button>').join('') + '</div>' +
    '</section>' +
    '<button class="farm-visit-home" onclick="closeAquarium()">🏠 Back to room</button>';

  // Draw each roster card's fish (full color, or grey silhouette if not yet unlocked).
  panel.querySelectorAll('.aq-fish-canvas').forEach(cv => {
    const type = FISH_TYPES.find(f => f.name === cv.dataset.fish);
    if (!type) return;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2, cv.height / 2);
    drawFish(c, type, 18, { silhouette: cv.dataset.sil === '1' });
    c.restore();
  });
}

// ── Tank canvas (water scene + swimming fish) ─────────────────
function drawAquariumCanvas() {
  cancelAnimationFrame(_aqAnimFrame);
  const view = document.getElementById('aquariumView');
  const cvs = document.getElementById('aquariumCanvas');
  if (!view || !cvs) return;
  const ctx = cvs.getContext('2d');
  let W = view.clientWidth, H = view.clientHeight;
  cvs.width = W; cvs.height = H;
  let lastFrame = 0;

  function frame(t) {
    if (!isAquariumView) return;                      // stop when the view closes
    if (t - lastFrame < 42) { _aqAnimFrame = requestAnimationFrame(frame); return; }
    lastFrame = t;
    const nw = view.clientWidth, nh = view.clientHeight;
    if (nw && nh && (nw !== W || nh !== H)) { W = nw; H = nh; cvs.width = W; cvs.height = H; }
    const time = t / 1000;
    ctx.clearRect(0, 0, W, H);

    // Water background — tinted by the chosen theme preset.
    const theme = (typeof AQUARIUM_THEMES !== 'undefined' && AQUARIUM_THEMES.find(tt => tt.id === (roomData.aquariumTheme || 'tropical'))) || { grad: ['#1a3a5c', '#15406a', '#0a1e38'], caustic: '100,200,255' };
    const water = ctx.createLinearGradient(0, 0, 0, H);
    water.addColorStop(0, theme.grad[0]); water.addColorStop(0.3, theme.grad[1]); water.addColorStop(1, theme.grad[2]);
    ctx.fillStyle = water; ctx.fillRect(0, 0, W, H);

    // Caustic light shimmer.
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 8; i++) {
      const cx = (Math.sin(time * 0.3 + i * 1.7) * 0.5 + 0.5) * W;
      const cy = (Math.cos(time * 0.2 + i * 2.3) * 0.5 + 0.5) * H;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
      g.addColorStop(0, 'rgba(' + theme.caustic + ',1)'); g.addColorStop(1, 'rgba(' + theme.caustic + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;

    // Surface shimmer along the top.
    ctx.fillStyle = 'rgba(100,180,255,0.08)';
    for (let x = 0; x < W; x += 3) {
      const wave = 3 + Math.sin(x * 0.05 + time * 2) * 3 + Math.sin(x * 0.02 + time * 1.3) * 2;
      ctx.fillRect(x, 0, 2, wave);
    }

    // One fish per placed species, swimming and bouncing off the side walls.
    const placed = roomData.aquariumFish || [];
    _syncAquariumStates(placed, W, H);
    for (const name of placed) {
      const type = FISH_TYPES.find(f => f.name === name);
      const st = _aquariumStates[name];
      if (!type || !st) continue;
      st.x += st.speed * st.dir;
      st.wobble += 0.05;
      if (st.x < type.size)     { st.x = type.size;     st.dir = 1; }
      if (st.x > W - type.size) { st.x = W - type.size; st.dir = -1; }
      const y = st.y + Math.sin(st.wobble) * 6;
      ctx.save();
      ctx.translate(st.x, y);
      ctx.scale(st.dir, 1);                            // face swim direction
      drawFish(ctx, type, type.size, { phase: st.wobble });
      ctx.restore();
    }

    _aqAnimFrame = requestAnimationFrame(frame);
  }
  _aqAnimFrame = requestAnimationFrame(frame);
}

// Create swim state for newly placed fish; drop state for removed ones.
function _syncAquariumStates(placed, W, H) {
  placed.forEach((name, i) => {
    if (!_aquariumStates[name]) {
      const fromLeft = (i % 2) === 0;
      _aquariumStates[name] = {
        x: fromLeft ? W * 0.2 : W * 0.8,
        y: H * (0.25 + 0.5 * ((i % 5) / 5)),
        dir: fromLeft ? 1 : -1,
        speed: 0.6 + (i % 3) * 0.25,
        wobble: i,
      };
    }
  });
  for (const name in _aquariumStates) if (!placed.includes(name)) delete _aquariumStates[name];
}

// ── Idle coins — accrue continuously from the aquariumLastCollect anchor;
//    the owner always collects through a modal that shows the exact amount
//    (no silent banking). Capped at 3h while away.
function _aquariumPending() {
  const now = Date.now();
  const last = roomData.aquariumLastCollect || now;
  return aquariumIdleCoins(roomData.aquariumFish, FISH_TYPES, now - last, AQUARIUM_OFFLINE_CAP_MS, AQUARIUM_IDLE_RATES);
}

// On opening the tank: if the fish earned anything, greet the owner with the
// collect modal so they always see how much (any amount, not just after 1h).
function _openAquariumIdle() {
  if (viewingUid !== currentUid) return;
  if (!roomData.aquariumLastCollect) { roomData.aquariumLastCollect = Date.now(); saveRoom(); return; }
  const earned = _aquariumPending();
  if (earned > 0) _showAquariumCollect(earned);
}

// Panel "Collect" button → pop the modal, or a gentle hint when nothing's ready.
function openAquariumCollect() {
  if (viewingUid !== currentUid) return;
  const earned = _aquariumPending();
  if (earned <= 0) { showToast('No coins yet — your fish are still working! 🐠', ''); return; }
  _showAquariumCollect(earned);
}

// The collect modal — tells the user exactly how much, then banks it and
// resets the earning clock. Used both on open and from the Collect button.
function _showAquariumCollect(earned) {
  if (document.getElementById('aqCollectModal')) return;
  const ov = document.createElement('div');
  ov.id = 'aqCollectModal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;background:var(--g-scrim);backdrop-filter:blur(6px)';
  ov.innerHTML =
    '<div class="ws-box">' +
      '<div class="ws-head">🐠 Fish Earnings</div>' +
      '<div class="ws-sub">Your fish have been busy! Here\'s what they earned:</div>' +
      '<div class="ws-slot"><span class="ws-slot-no">🪙 Coins earned</span><span class="ws-slot-state">+' + earned + '</span></div>' +
      '<button class="cp-crop" style="justify-content:center;font-weight:800">📦 Collect ' + earned + '</button>' +
    '</div>';
  const done = function () {
    roomData.coins += earned;
    roomData.aquariumLastCollect = Date.now();
    saveRoom();
    if (typeof renderAll === 'function') renderAll();
    renderAquariumPanel();
    ov.remove();
  };
  ov.querySelector('.cp-crop').addEventListener('click', done);
  ov.addEventListener('click', function (e) { if (e.target === ov) done(); });
  document.body.appendChild(ov);
}

// Live refresh: keep the "Collect N" button count climbing while the tank is
// open (no silent banking — collecting always goes through the modal).
function _startAquariumLive() {
  clearInterval(_aqTickInterval);
  if (viewingUid !== currentUid) return;
  _aqTickInterval = setInterval(function () {
    if (document.hidden || !isAquariumView) return;
    renderAquariumPanel();
  }, 30 * 1000);
}

// Switch the tank's water-tint theme (owner only).
function setAquariumTheme(id) {
  if (viewingUid !== currentUid) return;
  roomData.aquariumTheme = id;
  saveRoom();
  renderAquariumPanel();
}
