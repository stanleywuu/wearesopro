// A very small PDF writer: enough to put text, lines, boxes and a photo on one
// page, and nothing else.
//
// Why by hand: the site has no build step and no dependencies, and a PDF is a
// plain text container with an offset table at the end. Everything here is
// ASCII except the one JPEG we paste in whole - a canvas gives us JPEG bytes
// already compressed, so nothing needs a compressor.
//
// Units are points, 72 to the inch, origin bottom-left, like PDF itself.
//
// No DOM beyond the canvas it is handed. No storage.

(function () {

  const FONTS = { normal: "F1", bold: "F2", italic: "F3" };

  // Colours come in as "#RRGGBB" or as a grey 0-1, because most of this card
  // is black, white and paper and a number is easier to read than a hex.
  function paint(value, stroke) {
    if (typeof value === "string" && value.charAt(0) === "#") {
      const n = parseInt(value.slice(1), 16);
      const rgb = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
      return rgb.map(function (c) { return c.toFixed(3); }).join(" ") + (stroke ? " RG " : " rg ");
    }
    return (value == null ? 0 : value) + (stroke ? " G " : " g ");
  }

  // Rounded rectangle as four beziers. PDF has no such primitive, and a card
  // with square corners does not look like a card.
  function roundPath(x, y, w, h, r) {
    const c = r * 0.5523;
    return [
      (x + r).toFixed(2) + " " + y.toFixed(2) + " m",
      (x + w - r).toFixed(2) + " " + y.toFixed(2) + " l",
      (x + w - r + c).toFixed(2) + " " + y.toFixed(2) + " " + (x + w).toFixed(2) + " " + (y + r - c).toFixed(2) + " " + (x + w).toFixed(2) + " " + (y + r).toFixed(2) + " c",
      (x + w).toFixed(2) + " " + (y + h - r).toFixed(2) + " l",
      (x + w).toFixed(2) + " " + (y + h - r + c).toFixed(2) + " " + (x + w - r + c).toFixed(2) + " " + (y + h).toFixed(2) + " " + (x + w - r).toFixed(2) + " " + (y + h).toFixed(2) + " c",
      (x + r).toFixed(2) + " " + (y + h).toFixed(2) + " l",
      (x + r - c).toFixed(2) + " " + (y + h).toFixed(2) + " " + x.toFixed(2) + " " + (y + h - r + c).toFixed(2) + " " + x.toFixed(2) + " " + (y + h - r).toFixed(2) + " c",
      x.toFixed(2) + " " + (y + r).toFixed(2) + " l",
      x.toFixed(2) + " " + (y + r - c).toFixed(2) + " " + (x + r - c).toFixed(2) + " " + y.toFixed(2) + " " + (x + r).toFixed(2) + " " + y.toFixed(2) + " c",
      "h"
    ].join(" ") + " ";
  }

  function doc(width, height) {
    const ops = [];      // the page's content stream, built as we go
    const images = [];   // { name, jpeg, w, h }

    function esc(text) {
      return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    }

    // Anything outside Latin-1 cannot be written with the built-in fonts, so
    // the few characters we do use from higher up (curly quotes, the dot) are
    // mapped down rather than dropped on the floor.
    function latin(text) {
      return String(text)
        .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-").replace(/·/g, "-")
        .replace(/[^\x20-\xFF]/g, "");
    }

    const api = {
      text: function (x, y, value, opts) {
        const o = opts || {};
        const font = FONTS[o.font || "normal"];
        const size = o.size || 10;
        ops.push("BT /" + font + " " + size + " Tf " + paint(o.grey) +
                 x.toFixed(2) + " " + y.toFixed(2) + " Td (" + esc(latin(value)) + ") Tj ET");
        return api;
      },
      // Centred within a width, measured roughly: the built-in fonts are close
      // enough to 0.5em average that a card plate looks centred.
      centre: function (x, w, y, value, opts) {
        const size = (opts && opts.size) || 10;
        const guess = latin(value).length * size * 0.5;
        return api.text(x + Math.max(0, (w - guess) / 2), y, value, opts);
      },
      line: function (x1, y1, x2, y2, opts) {
        const o = opts || {};
        ops.push(paint(o.grey, true) + (o.width || 0.5) + " w " +
                 (o.dash ? "[" + o.dash + "] 0 d " : "[] 0 d ") +
                 x1.toFixed(2) + " " + y1.toFixed(2) + " m " +
                 x2.toFixed(2) + " " + y2.toFixed(2) + " l S");
        return api;
      },
      rect: function (x, y, w, h, opts) {
        const o = opts || {};
        const path = o.radius
          ? roundPath(x, y, w, h, o.radius)
          : x.toFixed(2) + " " + y.toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2) + " re ";
        if (o.fill != null) ops.push(paint(o.fill) + path + "f");
        if (o.stroke != null) {
          ops.push(paint(o.stroke, true) + (o.width || 1) + " w " +
                   (o.dash ? "[" + o.dash + "] 0 d " : "[] 0 d ") + path + "S");
        }
        return api;
      },
      // Everything drawn inside the callback is clipped to a rounded box, which
      // is how the photo and the plate keep the card's corners.
      clip: function (x, y, w, h, r, inside) {
        ops.push("q " + roundPath(x, y, w, h, r) + "W n");
        inside();
        ops.push("Q");
        return api;
      },
      // A canvas, pasted in as JPEG. Canvases here are drawn by CAP_DRAW.
      image: function (canvas, x, y, w, h) {
        const url = canvas.toDataURL("image/jpeg", 0.92);
        const name = "Im" + (images.length + 1);
        images.push({ name: name, jpeg: atob(url.slice(url.indexOf(",") + 1)),
                      w: canvas.width, h: canvas.height });
        ops.push("q " + w.toFixed(2) + " 0 0 " + h.toFixed(2) + " " +
                 x.toFixed(2) + " " + y.toFixed(2) + " cm /" + name + " Do Q");
        return api;
      },
      blob: function () { return assemble(width, height, ops.join("\n"), images); }
    };
    return api;
  }

  // ---- the file itself ---------------------------------------------------

  function assemble(width, height, stream, images) {
    const objects = [];
    const xobjects = images.map(function (im) { return "/" + im.name + " " + (7 + images.indexOf(im)) + " 0 R"; });

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + width + " " + height + "]" +
                 " /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>" +
                 (xobjects.length ? " /XObject << " + xobjects.join(" ") + " >>" : "") +
                 " >> /Contents " + (7 + images.length) + " 0 R >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
    images.forEach(function (im) {
      objects.push({ dict: "<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h +
                           " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
                           im.jpeg.length + " >>", data: im.jpeg });
    });
    objects.push({ dict: "<< /Length " + stream.length + " >>", data: stream });

    // Bytes, not characters: the JPEG is binary and the offsets in the table at
    // the end have to count what is actually written.
    const parts = [];
    let offset = 0;
    const offsets = [];
    function put(text) { parts.push(text); offset += text.length; }

    put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    objects.forEach(function (obj, i) {
      offsets.push(offset);
      if (typeof obj === "string") {
        put((i + 1) + " 0 obj\n" + obj + "\nendobj\n");
      } else {
        put((i + 1) + " 0 obj\n" + obj.dict + "\nstream\n" + obj.data + "\nendstream\nendobj\n");
      }
    });
    const start = offset;
    let table = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (at) { table += String(at).padStart(10, "0") + " 00000 n \n"; });
    table += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + start + "\n%%EOF\n";
    put(table);

    const bytes = new Uint8Array(offset);
    let at = 0;
    parts.forEach(function (text) {
      for (let i = 0; i < text.length; i++) bytes[at++] = text.charCodeAt(i) & 0xFF;
    });
    return new Blob([bytes], { type: "application/pdf" });
  }

  // Generic on purpose: the card also hands out PNGs, and one saver is enough.
  function save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.CAP_PDF = { doc: doc, save: save };

})();
