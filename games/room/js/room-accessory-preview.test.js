/* node --test room-accessory-preview.test.js — the little "cat wearing it"
   picture on every accessory card and every gacha prize.

   It went blank once and nothing caught it. PET_HEAD_OFFSETS holds a SET of
   anchors for the sprite pets — {front, side, sleep} — and the two previews
   read `.hx` straight off the table, which a set does not have. `s * undefined`
   is NaN, and a canvas silently DROPS every call it is handed a NaN in, so the
   head, the ears, the eyes and the accessory all vanished without one error in
   the console.

   So these tests do not check pixels. They load the REAL room-accessories.js
   behind a context that fails on the first non-finite number it is asked to
   draw with — the exact thing a canvas would have swallowed. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;

// The real accessory catalogue, sliced out of room-base.js (a browser global
// there, not a module) so the list under test is the shipped one.
function accessoryCatalogue() {
  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const start = base.indexOf('const PET_ACCESSORIES = [');
  assert.ok(start > 0, 'PET_ACCESSORIES still lives in room-base.js');
  const end = base.indexOf('\n    ];', start) + '\n    ];'.length;
  return base.slice(start, end);
}

/* A context that records what it was asked to draw and refuses anything a
   canvas would quietly ignore. */
function strictCtx() {
  const bad = [], drawn = [];
  const check = (name, args) => {
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) { bad.push(name + '(' + args.join(',') + ')'); return; }
    }
    drawn.push(name);
  };
  const ctx = { bad, drawn, canvas: { width: 60, height: 60 } };
  for (const m of ['clearRect', 'fillRect', 'strokeRect', 'translate', 'scale', 'rotate',
                   'moveTo', 'lineTo', 'arc', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo',
                   'rect', 'roundRect', 'arcTo', 'setLineDash', 'fillText', 'strokeText',
                   // The accessories are drawings now, so this is where a NaN
                   // would land — and a canvas drops a drawImage with one in it
                   // exactly as silently as it dropped the paths.
                   'drawImage']) {
    ctx[m] = (...args) => check(m, args);
  }
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip']) {
    ctx[m] = () => {};
  }
  ctx.createLinearGradient = (...args) => { check('createLinearGradient', args); return { addColorStop() {} }; };
  ctx.createRadialGradient = (...args) => { check('createRadialGradient', args); return { addColorStop() {} }; };
  return ctx;
}

function accSandbox() {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, Promise,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    /* Stands in for the browser's Image. It reports a size straight away, which
       a real one does not — the point here is to exercise the drawing that
       happens once a picture HAS arrived, not the wait. */
    Image: function () {
      this.naturalWidth = 200; this.naturalHeight = 160;
      this.addEventListener = () => {};
    },
    T: (s) => s, showToast() {}, saveRoom: () => Promise.resolve(true),
    fitCanvas() {}, getActivePets: () => [], getPet: () => null, petDisplayName: () => 'Pet',
    renderAccessoryShop() {}, renderAll() {},
    // The rounded backdrop comes from room-pets.js; only its arithmetic matters here.
    roundRectPath: (ctx, x, y, w, h, r) => ctx.rect(x, y, w, h) || ctx.arc(x + r, y + r, r, 0, 1),
    roomData: { pets: [], ownedAccessories: [] },
    petStates: {}, PETS: [],
    currentUid: 'me', viewingUid: 'me', currentLayer: 1,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(accessoryCatalogue(), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-accessories.js'), 'utf8'), sandbox);
  return sandbox;
}

const sb = accSandbox();
const POSES = ['front', 'side', 'sleep'];

/* `const` at the top of a script lands in the context's global LEXICAL scope,
   not on the sandbox object — the very thing that makes these tables reachable
   from the page's other scripts but invisible as properties. Evaluate the name
   inside the context to get at them. Objects come back from another realm, so
   they are compared as JSON rather than by identity or prototype. */
const evalIn = (expr) => vm.runInContext(expr, sb);
const ACCESSORIES = evalIn('PET_ACCESSORIES');
const HEADS = evalIn('PET_HEAD_OFFSETS');
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('the catalogue and the anchor table both loaded', () => {
  assert.ok(ACCESSORIES.length > 10, 'accessories: ' + ACCESSORIES.length);
  assert.ok(Object.keys(HEADS).length >= 10, 'every pet is in the anchor table');
  assert.equal(typeof sb.petHeadAnchor, 'function');
  assert.equal(typeof sb.drawAccessoryPreview, 'function');
});

/* The heart of the bug: half the table is a set of poses and half is a single
   anchor, and only petHeadAnchor knows the difference. */
test('every pet resolves to a usable anchor in every pose', () => {
  const types = Object.keys(HEADS);
  assert.ok(types.length >= 10, 'all the pets are in the table');
  for (const type of types) {
    for (const pose of POSES) {
      const a = sb.petHeadAnchor(type, pose);
      assert.ok(Number.isFinite(a.hx), type + '/' + pose + ' hx');
      assert.ok(Number.isFinite(a.hy), type + '/' + pose + ' hy');
      assert.ok(Number.isFinite(a.r) && a.r > 0, type + '/' + pose + ' r');
    }
  }
});

test('a pet with a pose SET never leaks the set itself', () => {
  // 'cat' is the one the previews use, and the one that was leaking.
  const set = HEADS.cat;
  assert.ok(set.front && set.side, 'the cat still carries a set');
  assert.equal(set.hx, undefined, 'a set has no anchor of its own — this is the trap');
  same(sb.petHeadAnchor('cat', 'front'), set.front);
});

test('an unknown pose falls back to the side view rather than to nothing', () => {
  same(sb.petHeadAnchor('cat', 'moonwalk'), HEADS.cat.side);
  same(sb.petHeadAnchor('cat'), HEADS.cat.side);
});

test('a pet that is not in the table still gets an anchor', () => {
  const a = sb.petHeadAnchor('nothing_like_this', 'front');
  assert.ok(Number.isFinite(a.hx) && Number.isFinite(a.hy) && a.r > 0);
});

/* Every accessory is a file on disk now. A catalogue entry with no picture
   behind it is not a broken drawing — it is an invisible one, and the shop card
   for it looks like a bare head that someone forgot to finish. */
test('every accessory has a picture, and every picture is named by an accessory', () => {
  const ART = evalIn('ACC_ART');
  for (const acc of ACCESSORIES) {
    assert.ok(ART[acc.draw], acc.id + ' has no ACC_ART entry');
    assert.ok(ART[acc.draw].w > 0, acc.id + ' is drawn at no width');
    const file = path.join(DIR, '..', 'img', 'accessories', acc.draw + '.png');
    assert.ok(fs.existsSync(file), 'no artwork on disk for ' + acc.id + ': ' + file);
  }
  for (const draw of Object.keys(ART)) {
    assert.ok(ACCESSORIES.some(a => a.draw === draw), 'ACC_ART lists ' + draw + ', which nothing wears');
  }
});

/* The regression itself: every card in the shop, drawn for real. */
test('every accessory preview draws, and none of it lands on NaN', () => {
  for (const acc of ACCESSORIES) {
    const ctx = strictCtx();
    sb.drawAccessoryPreview(ctx, acc.id, 60);
    assert.deepEqual(ctx.bad, [], acc.id + ' drew with a non-finite number');
    // Backdrop + head + the accessory itself: a blank canvas is the bug.
    assert.ok(ctx.drawn.length > 6, acc.id + ' drew almost nothing (' + ctx.drawn.length + ' calls)');
    // ...and the accessory specifically, not just the head it sits on.
    assert.ok(ctx.drawn.includes('drawImage'), acc.id + ' drew a bare head — its picture never landed');
  }
});

/* The same drawing worn by a real pet, which is where these anchors are
   actually used — every pet, every pose, every accessory. */
test('every accessory on every pet in every pose draws finite', () => {
  for (const type of Object.keys(HEADS)) {
    for (const pose of POSES) {
      for (const acc of ACCESSORIES) {
        const ctx = strictCtx();
        sb.drawPetAccessory(ctx, type, acc.id, 60, null, pose);
        assert.deepEqual(ctx.bad, [], type + '/' + pose + '/' + acc.id);
      }
    }
  }
});

test('an accessory id that no longer exists draws nothing at all', () => {
  const ctx = strictCtx();
  sb.drawAccessoryPreview(ctx, 'ghost_of_an_accessory', 60);
  assert.deepEqual(ctx.bad, []);
  const empty = strictCtx();
  sb.drawPetAccessory(empty, 'cat', 'ghost_of_an_accessory', 60, null, 'front');
  assert.deepEqual(empty.drawn, [], 'nothing drawn for an unknown id');
});
