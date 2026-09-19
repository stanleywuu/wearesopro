// The Team: one Create A Player code per character. Data only - the hub draws
// its picture buttons from these and each profile's hockey card reads its own.
// To change how someone looks: open their profile, "Open in Create A Player",
// edit, copy the code, and replace their line here. Nothing else needs touching.

window.TEAM_CODES = {
  stanley:   "1~1~1~40~40~50~40~40~50~0~1~0~0~0~1~0~1~Stanley~9~We're basically pro now.~~1",
  tommy:     "1~1~1~70~40~50~40~40~50~0~2~0~0~0~2~0~4~Tommy~30~I hate people~~1",
  stephanie: "1~1~1~40~40~50~40~40~50~0~3~0~0~0~1~0~3~Stephanie~7~Look! I got a whistle.~~5",
  dale:      "1~1~1~40~40~50~40~40~50~0~4~0~0~0~1~0~3~Dale~44~You don't need to sharpen your skates.~~4",
  ricky:     "1~1~1~40~40~50~40~40~50~0~5~0~0~0~1~0~2~Ricky~3~Woohoo! This is so much fun!~~3"
};

// Which moment of each character's Highlight the hub shows them in, in ms.
// Without it everyone stands in the same idle pose. Frames picked by eye:
// a save, a windup, a follow-through, a shot, a goal.
window.TEAM_POSES = {
  stanley:   2150,   // the puck just off his stick
  tommy:     1150,   // down in the butterfly
  stephanie: 1700,   // stick at the top of the windup
  dale:      2600,   // follow-through
  ricky:     2600    // GOAL!
};
