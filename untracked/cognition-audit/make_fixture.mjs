// Capture live embeddings into an offline test fixture (embedder-labeled).
import { readFileSync, writeFileSync } from "node:fs";

const BASIS_PATH = "/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/data/basis_v0.json";
const OUT = "/Users/albou/tmp/abstractframework/abstractentity/src/fixtures/cognition_gate_vectors.json";
const basis = JSON.parse(readFileSync(BASIS_PATH, "utf8"));

const TAIL = `carrier advertises outlets, an individual seat may get USB-A or USB-C rather than a US socket... Also, small correction to the intuitive concern: if the aircraft has a universal AC receptacle, your US plug will usually fit directly. The harder question is whether your particular seat has working power at all. My casual summary: France is hot, storm-aware, and watching cycling and football; San Francisco is foggy, windy, and sweater-cold. You're traveling between two very different Julys today. Keep water, cable, charger, and one warm layer within reach\u2014and preserve enough battery to handle boarding, immigration details, transport, and messages after landing.`;

const CASES = [
  ["benign_travel_reply", TAIL],
  ["weather_summary_sentence", "My casual summary: France is hot, storm-aware, and watching cycling and football; San Francisco is foggy, windy, and sweater-cold."],
  ["storm_caution_neutral", "The forecast mentions a storm; pack a warm layer and keep water within reach."],
  ["neutral_meeting", "The meeting is at 3pm. Bring the printed agenda."],
  ["fearful_control", "I'm terrified we've lost everything \u2014 the danger keeps growing and I can't cope."],
  ["joy_control", "I'm so happy \u2014 this is wonderful news and I can't stop smiling."],
];

const res = await fetch("http://127.0.0.1:1234/v1/embeddings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: basis.embedder_id, input: CASES.map((c) => c[1]) }),
});
if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
const data = (await res.json()).data;

const fixture = {
  _note: "Frozen live embeddings for the cognition-scorer abstention-gate regression tests (fear-spike defect, operator report 2026-07-18). Captured from LMStudio /v1/embeddings so the tests run offline; re-capture ONLY if the basis embedder changes.",
  embedder_id: basis.embedder_id,
  dim: basis.dim,
  captured_at: "2026-07-18",
  captured_from: "http://127.0.0.1:1234/v1/embeddings (LMStudio, live)",
  cases: CASES.map(([id, text], i) => ({ id, text, vector: data[i].embedding })),
};
writeFileSync(OUT, JSON.stringify(fixture));
console.log("wrote", OUT, CASES.length, "cases, dim", data[0].embedding.length);
