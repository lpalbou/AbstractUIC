#!/usr/bin/env node
/**
 * Generate `transcript.css` — the standalone dialogue-transcript slice
 * (backlog 0028; gateway card-015 P2-7).
 *
 * WHY GENERATED, NEVER FORKED: the `.pc-chat-item` family is consumed three
 * ways (package import by entity/flow, vendored copy by the gateway console,
 * and single-file surfaces to come). A hand-maintained second file would rot
 * silently; this script EXTRACTS the marked region of panel_chat.css
 * verbatim and prepends the machine-derived token contract, so the slice
 * cannot drift from the source recipe — the console_theme_sync pattern
 * (generated copy + drift pin).
 *
 * Modes:
 *   node scripts/extract_transcript_slice.mjs          # (re)generate
 *   node scripts/extract_transcript_slice.mjs --check  # drift pin for the gate
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src_path = join(here, "..", "src", "panel_chat.css");
const out_path = join(here, "..", "transcript.css");

const START = "/* @transcript-slice:start";
const END = "/* @transcript-slice:end */";

const css = readFileSync(src_path, "utf8");
const start_idx = css.indexOf(START);
const end_idx = css.indexOf(END);
if (start_idx < 0 || end_idx < 0 || end_idx <= start_idx) {
  console.error("extract_transcript_slice: slice markers missing/reordered in panel_chat.css");
  process.exit(1);
}
// Body starts AFTER the start-marker comment block closes.
const marker_close = css.indexOf("*/", start_idx);
const body = css.slice(marker_close + 2, end_idx).trim();

// The token contract is DERIVED from the slice, never hand-listed: every
// var(--x[, fallback]) the slice consumes, with whether a fallback exists.
const tokens = new Map();
for (const m of body.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(,)?/g)) {
  const name = m[1];
  const has_fallback = Boolean(m[2]);
  if (!tokens.has(name)) tokens.set(name, has_fallback);
  else if (!has_fallback) tokens.set(name, false);
}
const token_lines = [...tokens.keys()]
  .sort()
  .map((t) => ` *   ${t}${tokens.get(t) ? "" : "   (NO fallback — theme.css required)"}`);

const classes = new Set();
for (const m of body.matchAll(/\.(pc-[a-zA-Z0-9_-]+)/g)) classes.add(m[1]);

const header = `/*
 * transcript.css — the standalone dialogue-transcript slice of
 * @abstractframework/panel-chat (GENERATED — DO NOT EDIT).
 *
 * Source of truth: src/panel_chat.css between the @transcript-slice markers.
 * Regenerate: node scripts/extract_transcript_slice.mjs
 * Drift pin: the package test fails if this file differs from the source.
 *
 * WHAT THIS IS: the .pc-chat-thread + .pc-chat-item bubble family ONLY —
 * no React, no markdown/JSON content styles (single-file consumers own
 * their content styling). The class vocabulary and the corner-cut
 * signature (user: bottom-right, assistant: bottom-left) are the contract
 * surface; renames are breaking changes flagged to the consumer list.
 *
 * CONSUMERS: entity + flow (package import of the full panel_chat.css);
 * abstractgateway console.py (vendors this recipe onto console vars — their
 * class-set pin test greps the vocabulary, c2174); future single-file
 * surfaces import or copy THIS file.
 *
 * TOKEN CONTRACT (derived from the slice — every custom property consumed;
 * all carry fallbacks so the file works without theme.css, and map cleanly
 * onto a console's own vars: --ui-border-1 → your border var, etc.):
${token_lines.join("\n")}
 *
 * CLASS SET (${classes.size}): ${[...classes].sort().join(", ")}
 */

`;

const generated = header + body + "\n";

if (process.argv.includes("--check")) {
  if (!existsSync(out_path)) {
    console.error("transcript slice: transcript.css MISSING — run scripts/extract_transcript_slice.mjs");
    process.exit(1);
  }
  const current = readFileSync(out_path, "utf8");
  if (current !== generated) {
    console.error("transcript slice: DRIFT — transcript.css does not match the panel_chat.css slice; regenerate");
    process.exit(1);
  }
  console.log(`transcript slice: OK (in parity with panel_chat.css; ${classes.size} classes, ${tokens.size} tokens)`);
} else {
  writeFileSync(out_path, generated);
  console.log(`transcript slice: wrote transcript.css (${classes.size} classes, ${tokens.size} tokens)`);
}
