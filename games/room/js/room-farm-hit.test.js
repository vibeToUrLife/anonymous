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
