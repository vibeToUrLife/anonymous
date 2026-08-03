/* ── Capybara ──
   The only pet drawn from artwork instead of canvas paths. Its poses come from
   a sprite sheet (img/capybara.png): one row of equal cells, every pose facing
   RIGHT and sitting on the cell's floor, so switching pose never shifts the
   feet. Everything else — walking, tricks, being thrown — still runs through
   the same transforms the procedural pets use. */

// Cell order in the sheet. Position here IS the frame index, so this array is
// the single source of truth for the layout.
const CAPY_FRAMES = ['side', 'walk', 'sit', 'sleepy', 'front'];
const CAPY_CELL_W = 149;
const CAPY_CELL_H = 126;
const CAPY_DRAW_W = 1.15;   // drawn sprite width, as a fraction of the pet size
const CAPY_FEET_Y = 0.40;   // where the sprite's ground line sits, same fraction
const CAPY_STEP_RATE = 1.4; // walk cycle speed against the room's leg phase
const CAPY_SOAK_CUT = 0.45; // fraction of the front cell that stays above water

/* Pose per action. ONLY actions where the capybara genuinely lies down or sits
   get their own pose — everything else keeps the standing pose and lets its
   transform do the work. The sheet's expression poses were tried here and had
   to be dropped: they are flat lying-down drawings, so a standing pet that
   yawned or landed dizzy suddenly looked like a head with no body.
   `sleep` only ever arrives from the main site's walking pet; the room never
   picks it (see PET_ACTIONS.capybara). */
const CAPY_ACTION_FRAME = {
  sleep: 'sleepy',
  sit: 'sit',
};

// Resolved against this file's own URL, because the three pages that load it
// (room, world, index) all sit at different depths.
const CAPY_SHEET = Object.assign(new Image(), {
  src: new URL('img/capybara.png', document.currentScript.src).href
});

// Draws a capybara. Takes the shared pet-drawer signature; `pal` is ignored
// because the artwork ships in one coat. `view` is 'front' only while the pet
// is selected — the front artwork is a SITTING pose, so it must never be used
// for travel, only for a capybara that has stopped and turned to face you.
function drawCapybaraPet(ctx, s, lp, moving, hunger, action, ap, t, pal, view) {
  if (!CAPY_SHEET.naturalWidth) return;   // sheet still loading
  const w = s * CAPY_DRAW_W;
  const h = w * CAPY_CELL_H / CAPY_CELL_W;

  /* Soaking is framed differently from every other pose: the front-sit cell is
     cropped to its top slice so only the head clears the water, and it is the
     CUT LINE — not a foot line — that sits on the pet's own y, because the room
     parks a soaking pet on the spring's water surface. */
  if (action === 'soak') {
    const sx = CAPY_FRAMES.indexOf('front') * CAPY_CELL_W;
    ctx.drawImage(
      CAPY_SHEET, sx, 0, CAPY_CELL_W, CAPY_CELL_H * CAPY_SOAK_CUT,
      -w / 2, -h * CAPY_SOAK_CUT, w, h * CAPY_SOAK_CUT
    );
    return;
  }

  // Walking alternates two poses; otherwise the action picks the pose.
  const name = view === 'front' ? 'front'
    : moving ? (Math.sin(lp * CAPY_STEP_RATE) > 0 ? 'walk' : 'side')
    : (CAPY_ACTION_FRAME[action] || 'side');
  const col = CAPY_FRAMES.indexOf(name);
  ctx.drawImage(
    CAPY_SHEET, col * CAPY_CELL_W, 0, CAPY_CELL_W, CAPY_CELL_H,
    -w / 2, s * CAPY_FEET_Y - h, w, h
  );
}
