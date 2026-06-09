# Pet Daily Drops + 九宫格 Collection — Design

**Date:** 2026-06-09
**Status:** Approved pending spec review

## Summary

Room pets produce collectible **drops (掉落物)** on the floor. Drops are tuned by each
pet's **affection (好感度)**: higher affection means better odds of rarer drops and
larger coin rewards. Special drops are pieces of a per-pet-type **九宫格** (3×3
collection grid of 9 unique collectibles). Completing a type's grid unlocks a
**special decoration** for that pet type that cannot be bought in the shop.

## Mechanics

### Drops on the floor
- The floor holds **up to 5 uncollected drops** (room-wide, current layer).
- Each **pet instance** accrues **1 drop per day** as a *pending credit*.
- Whenever the floor has fewer than 5 drops, pending credits are placed
  immediately. Collecting a drop (5→4) instantly pulls in the next pending
  drop (→5) until no pending credits remain.
- Drops **persist until collected** across sessions (they do not expire).
- Drops spawn **near the pet** that produced them, on room load / day rollover,
  with a little pop.

### Pending-credit accounting (bounds the backlog)
- `pet.lastDropDay` = `'YYYY-MM-DD'` (local day string, matches existing
  `lastLoginDay` convention).
- `pet.pendingDrops` = integer count of drops the pet owes but hasn't placed.
- On `topUpDrops()` (called on room load, after each collect, and on day
  rollover while the room is open):
  1. For each placed pet whose `lastDropDay !== today`: add the number of
     elapsed days to `pendingDrops`, **capped at 5 per pet** so an absence
     can't balloon the backlog. Set `lastDropDay = today`.
  2. While `floorDrops.length < 5` **and** some pet has `pendingDrops > 0`:
     pick a pet with pending credits, roll its drop content (below), place it
     on the floor near the pet, decrement `pendingDrops`.

### What a drop contains (rolled at placement time, using current affection)
- Each pet **type** has **9 collectible pieces**, split by rarity:
  **3 common · 3 rare · 3 epic**.
- Roll one of the 9 by weighted random.
- **Epic pieces are deliberately rare**, and devotion (好感度) raises their odds.
  Each epic's chance scales from a **low-affection floor** up to a
  **max-affection ceiling**:
  - epic A: **1.5% → 4.0%**
  - epic B: **1.0% → 3.0%**
  - epic C: **0.5% → 2.0%**

  So a Stranger sees ~3% epic total; a fully-bonded pet sees ~9% epic total.
- The remaining probability is split between the **3 common** and **3 rare**
  pieces, with weight shifting from common toward rare as affection rises. All 9
  remain *possible* at any affection.

### Concrete probability model
Let `m` = affection milestone progress in `[0, 1]` (0 = Stranger, 1 = top
milestone), derived from the pet's milestone index over the milestone count.

- **Epic** individual chances interpolate floor→ceiling by `m`:
  `epic_i = epicLow_i + (epicHigh_i - epicLow_i) * m`, where
  `epicLow = [0.015, 0.010, 0.005]` and `epicHigh = [0.040, 0.030, 0.020]`.
  Epic total `E` ranges `0.03` (m=0) → `0.09` (m=1).
- **Rare** total: `R = (0.10 + 0.35 * m) * (1 - E)` — grows with affection.
- **Common** total: `C = (1 - E) - R` — the remainder; shrinks as affection rises.
- Within the rare group the 3 pieces split `R` evenly; same for common within `C`.
- A single weighted pick over all 9 uses these per-piece probabilities.

Worked example at Stranger (`m = 0`): epics = 1.5% / 1.0% / 0.5% (total 3%);
rare total = 10% (≈3.3% each); common total = 87% (≈29% each). At full affection
(`m = 1`): epics = 4% / 3% / 2% (total 9%); rare total ≈ `0.45 * 0.91 ≈ 40.95%`
(≈13.65% each); common total ≈ 50.05% (≈16.7% each).
- If the rolled piece is **new** (not yet collected for that type) and the grid
  is not complete → drop is a **piece** drop (`kind: 'piece'`): collecting it
  fills that grid cell and also awards a small coin bonus.
- If the rolled piece is a **duplicate** (already collected) **or** the grid is
  already complete → drop is a **coins** drop (`kind: 'coins'`): collecting it
  awards coins only. (User choice: "Duplicate → coins".)
- Coin amounts scale with the pet's affection milestone index and the rolled
  piece's rarity.

### Collecting
- Drops render on `petCanvas`. Click hit-testing for drops runs **before** the
  existing pet hit-test in the canvas `onclick` handler.
- On collect: award coins; if a `piece` drop, mark the grid cell collected and
  show a toast. If that fills all 9 cells for the type → **unlock the special
  decoration**: add its id to `ownedDecors`, show a celebratory toast.
- After collecting, call `topUpDrops()` so a pending drop refills the floor.

### Visibility (亮眼)
Drops are deliberately eye-catching:
- Pulsing glow ring behind the item, gentle vertical bob, orbiting sparkles.
- Glow color by rarity: **common = blue, rare = purple, epic = gold**.
- Coins drops use a coin/💰 visual with a soft gold glow.

### 九宫格 UI
- A **"🎁 Collection (n/9)"** button is added to the pet status bar.
- Clicking opens a modal showing the 3×3 grid **for that pet's type**:
  collected cells show the piece emoji + name; empty cells show a locked
  placeholder (rarity-tinted). Header shows progress `n/9` and the special
  decoration reward preview ("Unlocked! ✨" when complete).

## Data model (new fields)

Persisted in the room Firestore doc (owner writes already allow arbitrary
fields — no `firestore.rules` change needed):

- `pet.lastDropDay: string` and `pet.pendingDrops: number` — added to each
  entry in `pets[]` (serialized in `saveRoom`, restored in `migratePets`/load).
- `roomData.petDrops: Array<{ id, petId, layer, kind, pieceIdx, coins, x, y }>`
  — items currently on the floor (≤5). `x`/`y` are normalized 0–1 canvas coords.
- `roomData.petCollections: { [petType]: boolean[9] }` — collected pieces.
- Special decorations: 7 new `DECORATIONS` entries (one per pet type) flagged
  `unlockOnly: true` so the shop hides them; granted into `ownedDecors` on grid
  completion.

## Constants (new, in room-base.js)

- `PET_COLLECTIBLES: { [petType]: Array<{ emoji, name, rarity }> }` — 9 per type
  for all 7 types (cat, dog, bunny, hamster, fox, panda, goose), ordered
  common(0–2), rare(3–5), epic(6–8).
- `PET_COLLECTION_DECOR: { [petType]: decorId }` — maps a completed grid to its
  unlock-only decoration.
- Rarity → drop-weight helper keyed off the pet's affection milestone index.

## Files touched

- **games/room/js/room-base.js** — `PET_COLLECTIBLES`, `PET_COLLECTION_DECOR`,
  rarity-weight helper, 7 `unlockOnly` decorations.
- **games/room/js/room-pets.js** — `topUpDrops()` + daily/pending accounting,
  drop rendering on canvas, click-to-collect hit-testing, Collection button +
  九宫格 modal render.
- **games/room/js/room-state.js** — `roomData` defaults for `petDrops`,
  `petCollections`; pet field defaults.
- **games/room/js/room-firebase.js** — save/load `petDrops`, `petCollections`,
  `pet.lastDropDay`, `pet.pendingDrops`.
- **games/room.html** — Collection button in the pet status bar + modal container.
- **games/room/js/room-decorations.js** — ensure `unlockOnly` decorations are
  excluded from the purchasable shop list but render/place normally when owned.

## Out of scope / non-goals
- No trading or gifting of pieces between users.
- No new Firestore collection; everything lives in the existing room doc.
- Drops are per-instance; visiting another user's room shows their drops as
  read-only (no collecting others' drops), consistent with existing
  `viewingUid !== currentUid` guards.

## Testing
- Day-rollover: simulate `lastDropDay` in the past → topUp places drops up to 5,
  respecting per-pet pending cap of 5.
- Floor cap: with ≥5 pending, floor never exceeds 5; collecting refills.
- Rarity odds: at low vs high affection the weighting shifts toward epic.
- Duplicate/complete → coins-only behavior.
- Grid completion grants the unlock-only decoration exactly once and it appears
  in the placeable decorations, never in the shop.
- Persistence: drops, collections, pending counts survive reload.
