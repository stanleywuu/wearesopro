// Create-a-Player page controller. The builder itself is CAP_EDITOR, mounted on
// the partial this page includes; everything here is about the *page* - quiet
// autosave, ?p= share links, and the collapsed view a shared link opens in.

(function () {

  const CODE = window.CAP_CODE, EDITOR = window.CAP_EDITOR;

  const STORE_KEY = "cap-player";
  const SHARE_KEY = "p";
  const SAVE_DELAY = 700;

  let editor = null;
  let saveTimer = 0;

  function init() {
    const root = document.querySelector(".cap-wrap");
    if (!root || !CODE || !EDITOR) return;

    const params = CODE.defaults();
    loadSaved(params);
    const fromLink = loadShared(params);

    editor = EDITOR.mount(root, params, { onChange: queueSave });
    if (!editor) return;

    addShareButton();
    if (fromLink) collapseEditor();
  }

  // ---- save -------------------------------------------------------------

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
    const code = encodeURIComponent(CODE.encode(editor.params))
      .replace(/%20/g, "+").replace(/%2C/g, ",");
    return location.origin + location.pathname + "?" + SHARE_KEY + "=" + code;
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
    const controls = editor.el("controls");
    const panel = editor.el("editor");
    const intro = document.getElementById("cap-intro");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button cap-edit";
    button.textContent = "Make it your own";
    button.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    intro.hidden = true;
    controls.classList.add("collapsed");
    button.addEventListener("click", () => {
      panel.hidden = false;
      intro.hidden = false;
      controls.classList.remove("collapsed");
      button.remove();
      dropShareParam();
    });
    editor.el("host-footer").appendChild(button);
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
