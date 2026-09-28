// The player builder, as a mountable widget.
//
// CAP_EDITOR.mount(root, params, opts) wires the controls inside `root` - the
// markup in partials/player-editor.html - to a params object, and runs the
// spin/render loop on its canvas. It never looks outside `root`, so the same
// builder can live on its own page and inside the team-photo slot modal.
//
// New player controls go in the partial and here, and both hosts get them.

(function () {

  const D = window.CAP_DATA, DRAW = window.CAP_DRAW, REEL = window.CAP_REEL;

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
    let peekCtx = null;          // the corner copy of the picture, phone only
    let peekWatch = null;

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

    // Naming them is the first thing you do with a new player, and the field is
    // behind a tab - so a host asking for a blank sheet gets the tab and the
    // cursor together, rather than a name box nobody can see.
    function startNaming() {
      selectTab("info");
      const name = el("name");
      if (!name) return;
      name.focus();
      name.select();
    }

    // A list in the order to SHOW it. Its own order belongs to the share code
    // (the index is what a code carries), so a list that wants to read
    // differently gives each entry a `slot` instead of being rearranged.
    function shown(list) {
      if (!list.some(opt => opt.slot != null)) return list;
      return list.slice().sort((a, b) => (a.slot || 0) - (b.slot || 0));
    }

    function buildOptionPickers() {
      root.querySelectorAll("[data-options]").forEach(box => {
        const key = box.dataset.options;
        shown(D[box.dataset.list]).forEach(opt => {
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
        if (box.dataset.auto) addAutoSwatch(box, key);
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

    // Pants and gloves follow the jersey unless somebody says otherwise, so
    // "follow the jersey" has to be a thing you can pick - and go back to.
    // Word, not a colour: it is the absence of a choice, and a swatch showing
    // the shade it currently works out to would read as one more colour.
    //
    // The word is "Jersey", which is the answer to "what colour is this then".
    // It said "Kit" first and nobody could tell what that meant.
    function addAutoSwatch(box, key) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cap-swatch cap-swatch-auto" + (params[key] ? "" : " active");
      btn.dataset.color = "";
      btn.textContent = "Jersey";
      btn.title = "Match the jersey";
      btn.setAttribute("aria-label", key + ", match the jersey");
      btn.addEventListener("click", () => selectSwatch(box, key, ""));
      box.appendChild(btn);
    }

    // The presets are a starting point, not the whole range: every row ends with
    // a colour picker so any shade is reachable.
    function addCustomSwatch(box, key) {
      const label = document.createElement("label");
      label.className = "cap-swatch cap-swatch-custom";
      label.title = "Any other colour";
      const input = document.createElement("input");
      input.type = "color";
      // An auto row starts with no colour at all, which a colour input cannot
      // hold - it would silently become black.
      input.value = params[key] || D[box.dataset.palette][0];
      input.setAttribute("aria-label", key + ", custom colour");
      // Tap to wear it, tap again to change it.
      //
      // A colour input says nothing when you choose the shade it already holds,
      // so re-wearing your own colour had to become a plain tap - and on a
      // phone the system colour sheet opening on top of that tap is a sheet you
      // then have to dismiss for nothing. So the first tap on a colour you are
      // not wearing just puts it on; the sheet is what you get when you tap the
      // colour you already have, which is when you actually want to mix.
      label.addEventListener("click", e => {
        const shown = label.dataset.color;
        if (!shown || shown === params[key]) return;
        e.preventDefault();
        selectSwatch(box, key, shown);
      });
      input.addEventListener("input", () => selectSwatch(box, key, input.value));
      label.appendChild(input);
      box.appendChild(label);
    }

    // Every path that changes a colour comes through here, so the row is put
    // back in order in one place.
    function selectSwatch(box, key, color) {
      params[key] = color;
      syncSwatchRow(box, color);
      touch();
    }

    // A colour that is not one of the presets belongs to that row's picker, so
    // the picker is the swatch that shows as active. It goes on showing that
    // colour after the player moves off it - a mixed colour is work, and the
    // next player in the same kit needs it to still be there.
    function syncSwatchRow(box, color) {
      const custom = box.querySelector(".cap-swatch-custom");
      const preset = !color || D[box.dataset.palette].indexOf(color) >= 0;
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
      // A roll of the dice is a different person, not an edit of this one, so
      // the host gets told before the change lands - and the change itself is
      // flagged, because nobody meant to keep the twelve players they flicked
      // past on the way to one they liked.
      if (options.onNew) options.onNew();
      Object.assign(params, window.CAP_CODE.random());
      syncControls();
      status("");
      touch({ rolled: true });
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
    function touch(how) {
      lastInput = performance.now();
      if (options.onChange) options.onChange(params, how || null);
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
      reel = REEL.build(params, null, forcedKind());
      const grid = document.createElement("div");
      grid.className = "cap-debug";
      const frames = 20;
      for (let i = 0; i < frames; i++) {
        const thumb = document.createElement("canvas");
        thumb.width = DRAW.LW * DRAW.S;
        thumb.height = DRAW.LH * DRAW.S;
        const anim = REEL.at(reel, (reel.end - 1) * i / (frames - 1));
        DRAW.render(thumb.getContext("2d"), params, anim ? anim.yaw : reel.yaw, anim);
        grid.appendChild(thumb);
      }
      root.appendChild(grid);
    }


    // ---- peek window ----------------------------------------------------

    // On a phone the controls are under the stage, so the player is off the top
    // of the screen as soon as you touch a slider. The peek window is the same
    // picture, small, fixed to the corner, drawn from the same loop - so a
    // change shows up somewhere you can see without scrolling back.
    //
    // PEEK_SCALE is pixels, not layout: the window is ~112px wide, so drawing it
    // at full canvas resolution would be most of a second render for nothing.
    const PEEK_SCALE = 0.45;
    const PEEK_AT = 0.5;         // how much of the stage has to be left before it takes over

    function buildPeek() {
      const peek = el("peek"), canvasPeek = el("peek-canvas");
      if (!peek || !canvasPeek || !window.IntersectionObserver) return;
      canvasPeek.width = Math.round(DRAW.LW * DRAW.S * PEEK_SCALE);
      canvasPeek.height = Math.round(DRAW.LH * DRAW.S * PEEK_SCALE);
      peekCtx = canvasPeek.getContext("2d");
      // Set once and left alone: render() saves and restores around its own
      // work, so it draws into whatever transform it is handed.
      peekCtx.setTransform(PEEK_SCALE, 0, 0, PEEK_SCALE, 0, 0);
      peek.addEventListener("click", () => {
        canvas.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      // Not "the picture is gone" - by then you have been editing blind for a
      // screenful. Half of it off the top is the point where the controls have
      // taken over the screen and there is no longer enough player to watch, so
      // that is where the window takes over. The observer clips through scroll
      // containers, so this is also right inside the team-photo modal.
      peekWatch = new IntersectionObserver(entries => {
        const seen = entries[0];
        peek.classList.toggle("show", seen.intersectionRatio < PEEK_AT);
      }, { threshold: [0, PEEK_AT, 1] });
      peekWatch.observe(canvas);
    }

    function peekShown() {
      const peek = el("peek");
      return Boolean(peekCtx && peek && peek.classList.contains("show"));
    }

    // ---- highlight reel -------------------------------------------------

    // The timeline itself lives in create-a-player.reel.js (CAP_REEL), shared
    // with the hockey card so the two can never play different highlights.
    let reel = null;               // the timeline for the shot being played

    // ?debug=reel&kind=wipeout plays one highlight instead of the player's own,
    // which is the only way to look at a reel a given code never rolls.
    function forcedKind() {
      const kind = new URLSearchParams(location.search).get("kind");
      return REEL.KINDS.indexOf(kind) === -1 ? null : kind;
    }

    function playHighlight() {
      reel = REEL.build(params, null, forcedKind());
      highlightStart = performance.now();
      status("");
    }

    function frame(now) {
      if (!alive) return;
      const anim = highlightStart ? REEL.at(reel, now - highlightStart) : null;
      if (highlightStart && !anim) highlightStart = 0;
      if (anim) {
        yaw = anim.yaw;                  // the reel can turn the camera itself
      } else if (!dragging && now - lastInput > IDLE_DELAY) {
        yaw += SPIN_SPEED / 60;
      }
      DRAW.render(ctx, params, yaw, anim);
      if (peekShown()) {
        // No ice in the window: it is a white chip with a dark edge, and the ice
        // would put the page's own blue straight back inside it. Nothing paints
        // a background now, so the frame has to be cleared by hand.
        peekCtx.clearRect(0, 0, DRAW.LW * DRAW.S, DRAW.LH * DRAW.S);
        DRAW.render(peekCtx, params, yaw, anim, { background: false });
      }
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
    buildPeek();
    touch();
    raf = requestAnimationFrame(frame);

    // A mount inside a modal is thrown away every time the modal closes, so the
    // render loop has to stop with it or each open leaves one more running.
    function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(statusTimer);
      if (peekWatch) peekWatch.disconnect();
    }

    // The quiet row under the status line: controls that do something but are
    // not what the page is for. Both mounts build one, so the row - and the
    // separator that keeps it reading as a line of links - lives here.
    function addLink(label, run) {
      const host = el("host-links");
      if (!host) return null;
      if (host.childNodes.length) {
        const sep = document.createElement("span");
        sep.className = "cap-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "\u00B7";
        host.appendChild(sep);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cap-link";
      button.textContent = label;
      button.addEventListener("click", run);
      host.appendChild(button);
      return button;
    }

    return {
      params: params,
      root: root,
      el: el,
      status: status,
      sync: syncControls,
      startNaming: startNaming,
      addLink: addLink,
      destroy: destroy
    };
  }

  window.CAP_EDITOR = { mount: mount };

})();
