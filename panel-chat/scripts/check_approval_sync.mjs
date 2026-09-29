// The approval gate is the same in every client (operator ruling, 2026-09-29:
// "The run waits for your approval, in every client"; one session pool for
// all clients). A basic-agent turn parks its ROOT run on `subworkflow:<child>`
// while the AGENT LOOP child asks for the tool approval. The client that
// started the turn sees the child's waiting record arrive live; a client that
// opens the same conversation later rebuilds it from durable state
// (GET /runs/{root}, the history bundle with the child's ledger, GET
// /runs/{child}). Both must present the gate: card, "Approval needed" strip,
// and the transcript's tool row parked on the decision.
//
// Fixture: scripts/fixtures/run_approval_subrun.json — a live gateway capture
// (2026-09-29, basic-agent@0.0.5, "create a snake webgame and open it"),
// redacted. Its waiting record carries the ledger's `$slim` pointer in
// `effect.payload.tool_calls`, exactly as GET /ledger, the bundle and the SSE
// tail serve it (the store slims the terminal record at write time).
//
// Run after `npm run build`: node scripts/check_approval_sync.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WorkflowSessionController, workflowPendingInteraction } from "../dist/workflow_runtime.js";
import { workflowProgress } from "../dist/workflow_progress.js";
import { foldWorkflowTools, workflowEvidence } from "../dist/workflow_evidence.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/run_approval_subrun.json", import.meta.url), "utf8"));
const ROOT = fixture.root_run.run_id;
const CHILD = fixture.child_run.run_id;
const SIBLING = fixture.sibling_run.run_id;
const APPROVAL_KEY = fixture.child_run.waiting.wait_key;
assert.match(APPROVAL_KEY, /^tool_approval:/, "fixture: the child parks on a tool approval");
assert.equal(fixture.root_run.waiting.reason, "subworkflow", "fixture: the root parks on its agent loop");
const clone = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i += 1) await tick(); };

/** A gateway as the panel sees it: run snapshots, one history bundle, paged
 * ledgers, parked SSE streams (records are pushed by the test), commands. */
function gateway({ bundle, runs, streams = [], commands = [] }) {
  return {
    streams,
    commands,
    transport: {
      async getRun(runId) {
        const run = runs[runId];
        if (!run) throw { status: 404, detail: `Run '${runId}' not found` };
        return clone(run);
      },
      async getHistory(runId) { assert.equal(runId, ROOT, "only the root's bundle is fetched"); return clone(bundle); },
      async getLedger(runId, after) {
        const items = (bundle.ledgers[runId]?.items || []).filter((item) => item.cursor > after);
        return { items: clone(items), next_after: after + items.length };
      },
      async streamLedger(runId, after, onStep, signal) {
        streams.push({ runId, after, onStep });
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      },
      async submitCommand(command) { commands.push(command); return { accepted: true }; },
    },
  };
}

/** The bundle as it was moments before the child asked: the child's waiting
 * record does not exist yet (the originating client loaded then). */
function bundleBeforeTheWait() {
  const bundle = clone(fixture.bundle);
  const child = bundle.ledgers[CHILD];
  child.items = child.items.filter((item) => item.record.status !== "waiting");
  child.total = child.items.length; child.cursor_end = child.items.length;
  return bundle;
}
const childWaitingRecord = fixture.bundle.ledgers[CHILD].items.find((item) => item.record.status === "waiting");
assert(childWaitingRecord, "fixture: the child's ledger carries its waiting record");
const childRunningBeforeTheWait = { ...clone(fixture.child_run), status: "running", waiting: null };

function expectGate(snapshot, who, { row = true } = {}) {
  assert.equal(snapshot.status, "waiting", `${who}: the root is parked`);
  const pending = workflowPendingInteraction(snapshot);
  assert.equal(pending?.runId, CHILD, `${who}: the gate is the child's wait (got ${pending ? `${pending.runId} ${pending.wait.wait_key}` : "no interaction"})`);
  assert.equal(pending?.wait?.wait_key, APPROVAL_KEY, `${who}: the pending interaction is the tool approval`);
  assert.equal(pending?.wait?.details?.mode, "approval_required", `${who}: presented as a tool approval`);
  const progress = workflowProgress(snapshot);
  assert.equal(progress.label, "Approval needed", `${who}: the run strip says Approval needed (got "${progress.label}" / "${progress.detail}")`);
  if (row) {
    const message = snapshot.messages.find((item) => item.toolActivity?.name === "write_file");
    assert.equal(message?.toolActivity?.status, "waiting", `${who}: the transcript's write_file row is parked on the decision (got ${message?.toolActivity?.status})`);
  }
}

// --- A fresh client (the operator's Safari on the gateway machine, the phone):
// GET /runs/{root} says `subworkflow:<child>`, the bundle carries the child's
// waiting record. The gate must be the child's approval, not "Running a tool".
{
  const gw = gateway({ bundle: fixture.bundle, runs: { [ROOT]: fixture.root_run, [CHILD]: fixture.child_run, [SIBLING]: fixture.sibling_run } });
  const client = new WorkflowSessionController(gw.transport, { clientId: "fresh-client" });
  await client.load(ROOT);
  await settle();
  expectGate(client.getSnapshot(), "fresh client");
  assert(gw.streams.some((stream) => stream.runId === CHILD), "fresh client follows the child's ledger");
  assert.equal(gw.commands.length, 0, "no standing permission: nothing is auto-approved");

  // Another client answers: the child's ledger resume clears the gate here too.
  const resumed = { cursor: childWaitingRecord.cursor + 1, record: { run_id: CHILD, step_id: "resume-1", status: "completed", effect: { type: "resume", payload: { wait_key: APPROVAL_KEY, payload: { approved: true } } }, result: { resumed: true } } };
  gw.streams.find((stream) => stream.runId === CHILD).onStep(resumed);
  assert.equal(client.getSnapshot().interaction, null, "a ledger-confirmed resume from any client clears the gate");
  client.dispose();
}

// --- The originating client: loaded before the child asked, then the child's
// waiting record arrives on the child's stream. The gate must survive the
// root lifecycle poll (GET /runs/{root} keeps saying `subworkflow:<child>`).
{
  const gw = gateway({ bundle: bundleBeforeTheWait(), runs: { [ROOT]: fixture.root_run, [CHILD]: childRunningBeforeTheWait, [SIBLING]: fixture.sibling_run } });
  const client = new WorkflowSessionController(gw.transport, { clientId: "originating-client" });
  await client.load(ROOT);
  await settle();
  assert.equal(workflowPendingInteraction(client.getSnapshot())?.wait?.details?.mode, undefined, "before the child asks there is no approval");
  gw.streams.find((stream) => stream.runId === CHILD).onStep(clone(childWaitingRecord));
  expectGate(client.getSnapshot(), "originating client");
  await new Promise((resolve) => setTimeout(resolve, 2100)); // pollRootLifecycle refreshed the root
  expectGate(client.getSnapshot(), "originating client after the root poll");
  client.dispose();
}

// --- Durable state alone: the bundle's tail window dropped the child's
// waiting record, but GET /runs/{child} says it waits on the approval. The
// gate comes from the run, not only from a ledger record a client may miss.
{
  const gw = gateway({ bundle: bundleBeforeTheWait(), runs: { [ROOT]: fixture.root_run, [CHILD]: fixture.child_run, [SIBLING]: fixture.sibling_run } });
  const client = new WorkflowSessionController(gw.transport, { clientId: "durable-client" });
  await client.load(ROOT);
  await settle();
  expectGate(client.getSnapshot(), "durable-only client", { row: false });
  // The ledger record then arrives: same occurrence, now with its step id.
  gw.streams.find((stream) => stream.runId === CHILD).onStep(clone(childWaitingRecord));
  expectGate(client.getSnapshot(), "durable-only client after the record");
  assert.equal(client.getSnapshot().interaction.stepId, childWaitingRecord.record.step_id, "the ledger occurrence refines the durable wait");
  // A refreshed child snapshot (same wait, no step id) keeps the occurrence.
  gw.streams.length = 0;
  client.dispose();
}

// --- A delegation wait never displaces a decision. Replayed in the other
// order (child record first, then the root's `subworkflow:` record), or the
// root's durable wait re-read after the child's, the child's approval stays.
{
  const gw = gateway({ bundle: fixture.bundle, runs: { [ROOT]: fixture.root_run, [CHILD]: fixture.child_run, [SIBLING]: fixture.sibling_run } });
  const client = new WorkflowSessionController(gw.transport, { clientId: "order-client" });
  await client.load(ROOT);
  await settle();
  const rootWaitRecord = fixture.bundle.ledgers[ROOT].items.find((item) => item.record.status === "waiting" && String(item.record.result?.wait?.wait_key || "").startsWith(`subworkflow:${CHILD}`));
  assert(rootWaitRecord, "fixture: the root's ledger carries its subworkflow wait");
  gw.streams.find((stream) => stream.runId === ROOT).onStep({ ...clone(rootWaitRecord), cursor: rootWaitRecord.cursor + 100 });
  expectGate(client.getSnapshot(), "client after a replayed root delegation record");
  client.dispose();
}

// --- The ledger's `$slim` pointer: the waiting record's payload has no calls
// (they are the STARTED record's bytes); the wait carries the calls that run
// once approved. The fold must park the batch, not leave it "running".
{
  const child = fixture.bundle.ledgers[CHILD].items;
  const state = new Map();
  for (const item of child) foldWorkflowTools(state, { cursor: item.cursor, record: item.record, runId: CHILD });
  const tools = [...state.values()];
  assert.equal(tools.length, 1, `one write_file activity (got ${tools.map((tool) => `${tool.name}:${tool.status}`).join(", ")})`);
  assert.equal(tools[0].name, "write_file");
  assert.equal(tools[0].status, "waiting", "the slimmed waiting record parks the call on the decision");
  assert.equal(tools[0].arguments?.file_path, "/workspace/snake.html", "the call's arguments come from the wait");
  const evidence = workflowEvidence(child.map((item) => ({ cursor: item.cursor, record: item.record, runId: CHILD })));
  assert.equal(evidence.tools.filter((tool) => tool.status === "waiting").length, 1, "evidence counts the parked call");
}

console.log("approval sync checks passed");
