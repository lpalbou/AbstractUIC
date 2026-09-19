// Release-audit clean-install probe: import every published entrypoint and
// every declared CSS export from the packed tarballs, and prove each one
// resolved INSIDE this isolated tree (not from the repo's own node_modules).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const isolated = path.join(here, "node_modules");

const entrypoints = [
  "@abstractframework/app-server",
  "@abstractframework/monitor-gpu",
  "@abstractframework/monitor-memory",
  "@abstractframework/ui-kit",
  "@abstractframework/panel-chat",
  "@abstractframework/monitor-flow",
  "@abstractframework/monitor-active-memory",
];

// Subpath exports declared in each package.json — a broken one is a broken
// install for any host that follows the README's CSS import instructions.
const subpaths = [
  "@abstractframework/ui-kit/theme.css",
  "@abstractframework/ui-kit/palette_seeds.json",
  "@abstractframework/panel-chat/panel_chat.css",
  "@abstractframework/panel-chat/transcript.css",
  "@abstractframework/monitor-flow/agent_cycles.css",
  "@abstractframework/monitor-active-memory/styles.css",
];

let failures = 0;

for (const name of entrypoints) {
  let resolved;
  try {
    resolved = require.resolve(name);
  } catch (e) {
    console.log(`RESOLVE FAIL  ${name}  (${e.code})`);
    failures += 1;
    continue;
  }
  const inIsolated = resolved.startsWith(isolated);
  try {
    const m = await import(name);
    const keys = Object.keys(m).filter((k) => k !== "default");
    console.log(
      `IMPORT OK     ${name}  exports=${keys.length}  isolated=${inIsolated ? "yes" : "NO (leaked to repo tree)"}`
    );
    if (!inIsolated) failures += 1;
  } catch (e) {
    console.log(`IMPORT FAIL   ${name}  ${e.code}: ${String(e.message).split("\n")[0]}`);
    failures += 1;
  }
}

for (const sub of subpaths) {
  try {
    const p = require.resolve(sub);
    const ok = fs.existsSync(p);
    console.log(`SUBPATH ${ok ? "OK   " : "MISSING"} ${sub} -> ${path.relative(isolated, p)}`);
    if (!ok) failures += 1;
  } catch (e) {
    console.log(`SUBPATH FAIL  ${sub}  (${e.code})`);
    failures += 1;
  }
}

console.log(`\nfailures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
