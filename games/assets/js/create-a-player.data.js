// Data for Create-a-Player. No logic here — see create-a-player.draw.js and create-a-player.js.

window.CAP_DATA = {

  shapes: [
    { id: "cube",      label: "Blocky" },
    { id: "ellipsoid", label: "Round" },
    { id: "capsule",   label: "Pill" }
  ],

  // Slider ranges. value is the v1 default.
  sliders: {
    bodyWidth:    { min: 60, max: 160, value: 100 },
    bodyHeight:   { min: 60, max: 150, value: 100 },
    bodyContour:  { min: 0,  max: 100, value: 50 },
    headWidth:    { min: 60, max: 150, value: 100 },
    headHeight:   { min: 60, max: 150, value: 100 },
    headContour:  { min: 0,  max: 100, value: 50 },
    // Overall stature: scales the whole figure about the ice, so a short player
    // keeps his proportions and his feet. Added after v1, so the codec carries
    // it at the END of the share code (see TAIL_SLIDERS).
    height:       { min: 70, max: 130, value: 100 },
    // The face. Size scales the eye; contour is its shape at a constant size -
    // 0 is a wide slit, 100 is tall and round, 50 is the eye as it always was.
    eyeSize:      { min: 60, max: 170, value: 100 },
    eyeContour:   { min: 0,  max: 100, value: 50 },
    // Length is how far the mouth reaches; contour bends it - 0 is a frown,
    // 100 is a grin, 50 is the straight line it always was.
    mouthLength:  { min: 40, max: 180, value: 100 },
    mouthContour: { min: 0,  max: 100, value: 50 }
  },

  // Appended, never reordered: a share code carries the INDEX of the choice.
  helmets: [
    { id: "bare",  label: "Bare" },
    { id: "visor", label: "Visor" },
    { id: "mask",  label: "Goalie mask" }
  ],

  // Appended, never reordered - the share code carries the index.
  hairStyles: [
    { id: "none",     label: "None" },
    { id: "short",    label: "Short" },
    { id: "flow",     label: "Flow" },
    { id: "mop",      label: "Mop" },
    { id: "thinning", label: "Thinning" },
    { id: "ponytail", label: "Ponytail" }
  ],

  faceHairs: [
    { id: "none",     label: "None" },
    { id: "stache",   label: "Moustache" },
    { id: "goatee",   label: "Goatee" },
    { id: "chinstrap", label: "Chinstrap" },
    { id: "beard",    label: "Playoff beard" },
    { id: "chops",    label: "Mutton chops" }
  ],

  handedness: [
    { id: "left",  label: "Left" },
    { id: "right", label: "Right" }
  ],

  positions: ["Centre", "Left Wing", "Right Wing", "Defence", "Goalie"],

  // Presets are a short starting row, not the whole range — every swatch row
  // ends with a colour picker, so any hex is reachable. Keep each list at
  // seven so the row plus its picker stays on one line.
  skinColors:   ["#F8D9BD", "#F2C9A0", "#E0A878", "#C68642", "#A9683C", "#8D5524", "#5C3317"],
  jerseyColors: ["#1E88E5", "#0D47A1", "#E53935", "#43A047", "#FDD835", "#212121", "#FAFAFA"],
  trimColors:   ["#FFFFFF", "#212121", "#FDD835", "#E53935", "#1E88E5", "#43A047", "#9E9E9E"],
  helmetColors: ["#212121", "#FFFFFF", "#0D47A1", "#E53935", "#1E88E5", "#43A047", "#9E9E9E"],
  // The card itself, not the player: the border and the window behind them.
  // Appended after everything else, so a share code that predates them still
  // decodes - see "tail" in create-a-player.codec.js.
  cardEdgeColors: ["#F8A41B", "#1E88E5", "#E53935", "#43A047", "#212121", "#FAFAFA", "#7E57C2"],
  cardBackColors: ["#EEF6FF", "#FFFDF6", "#FFFFFF", "#E8F5E9", "#FDECEA", "#ECEFF1", "#1B2733"],

  hairColors:   ["#2B1B12", "#5A3A21", "#8D5524", "#C68642", "#D9A441", "#8E8E8E", "#EDEDED"],

  // Pants, gloves and stick. Six each, not seven: these rows carry an extra
  // "Kit" swatch in front of the presets (pants and gloves follow the jersey
  // until you say otherwise), and the row plus its picker still has to fit on
  // one line. Appended after everything else - see "tail" in the codec.
  pantsColors:  ["#2B2B2B", "#12213B", "#5A1B1B", "#1B3A24", "#6E6E6E", "#EDEDED"],
  gloveColors:  ["#212121", "#0D47A1", "#E53935", "#1E88E5", "#43A047", "#FAFAFA"],
  // Tan first, and it is the same tan the stick was always drawn in, so the
  // head of this list IS the default rather than a new look for old players.
  stickColors:  ["#C9A227", "#7B3F00", "#2B2B2B", "#E53935", "#1E88E5", "#FAFAFA"],

  randomNames: [
    "Tommy", "Stanley", "Dale", "Ricky", "Wheels", "Bucket", "Chief", "Turbo",
    "Moose", "Sniper", "Biscuit", "Twig", "Gordie", "Chachi", "Rocket", "Bruiser"
  ],

  catchPhrases: [
    "I had him all the way.",
    "That was going wide.",
    "Beauty pass, bud.",
    "I'm just here for the beers.",
    "Next shift, next shift.",
    "Park your panda ass in front.",
    "My stick was broken.",
    "Sorry, I thought you had it."
  ]

};
