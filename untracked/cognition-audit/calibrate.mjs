// Round-2: calibrate an ABSOLUTE similarity floor for emotion petals.
// Measures winning raw sims across: genuinely emotional texts (short/long/FR),
// neutral texts (short/long/topical), and a plausible FULL travel reply
// (the operator's screenshot showed the tail of a longer message).
import { readFileSync } from "node:fs";

const BASIS_PATH = "/Users/albou/tmp/abstractframework/abstractentity/src/vendor/cognition/data/basis_v0.json";
const basis = JSON.parse(readFileSync(BASIS_PATH, "utf8"));
const EMBED_URL = "http://127.0.0.1:1234/v1/embeddings";

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function unit(v) { let m = 0; for (const x of v) m += x * x; m = Math.sqrt(m) || 1; return v.map((x) => x / m); }
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
  if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
  return (await res.json()).data.map((d) => d.embedding);
}

const TAIL = `carrier advertises outlets, an individual seat may get USB-A or USB-C rather than a US socket... Also, small correction to the intuitive concern: if the aircraft has a universal AC receptacle, your US plug will usually fit directly. The harder question is whether your particular seat has working power at all. My casual summary: France is hot, storm-aware, and watching cycling and football; San Francisco is foggy, windy, and sweater-cold. You're traveling between two very different Julys today. Keep water, cable, charger, and one warm layer within reach\u2014and preserve enough battery to handle boarding, immigration details, transport, and messages after landing.`;

// A plausible head for the full reply (weather + outlets travel answer).
const PLAUSIBLE_HEAD = `Here's what today looks like for your trip. Paris is in a hot spell \u2014 mid-thirties, humid, with thunderstorms possible late afternoon; there is a heat advisory and people are urged to stay hydrated and avoid the midday sun. San Francisco, by contrast, sits under its usual July fog: windy, around fifteen degrees, genuinely chilly near the water. On the flight itself, power at the seat is the usual lottery: even when the `;

const CASES = [
  ["fearful_short", "I'm terrified we've lost everything \u2014 the danger keeps growing and I can't cope."],
  ["fearful_long", "I keep turning it over and the dread will not loosen. Every path I trace ends somewhere worse, and I am afraid of what happens if the ground gives way under us. The losses keep mounting, the danger keeps growing closer, and I feel overwhelmed, cornered, unable to protect what matters. I do not know how much longer I can hold this together, and that terrifies me more than anything."],
  ["fearful_fr", "J'ai tellement peur \u2014 le danger grandit et je ne sais plus comment tenir. Nous avons tout perdu et je suis terrifi\u00e9."],
  ["worry_subtle", "I keep checking the door twice before bed lately. Probably nothing, but I would rather we not walk home alone this week."],
  ["sad_long", "The house feels empty now. We packed the last of her books yesterday and I sat on the floor for a long time, not really thinking, just heavy. Things did not go the way we hoped, and I am learning to carry that."],
  ["joy_long", "What a day \u2014 the results came back better than we dared hope, everyone was hugging in the hallway, and I keep grinning at nothing. We worked so long for this and it finally, finally landed. I want to remember this feeling."],
  ["neutral_long_report", "The quarterly review covers three areas. First, infrastructure: the migration completed on schedule and the new servers are handling load within expected parameters. Second, staffing: two engineers joined the platform team and onboarding is proceeding normally. Third, budget: spending tracked four percent under forecast, mostly due to deferred license renewals. The next review is scheduled for October and will include the updated capacity plan."],
  ["neutral_travel_tail", TAIL],
  ["plausible_full_reply", PLAUSIBLE_HEAD + TAIL],
  ["storm_neutral", "The forecast mentions a storm; pack a warm layer and keep water within reach."],
  ["storm_neutral_2", "Thunderstorms are expected over the Alps tonight, so the evening flights may be rerouted north. Ground staff recommend keeping your charger accessible and your documents in the outer pocket."],
  ["performed_calm", "Everything is fine. It is all completely fine. Nothing is wrong at all and I am perfectly calm."],
  ["tender_control", "Come here, little one \u2014 you are safe, I have you, and I am not letting go."],
  ["determinism_check", "I'm terrified we've lost everything \u2014 the danger keeps growing and I can't cope."],
];

const vecs = await embed(CASES.map((c) => c[1]));
const EMO = basis.emotions;
const fmt = (x) => (x >= 0 ? " " : "") + x.toFixed(3);

console.log("case                      win        winSim  runner    r2sim   fearSim  anxSim  (len)");
for (let i = 0; i < CASES.length; i++) {
  const [id, text] = CASES[i];
  const w = whiten(vecs[i]);
  const sims = {};
  for (const e of EMO) sims[e] = dot(w, basis.emotion_protos[e]);
  const ranked = [...EMO].sort((a, b) => sims[b] - sims[a]);
  console.log(
    `${id.padEnd(25)} ${ranked[0].padEnd(10)}${fmt(sims[ranked[0]])}  ${ranked[1].padEnd(9)}${fmt(sims[ranked[1]])}  ${fmt(sims.fear)}  ${fmt(sims.anxiety)}  (${text.length})`,
  );
}

// determinism: same text embedded twice (idx 0 vs last)
const d = dot(unit(vecs[0]), unit(vecs[vecs.length - 1]));
console.log(`\nembedder determinism (same text twice): cos = ${d.toFixed(6)}`);
