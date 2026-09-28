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
const html = renderToStaticMarkup(React.createElement(AutomationPanelWithMarkdown, base));
const pair2 = html.split('<li class="af-auto-occ ').find((c) => c.includes('data-index="2"'));
assert.ok(pair2, "occurrence #2 rendered");

// Heading, table and fenced JSON become elements; no literal markdown survives.
assert.ok(pair2.includes("<h2>2 emails need a reply today</h2>"), "heading element");
assert.ok(/<table class="pc-md_table"><thead><tr><th>From<\/th><th>Subject<\/th><th>Due<\/th><\/tr><\/thead><tbody><tr><td>Clara \(accountant\)<\/td>/.test(pair2), "table element");
assert.ok(pair2.includes('<pre class="pc-md_pre"><code class="language-json">{&quot;urgent&quot;: 2, &quot;newsletters&quot;: 1}</code></pre>'), "fenced JSON as a code block");
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
assert.ok(!/<script/i.test(bad), "no script element");
assert.ok(!/<[a-z][^>]*\son[a-z]+=/i.test(bad) && bad.includes("&lt;img src=x onerror=alert(1)&gt;"), "no event-handler attribute (raw HTML shown as text)");
assert.ok(!/href="javascript:/i.test(bad), "no javascript: link");
assert.ok(!bad.includes('src="https://evil.example') && bad.includes('href="https://evil.example/p.png"'), "remote image is a link, never fetched");
assert.ok(bad.includes('href="https://evil.example/trigger.png"'), "the trigger turn (a user-role card) also shows remote images as links");

// The spread helper and the wrapper produce the same markup.
const spread = renderToStaticMarkup(React.createElement(kit.AutomationPanel, { ...base, ...automationRenderers }));
assert.equal(spread, html, "<AutomationPanel {...automationRenderers}> == <AutomationPanelWithMarkdown>");

console.log("check_automation_markdown: OK");
