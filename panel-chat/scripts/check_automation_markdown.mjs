// Automations v1: the AutomationPanel renders occurrence text with the SHARED
// chat renderer (operator ruling) — markdown headings, tables, fenced code —
// sanitised like chat messages. Uses the canonical ui-kit fixtures.
// Run after `npm run build`: node scripts/check_automation_markdown.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as pc from "../dist/index.js";
import * as kit from "@abstractframework/ui-kit";
import { mount, find } from "./hook_harness.mjs";

const fx = (f) => JSON.parse(readFileSync(new URL(`../../ui-kit/scripts/fixtures/automations/${f}`, import.meta.url), "utf8"));
const list = fx("list.json").items;
const occ = fx("occurrences.json").items;
const mail = list.find((s) => s.title === "Inbox triage");
const sources = fx("trigger-sources.json").items;

const { AutomationPanelWithMarkdown, automationRenderers, renderAutomationText } = pc;
for (const [n, v] of Object.entries({ AutomationPanelWithMarkdown, renderAutomationText })) assert.equal(typeof v, "function", `export ${n}`);
assert.equal(automationRenderers.renderText, renderAutomationText, "automationRenderers.renderText is the shared renderer");
assert.equal(automationRenderers.renderTurn, pc.renderAutomationTurn, "automationRenderers.renderTurn is the shared chat card");

const noop = async () => ({});
const base = { summary: mail, occurrences: occ, triggerSources: sources, busy: false, onRevise: noop, onCommand: noop, onDiscuss: async () => ({ session_id: "s", run_id: "r" }), onSeen: async () => {}, onLoadMore() {}, onOpenRun() {}, onAnswerWait: async () => {}, newId: () => "x" };
// The bare panel with the shared renderers (`{...automationRenderers}`): the turns as before (no card chrome).
const html = renderToStaticMarkup(React.createElement(kit.AutomationPanel, { ...base, ...automationRenderers }));
const pair2 = html.split('<li class="af-auto-occ ').find((c) => c.includes('data-index="2"'));
assert.ok(pair2, "occurrence #2 rendered");

// Heading, table and fenced JSON become elements; no literal markdown survives.
assert.ok(pair2.includes("<h2>2 emails need a reply today</h2>"), "heading element");
assert.ok(/<table class="pc-md_table"><thead><tr><th>From<\/th><th>Subject<\/th><th>Due<\/th><\/tr><\/thead><tbody><tr><td>Clara \(accountant\)<\/td>/.test(pair2), "table element");
assert.ok(pair2.replace(/<span[^>]*>|<\/span>/g, "").includes('<pre class="pc-md_pre"><code class="language-json">{&quot;urgent&quot;: 2, &quot;newsletters&quot;: 1}</code></pre>'), "fenced JSON as a code block");
assert.ok(!pair2.includes("## ") && !pair2.includes("|---|") && !pair2.includes("```"), "no literal markdown");
assert.ok(html.includes('data-text-rendering="rich"') && !html.includes("data-unformatted"), "panel marked rich, nothing unformatted");
// The trigger turn, wait prompt and attention bodies go through the same renderer.
assert.ok(pair2.includes('data-turn="trigger"><div class="af-auto-turn__meta"') && /data-turn="trigger">[\s\S]*?<div class="pc-chat-content"><div class="pc-md">/.test(pair2), "user_turn rendered by the chat renderer");
const pair7 = html.split('<li class="af-auto-occ ').find((c) => c.includes('data-index="7"'));
assert.ok(/<div class="af-auto-wait__prompt" id="[^"]+"><span class="af-auto-wait__kind">Question for you<\/span><div class="pc-chat-content">/.test(pair7), "ask_user prompt rendered by the chat renderer");
assert.ok(/<div class="af-auto__attention-body"><div class="pc-chat-content">/.test(html), "attention bodies rendered by the chat renderer");

// Every trigger turn is "[Trigger …]\n## heading…" (no blank line): the heading is an element.
const trigTurns = [...html.matchAll(/data-turn="trigger">[\s\S]*?<\/div><\/div><\/div>/g)].map((m) => m[0]);
assert.ok(occ.every((o) => /^\[Trigger [^\]]+\]\n## /.test(o.user_turn)), "fixture trigger turns have the heading-after-a-line shape");
assert.equal((html.match(/<h2>Inbox triage<\/h2>/g) || []).length, occ.length, "one rendered heading per trigger turn");
assert.ok(!/## Inbox triage/.test(html), "no literal '## ' left in trigger turns");
assert.ok(html.includes("Set <code>notify</code> when something is urgent."), "inline code in the task renders");

// Occurrence turns are the SHARED chat card (ChatMessageCard): trigger = user card titled "Trigger",
// answer = assistant card titled "Automation", each with the card's copy button.
const cards = html.match(/<div class="pc-chat-item pc-chat-item--(user|assistant)"><div class="pc-chat-header">/g) || [];
assert.equal(cards.length, occ.length + occ.filter((o) => o.answer).length, "one card per trigger turn and per answer");
const trigCards = html.match(/af-auto-turn--card" data-turn="trigger"><div class="af-auto-turn__meta"[\s\S]*?<div class="af-auto-turn__text"><div class="pc-chat-item pc-chat-item--user"><div class="pc-chat-header"><div class="pc-chat-avatar" aria-hidden="true"><svg[\s\S]*?<\/svg><\/div><span class="pc-chat-role">Trigger<\/span>/g) || [];
assert.equal(trigCards.length, occ.length, "every trigger turn is a user card titled Trigger");
assert.ok(/data-turn="answer">[\s\S]*?<div class="af-auto-turn__text"><div class="pc-chat-item pc-chat-item--assistant">[\s\S]*?<span class="pc-chat-role">Automation<\/span>/.test(pair2), "the answer is an assistant card titled Automation");
assert.equal((pair2.match(/aria-label="Copy message"/g) || []).length, 2, "both turn cards carry the chat copy button");

// Sanitised like chat messages.
const evil = { ...occ.find((o) => o.index === 2), user_turn: "[Trigger x]\n![t](https://evil.example/trigger.png)", answer: "# t\n\n<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) ![i](https://evil.example/p.png)" };
const bad = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, { ...base, occurrences: [evil] }));
assert.ok(bad.includes('data-chrome="card"'), "the wrapper renders in card chrome");
assert.ok(!/<script/i.test(bad), "no script element");
assert.ok(!/<[a-z][^>]*\son[a-z]+=/i.test(bad) && bad.includes("&lt;img src=x onerror=alert(1)&gt;"), "no event-handler attribute (raw HTML shown as text)");
assert.ok(!/href="javascript:/i.test(bad), "no javascript: link");
assert.ok(!bad.includes('src="https://evil.example') && bad.includes('href="https://evil.example/p.png"'), "remote image is a link, never fetched");
assert.ok(bad.includes('href="https://evil.example/trigger.png"'), "the trigger turn (a user-role card) also shows remote images as links");

// Gateway links (ledger JSON, artifacts) are never raw hrefs; with the host's fetchGateway they
// become buttons that open through it.
const wrapped = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, base));
assert.ok(!/href="\/api\//.test(wrapped) && !wrapped.includes('data-action="open-ledger-json"'), "no fetchGateway → no gateway links at all");
const fetched = [];
const fetchGateway = async (path) => (fetched.push(path), new Response("{}", { headers: { "content-type": "application/json" } }));
const withFetch = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, { ...base, fetchGateway }));
assert.equal((withFetch.match(/data-action="open-ledger-json"/g) || []).length, occ.length, "one ledger button per run");
assert.ok(!withFetch.includes('data-action="open-artifact"') && !withFetch.includes("af-auto-artifacts") && !/href="\/api\//.test(withFetch), "card chrome: no panel artifact list (the cards' chips), still no raw href");
const panelOf = (props) => find(mount(AutomationPanelWithMarkdown, props).tree, (n) => n.type === kit.AutomationPanel);
const el = panelOf({ ...base, fetchGateway });
globalThis.window = { open() {}, setTimeout: () => 0 };
const realCreate = URL.createObjectURL;
URL.createObjectURL = () => "blob:x";
await el.props.onOpenResource({ kind: "ledger", url: occ[0].ledger_url, name: "l.json", runId: occ[0].run_id });
URL.createObjectURL = realCreate;
delete globalThis.window;
assert.deepEqual(fetched, [occ[0].ledger_url.slice(1)], "the wrapper opens a resource through fetchGateway at the app-relative path");
const own = [];
const hostOwn = panelOf({ ...base, fetchGateway, onOpenResource: (r) => void own.push(r) });
hostOwn.props.onOpenResource({ kind: "artifact", url: "u", name: "n", runId: "r" });
assert.equal(own.length, 1, "a host's own onOpenResource wins over fetchGateway");
assert.ok(!("fetchGateway" in el.props), "fetchGateway is not forwarded to the kit panel");

// The spread helper keeps today's rendering (a host on it is unchanged); the wrapper sets card chrome.
assert.ok(!html.includes('data-chrome="card"') && el.props.turnChrome === "card", "spread = no card chrome; the wrapper = turnChrome card");

// --- Card chrome (spec F): the run's trigger and answer ARE the shared chat message -----------------
{
  const r2 = occ.find((o) => o.index === 2);
  const card = wrapped.split('<li class="af-auto-occ ').find((c) => c.includes('data-index="2"'));
  const trig = card.split('data-turn="answer"')[0];
  const ans = card.split('data-turn="answer"')[1];
  const stamp = pc.formatMessageStamp(r2.fired_at);
  assert.ok(stamp && new RegExp(`<div class="pc-chat-item pc-chat-item--user"><div class="pc-chat-header">[\\s\\S]*?<time class="pc-chat-time" dateTime="[^"]+"[^>]*>${stamp}</time>`).test(trig), "the trigger's stamp is INSIDE its card (the card's own)");
  assert.ok(r2.finished_at && new RegExp(`<div class="pc-chat-item pc-chat-item--assistant">[\\s\\S]*?<time class="pc-chat-time"[^>]*>${pc.formatMessageStamp(r2.finished_at)}</time>`).test(ans), "the answer's stamp is INSIDE its card");
  assert.ok(new RegExp(`<div class="af-auto-turn__meta af-auto-turn__runline" title="[^"]*fired [^"]+"><span class="af-auto-turn__runwords" id="[^"]+"><span class="af-auto-turn__index">Run #2</span> · ${kit.occurrenceStartWords(r2)}</span></div>`).test(trig), "the run line: 'Run #2 · how it started', no time (the automation-zone time is its tooltip)");
  assert.ok(!/af-auto-turn__meta">[^<]*<span[^>]*>[^<]*<\/span>[^<]* · (today|yesterday)/i.test(card) && !card.includes(` · ${kit.whenWords(r2.fired_at, { timeZone: mail.time_zone, style: "day" })}</div>`), "no panel-drawn time next to the run");
  assert.ok(!/class="af-auto-turn af-auto-turn--trigger[^"]*"[^>]*style=/.test(card) && wrapped.includes('data-chrome="card"'), "no extra wrapper style on the trigger");
  // Files: the answer's chips are the card's own (named, with the chat's icon), never the panel's list.
  assert.ok(r2.artifacts.length && ans.includes('<div class="pc-chat-attachments" aria-label="Attached files">') && ans.includes(`<span class="pc-chat-attachment-name">${r2.artifacts[0].name}</span>`), "the run's file is a chip in the answer card, with its name");
  // Voice: the host's voice props give every answer card its speaker.
  const voiced = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, { ...base, messageProps: { onSpeakToggle() {}, getSpeakState: () => "idle" } }));
  const vcard = voiced.split('<li class="af-auto-occ ').find((c) => c.includes('data-index="2"'));
  assert.ok(/data-turn="answer"[\s\S]*?data-speak-state="idle"/.test(vcard) && !/data-turn="trigger"[\s\S]*?data-speak-state[\s\S]*?data-turn="answer"/.test(vcard), "a speaker on the answer (the host's voice), none on the trigger");
  // The pure message mapping: stamp, live state, files (handed files go to the trigger only).
  const turn = (extra) => ({ kind: "answer", role: "assistant", text: "", index: 3, runId: "run3", chrome: "card", ...extra });
  const A = (id, name) => ({ artifact_id: id, name, mime_type: "application/pdf", url: `/api/gateway/runs/run3/artifacts/${id}/content` });
  const ready = (ids) => ({ status: "ready", files: ids.map((id) => ({ id, runId: "run3" })), error: "" });
  const m1 = pc.automationTurnMessage(turn({ ts: "2026-09-27T06:00:00Z", artifacts: [A("a".repeat(32), "brief.txt"), A("b".repeat(32), "report.pdf")] }), ready(["a".repeat(32)]));
  assert.deepEqual(m1.artifactRefs, [{ id: "b".repeat(32), runId: "run3", name: "report.pdf" }], "the answer leaves out what the run was handed");
  assert.equal(m1.ts, "2026-09-27T06:00:00Z", "the answer carries its finished time");
  const held = pc.automationTurnMessage(turn({ artifacts: [A("c".repeat(32), "x.pdf")] }), { status: "loading", files: [], error: "" });
  assert.ok(!held.artifactRefs, "while the run's inputs are read, the answer's chips wait (no handed file flashes on it)");
  const unnamed = pc.automationTurnMessage(turn({ artifacts: [A("d".repeat(32), "d".repeat(32))] }), { status: "none", files: [], error: "" });
  assert.deepEqual(unnamed.artifactRefs, [{ id: "d".repeat(32), runId: "run3" }], "a file named by its storage id gets no name (the chip reads its own; never the raw id)");
  const trig3 = pc.automationTurnMessage({ ...turn({}), kind: "trigger", role: "user" }, ready(["e".repeat(32)]));
  assert.deepEqual(trig3.artifactRefs, [{ id: "e".repeat(32), runId: "run3" }], "the trigger shows what the run was handed");
  const live = pc.automationTurnMessage(turn({ live: { current: null } }), { status: "none", files: [], error: "" });
  assert.ok(live.live && live.live.label === kit.AUTOMATION_EDIT_WORDS.run.working, "a run in progress is the card's live state");
  // A run in progress: the card's working state + the live line in its footer; one Stop in the header.
  const running = { ...r2, index: 9, run_id: "run-live", answer: null, finished_at: undefined, status: "running", artifacts: [], waits: [], failure: null, notify: null };
  const cur = { index: 9, run_id: "run-live", attempt: 1, status: "running", live: { started_at: "2026-09-27T06:30:00Z", state: "thinking", tool: null, attempt: 1, steps_done: 2 } };
  const runHtml = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, { ...base, summary: { ...mail, current_occurrence: cur }, occurrences: [running], nowMs: Date.parse("2026-09-27T06:32:14Z") }));
  assert.ok(/data-turn="answer"[\s\S]*?<div class="pc-chat-item pc-chat-item--assistant pc-chat-item--live" aria-busy="true">[\s\S]*?pc-working-dots[\s\S]*?<div class="pc-chat-footer"><div class="af-auto-live"/.test(runHtml), "the card's working state, the live line in its footer");
  assert.equal((runHtml.match(/class="af-auto-live"/g) || []).length, 1, "the live line once (not also under the badge)");
  assert.ok(runHtml.includes('data-action="stop_current"') && !runHtml.includes('data-action="run_now"'), "ONE Stop button in the header");
  // Offload kinds are hidden by the chip (metadata-known), and the answer footer slot sits under the card.
  for (const kind of ["run_store_offload", "ledger_effect_offload", "ledger_result_offload", "node_trace_offload"]) assert.equal(pc.internalArtifactMetadata({ tags: { source: kind } }), true, `${kind} is internal`);
  const slotted = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, { ...base, answerFooter: (t) => React.createElement("section", { className: "after-slot", "data-run": t.runId }) }));
  assert.ok(new RegExp(`data-turn="answer">[\\s\\S]*?</div><section class="after-slot" data-run="${r2.run_id}"></section>`).test(slotted.split('<li class="af-auto-occ ').find((c) => c.includes('data-index="2"'))), "the host's answer slot is drawn under the answer card, in the frame");
  // Context: the wrapper opens the shared Context view (panel-chat's) from the run line.
  const ctxPanel = panelOf({ ...base, readRunContext: { input_data: async () => ({}), run: async () => ({}) } });
  assert.equal(typeof ctxPanel.props.onOpenContext, "function", "readRunContext → the run line's Context button");
  const ctxHtml = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, { ...base, readRunContext: { input_data: async () => ({}), run: async () => ({}) } }));
  assert.ok(/<div class="af-auto-turn__meta af-auto-turn__runline"[^>]*><span class="af-auto-turn__runwords"[\s\S]*?<\/span><button type="button" class="af-btn af-btn--quiet af-auto-context-btn" data-action="open-context"/.test(ctxHtml), "the Context button sits on the run line");
}

// --- The Context view (moved here from AbstractObserver): the chat card, JsonViewer, fold marker ---
{
  const input = { input_data: { context: { messages: [
    { role: "user", content: "[#TRUNCATION: …]\nTask of run 4", metadata: { kind: "session_turn", run_id: "r4", ts: "2026-09-26T08:00:00Z", replay_truncated: true, history_window: { dropped_messages: 6, dropped_tokens: 1200, max_tokens: 50000 } } },
    { role: "assistant", content: "## Digest 4", metadata: { kind: "session_turn", run_id: "r4" } },
    { role: "user", content: "Task of a run the host does not know", metadata: { kind: "session_turn", run_id: "rx" } },
  ] }, prompt: "x" } };
  const data = pc.runContextView(input, { session_history: { replayed_messages: 3, replayed_tokens: 900, max_tokens: 50000 } }, "[Trigger] go");
  assert.deepEqual(data.earlier.map((m) => m.left_out), [{ messages: 6, tokens: 1200, budget: 50000 }, null, null], "the fold marker is read from the message's metadata");
  const body = renderToStaticMarkup(React.createElement(pc.RunContextBody, { state: { status: "ready", data }, runIndex: (id) => (id === "r4" ? 4 : undefined) }));
  assert.ok(body.includes('data-fact="left-out"') && body.includes("6 older messages (about 1,200 tokens) were left out"), "the fold marker is visible");
  assert.ok(/<li data-who="task" data-run-id="r4">[\s\S]*?<div class="pc-chat-item pc-chat-item--user">[\s\S]*?<span class="pc-chat-role">The task · Run #4<\/span>/.test(body), "an earlier message is the chat card, labelled by its run");
  assert.ok(/<span class="pc-chat-role">The task<\/span>/.test(body), "a run the host cannot number is not labelled (never parsed out of the text)");
  assert.ok(body.includes("<h2>Digest 4</h2>"), "earlier answers render with the chat's markdown");
  assert.ok(/data-part="raw"><summary>Raw inputs<\/summary><div class="pc-json[^"]*/.test(body) || /data-part="raw">[\s\S]*?pc-json/.test(body), "raw inputs through the chat's JsonViewer");
  assert.ok(!body.includes("<pre class=\"run_ctx_raw\""), "no hand-made raw dump");
}

console.log("check_automation_markdown: OK");
