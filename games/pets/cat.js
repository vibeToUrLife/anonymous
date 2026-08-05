/* ── Cat ──
   Drawn from artwork rather than canvas paths, like Tom and the capybara. One
   sheet (img/cat.png) holds equal cells that all stand on the cell's floor, so
   changing pose never shifts the paws: cell 0 is the idle, sitting and facing
   you, cells 1-2 are the walk seen from the side, cell 3 is asleep.
   The walk cells face RIGHT — the direction the room treats as unmirrored — so
   walking left is the room's own flip and nothing here has to know about it.

   `pal` is ignored: the artwork ships in one coat, which is why room-base.js no
   longer lists a cat palette and the status bar stops offering colour dots.

   Unlike Tom, this sheet has a real sleeping pose, so sleep and nap use it
   instead of being faked by tilting the body — see OWN_SLEEP_POSE in
   room-pets.js, which stops the lie-down transform from tipping over a cat that
   is already lying down. */
const CAT_CELL_W = 262;
const CAT_CELL_H = 202;
const CAT_WALK_FROM = 1;    // first walk cell
const CAT_WALK_N = 2;       // how many walk cells
const CAT_DRAW_W = 1.50;    // drawn width, as a fraction of the pet size
const CAT_FEET_Y = 0.38;    // where the cell's ground line sits below the origin
/* Walk cells per unit of the room's leg phase, which advances 10 a second, so
   the two-cell loop is a stride every 0.4s — each pose held about a fifth of
   a second. Two frames is deliberate: these drawings amble rather than
   stride, and the two furthest apart read as a step where all eight read as
   a shimmer. The packer picks which two, by measurement. */
const CAT_STEP_RATE = 0.5;

/* The cell each pose lives in. 'walk' is deliberately absent: it has no single
   cell, being picked from the leg phase. */
const CAT_POSE_CELL = { front: 0, sleep: 3 };

/* Which pose the cat is in. It lives out here rather than inside the draw call
   because the accessory code has to ask the same question — the head sits half
   a body apart between the front and side poses, so a hat can only be placed
   once the pose is known, and both answers have to come from one place. */
function catPose(moving, action) {
  if (moving) return 'walk';
  if (action === 'sleep' || action === 'nap') return 'sleep';
  return 'front';
}

// Resolved against this file's own URL, because the three pages that load it
// (room, world, index) sit at different depths. Fetched on first draw rather
// than at load: a page with no cat on it must not pay for the sheet.
const CAT_SRC = new URL('img/cat.png', document.currentScript.src).href;
let _catSheet = null;
function catSheet() {
  if (!_catSheet) { _catSheet = new Image(); _catSheet.src = CAT_SRC; }
  return _catSheet;
}

function drawCatPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = catSheet();
  if (!art.naturalWidth) return;   // sheet still downloading

  const pose = catPose(moving, action);
  const col = pose === 'walk'
    ? CAT_WALK_FROM + Math.floor(lp * CAT_STEP_RATE) % CAT_WALK_N
    : CAT_POSE_CELL[pose];

  const w = s * CAT_DRAW_W;
  const h = w * CAT_CELL_H / CAT_CELL_W;
  ctx.drawImage(art, col * CAT_CELL_W, 0, CAT_CELL_W, CAT_CELL_H,
    -w / 2, s * CAT_FEET_Y - h, w, h);
}
