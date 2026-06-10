/* node --test room-farm.test.js — unit tests for the pure farm logic. */
const test = require('node:test');
const assert = require('node:assert');
const F = require('./room-farm.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const OPTS = { slowMs: 6 * HOUR, fastMs: 2 * HOUR, dropCap: 3, decayPerDay: 10 };

function animal(over) {
  return Object.assign({ id: 'a1', type: 'cow', happiness: 100, happyAt: 0, lastPet: 0, lastDropTime: 0 }, over);
}

/* ── farmCycleMs ── */

test('farmCycleMs interpolates slow→fast with happiness and clamps', () => {
  assert.equal(F.farmCycleMs(0, OPTS.slowMs, OPTS.fastMs), 6 * HOUR);
  assert.equal(F.farmCycleMs(100, OPTS.slowMs, OPTS.fastMs), 2 * HOUR);
  assert.equal(F.farmCycleMs(50, OPTS.slowMs, OPTS.fastMs), 4 * HOUR);
  assert.equal(F.farmCycleMs(-20, OPTS.slowMs, OPTS.fastMs), 6 * HOUR);
  assert.equal(F.farmCycleMs(250, OPTS.slowMs, OPTS.fastMs), 2 * HOUR);
});

/* ── decayedHappiness ── */

test('decayedHappiness loses decayPerDay per elapsed day, floored at 0', () => {
  assert.equal(F.decayedHappiness(80, 0, 0, 10), 80);
  assert.equal(F.decayedHappiness(80, 0, 2 * DAY, 10), 60);
  assert.equal(F.decayedHappiness(80, 0, 12 * HOUR, 10), 75); // fractional days
  assert.equal(F.decayedHappiness(15, 0, 30 * DAY, 10), 0);
});

test('decayedHappiness handles missing anchor and clock skew', () => {
  assert.equal(F.decayedHappiness(80, null, 5 * DAY, 10), 80); // no anchor → unchanged
  assert.equal(F.decayedHappiness(80, 10 * DAY, 5 * DAY, 10), 80); // future anchor → no decay
});

/* ── applyPet ── */

test('applyPet boosts happiness (capped 100) and stamps lastPet/happyAt', () => {
  const a = animal({ happiness: 50, lastPet: 0, happyAt: 0 });
  const now = 2 * HOUR;
  const r = F.applyPet(a, now, { boost: 15, cooldownMs: HOUR, decayPerDay: 10 });
  assert.ok(r);
  assert.equal(r.lastPet, now);
  assert.equal(r.happyAt, now);
  assert.ok(Math.abs(r.happiness - (50 - 10 * (2 / 24) + 15)) < 1e-9); // decay then boost
  const full = F.applyPet(animal({ happiness: 95, lastPet: 0 }), 2 * HOUR, { boost: 15, cooldownMs: HOUR, decayPerDay: 0 });
  assert.equal(full.happiness, 100);
});

test('applyPet returns null while on cooldown', () => {
  const a = animal({ lastPet: HOUR });
  assert.equal(F.applyPet(a, HOUR + 1000, { boost: 15, cooldownMs: HOUR, decayPerDay: 10 }), null);
});

/* ── planFarmProduction ── */

test('no elapsed time → no spawns, animals unchanged', () => {
  const r = F.planFarmProduction(Object.assign({ animals: [animal()], dropCounts: {}, now: 0 }, OPTS));
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, 0);
});

test('one full cycle spawns one drop and keeps the remainder', () => {
  const a = animal({ happiness: 100, lastDropTime: 0, happyAt: null }); // fast cycle = 2h
  const now = 2 * HOUR + 30 * 60 * 1000; // 1 cycle + 30min
  const r = F.planFarmProduction(Object.assign({ animals: [a], dropCounts: {}, now: now }, OPTS));
  assert.equal(r.spawns.length, 1);
  assert.deepEqual(r.spawns[0], { animalId: 'a1', type: 'cow' });
  assert.equal(r.animals[0].lastDropTime, 2 * HOUR); // remainder kept
});

test('spawns are capped by dropCap minus existing uncollected drops', () => {
  const a = animal({ happiness: 100, happyAt: null });
  const now = 20 * HOUR; // 10 fast cycles
  const r = F.planFarmProduction(Object.assign({ animals: [a], dropCounts: { a1: 1 }, now: now }, OPTS));
  assert.equal(r.spawns.length, 2); // cap 3 − 1 existing
  assert.equal(r.animals[0].lastDropTime, now); // clock advances; excess cycles are lost (no banking)
});

test('animal already at cap spawns nothing but its clock still advances', () => {
  const a = animal({ happiness: 100, happyAt: null });
  const now = 5 * HOUR;
  const r = F.planFarmProduction(Object.assign({ animals: [a], dropCounts: { a1: 3 }, now: now }, OPTS));
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, 4 * HOUR); // 2 cycles consumed, remainder 1h
});

test('clock skew (lastDropTime in the future) resets to now without spawning', () => {
  const a = animal({ lastDropTime: 10 * HOUR });
  const r = F.planFarmProduction(Object.assign({ animals: [a], dropCounts: {}, now: HOUR }, OPTS));
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, HOUR);
});

test('happier animals out-produce sad ones over the same window', () => {
  const happy = animal({ id: 'h', happiness: 100, happyAt: null });
  const sad = animal({ id: 's', happiness: 0, happyAt: null });
  const now = 12 * HOUR;
  const r = F.planFarmProduction(Object.assign({ animals: [happy, sad], dropCounts: {}, now: now, dropCap: 99 }, OPTS, { dropCap: 99 }));
  const hSpawns = r.spawns.filter(s => s.animalId === 'h').length;
  const sSpawns = r.spawns.filter(s => s.animalId === 's').length;
  assert.equal(hSpawns, 6); // 12h / 2h
  assert.equal(sSpawns, 2); // 12h / 6h
});

test('production uses decayed happiness (stale happyAt slows the cycle)', () => {
  // happiness 100 anchored 10 days ago, decay 10/day → effective 0 → slow cycle (6h)
  const a = animal({ happiness: 100, happyAt: 0, lastDropTime: 10 * DAY });
  const now = 10 * DAY + 6 * HOUR;
  const r = F.planFarmProduction(Object.assign({ animals: [a], dropCounts: {}, now: now }, OPTS));
  assert.equal(r.spawns.length, 1); // exactly one slow cycle, not three fast ones
});
