#!/usr/bin/env node
/**
 * The shipped stylesheets parse: every block is closed, no stray closing brace, no unterminated
 * comment or string. A merge of two append-only blocks once left `.af-pmp__seg-btn {` open on main
 * (f637dd4): the kit's own checks stayed green while every app's Vite/PostCSS build failed with
 * "Unclosed block". Dependency-free scanner (comments and strings skipped).
 *
 *   node scripts/check_css_syntax.mjs [file.css ...]   (default: the kit's and panel-chat's CSS)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [join(here, "..", "src", "theme.css"), join(here, "..", "..", "panel-chat", "src", "panel_chat.css")];

export function cssSyntaxErrors(text) {
  const errors = [];
  const open = [];
  let line = 1;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\n") line += 1;
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) {
        errors.push(`unterminated comment from line ${line}`);
        break;
      }
      for (let j = i; j < end; j += 1) if (text[j] === "\n") line += 1;
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      if (text[j] !== c) errors.push(`unterminated string at line ${line}`);
      i = j;
      continue;
    }
    if (c === "{") open.push(line);
    else if (c === "}") {
      if (!open.length) errors.push(`stray "}" at line ${line}`);
      else open.pop();
    }
  }
  for (const at of open) errors.push(`block opened at line ${at} is never closed`);
  return errors;
}

let failed = 0;
for (const file of files) {
  const errors = cssSyntaxErrors(readFileSync(file, "utf8"));
  if (errors.length) {
    failed += 1;
    console.error(`check_css_syntax: ${file}\n  ${errors.slice(0, 5).join("\n  ")}`);
  }
}
if (failed) process.exit(1);
console.log(`check_css_syntax: OK (${files.length} stylesheets)`);
