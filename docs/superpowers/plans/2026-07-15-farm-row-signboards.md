# Farm Row-Signboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the farm garden into a 3-row × 7-plot grid where each row is planted and read via a signboard on its left; planting becomes whole-row (tap the row), with a confirmation when coins can't cover the full row.

**Architecture:** Pure row logic (row indices, row state, affordability) lives in `room-farm.js` (Node-testable). The canvas view (`room-farm-view.js`) draws the signboards, routes a row-wide tap to a plant/harvest/status action, and drives a simplified crop picker + a partial-plant confirmation reusing the existing `#cropPicker` element. One constant changes in `room-base.js`; dead crop-picker styles are trimmed from `room.css`.

**Tech Stack:** Vanilla JS browser globals + canvas 2D; Node's built-in `node:test` for the pure logic. No build step.

---

## ⚠️ Project rules (override default plan flow)

Per the user's global instructions:
- **No direct git commits.** Do NOT run `git commit`/`git push`. Each task ends with a **"Present changes for Boss approval"** step instead of a commit. The Boss reviews the diff and approves/rejects.
- **No terminal-based code edits.** Make every code change with the **Edit tool** (which shows the diff), never via `sed`/`echo`/redirection.
- Running `node --test` (read-only test execution) is allowed and expected.

## File structure

- `games/room/js/room-farm.js` — add 4 pure exports: `farmRowCount`, `farmRowIndices`, `farmRowState`, `farmAffordableCount`.
- `games/room/js/room-farm.test.js` — add tests for the 4 new exports.
- `games/room/js/room-base.js` — `FARM_PLOT_MAX` 20 → 21.
- `games/room/js/room-farm-view.js` — layout (`_farmPlotPos`, `_farmSignPos`), signboard drawing (`_drawFarmSign` + hook in `_drawFarmPlots`), row-based click routing (`_farmRowClick`, edits to `onDown`/`onMove`/`onUp`/`onclick`), reworked crop picker + partial-plant confirmation, removal of drag-plant + per-plot-plant dead code, garden how-to text.
- `games/room/css/room.css` — remove unused crop-picker stepper styles.

---

## Task 1: Pure row-logic helpers (TDD)

**Files:**
- Modify: `games/room/js/room-farm.js` (add functions + export)
- Test: `games/room/js/room-farm.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `games/room/js/room-farm.test.js` (before the final line):

```javascript
/* ── farmRowCount / farmRowIndices ── */

test('farmRowCount = ceil(plotCount / perRow)', () => {
  assert.equal(F.farmRowCount(0, 7), 0);
  assert.equal(F.farmRowCount(7, 7), 1);
  assert.equal(F.farmRowCount(8, 7), 2);
  assert.equal(F.farmRowCount(21, 7), 3);
  assert.equal(F.farmRowCount(undefined, 7), 0);
});

test('farmRowIndices returns the owned plot indices in a row, bounded by count', () => {
  assert.deepEqual(F.farmRowIndices(21, 0, 7), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(F.farmRowIndices(21, 2, 7), [14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(F.farmRowIndices(10, 1, 7), [7, 8, 9]); // partial row
  assert.deepEqual(F.farmRowIndices(10, 2, 7), []);        // no plots owned here
});

/* ── farmRowState ── */

const CROPS = [
  { id: 'wheat', growMs: 60 * 60 * 1000 },
  { id: 'corn', growMs: 120 * 60 * 1000 },
];

test('farmRowState: empty when no plot has a crop', () => {
  const s = F.farmRowState([{ crop: null }, {}], CROPS, 5 * HOUR);
  assert.equal(s.state, 'empty');
  assert.equal(s.cropId, null);
});

test('farmRowState: growing reports the row crop, min progress and max time left', () => {
  const now = 30 * 60 * 1000; // 30m after planting at 0
  const s = F.farmRowState([{ crop: 'wheat', plantedAt: 0 }, { crop: 'wheat', plantedAt: 0 }], CROPS, now);
  assert.equal(s.state, 'growing');
  assert.equal(s.cropId, 'wheat');
  assert.equal(s.progress, 0.5);          // 30m of a 60m crop
  assert.equal(s.msLeft, 30 * 60 * 1000); // 30m remaining
});

test('farmRowState: ripe when any planted plot is fully grown', () => {
  const s = F.farmRowState([{ crop: 'wheat', plantedAt: 0 }], CROPS, 2 * HOUR);
  assert.equal(s.state, 'ripe');
  assert.equal(s.cropId, 'wheat');
});

test('farmRowState: mixed (one ripe, one growing) counts as ripe', () => {
  const s = F.farmRowState([
    { crop: 'wheat', plantedAt: 0 },        // ripe at 2h
    { crop: 'corn', plantedAt: 90 * 60 * 1000 }, // planted late → still growing
  ], CROPS, 2 * HOUR);
  assert.equal(s.state, 'ripe');
});

/* ── farmAffordableCount ── */

test('farmAffordableCount = min(empty plots, coins / seedCost), floored, >= 0', () => {
  assert.equal(F.farmAffordableCount(45, 10, 7), 4); // floor(45/10)=4
  assert.equal(F.farmAffordableCount(1000, 10, 7), 7); // capped by empties
  assert.equal(F.farmAffordableCount(5, 10, 7), 0);   // too broke for 1
  assert.equal(F.farmAffordableCount(50, 0, 7), 7);   // free seed → all empties
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test games/room/js/room-farm.test.js`
Expected: FAIL — `F.farmRowCount is not a function` (and the other three).

- [ ] **Step 3: Implement the four helpers**

In `games/room/js/room-farm.js`, add these functions immediately after `cropProgress` (around line 70, before `farmSellAllValue`):

```javascript
  // Number of grid rows a plot count occupies (rows of `perRow`). 0 → 0.
  function farmRowCount(plotCount, perRow) {
    return Math.ceil((plotCount || 0) / perRow);
  }

  // Owned plot indices in grid row `row` (rows of `perRow`), bounded by
  // plotCount. Empty array if the row owns no plots (partial/last row).
  function farmRowIndices(plotCount, row, perRow) {
    const out = [], start = row * perRow, end = Math.min(start + perRow, plotCount || 0);
    for (let i = start; i < end; i++) out.push(i);
    return out;
  }

  // State of one garden row from its plot objects.
  //   rowPlots : [{ crop, plantedAt }] — the plots owned in this row
  //   crops    : FARM_CROPS-shaped [{ id, growMs }]
  //   now      : Date.now()
  // 'ripe' if any planted plot is fully grown; 'growing' if planted but none
  // ripe; 'empty' if no plot has a crop. cropId = first planted plot's crop
  // (row label). progress = min progress of growing plots; msLeft = max time left.
  function farmRowState(rowPlots, crops, now) {
    let cropId = null, anyRipe = false, msLeft = 0, minProg = 1;
    for (const p of rowPlots) {
      if (!p || !p.crop) continue;
      if (cropId == null) cropId = p.crop;
      const c = crops.find(x => x.id === p.crop);
      if (!c) continue;
      const prog = cropProgress(p.plantedAt, now, c.growMs);
      if (prog >= 1) anyRipe = true;
      else { msLeft = Math.max(msLeft, c.growMs - (now - p.plantedAt)); minProg = Math.min(minProg, prog); }
    }
    if (cropId == null) return { state: 'empty', cropId: null, progress: 0, msLeft: 0 };
    if (anyRipe) return { state: 'ripe', cropId: cropId, progress: 1, msLeft: 0 };
    return { state: 'growing', cropId: cropId, progress: minProg, msLeft: msLeft };
  }

  // How many empty plots you can afford to plant with a given seed.
  function farmAffordableCount(coins, seedCost, emptyCount) {
    const byCoins = seedCost > 0 ? Math.floor(coins / seedCost) : emptyCount;
    return Math.max(0, Math.min(emptyCount, byCoins));
  }
```

Then extend the module's export object (the `return { ... }` near the end of the file) to include the new names:

```javascript
  return { farmCycleMs, animalLevel, cropProgress, generateFarmOrders, farmSellAllValue, planFarmTick, farmRefillUnits, farmRowCount, farmRowIndices, farmRowState, farmAffordableCount };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test games/room/js/room-farm.test.js`
Expected: PASS — all tests (existing + new) green.

- [ ] **Step 5: Present changes for Boss approval** (no git commit — project rule)

Summarize the two edited files and the new test results; wait for approval.

---

## Task 2: Grid constant + plot/signboard layout

**Files:**
- Modify: `games/room/js/room-base.js:286`
- Modify: `games/room/js/room-farm-view.js:104-108` (`_farmPlotPos`)

- [ ] **Step 1: Bump the plot cap**

In `games/room/js/room-base.js`, line 286, change:

```javascript
    const FARM_PLOT_MAX = 20;      // most garden plots you can own
```
to:
```javascript
    const FARM_PLOT_MAX = 21;      // most garden plots you can own (3 rows × 7)
```

- [ ] **Step 2: Re-lay plots into rows of 7 and add the signboard position helper**

In `games/room/js/room-farm-view.js`, replace `_farmPlotPos` (lines 102-108):

```javascript
    // Screen-normalized position of garden plot index i. Plots sit in rows of 7
    // across the soil strip, shifted right to leave room for the row signboard.
    function _farmPlotPos(i) {
      const perRow = 7;
      const col = i % perRow, row = Math.floor(i / perRow);
      return { x: 0.20 + col * 0.088, y: 0.80 + row * 0.066 };
    }

    // Normalized position of the signboard sitting to the LEFT of grid row `row`.
    function _farmSignPos(row) {
      return { x: 0.085, y: 0.80 + row * 0.066 };
    }
```

> **Tuning note:** `0.20 + col*0.088` (col 0–6 spans x≈0.20→0.73) and rows at y 0.80 / 0.866 / 0.932 are starting values. Confirm visually in Task 3/4 that the three rows and signboards fit the garden band without overlapping the pasture fence or running off the bottom; nudge the constants if needed.

- [ ] **Step 3: Sanity-check layout math (no runtime yet)**

Run: `node -e "const p=(i)=>({x:0.20+(i%7)*0.088,y:0.80+Math.floor(i/7)*0.066}); console.log(p(0),p(6),p(20))"`
Expected: `{ x: 0.2, y: 0.8 } { x: 0.728, y: 0.8 } { x: 0.728, y: 0.932 }` (col 6 stays on-screen; row 2 within the strip).

- [ ] **Step 4: Present changes for Boss approval** (no git commit)

---

## Task 3: Draw signboards on the canvas

**Files:**
- Modify: `games/room/js/room-farm-view.js` — new `_drawFarmSign`, hook into `_drawFarmPlots` (lines 2077-2156)

- [ ] **Step 1: Add the signboard drawer**

In `games/room/js/room-farm-view.js`, add this function immediately BEFORE `_drawFarmPlots` (before line 2077):

```javascript
    // A wooden signboard on a post, drawn to the left of a garden row. `st` is a
    // farmRowState() result: blank when empty, crop emoji + name (+ % or ✨) else.
    function _drawFarmSign(ctx, W, H, row, st) {
      const pos = _farmSignPos(row);
      const cx = pos.x * W, cy = pos.y * H;
      const w = Math.max(44, Math.min(W, H) * 0.12), h = w * 0.72;
      const x0 = cx - w / 2, y0 = cy - h / 2;
      ctx.fillStyle = '#5a3c22';                                   // post
      ctx.fillRect(cx - 2, y0 + h - 3, 4, h * 0.5);
      ctx.fillStyle = '#8a5a2b';                                   // board
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 5); ctx.fill(); }
      else ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = '#6b431f'; ctx.lineWidth = 2;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 5); ctx.stroke(); }
      else ctx.strokeRect(x0, y0, w, h);
      ctx.textAlign = 'center';
      if (st.state === 'empty') {
        ctx.fillStyle = 'rgba(255,243,214,.5)';
        ctx.font = '600 9px system-ui,sans-serif';
        ctx.fillText('tap to', cx, cy - 1);
        ctx.fillText('plant', cx, cy + 9);
        return;
      }
      const crop = FARM_CROPS.find(c => c.id === st.cropId);
      ctx.fillStyle = '#fff3d6';
      ctx.font = Math.round(h * 0.34) + 'px system-ui,sans-serif';
      ctx.fillText(crop ? crop.emoji : '🌱', cx, cy - h * 0.08);
      ctx.font = '800 9px system-ui,sans-serif';
      ctx.fillText(st.state === 'ripe' ? '✨ Ready' : (crop ? crop.name : ''), cx, cy + h * 0.24);
      if (st.state === 'growing') {
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(Math.round(st.progress * 100) + '%', cx, cy + h * 0.42);
      }
    }
```

- [ ] **Step 2: Draw one signboard per owned row inside `_drawFarmPlots`**

In `_drawFarmPlots`, right after `ctx.textAlign = 'center';` (currently line 2081), insert:

```javascript
        // Row signboards (left of each row that owns ≥1 plot).
        const _rows = farmRowCount(plots.length, 7);
        for (let _r = 0; _r < _rows; _r++) {
          const _st = farmRowState(farmRowIndices(plots.length, _r, 7).map(k => plots[k]), FARM_CROPS, now);
          _drawFarmSign(ctx, W, H, _r, _st);
        }
```

- [ ] **Step 3: Verify visually**

Open `games/room.html` in a browser, sign in, open your farm (🚜), go to the garden strip. Expected: a signboard sits left of each row you own — blank ("tap to plant") on empty rows, crop emoji + name + % on growing rows, crop + "✨ Ready" on ripe rows. Plots are laid out 7-per-row.

- [ ] **Step 4: Present changes for Boss approval** (no git commit)

---

## Task 4: Row-based tap routing; remove drag-planting

**Files:**
- Modify: `games/room/js/room-farm-view.js` — add `_farmRowClick`; edit `onDown` (2425-2431), `onMove` (2435-2453), `onUp` (2499-2509), `onclick` garden block (2560-2574); remove now-dead state (2397-2400) and `_plantArmed`/`_emptyPlotIdxs`/`_plantOrHarvestPlot`.

- [ ] **Step 1: Add the row-click action**

Add this function next to the other garden helpers (e.g. after `harvestAllFarm`, around line 1008):

```javascript
    // Tap anywhere in a garden row → act on the whole row: ripe harvests all
    // ready crops, growing shows time left, empty opens the crop picker.
    function _farmRowClick(row) {
      if (viewingUid !== currentUid) return;
      const plots = roomData.farmPlots || [];
      const idxs = farmRowIndices(plots.length, row, 7);
      if (!idxs.length) return;
      const st = farmRowState(idxs.map(i => plots[i]), FARM_CROPS, Date.now());
      if (st.state === 'ripe') return harvestAllFarm();
      if (st.state === 'growing') {
        const crop = FARM_CROPS.find(c => c.id === st.cropId);
        return showToast((crop ? crop.emoji + ' ' + crop.name : 'Crop') + ' growing — ' + _fmtFarmTime(st.msLeft) + ' left', '');
      }
      openCropPicker(row);
    }
```

- [ ] **Step 2: Route garden taps to the row (onclick)**

In `drawFarmCanvas`'s `cvs.onclick`, replace the garden-plots block (currently lines 2560-2574):

```javascript
        // Garden plots: any tap in the crop strip picks the NEAREST plot —
        // no precision needed on phones (the strip is plots only).
        const plots = roomData.farmPlots || [];
        if (plots.length && cy > 0.75) {
          let plotIdx = 0, plotDist = Infinity;
          for (let i = 0; i < plots.length; i++) {
            const pp = _farmPlotPos(i);
            const d = Math.hypot(pp.x - cx, pp.y - cy);
            if (d < plotDist) { plotDist = d; plotIdx = i; }
          }
          const pos = _farmPlotPos(plotIdx);
          if (!plots[plotIdx].crop) openCropPicker();
          else _plantOrHarvestPlot(plots[plotIdx], pos);
          return;
        }
```

with a version that resolves to a ROW (nearest plot OR nearest signboard):

```javascript
        // Garden strip: any tap picks the nearest plot OR signboard, then acts on
        // that whole row (plant / harvest / status). No precision needed on phones.
        const plots = roomData.farmPlots || [];
        if (plots.length && cy > 0.73) {
          let rowIdx = 0, best = Infinity;
          for (let i = 0; i < plots.length; i++) {
            const pp = _farmPlotPos(i);
            const d = Math.hypot(pp.x - cx, pp.y - cy);
            if (d < best) { best = d; rowIdx = Math.floor(i / 7); }
          }
          const _rows = farmRowCount(plots.length, 7);
          for (let r = 0; r < _rows; r++) {
            const sp = _farmSignPos(r);
            const d = Math.hypot(sp.x - cx, sp.y - cy);
            if (d < best) { best = d; rowIdx = r; }
          }
          _farmRowClick(rowIdx);
          return;
        }
```

- [ ] **Step 3: Remove the drag-plant arming in `onDown`**

In `onDown`, delete the whole plant-drag arming block (currently lines 2425-2431):

```javascript
        // Press anywhere in the crop field (bottom strip) → arm a sow-drag, so a
        // swipe across plots plants them. A plain tap still opens the picker /
        // harvests via onclick. (Plots live at y≈0.82 & 0.90, well below animals.)
        if (p.y > 0.75) {
          _farmPlantStartIdx = 1; _farmPlantDrag = false; _farmPlantedSet = new Set();
          _farmDragStartX = p.x; _farmDragStartY = p.y;
        }
```

(Delete these 7 lines entirely. Leave the decor-drag logic above it intact.)

- [ ] **Step 4: Remove the drag-plant painting in `onMove`**

In `onMove`, delete the whole leading plant-drag block (currently lines 2435-2453):

```javascript
        // Plant-drag: paint the armed seed across empty plots.
        if (_farmPlantStartIdx != null) {
          const p = pos(e);
          if (!_farmPlantDrag) {
            const dx = p.x - _farmDragStartX, dy = p.y - _farmDragStartY;
            if (dx * dx + dy * dy < FARM_DRAG_THRESHOLD * FARM_DRAG_THRESHOLD) return;
            _farmPlantDrag = true;
            _hideFarmTip();
          }
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          const plots = roomData.farmPlots || [];
          for (let i = 0; i < plots.length; i++) {
            if (_farmPlantedSet.has(i)) continue;
            const pp = _farmPlotPos(i);
            if (Math.hypot(pp.x - p.x, pp.y - p.y) < FARM_PLOT_HIT && _plantArmed(i)) _farmPlantedSet.add(i);
          }
          return;
        }

```

(Delete through the blank line so the next block — the hover tooltip — becomes the first statement in `onMove`.)

- [ ] **Step 5: Remove the drag-plant end in `onUp`**

In `onUp`, delete the leading plant-drag block (currently lines 2499-2509):

```javascript
        // End a plant-drag (a non-moving press falls through to the click → picker).
        if (_farmPlantStartIdx != null) {
          if (_farmPlantDrag) {
            _farmDragSuppressClick = true;
            saveRoom(); renderFarmPanel(); renderAll();
            if (e && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }
          _farmPlantStartIdx = null; _farmPlantDrag = false; _farmPlantedSet = null;
          return;
        }
```

(Leave the decor-drag `if (!_farmDragDecorId) return;` logic below it intact.)

- [ ] **Step 6: Delete the now-dead drag-plant state + helpers**

Delete these state declarations (currently lines 2398-2400):

```javascript
    let _farmPlantStartIdx = null;    // empty plot a plant-drag started on
    let _farmPlantDrag = false;       // dragging across plots to plant the armed seed
    let _farmPlantedSet = null;       // plot indices already planted this drag
```

And delete `FARM_PLOT_HIT` (line 2397 — no longer referenced):

```javascript
    const FARM_PLOT_HIT = 0.06;       // tap radius around a plot (bigger = easier on mobile)
```

Delete the now-unused `_plantOrHarvestPlot` (lines 1010-1031), `_plantArmed` (lines 1040-1052), and `_emptyPlotIdxs` (lines 1054-1059) — their callers were removed in Steps 2–5 and Task 5 replaces the plant path. (Keep `_fmtFarmTime`.)

> **Note:** `_farmDragStartX/Y`, `FARM_DRAG_THRESHOLD`, and `_farmDragSuppressClick` stay — the decor-drag path still uses them.

- [ ] **Step 7: Verify visually**

Open the farm. Expected: tapping a ripe row harvests all ready crops; tapping a growing row shows a "…growing — Xm left" toast; tapping an empty row opens the crop picker. Dragging a finger across plots no longer plants (gesture gone). No console errors about undefined functions.

- [ ] **Step 8: Present changes for Boss approval** (no git commit)

---

## Task 5: Crop picker rework + partial-plant confirmation

**Files:**
- Modify: `games/room/js/room-farm-view.js` — rewrite `openCropPicker`/`closeCropPicker`/`_renderCropPicker`; add `plantRow`/`_doPlant`/`_renderPlantConfirm`/`confirmPlantPartial`; remove `_plantQty`/`setPlantQty`/`plantSelected`/`pickCrop`/`_plantMaxQty`/`_selectedCrop`/`selectFarmCrop`.

- [ ] **Step 1: Replace picker state + open/close**

Replace the `_selectedCrop` / `_plantQty` declarations (lines 18-19):

```javascript
    let _selectedCrop = 'wheat'; // crop planted when you tap an empty plot
    let _plantQty = 1;           // how many plots the "Plant N" button fills at once
```
with:
```javascript
    let _plantRow = 0;           // grid row the crop picker is planting into
    let _pendingPlant = null;    // { row, cropId, count } awaiting partial-plant confirm
```

Replace `openCropPicker` (lines 1070-1075) and `closeCropPicker` (lines 1076-1079):

```javascript
    function openCropPicker(row) {
      _plantRow = row || 0;
      _pendingPlant = null;
      _renderCropPicker();
      const picker = document.getElementById('cropPicker');
      if (picker) picker.style.display = 'block';
    }
    function closeCropPicker() {
      _pendingPlant = null;
      const p = document.getElementById('cropPicker');
      if (p) p.style.display = 'none';
    }
```

- [ ] **Step 2: Replace `_renderCropPicker` with the simple chooser**

Replace `_renderCropPicker` (lines 1110-1140) with:

```javascript
    function _renderCropPicker() {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      const plots = roomData.farmPlots || [];
      const empties = farmRowIndices(plots.length, _plantRow, 7).filter(i => !plots[i].crop).length;
      picker.innerHTML =
        '<div class="cp-head">🌱 Plant this row</div>' +
        '<div class="cp-bulk-info">Empty plots in row: <b>' + empties + '</b> · Coins: <b>' + roomData.coins + '</b></div>' +
        FARM_CROPS.map(c => {
          const afford = roomData.coins >= c.seedCost;
          return '<button class="cp-crop"' + (afford ? '' : ' disabled') + ' onclick="plantRow(\'' + c.id + '\')">' +
            '<span class="cp-emoji">' + c.emoji + '</span>' +
            '<span class="cp-info"><b>' + c.name + '</b><small>grows in ' + _fmtFarmTime(c.growMs) + ' · ' + c.seedCost + '🪙/plot</small></span>' +
            '<span class="cp-cost">' + (c.seedCost * empties) + '🪙</span>' +
            '</button>';
        }).join('') +
        '<button class="cp-close" onclick="closeCropPicker()">Close</button>';
    }
```

- [ ] **Step 3: Add plant + confirmation functions**

Add immediately after `_renderCropPicker`:

```javascript
    // Chose a crop in the picker → plant the target row. Full-row when affordable,
    // else a confirmation to plant as many as coins allow.
    function plantRow(cropId) {
      if (viewingUid !== currentUid) return;
      const plots = roomData.farmPlots || [];
      const emptyIdxs = farmRowIndices(plots.length, _plantRow, 7).filter(i => !plots[i].crop);
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (!crop || !emptyIdxs.length) { closeCropPicker(); return; }
      const affordable = farmAffordableCount(roomData.coins, crop.seedCost, emptyIdxs.length);
      if (affordable <= 0) { closeCropPicker(); return showToast('Not enough coins for ' + crop.name + ' seed!', 'error'); }
      if (affordable >= emptyIdxs.length) return _doPlant(cropId, emptyIdxs);
      _pendingPlant = { row: _plantRow, cropId: cropId, count: affordable, total: emptyIdxs.length };
      _renderPlantConfirm(crop, emptyIdxs.length, affordable);
    }

    // Plant `crop` into the given plot indices (stops early if coins run out).
    function _doPlant(cropId, idxs) {
      const plots = roomData.farmPlots || [];
      const crop = FARM_CROPS.find(c => c.id === cropId);
      if (!crop) { closeCropPicker(); return; }
      const now = Date.now();
      let planted = 0;
      for (const i of idxs) {
        if (roomData.coins < crop.seedCost) break;
        roomData.coins -= crop.seedCost;
        plots[i].crop = crop.id; plots[i].plantedAt = now;
        const pos = _farmPlotPos(i);
        _farmParticles.push({ text: crop.emoji, x: pos.x, y: pos.y - 0.05, vy: -0.0008, life: 900, born: performance.now() });
        planted++;
      }
      closeCropPicker();
      if (planted) {
        saveRoom(); renderFarmPanel(); renderAll();
        showToast('🌱 Planted ' + planted + ' ' + crop.name + (planted > 1 ? 's' : ''), 'success');
      }
    }

    // Not-enough-coins confirmation (detailed wording), reusing #cropPicker.
    function _renderPlantConfirm(crop, total, affordable) {
      const picker = document.getElementById('cropPicker');
      if (!picker) return;
      picker.innerHTML =
        '<div class="cp-head">🪙 Not enough coins</div>' +
        '<div class="cp-bulk-info" style="line-height:1.5">A full row of <b>' + crop.emoji + ' ' + crop.name + '</b> costs <b>' + (crop.seedCost * total) + '🪙</b> (' + total + ' plots).<br>' +
          'You have <b>' + roomData.coins + '🪙</b> — enough for <b>' + affordable + ' plots</b>.</div>' +
        '<button class="cp-crop" style="justify-content:center;font-weight:800" onclick="confirmPlantPartial()">🌱 Plant ' + affordable + ' · ' + (affordable * crop.seedCost) + '🪙</button>' +
        '<button class="cp-close" onclick="closeCropPicker()">Cancel</button>';
      picker.style.display = 'block';
    }

    // Confirmed the partial plant → fill the affordable empty plots in the row.
    function confirmPlantPartial() {
      if (!_pendingPlant) return closeCropPicker();
      const plots = roomData.farmPlots || [];
      const idxs = farmRowIndices(plots.length, _pendingPlant.row, 7)
        .filter(i => !plots[i].crop).slice(0, _pendingPlant.count);
      const cropId = _pendingPlant.cropId;
      _pendingPlant = null;
      _doPlant(cropId, idxs);
    }
```

- [ ] **Step 4: Delete the old plant-flow functions**

Delete these now-unused functions (they were the tap-single / bulk-qty / drag path):
- `selectFarmCrop` (line 947)
- `_plantMaxQty` (lines 1062-1068)
- `pickCrop` (lines 1082-1085)
- `setPlantQty` (lines 1087-1091)
- `plantSelected` (lines 1093-1109)

(`_plantArmed`, `_emptyPlotIdxs`, `_plantOrHarvestPlot` were already removed in Task 4 Step 6.) Grep `games/room/js/room-farm-view.js` for `_selectedCrop`, `_plantQty`, `selectFarmCrop`, `pickCrop`, `setPlantQty`, `plantSelected`, `_plantMaxQty` and confirm zero remaining references.

- [ ] **Step 5: Verify visually**

Open the farm with a modest coin balance. Expected:
- Tap an empty row → picker titled "🌱 Plant this row" with per-crop row cost; picking a crop you can fully afford plants the whole row immediately.
- Reduce coins (or pick corn on a full 7-empty row you can't fully afford) → the "🪙 Not enough coins" confirmation appears with "Plant N · cost" and "Cancel". Plant N fills that many; Cancel leaves the row empty.
- Zero-affordable → red "Not enough coins" toast, no popup.
No console errors.

- [ ] **Step 6: Present changes for Boss approval** (no git commit)

---

## Task 6: CSS cleanup + garden how-to text

**Files:**
- Modify: `games/room/css/room.css:1003-1013` (stepper styles) and `games/room/css/room.css:1034,1042` (pointer-coarse entries)
- Modify: `games/room/js/room-farm-view.js:573-577` (garden how-to)

- [ ] **Step 1: Remove the unused crop-picker stepper styles**

In `games/room/css/room.css`, delete the stepper block (lines 999-1013), i.e. from the comment `/* Selected seed + "plant many" quantity stepper */` through the `.cp-plant:disabled` rule:

```css
    /* Selected seed + "plant many" quantity stepper */
    .cp-crop.selected{border-color:var(--g-accent);background:rgba(255,122,92,.12);box-shadow:inset 0 0 0 1px var(--g-accent)}
    .cp-bulk-info{font-size:11px;color:var(--g-ink-soft);text-align:center;margin:2px 0 8px}
    .cp-bulk-info b{color:var(--g-ink)}
    .cp-stepper{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px}
    .cp-step{min-width:42px;min-height:42px;border:1px solid var(--g-border);border-radius:10px;background:rgba(255,255,255,.06);color:var(--g-ink);font-size:18px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .cp-step:hover{background:rgba(255,255,255,.12);border-color:var(--g-accent)}
    .cp-step:active{transform:scale(.96)}
    .cp-step:disabled{opacity:.4;cursor:not-allowed}
    .cp-max{min-width:auto;padding:0 14px;font-size:13px}
    .cp-qty{font-family:var(--farm-display);font-weight:800;font-size:18px;color:var(--g-ink);min-width:38px;text-align:center}
    .cp-plant{display:block;width:100%;min-height:46px;margin-bottom:8px;padding:12px;border:none;border-radius:12px;background:var(--g-accent-grad);color:#2a1c08;font-family:var(--farm-display);font-size:14px;font-weight:800;letter-spacing:.3px;cursor:pointer}
    .cp-plant:hover{filter:brightness(1.05)}
    .cp-plant:active{transform:scale(.98)}
    .cp-plant:disabled{opacity:.4;cursor:not-allowed;filter:none}
```

BUT keep `.cp-bulk-info` and `.cp-bulk-info b` (still used by the picker + confirmation). So re-add just those two lines where the block was:

```css
    .cp-bulk-info{font-size:11px;color:var(--g-ink-soft);text-align:center;margin:2px 0 8px}
    .cp-bulk-info b{color:var(--g-ink)}
```

(Net: remove `.cp-crop.selected`, `.cp-stepper`, `.cp-step*`, `.cp-max`, `.cp-qty`, `.cp-plant*`; keep `.cp-bulk-info`.)

- [ ] **Step 2: Drop `.cp-step` / `.cp-max` from the touch-target media query**

In the `@media (pointer: coarse)` block: remove `.cp-max` from the `min-height:44px` selector list (line 1034) and remove `.cp-step` from the `min-width:44px; min-height:44px` selector list (line 1042). Leave the other selectors in each list unchanged.

- [ ] **Step 3: Update the garden how-to copy**

In `renderFarmPanel`'s `gardenHtml`, replace the how-to block (lines 573-577):

```javascript
        '<div class="farm-howto">' +
          '👆 Tap a plot to pick a seed.<br>' +
          '✋ <b>Hold and drag</b> across plots to plant a whole row at once.<br>' +
          '⏳ Tap any ripe crop to harvest <b>everything that\'s ready</b>.' +
        '</div>';
```
with:
```javascript
        '<div class="farm-howto">' +
          '🪧 Tap a row\'s <b>signboard</b> to plant that whole row.<br>' +
          '⏳ Tap a ripe row to harvest <b>everything that\'s ready</b>.' +
        '</div>';
```

- [ ] **Step 4: Verify visually**

Reload the farm. Expected: crop picker looks clean (no leftover stepper/plant-button gap); the Garden tab how-to reads the new two lines; the confirmation card still renders (uses `.cp-head`, `.cp-bulk-info`, `.cp-crop`, `.cp-close`).

- [ ] **Step 5: Run the logic tests once more (guard against regressions)**

Run: `node --test games/room/js/room-farm.test.js`
Expected: PASS.

- [ ] **Step 6: Present changes for Boss approval** (no git commit)

---

## Self-review notes (spec coverage)

- 3×7 grid + 21 max + kept purchases → Task 2 (constant) + Task 2 layout (perRow 7); "+ Plot" flow untouched. ✅
- Signboard per owned row, blank when empty → Task 3. ✅
- Whole-row tap zone; ripe→harvest-all, growing→status, empty→picker → Task 4 (`_farmRowClick` + routing). ✅
- Crop picker per row; pick → plant row → close → Task 5. ✅
- Partial-plant detailed confirmation; zero-affordable toast; full = no popup → Task 5 (`plantRow`/`_renderPlantConfirm`). ✅
- Drag-plant removed; stepper/PlantN removed → Task 4 (gesture) + Task 5 (fns) + Task 6 (CSS). ✅
- How-to text updated → Task 6. ✅
- Legacy mixed rows render (first crop label; harvest per-plot) → `farmRowState` returns first cropId; `harvestAllFarm` unchanged. ✅

**Deviation from spec §5/§6:** the `.cp-bulk-info` class is **kept** (repurposed for the picker's "empty plots / coins" line and the confirmation body) rather than removed. All other stepper classes are removed as specified.
