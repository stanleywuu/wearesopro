// Create-a-Player page controller. The builder itself is CAP_EDITOR, mounted on
// the partial this page includes; everything here is about the *page* - quiet
// autosave, ?p= share links, and the collapsed view a shared link opens in.

(function () {

  const CODE = window.CAP_CODE, EDITOR = window.CAP_EDITOR;
  const TEAM = window.CAP_TEAM, PLAYERS = window.CAP_PLAYERS;
  const GALLERY = window.CAP_GALLERY;

  const STORE_KEY = "cap-player";
  const SHARE_KEY = "p";
  const SAVE_DELAY = 700;
  const SHARED = "cap-shared";

  // Set now, not on partials:ready. The builder's markup arrives with the
  // includes, and collapsing it after that has already been painted is what
  // made the canvas visibly jump. On the document element the rule is waiting
  // before the markup it applies to exists.
  if (new URLSearchParams(location.search).has(SHARE_KEY)) {
    document.documentElement.classList.add(SHARED);
  }

  let editor = null;
  let saveTimer = 0;
  let playerId = null;       // which gallery entry this player is
  let started = false;       // the mount fires one change of its own; ignore it
  let keeping = true;        // false while looking at somebody else's player

  function init() {
    const root = document.querySelector(".cap-wrap");
    if (!root || !CODE || !EDITOR || !TEAM || !PLAYERS || !GALLERY) return;

    const params = CODE.defaults();
    loadSaved(params);
    const fromLink = loadShared(params);

    playerId = PLAYERS.newId();
    keeping = !fromLink;     // looking at a shared player is not building one
    editor = EDITOR.mount(root, params, { onChange: onChange, onNew: newPlayer });
    if (!editor) return;

    addShareButton();
    addTeamButton();
    addGalleryButton(root);
    if (fromLink) collapseEditor();
  }

  // ---- save -------------------------------------------------------------

  // Everything you build is kept, without a Save button. Two things stop the
  // gallery filling with noise: the mount's own opening change does not count,
  // and neither does a shared player you have only looked at.
  function onChange(params) {
    queueSave(params);
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
      if (raw) Object.assign(params, CODE.sanitize(JSON.parse(raw)));
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Saved players";
    button.addEventListener("click", () => GALLERY.open({
      into: root,
      title: "Your saved players",
      canDelete: true,
      onPick: openSaved,
      onStatus: editor.status
    }));
    editor.el("host-actions").appendChild(button);
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
    button.textContent = "Share";
    button.addEventListener("click", share);
    editor.el("host-actions").appendChild(button);
  }

  // Percent escapes make a link look like spam and some chat clients stop
  // linkifying at one, so the two that free text actually produces are undone:
  // a space rides as "+" (URLSearchParams decodes that back to a space) and a
  // comma is legal in a query value as-is. A typed "+" still escapes to %2B and
  // survives the round trip.
  function shareUrl() {
    return location.origin + location.pathname + "?" + SHARE_KEY + "=" + shareCode();
  }

  // The phone's own share sheet. navigator.share only exists in a secure
  // context, so over plain http — a LAN IP while testing — there is no sheet
  // and the link is written into the address bar instead.
  function share() {
    const url = shareUrl();
    if (!navigator.share) return showLink(url);
    // Only title and url: some share targets use `text` and drop the url,
    // which would lose the player.
    navigator.share({ title: "Create A Player", url: url })
      .catch(err => { if (err && err.name !== "AbortError") showLink(url); });
  }

  // No share sheet, so the link is copied instead. It also goes into the address
  // bar either way: that is the fallback when the clipboard is refused, and it
  // costs nothing when the copy works. Actually loading the URL would reload the
  // whole page and flicker for no gain, so only the address bar changes.
  function showLink(url) {
    history.replaceState(null, "", url);
    if (!navigator.clipboard) return editor.status("Link ready - copy it from the address bar");
    navigator.clipboard.writeText(url)
      .then(() => editor.status("Link copied - paste it to a teammate"))
      .catch(() => editor.status("Link ready - copy it from the address bar"));
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
    button.textContent = "Make it your own";
    button.setAttribute("aria-expanded", "false");
    addCardLink();
    button.addEventListener("click", () => {
      document.documentElement.classList.remove(SHARED);
      button.remove();
      keeping = true;
      newPlayer();
      dropShareParam();
    });
    editor.el("host-footer").appendChild(button);
  }

  // The card is the best thing to do with somebody else's player, so on a
  // shared link it is the highlighted action - ahead of building your own.
  function addCardLink() {
    const link = document.createElement("a");
    link.className = "button cap-card-link";
    link.href = "/games/card.html?" + SHARE_KEY + "=" + shareCode();
    link.textContent = "View hockey card";
    editor.el("host-footer").appendChild(link);
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
    const rest = query.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
  }

  // The builder markup arrives with the partials, which main.js fetches after
  // this deferred script has already run.
  document.addEventListener("partials:ready", init);

})();
