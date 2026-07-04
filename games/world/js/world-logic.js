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

// Reciprocal high-five: two actors {x,y,action,actionTs} match when BOTH are
// mid-offer, their offers started within windowMs of each other, and they are
// within radius (inclusive — generous, since positions sync at ≤5 Hz). Every
// client runs this on the same replicated data, so all screens agree.
function highfiveMatch(a, b, opts) {
  if (!a || !b) return false;
  if (a.action !== opts.actionId || b.action !== opts.actionId) return false;
  if (Math.abs((a.actionTs || 0) - (b.actionTs || 0)) > opts.windowMs) return false;
  return worldDist(a, b) <= opts.radius;
}

// Order-independent id for one matched high-five (uid pair + both offer
// timestamps), so every client dedupes the same celebration exactly once and a
// later re-highfive between the same pair reads as a new event.
function highfiveKey(uidA, tsA, uidB, tsB) {
  return uidA < uidB
    ? uidA + ':' + tsA + '|' + uidB + ':' + tsB
    : uidB + ':' + tsB + '|' + uidA + ':' + tsA;
}

// ── Daily Sparkle Hunt: deterministic placement + hot/cold reveal ──

// Small deterministic PRNG (same idiom as the scene painters): fract(sin(...)).
function worldRnd(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Stable 32-bit string hash (FNV-1a) → seeds placement from a date+scene string.
function worldStrHash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The calendar day (YYYY-MM-DD) at nowMs shifted by tzOffsetMin, so the hunt
// resets at local midnight and every client agrees on "today" (fed the
// server-aligned clock, not the device clock).
function worldDayKey(nowMs, tzOffsetMin) {
  const d = new Date(nowMs + (tzOffsetMin || 0) * 60000);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

// `count` deterministic sparkle positions for one scene+day, inset by `margin`
// from the scene's walkable bounds so they're always reachable. Same inputs →
// same spots on every client, so the layout never needs networking.
function sparkleSpots(dayKey, sceneId, bounds, count, margin) {
  const x0 = bounds.minX + margin, x1 = bounds.maxX - margin;
  const y0 = bounds.minY + margin, y1 = bounds.maxY - margin;
  const spots = [];
  for (let i = 0; i < count; i++) {
    const rx = worldRnd(worldStrHash(dayKey + '|' + sceneId + '|' + i + '|x') % 100000);
    const ry = worldRnd(worldStrHash(dayKey + '|' + sceneId + '|' + i + '|y') % 100000);
    spots.push({ x: x0 + rx * (x1 - x0), y: y0 + ry * (y1 - y0) });
  }
  return spots;
}

// Hot/cold reveal: 0 when farther than revealRadius (sparkle stays hidden),
// ramping to 1 as the player reaches it.
function sparkleGlow(dist, revealRadius) {
  if (dist >= revealRadius) return 0;
  return 1 - dist / revealRadius;
}

// ── Shared kickable ball: deterministic physics ─────────────────────
// The pool ball is a shared toy. Rather than sync its position every frame, we
// sync ONE snapshot per kick — { x0,y0 (start), dx,dy (unit dir), s0 (start
// speed), ts (server ms) } — and every client renders the ball as a PURE
// function of that snapshot and the server-aligned clock. So all screens agree
// and converge to the exact same resting spot with a single write per kick.

// Fold a coordinate into [min,max] by mirror reflection (a 1-D billiard bounce).
// For an axis-aligned rectangle, folding x and y independently is the EXACT
// unfolding of a constant-direction bounce, so the ball cleanly bounces off the
// walls. Handles p outside the range by any amount (many reflections).
function reflectRange(p, min, max) {
  const span = max - min;
  if (span <= 0) return min;
  let q = (p - min) % (2 * span);
  if (q < 0) q += 2 * span;
  return min + (q > span ? 2 * span - q : q);
}

// Ball position/speed at `nowMs` from a kick snapshot, under exponential
// friction (speed = s0·e^(−k·t); distance travelled = (s0/k)(1−e^(−k·t))).
// Returns { x, y, speed, dist, resting } with x,y folded into `bounds`.
// Deterministic: same snapshot + clock ⇒ identical result on every client, and
// as t→∞ the ball settles at one fixed folded point. Returns null when there is
// no snapshot yet (caller falls back to the ball's home spot).
function ballState(snap, nowMs, bounds, k, restEps) {
  if (!snap || typeof snap.x0 !== 'number' || typeof snap.y0 !== 'number') return null;
  const t = Math.max(0, (nowMs - (snap.ts || 0)) / 1000);
  const decay = Math.exp(-k * t);
  const s0 = snap.s0 || 0;
  const speed = s0 * decay;
  const dist = k > 0 ? (s0 / k) * (1 - decay) : 0;
  const ux = snap.x0 + (snap.dx || 0) * dist;
  const uy = snap.y0 + (snap.dy || 0) * dist;
  return {
    x: reflectRange(ux, bounds.minX, bounds.maxX),
    y: reflectRange(uy, bounds.minY, bounds.maxY),
    speed: speed, dist: dist, resting: speed < (restEps || 0.02),
  };
}

// Build a kick snapshot: the ball starts at (bx,by) and is pushed away from the
// pet at (px,py) at `speed`. If the pet sits exactly on the ball, fall back to
// `facing` (or +x) so we never emit a zero-length direction.
function ballKick(bx, by, px, py, speed, facing, tsMs) {
  let dx = bx - px, dy = by - py;
  const m = Math.hypot(dx, dy);
  if (m < 1e-6) { dx = (facing || 1) >= 0 ? 1 : -1; dy = 0; }
  else { dx /= m; dy /= m; }
  return { x0: bx, y0: by, dx: dx, dy: dy, s0: speed, ts: tsMs };
}

// ── Day/night Sky Clock: time-of-day → overlay tint (pure, tested) ──
// Rather than sync any state, the sky is a pure function of the shared server
// clock: every client with the same clock paints the same time-of-day, so two
// pets standing together see an identical sky. skyState() returns how to tint the
// scene RIGHT NOW — a translucent gradient (top/bottom RGB + alpha) laid over the
// scene's own sky, plus star/moon and golden-hour strengths — interpolated
// between keyframes with a smooth midnight wraparound.
// Keyframe row: { h: local hour, top/bot: overlay RGB, a: overlay alpha,
//   s: star/darkness strength 0–1, w: golden-hour warmth 0–1 }.
const WORLD_SKY_KEYS = [
  { h: 0.0,  top: [22, 26, 64],    bot: [44, 46, 92],    a: 0.55, s: 1.00, w: 0.00 }, // deep night
  { h: 5.0,  top: [30, 34, 78],    bot: [72, 60, 112],   a: 0.52, s: 0.90, w: 0.05 }, // pre-dawn
  { h: 6.2,  top: [120, 96, 150],  bot: [255, 168, 140], a: 0.40, s: 0.30, w: 0.35 }, // rosy dawn
  { h: 7.5,  top: [255, 206, 130], bot: [255, 232, 175], a: 0.20, s: 0.00, w: 0.75 }, // sunrise glow
  { h: 9.0,  top: [255, 255, 255], bot: [255, 255, 255], a: 0.00, s: 0.00, w: 0.00 }, // clear day
  { h: 16.0, top: [255, 255, 255], bot: [255, 255, 255], a: 0.00, s: 0.00, w: 0.00 }, // clear day
  { h: 17.6, top: [255, 178, 92],  bot: [255, 150, 110], a: 0.30, s: 0.00, w: 1.00 }, // golden hour
  { h: 18.9, top: [116, 70, 128],  bot: [255, 122, 96],  a: 0.42, s: 0.35, w: 0.50 }, // dusk
  { h: 20.2, top: [26, 30, 70],    bot: [48, 48, 96],    a: 0.55, s: 1.00, w: 0.00 }, // nightfall
];

// Local fractional hour [0,24) at nowMs, shifted by tzOffsetMin — same UTC-getter
// idiom as worldDayKey so it's deterministic from the server clock, not the device.
function skyLocalHour(nowMs, tzOffsetMin) {
  const d = new Date(nowMs + (tzOffsetMin || 0) * 60000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

function skyState(nowMs, tzOffsetMin) {
  const h = skyLocalHour(nowMs, tzOffsetMin);
  const K = WORLD_SKY_KEYS, n = K.length;
  // Default to the wrap segment (last keyframe → first, across the 24h seam).
  let a = K[n - 1], b = K[0], span = (24 - a.h) + b.h;
  let f = span > 0 ? ((h >= a.h ? h - a.h : h + (24 - a.h)) / span) : 0;
  for (let i = 0; i < n - 1; i++) {
    if (h >= K[i].h && h < K[i + 1].h) { a = K[i]; b = K[i + 1]; span = b.h - a.h; f = span > 0 ? (h - a.h) / span : 0; break; }
  }
  const mix = (u, v) => Math.round(u + (v - u) * f);
  const lin = (u, v) => u + (v - u) * f;
  return {
    hour: h,
    top: [mix(a.top[0], b.top[0]), mix(a.top[1], b.top[1]), mix(a.top[2], b.top[2])],
    bottom: [mix(a.bot[0], b.bot[0]), mix(a.bot[1], b.bot[1]), mix(a.bot[2], b.bot[2])],
    alpha: lin(a.a, b.a),
    star: lin(a.s, b.s),
    warm: lin(a.w, b.w),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    wClamp, clampToBounds, normalizeVector, stepPosition, shouldWritePosition,
    lerp, lerpToward, depthScale, projectToPixel, worldDist, isFresh, assignShard,
    highfiveMatch, highfiveKey,
    worldRnd, worldStrHash, worldDayKey, sparkleSpots, sparkleGlow,
    reflectRange, ballState, ballKick,
    skyLocalHour, skyState, WORLD_SKY_KEYS,
  };
}
