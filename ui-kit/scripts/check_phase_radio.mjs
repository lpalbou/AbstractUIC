#!/usr/bin/env node
// Node checks for the AfPhaseRadio framework-free core (backlog 0027):
// strict vocabulary normalization, payload reconciliation with visible
// drift, and descriptor/spec-contract invariants. Runs after tsc build
// (imports the compiled dist output).
import assert from "node:assert/strict";
import { RULED_PHASES, PHASE_DESCRIPTORS, normalizePhase, reconcilePhaseList } from "../dist/phase_radio_core.js";

let n = 0;
const ok = (name) => {
  n++;
  console.log(`  ok ${n} — ${name}`);
};

// 1) the ruled four, in ruled order
assert.deepEqual([...RULED_PHASES], ["visit", "work", "personal", "sleep"]);
ok("ruled vocabulary is the four-phase set in order");

// 2) strict normalization: exact keys only
for (const p of RULED_PHASES) assert.equal(normalizePhase(p), p);
assert.equal(normalizePhase("visiting"), null, "state-axis word must not fold");
assert.equal(normalizePhase("own-time"), null, "spoken synonym must not fold (tooltip-only per spec)");
assert.equal(normalizePhase("asleep"), null, "state-axis word must not fold");
assert.equal(normalizePhase(""), null);
assert.equal(normalizePhase(undefined), null);
assert.equal(normalizePhase(42), null);
ok("normalization is strict: keys pass, synonyms/state words/junk -> null");

// 3) reconcile: default when absent/empty
assert.deepEqual(reconcilePhaseList(undefined).phases, [...RULED_PHASES]);
assert.deepEqual(reconcilePhaseList([]).phases, [...RULED_PHASES]);
ok("absent/empty payload falls back to the ruled set");

// 4) reconcile: server order respected, drift dropped AND reported
const r = reconcilePhaseList(["sleep", "personal", "own_time", "visit", "work", "visit"]);
assert.deepEqual(r.phases, ["sleep", "personal", "visit", "work"], "server order kept, dup deduped");
assert.deepEqual(r.dropped, ["own_time"], "drift is reported, not silently absorbed");
ok("payload order honored; vocabulary drift visible");

// 5) reconcile: all-junk payload falls back (labeled by dropped)
const junk = reconcilePhaseList(["awake", "paused"]);
assert.deepEqual(junk.phases, [...RULED_PHASES]);
assert.deepEqual(junk.dropped, ["awake", "paused"]);
ok("all-junk payload -> ruled set + full drop list");

// 6) descriptors: every ruled phase has one primary label + honest default title
for (const p of RULED_PHASES) {
  const d = PHASE_DESCRIPTORS[p];
  assert.equal(d.id, p);
  assert.ok(d.label.length > 0 && d.glyph.length > 0 && d.defaultTitle.length > 10);
  assert.ok(!d.label.includes("/"), "one primary label per control (no synonym slashes)");
}
// spoken synonym lives in the tooltip of personal, never the label
assert.ok(PHASE_DESCRIPTORS.personal.defaultTitle.includes("own-time"));
assert.equal(PHASE_DESCRIPTORS.personal.label, "personal");
ok("descriptors carry one primary label; synonyms tooltip-only");

console.log(`check_phase_radio: ${n} checks green`);
