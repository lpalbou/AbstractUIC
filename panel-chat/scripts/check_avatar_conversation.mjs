import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarConversation, WorkflowChat, conversationMessages, conversationReply, conversationPages, conversationState, conversationSnapshot, conversationCueStep, conversationNarrationStep, DEFAULT_CONVERSATION_CUES, publicUpdate, projectReplayView, WorkflowSessionController, presentInteraction } from "../dist/index.js";

const body = { id: "brief-1", text: "I found the supported format.", run_id: "run", session_id: "session", iteration: 2, source_call_ids: ["call-1"] };
const update = publicUpdate(body, "run");
assert.deepEqual(update, { id: "brief-1", text: body.text, runId: "run", sessionId: "session", iteration: 2, sourceCallIds: ["call-1"] });
assert.equal(publicUpdate({ ...body, run_id: "other" }, "run"), null);
assert.equal(publicUpdate({ ...body, source_call_ids: "call-1" }, "run"), null);
const m = { id: "public:1", role: "assistant", kind: "public_update", runId: "run", content: body.text, publicUpdate: update };
const messages = [
  { role: "user", content: "Find the format." },
  { role: "assistant", content: "PRIVATE untyped reasoning" },
  { role: "assistant", kind: "answer", content: "PRIVATE streaming marker", live: { callId: "llm", reasoning: "PRIVATE" } },
  { role: "system", kind: "tool_activity", content: "PRIVATE tool output" },
  { role: "assistant", kind: "public_update", content: "PRIVATE unvalidated public text" },
  m, { ...m }, { id: "final", role: "assistant", kind: "final", content: "The answer is ready.", reasoning: "PRIVATE final reasoning" },
];
assert.deepEqual(conversationMessages(messages).map((entry) => entry.content), ["Find the format.", body.text, "The answer is ready."]);
const html = renderToStaticMarkup(React.createElement(AvatarConversation, { sessionKey: "session", messages, avatar: React.createElement("span", null, "Avatar") }));
assert(!html.includes("PRIVATE"));
assert(html.includes("Avatar") && html.includes("The answer is ready."));
assert(html.includes("Conversation history") && html.includes("Conversation cues"));
assert.equal((html.match(/type="checkbox"/g) || []).length, 6);
const defaultHtml = renderToStaticMarkup(React.createElement(WorkflowChat, { messages: [], draft: "Retained draft", onDraftChange() {}, onSend() {} }));
assert(!defaultHtml.includes("pc-avatar-conversation"));
const optionalHtml = renderToStaticMarkup(React.createElement(WorkflowChat, { messages, draft: "Retained draft", onDraftChange() {}, onSend() {}, avatarConversation: { sessionKey: "session", avatar: "Avatar" } }));
assert(optionalHtml.includes("pc-avatar-conversation") && optionalHtml.includes("Retained draft"));
assert(!optionalHtml.includes("PRIVATE"));
assert.deepEqual(conversationPages("one two three four", 7), ["one two", "three", "four"]);
assert.equal(conversationReply("My words", null, "run"), "My words");
assert(conversationReply("My words", m, "run").endsWith("My words"));
assert.throws(() => conversationReply("My words", m, "other"), /another run/);

const base = { sessionKey: "session", connected: true, attended: false, preferences: DEFAULT_CONVERSATION_CUES };
const attention = { id: "wait1", kind: "approval" };
let step = conversationCueStep(null, { ...base, attention });
assert.equal(step.cue, null, "mount is a baseline");
step = conversationCueStep(step.cursor, { ...base, attention });
assert.equal(step.cue, null, "duplicate/replay is silent");
step = conversationCueStep(step.cursor, { ...base, attention: { id: "wait2", kind: "question" } });
assert.equal(step.cue.kind, "question");
assert.equal(step.cue.channels.audio, false);
step = conversationCueStep(step.cursor, { ...base, connected: false, attention: { id: "wait3", kind: "question" } });
assert.equal(step.cue, null);
step = conversationCueStep(step.cursor, { ...base, attention: { id: "wait4", kind: "question" } });
assert.equal(step.cue, null, "reconnect does not replay");
step = conversationCueStep(step.cursor, { ...base, attended: true, attention: { id: "wait5", kind: "completion" } });
assert.equal(step.cue, null, "history/reading/draft is silent");
step = conversationCueStep(step.cursor, { ...base, attention: { id: "wait5", kind: "completion" } });
assert.equal(step.cue, null, "return to latest does not replay attended cues");
step = conversationCueStep(step.cursor, { ...base, sessionKey: "other", attention });
assert.equal(step.cue, null, "session switch resets the baseline");
assert.equal(conversationState({ listening: true, speaking: true, attention }), "approval");
assert.equal(conversationState({ listening: true, speaking: true }), "listening");
assert.equal(conversationState({ attention, connection: "reconnecting" }), "disconnected");
assert.equal(conversationState({ status: "paused", attention }), "paused");
const snapshot = { status: "waiting", connection: "connected", run: { run_id: "run" }, interaction: { runId: "run", wait: { reason: "user", wait_key: "q", details: { question: { id: "q", importance: "essential" } } } } };
assert.equal(conversationSnapshot(snapshot).attention.importance, "essential");
assert.equal(conversationSnapshot({ ...snapshot, status: "paused" }).status, "paused");
assert.equal(conversationSnapshot({ ...snapshot, historyLoading: true }).replaying, true);
assert.equal(conversationSnapshot({ ...snapshot, interaction: { ...snapshot.interaction, wait: { reason: "tool_approval" } }, toolApprovalGranted: true }).attention, null);

const view = { version: "replay_view_v1", root_run_id: "run", status: "running", runs: [], messages: [{ id: "brief-1", role: "assistant", kind: "public_update", text: body.text, run_id: "run", source: "emit_event", source_call_ids: body.source_call_ids, iteration: 2 }], activities: [], artifacts: [] };
const projected = projectReplayView(view).messages[0];
assert.equal(projected.source, "emit_event");
assert.deepEqual(projected.publicUpdate.sourceCallIds, ["call-1"]);
assert.equal(conversationMessages([projected]).length, 1, "served view works without ledger records");

const narrationBase = { sessionKey: "session", connected: true, attended: false, enabled: true, messages: [m] };
let narration = conversationNarrationStep(null, narrationBase);
assert.equal(narration.message, null, "opening/replay never speaks");
const nextUpdate = { ...m, id: "public:2", content: "A fresh update", publicUpdate: { ...update, id: "brief-2", text: "A fresh update" } };
narration = conversationNarrationStep(narration.cursor, { ...narrationBase, messages: [m, nextUpdate] });
assert.equal(narration.message, nextUpdate);
for (const guard of [{ attended: true }, { listening: true }, { enabled: false }, { connected: false }]) {
  const missed = { ...m, publicUpdate: { ...update, id: `missed-${JSON.stringify(guard)}` } };
  narration = conversationNarrationStep(narration.cursor, { ...narrationBase, ...guard, messages: [m, missed] });
  assert.equal(narration.message, null);
  narration = conversationNarrationStep(narration.cursor, { ...narrationBase, messages: [m, missed] });
  assert.equal(narration.message, null, "missed narration never queues on return");
}
narration = conversationNarrationStep(narration.cursor, { ...narrationBase, sessionKey: "other", messages: [m, nextUpdate] });
assert.equal(narration.message, null, "session reset never narrates history");
const questionController = { async resume() {}, async approve() {}, async emitEvent() {} };
const essentialQuestion = presentInteraction({ runId: "run", wait: { reason: "user", wait_key: "q", details: { question: { id: "q", purpose: "conversation", importance: "essential" } } } }, questionController, { allowSkip: true });
assert.equal(essentialQuestion.onSkip, undefined);
assert(essentialQuestion.description.includes("keep waiting"));
const clarificationQuestion = presentInteraction({ runId: "run", wait: { reason: "user", wait_key: "q", details: { question: { id: "q", purpose: "conversation", importance: "clarification", deadline: "2026-11-01T15:00:00Z", fallback: "Use the existing format." } } } }, questionController, { allowSkip: true });
assert(clarificationQuestion.description.includes("2026-11-01T15:00:00Z") && clarificationQuestion.description.includes("Use the existing format."));
assert.equal(clarificationQuestion.onSkip, undefined);

const record = { status: "completed", run_id: "run", effect: { type: "emit_event", payload: { name: "public_update", payload: body } }, result: {} };
const transport = { async getRun() { return { run_id: "run", status: "running" }; }, async getHistory() { return { run: { run_id: "run", status: "running" }, ledgers: { run: { items: [{ cursor: 1, record }, { cursor: 2, record }] } } }; }, async getLedger() { return { items: [] }; }, async streamLedger(_run, _after, _step, signal, open) { open?.(); await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); }, async submitCommand() { return { accepted: true }; } };
const controller = new WorkflowSessionController(transport);
await controller.load("run");
const publicRows = controller.getSnapshot().messages.filter((entry) => entry.kind === "public_update");
assert.equal(publicRows.length, 1, "same stable event id deduplicates across records");
assert.deepEqual(publicRows[0].publicUpdate.sourceCallIds, ["call-1"]);
controller.dispose();
console.log("check_avatar_conversation: public-only projection, source/dedup, default chat, cue lifecycle, state precedence and reply scope passed");
