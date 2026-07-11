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

test('quantY keeps values past one screen and caps at Y_MAX_VH', () => {
  assert.strictEqual(WL.quantY(0), 0);
  assert.strictEqual(WL.quantY(1), WL.YSCALE);          // exactly one screen down
  assert.strictEqual(WL.quantY(3.5), 3500);             // 3.5 screens — NOT clamped to 1
  assert.strictEqual(WL.quantY(WL.Y_MAX_VH + 50), WL.Y_MAX_VH * WL.YSCALE);
  assert.strictEqual(WL.quantY(-2), 0);
  assert.strictEqual(WL.quantY(NaN), 0);
});

test('packPoints/unpackPoints round-trip, y can exceed one screen', () => {
  const pts = [{ x: 0.1234, y: 0.9876 }, { x: 0, y: 4.25 }, { x: 1, y: 0 }];
  const back = WL.unpackPoints(WL.packPoints(pts));
  assert.strictEqual(back.length, 3);
  back.forEach((p, i) => {
    assert.ok(Math.abs(p.x - pts[i].x) <= 0.5 / WL.XGRID + 1e-9);
    assert.ok(Math.abs(p.y - pts[i].y) <= 0.5 / WL.YSCALE + 1e-9);
  });
  assert.ok(back[1].y > 1, 'a point 4.25 screens down must survive the round-trip');
});

test('pack/unpack tolerate junk without throwing', () => {
  assert.strictEqual(WL.packPoints('junk'), '');
  assert.strictEqual(WL.packPoints([null, { x: 'a', y: 0 }, { x: 0.2, y: 0.2 }]), '200,200');
  assert.deepStrictEqual(WL.unpackPoints(null), []);
  assert.deepStrictEqual(WL.unpackPoints(';;;'), []);
  assert.strictEqual(WL.unpackPoints('10,20;bad;30,40').length, 2);
  // out-of-range wire values clamp: x into 0..1, y into 0..Y_MAX_VH
  const p = WL.unpackPoints('99999,-50')[0];
  assert.strictEqual(p.x, 1);
  assert.strictEqual(p.y, 0);
});

test('a worst-case max-length stroke fits inside the wire guard', () => {
  const pts = [];
  for (let i = 0; i < WL.MAX_POINTS; i++) pts.push({ x: 1, y: WL.Y_MAX_VH }); // widest digits
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
