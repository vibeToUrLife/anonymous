# Aquarium equipment — filter, light, pump

Three devices standing in the tank, bought and levelled by tapping them. They are
the aquarium's first coin sink, and the first thing in it a player can decide.

## Why

The aquarium is the only room in the game that **produces coins and never
consumes them**. Every one of its four themes is free; there is nothing to buy at
all. Coins earned here leave for the farm, which is where the 25,000🪙 compost
bins and 50,000🪙 expansions live.

The numbers it runs on today:

| | |
|---|---|
| Collectible species | 13 (3 common · 4 rare · 3 epic · 3 legendary) |
| Idle rate | 3 / 9 / 18 / 36 coins per hour by rarity |
| A **full** tank | **207 coins/hr** |
| Offline cap | **3 hours** — a full tank banks 621🪙 and then stops |

That cap is the sharpest edge. A school or work day earns exactly what a
three-hour nap earns, so the tank punishes the players who are away longest and
have collected the most. Nothing in the game addresses it, and no amount of
fishing changes it.

So the first device is not a multiplier. It is a bigger bucket.

### A rejected idea, and why

The pump was first drafted as a **cooldown cut on Feeding Frenzy** — 5 minutes
down to 2. The frenzy payout math kills it:

```
round = 15s · a flake every 600ms, stopping 1.5s early  → ~22 flakes
payout = bites×3 + bestCombo×5                          → 176🪙 a perfect round
5-min cooldown → 12 rounds/hr                           → 2,100🪙/hr
2-min cooldown → 30 rounds/hr                           → 5,300🪙/hr
```

A full tank idles at 207🪙/hr. Feeding Frenzy already pays **ten times** that to
anyone willing to sit on it, and shortening the cooldown would take it to
twenty-five times — enough to buy out the farm's entire economy in an afternoon.
Selling that as an upgrade means selling the fastest way to make the rest of the
game irrelevant.

The rule this follows, inherited from the side-land spec: **new content must not
devalue old content.** So the pump buys plays of the two games that are capped at
**once a day**, where the ceiling is a hard count and cannot be ground:

| | Bubble Pop | Fish Race |
|---|---|---|
| Round | 20s, ~47 bubbles | one race |
| Value | 2🪙 / 8🪙 / 100🪙 jackpot, jackpot odds rise with legendaries | stake 10–100 at 1.5–4× |
| Worth per play | **~150–500🪙** | **negative** — 0.85 house edge |

An extra race is entertainment, not income, which is exactly why it is safe to
sell. An extra Bubble Pop is worth a few hundred coins and no more, however many
the player buys, because the cap is per day.

## Shape

```
 ┌──────────────────────────────────────────┐
 │ ══════════ 💡 light bar ═══════════════  │  brighter caustics per level
 │                                          │
 │      🐠        🐟                    ╔═╗ │
 │                          🐡          ║🫙║ │  filter — outflow lines
 │            🐠                        ╚═╝ │  thicken per level
 │  ° °                                     │
 │  ° °  🔋 pump                            │  denser bubble column per level
 └──────────────────────────────────────────┘
```

Each device is drawn in the tank and **is its own shop** — there is no equipment
row in the side panel. This follows the compost bins rather than the trough: a
thing you can see, standing where it works, that opens its own box when tapped.
Unbought, it is drawn dim with the 🔒 keyhole dot the farm's locked buildings
use.

## The three tracks

| Device | Buys | Lv1 | Lv2 | Lv3 |
|---|---|---|---|---|
| 🫙 **Filter** | offline cap, from 3h | **6h** · 1,500🪙 | **12h** · 5,000🪙 | **24h** · 15,000🪙 |
| 💡 **Light** | idle rate multiplier | **×1.15** · 2,000🪙 | **×1.3** · 6,000🪙 | **×1.5** · 18,000🪙 |
| 🔋 **Pump** | extra plays per day of 🫧 and 🏁 | **+1 each** · 800🪙 | **+2 each** · 3,000🪙 | **+3 each** · 9,000🪙 |

The pump's numbers are *extra* plays: the allowance is `1 + level` of each game
per day, so an unbought pump is today's one-a-day and Lv3 is four. The light
multiplies **idle earnings only** — mini-game payouts are untouched, or the
rejected cooldown problem comes back through the other door.

Maxing all three costs **60,300🪙**, which puts the aquarium in the same bracket
as the farm's side land (75,000🪙 for bins 2 and 3) rather than beside its small
upgrades.

**Why these prices.** Against a full tank at 207🪙/hr:

- Filter Lv1 adds 3 hours to every collection — 621🪙 a day, so it pays for itself
  in under three days. It is the correct first purchase and is priced to be
  reachable. Lv3 turns one daily collection from 621🪙 into 4,968🪙, which is the
  whole point of the track.
- Light is a flat multiplier and therefore worth most to a player who already
  bought the filter. It is priced a tier above so the buy order stays honest:
  bucket first, then the tap that fills it.
- Pump is cheapest to enter because its value is the softest — half of what it
  sells is a bet with negative expectation.

A new player with three common fish earns 9🪙/hr and none of this is worth buying
yet. That is intended: this is a late sink, and the aquarium's early game is
still "go catch more fish".

## Data

Three new levels, and a counter beside each of the two daily games.

| Field | Type | Meaning |
|---|---|---|
| `aquariumFilter` | 0–3 | filter level, default 0 |
| `aquariumLight` | 0–3 | light level, default 0 |
| `aquariumPump` | 0–3 | pump level, default 0 |
| `aquariumBubbleN` | number | Bubble Pop plays used on `aquariumBubbleDay` |
| `aquariumRaceN` | number | Fish Race plays used on `aquariumRaceDay` |

`aquariumBubbleDay` and `aquariumRaceDay` keep their current meaning and format.

**Migration.** An existing document has a day string and no count. If the stored
day is today and the count is missing, it reads as **1**, because the old format
recorded exactly one play. Without that rule every player who had already played
on the day of the release would get their play back.

The daily counters inherit whatever `_aqGameToday()` returns, so they are correct
by construction the day its day-boundary bug is fixed (see Out of scope).

## Where the numbers land

Both effects belong in the pure module, not in the view, so they are testable the
way the rest of the aquarium maths already is
(`room-aquarium.js` ↔ `room-aquarium.test.js`):

- `aquariumCoinsPerHour(fish, types, rates, lightLevel)` applies the multiplier.
  Every existing caller passes the new argument; omitting it means ×1, so the
  panel's "Earning n/hr" line and the visitor summary stay correct.
- `aquariumIdleCoins(...)` takes the cap from the filter level rather than the
  constant. `_aquariumPending()` is the only place that reads
  `AQUARIUM_OFFLINE_CAP_MS` today.
- `aquariumPlaysPerDay(pumpLevel)` returns `1 + level`, so `startBubblePop` /
  `startFishRace` compare a count against it instead of comparing a day string
  for equality.

New constants sit with the existing `AQUARIUM_*` block in `room-base.js`:
`AQUARIUM_FILTER_CAPS_MS`, `AQUARIUM_FILTER_COSTS`, `AQUARIUM_LIGHT_MULT`,
`AQUARIUM_LIGHT_COSTS`, `AQUARIUM_PUMP_PLAYS`, `AQUARIUM_PUMP_COSTS`.

## Tapping the tank

**The aquarium canvas has no pointer handling of its own today.** `_aqGameTap` is
attached when a mini-game starts and detached when it ends; nothing listens
otherwise. So this adds the tank's first real hit-test, and it must:

- **Not fight the games.** While `_aqGame` is set the canvas belongs to the
  running game; equipment taps are ignored for the duration.
- **Be measured in real pixels against the drawn art**, as rects, nearest-wins —
  the rule the farm's hit-testing already follows. A light bar spanning the tank
  top and a filter box in a corner are very different shapes and must not share
  one flat radius.
- **Stay reachable on a phone.** The filter is the smallest of the three; its rect
  gets a minimum touch size even where the art is smaller, and the three devices
  are placed so no two rects overlap at the narrowest supported canvas.

Tapping opens one box for all three — the same `ws-box` modal shape the farm's
machines use — showing the current level, what the next level buys, and the
price. Owner only: a visitor tapping a device gets nothing.

## Visitors

The three levels must be mirrored in `visitRoom()` alongside `aquariumTheme`.
The devices are drawn from `roomData`, so without mirroring a visitor sees **their
own** equipment standing in someone else's tank. The farm skin shipped with
exactly this bug; `room-visit.test.js` already has the regression test to copy.

A visitor's tank should also render the host's light brightness and bubble
density, since that is the visible reward for having bought them.

## Testing

Pure maths in `room-aquarium.test.js`:

- the light multiplier applies to the rate and to banked idle coins, and level 0
  is exactly today's behaviour
- the filter's cap per level, including that a long absence still stops at it
- `aquariumPlaysPerDay` per pump level
- the migration rule: stored day is today, count missing → reads as 1 play used

Hit-testing in the farm's style — a tap on the middle of each device resolves to
that device, at both a phone and a laptop canvas size, and a tap on open water
resolves to none. One test that a tap is ignored while a mini-game is running.

A visit test that a host's three levels are what get drawn.

## Out of scope

- **The local-day bug.** `_aqGameToday()` and two other helpers still build the
  day string from the device's local calendar, so a second device in another
  timezone gets a fresh set of daily plays. Same root cause as the daily reward
  fixed on 2026-07-31. It is a bug fix, not part of this feature, and should be
  its own change across all three files at once.
- **Auto-collect.** Considered and dropped: the farm already sells one, and the
  collect modal is currently the only moment the aquarium says anything to the
  player.
- **Tank capacity.** There is no limit today — one fish per species, unlimited
  species. Adding a cap in order to sell it back would take something from every
  existing player.
