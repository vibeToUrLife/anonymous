/* ════════════════════════════════════════════════════════════════
   world-ball.js — the pool's shared kickable floaties (beach ball + swim ring).
   Each floaty in WORLD_BALLS.items lives in the pool shard. Walk a pet into one
   (no button) and it rolls off with momentum, slows with friction, bounces off
   the walls, and settles somewhere new — and EVERYONE in the pool sees the same
   floaty land in the same place. That sync costs one tiny write per kick: we
   publish a kick SNAPSHOT (start, direction, speed, server-ts) to that floaty's
   own node (world/scenes/{scene}/{shard}/balls/{id}) and every client renders it
   as a pure function of the snapshot + the server clock (world-logic ballState).
   Between kicks nothing is written.

   Only the client whose OWN pet touches a floaty issues the kick; remote pets
   kick on their own machines. If RTDB is unavailable a floaty still rolls, just
   locally (the kicker's snapshot is kept per-floaty in `localSnap`).
   Called by world-core: update() before draw, draw() under the actors.
   ════════════════════════════════════════════════════════════════ */
const WorldBall = (function () {
  let serverNow = function () { return Date.now(); };
  let getBall = function () { return null; };   // (id) → that floaty's latest synced snapshot (or null)
  let kickBall = function () {};                 // (id, snap) → publish a kick snapshot

  const ECHO_MS = 800;     // grace for my own kick to echo back before I defer to the shared node
  const state = {};        // floaty id → { localSnap, localDeadline, lastKickTs, wasInside, primed }
  function stFor(id) { return state[id] || (state[id] = { localSnap: null, localDeadline: -1e9, lastKickTs: -1e9, wasInside: false, primed: false }); }

  const DEFAULTS = {
    contact: 0.075, kickSpeed: 0.95, friction: 2.6, restEps: 0.03, cooldownMs: 220,
    items: [{ id: 'beach', scene: 'pool', type: 'beachball', home: { x: 0.4, y: 0.72 }, radius: 0.028 }],
  };
  function cfg() { return (typeof WORLD_BALLS !== 'undefined') ? WORLD_BALLS : DEFAULTS; }
  function itemsFor(sceneId) { return cfg().items.filter(function (it) { return it.scene === sceneId; }); }
  function bounds(sceneId) { return worldSceneById(sceneId).bounds; }

  // Freshest snapshot for one floaty. `localSnap` is my own last kick; `net` is
  // the shared RTDB node — which can briefly hold an OPTIMISTIC value that
  // Firebase then rolls back (a denied write, e.g. the ball rule not deployed,
  // flips the node to my snapshot and immediately back to null). So we keep
  // localSnap as a durable fallback and NEVER discard it here — otherwise the
  // rollback-to-null would snap the floaty home:
  //   • no shared value (offline, or a write that rolled back) → keep my kick.
  //   • shared value newer-or-equal to my kick → it's authoritative.
  //   • shared value OLDER than my kick → hold my kick through the echo grace
  //     window, then converge to the shared node (resolves a lost last-write race).
  function effectiveSnap(item) {
    const s = stFor(item.id);
    const net = getBall(item.id);
    if (!net || typeof net.ts !== 'number') return s.localSnap;
    if (!s.localSnap) return net;
    if (net.ts >= s.localSnap.ts) return net;
    return serverNow() <= s.localDeadline ? s.localSnap : net;
  }

  // Live position of one floaty this instant (or its home spot before any kick).
  function posOf(item) {
    const c = cfg();
    const r = ballState(effectiveSnap(item), serverNow(), bounds(item.scene), c.friction, c.restEps);
    return r || { x: item.home.x, y: item.home.y, speed: 0, dist: 0, resting: true };
  }

  function reset() { for (const k in state) delete state[k]; }

  function init(opts) {
    opts = opts || {};
    serverNow = opts.serverNow || serverNow;
    getBall = opts.getBall || getBall;
    kickBall = opts.kickBall || kickBall;
    reset();
  }

  // Kick detection — only MY pet, for every floaty in the current scene. A kick
  // fires on the RISING EDGE of contact while the floaty is at rest (rest gate +
  // cooldown → a pet can dribble it with pauses, not machine-gun it). The `primed`
  // latch seeds wasInside on the first in-scene frame so a pet that spawns on top
  // of a resting floaty doesn't relaunch it.
  function update(t, dtSec, me, remotes, sceneId) {
    if (!me) return;
    const c = cfg();
    const items = itemsFor(sceneId);
    for (let i = 0; i < items.length; i++) {
      const item = items[i], s = stFor(item.id), p = posOf(item);
      const inside = worldDist(me, p) <= c.contact;
      if (!s.primed) { s.wasInside = inside; s.primed = true; continue; }
      if (inside && !s.wasInside && p.resting && (serverNow() - s.lastKickTs) > c.cooldownMs) {
        const now = serverNow();
        const snap = ballKick(p.x, p.y, me.x, me.y, c.kickSpeed, me.facing, now);
        s.localSnap = snap; s.lastKickTs = now; s.localDeadline = now + ECHO_MS;
        kickBall(item.id, snap);
      }
      s.wasInside = inside;
    }
  }

  // ── Draw ──
  function shadow(ctx, cx, cy, rx, ry, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawBeachball(ctx, W, H, item, p) {
    const c = cfg(), ds = depthScale(p.y), r = ds * item.radius * H, cx = p.x * W, cy = p.y * H;
    const lift = Math.min(1, p.speed / c.kickSpeed), by = cy - lift * r * 0.9;
    const spin = p.dist / (item.radius || 0.028);
    shadow(ctx, cx, cy + ds * 2, r * (0.9 - lift * 0.2), r * 0.32, 0.16 * (1 - lift * 0.4));
    ctx.save(); ctx.translate(cx, by); ctx.rotate(spin); ctx.scale(1 + lift * 0.12, 1 - lift * 0.12);
    const cols = ['#ff6b6b', '#ffd93b', '#4dd0e1', '#ffffff'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawRing(ctx, W, H, item, p) {
    const c = cfg(), ds = depthScale(p.y), r = ds * item.radius * H, cx = p.x * W, cy = p.y * H;
    const lift = Math.min(1, p.speed / c.kickSpeed), by = cy - lift * r * 0.8;
    const spin = p.dist / (item.radius || 0.032);
    shadow(ctx, cx, cy + ds * 2, r * (1.0 - lift * 0.2), r * 0.34, 0.16 * (1 - lift * 0.4));
    ctx.save(); ctx.translate(cx, by); ctx.rotate(spin); ctx.scale(1 + lift * 0.1, 1 - lift * 0.1);
    // red/white swim ring — a thick torus in 4 alternating arcs, hollow centre
    const cols = ['#ff5d5d', '#ffffff', '#ff5d5d', '#ffffff'];
    ctx.lineWidth = r * 0.58; ctx.lineCap = 'butt';
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, W, H, t, sceneId) {
    const items = itemsFor(sceneId);
    for (let i = 0; i < items.length; i++) {
      const item = items[i], p = posOf(item);
      if (item.type === 'ring') drawRing(ctx, W, H, item, p);
      else drawBeachball(ctx, W, H, item, p);
    }
  }

  return { init, update, draw, reset, posOf };
})();
