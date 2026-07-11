/**
 * playground-shared-logic.js — Pure logic + tunables for the SHARED (true
 * multiplayer physics) Bubble Playground.
 *
 * One player is the HOST: their browser runs the physics simulation in a fixed
 * virtual space and streams ball positions to the Realtime Database a few times
 * per second. Everyone else renders those positions (dead-reckoning between
 * network snapshots with the same step function, so motion stays 60fps-smooth).
 * Pops are claimed with a write-once RTDB transaction — first tap wins, exactly
 * like Coin Rush robbing mode — and chain-pop cascades are refereed by the host
 * so every screen sees the identical chain.
 *
 * Everything here is deterministic and DOM/Firebase-free: host election,
 * takeover rules, the physics step, chain resolution, the compact wire format
 * and the screen↔virtual mapping. bubble-playground.js owns the DOM/RTDB wiring.
 */
(function (global) {
  'use strict';

  const PS = {};

  /* ─────────────────────────────────────────────────────────────
     Tunables — single source of truth (no magic numbers in the UI)
     ───────────────────────────────────────────────────────────── */

  /** Fixed virtual field. Every client maps this to its own screen, so "the
   *  ball in the corner" is the same ball in everyone's corner. Square splits
   *  the letterboxing pain fairly between portrait phones and landscape
   *  desktops (the board is mobile-first). */
  PS.VIRT_W = 800;
  PS.VIRT_H = 800;
  /** Shared-mode balls are drawn from ballSize() × this, because phones render
   *  the virtual field at ~0.4–0.5 scale and taps need a finger-sized target. */
  PS.SHARED_BALL_SCALE = 1.4;

  /** How often the host broadcasts ball positions (ms). 8 Hz keeps each
   *  update ~0.5 KB; viewers dead-reckon in between so it still looks 60fps. */
  PS.NET_MS = 125;
  /** No position update for this long → the host is gone, elect a new one. */
  PS.HOST_STALE_MS = 4000;

  /** Most recent board messages turned into balls (bounds network weight). */
  PS.MAX_BALLS = 16;

  /** Wall bounce keeps this fraction of speed (matches the local mode feel). */
  PS.BOUNCE = 0.9;
  /** Per-frame air drag at 60fps; stepBall rescales it so any frame rate
   *  produces the same trajectory. */
  PS.AIR_DRAG = 0.995;

  /** Chain pops: centre-to-centre reach of one popping ball (virtual px).
   *  Tuned against shared-mode ball sizes (~84–196 via SHARED_BALL_SCALE):
   *  two balls chain when their edges are roughly a finger-width apart. */
  PS.CHAIN_RADIUS = 150;
  /** Delay between cascade waves (ms) — gives the pop-pop-pop rhythm. */
  PS.CHAIN_WAVE_MS = 130;

  /** Throttle for a viewer's drag-position events to the host (ms). */
  PS.DRAG_SEND_MS = 90;
  /** Host keeps a remotely-grabbed ball pinned this long after the last drag
   *  event; a fling (or timeout) releases it. */
  PS.HOLD_TTL_MS = 600;

  /** Everyone's pops feed one shared daily counter; celebrate every N. */
  PS.COOP_MILESTONE = 100;

  /* ─────────────────────────────────────────────────────────────
     Screen ↔ virtual mapping
     ───────────────────────────────────────────────────────────── */

  /**
   * Uniform scale-to-fit (letterboxed) transform for a screen field.
   * @param {number} fw field width px   @param {number} fh field height px
   * @returns {{scale:number, ox:number, oy:number}}
   */
  PS.fieldTransform = function (fw, fh) {
    fw = Math.max(1, fw || 0); fh = Math.max(1, fh || 0);
    const scale = Math.min(fw / PS.VIRT_W, fh / PS.VIRT_H);
    return {
      scale: scale,
      ox: (fw - PS.VIRT_W * scale) / 2,
      oy: (fh - PS.VIRT_H * scale) / 2
    };
  };

  /** Virtual point → screen px. */
  PS.toScreen = function (x, y, tf) {
    return { x: tf.ox + x * tf.scale, y: tf.oy + y * tf.scale };
  };

  /** Screen px → virtual point. */
  PS.toVirtual = function (sx, sy, tf) {
    return { x: (sx - tf.ox) / tf.scale, y: (sy - tf.oy) / tf.scale };
  };

  /* ─────────────────────────────────────────────────────────────
     Physics — one deterministic step (host and dead-reckoning viewers)
     ───────────────────────────────────────────────────────────── */

  /**
   * Advance one ball by dt seconds inside the virtual walls.
   * Pure: returns the new {x,y,vx,vy}, never mutates the input.
   * @param {{x:number,y:number,vx:number,vy:number,size:number}} b
   * @param {number} dt seconds (callers cap it; negatives clamp to 0)
   */
  PS.stepBall = function (b, dt) {
    dt = Math.max(0, Math.min(0.05, dt || 0));
    let x = b.x + b.vx * dt;
    let y = b.y + b.vy * dt;
    let vx = b.vx, vy = b.vy;
    const W = PS.VIRT_W, H = PS.VIRT_H, s = b.size;
    if (x <= 0)          { x = 0;     vx =  Math.abs(vx) * PS.BOUNCE; }
    else if (x + s >= W) { x = W - s; vx = -Math.abs(vx) * PS.BOUNCE; }
    if (y <= 0)          { y = 0;     vy =  Math.abs(vy) * PS.BOUNCE; }
    else if (y + s >= H) { y = H - s; vy = -Math.abs(vy) * PS.BOUNCE; }
    // Frame-rate-independent air drag (equivalent to 0.995/frame at 60fps).
    const drag = Math.pow(PS.AIR_DRAG, dt * 60);
    return { x: x, y: y, vx: vx * drag, vy: vy * drag };
  };

  /** Ball diameter (virtual px) for a label of this length — same growth curve
   *  as the local playground; the caller adds its own random jitter. */
  PS.ballSize = function (textLen) {
    textLen = Math.max(0, textLen || 0);
    return Math.round(60 + Math.min(70, textLen * 1.6));
  };

  /* ─────────────────────────────────────────────────────────────
     Host election & takeover
     ───────────────────────────────────────────────────────────── */

  /**
   * Deterministic election: the earliest joiner wins, ties break by uid, so
   * every client independently agrees on the same candidate.
   * @param {Object<string,{j:number}>} players uid → {j: joinTs}
   * @returns {string|null} elected uid
   */
  PS.electHost = function (players) {
    if (!players) return null;
    let best = null, bestJ = Infinity;
    for (const uid of Object.keys(players)) {
      const j = (players[uid] && typeof players[uid].j === 'number') ? players[uid].j : Infinity;
      if (j < bestJ || (j === bestJ && (best === null || uid < best))) { best = uid; bestJ = j; }
    }
    return best;
  };

  /**
   * Should *I* try to take over hosting right now?
   * True only when there is no live host (none set, host left the player list,
   * or their position stream went stale) AND I am the elected candidate among
   * the remaining players.
   * @param {Object} players      uid → {j}
   * @param {string} myUid
   * @param {string|null} hostUid current host (null/undefined = none)
   * @param {number} msSinceNet   ms since the last position update arrived
   * @param {number} [staleMs]
   * @returns {boolean}
   */
  PS.shouldTakeOver = function (players, myUid, hostUid, msSinceNet, staleMs) {
    staleMs = (staleMs == null) ? PS.HOST_STALE_MS : staleMs;
    if (!myUid || !players || !players[myUid]) return false;
    if (hostUid === myUid) return false;                    // already me
    const hostAlive = hostUid && players[hostUid] && msSinceNet < staleMs;
    if (hostAlive) return false;
    // Elect among everyone except the dead host.
    const candidates = {};
    for (const uid of Object.keys(players)) {
      if (uid !== hostUid) candidates[uid] = players[uid];
    }
    return PS.electHost(candidates) === myUid;
  };

  /* ─────────────────────────────────────────────────────────────
     Chain-pop resolution (host is the referee)
     ───────────────────────────────────────────────────────────── */

  /**
   * BFS cascade from a popped ball: wave 1 = every live ball whose centre is
   * within `radius` of the origin's centre, wave 2 = within radius of any wave-1
   * ball, and so on. Returns the waves EXCLUDING the origin ([] = no chain).
   * @param {Array<{id:string,x:number,y:number,size:number}>} balls live balls
   * @param {string} originId
   * @param {number} [radius]
   * @returns {string[][]}
   */
  PS.resolveChain = function (balls, originId, radius) {
    radius = (radius == null) ? PS.CHAIN_RADIUS : radius;
    if (!Array.isArray(balls)) return [];
    const byId = {};
    balls.forEach(b => { if (b && b.id != null) byId[b.id] = b; });
    if (!byId[originId]) return [];
    const centre = (b) => ({ cx: b.x + b.size / 2, cy: b.y + b.size / 2 });
    const inChain = new Set([originId]);
    const waves = [];
    let frontier = [originId];
    while (frontier.length) {
      const next = [];
      for (const fid of frontier) {
        const fc = centre(byId[fid]);
        for (const b of balls) {
          if (!b || b.id == null || inChain.has(b.id)) continue;
          const bc = centre(b);
          const dx = bc.cx - fc.cx, dy = bc.cy - fc.cy;
          if (dx * dx + dy * dy <= radius * radius) { inChain.add(b.id); next.push(b.id); }
        }
      }
      if (next.length) waves.push(next);
      frontier = next;
    }
    return waves;
  };

  /** Total balls across all waves (for combo display / coin grants). */
  PS.chainCount = function (waves) {
    if (!Array.isArray(waves)) return 0;
    return waves.reduce((n, w) => n + (Array.isArray(w) ? w.length : 0), 0);
  };

  /** Combo display: '×N' plus a size tier for CSS. n = balls popped in total
   *  (origin included), so a chain of 1 extra ball shows ×2. */
  PS.comboLabel = function (n) { return '×' + Math.max(0, Math.floor(n) || 0); };
  PS.comboTier = function (n) {
    n = Math.floor(n) || 0;
    return n >= 7 ? 'mega' : n >= 4 ? 'big' : 'small';
  };

  /* ─────────────────────────────────────────────────────────────
     Wire format — compact position stream
     ───────────────────────────────────────────────────────────── */

  const r1 = (n) => Math.round(n * 10) / 10;

  /**
   * Pack live balls into the tiny object the host writes at NET_MS.
   * @param {Array<{id:string,x,y,vx,vy}>} balls
   * @returns {Object<string,[number,number,number,number]>}
   */
  PS.packPos = function (balls) {
    const out = {};
    (balls || []).forEach(b => {
      if (b && b.id != null) out[b.id] = [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy)];
    });
    return out;
  };

  /** Inverse of packPos. Skips malformed entries. */
  PS.unpackPos = function (obj) {
    const out = [];
    if (!obj || typeof obj !== 'object') return out;
    for (const id of Object.keys(obj)) {
      const a = obj[id];
      if (Array.isArray(a) && a.length >= 4 && a.every(n => typeof n === 'number')) {
        out.push({ id: id, x: a[0], y: a[1], vx: a[2], vy: a[3] });
      }
    }
    return out;
  };

  /** Unique-forever ball id (session token + counter) so write-once pop claims
   *  can never collide across refills or host changes. */
  PS.makeBallId = function (session, n) { return 'b' + session + '_' + n; };

  /* ─────────────────────────────────────────────────────────────
     Co-op daily counter
     ───────────────────────────────────────────────────────────── */

  /**
   * Which milestone (if any) did the counter just cross?
   * @returns {number} the milestone value crossed, or 0 if none.
   */
  PS.milestoneCrossed = function (prev, next, step) {
    step = step || PS.COOP_MILESTONE;
    prev = Math.max(0, Math.floor(prev) || 0);
    next = Math.max(0, Math.floor(next) || 0);
    if (next <= prev) return 0;
    const m = Math.floor(next / step);
    return m > Math.floor(prev / step) ? m * step : 0;
  };

  // Export for both browser (window.PlaygroundShared) and Node/CommonJS.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PS;
  }
  global.PlaygroundShared = PS;
})(typeof window !== 'undefined' ? window : globalThis);
