/* node --test room-farm.test.js — unit tests for the pure farm logic. */
const test = require('node:test');
const assert = require('node:assert');
const F = require('./room-farm.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const OPTS = {
  slowMs: 6 * HOUR, fastMs: 2 * HOUR, dropCap: 3,
  foodPerDay: 2, gainPerDay: 25, decayPerDay: 25,
};

function animal(over) {
  return Object.assign({ id: 'a1', type: 'cow', happiness: 50, lastDropTime: 0 }, over);
}

function tick(over) {
  return F.planFarmTick(Object.assign({ animals: [animal()], dropCounts: {}, now: 0, foodStock: 0, foodAt: 0 }, OPTS, over));
}

/* ── farmCycleMs ── */

test('farmCycleMs interpolates slow→fast with happiness and clamps', () => {
  assert.equal(F.farmCycleMs(0, OPTS.slowMs, OPTS.fastMs), 6 * HOUR);
  assert.equal(F.farmCycleMs(100, OPTS.slowMs, OPTS.fastMs), 2 * HOUR);
  assert.equal(F.farmCycleMs(50, OPTS.slowMs, OPTS.fastMs), 4 * HOUR);
  assert.equal(F.farmCycleMs(-20, OPTS.slowMs, OPTS.fastMs), 6 * HOUR);
  assert.equal(F.farmCycleMs(250, OPTS.slowMs, OPTS.fastMs), 2 * HOUR);
});

/* ── planFarmTick: feeding ── */

test('full trough: herd eats, happiness rises, stock drains', () => {
  // 1 animal × 2 units/day over 1 day = 2 units eaten, fed all day → +25 happiness
  const r = tick({ foodStock: 10, now: DAY });
  assert.equal(r.foodStock, 8);
  assert.equal(r.animals[0].happiness, 75);
  assert.equal(r.foodAt, DAY);
});

test('empty trough: happiness decays, floored at 0', () => {
  const r = tick({ foodStock: 0, now: DAY });
  assert.equal(r.animals[0].happiness, 25);
  const r2 = tick({ foodStock: 0, now: 10 * DAY });
  assert.equal(r2.animals[0].happiness, 0);
});

test('trough runs dry mid-window: gains for fed days, decays after', () => {
  // 2 units = 1 fed day, then 1 hungry day: 50 + 25 − 25 = 50
  const r = tick({ foodStock: 2, now: 2 * DAY });
  assert.equal(r.animals[0].happiness, 50);
  assert.equal(r.foodStock, 0);
});

test('happiness caps at 100 while fed', () => {
  const r = tick({ animals: [animal({ happiness: 95 })], foodStock: 100, now: DAY });
  assert.equal(r.animals[0].happiness, 100);
});

test('herd size scales food demand', () => {
  // 2 animals × 2/day × 1 day = 4 units
  const r = tick({ animals: [animal(), animal({ id: 'a2' })], foodStock: 10, now: DAY });
  assert.equal(r.foodStock, 6);
});

test('no animals: stock untouched, no spawns', () => {
  const r = tick({ animals: [], foodStock: 10, now: 5 * DAY });
  assert.equal(r.foodStock, 10);
  assert.equal(r.spawns.length, 0);
});

/* ── planFarmTick: production ── */

test('no elapsed time → no spawns', () => {
  const r = tick({ foodStock: 10, now: 0 });
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, 0);
});

test('one full cycle spawns one drop and keeps the remainder', () => {
  // happiness 100 fed → cycle 2h; 2.5h elapsed → 1 spawn, clock at 2h
  const a = animal({ happiness: 100 });
  const r = tick({ animals: [a], foodStock: 100, now: 2 * HOUR + 30 * 60 * 1000 });
  assert.equal(r.spawns.length, 1);
  assert.deepEqual(r.spawns[0], { animalId: 'a1', type: 'cow' });
  assert.equal(r.animals[0].lastDropTime, 2 * HOUR);
});

test('spawns capped by dropCap minus uncollected; clock still advances (no banking)', () => {
  const a = animal({ happiness: 100 });
  const r = tick({ animals: [a], foodStock: 1000, now: 20 * HOUR, dropCounts: { a1: 1 } });
  assert.equal(r.spawns.length, 2); // cap 3 − 1 existing
  assert.equal(r.animals[0].lastDropTime, 20 * HOUR); // 10 fast cycles consumed
});

test('animal at cap spawns nothing but its clock advances', () => {
  const a = animal({ happiness: 100 });
  const r = tick({ animals: [a], foodStock: 1000, now: 5 * HOUR, dropCounts: { a1: 3 } });
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, 4 * HOUR);
});

test('clock skew (lastDropTime in the future) resets to now without spawning', () => {
  const a = animal({ lastDropTime: 10 * HOUR });
  const r = tick({ animals: [a], foodStock: 0, now: HOUR });
  assert.equal(r.spawns.length, 0);
  assert.equal(r.animals[0].lastDropTime, HOUR);
});

test('hungry farm produces slower than a fed one', () => {
  const fed = tick({ animals: [animal({ id: 'f', happiness: 100 })], foodStock: 1000, now: 12 * HOUR, dropCap: 99 });
  const hungry = tick({ animals: [animal({ id: 'h', happiness: 0 })], foodStock: 0, now: 12 * HOUR, dropCap: 99 });
  assert.equal(fed.spawns.length, 6);    // 12h / 2h
  assert.equal(hungry.spawns.length, 2); // 12h / 6h
});

/* ── farmRefillUnits ── */

test('farmRefillUnits fills to max when affordable, else what coins buy', () => {
  assert.equal(F.farmRefillUnits(20, 100, 10000, 5), 80); // fill to max
  assert.equal(F.farmRefillUnits(20, 100, 100, 5), 20);   // coins limit
  assert.equal(F.farmRefillUnits(100, 100, 10000, 5), 0); // already full
  assert.equal(F.farmRefillUnits(0, 100, 3, 5), 0);       // too broke for 1 unit
});

/* ── planFarmAutoFeed ── */

// 4 animals × 18 units/day = 72/day of demand; food costs 5 a unit.
const FEED = { herd: 4, foodPerDay: 18, foodMax: 100, costPerUnit: 5, threshold: 0.3 };
function feed(over) { return F.planFarmAutoFeed(Object.assign({}, FEED, over)); }

test('planFarmAutoFeed leaves a comfortable trough alone', () => {
  const r = feed({ foodStock: 80, coins: 99999, elapsedMs: 60 * 1000 });
  assert.deepEqual(r, { foodStock: 80, units: 0, coinsSpent: 0 });
});

test('planFarmAutoFeed tops up once the trough hits the threshold', () => {
  // 30 is exactly 30% of 100 → triggers. A 60s window's demand rounds to nothing,
  // so it buys back the 70 the trough is missing.
  const r = feed({ foodStock: 30, coins: 99999, elapsedMs: 60 * 1000 });
  assert.equal(r.units, 71);              // 70 short + a sliver of the window's demand
  assert.equal(r.coinsSpent, 355);
  assert.equal(r.foodStock, 101);
});

test('planFarmAutoFeed buys the whole window, not just one trough-full', () => {
  // 12h away with an empty trough: 36 units eaten, and it should end full at 100.
  const r = feed({ foodStock: 0, coins: 99999, elapsedMs: 12 * HOUR });
  assert.equal(r.units, 136);
  assert.equal(r.foodStock, 136, 'pre-drain, so planFarmTick lands back at foodMax');
});

test("planFarmAutoFeed hands planFarmTick a stock that drains back to full", () => {
  const elapsedMs = 12 * HOUR;
  const fed = feed({ foodStock: 0, coins: 99999, elapsedMs: elapsedMs });
  const now = elapsedMs;
  const tick = F.planFarmTick({
    animals: [animal(), animal({ id: 'a2' }), animal({ id: 'a3' }), animal({ id: 'a4' })],
    dropCounts: {}, now: now, foodAt: 0, foodStock: fed.foodStock,
    slowMs: 6 * HOUR, fastMs: 2 * HOUR, dropCap: 99,
    foodPerDay: FEED.foodPerDay, gainPerDay: 25, decayPerDay: 25,
  });
  assert.equal(Math.round(tick.foodStock), FEED.foodMax);
  // Fed for every one of the 12h, so happiness only rises: 50 + half a day × 25.
  assert.equal(tick.animals[0].happiness, 62.5);
});

test('planFarmAutoFeed spends only what the coins cover', () => {
  const r = feed({ foodStock: 0, coins: 100, elapsedMs: 12 * HOUR });
  assert.equal(r.units, 20);              // 100 coins / 5
  assert.equal(r.coinsSpent, 100);
  assert.equal(r.foodStock, 20);
});

test('planFarmAutoFeed buys nothing when it cannot afford a single unit', () => {
  const r = feed({ foodStock: 0, coins: 4, elapsedMs: HOUR });
  assert.deepEqual(r, { foodStock: 0, units: 0, coinsSpent: 0 });
});

test('planFarmAutoFeed does nothing without a herd', () => {
  const r = feed({ herd: 0, foodStock: 0, coins: 99999, elapsedMs: 12 * HOUR });
  assert.deepEqual(r, { foodStock: 0, units: 0, coinsSpent: 0 });
});

test('planFarmAutoFeed acts above the threshold when the window would outlast the trough', () => {
  // 90 units is comfortable by the threshold, but a 2-day window eats 144.
  const r = feed({ foodStock: 90, coins: 99999, elapsedMs: 2 * DAY });
  assert.ok(r.units > 0, 'a window bigger than the trough must still be funded');
  assert.equal(r.foodStock, 90 + r.units);
});

test('planFarmAutoFeed always buys whole units, so the charge is whole coins', () => {
  const r = feed({ foodStock: 7.3, coins: 99999, elapsedMs: 37 * 1000 });
  assert.equal(r.units, Math.floor(r.units));
  assert.equal(Number.isInteger(r.coinsSpent), true);
});

/* ── animalLevel ── */

test('animalLevel maps collected count to a 1-based level', () => {
  const L = [0, 10, 30, 60, 100];
  assert.equal(F.animalLevel(0, L), 1);
  assert.equal(F.animalLevel(9, L), 1);
  assert.equal(F.animalLevel(10, L), 2);
  assert.equal(F.animalLevel(59, L), 3);
  assert.equal(F.animalLevel(60, L), 4);
  assert.equal(F.animalLevel(9999, L), 5);
  assert.equal(F.animalLevel(undefined, L), 1);
});

/* ── cropProgress ── */

test('cropProgress goes 0→1 over growMs and clamps', () => {
  assert.equal(F.cropProgress(0, 0, HOUR), 0);
  assert.equal(F.cropProgress(0, HOUR / 2, HOUR), 0.5);
  assert.equal(F.cropProgress(0, HOUR, HOUR), 1);
  assert.equal(F.cropProgress(0, 5 * HOUR, HOUR), 1); // clamp
  assert.equal(F.cropProgress(null, HOUR, HOUR), 0);  // unplanted
});

/* ── generateFarmOrders ── */

test('generateFarmOrders is deterministic per seed and well-formed', () => {
  const products = [{ id: 'egg', coins: 15 }, { id: 'milk', coins: 75 }, { id: 'carrot', coins: 35 }];
  const a = F.generateFarmOrders('2026-06-10', products, 3, 1.4, 20);
  const b = F.generateFarmOrders('2026-06-10', products, 3, 1.4, 20);
  assert.deepEqual(a, b);                       // same day → same orders
  assert.equal(a.length, 3);
  const c = F.generateFarmOrders('2026-06-11', products, 3, 1.4, 20);
  assert.notDeepEqual(a, c);                    // different day → different orders
  a.forEach(o => {
    assert.ok(o.items.length >= 1 && o.items.length <= 2);
    o.items.forEach(it => { assert.ok(it.qty >= 1 && it.qty <= 3); assert.ok(products.some(p => p.id === it.id)); });
    assert.ok(o.reward > 0);
  });
});

/* ── farmSellAllValue ── */

test('farmSellAllValue sums qty × unit price across the stock', () => {
  const prices = { egg: 15, milk: 75, cheese: 160 };
  assert.equal(F.farmSellAllValue({ egg: 3, milk: 2 }, prices), 3 * 15 + 2 * 75);
  assert.equal(F.farmSellAllValue({}, prices), 0);
  assert.equal(F.farmSellAllValue({ egg: 1, unknown: 5 }, prices), 15); // unknown product = 0
});

/* ── level speeds up production ── */

test('a higher-level animal out-produces a level-1 animal over the same window', () => {
  const L = [0, 10, 30, 60, 100];
  const base = { id: 'a1', type: 'cow', happiness: 100, lastDropTime: 0 };
  const lvl1 = F.planFarmTick(Object.assign({ animals: [Object.assign({}, base, { collected: 0 })], dropCounts: {}, now: 12 * HOUR, foodStock: 1000, foodAt: 0, levels: L, levelSpeedup: 0.08, dropCap: 99 }, OPTS, { dropCap: 99 }));
  const lvl5 = F.planFarmTick(Object.assign({ animals: [Object.assign({}, base, { collected: 200 })], dropCounts: {}, now: 12 * HOUR, foodStock: 1000, foodAt: 0, levels: L, levelSpeedup: 0.08, dropCap: 99 }, OPTS, { dropCap: 99 }));
  assert.ok(lvl5.spawns.length > lvl1.spawns.length, 'level 5 should produce more drops than level 1');
});

test('farmRefillUnits returns whole units even when foodStock is fractional', () => {
  // foodStock drifts to a float after production; the gap must be floored so the
  // coin charge (units * cost) never becomes fractional.
  const u = F.farmRefillUnits(73.456, 100, 10000, 5);
  assert.equal(u, 26);                            // floor(100 - 73.456) = 26
  assert.equal(Number.isInteger(u * 5), true);    // whole-coin charge
});

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
    { crop: 'wheat', plantedAt: 0 },             // ripe at 2h
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

/* ── farmPickTarget ── */

// A phone-shaped stage: 0.1 of the width is 36px but 0.1 of the height is 52px,
// which is exactly the distortion normalized hit-testing gets wrong.
const SW = 360, SH = 520;

test('farmPickTarget measures in real pixels, not normalized units', () => {
  // Two targets the same normalized distance (0.1) from the tap — one across,
  // one down. In real pixels the horizontal one is much closer, and it wins.
  const t = [{ id: 'across', x: 0.6, y: 0.5 }, { id: 'down', x: 0.5, y: 0.6 }];
  assert.equal(F.farmPickTarget({ x: 0.5, y: 0.5 }, SW, SH, t, 99), 'across');
  // On a stage that IS square, the two are genuinely tied — first listed wins.
  assert.equal(F.farmPickTarget({ x: 0.5, y: 0.5 }, 500, 500, t, 99), 'across');
});

test('farmPickTarget returns null when everything is out of reach', () => {
  const t = [{ id: 'far', x: 0.9, y: 0.9 }];
  assert.equal(F.farmPickTarget({ x: 0.1, y: 0.1 }, SW, SH, t, 44), null);
  assert.equal(F.farmPickTarget({ x: 0.1, y: 0.1 }, SW, SH, t, 99999), 'far');
});

test('farmPickTarget treats a rect as zero distance anywhere inside it', () => {
  const t = [{ id: 'dot', x: 0.9, y: 0.9 }, { id: 'box', x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.4 }];
  // A reach of 0 only lets a genuine zero distance through, so every one of
  // these passing means "inside the rect" really is distance 0.
  for (const p of [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 }, { x: 0.2, y: 0.4 },
                   { x: 0.6, y: 0.2 }, { x: 0.4, y: 0.3 }, { x: 0.31, y: 0.27 }]) {
    assert.equal(F.farmPickTarget(p, SW, SH, t, 0), 'box', JSON.stringify(p));
  }
});

test('farmPickTarget breaks an exact tie by list order', () => {
  // A point target dead centre of a rect is 0 away, and so is the rect.
  const t = [{ id: 'box', x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.4 }, { id: 'dot', x: 0.4, y: 0.3 }];
  assert.equal(F.farmPickTarget({ x: 0.4, y: 0.3 }, SW, SH, t, 44), 'box');
  assert.equal(F.farmPickTarget({ x: 0.4, y: 0.3 }, SW, SH, t.slice().reverse(), 44), 'dot');
});

test('farmPickTarget measures a rect from its edge once outside', () => {
  const t = [{ id: 'box', x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.4 }];
  // 0.05 of the width past the right edge = 18px — inside a 44px reach.
  assert.equal(F.farmPickTarget({ x: 0.65, y: 0.3 }, SW, SH, t, 44), 'box');
  // 0.2 of the width past it = 72px — out of reach.
  assert.equal(F.farmPickTarget({ x: 0.8, y: 0.3 }, SW, SH, t, 44), null);
});

test('farmPickTarget is nearest-wins, not first-listed-wins', () => {
  const t = [{ id: 'first', x: 0.5, y: 0.5 }, { id: 'second', x: 0.31, y: 0.5 }];
  assert.equal(F.farmPickTarget({ x: 0.3, y: 0.5 }, SW, SH, t, 99), 'second');
});

test('farmPickTarget copes with no targets and junk entries', () => {
  assert.equal(F.farmPickTarget({ x: 0.5, y: 0.5 }, SW, SH, [], 44), null);
  assert.equal(F.farmPickTarget({ x: 0.5, y: 0.5 }, SW, SH, null, 44), null);
  assert.equal(F.farmPickTarget({ x: 0.5, y: 0.5 }, SW, SH, [null, { id: 'ok', x: 0.5, y: 0.5 }], 44), 'ok');
});

/* ── farmCartTapRect ── */

test('farmCartTapRect reaches left far enough to cover the banner', () => {
  const s = 58, pos = { x: 0.7, y: 0.19 };
  const r = F.farmCartTapRect(pos, s, SW, SH, true);
  // The banner _drawMerchantCart paints: bnW = s*1.1 starting at cx - s*0.62 - bnW.
  const cx = pos.x * SW, bnW = s * 1.1, bnX = cx - s * 0.62 - bnW;
  assert.ok(r.x0 * SW <= bnX + 0.001, 'rect left ' + (r.x0 * SW) + ' must reach the banner at ' + bnX);
  assert.ok(r.x1 * SW >= cx + s * 0.73, 'rect right must reach the propeller');
  const mid = { x: (bnX + bnW / 2) / SW, y: pos.y };
  assert.equal(F.farmPickTarget(mid, SW, SH, [Object.assign({ id: 'cart' }, r)], 0), 'cart');
});

test('farmCartTapRect is much smaller while the plane is away (no banner)', () => {
  const s = 58, pos = { x: 0.7, y: 0.19 };
  const here = F.farmCartTapRect(pos, s, SW, SH, true);
  const gone = F.farmCartTapRect(pos, s, SW, SH, false);
  assert.ok((gone.x1 - gone.x0) < (here.x1 - here.x0) / 2, 'the away cloud must not keep the banner space');
  // Still centred on the same spot, so the cloud itself stays tappable.
  assert.equal(F.farmPickTarget(pos, SW, SH, [Object.assign({ id: 'cart' }, gone)], 0), 'cart');
});

/* ── farmMailTapRect ── */

test('farmMailTapRect covers the art ABOVE the ground anchor it is given', () => {
  const s = 40, pos = { x: 0.9, y: 0.32 };
  const r = F.farmMailTapRect(pos, s, SW, SH);
  const gx = pos.x * SW, gy = pos.y * SH;
  // The box sits 1.4 sprite-heights up and the badge a little above that; the
  // rect has to reach them, or the visible mailbox is not the target.
  assert.ok(r.y0 * SH <= gy - s * 1.65, 'rect top must clear the badge');
  assert.ok(r.y1 * SH >= gy, 'rect must still include the ground anchor');
  assert.ok(r.x0 * SW <= gx - s * 0.64, 'rect must reach the badge on the left');
  assert.ok(r.x1 * SW >= gx + s * 0.82, 'rect must reach the flag on the right');
});

test('farmMailTapRect keeps the anchor itself inside the target', () => {
  const s = 40, pos = { x: 0.9, y: 0.32 };
  const r = Object.assign({ id: 'mail' }, F.farmMailTapRect(pos, s, SW, SH));
  assert.equal(F.farmPickTarget(pos, SW, SH, [r], 0), 'mail');
});

/* ── Social layer: day / week keys ── */

test('farmDayKey is the local YYYY-MM-DD, zero-padded', () => {
  assert.equal(F.farmDayKey(new Date(2026, 6, 26)), '2026-07-26');
  assert.equal(F.farmDayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('farmWeekIdFor backs up to the Sunday that starts the week', () => {
  // 2026-07-26 is a Sunday → it starts its own week.
  assert.equal(F.farmWeekIdFor(new Date(2026, 6, 26)), '2026-07-26');
  assert.equal(F.farmWeekIdFor(new Date(2026, 6, 27)), '2026-07-26'); // Mon
  assert.equal(F.farmWeekIdFor(new Date(2026, 7, 1)), '2026-07-26');  // Sat
  assert.equal(F.farmWeekIdFor(new Date(2026, 7, 2)), '2026-08-02');  // next Sun
});

test('farmWeekIdFor crosses a month boundary correctly', () => {
  assert.equal(F.farmWeekIdFor(new Date(2026, 7, 1)), '2026-07-26');
});

/* ── farmHelpAllowance ── */

test('farmHelpAllowance spends down today, and resets on a new day', () => {
  assert.equal(F.farmHelpAllowance('2026-07-26', '2026-07-26', 0, 5), 5);
  assert.equal(F.farmHelpAllowance('2026-07-26', '2026-07-26', 3, 5), 2);
  assert.equal(F.farmHelpAllowance('2026-07-26', '2026-07-26', 5, 5), 0);
  assert.equal(F.farmHelpAllowance('2026-07-26', '2026-07-26', 9, 5), 0);  // never negative
  assert.equal(F.farmHelpAllowance('2026-07-25', '2026-07-26', 5, 5), 5);  // stale tally → full again
  assert.equal(F.farmHelpAllowance('', '2026-07-26', 0, 5), 5);            // never helped
});

/* ── farmSentKinds ── */

// These are the farm's OWN inbox docs, read back by their author — the same
// records the rules check, so what the panel greys out can't drift from what
// the server will accept.
test('farmSentKinds lists what this visitor sent that farm today', () => {
  const items = [
    { kind: 'cheer', day: '2026-07-26' },
    { kind: 'water', day: '2026-07-26' },
    { kind: 'gift', prod: 'milk', day: '2026-07-26' },
  ];
  assert.deepEqual(F.farmSentKinds(items, '2026-07-26'), ['cheer', 'water', 'gift:milk']);
});

test('farmSentKinds ignores items from other days', () => {
  const items = [
    { kind: 'cheer', day: '2026-07-25' },
    { kind: 'feed', day: '2026-07-26' },
    { kind: 'gift', prod: 'cake', day: '2026-07-24' },
  ];
  assert.deepEqual(F.farmSentKinds(items, '2026-07-26'), ['feed']);
});

test('farmSentKinds keys gifts per product, so another product stays available', () => {
  const sent = F.farmSentKinds([{ kind: 'gift', prod: 'milk', day: 'D' }], 'D');
  assert.ok(sent.indexOf('gift:milk') >= 0);
  assert.ok(sent.indexOf('gift:cheese') < 0);
});

test('farmSentKinds de-duplicates and survives junk', () => {
  const items = [
    { kind: 'cheer', day: 'D' }, { kind: 'cheer', day: 'D' },
    null,
    { kind: 'gift', day: 'D' },            // a gift with no product is not a target
    { day: 'D' },                          // no kind at all
  ];
  assert.deepEqual(F.farmSentKinds(items, 'D'), ['cheer']);
});

test('farmSentKinds on an empty or missing list means nothing sent', () => {
  assert.deepEqual(F.farmSentKinds([], 'D'), []);
  assert.deepEqual(F.farmSentKinds(null, 'D'), []);
});

/* ── farmInboxEffects ── */

const IN_OPTS = { cheerCoin: 20, cheerCapPerDay: 10, waterMs: 10 * 60 * 1000, feedUnits: 5, giftMaxQty: 5 };

test('farmInboxEffects folds one of each kind into a single settlement', () => {
  const e = F.farmInboxEffects([
    { kind: 'cheer', day: '2026-07-26' },
    { kind: 'water', day: '2026-07-26' },
    { kind: 'feed', day: '2026-07-26' },
    { kind: 'gift', day: '2026-07-26', prod: 'milk', qty: 3 },
  ], IN_OPTS);
  assert.equal(e.cheers, 1);
  assert.equal(e.coins, 20);
  assert.equal(e.waterMs, 10 * 60 * 1000);
  assert.equal(e.food, 5);
  assert.deepEqual(e.stock, { milk: 3 });
  assert.equal(e.gifts, 3);
});

test('farmInboxEffects: an empty inbox settles to nothing', () => {
  const e = F.farmInboxEffects([], IN_OPTS);
  assert.equal(e.coins, 0);
  assert.equal(e.cheers, 0);
  assert.equal(e.waterMs, 0);
  assert.deepEqual(e.stock, {});
});

test('farmInboxEffects caps paid cheers PER DAY, not per claim', () => {
  const mk = (day, n) => Array.from({ length: n }, () => ({ kind: 'cheer', day: day }));
  // 12 cheers in one day → only 10 pay, but all 12 count for popularity.
  const one = F.farmInboxEffects(mk('2026-07-26', 12), IN_OPTS);
  assert.equal(one.cheers, 12);
  assert.equal(one.paidCheers, 10);
  assert.equal(one.coins, 200);
  // Same 12 spread over two days → every one of them pays.
  const two = F.farmInboxEffects(mk('2026-07-25', 6).concat(mk('2026-07-26', 6)), IN_OPTS);
  assert.equal(two.paidCheers, 12);
  assert.equal(two.coins, 240);
});

test('farmInboxEffects re-clamps a gift written under a larger old limit', () => {
  const e = F.farmInboxEffects([{ kind: 'gift', prod: 'cake', qty: 99 }], IN_OPTS);
  assert.deepEqual(e.stock, { cake: 5 });
});

test('farmInboxEffects ignores junk items and malformed gifts', () => {
  const e = F.farmInboxEffects([
    null,
    { kind: 'bogus' },
    { kind: 'gift', qty: 3 },            // no product
    { kind: 'gift', prod: 'milk', qty: 0 },
    { kind: 'gift', prod: 'milk' },      // no qty
  ], IN_OPTS);
  assert.deepEqual(e.stock, {});
  assert.equal(e.coins, 0);
});

test('farmInboxEffects sums repeat gifts of the same product', () => {
  const e = F.farmInboxEffects([
    { kind: 'gift', prod: 'egg', qty: 2 },
    { kind: 'gift', prod: 'egg', qty: 3 },
    { kind: 'gift', prod: 'milk', qty: 1 },
  ], IN_OPTS);
  assert.deepEqual(e.stock, { egg: 5, milk: 1 });
  assert.equal(e.gifts, 6);
});

test('farmInboxEffects stacks water and feed from several helpers', () => {
  const e = F.farmInboxEffects([
    { kind: 'water' }, { kind: 'water' }, { kind: 'water' },
    { kind: 'feed' }, { kind: 'feed' },
  ], IN_OPTS);
  assert.equal(e.waterMs, 30 * 60 * 1000);
  assert.equal(e.food, 10);
});

/* ── farmWeekBump / farmWeekScore ── */

test('farmWeekBump adds within the same week', () => {
  const cur = { farmWeekId: 'W1', farmWeekCheers: 4, farmWeekProduce: 30 };
  const n = F.farmWeekBump(cur, 'W1', 2, 5);
  assert.equal(n.farmWeekId, 'W1');
  assert.equal(n.farmWeekCheers, 6);
  assert.equal(n.farmWeekProduce, 35);
});

test('farmWeekBump rolls a new week over to zero and files the old one under prev', () => {
  const cur = { farmWeekId: 'W1', farmWeekCheers: 4, farmWeekProduce: 30, farmWeekPrevId: 'W0', farmWeekPrevCheers: 9, farmWeekPrevProduce: 90 };
  const n = F.farmWeekBump(cur, 'W2', 1, 2);
  assert.equal(n.farmWeekId, 'W2');
  assert.equal(n.farmWeekCheers, 1);       // fresh week starts from the bump alone
  assert.equal(n.farmWeekProduce, 2);
  assert.equal(n.farmWeekPrevId, 'W1');    // the week that just ended is kept
  assert.equal(n.farmWeekPrevCheers, 4);
  assert.equal(n.farmWeekPrevProduce, 30);
});

test('farmWeekBump on a brand-new room starts clean', () => {
  const n = F.farmWeekBump({}, 'W1', 0, 3);
  assert.equal(n.farmWeekId, 'W1');
  assert.equal(n.farmWeekCheers, 0);
  assert.equal(n.farmWeekProduce, 3);
  assert.equal(n.farmWeekPrevId, '');
});

test('farmWeekScore finds a week in whichever slot still holds it', () => {
  const played = { farmWeekId: 'W2', farmWeekCheers: 1, farmWeekPrevId: 'W1', farmWeekPrevCheers: 7 };
  const idle   = { farmWeekId: 'W1', farmWeekCheers: 7 };   // never opened the farm in W2
  assert.equal(F.farmWeekScore(played, 'W1', 'Cheers'), 7); // rolled over → prev slot
  assert.equal(F.farmWeekScore(idle, 'W1', 'Cheers'), 7);   // never rolled → current slot
  assert.equal(F.farmWeekScore(played, 'W2', 'Cheers'), 1);
  assert.equal(F.farmWeekScore(played, 'W0', 'Cheers'), 0); // too old to score
  assert.equal(F.farmWeekScore({}, 'W1', 'Cheers'), 0);
});

/* ── farmWeekWinners ── */

test('farmWeekWinners ranks by score and pays the prize table in order', () => {
  const w = F.farmWeekWinners([
    { uid: 'a', name: 'A', score: 5 },
    { uid: 'b', name: 'B', score: 20 },
    { uid: 'c', name: 'C', score: 12 },
    { uid: 'd', name: 'D', score: 1 },
  ], [3000, 2000, 1000]);
  assert.deepEqual(w.map(x => x.uid), ['b', 'c', 'a']);
  assert.deepEqual(w.map(x => x.prize), [3000, 2000, 1000]);
  assert.equal(w.length, 3);   // 4th place gets nothing
});

test('farmWeekWinners drops zero scores, even when that leaves prizes unpaid', () => {
  const w = F.farmWeekWinners([
    { uid: 'a', name: 'A', score: 3 },
    { uid: 'b', name: 'B', score: 0 },
  ], [3000, 2000, 1000]);
  assert.equal(w.length, 1);
  assert.equal(w[0].uid, 'a');
});

test('farmWeekWinners breaks ties by uid so every client settles identically', () => {
  const rows = [{ uid: 'zz', name: 'Z', score: 9 }, { uid: 'aa', name: 'A', score: 9 }];
  const a = F.farmWeekWinners(rows, [3000, 2000]);
  const b = F.farmWeekWinners(rows.slice().reverse(), [3000, 2000]);
  assert.deepEqual(a, b);
  assert.equal(a[0].uid, 'aa');
});

test('farmWeekWinners on an empty board pays nobody', () => {
  assert.deepEqual(F.farmWeekWinners([], [3000, 2000, 1000]), []);
  assert.deepEqual(F.farmWeekWinners(null, [3000]), []);
});

/* ── Farm skins ── */

const THEMES = [
  { id: 'meadow',  cost: 0,     day: { grass: ['a'] }, night: { grass: ['n'] } },
  { id: 'harvest', cost: 3000,  day: { grass: ['b'] }, night: { grass: ['nb'] } },
  { id: 'winter',  cost: 8000,  day: { grass: ['c'] } },   // no night block on purpose
];

test('the free default is owned without buying anything', () => {
  assert.equal(F.farmThemeOwned(THEMES[0], []), true);
  assert.equal(F.farmThemeOwned(THEMES[0], null), true);
  assert.equal(F.farmThemeOwned(THEMES[1], []), false);
  assert.equal(F.farmThemeOwned(THEMES[1], ['harvest']), true);
});

test('a skin you have not bought never paints, even if it is selected', () => {
  // The save can hold a skin the player lost access to (a refund, a wipe, a
  // hand-edited doc). Selection alone must not be enough.
  assert.equal(F.farmThemeOf(THEMES, 'harvest', []).id, 'meadow');
  assert.equal(F.farmThemeOf(THEMES, 'harvest', ['harvest']).id, 'harvest');
});

test('an unknown or missing skin falls back to the first, never to nothing', () => {
  assert.equal(F.farmThemeOf(THEMES, 'no-such-skin', ['harvest']).id, 'meadow');
  assert.equal(F.farmThemeOf(THEMES, undefined, []).id, 'meadow');
  assert.equal(F.farmThemeOf(THEMES, '', []).id, 'meadow');
  assert.equal(F.farmThemeOf([], 'meadow', []), null);   // nothing to fall back TO
});

test('the palette follows the clock, and a skin with no night block still paints', () => {
  assert.deepEqual(F.farmThemePalette(THEMES[0], false).grass, ['a']);
  assert.deepEqual(F.farmThemePalette(THEMES[0], true).grass, ['n']);
  assert.deepEqual(F.farmThemePalette(THEMES[2], true).grass, ['c']);   // falls back to day
  assert.equal(F.farmThemePalette(null, false), null);
});

/* ── A row can hold more than one crop ──
   Nothing stops planting bed by bed, so a row of wheat + carrot + corn is legal.
   The signboard used to name only `cropId`, the first crop planted, which meant
   a mixed row announced itself as whichever crop happened to be in the lowest
   bed — and could read "✨ Ready" while naming a crop that was still growing. */

test('farmRowState: a mixed row reports every crop in it, in bed order', () => {
  const now = 0.5 * HOUR;
  const s = F.farmRowState([
    { crop: 'wheat',  plantedAt: now - 0.2 * HOUR },
    { crop: 'carrot', plantedAt: now - 0.2 * HOUR },
    { crop: 'corn',   plantedAt: now - 0.2 * HOUR },
  ], CROPS, now);
  assert.deepEqual(s.kinds, ['wheat', 'carrot', 'corn']);
  assert.equal(s.cropId, 'wheat', 'cropId stays the first, for callers that want just one');
});

test('farmRowState: a kind planted twice is only listed once', () => {
  const now = 0.5 * HOUR;
  const s = F.farmRowState([
    { crop: 'wheat', plantedAt: now - 0.2 * HOUR },
    { crop: 'corn',  plantedAt: now - 0.2 * HOUR },
    { crop: 'wheat', plantedAt: now - 0.1 * HOUR },
  ], CROPS, now);
  assert.deepEqual(s.kinds, ['wheat', 'corn']);
});

test('farmRowState: a single-crop row lists exactly that one', () => {
  const now = 0.5 * HOUR;
  const s = F.farmRowState([
    { crop: 'wheat', plantedAt: now - 0.2 * HOUR },
    { crop: 'wheat', plantedAt: now - 0.1 * HOUR },
  ], CROPS, now);
  assert.deepEqual(s.kinds, ['wheat']);
});

test('farmRowState: an empty row lists nothing', () => {
  const s = F.farmRowState([{ crop: null }, {}], CROPS, 5 * HOUR);
  assert.deepEqual(s.kinds, []);
});
