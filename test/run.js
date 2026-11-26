// Zero-dependency test runner: node test/run.js
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { analyze } from "../src/analyze.js";
import { camelotOf, openKeyOf, compatible } from "../src/keys.js";
import { parseWav } from "../src/decode.js";
import { track } from "./synth.js";

let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); } };

test("camelot codes for the 24 keys", () => {
  assert.equal(camelotOf(0, false), "8B");  // C major
  assert.equal(camelotOf(9, true), "8A");   // A minor
  assert.equal(camelotOf(4, true), "9A");   // E minor
  assert.equal(camelotOf(11, false), "1B"); // B major
  assert.equal(camelotOf(8, true), "1A");   // G# minor
  const all = new Set();
  for (let t = 0; t < 12; t++) for (const m of [false, true]) all.add(camelotOf(t, m));
  assert.equal(all.size, 24);
});
test("open key notation", () => {
  assert.equal(openKeyOf(0, false), "1d");
  assert.equal(openKeyOf(9, true), "1m");
  assert.equal(openKeyOf(7, false), "2d");
});
test("compatible keys wrap around 12 -> 1", () => {
  assert.deepEqual(compatible("12A"), ["12A", "11A", "1A", "12B"]);
  assert.deepEqual(compatible("1B"), ["1B", "12B", "2B", "1A"]);
});

const cases = [
  { bpm: 128, tonic: 9, minor: true, camelot: "8A" },   // house, A minor
  { bpm: 94, tonic: 5, minor: true, camelot: "4A" },    // reggaeton, F minor
  { bpm: 120, tonic: 7, minor: false, camelot: "9B" },  // G major
  { bpm: 140, tonic: 0, minor: true, camelot: "5A" },   // trap, C minor
  { bpm: 174, tonic: 2, minor: false, camelot: "10B" }, // drum and bass, D major
  { bpm: 100, tonic: 4, minor: true, camelot: "9A" },   // cumbia, E minor
];
for (const c of cases) {
  test(`synthetic ${c.bpm} BPM, ${c.camelot}`, () => {
    const { samples, sampleRate } = track(c);
    const r = analyze(samples, sampleRate);
    assert.ok(Math.abs(r.bpm - c.bpm) <= 1, `bpm ${r.bpm}, expected ${c.bpm}`);
    assert.equal(r.key.camelot, c.camelot, `key ${r.key.name} (${r.key.camelot})`);
  });
}

test("44.1 kHz input is resampled", () => {
  const { samples, sampleRate } = track({ bpm: 124, tonic: 9, minor: true, seconds: 30, sampleRate: 44100 });
  const r = analyze(samples, sampleRate);
  assert.ok(Math.abs(r.bpm - 124) <= 1, `bpm ${r.bpm}`);
});

test("too short for tempo returns 0 BPM", () => {
  const { samples, sampleRate } = track({ bpm: 120, tonic: 0, minor: false, seconds: 4 });
  assert.equal(analyze(samples, sampleRate).bpm, 0);
});

function wav(samples, sampleRate, { bits = 16, channels = 2, float = false } = {}) {
  const bps = bits / 8, data = Buffer.alloc(samples.length * channels * bps);
  samples.forEach((v, i) => {
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bps;
      if (float) data.writeFloatLE(v, o);
      else if (bits === 16) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), o);
      else if (bits === 24) data.writeIntLE(Math.round(Math.max(-1, Math.min(1, v)) * 8388607), o, 3);
    }
  });
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(float ? 3 : 1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * bps, 28); h.writeUInt16LE(channels * bps, 32); h.writeUInt16LE(bits, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

for (const fmt of [{ bits: 16 }, { bits: 24 }, { bits: 32, float: true }, { bits: 16, channels: 1 }]) {
  test(`WAV parser: ${fmt.float ? "float" : "int"} ${fmt.bits}-bit, ${fmt.channels ?? 2} ch`, () => {
    const s = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5);
    const r = parseWav(wav(s, 22050, fmt));
    assert.equal(r.sampleRate, 22050);
    assert.equal(r.samples.length, 1000);
    assert.ok(Math.abs(r.samples[123] - s[123]) < 1e-3);
  });
}

test("CLI: folder in, CSV and JSON out", () => {
  const dir = mkdtempSync(join(tmpdir(), "bkf-"));
  const { samples, sampleRate } = track({ bpm: 126, tonic: 9, minor: true, seconds: 30 });
  writeFileSync(join(dir, "a.wav"), wav(samples, sampleRate));
  writeFileSync(join(dir, "notes.txt"), "ignored");
  const bin = new URL("../bin/bpm-key-finder.js", import.meta.url).pathname;
  const csv = execFileSync(process.execPath, [bin, dir, "--csv"]).toString().trim().split("\n");
  assert.equal(csv.length, 2);
  assert.match(csv[1], /a\.wav,126,A minor,8A,1m,/);
  const json = JSON.parse(execFileSync(process.execPath, [bin, dir, "--json"]).toString());
  assert.deepEqual(json[0].mixesWith, ["8A", "7A", "9A", "8B"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
