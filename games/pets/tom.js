/* ── Tom (Tom & Jerry cat) ──
   Drawn from artwork instead of canvas paths, like the capybara. One sheet
   (img/tom.png) holds equal cells that all stand on the cell's floor, so
   changing frame never moves his feet: cell 0 is Tom standing still, cells 1
   onwards are one loop of the walk — contact, down, passing, up. The walk cells
   face RIGHT, which is the direction the room treats as unmirrored, so walking
   left is the room's own flip.
   `pal` and `view` are both ignored: Tom ships in his own coat, and the art
   only knows two states, standing and walking. */
const TOM_CELL_W = 97;
const TOM_CELL_H = 130;
const TOM_WALK = 12;       // walk cells, starting at index 1
const TOM_DRAW_H = 1.34;   // Tom's height, as a fraction of the pet size
const TOM_FEET_Y = 0.52;   // where the floor sits below the origin, same fraction
// Walk cells per unit of the room's leg phase, which advances 10 a second. The
// loop reads as four poses, so this is roughly a step every 0.57s.
const TOM_STEP_RATE = 0.7;

// Resolved against this file's own URL, because the pages that load it sit at
// different depths. Fetched on first draw rather than at load: the main site
// shows no Tom, so it must not pay for the sheet.
const TOM_SRC = new URL('img/tom.png', document.currentScript.src).href;
let _tomSheet = null;
function tomSheet() {
  if (!_tomSheet) { _tomSheet = new Image(); _tomSheet.src = TOM_SRC; }
  return _tomSheet;
}

function drawTomPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = tomSheet();
  if (!art.naturalWidth) return;   // sheet still downloading
  const col = moving ? 1 + Math.floor(lp * TOM_STEP_RATE) % TOM_WALK : 0;
  const h = s * TOM_DRAW_H, w = h * TOM_CELL_W / TOM_CELL_H;
  ctx.drawImage(art, col * TOM_CELL_W, 0, TOM_CELL_W, TOM_CELL_H,
    -w / 2, s * TOM_FEET_Y - h, w, h);
}
