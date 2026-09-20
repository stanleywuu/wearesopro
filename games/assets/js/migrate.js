// Stored data carries a version, and is brought up to date on the way in.
//
// Three things are kept on this device or in a file - the saved players, the
// team, and an exported backup - and each one stamps a `v`. When a shape
// changes, bump that store's VERSION and add one step: a function that takes
// the old shape and returns the next one. Old data is then upgraded silently
// the next time it is read, however many versions behind it is.
//
// Anything with no `v` at all is version 0: data written before versions were
// read, which is the original shape.
//
// No DOM, no storage of its own.

(function () {

  // steps[n] upgrades version n to version n+1. A gap stops the ladder: the
  // data is left as it is rather than half-upgraded into a shape nobody wrote.
  function upgrade(raw, version, steps) {
    if (!raw || typeof raw !== "object") return raw;
    let v = Number(raw.v) || 0;
    // From the future: a file written by a newer version of the site. Handing
    // it to a cleaner that has never seen its shape would quietly drop whatever
    // is new, so the caller is told instead.
    if (v > version) return { v: v, ahead: true };
    while (v < version) {
      const step = steps && steps[v];
      if (!step) break;
      raw = step(raw);
      v += 1;
    }
    raw.v = version;
    return raw;
  }

  // True for what upgrade() hands back when the data is newer than this site.
  function ahead(raw) {
    return Boolean(raw && raw.ahead);
  }

  window.CAP_MIGRATE = { upgrade: upgrade, ahead: ahead };

})();
