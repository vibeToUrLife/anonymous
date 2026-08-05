/* node --test room-visit.test.js — what a visit mirrors into roomData.
   Loads the REAL room-actions.js in a sandbox and runs visitRoom() against a
   fake host document. The farm skin is the case that regressed: the canvas
   reads roomData.farmTheme, so a field visitRoom forgets leaves the host's
   farm painted in the VISITOR's look. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;

// A DOM stub that never returns null: room-actions.js wires a few listeners at
// load time and would throw on a bare getElementById.
function fakeEl() {
  return {
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} },
    dataset: {}, style: {}, innerHTML: '', textContent: '',
    querySelector: () => fakeEl(), querySelectorAll: () => [],
  };
}

function visitSandbox(hostDoc) {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
    isNaN, parseInt, parseFloat, Infinity, NaN, Promise,
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0,
    document: { getElementById: () => fakeEl(), querySelectorAll: () => [], body: fakeEl() },
    T: (s) => s, showToast() {}, escapeHtml: (s) => String(s == null ? '' : s),
    getPlayerName: () => 'T', saveRoom: () => Promise.resolve(true),
    renderAll() {}, renderFarmPanel() {}, drawFarmCanvas() {}, checkAchievements() {},
    logCoin() {}, closeFarm() {}, closePetStatus() {}, migratePets: (d) => d.pets || [],
    PETS: [], DECORATIONS: [], PLANT_LEVELS: [], PET_COLORS: {},
    currentUid: 'me', viewingUid: 'me', currentLayer: 1, isOutsideView: false,
    userDocRef: (uid) => ({ get: () => Promise.resolve({ exists: true, data: () => hostDoc, id: uid }) }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.scrollTo = () => {};
  vm.createContext(sandbox);
  // visitRoom reads the host's pasture level back through farmCapLevelOf, which
  // lives in room-base.js among a lot of Firebase bootstrapping; take just that
  // block, the way room-farm-hit.test.js takes the farm consts.
  const base = fs.readFileSync(path.join(DIR, 'room-base.js'), 'utf8');
  const f = base.indexOf('const FARM_EXPAND_COSTS = [');
  vm.runInContext(base.slice(f, base.indexOf('const FARM_AUTOCOLLECT_COST', f)), sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'room-actions.js'), 'utf8'), sandbox);
  return sandbox;
}

// The visitor owns (and is wearing) sakura; the host owns nothing and is on the
// free skin. Before the fix the host's farm came out in sakura.
test('visitRoom paints the host farm in the HOST skin, not mine', async () => {
  const sb = visitSandbox({ farmTheme: 'meadow', ownedFarmThemes: [] });
  sb.roomData = { farmTheme: 'sakura', ownedFarmThemes: ['sakura'], pets: [], layerData: {} };

  await sb.visitRoom('host');

  assert.equal(sb.roomData.farmTheme, 'meadow');
  assert.deepEqual(sb.roomData.ownedFarmThemes, []);
});

/* The aquarium's three devices are DRAWN IN THE TANK, so a visit that forgets
   them stands the visitor's own filter, light and pump in someone else's water —
   and reports the host's earnings at the visitor's multiplier. Same shape as the
   farm-skin bug above, one room over. */
test('visitAquarium paints the HOST equipment, not mine', async () => {
  const sb = visitSandbox({ aquariumFilter: 3, aquariumLight: 2, aquariumPump: 1 });
  sb.roomData = {
    aquariumFilter: 0, aquariumLight: 0, aquariumPump: 0,
    pets: [], layerData: {},
  };

  await sb.visitRoom('host');

  assert.equal(sb.roomData.aquariumFilter, 3);
  assert.equal(sb.roomData.aquariumLight, 2);
  assert.equal(sb.roomData.aquariumPump, 1);
});

test('a host with no equipment blanks mine rather than leaving it standing', async () => {
  const sb = visitSandbox({ aquariumFish: [] });          // host bought nothing
  sb.roomData = {
    aquariumFilter: 3, aquariumLight: 3, aquariumPump: 3,
    pets: [], layerData: {},
  };

  await sb.visitRoom('host');

  assert.equal(sb.roomData.aquariumFilter, 0);
  assert.equal(sb.roomData.aquariumLight, 0);
  assert.equal(sb.roomData.aquariumPump, 0);
});

// The other direction: a paid skin I don't own still has to show, which is why
// the host's ownedFarmThemes is mirrored alongside the id (farmThemeOf() drops
// an unowned id back to the default).
test('visitRoom carries the ownership the host skin needs', async () => {
  const sb = visitSandbox({ farmTheme: 'harvest', ownedFarmThemes: ['harvest'] });
  sb.roomData = { farmTheme: 'meadow', ownedFarmThemes: [], pets: [], layerData: {} };

  await sb.visitRoom('host');

  assert.equal(sb.roomData.farmTheme, 'harvest');
  assert.deepEqual(sb.roomData.ownedFarmThemes, ['harvest']);
});

// A host who has never touched the shop has no fields at all on their document.
test('visitRoom falls back to the free skin for an empty host document', async () => {
  const sb = visitSandbox({});
  sb.roomData = { farmTheme: 'sakura', ownedFarmThemes: ['sakura'], pets: [], layerData: {} };

  await sb.visitRoom('host');

  assert.equal(sb.roomData.farmTheme, 'meadow');
  assert.deepEqual(sb.roomData.ownedFarmThemes, []);
});

/* The pasture level sets where the crop fence is drawn and how many animals the
   pen holds, so a host whose level went missing under their bought plots would
   be toured with their herd crammed onto a strip of grass too narrow for it.
   Same repair the host's own load applies — see farmCapLevelOf. */
test('a visit reads the host pasture back through the same repair', async () => {
  const sb = visitSandbox({ farmCapLevel: 1, farmLandL: true, farmLandR: true, pets: [] });
  sb.roomData = { pets: [], layerData: {} };
  const max = vm.runInContext('FARM_EXPAND_COSTS', sb).length;

  await sb.visitRoom('host');

  assert.equal(sb.roomData.farmCapLevel, max,
    'the host owns both plots, which are only sold to a finished pasture');
  assert.equal(sb.roomData.farmLandL, true);
  assert.equal(sb.roomData.farmLandR, true);
});

test('a host with no plots is toured at exactly the level they saved', async () => {
  const sb = visitSandbox({ farmCapLevel: 1, pets: [] });
  sb.roomData = { pets: [], layerData: {} };
  await sb.visitRoom('host');
  assert.equal(sb.roomData.farmCapLevel, 1, 'the repair invented expansions on a host that had none');
});
