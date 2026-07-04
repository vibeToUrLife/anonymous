/* ════════════════════════════════════════════════════════════════
   world-net.js — realtime sync over Firebase Realtime Database (compat).
   Mirrors the coin-rush.js idiom. Cost-guarded: position writes are ≤5 Hz and
   only on meaningful change (world-logic.shouldWritePosition); we subscribe to
   ONE scene-shard at a time; chat reads use limitToLast. Despawn is handled by
   onDisconnect().remove() with a TTL backstop. If RTDB is unavailable the whole
   module no-ops and the World runs solo.

   RTDB layout:
     world/scenes/{sceneId}/{shard}/players/{uid} = { name,pet,color,outfit,
        x,y,facing,action,actionTs,ts }   // onDisconnect → removed
     world/scenes/{sceneId}/{shard}/chat/{pushId} = { uid,name,text,ts }
     world/scenes/{sceneId}/{shard}/notes/{pushId} = { uid,name,text,x,y,ts } // pinned notes
   Moderation reports go to Firestore (moderation_reports).
   ════════════════════════════════════════════════════════════════ */
const WorldNet = (function () {
  let rtdb = null, db = null, uid = null;
  let scene = 'pool', shard = 0;
  let playersRef = null, chatRef = null, playersCb = null, chatCb = null, myRef = null;
  let ballsRef = null, ballsCb = null, ballsVal = {};   // shared kickable floaties (this shard): id → snapshot
  let notesRef = null, notesCb = null, notesVal = [];   // pinned notes (this shard), newest last
  let lastSent = null;
  let heartbeat = null;
  const remotes = {};           // uid → { name,pet,color,outfit,x,y,targetX,targetY,facing,action,actionTs,ts }
  let onRemotes = function () {};
  let onChat = function () {};
  let onDiag = function () {};   // surfaces connection / permission errors to the UI
  let getName = function () { return 'Anonymous'; };

  // Server-aligned clock: Date.now() + offset ≈ Firebase server time. Using this
  // for every ts/actionTs (and freshness check) makes timing consistent ACROSS
  // clients even when their device clocks are skewed, so remote actions play and
  // presence TTL doesn't mis-despawn. Offset is learned from .info/serverTimeOffset.
  let serverOffset = 0;
  function nowMs() { return Date.now() + serverOffset; }
  function r3(v) { return Math.round(v * 1000) / 1000; } // trim precision → smaller writes
  function base() { return rtdb.ref('world/scenes/' + scene + '/' + shard); }

  function serialize(me) {
    return {
      name: getName(), pet: me.pet, color: me.color || '', outfit: me.outfit || '',
      x: r3(me.x), y: r3(me.y), facing: me.facing, action: me.action || '',
      actionTs: me.actionTs || 0, ts: nowMs(),
    };
  }

  // Count players per shard so newcomers fill shard 0 first, then spill.
  async function pickShard(sceneId) {
    if (!rtdb) return 0;
    try {
      const snap = await rtdb.ref('world/scenes/' + sceneId).once('value');
      const val = snap.val() || {};
      const counts = [];
      Object.keys(val).forEach(k => {
        const i = parseInt(k, 10);
        if (!isNaN(i)) counts[i] = (val[k] && val[k].players) ? Object.keys(val[k].players).length : 0;
      });
      for (let i = 0; i < counts.length; i++) if (counts[i] === undefined) counts[i] = 0;
      return assignShard(counts, WORLD_SHARD_CAP);
    } catch (e) { return 0; }
  }

  function handlePlayers(val) {
    const seen = {};
    const now = nowMs();
    Object.keys(val).forEach(k => {
      if (k === uid) return;                       // never render ourselves as a remote
      const p = val[k];
      if (!p || typeof p.x !== 'number') return;
      if (!isFresh(p.ts || now, now, WORLD_SYNC.ttlMs)) return; // stale backstop
      seen[k] = true;
      const cur = remotes[k];
      if (!cur) {
        remotes[k] = {
          name: p.name || 'Pet', pet: p.pet || 'cat', color: p.color || '', outfit: p.outfit || '',
          x: p.x, y: p.y, targetX: p.x, targetY: p.y, facing: p.facing || 1,
          action: p.action || '', actionTs: p.actionTs || 0, ts: p.ts || now,
        };
      } else {
        cur.name = p.name || cur.name; cur.pet = p.pet || cur.pet; cur.color = p.color || '';
        cur.outfit = p.outfit || ''; cur.targetX = p.x; cur.targetY = p.y;
        cur.facing = p.facing || cur.facing; cur.action = p.action || ''; cur.actionTs = p.actionTs || 0;
        cur.ts = p.ts || now;
      }
    });
    Object.keys(remotes).forEach(k => { if (!seen[k]) delete remotes[k]; }); // despawn
    onRemotes(remotes);
    onDiag({ type: 'players', count: Object.keys(remotes).length });
  }

  function handleChat(val) {
    const list = Object.keys(val).map(k => val[k]).filter(Boolean);
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    onChat(list);
  }

  // ── Public API ──
  async function join(sceneId, me) {
    scene = sceneId;
    if (!rtdb || !uid) return { scene, shard: 0, online: false };
    shard = await pickShard(sceneId);
    myRef = base().child('players/' + uid);
    try {
      await myRef.set(serialize(me));
      myRef.onDisconnect().remove();
    } catch (e) {
      // Most common causes: RTDB rules not deployed (permission_denied) or a wrong
      // databaseURL (can't reach the instance). Surface it instead of failing silently.
      onDiag({ type: 'error', where: 'write', message: (e && e.message) || 'write failed' });
      return { scene, shard, online: false };
    }
    lastSent = { x: r3(me.x), y: r3(me.y), facing: me.facing, action: me.action || '', actionTs: me.actionTs || 0, ts: nowMs() };

    playersRef = base().child('players');
    playersCb = playersRef.on('value',
      s => handlePlayers(s.val() || {}),
      err => onDiag({ type: 'error', where: 'read', message: (err && err.message) || 'read denied' }));
    chatRef = base().child('chat').limitToLast(WORLD_CHAT.historyLimit);
    chatCb = chatRef.on('value', s => handleChat(s.val() || {}));

    // Shared kickable floaties for this shard (world-ball.js reads/writes snapshots).
    ballsVal = {};
    ballsRef = base().child('balls');
    ballsCb = ballsRef.on('value', s => { ballsVal = s.val() || {}; }, () => {});

    // Pinned notes for this shard (world-notes.js reads them; newest last).
    notesVal = [];
    notesRef = base().child('notes').limitToLast(WORLD_NOTES.historyLimit);
    notesCb = notesRef.on('value', s => {
      const v = s.val() || {};
      notesVal = Object.keys(v).map(k => v[k]).filter(Boolean).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    }, () => {});

    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      // Keep our node fresh while idle so others' TTL doesn't despawn us.
      if (myRef) myRef.update({ ts: nowMs() }).catch(() => {});
    }, WORLD_SYNC.heartbeatMs);
    return { scene, shard, online: true };
  }

  // Called every frame by world-core; internally throttled + delta-gated.
  function writeState(me) {
    if (!rtdb || !uid || !myRef) return;
    const cur = { x: r3(me.x), y: r3(me.y), facing: me.facing, action: me.action || '', ts: nowMs() };
    // Re-pressing the SAME action changes only actionTs (not the action string), so
    // the movement delta-gate wouldn't catch it — force a write so remotes restart it.
    const actionRestarted = cur.action && lastSent && (me.actionTs || 0) !== (lastSent.actionTs || 0);
    if (!actionRestarted && !shouldWritePosition(lastSent, cur, { minIntervalMs: WORLD_SYNC.minIntervalMs, epsilon: WORLD_SYNC.epsilon, nowMs: cur.ts })) return;
    lastSent = { x: cur.x, y: cur.y, facing: cur.facing, action: cur.action, actionTs: me.actionTs || 0, ts: cur.ts };
    myRef.update({ x: cur.x, y: cur.y, facing: cur.facing, action: cur.action, actionTs: me.actionTs || 0, ts: cur.ts }).catch(() => {});
  }

  // Push the full node immediately (used when pet/color/outfit change — those
  // aren't part of the movement delta-gate so they need an explicit write).
  function forceUpdate(me) {
    if (!rtdb || !uid || !myRef) return;
    const node = serialize(me);
    lastSent = { x: node.x, y: node.y, facing: node.facing, action: node.action, actionTs: node.actionTs, ts: node.ts };
    myRef.update(node).catch(() => {});
  }

  function sendChat(text) {
    if (!rtdb || !uid) return false;
    try { base().child('chat').push({ uid: uid, name: getName(), text: text, ts: nowMs() }); return true; }
    catch (e) { return false; }
  }

  // Moderation report → Firestore (reviewable in admin.html).
  function reportUser(targetUid, text) {
    if (!db || !uid) return;
    try {
      db.collection('moderation_reports').add({
        reporterUid: uid, targetUid: targetUid || '', scene: scene,
        text: (text || '').slice(0, 200), ts: nowMs(),
      }).catch(() => {});
    } catch (e) {}
  }

  function getRemotes() { return remotes; }

  // ── Shared kickable floaties ──
  // The latest kick snapshot for one floaty in this shard (or null). world-ball.js
  // turns it into a live position via world-logic.ballState.
  function getBall(id) { return (ballsVal && ballsVal[id]) || null; }
  // Publish a new kick snapshot for one floaty. One tiny write per kick; every
  // client's listener picks it up and renders the same trajectory.
  function kickBall(id, snap) {
    if (!rtdb || !uid || !myRef || !id) return;
    // .set() rejects ASYNChronously on permission-denied (e.g. the balls rule not
    // yet deployed); the .catch keeps that a silent no-op like every other write
    // here, so the floaty just rolls locally instead of logging on every kick.
    try { base().child('balls').child(id).set(snap).catch(() => {}); } catch (e) {}
  }

  // ── Pinned notes ──
  // The shard's persisted notes (each { uid,name,text,x,y,ts }), oldest→newest.
  function getNotes() { return notesVal; }
  // Pin a note at (x,y). One push per pin; the listener echoes it to every client.
  // Silent no-op on denied writes (rule not deployed) — the pin still shows locally.
  function pinNote(text, x, y) {
    if (!rtdb || !uid || !myRef) return false;
    try { base().child('notes').push({ uid: uid, name: getName(), text: text, x: r3(x), y: r3(y), ts: nowMs() }); return true; }
    catch (e) { return false; }
  }

  function leave() {
    clearInterval(heartbeat); heartbeat = null;
    try { if (playersRef && playersCb) playersRef.off('value', playersCb); } catch (e) {}
    try { if (chatRef && chatCb) chatRef.off('value', chatCb); } catch (e) {}
    try { if (ballsRef && ballsCb) ballsRef.off('value', ballsCb); } catch (e) {}
    try { if (notesRef && notesCb) notesRef.off('value', notesCb); } catch (e) {}
    try { if (myRef) { myRef.onDisconnect().cancel(); myRef.remove(); } } catch (e) {}
    playersRef = chatRef = playersCb = chatCb = myRef = null;
    ballsRef = ballsCb = null; ballsVal = {};
    notesRef = notesCb = null; notesVal = [];
    Object.keys(remotes).forEach(k => delete remotes[k]);
  }

  async function switchScene(sceneId, me) { leave(); return join(sceneId, me); }

  function init(opts) {
    db = opts.db || null; uid = opts.uid || null;
    getName = opts.getName || getName;
    onRemotes = opts.onRemotes || onRemotes;
    onChat = opts.onChat || onChat;
    onDiag = opts.onDiag || onDiag;
    // RTDB is optional — guard exactly like coin-rush.js.
    try { rtdb = (firebase && firebase.database) ? firebase.database() : null; } catch (e) { rtdb = null; }
    if (!rtdb) { onDiag({ type: 'conn', connected: false, reason: 'no-rtdb' }); }
    else {
      // Learn the client↔server clock offset so timing is consistent across players.
      try { rtdb.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; }); } catch (e) {}
      // Live connection state so the UI can show whether we actually reached the DB.
      try { rtdb.ref('.info/connected').on('value', s => onDiag({ type: 'conn', connected: !!(s && s.val()) })); } catch (e) {}
    }
    // Clean our node if the tab is closed mid-session (belt-and-suspenders to onDisconnect).
    window.addEventListener('beforeunload', () => { try { if (myRef) myRef.remove(); } catch (e) {} });
    return { online: !!rtdb };
  }

  return { init, join, leave, switchScene, writeState, forceUpdate, sendChat, reportUser, getRemotes, getBall, kickBall, getNotes, pinNote, serverNow: nowMs };
})();
