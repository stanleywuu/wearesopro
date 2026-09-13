// Everyone you have built on this device.
//
// Saved automatically as you work rather than behind a Save button, so the
// rule that matters is what counts as ONE player: entries are keyed by a
// session id the builder mints when you start someone new, and editing just
// updates that entry. Without that you get a fresh row per keystroke.
//
// No DOM, no drawing. Storage only.

(function () {

  const CODE = window.CAP_CODE;
  if (!CODE) return;

  const STORE_KEY = "cap-players";
  const LIMIT = 24;            // newest first; the tail falls off the end

  function blank() {
    return { v: 1, players: [] };
  }

  // Anything out of storage is untrusted: every code has to survive the codec
  // round trip, and anything that does not is dropped rather than repaired.
  function clean(raw) {
    const out = blank();
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.players)) return out;
    raw.players.forEach(function (entry) {
      if (!entry || typeof entry !== "object") return;
      const code = valid(entry.code);
      const id = typeof entry.id === "string" ? entry.id.slice(0, 40) : "";
      if (code && id && out.players.length < LIMIT) {
        out.players.push({ id: id, code: code, at: Number(entry.at) || 0 });
      }
    });
    return out;
  }

  function valid(code) {
    if (typeof code !== "string" || !code) return null;
    try {
      return CODE.encode(CODE.load(code));
    } catch (e) {
      return null;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return clean(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return blank();
    }
  }

  function save(store) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      // Blocked or full. Nothing persists, and nothing breaks.
    }
  }

  function list() {
    return load().players;
  }

  // Upsert by id, moved to the front. Same player edited twice is still one
  // player; a genuinely new id is a new row.
  function remember(id, code) {
    const kept = valid(code);
    if (!id || !kept) return;
    const store = load();
    const rest = store.players.filter(function (p) { return p.id !== id; });
    store.players = [{ id: id, code: kept, at: Date.now() }].concat(rest).slice(0, LIMIT);
    save(store);
  }

  function forget(id) {
    const store = load();
    store.players = store.players.filter(function (p) { return p.id !== id; });
    save(store);
  }

  // Ids only have to be unique on one device, so time plus a little noise is
  // plenty and avoids pulling in anything to generate them.
  function newId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  window.CAP_PLAYERS = {
    KEY: STORE_KEY,
    LIMIT: LIMIT,
    list: list,
    remember: remember,
    forget: forget,
    newId: newId
  };

})();
