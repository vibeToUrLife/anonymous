/* ============================================================
   Farm logic — pure & dependency-free.
   All animals share one food trough: while it has food they get
   happier, when it runs dry happiness decays. Happiness drives
   the production cycle that spawns coin drops. Runs as a browser
   global (other room scripts call these names bare) AND as a Node
   module for tests. All tuning constants are passed in by the
   caller (FARM_* in room-base.js).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  for (const k in api) { if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DAY_MS = 86400000;

  // Production cycle length for a happiness level: linear slowMs → fastMs.
  function farmCycleMs(happiness, slowMs, fastMs) {
    const h = Math.max(0, Math.min(100, happiness)) / 100;
    return slowMs + (fastMs - slowMs) * h;
  }

  // Animal level (1-based) from how many drops it has produced over its life.
  // `levels` is an ascending array of collected-count thresholds.
  function animalLevel(collected, levels) {
    let lvl = 1;
    for (let i = 0; i < levels.length; i++) if ((collected || 0) >= levels[i]) lvl = i + 1;
    return lvl;
  }

  // Stable string hash (same as the daily-riddle pick) for deterministic seeds.
  function _hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  // Tiny seeded PRNG (LCG) so a day maps to the same orders for everyone.
  function _seededRng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Deterministic daily delivery orders. `products` is [{id, coins}] of eligible
  // goods. Each order asks for 1-2 products (qty 1-3) and pays raw value × markup
  // plus a flat bonus. Same (seedStr, products) → identical orders.
  function generateFarmOrders(seedStr, products, count, markup, bonus) {
    const rng = _seededRng(_hashStr(seedStr + 'orders'));
    const orders = [];
    for (let o = 0; o < count; o++) {
      const pool = products.slice();
      const n = Math.min(pool.length, 1 + Math.floor(rng() * 2));
      const items = [];
      let raw = 0;
      for (let k = 0; k < n; k++) {
        const prod = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        const qty = 1 + Math.floor(rng() * 3);
        items.push({ id: prod.id, qty: qty });
        raw += qty * prod.coins;
      }
      orders.push({ items: items, reward: Math.ceil(raw * (markup || 1.4)) + (bonus || 0) });
    }
    return orders;
  }

  // Crop growth fraction 0..1 from planting time to ripe.
  function cropProgress(plantedAt, now, growMs) {
    if (plantedAt == null || !(growMs > 0)) return 0;
    return Math.max(0, Math.min(1, (now - plantedAt) / growMs));
  }

  // Number of grid rows a plot count occupies (rows of `perRow`). 0 → 0.
  function farmRowCount(plotCount, perRow) {
    return Math.ceil((plotCount || 0) / perRow);
  }

  // Owned plot indices in grid row `row` (rows of `perRow`), bounded by
  // plotCount. Empty array if the row owns no plots (partial/last row).
  function farmRowIndices(plotCount, row, perRow) {
    const out = [], start = row * perRow, end = Math.min(start + perRow, plotCount || 0);
    for (let i = start; i < end; i++) out.push(i);
    return out;
  }

  // State of one garden row from its plot objects.
  //   rowPlots : [{ crop, plantedAt }] — the plots owned in this row
  //   crops    : FARM_CROPS-shaped [{ id, growMs }]
  //   now      : Date.now()
  // 'ripe' if any planted plot is fully grown; 'growing' if planted but none
  // ripe; 'empty' if no plot has a crop. cropId = first planted plot's crop
  // (row label). progress = min progress of growing plots; msLeft = max time left.
  function farmRowState(rowPlots, crops, now) {
    let cropId = null, anyRipe = false, msLeft = 0, minProg = 1;
    for (const p of rowPlots) {
      if (!p || !p.crop) continue;
      if (cropId == null) cropId = p.crop;
      const c = crops.find(x => x.id === p.crop);
      if (!c) continue;
      const prog = cropProgress(p.plantedAt, now, c.growMs);
      if (prog >= 1) anyRipe = true;
      else { msLeft = Math.max(msLeft, c.growMs - (now - p.plantedAt)); minProg = Math.min(minProg, prog); }
    }
    if (cropId == null) return { state: 'empty', cropId: null, progress: 0, msLeft: 0 };
    if (anyRipe) return { state: 'ripe', cropId: cropId, progress: 1, msLeft: 0 };
    return { state: 'growing', cropId: cropId, progress: minProg, msLeft: msLeft };
  }

  // How many empty plots you can afford to plant with a given seed.
  function farmAffordableCount(coins, seedCost, emptyCount) {
    const byCoins = seedCost > 0 ? Math.floor(coins / seedCost) : emptyCount;
    return Math.max(0, Math.min(emptyCount, byCoins));
  }

  // Total coins for selling an entire stock; prices maps product id → unit coins.
  function farmSellAllValue(stock, prices) {
    let total = 0;
    for (const k in stock) total += (stock[k] || 0) * (prices[k] || 0);
    return total;
  }

  // Advance the whole farm from its last accounting to `now`:
  //   1. The herd eats from the shared trough (foodPerDay units per animal).
  //      Fed time raises every animal's happiness by gainPerDay; once the
  //      trough is empty the rest of the window decays it by decayPerDay.
  //   2. Each animal's production clock advances at the speed of its updated
  //      happiness. Spawns are capped at dropCap per animal (counting the
  //      uncollected drops in dropCounts); excess cycles are lost — the clock
  //      still advances, so a full animal can't bank production.
  // Serves both the offline catch-up on load and the live tick while open.
  // Returns { animals, foodStock, foodAt, spawns: [{ animalId, type }] }.
  function planFarmTick(opts) {
    const now = opts.now;
    // Optional cap: only count production/feeding within the last capMs. Used by the
    // offline "while you were away" window so animals bank at most capMs of produce.
    const earliest = now - (opts.capMs != null ? opts.capMs : Infinity);
    const herd = opts.animals.length;
    let foodAt = opts.foodAt != null && opts.foodAt <= now ? opts.foodAt : now;
    if (foodAt < earliest) foodAt = earliest;
    const elapsedDays = (now - foodAt) / DAY_MS;
    const demandPerDay = herd * opts.foodPerDay;
    const fedDays = demandPerDay > 0 ? Math.min(elapsedDays, opts.foodStock / demandPerDay) : elapsedDays;
    const hungryDays = elapsedDays - fedDays;
    const foodStock = Math.max(0, opts.foodStock - elapsedDays * demandPerDay);

    const spawns = [];
    const animals = opts.animals.map(a => {
      const happiness = Math.max(0, Math.min(100,
        a.happiness + fedDays * opts.gainPerDay - hungryDays * opts.decayPerDay));
      let last = a.lastDropTime != null ? a.lastDropTime : now;
      if (last > now) return Object.assign({}, a, { happiness: happiness, lastDropTime: now }); // clock skew
      if (last < earliest) last = earliest;   // cap the catch-up window (capMs)
      // Higher-level animals produce faster (cycle shortened by levelSpeedup/level).
      const level = animalLevel(a.collected, opts.levels || [0]);
      const speedMult = 1 + (opts.levelSpeedup || 0) * (level - 1);
      const cycle = farmCycleMs(happiness, opts.slowMs, opts.fastMs) / speedMult;
      const cycles = Math.floor((now - last) / cycle);
      if (cycles <= 0) return Object.assign({}, a, { happiness: happiness });
      const capacity = Math.max(0, opts.dropCap - (opts.dropCounts[a.id] || 0));
      for (let i = 0; i < Math.min(cycles, capacity); i++) spawns.push({ animalId: a.id, type: a.type });
      return Object.assign({}, a, { happiness: happiness, lastDropTime: last + cycles * cycle });
    });
    return { animals: animals, foodStock: foodStock, foodAt: now, spawns: spawns };
  }

  // Whole units a refill adds: fill the trough, bounded by what the coins afford.
  // Both bounds are floored so the result is always an integer — otherwise the
  // fractional capacity gap (foodStock is a float) would charge fractional coins.
  function farmRefillUnits(foodStock, foodMax, coins, costPerUnit) {
    return Math.max(0, Math.min(Math.floor(foodMax - foodStock), Math.floor(coins / costPerUnit)));
  }

  return { farmCycleMs, animalLevel, cropProgress, generateFarmOrders, farmSellAllValue, planFarmTick, farmRefillUnits, farmRowCount, farmRowIndices, farmRowState, farmAffordableCount };
});
