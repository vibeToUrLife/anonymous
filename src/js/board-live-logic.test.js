// board-live-logic.test.js — unit tests for the pure board-live logic
// (knock / ripple events added alongside the original reaction helpers).
const test = require('node:test');
const assert = require('node:assert');
const L = require('./board-live-logic.js');

test('makeKnockEvent carries the bubble id and a unique event id', () => {
  const e = L.makeKnockEvent('u1', 7, 42, 'abc123');
  assert.strictEqual(e.k, 'abc123');
  assert.strictEqual(e.id, 'u1:7:42');
  assert.notStrictEqual(L.makeKnockEvent('u1', 8, 42, 'abc123').id, e.id);
  assert.strictEqual(L.makeKnockEvent(null, 0, 0, 99).k, '99'); // coerced to string
});

test('makeRippleEvent clamps and rounds viewport percentages', () => {
  assert.deepStrictEqual(L.makeRippleEvent('u', 0, 0, 50.6, 12.2).rp, [51, 12]);
  assert.deepStrictEqual(L.makeRippleEvent('u', 0, 0, -30, 250).rp, [0, 100]);
  assert.deepStrictEqual(L.makeRippleEvent('u', 0, 0, NaN, undefined).rp, [0, 0]);
});

test('classifyLiveEvent dispatches every event shape', () => {
  assert.strictEqual(L.classifyLiveEvent({ id: 'x', sx: 'hearts' }), 'super');
  assert.strictEqual(L.classifyLiveEvent({ id: 'x', k: 'bubble1' }), 'knock');
  assert.strictEqual(L.classifyLiveEvent({ id: 'x', rp: [10, 20] }), 'ripple');
  assert.strictEqual(L.classifyLiveEvent({ id: 'x', i: 3 }), 'float');
  assert.strictEqual(L.classifyLiveEvent({ id: 'x' }), 'unknown');
  assert.strictEqual(L.classifyLiveEvent(null), 'unknown');
});

test('existing reaction helpers still behave (regression)', () => {
  const e = L.makeReactionEvent('u', 1, 2, 99);
  assert.ok(e.i >= 0 && e.i < L.REACTIONS.length);       // wraps safely
  assert.deepStrictEqual(L.trimEvents([1, 2, 3], 2), [2, 3]);
  const seen = new Set(['a']);
  assert.deepStrictEqual(L.unseenEvents([{ id: 'a' }, { id: 'b' }], seen).map(x => x.id), ['b']);
  assert.deepStrictEqual(L.grantPopCoins(null, 'd', 5), { granted: 5, state: { day: 'd', count: 5 } });
});
