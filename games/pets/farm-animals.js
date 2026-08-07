/* ── Farm animals (pig, horse, cow) ──
   Drawn from artwork, the same way the goose is. Each type has its own sheet
   under img/: a horizontal strip of EQUAL cells, every one of them standing on
   the cell's floor, so changing pose never shifts the feet. The cells face
   RIGHT — the direction the farm treats as unmirrored — so walking left is the
   farm's own flip and nothing here has to know about it.

   The three sheets were cut from one drawing at ONE scale, so a horse still
   stands taller than a pig instead of every animal being normalised to the same
   height. That is what the differing DRAW_W values below are.

   `pal` is ignored here exactly as it is for the goose: artwork ships in one
   coat. A rare variant recolours the finished drawing with a CSS filter instead
   — see FARM_VARIANTS in room-base.js and where the farm bakes it in
   room-farm-view.js. */

const FARM_ART = {
  //                          cells   cell width, as a fraction of the pet size
  pig:   { file: 'pig.png',   cells: 2, drawW: 1.322 },
  horse: { file: 'horse.png', cells: 2, drawW: 1.653 },
  cow:   { file: 'cow.png',   cells: 2, drawW: 1.653 },
};

/* Where a cell's ground line sits below the origin, as a fraction of the pet
   size. 0.38 is exactly where drawPetLegs used to end the hooves, and what
   goose.js already uses — so the herd's feet, the ground shadow painted under
   them and the happiness bar above them all stay where they were. */
const FARM_ART_FEET_Y = 0.38;

// Resolved against this file's own URL, because the pages that load it sit at
// different depths (the room, the world, the preview page). Fetched on first
// draw rather than at load: a page with no farm on it must not pay for three
// sheets.
const FARM_ART_BASE = new URL('img/', document.currentScript.src).href;
const _farmSheets = {};
function farmSheet(type) {
  const def = FARM_ART[type];
  if (!def) return null;
  if (!_farmSheets[type]) {
    const im = new Image();
    im.src = FARM_ART_BASE + def.file;
    _farmSheets[type] = im;
  }
  return _farmSheets[type];
}

function drawFarmArtAnimal(ctx, type, s, lp, moving) {
  const def = FARM_ART[type], art = farmSheet(type);
  if (!def || !art || !art.naturalWidth) return;   // sheet still downloading
  /* Which cell. Read off the phase ANGLE, not off elapsed time: the farm bakes
     each pose once and calls this with that pose's fixed angle (see _ANIM_POSES
     in room-farm-view.js), so a rate-times-time reading would land unevenly on
     the cells and the walk would limp. Live callers pass a growing lp; the
     modulo turns it into the same angle, one stride per turn. */
  const TAU = Math.PI * 2;
  const cell = moving
    ? Math.floor((((lp % TAU) + TAU) % TAU) / TAU * def.cells) % def.cells
    : 0;
  const cellW = art.naturalWidth / def.cells, cellH = art.naturalHeight;
  const w = s * def.drawW;
  const h = w * cellH / cellW;
  ctx.drawImage(art, cell * cellW, 0, cellW, cellH,
    -w / 2, s * FARM_ART_FEET_Y - h, w, h);
}

/* Dispatch a farm animal type to its drawer (the goose comes from goose.js).
   `pal` survives only for the goose's own signature; the artwork ignores it. */
function drawFarmAnimal(ctx, type, s, lp, moving, pal) {
  if (type === 'goose') { drawGoosePet(ctx, s, lp, moving, 100, '', 0, 0, pal || null); return; }
  drawFarmArtAnimal(ctx, type, s, lp, moving);
}

/* What a rare coat does to the artwork.
   Artwork ships in one coat, so a variant tints the finished drawing instead of
   swapping a palette into it. The values live HERE, next to the drawing they
   tint, rather than in the game's variant table: farm-animals-preview.html
   renders every coat without loading a line of room code, and two copies of a
   filter string is two copies that drift. room-base.js's FARM_VARIANTS names
   the coats; this says what they look like.
   'rgb' is deliberately absent — its hue sweeps with the clock, so the farm
   applies it live rather than baking it.
   Eyeballed against the artwork, and meant to be nudged. */
const FARM_COAT_FILTER = {
  pig:   { golden: 'hue-rotate(48deg) saturate(1.7) brightness(1.06)' },
  horse: { black:  'saturate(0.28) brightness(0.5)' },
  cow:   { brown:  'sepia(0.9) saturate(1.7) hue-rotate(-14deg)' },
  goose: { golden: 'sepia(1) saturate(3.2) hue-rotate(-12deg) brightness(1.02)' },
};
function farmCoatFilter(type, variant) {
  return (FARM_COAT_FILTER[type] || {})[variant] || '';
}

/* Would drawFarmAnimal actually paint this type right now?
   Every farm animal is drawn from a sheet, and a sheet paints nothing until it
   has downloaded. Live painters don't need to ask — the animal is missing for a
   moment and then appears. A caller that CACHES what the drawer produced does:
   a bake taken during the download stores a blank. Answers false when it can't
   tell, because a wrong "ready" caches that blank for good while a wrong "not
   ready" costs one uncached frame. */
function farmAnimalReady(type) {
  if (type === 'goose') return typeof goosePetReady === 'function' ? goosePetReady() : false;
  const art = farmSheet(type);
  return !!(art && art.naturalWidth);
}

/* ── Farm decor drawers — drawn at the origin, base at y ≈ +0.3s ── */

function _drawDecorLog(ctx, s) {
  // Side body
  ctx.fillStyle = '#7a5230';
  ctx.beginPath();
  ctx.rect(-s * 0.4, s * 0.02, s * 0.7, s * 0.3);
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(-s * 0.4, s * 0.17, s * 0.1, s * 0.15, 0, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  // Bark lines
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = s * 0.02;
  ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.08); ctx.lineTo(s * 0.1, s * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.24); ctx.lineTo(s * 0.18, s * 0.24); ctx.stroke();
  // Cut end with rings
  ctx.fillStyle = '#d8b98a';
  ctx.beginPath(); ctx.ellipse(s * 0.3, s * 0.17, s * 0.1, s * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a8854e'; ctx.lineWidth = s * 0.018;
  ctx.beginPath(); ctx.ellipse(s * 0.3, s * 0.17, s * 0.06, s * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s * 0.3, s * 0.17, s * 0.025, s * 0.04, 0, 0, Math.PI * 2); ctx.stroke();
}

function _drawDecorSunflower(ctx, s) {
  // Stem + leaves
  ctx.strokeStyle = '#4a8a3a'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, s * 0.32); ctx.quadraticCurveTo(s * 0.02, s * 0.05, 0, -s * 0.1); ctx.stroke();
  ctx.fillStyle = '#5aa244';
  ctx.beginPath(); ctx.ellipse(-s * 0.09, s * 0.14, s * 0.1, s * 0.045, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.09, s * 0.06, s * 0.09, s * 0.04, 0.6, 0, Math.PI * 2); ctx.fill();
  // Petals
  ctx.fillStyle = '#f8c834';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * s * 0.17, -s * 0.1 + Math.sin(a) * s * 0.17, s * 0.09, s * 0.04, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // Center with seed dots
  ctx.fillStyle = '#6e4a22';
  ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.045, -s * 0.1 + Math.sin(a) * s * 0.045, s * 0.012, 0, Math.PI * 2); ctx.fill();
  }
}

function _drawDecorHay(ctx, s) {
  // Golden bale
  ctx.fillStyle = '#e0b84e';
  ctx.beginPath();
  ctx.roundRect(-s * 0.38, -s * 0.12, s * 0.76, s * 0.44, s * 0.07);
  ctx.fill();
  // Straw texture
  ctx.strokeStyle = 'rgba(120,85,20,0.35)'; ctx.lineWidth = s * 0.014; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const yy = -s * 0.06 + (i % 3) * s * 0.13, xx = -s * 0.3 + i * s * 0.11;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + s * 0.08, yy + s * 0.02); ctx.stroke();
  }
  // Straps
  ctx.strokeStyle = '#a8762e'; ctx.lineWidth = s * 0.035;
  ctx.beginPath(); ctx.moveTo(-s * 0.16, -s * 0.12); ctx.lineTo(-s * 0.16, s * 0.32); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.16, -s * 0.12); ctx.lineTo(s * 0.16, s * 0.32); ctx.stroke();
  // Top highlight
  ctx.fillStyle = 'rgba(255,240,180,0.4)';
  ctx.beginPath(); ctx.roundRect(-s * 0.34, -s * 0.1, s * 0.68, s * 0.08, s * 0.04); ctx.fill();
}

function _drawDecorPumpkin(ctx, s) {
  // Ribbed pumpkin: middle + side lobes
  ctx.fillStyle = '#d8731e';
  ctx.beginPath(); ctx.ellipse(-s * 0.16, s * 0.12, s * 0.17, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.16, s * 0.12, s * 0.17, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ec8428';
  ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.16, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  // Rib lines
  ctx.strokeStyle = 'rgba(150,60,10,0.3)'; ctx.lineWidth = s * 0.016;
  ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.08, s * 0.21, 0, 0, Math.PI * 2); ctx.stroke();
  // Highlight
  ctx.fillStyle = 'rgba(255,220,160,0.35)';
  ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.02, s * 0.05, s * 0.08, 0.3, 0, Math.PI * 2); ctx.fill();
  // Stem + curl
  ctx.strokeStyle = '#5a7a2e'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -s * 0.08); ctx.quadraticCurveTo(s * 0.02, -s * 0.2, -s * 0.04, -s * 0.24); ctx.stroke();
  ctx.lineWidth = s * 0.02;
  ctx.beginPath(); ctx.moveTo(s * 0.02, -s * 0.18); ctx.quadraticCurveTo(s * 0.14, -s * 0.22, s * 0.12, -s * 0.12); ctx.stroke();
}

function _drawDecorCoop(ctx, s) {
  // Wall
  ctx.fillStyle = '#a8744a';
  ctx.beginPath();
  ctx.rect(-s * 0.3, -s * 0.08, s * 0.6, s * 0.4);
  ctx.fill();
  // Plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = s * 0.014;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(-s * 0.3 + i * s * 0.15, -s * 0.08); ctx.lineTo(-s * 0.3 + i * s * 0.15, s * 0.32); ctx.stroke();
  }
  // Roof
  ctx.fillStyle = '#6e4226';
  ctx.beginPath();
  ctx.moveTo(-s * 0.38, -s * 0.06);
  ctx.lineTo(0, -s * 0.34);
  ctx.lineTo(s * 0.38, -s * 0.06);
  ctx.closePath(); ctx.fill();
  // Round door
  ctx.fillStyle = '#3a2414';
  ctx.beginPath(); ctx.arc(0, s * 0.14, s * 0.11, Math.PI, 0); ctx.rect(-s * 0.11, s * 0.14, s * 0.22, s * 0.18); ctx.fill();
  // Perch plank + ramp
  ctx.fillStyle = '#8a5e36';
  ctx.fillRect(-s * 0.16, s * 0.3, s * 0.32, s * 0.04);
  // Tiny window
  ctx.fillStyle = '#f8e8b0';
  ctx.beginPath(); ctx.arc(s * 0.2, s * 0.02, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6e4226'; ctx.lineWidth = s * 0.014;
  ctx.beginPath(); ctx.arc(s * 0.2, s * 0.02, s * 0.045, 0, Math.PI * 2); ctx.stroke();
}

/* Dispatch a decor type to its drawer. */
function drawFarmDecor(ctx, type, s) {
  switch (type) {
    case 'fd_log':       _drawDecorLog(ctx, s); break;
    case 'fd_sunflower': _drawDecorSunflower(ctx, s); break;
    case 'fd_hay':       _drawDecorHay(ctx, s); break;
    case 'fd_pumpkin':   _drawDecorPumpkin(ctx, s); break;
    case 'fd_coop':      _drawDecorCoop(ctx, s); break;
  }
}
