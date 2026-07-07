/* ════════════════════════════════════════════════════════════════
   world-pet-data.js — pet catalog + palettes + render dispatcher for
   the multiplayer World page.
   ----------------------------------------------------------------
   The World page reuses the EXISTING procedural pet art (games/pets/*.js)
   and the accessory renderer (room/js/room-accessories.js), but it does
   NOT load room-base.js (that file boots Firebase + the room's login DOM,
   so it can't run on a bare page). These few pure constants live in
   room-base.js there; they are MIRRORED here so the World is self-contained.

   ⚠️ KEEP IN SYNC with room-base.js: PET_SIZES / PET_COLORS / getPetPalette
   and PET_ACCESSORIES. If a pet colour or accessory is added there, mirror it
   here so the World shows it too. (A future refactor could extract both into a
   shared games/pets/pet-data.js loaded by both pages.)
   ════════════════════════════════════════════════════════════════ */

// The playable pet types, in picker order.
const WORLD_PET_TYPES = ['cat', 'dog', 'bunny', 'hamster', 'fox', 'panda', 'goose', 'tom', 'jerry'];

// Base draw size per pet type (mirrors room-base.js PET_SIZES).
const PET_SIZES = {
  cat: 72, dog: 80, bunny: 64, hamster: 58, fox: 76, panda: 86, goose: 74,
  tom: 78, jerry: 64
};

// Colour palettes per pet (mirrors room-base.js PET_COLORS).
const PET_COLORS = {
  cat: [
    { key: 'gray',    name: 'Gray',    body: '#9E9E9E', stripe: '#616161', inner: '#F8BBD0', bellyLight: '#E0E0E0', nose: '#FF80AB', tongue: '#FAA0A0' },
    { key: 'orange',  name: 'Orange',  body: '#E69A47', stripe: '#9C4A1F', inner: '#FDE1B3', bellyLight: '#F8C98A', nose: '#F27C7C', tongue: '#FAA0A0' },
    { key: 'black',   name: 'Black',   body: '#444444', stripe: '#222222', inner: '#aa6666', bellyLight: '#555555', nose: '#e07070', tongue: '#e08080' },
    { key: 'white',   name: 'White',   body: '#f0f0f0', stripe: '#cccccc', inner: '#ffb6c1', bellyLight: '#ffffff', nose: '#F27C7C', tongue: '#FAA0A0' },
    { key: 'siamese', name: 'Siamese', body: '#f0e6d0', stripe: '#a08060', inner: '#ffb6c1', bellyLight: '#f5efe0', nose: '#F27C7C', tongue: '#FAA0A0' },
  ],
  dog: [
    { key: 'brown',  name: 'Brown',  body: '#b87333', light: '#d4a574', ear: '#8B5E3C', collar: '#d22222' },
    { key: 'golden', name: 'Golden', body: '#d4a030', light: '#f0d090', ear: '#b08828', collar: '#2266dd' },
    { key: 'black',  name: 'Black',  body: '#333333', light: '#555555', ear: '#222222', collar: '#dd2222' },
    { key: 'white',  name: 'White',  body: '#f0f0f0', light: '#ffffff', ear: '#dddddd', collar: '#dd2222' },
    { key: 'husky',  name: 'Husky',  body: '#777777', light: '#f0f0f0', ear: '#555555', collar: '#2266dd' },
  ],
  bunny: [
    { key: 'white', name: 'White', body: '#f0f0f0', pink: '#ffb6c1', tail: '#ffffff', tailShade: '#eeeeee' },
    { key: 'brown', name: 'Brown', body: '#b87333', pink: '#d4a574', tail: '#d4a574', tailShade: '#a56228' },
    { key: 'gray',  name: 'Gray',  body: '#999999', pink: '#cccccc', tail: '#bbbbbb', tailShade: '#888888' },
    { key: 'black', name: 'Black', body: '#333333', pink: '#666666', tail: '#444444', tailShade: '#333333' },
    { key: 'cream', name: 'Cream', body: '#f5e6d0', pink: '#ffb6c1', tail: '#fff5e6', tailShade: '#e8d5c0' },
  ],
  hamster: [
    { key: 'orange', name: 'Orange', body: '#f5c38a', cheek: '#ffe0b2', tummy: '#fff5e6', ear: '#dda070' },
    { key: 'brown',  name: 'Brown',  body: '#a0724a', cheek: '#d4a574', tummy: '#e8c8a0', ear: '#8a5c3a' },
    { key: 'white',  name: 'White',  body: '#f0f0f0', cheek: '#ffffff', tummy: '#ffffff', ear: '#dddddd' },
    { key: 'gray',   name: 'Gray',   body: '#999999', cheek: '#bbbbbb', tummy: '#cccccc', ear: '#777777' },
    { key: 'golden', name: 'Golden', body: '#d4a030', cheek: '#f0d090', tummy: '#f5e8c0', ear: '#b08828' },
  ],
  fox: [
    { key: 'red',    name: 'Red',    body: '#e0702e', belly: '#fff3e0', ear: '#43382f', leg: '#3c322b' },
    { key: 'arctic', name: 'Arctic', body: '#e9edf1', belly: '#ffffff', ear: '#aab2bb', leg: '#9aa3ad' },
    { key: 'silver', name: 'Silver', body: '#5c6066', belly: '#d6dbe0', ear: '#242628', leg: '#26282b' },
    { key: 'cross',  name: 'Cross',  body: '#5a4636', belly: '#dcc6a0', ear: '#241c15', leg: '#201a14' },
    { key: 'fennec', name: 'Fennec', body: '#e8c98a', belly: '#fff6e6', ear: '#b9925c', leg: '#a87f4e' },
  ],
  panda: [
    { key: 'classic', name: 'Classic',  body: '#ffffff', patch: '#333333' },
    { key: 'brown',   name: 'Brown',    body: '#c8975c', patch: '#333333' },
    { key: 'pink',    name: 'Pink',     body: '#f7a8c4', patch: '#333333' },
    { key: 'blue',    name: 'Sky Blue', body: '#8fb6ef', patch: '#333333' },
    { key: 'mint',    name: 'Mint',     body: '#8ed9b2', patch: '#333333' },
  ],
  goose: [
    { key: 'white',  name: 'White',  body: '#f7f7f7', wing: '#e2e2e2', beak: '#f2a13c', leg: '#e08a2c' },
    { key: 'gray',   name: 'Gray',   body: '#b8bcc2', wing: '#9aa0a8', beak: '#3a3a3a', leg: '#d08a2c' },
    { key: 'brown',  name: 'Brown',  body: '#c8a878', wing: '#a8884e', beak: '#3a3a3a', leg: '#caa040' },
    { key: 'swan',   name: 'Swan',   body: '#ffffff', wing: '#f0f0f0', beak: '#e8682c', leg: '#2a2a2a' },
  ],
  tom: [
    { key: 'classic', name: 'Classic', body: '#9099a0', dark: '#5f676e', belly: '#f3ecd9', inner: '#d99faa', muzzle: '#f3ecd9' },
    { key: 'grey',    name: 'Grey',    body: '#a6abb0', dark: '#787d82', belly: '#eef0ec', inner: '#d99faa', muzzle: '#eef0ec' },
    { key: 'butch',   name: 'Butch',   body: '#3f444b', dark: '#23262b', belly: '#c9cdd3', inner: '#c98ba0', muzzle: '#c9cdd3' },
    { key: 'cream',   name: 'Cream',   body: '#d8c7a4', dark: '#a48f6a', belly: '#f7efdd', inner: '#d99faa', muzzle: '#f7efdd' },
  ],
  jerry: [
    { key: 'ochre',   name: 'Ochre',   body: '#c8893f', belly: '#f4e0b8', inner: '#eab595', tail: '#b87c34' },
    { key: 'brown',   name: 'Brown',   body: '#9c6b42', belly: '#e7cca7', inner: '#e2a887', tail: '#8a5c38' },
    { key: 'grey',    name: 'Grey',    body: '#9aa0a6', belly: '#e5e7eb', inner: '#e2b0b0', tail: '#8f959b' },
    { key: 'white',   name: 'White',   body: '#e6e0d4', belly: '#fbf7ee', inner: '#f0c4b2', tail: '#d8d2c6' },
  ],
};

// Resolve a palette object for (type, colorKey); falls back to the first colour.
function getPetPalette(type, colorKey) {
  const colors = PET_COLORS[type];
  if (!colors) return null;
  return colors.find(c => c.key === colorKey) || colors[0];
}

// Accessory catalog (mirrors room-base.js PET_ACCESSORIES). `draw` is the key the
// shared drawPetAccessory() switches on; `gachaOnly` items come from the gacha pool.
const PET_ACCESSORIES = [
  { id: 'acc_tophat',    emoji: '🎩', name: 'Top Hat',       draw: 'tophat' },
  { id: 'acc_crown',     emoji: '👑', name: 'Crown',         draw: 'crown' },
  { id: 'acc_glasses',   emoji: '🕶️', name: 'Sunglasses',    draw: 'glasses' },
  { id: 'acc_bow',       emoji: '🎀', name: 'Bow',           draw: 'bow' },
  { id: 'acc_scarf',     emoji: '🧣', name: 'Scarf',         draw: 'scarf' },
  { id: 'acc_flower',    emoji: '🌸', name: 'Flower',        draw: 'flower' },
  { id: 'acc_bandana',   emoji: '🏴', name: 'Bandana',       draw: 'bandana' },
  { id: 'acc_monocle',   emoji: '🧐', name: 'Monocle',       draw: 'monocle' },
  { id: 'acc_halo',      emoji: '😇', name: 'Halo',          draw: 'halo' },
  { id: 'acc_wizard',    emoji: '🧙', name: 'Wizard Hat',    draw: 'wizard',    gachaOnly: true },
  { id: 'acc_partyhat',  emoji: '🥳', name: 'Party Hat',     draw: 'partyhat',  gachaOnly: true },
  { id: 'acc_heartglass',emoji: '💕', name: 'Heart Glasses', draw: 'heartglass',gachaOnly: true },
  { id: 'acc_devil',     emoji: '😈', name: 'Devil Horns',   draw: 'devil',     gachaOnly: true },
  { id: 'acc_wings',     emoji: '🕊️', name: 'Angel Wings',   draw: 'wings',     gachaOnly: true },
  { id: 'acc_cape',      emoji: '🦸', name: 'Cape',          draw: 'cape',      gachaOnly: true },
  { id: 'acc_ninja',     emoji: '👤', name: 'Ninja Mask',    draw: 'ninja',     gachaOnly: true },
  { id: 'acc_pirate',    emoji: '🏴‍☠️', name: 'Pirate Patch',  draw: 'pirate',    gachaOnly: true },
  { id: 'acc_tiara',     emoji: '👸', name: 'Tiara',         draw: 'tiara',     gachaOnly: true },
  { id: 'acc_starbadge', emoji: '⭐', name: 'Star Badge',    draw: 'starbadge', gachaOnly: true },
];

// Rounded-rectangle path helper. The shared accessory renderer
// (room-accessories.js) uses this for a few pieces (ninja mask, pirate patch);
// it normally lives in room-pets.js, which the World page does not load, so it
// is mirrored here. Defined globally before drawPetAccessory is ever called.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* ── Render dispatcher ────────────────────────────────────────────
   Mirrors room-pets.js drawPetCanvas but only the part the World needs:
   pick the per-pet draw fn (from games/pets/*.js) and call it with the
   resolved palette. The CALLER must already have translated/scaled ctx to
   the pet's on-screen position (same contract as the room). */
function worldDrawPet(ctx, type, size, legPhase, moving, action, ap, t, colorKey, view) {
  const pal = getPetPalette(type, colorKey);
  const hunger = 100; // World pets are never hungry — always their happy look.
  switch (type) {
    case 'cat':     return drawCatPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    case 'dog':     return drawDogPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    case 'bunny':   return drawBunnyPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    case 'hamster': return drawHamsterPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    case 'fox':     return drawFoxPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    case 'panda':   return drawPandaPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    case 'goose':   return drawGoosePet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
    // Tom & Jerry are upright, three-view characters (view defaults to front).
    case 'tom':     return drawTomPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'jerry':   return drawJerryPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    default:        return drawCatPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
  }
}

// Node test export (the browser uses the globals above).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WORLD_PET_TYPES, PET_SIZES, PET_COLORS, getPetPalette, PET_ACCESSORIES };
}
