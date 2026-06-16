/* ── Panda ── */

function drawPandaPet(ctx, s, lp, moving, hunger, action, ap, t, pal) {
  const sleeping = action === 'sleep' || action === 'nap';
  pal = pal || { body: '#fff', patch: '#333' };
  const body = pal.body, patch = pal.patch;   // fur + markings (color choices)
  // Bamboo behind body (when not too hungry)
  if (hunger > 30) {
    ctx.strokeStyle = '#5a8a3c'; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s*0.55, s*0.3); ctx.lineTo(-s*0.35, -s*0.6); ctx.stroke();
    ctx.strokeStyle = '#4a7a2c'; ctx.lineWidth = s * 0.008;
    ctx.beginPath(); ctx.moveTo(-s*0.5, s*0.05); ctx.lineTo(-s*0.4, s*0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s*0.45, -s*0.2); ctx.lineTo(-s*0.35, -s*0.2); ctx.stroke();
    ctx.fillStyle = '#6aaa4c';
    ctx.beginPath(); ctx.ellipse(-s*0.3, -s*0.55, s*0.06, s*0.02, -0.8, 0, Math.PI*2); ctx.fill();
  }
  // Body (fur)
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, s*0.45, s*0.38, 0, 0, Math.PI*2); ctx.fill();
  // Shoulders/arms (markings)
  ctx.fillStyle = patch;
  ctx.beginPath(); ctx.ellipse(-s*0.3,  -s*0.05, s*0.16, s*0.22, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( s*0.3,  -s*0.05, s*0.16, s*0.22,  0.3, 0, Math.PI*2); ctx.fill();
  // Head
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(s*0.05, -s*0.3, s*0.3, 0, Math.PI*2); ctx.fill();
  // Round ears (markings)
  ctx.fillStyle = patch;
  ctx.beginPath(); ctx.arc(-s*0.16, -s*0.54, s*0.1, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( s*0.26, -s*0.54, s*0.1, 0, Math.PI*2); ctx.fill();
  // BIG tilted eye patches
  ctx.fillStyle = patch;
  ctx.save(); ctx.translate(-s*0.07, -s*0.32); ctx.rotate(-0.25);
  ctx.beginPath(); ctx.ellipse(0, 0, s*0.1, s*0.075, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(s*0.17, -s*0.32); ctx.rotate(0.25);
  ctx.beginPath(); ctx.ellipse(0, 0, s*0.1, s*0.075, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
  // Eyes
  if (sleeping) {
    drawSleepEyes(ctx, s, -s*0.07, -s*0.32, s*0.17, -s*0.32, s*0.03);
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s*0.07, -s*0.32, s*0.03, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( s*0.17, -s*0.32, s*0.03, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-s*0.07, -s*0.32, s*0.018, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( s*0.17, -s*0.32, s*0.018, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s*0.065, -s*0.33, s*0.007, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( s*0.175, -s*0.33, s*0.007, 0, Math.PI*2); ctx.fill();
  }
  // Oval nose (markings)
  ctx.fillStyle = patch;
  ctx.beginPath(); ctx.ellipse(s*0.05, -s*0.22, s*0.03, s*0.02, 0, 0, Math.PI*2); ctx.fill();
  // Mouth
  ctx.strokeStyle = '#555'; ctx.lineWidth = s * 0.008;
  ctx.beginPath(); ctx.moveTo(s*0.05,-s*0.2); ctx.lineTo(s*0.05,-s*0.17); ctx.stroke();
  ctx.beginPath(); ctx.arc(s*0.02, -s*0.17, s*0.03, 0, Math.PI*0.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(s*0.08, -s*0.17, s*0.03, Math.PI*0.5, Math.PI); ctx.stroke();
  // Blush
  ctx.fillStyle = 'rgba(255,150,150,0.2)';
  ctx.beginPath(); ctx.arc(-s*0.14, -s*0.22, s*0.04, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( s*0.24, -s*0.22, s*0.04, 0, Math.PI*2); ctx.fill();
  if (!sleeping) drawPetLegs(ctx, s, lp, moving, patch);
}
