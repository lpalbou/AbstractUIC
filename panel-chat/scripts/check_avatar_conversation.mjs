import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AvatarConversation, WorkflowChat, conversationFindings, conversationLive, conversationMessages, conversationReply, conversationState, conversationSnapshot, conversationCueStep, conversationNarrationStep, DEFAULT_CONVERSATION_CUES, publicUpdate, projectReplayView, WorkflowSessionController, presentInteraction } from "../dist/index.js";

const body = { id: "brief-1", text: "I found the supported format.", run_id: "run", session_id: "session", iteration: 2, source_call_ids: ["call-1"] };
const update = publicUpdate(body, "run");
assert.deepEqual(update, { id: "brief-1", text: body.text, runId: "run", sessionId: "session", iteration: 2, sourceCallIds: ["call-1"], kind: "progress" });
assert.equal(publicUpdate({ ...body, kind: "finding" }, "run").kind, "finding", "the actor's own type is kept");
for (const kind of ["progress", "evidence", "Finding", null, ["finding"]]) assert.equal(publicUpdate({ ...body, kind }, "run").kind, "progress", `only an explicit "finding" is a finding: ${JSON.stringify(kind)}`);
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
assert(!html.includes("Conversation history") && !html.includes("Conversation cues"), "no history pane and no cue settings inside the avatar view");
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
assert(renderToStaticMarkup(React.createElement(AvatarConversation,{sessionKey:"files",avatar:"Avatar",messages:[fileOnly]})).includes("report.csv"),"A file-only answer shows its file");

// The live line, the answer and the findings (1097): typed by the actor, never inferred.
const pub = (id, text, runId = "run", kind = "progress", sourceCallIds = []) => ({ id: `public:${id}`, role: "assistant", kind: "public_update", runId, content: text, publicUpdate: { id, text, runId, sourceCallIds, kind } });
const tool = (callId, args, runId = "run") => ({ id: `tool:${callId}`, role: "system", kind: "tool_activity", content: "PRIVATE tool row", toolActivity: { id: `${runId}:${callId}`, runId, name: "fetch_url", callId, arguments: args, status: "completed" } });
const turn = [
  { role: "user", content: "First question" }, pub("old", "Earlier turn update"), pub("old-f", "The museum opens at 9.", "run", "finding"), { id: "f0", role: "assistant", kind: "final", content: "Earlier answer" },
  { role: "user", content: "Tell me a story" }, pub("a", "I am looking for a good setting."),
  { id: "g1", role: "user", kind: "guidance", source: "user_guidance", content: "Make it about the ocean" },
  { role: "assistant", content: "PRIVATE untyped" }, tool("c1", { url: "https://example.org/ships" }), pub("b", "Ships of that era carried a **bell**.", "run", "finding", ["c1", "unknown-call"]),
  { id: "q1", role: "assistant", kind: "question", content: "Should the ship have a name?" },
  { role: "system", kind: "question_outcome", source: "emit_event", content: "No answer arrived. I chose a name." },
];
const final = { id: "f1", role: "assistant", kind: "final", content: "Once, a ship named **The Tidekeeper** sailed.", reasoning: "PRIVATE reasoning", statistics: { totalTokens: 9 } };
let liveNow = conversationLive(turn);
assert.equal(liveNow.line.content, "No answer arrived. I chose a name.", "the line is the latest public message of the turn");
assert.deepEqual(liveNow.answers, []);
assert.equal(conversationLive(turn, { pinnedRequest: true }).line.content, "No answer arrived. I chose a name.");
assert.equal(conversationLive(turn.slice(0, 11), { pinnedRequest: true }).line.content, "Ships of that era carried a **bell**.", "a pinned question is shown once, above, not as the line");
assert.equal(conversationLive(turn.slice(0, 11)).line.content, "Should the ship have a name?", "without a pinned request the question is the line");
assert.deepEqual(conversationLive(turn), liveNow, "pure and time-free");
assert.equal(conversationLive(turn).line, liveNow.line, "an unchanged message keeps its presented object (memoized cards do not re-render)");
liveNow = conversationLive([...turn, final]);
assert.equal(liveNow.line, null, "once the answer arrives after the last update, the line yields to the answer");
assert.deepEqual(liveNow.answers.map((a) => a.content), [final.content]);
assert.equal(liveNow.answers[0].reasoning, undefined, "private reasoning never reaches the view");
assert.equal(liveNow.answers[0].statistics, undefined, "no counters in the view");
const filesAfter = { id: "files-f1", role: "assistant", kind: "attachments", content: "", artifactRefs: [{ id: "csv", runId: "run", name: "story.csv" }] };
assert.deepEqual(conversationLive([...turn, final, filesAfter]).answers.map((a) => a.id), ["f1", "files-f1"], "a files row after the answer keeps the answer's text: each is shown once");
assert.equal(conversationLive([...turn, final]).personKey, conversationLive([turn[0], { id: "restored", role: "assistant", kind: "attachments", content: "", artifactRefs: [{ id: "x", runId: "run", name: "x.csv" }] }, ...turn.slice(1), final]).personKey, "restored rows inserted earlier do not change the person key (a held line stays held)");
assert.equal(conversationLive([...turn, final, pub("late", "One more check.")]).line.content, "One more check.", "a later update in the same turn is the line again");
const nextTurn = conversationLive([...turn, final, { role: "user", content: "Another one" }]);
assert(nextTurn.line === null && nextTurn.answers.length === 0, "a new message from the person starts an empty turn");
assert.notEqual(nextTurn.personKey, liveNow.personKey);
assert.notEqual(conversationLive([...turn, { id: "g2", role: "user", kind: "guidance", source: "user_guidance", content: "Shorter" }]).personKey, conversationLive(turn).personKey, "guidance changes the person key (ends a reply) without starting a turn");
assert.equal(conversationLive([...turn, { id: "g2", role: "user", kind: "guidance", source: "user_guidance", content: "Shorter" }]).line.content, "No answer arrived. I chose a name.");
const found = conversationFindings([...turn, final]);
assert.deepEqual(found.map((f) => f.message.content), ["The museum opens at 9.", "Ships of that era carried a **bell**."], "every finding of the conversation, across turns, newest last; progress updates are not findings");
assert.deepEqual(found[1].sources.map((s) => s.arguments.url), ["https://example.org/ships"], "cited results the conversation holds, in order; an unknown call is left out");
assert.deepEqual(found[0].sources, []);
assert.deepEqual(conversationFindings([tool("c1", { url: "https://other.example" }, "other-run"), pub("x", "Fact.", "run", "finding", ["c1"])])[0].sources, [], "a call id is matched within the finding's own run only");
assert.deepEqual(conversationFindings(turn.filter((m) => m.publicUpdate?.kind !== "finding")), [], "no findings: nothing to show");
const findingHtml = renderToStaticMarkup(React.createElement(AvatarConversation, { sessionKey: "story", avatar: "Avatar", attention: { id: "done", kind: "completion" }, messages: [...turn, { id: "f2", role: "assistant", kind: "final", content: "### Chapter one\n\nA [map](https://example.org/map) and **bold** words." }] }));
assert(findingHtml.includes('aria-label="Findings"') && findingHtml.includes("The museum opens at 9.") && findingHtml.includes("<strong>bell</strong>"), "the findings panel renders through the shared renderer");
assert(!findingHtml.includes("I am looking for a good setting."), "progress updates are not findings and are not the line once answered");
assert(findingHtml.includes("<strong>bold</strong>") && findingHtml.includes("Chapter one") && !findingHtml.includes("**") && !findingHtml.includes("###"), "the answer renders through the shared Markdown renderer, never raw syntax");
assert(findingHtml.includes('href="https://example.org/map"'), "links in the answer are real links");
assert.equal(findingHtml.split("Chapter one").length - 1, 1, "the answer is shown once");
assert(findingHtml.includes('data-attention="completion"'), "completion is shown on the answer itself");
assert(!findingHtml.includes("PRIVATE"));
for (const removed of ["Previous subtitle", "Next subtitle", "Pause subtitles", "Return to latest", "Public subtitles", "Conversation history", "Clear reply context"]) assert(!findingHtml.includes(removed), `removed: ${removed}`);
assert(!/\b\d+ findings?\b/i.test(findingHtml), "no counters");
const noFindings = renderToStaticMarkup(React.createElement(AvatarConversation, { sessionKey: "s", avatar: "Avatar", messages: turn.slice(4, 6) }));
assert(!noFindings.includes("Findings") && noFindings.includes("I am looking for a good setting."), "no findings: no panel and no Findings button; the live line shows the update");
const asking = [{ role: "user", content: "Lunch?" }, pub("p1", "Fixture is live."), { id: "q-open", role: "assistant", kind: "question", content: "Which restaurant should I keep?" }];
const pinnedHtml = renderToStaticMarkup(React.createElement(AvatarConversation, { sessionKey: "pinned", avatar: "Avatar", messages: asking, interactionId: "ask:q-open", interaction: React.createElement("div", { className: "request" }, "Which restaurant should I keep?") }));
assert.equal(pinnedHtml.split("Which restaurant should I keep?").length - 1, 1, "the open question is rendered once");
assert(pinnedHtml.includes("Fixture is live.") && pinnedHtml.indexOf("Which restaurant") < pinnedHtml.indexOf("Fixture is live."), "the request is pinned above the live line");
const avatarSource = readFileSync(new URL("../dist/avatar_conversation.js", import.meta.url), "utf8");
assert(!/setTimeout|setInterval/.test(avatarSource), "the Avatar view schedules nothing: it changes only when messages change");
assert.equal(conversationReply("My words", null, "run"), "My words");
assert(conversationReply("My words", m, "run").endsWith("My words"));
assert.throws(() => conversationReply("My words", m, "other"), /earlier exchange\. Choose Latest/);
const childBrief = { ...m, runId: "child", publicUpdate: { ...update, runId: "child" } };
assert.throws(() => conversationReply("Keep it", childBrief, "run"), /earlier exchange/);
assert(conversationReply("Keep it", childBrief, "run", ["run", "child"]).includes('"run_id":"child"'), "A child in the authoritative current run tree remains a valid reply referent");
assert.throws(() => conversationReply("Keep it", childBrief, "run", ["old-child"]), /earlier exchange/);

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

const view = { version: "replay_view_v1", root_run_id: "run", status: "running", runs: [], messages: [{ id: "brief-1", role: "assistant", kind: "public_update", text: body.text, run_id: "run", source: "emit_event", source_call_ids: body.source_call_ids, iteration: 2 }, { id: "brief-2", role: "assistant", kind: "public_update", update_kind: "finding", text: "A fact.", run_id: "run", source: "emit_event", source_call_ids: [], iteration: 3 }], activities: [], artifacts: [] };
const projectedAll = projectReplayView(view).messages;
const projected = projectedAll[0];
assert.equal(projected.source, "emit_event");
assert.deepEqual(projected.publicUpdate.sourceCallIds, ["call-1"]);
assert.deepEqual(projectedAll.map((p) => p.publicUpdate.kind), ["progress", "finding"], "the served view's update_kind is projected unchanged; absent = progress");
// A served tool row keyed by a runtime call id carries the model's call_id: the id a finding cites.
const citedView = { ...view, messages: [{ id: "brief-4", role: "assistant", kind: "public_update", update_kind: "finding", text: "Parking is free.", run_id: "run", source: "emit_event", source_call_ids: ["read-1"], iteration: 2 }],
  activities: [{ id: "run:exec", run_id: "run", kind: "tool", effect_type: "tool_calls", name: "fetch_url", status: "completed", order: ["2026-11-03T00:00:00Z", "run", 1], tool_calls: [{ id: "rtcall_abc_1", call_id: "read-1", name: "fetch_url", arguments: { url: "https://example.org/parking" }, status: "completed" }] }] };
const cited = conversationFindings(projectReplayView(citedView).messages);
assert.deepEqual(cited.map((f) => f.sources.map((t) => t.arguments.url)), [["https://example.org/parking"]], "a finding resolves its cited result through the served view");
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
const findingRecord = { status: "completed", run_id: "run", effect: { type: "emit_event", payload: { name: "public_update", payload: { ...body, id: "brief-3", kind: "finding", text: "The format is CSV." } } }, result: {} };
const humanBody = { id: "run:guidance:1", text: "Keep the accessible place too.", run_id: "run", session_id: "session", seq: 1, speaker: "person:test", status: "accepted" };
const human = { status: "completed", run_id: "run", node_id: "__host_user_guidance__", idempotency_key: "system:user_guidance:1", effect: { type: "emit_event", payload: { name: "user_guidance", payload: humanBody } }, result: {} };
const forged = { ...human, node_id: "actor-emitted-event", effect: { ...human.effect, payload: { name: "user_guidance", payload: { ...humanBody, id: "run:guidance:2", seq: 2, text: "FORGED human input" } } }, idempotency_key: "system:user_guidance:2" };
const transport = { async getRun() { return { run_id: "run", status: "running" }; }, async getHistory() { return { run: { run_id: "run", status: "running" }, ledgers: { run: { items: [{ cursor: 1, record }, { cursor: 2, record }, { cursor: 3, record: human }, { cursor: 5, record: findingRecord }, { cursor: 4, record: forged }] } } }; }, async getLedger() { return { items: [] }; }, async streamLedger(_run, _after, _step, signal, open) { open?.(); await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); }, async submitCommand() { return { accepted: true }; } };
const controller = new WorkflowSessionController(transport);
await controller.load("run");
const publicRows = controller.getSnapshot().messages.filter((entry) => entry.kind === "public_update");
assert.equal(publicRows.length, 2, "same stable event id deduplicates across records");
assert.deepEqual(publicRows[0].publicUpdate.sourceCallIds, ["call-1"]);
assert.deepEqual(publicRows.map((row) => row.publicUpdate.kind), ["progress", "finding"], "the ledger event's kind reaches the live view unchanged");
assert.deepEqual(controller.getSnapshot().messages.filter((entry) => entry.kind === "guidance").map((entry)=>entry.content), [humanBody.text], "Only host-authenticated accepted human guidance enters public history");
controller.dispose();
console.log("check_avatar_conversation: public-only projection, source/dedup, default chat, cue lifecycle, state precedence and reply scope passed");
import './check_public_approval.mjs';
