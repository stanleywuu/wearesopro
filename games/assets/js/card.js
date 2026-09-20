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
      el.addEventListener("click", function () {
        PRINT.download(params);
        note("Printable card saved - front and back, ready to cut out");
      });
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
    STATS.forPlayer(params, code()).forEach(function (row) {
      const cell = document.createElement("div");
      cell.className = "card-stat";
      cell.appendChild(text("span", "card-stat-label", row[0]));
      cell.appendChild(text("span", "card-stat-value", String(row[1])));
      table.appendChild(cell);
    });
    back.appendChild(table);
    back.appendChild(text("p", "card-back-note", "Last season, as far as anyone remembers."));
    if (params.phrase) back.appendChild(text("p", "card-back-quote", "\u201c" + params.phrase + "\u201d"));
    back.appendChild(text("p", "card-back-mark", "wearesopro.ca"));

    card.appendChild(back);
    card.classList.add("has-back");
    addFlip(card);
    // ?debug=back opens on the back: a flip cannot be judged from a screenshot,
    // and the print layout is drawn from what this shows.
    if (new URLSearchParams(location.search).get("debug") === "back") card.classList.add("flipped");
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

  function frame(now) {
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
