const test = require('node:test');
const assert = require('node:assert');
const A = require('./room-autofeed.js');

// Sample tables mirroring FOODS/DRINKS shape (cost, restore) from room-base.js.
const FOODS = [
  { cost: 30, restore: 10 }, { cost: 50, restore: 20 }, { cost: 80, restore: 30 },
  { cost: 120, restore: 45 }, { cost: 200, restore: 70 }, { cost: 300, restore: 100 },
];
const DRINKS = [
  { cost: 20, restore: 15 }, { cost: 50, restore: 25 }, { cost: 80, restore: 35 },
  { cost: 120, restore: 50 }, { cost: 180, restore: 70 }, { cost: 280, restore: 100 },
];

test('bestCoinsPerPoint picks the lowest cost-per-restore item', () => {
  assert.strictEqual(A.bestCoinsPerPoint(FOODS), 50 / 20);   // Apple = 2.5
  assert.strictEqual(A.bestCoinsPerPoint(DRINKS), 20 / 15);  // Water ≈ 1.333
});

test('statRefillCost is zero at/above target and rounds up otherwise', () => {
  assert.strictEqual(A.statRefillCost(100, 100, 2.5), 0);
  assert.strictEqual(A.statRefillCost(120, 100, 2.5), 0);
  assert.strictEqual(A.statRefillCost(50, 100, 2.5), 125);      // 50 * 2.5
  assert.strictEqual(A.statRefillCost(50, 100, 20 / 15), 67);   // ceil(50 * 1.333..)
});

test('liveRefillPlan refills stats at/below threshold when affordable', () => {
  const r = A.liveRefillPlan({ hunger: 40, thirst: 90 }, 1000, 2.5, 20 / 15, { threshold: 50, target: 100 });
  assert.strictEqual(r.hunger, 100);     // 40 <= 50 -> refilled
  assert.strictEqual(r.thirst, 90);      // 90 > 50 -> untouched
  assert.strictEqual(r.coinsSpent, 150); // ceil(60 * 2.5)
});

test('liveRefillPlan skips unaffordable stat but funds the next from remaining', () => {
  const r = A.liveRefillPlan({ hunger: 40, thirst: 40 }, 100, 2.5, 20 / 15, { threshold: 50, target: 100 });
  // hunger needs ceil(60*2.5)=150 > 100 -> skip; thirst needs ceil(60*1.333)=80 <= 100 -> fund
  assert.strictEqual(r.hunger, 40);
  assert.strictEqual(r.thirst, 100);
  assert.strictEqual(r.coinsSpent, 80);
});

test('liveRefillPlan leaves above-threshold stats alone and spends nothing', () => {
  const r = A.liveRefillPlan({ hunger: 80, thirst: 80 }, 1000, 2.5, 20 / 15, { threshold: 50, target: 100 });
  assert.deepStrictEqual(r, { hunger: 80, thirst: 80, coinsSpent: 0 });
});

test('planOfflineAutoFeed feeds all pets to target when coins suffice', () => {
  const pets = [
    { hunger: 30, thirst: 30, affection: 100 },
    { hunger: 0, thirst: 0, affection: 50 },
  ];
  const r = A.planOfflineAutoFeed({ pets, coins: 100000, decay: 10, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets, [
    { hunger: 100, thirst: 100, affection: 100 },
    { hunger: 100, thirst: 100, affection: 50 },
  ]);
  const petCost = Math.ceil(10 * 2.5 + 10 * (20 / 15)); // 39
  assert.strictEqual(r.coinsSpent, petCost * 2);
});

test('planOfflineAutoFeed funds pets in order; the rest take normal decay + starvation', () => {
  const pets = [
    { hunger: 100, thirst: 100, affection: 100 },
    { hunger: 5, thirst: 80, affection: 30 },
  ];
  const petCost = Math.ceil(10 * 2.5 + 10 * (20 / 15)); // 39
  const r = A.planOfflineAutoFeed({ pets, coins: petCost, decay: 10, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets[0], { hunger: 100, thirst: 100, affection: 100 });
  // pet2 unaffordable -> decay 10: hunger 0, thirst 70, starveCycles=10-5=5 -> affection 30-10=20
  assert.deepStrictEqual(r.pets[1], { hunger: 0, thirst: 70, affection: 20 });
  assert.strictEqual(r.coinsSpent, petCost);
});

test('planOfflineAutoFeed with zero coins applies normal decay to all', () => {
  const r = A.planOfflineAutoFeed({ pets: [{ hunger: 50, thirst: 50, affection: 10 }], coins: 0, decay: 10, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets[0], { hunger: 40, thirst: 40, affection: 10 });
  assert.strictEqual(r.coinsSpent, 0);
});

test('planOfflineAutoFeed with zero decay is a no-op', () => {
  const r = A.planOfflineAutoFeed({ pets: [{ hunger: 60, thirst: 60, affection: 10 }], coins: 1000, decay: 0, foodRate: 2.5, drinkRate: 20 / 15, target: 100, starveLoss: 2 });
  assert.deepStrictEqual(r.pets[0], { hunger: 60, thirst: 60, affection: 10 });
  assert.strictEqual(r.coinsSpent, 0);
});
