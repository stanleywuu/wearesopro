// The Highlight: one timeline, played by the builder and by every hockey card.
// No DOM, no drawing - build(params) picks the shot, at(reel, ms) says where
// everything is at that moment, and CAP_DRAW.render draws it. There is exactly
// one copy on purpose: the card used to keep its own, and it drifted.

(function () {

  const SIDE_ON = Math.PI / 2;   // the reel plays side on, facing the net

  // The wrist shot every other position plays, unchanged.
  const CLASSIC = { glide: 1200, wind: 1800, contact: 2000, land: 2500, end: 3600 };

  // A goalie does not take the highlight, he is the highlight: leaning on his
  // stick in front of the net, then three saves in a row with no warning.
  const SAVES = [
    { at: 1000, kind: "drop",    hold: 300 },
    { at: 1620, kind: "blocker", hold: 260 },
    { at: 2240, kind: "glove",   hold: 520 }
  ];
  const APPROACH = 300, DEFLECT = 260;   // puck in, puck away

  // A defenceman winds up and slaps it. The speed is rolled FIRST, because it
  // is what decides everything after contact: a harder shot is in the air for
  // less time, and the number on the end is the same number.
  function build(params) {
    if (params.position === "Goalie") return goalieReel();
    if (params.position !== "Defence") return Object.assign({ slap: false, home: 0, yaw: SIDE_ON }, CLASSIC);
    // Beer league. Nobody here is breaking 80.
    const speed = 55 + Math.round(Math.random() * 25);
    const contact = 2300;
    // It is a long way from the point: 55mph spends over two seconds in the
    // air, 80mph about a second and a half.
    const flight = Math.round(120000 / speed);
    return {
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

  function goalieReel() {
    // Face on, not side on: a goalie is looked at down the ice, with the net
    // behind him and the blocker and glove out to either side of frame.
    return { save: true, yaw: 0, label: "Robbed!", saves: SAVES, end: 4000, home: 0 };
  }

  // The whole reel as a function of elapsed time. Returns null once finished.
  function at(reel, ms) {
    if (!reel || ms >= reel.end) return null;
    const anim = {
      shift: 0, crouch: 0, swing: 0, lift: 0,
      puckT: null, goal: false, pan: 0,
      arc: 9, net: 1, label: reel.label,
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
    if (reel.slap) slapAt(reel, ms, anim);
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
  function saveAt(ms) {
    const pose = { drop: 0, blocker: 0, glove: 0 };
    SAVES.forEach(save => {
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
  function shotAt(ms) {
    let out = null;
    SAVES.forEach(save => {
      const from = save.at - APPROACH, to = save.at + DEFLECT;
      if (ms >= from && ms <= to) out = { kind: save.kind, t: (ms - from) / (to - from) };
    });
    return out;
  }

  // He keeps his resting pose all the way through - the saves happen around
  // it - and the net sits behind him rather than off at the far end.
  function goalieFrame(reel, ms, anim) {
    const pose = saveAt(ms);
    anim.save = true;          // without this the renderer never looks for a shot
    anim.rest = true;
    anim.netBehind = true;
    anim.drop = pose.drop;
    anim.blocker = pose.blocker;
    anim.glove = pose.glove;
    anim.shot = shotAt(ms);
    anim.crouch = 0;
    anim.goal = ms >= reel.saves[2].at + reel.saves[2].hold;
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

  window.CAP_REEL = { build: build, at: at };

})();
