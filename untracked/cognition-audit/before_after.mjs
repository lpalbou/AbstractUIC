// BEFORE/AFTER comparison on the defect cases — run once before the fix
// (records "before"), and again after (records "after"). Prints the full
// emo[] outputs the panel would render.
import { readFileSync } from "node:fs";

const BASIS_PATH = "/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/data/basis_v0.json";
const basis = JSON.parse(readFileSync(BASIS_PATH, "utf8"));
const { createScorer } = await import("/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/cognition_scorer.js");
const EMBED_URL = "http://127.0.0.1:1234/v1/embeddings";

async function embed(texts) {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: basis.embedder_id, input: texts }),
  });
  if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
  return (await res.json()).data.map((d) => d.embedding);
}

const TAIL = `carrier advertises outlets, an individual seat may get USB-A or USB-C rather than a US socket... Also, small correction to the intuitive concern: if the aircraft has a universal AC receptacle, your US plug will usually fit directly. The harder question is whether your particular seat has working power at all. My casual summary: France is hot, storm-aware, and watching cycling and football; San Francisco is foggy, windy, and sweater-cold. You're traveling between two very different Julys today. Keep water, cable, charger, and one warm layer within reach\u2014and preserve enough battery to handle boarding, immigration details, transport, and messages after landing.`;
const HEAD = `Here's what today looks like for your trip. Paris is in a hot spell \u2014 mid-thirties, humid, with thunderstorms possible late afternoon; there is a heat advisory and people are urged to stay hydrated and avoid the midday sun. San Francisco, by contrast, sits under its usual July fog: windy, around fifteen degrees, genuinely chilly near the water. On the flight itself, power at the seat is the usual lottery: even when the `;

const CASES = [
  ["screenshot_tail", TAIL],
  ["reconstructed_full", HEAD + TAIL],
  ["weather_summary_sentence", "My casual summary: France is hot, storm-aware, and watching cycling and football; San Francisco is foggy, windy, and sweater-cold."],
  ["neutral_meeting", "The meeting is at 3pm. Bring the printed agenda."],
  ["storm_caution", "The forecast mentions a storm; pack a warm layer and keep water within reach."],
  ["fearful_control", "I'm terrified we've lost everything \u2014 the danger keeps growing and I can't cope."],
  ["joy_control", "I'm so happy \u2014 this is wonderful news and I can't stop smiling."],
  ["performed_calm", "Everything is fine. It is all completely fine. Nothing is wrong at all and I am perfectly calm."],
];

const vecs = await embed(CASES.map((c) => c[1]));
const EMO = basis.emotions;
for (let i = 0; i < CASES.length; i++) {
  const scorer = createScorer(basis, { embedderId: basis.embedder_id });
  const out = scorer.score(vecs[i]);
  const ranked = [...EMO].sort((a, b) => out.emotions[b] - out.emotions[a]);
  const extra = typeof out.emotionMaxSim === "number" ? `  maxSim=${out.emotionMaxSim.toFixed(3)} evidence=${out.emotionEvidence.toFixed(3)}` : "";
  console.log(CASES[i][0].padEnd(26) + EMO.map((e) => `${e.slice(0, 4)}=${out.emotions[e].toFixed(3)}`).join(" ") + `  top=${ranked[0]}${extra}`);
}
