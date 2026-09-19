// Share-card generator. Nothing is retyped here: the look comes from
// TEAM_CODES (team.data.js) and the words come from the page the card is for,
// so a card can never disagree with its own page.
//
//   /tools/ogcards/card.html?who=dale   one player
//   /tools/ogcards/card.html?who=team   the whole line-up
//
// Screenshot it at 1200x630 - see docs/page-metadata.md.

(function () {

  const PAGE = { team: "/team.html" };   // anyone else: /team/<who>.html

  function pageFor(who) {
    return PAGE[who] || "/team/" + who + ".html";
  }

  // The heading and the line under it, straight out of the live page.
  async function words(who) {
    const html = await (await fetch(pageFor(who))).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const main = doc.querySelector("main");
    return {
      name: main.querySelector("h1").textContent.trim(),
      tag: (main.querySelector("p.muted") || {}).textContent.trim()
    };
  }

  function draw(canvas, code) {
    canvas.width = CAP_DRAW.LW * CAP_DRAW.S;
    canvas.height = CAP_DRAW.LH * CAP_DRAW.S;
    CAP_DRAW.render(canvas.getContext("2d"), CAP_CODE.load(code), 0.5, null, { background: false });
  }

  async function build() {
    const who = new URLSearchParams(location.search).get("who") || "team";
    const said = await words(who);
    document.getElementById("who-name").textContent = said.name;
    document.getElementById("who-tag").textContent = said.tag;

    const art = document.querySelector(".art");
    if (who !== "team") return draw(document.getElementById("who-canvas"), TEAM_CODES[who]);

    document.querySelector(".card").classList.add("is-group");
    art.className = "group";
    art.innerHTML = "";        // the single-player canvas is not part of a line-up
    Object.keys(TEAM_CODES).forEach(function (k) {
      const c = document.createElement("canvas");
      art.appendChild(c);
      draw(c, TEAM_CODES[k]);
    });
  }

  document.addEventListener("DOMContentLoaded", build);

})();
