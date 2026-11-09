// Turn notices as badges (AbstractRuntime 09cbad7, 2026-11-09): the reply is served without its
// bracket markers and, beside it, `notices: [{kind, record_id, title, text?, visibility?, staged?}]`.
//  A. pure: chatNoticesOf (the runtime's notice-shaped rule) and chatNoticeView (what a badge says);
//  B. ChatNoticeBadges: host opener, its `false` fallback, the own panel, keyboard (hook harness, no DOM);
//  C. ChatMessageCard: the row under the reply text, onNoticeOpen(notice, message), none in hint/caption,
//     no row without notices;
//  D. the lanes carry them: the replay projection (answer message `notices`), the session controller
//     (session turn row `turn.notices`, ledger ANSWER_USER payload `notices`);
//  E. the CSS ships, the entries export it.
// Run after `npm run build`: node scripts/check_notices.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mount, find, findAll, textOf } from "./hook_harness.mjs";
import { CHAT_NOTICE_WORDS, chatNoticesOf, chatNoticeView } from "../dist/chat_notices.js";
import { ChatNoticeBadges } from "../dist/chat_notice_badges.js";
import { ChatMessageCard } from "../dist/chat_message_card.js";
import { projectReplayView } from "../dist/replay_view_projection.js";
import { WorkflowSessionController } from "../dist/workflow_runtime.js";
import * as index from "../dist/index.js";
import * as conversationEntry from "../dist/conversation.js";

let checks = 0;
const ok = (cond, label) => { assert.ok(cond, label); checks += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks += 1; };

// The fixture reply of the operator's visit (2026-11-09), plus a private entry.
const diary = { kind: "diary", record_id: "ex:diary-0eb1c2", title: "the first durable visit" };
const lesson = { kind: "lesson", record_id: null, title: "Visits are durable", text: "A visit survives a restart.", staged: true };
const privateDiary = { kind: "diary", record_id: "ex:diary-77aa01", title: "", visibility: "private" };
const untitled = { kind: "interest", record_id: "ex:interest-9", title: "", text: "How the garden survives a dry\nAugust, and what the soil keeps." };
const served = [diary, lesson, privateDiary];

// ---- A. pure ----------------------------------------------------------------------------
eq(chatNoticesOf(served), [diary, lesson, privateDiary], "A1 a served list reads as served");
eq(chatNoticesOf(["#FALLBACK realization refused", "diary kept"]), [], "A2 a list of plain strings (the operator's log) is not notices");
eq(chatNoticesOf([null, 3, [], { title: "no kind" }, { kind: "  " }, diary]), [diary], "A3 only objects with a kind");
eq(chatNoticesOf(undefined), [], "A4 nothing served, nothing");
eq(chatNoticesOf({ kind: "diary" }), [], "A5 a non-list is nothing");
eq(chatNoticesOf([{ kind: "Lesson", record_id: "  ", title: 7, staged: "yes" }]), [{ kind: "lesson", record_id: null, title: "" }], "A6 an empty id is null, a non-string title is empty, staged only when true");
eq(chatNoticesOf([{ kind: "diary", record_id: "ex:diary-1", title: "t", visibility: "private", text: "w" }]), [{ kind: "diary", record_id: "ex:diary-1", title: "t", visibility: "private", text: "w" }], "A7 fields copied as served");

const vd = chatNoticeView(diary, 0);
eq([vd.word, vd.icon, vd.label, vd.fromText, vd.private, vd.staged], ["diary", "book", "the first durable visit", false, false, false], "A8 a diary entry: its word, book, its title");
eq(vd.ariaLabel, "Diary: the first durable visit", "A9 its accessible name");
const vl = chatNoticeView(lesson, 1);
eq([vl.word, vl.icon, vl.label, vl.staged], ["lesson", "check", "Visits are durable", true], "A10 a staged lesson keeps its title and is staged");
eq(vl.ariaLabel, `Lesson: Visits are durable (${CHAT_NOTICE_WORDS.staged})`, "A11 staged is said");
const vp = chatNoticeView(privateDiary, 2);
eq([vp.label, vp.icon, vp.private, vp.fromText], ["private diary entry", "lock", true, false], "A12 a private diary entry: 'private diary entry', a lock");
eq(chatNoticeView({ ...privateDiary, title: "leaked title", text: "leaked words" }).label, "private diary entry", "A13 a private entry never shows a title or words, even if some were sent");
const vu = chatNoticeView(untitled, 3);
eq([vu.label, vu.fromText], [untitled.text.trim(), true], "A14 no title: his words, whole (never cut in the string)");
eq(chatNoticeView({ kind: "question", record_id: "ex:q", title: "" }).label, "", "A15 no title and no words: the kind word alone");
eq(chatNoticeView({ kind: "question", record_id: "ex:q", title: "" }).ariaLabel, "Question", "A16 its accessible name is the word");
eq(["question", "interest", "realization"].map((kind) => chatNoticeView({ kind, record_id: "x", title: "t" }).icon), ["chat", "activity", "sparkle"], "A17 one icon per kind");
const other = chatNoticeView({ kind: "open_problem", record_id: "x", title: "t" });
eq([other.word, other.icon], ["open problem", "info"], "A18 another kind keeps its own word");
ok(new Set(served.map((n, i) => chatNoticeView(n, i).key)).size === 3, "A19 keys are distinct");

// ---- B. the badge row ---------------------------------------------------------------------
const isBadge = (n) => n.type === "button" && typeof n.props.className === "string" && n.props.className.split(" ").includes("pc-chat-notice");
const panelOf = (tree) => find(tree, (n) => n.props && n.props.className === "pc-chat-notice-pop");
const keyEvent = (key) => { const e = { key, stopped: false, stopPropagation() { e.stopped = true; } }; return e; };
{
  eq(mount(ChatNoticeBadges, { notices: [] }).tree, null, "B1 no notice, no row");
  eq(mount(ChatNoticeBadges, { notices: ["a log line"] }).tree, null, "B2 a log list, no row");
  const opened = [];
  const h = mount(ChatNoticeBadges, { notices: served, onOpen: (n) => { opened.push(n); } });
  const badges = findAll(h.tree, isBadge);
  eq(badges.length, 3, "B3 one badge per notice");
  eq(badges.map((b) => b.props["data-notice-kind"]), ["diary", "lesson", "diary"], "B4 in the served order");
  eq(badges.map((b) => b.props["aria-label"]), ["Diary: the first durable visit", "Lesson: Visits are durable (forming…)", "Diary: private diary entry"], "B5 accessible names");
  ok(textOf(badges[1]).includes(CHAT_NOTICE_WORDS.staged) && "data-staged" in badges[1].props && badges[1].props.className.includes("pc-chat-notice--staged"), "B6 staged reads 'forming…'");
  ok("data-private" in badges[2].props && textOf(badges[2]).includes("private diary entry"), "B7 the private badge");
  ok(textOf(find(h.tree, (n) => n.props && n.props.role === "group")).includes("the first durable visit"), "B8 the title is on the badge");
  eq(find(h.tree, (n) => n.props && n.props.role === "group").props["aria-label"], CHAT_NOTICE_WORDS.group, "B9 the row is named");
  badges[0].props.onClick();
  h.render();
  eq(opened, [diary], "B10 a click hands the host the notice");
  ok(!panelOf(h.tree), "B11 a host that opened something: no own panel");
  findAll(h.tree, isBadge)[2].props.onClick();
  eq(opened[1], privateDiary, "B12 the private badge goes to the host too (its record id)");
  ok(!("aria-expanded" in findAll(h.tree, isBadge)[0].props), "B13 with a host a closed badge is a plain button");
  h.unmount();
}
{
  // The host opened nothing (a staged notice before the close): the badge's own panel.
  const asked = [];
  const h = mount(ChatNoticeBadges, { notices: served, onOpen: (n) => { asked.push(n); return n.record_id ? undefined : false; } });
  findAll(h.tree, isBadge)[1].props.onClick();
  h.render();
  const panel = panelOf(h.tree);
  ok(asked.length === 1 && panel, "B14 the host returned false: the own panel opens");
  ok(textOf(panel).includes("Visits are durable") && textOf(panel).includes("A visit survives a restart.") && textOf(panel).includes(CHAT_NOTICE_WORDS.stagedNote), "B15 its title, words and the forming sentence");
  const badge = findAll(h.tree, isBadge)[1];
  eq([badge.props["aria-expanded"], badge.props["aria-controls"]], [true, panel.props.id], "B16 the badge controls the panel");
  h.unmount();
}
{
  // No host: every badge opens its own panel.
  // A private entry that (wrongly) carries words: they never reach the screen.
  const h = mount(ChatNoticeBadges, { notices: [diary, lesson, { ...privateDiary, text: "leaked words" }, untitled] });
  ok(findAll(h.tree, isBadge).every((b) => b.props["aria-expanded"] === false), "B17 without a host every badge is a closed disclosure");
  findAll(h.tree, isBadge)[3].props.onClick();
  h.render();
  let panel = panelOf(h.tree);
  ok(textOf(panel).includes(untitled.text.trim()), "B18 the words whole in the panel (line break kept)");
  ok(!find(panel, (n) => n.props && n.props.className === "pc-chat-notice-pop__title"), "B19 untitled: no heading repeats the words");
  findAll(h.tree, isBadge)[2].props.onClick();
  h.render();
  panel = panelOf(h.tree);
  ok(textOf(panel).includes(CHAT_NOTICE_WORDS.privateNote) && !textOf(panel).includes("leaked words") && !find(panel, (n) => n.props && n.props.className === "pc-chat-notice-pop__text"), "B20 private: only the privacy sentence, no words");
  ok(findAll(h.tree, isBadge).filter((b) => b.props["aria-expanded"] === true).length === 1, "B21 one panel at a time");
  findAll(h.tree, isBadge)[2].props.onClick();
  h.render();
  ok(!panelOf(h.tree), "B22 a second click closes it");
  findAll(h.tree, isBadge)[0].props.onClick();
  h.render();
  const esc = keyEvent("Escape");
  panelOf(h.tree).props.onKeyDown(esc);
  h.render();
  ok(esc.stopped && !panelOf(h.tree), "B23 Escape in the panel closes it and stops there");
  findAll(h.tree, isBadge)[0].props.onClick();
  h.render();
  const esc2 = keyEvent("Escape");
  findAll(h.tree, isBadge)[0].props.onKeyDown(esc2);
  h.render();
  ok(esc2.stopped && !panelOf(h.tree), "B24 Escape on the badge closes it");
  const idle = keyEvent("Escape");
  findAll(h.tree, isBadge)[0].props.onKeyDown(idle);
  ok(!idle.stopped, "B25 Escape with nothing open is left to the page");
  findAll(h.tree, isBadge)[0].props.onClick();
  h.render();
  find(panelOf(h.tree), (n) => n.type === "button").props.onClick();
  h.render();
  ok(!panelOf(h.tree), "B26 the Close button closes it");
  findAll(h.tree, isBadge)[0].props.onClick();
  h.rerender({ notices: [lesson] });
  h.render();
  ok(!panelOf(h.tree), "B27 a new list under an open panel closes it");
  h.unmount();
}

// ---- C. the card --------------------------------------------------------------------------
{
  const reply = { id: "a1", role: "assistant", title: "Castor", content: "Kept.\n\nGood to see you.", notices: served, media: [{ kind: "image", src: "/x.png", label: "Garden" }] };
  const html = renderToStaticMarkup(React.createElement(ChatMessageCard, { message: reply }));
  const body = html.indexOf('class="pc-chat-body"'), row = html.indexOf('class="pc-chat-notices"'), media = html.indexOf('class="pc-chat-media"');
  ok(body >= 0 && row > body && media > row, "C1 the row sits under the reply text, before media");
  ok(html.includes("Good to see you.") && !html.includes("[kept") && !html.includes("[learned"), "C2 the reply text as served, no marker");
  eq((html.match(/class="pc-chat-notice /g) || []).length, 3, "C3 three badges");
  const without = { ...reply, notices: undefined };
  ok(!renderToStaticMarkup(React.createElement(ChatMessageCard, { message: without })).includes("pc-chat-notice"), "C4 no notices, no row");
  ok(!renderToStaticMarkup(React.createElement(ChatMessageCard, { message: { ...reply, notices: [] } })).includes("pc-chat-notice"), "C5 an empty list, no row");
  const { notices: _n, ...plain } = reply;
  eq(renderToStaticMarkup(React.createElement(ChatMessageCard, { message: plain })), renderToStaticMarkup(React.createElement(ChatMessageCard, { message: without })), "C6 a card without notices is unchanged");
  ok(!renderToStaticMarkup(React.createElement(ChatMessageCard, { message: reply, variant: () => "caption" })).includes("pc-chat-notice"), "C7 a caption (subtitle) shows no badges");
  ok(!renderToStaticMarkup(React.createElement(ChatMessageCard, { message: reply, variant: () => "hint" })).includes("pc-chat-notice"), "C8 a hint shows no badges");
  const got = [];
  const tree = mount(ChatMessageCard, { message: reply, onNoticeOpen: (notice, message) => { got.push([notice, message]); return undefined; } }).tree;
  const badges = find(tree, (n) => n.type === ChatNoticeBadges);
  ok(badges && badges.props.notices === served, "C9 the card hands its notices to the row");
  badges.props.onOpen(diary);
  ok(got.length === 1 && got[0][0] === diary && got[0][1] === reply, "C10 onNoticeOpen(notice, message)");
  ok(find(mount(ChatMessageCard, { message: reply }).tree, (n) => n.type === ChatNoticeBadges).props.onOpen === undefined, "C11 no host opener: the row opens its own panel");
}

// ---- D. the lanes -------------------------------------------------------------------------
{
  const view = {
    version: "replay_view_v1", root_run_id: "r1", status: "completed", cursor: { token: "t", records: 2, runs: { r1: 2 } }, runs: [], interaction: null,
    messages: [
      { id: "r1:p", role: "user", kind: "prompt", text: "Hello", run_id: "r1", order: ["2026-11-09T22:00:00Z", 1] },
      { id: "r1:s2:answer_user", role: "assistant", kind: "answer", text: "Kept.\n\nGood to see you.", run_id: "r1", order: ["2026-11-09T22:00:05Z", 2], notices: served },
      { id: "r1:s3:answer_user", role: "assistant", kind: "answer", text: "And another.", run_id: "r1", order: ["2026-11-09T22:00:06Z", 3], notices: null },
      { id: "r1:s4:answer_user", role: "assistant", kind: "answer", text: "A log.", run_id: "r1", order: ["2026-11-09T22:00:07Z", 4], notices: ["#FALLBACK x"] },
    ],
    activities: [], artifacts: [],
  };
  const p = projectReplayView(view);
  const byId = (id) => p.messages.find((m) => m.id === id);
  eq(byId("r1:s2:answer_user").notices, served, "D1 the view's answer carries its notices into the chat message");
  ok(!("notices" in byId("r1:s3:answer_user")) && !("notices" in byId("r1:s4:answer_user")) && !("notices" in byId("r1:p")), "D2 null, a log list or none: no notices field");
}
{
  const transport = {
    async getRun(runId) { return { run_id: runId, status: "completed", output: { response: runId === "old" ? "earlier answer" : "now" } }; },
    async getHistory() {
      return {
        session: { turns: [
          { run_id: "old", prompt: "earlier question", answer: "earlier answer", notices: [diary] },
          { run_id: "old2", prompt: "q2", answer: "a2", notices: [] },
        ] },
        ledgers: { now: { items: [
          { cursor: 1, record: { run_id: "now", status: "completed", effect: { type: "answer_user", payload: { message: "Kept.", notices: [lesson, privateDiary] } }, result: { message: "Kept." } } },
          { cursor: 2, record: { run_id: "now", status: "completed", effect: { type: "answer_user", payload: { message: "Plain.", notices: ["a log"] } }, result: { message: "Plain." } } },
        ] } },
      };
    },
    async getLedger(_r, after) { return { items: [], next_after: after }; },
    async streamLedger() { throw new Error("terminal runs do not stream"); },
    async submitCommand() { return { accepted: true }; },
  };
  const c = new WorkflowSessionController(transport, { clientId: "notices-check" });
  await c.load("now");
  const msgs = c.getSnapshot().messages;
  const of = (content) => msgs.find((m) => m.role === "assistant" && m.content === content);
  const byId = (id) => msgs.find((m) => m.id === id);
  eq(byId("final:old").notices, [diary], "D3 a session turn row's notices ride its answer");
  ok(byId("final:old2") && !("notices" in byId("final:old2")), "D4 a row with [] carries none");
  eq(of("Kept.")?.notices, [lesson, privateDiary], "D5 a ledger ANSWER_USER payload's notices ride the answer");
  ok(of("Plain.") && !("notices" in of("Plain.")), "D6 a log list on the payload is not notices");
  c.dispose();
}

// ---- E. css + entries ------------------------------------------------------------------------
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
for (const cls of [".pc-chat-notices {", ".pc-chat-notices__row {", ".pc-chat-notice {", ".pc-chat-notice__label {", ".pc-chat-notice--staged {", ".pc-chat-notice-pop {", ".pc-chat-notice-pop__text {"]) ok(css.includes(cls), `E css ${cls}`);
ok(/\.pc-chat-notices__row \{[^}]*flex-wrap: wrap/.test(css), "E1 the row wraps (phone width)");
ok(/\.pc-chat-notice \{[^}]*max-width: 100%/.test(css) && /\.pc-chat-notice__label \{[^}]*text-overflow: ellipsis/.test(css), "E2 a badge never widens the card");
ok(/\.pc-chat-notice-pop__text \{[^}]*white-space: pre-wrap/.test(css), "E3 the panel keeps his line breaks");
for (const name of ["ChatNoticeBadges", "chatNoticesOf", "chatNoticeView", "CHAT_NOTICE_WORDS"]) {
  ok(typeof index[name] !== "undefined", `E package exports ${name}`);
  ok(typeof conversationEntry[name] !== "undefined", `E conversation entry exports ${name}`);
}

console.log(`check_notices: OK (${checks} checks)`);
