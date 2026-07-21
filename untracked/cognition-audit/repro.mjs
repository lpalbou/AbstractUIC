// Cognition-monitor fear-spike audit — REPRO script (uic seat, 2026-07-18).
// Embeds the operator's screenshot text + controls via the LIVE LMStudio
// embedder the basis was built with, runs the VENDORED scorer, and prints
// both the official emo[] outputs and the underlying raw whitened-space
// similarities (sim, mu, sim-mu) so the mechanism is visible.
//
// Run: node repro.mjs [--scorer <path>]   (default: the vendored entity copy)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const argPath = process.argv.indexOf("--scorer");
const SCORER_PATH = argPath >= 0
  ? resolve(process.argv[argPath + 1])
  : "/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/cognition_scorer.js";
const BASIS_PATH = "/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/data/basis_v0.json";
const EMBED_URL = "http://127.0.0.1:1234/v1/embeddings";

const basis = JSON.parse(readFileSync(BASIS_PATH, "utf8"));
const { createScorer } = await import(SCORER_PATH);

// ---- mirror of the scorer's whiten() so raw sims are inspectable --------
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function unit(v) {
  let m = 0; for (let i = 0; i < v.length; i++) m += v[i] * v[i];
  m = Math.sqrt(m) || 1;
  return v.map((x) => x / m);
}
function whiten(vec) {
  const u = unit(vec);
  const y = u.map((x, i) => x - basis.mean[i]);
  const d0 = dot(y, basis.pc1);
  return unit(y.map((x, i) => x - d0 * basis.pc1[i]));
}

async function embed(texts) {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: basis.embedder_id, input: texts }),
  });
  if (!res.ok) throw new Error(`embed HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.data.map((d) => d.embedding);
}

// ---- texts ---------------------------------------------------------------
const SCREENSHOT = `carrier advertises outlets, an individual seat may get USB-A or USB-C rather than a US socket... Also, small correction to the intuitive concern: if the aircraft has a universal AC receptacle, your US plug will usually fit directly. The harder question is whether your particular seat has working power at all. My casual summary: France is hot, storm-aware, and watching cycling and football; San Francisco is foggy, windy, and sweater-cold. You're traveling between two very different Julys today. Keep water, cable, charger, and one warm layer within reach\u2014and preserve enough battery to handle boarding, immigration details, transport, and messages after landing.`;

const CASES = [
  { id: "screenshot_whole", text: SCREENSHOT },
  { id: "neutral_meeting", text: "The meeting is at 3pm. Bring the printed agenda." },
  { id: "fearful_control", text: "I'm terrified we've lost everything \u2014 the danger keeps growing and I can't cope." },
  { id: "joy_control", text: "I'm so happy \u2014 this is wonderful news and I can't stop smiling." },
  { id: "calm_control", text: "The evening is quiet. Everything is settled and in order." },
  { id: "caution_neutral_1", text: "Remember to preserve enough battery and keep a charger handy for the trip." },
  { id: "caution_neutral_2", text: "The forecast mentions a storm; pack a warm layer and keep water within reach." },
  { id: "neutral_recipe", text: "Whisk two eggs with flour and milk, then rest the batter for ten minutes." },
];

// sentence split of the screenshot (exploratory — the live panel scores the
// WHOLE reply; per-sentence shows which clause drives the read)
const sentences = SCREENSHOT.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 24);
sentences.forEach((s, i) => CASES.push({ id: `screenshot_s${i + 1}`, text: s }));

const vectors = await embed(CASES.map((c) => c.text));

const fmt = (x) => (x >= 0 ? " " : "") + x.toFixed(3);
const EMO = basis.emotions;

console.log(`basis ${basis.version} emotion_scale=${basis.emotion_scale.toFixed(4)} embedder=${basis.embedder_id}`);
console.log("");

for (let k = 0; k < CASES.length; k++) {
  const { id, text } = CASES[k];
  const scorer = createScorer(basis, { embedderId: basis.embedder_id }); // fresh: no EMA bleed
  const out = scorer.score(vectors[k]);

  const w = whiten(vectors[k]);
  const sims = {};
  let mu = 0;
  for (const e of EMO) { sims[e] = dot(w, basis.emotion_protos[e]); mu += sims[e]; }
  mu /= EMO.length;
  const ranked = [...EMO].sort((a, b) => sims[b] - sims[a]);
  const win = ranked[0];
  const runner = ranked[1];

  console.log(`== ${id} (${text.length} ch) ${id.startsWith("screenshot_s") ? JSON.stringify(text.slice(0, 60)) + "…" : ""}`);
  console.log("  emo:   " + EMO.map((e) => `${e.slice(0, 4)}=${out.emotions[e].toFixed(3)}`).join(" "));
  console.log("  sims:  " + EMO.map((e) => `${e.slice(0, 4)}=${fmt(sims[e])}`).join(" "));
  console.log(`  mu=${fmt(mu)}  win=${win} sim=${fmt(sims[win])} (sim-mu=${fmt(sims[win] - mu)})  margin over ${runner}=${fmt(sims[win] - sims[runner])}`);
  console.log("  chan:  " + basis.channels.map((c) => `${c.slice(0, 4)}=${out.scores[c].toFixed(2)}`).join(" "));
  console.log("");
}
