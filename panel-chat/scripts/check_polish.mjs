#!/usr/bin/env node
/**
 * Release-closing polish (2026-10-28, AbstractUIC 0.8.1), each pinned so removing the fix is red:
 *  A. one duration format across the chat: the tool row and the turn's time chip use
 *     formatDuration ("4.2s", "3m 26s"), never "205.8s" / "215s";
 *  B. a tool call that waited for the person's approval says its time includes that wait
 *     (the replay view's activities[].wait.kind == "tool_approval" -> approvalWait);
 *  C. "Allow once" (the narrowest grant) is the one accent-tinted primary of the approval
 *     card; the broader grants are neutral (panel_chat.css).
 * Run after `npm run build`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const pc = await import(join(here, "..", "dist", "index.js"));
const { formatDuration, replayToolActivities, ToolActivity, ChatMessageCard, foldWorkflowTools } = pc;
let failures = 0;
let checks = 0;
const check = (name, cond, detail) => {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};

// A. one duration format
check("A formatDuration under a minute", formatDuration(4200) === "4.2s", formatDuration(4200));
check("A formatDuration over a minute", formatDuration(205800) === "3m 26s", formatDuration(205800));
const activity = (wait) => ({
  id: "r1:e1",
  run_id: "r1",
  kind: "tool",
  name: "execute_command",
  status: "completed",
  started_at: "2026-10-28T11:28:14.983Z",
  ended_at: "2026-10-28T11:31:40.768Z",
  tool_calls: [{ id: "c1", name: "execute_command", arguments: { command: "ls -la" }, status: "completed", output: { success: true } }],
  ...(wait ? { wait } : {}),
});
const [gated] = replayToolActivities(activity({ kind: "tool_approval", wait_key: "tool_approval:r1:act:x", ended_by: "later_step", outcome: "approved" }));
const [plain] = replayToolActivities(activity(null));
const [timer] = replayToolActivities(activity({ kind: "timer", wait_key: "t" }));
const [cut] = replayToolActivities(activity({ kind: "tool_approval", wait_key: "tool_approval:r1:act:x", ended_by: "terminal" }));
check("B an approval wait cut short by the run's end (no outcome) is not a decision", cut.approvalWait === undefined, cut);
check("B the view's tool_approval wait marks the call", gated.approvalWait === true, gated);
check("B no wait, no mark", plain.approvalWait === undefined, plain);
check("B another wait kind is not an approval", timer.approvalWait === undefined, timer);
const row = (tool) => renderToStaticMarkup(React.createElement(ToolActivity, { tool }));
const gatedHtml = row(gated);
const plainHtml = row(plain);
check("A the tool row reads 3m 26s, not seconds with a decimal", />3m 26s/.test(gatedHtml) && !/205\.8s/.test(gatedHtml), gatedHtml);
check("B the gated row says the time includes the approval", /data-approval-wait=""/.test(gatedHtml) && /3m 26s incl\. approval wait</.test(gatedHtml) && /title="Timed from request to result: includes the wait for your decision\."/.test(gatedHtml), gatedHtml);
check("B a plain row says nothing about approval", !/approval/.test(plainHtml.replace(/Approval needed/g, "")), plainHtml);
// B, ledger-fold fallback (gateways before the view): the same rule from the waiting row.
{
  const state = new Map();
  const call = { name: "execute_command", arguments: { command: "pwd" }, call_id: "c9" };
  const base = { step_id: "s9", node_id: "act", effect: { type: "tool_calls", payload: { tool_calls: [call] } } };
  foldWorkflowTools(state, { runId: "r9", cursor: 1, record: { ...base, status: "waiting", started_at: "2026-10-28T12:00:00Z", result: { wait: { wait_key: "tool_approval:r9:act:x", details: { mode: "approval_required" } } } } });
  const [done] = foldWorkflowTools(state, { runId: "r9", cursor: 2, record: { ...base, status: "completed", started_at: "2026-10-28T12:00:00Z", ended_at: "2026-10-28T12:03:26Z", result: { results: [{ call_id: "c9", success: true, output: "/tmp" }] } } });
  check("B ledger fold: a call that waited on approval is marked too", done && done.approvalWait === true && done.status === "completed", done);
  const plainState = new Map();
  const [plainDone] = foldWorkflowTools(plainState, { runId: "r8", cursor: 1, record: { ...base, status: "completed", started_at: "2026-10-28T12:00:00Z", ended_at: "2026-10-28T12:00:01Z", result: { results: [{ call_id: "c9", success: true }] } } });
  check("B ledger fold: no wait, no mark", plainDone && plainDone.approvalWait === undefined, plainDone);
}
const quiet = console.error;
console.error = (...a) => { if (!String(a[0]).includes("useLayoutEffect does nothing on the server")) quiet(...a); };
const card = renderToStaticMarkup(
  React.createElement(ChatMessageCard, {
    message: { id: "m1", role: "assistant", content: "done", ts: "2026-10-28T11:31:41Z", statistics: { llmCalls: 2, toolCalls: 1, changedFiles: [], totalTokens: 6224, durationMs: 215000 } },
  }),
);
console.error = quiet;
check("A the turn's time chip uses the same format", />3m 35s</.test(card) && !/>215s</.test(card), card.slice(0, 2000));

// C. approval hierarchy in the stylesheet
const css = readFileSync(join(here, "..", "src", "panel_chat.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (selector) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").map((s) => s.trim()).includes(selector))
    .map((m) => m[2])
    .join(";");
const primary = rules('.pc-workflow-interaction__buttons > [data-decision="approve"]');
check("C Allow once is the accent-tinted primary", /background:\s*color-mix\(in srgb, var\(--accent\) 22%/.test(primary) && /border:\s*1px solid color-mix\(in srgb, var\(--accent\) 55%/.test(primary), primary);
const broad = rules(".pc-workflow-interaction__allow-session") + rules(".pc-workflow-interaction__allow-all");
check("C the broader grants are not accent-tinted", broad && !/accent/.test(broad), broad);

console.log(failures ? `check_polish: ${failures} of ${checks} failed` : `check_polish: OK (${checks} checks: one duration format, approval wait labeled, Allow once primary)`);
if (failures) process.exit(1);
