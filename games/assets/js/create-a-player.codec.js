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
    ["hairColor", D.hairColors],
    ["cardEdge", D.cardEdgeColors],
    ["cardBack", D.cardBackColors],
    ["stickColor", D.stickColors]
  ];

  // Pants and gloves, whose default is not a colour at all: it is "follow the
  // jersey", and the renderer works out the shade. Empty means that, which is
  // also what a code written before these existed has in these slots - so an
  // old player draws exactly as he always did. Kept apart from TAIL_PALETTES
  // because those default to the head of their list instead.
  const AUTO_PALETTES = [
    ["pantsColor", D.pantsColors],
    ["gloveColor", D.gloveColors]
  ];

  const AUTO_KEYS = AUTO_PALETTES.map(entry => entry[0]);

  const ALL_PALETTES = PALETTES.concat(TAIL_PALETTES, AUTO_PALETTES);

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

  // Sliders added after the tail already had things behind it. TAIL_SLIDERS is
  // encoded IN FRONT of the hair, the card colours and the kit, so a new slider
  // cannot join that group without shifting all of those along and breaking
  // every code already shared. It rides at the very end instead.
  const LATE_SLIDERS = ["eyeSize", "eyeContour", "mouthLength", "mouthContour"];

  const TAILED = TAIL_SLIDERS.concat(LATE_SLIDERS);
  const CODE_SLIDERS = SLIDER_KEYS.filter(key => TAILED.indexOf(key) < 0);

  // What the share code counts a slider FROM. Normally the minimum, but a
  // minimum can be RAISED later - and the code carries an offset, so moving the
  // base would make every value already written to a code jump by the
  // difference. A slider that has moved its floor keeps its original base in
  // codeMin, and sanitize() is what brings an old value up to the new floor.
  function sliderBase(key) {
    const spec = D.sliders[key];
    return spec.codeMin === undefined ? spec.min : spec.codeMin;
  }

  // A tail slider left alone goes out empty, so a code that changed nothing
  // here is no longer than it was before the slider existed. Shared by both
  // tail groups.
  function encodeSlider(params, key) {
    const spec = D.sliders[key];
    return params[key] === spec.value ? "" : params[key] - sliderBase(key);
  }

  // Missing from an older code: that player was built before the slider, so
  // the default stands rather than the floor.
  function decodeSlider(field, key) {
    return field === "" ? D.sliders[key].value : Number(field) + sliderBase(key);
  }

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
      eyeSize: D.sliders.eyeSize.value,
      eyeContour: D.sliders.eyeContour.value,
      mouthLength: D.sliders.mouthLength.value,
      mouthContour: D.sliders.mouthContour.value,
      skinColor: D.skinColors[0],
      jerseyColor: D.jerseyColors[0],
      trimColor: D.trimColors[0],
      sockColor: D.jerseyColors[0],
      helmetColor: D.helmetColors[0],
      pantsColor: "",
      gloveColor: "",
      stickColor: D.stickColors[0],
      helmetStyle: "visor",
      hairStyle: "short",
      faceHair: "none",
      hairColor: D.hairColors[0],
      cardEdge: D.cardEdgeColors[0],
      cardBack: D.cardBackColors[0],
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
    // Pants and gloves stay on the jersey - that is what a team looks like.
    // The stick is the one bit of kit everybody buys for themselves.
    out.stickColor = pick(D.stickColors);
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
  const SHARE_VERSION = "2";      // what we WRITE
  const V1 = "1";                 // what we still read, unchanged, forever

  function encodeColor(value, list) {
    const idx = list.indexOf(value);
    return idx >= 0 ? String(idx) : String(value).replace("#", "");
  }

  function decodeColor(field, list) {
    return /^\d$/.test(field) ? list[Number(field)] : "#" + field;
  }

  // v2 is what we write. encodeV1 is kept because it is the only proof that the
  // old reader still reads what the old writer wrote - the test harness rounds
  // v1 codes through it.
  function encode(params) {
    return encodeV2(params);
  }

  function encodeV1(params) {
    const fields = [
      D.shapes.findIndex(s => s.id === params.bodyShape),
      D.shapes.findIndex(s => s.id === params.headShape)
    ];
    CODE_SLIDERS.forEach(key => fields.push(params[key] - sliderBase(key)));
    PALETTES.forEach(entry => fields.push(encodeColor(params[entry[0]], entry[1])));
    fields.push(
      D.helmets.findIndex(h => h.id === params.helmetStyle),
      D.handedness.findIndex(h => h.id === params.handedness),
      D.positions.indexOf(params.position),
      params.name, params.number, params.phrase
    );
    TAIL_SLIDERS.forEach(key => fields.push(encodeSlider(params, key)));
    // Same trick for the tail enums and colours: a player who changed nothing
    // here adds nothing to the code.
    TAIL_OPTIONS.forEach(entry => {
      const idx = entry[1].findIndex(o => o.id === params[entry[0]]);
      fields.push(idx <= 0 ? "" : idx);
    });
    TAIL_PALETTES.forEach(entry => {
      fields.push(params[entry[0]] === entry[1][0] ? "" : encodeColor(params[entry[0]], entry[1]));
    });
    // Empty already means "follow the jersey" here, so there is nothing to
    // compare against - the value goes out as it is.
    AUTO_PALETTES.forEach(entry => {
      fields.push(params[entry[0]] ? encodeColor(params[entry[0]], entry[1]) : "");
    });
    LATE_SLIDERS.forEach(key => fields.push(encodeSlider(params, key)));
    // Empty name/number/phrase at the end are just dead weight in the URL.
    while (fields.length && fields[fields.length - 1] === "") fields.pop();
    return V1 + "~" + fields.join("~");
  }

  // Returns a raw, still-untrusted object of the same shape the old JSON codes
  // did, so sanitize() stays the one place a shared player is validated.
  function decode(code) {
    const fields = String(code).split("~");
    const version = fields.shift();
    if (version === SHARE_VERSION) return decodeV2(fields);
    if (version !== V1) return JSON.parse(fromBase64Url(code));
    let i = 0;
    const next = () => (fields[i++] || "");
    const id = (list, field) => (list[Number(field)] || {}).id;
    const raw = { bodyShape: id(D.shapes, next()), headShape: id(D.shapes, next()) };
    CODE_SLIDERS.forEach(key => { raw[key] = Number(next()) + sliderBase(key); });
    PALETTES.forEach(entry => { raw[entry[0]] = decodeColor(next(), entry[1]); });
    raw.helmetStyle = id(D.helmets, next());
    raw.handedness = id(D.handedness, next());
    raw.position = D.positions[Number(next())];
    raw.name = next();
    raw.number = next();
    raw.phrase = next();
    TAIL_SLIDERS.forEach(key => { raw[key] = decodeSlider(next(), key); });
    // Index 0 is "none" in both lists, so a code written before hair existed
    // comes back bald and clean shaven - which is exactly how that player
    // looked when the link was shared. A NEW player starts on "short" instead;
    // that is defaults()'s job, not this one's.
    TAIL_OPTIONS.forEach(entry => { raw[entry[0]] = id(entry[1], next()); });
    TAIL_PALETTES.forEach(entry => {
      const field = next();
      raw[entry[0]] = field === "" ? entry[1][0] : decodeColor(field, entry[1]);
    });
    AUTO_PALETTES.forEach(entry => {
      const field = next();
      raw[entry[0]] = field === "" ? "" : decodeColor(field, entry[1]);
    });
    LATE_SLIDERS.forEach(key => { raw[key] = decodeSlider(next(), key); });
    return raw;
  }

  // Codes shared before the compact format are still base64 of the JSON.
  function fromBase64Url(code) {
    const bin = atob(String(code).replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
  }

  // ---- v2: the numbers, packed -----------------------------------------

  // v1 spells every number out in decimal with a "~" after it. The numbers are
  // the bulk of a code and they are tiny values, so v2 writes each one as a
  // fixed number of base64 DIGITS with no separators at all, and leaves only
  // the free text as "~" fields, because text does not pack.
  //
  // Digits, not a bit field. A bit field is about ten characters shorter on a
  // fully customised player and completely opaque: every field would sit at a
  // bit offset, half of them straddling a byte. This way each field is at a
  // character offset you can count to, which is worth ten characters.
  //
  // THE INVARIANT: zero means the default. Sliders ride as a zigzag offset from
  // their default, enums and colours as a selector whose 0 means "whatever
  // defaults() says". Two things fall out of that for free - trailing "0"s can
  // be dropped, so a default player encodes to nothing at all; and a field
  // added later is simply absent from an older code, reads as 0, and comes back
  // as its default. Same append-only promise as v1, without the tail of empty
  // separators.
  //
  // WIDTHS ARE FROZEN. A width is deliberately not derived from the slider's
  // range: widening a range would otherwise re-interpret every code already
  // shared. Two digits per slider (4096 values for a zigzag that needs 161) and
  // one per enum is headroom, not a tight fit.
  const W_ENUM = 1, W_SLIDER = 2, W_COLOR = 1, W_HEX = 4;   // in base64 digits

  // Colour selectors above the palette indices.
  const C_AUTO = 62;      // "" - follow the jersey
  const C_CUSTOM = 63;    // four digits of RGB follow

  // Frozen orders. Anything new is appended, which is what keeps an old code
  // readable - see the invariant above.
  const V2_ENUMS = ["bodyShape", "headShape", "helmetStyle", "handedness",
                    "position", "hairStyle", "faceHair"];
  const V2_SLIDERS = ["bodyWidth", "bodyHeight", "bodyContour", "headWidth",
                      "headHeight", "headContour", "height", "eyeSize",
                      "eyeContour", "mouthLength", "mouthContour"];
  const V2_COLORS = ["skinColor", "jerseyColor", "trimColor", "sockColor",
                     "helmetColor", "hairColor", "cardEdge", "cardBack",
                     "stickColor", "pantsColor", "gloveColor"];

  // A slider or colour added to the data file but not to the lists above still
  // encodes - at the end, which is exactly where a new field belongs.
  const SLIDER_ORDER = V2_SLIDERS.concat(
    SLIDER_KEYS.filter(key => V2_SLIDERS.indexOf(key) < 0));
  const COLOR_ORDER = V2_COLORS.concat(
    ALL_PALETTES.map(e => e[0]).filter(key => V2_COLORS.indexOf(key) < 0));

  const PALETTE_OF = {};
  ALL_PALETTES.forEach(entry => { PALETTE_OF[entry[0]] = entry[1]; });

  // The ids of an enum field, in the order a code refers to them by.
  function idsOf(key) {
    if (key === "position") return D.positions;
    const lists = { bodyShape: D.shapes, headShape: D.shapes, helmetStyle: D.helmets,
                    handedness: D.handedness, hairStyle: D.hairStyles, faceHair: D.faceHairs };
    return lists[key].map(o => o.id);
  }

  // ---- digits -----------------------------------------------------------

  // URL-safe, and ordered so digit 0 is "0" - which is what lets a run of
  // defaults at the end be trimmed off as a run of zeros.
  const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

  function writer() {
    let out = "";
    return {
      put: function (value, width) {
        let text = "";
        for (let i = 0; i < width; i++) {
          text = DIGITS.charAt(value % 64) + text;
          value = Math.floor(value / 64);
        }
        out += text;
      },
      text: function () { return out; }
    };
  }

  // Reading past the end gives zeros, which is the whole append story: a field
  // this code was written before comes back as its default. It works because a
  // missing character and a "0" are the same thing - both contribute nothing -
  // and the characters that go missing are always the low-order ones.
  function reader(text) {
    let at = 0;
    return function (width) {
      let value = 0;
      for (let i = 0; i < width; i++) {
        const idx = DIGITS.indexOf(text.charAt(at++) || "0");
        value = value * 64 + (idx < 0 ? 0 : idx);
      }
      return value;
    };
  }

  // Signed offset to a non-negative one, so a default (0) stays 0 and a small
  // move either way stays small.
  function zigzag(n) {
    return n >= 0 ? n * 2 : -n * 2 - 1;
  }

  function unzigzag(n) {
    return n % 2 ? -(n + 1) / 2 : n / 2;
  }

  // A "~" typed into a name split the code where it was never meant to split,
  // and everything after it shifted along: "P~7" came back as the name "P" with
  // "7" for the number. v1 has always done this and cannot be fixed - its codes
  // are already out there - but v2 escapes the two characters that matter. "%"
  // goes first or unescaping would undo its own work.
  //
  // %7E and %25 survive a trip through a URL: encodeURIComponent turns them
  // into %257E and %2525 on the way out and URLSearchParams gives them straight
  // back, and a code pasted bare never gets decoded by anything else at all.
  function escapeText(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/%/g, "%25").replace(/~/g, "%7E");
  }

  function unescapeText(value) {
    return String(value || "").replace(/%(25|7E)/g, (m, c) => (c === "25" ? "%" : "~"));
  }

  // ---- v2 encode / decode -----------------------------------------------

  function encodeV2(params) {
    const base = defaults();
    const w = writer();
    SLIDER_ORDER.forEach(key => w.put(zigzag(params[key] - base[key]), W_SLIDER));
    V2_ENUMS.forEach(key => {
      const idx = idsOf(key).indexOf(params[key]);
      w.put(params[key] === base[key] || idx < 0 ? 0 : idx + 1, W_ENUM);
    });
    COLOR_ORDER.forEach(key => putColor(w, key, params[key], base[key]));
    const fields = [w.text().replace(/0+$/, ""), escapeText(params.name),
                    escapeText(params.number), escapeText(params.phrase)];
    while (fields.length && fields[fields.length - 1] === "") fields.pop();
    return SHARE_VERSION + "~" + fields.join("~");
  }

  function putColor(w, key, value, fallback) {
    if (value === fallback) return w.put(0, W_COLOR);
    if (value === "") return w.put(C_AUTO, W_COLOR);
    const idx = (PALETTE_OF[key] || []).indexOf(value);
    if (idx >= 0 && idx + 1 < C_AUTO) return w.put(idx + 1, W_COLOR);
    w.put(C_CUSTOM, W_COLOR);
    w.put(parseInt(String(value).slice(1), 16) || 0, W_HEX);
  }

  // Returns a raw, still-untrusted object, same as the v1 reader, so sanitize()
  // stays the one place a shared player is validated.
  function decodeV2(fields) {
    const raw = defaults();
    const read = reader(String(fields[0] || ""));
    SLIDER_ORDER.forEach(key => { raw[key] = raw[key] + unzigzag(read(W_SLIDER)); });
    V2_ENUMS.forEach(key => {
      const sel = read(W_ENUM);
      if (sel) raw[key] = idsOf(key)[sel - 1];
    });
    COLOR_ORDER.forEach(key => { raw[key] = takeColor(read, key, raw[key]); });
    raw.name = unescapeText(fields[1]);
    raw.number = unescapeText(fields[2]);
    raw.phrase = unescapeText(fields[3]);
    return raw;
  }

  function takeColor(read, key, fallback) {
    const sel = read(W_COLOR);
    if (sel === 0) return fallback;
    if (sel === C_AUTO) return "";
    if (sel === C_CUSTOM) return "#" + ("000000" + read(W_HEX).toString(16)).slice(-6);
    return (PALETTE_OF[key] || [])[sel - 1];
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
      const value = raw[entry[0]];
      if (isHexColor(value)) out[entry[0]] = value;
      // An auto field is allowed to be empty, and only an auto field is.
      else if (value === "" && AUTO_KEYS.indexOf(entry[0]) >= 0) out[entry[0]] = "";
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

  // Same reasoning for the kit colours added later: a player who never chose
  // pants or gloves wears the jersey's shade, which is the only answer that
  // leaves him looking the way he looked. defaults() says the same thing, so
  // this is only here to survive a raw object with the fields missing.
  const PRE_KIT = { pantsColor: "", gloveColor: "", stickColor: D.stickColors[0] };

  function merge(raw) {
    return Object.assign(defaults(), PRE_V2, PRE_KIT, sanitize(raw));
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
    encodeV1: encodeV1,
    decode: decode,
    sanitize: sanitize,
    load: load,
    fromStored: fromStored
  };

})();
