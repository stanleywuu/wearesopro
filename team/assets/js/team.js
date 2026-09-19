// The Team pages. Codes come from team.data.js, and like any code they go
// through the codec's whitelist before anything draws them.
//
// Hub: every canvas[data-who] gets a still of that character.
// Profile: #card[data-who] gets its code as data-player, which card.js reads.
// This runs as a deferred script and card.js waits for partials:ready, so the
// attribute is always in place before the card looks for it.

(function () {

  const CODES = window.TEAM_CODES || {};
  const DRAW = window.CAP_DRAW, CODE = window.CAP_CODE;

  function fillProfile() {
    const card = document.getElementById("card");
    if (card && CODES[card.dataset.who]) card.dataset.player = CODES[card.dataset.who];
  }

  function drawTiles() {
    if (!DRAW || !CODE) return;
    document.querySelectorAll("canvas[data-who]").forEach(function (canvas) {
      const code = CODES[canvas.dataset.who];
      if (!code) return;
      canvas.width = DRAW.LW * DRAW.S;
      canvas.height = DRAW.LH * DRAW.S;
      try {
        DRAW.render(canvas.getContext("2d"), CODE.load(code), 0.5, null);
      } catch (e) {
        canvas.hidden = true;
      }
    });
  }

  fillProfile();
  drawTiles();

})();
