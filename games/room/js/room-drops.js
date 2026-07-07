/* ============================================================
   Pet drop logic + collectible data.
   Pure & dependency-free: runs as a browser global (other room
   scripts call these names bare) AND as a Node module for tests.
   No DOM, no Firebase, no reliance on other globals.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // Expose each export as a browser global so room-pets.js can call them bare.
  for (const k in api) {
    if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function rarityOf(idx) { return idx < 3 ? 'common' : idx < 6 ? 'rare' : 'epic'; }

  // milestones: ascending array with .min (e.g. AFFECTION_MILESTONES). Returns m in [0,1].
  function milestoneProgress(affection, milestones) {
    const n = milestones.length;
    if (n <= 1) return 0;
    let idx = 0;
    for (let i = 0; i < n; i++) { if (affection >= milestones[i].min) idx = i; }
    return idx / (n - 1);
  }

  const EPIC_LOW = [0.015, 0.010, 0.005];
  const EPIC_HIGH = [0.040, 0.030, 0.020];

  // Probabilities for the 9 pieces (0-2 common, 3-5 rare, 6-8 epic). Sums to 1.
  function pieceProbabilities(m) {
    m = Math.max(0, Math.min(1, m));
    const epic = EPIC_LOW.map((lo, i) => lo + (EPIC_HIGH[i] - lo) * m);
    const E = epic.reduce((a, b) => a + b, 0);
    const R = (0.10 + 0.35 * m) * (1 - E);
    const C = (1 - E) - R;
    return [C / 3, C / 3, C / 3, R / 3, R / 3, R / 3, epic[0], epic[1], epic[2]];
  }

  function rollPieceIndex(m, rng) {
    rng = rng || Math.random;
    const probs = pieceProbabilities(m);
    let r = rng();
    for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
    return probs.length - 1;
  }

  // collected: boolean[9] for the pet type (may be undefined / wrong length).
  function classifyDrop(pieceIdx, collected) {
    const owned = !!(collected && collected[pieceIdx]);
    const complete = !!collected && collected.length === 9 && collected.every(Boolean);
    if (owned || complete) return { kind: 'coins', pieceIdx: pieceIdx };
    return { kind: 'piece', pieceIdx: pieceIdx };
  }

  function dropCoinValue(pieceIdx, m, kind) {
    const rarity = rarityOf(pieceIdx);
    const pieceBonus = { common: 8, rare: 20, epic: 60 };
    const coinsOnly = { common: 15, rare: 40, epic: 120 };
    const base = kind === 'coins' ? coinsOnly[rarity] : pieceBonus[rarity];
    return Math.round(base * (1 + m));
  }

  // Whole days from 'YYYY-MM-DD' a to b (b - a), min 0. Empty a -> 1.
  function daysBetween(a, b) {
    if (!a) return 1;
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    const ua = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    const ub = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.max(0, Math.round((ub - ua) / 86400000));
  }

  // Pure accounting: accrue daily pending credits, then plan placements up to maxFloor.
  // pets: [{ id, lastDropDay, pendingDrops }]  (caller passes pets on the current layer)
  // Returns { pets: updatedCopies, placements: [{ petId }] }.
  function planTopUp(pets, floorCount, today, opts) {
    opts = opts || {};
    const maxFloor = opts.maxFloor != null ? opts.maxFloor : 5;
    const maxPending = opts.maxPending != null ? opts.maxPending : 5;
    const updated = pets.map(p => {
      let pending = p.pendingDrops || 0;
      if (p.lastDropDay !== today) {
        pending = Math.min(maxPending, pending + (daysBetween(p.lastDropDay, today) || 1));
      }
      return { id: p.id, lastDropDay: today, pendingDrops: pending };
    });
    const placements = [];
    let floor = floorCount;
    while (floor < maxFloor) {
      let pick = null;
      for (const u of updated) {
        if (u.pendingDrops > 0 && (!pick || u.pendingDrops > pick.pendingDrops)) pick = u;
      }
      if (!pick) break;
      pick.pendingDrops -= 1;
      placements.push({ petId: pick.id });
      floor++;
    }
    return { pets: updated, placements: placements };
  }

  // 9 pieces per type. Order: idx 0-2 common, 3-5 rare, 6-8 epic.
  const PET_COLLECTIBLES = {
    cat: [
      { emoji:'🐾', name:'Paw Print' }, { emoji:'🧶', name:'Yarn Scrap' }, { emoji:'🐟', name:'Fish Treat' },
      { emoji:'🔔', name:'Silver Bell' }, { emoji:'🪶', name:'Teaser Feather' }, { emoji:'🥛', name:'Cream Bowl' },
      { emoji:'👑', name:'Cat Crown' }, { emoji:'💎', name:'Gem Collar' }, { emoji:'🏆', name:'Mouser Trophy' },
    ],
    dog: [
      { emoji:'🦴', name:'Bone' }, { emoji:'🎾', name:'Tennis Ball' }, { emoji:'🐾', name:'Muddy Paw' },
      { emoji:'🦮', name:'Leash Badge' }, { emoji:'🥏', name:'Frisbee Medal' }, { emoji:'🍖', name:'Meaty Treat' },
      { emoji:'🏅', name:'Best Boy Medal' }, { emoji:'💎', name:'Diamond Tag' }, { emoji:'👑', name:'Top Dog Crown' },
    ],
    bunny: [
      { emoji:'🥕', name:'Carrot' }, { emoji:'🍀', name:'Clover' }, { emoji:'🐾', name:'Bunny Print' },
      { emoji:'🌷', name:'Tulip' }, { emoji:'🔔', name:'Garden Bell' }, { emoji:'🥬', name:'Lettuce' },
      { emoji:'🥚', name:'Golden Egg' }, { emoji:'💎', name:'Crystal Carrot' }, { emoji:'👑', name:'Bunny Crown' },
    ],
    hamster: [
      { emoji:'🌰', name:'Acorn' }, { emoji:'🥜', name:'Peanut' }, { emoji:'🌻', name:'Seed' },
      { emoji:'🎡', name:'Wheel Token' }, { emoji:'🧀', name:'Cheese Bit' }, { emoji:'🪵', name:'Chew Stick' },
      { emoji:'💎', name:'Gem Stash' }, { emoji:'👑', name:'Hamster Crown' }, { emoji:'🏆', name:'Hoarder Trophy' },
    ],
    fox: [
      { emoji:'🍂', name:'Autumn Leaf' }, { emoji:'🐾', name:'Fox Track' }, { emoji:'🫐', name:'Wild Berry' },
      { emoji:'🍄', name:'Mushroom' }, { emoji:'🔥', name:'Ember' }, { emoji:'🌙', name:'Moonstone Sliver' },
      { emoji:'💎', name:'Fox Gem' }, { emoji:'👑', name:'Sly Crown' }, { emoji:'✨', name:'Spirit Flame' },
    ],
    panda: [
      { emoji:'🎋', name:'Bamboo Shoot' }, { emoji:'🍃', name:'Leaf' }, { emoji:'🐾', name:'Panda Print' },
      { emoji:'🍡', name:'Dango' }, { emoji:'🏮', name:'Lantern' }, { emoji:'🎍', name:'Bamboo Stalk' },
      { emoji:'💎', name:'Jade Stone' }, { emoji:'👑', name:'Panda Crown' }, { emoji:'🏆', name:'Zen Trophy' },
    ],
    goose: [
      { emoji:'🪶', name:'Down Feather' }, { emoji:'🌾', name:'Wheat' }, { emoji:'🥖', name:'Bread Crust' },
      { emoji:'🍞', name:'Fresh Loaf' }, { emoji:'🔔', name:'Honk Bell' }, { emoji:'🥨', name:'Pretzel' },
      { emoji:'💎', name:'Goose Gem' }, { emoji:'👑', name:'Goose Crown' }, { emoji:'🥚', name:'Golden Goose Egg' },
    ],
    tom: [
      { emoji:'🐾', name:'Paw Print' }, { emoji:'🐟', name:'Fish' }, { emoji:'🥛', name:'Milk Saucer' },
      { emoji:'🔔', name:'Collar Bell' }, { emoji:'🧶', name:'Yarn Ball' }, { emoji:'🪤', name:'Mousetrap' },
      { emoji:'🏆', name:'Chase Trophy' }, { emoji:'💎', name:'Gem Collar' }, { emoji:'👑', name:'Cat Crown' },
    ],
    jerry: [
      { emoji:'🧀', name:'Cheese Wedge' }, { emoji:'🌰', name:'Acorn' }, { emoji:'🐾', name:'Mouse Print' },
      { emoji:'🍪', name:'Cookie Crumb' }, { emoji:'🔔', name:'Tiny Bell' }, { emoji:'🎈', name:'Balloon' },
      { emoji:'🏆', name:'Getaway Trophy' }, { emoji:'💎', name:'Gemstone' }, { emoji:'👑', name:'Mouse Crown' },
    ],
  };

  const PET_COLLECTION_DECOR = {
    cat:     'decor_cat_throne',
    dog:     'decor_dog_doghouse',
    bunny:   'decor_bunny_garden',
    hamster: 'decor_hamster_playground',
    fox:     'decor_fox_den',
    panda:   'decor_panda_garden',
    goose:   'decor_goose_pond',
    tom:     'decor_tom_armchair',
    jerry:   'decor_jerry_mousehole',
  };

  return {
    rarityOf, milestoneProgress, pieceProbabilities, rollPieceIndex,
    classifyDrop, dropCoinValue, daysBetween, planTopUp,
    PET_COLLECTIBLES, PET_COLLECTION_DECOR,
  };
});
