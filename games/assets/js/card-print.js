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
  const REEL = window.CAP_REEL;

  const PAGE = { w: 612, h: 792 };          // US Letter, points
  const CARD = { w: 180, h: 252 };          // 2.5 x 3.5 inches, a hockey card
  const GAP = 36;
  const INK = 0.12, MID = 0.45, PALE = 0.75;

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
    const shots = poses(params);
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
  const MOMENTS = {
    skater:  [0, 1350, 2250],
    defence: [0, 1200, 2450],
    goalie:  [0, 1150, 1780]
  };

  function kind(params) {
    if (params.position === "Goalie") return "goalie";
    return params.position === "Defence" ? "defence" : "skater";
  }

  function poses(params) {
    if (!REEL) return [null, null, null];
    const reel = REEL.build(params);
    const ms = MOMENTS[kind(params)];
    return ms.map(function (at) {
      return at ? { reel: reel, anim: REEL.at(reel, at) } : null;
    });
  }

  // ---- front -------------------------------------------------------------

  function front(doc, x, y, params, shot) {
    cut(doc, x, y);
    const photo = { x: x + 10, y: y + 78, w: CARD.w - 20, h: CARD.h - 96 };
    doc.rect(photo.x, photo.y, photo.w, photo.h, { fill: 0.95, stroke: INK, width: 1 });
    // Fitted, never stretched: the render is taller than it is wide (180x200)
    // and the photo window is not, so filling the window made every player a
    // stone heavier than they are on screen.
    const box = fit(photo, DRAW.LW / DRAW.LH);
    doc.image(player(params, shot), box.x, box.y, box.w, box.h);

    // Name plate across the bottom, the way a card has always done it.
    doc.rect(x + 10, y + 34, CARD.w - 20, 40, { fill: INK });
    doc.text(x + 18, y + 55, params.number ? "#" + params.number : "", { font: "bold", size: 15, grey: 1 });
    doc.text(x + 18 + (params.number ? 34 : 0), y + 56, params.name || "Unnamed",
             { font: "bold", size: 12, grey: 1 });
    doc.text(x + 18 + (params.number ? 34 : 0), y + 43,
             params.position + " - shoots " + (params.handedness === "right" ? "right" : "left"),
             { size: 7.5, grey: 0.85 });
    if (params.phrase) {
      doc.text(x + 12, y + 20, quote(params.phrase, 46), { font: "italic", size: 8, grey: MID });
    }
  }

  // ---- back --------------------------------------------------------------

  function back(doc, x, y, params, typed) {
    cut(doc, x, y);
    let top = y + CARD.h - 24;
    doc.text(x + 14, top, (params.number ? "#" + params.number + "  " : "") + (params.name || "Unnamed"),
             { font: "bold", size: 12, grey: INK });
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
      doc.rect(cx + 1, top, cellW - 2, 30, { stroke: PALE, width: 0.8 });
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
    DRAW.render(ctx, params, shot ? shot.reel.yaw : 0.5, shot ? shot.anim : null);
    return canvas;
  }

  function name(params) {
    const who = (params.name || "player").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return "hockey-card-" + (who || "player") + ".pdf";
  }

  function download(params, filled, opts) {
    PDF.save(build(params, filled, opts), name(params));
  }

  window.CAP_PRINT = { build: build, download: download, poses: poses, kind: kind, draw: player };

})();
