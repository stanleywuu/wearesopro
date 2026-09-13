// Team Photo page: a line-up of slots, each one a player built with the same
// builder the Create A Player page uses (CAP_EDITOR, mounted in the modal).
//
// The photo is drawn by compositing CAP_DRAW.render() calls into one canvas,
// so a player looks here exactly as they do in the builder.

(function () {

  const D = window.CAP_DATA, DRAW = window.CAP_DRAW;
  const CODE = window.CAP_CODE, EDITOR = window.CAP_EDITOR;

  const STORE_KEY = "cap-team";
  const SHARE_KEY = "t";
  const MIN_SIZE = 6, MAX_SIZE = 16, DEFAULT_SIZE = 12;

  // Photo geometry, in canvas pixels.
  const W = 1900, H = 640;
  const BANNER_H = 104;         // banner over the boards
  const BAND_H = 84;            // nameplate strip along the bottom
  const FRONT_K = 0.44;         // figure scale, front row
  const BACK_K = 0.37;          // back row: smaller and raised, like a riser
  const RISER = 150;             // how far the back row's feet sit above the front's
  const ROW_FIT = 6;            // rows wider than this shrink to fit

  const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const INK = "#1B2A38";

  let team = null;
  let slots = [];               // the rect each player was drawn into
  let canvas, ctx, slotBox, statusBox;
  let editor = null;            // the live mount while the modal is open
  let editorTemplate = "";      // pristine builder markup, re-stamped per open
  let openIndex = -1;
  let lastFocus = null;
  let statusTimer = 0;

  // ---- team state -------------------------------------------------------

  function blankTeam() {
    return { v: 1, name: "", sub: "", size: DEFAULT_SIZE, players: new Array(DEFAULT_SIZE).fill(null) };
  }

  // Anything out of storage or off a link is untrusted: the size is clamped,
  // the text capped, and every player code re-validated by the codec.
  function cleanTeam(raw) {
    const out = blankTeam();
    if (!raw || typeof raw !== "object") return out;
    out.name = typeof raw.name === "string" ? raw.name.slice(0, 24) : "";
    out.sub = typeof raw.sub === "string" ? raw.sub.slice(0, 32) : "";
    const size = Math.round(Number(raw.size));
    out.size = Number.isFinite(size) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)) : DEFAULT_SIZE;
    const list = Array.isArray(raw.players) ? raw.players : [];
    out.players = new Array(out.size).fill(null).map((_, i) => validCode(list[i]));
    return out;
  }

  // A code is kept only if it round-trips through the whitelist, so nothing
  // unvalidated ever reaches the renderer.
  function validCode(code) {
    if (typeof code !== "string" || !code) return null;
    try {
      return CODE.encode(CODE.load(code));
    } catch (e) {
      return null;
    }
  }

  function loadTeam() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return cleanTeam(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return blankTeam();      // blocked or corrupt storage starts empty
    }
  }

  function saveTeam() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(team));
    } catch (e) {
      // Storage blocked or full; the team simply will not persist.
    }
  }

  function playerAt(i) {
    const code = team.players[i];
    if (!code) return null;
    try {
      return CODE.load(code);
    } catch (e) {
      return null;
    }
  }

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

  // ---- paste ------------------------------------------------------------

  // Takes a whole team code, a single player code, or the Create A Player link
  // a teammate sent - whichever it is, it is validated before it is kept.
  function addFromPaste(text) {
    const value = (text || "").trim();
    if (!value) return status("Paste a code or a link first");
    if (value.slice(0, 3) === TEAM_VERSION + "~") return replaceTeam(value);
    const code = validCode(playerCodeFrom(value));
    if (!code) return status("That does not look like a player - check the code or link");
    const spot = team.players.indexOf(null);
    if (spot < 0) return status("Every spot is taken. Make room, or add more players.");
    team.players[spot] = code;
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

  // Back row first, front row second, in slot order, so moving a player
  // between rows is just a matter of where they sit in the list.
  //
  // The front row is inset by half a back-row gap, so the two rows interleave
  // instead of standing in one another's shadow.
  function rows() {
    const back = Math.ceil(team.size / 2);
    const front = team.size - back;
    const gap = (W - 120) / back;
    return [
      { index: 0, from: 0, count: back, k: BACK_K, pad: 60, baseline: H - BAND_H - RISER },
      { index: 1, from: back, count: front, k: FRONT_K, pad: 60 + gap / 2, baseline: H - BAND_H - 16 }
    ];
  }

  // A small, fixed wobble per slot so a line-up does not read as one player
  // cloned a dozen times.
  function yawFor(i) {
    return ((i * 37) % 7 - 3) * 0.05;
  }

  function slotX(row, n) {
    return row.pad + (W - row.pad * 2) * (n + 0.5) / row.count;
  }

  // ---- drawing ----------------------------------------------------------

  function drawPhoto() {
    slots = [];
    drawRink();
    drawBanner();
    rows().forEach(row => {
      for (let n = 0; n < row.count; n++) drawSlot(row, n);
    });
    rows().forEach(row => {
      for (let n = 0; n < row.count; n++) drawPlate(row, n);
    });
    placeSlotButtons();
  }

  function drawRink() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#EEF6FF";
    ctx.fillRect(0, 0, W, H);
    // Boards behind the team, ice in front of them.
    ctx.fillStyle = "#DCEBFA";
    ctx.fillRect(0, 0, W, BANNER_H + 46);
    ctx.fillStyle = "#C7DCF0";
    ctx.fillRect(0, BANNER_H + 40, W, 8);
    ctx.fillStyle = "#F7FBFF";
    ctx.fillRect(0, H - BAND_H, W, BAND_H);
    ctx.fillStyle = "#D3E4F5";
    ctx.fillRect(0, H - BAND_H, W, 2);
  }

  function drawBanner() {
    const name = team.name || "Your Team";
    outlined(name, W / 2, 66, "800 54px " + FONT, "#0D47A1", 7);
    if (team.sub) outlined(team.sub, W / 2, 104, "600 26px " + FONT, "#3B5568", 5);
  }

  // Stroke-then-fill, the same trick the highlight reel's GOAL! uses, so text
  // stays readable over whatever it lands on.
  function outlined(text, x, y, font, color, weight) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = weight;
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Only the front row casts a shadow: the back row stands further up the
  // scene, where a shadow at its feet reads as a smudge hanging in the air.
  function drawSlot(row, n) {
    const i = row.from + n;
    const k = row.k * Math.min(1, ROW_FIT / row.count);
    const x = slotX(row, n);
    const player = playerAt(i);
    const height = DRAW.GROUND * DRAW.S * k;

    ctx.save();
    ctx.translate(x - DRAW.CX * DRAW.S * k, row.baseline - DRAW.GROUND * DRAW.S * k);
    ctx.scale(k, k);
    if (player) DRAW.render(ctx, player, yawFor(i), null, { background: false, shadow: row.index === 1 });
    else drawPlaceholder();
    ctx.restore();

    const halfW = Math.max(70, (W - row.pad * 2) / row.count / 2 - 6);
    slots[i] = { x: x - halfW, y: row.baseline - height, w: halfW * 2, h: height + 10, empty: !player };
  }

  // An empty spot has to read as an invitation, not as a missing image, so it
  // is a plain grey stand-in of a player with a plus over it. Drawn in the
  // renderer's own logical grid, so it lands in the same footprint.
  function drawPlaceholder() {
    const p = n => n * DRAW.S, CX = DRAW.CX, G = DRAW.GROUND;
    ctx.save();
    ctx.fillStyle = "rgba(120, 146, 170, .30)";
    ctx.strokeStyle = "rgba(90, 120, 148, .55)";
    ctx.lineWidth = p(2);
    ctx.setLineDash([p(5), p(4)]);
    ctx.beginPath();
    ctx.ellipse(p(CX), p(G - 158), p(22), p(24), 0, 0, Math.PI * 2);   // head
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p(CX), p(G - 92), p(30), p(46), 0, 0, Math.PI * 2);    // body
    ctx.fill();
    ctx.stroke();
    [-1, 1].forEach(side => {                                          // legs
      ctx.beginPath();
      ctx.roundRect(p(CX + side * 20 - 11), p(G - 56), p(22), p(56), p(10));
      ctx.fill();
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(27, 42, 56, .5)";
    ctx.font = "700 " + p(40) + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", p(CX), p(G - 92));
    ctx.restore();
  }

  // Nameplates live in their own strip along the bottom, one line per row, each
  // label under the player it belongs to. Putting them at the players' feet
  // would bury the back row behind the front one.
  function drawPlate(row, n) {
    const i = row.from + n;
    const player = playerAt(i);
    const y = H - BAND_H + (row.index === 0 ? 32 : 66);
    const bits = [];
    if (player && player.number) bits.push("#" + player.number);
    if (player && player.name) bits.push(player.name);
    const text = player ? (bits.join(" ") || player.position) : "open spot";
    ctx.save();
    ctx.font = (player ? "600 " : "400 ") + "22px " + FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = player ? INK : "#8AA0B4";
    ctx.fillText(clip(text, 18), slotX(row, n), y);
    ctx.restore();
  }

  function clip(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
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
      button.setAttribute("aria-label", rect.empty
        ? "Spot " + (i + 1) + ", empty. Build a player."
        : "Spot " + (i + 1) + ", " + (player.name || "unnamed") + ". Edit this player.");
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

    const params = playerAt(i) || CODE.defaults();
    editor = EDITOR.mount(body.querySelector(".cap-wrap"), params, {});
    if (!editor) return;
    addModalButtons();

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

  function addModalButtons() {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "button";
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
    if (!canvas || !D || !DRAW || !CODE || !EDITOR) return;

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
      if (e.key === "Escape" && !document.getElementById("tp-modal").hidden) closeModal();
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
    team.players = team.players.map(code => code || CODE.encode(CODE.random()));
  }

  function bindPanel() {
    const name = document.getElementById("tp-name");
    const sub = document.getElementById("tp-sub");
    const size = document.getElementById("tp-size");
    for (let n = MIN_SIZE; n <= MAX_SIZE; n++) size.add(new Option(n + " players", n));
    name.addEventListener("input", () => { team.name = name.value; saveTeam(); refresh(); });
    sub.addEventListener("input", () => { team.sub = sub.value; saveTeam(); refresh(); });
    size.addEventListener("change", () => resize(Number(size.value), size));

    document.getElementById("tp-download").addEventListener("click", download);
    document.getElementById("tp-share").addEventListener("click", share);
    document.getElementById("tp-copy").addEventListener("click",
      () => copy(encodeTeam(), "Team code copied - paste it here any time to rebuild this team"));
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
