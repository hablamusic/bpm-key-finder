// Audio file -> mono Float32 PCM. WAV is parsed natively; other formats go through ffmpeg if it is installed.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";
import { ANALYSIS_RATE } from "./analyze.js";

/** Parse a RIFF/WAVE buffer (PCM 8/16/24/32-bit int, 32/64-bit float, WAVE_FORMAT_EXTENSIBLE) to mono. */
export function parseWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a RIFF/WAVE file");
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    let size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === "fmt ") {
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe) format = buf.readUInt16LE(body + 24); // extensible: sub-format GUID starts with the real tag
      fmt = { format, channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (size === 0xffffffff || body + size > buf.length) size = buf.length - body; // streamed or truncated files
      data = { start: body, size };
    }
    p = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error("WAV file has no fmt or data chunk");
  const { format, channels, sampleRate, bits } = fmt;
  const bps = bits / 8, frames = Math.floor(data.size / (bps * channels));
  const read = {
    "1:8": (o) => (buf.readUInt8(o) - 128) / 128,
    "1:16": (o) => buf.readInt16LE(o) / 32768,
    "1:24": (o) => buf.readIntLE(o, 3) / 8388608,
    "1:32": (o) => buf.readInt32LE(o) / 2147483648,
    "3:32": (o) => buf.readFloatLE(o),
    "3:64": (o) => buf.readDoubleLE(o),
  }[`${format}:${bits}`];
  if (!read) throw new Error(`unsupported WAV encoding (format ${format}, ${bits}-bit)`);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += read(data.start + (f * channels + c) * bps);
    out[f] = s / channels;
  }
  return { samples: out, sampleRate };
}

let ffmpegChecked = null;
export function hasFfmpeg() {
  if (ffmpegChecked === null) ffmpegChecked = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  return ffmpegChecked;
}

/** Decode any file ffmpeg understands (mp3, flac, m4a, aac, ogg, aiff...) to mono at the analysis rate. */
function decodeWithFfmpeg(path, maxSec) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "f32le", "pipe:1"], {
    maxBuffer: (maxSec ? Math.max(maxSec, 3600) : 3600) * ANALYSIS_RATE * 4 + 1024,
  });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode the file: ${String(r.stderr).trim().split("\n").pop()}`);
  const b = r.stdout;
  return { samples: new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)), sampleRate: ANALYSIS_RATE };
}

export const AUDIO_EXT = new Set([".wav", ".wave", ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".aif", ".aiff", ".wma", ".webm", ".mp4"]);

export function decodeFile(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".wav" || ext === ".wave") {
    try { return parseWav(readFileSync(path)); } catch (e) { if (!hasFfmpeg()) throw e; }
  }
  if (!hasFfmpeg()) throw new Error(`${ext || "this"} files need ffmpeg on PATH (WAV works without it). Install ffmpeg or convert to WAV.`);
  return decodeWithFfmpeg(path);
}
