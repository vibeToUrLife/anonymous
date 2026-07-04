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

// ── Shared kickable ball ──
test('reflectRange leaves in-range values untouched', () => {
  assert.equal(L.reflectRange(0.5, 0.1, 0.9), 0.5);
  assert.equal(L.reflectRange(0.1, 0.1, 0.9), 0.1); // on the edges
  assert.equal(L.reflectRange(0.9, 0.1, 0.9), 0.9);
});

test('reflectRange mirrors a single overshoot back into range', () => {
  // 0.05 past the far wall (0.9) reflects to 0.05 short of it.
  assert.ok(Math.abs(L.reflectRange(0.95, 0.1, 0.9) - 0.85) < 1e-9);
  // 0.05 past the near wall (0.1) reflects inward.
  assert.ok(Math.abs(L.reflectRange(0.05, 0.1, 0.9) - 0.15) < 1e-9);
});

test('reflectRange folds many reflections and stays inside', () => {
  for (let p = -3; p <= 3; p += 0.137) {
    const r = L.reflectRange(p, 0.1, 0.9);
    assert.ok(r >= 0.1 - 1e-9 && r <= 0.9 + 1e-9, 'folded value stays in range');
  }
  assert.equal(L.reflectRange(5, 0.3, 0.3), 0.3); // degenerate zero span
});

const BB = { minX: 0.1, minY: 0.5, maxX: 0.9, maxY: 0.95 };

test('ballState returns null with no snapshot (caller uses home)', () => {
  assert.equal(L.ballState(null, 1000, BB, 2.6, 0.02), null);
  assert.equal(L.ballState({ s0: 1 }, 1000, BB, 2.6, 0.02), null); // missing x0/y0
});

test('ballState at t=0 sits exactly at the start point, full speed', () => {
  const snap = { x0: 0.5, y0: 0.7, dx: 1, dy: 0, s0: 0.9, ts: 1000 };
  const s = L.ballState(snap, 1000, BB, 2.6, 0.02);
  assert.ok(Math.abs(s.x - 0.5) < 1e-9 && Math.abs(s.y - 0.7) < 1e-9);
  assert.ok(Math.abs(s.speed - 0.9) < 1e-9);
  assert.equal(s.resting, false);
});

test('ballState travels forward then slows to rest, deterministically', () => {
  const snap = { x0: 0.3, y0: 0.7, dx: 1, dy: 0, s0: 0.9, ts: 0 };
  const early = L.ballState(snap, 200, BB, 2.6, 0.02);
  const later = L.ballState(snap, 1200, BB, 2.6, 0.02);
  assert.ok(later.dist > early.dist, 'keeps moving forward');
  assert.ok(later.speed < early.speed, 'slows down');
  // Same inputs → identical output on every client.
  assert.deepEqual(L.ballState(snap, 1200, BB, 2.6, 0.02), later);
});

test('ballState converges to a fixed resting spot (dist → s0/k, folded)', () => {
  const snap = { x0: 0.3, y0: 0.7, dx: 1, dy: 0, s0: 0.9, ts: 0 };
  const far = L.ballState(snap, 100000, BB, 2.6, 0.02);
  const rest = L.reflectRange(0.3 + 0.9 / 2.6, BB.minX, BB.maxX);
  assert.ok(far.resting, 'has come to rest');
  assert.ok(Math.abs(far.x - rest) < 1e-6, 'rests at the folded asymptote');
  assert.ok(far.x >= BB.minX && far.x <= BB.maxX, 'stays inside bounds');
});

test('ballState clamps a future/skewed timestamp to t=0', () => {
  const snap = { x0: 0.5, y0: 0.7, dx: 1, dy: 0, s0: 0.9, ts: 2000 };
  const s = L.ballState(snap, 1000, BB, 2.6, 0.02); // nowMs before ts
  assert.ok(Math.abs(s.dist) < 1e-12 && Math.abs(s.x - 0.5) < 1e-9);
});

test('ballKick pushes the ball directly away from the pet (unit dir)', () => {
  const k = L.ballKick(0.7, 0.7, 0.6, 0.7, 0.9, 1, 5000); // pet to the left
  assert.ok(Math.abs(Math.hypot(k.dx, k.dy) - 1) < 1e-9, 'unit direction');
  assert.ok(k.dx > 0, 'ball goes right, away from the pet');
  assert.equal(k.s0, 0.9); assert.equal(k.ts, 5000);
  assert.equal(k.x0, 0.7); assert.equal(k.y0, 0.7);
});

test('ballKick falls back to facing when pet sits on the ball', () => {
  const kr = L.ballKick(0.5, 0.7, 0.5, 0.7, 0.9, 1, 0);
  assert.deepEqual([kr.dx, kr.dy], [1, 0]);
  const kl = L.ballKick(0.5, 0.7, 0.5, 0.7, 0.9, -1, 0);
  assert.deepEqual([kl.dx, kl.dy], [-1, 0]);
});

// ── Sky Clock (day/night) ──
const H = h => h * 3600000; // local hour → ms since epoch (with tzOffsetMin 0)

test('skyLocalHour reads the local fractional hour and applies tz offset', () => {
  assert.ok(Math.abs(L.skyLocalHour(H(13) + 30 * 60000, 0) - 13.5) < 1e-9);
  assert.equal(L.skyLocalHour(0, 480), 8);   // UTC+8 → 08:00 local at epoch
  assert.equal(L.skyLocalHour(0, 0), 0);
});

test('skyState: midday draws no overlay, no stars, no warmth', () => {
  const s = L.skyState(H(12), 0);
  assert.ok(s.alpha < 1e-9, 'transparent at noon (scene shows as-is)');
  assert.equal(s.star, 0);
  assert.equal(s.warm, 0);
});

test('skyState: deep night is dark and starry', () => {
  const s = L.skyState(H(0), 0);
  assert.ok(s.alpha > 0.5, 'strong dark overlay');
  assert.ok(s.star > 0.9, 'stars out');
  assert.equal(s.warm, 0);
});

test('skyState: golden hour is warm', () => {
  const s = L.skyState(H(17) + 36 * 60000, 0); // 17.6
  assert.ok(s.warm > 0.9, 'peak golden-hour warmth');
  assert.equal(s.star, 0);
});

test('skyState is deterministic and stays in range all day', () => {
  assert.deepEqual(L.skyState(H(9), 0), L.skyState(H(9), 0));
  for (let m = 0; m < 24 * 60; m += 17) {
    const s = L.skyState(m * 60000, 0);
    assert.ok(s.alpha >= 0 && s.alpha <= 1, 'alpha in [0,1] at min ' + m);
    assert.ok(s.star >= 0 && s.star <= 1, 'star in [0,1]');
    assert.ok(s.warm >= 0 && s.warm <= 1, 'warm in [0,1]');
    [...s.top, ...s.bottom].forEach(c => assert.ok(c >= 0 && c <= 255, 'colour byte in range'));
  }
});

test('skyState wraps smoothly across midnight (23:30 and 00:30 both night)', () => {
  const late = L.skyState(H(23) + 30 * 60000, 0);
  const early = L.skyState(H(0) + 30 * 60000, 0);
  assert.ok(late.star > 0.9 && early.star > 0.9, 'both sides of midnight are starry');
  assert.ok(late.alpha > 0.5 && early.alpha > 0.5, 'both dark');
});
