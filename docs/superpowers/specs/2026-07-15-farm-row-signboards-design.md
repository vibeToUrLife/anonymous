# Farm garden — row-based planting with signboards

**Date:** 2026-07-15
**Area:** `games/room` farm view (garden plots)

## Goal

Reshape the farm garden from free-form per-plot planting into a tidy **3-row grid (7 plots per row)** where each row is planted and read via a **signboard on its left**. Planting moves from "tap/drag individual plots" to "tap the row" (whole-row planting).

## Current behavior (for reference)

- Plots stored in `roomData.farmPlots` — array of `{ id, crop, plantedAt }`. Bought one at a time (`addFarmPlot`, `FARM_PLOT_COST` = 300🪙, `FARM_PLOT_MAX` = 20).
- `_farmPlotPos(i)` lays plots out `perRow = 10` at `x: 0.09 + col*0.087, y: 0.82 + row*0.075`.
- Planting: tap an empty plot → crop picker (seed + quantity stepper + "Plant N") → plant; OR hold-and-drag across plots to sow a row; harvest by tapping any ripe crop (`harvestAllFarm` collects all ripe).
- Canvas draw in `_drawFarmPlots`; click routing + drag gestures in `drawFarmCanvas`'s `onDown/onMove/onUp/onclick`.

## New design

### 1. Grid & ownership

- `FARM_PLOT_MAX`: **20 → 21** (3 rows × 7). Existing players keep exactly the plots they have already bought. The "+ Plot" buy flow (`addFarmPlot`, `FARM_PLOT_COST`) is unchanged.
- Plots fill **left-to-right, top-to-bottom** in rows of 7. `_farmPlotPos(i)` uses `perRow = 7`; plots shift right to leave room for the left signboard. A partial last row is allowed (e.g. 10 plots = row 1 full, row 2 has 3, row 3 none).
- A **signboard is drawn on the left of every row that owns ≥ 1 plot** (0–3 signboards). New helper `_farmSignPos(row)` returns the signboard's normalized `{x, y}`.
- Row helpers: `_rowPlotIdxs(row)` → owned plot indices in that row; `_rowCount()` → `ceil(plotCount / 7)`.

### 2. Interaction — the whole row is one tap zone

Tapping anywhere in a row (signboard or any of its plots) acts on that row. Row state is derived from the row's owned plots:

- **Ripe** (any plot in the row is ripe) → **harvest all ripe on the farm** (reuse `harvestAllFarm()`).
- **Growing** (has crop, none ripe) → status toast, e.g. `🌾 Wheat growing — 12m left` (min remaining across the row).
- **Empty** (all the row's plots have no crop) → open the **crop picker** targeted at this row (`openCropPicker(row)`). Picking a crop plants the row:
  - **Coins cover the whole row** (`plotsInRow × seedCost`) → plant every plot in the row, close picker, success toast.
  - **Coins cover some but not all** (≥ 1 plot affordable) → show the **partial-plant confirmation** (below). Do not plant yet.
  - **Coins cover zero plots** → red toast "Not enough coins for {crop} seed!", no popup.

The hold-and-drag-to-plant gesture is **removed entirely**.

### 3. Partial-plant confirmation

When the chosen crop can't fill the whole empty row, replace the crop picker with a confirmation card (farm clay/wood modal style). **Detailed wording:**

> **🪙 Not enough coins**
> A full row of **{emoji} {name}** costs **{full}🪙** ({plotsInRow} plots).
> You have **{coins}🪙** — enough for **{affordable} plots**.
>
> [ 🌱 Plant {affordable} · {affordable×seedCost}🪙 ]  (primary)
> [ Cancel ]

- **Plant N** → plant the `affordable` lowest-index empty plots in the row, close, success toast.
- **Cancel** → close, leave the row empty.

`affordable = min(plotsInRow, floor(coins / seedCost))`.

### 4. Signboard display

- **Empty** → blank, with a faint "tap to plant" hint.
- **Growing** → crop emoji + name + growth % (rounded).
- **Ripe** → crop emoji + name + **✨ Ready**.

Drawn on-canvas as a small wooden sign on a post, matching the existing plot/wood art (browns `#8a5a2b`/`#6b431f`, cream text, drop shadow).

### 5. Crop picker simplification

`openCropPicker(row)` stores the target row (`_plantRow`). The picker becomes a plain crop chooser:

- Remove the quantity stepper, "Plant N" button, bulk-info line, and the drag hint.
- Clicking a crop plants the target row (per §2/§3) rather than only selecting it.
- Remove now-unused helpers/state: `_plantQty`, `setPlantQty`, `plantSelected`, `_plantMaxQty`, `_emptyPlotIdxs` (drag path), `pickCrop`'s select-only behavior, and the drag-plant state (`_farmPlantStartIdx`, `_farmPlantDrag`, `_farmPlantedSet`, `_plantArmed`). Keep a row-scoped plant helper.
- Garden panel "how-to" text updated: describe "tap a row's signboard to plant the whole row" and "tap a ripe row to harvest everything"; drop the drag/tap-single-plot copy.

### 6. Files touched

- **`games/room/js/room-farm-view.js`** — `_farmPlotPos` (perRow 7 + shift), new `_farmSignPos` / `_rowPlotIdxs` / `_rowState` helpers, `_drawFarmPlots` (draw signboards + per-row crop state), click routing (row-based, drop drag handlers), crop picker functions, partial-plant confirmation, panel how-to text.
- **`games/room/js/room-base.js`** — `FARM_PLOT_MAX` 20 → 21.
- **`games/room/css/room.css`** — remove now-unused crop-picker stepper styles (`.cp-stepper`, `.cp-step`, `.cp-qty`, `.cp-max`, `.cp-plant`, `.cp-bulk-info`) and their `@media (pointer: coarse)` entries; add a small confirmation-card style if not reusing an existing modal class.

### 7. Edge cases & legacy

- **Legacy mixed-crop rows** (from old per-plot planting) render fine: the signboard shows the row's first non-empty crop; harvest is per-plot as before. Rows normalize as players replant.
- **Partial rows** (fewer than 7 owned plots): signboard governs only the owned plots; planting cost uses the owned count.
- **Rows with a growing crop and leftover empty plots** (rare, from a confirmed partial plant): the row reads as "growing" (not empty), so it can't be topped up until harvested. Acceptable given cheap seeds; not worth extra UI.
- **Visiting other farms** stays read-only (existing `viewingUid !== currentUid` guards unchanged).

## Out of scope

- Changing crop types, grow times, prices, or yields.
- Changing the "+ Plot" purchase economy (cost/amount).
- Machines, animals, orders, merchant cart — untouched.
