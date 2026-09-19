// Create-a-Player page controller. The builder itself is CAP_EDITOR, mounted on
// the partial this page includes; everything here is about the *page* - quiet
// autosave, ?p= share links, and the collapsed view a shared link opens in.

(function () {

  const CODE = window.CAP_CODE, EDITOR = window.CAP_EDITOR;
  const TEAM = window.CAP_TEAM, PLAYERS = window.CAP_PLAYERS;
  const GALLERY = window.CAP_GALLERY;

  const STORE_KEY = "cap-player";
  const SHARE_KEY = "p";
  const NEW_KEY = "new";     // ?p=<code>&new=1: their look, your player
  const SAVE_DELAY = 700;
  const SHARED = "cap-shared";
  const CARD_PATH = "/games/card.html";

  // Set now, not on partials:ready. The builder's markup arrives with the
  // includes, and collapsing it after that has already been painted is what
  // made the canvas visibly jump. On the document element the rule is waiting
  // before the markup it applies to exists.
  if (new URLSearchParams(location.search).has(SHARE_KEY) &&
      !new URLSearchParams(location.search).has(NEW_KEY)) {
    document.documentElement.classList.add(SHARED);
  }

  let editor = null;
  let saveTimer = 0;
  let cardLink = null;       // its href has to track the player as it changes
  let playerId = null;       // which gallery entry this player is
  let started = false;       // the mount fires one change of its own; ignore it
  let keeping = true;        // false while looking at somebody else's player

  function init() {
    const root = document.querySelector(".cap-wrap");
    if (!root || !CODE || !EDITOR || !TEAM || !PLAYERS || !GALLERY) return;

    const params = CODE.defaults();
    loadSaved(params);
    const fromLink = loadShared(params);
    // A team profile links here with ?p=<their code>&new=1: keep the build,
    // drop who they are. You are not looking at Dale, you are starting from him.
    const asNew = fromLink && new URLSearchParams(location.search).has(NEW_KEY);
    if (asNew) Object.assign(params, { name: "", number: "", phrase: "" });

    playerId = PLAYERS.newId();
    keeping = !fromLink || asNew;
    editor = EDITOR.mount(root, params, { onChange: onChange, onNew: newPlayer });
    if (!editor) return;

    addNewButton();
    addShareButton();
    addTeamButton();
    addGalleryButton(root);
    addPasteLink();
    addCardLink();
    if (asNew) {
      dropShareParam();
      editor.startNaming();
    } else if (fromLink) {
      collapseEditor();
    }
  }

  // ---- save -------------------------------------------------------------

  // Everything you build is kept, without a Save button. Two things stop the
  // gallery filling with noise: the mount's own opening change does not count,
  // and neither does a shared player you have only looked at.
  function onChange(params) {
    queueSave(params);
    refreshCardLink();
    if (!started) {
      started = true;
      return;
    }
    if (keeping) PLAYERS.remember(playerId, CODE.encode(params));
  }

  function newPlayer() {
    playerId = PLAYERS.newId();
  }

  function loadSaved(params) {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(params, CODE.fromStored(JSON.parse(raw)));
    } catch (e) {
      // A blocked or corrupt store just means we start from the defaults.
    }
  }

  // No Save button: the player is written back whenever it changes, so a
  // reload keeps it without anyone having to remember to press anything.
  function queueSave(params) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(params));
      } catch (e) {
        // Storage blocked or full; the player simply will not persist.
      }
    }, SAVE_DELAY);
  }

  // ---- saved players ----------------------------------------------------

  // The place to manage the collection. Deleting lives here and nowhere else:
  // this page has no team on it, so "delete" can only mean one thing.
  function addGalleryButton(root) {
    editor.addLink("Saved players", () => GALLERY.open({
      into: root,
      title: "Your saved players",
      canDelete: true,
      canBackup: true,
      onPick: openSaved,
      onStatus: editor.status
    }));
  }

  // Opening one puts it back in the builder as the player being worked on, so
  // editing it updates that entry rather than making a second copy.
  // NOT loadSaved: that name already belongs to the localStorage read below,
  // and a second declaration quietly replaced it.
  function openSaved(player, entry) {
    Object.assign(editor.params, player);
    playerId = entry.id;
    keeping = true;
    editor.sync();
    editor.status("Loaded " + (player.name || "player") + ". Changes are saved as you go.");
  }

  // ---- paste a code -----------------------------------------------------

  // For putting back a player you have the code for - out of a backup file, a
  // team link or a message. It opens a box rather than sitting on the page,
  // since almost nobody needs it, and only on a desktop-width screen: it is a
  // tool for copying codes around at a desk, and a phone's link row is full.
  function addPasteLink() {
    if (!matchMedia("(min-width: 900px)").matches) return;
    editor.addLink("Paste a code", togglePasteBox);
  }

  function togglePasteBox() {
    const host = editor.el("host-footer");
    const open = host.querySelector(".cap-paste");
    if (open) return open.remove();
    const row = document.createElement("div");
    row.className = "cap-paste";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "Paste a player code or link";
    input.setAttribute("aria-label", "Player code or link");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Load";
    button.addEventListener("click", () => loadPasted(input));
    input.addEventListener("keydown", e => { if (e.key === "Enter") loadPasted(input); });
    row.append(input, button);
    host.appendChild(row);
    input.focus();
  }

  // Loaded as a NEW player, so whoever was on screen keeps their own entry,
  // and remembered straight away - the point is to have them back.
  function loadPasted(input) {
    const player = pastedPlayer(input.value);
    if (!player) return editor.status("That does not look like a player code");
    newPlayer();
    editEnabled();
    Object.assign(editor.params, player);
    editor.sync();
    PLAYERS.remember(playerId, CODE.encode(editor.params));
    queueSave(editor.params);
    refreshCardLink();
    input.value = "";
    editor.status("Loaded " + (player.name || "player") + " and saved to your players.");
  }

  // A bare code, or any link carrying one as ?p= (builder or card). A team
  // code is not a player, and says so by failing to load.
  function pastedPlayer(text) {
    let value = String(text || "").trim();
    if (value.indexOf("?") >= 0) {
      try {
        value = new URLSearchParams(value.slice(value.indexOf("?") + 1)).get(SHARE_KEY) || "";
      } catch (e) {
        return null;
      }
    }
    if (!value) return null;
    try {
      return CODE.load(value);
    } catch (e) {
      return null;
    }
  }

  // ---- a new player -----------------------------------------------------

  // Everything is saved as you go, which leaves one question unanswered: is
  // this edit changing the player I just built, or starting someone new? This
  // is the answer, and the only way to say "someone new" out loud. Randomize
  // also starts a new player, but nobody reaches for it to get a blank sheet.
  // The two controls about WHICH player you are on. They are buttons - they do
  // something - but they are not what you came to the page for, so they read as
  // links under the row that is.
  function addNewButton() {
    editor.addLink("New player", startNewPlayer);
  }

  // A fresh id first: the player on screen keeps its own gallery entry, and
  // everything typed from here lands in a new one.
  //
  // The build stays put. A team is twelve people in the same kit, and mixing
  // that colour again for every one of them is the work nobody wants; what
  // cannot carry over is who they are, so the name, number and catch-phrase go
  // back to blank and the rest is a starting point you can change or randomize.
  function startNewPlayer() {
    newPlayer();
    editEnabled();
    Object.assign(editor.params, { name: "", number: "", phrase: "" });
    editor.sync();
    queueSave(editor.params);
    refreshCardLink();
    editor.startNaming();
    editor.status("Saved. New player created.");
  }

  // Leaving the collapsed view a shared link opens in. Pressing New player
  // there means the same thing as pressing "Make your player": this is mine now.
  function editEnabled() {
    document.documentElement.classList.remove(SHARED);
    const collapsed = document.querySelector(".cap-edit");
    if (collapsed) collapsed.remove();
    keeping = true;
    dropShareParam();
  }

  // ---- the team ---------------------------------------------------------

  function addTeamButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Add to team";
    button.addEventListener("click", addToTeam);
    editor.el("host-actions").appendChild(button);
  }

  // Drops this player into the roster the Team Photo page reads. A goalie goes
  // to the goalie's spot; everyone else takes the first gap. The link to go and
  // look is only worth offering once there is something to look at.
  function addToTeam() {
    const team = TEAM.load();
    let spot;
    try {
      spot = TEAM.add(team, CODE.encode(editor.params));
    } catch (e) {
      return editor.status("Could not add that player");
    }
    if (spot < 0) return editor.status("Your team is full - open the team photo to edit");
    TEAM.save(team);
    const filled = team.players.filter(Boolean).length;
    editor.status("Added to the current team");
    showTeamLink();
  }

  // A real link in the markup, not a line of status text: it has to be
  // clickable, and it stays put once it is there.
  function showTeamLink() {
    const host = editor.el("host-footer");
    if (host.querySelector(".cap-team-link")) return;
    const link = document.createElement("a");
    link.className = "button cap-team-link";
    link.href = "/games/team-photo.html";
    link.textContent = "See the team photo";
    host.appendChild(link);
  }

  // ---- share links ------------------------------------------------------

  function addShareButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Share card";
    button.addEventListener("click", share);
    editor.el("host-actions").appendChild(button);
  }

  // What you want to send somebody is the card, not the control panel: the
  // builder opens on a stranger's player with every slider in front of them,
  // and the card is the player. The card page links back here to edit, so
  // nothing is lost by starting there.
  //
  // Percent escapes make a link look like spam and some chat clients stop
  // linkifying at one, so the two that free text actually produces are undone:
  // a space rides as "+" (URLSearchParams decodes that back to a space) and a
  // comma is legal in a query value as-is. A typed "+" still escapes to %2B and
  // survives the round trip.
  function shareUrl() {
    return location.origin + CARD_PATH + "?" + SHARE_KEY + "=" + shareCode();
  }

  // The phone's own share sheet. navigator.share only exists in a secure
  // context, so over plain http - a LAN IP while testing - there is no sheet
  // and the link is copied instead.
  function share() {
    const url = shareUrl();
    const who = editor.params.name ? editor.params.name + "'s hockey card" : "My hockey card";
    if (!navigator.share) return showLink(url);
    // Only title and url: some share targets use `text` and drop the url,
    // which would lose the player.
    navigator.share({ title: who, url: url })
      .catch(err => { if (err && err.name !== "AbortError") showLink(url); });
  }

  // No share sheet, so the link is copied. It is a link to another page now, so
  // the address bar is left alone - putting it there would make a reload leave
  // the builder. When the clipboard is refused as well, the link is shown in a
  // box you can select by hand.
  function showLink(url) {
    if (!navigator.clipboard) return showLinkBox(url);
    navigator.clipboard.writeText(url)
      .then(() => editor.status("Card link copied - paste it to a teammate"))
      .catch(() => showLinkBox(url));
  }

  function showLinkBox(url) {
    const host = editor.el("host-footer");
    let box = host.querySelector(".cap-link-box");
    if (!box) {
      box = document.createElement("input");
      box.type = "text";
      box.readOnly = true;
      box.className = "cap-link-box";
      box.setAttribute("aria-label", "Your card link");
      host.appendChild(box);
    }
    box.value = url;           // never innerHTML: this is built from typed text
    box.focus();
    box.select();
    editor.status("Copy the link below");
  }

  function loadShared(params) {
    const code = new URLSearchParams(location.search).get(SHARE_KEY);
    if (!code) return false;
    try {
      Object.assign(params, CODE.sanitize(CODE.decode(code)));
      return true;
    } catch (e) {
      return false;   // a mangled link just leaves the defaults in place
    }
  }

  // Someone arriving on a shared link came to see a player, not a control
  // panel, so the editor starts collapsed behind a button. The "build your own"
  // pitch goes with it — it is an instruction for a builder, and this visitor
  // is not one yet — and comes back if they decide to make their own.
  function collapseEditor() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button cap-edit";
    button.textContent = "Make your player";
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      newPlayer();
      editEnabled();
    });
    editor.el("host-footer").appendChild(button);
  }

  // Always, not just on a shared link: having built somebody, their card is
  // the thing you want to see. It sits in its own row under the stage rather
  // than lengthening a row of five buttons.
  //
  // The href is rebuilt on every change - a link carrying the code as it was
  // when the page loaded would quietly show an older player.
  function addCardLink() {
    cardLink = document.createElement("a");
    cardLink.className = "button cap-card-link";
    cardLink.textContent = "View hockey card";
    refreshCardLink();
    editor.el("host-actions").appendChild(cardLink);
  }

  function refreshCardLink() {
    if (cardLink) cardLink.href = CARD_PATH + "?" + SHARE_KEY + "=" + shareCode();
  }

  function shareCode() {
    return encodeURIComponent(CODE.encode(editor.params))
      .replace(/%20/g, "+").replace(/%2C/g, ",");
  }

  // From here on they are building their own player, not looking at someone
  // else's, so the code comes out of the address bar - a reload or a copied URL
  // should be their work. Any other param (?debug) is left alone.
  function dropShareParam() {
    const query = new URLSearchParams(location.search);
    query.delete(SHARE_KEY);
    query.delete(NEW_KEY);
    const rest = query.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
  }

  // The builder markup arrives with the partials, which main.js fetches after
  // this deferred script has already run.
  document.addEventListener("partials:ready", init);

})();
