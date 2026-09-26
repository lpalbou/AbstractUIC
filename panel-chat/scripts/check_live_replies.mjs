// Live (streamed) assistant replies from the gateway's llm.delta events.
// Run after `npm run build`: node scripts/check_live_replies.mjs
//
// The gateway sends `llm.delta` / `llm.delta_end` frames (no `id:`) on the
// run ledger stream. The transport hands them to `onDelta`; the controller
// shows one live bubble per model call and removes it when the durable
// ledger record / assistant message arrives. Fake transports only.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowSessionController } from "../dist/workflow_runtime.js";
import { WorkflowChat } from "../dist/workflow_chat.js";
import { ChatMessageCard } from "../dist/chat_message_card.js";
import * as api from "../dist/index.js";

const { llmDeltaFromSse, validateLlmDeltaEvent, describeStreamUnavailable, streamRepliesRuntime } = api;
const root = "root-run";
const child = "child-run";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let checks = 0;
const ok = () => { checks += 1; };

const delta = (seq, text, extra = {}) => ({ kind: "llm.delta", run_id: root, root_run_id: root, parent_run_id: null, node_id: "agent", call_id: "call-1", seq, text, channel: "content", snapshot: false, ...extra });
const end = (seq, reason, extra = {}) => ({ kind: "llm.delta_end", run_id: root, root_run_id: root, parent_run_id: null, node_id: "agent", call_id: "call-1", seq, reason, ...extra });
const liveOf = (controller) => controller.getSnapshot().messages.filter((m) => String(m.id).startsWith("live:"));
const assistantTexts = (controller, text) => controller.getSnapshot().messages.filter((m) => m.role === "assistant" && m.content === text);

/** Fake transport whose streamLedger keeps each run's callbacks for the test to drive. */
function harness({ ledger = {}, deltaAware = true } = {}) {
  const state = { streams: new Map(), connects: new Map(), rootStatus: "running" };
  const transport = {
    async getRun(runId) { return { run_id: runId, status: runId === root ? state.rootStatus : "running" }; },
    async getHistory() {
      return { run: { run_id: root, status: "running" }, ledgers: { [root]: { items: ledger[root] || [] } } };
    },
    async getLedger(_runId, after) { return { items: [], next_after: after }; },
    async streamLedger(runId, after, onStep, signal, onOpen, onDelta) {
      let close;
      const closed = new Promise((resolve) => { close = resolve; signal.addEventListener("abort", resolve, { once: true }); });
      state.streams.set(runId, { after, onStep, onDelta: deltaAware ? onDelta : undefined, argCount: arguments.length, close });
      state.connects.set(runId, (state.connects.get(runId) || 0) + 1);
      onOpen?.();
      await closed;
    },
    async submitCommand() { return { accepted: true }; },
  };
  const controller = new WorkflowSessionController(transport, { clientId: "live-test" });
  const push = (runId, event) => state.streams.get(runId).onDelta(event);
  const step = (runId, item) => state.streams.get(runId).onStep(item);
  return { state, controller, push, step };
}

async function loaded(options) {
  const h = harness(options);
  await h.controller.load(root);
  await tick(); await tick();
  return h;
}

const llmCall = (cursor, status, runId = root, stepId = "call-1") => ({ cursor, record: { run_id: runId, step_id: stepId, status, effect: { type: "llm_call", payload: {} }, ...(status === "completed" ? { result: { content: "done" } } : {}) } });
const answer = (cursor, message, runId = root) => ({ cursor, record: { run_id: runId, step_id: `answer-${cursor}`, status: "completed", effect: { type: "answer_user", payload: { message } }, result: { message } } });

// ------------------------------------------------------------ 1. Transport dispatch
{
  // A host SSE reader in the documented shape: delta frames go to onDelta and
  // never move the cursor; ledger frames go to onStep and carry `id:`.
  const wire = [
    "id: 7\nevent: step\ndata: {\"cursor\":7,\"record\":{\"run_id\":\"root-run\",\"step_id\":\"call-1\",\"status\":\"started\",\"effect\":{\"type\":\"llm_call\"}}}\n",
    `event: llm.delta\ndata: ${JSON.stringify(delta(0, "Hel", { snapshot: true }))}\n`,
    `event: llm.delta\ndata: ${JSON.stringify(delta(1, "lo"))}\n`,
    `event: llm.delta_end\ndata: ${JSON.stringify(end(2, "completed"))}\n`,
  ];
  const received = { steps: [], deltas: [], lastEventId: null };
  for (const frame of wire) {
    const fields = Object.fromEntries(frame.trim().split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
    const d = llmDeltaFromSse(fields.event || "message", fields.data);
    if (d) { received.deltas.push(d); continue; }
    if (fields.id) received.lastEventId = fields.id;
    received.steps.push(JSON.parse(fields.data));
  }
  assert.equal(received.steps.length, 1); ok();
  assert.equal(received.deltas.length, 3); ok();
  assert.equal(received.lastEventId, "7", "delta frames must not move Last-Event-ID"); ok();
  assert.equal(received.deltas[2].reason, "completed"); ok();
  assert.equal(llmDeltaFromSse("step", "{}"), null, "non-delta frames are not deltas"); ok();
  assert.throws(() => llmDeltaFromSse("llm.delta", "{not json"), /Malformed llm\.delta event/); ok();
  assert.throws(() => llmDeltaFromSse("llm.delta", JSON.stringify({ ...delta(1, "x"), call_id: "" })), /call_id is missing/); ok();
  assert.throws(() => llmDeltaFromSse("llm.delta", JSON.stringify({ ...delta(1, "x"), channel: "tools" })), /unknown channel/); ok();
  assert.throws(() => llmDeltaFromSse("llm.delta_end", JSON.stringify(end(1, "done"))), /unknown reason/); ok();
  assert.throws(() => llmDeltaFromSse("llm.delta", JSON.stringify(end(1, "completed"))), /does not match the event name/); ok();
  assert.throws(() => llmDeltaFromSse("llm.delta", JSON.stringify({ ...delta(1, "x"), parent_run_id: 7 })), /parent_run_id/); ok();
  const unavailable = llmDeltaFromSse("llm.delta_end", JSON.stringify(end(0, "unavailable", { detail: "remote_core" })));
  assert.equal(unavailable.reason, "unavailable"); assert.equal(unavailable.detail, "remote_core"); ok();
  assert.equal(validateLlmDeltaEvent(delta(1, "x", { run_id: child, parent_run_id: root })).parent_run_id, root); ok();
  // Extra fields are tolerated (contract delta S-1).
  const tolerant = validateLlmDeltaEvent({ ...delta(3, "x"), extra: { a: 1 } });
  assert.equal(tolerant.text, "x"); assert.equal(tolerant.node_id, "agent"); ok();
  assert.equal(validateLlmDeltaEvent(end(4, "failed")).node_id, "agent"); ok();

  // The controller passes onDelta as the 6th streamLedger argument.
  const h = await loaded();
  assert.equal(h.state.streams.get(root).argCount, 6); ok();
  assert.equal(typeof h.state.streams.get(root).onDelta, "function"); ok();
  const cursorBefore = h.controller["cursors"].get(root) || 0;
  h.push(root, delta(0, "Hi"));
  assert.equal(h.controller["cursors"].get(root) || 0, cursorBefore, "a delta never moves the ledger cursor"); ok();
  assert.equal(h.controller.getSnapshot().records.length, 0, "a delta is not a ledger record"); ok();
  h.controller.dispose();

  // A transport written before live replies ignores onDelta and keeps working.
  const old = await loaded({ deltaAware: false, ledger: { [root]: [answer(1, "complete reply")] } });
  assert.equal(assistantTexts(old.controller, "complete reply").length, 1); ok();
  assert.equal(old.controller.getSnapshot().connection, "connected"); ok();
  old.controller.dispose();
}

// ------------------------------------------------------------ 2. Controller folding
// Snapshot, append, and the rendered live message.
{
  const h = await loaded();
  h.push(root, delta(4, "Hello wor", { snapshot: true }));
  let live = liveOf(h.controller);
  assert.equal(live.length, 1); ok();
  assert.equal(live[0].id, `live:${root}:call-1`); ok();
  assert.equal(live[0].role, "assistant"); ok();
  assert.equal(live[0].content, "Hello wor"); ok();
  h.push(root, delta(5, "ld"));
  assert.equal(liveOf(h.controller)[0].content, "Hello world"); ok();
  // A reconnect snapshot replaces the text (never appended twice).
  h.push(root, delta(5, "Hello world", { snapshot: true }));
  assert.equal(liveOf(h.controller)[0].content, "Hello world"); ok();
  // A stale snapshot (older seq) never rolls the text back.
  h.push(root, delta(2, "Hel", { snapshot: true }));
  assert.equal(liveOf(h.controller)[0].content, "Hello world"); ok();
  assert.equal(h.controller.getSnapshot().connection, "connected"); ok();
  h.controller.dispose();
}

// Ordering and duplicates: only increasing seq is appended.
{
  const h = await loaded();
  h.push(root, delta(1, "A"));
  h.push(root, delta(3, "C"));
  h.push(root, delta(2, "B")); // out of order: dropped
  h.push(root, delta(3, "C")); // duplicate: dropped
  h.push(root, delta(4, "D"));
  assert.equal(liveOf(h.controller)[0].content, "ACD", "out-of-order and duplicate seqs are dropped"); ok();
  h.controller.dispose();
}

// Reasoning channel stays separate; the client never parses <think> (the server splits it).
{
  const h = await loaded();
  h.push(root, delta(1, "step one", { channel: "reasoning" }));
  h.push(root, delta(1, "The answer"));
  h.push(root, delta(2, " step two", { channel: "reasoning" }));
  h.push(root, delta(2, " is 42."));
  const live = liveOf(h.controller)[0];
  assert.equal(live.content, "The answer is 42."); ok();
  assert.equal(live.live.reasoning, "step one step two"); ok();
  h.push(root, delta(3, " <think>literal</think>"));
  assert.equal(liveOf(h.controller)[0].content, "The answer is 42. <think>literal</think>", "content is shown as the server sent it"); ok();
  h.controller.dispose();
}

// Truncated: explicit, and sticky for the call.
{
  const h = await loaded();
  h.push(root, delta(9, "…tail of a long reply", { snapshot: true, truncated: true }));
  assert.equal(liveOf(h.controller)[0].live.truncated, true); ok();
  h.push(root, delta(10, " more"));
  assert.equal(liveOf(h.controller)[0].live.truncated, true); ok();
  h.controller.dispose();
}

// delta_end completed removes the bubble; failed/cancelled leave a note.
{
  const h = await loaded();
  h.push(root, delta(1, "partial"));
  h.push(root, end(2, "completed"));
  assert.equal(liveOf(h.controller).length, 0); ok();
  assert(!h.controller.getSnapshot().messages.some((m) => String(m.id).startsWith("live-end:"))); ok();
  // A late frame for an ended call cannot resurrect it.
  h.push(root, delta(3, "late", { snapshot: true }));
  assert.equal(liveOf(h.controller).length, 0); ok();
  // A delta_end for a call that never streamed is a no-op, not an error.
  h.push(root, end(0, "completed", { call_id: "never-streamed" }));
  assert.equal(h.controller.getSnapshot().error, null); ok();
  h.controller.dispose();
}
for (const reason of ["failed", "cancelled"]) {
  const h = await loaded();
  h.push(root, delta(1, "partial"));
  h.push(root, end(2, reason));
  assert.equal(liveOf(h.controller).length, 0); ok();
  const note = h.controller.getSnapshot().messages.find((m) => m.id === `live-end:${root}:call-1`);
  assert(note, `a ${reason} stream leaves a note`); ok();
  assert.equal(note.role, "system"); ok();
  assert.match(note.content, reason === "failed" ? /failed/ : /cancelled/); ok();
  h.controller.dispose();
}

// Replacement by the durable reply, never two copies.
{
  // (a) The answer_user record arrives while the bubble is still open.
  const h = await loaded();
  h.push(root, delta(1, "The final answer"));
  h.step(root, answer(1, "The final answer"));
  assert.equal(liveOf(h.controller).length, 0, "the durable answer replaces the live bubble"); ok();
  assert.equal(assistantTexts(h.controller, "The final answer").length, 1, "exactly one copy of the reply"); ok();
  h.controller.dispose();
}
{
  // (b) The llm_call terminal record arrives first, then the answer.
  const h = await loaded();
  h.push(root, delta(1, "Reply text"));
  h.step(root, llmCall(1, "completed"));
  assert.equal(liveOf(h.controller).length, 0); ok();
  h.push(root, delta(2, " late")); // after the record: ignored
  assert.equal(liveOf(h.controller).length, 0); ok();
  h.step(root, answer(2, "Reply text"));
  assert.equal(h.controller.getSnapshot().messages.filter((m) => m.role === "assistant").length, 1); ok();
  h.controller.dispose();
}
{
  // (c) The root's terminal output (final:) replaces the bubble.
  const h = await loaded();
  h.push(root, delta(1, "Done."));
  h.state.rootStatus = "completed";
  h.controller["updateRunState"](root, { run_id: root, status: "completed", output: { response: "Done." } });
  assert.equal(liveOf(h.controller).length, 0); ok();
  assert.equal(assistantTexts(h.controller, "Done.").length, 1); ok();
  h.push(root, delta(0, "new call after the end", { call_id: "call-2" }));
  assert.equal(liveOf(h.controller).length, 0, "a terminal run takes no new live text"); ok();
  h.controller.dispose();
}
{
  // (d) A replayed history that already holds the terminal llm_call record
  //     ignores a stale reconnect snapshot for that call.
  const h = await loaded({ ledger: { [root]: [llmCall(1, "started"), llmCall(2, "completed")] } });
  h.push(root, delta(5, "stale", { snapshot: true }));
  assert.equal(liveOf(h.controller).length, 0); ok();
  h.controller.dispose();
}

// Two runs interleaved: independent bubbles, independent removal.
{
  const h = await loaded({ ledger: { [root]: [{ cursor: 1, record: { run_id: root, status: "completed", effect: { type: "start_subworkflow", payload: {} }, result: { sub_run_id: child } } }] } });
  await tick(); await tick();
  assert(h.state.streams.has(child), "child stream watched"); ok();
  h.push(root, delta(1, "root-a"));
  h.push(child, delta(1, "child-a", { run_id: child }));
  h.push(root, delta(2, "-root-b"));
  h.push(child, delta(2, "-child-b", { run_id: child }));
  const live = liveOf(h.controller);
  assert.deepEqual(live.map((m) => [m.id, m.content]), [[`live:${root}:call-1`, "root-a-root-b"], [`live:${child}:call-1`, "child-a-child-b"]]); ok();
  h.push(child, end(3, "completed", { run_id: child }));
  assert.deepEqual(liveOf(h.controller).map((m) => m.id), [`live:${root}:call-1`]); ok();
  h.controller.dispose();
}

// (S-2 b) Never recreate a bubble for a call whose record or reply is here.
{
  const h = await loaded();
  h.step(root, llmCall(1, "started"));
  h.step(root, llmCall(2, "completed")); // record first (runtime order), no delta seen yet
  h.push(root, delta(0, "reply", { snapshot: true }));
  assert.equal(liveOf(h.controller).length, 0, "a call with a terminal record gets no bubble"); ok();
  h.push(root, delta(1, "second call", { call_id: "call-2" }));
  h.step(root, answer(3, "second call"));
  h.push(root, delta(1, "second call", { call_id: "call-2", snapshot: true }));
  h.push(root, delta(2, " again", { call_id: "call-2" }));
  assert.equal(liveOf(h.controller).length, 0, "no bubble after the final answer"); ok();
  assert.equal(assistantTexts(h.controller, "second call").length, 1); ok();
  h.controller.dispose();
}

// (S-2 c) Every (re)connect drops the stream's live bubbles before snapshots.
{
  const h = await loaded();
  h.push(root, delta(1, "Hello"));
  h.push(root, delta(2, " there"));
  assert.equal(liveOf(h.controller)[0].content, "Hello there"); ok();
  h.state.streams.get(root).close(); // the SSE connection drops
  const deadline = Date.now() + 3000;
  while ((h.state.connects.get(root) || 0) < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.state.connects.get(root), 2, "the controller reconnected"); ok();
  assert.equal(liveOf(h.controller).length, 0, "reconnect drops live bubbles before snapshots"); ok();
  h.push(root, delta(2, "Hello there", { snapshot: true }));
  h.push(root, delta(3, "!"));
  assert.deepEqual(liveOf(h.controller).map((m) => m.content), ["Hello there!"]); ok();
  h.controller.dispose();
}

// (S-2 d) reason "unavailable": a one-line note, once per run and cause.
{
  const h = await loaded();
  h.push(root, end(0, "unavailable", { detail: "structured_output" }));
  h.push(root, end(0, "unavailable", { call_id: "call-2", detail: "structured_output" }));
  let notes = h.controller.getSnapshot().messages.filter((m) => String(m.id).startsWith("stream-unavailable:"));
  assert.equal(notes.length, 1); ok();
  assert.equal(notes[0].content, "This reply is not streamed: this step asks the model for structured output. It appears when it is complete."); ok();
  assert.equal(notes[0].role, "system"); ok();
  h.push(root, end(0, "unavailable", { call_id: "call-3", detail: "brand_new_cause" }));
  notes = h.controller.getSnapshot().messages.filter((m) => String(m.id).startsWith("stream-unavailable:"));
  assert.equal(notes.length, 2); ok();
  assert.match(notes[1].content, /"brand_new_cause"/, "an unknown detail is shown, never hidden"); ok();
  assert.match(describeStreamUnavailable(), /no reason/); ok();
  for (const detail of ["remote_core", "provider_cannot_stream", "sink_error", "usage_unavailable"]) assert.doesNotMatch(describeStreamUnavailable(detail), /reported/, detail);
  ok();
  assert.equal(liveOf(h.controller).length, 0); ok();
  assert.equal(h.controller.getSnapshot().error, null); ok();
  h.controller.dispose();
}

// (S-2 a) A sub-run's deltas on the ROOT stream: labelled bubble.
{
  const h = await loaded();
  h.push(root, delta(1, "digging", { run_id: child, parent_run_id: root, node_id: "researcher" }));
  const live = liveOf(h.controller);
  assert.equal(live[0].id, `live:${child}:call-1`); ok();
  assert.equal(live[0].live.caption, "sub-agent · researcher"); ok();
  h.push(root, delta(1, "mine"));
  assert.equal(liveOf(h.controller).find((m) => m.runId === root).live.caption, undefined, "the root's own reply has no caption"); ok();
  h.controller.dispose();
}

// Malformed delta: visible error, never a guessed bubble.
{
  const h = await loaded();
  h.push(root, { run_id: root, call_id: "call-1", seq: "1", text: "x", channel: "content", snapshot: false });
  assert.match(h.controller.getSnapshot().error || "", /Malformed llm\.delta event.*seq/); ok();
  assert.equal(liveOf(h.controller).length, 0); ok();
  h.controller.dispose();
}

// reset() drops live state.
{
  const h = await loaded();
  h.push(root, delta(1, "x"));
  h.controller.reset();
  assert.equal(h.controller.getSnapshot().messages.length, 0); ok();
  h.controller.dispose();
}

// ------------------------------------------------------------ 3. Rendering
{
  const liveMessage = { id: `live:${root}:call-1`, role: "assistant", content: "Visible reply", live: { callId: "call-1", reasoning: "hidden plan", truncated: true, caption: "sub-agent · researcher" } };
  const card = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: liveMessage }));
  assert.match(card, /pc-chat-item--live/); ok();
  assert.match(card, /aria-busy="true"/); ok();
  assert.match(card, /pc-chat-live-indicator[^>]*>.*streaming/); ok();
  assert.match(card, /Earlier text was dropped by the gateway\./); ok();
  assert.match(card, /pc-chat-live-caption">sub-agent · researcher</); ok();
  assert.match(card, /<details class="pc-chat-thinking"><summary>Thinking<\/summary>/, "reasoning is collapsed by default"); ok();
  const body = card.slice(card.indexOf("pc-chat-body"));
  assert(body.includes("Visible reply") && !body.includes("hidden plan"), "reasoning never mixed into the reply text"); ok();
  const plain = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { id: "a", role: "assistant", content: "Visible reply" } }));
  assert.doesNotMatch(plain, /streaming|pc-chat-thinking|Earlier text/); ok();
  const noTrunc = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { ...liveMessage, live: { callId: "c", reasoning: "", truncated: false } } }));
  assert.doesNotMatch(noTrunc, /Earlier text|pc-chat-thinking|pc-chat-live-caption/); ok();

  const base = { messages: [liveMessage], draft: "", onDraftChange() {}, onSend() {} };
  const chat = renderToStaticMarkup(React.createElement(WorkflowChat, { ...base, streamReplies: "on" }));
  assert.match(chat, /data-stream-replies="on"/); ok();
  assert.match(chat, /pc-chat-item--live/); ok();
  assert.match(renderToStaticMarkup(React.createElement(WorkflowChat, base)), /data-stream-replies="gateway_default"/); ok();

  assert.deepEqual(streamRepliesRuntime("on"), { stream: true }); ok();
  assert.deepEqual(streamRepliesRuntime("off"), { stream: false }); ok();
  assert.deepEqual(streamRepliesRuntime("gateway_default"), {}); ok();
  assert.throws(() => streamRepliesRuntime("yes"), /Unknown streamReplies mode/); ok();
  for (const name of ["llmDeltaFromSse", "validateLlmDeltaEvent", "isLlmDeltaEnd", "streamRepliesRuntime", "describeStreamUnavailable"]) assert.equal(typeof api[name], "function", name);
  ok();
}

console.log(`check_live_replies: ok (${checks} checks)`);
