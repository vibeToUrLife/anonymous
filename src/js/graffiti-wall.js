/**
 * graffiti-wall.js — ✏️ 涂鸦墙: a SHARED drawing layer behind the bubble board.
 *
 * The wall canvas sits behind the page content (z-index:-1, faded) where
 * everyone's strokes render live. Clicking ✏️ 涂鸦墙 enters DRAW MODE: the
 * same canvas rises above the board, a toolbar appears (colors / brush /
 * undo-my-last / done) and your finger paints; ✓ 完成 (or Esc) drops it back
 * to being wallpaper. Board buttons never fight the pen — drawing only
 * happens in draw mode.
 *
 * The wall is anchored to the DOCUMENT, not the screen: a stroke's Y is stored
 * as absolute CSS pixels from the top of the page (NOT viewport-heights, so a
 * drawing keeps the same page position whatever the viewer's window height),
 * so scrolling moves through the drawing like real wallpaper (it does NOT stick
 * to the viewport). The bitmap stays viewport-sized and fixed for memory's
 * sake; every stroke is rendered offset by the current scroll position and the
 * layer repaints (throttled) as you scroll.
 *
 * Sync: each finished stroke is ONE tiny RTDB write under
 * wall/{localDay}/strokes (compact string format from wall-logic.js); clients
 * subscribe with limitToLast(MAX_STROKES) and paint child_added strokes
 * incrementally, so idle cost is zero and the wall resets itself daily.
 * Undo deletes your own last stroke (rules allow author-delete only).
 *
 * Depends on firebase + auth from app.js and WallLogic. If RTDB is
 * unavailable the toggle hides itself. Feature flag: wall (#wallToggle).
 */
(function () {
  'use strict';

  if (typeof firebase === 'undefined' || typeof auth === 'undefined') return;
  const WL = (typeof WallLogic !== 'undefined') ? WallLogic : null;
  const toggle = document.getElementById('wallToggle');
  if (!WL || !toggle) return;

  let rtdb = null;
  try { rtdb = firebase.database ? firebase.database() : null; } catch (e) { rtdb = null; }
  if (!rtdb) { toggle.style.display = 'none'; return; }

  function disabled() { return window.FEATURES && window.FEATURES.wall === false; }
  function localDay() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ── Canvas (one layer: wallpaper ↔ drawing surface) ─────── */
  const canvas = document.createElement('canvas');
  canvas.className = 'wall-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1;

  function fitCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    // <canvas> is a replaced element: inset:0 does NOT stretch it, so without
    // an explicit CSS size it would display at its bitmap size (dpr× the
    // viewport on hi-DPI screens) and the pen would land offset from the
    // finger. Pin the CSS size to the viewport so 1 CSS px = 1 client px.
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    redraw();
  }

  /* ── Stroke store (mirrors the RTDB window of newest strokes) ── */
  const strokes = new Map();      // pushKey → {c,w,pts:[{x,y}],minY,maxY}
  const order = [];               // pushKey[] in arrival order
  const myKeys = [];              // my strokes this session (undo stack)

  // Document → screen: x is a width fraction; y is absolute CSS px from the
  // top of the page, so subtracting the scroll makes it scroll with content.
  function scrX(nx) { return nx * window.innerWidth; }
  function scrY(ny) { return ny - window.scrollY; }

  // Build the render record for a wire stroke, caching its Y bounds (in px)
  // so redraw() can skip strokes that aren't on screen. `by` is kept so the
  // eraser can hit-test only the current user's own strokes.
  function makeStroke(v) {
    const pts = WL.unpackPoints(v.p);
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    return { c: v.c, w: v.w, by: v.by, pts: pts, minY: minY, maxY: maxY };
  }

  const CULL_PAD = Math.max.apply(null, WL.WIDTHS) / 2;   // widest brush half

  function drawStroke(s) {
    const pts = s.pts;
    if (!pts.length) return;
    // Cull: skip strokes whose vertical span isn't in the viewport right now.
    // Pad by half the max brush width so a thick stroke's halo (or a dot's
    // radius) still paints when its centre sits just off the edge. minY/maxY
    // are absolute document px, matching top/bottom below.
    const top = window.scrollY, bottom = top + window.innerHeight;
    if (s.maxY < top - CULL_PAD || s.minY > bottom + CULL_PAD) return;
    // c is a packed RGB int now; intToHex clamps any crafted value safely.
    const wi = Math.abs(Math.floor(s.w) || 0) % WL.WIDTHS.length;
    ctx.strokeStyle = ctx.fillStyle = WL.intToHex(s.c);
    const w = WL.WIDTHS[wi];
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(scrX(pts[0].x), scrY(pts[0].y), w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(scrX(pts[0].x), scrY(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(scrX(pts[i].x), scrY(pts[i].y));
    ctx.stroke();
  }

  function redraw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    order.forEach((k) => { const s = strokes.get(k); if (s) drawStroke(s); });
  }

  // Repaint on scroll so the wall tracks the page. rAF-throttled; the bitmap
  // is viewport-sized and off-screen strokes are culled, so this stays cheap.
  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      (shapeKind && shapeAnchor) ? drawShapePreview() : redraw();
    });
  }

  /* ── RTDB subscription (per local day; re-attached at rollover) ── */
  let ref = null, addedCb = null, removedCb = null;
  let day = '';

  function subscribe() {
    unsubscribe();
    day = localDay();
    strokes.clear(); order.length = 0;
    redraw();
    ref = rtdb.ref('wall/' + day + '/strokes').limitToLast(WL.MAX_STROKES);
    addedCb = ref.on('child_added', (snap) => {
      const v = snap.val();
      if (!WL.validStroke(v) || strokes.has(snap.key)) return;
      const s = makeStroke(v);
      strokes.set(snap.key, s);
      order.push(snap.key);
      drawStroke(s);                       // incremental — no full repaint
    }, () => {
      // Read denied (rules not deployed yet / signed out): listeners are
      // cancelled for good — drop ref so a later auth change re-subscribes,
      // and never let draw mode pretend to work.
      unsubscribe();
      wallUnavailable();
    });
    removedCb = ref.on('child_removed', (snap) => {
      if (!strokes.delete(snap.key)) return;
      const i = order.indexOf(snap.key);
      if (i >= 0) order.splice(i, 1);
      redraw();
    });
  }

  function unsubscribe() {
    if (ref) {
      if (addedCb) ref.off('child_added', addedCb);
      if (removedCb) ref.off('child_removed', removedCb);
    }
    ref = null; addedCb = null; removedCb = null;
  }

  function wallUnavailable() {
    if (drawMode) exitDraw();
    // Signed-out cancels arrive through the same path — only a signed-in
    // user should hear about missing rules, and only once.
    if (unavailableToasted || !myUid) return;
    unavailableToasted = true;
    if (typeof showToast === 'function') {
      showToast('涂鸦墙暂时不可用（数据库规则还没更新）', 'error');
    }
  }

  let myUid = null;
  auth.onAuthStateChanged((u) => {
    myUid = u ? u.uid : null;
    // Sign-out cancels the RTDB listeners server-side; a fresh sign-in must
    // re-subscribe from scratch (subscribe() is re-entry safe).
    if (myUid) subscribe();
    else unsubscribe();
  });
  setInterval(() => {                      // daily reset for a long-lived tab
    if (ref && day !== localDay()) subscribe();
  }, 60000);

  /* ── Draw mode ───────────────────────────────────────────── */
  let drawMode = false;
  let toolbar = null;
  let colorHex = WL.COLORS[5];             // current ink (lilac); any RGB allowed
  let widthIdx = 1;                        // brush size index
  let erasing = false;                     // eraser mode: drag removes MY strokes
  let eraserBtn = null;                    // toolbar ref (highlight toggle)
  let stroke = null;                       // in-progress draw: [{x,y} doc coords]
  let lastPx = null;                       // last sampled point in screen px
  let activePid = null;                    // the one pointer that owns the gesture
  let unavailableToasted = false;          // "rules not deployed" — say it once
  let shapeKind = null;                    // null = free-hand pen; else 'line'|'rect'|'circle'|'triangle'
  let shapeAnchor = null;                  // 1st click of a shape, in DOC coords (scroll-safe)
  let shapePreviewPx = null;               // last pointer pos (screen px) for the rubber-band
  let shapeRow = null;                     // toolbar shapes row (highlight toggle)
  let hintEl = null;                       // toolbar hint line (retargets per tool)
  let shapePreviewRaf = 0;                 // rAF handle throttling the preview repaint
  const SHAPE_MIN_PX = 6;                  // 2nd click nearer than this = too small → cancel

  const HINT_PEN   = '✏️ 画在留言板背景上 · 大家都看得到 · 每天自动清空';
  const HINT_SHAPE = '⬡ 点一下定起点，再点一下完成 · Esc / 右键取消';
  const HINT_ERASE = '🧽 拖动擦掉我自己画的';
  function updateHint() {
    if (hintEl) hintEl.textContent = erasing ? HINT_ERASE : (shapeKind ? HINT_SHAPE : HINT_PEN);
  }

  // Highlight the active shape button ('pen' == free-hand). Safe before the row exists.
  function highlightShapes(kind) {
    if (!shapeRow) return;
    shapeRow.querySelectorAll('.wall-shape').forEach((b) =>
      b.classList.toggle('sel', b.dataset.shape === (kind || 'pen')));
  }

  // Drop a half-drawn shape (anchor placed, waiting for the 2nd click).
  function cancelShape() {
    if (!shapeAnchor) return;
    shapeAnchor = null; shapePreviewPx = null;
    redraw();
  }

  function setErasing(on) {
    erasing = on;
    if (on) { stroke = null; shapeKind = null; cancelShape(); highlightShapes(null); }
    canvas.classList.toggle('erasing', on);
    canvas.classList.toggle('shaping', !!shapeKind);
    if (eraserBtn) eraserBtn.classList.toggle('sel', on);
    updateHint();
  }

  // Pick a drawing tool: null = free-hand pen, else a shape kind.
  function setShape(kind) {
    if (erasing) setErasing(false);         // leaving the eraser
    shapeKind = kind;
    cancelShape();
    highlightShapes(kind);
    canvas.classList.toggle('shaping', !!kind);
    updateHint();
  }

  // Delete every one of MY strokes whose ink passes under the eraser at this
  // screen point. child_removed → strokes.delete + redraw handle the repaint;
  // the rules only permit deleting your own strokes, so this is author-scoped.
  function eraseAt(cx, cy) {
    const rBase = WL.ERASER_R;
    order.slice().forEach((k) => {
      const s = strokes.get(k);
      if (!s || s.by !== myUid) return;
      const pts = s.pts;
      if (!pts.length) return;
      const wHalf = WL.WIDTHS[Math.abs(Math.floor(s.w) || 0) % WL.WIDTHS.length] / 2;
      const thr = (rBase + wHalf) * (rBase + wHalf);
      let hit = WL.dist2(scrX(pts[0].x), scrY(pts[0].y), cx, cy) <= thr;   // covers a dot
      for (let i = 1; !hit && i < pts.length; i++) {                       // and the lines
        hit = WL.distToSeg2(cx, cy,
          scrX(pts[i - 1].x), scrY(pts[i - 1].y),
          scrX(pts[i].x), scrY(pts[i].y)) <= thr;
      }
      if (hit) rtdb.ref('wall/' + day + '/strokes/' + k).remove().catch(() => {});
    });
  }

  function buildToolbar() {
    toolbar = document.createElement('div');
    toolbar.className = 'wall-toolbar';
    const hint = document.createElement('div');
    hint.className = 'wall-hint';
    hintEl = hint;                          // updateHint() retargets it per tool
    toolbar.appendChild(hint);

    const row = document.createElement('div');
    row.className = 'wall-row';
    function selectColor(hex, el) {
      colorHex = hex;
      setErasing(false);
      row.querySelectorAll('.wall-swatch').forEach(x => x.classList.remove('sel'));
      if (el) el.classList.add('sel');
    }
    WL.COLORS.forEach((c) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'wall-swatch' + (c === colorHex ? ' sel' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => selectColor(c, sw));
      row.appendChild(sw);
    });
    // Custom RGB picker — a rainbow chip wrapping a native colour input.
    const custom = document.createElement('label');
    custom.className = 'wall-swatch wall-custom';
    custom.title = '自定义颜色';
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : '#ffffff';
    picker.addEventListener('input', () => selectColor(picker.value, null));
    custom.appendChild(picker);
    row.appendChild(custom);
    toolbar.appendChild(row);

    // Shape tools: ✏️ free-hand pen + the four outline shapes. A shape draws
    // with the current colour + brush width, then commits as a normal stroke.
    shapeRow = document.createElement('div');
    shapeRow.className = 'wall-row wall-shape-row';
    [['pen', '✏️', '画笔（自由涂鸦）'],
     ['line', '╱', '直线'],
     ['rect', '▭', '矩形'],
     ['circle', '◯', '圆形'],
     ['triangle', '△', '三角形']].forEach(([k, glyph, title]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wall-shape' + ((shapeKind || 'pen') === k ? ' sel' : '');
      b.dataset.shape = k;
      b.title = title;
      b.textContent = glyph;
      b.addEventListener('click', () => setShape(k === 'pen' ? null : k));
      shapeRow.appendChild(b);
    });
    toolbar.appendChild(shapeRow);

    const row2 = document.createElement('div');
    row2.className = 'wall-row';
    WL.WIDTHS.forEach((w, i) => {
      const bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'wall-brush' + (i === widthIdx ? ' sel' : '');
      bt.innerHTML = '<i style="width:' + w + 'px;height:' + w + 'px"></i>';
      bt.addEventListener('click', () => {
        widthIdx = i;
        row2.querySelectorAll('.wall-brush').forEach(x => x.classList.remove('sel'));
        bt.classList.add('sel');
      });
      row2.appendChild(bt);
    });
    eraserBtn = document.createElement('button');
    eraserBtn.type = 'button';
    eraserBtn.className = 'wall-tool wall-eraser';
    eraserBtn.title = '橡皮擦 — 擦掉我自己画的';
    eraserBtn.textContent = '🧽';
    eraserBtn.addEventListener('click', () => setErasing(!erasing));
    row2.appendChild(eraserBtn);
    const undoBt = document.createElement('button');
    undoBt.type = 'button';
    undoBt.className = 'wall-tool';
    undoBt.title = '撤销我画的上一笔';
    undoBt.textContent = '↩️';
    undoBt.addEventListener('click', undoMine);
    row2.appendChild(undoBt);
    const doneBt = document.createElement('button');
    doneBt.type = 'button';
    doneBt.className = 'wall-done';
    doneBt.textContent = '✓ 完成';
    doneBt.addEventListener('click', exitDraw);
    row2.appendChild(doneBt);
    toolbar.appendChild(row2);
    document.body.appendChild(toolbar);
    updateHint();                          // sync the hint with the current tool
  }

  function enterDraw() {
    if (drawMode || disabled() || !myUid) return;
    drawMode = true;
    document.body.classList.add('wall-drawing');
    canvas.classList.add('drawing');
    toggle.classList.add('active');
    buildToolbar();
  }

  function exitDraw() {
    if (!drawMode) return;
    drawMode = false;
    endStroke();                            // commit anything mid-flight
    setErasing(false);
    shapeKind = null; shapeAnchor = null; shapePreviewPx = null;
    if (shapePreviewRaf) { cancelAnimationFrame(shapePreviewRaf); shapePreviewRaf = 0; }
    activePid = null; lastPx = null;
    eraserBtn = null; shapeRow = null; hintEl = null;
    document.body.classList.remove('wall-drawing');
    canvas.classList.remove('drawing', 'shaping');
    toggle.classList.remove('active');
    if (toolbar) { toolbar.remove(); toolbar = null; }
  }

  function undoMine() {
    const m = myKeys.pop();
    if (!m) {
      if (typeof showToast === 'function') showToast('没有可以撤销的笔画了');
      return;
    }
    // Each entry remembers its own day, so undo still works right after
    // midnight (author-delete is allowed on any day's wall).
    rtdb.ref('wall/' + m.day + '/strokes/' + m.key).remove().catch(() => {});
  }

  // Screen point → stored document point ({x: width fraction, y: px-from-top}).
  function docPoint(e) {
    return {
      x: e.clientX / window.innerWidth,
      y: e.clientY + window.scrollY
    };
  }
  // Same mapping for a synthetic (shape) point already in screen px.
  function screenToDoc(px, py) {
    return { x: px / window.innerWidth, y: py + window.scrollY };
  }

  /* ── Shape placement (two-click) ─────────────────────────── */
  // 1st click drops the anchor; 2nd builds the outline between the two points
  // (in screen px, so it stays true to shape), maps it to doc coords, commits.
  function handleShapeClick(e) {
    if (!shapeAnchor) {                       // first click — remember the start
      shapeAnchor = docPoint(e);
      shapePreviewPx = { x: e.clientX, y: e.clientY };
      drawShapePreview();                     // leave a start marker right away
      return;
    }
    const ax = scrX(shapeAnchor.x), ay = scrY(shapeAnchor.y);
    shapeAnchor = null; shapePreviewPx = null;
    // Too tiny → treat as a mis-click, not a speck of a shape.
    if (WL.dist2(ax, ay, e.clientX, e.clientY) < SHAPE_MIN_PX * SHAPE_MIN_PX) { redraw(); return; }
    const scr = WL.shapePoints(shapeKind, ax, ay, e.clientX, e.clientY);
    redraw();                                 // wipe the dashed preview
    if (scr.length > 1) {                     // instant local ink; the RTDB echo overdraws it
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = WL.WIDTHS[widthIdx];
      ctx.beginPath();
      ctx.moveTo(scr[0].x, scr[0].y);
      for (let i = 1; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
      ctx.stroke();
    }
    commitPoints(scr.map((p) => screenToDoc(p.x, p.y)));
  }

  function scheduleShapePreview() {
    if (!shapePreviewRaf) shapePreviewRaf = requestAnimationFrame(drawShapePreview);
  }

  // Repaint the wall, then the shape-in-progress on top: a dashed rubber-band
  // once the pointer has moved, or a solid start-dot before it has (which is
  // all a touch tap ever shows, since there's no hover between the two taps).
  function drawShapePreview() {
    shapePreviewRaf = 0;
    redraw();
    if (!shapeKind || !shapeAnchor) return;
    const ax = scrX(shapeAnchor.x), ay = scrY(shapeAnchor.y);
    const b = shapePreviewPx || { x: ax, y: ay };
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = colorHex;
    if (WL.dist2(ax, ay, b.x, b.y) < SHAPE_MIN_PX * SHAPE_MIN_PX) {
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(3, WL.WIDTHS[widthIdx] / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pts = WL.shapePoints(shapeKind, ax, ay, b.x, b.y);
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = WL.WIDTHS[widthIdx];
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* pen input (only reaches the canvas in draw mode — pointer-events CSS) */
  canvas.addEventListener('pointerdown', (e) => {
    if (!drawMode || !e.isPrimary || activePid !== null) return;  // one gesture at a time
    e.preventDefault();
    if (shapeKind) { handleShapeClick(e); return; }               // two-click shape, no drag
    activePid = e.pointerId;
    lastPx = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (erasing) { eraseAt(e.clientX, e.clientY); return; }
    stroke = [docPoint(e)];
    // instant dot — a tap should leave ink right away, not after the echo
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(e.clientX, e.clientY, WL.WIDTHS[widthIdx] / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawMode) return;
    if (shapeKind && shapeAnchor) {           // live rubber-band (mouse hover between clicks)
      shapePreviewPx = { x: e.clientX, y: e.clientY };
      scheduleShapePreview();
      return;
    }
    if (e.pointerId !== activePid || !lastPx) return;
    if (WL.dist2(lastPx.x, lastPx.y, e.clientX, e.clientY) < WL.MIN_MOVE_PX * WL.MIN_MOVE_PX) return;
    if (erasing) { eraseAt(e.clientX, e.clientY); lastPx = { x: e.clientX, y: e.clientY }; return; }
    if (!stroke) return;
    // Live segment drawn in screen space (echo repaints identically — the
    // stroke is opaque so the overdraw is invisible).
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = WL.WIDTHS[widthIdx];
    ctx.beginPath();
    ctx.moveTo(lastPx.x, lastPx.y);
    ctx.lineTo(e.clientX, e.clientY);
    ctx.stroke();
    stroke.push(docPoint(e));
    lastPx = { x: e.clientX, y: e.clientY };
    if (stroke.length >= WL.MAX_POINTS) {   // very long stroke → split seamlessly
      endStroke();
      stroke = [docPoint(e)];               // same drag continues into a new stroke
      lastPx = { x: e.clientX, y: e.clientY };
    }
  });

  function release(e) {
    if (e.pointerId !== activePid) return;  // a resting second finger lifting
    activePid = null;
    lastPx = null;
    if (!erasing) endStroke();              // erasing commits live, nothing to flush
    stroke = null;                          // never let an abandoned draw linger
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  // The OS long-press menu has no business on a drawing surface; a right-click
  // there instead aborts a shape waiting for its second click.
  canvas.addEventListener('contextmenu', (e) => {
    if (!drawMode) return;
    e.preventDefault();
    cancelShape();
  });

  function endStroke() {
    if (!stroke) return;
    const pts = stroke;
    stroke = null; lastPx = null;
    commitPoints(pts);
  }

  // Push one finished polyline (free-hand OR a shape outline) to RTDB. Points
  // are DOC coords; a shape is indistinguishable from a stroke on the wire, so
  // it inherits sync, the eraser, undo and the daily reset for free.
  function commitPoints(docPts) {
    const packed = WL.packPoints(docPts);
    if (!packed || !myUid) return;
    // Past-midnight strokes belong to the NEW day's wall — roll the
    // subscription now instead of waiting for the 60s timer.
    if (day !== localDay()) subscribe();
    const strokeDay = day;
    const node = rtdb.ref('wall/' + strokeDay + '/strokes').push();
    node.set({ p: packed, c: WL.hexToInt(colorHex), w: widthIdx, by: myUid, ts: Date.now() })
      .then(() => {
        myKeys.push({ day: strokeDay, key: node.key });   // undoable once it's real
        if (myKeys.length > 50) myKeys.shift();
      })
      .catch(wallUnavailable);              // rules missing → say so, stop lying
  }

  /* wiring */
  toggle.addEventListener('click', () => { drawMode ? exitDraw() : enterDraw(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !drawMode) return;
    if (shapeAnchor) cancelShape();           // 1st Esc drops a pending shape…
    else exitDraw();                          // …a 2nd (or Esc with none) leaves draw mode
  });
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('scroll', onScroll, { passive: true });
  fitCanvas();
})();
