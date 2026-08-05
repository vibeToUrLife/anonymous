/* ── Goose ──
   Drawn from artwork rather than canvas paths, exactly like cat.js. One
   sheet (img/goose.png) holds equal cells that all stand on the cell's floor, so
   changing pose never shifts the feet: cell 0 is the idle, standing and facing
   you, cells 1-2 are the walk seen from the side, cell 3 is asleep.
   The walk cells face RIGHT — the direction the room treats as unmirrored — so
   walking left is the room's own flip and nothing here has to know about it.

   `pal` is ignored: the artwork ships in one coat, which is why room-base.js no
   longer lists a goose palette and the status bar stops offering colour dots.

   Unlike Tom, this sheet has a real sleeping pose, so sleep and nap use it
   instead of being faked by tilting the body — see OWN_SLEEP_POSE in
   room-pets.js, which stops the lie-down transform from tipping over a goose that
   is already lying down.

   The source sheet captions every walk pose and draws sleeping Zs; both are
   painted out when it is packed. The bird is white on near-white paper, so the
   background is keyed by reach from the border rather than by colour — keying
   white would have eaten the goose. */
/* How many cells the sheet holds, in order: idle, walk, walk, asleep. The cells'
   pixel size is NOT written down — it is read off the loaded image, because a
   number copied from the sheet into here is a number that goes stale the next
   time the sheet is repacked, and a stale one silently crops every pose. */
const GOOSE_CELLS = 4;
const GOOSE_WALK_FROM = 1;    // first walk cell
const GOOSE_WALK_N = 2;       // how many walk cells
const GOOSE_DRAW_W = 1.50;    // drawn width, as a fraction of the pet size
const GOOSE_FEET_Y = 0.38;    // where the cell's ground line sits below the origin
/* Walk cells per unit of the room's leg phase, which advances 10 a second, so
   the two-cell loop is a stride every 0.4s — each pose held about a fifth of
   a second. Two frames is deliberate: these drawings amble rather than
   stride, and two poses far enough apart read as a step where all eight read
   as a shimmer. Which two is a judgement, made by eye off the numbered source
   sheet; the packer measures the choice but does not overrule it. */
const GOOSE_STEP_RATE = 0.5;

/* The cell each pose lives in. 'walk' is deliberately absent: it has no single
   cell, being picked from the leg phase. */
const GOOSE_POSE_CELL = { front: 0, sleep: 3 };

/* Which pose the goose is in. It lives out here rather than inside the draw call
   because the accessory code has to ask the same question — the head sits half
   a body apart between the front and side poses, so a hat can only be placed
   once the pose is known, and both answers have to come from one place. */
function goosePose(moving, action) {
  if (moving) return 'walk';
  if (action === 'sleep' || action === 'nap') return 'sleep';
  return 'front';
}

// Resolved against this file's own URL, because the three pages that load it
// (room, world, index) sit at different depths. Fetched on first draw rather
// than at load: a page with no goose on it must not pay for the sheet.
const GOOSE_SRC = new URL('img/goose.png', document.currentScript.src).href;
let _gooseSheet = null;
function gooseSheet() {
  if (!_gooseSheet) { _gooseSheet = new Image(); _gooseSheet.src = GOOSE_SRC; }
  return _gooseSheet;
}

function drawGoosePet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = gooseSheet();
  if (!art.naturalWidth) return;   // sheet still downloading

  const pose = goosePose(moving, action);
  const col = pose === 'walk'
    ? GOOSE_WALK_FROM + Math.floor(lp * GOOSE_STEP_RATE) % GOOSE_WALK_N
    : GOOSE_POSE_CELL[pose];

  const cellW = art.naturalWidth / GOOSE_CELLS, cellH = art.naturalHeight;
  const w = s * GOOSE_DRAW_W;
  const h = w * cellH / cellW;
  ctx.drawImage(art, col * cellW, 0, cellW, cellH,
    -w / 2, s * GOOSE_FEET_Y - h, w, h);
}
