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

  const PAGE = { w: 612, h: 792 };          // US Letter, points
  const CARD = { w: 180, h: 252 };          // 2.5 x 3.5 inches, a hockey card
  const GAP = 36;
  const INK = 0.12, MID = 0.45, PALE = 0.75;

  function build(params) {
    const doc = PDF.doc(PAGE.w, PAGE.h);
    const x0 = (PAGE.w - (CARD.w * 2 + GAP)) / 2;
    const y0 = (PAGE.h - CARD.h) / 2;

    doc.text(x0, PAGE.h - 72, "Print it, cut along the lines, fill in the back.",
             { size: 11, grey: MID });

    front(doc, x0, y0, params);
    back(doc, x0 + CARD.w + GAP, y0, params);
    return doc.blob();
  }

  // ---- front -------------------------------------------------------------

  function front(doc, x, y, params) {
    cut(doc, x, y);
    const photo = { x: x + 10, y: y + 78, w: CARD.w - 20, h: CARD.h - 96 };
    doc.rect(photo.x, photo.y, photo.w, photo.h, { fill: 0.95, stroke: INK, width: 1 });
    doc.image(player(params), photo.x, photo.y, photo.w, photo.h);

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

  function back(doc, x, y, params) {
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
    });

    // Ruled lines for a bio, because a card back is mostly someone's story.
    let line = top - 22;
    for (let i = 0; i < 6; i++) {
      doc.line(x + 14, line, x + CARD.w - 14, line, { grey: PALE, width: 0.6 });
      line -= 16;
    }

    if (params.phrase) {
      doc.text(x + 14, y + 22, quote(params.phrase, 44), { font: "italic", size: 8, grey: MID });
    }
  }

  // The cut line IS the card's edge: dashed, so it reads as "cut here" rather
  // than as a border the card is meant to have.
  function cut(doc, x, y) {
    doc.rect(x, y, CARD.w, CARD.h, { stroke: PALE, width: 0.7, dash: "3 3" });
  }

  function quote(text, max) {
    const one = '"' + text + '"';
    return one.length > max ? one.slice(0, max - 2) + '..."' : one;
  }

  // The player, drawn big enough that print does not show the pixels.
  function player(params) {
    const canvas = document.createElement("canvas");
    canvas.width = DRAW.LW * DRAW.S * 2;
    canvas.height = DRAW.LH * DRAW.S * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    DRAW.render(ctx, params, 0.5, null);
    return canvas;
  }

  function name(params) {
    const who = (params.name || "player").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return "hockey-card-" + (who || "player") + ".pdf";
  }

  function download(params) {
    PDF.save(build(params), name(params));
  }

  window.CAP_PRINT = { build: build, download: download };

})();
