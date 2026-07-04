/* ════════════════════════════════════════════════════════════════
   world-notes.js — "leave a trace" pinned notes. Tap 📌, type a short kind line,
   and it pins a little folded-note card at your pet's feet. It STAYS (unlike a
   chat bubble), so later visitors discover it hot/cold: the card fades in as you
   wander near, then blooms open into a readable speech bubble once you're close.

   Text runs through the SAME moderation as chat (moderateMessage + WORLD_CHAT.banned),
   so there's no new safety surface. Notes persist per scene-shard in RTDB
   (world-net getNotes/pinNote, aged out by limitToLast). A pin is added optimistically
   to a local list first, so it shows instantly and still appears even if the shared
   write is denied (rule not deployed) — solo/local fallback, exactly like the ball.
   Pure discovery math (sparkleGlow) is reused from world-logic.
   ════════════════════════════════════════════════════════════════ */
const WorldNotes = (function () {
  let serverNow = function () { return Date.now(); };
  let getNotes = function () { return []; };
  let pinNoteNet = function () { return false; };
  let flashHint = function () {};
  let myUid = null;
  let mine = [];          // optimistic notes I pinned this session: {uid,name,text,x,y,ts,scene}
  let lastPinAt = 0;

  function cfg() {
    return (typeof WORLD_NOTES !== 'undefined') ? WORLD_NOTES
      : { maxLen: 80, discoverRadius: 0.30, revealRadius: 0.14, historyLimit: 20, cooldownMs: 4000 };
  }
  function bannedList() { return (typeof WORLD_CHAT !== 'undefined' && WORLD_CHAT.banned) || []; }

  function init(opts) {
    serverNow = opts.serverNow || serverNow;
    getNotes = opts.getNotes || getNotes;
    pinNoteNet = opts.pinNote || pinNoteNet;
    flashHint = opts.flashHint || flashHint;
    myUid = opts.myUid || null;
  }

  function keyOf(n) { return (n.uid || '') + ':' + (n.ts || 0); }

  // Notes to render for the current scene: the shard's shared notes (already this
  // scene by construction) plus my optimistic ones not yet echoed back, deduped.
  function notesForScene(sceneId) {
    const net = getNotes() || [];
    const seen = {};
    net.forEach(function (n) { if (n) seen[keyOf(n)] = true; });
    mine = mine.filter(function (n) { return !seen[keyOf(n)]; }); // drop optimistic once shared echoes it
    const localHere = mine.filter(function (n) { return n.scene === sceneId; });
    return net.concat(localHere);
  }

  // Pin the composer text at the player's current position. Returns true on success.
  function pin(rawText, me) {
    const c = cfg();
    const now = serverNow();
    if (now - lastPinAt < c.cooldownMs) { flashHint('Give it a moment before pinning again ⏳'); return false; }
    const mod = moderateMessage(rawText, { maxLen: c.maxLen, banned: bannedList() });
    if (!mod.ok) { flashHint(mod.reason === 'blocked' ? "Let's keep notes kind 🌸" : 'Write a little something first ✍️'); return false; }
    lastPinAt = now;
    mine.push({ uid: myUid, name: (me && me.name) || 'Pet', text: mod.text, x: me.x, y: me.y, ts: now, scene: me.scene });
    pinNoteNet(mod.text, me.x, me.y); // shared write; silent no-op if denied → the note stays local
    flashHint('📌 Note pinned! Others will find it here.');
    return true;
  }

  // ── Draw ──
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
  function wrapText(ctx, text, maxW) {
    const words = String(text).split(' ');
    const lines = []; let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // A folded-paper card with a pushpin — the discoverable anchor on the ground.
  function drawCard(ctx, px, py, ds, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    const w = ds * 18, h = ds * 13, x = px - w / 2, y = py - h - ds * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath(); ctx.ellipse(px, py + ds * 2, w * 0.5, ds * 3, 0, 0, Math.PI * 2); ctx.fill();
    roundRectPath(ctx, x, y, w, h, ds * 2.5); ctx.fillStyle = '#fff6dd'; ctx.fill();
    ctx.fillStyle = 'rgba(208,178,118,0.9)';
    ctx.beginPath(); ctx.moveTo(x + w - ds * 5, y); ctx.lineTo(x + w, y + ds * 5); ctx.lineTo(x + w - ds * 5, y + ds * 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,120,80,0.35)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + ds * 3, y + h * i / 3); ctx.lineTo(x + w - ds * 3, y + h * i / 3); ctx.stroke(); }
    ctx.fillStyle = '#e5533b'; ctx.beginPath(); ctx.arc(px, y, ds * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(px - ds * 0.8, y - ds * 0.8, ds * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // The message itself, blooming open above the card as you get close. `alpha`
  // saturates to opaque at a comfortable reading distance (not only dead-centre);
  // `scale` gives the little bloom-in pop.
  function drawBubble(ctx, px, py, ds, alpha, scale, text, name) {
    ctx.save();
    const fontPx = Math.max(11, Math.round(ds * 13));
    ctx.font = fontPx + 'px "Noto Sans SC", sans-serif';
    const maxW = 150;
    const lines = wrapText(ctx, text, maxW);
    let tw = 0; for (let i = 0; i < lines.length; i++) tw = Math.max(tw, ctx.measureText(lines[i]).width);
    const padX = 10, padY = 8, lineH = fontPx * 1.25, nameH = name ? fontPx * 0.95 : 0;
    const bw = Math.min(maxW, tw) + padX * 2, bh = lines.length * lineH + nameH + padY * 2;
    const cardTop = py - ds * 15, by = cardTop - bh - ds * 4, bx = px - bw / 2;
    const sc = scale;
    ctx.globalAlpha = alpha;
    ctx.translate(px, by + bh); ctx.scale(sc, sc); ctx.translate(-px, -(by + bh)); // bloom about the tail
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    roundRectPath(ctx, bx, by, bw, bh, 10); ctx.fillStyle = '#fff8e6'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.moveTo(px - 7, by + bh - 1); ctx.lineTo(px + 7, by + bh - 1); ctx.lineTo(px, by + bh + 9); ctx.closePath(); ctx.fillStyle = '#fff8e6'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,40,0.22)'; ctx.lineWidth = 1.5; roundRectPath(ctx, bx, by, bw, bh, 10); ctx.stroke();
    ctx.fillStyle = '#5b4630'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = fontPx + 'px "Noto Sans SC", sans-serif';
    let ty = by + padY;
    for (let i = 0; i < lines.length; i++) { ctx.fillText(lines[i], px, ty); ty += lineH; }
    if (name) { ctx.fillStyle = 'rgba(120,90,40,0.7)'; ctx.font = ((fontPx * 0.8) | 0) + 'px sans-serif'; ctx.fillText('— ' + name, px, ty + 2); }
    ctx.restore();
  }

  function draw(ctx, W, H, t, me, sceneId) {
    if (!me) return;
    const c = cfg();
    const notes = notesForScene(sceneId).slice();
    // Nearest last so a close bubble draws over farther ones.
    notes.sort(function (a, b) { return worldDist(b, me) - worldDist(a, me); });
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], dist = worldDist(me, n);
      const show = sparkleGlow(dist, c.discoverRadius);
      if (show <= 0) continue;                       // hidden until you wander near
      const reveal = sparkleGlow(dist, c.revealRadius);
      const bloom = Math.min(1, reveal * 1.6);       // bloom-in pop
      const alpha = Math.min(1, reveal * 2.2);       // readable well before dead-centre
      const px = n.x * W, py = n.y * H, ds = depthScale(n.y);
      drawCard(ctx, px, py, ds, Math.min(1, show * 1.7) * (1 - 0.5 * bloom)); // bolder pin; recedes as the bubble blooms
      if (reveal > 0.01) drawBubble(ctx, px, py, ds, alpha, 0.85 + 0.15 * bloom, n.text, n.name);
    }
  }

  return { init, pin, draw };
})();
