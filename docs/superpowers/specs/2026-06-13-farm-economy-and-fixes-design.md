# Farm economy + fixes — design (2026-06-13)

Approved scope: 7 items for the room/farm subsystem (`games/room.html` + `games/room/js/*`,
`games/room/css/room.css`, `games/theme.css`) and the home page (`index.html`).

Sequencing: **Batch 1 (fixes & small UI, #2–#7) first**, then **Batch 2 (farm economy, #1)**.

Standing constraints (user): NO hardcoded values where a constant fits; consider
`firestore.rules` for any new persisted field; keep Firestore reads/writes optimized
(no new reads/writes beyond saves already happening).

---

## Batch 1 — fixes & small UI

### #2 Collapsible "My Animals" list
The herd list (`renderFarmPanel` → `herdHtml`) grows unbounded and pushes the panel long.
Wrap it in a collapsible section: a tappable header (`🐮 My Animals  ▾  N`) toggles a body
that is collapsed by default once the herd is large. Collapse state held in a module flag
(`_farmHerdCollapsed`), not persisted (UI-only). CSS in `room.css`.

### #3 Plot counter / wasted-money bug
Symptom reported: panel shows "7/7" while max is 8, and the +Plot button still appears,
feeling like wasted money. Root cause is display ambiguity — the line shows
`usedPlots/plots.length plots planted`, read as owned/max. Fix:
- Show **owned vs max** explicitly: `Plots N/FARM_PLOT_MAX`, separate from "planted".
- Hide/disable +Plot at `FARM_PLOT_MAX` (already) **and** when `coins < FARM_PLOT_COST`
  (already disabled — verify it truly blocks the spend).
- Verify the real behavior live in Chrome before/after.

### #4 Home-page Room + Farm buttons
`index.html` already has a buried "My Room" game-card. Add a prominent pair of buttons
(🏠 Room, 🚜 Farm) near the top of the mini-games area. Farm deep-links to
`games/room.html?view=farm`; `room.html` reads the `view` query param on load and calls
`openFarm()` after the room finishes loading.

### #5 Mobile: plots hard to tap
Farm canvas maps pointer coords → nearest plot. On mobile the hit test is too tight.
Enlarge the per-plot hit radius (esp. for touch) and confirm touch-coordinate mapping
(devicePixelRatio / rect scaling) in the farm click handler.

### #6 Edge "Automatic Dark Mode" color inversion on games pages
Only `index.html` + `src/css/style.css` declare `color-scheme`. The games pages
(`room.html` and all `games/*.html`) import `games/theme.css` but have no `color-scheme`,
so Edge force-inverts them. Fix: add `:root { color-scheme: dark; }` to `games/theme.css`
(covers room + every minigame in one place).

### #7 Plant-all / Harvest-all
Add two buttons to the Garden section:
- **🌱 Plant all** — plant the currently selected seed into every empty plot, stopping when
  coins run out (reuses `_plantArmed`). Disabled if no seed selected / no empty plots.
- **🧺 Harvest all** — harvest every ripe plot at once (reuses harvest logic from
  `_plantOrHarvestPlot`), routing food→trough and products→stock.

---

## Batch 2 — farm economy (#1)

### Color (RGB) — cosmetic, rare, random
Extend `FARM_VARIANTS`: keep common + rare coat, add a third **`rgb` rainbow** variant per
animal at a small chance. On `buyFarmAnimal`, roll: common (most) → rare
(`FARM_RARE_CHANCE`) → **rgb (`FARM_RGB_CHANCE`, small, e.g. 0.03)**. Purely cosmetic —
no change to production, drops, or value. Pet drawers render the rainbow palette.

### Butcher → meat → cook or sell
- New action on an owned animal: **🔪 Butcher** (confirm first) — removes the animal
  permanently, adds 🥩 **meat** to `farmStock` scaled to tier (e.g.
  `FARM_MEAT_YIELD[type]`: goose 1 … horse 4).
- New product `meat` in `FARM_PRODUCTS` (raw, sellable at the cart).
- New machine **🔪 Butcher/Smokehouse** in `FARM_MACHINES`: `meat → 🌭 sausage` (pricier),
  reusing the existing one-job-at-a-time workshop flow. New product `sausage`.

### Selling → merchant cart (comes & goes, strict list)
- **Remove** the always-on Sell / Sell-all buttons from the panel produce section.
- A 🛒 **merchant cart** appears on the farm on a deterministic real-time cycle (e.g. present
  for `CART_OPEN_MS` out of every `CART_CYCLE_MS`, computed from epoch time so it's
  consistent without server state). Drawn on the farm canvas; clickable when present.
- Clicking the cart opens a sell sheet listing **only the items it wants this visit**
  (strict). The wanted-list is seeded from the current visit window so it rotates each visit
  and, over time, covers every product. Items not listed can't be sold this visit.
- A small on-farm indicator/countdown shows when the cart is here / next due.

### Firestore
No new top-level documents. New persisted fields live inside the existing room doc:
`farmStock.meat`, `farmStock.sausage`, butcher machine state under `farmMachines`. Cart
presence + wanted-list are **derived from time**, not stored. Update `firestore.rules` only
if field-level validation exists for `farmStock`/`farmMachines`; otherwise no rules change.

---

## Verification
Each item verified live via the connected Chrome (`/chrome`) on the real signed-in app:
room → Outside → Farm, plus mobile-viewport check for #5. Cache-bust bumped per code change.
