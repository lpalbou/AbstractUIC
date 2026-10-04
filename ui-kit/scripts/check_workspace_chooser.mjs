#!/usr/bin/env node
/**
 * ui-kit 0.8.2 (round 11, DESIGN "R11.1 FINAL"): WorkspaceChooser — one
 * component, four levels (gateway | account | session | run).
 *
 * Over the compiled dist (renderToStaticMarkup, no jsdom), like check_about:
 * 1. Top line "Gateway: <gateway_summary>" verbatim below the gateway level;
 *    hidden at the gateway level (which shows the ceiling as its effective line).
 * 2. Posture segmented control with the two labels verbatim.
 * 3. Rows: path · Read & write | Read-only | Refused · remove (kit tooltip).
 *    A mode above the gateway's cap (effective.folders[].cap) is aria-disabled
 *    with the tooltip "The gateway allows this workspace read-only"; the
 *    gateway level has no cap.
 * 4. "Add a workspace path" row; "Choose…" only when the host passes `choose`.
 * 5. Account: "Follow the gateway policy"; session/run: "Use my default" —
 *    state-showing switches; ON sends {configured:false}.
 * 6. Effective line verbatim; every change = ONE save(payload); a refusal is
 *    the gateway's sentence + "Not saved."; no Save button.
 * 7. No shared workspace, no "folder" in the wording.
 * Mutation-checked (untracked/round4/r11/w2/mutate.txt).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
const src = readFileSync(join(here, "..", "src", "workspace_chooser.tsx"), "utf8") + readFileSync(join(here, "..", "src", "workspace_chooser_core.ts"), "utf8");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const {
  WorkspaceChooser,
  WORKSPACE_CHOOSER_TEXT: T,
  workspaceChooserView,
  workspaceModesUnderCap,
  workspaceModePayload,
  workspacePosturePayload,
  workspaceDefaultModePayload,
  workspaceAddPayload,
  workspaceRemovePayload,
  workspaceFollowPayload,
  workspaceNewRowMode,
  workspacePolicyPath,
  workspaceDryRunPath,
  workspaceAsState,
  workspaceChooserClient,
  workspaceDryRun,
  workspaceErrorSentence,
  workspaceRefusal,
  workspaceRunState,
} = kit;

const P = "/data/project";
const AR = "/archive";
const SEC = "/secrets";
const PIC = "/Users/me/Pictures";
const DOC = "/Users/me/Documents";
const GW_LINE = "Allow everything, refuse listed workspaces (rw) · /secrets (refused) · /archive (ro)";
const ACC_LINE = "Deny everything, allow listed workspaces · /Users/me/Pictures (rw) · /Users/me/Documents (ro)";

// Answers in the R11 WORKSPACE API — FINAL shapes.
const gatewayAnswer = (over = {}) => ({
  ok: true,
  policy: { posture: "any_except_denied", default_mode: "rw", folders: [{ path: SEC, mode: "deny" }, { path: AR, mode: "ro" }], builtin_refused: ["/srv/gw/data"], max_attachment_bytes: 1, summary: GW_LINE, ...over },
});
const effective = (over = {}) => ({
  ok: true, account: "default:alice", session_id: null, level: "account",
  posture: "allowed_only", default_mode: "rw",
  folders: [{ path: PIC, mode: "rw", cap: "rw", source: "account" }, { path: DOC, mode: "ro", cap: "ro", source: "account" }],
  summary: ACC_LINE, gateway_summary: GW_LINE, ...over,
});
const accountAnswer = (policy = {}, eff = {}, extra = {}) => ({
  ok: true,
  policy: { account: "default:alice", configured: true, posture: "allowed_only", default_mode: "rw", folders: [{ path: PIC, mode: "rw" }, { path: DOC, mode: "ro" }], ...policy },
  gateway: gatewayAnswer().policy,
  effective: effective(eff),
  can_edit: true,
  ...extra,
});
const followingAnswer = () =>
  accountAnswer(
    { configured: false, posture: "any_except_denied", default_mode: "rw", folders: [] },
    { posture: "any_except_denied", folders: [{ path: SEC, mode: "deny", cap: "deny", source: "gateway" }, { path: AR, mode: "ro", cap: "ro", source: "gateway" }], summary: GW_LINE },
  );
const sessionAnswer = (policy = {}) => ({
  ok: true,
  policy: { session_id: "s1", account: "default:alice", configured: true, posture: "allowed_only", default_mode: "rw", folders: [{ path: PIC, mode: "rw" }], ...policy },
  gateway: gatewayAnswer().policy,
  account_default: effective(),
  effective: effective({ level: "session", folders: [{ path: PIC, mode: "rw", cap: "rw", source: "session" }], summary: "Deny everything, allow listed workspaces · /Users/me/Pictures (rw)" }),
});

const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const html = (props) => renderToStaticMarkup(React.createElement(WorkspaceChooser, props));
const rowHtml = (h, path) => (new RegExp(`<li[^>]*data-path="${path.replace(/\//g, "\\/")}"[\\s\\S]*?</li>`).exec(h) || [""])[0];
const btn = (s, action) => (new RegExp(`<button[^>]*data-action="${action}"[^>]*>`).exec(s) || [""])[0];
const visibleText = (h) => h.replace(/<[^>]+>/g, " ");
const noop = async () => {};

// ---- Account level (configured).
{
  const st = workspaceAsState(accountAnswer(), "account");
  const h = html({ level: "account", state: st, save: noop });
  check("account: title Workspaces + account help", h.includes(`>${T.title}<`) && h.includes(esc(T.accountHelp)));
  check("account: top line 'Gateway: <gateway_summary>' verbatim", h.includes(`data-workspace="gateway-line">${esc(`Gateway: ${GW_LINE}`)}<`));
  check("account: top line comes before the rows", h.indexOf('data-workspace="gateway-line"') < h.indexOf('data-workspace="list"'));
  check("posture segmented: both labels verbatim, current pressed",
    /data-action="workspace-posture-allowed_only"[^>]*>Deny everything, allow listed workspaces</.test(h.replace(/aria-[a-z]+="[^"]*"\s*/g, "")) &&
    h.includes(`>${T.postureAnyExceptDenied}<`) && /aria-pressed="true"/.test(btn(h, "workspace-posture-allowed_only")) && /aria-pressed="false"/.test(btn(h, "workspace-posture-any_except_denied")));
  const pic = rowHtml(h, PIC), doc = rowHtml(h, DOC);
  check("rows: path · three modes · remove", pic.includes(`>${PIC}<`) && btn(pic, "workspace-mode-rw") && btn(pic, "workspace-mode-ro") && btn(pic, "workspace-mode-deny") && btn(pic, "workspace-remove"));
  check("row under a rw cap: every mode available", !/aria-disabled/.test(btn(pic, "workspace-mode-rw")) && !/aria-disabled/.test(btn(pic, "workspace-mode-ro")));
  check("row under a ro cap: Read & write DISABLED with the kit tooltip verbatim",
    /aria-disabled="true"/.test(btn(doc, "workspace-mode-rw")) && btn(doc, "workspace-mode-rw").includes(`data-af-tip="${T.capReadOnly}"`) && T.capReadOnly === "The gateway allows this workspace read-only", btn(doc, "workspace-mode-rw"));
  check("row under a ro cap: Read-only pressed, Refused available", /aria-pressed="true"/.test(btn(doc, "workspace-mode-ro")) && !/aria-disabled/.test(btn(doc, "workspace-mode-deny")));
  check("disabled mode stays focusable (aria-disabled, never disabled=)", !/\sdisabled=""/.test(btn(doc, "workspace-mode-rw")));
  check("remove: aria-label + kit tooltip 'Remove <path>', no native title", btn(pic, "workspace-remove").includes(`aria-label="${T.remove} ${PIC}"`) && btn(pic, "workspace-remove").includes(`data-af-tip="${T.remove} ${PIC}"`) && !/\stitle=/.test(btn(pic, "workspace-remove")));
  check("follow switch: 'Follow the gateway policy', OFF while configured", /role="switch"[^>]*aria-checked="false"[^>]*data-action="workspace-follow-gateway"|data-action="workspace-follow-gateway"[^>]*aria-checked="false"|aria-checked="false"[^>]*data-action="workspace-follow-gateway"/.test(h) && h.includes(esc(T.followGateway)));
  check("account: no 'Use my default'", !h.includes(esc(T.useDefault)));
  check("add row: placeholder 'Add a workspace path' + Add", h.includes(`placeholder="${T.addPlaceholder}"`) && btn(h, "workspace-add") !== "");
  check("no Choose… without a choose callback", !h.includes('data-action="workspace-choose"'));
  check("effective line verbatim at the end", h.includes(`data-workspace="effective">${esc(ACC_LINE)}<`) && h.indexOf('data-workspace="effective"') > h.indexOf('data-workspace="list"'));
  check("captions: Allowed workspaces", h.includes(`>${T.allowedTitle}<`) && !h.includes(`>${T.deniedTitle}<`));
  check("no Save button", !/>\s*Save\s*</.test(h));
  check("no 'shared', no 'folder' in what is shown", !/shared|folder/i.test(visibleText(h)), (visibleText(h).match(/[^ ]*(shared|folder)[^ ]*/i) || [""])[0]);
  check("account: no private-workspace note (session/run only)", !h.includes('data-workspace="private"'));
  const hc = html({ level: "account", state: st, save: noop, choose: async () => "/x" });
  check("Choose… with a choose callback", hc.includes(`data-action="workspace-choose"`) && hc.includes(`>${T.choose}<`));
  const hf = html({ level: "account", state: st, save: noop, footer: React.createElement("a", { href: "#d", "data-x": "footer" }, "My default workspaces") });
  check("footer slot under the effective line", hf.indexOf('data-x="footer"') > hf.indexOf('data-workspace="effective"'));
}
// ---- Account level, following the gateway policy.
{
  const st = workspaceAsState(followingAnswer(), "account");
  const h = html({ level: "account", state: st, save: noop });
  check("following: switch ON", /aria-checked="true"[^>]*data-action="workspace-follow-gateway"|data-action="workspace-follow-gateway"[^>]*aria-checked="true"/.test(h));
  check("following: rows = what applies (effective), read-only tags, no remove, no add", rowHtml(h, SEC).includes('data-access="deny"') && !h.includes("workspace-mode-") && !h.includes("workspace-remove") && !h.includes('data-workspace="add"'));
  check("following: posture shown as a badge, not a control", !h.includes("workspace-posture-") && h.includes(`>${T.postureAnyExceptDenied}<`));
  check("following: Refused workspaces caption", h.includes(`>${T.deniedTitle}<`));
  check("follow ON -> {configured:false}", JSON.stringify(workspaceFollowPayload(workspaceAsState(accountAnswer(), "account"), true)) === JSON.stringify({ configured: false }));
  check("follow OFF -> configured:true with the gateway's effective rows verbatim",
    JSON.stringify(workspaceFollowPayload(st, false)) === JSON.stringify({ configured: true, posture: "any_except_denied", default_mode: "rw", folders: [{ path: SEC, mode: "deny" }, { path: AR, mode: "ro" }] }));
}
// ---- effective.default_mode null under "Deny everything…" (the gateway answers null there).
{
  const a = accountAnswer({ configured: false, folders: [] }, { default_mode: null });
  const st = workspaceAsState(a, "account");
  check("effective default_mode null accepted under allowed_only", st.effective.default_mode === null);
  check("follow OFF with a null effective default -> the policy's default_mode (always a valid body)", workspaceFollowPayload(st, false).default_mode === "rw");
  let threw = "";
  try { workspaceAsState(accountAnswer({}, { posture: "any_except_denied", default_mode: null }), "account"); } catch (e) { threw = e.message; }
  check("effective default_mode null refused under any_except_denied", /round-11 workspace API/.test(threw), threw);
  check("run state with a null effective default is a valid policy", workspaceRunState(null, effective({ default_mode: null })).policy.default_mode === "rw");
}
// ---- Payloads (account level): full bodies, one per change.
{
  const st = workspaceAsState(accountAnswer(), "account");
  const p = st.policy;
  check("mode change -> configured:true full body", JSON.stringify(workspaceModePayload("account", p, PIC, "ro")) === JSON.stringify({ configured: true, posture: "allowed_only", default_mode: "rw", folders: [{ path: PIC, mode: "ro" }, { path: DOC, mode: "ro" }] }));
  check("posture change keeps the rows", JSON.stringify(workspacePosturePayload("account", p, "any_except_denied").folders) === JSON.stringify(p.folders) && workspacePosturePayload("account", p, "any_except_denied").posture === "any_except_denied");
  check("everything else -> default_mode", workspaceDefaultModePayload("account", p, "ro").default_mode === "ro");
  check("add -> trimmed path, Read-only under 'Deny everything…' below the gateway", JSON.stringify(workspaceAddPayload("account", p, "  /tmp/x ").folders.at(-1)) === JSON.stringify({ path: "/tmp/x", mode: "ro" }));
  check("add under 'Allow everything…' -> Refused", workspaceNewRowMode("account", "any_except_denied") === "deny" && workspaceNewRowMode("gateway", "any_except_denied") === "deny");
  check("add at the gateway under 'Deny everything…' -> Read & write", workspaceNewRowMode("gateway", "allowed_only") === "rw");
  check("remove", JSON.stringify(workspaceRemovePayload("account", p, PIC).folders) === JSON.stringify([{ path: DOC, mode: "ro" }]));
  check("cap rules: ro cap -> rw refused with the sentence; deny cap -> only Refused; null -> all",
    workspaceModesUnderCap("ro").allowed.join() === "ro,deny" && workspaceModesUnderCap("ro").reasons.rw === T.capReadOnly &&
    workspaceModesUnderCap("deny").allowed.join() === "deny" && workspaceModesUnderCap("deny").reasons.ro === T.capRefused &&
    workspaceModesUnderCap(null).allowed.join() === "rw,ro,deny");
}
// ---- Gateway level.
{
  const st = workspaceAsState(gatewayAnswer(), "gateway");
  const h = html({ level: "gateway", state: st, save: noop });
  check("gateway: title 'Eligible workspaces'", h.includes(`>${T.gatewayTitle}<`) && T.gatewayTitle === "Eligible workspaces");
  check("gateway: NO top 'Gateway:' line", !h.includes('data-workspace="gateway-line"') && !h.includes("Gateway: "));
  check("gateway: no follow switch", !h.includes('data-workspace="follow"'));
  check("gateway: the mode is the cap — no mode disabled", !/workspace-mode-[^"]*"[^>]*aria-disabled|aria-disabled="true"[^>]*workspace-mode-/.test(h));
  check("gateway: Everything else with Read & write | Read-only", /data-workspace="everything-else"[\s\S]*workspace-default-rw[\s\S]*workspace-default-ro/.test(h));
  check("gateway: built-in refusal shown fixed (no controls) with its tooltip", rowHtml(h, "/srv/gw/data").includes('data-workspace="builtin"') && !rowHtml(h, "/srv/gw/data").includes("workspace-remove") && rowHtml(h, "/srv/gw/data").includes(`data-af-tip="${esc(T.builtinRefused)}"`));
  check("gateway: effective line = the ceiling (policy.summary)", h.includes(`data-workspace="effective">${esc(GW_LINE)}<`));
  check("gateway payload has no configured key", !("configured" in workspaceModePayload("gateway", st.policy, AR, "rw")));
  const empty = workspaceAsState(gatewayAnswer({ posture: "allowed_only", folders: [], builtin_refused: [], summary: "Deny everything, allow listed workspaces" }), "gateway");
  check("gateway allowed_only with no row: the empty sentence", html({ level: "gateway", state: empty, save: noop }).includes(esc(T.emptyAllowed)));
}
// ---- Session level.
{
  const st = workspaceAsState(sessionAnswer(), "session");
  const h = html({ level: "session", state: st, save: noop });
  check("session: 'Use my default' switch OFF while configured", h.includes(esc(T.useDefault)) && /aria-checked="false"[^>]*data-action="workspace-use-default"|data-action="workspace-use-default"[^>]*aria-checked="false"/.test(h));
  check("session: top line + help + private note", h.includes(esc(`Gateway: ${GW_LINE}`)) && h.includes(esc(T.sessionHelp)) && h.includes(esc(T.privateNote)));
  const def = workspaceAsState(sessionAnswer({ configured: false, folders: [] }), "session");
  check("session default: switch ON", /aria-checked="true"[^>]*data-action="workspace-use-default"|data-action="workspace-use-default"[^>]*aria-checked="true"/.test(html({ level: "session", state: def, save: noop })));
}
// ---- Run level (no PUT inside the kit).
{
  const eff = effective({ level: "run" });
  const hv = html({ level: "run", value: null, effective: eff, onChange: () => {} });
  check("run, value null: 'Use my default' ON, rows read-only", /aria-checked="true"[^>]*data-action="workspace-use-default"|data-action="workspace-use-default"[^>]*aria-checked="true"/.test(hv) && !hv.includes("workspace-mode-"));
  const value = { posture: "allowed_only", default_mode: "rw", folders: [{ path: DOC, mode: "ro" }] };
  const h = html({ level: "run", value, effective: eff, onChange: () => {} });
  check("run, value: rows editable, cap from the dry run", /aria-disabled="true"/.test(btn(rowHtml(h, DOC), "workspace-mode-rw")) && h.includes(esc(T.runHelp)));
  check("run state: value null -> configured false", workspaceRunState(null, eff).policy.configured === false && workspaceRunState(value, eff).policy.configured === true);
  check("run: loading while no dry-run answer", html({ level: "run", value, effective: null, onChange: () => {} }).includes('data-workspace="loading"'));
}
// ---- Unavailable / loading / error / locked.
check("loading", html({ level: "account", state: null, save: noop }).includes(`data-workspace="loading">${T.loading}<`));
check("load error shown verbatim", html({ level: "account", state: null, loadError: "Sign in first.", save: noop }).includes(">Sign in first.<"));
{
  const h = html({ level: "account", state: workspaceAsState(accountAnswer(), "account"), unavailableReason: "Connect to your gateway first.", save: noop });
  const btns = [...h.matchAll(/<button[^>]*data-action="workspace-mode-[^>]*>/g)].map((m) => m[0]);
  check("unavailable: every mode aria-disabled + the reason shown", btns.length > 0 && btns.every((b) => /aria-disabled="true"/.test(b)) && h.includes("Connect to your gateway first."));
  const hl = html({ level: "account", state: workspaceAsState(accountAnswer({}, {}, { can_edit: false }), "account"), save: noop });
  check("can_edit false: tags only, no add", !hl.includes("workspace-mode-") && !hl.includes('data-workspace="add"'));
}
// ---- Parsing: loud on an older gateway / missing fields.
{
  for (const [name, level, answer] of [
    ["round-9 answer with shared_workspace", "account", { ok: true, policy: { account: "a", default_mode: null, folders: [] }, effective: { shared_workspace: "/s", summary: "x" } }],
    ["gateway policy carrying shared_workspace", "gateway", { ok: true, policy: { ...gatewayAnswer().policy, shared_workspace: "/s" } }],
    ["no configured", "account", (() => { const a = accountAnswer(); delete a.policy.configured; return a; })()],
    ["no cap on effective rows", "account", (() => { const a = accountAnswer(); a.effective.folders = [{ path: PIC, mode: "rw", source: "account" }]; return a; })()],
    ["no gateway_summary", "account", (() => { const a = accountAnswer(); delete a.effective.gateway_summary; return a; })()],
    ["gateway without summary", "gateway", (() => { const a = gatewayAnswer(); delete a.policy.summary; return a; })()],
  ]) {
    let threw = "";
    try { workspaceAsState(answer, level); } catch (e) { threw = e.message; }
    check(`parse refuses loudly: ${name}`, /round-11 workspace API/.test(threw), threw);
  }
}
// ---- Client, routes, refusal.
{
  check("route gateway", workspacePolicyPath({ level: "gateway" }, "/api/gateway/") === "/api/gateway/workspace/policy");
  check("route account me (relative default)", workspacePolicyPath({ level: "account" }) === "api/gateway/workspace/policy/me");
  check("route account tenant:user", workspacePolicyPath({ level: "account", account: "default:alice" }, "/api/gateway") === "/api/gateway/workspace/policy/default%3Aalice");
  check("route session", workspacePolicyPath({ level: "session", session: "s 1" }) === "api/gateway/sessions/s%201/workspaces");
  check("route session of another account (admin)", workspacePolicyPath({ level: "session", session: "s1", account: "default:bob" }) === "api/gateway/sessions/s1/workspaces?account=default%3Abob");
  check("route dry run", workspaceDryRunPath() === "api/gateway/workspace/effective/me");
  const calls = [];
  const client = workspaceChooserClient(async (path, init) => { calls.push([path, init.method, init.body]); return accountAnswer(); }, { level: "account", account: "bob" });
  const loaded = await client.load();
  check("client load: ONE GET, state with effective", calls.length === 1 && calls[0][1] === "GET" && calls[0][0] === "api/gateway/workspace/policy/bob" && loaded.effective.summary === ACC_LINE);
  const saved = await client.save({ configured: false });
  check("client save: ONE PUT with the body, answers the state", calls.length === 2 && calls[1][1] === "PUT" && JSON.stringify(calls[1][2]) === JSON.stringify({ configured: false }) && saved.policy.configured === true);
  const dcalls = [];
  const dry = workspaceDryRun(async (path, init) => { dcalls.push([path, init.method, init.body]); return effective({ level: "run" }); });
  await dry({ posture: "allowed_only", default_mode: "rw", folders: [] });
  check("dry run: POST {workspace}", dcalls[0][0] === "api/gateway/workspace/effective/me" && dcalls[0][1] === "POST" && JSON.stringify(dcalls[0][2]) === JSON.stringify({ workspace: { posture: "allowed_only", default_mode: "rw", folders: [] } }));
  check("refusal: Error message + Not saved.", workspaceRefusal(new Error("/etc is outside the eligible workspaces")) === "/etc is outside the eligible workspaces. Not saved.");
  check("refusal: 400 body detail.message", workspaceErrorSentence({ detail: { reason: "workspace_refused", message: "Read & write is above the gateway's cap for /archive.", path: AR } }) === "Read & write is above the gateway's cap for /archive.");
  check("refusal: detail string", workspaceErrorSentence({ detail: "Only an admin or castor's creator can change its workspaces." }).startsWith("Only an admin"));
}
// ---- Wording table (every client copies it verbatim; the Assistant's copy is diffed key by key).
{
  const expected = {
    title: "Workspaces", gatewayTitle: "Eligible workspaces", gatewayPrefix: "Gateway:",
    postureAllowedOnly: "Deny everything, allow listed workspaces", postureAnyExceptDenied: "Allow everything, refuse listed workspaces",
    accessRead: "Read-only", accessReadWrite: "Read & write", accessDenied: "Refused",
    capReadOnly: "The gateway allows this workspace read-only", allowedTitle: "Allowed workspaces", deniedTitle: "Refused workspaces",
    addPlaceholder: "Add a workspace path", choose: "Choose…", followGateway: "Follow the gateway policy", useDefault: "Use my default",
    everythingElse: "Everything else", notSaved: "Not saved.",
  };
  for (const [k, v] of Object.entries(expected)) check(`text.${k}`, T[k] === v, T[k]);
  check("vocabulary: no 'shared', no 'folder' in the table", !Object.values(T).some((v) => /shared|folder/i.test(v)), Object.values(T).filter((v) => /shared|folder/i.test(v)).join(" | "));
  check("no retired controls (other sessions, allow any, trust, never allowed)", !Object.values(T).some((v) => /Other sessions|Allow any|trust|Never allowed/i.test(v)));
  check("source: no 'Shared workspace' string and no automation mode", !/Shared workspace|mode === "automation"|onPut/.test(src));
}
// ---- One change at a time, through save(): the component calls save once per click (static
// render cannot click; the console's browser proof drives it — see tests/test_gateway_console_browser_r11w2.py).
check("css block", /af-workspace:begin[\s\S]*\.af-workspace__gateway[\s\S]*af-workspace:end/.test(css));
check("css: paths wrap (no horizontal scroll at 390 px)", /\.af-workspace__path\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));
check("css: disabled mode looks disabled", /\.af-workspace__access-btn\[aria-disabled="true"\]\s*\{[^}]*cursor:\s*not-allowed/.test(css));

console.log(`check_workspace_chooser: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
