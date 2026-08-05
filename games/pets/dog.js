/* ── Dog ──
   Same shape as cat.js: artwork rather than canvas paths, one row of equal
   cells in img/dog.png that all stand on the cell's floor, cell 0 the
   front-facing idle, cells 1-8 one loop of the side-view walk, cell 9 asleep,
   every cell facing RIGHT so the room's own flip is the only thing that decides
   which way the dog looks.

   `pal` is ignored — the artwork ships in one coat, which is why room-base.js
   no longer lists a dog palette. The sheet has a real sleeping pose, so sleep
   and nap use it rather than being faked by tilting the body (see
   OWN_SLEEP_POSE in room-pets.js). */
const DOG_CELL_W = 256;
const DOG_CELL_H = 210;
const DOG_FRONT = 0;        // cell index of the idle, facing the viewer
const DOG_WALK_FROM = 1;    // first walk cell
const DOG_WALK_N = 8;       // how many walk cells
const DOG_SLEEP = 9;        // cell index of the sleeping pose
// Standing still uses a walk cell rather than the front idle. The idle is a
// SITTING pose facing the viewer, and a pet that swung side-on to front-on
// every time it paused would also swing its hat off its head — the accessory
// anchors can only be measured for one pose, and it has to be the one worn
// most of the time. This is the cell whose legs sit closest together.
const DOG_STAND = 8;
const DOG_DRAW_W = 1.50;    // drawn width, as a fraction of the pet size
const DOG_FEET_Y = 0.38;    // where the cell's ground line sits below the origin
const DOG_STEP_RATE = 0.72; // walk cells per unit of the room's leg phase

const DOG_SRC = new URL('img/dog.png', document.currentScript.src).href;
let _dogSheet = null;
function dogSheet() {
  if (!_dogSheet) { _dogSheet = new Image(); _dogSheet.src = DOG_SRC; }
  return _dogSheet;
}

function drawDogPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  const art = dogSheet();
  if (!art.naturalWidth) return;   // sheet still downloading

  /* 'portrait' is the shop card asking for a head-on pose, and it is the only
     caller that ever asks. The room's own `view` is NOT it: for a pet that is
     not directional the room reports 'front' every single frame, so reading
     that here would pin the dog to its idle cell and it would never take a
     step. Live pets stay side-on, which is also the pose the accessory anchor
     is measured against. */
  const col = view === 'portrait' ? DOG_FRONT
    : moving ? DOG_WALK_FROM + Math.floor(lp * DOG_STEP_RATE) % DOG_WALK_N
    : (action === 'sleep' || action === 'nap') ? DOG_SLEEP
    : DOG_STAND;

  const w = s * DOG_DRAW_W;
  const h = w * DOG_CELL_H / DOG_CELL_W;
  ctx.drawImage(art, col * DOG_CELL_W, 0, DOG_CELL_W, DOG_CELL_H,
    -w / 2, s * DOG_FEET_Y - h, w, h);
}
