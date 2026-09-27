// One seed, and a stream of numbers out of it.
//
// Everything invented about a player is invented from the player's own code and
// nothing else - the season on the back of his card, which highlight he plays -
// so the same player gets the same answer on every device, with nothing stored
// anywhere. Two of these living in two files is how they drift apart, so there
// is one.
//
// Not a security thing: it only has to spread codes evenly.

(function () {

  // Any string to a 32-bit number (FNV-1a).
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < String(text).length; i++) {
      h ^= String(text).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // The draws come off ONE seed in a fixed order, so the fields stay in step
  // with each other rather than each hashing the code separately.
  function stream(text) {
    let s = hash(text) || 1;
    return function (min, max) {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return min + (s % (max - min + 1));
    };
  }

  window.CAP_SEED = { hash: hash, stream: stream };

})();
