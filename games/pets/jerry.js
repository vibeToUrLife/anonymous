/* ── Jerry (Tom & Jerry mouse) ──
   Drawn from artwork instead of canvas paths, like Tom. One sheet
   (img/jerry.png) holds equal cells that all stand on the cell's floor, so
   changing frame never moves his feet: cell 0 is Jerry standing and facing the
   viewer, cells 1 onwards are one loop of the walk — contact, down, passing,
   up. The walk cells face RIGHT, which is the direction the room treats as
   unmirrored, so walking left is the room's own flip.
   `pal` and `view` are both ignored: Jerry ships in his own coat, and the art
   only knows two states, standing and walking. */
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
// Walk cells per unit of the room's leg phase, which advances 10 a second — so
// the four-cell loop is a full stride every 0.63s, the cadence his drawn legs
// used to swing at.
const JERRY_STEP_RATE = 0.64;

// Resolved against this file's own URL, because the pages that load it sit at
// different depths. Fetched on first draw rather than at load: the main site
// shows no Jerry, so it must not pay for the sheet.
const JERRY_SRC = new URL('img/jerry.png', document.currentScript.src).href;
let _jerrySheet = null;
function jerrySheet() {
  if (!_jerrySheet) { _jerrySheet = new Image(); _jerrySheet.src = JERRY_SRC; }
  return _jerrySheet;
}

function drawJerryPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = jerrySheet();
  if (!art.naturalWidth) return;   // sheet still downloading
  const col = moving ? 1 + Math.floor(lp * JERRY_STEP_RATE) % JERRY_WALK : 0;
  const h = s * JERRY_DRAW_H, w = h * JERRY_CELL_W / JERRY_CELL_H;
  ctx.drawImage(art, col * JERRY_CELL_W, 0, JERRY_CELL_W, JERRY_CELL_H,
    -w / 2, s * JERRY_FEET_Y - h, w, h);
}
