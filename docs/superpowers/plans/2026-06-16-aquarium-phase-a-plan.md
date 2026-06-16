# Aquarium Mini-Game — Phase A (Showcase Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ Project rule (CLAUDE.md):** Do NOT run `git commit`/`git push` automatically. Each task's commit step means: **show the diff to the owner ("Boss") and wait for approval** before committing. Never push.

**Goal:** Ship the foundation of the Aquarium feature — a new `?view=aquarium` mode in `room.html` where the player places fish they unlocked in Fishing (one per species), sees their collection completion %, and earns set-completion badges. No economy, mini-games, themes, or social yet (those are Phases B/C/D, each a separate plan).

**Architecture:** Mirror the existing Farm view. The aquarium is a view mode inside `room.html`, not a new page, so it reuses `saveRoom`, the `rooms/{uid}` doc, achievements, and the canvas/panel patterns. The fish renderer (currently inline in `fishing.html`) is extracted once into a shared `games/fish-render.js` used by both Fishing and the Aquarium.

**Tech stack:** Vanilla JS (classic scripts, no bundler), HTML5 canvas, Firebase compat SDK (Firestore/Auth), `node:test` for pure-logic unit tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-16-aquarium-minigame-design.md`

---

## File Structure (Phase A)

**Create**
- `games/fish-render.js` — shared fish renderer (moved verbatim from `fishing.html`): `FISH_TYPES`, `RARITY_COLORS`, `RARITY_COLORS_DOM`, `SIL_FILL`, `FISH_ART`, and all drawing functions. Pure, no game-state coupling.
- `games/room/js/room-aquarium.js` — pure aquarium logic (UMD module like `room-farm.js`): completion math. Unit-tested.
- `games/room/js/room-aquarium.test.js` — `node:test` unit tests for `room-aquarium.js`.
- `games/room/js/room-aquarium-view.js` — the view: open/close, panel-mode, canvas draw loop, roster panel, place/remove.

**Modify**
- `games/fishing.html` — remove the moved declarations; add the `fish-render.js` include; persist a newly-unlocked species immediately (anti-stale).
- `games/room.html` — add `#aquariumView` + `#aquariumCanvas`, `#aquariumPanel`, and the new `<script>` includes.
- `games/room/js/room-firebase.js` — `view=aquarium` URL branch; `aquariumFish` in `saveRoom`, `initRoom` defaults, and the snapshot loader.
- `games/room/js/room-base.js` — aquarium set-completion entries in `ACHIEVEMENTS`.
- `games/room/css/room.css` — aquarium panel + roster styles.
- `index.html` — a "My Aquarium" quick-link card.

---

## Task 1: Extract the shared fish renderer (`fish-render.js`)

**Files:**
- Create: `games/fish-render.js`
- Modify: `games/fishing.html` (remove moved code; add include)
- Modify: `games/room.html` (add include — done in Task 4)

This is a **verbatim move** — no logic changes. The Fishing game must look and play exactly the same afterward.

- [ ] **Step 1: Create `games/fish-render.js` and MOVE these declarations into it, in this order, verbatim from `fishing.html`:**

From `games/fishing.html`, cut (remove from fishing.html, paste into fish-render.js) every one of these top-level declarations:
1. `const FISH_TYPES = [ ... ];` (the 15-species array, ~line 433–449)
2. `const RARITY_COLORS = { ... };` (~line 451–457)
3. `const RARITY_COLORS_DOM = { ... };` (~line 459–465)
4. The entire "Fish Art" block (~line 467–706): the comment header, `const SIL_FILL = ...`, `const FISH_ART = { ... }`, and every function: `bodyGrad`, `drawEye`, `drawFishPattern`, `drawGenericFish`, `drawSwordfish`, `drawPuffer`, `drawOctopus`, `drawKoi`, `drawDragon`, `drawWhale`, `drawBoot`, `drawSeaweed`, `drawFish`, `makeFishCanvas`.

**Do NOT move** `pickFishType` (it stays in `fishing.html` — it is fishing-only spawn logic).

Wrap the file with a one-line header comment at the top:

```javascript
/* ============================================================
   Shared fish renderer — used by fishing.html (the Fishing game)
   and room.html (the Aquarium view). Pure canvas drawing + the
   FISH_TYPES registry; no game state. Loaded as a classic script
   so every symbol below is a browser global.
   ============================================================ */
```

…followed by the moved declarations exactly as they were (they remain top-level `const`/`function`, so they stay global).

- [ ] **Step 2: Add the include to `games/fishing.html`**

After the firebase-config script (line ~302) and BEFORE the main inline `<script>` (line ~304), add:

```html
  <script src="fish-render.js?v=1"></script>
```

- [ ] **Step 3: Verify nothing is declared twice**

Run: `grep -n "const FISH_TYPES\|const FISH_ART\|const RARITY_COLORS\|function drawFish\|function makeFishCanvas\|const SIL_FILL" games/fishing.html`
Expected: **no matches** in `fishing.html` (they now live only in `fish-render.js`).
Run: `grep -n "function pickFishType" games/fishing.html`
Expected: still present (it was not moved).

- [ ] **Step 4: Manual regression — Fishing still works**

Open `games/fishing.html` in a browser, sign in, press Play. Verify (no console errors):
- pond fish swim and are drawn as vector fish (not emoji),
- casting/hooking shows the hooked fish,
- a catch shows the big fish reveal,
- the lobby "Fish Collection" grid renders caught fish in color and uncaught as grey silhouettes.

- [ ] **Step 5: Commit** (show diff to Boss, then on approval)

```bash
git add games/fish-render.js games/fishing.html
git commit -m "refactor(fishing): extract fish renderer into shared games/fish-render.js"
```

---

## Task 2: Pure aquarium logic + tests (`room-aquarium.js`)

**Files:**
- Create: `games/room/js/room-aquarium.js`
- Test: `games/room/js/room-aquarium.test.js`

TDD this module — it is pure and the codebase already unit-tests pure logic (`room-farm.test.js`).

- [ ] **Step 1: Write the failing test** — create `games/room/js/room-aquarium.test.js`:

```javascript
/* node --test room-aquarium.test.js — unit tests for the pure aquarium logic. */
const test = require('node:test');
const assert = require('node:assert');
const A = require('./room-aquarium.js');

// Minimal stand-in for FISH_TYPES (only the fields the logic reads).
const TYPES = [
  { name: 'Sardine',  rarity: 'common' },
  { name: 'Anchovy',  rarity: 'common' },
  { name: 'Salmon',   rarity: 'rare' },
  { name: 'Tuna',     rarity: 'rare' },
  { name: 'Swordfish',rarity: 'epic' },
  { name: 'Whale',    rarity: 'legendary' },
  { name: 'Old Boot', rarity: 'junk' },
  { name: 'Seaweed',  rarity: 'junk' },
];

test('catchableSpecies excludes junk', () => {
  assert.equal(A.catchableSpecies(TYPES).length, 6);
});

test('aquariumCompletion counts placed catchable species and percentage', () => {
  const c = A.aquariumCompletion(['Sardine', 'Salmon', 'Whale'], TYPES);
  assert.equal(c.total, 6);
  assert.equal(c.placed, 3);
  assert.equal(c.pct, 50); // 3/6
});

test('aquariumCompletion breaks down by rarity tier', () => {
  const c = A.aquariumCompletion(['Sardine', 'Salmon'], TYPES);
  assert.deepEqual(c.byRarity.common, { placed: 1, total: 2 });
  assert.deepEqual(c.byRarity.rare,   { placed: 1, total: 2 });
  assert.deepEqual(c.byRarity.epic,   { placed: 0, total: 1 });
  assert.deepEqual(c.byRarity.legendary, { placed: 0, total: 1 });
});

test('aquariumCompletion ignores junk in core totals and tracks trash separately', () => {
  const c = A.aquariumCompletion(['Sardine', 'Old Boot'], TYPES);
  assert.equal(c.total, 6);                 // junk not in core
  assert.equal(c.placed, 1);                // Old Boot not counted in core
  assert.deepEqual(c.trash, { placed: 1, total: 2 });
});

test('aquariumCompletion handles an empty tank', () => {
  const c = A.aquariumCompletion([], TYPES);
  assert.equal(c.placed, 0);
  assert.equal(c.pct, 0);
});

test('aquariumCompletion ignores unknown names (stale/renamed species)', () => {
  const c = A.aquariumCompletion(['Sardine', 'Ghostfish'], TYPES);
  assert.equal(c.placed, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd games/room/js && node --test room-aquarium.test.js`
Expected: FAIL — `Cannot find module './room-aquarium.js'`.

- [ ] **Step 3: Write the minimal implementation** — create `games/room/js/room-aquarium.js`:

```javascript
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

  return { catchableSpecies, aquariumCompletion };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd games/room/js && node --test room-aquarium.test.js`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit** (show diff to Boss, then on approval)

```bash
git add games/room/js/room-aquarium.js games/room/js/room-aquarium.test.js
git commit -m "feat(aquarium): pure completion logic + unit tests"
```

---

## Task 3: "My Aquarium" navigation card (`index.html`)

**Files:**
- Modify: `index.html` (the quick-links block, ~line 840–857)

- [ ] **Step 1: Add the card**

In the quick-links flex row that currently holds the "My Room" and "My Farm" `<a class="game-card">` links, add a third card after the My Farm link:

```html
        <a href="./games/room.html?view=aquarium" class="game-card" style="flex:1">
          <span class="game-card-emoji" style="background:var(--primary-tint)">🐠</span>
          <div>
            <div class="game-card-title">My Aquarium</div>
            <div class="game-card-sub">Your Fishing collection</div>
          </div>
        </a>
```

(The inline `background` on the emoji is set explicitly because the `.game-card-emoji:nth-of-type(even)` alternation would otherwise tint the 3rd card unexpectedly.)

- [ ] **Step 2: Manual verify**

Open `index.html`. The sidebar quick links now show three cards (My Room / My Farm / My Aquarium). On a 375px-wide viewport, confirm the row still reads acceptably (cards may wrap — that is fine). Clicking My Aquarium navigates to `games/room.html?view=aquarium`.

- [ ] **Step 3: Commit** (show diff to Boss, then on approval)

```bash
git add index.html
git commit -m "feat(aquarium): add My Aquarium quick-link card"
```

---

## Task 4: Aquarium view container, canvas, panel & script includes (`room.html`)

**Files:**
- Modify: `games/room.html`

- [ ] **Step 1: Add the view + canvas**

Immediately after the `#farmView` element (the `<div class="outside-view farm-view" id="farmView">…</div>` block, ~line 101), add a sibling:

```html
        <div class="outside-view aquarium-view" id="aquariumView">
          <canvas id="aquariumCanvas" style="position:absolute;inset:0;width:100%;height:100%;cursor:pointer;border-radius:18px;touch-action:none"></canvas>
        </div>
```

- [ ] **Step 2: Add the side panel**

Immediately after `<div class="farm-panel" id="farmPanel"></div>` (~line 126), add:

```html
  <div class="farm-panel" id="aquariumPanel" style="display:none"></div>
```

(It reuses the `.farm-panel` class so it inherits the same panel chrome as the farm.)

- [ ] **Step 3: Add the script includes**

After `<script src="room/js/room-farm-view.js?v=cb47"></script>` (~line 380), add:

```html
  <script src="fish-render.js?v=1"></script>
  <script src="room/js/room-aquarium.js?v=cb47"></script>
  <script src="room/js/room-aquarium-view.js?v=cb47"></script>
```

(`fish-render.js` must load before `room-aquarium-view.js`, which calls `drawFish`/`FISH_TYPES`.)

- [ ] **Step 4: Manual verify (after Task 6 lands)**

Loading `games/room.html?view=aquarium` shows no "undefined function" console errors for `openAquarium`, `drawFish`, or `aquariumCompletion`. (Full behavior is verified in Task 10.)

- [ ] **Step 5: Commit** (show diff to Boss, then on approval)

```bash
git add games/room.html
git commit -m "feat(aquarium): add aquarium view, canvas, panel and script includes"
```

---

## Task 5: Wire persistence & the URL deep-link (`room-firebase.js`)

**Files:**
- Modify: `games/room/js/room-firebase.js`

- [ ] **Step 1: Persist `aquariumFish` in `saveRoom`**

In `saveRoom()`'s `data` object, after the line `farmTroughLevel: roomData.farmTroughLevel || 0,` (~line 30), add:

```javascript
        aquariumFish: roomData.aquariumFish || [],
```

- [ ] **Step 2: Default `aquariumFish` on account reset**

In `initRoom()`, in the `roomData = { ... }` reset object (~line 366), add `aquariumFish: [],` next to `farmTroughLevel: 0,`:

```javascript
        farmTroughLevel: 0, aquariumFish: [],
```

- [ ] **Step 3: Load `aquariumFish` from the snapshot**

In `_handleRoomSnap`, immediately after the line `roomData.farmAnimals = Array.isArray(d.farmAnimals) ? d.farmAnimals : [];` (line ~205), add:

```javascript
        roomData.aquariumFish = Array.isArray(d.aquariumFish) ? d.aquariumFish : [];
```

- [ ] **Step 4: Open the aquarium from the URL**

In `_maybeOpenFarmFromUrl()` (~line 333–334), change the single `if` into an `if/else if` so `?view=aquarium` opens the aquarium:

```javascript
        const v = new URLSearchParams(location.search).get('view');
        if (v === 'farm' && viewingUid === currentUid && typeof openFarm === 'function') openFarm();
        else if (v === 'aquarium' && viewingUid === currentUid && typeof openAquarium === 'function') openAquarium();
```

- [ ] **Step 5: Manual verify**

Reload `games/room.html?view=aquarium`; the aquarium view opens on load (after Task 6). Placing a fish then reloading the plain room shows the fish persisted (the `aquariumFish` array survives a refresh).

- [ ] **Step 6: Commit** (show diff to Boss, then on approval)

```bash
git add games/room/js/room-firebase.js
git commit -m "feat(aquarium): persist aquariumFish and open via ?view=aquarium"
```

---

## Task 6: The aquarium view module (`room-aquarium-view.js`)

**Files:**
- Create: `games/room/js/room-aquarium-view.js`

This mirrors `room-farm-view.js`: view flag, open/close, panel-mode, canvas RAF loop, the roster panel, and place/remove. All globals used (`roomData`, `currentUid`, `viewingUid`, `db`, `saveRoom`, `checkAchievements`, `_syncRoomPanel`, `FISH_TYPES`, `RARITY_COLORS_DOM`, `drawFish`, `aquariumCompletion`) already exist by the time this runs.

- [ ] **Step 1: Create the file with the full module**

```javascript
/* ============================================================
   Aquarium view — a fish tank showing the species you unlocked in
   the Fishing game (one fish per species). Mirrors the farm view:
   a ?view=aquarium mode inside room.html with its own canvas RAF
   loop and side panel. Phase A: place/remove fish + completion %
   + badges. (Idle coins, themes, mini-games, social: later phases.)
   ============================================================ */
let isAquariumView = false;
let _aqAnimFrame = null;
let _aquariumStates = {};     // ephemeral swim state per species name (NEVER saved)
let _aquariumCaught = null;   // Set of unlocked species names from Fishing; null = not loaded

// ── Open / close ──────────────────────────────────────────────
async function openAquarium() {
  isAquariumView = true;
  document.getElementById('aquariumView')?.classList.add('visible');
  _setAquariumPanelMode(true);
  _syncRoomPanel();                 // hide the room side panel; widen the stage
  await _loadAquariumUnlocks();     // refresh which species are unlocked in Fishing
  renderAquariumPanel();
  drawAquariumCanvas();
}

function closeAquarium() {
  isAquariumView = false;
  document.getElementById('aquariumView')?.classList.remove('visible');
  _setAquariumPanelMode(false);
  _syncRoomPanel();
  cancelAnimationFrame(_aqAnimFrame);
  _aqAnimFrame = null;
}

// Replace the room tabs + panels with the aquarium panel (mirrors _setFarmPanelMode).
function _setAquariumPanelMode(on) {
  const tabs = document.getElementById('tabsBar');
  if (tabs) tabs.style.display = on ? 'none' : '';
  document.querySelectorAll('#panelWrap .tab-panel').forEach(p => { p.style.display = on ? 'none' : ''; });
  const ap = document.getElementById('aquariumPanel');
  if (ap) ap.style.display = on ? 'block' : 'none';
}

// ── Read unlocked species from the Fishing leaderboard doc ────
async function _loadAquariumUnlocks() {
  _aquariumCaught = new Set();
  if (typeof db === 'undefined' || !currentUid) return;
  try {
    const doc = await db.collection('leaderboard_fishing').doc(currentUid).get();
    if (doc.exists) _aquariumCaught = new Set(doc.data().caughtFishNames || []);
  } catch (e) { /* offline / no fishing data yet → empty set */ }
}

// ── Place / remove (owner only; anti-tamper) ──────────────────
function placeAquariumFish(name) {
  if (viewingUid !== currentUid) return;
  if (!_aquariumCaught || !_aquariumCaught.has(name)) return;   // must be unlocked (never trust the client)
  roomData.aquariumFish = roomData.aquariumFish || [];
  if (roomData.aquariumFish.includes(name)) return;             // one fish per species
  roomData.aquariumFish.push(name);
  saveRoom();
  checkAchievements();
  renderAquariumPanel();
}

function removeAquariumFish(name) {
  if (viewingUid !== currentUid) return;
  roomData.aquariumFish = (roomData.aquariumFish || []).filter(n => n !== name);
  delete _aquariumStates[name];
  saveRoom();
  renderAquariumPanel();
}

// ── Side panel: completion header + per-rarity bars + roster ──
function renderAquariumPanel() {
  const panel = document.getElementById('aquariumPanel');
  if (!panel) return;
  const placed = roomData.aquariumFish || [];
  const caught = _aquariumCaught || new Set();
  const comp = aquariumCompletion(placed, FISH_TYPES);

  const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
  const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const bars = RARITY_ORDER.map(r => {
    const t = comp.byRarity[r] || { placed: 0, total: 0 };
    const pct = t.total ? Math.round((t.placed / t.total) * 100) : 0;
    const color = RARITY_COLORS_DOM[r] || 'var(--g-accent)';
    return '<div class="aq-bar-row">' +
      '<span class="aq-bar-label" style="color:' + color + '">' + RARITY_LABEL[r] + ' ' + t.placed + '/' + t.total + '</span>' +
      '<span class="farm-herd-bar"><span style="width:' + pct + '%;background:' + color + '"></span></span>' +
    '</div>';
  }).join('');

  const roster = FISH_TYPES.filter(f => f.rarity !== 'junk').map(f => {
    const isCaught = caught.has(f.name);
    const isPlaced = placed.includes(f.name);
    const cls = 'aq-fish-card' + (isPlaced ? ' placed' : '') + (isCaught ? '' : ' locked');
    const onclick = isCaught
      ? (isPlaced ? 'removeAquariumFish(\'' + f.name + '\')' : 'placeAquariumFish(\'' + f.name + '\')')
      : '';
    return '<div class="' + cls + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' +
      '<canvas class="aq-fish-canvas" width="64" height="44" data-fish="' + f.name + '" data-sil="' + (isCaught ? '0' : '1') + '"></canvas>' +
      '<div class="aq-fish-name">' + (isCaught ? f.name : '???') + '</div>' +
      '<div class="aq-fish-tag">' + (isPlaced ? '✓ in tank' : isCaught ? 'tap to add' : f.rarity) + '</div>' +
    '</div>';
  }).join('');

  panel.innerHTML =
    '<div class="farm-panel-head">🐠 My Aquarium</div>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">Collection <span class="farm-panel-cap">' + comp.placed + '/' + comp.total + ' · ' + comp.pct + '%</span></div>' +
      bars +
    '</section>' +
    '<section class="farm-card">' +
      '<div class="farm-section-title">🐟 Your Fish <span class="farm-panel-cap">tap to place</span></div>' +
      '<div class="aq-roster">' + roster + '</div>' +
    '</section>' +
    '<button class="farm-visit-home" onclick="closeAquarium()">🏠 Back to room</button>';

  // Draw each roster card's fish (full color, or grey silhouette if not yet unlocked).
  panel.querySelectorAll('.aq-fish-canvas').forEach(cv => {
    const type = FISH_TYPES.find(f => f.name === cv.dataset.fish);
    if (!type) return;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2, cv.height / 2);
    drawFish(c, type, 18, { silhouette: cv.dataset.sil === '1' });
    c.restore();
  });
}

// ── Tank canvas (water scene + swimming fish) ─────────────────
function drawAquariumCanvas() {
  cancelAnimationFrame(_aqAnimFrame);
  const view = document.getElementById('aquariumView');
  const cvs = document.getElementById('aquariumCanvas');
  if (!view || !cvs) return;
  const ctx = cvs.getContext('2d');
  let W = view.clientWidth, H = view.clientHeight;
  cvs.width = W; cvs.height = H;
  let lastFrame = 0;

  function frame(t) {
    if (!isAquariumView) return;                      // stop when the view closes
    if (t - lastFrame < 42) { _aqAnimFrame = requestAnimationFrame(frame); return; }
    lastFrame = t;
    const nw = view.clientWidth, nh = view.clientHeight;
    if (nw && nh && (nw !== W || nh !== H)) { W = nw; H = nh; cvs.width = W; cvs.height = H; }
    const time = t / 1000;
    ctx.clearRect(0, 0, W, H);

    // Water background (same palette as the Fishing pond).
    const water = ctx.createLinearGradient(0, 0, 0, H);
    water.addColorStop(0, '#1a3a5c'); water.addColorStop(0.3, '#15406a'); water.addColorStop(1, '#0a1e38');
    ctx.fillStyle = water; ctx.fillRect(0, 0, W, H);

    // Caustic light shimmer.
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 8; i++) {
      const cx = (Math.sin(time * 0.3 + i * 1.7) * 0.5 + 0.5) * W;
      const cy = (Math.cos(time * 0.2 + i * 2.3) * 0.5 + 0.5) * H;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
      g.addColorStop(0, 'rgba(100,200,255,1)'); g.addColorStop(1, 'rgba(100,200,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;

    // Surface shimmer along the top.
    ctx.fillStyle = 'rgba(100,180,255,0.08)';
    for (let x = 0; x < W; x += 3) {
      const wave = 3 + Math.sin(x * 0.05 + time * 2) * 3 + Math.sin(x * 0.02 + time * 1.3) * 2;
      ctx.fillRect(x, 0, 2, wave);
    }

    // One fish per placed species, swimming and bouncing off the side walls.
    const placed = roomData.aquariumFish || [];
    _syncAquariumStates(placed, W, H);
    for (const name of placed) {
      const type = FISH_TYPES.find(f => f.name === name);
      const st = _aquariumStates[name];
      if (!type || !st) continue;
      st.x += st.speed * st.dir;
      st.wobble += 0.05;
      if (st.x < type.size)     { st.x = type.size;     st.dir = 1; }
      if (st.x > W - type.size) { st.x = W - type.size; st.dir = -1; }
      const y = st.y + Math.sin(st.wobble) * 6;
      ctx.save();
      ctx.translate(st.x, y);
      ctx.scale(st.dir, 1);                            // face swim direction
      drawFish(ctx, type, type.size, { phase: st.wobble });
      ctx.restore();
    }

    _aqAnimFrame = requestAnimationFrame(frame);
  }
  _aqAnimFrame = requestAnimationFrame(frame);
}

// Create swim state for newly placed fish; drop state for removed ones.
function _syncAquariumStates(placed, W, H) {
  placed.forEach((name, i) => {
    if (!_aquariumStates[name]) {
      const fromLeft = (i % 2) === 0;
      _aquariumStates[name] = {
        x: fromLeft ? W * 0.2 : W * 0.8,
        y: H * (0.25 + 0.5 * ((i % 5) / 5)),
        dir: fromLeft ? 1 : -1,
        speed: 0.6 + (i % 3) * 0.25,
        wobble: i,
      };
    }
  });
  for (const name in _aquariumStates) if (!placed.includes(name)) delete _aquariumStates[name];
}
```

- [ ] **Step 2: Manual verify**

Done together with Task 10 (the module needs Task 4's DOM, Task 5's wiring, and Task 8's CSS to look right).

- [ ] **Step 3: Commit** (show diff to Boss, then on approval)

```bash
git add games/room/js/room-aquarium-view.js
git commit -m "feat(aquarium): view module — tank canvas, roster panel, place/remove"
```

---

## Task 7: Set-completion badges (`room-base.js`)

**Files:**
- Modify: `games/room/js/room-base.js` (the `ACHIEVEMENTS` array, ~line 609–631)

- [ ] **Step 1: Append aquarium achievements**

After the last farm entry (`{ id: 'ach_farm_expand', ... }`, ~line 630) and before the closing `];`, add:

```javascript
      { id: 'ach_aqua_first',  icon: '🐠', name: 'First Fish',     desc: 'Place your first fish in the aquarium', check: (d) => (d.aquariumFish || []).length >= 1 },
      { id: 'ach_aqua_common', icon: '🐟', name: 'Reef Regular',   desc: 'Place every common fish',  check: (d) => FISH_TYPES.filter(f => f.rarity === 'common').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_rare',   icon: '🐡', name: 'Deep Sea Diver', desc: 'Place every rare fish',    check: (d) => FISH_TYPES.filter(f => f.rarity === 'rare').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_epic',   icon: '🦈', name: 'Apex Tank',      desc: 'Place every epic fish',    check: (d) => FISH_TYPES.filter(f => f.rarity === 'epic').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_legend', icon: '🐉', name: 'Legend Keeper',  desc: 'Place every legendary fish', check: (d) => FISH_TYPES.filter(f => f.rarity === 'legendary').every(f => (d.aquariumFish || []).includes(f.name)) },
      { id: 'ach_aqua_100',    icon: '🏆', name: 'Aquarist 100%',  desc: 'Place every catchable fish', check: (d) => FISH_TYPES.filter(f => f.rarity !== 'junk').every(f => (d.aquariumFish || []).includes(f.name)) },
```

(`FISH_TYPES` is a global from `fish-render.js`, loaded before `room-base.js` in Task 4's include order, so these `check` functions resolve at runtime.)

- [ ] **Step 2: Manual verify**

In the aquarium, place every common species; a `🏆 Achievement: Reef Regular!` toast fires immediately. Open the Achievements overlay (gear → achievements) and confirm the new badges appear (locked until earned).

- [ ] **Step 3: Commit** (show diff to Boss, then on approval)

```bash
git add games/room/js/room-base.js
git commit -m "feat(aquarium): set-completion achievement badges"
```

---

## Task 8: Aquarium panel & roster styling (`room.css`)

**Files:**
- Modify: `games/room/css/room.css` (append near the farm styles)

- [ ] **Step 1: Append the styles**

```css
    /* ── Aquarium roster & completion bars ── */
    .aq-bar-row { display:flex; align-items:center; gap:8px; margin:4px 0; }
    .aq-bar-label { font-size:11px; font-weight:700; min-width:96px; }
    .aq-bar-row .farm-herd-bar { flex:1; }
    .aq-roster {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr));
      gap:8px;
    }
    .aq-fish-card {
      background:var(--g-slot); border:1px solid var(--g-border); border-radius:12px;
      padding:6px 4px; text-align:center; cursor:pointer;
      transition:background .15s, border-color .15s, transform .1s;
    }
    .aq-fish-card:hover { background:var(--g-hover); }
    .aq-fish-card:active { transform:scale(.97); }
    .aq-fish-card.placed { border-color:var(--g-accent); background:rgba(251,146,60,.10); }
    .aq-fish-card.locked { cursor:default; opacity:.85; }
    .aq-fish-card.locked:hover { background:var(--g-slot); }
    .aq-fish-canvas { display:block; margin:0 auto; width:64px; height:44px; }
    .aq-fish-name { font-size:10px; font-weight:700; color:var(--g-ink); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .aq-fish-card.locked .aq-fish-name { color:var(--g-ink-faint); }
    .aq-fish-tag { font-size:8px; text-transform:uppercase; letter-spacing:.5px; color:var(--g-ink-soft); margin-top:1px; }
    .aq-fish-card.placed .aq-fish-tag { color:var(--g-accent); }
```

(If `--g-slot` / `--g-hover` are not defined in `theme.css`, substitute the nearest token used by `.fish-card`/`.farm-shop-row` — confirm by `grep -n "\-\-g-slot\|\-\-g-hover" games/theme.css games/room/css/room.css`.)

- [ ] **Step 2: Manual verify**

Done in Task 10 — the roster cards render in a tidy grid, placed cards show the accent border, locked cards show grey silhouettes.

- [ ] **Step 3: Commit** (show diff to Boss, then on approval)

```bash
git add games/room/css/room.css
git commit -m "feat(aquarium): panel and roster styling"
```

---

## Task 9: Persist a newly-unlocked species immediately (`fishing.html`)

**Why:** Fishing currently writes `caughtFishNames` only on score-submit, so a fish caught right before opening the aquarium might not be placeable. Write it the moment a NEW species is unlocked (rare event, cheap).

**Files:**
- Modify: `games/fishing.html`

- [ ] **Step 1: Write the new species to Firestore on first catch**

Find the catch handler line `caughtFishSet.add(resultFish.name);` (~line 1014). Replace it with a version that also persists when the species is new:

```javascript
          const _isNewSpecies = !caughtFishSet.has(resultFish.name);
          caughtFishSet.add(resultFish.name);
          if (_isNewSpecies && auth.currentUser) {
            lbRef.doc(auth.currentUser.uid).set(
              { caughtFishNames: Array.from(caughtFishSet) },
              { merge: true }
            ).catch(() => {});
          }
```

(`lbRef` is the `leaderboard_fishing` collection ref already defined in `fishing.html`; `auth` is the Firebase auth global there. Confirm both names with `grep -n "lbRef =\|const auth" games/fishing.html`.)

- [ ] **Step 2: Manual verify**

In Fishing, catch a brand-new species, then WITHOUT finishing the run open `room.html?view=aquarium`: the newly-caught species now appears in full color in the roster (placeable). Catching a duplicate triggers no extra write (check the Network tab shows a Firestore write only on the first catch of each species).

- [ ] **Step 3: Commit** (show diff to Boss, then on approval)

```bash
git add games/fishing.html
git commit -m "feat(fishing): persist a newly-unlocked species immediately for the aquarium"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full flow**

1. From `index.html`, click **My Aquarium** → `room.html?view=aquarium` opens the tank view with the side panel showing the completion header, four rarity bars, and the species roster.
2. Roster shows caught species in full color and uncaught as grey silhouettes labelled `???`.
3. Tap a caught species → it appears swimming in the tank, the card flips to `✓ in tank` with the accent border, the completion % and the matching rarity bar increase.
4. Tap it again → it leaves the tank and the counts drop back.
5. Place all commons → `Reef Regular` achievement toast fires.
6. Reload the plain `room.html` then return to `?view=aquarium` → placed fish persisted.
7. Close (Back to room) → returns to the room with no leftover canvas running (no console errors; CPU settles).

- [ ] **Step 2: Anti-tamper check**

In the console while viewing the aquarium, call `placeAquariumFish('Whale')` for a species you have NOT unlocked → it is rejected (nothing added). Then call `placeAquariumFish` with an already-unlocked, already-placed name → no duplicate is added.

- [ ] **Step 3: Regression**

Re-run `cd games/room/js && node --test room-aquarium.test.js` → all pass. Re-open Fishing and confirm it still renders/plays correctly (renderer extraction did not break it).

- [ ] **Step 4: Final commit** (show diff to Boss, then on approval) — only if any verification fixes were needed.

---

## Self-Review (author check against the spec)

- **Spec coverage:** category card (Task 3) ✓; `?view=aquarium` view (Tasks 4–6) ✓; place 1-per-species with silhouettes (Task 6) ✓; completion %/rarity bars (Tasks 2,6,8) ✓; junk as separate "trash" (Task 2, excluded from core) ✓; badges (Task 7) ✓; shared `fish-render.js` extraction + Fishing regression (Task 1) ✓; anti-tamper + stale-unlock fix (Tasks 6,9) ✓; read-only/owner guard via `viewingUid===currentUid` (Tasks 5,6) ✓; pure-logic unit tests (Task 2) ✓. **Deferred by design (not Phase A):** idle coins, themes, mini-games, social — each its own later plan.
- **Placeholder scan:** none — every code step contains complete code.
- **Name consistency:** `aquariumFish` (data), `_aquariumCaught`/`_aquariumStates` (view state), `openAquarium`/`closeAquarium`/`placeAquariumFish`/`removeAquariumFish`/`renderAquariumPanel`/`drawAquariumCanvas`/`_setAquariumPanelMode`/`_loadAquariumUnlocks`/`_syncAquariumStates` (functions), `aquariumCompletion`/`catchableSpecies` (pure logic), `#aquariumView`/`#aquariumCanvas`/`#aquariumPanel` (DOM ids) — used consistently across tasks.

## Follow-on plans (not in this plan)
- **Phase B — Idle + themes:** passive coins per fish by rarity, 3h offline "while you were away" collect modal, water-tint theme presets.
- **Phase C — Mini-games:** Feeding Frenzy, Fish Race & Bet, Bubble Pop.
- **Phase D — Social:** visit other tanks (read-only) + ❤️ Like.
