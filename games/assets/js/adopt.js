document.addEventListener("DOMContentLoaded", () => {

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = document.getElementById("adopt-canvas");
  const ctx    = canvas.getContext("2d");
  const LW = 160, LH = 140, S = 4;
  canvas.width  = LW * S;
  canvas.height = LH * S;

  const p  = n => n * S;
  const TX = 16;  // x-shift to centre Tommy in the wider canvas

  // ── Palette ───────────────────────────────────────────────────────────────
  const COL = {
    padWhite : "#f2f0ec",
    padHi    : "#ffffff",
    padShd   : "#ccc8be",
    padDk    : "#a09890",
    blueLt   : "#bacede",
    blueMd   : "#6e98b8",
    blueDk   : "#3a5878",
    cream    : "#ede0c0",
    tan      : "#c8a060",
    brown    : "#3a1808",
    gray     : "#8a8880",
    grayDk   : "#3a3830",
    gold     : "#c89828",
    navy     : "#182048",
    black    : "#101008",
    white    : "#ffffff",
    iceFloor : "#cce8f4",
    iceBg    : "#dceef8",
    crease   : "#b8def0",
    shadow   : "rgba(40,70,100,0.18)",
  };

  // ── Body part dimensions (logical pixels) ────────────────────────────────
  const PAD_W = 36, PAD_H = 46, PAD_R = 6;              // upright pad: width, height, corner-radius
  const SKATE_W = 38, SKATE_H = 10, SKATE_R = 3;        // skate boot: width, height, corner-radius
  const BLADE_W = 42, BLADE_H = 3;                      // blade dimensions (2px overhang each side)
  const STICK_LEN = 54, BLADE_LEN = 20;                 // stick shaft length; blade horizontal extent
  const ARM_SPREAD = 34;                                 // half-distance from chest centre to each arm

  // ── Drawing primitives ────────────────────────────────────────────────────
  function R(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(p(x), p(y), p(w), p(h));
  }

  function RR(x, y, w, h, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(p(x), p(y), p(w), p(h), p(r));
    ctx.fill();
  }

  function RRS(x, y, w, h, r, c, lw) {
    ctx.strokeStyle = c;
    ctx.lineWidth = p(lw);
    ctx.beginPath();
    ctx.roundRect(p(x), p(y), p(w), p(h), p(r));
    ctx.stroke();
  }

  function E(cx, cy, rx, ry, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(p(cx), p(cy), p(rx), p(ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function ES(cx, cy, rx, ry, c, lw) {
    ctx.strokeStyle = c;
    ctx.lineWidth = p(lw);
    ctx.beginPath();
    ctx.ellipse(p(cx), p(cy), p(rx), p(ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function C(cx, cy, r, c) { E(cx, cy, r, r, c); }

  function L(x1, y1, x2, y2, c, lw) {
    ctx.strokeStyle = c;
    ctx.lineWidth   = p(lw);
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(p(x1), p(y1));
    ctx.lineTo(p(x2), p(y2));
    ctx.stroke();
  }

  function A(cx, cy, r, a1, a2, c, lw) {
    ctx.strokeStyle = c;
    ctx.lineWidth   = p(lw);
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.arc(p(cx), p(cy), p(r), a1, a2);
    ctx.stroke();
  }

  // ── Part drawing functions ────────────────────────────────────────────────

  function drawBackground() {
    R(0, 0, LW, LH, COL.iceBg);
    R(0, 102, LW, LH, COL.iceFloor);
    ctx.fillStyle = COL.crease;
    ctx.beginPath();
    ctx.ellipse(p(80), p(132), p(58), p(30), 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(p(tommyX + 80), p(126), p(38), p(5), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStickAt(x, handleY) {
    drawStick(x, handleY, x, handleY + STICK_LEN);
  }

  function drawStick(tx, ty, bx, by) {
    const mx = Math.round(tx * 0.45 + bx * 0.55);
    const my = Math.round(ty * 0.45 + by * 0.55);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = COL.gold;
    ctx.lineWidth = p(4);
    ctx.beginPath(); ctx.moveTo(p(tx), p(ty)); ctx.lineTo(p(mx), p(my)); ctx.stroke();
    ctx.lineWidth = p(7);
    ctx.beginPath(); ctx.moveTo(p(mx), p(my)); ctx.lineTo(p(bx), p(by)); ctx.stroke();
    ctx.strokeStyle = '#2e7a2e'; ctx.lineWidth = p(9);
    ctx.beginPath(); ctx.moveTo(p(bx), p(by)); ctx.lineTo(p(bx + BLADE_LEN), p(by)); ctx.stroke();
    ctx.lineCap = 'round';
  }

  // horiz: PAD_H becomes the width (long edge along x), PAD_W the height (thickness)
  function drawOnePad(x, y, horiz) {
    const w = horiz ? PAD_H : PAD_W;
    const h = horiz ? PAD_W : PAD_H;
    RR(x, y, w, h, PAD_R, COL.padWhite);
    RRS(x, y, w, h, PAD_R, COL.padShd, 1);
  }

  // vert=true: skate rotated 90° (for slide) — boot tall/narrow, blade on right
  function drawOneSkate(x, y, vert) {
    if (vert) {
      RR(x, y, SKATE_H, SKATE_W, SKATE_R, COL.grayDk);
      R(x + SKATE_H, y - 1, BLADE_H, SKATE_W + 2, COL.gray);
    } else {
      RR(x, y, SKATE_W, SKATE_H, SKATE_R, COL.grayDk);
      R(x - 2, y + SKATE_H - 2, BLADE_W, BLADE_H, COL.gray);
    }
  }

  function drawLegPads(lx, rx, y) {
    drawOnePad(lx, y, false);
    drawOnePad(rx, y, false);
  }

  function drawSkates(lx, rx, y) {
    drawOneSkate(lx, y, false);
    drawOneSkate(rx, y, false);
  }

  function drawChestAndShoulders(cx, y) {
    function shoulder(sx, angle) {
      ctx.fillStyle = COL.padWhite;
      ctx.beginPath();
      ctx.ellipse(p(sx), p(y + 5), p(17), p(13), angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COL.padShd;
      ctx.lineWidth = p(0.8);
      ctx.beginPath();
      ctx.ellipse(p(sx), p(y + 5), p(17), p(13), angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    shoulder(cx - 25, -0.3);
    shoulder(cx + 25,  0.3);
    RR(cx - 25, y + 5, 50, 30, 8, COL.padWhite);
    R(cx - 21, y + 11, 42, 9, COL.blueLt);
    R(cx - 21, y + 24, 42, 7, COL.blueMd);
    RRS(cx - 25, y + 5, 50, 30, 8, COL.padShd, 0.8);
  }

  function drawBlocker(cx, y) {
    RR(cx - 8, y, 16, 22, 4, COL.blueMd);
    RR(cx - 15, y - 7, 32, 34, 5, COL.padWhite);
    R(cx - 11, y - 3, 24, 4, COL.blueLt);
    RRS(cx - 15, y - 7, 32, 34, 5, COL.padShd, 0.8);
  }

  function drawGlove(cx, y) {
    RR(cx - 8, y, 16, 22, 4, COL.blueMd);
    RR(cx - 15, y + 8, 30, 26, 5, COL.padWhite);
    RR(cx - 11, y + 12, 22, 16, 3, COL.padShd);
    RR(cx - 9,  y + 14, 18, 12, 2, COL.padDk);
    for (let i = 0; i < 4; i++) {
      L(cx - 8 + i * 5, y + 15, cx - 8 + i * 5, y + 26, COL.padShd, 0.6);
    }
    E(cx, y + 10, 13, 5, COL.padWhite);
    R(cx - 11, y + 26, 22, 6, COL.blueLt);
    RRS(cx - 15, y + 8, 30, 26, 5, COL.padShd, 0.8);
  }

  // expr: "normal" | "happy" | "sad" | "tired"
  function drawFace(cx, cy, expr) {
    C(cx, cy, 14, COL.cream);

    if (expr === "happy") {
      A(cx - 6, cy - 3, 3.5, Math.PI * 1.15, Math.PI * 1.85, COL.brown, 2.2);
      A(cx + 6, cy - 3, 3.5, Math.PI * 1.15, Math.PI * 1.85, COL.brown, 2.2);
    } else if (expr === "sad") {
      C(cx - 6, cy - 3, 3, COL.brown);
      C(cx + 6, cy - 3, 3, COL.brown);
      L(cx - 10, cy - 8, cx - 3, cy - 6, COL.brown, 1.5);
      L(cx + 3,  cy - 6, cx + 10, cy - 8, COL.brown, 1.5);
    } else if (expr === "tired") {
      C(cx - 6, cy - 3, 3, COL.brown);
      C(cx + 6, cy - 3, 3, COL.brown);
      R(cx - 10, cy - 6, 8, 4, COL.cream);
      R(cx + 2,  cy - 6, 8, 4, COL.cream);
    } else {
      C(cx - 6, cy - 3, 3, COL.brown);
      C(cx + 6, cy - 3, 3, COL.brown);
    }

    C(cx, cy + 3, 2, COL.brown);
  }

  function drawHelmet(cx, cy) {
    E(cx, cy, 22, 22, COL.padWhite);
    [[cx-9, cy-14],[cx, cy-16],[cx+9, cy-14],
     [cx-13, cy-8],[cx+13, cy-8],
     [cx-8,  cy-2],[cx+8,  cy-2]].forEach(([hx, hy]) => C(hx, hy, 2.2, COL.gray));
    ctx.fillStyle = COL.blueLt + "bb";
    ctx.beginPath();
    ctx.ellipse(p(cx), p(cy + 7), p(16), p(9), 0, 0, Math.PI * 2);
    ctx.fill();
    R(cx - 14, cy + 14, 28, 5, COL.gray);
    ES(cx, cy, 22, 22, COL.padShd, 1);
  }

  // ── Pose composers ────────────────────────────────────────────────────────
  // All Tommy drawing is wrapped in ctx.save/translate(TX)/restore so
  // the wider canvas shows more background on each side.

  function drawReady(bob, ox, expr, lean) {
    ox   = ox   || 0;
    expr = expr || "normal";
    lean = lean || 0;
    const bx = ox + lean * 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(20 + ox, 70 + ox, 116 + bob);
    drawLegPads(20 + ox, 70 + ox, 72 + bob);
    drawChestAndShoulders(64 + bx, 46 + bob);
    drawBlocker(30 + bx, 48 + bob);
    drawGlove(98 + bx, 48 + bob);
    drawStickAt(34 + ox, 64 + bob);
    drawFace(64 + bx, 35 + bob, expr);
    drawHelmet(64 + bx, 21 + bob);
    ctx.restore();
  }

  function drawTiredPose(bob, ox) {
    ox = ox || 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(20 + ox, 70 + ox, 116 + bob);
    drawLegPads(20 + ox, 70 + ox, 74 + bob);
    drawChestAndShoulders(64 + ox, 50 + bob);
    drawBlocker(30 + ox, 52 + bob);
    drawGlove(98 + ox, 52 + bob);
    drawStickAt(34 + ox, 66 + bob);
    drawFace(64 + ox, 40 + bob, "tired");
    drawHelmet(64 + ox, 26 + bob);
    ctx.restore();
  }

  function drawSadIdlePose(ox) {
    ox = ox || 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(20 + ox, 70 + ox, 116);
    drawLegPads(20 + ox, 70 + ox, 74);
    drawChestAndShoulders(64 + ox, 50);
    drawBlocker(30 + ox, 54);
    drawGlove(98 + ox, 54);
    drawStickAt(32 + ox, 68);
    drawFace(64 + ox, 38, "sad");
    drawHelmet(64 + ox, 24);
    ctx.restore();
  }

  function drawStretchPose(ox) {
    ox = ox || 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(20 + ox, 70 + ox, 116);
    drawLegPads(20 + ox, 70 + ox, 72);
    drawChestAndShoulders(64 + ox, 46);
    drawBlocker(18 + ox, 44);
    drawGlove(110 + ox, 44);
    drawStickAt(24 + ox, 64);
    drawFace(64 + ox, 35, "happy");
    drawHelmet(64 + ox, 21);
    ctx.restore();
  }

  function drawSaveLeft() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(16, 66, 116);
    drawLegPads(15, 64, 72);
    drawChestAndShoulders(61, 47);
    drawBlocker(20, 45);
    drawGlove(95, 49);
    drawStickAt(30, 66);
    drawFace(61, 35, "normal");
    drawHelmet(61, 21);
    ctx.restore();
  }

  function drawSaveRight() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(24, 74, 116);
    drawLegPads(26, 74, 72);
    drawChestAndShoulders(67, 47);
    drawBlocker(34, 49);
    drawGlove(108, 45);
    drawStickAt(36, 64);
    drawFace(67, 35, "normal");
    drawHelmet(67, 21);
    ctx.restore();
  }

  function drawSaveCenter() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(18, 68, 118);
    drawLegPads(16, 66, 76);
    drawChestAndShoulders(64, 50);
    drawBlocker(30, 52);
    drawGlove(98, 52);
    drawStickAt(32, 68);
    drawFace(64, 38, "normal");
    drawHelmet(64, 24);
    ctx.restore();
  }

  function drawCelebrate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(20, 70, 116);
    drawLegPads(20, 70, 72);
    drawChestAndShoulders(64, 46);
    drawBlocker(22, 32);
    drawGlove(106, 32);
    drawStickAt(34, 64);
    drawFace(64, 35, "happy");
    drawHelmet(64, 21);
    ctx.restore();
  }

  function drawGoalScored() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    drawSkates(18, 68, 118);
    drawLegPads(18, 68, 76);
    drawChestAndShoulders(62, 50);
    drawBlocker(28, 54);
    drawGlove(96, 54);
    drawStickAt(28, 70);
    drawFace(62, 38, "sad");
    drawHelmet(62, 24);
    ctx.restore();
  }

  function drawButterfly(ox) {
    ox = ox || 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save(); ctx.translate(p(TX), 0);
    // Pads flared horizontal (long edge along x)
    drawOnePad(20 + ox, 100, true);
    drawOnePad(70 + ox, 100, true);
    // Skate tips visible at outer edges (rotate and uncomment when ready)
    // drawOneSkate(-4 + ox, 116, false);
    // drawOneSkate(108 + ox, 116, false);
    // Upper body (lower than normal — squatted)
    drawChestAndShoulders(64 + ox, 62);
    drawBlocker(30 + ox, 66);
    drawGlove(98 + ox, 66);
    drawStickAt(36 + ox, 80);
    drawFace(64 + ox, 50, "normal");
    drawHelmet(64 + ox, 36);
    ctx.restore();
  }

  function drawPadSlide(ox, flipX) {
    ox = ox || 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save();
    if (flipX) { ctx.translate(p(LW), 0); ctx.scale(-1, 1); ox = -ox; }
    ctx.save(); ctx.translate(p(TX), 0);

    const slideOY = 10;  // shift everything up to keep blocker on-screen

    // Pads — horizontal, spread apart
    drawOnePad(66 + ox, 112 - slideOY, true);   // back pad (lower)

    // Front pad — tilted 15° CCW (left/top end rises)
    ctx.save();
    ctx.translate(p(66 + ox + PAD_H / 2), p(55 - slideOY + PAD_W / 2));
    ctx.rotate(-Math.PI / 12);
    drawOnePad(-PAD_H / 2, -PAD_W / 2, true);
    ctx.restore();

    // Back skate — upright, flush with back pad
    drawOneSkate(66 + ox + PAD_H, 108 - slideOY, true);

    // Front skate — tilted 15° CCW to match front pad; pivot at pad's right-edge centre
    ctx.save();
    ctx.translate(p(66 + ox + PAD_H / 2 + PAD_H / 2 * Math.cos(Math.PI / 12)),
                  p(55 - slideOY + PAD_W / 2 - PAD_H / 2 * Math.sin(Math.PI / 12)));
    ctx.rotate(-Math.PI / 12);
    drawOneSkate(0, -SKATE_W / 2, true);
    ctx.restore();

    const torsoY = 95 - slideOY;

    // Torso — rotated 90° CW; pivot at (60+ox, torsoY)
    ctx.save();
    ctx.translate(p(60 + ox), p(torsoY));
    ctx.rotate(Math.PI * 0.5);
    ctx.fillStyle = COL.padWhite;
    ctx.beginPath(); ctx.ellipse(0, p(9), p(34), p(12), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.padShd; ctx.lineWidth = p(0.8);
    ctx.beginPath(); ctx.ellipse(0, p(9), p(34), p(12), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COL.padWhite;
    ctx.beginPath(); ctx.roundRect(-p(25), -p(15), p(50), p(30), p(8)); ctx.fill();
    ctx.fillStyle = COL.blueLt; ctx.fillRect(-p(21), -p(9), p(42), p(9));
    ctx.fillStyle = COL.blueMd; ctx.fillRect(-p(21),  p(4), p(42), p(7));
    ctx.strokeStyle = COL.padShd; ctx.lineWidth = p(0.8);
    ctx.beginPath(); ctx.roundRect(-p(25), -p(15), p(50), p(30), p(8)); ctx.stroke();
    ctx.restore();

    // Blocker — right arm extended left, ARM_SPREAD below torso
    ctx.save();
    ctx.translate(p(46 + ox), p(torsoY + ARM_SPREAD));
    ctx.rotate(Math.PI * 0.47);
    drawBlocker(0, 0);
    ctx.restore();

    // Face first (so helmet renders on top)
    ctx.save();
    ctx.translate(p(25 + ox), p(96 - slideOY));
    ctx.rotate(Math.PI * -0.25);
    drawFace(0, 0, "normal");
    ctx.restore();

    // Helmet
    ctx.save();
    ctx.translate(p(16 + ox), p(86 - slideOY));
    ctx.rotate(Math.PI * -0.25);
    drawHelmet(0, 0);
    ctx.restore();

    // Glove — left arm extended left, ARM_SPREAD above torso
    ctx.save();
    ctx.translate(p(34 + ox), p(torsoY - ARM_SPREAD));
    ctx.rotate(Math.PI * -0.3);
    drawGlove(0, 0);
    ctx.restore();

    ctx.restore();  // outer TX save

    // Stick — original coordinates preserved; only ox shift applied, no TX
    ctx.save();
    ctx.translate(p(ox), 0);
    ctx.rotate(Math.PI * -0.5);
    drawStick(-120, 50, -120, -24);
    ctx.restore();

    ctx.restore();  // flip save (no-op when flipX is false)
  }

  // ── Idle behaviour state machine ──────────────────────────────────────────

  const BHVR = { STAND:"stand", WALK_L:"walkL", WALK_R:"walkR",
                 STRETCH:"stretch", BUTTERFLY:"butterfly", SLIDE:"slide" };

  const TRANSITIONS = {
    stand    : [[BHVR.WALK_L,22],[BHVR.WALK_R,22],[BHVR.STRETCH,28],[BHVR.BUTTERFLY,28]],
    walkL    : [[BHVR.STAND,24],[BHVR.STRETCH,22],[BHVR.SLIDE,30],[BHVR.BUTTERFLY,24]],
    walkR    : [[BHVR.STAND,24],[BHVR.STRETCH,22],[BHVR.SLIDE,30],[BHVR.BUTTERFLY,24]],
    stretch  : [[BHVR.STAND,30],[BHVR.WALK_L,25],[BHVR.WALK_R,25],[BHVR.BUTTERFLY,20]],
    butterfly: [[BHVR.STAND,40],[BHVR.WALK_L,30],[BHVR.WALK_R,30]],
    slide    : [[BHVR.STAND,45],[BHVR.WALK_L,28],[BHVR.WALK_R,27]],
  };

  const DURATIONS = {
    stand    : [600, 1500],
    walkL    : [1200, 3000],
    walkR    : [1200, 3000],
    stretch  : [800, 2000],
    butterfly: [400, 900],
    slide    : [1500, 2000],
  };

  function pickNext(current) {
    const opts  = TRANSITIONS[current];
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let rnd = Math.random() * total;
    for (const [next, w] of opts) { rnd -= w; if (rnd <= 0) return next; }
    return opts[0][0];
  }

  let behavior    = BHVR.STAND;
  let behaviorEnd = 0;
  let tommyX      = 0;
  let slideDir    = 1;   // 1 = slide right (feet right), -1 = slide left (feet left)

  const WALK_SPD = 0.18;
  const X_MIN = -34, X_MAX = 34;

  function startBehavior(b, from) {
    if (b === BHVR.SLIDE) {
      if (from === BHVR.WALK_L) slideDir = -1;
      else if (from === BHVR.WALK_R) slideDir = 1;
      if (state === "idle") showChirp(randomFrom(SLIDE_CHIRPS));
    } else if (b === BHVR.BUTTERFLY) {
      if (state === "idle") showChirp(randomFrom(BUTTERFLY_CHIRPS));
    } else if (b === BHVR.STAND && from === BHVR.SLIDE) {
      if (state === "idle") showChirp(randomFrom(STANDUP_CHIRPS));
    }
    behavior = b;
    const [mn, mx] = DURATIONS[b];
    behaviorEnd = performance.now() + mn + Math.random() * (mx - mn);
  }

  function updateBehavior(now) {
    if (now >= behaviorEnd) startBehavior(pickNext(behavior), behavior);

    if (behavior === BHVR.WALK_L) {
      tommyX -= WALK_SPD;
      if (tommyX <= X_MIN) { tommyX = X_MIN; startBehavior(BHVR.STAND); }
    } else if (behavior === BHVR.WALK_R) {
      tommyX += WALK_SPD;
      if (tommyX >= X_MAX) { tommyX = X_MAX; startBehavior(BHVR.STAND); }
    }
  }

  function drawIdleFrame() {
    switch (behavior) {
      case BHVR.WALK_L:     drawReady(idleBob, tommyX, "normal", -1); break;
      case BHVR.WALK_R:     drawReady(idleBob, tommyX, "normal",  1); break;
      case BHVR.STRETCH:    drawStretchPose(tommyX);                   break;
      case BHVR.BUTTERFLY:  drawButterfly(tommyX);                     break;
      case BHVR.SLIDE:      drawPadSlide(tommyX, slideDir === -1);      break;
      default:              drawReady(idleBob, tommyX, "normal", 0);   break;
    }
  }

  // ── Chirp quotes ──────────────────────────────────────────────────────────
  const CHIRPS = [
    "I stopped 34 shots. You're welcome.",
    "The five-hole is a myth. For me.",
    "Tell your wingers to backcheck.",
    "I see everything from back here.",
    "Another shutout? Just another Tuesday.",
    "The butterfly doesn't lie.",
    "My pads have seen things. Dark things.",
    "You call that a shot?",
    "Sorry, the net is closed.",
    "Goalies run this team. Don't @ me.",
  ];

  const SAVE_CHIRPS = [
    "Not today.",
    "I read that the whole way.",
    "Glove side? Bold choice.",
    "Too slow.",
    "Was that even a shot?",
    "My stick says no.",
    "The butterfly is closed.",
    "Robbed.",
  ];

  const MISS_CHIRPS = [
    "Okay, fair enough.",
    "I had a cramp.",
    "The sun was in my eyes.",
    "I was guarding the five-hole. Mentally.",
    "That one counts as practice.",
    "Skate lace issue.",
    "I let that one in on purpose. Team morale.",
  ];

  const BUTTERFLY_CHIRPS = [
    "Butterfly!",
    "Five-hole? Sealed.",
    "Legs down.",
    "Classic.",
    "This is my move.",
  ];

  const SLIDE_CHIRPS = [
    "Take that!",
    "Going left!",
    "Full stretch!",
    "I've got this whole side.",
    "Not on my watch.",
  ];

  const STANDUP_CHIRPS = [
    "I'm awesome.",
    "Still got it.",
    "Easy.",
    "Back to work.",
    "Did you see that?",
  ];

  const chirpEl  = document.getElementById("adopt-chirp");
  let chirpTimer     = null;
  let idleChirpTimer = null;
  let lastChirpAt    = 0;
  const CHIRP_COOLDOWN_MS = 3000;  // minimum 3 s between any chirps

  function showChirp(text, force) {
    if (!force && performance.now() - lastChirpAt < CHIRP_COOLDOWN_MS) return;
    lastChirpAt = performance.now();
    chirpEl.classList.remove("fade");
    chirpEl.textContent = "”" + text + "”";
    const r  = canvas.getBoundingClientRect();
    const cx = r.left + (TX + 64 + tommyX) * r.width  / LW;
    const cy = r.top  + 70                 * r.height / LH;
    const bw = 240;
    chirpEl.style.left = Math.max(4, Math.min(cx - bw / 2, window.innerWidth - bw - 8)) + 'px';
    chirpEl.style.top  = Math.max(4, cy + 8) + 'px';
    chirpEl.classList.add("show");
    clearTimeout(chirpTimer);
    chirpTimer = setTimeout(() => {
      chirpEl.classList.remove("show");
      chirpEl.classList.add("fade");
    }, 3200);
  }

  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function scheduleIdleChirp() {
    clearTimeout(idleChirpTimer);
    idleChirpTimer = setTimeout(() => {
      if (state === "idle") showChirp(randomFrom(CHIRPS));
      scheduleIdleChirp();
    }, 20000 + Math.random() * 25000);  // 20–45 s between chirps (~5 s quiet after fade)
  }

  canvas.addEventListener("click", (e) => {
    if (state !== "idle") return;
    frozenPoseFn = null;
    const r  = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width;
    const cy = (e.clientY - r.top)  / r.height;
    if (cx > 0.1 && cx < 0.9 && cy > 0.05 && cy < 0.95) showChirp(randomFrom(CHIRPS));
  });

  // ── Game state ────────────────────────────────────────────────────────────
  let state = "idle";
  let frozenPoseFn = null; // when set, render loop holds this pose instead of animating

  let idleBob  = 0;
  let idleTick = 0;
  const IDLE_SPD = 28;

  const SHOTS_PER_LEVEL    = 8;
  const MIN_SAVES_PASS     = 4;
  const MAX_LEVEL          = 5;
  const START_MS           = 1000;
  const SPEED_STEP_MS      = 40;
  const LEVEL_BASE_DROP_MS = 150;
  const MIN_MS             = 500;

  let level      = 1;
  let levelShots = 0;
  let levelSaves = 0;
  let totalSaves = 0;
  let travelMs   = START_MS;
  let puck       = null;
  let answered   = false;
  let shotTimer  = null;

  const ZONES = ["left", "center", "right"];

  const trainBtn  = document.getElementById("adopt-train");
  const zoneWrap  = document.getElementById("adopt-zones");
  const btnLeft   = document.getElementById("zone-left");
  const btnCenter = document.getElementById("zone-center");
  const btnRight  = document.getElementById("zone-right");
  const scoreEl     = document.getElementById("adopt-score");
  const modal       = document.getElementById("adopt-modal");
  const modalTitle  = document.getElementById("adopt-modal-title");
  const modalBody   = document.getElementById("adopt-modal-body");
  const replayBtn   = document.getElementById("adopt-replay");
  const closeBtn    = document.getElementById("adopt-modal-close");
  const endBtn      = document.getElementById("adopt-end");

  function setZonesEnabled(on) {
    [btnLeft, btnCenter, btnRight].forEach(b => { b.disabled = !on; });
  }

  function showTrainingUI(on) {
    zoneWrap.classList.toggle("hidden", !on);
    scoreEl.classList.toggle("hidden",  !on);
    endBtn.classList.toggle("hidden",   !on);
  }

  function updateScore() {
    scoreEl.textContent = "Level " + level + "  ·  " + levelSaves + " / " + levelShots + " saves";
  }

  // Zone x-targets are in canvas pixels, accounting for the TX translate
  function zoneX(zone) {
    if (zone === "left")  return p(TX + 22);
    if (zone === "right") return p(TX + 106);
    return p(TX + 64);
  }

  function launchShot() {
    if (levelShots >= SHOTS_PER_LEVEL) {
      if (levelSaves < MIN_SAVES_PASS) { endRound(false); return; }
      if (level >= MAX_LEVEL)          { endRound(true);  return; }
      levelUp(); return;
    }
    answered = false;
    setZonesEnabled(true);
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const tx = zoneX(zone);
    const ty = p(88);
    const sx = tx + (Math.random() - 0.5) * p(50);
    puck = { x: sx, y: p(2), tx, ty, startTime: performance.now(), zone };
    clearTimeout(shotTimer);
    shotTimer = setTimeout(() => { if (!answered) resolveShot(null); }, travelMs);
  }

  function levelUp() {
    level++;
    levelShots = 0;
    levelSaves = 0;
    travelMs   = Math.max(MIN_MS, START_MS - (level - 1) * LEVEL_BASE_DROP_MS);
    showChirp("Level " + level + "! Pick it up!", true);
    updateScore();
    setTimeout(launchShot, 1600);
  }

  function resolveShot(playerZone) {
    if (answered) return;
    answered = true;
    clearTimeout(shotTimer);
    setZonesEnabled(false);
    levelShots++;
    travelMs = Math.max(MIN_MS, START_MS - (level - 1) * LEVEL_BASE_DROP_MS - levelShots * SPEED_STEP_MS);

    if (playerZone === puck.zone) {
      levelSaves++;
      totalSaves++;
      if (puck.zone === "left")        drawSaveLeft();
      else if (puck.zone === "right")  drawSaveRight();
      else                             drawSaveCenter();
      showChirp(randomFrom(SAVE_CHIRPS), true);
    } else {
      drawGoalScored();
      showChirp(randomFrom(MISS_CHIRPS), true);
    }
    puck = null;
    updateScore();
    setTimeout(launchShot, 950);
  }

  function endRound(won) {
    state = "result";
    puck  = null;
    showTrainingUI(false);
    trainBtn.classList.add("hidden");

    const totalShots  = (level - 1) * SHOTS_PER_LEVEL + levelShots;
    const totalMisses = totalShots - totalSaves;

    if (won) {
      modalTitle.textContent = "Unstoppable.";
      modalBody.innerHTML    = "All " + MAX_LEVEL + " levels cleared!<br>" +
                               totalSaves + " saves, " + totalMisses + " goals — Tommy is in peak form.";
    } else {
      modalTitle.textContent = "Training over.";
      modalBody.innerHTML    = "Made it to level " + level + " — " +
                               levelSaves + "/" + SHOTS_PER_LEVEL + " saves (need " + MIN_SAVES_PASS + " to advance).<br>" +
                               "Total: " + totalSaves + " saves, " + totalMisses + " goals.";
    }

    modal.showModal();
    state = "idle";   // Tommy goes back to idle animation

    const best = parseInt(localStorage.getItem("tommy-best") || "0", 10);
    if (totalSaves > best) localStorage.setItem("tommy-best", String(totalSaves));
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function render() {
    const now = performance.now();

    if (state === "idle") {
      if (frozenPoseFn) {
        frozenPoseFn();
      } else {
        updateBehavior(now);
        idleTick++;
        if (idleTick >= IDLE_SPD) {
          idleTick = 0;
          idleBob  = 1 - idleBob;
        }
        try { drawIdleFrame(); } catch (e) { drawReady(idleBob, tommyX, "normal", 0); }
      }
    }

    if (state === "training" && puck) {
      const progress = Math.min(1, (now - puck.startTime) / travelMs);
      const px2 = puck.x + (puck.tx - puck.x) * progress;
      const py2 = puck.y + (puck.ty - puck.y) * progress;
      drawReady(idleBob, 0, "normal", 0);
      ctx.fillStyle = COL.black;
      ctx.beginPath();
      ctx.arc(px2, py2, p(4), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COL.gray;
      ctx.lineWidth = p(0.5);
      ctx.beginPath();
      ctx.arc(px2, py2, p(4), 0, Math.PI * 2);
      ctx.stroke();
    }

    requestAnimationFrame(render);
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function startTraining() {
    state      = "training";
    level      = 1;
    levelShots = 0;
    levelSaves = 0;
    totalSaves = 0;
    travelMs   = START_MS;
    puck       = null;
    modal.close();
    trainBtn.classList.add("hidden");
    showTrainingUI(true);
    updateScore();
    launchShot();
  }

  trainBtn.addEventListener("click",  startTraining);
  replayBtn.addEventListener("click", startTraining);
  closeBtn.addEventListener("click",  () => { modal.close(); trainBtn.classList.remove("hidden"); });
  endBtn.addEventListener("click",    () => { clearTimeout(shotTimer); endRound(false); });
  btnLeft.addEventListener("click",   () => resolveShot("left"));
  btnCenter.addEventListener("click", () => resolveShot("center"));
  btnRight.addEventListener("click",  () => resolveShot("right"));

  document.addEventListener("keydown", (e) => {
    if (state !== "training") return;
    if (e.key === "ArrowLeft")  resolveShot("left");
    if (e.key === "ArrowRight") resolveShot("right");
    if (e.key === "ArrowDown")  resolveShot("center");
  });

  // ── Debug grid (add ?debug to URL to enable) ─────────────────────────────
  const DEBUG_POSES = [
    { name: 'stand',     fn: () => drawReady(0, 0, 'normal', 0)  },
    { name: 'walk L',    fn: () => drawReady(0, 0, 'normal', -1) },
    { name: 'walk R',    fn: () => drawReady(0, 0, 'normal',  1) },
    { name: 'stretch',   fn: () => drawStretchPose(0)            },
    { name: 'butterfly', fn: () => drawButterfly(0)              },
    { name: 'slide',     fn: () => drawPadSlide(0)               },
    { name: 'save L',    fn: () => drawSaveLeft()                },
    { name: 'save C',    fn: () => drawSaveCenter()              },
    { name: 'save R',    fn: () => drawSaveRight()               },
    { name: 'celebrate', fn: () => drawCelebrate()               },
    { name: 'goal',      fn: () => drawGoalScored()              },
  ];

  const debugEnabled = new URLSearchParams(location.search).has('debug');
  let debugWrap = null;
  let debugBtn  = null;
  let debugOpen = false;

  if (debugEnabled) {
    const section = canvas.closest('section');
    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'adopt-debug-toggle';
    debugBtn = document.createElement('button');
    debugBtn.className = 'adopt-debug-btn';
    debugBtn.textContent = 'poses';
    toggleDiv.appendChild(debugBtn);

    debugWrap = document.createElement('div');
    debugWrap.className = 'adopt-debug hidden';

    section.append(toggleDiv, debugWrap);
  }

  function buildDebugGrid() {
    DEBUG_POSES.forEach(({ name, fn }) => {
      const cell = document.createElement('div');
      cell.className = 'adopt-debug-cell';

      const tc = document.createElement('canvas');
      tc.width  = canvas.width;
      tc.height = canvas.height;
      tc.style.cssText = 'width:160px;height:auto;image-rendering:pixelated;border-radius:6px;border:1px solid #c8dce8;cursor:pointer;';

      try {
        fn();
        tc.getContext('2d').drawImage(canvas, 0, 0);
      } catch (err) {
        const tctx = tc.getContext('2d');
        tctx.fillStyle = '#fdd';
        tctx.fillRect(0, 0, tc.width, tc.height);
        tctx.fillStyle = '#900';
        tctx.font = '24px monospace';
        tctx.fillText('ERR', 10, 40);
      }

      const lbl = document.createElement('div');
      lbl.className = 'adopt-debug-label';
      lbl.textContent = name;

      tc.addEventListener('click', () => { state = 'idle'; frozenPoseFn = fn; });

      cell.append(tc, lbl);
      debugWrap.appendChild(cell);
    });
  }

  function toggleDebug() {
    debugOpen = !debugOpen;
    debugWrap.classList.toggle('hidden', !debugOpen);
    debugBtn.textContent = debugOpen ? 'hide poses' : 'poses';
  }

  if (debugEnabled) {
    debugBtn.addEventListener('click', toggleDebug);
    document.addEventListener("keydown", (e) => {
      if ((e.key === "d" || e.key === "D") && !e.ctrlKey && !e.metaKey) toggleDebug();
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  startBehavior(BHVR.STAND);
  scheduleIdleChirp();
  showTrainingUI(false);
  if (debugEnabled) buildDebugGrid();
  drawReady(0, 0, "normal", 0);
  requestAnimationFrame(render);
});
