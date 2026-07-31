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
let _aqLikedUids = new Set(); // tanks liked this session (per-visit dedupe; client-side)
let _aqParticles = [];        // floating ❤️ like hearts on the tank canvas
let _aqVisitRooms = null;     // cached "other aquariums" list (null = loading)
let _aqVisitUnsub = null;     // live subscription to the rooms list (while open)

// ── Open / close ──────────────────────────────────────────────
async function openAquarium() {
  isAquariumView = true;
  document.getElementById('aquariumView')?.classList.add('visible');
  _setAquariumPanelMode(true);
  _syncRoomPanel();                 // hide the room side panel; widen the stage
  if (viewingUid === currentUid) {
    await _loadAquariumUnlocks();   // refresh which species are unlocked in Fishing
    _openAquariumIdle();            // greet with the collect modal if fish earned coins
    renderAquariumPanel();
    drawAquariumCanvas();
    _startAquariumLive();           // keep earning coins while the tank is open
  } else {
    // Visiting someone else's tank — read-only, no unlocks/idle/live tick.
    clearInterval(_aqTickInterval); _aqTickInterval = null;
    renderAquariumPanel();
    drawAquariumCanvas();           // shows the visited tank (aquariumFish loaded by visitRoom)
  }
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
  _unsubAqVisitList();
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

  // ── Visiting someone else's tank — read-only summary + ❤️ Like ──
  if (viewingUid !== currentUid) {
    const vplaced = roomData.aquariumFish || [];
    const vcomp = aquariumCompletion(vplaced, FISH_TYPES);
    const vtheme = AQUARIUM_THEMES.find(t => t.id === (roomData.aquariumTheme || 'tropical'));
    const liked = _aqLikedUids.has(viewingUid);
    panel.innerHTML =
      '<div class="farm-panel-head">🐠 ' + T("{name}'s Aquarium", { name: escapeHtml(roomData.displayName || T('Their')) }) + ' <span class="farm-panel-cap">❤️ ' + (roomData.aquariumLikes || 0) + '</span></div>' +
      '<section class="farm-card">' +
        '<div class="farm-section-title">' + T('Tank') + ' <span class="farm-panel-cap">' + T('{n} fish · {pct}%', { n: vplaced.length, pct: vcomp.pct }) + '</span></div>' +
        '<div class="farm-panel-empty">🎨 ' + T((vtheme || AQUARIUM_THEMES[0]).name) + ' · 🪙 ' + T('{n} / hr', { n: Math.floor(aquariumCoinsPerHour(vplaced, FISH_TYPES, AQUARIUM_IDLE_RATES, aquariumMult())) }) + '</div>' +
        '<div class="farm-panel-empty">' + _aqEquipLine() + '</div>' +
      '</section>' +
      '<button class="farm-shop-buy" style="width:100%;padding:9px" onclick="likeAquarium()"' + (liked ? ' disabled' : '') + '>❤️ ' + (liked ? T('Liked!') : T('Like this tank')) + '</button>' +
      '<button class="farm-visit-home" onclick="visitAquarium(\'' + currentUid + '\')">🏠 ' + T('Back to my aquarium') + '</button>';
    return;
  }

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
      '<span class="aq-bar-label" style="color:' + color + '">' + T(RARITY_LABEL[r]) + ' ' + t.placed + '/' + t.total + '</span>' +
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
      '<div class="aq-fish-name">' + (isCaught ? T(f.name) : '???') + '</div>' +
      '<div class="aq-fish-tag">' + (isPlaced ? '✓ ' + T('in tank') : isCaught ? T('tap to add') : T(RARITY_LABEL[f.rarity] || f.rarity)) + '</div>' +
    '</div>';
  }).join('');

  panel.innerHTML =
    '<div class="farm-panel-head">🐠 ' + T('My Aquarium') + ' <span class="farm-panel-cap">❤️ ' + (roomData.aquariumLikes || 0) + '</span></div>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">' + T('Collection') + ' <span class="farm-panel-cap">' + comp.placed + '/' + comp.total + ' · ' + comp.pct + '%</span></div>' +
      bars +
      '<div class="farm-panel-empty">🪙 ' + T('Earning {n} / hr', { n: Math.floor(aquariumCoinsPerHour(placed, FISH_TYPES, AQUARIUM_IDLE_RATES, aquariumMult())) }) +
        ' · ' + T('banks {n}h', { n: Math.round(aquariumCapMs() / 3600000) }) + '</div>' +
      '<div class="farm-panel-empty">' + _aqEquipLine() + '</div>' +
      '<button class="farm-shop-buy" style="width:100%;margin-top:6px" onclick="openAquariumCollect()"' + (pending > 0 ? '' : ' disabled') + '>💰 ' + I18N.plural(pending, 'Collect 1 coin', 'Collect {n} coins') + '</button>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🐟 ' + T('Your Fish') + ' <span class="farm-panel-cap">' + T('tap to place') + '</span></div>' +
      '<div class="aq-roster">' + roster + '</div>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🎮 ' + T('Mini-Games') + '</div>' +
      '<div class="aq-game-row">' +
        '<button class="farm-shop-buy" style="flex:1" onclick="startFeedingFrenzy()">🍤 ' + T('Feeding Frenzy') + '</button>' +
        '<button class="aq-info-btn" title="' + T('How to play') + '" onclick="showAquariumTutorial(\'frenzy\')">ℹ️</button>' +
      '</div>' +
      '<div class="aq-game-row">' +
        '<button class="farm-shop-buy" style="flex:1" onclick="startFishRace()">🏁 ' + T('Fish Race & Bet') + _aqLeftTag('race') + '</button>' +
        '<button class="aq-info-btn" title="' + T('How to play') + '" onclick="showAquariumTutorial(\'race\')">ℹ️</button>' +
      '</div>' +
      '<div class="aq-game-row">' +
        '<button class="farm-shop-buy" style="flex:1" onclick="startBubblePop()">🫧 ' + T('Bubble Pop') + _aqLeftTag('bubble') + '</button>' +
        '<button class="aq-info-btn" title="' + T('How to play') + '" onclick="showAquariumTutorial(\'bubble\')">ℹ️</button>' +
      '</div>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🎨 ' + T('Theme') + '</div>' +
      '<div class="aq-themes">' + AQUARIUM_THEMES.map(t => '<button class="aq-theme-btn' + (t.id === (roomData.aquariumTheme || 'tropical') ? ' active' : '') + '" onclick="setAquariumTheme(\'' + t.id + '\')">' + T(t.name) + '</button>').join('') + '</div>' +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🐠 ' + T('Visit Other Aquariums') + ' <span class="farm-panel-cap">' + T('live') + '</span></div>' +
      _aqVisitListHtml() +
    '</section>' +
    '<button class="farm-visit-home" onclick="closeAquarium()">🏠 ' + T('Back to room') + '</button>';

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

  // Tapping a device opens its box. Wired once and left on: drawAquariumCanvas
  // runs again on every re-open, and a listener per open would stack up and fire
  // the same tap three times. _aqTankTap is what decides whether the tap is ours
  // at all — a running mini-game and a visited tank both answer null.
  if (!cvs._aqEquipWired) {
    cvs._aqEquipWired = true;
    cvs.addEventListener('pointerdown', function (e) {
      const p = _aqCanvasPos(e, cvs);
      const id = _aqTankTap(p.x, p.y, cvs.width, cvs.height);
      if (id) openAquariumEquip(id);
    });
  }

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

    // Caustic light shimmer — the light bar brightens it, which is the whole
    // tank's share of the upgrade rather than a lamp-shaped highlight.
    ctx.globalAlpha = 0.06 * aquariumMult();
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

    // Equipment before the fish, so a fish can swim in front of the filter.
    _drawAqEquip(ctx, W, H, time);

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

    // ❤️ like hearts (spawned by likeAquarium) float up and fade
    if (_aqParticles.length) {
      _aqParticles = _aqParticles.filter(function (p) { return t - p.born < p.life; });
      ctx.textAlign = 'center';
      for (const p of _aqParticles) {
        ctx.globalAlpha = Math.max(0, 1 - (t - p.born) / p.life);
        ctx.font = '28px serif';
        ctx.fillText(p.text, p.x * W, (p.y + p.vy * (t - p.born)) * H);
      }
      ctx.globalAlpha = 1;
    }

    _aqAnimFrame = requestAnimationFrame(frame);
  }
  _aqAnimFrame = requestAnimationFrame(frame);
}

/* ── Drawing the three devices ──────────────────────────────────
   Each one shows its own level in its behaviour rather than in a number: the
   light washes further down the water, the filter pushes a wider outflow, the
   pump sends up a denser column. That is the whole reason they are drawn in the
   tank instead of listed in the panel — a visitor can see what you bought.

   Unbought is drawn dim with the keyhole dot the farm's locked buildings use. */
function _aqRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The "not bought yet" cue: a small keyhole, same shape the farm uses.
function _aqKeyhole(ctx, cx, cy, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.15, s * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, cy + s * 0.42);
  ctx.lineTo(cx + s * 0.18, cy + s * 0.42);
  ctx.lineTo(cx + s * 0.10, cy - s * 0.02);
  ctx.lineTo(cx - s * 0.10, cy - s * 0.02);
  ctx.closePath(); ctx.fill();
}

function _drawAqEquip(ctx, W, H, time) {
  const rects = {};
  _aqEquipRects(W, H).forEach(function (r) { rects[r.id] = r; });
  const own = viewingUid === currentUid;

  // ── 💡 Light bar, hanging under the rim ──
  const L = aquariumEquipLevel('light'), lr = rects.light;
  const barH = Math.max(5, H * 0.013), barY = Math.min(lr.y + lr.h * 0.28, 20);
  ctx.save();
  if (L) {
    // A wash of warm light falling into the water, reaching further per level.
    const reach = H * (0.16 + L * 0.06);
    const g = ctx.createLinearGradient(0, barY, 0, barY + reach);
    g.addColorStop(0, 'rgba(255,240,196,' + (0.07 + L * 0.035).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,240,196,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lr.x, barY, lr.w, reach);
  }
  ctx.globalAlpha = L ? 1 : 0.5;
  ctx.fillStyle = '#33404f';
  _aqRoundRect(ctx, lr.x, barY, lr.w, barH, barH / 2); ctx.fill();
  if (L) {
    ctx.fillStyle = 'rgba(255,247,214,' + (0.55 + L * 0.15).toFixed(3) + ')';
    _aqRoundRect(ctx, lr.x + 3, barY + 1.2, lr.w - 6, barH - 2.4, (barH - 2.4) / 2); ctx.fill();
  }
  ctx.restore();
  if (!L && own) _aqKeyhole(ctx, lr.x + lr.w / 2, barY + barH + 11, 13);

  // ── 🫙 Filter, clamped to the right wall ──
  const F = aquariumEquipLevel('filter'), fr = rects.filter;
  const fx = fr.x + fr.w * 0.30, fy = fr.y + fr.h * 0.18;
  const fw = fr.w * 0.62, fh = fr.h * 0.52;
  ctx.save();
  ctx.globalAlpha = F ? 1 : 0.5;
  ctx.fillStyle = '#2f3d4c';
  _aqRoundRect(ctx, fx, fy, fw, fh, Math.min(6, fw * 0.2)); ctx.fill();
  ctx.fillStyle = '#46586b';                                  // grille
  for (let i = 0; i < 3; i++) ctx.fillRect(fx + fw * 0.18, fy + fh * (0.22 + i * 0.22), fw * 0.64, Math.max(1.5, fh * 0.06));
  // intake pipe down the wall
  ctx.strokeStyle = '#2f3d4c'; ctx.lineWidth = Math.max(2, fw * 0.16);
  ctx.beginPath(); ctx.moveTo(fx + fw * 0.5, fy + fh); ctx.lineTo(fx + fw * 0.5, fr.y + fr.h); ctx.stroke();
  ctx.restore();
  if (F) {
    // Outflow: streaks pushed left off the mouth, longer and more of them per level.
    ctx.save();
    ctx.strokeStyle = 'rgba(190,225,255,0.5)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (let i = 0; i < 2 + F; i++) {
      const yy = fy + fh * (0.24 + i * 0.2), len = fw * (0.7 + F * 0.45);
      const drift = (time * 26 + i * 19) % (len + 14);
      ctx.globalAlpha = 0.55 * (1 - drift / (len + 14));
      ctx.beginPath();
      ctx.moveTo(fx - drift, yy);
      ctx.lineTo(fx - drift - len * 0.35, yy + Math.sin(time * 2 + i) * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (own) {
    _aqKeyhole(ctx, fx + fw / 2, fy + fh / 2, 13);
  }

  // ── 🔋 Pump, sitting on the floor ──
  const P = aquariumEquipLevel('pump'), pr = rects.pump;
  const pw = pr.w * 0.52, ph = pr.h * 0.34;
  const px = pr.x + pr.w * 0.24, py = pr.y + pr.h - ph - 2;
  ctx.save();
  ctx.globalAlpha = P ? 1 : 0.5;
  ctx.fillStyle = '#33404f';
  _aqRoundRect(ctx, px, py, pw, ph, Math.min(5, ph * 0.35)); ctx.fill();
  ctx.fillStyle = '#5a7086';
  ctx.fillRect(px + pw * 0.2, py + ph * 0.3, pw * 0.6, Math.max(1.5, ph * 0.18));
  ctx.restore();
  if (P) {
    // The column: a fixed set of bubbles cycling up, denser per level. Derived
    // from the clock, so there is no particle list to keep or to replay after a
    // tab has been asleep.
    const n = 4 + P * 4, rise = pr.y - H * 0.06;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const k = ((time * 0.34 + i / n) % 1);
      const by = py - k * (py - rise);
      const bx = px + pw / 2 + Math.sin(time * 2.2 + i * 1.7) * pw * 0.42;
      const br = Math.max(1.2, pw * (0.07 + 0.05 * (1 - k)));
      ctx.globalAlpha = 0.5 * (1 - k * 0.75);
      ctx.fillStyle = 'rgba(210,238,255,1)';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } else if (own) {
    _aqKeyhole(ctx, px + pw / 2, py - 12, 13);
  }
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
/* ── Equipment: filter, light, pump ────────────────────────────
   Three levelled devices standing in the tank. Everything here reads roomData,
   which means it is correct on a VISITED tank too — visitRoom mirrors the host's
   levels, so a visitor's readouts describe the water they are looking at rather
   than their own. Only buyAquariumEquip is owner-gated. */
function _aqEquipDef(id) {
  for (const e of AQUARIUM_EQUIP) if (e.id === id) return e;
  return null;
}
function aquariumEquipLevel(id) {
  const def = _aqEquipDef(id);
  if (!def) return 0;
  return Math.max(0, Math.min(AQUARIUM_EQUIP_MAX, Math.floor(roomData[def.field] || 0)));
}
// The two numbers the idle maths needs: how long the tank banks for, and what a
// placed fish is worth while it does.
function aquariumCapMs() { return aquariumLevelValue(aquariumEquipLevel('filter'), AQUARIUM_FILTER_CAPS_MS); }
function aquariumMult()  { return aquariumLevelValue(aquariumEquipLevel('light'), AQUARIUM_LIGHT_MULT); }

// Plays of a capped game ('bubble' | 'race') still going today. The stored count
// is normalised on load, so this only has to guard the day rolling over.
function aquariumPlaysLeft(kind) {
  const isRace = kind === 'race';
  const used = aquariumPlaysUsed(
    roomData[isRace ? 'aquariumRaceDay' : 'aquariumBubbleDay'] || '',
    _aqGameToday(),
    roomData[isRace ? 'aquariumRaceN' : 'aquariumBubbleN']);
  return Math.max(0, aquariumPlaysPerDay(roomData.aquariumPump) - used);
}

// Cost of the NEXT level, or null when the device is maxed.
function aquariumEquipCost(id) {
  const def = _aqEquipDef(id);
  if (!def) return null;
  const next = aquariumEquipLevel(id) + 1;
  return next > AQUARIUM_EQUIP_MAX ? null : def.costs[next];
}

/* What a level of a device is worth, in words. One function so the buy box, the
   toast and the tooltip can never drift from each other — or from the tables. */
function aquariumEquipEffect(id, level) {
  const lvl = Math.max(0, Math.min(AQUARIUM_EQUIP_MAX, level));
  if (id === 'filter') return T('Banks {n}h while you are away', { n: Math.round(aquariumLevelValue(lvl, AQUARIUM_FILTER_CAPS_MS) / 3600000) });
  if (id === 'light') return T('Fish earn ×{n}', { n: aquariumLevelValue(lvl, AQUARIUM_LIGHT_MULT) });
  return I18N.plural(aquariumPlaysPerDay(lvl), '1 play a day of 🫧 and 🏁', '{n} plays a day of 🫧 and 🏁');
}

/* ── Where the devices stand, and what a tap on the glass means ──
   Rects over the art in REAL pixels, each at least a thumb across even where the
   art is a thin strip — the light is a bar a few pixels tall and would otherwise
   be unhittable on a phone. They never overlap at any tank size, so "which one
   did I tap" is never decided by iteration order.

   The tank canvas had no pointer handling at all before this; the only listener
   was the one a mini-game attaches for the length of a round. */
const AQ_MIN_TOUCH = 44;

function _aqEquipRects(W, H) {
  const fw = Math.max(AQ_MIN_TOUCH, W * 0.13);
  const pumpH = Math.max(AQ_MIN_TOUCH, H * 0.14);
  return [
    { id: 'light',  x: W * 0.10,    y: 0,                 w: W * 0.80, h: Math.max(AQ_MIN_TOUCH, H * 0.10) },
    { id: 'filter', x: W - fw - 6,  y: H * 0.30,          w: fw,       h: Math.max(AQ_MIN_TOUCH, H * 0.20) },
    { id: 'pump',   x: 6,           y: H - pumpH - 6,     w: fw,       h: pumpH },
  ];
}

// Nearest centre wins among the rects containing the point — not a priority
// order, which would quietly decide overlaps for us if a future layout ever
// created one.
function _aqEquipAt(px, py, W, H) {
  let best = null, bestD = Infinity;
  for (const r of _aqEquipRects(W, H)) {
    if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
    const dx = px - (r.x + r.w / 2), dy = py - (r.y + r.h / 2);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = r.id; }
  }
  return best;
}

// What a tap on the glass opens, or null. While a round is running the canvas
// belongs to the game — its listener is reading the same taps, and opening a
// shop mid-round would cost the player both the tap and the round.
function _aqTankTap(px, py, W, H) {
  if (typeof _aqGame !== 'undefined' && _aqGame) return null;
  if (viewingUid !== currentUid) return null;
  return _aqEquipAt(px, py, W, H);
}

/* The buy box. One box serves all three devices — they differ only in what the
   next level buys and what it costs, so three near-identical modals would be
   three places for the numbers to drift. Tapping the device opens it; a visitor
   tapping one gets nothing, the way every other owner action behaves. */
function closeAquariumEquip() {
  const ov = document.getElementById('aqEquipModal');
  if (ov) ov.remove();
}

function openAquariumEquip(id) {
  if (viewingUid !== currentUid) return;
  const def = _aqEquipDef(id);
  if (!def) return;
  closeAquariumEquip();
  const lvl = aquariumEquipLevel(id), cost = aquariumEquipCost(id);
  const ov = document.createElement('div');
  ov.id = 'aqEquipModal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;background:var(--g-scrim);backdrop-filter:blur(6px)';
  // Every level listed, not just the next one: the ladder is the reason to buy
  // the cheap one now, and hiding it makes each step look like the last.
  let rows = '';
  for (let i = 1; i <= AQUARIUM_EQUIP_MAX; i++) {
    const state = i <= lvl ? '✓' : (i === lvl + 1 ? '🪙 ' + def.costs[i] : '🔒');
    rows += '<div class="ws-slot' + (i <= lvl ? ' done' : '') + '">' +
      '<span class="ws-slot-no">Lv.' + i + ' · ' + aquariumEquipEffect(id, i) + '</span>' +
      '<span class="ws-slot-state">' + state + '</span></div>';
  }
  ov.innerHTML =
    '<div class="ws-box">' +
      '<div class="ws-head">' + def.emoji + ' ' + T(def.name) +
        (lvl ? ' <span class="farm-panel-cap">Lv.' + lvl + '</span>' : '') + '</div>' +
      '<div class="ws-sub">' + T(def.blurb) + '</div>' +
      rows +
      (cost == null
        ? '<button class="farm-shop-buy" style="width:100%;margin-top:8px" disabled>' + T('Fully upgraded!') + '</button>'
        : '<button class="farm-shop-buy" style="width:100%;margin-top:8px" onclick="buyAquariumEquip(\'' + id + '\')"' +
          (roomData.coins < cost ? ' disabled' : '') + '>' +
          T('Upgrade · {cost}', { cost: '🪙 ' + cost }) + '</button>') +
      '<button class="farm-visit-home" onclick="closeAquariumEquip()">' + T('Close') + '</button>' +
    '</div>';
  ov.addEventListener('click', function (e) { if (e.target === ov) closeAquariumEquip(); });
  document.body.appendChild(ov);
}

/* "2 left" beside a capped game. Only shown once the pump has bought a second
   play: with one a day the count is noise, and the button already says so when
   you tap it. */
function _aqLeftTag(kind) {
  if (aquariumPlaysPerDay(roomData.aquariumPump) < 2) return '';
  return ' <span class="farm-panel-cap">' + T('{n} left', { n: aquariumPlaysLeft(kind) }) + '</span>';
}

/* One line of equipment, for the panel. Not a shop row — the devices in the tank
   are the shop. This exists because a device you have not bought is a dim shape
   in the water, and a player who never taps it would never learn it is there. */
function _aqEquipLine() {
  return AQUARIUM_EQUIP.map(function (e) {
    const lvl = aquariumEquipLevel(e.id);
    return e.emoji + (lvl ? ' Lv.' + lvl : '<span style="opacity:.45">·</span>');
  }).join('  ') + (viewingUid === currentUid ? '  <span style="opacity:.6">' + T('tap them in the tank') + '</span>' : '');
}

async function buyAquariumEquip(id) {
  if (viewingUid !== currentUid) return false;
  const def = _aqEquipDef(id);
  if (!def) return false;
  const cost = aquariumEquipCost(id);
  if (cost == null) { showToast(def.emoji + ' ' + T('Fully upgraded!'), ''); return false; }
  if (roomData.coins < cost) { showToast(T('Not enough coins!'), 'error'); return false; }
  roomData.coins -= cost;
  logCoin(-cost, T(def.name));
  const lvl = aquariumEquipLevel(id) + 1;
  roomData[def.field] = lvl;
  closeAquariumEquip();
  await saveRoom();
  showToast(def.emoji + ' ' + T(def.name) + ' Lv.' + lvl + ' — ' + aquariumEquipEffect(id, lvl), 'success');
  renderAquariumPanel();
  return true;
}

function _aquariumPending() {
  const now = Date.now();
  const last = roomData.aquariumLastCollect || now;
  return aquariumIdleCoins(roomData.aquariumFish, FISH_TYPES, now - last,
    aquariumCapMs(), AQUARIUM_IDLE_RATES, aquariumMult());
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
  if (earned <= 0) { showToast(T('No coins yet — your fish are still working!') + ' 🐠', ''); return; }
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
      '<div class="ws-head">🐠 ' + T('Fish Earnings') + '</div>' +
      '<div class="ws-sub">' + T("Your fish have been busy! Here's what they earned:") + '</div>' +
      '<div class="ws-slot"><span class="ws-slot-no">🪙 ' + T('Coins earned') + '</span><span class="ws-slot-state">+' + earned + '</span></div>' +
      '<button class="cp-crop" style="justify-content:center;font-weight:800">📦 ' + T('Collect {n}', { n: earned }) + '</button>' +
    '</div>';
  const done = function () {
    roomData.coins += earned;
    logCoin(earned, T('Aquarium') + ' 🐟');
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

// ── Visiting other players' tanks + ❤️ Like ──────────────────
async function visitAquarium(uid) {
  if (typeof visitRoom !== 'function') return;
  await visitRoom(uid);            // loads their room + aquarium data, sets viewingUid
  openAquarium();                  // re-opens the tank (visitor mode unless it's your own)
}

function likeAquarium() {
  if (viewingUid === currentUid) return;                              // can't like your own tank
  if (_aqLikedUids.has(viewingUid)) { showToast(T('You already liked this tank!'), ''); return; }
  _aqLikedUids.add(viewingUid);                                       // per-session dedupe (client-side)
  roomData.aquariumLikes = (roomData.aquariumLikes || 0) + 1;         // optimistic local bump
  userDocRef(viewingUid).update({ aquariumLikes: firebase.firestore.FieldValue.increment(1) }).catch(function () {});
  _aqParticles.push({ text: '❤️', x: 0.2 + Math.random() * 0.6, y: 0.8, vy: -0.0013, life: 1600, born: performance.now() });
  showToast('❤️ ' + T("You liked {name}'s aquarium!", { name: roomData.displayName || T('this') }), 'success');
  renderAquariumPanel();
}

// Live "other aquariums" list (same rooms query the farm visit list uses).
function _subAqVisitList() {
  if (_aqVisitUnsub || typeof db === 'undefined') return;
  try {
    _aqVisitUnsub = db.collection('rooms').orderBy('updatedAt', 'desc').limit(20).onSnapshot(function (snap) {
      const rooms = [], now = Date.now();
      snap.forEach(function (doc) {
        if (doc.id === currentUid) return;                            // never list myself
        const d = doc.data();
        rooms.push({ uid: doc.id, name: d.displayName, fish: (d.aquariumFish || []).length, likes: d.aquariumLikes || 0, online: !!(d.lastSeen && (now - d.lastSeen) < 60000) });
      });
      rooms.sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0); });
      _aqVisitRooms = rooms;
      if (isAquariumView && viewingUid === currentUid) renderAquariumPanel();
    }, function () {});
  } catch (e) {}
}
function _unsubAqVisitList() {
  if (_aqVisitUnsub) { _aqVisitUnsub(); _aqVisitUnsub = null; }       // keep _aqVisitRooms cache
}
function _aqVisitListHtml() {
  _subAqVisitList();
  if (_aqVisitRooms == null) return '<div class="farm-panel-empty">' + T('Loading aquariums…') + '</div>';
  if (!_aqVisitRooms.length) return '<div class="farm-panel-empty">' + T('No other aquariums to visit yet.') + '</div>';
  return _aqVisitRooms.map(function (r) {
    const peek = r.fish ? '🐠 ×' + r.fish : '<span style="opacity:.5">' + T('empty tank') + '</span>';
    return '<div class="farm-visit-row" onclick="visitAquarium(\'' + r.uid + '\')">' +
      '<span class="farm-visit-emoji">🐠</span>' +
      '<span class="farm-visit-info">' +
        '<span class="farm-visit-name">' + (r.online ? '🟢 ' : '') + escapeHtml(r.name || T('Anonymous')) + '</span>' +
        '<span class="farm-visit-peek">' + peek + ' · ❤️ ' + r.likes + '</span>' +
      '</span>' +
      '<span class="farm-visit-go">›</span>' +
    '</div>';
  }).join('');
}
