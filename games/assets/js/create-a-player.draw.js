// Create-a-Player renderer. Pure drawing — no DOM access, no event handling.
//
// 2.5D "silhouette slab" approach: every body part stays a 2D shape whose
// projected width, screen position, depth and shading are recomputed from the
// yaw angle. Shape identity comes from the outline, not from real geometry.

(function () {

  // Logical canvas grid, scaled up by S for a crisp bitmap (same idea as adopt.js).
  const LW = 180, LH = 220, S = 4;
  const p = n => n * S;

  // Camera: yaw only, with a fixed downward tilt so we look slightly onto the player.
  const CX = LW / 2;        // logical x of the player's centre line
  const GROUND = LH - 26;   // logical y of the ice under the skates
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
  function project(x, y, z) {
    const k = scaleAt(z);
    return { sx: CX + x * k, sy: GROUND - y * k + z * TILT, d: z, k: k };
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

    // The torso grows upward from the hips so the legs never end up inside it.
    const torso = { rx: 22 * bw, ry: 26 * bh, x: 0, z: 0 };
    torso.rz = torso.rx * 0.62;
    torso.y = HIP_Y + torso.ry * 0.8;

    const head = { rx: 14 * hw, ry: 15 * hh, x: 0, z: 0 };
    head.rz = head.rx * 0.8;
    head.y = torso.y + torso.ry + head.ry * 0.8;

    const shoulderY = torso.y + torso.ry * 0.55;
    return {
      torso: torso,
      head: head,
      shoulderY: shoulderY,
      armX: torso.rx + 4,
      gloveY: shoulderY - 26,
      legX: Math.max(6, torso.rx * 0.42),
      bodyStyle: shapeStyle(params.bodyShape, params.bodyContour / 100),
      headStyle: shapeStyle(params.headShape, params.headContour / 100),
      limbStyle: shapeStyle("capsule", 1)
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

  function limb(ctx, yaw, x, y, z, rx, ry, style, color) {
    return slabPart(ctx, { x: x, y: y, z: z, rx: rx, ry: ry, rz: rx, style: style, color: color }, yaw);
  }

  function bodyParts(ctx, dims, params, yaw) {
    const jersey = params.jerseyColor, trim = params.trimColor;
    const arms = [-1, 1].map(s => limb(ctx, yaw, s * dims.armX, dims.shoulderY - 13, 2, 4.5, 13, dims.limbStyle, jersey));
    const gloves = [-1, 1].map(s => limb(ctx, yaw, s * (dims.armX + 1), dims.gloveY, 4, 5.5, 5.5, dims.limbStyle, trim));
    const legs = [-1, 1].map(s => limb(ctx, yaw, s * dims.legX, (HIP_Y + SKATE_Y) / 2, 1, 5.5, (HIP_Y - SKATE_Y) / 2, dims.limbStyle, params.sockColor));
    const skates = [-1, 1].map(s => skatePart(ctx, yaw, s * dims.legX));
    return arms.concat(gloves, legs, skates);
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
        L(ctx, c.sx - hw, GROUND - 1, c.sx + hw, GROUND - 1, "#9AA7B4", 1.6);
      }
    };
  }

  // ---- head details -----------------------------------------------------

  // Helmet shell: a squashed cap sitting over the top of the head.
  function helmetPart(ctx, dims, params, yaw) {
    const head = dims.head;
    const o = {
      x: 0, y: head.y + head.ry * 0.34, z: 0,
      rx: head.rx * 1.1, ry: head.ry * 0.66, rz: head.rz * 1.1,
      style: { id: "capsule", taper: 0.92, round: 1, boxy: 0 },
      color: params.helmetColor
    };
    const part = slabPart(ctx, o, yaw);
    const shell = part.draw;
    part.draw = () => { shell(); if (params.helmetStyle === "cage") drawCage(ctx, dims, yaw); };
    return part;
  }

  function drawCage(ctx, dims, yaw) {
    const facing = Math.cos(yaw);
    if (facing < 0.15) return;
    const head = dims.head;
    const c = project(0, head.y - head.ry * 0.1, head.rz * facing);
    const hw = head.rx * 0.8 * facing * c.k, hh = head.ry * 0.55 * c.k;
    for (let i = -1; i <= 1; i++) L(ctx, c.sx + hw * i * 0.7, c.sy - hh, c.sx + hw * i * 0.7, c.sy + hh, "#3D4A57", 1);
    L(ctx, c.sx - hw, c.sy, c.sx + hw, c.sy, "#3D4A57", 1);
  }

  // Eyes and mouth live on the front of the head, so they vanish as it turns away.
  function facePart(ctx, dims, yaw) {
    const head = dims.head;
    return {
      d: head.rz,
      draw: () => {
        const facing = Math.cos(yaw);
        if (facing < 0.2) return;
        const eyeY = head.y + head.ry * 0.02;
        [-1, 1].forEach(s => {
          const r = rotY(s * head.rx * 0.36, head.rz * 0.8, yaw);
          const c = project(r.x, eyeY, r.z);
          E(ctx, c.sx, c.sy, 1.7 * c.k, 2.1 * c.k, OUTLINE);
        });
        const m = rotY(0, head.rz * 0.85, yaw);
        const mc = project(m.x, head.y - head.ry * 0.42, m.z);
        L(ctx, mc.sx - 3 * facing, mc.sy, mc.sx + 3 * facing, mc.sy, OUTLINE, 1.2);
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
    ctx.fillText(text, (w - ctx.measureText(text).width) / 2, 0);
    ctx.restore();
  }

  // One quad on the front or back of the torso, in body space.
  function jerseyQuad(dims, yaw, side, halfW, yTop, yBot) {
    const z = dims.torso.rz * side;
    const corner = (x, y) => {
      const r = rotY(x * side, z, yaw);
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
        if (Math.abs(facing) < 0.25) return;
        if (params.number) {
          const q = jerseyQuad(dims, yaw, side, t.rx * 0.45, t.y + t.ry * 0.18, t.y - t.ry * 0.34);
          drawQuadText(ctx, params.number, q.tl, q.tr, q.bl, params.trimColor);
        }
        if (params.name && side < 0) {
          const q = jerseyQuad(dims, yaw, side, t.rx * 0.62, t.y + t.ry * 0.62, t.y + t.ry * 0.38);
          drawQuadText(ctx, params.name.toUpperCase(), q.tl, q.tr, q.bl, params.trimColor);
        }
      }
    };
  }

  // ---- stick ------------------------------------------------------------

  // Shaft runs from the top glove down to a blade flat on the ice. Handedness
  // only flips which side the blade sits on — never mirror the whole canvas,
  // or the jersey number would come out backwards.
  function stickPart(ctx, dims, params, yaw) {
    const hand = params.handedness === "left" ? -1 : 1;
    // The shaft descends inward from the glove; the blade must carry on in that
    // same direction at a shallow lie. Kicking it back outward reads as a golf club.
    const grip = rotY(hand * (dims.armX + 1), 4, yaw);
    const heel = rotY(hand * 17, 22, yaw);
    const toe = rotY(hand * 1, 27, yaw);
    const g = project(grip.x, dims.gloveY, grip.z);
    const h = project(heel.x, 2.5, heel.z);
    const t = project(toe.x, 2.5, toe.z);
    return {
      d: Math.max(grip.z, heel.z),
      draw: () => {
        L(ctx, g.sx, g.sy, h.sx, h.sy, "#C9A227", 2.4);
        L(ctx, g.sx, g.sy, h.sx, h.sy, OUTLINE, 0.5);
        L(ctx, h.sx, h.sy, t.sx, t.sy, OUTLINE, 3.4);
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

  function drawIce(ctx) {
    ctx.fillStyle = "#EEF6FF";
    ctx.fillRect(0, 0, p(LW), p(LH));
    L(ctx, 0, GROUND + 2, LW, GROUND + 2, "#D3E4F5", 1.2);
  }

  // ---- entry point ------------------------------------------------------

  function render(ctx, params, yaw) {
    const dims = computeDims(params);
    ctx.clearRect(0, 0, p(LW), p(LH));
    drawIce(ctx);
    drawShadow(ctx, dims);

    const torso = Object.assign({}, dims.torso, { style: dims.bodyStyle, color: params.jerseyColor });
    const head = Object.assign({}, dims.head, { style: dims.headStyle, color: params.skinColor });

    const parts = bodyParts(ctx, dims, params, yaw).concat([
      slabPart(ctx, torso, yaw),
      jerseyPart(ctx, dims, params, yaw),
      slabPart(ctx, head, yaw),
      helmetPart(ctx, dims, params, yaw),
      facePart(ctx, dims, yaw),
      stickPart(ctx, dims, params, yaw)
    ]);
    depthSort(parts);
    parts.forEach(part => part.draw());
  }

  window.CAP_DRAW = {
    LW: LW, LH: LH, S: S,
    render: render,
    computeDims: computeDims
  };

})();
