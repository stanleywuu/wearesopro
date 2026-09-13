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
    headContour:  { min: 0,  max: 100, value: 50 }
  },

  helmets: [
    { id: "bare",  label: "Bare" },
    { id: "visor", label: "Visor" }
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
