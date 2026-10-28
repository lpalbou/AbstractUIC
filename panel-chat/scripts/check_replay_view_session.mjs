// WorkflowSessionController renders from the replay view (root backlog 0993, runtime 0854).
// Run after `npm run build`: node scripts/check_replay_view_session.mjs
//
// The transport's `replayView` serves the gateway-captured fixtures (fixtures/replay_view/): the
// controller must render status, interaction, messages and tool rows FROM THE VIEW, answer
// through `POST commands` with the view's command, never read the history bundle or ledger
// pages, never poll `GET runs/{id}`, and fall back to the ledger fold only on a gateway that has
// no view route (labeled, probed once per transport), never on any other failure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WorkflowSessionController, workflowPendingInteraction, workflowSourceLabel } from "../dist/workflow_runtime.js";
import { SseParser, ReplayViewFold, ReplayViewUnavailableError } from "../dist/replay_view.js";
import { presentInteraction } from "../dist/present_interaction.js";
import { workflowProgress } from "../dist/workflow_progress.js";

let checks = 0;
const ok = () => { checks += 1; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (rounds = 8) => { for (let i = 0; i < rounds; i += 1) await tick(); };
const clone = (v) => JSON.parse(JSON.stringify(v));
const dir = new URL("./fixtures/replay_view/", import.meta.url);

/** A case's frames and the view after each frame. */
function load(name) {
  const frames = new SseParser().push(readFileSync(new URL(`${name}/stream.sse`, dir), "utf8"));
  const fold = new ReplayViewFold();
  const views = frames.map((frame) => { fold.apply(frame); return clone(fold.view); });
  return { frames, views };
}

/**
 * A gateway: `getView` returns the view at frame `at`; `streamView` delivers the frames after
 * the held token (pushed by the test, or all at once with `auto`); every other route is counted.
 */
function gateway({ name, at = 0, auto = false, viewError = null, runs = {}, advertised } = {}) {
  const c = name ? load(name) : { frames: [], views: [] };
  const counts = { getRun: 0, getHistory: 0, getLedger: 0, streamLedger: 0, getView: 0, streamView: 0 };
  const commands = [];
  const viewStreams = [];
  const ledgerStreams = [];
  const replayView = {
    ...(advertised !== undefined ? { advertised } : {}),
    async getView(runId, opts = {}) {
      counts.getView += 1;
      if (viewError) throw viewError;
      const view = c.views[at];
      const etag = `"${view.cursor.token}"`;
      if (opts.ifNoneMatch === etag) return { notModified: true, etag, bytes: 0 };
      return { notModified: false, view: clone(view), etag, bytes: JSON.stringify(view).length };
    },
    async streamView(runId, opts) {
      counts.streamView += 1;
      const stream = { runId, lastEventId: opts.lastEventId, push: (frame) => opts.onFrame(frame), ended: null };
      viewStreams.push(stream);
      opts.onOpen?.();
      if (auto) { for (const frame of c.frames.slice(at + 1)) opts.onFrame(frame); opts.onFrame({ event: "done", data: "{}" }); return { bytes: 0 }; }
      await new Promise((resolve, reject) => {
        stream.ended = resolve;
        stream.fail = reject;
        opts.signal.addEventListener("abort", resolve, { once: true });
      });
      return { bytes: 0 };
    },
  };
  const transport = {
    async getRun(runId) { counts.getRun += 1; return clone(runs[runId] || { run_id: runId, status: "running" }); },
    async getHistory() { counts.getHistory += 1; return { ledgers: {} }; },
    async getLedger() { counts.getLedger += 1; return { items: [], next_after: 0 }; },
    async streamLedger(runId, after, onStep, signal, onOpen, onDelta) {
      counts.streamLedger += 1;
      ledgerStreams.push({ runId, after, onStep, onDelta });
      onOpen?.();
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    },
    async submitCommand(command) { commands.push(command); return { accepted: true }; },
    ...(name !== undefined || viewError || advertised !== undefined ? { replayView } : {}),
  };
  return { transport, counts, commands, viewStreams, ledgerStreams, c };
}

// ---- 1. The 2026-09-29 delegated approval: the child's gate, from the view -------------------
{
  const gw = gateway({ name: "a_delegated_child_approval", at: 21 });
  const view = gw.c.views[21];
  const ctl = new WorkflowSessionController(gw.transport, { clientId: "view-client" });
  await ctl.load(view.root_run_id);
  await settle();
  const snap = ctl.getSnapshot();
  assert.equal(snap.source, "replay_view", "rendered from the replay view");
  assert.equal(workflowSourceLabel(snap), "Live view from the gateway (replay view)");
  assert.equal(snap.view.cursor.token, view.cursor.token, "the snapshot carries the folded view");
  assert.equal(snap.status, "waiting");
  const pending = workflowPendingInteraction(snap);
  assert.equal(pending?.runId, view.interaction.run_id, "the gate is the CHILD's approval");
  assert.notEqual(pending.runId, view.root_run_id);
  assert.equal(pending.wait.wait_key, view.interaction.wait_key);
  assert.equal(pending.stepId, view.interaction.step_id);
  assert.deepEqual(pending.command, view.interaction.command, "the view's resume command rides along");
  assert.equal(workflowProgress(snap).label, "Approval needed");
  const row = snap.messages.find((m) => m.toolActivity?.status === "waiting");
  assert.ok(row, "the transcript's tool row is parked on the decision");
  assert.equal(row.toolActivity.runId, view.interaction.run_id);
  assert.equal(snap.records.length, 0, "no raw records are folded in view mode");
  assert.equal(gw.counts.getHistory + gw.counts.getLedger, 0, "no history bundle, no ledger pages");
  assert.equal(gw.counts.getView, 1);
  assert.equal(gw.counts.streamView, 1);
  assert.equal(gw.viewStreams[0].lastEventId, view.cursor.token, "the stream resumes at the read view's ETag");
  assert.equal(gw.counts.streamLedger, 1, "the ledger stream is opened for live reply text only");
  assert.equal(gw.ledgerStreams[0].runId, view.root_run_id);
  assert.equal(gw.ledgerStreams[0].after, view.cursor.runs[view.root_run_id], "it starts at the view's cursor (no replay of old records)");

  // The approval card answers with the view's command.
  const control = presentInteraction(workflowPendingInteraction(snap), ctl, { records: snap.records });
  assert.equal(control.kind, "tool-approval");
  await control.onApprove();
  assert.equal(gw.commands.length, 1);
  assert.equal(gw.commands[0].type, "resume");
  assert.equal(gw.commands[0].run_id, view.interaction.command.run_id, "resume goes to the run the view names");
  assert.deepEqual(gw.commands[0].payload, { wait_key: view.interaction.wait_key, payload: { approved: true } });
  assert.equal(ctl.getSnapshot().toolApprovalGranted, true, "an accepted Allow is running work until the view moves");

  // No timed GET runs/{id}: wait past the old 2 s poll.
  const before = gw.counts.getRun;
  await new Promise((resolve) => setTimeout(resolve, 2300));
  assert.equal(gw.counts.getRun, before, "no lifecycle poll in view mode");
  // Records pushed on the ledger stream are ignored (the view has them).
  gw.ledgerStreams[0].onStep({ cursor: 999, record: { run_id: view.root_run_id, status: "completed", effect: { type: "answer_user" }, result: { message: "SHOULD NOT SHOW" } } });
  assert.ok(!ctl.getSnapshot().messages.some((m) => m.content === "SHOULD NOT SHOW"), "a ledger record never reaches the transcript in view mode");
  ctl.dispose();
  ok();
}

// ---- 2. The stream drives the snapshot; a later frame closes the gate -----------------------
{
  const gw = gateway({ name: "a2_delegated_approval_completed", at: 0 });
  const { views, frames } = gw.c;
  const ctl = new WorkflowSessionController(gw.transport);
  await ctl.load(views[0].root_run_id);
  await settle();
  const stream = gw.viewStreams[0];
  for (const frame of frames.slice(1)) stream.push(frame);
  const snap = ctl.getSnapshot();
  assert.equal(snap.view.cursor.token, views.at(-1).cursor.token, "every delta folded");
  assert.equal(JSON.stringify(snap.view), JSON.stringify(views.at(-1)));
  assert.equal(snap.status, "completed");
  assert.equal(snap.interaction, null);
  const final = views.at(-1).messages.find((m) => m.id === `${views[0].root_run_id}:final`);
  assert.ok(final, "fixture: the root has a final message");
  const shown = snap.messages.filter((m) => m.role === "assistant" && m.content === final.text);
  assert.equal(shown.length, 1, "the final answer is shown once");
  assert.ok(shown[0].statistics, "the turn's statistics sit on the final answer");
  assert.equal(shown[0].statistics.totalTokens, views.at(-1).usage.total_tokens);
  const order = snap.messages.map((m) => m.id);
  assert.ok(order.indexOf(`${views[0].root_run_id}:input`) === 0, "the prompt comes first");
  stream.push({ event: "done", data: "{}" });
  stream.ended();
  await settle();
  assert.equal(ctl.getSnapshot().connection, "disconnected", "done ends the stream");
  assert.equal(gw.counts.streamView, 1, "no reconnect after done");
  ctl.dispose();
  ok();
}

// ---- 3. Repeated answer, tool rows, policy lines ----------------------------------------------
{
  const l = gateway({ name: "l_answer_then_completion", at: load("l_answer_then_completion").views.length - 1 });
  const ctl = new WorkflowSessionController(l.transport);
  await ctl.load(l.c.views[0].root_run_id);
  await settle();
  const texts = ctl.getSnapshot().messages.filter((m) => m.role === "assistant").map((m) => m.content);
  assert.deepEqual(texts, ["Hello there."], "a final that repeats the answer is shown once");
  ctl.dispose();

  const m = gateway({ name: "m_session_tool_policy", at: load("m_session_tool_policy").views.length - 1 });
  const ctl2 = new WorkflowSessionController(m.transport);
  await ctl2.load(m.c.views[0].root_run_id);
  await settle();
  const s2 = ctl2.getSnapshot();
  const tools = s2.messages.filter((x) => x.toolActivity);
  const fetchUrl = tools.find((x) => x.toolActivity.name === "fetch_url");
  assert.equal(fetchUrl.toolActivity.status, "completed");
  assert.equal(fetchUrl.toolActivity.policy?.decision, "auto_approved", "the policy provenance is on the row");
  const exec = tools.find((x) => x.toolActivity.name === "execute_command");
  assert.equal(exec.toolActivity.status, "failed", "a call the policy denied is not shown as completed");
  assert.equal(exec.toolActivity.policy?.decision, "denied");
  assert.ok(exec.toolActivity.error, "with its reason");
  const lines = s2.messages.filter((x) => x.kind === "tool_policy_decision");
  assert.ok(lines.some((x) => /Allowed by this chat's policy/.test(x.content)) && lines.some((x) => /Denied by this chat's policy/.test(x.content)), "decisions are activity lines");
  ctl2.dispose();
  ok();
}

// ---- 4. An event interaction answers with the view's command --------------------------------
{
  const gw = gateway({ name: "i_wait_kinds", at: 16 });
  const view = gw.c.views[16];
  assert.equal(view.interaction?.kind, "event", "fixture: an event wait with a prompt");
  const ctl = new WorkflowSessionController(gw.transport);
  await ctl.load(view.root_run_id);
  await settle();
  const control = presentInteraction(workflowPendingInteraction(ctl.getSnapshot()), ctl, {});
  assert.equal(control.kind, "event-wait");
  assert.match(control.description, /red, blue/, "the expected choices are shown");
  await control.onSend('{"color":"blue"}');
  assert.deepEqual(gw.commands[0], { ...gw.commands[0], type: "resume", run_id: view.interaction.command.run_id, payload: { wait_key: view.interaction.wait_key, payload: { color: "blue" } } });
  ctl.dispose();
  ok();
}

// ---- 5. ask_user (served shape) answers with {response} --------------------------------------
{
  const gw = gateway({ name: "g_ask_user", at: 0 });
  const base = gw.c.views[0];
  const view = clone(base);
  view.status = "waiting";
  view.interaction = { kind: "ask_user", run_id: base.root_run_id, wait_key: "ask:1", step_id: "s-ask", seq: 3, prompt: "Which file?", choices: ["a.txt", "b.txt"], allow_free_text: true, details: null, tool_calls: null, activity_id: null, command: { type: "resume", run_id: base.root_run_id, payload: { wait_key: "ask:1" } }, answer_payload: "{response}" };
  view.messages = [...view.messages, { id: `${base.root_run_id}:s-ask:question`, role: "assistant", kind: "question", text: "Which file?", run_id: base.root_run_id, order: ["9999", base.root_run_id, 3] }];
  gw.c.views[0] = view;
  const ctl = new WorkflowSessionController(gw.transport);
  await ctl.load(base.root_run_id);
  await settle();
  const snap = ctl.getSnapshot();
  assert.ok(!snap.messages.some((m) => m.kind === "question" && m.content === "Which file?"), "the open question is the card, not also a transcript line");
  const control = presentInteraction(workflowPendingInteraction(snap), ctl, {});
  assert.equal(control.kind, "ask-user");
  assert.deepEqual(control.choices.map((c) => c.label), ["a.txt", "b.txt"]);
  await control.onSubmit("b.txt");
  assert.deepEqual(gw.commands[0].payload, { wait_key: "ask:1", payload: { response: "b.txt" } });
  ctl.dispose();
  ok();
}

// ---- 6. Live reply text rides the ledger stream; the view's record replaces it ------------------
{
  const gw = gateway({ name: "a_delegated_child_approval", at: 12 });
  const view = gw.c.views[12];
  const llm = view.activities.find((a) => a.kind === "llm" && !["completed", "failed", "cancelled"].includes(a.status));
  assert.ok(llm, "fixture: a model call is open at frame 12");
  const ctl = new WorkflowSessionController(gw.transport, { liveRenderIntervalMs: 0 });
  await ctl.load(view.root_run_id);
  await settle();
  const delta = { kind: "llm.delta", run_id: llm.run_id, root_run_id: view.root_run_id, parent_run_id: null, node_id: llm.node_id, call_id: llm.step_ids[0], seq: 0, text: "Thinking about it", channel: "content", snapshot: false };
  gw.ledgerStreams[0].onDelta(delta);
  const live = () => ctl.getSnapshot().messages.filter((m) => String(m.id).startsWith("live:"));
  assert.equal(live().length, 1, "a live bubble while the call streams");
  assert.equal(live()[0].content, "Thinking about it");
  gw.viewStreams[0].push(gw.c.frames[13]);
  assert.equal(gw.c.views[13].activities.find((a) => a.id === llm.id).status, "completed", "fixture: frame 13 ends the call");
  assert.equal(live().length, 0, "the durable record replaces the live text");
  gw.ledgerStreams[0].onDelta({ ...delta, seq: 1, text: " more" });
  assert.equal(live().length, 0, "a late delta of an ended call shows nothing");
  ctl.dispose();
  ok();
}

// ---- 7. Reconnect resumes at the last APPLIED frame -------------------------------------------
{
  const gw = gateway({ name: "c_parallel_tool_batch", at: 0 });
  const ctl = new WorkflowSessionController(gw.transport);
  await ctl.load(gw.c.views[0].root_run_id);
  await settle();
  for (const frame of gw.c.frames.slice(1, 6)) gw.viewStreams[0].push(frame);
  gw.viewStreams[0].push(gw.c.frames[3]); // a stale frame delivered again
  assert.equal(ctl.getSnapshot().view.cursor.token, gw.c.views[5].cursor.token, "a stale frame does not move the view back");
  gw.viewStreams[0].fail(new Error("network reset"));
  await new Promise((resolve) => setTimeout(resolve, 200));
  await settle();
  assert.equal(gw.counts.streamView, 2, "one reconnect");
  assert.equal(gw.viewStreams[1].lastEventId, gw.c.frames[5].id, "Last-Event-ID = the last applied frame");
  for (const frame of gw.c.frames.slice(6)) gw.viewStreams[1].push(frame);
  assert.equal(JSON.stringify(ctl.getSnapshot().view), JSON.stringify(gw.c.views.at(-1)));
  assert.equal(ctl.getSnapshot().connection, "connected", "healed");
  ctl.dispose();
  ok();
}

// ---- 8. Fallback: labeled, only for a missing route, probed once per transport ------------------
{
  const missing = gateway({ viewError: new ReplayViewUnavailableError(404, "Not Found") });
  const a = new WorkflowSessionController(missing.transport);
  await a.load("run-x");
  await settle();
  assert.equal(a.getSnapshot().source, "ledger_fold");
  assert.match(a.getSnapshot().sourceReason, /0\.17\.0/);
  assert.match(workflowSourceLabel(a.getSnapshot()), /^Rebuilt in this client from the run ledger: /);
  assert.equal(missing.counts.getHistory, 1, "the ledger fold runs");
  a.dispose();
  const b = new WorkflowSessionController(missing.transport);
  await b.load("run-y");
  await settle();
  assert.equal(missing.counts.getView, 1, "the probe is not repeated for the same transport");
  assert.equal(b.getSnapshot().source, "ledger_fold");
  b.dispose();

  const broken = gateway({ viewError: Object.assign(new Error("boom"), { status: 500 }) });
  const c = new WorkflowSessionController(broken.transport);
  await c.load("run-z");
  await settle();
  assert.equal(c.getSnapshot().error, "boom", "a failing view read is an error, not a silent fallback");
  assert.equal(broken.counts.getHistory, 0);
  c.dispose();

  const none = gateway({});
  const d = new WorkflowSessionController(none.transport);
  await d.load("run-w");
  await settle();
  assert.equal(d.getSnapshot().source, "ledger_fold");
  assert.match(d.getSnapshot().sourceReason, /transport does not read the replay view/);
  d.dispose();

  const off = gateway({ name: "g_ask_user", advertised: false });
  const e = new WorkflowSessionController(off.transport);
  await e.load("run-v");
  await settle();
  assert.equal(off.counts.getView, 0, "advertised: false is not probed");
  assert.match(e.getSnapshot().sourceReason, /does not advertise/);
  e.dispose();
  ok();
}

// ---- 9. Stop: stopping until the view proves the model call ended -----------------------------
{
  const gw = gateway({ name: "d_cancellation", at: 12 });
  const view = gw.c.views[12];
  assert.equal(view.status, "cancelled");
  const ctl = new WorkflowSessionController(gw.transport);
  await ctl.load(view.root_run_id);
  await settle();
  await ctl.cancel();
  assert.equal(ctl.getSnapshot().stop?.phase, "stopping", "a model call is still open");
  gw.viewStreams[0].push(gw.c.frames[13]);
  gw.viewStreams[0].push(gw.c.frames[14]);
  assert.equal(ctl.getSnapshot().stop?.phase, "stopping");
  gw.viewStreams[0].push(gw.c.frames[15]);
  assert.equal(ctl.getSnapshot().stop?.phase, "stopped", "stopped once the view shows the call ended");
  assert.equal(gw.counts.getLedger, 0, "no ledger catch-up in view mode");
  ctl.dispose();
  ok();
}

console.log(`check_replay_view_session: ${checks} groups OK`);
process.exit(0);
