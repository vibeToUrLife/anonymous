/* node --test farm-animals.test.js — the farm's animal drawers.

   Loads the REAL farm-animals.js in a sandbox and stubs the two things it
   reaches for at load: document.currentScript (it resolves its sheets against
   its own URL) and Image.

   The case that started this file: "farm 的动物会闪一下闪一下 … 直接不见", and
   only ever the goose. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function petSandbox() {
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, URL,
    document: { currentScript: { src: 'https://example.test/games/pets/farm-animals.js' } },
  };
  // Sheets: naturalWidth 0 until a test says they have landed.
  sandbox.loaded = {};
  sandbox.Image = function () {
    const im = { _src: '', naturalWidth: 0, naturalHeight: 0 };
    Object.defineProperty(im, 'src', {
      get() { return im._src; },
      set(v) {
        im._src = v;
        if (sandbox.loaded[v.split('/').pop()]) { im.naturalWidth = 400; im.naturalHeight = 200; }
      },
    });
    return im;
  };
  // The goose lives in its own file; stand in for it and record the call.
  sandbox.gooseCalls = [];
  sandbox.drawGoosePet = function (ctx, s, lp, moving) {
    sandbox.gooseCalls.push({ s: s, lp: lp, moving: moving });
  };
  sandbox.goosePetReady = () => !!sandbox.loaded['goose.png'];
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'farm-animals.js'), 'utf8'), sandbox);
  return sandbox;
}

// A canvas context that records what was blitted.
function recCtx() {
  const c = { draws: [] };
  c.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
    c.draws.push({ sx: sx, sy: sy, sw: sw, sh: sh, dx: dx, dy: dy, dw: dw, dh: dh });
  };
  return c;
}

const TAU = Math.PI * 2;

// Top-level `const` in a classic script is a lexical binding, not a property of
// the sandbox, so a layout constant has to be evaluated rather than read off it
// the way its `function` declarations can be.
function constant(sb, name) { return vm.runInContext(name, sb); }

/* ═══════════════════════════════════════════════════════════════
   The reported bug: a standing goose was a different bird
   ═══════════════════════════════════════════════════════════════ */

test('a standing goose is drawn side-on, not turned to face you', () => {
  const sb = petSandbox();
  sb.drawFarmAnimal({}, 'goose', 40, 0, false, null);
  assert.equal(sb.gooseCalls[0].moving, true,
    "the farm asked drawGoosePet for its idle pose, which is the bird seen from " +
    "the FRONT — about half the width of the side-on walk cells. A goose that " +
    "reached the end of its wander swapped a wide bird for a narrow sliver in " +
    "one frame, which reads as blinking out rather than turning around");
});

test('standing holds the first walk cell rather than freezing mid-stride', () => {
  const sb = petSandbox();
  sb.drawFarmAnimal({}, 'goose', 40, 4.2, false, null);   // clock happens to be anywhere
  assert.equal(sb.gooseCalls[0].lp, 0,
    'a standing goose froze at whatever phase the clock was on, so two standing ' +
    'geese could hold different legs');
});

test('a walking goose still walks', () => {
  const sb = petSandbox();
  sb.drawFarmAnimal({}, 'goose', 40, 2.5, true, null);
  assert.deepEqual({ lp: sb.gooseCalls[0].lp, moving: sb.gooseCalls[0].moving }, { lp: 2.5, moving: true });
});

/* ═══════════════════════════════════════════════════════════════
   The artwork-backed three
   ═══════════════════════════════════════════════════════════════ */

test('nothing is painted before the sheet lands', () => {
  const sb = petSandbox();
  const ctx = recCtx();
  sb.drawFarmAnimal(ctx, 'pig', 40, 0, true, null);
  assert.equal(ctx.draws.length, 0, 'a half-downloaded sheet must paint nothing, not a blank');
  assert.equal(sb.farmAnimalReady('pig'), false);
});

test('the walk alternates evenly across the poses the farm bakes', () => {
  const sb = petSandbox();
  sb.loaded['pig.png'] = true;
  const cells = [];
  for (let pose = 0; pose < 6; pose++) {
    const ctx = recCtx();
    sb.drawFarmAnimal(ctx, 'pig', 40, (pose + 0.5) / 6 * TAU, true, null);
    cells.push(ctx.draws[0].sx / ctx.draws[0].sw);      // which cell of the strip
  }
  assert.deepEqual(cells, [0, 0, 0, 1, 1, 1],
    'the six baked poses landed on the two cells as ' + cells.join(',') +
    ' — an uneven split makes the walk limp');
});

test('a standing animal holds one cell', () => {
  const sb = petSandbox();
  sb.loaded['cow.png'] = true;
  const ctx = recCtx();
  sb.drawFarmAnimal(ctx, 'cow', 40, 3.1, false, null);
  assert.equal(ctx.draws[0].sx, 0);
});

test('the feet land on the ground line whatever the animal', () => {
  const sb = petSandbox();
  sb.loaded['pig.png'] = sb.loaded['horse.png'] = true;
  for (const type of ['pig', 'horse']) {
    const ctx = recCtx();
    sb.drawFarmAnimal(ctx, type, 40, 0, true, null);
    const d = ctx.draws[0];
    assert.equal(Math.round((d.dy + d.dh) * 1000) / 1000, Math.round(40 * constant(sb, 'FARM_ART_FEET_Y') * 1000) / 1000,
      type + ' does not stand on the line the farm paints its shadow on');
    assert.equal(d.dx, -d.dw / 2, type + ' is not centred on the origin');
  }
});

test('readiness is answered per type', () => {
  const sb = petSandbox();
  sb.loaded['pig.png'] = true;
  sb.drawFarmAnimal(recCtx(), 'pig', 40, 0, true, null);     // makes the Image
  assert.equal(sb.farmAnimalReady('pig'), true);
  assert.equal(sb.farmAnimalReady('cow'), false);
  assert.equal(sb.farmAnimalReady('goose'), false);
  assert.equal(sb.farmAnimalReady('unicorn'), false, 'an unknown type must never claim to be ready');
});

/* ═══════════════════════════════════════════════════════════════
   Coats
   ═══════════════════════════════════════════════════════════════ */

test('a rare coat has a filter and a common one does not', () => {
  const sb = petSandbox();
  assert.ok(sb.farmCoatFilter('cow', 'brown'));
  assert.equal(sb.farmCoatFilter('cow', 'classic'), '');
  assert.equal(sb.farmCoatFilter('cow', undefined), '');
  assert.equal(sb.farmCoatFilter('unicorn', 'brown'), '');
});

test('the rainbow gives the white goose a hue to rotate', () => {
  const sb = petSandbox();
  assert.match(sb.farmRgbFilter(90, 'goose'), /^sepia\(/,
    'hue-rotate leaves grey where it is, so a white bird stayed white through ' +
    'the whole sweep — the rarest coat in the game rendering as the common one');
  assert.doesNotMatch(sb.farmRgbFilter(90, 'pig'), /sepia/,
    'the pig carries its own colour and should sweep out of it');
});

test('the rainbow angle wraps instead of running off', () => {
  const sb = petSandbox();
  assert.match(sb.farmRgbFilter(370, 'pig'), /hue-rotate\(10deg\)/);
  assert.match(sb.farmRgbFilter(-30, 'pig'), /hue-rotate\(330deg\)/);
});
