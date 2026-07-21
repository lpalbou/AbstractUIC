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

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const count = (html, needle) => html.split(needle).length - 1;
const render = (el, props) => renderToStaticMarkup(React.createElement(el, props));

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
}

if (failures > 0) {
  console.error(`\npanel-chat rig: ${failures} failure(s)`);
  process.exit(1);
}
console.log("panel-chat rig: OK (markdown tables/lists/fences, JsonViewer collapseAfterDepth contract, message card guards)");
