#!/usr/bin/env node
// bpm-key-finder: BPM, musical key and Camelot code for audio files and whole DJ folders.
import { readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { analyze } from "../src/analyze.js";
import { compatible } from "../src/keys.js";
import { decodeFile, AUDIO_EXT } from "../src/decode.js";

const HELP = `bpm-key-finder: BPM, key and Camelot code for audio files (zero dependencies)

Usage
  bpm-key-finder <file-or-folder>... [options]

Options
  --json            JSON output (one array)
  --csv             CSV output: file,bpm,key,camelot,open_key,bpm_conf,key_conf,duration
  -r, --recursive   Walk sub-folders
  --sort <field>    Sort rows by bpm, camelot or file (default: input order)
  --max-sec <n>     Seconds analysed from the middle of each track (default 120)
  -h, --help        This help

WAV works out of the box. MP3, FLAC, M4A, OGG, AIFF need ffmpeg on PATH.
Mix in key: tracks are compatible when their Camelot codes are equal, +/-1, or A<->B with the same number.
Web version, nothing uploaded: https://hablamusic.com/dj-tools/bpm-key-finder?utm_source=github&utm_medium=cli&utm_campaign=bpm-key-finder`;

const args = process.argv.slice(2);
const opt = { json: false, csv: false, recursive: false, sort: null, maxSec: 120 };
const inputs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") { console.log(HELP); process.exit(0); }
  else if (a === "--json") opt.json = true;
  else if (a === "--csv") opt.csv = true;
  else if (a === "-r" || a === "--recursive") opt.recursive = true;
  else if (a === "--sort") opt.sort = args[++i];
  else if (a === "--max-sec") opt.maxSec = Number(args[++i]);
  else if (a.startsWith("-")) { console.error(`unknown option ${a}\n\n${HELP}`); process.exit(2); }
  else inputs.push(a);
}
if (!inputs.length) { console.log(HELP); process.exit(2); }

function collect(p, depth = 0) {
  const st = statSync(p);
  if (st.isFile()) return [p];
  if (!st.isDirectory() || (depth > 0 && !opt.recursive)) return [];
  return readdirSync(p).sort().flatMap((n) => {
    const q = join(p, n);
    const s = statSync(q);
    if (s.isDirectory()) return opt.recursive ? collect(q, depth + 1) : [];
    return AUDIO_EXT.has(extname(n).toLowerCase()) ? [q] : [];
  });
}

const files = inputs.flatMap((p) => {
  try { return collect(p); } catch { console.error(`not found: ${p}`); process.exitCode = 1; return []; }
});
const rows = [];
for (const f of files) {
  try {
    const { samples, sampleRate } = decodeFile(f);
    const r = analyze(samples, sampleRate, { maxSec: opt.maxSec });
    rows.push({ file: f, bpm: r.bpm, key: r.key.name, camelot: r.key.camelot, openKey: r.key.openKey, bpmConfidence: r.bpmConfidence, keyConfidence: r.key.confidence, duration: r.duration, mixesWith: compatible(r.key.camelot), alternatives: r.key.candidates.slice(1) });
    if (!opt.json && !opt.csv && process.stderr.isTTY && files.length > 1) process.stderr.write(`\r${rows.length}/${files.length}`);
  } catch (e) {
    console.error(`${f}: ${e.message}`);
    process.exitCode = 1;
  }
}
if (process.stderr.isTTY && files.length > 1 && !opt.json && !opt.csv) process.stderr.write("\r");

const camelotNum = (c) => parseInt(c, 10) * 2 + (c.endsWith("B") ? 1 : 0);
if (opt.sort === "bpm") rows.sort((a, b) => a.bpm - b.bpm);
else if (opt.sort === "camelot") rows.sort((a, b) => camelotNum(a.camelot) - camelotNum(b.camelot) || a.bpm - b.bpm);
else if (opt.sort === "file") rows.sort((a, b) => a.file.localeCompare(b.file));

if (opt.json) console.log(JSON.stringify(rows, null, 2));
else if (opt.csv) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  console.log("file,bpm,key,camelot,open_key,bpm_conf,key_conf,duration");
  for (const r of rows) console.log([q(r.file), r.bpm, r.key, r.camelot, r.openKey, r.bpmConfidence, r.keyConfidence, r.duration].join(","));
} else if (rows.length) {
  const name = (f) => { const r = relative(process.cwd(), f); return r.startsWith("..") ? f.split(/[\\/]/).slice(-2).join("/") : r; };
  const table = rows.map((r) => [name(r.file), String(r.bpm), r.key, r.camelot, r.mixesWith.slice(1).join(" "), conf(r.bpmConfidence, r.keyConfidence)]);
  const head = ["file", "bpm", "key", "camelot", "mixes with", "confidence"];
  const w = head.map((h, i) => Math.max(h.length, ...table.map((t) => t[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd();
  console.log(line(head));
  console.log(line(w.map((n) => "-".repeat(n))));
  for (const t of table) console.log(line(t));
}

function conf(b, k) {
  const lvl = (v) => (v >= 0.5 ? "high" : v >= 0.2 ? "ok" : "low");
  return `bpm ${lvl(b)}, key ${lvl(k)}`;
}
