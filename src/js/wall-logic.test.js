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
