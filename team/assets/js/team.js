// The Team pages. Codes come from team.data.js, and like any code they go
// through the codec's whitelist before anything draws them.
//
// Hub: every canvas[data-who] gets a still of that character.
// Profile: #card[data-who] gets its code as data-player, which card.js reads.
// This runs as a deferred script and card.js waits for partials:ready, so the
// attribute is always in place before the card looks for it.

(function () {

  const CODES = window.TEAM_CODES || {};
  const POSES = window.TEAM_POSES || {};
  const DRAW = window.CAP_DRAW, CODE = window.CAP_CODE, REEL = window.CAP_REEL;

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
        const params = CODE.load(code);
        DRAW.render(canvas.getContext("2d"), params, yaw(params), pose(params, canvas.dataset.who));
      } catch (e) {
        canvas.hidden = true;
      }
    });
  }

  // One frame of their own Highlight, so the line-up is five different
  // players doing five different things. No pose, no reel: they stand there.
  function pose(params, who) {
    if (!REEL || !POSES[who]) return null;
    return REEL.at(REEL.build(params), POSES[who]);
  }

  // The reel plays side on; an idle player reads better at three quarters.
  function yaw(params) {
    const reel = REEL && REEL.build(params);
    return reel ? reel.yaw : 0.5;
  }

  fillProfile();
  drawTiles();

})();
