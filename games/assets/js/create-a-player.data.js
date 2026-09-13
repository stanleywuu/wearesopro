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

  // Presets only — every swatch row also has a custom picker, so any hex is
  // reachable. Keep the first entry of each list as the sensible default.
  skinColors: [
    "#F8D9BD", "#F2C9A0", "#E0A878", "#D18E5E", "#C68642",
    "#A9683C", "#8D5524", "#6B4323", "#5C3317", "#3E2317"
  ],

  jerseyColors: [
    "#1E88E5", "#0D47A1", "#4FC3F7", "#00ACC1", "#00897B",
    "#43A047", "#7CB342", "#FDD835", "#FFB300", "#FB8C00",
    "#E53935", "#B71C1C", "#D81B60", "#8E24AA", "#5E35B1",
    "#6D4C41", "#455A64", "#9E9E9E", "#212121", "#FAFAFA"
  ],

  trimColors: [
    "#FFFFFF", "#212121", "#FDD835", "#FFB300", "#E53935",
    "#B71C1C", "#1E88E5", "#0D47A1", "#43A047", "#00897B",
    "#8E24AA", "#9E9E9E", "#6D4C41", "#C0A062"
  ],

  helmetColors: [
    "#212121", "#455A64", "#FFFFFF", "#9E9E9E", "#1E88E5",
    "#0D47A1", "#E53935", "#B71C1C", "#43A047", "#00897B",
    "#FDD835", "#FB8C00", "#8E24AA", "#6D4C41"
  ],

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
