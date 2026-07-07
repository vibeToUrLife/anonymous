/* ── Jerry (Tom & Jerry mouse) ──
   Upright, front-facing cartoon mouse drawn to resemble the classic Jerry.
   Supports three views via the `view` arg: 'front' | 'side' | 'back'
   (the room/world renderer picks one from the pet's travel direction).
   Signature matches the other games/pets/*.js draw fns, plus `view`. */
function drawJerryPet(ctx,s,lp,moving,hunger,action,ap,t,pal,view){
  view=view||'front';
  var body=pal.body,belly=pal.belly,inner=pal.inner,tail=pal.tail;
  var noseCol='#5a231a';
  var sw=moving?Math.sin(lp):0, sw2=moving?Math.sin(lp+Math.PI):0;
  var lfL=moving?Math.max(0,Math.sin(lp))*s*0.04:0, lfR=moving?Math.max(0,Math.sin(lp+Math.PI))*s*0.04:0;

  function drawFace(){
  ctx.fillStyle=body;ctx.beginPath();ctx.arc(0,-s*0.26,s*0.30,0,7);ctx.fill();
  ctx.fillStyle=body;
  ctx.beginPath();ctx.arc(-s*0.26,-s*0.44,s*0.18,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.26,-s*0.44,s*0.18,0,7);ctx.fill();
  ctx.fillStyle=inner;
  ctx.beginPath();ctx.arc(-s*0.26,-s*0.44,s*0.11,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.26,-s*0.44,s*0.11,0,7);ctx.fill();
  // forehead tuft
  ctx.strokeStyle=body;ctx.lineWidth=s*0.02;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-s*0.03,-s*0.53);ctx.quadraticCurveTo(-s*0.02,-s*0.62,s*0.04,-s*0.60);ctx.moveTo(s*0.02,-s*0.53);ctx.quadraticCurveTo(s*0.05,-s*0.61,s*0.10,-s*0.575);ctx.stroke();
  // cream lower face
  ctx.fillStyle=belly;ctx.beginPath();ctx.ellipse(0,-s*0.13,s*0.19,s*0.15,0,0,7);ctx.fill();
  // eyes (white sclera, black eyeball) + lashes
  var eyeY=-s*0.30;
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.ellipse(-s*0.115,eyeY,s*0.076,s*0.10,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.115,eyeY,s*0.076,s*0.10,0,0,7);ctx.fill();
  ctx.fillStyle='#141210';
  ctx.beginPath();ctx.ellipse(-s*0.10,eyeY+s*0.008,s*0.046,s*0.066,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.10,eyeY+s*0.008,s*0.046,s*0.066,0,0,7);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(-s*0.088,eyeY-s*0.022,s*0.017,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.112,eyeY-s*0.022,s*0.017,0,7);ctx.fill();
  ctx.strokeStyle='#17150f';ctx.lineWidth=s*0.013;ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-s*0.175,-s*0.37);ctx.lineTo(-s*0.215,-s*0.42);
  ctx.moveTo(-s*0.12,-s*0.395);ctx.lineTo(-s*0.135,-s*0.45);
  ctx.moveTo(s*0.175,-s*0.37);ctx.lineTo(s*0.215,-s*0.42);
  ctx.moveTo(s*0.12,-s*0.395);ctx.lineTo(s*0.135,-s*0.45);
  ctx.stroke();
  // nose + smile
  ctx.fillStyle=noseCol;ctx.beginPath();ctx.ellipse(0,-s*0.15,s*0.036,s*0.03,0,0,7);ctx.fill();
  ctx.strokeStyle=noseCol;ctx.lineWidth=s*0.011;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(0,-s*0.12);ctx.lineTo(0,-s*0.085);ctx.moveTo(0,-s*0.085);ctx.quadraticCurveTo(-s*0.055,-s*0.045,-s*0.095,-s*0.075);ctx.moveTo(0,-s*0.085);ctx.quadraticCurveTo(s*0.055,-s*0.045,s*0.095,-s*0.075);ctx.stroke();
  // whiskers
  ctx.strokeStyle='rgba(120,90,60,0.5)';ctx.lineWidth=s*0.008;
  ctx.beginPath();ctx.moveTo(-s*0.09,-s*0.12);ctx.lineTo(-s*0.30,-s*0.15);ctx.moveTo(-s*0.09,-s*0.09);ctx.lineTo(-s*0.30,-s*0.08);ctx.moveTo(s*0.09,-s*0.12);ctx.lineTo(s*0.30,-s*0.15);ctx.moveTo(s*0.09,-s*0.09);ctx.lineTo(s*0.30,-s*0.08);ctx.stroke();
  }

  if(view==='back'){
    ctx.strokeStyle=tail;ctx.lineWidth=s*0.035;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(s*0.04,s*0.28);ctx.bezierCurveTo(s*0.40,s*0.40,s*0.44,-s*0.10,s*0.20,-s*0.06);ctx.stroke();
    ctx.strokeStyle=body;ctx.lineWidth=s*0.10;
    ctx.beginPath();ctx.moveTo(-s*0.10,s*0.28);ctx.lineTo(-s*0.10+sw*s*0.04,s*0.44-lfL);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s*0.10,s*0.28);ctx.lineTo(s*0.10+sw2*s*0.04,s*0.44-lfR);ctx.stroke();
    ctx.fillStyle=inner;
    ctx.beginPath();ctx.ellipse(-s*0.10+sw*s*0.04,s*0.46-lfL,s*0.08,s*0.05,0,0,7);ctx.fill();
    ctx.beginPath();ctx.ellipse(s*0.10+sw2*s*0.04,s*0.46-lfR,s*0.08,s*0.05,0,0,7);ctx.fill();
    // arms + hands (match Tom's back)
    ctx.strokeStyle=body;ctx.lineWidth=s*0.075;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-s*0.15,-s*0.02);ctx.lineTo(-s*0.24-sw2*s*0.03,s*0.16);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s*0.15,-s*0.02);ctx.lineTo(s*0.24-sw*s*0.03,s*0.16);ctx.stroke();
    ctx.fillStyle=inner;
    ctx.beginPath();ctx.arc(-s*0.24-sw2*s*0.03,s*0.17,s*0.05,0,7);ctx.fill();
    ctx.beginPath();ctx.arc(s*0.24-sw*s*0.03,s*0.17,s*0.05,0,7);ctx.fill();
    ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,s*0.14,s*0.20,s*0.24,0,0,7);ctx.fill();
    ctx.fillStyle=body;ctx.beginPath();ctx.arc(0,-s*0.26,s*0.30,0,7);ctx.fill();
    ctx.fillStyle=body;
    ctx.beginPath();ctx.arc(-s*0.26,-s*0.44,s*0.18,0,7);ctx.fill();
    ctx.beginPath();ctx.arc(s*0.26,-s*0.44,s*0.18,0,7);ctx.fill();
    // ── back structure: separate the head from the body ──
    ctx.strokeStyle='rgba(0,0,0,0.14)';ctx.lineWidth=s*0.02;ctx.lineCap='round';
    ctx.beginPath();ctx.arc(0,-s*0.26,s*0.295,Math.PI*0.08,Math.PI*0.92);ctx.stroke();
    ctx.beginPath();ctx.arc(-s*0.26,-s*0.44,s*0.175,0,7);ctx.stroke();
    ctx.beginPath();ctx.arc(s*0.26,-s*0.44,s*0.175,0,7);ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,0.07)';ctx.lineWidth=s*0.022;ctx.beginPath();ctx.moveTo(0,s*0.05);ctx.lineTo(0,s*0.26);ctx.stroke();
    return;
  }
  /* Side (walking) view removed per request — walking uses the FRONT pose below. */
  /* FRONT */
  ctx.strokeStyle=tail;ctx.lineWidth=s*0.035;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(s*0.14,s*0.28);ctx.bezierCurveTo(s*0.56,s*0.32,s*0.58,-s*0.16,s*0.32,-s*0.10);ctx.stroke();
  ctx.strokeStyle=body;ctx.lineWidth=s*0.10;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-s*0.10,s*0.28);ctx.lineTo(-s*0.10+sw*s*0.04,s*0.44-lfL);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s*0.10,s*0.28);ctx.lineTo(s*0.10+sw2*s*0.04,s*0.44-lfR);ctx.stroke();
  ctx.fillStyle=inner;
  ctx.beginPath();ctx.ellipse(-s*0.10+sw*s*0.04,s*0.46-lfL,s*0.08,s*0.05,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(s*0.10+sw2*s*0.04,s*0.46-lfR,s*0.08,s*0.05,0,0,7);ctx.fill();
  ctx.strokeStyle=body;ctx.lineWidth=s*0.075;
  ctx.beginPath();ctx.moveTo(-s*0.15,s*0.02);ctx.lineTo(-s*0.24-sw2*s*0.03,s*0.16);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s*0.15,s*0.02);ctx.lineTo(s*0.24-sw*s*0.03,s*0.16);ctx.stroke();
  ctx.fillStyle=inner;
  ctx.beginPath();ctx.arc(-s*0.24-sw2*s*0.03,s*0.17,s*0.05,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(s*0.24-sw*s*0.03,s*0.17,s*0.05,0,7);ctx.fill();
  ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,s*0.14,s*0.20,s*0.24,0,0,7);ctx.fill();
  ctx.fillStyle=belly;ctx.beginPath();ctx.ellipse(0,s*0.17,s*0.13,s*0.18,0,0,7);ctx.fill();
  drawFace();
}
