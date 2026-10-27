#!/usr/bin/env node
// theme.css and panel_chat.css must parse: every `{` closed, no stray `}`, no unterminated
// comment or string. A merge that swallows the end of a rule (it happened on 2026-10-27:
// `.af-pmp__seg-btn { max-width: 100%;` ran straight into the next banner) compiles nowhere
// — Vite/postcss fails every app with "Unclosed block" — while tsc stays green. Red when the
// balance is off, naming the line where the depth first went wrong.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = [
  path.resolve(here, "..", "src", "theme.css"),
  path.resolve(here, "..", "..", "panel-chat", "src", "panel_chat.css"),
];

function audit(file) {
  const src = readFileSync(file, "utf8");
  let depth = 0, line = 1, i = 0, quote = null, lastBalancedLine = 1;
  const problems = [];
  while (i < src.length) {
    const ch = src[i], next = src[i + 1];
    if (ch === "\n") line++;
    if (quote) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === quote) quote = null;
      i++; continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) { problems.push(`${file}:${line}: unterminated comment`); break; }
      line += (src.slice(i, end).match(/\n/g) || []).length;
      i = end + 2; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) { problems.push(`${file}:${line}: stray "}"`); depth = 0; }
      if (depth === 0) lastBalancedLine = line;
    }
    i++;
  }
  if (quote) problems.push(`${file}: unterminated string`);
  if (depth > 0) problems.push(`${file}: ${depth} unclosed block(s); the balance was last correct at line ${lastBalancedLine} — the rule opened after it never closes`);
  return problems;
}

const problems = files.flatMap(audit);
if (problems.length) {
  console.error("check_css_balanced: FAIL\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`check_css_balanced: OK (${files.map((f) => path.basename(f)).join(", ")} parse: braces, comments and strings balanced)`);
