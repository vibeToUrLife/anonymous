/* ── Cat ──
   Drawn from artwork rather than canvas paths, like Tom and the capybara. One
   sheet (img/cat.png) holds equal cells that all stand on the cell's floor, so
   changing frame never shifts the paws: cell 0 is the front-facing idle, cells
   1-8 are one loop of the walk seen from the side, cell 9 is asleep. Every cell
   faces RIGHT — the direction the room treats as unmirrored — so walking left
   is the room's own flip and nothing here has to know about it.

   `pal` is ignored: the artwork ships in one coat, which is why room-base.js no
   longer lists a cat palette and the status bar stops offering colour dots.

   Unlike Tom, this sheet has a real sleeping pose, so sleep and nap use it
   instead of being faked by tilting the body — see OWN_SLEEP_POSE in
   room-pets.js, which stops the lie-down transform from tipping over a cat that
   is already lying down. */
const CAT_CELL_W = 262;
const CAT_CELL_H = 202;
const CAT_FRONT = 0;        // cell index of the idle, facing the viewer
const CAT_WALK_FROM = 1;    // first walk cell
const CAT_WALK_N = 8;       // how many walk cells
const CAT_SLEEP = 9;        // cell index of the sleeping pose
// Standing still uses a walk cell rather than the front idle. The idle is a
// SITTING pose facing the viewer, and a pet that swung side-on to front-on
// every time it paused would also swing its hat off its head — the accessory
// anchors can only be measured for one pose, and it has to be the one worn
// most of the time. This is the cell whose legs sit closest together.
const CAT_STAND = 7;
const CAT_DRAW_W = 1.50;    // drawn width, as a fraction of the pet size
const CAT_FEET_Y = 0.38;    // where the cell's ground line sits below the origin
// Walk cells per unit of the room's leg phase, which advances 10 a second — so
// the eight-cell loop is a full stride every 1.1s.
const CAT_STEP_RATE = 0.72;

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

  /* 'portrait' is the shop card asking for a head-on pose, and it is the only
     caller that ever asks. The room's own `view` is NOT it: for a pet that is
     not directional the room reports 'front' every single frame, so reading
     that here would pin the cat to its idle cell and it would never take a
     step. Live pets stay side-on, which is also the pose the accessory anchor
     is measured against. */
  const col = view === 'portrait' ? CAT_FRONT
    : moving ? CAT_WALK_FROM + Math.floor(lp * CAT_STEP_RATE) % CAT_WALK_N
    : (action === 'sleep' || action === 'nap') ? CAT_SLEEP
    : CAT_STAND;

  const w = s * CAT_DRAW_W;
  const h = w * CAT_CELL_H / CAT_CELL_W;
  ctx.drawImage(art, col * CAT_CELL_W, 0, CAT_CELL_W, CAT_CELL_H,
    -w / 2, s * CAT_FEET_Y - h, w, h);
}
