(function () {
  if (location.pathname.replace(/\.html$/, '') === '/games/adopt') return;

  // ── Canvas (128×128 logical, displayed at 64×64 CSS) ──────────────────────
  const LW = 128, LH = 128, S = 1;
  const canvas = document.createElement('canvas');
  canvas.width  = LW;
  canvas.height = LH;
  const SZ = 64; // CSS display size
  Object.assign(canvas.style, {
    position: 'fixed', width: SZ + 'px', height: SZ + 'px',
    imageRendering: 'pixelated', cursor: 'pointer',
    zIndex: '9997', borderRadius: '6px', pointerEvents: 'auto',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const p = n => n * S;

  // ── Chirp bubble ──────────────────────────────────────────────────────────
  const bubble = document.createElement('div');
  Object.assign(bubble.style, {
    position: 'fixed', maxWidth: '190px', background: '#fff',
    border: '2px solid #c8dce8', borderRadius: '12px',
    padding: '.4rem .9rem', fontStyle: 'italic', fontSize: '.8rem',
    lineHeight: '1.35', zIndex: '9998', opacity: '0',
    transition: 'opacity .3s', pointerEvents: 'none',
  });
  document.body.appendChild(bubble);

  // ── Palette ───────────────────────────────────────────────────────────────
  const COL = {
    padWhite:'#f2f0ec', padHi:'#ffffff', padShd:'#ccc8be', padDk:'#a09890',
    blueLt:'#bacede', blueMd:'#6e98b8', blueDk:'#3a5878',
    cream:'#ede0c0', tan:'#c8a060', brown:'#3a1808',
    gray:'#8a8880', grayDk:'#3a3830', gold:'#c89828', navy:'#182048',
    black:'#101008', white:'#ffffff',
  };

  // ── Primitives ────────────────────────────────────────────────────────────
  function R(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(p(x),p(y),p(w),p(h));}
  function RR(x,y,w,h,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(p(x),p(y),p(w),p(h),p(r));ctx.fill();}
  function RRS(x,y,w,h,r,c,lw){ctx.strokeStyle=c;ctx.lineWidth=p(lw);ctx.beginPath();ctx.roundRect(p(x),p(y),p(w),p(h),p(r));ctx.stroke();}
  function E(cx,cy,rx,ry,c){ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(p(cx),p(cy),p(rx),p(ry),0,0,Math.PI*2);ctx.fill();}
  function ES(cx,cy,rx,ry,c,lw){ctx.strokeStyle=c;ctx.lineWidth=p(lw);ctx.beginPath();ctx.ellipse(p(cx),p(cy),p(rx),p(ry),0,0,Math.PI*2);ctx.stroke();}
  function C(cx,cy,r,c){E(cx,cy,r,r,c);}
  function L(x1,y1,x2,y2,c,lw){ctx.strokeStyle=c;ctx.lineWidth=p(lw);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p(x1),p(y1));ctx.lineTo(p(x2),p(y2));ctx.stroke();}
  function A(cx,cy,r,a1,a2,c,lw){ctx.strokeStyle=c;ctx.lineWidth=p(lw);ctx.lineCap='round';ctx.beginPath();ctx.arc(p(cx),p(cy),p(r),a1,a2);ctx.stroke();}

  // ── Drawing parts ─────────────────────────────────────────────────────────
  function drawStick(tx,ty,bx,by){
    const mx=Math.round(tx*0.45+bx*0.55), my=Math.round(ty*0.45+by*0.55);
    ctx.lineCap='butt';
    ctx.strokeStyle=COL.gold; ctx.lineWidth=p(4);
    ctx.beginPath(); ctx.moveTo(p(tx),p(ty)); ctx.lineTo(p(mx),p(my)); ctx.stroke();
    ctx.lineWidth=p(7);
    ctx.beginPath(); ctx.moveTo(p(mx),p(my)); ctx.lineTo(p(bx),p(by)); ctx.stroke();
    ctx.strokeStyle='#2e7a2e'; ctx.lineWidth=p(9);
    ctx.beginPath(); ctx.moveTo(p(bx),p(by)); ctx.lineTo(p(bx+20),p(by)); ctx.stroke();
    ctx.lineCap='round';
  }
  function drawSkates(lx,rx,y){
    function sk(x){RR(x,y,36,10,3,COL.grayDk);R(x-2,y+8,40,3,COL.gray);}
    sk(lx); sk(rx);
  }
  function drawLegPads(lx,rx,y){
    function pad(x){RR(x,y,36,46,6,COL.padWhite);RRS(x,y,36,46,6,COL.padShd,1);}
    pad(lx); pad(rx);
  }
  function drawChestAndShoulders(cx,y){
    function sh(sx,a){ctx.fillStyle=COL.padWhite;ctx.beginPath();ctx.ellipse(p(sx),p(y+5),p(17),p(13),a,0,Math.PI*2);ctx.fill();}
    sh(cx-25,-0.3); sh(cx+25,0.3);
    RR(cx-25,y+5,50,30,8,COL.padWhite);
    R(cx-21,y+11,42,9,COL.blueLt);
    R(cx-21,y+24,42,7,COL.blueMd);
  }
  function drawBlocker(cx,y){
    RR(cx-8,y,16,22,4,COL.blueMd);
    RR(cx-15,y-7,32,34,5,COL.padWhite);
    RRS(cx-15,y-7,32,34,5,COL.padShd,0.8);
  }
  function drawGlove(cx,y){
    RR(cx-8,y,16,22,4,COL.blueMd);
    RR(cx-15,y+8,30,26,5,COL.padWhite);
    RRS(cx-15,y+8,30,26,5,COL.padShd,0.8);
  }
  function drawFace(cx,cy,expr){
    C(cx,cy,14,COL.cream);
    if(expr==='happy'){
      A(cx-6,cy-3,3.5,Math.PI*1.15,Math.PI*1.85,COL.brown,2.2);
      A(cx+6,cy-3,3.5,Math.PI*1.15,Math.PI*1.85,COL.brown,2.2);
    } else if(expr==='sad'){
      C(cx-6,cy-3,3,COL.brown); C(cx+6,cy-3,3,COL.brown);
      L(cx-10,cy-8,cx-3,cy-6,COL.brown,1.5);
      L(cx+3,cy-6,cx+10,cy-8,COL.brown,1.5);
    } else if(expr==='tired'){
      C(cx-6,cy-3,3,COL.brown); C(cx+6,cy-3,3,COL.brown);
      R(cx-10,cy-6,8,4,COL.cream); R(cx+2,cy-6,8,4,COL.cream);
    } else {
      C(cx-6,cy-3,3,COL.brown); C(cx+6,cy-3,3,COL.brown);
    }
    C(cx,cy+3,2,COL.brown);
  }
  function drawHelmet(cx,cy){
    E(cx,cy,22,22,COL.padWhite);
    [[cx-9,cy-14],[cx,cy-16],[cx+9,cy-14],[cx-13,cy-8],[cx+13,cy-8],[cx-8,cy-2],[cx+8,cy-2]]
      .forEach(([hx,hy])=>C(hx,hy,2.2,COL.gray));
    ctx.fillStyle=COL.blueLt+'bb';
    ctx.beginPath();ctx.ellipse(p(cx),p(cy+7),p(16),p(9),0,0,Math.PI*2);ctx.fill();
    R(cx-14,cy+14,28,5,COL.gray);
    ES(cx,cy,22,22,COL.padShd,1);
  }

  function drawTommy(expr, bob) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='rgba(40,70,100,0.12)';
    ctx.beginPath();ctx.ellipse(p(64),p(124),p(34),p(4),0,0,Math.PI*2);ctx.fill();
    drawSkates(20,70,116+bob);
    drawLegPads(20,70,72+bob);
    drawChestAndShoulders(64,46+bob);
    drawBlocker(30,48+bob);
    drawGlove(98,48+bob);
    drawStick(34,64+bob,32,118+bob);
    drawFace(64,35+bob,expr);
    drawHelmet(64,21+bob);
  }

  // ── Expression states ─────────────────────────────────────────────────────
  const STANCES = ['stand','tired','sad','stretch'];
  let behavior = 'stand';
  function startBehavior(b){ behavior = b; }

  // ── Viewport position — diagonal bounce ───────────────────────────────────
  let px = window.innerWidth  - SZ - 24;
  let py = window.innerHeight - SZ - 24;
  let vx = -(0.5 + Math.random() * 0.4);
  let vy = -(0.3 + Math.random() * 0.25);
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
  function updatePosition(){
    const maxX = window.innerWidth  - SZ;
    const maxY = window.innerHeight - SZ;
    px += vx; py += vy;
    if (px <= 0)    { px = 0;    vx =  Math.abs(vx); }
    if (px >= maxX) { px = maxX; vx = -Math.abs(vx); }
    if (py <= 0)    { py = 0;    vy =  Math.abs(vy); }
    if (py >= maxY) { py = maxY; vy = -Math.abs(vy); }
  }

  // ── Chirps ────────────────────────────────────────────────────────────────
  const CHIRPS = [
    'I stopped 34 shots. You’re welcome.',
    'The five-hole is a myth. For me.',
    'Tell your wingers to backcheck.',
    'I see everything from back here.',
    'Another shutout? Just another Tuesday.',
    'The butterfly doesn’t lie.',
    'My pads have seen things. Dark things.',
    'You call that a shot?',
    'Sorry, the net is closed.',
    'Goalies run this team. Don’t @ me.',
  ];
  let chirpTimer = null;
  canvas.addEventListener('click', () => {
    bubble.textContent = '”' + CHIRPS[Math.floor(Math.random()*CHIRPS.length)] + '”';
    bubble.style.opacity = '1';
    bubble.style.left = clamp(px - 60, 4, window.innerWidth - 200) + 'px';
    bubble.style.top  = clamp(py - 40, 4, window.innerHeight - 80) + 'px';
    clearTimeout(chirpTimer);
    chirpTimer = setTimeout(() => { bubble.style.opacity = '0'; }, 2200);
  });

  // ── Periodic chirp ────────────────────────────────────────────────────────
  function autoChirp() {
    if (Math.random() < 0.5) startBehavior(STANCES[Math.floor(Math.random() * STANCES.length)]);
    const text = CHIRPS[Math.floor(Math.random() * CHIRPS.length)];
    bubble.textContent = '"' + text + '"';
    bubble.style.opacity = '1';
    bubble.style.left = clamp(px - 60, 4, window.innerWidth - 200) + 'px';
    bubble.style.top  = clamp(py - 40, 4, window.innerHeight - 80) + 'px';
    clearTimeout(chirpTimer);
    chirpTimer = setTimeout(() => { bubble.style.opacity = '0'; }, 2200);
    setTimeout(autoChirp, 4000 + Math.random() * 4000);
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  let floatAngle = Math.random() * Math.PI * 2;
  function render(){
    updatePosition();
    floatAngle += 0.006;
    const fX = Math.sin(floatAngle) * 6;
    const fY = Math.cos(floatAngle) * 3;
    canvas.style.left = (px + fX) + 'px';
    canvas.style.top  = (py + fY) + 'px';
    const bob = Math.round(Math.sin(floatAngle * 0.5) * 1.5);
    const expr = behavior==='tired'?'tired':behavior==='sad'?'sad':behavior==='stretch'?'happy':'normal';
    drawTommy(expr, bob);
    requestAnimationFrame(render);
  }

  window.addEventListener('pagehide',()=>{
    try{sessionStorage.setItem('tommy-float-pos',JSON.stringify({x:px,y:py}));}catch(e){}
  });

  setTimeout(autoChirp, 4000 + Math.random() * 4000);
  render();
})();
