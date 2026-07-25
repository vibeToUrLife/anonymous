// wall-logic.test.js — unit tests for the pure graffiti-wall logic.
const test = require('node:test');
const assert = require('node:assert');
const WL = require('./wall-logic.js');

test('quantX clamps a 0..1 fraction onto the grid', () => {
  assert.strictEqual(WL.quantX(0), 0);
  assert.strictEqual(WL.quantX(1), WL.XGRID);
  assert.strictEqual(WL.quantX(0.5006), 501);
  assert.strictEqual(WL.quantX(0.5004), 500);
  assert.strictEqual(WL.quantX(-3), 0);
  assert.strictEqual(WL.quantX(9), WL.XGRID);
  assert.strictEqual(WL.quantX(NaN), 0);
});

test('quantY rounds document px to a whole pixel and caps at Y_MAX_PX', () => {
  assert.strictEqual(WL.quantY(0), 0);
  assert.strictEqual(WL.quantY(1234.6), 1235);          // rounds to whole px
  assert.strictEqual(WL.quantY(1234.4), 1234);
  assert.strictEqual(WL.quantY(WL.Y_MAX_PX + 500), WL.Y_MAX_PX);   // capped
  assert.strictEqual(WL.quantY(-2), 0);
  assert.strictEqual(WL.quantY(NaN), 0);
});

test('packPoints/unpackPoints round-trip: x fraction, y in document px', () => {
  const pts = [{ x: 0.1234, y: 987 }, { x: 0, y: 4250 }, { x: 1, y: 0 }];
  const back = WL.unpackPoints(WL.packPoints(pts));
  assert.strictEqual(back.length, 3);
  back.forEach((p, i) => {
    assert.ok(Math.abs(p.x - pts[i].x) <= 0.5 / WL.XGRID + 1e-9);
    assert.ok(Math.abs(p.y - pts[i].y) <= 0.5 + 1e-9);   // ±half a pixel
  });
  assert.ok(back[1].y > 1000, 'a point far down the document must survive the round-trip');
});

test('pack/unpack tolerate junk without throwing', () => {
  assert.strictEqual(WL.packPoints('junk'), '');
  assert.strictEqual(WL.packPoints([null, { x: 'a', y: 0 }, { x: 0.2, y: 200 }]), '200,200');
  assert.deepStrictEqual(WL.unpackPoints(null), []);
  assert.deepStrictEqual(WL.unpackPoints(';;;'), []);
  assert.strictEqual(WL.unpackPoints('10,20;bad;30,40').length, 2);
  // out-of-range wire values clamp: x into 0..1, y into 0..Y_MAX_PX
  const p = WL.unpackPoints('99999,-50')[0];
  assert.strictEqual(p.x, 1);
  assert.strictEqual(p.y, 0);
});

test('a worst-case max-length stroke fits inside the wire guard', () => {
  const pts = [];
  for (let i = 0; i < WL.MAX_POINTS; i++) pts.push({ x: 1, y: WL.Y_MAX_PX }); // widest digits
  const packed = WL.packPoints(pts);
  assert.ok(packed.length <= WL.MAX_PACKED_LEN,
    'packed length ' + packed.length + ' > ' + WL.MAX_PACKED_LEN);
});

test('validStroke accepts wire shape and rejects junk', () => {
  assert.ok(WL.validStroke({ p: '1,2;3,4', c: 0, w: 1 }));
  assert.ok(!WL.validStroke(null));
  assert.ok(!WL.validStroke({ p: '', c: 0, w: 1 }));
  assert.ok(!WL.validStroke({ p: 'x'.repeat(WL.MAX_PACKED_LEN + 1), c: 0, w: 1 }));
  assert.ok(!WL.validStroke({ p: '1,2', c: 'red', w: 1 }));
});

test('dist2 is a squared distance', () => {
  assert.strictEqual(WL.dist2(0, 0, 3, 4), 25);
  assert.strictEqual(WL.dist2(1, 1, 1, 1), 0);
});

test('distToSeg2 measures to the whole segment, not just its ends', () => {
  // midpoint of a long horizontal segment: on the line → 0
  assert.strictEqual(WL.distToSeg2(50, 0, 0, 0, 100, 0), 0);
  // 5px above the midpoint → 25
  assert.strictEqual(WL.distToSeg2(50, 5, 0, 0, 100, 0), 25);
  // beyond an endpoint clamps to that endpoint (not the infinite line)
  assert.strictEqual(WL.distToSeg2(-3, 4, 0, 0, 100, 0), 9 + 16);
  // degenerate segment (a point) = point distance
  assert.strictEqual(WL.distToSeg2(3, 4, 1, 1, 1, 1), WL.dist2(3, 4, 1, 1));
});

test('hexToInt / intToHex round-trip and clamp arbitrary RGB colours', () => {
  assert.strictEqual(WL.hexToInt('#ff0000'), 0xff0000);
  assert.strictEqual(WL.hexToInt('00ff00'), 0x00ff00);      // no '#' ok
  assert.strictEqual(WL.hexToInt('#123456'), 0x123456);
  assert.strictEqual(WL.hexToInt('#FFF'), 0);               // 3-digit not accepted
  assert.strictEqual(WL.hexToInt('garbage'), 0);
  assert.strictEqual(WL.hexToInt(null), 0);
  assert.strictEqual(WL.intToHex(0xff0000), '#ff0000');
  assert.strictEqual(WL.intToHex(0), '#000000');
  assert.strictEqual(WL.intToHex(0x1000000), '#ffffff');    // clamp high
  assert.strictEqual(WL.intToHex(-5), '#000000');           // clamp low
  assert.strictEqual(WL.intToHex(NaN), '#000000');
  assert.strictEqual(WL.hexToInt(WL.intToHex(0x0a1b2c)), 0x0a1b2c);
  // every preset survives the hex→int→hex round-trip (they're lowercase 6-digit)
  WL.COLORS.forEach(c => assert.strictEqual(WL.intToHex(WL.hexToInt(c)), c.toLowerCase()));
});

test('shapePoints builds each outline as a closed polyline in the input space', () => {
  // line — just the two endpoints
  assert.deepStrictEqual(WL.shapePoints('line', 10, 20, 30, 40),
    [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  // rectangle — 4 box corners, closed back to the first
  const r = WL.shapePoints('rect', 0, 0, 100, 60);
  assert.strictEqual(r.length, 5);
  assert.deepStrictEqual(r[0], r[4]);                        // closed
  assert.deepStrictEqual(r[2], { x: 100, y: 60 });          // opposite corner
  // triangle — apex centred over the base, closed
  const t = WL.shapePoints('triangle', 0, 0, 100, 60);
  assert.strictEqual(t.length, 4);
  assert.deepStrictEqual(t[0], { x: 50, y: 0 });            // apex
  assert.deepStrictEqual(t[0], t[3]);                        // closed
  // circle — CIRCLE_SEGS+1 points on the ellipse filling the box, closed
  const c = WL.shapePoints('circle', 0, 0, 100, 100);
  assert.strictEqual(c.length, WL.CIRCLE_SEGS + 1);
  c.forEach(p => {                                            // every point on the rim
    const dx = p.x - 50, dy = p.y - 50;
    assert.ok(Math.abs(Math.hypot(dx, dy) - 50) < 1e-9);
  });
  assert.ok(Math.abs(c[0].x - c[c.length - 1].x) < 1e-9);    // closed
});

test('shapePoints tolerates junk / unknown kinds without throwing', () => {
  assert.deepStrictEqual(WL.shapePoints('rect', NaN, 0, 1, 1), []);
  assert.deepStrictEqual(WL.shapePoints('star', 0, 0, 1, 1), []);
  // a degenerate (zero-size) shape still returns a valid, packable polyline
  const packed = WL.packPoints(WL.shapePoints('rect', 5, 5, 5, 5)
    .map(p => ({ x: p.x / 1000, y: p.y })));
  assert.strictEqual(typeof packed, 'string');
});

/* ── Paint bucket (🪣) ──────────────────────────────────────────
   Grids below are written as strings so the shape being tested is visible:
   '#' = ink (a wall the flood must not cross), '.' = blank. */

/** '.#.\n###' → {w, h, isInk(i)} */
function grid(art) {
  const rows = art.trim().split('\n').map(r => r.trim());
  const w = rows[0].length, h = rows.length;
  const cells = new Uint8Array(w * h);
  rows.forEach((r, y) => {
    for (let x = 0; x < w; x++) cells[y * w + x] = (r[x] === '#') ? 1 : 0;
  });
  return { w: w, h: h, cells: cells, blank: (i) => cells[i] === 0 };
}

test('floodRegion fills a closed region and reports it as closed', () => {
  const g = grid(`
    .......
    .#####.
    .#...#.
    .#...#.
    .#...#.
    .#####.
    .......`);
  const r = WL.floodRegion(g.blank, g.w, g.h, 3, 2);
  assert.strictEqual(r.touchedEdge, false, 'a boxed-in region must not reach the edge');
  assert.strictEqual(r.count, 9, '3×3 interior');
  assert.strictEqual(r.mask[2 * g.w + 3], 1);       // inside filled
  assert.strictEqual(r.mask[0], 0);                 // outside untouched
  assert.strictEqual(r.mask[1 * g.w + 1], 0);       // the wall itself untouched
});

test('floodRegion flags a region with a gap as not closed', () => {
  const g = grid(`
    .......
    .#####.
    .#...#.
    .#.....
    .#####.
    .......`);
  const r = WL.floodRegion(g.blank, g.w, g.h, 3, 2);
  assert.strictEqual(r.touchedEdge, true, 'ink with a gap must leak out to the edge');
});

test('floodRegion refuses a seed that is off-grid or already ink', () => {
  const g = grid(`
    ###
    #.#
    ###`);
  assert.strictEqual(WL.floodRegion(g.blank, g.w, g.h, 0, 0).count, 0);   // on ink
  assert.strictEqual(WL.floodRegion(g.blank, g.w, g.h, -1, 1).count, 0);  // off-grid
  assert.strictEqual(WL.floodRegion(g.blank, g.w, g.h, 9, 9).count, 0);
  assert.strictEqual(WL.floodRegion(null, 3, 3, 1, 1).count, 0);          // junk match
});

test('floodRegion crosses a U-bend rather than stopping at the first wall', () => {
  const g = grid(`
    #######
    #.....#
    #.###.#
    #.#...#
    #.#####
    #.....#
    #######`);
  const r = WL.floodRegion(g.blank, g.w, g.h, 1, 1);
  assert.strictEqual(r.touchedEdge, false);
  assert.strictEqual(r.mask[5 * g.w + 5], 1, 'the far end of the U must be reached');
  assert.strictEqual(r.mask[3 * g.w + 4], 1, 'the pocket inside the U too');
});

test('dilateMask grows the region by one cell per pass', () => {
  const g = grid(`
    .....
    .....
    ..#..
    .....
    .....`);
  const one = WL.dilateMask(g.cells, 5, 5, 1);
  assert.strictEqual(one[2 * 5 + 2], 1);            // the seed
  assert.strictEqual(one[1 * 5 + 2], 1);            // and its 4 neighbours
  assert.strictEqual(one[2 * 5 + 1], 1);
  assert.strictEqual(one[0 * 5 + 2], 0, 'only one cell out');
  assert.strictEqual(WL.dilateMask(g.cells, 5, 5, 2)[0 * 5 + 2], 1);
  assert.strictEqual(WL.dilateMask(g.cells, 5, 5, 0), g.cells, 'r=0 is a no-op');
});

test('traceContour rings the filled cells by their corners, not their centres', () => {
  const g = grid(`
    ....
    .##.
    .##.
    ....`);
  const ring = WL.traceContour(g.cells, g.w, g.h);
  // A 2×2 block spans corners (1,1)..(3,3). The walk steps one cell edge at a
  // time, so it emits the mid-edge corners too — 8 points round the box.
  assert.strictEqual(ring.length, 8);
  assert.deepStrictEqual(ring[0], { x: 1, y: 1 }, 'starts at the topmost-leftmost corner');
  assert.deepStrictEqual(ring[1], { x: 2, y: 1 }, 'and walks clockwise');
  ring.forEach(p => assert.ok(
    (p.x === 1 || p.x === 3 || p.y === 1 || p.y === 3) &&
    p.x >= 1 && p.x <= 3 && p.y >= 1 && p.y <= 3,
    'every corner is on the box boundary: ' + p.x + ',' + p.y));
  assert.ok(WL.pointInPoly(2, 2, ring), 'the block itself is inside');
  assert.ok(!WL.pointInPoly(0.5, 0.5, ring), 'blank cells are outside');
  // The redundant mid-edge corners are exactly what simplifyPath is for.
  assert.strictEqual(WL.simplifyPath(ring, 0.5).length, 5,
    '4 box corners + the ring\'s open endpoint');
});

test('traceContour encloses every filled cell of a ragged region', () => {
  const g = grid(`
    .....
    .#...
    .###.
    .###.
    .....`);
  const ring = WL.traceContour(g.cells, g.w, g.h);
  assert.ok(ring.length >= 4);
  // Every filled cell's centre must land inside the traced ring.
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!g.cells[y * g.w + x]) continue;
      assert.ok(WL.pointInPoly(x + 0.5, y + 0.5, ring),
        'cell ' + x + ',' + y + ' should be inside the contour');
    }
  }
  assert.ok(!WL.pointInPoly(0.5, 0.5, ring), 'an empty corner must stay outside');
});

test('unpinchMask opens up a diagonal-only touch', () => {
  // two blocks joined at a single corner — the contour walk would otherwise
  // ring only the first one and leave the second unfilled
  const g = grid(`
    ##...
    ##...
    ..##.
    ..##.
    .....`);
  const bad = WL.traceContour(g.cells, g.w, g.h);
  const missedBefore = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (g.cells[y * g.w + x] && !WL.pointInPoly(x + 0.5, y + 0.5, bad)) missedBefore.push(x + ',' + y);
  }
  assert.strictEqual(missedBefore.length, 4, 'the raw mask really does lose the far lobe');

  const fixed = WL.unpinchMask(g.cells, g.w, g.h);
  const ring = WL.traceContour(fixed, g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.cells[y * g.w + x]) continue;
    assert.ok(WL.pointInPoly(x + 0.5, y + 0.5, ring),
      'cell ' + x + ',' + y + ' must be inside the contour after unpinching');
  }
  assert.notStrictEqual(fixed, g.cells, 'returns a copy, never mutates the input');
});

test('unpinchMask handles the other diagonal and leaves clean masks alone', () => {
  const anti = grid(`
    .##..
    .##..
    #....
    .....`);            // ▞ saddle at the block's lower-left corner
  const f = WL.unpinchMask(anti.cells, anti.w, anti.h);
  const ring = WL.traceContour(f, anti.w, anti.h);
  for (let y = 0; y < anti.h; y++) for (let x = 0; x < anti.w; x++) {
    if (!anti.cells[y * anti.w + x]) continue;
    assert.ok(WL.pointInPoly(x + 0.5, y + 0.5, ring), 'missed ' + x + ',' + y);
  }
  const plain = grid(`
    ....
    .##.
    .##.
    ....`);
  assert.deepStrictEqual(Array.from(WL.unpinchMask(plain.cells, plain.w, plain.h)),
    Array.from(plain.cells), 'a mask with no saddle is untouched');
});

test('a flooded region is fully enclosed by its contour, saddles and all', () => {
  // Ink at a shallow diagonal: exactly the antialiased-edge case that pinches.
  const w = 24, h = 18, ink = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { const y = Math.floor(x / 3); if (y < h) ink[y * w + x] = 1; }
  for (let x = 0; x < w; x++) ink[(h - 1) * w + x] = 1;
  for (let y = 0; y < h; y++) ink[y * w + (w - 1)] = 1;
  const r = WL.floodRegion((i) => ink[i] === 0, w, h, w - 4, h - 3);
  assert.ok(r.count > 20);
  const solid = WL.unpinchMask(WL.dilateMask(r.mask, w, h, WL.FILL_DILATE), w, h);
  const ring = WL.traceContour(solid, w, h);
  const missed = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (r.mask[y * w + x] && !WL.pointInPoly(x + 0.5, y + 0.5, ring)) missed.push(x + ',' + y);
  }
  assert.deepStrictEqual(missed, [], 'every flooded cell must end up inside the ring');
});

test('traceContour returns nothing for an empty mask', () => {
  assert.deepStrictEqual(WL.traceContour(new Uint8Array(9), 3, 3), []);
  assert.deepStrictEqual(WL.traceContour(null, 3, 3), []);
  assert.deepStrictEqual(WL.traceContour(new Uint8Array(0), 0, 0), []);
});

test('simplifyPath drops collinear points and keeps the corners', () => {
  const line = [];
  for (let x = 0; x <= 20; x++) line.push({ x: x, y: 0 });
  assert.deepStrictEqual(WL.simplifyPath(line, 0.5), [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  // an L keeps its elbow
  const L = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }];
  assert.deepStrictEqual(WL.simplifyPath(L, 0.5),
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  // junk / short input is returned untouched
  assert.deepStrictEqual(WL.simplifyPath(null, 1), []);
  assert.deepStrictEqual(WL.simplifyPath([{ x: 1, y: 1 }], 1), [{ x: 1, y: 1 }]);
});

test('fitPath squeezes any ring under MAX_POINTS and stays packable', () => {
  // a fine circle: far more points than the wire allows
  const ring = [];
  for (let i = 0; i < 4000; i++) {
    const t = (i / 4000) * Math.PI * 2;
    ring.push({ x: 500 + 400 * Math.cos(t), y: 500 + 400 * Math.sin(t) });
  }
  const fitted = WL.fitPath(ring, WL.MAX_POINTS);
  assert.ok(fitted.length <= WL.MAX_POINTS, 'got ' + fitted.length);
  assert.ok(fitted.length >= 8, 'must still resemble a circle, got ' + fitted.length);
  const packed = WL.packPoints(fitted.map(p => ({ x: p.x / 1000, y: p.y })));
  assert.ok(packed.length <= WL.MAX_PACKED_LEN, 'packed ' + packed.length);
  // already small enough → passed through untouched
  const small = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
  assert.deepStrictEqual(WL.fitPath(small, WL.MAX_POINTS), small);
  assert.deepStrictEqual(WL.fitPath(null, 10), []);
});

test('fitPath still caps a ring that simplification cannot thin out', () => {
  // a zig-zag where every point is a genuine corner: DP can only give up
  const saw = [];
  for (let i = 0; i < 3000; i++) saw.push({ x: i, y: (i % 2) ? 1000 : 0 });
  const fitted = WL.fitPath(saw, WL.MAX_POINTS);
  assert.ok(fitted.length <= WL.MAX_POINTS, 'got ' + fitted.length);
});

test('pointInPoly is true strictly inside the ring', () => {
  const box = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.ok(WL.pointInPoly(5, 5, box));
  assert.ok(!WL.pointInPoly(-1, 5, box));
  assert.ok(!WL.pointInPoly(15, 5, box));
  assert.ok(!WL.pointInPoly(5, 20, box));
  // concave: the notch is outside even though it is inside the bounding box
  const C = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 3 },
             { x: 3, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.ok(WL.pointInPoly(1, 5, C));
  assert.ok(!WL.pointInPoly(7, 5, C), 'the notch must read as outside');
  assert.ok(!WL.pointInPoly(5, 5, [{ x: 0, y: 0 }, { x: 1, y: 1 }]));   // degenerate
  assert.ok(!WL.pointInPoly(NaN, 5, box));
});

test('a flooded region survives the whole trace → fit → pack pipeline', () => {
  // 40×30 blank canvas with a ring of ink around a 20×12 hole
  const w = 40, h = 30;
  const cells = new Uint8Array(w * h);
  for (let x = 8; x < 30; x++) { cells[6 * w + x] = 1; cells[19 * w + x] = 1; }
  for (let y = 6; y <= 19; y++) { cells[y * w + 8] = 1; cells[y * w + 29] = 1; }
  const r = WL.floodRegion((i) => cells[i] === 0, w, h, 15, 12);
  assert.strictEqual(r.touchedEdge, false);
  assert.ok(r.count >= WL.FILL_MIN_CELLS);
  const ring = WL.fitPath(WL.traceContour(
    WL.dilateMask(r.mask, w, h, WL.FILL_DILATE), w, h), WL.MAX_POINTS);
  assert.ok(ring.length >= 4);
  assert.ok(ring.length <= WL.MAX_POINTS);
  assert.ok(WL.pointInPoly(15, 12, ring), 'the seed must sit inside the committed ring');
  const packed = WL.packPoints(ring.map(p => ({ x: p.x / w, y: p.y })));
  assert.ok(packed.length > 0 && packed.length <= WL.MAX_PACKED_LEN);
  assert.strictEqual(WL.unpackPoints(packed).length, ring.length);
});
