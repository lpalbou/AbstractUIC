// Two gaps of the replay-view projection (review 2026-11-08 of Code's workspace e2e):
// 1. An event wait the runtime classes as a machine `signal` (no prompt, no choices: the view's
//    `interaction` is null, the wait is only in `open_waits`) must still read "Waiting for an
//    event" (never "Working") and keep the host's manual event form, as before the replay view.
// 2. A tools-only turn (no final message) must still carry its statistics, on its tool group.
// Run after `npm run build`: node scripts/check_replay_turn_gaps.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as pc from "../dist/index.js";

const { projectReplayView, workflowProgress, presentInteraction, ChatThread } = pc;
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/replay_view/${name}/final_view.json`, import.meta.url), "utf8"));

// ---------------------------------------------------------------- 1. a signal event wait
{
  const base = fixture("j_event_answered_then_pause");
  const root = base.root_run_id;
  const key = `evt:session:sess-1:fixture.ping`;
  const view = {
    ...base,
    session_id: "sess-1",
    status: "waiting",
    display_status: "",
    interaction: null,
    open_waits: [{ run_id: root, kind: "signal", wait_key: key, step_id: "step-listen", seq: 2, until: null, child_run_id: null, person_facing: false }],
  };
  const p = projectReplayView(view);
  assert.deepEqual(p.interaction, { runId: root, wait: { wait_key: key, reason: "event" }, stepId: "step-listen", kind: "event" }, "the signal event wait is the conversation's wait");
  const progress = workflowProgress({ status: "waiting", loading: false, connection: "connected", error: null, interaction: p.interaction, records: [], run: { run_id: root, status: "waiting", session_id: "sess-1" }, view });
  assert.equal(progress.label, "Waiting for an event", "the run status says it waits for an event, never 'Working'");
  const sent = [];
  const controller = { resume: async () => undefined, emitEvent: async (event) => { sent.push(event); } };
  const card = presentInteraction(p.interaction, controller, { currentRun: { run_id: root, session_id: "sess-1", status: "waiting" } });
  assert.equal(card?.kind, "event-wait");
  assert.equal(card.title, "Waiting for an event", "the manual event form is reachable again");
  assert.equal(card.sendLabel, "Send event");
  await card.onSend('{"trigger":"manual"}');
  assert.deepEqual(sent, [{ name: "fixture.ping", scope: "session", session_id: "sess-1", payload: { trigger: "manual" } }], "the event goes to the wait's own route");
  // Only canonical event keys: another signal carries no event to deliver.
  const other = projectReplayView({ ...view, open_waits: [{ ...view.open_waits[0], wait_key: "something:else" }] });
  assert.equal(other.interaction, null);
  // A served interaction still wins over the open waits.
  const served = fixture("i_wait_kinds");
  assert.equal(projectReplayView(served).interaction?.wait?.wait_key, served.interaction.wait_key);
  // A finished run has no wait.
  assert.equal(projectReplayView({ ...view, status: "completed" }).interaction, null);
}

// ---------------------------------------------------------------- 2. a tools-only turn's stats
{
  const withFinal = fixture("c_parallel_tool_batch");
  const root = withFinal.root_run_id;
  const toolsOnly = { ...withFinal, messages: withFinal.messages.filter((m) => m.id !== `${root}:final` && m.kind !== "final") };
  const p = projectReplayView(toolsOnly);
  const last = p.messages.at(-1);
  assert.ok(last?.toolActivity, "the turn ends with its tool rows");
  assert.equal(last.statistics?.toolCalls, p.statistics.toolCalls, "the turn's statistics ride on its last tool row");
  const html = renderToStaticMarkup(React.createElement(ChatThread, { messages: p.messages }));
  assert.match(html, /class="pc-tool-stack"[\s\S]*aria-label="Stats"/, "the tool group shows the turn's stats under its rows");
  assert.match(html, new RegExp(`>${p.statistics.toolCalls} tools?<`), "the tool count chip");
  // With a final message the stats stay on the reply, not on the tools.
  const q = projectReplayView(withFinal);
  assert.equal(q.messages.filter((m) => m.toolActivity && m.statistics).length, 0, "no stats on tool rows when the turn has a reply");
  assert.equal(q.messages.filter((m) => m.statistics).length, 1);
}

console.log("check_replay_turn_gaps: signal event waits read 'Waiting for an event' with the manual form; a tools-only turn shows its stats under its tool group");
