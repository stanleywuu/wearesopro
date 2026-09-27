// The numbers on the back of a hockey card.
//
// Invented, but never random: they are drawn from the player's own code (via
// CAP_SEED, shared with the highlight), so
// the same player shows the same season every time, on every device, with
// nothing stored anywhere. Change the player and you change the season, which
// is fair - it is a different player.
//
// Deliberately beer league. Nobody here is scoring forty.
//
// No DOM, no storage.

(function () {

  // Rows are [label, value] pairs - the card back lays them out, this decides
  // what they say.
  function forPlayer(params, code) {
    const next = window.CAP_SEED.stream(String(code || ""));
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
