// The Highlight: one timeline, played by the builder and by every hockey card.
// No DOM, no drawing - build(params) picks the shot, at(reel, ms) says where
// everything is at that moment, and CAP_DRAW.render draws it. There is exactly
// one copy on purpose: the card used to keep its own, and it drifted.
//
// Which highlight a player gets is rolled off their own share code, not off
// Math.random: the reel a shared card plays is the reel the builder showed, and
// a replay plays the same one. Change the player and you change the highlight,
// which is fair - it is a different player.

(function () {

  // Not dead side-on: a pure profile hides the body width, the head shape and
  // the front of the kit, so every player's highlight looks like the same
  // silhouette. Turned a little towards us, they still face the net.
  const SIDE_ON = 1.25;          // radians, about 72 degrees

  // The wrist shot every other position plays, unchanged.
  const CLASSIC = { glide: 1200, wind: 1800, contact: 2000, land: 2500, end: 3600 };

  const SKATER = ["shot", "wipeout", "spin"];
  const GOALIE = ["saves", "scramble"];

  // A goalie does not take the highlight, he is the highlight: leaning on his
  // stick in front of the net, then three saves in a row with no warning.
  const SAVES = [
    { at: 1000, kind: "drop",    hold: 300 },
    { at: 1620, kind: "blocker", hold: 260 },
    { at: 2240, kind: "glove",   hold: 520 }
  ];
  // The other one: a scramble. Five in on him with no gaps, and he is pushing
  // across the crease between them - x is where in the crease each save happens.
  const SCRAMBLE = [
    { at: 520,  kind: "blocker", hold: 140, x: 12 },
    { at: 940,  kind: "drop",    hold: 160, x: -4 },
    { at: 1320, kind: "glove",   hold: 150, x: -14 },
    { at: 1720, kind: "drop",    hold: 170, x: 6 },
    { at: 2140, kind: "glove",   hold: 700, x: 14 }   // and he holds this one up
  ];

  // ---- the seed ---------------------------------------------------------

  // Any string to a 32-bit number - the same small hash the card's stats use.
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // One seed, then a stream of whole numbers from it. The draws happen in a
  // fixed order (kind first, then whatever that reel needs), so adding a roll
  // to one reel cannot change another player's highlight.
  function stream(seed) {
    let s = seed || 1;
    return function (min, max) {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return min + (s % (max - min + 1));
    };
  }

  function seedText(params, code) {
    if (code) return String(code);
    try { return window.CAP_CODE.encode(params); } catch (e) { return "1"; }
  }

  // ---- which highlight -------------------------------------------------

  // kind forces one, which is what ?debug=reel&kind=wipeout uses.
  function build(params, code, kind) {
    const next = stream(hash(seedText(params, code)));
    if (params.position === "Goalie") {
      return goalieReel(kind || GOALIE[next(0, GOALIE.length - 1)]);
    }
    const pick = kind || SKATER[next(0, SKATER.length - 1)];
    if (pick === "wipeout") return wipeoutReel(params);
    if (pick === "spin") return spinReel(params);
    return shotReel(params, next);
  }

  // A defenceman winds up and slaps it. The speed is rolled FIRST, because it
  // is what decides everything after contact: a harder shot is in the air for
  // less time, and the number on the end is the same number.
  function shotReel(params, next) {
    // A left-handed forward shoots across his body from the camera's side, and
    // the stick ends up behind him. Nothing in the pose is wrong - the view is.
    // Mirroring the scene puts the stick back out front, shooting the other way.
    if (params.position !== "Defence") {
      return Object.assign({ kind: "shot", slap: false, home: 0, yaw: SIDE_ON,
        mirror: params.handedness === "left" }, CLASSIC);
    }
    // Beer league. Nobody here is breaking 80.
    const speed = next(55, 80);
    const contact = 2300;
    // It is a long way from the point: 55mph spends over two seconds in the
    // air, 80mph about a second and a half.
    const flight = Math.round(120000 / speed);
    return {
      kind: "shot",
      slap: true,
      yaw: SIDE_ON,
      label: speed + " mph!!",
      home: -55,                 // out by the left boards, where a point shot comes from
      glide: 1200,
      wind: 1800,
      hold: 2010,                // a beat at the top, or the windup flashes by
      contact: contact,
      panFrom: contact + 320,    // long enough to see the follow-through first
      panTo: contact + Math.round(flight * 0.5),
      netIn: contact + Math.round(flight * 0.7),
      netSet: contact + Math.round(flight * 0.9),
      land: contact + flight,
      end: contact + flight + 1300
    };
  }

  // Loses an edge. He never stops: the skate goes while he is still moving, he
  // goes over travelling, and he slides on his back until friction takes it -
  // so there is no glide-stop-fall in it anywhere. No net in this one either:
  // nothing is going in.
  function wipeoutReel(params) {
    return {
      kind: "wipeout",
      yaw: SIDE_ON,
      mirror: params.handedness === "left",
      label: "Wipeout!",
      home: 0,
      glide: 1,                  // no glide phase - he is moving from frame one
      speed: 0.06,               // units per ms, carried right through the fall
      from: -62,                 // coming in from the corner
      catch: 700,                // the skate catches
      down: 1350,                // shoulder hits the ice
      stop: 2250,                // friction has it
      end: 2550                  // long enough to read the word, and out
    };
  }

  // Spin-o-rama: he turns the whole way round coming in and shoots straight out
  // of it. The pull-back rides the last of the turn rather than waiting for it -
  // spin, stop, wait, shoot is four moves where there should be one.
  function spinReel(params) {
    return { kind: "spin", slap: false, home: 0, yaw: SIDE_ON,
      mirror: params.handedness === "left", label: "Filthy!",
      glide: 900, spin: 1150,    // the turn
      wind: 300,                 // the stick starts back a quarter of the way round
      pull: 750,                 // loaded, and still turning
      contact: 950,              // gone with a quarter of the turn still to come
      land: 1450, end: 2600 };
  }

  function goalieReel(kind) {
    // Face on, not side on: a goalie is looked at down the ice, with the net
    // behind him and the blocker and glove out to either side of frame.
    if (kind === "scramble") {
      return { kind: "scramble", save: true, yaw: 0, label: "Unreal!!",
        saves: SCRAMBLE, approach: 260, deflect: 180, slide: true,
        end: 3300, home: 0 };
    }
    return { kind: "saves", save: true, yaw: 0, label: "Robbed!",
      saves: SAVES, approach: 300, deflect: 260, end: 4000, home: 0 };
  }

  // ---- the timeline ----------------------------------------------------

  // The whole reel as a function of elapsed time. Returns null once finished.
  function at(reel, ms) {
    if (!reel || ms >= reel.end) return null;
    const anim = {
      shift: 0, crouch: 0, swing: 0, lift: 0, fall: 0,
      puckT: null, goal: false, pan: 0,
      arc: 9, net: 1, label: reel.label, yaw: reel.yaw,
      mirror: Boolean(reel.mirror), boards: reel.boards !== false,
      puckHold: Boolean(reel.slap), netClose: Boolean(reel.slap)
    };
    if (ms < reel.glide) {
      const t = ms / reel.glide;
      anim.shift = reel.home - 55 * (1 - t * t * (3 - 2 * t));
      anim.crouch = 0.35 * t;
    } else {
      anim.shift = reel.home;
      anim.crouch = 0.35;
    }
    if (reel.save) return goalieFrame(reel, ms, anim);
    if (reel.kind === "wipeout") return wipeoutFrame(reel, ms, anim);
    if (reel.kind === "spin") spinAt(reel, ms, anim);
    else if (reel.slap) slapAt(reel, ms, anim);
    else wristAt(reel, ms, anim);
    if (ms >= reel.contact) {
      anim.puckT = Math.min(1, (ms - reel.contact) / (reel.land - reel.contact));
    }
    if (reel.slap) {
      anim.pan = ramp(ms, reel.panFrom, reel.panTo);
      anim.net = ramp(ms, reel.netIn, reel.netSet);
    }
    anim.goal = ms >= reel.land;
    return anim;
  }

  // The camera starts travelling once the follow-through has played, and the
  // net arrives after it - so there is a stretch with the shooter gone, the
  // net not yet there, and nothing on the ice but the puck. That gap is the
  // distance.
  function ramp(ms, from, to) {
    if (ms <= from) return 0;
    if (ms >= to) return 1;
    const t = (ms - from) / (to - from);
    return t * t * (3 - 2 * t);
  }

  // Each save: snap into the pose, hold it, come back out. The snap is quick
  // on purpose - a goalie's reaction is the whole point of the shot.
  function saveAt(saves, ms) {
    const pose = { drop: 0, blocker: 0, glove: 0 };
    saves.forEach(save => {
      pose[save.kind] = Math.max(pose[save.kind], envelope(ms, save.at, save.hold));
    });
    return pose;
  }

  function envelope(ms, at, hold) {
    if (ms < at - 90 || ms > at + hold + 280) return 0;
    if (ms < at) return (ms - (at - 90)) / 90;
    if (ms <= at + hold) return 1;
    return 1 - (ms - at - hold) / 280;
  }

  // The puck for whichever save is currently happening, as 0..1 across its
  // approach and its deflection. Impact is where those two meet.
  function shotAt(reel, ms) {
    let out = null;
    reel.saves.forEach(save => {
      const from = save.at - reel.approach, to = save.at + reel.deflect;
      if (ms >= from && ms <= to) out = { kind: save.kind, t: (ms - from) / (to - from) };
    });
    return out;
  }

  // He keeps his resting pose all the way through - the saves happen around
  // it - and the net sits behind him rather than off at the far end.
  function goalieFrame(reel, ms, anim) {
    const pose = saveAt(reel.saves, ms);
    const last = reel.saves[reel.saves.length - 1];
    anim.save = true;          // without this the renderer never looks for a shot
    anim.rest = true;
    anim.netBehind = true;
    anim.drop = pose.drop;
    anim.blocker = pose.blocker;
    anim.glove = pose.glove;
    anim.shot = shotAt(reel, ms);
    anim.crouch = 0;
    if (reel.slide) anim.shift = creaseX(reel, ms);
    anim.goal = ms >= last.at + last.hold;
    return anim;
  }

  // Pushing across the crease: he arrives at each save a moment before the puck
  // does, which is what makes it read as getting there rather than being there.
  function creaseX(reel, ms) {
    let x = 0;
    reel.saves.forEach((save, i) => {
      const to = save.x || 0, from = i ? (reel.saves[i - 1].x || 0) : 0;
      const start = save.at - 240;
      if (ms >= save.at) x = to;
      else if (ms > start) x = from + (to - from) * ramp(ms, start, save.at);
    });
    return x;
  }

  // Up and back over the shoulder, then down through the puck and high out
  // the other side. The windup is slow and the swing is not: lift falls as
  // 1 - t*t so the blade is quickest where it meets the puck.
  function slapAt(reel, ms, anim) {
    if (ms >= reel.glide && ms < reel.wind) {
      const t = (ms - reel.glide) / (reel.wind - reel.glide);
      anim.crouch = 0.35 + 0.5 * t;
      anim.lift = 2.6 * t;
    } else if (ms >= reel.wind && ms < reel.hold) {
      anim.crouch = 0.85;
      anim.lift = 2.6;                    // held at the top
    } else if (ms >= reel.hold && ms < reel.contact) {
      const t = (ms - reel.hold) / (reel.contact - reel.hold);
      anim.crouch = 0.85 + 0.15 * t;
      anim.lift = 2.6 * (1 - t * t);
    } else if (ms >= reel.contact) {
      const t = Math.min(1, (ms - reel.contact) / 420);
      anim.crouch = 1 - 0.5 * t;
      anim.lift = -1.8 * t;          // a slapshot finishes high
      anim.swing = 0.5 * t;
    }
  }

  // Glide in, sink into the shot, sweep through it.
  function wristAt(reel, ms, anim) {
    if (ms >= reel.glide && ms < reel.wind) {
      const t = (ms - reel.glide) / (reel.wind - reel.glide);
      anim.crouch = 0.35 + 0.65 * t;      // sink into it
      anim.swing = -1.15 * t;
    } else if (ms >= reel.wind && ms < reel.contact) {
      const t = (ms - reel.wind) / (reel.contact - reel.wind);
      anim.crouch = 1;
      anim.swing = -1.15 + 2.5 * t;
    } else if (ms >= reel.contact) {
      // Rise back up out of the follow-through.
      const t = Math.min(1, (ms - reel.contact) / 900);
      anim.crouch = 1 - 0.8 * t;
      anim.swing = 1.35;
    }
  }

  // The turn and the shot are one move. The rotation carries its speed all the
  // way round - ease it out and it is visibly finished long before the stick
  // comes through, which is the pause this used to have - and the release comes
  // BEFORE the turn does: puck gone and flying as he squares up.
  function spinAt(reel, ms, anim) {
    const t = Math.min(1, ms / reel.spin);
    anim.yaw = reel.yaw + Math.PI * 2 * t * t * (3 - 2 * t);
    if (ms < reel.wind) {
      anim.crouch = 0.35 + 0.25 * (ms / reel.wind);
    } else if (ms < reel.pull) {
      const w = (ms - reel.wind) / (reel.pull - reel.wind);
      anim.crouch = 0.6 + 0.4 * w;
      anim.swing = -1.15 * w;            // loading up out of the turn
    } else if (ms < reel.contact) {
      const w = (ms - reel.pull) / (reel.contact - reel.pull);
      anim.crouch = 1;
      anim.swing = -1.15 + 2.5 * w;      // and through it
    } else {
      const w = Math.min(1, (ms - reel.contact) / 900);
      anim.crouch = 1 - 0.8 * w;
      anim.swing = 1.35;
    }
  }

  // The edge goes while he is still going. The turn accelerates the way a fall
  // does (t*t, not a constant rate) and lands with one small settle rather than
  // stopping dead. Flat is a bit short of a right angle, because a player on
  // the ice lands on a shoulder.
  const FLAT = 1.38;             // radians, about 79 degrees

  function wipeoutFrame(reel, ms, anim) {
    anim.net = 0;                // no net in this one: nothing is going in
    anim.arc = 0;                // the puck skitters flat along the ice
    anim.shift = wipeoutShift(reel, ms);
    if (ms >= reel.catch) {
      anim.puckT = Math.min(1, (ms - reel.catch) / (reel.stop - reel.catch));
    }
    if (ms < reel.catch) {
      // Skating it up the ice, and off balance for the last stride of it.
      const t = Math.max(0, (ms - (reel.catch - 350)) / 350);
      anim.crouch = 0.3 + 0.25 * t;
      anim.lift = -0.9 * t * t;          // stick coming up as the feet go
      anim.swing = 0.4 * t;
    } else if (ms < reel.down) {
      const t = (ms - reel.catch) / (reel.down - reel.catch);
      anim.fall = FLAT * t * t;
      anim.crouch = 0.55 + 0.45 * t;
      anim.lift = -0.9 - 1.1 * t;        // arms and stick over his head
      anim.swing = 0.4 + 0.5 * t;
    } else {
      // Down, still travelling, settling onto his back.
      const t = Math.min(1, (ms - reel.down) / 260);
      anim.fall = FLAT - 0.07 * Math.sin(Math.PI * t) * (1 - t);
      anim.crouch = 1;
      anim.lift = -2;
      anim.swing = 0.9;
      anim.goal = ms >= reel.down + 250;  // the label, such as it is
    }
    return anim;
  }

  // One motion the whole way: constant speed in and through the fall, then a
  // slide that runs out on its own. Nothing here ever returns him to a stop
  // before he is down - that pause was the reason the fall read as staged.
  function wipeoutShift(reel, ms) {
    if (ms <= reel.down) return reel.from + reel.speed * ms;
    const t = Math.min(1, (ms - reel.down) / (reel.stop - reel.down));
    const slide = reel.speed * (reel.stop - reel.down) * 0.55;
    return reel.from + reel.speed * reel.down + slide * (1 - Math.pow(1 - t, 3));
  }

  window.CAP_REEL = { build: build, at: at, KINDS: SKATER.concat(GOALIE) };

})();
