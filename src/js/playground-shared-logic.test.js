// playground-shared-logic.test.js — unit tests for the pure shared-playground logic.
const test = require('node:test');
const assert = require('node:assert');
const PS = require('./playground-shared-logic.js');

/* ── screen ↔ virtual mapping ── */

test('fieldTransform letterboxes with a uniform scale', () => {
  // Wider than the virtual aspect → height-limited, x-centred.
  const tf = PS.fieldTransform(PS.VIRT_W * 2, PS.VIRT_H);
  assert.strictEqual(tf.scale, 1);
  assert.strictEqual(tf.ox, PS.VIRT_W / 2);
  assert.strictEqual(tf.oy, 0);
  // Taller than the virtual aspect → width-limited, y-centred.
  const tp = PS.fieldTransform(PS.VIRT_W / 2, PS.VIRT_H);
  assert.strictEqual(tp.scale, 0.5);
  assert.strictEqual(tp.ox, 0);
  assert.strictEqual(tp.oy, (PS.VIRT_H - PS.VIRT_H * 0.5) / 2);
  // Degenerate sizes never divide by zero.
  assert.ok(PS.fieldTransform(0, 0).scale > 0);
});

test('toScreen and toVirtual are inverses', () => {
  const tf = PS.fieldTransform(777, 431);
  const s = PS.toScreen(123.4, 456.7, tf);
  const v = PS.toVirtual(s.x, s.y, tf);
  assert.ok(Math.abs(v.x - 123.4) < 1e-9);
  assert.ok(Math.abs(v.y - 456.7) < 1e-9);
});

/* ── physics step ── */

test('stepBall advances position and applies drag, without mutating input', () => {
  const b = { x: 100, y: 100, vx: 60, vy: -30, size: 80 };
  const n = PS.stepBall(b, 1 / 60);
  assert.strictEqual(b.x, 100);                        // input untouched
  assert.ok(n.x > 100 && n.y < 100);
  assert.ok(Math.abs(n.vx) < 60 && Math.abs(n.vy) < 30); // drag shrinks speed
});

test('stepBall bounces off every wall and stays in bounds', () => {
  const hitL = PS.stepBall({ x: 0.5, y: 300, vx: -500, vy: 0, size: 80 }, 0.05);
  assert.strictEqual(hitL.x, 0);
  assert.ok(hitL.vx > 0);
  const hitR = PS.stepBall({ x: PS.VIRT_W - 80.5, y: 300, vx: 500, vy: 0, size: 80 }, 0.05);
  assert.strictEqual(hitR.x, PS.VIRT_W - 80);
  assert.ok(hitR.vx < 0);
  const hitB = PS.stepBall({ x: 300, y: PS.VIRT_H - 80.5, vx: 0, vy: 500, size: 80 }, 0.05);
  assert.strictEqual(hitB.y, PS.VIRT_H - 80);
  assert.ok(hitB.vy < 0);
});

test('stepBall is frame-rate independent (many small steps ≈ few big steps)', () => {
  let a = { x: 100, y: 100, vx: 200, vy: 150, size: 60 };
  let b = { x: 100, y: 100, vx: 200, vy: 150, size: 60 };
  for (let i = 0; i < 50; i++) a = Object.assign({ size: 60 }, PS.stepBall(a, 0.01)); // 0.5s in 10ms steps
  for (let i = 0; i < 10; i++) b = Object.assign({ size: 60 }, PS.stepBall(b, 0.05)); // 0.5s in 50ms steps
  assert.ok(Math.abs(a.x - b.x) < 5, 'x drift ' + Math.abs(a.x - b.x));
  assert.ok(Math.abs(a.y - b.y) < 5, 'y drift ' + Math.abs(a.y - b.y));
});

test('stepBall clamps hostile dt', () => {
  const n = PS.stepBall({ x: 100, y: 100, vx: 100, vy: 0, size: 60 }, -5);
  assert.strictEqual(n.x, 100);
  const big = PS.stepBall({ x: 100, y: 100, vx: 100, vy: 0, size: 60 }, 99);
  assert.ok(big.x <= 100 + 100 * 0.05 + 1e-9);         // capped at 50ms
});

test('ballSize matches the local-mode growth curve', () => {
  assert.strictEqual(PS.ballSize(0), 60);
  assert.strictEqual(PS.ballSize(10), 76);
  assert.strictEqual(PS.ballSize(500), 130);           // min(70, …) cap
});

/* ── host election & takeover ── */

test('electHost picks earliest joiner, ties break by uid', () => {
  assert.strictEqual(PS.electHost({ a: { j: 5 }, b: { j: 3 }, c: { j: 9 } }), 'b');
  assert.strictEqual(PS.electHost({ zz: { j: 3 }, aa: { j: 3 } }), 'aa');
  assert.strictEqual(PS.electHost({}), null);
  assert.strictEqual(PS.electHost(null), null);
});

test('shouldTakeOver: only the elected candidate moves on a dead host', () => {
  const players = { a: { j: 1 }, b: { j: 2 }, host: { j: 0 } };
  const STALE = PS.HOST_STALE_MS;
  // Host alive → nobody takes over.
  assert.strictEqual(PS.shouldTakeOver(players, 'a', 'host', 100), false);
  // Host stale → earliest of the REST ('a') takes over; 'b' stays put.
  assert.strictEqual(PS.shouldTakeOver(players, 'a', 'host', STALE + 1), true);
  assert.strictEqual(PS.shouldTakeOver(players, 'b', 'host', STALE + 1), false);
  // No host at all → candidate takes over regardless of msSinceNet.
  assert.strictEqual(PS.shouldTakeOver({ a: { j: 1 } }, 'a', null, 0), true);
  // Host left the players list entirely → also treated as dead.
  assert.strictEqual(PS.shouldTakeOver({ a: { j: 1 } }, 'a', 'ghost', 0), true);
  // I'm already the host / not in the room → false.
  assert.strictEqual(PS.shouldTakeOver(players, 'host', 'host', STALE + 1), false);
  assert.strictEqual(PS.shouldTakeOver(players, 'stranger', 'host', STALE + 1), false);
});

/* ── chain resolution ── */

test('resolveChain cascades in waves and excludes the origin', () => {
  // o — a (within 120) — b (within 120 of a, not of o); c far away.
  const balls = [
    { id: 'o', x: 0,   y: 0, size: 60 },
    { id: 'a', x: 100, y: 0, size: 60 },
    { id: 'b', x: 200, y: 0, size: 60 },
    { id: 'c', x: 700, y: 0, size: 60 },
  ];
  assert.deepStrictEqual(PS.resolveChain(balls, 'o'), [['a'], ['b']]);
  assert.deepStrictEqual(PS.resolveChain(balls, 'c'), []);          // isolated
  assert.deepStrictEqual(PS.resolveChain(balls, 'missing'), []);
  assert.deepStrictEqual(PS.resolveChain('junk', 'o'), []);
});

test('resolveChain never revisits a ball (no infinite loop on clusters)', () => {
  const cluster = [
    { id: 'o', x: 0,  y: 0,  size: 60 },
    { id: 'a', x: 40, y: 0,  size: 60 },
    { id: 'b', x: 0,  y: 40, size: 60 },
    { id: 'c', x: 40, y: 40, size: 60 },
  ];
  const waves = PS.resolveChain(cluster, 'o');
  const flat = waves.flat();
  assert.deepStrictEqual([...new Set(flat)].sort(), flat.slice().sort()); // no dupes
  assert.strictEqual(PS.chainCount(waves), 3);
  assert.ok(!flat.includes('o'));
});

test('combo label and tier', () => {
  assert.strictEqual(PS.comboLabel(3), '×3');
  assert.strictEqual(PS.comboTier(2), 'small');
  assert.strictEqual(PS.comboTier(4), 'big');
  assert.strictEqual(PS.comboTier(9), 'mega');
});

/* ── wire format ── */

test('packPos/unpackPos round-trip with 0.1 precision', () => {
  const balls = [
    { id: 'b1', x: 12.3456, y: 600, vx: -90.06, vy: 0.04 },
    { id: 'b2', x: 0, y: 0, vx: 0, vy: 0 },
  ];
  const unpacked = PS.unpackPos(PS.packPos(balls));
  const b1 = unpacked.find(b => b.id === 'b1');
  assert.ok(Math.abs(b1.x - 12.3) < 1e-9);
  assert.ok(Math.abs(b1.vx - (-90.1)) < 1e-9);
  assert.strictEqual(unpacked.length, 2);
  // Malformed entries are skipped, not crashed on.
  assert.deepStrictEqual(PS.unpackPos({ bad: 'nope', worse: [1, 2] }), []);
  assert.deepStrictEqual(PS.unpackPos(null), []);
});

test('makeBallId is unique per (session, n)', () => {
  assert.strictEqual(PS.makeBallId('x7', 3), 'bx7_3');
  assert.notStrictEqual(PS.makeBallId('x7', 3), PS.makeBallId('x7', 4));
  assert.notStrictEqual(PS.makeBallId('x7', 3), PS.makeBallId('y2', 3));
});

/* ── co-op milestones ── */

test('milestoneCrossed fires exactly when a multiple of the step is passed', () => {
  assert.strictEqual(PS.milestoneCrossed(99, 100), 100);
  assert.strictEqual(PS.milestoneCrossed(99, 101), 100);
  assert.strictEqual(PS.milestoneCrossed(100, 101), 0);   // already past it
  assert.strictEqual(PS.milestoneCrossed(50, 60), 0);
  assert.strictEqual(PS.milestoneCrossed(150, 320), 300); // jumps report the latest
  assert.strictEqual(PS.milestoneCrossed(5, 5), 0);
  assert.strictEqual(PS.milestoneCrossed(0, 7, 7), 7);    // custom step
});
