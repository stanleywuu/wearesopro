// The saved-players panel, shared by both pages that need it.
//
// Team Photo opens it to pick somebody for a slot. Create A Player opens it to
// load somebody back in and to manage the collection - deleting only happens
// there, because on a page with a team in front of you "remove" reads as
// "off the team" no matter what the button says.

(function () {

  const CODE = window.CAP_CODE, DRAW = window.CAP_DRAW, PLAYERS = window.CAP_PLAYERS;
  if (!CODE || !DRAW || !PLAYERS) return;

  let panel = null;
  let options = {};

  // opts: { into, title, onPick, canDelete, onStatus }
  function open(opts) {
    close();
    options = opts || {};
    panel = document.createElement("div");
    panel.className = "cap-gallery";
    panel.appendChild(head());
    panel.appendChild(grid());
    (options.into || document.body).appendChild(panel);
    const first = panel.querySelector(".cap-pick");
    if (first) first.focus();
  }

  function close() {
    if (panel) panel.remove();
    panel = null;
  }

  function isOpen() {
    return Boolean(panel);
  }

  function head() {
    const bar = document.createElement("div");
    bar.className = "cap-gallery-head";
    const title = document.createElement("h3");
    title.textContent = options.title || "Someone you already made";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "button";
    back.textContent = "Back";
    back.addEventListener("click", close);
    bar.appendChild(title);
    bar.appendChild(back);
    return bar;
  }

  function grid() {
    const box = document.createElement("div");
    box.className = "cap-gallery-grid";
    const saved = PLAYERS.list();
    if (!saved.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Nobody saved yet - anyone you build shows up here.";
      box.appendChild(empty);
      return box;
    }
    saved.forEach(function (entry) { box.appendChild(tile(entry)); });
    return box;
  }

  // Rebuilt in place after a delete, so the panel stays where it is.
  function refresh() {
    if (!panel) return;
    panel.replaceChild(grid(), panel.querySelector(".cap-gallery-grid"));
  }

  function tile(entry) {
    const wrap = document.createElement("div");
    wrap.className = "cap-pick-wrap";
    wrap.appendChild(pickButton(entry));
    if (options.canDelete) wrap.appendChild(deleteButton(entry));
    return wrap;
  }

  function pickButton(entry) {
    const player = read(entry.code);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cap-pick";
    const thumb = document.createElement("canvas");
    thumb.width = DRAW.LW * DRAW.S;
    thumb.height = DRAW.LH * DRAW.S;
    if (player) DRAW.render(thumb.getContext("2d"), player, 0.35);
    button.appendChild(thumb);
    const name = document.createElement("span");
    name.textContent = player ? (player.name || player.position) : "player";
    button.appendChild(name);
    button.setAttribute("aria-label", "Open " + label(player));
    if (player) {
      button.addEventListener("click", function () {
        close();
        if (options.onPick) options.onPick(player, entry);
      });
    }
    return button;
  }

  // A word, not an X. The X was the thing that read as "take him off the team"
  // when this panel lived on the team page.
  function deleteButton(entry) {
    const player = read(entry.code);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cap-pick-del";
    button.textContent = "Delete";
    button.setAttribute("aria-label", "Delete " + label(player) + " from your saved players");
    button.addEventListener("click", function () {
      PLAYERS.forget(entry.id);
      refresh();
      say("Deleted " + label(player) + ".", {
        label: "Undo",
        run: function () {
          PLAYERS.remember(entry.id, entry.code);
          refresh();
          say("Back.");
        }
      });
    });
    return button;
  }

  function say(message, action) {
    if (options.onStatus) options.onStatus(message, action);
  }

  function label(player) {
    return (player && player.name) ? player.name : "this player";
  }

  function read(code) {
    try {
      return CODE.load(code);
    } catch (e) {
      return null;
    }
  }

  window.CAP_GALLERY = { open: open, close: close, isOpen: isOpen };

})();
