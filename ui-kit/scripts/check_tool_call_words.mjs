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
check("key highlighted", html.includes('<strong class="af-toolwords__key">“Oct. 28, 2026” pharmaceutical FDA approval</strong>'));
check("group line", html.includes("af-toolwords__group"));
const panel = readFileSync(join(here, "..", "src", "automations", "AutomationPanel.tsx"), "utf8");
check("the wait card uses the list, no JSON.stringify of arguments", panel.includes("<ToolCallWordsList") && !panel.includes("JSON.stringify(c.arguments"));
console.log(failed ? `check_tool_call_words: ${failed} FAILED` : "check_tool_call_words: OK");
process.exit(failed ? 1 : 0);
