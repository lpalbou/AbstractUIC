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
for (const fn of ["mountTopBar", "mountAppearance", "mountAbout", "mountSandboxChat", "mountProviderModelPicker", "mountVoiceSettings", "mountDocsAssistant", "mountDrawerSystem", "mountWorkspaceChooser", "bindModal", "bindMenu", "bindTooltips", "appIdentity", "applyAppearance"]) if (typeof api[fn] !== "function") fail(`missing ${fn}()`);
if (!api.workspaceChooserText || api.workspaceChooserText.postureAllowedOnly !== "Deny everything, allow listed workspaces" || api.workspaceChooserText.accessReadWrite !== "Read & write") fail("missing workspaceChooserText (the chooser wording table)");
if (typeof api.workspaceAsState !== "function" || api.workspaceChooserText.gatewayTitle !== "Eligible workspaces") fail("missing workspaceAsState / the round-11 wording table (kit 0.8.2)");
if (typeof api.islandConnectionStatus !== "function") fail("missing islandConnectionStatus()");
{
  const me = { ok: true, principal: { user_id: "alice", tenant_id: "acme" } };
  const live = api.islandConnectionStatus({ phase: "connected", me });
  if (!live || live.has_session !== true || live.gateway !== me) fail(`islandConnectionStatus(connected, me) = ${JSON.stringify(live)}`);
  for (const phase of ["disconnected", "loading"]) {
    if (api.islandConnectionStatus({ phase, me }) !== null) fail(`islandConnectionStatus(${phase}, stale me) must be null (no identity beside a pill that is not connected)`);
  }
  if (api.islandConnectionStatus({ phase: "connected", me: { ok: false } }) !== null) fail("islandConnectionStatus(me.ok false) must be null");
}
if (api.apiVersion !== "2") fail(`apiVersion ${api.apiVersion} (expected "2")`);
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
