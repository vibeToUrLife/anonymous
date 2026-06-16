/* node --test room-aquarium.test.js — unit tests for the pure aquarium logic. */
const test = require('node:test');
const assert = require('node:assert');
const A = require('./room-aquarium.js');

// Minimal stand-in for FISH_TYPES (only the fields the logic reads).
const TYPES = [
  { name: 'Sardine',  rarity: 'common' },
  { name: 'Anchovy',  rarity: 'common' },
  { name: 'Salmon',   rarity: 'rare' },
  { name: 'Tuna',     rarity: 'rare' },
  { name: 'Swordfish',rarity: 'epic' },
  { name: 'Whale',    rarity: 'legendary' },
  { name: 'Old Boot', rarity: 'junk' },
  { name: 'Seaweed',  rarity: 'junk' },
];

test('catchableSpecies excludes junk', () => {
  assert.equal(A.catchableSpecies(TYPES).length, 6);
});

test('aquariumCompletion counts placed catchable species and percentage', () => {
  const c = A.aquariumCompletion(['Sardine', 'Salmon', 'Whale'], TYPES);
  assert.equal(c.total, 6);
  assert.equal(c.placed, 3);
  assert.equal(c.pct, 50); // 3/6
});

test('aquariumCompletion breaks down by rarity tier', () => {
  const c = A.aquariumCompletion(['Sardine', 'Salmon'], TYPES);
  assert.deepEqual(c.byRarity.common, { placed: 1, total: 2 });
  assert.deepEqual(c.byRarity.rare,   { placed: 1, total: 2 });
  assert.deepEqual(c.byRarity.epic,   { placed: 0, total: 1 });
  assert.deepEqual(c.byRarity.legendary, { placed: 0, total: 1 });
});

test('aquariumCompletion ignores junk in core totals and tracks trash separately', () => {
  const c = A.aquariumCompletion(['Sardine', 'Old Boot'], TYPES);
  assert.equal(c.total, 6);
  assert.equal(c.placed, 1);
  assert.deepEqual(c.trash, { placed: 1, total: 2 });
});

test('aquariumCompletion handles an empty tank', () => {
  const c = A.aquariumCompletion([], TYPES);
  assert.equal(c.placed, 0);
  assert.equal(c.pct, 0);
});

test('aquariumCompletion ignores unknown names (stale/renamed species)', () => {
  const c = A.aquariumCompletion(['Sardine', 'Ghostfish'], TYPES);
  assert.equal(c.placed, 1);
});

const RATES = { common: 1, rare: 3, epic: 6, legendary: 12 };
const HOUR = 3600000;

test('aquariumCoinsPerHour sums rarity rates of placed fish (junk = 0)', () => {
  assert.equal(A.aquariumCoinsPerHour(['Sardine', 'Salmon', 'Whale'], TYPES, RATES), 1 + 3 + 12);
  assert.equal(A.aquariumCoinsPerHour(['Old Boot'], TYPES, RATES), 0);
  assert.equal(A.aquariumCoinsPerHour([], TYPES, RATES), 0);
});

test('aquariumIdleCoins multiplies rate by hours and floors', () => {
  assert.equal(A.aquariumIdleCoins(['Whale'], TYPES, 2 * HOUR, 99 * HOUR, RATES), 24);   // 12/hr * 2h
  assert.equal(A.aquariumIdleCoins(['Whale'], TYPES, 1.5 * HOUR, 99 * HOUR, RATES), 18); // 12/hr * 1.5h
});

test('aquariumIdleCoins caps the elapsed window', () => {
  assert.equal(A.aquariumIdleCoins(['Whale'], TYPES, 10 * HOUR, 3 * HOUR, RATES), 36);   // capped at 3h
});

test('aquariumIdleCoins is 0 for an empty or all-junk tank', () => {
  assert.equal(A.aquariumIdleCoins([], TYPES, 5 * HOUR, 3 * HOUR, RATES), 0);
  assert.equal(A.aquariumIdleCoins(['Old Boot', 'Seaweed'], TYPES, 5 * HOUR, 3 * HOUR, RATES), 0);
});

test('frenzyPayout rewards bites and combo', () => {
  assert.equal(A.frenzyPayout(0, 0), 0);
  assert.equal(A.frenzyPayout(10, 4), 10 * 3 + 4 * 5); // 50
});

test('bubbleJackpotChance scales with legendaries and caps at 0.10', () => {
  assert.equal(A.bubbleJackpotChance(0), 0.02);
  assert.equal(A.bubbleJackpotChance(2), 0.06);
  assert.equal(A.bubbleJackpotChance(10), 0.10);
});

test('raceOdds: faster fish get lower odds, all within [1.5, 4]', () => {
  const types = [{ name: 'A', speed: 1.5 }, { name: 'B', speed: 0.5 }];
  const o = A.raceOdds(types, ['A', 'B']);
  const m = {}; o.forEach(x => m[x.name] = x.odds);
  assert.ok(m.A < m.B, 'faster A should have lower odds than slower B');
  o.forEach(x => assert.ok(x.odds >= 1.5 && x.odds <= 4));
});
