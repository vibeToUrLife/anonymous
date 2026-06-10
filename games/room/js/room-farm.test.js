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
