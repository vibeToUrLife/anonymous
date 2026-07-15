/* node --test room-farm.test.js — unit tests for the pure farm logic. */
const test = require('node:test');
const assert = require('node:assert');
const F = require('./room-farm.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const OPTS = {
  slowMs: 6 * HOUR, fastMs: 2 * HOUR, dropCap: 3,
  foodPerDay: 2, gainPerDay: 25, decayPerDay: 25,
};

function animal(over) {
  return Object.assign({ id: 'a1', type: 'cow', happiness: 50, lastDropTime: 0 }, over);
}

function tick(over) {
  return F.planFarmTick(Object.assign({ animals: [animal()], dropCounts: {}, now: 0, foodStock: 0, foodAt: 0 }, OPTS, over));
}

/* ── farmCycleMs ── */

test('farmCycleMs interpolates slow→fast with happiness and clamps', () => {
  assert.equal(F.farmCycleMs(0, OPTS.slowMs, OPTS.fastMs), 6 * HOUR);
  assert.equal(F.farmCycleMs(100, OPTS.slowMs, OPTS.fastMs), 2 * HOUR);
  assert.equal(F.farmCycleMs(50, OPTS.slowMs, OPTS.fastMs), 4 * HOUR);
  assert.equal(F.farmCycleMs(-20, OPTS.slowMs, OPTS.fastMs), 6 * HOUR);
  assert.equal(F.farmCycleMs(250, OPTS.slowMs, OPTS.fastMs), 2 * HOUR);
});

/* ── planFarmTick: feeding ── */

test('full trough: herd eats, happiness rises, stock drains', () => {
  // 1 animal × 2 units/day over 1 day = 2 units eaten, fed all day → +25 happiness
  const r = tick({ foodStock: 10, now: DAY });
  assert.equal(r.foodStock, 8);
  assert.equal(r.animals[0].happiness, 75);
  assert.equal(r.foodAt, DAY);
});

test('empty trough: happiness decays, floored at 0', () => {
  const r = tick({ foodStock: 0, now: DAY });
  assert.equal(r.animals[0].happiness, 25);
  const r2 = tick({ foodStock: 0, now: 10 * DAY });
  assert.equal(r2.animals[0].happiness, 0);
});

test('trough runs dry mid-window: gains for fed days, decays after', () => {
  // 2 units = 1 fed day, then 1 hungry day: 50 + 25 − 25 = 50
  const r = tick({ foodStock: 2, now: 2 * DAY });
  assert.equal(r.animals[0].happiness, 50);
  assert.equal(r.foodStock, 0);
});

test('happiness caps at 100 while fed', () => {
  const r = tick({ animals: [animal({ happiness: 95 })], foodStock: 100, now: DAY });
  assert.equal(r.animals[0].happiness, 100);
});

test('herd size scales food demand', () => {
  // 2 animals × 2/day × 1 day = 4 units
  const r = tick({ animals: [animal(), animal({ id: 'a2' })], foodStock: 10, now: DAY });
  assert.equal(r.foodStock, 6);
});

test('no animals: stock untouched, no spawns', () => {
  const r = tick({ animals: [], foodStock: 10, now: 5 * DAY });
  assert.equal(r.foodStock, 10);
  assert.equal(r.spawns.length, 0);
});

/* ── planFarmTick: production ── */

test('no elapsed time → no spawns', () => {
  const r = tick({ foodStock: 10, now: 0 });
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, 0);
});

test('one full cycle spawns one drop and keeps the remainder', () => {
  // happiness 100 fed → cycle 2h; 2.5h elapsed → 1 spawn, clock at 2h
  const a = animal({ happiness: 100 });
  const r = tick({ animals: [a], foodStock: 100, now: 2 * HOUR + 30 * 60 * 1000 });
  assert.equal(r.spawns.length, 1);
  assert.deepEqual(r.spawns[0], { animalId: 'a1', type: 'cow' });
  assert.equal(r.animals[0].lastDropTime, 2 * HOUR);
});

test('spawns capped by dropCap minus uncollected; clock still advances (no banking)', () => {
  const a = animal({ happiness: 100 });
  const r = tick({ animals: [a], foodStock: 1000, now: 20 * HOUR, dropCounts: { a1: 1 } });
  assert.equal(r.spawns.length, 2); // cap 3 − 1 existing
  assert.equal(r.animals[0].lastDropTime, 20 * HOUR); // 10 fast cycles consumed
});

test('animal at cap spawns nothing but its clock advances', () => {
  const a = animal({ happiness: 100 });
  const r = tick({ animals: [a], foodStock: 1000, now: 5 * HOUR, dropCounts: { a1: 3 } });
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, 4 * HOUR);
});

test('clock skew (lastDropTime in the future) resets to now without spawning', () => {
  const a = animal({ lastDropTime: 10 * HOUR });
  const r = tick({ animals: [a], foodStock: 0, now: HOUR });
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, HOUR);
});

test('hungry farm produces slower than a fed one', () => {
  const fed = tick({ animals: [animal({ id: 'f', happiness: 100 })], foodStock: 1000, now: 12 * HOUR, dropCap: 99 });
  const hungry = tick({ animals: [animal({ id: 'h', happiness: 0 })], foodStock: 0, now: 12 * HOUR, dropCap: 99 });
  assert.equal(fed.spawns.length, 6);    // 12h / 2h
  assert.equal(hungry.spawns.length, 2); // 12h / 6h
});

/* ── farmRefillUnits ── */

test('farmRefillUnits fills to max when affordable, else what coins buy', () => {
  assert.equal(F.farmRefillUnits(20, 100, 10000, 5), 80); // fill to max
  assert.equal(F.farmRefillUnits(20, 100, 100, 5), 20);   // coins limit
  assert.equal(F.farmRefillUnits(100, 100, 10000, 5), 0); // already full
  assert.equal(F.farmRefillUnits(0, 100, 3, 5), 0);       // too broke for 1 unit
});

/* ── animalLevel ── */

test('animalLevel maps collected count to a 1-based level', () => {
  const L = [0, 10, 30, 60, 100];
  assert.equal(F.animalLevel(0, L), 1);
  assert.equal(F.animalLevel(9, L), 1);
  assert.equal(F.animalLevel(10, L), 2);
  assert.equal(F.animalLevel(59, L), 3);
  assert.equal(F.animalLevel(60, L), 4);
  assert.equal(F.animalLevel(9999, L), 5);
  assert.equal(F.animalLevel(undefined, L), 1);
});

/* ── cropProgress ── */

test('cropProgress goes 0→1 over growMs and clamps', () => {
  assert.equal(F.cropProgress(0, 0, HOUR), 0);
  assert.equal(F.cropProgress(0, HOUR / 2, HOUR), 0.5);
  assert.equal(F.cropProgress(0, HOUR, HOUR), 1);
  assert.equal(F.cropProgress(0, 5 * HOUR, HOUR), 1); // clamp
  assert.equal(F.cropProgress(null, HOUR, HOUR), 0);  // unplanted
});

/* ── generateFarmOrders ── */

test('generateFarmOrders is deterministic per seed and well-formed', () => {
  const products = [{ id: 'egg', coins: 15 }, { id: 'milk', coins: 75 }, { id: 'carrot', coins: 35 }];
  const a = F.generateFarmOrders('2026-06-10', products, 3, 1.4, 20);
  const b = F.generateFarmOrders('2026-06-10', products, 3, 1.4, 20);
  assert.deepEqual(a, b);                       // same day → same orders
  assert.equal(a.length, 3);
  const c = F.generateFarmOrders('2026-06-11', products, 3, 1.4, 20);
  assert.notDeepEqual(a, c);                    // different day → different orders
  a.forEach(o => {
    assert.ok(o.items.length >= 1 && o.items.length <= 2);
    o.items.forEach(it => { assert.ok(it.qty >= 1 && it.qty <= 3); assert.ok(products.some(p => p.id === it.id)); });
    assert.ok(o.reward > 0);
  });
});

/* ── farmSellAllValue ── */

test('farmSellAllValue sums qty × unit price across the stock', () => {
  const prices = { egg: 15, milk: 75, cheese: 160 };
  assert.equal(F.farmSellAllValue({ egg: 3, milk: 2 }, prices), 3 * 15 + 2 * 75);
  assert.equal(F.farmSellAllValue({}, prices), 0);
  assert.equal(F.farmSellAllValue({ egg: 1, unknown: 5 }, prices), 15); // unknown product = 0
});

/* ── level speeds up production ── */

test('a higher-level animal out-produces a level-1 animal over the same window', () => {
  const L = [0, 10, 30, 60, 100];
  const base = { id: 'a1', type: 'cow', happiness: 100, lastDropTime: 0 };
  const lvl1 = F.planFarmTick(Object.assign({ animals: [Object.assign({}, base, { collected: 0 })], dropCounts: {}, now: 12 * HOUR, foodStock: 1000, foodAt: 0, levels: L, levelSpeedup: 0.08, dropCap: 99 }, OPTS, { dropCap: 99 }));
  const lvl5 = F.planFarmTick(Object.assign({ animals: [Object.assign({}, base, { collected: 200 })], dropCounts: {}, now: 12 * HOUR, foodStock: 1000, foodAt: 0, levels: L, levelSpeedup: 0.08, dropCap: 99 }, OPTS, { dropCap: 99 }));
  assert.ok(lvl5.spawns.length > lvl1.spawns.length, 'level 5 should produce more drops than level 1');
});

test('farmRefillUnits returns whole units even when foodStock is fractional', () => {
  // foodStock drifts to a float after production; the gap must be floored so the
  // coin charge (units * cost) never becomes fractional.
  const u = F.farmRefillUnits(73.456, 100, 10000, 5);
  assert.equal(u, 26);                            // floor(100 - 73.456) = 26
  assert.equal(Number.isInteger(u * 5), true);    // whole-coin charge
});

/* ── farmRowCount / farmRowIndices ── */

test('farmRowCount = ceil(plotCount / perRow)', () => {
  assert.equal(F.farmRowCount(0, 7), 0);
  assert.equal(F.farmRowCount(7, 7), 1);
  assert.equal(F.farmRowCount(8, 7), 2);
  assert.equal(F.farmRowCount(21, 7), 3);
  assert.equal(F.farmRowCount(undefined, 7), 0);
});

test('farmRowIndices returns the owned plot indices in a row, bounded by count', () => {
  assert.deepEqual(F.farmRowIndices(21, 0, 7), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(F.farmRowIndices(21, 2, 7), [14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(F.farmRowIndices(10, 1, 7), [7, 8, 9]); // partial row
  assert.deepEqual(F.farmRowIndices(10, 2, 7), []);        // no plots owned here
});

/* ── farmRowState ── */

const CROPS = [
  { id: 'wheat', growMs: 60 * 60 * 1000 },
  { id: 'corn', growMs: 120 * 60 * 1000 },
];

test('farmRowState: empty when no plot has a crop', () => {
  const s = F.farmRowState([{ crop: null }, {}], CROPS, 5 * HOUR);
  assert.equal(s.state, 'empty');
  assert.equal(s.cropId, null);
});

test('farmRowState: growing reports the row crop, min progress and max time left', () => {
  const now = 30 * 60 * 1000; // 30m after planting at 0
  const s = F.farmRowState([{ crop: 'wheat', plantedAt: 0 }, { crop: 'wheat', plantedAt: 0 }], CROPS, now);
  assert.equal(s.state, 'growing');
  assert.equal(s.cropId, 'wheat');
  assert.equal(s.progress, 0.5);          // 30m of a 60m crop
  assert.equal(s.msLeft, 30 * 60 * 1000); // 30m remaining
});

test('farmRowState: ripe when any planted plot is fully grown', () => {
  const s = F.farmRowState([{ crop: 'wheat', plantedAt: 0 }], CROPS, 2 * HOUR);
  assert.equal(s.state, 'ripe');
  assert.equal(s.cropId, 'wheat');
});

test('farmRowState: mixed (one ripe, one growing) counts as ripe', () => {
  const s = F.farmRowState([
    { crop: 'wheat', plantedAt: 0 },             // ripe at 2h
    { crop: 'corn', plantedAt: 90 * 60 * 1000 }, // planted late → still growing
  ], CROPS, 2 * HOUR);
  assert.equal(s.state, 'ripe');
});

/* ── farmAffordableCount ── */

test('farmAffordableCount = min(empty plots, coins / seedCost), floored, >= 0', () => {
  assert.equal(F.farmAffordableCount(45, 10, 7), 4); // floor(45/10)=4
  assert.equal(F.farmAffordableCount(1000, 10, 7), 7); // capped by empties
  assert.equal(F.farmAffordableCount(5, 10, 7), 0);   // too broke for 1
  assert.equal(F.farmAffordableCount(50, 0, 7), 7);   // free seed → all empties
});
