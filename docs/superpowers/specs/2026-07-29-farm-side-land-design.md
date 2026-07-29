# Farm side land — compost yard and ageing cellar

Two plots either side of the farm, bought separately, left before right. They sit
at opposite ends of the same chain: the left one raises how much raw material the
farm produces, the right one raises what that material is finally worth.

## Why

The farm's economy is flat and closed. Every raw material takes exactly one step
through a machine and is sold:

```
coins ──feed 5🪙/unit──→ animals ──→ 🥚15 🍄40 🥛75 🧲140 ┐
coins ──seed 10–50─────→ crops   ──→ 🌾20 🥕35 🌽70 ─────┴─→ machines → goods 200–360 → sell → coins
```

Two gaps this addresses:

1. **The chain has no second stage.** A finished good's only future is being sold
   at its list price, so every machine hits a ceiling the day you can sell
   everything you make.
2. **Nothing consumes coins once the upgrade lines are maxed** — which is exactly
   where a developed farm sits.

It also gives the pasture expansion a second return: compost accrues with herd
size, so the 150,000🪙 spent on animal capacity keeps paying after it is maxed.

### A rejected idea, and why

The first draft had the right plot as a greenhouse growing 🍄 truffle, on the
theory that truffle was a bottleneck because it only drops from pigs. That was
wrong: truffle supply is not a design constraint, it is just how many pigs the
player chose to buy. A greenhouse truffle line would have competed with the pig
for the same niche — spending new content to devalue old content.

The rule it produced, which the design below follows: **new content must not
occupy a niche existing content already fills.** The cellar introduces no new raw
material at all, so it cannot.

## Shape

```
59 animals (already fed — no extra cost)
      │ byproduct, accrues over time, faster with a bigger herd
      ▼
LEFT: 🪵 compost bins ──tap to collect──▶ 🌱 fertilizer
                                              │
                                              ▼
                              the existing 30 garden beds — sown fertilised, yields ×2
                                              │
                                              ▼
                                  🧀🍖 the existing 5 machines  ── TIER 1
                                              │            │
                                              │            └──▶ 🛩️ the plane (unchanged, buys tier 1)
                                              ▼
                              RIGHT: 🛖 ageing cellar, 3–5 hours
                                              │
                                              ▼
                                        TIER 2 — aged goods
                                              │
                                              ▼
                              RIGHT: 🏛️ buyer, permanent, daily quota
```

Left scales the front of the chain; right upgrades the back. Buying order follows
from that — expand production first, then upgrade what you do with it.

### The gate is the purchase order, not a mechanic

The cellar does not consume fertilizer, so owning the left plot is a
**requirement to buy the right one**, not a mechanical dependency. An earlier
draft forced the right plot to eat fertilizer so the gate would be mechanical;
that constraint was ruling out better designs for the right plot, and the
requirement was only ever an ordering.

## Left plot: the compost yard

- **3 bins**, 10 fertilizer each. Cap 30 — exactly one pass over the 30 garden
  beds.
- Bins fill at **0.08 fertilizer per animal per hour**. At 59 animals that is
  ~4.7/hour, so all three fill in about 6.4 hours: a check-twice-a-day rhythm.
- Each bin draws empty / half / full. **Tapping a bin collects whatever is in
  it** — a half-full bin can be taken early rather than having to be waited out.
  Bins stop filling when full, so the cap is also the offline cap: no separate
  banking rule.
- Manual collection is the point: it is what makes the left plot a place worth
  travelling to rather than a number that ticks up. No auto-composter.

### What fertilizer is for

Fertilizer is spent **at planting time**, as part of the plant action — a bed is
either sown plain or sown fertilised. There is no separate "spread it on a
growing crop" step, so there is one interaction per bed rather than two, and the
choice is made when the player is already deciding what to grow.

A fertilised bed **yields ×2**: 🌾+20 / 🥕+35 / 🌽+70 per fertilizer.

At 30 beds of corn that is +2,100🪙 per batch, and a batch of fertilizer accrues
in ~6.4 hours — roughly 330🪙/hour. Accrual is passive but collection is not, so
that rate assumes the bins are emptied before they cap; at that pace the 50,000🪙
plot pays back in about six days.

## Right plot: the ageing cellar

Only things that genuinely age can be aged. Dairy and meat, not bread or cake
(fresh is the point) and not metal. That constraint has a good side effect: the
**Dairy (2,000🪙) and Butcher (2,500🪙), the two cheapest machines, become
strategically important**.

| Tier 1 | → Tier 2 | Time | × |
|---|---|---|---|
| 🧀 Cheese 200 | Aged Cheese **600** | 4h | 3.0 |
| 🧈 Butter 150 | Cultured Butter **450** | 3h | 3.0 |
| 🌭 Sausage 130 | Cured Sausage **400** | 3h | 3.1 |
| 🥓 Bacon 180 | Smoked Bacon **540** | 4h | 3.0 |
| 🍖 Ham 240 | Aged Ham **720** | 5h | 3.0 |

Aged Ham at 720🪙 becomes the most valuable item in the game (currently 🔔 Bell at
360), which is what tier 2 should mean.

Timers run in hours against the machines' 20–60 minutes, so the two layers are
clearly separated — the cellar is the "load it before bed" layer.

**Slots:** 2 come with the plot, up to 4, **15,000🪙 each** — above machine slots
at 10,000, and another late-game coin sink.

## Right plot: the tier-2 buyer

A permanent building on the right plot. It is the **only** outlet for aged goods;
the plane keeps buying tier 1 and never sees tier 2.

- Always open — no waiting for a visit, unlike the plane.
- Pays the aged product's full price.
- **Daily quota: 20 items**, resetting on the same day key as the daily orders.
  Over quota, goods keep and sell tomorrow.

The quota is what makes cellar slots a real decision: 2 slots produce ~12 items a
day, so the quota is slack until you buy up to 4 (~24/day), at which point it
binds. Average profit is ~362🪙 per aged item, so 20/day is ~7,240🪙/day and the
120,000🪙 plot pays back in about 17 days.

### Aged goods must not leak into tier-1 prices

Three existing paths would otherwise sell them at their base price:

- `sellFarmProduct(id)` sells one stock type at list price
- `sellAllFarm()` empties **all** of `farmStock` at list price
- the plane's wanted list is built from the outputs of every owned machine

So aged goods live in **`farmAged`, a separate inventory from `farmStock`**, and
the cellar is **not** a member of `FARM_MACHINES`. That makes the leak
structurally impossible rather than something three call sites have to remember —
and any future "sell everything" button inherits the guarantee for free.

## Data

New fields on `roomData`, saved and loaded with the rest of the farm state
(`room-firebase.js` save map + load, `room-actions.js` visit, both defaults):

| Field | Type | Meaning |
|---|---|---|
| `farmCompost` | number | fertilizer accrued in the bins, 0–30 |
| `farmCompostAt` | timestamp | last accrual settlement, same pattern as `farmFoodAt` |
| `farmFertilizer` | number | collected fertilizer in hand |
| `farmCellar` | array | ageing jobs — `{ in, out, endsAt }` per slot |
| `farmCellarSlots` | number | slots owned, 2–4 |
| `farmAged` | object | tier-2 inventory, `{ agedcheese: 3, … }` |
| `farmAgedDay` | string | day key the quota belongs to |
| `farmAgedSold` | number | items sold against today's quota |

`farmPlots[i]` gains a `fert` flag marking the bed as sown fertilised; it clears
on harvest.

`farmLandL` / `farmLandR` already exist.

## What this reuses

- **Compost accrual is the `farmFood` pattern** — `planFarmTick` already settles a
  rate against `farmFoodAt` and clamps to a cap.
- **Cellar jobs are machine jobs** — `room-farm.js` already models slot/job/timer
  and is pure.
- **The daily quota is the daily-order pattern** — `farmDayKey` rollover already
  exists.
- **Camera, draw layers and hit-testing are done**: the world runs `-landL ..
  1+landR`, `_farmTargetAt` converts taps to land coordinates, and the pan arrows
  exist.

New work is the compost bin, cellar and buyer art; the accrual field; the aged
inventory; and the buyer's sheet.

## Risks

- **Fertilizer flowing too fast inflates crop output.** The 3-bin cap is the
  brake and the rate is one constant.
- **Tier 2 flooding the economy.** The daily quota is the brake, and it is one
  constant.
- **Hit-testing across plots.** Garden beds live in `0..1` and are a nearest-wins
  partition; the `wx ∈ [0,1]` bound already added to `_farmTargetAt` keeps taps on
  the plots from reaching them. The bins, cellar and buyer need tap rects on
  their own ranges.

## Not doing

- No greenhouse, and no new raw material of any kind.
- No auto-composter.
- Baked goods and forge goods do not age. Only dairy and meat.
- Feed is still bought with coins. A hay field was considered and set aside — it
  pairs naturally with a breeding yard, but breeding has nowhere to put its
  offspring while the animal cap is 60, which is a much larger change.
