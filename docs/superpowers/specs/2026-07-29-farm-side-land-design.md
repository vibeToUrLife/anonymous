# Farm side land — compost yard and ageing factories

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
occupy a niche existing content already fills.** The ageing factories introduce
no new raw material at all, so they cannot.

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
                              RIGHT: 🛖🔥🍖 3 ageing factories, 3–5 hours
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

The ageing factories do not consume fertilizer, so owning the left plot is a
**requirement to buy the right one**, not a mechanical dependency. An earlier
draft forced the right plot to eat fertilizer so the gate would be mechanical;
that constraint was ruling out better designs for the right plot, and the
requirement was only ever an ordering.

## Everything you can own stands on the land, locked

One rule covers the compost bins, the ageing factories **and** the five existing
tier-1 machines:

> Every buyable building is drawn on the ground from the moment its plot is
> owned. Unowned ones are drawn **dimmed with a 🔒 on them**. Tapping a locked
> building opens a modal asking whether to unlock it. Nothing is bought from the
> side panel.

Why: the panel hid the farm's future. A player who had never built the Forge had
no idea a Forge existed unless they scrolled the Garden tab, and a bought machine
appeared out of nowhere on grass that had looked empty. Putting the locked
building in its final spot means the farm always shows you what it can become,
the price is attached to the thing itself, and buying is one tap where you are
already looking.

**Lock treatment** — the same drawing for all three families, so it reads as one
rule and not three features:

- the building is drawn exactly as normal, then greyed: draw at ~45% opacity
  through a grey overlay, so the silhouette is recognisable but plainly inactive
- a padlock sits on the building's front wall — **drawn**, not the 🔒 emoji (see
  the art rules below)
- hovering/pointing at it still does the small grow (`_farmHoverK`), so it is
  obviously tappable

**The unlock modal** is one shared modal, not three: building name and emoji, one
line of what it does, the price, and Unlock / Cancel. Not enough coins → the
Unlock button is disabled and shows the shortfall.

### This changes the existing tier-1 machines too

The five machines (`FARM_MACHINES`) move to the same rule:

- **All five are always on the pasture**, at the `_workshopPos(slot)` spots they
  already have — owned ones normal, unowned dimmed with a lock. Positions are
  fixed per machine and already spaced, so nothing shuffles when one is bought.
- **The Garden tab's "🏭 Build Machines" card is removed.** The Garden tab keeps
  only the garden card.
- `buyFarmMachine(id)` stays exactly as it is — the unlock modal calls it instead
  of the panel button. Prices are unchanged (2,000–5,000🪙).
- Three draw/hit sites currently skip unowned machines and must stop skipping:
  `_drawWorkshopMachines` (draw dimmed instead of returning early),
  `_farmFixedTargetAt` (push all five as tap targets, so a locked hut is
  tappable), and `_farmBlockedZones` (a locked hut is still a building — animals
  should walk around it, not through it).
- Production slots are unaffected: they are already bought inside the machine's
  own modal, which is the same "buy it where you see it" idea.

## Art: the new buildings are drawn, not badged

The five tier-1 huts share **one** hut shape and are told apart by a white round
sign on the gable with the machine's emoji in it. That works for a row of five
identical huts and it is staying — but nothing on the new plots may use it.

**Every building on the two new plots is drawn in canvas paths, with no emoji and
no sign.** Each one is recognised by its own silhouette.

Why: an emoji badge is a label stuck on a generic box — it says what the building
is instead of showing it, it renders differently on every phone, and five badged
huts plus five more badged boxes would make the whole farm read as one repeated
asset. It also gives the two tiers a visual difference that matches the
mechanical one: tier 1 is a row of matching sheds, tier 2 is three buildings that
look nothing like each other or like anything on the pasture.

All of them take the same `(ctx, W, H, t, night, pal)` the huts take, size off
`_workshopSize(W, H)`, and draw the same ground shadow ellipse and the same 3/4
depth offset — so they sit in the same world, at the same scale, and pick up
night colours and `pal.roofSnow` like everything else.

### The three compost bins

An open-topped slat box: horizontal planks for the front, a darker right-hand
face for depth, a rim board across the top, two corner posts standing slightly
proud.

**The fill level is the readout — there is no number and no badge on it:**

| State | Drawn |
|---|---|
| empty | you see the inside back boards and a bare floor |
| part full | a dark-brown mound, its top edge at the fill fraction |
| full | the mound heaps over the rim, a few small green shoots drawn on top, and a slow wisp rises from it |

The wisp is the machines' steam loop at a slower rate and a browner colour — a
full bin should catch your eye from across the plot, because a full bin is a bin
that has stopped earning.

Bins draw at whatever fraction they hold, not in thirds, so walking up to a bin
tells you roughly how long you left it.

Locked bins are the same box, dimmed, always drawn empty — nothing accrues in a
bin you do not own, and drawing compost in it would be a lie.

### The three ageing factories

Told apart by **shape at a glance**, which is what keeps working when they are
dimmed and the colour is washed out:

- **Cheese Cave** — a low stone arch set into a grassy mound. Rounded arch mouth
  with stacked voussoir stones around it, grass over the top, dark interior. The
  only round-topped thing on the farm; everything else is gabled or square.
- **Smokehouse** — a tall, narrow, dark-timber shed with a squat stone chimney.
  Its proportion is deliberately the inverse of the wide tier-1 huts, so the two
  never get confused at small size. While a job runs, dark smoke drifts from the
  chimney — again the steam loop, in grey.
- **Ham Cellar** — a half-buried cellar: a pair of slanted timber doors lying
  almost flat on the ground, a low stone collar around them, iron banding across
  the doors. The only building on the farm with nothing standing above ground.
  It should read as expensive and shut.

### Status without emoji

The huts show a ✅ when something is ready. The new buildings show state through
themselves:

- **working** — the cave mouth glows faintly warm; the smokehouse smokes; the
  cellar doors sit slightly ajar with light in the gap
- **ready** — a small drawn amber lamp lights over the entrance, with a soft
  glow behind it, pulsing slowly
- **idle** — nothing; the building is just dark

Same three states as the huts, same job data behind them, no glyph.

### The lock badge is drawn too

The 🔒 in the lock treatment is a **drawn padlock** — rounded body, shackle arc,
keyhole dot — not the emoji. One shape, used on the compost bins, the ageing
factories and the tier-1 huts alike, so "locked" looks identical everywhere and
does not change with the player's phone font.

### The buyer

Not asked for, but it stands on the right plot between two drawn buildings, so
it is drawn the same way rather than left as a 🏛️: a small open-fronted stall
with a stone counter, a striped awning, and a set of scales on the counter.
Flag if you would rather keep it as an emoji for now.

## Left plot: the compost yard

- **3 bins**, 10 fertilizer each. All three stand on the plot from day one.
- **Bin 1 comes with the plot.** Bins 2 and 3 are locked — dimmed with a 🔒 —
  and unlock by tapping them: **25,000🪙** for the second, **50,000🪙** for the
  third. There is no compost row in the side panel; the bins are the shop.
- Cap is **10 per unlocked bin**, so it grows 10 → 20 → 30. Three bins is 30 —
  exactly one pass over the 30 garden beds.
- Bins fill at **0.08 fertilizer per animal per hour**, and the rate does *not*
  change with how many bins are open. At 59 animals that is ~4.7/hour: one bin
  caps in ~2.1 hours, all three in ~6.4 hours. So the first bin is a
  come-back-often trickle and the third turns it into a check-twice-a-day
  rhythm — the unlocks buy patience, not speed.
- Fertilizer fills the unlocked bins in order, so a partly-filled yard reads
  left to right: full, half, empty.
- Each bin draws empty / half / full. **Tapping an unlocked bin collects
  whatever is in it** — a half-full bin can be taken early rather than having to
  be waited out. Bins stop filling when full, so the cap is also the offline
  cap: no separate banking rule.
- Manual collection is the point: it is what makes the left plot a place worth
  travelling to rather than a number that ticks up. No auto-composter.

Bins 2 and 3 cost more than the 50,000🪙 plot they sit on, on purpose: the plot
is the cheap way in, and filling it out is the long goal. Two bins is where the
yard stops needing a mid-day visit, which is the upgrade actually worth 25,000.

### What fertilizer is for

Fertilizer is spent **at planting time**, as part of the plant action — a bed is
either sown plain or sown fertilised. There is no separate "spread it on a
growing crop" step, so there is one interaction per bed rather than two, and the
choice is made when the player is already deciding what to grow.

A fertilised bed **yields ×2**: 🌾+20 / 🥕+35 / 🌽+70 per fertilizer.

At 30 beds of corn that is +2,100🪙 per batch, and a full 30 fertilizer accrues
in ~6.4 hours — roughly 330🪙/hour. Accrual is passive but collection is not, so
that rate assumes bins are emptied before they cap; at that pace the 50,000🪙
plot pays back in about six days.

With one bin the ceiling is the same 330🪙/hour, but only if you empty it every
~2 hours; miss that and the bin sits full and earns nothing. So the bin unlocks
do not raise the top speed — they raise the speed you actually get, which is why
they are priced as upgrades rather than as the plot.

## Right plot: the three ageing factories

Only things that genuinely age can be aged. Dairy and meat, not bread or cake
(fresh is the point) and not metal. That constraint has a good side effect: the
**Dairy (2,000🪙) and Butcher (2,500🪙), the two cheapest machines, become
strategically important**.

The five aged goods are split across **three buildings**, grouped by the tier-1
machine that feeds them — so the right plot mirrors the pasture: separate
buildings, each with its own recipes, each unlocked on its own.

| Building | Cost | Tier 1 | → Tier 2 | Time | × |
|---|---|---|---|---|---|
| 🛖 **Cheese Cave** | with the plot | 🧀 Cheese 200 | Aged Cheese **600** | 4h | 3.0 |
| | | 🧈 Butter 150 | Cultured Butter **450** | 3h | 3.0 |
| 🔥 **Smokehouse** | **60,000🪙** | 🌭 Sausage 130 | Cured Sausage **400** | 3h | 3.1 |
| | | 🥓 Bacon 180 | Smoked Bacon **540** | 4h | 3.0 |
| 🍖 **Ham Cellar** | **120,000🪙** | 🍖 Ham 240 | Aged Ham **720** | 5h | 3.0 |

All three stand on the plot from the moment it is bought. The Cheese Cave is
unlocked; the Smokehouse and Ham Cellar are dimmed with a lock and unlock by
tapping them — no panel row, same as the compost bins.

The emoji in that table are labels for **this document only**. On the farm these
three are drawn buildings with no emoji anywhere on them — see the art rules
above. They still need an emoji for the unlock modal and toasts, which are HTML.

Aged Ham at 720🪙 becomes the most valuable item in the game (currently 🔔 Bell at
360), which is what tier 2 should mean — so the Ham Cellar is one building with
one recipe and the highest price on the plot. It is the thing you can see from
the day you arrive and cannot have for a long time.

Timers run in hours against the machines' 20–60 minutes, so the two layers are
clearly separated — the right plot is the "load it before bed" layer.

**Slots:** each factory opens with **1 slot** and goes to 4, **15,000🪙 each** —
above machine slots at 10,000. Slots are bought inside the factory's own modal,
exactly like the tier-1 machines, so the tap-the-building rule holds all the way
down.

Three unlocked factories at one slot each is ~18 aged items a day, just under the
buyer's 20/day quota. Buy any slot beyond that and the quota starts to bind —
which is what makes slots a decision rather than an obvious yes.

## Right plot: the tier-2 buyer

A permanent building on the right plot. It is the **only** outlet for aged goods;
the plane keeps buying tier 1 and never sees tier 2.

- Always open — no waiting for a visit, unlike the plane.
- Pays the aged product's full price.
- **Daily quota: 20 items**, resetting on the same day key as the daily orders.
  Over quota, goods keep and sell tomorrow.

Average profit is ~362🪙 per aged item, so 20/day is ~7,240🪙/day and the
120,000🪙 plot pays back in about 17 days — one unlocked factory at a time,
though, so the early days on the right plot run at roughly a third of that.

### Aged goods must not leak into tier-1 prices

Three existing paths would otherwise sell them at their base price:

- `sellFarmProduct(id)` sells one stock type at list price
- `sellAllFarm()` empties **all** of `farmStock` at list price
- the plane's wanted list is built from the outputs of every owned machine

So aged goods live in **`farmAged`, a separate inventory from `farmStock`**, and
the three ageing factories are **not** members of `FARM_MACHINES` — they are
their own list, `FARM_AGERS`, with the same shape. That makes the leak
structurally impossible rather than something three call sites have to remember —
and any future "sell everything" button inherits the guarantee for free.

The two lists having the same shape is what lets the lock rule be written once:
draw, hit-test and unlock-modal code all take a list and an owned-map, and are
handed either (`FARM_MACHINES`, `farmMachines`) or (`FARM_AGERS`, `farmAgers`).

## Fix: a long panel currently resizes the farm

Ship this with the plots. The spec deletes the Build Machines card and adds
nothing to the panel, so the panel gets shorter — but the bug is still there for
a big herd or a long visit list, and the farm is the view it damages.

### What happens

On desktop, a long list in the right-hand panel does not scroll inside the
panel. It makes the panel taller, which makes the whole row taller, which
stretches the farm canvas to match — so the farm draws tall and thin, the
pasture and beds spread apart vertically, and the page starts scrolling.

### Why — the cap is a percentage of the thing it is meant to cap

Four rules, each fine on its own:

| Where | Rule |
|---|---|
| [room.css:6-13](games/room/css/room.css#L6-L13) | `body { min-height:100vh; display:flex; flex-direction:column }` — height is **auto**, only the minimum is set |
| [room.css:85-89](games/room/css/room.css#L85-L89) | `.main-wrap { display:flex; flex-direction:row; flex:1 1 auto; min-height:0 }` |
| [room.css:150-160](games/room/css/room.css#L150-L160) | `.panel-wrap { width:420px; max-height:100% }` |
| [room.css:161-163](games/room/css/room.css#L161-L163) | `.panel-inner { flex:1; overflow-y:auto }` |

`body` has `min-height`, not `height`, so its height is **auto** — it grows with
its content. `.main-wrap` is `flex: 1 1 auto` inside it, so `.main-wrap` has no
definite height either: it is as tall as its tallest child.

Now read `.panel-wrap { max-height: 100% }` again. 100% **of `.main-wrap`** —
and `.main-wrap`'s height is whatever the panel just grew to. The cap is a
percentage of a number the panel itself sets, so it can never cap anything. It
is circular, and it silently evaluates to "as tall as you like".

`.panel-inner { overflow-y: auto }` then never scrolls either, for the same
reason: `overflow-y:auto` only produces a scrollbar when the box has a height to
overflow, and this one has none. So the list just keeps growing.

The last step is the row. `.main-wrap` is a flex **row** with default
`align-items: stretch`, so `.room-container`
([room.css:94-97](games/room/css/room.css#L94-L97)) is stretched to the panel's
new height, `.room` stretches inside it, and `#farmView` with it.

And the farm canvas follows the box every frame —
[room-farm-view.js:3874-3875](games/room/js/room-farm-view.js#L3874-L3875) reads
`view.clientHeight` and resizes on any change. Every farm coordinate is
normalised (`x * W`, `y * H`), so a taller `H` does not letterbox the scene, it
**stretches** it: beds spread out, animals walk further apart, huts drift down.
That is the visible symptom, and it explains why it looks like the farm is
broken rather than like the page is just tall.

The comment at [room.css:153-155](games/room/css/room.css#L153-L155) already
states the intent — "capped by the row it sits in, so tall panel content scrolls
inside `.panel-inner`". The intent is right. The percentage is what does not work.

### Why mobile is fine

Under 768px ([room.css:473-508](games/room/css/room.css#L473-L508)) the row
becomes a column and the caps become **viewport** units, not percentages:
`.room-container { height: 55vh }` (66vh on the farm) and `.panel-inner {
max-height: calc(45vh - 10px) }` (34vh on the farm). A `vh` cap does not depend
on the content, so it holds — and there the panel really does scroll inside
itself. Phone layout is meant to scroll and desktop is not; the comment at
[room.css:474-476](games/room/css/room.css#L474-L476) says so.

So this is a desktop-only bug, and the mobile rules are the proof that the fix
below is the intended behaviour rather than a new idea.

### The fix

Give the row a **definite** height, so the percentage has something real to
resolve against. One change, at the top of the file:

```css
html { height: 100%; }
body { height: 100%; }        /* was: min-height: 100vh */
```

Then the chain resolves the way the comments always claimed: `body` is definite
→ `.main-wrap { flex:1 1 auto; min-height:0 }` is definite → `.panel-wrap {
max-height:100% }` really caps → `.panel-inner { flex:1; overflow-y:auto }`
finally has a height to overflow, and the list scrolls inside the panel →
`.room-container` can no longer be stretched by it.

The phone stack must keep growing and scrolling, so restore the old behaviour
inside the existing 768px block:

```css
@media (max-width: 768px) {
  html, body { height: auto; min-height: 100vh; }
}
```

Notably this **does not guess the header's height**. That was the rule that
produced the current layout in the first place
([room.css:2-5](games/room/css/room.css#L2-L5),
[room.css:92-93](games/room/css/room.css#L92-L93)), and a fix like
`max-height: calc(100vh - 60px)` would break it — the header is 151px on a
phone, and the comment at [room.css:501-503](games/room/css/room.css#L501-L503)
records that exact mistake being made before. Stretching to a definite parent
has no such dependency.

### How to check it

1. Desktop width, open the farm, buy enough animals that the herd list is long.
   The list scrolls **inside** the panel; the farm canvas does not change size.
2. Collapse and expand the panel — the farm resizes horizontally only.
3. Every panel tab, and the room and aquarium views, not just the farm: the same
   four rules are shared, so the fix has to be checked where it is not needed as
   well as where it is.
4. Phone width, all three views: the page still scrolls as one column and the
   canvas keeps its 55/66vh.
5. Check whatever sits below `.main-wrap` on a short desktop window is still
   reachable — a definite-height body cannot grow for it.

## Data

New fields on `roomData`, saved and loaded with the rest of the farm state
(`room-firebase.js` save map + load, `room-actions.js` visit, both defaults):

| Field | Type | Meaning |
|---|---|---|
| `farmCompost` | number | fertilizer accrued in the bins, 0–cap |
| `farmCompostAt` | timestamp | last accrual settlement, same pattern as `farmFoodAt` |
| `farmCompostBins` | number | bins unlocked, 1–3 (cap = ×10) |
| `farmFertilizer` | number | collected fertilizer in hand |
| `farmAgers` | object | per factory `{ owned, slots, jobs }` — same shape as `farmMachines` |
| `farmAged` | object | tier-2 inventory, `{ agedcheese: 3, … }` |
| `farmAgedDay` | string | day key the quota belongs to |
| `farmAgedSold` | number | items sold against today's quota |

`farmPlots[i]` gains a `fert` flag marking the bed as sown fertilised; it clears
on harvest.

`farmLandL` / `farmLandR` already exist. `farmMachines` is unchanged — the
tier-1 rework is a UI change only, so no migration and no save-shape change.

Defaults on buying a plot: left sets `farmCompostBins: 1`, right sets
`farmAgers: { cheesecave: { owned: true, slots: 1, jobs: [0] } }`. Everything
else on the plot stays absent until unlocked, which is exactly how
`farmMachines` already reads "not built".

## What this reuses

- **Compost accrual is the `farmFood` pattern** — `planFarmTick` already settles a
  rate against `farmFoodAt` and clamps to a cap.
- **Ageing jobs are machine jobs** — `room-farm.js` already models slot/job/timer
  and is pure, and `_machineState` / `startMachineSlot` / `collectMachineSlot`
  work off a list + an owned-map, so they take `FARM_AGERS` / `farmAgers` with a
  parameter rather than a copy.
- **Unlocking is `buyFarmMachine`** — deduct, log, write `{ owned: true, slots: 1,
  jobs: [0] }`, save, toast. The compost bins are the same three lines against
  `farmCompostBins`.
- **The daily quota is the daily-order pattern** — `farmDayKey` rollover already
  exists.
- **Camera, draw layers and hit-testing are done**: the world runs `-landL ..
  1+landR`, `_farmTargetAt` converts taps to land coordinates, and the pan arrows
  exist.
- **Hover feedback is done** — `_farmHoverK` already grows the pointed-at hut, and
  a locked building uses it unchanged.

- **Steam is reusable** — the huts' three rising puffs already animate off `t`;
  the compost wisp, the smokehouse chimney and the cave glow are the same loop
  with different colour, rate and origin.
- **The hut's ground shadow, 3/4 depth offset and night/snow handling** are
  copied by every new building, so they land in the same world at the same scale.

New work is **seven drawn buildings** — three compost bins (three fill states
each), three ageing factories, one buyer — plus the drawn padlock, the dim+lock
overlay, the shared unlock modal, the accrual field, the aged inventory, and the
buyer's sheet. This is the biggest single art job in the farm so far, and it is
the part most likely to want a second pass. Deleted work: the Garden tab's Build
Machines card.

## Risks

- **Fertilizer flowing too fast inflates crop output.** The 3-bin cap is the
  brake and the rate is one constant.
- **Tier 2 flooding the economy.** The daily quota is the brake, and it is one
  constant.
- **Hit-testing across plots.** Garden beds live in `0..1` and are a nearest-wins
  partition; the `wx ∈ [0,1]` bound already added to `_farmTargetAt` keeps taps on
  the plots from reaching them. The bins, factories and buyer need tap rects on
  their own ranges.
- **Locked buildings stealing taps.** Every locked building is now a live tap
  target on ground that used to be empty, and `farmPickTarget` is nearest-wins.
  The five machine spots are already spaced for their own hit rects, so this is
  covered on the pasture; the new plots must keep the same spacing rather than
  packing buildings in because the art is smaller.
- **The farm looks busier before you own anything.** Five dim huts on the pasture
  is more visual noise than an empty field. The dimming has to be strong enough
  that locked buildings clearly sit behind the live ones — this is a tuning risk
  on the overlay, not a structural one.
- **Seven hand-drawn buildings is a lot of art, and drawn art can't be swapped
  in a line.** An emoji badge is one string; a stone arch is fifty lines of
  paths. Mitigation is to build them one at a time in the order they unlock —
  bin, Cheese Cave, Smokehouse, Ham Cellar — checking each on a phone-width
  stage before starting the next, rather than drawing all seven and then finding
  the scale is wrong.
- **The body height fix touches every view, not just the farm.** `html, body`
  is the top of the page, so the room, the outside view and the aquarium all
  re-lay-out with it. It is a two-line change and a wide blast radius — the
  check list above deliberately covers views this spec otherwise never touches.
- **Silhouettes must survive being small and dimmed.** The test is: at
  phone-narrow width, with the lock overlay on, can you still tell the
  Smokehouse from the Ham Cellar? If not, the shapes are too close and the
  proportions change — not the colours.

## Not doing

- No greenhouse, and no new raw material of any kind.
- No auto-composter, and no auto-unlock — every building is bought by tapping it.
- No buying from the side panel. If something can be owned, it is on the ground.
- No emoji or sign on any new building. If you cannot tell what it is from its
  shape, the shape is wrong.
- The five tier-1 huts keep their existing hut + emoji-sign art. They are getting
  the lock treatment, not a redraw.
- Baked goods and forge goods do not age. Only dairy and meat.
- Feed is still bought with coins. A hay field was considered and set aside — it
  pairs naturally with a breeding yard, but breeding has nowhere to put its
  offspring while the animal cap is 60, which is a much larger change.
