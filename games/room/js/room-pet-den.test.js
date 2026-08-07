/* node --test room-pet-den.test.js — pets sleeping on their own furniture.

   Each type's collection unlocks a habitat, and once one is in the room its
   owner walks over and sleeps ON it. The interesting part is not that it picks
   a spot but WHICH spot: an anchor read off the drawing (the seat of the
   throne, the mouth of the kennel), a depth read off where the furniture
   stands, and a null the moment the furniture is not there — the three things
   that put a pet on its bed instead of under it, behind it, or asleep in the
   air over a floor the player just cleared.

   room-pets.js is a browser global, not a module, so the block under test is
   sliced out of it the same way room-accessory-preview.test.js slices the
   accessory catalogue out of room-base.js. What that buys is a real test of
   the shipped arithmetic against stub furniture whose box is known exactly. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;

// The den block, from its banner to the end of isPerched.
function denBlock() {
  const src = fs.readFileSync(path.join(DIR, 'room-pets.js'), 'utf8');
  const start = src.indexOf('/* ── Sleeping in your own bed ──');
  assert.ok(start > 0, 'the den block still lives in room-pets.js');
  const end = src.indexOf('\n    }', src.indexOf('function isPerched(st)')) + '\n    }'.length;
  assert.ok(end > start, 'isPerched still closes the block');
  return src.slice(start, end);
}

/* Stub furniture with a box we choose, so the anchors can be checked against
   numbers rather than against whatever the artwork happens to measure today. */
const RW = 1000, RH = 800;
const BOX = { x: 200, y: 300, w: 400, h: 300 };   // px; footing at y=600 → 0.75
const FOOT = 0.75;

function denSandbox(placed) {
  const sandbox = {
    console, Math, JSON, Object, Array, Number, Boolean,
    PET_COLLECTION_DECOR: {
      cat: 'decor_cat_throne', dog: 'decor_dog_doghouse', bunny: 'decor_bunny_garden',
      hamster: 'decor_hamster_playground', fox: 'decor_fox_den',
      panda: 'decor_panda_garden', goose: 'decor_goose_pond',
      tom: 'decor_tom_armchair', jerry: 'decor_jerry_mousehole',
      capybara: 'decor_capybara_onsen',
    },
    hasDecor: (id) => placed.includes(id),
    getDecorPos: () => ({ x: 0.4, y: FOOT }),
    decorArtBox: () => ({ ...BOX }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(denBlock(), sandbox);
  return sandbox;
}

const evalIn = (sb, expr) => vm.runInContext(expr, sb);
const ALL = ['decor_cat_throne', 'decor_dog_doghouse', 'decor_bunny_garden',
             'decor_hamster_playground', 'decor_fox_den', 'decor_panda_garden',
             'decor_goose_pond', 'decor_tom_armchair', 'decor_jerry_mousehole'];

test('the block loaded and every pet with a habitat has an anchor', () => {
  const sb = denSandbox(ALL);
  const anchors = evalIn(sb, 'PET_DEN_ANCHOR');
  const decors = sb.PET_COLLECTION_DECOR;
  assert.equal(Object.keys(anchors).length, 9, 'nine habitats, nine anchors');
  for (const type of Object.keys(anchors)) {
    assert.ok(decors[type], type + ' has no decoration to sleep on');
    assert.ok(anchors[type].u >= 0 && anchors[type].u <= 1, type + ' u is off the picture');
    assert.ok(anchors[type].v >= 0 && anchors[type].v <= 1, type + ' v is off the picture');
  }
});

/* The capybara owns a decoration too, and is deliberately NOT here: its
   habitat is the hot spring, and soaking already takes it there. Listing it
   would give it two ways to arrive at the same piece of furniture. */
test('the capybara is left out — it soaks instead', () => {
  const sb = denSandbox(ALL);
  assert.equal(evalIn(sb, 'PET_DEN_ANCHOR').capybara, undefined);
  assert.equal(sb.denSpotFor('capybara', RW, RH), null);
});

test('no habitat in the room means no spot to sleep on', () => {
  const sb = denSandbox([]);
  for (const type of Object.keys(evalIn(sb, 'PET_DEN_ANCHOR'))) {
    assert.equal(sb.denSpotFor(type, RW, RH), null, type + ' found a bed that is not there');
  }
});

test('one pet putting its bed out does not give every pet one', () => {
  const sb = denSandbox(['decor_cat_throne']);
  assert.ok(sb.denSpotFor('cat', RW, RH), 'the cat has its throne');
  assert.equal(sb.denSpotFor('dog', RW, RH), null, 'the dog slept on the cat\'s throne');
});

test('the spot lands inside the furniture, not beside it', () => {
  const sb = denSandbox(ALL);
  for (const type of Object.keys(evalIn(sb, 'PET_DEN_ANCHOR'))) {
    const spot = sb.denSpotFor(type, RW, RH);
    const px = spot.x * RW, py = spot.y * RH;
    assert.ok(px >= BOX.x && px <= BOX.x + BOX.w, type + ' sleeps off the side (x=' + px + ')');
    assert.ok(py >= BOX.y && py <= BOX.y + BOX.h, type + ' sleeps off the top or bottom (y=' + py + ')');
  }
});

/* Depth is how far away a thing looks, and that is where the furniture STANDS.
   Reading it off the seat instead would shrink a cat for climbing its throne —
   a depth cue reacting to something the player never moved. */
test('depth comes from the furniture\'s footing, not from the seat', () => {
  const sb = denSandbox(ALL);
  const cat = sb.denSpotFor('cat', RW, RH);
  assert.equal(cat.depthY, FOOT);
  assert.ok(cat.y < cat.depthY, 'the throne\'s seat is above its feet');
});

/* The seat of a throne is legitimately above the band a pet may walk in, so
   the y bound here is the room's, not the floor's — the same exemption the hot
   spring needed, and for the same reason: clamped, the pet never arrives. */
test('a spot may sit above the walking band', () => {
  const sb = denSandbox(ALL);
  const spot = sb.denSpotFor('cat', RW, RH);
  assert.ok(spot.y < 0.70, 'the seat should clear the floor band (y=' + spot.y + ')');
  assert.ok(spot.y >= 0.35 && spot.y <= 0.94, 'still bounded by the room');
  assert.ok(spot.x >= 0.04 && spot.x <= 0.70, 'still bounded by the room');
});

test('a habitat whose picture has not downloaded yet is not a bed yet', () => {
  const sb = denSandbox(ALL);
  sb.decorArtBox = () => null;          // no naturalWidth, so no box
  assert.equal(sb.denSpotFor('cat', RW, RH), null);
});

/* isPerched is what exempts a pet from the floor clamp. It has to cover the
   walk over as well as the sleep itself: a pet clamped on the way would drift
   up, be pulled back every frame, and settle for the clamped spot. */
test('a pet counts as perched while asleep on its bed AND on the way there', () => {
  const sb = denSandbox(ALL);
  assert.equal(sb.isPerched({ onDen: true }), true, 'asleep on the bed');
  assert.equal(sb.isPerched({ denOnArrive: true }), true, 'walking to the bed');
  assert.equal(sb.isPerched({ action: 'soak' }), true, 'the spring still counts');
  assert.equal(sb.isPerched({ soakOnArrive: true }), true, 'walking to the spring');
  assert.equal(sb.isPerched({ action: 'sleep' }), false, 'asleep on the floor is not perched');
  assert.equal(sb.isPerched({}), false);
});
