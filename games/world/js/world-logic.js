/* ════════════════════════════════════════════════════════════════
   world-logic.js — PURE logic for the multiplayer World (no DOM, no
   Firebase, no canvas). Everything here is unit-tested in
   world-logic.test.js and reused by the browser modules as globals.
   Keeping this pure is what lets `node --test` cover the tricky math
   (movement clamp, write throttling, interpolation, sharding).
   ════════════════════════════════════════════════════════════════ */

// Clamp a scalar to [lo, hi].
function wClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Clamp a normalized (0–1) position into a scene's walkable rectangle.
// bounds = { minX, minY, maxX, maxY } in 0–1 space.
function clampToBounds(x, y, bounds) {
  return {
    x: wClamp(x, bounds.minX, bounds.maxX),
    y: wClamp(y, bounds.minY, bounds.maxY),
  };
}

// Normalize a raw input vector so diagonal movement isn't faster than axis
// movement. Returns {x,y} with magnitude ≤ 1 (zero stays zero).
function normalizeVector(dx, dy) {
  const mag = Math.hypot(dx, dy);
  if (mag <= 1e-6) return { x: 0, y: 0 };
  if (mag <= 1) return { x: dx, y: dy };
  return { x: dx / mag, y: dy / mag };
}

// Advance a position by an input vector over dt seconds at `speed` (world
// units/sec), then clamp to the scene bounds. Returns {x,y,moved}.
function stepPosition(x, y, vec, speed, dt, bounds) {
  const nx = x + vec.x * speed * dt;
  const ny = y + vec.y * speed * dt;
  const c = clampToBounds(nx, ny, bounds);
  const moved = Math.abs(c.x - x) > 1e-6 || Math.abs(c.y - y) > 1e-6;
  return { x: c.x, y: c.y, moved };
}

// Decide whether to push a network position update. We only write when enough
// time has passed AND something meaningful changed (moved > epsilon, or facing
// / action changed). This is the core cost guard: an idle player writes nothing.
// last = { x, y, facing, action, ts } (last SENT), cur = same shape, now = ms.
function shouldWritePosition(last, cur, opts) {
  const minInterval = opts.minIntervalMs; // e.g. 200ms → ≤5 Hz
  const epsilon = opts.epsilon;           // min normalized move to bother sending
  if (!last) return true;                 // never sent before
  if (now(cur, opts) - last.ts < minInterval) return false; // rate cap
  if (cur.facing !== last.facing) return true;
  if (cur.action !== last.action) return true;
  const dist = Math.hypot(cur.x - last.x, cur.y - last.y);
  return dist >= epsilon;
}
// tiny indirection so tests can pass an explicit `nowMs` on cur without a clock
function now(cur, opts) { return (opts && typeof opts.nowMs === 'number') ? opts.nowMs : cur.ts; }

// Linear interpolate.
function lerp(a, b, f) { return a + (b - a) * f; }

// Move a remote's rendered position a fraction toward its last-synced target.
// Called every frame so low-Hz network updates look smooth. `factor` in 0–1.
function lerpToward(cur, target, factor) {
  return {
    x: lerp(cur.x, target.x, factor),
    y: lerp(cur.y, target.y, factor),
  };
}

// Perspective depth scale from the pet's y (bottom of screen = bigger).
// Mirrors the room's formula so pets read at a consistent size.
function depthScale(y) { return Math.max(0.4, 0.6 + (y - 0.6) * 2.0); }

// Project a normalized (0–1) point to canvas pixels.
function projectToPixel(x, y, W, H) { return { px: x * W, py: y * H }; }

// Euclidean distance between two {x,y} points (normalized space).
function worldDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Is a remote still alive? Despawn backstop when onDisconnect didn't fire.
function isFresh(ts, nowMs, ttlMs) { return (nowMs - ts) < ttlMs; }

// Pick a shard to join: the first shard index whose player count is under the
// soft cap; if all known shards are full, open the next index. `counts` is an
// array where counts[i] = players currently in shard i. Deterministic so every
// client fills shard 0 before spilling into shard 1, keeping friends together.
function assignShard(counts, cap) {
  for (let i = 0; i < counts.length; i++) {
    if ((counts[i] || 0) < cap) return i;
  }
  return counts.length; // all full → new shard
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    wClamp, clampToBounds, normalizeVector, stepPosition, shouldWritePosition,
    lerp, lerpToward, depthScale, projectToPixel, worldDist, isFresh, assignShard,
  };
}
