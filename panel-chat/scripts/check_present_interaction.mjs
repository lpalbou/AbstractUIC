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
  resume: async (answer, target) => void calls.push(target ? ["resume", answer, target] : ["resume", answer]),
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
// The calls in words: the kit's ToolCallWordsList (verb chip, the key argument, a group count), never
// the tool's raw name with its JSON (operator 2026-10-29); the JSON stays behind the disclosure only.
assert.ok(detail.includes('class="af-toolwords"') && detail.includes('aria-label="Tool calls to approve"'), "the kit's tool-call words list");
assert.ok(detail.includes('<span class="af-toolwords__verb" title="write_file">Write</span>'), "the verb chip, the tool's name on its tooltip");
assert.ok(detail.includes('<strong class="af-toolwords__key">a.md</strong>') && detail.includes('<strong class="af-toolwords__key">b.md</strong>'), "each call's key argument");
assert.ok(detail.includes("2 file writes"), "the group line counts the calls");
assert.ok(!detail.split("<details>")[0].includes("<pre") && !detail.split("<details>")[0].includes("{&quot;"), "no JSON outside the disclosure");
const strArgs = renderToStaticMarkup(React.createElement(React.Fragment, null, presentInteraction({ runId: "r", wait: { wait_key: "k", details: { mode: "approval_required", tool_calls: [{ name: "fetch_url", arguments: JSON.stringify({ url: "https://example.org/a" }) }] } } }, controller).detail));
assert.ok(strArgs.includes('title="fetch_url">Fetch</span>') && strArgs.includes("example.org"), "string-encoded arguments are read too");
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
assert.deepEqual(calls.at(-1), ["resume", "tue", { runId: "run-2", waitKey: "ask:1", stepId: undefined }], "the answer resumes the run, targeted at the question shown");
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


// --- ui-primitives (chat): questions and approvals, backlog 0032 ----------------------
// The ONE wording set (ADR 0001 §5): Deny / Allow once / Allow for this chat / Allow all
// enabled tools; a dismissal defers, never denies; the scope sentence is the host's.
{
  const { WORKFLOW_INTERACTION_LABELS: W, WorkflowInteractionPanel, isReplayInteraction, replayInteractionWait } = pc;
  assert.deepEqual(
    [W.deny, W.allowOnce, W.allowForChat, W.allowAll, W.decideLater, W.skip, W.keepWaiting],
    ["Deny", "Allow once", "Allow for this chat", "Allow all enabled tools", "Decide later", "Continue without answering", "Keep waiting"],
    "the one wording set",
  );
  assert.equal(t.approveLabel, "Allow once");
  assert.equal(t.denyLabel, "Deny");
  for (const key of ["onApproveForSession", "onDefer", "remember", "disabledReason"]) assert.equal(t[key], undefined, `${key} only when the host injects it`);
  assert.equal(ask.onSkip, undefined, "Continue without answering only when the host asks for it");
  assert.equal(ask.onDefer, undefined, "Keep waiting only when the host injects it");

  // Neutral scope by default: the kit never claims account scope on its own.
  assert.doesNotMatch(all.approveAllDescription, /account|browser|device/i, "the default scope sentence asserts no storage scope");
  const scoped = presentInteraction(toolWait, controller, { onPermissionsAll: async () => {}, approveAllScope: "for this Gateway account" });
  assert.match(scoped.approveAllDescription, /^Sets permissions: all for this Gateway account, including future turns\./, "the host's scope sentence");

  // Allow for this chat: approve this batch, then the host's chat-scoped grant.
  let session = 0;
  const sess2 = presentInteraction(toolWait, controller, { onAllowForSession: async () => void (session += 1) });
  assert.equal(sess2.approveForSessionLabel, "Allow for this chat");
  assert.match(sess2.approveForSessionDescription, /rest of this chat/);
  await sess2.onApproveForSession();
  assert.deepEqual(calls.at(-1), ["approveWithPolicyChange", target], "Allow for this chat → approveWithPolicyChange(exact target)");
  assert.equal(session, 1, "the host's chat grant runs once the batch is approved");

  // Decide later / Keep waiting send nothing; Continue without answering resumes empty.
  let deferred = 0;
  const before = calls.length;
  const later = presentInteraction(toolWait, controller, { onDefer: () => void (deferred += 1), approveAllDisabledReason: "Not offered: a tool is disabled on the gateway.", remember: (names) => ({ label: `Always allow ${names.join(", ")} in this browser`, checked: false, onChange: () => {} }) });
  later.onDefer();
  assert.equal(deferred, 1);
  assert.equal(calls.length, before, "a deferral sends no command (never a deny)");
  assert.equal(later.disabledReason, "Not offered: a tool is disabled on the gateway.");
  assert.equal(later.remember.label, "Always allow write_file in this browser", "remember is per tool, worded by the host");
  const skip = presentInteraction({ runId: "run-2", wait: { wait_key: "ask:1", reason: "ask_user", prompt: "Which day?" } }, controller, { allowSkip: true, onDefer: () => {} });
  assert.equal(typeof skip.onDefer, "function", "Keep waiting on a question when injected");
  await skip.onSkip();
  assert.deepEqual(calls.at(-1), ["resume", "", { runId: "run-2", waitKey: "ask:1", stepId: undefined }], "Continue without answering resumes with an empty answer, targeted at the question shown");

  // Review L3: a failed chat-wide grant is surfaced, never an unhandled rejection.
  const failing = presentInteraction(toolWait, controller, { onAllowForSession: async () => { throw new Error("storage full"); } });
  await assert.rejects(() => failing.onApproveForSession(), /could not be turned on: storage full/, "a failed Allow for this chat is shown to the person");

  // replay_view_v1.interaction → the same control as the raw wait.
  const replayTool = {
    kind: "tool_approval", run_id: "run-1", wait_key: "approve:1", step_id: "step-9", seq: 12, prompt: null, choices: null, allow_free_text: null,
    details: { mode: "approval_required" }, tool_calls: toolWait.wait.details.tool_calls, activity_id: "a1",
    command: { type: "resume", run_id: "run-1", payload: { wait_key: "approve:1" } },
  };
  assert.equal(isReplayInteraction(replayTool), true);
  assert.equal(isReplayInteraction(toolWait), false, "a raw wait is not a replay interaction");
  const fromReplay = presentInteraction(replayTool, controller);
  for (const key of ["id", "kind", "title", "toolName", "approveLabel", "denyLabel", "description"]) assert.equal(fromReplay[key], t[key], `replay ${key} = raw ${key}`);
  assert.equal(
    renderToStaticMarkup(React.createElement(React.Fragment, null, fromReplay.detail)),
    renderToStaticMarkup(React.createElement(React.Fragment, null, t.detail)),
    "replay tool calls render the same review",
  );
  await fromReplay.onApprove();
  assert.deepEqual(calls.at(-1), ["approve", true, target], "replay Allow once → the same exact target");
  const replayAsk = { kind: "ask_user", run_id: "run-2", wait_key: "ask:1", step_id: null, prompt: "Which day?", choices: ["Monday", { value: "tue", label: "Tuesday", description: "after 2 pm" }], allow_free_text: false, details: {}, tool_calls: null };
  const askReplay = presentInteraction(replayAsk, controller);
  assert.deepEqual({ ...askReplay, onSubmit: 0 }, { ...ask, onSubmit: 0 }, "replay question = raw question");
  await askReplay.onSubmit("tue");
  assert.deepEqual(calls.at(-1), ["resume", "tue", { runId: "run-2", waitKey: "ask:1", stepId: undefined }], "a replay answer carries the replay's run_id / wait_key");
  assert.equal(replayInteractionWait(replayAsk).wait.reason, "user");

  // --- the panel renders the decisions it was given, and only those ----------------------
  const html = (interaction, props = {}) => renderToStaticMarkup(React.createElement(WorkflowInteractionPanel, { interaction, ...props }));
  const noop = () => {};
  const bare = { id: "x", kind: "tool-approval", toolName: "shell", onApprove: noop, onDeny: noop };
  const plain = html(bare);
  assert.match(plain, /data-decision="deny"[^>]*>Deny</, "default Deny");
  assert.match(plain, /data-decision="approve"[^>]*>Allow once</, "default Allow once (never 'Approve')");
  for (const d of ["defer", "approve-session", "approve-all"]) assert.ok(!plain.includes(`data-decision="${d}"`), `no ${d} unless injected`);
  assert.ok(!plain.includes("pc-workflow-interaction__remember"), "no remember checkbox unless injected");
  const full = html({ ...bare, onApproveForSession: noop, onApproveAll: noop, onDefer: noop, remember: { label: "Always allow shell in this browser", checked: true, onChange: noop } });
  assert.match(full, /data-decision="defer"[^>]*>Decide later</);
  assert.match(full, /data-decision="approve-session"[^>]*>Allow for this chat</);
  assert.match(full, /data-decision="approve-all"[^>]*>Allow all enabled tools</);
  assert.match(full, /<input type="checkbox" checked=""\/><span>Always allow shell in this browser<\/span>/, "remember checkbox with the host's label");
  const blocked = html({ ...bare, onApproveForSession: noop, onApproveAll: noop, disabledReason: "Not offered: this batch includes a tool the gateway does not list." });
  assert.match(blocked, /data-decision="approve-session" disabled=""/, "session grant disabled with a reason");
  assert.match(blocked, /data-decision="approve-all" disabled=""/, "allow-all disabled with a reason");
  assert.match(blocked, /data-decision="approve">Allow once</, "Allow once stays available");
  assert.ok(blocked.includes("Not offered: this batch includes a tool the gateway does not list."), "the reason is visible");
  const askHtml = html({ id: "q", kind: "ask-user", prompt: "Pick", choices: [{ id: "a", label: "A" }], allowFreeText: true, onSubmit: noop, onSkip: noop, onDefer: noop });
  assert.match(askHtml, /data-decision="choice"[^>]*><span>A</, "choices render as buttons");
  assert.ok(askHtml.includes('aria-label="Response"'), "free text when allowed");
  assert.match(askHtml, /data-decision="skip"[^>]*>Continue without answering</);
  assert.match(askHtml, /data-decision="defer"[^>]*>Keep waiting</);
  const askBare = html({ id: "q", kind: "ask-user", prompt: "Pick", allowFreeText: false, choices: [{ id: "a", label: "A" }], onSubmit: noop });
  assert.ok(!askBare.includes('data-decision="skip"') && !askBare.includes('data-decision="defer"'), "no skip/defer unless injected");
  assert.ok(!askBare.includes('aria-label="Response"'), "no free text when the question forbids it");
  const cardHtml = html({ ...bare, detail: "rm -rf build", description: "long explainer" }, { variant: "card" });
  assert.ok(cardHtml.includes('class="pc-workflow-interaction pc-workflow-interaction--card" data-variant="card"'), "card variant");
  assert.match(cardHtml, /<details class="pc-workflow-interaction__review"><summary>Review<\/summary>/, "card folds the detail behind Review");
  assert.ok(cardHtml.includes("long explainer"), "card keeps the description (e.g. why an event cannot be sent)");
  assert.match(cardHtml, /data-decision="approve"[^>]*>Allow once</, "card keeps the same decisions");
  assert.ok(html(bare).includes('data-variant="panel"'), "panel is the default variant");

  // Behaviour (hook harness): a deferral never settles; a skip settles once.
  const { mount, byData, textOf } = await import("./hook_harness.mjs");
  const log = [];
  const h = mount(WorkflowInteractionPanel, { interaction: { ...bare, onApprove: async () => void log.push("approve"), onDefer: () => void log.push("defer") } });
  byData(h.tree, "data-decision", "defer").props.onClick();
  await h.settle();
  assert.deepEqual(log, ["defer"]);
  assert.equal(byData(h.tree, "data-decision", "approve").props.disabled, false, "after Decide later the decision is still available");
  assert.match(textOf(h.tree), /Nothing was sent; the run keeps waiting/, "deferral says nothing was sent");
  byData(h.tree, "data-decision", "approve").props.onClick();
  await h.settle();
  assert.deepEqual(log, ["defer", "approve"]);
  assert.equal(byData(h.tree, "data-decision", "approve").props.disabled, true, "an accepted decision settles the panel");
  const q = mount(WorkflowInteractionPanel, { interaction: { id: "q", kind: "ask-user", prompt: "?", onSubmit: noop, onSkip: async () => void log.push("skip") } });
  byData(q.tree, "data-decision", "skip").props.onClick();
  await q.settle();
  assert.equal(log.at(-1), "skip");
  assert.equal(byData(q.tree, "data-decision", "skip").props.disabled, true, "skip settles like an answer");
}

console.log("check_present_interaction: OK (+ 0032 wording set, session/defer/skip only when injected, neutral scope, card variant, replay input)");
