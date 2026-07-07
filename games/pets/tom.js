/* ── Tom (Tom & Jerry cat) ──
   Upright, front-facing cartoon cat drawn to resemble the classic Tom.
   Supports three views via the `view` arg: 'front' | 'side' | 'back'
   (the room/world renderer picks one from the pet's travel direction).
   Signature matches the other games/pets/*.js draw fns, plus `view`. */
function drawTomPet(ctx,s,lp,moving,hunger,action,ap,t,pal,view){
  view=view||'front';
  var body=pal.body,dark=pal.dark,belly=pal.belly,inner=pal.inner,muzzle=pal.muzzle;
  var noseCol='#242730',brow='#1e2028';
  var sw=moving?Math.sin(lp):0, sw2=moving?Math.sin(lp+Math.PI):0;
  var lfL=moving?Math.max(0,Math.sin(lp))*s*0.05:0, lfR=moving?Math.max(0,Math.sin(lp+Math.PI))*s*0.05:0;

  function drawFace(){
  // head (big, dominates like the promo art)
  ctx.fillStyle=body;ctx.beginPath();ctx.arc(0,-s*0.32,s*0.37,0,7);ctx.fill();
  // ears (large pointed, mauve inner)
  ctx.fillStyle=body;
  ctx.beginPath();ctx.moveTo(-s*0.34,-s*0.46);ctx.lineTo(-s*0.42,-s*0.80);ctx.lineTo(-s*0.07,-s*0.58);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(s*0.34,-s*0.46);ctx.lineTo(s*0.42,-s*0.80);ctx.lineTo(s*0.07,-s*0.58);ctx.closePath();ctx.fill();
  ctx.fillStyle=inner;
  ctx.beginPath();ctx.moveTo(-s*0.31,-s*0.49);ctx.lineTo(-s*0.37,-s*0.73);ctx.lineTo(-s*0.13,-s*0.57);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(s*0.31,-s*0.49);ctx.lineTo(s*0.37,-s*0.73);ctx.lineTo(s*0.13,-s*0.57);ctx.closePath();ctx.fill();
  // (Tom's head tuft removed per request)
  // white muzzle — small tight lower face (two small cheek lobes + short nose bridge)
  ctx.fillStyle=muzzle;
  ctx.beginPath();ctx.arc(-s*0.08,-s*0.01,s*0.108,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.08,-s*0.01,s*0.108,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(0,-s*0.01,s*0.12,s*0.108,0,0,7);ctx.fill();
  ctx.beginPath();ctx.moveTo(-s*0.052,-s*0.205);ctx.lineTo(s*0.052,-s*0.205);ctx.lineTo(s*0.062,-s*0.01);ctx.lineTo(-s*0.062,-s*0.01);ctx.closePath();ctx.fill();
  // eyes (big, close-set, green)
  var eyeY=-s*0.34;
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.ellipse(-s*0.125,eyeY,s*0.125,s*0.16,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.125,eyeY,s*0.125,s*0.16,0,0,7);ctx.fill();
  ctx.fillStyle='#5aa93f';
  ctx.beginPath();ctx.ellipse(-s*0.115,eyeY+s*0.015,s*0.075,s*0.105,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.115,eyeY+s*0.015,s*0.075,s*0.105,0,0,7);ctx.fill();
  ctx.fillStyle='#16181d';
  ctx.beginPath();ctx.ellipse(-s*0.10,eyeY+s*0.03,s*0.044,s*0.075,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.10,eyeY+s*0.03,s*0.044,s*0.075,0,0,7);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(-s*0.082,eyeY-s*0.025,s*0.024,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.148,eyeY-s*0.025,s*0.024,0,7);ctx.fill();
  // brows (black, arched)
  ctx.strokeStyle=brow;ctx.lineWidth=s*0.024;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-s*0.24,-s*0.49);ctx.quadraticCurveTo(-s*0.14,-s*0.55,-s*0.03,-s*0.51);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s*0.03,-s*0.51);ctx.quadraticCurveTo(s*0.14,-s*0.55,s*0.24,-s*0.49);ctx.stroke();
  // nose (black, rounded)
  ctx.fillStyle=noseCol;ctx.beginPath();ctx.moveTo(-s*0.05,-s*0.17);ctx.quadraticCurveTo(0,-s*0.205,s*0.05,-s*0.17);ctx.quadraticCurveTo(s*0.03,-s*0.115,0,-s*0.11);ctx.quadraticCurveTo(-s*0.03,-s*0.115,-s*0.05,-s*0.17);ctx.closePath();ctx.fill();
  // closed happy smile (kept inside the muzzle)
  ctx.strokeStyle=noseCol;ctx.lineWidth=s*0.017;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(0,-s*0.11);ctx.lineTo(0,-s*0.035);
  ctx.moveTo(0,-s*0.035);ctx.quadraticCurveTo(-s*0.085,s*0.022,-s*0.13,-s*0.05);
  ctx.moveTo(0,-s*0.035);ctx.quadraticCurveTo(s*0.085,s*0.022,s*0.13,-s*0.05);
  ctx.stroke();
  // whiskers
  ctx.strokeStyle='rgba(80,86,96,0.55)';ctx.lineWidth=s*0.009;
  ctx.beginPath();ctx.moveTo(-s*0.20,-s*0.05);ctx.lineTo(-s*0.44,-s*0.09);ctx.moveTo(-s*0.20,-s*0.01);ctx.lineTo(-s*0.44,0);ctx.moveTo(s*0.20,-s*0.05);ctx.lineTo(s*0.44,-s*0.09);ctx.moveTo(s*0.20,-s*0.01);ctx.lineTo(s*0.44,0);ctx.stroke();
  }

  if(view==='back'){
    ctx.strokeStyle=body;ctx.lineWidth=s*0.09;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(s*0.02,s*0.30);ctx.bezierCurveTo(s*0.36,s*0.42,s*0.42,-s*0.06,s*0.16,-s*0.10);ctx.stroke();
    ctx.strokeStyle=belly;ctx.lineWidth=s*0.07;ctx.beginPath();ctx.moveTo(s*0.24,-s*0.06);ctx.lineTo(s*0.16,-s*0.10);ctx.stroke();
    ctx.strokeStyle=body;ctx.lineWidth=s*0.14;
    ctx.beginPath();ctx.moveTo(-s*0.12,s*0.30);ctx.lineTo(-s*0.12+sw*s*0.05,s*0.50-lfL);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s*0.12,s*0.30);ctx.lineTo(s*0.12+sw2*s*0.05,s*0.50-lfR);ctx.stroke();
    ctx.fillStyle=body;
    ctx.beginPath();ctx.ellipse(-s*0.12+sw*s*0.05,s*0.52-lfL,s*0.09,s*0.055,0,0,7);ctx.fill();
    ctx.beginPath();ctx.ellipse(s*0.12+sw2*s*0.05,s*0.52-lfR,s*0.09,s*0.055,0,0,7);ctx.fill();
    ctx.strokeStyle=body;ctx.lineWidth=s*0.10;
    ctx.beginPath();ctx.moveTo(-s*0.19,-s*0.02);ctx.lineTo(-s*0.29-sw2*s*0.03,s*0.16);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s*0.19,-s*0.02);ctx.lineTo(s*0.29-sw*s*0.03,s*0.16);ctx.stroke();
    ctx.fillStyle=body;
    ctx.beginPath();ctx.arc(-s*0.29-sw2*s*0.03,s*0.18,s*0.06,0,7);ctx.fill();
    ctx.beginPath();ctx.arc(s*0.29-sw*s*0.03,s*0.18,s*0.06,0,7);ctx.fill();
    ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,s*0.12,s*0.26,s*0.32,0,0,7);ctx.fill();
    ctx.fillStyle=body;ctx.beginPath();ctx.arc(0,-s*0.30,s*0.34,0,7);ctx.fill();
    ctx.fillStyle=body;
    ctx.beginPath();ctx.moveTo(-s*0.30,-s*0.46);ctx.lineTo(-s*0.34,-s*0.72);ctx.lineTo(-s*0.10,-s*0.56);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(s*0.30,-s*0.46);ctx.lineTo(s*0.34,-s*0.72);ctx.lineTo(s*0.10,-s*0.56);ctx.closePath();ctx.fill();
    // ── back structure: separate the head from the body ──
    ctx.strokeStyle='rgba(0,0,0,0.14)';ctx.lineWidth=s*0.02;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.arc(0,-s*0.30,s*0.335,Math.PI*0.1,Math.PI*0.9);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-s*0.30,-s*0.46);ctx.lineTo(-s*0.34,-s*0.72);ctx.lineTo(-s*0.10,-s*0.56);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s*0.30,-s*0.46);ctx.lineTo(s*0.34,-s*0.72);ctx.lineTo(s*0.10,-s*0.56);ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,0.07)';ctx.lineWidth=s*0.022;ctx.beginPath();ctx.moveTo(0,s*0.05);ctx.lineTo(0,s*0.30);ctx.stroke();
    return;
  }
  /* Side (walking) view removed per request — walking uses the FRONT pose below. */
  /* FRONT */
  ctx.strokeStyle=body;ctx.lineWidth=s*0.09;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(s*0.20,s*0.30);ctx.bezierCurveTo(s*0.64,s*0.30,s*0.66,-s*0.12,s*0.42,-s*0.18);ctx.stroke();
  ctx.strokeStyle=body;ctx.lineWidth=s*0.14;
  ctx.beginPath();ctx.moveTo(-s*0.12,s*0.30);ctx.lineTo(-s*0.12+sw*s*0.05,s*0.50-lfL);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s*0.12,s*0.30);ctx.lineTo(s*0.12+sw2*s*0.05,s*0.50-lfR);ctx.stroke();
  ctx.fillStyle=belly;
  ctx.beginPath();ctx.ellipse(-s*0.12+sw*s*0.05,s*0.52-lfL,s*0.10,s*0.06,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.12+sw2*s*0.05,s*0.52-lfR,s*0.10,s*0.06,0,0,7);ctx.fill();
  ctx.strokeStyle=body;ctx.lineWidth=s*0.10;
  ctx.beginPath();ctx.moveTo(-s*0.19,-s*0.02);ctx.lineTo(-s*0.30-sw2*s*0.03,s*0.16);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s*0.19,-s*0.02);ctx.lineTo(s*0.30-sw*s*0.03,s*0.16);ctx.stroke();
  ctx.fillStyle=belly;
  ctx.beginPath();ctx.arc(-s*0.30-sw2*s*0.03,s*0.18,s*0.065,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.30-sw*s*0.03,s*0.18,s*0.065,0,7);ctx.fill();
  ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,s*0.14,s*0.24,s*0.30,0,0,7);ctx.fill();
  ctx.fillStyle=belly;ctx.beginPath();ctx.ellipse(0,s*0.18,s*0.15,s*0.22,0,0,7);ctx.fill();
  drawFace();
}
