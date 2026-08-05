/* ── Fox ──
   Drawn from artwork rather than canvas paths, exactly like cat.js. One
   sheet (img/fox.png) holds equal cells that all stand on the cell's floor, so
   changing pose never shifts the paws: cell 0 is the idle, sitting and facing
   you, cells 1-2 are the walk seen from the side, cell 3 is asleep.
   The walk cells face RIGHT — the direction the room treats as unmirrored — so
   walking left is the room's own flip and nothing here has to know about it.

   `pal` is ignored: the artwork ships in one coat, which is why room-base.js no
   longer lists a fox palette and the status bar stops offering colour dots.

   Unlike Tom, this sheet has a real sleeping pose, so sleep and nap use it
   instead of being faked by tilting the body — see OWN_SLEEP_POSE in
   room-pets.js, which stops the lie-down transform from tipping over a fox that
   is already lying down. */
/* How many cells the sheet holds, in order: idle, walk, walk, asleep. The cells'
   pixel size is NOT written down — it is read off the loaded image, because a
   number copied from the sheet into here is a number that goes stale the next
   time the sheet is repacked, and a stale one silently crops every pose. */
const FOX_CELLS = 4;
const FOX_WALK_FROM = 1;    // first walk cell
const FOX_WALK_N = 2;       // how many walk cells
const FOX_DRAW_W = 1.50;    // drawn width, as a fraction of the pet size
const FOX_FEET_Y = 0.38;    // where the cell's ground line sits below the origin
/* Walk cells per unit of the room's leg phase, which advances 10 a second, so
   the two-cell loop is a stride every 0.4s — each pose held about a fifth of
   a second. Two frames is deliberate: these drawings amble rather than
   stride, and two poses far enough apart read as a step where all eight read
   as a shimmer. Which two is a judgement, made by eye off the numbered source
   sheet; the packer measures the choice but does not overrule it. */
const FOX_STEP_RATE = 0.5;

/* The cell each pose lives in. 'walk' is deliberately absent: it has no single
   cell, being picked from the leg phase. */
const FOX_POSE_CELL = { front: 0, sleep: 3 };

/* Which pose the fox is in. It lives out here rather than inside the draw call
   because the accessory code has to ask the same question — the head sits half
   a body apart between the front and side poses, so a hat can only be placed
   once the pose is known, and both answers have to come from one place. */
function foxPose(moving, action) {
  if (moving) return 'walk';
  if (action === 'sleep' || action === 'nap') return 'sleep';
  return 'front';
}

// Resolved against this file's own URL, because the three pages that load it
// (room, world, index) sit at different depths. Fetched on first draw rather
// than at load: a page with no fox on it must not pay for the sheet.
const FOX_SRC = new URL('img/fox.png', document.currentScript.src).href;
let _foxSheet = null;
function foxSheet() {
  if (!_foxSheet) { _foxSheet = new Image(); _foxSheet.src = FOX_SRC; }
  return _foxSheet;
}

function drawFoxPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = foxSheet();
  if (!art.naturalWidth) return;   // sheet still downloading

  const pose = foxPose(moving, action);
  const col = pose === 'walk'
    ? FOX_WALK_FROM + Math.floor(lp * FOX_STEP_RATE) % FOX_WALK_N
    : FOX_POSE_CELL[pose];

  const cellW = art.naturalWidth / FOX_CELLS, cellH = art.naturalHeight;
  const w = s * FOX_DRAW_W;
  const h = w * cellH / cellW;
  ctx.drawImage(art, col * cellW, 0, cellW, cellH,
    -w / 2, s * FOX_FEET_Y - h, w, h);
}
