/**
 * doodle.js — 🎨 涂鸦: a finger-drawing pad that posts as a normal image bubble.
 *
 * The 🎨 button (next to 📊 in the input tools) opens a modal canvas: draw
 * with pointer events (touch-first), pick colors/brush sizes, undo, clear.
 * "贴到输入框" exports a small JPEG and drops it into the SAME pending-image
 * slot the 📷 attach flow uses (window.setPendingImage from app.js), so the
 * user can still add text and hits the normal Send — nothing new touches
 * Firestore, the sketch rides the existing image pipeline.
 *
 * Feature flag: doodle (feature-flags.js hides #doodleBtn).
 */
(function () {
  'use strict';

  const btn = document.getElementById('doodleBtn');
  if (!btn) return;

  const SIZE = 320;                  // canvas CSS px (square)
  const EXPORT_PX = 400;             // posted JPEG edge — matches 📷 compression
  const COLORS = ['#111111', '#e63946', '#f4a261', '#ffd166',
                  '#2a9d8f', '#457b9d', '#c8b6ff', '#ffffff'];
  const BRUSHES = [4, 9, 16];
  const MAX_UNDO = 10;

  let modal = null, canvas = null, ctx = null, dpr = 1;
  let color = COLORS[0], brush = BRUSHES[1];
  let drawing = false, lastX = 0, lastY = 0;
  let blankURL = '';   // pristine paper — compared at confirm time; a flag
                       // desyncs across undo/clear, pixels never lie
  let undoStack = [];

  function build() {
    modal = document.createElement('div');
    modal.className = 'doodle-modal';
    modal.innerHTML =
      '<div class="doodle-panel">' +
        '<div class="doodle-head">🎨 画个涂鸦' +
          '<button class="doodle-close" type="button" title="Close (Esc)">✕</button></div>' +
        '<canvas class="doodle-canvas"></canvas>' +
        '<div class="doodle-row doodle-colors"></div>' +
        '<div class="doodle-row doodle-tools">' +
          '<span class="doodle-brushes"></span>' +
          '<button class="doodle-tool doodle-undo" type="button" title="撤销">↩️</button>' +
          '<button class="doodle-tool doodle-clear" type="button" title="清空">🗑️</button>' +
        '</div>' +
        '<div class="doodle-row doodle-actions">' +
          '<button class="doodle-cancel" type="button">取消</button>' +
          '<button class="doodle-ok" type="button">✅ 贴到输入框</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    canvas = modal.querySelector('.doodle-canvas');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    resetPaper();
    blankURL = canvas.toDataURL('image/png');

    // Palette (last swatch doubles as the eraser — the paper is white).
    const colorsRow = modal.querySelector('.doodle-colors');
    COLORS.forEach((c, i) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'doodle-swatch' + (c === color ? ' sel' : '');
      sw.style.background = c;
      sw.title = (i === COLORS.length - 1) ? '橡皮擦（白色）' : c;
      if (i === COLORS.length - 1) sw.textContent = '⌫';
      sw.addEventListener('click', () => {
        color = c;
        colorsRow.querySelectorAll('.doodle-swatch').forEach(x => x.classList.remove('sel'));
        sw.classList.add('sel');
      });
      colorsRow.appendChild(sw);
    });

    const brushesRow = modal.querySelector('.doodle-brushes');
    BRUSHES.forEach((b) => {
      const bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'doodle-brush' + (b === brush ? ' sel' : '');
      bt.innerHTML = '<i style="width:' + b + 'px;height:' + b + 'px"></i>';
      bt.title = '笔刷 ' + b + 'px';
      bt.addEventListener('click', () => {
        brush = b;
        brushesRow.querySelectorAll('.doodle-brush').forEach(x => x.classList.remove('sel'));
        bt.classList.add('sel');
      });
      brushesRow.appendChild(bt);
    });

    modal.querySelector('.doodle-close').addEventListener('click', close);
    modal.querySelector('.doodle-cancel').addEventListener('click', close);
    modal.querySelector('.doodle-undo').addEventListener('click', undo);
    modal.querySelector('.doodle-clear').addEventListener('click', () => {
      pushUndo();
      resetPaper();
    });
    modal.querySelector('.doodle-ok').addEventListener('click', confirmDoodle);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    /* drawing */
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drawing = true;
      pushUndo();
      const p = toCanvas(e);
      lastX = p.x; lastY = p.y;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      dot(p.x, p.y);                 // a tap leaves a dot, not nothing
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = toCanvas(e);
      ctx.strokeStyle = color;
      ctx.lineWidth = brush;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    });
    function stop(e) {
      if (!drawing) return;
      drawing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (SIZE / r.width),
      y: (e.clientY - r.top) * (SIZE / r.height)
    };
  }

  function dot(x, y) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function resetPaper() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  function pushUndo() {
    try {
      undoStack.push(canvas.toDataURL('image/png'));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    } catch (_) {}
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    const img = new Image();
    img.onload = () => {
      resetPaper();
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
    };
    img.src = prev;
  }

  function confirmDoodle() {
    if (canvas.toDataURL('image/png') === blankURL) {
      if (typeof showToast === 'function') showToast('先画点什么吧 🖌️');
      return;
    }
    // Downscale to the same edge the 📷 pipeline produces, keep the doc small.
    const out = document.createElement('canvas');
    out.width = EXPORT_PX; out.height = EXPORT_PX;
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, EXPORT_PX, EXPORT_PX);
    octx.drawImage(canvas, 0, 0, EXPORT_PX, EXPORT_PX);
    const url = out.toDataURL('image/jpeg', 0.75);
    if (typeof window.setPendingImage === 'function') {
      window.setPendingImage(url);
      if (typeof showToast === 'function') showToast('🎨 已贴到输入框，点 Send 发送');
    }
    close();
  }

  function open() {
    if (window.FEATURES && window.FEATURES.doodle === false) return;
    if (modal) return;                 // already open — never wipe a drawing
    undoStack = []; drawing = false;
    build();
  }

  function close() {
    if (modal) { modal.remove(); modal = null; }
    canvas = null; ctx = null; drawing = false;
  }

  btn.addEventListener('click', open);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) close(); });
})();
