// The numbers on the back of a hockey card.
//
// Invented, but never random: they are hashed out of the player's own code, so
// the same player shows the same season every time, on every device, with
// nothing stored anywhere. Change the player and you change the season, which
// is fair - it is a different player.
//
// Deliberately beer league. Nobody here is scoring forty.
//
// No DOM, no storage.

(function () {

  // Any string to a 32-bit number. Small, stable, and not a security thing -
  // it only has to spread codes evenly across seasons.
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // One seed, then a stream of numbers from it, so the fields stay in step
  // with each other rather than each hashing the code separately.
  function stream(seed) {
    let s = seed || 1;
    return function (min, max) {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return min + (s % (max - min + 1));
    };
  }

  // Rows are [label, value] pairs - the card back lays them out, this decides
  // what they say.
  function forPlayer(params, code) {
    const next = stream(hash(String(code || "")));
    const games = next(18, 42);
    if (params.position === "Goalie") {
      const wins = next(2, Math.max(2, games - 6));
      const pct = (next(830, 915) / 1000).toFixed(3).slice(1);   // .871
      return [
        ["GP", games], ["W", wins], ["L", games - wins], ["SV%", pct]
      ];
    }
    // A beer league forward is mostly assists and penalty minutes.
    const goals = next(1, Math.round(games * 0.45));
    const assists = next(1, Math.round(games * 0.6));
    return [
      ["GP", games], ["G", goals], ["A", assists],
      ["PTS", goals + assists], ["PIM", next(0, 34)]
    ];
  }

  window.CAP_STATS = { forPlayer: forPlayer };

})();
