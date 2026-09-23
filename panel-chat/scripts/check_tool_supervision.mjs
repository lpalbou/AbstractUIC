// Independent no-network safety/progress contracts. Build panel-chat first.
// node scripts/check_tool_supervision.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkflowSessionController, workflowPendingInteraction } from "../dist/workflow_runtime.js";
import { workflowProgress } from "../dist/workflow_progress.js";

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const target = (runId, waitKey) => ({ runId, waitKey });
const approval = (waitKey, names = ["write_file"]) => ({
  step_id: `step:${waitKey}`, status: "waiting",
  effect: { type: "tool_calls", payload: { tool_calls: names.map((name, index) => ({ name, runtime_call_id: `${waitKey}:${index}`, arguments: { file_path: "src/example.ts" } })) } },
  result: { wait: { reason: "user", wait_key: waitKey, details: { mode: "approval_required", kind: "tool_approval", tool_calls: names.map(name => ({ name })) } } },
});
const question = waitKey => ({
  step_id: `step:${waitKey}`, status: "waiting", effect: { type: "ask_user" },
  result: { wait: { reason: "user", wait_key: waitKey, prompt: "Choose the target workspace", details: { kind: "ask_user" } } },
});

async function harness(t, { root = "root", children = [] } = {}) {
  const commands = [], streams = new Map(), cursors = new Map(), states = new Map();
  let submit = async () => ({ accepted: true });
  for (const id of [root, ...children]) states.set(id, { run_id: id, status: id === root ? "waiting" : "running" });
  const transport = {
    getRun: async id => states.get(id) || { run_id: id, status: "running" },
    getHistory: async id => ({ ledgers: { [id]: { items: children.map((child, index) => ({
      cursor: index + 1,
      record: { run_id: id, step_id: `spawn:${child}`, status: "completed", effect: { type: "start_subworkflow" }, result: { sub_run_id: child } },
    })) } } }),
    getLedger: async (_id, after) => ({ items: [], next_after: after }),
    streamLedger: async (id, after, onStep, signal, onOpen) => {
      const pending = deferred();
      streams.set(id, { onStep, close: pending.resolve, reject: pending.reject });
      cursors.set(id, Math.max(cursors.get(id) || 0, after));
      onOpen?.();
      signal.addEventListener("abort", pending.resolve, { once: true });
      await pending.promise;
    },
    submitCommand: async command => { commands.push(command); return submit(command); },
  };
  const controller = new WorkflowSessionController(transport, { clientId: "independent-supervision-test" });
  t.after(() => controller.dispose());
  await controller.load(root);
  await flush();
  return {
    controller, commands, streams, states,
    setSubmit: fn => { submit = fn; },
    emit(id, record) {
      const cursor = (cursors.get(id) || 0) + 1;
      cursors.set(id, cursor);
      assert(streams.has(id), `test requires a watched run: ${id}`);
      streams.get(id).onStep({ cursor, record: { run_id: id, ...record } });
    },
    async terminal(status = "completed") {
      states.set(root, { run_id: root, status, output: { response: "Finished" } });
      streams.get(root).close();
      await flush();
      assert.equal(controller.getSnapshot().status, status, "terminal test setup must use authoritative getRun, not a completed step");
    },
  };
}

test("an approval is bound to the displayed child and exact wait, not the replacement request", async t => {
  const h = await harness(t, { children: ["child-a", "child-b"] });
  h.emit("child-a", approval("approval:1"));
  const shown = target("child-a", "approval:1");
  h.emit("child-b", approval("approval:1"));
  await assert.rejects(async () => h.controller.approve(true, shown), /changed|stale|current request/i);
  await assert.rejects(() => h.controller.allowAllToolsForRun(shown), /changed|stale|current request/i);
  assert.equal(h.commands.length, 0, "unseen child must receive no consent");
  h.emit("child-b", approval("approval:2"));
  await assert.rejects(async () => h.controller.approve(false, target("child-b", "approval:1")), /changed|stale|current request/i);
  await h.controller.approve(true, target("child-b", "approval:2"));
  assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].run_id, "child-b");
  assert.deepEqual(h.commands[0].payload, { wait_key: "approval:2", payload: { approved: true } });
});

test("host permission-all never enables unchecked, missing or served-disabled tools", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["read_file"], autoApproveTools: ["read_file", "write_file"] });
  h.emit("root", approval("blocked", ["write_file"]));
  await assert.rejects(async () => h.controller.approve(true, target("root", "blocked")), /unavailable|unselected/);
  h.emit("root", approval("malformed", []));
  await flush();
  assert.equal(h.commands.length, 0);
  h.emit("root", approval("allowed", ["read_file"]));
  await flush();
  assert.equal(h.commands.length, 1);
});

test("permissions preserve explicit Ask and repeated wait-key occurrences", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["read_file", "write_file"], autoApproveTools: ["read_file"] });
  h.emit("root", approval("ask", ["write_file"]));
  assert.equal(h.commands.length, 0);
  h.emit("root", { ...approval("reused", ["read_file"]), step_id: "step-one" });
  await flush();
  h.emit("root", { ...approval("reused", ["read_file"]), step_id: "step-two" });
  await flush();
  assert.equal(h.commands.length, 2);
  await assert.rejects(async () => h.controller.approve(true, { ...target("root", "reused"), stepId: "step-one" }), /changed/);
});

test("host permissions survive reload but never answer questions", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  await h.controller.load("root");
  await flush();
  h.emit("root", question("question"));
  assert.equal(h.commands.length, 0);
  h.emit("root", approval("next"));
  await flush();
  assert.equal(h.commands.length, 1);
});

test("permission refresh cannot undo Stop while its command is pending", async t => {
  const h = await harness(t), pending = deferred();
  h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  h.setSubmit(() => pending.promise);
  const stopping = h.controller.cancel();
  h.controller.setToolApprovalPolicy({ enabledTools: ["read_file", "write_file"], autoApproveTools: ["read_file", "write_file"] });
  h.emit("root", approval("after-stop"));
  assert.equal(h.commands.length, 1);
  pending.resolve({ accepted: true });
  await stopping;
});

test("remembered permissions change only after accepted consent, then supervise the next occurrence", async t => {
  const h = await harness(t), pending = deferred();
  let changes = 0;
  h.emit("root", approval("remember"));
  h.setSubmit(() => pending.promise);
  const consent = h.controller.approveWithPolicyChange(target("root", "remember"), () => {
    changes += 1;
    h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  });
  assert.equal(changes, 0, "an unacknowledged command must not persist permission changes");
  pending.resolve({ accepted: true });
  await consent;
  assert.equal(changes, 1);
  assert.equal(h.commands.length, 1, "remembering policy cannot approve the same occurrence twice");
  h.emit("root", { ...approval("remember"), step_id: "next-occurrence" });
  await flush();
  assert.equal(h.commands.length, 2);
  assert.notEqual(h.commands[0].command_id, h.commands[1].command_id);
});

for (const boundary of ["auth-reset", "auth-error", "revoke", "stop", "terminal"]) {
  test(`${boundary} prevents a delayed approval acknowledgement from persisting permissions`, async t => {
    const h = await harness(t), pending = deferred(), pendingCancel = deferred();
    let changes = 0;
    h.emit("root", approval("remember"));
    h.setSubmit(command => command.type === "cancel" ? pendingCancel.promise : pending.promise);
    const consent = h.controller.approveWithPolicyChange(target("root", "remember"), () => { changes += 1; });
    let stopping;
    if (boundary === "auth-reset") await h.controller.load("new-identity-run");
    if (boundary === "auth-error") {
      h.streams.get("root").reject(Object.assign(new Error("identity expired"), { status: 401 }));
      await flush();
    }
    if (boundary === "revoke") h.controller.revokeToolApproval();
    if (boundary === "stop") stopping = h.controller.cancel();
    if (boundary === "terminal") await h.terminal("completed");
    pending.resolve({ accepted: true });
    await consent;
    assert.equal(changes, 0, "consent belongs to the original live identity and unretracted intent");
    pendingCancel.resolve({ accepted: true });
    await stopping;
  });
}

test("rejected remembered consent does not call the persistence callback", async t => {
  const h = await harness(t);
  let changes = 0;
  h.emit("root", approval("remember"));
  h.setSubmit(async () => ({ accepted: false, detail: "operator grant rejected" }));
  await assert.rejects(() => h.controller.approveWithPolicyChange(target("root", "remember"), () => { changes += 1; }), /rejected/);
  assert.equal(changes, 0);
});

test("new occurrences of the same wait key retain distinct commands while prior acknowledgements are pending", async t => {
  const h = await harness(t), first = deferred(), second = deferred();
  h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  h.setSubmit(() => h.commands.length === 1 ? first.promise : second.promise);
  h.emit("root", { ...approval("reused"), step_id: "occurrence-1" });
  h.emit("root", { ...approval("reused"), step_id: "occurrence-2" });
  assert.equal(h.commands.length, 2, "the second step cannot inherit the first step's in-flight deduplication");
  assert.notEqual(h.commands[0].command_id, h.commands[1].command_id);
  first.resolve({ accepted: true });
  await flush();
  h.emit("root", { ...approval("reused"), step_id: "occurrence-2" });
  await flush();
  assert.equal(h.commands.length, 2, "the late first acknowledgement cannot clear the second occurrence's guard");
  second.resolve({ accepted: true });
  await flush();
});

test("Allow once authorizes the current whole batch but no subsequent batch", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1", ["write_file", "execute_command"]));
  await h.controller.approve(true, target("root", "batch:1"));
  h.emit("root", approval("batch:2"));
  await flush();
  assert.equal(h.commands.length, 1);
  assert.deepEqual(h.commands[0].payload, { wait_key: "batch:1", payload: { approved: true } });
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.equal(h.controller.getSnapshot().interaction.wait.wait_key, "batch:2");
});

test("run consent approves future root/child tool waits exactly once and retains keyed Gateway commands", async t => {
  const h = await harness(t, { children: ["child"] });
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.emit("child", approval("batch:2", ["execute_command", "write_file"]));
  h.emit("child", approval("batch:2", ["execute_command", "write_file"]));
  h.emit("root", { step_id: "progress", status: "completed", effect: { type: "emit_event", payload: { name: "abstract.status", payload: "Checking files" } } });
  await flush();
  assert.equal(h.commands.length, 2, "replayed wait and unrelated snapshot updates cannot repeat consent");
  assert.equal(h.commands[1].run_id, "child");
  assert.equal(h.commands[1].type, "resume");
  assert.deepEqual(h.commands[1].payload, { wait_key: "batch:2", payload: { approved: true } });
  assert(h.commands.every(command => command.command_id && command.client_id === "independent-supervision-test"));
  assert.notEqual(h.commands[0].command_id, h.commands[1].command_id);
  assert.equal(h.controller.getSnapshot().autoApproveTools, true);
});

test("run consent never answers a question, event wait, or unidentified wait", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.emit("root", question("question:1"));
  await assert.rejects(() => h.controller.allowAllToolsForRun(target("root", "question:1")), /not a tool approval/i);
  h.emit("root", { status: "waiting", result: { wait: { reason: "event", wait_key: "evt:trigger", details: { name: "trigger" } } } });
  h.emit("root", { status: "waiting", result: { wait: { reason: "user", wait_key: "unknown:1", details: {} } } });
  await flush();
  assert.equal(h.commands.length, 1, "only the original explicitly approved batch was submitted");
});

test("a failed initial grant grants nothing; retry preserves the exact command identity", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  h.setSubmit(async () => { throw new Error("acknowledgement lost"); });
  await assert.rejects(() => h.controller.allowAllToolsForRun(target("root", "batch:1")), /acknowledgement lost/);
  assert(!h.controller.getSnapshot().autoApproveTools);
  h.setSubmit(async () => ({ accepted: true, duplicate: true }));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  assert.equal(h.commands.length, 2);
  assert.equal(h.commands[0].command_id, h.commands[1].command_id, "ambiguous submission retry cannot create duplicate execution intent");
  assert.equal(h.controller.getSnapshot().autoApproveTools, true);
});

test("an explicitly rejected grant is not consent", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  h.setSubmit(async () => ({ accepted: false, detail: "not authorized" }));
  await assert.rejects(() => h.controller.allowAllToolsForRun(target("root", "batch:1")), /not authorized/);
  assert(!h.controller.getSnapshot().autoApproveTools);
  h.emit("root", approval("batch:2"));
  assert.equal(h.commands.length, 1);
});

test("a failed automatic approval revokes the grant and does not enter a retry loop", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.setSubmit(async () => { throw new Error("Gateway unavailable"); });
  h.emit("root", approval("batch:2"));
  await flush();
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.match(h.controller.getSnapshot().error, /Gateway unavailable/);
  h.emit("root", approval("batch:2"));
  h.emit("root", approval("batch:3"));
  await flush();
  assert.equal(h.commands.length, 2);
});

test("explicit revocation leaves future batches pending for review", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.controller.revokeToolApproval();
  h.emit("root", approval("batch:2"));
  await flush();
  assert.equal(h.commands.length, 1);
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.equal(h.controller.getSnapshot().interaction.wait.wait_key, "batch:2");
});

test("revocation wins over a delayed acknowledgement of the initial run grant", async t => {
  const h = await harness(t), pending = deferred();
  h.emit("root", approval("batch:1"));
  h.setSubmit(() => pending.promise);
  const grant = h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.controller.revokeToolApproval();
  pending.resolve({ accepted: true });
  await grant;
  assert(!h.controller.getSnapshot().autoApproveTools, "a revoked grant must not reactivate after its HTTP acknowledgement");
  h.emit("root", approval("batch:2"));
  assert.equal(h.commands.length, 1);
});

for (const grantAcceptedFirst of [true, false]) test(`Stop intent expires ${grantAcceptedFirst ? "active" : "in-flight"} consent before Gateway cancellation converges`, async t => {
  const h = await harness(t), pendingGrant = deferred(), pendingCancel = deferred();
  h.emit("root", approval("batch:1"));
  h.setSubmit(command => command.type === "cancel" ? pendingCancel.promise : pendingGrant.promise);
  const grant = h.controller.allowAllToolsForRun(target("root", "batch:1"));
  if (grantAcceptedFirst) {
    pendingGrant.resolve({ accepted: true });
    await grant;
    assert.equal(h.controller.getSnapshot().autoApproveTools, true);
  }
  const cancel = h.controller.cancel();
  assert(!h.controller.getSnapshot().autoApproveTools, "Stop intent revokes immediately, before any Gateway acknowledgement");
  if (!grantAcceptedFirst) {
    pendingGrant.resolve({ accepted: true });
    await grant;
  }
  h.emit("root", approval("batch:2"));
  await flush();
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.equal(h.commands.length, 2, "no further tool batch is approved while cancellation is pending");
  assert.deepEqual(h.commands.map(command => command.type), ["resume", "cancel"]);
  assert.equal(h.controller.getSnapshot().status, "waiting", "Stop intent is not falsely reported as confirmed cancellation");
  pendingCancel.resolve({ accepted: true });
  await cancel;
});

test("a late grant completion cannot cross reset/new-run boundaries", async t => {
  const h = await harness(t), pending = deferred();
  h.emit("root", approval("batch:1"));
  h.setSubmit(() => pending.promise);
  const grant = h.controller.allowAllToolsForRun(target("root", "batch:1"));
  await h.controller.load("other-root");
  pending.resolve({ accepted: true });
  await grant;
  h.emit("other-root", approval("batch:other"));
  await flush();
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.equal(h.commands.length, 1);
});

test("reloading even the same run does not restore browser-local consent", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  await h.controller.load("root");
  h.emit("root", approval("batch:2"));
  await flush();
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.equal(h.commands.length, 1);
});

test("a paused root cannot automatically approve a newly arrived child request", async t => {
  const h = await harness(t, { children: ["child"] });
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.states.set("root", { run_id: "root", status: "waiting", paused: true });
  await h.controller.sendCommand("pause", {});
  await flush();
  assert.equal(h.controller.getSnapshot().run.paused, true);
  h.emit("child", approval("batch:2"));
  await flush();
  assert.equal(h.commands.length, 2, "only initial batch approval and explicit lifecycle pause were sent");
  assert.equal(h.commands[1].type, "pause");
  assert.equal(h.controller.getSnapshot().interaction.wait.wait_key, "batch:2");
  assert.equal(workflowProgress(h.controller.getSnapshot()).label, "Paused");
});

test("authentication failure expires run consent even if the host has not reset yet", async t => {
  const h = await harness(t);
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  const previous = h.streams.get("root");
  previous.reject(Object.assign(new Error("session expired"), { status: 401 }));
  await flush();
  assert(!h.controller.getSnapshot().autoApproveTools);
  previous.onStep({ cursor: 99, record: { run_id: "root", ...approval("late:2") } });
  await flush();
  assert.equal(h.commands.length, 1);
});

test("authentication failure also invalidates an initial grant still in flight", async t => {
  const h = await harness(t), pending = deferred();
  h.emit("root", approval("batch:1"));
  h.setSubmit(() => pending.promise);
  const grant = h.controller.allowAllToolsForRun(target("root", "batch:1"));
  h.streams.get("root").reject(Object.assign(new Error("forbidden"), { status: 403 }));
  await flush();
  pending.resolve({ accepted: true });
  await grant;
  assert(!h.controller.getSnapshot().autoApproveTools, "an invalidated identity cannot gain future consent from a late acknowledgement");
});

for (const status of ["completed", "failed", "cancelled"]) test(`authoritative ${status} expires consent and ignores late approval records`, async t => {
  const h = await harness(t, { children: ["child"] });
  h.emit("root", approval("batch:1"));
  await h.controller.allowAllToolsForRun(target("root", "batch:1"));
  await h.terminal(status);
  h.emit("child", approval("late:2"));
  assert(!h.controller.getSnapshot().autoApproveTools);
  assert.equal(h.controller.getSnapshot().interaction, null);
  assert.equal(h.commands.length, 1);
});

const record = (cursor, stepId, status, type, runId = "child", extra = {}) => ({
  cursor, runId, record: { run_id: runId, step_id: stepId, status, effect: { type }, ...extra },
});
const progress = overrides => workflowProgress({
  status: "waiting", loading: false, connection: "connected", interaction: null, records: [],
  run: { run_id: "root", status: "waiting", created_at: "2026-09-20T10:00:00Z" }, displayStatus: "",
  ...overrides,
});

test("helper completed/Done cannot claim that a parent waiting on its active LLM is finished", () => {
  for (const displayStatus of ["completed", "Done", "finished", "ready"]) {
    const result = progress({ displayStatus, records: [record(1, "llm", "started", "llm_call")] });
    assert.equal(result.tone, "working");
    assert.match(`${result.label} ${result.detail}`, /thinking|generating/i);
    assert.doesNotMatch(`${result.label} ${result.detail}`, /completed|done|finished|ready/i);
  }
});

test("a completed ledger step is not a completed run; replayed LLM STARTED cannot resurrect thinking", () => {
  const records = [record(1, "llm", "started", "llm_call"), record(2, "llm", "completed", "llm_call"), record(3, "llm", "started", "llm_call")];
  const result = progress({ records, displayStatus: "completed" });
  assert.equal(result.tone, "working");
  assert.doesNotMatch(`${result.label} ${result.detail}`, /completed|thinking|generating/i);
});

test("helper lifecycle text cannot contradict active root state between observable steps", () => {
  for (const displayStatus of ["completed", "complete", "Done", "finished", "ready", "failed", "cancelled", "stopped"]) {
    const result = progress({ displayStatus });
    assert.equal(result.tone, "working");
    assert.doesNotMatch(`${result.label} ${result.detail}`, /completed|complete|done|finished|ready|failed|cancelled|stopped/i, `helper status ${displayStatus} is not root authority`);
  }
});

test("terminal root authority dominates pending tools, stale waits, and lost streams", () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    const result = progress({ status, connection: "disconnected", displayStatus: "Generating response", interaction: { runId: "child", wait: approval("old").result.wait }, records: [record(1, "llm", "started", "llm_call")] });
    assert.equal(result.detail, "");
    assert.equal(result.label, status === "completed" ? "Completed" : status === "failed" ? "Run failed" : "Stopped");
    assert.equal(result.tone, status === "completed" ? "success" : status === "failed" ? "error" : "neutral");
  }
});

test("progress distinguishes approval, questions, optional event triggers, pause, and disconnection", () => {
  assert.equal(progress({ interaction: { runId: "child", wait: approval("a").result.wait } }).label, "Approval needed");
  assert.equal(progress({ interaction: { runId: "child", wait: question("q").result.wait } }).label, "Your answer is needed");
  assert.equal(progress({ interaction: { runId: "root", wait: { reason: "event", wait_key: "evt:changed" } } }).label, "Waiting for an event");
  assert.equal(progress({ status: "paused", interaction: { runId: "child", wait: approval("a").result.wait } }).label, "Paused");
  assert.equal(progress({ connection: "disconnected" }).label, "Disconnected");
});

test("active tool progress identifies the actual tool without invented usage", () => {
  const result = progress({ records: [record(1, "tools", "started", "tool_calls", "child", { effect: { type: "tool_calls", payload: { tool_calls: [{ name: "read_file", runtime_call_id: "call:1", arguments: { file_path: "README.md" } }] } } })] });
  assert.equal(result.label, "Running a tool");
  assert.equal(result.detail, "read_file");
  assert.equal(result.tone, "working");
  assert.equal(result.totalTokens, undefined, "unknown tokens must not be fabricated as zero");
});

test("abstract.status accepts canonical value payloads and explicit empty clears", async t => {
  const h = await harness(t);
  const emitStatus = payload => h.emit("root", { status: "completed", effect: { type: "emit_event", payload: { name: "abstract.status", payload } } });
  emitStatus({ value: "Inspecting project files" });
  assert.equal(h.controller.getSnapshot().displayStatus, "Inspecting project files");
  emitStatus("");
  assert.equal(h.controller.getSnapshot().displayStatus, "", "an explicit empty status clears stale activity");
  emitStatus({ text: "Indexing workspace" });
  emitStatus({ value: "" });
  assert.equal(h.controller.getSnapshot().displayStatus, "");
});

test("older child status replay cannot replace newer progress; late helpers cannot overwrite terminal status", async t => {
  const h = await harness(t, { children: ["child"] });
  const status = (payload, ended_at) => ({ status: "completed", ended_at, effect: { type: "emit_event", payload: { name: "abstract.status", payload } } });
  h.emit("root", status("Verifying changes", "2026-09-20T10:00:04Z"));
  h.emit("child", status("Reading files", "2026-09-20T10:00:01Z"));
  assert.equal(h.controller.getSnapshot().displayStatus, "Verifying changes");
  await h.terminal();
  h.emit("child", status("More work", "2026-09-20T10:00:05Z"));
  assert.equal(h.controller.getSnapshot().displayStatus, "");
});

// ---- Granted tool approvals are running work, never a question (mission G:
// the "Approval needed" flash under "Permissions: all"). Every PUBLISHED
// snapshot is checked, not just the final one: the operator saw a transient.
const shownAsQuestion = snapshot => {
  const reasons = [];
  if (workflowPendingInteraction(snapshot)) reasons.push("pending interaction");
  if (workflowProgress(snapshot).label === "Approval needed") reasons.push("Approval needed");
  if (snapshot.messages.some(message => message.toolActivity?.status === "waiting")) reasons.push("tool needs approval");
  return reasons;
};
const recordSnapshots = (t, controller) => {
  const seen = [];
  t.after(controller.subscribe(() => seen.push(controller.getSnapshot())));
  return seen;
};
const resumed = waitKey => ({ step_id: `resume:${waitKey}`, status: "completed", effect: { type: "resume", payload: { wait_key: waitKey } }, result: { resumed: true } });

test("a batch covered by the standing permission is never presented as a question, in any published snapshot", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["fetch_url", "skim_websearch"], autoApproveTools: ["fetch_url", "skim_websearch"] });
  const seen = recordSnapshots(t, h.controller);
  h.emit("root", { ...approval("batch:1", ["fetch_url", "fetch_url"]), step_id: "tools:1" });
  const snapshot = h.controller.getSnapshot();
  assert.equal(snapshot.toolApprovalGranted, true);
  assert.equal(snapshot.interaction.wait.wait_key, "batch:1", "the raw wait is kept for command routing");
  assert.equal(workflowPendingInteraction(snapshot), null);
  const progressNow = workflowProgress(snapshot);
  assert.equal(progressNow.label, "Running 2 tools");
  assert.equal(progressNow.tone, "working");
  assert.deepEqual(snapshot.messages.filter(m => m.toolActivity).map(m => m.toolActivity.status), ["running", "running"]);
  await flush();
  assert.equal(h.commands.length, 1, "the browser approver still answers the server's ask exactly once");
  for (const [index, published] of seen.entries()) assert.deepEqual(shownAsQuestion(published), [], `published snapshot #${index} presented a covered batch as a question`);
  h.emit("root", resumed("batch:1"));
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, false);
});

test("a covered batch replayed while the run is still loading is not flashed as a question", async t => {
  // A just-started run: the first approval arrives in the history bundle,
  // before `loading` ends. The approver waits for load; presentation must not.
  const wait = approval("first", ["write_file", "write_file", "write_file"]);
  const commands = [];
  const transport = {
    getRun: async id => ({ run_id: id, status: "waiting", waiting: wait.result.wait }),
    getHistory: async id => ({ ledgers: { [id]: { items: [{ cursor: 1, record: { run_id: id, ...wait } }] } } }),
    getLedger: async (_id, after) => ({ items: [], next_after: after }),
    streamLedger: async (_id, _after, _onStep, signal) => new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })),
    submitCommand: async command => { commands.push(command); return { accepted: true }; },
  };
  const controller = new WorkflowSessionController(transport, { clientId: "loading-test" });
  t.after(() => controller.dispose());
  controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  const seen = recordSnapshots(t, controller);
  await controller.load("root");
  await flush();
  assert.equal(commands.length, 1, "approved once loading ends");
  assert(seen.some(s => s.loading && s.interaction), "test must exercise an interaction published while loading");
  for (const [index, published] of seen.entries()) assert.deepEqual(shownAsQuestion(published), [], `published snapshot #${index} (loading=${published.loading}) presented a covered batch as a question`);
});

test("batches outside the permission still ask exactly as before", async t => {
  for (const policy of [
    { enabledTools: ["write_file"], autoApproveTools: [] },                          // permissions: default
    { enabledTools: ["read_file", "write_file"], autoApproveTools: ["read_file"] }, // explicit Ask for write_file
    { enabledTools: ["read_file"], autoApproveTools: ["read_file", "write_file"] }, // write_file disabled
  ]) {
    const h = await harness(t);
    h.controller.setToolApprovalPolicy(policy);
    h.emit("root", approval("ask", ["write_file"]));
    await flush();
    const snapshot = h.controller.getSnapshot();
    assert.equal(snapshot.toolApprovalGranted, false, JSON.stringify(policy));
    assert.equal(workflowPendingInteraction(snapshot).wait.wait_key, "ask");
    assert.equal(workflowProgress(snapshot).label, "Approval needed");
    assert(snapshot.messages.some(m => m.toolActivity?.status === "waiting"));
    assert.equal(h.commands.length, 0);
  }
});

test("revocation: the dispatched batch stays running, the next batch asks", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  h.emit("root", approval("batch:1"));
  assert.equal(h.commands.length, 1);
  h.controller.revokeToolApproval();
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, true, "a dispatched approval cannot be recalled; the batch is executing");
  assert.equal(workflowPendingInteraction(h.controller.getSnapshot()), null);
  h.emit("root", resumed("batch:1"));
  h.emit("root", approval("batch:2"));
  await flush();
  const snapshot = h.controller.getSnapshot();
  assert.equal(h.commands.length, 1);
  assert.equal(snapshot.toolApprovalGranted, false);
  assert.equal(workflowPendingInteraction(snapshot).wait.wait_key, "batch:2");
  assert.equal(workflowProgress(snapshot).label, "Approval needed");
});

test("a failed automatic approval brings the question back", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  h.setSubmit(async () => { throw new Error("Gateway unavailable"); });
  h.emit("root", approval("batch:1"));
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, true);
  await flush();
  const snapshot = h.controller.getSnapshot();
  assert.equal(snapshot.toolApprovalGranted, false);
  assert.equal(workflowPendingInteraction(snapshot).wait.wait_key, "batch:1");
  assert.equal(workflowProgress(snapshot).label, "Approval needed");
  assert(snapshot.messages.some(m => m.toolActivity?.status === "waiting"), "raw waiting status is restored");
});

test("an accepted Allow once runs the batch; a Deny keeps the question until the ledger resumes", async t => {
  const h = await harness(t);
  h.emit("root", approval("allow"));
  assert.equal(workflowProgress(h.controller.getSnapshot()).label, "Approval needed");
  await h.controller.approve(true, target("root", "allow"));
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, true);
  assert.equal(workflowPendingInteraction(h.controller.getSnapshot()), null);
  h.emit("root", resumed("allow"));
  h.emit("root", approval("deny"));
  await h.controller.approve(false, target("root", "deny"));
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, false);
  assert.equal(workflowPendingInteraction(h.controller.getSnapshot()).wait.wait_key, "deny");
});

test("a question is never marked granted, even under the standing permission", async t => {
  const h = await harness(t);
  h.controller.setToolApprovalPolicy({ enabledTools: ["write_file"], autoApproveTools: ["write_file"] });
  h.emit("root", question("q"));
  assert.equal(h.controller.getSnapshot().toolApprovalGranted, false);
  assert.equal(workflowPendingInteraction(h.controller.getSnapshot()).wait.wait_key, "q");
});

test("progress: a granted approval reads as running tools, an ungranted one as Approval needed", () => {
  const raw = approval("a", ["fetch_url", "fetch_url"]);
  const wait = raw.result.wait, records = [{ cursor: 1, runId: "child", record: { run_id: "child", ...raw } }];
  assert.equal(progress({ records, interaction: { runId: "child", wait } }).label, "Approval needed");
  const granted = progress({ records, interaction: { runId: "child", wait }, toolApprovalGranted: true });
  assert.equal(granted.label, "Running 2 tools");
  assert.equal(granted.detail, "fetch_url");
  assert.equal(granted.tone, "working");
  const done = [...records, { cursor: 2, runId: "child", record: { run_id: "child", step_id: "step:a", status: "completed", effect: raw.effect, result: { results: [{ name: "fetch_url", runtime_call_id: "a:0", success: true }, { name: "fetch_url", runtime_call_id: "a:1", success: true }] } } }];
  const finished = progress({ records: done, interaction: { runId: "child", wait }, toolApprovalGranted: true });
  assert.notEqual(finished.label, "Approval needed");
  assert.doesNotMatch(finished.label, /^Running/, "completed tools are not reported as running while the resume record is in flight");
  assert.equal(progress({ status: "paused", toolApprovalGranted: true, interaction: { runId: "child", wait } }).label, "Paused");
});
