// Lightweight no-network contract check for the transport-injected runtime.
// Run after `npm run build`: node scripts/check_workflow_runtime.mjs
import assert from "node:assert/strict";
import { WorkflowSessionController } from "../dist/workflow_runtime.js";

const commands = [];
const streams = [];
const root = "root-run";
const child = "child-run";

const transport = {
  async getRun(runId) {
    if (runId === "old-run") return { run_id: runId, status: "completed", output: { response: "earlier answer" } };
    return { run_id: runId, status: runId === root ? "waiting" : "running" };
  },
  async getHistory() {
    return {
      run: { run_id: root, status: "waiting" },
      ledgers: {
        [root]: {
          items: [
            { cursor: 1, record: { run_id: root, status: "completed", effect: { type: "answer_user", payload: { message: "ignored" } }, result: { message: "hello from ledger" } } },
            { cursor: 2, record: { run_id: root, status: "completed", effect: { type: "tool_calls", payload: { tool_calls: [{ name: "read_file" }] } }, result: {} } },
            { cursor: 3, record: { run_id: root, status: "completed", effect: { type: "start_subworkflow", payload: {} }, result: { sub_run_id: child } } },
            { cursor: 4, record: { run_id: root, status: "waiting", effect: { type: "tool_calls", payload: {} }, result: { wait: { wait_key: "approval:1", reason: "user", details: { kind: "tool_approval", tool_calls: [{ name: "write_file" }] } } } } },
          ],
        },
      },
      session: { turns: [
        { run_id: root, input_data: { prompt: "this turn" }, output: { response: "hello from ledger" } },
        { run_id: "old-run", input_data: { prompt: "earlier question" }, output: { response: "earlier answer" } },
      ] },
    };
  },
  async getLedger(runId, after) {
    if (runId === child && after === 0) return { items: [{ cursor: 1, record: { run_id: child, status: "completed", effect: { type: "flow_end", payload: {} }, result: { output: { response: "child final must not duplicate" } } } }], next_after: 1 };
    return { items: [], next_after: after };
  },
  async streamLedger(runId, after, onStep, signal) {
    streams.push({ runId, after, onStep });
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
  },
  async submitCommand(command) {
    commands.push(command);
    return { accepted: true, duplicate: false, seq: commands.length };
  },
};

const controller = new WorkflowSessionController(transport, { clientId: "runtime-test" });
await controller.load(root);
await new Promise((resolve) => setTimeout(resolve, 0));
let snapshot = controller.getSnapshot();
assert.equal(snapshot.interaction?.runId, root);
assert.equal(snapshot.interaction?.wait.wait_key, "approval:1");
assert(snapshot.messages.some((m) => m.content === "hello from ledger"));
assert(snapshot.messages.some((m) => /read_file/.test(m.content)));
assert(snapshot.messages.some((m) => m.content === "earlier answer"));
assert(!snapshot.messages.some((m) => m.content.includes("child final must not duplicate")));
assert.equal(snapshot.messages.filter((m) => m.content === "hello from ledger").length, 1, "session and ledger final are one chat reply");
assert(streams.some((stream) => stream.runId === child), "subworkflow should be observed");

// A completed LEDGER STEP is not a completed RUN. The gateway only declares
// root terminal state through the run snapshot after its final stream drain.
streams.find((stream) => stream.runId === root).onStep({ cursor: 5, record: { run_id: root, status: "completed", effect: { type: "tool_calls", payload: { tool_calls: [{ name: "write_file" }] } }, result: { output: { response: "tool result must not become final" } } } });
assert.equal(controller.getSnapshot().status, "waiting");
assert(!controller.getSnapshot().messages.some((m) => m.content.includes("tool result must not become final")));

await controller.approve(true);
assert.equal(commands.length, 1);
assert.equal(commands[0].type, "resume");
assert.deepEqual(commands[0].payload, { wait_key: "approval:1", payload: { approved: true } });
assert.equal(commands[0].client_id, "runtime-test");
// Accepted command does not optimistically clear a safety-sensitive wait.
assert.equal(controller.getSnapshot().interaction?.wait.wait_key, "approval:1");
streams.find((stream) => stream.runId === root).onStep({ cursor: 6, record: { run_id: root, status: "completed", effect: { type: "resume", payload: {} }, result: { resumed: true } } });
snapshot = controller.getSnapshot();
assert.equal(snapshot.interaction, null);
assert.throws(() => controller.approve(true), /not waiting/i);
assert.equal(commands.length, 1, "a cleared wait cannot submit a second approval");
// STARTED/COMPLETED pairs emit one durable completed UI event. String
// payloads are a legitimate event form and must not disappear as `{}`.
const rootStream = streams.find((stream) => stream.runId === root);
rootStream.onStep({ cursor: 7, record: { run_id: root, status: "started", effect: { type: "emit_event", payload: { name: "abstract.message", payload: "once" } }, result: {} } });
rootStream.onStep({ cursor: 8, record: { run_id: root, status: "completed", effect: { type: "emit_event", payload: { name: "abstract.message", payload: "once" } }, result: {} } });
assert.equal(controller.getSnapshot().messages.filter((m) => m.content === "once").length, 1);
assert.equal(controller.getSnapshot().connection, "connected", "a received ledger record marks the stream connected");
controller.dispose();

// A transient stream failure remains visible only until a genuinely opened
// SSE stream heals it. This second stream stays quiet: no ledger event is
// required when a transport provides the optional onOpen signal.
let healedAttempts = 0;
const healedController = new WorkflowSessionController({
  async getRun() { return { run_id: "healed", status: "running" }; },
  async getHistory() { return { ledgers: { healed: { items: [] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger(_runId, _after, _onStep, signal, onOpen) {
    healedAttempts += 1;
    if (healedAttempts === 1) throw new Error("brief stream outage");
    onOpen?.();
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
  },
  async submitCommand() { return { accepted: true }; },
});
await healedController.load("healed");
await new Promise((resolve) => setTimeout(resolve, 220));
assert.equal(healedAttempts, 2, "a bounded reconnect starts after a transient stream failure");
assert.equal(healedController.getSnapshot().connection, "connected", "a quiet successfully opened SSE stream heals connection state");
assert.equal(healedController.getSnapshot().error, null, "onOpen clears stale stream error without an event");
healedController.dispose();

// Child ledger discovery can race the child store. A transient read failure
// clears the watched marker and retries rather than becoming an unhandled
// rejected void promise that permanently hides the child.
let childLedgerReads = 0;
const childRetryController = new WorkflowSessionController({
  async getRun(runId) { return { run_id: runId, status: "running" }; },
  async getHistory() { return { ledgers: { parent: { items: [
    { cursor: 1, record: { run_id: "parent", status: "completed", effect: { type: "start_subworkflow", payload: {} }, result: { sub_run_id: "retry-child" } } },
  ] } } }; },
  async getLedger(runId, after) {
    if (runId !== "retry-child" || after !== 0) return { items: [], next_after: after };
    childLedgerReads += 1;
    if (childLedgerReads === 1) throw new Error("child ledger not ready");
    return { items: [{ cursor: 1, record: { run_id: runId, status: "completed", effect: { type: "answer_user", payload: {} }, result: { message: "child recovered" } } }], next_after: 1 };
  },
  async streamLedger(_runId, _after, _onStep, signal) { await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); },
  async submitCommand() { return { accepted: true }; },
});
await childRetryController.load("parent");
await new Promise((resolve) => setTimeout(resolve, 220));
assert.equal(childLedgerReads, 2, "child ledger catch-up retried once after a transient failure");
assert(childRetryController.getSnapshot().messages.some((m) => m.content === "child recovered"), "child data is not lost after retry");
childRetryController.dispose();

// A delayed command can reject after a user loads another run. Its failure
// must not overwrite the new session with stale error state.
let rejectDelayedCommand;
const staleCommandController = new WorkflowSessionController({
  async getRun() { return { run_id: "stale-command", status: "running" }; },
  async getHistory() { return { ledgers: { "stale-command": { items: [] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger(_runId, _after, _onStep, signal) { await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); },
  async submitCommand() { return new Promise((_resolve, reject) => { rejectDelayedCommand = reject; }); },
});
await staleCommandController.load("stale-command");
const delayedCommand = staleCommandController.sendCommand("pause", {});
staleCommandController.reset();
rejectDelayedCommand(new Error("old command failed"));
await assert.rejects(delayedCommand, /old command failed/);
assert.equal(staleCommandController.getSnapshot().error, null, "stale command rejection cannot poison reset snapshot");
staleCommandController.dispose();

// A pause can update only root metadata while the ledger SSE remains open.
// The command acknowledgement is not treated as truth: getRun owns the
// visible state, and lifecycle resume without a wait_key must target root.
let lifecycleStatus = "waiting";
const lifecycleCommands = [];
const lifecycleController = new WorkflowSessionController({
  async getRun(runId) { return runId === "lifecycle" ? { run_id: runId, status: lifecycleStatus } : { run_id: runId, status: "waiting" }; },
  async getHistory() { return { run: { run_id: "lifecycle", status: "waiting" }, ledgers: { lifecycle: { items: [
    { cursor: 1, record: { run_id: "lifecycle", status: "completed", effect: { type: "start_subworkflow", payload: {} }, result: { sub_run_id: "lifecycle-child" } } },
  ] } } }; },
  async getLedger(runId, after) {
    if (runId === "lifecycle-child" && after === 0) return { items: [
      { cursor: 1, record: { run_id: runId, status: "waiting", result: { wait: { wait_key: "child-wait" } } } },
    ], next_after: 1 };
    return { items: [], next_after: after };
  },
  async streamLedger(_runId, _after, _onStep, signal) { await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); },
  async submitCommand(command) { lifecycleCommands.push(command); return { accepted: true }; },
});
await lifecycleController.load("lifecycle");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(lifecycleController.getSnapshot().interaction?.runId, "lifecycle-child", "test setup has a child wait");
lifecycleStatus = "paused";
await lifecycleController.sendCommand("pause", {});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(lifecycleController.getSnapshot().status, "paused", "pause state comes from authoritative run metadata");
await lifecycleController.sendCommand("resume", {});
assert.equal(lifecycleCommands.at(-1).run_id, "lifecycle", "lifecycle resume without wait_key targets root");
lifecycleStatus = "cancelled";
await new Promise((resolve) => setTimeout(resolve, 2100));
assert.equal(lifecycleController.getSnapshot().status, "cancelled", "active wait observes an external root cancellation without SSE closure");
assert.equal(lifecycleController.getSnapshot().interaction, null, "external terminal state clears a stale wait");
lifecycleController.dispose();

// The real prompt-structured fixture has an intermediate answer_user, then a
// null-effect visual end row, and finally an arbitrary object in terminal
// run.output. Only the authoritative terminal snapshot may produce the final.
let structuredReads = 0;
const structuredController = new WorkflowSessionController({
  async getRun() {
    structuredReads += 1;
    return structuredReads > 1
      ? { run_id: "prompt-structured", status: "completed", output: { fixture: "prompt-structured", ok: true, kind: "structured-output", result: { continued: true }, success: true } }
      : { run_id: "prompt-structured", status: "running" };
  },
  async getHistory() {
    return { run: { run_id: "prompt-structured", status: "running" }, input_data: { prompt: "Continue the e2e fixture?" }, session: { turns: [
      { run_id: "prompt-structured", prompt: "Continue the e2e fixture?", answer: null },
    ] }, ledgers: { "prompt-structured": { items: [
      { cursor: 1, record: { run_id: "prompt-structured", status: "completed", effect: { type: "answer_user", payload: {} }, result: { message: "Fixture is live. Please answer the durable question." } } },
      { cursor: 6, record: { run_id: "prompt-structured", node_id: "end", status: "completed", effect: null, result: { completed: true, output: { fixture: "prompt-structured", ok: true, kind: "structured-output", result: { continued: true }, success: true } } } },
    ] } } };
  },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { /* terminal SSE done follows final drain */ },
  async submitCommand() { return { accepted: true }; },
});
await structuredController.load("prompt-structured");
await new Promise((resolve) => setTimeout(resolve, 0));
const structuredSnapshot = structuredController.getSnapshot();
assert(structuredSnapshot.messages.some((m) => m.content.includes("Fixture is live")), "intermediate answer_user remains visible");
assert(structuredSnapshot.messages.some((m) => m.role === "user" && m.content === "Continue the e2e fixture?"), "public session prompt is shown instead of being synthesized");
const finals = structuredSnapshot.messages.filter((m) => m.id === "final:prompt-structured");
assert.equal(finals.length, 1, "terminal structured result is deduplicated");
assert.deepEqual(JSON.parse(finals[0].content), { fixture: "prompt-structured", ok: true, kind: "structured-output", result: { continued: true }, success: true });
assert(structuredSnapshot.messages.findIndex((m) => m.content.includes("Fixture is live")) < structuredSnapshot.messages.findIndex((m) => m.id === "final:prompt-structured"), "live terminal final follows intermediate history");
structuredController.dispose();

// A reload begins with a terminal GET /runs result. It must preserve exactly
// the same chronological transcript order as a live stream completion.
const reloadController = new WorkflowSessionController({
  async getRun() { return { run_id: "reload-structured", status: "completed", output: { ok: true, result: { continued: true } } }; },
  async getHistory() { return { input_data: { prompt: "Continue the e2e fixture?" }, session: { turns: [
    { run_id: "reload-structured", prompt: "Continue the e2e fixture?", answer: null },
  ] }, ledgers: { "reload-structured": { items: [
    { cursor: 1, record: { run_id: "reload-structured", status: "completed", effect: { type: "answer_user", payload: {} }, result: { message: "Fixture is live. Please answer the durable question." } } },
  ] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { throw new Error("terminal runs do not stream"); },
  async submitCommand() { return { accepted: true }; },
});
await reloadController.load("reload-structured");
const reloadMessages = reloadController.getSnapshot().messages;
assert(reloadMessages.findIndex((m) => m.role === "user" && m.content === "Continue the e2e fixture?") < reloadMessages.findIndex((m) => m.content.includes("Fixture is live")), "reload preserves public prompt before the intermediate reply");
assert(reloadMessages.findIndex((m) => m.content.includes("Fixture is live")) < reloadMessages.findIndex((m) => m.id === "final:reload-structured"), "reload terminal final follows intermediate history");
reloadController.dispose();

// History bundles intentionally keep only lightweight session turns. Restore
// each returned older root's terminal output so a structured first turn is
// not silently replaced by its intermediate shelf answer on the second turn.
let priorHydrationReads = 0;
const multiTurnController = new WorkflowSessionController({
  async getRun(runId) {
    if (runId === "first-turn") {
      priorHydrationReads += 1;
      return { run_id: runId, status: "completed", output: { kind: "first-structured", accepted: true } };
    }
    return { run_id: "second-turn", status: "completed", output: { kind: "second-structured", accepted: true } };
  },
  async getHistory() { return { session: { turns: [
    { run_id: "first-turn", prompt: "First prompt", answer: "First intermediate shelf reply" },
    { run_id: "second-turn", prompt: "Second prompt", answer: "Second intermediate shelf reply" },
  ] }, ledgers: { "second-turn": { items: [
    { cursor: 1, record: { run_id: "second-turn", status: "completed", effect: { type: "answer_user", payload: {} }, result: { message: "Second intermediate ledger reply" } } },
  ] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { throw new Error("terminal runs do not stream"); },
  async submitCommand() { return { accepted: true }; },
});
await multiTurnController.load("second-turn");
const multiTurnMessages = multiTurnController.getSnapshot().messages;
assert.equal(priorHydrationReads, 1, "only returned historical session roots are hydrated once");
assert.deepEqual(multiTurnMessages.map((message) => message.content), [
  "First prompt",
  JSON.stringify({ kind: "first-structured", accepted: true }, null, 2),
  "Second prompt",
  "Second intermediate ledger reply",
  JSON.stringify({ kind: "second-structured", accepted: true }, null, 2),
], "two-turn replay keeps prior structured final and current prompt/intermediate/final in order exactly once");
multiTurnController.dispose();

// When the session shelf is absent, the root's own public input_data still
// has to precede a ledger reply rather than being appended after it.
const inputOnlyController = new WorkflowSessionController({
  async getRun() { return { run_id: "input-only", status: "running" }; },
  async getHistory() { return { input_data: { prompt: "Input-only prompt" }, ledgers: { "input-only": { items: [
    { cursor: 1, record: { run_id: "input-only", status: "completed", effect: { type: "answer_user", payload: {} }, result: { message: "Input-only intermediate" } } },
  ] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger(_runId, _after, _onStep, signal) { await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); },
  async submitCommand() { return { accepted: true }; },
});
await inputOnlyController.load("input-only");
assert.deepEqual(inputOnlyController.getSnapshot().messages.map((message) => message.content), ["Input-only prompt", "Input-only intermediate"], "input_data prompt precedes ledger reply when session turns are absent");
inputOnlyController.dispose();

// A stream can close only after the gateway has made the root terminal and
// performed its final drain. The refreshed root snapshot clears a stale wait.
let terminalReads = 0;
const terminalController = new WorkflowSessionController({
  async getRun() { terminalReads += 1; return { run_id: "terminal", status: terminalReads > 1 ? "completed" : "waiting", waiting: { wait_key: "stale" } }; },
  async getHistory() { return { run: { run_id: "terminal", status: "waiting" }, ledgers: { terminal: { items: [] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { /* gateway sent done after final drain */ },
  async submitCommand() { return { accepted: true }; },
});
await terminalController.load("terminal");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(terminalController.getSnapshot().status, "completed");
assert.equal(terminalController.getSnapshot().interaction, null, "terminal root cannot retain a stale accepted wait");
terminalController.dispose();

// Reconnects are bounded. A permanent stream fault ends in a visible,
// disconnected state instead of an immortal background retry loop.
const reconnectController = new WorkflowSessionController({
  async getRun() { return { run_id: "reconnect", status: "running" }; },
  async getHistory() { return { run: { run_id: "reconnect", status: "running" }, ledgers: { reconnect: { items: [] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { throw new Error("network down"); },
  async submitCommand() { return { accepted: true }; },
});
await reconnectController.load("reconnect");
await new Promise((resolve) => setTimeout(resolve, 2600));
assert.equal(reconnectController.getSnapshot().connection, "disconnected");
assert.match(reconnectController.getSnapshot().error || "", /network down|reconnect limit/i);
reconnectController.dispose();

// A 401/403 is not retried with the same principal. The transport owns its
// ephemeral bearer; the controller only reports the transition to its host.
let authErrors = 0;
const authController = new WorkflowSessionController({
  async getRun() { return { run_id: "auth", status: "running" }; },
  async getHistory() { return { run: { run_id: "auth", status: "running" }, ledgers: { auth: { items: [] } } }; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { throw { status: 401, detail: "expired" }; },
  async submitCommand() { return { accepted: true }; },
}, { onAuthError: () => { authErrors += 1; } });
await authController.load("auth");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(authErrors, 1);
assert.equal(authController.getSnapshot().connection, "disconnected");
authController.dispose();

// Abort is advisory at transport boundaries. A buffered page for an old
// session must not leak its records into the next principal/session.
let releaseOldLedger;
let oldLedgerStarted;
const oldLedgerReady = new Promise((resolve) => { oldLedgerStarted = resolve; });
const staleLedgerController = new WorkflowSessionController({
  async getRun(runId) { return { run_id: runId, status: "completed", output: { run: runId } }; },
  async getHistory() { return {}; },
  async getLedger(runId, after) {
    if (runId !== "old-ledger") return { items: [], next_after: after };
    oldLedgerStarted();
    return new Promise((resolve) => { releaseOldLedger = resolve; });
  },
  async streamLedger() { throw new Error("terminal run must not stream"); },
  async submitCommand() { return { accepted: true }; },
});
const oldLedgerLoad = staleLedgerController.load("old-ledger");
await oldLedgerReady;
await staleLedgerController.load("new-ledger");
releaseOldLedger({ items: [{ cursor: 1, record: { run_id: "old-ledger", status: "completed", effect: { type: "answer_user" }, result: { message: "old principal data" } } }], next_after: 1 });
await oldLedgerLoad;
assert.equal(staleLedgerController.getSnapshot().run.run_id, "new-ledger");
assert.equal(staleLedgerController.getSnapshot().records.length, 0, "stale catch-up records are discarded");
assert(!staleLedgerController.getSnapshot().messages.some((message) => message.content.includes("old principal data")));
staleLedgerController.dispose();

// A child snapshot request can complete after the user opens that same run
// as the new root. It must not replace the new root with an older snapshot.
let releaseOldChild;
let childSnapshotReads = 0;
const staleChildController = new WorkflowSessionController({
  async getRun(runId) {
    if (runId === "delayed-child" && ++childSnapshotReads === 1) return new Promise((resolve) => { releaseOldChild = resolve; });
    return { run_id: runId, status: "completed", output: { current: true } };
  },
  async getHistory(runId) { return runId === "old-parent" ? { ledgers: { "old-parent": { items: [
    { cursor: 1, record: { run_id: "old-parent", status: "completed", effect: { type: "start_subworkflow" }, result: { sub_run_id: "delayed-child" } } },
  ] } } } : {}; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger() { throw new Error("terminal run must not stream"); },
  async submitCommand() { return { accepted: true }; },
});
await staleChildController.load("old-parent");
await staleChildController.load("delayed-child");
releaseOldChild({ run_id: "delayed-child", status: "failed", output: { stale: true } });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(staleChildController.getSnapshot().status, "completed", "late child response cannot replace current root lifecycle");
assert(!staleChildController.getSnapshot().messages.some((message) => message.content.includes("stale")));
staleChildController.dispose();

// Late background child waits cannot resurrect a finished root or reopen an
// approval gate after the authoritative root has completed.
let releaseChildWait;
const finishedRootController = new WorkflowSessionController({
  async getRun(runId) { return { run_id: runId, status: runId === "finished-root" ? "completed" : "running" }; },
  async getHistory() { return { ledgers: { "finished-root": { items: [
    { cursor: 1, record: { run_id: "finished-root", status: "completed", effect: { type: "start_subworkflow" }, result: { sub_run_id: "late-wait-child" } } },
  ] } } }; },
  async getLedger(runId, after) {
    if (runId === "late-wait-child" && !after) return new Promise((resolve) => { releaseChildWait = resolve; });
    return { items: [], next_after: after };
  },
  async streamLedger(_runId, _after, _onStep, signal) { await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); },
  async submitCommand() { return { accepted: true }; },
});
await finishedRootController.load("finished-root");
releaseChildWait({ items: [{ cursor: 1, record: { run_id: "late-wait-child", status: "waiting", result: { wait: { wait_key: "late-approval", reason: "user" } } } }], next_after: 1 });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(finishedRootController.getSnapshot().status, "completed");
assert.equal(finishedRootController.getSnapshot().interaction, null);
finishedRootController.dispose();

let childAuthErrors = 0;
let forbiddenChildLedgerReads = 0;
const childAuthController = new WorkflowSessionController({
  async getRun(runId) {
    if (runId === "forbidden-child") throw { status: 403, detail: "child access revoked" };
    return { run_id: runId, status: "completed" };
  },
  async getHistory() { return { ledgers: { "auth-parent": { items: [
    { cursor: 1, record: { run_id: "auth-parent", status: "completed", effect: { type: "start_subworkflow" }, result: { sub_run_id: "forbidden-child" } } },
  ] } } }; },
  async getLedger(runId, after) { if (runId === "forbidden-child") forbiddenChildLedgerReads += 1; return { items: [], next_after: after }; },
  async streamLedger() {},
  async submitCommand() { return { accepted: true }; },
}, { onAuthError: () => { childAuthErrors += 1; } });
await childAuthController.load("auth-parent");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(childAuthErrors, 1, "a child snapshot authorization failure reaches host recovery");
assert.equal(forbiddenChildLedgerReads, 0, "authorization failure cannot fall through to child ledger reads");
childAuthController.dispose();

const unknownStatusController = new WorkflowSessionController({
  async getRun(runId) { return { run_id: runId }; },
  async getHistory() { return {}; },
  async getLedger(_runId, after) { return { items: [], next_after: after }; },
  async streamLedger(_runId, _after, _onStep, signal) { await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); },
  async submitCommand() { return { accepted: true }; },
});
await unknownStatusController.load("unknown-status");
assert.equal(unknownStatusController.getSnapshot().status, "unknown", "absent lifecycle metadata cannot invent a running status");
unknownStatusController.dispose();
console.log("workflow runtime checks passed");
