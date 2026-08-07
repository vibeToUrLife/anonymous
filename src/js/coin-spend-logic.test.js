// coin-spend-logic.test.js — unit tests for the pure boost / pin logic.
const test = require('node:test');
const assert = require('node:assert');
const C = require('./coin-spend-logic.js');

const H = 3600000;                 // one hour in ms
const NOW = 1780000000000;         // a fixed "now" — these functions take it as an argument

test('a fresh pin runs from now for the hours bought', () => {
  const r = C.extendBoost({}, 6, NOW);
  assert.strictEqual(r.boostFrom, NOW);
  assert.strictEqual(r.boostUntil, NOW + 6 * H);
});

test('pinning again ADDS to the end instead of replacing it', () => {
  // The bug this guards: buying 1h on a bubble with 20h left used to overwrite
  // boostUntil down to now+1h, so you paid coins to lose 19 hours.
  const cur = { boostUntil: NOW + 20 * H, boostFrom: NOW - 4 * H };
  const r = C.extendBoost(cur, 1, NOW);
  assert.strictEqual(r.boostUntil, NOW + 21 * H, 'the hour lands on the end');
  assert.strictEqual(r.boostFrom, NOW - 4 * H, 'the run keeps its original start');
});

test('an expired pin starts a new run rather than extending a dead one', () => {
  const cur = { boostUntil: NOW - 1, boostFrom: NOW - 10 * H };
  const r = C.extendBoost(cur, 6, NOW);
  assert.strictEqual(r.boostUntil, NOW + 6 * H);
  assert.strictEqual(r.boostFrom, NOW, 'not the stale start from the dead run');
});

test('extending repeatedly accumulates every hour paid for', () => {
  let cur = {};
  for (const h of [1, 6, 24, 1]) cur = C.extendBoost(cur, h, NOW);
  assert.strictEqual(cur.boostUntil, NOW + 32 * H);
  assert.strictEqual(cur.boostFrom, NOW);
});

test('boostPct drains from full to empty across the run', () => {
  const cur = C.extendBoost({}, 10, NOW);                       // 10h run
  assert.strictEqual(C.boostPct(cur, NOW), 100);
  assert.strictEqual(C.boostPct(cur, NOW + 5 * H), 50);
  assert.ok(C.boostPct(cur, NOW + 9 * H) - 10 < 1e-9);
});

test('boostPct is 0 once the pin is over, and never negative', () => {
  const cur = C.extendBoost({}, 2, NOW);
  assert.strictEqual(C.boostPct(cur, NOW + 2 * H), 0);
  assert.strictEqual(C.boostPct(cur, NOW + 99 * H), 0);
});

test('topping up refills the bar instead of leaving it near empty', () => {
  // 1h pin, 54 minutes gone — nearly empty...
  let cur = C.extendBoost({}, 1, NOW);
  const late = NOW + 54 * 60000;
  assert.ok(C.boostPct(cur, late) < 12);
  // ...buy 6 more, and the bar jumps back up because the span grew with it.
  cur = C.extendBoost(cur, 6, late);
  assert.ok(C.boostPct(cur, late) > 85, 'a top-up visibly refills the bar');
  assert.strictEqual(cur.boostFrom, NOW, 'still measured from the original start');
});

test('a pin written before boostFrom existed reads full rather than guessing', () => {
  // Legacy docs carry boostUntil only; there is no span to measure against.
  assert.strictEqual(C.boostPct({ boostUntil: NOW + 3 * H }, NOW), 100);
});

test('boostPct treats a missing or unpinned bubble as empty', () => {
  assert.strictEqual(C.boostPct(null, NOW), 0);
  assert.strictEqual(C.boostPct({}, NOW), 0);
});

test('BOOST_OPTIONS stay ordered and priced per hour without gaps', () => {
  const opts = C.BOOST_OPTIONS;
  assert.ok(opts.length >= 2);
  for (let i = 1; i < opts.length; i++) {
    assert.ok(opts[i].hours > opts[i - 1].hours, 'longer options come later');
    assert.ok(opts[i].price > opts[i - 1].price, 'and cost more');
  }
  opts.forEach(o => assert.ok(o.hours > 0 && o.price > 0 && o.label));
});
