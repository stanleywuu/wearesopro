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
    { id: "bucket", label: "Bucket" },
    { id: "cage",   label: "Cage" }
  ],

  positions: ["Centre", "Left Wing", "Right Wing", "Defence", "Goalie"],

  skinColors:    ["#F2C9A0", "#E0A878", "#C68642", "#8D5524", "#5C3317"],
  jerseyColors:  ["#1E88E5", "#E53935", "#43A047", "#FDD835", "#FB8C00", "#8E24AA", "#212121", "#FAFAFA"],
  trimColors:    ["#FFFFFF", "#212121", "#FDD835", "#E53935", "#1E88E5", "#9E9E9E"],
  helmetColors:  ["#212121", "#1E88E5", "#E53935", "#FFFFFF", "#43A047", "#FDD835"],

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
