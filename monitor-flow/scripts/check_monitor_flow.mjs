#!/usr/bin/env node
/**
 * monitor-flow test rig (backlog 0006 — the package had NO test script).
 *
 * Runs against the COMPILED dist output; DOM-shaped assertions via
 * react-dom/server (existing devDependency — no jsdom, no new deps).
 * build_agent_trace feeds THREE apps (flow, observer, abstractcode/web):
 * its dedup/ordering rules are the load-bearing pure logic named by 0006.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const dist = (f) => join(here, "..", "dist", f);

const { build_agent_trace } = await import(dist("agent_cycles_adapter.js"));
const { JsonViewer } = await import(dist("JsonViewer.js"));

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const count = (html, needle) => html.split(needle).length - 1;
const render = (el, props) => renderToStaticMarkup(React.createElement(el, props));

// ------------------------------------------------------ build_agent_trace
function rec(over = {}) {
  // `effect` shorthand is a string; it must not leak into the spread or it
  // would overwrite the effect OBJECT the adapter reads type from.
  const { effect, ...rest } = over;
  return {
    run_id: "run-1",
    step_id: "",
    node_id: "agent::reason",
    status: "completed",
    effect: { type: effect ?? "llm_call" },
    started_at: "2026-07-18T01:00:00Z",
    ...rest,
  };
}
const item = (cursor, over = {}) => ({ run_id: "run-1", cursor, record: rec(over) });

{
  // Ordering by cursor + interesting-effect filter.
  const t = build_agent_trace(
    [
      item(3, { effect: "tool_calls", step_id: "s3" }),
      item(1, { effect: "llm_call", step_id: "s1" }),
      item(2, { effect: "set_var", step_id: "s2" }), // uninteresting — dropped
      { run_id: "other-run", cursor: 0, record: rec({ step_id: "sX" }) }, // other run — dropped
    ],
    { run_id: "run-1" }
  );
  check("orders by cursor", t.items.length === 2 && t.items[0].id.includes(":1:") && t.items[1].id.includes(":3:"));
  check("uninteresting effects filtered", !t.items.some((x) => x.id.includes(":2:")));
  check("other runs filtered", t.items.every((x) => x.runId === "run-1"));

  // step_id dedup keeps the LATEST cursor (a re-emitted step must not double).
  const d = build_agent_trace(
    [item(1, { step_id: "s1", status: "running" }), item(5, { step_id: "s1", status: "completed" })],
    { run_id: "run-1" }
  );
  check("same step_id dedupes to latest cursor", d.items.length === 1 && d.items[0].status === "completed");

  // step_id-less records pass through (never collapsed into each other).
  const p = build_agent_trace([item(1, { step_id: "" }), item(2, { step_id: "" })], { run_id: "run-1" });
  check("step_id-less records both survive", p.items.length === 2);

  // Node grouping: agent stage suffixes fold to the group id; the dominant
  // LLM node wins the label — but WITHOUT an explicit node_id request,
  // nothing is filtered out (the tool_calls-dropped regression, in-source
  // comment at agent_cycles_adapter.ts:107).
  const g = build_agent_trace(
    [
      item(1, { node_id: "agent::reason", effect: "llm_call", step_id: "a" }),
      item(2, { node_id: "agent::act", effect: "tool_calls", step_id: "b" }),
      item(3, { node_id: "other_node", effect: "tool_calls", step_id: "c" }),
    ],
    { run_id: "run-1" }
  );
  check("dominant node group labels the trace", g.node_id === "agent");
  check("auto-picked label never FILTERS records", g.items.length === 3);

  // Explicit node_id request filters to that group (both stage suffixes fold).
  const f = build_agent_trace(
    [
      item(1, { node_id: "agent::reason", effect: "llm_call", step_id: "a" }),
      item(2, { node_id: "agent::act", effect: "tool_calls", step_id: "b" }),
      item(3, { node_id: "other_node", effect: "tool_calls", step_id: "c" }),
    ],
    { run_id: "run-1", node_id: "agent" }
  );
  check("explicit node_id filters to the group", f.items.length === 2 && f.items.every((x) => x.nodeId.startsWith("agent::")));

  // Suffix folding only applies to known agent stages; other :: ids stay whole.
  const w = build_agent_trace([item(1, { node_id: "ns::custom", effect: "llm_call", step_id: "a" })], { run_id: "run-1" });
  check("non-stage :: ids never fold", w.node_id === "ns::custom");

  const empty = build_agent_trace([], { run_id: "" });
  check("blank run_id returns empty honestly", empty.items.length === 0 && empty.run_id === "");
}

// -------------------------------------------------------- JsonViewer twin
// Same contract pins as panel-chat's viewer (the fork twins shipped the
// identical accepted-but-ignored collapseAfterDepth bug — 0003).
{
  const fixture = { a: { b: { c: { d: { e: 1 } } } }, top: "x" };
  const openCount = (html) => (html.match(/<details[^>]*\bopen\b/g) || []).length;

  const dflt = render(JsonViewer, { value: fixture });
  const zero = render(JsonViewer, { value: fixture, collapseAfterDepth: 0 });
  const all = render(JsonViewer, { value: fixture, collapseAfterDepth: Infinity });
  check("collapseAfterDepth=0 opens nothing", openCount(zero) === 0);
  check("collapseAfterDepth=Infinity opens everything", openCount(all) === count(all, "<details") && openCount(all) > 0);
  check("prop measurably changes fold depth", dflt !== zero && zero !== all);

  // Package-owned toolbar class (0002/0003: "modal-button" was a flow-app
  // class — the toolbar rendered unstyled UA buttons in every other
  // consumer). Class-name stability is a cross-app CSS contract.
  check("toolbar buttons carry the package-owned class", count(dflt, "json-viewer__btn") >= 1);
  check("no flow-app class leaks into the kit render", !dflt.includes("modal-button"));
}

if (failures > 0) {
  console.error(`\nmonitor-flow rig: ${failures} failure(s)`);
  process.exit(1);
}
console.log("monitor-flow rig: OK (trace dedup/ordering/grouping, JsonViewer contract, toolbar class)");
