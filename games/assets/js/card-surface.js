// A canvas that takes PDF instructions.
//
// The printable card is laid out once (card-print.js) and drawn twice: into a
// PDF for printing, and into a canvas for the PNG people edit. Rather than
// keep two layouts in step, both are handed a "surface" with the same few
// methods, and this is the canvas one. CAP_PDF.doc() is the other.
//
// PDF coordinates, so the layout code does not have to care which it is
// talking to: points, origin bottom-left, y upwards, grey 0 = black, 1 = white.
//
// No storage, no page DOM beyond the canvas it is given.

(function () {

  const FACE = {
    normal: '400 %dpx "Helvetica Neue", Helvetica, Arial, sans-serif',
    bold:   '700 %dpx "Helvetica Neue", Helvetica, Arial, sans-serif',
    italic: 'italic 400 %dpx "Helvetica Neue", Helvetica, Arial, sans-serif'
  };

  function canvas(ctx, width, height, scale) {
    const k = scale || 1;
    const up = function (y) { return (height - y) * k; };   // y counts the other way
    // Same two ways of naming a colour the PDF surface takes: "#RRGGBB", or a
    // grey from 0 (black) to 1 (white).
    const grey = function (g) {
      if (typeof g === "string" && g.charAt(0) === "#") return g;
      const v = Math.round((g == null ? 0 : g) * 255);
      return "rgb(" + v + "," + v + "," + v + ")";
    };
    const round = function (x, y, w, h, r) {
      const top = up(y + h);
      ctx.beginPath();
      if (ctx.roundRect) return ctx.roundRect(x * k, top, w * k, h * k, r * k);
      ctx.rect(x * k, top, w * k, h * k);
    };
    const font = function (name, size) {
      return (FACE[name] || FACE.normal).replace("%d", size * k);
    };

    const api = {
      text: function (x, y, value, opts) {
        const o = opts || {};
        const size = o.size || 10;
        ctx.save();
        ctx.font = font(o.font || "normal", size);
        ctx.fillStyle = grey(o.grey);
        ctx.textBaseline = "alphabetic";
        ctx.fillText(String(value), x * k, up(y));
        ctx.restore();
        return api;
      },
      centre: function (x, w, y, value, opts) {
        const o = opts || {};
        ctx.save();
        ctx.font = font(o.font || "normal", o.size || 10);
        ctx.fillStyle = grey(o.grey);
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(String(value), (x + w / 2) * k, up(y));
        ctx.restore();
        return api;
      },
      line: function (x1, y1, x2, y2, opts) {
        const o = opts || {};
        ctx.save();
        ctx.strokeStyle = grey(o.grey);
        ctx.lineWidth = (o.width || 0.5) * k;
        if (o.dash) ctx.setLineDash(o.dash.split(" ").map(function (n) { return Number(n) * k; }));
        ctx.beginPath();
        ctx.moveTo(x1 * k, up(y1));
        ctx.lineTo(x2 * k, up(y2));
        ctx.stroke();
        ctx.restore();
        return api;
      },
      rect: function (x, y, w, h, opts) {
        const o = opts || {};
        ctx.save();
        // PDF gives the bottom edge; canvas wants the top one.
        const top = up(y + h);
        if (o.dash) ctx.setLineDash(o.dash.split(" ").map(function (n) { return Number(n) * k; }));
        if (o.radius) {
          round(x, y, w, h, o.radius);
          if (o.fill != null) { ctx.fillStyle = grey(o.fill); ctx.fill(); }
          if (o.stroke != null) {
            ctx.strokeStyle = grey(o.stroke);
            ctx.lineWidth = (o.width || 1) * k;
            ctx.stroke();
          }
        } else {
          if (o.fill != null) {
            ctx.fillStyle = grey(o.fill);
            ctx.fillRect(x * k, top, w * k, h * k);
          }
          if (o.stroke != null) {
            ctx.strokeStyle = grey(o.stroke);
            ctx.lineWidth = (o.width || 1) * k;
            ctx.strokeRect(x * k, top, w * k, h * k);
          }
        }
        ctx.restore();
        return api;
      },
      clip: function (x, y, w, h, r, inside) {
        ctx.save();
        round(x, y, w, h, r);
        ctx.clip();
        inside();
        ctx.restore();
        return api;
      },
      image: function (source, x, y, w, h) {
        ctx.drawImage(source, x * k, up(y + h), w * k, h * k);
        return api;
      },
      // The PDF surface hands back a file here; a canvas already is one.
      blob: function () { return null; }
    };
    return api;
  }

  window.CAP_SURFACE = { canvas: canvas };

})();
