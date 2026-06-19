/**
 * coin-rush-logic.js — Pure, framework-free logic + config for the daily
 * Coin Rush: a synchronized, multiplayer bubble-pop competition on the board.
 *
 * Once per weekday, at a seeded-random time inside the morning (09:00–12:00)
 * or afternoon (14:00–18:00) window, a short frenzy fires. The "random" time is
 * a deterministic hash of the calendar date, so EVERY client computes the exact
 * same start/end with zero coordination and zero writes — that is how a random
 * time and a synchronized event coexist without any server.
 *
 * Everything here is deterministic and DOM/Firebase-free so it stays easy to
 * test in isolation (see coin-rush-logic.test.js). The browser module
 * (coin-rush.js) owns the DOM, Firestore wiring, overlay and animation; this
 * file owns the rules and tunables so there are no magic numbers in the UI.
 */
(function (global) {
  'use strict';

  const CoinRush = {};

  /* ─────────────────────────────────────────────────────────────
     Tunables — single source of truth (no hardcoded numbers in UI)
     ───────────────────────────────────────────────────────────── */

  /** Rush windows as [startHour, startMin, endHour, endMin] (local time). */
  CoinRush.WINDOWS = [[9, 0, 12, 0], [14, 0, 18, 0]];
  /** Hour the daily countdown is revealed and starts ticking (local). */
  CoinRush.REVEAL_HOUR = 9;
  /** Length of the frenzy (ms). */
  CoinRush.DURATION_MS = 60000;
  /** "Starting soon" alert lead before the rush (ms). Also the minimum gap
   *  between a window's open and the earliest possible start. */
  CoinRush.PRE_ALERT_MS = 60000;
  /** Keep the whole rush this far (ms) inside the window before it closes. */
  CoinRush.END_BUFFER_MS = 60000;
  /** Show the big, fixed (scroll-proof) "get ready" countdown when the start is
   *  this close (ms). */
  CoinRush.FINAL_COUNTDOWN_MS = 10000;
  /** Wait this long (ms) after the rush ends before reading the final ranking,
   *  so late score-writes don't reshuffle the podium. */
  CoinRush.SETTLE_MS = 5000;

  /** Coins paid per popped bubble. */
  CoinRush.COINS_EACH = 1;
  /** Most coins a single rush can pay into the wallet. Infinity = no cap. */
  CoinRush.RUSH_COIN_CAP = Infinity;
  /** Bonus coins for the daily top 3 (index 0 = 1st place). */
  CoinRush.BONUS = [1000, 500, 300];

  /** Mon–Fri only (matches the existing "off work" countdown). */
  CoinRush.WEEKDAYS_ONLY = true;
  /** Reveal the ranking only at the end (live ranking = a few extra reads). */
  CoinRush.LIVE_RANKING = false;

  /** Robbing mode: ONE shared finite pot of coins synced via Realtime DB, so
   *  players race to grab the same coins. Falls back to the solo "same layout"
   *  mode automatically if Realtime DB isn't configured. */
  CoinRush.ROBBING = true;
  /** Number of coins in the shared pot (robbing mode). */
  CoinRush.POOL_SIZE = 100;

  /** Security-rule sanity bound on a submitted score (pops). Mirror in rules. */
  CoinRush.MAX_RUSH_SCORE = 2000;
  /** Security-rule bound on a claimed bonus = max(BONUS). Mirror in rules. */
  CoinRush.MAX_RUSH_BONUS = 1000;

  /** Gold/coin ball palette for the rush overlay. */
  CoinRush.COLORS = [
    '#ffd86b', '#ffcf48', '#ffe08a', '#f7b733',
    '#ffe9a8', '#f9c846', '#ffd166', '#f6b93b'
  ];

  /* ─────────────────────────────────────────────────────────────
     Date helpers (local time — the windows are local work hours)
     ───────────────────────────────────────────────────────────── */

  /** Local YYYY-MM-DD key for a timestamp. Local (not UTC) so the day key lines
   *  up with the local window hours even near a UTC midnight. */
  CoinRush.dayKeyOf = function (now) {
    const d = new Date(now);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  /** Deterministic 32-bit FNV-1a hash of a string → unsigned int. */
  CoinRush.coinRushSeed = function (dayKey) {
    let h = 0x811c9dc5;
    for (let i = 0; i < dayKey.length; i++) {
      h ^= dayKey.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /**
   * Deterministic PRNG (mulberry32). Seeding it the same way on every client
   * yields the identical stream — so all players spawn the identical coins
   * ("same layout") with zero coordination and zero extra reads/writes.
   * @param {number} seed  uint32
   * @returns {function():number}  floats in [0, 1)
   */
  CoinRush.makeRng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ─────────────────────────────────────────────────────────────
     Schedule — today's rush start/end, derived purely from the date
     ───────────────────────────────────────────────────────────── */

  /**
   * Compute today's rush schedule from the day key.
   * @param {string} dayKey  "YYYY-MM-DD"
   * @param {object} [cfg]   tunables (defaults to CoinRush)
   * @returns {{startMs:number, endMs:number, windowIdx:number, revealMs:number}|null}
   *          null on a weekend when WEEKDAYS_ONLY is set.
   */
  CoinRush.coinRushSchedule = function (dayKey, cfg) {
    cfg = cfg || CoinRush;
    const parts = String(dayKey).split('-').map(Number);
    const y = parts[0], mo = parts[1], d = parts[2];
    const atLocal = (h, m) => new Date(y, mo - 1, d, h, m, 0, 0).getTime();

    const dow = new Date(y, mo - 1, d).getDay();         // 0 Sun … 6 Sat
    if (cfg.WEEKDAYS_ONLY && (dow === 0 || dow === 6)) return null;

    const seed = CoinRush.coinRushSeed(dayKey);
    const win = cfg.WINDOWS[seed % cfg.WINDOWS.length];
    const windowIdx = seed % cfg.WINDOWS.length;

    const windowStart = atLocal(win[0], win[1]);
    const windowEnd = atLocal(win[2], win[3]);
    const earliestStart = windowStart + cfg.PRE_ALERT_MS;
    const latestStart = windowEnd - cfg.DURATION_MS - cfg.END_BUFFER_MS;
    const availableMin = Math.max(1, Math.floor((latestStart - earliestStart) / 60000));

    const startOffsetMin = (seed >>> 1) % availableMin;
    const startMs = earliestStart + startOffsetMin * 60000;

    return {
      startMs: startMs,
      endMs: startMs + cfg.DURATION_MS,
      windowIdx: windowIdx,
      revealMs: atLocal(cfg.REVEAL_HOUR, 0)
    };
  };

  /**
   * Current phase of the rush for a given clock time.
   * @param {number} now        ms
   * @param {object|null} sched  result of coinRushSchedule (null = no rush today)
   * @param {object} [cfg]
   * @returns {{phase:string, msUntilStart:number, msUntilEnd:number}}
   *   phase ∈ none | idle | scheduled | imminent | live | results
   */
  CoinRush.coinRushPhase = function (now, sched, cfg) {
    cfg = cfg || CoinRush;
    if (!sched) return { phase: 'none', msUntilStart: 0, msUntilEnd: 0 };
    let phase;
    if (now < sched.revealMs) phase = 'idle';
    else if (now < sched.startMs - cfg.PRE_ALERT_MS) phase = 'scheduled';
    else if (now < sched.startMs) phase = 'imminent';
    else if (now < sched.endMs) phase = 'live';
    else phase = 'results';
    return {
      phase: phase,
      msUntilStart: sched.startMs - now,
      msUntilEnd: sched.endMs - now
    };
  };

  /* ─────────────────────────────────────────────────────────────
     Scoring & ranking
     ───────────────────────────────────────────────────────────── */

  /**
   * Award capped coins for popping bubbles in this rush. Score (pop count) is
   * uncapped; only the wallet payout is bounded so the rush can't be farmed.
   * @param {number} earnedSoFar  coins already paid this rush
   * @param {number} requested    bubbles popped this call
   * @param {object} [cfg]
   * @returns {{granted:number, earned:number}}
   */
  CoinRush.grantRushCoins = function (earnedSoFar, requested, cfg) {
    cfg = cfg || CoinRush;
    requested = Math.max(0, Math.floor(requested) || 0);
    earnedSoFar = Math.max(0, earnedSoFar || 0);
    const cap = cfg.RUSH_COIN_CAP;
    const granted = (cap == null || cap === Infinity)
      ? requested * cfg.COINS_EACH                                  // no cap
      : Math.min(requested * cfg.COINS_EACH, Math.max(0, cap - earnedSoFar));
    return { granted: granted, earned: earnedSoFar + granted };
  };

  /**
   * Rank score docs high→low. Ties broken by earliest updatedAt (whoever
   * reached the score first), then uid for a stable order.
   * @param {Array<{uid:string,name:string,score:number,updatedAt:number}>} docs
   * @returns {Array} same items with a 1-based `rank` field added
   */
  CoinRush.rankScores = function (docs) {
    if (!Array.isArray(docs)) return [];
    const arr = docs.filter(d => d && typeof d.score === 'number').slice();
    arr.sort((a, b) =>
      (b.score - a.score) ||
      ((a.updatedAt || 0) - (b.updatedAt || 0)) ||
      String(a.uid).localeCompare(String(b.uid))
    );
    return arr.map((d, i) => Object.assign({}, d, { rank: i + 1 }));
  };

  /**
   * Bonus coins for a finishing rank (1-based). 0 outside the top 3.
   * @param {number} rank
   * @param {object} [cfg]
   * @returns {number}
   */
  CoinRush.computeBonus = function (rank, cfg) {
    cfg = cfg || CoinRush;
    if (!(rank >= 1)) return 0;
    return cfg.BONUS[rank - 1] || 0;
  };

  /** Find a player's ranked entry, or null. */
  CoinRush.findRank = function (ranked, uid) {
    if (!Array.isArray(ranked)) return null;
    return ranked.find(r => r && r.uid === uid) || null;
  };

  /* ─────────────────────────────────────────────────────────────
     Robbing — shared finite coin pot
     ───────────────────────────────────────────────────────────── */

  /**
   * Build the shared pot: `count` coins with deterministic, normalized layout
   * (so every client renders the identical coins) and a stable integer id used
   * as the Realtime DB claim key.
   * @param {number} seed
   * @param {number} count
   * @param {object} [cfg]
   * @returns {Array<{id:number, nx:number, ny:number, sizeF:number, colorIdx:number}>}
   */
  CoinRush.generatePool = function (seed, count, cfg) {
    cfg = cfg || CoinRush;
    const rng = CoinRush.makeRng(seed);
    const pool = [];
    for (let i = 0; i < count; i++) {
      pool.push({
        id: i,
        nx: rng(),                                  // normalized 0..1 position
        ny: rng(),
        sizeF: rng(),                               // 0..1 size factor
        colorIdx: Math.floor(rng() * cfg.COLORS.length)
      });
    }
    return pool;
  };

  /**
   * Tally a Realtime DB claims map ({coinId: uid}) into a ranking, naming each
   * player from the players map ({uid: name}). Ties broken by uid for stability.
   * @param {Object<string,string>} claims
   * @param {Object<string,string>} players
   * @returns {Array<{uid:string, name:string, score:number, rank:number}>}
   */
  CoinRush.tallyClaims = function (claims, players) {
    claims = claims || {};
    players = players || {};
    const counts = {};
    for (const coinId in claims) {
      const uid = claims[coinId];
      if (uid) counts[uid] = (counts[uid] || 0) + 1;
    }
    const arr = Object.keys(counts).map(uid => ({
      uid: uid,
      name: players[uid] || 'Anonymous',
      score: counts[uid]
    }));
    arr.sort((a, b) => (b.score - a.score) || String(a.uid).localeCompare(String(b.uid)));
    return arr.map((d, i) => Object.assign({}, d, { rank: i + 1 }));
  };

  // Export for both browser (window.CoinRush) and Node/CommonJS (tests).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoinRush;
  }
  global.CoinRush = CoinRush;
})(typeof window !== 'undefined' ? window : globalThis);
