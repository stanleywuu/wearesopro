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
    helmetStyle: "cage",
    handedness: "left",
    name: "",
    number: "",
    position: D.positions[0],
    phrase: ""
  };

  let yaw = 0.5;
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

  // ---- rotation ---------------------------------------------------------

  function touch() {
    lastInput = performance.now();
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

  // ---- loop -------------------------------------------------------------

  function frame(now) {
    if (!dragging && now - lastInput > IDLE_DELAY) {
      yaw += SPIN_SPEED / 60;
    }
    DRAW.render(ctx, params, yaw);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerdown", startDrag);
  canvas.addEventListener("pointermove", moveDrag);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("keydown", onKey);

  buildTabs();
  buildOptionPickers();
  buildSwatches();
  buildSliders();
  buildIdentity();
  updateCaption();
  touch();
  requestAnimationFrame(frame);

})();
