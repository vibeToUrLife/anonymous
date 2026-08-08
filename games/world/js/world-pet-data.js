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
const WORLD_PET_TYPES = ['cat', 'dog', 'bunny', 'hamster', 'fox', 'panda', 'goose', 'tom', 'jerry', 'capybara'];

// Base draw size per pet type (mirrors room-base.js PET_SIZES).
const PET_SIZES = {
  cat: 72, dog: 80, bunny: 64, hamster: 58, fox: 76, panda: 86, goose: 74,
  tom: 92, jerry: 64, capybara: 88
};

// Colour palettes per pet (mirrors room-base.js PET_COLORS), now empty: every
// pet is drawn from artwork (games/pets/img/*.png) and artwork ships in one
// coat. Kept rather than deleted so the World keeps mirroring the room — and so
// a pet that one day arrives with a second coat has somewhere to go.
//
// This mirror had drifted: it still listed cat, dog, bunny and panda coats after
// the room dropped them, which offered the World colour dots that did nothing.
const PET_COLORS = {};

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

// Rounded-rectangle path helper, mirrored from room-pets.js, which the World
// page does not load. The accessories themselves stopped needing it when they
// became drawings — nothing in the World calls it today — but the shop-card
// picture in room-accessories.js still rounds its backdrop with it, and that
// file IS loaded here, so the name has to resolve if the World ever shows one.
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
    /* All seven pick their own cell from `moving` and `action`, so the view arg
       goes unread and the facing flip alone turns them round. `pal` is unread
       too — artwork ships in one coat — but it is still passed, because these
       take it in the same slot every other pet does. */
    case 'cat':     return drawCatPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'dog':     return drawDogPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'bunny':   return drawBunnyPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'hamster': return drawHamsterPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'fox':     return drawFoxPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'panda':   return drawPandaPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'goose':   return drawGoosePet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    // Tom & Jerry, likewise.
    case 'tom':     return drawTomPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    case 'jerry':   return drawJerryPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    // Sprite-based. The caller sends 'front' when standing still, which is the
    // capybara's sitting pose — exactly right for an idle pet.
    case 'capybara': return drawCapybaraPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal, view);
    default:        return drawCatPet(ctx, size, legPhase, moving, hunger, action, ap, t, pal);
  }
}

// Node test export (the browser uses the globals above).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WORLD_PET_TYPES, PET_SIZES, PET_COLORS, getPetPalette, PET_ACCESSORIES };
}
