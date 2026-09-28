#!/usr/bin/env node
// Browser code never names a ROOT-ABSOLUTE same-origin URL. Apps are served
// under a base path (the gateway's /apps/<id>/), so "/api/…", "/assets/…" or
// "/apps/…" would escape the app's base and miss its server; same-origin
// paths are relative ("api/…", ui-kit gateway_paths.ts) or come from an
// explicit host override. No allowlist: a literal in a comment's code span
// fails too (write the relative form).
//
// Scans the sources AND the built output of every browser package (the
// bundles hosts actually load). A missing build directory is a failure, not
// a pass: run after `npm run build` / `npm test` (the root `npm test` runs
// this last). app-server is excluded: it is Node server code whose routes
// are matched after its mount strips the base path.
//
// Usage: node scripts/check_relative_urls.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? process.argv[argRoot + 1] : join(dirname(fileURLToPath(import.meta.url)), "..");

// Every browser package's source and build directories. `required` build
// output must exist and contain files.
const SOURCES = ["ui-kit/src", "ui-kit/islands", "panel-chat/src", "panel-chat/examples", "panel-chat/transcript.css", "monitor-gpu/src", "monitor-memory/src", "monitor-flow/src", "monitor-active-memory/src"];
const BUILDS = ["ui-kit/dist", "ui-kit/islands/dist", "panel-chat/dist", "monitor-flow/dist", "monitor-active-memory/dist"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".html", ".json"];
// A quote or backtick immediately followed by /api, /assets or /apps and then
// "/", "?", "#" or the closing quote.
const ROOTED = /["'`]\/(api|assets|apps)(?=[/?#"'`])/g;

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};

function files(path) {
  const st = statSync(path);
  if (st.isFile()) return [path];
  return readdirSync(path).flatMap((name) => (name === "node_modules" ? [] : files(join(path, name))));
}

let scanned = 0;
function scan(path) {
  for (const f of files(path)) {
    if (!EXTENSIONS.some((e) => f.endsWith(e))) continue;
    scanned += 1;
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(ROOTED)) fail(`${relative(root, f)}:${i + 1}: root-absolute same-origin URL ${JSON.stringify(line.slice(m.index, m.index + 48))}`);
      });
  }
}

for (const rel of SOURCES) {
  const p = join(root, rel);
  if (!existsSync(p)) fail(`${rel}: source path is missing (update this check when a package moves)`);
  else scan(p);
}
for (const rel of BUILDS) {
  const p = join(root, rel);
  if (!existsSync(p) || files(p).length === 0) fail(`${rel}: build output is missing — build first (npm run build; islands: npm --workspace ui-kit run build:islands)`);
  else scan(p);
}

if (failures) {
  console.error(`check_relative_urls: ${failures} FAILED`);
  process.exit(1);
}
console.log(`check_relative_urls: OK (${scanned} files, no root-absolute same-origin URL)`);
