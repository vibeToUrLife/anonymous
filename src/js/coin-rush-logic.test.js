// coin-rush-logic.test.js — unit tests for the pure Coin Rush logic.
const test = require('node:test');
const assert = require('node:assert');
const C = require('./coin-rush-logic.js');

// Known days relative to 2026-06-19 (a Friday):
const FRI = '2026-06-19';
const SAT = '2026-06-20';
const SUN = '2026-06-21';
const MON = '2026-06-22';

test('coinRushSeed is deterministic and varies by day', () => {
  assert.strictEqual(C.coinRushSeed(FRI), C.coinRushSeed(FRI));
  assert.notStrictEqual(C.coinRushSeed(FRI), C.coinRushSeed(MON));
  assert.ok(C.coinRushSeed(FRI) >= 0 && Number.isInteger(C.coinRushSeed(FRI)));
});

test('makeRng is deterministic per seed', () => {
  const a = C.makeRng(123), b = C.makeRng(123), c = C.makeRng(999);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
  assert.deepStrictEqual(seqA, seqB);            // same seed → identical stream (same coins)
  assert.notDeepStrictEqual(seqA, seqC);         // different seed → different
  assert.ok(seqA.every(x => x >= 0 && x < 1));   // floats in [0,1)
});

test('dayKeyOf formats local YYYY-MM-DD', () => {
  const ms = new Date(2026, 5, 19, 10, 30, 0, 0).getTime(); // local Jun 19 2026
  assert.strictEqual(C.dayKeyOf(ms), '2026-06-19');
});

test('schedule is null on weekends when WEEKDAYS_ONLY', () => {
  assert.strictEqual(C.coinRushSchedule(SAT), null);
  assert.strictEqual(C.coinRushSchedule(SUN), null);
});

test('schedule on a weekday fits inside its window and is minute-aligned', () => {
  for (const day of [FRI, MON]) {
    const s = C.coinRushSchedule(day);
    assert.ok(s, 'expected a schedule on ' + day);
    assert.ok(s.windowIdx === 0 || s.windowIdx === 1);

    const [y, mo, d] = day.split('-').map(Number);
    const win = C.WINDOWS[s.windowIdx];
    const atLocal = (h, m) => new Date(y, mo - 1, d, h, m, 0, 0).getTime();
    const windowStart = atLocal(win[0], win[1]);
    const windowEnd = atLocal(win[2], win[3]);
    const earliestStart = windowStart + C.PRE_ALERT_MS;
    const latestStart = windowEnd - C.DURATION_MS - C.END_BUFFER_MS;

    assert.ok(s.startMs >= earliestStart, 'start after earliest');
    assert.ok(s.startMs <= latestStart, 'start before latest');
    assert.ok(s.endMs <= windowEnd - C.END_BUFFER_MS, 'ends before window close');
    assert.strictEqual(s.endMs - s.startMs, C.DURATION_MS);
    assert.strictEqual((s.startMs - earliestStart) % 60000, 0, 'minute aligned');
    assert.strictEqual(s.revealMs, atLocal(C.REVEAL_HOUR, 0));
  }
});

test('schedule is deterministic (same in = same out)', () => {
  assert.deepStrictEqual(C.coinRushSchedule(FRI), C.coinRushSchedule(FRI));
});

test('phase walks idle → scheduled → imminent → live → results', () => {
  const sched = { startMs: 1_000_000, endMs: 1_060_000, revealMs: 600_000 };
  const p = (now) => C.coinRushPhase(now, sched).phase;
  assert.strictEqual(p(500_000), 'idle');                       // before reveal
  assert.strictEqual(p(600_000), 'scheduled');                  // at reveal
  assert.strictEqual(p(1_000_000 - C.PRE_ALERT_MS - 1), 'scheduled');
  assert.strictEqual(p(1_000_000 - C.PRE_ALERT_MS), 'imminent'); // pre-alert lead
  assert.strictEqual(p(999_999), 'imminent');
  assert.strictEqual(p(1_000_000), 'live');                     // start
  assert.strictEqual(p(1_059_999), 'live');
  assert.strictEqual(p(1_060_000), 'results');                  // end
  assert.strictEqual(C.coinRushPhase(123, null).phase, 'none'); // no rush today
});

test('grantRushCoins pays COINS_EACH per pop with no cap', () => {
  assert.deepStrictEqual(C.grantRushCoins(0, 1), { granted: 1, earned: 1 });
  assert.deepStrictEqual(C.grantRushCoins(100, 5), { granted: 5, earned: 105 });
  assert.deepStrictEqual(C.grantRushCoins(0, 0), { granted: 0, earned: 0 });
});

test('rankScores sorts by score desc, ties by earliest updatedAt', () => {
  const ranked = C.rankScores([
    { uid: 'a', name: 'A', score: 10, updatedAt: 200 },
    { uid: 'b', name: 'B', score: 30, updatedAt: 500 },
    { uid: 'c', name: 'C', score: 10, updatedAt: 100 }, // same score as A, earlier
  ]);
  assert.deepStrictEqual(ranked.map(r => r.uid), ['b', 'c', 'a']);
  assert.deepStrictEqual(ranked.map(r => r.rank), [1, 2, 3]);
  assert.deepStrictEqual(C.rankScores('nonsense'), []);
});

test('computeBonus pays 1000/500/300 to the top 3 only', () => {
  assert.deepStrictEqual([1, 2, 3].map(r => C.computeBonus(r)), [1000, 500, 300]);
  assert.strictEqual(C.computeBonus(4), 0);
  assert.strictEqual(C.computeBonus(0), 0);
});

test('generatePool is deterministic, bounded, and id-stable', () => {
  const a = C.generatePool(42, 50), b = C.generatePool(42, 50), c = C.generatePool(7, 50);
  assert.strictEqual(a.length, 50);
  assert.deepStrictEqual(a, b);                      // same seed → identical pot
  assert.notDeepStrictEqual(a, c);
  assert.ok(a.every(p => p.nx >= 0 && p.nx < 1 && p.ny >= 0 && p.ny < 1));
  assert.deepStrictEqual(a.map(p => p.id).slice(0, 4), [0, 1, 2, 3]);
});

test('tallyClaims counts claims per player and ranks', () => {
  const claims = { 0: 'a', 1: 'b', 2: 'a', 3: 'a', 4: 'b' };
  const players = { a: 'Alice', b: 'Bob' };
  const ranked = C.tallyClaims(claims, players);
  assert.deepStrictEqual(
    ranked.map(r => [r.name, r.score, r.rank]),
    [['Alice', 3, 1], ['Bob', 2, 2]]
  );
  assert.deepStrictEqual(C.tallyClaims({}, {}), []);
});

test('findRank locates a player or returns null', () => {
  const ranked = C.rankScores([
    { uid: 'a', name: 'A', score: 10, updatedAt: 1 },
    { uid: 'b', name: 'B', score: 5, updatedAt: 1 },
  ]);
  assert.strictEqual(C.findRank(ranked, 'b').rank, 2);
  assert.strictEqual(C.findRank(ranked, 'zzz'), null);
});
