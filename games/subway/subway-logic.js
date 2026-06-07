/**
 * subway-logic.js — Pure, framework-free game logic for the Subway Dash runner.
 *
 * This is the refactor of the old Lane Racer "thread the open lane" game into a
 * Subway-Surfers-style endless runner: the player runs down 3 train-track lanes
 * and survives obstacle rows by SWITCHING LANES, JUMPING over low barriers, or
 * ROLLING under high barriers. Trains (tall blocks) can only be dodged by a lane
 * change.
 *
 * Everything here is deterministic (or accepts an injectable RNG) so it stays
 * easy to reason about in isolation. The HTML game shell
 * (games/subway-dash.html) only handles rendering, input, audio and Firebase.
 *
 * All tunable values (speeds, prices, catalogs, obstacle odds) live here as named
 * config so they are easy to audit and balance in one place.
 */
(function (global) {
  'use strict';

  const SubwayLogic = {};

  /** Fixed number of lanes (train tracks). */
  SubwayLogic.LANES = 3;

  /**
   * Obstacle cell kinds placed in a lane (or null for a clear lane):
   *  - 'low'   : a barrier you must JUMP over (crash if grounded in that lane).
   *  - 'high'  : an overhead barrier — clear it by ROLLING under OR JUMPING over it
   *              (crash only if you do neither).
   *  - 'train' : a carriage you ride ON TOP of. Board it at the FRONT (jump on or run
   *              up the ramp), ride the roof, come down the back slope, or change lanes.
   *              The shell tracks this as an `onTrain` state; touching a carriage while
   *              NOT riding it (e.g. sliding into its side) crashes.
   */
  SubwayLogic.CELL = { LOW: 'low', HIGH: 'high', TRAIN: 'train' };

  /**
   * Difficulty presets.
   *  - baseSpeed   : starting scroll speed (px/sec).
   *  - rampPerSec  : how much the speed grows each second survived.
   *  - maxSpeed    : hard cap so the game stays (barely) playable.
   *  - coinMult    : reward multiplier — Hard pays more for the higher risk.
   *  - rowGap      : vertical spacing factor between obstacle rows (smaller = tighter).
   *  - obsChance   : per non-safe lane, odds of spawning any obstacle.
   *  - trainChance : among obstacles, share that become un-dodgeable trains.
   *  - safeObsChance: odds the guaranteed-reachable lane carries a jump/roll obstacle.
   */
  SubwayLogic.DIFFICULTIES = {
    easy:   { id: 'easy',   label: 'Easy',   baseSpeed: 150, rampPerSec: 1.2, maxSpeed: 320, coinMult: 1.0, rowGap: 0.42, obsChance: 0.30, trainChance: 0.16, safeObsChance: 0.12 },
    normal: { id: 'normal', label: 'Normal', baseSpeed: 200, rampPerSec: 2.0, maxSpeed: 460, coinMult: 1.3, rowGap: 0.36, obsChance: 0.40, trainChance: 0.24, safeObsChance: 0.20 },
    hard:   { id: 'hard',   label: 'Hard',   baseSpeed: 260, rampPerSec: 3.0, maxSpeed: 600, coinMult: 1.8, rowGap: 0.30, obsChance: 0.52, trainChance: 0.34, safeObsChance: 0.30 }
  };

  /** Safely resolve a difficulty config, defaulting to Normal for unknown ids. */
  SubwayLogic.getDifficulty = function (diffId) {
    return SubwayLogic.DIFFICULTIES[diffId] || SubwayLogic.DIFFICULTIES.normal;
  };

  /** Scroll speed (px/sec) after `elapsedSec` seconds for a given difficulty. */
  SubwayLogic.speedAt = function (diffId, elapsedSec) {
    const d = SubwayLogic.getDifficulty(diffId);
    const t = Math.max(0, elapsedSec || 0);
    return Math.min(d.maxSpeed, d.baseSpeed + d.rampPerSec * t);
  };

  /**
   * Build one obstacle row.
   *
   * FAIRNESS GUARANTEE: exactly one lane — the "safe lane" — is always survivable
   * and is kept within ±1 of the previous safe lane, so a continuous, reachable
   * corridor exists across consecutive rows. The safe lane is never a train (so it
   * can always be handled with at most a single jump/roll, or just by being there).
   * Every other lane is independently randomised into clear / low / high / train.
   *
   * @param {function} [rng] injectable () => [0,1) for deterministic tests.
   * @param {number} [prevSafe] previous row's safe lane (corridor anchor).
   * @param {object} [opts] {obsChance, trainChance, safeObsChance} — usually a
   *        difficulty preset; missing fields fall back to Normal.
   * @returns {{cells: Array<?string>, safeLane: number}}
   */
  SubwayLogic.makeObstacleRow = function (rng, prevSafe, opts) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    const cfg = opts || SubwayLogic.DIFFICULTIES.normal;
    const obsChance     = typeof cfg.obsChance === 'number' ? cfg.obsChance : 0.58;
    const trainChance   = typeof cfg.trainChance === 'number' ? cfg.trainChance : 0.30;
    const safeObsChance = typeof cfg.safeObsChance === 'number' ? cfg.safeObsChance : 0.32;

    // Safe lane: within ±1 of the previous one when supplied.
    let safeLane;
    if (typeof prevSafe === 'number' && prevSafe >= 0 && prevSafe < SubwayLogic.LANES) {
      const candidates = [];
      for (let i = 0; i < SubwayLogic.LANES; i++) {
        if (Math.abs(i - prevSafe) <= 1) candidates.push(i);
      }
      safeLane = candidates[Math.floor(rand() * candidates.length) % candidates.length];
    } else {
      safeLane = Math.floor(rand() * SubwayLogic.LANES) % SubwayLogic.LANES;
    }

    const cells = new Array(SubwayLogic.LANES).fill(null);
    for (let i = 0; i < SubwayLogic.LANES; i++) {
      if (i === safeLane) {
        // Safe lane only ever gets a single-action obstacle (jump or roll), never a train.
        if (rand() < safeObsChance) cells[i] = rand() < 0.5 ? SubwayLogic.CELL.LOW : SubwayLogic.CELL.HIGH;
      } else if (rand() < obsChance) {
        const r = rand();
        if (r < trainChance) cells[i] = SubwayLogic.CELL.TRAIN;
        else cells[i] = (r < trainChance + (1 - trainChance) / 2) ? SubwayLogic.CELL.LOW : SubwayLogic.CELL.HIGH;
      }
    }
    return { cells: cells, safeLane: safeLane };
  };

  /** The obstacle kind sitting in `lane` for a row (or null). */
  SubwayLogic.cellAt = function (row, lane) {
    return row && row.cells ? (row.cells[lane] || null) : null;
  };

  /**
   * True if a player in `lane` with the given motion state hits the obstacle.
   * @param {object} row
   * @param {number} lane
   * @param {{airborne?:boolean, rolling?:boolean, onTrain?:boolean}} [state]
   */
  SubwayLogic.isCrash = function (row, lane, state) {
    const cell = SubwayLogic.cellAt(row, lane);
    if (!cell) return false;
    const airborne = !!(state && state.airborne);
    const rolling  = !!(state && state.rolling);
    const onTrain  = !!(state && state.onTrain);
    if (cell === SubwayLogic.CELL.TRAIN) return !onTrain;             // must be riding the roof (board at the front)
    if (cell === SubwayLogic.CELL.LOW)   return !airborne;             // must be jumping
    if (cell === SubwayLogic.CELL.HIGH)  return !rolling && !airborne; // roll under OR jump over
    return false;
  };

  /**
   * Near miss = you survived a row that demanded skill: either you cleared an
   * obstacle in your own lane with a jump/roll, or you skimmed a train in an
   * adjacent lane. Pays a bonus. Returns false if the pass was a crash.
   */
  SubwayLogic.isNearMiss = function (row, lane, state) {
    if (!row || SubwayLogic.isCrash(row, lane, state)) return false;
    if (SubwayLogic.cellAt(row, lane)) return true; // cleared an obstacle in-lane
    for (let i = 0; i < SubwayLogic.LANES; i++) {
      if (Math.abs(i - lane) === 1 && SubwayLogic.cellAt(row, i)) return true;
    }
    return false;
  };

  /** Coins earned for clearing a single row (rounded, never negative). */
  SubwayLogic.coinsForPass = function (diffId, nearMiss) {
    const d = SubwayLogic.getDifficulty(diffId);
    const base = 1;
    const bonus = nearMiss ? 2 : 0;
    return Math.max(0, Math.round((base + bonus) * d.coinMult));
  };

  /** Score points for clearing a row (distance-style scoring). */
  SubwayLogic.scoreForPass = function (nearMiss) {
    return nearMiss ? 15 : 10;
  };

  // ── Shop catalogs ────────────────────────────────────────────────────────

  /** Runner characters. `body` = outfit, `accent` = trim, `skin` = skin tone.
   *  Price 0 = owned by default. 'classic' is the DEFAULT_SKIN — keep that id. */
  SubwayLogic.SKINS = [
    { id: 'classic', name: 'Rookie',     price: 0,   body: '#e63946', accent: '#ffd166', skin: '#f1c27d', hair: '#3a2417' },
    { id: 'jet',     name: 'Jet',        price: 120, body: '#2b2d42', accent: '#ef233c', skin: '#c68642', hair: '#141414' },
    { id: 'mint',    name: 'Mint',       price: 150, body: '#06d6a0', accent: '#073b4c', skin: '#ffdbac', hair: '#5a3825' },
    { id: 'blaze',   name: 'Blaze',      price: 180, body: '#ff5400', accent: '#ffd000', skin: '#8d5524', hair: '#1a1a1a' },
    { id: 'orchid',  name: 'Orchid',     price: 220, body: '#9b5de5', accent: '#f15bb5', skin: '#f1c27d', hair: '#ffb3e6' },
    { id: 'frost',   name: 'Frost',      price: 260, body: '#48cae4', accent: '#caf0f8', skin: '#e0b07a', hair: '#f1faff' },
    { id: 'onyx',    name: 'Onyx',       price: 330, body: '#22223b', accent: '#9a8c98', skin: '#7a5230', hair: '#2b2b2b' },
    { id: 'gold',    name: 'Gold Elite', price: 450, body: '#f7c97e', accent: '#fff3b0', skin: '#c68642', hair: '#caa24a', cap: true }
  ];

  /** Trail effects drawn behind the runner. Price 0 = owned by default.
   *  'none' is the DEFAULT_EFFECT — keep that id. */
  SubwayLogic.EFFECTS = [
    { id: 'none',    name: 'No Trail',  price: 0,   color: null },
    { id: 'embers',  name: 'Embers',    price: 120, color: '#ff7b00' },
    { id: 'bubbles', name: 'Bubbles',   price: 160, color: '#4cc9f0' },
    { id: 'golddust',name: 'Gold Dust', price: 200, color: '#ffd166' },
    { id: 'toxic',   name: 'Toxic',     price: 240, color: '#80ed99' },
    { id: 'rainbow', name: 'Rainbow',   price: 320, color: 'rainbow' }
  ];

  /** Consumable power-up items, bought with room coins and used during a run. */
  SubwayLogic.ITEMS = {
    shield:  { id: 'shield',  name: 'Hoverboard', price: 60, icon: '🛹', desc: 'Deploy: survive one crash' },
    slowmo:  { id: 'slowmo',  name: 'Slow-Mo',    price: 50, icon: '🐢', desc: 'Slow time for 5s' },
    magnet:  { id: 'magnet',  name: 'Coin Magnet', price: 50, icon: '🧲', desc: 'Auto-grab coins for 6s' },
    doubler: { id: 'doubler', name: '2× Coins',   price: 55, icon: '✨', desc: 'Double coins for 8s' }
  };

  /** Ordered list of item ids for stable UI rendering. */
  SubwayLogic.ITEM_ORDER = ['shield', 'slowmo', 'magnet', 'doubler'];

  // ── Purchase helpers (pure) ──────────────────────────────────────────────

  SubwayLogic.canAfford = function (coins, price) {
    return (coins || 0) >= (price || 0);
  };

  /**
   * Attempt to buy a catalog item (skin or effect).
   * @returns {{ok:boolean, reason?:string, coins?:number, owned?:string[], item?:object}}
   */
  SubwayLogic.buyCatalogItem = function (state, catalog, id) {
    const item = catalog.find(function (c) { return c.id === id; });
    if (!item) return { ok: false, reason: 'not_found' };
    const owned = state.owned || [];
    if (owned.indexOf(id) !== -1) return { ok: false, reason: 'owned' };
    if (!SubwayLogic.canAfford(state.coins, item.price)) return { ok: false, reason: 'insufficient' };
    return { ok: true, coins: state.coins - item.price, owned: owned.concat([id]), item: item };
  };

  /**
   * Attempt to buy a consumable power-up item.
   * @returns {{ok:boolean, reason?:string, coins?:number, qty?:number}}
   */
  SubwayLogic.buyItem = function (coins, itemId, qty) {
    const it = SubwayLogic.ITEMS[itemId];
    if (!it) return { ok: false, reason: 'not_found' };
    const q = Math.max(1, qty || 1);
    const cost = it.price * q;
    if (!SubwayLogic.canAfford(coins, cost)) return { ok: false, reason: 'insufficient' };
    return { ok: true, coins: coins - cost, qty: q };
  };

  // Export for both browser (window.SubwayLogic) and Node/CommonJS.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubwayLogic;
  }
  global.SubwayLogic = SubwayLogic;
})(typeof window !== 'undefined' ? window : globalThis);
