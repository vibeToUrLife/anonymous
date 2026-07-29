    let plantAnimFrame = null;
    function drawPlant(type, level) {
      cancelAnimationFrame(plantAnimFrame);
      const cvs = document.getElementById('plantCanvas');
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const W = cvs.width, H = cvs.height;
      let _lastPlantFrame = 0;
      function frame(t) {
        // Covered by the outside view or the farm — nothing to draw.
        if (isOutsideView || isFarmView) { plantAnimFrame = requestAnimationFrame(frame); return; }
        if (t - _lastPlantFrame < 33) { plantAnimFrame = requestAnimationFrame(frame); return; }
        _lastPlantFrame = t;
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.scale(W / 80, H / 100);
        _renderPlantType(ctx, type, level, t);
        ctx.restore();
        plantAnimFrame = requestAnimationFrame(frame);
      }
      plantAnimFrame = requestAnimationFrame(frame);
    }
    function _renderPlantType(ctx, type, lv, t) {
      switch(type) {
        case 'seedling': _drawSeedling(ctx, lv, t); break;
        case 'tulip': _drawTulip(ctx, lv, t); break;
        case 'sunflower': _drawSunflower(ctx, lv, t); break;
        case 'tree': _drawTree(ctx, lv, t); break;
        case 'cherry': _drawCherry(ctx, lv, t); break;
        case 'cactus': _drawCactus(ctx, lv, t); break;
      }
    }

    /* ── Helpers ── */
    function _mp(lv,a,b,c,d){return c+(d-c)*Math.max(0,Math.min(1,(lv-a)/(b-a)))}
    function _drawPot(ctx,cx,by){
      ctx.fillStyle='#8B6347';ctx.beginPath();
      ctx.moveTo(cx-14,by-16);ctx.lineTo(cx+14,by-16);ctx.lineTo(cx+11,by);ctx.lineTo(cx-11,by);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='#a07050';ctx.fillRect(cx-16,by-20,32,5);
      ctx.fillStyle='#5a3a20';ctx.beginPath();ctx.ellipse(cx,by-16,12,3,0,0,Math.PI*2);ctx.fill();
    }
    function _drawSeedPhase(ctx,lv,seedCol){
      if(lv>=2){ctx.fillStyle=seedCol||'#7a5a3a';ctx.beginPath();ctx.ellipse(0,-2,3,2,0.3,0,Math.PI*2);ctx.fill();
        if(lv>=3){ctx.strokeStyle='#9a8a6a';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(-1,-3);ctx.lineTo(0,-1);ctx.lineTo(1,-3);ctx.stroke();
          ctx.strokeStyle='#c8b89a';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(1,3);ctx.stroke();}
        if(lv>=4){ctx.strokeStyle='#6db85a';ctx.lineWidth=1;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(0,-7);ctx.stroke();
          ctx.fillStyle='#7ac868';ctx.beginPath();ctx.ellipse(0,-7,1.5,1,0,0,Math.PI*2);ctx.fill();}}
    }
    function _dStem(ctx,h,w,col,cv){ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(cv||2,-h/2,0,-h);ctx.stroke();}
    function _dLeaf(ctx,x,y,sz,ang,col,vein){
      ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0,0,sz,sz*0.38,0,0,Math.PI*2);ctx.fill();
      if(vein){ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(-sz*0.7,0);ctx.lineTo(sz*0.7,0);ctx.stroke();
        for(let i=-2;i<=2;i++){if(!i)continue;ctx.beginPath();ctx.moveTo(i*sz*0.18,0);ctx.lineTo(i*sz*0.3,i>0?-sz*0.18:sz*0.18);ctx.stroke();}}
      ctx.restore();
    }
    function _dFlower(ctx,x,y,pc,ps,pcol,ccol,op){
      if(op<=0)return;
      for(let i=0;i<pc;i++){const a=(i/pc)*Math.PI*2;ctx.save();ctx.translate(x,y);ctx.rotate(a);
        ctx.fillStyle=pcol;ctx.beginPath();ctx.ellipse(0,-ps*op*0.7,ps*0.38,ps*op,0,0,Math.PI*2);ctx.fill();ctx.restore();}
      ctx.fillStyle=ccol||'#f5e060';ctx.beginPath();ctx.arc(x,y,ps*0.32,0,Math.PI*2);ctx.fill();
    }
    function _dBud(ctx,x,y,sz,col){ctx.fillStyle='#4a7a3f';ctx.beginPath();ctx.ellipse(x,y,sz*0.55,sz,0,0,Math.PI*2);ctx.fill();
      if(col){ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(x,y-sz*0.3,sz*0.25,sz*0.35,0,0,Math.PI*2);ctx.fill();}}
    function _dDew(ctx,x,y){ctx.fillStyle='rgba(180,220,255,0.55)';ctx.beginPath();ctx.arc(x,y,1.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.65)';ctx.beginPath();ctx.arc(x-0.4,y-0.4,0.45,0,Math.PI*2);ctx.fill();}
    function _dButterfly(ctx,x,y,t,col){
      const wa=Math.sin(t/200)*0.4;ctx.save();ctx.translate(x,y);ctx.fillStyle=col||'#e8a0c0';
      ctx.save();ctx.rotate(-0.3-wa);ctx.beginPath();ctx.ellipse(-3,0,3.5,2.2,-0.3,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.save();ctx.rotate(0.3+wa);ctx.beginPath();ctx.ellipse(3,0,3.5,2.2,0.3,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle='#3a2a1a';ctx.fillRect(-0.3,-2.5,0.6,5);
      ctx.strokeStyle='#3a2a1a';ctx.lineWidth=0.3;ctx.beginPath();ctx.moveTo(0,-2.5);ctx.lineTo(-1.5,-4.5);ctx.moveTo(0,-2.5);ctx.lineTo(1.5,-4.5);ctx.stroke();ctx.restore();
    }
    function _dBird(ctx,x,y,col){
      ctx.save();ctx.translate(x,y);ctx.fillStyle=col||'#8a5a3a';
      ctx.beginPath();ctx.ellipse(0,0,4.5,2.8,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(3.5,-1.8,2.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(4.3,-2.2,0.7,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(4.6,-2.2,0.35,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#e8a040';ctx.beginPath();ctx.moveTo(5.7,-1.8);ctx.lineTo(7.2,-1.3);ctx.lineTo(5.7,-0.8);ctx.closePath();ctx.fill();
      ctx.fillStyle=col||'#8a5a3a';ctx.beginPath();ctx.moveTo(-3.5,-0.8);ctx.lineTo(-7,-3.5);ctx.lineTo(-6,0.3);ctx.closePath();ctx.fill();ctx.restore();
    }
    function _dBee(ctx,x,y,t){
      ctx.save();ctx.translate(x,y);const wa=Math.sin(t/100)*0.3;ctx.fillStyle='rgba(200,220,255,0.45)';
      ctx.save();ctx.rotate(-0.3-wa);ctx.beginPath();ctx.ellipse(-1.5,0,2.5,1.3,0,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.save();ctx.rotate(0.3+wa);ctx.beginPath();ctx.ellipse(1.5,0,2.5,1.3,0,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle='#e8c020';ctx.beginPath();ctx.ellipse(0,0,2.5,1.8,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#2a1a00';ctx.fillRect(-0.3,-1.8,0.6,3.6);ctx.fillRect(-1.8,-1,0.6,2);ctx.restore();
    }
    function _dPetals(ctx,W,H,t,n,col){
      for(let i=0;i<n;i++){const px=W*0.1+W*0.8*((Math.sin(t/1200+i*2.7)+1)/2);const py=H*0.08+H*0.5*((t/2000+i*0.3)%1);
        ctx.save();ctx.translate(px,py);ctx.rotate(t/500+i*1.5);ctx.fillStyle=col||'#f5a0b0';ctx.globalAlpha=0.55;
        ctx.beginPath();ctx.ellipse(0,0,2.2,1,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.restore();}
    }
    function _dBerry(ctx,x,y,sz,col){ctx.fillStyle=col||'#cc3344';ctx.beginPath();ctx.arc(x,y,sz,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.28)';ctx.beginPath();ctx.arc(x-sz*0.3,y-sz*0.3,sz*0.28,0,Math.PI*2);ctx.fill();}
    function _rRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
      ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);
      ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();ctx.fill();}
    function _shade(hex,p){let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
      r=Math.max(0,Math.min(255,r+Math.round(r*p/100)));g=Math.max(0,Math.min(255,g+Math.round(g*p/100)));
      b=Math.max(0,Math.min(255,b+Math.round(b*p/100)));return'#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('');}

    /* ── Seedling 30 levels ── */
    function _drawSeedling(ctx,lv,t){
      const W=80,H=100,cx=W/2,by=H-4;_drawPot(ctx,cx,by);
      if(lv<=4){ctx.save();ctx.translate(cx,by-16);_drawSeedPhase(ctx,lv,'#7a5a3a');ctx.restore();return;}
      // ═══ LEVEL 30: ETERNAL GARDEN ═══
      if(lv>=30){
        // Ornate emerald pot with gold trim
        ctx.fillStyle='#2a8a4a';ctx.beginPath();ctx.moveTo(cx-15,by-16);ctx.lineTo(cx+15,by-16);ctx.lineTo(cx+12,by);ctx.lineTo(cx-12,by);ctx.closePath();ctx.fill();
        ctx.fillStyle='#3aaa5a';ctx.fillRect(cx-17,by-21,34,6);
        ctx.fillStyle='#1a6a3a';ctx.beginPath();ctx.ellipse(cx,by-16,13,3,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#f5d060';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(cx-9,by-12);ctx.quadraticCurveTo(cx,by-7,cx+9,by-12);ctx.stroke();
        ctx.fillStyle='#f5d060';ctx.beginPath();ctx.arc(cx,by-9,1.3,0,Math.PI*2);ctx.fill();
        const bY=by-16,sH=58;
        // Rainbow petals falling
        const pcols=['#e87090','#f0a060','#f0e060','#60c060','#60a0f0','#c060e0'];
        for(let i=0;i<10;i++){const px=cx-25+((t/1400+i*0.32)%1)*50,py=2+((t/1800+i*0.23)%1)*(H*0.55);
          ctx.save();ctx.translate(px,py);ctx.rotate(t/400+i*2);ctx.fillStyle=pcols[i%6];ctx.globalAlpha=0.55;
          ctx.beginPath();ctx.ellipse(0,0,2.2,1,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.restore();}
        // Green magical aura
        ctx.save();const ga=ctx.createRadialGradient(cx,bY-sH*0.5,0,cx,bY-sH*0.5,sH);
        ga.addColorStop(0,'rgba(100,220,120,0.22)');ga.addColorStop(0.5,'rgba(80,200,100,0.08)');ga.addColorStop(1,'rgba(80,200,100,0)');
        ctx.fillStyle=ga;ctx.beginPath();ctx.arc(cx,bY-sH*0.5,sH,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.translate(cx,bY);
        // Thick vine-wrapped trunk
        const trG=ctx.createLinearGradient(-2.5,0,2.5,0);
        trG.addColorStop(0,'#2a5a20');trG.addColorStop(0.5,'#3a7a30');trG.addColorStop(1,'#2a5a20');
        ctx.fillStyle=trG;ctx.fillRect(-2.5,-sH,5,sH);
        ctx.strokeStyle='rgba(100,200,80,0.4)';ctx.lineWidth=1;
        for(let i=0;i<6;i++){const vy=-i*sH/6;ctx.beginPath();ctx.arc(i%2?2:-2,vy-sH/12,3,0,Math.PI);ctx.stroke();}
        // 6 branches
        for(let b=0;b<6;b++){const bh=sH*(0.3+b*0.1),s=b%2===0?1:-1,bl=14+b*1.5;
          ctx.strokeStyle='#3a6a2a';ctx.lineWidth=2.5-b*0.3;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(0,-bh);ctx.quadraticCurveTo(s*bl*0.6,-bh-bl*0.3,s*bl,-bh-bl*0.4);ctx.stroke();}
        // Leaves on branches
        for(let i=0;i<8;i++){const ly=-(sH*(0.3+i*0.07));const s=i%2===0?1:-1;
          _dLeaf(ctx,s*(8+i*1.5),ly,8-i*0.5,s*0.5,'#5db85a',true);}
        // 4-layer lush canopy
        const ccols=['#3aaa50','#50bb60','#60cc70','#45bb55'];
        for(let i=3;i>=0;i--){ctx.fillStyle=ccols[i];ctx.beginPath();ctx.arc(0,-sH-(i*5),20-i*3,0,Math.PI*2);ctx.fill();}
        // Rainbow flower garden in canopy
        const fcols=['#e87090','#f0a060','#a060e0','#60b0f0','#f0e060','#e060a0'];
        for(let i=0;i<12;i++){const fx=Math.cos(i*1.7+t/4000)*16,fy=-sH-4+Math.sin(i*2.3+t/5000)*14;
          for(let p=0;p<5;p++){const pa=(p/5)*Math.PI*2+i*0.8;ctx.save();ctx.translate(fx,fy);ctx.rotate(pa);
            ctx.fillStyle=fcols[i%6];ctx.beginPath();ctx.ellipse(0,-2.8,1.2,2.8,0,0,Math.PI*2);ctx.fill();ctx.restore();}
          ctx.fillStyle='#f5e060';ctx.beginPath();ctx.arc(fx,fy,1.2,0,Math.PI*2);ctx.fill();}
        // Crown star
        ctx.save();ctx.translate(0,-sH-22);const sp2=0.5+Math.sin(t/500)*0.2;
        ctx.fillStyle='rgba(180,255,180,'+sp2+')';ctx.beginPath();
        for(let i=0;i<6;i++){const a=(i*Math.PI*2/6)-Math.PI/2;const ir=a+Math.PI/6;
          ctx.lineTo(Math.cos(a)*5,Math.sin(a)*5);ctx.lineTo(Math.cos(ir)*2,Math.sin(ir)*2);}
        ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(200,255,200,0.6)';ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();
        // Star rays
        ctx.strokeStyle='rgba(180,255,180,'+(sp2*0.3)+')';ctx.lineWidth=0.6;
        for(let i=0;i<6;i++){const ra=(i/6)*Math.PI*2;ctx.beginPath();ctx.moveTo(Math.cos(ra)*6,Math.sin(ra)*6);ctx.lineTo(Math.cos(ra)*11,Math.sin(ra)*11);ctx.stroke();}
        ctx.restore();
        // Berries
        for(let i=0;i<5;i++){_dBerry(ctx,(i%2?1:-1)*(6+i*2.5),-sH*0.3-i*5,2,'#cc3344');}
        ctx.restore();
        // 3 butterflies
        _dButterfly(ctx,cx+18+Math.sin(t/600)*6,bY-sH*0.4+Math.cos(t/800)*4,t,'#d8a0d0');
        _dButterfly(ctx,cx-15+Math.cos(t/700)*5,bY-sH*0.7+Math.sin(t/900)*3,t,'#a0d0e0');
        _dButterfly(ctx,cx+5+Math.sin(t/500)*8,bY-sH*0.2+Math.cos(t/600)*5,t,'#f0c080');
        // Sparkle fireflies
        for(let i=0;i<8;i++){const sx=cx-18+Math.sin(t/800+i*1.3)*16,sy=bY-8-i*7+Math.cos(t/600+i*2)*3;
          const sa=0.3+Math.sin(t/300+i*2)*0.35;ctx.fillStyle='rgba(180,255,180,'+sa+')';ctx.beginPath();ctx.arc(sx,sy,1.5,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(180,255,180,'+(sa*0.2)+')';ctx.beginPath();ctx.arc(sx,sy,4.5,0,Math.PI*2);ctx.fill();}
        _dDew(ctx,cx-10,bY-sH*0.3);_dDew(ctx,cx+12,bY-sH*0.5);_dDew(ctx,cx-5,bY-sH*0.7);
        _dBird(ctx,cx+10,bY-sH-10,'#6a8a4a');
        return;
      }
      const bY=by-16,sH=_mp(lv,5,30,8,55),sW=_mp(lv,5,30,1.5,4.5);
      const lSz=_mp(lv,5,30,4,13),lCol=lv>=28?'#a8aa40':lv>=26?'#88a850':'#6db85a';
      if(lv>=26)_dPetals(ctx,W,H,t,Math.min(lv-25,4),'#f0a0b0');
      ctx.save();ctx.translate(cx,bY);ctx.rotate(Math.sin(t/900+lv*0.5)*(0.5+lv*0.06)*Math.PI/180);
      _dStem(ctx,sH,sW,'#4a7c3f',1+lv*0.08);
      if(lv>=5&&lv<=12){const cs=lv<=8?4:3;_dLeaf(ctx,-5,-3,cs,-0.8,'#8ac870',false);_dLeaf(ctx,5,-3,cs,0.8,'#8ac870',false);}
      const lC=Math.min(Math.floor(_mp(lv,6,25,0,10)),10);
      for(let i=0;i<lC;i++){const ly=-(sH*(0.15+i*0.075));if(ly<-sH)break;const s=i%2===0?1:-1;
        _dLeaf(ctx,s*(3+sW+lSz*0.3),ly,lSz*(0.6+0.4*(1-i/10)),s*(0.4+i*0.05),lCol,lv>=13);}
      if(lv>=12){const bc=Math.min(Math.floor(_mp(lv,12,25,1,4)),4);
        for(let b=0;b<bc;b++){const bh=sH*(0.35+b*0.15),bl=_mp(lv,12,30,6,16),s=b%2===0?1:-1;
          ctx.save();ctx.translate(0,-bh);ctx.rotate(s*0.6);_dStem(ctx,bl,sW*0.45,'#5a8a4f',s*2);
          if(lv>=14)_dLeaf(ctx,s*2,-bl+2,lSz*0.55,s*0.3,lCol,false);ctx.restore();}}
      if(lv>=15&&lv<18){const bs=_mp(lv,15,17,2,4);_dBud(ctx,0,-sH,bs,lv>=16?'#e8a0c0':null);}
      if(lv>=18)_dFlower(ctx,0,-sH,lv>=22?6:5,4+lv*0.18,'#e87090','#f5e060',_mp(lv,18,20,0.3,1));
      if(lv>=21){const ef=Math.min(Math.floor(_mp(lv,21,28,1,5)),5);const cs2=['#e87090','#d060a0','#f090a0','#e0a070','#c070c0'];
        for(let f=0;f<ef;f++){const fy=-(sH*(0.45+f*0.09)),fx=(f%2===0?1:-1)*(7+f*2);
          _dFlower(ctx,fx,fy,5,2.8,lv>=24?cs2[f%5]:'#e87090','#f5e060',1);}}
      if(lv>=27){const bn=Math.min(lv-26,6);for(let i=0;i<bn;i++){_dBerry(ctx,(i%2?1:-1)*(5+i*2.5),-(sH*(0.28+i*0.07)),1.8,lv>=29?'#cc2244':'#cc6644');}}
      ctx.restore();
      if(lv>=20&&lv<=25){_dDew(ctx,cx-8,bY-sH*0.38);if(lv>=22)_dDew(ctx,cx+10,bY-sH*0.28);}
      if(lv>=23&&lv<=28)_dButterfly(ctx,cx+16+Math.sin(t/600)*5,bY-sH*0.55+Math.cos(t/800)*3,t,'#d8a0d0');
      if(lv>=30)_dBird(ctx,cx+8,bY-sH-8,'#8a6a4a');
    }

    /* ── Tulip 30 levels ── */
    function _drawTulip(ctx,lv,t){
      const W=80,H=100,cx=W/2,by=H-4;_drawPot(ctx,cx,by);
      if(lv<=4){ctx.save();ctx.translate(cx,by-16);_drawSeedPhase(ctx,lv,'#8a6a40');ctx.restore();return;}
      // ═══ LEVEL 30: ROYAL BOUQUET ═══
      if(lv>=30){
        // Crystal silver pot with diamond pattern
        ctx.fillStyle='#a0a8b8';ctx.beginPath();ctx.moveTo(cx-15,by-16);ctx.lineTo(cx+15,by-16);ctx.lineTo(cx+12,by);ctx.lineTo(cx-12,by);ctx.closePath();ctx.fill();
        ctx.fillStyle='#b8c0d0';ctx.fillRect(cx-17,by-21,34,6);
        ctx.fillStyle='#8890a0';ctx.beginPath();ctx.ellipse(cx,by-16,13,3,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=0.6;
        for(let i=0;i<4;i++){const dx2=cx-8+i*5.5;ctx.beginPath();ctx.moveTo(dx2,by-14);ctx.lineTo(dx2+2.5,by-9);ctx.lineTo(dx2,by-4);ctx.lineTo(dx2-2.5,by-9);ctx.closePath();ctx.stroke();}
        const bY=by-16,sH=58;
        // Prismatic aura
        ctx.save();const pa2=ctx.createRadialGradient(cx,bY-sH*0.5,0,cx,bY-sH*0.5,sH*0.9);
        pa2.addColorStop(0,'rgba(200,160,255,0.2)');pa2.addColorStop(0.4,'rgba(180,140,240,0.08)');pa2.addColorStop(1,'rgba(180,140,240,0)');
        ctx.fillStyle=pa2;ctx.beginPath();ctx.arc(cx,bY-sH*0.5,sH*0.9,0,Math.PI*2);ctx.fill();ctx.restore();
        // Falling crystal petals
        const cpcols=['#e74c6f','#d060d0','#f0a040','#60c0f0','#f060a0','#c040c0'];
        for(let i=0;i<8;i++){const px=cx-22+((t/1500+i*0.28)%1)*44,py=4+((t/1700+i*0.2)%1)*(H*0.45);
          ctx.save();ctx.translate(px,py);ctx.rotate(t/350+i*2.2);ctx.fillStyle=cpcols[i%6];ctx.globalAlpha=0.5;
          ctx.beginPath();ctx.ellipse(0,0,2,0.9,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.restore();}
        ctx.save();ctx.translate(cx,bY);
        // 5 tulip stems at different heights with gem-like petals
        const stems=[{x:0,h:sH,col:'#e74c6f'},{x:-9,h:sH*0.8,col:'#d060d0'},{x:9,h:sH*0.75,col:'#f0a040'},
          {x:-5,h:sH*0.65,col:'#60c0f0'},{x:6,h:sH*0.6,col:'#c040c0'}];
        stems.forEach(function(s,si){
          const blC=3-Math.floor(si/2);
          for(let i=0;i<blC;i++){const sd=i%2===0?1:-1,bH2=s.h*0.4+i*4;
            ctx.fillStyle='#5daa5d';ctx.beginPath();ctx.moveTo(s.x+sd*2,0);ctx.quadraticCurveTo(s.x+sd*(7+i*1.5),-bH2*0.6,s.x+sd*(3+i),-bH2);
            ctx.quadraticCurveTo(s.x+sd*(5+i),-bH2*0.4,s.x+sd*2,0);ctx.fill();}
          ctx.strokeStyle='#3d7a3d';ctx.lineWidth=2-si*0.2;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(s.x,0);ctx.quadraticCurveTo(s.x+(si%2?1:-1)*2,-s.h/2,s.x,-s.h);ctx.stroke();
          const ps=5+si*0.3;
          for(let p=0;p<6;p++){const a=(p/6)*Math.PI*2;ctx.save();ctx.translate(s.x,-s.h);ctx.rotate(a);
            ctx.fillStyle=s.col;ctx.beginPath();ctx.ellipse(0,-ps*0.85,2.5,ps,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='rgba(255,255,255,0.25)';ctx.beginPath();ctx.ellipse(-0.5,-ps*0.6,0.8,ps*0.4,0,0,Math.PI*2);ctx.fill();
            ctx.restore();}
          ctx.fillStyle='#f5e060';ctx.beginPath();ctx.arc(s.x,-s.h,2,0,Math.PI*2);ctx.fill();
          const tsp2=0.4+Math.sin(t/400+si*1.5)*0.3;
          ctx.fillStyle='rgba(255,255,255,'+tsp2+')';ctx.beginPath();ctx.arc(s.x,-s.h-ps,1.5,0,Math.PI*2);ctx.fill();});
        ctx.restore();
        // Hummingbird
        ctx.save();ctx.translate(cx+20+Math.sin(t/500)*4,bY-sH*0.6+Math.cos(t/700)*3);
        ctx.fillStyle='#30a880';ctx.beginPath();ctx.ellipse(0,0,4,2.5,0.1,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#40c8a0';ctx.beginPath();ctx.arc(3.5,-1.5,2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(4.3,-1.8,0.6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#000';ctx.beginPath();ctx.arc(4.5,-1.8,0.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#30a880';ctx.beginPath();ctx.moveTo(5,-1.3);ctx.lineTo(8.5,-1);ctx.lineTo(5,-0.3);ctx.closePath();ctx.fill();
        const wa2=Math.sin(t/50)*0.5;ctx.fillStyle='rgba(100,220,200,0.5)';
        ctx.save();ctx.rotate(-0.5-wa2);ctx.beginPath();ctx.ellipse(-2,-1,4,1.5,0,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.rotate(-0.5+wa2);ctx.beginPath();ctx.ellipse(-2,1,4,1.5,0,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.restore();
        // Crystal sparkle particles
        for(let i=0;i<10;i++){const sx=cx-16+Math.sin(t/900+i*1.1)*14,sy=bY-6-i*6+Math.cos(t/700+i*1.8)*3;
          const sa2=0.25+Math.sin(t/250+i*2.3)*0.3;
          ctx.fillStyle='rgba(200,180,255,'+sa2+')';
          const sz=1+sa2;ctx.beginPath();ctx.moveTo(sx,sy-sz);ctx.lineTo(sx+sz*0.3,sy-sz*0.3);ctx.lineTo(sx+sz,sy);
          ctx.lineTo(sx+sz*0.3,sy+sz*0.3);ctx.lineTo(sx,sy+sz);ctx.lineTo(sx-sz*0.3,sy+sz*0.3);
          ctx.lineTo(sx-sz,sy);ctx.lineTo(sx-sz*0.3,sy-sz*0.3);ctx.closePath();ctx.fill();}
        return;
      }
      const bY=by-16,sH=_mp(lv,5,30,6,55),sW=_mp(lv,5,30,1.2,3);
      if(lv>=26)_dPetals(ctx,W,H,t,lv-25,'#f0a0c0');
      ctx.save();ctx.translate(cx,bY);ctx.rotate(Math.sin(t/1000+lv*0.3)*(0.3+lv*0.04)*Math.PI/180);
      const blC=Math.min(Math.floor(_mp(lv,5,15,1,5)),5);
      for(let i=0;i<blC;i++){const s=i%2===0?1:-1,bH=_mp(lv,5,20,8,28-i*3);
        ctx.fillStyle='#5daa5d';ctx.beginPath();ctx.moveTo(s*2,0);ctx.quadraticCurveTo(s*(8+i*2),-bH*0.6,s*(3+i),-bH);
        ctx.quadraticCurveTo(s*(6+i),-bH*0.4,s*2,0);ctx.fill();}
      _dStem(ctx,sH,sW,'#3d7a3d',1);
      if(lv>=13&&lv<18){const bs=_mp(lv,13,17,3,7);ctx.fillStyle='#3d7a3d';ctx.beginPath();ctx.ellipse(0,-sH,bs*0.5,bs,0,0,Math.PI*2);ctx.fill();
        if(lv>=16){ctx.fillStyle='#e74c6f';ctx.beginPath();ctx.ellipse(0,-sH-bs*0.3,bs*0.3,bs*0.3,0,0,Math.PI*2);ctx.fill();}}
      if(lv>=18){const op=_mp(lv,18,22,0.3,1);const cols=['#e74c6f','#d43a6f','#ff6090','#e050a0','#f0a040','#c040c0'];
        const fc=lv>=24?cols[(lv-24)%6]:'#e74c6f';
        for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;ctx.save();ctx.translate(0,-sH);ctx.rotate(a);
          ctx.fillStyle=fc;ctx.beginPath();ctx.ellipse(0,-(5+lv*0.18)*op*0.7,2.8+lv*0.12,(5+lv*0.18)*op,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        ctx.fillStyle='#f5e060';ctx.beginPath();ctx.arc(0,-sH,2+op,0,Math.PI*2);ctx.fill();}
      if(lv>=22){const es=Math.min(Math.floor(_mp(lv,22,30,1,5)),5);const sc=['#e74c6f','#f5a040','#d060d0','#e04060','#f07060'];
        for(let s=0;s<es;s++){const sx=(s%2===0?1:-1)*(5+s*3),sh=sH*(0.45+s*0.06);
          ctx.save();ctx.translate(sx,0);_dStem(ctx,sh,1.3,'#3d7a3d',sx>0?2:-2);
          const c=sc[s%5];for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;ctx.save();ctx.translate(0,-sh);ctx.rotate(a);
            ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,-3.5,1.8,3.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}ctx.restore();}}
      ctx.restore();
      if(lv>=19&&lv<=24)_dDew(ctx,cx-10,bY-8);
      if(lv>=25&&lv<=29)_dButterfly(ctx,cx+17+Math.sin(t/700)*4,bY-sH*0.45+Math.cos(t/900)*3,t,'#f0c080');
      if(lv>=30)_dBird(ctx,cx-12,12,'#c08040');
    }

    /* ── Sunflower 30 levels ── */
    function _drawSunflower(ctx,lv,t){
      const W=80,H=100,cx=W/2,by=H-4;_drawPot(ctx,cx,by);
      if(lv<=4){ctx.save();ctx.translate(cx,by-16);_drawSeedPhase(ctx,lv,'#4a4a4a');ctx.restore();return;}
      // ═══ LEVEL 30: SOLAR TITAN ═══
      if(lv>=30){
        // Bronze ornate pot
        ctx.fillStyle='#a07840';ctx.beginPath();ctx.moveTo(cx-15,by-16);ctx.lineTo(cx+15,by-16);ctx.lineTo(cx+12,by);ctx.lineTo(cx-12,by);ctx.closePath();ctx.fill();
        ctx.fillStyle='#b88850';ctx.fillRect(cx-17,by-21,34,6);
        ctx.fillStyle='#8a6830';ctx.beginPath();ctx.ellipse(cx,by-16,13,3,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#f5d060';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(cx-9,by-12);ctx.quadraticCurveTo(cx,by-7,cx+9,by-12);ctx.stroke();
        const bY=by-16,sH=60,sW2=6;
        // Solar aura (pulsing)
        const pulse=0.18+Math.sin(t/800)*0.06;
        ctx.save();const sg=ctx.createRadialGradient(cx,bY-sH*0.8,0,cx,bY-sH*0.8,sH*0.8);
        sg.addColorStop(0,'rgba(255,200,60,'+pulse+')');sg.addColorStop(0.3,'rgba(255,180,40,'+(pulse*0.5)+')');sg.addColorStop(0.6,'rgba(255,160,20,'+(pulse*0.2)+')');sg.addColorStop(1,'rgba(255,160,20,0)');
        ctx.fillStyle=sg;ctx.beginPath();ctx.arc(cx,bY-sH*0.8,sH*0.8,0,Math.PI*2);ctx.fill();ctx.restore();
        // Sunbeam rays
        ctx.save();ctx.translate(cx,bY-sH);
        for(let i=0;i<12;i++){const ra=(i/12)*Math.PI*2+t/3000;const rp=0.12+Math.sin(t/400+i*1.5)*0.08;
          ctx.strokeStyle='rgba(255,220,80,'+rp+')';ctx.lineWidth=3;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(Math.cos(ra)*18,Math.sin(ra)*18);ctx.lineTo(Math.cos(ra)*35,Math.sin(ra)*35);ctx.stroke();}
        ctx.restore();
        ctx.save();ctx.translate(cx,bY);
        // Massive thick textured stem
        const stG=ctx.createLinearGradient(-sW2/2,0,sW2/2,0);
        stG.addColorStop(0,'#2a5a1a');stG.addColorStop(0.5,'#3d6b2b');stG.addColorStop(1,'#2a5a1a');
        ctx.fillStyle=stG;ctx.fillRect(-sW2/2,-sH,sW2,sH);
        ctx.strokeStyle='rgba(90,140,60,0.3)';ctx.lineWidth=0.3;
        for(let i=0;i<8;i++){const sy2=-sH*0.1-i*sH/9,s2=i%2?1:-1;
          ctx.beginPath();ctx.moveTo(sW2/2*s2,sy2);ctx.lineTo((sW2/2+2)*s2,sy2-1);ctx.stroke();}
        // 6 large leaves
        for(let i=0;i<6;i++){const ly=-(sH*(0.08+i*0.12));const s=i%2===0?1:-1;const ls=14-i;
          ctx.save();ctx.translate(s*(sW2/2+1),ly);ctx.rotate(s*0.4);ctx.fillStyle='#5d9b3b';
          ctx.beginPath();ctx.ellipse(s*ls*0.5,0,ls,ls*0.42,0,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='#4d8b2b';ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(s*ls,0);ctx.stroke();ctx.restore();}
        // 3 side sunflowers on branches
        const sides=[{x:-12,y:-sH*0.55,sz:5},{x:14,y:-sH*0.4,sz:4.5},{x:-10,y:-sH*0.3,sz:4}];
        sides.forEach(function(s){
          ctx.strokeStyle='#3d6b2b';ctx.lineWidth=1.5;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(0,-sH*0.5);ctx.quadraticCurveTo(s.x*0.5,s.y,s.x,s.y);ctx.stroke();
          for(let p=0;p<8;p++){const a=(p/8)*Math.PI*2;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(a);
            ctx.fillStyle='#f5c542';ctx.beginPath();ctx.ellipse(0,-s.sz*0.8,1.2,s.sz*0.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
          ctx.fillStyle='#6b3a1a';ctx.beginPath();ctx.arc(s.x,s.y,s.sz*0.35,0,Math.PI*2);ctx.fill();});
        // MASSIVE main sunflower head
        const hR=16,pc2=40;
        for(let i=0;i<pc2;i++){const a=(i/pc2)*Math.PI*2+Math.sin(t/2000)*0.02;ctx.save();ctx.translate(0,-sH);ctx.rotate(a);
          ctx.fillStyle=i%3===0?'#e8b030':'#f5c542';ctx.beginPath();ctx.ellipse(0,-hR*0.85,2.5,hR*0.55,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        ctx.fillStyle='#5a2a0a';ctx.beginPath();ctx.arc(0,-sH,hR*0.5,0,Math.PI*2);ctx.fill();
        // Fibonacci seed pattern
        for(let i=0;i<30;i++){const a2=i*2.4,d=(i/30)*hR*0.42;
          ctx.fillStyle=i%3===0?'#3a2a1a':'#8a5a2a';ctx.beginPath();ctx.arc(Math.cos(a2)*d,-sH+Math.sin(a2)*d,0.8,0,Math.PI*2);ctx.fill();}
        // Golden ring
        ctx.strokeStyle='rgba(255,200,60,0.4)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-sH,hR+2,0,Math.PI*2);ctx.stroke();
        ctx.restore();
        // Orbiting golden particles
        for(let i=0;i<6;i++){const oa=(i/6)*Math.PI*2+t/1200;const od=22;
          const ox=cx+Math.cos(oa)*od,oy=bY-sH+Math.sin(oa)*od*0.5;
          const op2=0.4+Math.sin(t/300+i*2)*0.3;
          ctx.fillStyle='rgba(255,220,80,'+op2+')';ctx.beginPath();ctx.arc(ox,oy,2,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(255,220,80,'+(op2*0.15)+')';ctx.beginPath();ctx.arc(ox,oy,5,0,Math.PI*2);ctx.fill();}
        // 3 bees
        for(let bi=0;bi<3;bi++){const bx=cx+(bi-1)*14+Math.sin(t/400+bi*2.5)*6,bby=bY-sH*0.6+Math.cos(t/600+bi*1.8)*4+bi*5;
          _dBee(ctx,bx,bby,t);}
        _dBird(ctx,cx-10,10,'#7a8a5a');
        return;
      }
      const bY=by-16,sH=_mp(lv,5,30,8,55),sW=_mp(lv,5,30,2,5.5);
      ctx.save();ctx.translate(cx,bY);ctx.rotate(Math.sin(t/1100+lv*0.2)*(0.3+lv*0.04)*Math.PI/180);
      _dStem(ctx,sH,sW,'#3d6b2b',lv>=25?4:2);
      if(lv>=8){ctx.strokeStyle='#5a8a3b';ctx.lineWidth=0.3;const hc=Math.min(lv-7,8);
        for(let i=0;i<hc;i++){const hy=-(sH*(0.1+i*0.1)),s=i%2===0?1:-1;ctx.beginPath();ctx.moveTo(sW/2*s,hy);ctx.lineTo((sW/2+2)*s,hy-1);ctx.stroke();}}
      const lC=Math.min(Math.floor(_mp(lv,5,20,1,6)),6);
      for(let i=0;i<lC;i++){const ly=-(sH*(0.1+i*0.11));if(ly<-sH+5)break;const s=i%2===0?1:-1;const ls=_mp(lv,5,25,6,15)*(1-i*0.07);
        ctx.save();ctx.translate(s*(sW/2+1),ly);ctx.rotate(s*0.45);ctx.fillStyle='#5d9b3b';ctx.beginPath();ctx.ellipse(s*ls*0.5,0,ls,ls*0.42,0,0,Math.PI*2);ctx.fill();
        if(lv>=11){ctx.strokeStyle='#4d8b2b';ctx.lineWidth=0.4;for(let j=0;j<4;j++){ctx.beginPath();ctx.moveTo(s*(ls*0.15+j*ls*0.15),-ls*0.25);ctx.lineTo(s*(ls*0.15+j*ls*0.15+1.2),-ls*0.4);ctx.stroke();}}ctx.restore();}
      if(lv>=12&&lv<17){const hs=_mp(lv,12,16,4,10);ctx.fillStyle='#5d8b3b';ctx.beginPath();ctx.arc(0,-sH,hs,0,Math.PI*2);ctx.fill();
        if(lv>=15){ctx.fillStyle='#e8c040';for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;ctx.beginPath();ctx.arc(Math.cos(a)*hs*0.8,-sH+Math.sin(a)*hs*0.8,1.3,0,Math.PI*2);ctx.fill();}}}
      if(lv>=17){const hR=_mp(lv,17,28,6,14),op=_mp(lv,17,20,0.3,1),droop=lv>=25?_mp(lv,25,30,0,0.3):0;
        ctx.save();ctx.translate(0,-sH);ctx.rotate(droop);
        const pc=10+lv;for(let i=0;i<pc;i++){const a=(i/pc)*Math.PI*2;ctx.save();ctx.rotate(a);
          ctx.fillStyle=lv>=29?'#c8a030':'#f5c542';ctx.beginPath();ctx.ellipse(0,-hR*op*0.85,1.8+hR*0.1,hR*op*0.55,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        ctx.fillStyle='#6b3a1a';ctx.beginPath();ctx.arc(0,0,hR*0.52,0,Math.PI*2);ctx.fill();
        if(lv>=21){const sc2=Math.min((lv-20)*4,20);ctx.fillStyle=lv>=28?'#3a2a1a':'#8a5a2a';
          for(let i=0;i<sc2;i++){const a=i*2.4,d=(i/sc2)*hR*0.42;ctx.beginPath();ctx.arc(Math.cos(a)*d,Math.sin(a)*d,0.7,0,Math.PI*2);ctx.fill();}}
        ctx.restore();}
      if(lv>=29){ctx.save();ctx.translate(11,0);_dStem(ctx,7,1,'#6db85a',1);_dLeaf(ctx,3,-5,2.8,0.4,'#8ac870',false);ctx.restore();}
      ctx.restore();
      if(lv>=22&&lv<=27)_dBee(ctx,cx+12+Math.sin(t/500)*6,bY-sH*0.85+Math.cos(t/700)*4,t);
      if(lv>=30)_dBird(ctx,cx-10,10,'#7a8a5a');
    }

    /* ── Oak Tree 30 levels ── */
    function _drawTree(ctx,lv,t){
      const W=80,H=100,cx=W/2,by=H-4;
      if(lv<=4){_drawPot(ctx,cx,by);ctx.save();ctx.translate(cx,by-16);_drawSeedPhase(ctx,lv,'#6b4226');ctx.restore();return;}
      // ═══ LEVEL 30: GOLDEN WORLD TREE (completely different) ═══
      if(lv>=30){
        // Golden ornate pot
        ctx.fillStyle='#B8860B';ctx.beginPath();
        ctx.moveTo(cx-16,by-16);ctx.lineTo(cx+16,by-16);ctx.lineTo(cx+13,by);ctx.lineTo(cx-13,by);
        ctx.closePath();ctx.fill();
        ctx.fillStyle='#DAA520';ctx.fillRect(cx-18,by-20,36,5);
        ctx.fillStyle='#c8a030';ctx.beginPath();ctx.ellipse(cx,by-16,14,3,0,0,Math.PI*2);ctx.fill();
        // Gold pot decoration
        ctx.strokeStyle='#f5d060';ctx.lineWidth=0.8;
        ctx.beginPath();ctx.moveTo(cx-8,by-12);ctx.quadraticCurveTo(cx,by-8,cx+8,by-12);ctx.stroke();
        ctx.fillStyle='#f5d060';ctx.beginPath();ctx.arc(cx,by-10,1.5,0,Math.PI*2);ctx.fill();

        const bY=by-16,tH=62,tW=10;
        // Golden falling leaves — many
        const lcs=['#f5d060','#e8c040','#daa830','#ffcc44','#ffe880'];
        for(let i=0;i<8;i++){const lx=cx-20+((t/1200+i*0.35)%1)*40,ly=4+((t/1600+i*0.25)%1)*(H*0.55);
          ctx.save();ctx.translate(lx,ly);ctx.rotate(t/350+i*2);ctx.fillStyle=lcs[i%5];
          ctx.beginPath();ctx.ellipse(0,0,2.5,1.2,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        // Massive golden aura
        ctx.save();
        const gr=ctx.createRadialGradient(cx,bY-tH*0.5,0,cx,bY-tH*0.5,tH);
        gr.addColorStop(0,'rgba(255,220,80,0.28)');gr.addColorStop(0.4,'rgba(255,200,60,0.12)');gr.addColorStop(0.7,'rgba(255,200,60,0.04)');gr.addColorStop(1,'rgba(255,200,60,0)');
        ctx.fillStyle=gr;ctx.beginPath();ctx.arc(cx,bY-tH*0.5,tH,0,Math.PI*2);ctx.fill();ctx.restore();

        ctx.save();ctx.translate(cx,bY);
        // Massive elaborate roots
        ctx.strokeStyle='#8B6347';ctx.lineWidth=2.5;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(-tW/2,0);ctx.quadraticCurveTo(-tW-6,3,-tW-10,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(tW/2,0);ctx.quadraticCurveTo(tW+6,3,tW+10,0);ctx.stroke();
        ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(-tW/2+2,1);ctx.quadraticCurveTo(-tW-2,5,-tW-6,3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(tW/2-2,1);ctx.quadraticCurveTo(tW+2,5,tW+6,3);ctx.stroke();
        // Root glow
        ctx.strokeStyle='rgba(255,200,80,0.15)';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(-tW/2,0);ctx.quadraticCurveTo(-tW-6,3,-tW-10,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(tW/2,0);ctx.quadraticCurveTo(tW+6,3,tW+10,0);ctx.stroke();

        // Thick majestic trunk
        const trGrad=ctx.createLinearGradient(-tW/2,0,tW/2,0);
        trGrad.addColorStop(0,'#5a3216');trGrad.addColorStop(0.3,'#7a5230');trGrad.addColorStop(0.5,'#8a6240');trGrad.addColorStop(0.7,'#7a5230');trGrad.addColorStop(1,'#5a3216');
        ctx.fillStyle=trGrad;ctx.fillRect(-tW/2,-tH,tW,tH);
        // Bark detail
        ctx.strokeStyle='#4a2a12';ctx.lineWidth=0.6;
        for(let i=0;i<7;i++){const bx=-tW/2+1.5+(i/7)*(tW-3);ctx.beginPath();ctx.moveTo(bx,-tH+8);ctx.lineTo(bx+0.5,-4);ctx.stroke();}
        // Glowing golden veins on trunk
        ctx.strokeStyle='rgba(255,200,80,0.3)';ctx.lineWidth=1;ctx.lineCap='round';
        const vp=Math.sin(t/1000)*0.15;
        ctx.beginPath();ctx.moveTo(-1,0);ctx.quadraticCurveTo(-3,-tH*0.3,0,-tH*0.6);ctx.quadraticCurveTo(2,-tH*0.8,0,-tH);ctx.stroke();
        ctx.strokeStyle='rgba(255,200,80,'+(0.15+vp)+')';ctx.lineWidth=0.6;
        ctx.beginPath();ctx.moveTo(2,-5);ctx.quadraticCurveTo(3,-tH*0.4,-1,-tH*0.7);ctx.stroke();
        // Knot with glow
        ctx.fillStyle='#5a3216';ctx.beginPath();ctx.ellipse(tW*0.2,-tH*0.35,2,1.5,0.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,200,80,0.15)';ctx.beginPath();ctx.ellipse(tW*0.2,-tH*0.35,3,2.5,0.3,0,Math.PI*2);ctx.fill();

        // 8 majestic branches (more than lv29)
        for(let b=0;b<8;b++){const bh=tH*(0.35+b*0.07),s=b%2===0?1:-1,bl=12+b*1.8;
          ctx.strokeStyle='#6b4226';ctx.lineWidth=2.5-(b*0.2);ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(0,-bh);ctx.quadraticCurveTo(s*bl*0.7,-bh-bl*0.3,s*bl,-bh-bl*0.5);ctx.stroke();}
        // Massive 6-layer golden canopy
        const canopyColors=['#f5d060','#e8c040','#daa830','#c89020','#eabb35','#f0cc50'];
        for(let i=5;i>=0;i--){const cy=-tH-(i*(4+lv*0.2)),cr=22-i*2.8;
          ctx.fillStyle=canopyColors[i%6];ctx.beginPath();ctx.arc(0,cy,cr,0,Math.PI*2);ctx.fill();
          // Soft glow layer
          ctx.fillStyle='rgba(255,240,180,0.08)';ctx.beginPath();ctx.arc(0,cy,cr*1.3,0,Math.PI*2);ctx.fill();}
        // Hanging golden vines
        ctx.strokeStyle='rgba(200,180,80,0.5)';ctx.lineWidth=0.8;
        for(let i=0;i<6;i++){const vx=(i-2.5)*7,vy=-tH-4;
          ctx.beginPath();ctx.moveTo(vx,vy);ctx.quadraticCurveTo(vx+Math.sin(t/800+i)*2,vy+10+i*2,vx+Math.sin(t/600+i)*3,vy+15+i*3);ctx.stroke();}
        // Golden fruits (larger, glowing)
        for(let i=0;i<7;i++){
          const fx=(i%2?1:-1)*(4+i*2.5),fy=-tH-3+i*2.2;
          ctx.fillStyle='rgba(255,220,80,0.2)';ctx.beginPath();ctx.arc(fx,fy,4.5,0,Math.PI*2);ctx.fill();
          _dBerry(ctx,fx,fy,3,'#f5d060');}
        // Sparkle star particles in canopy
        for(let i=0;i<12;i++){
          const sx=-22+((t/1500+i*0.42)%1)*44,sy=-tH-20+((t/1800+i*0.63)%1)*35;
          const ss=0.4+Math.sin(t/250+i*1.8)*0.4;ctx.fillStyle='rgba(255,230,100,'+(ss*0.8)+')';
          const sz=1+ss*1.2;ctx.beginPath();ctx.moveTo(sx,sy-sz);ctx.lineTo(sx+sz*0.3,sy-sz*0.3);ctx.lineTo(sx+sz,sy);
          ctx.lineTo(sx+sz*0.3,sy+sz*0.3);ctx.lineTo(sx,sy+sz);ctx.lineTo(sx-sz*0.3,sy+sz*0.3);
          ctx.lineTo(sx-sz,sy);ctx.lineTo(sx-sz*0.3,sy-sz*0.3);ctx.closePath();ctx.fill();}
        // Nest (bigger)
        ctx.fillStyle='#a08a60';ctx.beginPath();ctx.ellipse(10,-tH*0.55,6,3.5,0,0,Math.PI);ctx.fill();
        ctx.strokeStyle='#8a7a50';ctx.lineWidth=0.5;
        ctx.beginPath();ctx.moveTo(5,-tH*0.55);ctx.lineTo(6.5,-tH*0.55+1);ctx.lineTo(8.5,-tH*0.55);ctx.lineTo(10,-tH*0.55+1);ctx.lineTo(12,-tH*0.55);ctx.lineTo(14,-tH*0.55+1);ctx.stroke();
        // Eggs in nest
        ctx.fillStyle='#f0e8d8';ctx.beginPath();ctx.ellipse(9,-tH*0.55-1.5,1.5,2,0.1,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(11.5,-tH*0.55-1,1.3,1.8,-0.1,0,Math.PI*2);ctx.fill();
        ctx.restore();
        // Crown star at tree top — large and pulsing
        ctx.save();ctx.translate(cx,bY-tH-28);
        ctx.fillStyle='rgba(255,220,80,0.15)';ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();
        const sp=0.65+Math.sin(t/500)*0.2;
        ctx.fillStyle='rgba(255,220,80,'+sp+')';ctx.beginPath();
        for(let i=0;i<5;i++){const a=(i*4*Math.PI/5)-Math.PI/2;const ir=a+Math.PI/5;
          ctx.lineTo(Math.cos(a)*7,Math.sin(a)*7);ctx.lineTo(Math.cos(ir)*2.8,Math.sin(ir)*2.8);}
        ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(255,240,180,0.6)';ctx.beginPath();ctx.arc(0,0,2.5,0,Math.PI*2);ctx.fill();
        // Star rays
        ctx.strokeStyle='rgba(255,220,80,'+(sp*0.3)+')';ctx.lineWidth=0.8;
        for(let i=0;i<8;i++){const ra=(i/8)*Math.PI*2;ctx.beginPath();ctx.moveTo(Math.cos(ra)*8,Math.sin(ra)*8);ctx.lineTo(Math.cos(ra)*14,Math.sin(ra)*14);ctx.stroke();}
        ctx.restore();
        // Enhanced owl — large, detailed
        ctx.save();ctx.translate(cx-12,bY-tH-8);
        // Body
        ctx.fillStyle='#8a7a5a';ctx.beginPath();ctx.ellipse(0,3,6.5,8,0,0,Math.PI*2);ctx.fill();
        // Wing feather detail
        ctx.fillStyle='#7a6a4a';ctx.beginPath();ctx.ellipse(-5,4,3.5,7,0.2,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(5,4,3.5,7,-0.2,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(100,80,50,0.2)';ctx.lineWidth=0.4;
        for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(-5,2+i*2.5,2.5-i*0.5,1.5,0.1,0,Math.PI*2);ctx.stroke();
          ctx.beginPath();ctx.ellipse(5,2+i*2.5,2.5-i*0.5,1.5,-0.1,0,Math.PI*2);ctx.stroke();}
        // Head
        ctx.fillStyle='#9a8a6a';ctx.beginPath();ctx.arc(0,-3,5.5,0,Math.PI*2);ctx.fill();
        // Facial disc
        ctx.fillStyle='#c8b888';ctx.beginPath();ctx.arc(-2.5,-3,2.8,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(2.5,-3,2.8,0,Math.PI*2);ctx.fill();
        // Eyes — big golden with animated glow
        ctx.fillStyle='#f0e060';ctx.beginPath();ctx.arc(-2.5,-3,2,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(2.5,-3,2,0,Math.PI*2);ctx.fill();
        const eg=0.35+Math.sin(t/400)*0.2;
        ctx.fillStyle='rgba(255,220,80,'+eg+')';ctx.beginPath();ctx.arc(-2.5,-3,3.2,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(2.5,-3,3.2,0,Math.PI*2);ctx.fill();
        // Pupils
        ctx.fillStyle='#000';ctx.beginPath();ctx.arc(-2.5,-3,0.7,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(2.5,-3,0.7,0,Math.PI*2);ctx.fill();
        // Beak
        ctx.fillStyle='#c8a050';ctx.beginPath();ctx.moveTo(-1.2,-0.5);ctx.lineTo(0,2.5);ctx.lineTo(1.2,-0.5);ctx.closePath();ctx.fill();
        // Ear tufts — tall
        ctx.fillStyle='#7a6a4a';ctx.beginPath();ctx.moveTo(-4,-6);ctx.lineTo(-3.5,-11);ctx.lineTo(-1.5,-6);ctx.closePath();ctx.fill();
        ctx.beginPath();ctx.moveTo(1.5,-6);ctx.lineTo(3.5,-11);ctx.lineTo(4,-6);ctx.closePath();ctx.fill();
        // Chest pattern
        ctx.fillStyle='rgba(200,180,130,0.3)';ctx.beginPath();ctx.ellipse(0,5,3,4,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(100,80,50,0.2)';for(let i=0;i<6;i++){ctx.beginPath();ctx.arc(-1.5+i*0.6,4+i*0.4,0.5,0,Math.PI*2);ctx.fill();}
        // Feet
        ctx.strokeStyle='#c8a050';ctx.lineWidth=0.7;
        ctx.beginPath();ctx.moveTo(-2,10);ctx.lineTo(-4,12);ctx.moveTo(-2,10);ctx.lineTo(-1,12);ctx.moveTo(-2,10);ctx.lineTo(-3,12);ctx.stroke();
        ctx.beginPath();ctx.moveTo(2,10);ctx.lineTo(0,12);ctx.moveTo(2,10);ctx.lineTo(3,12);ctx.moveTo(2,10);ctx.lineTo(4,12);ctx.stroke();
        ctx.restore();
        // Rainbow arc behind tree
        ctx.save();
        const rbCx=cx,rbCy=bY-tH*0.3,rbR=tH*0.7;
        const rbCols=['rgba(255,80,80,0.12)','rgba(255,160,60,0.12)','rgba(255,230,60,0.12)','rgba(80,200,80,0.12)','rgba(80,140,255,0.12)','rgba(160,80,220,0.12)'];
        for(let i=0;i<6;i++){ctx.strokeStyle=rbCols[i];ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(rbCx,rbCy,rbR-i*3,Math.PI*1.05,Math.PI*1.95);ctx.stroke();}
        ctx.restore();
        // Mushrooms at pot base
        ctx.save();ctx.translate(cx-16,bY+2);
        ctx.fillStyle='#dc6040';ctx.beginPath();ctx.ellipse(0,-3,4,2.5,0,0,Math.PI);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-1.5,-3.5,0.7,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(1.5,-2.8,0.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#e0d8c0';ctx.fillRect(-1,0,2,-3);
        ctx.restore();
        ctx.save();ctx.translate(cx+18,bY+1);
        ctx.fillStyle='#c05030';ctx.beginPath();ctx.ellipse(0,-2.5,3,2,0,0,Math.PI);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-1,-3,0.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(1,-2.2,0.4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#e0d8c0';ctx.fillRect(-0.8,0,1.6,-2.5);
        ctx.restore();
        // Squirrel on trunk
        ctx.save();ctx.translate(cx+tW/2+3,bY-tH*0.3);
        ctx.fillStyle='#b87040';ctx.beginPath();ctx.ellipse(0,0,3.5,2.5,0.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c88050';ctx.beginPath();ctx.arc(3,-1.5,2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(4,-1.8,0.6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#000';ctx.beginPath();ctx.arc(4.3,-1.8,0.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#b87040';ctx.beginPath();ctx.moveTo(-3,0);ctx.quadraticCurveTo(-5,-4,-2,-5);ctx.quadraticCurveTo(-1,-3,-3,0);ctx.fill();
        ctx.restore();
        // Fireflies around the whole tree (12 enhanced)
        for(let i=0;i<12;i++){
          const fx=cx-22+Math.sin(t/700+i*1.1)*22,fy=bY-4-i*6.5+Math.cos(t/500+i*1.7)*4;
          const fa=0.3+Math.sin(t/300+i*2.2)*0.35;
          ctx.fillStyle='rgba(255,230,100,'+fa+')';ctx.beginPath();ctx.arc(fx,fy,1.5,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(255,230,100,'+(fa*0.25)+')';ctx.beginPath();ctx.arc(fx,fy,5,0,Math.PI*2);ctx.fill();}
        return;
      }
      // ═══ LEVELS 5-29: normal tree ═══
      _drawPot(ctx,cx,by);
      const bY=by-16,tH=_mp(lv,5,30,6,48),tW=_mp(lv,5,30,2,7.5);
      if(lv>=26){const lcs=['#c8a030','#cc6644','#aa4030','#88aa40'];
        for(let i=0;i<lv-25;i++){const lx=cx-15+((t/1500+i*0.4)%1)*30,ly=12+((t/2000+i*0.3)%1)*(H*0.4);
          ctx.save();ctx.translate(lx,ly);ctx.rotate(t/400+i*2);ctx.fillStyle=lcs[i%4];ctx.beginPath();ctx.ellipse(0,0,2.2,1,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
      ctx.save();ctx.translate(cx,bY);ctx.rotate(Math.sin(t/1200)*0.3*Math.PI/180);
      ctx.fillStyle='#6b4226';ctx.fillRect(-tW/2,-tH,tW,tH);
      if(lv>=11){ctx.strokeStyle='#5a3216';ctx.lineWidth=0.5;const bl=Math.min(lv-10,6);
        for(let i=0;i<bl;i++){const bx=-tW/2+1+(i/bl)*(tW-2);ctx.beginPath();ctx.moveTo(bx,-tH+5);ctx.lineTo(bx+0.5,-3);ctx.stroke();}}
      if(lv>=16){ctx.fillStyle='#5a3216';ctx.beginPath();ctx.ellipse(tW*0.2,-tH*0.4,1.4,1,0.3,0,Math.PI*2);ctx.fill();}
      if(lv>=13){ctx.strokeStyle='#6b4226';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(-tW/2,0);ctx.quadraticCurveTo(-tW-3,2,-tW-5,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(tW/2,0);ctx.quadraticCurveTo(tW+3,2,tW+5,0);ctx.stroke();}
      const bc=Math.min(Math.floor(_mp(lv,6,20,1,6)),6);
      for(let b=0;b<bc;b++){const bh=tH*(0.5+b*0.08),s=b%2===0?1:-1,bl=_mp(lv,6,25,4,11+b*1.3);
        ctx.strokeStyle='#6b4226';ctx.lineWidth=1+(6-b)*0.25;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,-bh);ctx.quadraticCurveTo(s*bl*0.7,-bh-bl*0.3,s*bl,-bh-bl*0.5);ctx.stroke();}
      if(lv>=8){const layers=Math.min(Math.floor(_mp(lv,8,22,1,4)),4);
        for(let i=layers-1;i>=0;i--){const cy=-tH-(i*(3.5+lv*0.28)),cr=_mp(lv,8,28,6,17-i*2.5);
          ctx.fillStyle=lv>=26?['#8aaa40','#c8a030','#cc6644','#aa3030'][i%4]:_shade('#2d8a4e',-i*12);
          ctx.beginPath();ctx.arc(0,cy,cr,0,Math.PI*2);ctx.fill();}}
      if(lv>=20&&lv<=24){ctx.fillStyle='#f0e0a0';for(let i=0;i<lv-19;i++){ctx.beginPath();ctx.arc(Math.cos(i*2.5)*9,-tH-5+Math.sin(i*3)*5,1.3,0,Math.PI*2);ctx.fill();}}
      if(lv>=22&&lv<=28){ctx.strokeStyle='#5aaa5a';ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(-tW/2,-5);
        for(let i=0;i<4;i++)ctx.quadraticCurveTo((i%2?1:-1)*(tW/2+3),-5-(i+0.5)*tH/5,(i%2?-1:1)*tW/4,-5-(i+1)*tH/5);
        ctx.stroke();for(let i=0;i<3;i++){ctx.fillStyle='#7aba6a';ctx.beginPath();ctx.ellipse((i%2?1:-1)*3,-tH*0.2-i*7,1.8,0.9,0,0,Math.PI*2);ctx.fill();}}
      if(lv>=19){ctx.fillStyle='#8a7a5a';ctx.beginPath();ctx.ellipse(7,-tH*0.68,4.5,2.5,0,0,Math.PI);ctx.fill();
        ctx.strokeStyle='#6a5a3a';ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(3.5,-tH*0.68);ctx.lineTo(4.5,-tH*0.68+1);ctx.lineTo(6,-tH*0.68);ctx.lineTo(7,-tH*0.68+1);ctx.lineTo(9,-tH*0.68);ctx.stroke();}
      if(lv>=25&&lv<=29){const fc=Math.min(lv-24,5);for(let i=0;i<fc;i++)_dBerry(ctx,(i%2?1:-1)*(4+i*2.8),-tH-2.5+i*1.8,2.2,'#8a6a30');}
      ctx.restore();
      if(lv>=24)_dBird(ctx,cx+9,bY-tH*0.73,'#6a5a4a');
    }

    /* ── Cherry Blossom 30 levels ── */
    function _drawCherry(ctx,lv,t){
      const W=80,H=100,cx=W/2,by=H-4;_drawPot(ctx,cx,by);
      if(lv<=4){ctx.save();ctx.translate(cx,by-16);_drawSeedPhase(ctx,lv,'#8a4020');ctx.restore();return;}
      // ═══ LEVEL 30: SAKURA SPIRIT ═══
      if(lv>=30){
        // Red lacquer pot with gold trim
        ctx.fillStyle='#8a2020';ctx.beginPath();ctx.moveTo(cx-15,by-16);ctx.lineTo(cx+15,by-16);ctx.lineTo(cx+12,by);ctx.lineTo(cx-12,by);ctx.closePath();ctx.fill();
        ctx.fillStyle='#aa3030';ctx.fillRect(cx-17,by-21,34,6);
        ctx.fillStyle='#6a1818';ctx.beginPath();ctx.ellipse(cx,by-16,13,3,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#f5d060';ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(cx-9,by-13);ctx.lineTo(cx-9,by-5);ctx.stroke();
        ctx.beginPath();ctx.moveTo(cx+9,by-13);ctx.lineTo(cx+9,by-5);ctx.stroke();
        ctx.beginPath();ctx.moveTo(cx-6,by-12);ctx.quadraticCurveTo(cx,by-7,cx+6,by-12);ctx.stroke();
        const bY=by-16,tH2=55,tW2=5.5;
        // Cascading sakura petals (many)
        for(let i=0;i<14;i++){const px=cx-28+((t/1300+i*0.25)%1)*56,py=1+((t/1500+i*0.18)%1)*(H*0.6);
          ctx.save();ctx.translate(px,py);ctx.rotate(t/300+i*1.8);
          ctx.fillStyle=i%3===0?'#fff0f4':'#f5a0c0';ctx.globalAlpha=0.55;
          ctx.beginPath();ctx.ellipse(0,0,2.2,1,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.restore();}
        // Pink ethereal aura
        ctx.save();const pg=ctx.createRadialGradient(cx,bY-tH2*0.5,0,cx,bY-tH2*0.5,tH2*0.9);
        pg.addColorStop(0,'rgba(245,160,200,0.2)');pg.addColorStop(0.4,'rgba(240,140,190,0.08)');pg.addColorStop(1,'rgba(240,140,190,0)');
        ctx.fillStyle=pg;ctx.beginPath();ctx.arc(cx,bY-tH2*0.5,tH2*0.9,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.translate(cx,bY);
        // Elegant dark trunk with bark
        const tkG=ctx.createLinearGradient(-tW2/2,0,tW2/2,0);
        tkG.addColorStop(0,'#3a1a10');tkG.addColorStop(0.5,'#5a3020');tkG.addColorStop(1,'#3a1a10');
        ctx.fillStyle=tkG;ctx.fillRect(-tW2/2,-tH2,tW2,tH2);
        ctx.strokeStyle='#2a1008';ctx.lineWidth=0.5;
        for(let i=0;i<5;i++){const bx2=-tW2/2+1+(i/5)*(tW2-2);ctx.beginPath();ctx.moveTo(bx2,-tH2+5);ctx.lineTo(bx2+0.3,-3);ctx.stroke();}
        // Roots
        ctx.strokeStyle='#5a3020';ctx.lineWidth=1.5;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(-tW2/2,0);ctx.quadraticCurveTo(-tW2-4,2,-tW2-7,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(tW2/2,0);ctx.quadraticCurveTo(tW2+4,2,tW2+7,0);ctx.stroke();
        // 7 elegant branches
        for(let b=0;b<7;b++){const bh=tH2*(0.35+b*0.08),s=b%2===0?1:-1,bl2=12+b*1.5;
          ctx.strokeStyle='#5a3020';ctx.lineWidth=1.8-b*0.15;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(0,-bh);ctx.quadraticCurveTo(s*bl2*0.8,-bh-bl2*0.1,s*bl2,-bh-bl2*0.3);ctx.stroke();
          if(b<4){ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(s*bl2*0.6,-bh-bl2*0.15);ctx.lineTo(s*(bl2*0.6+4),-bh-bl2*0.4);ctx.stroke();}}
        // Massive 3-layer blossom canopy
        const crs=[22,18,14];const cops=['rgba(245,180,210,0.5)','rgba(255,190,220,0.45)','rgba(250,170,200,0.4)'];
        for(let i=2;i>=0;i--){ctx.fillStyle=cops[i];ctx.beginPath();ctx.arc(0,-tH2-(i*4),crs[i],0,Math.PI*2);ctx.fill();
          if(i<2){ctx.beginPath();ctx.arc(-5,-tH2-5-(i*4),crs[i]*0.6,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(6,-tH2+1-(i*4),crs[i]*0.55,0,Math.PI*2);ctx.fill();}}
        // Detailed blossoms throughout canopy
        for(let i=0;i<20;i++){const bx3=Math.cos(i*1.9+t/5000)*18,bby=-tH2-3+Math.sin(i*1.3+t/6000)*16;
          for(let p=0;p<5;p++){const pa3=(p/5)*Math.PI*2+i*0.6;
            ctx.fillStyle=i%3===0?'#fff0f4':'#f5a0c0';ctx.save();ctx.translate(bx3,bby);ctx.rotate(pa3);
            ctx.beginPath();ctx.ellipse(0,-2.5,1.4,2.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
          ctx.fillStyle='#e0c040';ctx.beginPath();ctx.arc(bx3,bby,0.8,0,Math.PI*2);ctx.fill();}
        // Paper lantern hanging from branch
        ctx.save();ctx.translate(14,-tH2*0.5);
        ctx.strokeStyle='#4a3020';ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(0,0);ctx.stroke();
        const lg=ctx.createRadialGradient(0,3,0,0,3,5);lg.addColorStop(0,'rgba(255,100,60,0.9)');lg.addColorStop(1,'rgba(200,50,30,0.8)');
        ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(0,3,3.5,5,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,160,100,'+(0.15+Math.sin(t/500)*0.08)+')';ctx.beginPath();ctx.arc(0,3,8,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(150,40,20,0.4)';ctx.lineWidth=0.3;
        ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(0,8);ctx.stroke();ctx.beginPath();ctx.moveTo(-3.5,3);ctx.lineTo(3.5,3);ctx.stroke();
        ctx.fillStyle='#4a3020';ctx.fillRect(-2,-2.5,4,1.2);ctx.fillRect(-1.5,7.5,3,1);
        ctx.restore();
        // Cherries on branches
        for(let i=0;i<8;i++){const chx=Math.cos(i*2.1)*(8+i*1.2),chy=-tH2*0.55+Math.sin(i*1.5)*7;
          ctx.strokeStyle='#3a6a20';ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(chx,chy-2.5);ctx.lineTo(chx,chy);ctx.stroke();
          _dBerry(ctx,chx,chy,2.2,'#cc2040');}
        ctx.restore();
        // Crane bird
        ctx.save();ctx.translate(cx-14,bY-tH2*0.3);
        ctx.fillStyle='#f0ece0';ctx.beginPath();ctx.ellipse(0,0,5,3,0.1,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(4,-2.5,2.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#cc2020';ctx.beginPath();ctx.arc(4,-3.5,1,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#000';ctx.beginPath();ctx.arc(5,-2.5,0.4,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#f0ece0';ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(-4,-1);ctx.lineTo(-8,-4);ctx.lineTo(-6,1);ctx.stroke();
        ctx.fillStyle='#4a4a40';ctx.beginPath();ctx.moveTo(5.5,-1.5);ctx.lineTo(8.5,-1.2);ctx.lineTo(5.5,-0.5);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#4a4a40';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(-1,3);ctx.lineTo(-2,7);ctx.moveTo(1,3);ctx.lineTo(2,7);ctx.stroke();
        ctx.restore();
        // Sparkle particles
        for(let i=0;i<6;i++){const sx=cx-15+Math.sin(t/700+i*1.5)*14,sy=bY-8-i*8+Math.cos(t/500+i*2.2)*3;
          const sa=0.25+Math.sin(t/350+i*2.5)*0.3;ctx.fillStyle='rgba(255,200,220,'+sa+')';
          ctx.beginPath();ctx.arc(sx,sy,1.5,0,Math.PI*2);ctx.fill();}
        return;
      }
      const bY=by-16,tH=_mp(lv,5,30,5,45),tW=_mp(lv,5,30,1.5,5);
      if(lv>=21)_dPetals(ctx,W,H,t,Math.min(lv-20,6),'#f5b0c8');
      ctx.save();ctx.translate(cx,bY);ctx.rotate(Math.sin(t/1000)*0.4*Math.PI/180);
      ctx.fillStyle='#5a3020';ctx.fillRect(-tW/2,-tH,tW,tH);
      const bc=Math.min(Math.floor(_mp(lv,6,18,1,6)),6);
      for(let b=0;b<bc;b++){const bh=tH*(0.4+b*0.09),s=b%2===0?1:-1,bl=_mp(lv,6,22,5,14);
        ctx.strokeStyle='#5a3020';ctx.lineWidth=1.2;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,-bh);ctx.quadraticCurveTo(s*bl*0.8,-bh-bl*0.1,s*bl,-bh-bl*0.3);ctx.stroke();
        if(lv>=9&&b<3){ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(s*bl*0.6,-bh-bl*0.15);ctx.lineTo(s*(bl*0.6+4),-bh-bl*0.4);ctx.stroke();}}
      if(lv>=9&&lv<14){const cR=_mp(lv,9,13,7,14);ctx.fillStyle='#3a9e5a';ctx.beginPath();ctx.arc(0,-tH-2,cR,0,Math.PI*2);ctx.fill();
        if(cR>11){ctx.fillStyle=_shade('#3a9e5a',-15);ctx.beginPath();ctx.arc(-3.5,-tH-4.5,cR*0.65,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(4.5,-tH,cR*0.55,0,Math.PI*2);ctx.fill();}}
      if(lv>=23){const cR=_mp(lv,23,30,14,21);ctx.fillStyle='rgba(245,160,200,0.45)';ctx.beginPath();ctx.arc(0,-tH-2,cR,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,180,210,0.35)';ctx.beginPath();ctx.arc(-4,-tH-5,cR*0.6,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(5,-tH,cR*0.55,0,Math.PI*2);ctx.fill();}
      if(lv>=14&&lv<17){const bn=(lv-13)*4;ctx.fillStyle='#e8a0b0';for(let i=0;i<bn;i++){ctx.beginPath();ctx.arc(Math.cos(i*2.3)*9,-tH-3+Math.sin(i*3)*5.5,1.3,0,Math.PI*2);ctx.fill();}}
      if(lv>=17){const bn2=Math.floor(_mp(lv,17,22,4,18)),bR=_mp(lv,17,22,7,17);
        for(let i=0;i<bn2;i++){const bx=Math.cos(i*2.3+t/5000)*bR,bby=-tH-3+Math.sin(i*1.7+t/6000)*bR*0.7;
          for(let p=0;p<5;p++){const pa=(p/5)*Math.PI*2+i*0.5;ctx.fillStyle=(i+lv)%3===0?'#fff0f4':'#f5a0c0';
            ctx.beginPath();ctx.ellipse(bx+Math.cos(pa)*2.2,bby+Math.sin(pa)*2.2,1.6,0.9,pa,0,0,Math.PI*2);ctx.fill();}
          ctx.fillStyle='#e0c040';ctx.beginPath();ctx.arc(bx,bby,0.7,0,Math.PI*2);ctx.fill();}}
      if(lv>=20){ctx.fillStyle='rgba(245,160,192,'+(lv<=22?'0.28':lv<=25?'0.22':'0.18')+')';ctx.beginPath();ctx.arc(0,-tH-4,_mp(lv,20,30,14,22),0,Math.PI*2);ctx.fill();}
      if(lv>=25){const cn=Math.min(lv-24,8);for(let i=0;i<cn;i++){
        const chx=Math.cos(i*2.1)*(7+i*1.3),chy=-tH*0.58+Math.sin(i*1.5)*7;
        ctx.strokeStyle='#3a6a20';ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(chx,chy-2.5);ctx.lineTo(chx,chy);ctx.stroke();
        _dBerry(ctx,chx,chy,lv>=28?2.2:1.6,lv>=27?'#cc2040':'#80aa40');}}
      ctx.restore();
      if(lv>=29)_dBird(ctx,cx+11,bY-tH*0.5,'#e08040');
    }

    /* ── Cactus 30 levels ── */
    function _drawCactus(ctx,lv,t){
      const W=80,H=100,cx=W/2,by=H-4;_drawPot(ctx,cx,by);
      if(lv<=4){ctx.save();ctx.translate(cx,by-16);_drawSeedPhase(ctx,lv,'#2a5a30');ctx.restore();return;}
      // ═══ LEVEL 30: DESERT EMPEROR ═══
      if(lv>=30){
        // Turquoise tile pot
        ctx.fillStyle='#308888';ctx.beginPath();ctx.moveTo(cx-15,by-16);ctx.lineTo(cx+15,by-16);ctx.lineTo(cx+12,by);ctx.lineTo(cx-12,by);ctx.closePath();ctx.fill();
        ctx.fillStyle='#40a0a0';ctx.fillRect(cx-17,by-21,34,6);
        ctx.fillStyle='#207070';ctx.beginPath();ctx.ellipse(cx,by-16,13,3,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=0.4;
        for(let i=0;i<5;i++){const tx=cx-12+i*6;ctx.strokeRect(tx,by-14,5,4);ctx.strokeRect(tx+3,by-10,5,4);}
        const bY=by-16,cH2=52,cW2=14;
        // Warm amber desert aura
        ctx.save();const dg=ctx.createRadialGradient(cx,bY-cH2*0.4,0,cx,bY-cH2*0.4,cH2*0.8);
        dg.addColorStop(0,'rgba(255,180,80,0.15)');dg.addColorStop(0.5,'rgba(255,160,60,0.06)');dg.addColorStop(1,'rgba(255,160,60,0)');
        ctx.fillStyle=dg;ctx.beginPath();ctx.arc(cx,bY-cH2*0.4,cH2*0.8,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.translate(cx,bY);
        // Majestic main body with gradient
        const cbG=ctx.createLinearGradient(-cW2/2,0,cW2/2,0);
        cbG.addColorStop(0,'#1a5a2a');cbG.addColorStop(0.3,'#2d7a3a');cbG.addColorStop(0.5,'#359040');cbG.addColorStop(0.7,'#2d7a3a');cbG.addColorStop(1,'#1a5a2a');
        ctx.fillStyle=cbG;_rRect(ctx,-cW2/2,-cH2,cW2,cH2,Math.min(cW2/2,7));
        ctx.fillStyle='rgba(100,200,120,0.12)';ctx.fillRect(-cW2/4,-cH2+4,cW2/2,cH2-8);
        ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=0.7;
        for(let i=0;i<6;i++){const rx=-cW2/2+(cW2/7)*(i+1);ctx.beginPath();ctx.moveTo(rx,-cH2+5);ctx.lineTo(rx,-3);ctx.stroke();}
        // Golden spines
        ctx.strokeStyle='#f0d060';ctx.lineWidth=0.4;
        for(let r=0;r<8;r++){const sy=-cH2*(0.1+r*0.11);
          ctx.beginPath();ctx.moveTo(-cW2/2,sy);ctx.lineTo(-cW2/2-4,sy-1.5);ctx.stroke();
          ctx.beginPath();ctx.moveTo(-cW2/2,sy);ctx.lineTo(-cW2/2-3,sy+2);ctx.stroke();
          ctx.beginPath();ctx.moveTo(cW2/2,sy);ctx.lineTo(cW2/2+4,sy-1.5);ctx.stroke();
          ctx.beginPath();ctx.moveTo(cW2/2,sy);ctx.lineTo(cW2/2+3,sy+2);ctx.stroke();}
        // 4 arms
        const arms=[{x2:-1,y2:-cH2*0.55,h2:20,w2:7,dir2:-1},{x2:1,y2:-cH2*0.4,h2:16,w2:6.5,dir2:1},
          {x2:-1,y2:-cH2*0.35,h2:12,w2:6,dir2:-1},{x2:1,y2:-cH2*0.65,h2:10,w2:5,dir2:1}];
        arms.forEach(function(a,ai){
          ctx.save();ctx.translate(a.dir2*(cW2/2),a.y2);
          ctx.fillStyle=ai%2===0?'#2d7a3a':'#257a34';_rRect(ctx,a.dir2>0?0:-a.w2,-a.h2/2,a.w2,a.h2,3);
          if(ai<2){ctx.fillStyle='#2a7030';_rRect(ctx,a.dir2>0?0:-a.w2*0.8,-a.h2,a.w2*0.8,a.h2*0.6,3);}
          ctx.restore();});
        // Crown of 5 multicolored flowers
        const fcs3=['#f5c5d0','#ff6b9d','#f0e060','#ff8060','#e060e0'];
        const fpos=[[0,-cH2],[-cW2/2-4,-cH2*0.55-12],[cW2/2+4,-cH2*0.4-10],[-cW2/2-4,-cH2*0.35-8],[cW2/2+3,-cH2*0.65-6]];
        fpos.forEach(function(fp,fi){
          for(let p=0;p<7;p++){const pa4=(p/7)*Math.PI*2+Math.sin(t/1000+fi)*0.05;
            ctx.save();ctx.translate(fp[0],fp[1]);ctx.rotate(pa4);ctx.fillStyle=fcs3[fi%5];
            ctx.beginPath();ctx.ellipse(0,-4,1.8,4,0,0,Math.PI*2);ctx.fill();ctx.restore();}
          ctx.fillStyle='#ffe066';ctx.beginPath();ctx.arc(fp[0],fp[1],2.2,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='rgba(255,200,100,'+(0.08+Math.sin(t/600+fi*1.5)*0.04)+')';ctx.beginPath();ctx.arc(fp[0],fp[1],6,0,Math.PI*2);ctx.fill();});
        // Companion cacti at base
        ctx.fillStyle='#3da84e';_rRect(ctx,-cW2/2-8,-6,3.5,6,2);_rRect(ctx,cW2/2+5,-8,4,8,2);
        // Rocks
        ctx.fillStyle='#a89880';ctx.beginPath();ctx.ellipse(-13,-1,3,2,0.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#989080';ctx.beginPath();ctx.ellipse(15,-1,2,1.5,-0.1,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#b0a890';ctx.beginPath();ctx.ellipse(-8,0,2,1.2,0,0,Math.PI*2);ctx.fill();
        ctx.restore();
        // Lizard on the side
        ctx.save();ctx.translate(cx+cW2/2+3,bY-cH2*0.25);
        ctx.fillStyle='#8a9a60';ctx.beginPath();ctx.ellipse(0,0,4,2,0.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#7a8a50';ctx.beginPath();ctx.arc(4,-1,1.8,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#000';ctx.beginPath();ctx.arc(4.8,-1.3,0.4,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#8a9a60';ctx.lineWidth=1;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-4,0);ctx.quadraticCurveTo(-7,2,-9,0);ctx.stroke();
        ctx.strokeStyle='#7a8a50';ctx.lineWidth=0.5;
        ctx.beginPath();ctx.moveTo(-1,2);ctx.lineTo(-2,4);ctx.moveTo(1,2);ctx.lineTo(2,4);ctx.stroke();
        ctx.restore();
        // Desert sparkle particles
        for(let i=0;i<6;i++){const sx=cx-14+Math.sin(t/800+i*1.4)*12,sy=bY-6-i*8+Math.cos(t/600+i*2)*3;
          const sa=0.2+Math.sin(t/350+i*2)*0.25;ctx.fillStyle='rgba(255,200,120,'+sa+')';
          ctx.beginPath();ctx.arc(sx,sy,1.3,0,Math.PI*2);ctx.fill();}
        _dBird(ctx,cx-cW2/2-8,bY-cH2-12,'#c89060');
        return;
      }
      const bY=by-16,cH=_mp(lv,5,30,8,48),cW=_mp(lv,5,30,5,13);
      ctx.save();ctx.translate(cx,bY);
      ctx.fillStyle=lv>=24?'#1a5a2a':'#2d7a3a';_rRect(ctx,-cW/2,-cH,cW,cH,Math.min(cW/2,6));
      ctx.fillStyle='rgba(100,200,120,0.12)';ctx.fillRect(-cW/4,-cH+4,cW/2,cH-8);
      if(lv>=7){const rc=Math.min(Math.floor(_mp(lv,7,15,2,5)),5);ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=0.7;
        for(let i=0;i<rc;i++){const rx=-cW/2+(cW/(rc+1))*(i+1);ctx.beginPath();ctx.moveTo(rx,-cH+5);ctx.lineTo(rx,-3);ctx.stroke();}}
      if(lv>=9){ctx.strokeStyle='#c8c8a0';ctx.lineWidth=0.3;const sr=Math.min(Math.floor(_mp(lv,9,18,2,6)),6);
        for(let r=0;r<sr;r++){const sy=-cH*(0.15+r*0.14);
          ctx.beginPath();ctx.moveTo(-cW/2,sy);ctx.lineTo(-cW/2-3,sy-1);ctx.stroke();ctx.beginPath();ctx.moveTo(-cW/2,sy);ctx.lineTo(-cW/2-2,sy+2);ctx.stroke();
          ctx.beginPath();ctx.moveTo(cW/2,sy);ctx.lineTo(cW/2+3,sy-1);ctx.stroke();ctx.beginPath();ctx.moveTo(cW/2,sy);ctx.lineTo(cW/2+2,sy+2);ctx.stroke();}}
      if(lv>=12){const aH=_mp(lv,12,25,3,17),aW=_mp(lv,12,25,3,6.5);ctx.fillStyle='#2d7a3a';
        ctx.save();ctx.translate(-cW/2,-cH*0.55);_rRect(ctx,-aW,-aH/2,aW,aH,3);if(lv>=16)_rRect(ctx,-aW,-aH,aW*0.8,aH*0.6,3);ctx.restore();
        if(lv>=14){const aH2=_mp(lv,14,25,3,13);ctx.save();ctx.translate(cW/2,-cH*0.4);_rRect(ctx,0,-aH2/2,aW,aH2,3);
          if(lv>=18)_rRect(ctx,0,-aH2,aW*0.8,aH2*0.5,3);ctx.restore();}
        if(lv>=20){const aH3=_mp(lv,20,28,3,10);ctx.save();ctx.translate(-cW/2,-cH*0.35);_rRect(ctx,-aW*0.8,-aH3/2,aW*0.8,aH3,3);ctx.restore();}}
      if(lv>=17&&lv<20){const bs=_mp(lv,17,19,2,4);ctx.fillStyle='#3d8a4a';ctx.beginPath();ctx.ellipse(0,-cH-bs*0.5,bs*0.55,bs,0,0,Math.PI*2);ctx.fill();
        if(lv>=18){ctx.fillStyle='#f5c5d0';ctx.beginPath();ctx.ellipse(0,-cH-bs,bs*0.3,bs*0.3,0,0,Math.PI*2);ctx.fill();}}
      if(lv>=20){const fcs=['#f5c5d0','#ff6b9d','#f0e060','#ff8060','#e060e0'];const fc=Math.min(Math.floor(_mp(lv,20,28,1,4)),4);
        const positions=[[0,-cH],[-cW/2-3,-cH*0.55-8],[cW/2+3,-cH*0.4-6],[0,-cH*0.8]];
        for(let f=0;f<fc;f++){const[fx,fy]=positions[f];const c=lv>=24?fcs[f%5]:'#f5c5d0';
          for(let p=0;p<6;p++){const pa=(p/6)*Math.PI*2+Math.sin(t/1000+f)*0.05;ctx.save();ctx.translate(fx,fy);ctx.rotate(pa);ctx.fillStyle=c;
            ctx.beginPath();ctx.ellipse(0,-3.2,1.4,3.2,0,0,Math.PI*2);ctx.fill();ctx.restore();}
          ctx.fillStyle='#ffe066';ctx.beginPath();ctx.arc(fx,fy,1.8,0,Math.PI*2);ctx.fill();}}
      if(lv>=26){const bb=Math.min(lv-25,3);for(let b=0;b<bb;b++){
        const bx=(b%2===0?1:-1)*(cW/2+4+b*4.5),bh=4.5+b*1.8,bw=2.8+b*0.5;ctx.fillStyle='#3da84e';_rRect(ctx,bx-bw/2,-bh,bw,bh,2);}}
      if(lv>=29){ctx.fillStyle='#a89880';ctx.beginPath();ctx.ellipse(-11,-1,2.8,1.8,0.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#989080';ctx.beginPath();ctx.ellipse(13,-1,1.8,1.3,-0.1,0,Math.PI*2);ctx.fill();}
      ctx.restore();
      if(lv>=28)_dBird(ctx,cx-cW/2-5,bY-cH*0.55-11,'#c89060');
    }

    /* ═══════════════════════════════
       Canvas Room Background
       ═══════════════════════════════ */
    let bgAnimFrame = null;
    const bgClouds = [];
    const bgDust = [];
    let bgInited = false;

    function initBgParticles(rw, rh) {
      if (bgInited) return;
      bgInited = true;
      for (let i = 0; i < 5; i++) {
        bgClouds.push({ x: Math.random(), y: 0.06 + Math.random() * 0.12, w: 0.07 + Math.random() * 0.06, speed: 0.008 + Math.random() * 0.008 });
      }
      for (let i = 0; i < 25; i++) {
        bgDust.push({ x: Math.random(), y: Math.random() * 0.6, sz: 1 + Math.random() * 1.5, sp: 0.1 + Math.random() * 0.2, ph: Math.random() * Math.PI * 2 });
      }
    }

    function drawBgCloud(ctx, cx, cy, size) {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
      ctx.arc(cx + size * 0.4, cy - size * 0.2, size * 0.4, 0, Math.PI * 2);
      ctx.arc(cx + size * 0.7, cy, size * 0.35, 0, Math.PI * 2);
      ctx.arc(cx + size * 0.3, cy + size * 0.1, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

