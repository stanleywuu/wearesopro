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
  const GOALIE = ["saves", "robbery"];

  // A goalie does not take the highlight, he is the highlight: leaning on his
  // stick in front of the net, then three saves in a row with no warning.
  const SAVES = [
    { at: 1000, kind: "drop",    hold: 300 },
    { at: 1620, kind: "blocker", hold: 260 },
    { at: 2240, kind: "glove",   hold: 520 }
  ];
  // The other one: a single shot, and he holds the glove up afterwards.
  const ROBBERY = [{ at: 1500, kind: "glove", hold: 1500 }];

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

  // Loses an edge. He is skating it out of the corner, the skate goes, and he
  // is on his back with the puck skittering away without him - which is why
  // there is no net in this one: nothing is going in.
  function wipeoutReel(params) {
    return {
      kind: "wipeout",
      yaw: SIDE_ON,
      mirror: params.handedness === "left",
      label: "Wipeout!",
      home: 14,                  // still carrying it forward when the edge goes
      glide: 900,
      catch: 1150,               // the skate catches
      down: 1850,                // flat on the ice
      stop: 2750,                // done sliding
      end: 3500                  // a beat lying there, and out - not a nap
    };
  }

  // Spin-o-rama: he turns the whole way round coming in, then shoots out of it.
  function spinReel(params) {
    return Object.assign({ kind: "spin", slap: false, home: 0, yaw: SIDE_ON,
      mirror: params.handedness === "left", label: "Filthy!",
      glide: 1500, wind: 2000, contact: 2250, land: 2800, end: 3900 }, {});
  }

  function goalieReel(kind) {
    // Face on, not side on: a goalie is looked at down the ice, with the net
    // behind him and the blocker and glove out to either side of frame.
    if (kind === "robbery") {
      return { kind: "robbery", save: true, yaw: 0, label: "What a grab!",
        saves: ROBBERY, approach: 520, deflect: 300, end: 3600, home: 0 };
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
      mirror: Boolean(reel.mirror),
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
    anim.goal = ms >= last.at + last.hold;
    return anim;
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

  // The same wrist shot, with a full turn on the way in. The spin is a whole
  // circle back to the shooting angle - stopping anywhere else would leave him
  // shooting sideways - and it eases out so the last quarter turn lands on the
  // windup rather than fighting it.
  function spinAt(reel, ms, anim) {
    if (ms < reel.glide) {
      const t = ms / reel.glide;
      anim.yaw = reel.yaw + Math.PI * 2 * t * t * (3 - 2 * t);
      anim.crouch = 0.35 * t;
    }
    wristAt(reel, ms, anim);
  }

  // The edge goes: he drops, the skates slide out ahead of him, and the fall
  // accelerates the way a fall does - t*t, not a constant turn. Flat is a bit
  // short of a right angle, because a player on the ice lands on a shoulder.
  const FLAT = 1.38;             // radians, about 79 degrees

  function wipeoutFrame(reel, ms, anim) {
    anim.net = 0;                // no net in this one: nothing is going in
    anim.arc = 0;                // the puck skitters flat along the ice
    if (ms >= reel.catch) {
      anim.puckT = Math.min(1, (ms - reel.catch) / (reel.stop - reel.catch));
    }
    if (ms < reel.catch) {
      // The moment before: he is already off balance, arms coming up.
      const t = Math.max(0, (ms - reel.glide) / (reel.catch - reel.glide));
      anim.crouch = 0.35 + 0.35 * t;
      anim.lift = -0.9 * t;              // stick flies up as the feet go
      anim.swing = 0.4 * t;
    } else if (ms < reel.down) {
      const t = (ms - reel.catch) / (reel.down - reel.catch);
      anim.fall = FLAT * t * t;
      anim.crouch = 0.7 + 0.3 * t;
      anim.lift = -0.9 - 1.1 * t;        // arms and stick over his head
      anim.swing = 0.4 + 0.5 * t;
      anim.shift = reel.home + 26 * t;   // skates out from under him
    } else {
      // Down, sliding to a stop on his back.
      const t = Math.min(1, (ms - reel.down) / (reel.stop - reel.down));
      anim.fall = FLAT;
      anim.crouch = 1;
      anim.lift = -2;
      anim.swing = 0.9;
      anim.shift = reel.home + 26 + 16 * t * (2 - t);
      anim.goal = ms >= reel.down + 250;  // the label, such as it is
    }
    return anim;
  }

  window.CAP_REEL = { build: build, at: at, KINDS: SKATER.concat(GOALIE) };

})();
