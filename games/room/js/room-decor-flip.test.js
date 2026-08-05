/* node --test room-decor-flip.test.js — the left-right mirror on placed decor.
   Loads the REAL room-decorations.js in a sandbox behind a canvas context that
   records its transform, so what is asserted is where a pixel actually LANDS,
   not that a scale() call was made. The thing worth guarding is that a flip
   turns the picture round WITHOUT moving it: the box, the footprint and the
   tap target all have to come out unchanged, or a flipped piece would jump
   sideways and stop being where you grabbed it. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const RW = 800, RH = 500;   // room size in canvas pixels

/* A 2d context that keeps a real 2x3 affine matrix, so a mirrored draw can be
   asked where its corners ended up. Only the calls room-decorations.js makes
   are implemented. */
function fakeCtx() {
  const ops = [];
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [];
  const mul = (n) => {
    m = {
      a: m.a * n.a + m.c * n.b,
      b: m.b * n.a + m.d * n.b,
      c: m.a * n.c + m.c * n.d,
      d: m.b * n.c + m.d * n.d,
      e: m.a * n.e + m.c * n.f + m.e,
      f: m.b * n.e + m.d * n.f + m.f,
    };
  };
  const map = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  return {
    ops,
    save() { stack.push({ ...m }); },
    restore() { const p = stack.pop(); if (p) m = p; },
    translate(x, y) { mul({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }); },
    scale(x, y) { mul({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); },
    rotate() {},
    clip() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {},
    fillRect(x, y, w) { ops.push({ kind: 'rect', cx: map(x + w / 2, y).x }); },
    createLinearGradient: () => ({ addColorStop() {} }),
    drawImage(art, x, y, w, h) {
      // Where the picture's left and right edges actually landed.
      ops.push({ kind: 'image', art, left: map(x, y).x, right: map(x + w, y).x, top: map(x, y).y, w, h });
    },
    fillText(text, x, y) {
      ops.push({ kind: 'text', text, x: map(x, y).x, y: map(x, y).y });
    },
    get depth() { return stack.length; },
  };
}

// A picture that has already "loaded": decorArtBox needs naturalWidth to size it.
function fakeImage() {
  return function Image() {
    this.src = '';
    this.naturalWidth = 200;
    this.naturalHeight = 100;
    this.addEventListener = function () {};
  };
}

function decorSandbox(placedDecors) {
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN,
    Image: fakeImage(),
    // decorArtHitBox measures against the live room element.
    document: {
      getElementById: (id) => (id === 'roomView' ? { clientWidth: RW, clientHeight: RH } : null),
    },
    roomData: { placedDecors },
    DECORATIONS: [
      { id: 'piano',  emoji: '🎹', name: 'Upright Piano', cost: 700, category: 'floor', dx: 0.30, dy: 0.82 },
      { id: 'katana', emoji: '⚔️', name: 'Crossed Swords', cost: 650, category: 'wall',  dx: 0.50, dy: 0.08 },
      // No artwork of its own → drawn as its emoji, and still flippable.
      { id: 'nopic',  emoji: '🪑', name: 'Art-less Chair', cost: 10,  category: 'floor', dx: 0.40, dy: 0.90 },
      { id: 'decor_capybara_onsen', emoji: '♨️', name: 'Hot Spring', cost: 0, category: 'floor', dx: 0.52, dy: 0.86, unlockOnly: true },
      { id: 'rug_zebra', emoji: '🦓', name: 'Zebra Rug', cost: 450, category: 'rug', dx: 0.38, dy: 0.82 },
    ],
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-decorations.js'), 'utf8'), sandbox);
  return sandbox;
}

test('an un-flipped piece draws exactly where its box says', () => {
  const sb = decorSandbox([{ id: 'piano', x: 0.3, y: 0.82 }]);
  const ctx = fakeCtx();
  sb.drawFloorDecorations(ctx, RW, RH);
  const box = sb.decorArtBox('piano', 0.3, 0.82, RW, RH);
  const img = ctx.ops.find(o => o.kind === 'image');
  assert.ok(img, 'the piano was drawn');
  assert.ok(Math.abs(img.left - box.x) < 1e-9);
  assert.ok(Math.abs(img.right - (box.x + box.w)) < 1e-9);
});

test('flipping swaps the picture end for end and leaves the box put', () => {
  const sb = decorSandbox([{ id: 'piano', x: 0.3, y: 0.82, flip: true }]);
  const ctx = fakeCtx();
  sb.drawFloorDecorations(ctx, RW, RH);
  const box = sb.decorArtBox('piano', 0.3, 0.82, RW, RH);
  const img = ctx.ops.find(o => o.kind === 'image');
  // What was the left edge now lands on the right edge, and vice versa: the
  // picture is mirrored about the box's own centre line.
  assert.ok(Math.abs(img.left - (box.x + box.w)) < 1e-9, 'left edge landed on the right');
  assert.ok(Math.abs(img.right - box.x) < 1e-9, 'right edge landed on the left');
  // Same footprint: the span covered is identical, just traversed backwards.
  assert.ok(Math.abs(Math.abs(img.right - img.left) - box.w) < 1e-9);
  assert.ok(Math.abs(img.top - box.y) < 1e-9, 'nothing moved vertically');
});

test('the mirror is undone afterwards, so the next piece is not flipped too', () => {
  const sb = decorSandbox([
    { id: 'piano', x: 0.3, y: 0.82, flip: true },
    { id: 'nopic', x: 0.6, y: 0.90 },
  ]);
  const ctx = fakeCtx();
  sb.drawFloorDecorations(ctx, RW, RH);
  assert.equal(ctx.depth, 0, 'every save() was matched by a restore()');
  const emoji = ctx.ops.find(o => o.kind === 'text');
  assert.ok(Math.abs(emoji.x - 0.6 * RW) < 1e-9, 'the un-flipped neighbour drew upright');
});

test('a wall hanging flips the same way a floor piece does', () => {
  const sb = decorSandbox([{ id: 'katana', x: 0.5, y: 0.08, flip: true }]);
  const ctx = fakeCtx();
  sb.drawWallDecorations(ctx, RW, RH);
  const box = sb.decorArtBox('katana', 0.5, 0.08, RW, RH);
  const img = ctx.ops.find(o => o.kind === 'image');
  assert.ok(Math.abs(img.left - (box.x + box.w)) < 1e-9);
  assert.ok(Math.abs(img.right - box.x) < 1e-9);
});

/* The pieces with no artwork are drawn as their emoji, centred on the anchor.
   Mirroring about that same anchor is what keeps them from sliding. */
test('an art-less piece flips about its own anchor', () => {
  const sb = decorSandbox([{ id: 'nopic', x: 0.4, y: 0.9, flip: true }]);
  const ctx = fakeCtx();
  sb.drawFloorDecorations(ctx, RW, RH);
  const emoji = ctx.ops.find(o => o.kind === 'text');
  assert.ok(Math.abs(emoji.x - 0.4 * RW) < 1e-9, 'centre stayed put');
  assert.ok(Math.abs(emoji.y - 0.9 * RH) < 1e-9);
});

/* The collection reward a pet actually sits in. It is drawn by its own code
   rather than drawDecorArt, so the flip has to be wired there separately — and
   the water line a soaking pet is parked on must not move when it is. */
test('the hot spring flips without moving where a pet soaks', () => {
  const sb = decorSandbox([{ id: 'decor_capybara_onsen', x: 0.52, y: 0.86, flip: true }]);
  const before = sb.onsenSoakPoint(RW, RH);
  const ctx = fakeCtx();
  sb.drawFloorDecorations(ctx, RW, RH);
  const img = ctx.ops.find(o => o.kind === 'image');
  const cx = 0.52 * RW, w = RW * 0.42;
  assert.ok(Math.abs(img.left - (cx + w / 2)) < 1e-9, 'the spring is mirrored');
  assert.ok(Math.abs(img.right - (cx - w / 2)) < 1e-9);
  sb.roomData.placedDecors[0].flip = false;
  assert.deepEqual(sb.onsenSoakPoint(RW, RH), before, 'the soak point is unchanged by a flip');
});

/* Hit-testing measures the same box the drawing does. If a flip moved the box,
   what you grab would drift away from what you see. */
test('the tap target is identical flipped and un-flipped', () => {
  const plain = decorSandbox([{ id: 'piano', x: 0.3, y: 0.82 }]);
  const flipped = decorSandbox([{ id: 'piano', x: 0.3, y: 0.82, flip: true }]);
  assert.deepEqual(flipped.decorArtHitBox('piano', 0.3, 0.82), plain.decorArtHitBox('piano', 0.3, 0.82));
});

test('isDecorFlipped answers for placed, unplaced and never-flipped pieces', () => {
  const sb = decorSandbox([{ id: 'piano', x: 0.3, y: 0.82, flip: true }, { id: 'katana', x: 0.5, y: 0.08 }]);
  assert.equal(sb.isDecorFlipped('piano'), true);
  assert.equal(sb.isDecorFlipped('katana'), false);
  assert.equal(sb.isDecorFlipped('nopic'), false);   // not in the room at all
});

/* The rug is procedural paths rather than a picture, and it is the one piece
   read from a single placed entry rather than a list — its own path to the
   flag. The zebra's slanted stripes are what makes the mirror visible. */
test('a rug turns about its own centre', () => {
  const floorY = RH * 0.66;
  const rugCX = 0.38 * RW;

  const plainCtx = fakeCtx();
  decorSandbox([{ id: 'rug_zebra', x: 0.38, y: 0.82 }]).drawRug(plainCtx, RW, RH, floorY);
  const flipCtx = fakeCtx();
  decorSandbox([{ id: 'rug_zebra', x: 0.38, y: 0.82, flip: true }]).drawRug(flipCtx, RW, RH, floorY);

  const stripes = (c) => c.ops.filter(o => o.kind === 'rect').map(o => o.cx);
  const plain = stripes(plainCtx), flipped = stripes(flipCtx);
  assert.ok(plain.length > 1, 'the zebra drew its stripes');
  assert.equal(flipped.length, plain.length);
  // Every stripe landed at its own reflection in the rug's centre line.
  plain.forEach((x, i) => assert.ok(Math.abs(flipped[i] - (2 * rugCX - x)) < 1e-9));
  assert.equal(flipCtx.depth, 0, 'save/restore stayed balanced');
});
