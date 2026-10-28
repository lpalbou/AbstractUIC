#!/usr/bin/env node
/**
 * Read aloud speaks only a reply generated while the conversation is open (operator 2026-10-29;
 * `src/read_aloud.ts`), each case pinned so removing the rule is red:
 *  A. opening / reloading a conversation whose run is over never speaks (its replies are old);
 *  B. switching to another conversation never speaks its existing reply;
 *  C. a run seen in progress, then over with a new reply: that reply is spoken once;
 *  D. the reply that was already there when the run started is never spoken;
 *  E. a failed run (no new reply) speaks nothing; the next live run speaks its own reply;
 *  F. `runIsLive`: loading / idle / over are not live.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { readAloudStep, READ_ALOUD_INITIAL, runIsLive } = await import(join(here, "..", "dist", "index.js"));

function play(steps) {
  let state = READ_ALOUD_INITIAL;
  const spoken = [];
  for (const input of steps) {
    const out = readAloudStep(state, input);
    state = out.state;
    if (out.speak) spoken.push(out.speak.id);
  }
  return spoken;
}
const r = (id) => ({ id, text: `reply ${id}` });

// A. Open (loading → the view arrives with the last reply → earlier turns prepended): silent.
assert.deepEqual(play([
  { scope: "s1", live: false, reply: null },
  { scope: "s1", live: false, reply: r("a2") },
  { scope: "s1", live: false, reply: r("a2") },
]), [], "A: opening a conversation never speaks its replies");
// A'. Reload = a new mount: the same.
assert.deepEqual(play([{ scope: "s1", live: false, reply: r("a2") }]), [], "A: a reload never speaks");
// B. Switch from s1 (after a spoken reply) to s2: s2's reply is not spoken.
assert.deepEqual(play([
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: false, reply: r("a2") },
  { scope: "s2", live: false, reply: null },
  { scope: "s2", live: false, reply: r("b9") },
]), ["a2"], "B: switching to a conversation never speaks its existing reply");
// C. Live run, then over with a new reply (appearing while still live, or just after).
assert.deepEqual(play([
  { scope: "s1", live: false, reply: r("a1") },
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: true, reply: r("a2") },
  { scope: "s1", live: false, reply: r("a2") },
  { scope: "s1", live: false, reply: r("a2") },
]), ["a2"], "C: the new reply is spoken once");
assert.deepEqual(play([
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: false, reply: r("a1") },
  { scope: "s1", live: false, reply: r("a2") },
]), ["a2"], "C: a reply that lands after the run is over is still the new one");
// D. The reply already there when the run started is never spoken.
assert.deepEqual(play([
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: false, reply: r("a1") },
]), [], "D: the old reply is not the new one");
// E. A failed run says nothing; the next live run speaks its own reply.
assert.deepEqual(play([
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: false, reply: r("a1") },
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: false, reply: r("a3") },
]), ["a3"], "E: only the reply of a run seen live");
assert.deepEqual(play([
  { scope: "s1", live: true, reply: r("a1") },
  { scope: "s1", live: false, reply: { id: "a2", text: "   " } },
]), [], "E: an empty reply is not spoken");
// F.
for (const s of ["", "idle", "loading", "completed", "failed", "cancelled"]) assert.equal(runIsLive(s), false, s);
for (const s of ["running", "waiting", "queued"]) assert.equal(runIsLive(s), true, s);
console.log("check_read_aloud: ok (A-F)");
