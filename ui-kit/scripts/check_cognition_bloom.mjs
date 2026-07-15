#!/usr/bin/env node
// Node checks for the AfCognitionBloom framework-free core (the Cognitive
// Monitor co-design, commons c2229-c2238). Runs after tsc build (imports
// the compiled dist output). Pins: the 9-register contract incl. GRAVITY,
// unique 3-letter codes, the morph gate (breath suppressed mid-glide),
// settledness math, vignette quadrants, and the effort column's
// absent-not-zero rule.
import assert from "node:assert/strict";
import {
  EMOTION_REGISTERS,
  createBloomState,
  setBloomTargets,
  tickBloom,
  readBloom,
  vignetteColor,
  effortRows,
} from "../dist/cognition_bloom_core.js";

let n = 0;
const ok = (name) => {
  n++;
  console.log(`  ok ${n} — ${name}`);
};

// 1) the curated-v1 register set: 9 incl. gravity, codes pinned unique
assert.equal(EMOTION_REGISTERS.length, 9);
assert.ok(EMOTION_REGISTERS.some((e) => e.id === "gravity" && e.code === "GRV"));
const codes = EMOTION_REGISTERS.map((e) => e.code);
assert.equal(new Set(codes).size, codes.length, "3-letter codes must be unique (entity's collision lesson)");
for (const c of codes) assert.match(c, /^[A-Z]{3}$/);
ok("9 registers incl. GRAVITY; codes unique and 3-letter");

// 2) gravity is not sadness: distinct color, near-neutral valence, low arousal
const grv = EMOTION_REGISTERS.find((e) => e.id === "gravity");
const sad = EMOTION_REGISTERS.find((e) => e.id === "sadness");
assert.notEqual(grv.color, sad.color);
assert.ok(Math.abs(grv.vx) < 0.3, "gravity valence is near-neutral (grave, not unpleasant)");
assert.ok(grv.ay < 0, "gravity arousal is low-slow");
ok("gravity is its own register — not sadness re-labeled");

// 3) absent is not zero: missing keys keep targets, explicit 0 lowers
const st = createBloomState();
setBloomTargets(st, { joy: 0.8 });
assert.equal(st.springs.joy.target, 0.8);
setBloomTargets(st, { calm: 0.5 }); // joy absent -> unchanged
assert.equal(st.springs.joy.target, 0.8);
setBloomTargets(st, { joy: 0 }); // explicit zero lowers
assert.equal(st.springs.joy.target, 0);
setBloomTargets(st, { nonsense: 1, fear: Number.NaN });
assert.equal(st.springs.fear.target, 0, "NaN must not land");
ok("setBloomTargets: absent-not-zero; unknown/NaN refused");

// 4) THE MORPH GATE: settledness ~0 right after a big target jump; ~1 at rest
const st2 = createBloomState();
setBloomTargets(st2, { fear: 0.9 });
const mid = readBloom(st2);
assert.ok(mid.settledness < 0.05, `mid-morph settledness must suppress breath (got ${mid.settledness})`);
for (let i = 0; i < 600; i++) tickBloom(st2, 1 / 60);
const rest = readBloom(st2);
assert.ok(rest.settledness > 0.95, `at-rest settledness must restore breath (got ${rest.settledness})`);
assert.ok(Math.abs(st2.springs.fear.value - 0.9) < 0.02, "spring lands on target");
ok("morph gate: settledness 0 mid-glide, 1 at rest; spring lands");

// 5) reading: dominant + circumplex signs
const st3 = createBloomState();
setBloomTargets(st3, { gravity: 0.7, joy: 0.1 });
for (let i = 0; i < 600; i++) tickBloom(st3, 1 / 60);
const r3 = readBloom(st3);
assert.equal(r3.dominant.id, "gravity");
assert.ok(r3.arousal < 0, "gravity-led reading sits low-arousal");
ok("reading: dominance + circumplex derivation");

// 6) vignette quadrants (the safe-place vs anxious macro-read)
assert.equal(vignetteColor({ valence: 0.5, arousal: -0.5 }), "#86c99b");
assert.equal(vignetteColor({ valence: 0.5, arousal: 0.5 }), "#e7b45a");
assert.equal(vignetteColor({ valence: -0.5, arousal: 0.5 }), "#c05a86");
assert.equal(vignetteColor({ valence: -0.5, arousal: -0.5 }), "#6f8cb0");
ok("vignette: four quadrant hues");

// 7) effort column: absent = row absent, never zero-faked; labeled formats
assert.deepEqual(effortRows(null), []);
assert.deepEqual(effortRows({}), []);
const rows = effortRows({ tokens_in: 1200, think_ms: 4200, tool_rounds: 3, memories_recalled: undefined });
assert.deepEqual(
  rows.map((r) => r.key),
  ["tokens_in", "think_ms", "tool_rounds"],
);
assert.equal(rows.find((r) => r.key === "think_ms").text, "4.2s");
assert.equal(effortRows({ tokens_out: -5 }).length, 0, "negative counts refused, not zero-faked");
ok("effort rows: absent-not-zero; negatives refused; ms humanized");

console.log(`check_cognition_bloom: ${n} groups green`);
