// Characterize the fear prototype empirically (the builder script is gone):
// raw whitened-space similarity of caution/weather/logistics vocabulary vs
// unrelated-neutral vocabulary against EACH emotion prototype.
import { readFileSync } from "node:fs";
const basis = JSON.parse(readFileSync("/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/data/basis_v0.json", "utf8"));
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function unit(v) { let m = 0; for (const x of v) m += x * x; m = Math.sqrt(m) || 1; return v.map((x) => x / m); }
function whiten(vec) {
  const u = unit(vec);
  const y = u.map((x, i) => x - basis.mean[i]);
  const d0 = dot(y, basis.pc1);
  return unit(y.map((x, i) => x - d0 * basis.pc1[i]));
}
async function embed(texts) {
  const res = await fetch("http://127.0.0.1:1234/v1/embeddings", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: basis.embedder_id, input: texts }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data.map((d) => d.embedding);
}
const PROBES = [
  "storm", "danger", "the storm is coming", "preserve enough battery",
  "losing power", "keep a warm layer within reach", "boarding and immigration",
  "the printed agenda", "a cup of tea", "the quarterly budget", "flour and milk",
  "I am overwhelmed", "we lost everything",
];
const vecs = await embed(PROBES);
const EMO = basis.emotions;
const fmt = (x) => (x >= 0 ? " " : "") + x.toFixed(3);
console.log("probe".padEnd(34) + EMO.map((e) => e.slice(0, 4).padStart(7)).join(""));
for (let i = 0; i < PROBES.length; i++) {
  const w = whiten(vecs[i]);
  console.log(PROBES[i].padEnd(34) + EMO.map((e) => fmt(dot(w, basis.emotion_protos[e])).padStart(7)).join(""));
}
