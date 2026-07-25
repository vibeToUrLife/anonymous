/**
 * wall-logic.js — Pure logic for the 涂鸦墙 (graffiti wall): a shared drawing
 * layer behind the bubble board.
 *
 * Strokes travel over RTDB as one compact string per stroke ("512,340;520,900"
 * — x quantized to a 0..1000 fraction of the viewport width, y stored as
 * absolute CSS pixels from the document top), so a whole stroke is a single
 * tiny write. Anchoring y to real document pixels (not viewport-heights) keeps
 * a stroke at the SAME page position for everyone, whatever their window height.
 * Browser global: WallLogic. CommonJS export for the Node unit tests.
 */
(function (global) {
  'use strict';

  const WL = {};

  /** Quick-pick preset inks — mid-tone so they read on the dark, light AND
   *  terminal themes. A stroke's colour is stored as a full RGB integer
   *  (see hexToInt), so the custom picker can send ANY colour too. */
  WL.COLORS = ['#e63946', '#f4a261', '#ffd166', '#2a9d8f',
               '#4cc9f0', '#c8b6ff', '#f472b6', '#8d99ae'];
  /** Brush widths in CSS px (scaled lightly with viewport at draw time). */
  WL.WIDTHS = [3, 6, 12];
  /** Largest packed RGB colour value (0xFFFFFF). */
  WL.MAX_COLOR = 0xFFFFFF;
  /** Eraser hit radius in screen px — a comfortable touch target. */
  WL.ERASER_R = 16;
  /** Segments approximating a circle/ellipse outline. A placed shape is just a
   *  polyline, so a smoother curve only costs a handful more points. */
  WL.CIRCLE_SEGS = 40;

  /** "#rrggbb" (or "rrggbb") → 0..0xFFFFFF. Junk / short forms → 0 (black). */
  WL.hexToInt = function (hex) {
    if (typeof hex !== 'string') return 0;
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    return m ? parseInt(m[1], 16) : 0;
  };

  /** 0..0xFFFFFF → "#rrggbb" (clamped; NaN → black). */
  WL.intToHex = function (n) {
    n = Math.floor(+n);
    if (!isFinite(n)) n = 0;
    n = Math.max(0, Math.min(WL.MAX_COLOR, n));
    return '#' + ('000000' + n.toString(16)).slice(-6);
  };

  /* Coordinate model — the wall is anchored to the DOCUMENT, not the screen,
     so drawings scroll with the page like a real background.
       x = fraction of viewport width          (0..1; the board never scrolls
                                                 horizontally)
       y = CSS pixels from the document top     (>= 0). Absolute pixels — NOT
           viewport-heights — so the same stroke lands at the same page spot no
           matter how tall the viewer's window is (a window-height-relative unit
           made drawings slide up/down as the window was resized). */
  /** X quantizes to a 0..XGRID grid (thousandths of viewport width). */
  WL.XGRID = 1000;
  /** Cap Y (document CSS px) so one crafted stroke can't inflate the payload. */
  WL.Y_MAX_PX = 200000;
  /** Points per stroke — hit it and the client seamlessly starts a new one. */
  WL.MAX_POINTS = 240;
  /** Wire-format guard for a packed stroke (also enforced by RTDB rules).
   *  Worst case ≈ 240 × "1000,200000;" (12 chars) = 2880. */
  WL.MAX_PACKED_LEN = 3200;
  /** Only the newest N strokes render (and only they are fetched). */
  WL.MAX_STROKES = 400;
  /** A finger must travel this far (screen px) before the next point counts —
   *  keeps strokes small without visibly changing their shape. */
  WL.MIN_MOVE_PX = 4;

  /** Clamp+quantize an X fraction (0..1) to the wire grid. */
  WL.quantX = function (v) {
    v = +v;
    if (!isFinite(v)) v = 0;
    return Math.max(0, Math.min(WL.XGRID, Math.round(v * WL.XGRID)));
  };

  /** Clamp+quantize a Y value in document CSS px (>= 0) to a whole pixel. */
  WL.quantY = function (v) {
    v = +v;
    if (!isFinite(v)) v = 0;
    return Math.max(0, Math.min(WL.Y_MAX_PX, Math.round(v)));
  };

  /**
   * Pack points into the wire string.
   * @param {Array<{x:number,y:number}>} points  x = width fraction, y = px-from-top
   * @returns {string} "x1,y1;x2,y2;…" (x in grid units, y in whole px)
   */
  WL.packPoints = function (points) {
    if (!Array.isArray(points)) return '';
    return points
      .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
      .map(p => WL.quantX(p.x) + ',' + WL.quantY(p.y))
      .join(';');
  };

  /**
   * Unpack a wire string back to points ({x: width fraction, y: px-from-top}).
   * Malformed pairs are skipped, never thrown on.
   * @returns {Array<{x:number,y:number}>}
   */
  WL.unpackPoints = function (str) {
    if (typeof str !== 'string' || !str) return [];
    const out = [];
    for (const pair of str.split(';')) {
      const i = pair.indexOf(',');
      if (i < 1) continue;
      const x = +pair.slice(0, i), y = +pair.slice(i + 1);
      if (!isFinite(x) || !isFinite(y)) continue;
      out.push({
        x: Math.max(0, Math.min(1, x / WL.XGRID)),
        y: Math.max(0, Math.min(WL.Y_MAX_PX, y))
      });
    }
    return out;
  };

  /** Is a stroke record from the wire safe to draw? */
  WL.validStroke = function (s) {
    return !!(s && typeof s.p === 'string' && s.p.length > 0 &&
      s.p.length <= WL.MAX_PACKED_LEN &&
      typeof s.c === 'number' && typeof s.w === 'number');
  };

  /**
   * Outline of a simple shape as a polyline, so a placed shape rides the exact
   * same wire format / renderer / eraser / undo as a free-hand stroke. Works in
   * whatever 2D space the two corner points are given in — the wall passes
   * SCREEN px so circles stay circular and squares square on screen, then maps
   * the returned vertices into stored doc coords itself. `a`=(ax,ay) is the
   * first click, `b`=(bx,by) the second; closed shapes repeat the first vertex.
   * @param {string} kind  'line' | 'rect' | 'circle' | 'triangle'
   * @returns {Array<{x:number,y:number}>}  empty on junk input / unknown kind
   */
  WL.shapePoints = function (kind, ax, ay, bx, by) {
    ax = +ax; ay = +ay; bx = +bx; by = +by;
    if (![ax, ay, bx, by].every(isFinite)) return [];
    switch (kind) {
      case 'line':
        return [{ x: ax, y: ay }, { x: bx, y: by }];
      case 'rect':
        return [{ x: ax, y: ay }, { x: bx, y: ay },
                { x: bx, y: by }, { x: ax, y: by }, { x: ax, y: ay }];
      case 'triangle': {
        const mx = (ax + bx) / 2;                 // apex centred over the base
        return [{ x: mx, y: ay }, { x: bx, y: by },
                { x: ax, y: by }, { x: mx, y: ay }];
      }
      case 'circle': {
        const cx = (ax + bx) / 2, cy = (ay + by) / 2;
        const rx = (bx - ax) / 2, ry = (by - ay) / 2;   // ellipse fills the box
        const out = [];
        for (let i = 0; i <= WL.CIRCLE_SEGS; i++) {
          const t = (i / WL.CIRCLE_SEGS) * Math.PI * 2;
          out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
        }
        return out;
      }
      default:
        return [];
    }
  };

  /* ── Paint bucket (🪣) ────────────────────────────────────────
     A "region" only exists as PIXELS, but the wall is a vector wall. So the
     bucket floods the on-screen bitmap, traces the outline of what it flooded,
     simplifies that outline to a polygon, and ships it as an ordinary stroke
     with f:1 — a fill is indistinguishable from a shape on the wire, and so
     inherits sync, the eraser, undo and the daily reset for free.

     Everything here works on a plain w×h grid of cells (index = y*w + x), so
     it is pure and unit-testable without a canvas. */

  /** Per-channel tolerance when deciding whether a pixel matches the seed. */
  WL.FILL_TOL = 32;
  /** Grow the flooded region by this many px so its edge tucks UNDER the
   *  surrounding ink instead of leaving an antialiased hairline. */
  WL.FILL_DILATE = 1;
  /** Smaller than this many cells = a mis-click, not a region worth a write. */
  WL.FILL_MIN_CELLS = 24;

  /**
   * Scanline flood fill over a w×h grid.
   * @param {function(number):boolean} match  match(i) — is cell i in the region?
   * @param {number} w  grid width
   * @param {number} h  grid height
   * @param {number} sx seed cell x
   * @param {number} sy seed cell y
   * @returns {{mask: Uint8Array, touchedEdge: boolean, count: number}}
   *   touchedEdge means the flood ran off the grid — i.e. the region ISN'T
   *   closed, and the caller should refuse rather than paint everything.
   */
  WL.floodRegion = function (match, w, h, sx, sy) {
    w = Math.floor(w); h = Math.floor(h);
    const size = (w > 0 && h > 0) ? w * h : 0;
    const out = { mask: new Uint8Array(size), touchedEdge: false, count: 0 };
    if (!size || typeof match !== 'function') return out;
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || !match(sy * w + sx)) return out;

    const mask = out.mask;
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      const row = y * w;
      if (mask[row + x] || !match(row + x)) continue;
      let xl = x, xr = x;                       // widen to the whole matching run
      while (xl > 0 && !mask[row + xl - 1] && match(row + xl - 1)) xl--;
      while (xr < w - 1 && !mask[row + xr + 1] && match(row + xr + 1)) xr++;
      if (xl === 0 || xr === w - 1 || y === 0 || y === h - 1) out.touchedEdge = true;
      for (let i = xl; i <= xr; i++) { mask[row + i] = 1; out.count++; }
      // Seed the runs above and below: one push per contiguous stretch.
      for (let k = 0; k < 2; k++) {
        const ny = k ? y + 1 : y - 1;
        if (ny < 0 || ny >= h) continue;
        const nrow = ny * w;
        let inRun = false;
        for (let i = xl; i <= xr; i++) {
          if (!mask[nrow + i] && match(nrow + i)) {
            if (!inRun) { stack.push(i, ny); inRun = true; }
          } else inRun = false;
        }
      }
    }
    return out;
  };

  /** Grow a mask by `r` cells in the 4 cardinal directions. Returns a new mask. */
  WL.dilateMask = function (mask, w, h, r) {
    w = Math.floor(w); h = Math.floor(h);
    r = Math.max(0, Math.floor(r) || 0);
    if (!mask || !r || !(w > 0) || !(h > 0)) return mask;
    let src = mask;
    for (let pass = 0; pass < r; pass++) {
      const dst = new Uint8Array(src.length);
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const i = row + x;
          if (src[i] ||
              (x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) ||
              (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) dst[i] = 1;
        }
      }
      src = dst;
    }
    return src;
  };

  /**
   * Remove diagonal-only touch points from a mask, by filling one of the two
   * empty cells of every 2×2 "saddle" (▚ or ▞).
   *
   * MUST run before traceContour. The walk takes one boundary edge per corner,
   * and a saddle is the one place a corner has TWO outgoing edges — take the
   * wrong one and the ring closes early, so everything past the pinch never
   * gets filled. Antialiased diagonal ink and sharp corners produce these
   * constantly. Nudging the mask is easier to reason about than disambiguating
   * mid-walk, and the added cell is one pixel that ends up under the ink.
   *
   * Only ever ADDS cells, so it can't disconnect anything; a few passes catch
   * the saddles that filling a cell creates in the row above.
   */
  WL.unpinchMask = function (mask, w, h) {
    w = Math.floor(w); h = Math.floor(h);
    if (!mask || !(w > 1) || !(h > 1)) return mask;
    const out = new Uint8Array(mask);          // never mutate the caller's mask
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let y = 0; y < h - 1; y++) {
        const r0 = y * w, r1 = r0 + w;
        for (let x = 0; x < w - 1; x++) {
          const a = out[r0 + x], b = out[r0 + x + 1];
          const c = out[r1 + x], d = out[r1 + x + 1];
          if (a && d && !b && !c) { out[r0 + x + 1] = 1; changed = true; }
          else if (b && c && !a && !d) { out[r0 + x] = 1; changed = true; }
        }
      }
      if (!changed) break;
    }
    return out;
  };

  /**
   * Outer boundary of a mask, as a closed ring of CORNER coordinates (0..w,
   * 0..h) so the polygon encloses the filled cells rather than cutting through
   * their centres. Run unpinchMask on the mask first — see why there.
   *
   * Walks the "cracks" between filled and empty cells: every filled cell
   * contributes a clockwise directed edge for each empty neighbour, and the
   * chain is followed from the topmost-leftmost cell's top edge — an edge that
   * is always on the OUTER ring. Holes are simply not traced; the wall paints
   * fills underneath ink, so whatever sits inside the region covers itself.
   * @returns {Array<{x:number,y:number}>}  [] when the mask is empty
   */
  WL.traceContour = function (mask, w, h) {
    w = Math.floor(w); h = Math.floor(h);
    if (!mask || !(w > 0) || !(h > 0)) return [];
    const at = function (x, y) {
      return (x < 0 || y < 0 || x >= w || y >= h) ? 0 : mask[y * w + x];
    };
    const W1 = w + 1;                            // corner grid is one wider/taller
    const next = new Map();                      // corner key → [next corner key]
    const add = function (ax, ay, bx, by) {
      const k = ay * W1 + ax, v = by * W1 + bx;
      const arr = next.get(k);
      if (arr) arr.push(v); else next.set(k, [v]);
    };
    let sx = -1, sy = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (!mask[row + x]) continue;
        if (sy < 0) { sx = x; sy = y; }
        if (!at(x, y - 1)) add(x, y, x + 1, y);              // top    →
        if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);      // right  ↓
        if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);      // bottom ←
        if (!at(x - 1, y)) add(x, y + 1, x, y);              // left   ↑
      }
    }
    if (sy < 0) return [];
    const start = sy * W1 + sx;
    const pts = [];
    let cur = start, guard = next.size + 4;
    do {
      pts.push({ x: cur % W1, y: Math.floor(cur / W1) });
      const arr = next.get(cur);
      if (!arr || !arr.length) break;
      cur = arr.shift();                         // consumed, so a pinch can't loop
    } while (cur !== start && guard-- > 0);
    return pts;
  };

  /**
   * Douglas–Peucker. Iterative (a traced contour can be tens of thousands of
   * points deep, which would blow a recursive stack).
   */
  WL.simplifyPath = function (pts, eps) {
    if (!Array.isArray(pts)) return [];
    if (pts.length <= 2) return pts.slice();
    eps = +eps;
    if (!isFinite(eps) || eps <= 0) return pts.slice();
    const n = pts.length, keep = new Uint8Array(n), eps2 = eps * eps;
    keep[0] = keep[n - 1] = 1;
    const stack = [0, n - 1];
    while (stack.length) {
      const hi = stack.pop(), lo = stack.pop();
      if (hi - lo < 2) continue;
      const a = pts[lo], b = pts[hi];
      let far = -1, best = eps2;
      for (let i = lo + 1; i < hi; i++) {
        const d = WL.distToSeg2(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y);
        if (d > best) { best = d; far = i; }
      }
      if (far < 0) continue;
      keep[far] = 1;
      stack.push(lo, far, far, hi);
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out;
  };

  /**
   * Simplify a ring until it fits `maxPoints`, loosening the tolerance until it
   * does. Point count is the only guard needed: packPoints of MAX_POINTS points
   * is already proven to fit MAX_PACKED_LEN.
   */
  WL.fitPath = function (pts, maxPoints) {
    if (!Array.isArray(pts)) return [];
    maxPoints = Math.max(2, Math.floor(maxPoints) || WL.MAX_POINTS);
    if (pts.length <= maxPoints) return pts.slice();
    let out = pts, eps = 1;
    for (let i = 0; i < 24 && out.length > maxPoints; i++, eps *= 1.8) {
      out = WL.simplifyPath(pts, eps);
    }
    if (out.length > maxPoints) {               // pathological ring — decimate evenly
      const step = out.length / maxPoints, dec = [];
      for (let i = 0; i < maxPoints; i++) dec.push(out[Math.floor(i * step)]);
      out = dec;
    }
    return out;
  };

  /** Even-odd point-in-polygon — lets the eraser hit a fill anywhere inside it. */
  WL.pointInPoly = function (px, py, pts) {
    if (!Array.isArray(pts) || pts.length < 3) return false;
    px = +px; py = +py;
    if (!isFinite(px) || !isFinite(py)) return false;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if ((yi > py) !== (yj > py) &&
          px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  /** Squared distance between two screen points (decimation test). */
  WL.dist2 = function (x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  };

  /**
   * Squared distance from point (px,py) to the segment (ax,ay)-(bx,by).
   * Lets the eraser hit the LINE between two sampled points, not just the
   * vertices, so a fast-flicked stroke has no gaps to slip through.
   */
  WL.distToSeg2 = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
    return ex * ex + ey * ey;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WL;
  }
  global.WallLogic = WL;
})(typeof window !== 'undefined' ? window : globalThis);
