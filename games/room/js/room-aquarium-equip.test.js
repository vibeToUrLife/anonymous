/* node --test room-aquarium-equip.test.js — the tank's three devices.

   Filter (offline cap), light (idle multiplier) and pump (extra plays a day of
   the two once-a-day games). Loads the REAL room-aquarium-games.js and the
   equipment constants out of room-base.js, so the allowance, the buy and the
   pre-counter migration are checked against the code that ships. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const A = require('./room-aquarium.js');

const TYPES = [
  { name: 'Sardine', rarity: 'common', speed: 1 },
  { name: 'Salmon',  rarity: 'rare',   speed: 1.2 },
  { name: 'Whale',   rarity: 'legendary', speed: 0.6 },
];

function equipSandbox() {
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
    FISH_TYPES: TYPES, drawFish() {}, logCoin() {}, checkAchievements() {},
    renderAll() {}, visitRoom: () => Promise.resolve(),
    saveRoom: () => Promise.resolve(true),
    db: { collection: () => ({ orderBy: () => ({ limit: () => ({ onSnapshot: () => () => {} }) }) }) },
    userDocRef: () => ({ update: () => Promise.resolve() }),
    firebase: { firestore: { FieldValue: { increment: (n) => n } } },
    currentUid: 'me', viewingUid: 'me',
  };
  sandbox.toasts = [];
  sandbox.showToast = (msg) => { sandbox.toasts.push(msg); };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // The pure maths, then the equipment constants, then the games.
  const api = A;
  for (const k of Object.keys(api)) sandbox[k] = api[k];
  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const s = base.indexOf('const AQUARIUM_IDLE_RATES');
  const e = base.indexOf('const FARM_CYCLE_SLOW_MS');
  vm.runInContext(base.slice(s, e), sandbox);
  // Same order as room.html: the view owns the tank, the games sit on top of it.
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-aquarium-view.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-aquarium-games.js'), 'utf8'), sandbox);

  sandbox.roomData = {
    coins: 100000, aquariumFish: ['Sardine', 'Salmon', 'Whale'],
    aquariumFilter: 0, aquariumLight: 0, aquariumPump: 0,
    aquariumBubbleDay: '', aquariumBubbleN: 0,
    aquariumRaceDay: '', aquariumRaceN: 0,
  };
  return sandbox;
}

/* ── The pump's allowance, through the real game entry points ── */

test('with no pump the two capped games are still one a day', () => {
  const sb = equipSandbox();
  const today = sb._aqGameToday();

  assert.equal(sb.aquariumPlaysLeft('bubble'), 1, 'a fresh day starts with the one play');
  sb.roomData.aquariumBubbleDay = today;
  sb.roomData.aquariumBubbleN = 1;
  assert.equal(sb.aquariumPlaysLeft('bubble'), 0, 'and having played it, none');
});

test('each pump level buys one more play of each capped game', () => {
  const sb = equipSandbox();
  const today = sb._aqGameToday();
  sb.roomData.aquariumPump = 2;                       // allowance 3
  sb.roomData.aquariumBubbleDay = today;
  sb.roomData.aquariumRaceDay = today;

  sb.roomData.aquariumBubbleN = 1;
  assert.equal(sb.aquariumPlaysLeft('bubble'), 2);
  sb.roomData.aquariumRaceN = 3;
  assert.equal(sb.aquariumPlaysLeft('race'), 0, 'spent the lot');
});

test('yesterday\'s count does not eat into today', () => {
  const sb = equipSandbox();
  sb.roomData.aquariumBubbleDay = '1999-1-1';
  sb.roomData.aquariumBubbleN = 99;
  assert.equal(sb.aquariumPlaysLeft('bubble'), 1);
});

/* ── The games spending the allowance ──
   The canvas is null in here, so each start writes its counter and then bails
   out of the animation — which is exactly the part under test. */

test('starting Bubble Pop spends one play', () => {
  const sb = equipSandbox();
  sb.roomData.aquariumPump = 1;                       // allowance 2

  sb.startBubblePop();
  assert.equal(sb.aquariumPlaysLeft('bubble'), 1, 'one gone');
  sb.startBubblePop();
  assert.equal(sb.aquariumPlaysLeft('bubble'), 0, 'and the second');
});

test('Bubble Pop refuses once the allowance is gone, without spending anything', () => {
  const sb = equipSandbox();
  sb.roomData.aquariumBubbleDay = sb._aqGameToday();
  sb.roomData.aquariumBubbleN = 1;                    // no pump → allowance 1, all used
  sb.toasts.length = 0;

  sb.startBubblePop();

  assert.equal(sb.roomData.aquariumBubbleN, 1, 'a refusal must not bump the counter');
  assert.ok(sb.toasts.length, 'and must say why');
});

// The race spends its play when the race RUNS, not when the bet sheet opens —
// backing out of the sheet must not cost you the day.
test('the Fish Race keeps its own allowance, separate from the bubbles', () => {
  const sb = equipSandbox();
  sb.roomData.aquariumPump = 3;                       // allowance 4 of each
  const racers = ['Sardine', 'Salmon', 'Whale'];

  sb._aqRunRace(racers, sb.raceOdds(TYPES, racers), 0, 10);

  assert.equal(sb.aquariumPlaysLeft('race'), 3);
  assert.equal(sb.aquariumPlaysLeft('bubble'), 4, 'racing must not cost a bubble play');
});

/* ── Buying ── */

test('buying a device costs its coins and raises exactly that level', async () => {
  const sb = equipSandbox();
  sb.roomData.coins = 2000;

  await sb.buyAquariumEquip('filter');

  assert.equal(sb.roomData.aquariumFilter, 1);
  assert.equal(sb.roomData.coins, 500, 'the Lv1 filter costs 1500');
  assert.equal(sb.roomData.aquariumLight, 0, 'and must not touch the others');
  assert.equal(sb.roomData.aquariumPump, 0);
});

test('a device you cannot afford stays unbought and says so', async () => {
  const sb = equipSandbox();
  sb.roomData.coins = 100;

  await sb.buyAquariumEquip('light');

  assert.equal(sb.roomData.aquariumLight, 0);
  assert.equal(sb.roomData.coins, 100, 'no coins may be taken on a refusal');
  assert.ok(sb.toasts.length, 'a tap that does nothing must say why');
});

test('a maxed device refuses instead of charging for a level that does not exist', async () => {
  const sb = equipSandbox();
  sb.roomData.aquariumPump = 3;
  sb.roomData.coins = 100000;

  await sb.buyAquariumEquip('pump');

  assert.equal(sb.roomData.aquariumPump, 3);
  assert.equal(sb.roomData.coins, 100000);
});

test('a visitor cannot buy equipment in someone else\'s tank', async () => {
  const sb = equipSandbox();
  sb.viewingUid = 'someone-else';
  sb.roomData.coins = 100000;

  await sb.buyAquariumEquip('filter');

  assert.equal(sb.roomData.aquariumFilter, 0);
  assert.equal(sb.roomData.coins, 100000);
});

/* ── What the levels are worth, read through the same helpers the view uses ── */

test('the filter is what sets the offline cap', () => {
  const sb = equipSandbox();
  const HR = 3600000;
  assert.equal(sb.aquariumCapMs(), 3 * HR, 'unbought is the three hours it always was');
  sb.roomData.aquariumFilter = 1; assert.equal(sb.aquariumCapMs(), 6 * HR);
  sb.roomData.aquariumFilter = 3; assert.equal(sb.aquariumCapMs(), 24 * HR);
});

test('the light is what sets the idle multiplier', () => {
  const sb = equipSandbox();
  assert.equal(sb.aquariumMult(), 1);
  sb.roomData.aquariumLight = 1; assert.equal(sb.aquariumMult(), 1.15);
  sb.roomData.aquariumLight = 3; assert.equal(sb.aquariumMult(), 1.5);
});

test('a full day away banks eight times as much with a maxed filter', () => {
  const sb = equipSandbox();
  const DAY = 24 * 3600000;
  // `const` inside the sandbox is a lexical binding, not a property of it.
  const RATES = vm.runInContext('AQUARIUM_IDLE_RATES', sb);
  const earn = () => sb.aquariumIdleCoins(sb.roomData.aquariumFish, TYPES, DAY,
    sb.aquariumCapMs(), RATES, sb.aquariumMult());
  const before = earn();
  sb.roomData.aquariumFilter = 3;
  assert.equal(earn(), before * 8, '3h → 24h is eight times the window');
});
