/* ── Farm animals (cow, pig, horse) + farm decor ──
   Same conventions as the room pets: drawn at the origin facing right,
   `s` is the body size, `lp` the leg phase, `moving` toggles the swing.
   Chibi proportions follow cat.js (big head ~0.28s at x 0.35s, eyes with
   pupil + highlight, blush). The farm goose reuses drawGoosePet. */

// Cute round eye with pupil + sparkle highlight.
function _farmEye(ctx, s, x, y) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.045, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.ellipse(x + s * 0.008, y, s * 0.026, s * 0.034, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + s * 0.018, y - s * 0.015, s * 0.012, 0, Math.PI * 2); ctx.fill();
}

function _farmBlush(ctx, s, x, y) {
  ctx.fillStyle = 'rgba(255,130,150,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.05, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
}

function drawCowPet(ctx, s, lp, moving) {
  // Tail with tuft
  ctx.strokeStyle = '#f5f0ea'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.05);
  ctx.bezierCurveTo(-s * 0.62, 0, -s * 0.64, s * 0.12, -s * 0.58, s * 0.24);
  ctx.stroke();
  ctx.fillStyle = '#4a4038';
  ctx.beginPath(); ctx.ellipse(-s * 0.58, s * 0.27, s * 0.05, s * 0.07, 0.3, 0, Math.PI * 2); ctx.fill();

  drawPetLegs(ctx, s, lp, moving, '#ece5dc');

  // Body — soft cream with patches
  ctx.fillStyle = '#faf6f0';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a4038';
  ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.12, s * 0.17, s * 0.12, 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.16, s * 0.13, s * 0.09, -0.25, 0, Math.PI * 2); ctx.fill();
  // Belly shading
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.22, s * 0.32, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // Udder peeking
  ctx.fillStyle = '#f8c8d4';
  ctx.beginPath(); ctx.ellipse(-s * 0.1, s * 0.28, s * 0.1, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();

  // Head — big and round
  const hx = s * 0.35, hy = -s * 0.2;
  // Ears out the sides (behind head)
  ctx.fillStyle = '#ece5dc';
  ctx.beginPath(); ctx.ellipse(hx - s * 0.27, hy - s * 0.06, s * 0.1, s * 0.055, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.27, hy - s * 0.06, s * 0.1, s * 0.055, 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f8c8d4';
  ctx.beginPath(); ctx.ellipse(hx - s * 0.27, hy - s * 0.06, s * 0.055, s * 0.03, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.27, hy - s * 0.06, s * 0.055, s * 0.03, 0.35, 0, Math.PI * 2); ctx.fill();
  // Horns
  ctx.fillStyle = '#e8d4a8';
  ctx.beginPath(); ctx.ellipse(hx - s * 0.16, hy - s * 0.26, s * 0.05, s * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.16, hy - s * 0.26, s * 0.05, s * 0.08, 0.5, 0, Math.PI * 2); ctx.fill();
  // Face
  ctx.fillStyle = '#faf6f0';
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.28, 0, Math.PI * 2); ctx.fill();
  // Patch over one eye
  ctx.fillStyle = '#4a4038';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.14, hy - s * 0.1, s * 0.12, s * 0.1, 0.2, 0, Math.PI * 2); ctx.fill();
  // Big pink muzzle
  ctx.fillStyle = '#f8c8d4';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.02, hy + s * 0.13, s * 0.17, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d88a9e';
  ctx.beginPath(); ctx.ellipse(hx - s * 0.05, hy + s * 0.12, s * 0.02, s * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.09, hy + s * 0.12, s * 0.02, s * 0.028, 0, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#c97a8e'; ctx.lineWidth = s * 0.014; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hx + s * 0.02, hy + s * 0.14, s * 0.05, 0.3, Math.PI - 0.3); ctx.stroke();
  // Eyes (one on the patch)
  _farmEye(ctx, s, hx - s * 0.1, hy - s * 0.06);
  _farmEye(ctx, s, hx + s * 0.14, hy - s * 0.06);
  _farmBlush(ctx, s, hx - s * 0.18, hy + s * 0.06);
  // Forelock tuft
  ctx.fillStyle = '#ece5dc';
  ctx.beginPath(); ctx.ellipse(hx, hy - s * 0.26, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
}

function drawPigPet(ctx, s, lp, moving) {
  // Proper spiral curly tail
  ctx.strokeStyle = '#eda0b4'; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.02);
  ctx.bezierCurveTo(-s * 0.58, -s * 0.12, -s * 0.68, -s * 0.02, -s * 0.58, s * 0.04);
  ctx.bezierCurveTo(-s * 0.52, s * 0.08, -s * 0.52, -s * 0.02, -s * 0.58, -s * 0.03);
  ctx.stroke();

  drawPetLegs(ctx, s, lp, moving, '#eda0b4');

  // Round body
  ctx.fillStyle = '#f9bcc9';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.48, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  // Belly highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-s * 0.02, s * 0.14, s * 0.28, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  // Back shading
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  ctx.beginPath(); ctx.ellipse(-s * 0.08, -s * 0.16, s * 0.3, s * 0.12, 0.1, 0, Math.PI * 2); ctx.fill();

  // Head — big and round
  const hx = s * 0.33, hy = -s * 0.18;
  // Floppy ears (behind head)
  ctx.fillStyle = '#eda0b4';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.2, hy - s * 0.14);
  ctx.quadraticCurveTo(hx - s * 0.3, hy - s * 0.38, hx - s * 0.04, hy - s * 0.26);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + s * 0.06, hy - s * 0.25);
  ctx.quadraticCurveTo(hx + s * 0.18, hy - s * 0.42, hx + s * 0.26, hy - s * 0.16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8839c';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.16, hy - s * 0.16);
  ctx.quadraticCurveTo(hx - s * 0.23, hy - s * 0.32, hx - s * 0.07, hy - s * 0.24);
  ctx.closePath(); ctx.fill();
  // Face
  ctx.fillStyle = '#f9bcc9';
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.27, 0, Math.PI * 2); ctx.fill();
  // Snout — big oval with nostrils
  ctx.fillStyle = '#eda0b4';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.1, hy + s * 0.08, s * 0.13, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = s * 0.012;
  ctx.beginPath(); ctx.ellipse(hx + s * 0.1, hy + s * 0.08, s * 0.13, s * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#c96a84';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.05, hy + s * 0.08, s * 0.022, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.15, hy + s * 0.08, s * 0.022, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes + blush
  _farmEye(ctx, s, hx - s * 0.08, hy - s * 0.07);
  _farmEye(ctx, s, hx + s * 0.16, hy - s * 0.07);
  _farmBlush(ctx, s, hx - s * 0.17, hy + s * 0.05);
  _farmBlush(ctx, s, hx + s * 0.24, hy + s * 0.04);
  // Little smile under the snout
  ctx.strokeStyle = '#c96a84'; ctx.lineWidth = s * 0.014; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hx + s * 0.1, hy + s * 0.17, s * 0.04, 0.4, Math.PI - 0.4); ctx.stroke();
}

function drawHorsePet(ctx, s, lp, moving) {
  // Proper horse proportions: one continuous body+neck+head silhouette (so no
  // part can look detached), then legs, mane, tail and face layered on top.
  const coat = '#b5814f', coatDark = '#946539', light = '#e8cda6', mane = '#523521', hoof = '#3a2a1a';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const sway = moving ? Math.sin(lp) * s * 0.05 : 0;

  // ── Tail (behind everything) ──
  ctx.strokeStyle = mane; ctx.lineWidth = s * 0.11;
  ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.18); ctx.quadraticCurveTo(-s * 0.66, s * 0.06 + sway, -s * 0.6, s * 0.42); ctx.stroke();
  ctx.lineWidth = s * 0.06;
  ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.16); ctx.quadraticCurveTo(-s * 0.56, s * 0.08 - sway, -s * 0.5, s * 0.40); ctx.stroke();

  // ── Legs (long; drawn before the body so the body covers their tops).
  //    Kept well inside the barrel's x-range so none pokes past the body. ──
  const lw = s * 0.085, legTop = s * 0.02, legBot = s * 0.5;
  const sw = moving ? Math.sin(lp) * s * 0.035 : 0;
  const legX = [s * 0.14 + sw, s * 0.0 - sw, -s * 0.26 - sw, -s * 0.38 + sw];
  ctx.fillStyle = coatDark;
  for (const x of legX) ctx.fillRect(x, legTop, lw, legBot - legTop);
  ctx.fillStyle = hoof;
  for (const x of legX) ctx.fillRect(x - s * 0.005, legBot - s * 0.05, lw + s * 0.01, s * 0.06);

  // ── One continuous silhouette: rump → back → neck crest → poll → face →
  //    muzzle → throat → chest → belly → back to rump ──
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.18);                                   // rump top
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.34, s * 0.06, -s * 0.30);     // back to withers
  ctx.quadraticCurveTo(s * 0.20, -s * 0.52, s * 0.30, -s * 0.64);     // up the neck crest
  ctx.quadraticCurveTo(s * 0.40, -s * 0.70, s * 0.46, -s * 0.58);     // over the poll
  ctx.quadraticCurveTo(s * 0.56, -s * 0.46, s * 0.56, -s * 0.36);     // down the face to the muzzle
  ctx.quadraticCurveTo(s * 0.56, -s * 0.28, s * 0.46, -s * 0.30);     // muzzle underside
  ctx.quadraticCurveTo(s * 0.36, -s * 0.32, s * 0.32, -s * 0.16);     // throat / jaw
  ctx.quadraticCurveTo(s * 0.36, -s * 0.02, s * 0.36, s * 0.16);      // fuller chest (covers front legs)
  ctx.quadraticCurveTo(s * 0.30, s * 0.26, s * 0.0, s * 0.26);        // belly
  ctx.quadraticCurveTo(-s * 0.34, s * 0.26, -s * 0.46, s * 0.10);     // rear belly to haunch
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.04, -s * 0.46, -s * 0.18);    // haunch up to rump
  ctx.closePath(); ctx.fill();

  // Muzzle (lighter) at the head's lower-right tip
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(s * 0.5, -s * 0.36, s * 0.08, s * 0.075, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = coatDark; // nostril
  ctx.beginPath(); ctx.ellipse(s * 0.53, -s * 0.39, s * 0.018, s * 0.024, -0.3, 0, Math.PI * 2); ctx.fill();

  // Ears (pointed, at the poll)
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(s * 0.30, -s * 0.6); ctx.lineTo(s * 0.30, -s * 0.78); ctx.lineTo(s * 0.40, -s * 0.62); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.40, -s * 0.62); ctx.lineTo(s * 0.50, -s * 0.74); ctx.lineTo(s * 0.46, -s * 0.56); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a5436';
  ctx.beginPath(); ctx.moveTo(s * 0.33, -s * 0.62); ctx.lineTo(s * 0.33, -s * 0.73); ctx.lineTo(s * 0.39, -s * 0.63); ctx.closePath(); ctx.fill();

  // Mane — thick dark band along the back of the neck (poll → withers)
  ctx.strokeStyle = mane; ctx.lineWidth = s * 0.12;
  ctx.beginPath(); ctx.moveTo(s * 0.36, -s * 0.64); ctx.quadraticCurveTo(s * 0.16, -s * 0.5, s * 0.04, -s * 0.28); ctx.stroke();
  // Forelock
  ctx.lineWidth = s * 0.045;
  ctx.beginPath(); ctx.moveTo(s * 0.40, -s * 0.62); ctx.lineTo(s * 0.46, -s * 0.5); ctx.stroke();

  // Eye + highlight (on the side of the face)
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.46, s * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(s * 0.435, -s * 0.475, s * 0.014, 0, Math.PI * 2); ctx.fill();
}

/* Dispatch a farm animal type to its drawer (goose comes from goose.js). */
function drawFarmAnimal(ctx, type, s, lp, moving) {
  switch (type) {
    case 'cow':   drawCowPet(ctx, s, lp, moving); break;
    case 'pig':   drawPigPet(ctx, s, lp, moving); break;
    case 'horse': drawHorsePet(ctx, s, lp, moving); break;
    case 'goose': drawGoosePet(ctx, s, lp, moving, 100, '', 0, 0, null); break;
  }
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
