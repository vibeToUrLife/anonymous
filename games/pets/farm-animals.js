/* ── Farm animals (cow, pig, horse) ──
   Same conventions as the room pets: drawn at the origin facing right,
   `s` is the body size, `lp` the leg phase, `moving` toggles the swing.
   The farm goose reuses drawGoosePet from goose.js. */

function drawCowPet(ctx, s, lp, moving) {
  // Tail
  ctx.strokeStyle = '#e8e0d8'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.08);
  ctx.quadraticCurveTo(-s * 0.62, s * 0.05, -s * 0.56, s * 0.22);
  ctx.stroke();
  ctx.fillStyle = '#5a4a3a';
  ctx.beginPath(); ctx.arc(-s * 0.56, s * 0.24, s * 0.05, 0, Math.PI * 2); ctx.fill();

  drawPetLegs(ctx, s, lp, moving, '#e8e0d8');

  // Body — white with black patches
  ctx.fillStyle = '#f5f0ea';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.48, s * 0.30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a352f';
  ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.10, s * 0.16, s * 0.11, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.12, s * 0.12, s * 0.13, s * 0.09, -0.2, 0, Math.PI * 2); ctx.fill();

  // Udder
  ctx.fillStyle = '#f0b8c8';
  ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.26, s * 0.12, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();

  // Head
  const hx = s * 0.42, hy = -s * 0.18;
  ctx.fillStyle = '#f5f0ea';
  ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.18, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  // Ears
  ctx.fillStyle = '#e8e0d8';
  ctx.beginPath(); ctx.ellipse(hx - s * 0.14, hy - s * 0.12, s * 0.07, s * 0.04, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.06, hy - s * 0.15, s * 0.07, s * 0.04, 0.4, 0, Math.PI * 2); ctx.fill();
  // Horns
  ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.08, hy - s * 0.14); ctx.quadraticCurveTo(hx - s * 0.12, hy - s * 0.24, hx - s * 0.04, hy - s * 0.26);
  ctx.moveTo(hx + s * 0.02, hy - s * 0.15); ctx.quadraticCurveTo(hx + s * 0.04, hy - s * 0.26, hx + s * 0.12, hy - s * 0.24);
  ctx.stroke();
  // Muzzle
  ctx.fillStyle = '#f0c8b8';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.08, hy + s * 0.06, s * 0.11, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.05, hy + s * 0.05, s * 0.015, s * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.12, hy + s * 0.05, s * 0.015, s * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  // Eye
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(hx + s * 0.02, hy - s * 0.05, s * 0.025, 0, Math.PI * 2); ctx.fill();
}

function drawPigPet(ctx, s, lp, moving) {
  // Curly tail
  ctx.strokeStyle = '#f0a0b0'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.44, -s * 0.04);
  ctx.bezierCurveTo(-s * 0.56, -s * 0.12, -s * 0.62, s * 0.02, -s * 0.52, s * 0.02);
  ctx.stroke();

  drawPetLegs(ctx, s, lp, moving, '#f0a0b0');

  // Round body
  ctx.fillStyle = '#f8b8c4';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.46, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  // Belly tint
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.30, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();

  // Head
  const hx = s * 0.36, hy = -s * 0.10;
  ctx.fillStyle = '#f8b8c4';
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.20, 0, Math.PI * 2); ctx.fill();
  // Ears — floppy triangles
  ctx.fillStyle = '#f0a0b0';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.14, hy - s * 0.14); ctx.lineTo(hx - s * 0.20, hy - s * 0.28); ctx.lineTo(hx - s * 0.02, hy - s * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + s * 0.04, hy - s * 0.17); ctx.lineTo(hx + s * 0.12, hy - s * 0.30); ctx.lineTo(hx + s * 0.16, hy - s * 0.12);
  ctx.closePath(); ctx.fill();
  // Snout
  ctx.fillStyle = '#f0a0b0';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.16, hy + s * 0.02, s * 0.09, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.13, hy + s * 0.02, s * 0.015, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + s * 0.19, hy + s * 0.02, s * 0.015, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(hx + s * 0.02, hy - s * 0.05, s * 0.025, 0, Math.PI * 2); ctx.fill();
}

function drawHorsePet(ctx, s, lp, moving) {
  // Tail — flowing
  ctx.strokeStyle = '#5a4030'; ctx.lineWidth = s * 0.09; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.10);
  ctx.quadraticCurveTo(-s * 0.66, s * 0.02, -s * 0.60, s * 0.26);
  ctx.stroke();

  drawPetLegs(ctx, s, lp, moving, '#9a6a44');

  // Body
  ctx.fillStyle = '#b07a50';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.48, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();

  // Neck up to the head
  ctx.fillStyle = '#b07a50';
  ctx.beginPath();
  ctx.moveTo(s * 0.22, -s * 0.12);
  ctx.lineTo(s * 0.46, -s * 0.52);
  ctx.lineTo(s * 0.62, -s * 0.44);
  ctx.lineTo(s * 0.40, -s * 0.02);
  ctx.closePath(); ctx.fill();

  // Mane along the neck
  ctx.strokeStyle = '#5a4030'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.24, -s * 0.14);
  ctx.quadraticCurveTo(s * 0.36, -s * 0.36, s * 0.44, -s * 0.54);
  ctx.stroke();

  // Head
  const hx = s * 0.56, hy = -s * 0.52;
  ctx.fillStyle = '#b07a50';
  ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.17, s * 0.11, 0.35, 0, Math.PI * 2); ctx.fill();
  // Muzzle
  ctx.fillStyle = '#8a5a38';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.13, hy + s * 0.04, s * 0.08, s * 0.06, 0.35, 0, Math.PI * 2); ctx.fill();
  // Ear
  ctx.fillStyle = '#b07a50';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.08, hy - s * 0.08); ctx.lineTo(hx - s * 0.04, hy - s * 0.22); ctx.lineTo(hx + s * 0.04, hy - s * 0.10);
  ctx.closePath(); ctx.fill();
  // Forelock
  ctx.strokeStyle = '#5a4030'; ctx.lineWidth = s * 0.05;
  ctx.beginPath(); ctx.arc(hx - s * 0.02, hy - s * 0.10, s * 0.08, Math.PI * 0.9, Math.PI * 1.7); ctx.stroke();
  // Eye + nostril
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(hx + s * 0.02, hy - s * 0.02, s * 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(hx + s * 0.17, hy + s * 0.05, s * 0.015, 0, Math.PI * 2); ctx.fill();
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
