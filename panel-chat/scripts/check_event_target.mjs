import assert from "node:assert/strict";
import { resolveWorkflowEventTarget } from "../dist/event_target.js";

const wait = (runId, waitKey, details = {}) => ({ runId, wait: { wait_key: waitKey, reason: "event", details } });
const waitRecord = (runId, waitKey, payload) => ({
  runId,
  cursor: 1,
  record: { run_id: runId, status: "waiting", effect: { type: "wait_event", payload }, result: { wait: { wait_key: waitKey } } },
});

// Runtime event_keys.py intentionally does not escape colon-bearing IDs or
// event names. Structured matching wait evidence recovers the exact middle.
const workflowKey = "evt:workflow:bundle@1.2.3:flow:deploy:finished";
assert.deepEqual(
  resolveWorkflowEventTarget(
    wait("run-1", workflowKey),
    [waitRecord("run-1", workflowKey, { wait_key: workflowKey, scope: "workflow", workflow_id: "bundle@1.2.3:flow", name: "deploy:finished" })],
  ).target,
  { scope: "workflow", scopeId: "bundle@1.2.3:flow", workflowId: "bundle@1.2.3:flow", name: "deploy:finished" },
);

// A known active run is an exact fallback for the canonical session prefix;
// custom session IDs and event names may both contain colons.
const sessionKey = "evt:session:session:alpha:42:mail:received";
assert.deepEqual(
  resolveWorkflowEventTarget(wait("run-2", sessionKey), [], { run_id: "run-2", session_id: "session:alpha:42" }).target,
  { scope: "session", scopeId: "session:alpha:42", sessionId: "session:alpha:42", name: "mail:received" },
);

assert.deepEqual(
  resolveWorkflowEventTarget(wait("run:with:colon", "evt:run:run:with:colon:tick:done")).target,
  { scope: "run", scopeId: "run:with:colon", runId: "run:with:colon", name: "tick:done" },
);
assert.deepEqual(
  resolveWorkflowEventTarget(wait("any-run", "evt:global:global:mail:received")).target,
  { scope: "global", scopeId: "global", name: "mail:received" },
);

const unknown = resolveWorkflowEventTarget(wait("run-3", "evt:workflow:bundle@1:flow:notify"), [], { run_id: "run-3" });
assert.equal(unknown.target, null);
assert.match(unknown.error, /enough canonical event routing metadata/i);

const conflicting = resolveWorkflowEventTarget(
  wait("run-4", "evt:workflow:bundle@1:flow:notify"),
  [waitRecord("run-4", "evt:workflow:bundle@1:flow:notify", { wait_key: "evt:workflow:bundle@1:flow:notify", scope: "workflow", workflow_id: "bundle@1", name: "notify" })],
);
assert.equal(conflicting.target, null);
assert.match(conflicting.error, /conflicts/i);

console.log("event target checks passed");
