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
assert.equal(t.onApproveAll, undefined, "no Allow All without a session grant");
assert.equal(t.approveAllLabel, undefined);
assert.equal(t.description, undefined, "no explanatory description under the title");
assert.equal(t.scopeNote, "Allow covers this request only.", "without a session grant, Allow says it covers this request only");
await t.onApprove();
assert.deepEqual(calls.at(-1), ["approve", true, target], "Allow (no session grant) → approve(true, exact target)");
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
// Operator ruling 2026-10-29: a bold first line (the only bold), one bullet per call, plain parameters, no count line.
assert.ok(detail.includes('<p class="af-toolwords__heading"><strong>The assistant wants to use these tools:</strong></p>'), "the bold first line");
assert.ok(detail.includes("the file a.md") && detail.includes("the file b.md") && !detail.includes("af-toolwords__key"), "each call's key argument, in plain text");
assert.ok(!detail.includes("2 file writes") && (detail.split("<details>")[0].match(/<strong/g) || []).length === 1, "no count line; the heading is the only bold");
assert.ok(!detail.split("<details>")[0].includes("<pre") && !detail.split("<details>")[0].includes("{&quot;"), "no JSON outside the disclosure");
const strArgs = renderToStaticMarkup(React.createElement(React.Fragment, null, presentInteraction({ runId: "r", wait: { wait_key: "k", details: { mode: "approval_required", tool_calls: [{ name: "fetch_url", arguments: JSON.stringify({ url: "https://example.org/a" }) }] } } }, controller).detail));
assert.ok(strArgs.includes('title="fetch_url">Fetch</span>') && strArgs.includes("example.org"), "string-encoded arguments are read too");
// Allow and Allow All for the rest of this session: the controller's session tool policy (gateway mode).
const sessionCalls = [];
const sessionController = (mode, policy = null) => ({
  ...controller,
  sessionPolicyStatus: () => ({ mode, clamped: [], policy, ...(mode === "unavailable" ? { reason: "HTTP 502" } : {}) }),
  approveToolsForSession: async (target, tools) => (sessionCalls.push(["tools", target, tools]), { approve: Object.fromEntries(tools.map((n) => [n, "tool"])), deny: {}, clamped: [] }),
  approveAllForSession: async (target, options) => (sessionCalls.push(["all", target, options]), { approve: { write_file: "all" }, deny: {}, clamped: [] }),
});
const gw = presentInteraction(toolWait, sessionController("gateway"), { sessionPolicy: true });
assert.equal(gw.approveLabel, "Allow");
assert.equal(gw.approveAllLabel, "Allow All");
assert.equal(gw.denyLabel, "Deny");
assert.equal(gw.approveTitle, "Allow write_file for the rest of this session");
assert.equal(gw.approveAllTitle, "Allow every tool for the rest of this session");
assert.equal(gw.scopeNote, undefined, "a session grant needs no note");
const beforeSession = calls.length;
await gw.onApprove();
assert.deepEqual(sessionCalls.at(-1), ["tools", target, ["write_file"]], "Allow → approveToolsForSession(exact target, this request's tools)");
await gw.onApproveAll();
assert.deepEqual(sessionCalls.at(-1), ["all", target, {}], "Allow All → approveAllForSession(exact target), every tool");
assert.equal(calls.length, beforeSession, "the session grants answer the wait themselves (write first, then answer)");
await gw.onDeny();
assert.deepEqual(calls.at(-1), ["approve", false, target], "Deny refuses this request only");
for (const mode of ["local-fallback", "unavailable"]) {
  const degraded = presentInteraction(toolWait, sessionController(mode), { sessionPolicy: true });
  assert.equal(degraded.onApproveAll, undefined, `${mode}: no Allow All (no session grant exists)`);
  assert.equal(degraded.scopeNote, "This gateway cannot keep a choice for the session, so Allow covers this request only.", `${mode}: one line says so`);
  await degraded.onApprove();
  assert.deepEqual(calls.at(-1), ["approve", true, target], `${mode}: Allow answers this request`);
}
assert.throws(() => presentInteraction(toolWait, controller, { sessionPolicy: true }), /needs a WorkflowSessionController/, "sessionPolicy without a session controller fails loudly");
const denied = presentInteraction(toolWait, sessionController("gateway", { approve: {}, deny: { write_file: "tool" } }), { sessionPolicy: true });
assert.match(denied.deniedNote, /Denied by this session's policy: write_file/);
assert.match(String((await denied.onApprove())?.outcomeNote), /refuses write_file/, "Allow on a denied tool reports the refusal");
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
// The ONE wording set (ADR 0001 §5; operator ruling 2026-11-07): Deny / Allow / Allow All;
// a dismissal defers, never denies.
{
  const { WORKFLOW_INTERACTION_LABELS: W, WorkflowInteractionPanel, isReplayInteraction, replayInteractionWait } = pc;
  assert.deepEqual(
    [W.deny, W.allow, W.allowAll, W.decideLater, W.skip, W.keepWaiting],
    ["Deny", "Allow", "Allow All", "Decide later", "Continue without answering", "Keep waiting"],
    "the one wording set",
  );
  for (const gone of ["allowOnce", "allowForChat", "allowKindForChat", "allowForRun", "denyToolForChat", "denyKindForChat"]) assert.equal(W[gone], undefined, `no ${gone}`);
  assert.equal(t.approveLabel, "Allow");
  assert.equal(t.denyLabel, "Deny");
  for (const key of ["onDefer", "onApproveForSession", "approveKinds", "denyOptions", "remember", "disabledReason", "broadScopeSummary", "approveAllDescription", "approveForSessionDescription", "policySummary"]) assert.equal(gw[key], undefined, `${key} is not on the card`);
  assert.equal(ask.onSkip, undefined, "Continue without answering only when the host asks for it");
  assert.equal(ask.onDefer, undefined, "Keep waiting only when the host injects it");
  for (const gone of ["onPermissionsAll", "approveAllScope", "onAllowForSession", "remember"]) {
    const legacy = presentInteraction(toolWait, controller, { [gone]: async () => {} });
    assert.equal(legacy.onApproveAll, undefined, `the removed ${gone} option offers nothing`);
  }

  // Decide later / Keep waiting send nothing; Continue without answering resumes empty.
  let deferred = 0;
  const before = calls.length;
  const later = presentInteraction(toolWait, controller, { onDefer: () => void (deferred += 1) });
  later.onDefer();
  assert.equal(deferred, 1);
  assert.equal(calls.length, before, "a deferral sends no command (never a deny)");
  const skip = presentInteraction({ runId: "run-2", wait: { wait_key: "ask:1", reason: "ask_user", prompt: "Which day?" } }, controller, { allowSkip: true, onDefer: () => {} });
  assert.equal(typeof skip.onDefer, "function", "Keep waiting on a question when injected");
  await skip.onSkip();
  assert.deepEqual(calls.at(-1), ["resume", "", { runId: "run-2", waitKey: "ask:1", stepId: undefined }], "Continue without answering resumes with an empty answer, targeted at the question shown");

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
  assert.deepEqual(calls.at(-1), ["approve", true, target], "replay Allow → the same exact target");
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
  assert.match(plain, /data-decision="approve"[^>]*>Allow</, "default Allow (never 'Approve' or 'Allow once')");
  for (const d of ["defer", "approve-all"]) assert.ok(!plain.includes(`data-decision="${d}"`), `no ${d} unless injected`);
  // The card (operator ruling 2026-11-07): exactly three decisions, no explanatory blocks.
  const three = html(gw);
  const buttons = [...three.matchAll(/<button[^>]*data-decision="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(buttons, [["deny", "Deny"], ["approve", "Allow"], ["approve-all", "Allow All"]], "exactly Deny, Allow, Allow All");
  assert.match(three, /data-decision="approve"[^>]*title="Allow write_file for the rest of this session"/, "Allow's reach on its tooltip");
  assert.match(three, /data-decision="approve-all"[^>]*title="Allow every tool for the rest of this session"/, "Allow All's reach on its tooltip");
  for (const gone of ["Allow once", "Allow for this chat", "Allow all enabled tools", "for this chat", "Review the targets below", "The broader choices", "What the broader choices allow", "<summary>More</summary>", "Always deny", "type=\"checkbox\""]) assert.ok(!three.includes(gone), `no "${gone}" on the card`);
  assert.ok(three.includes("<summary>Review full tool arguments (JSON)</summary>"), "the JSON disclosure stays");
  assert.ok(three.includes(">2 actions need permission</h3>"), "the title stays");
  assert.ok(!three.includes("pc-workflow-interaction__scope"), "no scope paragraph on a session grant");
  const full = html({ ...bare, onApproveAll: noop, onDefer: noop });
  assert.match(full, /data-decision="defer"[^>]*>Decide later</);
  assert.match(full, /data-decision="approve-all"[^>]*>Allow All</);
  const noted = html({ ...bare, scopeNote: "Allow covers this request only." });
  assert.ok(noted.includes('data-scope-note="">Allow covers this request only.<'), "the one-line note when there is no session grant");
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
  assert.match(cardHtml, /data-decision="approve"[^>]*>Allow</, "card keeps the same decisions");
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

console.log("check_present_interaction: OK (Deny / Allow / Allow All for this session, nothing else on the card, defer/skip only when injected, card variant, replay input)");
