/**
 * car-logic.js — Pure, framework-free game logic for the Lane Racer car game.
 *
 * Everything here is deterministic (or accepts an injectable RNG) so it can be
 * unit-tested in isolation (see tests/test-car-racing.html). The HTML game shell
 * (games/car-racing.html) only handles rendering, input, audio and Firebase.
 *
 * No hardcoded magic numbers are scattered through the game shell — all tunable
 * values (speeds, prices, catalogs) live here as named config so they are easy to
 * audit and balance in one place.
 */
(function (global) {
  'use strict';

  const CarLogic = {};

  /** Fixed number of lanes on the road. The core rule: each obstacle row blocks
   *  exactly (LANES - 1) lanes, leaving a single open lane to thread through. */
  CarLogic.LANES = 3;

  /**
   * Difficulty presets.
   *  - baseSpeed : starting scroll speed (px/sec).
   *  - rampPerSec: how much the speed grows each second survived.
   *  - maxSpeed  : hard cap so the game stays (barely) playable.
   *  - coinMult  : reward multiplier — Hard pays more for the higher risk.
   *  - rowGap    : vertical spacing factor between obstacle rows (smaller = tighter).
   */
  CarLogic.DIFFICULTIES = {
    easy:   { id: 'easy',   label: 'Easy',   baseSpeed: 200, rampPerSec: 2.0, maxSpeed: 620,  coinMult: 1.0, rowGap: 2.2 },
    normal: { id: 'normal', label: 'Normal', baseSpeed: 280, rampPerSec: 3.5, maxSpeed: 820,  coinMult: 1.3, rowGap: 1.9 },
    hard:   { id: 'hard',   label: 'Hard',   baseSpeed: 360, rampPerSec: 5.0, maxSpeed: 1040, coinMult: 1.8, rowGap: 1.6 }
  };

  /** Safely resolve a difficulty config, defaulting to Normal for unknown ids. */
  CarLogic.getDifficulty = function (diffId) {
    return CarLogic.DIFFICULTIES[diffId] || CarLogic.DIFFICULTIES.normal;
  };

  /** Scroll speed (px/sec) after `elapsedSec` seconds for a given difficulty. */
  CarLogic.speedAt = function (diffId, elapsedSec) {
    const d = CarLogic.getDifficulty(diffId);
    const t = Math.max(0, elapsedSec || 0);
    return Math.min(d.maxSpeed, d.baseSpeed + d.rampPerSec * t);
  };

  /**
   * Build one obstacle row. Exactly one lane is open; the rest are blocked.
   *
   * IMPORTANT: when `prevOpenLane` is provided, the new open lane is constrained
   * to be within 1 lane of it. This guarantees a continuous, reachable corridor
   * across consecutive rows — otherwise it is possible for the player to face an
   * unwinnable two-step (e.g. open=0 then open=2) when both rows are on screen.
   *
   * Accepts an optional RNG (() => [0,1)) for deterministic testing.
   */
  CarLogic.makeObstacleRow = function (rng, prevOpenLane) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    let openLane;
    if (typeof prevOpenLane === 'number' && prevOpenLane >= 0 && prevOpenLane < CarLogic.LANES) {
      // Candidate set = lanes within ±1 of the previous open lane.
      const candidates = [];
      for (let i = 0; i < CarLogic.LANES; i++) {
        if (Math.abs(i - prevOpenLane) <= 1) candidates.push(i);
      }
      openLane = candidates[Math.floor(rand() * candidates.length) % candidates.length];
    } else {
      openLane = Math.floor(rand() * CarLogic.LANES) % CarLogic.LANES;
    }
    const blocked = [];
    for (let i = 0; i < CarLogic.LANES; i++) {
      if (i !== openLane) blocked.push(i);
    }
    return { openLane: openLane, blocked: blocked };
  };

  /** True if a car sitting in `laneIndex` would hit a block in this row. */
  CarLogic.isCrash = function (row, laneIndex) {
    return !!row && row.blocked.indexOf(laneIndex) !== -1;
  };

  /** True when the open lane is directly next to where the car currently sits —
   *  i.e. the player squeezed past with a block in an adjacent lane (near miss). */
  CarLogic.isNearMiss = function (row, laneIndex) {
    if (!row || CarLogic.isCrash(row, laneIndex)) return false;
    return Math.abs(row.openLane - laneIndex) >= 1
      ? false
      : row.blocked.some(function (b) { return Math.abs(b - laneIndex) === 1; });
  };

  /** Coins earned for clearing a single row (rounded, never negative). */
  CarLogic.coinsForPass = function (diffId, nearMiss) {
    const d = CarLogic.getDifficulty(diffId);
    const base = 1;
    const bonus = nearMiss ? 2 : 0;
    return Math.max(0, Math.round((base + bonus) * d.coinMult));
  };

  /** Score points for clearing a row (distance-style scoring). */
  CarLogic.scoreForPass = function (nearMiss) {
    return nearMiss ? 15 : 10;
  };

  // ── Shop catalogs ────────────────────────────────────────────────────────

  /** Car skins. `body`/`accent` are canvas colors. Price 0 = owned by default. */
  CarLogic.SKINS = [
    { id: 'classic',  name: 'Classic Red',   price: 0,   body: '#e63946', accent: '#ffd166', window: '#1d3557' },
    { id: 'midnight', name: 'Midnight Blue',  price: 120, body: '#1d3557', accent: '#a8dadc', window: '#0b1d2a' },
    { id: 'lime',     name: 'Lime Bolt',      price: 150, body: '#80ed99', accent: '#22577a', window: '#1b4332' },
    { id: 'sunset',   name: 'Sunset Orange',  price: 180, body: '#ff7b00', accent: '#ffd60a', window: '#6a3500' },
    { id: 'violet',   name: 'Violet Storm',   price: 220, body: '#7b2cbf', accent: '#e0aaff', window: '#3c096c' },
    { id: 'gold',     name: 'Golden GT',      price: 350, body: '#f7c97e', accent: '#fff3b0', window: '#5c4400' }
  ];

  /** Trail effects drawn behind the car. Price 0 = owned by default. */
  CarLogic.EFFECTS = [
    { id: 'none',     name: 'No Trail',     price: 0,   color: null },
    { id: 'flames',   name: 'Flame Trail',  price: 150, color: '#ff7b00' },
    { id: 'sparkles', name: 'Sparkle Trail',price: 180, color: '#ffd166' },
    { id: 'neon',     name: 'Neon Trail',   price: 200, color: '#4cc9f0' },
    { id: 'rainbow',  name: 'Rainbow Trail',price: 300, color: 'rainbow' }
  ];

  /** Consumable power-up items, bought with room coins and used during a run. */
  CarLogic.ITEMS = {
    shield: { id: 'shield', name: 'Shield',  price: 60, icon: '🛡️', desc: 'Survive one crash' },
    slowmo: { id: 'slowmo', name: 'Slow-Mo', price: 50, icon: '🐢', desc: 'Slow time for 5s' },
    magnet: { id: 'magnet', name: 'Magnet',  price: 50, icon: '🧲', desc: 'Auto-grab coins for 6s' }
  };

  /** Ordered list of item ids for stable UI rendering. */
  CarLogic.ITEM_ORDER = ['shield', 'slowmo', 'magnet'];

  // ── Purchase helpers (pure) ──────────────────────────────────────────────

  CarLogic.canAfford = function (coins, price) {
    return (coins || 0) >= (price || 0);
  };

  /**
   * Attempt to buy a catalog item (skin or effect).
   * @param {{coins:number, owned:string[]}} state
   * @param {Array} catalog  CarLogic.SKINS or CarLogic.EFFECTS
   * @param {string} id
   * @returns {{ok:boolean, reason?:string, coins?:number, owned?:string[], item?:object}}
   */
  CarLogic.buyCatalogItem = function (state, catalog, id) {
    const item = catalog.find(function (c) { return c.id === id; });
    if (!item) return { ok: false, reason: 'not_found' };
    const owned = state.owned || [];
    if (owned.indexOf(id) !== -1) return { ok: false, reason: 'owned' };
    if (!CarLogic.canAfford(state.coins, item.price)) return { ok: false, reason: 'insufficient' };
    return { ok: true, coins: state.coins - item.price, owned: owned.concat([id]), item: item };
  };

  /**
   * Attempt to buy a consumable power-up item.
   * @returns {{ok:boolean, reason?:string, coins?:number, qty?:number}}
   */
  CarLogic.buyItem = function (coins, itemId, qty) {
    const it = CarLogic.ITEMS[itemId];
    if (!it) return { ok: false, reason: 'not_found' };
    const q = Math.max(1, qty || 1);
    const cost = it.price * q;
    if (!CarLogic.canAfford(coins, cost)) return { ok: false, reason: 'insufficient' };
    return { ok: true, coins: coins - cost, qty: q };
  };

  // Export for both browser (window.CarLogic) and Node/CommonJS (tests/tools).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CarLogic;
  }
  global.CarLogic = CarLogic;
})(typeof window !== 'undefined' ? window : globalThis);
