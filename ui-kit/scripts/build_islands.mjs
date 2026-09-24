#!/usr/bin/env node
// Build the console islands bundle: ONE self-contained, minified IIFE
// (React + the kit components) that defines `window.AfConsoleIslands`.
// Consumed by abstractgateway's console (console_islands_sync.py vendors the
// output into its generated console_islands.py and drift-pins it).
//
//   node scripts/build_islands.mjs            # writes islands/dist/af-console-islands.js
//   node scripts/build_islands.mjs --check    # rebuilds in memory, fails if dist is stale
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kitDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(kitDir, "package.json"), "utf8"));
const outFile = join(kitDir, "islands", "dist", "af-console-islands.js");

const result = await build({
  entryPoints: [join(kitDir, "islands", "console_islands.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "safari15"],
  minify: true,
  legalComments: "none",
  write: false,
  charset: "utf8",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    __KIT_VERSION__: JSON.stringify(pkg.version),
  },
  // Only relative kit sources + react/react-dom; resolved from the workspace.
  nodePaths: [join(kitDir, "node_modules"), join(kitDir, "..", "node_modules")],
});
const banner = `/*! @abstractframework/ui-kit ${pkg.version} console islands (React 18, MIT) */\n`;
const code = banner + result.outputFiles[0].text;

if (process.argv.includes("--check")) {
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== code) {
    console.error(`islands bundle is stale: run \`node scripts/build_islands.mjs\` (${outFile})`);
    process.exit(1);
  }
  console.log(`islands bundle up to date (${code.length} bytes)`);
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, code);
  console.log(`wrote ${outFile} (${code.length} bytes)`);
}
