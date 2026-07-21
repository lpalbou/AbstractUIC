#!/usr/bin/env node
// Guard: compiled .js twins must NEVER sit beside .ts/.tsx sources in src/.
//
// Why (continuum c2544, 2026-07-16): consumers that alias
// @abstractframework/* to our src/ (sibling-checkout pattern: continuum,
// observer, flow, code) resolve NodeNext explicit-.js imports
// (`export { X } from "./x.js"`) to a STALE compiled twin on disk when one
// exists — a .tsx fix then never enters their bundle. dist/ is the one
// compiled surface; src/ must stay sources-only. This checks BOTH kit
// packages because the kit's npm test is the gate that always runs.
import { readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const roots = [resolve(here, "../src"), resolve(here, "../../panel-chat/src")];

const twins = [];
for (const root of roots) {
  if (!existsSync(root)) continue;
  for (const f of readdirSync(root)) {
    if (!f.endsWith(".js")) continue;
    const base = join(root, f.slice(0, -3));
    if (existsSync(base + ".ts") || existsSync(base + ".tsx")) twins.push(join(root, f));
  }
}

if (twins.length) {
  console.error("check_no_src_twins: FAIL — compiled twins beside TS sources (stale-shadow hazard for src-aliasing consumers):");
  for (const t of twins) console.error("  " + t);
  console.error("Delete them; dist/ is the only compiled surface.");
  process.exit(1);
}
console.log("check_no_src_twins: OK (src/ is sources-only in ui-kit + panel-chat)");
