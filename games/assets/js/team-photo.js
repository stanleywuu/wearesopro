// Team Photo page: a line-up of slots, each one a player built with the same
// builder the Create A Player page uses (CAP_EDITOR, mounted in the modal).
//
// The photo is drawn by compositing CAP_DRAW.render() calls into one canvas,
// so a player looks here exactly as they do in the builder.

(function () {

  const D = window.CAP_DATA, DRAW = window.CAP_DRAW;
  const CODE = window.CAP_CODE, EDITOR = window.CAP_EDITOR;
  const TEAM = window.CAP_TEAM, PLAYERS = window.CAP_PLAYERS;

  const SHARE_KEY = "t";
  const MIN_SIZE = TEAM.MIN_SIZE, MAX_SIZE = TEAM.MAX_SIZE;

  // Photo geometry, in canvas pixels. The width is not fixed: it is whatever the
  // team needs at a shoulder-to-shoulder spacing, so six players huddle up
  // instead of being spread across a canvas sized for sixteen.
  const H = 640;
  const BANNER_H = 104;         // banner over the boards
  const BAND_H = 84;            // nameplate strip along the bottom
  // Rows are placed by a real one-point perspective, not by picked numbers.
  //
  // For people of the same height on flat ground, apparent height is
  // proportional to how far their FEET fall below the horizon. So a row is
  // described by how far away it is and how high it is standing, and its size
  // and its baseline both fall out of that - which is what makes the heads of
  // every same-height player line up along one line to the vanishing point,
  // and their feet along another.
  //
  //   height  = PLAYER_PX / depth
  //   baseline = HORIZON + (CAM - rise) * height
  //
  // Distances are in player-heights: CAM is how high the camera is, rise is
  // how high the row is standing. The back row is on a riser, which is the
  // only reason a back row is ever visible in a real team photo - at the same
  // depth and the same elevation it would be hidden behind the front row.
  const HORIZON = 150;          // canvas y the rows converge towards
  const CAM = 1.33;             // camera height, in player-heights
  const PLAYER_PX = 290;        // a front-row player's height in canvas px
  const BACK_DEPTH = 1.18;      // back row is 18% further from the camera
  const BACK_RISE = 0.30;       // and stands this much higher
  const FIGURE_W = 76;          // logical width a player actually takes up
  const HUDDLE = 0.86;          // under 1, so shoulders overlap like a real photo
  const SIDE = 96;              // margin beyond the outermost player
  const MIN_W = 900;
  let W = 1200;

  const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const INK = "#1B2A38";

  let team = null;
  let slots = [];               // the rect each player was drawn into
  let canvas, ctx, slotBox, statusBox;
  let paint = null;             // the ctx the scene is currently being painted into
  let groupFits = {};           // slot -> zoom, all worked out together
  let editor = null;            // the live mount while the modal is open
  let editorTemplate = "";      // pristine builder markup, re-stamped per open
  let openIndex = -1;
  let lastFocus = null;
  let statusTimer = 0;

  // ---- team state -------------------------------------------------------
  //
  // The roster itself lives in CAP_TEAM (team-store.js), shared with the
  // "Add to team" button on Create A Player.

  function blankTeam() { return TEAM.blank(); }
  function cleanTeam(raw) { return TEAM.clean(raw); }
  function validCode(code) { return TEAM.validCode(code); }
  function loadTeam() { return TEAM.load(); }
  function saveTeam() { TEAM.save(team); }
  function playerAt(i) { return TEAM.playerAt(team, i); }

  // ---- team codes -------------------------------------------------------

  // Length-framed, not delimiter-separated: a team carries free text (team
  // name, player names, catch-phrases) that can contain any character at all,
  // so there is no separator left to split on safely. Each part rides as
  // "<length>~<text>~", which needs no escaping and cannot be broken by what
  // anyone types.
  const TEAM_VERSION = "T1";

  function encodeTeam() {
    const parts = [team.name, team.sub].concat(team.players.map(code => code || ""));
    return TEAM_VERSION + "~" + team.size + "~" +
      parts.map(part => part.length + "~" + part + "~").join("");
  }

  // Returns a raw team object; cleanTeam() is still what validates it.
  function decodeTeam(code) {
    const text = String(code).trim();
    if (text.slice(0, 3) !== TEAM_VERSION + "~") throw new Error("not a team code");
    let i = 3;
    const num = () => {
      const j = text.indexOf("~", i);
      if (j < 0) throw new Error("truncated team code");
      const n = Number(text.slice(i, j));
      if (!Number.isFinite(n) || n < 0) throw new Error("bad length");
      i = j + 1;
      return n;
    };
    const str = () => {
      const n = num();
      const out = text.substr(i, n);
      if (out.length !== n) throw new Error("truncated team code");
      i += n + 1;
      return out;
    };
    const size = num();
    const name = str(), sub = str();
    const players = [];
    while (i < text.length) players.push(str() || null);
    return { v: 1, name: name, sub: sub, size: size, players: players };
  }

  // Percent escapes make a link look like spam and some chat clients stop
  // linkifying at one, so the two that free text actually produces are undone -
  // the same tidy-up the single-player share link does.
  function shareUrl() {
    const code = encodeURIComponent(encodeTeam())
      .replace(/%20/g, "+").replace(/%2C/g, ",");
    return location.origin + location.pathname + "?" + SHARE_KEY + "=" + code;
  }

  // A link someone else sent must not quietly replace the team on this device,
  // so it is shown but not saved until they say so.
  function loadShared() {
    const code = new URLSearchParams(location.search).get(SHARE_KEY);
    if (!code) return false;
    try {
      team = cleanTeam(decodeTeam(code));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- export -----------------------------------------------------------

  function share() {
    const url = shareUrl();
    if (!navigator.share) return copy(url, "Link copied - paste it to a teammate");
    navigator.share({ title: "Our team photo", url: url })
      .catch(err => { if (err && err.name !== "AbortError") copy(url, "Link copied"); });
  }

  function copy(text, message) {
    if (!navigator.clipboard) return status("Copy failed - no clipboard on this browser");
    navigator.clipboard.writeText(text)
      .then(() => status(message))
      .catch(() => status("Copy failed - try again"));
  }

  function download() {
    canvas.toBlob(blob => {
      if (!blob) return status("Could not make the image");
      saveBlob(blob, fileName("team-photo"));
      status("Photo saved");
    }, "image/png");
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fileName(kind) {
    const slug = (team.name || "our-team").toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "").slice(0, 30);
    return kind + "-" + (slug || "our-team") + ".png";
  }

  // ---- poster -----------------------------------------------------------

  // The reward for filling every spot: the photo again, framed, with the roster
  // written out underneath. Rendered off-screen at print size and handed
  // straight to a download - it is never shown on the page.
  const POSTER_W = 2000, POSTER_PAD = 120, POSTER_LINE = 96;

  function makePoster() {
    layout();
    const lines = Math.ceil(team.size / 2);
    const photoW = POSTER_W - POSTER_PAD * 2;
    const zoom = photoW / W;
    // The poster has its own title, so the scene's banner is cropped off the
    // top rather than printed twice.
    const photoH = (H - BANNER_H) * zoom;
    const rosterTop = 400 + photoH + 140;
    const height = rosterTop + lines * POSTER_LINE + 210;

    const board = document.createElement("canvas");
    board.width = POSTER_W;
    board.height = height;
    const out = board.getContext("2d");

    drawPosterFrame(out, height);
    drawPosterHead(out);
    out.save();
    out.beginPath();
    out.rect(POSTER_PAD, 400, photoW, photoH);
    out.clip();
    out.translate(POSTER_PAD, 400 - BANNER_H * zoom);
    out.scale(zoom, zoom);
    paintScene(out, false);
    out.restore();
    out.strokeStyle = "#B9D2EA";
    out.lineWidth = 4;
    out.strokeRect(POSTER_PAD, 400, photoW, photoH);
    drawRoster(out, rosterTop, lines);
    drawPosterFoot(out, height);

    board.toBlob(blob => {
      if (!blob) return status("Could not make the poster");
      saveBlob(blob, fileName("team-poster"));
      status("Poster saved");
    }, "image/png");
  }

  function drawPosterFrame(out, height) {
    out.fillStyle = "#FBFDFF";
    out.fillRect(0, 0, POSTER_W, height);
    out.strokeStyle = "#0D47A1";
    out.lineWidth = 26;
    out.strokeRect(34, 34, POSTER_W - 68, height - 68);
    out.strokeStyle = "#E53935";
    out.lineWidth = 6;
    out.strokeRect(66, 66, POSTER_W - 132, height - 132);
  }

  function drawPosterHead(out) {
    out.save();
    out.textAlign = "center";
    out.fillStyle = "#0D47A1";
    out.font = "800 108px " + FONT;
    out.fillText(clip(team.name || "Our Team", 22), POSTER_W / 2, 230);
    if (team.sub) {
      out.fillStyle = "#3B5568";
      out.font = "600 48px " + FONT;
      out.fillText(clip(team.sub, 34), POSTER_W / 2, 306);
    }
    out.restore();
  }

  // Two columns, filled down the left one first, so the printed order matches
  // the order the players stand in.
  function drawRoster(out, top, lines) {
    out.save();
    out.textAlign = "left";
    out.font = "600 42px " + FONT;
    team.players.forEach((code, i) => {
      const player = playerAt(i);
      if (!player) return;
      const col = i < lines ? 0 : 1;
      const x = POSTER_PAD + 40 + col * (POSTER_W - POSTER_PAD * 2) / 2;
      const y = top + (i - col * lines) * POSTER_LINE;
      out.fillStyle = "#E53935";
      out.fillText(player.number ? "#" + player.number : "--", x, y);
      out.fillStyle = INK;
      out.fillText(clip(player.name || "Unnamed", 16), x + 130, y);
      out.fillStyle = "#5A7285";
      out.font = "400 34px " + FONT;
      out.fillText(player.position, x + 520, y);
      out.font = "600 42px " + FONT;
    });
    out.restore();
  }

  function drawPosterFoot(out, height) {
    out.save();
    out.textAlign = "center";
    out.fillStyle = "#8AA0B4";
    out.font = "500 36px " + FONT;
    out.fillText("wearesopro.ca", POSTER_W / 2, height - 110);
    out.restore();
  }

  // ---- paste ------------------------------------------------------------

  // Takes a whole team code, a single player code, or the Create A Player link
  // a teammate sent - whichever it is, it is validated before it is kept.
  function addFromPaste(text) {
    const value = (text || "").trim();
    if (!value) return status("Paste a code or a link first");
    if (value.slice(0, 3) === TEAM_VERSION + "~") return replaceTeam(value);
    const code = validCode(playerCodeFrom(value));
    if (!code) return status("That does not look like a player - check the code or link");
    const spot = TEAM.add(team, code);
    if (spot < 0) return status("Every spot is taken. Make room, or add more players.");
    saveTeam();
    refresh();
    status("Added to spot " + (spot + 1) + ".");
  }

  function playerCodeFrom(value) {
    if (value.indexOf("?") < 0) return value;
    try {
      return new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("p") || value;
    } catch (e) {
      return value;
    }
  }

  function replaceTeam(code) {
    try {
      team = cleanTeam(decodeTeam(code));
    } catch (e) {
      return status("That team code is damaged - copy the whole thing and try again");
    }
    saveTeam();
    syncPanel();
    refresh();
    status("Team loaded.");
  }

  // ---- layout -----------------------------------------------------------

  // Back row first, front row second, in slot order, so moving a player between
  // rows is just a matter of where they sit in the list. The two rows have
  // different counts and different spacings, so they interleave on their own.
  function rows() {
    const front = TEAM.frontCount(team.size);
    const back = team.size - front;
    return [
      Object.assign({ index: 0, from: 0, count: back }, place(BACK_DEPTH, BACK_RISE)),
      Object.assign({ index: 1, from: back, count: front }, place(1, 0))
    ].map(row => Object.assign(row, { gap: FIGURE_W * DRAW.S * row.k * HUDDLE }));
  }

  // One row's size and ground line, straight off the perspective above.
  function place(depth, rise) {
    const height = PLAYER_PX / depth;
    return {
      k: height / (DRAW.FRAME * DRAW.S),
      baseline: HORIZON + (CAM - rise) * height
    };
  }

  function goalieIndex() {
    return TEAM.goalieIndex(team.size);
  }

  // Wide enough for the widest row and no wider.
  function widthFor(list) {
    return Math.round(Math.max.apply(null,
      list.map(row => row.count * row.gap + SIDE * 2).concat([MIN_W])));
  }

  // A small, fixed wobble per slot so a line-up does not read as one player
  // cloned a dozen times.
  function yawFor(i) {
    return ((i * 37) % 7 - 3) * 0.05;
  }

  function slotX(row, n) {
    return W / 2 + (n - (row.count - 1) / 2) * row.gap;
  }

  // ---- drawing ----------------------------------------------------------

  function drawPhoto() {
    layout();
    if (canvas.width !== W) canvas.width = W;   // resizing also clears it
    paintScene(ctx);
    placeSlotButtons();
  }

  // Sets the scene width for everything that follows. Called before painting,
  // by the page and by the poster, so the two never disagree about it.
  function layout() {
    W = widthFor(rows());
    return rows();
  }

  // The scene always draws in its own W x H coordinates, so a caller can put it
  // anywhere at any size by setting a transform first - the same trick the
  // player renderer uses.
  function paintScene(target, banner) {
    paint = target;
    slots = [];
    measureTeam();
    drawRink();
    if (banner !== false) drawBanner();
    rows().forEach(row => {
      centreLast(row).forEach(n => drawSlot(row, n));
    });
    rows().forEach(row => {
      for (let n = 0; n < row.count; n++) drawPlate(row, n);
    });
  }

  // The zooms are worked out across the whole team at once, so one player's
  // height is always relative to the rest.
  // For now every player is the same height and perspective alone decides who
  // is bigger. Height variation comes later, and comes on top of this.
  function measureTeam() {
    groupFits = {};
    team.players.forEach((code, i) => {
      const player = playerAt(i);
      if (player) groupFits[i] = DRAW.uniformFit(player);
    });
  }

  // Outermost first, middle last. A team picture has the middle of the front
  // row - the goalie - in front of everyone, and whoever is drawn last is in
  // front. Left to right put the goalie behind his right-hand neighbour, which
  // is what made him look like he was standing further back.
  function centreLast(row) {
    const middle = (row.count - 1) / 2;
    const order = [];
    for (let n = 0; n < row.count; n++) order.push(n);
    return order.sort((a, b) => Math.abs(b - middle) - Math.abs(a - middle));
  }

  function drawRink() {
    paint.clearRect(0, 0, W, H);
    paint.fillStyle = "#EEF6FF";
    paint.fillRect(0, 0, W, H);
    // Boards behind the team, ice in front of them.
    paint.fillStyle = "#DCEBFA";
    paint.fillRect(0, 0, W, BANNER_H + 46);
    paint.fillStyle = "#C7DCF0";
    paint.fillRect(0, BANNER_H + 40, W, 8);
    paint.fillStyle = "#F7FBFF";
    paint.fillRect(0, H - BAND_H, W, BAND_H);
    paint.fillStyle = "#D3E4F5";
    paint.fillRect(0, H - BAND_H, W, 2);
  }

  function drawBanner() {
    const name = team.name || "Your Team";
    outlined(name, W / 2, 66, "800 54px " + FONT, "#0D47A1", 7);
    if (team.sub) outlined(team.sub, W / 2, 104, "600 26px " + FONT, "#3B5568", 5);
  }

  // Stroke-then-fill, the same trick the highlight reel's GOAL! uses, so text
  // stays readable over whatever it lands on.
  function outlined(text, x, y, font, color, weight) {
    paint.save();
    paint.font = font;
    paint.textAlign = "center";
    paint.lineJoin = "round";
    paint.lineWidth = weight;
    paint.strokeStyle = "#FFFFFF";
    paint.strokeText(text, x, y);
    paint.fillStyle = color;
    paint.fillText(text, x, y);
    paint.restore();
  }

  // Only the front row casts a shadow: the back row stands further up the
  // scene, where a shadow at its feet reads as a smudge hanging in the air.
  function drawSlot(row, n) {
    const i = row.from + n;
    const k = row.k;
    const x = slotX(row, n);
    const player = playerAt(i);
    const height = DRAW.GROUND * DRAW.S * k;

    paint.save();
    paint.translate(x - DRAW.CX * DRAW.S * k, row.baseline - DRAW.GROUND * DRAW.S * k);
    paint.scale(k, k);
    if (player) {
      DRAW.render(paint, player, yawFor(i), null,
        { background: false, shadow: row.index === 1, fit: groupFits[i] });
    } else {
      drawPlaceholder(i === goalieIndex());
    }
    paint.restore();

    const halfW = Math.max(52, row.gap / 2 - 2);
    slots[i] = { x: x - halfW, y: row.baseline - height, w: halfW * 2, h: height + 10, empty: !player };
  }

  // An empty spot has to read as an invitation, not as a missing image, so it
  // is a plain grey stand-in of a player with a plus over it. Drawn in the
  // renderer's own logical grid, so it lands in the same footprint.
  function drawPlaceholder(goalie) {
    const p = n => n * DRAW.S, CX = DRAW.CX, G = DRAW.GROUND;
    paint.save();
    paint.fillStyle = "rgba(120, 146, 170, .30)";
    paint.strokeStyle = "rgba(90, 120, 148, .55)";
    paint.lineWidth = p(2);
    paint.setLineDash([p(5), p(4)]);
    paint.beginPath();
    paint.ellipse(p(CX), p(G - 158), p(22), p(24), 0, 0, Math.PI * 2);   // head
    paint.fill();
    paint.stroke();
    paint.beginPath();
    paint.ellipse(p(CX), p(G - 92), p(30), p(46), 0, 0, Math.PI * 2);    // body
    paint.fill();
    paint.stroke();
    [-1, 1].forEach(side => {                                          // legs
      paint.beginPath();
      paint.roundRect(p(CX + side * 20 - 11), p(G - 56), p(22), p(56), p(10));
      paint.fill();
      paint.stroke();
    });
    if (goalie) {                                                      // pads, so
      [-1, 1].forEach(side => {                                        // the spot
        paint.beginPath();                                             // reads as
        paint.roundRect(p(CX + side * 20 - 15), p(G - 58), p(30), p(58), p(12));
        paint.fill();
        paint.stroke();
      });
    }
    paint.setLineDash([]);
    paint.fillStyle = "rgba(27, 42, 56, .5)";
    paint.font = "700 " + p(40) + "px " + FONT;
    paint.textAlign = "center";
    paint.textBaseline = "middle";
    paint.fillText("+", p(CX), p(G - 92));
    paint.restore();
  }

  // Nameplates live in their own strip along the bottom, one line per row, each
  // label under the player it belongs to. Putting them at the players' feet
  // would bury the back row behind the front one.
  function drawPlate(row, n) {
    const i = row.from + n;
    const player = playerAt(i);
    const y = H - BAND_H + (row.index === 0 ? 32 : 66);
    // The rows huddle, so a plate has only its own player's width to live in.
    // The font goes on before anything measures against it.
    const room = row.gap - 8;
    paint.save();
    paint.font = (player ? "600 " : "400 ") + "17px " + FONT;
    paint.textAlign = "center";
    paint.fillStyle = player ? INK : "#8AA0B4";
    const text = player ? plateText(paint, player, room)
      : (i === goalieIndex() ? "goalie spot" : "open spot");
    paint.fillText(fit(paint, text, room), slotX(row, n), y);
    paint.restore();
  }

  // "#7 Wheels" if it fits, then the name alone, then the number alone - a
  // truncated name tells you less than either.
  function plateText(target, player, room) {
    const number = player.number ? "#" + player.number : "";
    const full = [number, player.name].filter(Boolean).join(" ");
    if (!full) return player.position;
    if (target.measureText(full).width <= room) return full;
    if (player.name && target.measureText(player.name).width <= room) return player.name;
    return number || player.name;
  }

  function clip(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  // Trim to whatever actually fits the space, rather than to a character count
  // that is wrong for "#7 Al" and wrong again for "#88 Bartholomew".
  function fit(target, text, width) {
    let out = text;
    while (out.length > 1 && target.measureText(out).width > width) {
      out = out.slice(0, -1);
    }
    return out === text ? text : out.slice(0, -1) + "…";
  }

  // ---- slot buttons -----------------------------------------------------

  // The rects recorded while drawing are the single source of truth for where
  // a player is, so the buttons cannot drift out of step with the picture.
  function placeSlotButtons() {
    slotBox.textContent = "";
    slots.forEach((rect, i) => {
      const player = playerAt(i);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tp-slot" + (rect.empty ? " is-empty" : "");
      button.style.left = (rect.x / W * 100) + "%";
      button.style.top = (rect.y / H * 100) + "%";
      button.style.width = (rect.w / W * 100) + "%";
      button.style.height = (rect.h / H * 100) + "%";
      const what = i === goalieIndex() ? "Goalie spot" : "Spot " + (i + 1);
      button.setAttribute("aria-label", rect.empty
        ? what + ", empty. Build a player."
        : what + ", " + (player.name || "unnamed") + ". Edit this player.");
      button.addEventListener("click", () => openSlot(i));
      slotBox.appendChild(button);
    });
  }

  // ---- the builder modal ------------------------------------------------

  // A fresh mount every open: the builder appends its own options, swatches and
  // pickers, so re-mounting onto used markup would double everything up. The
  // pristine markup is stamped back in first.
  function openSlot(i) {
    const modal = document.getElementById("tp-modal");
    const body = document.getElementById("tp-modal-body");
    body.innerHTML = editorTemplate;
    openIndex = i;
    lastFocus = document.activeElement;

    const params = playerAt(i) || newPlayerFor(i);
    editor = EDITOR.mount(body.querySelector(".cap-wrap"), params, {});
    if (!editor) return;
    addModalButtons();
    addAdvanced();

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.addEventListener("keydown", trapFocus);
    const first = editor.el("canvas");
    if (first) first.focus();
  }

  // Tab must not wander out of the dialog and behind the backdrop, where a
  // keyboard user would be typing into something they cannot see.
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const able = e.currentTarget.querySelectorAll(
      "button, input, select, textarea, canvas[tabindex], [tabindex]:not([tabindex='-1'])");
    const list = Array.from(able).filter(node => node.offsetParent !== null || node === document.activeElement);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // The middle of the front row is the goalie's, so a player built there starts
  // as one - gear, mask and the rest pose - rather than as a centre they have to
  // remember to change.
  function newPlayerFor(i) {
    const params = CODE.defaults();
    if (i === goalieIndex()) {
      params.position = "Goalie";
      params.helmetStyle = "mask";
    }
    return params;
  }

  function addModalButtons() {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "button is-primary";
    save.textContent = "Save to team";
    save.addEventListener("click", saveSlot);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeModal);
    const host = editor.el("host-actions");
    host.appendChild(save);
    host.appendChild(cancel);
    addPickerButton();
  }

  // Everyone you have already built. Opened from a button rather than sitting
  // across the top of the modal: it is a thing you go to when you want it, not
  // a shelf in front of the builder.
  function addPickerButton() {
    if (!PLAYERS.list().length) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Saved players";
    button.addEventListener("click", openPicker);
    editor.el("host-actions").appendChild(button);
  }

  function openPicker() {
    closePicker();
    const card = document.querySelector(".tp-modal-card");
    const panel = document.createElement("div");
    panel.className = "tp-gallery";
    panel.appendChild(pickerHead());
    panel.appendChild(pickerGrid());
    card.appendChild(panel);
    const first = panel.querySelector(".tp-pick");
    if (first) first.focus();
  }

  function closePicker() {
    const open = document.querySelector(".tp-gallery");
    if (open) open.remove();
  }

  function pickerHead() {
    const head = document.createElement("div");
    head.className = "tp-gallery-head";
    const title = document.createElement("h3");
    title.textContent = "Someone you already made";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "button";
    back.textContent = "Back";
    back.addEventListener("click", closePicker);
    head.appendChild(title);
    head.appendChild(back);
    return head;
  }

  function pickerGrid() {
    const grid = document.createElement("div");
    grid.className = "tp-gallery-grid";
    PLAYERS.list().forEach(entry => grid.appendChild(pickerButton(entry)));
    if (!PLAYERS.list().length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Nobody saved yet. Build someone and they show up here.";
      grid.appendChild(empty);
    }
    return grid;
  }

  // A tile is a wrapper, not a button, because the remove control is a button
  // of its own and one cannot sit inside another.
  function pickerButton(entry) {
    const player = safeLoad(entry.code);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tp-pick";
    const thumb = document.createElement("canvas");
    thumb.width = DRAW.LW * DRAW.S;
    thumb.height = DRAW.LH * DRAW.S;
    if (player) DRAW.render(thumb.getContext("2d"), player, 0.35);
    button.appendChild(thumb);
    const name = document.createElement("span");
    name.textContent = player ? (player.name || player.position) : "player";
    button.appendChild(name);
    button.setAttribute("aria-label", "Use " + (player && player.name ? player.name : "this player"));
    if (player) button.addEventListener("click", () => { useSaved(player); closePicker(); });
    return button;
  }

  function safeLoad(code) {
    try {
      return CODE.load(code);
    } catch (e) {
      return null;
    }
  }

  // Drops the saved player into the open editor rather than straight into the
  // slot, so they can still be tweaked before being saved to the team.
  function useSaved(player) {
    Object.assign(editor.params, player);
    editor.sync();
    status("Loaded. Change anything you like, then save to the team.");
  }

  // Pasting a code is a power-user route, so it goes behind a disclosure
  // instead of sitting in front of everybody filling a slot.
  function addAdvanced() {
    const box = document.createElement("details");
    box.className = "tp-advanced";
    const head = document.createElement("summary");
    head.textContent = "Advanced";
    box.appendChild(head);
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Paste a player code or link";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Player code or Create A Player link");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "button";
    go.textContent = "Use this code";
    go.addEventListener("click", () => {
      const player = fromPasted(input.value);
      if (!player) return status("That does not look like a player");
      useSaved(player);
      input.value = "";
    });
    const row = document.createElement("div");
    row.className = "tp-advanced-row";
    row.appendChild(input);
    row.appendChild(go);
    box.appendChild(row);
    editor.el("host-footer").appendChild(box);
  }

  function fromPasted(text) {
    const value = (text || "").trim();
    if (!value) return null;
    return safeLoad(playerCodeFrom(value));
  }

  function saveSlot() {
    team.players[openIndex] = CODE.encode(editor.params);
    saveTeam();
    closeModal();
    refresh();
    status("Saved to spot " + (openIndex + 1) + ".");
  }

  function closeModal() {
    const modal = document.getElementById("tp-modal");
    closePicker();
    if (editor) editor.destroy();
    editor = null;
    modal.removeEventListener("keydown", trapFocus);
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    openIndex = -1;
  }

  // ---- page -------------------------------------------------------------

  function status(message) {
    statusBox.textContent = message;
    statusBox.classList.toggle("show", Boolean(message));
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => status(""), 8000);
  }

  function refresh() {
    drawPhoto();
    const full = team.players.every(Boolean);
    const poster = document.getElementById("tp-poster");
    poster.disabled = !full;
    poster.classList.toggle("is-ready", full);
  }

  function init() {
    canvas = document.getElementById("tp-canvas");
    slotBox = document.getElementById("tp-slots");
    statusBox = document.getElementById("tp-status");
    if (!canvas || !D || !DRAW || !CODE || !EDITOR || !TEAM || !PLAYERS) return;

    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d");

    const body = document.getElementById("tp-modal-body");
    editorTemplate = body.innerHTML;
    body.textContent = "";

    team = loadTeam();
    const shared = loadShared();
    seedForDebug();
    bindPanel();
    if (shared) offerToKeep();
    document.getElementById("tp-close").addEventListener("click", closeModal);
    document.getElementById("tp-modal").addEventListener("click", e => {
      if (e.target.id === "tp-modal") closeModal();
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || document.getElementById("tp-modal").hidden) return;
      if (document.querySelector(".tp-gallery")) return closePicker();
      closeModal();
    });
    refresh();
  }

  // Arriving on someone else's link shows their team without touching the one
  // saved here - keeping it is a deliberate press.
  function offerToKeep() {
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "button is-keep";
    keep.textContent = "Save this team to my device";
    keep.addEventListener("click", () => {
      saveTeam();
      keep.remove();
      dropShareParam();
      status("Saved. This is your team now.");
    });
    document.querySelector(".tp-actions").prepend(keep);
    status("You are looking at a shared team. Nothing here is saved until you say so.");
  }

  // Once it is their team, the code comes out of the address bar so a reload or
  // a copied URL is their own work. Any other param (?debug) is left alone.
  function dropShareParam() {
    const query = new URLSearchParams(location.search);
    query.delete(SHARE_KEY);
    const rest = query.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
  }

  // ?debug drops a random player into every empty spot so the line-up can be
  // eyeballed without building a whole team by hand. In memory only - it never
  // touches the saved team.
  function seedForDebug() {
    if (!new URLSearchParams(location.search).has("debug")) return;
    const roll = roller();
    team.players = team.players.map((code, i) => code || CODE.encode(roll(i)));
  }

  // ---- random team ------------------------------------------------------

  // Fills the empty spots, which destroys nothing. Only a team with every spot
  // already taken has anything to lose, and that one asks first.
  function randomTeam() {
    const filled = team.players.filter(Boolean).length;
    const replacing = filled === team.size;
    if (replacing && !confirm("Every spot is taken. Re-roll all " + filled + " players?")) return;
    const first = team.players.map((_, i) => playerAt(i)).find(Boolean);
    const roll = roller((!replacing && first) ? kitOf(first) : randomKit(), keptNames(replacing));
    team.players = team.players.map((code, i) =>
      (code && !replacing) ? code : CODE.encode(roll(i)));
    saveTeam();
    refresh();
    status(replacing ? "New team rolled." : "Filled the empty spots.");
  }

  // One kit for everyone. A dozen players in a dozen different jerseys is a
  // pile of strangers, not a team.
  function randomKit() {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const jersey = pick(D.jerseyColors);
    return {
      jerseyColor: jersey,
      sockColor: jersey,
      trimColor: pick(D.trimColors),
      helmetColor: pick(D.helmetColors)
    };
  }

  function kitOf(player) {
    return {
      jerseyColor: player.jerseyColor,
      sockColor: player.sockColor,
      trimColor: player.trimColor,
      helmetColor: player.helmetColor
    };
  }

  // Hands out random players in one kit, with names and numbers dealt rather
  // than drawn each time - nobody wants three Stanleys, two of them wearing 41.
  function roller(kit, taken) {
    const outfit = kit || randomKit();
    const name = dealer(D.randomNames, taken || []);
    const number = dealer(numbers(), []);
    return function (i) {
      const player = Object.assign(CODE.random(), outfit);
      player.name = name();
      player.number = number();
      if (i === goalieIndex()) {
        player.position = "Goalie";
        player.helmetStyle = "mask";
      } else if (player.position === "Goalie") {
        player.position = skaterPosition();
        player.helmetStyle = "visor";
      }
      return player;
    };
  }

  // Deals without repeating until the pool runs dry, then simply repeats.
  function dealer(pool, used) {
    const left = pool.filter(item => used.indexOf(item) < 0);
    return function () {
      if (!left.length) return pool[Math.floor(Math.random() * pool.length)];
      return left.splice(Math.floor(Math.random() * left.length), 1)[0];
    };
  }

  function numbers() {
    const list = [];
    for (let n = 1; n <= 99; n++) list.push(String(n));
    return list;
  }

  // Names already on the ice, so filling empty spots does not duplicate one.
  function keptNames(replacing) {
    if (replacing) return [];
    return team.players.map((_, i) => playerAt(i)).filter(Boolean).map(p => p.name);
  }

  function skaterPosition() {
    const skaters = D.positions.filter(name => name !== "Goalie");
    return skaters[Math.floor(Math.random() * skaters.length)];
  }

  function bindPanel() {
    const name = document.getElementById("tp-name");
    const sub = document.getElementById("tp-sub");
    const size = document.getElementById("tp-size");
    for (let n = MIN_SIZE; n <= MAX_SIZE; n++) size.add(new Option(n + " players", n));
    name.addEventListener("input", () => { team.name = name.value; saveTeam(); refresh(); });
    sub.addEventListener("input", () => { team.sub = sub.value; saveTeam(); refresh(); });
    size.addEventListener("change", () => resize(Number(size.value), size));

    document.getElementById("tp-poster").addEventListener("click", makePoster);
    document.getElementById("tp-download").addEventListener("click", download);
    document.getElementById("tp-share").addEventListener("click", share);
    document.getElementById("tp-random").addEventListener("click", randomTeam);
    document.getElementById("tp-reset").addEventListener("click", reset);
    document.getElementById("tp-add").addEventListener("click", () => {
      const input = document.getElementById("tp-paste-input");
      addFromPaste(input.value);
      input.value = "";
    });
    syncPanel();
  }

  // Called again whenever the whole team is replaced, so it only ever writes
  // values - the options and listeners above are built once.
  function syncPanel() {
    document.getElementById("tp-name").value = team.name;
    document.getElementById("tp-sub").value = team.sub;
    document.getElementById("tp-size").value = team.size;
  }

  // Wipes the lot so another team can be built. It asks first, and it says how
  // many players are about to go - this is the only button here that destroys
  // anything, and there is no undo for it.
  function reset() {
    const built = team.players.filter(Boolean).length;
    const warning = built
      ? "Start a new team? That deletes " + built + " player" + (built > 1 ? "s" : "") + "."
      : "Clear the team name and start over?";
    if (!confirm(warning + " Copy the team code first if you want them back.")) return;
    const size = team.size;
    team = blankTeam();
    team.size = size;
    team.players = new Array(size).fill(null);
    saveTeam();
    syncPanel();
    refresh();
    status("Cleared. Tap a spot to start building.");
  }

  // Shrinking can throw players away, so it asks first and puts the control
  // back if the answer is no.
  function resize(next, control) {
    const lost = team.players.slice(next).filter(Boolean).length;
    if (lost && !confirm("That drops " + lost + " player" + (lost > 1 ? "s" : "") + " off the end. Carry on?")) {
      control.value = team.size;
      return;
    }
    const players = team.players.slice(0, next);
    while (players.length < next) players.push(null);
    team.size = next;
    team.players = players;
    saveTeam();
    refresh();
  }

  // The builder markup arrives with the partials, after this deferred script.
  document.addEventListener("partials:ready", init);

})();
