// Hockey card: one player, and where the photo would be, their highlight.
//
// The reel is CAP_REEL, the same one the builder plays - one highlight, not a
// copy of it. The card just loops it and holds on the last frame in between.

(function () {

  const DRAW = window.CAP_DRAW, CODE = window.CAP_CODE, REEL = window.CAP_REEL;
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
    // Both optional. The reel loops on its own, so a replay button is a nicety
    // and the card must not die without one - it threw on a missing element and
    // took the whole card down with it.
    wire("card-replay", function (el) { el.addEventListener("click", play); });
    // data-new on the link (the team profiles) means "start from this player":
    // their build, no name, cursor in the Name field.
    wire("card-edit", function (el) {
      el.href = "/games/create-a-player.html?" + SHARE_KEY + "=" + shareCode() +
        (el.dataset.new ? "&new=1" : "");
    });
    play();
    requestAnimationFrame(frame);
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
