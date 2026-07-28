/* ============================================================
   Farm logic — pure & dependency-free.
   All animals share one food trough: while it has food they get
   happier, when it runs dry happiness decays. Happiness drives
   the production cycle that spawns coin drops. Runs as a browser
   global (other room scripts call these names bare) AND as a Node
   module for tests. All tuning constants are passed in by the
   caller (FARM_* in room-base.js).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  for (const k in api) { if (Object.prototype.hasOwnProperty.call(api, k)) root[k] = api[k]; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DAY_MS = 86400000;

  // Production cycle length for a happiness level: linear slowMs → fastMs.
  function farmCycleMs(happiness, slowMs, fastMs) {
    const h = Math.max(0, Math.min(100, happiness)) / 100;
    return slowMs + (fastMs - slowMs) * h;
  }

  // Animal level (1-based) from how many drops it has produced over its life.
  // `levels` is an ascending array of collected-count thresholds.
  function animalLevel(collected, levels) {
    let lvl = 1;
    for (let i = 0; i < levels.length; i++) if ((collected || 0) >= levels[i]) lvl = i + 1;
    return lvl;
  }

  // Stable string hash (same as the daily-riddle pick) for deterministic seeds.
  function _hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  // Tiny seeded PRNG (LCG) so a day maps to the same orders for everyone.
  function _seededRng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Deterministic daily delivery orders. `products` is [{id, coins}] of eligible
  // goods. Each order asks for 1-2 products (qty 1-3) and pays raw value × markup
  // plus a flat bonus. Same (seedStr, products) → identical orders.
  function generateFarmOrders(seedStr, products, count, markup, bonus) {
    const rng = _seededRng(_hashStr(seedStr + 'orders'));
    const orders = [];
    for (let o = 0; o < count; o++) {
      const pool = products.slice();
      const n = Math.min(pool.length, 1 + Math.floor(rng() * 2));
      const items = [];
      let raw = 0;
      for (let k = 0; k < n; k++) {
        const prod = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        const qty = 1 + Math.floor(rng() * 3);
        items.push({ id: prod.id, qty: qty });
        raw += qty * prod.coins;
      }
      orders.push({ items: items, reward: Math.ceil(raw * (markup || 1.4)) + (bonus || 0) });
    }
    return orders;
  }

  // Crop growth fraction 0..1 from planting time to ripe.
  function cropProgress(plantedAt, now, growMs) {
    if (plantedAt == null || !(growMs > 0)) return 0;
    return Math.max(0, Math.min(1, (now - plantedAt) / growMs));
  }

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

  // Total coins for selling an entire stock; prices maps product id → unit coins.
  function farmSellAllValue(stock, prices) {
    let total = 0;
    for (const k in stock) total += (stock[k] || 0) * (prices[k] || 0);
    return total;
  }

  // Advance the whole farm from its last accounting to `now`:
  //   1. The herd eats from the shared trough (foodPerDay units per animal).
  //      Fed time raises every animal's happiness by gainPerDay; once the
  //      trough is empty the rest of the window decays it by decayPerDay.
  //   2. Each animal's production clock advances at the speed of its updated
  //      happiness. Spawns are capped at dropCap per animal (counting the
  //      uncollected drops in dropCounts); excess cycles are lost — the clock
  //      still advances, so a full animal can't bank production.
  // Serves both the offline catch-up on load and the live tick while open.
  // Returns { animals, foodStock, foodAt, spawns: [{ animalId, type }] }.
  function planFarmTick(opts) {
    const now = opts.now;
    // Optional cap: only count production/feeding within the last capMs. Used by the
    // offline "while you were away" window so animals bank at most capMs of produce.
    const earliest = now - (opts.capMs != null ? opts.capMs : Infinity);
    const herd = opts.animals.length;
    let foodAt = opts.foodAt != null && opts.foodAt <= now ? opts.foodAt : now;
    if (foodAt < earliest) foodAt = earliest;
    const elapsedDays = (now - foodAt) / DAY_MS;
    const demandPerDay = herd * opts.foodPerDay;
    const fedDays = demandPerDay > 0 ? Math.min(elapsedDays, opts.foodStock / demandPerDay) : elapsedDays;
    const hungryDays = elapsedDays - fedDays;
    const foodStock = Math.max(0, opts.foodStock - elapsedDays * demandPerDay);

    const spawns = [];
    const animals = opts.animals.map(a => {
      const happiness = Math.max(0, Math.min(100,
        a.happiness + fedDays * opts.gainPerDay - hungryDays * opts.decayPerDay));
      let last = a.lastDropTime != null ? a.lastDropTime : now;
      if (last > now) return Object.assign({}, a, { happiness: happiness, lastDropTime: now }); // clock skew
      if (last < earliest) last = earliest;   // cap the catch-up window (capMs)
      // Higher-level animals produce faster (cycle shortened by levelSpeedup/level).
      const level = animalLevel(a.collected, opts.levels || [0]);
      const speedMult = 1 + (opts.levelSpeedup || 0) * (level - 1);
      const cycle = farmCycleMs(happiness, opts.slowMs, opts.fastMs) / speedMult;
      const cycles = Math.floor((now - last) / cycle);
      if (cycles <= 0) return Object.assign({}, a, { happiness: happiness });
      const capacity = Math.max(0, opts.dropCap - (opts.dropCounts[a.id] || 0));
      for (let i = 0; i < Math.min(cycles, capacity); i++) spawns.push({ animalId: a.id, type: a.type });
      return Object.assign({}, a, { happiness: happiness, lastDropTime: last + cycles * cycle });
    });
    return { animals: animals, foodStock: foodStock, foodAt: now, spawns: spawns };
  }

  // Auto-feeder: what to buy so the herd eats its way through `elapsedMs` and
  // still finds the trough full at the end.
  //   herd, foodPerDay   — how fast the trough drains
  //   elapsedMs          — the window being accounted for (a 60s live tick, or a
  //                        whole night of catch-up)
  //   foodStock, foodMax — the trough now, and what it holds
  //   coins, costPerUnit — what the purchase is billed against
  //   threshold          — act once stock falls to/below this SHARE of foodMax
  // It bills the window's demand rather than one trough-full: a hopper tops the
  // trough up as it drains, and capping the purchase at capacity would make the
  // feeder useless exactly when it earns its keep — a long night away — turning
  // the trough upgrade into a second paywall in front of the first.
  // Buys whole units and never spends coins it doesn't have; short funds simply
  // buy less, and the herd goes hungry for the rest of the window as usual.
  // Returns { foodStock, units, coinsSpent } — foodStock is PRE-drain, so it can
  // exceed foodMax; feeding it to planFarmTick lands back at foodMax.
  function planFarmAutoFeed(opts) {
    const stock = Math.max(0, opts.foodStock || 0);
    const max = opts.foodMax || 0;
    const herd = opts.herd || 0;
    const rate = opts.costPerUnit || 0;
    const demand = herd * (opts.foodPerDay || 0) * Math.max(0, opts.elapsedMs || 0) / DAY_MS;
    const trigger = max * (opts.threshold != null ? opts.threshold : 0);
    const idle = { foodStock: stock, units: 0, coinsSpent: 0 };
    // Nothing to do with no herd, or while the trough is both comfortable and
    // already holding enough to see the window out.
    if (!herd || (stock > trigger && stock >= demand)) return idle;
    const want = Math.ceil(Math.max(0, demand + max - stock));
    const affordable = rate > 0 ? Math.floor((opts.coins || 0) / rate) : want;
    const units = Math.max(0, Math.min(want, affordable));
    if (!units) return idle;
    return { foodStock: stock + units, units: units, coinsSpent: units * rate };
  }

  // Whole units a refill adds: fill the trough, bounded by what the coins afford.
  // Both bounds are floored so the result is always an integer — otherwise the
  // fractional capacity gap (foodStock is a float) would charge fractional coins.
  function farmRefillUnits(foodStock, foodMax, coins, costPerUnit) {
    return Math.max(0, Math.min(Math.floor(foodMax - foodStock), Math.floor(coins / costPerUnit)));
  }

  /* ── Canvas hit-testing ──
     Normalized distance is meaningless on a canvas that isn't square: on a
     360×520 phone stage, 0.13 of the width is 47px but 0.13 of the height is
     68px, so a "circular" zone is really an ellipse half again as tall as it
     is wide. Every fixed farm target is therefore measured in REAL PIXELS. */

  // Nearest fixed target to a tap.
  //   tap     : {x, y} normalized (0..1) canvas coords
  //   W, H    : canvas size in px
  //   targets : [{ id, x, y }] point targets, and/or [{ id, x0, y0, x1, y1 }]
  //             rect targets (distance 0 anywhere inside)
  //   reachPx : how far a finger may miss and still count
  // NEAREST wins rather than first-listed, so a generous reach can never let
  // one target quietly swallow a tap that plainly belongs to its neighbour.
  function farmPickTarget(tap, W, H, targets, reachPx) {
    let best = null, bestD = Infinity;
    for (const t of targets || []) {
      if (!t) continue;
      let dx, dy;
      if (t.x0 != null) {                              // rect: 0 inside, edge distance outside
        dx = Math.max(t.x0 - tap.x, 0, tap.x - t.x1) * W;
        dy = Math.max(t.y0 - tap.y, 0, tap.y - t.y1) * H;
      } else {
        dx = (t.x - tap.x) * W;
        dy = (t.y - tap.y) * H;
      }
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best && bestD <= (reachPx != null ? reachPx : Infinity) ? best.id : null;
  }

  // The merchant plane's tap target, as a normalized rect covering what it
  // actually DRAWS. Its "Tap to sell!" banner streams out to the LEFT of the
  // body — as far as 1.72 sprite widths — so a circle around the body leaves
  // the one element that says "tap me" outside the target, and on a narrow
  // stage that gap sits right on top of the workshop huts.
  //   pos     : {x, y} normalized centre        s : sprite size in px
  //   present : the plane (banner + body) vs the smaller "away" cloud
  // The vertical padding also absorbs the hover bob (±0.08 s) and banner flap.
  function farmCartTapRect(pos, s, W, H, present) {
    const cx = pos.x * W, cy = pos.y * H;
    const a = present ? s : s * 0.84;
    const left = present ? s * 1.72 : a * 0.62;   // banner tail ← → propeller tip
    const right = present ? s * 0.75 : a * 0.62;
    const up = present ? s * 0.45 : a * 0.5;
    const down = present ? s * 0.45 : a * 0.6;
    return { x0: (cx - left) / W, x1: (cx + right) / W, y0: (cy - up) / H, y1: (cy + down) / H };
  }

  // The mailbox's tap target, as a normalized rect covering what it DRAWS.
  //   pos : {x, y} normalized GROUND anchor — the foot of the post
  //   s   : sprite size in px
  // Everything a player actually looks at — the box, the red count badge, the
  // flag — is painted between 1.4 and 1.8 sprite-heights ABOVE that anchor, so a
  // circle around the anchor leaves the whole visible mailbox outside the
  // target. The multipliers below trace _drawFarmMailbox: badge centre at
  // -0.42s with radius ~0.22s, flag tip at +0.82s, box top at -1.4s less the
  // badge and the bob, ground shadow at +0.11s.
  function farmMailTapRect(pos, s, W, H) {
    const gx = pos.x * W, gy = pos.y * H;
    return {
      x0: (gx - s * 0.72) / W, x1: (gx + s * 0.88) / W,
      y0: (gy - s * 1.80) / H, y1: (gy + s * 0.18) / H,
    };
  }

  /* ── Social layer: visitor inbox + weekly boards ──
     Visitors drop items into the farm owner's inbox (a cheer, a watering, a
     scoop of feed, a gift). The owner claims the batch when they next open the
     farm. Everything here is pure so the settlement is testable without
     Firestore; the view layer owns the reads/writes. */

  // Local YYYY-MM-DD for a date. Day keys are LOCAL (matching the daily-orders
  // seed), so "once a day" means the sender's own day.
  function farmDayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // The Sunday (YYYY-MM-DD) that starts `d`'s week — the id both farm boards are
  // keyed by. Same rule as the 成语接龙 weekly board, so every weekly board on
  // the site rolls over at the same moment.
  function farmWeekIdFor(d) {
    d = d || new Date();
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - s.getDay());   // getDay: 0=Sun … 6=Sat
    return farmDayKey(s);
  }

  // How many more REWARDED helps a visitor has left today. `day`/`count` are the
  // visitor's stored tally; a stored day that isn't today means the tally is
  // stale, so the full allowance is back.
  function farmHelpAllowance(day, today, count, max) {
    const used = day === today ? (count || 0) : 0;
    return Math.max(0, (max || 0) - used);
  }

  // What a visitor has already sent to one farm today, read back from that
  // farm's OWN inbox items — the same docs the server checks, so this can't
  // drift the way a mirror kept on the visitor's doc would.
  //   items : the inbox docs authored by this visitor (any day)
  //   today : local YYYY-MM-DD
  // Gifts collapse to 'gift:<product>' because the server allows one of EACH
  // product a day, not one gift a day.
  function farmSentKinds(items, today) {
    const out = [];
    for (const it of (items || [])) {
      if (!it || it.day !== today) continue;
      const k = it.kind === 'gift' ? (it.prod ? 'gift:' + it.prod : '') : it.kind;
      if (k && out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }

  // Fold a claimed batch of inbox items into one settlement.
  //   items : [{ kind:'cheer'|'water'|'feed'|'gift', day, prod, qty }]
  //   opts  : { cheerCoin, cheerCapPerDay, waterMs, feedUnits, giftMaxQty }
  // Cheers pay PER DAY up to cheerCapPerDay — a week away still pays for each
  // day's cheers instead of collapsing them into one day's allowance. Cheers
  // past a day's cap still count for popularity, they just stop paying coins.
  // Gift quantities are re-clamped here so an item written under an older
  // (larger) limit can't over-credit. Returns the whole settlement.
  function farmInboxEffects(items, opts) {
    const o = opts || {};
    const out = { coins: 0, cheers: 0, paidCheers: 0, waterMs: 0, food: 0, stock: {}, gifts: 0 };
    const perDay = {};
    for (const it of (items || [])) {
      if (!it) continue;
      if (it.kind === 'cheer') {
        out.cheers++;
        const d = it.day || '';
        perDay[d] = (perDay[d] || 0) + 1;
      } else if (it.kind === 'water') {
        out.waterMs += o.waterMs || 0;
      } else if (it.kind === 'feed') {
        out.food += o.feedUnits || 0;
      } else if (it.kind === 'gift') {
        const cap = o.giftMaxQty != null ? o.giftMaxQty : Infinity;
        const qty = Math.max(0, Math.min(cap, Math.floor(it.qty || 0)));
        if (it.prod && qty > 0) { out.stock[it.prod] = (out.stock[it.prod] || 0) + qty; out.gifts += qty; }
      }
    }
    const dayCap = o.cheerCapPerDay != null ? o.cheerCapPerDay : Infinity;
    for (const d in perDay) out.paidCheers += Math.min(perDay[d], dayCap);
    out.coins = out.paidCheers * (o.cheerCoin || 0);
    return out;
  }

  // Roll a room's weekly farm counters to `weekId`, then add to them. A week the
  // counters don't already belong to starts both from zero, so the boards reset
  // themselves without a scheduled job. The week that just ended is kept in the
  // prev* fields — settlement needs last week's numbers after the rollover.
  // Returns the new field values; the caller decides how to persist them.
  function farmWeekBump(cur, weekId, cheers, produce) {
    const c = cur || {};
    const same = c.farmWeekId === weekId;
    return {
      farmWeekId: weekId,
      farmWeekCheers: (same ? (c.farmWeekCheers || 0) : 0) + (cheers || 0),
      farmWeekProduce: (same ? (c.farmWeekProduce || 0) : 0) + (produce || 0),
      farmWeekPrevId: same ? (c.farmWeekPrevId || '') : (c.farmWeekId || ''),
      farmWeekPrevCheers: same ? (c.farmWeekPrevCheers || 0) : (c.farmWeekCheers || 0),
      farmWeekPrevProduce: same ? (c.farmWeekPrevProduce || 0) : (c.farmWeekProduce || 0),
    };
  }

  // One room's score for `weekId` on a board, whichever slot still holds that
  // week. A player who hasn't opened the farm since the week ended never rolled
  // over, so their score is still in the CURRENT slot; one who has played since
  // finds it in the prev slot. Anything older scores 0.
  function farmWeekScore(room, weekId, field) {
    const r = room || {};
    if (r.farmWeekId === weekId) return r['farmWeek' + field] || 0;
    if (r.farmWeekPrevId === weekId) return r['farmWeekPrev' + field] || 0;
    return 0;
  }

  // Rank board rows and attach prizes. `rows` is [{uid, name, score}]. Ties break
  // by uid so every client independently settles to the SAME winners list —
  // whoever gets there first, the payout is identical. Zero scores never win.
  function farmWeekWinners(rows, prizes) {
    const p = prizes || [];
    const list = (rows || []).filter(r => r && (r.score || 0) > 0).slice();
    list.sort((a, b) => (b.score - a.score) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
    return list.slice(0, p.length).map((r, i) => ({ uid: r.uid, name: r.name || '', score: r.score, prize: p[i] || 0 }));
  }

  /* ── Farm skins ──
     Which skin is in force, and whether it may be worn. Kept here rather than
     in the view so the "you always own the free default" rule is stated once
     and tested, instead of being re-derived at each of the three call sites
     (the picker, the buy button, and the painter). */

  // The skin actually in force. An id that is unknown, missing, or owned by
  // nobody falls back to the first entry — a skin removed from the catalog, or
  // a save from a future build, must never leave the canvas unpainted.
  function farmThemeOf(themes, id, owned) {
    const list = themes || [];
    if (!list.length) return null;
    const pick = list.find(t => t && t.id === id);
    if (!pick) return list[0];
    return farmThemeOwned(pick, owned) ? pick : list[0];
  }

  // Free skins are owned by everyone; the rest must have been bought.
  function farmThemeOwned(theme, owned) {
    if (!theme) return false;
    if (!(theme.cost > 0)) return true;
    return (owned || []).indexOf(theme.id) !== -1;
  }

  // The colour set for the current time of day. Falls back to `day` so a skin
  // that forgets its night block still paints something.
  function farmThemePalette(theme, night) {
    if (!theme) return null;
    return (night && theme.night) || theme.day || null;
  }

  return { farmCycleMs, animalLevel, cropProgress, generateFarmOrders, farmSellAllValue, planFarmTick, farmRefillUnits, planFarmAutoFeed, farmRowCount, farmRowIndices, farmRowState, farmAffordableCount,
           farmPickTarget, farmCartTapRect, farmMailTapRect,
           farmDayKey, farmWeekIdFor, farmHelpAllowance, farmSentKinds, farmInboxEffects, farmWeekBump, farmWeekScore, farmWeekWinners,
           farmThemeOf, farmThemeOwned, farmThemePalette };
});
