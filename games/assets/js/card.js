// Hockey card: one player, and where the photo would be, their highlight.
//
// The reel is CAP_REEL, the same one the builder plays - one highlight, not a
// copy of it. The card just loops it and holds on the last frame in between.

(function () {

  const DRAW = window.CAP_DRAW, CODE = window.CAP_CODE, REEL = window.CAP_REEL;
  const SHARE = window.CAP_SHARE, STATS = window.CAP_STATS;
  const PRINT = window.CAP_PRINT;
  const SHARE_KEY = "p";
  const REPLAY_GAP = 900;      // a beat on the last frame before it loops

  let params = null;
  let reel = null;
  let canvas, ctx;
  let start = 0;

  function init() {
    canvas = document.getElementById("card-canvas");
    if (!canvas || !DRAW || !CODE || !REEL) return;
    params = readPlayer();
    if (!params) return showEmpty();

    canvas.width = DRAW.LW * DRAW.S;
    canvas.height = DRAW.LH * DRAW.S;
    ctx = canvas.getContext("2d");

    fillPlate();
    buildBack();
    buildPoses();
    buildFill();
    // Both optional. The reel loops on its own, so a replay button is a nicety
    // and the card must not die without one - it threw on a missing element and
    // took the whole card down with it.
    wire("card-replay", function (el) { el.addEventListener("click", play); });
    // data-new on the link (the team profiles) means "start from this player":
    // their build, no name, cursor in the Name field.
    // Optional like the rest: the team profiles mount the same card without it.
    wire("card-share", function (el) {
      el.addEventListener("click", function () {
        SHARE.link({
          url: location.href,
          title: (params.name || "A beer leaguer") + "'s hockey card",
          host: el.parentNode,
          say: note
        });
      });
    });
    // Only where the page offers it: the team profiles do not.
    wire("card-print", function (el) {
      if (!PRINT) return el.remove();
      el.addEventListener("click", openPrint);
    });
    wire("card-print-go", function (el) {
      el.addEventListener("click", function () {
        PRINT.download(params, filled, printing);
        note("Saved. Print it, cut along the lines, fill in the back.");
      });
    });
    wire("card-print-close", function (el) {
      el.addEventListener("click", closePrint);
    });
    wire("card-edit", function (el) {
      el.href = "/games/create-a-player.html?" + SHARE_KEY + "=" + shareCode() +
        (el.dataset.new ? "&new=1" : "");
    });
    play();
    requestAnimationFrame(frame);
  }

  // Short messages under the card: copied, or copy this yourself.
  function note(msg) {
    const el = document.getElementById("card-note");
    if (el) el.textContent = msg;
  }

  function wire(id, apply) {
    const el = document.getElementById(id);
    if (el) apply(el);
  }

  // A ?p= code wins; otherwise the page may carry its own on #card, which is
  // how a team profile shows its character. Either way it goes through the
  // codec's whitelist before anything draws it.
  function readPlayer() {
    const code = new URLSearchParams(location.search).get(SHARE_KEY) ||
      document.getElementById("card").dataset.player;
    if (!code) return null;
    try {
      return CODE.load(code);
    } catch (e) {
      return null;
    }
  }

  function shareCode() {
    return encodeURIComponent(CODE.encode(params)).replace(/%20/g, "+").replace(/%2C/g, ",");
  }

  // All of it user text, so textContent throughout.
  function fillPlate() {
    set("card-name", params.name || "Unnamed");
    set("card-number", params.number ? "#" + params.number : "");
    set("card-pos", params.position);
    set("card-quote", params.phrase ? "“" + params.phrase + "”" : "");
  }

  function set(id, text) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.hidden = !text;
  }

  function showEmpty() {
    document.getElementById("card").hidden = true;
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "No player in this link. Build one and share it to get a card.";
    document.querySelector(".card-stage").insertBefore(note, document.querySelector(".card-actions"));
  }

  // ---- the back ---------------------------------------------------------

  // Built here rather than in markup: six pages carry this card, and the back
  // is entirely data - a stat line, their phrase, nothing to lay out by hand.
  // Every value goes in as text, because all of it came from a URL.
  function buildBack() {
    const card = document.getElementById("card");
    if (!card || !STATS) return;

    const back = document.createElement("div");
    back.className = "card-back";

    const plate = document.createElement("div");
    plate.className = "card-back-plate";
    plate.appendChild(text("p", "card-back-number", params.number ? "#" + params.number : ""));
    plate.appendChild(text("p", "card-back-name", params.name || "Unnamed"));
    plate.appendChild(text("p", "card-back-pos",
      params.position + " \u00b7 shoots " + (params.handedness === "right" ? "right" : "left")));
    back.appendChild(plate);

    const table = document.createElement("div");
    table.className = "card-stats";
    labels().forEach(function (label) {
      const cell = document.createElement("div");
      cell.className = "card-stat";
      cell.appendChild(text("span", "card-stat-label", label));
      const value = text("span", "card-stat-value", "");
      value.dataset.stat = label;
      cell.appendChild(value);
      table.appendChild(cell);
    });
    back.appendChild(table);
    const story = text("p", "card-back-story", "");
    story.id = "card-back-story";
    back.appendChild(story);
    if (params.phrase) back.appendChild(text("p", "card-back-quote", "\u201c" + params.phrase + "\u201d"));
    back.appendChild(text("p", "card-back-mark", "wearesopro.ca"));

    card.appendChild(back);
    card.classList.add("has-back");
    addFlip(card);
    // ?debug=back opens on the back: a flip cannot be judged from a screenshot,
    // and the print layout is drawn from what this shows.
    const debug = new URLSearchParams(location.search).get("debug");
    if (debug === "back") card.classList.add("flipped");
    // ?debug=print opens the print panel: the flow cannot be judged from a
    // screenshot otherwise, and the sheet is drawn from what it shows.
    if (debug === "print") setTimeout(openPrint, 0);
  }

  // The column headings, which is all CAP_STATS is used for until someone asks
  // for numbers: the boxes start empty and stay empty unless they fill them.
  function labels() {
    return STATS ? STATS.forPlayer(params, "").map(function (row) { return row[0]; }) : [];
  }

  // ---- which picture gets printed ----------------------------------------

  // The card on screen keeps playing its Highlight - that is the point of it.
  // This is only about the still that goes on paper, so it is a row of frames
  // to choose from rather than anything that interrupts the loop.
  const printing = { pose: 1, allPoses: false };
  let held = null;           // the frame the card is frozen on, or null

  function openPrint() {
    const panel = document.getElementById("card-print-panel");
    if (!panel) return;
    panel.hidden = false;
    hold(printing.pose);
    note("");
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function closePrint() {
    const panel = document.getElementById("card-print-panel");
    if (panel) panel.hidden = true;
    held = null;
    play();                  // back to the Highlight
    note("");
  }

  function hold(i) {
    const shots = PRINT && PRINT.poses ? PRINT.poses(params) : [];
    held = shots[i] || { reel: null, anim: null };
  }

  const LABELS = {
    skater:  ["Standing", "Into it", "Through it"],
    defence: ["Standing", "Carrying it", "Follow-through"],
    goalie:  ["In the crease", "Down and across", "Glove"]
  };

  function buildPoses() {
    const row = document.getElementById("card-pose-row");
    if (!row || !PRINT || !PRINT.poses) return;
    const shots = PRINT.poses(params);
    const labels = LABELS[PRINT.kind ? PRINT.kind(params) : "skater"] || LABELS.skater;

    shots.forEach(function (shot, i) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "card-pose";
      tile.setAttribute("role", "radio");
      tile.appendChild(thumb(shot));
      tile.appendChild(text("span", "card-pose-label", labels[i] || ""));
      tile.addEventListener("click", function () { choose(i); });
      row.appendChild(tile);
    });
    wire("card-pose-all", function (el) {
      el.addEventListener("change", function () { printing.allPoses = el.checked; });
    });
    choose(printing.pose);
  }

  function thumb(shot) {
    const canvas = document.createElement("canvas");
    canvas.width = DRAW.LW * DRAW.S / 2;
    canvas.height = DRAW.LH * DRAW.S / 2;
    const ctx2 = canvas.getContext("2d");
    ctx2.scale(0.5, 0.5);
    DRAW.render(ctx2, params, shot ? shot.reel.yaw : 0.5, shot ? shot.anim : null);
    return canvas;
  }

  function choose(i) {
    printing.pose = i;
    if (held) hold(i);       // the card follows the choice while it is frozen
    const tiles = document.querySelectorAll(".card-pose");
    tiles.forEach(function (tile, at) {
      tile.classList.toggle("chosen", at === i);
      tile.setAttribute("aria-checked", String(at === i));
    });
  }

  // ---- filling it in -----------------------------------------------------

  // Typed here, shown on the back, printed in the PDF. Nothing is stored and
  // nothing is required: an empty box prints as an empty box.
  const filled = { stats: {}, bio: "" };

  function buildFill() {
    if (!STATS) return;
    const row = document.getElementById("card-fill-stats");
    if (!row) return;
    labels().forEach(function (label) {
      const wrap = document.createElement("label");
      wrap.className = "card-fill-stat";
      wrap.appendChild(text("span", "", label));
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 5;
      input.dataset.stat = label;
      input.addEventListener("input", function () {
        filled.stats[label] = input.value.trim();
        showFilled();
      });
      wrap.appendChild(input);
      row.appendChild(wrap);
    });

    const bio = document.getElementById("card-fill-bio");
    if (bio) bio.addEventListener("input", function () {
      filled.bio = bio.value.trim();
      showFilled();
    });

    wire("card-fill-roll", function (el) {
      el.addEventListener("click", function () {
        const made = STATS.forPlayer(params, code());
        made.forEach(function (pair) { setStat(pair[0], String(pair[1])); });
        showFilled();
        note("A season, invented. Change anything you like.");
      });
    });
    wire("card-fill-clear", function (el) {
      el.addEventListener("click", function () {
        labels().forEach(function (label) { setStat(label, ""); });
        const box = document.getElementById("card-fill-bio");
        if (box) box.value = "";
        filled.bio = "";
        showFilled();
        note("");
      });
    });
  }

  function setStat(label, value) {
    filled.stats[label] = value;
    const input = document.querySelector('#card-fill-stats input[data-stat="' + label + '"]');
    if (input) input.value = value;
  }

  // All of it typed by a person, so all of it goes in as text.
  function showFilled() {
    labels().forEach(function (label) {
      const cell = document.querySelector('.card-stat-value[data-stat="' + label + '"]');
      if (cell) cell.textContent = filled.stats[label] || "";
    });
    const story = document.getElementById("card-back-story");
    if (story) story.textContent = filled.bio;
  }

  function text(tag, className, value) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = value;
    return el;
  }

  // The card itself flips, and a button says so - a card that only turns over
  // when you happen to click it is a card nobody turns over.
  function addFlip(card) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button card-flip-btn";
    button.textContent = "Flip the card";
    button.setAttribute("aria-pressed", "false");
    const turn = function () {
      const on = card.classList.toggle("flipped");
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "Flip it back" : "Flip the card";
    };
    button.addEventListener("click", turn);
    card.addEventListener("click", turn);
    const actions = document.querySelector(".card-actions");
    if (actions) actions.insertBefore(button, actions.firstChild);
  }

  // The code as it is now - the same one the stats are hashed from.
  function code() {
    return CODE.encode(params);
  }

  // ---- the reel ---------------------------------------------------------

  function play() {
    reel = REEL.build(params);
    start = performance.now();
  }

  // While the print panel is open the card holds the picture that is about to
  // be printed. Otherwise it plays its Highlight, which is the point of it.
  function frame(now) {
    if (held) {
      DRAW.render(ctx, params, held.reel ? held.reel.yaw : 0.5, held.anim || null);
      return requestAnimationFrame(frame);
    }
    const ms = now - start;
    const anim = REEL.at(reel, ms) || lastFrame();
    if (ms > reel.end + REPLAY_GAP) return play(), requestAnimationFrame(frame);
    DRAW.render(ctx, params, anim ? reel.yaw : 0.5, anim);
    requestAnimationFrame(frame);
  }

  // Held on the closing frame rather than snapping back to an idle player,
  // so the card reads as a card between loops.
  function lastFrame() {
    return REEL.at(reel, reel.end - 1);
  }

  document.addEventListener("partials:ready", init);

})();
