/**
 * wall-logic.js — Pure logic for the 涂鸦墙 (graffiti wall): a shared drawing
 * layer behind the bubble board.
 *
 * Strokes travel over RTDB as one compact string per stroke ("512,340;520,345"
 * — coordinates quantized to a 0..1000 grid of the viewport), so a whole
 * stroke is a single tiny write and replays identically on any screen size.
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
       x = fraction of viewport width           (0..1; the board never scrolls
                                                  horizontally)
       y = viewport-heights from the document top (>= 0, may exceed 1). The
           reference (one screen height) is fixed, so a drawing keeps its page
           position even as bubbles are added/removed and the page grows. */
  /** X quantizes to a 0..XGRID grid (thousandths of viewport width). */
  WL.XGRID = 1000;
  /** Y quantizes to 1/YSCALE of a screen height. */
  WL.YSCALE = 1000;
  /** Cap Y (in screens) so one crafted stroke can't inflate the payload. */
  WL.Y_MAX_VH = 200;
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

  /** Clamp+quantize a Y value in viewport-heights (>= 0) to the wire grid. */
  WL.quantY = function (v) {
    v = +v;
    if (!isFinite(v)) v = 0;
    return Math.max(0, Math.min(WL.Y_MAX_VH * WL.YSCALE, Math.round(v * WL.YSCALE)));
  };

  /**
   * Pack points into the wire string.
   * @param {Array<{x:number,y:number}>} points  x = width fraction, y = vh-from-top
   * @returns {string} "x1,y1;x2,y2;…" (grid units)
   */
  WL.packPoints = function (points) {
    if (!Array.isArray(points)) return '';
    return points
      .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
      .map(p => WL.quantX(p.x) + ',' + WL.quantY(p.y))
      .join(';');
  };

  /**
   * Unpack a wire string back to points ({x: width fraction, y: vh-from-top}).
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
        y: Math.max(0, Math.min(WL.Y_MAX_VH, y / WL.YSCALE))
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
