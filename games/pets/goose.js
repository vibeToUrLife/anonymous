/* ── Goose ── */

// Draws a goose facing right. `pal` is the colour palette entry
// (see PET_COLORS.goose in room-base.js); falls back to a white goose.
function drawGoosePet(ctx, s, lp, moving, hunger, action, ap, t, pal) {
  const sleeping  = action === 'sleep' || action === 'nap';
  const bodyColor = (pal && pal.body)  || '#f5f5f5';
  const wingColor = (pal && pal.wing)  || '#e0e0e0';
  const beakColor = (pal && pal.beak)  || '#f2a13c';
  const legColor  = (pal && pal.leg)   || '#e08a2c';

  // Tail feathers (behind body)
  ctx.fillStyle = wingColor;
  ctx.beginPath(); ctx.ellipse(-s * 0.42, -s * 0.06, s * 0.16, s * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();

  // Plump oval body
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.46, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();

  // Folded wing detail
  ctx.fillStyle = wingColor;
  ctx.beginPath(); ctx.ellipse(-s * 0.02, -s * 0.02, s * 0.28, s * 0.2, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = s * 0.01;
  ctx.beginPath(); ctx.arc(-s * 0.05, 0, s * 0.2, -0.5, 0.9); ctx.stroke();

  // Long curved neck up to the head
  ctx.strokeStyle = bodyColor; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.28, -s * 0.05);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.35, s * 0.42, -s * 0.62);
  ctx.stroke();

  // Head
  const hx = s * 0.42, hy = -s * 0.66;
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.16, 0, Math.PI * 2); ctx.fill();

  // Beak
  ctx.fillStyle = beakColor;
  ctx.beginPath();
  ctx.moveTo(hx + s * 0.12, hy - s * 0.04);
  ctx.lineTo(hx + s * 0.32, hy + s * 0.01);
  ctx.lineTo(hx + s * 0.12, hy + s * 0.07);
  ctx.closePath(); ctx.fill();
  // Beak nostril
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(hx + s * 0.2, hy + s * 0.005, s * 0.012, s * 0.008, 0, 0, Math.PI * 2); ctx.fill();

  // Eye
  if (sleeping) {
    drawSleepEyes(ctx, s, hx + s * 0.02, hy - s * 0.02, hx + s * 0.02, hy - s * 0.02, s * 0.03);
  } else {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(hx + s * 0.05, hy - s * 0.03, s * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx + s * 0.058, hy - s * 0.04, s * 0.008, 0, Math.PI * 2); ctx.fill();
  }

  // Webbed legs (orange) — only when awake
  if (!sleeping) {
    ctx.strokeStyle = legColor; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
    const swing = moving ? Math.sin(lp) * s * 0.06 : 0;
    ctx.beginPath();
    ctx.moveTo(s * 0.08 + swing, s * 0.28); ctx.lineTo(s * 0.08 + swing, s * 0.42);
    ctx.moveTo(-s * 0.08 - swing, s * 0.28); ctx.lineTo(-s * 0.08 - swing, s * 0.42);
    ctx.stroke();
    // Webbed feet
    ctx.fillStyle = legColor;
    ctx.beginPath(); ctx.ellipse(s * 0.08 + swing, s * 0.43, s * 0.06, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s * 0.08 - swing, s * 0.43, s * 0.06, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  }
}
