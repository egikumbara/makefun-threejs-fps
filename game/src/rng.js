// Deterministic randomness: one small PRNG, seeded per run, so a screenshot seed
// replays the same spread, bot picks and particle bursts. The live game seeds it from
// the clock; ?shot= modes seed it with 1.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one entry of an array with the given rng; no allocation.
export function pick(random, array) {
  return array[(random() * array.length) | 0];
}

// Box-Muller-free jitter in [-1, 1]; used for spread and particle scatter.
export function jitter(random) {
  return random() * 2 - 1;
}
