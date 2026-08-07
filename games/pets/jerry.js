/* ── Jerry (Tom & Jerry mouse) ──
   Drawn from artwork instead of canvas paths, like Tom. One sheet
   (img/jerry.png) holds equal cells that all stand on the cell's floor, so
   changing frame never moves his feet: cell 0 is Jerry standing and facing the
   viewer, cells 1-4 are one loop of the walk — contact, down, passing, up —
   and cell 5 is Jerry curled up asleep. The walk cells face RIGHT, which is the
   direction the room treats as unmirrored, so walking left is the room's own
   flip.
   `pal` is ignored: Jerry ships in his own coat.

   The sleeping cell is a real drawing, so sleep and nap use it instead of being
   faked by tilting the body — see OWN_SLEEP_POSE in room-pets.js, which stops
   the lie-down transform from tipping over a Jerry already lying down. */
/* The walk is four cells, not the twelve on the reference sheet — those twelve
   are the same four poses drawn three times over. The reference draws its
   turnaround row about 1.4x larger than its walk row, so the front pose was
   scaled down to match the walk before packing; without that Jerry would grow
   every time he stopped. */
const JERRY_CELL_W = 112;
const JERRY_CELL_H = 117;
const JERRY_WALK = 4;        // walk cells, starting at index 1
const JERRY_DRAW_H = 1.16;   // Jerry's height, as a fraction of the pet size
const JERRY_FEET_Y = 0.51;   // where the floor sits below the origin, same fraction
/* The cell each still pose lives in. 'walk' is deliberately absent: it has no
   single cell, being picked from the leg phase. The sleeping drawing was scaled
   to the standing cell by eye, the same judgement tom.js records. */
const JERRY_POSE_CELL = { front: 0, sleep: 5 };
// Walk cells per unit of the room's leg phase, which advances 10 a second — so
// the four-cell loop is a full stride every 0.63s, the cadence his drawn legs
// used to swing at.
const JERRY_STEP_RATE = 0.64;

// Resolved against this file's own URL, because the pages that load it sit at
// different depths. Fetched on first draw rather than at load: the main site
// shows no Jerry, so it must not pay for the sheet.
//
// The sheet rides this script's OWN cache-buster, the same way Tom's does and
// for the same reason: re-packing keeps the filename, and code and artwork
// disagreeing about the cell count draws the new pose out of nothing.
const _jerryArtSrc = document.currentScript.src;
const _jerryArtQ = _jerryArtSrc.indexOf('?') >= 0 ? _jerryArtSrc.slice(_jerryArtSrc.indexOf('?')) : '';
const JERRY_SRC = new URL('img/jerry.png', _jerryArtSrc).href + _jerryArtQ;
let _jerrySheet = null;
function jerrySheet() {
  if (!_jerrySheet) { _jerrySheet = new Image(); _jerrySheet.src = JERRY_SRC; }
  return _jerrySheet;
}

/* Which pose Jerry is in. Out here rather than inside the draw call because the
   accessory code has to ask the same question — that big head sits a long way
   down once he curls up — and both answers have to come from one place. */
function jerryPose(moving, action) {
  if (moving) return 'walk';
  if (action === 'sleep' || action === 'nap') return 'sleep';
  return 'front';
}

function drawJerryPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = jerrySheet();
  if (!art.naturalWidth) return;   // sheet still downloading
  const pose = jerryPose(moving, action);
  const col = pose === 'walk'
    ? 1 + Math.floor(lp * JERRY_STEP_RATE) % JERRY_WALK
    : JERRY_POSE_CELL[pose];
  const h = s * JERRY_DRAW_H, w = h * JERRY_CELL_W / JERRY_CELL_H;
  ctx.drawImage(art, col * JERRY_CELL_W, 0, JERRY_CELL_W, JERRY_CELL_H,
    -w / 2, s * JERRY_FEET_Y - h, w, h);
}
