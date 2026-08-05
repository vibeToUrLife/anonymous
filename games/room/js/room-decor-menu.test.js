/* node --test room-decor-menu.test.js — the tap-a-decoration menu's geometry.
   Loads the REAL room-actions.js in a sandbox (same shape as room-visit.test.js)
   and asks the two pure functions behind the menu where things are: which box a
   placed piece occupies, and where the little card lands next to it. The DOM
   wiring is not the interesting part — the arithmetic is, because it decides
   whether the menu covers the piece you just tapped or runs off the stage. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const RW = 800, RH = 500;   // room stage in canvas pixels
const MW = 150, MH = 60;    // a measured menu

function fakeEl() {
  return {
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} },
    dataset: {}, style: {}, innerHTML: '', textContent: '',
    querySelector: () => fakeEl(), querySelectorAll: () => [],
  };
}

function actionsSandbox() {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, Promise,
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0,
    document: { getElementById: () => fakeEl(), querySelectorAll: () => [], body: fakeEl() },
    window: null,
    T: (s) => s, showToast() {}, escapeHtml: (s) => String(s == null ? '' : s),
    getPlayerName: () => 'T', saveRoom: () => Promise.resolve(true),
    renderAll() {}, renderFarmPanel() {}, drawFarmCanvas() {}, checkAchievements() {},
    logCoin() {}, closeFarm() {}, closePetStatus() {}, migratePets: (d) => d.pets || [],
    PETS: [], DECORATIONS: [], PLANT_LEVELS: [], PET_COLORS: {},
    roomData: { placedDecors: [] },
    currentUid: 'me', viewingUid: 'me', currentLayer: 1, isOutsideView: false,
    userDocRef: () => ({ get: () => Promise.resolve({ exists: false, data: () => ({}) }) }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-actions.js'), 'utf8'), sandbox);
  return sandbox;
}

const sb = actionsSandbox();

/* DECOR_HIT_SIZES marks a piece that STANDS on the floor with base:true — its
   anchor is the bottom, so the box runs upward. Everything else is centred. */
test('a floor-standing piece boxes upward from its anchor', () => {
  const box = sb.decorNormBox({ id: 'piano', x: 0.30, y: 0.82 });   // { w: 0.14, h: 0.30, base: true }
  assert.ok(Math.abs(box.x0 - 0.23) < 1e-9);
  assert.ok(Math.abs(box.x1 - 0.37) < 1e-9);
  assert.ok(Math.abs(box.y0 - 0.52) < 1e-9, 'top is a full height above the feet');
  assert.ok(Math.abs(box.y1 - 0.82) < 1e-9, 'bottom is where it stands');
});

test('a hanging piece boxes around its anchor', () => {
  const box = sb.decorNormBox({ id: 'clock', x: 0.50, y: 0.20 });   // { w: 0.12, h: 0.12 }
  assert.ok(Math.abs(box.y0 - 0.14) < 1e-9);
  assert.ok(Math.abs(box.y1 - 0.26) < 1e-9);
});

test('a piece with neither artwork nor a size has no box, and cannot be grabbed', () => {
  assert.equal(sb.decorNormBox({ id: 'nothing_like_this', x: 0.5, y: 0.5 }), null);
  assert.equal(sb.decorHitTest(0.5, 0.5, { id: 'nothing_like_this', x: 0.5, y: 0.5 }), false);
});

// The grab test and the menu now read the SAME box, which is the point of
// splitting it out — what you touch cannot drift from where the menu opens.
test('the hit test agrees with the box on every edge', () => {
  const p = { id: 'piano', x: 0.30, y: 0.82 };
  const b = sb.decorNormBox(p);
  assert.ok(sb.decorHitTest((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, p), 'the middle hits');
  assert.ok(sb.decorHitTest(b.x0 + 1e-6, b.y0 + 1e-6, p), 'the top-left corner hits');
  assert.ok(!sb.decorHitTest(b.x0 - 0.01, (b.y0 + b.y1) / 2, p), 'just left of it misses');
  assert.ok(!sb.decorHitTest((b.x0 + b.x1) / 2, b.y1 + 0.01, p), 'just below it misses');
});

test('the menu opens centred over the piece and clear above it', () => {
  const box = { x0: 0.40, x1: 0.50, y0: 0.50, y1: 0.80 };
  const pos = sb.decorMenuPlacement(box, RW, RH, MW, MH);
  assert.equal(pos.left, 0.45 * RW - MW / 2, 'centred on the piece');
  assert.equal(pos.top, 0.50 * RH - MH - 8, 'sits above it with a gap');
});

/* Wall hangings live near the ceiling, where there is no room above. */
test('a piece near the ceiling gets its menu underneath instead', () => {
  const box = { x0: 0.45, x1: 0.55, y0: 0.02, y1: 0.14 };
  const pos = sb.decorMenuPlacement(box, RW, RH, MW, MH);
  assert.equal(pos.top, 0.14 * RH + 8, 'dropped below the piece');
});

test('a piece against either wall keeps its menu on the stage', () => {
  const left = sb.decorMenuPlacement({ x0: 0.00, x1: 0.06, y0: 0.5, y1: 0.8 }, RW, RH, MW, MH);
  assert.equal(left.left, 4, 'clamped to the left edge, not off it');
  const right = sb.decorMenuPlacement({ x0: 0.94, x1: 1.00, y0: 0.5, y1: 0.8 }, RW, RH, MW, MH);
  assert.equal(right.left, RW - MW - 4, 'clamped to the right edge');
});

/* A phone in portrait: the stage can be shorter than the menu is tall once a
   piece sits low. Clamping must still land inside rather than at a negative. */
test('a stage barely taller than the menu still places it inside', () => {
  const pos = sb.decorMenuPlacement({ x0: 0.4, x1: 0.6, y0: 0.90, y1: 0.98 }, 320, 70, MW, MH);
  assert.ok(pos.top >= 4 && pos.top <= 70 - MH, 'inside the stage');
  assert.ok(pos.left >= 4, 'inside the stage');
});
