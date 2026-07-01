/* node --test world-logic.test.js — unit tests for the pure World logic. */
const test = require('node:test');
const assert = require('node:assert');
const L = require('./world-logic.js');

const BOUNDS = { minX: 0.1, minY: 0.5, maxX: 0.9, maxY: 0.95 };

test('wClamp clamps to range', () => {
  assert.equal(L.wClamp(5, 0, 1), 1);
  assert.equal(L.wClamp(-5, 0, 1), 0);
  assert.equal(L.wClamp(0.5, 0, 1), 0.5);
});

test('clampToBounds keeps a point inside the walkable rect', () => {
  assert.deepEqual(L.clampToBounds(0.5, 0.7, BOUNDS), { x: 0.5, y: 0.7 });
  assert.deepEqual(L.clampToBounds(0.0, 0.2, BOUNDS), { x: 0.1, y: 0.5 });
  assert.deepEqual(L.clampToBounds(2.0, 2.0, BOUNDS), { x: 0.9, y: 0.95 });
});

test('normalizeVector caps magnitude at 1 and preserves direction', () => {
  assert.deepEqual(L.normalizeVector(0, 0), { x: 0, y: 0 });
  const d = L.normalizeVector(1, 1);
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-9, 'diagonal magnitude is 1');
  // A sub-unit vector is passed through unchanged (analog joystick).
  assert.deepEqual(L.normalizeVector(0.3, 0), { x: 0.3, y: 0 });
});

test('stepPosition moves then clamps and reports movement', () => {
  const r = L.stepPosition(0.5, 0.7, { x: 1, y: 0 }, 0.2, 0.5, BOUNDS);
  assert.ok(Math.abs(r.x - 0.6) < 1e-9);
  assert.equal(r.moved, true);
  // Pushing into a wall does not move (already clamped).
  const w = L.stepPosition(0.9, 0.7, { x: 1, y: 0 }, 0.2, 0.5, BOUNDS);
  assert.equal(w.x, 0.9);
  assert.equal(w.moved, false);
});

test('shouldWritePosition: first send always writes', () => {
  assert.equal(L.shouldWritePosition(null, { x: 0.5, y: 0.5, facing: 1, action: null, ts: 0 }, { minIntervalMs: 200, epsilon: 0.005 }), true);
});

test('shouldWritePosition: rate cap blocks too-soon writes', () => {
  const last = { x: 0.5, y: 0.5, facing: 1, action: null, ts: 1000 };
  const cur = { x: 0.9, y: 0.5, facing: 1, action: null, ts: 1000 };
  assert.equal(L.shouldWritePosition(last, cur, { minIntervalMs: 200, epsilon: 0.005, nowMs: 1100 }), false);
});

test('shouldWritePosition: writes on meaningful move after interval', () => {
  const last = { x: 0.5, y: 0.5, facing: 1, action: null, ts: 1000 };
  const cur = { x: 0.52, y: 0.5, facing: 1, action: null, ts: 1300 };
  assert.equal(L.shouldWritePosition(last, cur, { minIntervalMs: 200, epsilon: 0.005, nowMs: 1300 }), true);
});

test('shouldWritePosition: tiny idle jitter after interval does NOT write', () => {
  const last = { x: 0.5, y: 0.5, facing: 1, action: null, ts: 1000 };
  const cur = { x: 0.5005, y: 0.5, facing: 1, action: null, ts: 1300 };
  assert.equal(L.shouldWritePosition(last, cur, { minIntervalMs: 200, epsilon: 0.005, nowMs: 1300 }), false);
});

test('shouldWritePosition: facing or action change forces a write', () => {
  const last = { x: 0.5, y: 0.5, facing: 1, action: null, ts: 1000 };
  const flip = { x: 0.5, y: 0.5, facing: -1, action: null, ts: 1300 };
  assert.equal(L.shouldWritePosition(last, flip, { minIntervalMs: 200, epsilon: 0.005, nowMs: 1300 }), true);
  const act = { x: 0.5, y: 0.5, facing: 1, action: 'wave', ts: 1300 };
  assert.equal(L.shouldWritePosition(last, act, { minIntervalMs: 200, epsilon: 0.005, nowMs: 1300 }), true);
});

test('lerpToward moves a fraction toward target', () => {
  const r = L.lerpToward({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.25);
  assert.deepEqual(r, { x: 0.25, y: 0.25 });
});

test('depthScale grows toward the bottom of the screen', () => {
  assert.ok(L.depthScale(0.9) > L.depthScale(0.5));
  assert.ok(L.depthScale(0.0) >= 0.4, 'never smaller than the floor');
});

test('assignShard fills shard 0 first, then spills', () => {
  assert.equal(L.assignShard([], 20), 0);
  assert.equal(L.assignShard([5], 20), 0);
  assert.equal(L.assignShard([20], 20), 1);
  assert.equal(L.assignShard([20, 20], 20), 2);
  assert.equal(L.assignShard([20, 3], 20), 1);
});

test('isFresh respects the TTL window', () => {
  assert.equal(L.isFresh(1000, 1000 + 5000, 30000), true);
  assert.equal(L.isFresh(1000, 1000 + 40000, 30000), false);
});
