/* ── Tom (Tom & Jerry cat) ──
   Drawn from artwork instead of canvas paths, like the capybara. One sheet
   (img/tom.png) holds equal cells that all stand on the cell's floor, so
   changing frame never moves his feet: cell 0 is Tom standing still, cells 1-4
   are one loop of the walk — contact, down, passing, up — and cell 5 is Tom
   curled up asleep. The walk cells face RIGHT, which is the direction the room
   treats as unmirrored, so walking left is the room's own flip.
   `pal` is ignored: Tom ships in his own coat.

   The sleeping cell is a real drawing, so sleep and nap use it instead of being
   faked by tilting the body — see OWN_SLEEP_POSE in room-pets.js, which stops
   the lie-down transform from tipping over a Tom who is already lying down. */
/* Cells are packed at the source drawings' own resolution rather than shrunk to
   fit: at the size Tom is drawn on a high-DPI screen, a smaller cell has to be
   scaled back UP and the art goes soft. The walk is four cells, not the twelve
   on full2.jpeg — those twelve are the same four poses drawn three times over
   (their silhouettes overlap 80-93%), so dropping the repeats bought the
   resolution back for less than the sheet cost before. */
const TOM_CELL_W = 183;
const TOM_CELL_H = 246;
const TOM_WALK = 4;        // walk cells, starting at index 1
const TOM_DRAW_H = 1.34;   // Tom's height, as a fraction of the pet size
const TOM_FEET_Y = 0.52;   // where the floor sits below the origin, same fraction
/* The cell each still pose lives in. 'walk' is deliberately absent: it has no
   single cell, being picked from the leg phase. The sleeping drawing arrived at
   its own size and was scaled to the standing cell BY EYE — the pink of an ear
   makes it 0.21 by area, but that ear is drawn face-on asleep and angled awake,
   so the pink flatters the sleeping one and the measurement comes out small. */
const TOM_POSE_CELL = { front: 0, sleep: 5 };
// Walk cells per unit of the room's leg phase, which advances 10 a second —
// so the four-cell loop is a step every 0.57s.
const TOM_STEP_RATE = 0.7;

// Resolved against this file's own URL, because the pages that load it sit at
// different depths. Fetched on first draw rather than at load: the main site
// shows no Tom, so it must not pay for the sheet.
//
// The sheet rides this script's OWN cache-buster (room.html loads it as
// tom.js?v=cbNNN), the arrangement the farm sheets already use. Re-packing the
// sheet keeps its filename, so without this a browser holding the old image
// would pair it with new code — and the two disagreeing about how many cells
// there are draws the sleeping pose out of nothing at all.
const _tomArtSrc = document.currentScript.src;
const _tomArtQ = _tomArtSrc.indexOf('?') >= 0 ? _tomArtSrc.slice(_tomArtSrc.indexOf('?')) : '';
const TOM_SRC = new URL('img/tom.png', _tomArtSrc).href + _tomArtQ;
let _tomSheet = null;
function tomSheet() {
  if (!_tomSheet) { _tomSheet = new Image(); _tomSheet.src = TOM_SRC; }
  return _tomSheet;
}

/* Which pose Tom is in. It lives out here rather than inside the draw call
   because the accessory code has to ask the same question — his head drops most
   of a body between standing and curling up, so a hat can only be placed once
   the pose is known, and both answers have to come from one place. */
function tomPose(moving, action) {
  if (moving) return 'walk';
  if (action === 'sleep' || action === 'nap') return 'sleep';
  return 'front';
}

function drawTomPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = tomSheet();
  if (!art.naturalWidth) return;   // sheet still downloading
  const pose = tomPose(moving, action);
  const col = pose === 'walk'
    ? 1 + Math.floor(lp * TOM_STEP_RATE) % TOM_WALK
    : TOM_POSE_CELL[pose];
  const h = s * TOM_DRAW_H, w = h * TOM_CELL_W / TOM_CELL_H;
  ctx.drawImage(art, col * TOM_CELL_W, 0, TOM_CELL_W, TOM_CELL_H,
    -w / 2, s * TOM_FEET_Y - h, w, h);
}
