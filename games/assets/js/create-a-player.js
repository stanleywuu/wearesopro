// Create-a-Player page controller: parameter state, controls, rotation, rendering loop.

(function () {

  const D = window.CAP_DATA, DRAW = window.CAP_DRAW;
  const canvas = document.getElementById("cap-canvas");
  if (!canvas || !D || !DRAW) return;

  const ctx = canvas.getContext("2d");
  canvas.width = DRAW.LW * DRAW.S;
  canvas.height = DRAW.LH * DRAW.S;

  const SPIN_SPEED = 0.35;     // radians per second when idle
  const IDLE_DELAY = 2500;     // ms of no interaction before the idle spin resumes
  const STORE_KEY = "cap-player";
  const SHARE_KEY = "p";

  const params = {
    bodyShape: "ellipsoid",
    headShape: "ellipsoid",
    bodyWidth: D.sliders.bodyWidth.value,
    bodyHeight: D.sliders.bodyHeight.value,
    bodyContour: D.sliders.bodyContour.value,
    headWidth: D.sliders.headWidth.value,
    headHeight: D.sliders.headHeight.value,
    headContour: D.sliders.headContour.value,
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

  // Which palette each colour field must come from, used when validating a
  // shared link.
  const PALETTES = [
    ["skinColor", D.skinColors],
    ["jerseyColor", D.jerseyColors],
    ["trimColor", D.trimColors],
    ["sockColor", D.jerseyColors],
    ["helmetColor", D.helmetColors]
  ];

  let yaw = 0.5;
  let statusTimer = 0;
  let saveTimer = 0;
  let highlightStart = 0;
  let lastInput = 0;
  let dragging = false;
  let dragX = 0;

  // ---- controls ---------------------------------------------------------

  function buildTabs() {
    const tabs = document.querySelectorAll(".cap-tab");
    tabs.forEach(tab => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));
    selectTab(tabs[0].dataset.tab);
  }

  function selectTab(name) {
    document.querySelectorAll(".cap-tab").forEach(tab => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".cap-panel").forEach(panel => {
      panel.hidden = panel.dataset.panel !== name;
    });
  }

  function buildOptionPickers() {
    document.querySelectorAll("[data-options]").forEach(box => {
      const key = box.dataset.options;
      D[box.dataset.list].forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cap-opt" + (params[key] === opt.id ? " active" : "");
        btn.textContent = opt.label;
        btn.dataset.id = opt.id;
        btn.addEventListener("click", () => selectOption(box, key, opt.id));
        box.appendChild(btn);
      });
      updateContourVisibility(box, params[key]);
    });
  }

  function selectOption(box, key, id) {
    params[key] = id;
    box.querySelectorAll(".cap-opt").forEach(b => b.classList.toggle("active", b.dataset.id === id));
    updateContourVisibility(box, id);
    touch();
  }

  // Blocky has no contour of its own, so its slider is pointless there.
  function updateContourVisibility(box, id) {
    const slider = box.closest(".cap-group").querySelector("[data-param$='Contour']");
    if (slider) slider.closest(".cap-slot").hidden = (id === "cube");
  }

  function buildSwatches() {
    document.querySelectorAll("[data-swatch]").forEach(box => {
      const key = box.dataset.swatch;
      D[box.dataset.palette].forEach(color => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cap-swatch" + (params[key] === color ? " active" : "");
        btn.style.background = color;
        btn.dataset.color = color;
        btn.setAttribute("aria-label", key + " " + color);
        btn.addEventListener("click", () => selectSwatch(box, key, color));
        box.appendChild(btn);
      });
    });
  }

  function selectSwatch(box, key, color) {
    params[key] = color;
    box.querySelectorAll(".cap-swatch").forEach(b => b.classList.toggle("active", b.dataset.color === color));
    touch();
  }

  function buildIdentity() {
    const position = document.getElementById("cap-position");
    D.positions.forEach(name => position.add(new Option(name, name)));
    position.value = params.position;
    position.addEventListener("change", () => { params.position = position.value; updateCaption(); });
    bindText("cap-name", "name", v => v);
    bindText("cap-number", "number", v => v.replace(/[^0-9]/g, ""));
    buildPhrase();
  }

  function buildPhrase() {
    const preset = document.getElementById("cap-phrase-preset");
    preset.add(new Option("Suggestions...", ""));
    D.catchPhrases.forEach(text => preset.add(new Option(text, text)));
    preset.addEventListener("change", () => {
      if (!preset.value) return;
      const input = document.getElementById("cap-phrase");
      input.value = preset.value;
      params.phrase = preset.value;
      updateBubble();
    });
    bindText("cap-phrase", "phrase", v => v);
  }

  // Free user text, so textContent only.
  function updateBubble() {
    const bubble = document.getElementById("cap-bubble");
    bubble.textContent = params.phrase;
    bubble.hidden = !params.phrase;
  }

  function bindText(id, key, clean) {
    const input = document.getElementById(id);
    input.value = params[key];
    input.addEventListener("input", () => {
      input.value = clean(input.value);
      params[key] = input.value;
      updateCaption();
      updateBubble();
      touch();
    });
  }

  // User-entered text, so always textContent — never innerHTML.
  function updateCaption() {
    const bits = [];
    if (params.number) bits.push("#" + params.number);
    if (params.name) bits.push(params.name);
    bits.push(params.position);
    document.getElementById("cap-caption").textContent = bits.join(" · ");
  }

  function buildSliders() {
    document.querySelectorAll("[data-param]").forEach(input => {
      const spec = D.sliders[input.dataset.param];
      if (!spec) return;
      input.min = spec.min;
      input.max = spec.max;
      input.value = params[input.dataset.param];
      input.addEventListener("input", () => {
        params[input.dataset.param] = Number(input.value);
        touch();
      });
    });
  }

  // ---- save / randomize / export ----------------------------------------

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(params, JSON.parse(raw));
    } catch (e) {
      // A blocked or corrupt store just means we start from the defaults.
    }
  }

  // No Save button: the player is written back whenever it changes, so a
  // reload keeps it without anyone having to remember to press anything.
  function saveQuietly() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(params));
    } catch (e) {
      // Storage blocked or full; the player simply will not persist.
    }
  }

  // ---- share links ------------------------------------------------------

  function toBase64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64Url(code) {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
  }

  function shareUrl() {
    return location.origin + location.pathname + "?" + SHARE_KEY + "=" + toBase64Url(JSON.stringify(params));
  }

  // The phone's own share sheet. navigator.share only exists in a secure
  // context, so over plain http — a LAN IP while testing — there is no sheet
  // and the link is written into the address bar instead.
  function share() {
    const url = shareUrl();
    if (!navigator.share) return showLink(url);
    // Only title and url: some share targets use `text` and drop the url,
    // which would lose the player.
    navigator.share({ title: "Create A Player", url: url })
      .catch(err => { if (err && err.name !== "AbortError") showLink(url); });
  }

  // Put the link in the address bar without navigating. Actually loading it
  // reloaded the whole page, which flickered for no gain — the URL is the only
  // thing that needed to change.
  function showLink(url) {
    history.replaceState(null, "", url);
    status("Link ready - copy it from the address bar");
  }

  function loadShared() {
    const code = new URLSearchParams(location.search).get(SHARE_KEY);
    if (!code) return;
    try {
      Object.assign(params, sanitizeShared(JSON.parse(fromBase64Url(code))));
    } catch (e) {
      // A mangled link just leaves the defaults in place.
    }
  }

  // A shared link is untrusted input, so every field is whitelisted: ids and
  // colours must come from the data file, numbers are clamped to their slider
  // range, and free text is length-capped.
  function sanitizeShared(raw) {
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    const option = (key, list) => {
      if (list.some(o => o.id === raw[key])) out[key] = raw[key];
    };
    option("bodyShape", D.shapes);
    option("headShape", D.shapes);
    option("helmetStyle", D.helmets);
    option("handedness", D.handedness);
    Object.keys(D.sliders).forEach(key => {
      const spec = D.sliders[key], value = Number(raw[key]);
      if (Number.isFinite(value)) out[key] = Math.min(spec.max, Math.max(spec.min, Math.round(value)));
    });
    PALETTES.forEach(entry => {
      if (entry[1].indexOf(raw[entry[0]]) >= 0) out[entry[0]] = raw[entry[0]];
    });
    if (D.positions.indexOf(raw.position) >= 0) out.position = raw.position;
    out.name = capText(raw.name, 14);
    out.phrase = capText(raw.phrase, 48);
    out.number = capText(raw.number, 2).replace(/[^0-9]/g, "");
    return out;
  }

  function capText(value, max) {
    return typeof value === "string" ? value.slice(0, max) : "";
  }

  function randomize() {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    params.bodyShape = pick(D.shapes).id;
    params.headShape = pick(D.shapes).id;
    Object.keys(D.sliders).forEach(key => {
      const s = D.sliders[key];
      params[key] = Math.round(s.min + Math.random() * (s.max - s.min));
    });
    params.skinColor = pick(D.skinColors);
    params.jerseyColor = pick(D.jerseyColors);
    params.trimColor = pick(D.trimColors);
    params.sockColor = pick(D.jerseyColors);
    params.helmetColor = pick(D.helmetColors);
    params.helmetStyle = pick(D.helmets).id;
    params.handedness = pick(D.handedness).id;
    params.name = pick(D.randomNames);
    params.number = String(Math.floor(Math.random() * 98) + 1);
    params.position = pick(D.positions);
    params.phrase = pick(D.catchPhrases);
    syncControls();
    status("");
    touch();
  }

  // Push the whole params object back onto the controls after a load or randomize.
  function syncControls() {
    document.querySelectorAll("[data-options]").forEach(box => {
      const id = params[box.dataset.options];
      box.querySelectorAll(".cap-opt").forEach(b => b.classList.toggle("active", b.dataset.id === id));
      updateContourVisibility(box, id);
    });
    document.querySelectorAll("[data-swatch]").forEach(box => {
      const color = params[box.dataset.swatch];
      box.querySelectorAll(".cap-swatch").forEach(b => b.classList.toggle("active", b.dataset.color === color));
    });
    document.querySelectorAll("[data-param]").forEach(i => { i.value = params[i.dataset.param]; });
    setValue("cap-name", params.name);
    setValue("cap-number", params.number);
    setValue("cap-phrase", params.phrase);
    setValue("cap-position", params.position);
    updateCaption();
    updateBubble();
  }

  function setValue(id, value) {
    document.getElementById(id).value = value;
  }

  // Shown as a highlighted pill so it is not missed, then cleared so it does
  // not linger as stale advice.
  function status(message) {
    const el = document.getElementById("cap-status");
    el.textContent = message;
    el.classList.toggle("show", Boolean(message));
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => status(""), 8000);
  }

  // ---- rotation ---------------------------------------------------------

  function touch() {
    lastInput = performance.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveQuietly, 700);
  }

  function startDrag(e) {
    dragging = true;
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    touch();
  }

  function moveDrag(e) {
    if (!dragging) return;
    yaw += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
    touch();
  }

  function endDrag() {
    dragging = false;
    touch();
  }

  function onKey(e) {
    if (e.key === "ArrowLeft") yaw -= 0.2;
    else if (e.key === "ArrowRight") yaw += 0.2;
    else return;
    e.preventDefault();
    touch();
  }

  // ---- debug ------------------------------------------------------------

  // ?debug renders the player at eight fixed angles so every side can be
  // checked at once. Built entirely in JS - nothing debug-related in the HTML.
  function buildDebugGrid() {
    if (!new URLSearchParams(location.search).has("debug")) return;
    const grid = document.createElement("div");
    grid.className = "cap-debug";
    for (let i = 0; i < 8; i++) {
      const thumb = document.createElement("canvas");
      thumb.width = DRAW.LW * DRAW.S;
      thumb.height = DRAW.LH * DRAW.S;
      DRAW.render(thumb.getContext("2d"), params, i * Math.PI / 4);
      grid.appendChild(thumb);
    }
    document.querySelector(".cap-wrap").appendChild(grid);
  }

  // ---- loop -------------------------------------------------------------

  // ---- highlight reel ---------------------------------------------------

  const HIGHLIGHT = { glide: 1200, wind: 1800, shot: 2000, puck: 2500, end: 3600 };
  const SIDE_ON = Math.PI / 2;   // the reel plays side on, facing the net

  function playHighlight() {
    highlightStart = performance.now();
    status("");
  }

  // The whole reel as a function of elapsed time: glide in, sink into the
  // shot, sweep through it, watch the puck go in. Returns null once finished.
  function highlightAt(ms) {
    if (ms >= HIGHLIGHT.end) return null;
    const anim = { shift: 0, crouch: 0, swing: 0, puckT: null, goal: false };
    if (ms < HIGHLIGHT.glide) {
      const t = ms / HIGHLIGHT.glide;
      anim.shift = -55 * (1 - t * t * (3 - 2 * t));
      anim.crouch = 0.35 * t;
    } else {
      anim.crouch = 0.35;
    }
    if (ms >= HIGHLIGHT.glide && ms < HIGHLIGHT.wind) {
      const t = (ms - HIGHLIGHT.glide) / (HIGHLIGHT.wind - HIGHLIGHT.glide);
      anim.crouch = 0.35 + 0.65 * t;      // sink into it
      anim.swing = -1.15 * t;
    } else if (ms >= HIGHLIGHT.wind && ms < HIGHLIGHT.shot) {
      const t = (ms - HIGHLIGHT.wind) / (HIGHLIGHT.shot - HIGHLIGHT.wind);
      anim.crouch = 1;
      anim.swing = -1.15 + 2.5 * t;
    } else if (ms >= HIGHLIGHT.shot) {
      // Rise back up out of the follow-through.
      const t = Math.min(1, (ms - HIGHLIGHT.shot) / 900);
      anim.crouch = 1 - 0.8 * t;
      anim.swing = 1.35;
    }
    if (ms >= HIGHLIGHT.shot) {
      anim.puckT = Math.min(1, (ms - HIGHLIGHT.shot) / (HIGHLIGHT.puck - HIGHLIGHT.shot));
    }
    anim.goal = ms >= HIGHLIGHT.puck;
    return anim;
  }

  function frame(now) {
    const anim = highlightStart ? highlightAt(now - highlightStart) : null;
    if (highlightStart && !anim) highlightStart = 0;
    if (anim) {
      yaw = SIDE_ON;
    } else if (!dragging && now - lastInput > IDLE_DELAY) {
      yaw += SPIN_SPEED / 60;
    }
    DRAW.render(ctx, params, yaw, anim);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerdown", startDrag);
  canvas.addEventListener("pointermove", moveDrag);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("keydown", onKey);

  document.getElementById("cap-random").addEventListener("click", randomize);
  document.getElementById("cap-highlight").addEventListener("click", playHighlight);
  document.getElementById("cap-share").addEventListener("click", share);

  loadSaved();
  loadShared();
  buildTabs();
  buildOptionPickers();
  buildSwatches();
  buildSliders();
  buildIdentity();
  syncControls();
  buildDebugGrid();
  touch();
  requestAnimationFrame(frame);

})();
