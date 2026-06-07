/**
 * board-live-logic.js — Pure, framework-free logic + config for the live,
 * interactive features added to the Anonymous Bubble Answers board:
 *
 *   1. Live Presence & Typing — count who's viewing the board right now and
 *      show a "someone is typing…" hint.
 *   2. Floating Live Reactions — tap an emoji and it floats up the screen,
 *      broadcast to everyone online via one tiny shared Firestore doc.
 *   3. Bubble Playground — fling & pop the message bubbles; popping pays a few
 *      coins, capped per day so the economy can't be farmed.
 *
 * Everything here is deterministic and DOM/Firebase-free so it can be unit
 * tested in isolation (see tests/test-board-live.html). The browser modules
 * (presence.js, live-reactions.js, bubble-playground.js) handle the DOM,
 * Firestore wiring and animation; this file owns the rules and the tunables so
 * there are no magic numbers scattered across the UI.
 */
(function (global) {
  'use strict';

  const BoardLive = {};

  /* ─────────────────────────────────────────────────────────────
     Tunables — single source of truth (no hardcoded numbers in UI)
     ───────────────────────────────────────────────────────────── */

  /** A presence heartbeat older than this (ms) means the user has left. */
  BoardLive.PRESENCE_TTL_MS = 35000;
  /** How often each client refreshes its own heartbeat (ms). Kept well below
   *  the TTL so a visible client never flickers offline, but high enough to
   *  keep Firestore writes light for a small group. */
  BoardLive.HEARTBEAT_MS = 25000;
  /** Stop reporting "typing" this long (ms) after the last keystroke. */
  BoardLive.TYPING_IDLE_MS = 4000;

  /** Max reaction events retained in the shared doc (keeps it tiny). */
  BoardLive.REACTION_CAP = 25;
  /** Coalesce rapid taps into a single Firestore write within this window (ms). */
  BoardLive.REACTION_THROTTLE_MS = 350;

  /** Most coins a single user can earn per day from popping bubbles. */
  BoardLive.POP_DAILY_CAP = 30;
  /** Coins awarded per popped bubble. */
  BoardLive.POP_COINS_EACH = 1;

  /** Emoji palette shown in the floating-reaction bar. */
  BoardLive.REACTIONS = ['❤️', '😂', '🔥', '😮', '👍', '🎉'];

  /** Pastel ball colours for the playground (matches the board's soft theme). */
  BoardLive.PG_COLORS = [
    '#c8b6ff', '#ffd6e7', '#a0e7e5', '#ffeaa7',
    '#b5ead7', '#ffc9de', '#bde0fe', '#fbc4ab'
  ];

  /* ─────────────────────────────────────────────────────────────
     Presence
     ───────────────────────────────────────────────────────────── */

  /**
   * Count how many presence docs have a fresh heartbeat.
   * @param {Array<{lastSeen:number}>} docs  presence docs (self included)
   * @param {number} now   current time in ms
   * @param {number} [ttl] freshness window (defaults to PRESENCE_TTL_MS)
   * @returns {number}
   */
  BoardLive.countOnline = function (docs, now, ttl) {
    ttl = (ttl == null) ? BoardLive.PRESENCE_TTL_MS : ttl;
    if (!Array.isArray(docs)) return 0;
    let n = 0;
    for (const d of docs) {
      if (d && typeof d.lastSeen === 'number' && now - d.lastSeen <= ttl) n++;
    }
    return n;
  };

  /**
   * Is anyone OTHER than me actively typing (with a fresh heartbeat)?
   * @param {Array<{uid:string, typing:boolean, lastSeen:number}>} docs
   * @param {number} now      current time in ms
   * @param {string} selfUid  my own uid (excluded)
   * @param {number} [ttl]    freshness window (defaults to PRESENCE_TTL_MS)
   * @returns {boolean}
   */
  BoardLive.someoneElseTyping = function (docs, now, selfUid, ttl) {
    ttl = (ttl == null) ? BoardLive.PRESENCE_TTL_MS : ttl;
    if (!Array.isArray(docs)) return false;
    return docs.some(d =>
      d && d.uid !== selfUid && d.typing === true &&
      typeof d.lastSeen === 'number' && now - d.lastSeen <= ttl
    );
  };

  /* ─────────────────────────────────────────────────────────────
     Floating reactions
     ───────────────────────────────────────────────────────────── */

  /**
   * Build a reaction event. The id is unique per (uid, seq, rnd) so each tap
   * plays exactly once on every client — no wall-clock needed.
   * @param {string} uid       sender uid (or 'anon')
   * @param {number} seq       monotonic per-session counter
   * @param {number|string} rnd a random-ish disambiguator
   * @param {number} emojiIdx  index into BoardLive.REACTIONS (wrapped safely)
   * @returns {{id:string, i:number}}
   */
  BoardLive.makeReactionEvent = function (uid, seq, rnd, emojiIdx) {
    const len = BoardLive.REACTIONS.length;
    const safeIdx = ((Math.floor(emojiIdx) % len) + len) % len;
    return { id: (uid || 'anon') + ':' + seq + ':' + rnd, i: safeIdx };
  };

  /**
   * Keep only the most recent `cap` events so the shared doc stays small.
   * @param {Array} events
   * @param {number} [cap]
   * @returns {Array}
   */
  BoardLive.trimEvents = function (events, cap) {
    cap = (cap == null) ? BoardLive.REACTION_CAP : cap;
    if (!Array.isArray(events)) return [];
    return events.length > cap ? events.slice(events.length - cap) : events.slice();
  };

  /**
   * Return events whose id is not already in `seen` (so each animates once).
   * @param {Array<{id:string}>} events
   * @param {Set<string>} seen
   * @returns {Array}
   */
  BoardLive.unseenEvents = function (events, seen) {
    if (!Array.isArray(events)) return [];
    return events.filter(e => e && e.id && !(seen && seen.has(e.id)));
  };

  /* ─────────────────────────────────────────────────────────────
     Bubble Playground — daily pop-coin cap
     ───────────────────────────────────────────────────────────── */

  /**
   * Pure daily-cap calculator for coins earned by popping bubbles. Resets the
   * running count when the calendar day rolls over. Keeping this pure means the
   * UI can enforce the cap with zero extra Firestore reads (it persists the
   * tiny {day,count} state locally and only writes the granted coins).
   *
   * @param {{day:string, count:number}|null} state  prior state for the day
   * @param {string} today      day key, e.g. "2026-06-07"
   * @param {number} requested  how many bubbles popped this call
   * @param {number} [cap]      daily cap (defaults to POP_DAILY_CAP)
   * @param {number} [each]     coins per pop (defaults to POP_COINS_EACH)
   * @returns {{granted:number, state:{day:string, count:number}}}
   */
  BoardLive.grantPopCoins = function (state, today, requested, cap, each) {
    cap = (cap == null) ? BoardLive.POP_DAILY_CAP : cap;
    each = (each == null) ? BoardLive.POP_COINS_EACH : each;
    requested = Math.max(0, Math.floor(requested) || 0);
    let count = (state && state.day === today) ? (state.count || 0) : 0;
    const room = Math.max(0, cap - count);          // coins still allowed today
    const granted = Math.min(requested * each, room);
    count += granted;
    return { granted: granted, state: { day: today, count: count } };
  };

  // Export for both browser (window.BoardLive) and Node/CommonJS (tests/tools).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BoardLive;
  }
  global.BoardLive = BoardLive;
})(typeof window !== 'undefined' ? window : globalThis);
