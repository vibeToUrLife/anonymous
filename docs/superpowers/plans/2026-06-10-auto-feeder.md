# Auto-Feeder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A purchasable Auto-Feeder that automatically keeps every pet's hunger and thirst topped up by spending coins — both live and retroactively for time the player was away.

**Architecture:** All coin math lives in a new dependency-free `room-autofeed.js` (browser global + Node module, unit-tested with `node --test`, like `room-drops.js`). The room files wire it into the existing offline-decay load path, the live decay interval, persistence, and the Feed panel UI.

**Tech Stack:** Vanilla JS (ES2017), Firebase Firestore (compat). Tests: `node --test` (Node 24, built-in, zero deps). No build step — `<script src>` tags share global scope.

**Reference spec:** `docs/superpowers/specs/2026-06-09-auto-feeder-design.md`

---

## File Structure

- **Create** `games/room/js/room-autofeed.js` — pure logic (rates, costs, offline plan). Browser global + Node module.
- **Create** `games/room/js/room-autofeed.test.js` — Node tests.
- **Modify** `games/room.html` — load `room-autofeed.js` before room-firebase/render/actions.
- **Modify** `games/room/js/room-base.js` — `AUTO_FEEDER_COST`, `AUTOFEED_THRESHOLD`, `AUTOFEED_TARGET`.
- **Modify** `games/room/js/room-state.js` + `room-firebase.js` — defaults + save/load of `autoFeeder`/`autoFeedOn`.
- **Modify** `games/room/js/room-actions.js` — `buyAutoFeeder()`, `toggleAutoFeed()`.
- **Modify** `games/room/js/room-render.js` — Auto-Feeder section in the Feed panel.
- **Modify** `games/room/js/room-firebase.js` — offline catch-up + live top-up.

---

## Task 1: Pure Auto-Feeder logic module + tests

**Files:**
- Create: `games/room/js/room-autofeed.js`
- Test: `games/room/js/room-autofeed.test.js`

- [ ] **Step 1: Write the failing test file**

Create `games/room/js/room-autofeed.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const A = require('./room-autofeed.js');

// Sample tables mirroring FOODS/DRINKS shape (cost, restore) from room-base.js.
const FOODS = [
  { cost: 30, restore: 10 }, { cost: 50, restore: 20 }, { cost: 80, restore: 30 },
  { cost: 120, restore: 45 }, { cost: 200, restore: 70 }, { cost: 300, restore: 100 },
];
const DRINKS = [
  { cost: 20, restore: 15 }, { cost: 50, restore: 25 }, { cost: 80, restore: 35 },
  { cost: 120, restore: 50 }, { cost: 180, restore: 70 }, { cost: 280, restore: 100 },
];

test('bestCoinsPerPoint picks the lowest cost-per-restore item', () => {
  assert.strictEqual(A.bestCoinsPerPoint(FOODS), 50 / 20);   // Apple = 2.5
  assert.strictEqual(A.bestCoinsPerPoint(DRINKS), 20 / 15);  // Water ≈ 1.333
});

test('statRefillCost is zero at/above target and rounds up otherwise', () => {
  assert.strictEqual(A.statRefillCost(100, 100, 2.5), 0);
  assert.strictEqual(A.statRefillCost(120, 100, 2.5), 0);
  assert.strictEqual(A.statRefillCost(50, 100, 2.5), 125);      // 50 * 2.5
  assert.strictEqual(A.statRefillCost(50, 100, 20 / 15), 67);   // ceil(50 * 1.333..)
});

test('liveRefillPlan refills stats at/below threshold when affordable', () => {
  const r = A.liveRefillPlan({ hunger: 40, thirst: 90 }, 1000, 2.5, 20 / 15, { threshold: 50, target: 100 });
  assert.strictEqual(r.hunger, 100);     // 40 <= 50 -> refilled
  assert.strictEqual(r.thirst, 90);      // 90 > 50 -> untouched
  assert.strictEqual(r.coinsSpent, 150); // ceil(60 * 2.5)
});

test('liveRefillPlan skips unaffordable stat but funds the next from remaining', () => {
  const r = A.liveRefillPlan({ hunger: 40, thirst: 40 }, 100, 2.5, 20 / 15, { threshold: 50, target: 100 });
  // hunger needs ceil(60*2.5)=150 > 100 -> skip; thirst needs ceil(60*1.333)=80 <= 100 -> fund
  assert.strictEqual(r.hunger, 40);
  assert.strictEqual(r.thirst, 100);
  assert.strictEqual(r.coinsSpent, 80);
});

test('liveRefillPlan leaves above-threshold stats alone and spends nothing', () => {
  const r = A.liveRefillPlan({ hunger: 80, thirst: 80 }, 1000, 2.5, 20 / 15, { threshold: 50, target: 100 });
  assert.deepStrictEqual(r, { hunger: 80, thirst: 80, coinsSpent: 0 });
});

test('planOfflineAutoFeed feeds all pets to target when coins suffice', () => {
  const pets = [
    { hunger: 30, thirst: 30, affection: 100 },
    { hunger: 0, thirst: 0, affection: 50 },
  ];
  const r = A.planOfflineAutoFeed({ pets, coins: 100000, decay: 10, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets, [
    { hunger: 100, thirst: 100, affection: 100 },
    { hunger: 100, thirst: 100, affection: 50 },
  ]);
  const petCost = Math.ceil(10 * 2.5 + 10 * (20 / 15)); // 39
  assert.strictEqual(r.coinsSpent, petCost * 2);
});

test('planOfflineAutoFeed funds pets in order; the rest take normal decay + starvation', () => {
  const pets = [
    { hunger: 100, thirst: 100, affection: 100 },
    { hunger: 5, thirst: 80, affection: 30 },
  ];
  const petCost = Math.ceil(10 * 2.5 + 10 * (20 / 15)); // 39
  const r = A.planOfflineAutoFeed({ pets, coins: petCost, decay: 10, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets[0], { hunger: 100, thirst: 100, affection: 100 });
  // pet2 unaffordable -> decay 10: hunger 0, thirst 70, starveCycles=10-5=5 -> affection 30-10=20
  assert.deepStrictEqual(r.pets[1], { hunger: 0, thirst: 70, affection: 20 });
  assert.strictEqual(r.coinsSpent, petCost);
});

test('planOfflineAutoFeed with zero coins applies normal decay to all', () => {
  const r = A.planOfflineAutoFeed({ pets: [{ hunger: 50, thirst: 50, affection: 10 }], coins: 0, decay: 10, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets[0], { hunger: 40, thirst: 40, affection: 10 });
  assert.strictEqual(r.coinsSpent, 0);
});

test('planOfflineAutoFeed with zero decay is a no-op', () => {
  const r = A.planOfflineAutoFeed({ pets: [{ hunger: 60, thirst: 60, affection: 10 }], coins: 1000, decay: 0, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets[0], { hunger: 60, thirst: 60, affection: 10 });
  assert.strictEqual(r.coinsSpent, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test games/room/js/room-autofeed.test.js`
Expected: FAIL — `Cannot find module './room-autofeed.js'`.

- [ ] **Step 3: Implement `room-autofeed.js`**

Create `games/room/js/room-autofeed.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test games/room/js/room-autofeed.test.js`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Load the script in the page**

In `games/room.html`, find `<script src="room/js/room-drops.js"></script>` and add immediately **after** it:

```html
  <script src="room/js/room-autofeed.js"></script>
```

(It must load before `room-firebase.js`, `room-render.js`, `room-actions.js`, which call these functions.)

- [ ] **Step 6: Commit**

```bash
git add games/room/js/room-autofeed.js games/room/js/room-autofeed.test.js games/room.html
git commit -m "feat(room): add pure Auto-Feeder cost/offline logic with tests"
```

---

## Task 2: Constants + persistence

**Files:**
- Modify: `games/room/js/room-base.js` (after the `DRINKS` array, ~line 179)
- Modify: `games/room/js/room-state.js:4` and `games/room/js/room-firebase.js` (initRoom literal, save, load)

- [ ] **Step 1: Add the constants to `room-base.js`**

In `games/room/js/room-base.js`, immediately **after** the `DRINKS` array's closing `];` (~line 179), add:

```js
    // Auto-Feeder: one-time purchase that keeps all pets' hunger & thirst topped up.
    const AUTO_FEEDER_COST = 2500;
    const AUTOFEED_THRESHOLD = 50;  // refill a stat when it drops to/below this
    const AUTOFEED_TARGET = 100;    // refill back up to this
```

- [ ] **Step 2: Add defaults to both `roomData` literals**

In `games/room/js/room-state.js` line 4, inside the `let roomData = { … }` literal, add after `petDrops: [], petCollections: {},`:

```js
autoFeeder: false, autoFeedOn: false,
```

In `games/room/js/room-firebase.js`, the `roomData = { … }` reset literal inside `initRoom`, add the same after its `petDrops: [], petCollections: {},`:

```js
autoFeeder: false, autoFeedOn: false,
```

- [ ] **Step 3: Persist in `saveRoom`**

In `games/room/js/room-firebase.js` `saveRoom`, in the `data` object, after the `petCollections: roomData.petCollections || {},` line, add:

```js
        autoFeeder: roomData.autoFeeder || false,
        autoFeedOn: roomData.autoFeedOn || false,
```

- [ ] **Step 4: Restore on load**

In `games/room/js/room-firebase.js`, after the `roomData.petCollections = d.petCollections || {};` load line, add:

```js
        roomData.autoFeeder = d.autoFeeder || false;
        roomData.autoFeedOn = d.autoFeedOn || false;
```

- [ ] **Step 5: Syntax-check**

Run: `node --check games/room/js/room-base.js && node --check games/room/js/room-state.js && node --check games/room/js/room-firebase.js && echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add games/room/js/room-base.js games/room/js/room-state.js games/room/js/room-firebase.js
git commit -m "feat(room): add Auto-Feeder constants and persistence"
```

---

## Task 3: Buy/toggle actions + Feed-panel UI

**Files:**
- Modify: `games/room/js/room-actions.js`
- Modify: `games/room/js/room-render.js` (`renderUpgrade`, ~line 1547)

- [ ] **Step 1: Add buy/toggle actions**

In `games/room/js/room-actions.js`, after the `useToy`/`drinkPet` feeding functions (anywhere at top level among the other actions; e.g. right after `drinkPet`), add:

```js
    async function buyAutoFeeder() {
      if (viewingUid !== currentUid) return;
      if (roomData.autoFeeder) return;
      if (roomData.coins < AUTO_FEEDER_COST) return showToast('Not enough coins!', 'error');
      roomData.coins -= AUTO_FEEDER_COST;
      roomData.autoFeeder = true;
      roomData.autoFeedOn = true;
      await saveRoom();
      showToast('🤖 Auto-Feeder installed! Your pets will stay fed automatically.', 'success');
      renderAll();        // refresh coin counter
      renderUpgrade();    // refresh the Feed panel
    }

    async function toggleAutoFeed() {
      if (viewingUid !== currentUid) return;
      if (!roomData.autoFeeder) return;
      roomData.autoFeedOn = !roomData.autoFeedOn;
      await saveRoom();
      showToast(roomData.autoFeedOn ? '🤖 Auto-Feeder ON' : '🤖 Auto-Feeder OFF', 'success');
      renderUpgrade();
    }
```

- [ ] **Step 2: Add the Auto-Feeder UI to the Feed panel**

In `games/room/js/room-render.js`, inside `renderUpgrade()`, find the line `petHtml += '<div class="shop-section">';` (~line 1547, inside `if (activePets.length) {`). Immediately **after** it, add:

```js
        // ── Auto-Feeder ──
        const _afOwned = roomData.autoFeeder;
        const _afOn = roomData.autoFeedOn;
        petHtml += '<div style="background:rgba(255,210,61,0.08);border:1px solid rgba(255,210,61,0.25);border-radius:12px;padding:10px 12px;margin-bottom:12px">';
        petHtml += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
        petHtml += '<div style="font-size:12px;font-weight:700;color:#ffd23d">🤖 Auto-Feeder</div>';
        if (!_afOwned) {
          const _afCan = roomData.coins >= AUTO_FEEDER_COST;
          petHtml += '<button onclick="buyAutoFeeder()" ' + (_afCan ? '' : 'disabled') +
            ' style="font-size:11px;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,210,61,0.4);' +
            'background:' + (_afCan ? 'rgba(255,210,61,0.18)' : 'rgba(255,255,255,0.05)') + ';color:' +
            (_afCan ? '#ffd23d' : 'rgba(255,255,255,0.35)') + ';cursor:' + (_afCan ? 'pointer' : 'not-allowed') + '">' +
            coinSVG(11) + ' ' + AUTO_FEEDER_COST + ' · Buy</button>';
        } else {
          petHtml += '<button onclick="toggleAutoFeed()" style="font-size:11px;padding:6px 14px;border-radius:8px;border:1px solid ' +
            (_afOn ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.2)') + ';background:' +
            (_afOn ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)') + ';color:' +
            (_afOn ? '#34d399' : 'rgba(255,255,255,0.5)') + ';cursor:pointer;font-weight:700">' +
            (_afOn ? 'ON' : 'OFF') + '</button>';
        }
        petHtml += '</div>';
        petHtml += '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:6px">Keeps every pet\'s hunger &amp; thirst topped up automatically — even while you\'re away. Spends your coins.</div>';
        petHtml += '</div>';
```

- [ ] **Step 3: Syntax-check**

Run: `node --check games/room/js/room-actions.js && node --check games/room/js/room-render.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Browser smoke check**

Serve repo root (`python -m http.server 8000`), open the room (access code + sign in). Open the **⬆ Feed** panel. In DevTools console:

```js
roomData.coins = 5000; renderUpgrade();
```

Expected: a 🤖 Auto-Feeder card with a "2500 · Buy" button at the top of the food panel. Click Buy → toast, coins drop by 2500, button becomes an **ON** toggle. Click it → toggles ON/OFF with a toast. Then:

```js
roomData.autoFeeder && typeof roomData.autoFeedOn === 'boolean'
```

Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add games/room/js/room-actions.js games/room/js/room-render.js
git commit -m "feat(room): add Auto-Feeder buy/toggle actions and Feed-panel UI"
```

---

## Task 4: Offline catch-up + live top-up

**Files:**
- Modify: `games/room/js/room-firebase.js` (offline decay block ~line 153; live decay interval ~line 238)

- [ ] **Step 1: Skip the normal offline decay when Auto-Feeder is active**

In `games/room/js/room-firebase.js`, the offline decay block opens with (~line 153):

```js
        if (decay > 0) {
```

Change that line to:

```js
        const _autoFeedActive = roomData.autoFeeder && roomData.autoFeedOn && viewingUid === currentUid;
        if (decay > 0 && !_autoFeedActive) {
```

(When Auto-Feeder is active the normal decay/starvation loop is skipped; the Auto-Feeder handles those pets after plant income posts — Step 2.)

- [ ] **Step 2: Add the offline catch-up after plant earnings**

Still in `games/room/js/room-firebase.js`, find where the plant offline-earnings block ends (the large `if (!_offlineCoinsCollected && bestOffline) { … }`). After that block's closing `}` and before the `maybeGenerateDailyDrops();` call (both precede `_roomLoaded = true;`), insert:

```js
        // Auto-Feeder offline catch-up — after plant income so idle earnings can pay.
        if (decay > 0 && _autoFeedActive) {
          const _afPlan = planOfflineAutoFeed({
            pets: roomData.pets.map(p => ({ hunger: p.hunger ?? 100, thirst: p.thirst ?? 100, affection: p.affection ?? 0 })),
            coins: roomData.coins,
            decay: decay,
            foodRate: bestCoinsPerPoint(FOODS),
            drinkRate: bestCoinsPerPoint(DRINKS),
            target: AUTOFEED_TARGET,
            starveLoss: STARVE_AFFECTION_LOSS
          });
          roomData.pets.forEach((p, i) => {
            p.hunger = _afPlan.pets[i].hunger;
            p.thirst = _afPlan.pets[i].thirst;
            p.affection = _afPlan.pets[i].affection;
          });
          if (_afPlan.coinsSpent > 0) {
            roomData.coins = Math.max(0, roomData.coins - _afPlan.coinsSpent);
            const _afSpent = _afPlan.coinsSpent;
            setTimeout(function () {
              showToast('🤖 Auto-Feeder kept your pets fed — spent ' + _afSpent + ' coins while you were away!', 'success');
            }, 1000);
          }
          saveRoom();
        }
```

(`decay` and `_autoFeedActive` are `const`s declared earlier in the same load handler, so they're in scope here.)

- [ ] **Step 3: Add live top-up to the decay interval**

Still in `games/room/js/room-firebase.js`, the periodic decay interval (~line 238) ends its pet loop then does `if (changed) { await saveRoom(); renderAllDebounced(); }`. Immediately **before** that `if (changed)` line, insert:

```js
        if (roomData.autoFeeder && roomData.autoFeedOn) {
          const _afFood = bestCoinsPerPoint(FOODS), _afDrink = bestCoinsPerPoint(DRINKS);
          for (const pet of roomData.pets) {
            const _r = liveRefillPlan(pet, roomData.coins, _afFood, _afDrink, { threshold: AUTOFEED_THRESHOLD, target: AUTOFEED_TARGET });
            if (_r.coinsSpent > 0) {
              pet.hunger = _r.hunger;
              pet.thirst = _r.thirst;
              roomData.coins = Math.max(0, roomData.coins - _r.coinsSpent);
              changed = true;
            }
          }
        }
```

(The interval already guards `viewingUid !== currentUid` at its top, so this only runs for the owner.)

- [ ] **Step 4: Syntax-check**

Run: `node --check games/room/js/room-firebase.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: Browser smoke check — offline catch-up**

Serve + open the room with a pet and the Auto-Feeder bought + ON, with coins available. In DevTools console, simulate a long absence by rewinding `updatedAt` and reloading:

```js
// Drop a pet's stats and force a stale updatedAt, then save and reload.
roomData.pets[0].hunger = 100; roomData.pets[0].thirst = 100;
await userDocRef().update({ updatedAt: Date.now() - 6 * 60 * 60 * 1000 }); // 6h ago
location.reload();
```

After reload: the pet should be back near **100/100** and a toast *"🤖 Auto-Feeder kept your pets fed — spent X coins…"* appears; coins dropped by X. Then toggle OFF and repeat — with Auto-Feeder OFF the pet should instead show decayed hunger/thirst (~64% after 6h) and no toast.

- [ ] **Step 6: Browser smoke check — live top-up**

With Auto-Feeder ON and coins available, in console:

```js
const before = roomData.coins;
roomData.pets[0].hunger = 10; roomData.pets[0].thirst = 10;
// Manually invoke one decay-interval body is impractical; instead verify the helper directly:
liveRefillPlan(roomData.pets[0], roomData.coins, bestCoinsPerPoint(FOODS), bestCoinsPerPoint(DRINKS), { threshold: AUTOFEED_THRESHOLD, target: AUTOFEED_TARGET });
```

Expected: returns `{ hunger: 100, thirst: 100, coinsSpent: <>0 }` (the live tick applies exactly this each interval).

- [ ] **Step 7: Commit**

```bash
git add games/room/js/room-firebase.js
git commit -m "feat(room): Auto-Feeder offline catch-up and live top-up"
```

---

## Self-Review

**Spec coverage:**
- Device + 2500-coin purchase + Feed-panel toggle → Task 2 (const) + Task 3 (buy/toggle + UI). ✓
- Hunger + thirst, refill below 50→100, most cost-efficient item → Task 1 (`bestCoinsPerPoint`, `statRefillCost`, `liveRefillPlan`) + Task 4 (live). ✓
- Offline catch-up after plant income, coins-bound, summary toast, skip normal decay when active → Task 4 Steps 1-2 + Task 1 (`planOfflineAutoFeed`). ✓
- Live top-up on the existing interval → Task 4 Step 3. ✓
- All pets / all layers (iterates `roomData.pets`), owner-only guards → Tasks 3-4. ✓
- Persistence of `autoFeeder`/`autoFeedOn` → Task 2. ✓
- Pure module + tests like room-drops.js → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `planOfflineAutoFeed`/`liveRefillPlan`/`statRefillCost`/`bestCoinsPerPoint` signatures match between Task 1 (definition + tests) and Task 4 (callers). Drop/pet field names (`hunger`,`thirst`,`affection`) consistent. Flags `autoFeeder`/`autoFeedOn` spelled identically across Tasks 2-4. Constants `AUTO_FEEDER_COST`/`AUTOFEED_THRESHOLD`/`AUTOFEED_TARGET` consistent. ✓

**Note for executor:** `renderAll`/`renderUpgrade`/`coinSVG`/`showToast`/`saveRoom`/`viewingUid`/`currentUid`/`FOODS`/`DRINKS`/`STARVE_AFFECTION_LOSS` are existing globals; confirm `renderAll()` refreshes the coin counter (it is the top-level re-render). If a lighter coin-refresh helper is the local convention, use it instead in Task 3 Step 1.
