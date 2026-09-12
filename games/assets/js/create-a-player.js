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
    jerseyColor: D.jerseyColors[0]
  };

  let yaw = 0.5;
  let lastInput = 0;
  let dragging = false;
  let dragX = 0;

  // ---- controls ---------------------------------------------------------

  function buildShapePickers() {
    document.querySelectorAll("[data-shapes]").forEach(box => {
      const key = box.dataset.shapes;
      D.shapes.forEach(shape => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cap-shape" + (params[key] === shape.id ? " active" : "");
        btn.textContent = shape.label;
        btn.addEventListener("click", () => selectShape(box, key, shape.id));
        box.appendChild(btn);
      });
      updateContourVisibility(box, params[key]);
    });
  }

  function selectShape(box, key, id) {
    params[key] = id;
    box.querySelectorAll(".cap-shape").forEach((b, i) => {
      b.classList.toggle("active", D.shapes[i].id === id);
    });
    updateContourVisibility(box, id);
    touch();
  }

  // Blocky has no contour of its own, so its slider is pointless there.
  function updateContourVisibility(box, id) {
    const slider = box.closest(".cap-group").querySelector("[data-param$='Contour']");
    slider.closest(".cap-slot").hidden = (id === "cube");
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

  buildShapePickers();
  buildSliders();
  touch();
  requestAnimationFrame(frame);

})();
