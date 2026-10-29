#!/usr/bin/env node
/**
 * Triggers in words (UX review 2026-10-25, defects #2 and #3), over the compiled dist:
 * - triggerWords(): a schedule = the served sentence ("On a schedule" without it), "By hand",
 *   "When mail arrives in <address>", "When <label> has a new item" / "is called" — and never a
 *   source id ("feed.item@1", "schedule@2") in any of them;
 * - whenWords(): a past instant in the SERVED zone ("15:13", "today 15:13", "yesterday …"),
 *   UTC with the word "UTC" when no zone is known (never the browser's);
 * - occurrenceEventCard(): what arrived, from an occurrence's input_data.event (CloudEvent);
 * - the panel: the card above the task, the raw text behind "What the agent received", the
 *   run's meta line in words, "Next run" of an event-driven automation;
 * - the client: the connections and mailboxes routes.
 * Every case also checks the absent-input path (no list → generic words, no event → no card).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const parts = await import(join(here, "..", "dist", "automations", "AutomationPanel.js"));

let failures = 0;
let checks = 0;
function eq(name, got, want) {
  checks += 1;
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failures += 1;
  console.error(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

for (const name of ["triggerWords", "whenWords", "occurrenceEventCard", "mailboxName", "connectionSentence", "isEventTrigger", "triggerSourceName"]) {
  check(`index.js exports ${name}`, typeof kit[name] === "function");
}

const connections = [
  { connection_id: "c_feed", source_id: "feed.item", source_version: 1, label: "Release notes" },
  { connection_id: "c_hook", source_id: "webhook.received", source_version: 1, label: "CI hook" },
];
const mailboxes = [
  { account_id: "default", primary: true, address: "me@example.org", configured: true, can_read: true },
  { account_id: "work", primary: false, address: "work@example.org", configured: true, can_read: true },
];
const feed = { source_id: "feed.item", source_version: 1, config: { connection_id: "c_feed" } };
const hook = { source_id: "webhook.received", source_version: 1, config: { connection_id: "c_hook" } };
const mail = { source_id: "email.received", source_version: 1, config: { account: "work" } };
const W = kit.triggerWords;

// --- triggerWords ---------------------------------------------------------------------------
eq("feed by its connection's label", W(feed, connections, mailboxes), "When Release notes has a new item");
eq("webhook by its connection's label", W(hook, connections, mailboxes), "When CI hook is called");
eq("a flow default's top-level connection_id reads the same", W({ source_id: "feed.item", source_version: 1, config: {}, connection_id: "c_feed" }, connections), "When Release notes has a new item");
eq("feed without the list: generic words, no id", W(feed), "When a feed has a new item");
eq("webhook whose connection is not listed: generic words, no id", W({ ...hook, config: { connection_id: "gone" } }, connections), "When a webhook is called");
eq("mail in a named mailbox: its address", W(mail, connections, mailboxes), "When mail arrives in work@example.org");
eq("mail in the primary (no account, self, default)", [W({ source_id: "email.received", source_version: 1, config: {} }, null, mailboxes), W({ source_id: "email.received", source_version: 1, config: { account: "self" } }, null, mailboxes)], ["When mail arrives in me@example.org", "When mail arrives in me@example.org"]);
eq("mail without the list", W({ source_id: "email.received", source_version: 1, config: {} }), "When mail arrives in your main mailbox");
eq("by hand", W({ source_id: "manual", source_version: 1, config: {} }), "By hand");
eq("schedule = the served sentence (the account's zone)", W({ source_id: "schedule", source_version: 2, config: { kind: "daily", at: "08:00" } }, null, null, { schedule_rule_text: "Every day at 08:00 (Europe/Paris)" }), "Every day at 08:00 (Europe/Paris)");
eq("schedule without served words", W({ source_id: "schedule", source_version: 2, config: { kind: "daily", at: "08:00" } }), "On a schedule");
eq("an unknown source that arrives", W({ source_id: "sensor.reading", source_version: 3, config: {} }), "When something arrives");
const all = [W(feed), W(hook), W(mail), W(feed, connections), W({ source_id: "schedule", source_version: 2, config: {} }), W({ source_id: "sensor.reading", source_version: 3, config: {} })];
check("no source id or version in any sentence", all.every((t) => !/@\d|feed\.item|webhook\.received|email\.received|schedule@/.test(t)), all.join(" | "));
eq("the gateway's served trigger_text wins; absent or empty → the helper", [W(feed, null, null, { trigger_text: "When Python news has a new item" }), W(feed, connections, null, { trigger_text: "" }), kit.triggerSummary(feed, { trigger_text: "When Python news has a new item" })], ["When Python news has a new item", "When Release notes has a new item", "When Python news has a new item"]);
eq("isEventTrigger", [kit.isEventTrigger(feed), kit.isEventTrigger(mail), kit.isEventTrigger({ source_id: "schedule" }), kit.isEventTrigger({ source_id: "manual" }), kit.isEventTrigger(null)], [true, true, false, false, false]);
eq("triggerSummary is the same words (served schedule, vocab)", kit.triggerSummary(feed, null, { connections }), "When Release notes has a new item");

// --- whenWords ------------------------------------------------------------------------------
const NOW = Date.parse("2026-10-25T14:00:00Z");
eq("today in the served zone (clock style)", kit.whenWords("2026-10-25T13:13:00Z", { timeZone: "Europe/Paris", nowMs: NOW }), "14:13");
eq("today, day style", kit.whenWords("2026-10-25T13:13:00Z", { timeZone: "Europe/Paris", nowMs: NOW, style: "day" }), "today 14:13");
eq("yesterday", kit.whenWords("2026-10-24T13:13:00Z", { timeZone: "Europe/Paris", nowMs: NOW }), "yesterday 15:13");
eq("an older day", kit.whenWords("2026-10-20T07:05:00Z", { timeZone: "Europe/Paris", nowMs: NOW }), "20 Oct 09:05");
eq("no zone: UTC, and it says so", kit.whenWords("2026-10-25T13:13:00Z", { nowMs: NOW, style: "day" }), "today 13:13 UTC");
eq("an unknown zone: UTC, and it says so", kit.whenWords("2026-10-25T13:13:00Z", { timeZone: "Mars/Olympus", nowMs: NOW }), "13:13 UTC");
eq("missing or unreadable time", [kit.whenWords("", {}), kit.whenWords("not a time", {})], ["", ""]);

// --- occurrenceEventCard ----------------------------------------------------------------------
const feedEvent = {
  specversion: "1.0", id: "e1", type: "abstract.feed.item.v1", source: "abstract://triggers/feed.item/connections/c_feed", time: "2026-10-25T13:13:22Z",
  data: { count: 1, connection_id: "c_feed", event_ids: ["x"], events: [{ subject: "guid-1", time: "2026-10-25T13:10:00Z", data: { title: "Release 0.13", link: "https://example.org/r" } }] },
};
const ctx = { trigger: feed, connections, mailboxes, timeZone: "Europe/Paris", nowMs: NOW };
eq("feed: label · count + first title · time", kit.occurrenceEventCard(feedEvent, ctx), { source: "Release notes", what: "1 new item: “Release 0.13”", at: "14:13", text: "Release notes · 1 new item: “Release 0.13” · 14:13" });
const two = { ...feedEvent, data: { ...feedEvent.data, count: 2, events: [{ subject: "guid-1", data: {} }, { subject: "guid-2", data: { title: "B" } }] } };
eq("feed: no title → the item's subject; plural", kit.occurrenceEventCard(two, ctx)?.what, "2 new items: “guid-1”");
eq("webhook: calls", kit.occurrenceEventCard({ ...feedEvent, type: "abstract.webhook.received.v1", data: { count: 1, connection_id: "c_hook", events: [{ subject: "push", data: { ref: "main" } }] } }, { ...ctx, trigger: hook })?.text, "CI hook · 1 call: “push” · 14:13");
eq("mail: messages in the mailbox by address", kit.occurrenceEventCard({ ...feedEvent, type: "abstract.email.received.v1", data: { count: 2, messages: [{ subject: "Invoice 42" }, { subject: "Hi" }] } }, { ...ctx, trigger: mail })?.text, "work@example.org · 2 new messages: “Invoice 42” · 14:13");
eq("feed without the list: generic source, never an id", kit.occurrenceEventCard(feedEvent, { trigger: feed, timeZone: "Europe/Paris", nowMs: NOW })?.source, "A feed");
eq("a console test reads 'Test event' (data.test === true on every event)", kit.occurrenceEventCard({ ...feedEvent, data: { count: 1, connection_id: "c_feed", events: [{ subject: "test", data: { test: true } }] } }, ctx)?.text, "Release notes · Test event · 14:13");
eq("a real item with a test-looking subject is still an item", kit.occurrenceEventCard({ ...feedEvent, data: { count: 1, connection_id: "c_feed", events: [{ subject: "test", data: { title: "test" } }] } }, ctx)?.what, "1 new item: “test”");
eq("no card for a schedule tick, a manual run, nothing, or an empty batch", [
  kit.occurrenceEventCard({ ...feedEvent, type: "abstract.schedule.v2", data: { tick: 1 } }, ctx),
  kit.occurrenceEventCard({ ...feedEvent, type: "abstract.manual.v1", data: {} }, ctx),
  kit.occurrenceEventCard(null, ctx),
  kit.occurrenceEventCard("x", ctx),
  kit.occurrenceEventCard({ ...feedEvent, data: { count: 0, events: [] } }, ctx),
], [null, null, null, null, null]);

// --- the panel ------------------------------------------------------------------------------------
const task = "Summarise what changed in this release in three bullets.";
const raw = `[Trigger feed.item@1 · occurrence 1 · fired 2026-10-25T13:13:22+00:00]\n${task}\n\n[feed.item@1 trigger: 1 new event(s). …]\n--- Event 1 of 1 · boundary abc ---\nSubject: guid-1\nData (JSON):\n{}`;
const row = { run_id: "r1", index: 1, attempts: 1, fired_at: "2026-10-25T13:13:22Z", finished_at: "2026-10-25T13:13:40Z", status: "completed", trigger: { source_id: "feed.item", summary: "feed.item@1" }, user_turn: raw, answer: "Done.", notify: null, artifacts: [], waits: [], ledger_url: "/api/gateway/runs/r1/ledger" };
const view = kit.occurrenceViews([row])[0];
const pair = (extra) => renderToStaticMarkup(parts.OccurrencePair({ view, busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, timeZone: "Europe/Paris", nowMs: NOW, ...extra }));
const card = kit.occurrenceEventCard(feedEvent, ctx);
const withCard = pair({ eventCard: card, task });
const textOf = (html, cls) => ((new RegExp(`<div class="${cls}">([^]*?)</div>`).exec(html) || [])[1] || "");
check("panel: the card above the task", withCard.indexOf('data-event-card="true"') > 0 && withCard.indexOf('data-event-card="true"') < withCard.indexOf('class="af-auto-turn__text"') && withCard.includes("Release notes") && withCard.includes("1 new item: “Release 0.13”"));
check("panel: the turn shows the task alone", textOf(withCard, "af-auto-turn__text").includes(task) && !textOf(withCard, "af-auto-turn__text").includes("[Trigger"));
check("panel: the raw text behind 'What the agent received'", withCard.includes(`<summary>${parts.RECEIVED_LABEL}</summary>`) && parts.RECEIVED_LABEL === "What the agent received" && withCard.includes("boundary abc"));
check("panel: the meta line in words (Run #1 · something arrived · today 14:13), ids only in its tooltip", withCard.includes(">Run #1</span>") && withCard.includes("something arrived") && withCard.includes("today 14:13") && !((/<div class="af-auto-turn__meta"[^>]*>([^]*?)<\/div>/.exec(withCard) || [])[1] || "feed.item@1").includes("feed.item@1"));
eq("taskOfTurn: the framing's task; null when the task is only inside the text", [parts.taskOfTurn(raw, task), parts.taskOfTurn(`[Trigger x]\n${task}`, task), parts.taskOfTurn(`[Trigger x]\n## ${task}\nmore`, task), parts.taskOfTurn(task, task), parts.taskOfTurn(raw, "")], [task, task, null, null, null]);
const empty = renderToStaticMarkup(parts.OccurrencePair({ view: kit.occurrenceViews([{ ...row, user_turn: "" }])[0], busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, timeZone: "Europe/Paris", nowMs: NOW, eventCard: card }));
check("panel: no empty trigger bubble when the run has no text (the card says what arrived)", !/data-turn="trigger"[^]*?af-auto-turn__text[^]*?data-turn="answer"/.test(empty) && empty.includes('data-event-card="true"'));
// The tooltip too says the time in the person's zone (operator 2026-10-29: no UTC stamps on the panel).
const finishedTip = kit.whenWords("2026-10-25T13:13:40+00:00", { timeZone: "Europe/Paris", nowMs: NOW, style: "clock" });
check("panel: one time format on the answer line ('today 14:13'; its tooltip in the person's zone, not UTC)", withCard.includes("> · today 14:13</span>") && !withCard.includes(" UTC\"") && withCard.includes(`title="${finishedTip}"`), finishedTip);
const noTask = pair({ eventCard: null, task: "a task the turn does not carry" });
check("panel: no card and no disclosure when the turn does not carry the task (raw text as before)", !noTask.includes("data-event-card") && !noTask.includes("af-auto-received") && noTask.includes("[Trigger feed.item@1"));
const summary = { automation_id: "a1", title: "Release digest", status: "active", trigger: { binding_id: "b", ...feed }, context_mode: "growing", time_zone: "Europe/Paris", schedule_text: "feed.item@1", schedule_rule_text: "feed.item@1", occurrence_count: 1, attention: { unread: false, unseen_count: 0, pending_waits: 0, items: [], waits: [], cursor: null }, capabilities: ["pause", "run_now", "revise", "archive", "discuss"], revision: 1, last_occurrence: null, current_occurrence: null, workspace_root: "/data/workspaces/session-automation-1" };
const panel = (extra) => renderToStaticMarkup(React.createElement(kit.AutomationPanel, { summary, occurrences: [row], triggerSources: [], busy: false, onRevise: async () => ({}), onCommand: async () => ({}), onDiscuss: async () => ({}), onSeen: async () => {}, onLoadMore() {}, onOpenRun() {}, onAnswerWait: async () => {}, previewSchedule: async () => ({}), nowMs: NOW, ...extra }));
const full = panel({ triggerConnections: connections, mailboxes, occurrenceEvents: { r1: feedEvent } });
check("panel header: the trigger by name, never the served id text", full.includes('data-fact="trigger">When Release notes has a new item') && !/data-fact="trigger">[^<]*feed\.item@1/.test(full));
check("panel header: Next run of an event-driven automation", full.includes('data-fact="next">when something new arrives</dd>'));
check("panel: occurrenceEvents feed the card", full.includes('data-event-card="true"') && full.includes("1 new item: “Release 0.13”"));
check("panel: no card without occurrenceEvents (absent input)", !panel({ triggerConnections: connections }).includes("data-event-card"));
check("panel header: no folder path, no revision", !full.includes("/data/workspaces/session-automation-1") && !full.includes('data-fact="revision"'));

// --- the client --------------------------------------------------------------------------------
const calls = [];
const client = kit.createAutomationsClient({ fetch: async (url, init) => { calls.push(`${init.method} ${url}`); return new Response(JSON.stringify(url.includes("connections") ? { connections } : { items: mailboxes }), { status: 200 }); }, baseUrl: "http://gw" });
const got = [await client.listTriggerConnections(), await client.listMailboxes()];
eq("client: the two routes", calls, ["GET http://gw/api/gateway/triggers/connections", "GET http://gw/api/gateway/me/email/accounts"]);
eq("client: the bodies", [got[0].connections.length, got[1].items.length], [2, 2]);

if (failures) {
  console.error(`check_trigger_words: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_trigger_words: ${checks} checks passed`);
