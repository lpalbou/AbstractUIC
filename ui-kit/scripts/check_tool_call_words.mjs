// Tool calls in words: the shared cases render exactly, the unknown tool falls back to readable
// lines, no braces anywhere, the group line counts, and the wait card uses the list.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const spec = JSON.parse(readFileSync(join(here, "..", "src", "tool_call_words.cases.json"), "utf8"));
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) { failed += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); } };

for (const c of spec.cases) {
  const w = kit.describeToolCall(c.call);
  check(`sentence: ${c.call.name}`, w.sentence === c.sentence, `${w.sentence} vs ${c.sentence}`);
  if (c.fallback) check(`fallback: ${c.call.name}`, JSON.stringify(w.fallback) === JSON.stringify(c.fallback), JSON.stringify(w.fallback));
  else check(`template: ${c.call.name}`, w.fallback === null);
}
check("group", kit.groupToolCalls(spec.group.calls) === spec.group.text, kit.groupToolCalls(spec.group.calls));
const html = renderToStaticMarkup(React.createElement(kit.ToolCallWordsList, { calls: spec.cases.map((c) => c.call) }));
check("no braces in the list", !/[{}]/.test(html.replace(/<[^>]*>/g, "")), html);
check("verb chips", (html.match(/af-toolwords__verb/g) || []).length === spec.cases.length);
// Operator ruling 2026-10-29: plain text after the chip (no bold on parameters), no count line, one
// bullet per call on one line with the whole sentence on its tooltip, a bold heading when given.
check("no bold on the parameters, no count line", !html.includes("<strong") && !html.includes("af-toolwords__group") && html.includes("“Oct. 28, 2026” pharmaceutical FDA approval"));
check("one line per call: the whole sentence on its tooltip", (html.match(/<li class="af-toolwords__call"[^>]*title="/g) || []).length === spec.cases.length);
const headed = renderToStaticMarkup(React.createElement(kit.ToolCallWordsList, { calls: spec.cases.slice(0, 2).map((c) => c.call), heading: "The assistant wants to use these tools:", headingId: "h1" }));
check("the heading is the only bold", headed.includes('<p class="af-toolwords__heading" id="h1"><strong>The assistant wants to use these tools:</strong></p>') && (headed.match(/<strong/g) || []).length === 1, headed);
const theme = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
check("bullets cut with an ellipsis on one line", /\.af-toolwords__call \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis/.test(theme) && /\.af-toolwords__list \{[^}]*list-style: disc/.test(theme));
check("toolCallLine: fallback pairs on one line", kit.toolCallLine({ name: "make_report", arguments: { report_title: "Q3", pages: 3 } }) === "Report title: Q3 · Pages: 3");
const panel = readFileSync(join(here, "..", "src", "automations", "AutomationPanel.tsx"), "utf8");
check("the wait card uses the list, no JSON.stringify of arguments", panel.includes("<ToolCallWordsList") && !panel.includes("JSON.stringify(c.arguments"));
// Tool RESULTS in words (operator QA 2026-10-29: "Recent session turns" printed raw result JSON).
const skim = JSON.stringify({ success: true, query: "AI news", results: Array.from({ length: 10 }, (_, i) => ({ title: `Story ${i}`, url: `https://www.example.org/news/2026/story-${i}`, snippet: "…" })), counts: { returned: 10 } });
const r1 = kit.describeToolResult({ name: "skim_websearch", result: skim });
check("result: search count", r1.sentence === "Web search returned 10 results", r1.sentence);
check("result: first titles", JSON.stringify(r1.items) === JSON.stringify(["Story 0 · example.org/news/…/story-0", "Story 1 · example.org/news/…/story-1", "Story 2 · example.org/news/…/story-2"]), JSON.stringify(r1.items));
const r2 = kit.describeToolResult({ name: "fetch_url", result: { error: "timed out after 30 s" } });
check("result: failure", r2.failed && r2.sentence === "Page fetch failed: timed out after 30 s", r2.sentence);
const r3 = kit.describeToolResult({ name: "skim_url", result: { title: "FDA meeting", url: "https://www.fda.gov/news-events/a/b", content: "x".repeat(1204) } });
check("result: a page", r3.sentence === "Page skim returned “FDA meeting” (fda.gov/news-events/…/b), 1,204 characters", r3.sentence);
const r4 = kit.describeToolResult({ name: "make_report", result: { report_id: "r-1", pages: 3, sections: [1, 2] } });
check("result: unknown tool, readable fields", r4.sentence === "Make report returned 3 fields" && JSON.stringify(r4.items) === JSON.stringify(["Report id: r-1", "Pages: 3"]), JSON.stringify(r4));
const r5 = kit.describeToolResult({ result: "plain words" });
check("result: plain text", r5.sentence === "The tool returned 11 characters of text", r5.sentence);
const rhtml = renderToStaticMarkup(React.createElement(kit.ToolResultWordsView, { name: "skim_websearch", result: skim }));
check("result view: no braces", !/[{}]/.test(rhtml.replace(/<[^>]*>/g, "")) && rhtml.includes('<p class="af-toolresult__sentence">Web search returned 10 results</p>'), rhtml);
console.log(failed ? `check_tool_call_words: ${failed} FAILED` : "check_tool_call_words: OK");
process.exit(failed ? 1 : 0);
