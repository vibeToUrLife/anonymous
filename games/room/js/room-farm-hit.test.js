/* node --test room-farm-hit.test.js — farm canvas hit-testing.
   Loads the REAL room-farm-view.js in a sandbox (its layout constants and
   drawing geometry are the thing under test) and asks _farmSkyTarget which
   target a tap resolves to. Guards the "Tap to sell!" banner against the
   workshop huts it sits on top of on a phone. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;

// Phone-ish and laptop-ish farm stages. The farm view is a rounded panel inside
// the page, so these are the canvas size, not the viewport.
const PHONE = { W: 360, H: 520 };
const NARROW = { W: 400, H: 620 };
const WIDE = { W: 900, H: 600 };

function farmSandbox(machines) {
  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const start = base.indexOf('const FARM_ANIMALS = [');
  const end = base.indexOf('const FARM_HAPPY_DECAY_PER_DAY');
  const consts = base.slice(start, base.indexOf('\n', end) + 1);

  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN,
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: { getElementById: () => null, querySelectorAll: () => ({ forEach() {} }) },
    showToast() {}, escapeHtml: (s) => String(s == null ? '' : s), getPlayerName: () => 'T',
    userDocRef: () => { throw new Error('no db'); }, saveRoom: () => Promise.resolve(true),
    renderAll() {}, checkAchievements() {}, logCoin() {}, drawFarmAnimal() {},
    visitRoom: () => Promise.resolve(), _syncRoomPanel() {},
    currentUid: 'me', viewingUid: 'me', isFarmView: true,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(consts, sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-farm.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-farm-view.js'), 'utf8'), sandbox);

  const owned = {};
  for (const id of machines) owned[id] = { owned: true, slots: 1, jobs: [0] };
  sandbox.roomData = {
    coins: 0, farmAnimals: [], farmDrops: [], farmStock: {}, farmPlots: [],
    farmMachines: owned, farmCartLeftAt: 0, farmCartWanted: null, farmCartSold: null,
  };
  return sandbox;
}

// Centre of the "Tap to sell!" banner, from the same numbers _drawMerchantCart
// uses: bnW = s*1.1, bnX = cx - s*0.62 - bnW.
function bannerCentre(sb, W, H) {
  const at = sb._farmCartPos(W);
  const s = sb._farmCartSize(W, H);
  const cx = at.x * W;
  const bnW = s * 1.1;
  const bnX = cx - s * 0.62 - bnW;
  return { x: (bnX + bnW / 2) / W, y: at.y };
}

const ALL = ['dairy', 'bakery', 'oven', 'butcher', 'forge'];

/* ── The reported bug ── */

test('a tap on the "Tap to sell!" banner opens the cart, not a workshop (phone)', () => {
  const sb = farmSandbox(ALL);
  const b = bannerCentre(sb, PHONE.W, PHONE.H);
  const hit = sb._farmSkyTarget(b.x, b.y, PHONE.W, PHONE.H);
  assert.equal(hit, '#cart',
    'tapping the words "Tap to sell!" resolved to ' + hit + ' — the banner is drawn ' +
    'well to the left of the plane body, right over the workshop huts');
});

test('the whole banner, end to end, belongs to the cart on a phone', () => {
  const sb = farmSandbox(ALL);
  const at = sb._farmCartPos(PHONE.W), s = sb._farmCartSize(PHONE.W, PHONE.H);
  const bnW = s * 1.1, bnX = at.x * PHONE.W - s * 0.62 - bnW;
  for (let f = 0; f <= 1.0001; f += 0.25) {
    const x = (bnX + bnW * f) / PHONE.W;
    const hit = sb._farmSkyTarget(x, at.y, PHONE.W, PHONE.H);
    assert.equal(hit, '#cart', 'banner at ' + Math.round(f * 100) + '% resolved to ' + hit);
  }
});

test('the plane body and propeller still open the cart', () => {
  for (const st of [PHONE, NARROW, WIDE]) {
    const sb = farmSandbox(ALL);
    const at = sb._farmCartPos(st.W), s = sb._farmCartSize(st.W, st.H);
    for (const dx of [-0.48, 0, 0.56]) {          // tail, fuselage, propeller
      const x = (at.x * st.W + s * dx) / st.W;
      assert.equal(sb._farmSkyTarget(x, at.y, st.W, st.H), '#cart',
        'plane body at ' + st.W + 'x' + st.H + ', offset ' + dx);
    }
  }
});

/* ── The huts must keep their own taps ── */

test('every owned hut still answers a tap on itself', () => {
  for (const st of [PHONE, NARROW, WIDE]) {
    const sb = farmSandbox(ALL);
    ALL.forEach(function (id, slot) {
      const p = sb._workshopPos(slot);
      assert.equal(sb._farmSkyTarget(p.x, p.y, st.W, st.H), id,
        id + ' at ' + st.W + 'x' + st.H);
    });
  }
});

test('an unowned hut is not a target — its tap falls through', () => {
  const sb = farmSandbox(['dairy']);          // butcher not built
  const p = sb._workshopPos(3);
  assert.notEqual(sb._farmSkyTarget(p.x, p.y, WIDE.W, WIDE.H), 'butcher');
});

test('a tap between two huts picks the nearer one', () => {
  const sb = farmSandbox(ALL);
  const a = sb._workshopPos(1), b = sb._workshopPos(2);   // bakery, oven
  assert.equal(sb._farmSkyTarget(a.x + (b.x - a.x) * 0.3, a.y, WIDE.W, WIDE.H), 'bakery');
  assert.equal(sb._farmSkyTarget(a.x + (b.x - a.x) * 0.7, a.y, WIDE.W, WIDE.H), 'oven');
});

/* ── The mailbox ── */

test('the mailbox answers its own tap and does not steal the plane', () => {
  for (const st of [PHONE, NARROW, WIDE]) {
    const sb = farmSandbox(ALL);
    const mp = sb._farmMailPos(st.W, st.H);
    assert.equal(sb._farmSkyTarget(mp.x, mp.y, st.W, st.H), '#mail', 'mailbox at ' + st.W + 'x' + st.H);
    const at = sb._farmCartPos(st.W);
    assert.equal(sb._farmSkyTarget(at.x, at.y, st.W, st.H), '#cart', 'plane at ' + st.W + 'x' + st.H);
  }
});

/* ── The away cloud ── */

test('while the plane is away, its parking cloud is still tappable', () => {
  for (const st of [PHONE, WIDE]) {
    const sb = farmSandbox(ALL);
    sb.roomData.farmCartLeftAt = Date.now();     // just sold → gone for the cooldown
    assert.equal(sb._farmCart().present, false, 'cart should read as away');
    const at = sb._farmCartPos(st.W);
    assert.equal(sb._farmSkyTarget(at.x, at.y, st.W, st.H), '#cart', 'away cloud at ' + st.W + 'x' + st.H);
  }
});

test('a hut keeps its own tap whether the plane is here or away', () => {
  // The banner rect is the widest thing in the sky band; this is the guard that
  // it never reaches down and takes a hut's own tap with it.
  for (const away of [false, true]) {
    const sb = farmSandbox(ALL);
    if (away) sb.roomData.farmCartLeftAt = Date.now();
    ALL.forEach(function (id, slot) {
      const p = sb._workshopPos(slot);
      assert.equal(sb._farmSkyTarget(p.x, p.y, PHONE.W, PHONE.H), id,
        id + (away ? ' (plane away)' : ' (plane here)'));
    });
  }
});

/* ── Empty sky is not a target ── */

test('open sky and open grass hit nothing', () => {
  const sb = farmSandbox(ALL);
  assert.equal(sb._farmSkyTarget(0.02, 0.02, WIDE.W, WIDE.H), null, 'top-left corner');
  assert.equal(sb._farmSkyTarget(0.5, 0.95, WIDE.W, WIDE.H), null, 'down in the garden');
});
