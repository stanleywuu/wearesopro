// The printable card: front and back, side by side, at trading-card size.
//
// What is on paper is deliberately not what is on screen. The stat boxes and
// the bio lines are EMPTY - the point is to print it and fill it in by hand -
// and the site's name is nowhere on the card, because nobody prints a thing
// with someone else's watermark across it.
//
// Needs CAP_PDF (the writer), CAP_DRAW (the player) and CAP_STATS (the column
// headings only).

(function () {

  const PDF = window.CAP_PDF, DRAW = window.CAP_DRAW, STATS = window.CAP_STATS;
  const REEL = window.CAP_REEL, SURFACE = window.CAP_SURFACE;

  const PAGE = { w: 612, h: 792 };          // US Letter, points
  const CARD = { w: 180, h: 252 };          // 2.5 x 3.5 inches, a hockey card
  const GAP = 36;
  // Straight off the page's own stylesheet: the printed card is meant to be the
  // card you were just looking at, not a black-and-white version of it.
  const INK = "#16222E", MID = "#516273", PALE = "#C8D3DE";
  const PAPER = "#FFFDF6", WHITE = "#FFFFFF";
  const PLATE_SUB = "#9FB4C7";
  const PAD = 7;                 // the card's gold margin
  const R = 7;                   // corner radius, card
  const RI = 4;                  // corner radius, inner frame

  // Four cards on one page, two ways round.
  //
  // The default is the SAME card twice - one to keep, one to hand over - in
  // whichever pose they picked. Nobody wants three pictures they did not
  // choose. `opts.allPoses` gives the other sheet: one of each pose, for
  // anyone who does want the set.
  function build(params, filled, opts) {
    const typed = filled || { stats: {}, bio: "" };
    const o = opts || {};
    const doc = PDF.doc(PAGE.w, PAGE.h);
    const x0 = (PAGE.w - (CARD.w * 2 + GAP)) / 2;
    const y1 = PAGE.h / 2 + 12;                 // top row sits above centre
    const y0 = y1 - CARD.h - GAP;
    const shots = poses(params, o.reel);
    const chosen = shots[Math.min(Math.max(0, o.pose || 0), shots.length - 1)];

    doc.text(x0, PAGE.h - 62, "Print it, cut along the lines, fill in the back.",
             { size: 11, grey: MID });

    if (o.allPoses) {
      front(doc, x0, y1, params, shots[0]);
      front(doc, x0 + CARD.w + GAP, y1, params, shots[1]);
      front(doc, x0, y0, params, shots[2]);
      back(doc, x0 + CARD.w + GAP, y0, params, typed);
      return doc.blob();
    }

    front(doc, x0, y1, params, chosen);
    back(doc, x0 + CARD.w + GAP, y1, params, typed);
    front(doc, x0, y0, params, chosen);
    back(doc, x0 + CARD.w + GAP, y0, params, typed);
    return doc.blob();
  }

  // The moments worth printing, in the order the picker shows them: standing,
  // into it, through it. Chosen so the player is in frame and the camera has
  // not travelled. A goalie gets his own, because his reel is three saves
  // rather than a shot.
  // Picked by eye off the filmstrip, not by guessing at numbers. A defenceman
  // is the fussy one: through the middle of his windup the stick is behind his
  // body and he looks empty-handed, so his frames are the glide and the
  // follow-through and nothing in between.
  // Each picture is a moment AND an angle. A wrist shot barely changes the
  // silhouette - two frames of it look like the same photo twice - so the
  // forward's three are a standing three-quarter, the sweep side-on, and the
  // celebration after it. The goalie's three are three different saves and
  // need no help.
  const MOMENTS = {
    skater:  [{ ms: 0, yaw: 0.5 },
              { ms: 1950, shift: -14 },
              { ms: 3400, yaw: 0.85, shift: -14 }],
    defence: [{ ms: 0, yaw: 0.5 }, { ms: 1200 }, { ms: 2450 }],
    saves:   [{ ms: 0 }, { ms: 1150 }, { ms: 1780 }],
    // The other reels. A wipeout is worth printing for the same reason it is
    // worth watching, so its three are the stride, the moment the feet go, and
    // the landing.
    wipeout: [{ ms: 400 }, { ms: 1150 }, { ms: 1950 }],
    spin:    [{ ms: 480 }, { ms: 880 }, { ms: 1250 }],
    scramble:[{ ms: 560 }, { ms: 1360 }, { ms: 2300 }]
  };

  // Which reels a player can be printed from. Their own is the default; the
  // picker on the card page offers the rest. Nothing here touches the share
  // code - what someone else sees when they open the card is still whatever
  // that player rolled.
  function reels(params) {
    return params.position === "Goalie" ? ["saves", "scramble"] : ["shot", "wipeout", "spin"];
  }

  // The moments key for a reel: only the shot has two of them, because a
  // defenceman's windup hides the stick behind his body and needs its own
  // frames.
  function kind(params, reel) {
    const r = reel || "shot";
    if (r !== "shot") return r;
    if (params.position === "Goalie") return "saves";
    return params.position === "Defence" ? "defence" : "skater";
  }

  // The player's own reel unless the caller names another: MOMENTS are moments
  // in a PARTICULAR timeline, so the frames follow whichever one is printing.
  function poses(params, reel) {
    if (!REEL) return [null, null, null];
    const built = REEL.build(params, null, reel || null);
    return MOMENTS[kind(params, built.kind)].map(function (at) {
      const anim = at.ms ? REEL.at(built, at.ms) : null;
      // A shot frame puts the player mid-frame with the net beside them and a
      // third of the picture left over. Pushing them away from the net spreads
      // the two across the card instead.
      if (anim && at.shift) anim.shift += at.shift;
      // A named angle wins - a wrist shot barely changes the silhouette, so the
      // forward's stills are turned by hand - then the reel's own, which is how
      // the spin gets a different angle in every picture.
      const turned = at.yaw != null ? at.yaw : (anim && anim.yaw != null ? anim.yaw : built.yaw);
      return { reel: built, anim: anim, yaw: turned };
    });
  }

  // ---- front -------------------------------------------------------------

  // The card as the page draws it: a gold border, an inked frame, the picture
  // on ice, a dark name plate and their phrase on paper.
  // The border, light at the top and dark at the foot, worked out from the one
  // colour the player carries. Same idea as the sheen the page paints over it.
  function edgeStops(params) {
    const base = params.cardEdge || "#F8A41B";
    return [mix(base, "#FFFFFF", 0.45), base, mix(base, "#000000", 0.22)];
  }

  function body(doc, x, y, params) {
    // A stack of thin bands rather than a gradient: a PDF gradient is a whole
    // shading dictionary, and twenty slices of it are smooth at this size.
    const stops = edgeStops(params);
    doc.rect(x, y, CARD.w, CARD.h, { fill: stops[2], radius: R });
    doc.clip(x, y, CARD.w, CARD.h, R, function () {
      const bands = 20;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);            // 0 at the bottom, 1 at the top
        doc.rect(x, y + CARD.h * t, CARD.w, CARD.h / bands + 0.6,
                 { fill: blend(stops, t) });
      }
    });
  }

  // Two-stop interpolation across the gold, bottom colour first.
  function blend(stops, t) {
    const list = stops.slice().reverse();      // dark at 0, bright at 1
    const at = Math.min(0.999, Math.max(0, t)) * (list.length - 1);
    const i = Math.floor(at);
    return mix(list[i], list[i + 1], at - i);
  }

  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const out = [16, 8, 0].map(function (shift) {
      const from = A >> shift & 255, to = B >> shift & 255;
      return Math.round(from + (to - from) * t);
    });
    return "#" + out.map(function (c) { return ("0" + c.toString(16)).slice(-2); }).join("");
  }

  function front(doc, x, y, params, shot) {
    cut(doc, x, y);
    body(doc, x, y, params);

    const fx = x + PAD, fy = y + PAD, fw = CARD.w - PAD * 2, fh = CARD.h - PAD * 2;
    doc.rect(fx, fy, fw, fh, { fill: WHITE, stroke: INK, width: 1.6, radius: RI });

    const plateH = 34, quoteH = 18;
    const photo = { x: fx, y: fy + quoteH + plateH, w: fw, h: fh - quoteH - plateH };
    doc.clip(fx, fy, fw, fh, RI, function () {
      doc.rect(photo.x, photo.y, photo.w, photo.h, { fill: params.cardBack || "#EEF6FF" });
      // Fitted, never stretched: the render is taller than it is wide (180x200),
      // and filling the window made every player a stone heavier.
      const box = fit(photo, DRAW.LW / DRAW.LH);
      doc.image(player(params, shot), box.x, box.y, box.w, box.h);

      // Name plate across the bottom, the way a card has always done it.
      doc.rect(fx, fy + quoteH, fw, plateH, { fill: INK });
      doc.rect(fx, fy, fw, quoteH, { fill: PAPER });
    });
    doc.line(photo.x, photo.y, photo.x + photo.w, photo.y, { grey: INK, width: 1.6 });
    doc.line(fx, fy + quoteH, fx + fw, fy + quoteH, { grey: PALE, width: 0.8 });

    const num = params.number ? "#" + params.number : "";
    const textX = fx + 8 + (num ? 30 : 0);
    if (num) doc.text(fx + 8, fy + quoteH + 11, num, { font: "bold", size: 15, grey: edgeStops(params)[0] });
    doc.text(textX, fy + quoteH + 18, params.name || "Unnamed", { font: "bold", size: 11, grey: WHITE });
    doc.text(textX, fy + quoteH + 8,
             (params.position + " - shoots " + (params.handedness === "right" ? "right" : "left")).toUpperCase(),
             { size: 6.5, grey: PLATE_SUB });
    if (params.phrase) {
      doc.text(fx + 8, fy + 6.5, quote(params.phrase, 46), { font: "italic", size: 7.5, grey: MID });
    }
  }

  // ---- back --------------------------------------------------------------

  function back(doc, x, y, params, typed) {
    cut(doc, x, y);
    body(doc, x, y, params);
    const fx = x + PAD, fy = y + PAD, fw = CARD.w - PAD * 2, fh = CARD.h - PAD * 2;
    doc.rect(fx, fy, fw, fh, { fill: WHITE, stroke: INK, width: 1.6, radius: RI });
    x = fx - 4;                  // the rest of this was written against the card edge
    let top = fy + fh - 20;
    if (params.number) {
      doc.text(x + 14, top, "#" + params.number, { font: "bold", size: 13, grey: edgeStops(params)[2] });
    }
    doc.text(x + 14 + (params.number ? 30 : 0), top, params.name || "Unnamed",
             { font: "bold", size: 11.5, grey: INK });
    top -= 13;
    doc.text(x + 14, top, params.position + " - shoots " + (params.handedness === "right" ? "right" : "left"),
             { size: 7.5, grey: MID });
    top -= 8;
    doc.line(x + 14, top, x + CARD.w - 14, top, { grey: INK, width: 1 });

    // Empty boxes with the headings on: the numbers are the owner's to write.
    top -= 34;
    const heads = STATS.forPlayer(params, "").map(function (row) { return row[0]; });
    const cellW = (CARD.w - 28) / heads.length;
    heads.forEach(function (label, i) {
      const cx = x + 14 + i * cellW;
      doc.rect(cx + 1, top, cellW - 2, 30, { fill: PAPER, stroke: PALE, width: 0.8, radius: 2 });
      doc.centre(cx + 1, cellW - 2, top + 22, label, { size: 6.5, grey: MID });
      // Printed only if they typed it. An empty box is the whole point.
      const value = (typed.stats && typed.stats[label]) || "";
      if (value) doc.centre(cx + 1, cellW - 2, top + 7, value, { font: "bold", size: 11, grey: INK });
    });

    // Their story, or the space to write one. Ruled lines only where there is
    // no text: half-typed and half-ruled looks like a form someone abandoned.
    let line = top - 22;
    const story = wrap(typed.bio || "", 42, 6);
    for (let i = 0; i < 6; i++) {
      if (story[i]) doc.text(x + 14, line + 3, story[i], { size: 8.5, grey: INK });
      else doc.line(x + 14, line, x + CARD.w - 14, line, { grey: PALE, width: 0.6 });
      line -= 16;
    }

    if (params.phrase) {
      doc.text(x + 14, y + 22, quote(params.phrase, 44), { font: "italic", size: 8, grey: MID });
    }
  }

  // The biggest rectangle of the given aspect that fits inside a box, centred.
  function fit(box, aspect) {
    const w = Math.min(box.w, box.h * aspect);
    const h = w / aspect;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w: w, h: h };
  }

  // The cut line IS the card's edge: dashed, so it reads as "cut here" rather
  // than as a border the card is meant to have.
  function cut(doc, x, y) {
    doc.rect(x, y, CARD.w, CARD.h, { stroke: PALE, width: 0.7, dash: "3 3" });
  }

  // Greedy wrap to a line length, capped at a number of lines.
  function wrap(text, width, lines) {
    const out = [];
    let line = "";
    String(text).split(/\s+/).forEach(function (word) {
      if (!word) return;
      const next = line ? line + " " + word : word;
      if (next.length <= width) return void (line = next);
      if (out.length < lines) out.push(line);
      line = word;
    });
    if (line && out.length < lines) out.push(line);
    return out;
  }

  function quote(text, max) {
    const one = '"' + text + '"';
    return one.length > max ? one.slice(0, max - 2) + '..."' : one;
  }

  // The player, drawn big enough that print does not show the pixels.
  // One frame, drawn big enough that print does not show the pixels. No shot
  // means the resting pose, three-quarters on, the way the hub draws them.
  function player(params, shot) {
    const canvas = document.createElement("canvas");
    canvas.width = DRAW.LW * DRAW.S * 2;
    canvas.height = DRAW.LH * DRAW.S * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    // portraitFit, not the builder's auto zoom: auto leaves headroom for the
    // tallest build there is, which on a card is a third of the picture spent
    // on empty ice above the helmet. Not uniformFit either - that is the group
    // fit, and it multiplies the stature back in, which cropped a tall build.
    DRAW.render(ctx, params, shot ? shot.yaw : 0.5, shot ? shot.anim : null,
                { background: false, fit: DRAW.portraitFit(params) });
    return canvas;
  }

  function name(params) {
    const who = (params.name || "player").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return "hockey-card-" + (who || "player") + ".pdf";
  }

  function download(params, filled, opts) {
    PDF.save(build(params, filled, opts), name(params));
  }

  // ---- the same card, as an image ----------------------------------------

  // Front and back side by side on one PNG, laid out by the same code that
  // writes the PDF - one layout, two surfaces, so they cannot drift apart.
  // This is the file to hand someone who wants to edit it: already formatted,
  // and every piece of it is where the printed card has it.
  function sheet(params, filled, opts) {
    const typed = filled || { stats: {}, bio: "" };
    const o = opts || {};
    const scale = o.scale || 4;            // 2.5in card at ~288dpi
    const pad = 12;
    const w = CARD.w * 2 + GAP + pad * 2;
    const h = CARD.h + pad * 2;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    const surface = SURFACE.canvas(ctx, w, h, scale);

    const chosen = poses(params, o.reel)[Math.min(Math.max(0, o.pose || 0), 2)];
    front(surface, pad, pad, params, chosen);
    back(surface, pad + CARD.w + GAP, pad, params, typed);
    return canvas;
  }

  function savePng(params, filled, opts) {
    const file = name(params).replace(/\.pdf$/, ".png");
    sheet(params, filled, opts).toBlob(function (blob) {
      if (blob) PDF.save(blob, file);
    }, "image/png");
  }

  window.CAP_PRINT = { build: build, download: download, poses: poses, kind: kind,
                       reels: reels, sheet: sheet, savePng: savePng };

})();
