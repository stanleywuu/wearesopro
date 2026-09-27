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
    buildReelPicker();
    buildPoses();
    buildColours();
    buildFill();
    loadGivenStats();
    // ?debug=print opens the print panel on load - it is three clicks deep
    // otherwise, and every change to it has to be looked at.
    if (new URLSearchParams(location.search).get("debug") === "print") openPrint();
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
    wire("card-print-png", function (el) {
      el.addEventListener("click", function () {
        PRINT.savePng(params, filled, printing);
        note("Saved as a PNG - front and back, laid out and ready to edit.");
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
    card.appendChild(makeBack());
    card.classList.add("has-back");
    addFlip(card);
    // ?debug=back opens on the back: a flip cannot be judged from a screenshot.
    const debug = new URLSearchParams(location.search).get("debug");
    if (debug === "back") card.classList.add("flipped");
    // ?debug=print opens the print panel, for the same reason.
    if (debug === "print" || debug === "poseback") setTimeout(openPrint, 0);
    // ?debug=poseback turns every picture over at once, which is the only way
    // to see the tile backs in a screenshot.
    if (debug === "poseback") setTimeout(function () {
      document.querySelectorAll(".card-mini").forEach(function (t) { t.classList.add("flipped"); t.style.transform = "rotateY(180deg)"; });
    }, 30);
  }

  // The back as an element rather than markup in a page: six pages carry this
  // card, the back is entirely data, and TWO of them exist at once - the card
  // and the one in the print preview. Classes throughout, no ids, and every
  // value goes in as text because all of it came from a URL.
  function makeBack() {
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
    back.appendChild(text("p", "card-back-story", ""));
    if (params.phrase) back.appendChild(text("p", "card-back-quote", "\u201c" + params.phrase + "\u201d"));
    back.appendChild(text("p", "card-back-mark", "wearesopro.ca"));
    return back;
  }

  // ---- the card's own colours --------------------------------------------

  // Set on every card on the page - the big one and the three pictures - so a
  // colour change shows everywhere at once, and goes into the share code.
  function paintCards() {
    document.querySelectorAll(".card").forEach(function (el) {
      el.style.setProperty("--card-edge", params.cardEdge);
      el.style.setProperty("--card-back", params.cardBack);
    });
  }

  // The colours are part of the player, so the address bar follows them: share
  // after recolouring and the card arrives the colour you made it.
  function keepUrl() {
    const query = new URLSearchParams(location.search);
    if (!query.has(SHARE_KEY)) return;          // a profile card has no ?p= to keep
    query.set(SHARE_KEY, CODE.encode(params));
    history.replaceState(null, "", location.pathname + "?" + query.toString());
    wire("card-edit", function (el) {
      el.href = "/games/create-a-player.html?" + SHARE_KEY + "=" + shareCode() +
        (el.dataset.new ? "&new=1" : "");
    });
  }

  function buildColours() {
    const host = document.getElementById("card-colours");
    if (!host || !window.CAP_DATA) return;
    row(host, "Border", window.CAP_DATA.cardEdgeColors, "cardEdge");
    row(host, "Background", window.CAP_DATA.cardBackColors, "cardBack");
    paintCards();
  }

  function row(host, label, colours, key) {
    const wrap = document.createElement("div");
    wrap.className = "card-colour-row";
    wrap.appendChild(text("span", "card-colour-label", label));
    colours.forEach(function (colour) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "card-colour" + (params[key] === colour ? " chosen" : "");
      dot.style.background = colour;
      dot.setAttribute("aria-label", label + " " + colour);
      dot.addEventListener("click", function () {
        params[key] = colour;
        wrap.querySelectorAll(".card-colour").forEach(function (d) { d.classList.remove("chosen"); });
        dot.classList.add("chosen");
        paintCards();
        keepUrl();
      });
      wrap.appendChild(dot);
    });
    host.appendChild(wrap);
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
  // reel is null until they pick one: null means this player's own highlight,
  // the one everybody who opens the card sees. Choosing another changes the
  // printed card and nothing else - it is not in the share code, and the
  // picture on screen goes on playing what they rolled.
  const printing = { pose: 1, allPoses: false, reel: null };

  function openPrint() {
    const panel = document.getElementById("card-print-panel");
    if (!panel) return;
    panel.hidden = false;
    sizePoses();
    note("");
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function closePrint() {
    const panel = document.getElementById("card-print-panel");
    if (panel) panel.hidden = true;
    note("");
  }

  const LABELS = {
    skater:  ["Standing", "Into it", "Through it"],
    defence: ["Standing", "Carrying it", "Follow-through"],
    saves:   ["In the crease", "Down and across", "Glove"],
    wipeout: ["Skating it up", "Feet gone", "On the ice"],
    spin:    ["Into the turn", "Coming round", "Away it goes"],
    scramble:["Blocker", "Across and glove", "Held up"]
  };

  // What each reel is called where someone has to choose between them.
  const REEL_NAMES = {
    shot: "The shot", wipeout: "The wipeout", spin: "Spin-o-rama",
    saves: "Three saves", scramble: "The scramble"
  };

  // The row that picks WHICH highlight gets printed. Their own is selected to
  // begin with; the others are there because a still of a wipeout is a
  // different card from a still of a shot, and someone might want either.
  function buildReelPicker() {
    const row = document.getElementById("card-pose-row");
    if (!row || !PRINT || !PRINT.reels) return;
    const kinds = PRINT.reels(params);
    if (kinds.length < 2) return;
    const bar = document.createElement("div");
    bar.className = "card-reel-row";
    bar.setAttribute("role", "radiogroup");
    bar.setAttribute("aria-label", "Which highlight");
    const own = PRINT.poses(params)[0].reel.kind;      // whatever they rolled
    kinds.forEach(function (kind) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card-reel-btn";
      button.setAttribute("role", "radio");
      button.textContent = REEL_NAMES[kind] || kind;
      if (kind === own) button.appendChild(text("span", "card-reel-own", "orig"));
      button.addEventListener("click", function () { pickReel(kind, bar, button); });
      bar.appendChild(button);
      if (kind === own) markReel(bar, button);
    });
    row.parentNode.insertBefore(bar, row);
  }

  function markReel(bar, button) {
    bar.querySelectorAll(".card-reel-btn").forEach(function (b) {
      const on = b === button;
      b.classList.toggle("chosen", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  function pickReel(kind, bar, button) {
    printing.reel = kind;
    markReel(bar, button);
    const row = document.getElementById("card-pose-row");
    if (row) row.textContent = "";
    buildPoses();
    sizePoses();
    showFilled();
  }

  function buildPoses() {
    const row = document.getElementById("card-pose-row");
    if (!row || !PRINT || !PRINT.poses) return;
    const shots = PRINT.poses(params, printing.reel);
    const key = PRINT.kind ? PRINT.kind(params, shots[0].reel.kind) : "skater";
    const labels = LABELS[key] || LABELS.skater;

    // Each picture IS the card, small: same markup, same styles, front and
    // back, so what a tile shows is what the sheet prints.
    shots.forEach(function (shot, i) {
      const tile = document.createElement("div");
      tile.className = "card-pose";
      tile.setAttribute("role", "radio");
      tile.setAttribute("tabindex", "0");

      // A full-size card, shrunk by transform rather than by a pile of smaller
      // font sizes. Anything else is an imitation of the card, and it shows.
      const box = document.createElement("div");
      box.className = "card-pose-box";
      const scale = document.createElement("div");
      scale.className = "card-pose-scale";
      const mini = document.createElement("div");
      mini.className = "card card-mini has-back";
      mini.appendChild(miniFront(shot));
      mini.appendChild(makeBack());          // kept in step by showFilled()
      scale.appendChild(mini);
      box.appendChild(scale);
      tile.appendChild(box);

      tile.appendChild(poseFlip(mini));
      tile.appendChild(text("span", "card-pose-label", labels[i] || ""));
      tile.addEventListener("click", function () { choose(i); });
      tile.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose(i);
        }
      });
      row.appendChild(tile);
    });
    wire("card-pose-all", function (el) {
      el.addEventListener("change", function () { printing.allPoses = el.checked; });
    });
    choose(printing.pose);
  }

  // The front of a small card: the picture, the name plate, their phrase.
  function miniFront(shot) {
    const frame = document.createElement("div");
    frame.className = "card-frame";
    const photo = document.createElement("div");
    photo.className = "card-photo";
    photo.appendChild(thumb(shot));
    frame.appendChild(photo);

    const plate = document.createElement("div");
    plate.className = "card-plate";
    plate.appendChild(text("p", "card-number", params.number ? "#" + params.number : ""));
    const id = document.createElement("div");
    id.className = "card-id";
    id.appendChild(text("h3", "card-name", params.name || "Unnamed"));
    id.appendChild(text("p", "card-pos", params.position));
    plate.appendChild(id);
    frame.appendChild(plate);

    if (params.phrase) {
      frame.appendChild(text("p", "card-quote", "\u201c" + params.phrase + "\u201d"));
    }
    return frame;
  }

  // The tiles hold a full-size card each, scaled down to whatever room the row
  // gives them. Done here rather than in CSS because the height the scaled card
  // leaves behind has to be measured, and nothing can be measured while the
  // panel is hidden.
  const CARD_W = 340;          // the card's own width, from card.css

  function sizePoses() {
    document.querySelectorAll(".card-pose-box").forEach(function (box) {
      const scale = box.querySelector(".card-pose-scale");
      const card = scale && scale.firstChild;
      if (!card) return;
      // The scaled card is taken out of the flow, so the box it sits in has to
      // be given the height the card ends up occupying.
      const k = box.clientWidth / CARD_W;
      scale.style.transform = "scale(" + k + ")";
      box.style.height = (card.offsetHeight * k) + "px";
    });
  }

  // Turns one small card over, and nothing else on the page.
  function poseFlip(mini) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-pose-flip-btn";
    button.setAttribute("aria-label", "Flip this picture");
    const glyph = document.createElement("span");
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "\u21BB";
    button.appendChild(glyph);
    button.addEventListener("click", function (e) {
      e.stopPropagation();       // choosing the picture is the tile's job
      const on = mini.classList.toggle("flipped");
      button.setAttribute("aria-label", on ? "Show the front" : "Flip this picture");
    });
    return button;
  }

  function thumb(shot) {
    const canvas = document.createElement("canvas");
    canvas.width = DRAW.LW * DRAW.S / 2;
    canvas.height = DRAW.LH * DRAW.S / 2;
    const ctx2 = canvas.getContext("2d");
    ctx2.scale(0.5, 0.5);
    DRAW.render(ctx2, params, shot ? shot.yaw : 0.5, shot ? shot.anim : null,
                { background: false, fit: DRAW.portraitFit(params) });
    return canvas;
  }

  function choose(i) {
    printing.pose = i;
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

  // A character with a real season carries it on the card element (team.js puts
  // it there from TEAM_STATS). Only the columns this card has are taken, and
  // every value goes in as text - it is data off an attribute like any other.
  function loadGivenStats() {
    const card = document.getElementById("card");
    if (!card || !card.dataset.stats) return;
    let season;
    try {
      season = JSON.parse(card.dataset.stats);
    } catch (e) {
      return;
    }
    labels().forEach(function (label) {
      if (season[label] == null) return;
      setStat(label, String(season[label]));
    });
    showFilled();
  }

  function setStat(label, value) {
    filled.stats[label] = value;
    const input = document.querySelector('#card-fill-stats input[data-stat="' + label + '"]');
    if (input) input.value = value;
  }

  // All of it typed by a person, so all of it goes in as text.
  function showFilled() {
    labels().forEach(function (label) {
      document.querySelectorAll('.card-stat-value[data-stat="' + label + '"]')
        .forEach(function (cell) { cell.textContent = filled.stats[label] || ""; });
    });
    document.querySelectorAll(".card-back-story")
      .forEach(function (el) { el.textContent = filled.bio; });
  }

  function text(tag, className, value) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = value;
    return el;
  }

  // A corner icon on the card itself, not a button in a row: the card turns
  // over wherever it is - on a profile, or frozen inside the print panel - and
  // clicking anywhere on the card does the same thing.
  // Icon AND words: an icon on its own reads as decoration and nobody turns the
  // card over. There is one card, and two buttons that turn it - one under the
  // card, one in the print panel, so the back is there to look at while the
  // boxes beside it are being filled in.
  function addFlip(card) {
    const buttons = [];

    const turn = function () {
      const on = card.classList.toggle("flipped");
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(on));
        b.lastChild.textContent = on ? " Show the front" : " Flip the card";
      });
    };

    [document.querySelector(".card-actions")].forEach(function (host) {
      if (!host) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button card-flip-btn";
      button.setAttribute("aria-pressed", "false");
      const glyph = document.createElement("span");
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "\u21BB";
      button.appendChild(glyph);
      button.appendChild(document.createTextNode(" Flip the card"));
      button.addEventListener("click", function (e) {
        e.stopPropagation();     // the card's own click would undo this one
        turn();
      });
      host.appendChild(button);
      buttons.push(button);
    });

    card.addEventListener("click", turn);
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

  function frame(now) {
    const ms = now - start;
    const anim = REEL.at(reel, ms) || lastFrame();
    if (ms > reel.end + REPLAY_GAP) return play(), requestAnimationFrame(frame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    DRAW.render(ctx, params, anim ? anim.yaw : 0.5, anim,
                { background: false, fit: DRAW.portraitFit(params) });
    requestAnimationFrame(frame);
  }

  // Held on the closing frame rather than snapping back to an idle player,
  // so the card reads as a card between loops.
  function lastFrame() {
    return REEL.at(reel, reel.end - 1);
  }

  document.addEventListener("partials:ready", init);

})();
