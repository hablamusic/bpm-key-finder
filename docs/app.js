// In-browser front end for bpm-key-finder. The analysis code in ./lib is a copy of ../src (checked in CI).
import { analyze } from "./lib/analyze.js";
import { compatible } from "./lib/keys.js";

const S = window.S || {};
const $ = (id) => document.getElementById(id);
const rows = [];
let ctx;

async function decode(blob) {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const n = audio.length, ch = audio.numberOfChannels, mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  return { samples: mono, rate: audio.sampleRate };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const level = (v) => (v >= 0.5 ? ["high", "ok"] : v >= 0.25 ? ["ok", ""] : ["low", "warn"]);

function render() {
  $("out").hidden = rows.length === 0;
  $("rows").innerHTML = rows.map((r) => {
    if (r.pending) return `<tr><td>${esc(r.name)}</td><td colspan="5" class="muted">${esc(S.working || "Analysing")}…</td></tr>`;
    if (r.error) return `<tr><td>${esc(r.name)}</td><td colspan="5" class="muted">${esc(S.err || "Error")}</td></tr>`;
    const [bl, bc] = level(r.bpmConfidence), [kl, kc] = level(r.key.confidence);
    return `<tr><td>${esc(r.name)}</td><td><strong>${r.bpm}</strong></td><td>${esc(r.key.name)}</td><td><span class="pill">${r.key.camelot}</span></td><td>${compatible(r.key.camelot).slice(1).join(" ")}</td><td><span class="pill ${bc}">bpm ${bl}</span> <span class="pill ${kc}">key ${kl}</span></td></tr>`;
  }).join("");
}

async function run(files) {
  const list = [...files].filter((f) => /^audio\//.test(f.type) || /\.(mp3|wav|wave|flac|m4a|aac|ogg|opus|aiff?|webm|mp4)$/i.test(f.name));
  for (const f of list) rows.push({ name: f.webkitRelativePath || f.name, file: f, pending: true });
  render();
  document.getElementById("out").scrollIntoView({ behavior: "smooth", block: "nearest" });
  for (const r of rows.filter((x) => x.pending)) {
    await new Promise((res) => setTimeout(res, 20));
    try {
      const { samples, rate } = await decode(r.file);
      Object.assign(r, analyze(samples, rate, { maxSec: 120 }), { pending: false });
      document.dispatchEvent(new CustomEvent("tool_used", { detail: { tool: "bpm-key-finder", bpm: r.bpm, camelot: r.key.camelot } }));
    } catch (e) { Object.assign(r, { pending: false, error: true }); }
    render();
  }
}

const drop = $("drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", async (e) => {
  const items = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!items.length) return run(e.dataTransfer.files);
  const out = [];
  const walk = (entry, path) => new Promise((res) => {
    if (entry.isFile) entry.file((f) => { Object.defineProperty(f, "webkitRelativePath", { value: path + f.name }); out.push(f); res(); }, res);
    else if (entry.isDirectory) { const rd = entry.createReader(); const all = []; const next = () => rd.readEntries(async (es) => { if (!es.length) { for (const x of all) await walk(x, path + entry.name + "/"); res(); } else { all.push(...es); next(); } }, res); next(); }
    else res();
  });
  for (const it of items) await walk(it, "");
  run(out);
});
$("files").addEventListener("change", (e) => run(e.target.files));
$("dir").addEventListener("change", (e) => run(e.target.files));
$("sample").addEventListener("click", async () => {
  const b = await (await fetch(S.sample)).blob();
  run([new File([b], "sample-reggaeton.mp3", { type: "audio/mpeg" })]);
});
$("csv").addEventListener("click", () => {
  const ok = rows.filter((r) => !r.pending && !r.error);
  const csv = "file,bpm,key,camelot,open_key,bpm_conf,key_conf,duration\n" + ok.map((r) => [JSON.stringify(r.name), r.bpm, r.key.name, r.key.camelot, r.key.openKey, r.bpmConfidence, r.key.confidence, r.duration].join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "bpm-key-finder.csv" });
  a.click();
});
