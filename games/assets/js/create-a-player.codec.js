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

  // Colours added after v1. PALETTES fixes the v1 colour slots in the share
  // code, so a new colour cannot join it - it rides at the tail instead.
  const TAIL_PALETTES = [
    ["hairColor", D.hairColors]
  ];

  const ALL_PALETTES = PALETTES.concat(TAIL_PALETTES);

  // Enums added after v1, in the order they ride at the tail of the code. An
  // id of "none" is the default, which is what lets them encode empty and be
  // trimmed off a code that does not use them.
  const TAIL_OPTIONS = [
    ["hairStyle", D.hairStyles],
    ["faceHair", D.faceHairs]
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
      hairStyle: "short",
      faceHair: "none",
      hairColor: D.hairColors[0],
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
    // Most beer leaguers are not clean shaven and not bearded either, so a
    // random face lands on "none" more often than any single style.
    out.hairStyle = pick(D.hairStyles).id;
    out.faceHair = Math.random() < 0.45 ? "none" : pick(D.faceHairs).id;
    out.hairColor = pick(D.hairColors);
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
    // Same trick for the tail enums and colours: a player who changed nothing
    // here adds nothing to the code.
    TAIL_OPTIONS.forEach(entry => {
      const idx = entry[1].findIndex(o => o.id === params[entry[0]]);
      fields.push(idx <= 0 ? "" : idx);
    });
    TAIL_PALETTES.forEach(entry => {
      fields.push(params[entry[0]] === entry[1][0] ? "" : encodeColor(params[entry[0]], entry[1]));
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
    // Index 0 is "none" in both lists, so a code written before hair existed
    // comes back bald and clean shaven - which is exactly how that player
    // looked when the link was shared. A NEW player starts on "short" instead;
    // that is defaults()'s job, not this one's.
    TAIL_OPTIONS.forEach(entry => { raw[entry[0]] = id(entry[1], next()); });
    TAIL_PALETTES.forEach(entry => {
      const field = next();
      raw[entry[0]] = field === "" ? entry[1][0] : decodeColor(field, entry[1]);
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
    TAIL_OPTIONS.forEach(entry => option(entry[0], entry[1]));
    SLIDER_KEYS.forEach(key => {
      const spec = D.sliders[key], value = Number(raw[key]);
      if (Number.isFinite(value)) out[key] = Math.min(spec.max, Math.max(spec.min, Math.round(value)));
    });
    ALL_PALETTES.forEach(entry => {
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

  // A player who does not say otherwise has no hair.
  //
  // He did not choose "none" - the field did not exist to choose - but every
  // way in has to land on the same answer or the same player looks different
  // depending on how he got here, and "none" is the one that keeps him looking
  // the way he looked. It covers a v1 compact code, a pre-compact base64 one,
  // a raw object out of the builder's autosave, and a code with rubbish in the
  // tail. defaults() still starts a NEW player on "short".
  const PRE_V2 = { hairStyle: "none", faceHair: "none" };

  function merge(raw) {
    return Object.assign(defaults(), PRE_V2, sanitize(raw));
  }

  // A whole player from a code. Throws on a code that will not parse at all -
  // callers decide what a mangled code means.
  function load(code) {
    return merge(decode(code));
  }

  // The same, for a player stored as a raw object rather than a code: the
  // builder's own autosave is the one path that does that.
  function fromStored(raw) {
    return merge(raw);
  }

  window.CAP_CODE = {
    PALETTES: ALL_PALETTES,
    SLIDER_KEYS: SLIDER_KEYS,
    defaults: defaults,
    random: random,
    encode: encode,
    decode: decode,
    sanitize: sanitize,
    load: load,
    fromStored: fromStored
  };

})();
