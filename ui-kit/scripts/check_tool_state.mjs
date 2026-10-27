#!/usr/bin/env node
/**
 * ToolPolicyEditor tool state (R13.4): a server-reported `state` on a tool is a badge on that
 * tool's card, its label verbatim, the server's sentence in the kit tooltip (data-af-tip), its
 * tone a class; a tool without `state` shows none (the kit never derives one), and a state
 * without a label is dropped.
 *
 * renderToStaticMarkup over the compiled dist (no jsdom), like check_state_toggles.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const css = readFileSync(join(root, "src", "theme.css"), "utf8");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const SENTENCE = "Every command a run starts is confined by the operating system to that run's workspaces.";
const tools = [
  { name: "execute_command", description: "Run a shell command.", state: { label: "Sandboxed to this run's workspaces", tooltip: SENTENCE, tone: "ok" } },
  { name: "shell_exec", description: "Shell session.", state: { label: "Refused: no command sandbox on this host", tooltip: "Commands are refused.", tone: "warn" } },
  { name: "local_helper_start", description: "Helper.", state: { label: "Not sandboxed: unsandboxed commands allowed (flag)", tone: "danger" } },
  { name: "read_file", description: "Read a file." },
  { name: "write_file", description: "Write a file.", state: { label: "  ", tooltip: "no label" } },
];
const html = renderToStaticMarkup(React.createElement(kit.ToolPolicyEditor, { tools, value: { mode: "all", selected: [], approval: {} }, onChange() {} }));

function row(name) {
  const rows = html.split(/<div class="af-tool-row(?: is-enabled)?">/);
  return rows.find((r) => r.includes(`aria-label="${name}"`)) || "";
}

const exec = row("execute_command");
check("state badge on the tool's own card", exec.includes('data-tool-state="execute_command"'), exec.slice(0, 400));
check("label verbatim", exec.includes(">Sandboxed to this run&#x27;s workspaces</span>"));
check("server sentence in the kit tooltip", exec.includes(`data-af-tip="Every command a run starts is confined by the operating system to that run&#x27;s workspaces."`));
check("ok tone class", /class="af-tool-row__state is-ok"/.test(exec));
check("focusable with the sentence for keyboard/AT", exec.includes('tabindex="0"') && exec.includes('aria-label="Sandboxed to this run&#x27;s workspaces. Every command'));
check("warn tone class", /class="af-tool-row__state is-warn"/.test(row("shell_exec")));
const helper = row("local_helper_start");
check("danger tone class", /class="af-tool-row__state is-danger"/.test(helper));
check("no tooltip when the server gave no sentence", !helper.includes("data-af-tip") && !/af-tool-row__state[^>]*tabindex/.test(helper));
check("a tool without state shows none", !row("read_file").includes("af-tool-row__state"));
check("a blank label is dropped", !row("write_file").includes("af-tool-row__state"));
check("exactly three badges", (html.match(/data-tool-state=/g) || []).length === 3);
check("theme.css styles the badge and its three tones", [".af-tool-row__state {", ".af-tool-row__state.is-ok", ".af-tool-row__state.is-warn", ".af-tool-row__state.is-danger"].every((s) => css.includes(s)));
check("badge wraps inside a narrow card", /\.af-tool-row__state \{[^}]*overflow-wrap:\s*anywhere/.test(css) && /\.af-tool-row__state \{[^}]*max-width:\s*100%/.test(css));

// ui-primitives (tools-models): the served `approval_default` is the server truth this editor reads
// (routes/gateway.py:15615-15640); `default_approval` stays an alias; the kit table is only the
// LABELED fallback ("Kit default"), rendered on the rows it decides and nowhere else.
const served = renderToStaticMarkup(React.createElement(kit.ToolPolicyEditor, {
  tools: [
    { name: "write_file", approval_default: "auto" },
    { name: "read_file", approval_default: "ask" },
    { name: "edit_file", default_approval: "approve" },
    { name: "list_files" },
  ],
  value: { mode: "all", selected: [], approval: {} },
  onChange() {},
}));
function prow(name) {
  return served.split(/<div class="af-tool-row(?: is-enabled)?">/).find((r) => r.includes(`aria-label="${name}"`)) || "";
}
check("served approval_default auto beats the kit table (write_file → Approve)", /<option value="approve" selected="">/.test(prow("write_file")), prow("write_file").slice(-300));
check("served approval_default ask beats the kit table (read_file → Ask)", /<option value="ask" selected="">/.test(prow("read_file")));
check("default_approval alias still read", /<option value="approve" selected="">/.test(prow("edit_file")));
check("served rows carry no fallback label", !/data-approval-fallback="(write_file|read_file|edit_file)"/.test(served));
check("a row the table decides is labeled Kit default", prow("list_files").includes('data-approval-fallback="list_files"') && prow("list_files").includes("Kit default"));

if (failures) {
  console.error(`check_tool_state: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_tool_state: OK (${checks} checks)`);
