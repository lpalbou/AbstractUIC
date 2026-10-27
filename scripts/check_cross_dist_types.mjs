#!/usr/bin/env node
// Release gate: the built ui-kit and the built panel-chat must agree, type for type, on the session
// tool-policy client (scripts/cross_dist_types/cross.ts), and the gate must be able to go red
// (scripts/cross_dist_types/cross_neg.ts must be REJECTED by tsc). Runs after both workspaces built.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "scripts", "cross_dist_types");
const tsc = path.join(root, "node_modules", ".bin", "tsc");
for (const built of ["ui-kit/dist/session_tool_policy.d.ts", "panel-chat/dist/index.d.ts"]) {
  if (!existsSync(path.join(root, built))) {
    console.error(`check_cross_dist_types: ${built} is missing — build ui-kit and panel-chat first.`);
    process.exit(1);
  }
}

function run(file) {
  const tmp = mkdtempSync(path.join(tmpdir(), "af-cross-dist-"));
  const cfg = path.join(tmp, "tsconfig.json");
  writeFileSync(cfg, JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", jsx: "react-jsx", skipLibCheck: true, types: [] },
    files: [path.join(dir, file)],
  }));
  const r = spawnSync(tsc, ["-p", cfg], { cwd: root, encoding: "utf8" });
  rmSync(tmp, { recursive: true, force: true });
  return r;
}

const pos = run("cross.ts");
if (pos.status !== 0) {
  console.error("check_cross_dist_types: ui-kit and panel-chat DISAGREE on the session tool-policy client shape:\n" + pos.stdout + pos.stderr);
  process.exit(1);
}
const neg = run("cross_neg.ts");
if (neg.status === 0) {
  console.error("check_cross_dist_types: the negative control type-checked — the gate cannot go red; fix cross_neg.ts.");
  process.exit(1);
}
console.log("check_cross_dist_types: OK (ui-kit dist and panel-chat dist agree on SessionToolPolicy{Scope,Body,,Client}; negative control rejected)");
