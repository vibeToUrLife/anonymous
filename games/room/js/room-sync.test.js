/* node --test room-sync.test.js — the room document across two devices.

   Reported as: the laptop and the phone are both open, work done on one comes
   back undone on the other. "电脑做了这个东西，手机没同步，然后手机做其他东西
   然后没得到这个东西."

   The cause was that saveRoom() posted the WHOLE document — some ninety fields
   built out of whichever copy of roomData that client happened to be holding.
   Every save was therefore a bet that this device's copy was the freshest one
   in existence, and a device is stale far more often than it looks:

     • the listener is detached the entire time the tab is hidden, so a
       backgrounded laptop tab freezes at whatever it last saw;
     • offline persistence answers the first snapshot after a load out of THIS
       device's IndexedDB cache, which on a second device is hours old;
     • the farm and plant ticks save on their own timers, without waiting to
       hear back from the server.

   Losing the race was silent — nothing errored, the phone's farm simply came
   back the way the laptop remembered it.

   These tests hold two sandboxes against ONE fake server document, the way
   room-daily.test.js does, and check the two rules that replaced the bet:
   a save carries only the fields this device changed, and coins move as an
   atomic delta rather than an absolute balance.

   Loads the REAL room-firebase.js in a sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const MIN = 60 * 1000;

/* ── The fake server: one document, shared by every device in a test ──
   set(patch, {merge:true}) is field-level, and an increment sentinel is applied
   against whatever the document holds right now — which is the whole point of
   using one for coins. */
function applyPatch(server, patch) {
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === 'object' && typeof v.__inc === 'number') {
      server.doc[k] = (server.doc[k] || 0) + v.__inc;
    } else {
      server.doc[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }
  }
}

function syncSandbox(opts) {
  opts = opts || {};
  const server = opts.server || { doc: {} };
  const els = new Map();
  const timers = [];

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, Promise,
    setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    document: {
      getElementById: (id) => {
        if (!els.has(id)) els.set(id, { id, style: { display: 'none' } });
        return els.get(id);
      },
      addEventListener() {},
      querySelector: () => null,
      hidden: false,
      visibilityState: 'visible',
    },
    localStorage: { getItem: () => null, setItem() {} },
    T: (s, v) => { let o = s; if (v) for (const k of Object.keys(v)) o = o.split('{' + k + '}').join(v[k]); return o; },
    I18N: { plural: (n, one, many) => (n === 1 ? one : many).split('{n}').join(n) },
    getPlayerName: () => 'T',
    currentUid: 'me', viewingUid: 'me', currentLayer: 1, isFarmView: false,
    isOutsideView: false, isAquariumView: false,
    // Constants room-base.js would supply.
    PLANT_OFFLINE_CAP_MS: 2 * 60 * MIN,
    PLANT_OFFLINE_MODAL_MS: 30 * MIN,
    STARVE_AFFECTION_LOSS: 1,
    AUTOFEED_TARGET: 100, AUTOFEED_THRESHOLD: 30,
    COIN_HISTORY_MAX: 200,
  };

  const noop = () => {};
  [
    'renderAll', 'renderAllDebounced', 'renderFarmPanel', 'drawFarmCanvas',
    'checkAchievements', 'checkDailyOnLogin', 'logCoin', 'reconcileCoinHistory',
    'flushLayerData', 'maybeGenerateDailyDrops', 'closeFarm', 'showToast',
    'initRoomDropZone', 'initDecorDrag', 'initMobileFoodTap',
  ].forEach((n) => { sandbox[n] = noop; });
  sandbox.toasts = [];
  sandbox.showToast = (msg, kind) => { sandbox.toasts.push({ msg, kind }); };
  sandbox.migratePets = (d) => d.pets || [];
  sandbox.getTotalPlantIncome = () => (opts.income || null);
  sandbox.planOfflineAutoFeed = () => ({ pets: [], coinsSpent: 0 });
  sandbox.bestCoinsPerPoint = () => 1;
  sandbox.farmCapLevelOf = (d) => d.farmCapLevel || 0;
  sandbox._aqGameToday = () => '2026-08-01';
  sandbox.aquariumPlaysUsed = (day, today, n) => (day === today ? (n || 0) : 0);
  sandbox.PETS = []; sandbox.DECORATIONS = []; sandbox.FOODS = []; sandbox.DRINKS = [];

  // The Firestore surface room-firebase.js reaches for.
  sandbox.server = server;
  sandbox.patches = [];   // every set() this device posted
  sandbox.queued = [];    // …the ones still waiting on the server, in offline mode
  sandbox.updates = [];   // every update() — heartbeats, displayName repair
  const docRef = {
    set: (patch) => {
      sandbox.patches.push(patch);
      // Offline, the SDK queues the write and the promise stays pending until
      // the server acknowledges it — the cache is updated either way.
      if (opts.offline) { sandbox.queued.push(patch); return new Promise(() => {}); }
      applyPatch(server, patch);
      return Promise.resolve();
    },
    update: (patch) => { sandbox.updates.push(patch); applyPatch(server, patch); return Promise.resolve(); },
    get: () => Promise.resolve({ exists: true, data: () => Object.assign({}, server.doc) }),
    onSnapshot: () => () => {},
  };
  sandbox.userDocRef = () => docRef;
  // The real SDK's increment, modelled as a sentinel the fake set() understands.
  sandbox.firebase = { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } };
  sandbox.db = { runTransaction: (fn) => Promise.resolve(fn({
    get: () => Promise.resolve({ exists: true, data: () => Object.assign({}, server.doc) }),
    set: (r, patch) => applyPatch(server, patch),
    update: (r, patch) => applyPatch(server, patch),
  })) };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-firebase.js'), 'utf8'), sandbox);

  sandbox._timers = timers;
  sandbox._runTimers = () => { timers.splice(0).forEach((fn) => fn()); };
  sandbox.roomData = Object.assign({
    coins: 0, pets: [], layerData: {}, coinHistory: [], unlockedLayers: 1,
    farmStock: {}, farmPlots: [], ownedDecors: [], ownedAccessories: [],
    placedDecors: [], plantLevels: {}, ownedPlants: [],
  }, opts.roomData || {});
  // Read a `let` out of the script's lexical scope — it is not a sandbox property.
  sandbox._peek = (name) => vm.runInContext(name, sandbox);
  sandbox._poke = (name, value) => {
    sandbox.__v = value;
    vm.runInContext(name + ' = __v', sandbox);
  };
  return sandbox;
}

// A snapshot the way Firestore hands one over, cache or server.
function snapOf(doc, meta) {
  return {
    exists: true,
    data: () => JSON.parse(JSON.stringify(doc)),
    metadata: Object.assign({ fromCache: false, hasPendingWrites: false }, meta || {}),
  };
}

// The document as both devices found it before either of them touched anything.
function baseDoc(extra) {
  return Object.assign({
    coins: 500,
    displayName: 'T',
    updatedAt: Date.now(),
    lastCoinCollect: Date.now(),
    farmStock: { wheat: 3 },
    farmPlots: [{ crop: 'wheat', at: 1 }],
    ownedDecors: ['rug'],
    pets: [],
    layerData: { 1: { wallPattern: 'wall_default', placedDecors: [] } },
  }, extra || {});
}

// Fields a save posts every time because they describe this device's session.
const HOUSEKEEPING = ['lastSeen', 'updatedAt'];
function moved(patch) {
  return Object.keys(patch).filter((k) => HOUSEKEEPING.indexOf(k) < 0).sort();
}

/* ═══════════════════════════════════════════════════════════════
   1. A save carries only what this device changed
   ═══════════════════════════════════════════════════════════════ */

test('a save posts the field this device moved and nothing else', async () => {
  const sb = syncSandbox();
  sb._handleRoomSnap(snapOf(baseDoc()));
  sb.patches.length = 0;

  sb.roomData.ownedDecors = ['rug', 'lamp'];      // bought one decoration
  await sb.saveRoom();

  assert.deepEqual(moved(sb.patches[0]), ['ownedDecors'],
    'the save carried ' + moved(sb.patches[0]).join(', ') + ' — every extra field is ' +
    'another device\'s work waiting to be overwritten');
});

test('a save that changed nothing carries nothing but housekeeping', async () => {
  const sb = syncSandbox();
  sb._handleRoomSnap(snapOf(baseDoc()));
  sb.patches.length = 0;

  await sb.saveRoom();
  assert.deepEqual(moved(sb.patches[0]), [],
    'an idle tick posted real fields: ' + moved(sb.patches[0]).join(', '));
});

test('a map coming back in a different key order is not a change', async () => {
  const sb = syncSandbox();
  sb._handleRoomSnap(snapOf(baseDoc({ farmStock: { wheat: 3, corn: 1, egg: 7 } })));
  sb.patches.length = 0;

  // Same three counts, rebuilt in the order this device happens to iterate.
  sb.roomData.farmStock = { egg: 7, wheat: 3, corn: 1 };
  await sb.saveRoom();

  assert.deepEqual(moved(sb.patches[0]), [],
    'a reshuffled map read as a change, so the field travelled and could land ' +
    'on a newer count');
});

/* ═══════════════════════════════════════════════════════════════
   2. The reported bug: two devices, one document
   ═══════════════════════════════════════════════════════════════ */

test('a stale device does not undo the work it never saw', async () => {
  const server = { doc: baseDoc() };
  const phone = syncSandbox({ server });
  const laptop = syncSandbox({ server });

  // Both loaded the same document.
  phone._handleRoomSnap(snapOf(server.doc));
  laptop._handleRoomSnap(snapOf(server.doc));

  // The phone harvests. The laptop's tab is in the background — its listener is
  // detached, so it never hears about any of this.
  phone.roomData.farmStock = { wheat: 9 };
  phone.roomData.farmPlots = [{ crop: null, at: 0 }];
  await phone.saveRoom();
  assert.deepEqual(server.doc.farmStock, { wheat: 9 });

  // The laptop comes back and saves something of its own.
  laptop.roomData.ownedDecors = ['rug', 'lamp'];
  await laptop.saveRoom();

  assert.deepEqual(server.doc.farmStock, { wheat: 9 },
    'the laptop posted the farm it remembered and the harvest was undone');
  assert.deepEqual(server.doc.farmPlots, [{ crop: null, at: 0 }],
    'the harvested plot was refilled by a device that never saw it harvested');
  assert.deepEqual(server.doc.ownedDecors, ['rug', 'lamp'],
    'the laptop\'s own change still has to land');
});

test('both devices keep their own work when they change different things', async () => {
  const server = { doc: baseDoc() };
  const phone = syncSandbox({ server });
  const laptop = syncSandbox({ server });
  phone._handleRoomSnap(snapOf(server.doc));
  laptop._handleRoomSnap(snapOf(server.doc));

  laptop.roomData.layerData = { 1: { wallPattern: 'wall_stripe', placedDecors: [] } };
  phone.roomData.pets = [{ id: 'p1', type: 'cat', hunger: 100 }];

  await laptop.saveRoom();
  await phone.saveRoom();

  assert.equal(server.doc.layerData[1].wallPattern, 'wall_stripe',
    'the wallpaper the laptop hung was overwritten by the phone');
  assert.equal(server.doc.pets.length, 1, 'the pet the phone adopted was overwritten by the laptop');
});

test('opening a second device on a stale cache does not roll the balance back', async () => {
  // The reported reproduction, near enough verbatim: produce was sold on the
  // laptop and the balance went to 92000. Opening the phone showed 89000 — the
  // phone's own cache, from before the sale — and then the laptop, refreshed,
  // showed 89000 as well, with the sold produce back in the barn. The phone had
  // posted its cache over the sale, and the laptop was reading the result.
  const server = { doc: baseDoc({ coins: 92000, farmStock: { egg: 0 } }) };
  const phone = syncSandbox({ server });

  // The phone paints from its cache first — that part is by design and fine.
  phone._handleRoomSnap(snapOf(baseDoc({ coins: 89000, farmStock: { egg: 40 } }), { fromCache: true }));
  assert.equal(phone.roomData.coins, 89000);

  // What must never happen is that copy travelling. Any save at all — a tick, a
  // heartbeat, banking idle income — used to carry the whole document with it.
  await phone.saveRoom();

  assert.equal(server.doc.coins, 92000,
    'the balance came back to ' + server.doc.coins + ' — the sale was refunded by a ' +
    'device that never saw it happen');
  assert.deepEqual(server.doc.farmStock, { egg: 0 },
    'the sold produce reappeared in the barn');

  // …and a moment later the real document arrives and the phone shows the truth.
  phone._handleRoomSnap(snapOf(server.doc));
  assert.equal(phone.roomData.coins, 92000);
});

/* ═══════════════════════════════════════════════════════════════
   3. Coins — a shared balance, so a delta and not an absolute
   ═══════════════════════════════════════════════════════════════ */

test('earning here and spending there add up instead of one winning', async () => {
  const server = { doc: baseDoc({ coins: 500 }) };
  const laptop = syncSandbox({ server });
  const phone = syncSandbox({ server });
  laptop._handleRoomSnap(snapOf(server.doc));
  phone._handleRoomSnap(snapOf(server.doc));

  laptop.roomData.coins = 550;          // a mini-game paid out
  await laptop.saveRoom();
  assert.equal(server.doc.coins, 550);

  phone.roomData.coins = 470;           // …meanwhile the phone spent 30 of the old 500
  await phone.saveRoom();

  assert.equal(server.doc.coins, 520,
    'the balance ended at ' + server.doc.coins + '; +50 and -30 against 500 is 520, ' +
    'and anything else means one device\'s coins were thrown away');
});

test('a coin delta is posted once, not again on the next save', async () => {
  const server = { doc: baseDoc({ coins: 500 }) };
  const sb = syncSandbox({ server });
  sb._handleRoomSnap(snapOf(server.doc));

  sb.roomData.coins = 600;
  await sb.saveRoom();
  assert.equal(server.doc.coins, 600);

  // The write has not echoed back as a snapshot yet — the next tick must not
  // re-apply the same +100.
  await sb.saveRoom();
  assert.equal(server.doc.coins, 600, 'the same earning was banked twice');
});

test('a balance moved outside this page is not rolled back by an unrelated save', async () => {
  const server = { doc: baseDoc({ coins: 500 }) };
  const sb = syncSandbox({ server });
  sb._handleRoomSnap(snapOf(server.doc));

  // The board's shop charges 200 in its own transaction; this page never hears.
  applyPatch(server, { coins: { __inc: -200 } });

  sb.roomData.ownedDecors = ['rug', 'lamp'];
  await sb.saveRoom();

  assert.equal(server.doc.coins, 300,
    'the balance came back to ' + server.doc.coins + ' — the room handed back coins ' +
    'the shop had already taken');
});

/* ═══════════════════════════════════════════════════════════════
   3b. …and the other edge of the same knife
   ═══════════════════════════════════════════════════════════════

   Posting a delta means anything that banks coins on the server BEHIND
   saveRoom's back — the daily reward transaction, a gift, a farm help, an
   inbox claim — has to move the baseline with it. Leave the baseline where it
   was and the next save reads the gap as this device's own earning and posts
   it a second time: a 10-coin reward becomes 20, a 500-coin gift charges 1000.
   adoptServerCoins / adoptServerCoinDelta are how those call sites do it, and
   these are the tests that say why they can't go back to a bare assignment. */

test('a balance the server already banked is not re-posted by the next save', async () => {
  const server = { doc: baseDoc({ coins: 500 }) };
  const sb = syncSandbox({ server });
  sb._handleRoomSnap(snapOf(server.doc));

  // What claimDailyReward does: a transaction settles the balance at 510…
  applyPatch(server, { coins: 510, lastLoginDay: '2026-08-06' });
  sb.adoptServerCoins(510);                 // …and the page adopts it
  await sb.saveRoom();                      // the claim's own follow-up save

  assert.equal(server.doc.coins, 510,
    'the balance ended at ' + server.doc.coins + ' — the reward was paid twice');
});

test('coins an increment already took out are not charged again', async () => {
  const server = { doc: baseDoc({ coins: 500 }) };
  const sb = syncSandbox({ server });
  sb._handleRoomSnap(snapOf(server.doc));

  // What sending a gift does: increment(-100) against the document…
  applyPatch(server, { coins: { __inc: -100 } });
  sb.adoptServerCoinDelta(-100);            // …then the page adopts the deduction
  assert.equal(sb.roomData.coins, 400, 'the header has to show the new balance');

  await sb.saveRoom();
  assert.equal(server.doc.coins, 400,
    'the balance ended at ' + server.doc.coins + ' — the gift was charged twice');
});

test('saves made offline queue one delta each, not the same one over and over', () => {
  // A set() with persistence on doesn't settle until the SERVER acks it, so
  // offline every one of these promises is still pending. If the baseline only
  // moved on the ack, each save would measure from the same untouched 500 and
  // the queue would replay the whole balance on reconnect.
  const server = { doc: baseDoc({ coins: 500 }) };
  const sb = syncSandbox({ server, offline: true });
  sb._handleRoomSnap(snapOf(server.doc));

  sb.roomData.coins = 510; sb.saveRoom();      // a plant tick pays 10
  sb.roomData.coins = 520; sb.saveRoom();      // …and another
  sb.roomData.coins = 505; sb.saveRoom();      // …then something costs 15

  sb.queued.forEach((patch) => applyPatch(server, patch));   // the tunnel ends
  assert.equal(server.doc.coins, 505,
    'the queue settled at ' + server.doc.coins + ' rather than 505 — the same ' +
    'earnings were banked more than once');
});

/* ═══════════════════════════════════════════════════════════════
   4. "No document" out of an empty cache is not an empty account
   ═══════════════════════════════════════════════════════════════ */

test('a cache that has never seen the room does not create an empty one', async () => {
  const server = { doc: baseDoc({ coins: 4321 }) };
  const sb = syncSandbox({ server });

  sb._handleRoomSnap({ exists: false, data: () => ({}), metadata: { fromCache: true, hasPendingWrites: false } });

  assert.equal(sb.patches.length, 0,
    'defaults were written on the cache\'s word — the moment the connection comes ' +
    'back that lands on a real account as coins: 0');
  assert.equal(server.doc.coins, 4321);
});

test('the server saying so still creates the room for a genuinely new player', async () => {
  const server = { doc: {} };
  const sb = syncSandbox({ server });

  sb._handleRoomSnap({ exists: false, data: () => ({}), metadata: { fromCache: false, hasPendingWrites: false } });

  assert.equal(sb.patches.length, 1, 'a new player got no document');
  assert.equal(server.doc.displayName, 'T');
});

/* ═══════════════════════════════════════════════════════════════
   5. Waking a backgrounded tab
   ═══════════════════════════════════════════════════════════════ */

test('plant income on wake is billed from the server\'s mark, not the frozen tab\'s', () => {
  const income = { perCycle: 10, count: 1, top: { plantDef: { name: 'Oak' }, plantLvl: 3 } };
  const sb = syncSandbox({ income });
  const now = Date.now();

  // The tab went into the background an hour ago and stopped listening.
  sb._handleRoomSnap(snapOf(baseDoc({ lastCoinCollect: now - 60 * MIN, coins: 500 })));
  sb._poke('_offlineCoinsCollected', true);   // isolate the wake path from the on-load one
  sb.roomData.coins = 500;

  // Meanwhile the phone played, and banking its income moved the shared mark to now.
  sb._poke('_pendingWakeCatchUp', true);
  sb._handleRoomSnap(snapOf(baseDoc({ lastCoinCollect: now, coins: 500 })));

  assert.equal(sb.roomData.coins, 500,
    'the tab billed ' + (sb.roomData.coins - 500) + ' coins for an hour the phone ' +
    'had already been paid for');
});

test('a cache-only snapshot leaves the wake catch-up pending', () => {
  const income = { perCycle: 10, count: 1, top: { plantDef: { name: 'Oak' }, plantLvl: 3 } };
  const sb = syncSandbox({ income });
  const now = Date.now();

  sb._handleRoomSnap(snapOf(baseDoc({ lastCoinCollect: now - 60 * MIN })));
  sb._poke('_offlineCoinsCollected', true);
  sb._poke('_pendingWakeCatchUp', true);

  // This device's own cache still shows the hour-old mark — it is not evidence.
  sb._handleRoomSnap(snapOf(baseDoc({ lastCoinCollect: now - 60 * MIN }), { fromCache: true }));
  assert.equal(sb._peek('_pendingWakeCatchUp'), true,
    'the catch-up ran off the cache, which is exactly the copy that cannot ' +
    'know what the other device banked');

  // The server's copy agrees the hour is unpaid, so now it pays.
  const before = sb.roomData.coins;
  sb._handleRoomSnap(snapOf(baseDoc({ lastCoinCollect: now - 60 * MIN })));
  assert.equal(sb._peek('_pendingWakeCatchUp'), false);
  assert.equal(sb.roomData.coins - before, 120, 'twelve five-minute cycles at 10 a cycle');
});

/* ═══════════════════════════════════════════════════════════════
   6. The baseline follows the account, and the migrations still land
   ═══════════════════════════════════════════════════════════════ */

test('a legacy single-layer document is migrated into layerData and saved', async () => {
  const server = { doc: { coins: 100, displayName: 'T', updatedAt: Date.now(), wallPattern: 'wall_stripe', windowStyle: 'win_classic', placedDecors: [], floorStyle: 'floor_wood' } };
  const sb = syncSandbox({ server });
  sb._handleRoomSnap(snapOf(server.doc));
  sb.patches.length = 0;

  await sb.saveRoom();
  assert.ok(moved(sb.patches[0]).indexOf('layerData') >= 0,
    'the layer migration was baselined as if the document already held it, so it ' +
    'was never written and would run again on every load');
  assert.equal(server.doc.layerData[1].wallPattern, 'wall_stripe');
});

test('switching account clears the baseline so the new room is not read as changed', () => {
  const sb = syncSandbox();
  sb._handleRoomSnap(snapOf(baseDoc({ coins: 500 })));
  assert.equal(sb._peek('_syncedState').coins, 500);

  sb._poke('_syncedState', {});
  assert.deepEqual(sb._peek('_syncedState'), {},
    'a stale baseline from the previous account makes every field of the new ' +
    'room look like a local change');
});
