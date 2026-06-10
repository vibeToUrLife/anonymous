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
  // Flowing tail — layered strands
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6e4a2e'; ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.08);
  ctx.bezierCurveTo(-s * 0.62, 0, -s * 0.64, s * 0.16, -s * 0.56, s * 0.3);
  ctx.stroke();
  ctx.strokeStyle = '#8a5e3a'; ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.06);
  ctx.bezierCurveTo(-s * 0.58, s * 0.04, -s * 0.6, s * 0.16, -s * 0.52, s * 0.26);
  ctx.stroke();

  drawPetLegs(ctx, s, lp, moving, '#c08a58');

  // Body
  ctx.fillStyle = '#cd9663';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  // Belly highlight + back shading
  ctx.fillStyle = 'rgba(255,245,225,0.3)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.14, s * 0.3, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.16, s * 0.3, s * 0.11, 0.1, 0, Math.PI * 2); ctx.fill();

  // Head — chibi, slightly long muzzle
  const hx = s * 0.35, hy = -s * 0.22;
  // Ears
  ctx.fillStyle = '#cd9663';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.16, hy - s * 0.2); ctx.quadraticCurveTo(hx - s * 0.16, hy - s * 0.42, hx - s * 0.04, hy - s * 0.24);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + s * 0.06, hy - s * 0.24); ctx.quadraticCurveTo(hx + s * 0.14, hy - s * 0.44, hx + s * 0.2, hy - s * 0.2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a87648';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.13, hy - s * 0.22); ctx.quadraticCurveTo(hx - s * 0.13, hy - s * 0.34, hx - s * 0.06, hy - s * 0.24);
  ctx.closePath(); ctx.fill();
  // Face
  ctx.fillStyle = '#cd9663';
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.26, 0, Math.PI * 2); ctx.fill();
  // Muzzle — soft cream, extends right
  ctx.fillStyle = '#e8cba8';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.16, hy + s * 0.1, s * 0.14, s * 0.1, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a87648';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.22, hy + s * 0.08, s * 0.018, s * 0.026, 0, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#a87648'; ctx.lineWidth = s * 0.014; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hx + s * 0.15, hy + s * 0.14, s * 0.05, 0.5, Math.PI - 0.7); ctx.stroke();
  // Mane — rounded bumps over the crown and down the neck
  ctx.fillStyle = '#6e4a2e';
  ctx.beginPath(); ctx.ellipse(hx - s * 0.06, hy - s * 0.26, s * 0.12, s * 0.07, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - s * 0.2, hy - s * 0.14, s * 0.09, s * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - s * 0.28, hy + s * 0.04, s * 0.08, s * 0.07, -0.9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - s * 0.3, hy + s * 0.22, s * 0.07, s * 0.07, -1.1, 0, Math.PI * 2); ctx.fill();
  // Forelock falling between the ears
  ctx.fillStyle = '#8a5e3a';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.02, hy - s * 0.22, s * 0.07, s * 0.05, 0.3, 0, Math.PI * 2); ctx.fill();
  // Eyes + blush
  _farmEye(ctx, s, hx - s * 0.04, hy - s * 0.04);
  _farmEye(ctx, s, hx + s * 0.18, hy - s * 0.04);
  _farmBlush(ctx, s, hx - s * 0.14, hy + s * 0.08);
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
