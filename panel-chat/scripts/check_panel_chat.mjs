#!/usr/bin/env node
/**
 * panel-chat test rig (backlog 0006 — the package had NO test script; three
 * of five packages were structurally untestable from the root).
 *
 * Runs against the COMPILED dist output (the artifact consumers import), so
 * `npm test` builds first — the check_matrix_core precedent. DOM-shaped
 * assertions use react-dom/server's renderToStaticMarkup (react/react-dom
 * are existing devDependencies; no new dependency, no jsdom): static markup
 * pins structure, classes and fold state — interactions stay out of scope
 * by design (effects never run server-side).
 *
 * These are examples/guidelines for the general-purpose logic — the
 * components must hold for any consumer payload, not just these fixtures.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const dist = (f) => join(here, "..", "dist", f);

const { Markdown } = await import(dist("markdown.js"));
const { JsonViewer } = await import(dist("json_viewer.js"));
const { ChatMessageCard } = await import(dist("chat_message_card.js"));
const { StatChip, StatDetailPanel, statDetail } = await import(dist("stat_detail.js"));
const { workflowEvidence } = await import(dist("workflow_evidence.js"));
const { readFileSync } = await import("node:fs");
const { WorkflowChat } = await import(dist("workflow_chat.js"));
const { WorkflowInteractionPanel } = await import(dist("workflow_interaction.js"));
const { submitWorkflowInteraction } = await import(dist("workflow_interaction_core.js"));
const packageApi = await import(dist("index.js"));

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const count = (html, needle) => html.split(needle).length - 1;
const render = (el, props) => renderToStaticMarkup(React.createElement(el, props));

// --------------------------------------------------------- WorkflowChat
// Server rendering cannot exercise callbacks, but it pins the public shape:
// controlled draft, observer mode, transcript placement, and all three typed
// wait presentations must remain renderable in the compiled package.
{
  const base = {
    messages: [{ id: "m1", role: "assistant", content: "Ready." }],
    draft: "keep this draft",
    onDraftChange: () => {},
    onSend: async () => {},
    onCancel: async () => {},
    onAttach: async () => {},
  };
  const chat = render(WorkflowChat, { ...base, busy: true, sendWhileBusy: true, sendLabel: "Queue", header: "Run 42", footer: "Connected" });
  check("WorkflowChat renders its controlled draft", chat.includes("keep this draft"));
  check("WorkflowChat renders the stop control while busy", chat.includes("Stop"));
  check("WorkflowChat renders attachment control", chat.includes("Attach"));
  check("WorkflowChat permits host queue wording while busy", chat.includes("Queue") && chat.includes("Stop"));
  const sanitized = render(WorkflowChat, {
    ...base,
    renderMarkdown: (text) => React.createElement("span", { className: "sanitized-markdown" }, `safe:${text}`),
  });
  check("WorkflowChat delegates markdown rendering to ChatThread", sanitized.includes("sanitized-markdown") && sanitized.includes("safe:Ready."));
  const structured = render(WorkflowChat, {
    ...base,
    messages: [{ id: "structured-final", role: "assistant", content: JSON.stringify({ kind: "structured-output", ok: true }, null, 2) }],
  });
  check("WorkflowChat renders structured final output as a JSON viewer", structured.includes("pc-json-viewer") && structured.includes("structured-output"));
  check("WorkflowChat exposes scoped root", chat.includes("pc-workflow-chat"));
  check("WorkflowChat gives the composer an accessible name", chat.includes('aria-label="Message"'));
  check("workflow public API exports controller and hook", typeof packageApi.WorkflowSessionController === "function" && typeof packageApi.useWorkflowSession === "function");

  const ask = render(WorkflowInteractionPanel, {
    interaction: { kind: "ask-user", id: "ask-1", prompt: "Choose", choices: [{ id: "yes", label: "Yes" }], onSubmit: async () => {} },
  });
  const approval = render(WorkflowInteractionPanel, {
    interaction: { kind: "tool-approval", id: "tool-1", toolName: "write_file", onApprove: async () => {}, onDeny: async () => {} },
  });
  const wait = render(WorkflowInteractionPanel, {
    interaction: { kind: "event-wait", id: "wait-1", prompt: "Provide payload", onSend: async () => {} },
  });
  check("ask-user interaction renders choices", ask.includes("Yes") && ask.includes("Submit"));
  check("tool approval interaction renders both decisions", approval.includes("Approve") && approval.includes("Deny"));
  check("event wait interaction renders explicit send", wait.includes("Send event"));

  // A retry uses the snapshot taken when the choice was clicked. It must not
  // borrow whatever text happens to be in a free-text field after a failure.
  let retriedChoice = "";
  await submitWorkflowInteraction(
    { kind: "ask-user", id: "retry-choice", prompt: "Choose", onSubmit: async (answer) => { retriedChoice = answer; } },
    { kind: "choice", answer: "original-choice" }
  );
  check("choice retry preserves its original choice id", retriedChoice === "original-choice", retriedChoice);
}

// ------------------------------------------------------------- markdown
// Table pins migrated IN from continuum's suite (owner-review 2026-07-17,
// dm; they lived at abstractcontinuum src/ui/markdown_render.test.tsx only
// because this rig did not exist yet).
{
  const blank = render(Markdown, {
    text: "intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |",
  });
  check("blank-line-preceded table renders", blank.includes("pc-md_table"), blank.slice(0, 200));
  check("blank-line table has 2 body rows", count(blank, "<td") === 4);

  // The dm 67 defect: a table whose header follows prose with NO blank line
  // (the standard assistant status-table emission) must interrupt the
  // paragraph — it rendered as piped prose before.
  const interrupt = render(Markdown, {
    text: "DONE — summary:\n| # | Item | State |\n|---|---|---|\n| 1 | x | ok |\n| 2 | y | ok |",
  });
  check("table INTERRUPTS a paragraph (no blank line)", interrupt.includes("pc-md_table"));
  check("interrupting table has 3 header cells", count(interrupt, "<th>") === 3  /* "<th" also matches <thead> */);
  check("interrupting table has 2 body rows", count(interrupt, "<tr") === 3);
  check("intro line stays prose (not swallowed)", interrupt.includes("DONE — summary:") && interrupt.includes("pc-md_p"));

  const prose = render(Markdown, { text: "either a | b works\nand more prose\nno separator follows" });
  check("pipe mid-prose without separator stays a paragraph", !prose.includes("<table"));

  // The 2026-07-14 list-interrupt rule the table fix mirrored.
  const list = render(Markdown, { text: "intro line:\n- alpha\n- beta" });
  check("list interrupts a paragraph", count(list, "<li") === 2);
  check("bullets not swallowed as '- a<br/>' prose", !list.includes("- alpha"));

  // Fence handling stays block-shaped.
  const fence = render(Markdown, { text: "before\n\n```js\nconst x = 1;\n```" });
  check("code fence renders a pre block", fence.includes("<pre") && fence.includes("const x = 1;"));
}

// ---------------------------------------------------- JsonViewer contract
// collapseAfterDepth was accepted-but-IGNORED until 2026-07-11 (adversary
// find F4: observer passed 4 through ChatThread, silently swallowed). The
// contract test is the measurable-fold-difference class: the shipped bug
// made these renders IDENTICAL.
{
  const fixture = { a: { b: { c: { d: { e: 1 } } } }, top: "x" };

  const dflt = render(JsonViewer, { value: fixture });
  const zero = render(JsonViewer, { value: fixture, collapseAfterDepth: 0 });
  const all = render(JsonViewer, { value: fixture, collapseAfterDepth: Infinity });

  const openCount = (html) => (html.match(/<details[^>]*\bopen\b/g) || []).length;
  check("default folds at depth 3 (some open, some closed)", openCount(dflt) > 0 && openCount(dflt) < count(dflt, "<details"));
  check("collapseAfterDepth=0 opens nothing", openCount(zero) === 0);
  check("collapseAfterDepth=Infinity opens everything", openCount(all) === count(all, "<details") && openCount(all) > 0);
  check("prop measurably changes fold depth (the shipped bug class)", dflt !== zero && zero !== all);

  // Junk values fall back to the default depth, never crash or leak NaN.
  const junk = render(JsonViewer, { value: fixture, collapseAfterDepth: Number.NaN });
  const negative = render(JsonViewer, { value: fixture, collapseAfterDepth: -1 });
  check("NaN collapseAfterDepth falls back to default", junk === dflt);
  check("negative collapseAfterDepth falls back to default", negative === dflt);

  // A string value that IS serialized JSON renders as its parsed tree.
  const parsed = render(JsonViewer, { value: '{"k": [1, 2]}' });
  check("serialized-JSON string renders as tree", parsed.includes("pc-json-token") && count(parsed, "<details") >= 1);

  check("showCopy=false hides the copy button", !render(JsonViewer, { value: fixture, showCopy: false }).includes("pc-json-viewer__copy"));
}

// ------------------------------------------------------- ChatMessageCard
{
  const bad_ts = render(ChatMessageCard, {
    message: { role: "assistant", content: "hello", ts: "not-a-date" },
  });
  check("malformed timestamp never renders 'Invalid Date'", !bad_ts.includes("Invalid Date"));
  check("card still renders content with a bad timestamp", bad_ts.includes("hello"));

  const good_ts = render(ChatMessageCard, {
    message: { role: "assistant", content: "hello", ts: "2026-07-17T12:34:00Z" },
  });
  check("valid timestamp renders a time label", /\d{1,2}:\d{2}/.test(good_ts));

  // Speaker identity over role literal (operator fix 2026-07-13).
  const titled = render(ChatMessageCard, {
    message: { role: "assistant", content: "hi", title: "Ephemeral" },
  });
  check("message.title wins over the role word", titled.includes("Ephemeral"));

  // Duration chip under a cache restore (2026-09-22): the provider rate counts
  // restored tokens, so the tooltip must show the rate over the tokens that
  // were actually computed, next to the restore, and never the bare 1,813.
  // 0.1.11: the chip detail is a STRUCTURED panel (StatDetailPanel), not a
  // native title, so these assertions render the panel for the time chip.
  const timePanel = (statistics) =>
    render(StatDetailPanel, { detail: statDetail("time", statistics) });
  const restoredStats = {
    llmCalls: 1, toolCalls: 0, changedFiles: [], durationMs: 16000,
    genTimeMs: 8830.6, timedCalls: 1, measuredSpeedCalls: 1,
    inputTokens: 5899, outputTokens: 184, totalTokens: 6083,
    prefillMs: 3253, promptTokensPerSecond: 1813.33,
    prefillNewTokens: 1803, prefillNewTokensPerSecond: 554.3,
    decodeMs: 4910, generationTokensPerSecond: 37.47,
    cachedTokens: 4096, fedTokens: 1803, measuredCacheCalls: 1, cacheOutcomes: ["hit_restore"],
  };
  const restored = timePanel(restoredStats);
  check("time detail reports the rate over NEW tokens", restored.includes("1,803 new tok at 554 tok/s"), restored);
  check("time detail names the restored tokens", restored.includes("4,096 tok from cache"));
  check("time detail never shows the whole-prompt rate as a speed", !restored.includes("1,813 tok/s"));
  const unsplit = timePanel({
    llmCalls: 1, toolCalls: 0, changedFiles: [], durationMs: 16000, measuredSpeedCalls: 1,
    prefillMs: 3253, promptTokensPerSecond: 1813.33,
  });
  check("without a cache split the provider rate is labelled for what it counts",
    unsplit.includes("at 1,813 tok/s") && unsplit.includes("provider rate over all prompt tokens, restored included"));

  // The card renders detail chips (keyboard-focusable, described by the panel
  // when open) and no native one-line title competing with the panel.
  const card = render(ChatMessageCard, { message: { role: "assistant", content: "done", statistics: restoredStats } });
  check("detail chips are focusable", count(card, 'tabindex="0"') === 3, card);
  check("detail chips drop the native title", !/pc-chat-stat[^>]*title=/.test(card));
  check("detail chips carry an accessible name", card.includes('aria-label="6,083 tokens — tokens details"'));
  check("detail panel is closed until hover/focus", !card.includes('role="tooltip"'));

  // Real ledger of the operator's screenshot turn (8d2ce83f): every section.
  const real = workflowEvidence(JSON.parse(readFileSync(join(here, "fixtures", "run_8d2ce83f.json"), "utf8"))).statistics;
  const tokens = render(StatDetailPanel, { detail: statDetail("tokens", real) });
  for (const needle of ["Reused from cache", "5,588 (93%)", "Newly processed", "hit_restore", "mlx_vlm_apc", "Prompt size", "Qwen3.8-Flash-Next-oQ4e-mtp · mlx", "From the run ledger"])
    check(`tokens detail shows ${needle}`, tokens.includes(needle));
  const time = render(StatDetailPanel, { detail: statDetail("time", real) });
  for (const needle of ["15.9s", "Prefill (TTFT)", "2.1s · 408 new tok at 190 tok/s", "12.4s · 423 tok at 34 tok/s", "Orchestration", "1.4s", "54% · 220 of 408 drafted", "2 tok/round · 204 rounds"])
    check(`time detail shows ${needle}`, time.includes(needle), time);
  const tools = render(StatDetailPanel, { detail: statDetail("tools", real) });
  check("tools detail says none (not 0 failures)", tools.includes("Tools called") && !tools.includes("Failed"));
  // Absent metrics read "not reported", styled as absent — never 0.
  const bare = render(StatDetailPanel, { detail: statDetail("time", { llmCalls: 1, toolCalls: 0, changedFiles: [], durationMs: 1000 }) });
  check("absent prefill reads not reported", bare.includes("pc-stat-detail-value--absent") && bare.includes("not reported"));
  check("absent speculation section is omitted, not zeroed", !bare.includes("Speculation"));
  // Multi-call turn: per-call tables and the tool breakdown.
  const multi = workflowEvidence(JSON.parse(readFileSync(join(here, "fixtures", "run_081d8daa.json"), "utf8"))).statistics;
  const multiTokens = render(StatDetailPanel, { detail: statDetail("tokens", multi) });
  check("multi-call tokens detail has the per-call table", count(multiTokens, "<tr>") === 5 && multiTokens.includes("7,016 → 15,497 tokens"));
  const multiTools = render(StatDetailPanel, { detail: statDetail("tools", multi) });
  check("tools detail tallies failure classes", multiTools.includes("empty_content ×2 · bot_challenge ×2"));
  check("tools detail names the slowest batch", multiTools.includes("2.8s · fetch_url ×5"));
  check("tools detail flags approval wait", multiTools.includes("includes waiting for your approval"));
  // The interactive chip itself, opened (server render: no portal target).
  const open = render(StatChip, { label: "16s", detail: statDetail("time", real), defaultOpen: true });
  check("open StatChip renders the panel as a described tooltip",
    open.includes('role="tooltip"') && /aria-describedby="(pc-stat-[^"]+)"/.test(open) && open.includes(`id="${open.match(/aria-describedby="([^"]+)"/)?.[1]}"`));
}

if (failures > 0) {
  console.error(`\npanel-chat rig: ${failures} failure(s)`);
  process.exit(1);
}
console.log("panel-chat rig: OK (markdown tables/lists/fences, JsonViewer collapseAfterDepth contract, message card guards)");
