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

  // Not in the pool, and not rolled: the one highlight you have to be somebody
  // to get. Stanley shoots it between his own legs, from behind - name a player
  // after him and it is yours too, which is the point of an easter egg.
  const HIDDEN = { stanley: "cheeky" };

  function hiddenFor(params) {
    if (params.position === "Goalie") return null;
    return HIDDEN[String(params.name || "").trim().toLowerCase()] || null;
  }

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

  function seedText(params, code) {
    if (code) return String(code);
    try { return window.CAP_CODE.encode(params); } catch (e) { return "1"; }
  }

  // ---- which highlight -------------------------------------------------

  // kind forces one, which is what ?debug=reel&kind=wipeout uses.
  function build(params, code, kind) {
    const next = window.CAP_SEED.stream(seedText(params, code));
    if (params.position === "Goalie") {
      return goalieReel(kind || GOALIE[next(0, GOALIE.length - 1)]);
    }
    const pick = kind || hiddenFor(params) || SKATER[next(0, SKATER.length - 1)];
    if (pick === "cheeky") return cheekyReel(params);
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

  // The hidden one. Most of it is the shot he was going to take anyway - glide
  // in, sink into it - and then the stick goes down between his legs instead of
  // through the puck, and the puck leaves from behind him.
  function cheekyReel(params) {
    return { kind: "cheeky", slap: false, home: 6, yaw: SIDE_ON,
      mirror: params.handedness === "left", label: "Nasty!",
      glide: 1000, tuck: 1560, contact: 1560, land: 2060, end: 3100 };
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
    if (reel.kind === "cheeky") cheekyAt(reel, ms, anim);
    else if (reel.kind === "spin") spinAt(reel, ms, anim);
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

  // The wrist shot itself, as three windows: load the stick back, sweep it
  // through the puck, rise out of the follow-through. The plain shot and the
  // spin-o-rama both play THIS - they differ only in when the load starts and
  // what he is doing on the way in.
  const BACK = -1.15, THROUGH = 1.35;

  function wristShot(anim, ms, t) {
    if (ms >= t.load && ms < t.release) {
      const w = (ms - t.load) / (t.release - t.load);
      anim.crouch = t.crouch + (1 - t.crouch) * w;    // sink into it
      anim.swing = BACK * w;
    } else if (ms >= t.release && ms < t.contact) {
      const w = (ms - t.release) / (t.contact - t.release);
      anim.crouch = 1;
      anim.swing = BACK + (THROUGH - BACK) * w;
    } else if (ms >= t.contact) {
      const w = Math.min(1, (ms - t.contact) / 900);
      anim.crouch = 1 - 0.8 * w;
      anim.swing = THROUGH;
    }
  }

  // Glide in, then shoot: the load starts where the glide ends.
  function wristAt(reel, ms, anim) {
    wristShot(anim, ms, { load: reel.glide, release: reel.wind,
                          contact: reel.contact, crouch: 0.35 });
  }

  // The turn and the shot are one move. The rotation carries its speed all the
  // way round - ease it out and it is visibly finished long before the stick
  // comes through, which is the pause this used to have - and the release comes
  // BEFORE the turn does: puck gone and flying as he squares up.
  function spinAt(reel, ms, anim) {
    const t = Math.min(1, ms / reel.spin);
    anim.yaw = reel.yaw + Math.PI * 2 * t * t * (3 - 2 * t);
    if (ms < reel.wind) anim.crouch = 0.35 + 0.25 * (ms / reel.wind);
    wristShot(anim, ms, { load: reel.wind, release: reel.pull,
                          contact: reel.contact, crouch: 0.6 });
  }

  // The shot he always takes, taken too far. The wrist shot's own pull-back
  // already draws the stick back behind him; this one keeps pulling - past
  // where anybody stops - with the hands coming in to the centre line, so the
  // bottom of the shaft ends up behind his legs and the puck leaves from
  // there. The recovery is the only ordinary part of it.
  const CHEEKY_BACK = -0.5;      // a little across the body, no more
  const CHEEKY_TILT = 0.92;      // the shaft swings back under him, hands staying put

  function cheekyAt(reel, ms, anim) {
    if (ms < reel.glide) return;
    const t = Math.min(1, (ms - reel.glide) / (reel.contact - reel.glide));
    const ease = t * t * (3 - 2 * t);
    anim.swing = CHEEKY_BACK * ease;
    anim.lift = CHEEKY_TILT * ease;      // the bottom of the shaft goes out behind him
    anim.tuck = ease;                    // hands in to the centre line and down to the waist
    // Nothing is put back afterwards. He shot it from there; he stays there,
    // and only stands out of the crouch to watch it go.
    if (ms < reel.contact) return (anim.crouch = 0.35 + 0.5 * ease), undefined;
    anim.crouch = 0.85 - 0.35 * Math.min(1, (ms - reel.contact) / 700);
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

  // Every kind by name (?debug=reel&kind=...), and the ones a given player can
  // be shown in - his own hidden one included, so the card's print picker can
  // offer it to whoever has it.
  function kindsFor(params) {
    if (params.position === "Goalie") return GOALIE.slice();
    const hidden = hiddenFor(params);
    return hidden ? SKATER.concat([hidden]) : SKATER.slice();
  }

  window.CAP_REEL = { build: build, at: at, kindsFor: kindsFor,
                      KINDS: SKATER.concat(GOALIE, ["cheeky"]) };

})();
