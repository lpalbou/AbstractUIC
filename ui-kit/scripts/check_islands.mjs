#!/usr/bin/env node
// Rebuild the console islands bundle and prove it loads as a plain <script>:
// evaluating it defines window.AfConsoleIslands with the documented API and
// the kit's own theme list (the gateway console's contract, mission L).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const kitDir = join(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, [join(kitDir, "scripts", "build_islands.mjs")], { stdio: "inherit" });
const code = readFileSync(join(kitDir, "islands", "dist", "af-console-islands.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(kitDir, "package.json"), "utf8"));
const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const api = sandbox.AfConsoleIslands;
const fail = (msg) => { console.error(`check_islands: ${msg}`); process.exit(1); };
if (!api) fail("bundle did not define AfConsoleIslands");
for (const fn of ["mountTopBar", "mountAppearance", "mountAbout", "appIdentity", "applyAppearance"]) if (typeof api[fn] !== "function") fail(`missing ${fn}()`);
if (api.apiVersion !== "1") fail(`apiVersion ${api.apiVersion} (expected "1")`);
if (api.kitVersion !== pkg.version) fail(`kitVersion ${api.kitVersion} != package ${pkg.version}`);
const gw = api.appIdentity("abstractgateway", "0.0.1");
if (gw.name !== "AbstractGateway" || gw.version !== "0.0.1" || !gw.repo.startsWith("https://")) fail(`appIdentity("abstractgateway") = ${JSON.stringify(gw)}`);
let unknownThrew = false;
try { api.appIdentity("abstractnope", "1"); } catch { unknownThrew = true; }
if (!unknownThrew) fail("appIdentity(unknown id) did not throw");
const themeTs = readFileSync(join(kitDir, "src", "theme.ts"), "utf8");
const specCount = (themeTs.match(/\{ id: "/g) || []).length;
if (!Array.isArray(api.themes) || api.themes.length !== specCount) fail(`themes ${api.themes && api.themes.length} != THEME_SPECS ${specCount}`);
if (!code.startsWith(`/*! @abstractframework/ui-kit ${pkg.version} console islands`)) fail("banner missing/wrong");
console.log(`check_islands: OK (${code.length} bytes, ${api.themes.length} themes, kit ${pkg.version})`);
