const test = require('node:test');
const assert = require('node:assert');
const D = require('./room-drops.js');

// Mirrors AFFECTION_MILESTONES length (12 tiers) from room-base.js.
const MS = [
  { min: 0 }, { min: 50 }, { min: 150 }, { min: 300 }, { min: 500 },
  { min: 800 }, { min: 1200 }, { min: 2000 }, { min: 3000 }, { min: 4500 },
  { min: 6500 }, { min: 9000 },
];

test('rarityOf buckets 0-2 common, 3-5 rare, 6-8 epic', () => {
  assert.deepStrictEqual([0,1,2].map(D.rarityOf), ['common','common','common']);
  assert.deepStrictEqual([3,4,5].map(D.rarityOf), ['rare','rare','rare']);
  assert.deepStrictEqual([6,7,8].map(D.rarityOf), ['epic','epic','epic']);
});

test('milestoneProgress is 0 at Stranger and 1 at top milestone', () => {
  assert.strictEqual(D.milestoneProgress(0, MS), 0);
  assert.strictEqual(D.milestoneProgress(9000, MS), 1);
  assert.ok(D.milestoneProgress(500, MS) > 0 && D.milestoneProgress(500, MS) < 1);
});

test('pieceProbabilities sums to 1 and matches spec epic odds', () => {
  const lo = D.pieceProbabilities(0);
  const hi = D.pieceProbabilities(1);
  assert.ok(Math.abs(lo.reduce((a,b)=>a+b,0) - 1) < 1e-9);
  assert.ok(Math.abs(hi.reduce((a,b)=>a+b,0) - 1) < 1e-9);
  // Epic pieces are indices 6,7,8.
  assert.ok(Math.abs(lo[6] - 0.015) < 1e-9);
  assert.ok(Math.abs(lo[7] - 0.010) < 1e-9);
  assert.ok(Math.abs(lo[8] - 0.005) < 1e-9);
  assert.ok(Math.abs(hi[6] - 0.040) < 1e-9);
  assert.ok(Math.abs(hi[7] - 0.030) < 1e-9);
  assert.ok(Math.abs(hi[8] - 0.020) < 1e-9);
});

test('rollPieceIndex respects weights with a deterministic rng', () => {
  // rng returns a tiny value -> first bucket (common idx 0).
  assert.strictEqual(D.rollPieceIndex(0, () => 0.0), 0);
  // rng just below 1 -> last bucket (epic idx 8).
  assert.strictEqual(D.rollPieceIndex(1, () => 0.999999), 8);
});

test('classifyDrop: new piece -> piece, owned -> coins, complete grid -> coins', () => {
  const empty = new Array(9).fill(false);
  assert.deepStrictEqual(D.classifyDrop(2, empty), { kind:'piece', pieceIdx:2 });
  const owned2 = empty.slice(); owned2[2] = true;
  assert.deepStrictEqual(D.classifyDrop(2, owned2), { kind:'coins', pieceIdx:2 });
  const full = new Array(9).fill(true);
  assert.deepStrictEqual(D.classifyDrop(5, full), { kind:'coins', pieceIdx:5 });
  // Undefined collection -> treated as new piece.
  assert.deepStrictEqual(D.classifyDrop(0, undefined), { kind:'piece', pieceIdx:0 });
});

test('dropCoinValue scales by rarity and affection, bigger for coins kind', () => {
  assert.strictEqual(D.dropCoinValue(0, 0, 'piece'), 8);   // common piece, m=0
  assert.strictEqual(D.dropCoinValue(6, 0, 'piece'), 60);  // epic piece, m=0
  assert.strictEqual(D.dropCoinValue(0, 1, 'piece'), 16);  // common piece, m=1 -> 8*2
  assert.strictEqual(D.dropCoinValue(0, 0, 'coins'), 15);  // common coins-only
  assert.strictEqual(D.dropCoinValue(6, 1, 'coins'), 240); // epic coins-only, m=1 -> 120*2
});

test('daysBetween counts whole days, empty start -> 1', () => {
  assert.strictEqual(D.daysBetween('', '2026-06-09'), 1);
  assert.strictEqual(D.daysBetween('2026-06-09', '2026-06-09'), 0);
  assert.strictEqual(D.daysBetween('2026-06-07', '2026-06-09'), 2);
});

test('planTopUp fills floor to 5 from pending, most-pending first', () => {
  const pets = [
    { id:'a', lastDropDay:'2026-06-08', pendingDrops:0 },
    { id:'b', lastDropDay:'2026-06-08', pendingDrops:0 },
  ];
  const r = D.planTopUp(pets, 0, '2026-06-09');
  // Each pet gains +1 pending for the new day; floor was 0 so both place.
  assert.strictEqual(r.placements.length, 2);
  assert.ok(r.pets.every(p => p.lastDropDay === '2026-06-09'));
  assert.ok(r.pets.every(p => p.pendingDrops === 0));
});

test('planTopUp never exceeds maxFloor and caps pending per pet', () => {
  const pets = [{ id:'a', lastDropDay:'2020-01-01', pendingDrops:0 }];
  const r = D.planTopUp(pets, 3, '2026-06-09'); // floor already 3, cap 5
  assert.strictEqual(r.placements.length, 2);   // only 2 slots left
  // Big gap is capped at maxPending(5); 2 placed -> 3 remain pending.
  assert.strictEqual(r.pets[0].pendingDrops, 3);
});

test('planTopUp places nothing when floor already full', () => {
  const pets = [{ id:'a', lastDropDay:'2026-06-08', pendingDrops:9 }];
  const r = D.planTopUp(pets, 5, '2026-06-09');
  assert.strictEqual(r.placements.length, 0);
});

test('planTopUp drains the most-pending pet first and leaves inputs unmutated', () => {
  const pets = [
    { id:'a', lastDropDay:'2026-06-09', pendingDrops:3 }, // already today -> no accrual
    { id:'b', lastDropDay:'2026-06-09', pendingDrops:1 },
  ];
  const r = D.planTopUp(pets, 0, '2026-06-09');
  // 4 pending total, floor cap 5 -> all 4 placed. 'a' stays strictly most-pending
  // until exhausted, so it drains fully before 'b' gets a slot.
  assert.deepStrictEqual(r.placements.map(p => p.petId), ['a', 'a', 'a', 'b']);
  // Inputs must not be mutated (planTopUp returns fresh copies).
  assert.strictEqual(pets[0].pendingDrops, 3);
  assert.strictEqual(pets[1].pendingDrops, 1);
});

test('pieceProbabilities interpolates at mid-range m=0.5', () => {
  const mid = D.pieceProbabilities(0.5);
  assert.ok(Math.abs(mid.reduce((a,b)=>a+b,0) - 1) < 1e-9);
  // Epics are the linear midpoint of EPIC_LOW and EPIC_HIGH.
  assert.ok(Math.abs(mid[6] - (0.015 + 0.040) / 2) < 1e-9);
  assert.ok(Math.abs(mid[7] - (0.010 + 0.030) / 2) < 1e-9);
  assert.ok(Math.abs(mid[8] - (0.005 + 0.020) / 2) < 1e-9);
});

test('milestoneProgress returns 0 for degenerate milestone tables', () => {
  assert.strictEqual(D.milestoneProgress(500, [{ min: 0 }]), 0); // n<=1 guard
  assert.strictEqual(D.milestoneProgress(500, []), 0);
});
