/* node --test room-farm-offscreen.test.js — the farm settling while nobody is
   looking at it.

   The farm's own tick sits behind `isFarmView`, so for a long time an
   auto-feeder bought and switched on did nothing at all while its owner was in
   the room: the trough was only ever touched when the farm was opened. The
   room's ten-minute heartbeat now calls runFarmProduction() too, which only
   works if that function is genuinely independent of what is on screen.

   So these load the REAL room-farm-view.js and drive runFarmProduction()
   directly with the farm shut, which is the state the heartbeat calls it in. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const HOUR = 3600 * 1000;

function farmSandbox(opts) {
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
    escapeHtml: (s) => String(s == null ? '' : s), getPlayerName: () => 'T',
    userDocRef: () => { throw new Error('no db'); }, saveRoom: () => Promise.resolve(true),
    renderAll() {}, checkAchievements() {}, drawFarmAnimal() {},
    visitRoom: () => Promise.resolve(), _syncRoomPanel() {},
    T: (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : '')),
    currentUid: 'me', viewingUid: 'me',
    // The farm is SHUT. That is the whole point: this is the state the room's
    // heartbeat settles from.
    isFarmView: opts.isFarmView != null ? opts.isFarmView : false,
  };
  sandbox.toasts = [];
  sandbox.showToast = (m) => sandbox.toasts.push(m);
  sandbox.coinLog = [];
  sandbox.logCoin = (n, why) => sandbox.coinLog.push({ n, why });
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(consts, sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-farm.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-farm-view.js'), 'utf8'), sandbox);

  const now = Date.now();
  sandbox.roomData = {
    coins: opts.coins != null ? opts.coins : 5000,
    farmAnimals: Array.from({ length: opts.herd != null ? opts.herd : 6 }, (_, i) => ({
      id: 'a' + i, type: 'chicken', happiness: 80, collected: 0,
      lastDropTime: now - (opts.ago || 0), posX: 0.5, posY: 0.7,
    })),
    farmDrops: [], farmStock: {}, farmPlots: [], farmMachines: {},
    farmFood: opts.food != null ? opts.food : 10,
    farmFoodAt: now - (opts.ago || 0),
    farmAutoFeed: opts.feeder !== false,
    farmAutoFeedOn: opts.feeder !== false,
    farmCartLeftAt: 0, farmCartWanted: null, farmCartSold: null,
  };
  return sandbox;
}

test('the auto-feeder buys with the farm shut', () => {
  const sb = farmSandbox({ food: 5, coins: 5000, ago: HOUR });
  assert.equal(sb.isFarmView, false, 'the farm is not on screen');
  const before = sb.roomData.coins;
  sb.runFarmProduction();
  assert.ok(sb.roomData.farmFood > 5, 'the trough was never topped up (' + sb.roomData.farmFood + ')');
  assert.ok(sb.roomData.coins < before, 'feed was free');
  assert.ok(sb.coinLog.some(c => c.n < 0), 'the purchase was not logged against the wallet');
});

/* Silence would be worse than a toast here: the farm is off screen, so the
   only sign the wallet just paid for feed is the message itself. */
test('the player is told what the feed cost, even off screen', () => {
  const sb = farmSandbox({ food: 2, coins: 5000, ago: HOUR });
  sb.runFarmProduction();
  assert.ok(sb.toasts.some(m => /feed/i.test(m)), 'no word of the purchase: ' + JSON.stringify(sb.toasts));
});

test('being on screen or not makes no difference to the settle', () => {
  const shut = farmSandbox({ food: 8, coins: 5000, ago: HOUR, isFarmView: false });
  const open = farmSandbox({ food: 8, coins: 5000, ago: HOUR, isFarmView: true });
  shut.runFarmProduction();
  open.runFarmProduction();
  assert.equal(shut.roomData.farmFood.toFixed(4), open.roomData.farmFood.toFixed(4));
  assert.equal(shut.roomData.coins, open.roomData.coins);
});

test('a feeder that is off stays off', () => {
  const sb = farmSandbox({ food: 5, coins: 5000, ago: HOUR, feeder: false });
  const before = sb.roomData.coins;
  sb.runFarmProduction();
  assert.equal(sb.roomData.coins, before, 'coins were spent with the feeder switched off');
  assert.ok(sb.roomData.farmFood < 5, 'the herd should still have eaten what was there');
});

test('no coins means no feed, not negative coins', () => {
  const sb = farmSandbox({ food: 1, coins: 0, ago: HOUR });
  sb.runFarmProduction();
  assert.equal(sb.roomData.coins, 0);
  assert.ok(sb.roomData.farmFood >= 0, 'the trough went negative');
});

/* The settle has to move the clock, or the next one bills the same window
   again — and the heartbeat reports "changed" on the strength of this. */
test('the settle moves the food clock to now', () => {
  const sb = farmSandbox({ food: 40, coins: 5000, ago: HOUR });
  const was = sb.roomData.farmFoodAt;
  sb.runFarmProduction();
  assert.ok(sb.roomData.farmFoodAt > was, 'farmFoodAt did not advance');
  assert.ok(Date.now() - sb.roomData.farmFoodAt < 2000, 'farmFoodAt is not now');
});

/* Both ticks settle against the same clock, so running one after the other is
   not double billing: the first takes farmFoodAt to now and the second finds
   no elapsed time to charge for. */
test('settling twice in a row does not bill the window twice', () => {
  const sb = farmSandbox({ food: 5, coins: 5000, ago: HOUR });
  sb.runFarmProduction();
  const coinsAfterFirst = sb.roomData.coins, foodAfterFirst = sb.roomData.farmFood;
  sb.runFarmProduction();
  assert.equal(sb.roomData.coins, coinsAfterFirst, 'the second settle charged again');
  assert.equal(sb.roomData.farmFood.toFixed(4), foodAfterFirst.toFixed(4));
});

test('a farm with no herd is left alone', () => {
  const sb = farmSandbox({ herd: 0, food: 5, coins: 5000, ago: HOUR });
  const before = sb.roomData.coins;
  assert.equal(sb.runFarmProduction(), 0);
  assert.equal(sb.roomData.coins, before);
  assert.equal(sb.roomData.farmFood, 5, 'an empty pen ate the feed');
});

/* Visitors do not run anybody's farm. The heartbeat already returns early for
   them, and so does this — belt and braces, because it spends someone's coins. */
test('a visitor settles nothing', () => {
  const sb = farmSandbox({ food: 5, coins: 5000, ago: HOUR });
  sb.viewingUid = 'someone_else';
  const before = sb.roomData.coins;
  assert.equal(sb.runFarmProduction(), 0);
  assert.equal(sb.roomData.coins, before);
});
