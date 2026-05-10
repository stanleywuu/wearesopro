document.addEventListener("DOMContentLoaded", () => {

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = document.getElementById("fighter-canvas");
  const ctx    = canvas.getContext("2d");
  const LW = 320, LH = 140, S = 4;
  canvas.width  = LW * S;
  canvas.height = LH * S;
  const p = n => n * S;

  // ── Palette ───────────────────────────────────────────────────────────────
  const COL = {
    padWhite : "#f2f0ec",
    padShd   : "#ccc8be",
    padDk    : "#a09890",
    blueLt   : "#bacede",
    blueMd   : "#6e98b8",
    cream    : "#ede0c0",
    brown    : "#3a1808",
    gray     : "#8a8880",
    grayDk   : "#3a3830",
    gold     : "#c89828",
    black    : "#101008",
    iceFloor : "#cce8f4",
    iceBg    : "#dceef8",
    crease   : "#b8def0",
    shadow   : "rgba(40,70,100,0.18)",
    eOrange  : "#d05818",
    eRed     : "#c82020",
    ePurple  : "#803098",
    eStripe  : "#1a1a1a",
    eStripeW : "#f0f0f0",
    eSkin    : "#e8c090",
    eFlag    : "#e07010",
    hurtFlash: "rgba(220,60,60,0.22)",
  };

  // ── Drawing primitives ────────────────────────────────────────────────────
  function R(x, y, w, h, c) {
    ctx.fillStyle = c; ctx.fillRect(p(x), p(y), p(w), p(h));
  }
  function RR(x, y, w, h, r, c) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(p(x), p(y), p(w), p(h), p(r)); ctx.fill();
  }
  function RRS(x, y, w, h, r, c, lw) {
    ctx.strokeStyle = c; ctx.lineWidth = p(lw);
    ctx.beginPath(); ctx.roundRect(p(x), p(y), p(w), p(h), p(r)); ctx.stroke();
  }
  function E(cx, cy, rx, ry, c) {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.ellipse(p(cx), p(cy), p(rx), p(ry), 0, 0, Math.PI * 2); ctx.fill();
  }
  function ES(cx, cy, rx, ry, c, lw) {
    ctx.strokeStyle = c; ctx.lineWidth = p(lw); ctx.beginPath();
    ctx.ellipse(p(cx), p(cy), p(rx), p(ry), 0, 0, Math.PI * 2); ctx.stroke();
  }
  function C(cx, cy, r, c) { E(cx, cy, r, r, c); }
  function L(x1, y1, x2, y2, c, lw) {
    ctx.strokeStyle = c; ctx.lineWidth = p(lw); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(p(x1), p(y1)); ctx.lineTo(p(x2), p(y2)); ctx.stroke();
  }

  // ── Background ────────────────────────────────────────────────────────────
  const GROUND_Y = 117;

  function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    R(0, 0, LW, LH, COL.iceBg);
    R(0, 102, LW, LH - 102, COL.iceFloor);
    // Small crease on Tommy's left side
    ctx.fillStyle = COL.crease;
    ctx.beginPath();
    ctx.ellipse(p(20), p(130), p(42), p(18), 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    // Danger line (left boundary)
    ctx.strokeStyle = COL.blueMd + "80";
    ctx.lineWidth = p(1.5);
    ctx.setLineDash([p(3), p(4)]);
    ctx.beginPath();
    ctx.moveTo(p(25), p(100)); ctx.lineTo(p(25), p(LH));
    ctx.stroke();
    ctx.setLineDash([]);
    // Centre red line
    ctx.strokeStyle = "#e06060" + "50";
    ctx.lineWidth = p(2);
    ctx.beginPath();
    ctx.moveTo(p(LW / 2), p(100)); ctx.lineTo(p(LW / 2), p(LH));
    ctx.stroke();
    // Depth lane lines (perspective hint)
    ctx.setLineDash([]);
    [108, 116, 124].forEach((ly, i) => {
      ctx.strokeStyle = `rgba(180,210,230,${0.12 + i * 0.06})`;
      ctx.lineWidth = p(0.5);
      ctx.beginPath(); ctx.moveTo(p(25), p(ly)); ctx.lineTo(p(LW), p(ly)); ctx.stroke();
    });
  }

  // ── Tommy shadow ──────────────────────────────────────────────────────────
  function drawShadow(tx, gy) {
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(p(tx + 2), p(gy + 3), p(22), p(5), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Side-view Tommy ───────────────────────────────────────────────────────
  // Tommy always faces RIGHT. tx = his centre-x, gy = ground level.
  // walkFrame: 0 or 1 (stride cycle). attack: null | { move, progress 0-1 }

  function drawSideTommy(tx, gy, walkFrame, attack, hurt) {
    const stride = walkFrame ? 2 : 0;

    if (hurt && Math.floor(performance.now() / 80) % 2 === 0) return;

    // Jump lifts the entire character; liftY is negative (upward on canvas)
    const liftY = (attack && attack.move === 'jump')
      ? Math.round(-22 * Math.sin(attack.progress * Math.PI))
      : 0;

    drawShadow(tx, gy);

    // ── Stick ─────────────────────────────────────────────────────────────
    if (!attack || attack.move !== 'throwStick') {
      const stickAngle = (attack && attack.move === 'slide')     ?  0.3
                       : (attack && attack.move === 'stickSwing') ? -0.9 * Math.sin(attack.progress * Math.PI)
                       : 0;
      ctx.save();
      ctx.translate(p(tx + 6), p(gy - 56 + liftY));
      ctx.rotate(stickAngle);
      ctx.strokeStyle = COL.gold; ctx.lineWidth = p(3.5); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p(16), p(56)); ctx.stroke();
      ctx.strokeStyle = '#2e7a2e'; ctx.lineWidth = p(7);
      ctx.beginPath(); ctx.moveTo(p(16), p(56)); ctx.lineTo(p(38), p(56)); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.restore();
    } else {
      const t = attack.progress;
      const sx = tx + 30 + t * 80;
      const sy = gy - 56 + t * 20;
      ctx.save();
      ctx.translate(p(sx), p(sy));
      ctx.rotate(-0.5 + t * 0.3);
      ctx.strokeStyle = COL.gold; ctx.lineWidth = p(3.5); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p(16), p(40)); ctx.stroke();
      ctx.strokeStyle = '#2e7a2e'; ctx.lineWidth = p(7);
      ctx.beginPath(); ctx.moveTo(p(16), p(40)); ctx.lineTo(p(36), p(40)); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.restore();
    }

    // ── Back leg pad ──────────────────────────────────────────────────────
    const backPadX = tx - 14 + stride;
    RR(backPadX, gy - 40 + liftY, 13, 40, 3, COL.padShd);
    drawOneSkateS(backPadX - 1, gy - 8 + liftY, gy + liftY);

    // ── Body / chest ──────────────────────────────────────────────────────
    let bodyY = gy - 74 + liftY;  // liftY already handles jump
    let bodyShiftX = 0;
    if (attack) {
      if (attack.move === 'slide') {
        const t = Math.sin(attack.progress * Math.PI);
        bodyShiftX = 14 * t;
        bodyY += 12 * t;
      }
    }

    E(tx - 2 + bodyShiftX, bodyY - 2, 14, 10, COL.padWhite);
    RR(tx - 13 + bodyShiftX, bodyY, 24, 32, 5, COL.padWhite);
    R(tx - 9 + bodyShiftX, bodyY + 6, 16, 7, COL.blueLt);
    R(tx - 9 + bodyShiftX, bodyY + 17, 16, 6, COL.blueMd);
    RRS(tx - 13 + bodyShiftX, bodyY, 24, 32, 5, COL.padShd, 0.8);

    // ── Blocker ───────────────────────────────────────────────────────────
    let blockerX = tx + 8 + bodyShiftX;
    let blockerY = bodyY + 8;
    if (attack) {
      if (attack.move === 'punch')      blockerX += 20 * Math.sin(attack.progress * Math.PI);
      if (attack.move === 'stickSwing') blockerX += 14 * Math.sin(attack.progress * Math.PI);
      if (attack.move === 'throwStick') blockerY -= 12 * Math.sin(attack.progress * Math.PI);
    }
    RR(blockerX - 1, blockerY, 16, 20, 3, COL.blueMd);
    RR(blockerX - 2, blockerY - 5, 18, 28, 4, COL.padWhite);
    R(blockerX, blockerY - 2, 14, 4, COL.blueLt);
    RRS(blockerX - 2, blockerY - 5, 18, 28, 4, COL.padShd, 0.8);

    // ── Front leg pad ─────────────────────────────────────────────────────
    const frontPadBaseX = tx - 4 - stride + bodyShiftX;
    const frontPadBaseY = gy - 42 + liftY;  // lifted with rest of body

    if (attack && attack.move === 'kick') {
      // Negative angle: canvas rotate() swings bottom of a downward pad to the RIGHT (forward)
      const angle = -0.78 * Math.sin(attack.progress * Math.PI);
      const kickX = frontPadBaseX + 12;  // shifted right so kick extends further out
      ctx.save();
      ctx.translate(p(kickX + 9), p(frontPadBaseY));  // origin = top of pad
      ctx.rotate(angle);
      RR(-9, 0, 18, 42, 4, COL.padWhite);   // pad hangs down from pivot
      R(-6, 4, 12, 6, COL.blueLt);
      R(-6, 14, 12, 5, COL.blueMd);
      RRS(-9, 0, 18, 42, 4, COL.padShd, 0.8);
      ctx.restore();
      ctx.save();
      ctx.translate(p(kickX + 9), p(frontPadBaseY));
      ctx.rotate(angle);
      drawOneSkateS(-10, 34, 42);           // skate hangs at bottom of pad
      ctx.restore();
    } else if (attack && attack.move === 'butterfly') {
      const t = Math.sin(attack.progress * Math.PI);
      ctx.save();
      ctx.translate(p(frontPadBaseX + 9), p(gy - 4 + liftY));
      ctx.rotate(Math.PI * 0.4 * t);
      RR(-9, -40, 18, 40, 4, COL.padWhite);
      R(-6, -36, 12, 6, COL.blueLt);
      RRS(-9, -40, 18, 40, 4, COL.padShd, 0.8);
      ctx.restore();
    } else if (attack && attack.move === 'slide') {
      const t = Math.sin(attack.progress * Math.PI);
      const slideAngle = -1.2 * t;  // negative = foot swings RIGHT (forward)
      const hipX = frontPadBaseX + 9;
      const hipY = frontPadBaseY;
      ctx.save();
      ctx.translate(p(hipX), p(hipY));
      ctx.rotate(slideAngle);
      RR(-9, 0, 18, 42, 4, COL.padWhite);
      R(-6, 4, 12, 6, COL.blueLt);
      R(-6, 14, 12, 5, COL.blueMd);
      RRS(-9, 0, 18, 42, 4, COL.padShd, 0.8);
      ctx.restore();
      ctx.save();
      ctx.translate(p(hipX), p(hipY));
      ctx.rotate(slideAngle);
      drawOneSkateS(-10, 34, 42);
      ctx.restore();
    } else {
      RR(frontPadBaseX, frontPadBaseY, 18, 42, 4, COL.padWhite);
      R(frontPadBaseX + 3, frontPadBaseY + 4, 12, 6, COL.blueLt);
      R(frontPadBaseX + 3, frontPadBaseY + 14, 12, 5, COL.blueMd);
      RRS(frontPadBaseX, frontPadBaseY, 18, 42, 4, COL.padShd, 0.8);
      drawOneSkateS(frontPadBaseX - 2, gy - 8 + liftY, gy + liftY);
    }

    // ── Head & helmet ─────────────────────────────────────────────────────
    const headX = tx + 1 + bodyShiftX;
    const headY = bodyY - 12;  // bodyY already includes liftY
    ctx.fillStyle = COL.padWhite;
    ctx.beginPath();
    ctx.ellipse(p(headX - 1), p(headY), p(13), p(14), -0.08, 0, Math.PI * 2);
    ctx.fill();
    R(headX + 6, headY - 4, 6, 12, COL.gray + "cc");
    C(headX - 4, headY - 10, 1.8, COL.gray);
    C(headX + 2, headY - 12, 1.8, COL.gray);
    C(headX - 7, headY - 5,  1.8, COL.gray);
    C(headX + 8, headY - 1, 2, COL.brown);
    ES(headX - 1, headY, 13, 14, COL.padShd, 0.8);
  }

  function drawOneSkateS(sx, sy, gy) {
    // sy = skate top, gy = ground
    RR(sx, sy, 18, gy - sy, 2, COL.grayDk);
    R(sx - 2, gy - 2, 22, 3, COL.gray);
  }

  function drawStickOnGround(sx) {
    // Stick lying flat on ice, shaft left, blade right
    ctx.strokeStyle = COL.gold; ctx.lineWidth = p(3.5); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(p(sx - 22), p(GROUND_Y - 1)); ctx.lineTo(p(sx), p(GROUND_Y - 1)); ctx.stroke();
    ctx.lineWidth = p(6);
    ctx.beginPath(); ctx.moveTo(p(sx), p(GROUND_Y - 1)); ctx.lineTo(p(sx + 14), p(GROUND_Y - 1)); ctx.stroke();
    ctx.strokeStyle = '#2e7a2e'; ctx.lineWidth = p(8);
    ctx.beginPath(); ctx.moveTo(p(sx + 14), p(GROUND_Y - 1)); ctx.lineTo(p(sx + 26), p(GROUND_Y - 1)); ctx.stroke();
    ctx.lineCap = 'round';
    // Glow when Tommy is nearby (within pickup range)
    if (Math.abs(tommyX - sx) < 20) {
      ctx.fillStyle = "rgba(200,220,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(p(sx), p(GROUND_Y - 1), p(20), p(6), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPuck(ex, gy) {
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(p(ex), p(gy + 1), p(8), p(3), 0, 0, Math.PI * 2);
    ctx.fill();
    E(ex, gy - 4, 6, 3, COL.black);
    ES(ex, gy - 4, 6, 3, '#505050', 0.5);
  }

  // ── Enemy sprites (face LEFT) ─────────────────────────────────────────────
  // Drawn by mirroring Tommy's side profile with ctx.scale(-1,1) around enemy centre.
  // Each enemy is a simplified humanoid, colour-coded.

  function drawEnemyBase(ex, gy, jerseyCol, legH, headY, bodyTop, bodyH, scale) {
    // scale: 1 normal, <1 during death shrink
    ctx.save();
    ctx.translate(p(ex), p(gy));
    ctx.scale(-scale, scale);  // mirror horizontally + apply scale
    ctx.translate(-p(ex), -p(gy));

    // Shadow (radii in user-space; transform scale makes it shrink on death)
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(p(ex), p(gy + 3), p(18), p(4), 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    R(ex - 10, gy - legH, 7, legH, COL.grayDk);
    R(ex + 2,  gy - legH + 4, 7, legH - 4, COL.grayDk);
    // Skate blades
    R(ex - 12, gy - 2, 10, 3, COL.gray);
    R(ex,      gy - 2, 10, 3, COL.gray);

    // Jersey/body
    RR(ex - 13, bodyTop, 26, bodyH, 4, jerseyCol);

    // Head — slightly right of centre so after mirror it leans toward Tommy (left)
    C(ex + 2, headY, 9, COL.eSkin);
    // Eyes on the right side so after mirror they face left (toward Tommy)
    C(ex + 7, headY - 2, 2.2, COL.black);
    C(ex + 2, headY - 2, 2.2, COL.black);

    ctx.restore();
  }

  // Runner (orange) — steady walk
  function drawRunner(ex, gy, walkFrame, scale) {
    const legH = 20, bodyH = 24;
    const bodyTop = gy - legH - bodyH;
    const headY = bodyTop - 10;
    drawEnemyBase(ex, gy, COL.eOrange, legH, headY, bodyTop, bodyH, scale);
    // Jersey stripe
    ctx.save();
    ctx.translate(p(ex), p(gy));
    ctx.scale(-scale, scale);
    ctx.translate(-p(ex), -p(gy));
    R(ex - 9, bodyTop + 5, 18, 5, COL.eStripeW);
    // Arms swinging
    const armSwing = walkFrame ? 8 : -4;
    L(ex - 13, bodyTop + 8, ex - 22, bodyTop + 18 + armSwing, COL.eSkin, 4);
    L(ex + 13, bodyTop + 8, ex + 10, bodyTop + 18 - armSwing, COL.eSkin, 4);
    ctx.restore();
  }

  // Charger (red) — same shape, but leans forward
  function drawCharger(ex, gy, walkFrame, scale) {
    const legH = 20, bodyH = 24;
    const bodyTop = gy - legH - bodyH - 4; // slightly leaning = head forward/lower
    const headY = bodyTop - 8;
    drawEnemyBase(ex, gy, COL.eRed, legH, headY, bodyTop, bodyH, scale);
    ctx.save();
    ctx.translate(p(ex), p(gy));
    ctx.scale(-scale, scale);
    ctx.translate(-p(ex), -p(gy));
    R(ex - 9, bodyTop + 4, 18, 4, COL.eStripeW);
    R(ex - 9, bodyTop + 12, 18, 4, COL.eStripeW);
    // Arms pumping hard
    L(ex - 13, bodyTop + 8, ex - 26, bodyTop + 22, COL.eSkin, 4);
    L(ex + 13, bodyTop + 8, ex + 8,  bodyTop + 24, COL.eSkin, 4);
    ctx.restore();
  }

  // Low Slider (purple) — hugs ice, mostly horizontal
  function drawSlider(ex, gy, scale) {
    ctx.save();
    ctx.translate(p(ex), p(gy));
    ctx.scale(-scale, scale);
    ctx.translate(-p(ex), -p(gy));

    // Shadow
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(p(ex), p(gy + 3), p(26 * scale), p(4 * scale), 0, 0, Math.PI * 2);
    ctx.fill();

    // Horizontal body
    RR(ex - 24, gy - 16, 46, 16, 5, COL.ePurple);
    R(ex - 18, gy - 12, 34, 5, COL.eStripeW + "80");
    // Head at leading edge (left side in mirrored = right side toward Tommy)
    C(ex - 30, gy - 10, 9, COL.eSkin);
    C(ex - 36, gy - 12, 2.2, COL.black);
    C(ex - 30, gy - 12, 2.2, COL.black);
    // Skate/feet trailing
    RR(ex + 18, gy - 12, 14, 10, 3, COL.grayDk);
    R(ex + 16, gy - 3, 18, 3, COL.gray);

    ctx.restore();
  }

  // Ref (striped) — upright, one arm raised with flag
  function drawRef(ex, gy, walkFrame, scale) {
    const legH = 20, bodyH = 24;
    const bodyTop = gy - legH - bodyH;
    const headY = bodyTop - 10;

    ctx.save();
    ctx.translate(p(ex), p(gy));
    ctx.scale(-scale, scale);
    ctx.translate(-p(ex), -p(gy));

    // Shadow
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(p(ex), p(gy + 3), p(18 * scale), p(4 * scale), 0, 0, Math.PI * 2);
    ctx.fill();

    // Striped legs
    R(ex - 10, gy - legH, 7, legH, COL.eStripe);
    R(ex + 2, gy - legH + 4, 7, legH - 4, COL.eStripe);
    R(ex - 12, gy - 2, 10, 3, COL.gray);
    R(ex, gy - 2, 10, 3, COL.gray);

    // Striped jersey
    R(ex - 13, bodyTop, 26, bodyH, COL.eStripeW);
    R(ex - 13, bodyTop,       26, 5, COL.eStripe);
    R(ex - 13, bodyTop + 9,   26, 5, COL.eStripe);
    R(ex - 13, bodyTop + 18,  26, 4, COL.eStripe);

    // Head
    C(ex - 2, headY, 9, COL.eSkin);
    C(ex - 7, headY - 2, 2.2, COL.black);
    C(ex - 2, headY - 2, 2.2, COL.black);

    // Flag arm raised
    L(ex + 13, bodyTop + 8, ex + 20, headY - 10, COL.eSkin, 4);
    R(ex + 16, headY - 18, 14, 8, COL.eFlag);
    // Other arm at side
    L(ex - 13, bodyTop + 8, ex - 18, bodyTop + 22, COL.eSkin, 4);

    ctx.restore();
  }

  function drawEnemy(en) {
    const depthT     = (en.gy - LANE_Y_MIN) / (LANE_Y_MAX - LANE_Y_MIN);
    const depthScale = 0.82 + 0.18 * depthT;
    const dyingScale = en.state === 'dying'
      ? Math.max(0, 1 - (performance.now() - en.dieStart) / 400) : 1;
    const scale = depthScale * dyingScale;
    const wf = en.state === 'brawl' ? 0 : Math.floor(performance.now() / 200) % 2;
    switch (en.type) {
      case 'runner':  drawRunner(en.x,  en.gy, wf, scale);  break;
      case 'charger': drawCharger(en.x, en.gy, wf, scale);  break;
      case 'slider':  drawSlider(en.x,  en.gy, scale);      break;
      case 'ref':     drawRef(en.x,     en.gy, wf, scale);  break;
      case 'puck':    drawPuck(en.x,    en.gy);              break;
    }
  }

  // ── Enemy definitions ─────────────────────────────────────────────────────
  const ENEMY_DEFS = {
    runner:  { speed: 0.70, groundY: GROUND_Y, brawlMs: 600 },
    charger: { speed: 1.40, groundY: GROUND_Y, brawlMs: 320 },
    slider:  { speed: 0.95, groundY: GROUND_Y, brawlMs: 420 },
    ref:     { speed: 0.55, groundY: GROUND_Y, brawlMs: 750 },
    puck:    { speed: 0,    groundY: GROUND_Y, brawlMs: 0   },  // speed set per-instance
  };

  // ── Attack hitboxes ───────────────────────────────────────────────────────
  // offsetLeft/Right relative to tommyX; height = px from ground upward
  const HITBOXES = {
    kick:       { offsetLeft: 5,   offsetRight: 52,  height: 55, cooldown: 400 },
    punch:      { offsetLeft: 10,  offsetRight: 58,  height: 68, cooldown: 350 },
    stickSwing: { offsetLeft: 10,  offsetRight: 82,  height: 58, cooldown: 450 },
    slide:      { offsetLeft: 5,   offsetRight: 78,  height: 42, cooldown: 700 },
    jump:       { offsetLeft: -15, offsetRight: 48,  height: 92, cooldown: 500 },
    throwStick: { offsetLeft: 25,  offsetRight: 90,  height: 62, cooldown: 800 },
  };
  const ATTACK_DURATION = 380;  // ms each attack pose holds

  // ── Wave definitions ──────────────────────────────────────────────────────
  function makeWave(waveNum) {
    const speedMult = 1 + (waveNum - 1) * 0.18;
    const waves = [
      ['runner','runner','runner','runner','runner','runner'],
      ['runner','runner','charger','charger','runner','charger','puck'],
      ['runner','charger','slider','puck','slider','charger','puck','runner'],
      ['charger','slider','puck','ref','charger','puck','slider','ref','charger','puck'],
    ];
    const types = waves[Math.min(waveNum - 1, waves.length - 1)];
    // Shuffle
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    return types.map(type => ({
      type,
      speed: type === 'puck'
        ? (1.8 + Math.random() * 0.9) * speedMult
        : ENEMY_DEFS[type].speed * speedMult,
    }));
  }

  // ── Game state ────────────────────────────────────────────────────────────
  let gameState   = "idle";   // 'idle' | 'fighting' | 'over'
  let lives       = 3;
  let score       = 0;
  let wave        = 1;
  let enemies     = [];
  let spawnQueue  = [];
  let spawnTimer  = null;
  let waveGap     = false;    // true during between-wave pause

  let tommyX      = 60;
  let tommyVX     = 0;
  let tommyY      = 117;
  let tommyVY     = 0;
  const TOMMY_SPEED   = 1.5;
  const TOMMY_SPEED_Y = 1.2;
  const TOMMY_MIN     = 26;
  const TOMMY_MAX     = 95;
  const LANE_Y_MIN    = 106;
  const LANE_Y_MAX    = 128;
  const LANE_TOLERANCE = 11;

  let tommyState   = "idle";  // 'idle' | 'walk' | 'attack' | 'hurt'
  let attackMove   = null;
  let attackStart  = 0;
  let hurtStart    = 0;
  const HURT_DUR   = 600;

  const attackCooldowns = {
    kick: 0, punch: 0, stickSwing: 0, slide: 0, jump: 0, throwStick: 0,
  };

  let walkFrame = 0;
  let walkTick  = 0;

  // Stick pickup state: null = Tommy has stick, number = stick lying on ice at that x
  let stickX = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const startBtn   = document.getElementById("fighter-start");
  const uiWrap     = document.getElementById("fighter-ui");
  const hpFillEl   = document.getElementById("fighter-hp-fill");
  const waveEl     = document.getElementById("fighter-wave");
  const scoreEl    = document.getElementById("fighter-score");
  const endBtn     = document.getElementById("fighter-end");
  const modal      = document.getElementById("fighter-modal");
  const modalTitle = document.getElementById("fighter-modal-title");
  const modalBody  = document.getElementById("fighter-modal-body");
  const replayBtn  = document.getElementById("fighter-replay");
  const closeBtn   = document.getElementById("fighter-modal-close");
  const btnLeft    = document.getElementById("btn-left");
  const btnRight   = document.getElementById("btn-right");
  const btnUp      = document.getElementById("btn-up");
  const btnDown    = document.getElementById("btn-down");
  const chirpEl    = document.getElementById("fighter-chirp");

  // ── HUD helpers ───────────────────────────────────────────────────────────
  function updateHUD() {
    hpFillEl.style.width       = Math.max(0, lives / 2 * 100) + '%';
    hpFillEl.dataset.low       = lives <= 1 ? 'true' : 'false';
    waveEl.textContent         = "Wave " + wave;
    scoreEl.textContent        = "Score " + score;
  }

  function showFightUI(on) {
    uiWrap.classList.toggle("hidden", !on);
  }

  // ── Chirp ─────────────────────────────────────────────────────────────────
  let chirpTimer  = null;
  let lastChirpAt = 0;

  const ENEMY_CHIRPS = {
    runner:  [
      "Move it, goalie!", "Get outta the crease!", "He's done!",
      "Out of my way!", "Let's go boys!", "Your time is up!",
    ],
    charger: [
      "COMING THROUGH!", "MOVE!", "OUT OF THE WAY!", "He's mine!", "CHARGE!",
    ],
    slider:  [
      "Low bridge!", "Watch the ankles!", "Nobody sees this coming.",
      "Stay low, boys.", "Surprise.", "Ankle party.",
    ],
    ref:     [
      "2 minutes for hooking!", "Roughing — 5 minutes!", "High sticking!",
      "Misconduct!", "You're outta here!", "That's a penalty shot!",
      "Game misconduct, pal.", "Delay of game!", "Too many men on the ice!",
    ],
  };

  const IDLE_CHIRPS = [
    "I once elbowed a ref. In my dreams.",
    "My butterfly has taken out three opponents. Allegedly.",
    "Goalies don't fight. We retaliate.",
    "The crease is mine. Ask anyone.",
    "My stick has a black belt.",
    "Nobody crosses the blue paint. Nobody.",
  ];
  const WIN_CHIRPS = [
    "Next!", "Stay down.", "The crease is CLOSED.", "Was that your best?",
    "My house.", "Tell your friends.", "The goalie fights back!",
  ];
  const HURT_CHIRPS = [
    "That's a penalty!", "Interference!", "My cramp!", "Fine. FINE.",
    "I slipped. On purpose.", "I'll remember that.",
  ];

  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function showChirp(text, lx, ly) {
    if (performance.now() - lastChirpAt < 2500) return;
    lastChirpAt = performance.now();
    chirpEl.textContent = text;
    const r  = canvas.getBoundingClientRect();
    const cx = r.left + ((lx !== undefined ? lx : tommyX) / LW) * r.width;
    const cy = r.top  + ((ly !== undefined ? ly : 60)     / LH) * r.height;
    const bw = 240;
    chirpEl.style.left = Math.max(4, Math.min(cx - bw / 2, window.innerWidth - bw - 8)) + 'px';
    chirpEl.style.top  = Math.max(4, cy - 60) + 'px';
    chirpEl.classList.remove("fade");
    chirpEl.classList.add("show");
    clearTimeout(chirpTimer);
    chirpTimer = setTimeout(() => {
      chirpEl.classList.remove("show");
      chirpEl.classList.add("fade");
    }, 2800);
  }

  let idleChirpTimer = null;
  function scheduleIdleChirp() {
    clearTimeout(idleChirpTimer);
    idleChirpTimer = setTimeout(() => {
      if (gameState === "idle") showChirp(randomFrom(IDLE_CHIRPS));
      scheduleIdleChirp();
    }, 18000 + Math.random() * 22000);
  }

  canvas.addEventListener("click", () => {
    if (gameState === "idle") showChirp(randomFrom(IDLE_CHIRPS));
  });

  // ── Spawning ──────────────────────────────────────────────────────────────
  function spawnNext() {
    if (spawnQueue.length === 0) return;
    const def = spawnQueue.shift();
    enemies.push({
      type:       def.type,
      speed:      def.speed,
      brawlMs:    ENEMY_DEFS[def.type].brawlMs,
      x:          LW + 20,
      gy:         LANE_Y_MIN + Math.random() * (LANE_Y_MAX - LANE_Y_MIN),
      state:      'walk',
      dieStart:   0,
      brawlStart: 0,
    });
    if (spawnQueue.length > 0) {
      const delay = 1200 + Math.random() * 700;
      spawnTimer = setTimeout(spawnNext, delay);
    }
  }

  function startWave() {
    waveGap = false;
    spawnQueue = makeWave(wave);
    clearTimeout(spawnTimer);
    spawnNext();
  }

  // ── Attack / hit detection ────────────────────────────────────────────────
  function doAttack(move) {
    if (gameState !== "fighting") return;
    if (tommyState === "attack" || tommyState === "hurt") return;
    const now = performance.now();
    if (now < attackCooldowns[move]) return;

    tommyState  = "attack";
    attackMove  = move;
    attackStart = now;
    attackCooldowns[move] = now + HITBOXES[move].cooldown;

    // Schedule reset
    setTimeout(() => {
      if (attackMove === move) {
        attackMove = null;
        tommyState = tommyVX !== 0 ? "walk" : "idle";
      }
    }, ATTACK_DURATION);
  }

  function checkHits(now) {
    if (!attackMove) return;
    const progress = (now - attackStart) / ATTACK_DURATION;
    if (progress < 0.25 || progress > 0.85) return;  // only active mid-swing

    const hb      = HITBOXES[attackMove];
    const hitLeft = tommyX + hb.offsetLeft;
    const hitRight= tommyX + hb.offsetRight;

    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (en.state === 'dying') continue;
      if (en.type === 'puck'   && attackMove !== 'stickSwing') continue;
      if (en.type === 'slider' && !['slide','kick','stickSwing'].includes(attackMove)) continue;
      if (en.x >= hitLeft && en.x <= hitRight && Math.abs(en.gy - tommyY) <= LANE_TOLERANCE) {
        en.state    = 'dying';
        en.dieStart = now;
        score++;
        updateHUD();
        showChirp(randomFrom(WIN_CHIRPS));
        setTimeout(() => { enemies.splice(enemies.indexOf(en), 1); }, 420);
      }
    }
  }

  // ── Main game update ──────────────────────────────────────────────────────
  function update(now) {
    if (gameState !== "fighting") return;

    // Tommy movement
    if (tommyState !== "hurt") {
      tommyX += tommyVX;
      tommyX = Math.max(TOMMY_MIN, Math.min(TOMMY_MAX, tommyX));
      tommyY += tommyVY;
      tommyY = Math.max(LANE_Y_MIN, Math.min(LANE_Y_MAX, tommyY));
    }

    // Walk frame
    if (tommyVX !== 0) {
      walkTick++;
      if (walkTick >= 18) { walkTick = 0; walkFrame = 1 - walkFrame; }
      if (tommyState !== "attack" && tommyState !== "hurt") tommyState = "walk";
    } else if (tommyState === "walk") {
      tommyState = "idle";
    }

    // Hurt recovery
    if (tommyState === "hurt" && now - hurtStart >= HURT_DUR) {
      tommyState = "idle";
    }

    // Enemy movement & brawl state machine
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (en.state === 'dying') continue;

      if (en.state === 'brawl') {
        if (now - en.brawlStart >= en.brawlMs) {
          // Wind-up complete — punch Tommy
          enemies.splice(i, 1);
          if (tommyState !== 'hurt') {
            lives--;
            updateHUD();
            tommyState = "hurt";
            hurtStart  = now;
            showChirp(randomFrom(HURT_CHIRPS));
            if (lives <= 0) { endGame(); return; }
          }
        }
        continue;
      }

      // Walk: advance toward Tommy
      en.x -= en.speed;

      // Puck: no brawl — contact damages unless Tommy is sliding, crossing line is harmless
      if (en.type === 'puck') {
        if (en.x <= tommyX + 8 && Math.abs(en.gy - tommyY) <= LANE_TOLERANCE) {
          enemies.splice(i, 1);
          if (attackMove !== 'slide' && tommyState !== 'hurt') {
            lives--;
            updateHUD();
            tommyState = "hurt";
            hurtStart  = now;
            showChirp(randomFrom(HURT_CHIRPS));
            if (lives <= 0) { endGame(); return; }
          }
        } else if (en.x < 25) {
          enemies.splice(i, 1);  // slipped past — no penalty
        }
        continue;
      }

      // Reached Tommy's lane — enter brawl wind-up
      if (en.x <= tommyX + 18 && Math.abs(en.gy - tommyY) <= LANE_TOLERANCE) {
        en.state      = 'brawl';
        en.brawlStart = now;
        if (Math.random() < 0.55) showChirp(randomFrom(ENEMY_CHIRPS[en.type]), en.x, en.gy - 20);
        continue;
      }

      // Fallback: breached the crease entirely
      if (en.x < 25) {
        enemies.splice(i, 1);
        if (tommyState !== 'hurt') {
          lives--;
          updateHUD();
          tommyState = "hurt";
          hurtStart  = now;
          showChirp(randomFrom(HURT_CHIRPS));
          if (lives <= 0) { endGame(); return; }
        }
      }
    }

    // Hit detection
    checkHits(now);

    // Wave completion check
    if (!waveGap && spawnQueue.length === 0 && enemies.length === 0) {
      waveGap = true;
      wave++;
      updateHUD();
      showChirp("Wave " + wave + "! They're not done.", );
      setTimeout(startWave, 2200);
    }
  }

  function endGame() {
    gameState = "over";
    clearTimeout(spawnTimer);
    enemies = [];
    spawnQueue = [];
    showFightUI(false);
    startBtn.classList.add("hidden");

    const best = parseInt(localStorage.getItem("goalie-brawl-best") || "0", 10);
    const newBest = score > best;
    if (newBest) localStorage.setItem("goalie-brawl-best", String(score));

    modalTitle.textContent = score === 0 ? "They got through." : "Brawl over.";
    modalBody.innerHTML = "Reached wave " + wave + " with a score of " + score + "." +
      (newBest ? "<br><strong>New best!</strong>" : "<br>Best: " + Math.max(best, score) + ".");

    tommyState = "idle";
    attackMove = null;
    modal.showModal();
    gameState = "idle";
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function render(now) {
    drawBackground();

    const attack = attackMove
      ? { move: attackMove, progress: Math.min(1, (now - attackStart) / ATTACK_DURATION) }
      : null;
    const hurt = tommyState === "hurt";

    // Painter's algorithm — sort all characters by Y (back to front)
    if (gameState === "fighting") {
      const entities = enemies.map(en => ({ isTommy: false, en, gy: en.gy }));
      entities.push({ isTommy: true, gy: tommyY });
      entities.sort((a, b) => a.gy - b.gy);
      for (const e of entities) {
        if (e.isTommy) drawSideTommy(tommyX, tommyY, walkFrame, attack, hurt);
        else drawEnemy(e.en);
      }
      if (hurt) {
        ctx.fillStyle = COL.hurtFlash;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      drawSideTommy(tommyX, tommyY, walkFrame, attack, hurt);
    }

    requestAnimationFrame(ts => { update(ts); render(ts); });
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  const keysHeld = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };

  function syncVelocity() {
    if (keysHeld.ArrowLeft && !keysHeld.ArrowRight)       tommyVX = -TOMMY_SPEED;
    else if (keysHeld.ArrowRight && !keysHeld.ArrowLeft)  tommyVX =  TOMMY_SPEED;
    else                                                   tommyVX =  0;
    if (keysHeld.ArrowUp && !keysHeld.ArrowDown)          tommyVY = -TOMMY_SPEED_Y;
    else if (keysHeld.ArrowDown && !keysHeld.ArrowUp)     tommyVY =  TOMMY_SPEED_Y;
    else                                                   tommyVY =  0;
  }

  document.addEventListener("keydown", e => {
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
      keysHeld[e.key] = true; syncVelocity(); e.preventDefault();
    }
    if (gameState === "fighting") {
      const map = { "1":"kick","2":"punch","3":"stickSwing","4":"slide","5":"jump","6":"throwStick" };
      if (map[e.key]) doAttack(map[e.key]);
    }
  });

  document.addEventListener("keyup", e => {
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
      keysHeld[e.key] = false; syncVelocity();
    }
  });

  // Touch / pointer movement buttons
  function bindDirBtn(btn, dir) {
    btn.addEventListener("pointerdown", e => {
      e.preventDefault();
      keysHeld[dir] = true; syncVelocity();
    });
    const stop = () => { keysHeld[dir] = false; syncVelocity(); };
    btn.addEventListener("pointerup",     stop);
    btn.addEventListener("pointercancel", stop);
    btn.addEventListener("pointerleave",  stop);
  }
  bindDirBtn(btnLeft,  "ArrowLeft");
  bindDirBtn(btnRight, "ArrowRight");
  bindDirBtn(btnUp,    "ArrowUp");
  bindDirBtn(btnDown,  "ArrowDown");

  // Attack buttons
  document.getElementById("move-kick")      .addEventListener("click", () => doAttack("kick"));
  document.getElementById("move-punch")     .addEventListener("click", () => doAttack("punch"));
  document.getElementById("move-stickswing").addEventListener("click", () => doAttack("stickSwing"));
  document.getElementById("move-slide")     .addEventListener("click", () => doAttack("slide"));
  document.getElementById("move-jump")      .addEventListener("click", () => doAttack("jump"));
  document.getElementById("move-throwstick").addEventListener("click", () => doAttack("throwStick"));

  function startFight() {
    gameState  = "fighting";
    lives      = 2;
    score      = 0;
    wave       = 1;
    enemies    = [];
    spawnQueue = [];
    waveGap    = false;
    tommyX     = 60;
    tommyVX    = 0;
    tommyY     = 117;
    tommyVY    = 0;
    tommyState = "idle";
    attackMove = null;
    Object.keys(attackCooldowns).forEach(k => { attackCooldowns[k] = 0; });
    modal.close();
    startBtn.classList.add("hidden");
    showFightUI(true);
    updateHUD();
    startWave();
  }

  startBtn.addEventListener("click",  startFight);
  replayBtn.addEventListener("click", startFight);
  closeBtn.addEventListener("click",  () => { modal.close(); startBtn.classList.remove("hidden"); });
  endBtn.addEventListener("click",    () => { clearTimeout(spawnTimer); endGame(); });

  // ── Debug grid ────────────────────────────────────────────────────────────
  const DEBUG_ENTRIES = [
    { name: 'idle',       fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, null, false); } },
    { name: 'walk-0',     fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, null, false); } },
    { name: 'walk-1',     fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 1, null, false); } },
    { name: 'kick',       fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, { move:'kick',       progress:0.5 }, false); } },
    { name: 'punch',      fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, { move:'punch',      progress:0.5 }, false); } },
    { name: 'stickSwing', fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, { move:'stickSwing', progress:0.5 }, false); } },
    { name: 'slide',      fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, { move:'slide',      progress:0.5 }, false); } },
    { name: 'jump',       fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, { move:'jump',       progress:0.5 }, false); } },
    { name: 'throwStick', fn: () => { drawBackground(); drawSideTommy(60, GROUND_Y, 0, { move:'throwStick', progress:0.5 }, false); } },
    { name: 'runner',     fn: () => { drawBackground(); drawRunner(200, GROUND_Y, 0, 1); } },
    { name: 'charger',    fn: () => { drawBackground(); drawCharger(200, GROUND_Y, 0, 1); } },
    { name: 'slider',     fn: () => { drawBackground(); drawSlider(200, GROUND_Y, 1); } },
    { name: 'ref',        fn: () => { drawBackground(); drawRef(200, GROUND_Y, 0, 1); } },
  ];

  const debugEnabled = new URLSearchParams(location.search).has('debug');
  let debugWrap = null, debugBtn = null, debugOpen = false;

  if (debugEnabled) {
    const section   = canvas.closest('section');
    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'fighter-debug-toggle';
    debugBtn = document.createElement('button');
    debugBtn.className = 'fighter-debug-btn';
    debugBtn.textContent = 'poses';
    toggleDiv.appendChild(debugBtn);
    debugWrap = document.createElement('div');
    debugWrap.className = 'fighter-debug hidden';
    section.append(toggleDiv, debugWrap);

    DEBUG_ENTRIES.forEach(({ name, fn }) => {
      const cell = document.createElement('div');
      cell.className = 'fighter-debug-cell';
      const tc = document.createElement('canvas');
      tc.width  = canvas.width;
      tc.height = canvas.height;
      tc.style.cssText = 'width:200px;height:auto;image-rendering:pixelated;border-radius:6px;border:1px solid #c8dce8;cursor:pointer;';
      try { fn(); tc.getContext('2d').drawImage(canvas, 0, 0); }
      catch { const tx = tc.getContext('2d'); tx.fillStyle='#fdd'; tx.fillRect(0,0,tc.width,tc.height); }
      const lbl = document.createElement('div');
      lbl.className = 'fighter-debug-label';
      lbl.textContent = name;
      cell.append(tc, lbl);
      debugWrap.appendChild(cell);
    });

    debugBtn.addEventListener('click', () => {
      debugOpen = !debugOpen;
      debugWrap.classList.toggle('hidden', !debugOpen);
      debugBtn.textContent = debugOpen ? 'hide poses' : 'poses';
    });
    document.addEventListener("keydown", e => {
      if ((e.key === "d" || e.key === "D") && !e.ctrlKey && !e.metaKey) {
        debugOpen = !debugOpen;
        debugWrap.classList.toggle('hidden', !debugOpen);
        debugBtn.textContent = debugOpen ? 'hide poses' : 'poses';
      }
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  scheduleIdleChirp();
  showFightUI(false);
  drawBackground();
  drawSideTommy(tommyX, tommyY, 0, null, false);
  requestAnimationFrame(ts => { update(ts); render(ts); });
});
