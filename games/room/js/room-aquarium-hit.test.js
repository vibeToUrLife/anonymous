/* node --test room-aquarium-hit.test.js — tapping the tank's three devices.

   The aquarium canvas had no pointer handling of its own before this: the only
   listener was the one a mini-game attaches while it runs. So these are the
   tank's first tap targets, and the rule the farm learned the hard way applies —
   a rect that does not match what was painted is invisible until someone taps
   and misses.

   Loads the REAL room-aquarium-view.js so the geometry under test is the
   geometry that ships. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const A = require('./room-aquarium.js');

// The tank fills a rounded panel in the page, so these are canvas sizes.
const PHONE = { W: 360, H: 520 };
const NARROW = { W: 300, H: 460 };      // smallest the panel is ever laid out at
const WIDE = { W: 900, H: 600 };
const MIN_TOUCH = 44;                   // the tap target floor this project holds to

function tankSandbox() {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, Promise,
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: { getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, remove() {} }), body: { appendChild() {} } },
    T: (s, v) => { let o = s; if (v) for (const k of Object.keys(v)) o = o.split('{' + k + '}').join(v[k]); return o; },
    I18N: { plural: (n, one, many, v) => (n === 1 ? one : many).split('{n}').join(n) },
    escapeHtml: (s) => String(s == null ? '' : s),
    FISH_TYPES: [], drawFish() {}, logCoin() {}, checkAchievements() {},
    renderAll() {}, visitRoom: () => Promise.resolve(), saveRoom: () => Promise.resolve(true),
    showToast() {},
    db: { collection: () => ({ orderBy: () => ({ limit: () => ({ onSnapshot: () => () => {} }) }) }) },
    userDocRef: () => ({ update: () => Promise.resolve() }),
    firebase: { firestore: { FieldValue: { increment: (n) => n } } },
    currentUid: 'me', viewingUid: 'me',
  };
  for (const k of Object.keys(A)) sandbox[k] = A[k];
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const s = base.indexOf('const AQUARIUM_IDLE_RATES');
  const e = base.indexOf('const FARM_CYCLE_SLOW_MS');
  vm.runInContext(base.slice(s, e), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-aquarium-view.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-aquarium-games.js'), 'utf8'), sandbox);

  sandbox.roomData = {
    coins: 0, aquariumFish: [], aquariumFilter: 0, aquariumLight: 0, aquariumPump: 0,
    aquariumBubbleDay: '', aquariumRaceDay: '',
  };
  return sandbox;
}

const IDS = ['filter', 'light', 'pump'];

test('a tap on the middle of each device finds that device', () => {
  const sb = tankSandbox();
  for (const { W, H } of [PHONE, NARROW, WIDE]) {
    for (const r of sb._aqEquipRects(W, H)) {
      const hit = sb._aqEquipAt(r.x + r.w / 2, r.y + r.h / 2, W, H);
      assert.equal(hit, r.id,
        'at ' + W + '×' + H + ' the middle of ' + r.id + ' resolved to ' + hit);
    }
  }
});

test('all three devices are there, once each', () => {
  const sb = tankSandbox();
  const ids = sb._aqEquipRects(PHONE.W, PHONE.H).map(r => r.id).sort();
  assert.deepEqual(ids, IDS.slice().sort());
});

test('open water is not a device', () => {
  const sb = tankSandbox();
  const { W, H } = PHONE;
  // Dead centre of the tank: the fish swim here, nothing is mounted here.
  assert.equal(sb._aqEquipAt(W * 0.5, H * 0.55, W, H), null);
});

/* Every device has to stay thumb-sized even where its art is a thin strip — the
   light is a bar a few pixels tall and would otherwise be unhittable. */
test('no device is smaller than a thumb, at the narrowest tank', () => {
  const sb = tankSandbox();
  for (const r of sb._aqEquipRects(NARROW.W, NARROW.H)) {
    assert.ok(r.w >= MIN_TOUCH, r.id + ' is ' + Math.round(r.w) + 'px wide');
    assert.ok(r.h >= MIN_TOUCH, r.id + ' is ' + Math.round(r.h) + 'px tall');
  }
});

/* Overlapping rects mean one device eats another's taps, and which one wins
   depends on iteration order — the exact bug class the farm's "nearest wins"
   rule exists to prevent. Cheaper to just not overlap. */
test('no two devices overlap, at any tank size', () => {
  const sb = tankSandbox();
  for (const { W, H } of [PHONE, NARROW, WIDE]) {
    const rects = sb._aqEquipRects(W, H);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const clash = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!clash, a.id + ' overlaps ' + b.id + ' at ' + W + '×' + H);
      }
    }
  }
});

test('every device stays inside the tank', () => {
  const sb = tankSandbox();
  for (const { W, H } of [PHONE, NARROW, WIDE]) {
    for (const r of sb._aqEquipRects(W, H)) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H,
        r.id + ' hangs off the ' + W + '×' + H + ' tank');
    }
  }
});

/* While a mini-game runs the canvas belongs to the game — its own listener is
   reading the same taps, and opening a shop mid-round would be a lost tap and a
   lost round. */
test('a running mini-game owns the canvas', () => {
  const sb = tankSandbox();
  const r = sb._aqEquipRects(PHONE.W, PHONE.H)[0];
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;

  assert.equal(sb._aqTankTap(cx, cy, PHONE.W, PHONE.H), r.id, 'idle: the tap opens the device');
  vm.runInContext('_aqGame = "bubble"', sb);
  assert.equal(sb._aqTankTap(cx, cy, PHONE.W, PHONE.H), null, 'mid-round: the game keeps it');
});

test('a visitor tapping the host equipment opens nothing', () => {
  const sb = tankSandbox();
  sb.viewingUid = 'someone-else';
  const r = sb._aqEquipRects(PHONE.W, PHONE.H)[0];
  assert.equal(sb._aqTankTap(r.x + r.w / 2, r.y + r.h / 2, PHONE.W, PHONE.H), null);
});
