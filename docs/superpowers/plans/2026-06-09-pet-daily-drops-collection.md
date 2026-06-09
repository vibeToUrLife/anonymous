# Pet Daily Drops + 九宫格 Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Room pets drop collectible items on the floor each day; drop rarity and coin value scale with the pet's 好感度 (affection), and completing a pet type's 3×3 九宫格 collection unlocks a special, non-purchasable decoration.

**Architecture:** All probability/accounting logic lives in a new dependency-free file `games/room/js/room-drops.js` that works both as a browser global (loaded via `<script>`, like the other room files which share global scope) **and** as a Node module (`module.exports`), so the risky math gets real automated tests via Node's built-in test runner. The DOM/canvas/Firebase wiring lives in the existing `room-pets.js`, `room-firebase.js`, `room-state.js`, `room-render.js`, `room-base.js`, and `room.html`.

**Tech Stack:** Vanilla JS (ES2017), HTML5 Canvas 2D, Firebase Firestore (compat SDK). Tests: `node --test` (Node 24, built-in, no npm deps). No build step — files load via `<script src>` tags in `games/room.html`.

**Reference spec:** `docs/superpowers/specs/2026-06-09-pet-daily-drops-collection-design.md`

---

## File Structure

- **Create** `games/room/js/room-drops.js` — pure logic + collectible data. Browser global + Node module. No DOM/Firebase.
- **Create** `games/room/js/room-drops.test.js` — Node tests for the pure logic & data shape.
- **Modify** `games/room.html` — load `room-drops.js`; add Collection button + 九宫格 modal markup.
- **Modify** `games/room/js/room-base.js` — add 7 `unlockOnly` special decorations to `DECORATIONS`.
- **Modify** `games/room/js/room-render.js` — exclude `unlockOnly` decorations from the shop list.
- **Modify** `games/room/js/room-state.js` — `roomData` defaults for `petDrops`/`petCollections`.
- **Modify** `games/room/js/room-firebase.js` — save/load new fields; new-pet defaults; call drop generation on load.
- **Modify** `games/room/js/room-actions.js` — new pets get drop fields.
- **Modify** `games/room/js/room-pets.js` — drop generation, collection, canvas rendering, hit-testing, 九宫格 modal.

---

## Task 1: Pure drop logic module + tests

Builds `room-drops.js` with all the math and the pending-credit accounting, fully unit-tested in Node. No app wiring yet.

**Files:**
- Create: `games/room/js/room-drops.js`
- Test: `games/room/js/room-drops.test.js`

- [ ] **Step 1: Write the failing test file**

Create `games/room/js/room-drops.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const D = require('./room-drops.js');

// Mirrors AFFECTION_MILESTONES length (12 tiers) from room-base.js.
const MS = [
  { min: 0 }, { min: 50 }, { min: 150 }, { min: 300 }, { min: 500 },
  { min: 800 }, { min: 1200 }, { min: 2000 }, { min: 3000 }, { min: 4500 },
  { min: 6500 }, { min: 9000 },
];

test('rarityOf buckets 0-2 common, 3-5 rare, 6-8 epic', () => {
  assert.deepStrictEqual([0,1,2].map(D.rarityOf), ['common','common','common']);
  assert.deepStrictEqual([3,4,5].map(D.rarityOf), ['rare','rare','rare']);
  assert.deepStrictEqual([6,7,8].map(D.rarityOf), ['epic','epic','epic']);
});

test('milestoneProgress is 0 at Stranger and 1 at top milestone', () => {
  assert.strictEqual(D.milestoneProgress(0, MS), 0);
  assert.strictEqual(D.milestoneProgress(9000, MS), 1);
  assert.ok(D.milestoneProgress(500, MS) > 0 && D.milestoneProgress(500, MS) < 1);
});

test('pieceProbabilities sums to 1 and matches spec epic odds', () => {
  const lo = D.pieceProbabilities(0);
  const hi = D.pieceProbabilities(1);
  assert.ok(Math.abs(lo.reduce((a,b)=>a+b,0) - 1) < 1e-9);
  assert.ok(Math.abs(hi.reduce((a,b)=>a+b,0) - 1) < 1e-9);
  // Epic pieces are indices 6,7,8.
  assert.ok(Math.abs(lo[6] - 0.015) < 1e-9);
  assert.ok(Math.abs(lo[7] - 0.010) < 1e-9);
  assert.ok(Math.abs(lo[8] - 0.005) < 1e-9);
  assert.ok(Math.abs(hi[6] - 0.040) < 1e-9);
  assert.ok(Math.abs(hi[7] - 0.030) < 1e-9);
  assert.ok(Math.abs(hi[8] - 0.020) < 1e-9);
});

test('rollPieceIndex respects weights with a deterministic rng', () => {
  // rng returns a tiny value -> first bucket (common idx 0).
  assert.strictEqual(D.rollPieceIndex(0, () => 0.0), 0);
  // rng just below 1 -> last bucket (epic idx 8).
  assert.strictEqual(D.rollPieceIndex(1, () => 0.999999), 8);
});

test('classifyDrop: new piece -> piece, owned -> coins, complete grid -> coins', () => {
  const empty = new Array(9).fill(false);
  assert.deepStrictEqual(D.classifyDrop(2, empty), { kind:'piece', pieceIdx:2 });
  const owned2 = empty.slice(); owned2[2] = true;
  assert.deepStrictEqual(D.classifyDrop(2, owned2), { kind:'coins', pieceIdx:2 });
  const full = new Array(9).fill(true);
  assert.deepStrictEqual(D.classifyDrop(5, full), { kind:'coins', pieceIdx:5 });
  // Undefined collection -> treated as new piece.
  assert.deepStrictEqual(D.classifyDrop(0, undefined), { kind:'piece', pieceIdx:0 });
});

test('dropCoinValue scales by rarity and affection, bigger for coins kind', () => {
  assert.strictEqual(D.dropCoinValue(0, 0, 'piece'), 8);   // common piece, m=0
  assert.strictEqual(D.dropCoinValue(6, 0, 'piece'), 60);  // epic piece, m=0
  assert.strictEqual(D.dropCoinValue(0, 1, 'piece'), 16);  // common piece, m=1 -> 8*2
  assert.strictEqual(D.dropCoinValue(0, 0, 'coins'), 15);  // common coins-only
  assert.strictEqual(D.dropCoinValue(6, 1, 'coins'), 240); // epic coins-only, m=1 -> 120*2
});

test('daysBetween counts whole days, empty start -> 1', () => {
  assert.strictEqual(D.daysBetween('', '2026-06-09'), 1);
  assert.strictEqual(D.daysBetween('2026-06-09', '2026-06-09'), 0);
  assert.strictEqual(D.daysBetween('2026-06-07', '2026-06-09'), 2);
});

test('planTopUp fills floor to 5 from pending, most-pending first', () => {
  const pets = [
    { id:'a', lastDropDay:'2026-06-08', pendingDrops:0 },
    { id:'b', lastDropDay:'2026-06-08', pendingDrops:0 },
  ];
  const r = D.planTopUp(pets, 0, '2026-06-09');
  // Each pet gains +1 pending for the new day; floor was 0 so both place.
  assert.strictEqual(r.placements.length, 2);
  assert.ok(r.pets.every(p => p.lastDropDay === '2026-06-09'));
  assert.ok(r.pets.every(p => p.pendingDrops === 0));
});

test('planTopUp never exceeds maxFloor and caps pending per pet', () => {
  const pets = [{ id:'a', lastDropDay:'2020-01-01', pendingDrops:0 }];
  const r = D.planTopUp(pets, 3, '2026-06-09'); // floor already 3, cap 5
  assert.strictEqual(r.placements.length, 2);   // only 2 slots left
  // Big gap is capped at maxPending(5); 2 placed -> 3 remain pending.
  assert.strictEqual(r.pets[0].pendingDrops, 3);
});

test('planTopUp places nothing when floor already full', () => {
  const pets = [{ id:'a', lastDropDay:'2026-06-08', pendingDrops:9 }];
  const r = D.planTopUp(pets, 5, '2026-06-09');
  assert.strictEqual(r.placements.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test games/room/js/room-drops.test.js`
Expected: FAIL — `Cannot find module './room-drops.js'`.

- [ ] **Step 3: Implement `room-drops.js` (logic only)**

Create `games/room/js/room-drops.js`:

```js
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

  return {
    rarityOf, milestoneProgress, pieceProbabilities, rollPieceIndex,
    classifyDrop, dropCoinValue, daysBetween, planTopUp,
  };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test games/room/js/room-drops.test.js`
Expected: PASS — all tests green (11 tests).

- [ ] **Step 5: Load the script in the page**

In `games/room.html`, find the line:

```html
  <script src="room/js/room-base.js"></script>
```

Add immediately **after** it:

```html
  <script src="room/js/room-drops.js"></script>
```

(Order matters: it must load before `room-pets.js` which calls these functions.)

- [ ] **Step 6: Commit**

```bash
git add games/room/js/room-drops.js games/room/js/room-drops.test.js games/room.html
git commit -m "feat(room): add pet drop probability + pending-credit logic with tests"
```

---

## Task 2: Collectible data + special decorations

Adds the 63 collectible pieces (9 × 7 types) and 7 unlock-only decorations, plus the type→decoration map. Data lives in the testable module; the decoration *definitions* extend the existing `DECORATIONS` array.

**Files:**
- Modify: `games/room/js/room-drops.js`
- Modify: `games/room/js/room-drops.test.js`
- Modify: `games/room/js/room-base.js` (after the `DECORATIONS` array, ~line 285)
- Modify: `games/room/js/room-render.js:1513`

- [ ] **Step 1: Write the failing data-shape test**

Append to `games/room/js/room-drops.test.js`:

```js
const TYPES = ['cat','dog','bunny','hamster','fox','panda','goose'];

test('PET_COLLECTIBLES has exactly 9 pieces with emoji+name for every type', () => {
  for (const t of TYPES) {
    const arr = D.PET_COLLECTIBLES[t];
    assert.ok(Array.isArray(arr), 'missing collectibles for ' + t);
    assert.strictEqual(arr.length, 9, t + ' must have 9 pieces');
    for (const pc of arr) {
      assert.ok(pc.emoji && typeof pc.emoji === 'string', t + ' piece needs emoji');
      assert.ok(pc.name && typeof pc.name === 'string', t + ' piece needs name');
    }
  }
});

test('PET_COLLECTION_DECOR maps every type to a unique decor id', () => {
  const ids = TYPES.map(t => D.PET_COLLECTION_DECOR[t]);
  for (let i = 0; i < TYPES.length; i++) {
    assert.ok(ids[i] && typeof ids[i] === 'string', 'missing decor for ' + TYPES[i]);
  }
  assert.strictEqual(new Set(ids).size, ids.length, 'decor ids must be unique');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test games/room/js/room-drops.test.js`
Expected: FAIL — `PET_COLLECTIBLES` undefined.

- [ ] **Step 3: Add the data to `room-drops.js`**

In `games/room/js/room-drops.js`, **inside** the factory function, just before the final `return { ... }`, add:

```js
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
  };

  const PET_COLLECTION_DECOR = {
    cat:     'decor_cat_throne',
    dog:     'decor_dog_doghouse',
    bunny:   'decor_bunny_garden',
    hamster: 'decor_hamster_playground',
    fox:     'decor_fox_den',
    panda:   'decor_panda_garden',
    goose:   'decor_goose_pond',
  };
```

Then update the final `return { ... }` to also export them:

```js
  return {
    rarityOf, milestoneProgress, pieceProbabilities, rollPieceIndex,
    classifyDrop, dropCoinValue, daysBetween, planTopUp,
    PET_COLLECTIBLES, PET_COLLECTION_DECOR,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test games/room/js/room-drops.test.js`
Expected: PASS — all 13 tests green.

- [ ] **Step 5: Add the 7 special decorations to `DECORATIONS`**

In `games/room/js/room-base.js`, the `DECORATIONS` array ends at line ~285 with the `rug_heart` entry then `];`. Add these entries just before the closing `];` (they are `floor` category and flagged `unlockOnly` so the shop hides them):

```js
      // Unlock-only: granted when a pet type's 九宫格 collection is completed. Not buyable.
      { id: 'decor_cat_throne',        emoji: '👑', name: 'Royal Cat Throne',    cost: 0, category: 'floor', dx: 0.30, dy: 0.82, unlockOnly: true },
      { id: 'decor_dog_doghouse',      emoji: '🏠', name: 'Champion Doghouse',   cost: 0, category: 'floor', dx: 0.70, dy: 0.82, unlockOnly: true },
      { id: 'decor_bunny_garden',      emoji: '🌻', name: 'Bunny Garden',        cost: 0, category: 'floor', dx: 0.20, dy: 0.86, unlockOnly: true },
      { id: 'decor_hamster_playground',emoji: '🎡', name: 'Hamster Playground',  cost: 0, category: 'floor', dx: 0.55, dy: 0.84, unlockOnly: true },
      { id: 'decor_fox_den',           emoji: '🏕️', name: 'Mystic Fox Den',      cost: 0, category: 'floor', dx: 0.78, dy: 0.80, unlockOnly: true },
      { id: 'decor_panda_garden',      emoji: '🎋', name: 'Bamboo Garden',       cost: 0, category: 'floor', dx: 0.40, dy: 0.80, unlockOnly: true },
      { id: 'decor_goose_pond',        emoji: '⛲', name: 'Goose Pond',          cost: 0, category: 'floor', dx: 0.62, dy: 0.88, unlockOnly: true },
```

- [ ] **Step 6: Exclude unlock-only decorations from the shop**

In `games/room/js/room-render.js`, line 1513 currently reads:

```js
        const items = DECORATIONS.filter(d => d.category === filterCat);
```

Change it to:

```js
        const items = DECORATIONS.filter(d => d.category === filterCat && !d.unlockOnly);
```

- [ ] **Step 7: Browser smoke check the decoration ids resolve**

Serve the repo root with a static server (e.g. `python -m http.server 8000`), open `http://localhost:8000/index.html`, enter the access code, sign in, and open the room. In DevTools console run:

```js
Object.values(PET_COLLECTION_DECOR).every(id => DECORATIONS.some(d => d.id === id && d.unlockOnly))
```

Expected: `true` (every collection reward maps to a real unlock-only decoration). Also confirm none of the 7 appear in the decoration shop's Floor tab.

- [ ] **Step 8: Commit**

```bash
git add games/room/js/room-drops.js games/room/js/room-drops.test.js games/room/js/room-base.js games/room/js/room-render.js
git commit -m "feat(room): add 63 collectible pieces + 7 unlock-only collection decorations"
```

---

## Task 3: Persistence & state for drops/collections

Adds `petDrops`/`petCollections` to `roomData` defaults, saves/loads them, and gives every pet `lastDropDay`/`pendingDrops` fields. No behavior yet — just data plumbing so nothing is lost on reload.

**Files:**
- Modify: `games/room/js/room-state.js:4` and `games/room/js/room-firebase.js:218` (the two `roomData = {…}` literals)
- Modify: `games/room/js/room-firebase.js:8` (save: pets map), and the load block (~line 78-143)
- Modify: `games/room/js/room-state.js` `migratePets` (~line 45-78)
- Modify: `games/room/js/room-actions.js:14-18` (new pet fields)

- [ ] **Step 1: Add defaults to both `roomData` literals**

In `games/room/js/room-state.js` line 4, inside the `roomData = { … }` object literal, add two fields (e.g. right after `coins: 0,`):

```js
petDrops: [], petCollections: {},
```

In `games/room/js/room-firebase.js` line 218 (the reset literal inside `initRoom`), add the same two fields right after `coins: 0,`:

```js
petDrops: [], petCollections: {},
```

- [ ] **Step 2: Persist the new fields in `saveRoom`**

In `games/room/js/room-firebase.js`, the `saveRoom` `data` object (starts line 6). Update the `pets` map (line 8) to also serialize the two new per-pet fields. Replace line 8 with:

```js
        pets: roomData.pets.map(p => ({ id: p.id, type: p.type, name: p.name, hunger: p.hunger, thirst: p.thirst, affection: p.affection, color: p.color, layer: p.layer ?? null, accessory: p.accessory || null, posX: p.posX ?? null, posY: p.posY ?? null, parked: p.parked ?? false, lastDropDay: p.lastDropDay || '', pendingDrops: p.pendingDrops || 0 })),
```

Then add two top-level fields to the same `data` object (e.g. right after the `pets:` line):

```js
        petDrops: roomData.petDrops || [],
        petCollections: roomData.petCollections || {},
```

- [ ] **Step 3: Restore the new fields on load**

In `games/room/js/room-firebase.js`, in the load block where fields are read (e.g. after `roomData.jukeboxVol = d.jukeboxVol ?? 0.5;` ~line 143), add:

```js
        roomData.petDrops = Array.isArray(d.petDrops) ? d.petDrops : [];
        roomData.petCollections = d.petCollections || {};
```

(`roomData.pets` is already restored via `migratePets(d)` at line 80; the per-pet `lastDropDay`/`pendingDrops` survive because Firestore returns them on each pet object and `migratePets` spreads/returns the stored pets unchanged when `d.pets` exists — see Step 4.)

- [ ] **Step 4: Default per-pet drop fields in `migratePets`**

In `games/room/js/room-state.js`, `migratePets` returns `d.pets` largely as-is. Ensure both code paths set the new fields. In the early-return branch (where `d.pets && d.pets.length`), change the mapped return so the fields default when absent. Replace the body of that `.map(p => { … })` so it reads:

```js
        return d.pets.map(p => {
          const withLayer = (p.layer === undefined)
            ? { ...p, layer: p.active ? 1 : null }
            : p;
          return { lastDropDay: '', pendingDrops: 0, ...withLayer };
        });
```

And in the fresh-build branch, in the `addPet` helper's `pets.push({ … })` object, add the two fields:

```js
          lastDropDay: '',
          pendingDrops: 0,
```

- [ ] **Step 5: New pets created in the shop get the fields**

In `games/room/js/room-actions.js`, the `buyPet` function pushes a new pet (~line 14-18). Add the two fields to that object literal:

```js
          lastDropDay: '',
          pendingDrops: 0,
```

- [ ] **Step 6: Browser verification — persistence round-trip**

Serve + open the room (as in Task 2 Step 7). In DevTools console:

```js
roomData.petCollections.cat = [true,false,false,false,false,false,false,false,false];
roomData.petDrops.push({ id:'drop_test', petId:(roomData.pets[0]||{}).id, petType:'cat', layer:currentLayer, kind:'coins', pieceIdx:0, coins:15, x:0.4, y:0.85 });
await saveRoom();
location.reload();
```

After reload, in console:

```js
roomData.petCollections.cat?.[0] === true && roomData.petDrops.some(d => d.id === 'drop_test')
```

Expected: `true`. Then clean up:

```js
delete roomData.petCollections.cat; roomData.petDrops = roomData.petDrops.filter(d=>d.id!=='drop_test'); await saveRoom();
```

- [ ] **Step 7: Commit**

```bash
git add games/room/js/room-state.js games/room/js/room-firebase.js games/room/js/room-actions.js
git commit -m "feat(room): persist petDrops, petCollections, and per-pet drop fields"
```

---

## Task 4: Daily drop generation + collection wiring

Adds `maybeGenerateDailyDrops()` (uses the pure logic to accrue/place drops) and `collectDrop()` (awards coins, fills the grid, unlocks the decoration), and calls generation on room load.

**Files:**
- Modify: `games/room/js/room-pets.js` (add functions near the top of the file's pet section, e.g. after line 7)
- Modify: `games/room/js/room-firebase.js` (call generation on load, ~line 194)

- [ ] **Step 1: Add the generation + collection functions**

In `games/room/js/room-pets.js`, after the module-level `let _petDragCleanup = null;` (line 7), add:

```js
    let _collectionOpenType = null; // pet type whose 九宫格 modal is open, or null

    // Local calendar day as 'YYYY-MM-DD' (matches lastLoginDay convention).
    function _todayStr() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // Accrue daily pending credits and place drops up to the 5-per-floor cap.
    function maybeGenerateDailyDrops() {
      if (viewingUid !== currentUid) return;          // only your own pets drop
      if (!roomData.pets || !roomData.pets.length) return;
      roomData.petDrops = roomData.petDrops || [];
      roomData.petCollections = roomData.petCollections || {};
      const today = _todayStr();
      const layerPets = roomData.pets.filter(p => p.layer === currentLayer);
      if (!layerPets.length) return;
      const floorCount = roomData.petDrops.filter(dr => dr.layer === currentLayer).length;
      const plan = planTopUp(
        layerPets.map(p => ({ id: p.id, lastDropDay: p.lastDropDay, pendingDrops: p.pendingDrops })),
        floorCount, today
      );
      let changed = false;
      plan.pets.forEach(u => {
        const pet = getPet(u.id);
        if (!pet) return;
        if (pet.lastDropDay !== u.lastDropDay || (pet.pendingDrops || 0) !== u.pendingDrops) changed = true;
        pet.lastDropDay = u.lastDropDay;
        pet.pendingDrops = u.pendingDrops;
      });
      for (const pl of plan.placements) {
        const pet = getPet(pl.petId);
        if (!pet) continue;
        const m = milestoneProgress(pet.affection ?? 0, AFFECTION_MILESTONES);
        const idx = rollPieceIndex(m);
        const collected = roomData.petCollections[pet.type];
        const cls = classifyDrop(idx, collected);
        const coins = dropCoinValue(idx, m, cls.kind);
        const ax = pet.posX != null ? pet.posX : 0.40;
        const ay = pet.posY != null ? pet.posY : 0.85;
        roomData.petDrops.push({
          id: 'drop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          petId: pet.id, petType: pet.type, layer: currentLayer,
          kind: cls.kind, pieceIdx: cls.pieceIdx, coins: coins,
          x: Math.max(0.06, Math.min(0.92, ax + (Math.random() - 0.5) * 0.10)),
          y: Math.max(0.74, Math.min(0.90, ay + 0.02 + Math.random() * 0.04)),
        });
        changed = true;
      }
      if (changed) saveRoom();
    }

    // Collect a floor drop: award coins, fill the grid, unlock decoration on completion.
    async function collectDrop(dropId) {
      if (viewingUid !== currentUid) return;
      const drops = roomData.petDrops || [];
      const i = drops.findIndex(d => d.id === dropId);
      if (i < 0) return;
      const dr = drops[i];
      drops.splice(i, 1);
      roomData.coins = (roomData.coins || 0) + (dr.coins || 0);
      let msg = '💰 +' + (dr.coins || 0) + ' coins';
      if (dr.kind === 'piece') {
        roomData.petCollections = roomData.petCollections || {};
        let arr = roomData.petCollections[dr.petType];
        if (!arr || arr.length !== 9) arr = [false, false, false, false, false, false, false, false, false];
        arr[dr.pieceIdx] = true;
        roomData.petCollections[dr.petType] = arr;
        const piece = PET_COLLECTIBLES[dr.petType] && PET_COLLECTIBLES[dr.petType][dr.pieceIdx];
        msg = (piece ? piece.emoji + ' ' + piece.name : 'New piece') + ' collected!  +' + (dr.coins || 0) + ' coins';
        if (arr.every(Boolean)) {
          const decorId = PET_COLLECTION_DECOR[dr.petType];
          roomData.ownedDecors = roomData.ownedDecors || [];
          if (decorId && !roomData.ownedDecors.includes(decorId)) {
            roomData.ownedDecors.push(decorId);
            const ddef = DECORATIONS.find(d => d.id === decorId);
            showToast('🎉 ' + dr.petType + ' collection complete! Unlocked ' + (ddef ? ddef.emoji + ' ' + ddef.name : 'a special decoration') + '!', 'success');
          }
        }
      }
      showToast(msg, 'success');
      maybeGenerateDailyDrops();        // pull a pending drop into the freed slot
      await saveRoom();
      if (_selectedPetId) updatePetStatusBar();
      if (_collectionOpenType) renderCollectionGrid(_collectionOpenType);
    }
```

(`renderCollectionGrid` / `updatePetStatusBar`'s collection button are added in Task 6; calling them here is safe because Task 6 ships before this is exercised end-to-end, and `_collectionOpenType` is null until the modal exists.)

- [ ] **Step 2: Call generation on room load**

In `games/room/js/room-firebase.js`, in the existing-document branch, just before the second `_roomLoaded = true;` (line 195), add:

```js
        maybeGenerateDailyDrops();
```

- [ ] **Step 3: Browser verification — drops generate and collect**

Serve + open the room with at least one pet placed on the current floor. In DevTools console, force yesterday and regenerate:

```js
roomData.pets.forEach(p => { p.lastDropDay = '2026-06-08'; p.pendingDrops = 0; });
roomData.petDrops = roomData.petDrops.filter(d => d.layer !== currentLayer);
maybeGenerateDailyDrops();
roomData.petDrops.filter(d => d.layer === currentLayer).length; // expect 1 per placed pet (<=5)
```

Then collect one and confirm coins rise + floor refills if pending remain:

```js
const before = roomData.coins; const id = roomData.petDrops.find(d=>d.layer===currentLayer).id;
await collectDrop(id);
roomData.coins > before; // expect true
```

Expected: drops array populated; `collectDrop` increases coins and (for a piece) flips a `petCollections` cell.

- [ ] **Step 4: Commit**

```bash
git add games/room/js/room-pets.js games/room/js/room-firebase.js
git commit -m "feat(room): generate daily pet drops on load and collect them for coins/pieces"
```

---

## Task 5: Render drops on the canvas + click to collect

Draws each floor drop as an eye-catching (亮眼) glowing, bobbing item with rarity-colored glow, and makes clicking a drop collect it (taking priority over pet selection when no food/toy is selected).

**Files:**
- Modify: `games/room/js/room-pets.js` — `frame()` render loop (~line 406) and `cvs.onclick` (~line 163-217)

- [ ] **Step 1: Add the drop-drawing helper**

In `games/room/js/room-pets.js`, add this function just above `function startPetAnimation(pets) {` (line 51):

```js
    // Draw all floor drops for the current layer — glow ring + sparkles + item (亮眼).
    function drawFloorDrops(ctx, rw, rh, t) {
      const drops = (roomData.petDrops || []);
      const glowFor = { common: '#5bc0ff', rare: '#b06bff', epic: '#ffd23d', coins: '#ffcf4d' };
      for (const dr of drops) {
        if (dr.layer !== currentLayer) continue;
        const px = dr.x * rw;
        const bob = Math.sin(t / 400 + (dr.x + dr.y) * 10) * 4;
        const py = dr.y * rh + bob;
        const rarity = dr.kind === 'coins' ? 'coins' : (dr.pieceIdx < 3 ? 'common' : dr.pieceIdx < 6 ? 'rare' : 'epic');
        const glow = glowFor[rarity] || '#ffcf4d';
        const pulse = 0.6 + 0.4 * Math.sin(t / 300);
        // Glow halo
        ctx.save();
        ctx.globalAlpha = 0.4 * pulse;
        const grd = ctx.createRadialGradient(px, py, 2, px, py, 24);
        grd.addColorStop(0, glow);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(px, py, 24, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Orbiting sparkles
        ctx.save();
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < 3; i++) {
          const a = t / 500 + i * 2.1;
          ctx.beginPath();
          ctx.arc(px + Math.cos(a) * 16, py + Math.sin(a) * 10, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        // The item itself
        const pieces = PET_COLLECTIBLES[dr.petType];
        const emoji = dr.kind === 'coins' ? '💰' : (pieces && pieces[dr.pieceIdx] ? pieces[dr.pieceIdx].emoji : '🎁');
        ctx.save();
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, px, py);
        ctx.restore();
      }
    }
```

- [ ] **Step 2: Call the helper each frame**

In `frame()`, the pets are drawn in a `for (const p of pets) { … }` loop that ends at line ~406 (`} catch(e) { ctx.restore(); } }`). Immediately **after** that loop's closing brace and before `petAnimFrame = requestAnimationFrame(frame);` (line 408), add:

```js
        drawFloorDrops(ctx, rw, rh, t);
```

- [ ] **Step 3: Add drop hit-testing to the canvas click handler**

In `cvs.onclick` (line 163), after `clickX`/`clickY` are computed (line 167) and before the `let closestPet = null;` line (168), add:

```js
        // Collecting a floor drop takes priority — but only when not feeding/playing.
        if (viewingUid === currentUid && !selectedFood && !selectedToy && !selectedDrink && roomData.petDrops && roomData.petDrops.length) {
          let hitDrop = null, hitDist = Infinity;
          for (const dr of roomData.petDrops) {
            if (dr.layer !== currentLayer) continue;
            const dx = dr.x - clickX, dy = dr.y - clickY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.06 && dist < hitDist) { hitDist = dist; hitDrop = dr; }
          }
          if (hitDrop) { collectDrop(hitDrop.id); e.stopPropagation(); return; }
        }
```

- [ ] **Step 4: Browser verification — visible, clickable drops**

Serve + open the room with a pet on the floor. In console, spawn a few drops of each rarity near the floor:

```js
roomData.petDrops = roomData.petDrops.filter(d => d.layer !== currentLayer);
[['piece',0],['piece',4],['piece',8],['coins',8]].forEach(([k,idx],n)=>roomData.petDrops.push({id:'dv'+n,petId:(roomData.pets[0]||{}).id,petType:(roomData.pets.find(p=>p.layer===currentLayer)||{type:'cat'}).type,layer:currentLayer,kind:k,pieceIdx:idx,coins:20,x:0.25+n*0.15,y:0.84}));
```

Expected visual: four bobbing items on the floor — blue glow (common), purple (rare), gold (epic), gold 💰 (coins). Click one; it disappears and a coins/piece toast shows, coins increase. Confirm clicking empty floor still opens/closes the pet status bar as before.

- [ ] **Step 5: Commit**

```bash
git add games/room/js/room-pets.js
git commit -m "feat(room): render glowing floor drops and collect them on click"
```

---

## Task 6: Collection button + 九宫格 modal

Adds the "🎁 Collection (n/9)" button to the pet status bar and the 3×3 grid modal showing collected/locked pieces and the decoration reward.

**Files:**
- Modify: `games/room.html` — status-bar button + modal markup
- Modify: `games/room/js/room-pets.js` — button label update in `updatePetStatusBar`, modal open/close/render functions

- [ ] **Step 1: Add the Collection button to the status bar**

In `games/room.html`, the `petStatusTricks` block ends around line 82-83 with two closing `</div>`s. Immediately **after** the `petStatusTricks` wrapper `</div>` (the one closing the block opened at line 80), add:

```html
          <div id="petStatusCollectionWrap" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);text-align:center">
            <button id="petStatusCollectionBtn" onclick="openPetCollection()" style="font-size:11px;padding:6px 12px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,210,61,0.35);background:rgba(255,210,61,0.12);color:#ffd23d">🎁 Collection</button>
          </div>
```

- [ ] **Step 2: Add the modal markup**

In `games/room.html`, add this just before the closing `</body>` tag (line 360) — or anywhere inside `<body>` outside the room container:

```html
  <div id="petCollectionModal" style="display:none;position:fixed;inset:0;z-index:60;background:rgba(0,0,0,0.6);align-items:center;justify-content:center" onclick="if(event.target===this)closePetCollection()">
    <div style="background:#16162a;border:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:18px;max-width:340px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span id="petCollectionTitle" style="font-weight:700;color:#fff;font-size:14px"></span>
        <button onclick="closePetCollection()" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div id="petCollectionGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>
      <div id="petCollectionReward" style="margin-top:14px;text-align:center;font-size:11px;color:#bbb;line-height:1.4"></div>
    </div>
  </div>
```

- [ ] **Step 3: Update the button label in `updatePetStatusBar`**

In `games/room/js/room-pets.js`, inside `updatePetStatusBar()`, just before its closing `}` (after the tricks block, ~line 495), add:

```js
      const cbtn = document.getElementById('petStatusCollectionBtn');
      if (cbtn) {
        const col = (roomData.petCollections && roomData.petCollections[pet.type]) || [];
        const have = col.filter(Boolean).length;
        cbtn.textContent = '🎁 Collection (' + have + '/9)';
      }
```

- [ ] **Step 4: Add the modal open/close/render functions**

In `games/room/js/room-pets.js`, add these functions right after `updatePetStatusBar` (after its closing `}`, ~line 496):

```js
    function openPetCollection() {
      const pet = getPet(_selectedPetId);
      if (!pet) return;
      _collectionOpenType = pet.type;
      const modal = document.getElementById('petCollectionModal');
      if (modal) modal.style.display = 'flex';
      renderCollectionGrid(pet.type);
    }

    function closePetCollection() {
      _collectionOpenType = null;
      const modal = document.getElementById('petCollectionModal');
      if (modal) modal.style.display = 'none';
    }

    function renderCollectionGrid(type) {
      const pieces = PET_COLLECTIBLES[type] || [];
      const collected = (roomData.petCollections && roomData.petCollections[type]) || [];
      const have = pieces.reduce((n, _, i) => n + (collected[i] ? 1 : 0), 0);
      const petName = (PETS.find(p => p.id === type) || {}).name || type;
      const titleEl = document.getElementById('petCollectionTitle');
      if (titleEl) titleEl.textContent = '🎁 ' + petName + ' Collection (' + have + '/9)';
      const rarityColor = i => (i < 3 ? '#5bc0ff' : i < 6 ? '#b06bff' : '#ffd23d');
      const gridEl = document.getElementById('petCollectionGrid');
      if (gridEl) {
        gridEl.innerHTML = pieces.map((pc, i) => {
          const got = !!collected[i];
          return '<div style="aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;'
            + 'border:1px solid ' + (got ? rarityColor(i) : 'rgba(255,255,255,0.1)') + ';'
            + 'background:' + (got ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)') + '">'
            + '<div style="font-size:22px;' + (got ? '' : 'filter:grayscale(1);opacity:0.25') + '">' + (got ? pc.emoji : '❔') + '</div>'
            + '<div style="font-size:8px;margin-top:2px;color:' + (got ? '#ddd' : '#666') + '">' + (got ? pc.name : '???') + '</div>'
            + '</div>';
        }).join('');
      }
      const decorId = PET_COLLECTION_DECOR[type];
      const ddef = DECORATIONS.find(d => d.id === decorId);
      const decorLabel = ddef ? ddef.emoji + ' ' + ddef.name : 'a special decoration';
      const complete = pieces.length === 9 && pieces.every((_, i) => collected[i]);
      const rewardEl = document.getElementById('petCollectionReward');
      if (rewardEl) {
        rewardEl.innerHTML = complete
          ? '✨ Unlocked: ' + decorLabel + ' — place it from your decorations!'
          : 'Complete all 9 to unlock: ' + decorLabel;
      }
    }
```

- [ ] **Step 5: Browser verification — full end-to-end**

Serve + open the room with a pet on the floor. Steps:

1. Click the pet → status bar opens → confirm a "🎁 Collection (n/9)" button appears.
2. Click it → modal opens with a 3×3 grid (locked cells show ❔) and the reward line naming this type's decoration.
3. In console, simulate near-completion then a final piece to verify the unlock path:

```js
const t = getPet(_selectedPetId).type;
roomData.petCollections[t] = new Array(9).fill(true); roomData.petCollections[t][8] = false;
roomData.petDrops.push({id:'dwin',petId:_selectedPetId,petType:t,layer:currentLayer,kind:'piece',pieceIdx:8,coins:60,x:0.4,y:0.85});
await collectDrop('dwin');
roomData.ownedDecors.includes(PET_COLLECTION_DECOR[t]); // expect true
```

Expected: a "🎉 collection complete! Unlocked …" toast; the unlocked decoration id is in `ownedDecors`; reopening the decoration shop's Floor tab does **not** list it for purchase, but it is placeable from owned decorations. Clean up the test state afterward:

```js
delete roomData.petCollections[t]; roomData.ownedDecors = roomData.ownedDecors.filter(id=>id!==PET_COLLECTION_DECOR[t]); await saveRoom();
```

- [ ] **Step 6: Commit**

```bash
git add games/room.html games/room/js/room-pets.js
git commit -m "feat(room): add 九宫格 collection button and grid modal with reward display"
```

---

## Self-Review

**Spec coverage:**
- Daily drop, 1 per pet, pending credits, floor cap 5, top-up on collect → Task 1 (`planTopUp`) + Task 4 (wiring/collect refill). ✓
- Affection-weighted rarity, epic floor→ceiling odds → Task 1 (`pieceProbabilities`/`rollPieceIndex`). ✓
- Duplicate / complete → coins → Task 1 (`classifyDrop`) + Task 4 (`collectDrop`). ✓
- Coins scale with affection & rarity → Task 1 (`dropCoinValue`). ✓
- 9 pieces × 7 types, 3/3/3 rarity → Task 2 (`PET_COLLECTIBLES`). ✓
- 7 unlock-only decorations, hidden from shop, granted on completion → Task 2 (data + shop filter) + Task 4 (grant). ✓
- Spawn near pet on load → Task 4 (`maybeGenerateDailyDrops` anchors on `pet.posX/posY`). ✓
- Persist drops/collections/pending across reload → Task 3. ✓
- 亮眼 rarity-colored glowing drops + click to collect → Task 5. ✓
- 九宫格 button in status bar + grid modal + reward → Task 6. ✓
- Read-only when visiting others (`viewingUid !== currentUid` guards) → Tasks 4 (generate/collect), 5 (hit-test). ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** Drop object shape `{ id, petId, petType, layer, kind, pieceIdx, coins, x, y }` is identical across Task 4 (create), Task 5 (render/hit-test), and Task 6 (collect path). `planTopUp` returns `{ pets, placements:[{petId}] }` — consumed exactly that way in Task 4. `classifyDrop` returns `{ kind, pieceIdx }` — used in Task 4. Function names (`maybeGenerateDailyDrops`, `collectDrop`, `renderCollectionGrid`, `openPetCollection`, `closePetCollection`, `_collectionOpenType`, `_todayStr`) are consistent across tasks. `petCollections[type]` is always a `boolean[9]`. ✓

**Note for executor:** `collectDrop` (Task 4) references `renderCollectionGrid` and the collection button (defined in Task 6). This is fine for incremental commits — the references are only hit at runtime once a drop is collected with the modal open, which only happens after Task 6 ships. If you run the Task 4 browser verification before Task 6, ignore a `renderCollectionGrid is not defined` only if the modal were open (it isn't in that step).
