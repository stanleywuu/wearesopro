// Create-a-Player renderer. Pure drawing — no DOM access, no event handling.
//
// 2.5D "silhouette slab" approach: every body part stays a 2D shape whose
// projected width, screen position, depth and shading are recomputed from the
// yaw angle. Shape identity comes from the outline, not from real geometry.

(function () {

  // Logical canvas grid, scaled up by S for a crisp bitmap (same idea as adopt.js).
  const LW = 180, LH = 200, S = 4;
  const p = n => n * S;

  // Camera: yaw only, with a fixed downward tilt so we look slightly onto the player.
  const CX = LW / 2;        // logical x of the player's centre line
  const GROUND = LH - 22;   // logical y of the ice under the skates
  const TOP_MARGIN = 15;    // logical gap wanted above the helmet

  // Uniform zoom so short and tall builds both fill the frame. Set once per
  // render from the figure's height; capped so a tiny build does not blow up
  // far enough to push the stick blade out of the canvas when turned sideways.
  let FIT = 1;

  // Highlight animation state for the current frame, or null when idle. Set by
  // render() and read by the parts that move: the player crouches and leans,
  // the stick sweeps, and the whole figure glides across the ice.
  let ANIM = null;
  let SHIFT = 0;
  const PAN_MAX = 180;      // far enough that the stick and shadow clear the edge too
  const TILT = 0.16;        // how much +z (towards viewer) drops on screen
  const PERSP = 0.0028;     // weak perspective: growth per unit of +z
  const LIGHT_YAW = -0.6;   // light direction, radians

  const OUTLINE = "#1B2A38";
  const OUTLINE_W = 1.6;
  const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  // ---- primitives -------------------------------------------------------

  function E(ctx, cx, cy, rx, ry, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(p(cx), p(cy), p(rx), p(ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function L(ctx, x1, y1, x2, y2, c, lw) {
    ctx.strokeStyle = c;
    ctx.lineWidth = p(lw || 1);
    ctx.beginPath();
    ctx.moveTo(p(x1), p(y1));
    ctx.lineTo(p(x2), p(y2));
    ctx.stroke();
  }

  // ---- math helpers -----------------------------------------------------

  function rotY(x, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: x * c + z * s, z: -x * s + z * c };
  }

  function scaleAt(z) {
    return 1 + z * PERSP;
  }

  // Body space: x right, y up from the ice, z towards the viewer.
  // k carries the fit zoom, so anything sized by it scales with the figure.
  function project(x, y, z) {
    const k = scaleAt(z) * FIT;
    return { sx: CX + SHIFT + x * k, sy: GROUND - y * k + z * TILT * FIT, d: z, k: k };
  }

  // Half-width of a part once it has turned by yaw.
  function silWidth(rx, rz, yaw, boxy) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    return boxy ? rx * c + rz * s : Math.hypot(rx * c, rz * s);
  }

  function shade(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const to = t > 0 ? 255 : 0, a = Math.abs(t);
    const mix = v => Math.round(v + (to - v) * a);
    const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function depthSort(parts) {
    parts.sort((a, b) => a.d - b.d);
  }

  // ---- slab paths -------------------------------------------------------

  const KAPPA = 0.5523;

  // Egg/ellipse outline. taper < 1 narrows the top half.
  function pathEgg(ctx, cx, cy, hw, hh, taper) {
    const x = p(cx), y = p(cy), w = p(hw), h = p(hh), tw = w * taper;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.bezierCurveTo(x + tw * KAPPA, y - h, x + w, y - h * KAPPA, x + w, y);
    ctx.bezierCurveTo(x + w, y + h * KAPPA, x + w * KAPPA, y + h, x, y + h);
    ctx.bezierCurveTo(x - w * KAPPA, y + h, x - w, y + h * KAPPA, x - w, y);
    ctx.bezierCurveTo(x - w, y - h * KAPPA, x - tw * KAPPA, y - h, x, y - h);
    ctx.closePath();
  }

  // Closed polygon with rounded corners. r is clamped per corner so a large
  // radius degrades gracefully into a pill instead of self-intersecting.
  function pathRoundedPoly(ctx, pts, r) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const next = pts[(i + 1) % pts.length];
      const a = edgePoint(cur, prev, r);
      const b = edgePoint(cur, next, r);
      if (i === 0) ctx.moveTo(a.x, a.y);
      else ctx.lineTo(a.x, a.y);
      ctx.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
    }
    ctx.closePath();
  }

  // A point r along the edge from corner towards target, capped at half the edge.
  function edgePoint(corner, target, r) {
    const dx = target.x - corner.x, dy = target.y - corner.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(r, len / 2) / len;
    return { x: corner.x + dx * t, y: corner.y + dy * t };
  }

  // Rounded, optionally tapered box outline. round is a 0..1 corner fraction.
  function pathBox(ctx, cx, cy, hw, hh, taper, round) {
    const x = p(cx), y = p(cy), w = p(hw), h = p(hh), tw = w * taper;
    const pts = [
      { x: x - tw, y: y - h },
      { x: x + tw, y: y - h },
      { x: x + w, y: y + h },
      { x: x - w, y: y + h }
    ];
    pathRoundedPoly(ctx, pts, Math.min(w, h) * round);
  }

  // ---- slab drawing -----------------------------------------------------

  // Horizontal 2-stop gradient, bright side following the light as the part turns.
  function slabFill(ctx, cx, hw, color, yaw) {
    const lit = Math.cos(yaw - LIGHT_YAW);
    const g = ctx.createLinearGradient(p(cx - hw), 0, p(cx + hw), 0);
    const a = shade(color, 0.18), b = shade(color, -0.22);
    g.addColorStop(0, lit >= 0 ? a : b);
    g.addColorStop(1, lit >= 0 ? b : a);
    return g;
  }

  function drawSlab(ctx, s) {
    // Round is a smooth egg; pill and blocky are straight-sided, differing in
    // how hard their corners are.
    if (s.shape === "ellipsoid") pathEgg(ctx, s.cx, s.cy, s.hw, s.hh, s.taper);
    else pathBox(ctx, s.cx, s.cy, s.hw, s.hh, s.taper, s.round);
    ctx.fillStyle = slabFill(ctx, s.cx, s.hw, s.color, s.yaw);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(OUTLINE_W);
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // ---- parameters -> dimensions ----------------------------------------

  // Maps a shape id + contour (0..1) onto the outline knobs the slab needs.
  // Low contour reads as narrow-shouldered, high as a round barrel.
  // Blocky ignores contour — its slider is hidden (see create-a-player.js).
  function shapeStyle(shape, contour) {
    if (shape === "ellipsoid") return { id: shape, taper: 0.45 + 0.60 * contour, round: 1, boxy: 0 };
    if (shape === "capsule")   return { id: shape, taper: 0.50 + 0.55 * contour, round: 1, boxy: 0 };
    return { id: "cube", taper: 0.85, round: 0.10, boxy: 1 };
  }

  const HIP_Y = 48;          // where the legs meet the torso
  const SKATE_Y = 5;         // centre height of a skate

  function computeDims(params) {
    const bw = params.bodyWidth / 100, bh = params.bodyHeight / 100;
    const hw = params.headWidth / 100, hh = params.headHeight / 100;

    // A crouch drops the hips and leans the upper body forward. Forward is +z
    // in body space, which is what reads as "towards the net" in the side view
    // the highlight uses.
    const crouch = ANIM ? ANIM.crouch : 0;
    const flop = ANIM && ANIM.drop ? ANIM.drop : 0;   // butterfly, 0..1
    const drop = crouch * 12;
    const lean = crouch * 7;
    const hipY = HIP_Y - drop - 15 * flop;

    // A goalie at rest stands straight with both hands on the knob of an
    // upright stick and his head tipped forward onto them - the Dryden pose.
    // Only while idle: mid-highlight he takes the ordinary skating stance.
    const rest = params.position === "Goalie" && (!ANIM || Boolean(ANIM.rest));

    const torso = { rx: 22 * bw, ry: 26 * bh, x: 0, z: lean + (rest ? 2 : 0) };
    torso.rz = torso.rx * 0.62;
    torso.y = hipY + torso.ry * 0.8;

    const head = { rx: 14 * hw, ry: 15 * hh, x: 0, z: lean * 1.5 };
    head.rz = head.rx * 0.8;
    head.y = torso.y + torso.ry + head.ry * 0.8;
    if (rest) {
      head.z += 11;                // lean out over the stick
      head.y -= head.ry * 0.30;    // and sink the neck onto the hands
    }

    // Kept inboard of the silhouette: an arm rooted at the torso's full width
    // leaves a rounded nub poking out above the shoulder.
    const shoulderY = torso.y + torso.ry * 0.45;
    return {
      torso: torso,
      head: head,
      hipY: hipY,
      crouch: crouch,
      goalie: params.position === "Goalie",
      rest: rest,
      flop: flop,
      // Framing is measured standing, so crouching does not zoom the figure.
      topY: head.y + head.ry * 1.12 + drop,
      shoulderY: shoulderY,
      legX: Math.max(7, torso.rx * 0.52),
      bodyStyle: shapeStyle(params.bodyShape, params.bodyContour / 100),
      headStyle: shapeStyle(params.headShape, params.headContour / 100)
    };
  }

  // ---- parts ------------------------------------------------------------

  // Every part is an anchor in body space plus a slab spec. Rotating the anchor
  // is what gives each part its depth for the painter's sort.
  function slabPart(ctx, o, yaw) {
    const r = rotY(o.x, o.z, yaw);
    const c = project(r.x, o.y, r.z);
    return {
      d: r.z,
      draw: () => drawSlab(ctx, {
        cx: c.sx, cy: c.sy,
        hw: silWidth(o.rx, o.rz, yaw, o.style.boxy) * c.k,
        hh: o.ry * c.k,
        shape: o.style.id, taper: o.style.taper, round: o.style.round,
        color: o.color, yaw: yaw
      })
    };
  }

  function bodyParts(ctx, dims, params, yaw) {
    const legs = [-1, 1].map(s => legPart(ctx, dims, params, yaw, s));
    const skates = [-1, 1].map(s => skatePart(ctx, yaw, s * dims.legX));
    const cuffs = [-1, 1].map((s, i) => pantsCuff(ctx, dims, params, yaw, s, legs[i].d));
    const waist = pantsWaist(ctx, dims, params, yaw);
    const pads = dims.goalie ? [-1, 1].map(s => padPart(ctx, dims, params, yaw, s)) : [];
    // The waist must clear BOTH thighs and the torso it is worn over. A fixed
    // depth loses to the near leg side-on, and a depth that only tracks the
    // legs slips behind the torso when the player turns his back.
    waist.d = Math.max(legs[0].d, legs[1].d, 0) + 0.6;
    return legs.concat(skates, cuffs, pads, [waist]);
  }

  // Goalie pads: a tall slab strapped to the front of each leg. Anchored well
  // forward in z, so they fall behind the legs by themselves once he turns his
  // back rather than needing a special case.
  function padPart(ctx, dims, params, yaw, side) {
    // In the butterfly the pads go flat and out: wider, shorter, further from
    // the centre line and lower down.
    const f = dims.flop;
    const r = rotY(side * (dims.legX + 0.5 + 13 * f), 9, yaw);
    const midY = ((SKATE_Y + dims.hipY) / 2 + 2) * (1 - 0.3 * f);
    const c = project(r.x, midY, r.z);
    const hh = ((dims.hipY - SKATE_Y) / 2 + 2) * (1 - 0.5 * f) * c.k;
    return {
      d: r.z + 0.8,
      draw: () => {
        const hw = silWidth(9 + 9 * f, 5.5, yaw, 0) * c.k;
        drawSlab(ctx, {
          cx: c.sx, cy: c.sy, hw: hw, hh: hh,
          shape: "capsule", taper: 0.95, round: 1,
          color: params.trimColor, yaw: yaw
        });
        [-0.45, 0, 0.45].forEach(f =>
          L(ctx, c.sx - hw, c.sy + hh * f, c.sx + hw, c.sy + hh * f, shade(params.jerseyColor, 0), 1.5));
      }
    };
  }

  // Bulky shorts: one band across the hips plus a cuff wrapping the top of each
  // thigh, so the pants read as fitting the legs rather than as a single slab.
  function pantsWaist(ctx, dims, params, yaw) {
    const t = dims.torso;
    const c = project(dims.torso.z, dims.hipY - 1, 0);
    return {
      d: 0,
      draw: () => drawSlab(ctx, {
        cx: c.sx, cy: c.sy,
        hw: silWidth(t.rx * 0.92, t.rz * 0.92, yaw, 0) * c.k,
        hh: 7.5 * c.k,
        shape: "capsule", taper: 0.9, round: 1,
        color: shade(params.jerseyColor, -0.2), yaw: yaw
      })
    };
  }

  // Sits just above its own leg in the sort, so each cuff covers its own thigh
  // whichever way the player is facing.
  function pantsCuff(ctx, dims, params, yaw, side, legDepth) {
    const r = rotY(side * (dims.legX + 0.5), 3, yaw);
    const c = project(r.x, dims.hipY - 10, r.z);
    return {
      d: Math.max(legDepth, 0) + 0.3,
      draw: () => drawSlab(ctx, {
        cx: c.sx, cy: c.sy,
        hw: silWidth(9, 8, yaw, 0) * c.k,
        hh: 9.5 * c.k,
        shape: "capsule", taper: 0.95, round: 1,
        color: shade(params.jerseyColor, -0.2), yaw: yaw
      })
    };
  }

  // Thigh and shin meeting at a knee pushed forward, which is what makes the
  // stance read as crouched rather than stood to attention.
  function legPart(ctx, dims, params, yaw, side) {
    const x = side * dims.legX;
    const hip = { x: x, y: dims.hipY, z: 1 + dims.crouch * 5 };
    const knee = { x: side * (dims.legX + 1.5), y: (dims.hipY + SKATE_Y) / 2 + 1, z: 7 + dims.crouch * 12 };
    const ankle = { x: x, y: SKATE_Y + 3, z: 2 };
    const a = proj3(hip, yaw), k = proj3(knee, yaw), b = proj3(ankle, yaw);
    return {
      d: k.d,
      draw: () => drawArm(ctx, a, k, b, 11, params.sockColor)
    };
  }

  function skatePart(ctx, yaw, x) {
    const r = rotY(x, 2, yaw);
    const c = project(r.x, SKATE_Y, r.z);
    return {
      d: r.z,
      draw: () => {
        const hw = silWidth(7, 5, yaw, 0) * c.k;
        drawSlab(ctx, {
          cx: c.sx, cy: c.sy, hw: hw, hh: 4.5 * c.k,
          shape: "capsule", taper: 0.8, round: 1, color: "#2B2B2B", yaw: yaw
        });
        L(ctx, c.sx - hw, c.sy + 4.5 * c.k, c.sx + hw, c.sy + 4.5 * c.k, "#9AA7B4", 1.6);
      }
    };
  }

  // ---- head details -----------------------------------------------------

  // Helmet: a half-dome capping the crown, with a flat rim at the brow and an
  // ear cover at each end of that rim. A closed ellipse was tried first and its
  // visible lower arc read as a saucer sitting on top of the head — the flat rim
  // is what seats it. Slightly wider than the head, the way a real shell is.
  function helmetPart(ctx, dims, params, yaw) {
    const head = dims.head;
    const browY = head.y + head.ry * 0.08;
    const hr = rotY(head.x, head.z, yaw);
    const c = project(hr.x, browY, hr.z);
    const hw = silWidth(head.rx * 1.08, head.rz * 1.08, yaw, 0) * c.k;
    const hh = head.ry * 1.02 * c.k;
    // A mask is a whole shell, not a cap: it wraps the face too, so it is drawn
    // around the head's centre rather than seated on the brow.
    const mask = params.helmetStyle === "mask";
    const style = dims.headStyle;
    const mc = project(hr.x, head.y, hr.z);
    // A dome caps the skull, so it can sit at a fixed shallow depth and still
    // read. A mask wraps the whole head, so it has to sort in FRONT of the head
    // slab or the face swallows it - which is what it did.
    return {
      d: mask ? hr.z + 0.5 : 0.1,
      draw: () => {
        ctx.beginPath();
        if (mask) helmetShell(ctx, style, mc.sx, mc.sy, hw * 1.04, head.ry * 1.14 * mc.k);
        else helmetDome(ctx, style, c.sx, c.sy, hw, hh);
        ctx.closePath();
        ctx.fillStyle = slabFill(ctx, mask ? mc.sx : c.sx, hw, params.helmetColor, yaw);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = p(OUTLINE_W);
        ctx.lineJoin = "round";
        ctx.stroke();
        if (mask) return;
        drawEarLobes(ctx, c.sx, c.sy, hw, params.helmetColor, head.rx * c.k);
        if (params.helmetStyle === "visor") drawVisor(ctx, dims, yaw);
      }
    };
  }

  // A blocky head needs a blocky lid: a round dome leaves the top corners of
  // the skull bare. Both shapes follow the head's own taper and corner
  // rounding, so the helmet reads as a shell built for that head.
  function helmetDome(ctx, style, cx, cy, hw, hh) {
    if (style.boxy) return pathBox(ctx, cx, cy - hh / 2, hw, hh / 2, style.taper, style.round);
    ctx.ellipse(p(cx), p(cy), p(hw), p(hh), 0, Math.PI, 2 * Math.PI);
  }

  // The mask wraps the whole head rather than capping it, so it is the head's
  // outline again, one size up.
  function helmetShell(ctx, style, cx, cy, hw, hh) {
    if (style.boxy) return pathBox(ctx, cx, cy, hw, hh, style.taper, style.round);
    ctx.ellipse(p(cx), p(cy), p(hw), p(hh), 0, 0, Math.PI * 2);
  }

  // The cage goes on in facePart, not here: it has to land on top of the eyes,
  // and the face sorts in front of the shell.
  function drawCage(ctx, dims, yaw) {
    const facing = Math.cos(yaw);
    if (facing < 0.3) return;
    const head = dims.head;
    const hr = rotY(head.x, head.z + head.rz * facing, yaw);
    const c = project(hr.x, head.y - head.ry * 0.2, hr.z);
    const hw = head.rx * 0.74 * facing * c.k, hh = head.ry * 0.52 * c.k;
    ctx.save();
    ctx.strokeStyle = "#3A4A59";
    ctx.lineWidth = p(1.3);
    [-0.55, 0, 0.55].forEach(f =>
      L(ctx, c.sx + hw * f, c.sy - hh, c.sx + hw * f, c.sy + hh, "#3A4A59", 1.3));
    [-0.4, 0.35].forEach(f =>
      L(ctx, c.sx - hw, c.sy + hh * f, c.sx + hw, c.sy + hh * f, "#3A4A59", 1.3));
    ctx.restore();
  }

  // Painted relative to the shell rather than anchored in body space, so they
  // stay welded to the helmet instead of drifting across the face as it turns.
  // Sized off the head rather than fixed: a cover drawn at a constant 2.8 units
  // was a fifth of a default head and a ninth of a big one, which is what turned
  // it into a dot. Off head.rx, not the silhouette width, so it does not shrink
  // as he turns - it is a moulded cup, not a circle painted on.
  //
  // 0.152 / 0.195 are the old 2.8 / 3.6 over a DRAWN default head - the frame
  // zoom counts too - so a default player comes out the same as before and only
  // the builds either side of him change.
  function drawEarLobes(ctx, cx, cy, hw, helmetColor, unit) {
    const color = shade(helmetColor, -0.22);
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.ellipse(p(cx + side * hw * 0.88), p(cy + 1),
                  p(unit * 0.152), p(unit * 0.195), 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = p(OUTLINE_W);
      ctx.stroke();
    });
  }

  // A tinted shade across the eyes, hung off the front of the shell. Drawn
  // semi-transparent so the eyes still read through it.
  function drawVisor(ctx, dims, yaw) {
    const facing = Math.cos(yaw);
    if (facing < 0.15) return;
    const head = dims.head;
    const hr = rotY(head.x, head.z + head.rz * facing, yaw);
    const c = project(hr.x, head.y - head.ry * 0.13, hr.z);
    const hw = head.rx * 0.88 * facing * c.k, hh = head.ry * 0.26 * c.k;
    ctx.save();
    ctx.globalAlpha = 0.42;
    pathRoundedPoly(ctx, [
      { x: p(c.sx - hw * 0.88), y: p(c.sy - hh) },
      { x: p(c.sx + hw * 0.88), y: p(c.sy - hh) },
      { x: p(c.sx + hw), y: p(c.sy + hh) },
      { x: p(c.sx - hw), y: p(c.sy + hh) }
    ], p(hh * 0.7));
    ctx.fillStyle = "#2C4356";
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(1);
    ctx.stroke();
  }

  // ---- hair ---------------------------------------------------------------

  // One head of hair, drawn ON the skull and UNDER the lid. The helmet is
  // painted over it afterwards, so what is left showing is exactly the part
  // that escapes: a fringe under the rim, the sides past the ears, the flow
  // down the neck. Because it is a single outline it cannot come apart, and
  // because most of that outline IS the head's own curve, it cannot stop
  // hugging it either.
  //
  // Everything before this was drawn BEHIND the head - separate locks, then a
  // mass, then a cap with locks on it - and every one of them read as
  // something stuck on the back of his head, because that is what they were.
  //
  //   puff  - how much bigger than the skull the hair sits
  //   fall  - how far below the head it hangs, in head heights
  //   locks - scallops along the hanging edge, so the hem is hair and not a hem
  //   wave  - how deep those scallops cut
  const HAIR = {
    short:    { puff: 0.05, fall: 0.10, locks: 5, wave: 0.07, fringe: 0 },
    flow:     { puff: 0.06, fall: 0.85, locks: 4, wave: 0.16, fringe: 1 },
    mop:      { puff: 0.09, fall: 0.40, locks: 6, wave: 0.18, fringe: 1 },
    thinning: { puff: 0.02, fall: 0.02, locks: 4, wave: 0.05, fringe: 0, thin: 1 },
    ponytail: { puff: 0.05, fall: 0.08, locks: 4, wave: 0.06, fringe: 0, tail: 1.35 }
  };

  // A lock with a bend in it: tapered from a wide root towards a rounded tip,
  // and curved along the way so it wraps rather than hangs straight. Used by
  // the ponytail and by mutton chops.
  function pathCurvedLock(ctx, x, y, dx, dy, len, wid, bend, tip) {
    const t = tip === undefined ? 0.34 : tip;    // 0 is a spike, 1 a finger
    const nx = -dy, ny = dx;                     // unit normal to the fall line
    const mx = x + dx * len * 0.55, my = y + dy * len * 0.55;
    const ex = x + dx * len + nx * bend * len;
    const ey = y + dy * len + ny * bend * len;
    const cx = mx + nx * bend * len * 0.6, cy = my + ny * bend * len * 0.6;
    const tw = wid * t;
    ctx.moveTo(p(x - nx * wid), p(y - ny * wid));
    ctx.quadraticCurveTo(p(cx - nx * wid * 0.62), p(cy - ny * wid * 0.62),
                         p(ex - nx * tw), p(ey - ny * tw));
    ctx.quadraticCurveTo(p(ex + dx * tw * 1.5), p(ey + dy * tw * 1.5),
                         p(ex + nx * tw), p(ey + ny * tw));
    ctx.quadraticCurveTo(p(cx + nx * wid * 0.85), p(cy + ny * wid * 0.85),
                         p(x + nx * wid), p(y + ny * wid));
    ctx.quadraticCurveTo(p(x - dx * wid * 0.6), p(y - dy * wid * 0.6),
                         p(x - nx * wid), p(y - ny * wid));
  }

  function fillPath(ctx, color, lw) {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(lw);
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // Sorted just under the lid, whichever lid it is, so the helmet always wins
  // the crown and the hair always beats the head to it.
  function hairParts(ctx, dims, params, yaw) {
    const spec = HAIR[params.hairStyle];
    if (!spec) return [];
    const head = dims.head;
    const mask = params.helmetStyle === "mask";
    const hr = rotY(head.x, head.z, yaw);
    const c = project(hr.x, head.y, hr.z);
    // A goalie mask is a whole shell, a size larger than the head, and it is
    // painted over the hair like any other lid - so hair cut to the skull
    // disappears entirely under one. It gets the extra size back here, which
    // is also what it looks like: hair squeezing out round the edge of a mask.
    const puff = spec.puff + (mask ? 0.13 : 0);
    const W = silWidth(head.rx, head.rz, yaw, dims.headStyle.boxy) * c.k * (1 + puff);
    const H = head.ry * c.k * (1 + puff);
    return [{
      d: (mask ? hr.z + 0.5 : 0.1) - 0.02,
      draw: () => drawHair(ctx, dims, params, spec, c, W, H, yaw)
    }];
  }

  // The outline, in one pass: the head's own crown curve over the top, then a
  // hem back across the bottom. The hem is the whole trick - see hemAt().
  function pathHair(ctx, dims, spec, c, W, H, view) {
    const x = p(c.sx), y = p(c.sy), w = p(W), h = p(H);
    const tw = w * dims.headStyle.taper;
    const N = 44;                 // fine enough for a ponytail a fifth of the head wide
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.bezierCurveTo(x - w, y - h * KAPPA, x - tw * KAPPA, y - h, x, y - h);
    ctx.bezierCurveTo(x + tw * KAPPA, y - h, x + w, y - h * KAPPA, x + w, y);
    for (let i = 0; i <= N; i++) {
      const t = 1 - (i / N) * 2;
      ctx.lineTo(p(c.sx + t * W), p(c.sy + hemAt(t, spec, view) * H));
    }
    ctx.closePath();
  }

  function drawHair(ctx, dims, params, spec, c, W, H, yaw) {
    const view = hairView(dims, spec, c, W, yaw);
    pathHair(ctx, dims, spec, c, W, H, view);
    ctx.fillStyle = slabFill(ctx, c.sx, W, params.hairColor, yaw);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(OUTLINE_W);
    ctx.lineJoin = "round";
    ctx.stroke();
    // Clipped to the hair itself: everything below is texture INSIDE the shape,
    // and unclipped it paints locks down a man's face.
    ctx.save();
    pathHair(ctx, dims, spec, c, W, H, view);
    ctx.clip();
    insideHair(ctx, params, spec, c, W, H, view.back);
    ctx.restore();
  }

  // How far below the head's centre the hair reaches at x = t (-1..1 across the
  // silhouette), in head heights.
  //
  // Where the hair is short this returns the head's OWN lower curve, so the
  // outline there is the skull's outline and the hair cannot help but hug it.
  // Where it is long, it hangs below that instead, scalloped into locks.
  //
  // Across his face the hem lifts to the brow, leaving a fringe - see
  // hairView() for where the face is. And a ponytail is a narrow bump in this
  // same hem, so it hangs off the hair instead of floating beside it.
  function hemAt(t, spec, view) {
    const skull = Math.sqrt(Math.max(0, 1 - t * t));          // the head's curve
    const scallop = spec.wave * (1 - Math.abs(t) * 0.4)
      * Math.sin((t + 1) * Math.PI * spec.locks);
    const hang = skull + spec.fall * (0.65 + 0.35 * Math.abs(t)) + scallop;
    // Where the hair stops on his face. The rim is at -0.08 in this scale and
    // the top of an eye at +0.02, so a fringe has to live between the two: any
    // lower and Flow and Mop are literally hanging over his eyes. The scallop
    // rides along with it so the fringe has an edge and not a ruler line.
    //
    // No special case for a mask: the shell is drawn over the hair and hides
    // whatever it covers, so the hair falls the way it always does and a
    // goalie keeps his flow.
    const brow = spec.fringe ? -0.04 + scallop * 0.35 : -0.06;
    const face = view.face;
    const onFace = face
      ? Math.max(0, Math.min(1, 1 + Math.min(t - face.lo, face.hi - t) / 0.12))
      : 0;
    const hem = hang + onFace * (brow - hang);
    return view.tail ? Math.max(hem, tailAt(t, view.tail)) : hem;
  }

  // The tail: gathered at the nape (0.55 below the head's centre) and hanging
  // from there, rounded at the end. Part of the hem, so it is one outline with
  // the rest of the hair and cannot come loose from it.
  const TAIL_W = 0.20;

  function tailAt(t, tail) {
    const d = Math.abs(t - tail.at) / TAIL_W;
    return d < 1 ? 0.55 + tail.len * Math.sqrt(1 - d * d) : -Infinity;
  }

  // Which part of the silhouette is face, and where the back of the head is.
  //
  // The face is the front of the head from ear to ear, so its outline on
  // screen is found by turning that arc with him: every point of it still
  // facing us counts, and the span they cover is where the hair must keep
  // clear. Face-on that is nearly the whole width; side-on, in the highlight,
  // it is the front half - the profile - and the hair takes the back half.
  // The first version faded the face out with cos(yaw), which is zero side-on,
  // so mid-highlight the hair closed over his whole head.
  //
  // How far round the face goes depends on the view. Face-on it stops short of
  // the ears (62 degrees), so a lock of hair still falls down each side of the
  // face. Side-on the cheek is the whole front half of the profile, so it
  // reaches almost to the ear (82) - otherwise the hair takes his cheek too.
  const FACE_ARC = 1.08, FACE_ARC_SIDE = 0.35;

  function hairView(dims, spec, c, W, yaw) {
    const head = dims.head, wb = W / c.k;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 16; i++) {
      const th = (i / 16 * 2 - 1) * (FACE_ARC + FACE_ARC_SIDE * Math.abs(sin));
      const bx = head.rx * Math.sin(th), bz = head.rz * Math.cos(th);
      if (-bx * sin + bz * cos <= 0) continue;               // turned away from us
      const sx = (bx * cos + bz * sin) / wb;
      lo = Math.min(lo, sx);
      hi = Math.max(hi, sx);
    }
    // The back of the head is where the tail hangs. Face-on it is behind him
    // and there is nothing to draw; it comes into view as he turns side-on.
    const back = Math.max(0, Math.min(1, (0.30 - cos) / 0.30));
    const tail = spec.tail && back > 0
      ? { at: Math.max(-0.78, Math.min(0.78, -head.rz * sin / wb)), len: spec.tail * back }
      : null;
    return { face: lo <= hi ? { lo: lo, hi: hi } : null, back: back, tail: tail };
  }

  // Inside the shape: a parting and a couple of locks falling through it, so
  // the mass has a direction instead of being a flat fill, and the scalp for a
  // thinning man - on top the helmet hides the difference either way, so the
  // back of his head is the only place it can show.
  function insideHair(ctx, params, spec, c, W, H, back) {
    if (spec.thin && back > 0.5) {
      E(ctx, c.sx, c.sy - H * 0.16, W * 0.34, H * 0.26, params.skinColor);
    }
    [-0.46, 0.38].forEach((t, i) => {
      ctx.beginPath();
      pathCurvedLock(ctx, c.sx + t * W * 0.9, c.sy - H * 0.55, t * 0.26, 0.96,
                     H * (1.1 + spec.fall) * (i ? 0.9 : 1), W * 0.16, t * 0.25);
      ctx.closePath();
      ctx.fillStyle = shade(params.hairColor, i ? 0.08 : -0.10);
      ctx.fill();
    });
  }

  // ---- facial hair --------------------------------------------------------

  // Every style is a combination of three pieces: a band along the jaw, a patch
  // under the lip, and a moustache. full thickens the jaw band into a beard.
  const FACE_HAIR = {
    stache:    { stache: 1 },
    goatee:    { stache: 1, chin: 1 },
    chinstrap: { jaw: 1 },
    beard:     { stache: 1, chin: 1, jaw: 1, full: 1 },
    chops:     { chops: 1 }
  };

  // Drawn with the face and before the cage, so it obeys the same facing rule
  // the eyes do and a goalie's cage still lands on top of it.
  //
  // Face landmarks, in head heights from the head's centre: the helmet rim sits
  // at +0.08, the eyes at -0.16, the mouth at -0.56 and the chin at -1.00.
  // Every piece below is placed off those, which is what keeps a beard on the
  // jaw instead of across the cheekbones.
  function drawFaceHair(ctx, dims, params, yaw, facing, mask) {
    const spec = FACE_HAIR[params.faceHair];
    if (!spec) return;
    const head = dims.head;
    const color = shade(params.hairColor, -0.12);
    const at = (zf, y) => {
      const r = rotY(head.x, head.z + head.rz * zf, yaw);
      return project(r.x, y, r.z);
    };
    // A mask covers the jaw, so a beard under one is only whatever shows
    // through the opening - the band and the chops would sit on the shell.
    // A playoff beard hangs lower and narrower than a chinstrap: up at the
    // cheekbones it runs into the hair coming down past the ears, and the two
    // dark masses meeting is what turns his head into one brown blob.
    if (spec.jaw && !mask) {
      const y = head.y - head.ry * (spec.full ? 0.42 : 0.30);
      drawJawBand(ctx, head, at(0.55, y), facing, spec, color);
    }
    if (spec.chops && !mask) drawChops(ctx, head, yaw, facing, color);
    if (spec.chin && !spec.full) {
      // Under the lip, not on the point of the chin: the patch of a goatee
      // sits between the mouth (-0.56) and the jaw.
      const c = at(0.80, head.y - head.ry * 0.72);
      E(ctx, c.sx, c.sy, head.rx * 0.19 * facing * c.k, head.ry * 0.16 * c.k, color);
      outline(ctx, 1.1);
    }
    if (spec.stache) {
      const c = at(0.84, head.y - head.ry * 0.44);
      E(ctx, c.sx, c.sy, head.rx * 0.40 * facing * c.k, head.ry * 0.09 * c.k, color);
      outline(ctx, 1.1);
    }
  }

  // Chops are the sides of a beard with the chin left out: a lock down each
  // side of the face from the ear towards the jaw, ON the silhouette edge and
  // wide enough to read as hair. Drawn as locks rather than ovals so they taper
  // the way sideburns do - a pair of ovals parked on the cheeks read as two
  // blobs stuck to his face, and a pair of thin ones as dangling thread.
  function drawChops(ctx, head, yaw, facing, color) {
    [-1, 1].forEach(side => {
      const r = rotY(head.x + side * head.rx * 0.86, head.z + head.rz * 0.22, yaw);
      if (r.z <= -head.rz * 0.2) return;       // gone round the back with the ear
      const c = project(r.x, head.y - head.ry * 0.02, r.z);
      ctx.beginPath();
      // Curving in towards the jaw as it falls, so a chop follows the cheek
      // instead of hanging off the ear like a tassel.
      pathCurvedLock(ctx, c.sx, c.sy, -side * 0.12, 0.99, head.ry * 0.60 * c.k,
                     head.rx * 0.19 * c.k * (0.45 + facing * 0.55), -side * 0.22);
      fillPath(ctx, color, 1.1);
    });
  }

  // A crescent along the jaw: the outer arc is the jaw line itself, so it hugs
  // the head's own outline, and the inner arc is where it stops. Thin reads as
  // a chinstrap, thick as a playoff beard.
  //
  // Sized to land ON the chin (-1.00): centred at -0.30 with a height of 0.70
  // puts the bottom of the arc exactly there. The first cut was a size too
  // small and sat across the mouth with bare skin under it.
  //
  // A chinstrap stops short of the ears (ENDS), or the two tips ride up the
  // cheeks and the strap reads as a hook painted on the face once he turns. A
  // full beard goes all the way up, because that is where sideburns are.
  const ENDS = Math.PI * 0.14;

  function drawJawBand(ctx, head, c, facing, spec, color) {
    const full = Boolean(spec.full);
    const w = head.rx * (full ? 0.78 : 0.90) * facing * c.k;
    const h = head.ry * (full ? 0.58 : 0.70) * c.k;
    const a = full ? ENDS * 0.5 : ENDS;
    // Full means full: a playoff beard is a solid mass from under the mouth to
    // the chin, not a band with a bare patch inside it.
    const iw = w * (full ? 0.44 : 0.78), ih = h * (full ? 0.14 : 0.80);
    ctx.beginPath();
    ctx.ellipse(p(c.sx), p(c.sy), p(w), p(h), 0, a, Math.PI - a);
    ctx.ellipse(p(c.sx), p(c.sy), p(iw), p(ih), 0, Math.PI - a, a, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    outline(ctx, 1.1);
  }

  function outline(ctx, lw) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(lw);
    ctx.stroke();
  }

  // Eyes and mouth live on the front of the head, so they vanish as it turns away.
  function facePart(ctx, dims, params, yaw) {
    const head = dims.head;
    // A mask shell sorts just in front of the head, so the face has to sort in
    // front of the MASK or it is painted over and he has no eyes. Measured off
    // the head's own rotated depth, since a resting goalie leans his head
    // forward far enough that a fixed depth stops being in front of anything.
    const hr = rotY(head.x, head.z, yaw);
    return {
      d: params.helmetStyle === "mask" ? hr.z + 1.5 : head.rz,
      draw: () => {
        const facing = Math.cos(yaw);
        if (facing < 0.3) return;
        const mask = params.helmetStyle === "mask";
        // The shell sits in front of the head, so on a mask the face has to be
        // put back as an opening in it - otherwise he is a blank dark egg.
        if (mask) drawFaceHole(ctx, dims, params, yaw, facing);
        const eyeY = head.y - head.ry * 0.16;
        [-1, 1].forEach(s => {
          const r = rotY(head.x + s * head.rx * 0.36, head.z + head.rz * 0.8, yaw);
          // An eye that has rotated onto the far hemisphere would otherwise
          // sit out at the silhouette edge, reading as detached from the head.
          if (r.z <= 0) return;
          const c = project(r.x, eyeY, r.z);
          E(ctx, c.sx, c.sy, 1.7 * c.k, 2.1 * c.k, OUTLINE);
        });
        drawFaceHair(ctx, dims, params, yaw, facing, mask);
        if (mask) return drawCage(ctx, dims, yaw);
        const m = rotY(head.x, head.z + head.rz * 0.85, yaw);
        const mc = project(m.x, head.y - head.ry * 0.56, m.z);
        L(ctx, mc.sx - 3 * facing, mc.sy, mc.sx + 3 * facing, mc.sy, OUTLINE, 1.2);
      }
    };
  }

  // The opening in the shell, in skin, hung off the front of the head the same
  // way the visor is - so it narrows and slides as he turns.
  function drawFaceHole(ctx, dims, params, yaw, facing) {
    const head = dims.head;
    const r = rotY(head.x, head.z + head.rz * 0.55, yaw);
    const c = project(r.x, head.y - head.ry * 0.10, r.z);
    E(ctx, c.sx, c.sy, head.rx * 0.74 * facing * c.k, head.ry * 0.66 * c.k, params.skinColor);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(1.2);
    ctx.stroke();
  }

  // ---- jersey lettering -------------------------------------------------

  // Maps text onto a quad on the jersey surface, so it squashes and shears with
  // the torso as it turns. tl/tr/bl are already-projected logical points.
  function drawQuadText(ctx, text, tl, tr, bl, color) {
    const a = { x: p(tl.sx), y: p(tl.sy) };
    const b = { x: p(tr.sx), y: p(tr.sy) };
    const c = { x: p(bl.sx), y: p(bl.sy) };
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    const h = Math.hypot(c.x - a.x, c.y - a.y);
    if (w < 1 || h < 1) return;
    ctx.save();
    ctx.transform((b.x - a.x) / w, (b.y - a.y) / w, (c.x - a.x) / h, (c.y - a.y) / h, a.x, a.y);
    ctx.font = "700 " + h + "px " + FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    // Squash the glyphs into the quad as it narrows, so the lettering turns
    // with the jersey instead of keeping its full width and sliding across it.
    // Capped at 1 so a short number is never stretched fat when face-on.
    const m = ctx.measureText(text).width;
    const squash = Math.min(1, (w * 0.9) / m);
    ctx.scale(squash, 1);
    ctx.fillText(text, (w - m * squash) / (2 * squash), 0);
    ctx.restore();
  }

  // One quad on the front or back of the torso. Each corner sits on the barrel
  // surface rather than a flat plane at full depth, so the lettering hugs the
  // body instead of floating proud of it.
  function jerseyQuad(dims, yaw, side, halfW, yTop, yBot) {
    const t = dims.torso;
    const corner = (x, y) => {
      const bx = x * side;
      const inset = Math.sqrt(Math.max(0, 1 - Math.min(1, (bx / t.rx) * (bx / t.rx))));
      const r = rotY(bx, t.rz * inset * 0.9 * side, yaw);
      return project(r.x, y, r.z);
    };
    return { tl: corner(-halfW, yTop), tr: corner(halfW, yTop), bl: corner(-halfW, yBot) };
  }

  // The number shows on whichever side of the jersey is facing us, and on
  // neither when the torso is edge-on — which is what a real jersey does.
  function jerseyPart(ctx, dims, params, yaw) {
    const facing = Math.cos(yaw);
    const side = facing > 0 ? 1 : -1;
    const t = dims.torso;
    return {
      d: t.rz * side * facing,
      draw: () => {
        // Back of the jersey only, and hidden well before the torso turns
        // edge-on so the lettering never crawls off the silhouette.
        if (facing > -0.35) return;
        if (params.name) {
          const q = jerseyQuad(dims, yaw, side, t.rx * 0.56, t.y + t.ry * 0.48, t.y + t.ry * 0.30);
          drawQuadText(ctx, params.name.toUpperCase(), q.tl, q.tr, q.bl, params.trimColor);
        }
        if (params.number) {
          const q = jerseyQuad(dims, yaw, side, t.rx * 0.42, t.y + t.ry * 0.14, t.y - t.ry * 0.38);
          drawQuadText(ctx, params.number, q.tl, q.tr, q.bl, params.trimColor);
        }
      }
    };
  }

  // ---- arms and stick ---------------------------------------------------

  function proj3(pt, yaw) {
    const r = rotY(pt.x, pt.z, yaw);
    return project(r.x, pt.y, r.z);
  }

  // The stick geometry drives the arms too, so both are derived from here.
  // Handedness only flips which side it all sits on — never mirror the whole
  // canvas, or the jersey number would come out backwards.
  // A real stance holds the stick OUT IN FRONT, not off to the side: both hands
  // sit forward of the chest, the shaft angles down and away, and the blade
  // lands on the ice well ahead of the skates. So the hands are placed first
  // and the shaft is extended through them in both directions.
  // Which side of the body the blade sits on. A LEFT-handed shot puts it on
  // the player's left, which is +x here - it was the other way round, so every
  // left shot was drawn as a right one and the reel had them shooting the
  // wrong way.
  function handSign(params) {
    return params.handedness === "left" ? 1 : -1;
  }

  function stickPoints(dims, params) {
    const hand = handSign(params);
    // The shaft leans back across the body as it descends, so the blade ends up
    // angled in front of the player rather than pointing away off to the side.
    const topHand = { x: hand * 14, y: dims.shoulderY - 15, z: 22 };
    const lowHand = { x: hand * 10, y: dims.shoulderY - 31, z: 26 };
    const dir = { x: lowHand.x - topHand.x, y: lowHand.y - topHand.y, z: lowHand.z - topHand.z };

    const toIce = (lowHand.y - 2.5) / -dir.y;
    const heel = { x: lowHand.x + dir.x * toIce, y: 2.5, z: lowHand.z + dir.z * toIce };
    const butt = { x: topHand.x - dir.x * 0.45, y: topHand.y - dir.y * 0.45, z: topHand.z - dir.z * 0.45 };
    // The blade carries on in the shaft's direction at a shallow lie. Kicking
    // it back the other way reads as a golf club.
    const toe = { x: heel.x - hand * 11, y: 2.5, z: heel.z + 4 };

    let s = { hand: hand, butt: butt, heel: heel, toe: toe, topHand: topHand, lowHand: lowHand };
    if (ANIM && ANIM.lift) s = liftStick(s, ANIM.lift);
    if (ANIM && ANIM.swing) s = swingStick(s, ANIM.swing * hand);
    return s;
  }

  // The goalie's stick stands on its blade out in front of him, knob just under
  // the chin. The hands go on top of the knob and the head comes down onto the
  // hands - so the head drives the height, not the other way round.
  function goalieStick(dims, params) {
    const hand = handSign(params);
    const head = dims.head;
    const butt = { x: hand * 2, y: head.y - head.ry - 1.5, z: head.z + 17 };
    const heel = { x: hand * 2, y: 2.5, z: butt.z + 4 };
    const grip = { x: butt.x, y: butt.y + 2, z: butt.z };
    return {
      hand: hand, butt: butt, heel: heel,
      toe: { x: heel.x - hand * 17, y: 2.5, z: heel.z + 2 },
      topHand: grip, lowHand: grip
    };
  }

  function stickFor(dims, params) {
    return dims.rest ? goalieStick(dims, params) : stickPoints(dims, params);
  }

  // The shaft sorts at the depth of the hands holding it, pulled back a little
  // so it passes behind them. Both sticks use it, and the gloves are placed
  // relative to it, so the hands cannot end up on the wrong side of the shaft.
  function stickDepth(s, yaw) {
    return rotY(s.topHand.x, s.topHand.z, yaw).z - 3;
  }

  // Where the shaft thickens into the paddle: a point on the shaft at a fixed
  // height, so the wide part is the same length whatever angle the stick is at.
  function paddleTop(s) {
    const span = s.butt.y - s.heel.y;
    const t = span > 1 ? Math.min(0.95, (s.butt.y - 34) / span) : 0;
    return {
      x: s.butt.x + (s.heel.x - s.butt.x) * t,
      y: s.butt.y + (s.heel.y - s.butt.y) * t,
      z: s.butt.z + (s.heel.z - s.butt.z) * t
    };
  }

  // A shot sweeps the shaft around the top hand, so everything below the grip
  // rotates about it while the hands stay put.
  function swingStick(s, angle) {
    const pivot = s.topHand;
    const turn = pt => {
      const r = rotY(pt.x - pivot.x, pt.z - pivot.z, angle);
      return { x: pivot.x + r.x, y: pt.y, z: pivot.z + r.z };
    };
    return {
      hand: s.hand, topHand: pivot,
      butt: turn(s.butt), heel: turn(s.heel), toe: turn(s.toe), lowHand: turn(s.lowHand)
    };
  }

  // A slapshot raises the stick in the VERTICAL plane, which the yaw sweep
  // above cannot do - it only ever moves the blade sideways. Positive angle
  // takes the blade up and back into the windup; negative finishes it high in
  // front on the follow-through.
  function liftStick(s, angle) {
    const pivot = s.topHand;
    const c = Math.cos(angle), sn = Math.sin(angle);
    const turn = pt => {
      const dy = pt.y - pivot.y, dz = pt.z - pivot.z;
      return { x: pt.x, y: pivot.y + dy * c - dz * sn, z: pivot.z + dy * sn + dz * c };
    };
    return {
      hand: s.hand, topHand: pivot,
      butt: turn(s.butt), heel: turn(s.heel), toe: turn(s.toe), lowHand: turn(s.lowHand)
    };
  }

  // Upper arm and forearm as two rounded capsules. Both outlines go down first,
  // then both fills, so the seam at the elbow does not show.
  function drawArm(ctx, a, e, b, width, color) {
    ctx.lineCap = "round";
    L(ctx, a.sx, a.sy, e.sx, e.sy, OUTLINE, width + 1.8);
    L(ctx, e.sx, e.sy, b.sx, b.sy, OUTLINE, width + 1.8);
    L(ctx, a.sx, a.sy, e.sx, e.sy, color, width);
    L(ctx, e.sx, e.sy, b.sx, b.sy, color, width);
    ctx.lineCap = "butt";
  }

  // Elbows sit outboard of the straight shoulder-to-hand line and a little low,
  // which is what gives the stance its hockey silhouette.
  function elbowFor(shoulder, grip) {
    const out = shoulder.x >= 0 ? 1 : -1;
    return {
      x: (shoulder.x + grip.x) / 2 + out * 5,
      y: (shoulder.y + grip.y) / 2 - 8,
      z: (shoulder.z + grip.z) / 2 - 2
    };
  }

  function drawGlove(ctx, c, color) {
    ctx.beginPath();
    ctx.ellipse(p(c.sx), p(c.sy), p(5 * c.k), p(5.4 * c.k), 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(OUTLINE_W);
    ctx.stroke();
  }

  // Each arm runs from a shoulder to its hand on the shaft. The shoulder on the
  // stick's side takes the TOP hand — that arm stays tucked and bent — while the
  // far shoulder reaches across to the lower hand and extends. Swapping them
  // puts the hands on the wrong arms.
  // Resting, both hands sit side by side on top of the knob instead of spread
  // along the shaft.
  function gripsFor(dims, s) {
    if (!dims.rest) return [s.topHand, s.lowHand];
    const k = s.butt, h = s.hand;
    const rest = [
      { x: k.x + h * 5.2, y: k.y + 1.4, z: k.z + 0.8 },
      { x: k.x - h * 5.2, y: k.y + 2.4, z: k.z - 1.0 }
    ];
    if (!ANIM) return rest;
    // A save throws one hand out and leaves the other where it was. Blended
    // rather than switched, so the arm travels there instead of teleporting.
    return [
      blend(rest[0], { x: h * 34, y: dims.shoulderY - 2, z: 16 }, ANIM.blocker || 0),
      blend(rest[1], { x: -h * 30, y: dims.shoulderY + 20, z: 14 }, ANIM.glove || 0)
    ];
  }

  function blend(a, b, t) {
    if (!t) return a;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  }

  function armParts(ctx, dims, params, yaw) {
    const s = stickFor(dims, params);
    const grips = gripsFor(dims, s);
    const shoulderX = dims.torso.rx * 0.70;
    // Gloves take a darker shade of the jersey rather than the lettering
    // colour — white lettering is right on a jersey, wrong on a glove.
    const gloveColor = shade(params.jerseyColor, -0.4);
    const shaft = stickDepth(s, yaw);
    // Which shoulder owns which hand. Both grips sit on the blade's side of the
    // body, so the shoulder on THAT side takes the top hand and stays tucked,
    // and the far shoulder reaches across for the lower hand. Exactly one arm
    // crosses the chest, which is how a stick is actually held.
    //
    // Pairing them the other way round sends both arms to the far side and
    // they cross each other - the far one reaching up to the high hand, the
    // near one down to the low hand.
    return [
      { shoulder: { x: s.hand * shoulderX, y: dims.shoulderY, z: 1 }, grip: grips[0], blocker: true },
      { shoulder: { x: -s.hand * shoulderX, y: dims.shoulderY, z: 1 }, grip: grips[1], blocker: false }
    ].map(pair => {
      const a = proj3(pair.shoulder, yaw);
      const e = proj3(elbowFor(pair.shoulder, pair.grip), yaw);
      const b = proj3(pair.grip, yaw);
      // The bias is what makes the near glove read as gripping the shaft rather
      // than the shaft crossing it. Applied to BOTH arms it also dragged the
      // far arm in front of the torso, so side on you saw two arms where a
      // body only shows one. The far arm now keeps its own negative depth and
      // the torso covers it.
      const depth = (a.d + b.d) / 2;
      return [
        {
          d: depth >= 0 ? depth + 3 : depth,
          draw: () => drawArm(ctx, a, e, b, 8, params.jerseyColor)
        },
        {
          // The hand is its own part so it can sort onto the shaft while the
          // arm keeps its own depth - the arm averages the shoulder, which is
          // behind, and that average was dragging the glove under the stick.
          d: Math.max(b.d, shaft) + 2,
          draw: () => {
            if (!dims.goalie) return drawGlove(ctx, b, gloveColor);
            if (pair.blocker) drawBlocker(ctx, b, gloveColor, params.trimColor);
            else drawTrapper(ctx, b, gloveColor, params.trimColor);
          }
        }
      ];
    }).reduce((all, pair) => all.concat(pair), []);
  }

  // A slab of a blocker on the stick hand and a fat round trapper on the other:
  // the two shapes are most of what tells a goalie apart at this size.
  function drawBlocker(ctx, c, color, trim) {
    const w = 6.4 * c.k, h = 7.6 * c.k;
    pathRoundedPoly(ctx, [
      { x: p(c.sx - w), y: p(c.sy - h) }, { x: p(c.sx + w), y: p(c.sy - h) },
      { x: p(c.sx + w), y: p(c.sy + h) }, { x: p(c.sx - w), y: p(c.sy + h) }
    ], p(1.8));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(OUTLINE_W);
    ctx.lineJoin = "round";
    ctx.stroke();
    L(ctx, c.sx - w * 0.55, c.sy - h, c.sx - w * 0.55, c.sy + h, trim, 1.4);
  }

  function drawTrapper(ctx, c, color, trim) {
    E(ctx, c.sx, c.sy, 7.2 * c.k, 7.6 * c.k, color);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(OUTLINE_W);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p(c.sx), p(c.sy + 1 * c.k), p(4 * c.k), Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = trim;
    ctx.lineWidth = p(1.4);
    ctx.stroke();
  }

  function stickPart(ctx, dims, params, yaw) {
    const s = stickFor(dims, params);
    if (dims.goalie) return goalieStickPart(ctx, s, yaw);
    const b = proj3(s.butt, yaw);
    const h = proj3(s.heel, yaw);
    const t = proj3(s.toe, yaw);
    return {
      d: stickDepth(s, yaw),
      draw: () => {
        ctx.lineCap = "round";
        L(ctx, b.sx, b.sy, h.sx, h.sy, OUTLINE, 3.6);
        L(ctx, b.sx, b.sy, h.sx, h.sy, "#C9A227", 2.2);
        L(ctx, h.sx, h.sy, t.sx, t.sy, OUTLINE, 4.2);
        ctx.lineCap = "butt";
      }
    };
  }

  // Thin shaft down to the paddle, then a broad paddle and a broad blade. Drawn
  // as three strokes of increasing width rather than a filled outline - at this
  // size the widths are the whole read.
  function goalieStickPart(ctx, s, yaw) {
    const b = proj3(s.butt, yaw);
    const m = proj3(paddleTop(s), yaw);
    const h = proj3(s.heel, yaw);
    const t = proj3(s.toe, yaw);
    return {
      d: stickDepth(s, yaw),
      draw: () => {
        ctx.lineCap = "round";
        L(ctx, b.sx, b.sy, m.sx, m.sy, OUTLINE, 4.0);
        L(ctx, b.sx, b.sy, m.sx, m.sy, "#C9A227", 2.4);
        L(ctx, m.sx, m.sy, h.sx, h.sy, OUTLINE, 12.5);
        L(ctx, m.sx, m.sy, h.sx, h.sy, "#C9A227", 10.0);
        L(ctx, h.sx, h.sy, t.sx, t.sy, OUTLINE, 8.5);
        L(ctx, h.sx, h.sy, t.sx, t.sy, "#C9A227", 6.2);
        ctx.lineCap = "butt";
      }
    };
  }

  // ---- goalie saves -----------------------------------------------------

  // Where each save happens, in logical screen space. All three come in from
  // the left, at the height that forces the save being shown.
  const POW = { drop: "PAD!", blocker: "POW!", glove: "SNAG!" };

  function saveSpot(kind, dims, hand) {
    if (kind === "blocker") return { x: CX + hand * 30, y: GROUND - 52 };
    if (kind === "glove") return { x: CX - hand * 26, y: GROUND - 74 };
    return { x: CX + 4, y: GROUND - 12 };          // low, and he drops on it
  }

  // In from off frame, then away off whatever stopped it. The glove keeps it.
  function drawSave(ctx, dims, params, yaw) {
    const shot = ANIM.shot;
    const hand = handSign(params);
    const spot = saveSpot(shot.kind, dims, hand);
    const hit = 0.53;
    if (shot.t <= hit) {
      const t = shot.t / hit;
      const rise = 26 * (1 - t) * (1 - t);
      const x = -14 + (spot.x + 14) * t;
      if (t > 0.25) streaksTo(ctx, x, spot.y - rise);
      puckAt(ctx, x, spot.y - rise, 1.4, 1);
      return;
    }
    drawPow(ctx, spot, shot);
    if (shot.kind === "glove") return puckAt(ctx, spot.x, spot.y, 1.4, 1);
    const t = (shot.t - hit) / (1 - hit);
    const away = shot.kind === "blocker" ? 1 : -0.4;
    puckAt(ctx, spot.x + away * 52 * t, spot.y - 30 * t + 40 * t * t, 1.4, 1 - t * 0.5);
  }

  // A comic burst on the moment of contact, popping out and fading. Drawn as a
  // spiky ring rather than a speech bubble - nobody is talking, something got
  // hit.
  function drawPow(ctx, spot, shot) {
    const t = (shot.t - 0.53) / 0.34;
    if (t < 0 || t > 1) return;
    const grow = t < 0.35 ? t / 0.35 : 1;
    const r = 15 * (0.55 + 0.45 * grow);
    const x = spot.x + 14, y = spot.y - 16;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, (t - 0.6) / 0.4);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.62 : 1);
      const px = p(x + Math.cos(a) * rr), py = p(y + Math.sin(a) * rr * 0.85);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#FDD835";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = p(1.4);
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.font = "800 " + p(8.5) + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = OUTLINE;
    ctx.fillText(POW[shot.kind], p(x), p(y));
    ctx.restore();
  }

  function streaksTo(ctx, x, y) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    [-5, 2].forEach((dy, i) => L(ctx, x - 8, y + dy, x - 8 - (16 + i * 6), y + dy, "#7F98AE", 1.2));
    ctx.restore();
  }

  // ---- scene ------------------------------------------------------------

  function drawShadow(ctx, dims) {
    const w = dims.torso.rx * 1.6 * FIT;
    ctx.save();
    ctx.globalAlpha = 0.18;
    // CX + SHIFT, not CX: the shadow belongs to the player, and when the camera
    // pans away it has to leave with him.
    E(ctx, CX + SHIFT, GROUND + 1, w, w * 0.26, "#0C1B2A");
    ctx.restore();
  }

  // ---- highlight scenery ------------------------------------------------

  const NET = { x: LW - 44, w: 54, h: 42 };

  // Where the net comes to rest when the camera is riding along with the puck:
  // out at the middle of the frame, so it closes on a puck sitting there.
  const NET_CLOSE = CX + 22;

  // t is how far the net has come into frame: 0 is off the right edge entirely,
  // 1 is parked. A point shot starts with no net on screen at all, so the puck
  // has nothing to travel towards but distance.
  function drawNet(ctx, t) {
    const into = (t === undefined) ? 1 : t;
    const behind = Boolean(ANIM && ANIM.netBehind);
    const home = behind ? CX : ((ANIM && ANIM.netClose) ? NET_CLOSE : NET.x);
    const grow = behind ? 1.45 : 1;      // he has to fit in front of it
    // Starts just past the right edge, not miles beyond it: come in from too
    // far away and it spends the whole slide off screen, then pops.
    const cx = home + (1 - into) * ((LW + NET.w / 2) - home);
    const w = NET.w * FIT * grow, h = NET.h * FIT * grow;
    const base = GROUND - 1, left = cx - w / 2, right = cx + w / 2, top = base - h;
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillRect(p(left), p(top), p(w), p(h));
    for (let i = 1; i < 6; i++) {
      const x = left + w * (i / 6);
      L(ctx, x, top, x, base, "rgba(90,104,117,.35)", 0.5);
    }
    for (let i = 1; i < 5; i++) {
      const y = top + h * (i / 5);
      L(ctx, left, y, right, y, "rgba(90,104,117,.35)", 0.5);
    }
    L(ctx, left, base, left, top, "#E53935", 2.4);
    L(ctx, right, base, right, top, "#E53935", 2.4);
    L(ctx, left, top, right, top, "#E53935", 2.4);
  }

  // Where the puck is sitting before the shot, and therefore where it sets off
  // from. It tracks the blade while he skates in - he is carrying it - and
  // freezes the moment he starts his backswing, so the puck stays on the ice
  // while the stick goes up and the follow-through carries the blade away.
  let LAUNCH = null;

  function puckRest(ctx, dims, params, yaw) {
    if (!ANIM.lift) LAUNCH = proj3(stickPoints(dims, params).toe, yaw);
    if (LAUNCH) puckAt(ctx, LAUNCH.sx, LAUNCH.sy, 1, 1);
  }

  function drawPuck(ctx, dims, params, yaw, t) {
    if (!LAUNCH) LAUNCH = proj3(stickPoints(dims, params).toe, yaw);
    // Once the camera is travelling the puck is all there is on screen, so it
    // gets a little bigger to stay readable.
    const size = (ANIM && ANIM.pan > 0.25) ? 1.5 : 1;
    // A trail, because a black dot moving across a white rink reads as slow
    // however fast it is actually going.
    for (let i = 3; i >= 1; i--) {
      const back = t - i * 0.04;
      if (back > 0) puckAt(ctx, puckX(back), puckY(back), size * (1 - i * 0.18), 0.13 * (4 - i));
    }
    const x = puckX(t), y = puckY(t);
    if (ANIM && ANIM.puckHold && t > CRUISE_IN) drawStreaks(ctx, x, y, t);
    puckAt(ctx, x, y, size, 1);
  }

  // Held in the middle of the frame with the camera travelling alongside, the
  // way a cartoon follows a thrown thing: the puck stops moving across the
  // screen and the world comes to it instead.
  const CRUISE_IN = 0.18;         // how much of the flight it takes to get there
  const CRUISE_Y = GROUND - 40;   // how high it rides

  // Where it settles. Taken from the launch point rather than fixed, so the
  // first thing the puck does is always travel RIGHT: pin it to the middle and
  // a blade that finished right of the middle sends the puck backwards into
  // the shooter for the opening frames.
  function cruiseX() {
    return Math.max(CX + 12, LAUNCH.sx + 26);
  }

  function puckX(t) {
    if (!ANIM || !ANIM.puckHold) return LAUNCH.sx + (NET.x - LAUNCH.sx) * t;
    return LAUNCH.sx + (cruiseX() - LAUNCH.sx) * Math.min(1, t / CRUISE_IN);
  }

  function puckY(t) {
    if (!ANIM || !ANIM.puckHold) {
      const arc = (ANIM && ANIM.arc) || 9;
      return LAUNCH.sy + (GROUND - 9 - LAUNCH.sy) * t - Math.sin(t * Math.PI) * arc;
    }
    const lead = Math.min(1, t / CRUISE_IN);
    return LAUNCH.sy + (CRUISE_Y - LAUNCH.sy) * lead;
  }

  // Speed lines trailing off behind it. They flicker on a cycle so the puck
  // does not look pinned to the glass.
  function drawStreaks(ctx, x, y, t) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    [-7, 0, 7].forEach((dy, i) => {
      const len = 14 + 8 * Math.abs(Math.sin(t * 26 + i));
      L(ctx, x - 7, y + dy, x - 7 - len, y + dy, "#7F98AE", 1.3);
    });
    ctx.restore();
  }

  function puckAt(ctx, sx, sy, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    E(ctx, sx, sy, 3 * size, 2.1 * size, "#11181F");
    ctx.restore();
  }

  function drawGoalText(ctx, label) {
    const text = label || "GOAL!";
    ctx.save();
    ctx.font = "800 " + p(text.length > 6 ? 15 : 18) + "px " + FONT;
    ctx.textAlign = "right";
    ctx.lineJoin = "round";
    ctx.lineWidth = p(3);
    ctx.strokeStyle = OUTLINE;
    const y = GROUND - NET.h * FIT - 12;
    ctx.strokeText(text, p(LW - 8), p(y));
    ctx.fillStyle = "#FDD835";
    ctx.fillText(text, p(LW - 8), p(y));
    ctx.restore();
  }

  function drawIce(ctx) {
    ctx.fillStyle = "#EEF6FF";
    ctx.fillRect(0, 0, p(LW), p(LH));
    L(ctx, 0, GROUND + 2, LW, GROUND + 2, "#D3E4F5", 1.2);
  }

  // ---- entry point ------------------------------------------------------

  // The height slider scales the whole figure about the ice, so the feet stay
  // put and the proportions hold. It is deliberately NOT part of topY: the fit
  // is worked out for a standard-height build and the stature applied on top,
  // which is what lets a short player look short instead of being zoomed back
  // up to the frame.
  const HEIGHT_MAX = 1.3;   // the height slider's max, as a factor

  function heightFactor(params) {
    const h = Number(params.height);
    return Number.isFinite(h) ? h / 100 : 1;
  }

  // Frame sized for the tallest build there is, so a tall player has somewhere
  // to be tall rather than having his head cropped.
  function autoFit(params, topY) {
    return Math.min(1.45, (GROUND - TOP_MARGIN) / (topY * HEIGHT_MAX)) * heightFactor(params);
  }

  // Every player scaled to exactly the same rendered height, whatever their
  // sliders say. Uncapped on purpose: the cap exists to stop a tiny build
  // blowing up in the builder frame, and here "the same height as everyone
  // else" is the whole point. Perspective, not the sliders, is what makes one
  // player smaller than another in a group shot.
  function uniformFit(params) {
    return (GROUND - TOP_MARGIN) / computeDims(params).topY * heightFactor(params);
  }

  // opts.background === false draws the figure alone, on whatever is already
  // under it, so several players can be composited into one scene. The caller
  // places and scales with translate/scale before calling - every coordinate
  // here goes through p(), so the whole figure follows the current transform.
  // opts.shadow === false drops the ground shadow, which reads as a floating
  // smudge on anyone not standing on the front of the scene.
  // opts.fit overrides the auto-zoom. The zoom exists so one player fills the
  // builder frame, which is exactly wrong for a group: applied per player it
  // scales everyone to the same height and flattens out the height sliders.
  // A group passes ONE fit for everybody - see fitFor().
  function render(ctx, params, yaw, anim, opts) {
    const background = !opts || opts.background !== false;
    const shadow = !opts || opts.shadow !== false;
    const dims = computeDims(params);
    ANIM = anim || null;
    // The camera follows the puck, so the shooter slides out of frame to the
    // left rather than being cut away. PAN_MAX is far enough to clear the edge.
    SHIFT = ANIM ? ANIM.shift - PAN_MAX * (ANIM.pan || 0) : 0;
    FIT = (opts && opts.fit) ? opts.fit : autoFit(params, dims.topY);
    ctx.save();
    if (background) {
      ctx.clearRect(0, 0, p(LW), p(LH));
      drawIce(ctx);
    }
    // No shadow during a highlight: the camera travels, and a shadow is one
    // more thing that has to travel convincingly with it for no gain.
    if (shadow && !ANIM) drawShadow(ctx, dims);
    if (ANIM && ANIM.net !== 0) drawNet(ctx, ANIM.net);

    drawFigure(ctx, dims, params, yaw);
    if (ANIM) finishShot(ctx, dims, params, yaw);
    else LAUNCH = null;
    ctx.restore();
  }

  function drawFigure(ctx, dims, params, yaw) {
    const torso = Object.assign({}, dims.torso, { style: dims.bodyStyle, color: params.jerseyColor });
    const head = Object.assign({}, dims.head, { style: dims.headStyle, color: params.skinColor });
    const parts = bodyParts(ctx, dims, params, yaw).concat([
      slabPart(ctx, torso, yaw),
      jerseyPart(ctx, dims, params, yaw),
      slabPart(ctx, head, yaw),
      helmetPart(ctx, dims, params, yaw),
      facePart(ctx, dims, params, yaw),
      stickPart(ctx, dims, params, yaw)
    ]).concat(armParts(ctx, dims, params, yaw), hairParts(ctx, dims, params, yaw));
    depthSort(parts);
    parts.forEach(part => part.draw());
  }

  // The puck and the readout, which outlive the player on screen.
  function finishShot(ctx, dims, params, yaw) {
    if (ANIM.save) {
      if (ANIM.shot) drawSave(ctx, dims, params, yaw);
      if (ANIM.goal) drawGoalText(ctx, ANIM.label);
      return;
    }
    if (ANIM.puckT === null) return puckRest(ctx, dims, params, yaw);
    drawPuck(ctx, dims, params, yaw, ANIM.puckT);
    if (ANIM.goal) drawGoalText(ctx, ANIM.label);
  }

  // CX and GROUND are exported so a caller compositing several players lines
  // them up on the renderer's own centre line and ice, rather than guessing.
  window.CAP_DRAW = {
    LW: LW, LH: LH, S: S, CX: CX, GROUND: GROUND,
    // A uniform-fit player is exactly this many logical units tall.
    FRAME: GROUND - TOP_MARGIN,
    render: render,
    computeDims: computeDims,
    uniformFit: uniformFit
  };

})();
