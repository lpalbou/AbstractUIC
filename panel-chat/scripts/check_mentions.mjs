// "@entity from any chat window" (operator 2026-11-08), the shared-kit half:
//  A. pure mention rules (trigger, pick, chip order, send payload) and author labelling;
//  B. the card's author header, with today's markup pinned when there is no author
//     (fixture captured from the 0.9.9 card BEFORE the change: scripts/fixtures/chat_card_no_author.json);
//  C. the composer's list, keyboard, chips IN the text (operator 2026-11-10), notice and send
//     (hook harness, no DOM; the browser half is check_inline_mentions_browser.mjs);
//  D. WorkflowChat passes the mentions to onSend / onSteer and clears them on success only;
//     a send that stopped partway keeps only its unsent chips; chips picked during a send stay
//     (client review 2026-11-09 B1/S1/S6/N1/N3/N4);
//  E. the replay projection carries a turn's author through;
//  F. a sent message's mentions are the composer's chips in its bubble, placed by
//     `mentions[].start` (never by reading "@"); no valid start: plain words + one #SEAM.
//  G. the host's card for a chip (`renderMentionCard`): called after a 150 ms rest (pointer or
//     keyboard focus), shown below the chip in the viewport, gone on leave/blur/Escape; nothing
//     without the prop or when it returns null.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, findAll, find, textOf } from "./hook_harness.mjs";
import {
  addMention,
  applyMentionPick,
  mentionAtCaret,
  mentionClipboard,
  mentionEditSpan,
  mentionKey,
  mentionPickEdit,
  mentionSelection,
  mentionsAfterEdit,
  mentionsFromClipboard,
  mentionsInText,
  mentionsWithInserted,
  mentionText,
  MENTION_CLIPBOARD_TYPE,
  mentionSendPayload,
  mentionTriggerAt,
  moveMentionActive,
  removeMention,
  usableCandidates,
  unsentMentionsOf,
  mentionsStoppedError,
  mentionsAfterSend,
  mentionResend,
  uniqueMentions,
  MENTION_QUERY_MAX,
  messageMentionsPlaced,
  mentionTokenText,
  mentionTokenParts,
  mentionTokensPlain,
} from "../dist/mentions.js";
import * as conversationEntry from "../dist/conversation.js";
import { chatAuthorOf, chatAuthorView } from "../dist/chat_author.js";
import { ChatMessageCard } from "../dist/chat_message_card.js";
import { ChatComposer } from "../dist/chat_composer.js";
import { WorkflowChat } from "../dist/workflow_chat.js";
import { projectReplayView } from "../dist/replay_view_projection.js";
import * as index from "../dist/index.js";
import { ChatMentionChip, MENTION_CARD_REST_MS, mentionCardPlacement } from "../dist/mention_chip.js";

let checks = 0;
const ok = (cond, label) => { assert.ok(cond, label); checks += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks += 1; };

// ---- A. pure rules -------------------------------------------------------------------
eq(mentionTriggerAt("@", 1), { start: 0, query: "" }, "A1 a lone @ opens the list");
eq(mentionTriggerAt("hi @cas", 7), { start: 3, query: "cas" }, "A2 the query is what follows @ up to the caret");
eq(mentionTriggerAt("hi @castor", 6), { start: 3, query: "ca" }, "A3 the caret bounds the query");
eq(mentionTriggerAt("line\n@po", 8), { start: 5, query: "po" }, "A4 after a newline");
eq(mentionTriggerAt("mail me@host", 12), null, "A5 an @ inside a word (an address) is text");
eq(mentionTriggerAt("hi @ cas", 8), null, "A6 a space after @ ends it");
eq(mentionTriggerAt("hi @cas ", 8), null, "A7 a space after the query ends it");
eq(mentionTriggerAt("no at here", 10), null, "A8 no @, no list");
eq(mentionTriggerAt("@" + "x".repeat(MENTION_QUERY_MAX + 1), MENTION_QUERY_MAX + 2), null, "A9 a query past the cap is text");
eq(applyMentionPick("hi @cas there", { start: 3, query: "cas" }, 7), { text: "hi there", caret: 3 }, "A10 a pick removes @query, one space kept");
eq(applyMentionPick("@cas hello", { start: 0, query: "cas" }, 4), { text: "hello", caret: 0 }, "A11 at the start, no leading space");
eq(applyMentionPick("hey @", { start: 4, query: "" }, 5), { text: "hey ", caret: 4 }, "A12 a bare @ picked");
const castor = { id: "castor", name: "Castor", kind: "entity", avatar: { style: "watch-lotus", color: "#3366cc" } };
const pollux = { id: "pollux", name: "Pollux", kind: "entity", avatar: { style: null, color: "#cc6633" } };
const coder = { id: "basic-agent", name: "Basic agent", kind: "agent" };
let chips = addMention([], pollux);
chips = addMention(chips, castor);
chips = addMention(chips, pollux);
eq(chips.map((m) => m.id), ["pollux", "castor"], "A13 chips keep the pick order; a second pick of a name is a no-op");
eq(addMention(chips, { ...coder, id: "castor" }).length, 3, "A14 an agent and an entity with one id are two names");
eq(removeMention(chips, mentionKey(pollux)).map((m) => m.id), ["castor"], "A15 remove drops that chip only");
eq(
  mentionSendPayload("Hi @Pollux and @Castor, ask @bob too", [{ ...castor, start: 15 }, { ...pollux, start: 3 }]),
  { text: "Hi @Pollux and @Castor, ask @bob too", mentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0, start: 3 }, { id: "castor", name: "Castor", kind: "entity", index: 1, start: 15 }] },
  "A16 the send: the text as shown, the chips in TEXT order, index 0, 1 and start (an unpicked @bob stays text)",
);
eq(mentionSendPayload("hi", []).mentions, [], "A17 no chip, no mention");
eq(mentionSendPayload("ask @bob too", chips).mentions, [], "A17b chips not placed in the text (no start) are not sent");
eq(mentionSendPayload("Hi @Castro", [{ ...castor, start: 3 }]).mentions, [], "A17c a chip whose words changed under it is not sent");
{
  // The chips in the text (operator 2026-11-10): "@Name" at `start`.
  const text = "Hi @Castor and @Pollux";
  eq(mentionText(castor), "@Castor", "A45 a chip's text is @ + its name");
  eq(mentionsInText(text, [{ ...pollux, start: 15 }, { ...castor, start: 3 }, { ...castor, start: 3 }]).map((m) => [m.id, m.start]), [["castor", 3], ["pollux", 15]], "A46 in text order, each name once");
  eq(mentionsInText(text, [{ ...castor, start: 4 }, { ...pollux }, { ...pollux, start: -1 }]), [], "A47 a chip not at its start, or with none, is not in the text");
  eq(mentionsInText("@Cas@Castor", [{ ...castor, id: "c2", name: "Cas", start: 0 }, { ...castor, start: 4 }]).length, 2, "A48 two chips side by side");
  eq(mentionEditSpan("x @Castor", "x @@Castor", 3), { start: 2, prevEnd: 2, nextEnd: 3 }, "A49 the caret anchors an insertion: an @ typed before a chip is before it");
  eq(mentionEditSpan("x @Castor", "x @@Castor"), { start: 3, prevEnd: 3, nextEnd: 4 }, "A50 without the caret the greedy span would land inside it");
  eq(mentionEditSpan("abc", "abc", 3), { start: 3, prevEnd: 3, nextEnd: 3 }, "A51 no change, an empty span");
  const at = [{ ...castor, start: 3 }, { ...pollux, start: 15 }];
  eq(mentionsAfterEdit(text, "Hi! @Castor and @Pollux", at, 3).map((m) => [m.id, m.start]), [["castor", 4], ["pollux", 16]], "A52 typing before a chip moves it");
  eq(mentionsAfterEdit(text, "Hi @Castorx and @Pollux", at, 11).map((m) => [m.id, m.start]), [["castor", 3], ["pollux", 16]], "A53 typing right after a chip keeps it, the next one moves");
  eq(mentionsAfterEdit(text, "Hi @Castr and @Pollux", at, 8).map((m) => m.id), ["pollux"], "A54 a letter deleted inside a chip drops it (the rest is plain text)");
  eq(mentionsAfterEdit(text, "Hi  and @Pollux", at, 3).map((m) => [m.id, m.start]), [["pollux", 8]], "A55 the chip deleted whole");
  eq(mentionsAfterEdit(text, "Hey and @Pollux", at, 3).map((m) => m.id), ["pollux"], "A56 typed over: gone");
  eq(mentionsAfterEdit("x @Castor", "x @@Castor", [{ ...castor, start: 2 }], 3).map((m) => m.start), [3], "A57 an @ typed just before a chip: the chip moves, intact");
  eq(mentionsAfterEdit(text, "Hi @Castor and @Pollux", [{ ...castor, start: 9 }, { ...pollux, start: 15 }], 22).map((m) => m.id), ["pollux"], "A58 only chips that were in the text are carried");
  eq(mentionsWithInserted("Hi @Castor @Pollux", [{ ...castor, start: 3 }], 11, [{ ...pollux, start: 0 }]).map((m) => [m.id, m.start]), [["castor", 3], ["pollux", 11]], "A59 pasted chips placed where they landed");
  eq(mentionsWithInserted("@Castor Hi @Castor", [{ ...castor, start: 11 }], 0, [{ ...castor, start: 0 }]).map((m) => [m.id, m.start]), [["castor", 11]], "A60 a pasted second chip of one name stays text");
  eq(mentionPickEdit("Hi @cas", { start: 3, query: "cas" }, 7, castor), { from: 3, to: 7, insert: "@Castor ", text: "Hi @Castor ", caret: 11 }, "A61 a pick: @Castor where @cas was, one space after");
  eq(mentionPickEdit("Hi @cas there", { start: 3, query: "cas" }, 7, castor), { from: 3, to: 7, insert: "@Castor", text: "Hi @Castor there", caret: 11 }, "A62 a space already follows: none added, the caret after it");
  eq([mentionAtCaret(text, at, 10, "before")?.id, mentionAtCaret(text, at, 15, "after")?.id, mentionAtCaret(text, at, 9, "before")], ["castor", "pollux", null], "A63 the chip Backspace / Delete would take");
  eq(mentionSelection(text, at, 4, 4, 3), { start: 10, end: 10 }, "A64 a step into a chip from its start lands after it");
  eq(mentionSelection(text, at, 9, 9, 10), { start: 3, end: 3 }, "A65 a step in from its end lands before it");
  eq([mentionSelection(text, at, 5, 5, 20), mentionSelection(text, at, 8, 8, null)], [{ start: 3, end: 3 }, { start: 10, end: 10 }], "A66 a click inside goes to the nearer edge");
  eq(mentionSelection(text, at, 1, 6), { start: 1, end: 10 }, "A67 a range that cuts a chip takes it whole");
  eq(mentionSelection(text, at, 12, 12), { start: 12, end: 12 }, "A68 outside the chips nothing moves");
  const copied = mentionClipboard(text, at, 0, 13);
  eq(JSON.parse(copied), { v: 1, text: "Hi @Castor an", mentions: [{ id: "castor", name: "Castor", kind: "entity", avatar: castor.avatar, start: 3 }] }, "A69 a copy carries the chips wholly inside it");
  eq(mentionClipboard(text, at, 0, 2), null, "A70 no chip inside, nothing extra");
  eq(mentionsFromClipboard(copied, "Hi @Castor an")?.map((m) => [m.id, m.start, m.avatar?.style]), [["castor", 3, "watch-lotus"]], "A71 a paste of that copy brings its chip");
  eq([mentionsFromClipboard(copied, "Hi @Castor and more"), mentionsFromClipboard("{bad", "x"), mentionsFromClipboard(null, "x"), mentionsFromClipboard(JSON.stringify({ v: 2, text: "x", mentions: [] }), "x")], [null, null, null, null], "A72 other text, garbage or another version: plain text");
  eq(mentionsFromClipboard(JSON.stringify({ v: 1, text: "@Castor", mentions: [{ id: "castor", name: "Castor", kind: "robot", start: 0 }, { id: "p", name: "Pollux", kind: "entity", start: 0 }] }), "@Castor"), null, "A73 an unknown kind or a name not at its start brings nothing");
  ok(MENTION_CLIPBOARD_TYPE === "application/x-abstractframework-mentions+json", "A74 the clipboard type");
  eq(mentionResend({ text: "x", repeatOf: null, unsent: [] }, "x", [{ id: "castor", name: "Castor", kind: "entity", index: 0, start: 3 }]), [{ id: "castor", name: "Castor", kind: "entity", index: 0, start: 3 }], "A75 a resend keeps where the chip is");
}
eq([moveMentionActive(0, 3, 1), moveMentionActive(2, 3, 1), moveMentionActive(0, 3, -1), moveMentionActive(-1, 3, -1), moveMentionActive(0, 0, 1)], [1, 0, 2, 2, -1], "A18 arrows wrap");
eq(
  usableCandidates([castor, { id: "", name: "x", kind: "entity" }, { id: "y", name: "Y", kind: "robot" }, null, { ...castor }, coder]).map(mentionKey),
  ["entity:castor", "agent:basic-agent"],
  "A19 candidates without id/name/known kind, and duplicates, are dropped",
);
eq(usableCandidates("nope"), [], "A20 a non-list is no candidates");
{
  // A send that stopped partway (review 2026-11-09 B1): the unsent chips, named by the host.
  const sentC = { id: "castor", name: "Castor", kind: "entity", index: 0 };
  const sentP = { id: "pollux", name: "Pollux", kind: "entity", index: 1 };
  const err = mentionsStoppedError("Pollux cannot answer right now.", [sentP]);
  ok(err instanceof Error && err.message === "Pollux cannot answer right now.", "A30 the stop is an Error with the sentence");
  eq(unsentMentionsOf(err), [sentP], "A31 it names the unsent chips");
  eq(unsentMentionsOf({ unsentMentions: [] }), [], "A32 an empty list is a choice (keep none)");
  eq([unsentMentionsOf(new Error("x")), unsentMentionsOf(undefined), unsentMentionsOf({ unsentMentions: "pollux" })], [null, null, null], "A33 nothing named: null");
  eq(unsentMentionsOf({ unsentMentions: [sentP, { id: 3 }, null, { id: "x", kind: "robot" }] }), [sentP], "A34 unreadable entries are dropped");
  const hypnos = { id: "hypnos", name: "Hypnos", kind: "entity" };
  eq(mentionsAfterSend([castor, pollux, hypnos], [castor, pollux]).map((m) => m.id), ["hypnos"], "A35 a send's chips go; a chip picked meanwhile stays");
  eq(mentionsAfterSend([castor, pollux, hypnos], [castor, pollux], [sentP]).map((m) => m.id), ["pollux", "hypnos"], "A36 the unsent chip stays, in its place");
  eq(mentionsAfterSend([hypnos], [castor, pollux], [sentP]).map((m) => m.id), ["hypnos"], "A37 an unsent chip removed meanwhile is not brought back");
  // The resend: same words + chips = only those mentions, first index kept; else a new message.
  const pending = { text: "  does the plan hold?", repeatOf: "run-1", unsent: [sentP] };
  eq(mentionResend(pending, "does the plan hold? ", [{ ...sentP, index: 0 }]), [sentP], "A38 a resend asks the unsent chip with its first index");
  eq(mentionResend(pending, "does the plan hold?", [{ ...sentP, index: 0 }, { ...hypnos, index: 1 }, { ...sentP, index: 2 }]), [sentP, { ...hypnos, index: 2 }], "A39 a chip added since is numbered after; each name once");
  eq(mentionResend(pending, "another question", [{ ...sentP, index: 0 }]), null, "A40 other words: a new message");
  eq(mentionResend(pending, "does the plan hold?", []), null, "A41 no chip: not a resend");
  eq(mentionResend(null, "does the plan hold?", [sentP]), null, "A42 nothing pending: a new message");
  eq(uniqueMentions([sentC, sentP, { ...sentC, index: 2 }]), [sentC, sentP], "A43 each name once, the first keeps its index");
  for (const name of ["mentionResend", "mentionsStoppedError", "unsentMentionsOf", "uniqueMentions"])
    ok(typeof index[name] === "function" && typeof conversationEntry[name] === "function", `A44 ${name} exported (package and conversation entry)`);
}

const entityAuthor = { kind: "entity", name: "Castor", entity_id: "ent-castor", identity_ref: "identity:castor", avatar: { style: "watch-lotus", color: "#3366cc" } };
const agentAuthor = { kind: "agent", name: "Basic agent", entity_id: null, identity_ref: null, avatar: null };
for (const bad of [null, undefined, "castor", {}, { kind: "robot", name: "R" }, { name: "No kind" }]) eq(chatAuthorOf(bad), null, `A21 not an author: ${JSON.stringify(bad)}`);
eq(chatAuthorOf(entityAuthor), entityAuthor, "A22 a full author passes unchanged");
eq(chatAuthorOf({ kind: "Agent", name: " ", entity_id: "", identity_ref: null, avatar: { style: "", color: "" } }), { kind: "agent", name: null, entity_id: null, identity_ref: null, avatar: null }, "A23 blanks become null, never omitted");
eq(chatAuthorView(entityAuthor, "Assistant"), { name: "Castor", tag: "entity", mark: "entity", look: { style: "watch-lotus", color: "#3366cc" }, initial: "C" }, "A24 entity: its name wins over the host title");
eq(chatAuthorView({ ...agentAuthor, name: null }, "Code agent"), { name: "Code agent", tag: "agent", mark: "agent", look: null, initial: "C" }, "A25 agent without a name: the host title");
eq(chatAuthorView({ ...entityAuthor, name: null, avatar: null }, "").name, "Entity", "A26 entity without any name: the kind's word");
eq(chatAuthorView({ kind: "person", name: "Ada", entity_id: null, identity_ref: null, avatar: null }).tag, null, "A27 a person has no kind tag");
eq(chatAuthorView(null, "Castor"), null, "A28 no author, no view");
ok(typeof index.ChatAuthorMark === "function" && typeof index.mentionSendPayload === "function" && typeof index.chatAuthorView === "function", "A29 exported from the package");

// ---- B. the card ---------------------------------------------------------------------
const card = (message) => renderToStaticMarkup(React.createElement(ChatMessageCard, { message, onSpeakToggle() {} }));
const baseline = JSON.parse(readFileSync(new URL("./fixtures/chat_card_no_author.json", import.meta.url), "utf8"));
for (const [name, { message, html }] of Object.entries(baseline)) {
  eq(card(message), html, `B1 ${name}: no author renders exactly as before the change`);
  eq(card({ ...message, author: null }), html, `B2 ${name}: author null renders exactly as before`);
  eq(card({ ...message, author: { kind: "robot", name: "R" } }), html, `B3 ${name}: an unknown author kind renders as before`);
}
eq(card({ ...baseline.user.message, author: { kind: "person", name: "Ada", entity_id: null, identity_ref: null, avatar: null } }), baseline.user.html, "B4 a person bubble is unchanged by an author");
eq(card({ ...baseline.user.message, author: entityAuthor }), baseline.user.html, "B5 a user bubble ignores any author");
const header = (html) => html.slice(html.indexOf('<div class="pc-chat-header">'), html.indexOf('<span class="pc-chat-header-spacer">'));
const entityCard = card({ ...baseline.assistant_titled.message, author: entityAuthor });
ok(/^<div class="pc-chat-item pc-chat-item--assistant" data-author="entity">/.test(entityCard), "B6 entity: the item says who wrote it");
ok(header(entityCard).includes('class="pc-chat-avatar pc-chat-avatar--author"') && header(entityCard).includes("<canvas"), "B7 entity: its orb (the kit's ActivityAvatar) in the tile");
ok(header(entityCard).includes('data-design="watch-lotus"') && header(entityCard).includes("--af-entity-color:#3366cc"), "B8 entity: its design in its colour");
ok(header(entityCard).includes('<span class="pc-chat-role">Castor</span>'), "B9 entity: its name");
ok(/class="af-chip af-chip--muted af-chip--sm pc-chat-author-kind"[^>]*><span class="af-chip__label">entity<\/span>/.test(header(entityCard)), "B10 entity: the kind tag");
const agentCard = card({ ...baseline.assistant.message, author: agentAuthor });
ok(agentCard.includes('data-author="agent"') && header(agentCard).includes("pc-author-mark--agent") && !header(agentCard).includes("<canvas"), "B11 agent: the agent's mark, no orb");
ok(header(agentCard).includes('<span class="pc-chat-role">Basic agent</span>') && header(agentCard).includes(">agent</span>"), "B12 agent: name and tag");
const plainCard = card({ ...baseline.assistant.message, author: { ...entityAuthor, name: "Pollux", avatar: { style: null, color: "#cc6633" } } });
ok(header(plainCard).includes("pc-author-mark--plain") && header(plainCard).includes(">P</span>") && !header(plainCard).includes("<canvas"), "B13 entity without a design: its initial disc in its colour");
const liveCard = card({ ...baseline.assistant_live.message, author: entityAuthor });
ok(liveCard.includes("pc-chat-live-indicator") && liveCard.includes("sub-agent · researcher") && header(liveCard).includes(">Castor</span>"), "B14 a live reply keeps its indicator and caption beside the author");
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
ok(/\.pc-chat-avatar \{\s*display: none;/.test(css), "B15 the tile stays hidden by default (today's header)");
ok(/\.pc-chat-item--assistant\[data-author\] \.pc-chat-avatar \{\s*display: inline-flex;/.test(css), "B16 the tile shows for an assistant message with an author only");

// ---- C. the composer -----------------------------------------------------------------
const composerMarkup = (props) => renderToStaticMarkup(React.createElement(ChatComposer, { value: "hi @cas", onChange() {}, onSubmit() {}, ...props }));
const plain = composerMarkup({});
eq(composerMarkup({ mentions: [castor], mentionNotice: () => "x" }), plain, "C1 without mentionCandidates the composer is today's (chips and notices ignored)");
ok(!/pc-mention|aria-autocomplete/.test(plain), "C2 no list, no chip, no autocomplete without the host feed");
ok(/aria-autocomplete="list"/.test(composerMarkup({ mentionCandidates: async () => [] })), "C3 with the feed the field announces its list");
{
  // The chips are IN the text: a mirror over the field draws them where their "@Name" is.
  const html = composerMarkup({ value: "Hi @Castor and @Basic agent", mentionCandidates: async () => [], mentions: [{ ...castor, start: 3 }, { ...coder, start: 15 }] });
  ok(/<textarea[^>]*data-mention-overlay=""/.test(html), "C60 chips in the text: the field's glyphs give way to the mirror");
  ok(/<div class="pc-composer__mirror" aria-hidden="true">Hi <span class="pc-mention-chip pc-mention-chip--inline" data-mention-key="entity:castor" data-mention-kind="entity"><span class="pc-mention-chip__at">@<span class="pc-mention-chip__mark">/.test(html), "C61 the mirror: the words, then the chip in place (its mark over the @)");
  eq([...html.matchAll(/class="pc-mention-chip__name" data-mention-kind="(\w+)"/g)].map((m) => m[1]), ["entity", "agent"], "C62 each chip's name carries its kind (the markup Code reads)");
  const mirrorHtml = html.slice(html.indexOf('class="pc-composer__mirror"'), html.indexOf('class="pc-sr-only"'));
  ok(/<span class="pc-mention-chip__name" data-mention-kind="entity">Castor<\/span><\/span> and <span/.test(mirrorHtml) && /pc-author-mark--agent/.test(mirrorHtml) && !/<button|Remove /.test(mirrorHtml), "C63 the name follows its mark; no x on a chip");
  const described = html.match(/aria-describedby="([^"]+)"/)[1];
  ok(html.includes(`<span id="${described}" class="pc-sr-only">mention: Castor, mention: Basic agent</span>`), "C64 the field's description names each chip (\"mention: Castor\")");
  const none = composerMarkup({ value: "Hi @Castor", mentionCandidates: async () => [], mentions: [{ ...castor, start: 4 }] });
  ok(!/pc-composer__mirror|data-mention-overlay|aria-describedby/.test(none), "C65 a chip not at its place in the text: no mirror, the field as always");
  ok(/aria-describedby="host-help [^"]+"/.test(composerMarkup({ value: "@Castor", ariaDescribedBy: "host-help", mentionCandidates: async () => [], mentions: [{ ...castor, start: 0 }] })), "C66 the host's description comes first");
}

const keyEvent = (key, extra = {}) => {
  const e = { key, shiftKey: false, ctrlKey: false, metaKey: false, keyCode: 0, nativeEvent: { isComposing: false }, prevented: false, stopped: false, ...extra };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};
function composerHarness(extra = {}) {
  const log = { queries: [], sends: [], submits: 0, changes: [], chips: [] };
  const props = {
    value: "",
    onChange: (v) => { log.changes.push(v); h.rerender({ value: v }); },
    onSubmit: () => { log.submits += 1; },
    onMentionsChange: (next) => { log.chips.push(next); },
    mentionCandidates: async (q) => { log.queries.push(q); return [castor, pollux, coder].filter((c) => c.name.toLowerCase().startsWith(q.toLowerCase())); },
    ...extra,
  };
  const h = mount((p) => ChatComposer.render(p, null), props);
  const field = () => find(h.tree, (n) => n.type === "textarea");
  // An edit as the browser reports it: the new value, the caret after it, and its input type.
  const type = (value, caret = value.length, inputType = "insertText") => { field().props.onChange({ target: { value, selectionStart: caret, selectionEnd: caret }, nativeEvent: { inputType } }); };
  const focus = () => field().props.onFocus({ currentTarget: { selectionStart: field().props.value.length } });
  const options = () => findAll(h.tree, (n) => n.props && n.props.role === "option");
  const key = (k, x) => { const e = keyEvent(k, x); field().props.onKeyDown(e); h.render(); return e; };
  const chipsOf = () => findAll(h.tree, (n) => n.props && typeof n.props.className === "string" && n.props.className.includes("pc-mention-chip--inline")).map((n) => n.props["data-mention-key"]);
  const notices = () => findAll(h.tree, (n) => n.props && typeof n.props.className === "string" && n.props.className.startsWith("pc-mention-notice ") || (n.props && n.props.className === "pc-mention-notice")).map((n) => textOf(n));
  return { h, log, field, type, focus, options, key, chipsOf, notices };
}
{
  const c = composerHarness({ onSend: (payload) => { c.log.sends.push(payload); } });
  c.focus();
  c.type("ask @");
  await c.h.settle();
  eq(c.log.queries.at(-1), "", "C4 typing @ asks the host for names (empty query)");
  eq(c.options().map((o) => o.props["data-kind"]), ["entity", "entity", "agent"], "C5 the list shows the host's names");
  eq(c.field().props["aria-activedescendant"], c.options()[0].props.id, "C6 the first name is highlighted (aria-activedescendant)");
  c.type("ask @p");
  await c.h.settle();
  eq(c.log.queries.at(-1), "p", "C7 the query follows the typing");
  eq(c.options().length, 1, "C8 the list narrows");
  c.type("ask @");
  await c.h.settle();
  let e = c.key("ArrowDown");
  ok(e.prevented && c.field().props["aria-activedescendant"] === c.options()[1].props.id, "C9 ArrowDown moves the highlight");
  e = c.key("ArrowUp");
  e = c.key("ArrowUp");
  ok(c.field().props["aria-activedescendant"] === c.options()[2].props.id, "C10 ArrowUp wraps to the last name");
  c.key("ArrowDown");
  c.key("ArrowDown");
  e = c.key("Enter");
  ok(e.prevented, "C11 Enter picks (does not send)");
  eq(c.log.sends.length, 0, "C12 nothing was sent by the pick");
  eq(c.log.changes.at(-1), "ask @Pollux ", "C13 the typed @ becomes the chip's @Pollux, in the text, one space after");
  eq(c.chipsOf(), ["entity:pollux"], "C14 the picked name is a chip, in the text");
  eq(c.log.chips.at(-1).map((m) => [m.id, m.start]), [["pollux", 4]], "C14b onMentionsChange: the chip and where it sits");
  eq(c.options().length, 0, "C15 the list closes after a pick");
  c.type("ask @Pollux @ca");
  await c.h.settle();
  e = c.key("Tab");
  ok(e.prevented && c.chipsOf().length === 2 && c.field().props.value === "ask @Pollux @Castor ", "C16 Tab picks too");
  c.type("ask @Pollux @Castor both @bob");
  await c.h.settle();
  eq(c.options().length, 0, "C17 no match, no option");
  ok(textOf(find(c.h.tree, (n) => n.props && n.props.className === "pc-mention-empty")).includes("No name matches"), "C18 the empty list says so in words");
  e = c.key("Enter");
  eq(c.log.sends, [{ text: "ask @Pollux @Castor both @bob", mentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0, start: 4 }, { id: "castor", name: "Castor", kind: "entity", index: 1, start: 12 }] }], "C19 Enter sends: the text as shown, the chips in text order (@bob stays text)");
  eq(c.log.submits, 0, "C20 onSend wins over onSubmit");
  await c.h.settle();
  eq(c.chipsOf(), [], "C21 uncontrolled chips clear after a send (the draft is the host's)");
}
{
  const c = composerHarness();
  c.focus();
  c.type("@");
  await c.h.settle();
  const e = c.key("Escape");
  ok(e.prevented && e.stopped && c.options().length === 0 && !find(c.h.tree, (n) => n.props && n.props.className === "pc-mention-popover"), "C22 Escape closes the list (and stops there)");
  c.type("@c");
  await c.h.settle();
  eq(c.options().length, 0, "C23 the dismissed @ stays closed while typing on");
  c.type("@c @");
  await c.h.settle();
  ok(c.options().length === 3, "C24 a new @ opens the list again");
  c.key("Enter", { nativeEvent: { isComposing: true }, keyCode: 229 });
  eq(c.chipsOf().length, 0, "C25 an IME commit Enter never picks");
  c.field().props.onBlur();
  c.h.render();
  eq(c.options().length, 0, "C26 leaving the field closes the list");
  ok(c.log.submits === 0, "C27 none of it sent");
  c.focus();
  c.h.render();
  await c.h.settle();
  c.key("Enter");
  ok(c.chipsOf().length === 1 && c.field().props.value === "@c @Castor ", "C28 back in the field the list is there to pick from");
  c.type("hello");
  c.key("Enter");
  eq(c.log.submits, 1, "C29 without onSend, Enter is today's onSubmit");
}
{
  const failing = composerHarness({ onSend: async () => { throw new Error("offline"); } });
  failing.focus();
  failing.type("@");
  await failing.h.settle();
  failing.key("Enter");
  failing.type("@Castor hi");
  // The composer's own derived promise rejects (visible as an unhandled rejection); swallow it here.
  const unhandled = [];
  const onUnhandled = (r) => unhandled.push(r);
  process.on("unhandledRejection", onUnhandled);
  failing.key("Enter");
  await failing.h.settle();
  await new Promise((r) => setTimeout(r, 10));
  process.off("unhandledRejection", onUnhandled);
  eq(failing.chipsOf().length, 1, "C30 a failed send keeps the chips");
  ok(unhandled.length === 1, "C31 the failure is not swallowed");
}
{
  // N1: Enter while the names are still loading never sends the typed `@cas` as text.
  let release;
  const slow = composerHarness({ onSend: (p) => void slow.log.sends.push(p), mentionCandidates: (q) => new Promise((r) => { release = () => r([castor].filter((c) => c.name.toLowerCase().startsWith(q))); }) });
  slow.focus();
  slow.type("@cas");
  slow.h.render();
  ok(textOf(find(slow.h.tree, (n) => n.props && n.props.className === "pc-mention-empty")).includes("Looking for names"), "C46 the list is loading");
  const e = slow.key("Enter");
  ok(e.prevented && slow.log.sends.length === 0, "C47 Enter while the names load sends nothing");
  release();
  await slow.h.settle();
  slow.key("Enter");
  eq([slow.chipsOf().length, slow.log.sends.length], [1, 0], "C48 once loaded, Enter picks");
  // N4: a name already in the text is not offered again.
  slow.type("@Castor @ca");
  await slow.h.settle();
  release?.();
  await slow.h.settle();
  eq(slow.options().length, 0, "C49 the picked name is not offered again");
  ok(textOf(find(slow.h.tree, (n) => n.props && n.props.className === "pc-mention-empty")) === "Already mentioned.", "C50 the list says why");
}
{
  // Uncontrolled composer: a chip picked while the send is in flight stays (S6); a partial stop
  // keeps the unsent chips it names.
  let finish;
  const c = composerHarness({ onSend: () => new Promise((r) => { finish = r; }) });
  c.focus();
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  c.type("@Castor hi");
  c.key("Enter");
  c.type("@Castor hi @pol");
  await c.h.settle();
  c.key("Enter");
  eq(c.chipsOf(), ["entity:castor", "entity:pollux"], "C51 Pollux picked while the send is in flight");
  finish();
  await c.h.settle();
  eq(c.log.chips.at(-1).map((m) => m.id), ["pollux"], "C52 the send's chip goes, the new one stays");
  c.type("@Castor hi @Pollux again");
  c.key("Enter");
  finish({ unsentMentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0 }] });
  await c.h.settle();
  eq(c.chipsOf(), ["entity:pollux"], "C53 a resolved partial stop keeps the unsent chip it names");
}
{
  let sentence = 0;
  const c = composerHarness({ mentionNotice: (cand) => (sentence += 1, `${cand.name} will read this conversation's history`), mentionSessionKey: "s1" });
  c.focus();
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  eq(c.notices(), ["Castor will read this conversation's history"], "C32 first pick of a name: the host's sentence");
  ok(!find(c.h.tree, (n) => n.props && (n.props.onRemove || /^Remove /.test(String(n.props["aria-label"] || "")))), "C33 a chip has no x: it goes as its words go");
  c.type("", 0, "deleteContentBackward");
  c.h.render();
  eq([c.chipsOf().length, c.notices().length], [0, 0], "C34 deleting the chip's words removes the chip and its notice");
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  eq([c.chipsOf().length, c.notices().length, sentence], [1, 0, 1], "C35 a second pick in the same conversation: no notice again");
  c.h.rerender({ mentionSessionKey: "s2" });
  c.type("", 0, "deleteContentBackward");
  c.h.render();
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  eq(c.notices().length, 1, "C36 a new conversation shows it again");
}
{
  let controlled = [{ ...castor, start: 3 }];
  const c = composerHarness({ value: "Hi @Castor", mentions: controlled, onMentionsChange: (next) => { controlled = next; c.h.rerender({ mentions: next }); }, disabled: true });
  ok(c.chipsOf().length === 1, "C37 controlled chips render in the text");
  c.h.rerender({ disabled: false });
  c.type("Hi @Castor and you", 18);
  eq(controlled.map((m) => [m.id, m.start]), [["castor", 3]], "C38 controlled: an edit around the chip keeps it");
  c.type("Hey @Castor and you", 2);
  eq(controlled.map((m) => [m.id, m.start]), [["castor", 4]], "C38b moved with the text, through onMentionsChange");
  c.type("Hey @Cstor and you", 6, "deleteContentBackward");
  eq(controlled, [], "C38c a letter deleted inside it: the chip goes, the rest is plain text");
  // An undo that brings its words back brings the chip back.
  c.type("Hey @Castor and you", 11, "historyUndo");
  eq(controlled.map((m) => [m.id, m.start]), [["castor", 4]], "C38d undo restores the chip with its words");
  c.type("Hey @Cstor and you", 6, "historyRedo");
  eq(controlled, [], "C38e redo takes it again");
}
{
  // Backspace just after a chip selects it whole (the key's own deletion removes it); Delete before.
  const c = composerHarness({ value: "Hi @Castor x", mentions: [{ ...castor, start: 3 }], onMentionsChange() {} });
  const target = (at) => ({ value: "Hi @Castor x", selectionStart: at, selectionEnd: at, set: null, setSelectionRange(a, b) { this.set = [a, b]; } });
  const back = target(10);
  c.key("Backspace", { currentTarget: back });
  eq(back.set, [3, 10], "C54 Backspace after a chip selects it whole");
  const del = target(3);
  c.key("Delete", { currentTarget: del });
  eq(del.set, [3, 10], "C55 Delete before it too");
  const away = target(11);
  c.key("Backspace", { currentTarget: away });
  eq(away.set, null, "C56 elsewhere Backspace is the browser's own");
  const composing = target(10);
  c.key("Backspace", { currentTarget: composing, nativeEvent: { isComposing: true } });
  eq(composing.set, null, "C57 never while composing");
}
{
  // A typed "@Castor" that was never picked is text; the "@" of a chip opens no list.
  const sends = [];
  const c = composerHarness({ onSend: (p) => void sends.push(p) });
  c.focus();
  c.type("ping @Castor");
  await c.h.settle();
  c.key("Escape");
  c.key("Enter");
  eq(sends.at(-1), { text: "ping @Castor", mentions: [] }, "C58 an unpicked @Castor is text");
  const d = composerHarness({ value: "Hi @Castor", mentions: [{ ...castor, start: 3 }] });
  d.focus();
  d.field().props.onSelect({ currentTarget: { value: "Hi @Castor", selectionStart: 10, selectionEnd: 10, setSelectionRange() {} } });
  await d.h.settle();
  ok(!find(d.h.tree, (n) => n.props && n.props.className === "pc-mention-popover"), "C59 the caret just after a chip opens no list");
}
{
  // Copy / paste: only chips this composer copied come back as chips.
  const clip = (data = {}) => ({ data: { ...data }, getData(t) { return this.data[t] ?? ""; }, setData(t, v) { this.data[t] = v; } });
  const ev = (clipboardData, field) => { const e = { clipboardData, currentTarget: field, defaultPrevented: false }; e.preventDefault = () => { e.defaultPrevented = true; }; return e; };
  const c = composerHarness({ value: "Hi @Castor x", mentions: [{ ...castor, start: 3 }] });
  const copy = ev(clip(), { value: "Hi @Castor x", selectionStart: 0, selectionEnd: 10 });
  c.field().props.onCopy(copy);
  ok(copy.defaultPrevented && copy.clipboardData.data["text/plain"] === "Hi @Castor" && JSON.parse(copy.clipboardData.data[MENTION_CLIPBOARD_TYPE]).mentions[0].start === 3, "C67 a copy holding a chip carries it beside the plain words");
  const plainCopy = ev(clip(), { value: "Hi @Castor x", selectionStart: 11, selectionEnd: 12 });
  c.field().props.onCopy(plainCopy);
  ok(!plainCopy.defaultPrevented, "C68 a copy without chips is the browser's own");
  const p = composerHarness();
  p.focus();
  p.type("Re: ");
  const paste = ev(clip({ "text/plain": "Hi @Castor", [MENTION_CLIPBOARD_TYPE]: copy.clipboardData.data[MENTION_CLIPBOARD_TYPE] }), { value: "Re: ", selectionStart: 4, selectionEnd: 4 });
  p.field().props.onPaste(paste);
  p.h.render();
  ok(paste.defaultPrevented && p.field().props.value === "Re: Hi @Castor", "C69 pasting that copy types its words in");
  eq(p.log.chips.at(-1).map((m) => [m.id, m.start]), [["castor", 7]], "C70 and its chip, where it landed");
  const plainPaste = ev(clip({ "text/plain": " and @Pollux" }), { value: "Re: Hi @Castor", selectionStart: 14, selectionEnd: 14 });
  p.field().props.onPaste(plainPaste);
  ok(!plainPaste.defaultPrevented && p.chipsOf().length === 1, "C71 plain text with @Pollux: the browser's plain paste, no chip");
  const files = composerHarness({ onPaste: (e) => e.preventDefault() });
  const hostPaste = ev(clip({ "text/plain": "Hi @Castor", [MENTION_CLIPBOARD_TYPE]: copy.clipboardData.data[MENTION_CLIPBOARD_TYPE] }), { value: "", selectionStart: 0, selectionEnd: 0 });
  files.field().props.onPaste(hostPaste);
  eq([files.log.changes.length, files.chipsOf().length], [0, 0], "C72 the host's onPaste runs first and its preventDefault (pasted files) keeps the composer out");
}
{
  // Older gateway (contract 2026-11-08: no mentions route): the host's one sentence, never silence.
  const NO_ROUTE = "This gateway does not offer mentions yet.";
  const sends = [];
  const c = composerHarness({ mentionsUnavailable: NO_ROUTE, onSend: (p) => void sends.push(p) });
  c.focus();
  c.type("ask @");
  await c.h.settle();
  const popover = find(c.h.tree, (n) => n.props && n.props.className === "pc-mention-popover");
  ok(popover && popover.props["data-status"] === "unavailable" && textOf(popover) === NO_ROUTE, "C39 unavailable: typing @ shows the host's sentence");
  eq([c.log.queries.length, c.options().length], [0, 0], "C40 unavailable: the feed is not asked, no name to pick");
  c.key("Enter");
  eq(sends, [{ text: "ask @", mentions: [] }], "C41 unavailable: Enter sends the text as typed");
  const held = composerHarness({ value: "@Castor hi", mentionsUnavailable: NO_ROUTE, mentions: [{ ...castor, start: 0 }] });
  ok(held.notices().includes(NO_ROUTE) && held.chipsOf().length === 1, "C42 unavailable with chips already in the text: the sentence above the field, the chips still there");
  const heldSends = [];
  const unsentHeld = composerHarness({ mentionsUnavailable: NO_ROUTE, onSend: (p) => void heldSends.push(p) });
  unsentHeld.h.rerender({ mentionsUnavailable: null });
  unsentHeld.focus();
  unsentHeld.type("@cas");
  await unsentHeld.h.settle();
  unsentHeld.key("Enter");
  unsentHeld.h.rerender({ mentionsUnavailable: NO_ROUTE });
  unsentHeld.type("@Castor hi");
  unsentHeld.key("Enter");
  await unsentHeld.h.settle();
  eq(heldSends, [{ text: "@Castor hi", mentions: [] }], "C42b unavailable: a chip picked before is not sent (N3)");
  eq(unsentHeld.log.chips.at(-1), [], "C42c and it clears with the send");
  const status = composerHarness({ mentionStatus: "Castor is in another conversation." });
  eq(textOf(find(status.h.tree, (n) => n.props && n.props.className === "pc-mention-notice pc-mention-notice--status")), "Castor is in another conversation.", "C43 the host's outcome sentence shows without chips");
  status.h.rerender({ mentionStatus: null });
  ok(!find(status.h.tree, (n) => n.props && n.props.className === "pc-mention-notices"), "C44 cleared by the host, gone");
  ok(!/pc-mention/.test(composerMarkup({ mentionStatus: "x", mentionsUnavailable: "y" })), "C45 both sentences need the feature on (mentionCandidates)");
}

// ---- D. WorkflowChat -----------------------------------------------------------------
const composerOf = (tree) => find(tree, (n) => n.type === ChatComposer);
{
  const sent = [];
  let fail = false;
  const w = mount(WorkflowChat, {
    messages: [],
    draft: "@Castor @Pollux what do you think?",
    onDraftChange() {},
    onSend: async (draft, ctx) => { sent.push({ draft, mentions: ctx.mentions }); if (fail) throw new Error("no"); },
    mentionCandidates: async () => [castor, pollux],
    mentionSessionKey: "s1",
  });
  let comp = composerOf(w.tree);
  ok(typeof comp.props.mentionCandidates === "function" && Array.isArray(comp.props.mentions) && comp.props.mentionSessionKey === "s1", "D1 the composer gets the feed and controlled chips");
  w.rerender({ mentionsUnavailable: "no route", mentionStatus: "busy elsewhere" });
  comp = composerOf(w.tree);
  eq([comp.props.mentionsUnavailable, comp.props.mentionStatus], ["no route", "busy elsewhere"], "D1b the host's sentences reach the composer");
  w.rerender({ mentionsUnavailable: undefined, mentionStatus: undefined });
  comp.props.onMentionsChange([{ ...pollux, start: 8 }, { ...castor, start: 0 }]);
  w.render();
  fail = true;
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(sent[0].mentions.map((m) => [m.id, m.index, m.start]), [["castor", 0, 0], ["pollux", 1, 8]], "D2 onSend gets the chips in the draft, in text order, numbered and placed");
  eq(composerOf(w.tree).props.mentions.length, 2, "D3 a failed send keeps the chips (like the draft)");
  fail = false;
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(composerOf(w.tree).props.mentions.length, 0, "D4 a successful send clears them");
  const steered = [];
  w.rerender({ busy: true, steer: { onSteer: async (t, m, ctx) => { steered.push(ctx); return { accepted: true }; } } });
  composerOf(w.tree).props.onMentionsChange([{ ...pollux, start: 8 }]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(steered[0].mentions.map((m) => [m.id, m.index, m.start]), [["pollux", 0, 8]], "D5 a steer carries them too");
  composerOf(w.tree).props.onMentionsChange([{ ...pollux, start: 3 }]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(steered[1].mentions, [], "D5b a chip whose words are not in the draft is not sent");
  w.unmount();
}
{
  // Review 2026-11-09 B1/S1/S6: a send that stopped partway keeps ONLY its unsent chips; a chip
  // picked while a send is in flight is kept for the next one.
  const sent = [];
  let settle;
  const w = mount(WorkflowChat, {
    messages: [],
    draft: "@Castor @Pollux does the plan hold?",
    onDraftChange() {},
    onSend: (draft, ctx) => { sent.push(ctx.mentions); return new Promise((resolve, reject) => { settle = { resolve, reject }; }); },
    mentionCandidates: async () => [castor, pollux],
  });
  const atC = { ...castor, start: 0 }, atP = { ...pollux, start: 8 };
  composerOf(w.tree).props.onMentionsChange([atC, atP]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  settle.reject(mentionsStoppedError("Pollux cannot answer right now.", [{ id: "pollux", name: "Pollux", kind: "entity", index: 1 }]));
  await w.settle();
  eq(composerOf(w.tree).props.mentions.map((m) => m.id), ["pollux"], "D8 a 503 after Castor answered: only Pollux stays (Castor is never asked again)");
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(sent[1].map((m) => [m.id, m.index, m.start]), [["pollux", 0, 8]], "D10 the resend carries only the kept chip");
  settle.resolve({ unsentMentions: [] });
  await w.settle();
  eq(composerOf(w.tree).props.mentions.length, 0, "D11 a resolved send naming none keeps none");
  // S6: Hypnos picked while the send is in flight survives its success.
  const hypnos = { id: "hypnos", name: "Hypnos", kind: "entity" };
  composerOf(w.tree).props.onMentionsChange([atC]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  composerOf(w.tree).props.onMentionsChange([atC, hypnos]);
  w.render();
  settle.resolve();
  await w.settle();
  eq(composerOf(w.tree).props.mentions.map((m) => m.id), ["hypnos"], "D12 a chip picked during the send stays for the next one");
  // A plain failure still keeps every chip (like the draft).
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  settle.reject(new Error("offline"));
  await w.settle();
  eq(composerOf(w.tree).props.mentions.map((m) => m.id), ["hypnos"], "D13 a failure naming no chips keeps them all");
  // N3: unavailable, the chips are not sent.
  w.rerender({ mentionsUnavailable: "This gateway does not offer mentions yet." });
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(sent.at(-1), [], "D14 unavailable: chips already picked are not sent");
  settle.resolve();
  await w.settle();
  eq(composerOf(w.tree).props.mentions.length, 0, "D15 and they clear with the send");
  // The steer door: a partial stop keeps only the unsent chips too.
  w.rerender({ mentionsUnavailable: undefined, busy: true, steer: { onSteer: async () => { throw mentionsStoppedError("Pollux cannot answer right now.", [{ id: "pollux", name: "Pollux", kind: "entity", index: 1 }]); } } });
  composerOf(w.tree).props.onMentionsChange([atC, atP]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(composerOf(w.tree).props.mentions.map((m) => m.id), ["pollux"], "D16 a steer that stopped partway keeps only the unsent chip");
  w.unmount();
}
{
  // A steer the host RESOLVES naming unsent chips (its own status line said why): the words stay too.
  const drafts = [];
  const w = mount(WorkflowChat, {
    messages: [],
    draft: "does the plan hold?",
    onDraftChange: (d) => drafts.push(d),
    onSend: async () => {},
    mentionCandidates: async () => [castor, pollux],
    busy: true,
    steer: { onSteer: async () => ({ accepted: true, unsentMentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 1 }] }) },
  });
  composerOf(w.tree).props.onMentionsChange([castor, pollux]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq([composerOf(w.tree).props.mentions.map((m) => m.id), drafts], [["pollux"], []], "D17 a resolved partial steer keeps the words and only the unsent chip");
  w.rerender({ steer: { onSteer: async () => ({ accepted: true }) } });
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq([composerOf(w.tree).props.mentions.length, drafts], [0, [""]], "D18 a whole steer clears both");
  w.unmount();
}
{
  const sent = [];
  const off = mount(WorkflowChat, { messages: [], draft: "hi", onDraftChange() {}, onSend: async (d, ctx) => void sent.push({ off: ctx.mentions }) });
  ok(!("mentionCandidates" in composerOf(off.tree).props) && !("mentions" in composerOf(off.tree).props), "D6 without the feed the composer is today's");
  composerOf(off.tree).props.onSubmit();
  await off.settle();
  eq(sent.at(-1), { off: [] }, "D7 without the feed onSend still gets mentions: []");
  off.unmount();
}

// ---- E. the replay projection --------------------------------------------------------
const projected = projectReplayView({
  root_run_id: "r",
  messages: [
    { id: "q", role: "user", kind: "prompt", text: "hi", run_id: "r" },
    { id: "q2", role: "user", kind: "prompt", text: "@Castor hi", run_id: "r2", author: { kind: "person", name: null, entity_id: null, identity_ref: null, avatar: null } },
    { id: "a", role: "assistant", kind: "answer", text: "hello", run_id: "r", author: { ...entityAuthor, kind: "ENTITY" } },
    { id: "b", role: "assistant", kind: "answer", text: "again", run_id: "r2", author: null },
  ],
  artifacts: [],
  runs: [],
}).messages;
eq(projected.find((m) => m.id === "a").author, entityAuthor, "E1 a turn's author reaches the ChatMessage (normalized)");
ok(projected.find((m) => m.id === "b").author === null, "E2 author null stays null");
ok(!("author" in projected.find((m) => m.id === "q")), "E3 no author on the wire, no author key (older gateways project as before)");
eq(projected.find((m) => m.id === "q2").author, { kind: "person", name: null, entity_id: null, identity_ref: null, avatar: null }, "E4 a user turn's author passes too (the card leaves person bubbles as they are: B4/B5)");

// ---- F. mentions in a message's bubble ----------------------------------------------------
{
  const said = "Hi @Castor how are you doing ?";
  const castorSent = { id: "ent-castor", name: "Castor", kind: "entity", index: 0, start: 3 };
  const nerinSent = { id: "nerin", name: "Nerin", kind: "entity", index: 1, start: 13 };
  eq(messageMentionsPlaced(said, [castorSent]), { placed: [castorSent], unplaced: [] }, "F1 a mention whose \"@Name\" is at its start is placed");
  const noStart = { id: "ent-castor", name: "Castor", kind: "entity", index: 0 };
  const wrongStart = { ...castorSent, start: 4 };
  const pastEnd = { ...castorSent, start: 99 };
  const notAMention = { name: "Castor", start: 3 };
  eq(messageMentionsPlaced(said, [noStart, wrongStart, pastEnd, notAMention]).placed, [], "F2 no start, another text at start, past the end, or no id/kind: not placed (the text is never scanned for \"@\")");
  const two = "@Nerin and @Castor";
  const later = { ...castorSent, start: 11 };
  const first = { ...nerinSent, start: 0 };
  eq(messageMentionsPlaced(two, [later, first]).placed.map((m) => m.name), ["Nerin", "Castor"], "F3 placed in text order whatever the list order");
  eq(messageMentionsPlaced("@Castor", [castorSent, { ...castorSent, start: 0 }, { id: "c", name: "Cas", kind: "entity", index: 1, start: 0 }]).placed.length, 1, "F4 overlapping mentions: the first one only");
  const tokens = mentionTokenText(two, [first, later]);
  ok(tokens !== null && !tokens.includes("@"), "F5 each placed \"@Name\" becomes a token");
  eq(mentionTokenParts(tokens), [0, " and ", 1], "F6 the rendered words split back at the tokens");
  eq(mentionTokensPlain(tokens, [first, later]), two, "F7 a token outside the words gets its \"@Name\" back");
  eq(mentionTokenText("odd \uFDD0 text @Castor", [{ ...castorSent, start: 11 }]), null, "F8 a text already holding the token characters is not tokenized");
  ok(typeof index.messageMentionsPlaced === "function" && typeof index.ChatMentionChip === "function" && typeof index.mentionChipFace === "function", "F9 exported from the package");
  ok(typeof conversationEntry.ChatMentionChip === "function" && conversationEntry.MENTION_CARD_REST_MS === 150, "F9b and from the conversation entry the apps vendor");

  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    const bubble = (message, props = {}) => renderToStaticMarkup(React.createElement(ChatMessageCard, { message, ...props }));
    const body = (html) => html.slice(html.indexOf('<div class="pc-chat-body">'));
    const chipsIn = (html) => [...html.matchAll(/<span class="pc-mention-chip pc-mention-chip--inline pc-mention-chip--message" data-mention-key="([^"]+)"/g)].map((x) => x[1]);
    // The words a selection copies: the mark (aria-hidden, unselectable) left out.
    const words = (html) => body(html).replace(/<span class="pc-mention-chip__mark">[^]*?<\/span><\/span>/g, "</span>").replace(/<[^>]+>/g, "");
    const look = { style: "watch-lotus", color: "#3366cc" };
    const userBubble = bubble({ role: "user", content: said, mentions: [{ ...castorSent, avatar: look }] });
    eq(chipsIn(userBubble), ["entity:ent-castor"], "F10 the user's bubble draws the chip");
    const chip = userBubble.slice(userBubble.indexOf('<span class="pc-mention-chip '), userBubble.indexOf("</span> how are you"));
    ok(chip.includes('<span class="pc-mention-chip__at">@<span class="pc-mention-chip__mark">') && chip.includes("<canvas") && chip.includes('data-design="watch-lotus"'), "F11 the chip: the entity's orb over the \"@\"");
    ok(chip.includes('<span class="pc-mention-chip__name">Castor</span>') && !/×|aria-label="Remove/.test(chip), "F12 the chip: the name, no ×");
    eq(words(userBubble), said, "F13 the words around the chip are the text (a selection copies \"@Castor\")");
    const composerChip = composerMarkup({ value: said, mentionCandidates: async () => [], mentions: [{ id: "ent-castor", name: "Castor", kind: "entity", avatar: look, start: 3 }] });
    const faceOf = (html) => { const from = html.indexOf('<span class="pc-mention-chip__at">'); return html.slice(from, html.indexOf("</span></span>", html.indexOf('class="pc-mention-chip__name"', from)) + 7); };
    eq(faceOf(userBubble), faceOf(composerChip).replace(' data-mention-kind="entity">Castor<', ">Castor<"), "F14 the same face as the composer's chip");
    ok(!/class="pc-mention-chip__name" data-mention-kind=/.test(userBubble) && /class="pc-mention-chip__name" data-mention-kind="entity"/.test(composerChip), "F14b only the composer's chips match .pc-mention-chip__name[data-mention-kind] (Code reads the composer's chips by it)");
    const reply = bubble({ role: "assistant", content: "Ask @Nerin about it.", author: entityAuthor, mentions: [{ id: "nerin", name: "Nerin", kind: "agent", index: 0, start: 4 }] });
    ok(chipsIn(reply).join() === "agent:nerin" && reply.includes("pc-author-mark--agent"), "F15 a reply bubble with mentions draws them (an agent: its mark)");
    const md = "**@Castor** said `@Nerin`\n```\n@Pollux code\n```\n- with @Vega";
    const at = (name) => md.indexOf(`@${name}`);
    const mdBubble = bubble({ role: "assistant", content: md, mentions: [{ ...castorSent, start: at("Castor") }, { ...nerinSent, start: at("Nerin") }, { id: "pollux", name: "Pollux", kind: "entity", index: 2, start: at("Pollux") }, { id: "vega", name: "Vega", kind: "entity", index: 3, start: at("Vega") }] });
    eq(chipsIn(mdBubble), ["entity:ent-castor", "entity:nerin", "entity:vega"], "F16 chips inside Markdown (bold, inline code, a list item)");
    ok(mdBubble.includes("<code>@Pollux code</code>") && !mdBubble.includes("\uFDD0") && !mdBubble.includes("\uFDD1"), "F17 a mention in a code block keeps its plain words; no token leaks");
    eq(errors, [], "F18 placed mentions log nothing");

    const fallback = bubble({ role: "user", content: said, mentions: [noStart] });
    eq(chipsIn(fallback), [], "F19 a mention without a valid start draws no chip");
    ok(body(fallback).includes(`<p class="pc-md_p">${said}</p>`), "F20 its \"@Name\" stays as plain words");
    eq(errors.length, 1, "F21 the missing start is logged");
    ok(errors[0].startsWith("#SEAM panel-chat:") && errors[0].includes("no valid start"), "F22 as a #SEAM");
    bubble({ role: "user", content: said, mentions: [noStart] });
    eq(errors.length, 1, "F23 once per message, not per render");
    const card0 = bubble({ role: "user", content: said });
    eq(bubble({ role: "user", content: said, mentions: [] }), card0, "F24 no mentions: the bubble is today's");
    const hosted = bubble({ role: "user", content: said, mentions: [castorSent] }, { renderMarkdown: (t) => React.createElement("p", null, t) });
    ok(chipsIn(hosted).length === 0 && errors.length === 2 && errors[1].includes("renderMarkdown"), "F25 a host renderMarkdown: plain words, said as a #SEAM (never dropped silently)");
  } finally {
    console.error = realError;
  }
  const css2 = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
  ok(/\.pc-mention-chip__mark \{[^}]*user-select: none;/.test(css2), "F26 the chip's mark is not selectable (a copy reads \"@Name\")");
  ok(/\.pc-mention-chip--message \.pc-mention-chip__at \{\s*font-size: 0;/.test(css2) && /\.pc-mention-chip--message \.pc-mention-chip__mark \{\s*position: static;/.test(css2), "F27 in a message the mark is in the line, the \"@\" zero size (an out-of-flow mark puts a line break in a copy)");
  const disc = renderToStaticMarkup(React.createElement(index.ChatMentionChip, { mention: { id: "pollux", name: "Pollux", kind: "entity", index: 0, start: 0, avatar: { style: null, color: "#cc6633" } } }));
  {
    // NTH-1: the words with their chips are made once per text and mentions, not on every render
    // (a streamed frame re-renders the whole thread); a new card callback each render is used as is.
    const { ChatMessageContent } = await import("../dist/message_content.js");
    const mentionsOnce = [castorSent];
    const card1 = () => "card one";
    const h = mount(ChatMessageContent, { text: said, mentions: mentionsOnce, renderMentionCard: card1 });
    const first = h.tree.props.children;
    h.rerender({ renderMentionCard: () => "card two" });
    ok(h.tree.props.children === first, "F29 the same words with chips on a re-render (memoized, even with a new card callback)");
    const chipEl = find(h.tree, (n) => n.props && n.props.mention && typeof n.props.renderCard === "function");
    eq(chipEl.props.renderCard(castorSent), "card two", "F30 a chip asks the latest card callback");
    h.rerender({ text: "Bye @Castor", mentions: [{ ...castorSent, start: 4 }] });
    ok(h.tree.props.children !== first, "F31 new words: made again");
    h.unmount();
  }
  ok(disc.includes('data-initial="P"></span>') && !disc.includes(">P<") && /\.pc-author-mark--plain\[data-initial\]::before \{\s*content: attr\(data-initial\);/.test(css2), "F28 a disc's initial in a message chip is drawn, not written (a copy never reads \"@PPollux\")");
}

// ---- G. the host's card for a mention chip ------------------------------------------------
{
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const said = "Hi @Castor how are you doing ?";
  const mention = { id: "ent-castor", name: "Castor", kind: "entity", index: 0, start: 3 };
  eq(MENTION_CARD_REST_MS, 150, "G1 the rest before a card is 150 ms");
  const phone = { width: 400, height: 800 };
  eq(mentionCardPlacement({ top: 100, left: 40, bottom: 118 }, { width: 300, height: 200 }, phone), { top: 124, left: 40, side: "below" }, "G2 below the chip, on its left edge");
  eq(mentionCardPlacement({ top: 100, left: 300, bottom: 118 }, { width: 320, height: 200 }, phone).left, 72, "G3 a 400 px viewport: kept 8 px inside its right edge");
  eq(mentionCardPlacement({ top: 100, left: 2, bottom: 118 }, { width: 300, height: 200 }, phone).left, 8, "G4 and 8 px inside its left edge");
  eq(mentionCardPlacement({ top: 700, left: 40, bottom: 718 }, { width: 300, height: 200 }, phone), { top: 494, left: 40, side: "above" }, "G5 no room below: above the chip");
  eq(mentionCardPlacement({ top: 100, left: 40, bottom: 118 }, { width: 300, height: 790 }, phone), { top: 8, left: 40, side: "below" }, "G6 room nowhere: as low as it fits, inside the viewport");

  const calls = [];
  const renderCard = (m) => { calls.push(m); return React.createElement("div", { className: "host-card" }, `${m.name}'s card`); };
  const chipOf = (tree) => find(tree, (n) => n.props && typeof n.props.className === "string" && n.props.className.includes("pc-mention-chip--message"));
  const cardOf = (tree) => find(tree, (n) => n.props && n.props.className === "pc-mention-card");
  const h = mount(ChatMentionChip, { mention, renderCard });
  const chip = () => chipOf(h.tree);
  eq(chip().props.tabIndex, 0, "G7 with a card the chip takes the keyboard focus");
  chip().props.onMouseEnter();
  h.render();
  ok(calls.length === 0 && !cardOf(h.tree), "G8 the pointer arrives: nothing yet");
  await sleep(100);
  h.render();
  ok(calls.length === 0 && !cardOf(h.tree), "G9 at 100 ms: still nothing, the host is not asked");
  await sleep(70);
  h.render();
  ok(calls.length >= 1 && calls[0] === mention, "G10 after the 150 ms rest renderMentionCard is called with the mention");
  const shownCard = cardOf(h.tree);
  ok(Boolean(shownCard) && textOf(shownCard) === "Castor's card", "G11 the host's card shows in the popover");
  eq(chip().props["aria-describedby"], shownCard.props.id, "G12 the chip is described by its card");
  chip().props.onMouseLeave();
  h.render();
  shownCard.props.onMouseEnter();
  await sleep(160);
  h.render();
  ok(Boolean(cardOf(h.tree)), "G13 the pointer crossing from the chip to the card keeps it");
  cardOf(h.tree).props.onMouseLeave();
  await sleep(160);
  h.render();
  ok(!cardOf(h.tree), "G14 leaving it closes it");
  chip().props.onFocus();
  await sleep(170);
  h.render();
  ok(Boolean(cardOf(h.tree)), "G15 keyboard focus shows it after the same rest");
  chip().props.onKeyDown({ key: "Escape" });
  h.render();
  ok(!cardOf(h.tree), "G16 Escape closes it");
  chip().props.onBlur({ relatedTarget: null });
  chip().props.onFocus();
  await sleep(170);
  h.render();
  chip().props.onBlur({ relatedTarget: null });
  h.render();
  ok(!cardOf(h.tree), "G17 blur closes it");
  const asked = calls.length;
  chip().props.onMouseEnter();
  await sleep(60);
  chip().props.onMouseLeave();
  await sleep(200);
  h.render();
  ok(calls.length === asked && !cardOf(h.tree), "G18 a pass over the chip shorter than the rest: no card, the host is not asked");
  h.unmount();

  const none = mount(ChatMentionChip, { mention, renderCard: () => null });
  chipOf(none.tree).props.onMouseEnter();
  await sleep(170);
  none.render();
  ok(!cardOf(none.tree) && chipOf(none.tree).props["aria-describedby"] === undefined, "G19 renderMentionCard returns null: nothing shows (no placeholder)");
  none.unmount();
  const bare = mount(ChatMentionChip, { mention });
  const bareChip = chipOf(bare.tree);
  ok(!("tabIndex" in bareChip.props) && !("onMouseEnter" in bareChip.props) && !("onFocus" in bareChip.props), "G20 without renderMentionCard: no focus stop, no hover");
  bare.unmount();

  const chipTag = (html) => (html.match(/<span class="pc-mention-chip pc-mention-chip--inline pc-mention-chip--message"[^>]*>/) || [""])[0];
  const viaCard = (props) => renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { role: "assistant", content: said, author: entityAuthor, mentions: [mention] }, ...props }));
  ok(chipTag(viaCard({ renderMentionCard: renderCard })).includes('tabindex="0"'), "G21 ChatMessageCard hands renderMentionCard to its chips");
  ok(chipTag(viaCard({})) !== "" && !chipTag(viaCard({})).includes("tabindex"), "G22 without it the chips are words only");
  const css3 = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
  ok(/\.pc-mention-card \{[^}]*position: fixed;[^}]*width: min\(20rem, calc\(100vw - 16px\)\);[^}]*max-height:[^}]*overflow: auto;/.test(css3), "G23 the card fits a 400 px viewport (and scrolls when taller)");
}

console.log(`check_mentions: ${checks} checks green (trigger/pick/order/payload, chips in the text: place/edit/select/clipboard, author labels, card pinned to today without an author, composer list/keys/inline chips/notice/send, WorkflowChat, replay, chips in message bubbles, their hover card)`);
