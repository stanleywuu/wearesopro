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
    const drop = crouch * 12;
    const lean = crouch * 7;
    const hipY = HIP_Y - drop;

    // A goalie at rest stands straight with both hands on the knob of an
    // upright stick and his head tipped forward onto them - the Dryden pose.
    // Only while idle: mid-highlight he takes the ordinary skating stance.
    const rest = params.position === "Goalie" && !ANIM;

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
    const r = rotY(side * (dims.legX + 0.5), 9, yaw);
    const midY = (SKATE_Y + dims.hipY) / 2 + 2;
    const c = project(r.x, midY, r.z);
    const hh = ((dims.hipY - SKATE_Y) / 2 + 2) * c.k;
    return {
      d: r.z + 0.8,
      draw: () => {
        const hw = silWidth(9, 5.5, yaw, 0) * c.k;
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
    const mc = project(hr.x, head.y, hr.z);
    return {
      d: 0.1,
      draw: () => {
        ctx.beginPath();
        if (mask) ctx.ellipse(p(mc.sx), p(mc.sy), p(hw * 1.04), p(head.ry * 1.14 * mc.k), 0, 0, Math.PI * 2);
        else ctx.ellipse(p(c.sx), p(c.sy), p(hw), p(hh), 0, Math.PI, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = slabFill(ctx, mask ? mc.sx : c.sx, hw, params.helmetColor, yaw);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = p(OUTLINE_W);
        ctx.lineJoin = "round";
        ctx.stroke();
        if (mask) return;
        drawEarLobes(ctx, c.sx, c.sy, hw, params.helmetColor);
        if (params.helmetStyle === "visor") drawVisor(ctx, dims, yaw);
      }
    };
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
  function drawEarLobes(ctx, cx, cy, hw, helmetColor) {
    const color = shade(helmetColor, -0.22);
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.ellipse(p(cx + side * hw * 0.88), p(cy + 1), p(2.8), p(3.6), 0, 0, Math.PI * 2);
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

  // Eyes and mouth live on the front of the head, so they vanish as it turns away.
  function facePart(ctx, dims, params, yaw) {
    const head = dims.head;
    return {
      d: head.rz,
      draw: () => {
        const facing = Math.cos(yaw);
        if (facing < 0.3) return;
        const eyeY = head.y - head.ry * 0.16;
        [-1, 1].forEach(s => {
          const r = rotY(head.x + s * head.rx * 0.36, head.z + head.rz * 0.8, yaw);
          // An eye that has rotated onto the far hemisphere would otherwise
          // sit out at the silhouette edge, reading as detached from the head.
          if (r.z <= 0) return;
          const c = project(r.x, eyeY, r.z);
          E(ctx, c.sx, c.sy, 1.7 * c.k, 2.1 * c.k, OUTLINE);
        });
        const m = rotY(head.x, head.z + head.rz * 0.85, yaw);
        const mc = project(m.x, head.y - head.ry * 0.56, m.z);
        L(ctx, mc.sx - 3 * facing, mc.sy, mc.sx + 3 * facing, mc.sy, OUTLINE, 1.2);
        if (params.helmetStyle === "mask") drawCage(ctx, dims, yaw);
      }
    };
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
  function stickPoints(dims, params) {
    const hand = params.handedness === "left" ? -1 : 1;
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

    const s = { hand: hand, butt: butt, heel: heel, toe: toe, topHand: topHand, lowHand: lowHand };
    return ANIM && ANIM.swing ? swingStick(s, ANIM.swing * hand) : s;
  }

  // The goalie's stick stands on its blade out in front of him, knob just under
  // the chin. The hands go on top of the knob and the head comes down onto the
  // hands - so the head drives the height, not the other way round.
  function goalieStick(dims, params) {
    const hand = params.handedness === "left" ? -1 : 1;
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
    return [
      { x: k.x + h * 5.2, y: k.y + 1.4, z: k.z + 0.8 },
      { x: k.x - h * 5.2, y: k.y + 2.4, z: k.z - 1.0 }
    ];
  }

  function armParts(ctx, dims, params, yaw) {
    const s = stickFor(dims, params);
    const grips = gripsFor(dims, s);
    const shoulderX = dims.torso.rx * 0.70;
    // Gloves take a darker shade of the jersey rather than the lettering
    // colour — white lettering is right on a jersey, wrong on a glove.
    const gloveColor = shade(params.jerseyColor, -0.4);
    return [
      { shoulder: { x: s.hand * shoulderX, y: dims.shoulderY, z: 1 }, grip: grips[0], blocker: true },
      { shoulder: { x: -s.hand * shoulderX, y: dims.shoulderY, z: 1 }, grip: grips[1], blocker: false }
    ].map(pair => {
      const a = proj3(pair.shoulder, yaw);
      const e = proj3(elbowFor(pair.shoulder, pair.grip), yaw);
      const b = proj3(pair.grip, yaw);
      return {
        d: (a.d + b.d) / 2 + 3,
        draw: () => {
          drawArm(ctx, a, e, b, 8, params.jerseyColor);
          if (!dims.goalie) return drawGlove(ctx, b, gloveColor);
          if (pair.blocker) drawBlocker(ctx, b, gloveColor, params.trimColor);
          else drawTrapper(ctx, b, gloveColor, params.trimColor);
        }
      };
    });
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
    // Sort by the rotated depth at the hands, just behind the arms, so the
    // gloves read as gripping the shaft rather than the shaft crossing them.
    const grip = rotY(s.topHand.x, s.topHand.z, yaw);
    return {
      d: grip.z - 3,
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
    const grip = rotY(s.topHand.x, s.topHand.z, yaw);
    return {
      d: grip.z - 3,
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

  // ---- scene ------------------------------------------------------------

  function drawShadow(ctx, dims) {
    const w = dims.torso.rx * 1.6;
    ctx.save();
    ctx.globalAlpha = 0.18;
    E(ctx, CX, GROUND + 1, w, w * 0.26, "#0C1B2A");
    ctx.restore();
  }

  // ---- highlight scenery ------------------------------------------------

  const NET = { x: LW - 30, w: 36, h: 30 };

  function drawNet(ctx) {
    const w = NET.w * FIT, h = NET.h * FIT;
    const base = GROUND - 1, left = NET.x - w / 2, right = NET.x + w / 2, top = base - h;
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

  // Flies from wherever the blade finished its swing to the mouth of the net.
  function drawPuck(ctx, dims, params, yaw, t) {
    const toe = proj3(stickPoints(dims, params).toe, yaw);
    const sx = toe.sx + (NET.x - toe.sx) * t;
    const sy = toe.sy + (GROUND - 9 - toe.sy) * t - Math.sin(t * Math.PI) * 9;
    E(ctx, sx, sy, 3, 2.1, "#11181F");
  }

  function drawGoalText(ctx) {
    ctx.save();
    ctx.font = "800 " + p(18) + "px " + FONT;
    ctx.textAlign = "right";
    ctx.lineJoin = "round";
    ctx.lineWidth = p(3);
    ctx.strokeStyle = OUTLINE;
    const y = GROUND - NET.h * FIT - 12;
    ctx.strokeText("GOAL!", p(LW - 8), p(y));
    ctx.fillStyle = "#FDD835";
    ctx.fillText("GOAL!", p(LW - 8), p(y));
    ctx.restore();
  }

  function drawIce(ctx) {
    ctx.fillStyle = "#EEF6FF";
    ctx.fillRect(0, 0, p(LW), p(LH));
    L(ctx, 0, GROUND + 2, LW, GROUND + 2, "#D3E4F5", 1.2);
  }

  // ---- entry point ------------------------------------------------------

  // opts.background === false draws the figure alone, on whatever is already
  // under it, so several players can be composited into one scene. The caller
  // places and scales with translate/scale before calling - every coordinate
  // here goes through p(), so the whole figure follows the current transform.
  // opts.shadow === false drops the ground shadow, which reads as a floating
  // smudge on anyone not standing on the front of the scene.
  function render(ctx, params, yaw, anim, opts) {
    const background = !opts || opts.background !== false;
    const shadow = !opts || opts.shadow !== false;
    const dims = computeDims(params);
    ANIM = anim || null;
    SHIFT = ANIM ? ANIM.shift : 0;
    FIT = Math.min(1.45, (GROUND - TOP_MARGIN) / dims.topY);
    ctx.save();
    if (background) {
      ctx.clearRect(0, 0, p(LW), p(LH));
      drawIce(ctx);
    }
    if (shadow) drawShadow(ctx, dims);
    if (ANIM) drawNet(ctx);

    const torso = Object.assign({}, dims.torso, { style: dims.bodyStyle, color: params.jerseyColor });
    const head = Object.assign({}, dims.head, { style: dims.headStyle, color: params.skinColor });

    const parts = bodyParts(ctx, dims, params, yaw).concat([
      slabPart(ctx, torso, yaw),
      jerseyPart(ctx, dims, params, yaw),
      slabPart(ctx, head, yaw),
      helmetPart(ctx, dims, params, yaw),
      facePart(ctx, dims, params, yaw),
      stickPart(ctx, dims, params, yaw)
    ]).concat(armParts(ctx, dims, params, yaw));
    depthSort(parts);
    parts.forEach(part => part.draw());

    if (ANIM && ANIM.puckT !== null) drawPuck(ctx, dims, params, yaw, ANIM.puckT);
    if (ANIM && ANIM.goal) drawGoalText(ctx);
    ctx.restore();
  }

  // CX and GROUND are exported so a caller compositing several players lines
  // them up on the renderer's own centre line and ice, rather than guessing.
  window.CAP_DRAW = {
    LW: LW, LH: LH, S: S, CX: CX, GROUND: GROUND,
    render: render,
    computeDims: computeDims
  };

})();
