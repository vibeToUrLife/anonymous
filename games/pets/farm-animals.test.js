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
  /* Sheets, in three states rather than two, because the middle one is where
     the flicker lives: `loaded` is fetched and decoded, `headerOnly` is a PNG
     whose first thirty bytes have arrived — width and height known, picture
     not — and neither means nothing has started. A real Image reports
     naturalWidth through the whole download and only flips `complete` at the
     end of it. */
  sandbox.loaded = {};
  sandbox.headerOnly = {};
  sandbox.Image = function () {
    const im = { _src: '', naturalWidth: 0, naturalHeight: 0, complete: false };
    Object.defineProperty(im, 'src', {
      get() { return im._src; },
      set(v) {
        im._src = v;
        const file = v.split('/').pop().split('?')[0];
        if (sandbox.loaded[file]) { im.naturalWidth = 400; im.naturalHeight = 200; im.complete = true; }
        else if (sandbox.headerOnly[file]) { im.naturalWidth = 400; im.naturalHeight = 200; }
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

/* ═══════════════════════════════════════════════════════════════
   The flicker, second time round: naturalWidth is not "loaded"
   ═══════════════════════════════════════════════════════════════ */

/* A PNG carries its width and height in the first thirty bytes, so naturalWidth
   goes non-zero when the HEADER lands and stays non-zero for the rest of the
   download. A readiness test built on it therefore says yes through the exact
   window it exists to exclude — which is how "farm 的动物会闪一下闪一下" came
   back after being fixed: the check was there, but it was answering a question
   about the header rather than about the picture. */
test('a half-downloaded sheet is not ready, however wide it says it is', () => {
  const sb = petSandbox();
  sb.headerOnly['pig.png'] = true;
  const art = sb.farmAnimalArt('pig');
  assert.ok(art.naturalWidth > 0, 'the header has landed — this is the trap');
  assert.equal(art.complete, false, 'the picture has not');
  assert.equal(sb.farmAnimalReady('pig'), false,
    'a bake taken here caches a blank, and nothing ever drops it');
});

test('the same window catches the goose', () => {
  const sb = petSandbox();
  // goose.js owns its own sheet, so stand one in mid-download and give the
  // module's real readiness rule to match.
  const sheet = { naturalWidth: 400, naturalHeight: 200, complete: false };
  sb.gooseSheet = () => sheet;
  sb.goosePetReady = () => !!(sheet.complete && sheet.naturalWidth);
  assert.equal(sb.farmAnimalReady('goose'), false, 'the header is not the picture');
  sheet.complete = true;
  assert.equal(sb.farmAnimalReady('goose'), true, 'and once it lands it is ready');
});

test('a fully downloaded sheet is ready', () => {
  const sb = petSandbox();
  sb.loaded['cow.png'] = true;
  assert.equal(sb.farmAnimalReady('cow'), true);
});

/* The farm has to be able to WATCH the art, not just test it: a readiness check
   cannot un-bake a blank stored before it could have passed. */
test('every farm type hands back the image it is drawn from', () => {
  const sb = petSandbox();
  sb.gooseSheet = () => ({ marker: 'goose' });
  for (const type of ['pig', 'cow', 'horse']) {
    const art = sb.farmAnimalArt(type);
    assert.ok(art && 'naturalWidth' in art, type + ' has no image to watch');
  }
  assert.equal(sb.farmAnimalArt('goose').marker, 'goose', 'the goose comes from its own module');
  assert.equal(sb.farmAnimalArt('nothing_like_this'), null);
});
