/* ============================================================
   Aquarium logic — pure & dependency-free.
   Completion math over the Fishing species list. Runs as a browser
   global (room scripts call these names bare) AND as a Node module
   for tests. FISH_TYPES is passed in by the caller (it lives in the
   shared fish-render.js at runtime).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  for (const k in api) { if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const RARITY_TIERS = ['common', 'rare', 'epic', 'legendary'];

  // The species a player can collect (everything except junk).
  function catchableSpecies(fishTypes) {
    return fishTypes.filter(f => f.rarity !== 'junk');
  }

  // Completion summary for a placed-fish list against the species registry.
  // Returns { placed, total, pct, byRarity: {tier:{placed,total}}, trash:{placed,total} }.
  // Junk species are excluded from the core total and tracked under `trash`.
  function aquariumCompletion(aquariumFish, fishTypes) {
    const placedSet = new Set(aquariumFish || []);
    const byRarity = {};
    for (const tier of RARITY_TIERS) byRarity[tier] = { placed: 0, total: 0 };
    const trash = { placed: 0, total: 0 };
    let placed = 0, total = 0;
    for (const f of fishTypes) {
      const isPlaced = placedSet.has(f.name);
      if (f.rarity === 'junk') {
        trash.total++;
        if (isPlaced) trash.placed++;
        continue;
      }
      total++;
      if (isPlaced) placed++;
      if (byRarity[f.rarity]) {
        byRarity[f.rarity].total++;
        if (isPlaced) byRarity[f.rarity].placed++;
      }
    }
    const pct = total ? Math.round((placed / total) * 100) : 0;
    return { placed, total, pct, byRarity, trash };
  }

  /* ── Equipment: filter, light, pump ──
     Each device is a level indexing a table of what that level buys. One reader
     serves all of them, and it clamps, so a level from a document written by a
     newer build (or a corrupted one) reads as the nearest real level instead of
     undefined. Level 0 is always "unbought", so table[0] must be the behaviour
     the tank had before any of this existed. */
  function aquariumLevelValue(level, table) {
    if (!Array.isArray(table) || !table.length) return 0;
    const i = Math.max(0, Math.min(table.length - 1, Math.floor(level || 0)));
    return table[i];
  }

  // Extra plays the pump buys: the allowance is 1 + level, so no pump is still
  // the one-a-day the two capped games have always had.
  function aquariumPlaysPerDay(pumpLevel) {
    return 1 + Math.max(0, Math.floor(pumpLevel || 0));
  }

  /* How many plays a stored (day, count) pair has used up today.

     Documents written before the counter existed carry a day string and no
     count, and that string was only ever set BY playing — so "today, no count"
     means one play used. Reading it as none would hand a free extra to everyone
     who had already played on the day this shipped. */
  function aquariumPlaysUsed(storedDay, today, storedN) {
    if (!storedDay || storedDay !== today) return 0;
    return typeof storedN === 'number' ? storedN : 1;
  }

  // Coins-per-hour a tank earns: sum of each placed species' rarity rate, times
  // whatever the light is worth (1 when there is no light, and for every caller
  // that predates it).
  function aquariumCoinsPerHour(aquariumFish, fishTypes, rates, mult) {
    const byName = {};
    for (const f of fishTypes) byName[f.name] = f;
    let total = 0;
    for (const name of (aquariumFish || [])) {
      const f = byName[name];
      if (f) total += (rates[f.rarity] || 0);
    }
    return total * (mult == null ? 1 : mult);
  }

  // Whole coins earned over an elapsed window, capped at capMs.
  function aquariumIdleCoins(aquariumFish, fishTypes, elapsedMs, capMs, rates, mult) {
    const perHour = aquariumCoinsPerHour(aquariumFish, fishTypes, rates, mult);
    const ms = Math.max(0, Math.min(elapsedMs, capMs));
    return Math.floor(perHour * (ms / 3600000));
  }

  // Feeding Frenzy payout from taps + best combo.
  function frenzyPayout(bites, maxCombo) {
    return Math.max(0, Math.floor((bites || 0) * 3 + (maxCombo || 0) * 5));
  }

  // Fish Race odds per racer: win chance ∝ speed, so faster fish pay less.
  // Returns [{ name, odds }] with odds clamped to [1.5, 4].
  function raceOdds(fishTypes, racerNames) {
    const byName = {};
    for (const f of fishTypes) byName[f.name] = f;
    const speeds = racerNames.map(n => (byName[n] && byName[n].speed) || 1);
    const total = speeds.reduce((s, sp) => s + sp, 0) || 1;
    return racerNames.map((n, i) => {
      const p = speeds[i] / total;                 // win probability
      let odds = (p > 0 ? 1 / p : 4) * 0.85;        // 0.85 = house edge
      odds = Math.max(1.5, Math.min(4, odds));
      return { name: n, odds: Math.round(odds * 10) / 10 };
    });
  }

  // Bubble Pop jackpot chance, boosted by legendary fish (cap 10%).
  function bubbleJackpotChance(legendaryCount) {
    return Math.min(0.10, 0.02 + 0.02 * (legendaryCount || 0));
  }

  return { catchableSpecies, aquariumCompletion, aquariumCoinsPerHour, aquariumIdleCoins, frenzyPayout, raceOdds, bubbleJackpotChance,
           aquariumLevelValue, aquariumPlaysPerDay, aquariumPlaysUsed };
});
