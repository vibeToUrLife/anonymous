# Farm side land — compost yard and greenhouse

Two plots of land either side of the farm, bought separately, chained: the left
one produces fertilizer, the right one is the best thing to spend it on.

## Why

The farm's economy is flat and closed. Every raw material takes one step through
a machine and is sold:

```
coins ──feed 5🪙/unit──→ animals ──→ 🥚15 🍄40 🥛75 🧲140 ┐
coins ──seed 10–50─────→ crops   ──→ 🌾20 🥕35 🌽70 ─────┴─→ machines → goods 200–360 → sell/orders → coins
```

Three gaps this design addresses:

1. **Feed is a pure drain with no production path.** The one thing the farm runs
   on is the one thing it cannot make. At 59 animals that is 5,310🪙/day.
2. **Nothing consumes coins once the upgrade lines are maxed** — which is exactly
   where a developed farm sits.
3. **🍄 Truffle is a passive bottleneck.** It drops from pigs only, and it is the
   sole input to Pizza (150) and Truffle Risotto (290), the Bakery's best output.
   It is also in the daily order pool. There is no way to produce more.

The pasture expansion also stops paying off the moment it is maxed. Tying the
compost rate to herd size gives that 150,000🪙 a second return.

## Shape

```
59 animals (already fed — no extra cost)
      │ byproduct, accumulates over time, faster with a bigger herd
      ▼
LEFT: 🪵 compost bins ──tap to collect──▶ 🌱 fertilizer
                                              │
              ┌───────────────────────────────┴───────────────────────────┐
              ▼                                                           ▼
   the existing 30 garden beds                             RIGHT: 🏠 greenhouse, 8 beds
   fertilised bed yields ×2                                1 fertilizer per bed → 🍄 ×2
   🌾+20  🥕+35  🌽+70                                      (~290🪙 once cooked)
              │                                                           │
              └──────────────────▶ machines ◀────────────────────────────┘
                                      │
                                      ▼
                          sell / daily orders
```

### Left gates right, and the gate is mechanical

The greenhouse cannot plant a single bed without fertilizer. "Left before right"
falls out of the mechanic; it is not a rule bolted on top. Because the order is
fixed, the price is fixed too: **left 50,000🪙, right 120,000🪙** — no more
"next plot, whichever side".

### Fertilizer has a use from the moment the left plot opens

This is the hole the first draft had: a player who buys the left plot and cannot
yet afford the right would accumulate a number with nothing to spend it on.

| Use | Needs | Value per fertilizer |
|---|---|---|
| Fertilise an existing garden bed → that bed yields ×2 | left only | 🌾+20 / 🥕+35 / 🌽+70 |
| Plant a greenhouse bed → 🍄 ×2 | right | ~290🪙 cooked into risotto |

Fertilizer is spent **at planting time**, as part of the plant action — a bed is
either sown plain or sown fertilised, and there is no separate "spread manure on
a growing crop" step. That keeps one interaction per bed instead of two, and it
means the choice is made when the player is already deciding what to grow.

The greenhouse is worth about 4× more per fertilizer, so the right plot is a
clear upgrade — but **both uses stay live**, because the daily order pool is
`['egg', 'truffle', 'milk', 'carrot', 'corn', 'wheat']`: it asks for outdoor
crops as often as it asks for truffle. Fertilizer becomes a resource you
allocate against what today's orders actually want.

Demand is real even before the greenhouse: fertilising all 30 beds is 30
fertilizer per cycle.

## Left plot: the compost yard

- **3 bins**, each holding 10 fertilizer. Full capacity 30 — exactly one pass
  over the 30 garden beds.
- Bins fill on a timer whose rate scales with herd size: **0.04 fertilizer per
  animal per hour**. At 59 animals that is ~2.4/hour, so all three bins fill in
  roughly 12.5 hours.
- Each bin draws in one of three states — empty / half / full. **You tap a bin to
  collect it.** Bins stop when full, so the cap is the offline cap; no separate
  banking rule is needed.
- Collecting is manual by decision: it is what makes the left plot a place worth
  travelling to rather than a number that ticks up. No auto-composter.

## Right plot: the greenhouse

- **8 beds, all of them opened with the plot.** They are not bought one at a time
  the way garden plots are — the 120,000🪙 is the whole greenhouse.
- Planting one costs **1 fertilizer** (not coins). With no fertilizer in hand,
  tapping an empty bed says so and plants nothing.
- Grows **🍄 truffle**, 45 minutes, **2 per bed** — faster and denser than the
  outdoor beds (60/90/120 min, 1 each), which is what the fertilizer buys.
- Feeds Bakery recipes that already exist: 🍄×1 → 🍕 150, 🍄×2 → 🍚 290.

No new product, no new recipe, no new sales channel. The greenhouse plugs into
the machines and the order board unchanged.

## Data

New fields on `roomData`, saved and loaded alongside the existing farm state
(`room-firebase.js` save map + load, `room-actions.js` visit, both defaults):

| Field | Type | Meaning |
|---|---|---|
| `farmCompost` | number | fertilizer accrued in the bins, 0–30 |
| `farmCompostAt` | timestamp | last accrual settlement, same pattern as `farmFoodAt` |
| `farmFertilizer` | number | collected fertilizer in hand |
| `farmGreenhouse` | array | greenhouse beds, same shape as `farmPlots` |

`farmPlots[i]` gains a `fert` flag marking a bed as fertilised for its current
crop; it clears on harvest.

Fertilizer is a separate field rather than an entry in `farmStock` because stock
is the sell list, and fertilizer must not be sellable.

`farmLandL` / `farmLandR` already exist.

## What this reuses

Most of it is already built:

- **Greenhouse beds are `farmPlots` again.** Planting, growing, harvesting and
  plant-the-whole-row are pure functions in `room-farm.js` and take the bed array
  as an argument.
- **Compost accrual is the `farmFood` pattern** — `planFarmTick` already settles
  a rate against `farmFoodAt` and clamps to a cap.
- **Camera, draw layers and hit-testing are done**: the world runs `-landL ..
  1+landR`, `_farmTargetAt` converts taps to land coordinates, and the pan arrows
  exist.

New work is the compost bin and greenhouse art, the accrual field, and the
fertilizer inventory.

## Risks

- **Fertilizer flowing too fast inflates the economy** — truffle floods in, the
  Bakery's slots become the bottleneck, and goods prices lose meaning. The 3-bin
  cap is the brake; the rate is one constant and can be tuned down.
- **Hit-testing across plots.** Garden beds live in `0..1` and are a
  nearest-wins partition; greenhouse beds live past `1`. The `wx ∈ [0,1]` bound
  already added to `_farmTargetAt` keeps the two from stealing each other's taps,
  and the greenhouse needs the mirrored bound on its own range.

## Not doing

- No second greenhouse crop. Truffle alone connects to existing recipes; more
  crops can come later if the loop proves itself.
- No auto-composter upgrade.
- No other buildings on either plot.
- Feed is still bought with coins. A hay field was considered and set aside —
  it pairs naturally with a breeding yard, but breeding has nowhere to put its
  offspring while the animal cap is 60, which is a much larger change.
