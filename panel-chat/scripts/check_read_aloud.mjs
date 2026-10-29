#!/usr/bin/env node
/**
 * Read aloud speaks only a reply generated while the conversation is open (operator 2026-10-29;
 * `src/read_aloud.ts`), each case pinned so removing the rule is red:
 *  A. opening / reloading a conversation whose run is over never speaks (its replies are old);
 *  B. switching to another conversation never speaks its existing reply;
 *  C. a run sent / seen live, then completed with a new reply: that reply is spoken once (also when
 *     the reply lands a render after "completed", and when the run went loading → completed
 *     without a live status, because it was sent from here);
 *  D. the reply that was already there when the run started is never spoken;
 *  E. a failed or stopped run speaks nothing AND disarms: a later load of other messages in the
 *     same conversation (a saved thread, a history reload) is never taken for its reply;
 *  F. `readAloudPhase`: loading / idle / unknown are "none"; sending is "live".
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { readAloudStep, READ_ALOUD_INITIAL, readAloudPhase } = await import(join(here, "..", "dist", "index.js"));

function play(steps) {
  let state = READ_ALOUD_INITIAL;
  const spoken = [];
  for (const [scope, phase, reply] of steps) {
    const out = readAloudStep(state, { scope, phase, reply: reply ? { id: reply, text: `reply ${reply}` } : null });
    state = out.state;
    if (out.speak) spoken.push(out.speak.id);
  }
  return spoken;
}

assert.deepEqual(play([["s1", "none", null], ["s1", "none", "a2"], ["s1", "completed", "a2"], ["s1", "completed", "a2"]]), [], "A: opening never speaks");
assert.deepEqual(play([["s1", "completed", "a2"]]), [], "A: a reload never speaks");
assert.deepEqual(play([["s1", "live", "a1"], ["s1", "completed", "a2"], ["s2", "none", null], ["s2", "completed", "b9"]]), ["a2"], "B: switching never speaks the other conversation's reply");
assert.deepEqual(play([["s1", "completed", "a1"], ["s1", "live", "a1"], ["s1", "live", "a2"], ["s1", "completed", "a2"], ["s1", "completed", "a2"]]), ["a2"], "C: once");
assert.deepEqual(play([["s1", "live", "a1"], ["s1", "completed", "a1"], ["s1", "completed", "a2"]]), ["a2"], "C: a reply one render late");
assert.deepEqual(play([["s1", "live", "a1"], ["s1", "none", "a1"], ["s1", "completed", "a2"]]), ["a2"], "C: sent here, never seen running");
assert.deepEqual(play([["s1", "live", "a1"], ["s1", "completed", "a1"]]), [], "D: the old reply is not the new one");
assert.deepEqual(play([["s1", "live", "a1"], ["s1", "ended", "a1"], ["s1", "completed", "t9"]]), [], "E: a failed run disarms (a saved thread loaded later is silent)");
assert.deepEqual(play([["s1", "live", null], ["s1", "ended", "a0"]]), [], "E: a stopped run speaks nothing");
assert.deepEqual(play([["s1", "live", "a1"], ["s1", "ended", "a1"], ["s1", "live", "a1"], ["s1", "completed", "a3"]]), ["a3"], "E: the next run speaks its own reply");
for (const s of ["", "idle", "loading", "unknown", "whatever"]) assert.equal(readAloudPhase(s), "none", s);
for (const s of ["running", "waiting", "queued", "starting"]) assert.equal(readAloudPhase(s), "live", s);
assert.equal(readAloudPhase("completed"), "completed");
for (const s of ["failed", "cancelled"]) assert.equal(readAloudPhase(s), "ended", s);
assert.equal(readAloudPhase("loading", true), "live", "sending from here arms");
console.log("check_read_aloud: ok (A-F)");
