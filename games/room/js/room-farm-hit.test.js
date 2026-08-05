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
  const at = sb._farmCartPos(W, H);
  const s = sb._farmCartSize(W, H);
  const cx = at.x * W;
  const bnW = s * 1.1;
  const bnX = cx - s * 0.62 - bnW;
  return { x: (bnX + bnW / 2) / W, y: at.y };
}

const ALL = ['dairy', 'bakery', 'oven', 'butcher', 'forge'];

// Top-level `const` in a classic script is a lexical binding, not a property of
// the global object, so layout constants have to be evaluated, not read off the
// sandbox the way its `function` declarations can be.
function constant(sb, name) { return vm.runInContext(name, sb); }

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
  const at = sb._farmCartPos(PHONE.W, PHONE.H), s = sb._farmCartSize(PHONE.W, PHONE.H);
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
    const at = sb._farmCartPos(st.W, st.H), s = sb._farmCartSize(st.W, st.H);
    for (const dx of [-0.48, 0, 0.56]) {          // tail, fuselage, propeller
      const x = (at.x * st.W + s * dx) / st.W;
      assert.equal(sb._farmSkyTarget(x, at.y, st.W, st.H), '#cart',
        'plane body at ' + st.W + 'x' + st.H + ', offset ' + dx);
    }
  }
});

/* ── How high the plane flies ── */

// The floating "🧺 Collect" button is top:10px and ≥44px tall on touch, and on a
// narrow stage it sits directly above the plane. It is a DOM element over the
// canvas, so anything drifting under it loses its taps entirely.
const COLLECT_BTN_FLOOR = 54;

test('the plane flies clear of the Collect button on every stage', () => {
  for (const st of [PHONE, NARROW, WIDE, { W: 400, H: 700 }, { W: 360, H: 400 }]) {
    const sb = farmSandbox(ALL);
    const pos = sb._farmCartPos(st.W, st.H), s = sb._farmCartSize(st.W, st.H);
    const top = pos.y * st.H - s * 0.45;
    assert.ok(top >= COLLECT_BTN_FLOOR,
      'plane top ' + Math.round(top) + 'px at ' + st.W + 'x' + st.H + ' is under the Collect button');
  }
});

test('the plane sits higher than it used to, wherever there is room', () => {
  const OLD_Y = 0.19;
  // Below roughly 460px of stage the sky between the Collect button and the hut
  // roofs is thinner than the plane, and clearing both wins over gaining
  // altitude — the two tests either side of this one cover that case.
  for (const st of [PHONE, NARROW, WIDE, { W: 400, H: 700 }]) {
    const sb = farmSandbox(ALL);
    const y = sb._farmCartPos(st.W, st.H).y;
    assert.ok(y < OLD_Y, 'at ' + st.W + 'x' + st.H + ' the plane is at ' + y.toFixed(3) + ', not above ' + OLD_Y);
  }
});

test('a short stage shrinks the plane rather than parking it in the huts', () => {
  const SHORT = { W: 360, H: 400 };
  const sb = farmSandbox(ALL);
  const s = sb._farmCartSize(SHORT.W, SHORT.H);
  assert.ok(s < 56, 'the width-only 56px floor must give way on a short stage, got ' + s.toFixed(1));
  // …and it must still be big enough to see.
  assert.ok(s >= 28, 'plane shrank to ' + s.toFixed(1) + 'px');
  // A tall stage keeps the full-size sprite.
  assert.equal(sb._farmCartSize(360, 700), Math.max(56, 360 * 0.16));
});

test('the plane stays in the sky, never down among the huts', () => {
  for (const st of [PHONE, NARROW, WIDE, { W: 400, H: 700 }, { W: 360, H: 400 }]) {
    const sb = farmSandbox(ALL);
    const pos = sb._farmCartPos(st.W, st.H), s = sb._farmCartSize(st.W, st.H);
    const belly = pos.y * st.H + s * 0.45;
    const hutTop = constant(sb, 'FARM_HUT_Y') * st.H - s * 0.4;
    assert.ok(belly < hutTop,
      'plane belly ' + Math.round(belly) + 'px reaches the huts at ' + Math.round(hutTop) + 'px (' + st.W + 'x' + st.H + ')');
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

// Locked huts are targets too: every machine stands on the pasture from the
// start, faded with a padlock, and TAPPING ONE IS HOW IT IS BOUGHT. Skipping
// unowned huts here would make the lock impossible to open.
test('an unowned hut is still a target — that tap is how you unlock it', () => {
  const sb = farmSandbox(['dairy']);          // butcher not built
  const p = sb._workshopPos(3);
  assert.equal(sb._farmSkyTarget(p.x, p.y, WIDE.W, WIDE.H), 'butcher');
});

test('every hut answers its own tap whether it is built or not', () => {
  for (const st of [PHONE, NARROW, WIDE]) {
    const sb = farmSandbox([]);               // nothing built at all
    ALL.forEach(function (id, slot) {
      const p = sb._workshopPos(slot);
      assert.equal(sb._farmSkyTarget(p.x, p.y, st.W, st.H), id,
        'locked ' + id + ' at ' + st.W + 'x' + st.H);
    });
  }
});

test('a tap between two huts picks the nearer one', () => {
  const sb = farmSandbox(ALL);
  const a = sb._workshopPos(1), b = sb._workshopPos(2);   // bakery, oven
  assert.equal(sb._farmSkyTarget(a.x + (b.x - a.x) * 0.3, a.y, WIDE.W, WIDE.H), 'bakery');
  assert.equal(sb._farmSkyTarget(a.x + (b.x - a.x) * 0.7, a.y, WIDE.W, WIDE.H), 'oven');
});

/* ── The mailbox ── */

// Every piece of the mailbox a player can see, in canvas px, traced from
// _drawFarmMailbox. The box, badge and flag hang 1.4–1.8 sprite-heights ABOVE
// the ground anchor the position function returns, which is exactly what a
// point-and-radius target used to miss.
function mailParts(sb, W, H) {
  const p = sb._farmMailPos(W, H);
  const gx = p.x * W, gy = p.y * H;
  const s = sb._farmMailSize(W, H);
  const bh = s * 0.60, by = gy - s * 0.80 - bh;
  const r = Math.max(8, s * 0.22);
  return {
    'count badge': [gx - s * 0.42, by - r * 0.15],
    'box top edge': [gx, by],
    'box centre': [gx, by + bh / 2],
    'box bottom': [gx, by + bh],
    'raised flag': [gx + s * 0.52 + s * 0.15, by - bh * 0.25 + s * 0.1],
    'post middle': [gx, gy - s * 0.4],
    'ground anchor': [gx, gy],
  };
}

test('every visible part of the mailbox opens the mailbox', () => {
  for (const st of [PHONE, NARROW, WIDE, { W: 400, H: 700 }]) {
    const sb = farmSandbox(ALL);
    vm.runInContext("_farmInbox = [{id:'a',kind:'cheer',day:'d',at:1}];", sb);   // flag up, badge showing
    const parts = mailParts(sb, st.W, st.H);
    for (const label in parts) {
      const [x, y] = parts[label];
      assert.equal(sb._farmSkyTarget(x / st.W, y / st.H, st.W, st.H), '#mail',
        label + ' at ' + st.W + 'x' + st.H);
    }
  }
});

test('the mailbox is big enough to aim at', () => {
  // 26px was the old floor: a box narrower than half a fingertip.
  for (const st of [PHONE, NARROW, WIDE, { W: 400, H: 700 }]) {
    const sb = farmSandbox(ALL);
    assert.ok(sb._farmMailSize(st.W, st.H) >= 34, 'sprite at ' + st.W + 'x' + st.H);
  }
});

test('the mailbox answers its own tap and does not steal the plane', () => {
  for (const st of [PHONE, NARROW, WIDE]) {
    const sb = farmSandbox(ALL);
    const mp = sb._farmMailPos(st.W, st.H);
    assert.equal(sb._farmSkyTarget(mp.x, mp.y, st.W, st.H), '#mail', 'mailbox at ' + st.W + 'x' + st.H);
    const at = sb._farmCartPos(st.W, st.H);
    assert.equal(sb._farmSkyTarget(at.x, at.y, st.W, st.H), '#cart', 'plane at ' + st.W + 'x' + st.H);
  }
});

/* ── The away cloud ── */

test('while the plane is away, its parking cloud is still tappable', () => {
  for (const st of [PHONE, WIDE]) {
    const sb = farmSandbox(ALL);
    sb.roomData.farmCartLeftAt = Date.now();     // just sold → gone for the cooldown
    assert.equal(sb._farmCart().present, false, 'cart should read as away');
    const at = sb._farmCartPos(st.W, st.H);
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

/* ── Panning the land ──
   The mailbox and the plane belong to the farm at their own spot on it, the
   same as the huts. They used to be pinned to the WINDOW, which meant panning
   to a bought plot towed them along overhead — so their taps also answered at
   the same screen position however far the land had scrolled. */

test('the mailbox and the plane travel with the farm, not with the window', () => {
  const sb = farmSandbox(ALL);
  const { W, H } = WIDE;
  const mail = sb._farmMailPos(W, H);
  const cart = sb._farmCartPos(W, H);

  // At rest on the farm both answer at their own place, as they always have.
  assert.equal(sb._farmSkyTarget(mail.x, mail.y, W, H, 0), '#mail', 'mailbox at camera 0');
  assert.equal(sb._farmSkyTarget(cart.x, cart.y, W, H, 0), '#cart', 'plane at camera 0');

  // Pan half a window to the right: each has moved half a window LEFT on screen.
  const cam = 0.5;
  assert.equal(sb._farmSkyTarget(mail.x - cam, mail.y, W, H, cam), '#mail',
    'the mailbox did not shift with the land');
  assert.equal(sb._farmSkyTarget(cart.x - cam, cart.y, W, H, cam), '#cart',
    'the plane did not shift with the land');

  // …and the screen position they used to occupy answers for neither of them.
  assert.notEqual(sb._farmSkyTarget(mail.x, mail.y, W, H, cam), '#mail',
    'the mailbox still answers where the window used to hold it — it is still pinned');
  assert.notEqual(sb._farmSkyTarget(cart.x, cart.y, W, H, cam), '#cart',
    'the plane still answers where the window used to hold it — it is still pinned');
});

test('panning far enough scrolls both off the screen entirely', () => {
  const sb = farmSandbox(ALL);
  const { W, H } = WIDE;
  const cam = 1.2;                       // the whole farm is off to the left
  for (let x = 0; x <= 1; x += 0.05) {
    for (const y of [0.1, 0.2, 0.3, 0.4]) {
      const hit = sb._farmSkyTarget(x, y, W, H, cam);
      assert.ok(hit !== '#mail' && hit !== '#cart',
        'tap at (' + x.toFixed(2) + ',' + y + ') still found ' + hit +
        ' after panning a whole window past the farm');
    }
  }
});

/* ── The two bought plots ──
   Their buildings were point targets sharing the huts' flat 44px reach, which
   was about right while every one of them was 51px. They are bigger than that
   now and no longer all one size, so they carry rects instead — and a rect that
   does not match what was painted is invisible until someone taps and misses. */

function plotSandbox() {
  const sb = farmSandbox(ALL);
  // The base sandbox only needs what the hit-test geometry touches; the actions
  // exercised below also report to the player and re-render.
  sb.T = (s, v) => { let o = s; if (v) for (const k of Object.keys(v)) o = o.split('{' + k + '}').join(v[k]); return o; };
  sb.I18N = { plural: (n, one, many, v) => sb.T(n === 1 ? one : many, Object.assign({ n: n }, v || {})) };
  sb.renderFarmPanel = () => {};
  sb.renderWorkshopModal = () => {};
  sb.closeWorkshopModal = () => {};
  sb.roomData.farmLandL = true;
  sb.roomData.farmLandR = true;
  sb.roomData.farmCompostBins = 3;
  sb.roomData.farmAgers = {};
  vm.runInContext('FARM_AGERS', sb).forEach(function (d) {
    sb.roomData.farmAgers[d.id] = { owned: true, slots: 1, jobs: [null] };
  });
  return sb;
}

test('every plot building answers a tap on the middle of itself', () => {
  const sb = plotSandbox();
  const { W, H } = WIDE;
  const agers = vm.runInContext('FARM_AGERS', sb);
  const cases = [];
  for (let i = 0; i < 3; i++) cases.push(['#bin' + i, sb._binPos(i, W, H)]);
  agers.forEach(function (d, i) { cases.push([d.id, sb._agerPos(i, W, H)]); });
  cases.push(['#buyer', sb._buyerPos(W, H)]);

  for (const [id, p] of cases) {
    // camX at the far end of that side, i.e. the plot filling the window —
    // which is when the player is actually looking at it.
    const cam = p.x < 0 ? -0.5 : (p.x > 1 ? 0.5 : 0);
    const hit = sb._farmSkyTarget(p.x - cam, p.y, W, H, cam);
    assert.equal(hit, id, 'tap on ' + id + ' at its own anchor resolved to ' + hit);
  }
});

test("a plot building's target grows with the size it is drawn at", () => {
  const sb = plotSandbox();
  const { W, H } = WIDE;
  // The buyer is the nearest and largest thing on either plot — the one a flat
  // 44px point reach under-covers the worst. Probe straight up and straight
  // down, where no neighbour can legitimately win the nearest-wins pass.
  const p = sb._buyerPos(W, H);
  const s = sb._plotSizeAt(p.y, W, H);
  const reach = vm.runInContext('FARM_TAP_REACH_PX', sb);
  const off = s * 0.48;
  assert.ok(off > reach,
    'this test proves nothing unless the probe is beyond the old point reach: ' +
    off.toFixed(0) + 'px vs ' + reach + 'px');
  const cam = 0.5;
  for (const dy of [-off, off]) {
    const hit = sb._farmSkyTarget(p.x - cam, p.y + dy / H, W, H, cam);
    assert.equal(hit, '#buyer',
      'the buyer missed a tap ' + off.toFixed(0) + 'px ' + (dy < 0 ? 'above' : 'below') +
      ' its anchor but well inside what it draws — the target is still a point');
  }
});

test('plot buildings shrink on a narrow stage instead of piling up', () => {
  const sb = plotSandbox();
  const step = vm.runInContext('FARM_LAND_STEP', sb);
  // Three buildings have to fit across a plot, which is FARM_LAND_STEP of the
  // window. Sizing off min(W,H) alone let a phone keep them at desktop size.
  for (const [W, H] of [[360, 520], [400, 620], [900, 600], [1769, 604]]) {
    const s = sb._plotBuildSize(W, H);
    assert.ok(s * 3 <= step * W,
      W + 'x' + H + ': three ' + s.toFixed(0) + 'px buildings do not fit the ' +
      (step * W).toFixed(0) + 'px plot');
  }
});

test('plot buildings are not targets while their plot is unbought', () => {
  const sb = plotSandbox();
  sb.roomData.farmLandL = false;
  sb.roomData.farmLandR = false;
  const { W, H } = WIDE;
  for (let i = 0; i < 3; i++) {
    const p = sb._binPos(i, W, H);
    const hit = sb._farmSkyTarget(p.x + 0.5, p.y, W, H, -0.5);
    assert.notEqual(hit, '#bin' + i, 'bin ' + i + ' answered on an unbought plot');
  }
  const b = sb._buyerPos(W, H);
  assert.notEqual(sb._farmSkyTarget(b.x - 0.5, b.y, W, H, 0.5), '#buyer',
    'the buyer answered on an unbought plot');
});

/* ── What comes with the right plot, and what the buyer admits to ── */

test('the Cheese Cave comes with the right plot — no padlock to tap', () => {
  const sb = plotSandbox();
  sb.roomData.farmAgers = {};                 // nothing bought, nothing stored
  assert.equal(sb._farmBuildOwned('cheesecave'), true,
    'the cave is marked free and the plot is bought, so it is already owned');
  assert.ok(sb._machineState('cheesecave'),
    'a free building must resolve to a usable slot/job record, not null');
  // The other two are still bought the normal way.
  assert.equal(sb._farmBuildOwned('smokehouse'), false);
  assert.equal(sb._farmBuildOwned('hamcellar'), false);
});

test('without the right plot the Cheese Cave is not owned either', () => {
  const sb = plotSandbox();
  sb.roomData.farmLandR = false;
  sb.roomData.farmAgers = {};
  assert.equal(sb._farmBuildOwned('cheesecave'), false,
    'free means "comes with the plot", not "free forever"');
  assert.equal(sb._machineState('cheesecave'), null);
});

test('a free building is never offered for sale', async () => {
  const sb = plotSandbox();
  sb.roomData.farmAgers = {};
  sb.roomData.coins = 999999;
  const before = sb.roomData.coins;
  await sb.buyFarmMachine('cheesecave');
  assert.equal(sb.roomData.coins, before, 'buying an already-owned building charged for it');
});

test('drawing a visitor\'s plot does not invent state on their data', () => {
  const sb = plotSandbox();
  sb.roomData.farmAgers = {};
  sb.viewingUid = 'someone-else';
  const st = sb._machineState('cheesecave');
  assert.ok(st, 'a visitor still sees the cave as owned');
  assert.deepEqual(sb.roomData.farmAgers, {},
    'but nothing was written onto the farm being visited');
});

test('the buyer lists what your own factories can make, and nothing more', () => {
  const sb = plotSandbox();
  sb.roomData.farmAgers = {};                 // only the free cave
  const listed = sb._agedListable();
  // The cave's two outputs, and neither of the locked factories'.
  assert.deepEqual(listed.slice().sort(), ['agedcheese', 'culturedbutter'].sort());
  for (const hidden of ['curedsausage', 'smokedbacon', 'agedham']) {
    assert.ok(listed.indexOf(hidden) < 0,
      hidden + ' is listed, but the factory that makes it is still locked');
  }
});

test('unlocking a factory adds exactly its own goods to the buyer', () => {
  const sb = plotSandbox();
  sb.roomData.farmAgers = { smokehouse: { owned: true, slots: 1, jobs: [0] } };
  const listed = sb._agedListable();
  for (const shown of ['agedcheese', 'culturedbutter', 'curedsausage', 'smokedbacon']) {
    assert.ok(listed.indexOf(shown) >= 0, shown + ' should be listed');
  }
  assert.ok(listed.indexOf('agedham') < 0, 'the Ham Cellar is still locked');
});

test('a good already in the crate stays sellable whatever the buildings say', () => {
  const sb = plotSandbox();
  sb.roomData.farmAgers = {};
  sb.roomData.farmAged = { agedham: 2 };      // e.g. data that got ahead of the plot
  assert.ok(sb._agedListable().indexOf('agedham') >= 0,
    'holding a good you can no longer make must not strand it');
});

/* ── Collecting compost ──
   The yard is ONE pool that three bins display in order. Taking a single bin's
   worth left the bin you tapped reading full (a yard of 25 minus 10 is 15, and
   bin 0 shows anything up to 10 as full) while a bin you did not touch emptied
   instead. */

test('collecting empties the whole yard, and every bin shows it', async () => {
  const sb = plotSandbox();
  sb.roomData.farmCompost = 25;               // bin0 full, bin1 full, bin2 half
  sb.roomData.farmFertilizer = 0;
  sb.roomData.farmCompostAt = Date.now();
  sb.roomData.farmAnimals = [];               // no accrual during the test

  assert.equal(sb._binFill(0), 1, 'precondition: bin 0 starts full');
  await sb.tapCompostBin(0);

  assert.equal(sb.roomData.farmFertilizer, 25, 'the whole yard should have been collected');
  assert.equal(Math.floor(sb.roomData.farmCompost), 0);
  for (let i = 0; i < 3; i++) {
    assert.equal(sb._binFill(i), 0,
      'bin ' + i + ' still draws at ' + sb._binFill(i) + ' after collecting — ' +
      'the bin that was tapped must not look untouched');
  }
});

/* Tapping a FULL bin threw a "+1" up off the bin at the same moment the toast
   said it had collected ten. The +1 means "the yard just gained a whole unit",
   and it is DERIVED: _unitCrossedAgo reads a value sitting on a whole number as
   a crossing that happened this instant. A collect empties the yard onto exactly
   0 — a whole number — so the accrual cue fired over a yard that had just gone
   DOWN by ten, and the player read it as "I only got 1".

   The trough already holds its −1 after a refill for exactly this reason. */
test('collecting the yard does not fire the +1 that means "one gained"', async () => {
  const sb = meterSandbox(20);
  sb.roomData.farmCompostBins = 1;            // cap 10
  sb.roomData.farmCompost = 10;               // full, so a collect lands it on exactly 0
  sb.roomData.farmFertilizer = 0;
  sb.roomData.farmCompostAt = Date.now();

  await sb.tapCompostBin(0);

  assert.equal(sb.roomData.farmFertilizer, 10, 'precondition: ten really were collected');
  const yard = sb._compostNow();
  assert.ok(sb._compostPerHr() > 0,
    'the yard is under its cap again, so the pop is live — this is the moment it fired');
  assert.ok(sb._unitCrossedAgo(yard, sb._compostPerHr(), true) < 50,
    'precondition: an emptied yard does read as "just crossed a unit"');
  assert.equal(sb._compostPopDue(yard), false,
    'so a +1 went up beside a toast that said 10');
});

test('the +1 still fires when the yard really does gain a unit', () => {
  const sb = meterSandbox(20);
  assert.equal(sb._compostPopDue(3), true, 'crossing into the third unit must still pop');
  assert.equal(sb._compostPopDue(1), true, 'the very first whole unit counts');
  assert.equal(sb._compostPopDue(0.98), false, 'not yet — nothing whole has been gained');
  assert.equal(sb._compostPopDue(0), false, 'you cannot have just gained your zeroth unit');
});

test('an empty yard says so instead of silently doing nothing', async () => {
  const sb = plotSandbox();
  sb.roomData.farmCompost = 0.4;              // under one whole unit
  sb.roomData.farmFertilizer = 7;
  sb.roomData.farmCompostAt = Date.now();
  sb.roomData.farmAnimals = [];
  await sb.tapCompostBin(0);
  assert.equal(sb.roomData.farmFertilizer, 7, 'a part-unit must not round up into free fertilizer');
});

/* ── Hover tooltips ──
   The pointer arrives in window coordinates; the trough and the beds stand on
   the land. Those two checks were written before the land could be panned and
   compared the two spaces directly, so at the left plot the trough's own x of
   0.085 sat on a compost bin and pointing at the bin reported the food level. */

test('pointing at a compost bin does not report the trough', () => {
  const sb = plotSandbox();
  sb.roomData.farmFood = 265;
  sb.roomData.farmTroughLevel = 3;
  sb.roomData.farmCompost = 17;
  const { W, H } = WIDE;
  const cam = -0.5;                        // the camera parked on the left plot
  // _farmCamX is a top-level `let`, so it has to be assigned inside the context —
  // setting a property on the sandbox would not reach the binding _farmTargetAt
  // actually reads.
  vm.runInContext('_farmCamX = ' + cam, sb);
  for (let i = 0; i < 3; i++) {
    const p = sb._binPos(i, W, H);
    const cx = p.x - cam;                  // land → window
    const tg = sb._farmTargetAt(cx, p.y, W, H);
    const tip = sb._farmHoverTip(cx, p.y, W, H, cam, tg);
    assert.ok(tip.indexOf('265') < 0 && tip.indexOf('Food') < 0,
      'bin ' + i + ' reported the trough: "' + tip + '"');
    assert.ok(tip.indexOf('Compost') >= 0, 'bin ' + i + ' said "' + tip + '" instead of its own level');
  }
});

test('the trough still reports itself when the camera is on the farm', () => {
  const sb = plotSandbox();
  sb.roomData.farmFood = 265;
  sb.roomData.farmTroughLevel = 3;
  const { W, H } = WIDE;
  const troughX = vm.runInContext('FARM_TROUGH_X', sb);
  const y = sb._farmTroughY(W, H);
  const tip = sb._farmHoverTip(troughX, y, W, H, 0, null);
  assert.ok(tip.indexOf('265') >= 0, 'the trough stopped reporting its own level: "' + tip + '"');
});

test('a garden bed tooltip follows the land, not the screen', () => {
  const sb = plotSandbox();
  sb.roomData.farmPlots = [{ crop: null }];
  const { W, H } = WIDE;
  const bed = sb._farmPlotPos(0, W, H);
  // On the farm, pointing at the bed names it.
  assert.ok(sb._farmHoverTip(bed.x, bed.y, W, H, 0, null).indexOf('tap to plant') >= 0,
    'the bed did not report itself with the camera at rest');
  // Panned to the right plot, that same SCREEN position is empty ground, and the
  // bed answers at its shifted screen position instead.
  const cam = 0.5;
  assert.equal(sb._farmHoverTip(bed.x, bed.y, W, H, cam, null), '',
    'the bed answered at the screen position it used to occupy — still comparing window to land');
  assert.ok(sb._farmHoverTip(bed.x - cam, bed.y, W, H, cam, null).indexOf('tap to plant') >= 0,
    'the bed stopped answering where it is actually drawn');
});

/* ── Fertilising a growing bed ──
   Fertilizer moved out of the planting sheet: you fertilise a bed that is
   already growing, by tapping the sack and then the bed (or dragging it). */

function fertSandbox(plots) {
  const sb = plotSandbox();
  sb.roomData.farmPlots = plots;
  sb.roomData.farmFertilizer = 3;
  sb.roomData.coins = 99999;
  return sb;
}

test('only a growing, unfertilised bed can take fertilizer', () => {
  const sb = fertSandbox([
    { crop: 'wheat', plantedAt: Date.now(), fert: false },   // 0 — yes
    { crop: null, plantedAt: 0, fert: false },               // 1 — empty
    { crop: 'corn', plantedAt: Date.now(), fert: true },     // 2 — already done
  ]);
  assert.equal(sb._fertable(0), true, 'a growing, unfertilised bed');
  assert.equal(sb._fertable(1), false, 'an empty bed is not a target');
  assert.equal(sb._fertable(2), false, 'an already-fertilised bed is not a target');
});

test('fertilising spends exactly one and marks that bed', async () => {
  const sb = fertSandbox([{ crop: 'wheat', plantedAt: Date.now(), fert: false }]);
  const ok = await sb.applyFert(0);
  assert.equal(ok, true);
  assert.equal(sb.roomData.farmFertilizer, 2, 'one fertilizer per bed');
  assert.equal(sb.roomData.farmPlots[0].fert, true);
});

test('a bed cannot be fertilised twice', async () => {
  const sb = fertSandbox([{ crop: 'wheat', plantedAt: Date.now(), fert: false }]);
  await sb.applyFert(0);
  const left = sb.roomData.farmFertilizer;
  const again = await sb.applyFert(0);
  assert.equal(again, false, 'the second attempt must be refused');
  assert.equal(sb.roomData.farmFertilizer, left, 'and must not spend anything');
});

test('an empty bed refuses fertilizer without spending it', async () => {
  const sb = fertSandbox([{ crop: null, plantedAt: 0, fert: false }]);
  const ok = await sb.applyFert(0);
  assert.equal(ok, false);
  assert.equal(sb.roomData.farmFertilizer, 3, 'nothing should have been spent');
});

test('with none in hand nothing is applied', async () => {
  const sb = fertSandbox([{ crop: 'wheat', plantedAt: Date.now(), fert: false }]);
  sb.roomData.farmFertilizer = 0;
  const ok = await sb.applyFert(0);
  assert.equal(ok, false);
  assert.equal(sb.roomData.farmPlots[0].fert, false, 'the bed must not be marked for free');
});

test('the sack stays armed across a row, and puts itself down when empty', async () => {
  const sb = fertSandbox([
    { crop: 'wheat', plantedAt: Date.now(), fert: false },
    { crop: 'wheat', plantedAt: Date.now(), fert: false },
    { crop: 'wheat', plantedAt: Date.now(), fert: false },
  ]);
  sb.roomData.farmFertilizer = 2;
  sb.toggleFertArm();
  assert.equal(vm.runInContext('_fertArmed', sb), true, 'tapping the sack should arm it');
  await sb.applyFert(0);
  assert.equal(vm.runInContext('_fertArmed', sb), true, 'still armed with one left — a row is one tap each');
  await sb.applyFert(1);
  assert.equal(vm.runInContext('_fertArmed', sb), false, 'the last one puts the sack down by itself');
});

test('replanting a bed clears the fertiliser it had', () => {
  const sb = fertSandbox([{ crop: 'wheat', plantedAt: 1, fert: true }]);
  sb._doPlant('wheat', [0]);
  assert.equal(sb.roomData.farmPlots[0].fert, false,
    'a reused bed came back already fertilised — beds are recycled, the flag was not');
});

/* ── The sack lives in the field ──
   It is drawn in the world layer and pans with the land, so its hit-test has to
   be in land coordinates like everything else below the fence — and it has to
   beat the nearest-bed partition, which otherwise claims every tap down there. */

test('the sack answers its own tap, at any camera position', () => {
  const sb = fertSandbox([{ crop: 'wheat', plantedAt: Date.now(), fert: false }]);
  for (const [W, H] of [[900, 600], [1769, 604], [400, 620], [360, 520]]) {
    const p = sb._fertBagPos(W, H);
    for (const cam of [0, 0.5, -0.5]) {
      vm.runInContext('_farmCamX = ' + cam, sb);
      const tg = sb._farmTargetAt(p.x - cam, p.y, W, H);
      assert.ok(tg && tg.kind === 'fert',
        W + 'x' + H + ' at camera ' + cam + ': the sack resolved to ' + JSON.stringify(tg));
    }
  }
  vm.runInContext('_farmCamX = 0', sb);
});

test('the sack never stands on a bed', () => {
  const sb = fertSandbox(Array.from({ length: 30 }, () => ({ crop: 'wheat', plantedAt: Date.now(), fert: false })));
  for (const [W, H] of [[900, 600], [1769, 604], [400, 620], [360, 520]]) {
    const bag = sb._fertBagPos(W, H), s = sb._fertBagSize(W, H), tile = sb._farmTile(W, H);
    for (let i = 0; i < 30; i++) {
      const b = sb._farmPlotPos(i, W, H);
      const gapX = Math.abs(bag.x - b.x) * W, gapY = Math.abs(bag.y - b.y) * H;
      assert.ok(gapX > (s + tile) / 2 || gapY > (s + tile) / 2,
        W + 'x' + H + ': the sack overlaps bed ' + i);
    }
  }
});

test('the sack stays inside the field', () => {
  const sb = fertSandbox([]);
  for (const [W, H] of [[900, 600], [1769, 604], [400, 620], [360, 520]]) {
    const p = sb._fertBagPos(W, H), s = sb._fertBagSize(W, H);
    assert.ok(p.x * W - s / 2 >= 0, W + 'x' + H + ': the sack hangs off the left edge');
    assert.ok(p.y * H + s / 2 <= H, W + 'x' + H + ': the sack hangs off the bottom');
    assert.ok(p.y > sb._farmDivY(), W + 'x' + H + ': the sack drifted up into the pasture');
  }
});

test('one sweep fertilises every bed it crosses, and stops when the sack runs out', () => {
  const beds = Array.from({ length: 5 }, () => ({ crop: 'wheat', plantedAt: Date.now(), fert: false }));
  const sb = fertSandbox(beds);
  sb.roomData.farmFertilizer = 3;
  // What a drag does, bed by bed: _fertBed once per bed crossed.
  let done = 0;
  for (let i = 0; i < 5; i++) if (sb._fertBed(i)) done++;
  assert.equal(done, 3, 'the sweep should stop at the third — that is all there was');
  assert.equal(sb.roomData.farmFertilizer, 0);
  assert.deepEqual(beds.map(b => b.fert), [true, true, true, false, false]);
});

test('a sweep never double-fertilises a bed it crosses twice', () => {
  const beds = [{ crop: 'wheat', plantedAt: Date.now(), fert: false }];
  const sb = fertSandbox(beds);
  sb.roomData.farmFertilizer = 5;
  assert.equal(sb._fertBed(0), true);
  assert.equal(sb._fertBed(0), false, 'crossing the same bed again must be a no-op');
  assert.equal(sb.roomData.farmFertilizer, 4, 'and must not spend a second one');
});

/* ── The bins have to look like they are filling ──
   At a herd of 59 a bin gains one whole unit every ~13 minutes, so a readout
   with only integer resolution sits on the same digit for a quarter of an hour
   and reads as broken. The fill fraction is what moves; the integer rides on it. */

test('the bins drift with the clock, not once a minute when the tick settles', () => {
  const sb = plotSandbox();
  sb.roomData.farmAnimals = Array.from({ length: 59 }, (_, i) => ({ id: 'a' + i, type: 'goose' }));
  sb.roomData.farmCompost = 0;
  sb.roomData.farmCompostAt = Date.now() - 5 * 60 * 1000;   // settled five minutes ago
  const seen = sb._compostNow();
  // 59 animals x 0.08/hr = 4.72/hr, so five minutes is about 0.39.
  assert.ok(seen > 0.3 && seen < 0.5,
    'five minutes since the last settle should show as ~0.39, got ' + seen.toFixed(3));
  assert.ok(sb._binFill(0) > 0,
    'the first bin reads empty five minutes in — it is still reading the settled figure only');
});

test('the drift never runs past the cap', () => {
  const sb = plotSandbox();
  sb.roomData.farmAnimals = Array.from({ length: 59 }, (_, i) => ({ id: 'a' + i, type: 'goose' }));
  sb.roomData.farmCompost = 0;
  sb.roomData.farmCompostAt = Date.now() - 40 * 3600 * 1000;   // away for a week's worth
  assert.equal(sb._compostNow(), sb._compostCap(), 'a long absence must still stop at the cap');
  for (let i = 0; i < 3; i++) assert.equal(sb._binFill(i), 1, 'bin ' + i + ' should read full');
});

test('with no herd nothing accrues, however long it has been', () => {
  const sb = plotSandbox();
  sb.roomData.farmAnimals = [];
  sb.roomData.farmCompost = 4;
  sb.roomData.farmCompostAt = Date.now() - 10 * 3600 * 1000;
  assert.equal(sb._compostNow(), 4, 'compost comes from animals — an empty pasture makes none');
});

test('collecting takes the settled figure, so the drift cannot be banked twice', async () => {
  const sb = plotSandbox();
  sb.roomData.farmAnimals = Array.from({ length: 59 }, (_, i) => ({ id: 'a' + i, type: 'goose' }));
  sb.roomData.farmCompost = 0;
  sb.roomData.farmFertilizer = 0;
  sb.roomData.farmCompostAt = Date.now() - 2 * 3600 * 1000;    // two hours of drift ≈ 9.4
  await sb.tapCompostBin(0);
  assert.equal(sb.roomData.farmFertilizer, 9, 'the drift should be settled once and collected once');
  // Collecting takes whole units only, so the sub-unit remainder stays in the
  // yard rather than being rounded away — it is the next unit, part-earned.
  const left = sb._compostNow();
  assert.ok(left >= 0 && left < 1,
    'after collecting, only the part-unit remainder should be left, got ' + left.toFixed(3));
});

/* ── The pan arrows ──
   Their side comes from CSS (.farm-pan-l{left} / .farm-pan-r{right}) while their
   direction comes from the onclick in room.html. Those two live in different
   files, so nothing stopped a stylesheet edit from leaving both buttons stacked
   in one place with the left-hand one moving the camera right — which is exactly
   what happened. This reads both files and checks they still agree. */

test('each pan arrow is positioned on the side it actually travels', () => {
  const css = fs.readFileSync(path.join(DIR, '..', 'css', 'room.css'), 'utf8');
  const html = fs.readFileSync(path.join(DIR, '..', '..', 'room.html'), 'utf8');

  assert.match(css, /\.farm-pan-l\s*\{[^}]*\bleft\s*:/,
    '.farm-pan-l has no left offset — both arrows will stack in the same spot');
  assert.match(css, /\.farm-pan-r\s*\{[^}]*\bright\s*:/,
    '.farm-pan-r has no right offset — both arrows will stack in the same spot');

  const l = /id="farmPanL"[^>]*onclick="farmPan\((-?\d)\)"/.exec(html);
  const r = /id="farmPanR"[^>]*onclick="farmPan\((-?\d)\)"/.exec(html);
  assert.ok(l && r, 'could not find both pan buttons in room.html');
  assert.equal(l[1], '-1', 'the left-hand arrow must move the camera left');
  assert.equal(r[1], '1', 'the right-hand arrow must move the camera right');
});

test('farmPan moves the camera the way its argument points', () => {
  const sb = plotSandbox();
  vm.runInContext('_farmCamX = 0; _farmCamTo = null;', sb);
  sb.farmPan(-1);
  assert.ok(vm.runInContext('_farmCamTo', sb) < 0, 'farmPan(-1) should head left, toward the west plot');
  vm.runInContext('_farmCamX = 0; _farmCamTo = null;', sb);
  sb.farmPan(1);
  assert.ok(vm.runInContext('_farmCamTo', sb) > 0, 'farmPan(1) should head right, toward the east plot');
});

/* ── What a tap in the garden reports ──
   Both readouts used to come off farmRowState.cropId, the first crop planted in
   the row: tapping any bed reported the row's slowest crop, and a mixed row got
   one crop and one number when it holds several of each. */

function gardenSandbox(plots) {
  const sb = plotSandbox();
  sb.roomData.farmPlots = plots;
  sb.toasts = [];
  sb.showToast = (msg) => { sb.toasts.push(msg); };
  return sb;
}
const HR = 3600 * 1000;

test('tapping a bed reports THAT bed, not the row', () => {
  const now = Date.now();
  // wheat (1h) is the first bed and the slowest to finish here; corn (2h) was
  // planted long enough ago to be closer to ready.
  const sb = gardenSandbox([
    { crop: 'wheat', plantedAt: now - 0.1 * HR },
    { crop: 'corn',  plantedAt: now - 1.9 * HR },
  ]);
  sb._farmRowClick(0, 1);                       // tap the corn
  assert.equal(sb.toasts.length, 1);
  assert.match(sb.toasts[0], /Corn/, 'tapping the corn reported "' + sb.toasts[0] + '"');
});

test('tapping the signboard of a mixed row reports every crop with its own time', () => {
  const now = Date.now();
  const sb = gardenSandbox([
    { crop: 'wheat',  plantedAt: now - 0.5 * HR },
    { crop: 'carrot', plantedAt: now - 0.5 * HR },
    { crop: 'corn',   plantedAt: now - 0.5 * HR },
  ]);
  sb._farmRowClick(0, null);                    // the sign, not a bed
  const msg = sb.toasts[0];
  for (const emoji of ['🌾', '🥕', '🌽']) {
    assert.ok(msg.indexOf(emoji) >= 0, emoji + ' missing from "' + msg + '"');
  }
  // Three crops, three different remaining times — so three distinct numbers.
  const times = msg.match(/\d+/g) || [];
  assert.ok(new Set(times).size >= 2,
    'a mixed row still reported one number for everything: "' + msg + '"');
});

test('a single-crop row still reads as a sentence, not a list', () => {
  const now = Date.now();
  const sb = gardenSandbox([
    { crop: 'wheat', plantedAt: now - 0.2 * HR },
    { crop: 'wheat', plantedAt: now - 0.1 * HR },
  ]);
  sb._farmRowClick(0, null);
  assert.match(sb.toasts[0], /growing/, 'the one-crop wording should be kept: "' + sb.toasts[0] + '"');
});

/* ── Live meter figures ──
   Feed and compost are both SETTLED models — the number in roomData only moves
   when the 60s tick or a tap runs the settle. Every readout used to show that
   stale figure, and at ordinary herd sizes a minute of eating is a fraction of
   a unit, so the count sat on the same digit for ten minutes and the farm read
   as "nothing is being consumed". _foodNow/_compostNow add the elapsed time
   back on for DISPLAY, and must never write it back. */

function meterSandbox(herd) {
  const sb = plotSandbox();
  sb.roomData.farmAnimals = [];
  for (let i = 0; i < herd; i++) sb.roomData.farmAnimals.push({ id: 'a' + i, type: 'cow', happiness: 80 });
  return sb;
}
const PER_DAY = 18;            // FARM_FOOD_PER_DAY
const PER_ANIMAL_HR = 0.08;    // FARM_COMPOST_PER_ANIMAL_HR

test('the trough figure drops with the clock between ticks', () => {
  const sb = meterSandbox(12);
  sb.roomData.farmFood = 100;
  sb.roomData.farmFoodAt = Date.now() - 0.5 * HR;      // settled half an hour ago
  const live = sb._foodNow();
  assert.ok(Math.abs(live - (100 - 12 * PER_DAY / 24 * 0.5)) < 0.01,
    'half an hour of a 12-head herd should be 4.5 units, got ' + (100 - live).toFixed(2));
  assert.ok(live < sb.roomData.farmFood,
    'the live figure equalled the settled one — the readout is still stale');
});

test('reading the live figures never writes them back', () => {
  const sb = meterSandbox(12);
  sb.roomData.farmFood = 100;
  sb.roomData.farmFoodAt = Date.now() - 0.5 * HR;
  sb.roomData.farmCompost = 4;
  sb.roomData.farmCompostAt = Date.now() - 0.5 * HR;
  sb._foodNow(); sb._foodNow(); sb._compostNow(); sb._compostNow();
  assert.equal(sb.roomData.farmFood, 100, 'the display drift double-counted against farmFood');
  assert.equal(sb.roomData.farmCompost, 4, 'the display drift double-counted against farmCompost');
});

test('the trough drift is capped the way the tick caps its own window', () => {
  const sb = meterSandbox(12);
  sb.roomData.farmFood = 100;
  sb.roomData.farmFoodAt = Date.now() - 7 * 24 * HR;   // a week away
  const cap = sb.farmOfflineCapMs();
  const expect = Math.max(0, 100 - 12 * PER_DAY / 24 * (cap / HR));
  assert.ok(Math.abs(sb._foodNow() - expect) < 0.01,
    'a week away billed a week of eating (' + sb._foodNow().toFixed(1) + ') — the tick only charges ' +
    (cap / HR).toFixed(1) + 'h');
});

test('an empty trough reads 0, not a negative', () => {
  const sb = meterSandbox(40);
  sb.roomData.farmFood = 1;
  sb.roomData.farmFoodAt = Date.now() - 3 * HR;
  assert.equal(sb._foodNow(), 0);
});

test('no herd means no drain', () => {
  const sb = meterSandbox(0);
  sb.roomData.farmFood = 100;
  sb.roomData.farmFoodAt = Date.now() - 5 * HR;
  assert.equal(sb._foodNow(), 100, 'the trough drained with nothing standing at it');
  assert.equal(sb._foodPerHr(), 0);
});

test('a full compost yard stops claiming a rate', () => {
  const sb = meterSandbox(20);
  sb.roomData.farmCompostBins = 1;                     // cap 10
  sb.roomData.farmCompost = 10;
  sb.roomData.farmCompostAt = Date.now();
  assert.equal(sb._compostPerHr(), 0,
    'a yard sitting at its cap still advertised a rate — and a value pinned on a whole ' +
    'unit would then fire the +1 pop on every single frame');
  assert.equal(sb._unitCrossedAgo(sb._compostNow(), sb._compostPerHr(), true), -1,
    'the pop should be switched off entirely when nothing is flowing');
  sb.roomData.farmCompostBins = 2;                     // room again
  assert.ok(Math.abs(sb._compostPerHr() - 20 * PER_ANIMAL_HR) < 1e-9);
});

/* ── The parts that actually move ──
   The bin's own track spans ten units: at a herd of 20 that is ~8px an HOUR.
   The sliver is the next unit's progress, which crosses the same width every
   few minutes — the only readout on either meter fast enough to watch. */

test('the sub-unit sliver crosses its whole width between two whole units', () => {
  // A draining meter and a rising one both count 0 → 1 and then pop.
  assert.ok(Math.abs(sb_unitFrac(95.9, false) - 0.1) < 1e-9, 'draining: just started the next unit');
  assert.ok(Math.abs(sb_unitFrac(95.1, false) - 0.9) < 1e-9, 'draining: nearly there');
  assert.ok(Math.abs(sb_unitFrac(6.1, true) - 0.1) < 1e-9, 'rising: just started');
  assert.ok(Math.abs(sb_unitFrac(6.9, true) - 0.9) < 1e-9, 'rising: nearly there');
});
let _fracSb = null;
function sb_unitFrac(v, rising) {
  if (!_fracSb) _fracSb = plotSandbox();
  return _fracSb._unitFrac(v, rising);
}

test('the sliver outruns the level track by a whole bin', () => {
  const BADGE_PX = 52, BIN = 10;
  const px = (unitsWide, ratePerHr) => BADGE_PX / ((unitsWide / ratePerHr) * 60);  // px/min
  // Compost, herd 20: the bin track is ten units wide, the sliver is one.
  const cRate = 20 * PER_ANIMAL_HR;
  assert.ok(px(1, cRate) / px(BIN, cRate) === BIN);
  assert.ok(px(BIN, cRate) < 0.2,
    'sanity: the level track really is invisible, at ' + px(BIN, cRate).toFixed(3) + ' px/min');
  // …but ten times invisible is still slow. Compost's "it is working" cue is
  // the steam on the filling bin; the sliver is a bonus there, not the answer.
  assert.ok(px(1, cRate) < 2);
  // The trough is the one the sliver really carries: a whole unit every four
  // minutes at the same herd, which is plainly watchable.
  const fRate = 20 * PER_DAY / 24;
  assert.ok(px(1, fRate) > 10,
    'the trough sliver should be watchable, it is ' + px(1, fRate).toFixed(1) + ' px/min');
});

test('a whole unit coming off the trough fires the pop, and only then', () => {
  const sb = meterSandbox(12);
  const rate = sb._foodPerHr();                         // 9 units/hr → one every 400s
  // Just crossed: the figure is sitting on a whole number.
  assert.ok(sb._unitCrossedAgo(96, rate, false) < 50, 'a fresh crossing should read as brand new');
  // Half a unit later: 200s ago, well past any pop window.
  assert.ok(Math.abs(sb._unitCrossedAgo(95.5, rate, false) - 200000) < 1000,
    'got ' + sb._unitCrossedAgo(95.5, rate, false) + 'ms');
});

/* ── The tooltips carry the rate now ── */

test('the trough tooltip reports the live figure and the drain rate', () => {
  const sb = meterSandbox(12);
  sb.roomData.farmFood = 100;
  sb.roomData.farmFoodAt = Date.now() - 0.5 * HR;       // live figure is 95.5
  sb.roomData.farmTroughLevel = 3;
  const { W, H } = WIDE;
  const tip = sb._farmHoverTip(vm.runInContext('FARM_TROUGH_X', sb), sb._farmTroughY(W, H), W, H, 0, null);
  assert.ok(tip.indexOf('96') >= 0, 'the tooltip still reports the stale 100: "' + tip + '"');
  assert.ok(tip.indexOf('9/hr') >= 0, 'the tooltip does not say how fast it is draining: "' + tip + '"');
});

/* ── Reading the trough's number ──
   Rounded UP, alone among the farm's counts. Floor made a trough refilled to
   the brim read one short on the very next frame, and stepped the number at the
   top of each unit rather than at the bottom — i.e. nowhere near the moment the
   sliver wrapped and the −1 popped. */

test('a trough filled to the brim reads full, not one short', () => {
  const sb = meterSandbox(12);
  sb.roomData.farmTroughLevel = 0;                     // cap 100
  sb.roomData.farmFood = 100;
  sb.roomData.farmFoodAt = Date.now() - 20;            // 20ms of eating: 99.99999…
  assert.ok(sb._foodNow() < 100, 'the fixture is wrong — nothing has drained yet');
  assert.equal(sb._foodShown(sb._foodNow()), 100,
    'a trough refilled a moment ago read ' + sb._foodShown(sb._foodNow()) + '/100');
});

test('the number steps down at the same instant the unit pops', () => {
  const sb = meterSandbox(12);
  // Displayed count holds all the way through a unit, then drops as it wraps.
  assert.equal(sb._foodShown(96.99), 97);
  assert.equal(sb._foodShown(96.01), 97);
  assert.equal(sb._foodShown(95.99), 96, 'the count did not follow the crossing');
  // …and the crossing is exactly where _unitFrac wraps.
  assert.ok(sb._unitFrac(96.01, false) > 0.98);
  assert.ok(sb._unitFrac(95.99, false) < 0.02);
});

test('the compost tooltip carries the fill rate while the yard is gaining', () => {
  const sb = meterSandbox(20);
  sb.roomData.farmCompost = 4;
  sb.roomData.farmCompostAt = Date.now();
  const { W, H } = WIDE;
  const p = sb._binPos(0, W, H);
  const tg = sb._farmTargetAt(p.x, p.y, W, H);
  const tip = sb._farmHoverTip(p.x, p.y, W, H, 0, tg);
  assert.ok(tip.indexOf('1.6/hr') >= 0, 'no fill rate on the bin tooltip: "' + tip + '"');
});

test('a rate reads as a rate — one decimal only while the decimal matters', () => {
  const sb = plotSandbox();
  assert.equal(sb._fmtRate(7.5), '7.5');
  assert.equal(sb._fmtRate(1.6000000000000003), '1.6');
  assert.equal(sb._fmtRate(18), '18');
  assert.equal(sb._fmtRate(0.75), '0.8');
});

/* ── The tier-2 buyer runs the plane's cycle ──
   It used to be always-open with a flat 20-a-day quota. Now it wants a set,
   takes it, shuts for a day and reopens wanting something else — and while
   shut it shows the next list, because ageing takes hours and you have to know
   tonight what to load. */

function buyerSandbox(owned, held) {
  const sb = plotSandbox();
  sb.openMachineModal = () => {};
  sb.roomData.farmAgers = {};
  vm.runInContext('FARM_AGERS', sb).forEach(function (d) {
    if (owned.indexOf(d.id) >= 0) sb.roomData.farmAgers[d.id] = { owned: true, slots: 1, jobs: [null] };
  });
  sb.roomData.farmAged = Object.assign({}, held || {});
  sb.roomData.farmBuyerLeftAt = 0;
  sb.roomData.farmBuyerWanted = null;
  sb.roomData.farmBuyerSold = null;
  sb.roomData.coins = 0;
  sb.toasts = [];
  sb.showToast = (m) => sb.toasts.push(m);
  return sb;
}
const AGERS_ALL = ['cheesecave', 'smokehouse', 'hamcellar'];

test('the buyer starts open and wants a frozen set', () => {
  const sb = buyerSandbox(AGERS_ALL, { agedcheese: 5 });
  const a = sb.farmBuyerState();
  assert.equal(a.present, true, 'a farm that has never sold should find the stall open');
  assert.ok(a.wanted.length > 0 && a.wanted.length <= vm.runInContext('FARM_BUYER_WANT_COUNT', sb));
  // Frozen: selling stock out from under it must not re-order the list.
  const first = JSON.stringify(a.wanted);
  sb.roomData.farmAged = { agedham: 9 };
  assert.equal(JSON.stringify(sb.farmBuyerState().wanted), first,
    'the wanted list re-shuffled mid-visit — the preview would stop matching the visit');
});

test('it never asks for a good the farm has no factory for', () => {
  // Only the cheese cave (the one that comes free with the plot).
  const sb = buyerSandbox(['cheesecave'], {});
  const ids = sb.farmBuyerState().wanted.map(w => w.id);
  assert.ok(ids.length > 0, 'a one-factory farm got an empty list');
  const cave = vm.runInContext('FARM_AGERS', sb).find(d => d.id === 'cheesecave');
  const mine = cave.recipes.map(r => r.out.id);
  ids.forEach(id => assert.ok(mine.indexOf(id) >= 0,
    'it asked for ' + id + ', which needs a factory this farm has not unlocked'));
});

test('clearing it out shuts it for a day and previews the next list', async () => {
  const sb = buyerSandbox(AGERS_ALL, {});
  const before = sb.farmBuyerState();
  // Hand the farm exactly what it wants, then sell the lot.
  before.wanted.forEach(w => { sb.roomData.farmAged[w.id] = w.qty; });
  sb.openBuyerSheet();
  await sb.sellAllToBuyer();
  const after = sb.farmBuyerState();
  assert.equal(after.present, false, 'the stall stayed open after being cleared out');
  const cool = vm.runInContext('FARM_BUYER_COOLDOWN_MS', sb);
  assert.ok(after.nextInMs > cool - 5000 && after.nextInMs <= cool,
    'reopens in ' + after.nextInMs + 'ms, expected about ' + cool);
  assert.ok(after.wanted.length > 0, 'a shut stall must still show what it will take next');
  assert.notEqual(after.visitStart, before.visitStart, 'the next visit reused this visit’s key');
  // Everything it took is gone from the crate and paid for.
  before.wanted.forEach(w => assert.equal(sb.roomData.farmAged[w.id], 0));
  assert.ok(sb.roomData.coins > 0);
});

test('it stops at the quota for each kind, and leaves the rest in the crate', async () => {
  const sb = buyerSandbox(AGERS_ALL, {});
  const b = sb.farmBuyerState();
  const w = b.wanted[0];
  sb.roomData.farmAged[w.id] = w.qty + 6;          // more than it asked for
  sb.openBuyerSheet();
  await sb.sellAllToBuyer();
  assert.equal(sb.roomData.farmAged[w.id], 6,
    'it took ' + (w.qty + 6 - sb.roomData.farmAged[w.id]) + ' of a quota of ' + w.qty);
  // And a further tap on that kind is refused rather than silently paid for.
  const coins = sb.roomData.coins;
  await sb.sellOneToBuyer(w.id);
  assert.equal(sb.roomData.coins, coins, 'it paid for a unit past its own quota');
});

test('a shut buyer refuses a sale', async () => {
  const sb = buyerSandbox(AGERS_ALL, {});
  const w = sb.farmBuyerState().wanted[0];
  sb.roomData.farmAged[w.id] = 3;
  sb.roomData.farmBuyerLeftAt = Date.now();        // just shut
  sb.openBuyerSheet();
  await sb.sellOneToBuyer(w.id);
  assert.equal(sb.roomData.farmAged[w.id], 3, 'a shut stall bought something');
  assert.equal(sb.roomData.coins, 0);
});

test('progress through a visit survives a reload', async () => {
  const sb = buyerSandbox(AGERS_ALL, {});
  const b = sb.farmBuyerState();
  const w = b.wanted[0];
  sb.roomData.farmAged[w.id] = w.qty + 2;
  sb.openBuyerSheet();
  await sb.sellOneToBuyer(w.id);
  const saved = sb.roomData.farmBuyerSold;
  assert.ok(saved && saved.visitStart === b.visitStart && saved.sold[w.id] === 1,
    'the visit’s progress was not persisted: ' + JSON.stringify(saved));
  // Reload: the in-memory tally is gone, the saved one is restored on open.
  vm.runInContext('_buyerSold = {}; _buyerVisitKey = null;', sb);
  sb.openBuyerSheet();
  assert.equal(vm.runInContext('_buyerSold', sb)[w.id], 1,
    'after a reload the stall re-offered a unit it had already bought');
});

/* ── The Upgrades tab's land row ──
   Reported as "my farm had to be full to open the land beside it — and now it
   shows my farm at level 1". Two faults met on one card: a gate note that
   outlived the thing it gates, and a pasture level that had gone missing under
   it. The row read "2/2 · needs a full pasture" beside a MAX tag, one line
   below "Lv 1/4". */

test('both plots owned: no gate note, whatever the pasture level says', () => {
  const sb = plotSandbox();                 // plotSandbox owns both plots…
  const html = sb._farmLandHtml(false);     // …while the pasture reads unfinished
  assert.ok(!/needs a full pasture/.test(html),
    'a row showing 2/2 and MAX still said the plots "need a full pasture": ' + html);
  assert.ok(/2\/2/.test(html) && /MAX/.test(html),
    'expected the owned/max pair and a MAX tag: ' + html);
});

test('the gate note shows while there is still a plot to buy', () => {
  const sb = plotSandbox();
  sb.roomData.farmLandL = false;
  sb.roomData.farmLandR = false;
  const html = sb._farmLandHtml(false);
  assert.ok(/needs a full pasture/.test(html),
    'nothing on the row said why both sides were dead: ' + html);
  assert.ok(/disabled/.test(html), 'the buy buttons were live below a full pasture');
});

test('a maxed pasture prices the next plot instead of gating it', () => {
  const sb = plotSandbox();
  sb.roomData.farmLandR = false;            // one side left to buy
  const costs = vm.runInContext('FARM_LAND_COSTS', sb);
  const html = sb._farmLandHtml(true);
  assert.ok(!/needs a full pasture/.test(html), 'gated a plot the pasture had earned: ' + html);
  assert.ok(html.includes('next ' + costs[1]),
    'the second plot was not priced at ' + costs[1] + ': ' + html);
});

/* ── The pasture level under those plots ──
   buyFarmLand is the only thing that grants a plot and it refuses below a full
   pasture, so land is proof the pasture was finished. Where the two disagree,
   the land wins. */

test('land on a save puts a lost pasture level back', () => {
  const sb = plotSandbox();
  const max = vm.runInContext('FARM_EXPAND_COSTS', sb).length;
  assert.equal(sb.farmCapLevelOf({ farmCapLevel: 1, farmLandL: true, farmLandR: true }), max,
    'a farm owning both plots must have finished the pasture to have bought them');
  assert.equal(sb.farmCapLevelOf({ farmCapLevel: 0, farmLandR: true }), max,
    'one plot is proof enough — it costs a full pasture too');
});

test('a farm with no plots keeps exactly the level it saved', () => {
  const sb = plotSandbox();
  assert.equal(sb.farmCapLevelOf({ farmCapLevel: 1 }), 1,
    'the repair handed out expansions nobody bought');
  assert.equal(sb.farmCapLevelOf({ farmCapLevel: 0, farmLandL: false, farmLandR: false }), 0);
  assert.equal(sb.farmCapLevelOf({}), 0);
  assert.equal(sb.farmCapLevelOf(undefined), 0, 'a missing document must read as a new farm');
});

test('the repair never pushes a level past the top rung', () => {
  const sb = plotSandbox();
  const max = vm.runInContext('FARM_EXPAND_COSTS', sb).length;
  assert.equal(sb.farmCapLevelOf({ farmCapLevel: max, farmLandL: true }), max);
});

test('a repaired save gets back the herd cap it had paid for', () => {
  const sb = plotSandbox();
  const max = vm.runInContext('FARM_EXPAND_COSTS', sb).length;
  const base = vm.runInContext('FARM_MAX_ANIMALS', sb);
  sb.roomData.farmCapLevel = sb.farmCapLevelOf({ farmCapLevel: 1, farmLandL: true, farmLandR: true });
  assert.equal(sb.farmAnimalCap(), base + 10 * max,
    'the pen still held ' + sb.farmAnimalCap() + ' animals, not the ' + (base + 10 * max) +
    ' four expansions were bought for');
});
