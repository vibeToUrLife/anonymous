/* ════════════════════════════════════════════════════════════════
   world-core.js — the World bootstrap + game loop. Inits its own Firebase
   app (room-base.js, which normally does this, is intentionally NOT loaded on
   this page), waits for the persisted Google auth session, wires every
   subsystem (input, net, actors, chat, outfit), runs the RAF loop, and owns
   scene switching + the pet/outfit pickers + the report/block/play menu.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Firebase bootstrap (this page boots its own app) ──
  try { if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig); }
  catch (e) { console.error('[world] Firebase init failed', e); }
  const wAuth = firebase.auth();
  const wDb = firebase.firestore();

  // ── DOM ──
  const canvas = document.getElementById('worldCanvas');
  const stage = document.getElementById('worldStage');
  const tagLayer = document.getElementById('worldTagLayer');
  if (!canvas || !stage) { console.error('[world] missing canvas/stage'); return; }
  const ctx = canvas.getContext('2d');

  // ── State ──
  const params = new URLSearchParams(location.search);
  const wanted = params.get('scene');
  const startScene = (wanted && WORLD_SCENES.some(s => s.id === wanted)) ? wanted : WORLD_SCENES[0].id;
  const me = {
    uid: null, name: 'Anonymous', pet: 'cat', color: null, outfit: null,
    x: 0.5, y: 0.75, facing: 1, action: null, actionTs: 0, moving: false, scene: startScene,
  };
  let sceneObj = worldSceneById(startScene);
  let running = false, lastT = 0;

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function el(id) { return document.getElementById(id); }
  // Hide-timer lives ON the element: WorldChat's flash() shares #worldChatHint,
  // and two independent timers let a stale one cut a fresh toast short.
  function flashHint(msg) {
    const h = el('worldChatHint'); if (!h || !msg) return;
    h.textContent = msg; h.classList.add('show');
    clearTimeout(h._hideT); h._hideT = setTimeout(() => h.classList.remove('show'), 2200);
  }

  // Live sync status chip — also the multiplayer diagnostic. Shows connection
  // state + how many pets are in this shard, or a clear error if the Realtime
  // Database can't be reached (wrong databaseURL) or writes are denied (rules
  // not deployed). Without this, sync failures are invisible.
  let diagConn = false, diagErr = null;
  function onDiag(d) {
    if (!d) return;
    if (d.type === 'conn') diagConn = d.connected;
    else if (d.type === 'error') diagErr = d.message || 'sync error';
    const chip = el('worldStatus'); if (!chip) return;
    const here = 1 + Object.keys(WorldNet.getRemotes()).length;
    if (diagErr) { chip.textContent = '⚠️ can’t sync: ' + diagErr; chip.className = 'world-status err'; }
    else if (!diagConn) { chip.textContent = '🔴 connecting to server…'; chip.className = 'world-status warn'; }
    else { chip.textContent = '🟢 ' + here + ' pet' + (here === 1 ? '' : 's') + ' here'; chip.className = 'world-status ok'; }
  }

  function worldPlayerName(uid) {
    const custom = uid ? localStorage.getItem('flappy_custom_name_' + uid) : null;
    if (custom) return custom;
    if (wAuth.currentUser && wAuth.currentUser.displayName) return wAuth.currentUser.displayName;
    return localStorage.getItem('flappy_name') || 'Anonymous';
  }

  // Persist the avatar choice (infrequent, user-initiated → cheap merge write).
  function persistAvatar() {
    if (!me.uid) return;
    wDb.collection('rooms').doc(me.uid).set(
      { worldPet: me.pet, worldColor: me.color || null, worldOutfit: me.outfit || null },
      { merge: true }
    ).catch(() => {});
  }

  // ── Actions ──
  function triggerAction(aid) { if (!aid) return; me.action = aid; me.actionTs = WorldNet.serverNow(); }
  // Nearest in-range pet, skipping blocked players (they still render, but no
  // social verb should target them — matching skips them too). Optional `pred`
  // narrows the search (e.g. "only pets currently offering a high-five").
  function nearestRemote(pred) {
    const remotes = WorldNet.getRemotes();
    let best = null, bd = WORLD_PLAY_RADIUS;
    Object.keys(remotes).forEach(k => {
      const r = remotes[k];
      if (WorldChat.isBlocked(k) || (pred && !pred(r))) return;
      const d = worldDist(me, r); if (d < bd) { bd = d; best = { uid: k, r: r }; }
    });
    return best;
  }
  // ── Reciprocal high-five (the Q "Play" verb) ──
  // An offer is just the replicated 'highfive' action; the MATCH is detected
  // independently on every client from (action, actionTs, position) — same
  // replicated data + same math (highfiveMatch) → every screen agrees, with no
  // coordination layer. Spectators see the celebration too, for free.
  const hfSeen = new Map();     // match key → detection time (celebrate each match once)
  const hfBursts = [];          // live celebrations: { x, y, start } at the pair's midpoint
  const hfPrompted = new Set(); // offer keys (uid:actionTs) already invited-for or answered

  function offerHighfive(targetUid) {
    if (me.action === WORLD_HIGHFIVE.actionId) return; // one live offer at a time — re-press mints no new match key
    // Offering requires standing still: the frame loop withdraws the offer on
    // movement, so a mid-walk Q would toast an offer that dies before it ever
    // replicates. Refusing up front keeps the rule legible.
    const vec = WorldInput.getMoveVector();
    if (vec.x || vec.y) { flashHint('Stand still to high-five ✋'); return; }
    let near = null;
    if (targetUid) {
      const r = WorldNet.getRemotes()[targetUid];
      if (r && !WorldChat.isBlocked(targetUid)) near = { uid: targetUid, r: r };
      if (near && worldDist(me, near.r) > WORLD_PLAY_RADIUS) {
        // The tag menu can pick a pet across the map; an out-of-range offer can
        // never match and the target is never prompted — tell the player instead.
        flashHint('Get closer to ' + (near.r.name || 'them') + ' to high-five 🐾');
        return;
      }
    } else {
      // Prefer the nearest pet who is already offering (answer their invite —
      // otherwise a closer idle pet would steal the facing + toast), then any pet.
      near = nearestRemote(r => r.action === WORLD_HIGHFIVE.actionId) || nearestRemote();
    }
    if (!near) { flashHint('Get closer to another pet to play 🐾'); return; }
    me.facing = near.r.x >= me.x ? 1 : -1;
    triggerAction(WORLD_HIGHFIVE.actionId);
    // If they're already offering, the match fires next frame with its own toast.
    if (near.r.action !== WORLD_HIGHFIVE.actionId)
      flashHint('You offered a high five to ' + (near.r.name || 'a friend') + '! ✋');
  }

  function updateHighfives(t, remotes) {
    const opts = { actionId: WORLD_HIGHFIVE.actionId, windowMs: WORLD_HIGHFIVE.windowMs, radius: WORLD_PLAY_RADIUS };
    const actors = [me];
    Object.keys(remotes).forEach(k => {
      if (WorldChat.isBlocked(k)) return;
      const r = remotes[k];
      // Match on targetX/targetY — the last REPLICATED coordinates — not the
      // locally interpolated x/y, so every client judges the radius against the
      // same numbers (agreement is then bounded only by write cadence, and an
      // offer force-writes exact position+action together via actionRestarted).
      actors.push({ uid: k, name: r.name, x: r.targetX, y: r.targetY, action: r.action, actionTs: r.actionTs });
    });
    const myPartners = [];
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i], b = actors[j];
        if (!highfiveMatch(a, b, opts)) continue;
        const key = highfiveKey(a.uid, a.actionTs, b.uid, b.actionTs);
        if (hfSeen.has(key)) continue;
        hfSeen.set(key, t);
        hfBursts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 0.05, start: t });
        if (a.uid === me.uid || b.uid === me.uid) {
          const other = a.uid === me.uid ? b : a;
          hfPrompted.add(other.uid + ':' + other.actionTs); // answered — never prompt for it
          myPartners.push(other.name || 'a friend');
        }
      }
    }
    // One toast even when a single press matches several clustered offers
    // (flashHint is single-slot; sequential toasts would overwrite each other).
    if (myPartners.length) flashHint('High five with ' + myPartners.join(' & ') + '! 🎉');
    if (hfSeen.size > 64) hfSeen.forEach((ts, k) => { if (t - ts > 10000) hfSeen.delete(k); });

    // Invite prompt: someone near me is offering and I haven't joined in.
    // Keyed per OFFER (uid + actionTs), so a second concurrent offer still gets
    // its toast and a re-offer prompts afresh; one new invite per frame.
    if (me.action !== opts.actionId) {
      for (let i = 1; i < actors.length; i++) {
        const r = actors[i];
        if (r.action !== opts.actionId || worldDist(me, r) > opts.radius) continue;
        const key = r.uid + ':' + r.actionTs;
        if (hfPrompted.has(key)) continue;
        hfPrompted.add(key);
        flashHint('✋ ' + (r.name || 'A pet') + ' wants a high five! Press Q or tap 🤝');
        break;
      }
      if (hfPrompted.size > 128) hfPrompted.clear(); // keys are per-offer; stale ones never recur
    }
  }

  function drawHighfives(t, W, H) {
    for (let i = hfBursts.length - 1; i >= 0; i--) {
      const b = hfBursts[i], p = (t - b.start) / WORLD_HIGHFIVE.burstMs;
      if (p >= 1) { hfBursts.splice(i, 1); continue; }
      drawWorldHighfiveBurst(ctx, b.x * W, b.y * H, depthScale(b.y), p);
    }
  }

  function onAction(intent) {
    if (intent.kind === 'scene') triggerAction(sceneObj.themed[intent.index]);
    else if (intent.kind === 'emote') triggerAction(WORLD_EMOTES[intent.index]);
    else if (intent.kind === 'signature') triggerAction(signatureFor(me.pet));
    else if (intent.kind === 'play') offerHighfive();
  }

  // ── Remote tag menu: play / report / block ──
  function closeTagMenu() { const m = el('worldTagMenu'); if (m) m.remove(); document.removeEventListener('click', outsideClose); }
  function outsideClose(e) { const m = el('worldTagMenu'); if (m && !m.contains(e.target)) closeTagMenu(); }
  function openTagMenu(uid, anchor) {
    closeTagMenu();
    const r = WorldNet.getRemotes()[uid]; if (!r) return;
    const menu = document.createElement('div');
    menu.className = 'world-tagmenu'; menu.id = 'worldTagMenu';
    menu.innerHTML =
      '<div class="world-tagmenu-name">' + esc(r.name || 'Pet') + '</div>' +
      '<button data-act="play">✋ High-five</button>' +
      '<button data-act="report">🚩 Report</button>' +
      '<button data-act="block">🚫 Block</button>';
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 150) + 'px';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.querySelector('[data-act=play]').onclick = () => { offerHighfive(uid); closeTagMenu(); };
    menu.querySelector('[data-act=report]').onclick = () => { WorldNet.reportUser(uid, ''); flashHint('Reported. Thanks for keeping the World kind 💛'); closeTagMenu(); };
    menu.querySelector('[data-act=block]').onclick = () => { WorldChat.block(uid); flashHint("Blocked. You won't see them anymore."); closeTagMenu(); };
    setTimeout(() => document.addEventListener('click', outsideClose), 0);
  }

  // ── Scenes ──
  function updateSceneUI() {
    const nm = el('worldSceneName'); if (nm) nm.textContent = sceneObj.emoji + ' ' + sceneObj.name;
    document.querySelectorAll('.world-scene-chip').forEach(c => c.classList.toggle('active', c.dataset.scene === me.scene));
  }
  function switchScene(id) {
    const s = worldSceneById(id);
    if (!s || s.id === me.scene) return;
    me.scene = s.id; sceneObj = s;
    me.x = s.spawn.x; me.y = s.spawn.y; me.action = null;
    hfBursts.length = 0; hfPrompted.clear(); // celebrations/prompts don't cross scenes
    WorldActors.clearTags();
    WorldNet.switchScene(s.id, me);
    WorldInput.buildActionButtons(el('worldActionBtns'), s.id);
    updateSceneUI();
    try { history.replaceState(null, '', '?scene=' + s.id); } catch (e) {}
  }
  function buildSceneTabs() {
    const c = el('worldSceneTabs'); if (!c) return;
    c.innerHTML = WORLD_SCENES.map(s => '<button class="world-scene-chip" data-scene="' + s.id + '">' + s.emoji + ' ' + esc(s.name) + '</button>').join('');
    c.querySelectorAll('.world-scene-chip').forEach(b => b.addEventListener('click', () => switchScene(b.dataset.scene)));
  }

  // ── Pet picker ──
  function buildPetPicker() {
    const c = el('worldPetPicker'); if (!c) return;
    c.innerHTML = WORLD_PET_TYPES.map(type => {
      const colors = PET_COLORS[type] || [];
      return '<div class="world-pet-row">' +
        '<canvas class="world-pet-thumb" width="70" height="70" data-pet="' + type + '"></canvas>' +
        '<div class="world-pet-info"><div class="world-pet-name">' + type + '</div>' +
        '<div class="world-pet-colors">' + colors.map(col =>
          '<button class="world-color-dot" data-pet="' + type + '" data-color="' + col.key + '" style="background:' + col.body + '" title="' + col.name + '"></button>').join('') +
        '</div></div></div>';
    }).join('');
    c.querySelectorAll('.world-pet-thumb').forEach(cv => {
      const type = cv.dataset.pet, g = cv.getContext('2d');
      g.save(); g.translate(35, 44); g.scale(0.72, 0.72);
      try { worldDrawPet(g, type, PET_SIZES[type] || 64, 0, false, null, 0, Date.now(), null); } catch (e) {}
      g.restore();
      cv.addEventListener('click', () => selectPet(type, null));
    });
    c.querySelectorAll('.world-color-dot').forEach(b => b.addEventListener('click', () => selectPet(b.dataset.pet, b.dataset.color)));
    highlightPet();
  }
  function selectPet(type, color) {
    me.pet = type;
    me.color = color || ((PET_COLORS[type] && PET_COLORS[type][0].key) || null);
    WorldNet.forceUpdate(me); persistAvatar();
    WorldInput.buildActionButtons(el('worldActionBtns'), me.scene);
    highlightPet();
    flashHint('You are now a ' + type + '! ' + '🐾');
  }
  function highlightPet() {
    document.querySelectorAll('.world-color-dot').forEach(d =>
      d.classList.toggle('active', d.dataset.pet === me.pet && d.dataset.color === me.color));
    document.querySelectorAll('.world-pet-thumb').forEach(cv =>
      cv.classList.toggle('active', cv.dataset.pet === me.pet));
  }

  function onOutfitChange(accId) { me.outfit = accId || null; WorldNet.forceUpdate(me); persistAvatar(); }

  // ── Slide-in menu (pet / wear) ──
  function toggleMenu(which) {
    const menu = el('worldMenu'); if (!menu) return;
    const open = menu.classList.contains('open') && menu.dataset.pane === which;
    if (open) { menu.classList.remove('open'); return; }
    menu.classList.add('open'); menu.dataset.pane = which;
    const pet = el('worldPetPane'), wear = el('worldWearPane');
    if (pet) pet.style.display = which === 'pet' ? 'block' : 'none';
    if (wear) wear.style.display = which === 'wear' ? 'block' : 'none';
  }

  // ── Render loop ──
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w: w, h: h };
  }
  function fallbackBg(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, sceneObj.sky[0]); g.addColorStop(1, sceneObj.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }
  function frame() {
    if (!running) return;
    const t = WorldNet.serverNow(); // server-aligned clock so remote action timing matches
    let dt = (t - lastT) / 1000; if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0; lastT = t;

    // Local movement
    const vec = WorldInput.getMoveVector();
    const step = stepPosition(me.x, me.y, vec, WORLD_SYNC.moveSpeed, dt, sceneObj.bounds);
    me.x = step.x; me.y = step.y;
    me.moving = (vec.x !== 0 || vec.y !== 0);
    if (vec.x > 0.01) me.facing = 1; else if (vec.x < -0.01) me.facing = -1;
    // Walking away withdraws a pending high-five offer — it's a stationary
    // invitation, and the paw-up pose layered on the walk cycle reads as broken.
    // Known accepted race: the cancel replicates within ~200ms (write rate cap),
    // so an answer landing inside that window celebrates on the answerer's
    // screen but not the withdrawer's. Honoring such answers locally would need
    // a "ghost offer" that can't distinguish a late answer from a fresh offer,
    // trading this rare miss for a wrong-side celebration — not worth it.
    if (me.moving && me.action === WORLD_HIGHFIVE.actionId) me.action = null;
    if (me.action && (t - me.actionTs) > worldActionDuration(me.action)) me.action = null;

    // Interpolate remotes toward their last-synced targets + expire their actions
    const remotes = WorldNet.getRemotes();
    Object.keys(remotes).forEach(k => {
      const r = remotes[k];
      const n = lerpToward(r, { x: r.targetX, y: r.targetY }, WORLD_SYNC.interpFactor);
      r.x = n.x; r.y = n.y;
      if (r.action && (t - (r.actionTs || 0)) > worldActionDuration(r.action)) r.action = '';
    });

    updateHighfives(t, remotes); // detect mutual offers + prompt nearby invitations

    WorldNet.writeState(me); // throttled + delta-gated inside

    const size = resize();
    ctx.clearRect(0, 0, size.w, size.h);
    const drawFn = window.WORLD_SCENE_DRAW && window.WORLD_SCENE_DRAW[me.scene];
    if (drawFn) { try { drawFn(ctx, size.w, size.h, t / 1000); } catch (e) { fallbackBg(size.w, size.h); } }
    else fallbackBg(size.w, size.h);
    WorldActors.render(ctx, size.w, size.h, t, me, remotes, sceneObj);
    drawHighfives(t, size.w, size.h); // matched-pair celebrations on top of the actors

    requestAnimationFrame(frame);
  }

  // ── Startup ──
  function startWorld(uid) {
    me.uid = uid;
    me.name = worldPlayerName(uid);
    me.x = sceneObj.spawn.x; me.y = sceneObj.spawn.y;

    // Subsystems
    WorldNet.init({ db: wDb, uid: uid, getName: () => me.name, onRemotes: function () {}, onChat: function (list) { WorldChat.receive(list); }, onDiag: onDiag });
    WorldActors.init({ tagLayer: tagLayer, onTagClick: openTagMenu, getBubble: function (u) { return WorldChat.getBubble(u); } });
    WorldChat.init({ inputEl: el('worldChatInput'), logEl: el('worldChatLog'), hintEl: el('worldChatHint'), sendBtn: el('worldChatSend'), onSend: function (text) { WorldNet.sendChat(text); }, myUid: uid, chatEl: el('worldChat'), toggleEl: el('worldChatToggle'), labelEl: el('worldChatToggleLabel'), unreadEl: el('worldChatUnread') });
    WorldOutfit.init({ db: wDb, uid: uid, panelEl: el('worldWardrobe'), onChange: onOutfitChange });
    WorldInput.init({ onAction: onAction, joystickEl: el('worldJoystick') });

    // Load saved avatar + owned accessories, then build the pickers.
    wDb.collection('rooms').doc(uid).get().then(d => {
      if (d.exists) {
        const x = d.data();
        if (x.worldPet && PET_SIZES[x.worldPet]) me.pet = x.worldPet;
        if (x.worldColor) me.color = x.worldColor;
        if (x.worldOutfit) me.outfit = x.worldOutfit;
        if (x.displayName) me.name = x.displayName;
      }
      if (!me.color) me.color = (PET_COLORS[me.pet] && PET_COLORS[me.pet][0].key) || null;
      buildPetPicker();
      WorldOutfit.loadOwned().then(() => WorldOutfit.render(me.outfit));
      WorldNet.forceUpdate(me);
    }).catch(() => {
      if (!me.color) me.color = (PET_COLORS[me.pet] && PET_COLORS[me.pet][0].key) || null;
      buildPetPicker();
      WorldOutfit.render(me.outfit);
    });

    WorldInput.buildActionButtons(el('worldActionBtns'), me.scene);
    buildSceneTabs();
    updateSceneUI();
    WorldNet.join(me.scene, me);

    const gate = el('worldGate'); if (gate) gate.style.display = 'none';
    running = true; lastT = WorldNet.serverNow();
    requestAnimationFrame(frame);
  }

  // Top-bar wiring
  el('worldPetBtn') && el('worldPetBtn').addEventListener('click', () => toggleMenu('pet'));
  el('worldWearBtn') && el('worldWearBtn').addEventListener('click', () => toggleMenu('wear'));
  el('worldMenuClose') && el('worldMenuClose').addEventListener('click', () => { const m = el('worldMenu'); if (m) m.classList.remove('open'); });

  // Auth gate — the World inherits the app's persisted Google session.
  wAuth.onAuthStateChanged(function (u) {
    if (u) { if (!running) startWorld(u.uid); }
    else { const gate = el('worldGate'); if (gate) gate.style.display = 'flex'; }
  });
})();
