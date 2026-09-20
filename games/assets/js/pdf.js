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
        const grey = o.grey == null ? 0 : o.grey;
        ops.push("BT /" + font + " " + size + " Tf " + grey + " g " +
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
        ops.push((o.grey == null ? 0 : o.grey) + " G " + (o.width || 0.5) + " w " +
                 (o.dash ? "[" + o.dash + "] 0 d " : "[] 0 d ") +
                 x1.toFixed(2) + " " + y1.toFixed(2) + " m " +
                 x2.toFixed(2) + " " + y2.toFixed(2) + " l S");
        return api;
      },
      rect: function (x, y, w, h, opts) {
        const o = opts || {};
        const path = x.toFixed(2) + " " + y.toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2) + " re ";
        if (o.fill != null) ops.push(o.fill + " g " + path + "f");
        if (o.stroke != null) {
          ops.push(o.stroke + " G " + (o.width || 1) + " w " +
                   (o.dash ? "[" + o.dash + "] 0 d " : "[] 0 d ") + path + "S");
        }
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
