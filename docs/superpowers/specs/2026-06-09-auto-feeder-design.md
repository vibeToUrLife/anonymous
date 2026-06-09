# Auto-Feeder — Design

**Date:** 2026-06-09
**Status:** Approved pending spec review

## Summary

An **Auto-Feeder** is a one-time coin purchase that automatically keeps every
pet's **hunger and thirst** topped up by spending coins on the most
cost-efficient food and drink — both **while the room is open** and
**retroactively for the time the player was away** (the main value: pets no
longer starve and lose affection / 好感度 during an absence).

## Mechanics

### The device & unlock
- One-time purchase **🤖 Auto-Feeder — `AUTO_FEEDER_COST` = 2,500 coins**,
  bought from the **⬆ Feed** panel.
- Once owned, the Feed panel shows a global **ON/OFF toggle** (default ON)
  covering **all pets on all floors**.
- New `roomData` flags: `autoFeeder` (boolean, owned) and `autoFeedOn`
  (boolean, toggle). Persisted in Firestore like the other room flags.

### Refill rule ("keep topped up")
- Constants: `AUTOFEED_THRESHOLD = 50`, `AUTOFEED_TARGET = 100`.
- When a pet's **hunger or thirst is at/below 50%**, the stat is refilled back
  to **100%**, spending coins.
- The Auto-Feeder buys the **most coin-efficient** item, derived from the
  existing `FOODS` / `DRINKS` arrays (NOT hardcoded), so it stays correct if
  prices are rebalanced:
  - food rate = `min(cost / restore)` over `FOODS` → Apple = `50/20` = **2.5
    coins/point**.
  - drink rate = `min(cost / restore)` over `DRINKS` → Water = `20/15` ≈
    **1.333 coins/point**.

### Offline catch-up (the main value)
On room load, **after** plant offline earnings are credited (so idle income can
help pay for it), if the device is owned and ON and `viewingUid === currentUid`:
- The room already computes `decay` = number of 1%-per-10-min cycles elapsed
  while away (each cycle lowers hunger and thirst by 1 each).
- For each pet, the Auto-Feeder covers the `decay` points of hunger and thirst
  it lost — charging `ceil(decay * foodRate + decay * drinkRate)` — and sets the
  pet back to **100/100** (no starvation, no affection loss).
- **Bounded by coins:** pets are funded in array order until coins run out. A
  pet that can't be afforded instead takes the **normal decay + starvation**
  (the existing behavior) — so being broke means pets are fed only as far as the
  wallet allows; nothing is free.
- A one-time summary toast on load (mirrors the plant-earnings toast), shown
  only when coins were actually spent:
  *"🤖 Auto-Feeder kept your pets fed — spent X coins while you were away."*
- **No time cap** on protection (it lasts as long as coins do). The natural
  coins bound plus the transparent summary prevents a silent wallet drain.

### Live top-up (while the room is open)
Hooks into the existing hunger-decay interval (the periodic tick that already
decays hunger/thirst live). Each tick, for every owned pet with the device ON:
if hunger ≤ 50% refill to 100% (if affordable), same for thirst. Because decay
is slow (1%/10 min) this rarely fires mid-session — it is a safety net and does
not spam toasts (live refills are silent; coins update as usual).

### Guards
- Owner-only: never runs for `viewingUid !== currentUid` (visitors don't trigger
  auto-feed in someone else's room).
- If `!autoFeeder` or `!autoFeedOn`, behavior is exactly as today.

## Data model (new fields)
- `roomData.autoFeeder: boolean` — device owned.
- `roomData.autoFeedOn: boolean` — toggle (defaults true when the device is
  bought).
- Both saved in `saveRoom` and restored on load (and reset in `initRoom`),
  following the existing flag conventions. Owner Firestore writes already allow
  arbitrary fields — no `firestore.rules` change.

## Constants (room-base.js)
- `AUTO_FEEDER_COST = 2500`
- `AUTOFEED_THRESHOLD = 50`
- `AUTOFEED_TARGET = 100`

## Pure logic module (new: `games/room/js/room-autofeed.js`)
Dual-mode (browser global + Node `module.exports`), dependency-free, like
`room-drops.js`, so the coin math is unit-tested with `node --test`:
- `bestCoinsPerPoint(items)` → `min(cost / restore)` over an items array.
- `statRefillCost(current, target, rate)` →
  `Math.ceil(max(0, target - current) * rate)`.
- `liveRefillPlan(pet, coins, foodRate, drinkRate, opts)` → for the live tick:
  returns `{ hunger, thirst, coinsSpent }` applying the threshold→target rule if
  affordable, else unchanged.
- `planOfflineAutoFeed({ pets, coins, decay, foodRate, drinkRate, target,
  starveLoss })` → returns `{ pets: [{ hunger, thirst, affection }], coinsSpent }`:
  funds pets in order (each to `target`/`target`, cost
  `ceil(decay*foodRate + decay*drinkRate)`); a pet that can't be afforded gets
  `hunger = max(0, h - decay)`, `thirst = max(0, t - decay)`, and
  `affection = max(0, affection - max(0, decay - h) * starveLoss)` (mirrors the
  existing starvation rule).

## Files touched
- **games/room/js/room-autofeed.js** (new) — pure logic + exports.
- **games/room/js/room-autofeed.test.js** (new) — Node tests for the above.
- **games/room.html** — load `room-autofeed.js` before room-pets/room-render;
  Feed-panel buy/toggle markup if not built dynamically.
- **games/room/js/room-base.js** — the three constants.
- **games/room/js/room-actions.js** — `buyAutoFeeder()`, `toggleAutoFeed()`.
- **games/room/js/room-firebase.js** — save/load `autoFeeder`/`autoFeedOn`;
  offline catch-up call (after plant earnings); skip normal decay for fed pets;
  summary toast.
- **games/room/js/room-render.js** — Feed-panel Auto-Feeder section (buy button
  when unowned; ON/OFF toggle + one-line explainer when owned).
- **games/room/js/room-pets.js** (or wherever the live decay interval lives) —
  the live top-up tick.

## Out of scope / non-goals
- No per-pet toggle (global only).
- No auto-play with toys / affection boosting (only hunger + thirst).
- No new Firestore collection; flags live in the existing room doc.
- No offline time cap (coins are the only bound).

## Testing
- `bestCoinsPerPoint` picks the lowest cost/restore (Apple for FOODS, Water for
  DRINKS).
- `statRefillCost` zero when already at/above target; rounds up.
- `liveRefillPlan` refills only when ≤ threshold and affordable; leaves stats
  unchanged when unaffordable; never overspends.
- `planOfflineAutoFeed`: all pets fed to 100/100 when coins suffice; coins bound
  funds pets in order and the rest take normal decay + starvation; total
  `coinsSpent` never exceeds `coins`; zero `decay` → zero spend.
- Manual: buy device, toggle, simulate a past `updatedAt`, reload → pets at
  100/100 and the summary toast shows; toggle OFF → old behavior; broke wallet →
  partial coverage.
