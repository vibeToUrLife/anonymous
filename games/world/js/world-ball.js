/* ════════════════════════════════════════════════════════════════
   world-ball.js — the pool's shared kickable ball.
   A single ball lives in the pool shard. Walk a pet into it (no button) and it
   rolls off with momentum, slows with friction, bounces off the walls, and
   settles somewhere new — and EVERYONE in the pool sees the same ball land in
   the same place. That sync costs one tiny write per kick: we publish a kick
   SNAPSHOT (start, direction, speed, server-ts) and every client renders the
   ball as a pure function of that snapshot + the server clock (world-logic
   ballState). Between kicks nothing is written.

   Only the client whose OWN pet touches the ball issues the kick; remote pets
   kick on their own machines. If RTDB is unavailable the ball still rolls, just
   locally (the kicker's snapshot is kept in `localSnap`).
   Called by world-core: update() before draw, draw() under the actors.
   ════════════════════════════════════════════════════════════════ */
const WorldBall = (function () {
  let serverNow = function () { return Date.now(); };
  let getBall = function () { return null; };   // latest synced snapshot (or null)
  let kickBall = function () {};                 // publish a kick snapshot

  let localSnap = null;    // my own last kick — used immediately + as solo fallback
  let localDeadline = -1e9; // trust localSnap over an OLDER net snapshot only until here
  let lastKickTs = -1e9;   // dedupe double-kicks from one player
  let wasInside = false;   // contact edge-detect so holding still doesn't re-kick
  let primed = false;      // first frame in-scene seeds wasInside without kicking

  const ECHO_MS = 800;     // grace for my own kick to echo back before I defer to the shared node

  function cfg() {
    return (typeof WORLD_BALL !== 'undefined') ? WORLD_BALL
      : { scene: 'pool', home: { x: 0.7, y: 0.72 }, contact: 0.06, kickSpeed: 0.95, friction: 2.6, restEps: 0.03, cooldownMs: 220, radius: 0.028 };
  }
  function bounds() { return worldSceneById(cfg().scene).bounds; }

  // Freshest snapshot. `localSnap` is my own last kick; `net` is the shared RTDB
  // node — which can briefly hold an OPTIMISTIC value that Firebase then rolls
  // back (a denied write, e.g. the ball rule not deployed, flips the node to my
  // snapshot and immediately back to null). So we keep localSnap as a durable
  // fallback and NEVER discard it here — otherwise the rollback-to-null would
  // snap the ball home:
  //   • no shared value (offline, or a write that rolled back) → keep my kick.
  //   • shared value newer-or-equal to my kick → it's authoritative.
  //   • shared value OLDER than my kick → hold my kick through the echo grace
  //     window, then converge to the shared node (resolves a lost last-write race).
  function effectiveSnap() {
    const net = getBall();
    if (!net || typeof net.ts !== 'number') return localSnap;
    if (!localSnap) return net;
    if (net.ts >= localSnap.ts) return net;
    return serverNow() <= localDeadline ? localSnap : net;
  }

  // Live ball position this instant (or its home spot before any kick).
  function pos() {
    const c = cfg();
    const s = ballState(effectiveSnap(), serverNow(), bounds(), c.friction, c.restEps);
    return s || { x: c.home.x, y: c.home.y, speed: 0, dist: 0, resting: true };
  }

  function reset() { localSnap = null; localDeadline = -1e9; wasInside = false; lastKickTs = -1e9; primed = false; }

  function init(opts) {
    opts = opts || {};
    serverNow = opts.serverNow || serverNow;
    getBall = opts.getBall || getBall;
    kickBall = opts.kickBall || kickBall;
    reset();
  }

  // Kick detection — only MY pet, only in the ball's scene. A kick fires on the
  // RISING EDGE of contact while the ball is at rest (rest gate + cooldown let a
  // pet dribble it with pauses but not machine-gun it). The `primed` latch seeds
  // wasInside on the first in-scene frame, so a pet that spawns/teleports already
  // on top of a resting ball is NOT treated as a rising edge and doesn't relaunch
  // it — while a pet that walks in from outside still gets a genuine edge.
  function update(t, dtSec, me, remotes, sceneId) {
    const c = cfg();
    if (!me || sceneId !== c.scene) { wasInside = false; primed = false; return; }
    const p = pos();
    const inside = worldDist(me, p) <= c.contact;
    if (!primed) { wasInside = inside; primed = true; return; }
    if (inside && !wasInside && p.resting && (serverNow() - lastKickTs) > c.cooldownMs) {
      const now = serverNow();
      const snap = ballKick(p.x, p.y, me.x, me.y, c.kickSpeed, me.facing, now);
      localSnap = snap; lastKickTs = now; localDeadline = now + ECHO_MS;
      kickBall(snap);
    }
    wasInside = inside;
  }

  // ── Draw ──
  function draw(ctx, W, H, t, sceneId) {
    const c = cfg();
    if (sceneId !== c.scene) return;
    const p = pos();
    const ds = depthScale(p.y);
    const r = ds * c.radius * H;
    const cx = p.x * W, cy = p.y * H;
    // A moving ball lifts a touch off the water and squashes along its travel.
    const lift = Math.min(1, p.speed / c.kickSpeed);
    const by = cy - lift * r * 0.9;
    const spin = (effectiveSnap() ? p.dist / (c.radius || 0.028) : 0);

    ctx.save();
    // shadow stays on the ground, shrinking as the ball lifts
    ctx.globalAlpha = 0.16 * (1 - lift * 0.4); ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, cy + ds * 2, r * (0.9 - lift * 0.2), r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.translate(cx, by);
    ctx.rotate(spin);
    ctx.scale(1 + lift * 0.12, 1 - lift * 0.12); // subtle squash when fast
    const cols = ['#ff6b6b', '#ffd93b', '#4dd0e1', '#ffffff'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  return { init, update, draw, reset, pos };
})();
