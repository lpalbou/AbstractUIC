#!/usr/bin/env node
/**
 * The command sandbox of a tool call (R13.4), on a seeded ledger (fixtures/sandbox_ledger.json:
 * a real execute_command record of a scratch gateway, the runtime's fail-closed refusal, and a
 * read_file without a sandbox):
 * - toolSandbox(): one line from the ledger's own `label` — "Sandbox: macOS sandbox-exec · 4
 *   workspaces enforced" / "Sandbox: none — refused" — and the enforced paths;
 * - workflowEvidence() carries it on the tool activity;
 * - ToolActivity shows the line once in the call's detail, nothing for a call without evidence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toolSandbox, sandboxEvidence, ToolSandboxLine } from "../dist/sandbox_line.js";
import { workflowEvidence } from "../dist/workflow_evidence.js";
import { ToolActivity, ToolActivityGroup } from "../dist/tool_activity.js";
import * as index from "../dist/index.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/sandbox_ledger.json", import.meta.url), "utf8"));
const [sandboxedRec, refusedRec, plainRec] = fixture.records;
const resultRow = (rec) => rec.result.results[0];

// 1. The formatter.
const sb = toolSandbox(resultRow(sandboxedRec));
assert.equal(sb.state, "sandboxed");
assert.equal(sb.line, "Sandbox: macOS sandbox-exec · 4 workspaces enforced");
assert.deepEqual(
  sb.rows.map((r) => [r.path, r.mode, Boolean(r.private)]),
  [
    ["/srv/gateway/data/workspaces/e04124f4ec82", "Read & write", true],
    ["/Users/ada/home/work/project", "Read & write", false],
    ["/Users/ada", "Read-only", false],
    ["/Users/ada/home", "Refused", false],
  ],
);
assert.equal(sb.builtinRefused, 12);
// The same evidence read from the output object itself.
assert.equal(toolSandbox(resultRow(sandboxedRec).output).line, sb.line);
assert.equal(sandboxEvidence(resultRow(sandboxedRec)).kind, "macos-sandbox-exec");

const refused = toolSandbox(resultRow(refusedRec));
assert.equal(refused.state, "refused");
assert.equal(refused.line, "Sandbox: none — refused");
assert.deepEqual(refused.rows, [], "a refused command enforced nothing: no paths");

assert.equal(toolSandbox(resultRow(plainRec)), null, "no evidence, no line");
assert.equal(toolSandbox({ output: { sandbox: { label: "x" } } }), null, "evidence without a kind is not evidence");
assert.equal(toolSandbox(null), null);

const unsandboxed = toolSandbox({ output: { sandbox: { kind: "unsandboxed", label: "none (unsandboxed commands allowed by the host)", private_workspace: "/w" } } });
assert.equal(unsandboxed.state, "unsandboxed");
assert.equal(unsandboxed.line, "Sandbox: none (unsandboxed commands allowed by the host)");
assert.deepEqual(unsandboxed.rows, []);

const one = toolSandbox({ output: { sandbox: { kind: "linux-bwrap", label: "Linux bubblewrap", private_workspace: "/w", allowed: [], refused: [] } } });
assert.equal(one.line, "Sandbox: Linux bubblewrap · 1 workspace enforced", "singular");

// The label is the ledger's: a kind the client never heard of still shows its label.
assert.equal(toolSandbox({ output: { sandbox: { kind: "future-kind", label: "Future sandbox", private_workspace: "/w" } } }).line, "Sandbox: Future sandbox · 1 workspace enforced");

// 2. workflowEvidence carries it.
const records = fixture.records.map((record, i) => ({ runId: "run-1", cursor: i + 1, record }));
const tools = workflowEvidence(records).tools;
const byName = Object.fromEntries(tools.map((t) => [`${t.name}:${t.status}`, t]));
assert.equal(byName["execute_command:completed"].sandbox.line, sb.line);
assert.equal(byName["execute_command:failed"].sandbox.line, "Sandbox: none — refused");
assert.equal(byName["read_file:completed"].sandbox, undefined);

// 3. ToolActivity renders the line in the detail, once.
const html = renderToStaticMarkup(React.createElement(ToolActivityGroup, { tools }));
const count = (s, sub) => s.split(sub).length - 1;
assert.equal(count(html, "Sandbox: macOS sandbox-exec · 4 workspaces enforced"), 1, html);
assert.equal(count(html, "Sandbox: none — refused"), 1);
assert.equal(count(html, 'class="pc-tool-sandbox '), 2, "two lines: the two commands, not read_file");
const execHtml = renderToStaticMarkup(React.createElement(ToolActivity, { tool: byName["execute_command:completed"] }));
const detail = execHtml.slice(execHtml.indexOf('class="pc-tool-activity__detail"'));
assert.ok(detail.includes("Sandbox: macOS sandbox-exec · 4 workspaces enforced"), "the line sits in the call's detail");
assert.ok(detail.indexOf("pc-tool-sandbox") < detail.indexOf("Parameters"), "first in the detail");
for (const path of ["/Users/ada/home/work/project", "/Users/ada/home", "/srv/gateway/data/workspaces/e04124f4ec82"]) assert.ok(detail.includes(`<code>${path}</code>`), path);
assert.ok(detail.includes("12 built-in protected folders refused"));
assert.ok(detail.includes("Read &amp; write · this run&#x27;s folder"));
const plainHtml = renderToStaticMarkup(React.createElement(ToolActivity, { tool: byName["read_file:completed"] }));
assert.ok(!plainHtml.includes("pc-tool-sandbox"), "no line on a tool without evidence");
const refusedHtml = renderToStaticMarkup(React.createElement(ToolSandboxLine, { sandbox: refused }));
assert.ok(refusedHtml.includes('class="pc-tool-sandbox is-refused"') && !refusedHtml.includes("<ul"), refusedHtml);

// 4. Exported for the apps (Observer's run view uses the same formatter).
assert.equal(typeof index.toolSandbox, "function");
assert.equal(typeof index.ToolSandboxLine, "function");

// 5. Styles.
const css = readFileSync(new URL("../src/panel_chat.css", import.meta.url), "utf8");
for (const sel of [".pc-tool-sandbox {", ".pc-tool-sandbox__line", ".pc-tool-sandbox__rows code"]) assert.ok(css.includes(sel), sel);
assert.ok(/\.pc-tool-sandbox__rows code \{[^}]*overflow-wrap:\s*anywhere/.test(css), "long paths wrap");

console.log("check_tool_sandbox: OK");
