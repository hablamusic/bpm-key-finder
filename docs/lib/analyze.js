// BPM and musical key detection for a mono PCM signal. Zero dependencies, runs in Node and in browsers.
// Tempo: spectral-flux onsets + autocorrelation over 60-200 BPM, folded into 78-175 BPM.
// Key: 12-bin chroma averaged over the track, correlated with Krumhansl-Kessler major/minor profiles.
// Same method as the in-browser tool at https://hablamusic.com/dj-tools/bpm-key-finder

import { camelotOf, openKeyOf, NOTES } from "./keys.js";

export const ANALYSIS_RATE = 11025;

// Krumhansl-Kessler key profiles (tonic first).
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** In-place radix-2 FFT. `re` and `im` have the same power-of-two length. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const hann = (n) => {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
};

/**
 * Resample a mono signal to ANALYSIS_RATE with a moving-average anti-alias filter,
 * keeping at most `maxSec` seconds from the middle of the track.
 */
export function prepare(samples, sampleRate, maxSec = 120) {
  const total = samples.length / sampleRate;
  const len = Math.min(total, maxSec);
  const startSrc = Math.floor(((total - len) / 2) * sampleRate);
  const ratio = sampleRate / ANALYSIS_RATE;
  const outLen = Math.floor(len * ANALYSIS_RATE);
  const out = new Float32Array(outLen);
  const box = Math.max(1, Math.round(ratio));
  for (let i = 0; i < outLen; i++) {
    const c = startSrc + Math.floor(i * ratio);
    let s = 0, n = 0;
    for (let j = 0; j < box && c + j < samples.length; j++) { s += samples[c + j]; n++; }
    out[i] = n ? s / n : 0;
  }
  return out;
}

/** Tempo of a mono ANALYSIS_RATE signal. Returns { bpm, confidence } with confidence in 0..1. */
export function detectTempo(x) {
  const SR = ANALYSIS_RATE, N = 1024, H = 128, fps = SR / H;
  const frames = Math.floor((x.length - N) / H);
  if (frames < fps * 8) return { bpm: 0, confidence: 0 }; // under ~8 seconds: not enough beats
  const win = hann(N);
  const onset = new Float64Array(frames);
  let prev = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * H + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float64Array(N / 2);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = mag[k] - prev[k];
      if (d > 0) flux += k < 30 ? d * 1.5 : d; // a little extra weight on kick and bass
    }
    onset[f] = flux;
    prev = mag;
  }
  // Remove the slow trend so sustained loud parts do not dominate.
  const w = Math.round(fps * 0.5);
  const o = new Float64Array(frames);
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    acc += onset[i] - (i >= w ? onset[i - w] : 0);
    o[i] = Math.max(0, onset[i] - acc / Math.min(i + 1, w));
  }
  const lagOf = (bpm) => (60 * fps) / bpm;
  const minLag = Math.floor(lagOf(200)), maxLag = Math.ceil(lagOf(60));
  const ac = new Float64Array(maxLag * 4 + 2);
  const acAt = (lag) => {
    if (ac[lag] || lag >= frames) return ac[lag] || 0;
    let s = 0;
    for (let i = lag; i < frames; i++) s += o[i] * o[i - lag];
    return (ac[lag] = s / (frames - lag));
  };
  // Score each lag together with its multiples (a beat grid reinforces 2x and 4x the period).
  let best = 0, bestLag = 0, total = 0, count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const s = acAt(lag) + 0.5 * acAt(lag * 2) + 0.25 * acAt(lag * 4);
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2)); // mild preference for club tempos
    const v = s * prior;
    total += v; count++;
    if (v > best) { best = v; bestLag = lag; }
  }
  if (!bestLag) return { bpm: 0, confidence: 0 };
  // Parabolic refinement of the peak.
  const a = acAt(bestLag - 1), b = acAt(bestLag), c = acAt(bestLag + 1);
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  let bpm = (60 * fps) / (bestLag + Math.max(-0.5, Math.min(0.5, shift)));
  while (bpm < 78) bpm *= 2;
  while (bpm > 175) bpm /= 2;
  const confidence = Math.max(0, Math.min(1, (best / (total / count) - 1) / 3));
  // Snap to a whole BPM when close: produced tracks sit on integer tempos.
  const r = Math.round(bpm);
  return { bpm: Math.abs(bpm - r) < 0.35 ? r : Math.round(bpm * 10) / 10, confidence: round2(confidence) };
}

/** Average chroma vector (12 values, C first) of a mono ANALYSIS_RATE signal. */
export function chroma(x) {
  const SR = ANALYSIS_RATE, N = 8192, H = 4096;
  const out = new Float64Array(12);
  const re = new Float64Array(N), im = new Float64Array(N);
  const win = hann(N);
  const kLo = Math.floor((60 * N) / SR), kHi = Math.ceil((2100 * N) / SR);
  const pcOf = new Int8Array(kHi + 1);
  for (let k = 0; k <= kHi; k++) pcOf[k] = k < kLo ? -1 : (((Math.round(12 * Math.log2((k * SR) / N / 440)) % 12) + 12 + 9) % 12);
  for (let s = 0; s + N <= x.length; s += H) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const frame = new Float64Array(12);
    for (let k = kLo; k <= kHi; k++) frame[pcOf[k]] += Math.hypot(re[k], im[k]);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += frame[i];
    if (!sum) continue;
    for (let i = 0; i < 12; i++) out[i] += Math.sqrt(frame[i] / sum);
  }
  return out;
}

const corr = (c, prof, tonic) => {
  const xs = Array.from({ length: 12 }, (_, i) => c[(i + tonic) % 12]);
  const mx = xs.reduce((p, v) => p + v, 0) / 12, my = prof.reduce((p, v) => p + v, 0) / 12;
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < 12; i++) { n += (xs[i] - mx) * (prof[i] - my); dx += (xs[i] - mx) ** 2; dy += (prof[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy || 1);
};

/** Key of a mono ANALYSIS_RATE signal: { tonic, minor, name, camelot, openKey, confidence, candidates }. */
export function detectKey(x) {
  const c = chroma(x);
  const scores = [];
  for (let t = 0; t < 12; t++) scores.push({ tonic: t, minor: false, r: corr(c, MAJOR, t) }, { tonic: t, minor: true, r: corr(c, MINOR, t) });
  scores.sort((p, q) => q.r - p.r);
  const top = scores[0];
  const describe = (s) => ({ name: `${NOTES[s.tonic]} ${s.minor ? "minor" : "major"}`, camelot: camelotOf(s.tonic, s.minor), score: round2(s.r) });
  return {
    tonic: top.tonic,
    minor: top.minor,
    name: describe(top).name,
    camelot: camelotOf(top.tonic, top.minor),
    openKey: openKeyOf(top.tonic, top.minor),
    confidence: round2(Math.max(0, Math.min(1, (top.r - scores[1].r) * 8 + top.r * 0.3))),
    candidates: scores.slice(0, 3).map(describe),
  };
}

/**
 * Analyse mono PCM samples (Float32Array, -1..1) at any sample rate.
 * Returns { bpm, bpmConfidence, key, duration }.
 */
export function analyze(samples, sampleRate, { maxSec = 120 } = {}) {
  const x = prepare(samples, sampleRate, maxSec);
  const t = detectTempo(x);
  return { bpm: t.bpm, bpmConfidence: t.confidence, key: detectKey(x), duration: round2(samples.length / sampleRate) };
}

function round2(v) { return Math.round(v * 100) / 100; }
