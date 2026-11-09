// "@entity from any chat window" (operator 2026-11-08), the shared-kit half:
//  A. pure mention rules (trigger, pick, chip order, send payload) and author labelling;
//  B. the card's author header, with today's markup pinned when there is no author
//     (fixture captured from the 0.9.9 card BEFORE the change: scripts/fixtures/chat_card_no_author.json);
//  C. the composer's list, keyboard, chips, notice and send (hook harness, no DOM);
//  D. WorkflowChat passes the mentions to onSend / onSteer and clears them on success only;
//     a send that stopped partway keeps only its unsent chips; chips picked during a send stay
//     (client review 2026-11-09 B1/S1/S6/N1/N3/N4);
//  E. the replay projection carries a turn's author through.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, findAll, find, textOf } from "./hook_harness.mjs";
import {
  addMention,
  applyMentionPick,
  mentionKey,
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
} from "../dist/mentions.js";
import * as conversationEntry from "../dist/conversation.js";
import { chatAuthorOf, chatAuthorView } from "../dist/chat_author.js";
import { ChatMessageCard } from "../dist/chat_message_card.js";
import { ChatComposer } from "../dist/chat_composer.js";
import { WorkflowChat } from "../dist/workflow_chat.js";
import { projectReplayView } from "../dist/replay_view_projection.js";
import * as index from "../dist/index.js";

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
  mentionSendPayload("ask @bob too", chips),
  { text: "ask @bob too", mentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0 }, { id: "castor", name: "Castor", kind: "entity", index: 1 }] },
  "A16 the send: text as typed (an unpicked @bob stays text), mentions in order, numbered",
);
eq(mentionSendPayload("hi", []).mentions, [], "A17 no chip, no mention");
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

const keyEvent = (key, extra = {}) => {
  const e = { key, shiftKey: false, ctrlKey: false, metaKey: false, keyCode: 0, nativeEvent: { isComposing: false }, prevented: false, stopped: false, ...extra };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};
function composerHarness(extra = {}) {
  const log = { queries: [], sends: [], submits: 0, changes: [] };
  const props = {
    value: "",
    onChange: (v) => { log.changes.push(v); h.rerender({ value: v }); },
    onSubmit: () => { log.submits += 1; },
    mentionCandidates: async (q) => { log.queries.push(q); return [castor, pollux, coder].filter((c) => c.name.toLowerCase().startsWith(q.toLowerCase())); },
    ...extra,
  };
  const h = mount((p) => ChatComposer.render(p, null), props);
  const field = () => find(h.tree, (n) => n.type === "textarea");
  const type = (value) => { field().props.onChange({ target: { value, selectionStart: value.length } }); };
  const focus = () => field().props.onFocus({ currentTarget: { selectionStart: field().props.value.length } });
  const options = () => findAll(h.tree, (n) => n.props && n.props.role === "option");
  const key = (k, x) => { const e = keyEvent(k, x); field().props.onKeyDown(e); h.render(); return e; };
  const chipsOf = () => findAll(h.tree, (n) => n.props && typeof n.props.className === "string" && n.props.className.includes("pc-mention-chip") && n.props.tone === "accent");
  const notices = () => findAll(h.tree, (n) => n.props && typeof n.props.className === "string" && n.props.className.startsWith("pc-mention-notice")).map((n) => textOf(n));
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
  eq(c.log.changes.at(-1), "ask ", "C13 the typed @ is replaced by the chip");
  eq(c.chipsOf().map((n) => n.key), ["entity:pollux"], "C14 the picked name is a chip");
  eq(c.options().length, 0, "C15 the list closes after a pick");
  c.type("ask @ca");
  await c.h.settle();
  e = c.key("Tab");
  ok(e.prevented && c.chipsOf().length === 2, "C16 Tab picks too");
  c.type("ask both @bob");
  await c.h.settle();
  eq(c.options().length, 0, "C17 no match, no option");
  ok(textOf(find(c.h.tree, (n) => n.props && n.props.className === "pc-mention-empty")).includes("No name matches"), "C18 the empty list says so in words");
  e = c.key("Enter");
  eq(c.log.sends, [{ text: "ask both @bob", mentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0 }, { id: "castor", name: "Castor", kind: "entity", index: 1 }] }], "C19 Enter sends: text as typed (@bob stays text), chips in order");
  eq(c.log.submits, 0, "C20 onSend wins over onSubmit");
  await c.h.settle();
  eq(c.chipsOf().length, 0, "C21 uncontrolled chips clear after a send");
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
  ok(c.chipsOf().length === 1, "C28 back in the field the list is there to pick from");
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
  failing.type("hi");
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
  // N4: a name already picked is not offered again (its pick would only eat the typed @…).
  slow.type("@ca");
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
  c.type("hi");
  c.key("Enter");
  c.type("@pol");
  await c.h.settle();
  c.key("Enter");
  eq(c.chipsOf().map((n) => n.key), ["entity:castor", "entity:pollux"], "C51 Pollux picked while the send is in flight");
  finish();
  await c.h.settle();
  eq(c.chipsOf().map((n) => n.key), ["entity:pollux"], "C52 the send's chip goes, the new one stays");
  c.type("again");
  c.key("Enter");
  finish({ unsentMentions: [{ id: "pollux", name: "Pollux", kind: "entity", index: 0 }] });
  await c.h.settle();
  eq(c.chipsOf().map((n) => n.key), ["entity:pollux"], "C53 a resolved partial stop keeps the unsent chip it names");
}
{
  let sentence = 0;
  const c = composerHarness({ mentionNotice: (cand) => (sentence += 1, `${cand.name} will read this conversation's history`), mentionSessionKey: "s1" });
  c.focus();
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  eq(c.notices(), ["Castor will read this conversation's history"], "C32 first pick of a name: the host's sentence");
  const chip = c.chipsOf()[0];
  eq(chip.props.removeLabel, "Remove Castor", "C33 the chip is removable, by name");
  chip.props.onRemove();
  c.h.render();
  eq([c.chipsOf().length, c.notices().length], [0, 0], "C34 removing the chip removes its notice");
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  eq([c.chipsOf().length, c.notices().length, sentence], [1, 0, 1], "C35 a second pick in the same conversation: no notice again");
  c.h.rerender({ mentionSessionKey: "s2" });
  c.chipsOf()[0].props.onRemove();
  c.h.render();
  c.type("@cas");
  await c.h.settle();
  c.key("Enter");
  eq(c.notices().length, 1, "C36 a new conversation shows it again");
}
{
  let controlled = [castor];
  const c = composerHarness({ mentions: controlled, onMentionsChange: (next) => { controlled = next; c.h.rerender({ mentions: next }); }, disabled: true });
  ok(c.chipsOf().length === 1 && c.chipsOf()[0].props.onRemove === undefined, "C37 controlled chips render; a disabled composer cannot remove them");
  c.h.rerender({ disabled: false });
  c.chipsOf()[0].props.onRemove();
  eq(controlled, [], "C38 controlled: removal goes through onMentionsChange");
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
  const held = composerHarness({ mentionsUnavailable: NO_ROUTE, mentions: [castor] });
  ok(held.notices().includes(NO_ROUTE) && held.chipsOf()[0].props.onRemove, "C42 unavailable with chips already picked: the sentence under them, chips still removable");
  const heldSends = [];
  const unsentHeld = composerHarness({ mentionsUnavailable: NO_ROUTE, onSend: (p) => void heldSends.push(p) });
  unsentHeld.h.rerender({ mentionsUnavailable: null });
  unsentHeld.focus();
  unsentHeld.type("@cas");
  await unsentHeld.h.settle();
  unsentHeld.key("Enter");
  unsentHeld.h.rerender({ mentionsUnavailable: NO_ROUTE });
  unsentHeld.type("hi");
  unsentHeld.key("Enter");
  await unsentHeld.h.settle();
  eq(heldSends, [{ text: "hi", mentions: [] }], "C42b unavailable: a chip picked before is not sent (N3)");
  eq(unsentHeld.chipsOf().length, 0, "C42c and it clears with the send");
  const status = composerHarness({ mentionStatus: "Castor is in another conversation." });
  eq(textOf(find(status.h.tree, (n) => n.props && n.props.className === "pc-mention-notice pc-mention-notice--status")), "Castor is in another conversation.", "C43 the host's outcome sentence shows without chips");
  status.h.rerender({ mentionStatus: null });
  ok(!find(status.h.tree, (n) => n.props && n.props.className === "pc-mention-chips"), "C44 cleared by the host, gone");
  ok(!/pc-mention/.test(composerMarkup({ mentionStatus: "x", mentionsUnavailable: "y" })), "C45 both sentences need the feature on (mentionCandidates)");
}

// ---- D. WorkflowChat -----------------------------------------------------------------
const composerOf = (tree) => find(tree, (n) => n.type === ChatComposer);
{
  const sent = [];
  let fail = false;
  const w = mount(WorkflowChat, {
    messages: [],
    draft: "what do you think?",
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
  comp.props.onMentionsChange([castor, pollux]);
  w.render();
  fail = true;
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(sent[0].mentions.map((m) => [m.id, m.index]), [["castor", 0], ["pollux", 1]], "D2 onSend gets the mentions in order");
  eq(composerOf(w.tree).props.mentions.length, 2, "D3 a failed send keeps the chips (like the draft)");
  fail = false;
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(composerOf(w.tree).props.mentions.length, 0, "D4 a successful send clears them");
  const steered = [];
  w.rerender({ busy: true, steer: { onSteer: async (t, m, ctx) => { steered.push(ctx); return { accepted: true }; } } });
  composerOf(w.tree).props.onMentionsChange([pollux]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(steered[0].mentions.map((m) => m.id), ["pollux"], "D5 a steer carries them too");
  w.unmount();
}
{
  // Review 2026-11-09 B1/S1/S6: a send that stopped partway keeps ONLY its unsent chips; a chip
  // picked while a send is in flight is kept for the next one.
  const sent = [];
  let settle;
  const w = mount(WorkflowChat, {
    messages: [],
    draft: "does the plan hold?",
    onDraftChange() {},
    onSend: (draft, ctx) => { sent.push(ctx.mentions); return new Promise((resolve, reject) => { settle = { resolve, reject }; }); },
    mentionCandidates: async () => [castor, pollux],
  });
  composerOf(w.tree).props.onMentionsChange([castor, pollux]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  settle.reject(mentionsStoppedError("Pollux cannot answer right now.", [{ id: "pollux", name: "Pollux", kind: "entity", index: 1 }]));
  await w.settle();
  eq(composerOf(w.tree).props.mentions.map((m) => m.id), ["pollux"], "D8 a 503 after Castor answered: only Pollux stays (Castor is never asked again)");
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(sent[1].map((m) => [m.id, m.index]), [["pollux", 0]], "D10 the resend carries only the kept chip");
  settle.resolve({ unsentMentions: [] });
  await w.settle();
  eq(composerOf(w.tree).props.mentions.length, 0, "D11 a resolved send naming none keeps none");
  // S6: Hypnos picked while the send is in flight survives its success.
  const hypnos = { id: "hypnos", name: "Hypnos", kind: "entity" };
  composerOf(w.tree).props.onMentionsChange([castor]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  composerOf(w.tree).props.onMentionsChange([castor, hypnos]);
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
  composerOf(w.tree).props.onMentionsChange([castor, pollux]);
  w.render();
  composerOf(w.tree).props.onSubmit();
  await w.settle();
  eq(composerOf(w.tree).props.mentions.map((m) => m.id), ["pollux"], "D16 a steer that stopped partway keeps only the unsent chip");
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

console.log(`check_mentions: ${checks} checks green (trigger/pick/order/payload, author labels, card pinned to today without an author, composer list/keys/chips/notice/send, WorkflowChat, replay)`);
