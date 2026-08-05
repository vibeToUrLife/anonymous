/* node --test room-daily.test.js — the daily login reward, across devices.

   Three bugs, all of them "same account, second device":

   1. Firestore offline persistence means the FIRST onSnapshot after a load
      comes out of that device's own IndexedDB cache. The post-load hooks ran
      on it, so device B decided whether today's reward was claimed by reading
      its own stale copy — the claim device A made an hour ago wasn't in it.
   2. getTodayStr() used the device's local calendar day, so two devices in
      different timezones disagreed about what "today" is. That one doesn't
      just re-pop the modal, it re-ARMS the button and resets the streak.
   3. Nothing stopped two devices claiming at once: both read the same old
      lastLoginDay locally and both awarded coins.

   Loads the REAL room-ui.js and room-firebase.js in a sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const DAY = 86400000;

/* ── A DOM stub that remembers each element, so a test can ask whether the
      daily overlay ended up shown and what the claim button says. ── */
function makeDom() {
  const els = new Map();
  function make(id) {
    const classes = new Set(['hidden']);
    const el = {
      id, classes, handlers: {},
      addEventListener(ev, fn) { (el.handlers[ev] = el.handlers[ev] || []).push(fn); },
      classList: {
        add: (c) => { classes.add(c); },
        remove: (c) => { classes.delete(c); },
        contains: (c) => classes.has(c),
        toggle: (c, on) => {
          const want = on === undefined ? !classes.has(c) : !!on;
          if (want) classes.add(c); else classes.delete(c);
          return want;
        },
      },
      dataset: {}, style: {}, innerHTML: '', textContent: '', disabled: false,
      querySelector: () => make('#q'), querySelectorAll: () => [],
      appendChild() {}, remove() {},
    };
    return el;
  }
  return {
    get: (id) => { if (!els.has(id)) els.set(id, make(id)); return els.get(id); },
    document: {
      getElementById: (id) => { if (!els.has(id)) els.set(id, make(id)); return els.get(id); },
      querySelector: (sel) => { if (!els.has(sel)) els.set(sel, make(sel)); return els.get(sel); },
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: (tag) => make(tag),
      body: make('body'),
    },
  };
}

/* Loads room-base.js's DAILY_REWARDS plus the two files under test. Firestore
   is faked: one shared server document, so two sandboxes can be pointed at the
   same doc and race each other the way two devices do. */
function dailySandbox(opts) {
  opts = opts || {};
  const dom = makeDom();
  const timers = [];             // setTimeout callbacks, run on demand
  const server = opts.server || { doc: {} };

  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, Promise,
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: dom.document,
    window: null, localStorage: { getItem: () => null, setItem() {} },
    T: (s, v) => { let o = s; if (v) for (const k of Object.keys(v)) o = o.split('{' + k + '}').join(v[k]); return o; },
    I18N: { plural: (n, one, many, v) => (n === 1 ? one : many).split('{n}').join(n) },
    escapeHtml: (s) => String(s == null ? '' : s),
    getPlayerName: () => 'T',
    currentUid: 'me', viewingUid: 'me', currentLayer: 1, isFarmView: false,
    isOutsideView: false, isAquariumView: false,
  };

  // Everything the two files reach for that isn't the thing under test.
  const noop = () => {};
  const stubs = [
    'renderAll', 'renderAllDebounced', 'renderFarmPanel', 'renderShop', 'renderInventory',
    'renderPets', 'renderActiveTab', 'renderGuestbook', 'drawFarmCanvas', 'drawRoomCanvas',
    'checkAchievements', 'logCoin', 'reconcileCoinHistory', 'flushLayerData',
    'maybeGenerateDailyDrops', 'startRoomBgAnimation', 'startPetAnimation',
    'closeFarm', 'closePetStatus', 'updatePetStatusBar', 'renderJukebox', 'renderGachaTab',
    'renderLeaderboardTabs', 'renderCoinHistory', 'showAchievements', '_syncRoomPanel',
    'initRoomDropZone', 'initDecorDrag', 'initMobileFoodTap', 'renderWorkshopModal',
    'renderAnimalModal', 'renderProduceModal', 'renderLayerBar', 'applyRoomTheme',
  ];
  stubs.forEach((n) => { sandbox[n] = noop; });
  sandbox.toasts = [];
  sandbox.showToast = (msg, kind) => { sandbox.toasts.push({ msg, kind }); };
  sandbox.getActivePets = () => [];
  // The snapshot handler normalises the aquarium's daily play counters on the
  // way in; both of these ship in files room.html loads before room-firebase.js.
  sandbox._aqGameToday = () => '2026-8-1';
  sandbox.aquariumPlaysUsed = require('./room-aquarium.js').aquariumPlaysUsed;
  sandbox.migratePets = (d) => d.pets || [];
  sandbox.getTotalPlantIncome = () => null;
  sandbox.planOfflineAutoFeed = () => ({ pets: [], coinsSpent: 0 });
  sandbox.bestCoinsPerPoint = () => 1;
  sandbox._maybeVisitFromUrl = () => false;
  sandbox._maybeOpenFarmFromUrl = () => false;
  sandbox.PETS = []; sandbox.DECORATIONS = []; sandbox.PLANT_LEVELS = [];
  sandbox.FOODS = []; sandbox.DRINKS = []; sandbox.PET_COLORS = {};
  sandbox.ACHIEVEMENTS = [];

  // ── The fake Firestore: one shared server doc + a real transaction ──
  sandbox.server = server;
  sandbox.writes = [];
  const docRef = {
    set: (data, o) => { Object.assign(server.doc, data); sandbox.writes.push(data); return Promise.resolve(); },
    update: (data) => { Object.assign(server.doc, data); sandbox.writes.push(data); return Promise.resolve(); },
    get: () => Promise.resolve({ exists: true, data: () => Object.assign({}, server.doc) }),
    onSnapshot: () => () => {},
  };
  sandbox.userDocRef = () => docRef;
  sandbox.db = {
    runTransaction: (fn) => {
      // Serialised, like the real thing: read the server doc, then write it.
      return Promise.resolve(fn({
        get: () => Promise.resolve({ exists: true, data: () => Object.assign({}, server.doc) }),
        set: (ref, data) => { Object.assign(server.doc, data); sandbox.writes.push(data); },
        update: (ref, data) => { Object.assign(server.doc, data); sandbox.writes.push(data); },
      }));
    },
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // DAILY_REWARDS lives in room-base.js among a lot of Firebase bootstrapping;
  // take just that block, the way room-farm-hit.test.js takes the farm consts.
  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const s = base.indexOf('const DAILY_REWARDS = [');
  vm.runInContext(base.slice(s, base.indexOf('];', s) + 2), sandbox);
  // Same trick for farmCapLevelOf: the snapshot handler reads the pasture level
  // back through it, so the block it lives in has to be here to load at all.
  const f = base.indexOf('const FARM_EXPAND_COSTS = [');
  vm.runInContext(base.slice(f, base.indexOf('const FARM_AUTOCOLLECT_COST', f)), sandbox);

  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-firebase.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-ui.js'), 'utf8'), sandbox);

  sandbox._dom = dom;
  sandbox._timers = timers;
  sandbox._runTimers = () => { const q = timers.splice(0); q.forEach((t) => t.fn()); };
  sandbox.roomData = Object.assign({
    coins: 0, pets: [], layerData: {}, coinHistory: [], unlockedLayers: 1,
    loginStreak: 0, lastLoginDay: '',
  }, opts.roomData || {});
  return sandbox;
}

// A snapshot the way Firestore hands one over, cache or server.
function snapOf(doc, meta) {
  return {
    exists: true,
    data: () => doc,
    metadata: Object.assign({ fromCache: false, hasPendingWrites: false }, meta || {}),
  };
}

function dailyShown(sb) {
  return !sb._dom.get('dailyOverlay').classList.contains('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   1. The stale cache — the reported bug
   ═══════════════════════════════════════════════════════════════ */

test('a cache-only first snapshot must not decide whether today is claimed', () => {
  const sb = dailySandbox();
  const today = sb.getTodayStr();
  const stale = '2000-01-01';           // any day but today, whatever the clock says

  // Device B wakes up with a copy of the doc from BEFORE device A claimed.
  sb._handleRoomSnap(snapOf({ coins: 100, lastLoginDay: stale, loginStreak: 3 }, { fromCache: true }));
  sb._runTimers();
  assert.equal(dailyShown(sb), false,
    'the reward modal was armed off this device\'s stale cache');

  // …then the truth lands: device A already claimed today.
  sb._handleRoomSnap(snapOf({ coins: 110, lastLoginDay: today, loginStreak: 4 }));
  sb._runTimers();
  assert.equal(dailyShown(sb), false, 'already claimed today — nothing to pop');
});

test('a server snapshot still pops the modal when the reward is genuinely unclaimed', () => {
  const sb = dailySandbox();
  const stale = '2000-01-01';

  sb._handleRoomSnap(snapOf({ coins: 100, lastLoginDay: stale, loginStreak: 3 }, { fromCache: true }));
  sb._runTimers();
  assert.equal(dailyShown(sb), false);

  sb._handleRoomSnap(snapOf({ coins: 100, lastLoginDay: stale, loginStreak: 3 }));
  sb._runTimers();
  assert.equal(dailyShown(sb), true, 'a real unclaimed day must still open the modal');
});

/* ═══════════════════════════════════════════════════════════════
   2. The day boundary — same instant, two timezones
   ═══════════════════════════════════════════════════════════════ */

test('the game day is the same everywhere, not the device calendar day', () => {
  const sb = dailySandbox();
  // 2026-07-30 15:59 UTC is still the 30th in UTC+8; one minute later it is the 31st.
  assert.equal(sb.getTodayStr(Date.UTC(2026, 6, 30, 15, 59)), '2026-07-30');
  assert.equal(sb.getTodayStr(Date.UTC(2026, 6, 30, 16, 0)), '2026-07-31');
  // …and a device sitting in UTC-8 asking at the same instant gets the same answer,
  // because the function never consults the local calendar.
  assert.equal(sb.getTodayStr(Date.UTC(2026, 6, 30, 16, 0)),
               sb.getTodayStr(Date.UTC(2026, 6, 30, 16, 0)));
});

test('yesterday is one game day back, so the streak survives a timezone hop', () => {
  const sb = dailySandbox();
  const ts = Date.UTC(2026, 6, 31, 2, 0);          // 10:00 in UTC+8 on the 31st
  assert.equal(sb.getTodayStr(ts), '2026-07-31');
  assert.equal(sb.getTodayStr(ts - DAY), '2026-07-30');
});

/* ═══════════════════════════════════════════════════════════════
   3. Two devices claiming at once
   ═══════════════════════════════════════════════════════════════ */

test('the second device to claim gets nothing, however stale it thinks it is', async () => {
  const server = { doc: { coins: 500, lastLoginDay: '', loginStreak: 0 } };
  const a = dailySandbox({ server, roomData: { coins: 500, lastLoginDay: '', loginStreak: 0 } });
  const b = dailySandbox({ server, roomData: { coins: 500, lastLoginDay: '', loginStreak: 0 } });

  const gotA = await a.claimDailyReward();
  const gotB = await b.claimDailyReward();     // same account, same day, stale local state

  assert.equal(gotA.claimed, true, 'the first claim should go through');
  assert.equal(gotB.claimed, false, 'the second must be refused by the server read');
  assert.equal(server.doc.coins, 510, 'day 1 pays 10 coins — once');
  assert.equal(server.doc.loginStreak, 1);
});

// A refusal has to move the local copy too. Leaving lastLoginDay stale meant the
// re-render right after it re-enabled the button, so the player could keep
// tapping a claim the server would refuse every time.
test('a refused claim syncs this device to what the server said', async () => {
  const server = { doc: { coins: 900, lastLoginDay: '', loginStreak: 6 } };
  const sb = dailySandbox({ server, roomData: { coins: 111, lastLoginDay: '2000-01-01', loginStreak: 1 } });
  server.doc.lastLoginDay = sb.getTodayStr();

  const out = await sb.claimDailyReward();

  assert.equal(out.claimed, false);
  assert.equal(sb.roomData.lastLoginDay, sb.getTodayStr(), 'the button must not re-arm');
  assert.equal(sb.roomData.loginStreak, 6, 'the streak the other device earned');
  assert.equal(sb.roomData.coins, 900, 'and its balance');
  assert.equal(server.doc.coins, 900, 'a refusal must not pay anything out');
});

test('a claim reads the streak from the server, not from a stale local copy', async () => {
  const yesterday = new Date(Date.now() - DAY);
  const server = { doc: { coins: 0, lastLoginDay: '', loginStreak: 0 } };
  const sb = dailySandbox({ server });
  server.doc.lastLoginDay = sb.getTodayStr(Date.now() - DAY);
  server.doc.loginStreak = 4;
  // This device still believes it is on a 1-day streak from days ago.
  sb.roomData.loginStreak = 1;
  sb.roomData.lastLoginDay = sb.getTodayStr(Date.now() - 5 * DAY);

  const got = await sb.claimDailyReward();

  assert.equal(got.claimed, true);
  assert.equal(got.streak, 5, 'the server said 4 yesterday, so today is 5');
  assert.equal(server.doc.loginStreak, 5);
  assert.equal(server.doc.coins, 75, 'day 5 pays 75');
  assert.equal(sb.roomData.loginStreak, 5, 'and the local copy must follow the server');
});

/* ═══════════════════════════════════════════════════════════════
   4. The farm scale a routine save must not post
   ═══════════════════════════════════════════════════════════════ */

/* Same stale-cache shape as §1, one field over, and it cost real progress:
   "my farm had to be full to open the land beside it — and now it shows my farm
   at level 1". Applying a cache-only snapshot sets _roomLoaded, which unblocks
   every saveRoom() site and the farm production tick; while farmCapLevel rode
   along in that payload, the first tick after a stale read posted the old level
   straight over the server's. */

test('a routine save does not carry the farm scale at all', async () => {
  const sb = dailySandbox();
  sb._handleRoomSnap(snapOf({ coins: 100, farmCapLevel: 4, farmLandL: true, farmLandR: true }));
  await sb.saveRoom();
  const posted = sb.writes[sb.writes.length - 1];
  for (const k of ['farmCapLevel', 'farmLandL', 'farmLandR']) {
    assert.ok(!(k in posted), k + ' rode along in a routine save — only the purchase may move it');
  }
});

test('a tick after a stale cache read cannot walk the pasture backwards', async () => {
  const sb = dailySandbox({ server: { doc: { coins: 100, farmCapLevel: 4, farmLandL: true, farmLandR: true } } });

  // This device wakes with a copy from before any of that was bought…
  sb._handleRoomSnap(snapOf({ coins: 100, farmCapLevel: 1 }, { fromCache: true }));
  assert.equal(sb.roomData.farmCapLevel, 1, 'the cached copy is what the client is holding');

  // …and something saves before the server answers, the way the farm tick does.
  await sb.saveRoom();

  assert.equal(sb.server.doc.farmCapLevel, 4, 'a stale save walked the pasture back to Lv 1');
  assert.equal(sb.server.doc.farmLandL, true, 'and took the plots it had paid for with it');
  assert.equal(sb.server.doc.farmLandR, true);
});

test('the level a save leaves alone is the one the next snapshot brings back', () => {
  const sb = dailySandbox();
  sb._handleRoomSnap(snapOf({ coins: 100, farmCapLevel: 1 }, { fromCache: true }));
  sb._handleRoomSnap(snapOf({ coins: 100, farmCapLevel: 4, farmLandL: true, farmLandR: true }));
  assert.equal(sb.roomData.farmCapLevel, 4, 'the server snapshot did not correct the stale level');
});
