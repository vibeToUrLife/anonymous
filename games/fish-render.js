/* ============================================================
   Shared fish renderer — used by fishing.html (the Fishing game)
   and room.html (the Aquarium view). Pure canvas drawing + the
   FISH_TYPES registry; no game state. Loaded as a classic script
   so every symbol below is a browser global.
   ============================================================ */

    /* ═══════════════════════════════
       Fish Data
       ═══════════════════════════════ */
    const FISH_TYPES = [
      { name: 'Sardine',    emoji: '🐟', rarity: 'common',    points: 1,  coins: 1,  speed: 1.2, size: 18, fight: 0.2, weight: 25 },
      { name: 'Anchovy',    emoji: '🐟', rarity: 'common',    points: 1,  coins: 1,  speed: 1.4, size: 16, fight: 0.15, weight: 25 },
      { name: 'Mackerel',   emoji: '🐟', rarity: 'common',    points: 2,  coins: 1,  speed: 1.0, size: 22, fight: 0.3, weight: 10 },
      { name: 'Salmon',     emoji: '🐠', rarity: 'rare',      points: 5,  coins: 3,  speed: 0.9, size: 26, fight: 0.5, weight: 10 },
      { name: 'Tuna',       emoji: '🐠', rarity: 'rare',      points: 5,  coins: 3,  speed: 1.1, size: 24, fight: 0.55, weight: 8 },
      { name: 'Sea Bass',   emoji: '🐠', rarity: 'rare',      points: 8,  coins: 4,  speed: 0.8, size: 28, fight: 0.6, weight: 4 },
      { name: 'Clownfish',  emoji: '🐠', rarity: 'rare',      points: 6,  coins: 3,  speed: 1.3, size: 20, fight: 0.35, weight: 3 },
      { name: 'Swordfish',  emoji: '🦈', rarity: 'epic',      points: 15, coins: 8,  speed: 1.5, size: 32, fight: 0.8, weight: 3 },
      { name: 'Pufferfish', emoji: '🐡', rarity: 'epic',      points: 12, coins: 6,  speed: 0.6, size: 26, fight: 0.7, weight: 2.5 },
      { name: 'Octopus',    emoji: '🐙', rarity: 'epic',      points: 18, coins: 10, speed: 0.7, size: 30, fight: 0.85, weight: 1.5 },
      { name: 'Golden Koi', emoji: '✨', rarity: 'legendary', points: 50, coins: 25, speed: 0.5, size: 28, fight: 0.6, weight: 1 },
      { name: 'Sea Dragon', emoji: '🐉', rarity: 'legendary', points: 80, coins: 40, speed: 1.0, size: 36, fight: 0.95, weight: 0.5 },
      { name: 'Whale',      emoji: '🐋', rarity: 'legendary', points: 100,coins: 50, speed: 0.4, size: 44, fight: 1.0, weight: 0.3 },
      { name: 'Old Boot',   emoji: '👢', rarity: 'junk',      points: 0,  coins: 0,  speed: 0,   size: 20, fight: 0, weight: 5 },
      { name: 'Seaweed',    emoji: '🌿', rarity: 'junk',      points: 0,  coins: 0,  speed: 0,   size: 18, fight: 0, weight: 3 },
    ];

    // Used on the underwater CANVAS (art) — fish-name text & particles on the dark water scene.
    const RARITY_COLORS = {
      junk:      'rgba(255,255,255,0.3)',
      common:    'rgba(255,255,255,0.7)',
      rare:      '#7ec8e3',
      epic:      '#c8b6ff',
      legendary: '#f7c97e',
    };
    // Used in the DOM collection grid (chrome) — readable on the light cream cards.
    const RARITY_COLORS_DOM = {
      junk:      'var(--g-ink-faint)',
      common:    'var(--g-ink-soft)',
      rare:      '#2E86AB',
      epic:      '#8B5CF6',
      legendary: 'var(--g-coin-ink)',
    };

    /* ═══════════════════════════════
       Fish Art — hand-drawn vector fish (replaces the emoji)
       One renderer, drawFish(), used by the pond, the hooked fish, the
       catch reveal and the lobby Collection grid. Each species is built
       from canvas paths: a countershaded gradient body, fins, tail, eye
       and a per-species pattern, plus a soft glow for rare+ fish.
       Local space: the fish faces +x (right), centred at (0,0); the
       caller translates/scales/flips for position and swim direction.
       opts: { phase (tail-sway radians), alpha, silhouette }.
       ═══════════════════════════════ */
    const SIL_FILL = 'rgba(150,156,176,0.55)'; // undiscovered silhouette

    // Per-species look: c1 back (dark), c2 flank, belly (light), fin, pattern + colour.
    const FISH_ART = {
      'Sardine':    { shape:'fish',    c1:'#3f6f99', c2:'#8fbbdd', belly:'#eef6fc', fin:'#6f9cc2', pat:'line',  patC:'#cfe4f4' },
      'Anchovy':    { shape:'fish',    c1:'#5d8c74', c2:'#a9d2bb', belly:'#eef8f1', fin:'#88b89f', pat:'line',  patC:'#dff1e6', slim:1.5 },
      'Mackerel':   { shape:'fish',    c1:'#256468', c2:'#63aaa6', belly:'#eef7f4', fin:'#3f8d89', pat:'bands', patC:'#0e3033' },
      'Salmon':     { shape:'fish',    c1:'#bf6f60', c2:'#f0a48c', belly:'#fcefe7', fin:'#d98774', pat:'spots', patC:'#8f4a3e', tall:1.12 },
      'Tuna':       { shape:'fish',    c1:'#22436a', c2:'#5685b8', belly:'#e9f1f8', fin:'#f2c14e', pat:'none',  tall:1.18 },
      'Sea Bass':   { shape:'fish',    c1:'#54664c', c2:'#93a583', belly:'#eef1e7', fin:'#6b7a5e', pat:'bands', patC:'#33402c', tall:1.28 },
      'Clownfish':  { shape:'fish',    c1:'#e3701f', c2:'#ff9a38', belly:'#ffd6a0', fin:'#19191b', pat:'clown', tall:1.22 },
      'Swordfish':  { shape:'sword',   c1:'#343a66', c2:'#6970ac', belly:'#e7e9f5', fin:'#454b7a' },
      'Pufferfish': { shape:'puffer',  c1:'#c2933a', c2:'#ebc669', belly:'#fbf1cf', fin:'#b3842c', pat:'spots', patC:'#6b4c18' },
      'Octopus':    { shape:'octopus', c1:'#763aa3', c2:'#b06ad6', belly:'#e7c8f4', fin:'#8a44b5', pat:'spots', patC:'#56227c' },
      'Golden Koi': { shape:'koi',     c1:'#ef9f33', c2:'#ffd56a', belly:'#fffaef', fin:'#fff0bf', pat:'koi',   patC:'#e85f33' },
      'Sea Dragon': { shape:'dragon',  c1:'#1d7567', c2:'#3fd0b0', belly:'#d8fff4', fin:'#9bffe6' },
      'Whale':      { shape:'whale',   c1:'#365982', c2:'#6f93b8', belly:'#dbe8f3', fin:'#2f4d6a' },
      'Old Boot':   { shape:'boot',    c1:'#5a4534', c2:'#7d6147', belly:'#3a2c20', fin:'#3a2c20' },
      'Seaweed':    { shape:'seaweed', c1:'#2c7a37', c2:'#54b55c', belly:'#1d5826', fin:'#1d5826' },
    };

    // Vertical countershading gradient (dark back → light belly) for a fish body.
    function bodyGrad(ctx, hh, a) {
      const g = ctx.createLinearGradient(0, -hh, 0, hh);
      g.addColorStop(0, a.c1); g.addColorStop(0.5, a.c2); g.addColorStop(1, a.belly);
      return g;
    }

    function drawEye(ctx, x, y, s, sil) {
      const r = Math.max(1.3, s * 0.12);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
      ctx.fillStyle = sil ? 'rgba(90,96,118,0.8)' : '#fbfdff'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.15, y, r * 0.58, 0, 7);
      ctx.fillStyle = sil ? 'rgba(60,64,84,0.9)' : '#172230'; ctx.fill();
      if (!sil) { ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.26, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill(); }
    }

    // Species markings, drawn clipped to the body path.
    function drawFishPattern(ctx, a, bl, bh, tb) {
      ctx.save();
      ctx.fillStyle = a.patC; ctx.strokeStyle = a.patC; ctx.lineCap = 'round';
      if (a.pat === 'bands') {
        ctx.globalAlpha *= 0.55; ctx.lineWidth = bl * 0.07;
        for (let i = 0; i < 5; i++) { const x = bl * 0.55 - i * (bl * 1.1 / 5); ctx.beginPath(); ctx.moveTo(x, -bh); ctx.quadraticCurveTo(x - bl * 0.06, 0, x, bh); ctx.stroke(); }
      } else if (a.pat === 'spots') {
        ctx.globalAlpha *= 0.5;
        [[0.35,-0.3],[0.05,0.15],[-0.3,-0.2],[-0.1,0.4],[0.5,0.05],[-0.5,0.25],[0.2,-0.5]].forEach(p => { ctx.beginPath(); ctx.arc(p[0]*bl, p[1]*bh, bh*0.13, 0, 7); ctx.fill(); });
      } else if (a.pat === 'line') {
        ctx.globalAlpha *= 0.5; ctx.lineWidth = bh * 0.13; ctx.beginPath(); ctx.moveTo(bl*0.7, 0); ctx.lineTo(tb, 0); ctx.stroke();
      } else if (a.pat === 'clown') {
        [0.5, 0.02, -0.42].forEach(bx => {
          ctx.fillStyle = '#fff6ea'; ctx.beginPath(); ctx.ellipse(bx*bl, 0, bl*0.085, bh*1.15, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(15,15,18,0.55)'; ctx.lineWidth = bl*0.02; ctx.stroke();
        });
      }
      ctx.restore();
    }

    // Standard streamlined fish (sardine, tuna, salmon, bass, clownfish…).
    function drawGenericFish(ctx, type, a, s, sway, sil) {
      const hl = s * 0.92, hh = s * 0.5 * (a.tall || 1) / (a.slim || 1), tb = -hl * 0.74;
      const finC = sil ? SIL_FILL : a.fin;
      // Forked tail (sways with phase)
      const tipx = tb - hl * 0.44, sp = hh * 0.95, ty = sway * hh * 0.6;
      ctx.beginPath();
      ctx.moveTo(tb + hl*0.05, 0);
      ctx.quadraticCurveTo(tipx*0.7, -sp*0.45, tipx, -sp + ty);
      ctx.quadraticCurveTo(tb - hl*0.16, 0, tipx, sp + ty);
      ctx.quadraticCurveTo(tipx*0.7, sp*0.45, tb + hl*0.05, 0);
      ctx.closePath(); ctx.fillStyle = finC; ctx.fill();
      // Dorsal fin
      ctx.beginPath(); ctx.moveTo(hl*0.12, -hh*0.92); ctx.quadraticCurveTo(-hl*0.12, -hh*1.7, -hl*0.46, -hh*0.62); ctx.lineTo(-hl*0.08, -hh*0.55); ctx.closePath(); ctx.fillStyle = finC; ctx.fill();
      // Body
      ctx.beginPath();
      ctx.moveTo(hl, 0);
      ctx.bezierCurveTo(hl*0.45, -hh, tb*0.5, -hh, tb, -hh*0.5);
      ctx.bezierCurveTo(tb*0.7, -hh*0.15, tb*0.7, hh*0.15, tb, hh*0.5);
      ctx.bezierCurveTo(tb*0.5, hh, hl*0.45, hh, hl, 0);
      ctx.closePath();
      ctx.fillStyle = sil ? SIL_FILL : bodyGrad(ctx, hh, a); ctx.fill();
      if (!sil) { ctx.lineWidth = Math.max(1, s*0.04); ctx.strokeStyle = 'rgba(8,18,32,0.28)'; ctx.stroke(); }
      // Pattern (clipped to body)
      if (a.pat && a.pat !== 'none') { ctx.save(); ctx.clip(); drawFishPattern(ctx, a, hl, hh, tb); ctx.restore(); }
      // Pectoral fin
      ctx.beginPath(); ctx.moveTo(hl*0.28, hh*0.22); ctx.quadraticCurveTo(hl*0.05, hh*0.98, -hl*0.16, hh*0.42); ctx.closePath(); ctx.fillStyle = finC; ctx.fill();
      // Gill line
      if (!sil) { ctx.beginPath(); ctx.moveTo(hl*0.46, -hh*0.5); ctx.quadraticCurveTo(hl*0.3, 0, hl*0.46, hh*0.5); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, s*0.04); ctx.stroke(); }
      drawEye(ctx, hl*0.66, -hh*0.12, s, sil);
    }

    // Swordfish — slim body, long bill, tall sail, deep fork.
    function drawSwordfish(ctx, type, a, s, sway, sil) {
      const hl = s*0.92, hh = s*0.4, tb = -hl*0.72, finC = sil ? SIL_FILL : a.fin;
      const tipx = tb - hl*0.5, sp = hh*1.5;
      ctx.beginPath(); ctx.moveTo(tb+hl*0.05,0); ctx.lineTo(tipx,-sp+sway*hh); ctx.quadraticCurveTo(tb-hl*0.1,0,tipx,sp+sway*hh); ctx.closePath(); ctx.fillStyle=finC; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl*0.18,-hh); ctx.quadraticCurveTo(-hl*0.05,-hh*2.7,-hl*0.42,-hh*0.7); ctx.lineTo(-hl*0.02,-hh*0.65); ctx.closePath(); ctx.fillStyle=finC; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl,0); ctx.bezierCurveTo(hl*0.4,-hh,tb*0.5,-hh*0.9,tb,-hh*0.4); ctx.bezierCurveTo(tb*0.7,0,tb*0.7,0,tb,hh*0.4); ctx.bezierCurveTo(tb*0.5,hh*0.9,hl*0.4,hh,hl,0); ctx.closePath();
      ctx.fillStyle = sil ? SIL_FILL : bodyGrad(ctx,hh,a); ctx.fill();
      if(!sil){ctx.lineWidth=Math.max(1,s*0.04);ctx.strokeStyle='rgba(8,12,30,0.3)';ctx.stroke();}
      ctx.beginPath(); ctx.moveTo(hl*0.98,-hh*0.13); ctx.lineTo(hl+hl*0.75,0); ctx.lineTo(hl*0.98,hh*0.13); ctx.closePath(); ctx.fillStyle=sil?SIL_FILL:a.c1; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl*0.2,hh*0.3); ctx.quadraticCurveTo(-hl*0.05,hh*1.3,-hl*0.22,hh*0.5); ctx.closePath(); ctx.fillStyle=sil?SIL_FILL:a.fin; ctx.fill();
      drawEye(ctx,hl*0.66,-hh*0.18,s,sil);
    }

    // Pufferfish — round, spiky, spotted.
    function drawPuffer(ctx, type, a, s, sway, sil) {
      const r = s*0.6, n = 18;
      ctx.beginPath();
      for (let i=0;i<n;i++){ const ang=i/n*Math.PI*2, r2=r*1.3, a1=ang-0.11, a2=ang+0.11; ctx.moveTo(Math.cos(a1)*r,Math.sin(a1)*r); ctx.lineTo(Math.cos(ang)*r2,Math.sin(ang)*r2); ctx.lineTo(Math.cos(a2)*r,Math.sin(a2)*r); }
      ctx.closePath(); ctx.fillStyle = sil ? SIL_FILL : a.c1; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r*0.85,0); ctx.lineTo(-r*1.45,-r*0.55+sway*r*0.3); ctx.quadraticCurveTo(-r*1.1,0,-r*1.45,r*0.55+sway*r*0.3); ctx.closePath(); ctx.fillStyle=sil?SIL_FILL:a.fin; ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,r,0,7);
      if (sil) ctx.fillStyle = SIL_FILL; else { const g=ctx.createRadialGradient(r*0.3,-r*0.35,r*0.1,0,0,r*1.05); g.addColorStop(0,a.c2); g.addColorStop(1,a.c1); ctx.fillStyle=g; }
      ctx.fill();
      if(!sil){ctx.lineWidth=Math.max(1,s*0.04);ctx.strokeStyle='rgba(60,40,0,0.25)';ctx.stroke();}
      if (!sil) { ctx.save(); ctx.clip(); ctx.fillStyle=a.patC; ctx.globalAlpha=0.45; [[0.3,-0.2],[-0.2,0.1],[0.1,0.42],[-0.4,-0.25],[0.45,0.25],[0,-0.5]].forEach(p=>{ctx.beginPath();ctx.arc(p[0]*r,p[1]*r,r*0.11,0,7);ctx.fill();}); ctx.restore(); }
      ctx.beginPath(); ctx.ellipse(r*0.25,r*0.5,r*0.3,r*0.16,0.4,0,7); ctx.fillStyle=sil?SIL_FILL:a.fin; ctx.fill();
      drawEye(ctx, r*0.5, -r*0.22, s, sil);
    }

    // Octopus — domed mantle, six waving tentacles, two eyes.
    function drawOctopus(ctx, type, a, s, sway, sil) {
      const r = s*0.55, legs = 6;
      for (let i=0;i<legs;i++){ const t=i/(legs-1)-0.5, bx=t*r*1.5, wob=Math.sin(sway*3+i)*r*0.3;
        ctx.beginPath(); ctx.moveTo(bx-r*0.2, r*0.15); ctx.quadraticCurveTo(bx+wob, r*1.05, bx*1.25+wob, r*1.55); ctx.quadraticCurveTo(bx+wob*0.5, r*1.05, bx+r*0.2, r*0.15); ctx.closePath();
        ctx.fillStyle = sil ? SIL_FILL : (i%2 ? a.c1 : a.c2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-r, r*0.2); ctx.bezierCurveTo(-r*1.15, -r*1.25, r*1.15, -r*1.25, r, r*0.2); ctx.closePath();
      if (sil) ctx.fillStyle = SIL_FILL; else { const g=ctx.createRadialGradient(0,-r*0.4,r*0.2,0,0,r*1.35); g.addColorStop(0,a.c2); g.addColorStop(1,a.c1); ctx.fillStyle=g; }
      ctx.fill();
      if (!sil) { ctx.save(); ctx.fillStyle=a.patC; ctx.globalAlpha=0.4; [[0.32,-0.45],[-0.32,-0.45],[0,-0.7]].forEach(p=>{ctx.beginPath();ctx.arc(p[0]*r,p[1]*r,r*0.13,0,7);ctx.fill();}); ctx.restore(); }
      drawEye(ctx, r*0.34, -r*0.5, s*0.95, sil);
      drawEye(ctx, -r*0.04, -r*0.5, s*0.85, sil);
    }

    // Golden Koi — white base with orange/gold patches, flowing twin tail.
    function drawKoi(ctx, type, a, s, sway, sil) {
      const hl=s*0.92, hh=s*0.42, tb=-hl*0.68, finC = sil ? SIL_FILL : 'rgba(255,243,210,0.85)', tipx = tb - hl*0.6;
      ctx.beginPath(); ctx.moveTo(tb,0); ctx.quadraticCurveTo(tipx*0.6,-hh*0.5,tipx,-hh*1.4+sway*hh); ctx.quadraticCurveTo(tipx*0.5,-hh*0.2,tb-hl*0.1,0); ctx.closePath(); ctx.fillStyle=finC; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tb,0); ctx.quadraticCurveTo(tipx*0.6,hh*0.5,tipx,hh*1.4+sway*hh); ctx.quadraticCurveTo(tipx*0.5,hh*0.2,tb-hl*0.1,0); ctx.closePath(); ctx.fillStyle=finC; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl,0); ctx.bezierCurveTo(hl*0.45,-hh,tb*0.5,-hh,tb,-hh*0.5); ctx.bezierCurveTo(tb*0.7,-hh*0.15,tb*0.7,hh*0.15,tb,hh*0.5); ctx.bezierCurveTo(tb*0.5,hh,hl*0.45,hh,hl,0); ctx.closePath();
      if (sil) ctx.fillStyle = SIL_FILL; else { const g=ctx.createLinearGradient(0,-hh,0,hh); g.addColorStop(0,'#ffffff'); g.addColorStop(1,a.belly); ctx.fillStyle=g; }
      ctx.fill();
      if (!sil) { ctx.save(); ctx.clip(); ctx.fillStyle=a.patC; ctx.beginPath(); ctx.ellipse(hl*0.42,-hh*0.2,hl*0.28,hh*0.7,0,0,7); ctx.fill(); ctx.fillStyle=a.c1; ctx.beginPath(); ctx.ellipse(-hl*0.18,hh*0.12,hl*0.3,hh*0.85,0,0,7); ctx.fill(); ctx.fillStyle=a.patC; ctx.beginPath(); ctx.ellipse(hl*0.05,-hh*0.45,hl*0.18,hh*0.4,0,0,7); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = finC;
      ctx.beginPath(); ctx.moveTo(hl*0.22,hh*0.32); ctx.quadraticCurveTo(hl*0.0,hh*1.5,-hl*0.3,hh*0.85); ctx.quadraticCurveTo(-hl*0.02,hh*0.6,hl*0.06,hh*0.36); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl*0.18,-hh*0.85); ctx.quadraticCurveTo(-hl*0.2,-hh*1.5,-hl*0.5,-hh*0.65); ctx.lineTo(-hl*0.02,-hh*0.58); ctx.closePath(); ctx.fill();
      if (!sil) { ctx.strokeStyle=a.fin; ctx.lineWidth=Math.max(1,s*0.04); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(hl*0.92,hh*0.12); ctx.quadraticCurveTo(hl*1.12,hh*0.32,hl*1.0,hh*0.5); ctx.stroke(); }
      drawEye(ctx, hl*0.64, -hh*0.1, s, sil);
    }

    // Sea Dragon — serpentine body with a spiny crest and a snouted head.
    function drawDragon(ctx, type, a, s, sway, sil) {
      const len=s*1.9, segs=10, amp=s*0.3, th=s*0.2, pts=[];
      for (let i=0;i<=segs;i++){ const u=i/segs; pts.push([s*0.9 - u*len, Math.sin(u*Math.PI*2.2 + sway*2)*amp*(0.4+u*0.7)]); }
      ctx.lineJoin='round'; ctx.lineCap='round';
      const stroke = sil ? SIL_FILL : (function(){ const g=ctx.createLinearGradient(s,0,-len,0); g.addColorStop(0,a.c2); g.addColorStop(1,a.c1); return g; })();
      ctx.fillStyle = sil ? SIL_FILL : a.fin;
      for (let i=1;i<segs;i++){ const p=pts[i]; ctx.beginPath(); ctx.moveTo(p[0]-th*0.5,p[1]); ctx.lineTo(p[0]+th*0.2,p[1]-th*1.7); ctx.lineTo(p[0]+th*0.5,p[1]); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = stroke;
      for (let i=0;i<segs;i++){ ctx.lineWidth = th*2*(1-i/segs*0.82); ctx.beginPath(); ctx.moveTo(pts[i][0],pts[i][1]); ctx.lineTo(pts[i+1][0],pts[i+1][1]); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(pts[0][0],pts[0][1],s*0.3,s*0.24,0,0,7); ctx.fillStyle=sil?SIL_FILL:a.c2; ctx.fill();
      ctx.beginPath(); ctx.moveTo(pts[0][0]+s*0.18,pts[0][1]-s*0.1); ctx.lineTo(pts[0][0]+s*0.5,pts[0][1]); ctx.lineTo(pts[0][0]+s*0.18,pts[0][1]+s*0.1); ctx.closePath(); ctx.fill();
      drawEye(ctx, pts[0][0]+s*0.04, pts[0][1]-s*0.08, s, sil);
    }

    // Whale — big rounded body, fluke tail, pectoral, belly grooves, spout.
    function drawWhale(ctx, type, a, s, sway, sil) {
      const hl=s*0.92, hh=s*0.6, tb=-hl*0.72;
      ctx.beginPath(); ctx.moveTo(tb,0); ctx.quadraticCurveTo(tb-hl*0.18,-hh*0.15,tb-hl*0.48,-hh*0.8+sway*hh*0.5); ctx.quadraticCurveTo(tb-hl*0.22,-hh*0.08,tb-hl*0.16,0); ctx.quadraticCurveTo(tb-hl*0.22,hh*0.08,tb-hl*0.48,hh*0.8+sway*hh*0.5); ctx.quadraticCurveTo(tb-hl*0.18,hh*0.15,tb,0); ctx.closePath(); ctx.fillStyle=sil?SIL_FILL:a.fin; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hl,hh*0.12); ctx.bezierCurveTo(hl*0.5,-hh,tb*0.5,-hh*0.9,tb,-hh*0.28); ctx.bezierCurveTo(tb*0.8,hh*0.45,hl*0.2,hh,hl*0.72,hh*0.66); ctx.quadraticCurveTo(hl,hh*0.4,hl,hh*0.12); ctx.closePath();
      ctx.fillStyle=sil?SIL_FILL:bodyGrad(ctx,hh,a); ctx.fill();
      if(!sil){ctx.lineWidth=Math.max(1,s*0.04);ctx.strokeStyle='rgba(8,20,40,0.3)';ctx.stroke();}
      if (!sil) { ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=Math.max(1,s*0.03); for(let i=0;i<4;i++){const yy=hh*0.22+i*hh*0.12; ctx.beginPath(); ctx.moveTo(hl*0.72,yy); ctx.lineTo(-hl*0.05,yy*0.85); ctx.stroke();} }
      ctx.beginPath(); ctx.moveTo(hl*0.18,hh*0.38); ctx.quadraticCurveTo(hl*0.05,hh*1.05,-hl*0.2,hh*0.66); ctx.quadraticCurveTo(-hl*0.02,hh*0.5,hl*0.12,hh*0.42); ctx.closePath(); ctx.fillStyle=sil?SIL_FILL:a.fin; ctx.fill();
      if (!sil) { ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=Math.max(1,s*0.045); ctx.beginPath(); ctx.moveTo(hl,hh*0.08); ctx.quadraticCurveTo(hl*0.55,hh*0.4,hl*0.18,hh*0.32); ctx.stroke();
        ctx.strokeStyle='rgba(180,220,255,0.5)'; ctx.lineWidth=Math.max(1,s*0.05); ctx.beginPath(); ctx.moveTo(hl*0.28,-hh*0.78); ctx.quadraticCurveTo(hl*0.2,-hh*1.05,hl*0.32,-hh*1.2); ctx.stroke(); }
      drawEye(ctx, hl*0.6, -hh*0.02, s, sil);
    }

    // Old Boot — junk, a brown leather boot.
    function drawBoot(ctx, type, a, s, sil) {
      ctx.save(); ctx.scale(s/20, s/20);
      ctx.fillStyle = sil ? SIL_FILL : a.c2;
      ctx.beginPath(); ctx.moveTo(-3,-13); ctx.lineTo(5,-13); ctx.quadraticCurveTo(6,-2,6,2); ctx.lineTo(15,4); ctx.quadraticCurveTo(19,5,19,9); ctx.lineTo(19,12); ctx.lineTo(-7,12); ctx.lineTo(-7,4); ctx.quadraticCurveTo(-5,-4,-3,-13); ctx.closePath(); ctx.fill();
      if (!sil) { ctx.fillStyle=a.belly; ctx.fillRect(-7,10,26,3); ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-3,-11); ctx.lineTo(5,-11); ctx.stroke(); ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(0,-12,1.1,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(2.6,-12,1.1,0,7); ctx.fill(); }
      ctx.restore();
    }

    // Seaweed — junk, three swaying green blades.
    function drawSeaweed(ctx, type, a, s, sway, sil) {
      ctx.lineCap='round'; ctx.lineJoin='round';
      for (let b=0;b<3;b++){ const x0=(b-1)*s*0.32; ctx.strokeStyle=sil?SIL_FILL:(b===1?a.c2:a.c1); ctx.lineWidth=s*0.2; ctx.beginPath(); ctx.moveTo(x0,s*0.75); for(let i=1;i<=4;i++){ const y=s*0.75-i*(s*1.5/4), x=x0+Math.sin(i*1.3+b+sway)*s*0.24; ctx.lineTo(x,y);} ctx.stroke(); }
    }

    // Dispatcher: glow for rare+ then route to the right species renderer.
    function drawFish(ctx, type, s, opts = {}) {
      const a = FISH_ART[type.name] || { shape:'fish', c1:'#52789c', c2:'#9cc0e0', belly:'#eef5fb', fin:'#7196b8', pat:'none' };
      const sil = !!opts.silhouette;
      const sway = Math.sin(opts.phase || 0);
      ctx.save();
      if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
      if (!sil && type.rarity !== 'common' && type.rarity !== 'junk') {
        ctx.shadowColor = RARITY_COLORS[type.rarity] || 'rgba(255,255,255,0.6)';
        ctx.shadowBlur  = type.rarity === 'legendary' ? s * 0.85 : s * 0.5;
      }
      switch (a.shape) {
        case 'sword':   drawSwordfish(ctx, type, a, s, sway, sil); break;
        case 'puffer':  drawPuffer(ctx, type, a, s, sway, sil); break;
        case 'octopus': drawOctopus(ctx, type, a, s, sway, sil); break;
        case 'koi':     drawKoi(ctx, type, a, s, sway, sil); break;
        case 'dragon':  drawDragon(ctx, type, a, s, sway, sil); break;
        case 'whale':   drawWhale(ctx, type, a, s, sway, sil); break;
        case 'boot':    drawBoot(ctx, type, a, s, sil); break;
        case 'seaweed': drawSeaweed(ctx, type, a, s, sway, sil); break;
        default:        drawGenericFish(ctx, type, a, s, sway, sil);
      }
      ctx.restore();
    }

    // Standalone <canvas> with a fish drawn centred — for the Collection grid.
    function makeFishCanvas(type, cw, ch, s, sil) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cv = document.createElement('canvas');
      cv.width = cw * dpr; cv.height = ch * dpr; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      const c = cv.getContext('2d');
      c.scale(dpr, dpr); c.translate(cw / 2, ch / 2);
      drawFish(c, type, s, { silhouette: sil });
      return cv;
    }
