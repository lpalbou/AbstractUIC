// Stop states from LEDGER EVIDENCE (mission H, incident 2026-09-22).
// Run after `npm run build`: node scripts/check_stop_states.mjs
//
// Stopping… (this client asked) → Stopped (root cancelled AND every started
// llm_call of the tree has a terminal record) or → the gateway kill switch's
// own text (its `abstract.status` record carries killed_by: "kill_switch").
// No browser timer decides any of it; a historical cancelled run shows nothing.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowSessionController } from "../dist/workflow_runtime.js";
import { WorkflowChat } from "../dist/workflow_chat.js";
import { workflowProgress } from "../dist/workflow_progress.js";

const root = "root-run";
const child = "child-run";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness({ rootStatus = "running", childLedger = [] } = {}) {
  const state = { rootStatus, childLedger: [...childLedger], streams: [], commands: [], ledgerReads: 0 };
  const transport = {
    async getRun(runId) { return { run_id: runId, status: runId === root ? state.rootStatus : state.rootStatus === "cancelled" ? "cancelled" : "running" }; },
    async getHistory() {
      return { run: { run_id: root, status: state.rootStatus }, ledgers: { [root]: { items: [
        { cursor: 1, record: { run_id: root, status: "waiting", step_id: "spawn", effect: { type: "start_subworkflow", payload: {} }, result: { wait: { wait_key: `subworkflow:${child}`, reason: "subworkflow", details: { sub_run_id: child } } } } },
      ] } } };
    },
    async getLedger(runId, after) {
      state.ledgerReads += 1;
      if (runId !== child) return { items: [], next_after: after };
      const items = state.childLedger.filter((item) => item.cursor > after);
      return { items, next_after: items.length ? items[items.length - 1].cursor : after };
    },
    async streamLedger(runId, after, onStep, signal) {
      state.streams.push({ runId, onStep });
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    },
    async submitCommand(command) {
      state.commands.push(command);
      // The gateway applies a cancel within its poll interval: the root is
      // CANCELLED by the time the client re-reads it.
      if (command.type === "cancel") state.rootStatus = "cancelled";
      return { accepted: true, duplicate: false, seq: state.commands.length };
    },
  };
  return { state, controller: new WorkflowSessionController(transport, { clientId: "stop-test" }) };
}

const llmStarted = { cursor: 1, record: { run_id: child, step_id: "llm-1", status: "started", effect: { type: "llm_call", payload: {} } } };

// 1. Soft stop: Stopping… → Stopped once the cancelled record closes the call.
{
  const { state, controller } = harness({ childLedger: [llmStarted] });
  await controller.load(root);
  await tick(); await tick();
  assert.equal(controller.getSnapshot().stop, null, "no stop state before anyone asks");
  const pending = controller.cancel();
  assert.equal(controller.getSnapshot().stop?.phase, "stopping", "Stopping… from the moment the client asks");
  await pending;
  assert.equal(state.commands.at(-1).type, "cancel");
  // The gateway applied the cancel: root CANCELLED, but the model call is
  // still open in the ledger — not "Stopped" yet.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(controller.getSnapshot().status, "cancelled");
  assert.equal(controller.getSnapshot().stop?.phase, "stopping", "a cancelled run with an open llm_call is still stopping");
  // The runtime's terminal record for the stopped call arrives.
  state.streams.find((s) => s.runId === child).onStep({ cursor: 2, record: { run_id: child, step_id: "llm-1", status: "cancelled", effect: { type: "llm_call", payload: {} }, result: { cancelled: true, cancelled_by: "command", stopped_after_cancel_s: 0.04 } } });
  assert.deepEqual(controller.getSnapshot().stop, { phase: "stopped", label: "Stopped" });
  controller.dispose();
}

// 2. Forced stop: the ledger read after the root went terminal finds the
//    kill switch's records (the gateway restarted in between).
{
  const { state, controller } = harness({ childLedger: [llmStarted] });
  await controller.load(root);
  await tick(); await tick();
  await controller.cancel();
  const forced = { text: "Stop forced at 10 s: inference killed", killed_by: "kill_switch", provider: "mlx", model: "m", since_cancel_s: 10.01 };
  state.childLedger.push(
    { cursor: 2, record: { run_id: child, step_id: "llm-1", status: "cancelled", effect: { type: "llm_call", payload: {} }, result: { cancelled: true, cancelled_by: "kill_switch" } } },
    { cursor: 3, record: { run_id: child, step_id: "ks", status: "completed", effect: { type: "emit_event", payload: { name: "abstract.status", payload: forced } }, result: { emitted: true, name: "abstract.status", payload: forced } } },
  );
  // No stream delivers these (the tree is terminal): the followed ledger
  // reads must find them on their own.
  const before = state.ledgerReads;
  const deadline = Date.now() + 3000;
  while (controller.getSnapshot().stop?.phase !== "forced" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  assert(state.ledgerReads > before, "the controller must keep reading ledgers while a cancelled tree is still stopping");
  assert.equal(controller.getSnapshot().stop?.phase, "forced");
  assert.equal(controller.getSnapshot().stop?.label, "Stop forced at 10 s: inference killed");
  controller.dispose();
}

// 3. A historical cancelled session (nobody here pressed Stop) shows nothing,
//    even with a dangling started llm_call from a crashed process.
{
  const { controller } = harness({ rootStatus: "cancelled", childLedger: [llmStarted] });
  await controller.load(root);
  await tick(); await tick();
  assert.equal(controller.getSnapshot().stop, null);
  controller.dispose();
}

// 4. A refused cancel never leaves "Stopping…" behind.
{
  const { controller } = harness({ childLedger: [llmStarted] });
  await controller.load(root);
  controller["transport"].submitCommand = async () => ({ accepted: false, detail: "no" });
  await controller.cancel().catch(() => {});
  assert.equal(controller.getSnapshot().stop, null);
  controller.dispose();
}

// 5. Presentation: the Stop button and the chip that replaces it.
{
  const base = { messages: [], draft: "", onDraftChange() {}, onSend() {}, onCancel() {} };
  const render = (props) => renderToStaticMarkup(React.createElement(WorkflowChat, { ...base, ...props }));
  assert.match(render({ busy: true }), /aria-label="Stop"/);
  const stopping = render({ busy: true, stopState: { phase: "stopping", label: "Stopping…" } });
  assert.match(stopping, /data-mode="stopping"/);
  assert.match(stopping, /aria-label="Stop"[^>]*aria-busy="true"[^>]*data-mode="stopping"[^>]*disabled/);
  assert(!/class="pc-workflow-chat__stop"/.test(stopping), "no separate Stopping… button");
  // After a stop the composer is idle again: Send only, no "Stopped" chip (operator 2026-11-07:
  // "it should not show stopped"). The outcome is the run status's (workflowProgress).
  for (const stopState of [{ phase: "stopped", label: "Stopped" }, { phase: "forced", label: "Stop forced at 10 s: inference killed" }]) {
    const idle = render({ busy: false, stopState });
    assert.doesNotMatch(idle, /stop-state|>Stopped<|Stop forced/, `${stopState.phase}: nothing but the idle composer`);
    assert.match(idle, /aria-label="Send"[^>]*data-mode="send"/, `${stopState.phase}: the primary button is Send`);
  }
  assert.doesNotMatch(render({ busy: false }), /stop-state/);
  const stoppingProgress = workflowProgress({ status: "running", loading: false, connection: "connected", error: null, interaction: null, records: [], run: null, stop: { phase: "stopping", label: "Stopping…" } });
  assert.equal(stoppingProgress.label, "Stopping…", "run status: Stopping… at once after the press");
  const stopped = workflowProgress({ status: "cancelled", loading: false, connection: "connected", error: null, interaction: null, records: [], run: null, stop: { phase: "stopped", label: "Stopped" } });
  assert.deepEqual([stopped.label, stopped.detail], ["Stopped", ""], "run status: Stopped");
  const forcedProgress = workflowProgress({ status: "cancelled", loading: false, connection: "connected", error: null, interaction: null, records: [], run: null, stop: { phase: "forced", label: "Stop forced at 10 s: inference killed" } });
  assert.deepEqual([forcedProgress.label, forcedProgress.detail], ["Stopped", "Stop forced at 10 s: inference killed"], "run status: the forced-stop text, as recorded");
}

console.log("check_stop_states: ok");
