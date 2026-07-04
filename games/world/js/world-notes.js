/* ════════════════════════════════════════════════════════════════
   world-notes.js — the community NOTES BOARD. Each scene has a physical notice
   board (drawn here as a scene prop). Walk up to it and open it, and the whole
   board fills the screen (that UI lives in world-core) showing everyone's notes
   as sticky notes you can page through, plus a box to add your own and a close
   button. Notes are NOT drawn on the floor — only on the board.

   This module owns the DATA + the board prop:
     - list(sceneId): every note for that scene (shared + my optimistic ones),
       newest first, for the board grid.
     - pin(text, me): moderate (same rules as chat) + write; returns {ok,reason}.
     - drawBoard(...): the little notice-board prop in the scene, with a ✍️ hint
       when the player is near.
   Notes persist per scene-shard in RTDB (world-net getNotes/pinNote, kept to the
   last historyLimit). A pin is added optimistically first, so it shows instantly
   and survives a denied shared write (solo/local fallback, like the ball).
   ════════════════════════════════════════════════════════════════ */
const WorldNotes = (function () {
  let serverNow = function () { return Date.now(); };
  let getNotes = function () { return []; };
  let pinNoteNet = function () { return false; };
  let myUid = null;
  let mine = [];          // optimistic notes I added this session: {uid,name,text,x,y,ts,scene}
  let lastPinAt = 0;

  function cfg() {
    return (typeof WORLD_NOTES !== 'undefined') ? WORLD_NOTES
      : { maxLen: 80, historyLimit: 300, perPage: 8, cooldownMs: 4000, boardRadius: 0.09, boards: {} };
  }
  function bannedList() { return (typeof WORLD_CHAT !== 'undefined' && WORLD_CHAT.banned) || []; }

  function init(opts) {
    serverNow = opts.serverNow || serverNow;
    getNotes = opts.getNotes || getNotes;
    pinNoteNet = opts.pinNote || pinNoteNet;
    myUid = opts.myUid || null;
  }

  function keyOf(n) { return (n.uid || '') + ':' + (n.ts || 0); }

  // Every note for a scene: the shard's shared notes (already this scene by
  // construction) plus my optimistic ones not yet echoed back, deduped.
  function notesForScene(sceneId) {
    const net = getNotes() || [];
    const seen = {};
    net.forEach(function (n) { if (n) seen[keyOf(n)] = true; });
    mine = mine.filter(function (n) { return !seen[keyOf(n)]; }); // drop optimistic once shared echoes it
    const localHere = mine.filter(function (n) { return n.scene === sceneId; });
    return net.concat(localHere);
  }

  // Newest-first list for the board UI.
  function list(sceneId) {
    return notesForScene(sceneId).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }

  // Moderate + add a note. Returns { ok, note?, reason? } so the board UI can show
  // inline feedback ('empty' | 'blocked' | 'cooldown').
  function pin(rawText, me) {
    const c = cfg(), now = serverNow();
    if (now - lastPinAt < c.cooldownMs) return { ok: false, reason: 'cooldown' };
    const mod = moderateMessage(rawText, { maxLen: c.maxLen, banned: bannedList() });
    if (!mod.ok) return { ok: false, reason: mod.reason }; // 'empty' | 'blocked'
    lastPinAt = now;
    const note = { uid: myUid, name: (me && me.name) || 'Pet', text: mod.text, x: me.x, y: me.y, ts: now, scene: me.scene };
    mine.push(note);
    // Pass `now` so the shared write carries the SAME ts as this optimistic note;
    // keyOf() dedups on uid:ts, so the RTDB echo collapses onto this one (no double).
    pinNoteNet(mod.text, me.x, me.y, now); // shared write; silent no-op if denied → stays local
    return { ok: true, note: note };
  }

  // ── Board prop drawn in the scene ──
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function boardFor(sceneId) {
    return (typeof WORLD_NOTES !== 'undefined' && WORLD_NOTES.boards) ? (WORLD_NOTES.boards[sceneId] || null) : null;
  }

  // The scene's notice board (framed cork board on two posts with pinned
  // sticky-notes). Drawn UNDER the pets so they can stand in front. When the
  // player is near, a ✍️ bobs above it inviting them to open it.
  function drawBoard(ctx, W, H, t, sceneId, near) {
    const b = boardFor(sceneId); if (!b) return;
    const px = b.x * W, py = b.y * H, ds = depthScale(b.y);
    const w = ds * 60, h = ds * 44, x = px - w / 2, top = py - ds * 66;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(px, py, w * 0.48, ds * 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a9743f';
    roundRectPath(ctx, px - ds * 24, top + h - ds * 6, ds * 6, ds * 74, ds * 2); ctx.fill();
    roundRectPath(ctx, px + ds * 18, top + h - ds * 6, ds * 6, ds * 74, ds * 2); ctx.fill();
    roundRectPath(ctx, x, top, w, h, ds * 5); ctx.fillStyle = '#e8c79a'; ctx.fill();       // cork panel
    ctx.lineWidth = ds * 3; ctx.strokeStyle = '#a9743f'; roundRectPath(ctx, x, top, w, h, ds * 5); ctx.stroke(); // frame
    roundRectPath(ctx, x + ds * 3, top + ds * 3, w - ds * 6, ds * 10, ds * 2.5); ctx.fillStyle = '#e5533b'; ctx.fill(); // header
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.max(8, (ds * 8) | 0) + 'px "Noto Sans SC", sans-serif';
    ctx.fillText('📋 NOTES', px, top + ds * 8.4);
    const stickies = [['#bfe3ff', ds * 6, ds * 17], ['#ffe6a8', ds * 24, ds * 19], ['#ffc9d6', ds * 40, ds * 17]];
    for (let i = 0; i < stickies.length; i++) {
      const s = stickies[i];
      roundRectPath(ctx, x + s[1], top + s[2], ds * 13, ds * 12, ds * 1.5); ctx.fillStyle = s[0]; ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,40,0.25)'; ctx.lineWidth = 1;
      for (let ln = 1; ln <= 2; ln++) { ctx.beginPath(); ctx.moveTo(x + s[1] + ds * 2, top + s[2] + ds * 4 * ln); ctx.lineTo(x + s[1] + ds * 11, top + s[2] + ds * 4 * ln); ctx.stroke(); }
      ctx.fillStyle = ['#e5533b', '#3b7dd8', '#3bab5e'][i]; ctx.beginPath(); ctx.arc(x + s[1] + ds * 6.5, top + s[2] + ds * 1.5, ds * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    if (near) {
      const bob = Math.sin(t / 300) * ds * 2;
      ctx.globalAlpha = 0.95; ctx.font = Math.max(15, (ds * 17) | 0) + 'px serif';
      ctx.fillText('✍️', px, top - ds * 12 + bob);
    }
    ctx.restore();
  }

  return { init, pin, list, drawBoard };
})();
