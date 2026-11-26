// Key names, Camelot codes and Open Key codes. Zero dependencies.

export const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Camelot codes indexed by tonic pitch class (C = 0).
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

export const camelotOf = (tonic, minor) => `${(minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[tonic]}${minor ? "A" : "B"}`;

/** Open Key notation (Traktor): 1d = C major, 1m = A minor. */
export const openKeyOf = (tonic, minor) => {
  const n = (minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[tonic];
  return `${((n - 8 + 12) % 12) + 1}${minor ? "m" : "d"}`;
};

/** Camelot neighbours that mix cleanly: same code, +/-1 on the wheel, and the relative major/minor. */
export function compatible(camelot) {
  const n = parseInt(camelot, 10), l = camelot.slice(-1).toUpperCase();
  const wrap = (v) => ((v + 11) % 12) + 1;
  return [`${n}${l}`, `${wrap(n - 1)}${l}`, `${wrap(n + 1)}${l}`, `${n}${l === "A" ? "B" : "A"}`];
}
