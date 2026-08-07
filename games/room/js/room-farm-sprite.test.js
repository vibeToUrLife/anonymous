/* node --test room-farm-sprite.test.js — the farm's baked animal sprites.

   Reported as: "farm 的动物会闪一下闪一下", and on being asked, the animal goes
   away entirely rather than changing size.

   The herd is not painted live. An animal costs 63–80 canvas calls, so each
   walk pose is painted ONCE into an offscreen canvas and blitted from then on
   (_farmAnimalSprite). The cache is keyed by type|variant|pose and is only ever
   thrown away when the drawn SIZE changes.

   Three of the four farm animals are canvas paths and bake fine. The goose is
   drawn from a sheet (games/pets/goose.js), and its drawer paints NOTHING while
   that sheet is still downloading:

       if (!art.naturalWidth) return;   // sheet still downloading

   That is right for a live painter — the bird is missing for a moment and then
   appears. It is wrong for a bake: the empty result was cached under that pose's
   key and never invalidated. The walk is six poses baked lazily as the bird
   walks, so whichever ones happened during the download stayed blank, and the
   goose vanished every time the cycle came back round to one — about eight
   times a second, for the rest of the session.

   Loads the REAL room-farm-view.js in a sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;

// A canvas that records whether anything was actually painted into it.
function fakeCanvas() {
  const c = { width: 0, height: 0, style: {}, painted: 0 };
  const ctx = {
    canvas: c,
    save() {}, restore() {}, setTransform() {}, translate() {}, scale() {}, rotate() {},
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'roundRect',
   'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'drawImage',
   'quadraticCurveTo', 'bezierCurveTo', 'setLineDash', 'clip']
    .forEach((n) => { ctx[n] = () => { c.painted++; }; });
  c.getContext = () => ctx;
  return c;
}

function spriteSandbox() {
  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const start = base.indexOf('const FARM_ANIMALS = [');
  const end = base.indexOf('const FARM_HAPPY_DECAY_PER_DAY');
  const consts = base.slice(start, base.indexOf('\n', end) + 1);

  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise,
    isNaN, parseInt, parseFloat, Infinity, NaN,
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => ({ forEach() {} }),
      createElement: (t) => (t === 'canvas' ? fakeCanvas() : { style: {} }),
    },
    showToast() {}, escapeHtml: (s) => String(s == null ? '' : s), getPlayerName: () => 'T',
    userDocRef: () => { throw new Error('no db'); }, saveRoom: () => Promise.resolve(true),
    renderAll() {}, checkAchievements() {}, logCoin() {},
    visitRoom: () => Promise.resolve(), _syncRoomPanel() {},
    currentUid: 'me', viewingUid: 'me', isFarmView: true,
    fitCanvas(cvs, w, h) { cvs.width = w; cvs.height = h; },
  };
  // The drawer under test, standing in for games/pets/farm-animals.js: it paints
  // only when the artwork is there, exactly like drawGoosePet.
  sandbox.artReady = false;
  sandbox.drawFarmAnimal = function (ctx, type) {
    if (type === 'goose' && !sandbox.artReady) return;   // sheet still downloading
    ctx.fillRect(0, 0, 1, 1);
  };
  sandbox.farmAnimalReady = function (type) {
    return type !== 'goose' || sandbox.artReady;
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(consts, sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-farm.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-farm-view.js'), 'utf8'), sandbox);
  return sandbox;
}

const SIZE = 40, PAL = {};
// The walk phase for pose n, as the draw loop supplies it (t / 120).
function phaseFor(pose) { return (pose + 0.25) / 6 * Math.PI * 2; }

test('the reported bug: a pose baked mid-download does not stay blank', () => {
  const sb = spriteSandbox();

  // The farm opens and the bird walks while goose.png is still on the wire.
  // Poses 0 and 1 come round during that window.
  sb._farmAnimalSprite('goose', '', SIZE, true, phaseFor(0), PAL);
  sb._farmAnimalSprite('goose', '', SIZE, true, phaseFor(1), PAL);

  // The sheet lands. Everything from here on can paint.
  sb.artReady = true;

  for (let pose = 0; pose < 6; pose++) {
    const spr = sb._farmAnimalSprite('goose', '', SIZE, true, phaseFor(pose), PAL);
    assert.ok(spr, 'pose ' + pose + ' produced no sprite at all');
    assert.ok(spr.cvs.painted > 0,
      'pose ' + pose + ' was baked while the sheet was still downloading and the ' +
      'blank was cached — the goose disappears every time the walk cycle comes ' +
      'back round to it, about eight times a second, for the rest of the session');
  }
});

test('nothing is cached while the artwork is missing', () => {
  const sb = spriteSandbox();
  assert.equal(sb._farmAnimalSprite('goose', '', SIZE, true, phaseFor(3), PAL), null,
    'a sprite handed back before the sheet arrived is an empty one');

  sb.artReady = true;
  const spr = sb._farmAnimalSprite('goose', '', SIZE, true, phaseFor(3), PAL);
  assert.ok(spr && spr.cvs.painted > 0, 'the pose must bake for real once the sheet is in');
});

test('a null sprite is what makes the caller fall back to the live painter', () => {
  // drawFarmCanvas does:  if (_spr) drawImage(...); else drawFarmAnimal(...)
  // so returning null is not "draw nothing", it is "draw it live this frame".
  const sb = spriteSandbox();
  assert.equal(sb._farmAnimalSprite('goose', '', SIZE, false, 0, PAL), null);
});

test('the animals drawn from canvas paths are never held up', () => {
  const sb = spriteSandbox();      // artReady is false — irrelevant to these three
  for (const type of ['cow', 'pig', 'horse']) {
    const spr = sb._farmAnimalSprite(type, '', SIZE, true, phaseFor(2), PAL);
    assert.ok(spr && spr.cvs.painted > 0,
      type + ' waited on artwork it does not use — it is drawn with canvas paths');
  }
});

test('a baked pose is reused rather than repainted', () => {
  const sb = spriteSandbox();
  sb.artReady = true;
  const a = sb._farmAnimalSprite('cow', '', SIZE, true, phaseFor(4), PAL);
  const b = sb._farmAnimalSprite('cow', '', SIZE, true, phaseFor(4), PAL);
  assert.equal(a, b, 'the cache missed, so every animal repaints ~80 calls every frame');
});

test('a size change rebuilds the sprites at the new size', () => {
  const sb = spriteSandbox();
  sb.artReady = true;
  const small = sb._farmAnimalSprite('cow', '', 30, true, phaseFor(1), PAL);
  const big = sb._farmAnimalSprite('cow', '', 60, true, phaseFor(1), PAL);
  assert.notEqual(small, big, 'the herd stayed baked at the old size after a resize');
  assert.ok(big.R > small.R);
});
