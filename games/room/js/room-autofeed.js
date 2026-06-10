/* ============================================================
   Auto-Feeder logic — pure & dependency-free.
   Runs as a browser global (other room scripts call these
   names bare) AND as a Node module for tests.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  for (const k in api) { if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Lowest coins-per-restore-point across an items array (most cost-efficient).
  function bestCoinsPerPoint(items) {
    let best = Infinity;
    for (const it of items) {
      if (it.restore > 0) best = Math.min(best, it.cost / it.restore);
    }
    return best;
  }

  // Coins to refill one stat from `current` up to `target` at `rate` coins/point.
  function statRefillCost(current, target, rate) {
    return Math.ceil(Math.max(0, target - current) * rate);
  }

  // Live tick: refill hunger/thirst that are at/below threshold, if affordable.
  // pet: { hunger, thirst }. Returns { hunger, thirst, coinsSpent }.
  function liveRefillPlan(pet, coins, foodRate, drinkRate, opts) {
    const threshold = opts.threshold, target = opts.target;
    let hunger = pet.hunger != null ? pet.hunger : target;
    let thirst = pet.thirst != null ? pet.thirst : target;
    let remaining = coins, spent = 0;
    if (hunger <= threshold) {
      const c = statRefillCost(hunger, target, foodRate);
      if (remaining >= c) { remaining -= c; spent += c; hunger = target; }
    }
    if (thirst <= threshold) {
      const c = statRefillCost(thirst, target, drinkRate);
      if (remaining >= c) { remaining -= c; spent += c; thirst = target; }
    }
    return { hunger: hunger, thirst: thirst, coinsSpent: spent };
  }

  // Offline catch-up: fund pets in order to `target`; unaffordable pets take
  // normal decay + starvation. Returns { pets:[{hunger,thirst,affection}], coinsSpent }.
  function planOfflineAutoFeed(opts) {
    const pets = opts.pets, decay = opts.decay, target = opts.target;
    const foodRate = opts.foodRate, drinkRate = opts.drinkRate, starveLoss = opts.starveLoss;
    if (!(decay > 0)) {
      return { pets: pets.map(p => ({ hunger: p.hunger, thirst: p.thirst, affection: p.affection })), coinsSpent: 0 };
    }
    const petCost = Math.ceil(decay * foodRate + decay * drinkRate);
    let remaining = opts.coins, spent = 0;
    const out = pets.map(p => {
      if (remaining >= petCost) {
        remaining -= petCost; spent += petCost;
        return { hunger: target, thirst: target, affection: p.affection };
      }
      const hunger = Math.max(0, p.hunger - decay);
      const thirst = Math.max(0, p.thirst - decay);
      const starveCycles = Math.max(0, decay - p.hunger);
      const affection = Math.max(0, p.affection - starveCycles * starveLoss);
      return { hunger: hunger, thirst: thirst, affection: affection };
    });
    return { pets: out, coinsSpent: spent };
  }

  return { bestCoinsPerPoint, statRefillCost, liveRefillPlan, planOfflineAutoFeed };
});
