/* ── Fox ── */

function drawFoxPet(ctx, s, lp, moving, hunger, action, ap, t, pal) {
  pal = pal || {};
  const sleeping   = action === 'sleep' || action === 'nap';
  const bodyColor  = pal.body  || '#e86f2c';
  const whiteColor = pal.belly || '#fff3e0';
  const earColor   = pal.ear   || '#444';
  const legColor   = pal.leg   || '#5a2800';
  // BIG bushy tail behind body
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(-s*0.48, -s*0.12, s*0.18, s*0.3, -0.5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = whiteColor;
  ctx.beginPath(); ctx.ellipse(-s*0.56, -s*0.28, s*0.08, s*0.13, -0.5, 0, Math.PI*2); ctx.fill();
  // Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(0, 0, s*0.5, s*0.32, 0, 0, Math.PI*2); ctx.fill();
  // White belly
  ctx.fillStyle = whiteColor;
  ctx.beginPath(); ctx.ellipse(s*0.05, s*0.08, s*0.3, s*0.18, 0, 0, Math.PI*2); ctx.fill();
  // Head
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.arc(s*0.38, -s*0.14, s*0.27, 0, Math.PI*2); ctx.fill();
  // White face V-marking
  ctx.fillStyle = whiteColor;
  ctx.beginPath();
  ctx.moveTo(s*0.3, -s*0.35); ctx.lineTo(s*0.38, -s*0.02); ctx.lineTo(s*0.46, -s*0.35);
  ctx.quadraticCurveTo(s*0.38, -s*0.28, s*0.3, -s*0.35); ctx.fill();
  // White snout
  ctx.beginPath(); ctx.ellipse(s*0.54, -s*0.04, s*0.13, s*0.1, 0, 0, Math.PI*2); ctx.fill();
  // Tall pointy ears
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.moveTo(s*0.2,-s*0.32); ctx.lineTo(s*0.26,-s*0.64); ctx.lineTo(s*0.38,-s*0.34); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s*0.38,-s*0.34); ctx.lineTo(s*0.5,-s*0.62); ctx.lineTo(s*0.56,-s*0.3); ctx.fill();
  // Inner ears dark
  ctx.fillStyle = earColor;
  ctx.beginPath(); ctx.moveTo(s*0.24,-s*0.34); ctx.lineTo(s*0.28,-s*0.54); ctx.lineTo(s*0.34,-s*0.34); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s*0.42,-s*0.34); ctx.lineTo(s*0.48,-s*0.52); ctx.lineTo(s*0.52,-s*0.31); ctx.fill();
  // Eyes
  if (sleeping) {
    drawSleepEyes(ctx, s, s*0.3, -s*0.18, s*0.46, -s*0.18, s*0.035);
  } else {
    ctx.fillStyle = '#c90';
    ctx.save();
    ctx.beginPath(); ctx.ellipse(s*0.3,  -s*0.18, s*0.035, s*0.025, -0.15, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s*0.46, -s*0.18, s*0.035, s*0.025,  0.15, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(s*0.3,  -s*0.18, s*0.015, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.46, -s*0.18, s*0.015, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s*0.305, -s*0.19, s*0.006, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.465, -s*0.19, s*0.006, 0, Math.PI*2); ctx.fill();
  }
  // Black nose
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.ellipse(s*0.58, -s*0.04, s*0.03, s*0.022, 0, 0, Math.PI*2); ctx.fill();
  // Sly smile
  ctx.strokeStyle = '#a04010'; ctx.lineWidth = s * 0.008;
  ctx.beginPath(); ctx.arc(s*0.52, -s*0.01, s*0.04, 0.1, Math.PI - 0.1); ctx.stroke();
  // Legs
  if (!sleeping) drawPetLegs(ctx, s, lp, moving, legColor);
}
