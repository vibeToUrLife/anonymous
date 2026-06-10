/* ============================================================
   Farm logic — pure & dependency-free.
   Animals produce coin drops on a happiness-driven timer; petting
   raises happiness, neglect decays it. Runs as a browser global
   (other room scripts call these names bare) AND as a Node module
   for tests. All tuning constants are passed in by the caller
   (FARM_* in room-base.js).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  for (const k in api) { if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Production cycle length for a happiness level: linear slowMs → fastMs.
  function farmCycleMs(happiness, slowMs, fastMs) {
    const h = Math.max(0, Math.min(100, happiness)) / 100;
    return slowMs + (fastMs - slowMs) * h;
  }

  // Happiness after lazy decay since `happyAt` (fractional days), floored at 0.
  // Missing or future anchors decay nothing (first run / clock skew).
  function decayedHappiness(happiness, happyAt, now, decayPerDay) {
    if (happyAt == null || happyAt > now) return happiness;
    const days = (now - happyAt) / 86400000;
    return Math.max(0, happiness - days * decayPerDay);
  }

  // Pet an animal: apply pending decay, then boost (capped 100) and stamp the
  // pet/decay anchors. Returns the updated copy, or null while on cooldown.
  function applyPet(animal, now, opts) {
    if (animal.lastPet != null && now - animal.lastPet < opts.cooldownMs) return null;
    const h = decayedHappiness(animal.happiness, animal.happyAt, now, opts.decayPerDay);
    return Object.assign({}, animal, {
      happiness: Math.min(100, h + opts.boost),
      lastPet: now,
      happyAt: now,
    });
  }

  // Advance every animal's production clock to `now`.
  // dropCounts: { [animalId]: uncollected drops on the ground }.
  // Spawns are capped at dropCap per animal; excess cycles are lost (the clock
  // still advances, so a full animal can't bank production). Serves both the
  // offline catch-up on load and the live tick while the farm is open.
  // Returns { spawns: [{ animalId, type }], animals: updated copies }.
  function planFarmProduction(opts) {
    const spawns = [];
    const animals = opts.animals.map(a => {
      const last = a.lastDropTime != null ? a.lastDropTime : opts.now;
      if (last > opts.now) return Object.assign({}, a, { lastDropTime: opts.now }); // clock skew
      const h = decayedHappiness(a.happiness, a.happyAt, opts.now, opts.decayPerDay);
      const cycle = farmCycleMs(h, opts.slowMs, opts.fastMs);
      const cycles = Math.floor((opts.now - last) / cycle);
      if (cycles <= 0) return a;
      const capacity = Math.max(0, opts.dropCap - (opts.dropCounts[a.id] || 0));
      for (let i = 0; i < Math.min(cycles, capacity); i++) spawns.push({ animalId: a.id, type: a.type });
      return Object.assign({}, a, { lastDropTime: last + cycles * cycle });
    });
    return { spawns: spawns, animals: animals };
  }

  return { farmCycleMs, decayedHappiness, applyPet, planFarmProduction };
});
