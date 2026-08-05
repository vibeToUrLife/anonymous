/* ── Dog ──
   Drawn from artwork rather than canvas paths, exactly like cat.js. One
   sheet (img/dog.png) holds equal cells that all stand on the cell's floor, so
   changing pose never shifts the paws: cell 0 is the idle, sitting and facing
   you, cells 1-2 are the walk seen from the side, cell 3 is asleep.
   The walk cells face RIGHT — the direction the room treats as unmirrored — so
   walking left is the room's own flip and nothing here has to know about it.

   `pal` is ignored: the artwork ships in one coat, which is why room-base.js no
   longer lists a dog palette and the status bar stops offering colour dots.

   Unlike Tom, this sheet has a real sleeping pose, so sleep and nap use it
   instead of being faked by tilting the body — see OWN_SLEEP_POSE in
   room-pets.js, which stops the lie-down transform from tipping over a dog that
   is already lying down. */
const DOG_CELL_W = 256;
const DOG_CELL_H = 210;
const DOG_WALK_FROM = 1;    // first walk cell
const DOG_WALK_N = 2;       // how many walk cells
const DOG_DRAW_W = 1.50;    // drawn width, as a fraction of the pet size
const DOG_FEET_Y = 0.38;    // where the cell's ground line sits below the origin
/* Walk cells per unit of the room's leg phase, which advances 10 a second, so
   the two-cell loop is a stride every 0.4s — each pose held about a fifth of
   a second. Two frames is deliberate: these drawings amble rather than
   stride, and two poses far enough apart read as a step where all eight read
   as a shimmer. Which two is a judgement, made by eye off the numbered source
   sheet; the packer measures the choice but does not overrule it. */
const DOG_STEP_RATE = 0.5;

/* The cell each pose lives in. 'walk' is deliberately absent: it has no single
   cell, being picked from the leg phase. */
const DOG_POSE_CELL = { front: 0, sleep: 3 };

/* Which pose the dog is in. It lives out here rather than inside the draw call
   because the accessory code has to ask the same question — the head sits half
   a body apart between the front and side poses, so a hat can only be placed
   once the pose is known, and both answers have to come from one place. */
function dogPose(moving, action) {
  if (moving) return 'walk';
  if (action === 'sleep' || action === 'nap') return 'sleep';
  return 'front';
}

// Resolved against this file's own URL, because the three pages that load it
// (room, world, index) sit at different depths. Fetched on first draw rather
// than at load: a page with no dog on it must not pay for the sheet.
const DOG_SRC = new URL('img/dog.png', document.currentScript.src).href;
let _dogSheet = null;
function dogSheet() {
  if (!_dogSheet) { _dogSheet = new Image(); _dogSheet.src = DOG_SRC; }
  return _dogSheet;
}

function drawDogPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = dogSheet();
  if (!art.naturalWidth) return;   // sheet still downloading

  const pose = dogPose(moving, action);
  const col = pose === 'walk'
    ? DOG_WALK_FROM + Math.floor(lp * DOG_STEP_RATE) % DOG_WALK_N
    : DOG_POSE_CELL[pose];

  const w = s * DOG_DRAW_W;
  const h = w * DOG_CELL_H / DOG_CELL_W;
  ctx.drawImage(art, col * DOG_CELL_W, 0, DOG_CELL_W, DOG_CELL_H,
    -w / 2, s * DOG_FEET_Y - h, w, h);
}
