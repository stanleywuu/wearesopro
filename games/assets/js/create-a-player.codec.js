// Create-a-Player codec: the player parameter object, its share code, and the
// whitelist every untrusted player passes through. No DOM, no drawing.
//
// Shared by the builder page and the team photo page, so this is the single
// place a player is defined and the single place one is validated.

(function () {

  const D = window.CAP_DATA;
  if (!D) return;

  // The colour fields, paired with the preset palette each one defaults from.
  // Custom colours are allowed too, so a shared link is validated by format
  // rather than by membership of these lists.
  const PALETTES = [
    ["skinColor", D.skinColors],
    ["jerseyColor", D.jerseyColors],
    ["trimColor", D.trimColors],
    ["sockColor", D.jerseyColors],
    ["helmetColor", D.helmetColors]
  ];

  const SLIDER_KEYS = Object.keys(D.sliders);

  // Sliders added after v1. They ride at the END of the share code, so codes
  // already out in the world keep decoding; everything else keeps its v1 slot.
  const TAIL_SLIDERS = ["height"];
  const CODE_SLIDERS = SLIDER_KEYS.filter(key => TAIL_SLIDERS.indexOf(key) < 0);

  // A fresh player every call - callers mutate what they get back.
  function defaults() {
    return {
      bodyShape: "ellipsoid",
      headShape: "ellipsoid",
      bodyWidth: D.sliders.bodyWidth.value,
      bodyHeight: D.sliders.bodyHeight.value,
      bodyContour: D.sliders.bodyContour.value,
      headWidth: D.sliders.headWidth.value,
      headHeight: D.sliders.headHeight.value,
      headContour: D.sliders.headContour.value,
      height: D.sliders.height.value,
      skinColor: D.skinColors[0],
      jerseyColor: D.jerseyColors[0],
      trimColor: D.trimColors[0],
      sockColor: D.jerseyColors[0],
      helmetColor: D.helmetColors[0],
      helmetStyle: "visor",
      handedness: "left",
      name: "",
      number: "",
      position: D.positions[0],
      phrase: ""
    };
  }

  // A whole random player. Lives here rather than in the builder because it is
  // pure data, and the team photo needs one without a builder mounted.
  function random() {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const out = defaults();
    out.bodyShape = pick(D.shapes).id;
    out.headShape = pick(D.shapes).id;
    SLIDER_KEYS.forEach(key => {
      const s = D.sliders[key];
      out[key] = Math.round(s.min + Math.random() * (s.max - s.min));
    });
    out.skinColor = pick(D.skinColors);
    out.jerseyColor = pick(D.jerseyColors);
    out.trimColor = pick(D.trimColors);
    out.sockColor = pick(D.jerseyColors);
    out.helmetColor = pick(D.helmetColors);
    out.handedness = pick(D.handedness).id;
    out.name = pick(D.randomNames);
    out.number = String(Math.floor(Math.random() * 98) + 1);
    out.position = pick(D.positions);
    // Headgear follows the position: a mask belongs to a goalie and nobody
    // else, and the mask being in the helmet list made random skaters wear one.
    out.helmetStyle = out.position === "Goalie"
      ? "mask"
      : pick(D.helmets.filter(h => h.id !== "mask")).id;
    out.phrase = pick(D.catchPhrases);
    return out;
  }

  // ---- share codes ------------------------------------------------------

  // The code used to carry base64 of the whole JSON blob, which ran past 400
  // characters. Now the player is a fixed-order, "~"-separated list: an enum
  // is its index, a slider its offset from the minimum, and a palette colour
  // a single digit. A typical player fits in well under a hundred characters.
  //
  // New fields go on the END of the order, so codes already out in the world
  // keep decoding.
  const SHARE_VERSION = "1";

  function encodeColor(value, list) {
    const idx = list.indexOf(value);
    return idx >= 0 ? String(idx) : String(value).replace("#", "");
  }

  function decodeColor(field, list) {
    return /^\d$/.test(field) ? list[Number(field)] : "#" + field;
  }

  function encode(params) {
    const fields = [
      D.shapes.findIndex(s => s.id === params.bodyShape),
      D.shapes.findIndex(s => s.id === params.headShape)
    ];
    CODE_SLIDERS.forEach(key => fields.push(params[key] - D.sliders[key].min));
    PALETTES.forEach(entry => fields.push(encodeColor(params[entry[0]], entry[1])));
    fields.push(
      D.helmets.findIndex(h => h.id === params.helmetStyle),
      D.handedness.findIndex(h => h.id === params.handedness),
      D.positions.indexOf(params.position),
      params.name, params.number, params.phrase
    );
    // A tail slider left at its default goes out empty, so the trim below can
    // still drop empty text fields sitting in front of it.
    TAIL_SLIDERS.forEach(key => {
      const spec = D.sliders[key];
      fields.push(params[key] === spec.value ? "" : params[key] - spec.min);
    });
    // Empty name/number/phrase at the end are just dead weight in the URL.
    while (fields.length && fields[fields.length - 1] === "") fields.pop();
    return SHARE_VERSION + "~" + fields.join("~");
  }

  // Returns a raw, still-untrusted object of the same shape the old JSON codes
  // did, so sanitize() stays the one place a shared player is validated.
  function decode(code) {
    const fields = String(code).split("~");
    if (fields.shift() !== SHARE_VERSION) return JSON.parse(fromBase64Url(code));
    let i = 0;
    const next = () => (fields[i++] || "");
    const id = (list, field) => (list[Number(field)] || {}).id;
    const raw = { bodyShape: id(D.shapes, next()), headShape: id(D.shapes, next()) };
    CODE_SLIDERS.forEach(key => { raw[key] = Number(next()) + D.sliders[key].min; });
    PALETTES.forEach(entry => { raw[entry[0]] = decodeColor(next(), entry[1]); });
    raw.helmetStyle = id(D.helmets, next());
    raw.handedness = id(D.handedness, next());
    raw.position = D.positions[Number(next())];
    raw.name = next();
    raw.number = next();
    raw.phrase = next();
    // Missing from an older code: that player was built before the slider, so
    // the default stands rather than min.
    TAIL_SLIDERS.forEach(key => {
      const field = next();
      raw[key] = field === "" ? D.sliders[key].value : Number(field) + D.sliders[key].min;
    });
    return raw;
  }

  // Codes shared before the compact format are still base64 of the JSON.
  function fromBase64Url(code) {
    const bin = atob(String(code).replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
  }

  // ---- validation -------------------------------------------------------

  // A shared code - or anything out of localStorage - is untrusted input, so
  // every field is whitelisted: ids and colours must come from the data file,
  // numbers are clamped to their slider range, free text is length-capped.
  // Anything unrecognised is simply not copied out.
  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    const option = (key, list) => {
      if (list.some(o => o.id === raw[key])) out[key] = raw[key];
    };
    option("bodyShape", D.shapes);
    option("headShape", D.shapes);
    option("helmetStyle", D.helmets);
    option("handedness", D.handedness);
    SLIDER_KEYS.forEach(key => {
      const spec = D.sliders[key], value = Number(raw[key]);
      if (Number.isFinite(value)) out[key] = Math.min(spec.max, Math.max(spec.min, Math.round(value)));
    });
    PALETTES.forEach(entry => {
      if (isHexColor(raw[entry[0]])) out[entry[0]] = raw[entry[0]];
    });
    if (D.positions.indexOf(raw.position) >= 0) out.position = raw.position;
    out.name = capText(raw.name, 14);
    out.phrase = capText(raw.phrase, 48);
    out.number = capText(raw.number, 2).replace(/[^0-9]/g, "");
    return out;
  }

  // Custom colours mean a code is no longer restricted to the palette, so the
  // format is what gets checked. Colours only ever reach the canvas as a
  // fillStyle, never the DOM, and anything else is dropped.
  function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  }

  function capText(value, max) {
    return typeof value === "string" ? value.slice(0, max) : "";
  }

  // A whole player from a code, defaults filling anything the code did not
  // carry. Throws on a code that will not parse at all - callers decide what a
  // mangled code means.
  function load(code) {
    return Object.assign(defaults(), sanitize(decode(code)));
  }

  window.CAP_CODE = {
    PALETTES: PALETTES,
    SLIDER_KEYS: SLIDER_KEYS,
    defaults: defaults,
    random: random,
    encode: encode,
    decode: decode,
    sanitize: sanitize,
    load: load
  };

})();
