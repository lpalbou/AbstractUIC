// presentInteraction: the ONE mapping from runtime waits to chat controls,
// shared by AbstractCode web and the Observer's automation discussions.
// Run after `npm run build`: node scripts/check_present_interaction.mjs
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as pc from "../dist/index.js";

const { presentInteraction } = pc;
assert.equal(typeof presentInteraction, "function", "export presentInteraction");

const calls = [];
const controller = {
  approve: async (approved, target) => void calls.push(["approve", approved, target]),
  approveWithPolicyChange: async (target, onApproved) => {
    calls.push(["approveWithPolicyChange", target]);
    onApproved();
  },
  resume: async (answer) => void calls.push(["resume", answer]),
  emitEvent: async (event) => void calls.push(["emitEvent", event]),
};

assert.equal(presentInteraction(null, controller), null, "no wait → nothing");
assert.equal(presentInteraction({ runId: "r", wait: { wait_key: "sub:1", reason: "subworkflow" } }, controller), null, "a subworkflow wait is never a question");

// --- tool approval -------------------------------------------------------------------
const toolWait = {
  runId: "run-1",
  stepId: "step-9",
  wait: {
    wait_key: "approve:1",
    reason: "user",
    details: { mode: "approval_required", tool_calls: [{ call_id: "c1", name: "write_file", arguments: { path: "a.md" } }, { call_id: "c2", name: "write_file", arguments: { path: "b.md" } }] },
  },
};
const target = { runId: "run-1", waitKey: "approve:1", stepId: "step-9" };
const t = presentInteraction(toolWait, controller);
assert.equal(t.kind, "tool-approval", "approval_required wins over reason=user");
assert.equal(t.id, "run-1:approve:1:step-9");
assert.equal(t.title, "2 actions need permission");
assert.equal(t.toolName, "write_file", "tool names deduplicated");
assert.equal(t.onApproveAll, undefined, "no Allow-all without the host's policy switch");
assert.equal(t.approveAllLabel, undefined);
await t.onApprove();
assert.deepEqual(calls.at(-1), ["approve", true, target], "Allow once → approve(true, exact target)");
await t.onDeny();
assert.deepEqual(calls.at(-1), ["approve", false, target], "Deny → approve(false, exact target)");
const detail = renderToStaticMarkup(React.createElement(React.Fragment, null, t.detail));
assert.ok(detail.startsWith('<div class="pc-approval-summary">'), "approval summary container");
assert.ok(detail.includes("a.md") && detail.includes("b.md"), "every call's target is shown");
assert.ok(detail.includes("<summary>Review full tool arguments (JSON)</summary>"), "full arguments behind a disclosure");
let policy = 0;
const all = presentInteraction(toolWait, controller, { onPermissionsAll: async () => void (policy += 1) });
assert.equal(all.approveAllLabel, "Allow all enabled tools");
assert.match(all.approveAllDescription, /permissions: all/);
await all.onApproveAll();
assert.deepEqual(calls.at(-1), ["approveWithPolicyChange", target], "Allow all → approveWithPolicyChange(target)");
assert.equal(policy, 1, "the host's policy switch runs once the batch is approved");
const single = presentInteraction({ runId: "r", wait: { wait_key: "k", details: { kind: "tool_approval", tool_calls: [{ name: "shell" }] } } }, controller);
assert.equal(single.kind, "tool-approval", "details.kind=tool_approval is an approval too");
assert.equal(single.title, "1 action needs permission");

// --- ask user ------------------------------------------------------------------------
const ask = presentInteraction(
  { runId: "run-2", wait: { wait_key: "ask:1", reason: "ask_user", prompt: "Which day?", allow_free_text: false, choices: ["Monday", { value: "tue", label: "Tuesday", description: "after 2 pm" }] } },
  controller,
);
assert.equal(ask.kind, "ask-user");
assert.equal(ask.prompt, "Which day?");
assert.equal(ask.allowFreeText, false);
assert.deepEqual(ask.choices, [
  { id: "Monday", label: "Monday" },
  { id: "tue", label: "Tuesday", description: "after 2 pm" },
]);
await ask.onSubmit("tue");
assert.deepEqual(calls.at(-1), ["resume", "tue"], "the answer resumes the run");
const askDefault = presentInteraction({ runId: "r", wait: { wait_key: "k", reason: "user", details: { prompt: "From details" } } }, controller);
assert.equal(askDefault.prompt, "From details");
assert.equal(askDefault.allowFreeText, true, "free text allowed unless the wait says otherwise");

// --- event wait -----------------------------------------------------------------------
const ev = presentInteraction({ runId: "run:3", wait: { wait_key: "evt:run:run:3:tick:done", reason: "event" } }, controller);
assert.equal(ev.kind, "event-wait");
assert.equal(ev.title, "Waiting for an event");
assert.equal(ev.eventName, "tick:done");
await ev.onSend('{"n": 1}');
assert.deepEqual(calls.at(-1), ["emitEvent", { name: "tick:done", scope: "run", payload: { n: 1 }, run_id: "run:3" }], "the event goes to the exact run scope");
const sess = presentInteraction({ runId: "run-4", wait: { wait_key: "evt:session:s-1:mail", reason: "event" } }, controller, { currentRun: { run_id: "run-4", session_id: "s-1" } });
await sess.onSend("");
assert.deepEqual(calls.at(-1), ["emitEvent", { name: "mail", scope: "session", payload: {}, session_id: "s-1" }], "session scope from the current run");
const lost = presentInteraction({ runId: "run-5", wait: { wait_key: "evt:workflow:bundle@1:flow:notify", reason: "event" } }, controller, { currentRun: { run_id: "run-5" } });
assert.equal(lost.title, "Event routing unavailable");
const before = calls.length;
await assert.rejects(() => lost.onSend("{}"), /routing/i, "an unroutable event is refused, never guessed");
assert.equal(calls.length, before, "nothing emitted");

console.log("check_present_interaction: OK");
