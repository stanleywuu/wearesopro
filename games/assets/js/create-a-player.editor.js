// The player builder, as a mountable widget.
//
// CAP_EDITOR.mount(root, params, opts) wires the controls inside `root` - the
// markup in partials/player-editor.html - to a params object, and runs the
// spin/render loop on its canvas. It never looks outside `root`, so the same
// builder can live on its own page and inside the team-photo slot modal.
//
// New player controls go in the partial and here, and both hosts get them.

(function () {

  const D = window.CAP_DATA, DRAW = window.CAP_DRAW;

  const SPIN_SPEED = 0.35;     // radians per second when idle
  const IDLE_DELAY = 2500;     // ms of no interaction before the idle spin resumes

  function mount(root, params, opts) {
    if (!root || !D || !DRAW) return null;
    const options = opts || {};
    const el = name => root.querySelector('[data-el="' + name + '"]');
    const canvas = el("canvas");
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    canvas.width = DRAW.LW * DRAW.S;
    canvas.height = DRAW.LH * DRAW.S;

    let yaw = 0.5;
    let statusTimer = 0;
    let highlightStart = 0;
    let lastInput = 0;
    let raf = 0;
    let dragging = false;
    let dragX = 0;
    let alive = true;

    // ---- controls -------------------------------------------------------

    function buildTabs() {
      const tabs = root.querySelectorAll(".cap-tab");
      tabs.forEach(tab => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));
      selectTab(tabs[0].dataset.tab);
    }

    function selectTab(name) {
      root.querySelectorAll(".cap-tab").forEach(tab => {
        const on = tab.dataset.tab === name;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on);
      });
      root.querySelectorAll(".cap-panel").forEach(panel => {
        panel.hidden = panel.dataset.panel !== name;
      });
    }

    function buildOptionPickers() {
      root.querySelectorAll("[data-options]").forEach(box => {
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
      root.querySelectorAll("[data-swatch]").forEach(box => {
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
        addCustomSwatch(box, key);
      });
    }

    // The presets are a starting point, not the whole range: every row ends with
    // a colour picker so any shade is reachable.
    function addCustomSwatch(box, key) {
      const label = document.createElement("label");
      label.className = "cap-swatch cap-swatch-custom";
      label.title = "Any other colour";
      const input = document.createElement("input");
      input.type = "color";
      input.value = params[key];
      input.setAttribute("aria-label", key + ", custom colour");
      input.addEventListener("input", () => {
        label.dataset.color = input.value;
        label.style.background = input.value;
        selectSwatch(box, key, input.value);
      });
      label.appendChild(input);
      box.appendChild(label);
    }

    function selectSwatch(box, key, color) {
      params[key] = color;
      box.querySelectorAll(".cap-swatch").forEach(b => b.classList.toggle("active", b.dataset.color === color));
      touch();
    }

    // A colour that is not one of the presets belongs to that row's picker, so
    // the picker is the swatch that shows as active.
    function syncSwatchRow(box, color) {
      const custom = box.querySelector(".cap-swatch-custom");
      const preset = D[box.dataset.palette].indexOf(color) >= 0;
      if (custom && !preset) {
        custom.dataset.color = color;
        custom.style.background = color;
        custom.querySelector("input").value = color;
      }
      box.querySelectorAll(".cap-swatch").forEach(b => b.classList.toggle("active", b.dataset.color === color));
    }

    function buildIdentity() {
      const position = el("position");
      D.positions.forEach(name => position.add(new Option(name, name)));
      position.value = params.position;
      position.addEventListener("change", () => {
        params.position = position.value;
        maskWithPosition();
        updateCaption();
        touch();
      });
      bindText("name", "name", v => v);
      bindText("number", "number", v => v.replace(/[^0-9]/g, ""));
      buildPhrase();
    }

    // A goalie without a mask looks like a mistake, and a skater in one looks
    // like a different mistake - so the headgear follows the position unless
    // they have gone and picked something else themselves.
    function maskWithPosition() {
      const goalie = params.position === "Goalie";
      if (goalie && params.helmetStyle !== "mask") params.helmetStyle = "mask";
      else if (!goalie && params.helmetStyle === "mask") params.helmetStyle = "visor";
      else return;
      syncControls();
    }

    function buildPhrase() {
      const preset = el("phrase-preset");
      preset.add(new Option("Suggestions...", ""));
      D.catchPhrases.forEach(text => preset.add(new Option(text, text)));
      preset.addEventListener("change", () => {
        if (!preset.value) return;
        const input = el("phrase");
        input.value = preset.value;
        params.phrase = preset.value;
        updateBubble();
        touch();
      });
      bindText("phrase", "phrase", v => v);
    }

    // Free user text, so textContent only.
    function updateBubble() {
      const bubble = el("bubble");
      bubble.textContent = params.phrase;
      bubble.hidden = !params.phrase;
    }

    function bindText(name, key, clean) {
      const input = el(name);
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
      el("caption").textContent = bits.join(" · ");
    }

    function buildSliders() {
      root.querySelectorAll("[data-param]").forEach(input => {
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

    function randomize() {
      Object.assign(params, window.CAP_CODE.random());
      syncControls();
      status("");
      touch();
    }

    // Push the whole params object back onto the controls after a load or randomize.
    function syncControls() {
      root.querySelectorAll("[data-options]").forEach(box => {
        const id = params[box.dataset.options];
        box.querySelectorAll(".cap-opt").forEach(b => b.classList.toggle("active", b.dataset.id === id));
        updateContourVisibility(box, id);
      });
      root.querySelectorAll("[data-swatch]").forEach(box => {
        syncSwatchRow(box, params[box.dataset.swatch]);
      });
      root.querySelectorAll("[data-param]").forEach(i => { i.value = params[i.dataset.param]; });
      el("name").value = params.name;
      el("number").value = params.number;
      el("phrase").value = params.phrase;
      el("position").value = params.position;
      updateCaption();
      updateBubble();
    }

    // Shown as a highlighted pill so it is not missed, then cleared so it does
    // not linger as stale advice.
    function status(message) {
      const box = el("status");
      box.textContent = message;
      box.classList.toggle("show", Boolean(message));
      clearTimeout(statusTimer);
      if (message) statusTimer = setTimeout(() => status(""), 8000);
    }

    // ---- rotation -------------------------------------------------------

    // Every change runs through here: it holds off the idle spin and tells the
    // host the player moved, which is how the builder page autosaves.
    function touch() {
      lastInput = performance.now();
      if (options.onChange) options.onChange(params);
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

    // ---- debug ----------------------------------------------------------

    // ?debug renders the player at eight fixed angles so every side can be
    // checked at once. Built entirely in JS - nothing debug-related in the HTML.
    function buildDebugGrid() {
      const query = new URLSearchParams(location.search);
      if (!query.has("debug")) return;
      if (query.get("debug") === "reel") return buildReelStrip();
      const grid = document.createElement("div");
      grid.className = "cap-debug";
      for (let i = 0; i < 8; i++) {
        const thumb = document.createElement("canvas");
        thumb.width = DRAW.LW * DRAW.S;
        thumb.height = DRAW.LH * DRAW.S;
        DRAW.render(thumb.getContext("2d"), params, i * Math.PI / 4);
        grid.appendChild(thumb);
      }
      root.appendChild(grid);
    }

    // ?debug=reel lays the highlight out as a filmstrip. Trying to judge the
    // timing of a four-second animation by eye, one run at a time, is hopeless.
    function buildReelStrip() {
      reel = buildReel();
      const grid = document.createElement("div");
      grid.className = "cap-debug";
      const frames = 16;
      for (let i = 0; i < frames; i++) {
        const thumb = document.createElement("canvas");
        thumb.width = DRAW.LW * DRAW.S;
        thumb.height = DRAW.LH * DRAW.S;
        DRAW.render(thumb.getContext("2d"), params, SIDE_ON,
          highlightAt((reel.end - 1) * i / (frames - 1)));
        grid.appendChild(thumb);
      }
      root.appendChild(grid);
    }

    // ---- highlight reel -------------------------------------------------

    const SIDE_ON = Math.PI / 2;   // the reel plays side on, facing the net

    // The wrist shot every other position plays, unchanged.
    const CLASSIC = { glide: 1200, wind: 1800, contact: 2000, land: 2500, end: 3600 };

    let reel = null;               // the timeline for the shot being played

    function playHighlight() {
      reel = buildReel();
      highlightStart = performance.now();
      status("");
    }

    // A defenceman winds up and slaps it. The speed is rolled FIRST, because it
    // is what decides everything after contact: a harder shot is in the air for
    // less time, and the number on the end is the same number.
    function buildReel() {
      if (params.position !== "Defence") return Object.assign({ slap: false, home: 0 }, CLASSIC);
      // Beer league. Nobody here is breaking 80.
      const speed = 55 + Math.round(Math.random() * 25);
      const contact = 2300;
      // It is a long way from the point: 55mph spends over two seconds in the
      // air, 80mph about a second and a half.
      const flight = Math.round(120000 / speed);
      return {
        slap: true,
        label: speed + " mph!!",
        home: -42,                 // out by the left boards, where a point shot comes from
        glide: 1200,
        wind: 1800,
        hold: 2010,                // a beat at the top, or the windup flashes by
        contact: contact,
        panFrom: contact + 320,    // long enough to see the follow-through first
        panTo: contact + Math.round(flight * 0.5),
        netIn: contact + Math.round(flight * 0.7),
        netSet: contact + Math.round(flight * 0.9),
        land: contact + flight,
        end: contact + flight + 1300
      };
    }

    // The whole reel as a function of elapsed time. Returns null once finished.
    function highlightAt(ms) {
      if (!reel || ms >= reel.end) return null;
      const anim = {
        shift: 0, crouch: 0, swing: 0, lift: 0,
        puckT: null, goal: false, pan: 0,
        arc: 9, net: 1, label: reel.label,
        puckHold: Boolean(reel.slap), netClose: Boolean(reel.slap)
      };
      if (ms < reel.glide) {
        const t = ms / reel.glide;
        anim.shift = reel.home - 55 * (1 - t * t * (3 - 2 * t));
        anim.crouch = 0.35 * t;
      } else {
        anim.shift = reel.home;
        anim.crouch = 0.35;
      }
      if (reel.slap) slapAt(ms, anim);
      else wristAt(ms, anim);
      if (ms >= reel.contact) {
        anim.puckT = Math.min(1, (ms - reel.contact) / (reel.land - reel.contact));
      }
      if (reel.slap) {
        anim.pan = ramp(ms, reel.panFrom, reel.panTo);
        anim.net = ramp(ms, reel.netIn, reel.netSet);
      }
      anim.goal = ms >= reel.land;
      return anim;
    }

    // The camera starts travelling once the follow-through has played, and the
    // net arrives after it - so there is a stretch with the shooter gone, the
    // net not yet there, and nothing on the ice but the puck. That gap is the
    // distance.
    function ramp(ms, from, to) {
      if (ms <= from) return 0;
      if (ms >= to) return 1;
      const t = (ms - from) / (to - from);
      return t * t * (3 - 2 * t);
    }

    // Up and back over the shoulder, then down through the puck and high out
    // the other side. The windup is slow and the swing is not: lift falls as
    // 1 - t*t so the blade is quickest where it meets the puck.
    function slapAt(ms, anim) {
      if (ms >= reel.glide && ms < reel.wind) {
        const t = (ms - reel.glide) / (reel.wind - reel.glide);
        anim.crouch = 0.35 + 0.5 * t;
        anim.lift = 2.6 * t;
      } else if (ms >= reel.wind && ms < reel.hold) {
        anim.crouch = 0.85;
        anim.lift = 2.6;                    // held at the top
      } else if (ms >= reel.hold && ms < reel.contact) {
        const t = (ms - reel.hold) / (reel.contact - reel.hold);
        anim.crouch = 0.85 + 0.15 * t;
        anim.lift = 2.6 * (1 - t * t);
      } else if (ms >= reel.contact) {
        const t = Math.min(1, (ms - reel.contact) / 420);
        anim.crouch = 1 - 0.5 * t;
        anim.lift = -1.8 * t;          // a slapshot finishes high
        anim.swing = 0.5 * t;
      }
    }

    // Glide in, sink into the shot, sweep through it.
    function wristAt(ms, anim) {
      if (ms >= reel.glide && ms < reel.wind) {
        const t = (ms - reel.glide) / (reel.wind - reel.glide);
        anim.crouch = 0.35 + 0.65 * t;      // sink into it
        anim.swing = -1.15 * t;
      } else if (ms >= reel.wind && ms < reel.contact) {
        const t = (ms - reel.wind) / (reel.contact - reel.wind);
        anim.crouch = 1;
        anim.swing = -1.15 + 2.5 * t;
      } else if (ms >= reel.contact) {
        // Rise back up out of the follow-through.
        const t = Math.min(1, (ms - reel.contact) / 900);
        anim.crouch = 1 - 0.8 * t;
        anim.swing = 1.35;
      }
    }

    function frame(now) {
      if (!alive) return;
      const anim = highlightStart ? highlightAt(now - highlightStart) : null;
      if (highlightStart && !anim) highlightStart = 0;
      if (anim) {
        yaw = SIDE_ON;
      } else if (!dragging && now - lastInput > IDLE_DELAY) {
        yaw += SPIN_SPEED / 60;
      }
      DRAW.render(ctx, params, yaw, anim);
      raf = requestAnimationFrame(frame);
    }

    // ---- wiring ---------------------------------------------------------

    canvas.addEventListener("pointerdown", startDrag);
    canvas.addEventListener("pointermove", moveDrag);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("keydown", onKey);
    el("random").addEventListener("click", randomize);
    el("highlight").addEventListener("click", playHighlight);

    buildTabs();
    buildOptionPickers();
    buildSwatches();
    buildSliders();
    buildIdentity();
    syncControls();
    buildDebugGrid();
    touch();
    raf = requestAnimationFrame(frame);

    // A mount inside a modal is thrown away every time the modal closes, so the
    // render loop has to stop with it or each open leaves one more running.
    function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(statusTimer);
    }

    return {
      params: params,
      root: root,
      el: el,
      status: status,
      sync: syncControls,
      destroy: destroy
    };
  }

  window.CAP_EDITOR = { mount: mount };

})();
