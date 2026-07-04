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
  const hfBackBtn = document.getElementById('worldHighfiveBack');
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

  // Daily Sparkle Hunt progress chip (top-right). Driven by WorldSparkles.
  function updateSparkleChip(found, total) {
    const chip = el('worldSparkleChip'); if (!chip) return;
    chip.hidden = false;
    chip.textContent = '✨ ' + found + '/' + total;
    chip.classList.toggle('done', found >= total);
  }
  // Finishing the whole day's hunt awards coins. The World runs its own Firebase
  // app (no room coin machinery), so credit rooms/{uid}.coins directly with an
  // atomic increment — race-safe against the room's own coin writes, and the
  // room picks up the new balance next time it loads.
  function onSparkleComplete() {
    const amt = (WORLD_SPARKLES && WORLD_SPARKLES.reward) || 500;
    if (me.uid) {
      wDb.collection('rooms').doc(me.uid).set(
        { coins: firebase.firestore.FieldValue.increment(amt) }, { merge: true }
      ).catch(function () {});
    }
    flashHint('🎉 All sparkles found! You earned ' + amt + ' coins 💰');
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

  function offerHighfive(targetUid) {
    if (me.action === WORLD_HIGHFIVE.actionId) return; // one live offer at a time — re-press mints no new match key
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
          myPartners.push(other.name || 'a friend');
        }
      }
    }
    // One toast even when a single press matches several clustered offers
    // (flashHint is single-slot; sequential toasts would overwrite each other).
    if (myPartners.length) flashHint('High five with ' + myPartners.join(' & ') + '! 🎉');
    if (hfSeen.size > 64) hfSeen.forEach((ts, k) => { if (t - ts > 10000) hfSeen.delete(k); });

    // Persistent "high-five back" prompt: a big, always-tappable button (not a
    // fleeting toast) whenever a nearby pet is offering and I haven't joined in.
    // Mobile has no Q key and a 2.2s toast is too brief to react to, so this is
    // the primary touch affordance; tapping it answers the nearest offerer.
    let offerer = null;
    if (me.action !== opts.actionId) {
      let bd = opts.radius;
      for (let i = 1; i < actors.length; i++) {
        const r = actors[i];
        if (r.action !== opts.actionId) continue;
        const d = worldDist(me, r); if (d <= bd) { bd = d; offerer = r; }
      }
    }
    setHighfiveBackBtn(!!offerer);
  }

  // Show/hide the big centered "High-five back!" button (idempotent per frame).
  function setHighfiveBackBtn(show) {
    if (hfBackBtn) hfBackBtn.hidden = !show;
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

  // ── Notice board: walk up to it, then open the full-screen board ──
  function currentBoard() { return (WORLD_NOTES.boards && WORLD_NOTES.boards[me.scene]) || null; }
  function nearBoard() { const b = currentBoard(); return !!b && worldDist(me, b) <= WORLD_NOTES.boardRadius; }
  function boardOpen() { const m = el('worldBoardModal'); return !!m && !m.hidden; }
  // The "📋 Open board" prompt (tappable on mobile; Enter on desktop) is shown
  // only while standing at the board and not already viewing it.
  function setNotePrompt(show) { const p = el('worldNotePrompt'); if (p) p.hidden = !show; }

  let boardPage = 0, boardMsgT = null;
  function showBoardMsg(msg) {
    const m = el('worldBoardMsg'); if (!m) return;
    m.textContent = msg || ''; clearTimeout(boardMsgT);
    if (msg) boardMsgT = setTimeout(function () { m.textContent = ''; }, 2200);
  }

  // Rebuild the sticky-note grid + pager for the current scene's board.
  function renderBoard() {
    const grid = el('worldBoardGrid'); if (!grid) return;
    const title = el('worldBoardTitle');
    if (title) title.textContent = '📋 ' + sceneObj.emoji + ' ' + sceneObj.name + ' — Notes';
    const notes = WorldNotes.list(me.scene);
    const per = WORLD_NOTES.perPage || 8;
    const pages = Math.max(1, Math.ceil(notes.length / per));
    boardPage = Math.max(0, Math.min(boardPage, pages - 1));
    const start = boardPage * per, slice = notes.slice(start, start + per);
    const colors = ['#bfe3ff', '#ffe6a8', '#ffc9d6', '#c9f0d0', '#e6d4ff', '#ffd9b3'];
    if (!slice.length) {
      grid.innerHTML = '<div class="world-board-empty">No notes yet — be the first to leave one! 🌸</div>';
    } else {
      // Scatter the notes at absolute positions on the cork, NOT in reading order:
      // build a set of spread-out anchor cells (percent, inset from the edges) and
      // SHUFFLE them deterministically per page, then drop each note in a shuffled
      // cell with its own seeded jitter + tilt. So the layout is random-looking and
      // stable per render, never a tidy sequence.
      const cx = [20, 50, 80], cy = [24, 50, 76], cells = [];
      for (let r = 0; r < cy.length; r++) for (let c = 0; c < cx.length; c++) cells.push({ x: cx[c], y: cy[r] });
      const order = cells.map(function (c, i) { return { c: c, k: worldStrHash('cell|' + boardPage + '|' + i) }; })
        .sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.c; });
      grid.innerHTML = slice.map(function (n, i) {
        const cell = order[i % order.length];
        const seed = worldStrHash((n.uid || '') + ':' + (n.ts || 0));
        const jx = ((seed % 100) / 100 - 0.5) * 15;         // ±7.5% jitter around the cell
        const jy = (((seed >> 7) % 100) / 100 - 0.5) * 15;
        const rot = ((seed >> 14) % 23) - 11;               // -11..11° tilt
        const left = Math.max(17, Math.min(83, cell.x + jx));
        const top = Math.max(18, Math.min(82, cell.y + jy));
        const c = colors[(start + i) % colors.length];
        return '<div class="world-sticky" style="left:' + left + '%;top:' + top + '%;z-index:' + (100 + per - i) + ';background:' + c + ';transform:translate(-50%,-50%) rotate(' + rot + 'deg)">' +
          '<span class="world-sticky-pin"></span>' +
          '<div class="world-sticky-text">' + esc(n.text || '') + '</div>' +
          '<div class="world-sticky-by">— ' + esc(n.name || 'Pet') + '</div></div>';
      }).join('');
    }
    const pager = el('worldBoardPager');
    if (pager) {
      if (pages <= 1) pager.innerHTML = '';
      else {
        pager.innerHTML = '<button id="wbPrev"' + (boardPage === 0 ? ' disabled' : '') + '>‹</button>' +
          '<span>Page ' + (boardPage + 1) + ' / ' + pages + '</span>' +
          '<button id="wbNext"' + (boardPage >= pages - 1 ? ' disabled' : '') + '>›</button>';
        const prev = el('wbPrev'), next = el('wbNext');
        if (prev) prev.onclick = function () { boardPage--; renderBoard(); };
        if (next) next.onclick = function () { boardPage++; renderBoard(); };
      }
    }
  }

  function openBoard() {
    if (!nearBoard() || boardOpen()) return;
    setNotePrompt(false); boardPage = 0; showBoardMsg(''); renderBoard();
    const m = el('worldBoardModal'); if (m) { m.hidden = false; m.classList.add('open'); }
  }
  function closeBoard() {
    const m = el('worldBoardModal'); if (m) { m.hidden = true; m.classList.remove('open'); }
    const inp = el('worldBoardInput'); if (inp) inp.blur();
  }
  function addFromBoard() {
    const inp = el('worldBoardInput'); if (!inp) return;
    const res = WorldNotes.pin(inp.value, me);
    if (res.ok) { inp.value = ''; boardPage = 0; renderBoard(); showBoardMsg('📌 Pinned to the board!'); }
    else showBoardMsg(res.reason === 'blocked' ? "Let's keep it kind 🌸" : res.reason === 'cooldown' ? 'Give it a moment ⏳' : 'Write something first ✍️');
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
  // `entry` (optional) places the pet at a specific spot in the new scene — used
  // by edge-walking so you arrive at the opposite edge instead of the spawn.
  function switchScene(id, entry) {
    const s = worldSceneById(id);
    if (!s || s.id === me.scene) return;
    me.scene = s.id; sceneObj = s;
    if (entry) { me.x = wClamp(entry.x, s.bounds.minX, s.bounds.maxX); me.y = wClamp(entry.y, s.bounds.minY, s.bounds.maxY); }
    else { me.x = s.spawn.x; me.y = s.spawn.y; }
    me.action = null;
    hfBursts.length = 0; setHighfiveBackBtn(false); // celebrations/prompts don't cross scenes
    WorldReactive.reset();                          // marks/props don't carry across scenes
    WorldBall.reset(); WorldCritters.reset();       // ball + critters are per-scene
    WorldFireflies.reset();                         // fireflies re-seed per scene
    setNotePrompt(false); closeBoard();             // the board is per-scene
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

  // ── Edge-walking between scenes ──
  // Walk into the right wall to go to the NEXT scene, the left wall for the
  // PREVIOUS one (linear order: pool → egypt → grassland). You arrive at the
  // opposite edge so it feels like one continuous world. Mobile-first — it's just
  // walking — and a faint pulsing arrow marks each edge that leads somewhere.
  let edgeUntil = 0;      // brief lock after a transition so you don't bounce straight back
  let trans = null;       // active scene-transition wipe: { dir, start, toScene, entry, swapped }
  const TRANS_MS = 720;   // full wipe duration; the scene swap is hidden at the half-way cover
  function sceneIdx() { return WORLD_SCENES.findIndex(s => s.id === me.scene); }
  function startTrans(dir, scene, entry, t) {
    trans = { dir: dir, start: t, toScene: scene.id, entry: entry, swapped: false };
    edgeUntil = t + TRANS_MS + 300;
  }
  function maybeEdgeWalk(t, vec) {
    if (trans || t < edgeUntil) return;
    const b = sceneObj.bounds, idx = sceneIdx();
    if (me.x >= b.maxX - 1e-3 && vec.x > 0.05 && idx < WORLD_SCENES.length - 1) {
      const nx = WORLD_SCENES[idx + 1]; startTrans(1, nx, { x: nx.bounds.minX + 0.03, y: me.y }, t);
    } else if (me.x <= b.minX + 1e-3 && vec.x < -0.05 && idx > 0) {
      const pv = WORLD_SCENES[idx - 1]; startTrans(-1, pv, { x: pv.bounds.maxX - 0.03, y: me.y }, t);
    }
  }
  // Advance the wipe: swap scenes at the half-way point (fully covered), end at 1.
  function advanceTransition(t) {
    if (!trans) return;
    const p = (t - trans.start) / TRANS_MS;
    if (!trans.swapped && p >= 0.5) { switchScene(trans.toScene, trans.entry); trans.swapped = true; }
    if (p >= 1) trans = null;
  }
  // The travelling curtain: a full-screen panel in the destination's sky colours
  // that slides across in the walk direction, carrying the destination's emoji +
  // name. It fully covers at the mid-point (when the scene swaps underneath).
  function drawTransition(ctx, W, H, t) {
    if (!trans) return;
    const p = Math.max(0, Math.min(1, (t - trans.start) / TRANS_MS));
    const px = trans.dir > 0 ? (W - p * 2 * W) : (-W + p * 2 * W);
    const dst = worldSceneById(trans.toScene);
    ctx.save();
    ctx.translate(px, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, dst.sky[0]); g.addColorStop(1, dst.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = ((H * 0.14) | 0) + 'px serif'; ctx.fillText(dst.emoji, W / 2, H * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = 'bold ' + ((H * 0.05) | 0) + 'px sans-serif'; ctx.fillText('🚶  ' + dst.name, W / 2, H * 0.55);
    ctx.restore();
  }
  function drawEdgeArrows(ctx, W, H, t) {
    const idx = sceneIdx();
    const right = idx < WORLD_SCENES.length - 1 ? WORLD_SCENES[idx + 1] : null;
    const left = idx > 0 ? WORLD_SCENES[idx - 1] : null;
    const pulse = 0.5 + 0.5 * Math.sin(t / 400);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    function arrow(ch, x, y, scene) {
      ctx.globalAlpha = 0.4 + 0.3 * pulse; ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
      ctx.font = 'bold 34px sans-serif'; ctx.strokeText(ch, x, y); ctx.fillText(ch, x, y);
      ctx.globalAlpha = 0.55; ctx.font = '20px serif'; ctx.fillText(scene.emoji, x, y + 30);
    }
    if (right) arrow('›', W - 24, H * 0.42, right);
    if (left) arrow('‹', 24, H * 0.42, left);
    ctx.restore();
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
    const sky = WorldSky.state(); // time-of-day tint (pure from the shared clock); drives fireflies too

    // Local movement — frozen while a transition wipe plays or the board is open.
    if (trans) {
      advanceTransition(t);
      me.moving = false;
    } else if (boardOpen()) {
      me.moving = false;
    } else {
      const vec = WorldInput.getMoveVector();
      const step = stepPosition(me.x, me.y, vec, WORLD_SYNC.moveSpeed, dt, sceneObj.bounds);
      me.x = step.x; me.y = step.y;
      me.moving = (vec.x !== 0 || vec.y !== 0);
      if (vec.x > 0.01) me.facing = 1; else if (vec.x < -0.01) me.facing = -1;
      maybeEdgeWalk(t, vec); // walk into a side wall → cross to the neighbouring scene
    }
    // The high-five offer persists while walking (mobile players keep a thumb on
    // the joystick) and simply expires with its duration; world-actors drops the
    // paw-up pose while moving so it never layers on the walk cycle.
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
    WorldSparkles.update(me);    // collect any hidden sparkle walked onto
    WorldReactive.update(t, dt, me, remotes, me.scene); // scene reacts to pets that move/touch
    WorldBall.update(t, dt, me, remotes, me.scene);     // kick the shared pool ball on contact
    WorldCritters.update(dt, me, remotes, me.scene);    // fish/lizards/butterflies flee passing pets
    WorldFireflies.update(dt, me, remotes, sky.star, t); // at dusk/night, gather around a still pet
    const atBoard = nearBoard();                        // standing at the notice board?
    setNotePrompt(atBoard && !boardOpen());             // show/hide the "open board" prompt

    WorldNet.writeState(me); // throttled + delta-gated inside

    const size = resize();
    ctx.clearRect(0, 0, size.w, size.h);
    const drawFn = window.WORLD_SCENE_DRAW && window.WORLD_SCENE_DRAW[me.scene];
    if (drawFn) { try { drawFn(ctx, size.w, size.h, t / 1000); } catch (e) { fallbackBg(size.w, size.h); } }
    else fallbackBg(size.w, size.h);
    WorldSky.drawBg(ctx, size.w, size.h, t, sky);         // day/night tint + stars/moon, over the scene bg
    WorldReactive.draw(ctx, size.w, size.h, t, me.scene); // contact marks + props, under the pets
    WorldBall.draw(ctx, size.w, size.h, t, me.scene);     // shared kickable ball, under the pets
    WorldCritters.draw(ctx, size.w, size.h, t, me.scene); // ambient critters, under the pets
    WorldNotes.drawBoard(ctx, size.w, size.h, t, me.scene, atBoard); // notice board prop, under the pets
    WorldActors.render(ctx, size.w, size.h, t, me, remotes, sceneObj);
    WorldFireflies.draw(ctx, size.w, size.h, t, sky.star); // glowing fireflies over the pets at night
    WorldSky.drawWash(ctx, size.w, size.h, sky);          // subtle warm glow over everything at golden hour
    WorldSparkles.draw(ctx, size.w, size.h, t / 1000, me, me.scene); // hidden-until-near sparkles (t in seconds for twinkle)
    drawHighfives(t, size.w, size.h); // matched-pair celebrations on top of the actors
    drawEdgeArrows(ctx, size.w, size.h, t); // faint ‹ › cues marking edges that cross to another scene
    drawTransition(ctx, size.w, size.h, t); // travelling wipe on top of everything during a scene change

    requestAnimationFrame(frame);
  }

  // ── Startup ──
  function startWorld(uid) {
    me.uid = uid;
    me.name = worldPlayerName(uid);
    me.x = sceneObj.spawn.x; me.y = sceneObj.spawn.y;

    // Subsystems
    WorldNet.init({ db: wDb, uid: uid, getName: () => me.name, onRemotes: function () {}, onChat: function (list) { WorldChat.receive(list); }, onDiag: onDiag });
    WorldBall.init({ serverNow: WorldNet.serverNow, getBall: WorldNet.getBall, kickBall: WorldNet.kickBall });
    WorldSky.init({ serverNow: WorldNet.serverNow });
    WorldNotes.init({ serverNow: WorldNet.serverNow, getNotes: WorldNet.getNotes, pinNote: WorldNet.pinNote, flashHint: flashHint, myUid: uid });
    WorldActors.init({ tagLayer: tagLayer, onTagClick: openTagMenu, getBubble: function (u) { return WorldChat.getBubble(u); } });
    WorldChat.init({ inputEl: el('worldChatInput'), logEl: el('worldChatLog'), hintEl: el('worldChatHint'), sendBtn: el('worldChatSend'), onSend: function (text) { WorldNet.sendChat(text); }, myUid: uid, chatEl: el('worldChat'), toggleEl: el('worldChatToggle'), labelEl: el('worldChatToggleLabel'), unreadEl: el('worldChatUnread') });
    WorldOutfit.init({ db: wDb, uid: uid, panelEl: el('worldWardrobe'), onChange: onOutfitChange });
    WorldInput.init({ onAction: onAction, joystickEl: el('worldJoystick') });
    WorldSparkles.init({
      db: wDb, uid: uid, serverNow: WorldNet.serverNow, flashHint: flashHint,
      triggerSparkle: function () { triggerAction('sparkle'); },
      onProgress: updateSparkleChip, onComplete: onSparkleComplete,
    });
    if (!localStorage.getItem('world_sparkle_intro')) {
      localStorage.setItem('world_sparkle_intro', '1');
      setTimeout(function () { flashHint('✨ 3 sparkles hide in each scene (9 total). Collect them all for ' + ((WORLD_SPARKLES && WORLD_SPARKLES.reward) || 500) + ' coins 💰'); }, 1600);
    }

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
  hfBackBtn && hfBackBtn.addEventListener('click', e => { e.preventDefault(); offerHighfive(); });
  // Notice-board wiring
  el('worldNotePrompt') && el('worldNotePrompt').addEventListener('click', e => { e.preventDefault(); openBoard(); });
  el('worldBoardClose') && el('worldBoardClose').addEventListener('click', e => { e.preventDefault(); closeBoard(); });
  el('worldBoardAdd') && el('worldBoardAdd').addEventListener('click', e => { e.preventDefault(); addFromBoard(); });
  el('worldBoardInput') && el('worldBoardInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addFromBoard(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeBoard(); }
  });
  // Tap the dimmed backdrop (outside the board frame) to close.
  el('worldBoardModal') && el('worldBoardModal').addEventListener('click', e => { if (e.target === el('worldBoardModal')) closeBoard(); });
  // Desktop: Enter at the board opens it (mobile taps the 📋 prompt); Esc closes.
  window.addEventListener('keydown', e => {
    if (e.repeat || WorldInput.isTyping()) return;
    if (e.key === 'Enter' && !boardOpen() && nearBoard()) { e.preventDefault(); openBoard(); }
    else if (e.key === 'Escape' && boardOpen()) { e.preventDefault(); closeBoard(); }
  });
  // Post THIS world (current scene) to the bubble board so others can join. Uses
  // the world's own Firestore instance; the scene link drops joiners in the same
  // shard (shard 0 fills first), so clicking the board card lands them here too.
  el('worldShareBtn') && el('worldShareBtn').addEventListener('click', () => {
    if (!window.ShareToBoard || !wAuth.currentUser) { flashHint('Sign in first to share.'); return; }
    ShareToBoard.postSpace(wDb, wAuth.currentUser, { kind: 'world', scene: me.scene, ownerName: me.name })
      .then(() => flashHint('📢 Shared Pet World to the board!'))
      .catch(err => flashHint(err && err.code === 'cooldown' ? 'Just shared — give it a moment.' : 'Could not share.'));
  });

  // Auth gate — the World inherits the app's persisted Google session.
  wAuth.onAuthStateChanged(function (u) {
    if (u) { if (!running) startWorld(u.uid); }
    else { const gate = el('worldGate'); if (gate) gate.style.display = 'flex'; }
  });
})();
