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
    const herd = opts.animals.length;
    const foodAt = opts.foodAt != null && opts.foodAt <= now ? opts.foodAt : now;
    const elapsedDays = (now - foodAt) / DAY_MS;
    const demandPerDay = herd * opts.foodPerDay;
    const fedDays = demandPerDay > 0 ? Math.min(elapsedDays, opts.foodStock / demandPerDay) : elapsedDays;
    const hungryDays = elapsedDays - fedDays;
    const foodStock = Math.max(0, opts.foodStock - elapsedDays * demandPerDay);

    const spawns = [];
    const animals = opts.animals.map(a => {
      const happiness = Math.max(0, Math.min(100,
        a.happiness + fedDays * opts.gainPerDay - hungryDays * opts.decayPerDay));
      const last = a.lastDropTime != null ? a.lastDropTime : now;
      if (last > now) return Object.assign({}, a, { happiness: happiness, lastDropTime: now }); // clock skew
      const cycle = farmCycleMs(happiness, opts.slowMs, opts.fastMs);
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

  return { farmCycleMs, planFarmTick, farmRefillUnits };
});
