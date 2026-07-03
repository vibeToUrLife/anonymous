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

const HF = { actionId: 'highfive', windowMs: 4000, radius: 0.12 };
const hfActor = (over) => Object.assign({ x: 0.5, y: 0.7, action: 'highfive', actionTs: 1000 }, over);

test('highfiveMatch: both offering, close, within window → match', () => {
  assert.equal(L.highfiveMatch(hfActor(), hfActor({ x: 0.55, actionTs: 2500 }), HF), true);
});

test('highfiveMatch: no match unless BOTH are in the highfive action', () => {
  assert.equal(L.highfiveMatch(hfActor(), hfActor({ action: 'dance' }), HF), false);
  assert.equal(L.highfiveMatch(hfActor({ action: '' }), hfActor(), HF), false);
});

test('highfiveMatch: too far apart → no match', () => {
  assert.equal(L.highfiveMatch(hfActor(), hfActor({ x: 0.5 + 0.13 }), HF), false);
  // exactly at the radius still counts (inclusive, generous for 5 Hz sync)
  assert.equal(L.highfiveMatch(hfActor(), hfActor({ x: 0.5 + 0.12 }), HF), true);
});

test('highfiveMatch: offers too far apart in time → no match', () => {
  assert.equal(L.highfiveMatch(hfActor(), hfActor({ actionTs: 1000 + 4001 }), HF), false);
  assert.equal(L.highfiveMatch(hfActor({ actionTs: 9000 }), hfActor({ actionTs: 5500 }), HF), true);
});

test('highfiveMatch: tolerates missing actors and missing actionTs', () => {
  assert.equal(L.highfiveMatch(null, hfActor(), HF), false);
  assert.equal(L.highfiveMatch(hfActor(), null, HF), false);
  assert.equal(L.highfiveMatch(hfActor({ actionTs: undefined }), hfActor({ actionTs: 3000 }), HF), true);
});

test('highfiveKey is order-independent so every client builds the same key', () => {
  assert.equal(L.highfiveKey('alice', 1000, 'bob', 2000), L.highfiveKey('bob', 2000, 'alice', 1000));
  // a later re-highfive between the same pair is a NEW key (new celebration)
  assert.notEqual(L.highfiveKey('alice', 1000, 'bob', 2000), L.highfiveKey('alice', 8000, 'bob', 9000));
});

// ── Daily Sparkle Hunt ──
const SB = { minX: 0.1, minY: 0.5, maxX: 0.9, maxY: 0.95 };

test('worldRnd is deterministic and in [0,1)', () => {
  assert.equal(L.worldRnd(5), L.worldRnd(5));
  const v = L.worldRnd(42);
  assert.ok(v >= 0 && v < 1, 'in range');
});

test('worldStrHash is deterministic and separates distinct strings', () => {
  assert.equal(L.worldStrHash('pool|0'), L.worldStrHash('pool|0'));
  assert.notEqual(L.worldStrHash('pool|0'), L.worldStrHash('pool|1'));
});

test('worldDayKey formats the tz-shifted UTC date', () => {
  assert.equal(L.worldDayKey(0, 0), '1970-01-01');
  assert.equal(L.worldDayKey(0, 480), '1970-01-01'); // epoch +8h stays same day
  const t = Date.UTC(2026, 6, 3, 20, 0, 0);          // 2026-07-03 20:00 UTC
  assert.equal(L.worldDayKey(t, 0), '2026-07-03');
  assert.equal(L.worldDayKey(t, 480), '2026-07-04'); // +8h crosses into next local day
});

test('sparkleSpots is deterministic and inside the inset bounds', () => {
  const a = L.sparkleSpots('2026-07-04', 'pool', SB, 3, 0.06);
  assert.deepEqual(a, L.sparkleSpots('2026-07-04', 'pool', SB, 3, 0.06));
  assert.equal(a.length, 3);
  for (const s of a) {
    assert.ok(s.x >= SB.minX + 0.06 - 1e-9 && s.x <= SB.maxX - 0.06 + 1e-9, 'x inside');
    assert.ok(s.y >= SB.minY + 0.06 - 1e-9 && s.y <= SB.maxY - 0.06 + 1e-9, 'y inside');
  }
});

test('sparkleSpots differs by day and by scene', () => {
  const p = JSON.stringify(L.sparkleSpots('2026-07-04', 'pool', SB, 3, 0.06));
  assert.notEqual(p, JSON.stringify(L.sparkleSpots('2026-07-05', 'pool', SB, 3, 0.06)));
  assert.notEqual(p, JSON.stringify(L.sparkleSpots('2026-07-04', 'egypt', SB, 3, 0.06)));
});

test('sparkleGlow ramps from 0 at the reveal edge to 1 at the spot', () => {
  assert.equal(L.sparkleGlow(0.3, 0.22), 0);    // beyond radius → hidden
  assert.equal(L.sparkleGlow(0.22, 0.22), 0);   // exactly at edge → hidden
  assert.equal(L.sparkleGlow(0, 0.22), 1);      // on the spot → full glow
  assert.ok(L.sparkleGlow(0.05, 0.22) > L.sparkleGlow(0.15, 0.22)); // closer → brighter
});
