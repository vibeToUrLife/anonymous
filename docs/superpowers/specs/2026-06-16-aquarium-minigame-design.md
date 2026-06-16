# Aquarium Mini-Game — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved design (pending spec review) → next step: implementation plan
- **Owner approval required** before any code change or git commit (per project rules).

## 1. Summary

A new **My Aquarium** feature: a living underwater tank where players place the fish
they have unlocked in the **Fishing** mini-game (exactly **one fish per species**). Placed
fish swim in an animated scene, earn a small passive coin drip, and drive a collection
**completion %** with set-completion badges. Players can recolor the tank with theme
presets, play three short tap mini-games for coin spikes, and visit/like other players'
tanks.

The aquarium is built as a **new `?view=aquarium` view inside `games/room.html`**, mirroring
the existing My Farm view — not a standalone page — so it reuses the room's coin storage,
offline-earning machinery, achievements, room-visiting, and Firestore plumbing.

## 2. Core loop

> Fish in **Fishing** to unlock species (saved to `leaderboard_fishing/{uid}.caughtFishNames`).
> Open **My Aquarium**, tap any unlocked species from the side roster to drop it into the tank
> (1 per species; uncaught species show as grey "???" silhouettes that advertise what is still
> missing). Fish swim and slowly earn coins; on return a "while you were away" modal banks the
> offline coins. In a 30–60 second break you add new catches, collect coins, play one quick
> tap-game for a coin spike, and watch your **completion %** climb toward badges.

## 3. Scope

### In scope (v1)
1. **Navigation** — a "My Aquarium" quick-link card in the sidebar of `index.html`.
2. **Aquarium view** — a new `?view=aquarium` mode in `room.html` with an animated tank.
3. **Place fish, one per species** — roster + tap-to-add/remove; uncaught = silhouette.
4. **Idle economy** — passive coins by rarity, offline-banked (3h cap, ≥1h mandatory modal).
5. **Completion %** — `X/13` header + per-rarity progress bars; junk = separate "Trash" tier.
6. **Badges** — set-completion achievements wired into the existing achievements system.
7. **Theme presets** — one-tap water-tint/lighting (Tropical / Abyss / Sunset / Moonlit).
8. **Mini-games (3)** — Feeding Frenzy, Fish Race & Bet, Bubble Pop.
9. **Social** — visit other tanks (read-only) + ❤️ Like.

### Out of scope (deferred to later phases)
- Active care: feeding/hunger, cleanliness, fish growth tiers, breeding/morphs.
- Full decor: drag-to-place substrate / plants / ornaments; fish arrangement by depth/zone.
- Tank-size upgrades; auto-skimmer purchase.
- Gifting fish/food; leaderboards (rarest / most-complete); tank guestbook.
- Trophy "biggest caught" size badges; shareable tank PNG.

## 4. Architecture & files

**Decision: extend the `room.html` view system; do not build a standalone page.** The Farm is
the exact precedent (`?view=farm`), and nearly every primitive the aquarium needs already lives
in the room module set (`saveRoom`/`userDocRef`, offline-coin machinery, `checkAchievements`,
`visitRoom`, the `viewingUid === currentUid` trust guard, account-switch reset).

### Files to ADD
| File | Purpose |
|------|---------|
| `games/fish-render.js` | Shared fish renderer extracted from `fishing.html`: `FISH_TYPES`, `FISH_ART`, `RARITY_COLORS`, `drawFish`, `makeFishCanvas`, and helpers (`drawEye`, `bodyGrad`, `drawFishPattern`, all species renderers). Pure functions, no game-state coupling. |
| `games/room/js/room-aquarium.js` | **Pure logic** (no DOM): idle-coin accrual + cap, completion math, rarity score, race odds, mini-game payout helpers, daily-gate helpers. Mirrors `room-farm.js`. Unit-tested. |
| `games/room/js/room-aquarium-view.js` | View + panel + mini-games rendering and interaction. Mirrors `room-farm-view.js`. |
| `games/room/js/room-aquarium.test.js` | Node unit tests for `room-aquarium.js`. Mirrors `room-farm.test.js`. |

### Files to MODIFY
| File | Change |
|------|--------|
| `index.html` | Add a 3rd `.game-card` in the quick-links block (~lines 840–857): emoji 🐠, title "My Aquarium", sub "Your Fishing collection", `href="./games/room.html?view=aquarium"`. Verify the `.game-card-emoji:nth-of-type(even)` tint alternation still reads well with 3 cards; set the emoji background inline if needed. |
| `games/fishing.html` | Remove the inline renderer block and `<script src="fish-render.js">` instead. Behavior must be **identical** — re-verify Fishing after the move. |
| `games/room.html` | Add `#aquariumView` container (clone `#farmView` markup), `#aquariumCanvas` (the `#roomBgCanvas` absolute `inset:0` pattern), and `<script src>` for `fish-render.js`, `room-aquarium.js`, `room-aquarium-view.js`. |
| `games/room/js/room-firebase.js` | Add `view=aquarium` branch in the URL handler (~lines 333–334) → `openAquarium()`; add new fields to the `saveRoom()` payload + `roomData` init defaults; read `leaderboard_fishing/{uid}.caughtFishNames` inside `openAquarium`. |
| `games/room/js/room-base.js` | Add aquarium constants (yields, caps, theme presets, mini-game gates) and append aquarium set-completion entries to the `ACHIEVEMENTS` array. |
| `games/room/css/room.css` | Aquarium panel + tank styles, reusing farm classes (`.farm-section-title`, `.farm-shop-row`, `.farm-herd-bar`, collapsible head) where possible. |

### Shared-renderer extraction risk & mitigation
The renderer is currently 100% inline in `fishing.html` with no shared module. Extraction must
move **pure** drawing functions only; if any function secretly relies on fishing-only globals
(`phase`, `RARITY_COLORS_DOM`, canvas state), it must be parameterised, not pulled. `RARITY_COLORS_DOM`
(DOM text colors) stays in `fishing.html`; only the canvas renderer moves. After extraction,
regression-test the Fishing game (pond fish, hooked fish, catch reveal, collection grid) to
confirm identical rendering.

## 5. Data model

All new state lives on the existing **`rooms/{uid}`** Firestore doc, persisted inside the
already-batched `saveRoom()` merge (next to `farmAnimals` / `farmStock`). No new collection.

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `aquariumFish` | `string[]` | `[]` | Placed species, by exact `FISH_TYPES.name`. "1 per species" = push only if absent. |
| `aquariumTheme` | `string` | `'tropical'` | Active theme preset id. |
| `aquariumLikes` | `number` | `0` | Likes received from visitors. |
| `aquariumLastCollect` | `number` (ms) | `0` | Timestamp anchor for idle-coin accrual. |
| `aquariumRaceDay` | `string` | `''` | Day key (`YYYY-MM-DD`) of last Fish Race played (daily gate). |
| `aquariumBubbleDay` | `string` | `''` | Day key of last Bubble Pop played (daily gate). |
| `aquariumFrenzyAt` | `number` (ms) | `0` | Timestamp of last Feeding Frenzy (cooldown gate). |

**Species name is the immutable join key** across `FISH_TYPES`, `FISH_ART`, `caughtFishNames`,
and `aquariumFish`. Never rename a species; a typo silently renders a fallback fish or drops it
from completion math.

**Ephemeral (never saved):** each fish's live swim position/direction/animation phase lives in
an in-memory `_aquariumAnimStates` map, recomputed each open — same rule as `_farmAnimStates`.

**Reading unlocks:** the source of truth is `leaderboard_fishing/{uid}.caughtFishNames` (an
**array**, written by Fishing via `Array.from(caughtFishSet)`). The aquarium reads that doc on
**every** `openAquarium()` and converts to a `Set` for O(1) lookups:
`caughtFishSet = new Set(doc.data().caughtFishNames || [])`.

## 6. Navigation

Copy the My Farm quick-link card pattern into a third `flex:1` card:

```html
<a href="./games/room.html?view=aquarium" class="game-card" style="flex:1">
  <span class="game-card-emoji">🐠</span>
  <div>
    <div class="game-card-title">My Aquarium</div>
    <div class="game-card-sub">Your Fishing collection</div>
  </div>
</a>
```

(The quick-links row currently holds two cards; adding a third in the same flex row is fine —
confirm it wraps/sizes acceptably on narrow phones, else stack at a breakpoint.)

## 7. View lifecycle

Mirror the farm: an `isAquariumView` flag, `openAquarium()` / `closeAquarium()`, and a
`v === 'aquarium'` branch in the URL handler guarded by `viewingUid === currentUid && typeof
openAquarium === 'function'`. `openAquarium()`:
1. sets the flag, shows `#aquariumView`, switches the side panel to aquarium mode,
2. re-reads `leaderboard_fishing/{uid}.caughtFishNames`,
3. runs the offline-coin plan (see §9) and shows the away-modal if ≥1h,
4. starts the RAF draw loop.

The RAF loop **early-exits when `!isAquariumView`** and is throttled to ~42ms (≈24fps), exactly
like `drawFarmCanvas`, so it never burns CPU while the room/farm is showing.

## 8. Tank rendering

Reuses the Fishing underwater scene via `fish-render.js` + a copied scene routine:
- water gradient (3-stop linear) + 8 animated caustic radials + surface shimmer,
- rising **bubble** particles,
- `drawFish(ctx, type, size, { phase })` per entry in `aquariumFish`, positioned from
  `_aquariumAnimStates`, **clamped to `[0, W]`** (not spliced off-screen like the pond), flipped
  by swim direction via `ctx.scale(dir, 1)`.

Draw order: water/theme tint → caustics → fish → bubbles → active mini-game layer → overlays.
The **water stays aquatic blue**, but all panels/modals/overlays use the app theme tokens
(`--g-card`, `--g-accent`, `--g-scrim`) — never the fishing-blue tints.

## 9. Idle economy

Each placed fish yields coins per hour by rarity (tunable in `room-aquarium.js`):

| Rarity | coins/hour (initial) |
|--------|----------------------|
| common | 1 |
| rare | 3 |
| epic | 6 |
| legendary | 12 |
| junk | 0 |

- Total yield = sum over `aquariumFish`, **capped at 3h offline** (reuse `FARM_OFFLINE_CAP_MS`).
- On open: <1h auto-banks silently; **≥1h shows the mandatory "while you were away" collect
  modal** (reuse `_offlinePlan` / `_applyOfflinePlan` / `_showFarmAway` pattern, gated before the
  view is interactive).
- Live drip while the view is open (small toast on collect), mirroring the plant/farm pattern.
- Coins are **whole numbers** (`Math.floor` on load/save); all spends/earns route through
  `saveRoom`. Yields are deliberately modest so the aquarium never dwarfs the Farm.

Pure function (tested): `aquariumIdleCoins(aquariumFish, elapsedMs, capMs)` → integer coins.

## 10. Completion & badges

- **Catchable species = 13** (15 total minus 2 junk: Old Boot, Seaweed).
- Header: `Aquarium 7/13 · 54%`. Per-rarity progress bars (common/rare/epic/legendary), each
  `placed/total` for that tier, tinted with `RARITY_COLORS_DOM`, reusing the farm food-bar markup.
- Junk is a separate cheeky **🗑️ Trash Collection** tier, **excluded** from the core `X/13`.
- **Badges** append to the `ACHIEVEMENTS` array in `room-base.js` using the existing
  `{id, icon, name, desc, check:(d)=>...}` shape, e.g.
  `check:(d)=>FISH_TYPES.filter(f=>f.rarity==='epic').every(f=>(d.aquariumFish||[]).includes(f.name))`.
  Badges: Reef Regular (all commons), Deep Sea Diver (all rares), Apex Tank (all epics),
  Legend Keeper (all 3 legendaries), Dumpster Diver (both junk), **Aquarist 100%** (all 13).
  `checkAchievements()` is called after each placement (like `buyFarmAnimal` does); it already
  diffs, persists, toasts, and displays.

## 11. Theme presets

One-tap presets recolor the water gradient + caustic color. Each preset is a small object
`{ id, name, grad:[c0,c1,c2], causticRGB }`:
- **Tropical** (default) — `#1a3a5c → #15406a → #0a1e38`, caustic `100,200,255`.
- **Deep Abyss** — darker blues/teal, dim caustics.
- **Sunset Reef** — warm magenta/orange tint.
- **Moonlit** — desaturated blue-grey, soft caustics.

Selecting a preset is instant and saved to `aquariumTheme`. Theme cards reuse `.farm-shop-row` /
`.game-card` markup; only one active at a time (mirrors the room "rug" single-select model).

## 12. Mini-games

All three are short active bursts that pay coins, **gated** so they are treats, not coin printers.
Payout/odds helpers live in `room-aquarium.js` (tested).

### 12.1 Feeding Frenzy
- **Play:** tap a "🍤 Feed" button → ~12 food flakes fall over ~15s; tank fish swim toward the
  nearest flake; tapping a fish as it reaches a flake = "perfect bite" (+combo). Combo multiplier
  shown top-center.
- **Payout:** `coins = bites * 2 + topCombo * 5` (tunable), floored.
- **Gate:** cooldown via `aquariumFrenzyAt` (e.g. 30 min).
- **Reuse:** flakes = particle array update; fish-to-target = pond fish move/wobble + `drawFish`;
  floating "+1" text = `_farmParticles` pattern; "Feed" button/cost UI = `refillFarmFood`.

### 12.2 Fish Race & Bet
- **Play:** 3–4 of your placed fish line up at the left; bet a coin stake (stepper UI) on one;
  they sprint right with jittery speed; winner pays `stake × odds`.
- **Odds:** derived from `FISH_TYPES.speed` (faster = lower payout; clamp ~1.5×–4×).
- **Gate:** **once/day** via `aquariumRaceDay`. Requires ≥3 placed fish.
- **Reuse:** racers = pond horizontal-move loop + finish-line at `x > W`; stepper = plant-qty
  buttons; daily gate = `_farmToday()` + "done today" check; stake/payout = coins ± + `saveRoom`.

### 12.3 Bubble Pop
- **Play:** tap "🫧 Bubbles!" → ~20s wave of coin/pearl/jackpot bubbles rising at increasing
  speed; tap to pop. Coin bubbles pay a few coins; pearls bank a small streak bonus; the rare
  **jackpot** bubble pays a lump.
- **Jackpot odds** scale with legendary ownership: `base 2% + 2% per legendary placed`, capped 10%.
- **Gate:** **once/day** via `aquariumBubbleDay`. Miss-rate does not punish.
- **Reuse:** rising bubbles = existing bubble particle system; tap hit-test = normalized-coord
  compare; escalation timer = the `dt`-capped `waterTime` accumulator.

## 13. Social — Visit + Like

- **Visit:** reuse the farm `visitRoom(uid)` pipeline → set `viewingUid`, load their `rooms/{uid}`
  doc, render their `aquariumFish` in a **read-only** animated tank (no placing/editing), exactly
  like the read-only visiting-farm panel.
- **Like:** a ❤️ button increments the owner's `aquariumLikes` via the proven cross-user write the
  gift handler already uses (`db.collection('rooms').doc(targetUid).update({ aquariumLikes: increment(1) })`),
  with a **per-visit in-session dedupe** flag to prevent spam. The owner sees `❤️ N likes` on their
  tank header.
- All editing mutations remain gated by `viewingUid === currentUid`.

## 14. Edge cases, anti-cheat & error handling

- **Anti-tamper:** on placing a fish, reject any name not in the player's `caughtFishSet`
  (client could otherwise place a never-unlocked species — "never trust the client").
- **Stale unlocks:** Fishing currently writes `caughtFishNames` only on score-submit. To avoid
  "caught but can't place," (a) re-read the leaderboard doc on every `openAquarium()`, **and**
  (b) add a small immediate write in Fishing when a *new* species is first caught (rare event,
  cheap). Both together remove the one-run delay.
- **Read-only visitors:** all mutations gated by `viewingUid === currentUid`.
- **Coins integrity:** whole numbers (`Math.floor`), all spends/earns through `saveRoom`.
- **Offline double-count / account switch:** reset the `_offlineCoinsCollected`-style one-shot
  flag and the `aquariumLastCollect` anchor on account switch / re-init, exactly like the farm.
- **RAF/CPU:** the loop early-exits when `!isAquariumView`; only runs while the view is open.
- **Visual cohesion:** chrome/overlays on `--g-` theme tokens, not fishing-blue.

## 15. Testing

`room-aquarium.test.js` (Node `node:test`, mirroring `room-farm.test.js`) covers the pure logic:
- `aquariumIdleCoins` accrual + 3h cap + rarity weighting,
- completion math (`X/13`, per-rarity counts, junk excluded),
- rarity score helper,
- race odds (faster → lower payout, clamped),
- daily-gate / cooldown helpers.

Manual regression after the renderer extraction: Fishing pond fish, hooked fish, catch reveal,
and collection grid all render identically.

## 16. Build phases (each independently reviewable)

- **Phase A — Showcase core:** extract `fish-render.js` (+verify Fishing) → nav card → aquarium
  view shell + tank scene + place fish (1/species) + completion % & rarity bars + badges.
- **Phase B — Idle + look:** passive coins + away-collect modal + theme presets.
- **Phase C — Mini-games:** Feeding Frenzy, Fish Race & Bet, Bubble Pop.
- **Phase D — Social:** visit + Like.

## 17. Tunable parameters (initial values; balance later)

Idle yields (§9), Feeding Frenzy payout + 30-min cooldown, Race odds clamp 1.5×–4× + once/day,
Bubble Pop jackpot `2% + 2%/legendary` (max 10%) + once/day, theme preset colors (§11). All
centralised as constants in `room-base.js` / `room-aquarium.js` for easy tuning.
