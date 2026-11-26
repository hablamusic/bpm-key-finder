// Synthetic test tracks: drums at a known tempo + a chord loop in a known key.
const SR = 22050;
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
// Diatonic triads (scale degrees) for a progression; minor: i-iv-i-V (harmonic minor, raised 7th), major: I-V-vi-IV.
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11], MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
export function track({ bpm, tonic, minor, seconds = 40, sampleRate = SR }) {
  const n = Math.floor(seconds * sampleRate), x = new Float32Array(n);
  const beat = 60 / bpm, scale = minor ? MINOR_SCALE : MAJOR_SCALE;
  const prog = minor ? [0, 3, 0, 4] : [0, 4, 5, 3];
  const root = 48 + tonic; // C3 + tonic
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate, b = t / beat, inBeat = (b % 1) * beat;
    // kick on every beat, hat on off-beats
    let s = Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-inBeat * 30)) * inBeat) * Math.exp(-inBeat * 12) * 0.8;
    const off = ((b + 0.5) % 1) * beat;
    s += (Math.random() * 2 - 1) * Math.exp(-off * 60) * 0.15;
    // chord: one per bar (4 beats), triad + bass, three harmonics each
    const deg = prog[Math.floor(b / 4) % prog.length];
    const notes = [0, 2, 4].map((k) => { const d = deg + k; const raise = minor && d % 7 === 6 ? 1 : 0; return root + scale[d % 7] + raise + 12 * Math.floor(d / 7); });
    notes.push(notes[0] - 12);
    for (const m of notes) for (let h = 1; h <= 3; h++) s += (Math.sin(2 * Math.PI * midiHz(m) * h * t) * 0.08) / h;
    x[i] = s * 0.6;
  }
  return { samples: x, sampleRate };
}
