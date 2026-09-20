// The team roster: what it is, where it is kept, and the shape of it.
//
// Shared by the Team Photo page and by the "Add to team" button on Create A
// Player, so there is one definition of a roster and one validation path into
// it. Nothing in here draws or touches the DOM.

(function () {

  const CODE = window.CAP_CODE;
  if (!CODE) return;

  const STORE_KEY = "cap-team";
  const VERSION = 1;
  const STEPS = {};          // see player-store.js: one step per shape change
  const MIN_SIZE = 6, MAX_SIZE = 16, DEFAULT_SIZE = 12;

  function blank(size) {
    const n = size || DEFAULT_SIZE;
    return { v: 1, name: "", sub: "", size: n, players: new Array(n).fill(null) };
  }

  // Anything out of storage or off a link is untrusted: the size is clamped,
  // the text capped, and every player code re-validated by the codec.
  function clean(raw) {
    const out = blank();
    if (!raw || typeof raw !== "object") return out;
    out.name = typeof raw.name === "string" ? raw.name.slice(0, 24) : "";
    out.sub = typeof raw.sub === "string" ? raw.sub.slice(0, 32) : "";
    const size = Math.round(Number(raw.size));
    out.size = Number.isFinite(size) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)) : DEFAULT_SIZE;
    const list = Array.isArray(raw.players) ? raw.players : [];
    out.players = new Array(out.size).fill(null).map(function (_, i) { return validCode(list[i]); });
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

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return clean(current(raw ? JSON.parse(raw) : null));
    } catch (e) {
      return blank();        // blocked or corrupt storage starts empty
    }
  }

  function current(raw) {
    const MIGRATE = window.CAP_MIGRATE;
    if (!MIGRATE) return raw;
    const up = MIGRATE.upgrade(raw, VERSION, STEPS);
    return MIGRATE.ahead(up) ? null : up;    // a team from a newer site is not ours to rewrite
  }

  function save(team) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(team));
    } catch (e) {
      // Storage blocked or full; the team simply will not persist.
    }
  }

  function playerAt(team, i) {
    const code = team.players[i];
    if (!code) return null;
    try {
      return CODE.load(code);
    } catch (e) {
      return null;
    }
  }

  // ---- roster shape -----------------------------------------------------

  // The front row always holds an odd number, because the middle of the front
  // row is the goalie's spot and a row with an even count has no middle.
  function frontCount(size) {
    const half = Math.floor(size / 2);
    return Math.min(size - 1, half % 2 === 0 ? half + 1 : half);
  }

  // Front row, dead centre. Every team picture ever taken.
  function goalieIndex(size) {
    const front = frontCount(size);
    return (size - front) + (front - 1) / 2;
  }

  // Drops a player into the roster. A goalie goes to the goalie's spot when it
  // is free, everyone else takes the first gap. Returns the slot, or -1 when
  // there is nowhere to put them.
  function add(team, code) {
    const player = CODE.load(code);          // throws on a code that will not parse
    const goalie = goalieIndex(team.size);
    if (player.position === "Goalie" && !team.players[goalie]) {
      team.players[goalie] = code;
      return goalie;
    }
    const spot = team.players.indexOf(null);
    if (spot < 0) return -1;
    team.players[spot] = code;
    return spot;
  }

  window.CAP_TEAM = {
    KEY: STORE_KEY,
    MIN_SIZE: MIN_SIZE,
    MAX_SIZE: MAX_SIZE,
    DEFAULT_SIZE: DEFAULT_SIZE,
    blank: blank,
    clean: clean,
    validCode: validCode,
    load: load,
    save: save,
    playerAt: playerAt,
    frontCount: frontCount,
    goalieIndex: goalieIndex,
    add: add
  };

})();
