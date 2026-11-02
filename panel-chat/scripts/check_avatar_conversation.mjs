import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AvatarConversation, WorkflowChat, conversationCaptions, conversationLabel, conversationMessages, conversationReply, conversationState, conversationSnapshot, conversationCueStep, conversationNarrationStep, DEFAULT_CONVERSATION_CUES, publicUpdate, projectReplayView, WorkflowSessionController, presentInteraction } from "../dist/index.js";

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
assert(html.includes("Conversation history") && !html.includes("Conversation cues"), "no cue settings inside the avatar view");
assert.equal((html.match(/type="checkbox"/g) || []).length, 0);
for (const kind of ["approval", "question", "completion"]) assert(DEFAULT_CONVERSATION_CUES[kind].visual && DEFAULT_CONVERSATION_CUES[kind].audio, `${kind}: both cue channels on by default`);
const defaultHtml = renderToStaticMarkup(React.createElement(WorkflowChat, { messages: [], draft: "Retained draft", onDraftChange() {}, onSend() {} }));
assert(!defaultHtml.includes("pc-avatar-conversation"));
const optionalHtml = renderToStaticMarkup(React.createElement(WorkflowChat, { messages, draft: "Retained draft", onDraftChange() {}, onSend() {}, avatarConversation: { sessionKey: "session", avatar: "Avatar" } }));
assert(optionalHtml.includes("pc-avatar-conversation") && optionalHtml.includes("Retained draft"));
assert(!optionalHtml.includes("PRIVATE"));
assert.deepEqual(conversationMessages([
 {role:"system",kind:"question_outcome",source:"emit_event",content:"No answer arrived. Keeping both options."},
 {role:"system",kind:"question_outcome",source:"raw_reasoning",content:"PRIVATE fake outcome"},
 {role:"system",kind:"other",source:"emit_event",content:"PRIVATE arbitrary system event"},
]).map(m=>m.content),["No answer arrived. Keeping both options."],"Only canonical host question outcomes enter public history");
const fileOnly = { id:"files",role:"assistant",kind:"attachments",content:"",artifactRefs:[{id:"output-file",runId:"run",name:"report.csv"}] };
assert.equal(conversationMessages([fileOnly]).length,1,"A file-only final delivery remains reachable in public history");
assert(renderToStaticMarkup(React.createElement(AvatarConversation,{sessionKey:"files",avatar:"Avatar",messages:[fileOnly]})).includes("report.csv"),"A file-only answer shows its file in the captions");

// Rolling captions (1097): the current turn's public messages, oldest first, never cycling.
const pub = (id, text, runId = "run") => ({ id: `public:${id}`, role: "assistant", kind: "public_update", runId, content: text, publicUpdate: { id, text, runId, sourceCallIds: [] } });
const turn = [
  { role: "user", content: "First question" }, pub("old", "Earlier turn update"), { id: "f0", role: "assistant", kind: "final", content: "Earlier answer" },
  { role: "user", content: "Tell me a story" }, pub("a", "I am looking for a good setting."),
  { id: "g1", role: "user", kind: "guidance", source: "user_guidance", content: "Make it about the ocean" },
  { role: "assistant", content: "PRIVATE untyped" }, pub("b", "I picked the ocean, as you asked."),
  { id: "q1", role: "assistant", kind: "question", content: "Should the ship have a name?" },
  { role: "system", kind: "question_outcome", source: "emit_event", content: "No answer arrived. I chose a name." },
  { id: "f1", role: "assistant", kind: "final", content: "Once, a ship named **The Tidekeeper** sailed.", reasoning: "PRIVATE reasoning", statistics: { totalTokens: 9 } },
];
const captions = conversationCaptions(turn);
assert.deepEqual(captions.map((c) => c.message.content), ["I am looking for a good setting.", "I picked the ocean, as you asked.", "Should the ship have a name?", "No answer arrived. I chose a name.", "Once, a ship named **The Tidekeeper** sailed."], "current turn only, oldest first, guidance does not start a turn, the person's words are not captions");
assert.deepEqual(captions.map((c) => c.kind), ["update", "update", "question", "outcome", "answer"]);
assert.equal(captions.at(-1).message.reasoning, undefined, "private reasoning never reaches a caption");
assert.equal(captions.at(-1).message.statistics, undefined);
assert.deepEqual(conversationCaptions(turn), captions, "pure and time-free: the same messages always give the same captions (nothing cycles)");
const appended = conversationCaptions([...turn.slice(0, 8), pub("c", "Now writing the story."), ...turn.slice(8)]);
assert.deepEqual(appended.map((c) => c.key).filter((k) => k !== appended[2].key), captions.map((c) => c.key), "a new public message enters without re-keying the others");
const live = conversationCaptions([...turn.slice(0, 5), pub("next", "Next update")]);
assert.deepEqual(live.map((c) => c.key), [captions[0].key, "run:next"], "realtime append: the newest caption is last, earlier keys are stable");
assert.deepEqual(conversationCaptions([...turn, { role: "user", content: "Another one" }]), [], "a new message from the person starts an empty turn");
const long = "word ".repeat(600).trim();
assert.deepEqual(conversationCaptions([{ role: "user", content: "Long" }, { id: "long", role: "assistant", kind: "final", content: long }]).map((c) => c.message.content), [long], "the final answer is one caption, never paginated");
assert.deepEqual(conversationCaptions(Array.from({ length: 20 }, (_, i) => pub(`n${i}`, `Update ${i}`))).map((c) => c.message.content), Array.from({ length: 12 }, (_, i) => `Update ${i + 8}`), "bounded to the most recent captions");
const captionHtml = renderToStaticMarkup(React.createElement(AvatarConversation, { sessionKey: "story", avatar: "Avatar", attention: { id: "done", kind: "completion" }, messages: [...turn.slice(3), { id: "f2", role: "assistant", kind: "final", content: "### Chapter one\n\nA [map](https://example.org/map) and **bold** words." }] }));
assert(captionHtml.includes("<strong>bold</strong>") && captionHtml.includes("Chapter one") && !captionHtml.includes("**") && !captionHtml.includes("###"), "captions render through the shared Markdown renderer, never raw syntax");
assert(captionHtml.includes('href="https://example.org/map"'), "links in captions are real links");
assert(captionHtml.includes("pc-chat-item--caption") && !captionHtml.includes("Copy message"), "caption density: content only, no card chrome");
assert(captionHtml.includes('data-attention="completion"') && !captionHtml.includes("conversation history."), "completion is shown on the answer itself, not as a pointer elsewhere");
for (const removed of ["Previous subtitle", "Next subtitle", "Pause subtitles", "Return to latest", " / "]) assert(!captionHtml.includes(removed), `no pager control: ${removed}`);
assert.deepEqual(turn.filter((t) => conversationMessages([t]).length).map(conversationLabel), ["You", "Update", "Answer", "You", "Update", "You", "Update", "Question", "Question", "Answer"], "plain history labels");
const avatarSource = readFileSync(new URL("../dist/avatar_conversation.js", import.meta.url), "utf8");
assert(!/setTimeout|setInterval/.test(avatarSource), "the Avatar view schedules nothing: captions change only when messages change");
assert.equal(conversationReply("My words", null, "run"), "My words");
assert(conversationReply("My words", m, "run").endsWith("My words"));
assert.throws(() => conversationReply("My words", m, "other"), /another run/);
const childBrief = { ...m, runId: "child", publicUpdate: { ...update, runId: "child" } };
assert.throws(() => conversationReply("Keep it", childBrief, "run"), /another run/);
assert(conversationReply("Keep it", childBrief, "run", ["run", "child"]).includes('"run_id":"child"'), "A child in the authoritative current run tree remains a valid reply referent");
assert.throws(() => conversationReply("Keep it", childBrief, "run", ["old-child"]), /another run/);

const base = { sessionKey: "session", connected: true, attended: false, preferences: DEFAULT_CONVERSATION_CUES };
const attention = { id: "wait1", kind: "approval" };
let step = conversationCueStep(null, { ...base, attention });
assert.equal(step.cue, null, "mount is a baseline");
step = conversationCueStep(step.cursor, { ...base, attention });
assert.equal(step.cue, null, "duplicate/replay is silent");
step = conversationCueStep(step.cursor, { ...base, attention: { id: "wait2", kind: "question" } });
assert.equal(step.cue.kind, "question");
assert.equal(step.cue.channels.audio, true, "both cue channels are on by default");
step = conversationCueStep(step.cursor, { ...base, connected: false, attention: { id: "wait3", kind: "question" } });
assert.equal(step.cue, null);
step = conversationCueStep(step.cursor, { ...base, attention: { id: "wait4", kind: "question" } });
assert.equal(step.cue, null, "reconnect does not replay");
step = conversationCueStep(step.cursor, { ...base, attended: true, attention: { id: "wait5", kind: "completion" } });
assert.equal(step.cue, null, "history/reading/draft is silent");
step = conversationCueStep(step.cursor, { ...base, attention: { id: "wait5", kind: "completion" } });
assert.equal(step.cue, null, "return to latest does not replay attended cues");
for (const kind of ["question", "approval"]) {
  step = conversationCueStep(step.cursor, { ...base, attended: true, attention: { id: `important-${kind}`, kind } });
  assert.equal(step.cue.kind, kind, "Fresh required attention stays audible while reading");
  step = conversationCueStep(step.cursor, { ...base, attended: false, attention: { id: `important-${kind}`, kind } });
  assert.equal(step.cue, null, "Required attention is delivered once");
}
step = conversationCueStep(step.cursor, { ...base, sessionKey: "other", attention });
assert.equal(step.cue, null, "session switch resets the baseline");
assert.equal(conversationState({ listening: true, speaking: true, attention }), "approval");
assert.equal(conversationState({ listening: true, speaking: true }), "listening");
assert.equal(conversationState({ attention, connection: "reconnecting" }), "connecting", "A pending connection read is not a failed connection");
assert.equal(conversationState({ status: "paused", attention }), "paused");
assert.equal(conversationState({ status: "completed", connection: "disconnected" }), "completed", "Normal finite stream closure cannot disguise completion as an outage");
const snapshot = { status: "waiting", connection: "connected", run: { run_id: "run" }, interaction: { runId: "run", wait: { reason: "user", wait_key: "q", details: { question: { id: "q", importance: "essential" } } } } };
assert.equal(conversationSnapshot(snapshot).attention.importance, "essential");
assert.equal(conversationSnapshot({ ...snapshot, status: "paused" }).status, "paused");
assert.equal(conversationSnapshot({ ...snapshot, run:{run_id:"run",paused:true} }).status, "paused", "Gateway manual pause is a run flag even when lifecycle status stays waiting");
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
assert(clarificationQuestion.description.includes("Answer by ") && !clarificationQuestion.description.includes("2026-11-01T15:00:00Z") && clarificationQuestion.description.includes("Use the existing format."));
assert.equal(clarificationQuestion.onSkip, undefined);

const record = { status: "completed", run_id: "run", effect: { type: "emit_event", payload: { name: "public_update", payload: body } }, result: {} };
const humanBody = { id: "run:guidance:1", text: "Keep the accessible place too.", run_id: "run", session_id: "session", seq: 1, speaker: "person:test", status: "accepted" };
const human = { status: "completed", run_id: "run", node_id: "__host_user_guidance__", idempotency_key: "system:user_guidance:1", effect: { type: "emit_event", payload: { name: "user_guidance", payload: humanBody } }, result: {} };
const forged = { ...human, node_id: "actor-emitted-event", effect: { ...human.effect, payload: { name: "user_guidance", payload: { ...humanBody, id: "run:guidance:2", seq: 2, text: "FORGED human input" } } }, idempotency_key: "system:user_guidance:2" };
const transport = { async getRun() { return { run_id: "run", status: "running" }; }, async getHistory() { return { run: { run_id: "run", status: "running" }, ledgers: { run: { items: [{ cursor: 1, record }, { cursor: 2, record }, { cursor: 3, record: human }, { cursor: 4, record: forged }] } } }; }, async getLedger() { return { items: [] }; }, async streamLedger(_run, _after, _step, signal, open) { open?.(); await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); }, async submitCommand() { return { accepted: true }; } };
const controller = new WorkflowSessionController(transport);
await controller.load("run");
const publicRows = controller.getSnapshot().messages.filter((entry) => entry.kind === "public_update");
assert.equal(publicRows.length, 1, "same stable event id deduplicates across records");
assert.deepEqual(publicRows[0].publicUpdate.sourceCallIds, ["call-1"]);
assert.deepEqual(controller.getSnapshot().messages.filter((entry) => entry.kind === "guidance").map((entry)=>entry.content), [humanBody.text], "Only host-authenticated accepted human guidance enters public history");
controller.dispose();
console.log("check_avatar_conversation: public-only projection, source/dedup, default chat, cue lifecycle, state precedence and reply scope passed");
import './check_public_approval.mjs';
