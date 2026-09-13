// Hockey card: one player, and where the photo would be, their highlight.
//
// The reel itself is the builder's, lifted out of CAP_EDITOR so the card does
// not need a builder mounted just to play it. Same timeline, same renderer.

(function () {

  const DRAW = window.CAP_DRAW, CODE = window.CAP_CODE;
  const SHARE_KEY = "p";
  const SIDE_ON = Math.PI / 2;
  const CLASSIC = { glide: 1200, wind: 1800, contact: 2000, land: 2500, end: 3600 };
  const SAVES = [
    { at: 1000, kind: "drop", hold: 300 },
    { at: 1620, kind: "blocker", hold: 260 },
    { at: 2240, kind: "glove", hold: 520 }
  ];
  const APPROACH = 300, DEFLECT = 260;
  const REPLAY_GAP = 900;      // a beat on the last frame before it loops

  let params = null;
  let reel = null;
  let canvas, ctx;
  let start = 0;

  function init() {
    canvas = document.getElementById("card-canvas");
    if (!canvas || !DRAW || !CODE) return;
    params = readPlayer();
    if (!params) return showEmpty();

    canvas.width = DRAW.LW * DRAW.S;
    canvas.height = DRAW.LH * DRAW.S;
    ctx = canvas.getContext("2d");

    fillPlate();
    document.getElementById("card-replay").addEventListener("click", play);
    document.getElementById("card-edit").href =
      "/games/create-a-player.html?" + SHARE_KEY + "=" + shareCode();
    play();
    requestAnimationFrame(frame);
  }

  // The code in the URL is untrusted like any other, so it goes through the
  // codec's whitelist before anything draws it.
  function readPlayer() {
    const code = new URLSearchParams(location.search).get(SHARE_KEY);
    if (!code) return null;
    try {
      return CODE.load(code);
    } catch (e) {
      return null;
    }
  }

  function shareCode() {
    return encodeURIComponent(CODE.encode(params)).replace(/%20/g, "+").replace(/%2C/g, ",");
  }

  // All of it user text, so textContent throughout.
  function fillPlate() {
    set("card-name", params.name || "Unnamed");
    set("card-number", params.number ? "#" + params.number : "");
    set("card-pos", params.position);
    set("card-quote", params.phrase ? "“" + params.phrase + "”" : "");
  }

  function set(id, text) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.hidden = !text;
  }

  function showEmpty() {
    document.getElementById("card").hidden = true;
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "No player in this link. Build one and share it to get a card.";
    document.querySelector(".card-stage").insertBefore(note, document.querySelector(".card-actions"));
  }

  // ---- the reel ---------------------------------------------------------

  function play() {
    reel = buildReel();
    start = performance.now();
  }

  function buildReel() {
    if (params.position === "Goalie") {
      return { save: true, yaw: 0, label: "Robbed!", end: 4000, home: 0 };
    }
    if (params.position !== "Defence") {
      return Object.assign({ slap: false, home: 0, yaw: SIDE_ON }, CLASSIC);
    }
    // A card is an object you look at, so the shooter stays in frame: the
    // slapshot windup, but none of the travelling camera the builder uses -
    // that carries him off the left edge and leaves a card showing empty ice.
    const speed = 55 + Math.round(Math.random() * 25);
    const contact = 2300;
    return {
      slap: true, yaw: SIDE_ON, label: speed + " mph!!", home: -14,
      glide: 1200, wind: 1800, hold: 2010, contact: contact,
      land: contact + 620, end: contact + 1900
    };
  }

  function frame(now) {
    const ms = now - start;
    const anim = ms < reel.end ? at(ms) : lastFrame();
    if (ms > reel.end + REPLAY_GAP) return play(), requestAnimationFrame(frame);
    DRAW.render(ctx, params, anim ? reel.yaw : 0.5, anim);
    requestAnimationFrame(frame);
  }

  // Held on the closing frame rather than snapping back to an idle player,
  // so the card reads as a card between loops.
  function lastFrame() {
    return at(reel.end - 1);
  }

  function at(ms) {
    const anim = {
      shift: 0, crouch: 0, swing: 0, lift: 0, puckT: null, goal: false,
      pan: 0, arc: reel.slap ? 15 : 9, net: 1, label: reel.label
    };
    if (ms < reel.glide) {
      const t = ms / reel.glide;
      anim.shift = reel.home - 55 * (1 - t * t * (3 - 2 * t));
      anim.crouch = 0.35 * t;
    } else {
      anim.shift = reel.home;
      anim.crouch = 0.35;
    }
    if (reel.save) return goalieFrame(ms, anim);
    if (reel.slap) slapAt(ms, anim);
    else wristAt(ms, anim);
    if (ms >= reel.contact) {
      anim.puckT = Math.min(1, (ms - reel.contact) / (reel.land - reel.contact));
    }
    anim.goal = ms >= reel.land;
    return anim;
  }

  function goalieFrame(ms, anim) {
    const pose = { drop: 0, blocker: 0, glove: 0 };
    SAVES.forEach(function (save) {
      pose[save.kind] = Math.max(pose[save.kind], envelope(ms, save.at, save.hold));
    });
    anim.save = true;
    anim.rest = true;
    anim.netBehind = true;
    anim.drop = pose.drop;
    anim.blocker = pose.blocker;
    anim.glove = pose.glove;
    anim.shot = shotAt(ms);
    anim.crouch = 0;
    anim.goal = ms >= SAVES[2].at + SAVES[2].hold;
    return anim;
  }

  function envelope(ms, at, hold) {
    if (ms < at - 90 || ms > at + hold + 280) return 0;
    if (ms < at) return (ms - (at - 90)) / 90;
    if (ms <= at + hold) return 1;
    return 1 - (ms - at - hold) / 280;
  }

  function shotAt(ms) {
    let out = null;
    SAVES.forEach(function (save) {
      const from = save.at - APPROACH, to = save.at + DEFLECT;
      if (ms >= from && ms <= to) out = { kind: save.kind, t: (ms - from) / (to - from) };
    });
    return out;
  }

  function slapAt(ms, anim) {
    if (ms >= reel.glide && ms < reel.wind) {
      const t = (ms - reel.glide) / (reel.wind - reel.glide);
      anim.crouch = 0.35 + 0.5 * t;
      anim.lift = 2.6 * t;
    } else if (ms >= reel.wind && ms < reel.hold) {
      anim.crouch = 0.85;
      anim.lift = 2.6;
    } else if (ms >= reel.hold && ms < reel.contact) {
      const t = (ms - reel.hold) / (reel.contact - reel.hold);
      anim.crouch = 0.85 + 0.15 * t;
      anim.lift = 2.6 * (1 - t * t);
    } else if (ms >= reel.contact) {
      const t = Math.min(1, (ms - reel.contact) / 420);
      anim.crouch = 1 - 0.5 * t;
      anim.lift = -1.8 * t;
      anim.swing = 0.5 * t;
    }
  }

  function wristAt(ms, anim) {
    if (ms >= reel.glide && ms < reel.wind) {
      const t = (ms - reel.glide) / (reel.wind - reel.glide);
      anim.crouch = 0.35 + 0.65 * t;
      anim.swing = -1.15 * t;
    } else if (ms >= reel.wind && ms < reel.contact) {
      const t = (ms - reel.wind) / (reel.contact - reel.wind);
      anim.crouch = 1;
      anim.swing = -1.15 + 2.5 * t;
    } else if (ms >= reel.contact) {
      const t = Math.min(1, (ms - reel.contact) / 900);
      anim.crouch = 1 - 0.8 * t;
      anim.swing = 1.35;
    }
  }

  document.addEventListener("partials:ready", init);

})();
