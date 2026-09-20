// Everything on this device, in one file.
//
// Players and teams live in localStorage, which is per-browser: clearing it
// loses them and there is no way to carry them to a phone. Export writes the
// saved players and the current team out; Import reads them back.
//
// A file off someone's disk is untrusted like a pasted link, so every player
// code is re-validated by the codec and the team by CAP_TEAM.clean before any
// of it is kept. No DOM beyond the anchor a download needs and the hidden file
// input a pick needs.

(function () {

  const CODE = window.CAP_CODE, TEAM = window.CAP_TEAM, PLAYERS = window.CAP_PLAYERS;
  const MIGRATE = window.CAP_MIGRATE;
  if (!CODE || !TEAM || !PLAYERS) return;

  const APP = "we-are-so-pro";
  const KIND = "cap-backup";
  const VERSION = 1;
  const STEPS = {};          // steps[n] upgrades a version n file to n+1

  // ---- export -----------------------------------------------------------

  function build() {
    return {
      app: APP,
      kind: KIND,
      v: VERSION,
      at: new Date().toISOString(),
      players: PLAYERS.list(),
      team: TEAM.load()
    };
  }

  // Returns what went in the file, so the caller can say how much that was.
  function download() {
    const data = build();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return { players: data.players.length, team: data.team.players.filter(Boolean).length };
  }

  function fileName() {
    return APP + "-" + new Date().toISOString().slice(0, 10) + ".json";
  }

  // ---- import -----------------------------------------------------------

  // The browser's own file picker. Nothing is put in the page: the input is
  // created, clicked and dropped.
  function pick(done) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (file) read(file, done);
    });
    input.click();
  }

  function read(file, done) {
    const reader = new FileReader();
    reader.onload = function () {
      let data = null;
      try {
        data = parse(String(reader.result));
      } catch (e) {
        return done({ ok: false, message: e && e.message === "newer"
          ? "That backup was made by a newer version of this site. Reload the page and try again."
          : "That file is not a We Are So Pro backup" });
      }
      done(merge(data));
    };
    reader.onerror = function () {
      done({ ok: false, message: "Could not read that file" });
    };
    reader.readAsText(file);
  }

  // An old file is upgraded to today's shape before anything reads it. A file
  // from a NEWER version of the site is refused outright: merging it through a
  // cleaner that predates its shape would drop whatever is new, silently, and
  // the person would think their backup had been restored.
  function parse(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || raw.kind !== KIND) throw new Error("not a backup");
    if (!MIGRATE) return raw;
    const up = MIGRATE.upgrade(raw, VERSION, STEPS);
    if (MIGRATE.ahead(up)) throw new Error("newer");
    return up;
  }

  // Adding, never replacing: anyone already here stays, and a code that is
  // already saved is not saved twice - re-importing the same file changes
  // nothing. The team is the exception and is handled by the caller, since
  // there is only one of it and restoring means overwriting.
  function merge(raw) {
    const have = PLAYERS.list();
    const seen = {};
    have.forEach(function (p) { seen[p.code] = true; });
    const taken = {};
    have.forEach(function (p) { taken[p.id] = true; });

    let added = 0, skipped = 0;
    const list = Array.isArray(raw.players) ? raw.players : [];
    list.forEach(function (entry) {
      const code = entry && TEAM.validCode(entry.code);
      if (!code) return;
      if (seen[code]) return skipped++;
      const id = (typeof entry.id === "string" && !taken[entry.id]) ? entry.id : PLAYERS.newId();
      PLAYERS.remember(id, code);
      seen[code] = true;
      taken[id] = true;
      added++;
    });

    const team = raw.team ? TEAM.clean(raw.team) : null;
    const size = team ? team.players.filter(Boolean).length : 0;
    return {
      ok: true,
      added: added,
      skipped: skipped,
      team: size ? team : null,
      teamSize: size,
      message: report(added, skipped)
    };
  }

  function report(added, skipped) {
    if (!added && !skipped) return "Nothing in that file to add";
    if (!added) return "Already had all " + skipped + " of those players";
    return "Added " + added + " player" + (added === 1 ? "" : "s")
      + (skipped ? ", " + skipped + " already here" : "");
  }

  // Restoring a team overwrites the one on this device, so nothing calls this
  // without asking first.
  function restoreTeam(team) {
    TEAM.save(TEAM.clean(team));
  }

  window.CAP_BACKUP = {
    build: build,
    download: download,
    pick: pick,
    read: read,
    restoreTeam: restoreTeam
  };

})();
