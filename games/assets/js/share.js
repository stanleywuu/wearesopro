// Handing someone a link, on whatever the browser will do.
//
// Three rungs, best first: the system share sheet, then the clipboard, then a
// selectable box with the link in it. The last one always works, which is the
// point - navigator.share needs https and a gesture, and clipboard access can
// be refused.
//
// Shared by the builder's "Share card" and the hockey card's own button, so
// both behave the same and there is one place to fix when a browser changes
// its mind. No DOM of its own beyond the fallback box it is handed a host for.

(function () {

  // opts: { url, title, host, say }
  //   host - element the fallback box is appended to
  //   say  - called with a short message for the person (optional)
  function link(opts) {
    const url = opts.url;
    const say = opts.say || function () {};
    if (!navigator.share) return copy(url, opts, say);
    // Only title and url: some share targets use `text` and drop the url,
    // which would lose the player.
    navigator.share({ title: opts.title || document.title, url: url })
      .catch(function (err) {
        if (err && err.name !== "AbortError") copy(url, opts, say);
      });
  }

  function copy(url, opts, say) {
    if (!navigator.clipboard) return box(url, opts, say);
    navigator.clipboard.writeText(url)
      .then(function () { say("Link copied - paste it to a teammate"); })
      .catch(function () { box(url, opts, say); });
  }

  function box(url, opts, say) {
    const host = opts.host;
    if (!host) return say(url);
    let field = host.querySelector(".cap-link-box");
    if (!field) {
      field = document.createElement("input");
      field.type = "text";
      field.readOnly = true;
      field.className = "cap-link-box";
      field.setAttribute("aria-label", "Link to this card");
      host.appendChild(field);
    }
    field.value = url;         // never innerHTML: this is built from typed text
    field.focus();
    field.select();
    say("Copy the link below");
  }

  window.CAP_SHARE = { link: link };

})();
