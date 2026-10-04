#!/usr/bin/env node
/**
 * ui-kit 0.8.1 (round 9 FINAL wording): WorkspaceChooser — the shared folder model.
 *
 * Over the compiled dist (renderToStaticMarkup, no jsdom), like check_about:
 * 1. The posture is shown ("Only allowed folders" / "Any folder except denied").
 * 2. The shared workspace is ALWAYS shown, first, "Read & write" + "Always on".
 * 3. One row per folder the GATEWAY lists, each with Read & write / Read-only /
 *    Denied; the account may lower the admin's mode, never raise it (a higher
 *    mode is unavailable). PUT bodies never carry "rw".
 * 4. Posture b only: "Everything else" with the default mode, and the add row.
 *    Posture a: no add row, one sentence says only the admin adds folders.
 * 5. The effective line is the gateway's summary, verbatim.
 * 6. Nothing else: no Other sessions, no allow-any switch, no launch-folder trust.
 * Mutation-checked: dropping the shared row, the posture gate on the add row,
 * or letting an account raise a mode turns this red.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");

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
  workspaceAccountView,
  workspaceModeBody,
  workspaceDefaultModeBody,
  workspaceAddRowBody,
  workspaceRemoveRowBody,
  workspaceSelectionView,
  workspaceSelectionAfterToggle,
  workspacePolicyPath,
  workspaceChooserClient,
  workspaceRefusal,
} = kit;

const SHARED = "/srv/gw/workspaces";
const P = "/data/project";
const AR = "/archive";
const SEC = "/secrets";
const X = "/elsewhere";
const LINE_A = "Deny everything, allow listed workspaces · Shared workspace (rw) · /data/project (rw) · /archive (ro)";
const LINE_B = "Allow everything, refuse listed workspaces (rw) · Shared workspace (rw) · /secrets (denied) · /archive (ro)";

const stateA = (accountFolders = [], over = {}) => ({
  policy: { account: "default:alice", default_mode: null, folders: accountFolders },
  gateway: { shared_workspace: SHARED, posture: "allowed_only", default_mode: "rw", folders: [{ path: P, mode: "rw" }, { path: AR, mode: "ro" }] },
  effective: {
    account: "default:alice", posture: "allowed_only", default_mode: null, shared_workspace: SHARED,
    folders: [{ path: SHARED, mode: "rw", source: "shared" }, { path: P, mode: "rw", source: "gateway" }, { path: AR, mode: "ro", source: "gateway" }],
    summary: LINE_A, ...over,
  },
});
const stateB = (accountFolders = [], defaultMode = null) => ({
  policy: { account: "default:alice", default_mode: defaultMode, folders: accountFolders },
  gateway: { shared_workspace: SHARED, posture: "any_except_denied", default_mode: "rw", folders: [{ path: SEC, mode: "deny" }, { path: AR, mode: "ro" }] },
  effective: {
    account: "default:alice", posture: "any_except_denied", default_mode: defaultMode ?? "rw", shared_workspace: SHARED,
    folders: [{ path: SHARED, mode: "rw", source: "shared" }, { path: SEC, mode: "deny", source: "gateway" }, { path: AR, mode: "ro", source: "gateway" }, ...accountFolders.map((r) => ({ ...r, source: "account" }))],
    summary: LINE_B,
  },
});

const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
const html = (props) => renderToStaticMarkup(React.createElement(WorkspaceChooser, props));
const rowHtml = (h, path) => (new RegExp(`<li[^>]*data-path="${path.replace(/\//g, "\\/")}"[\\s\\S]*?</li>`).exec(h) || [""])[0];
const btn = (s, mode) => (new RegExp(`<button[^>]*data-action="workspace-mode-${mode}"[^>]*>`).exec(s) || [""])[0];

// Posture a.
{
  const h = html({ state: stateA(), onPut: async () => {} });
  check("title", h.includes(`>${T.title}<`));
  check("posture badge: Only allowed folders", h.includes('data-posture="allowed_only"') && h.includes(`>${T.postureAllowedOnly}<`));
  check("shared row present and first", h.indexOf('data-setting="workspace-shared"') >= 0 && h.indexOf('data-setting="workspace-shared"') < h.indexOf('data-workspace="folder"'));
  check("shared row shows its path", (/data-setting="workspace-shared"[\s\S]*?<\/li>/.exec(h) || [""])[0].includes(SHARED));
  check("shared: Read & write + Always on", h.includes('data-workspace="shared-access"') && h.includes(`>${esc(T.accessReadWrite)}<`) && h.includes(`>${T.sharedState}<`));
  const p = rowHtml(h, P), a = rowHtml(h, AR);
  check("one row per gateway folder", [...h.matchAll(/data-workspace="folder"/g)].length === 2);
  check("rw folder: all three choices, Read & write pressed", /aria-pressed="true"/.test(btn(p, "rw")) && !/aria-disabled/.test(btn(p, "ro")) && !/aria-disabled/.test(btn(p, "deny")), p);
  check("ro folder: Read & write unavailable (cannot raise), tooltip says why", /aria-disabled="true"/.test(btn(a, "rw")) && btn(a, "rw").includes(`data-af-tip="${T.accessCeiling}"`) && /aria-pressed="true"/.test(btn(a, "ro")), a);
  check("posture a: no add row, the sentence instead", !h.includes('data-workspace="add"') && h.includes(T.adminOnlyAdds));
  check("posture a: no Everything else", !h.includes('data-workspace="everything-else"'));
  check("Allowed workspaces caption before the allowed rows", h.includes(`>${T.allowedTitle}<`) && h.indexOf(T.allowedTitle) < h.indexOf(`data-path="${P}"`) && !h.includes(T.deniedTitle));
  check("no visible 'folder' word", !/>[^<]*\bfolders?\b[^<]*</i.test(h), (/>[^<]*\bfolders?\b[^<]*</i.exec(h) || [""])[0]);
  check("effective line = gateway summary, verbatim", h.includes(`data-workspace="effective">${esc(LINE_A)}<`));
  check("nothing else (no sessions, no allow-any, no trust, no never-allowed control)", !/Other sessions|Allow any|launch folder|Launch folder|Never allowed/.test(h));
}
// Account narrowing shown + bodies.
{
  const st = stateA([{ path: AR, mode: "deny" }], { folders: [{ path: SHARED, mode: "rw", source: "shared" }, { path: P, mode: "rw", source: "gateway" }, { path: AR, mode: "deny", source: "gateway" }] });
  const h = html({ state: st, onPut: async () => {} });
  check("account-denied folder shows Denied pressed", /aria-pressed="true"/.test(btn(rowHtml(h, AR), "deny")));
  const v = workspaceAccountView(stateA());
  const rowP = v.rows.find((r) => r.path === P), rowA = v.rows.find((r) => r.path === AR);
  check("lower /data/project to Read-only -> one ro rule", JSON.stringify(workspaceModeBody(stateA(), rowP, "ro")) === JSON.stringify({ folders: [{ path: P, mode: "ro" }] }));
  check("deny /archive -> one deny rule", JSON.stringify(workspaceModeBody(stateA(), rowA, "deny")) === JSON.stringify({ folders: [{ path: AR, mode: "deny" }] }));
  check("back to the admin's mode removes the rule", JSON.stringify(workspaceModeBody(st, rowA, "ro")) === JSON.stringify({ folders: [] }));
  check("an account body never carries rw (cannot raise)", !JSON.stringify(workspaceModeBody(stateA(), rowA, "rw")).includes('"rw"'));
  check("choices never exceed the admin's mode", rowA.choices.join(",") === "ro,deny" && rowP.choices.join(",") === "rw,ro,deny");
}
// Posture b.
{
  const h = html({ state: stateB([{ path: X, mode: "ro" }]), onPut: async () => {} });
  check("posture badge: Any folder except denied", h.includes('data-posture="any_except_denied"') && h.includes(`>${T.postureAnyExceptDenied}<`));
  check("Denied workspaces caption before the denied row", h.includes(`>${T.deniedTitle}<`) && h.indexOf(T.deniedTitle) < h.indexOf(`data-path="${SEC}"`));
  check("gateway deny row is fixed Denied", rowHtml(h, SEC).includes('data-access="deny"') && !rowHtml(h, SEC).includes("workspace-mode-"));
  check("Everything else: default mode with Read & write / Read-only", /data-workspace="everything-else"[\s\S]*workspace-mode-rw[\s\S]*workspace-mode-ro/.test(h));
  check("account row with Remove", rowHtml(h, X).includes('data-workspace="account-row"') && h.includes(`aria-label="${T.remove} ${X}"`) && h.includes(`data-af-tip="${T.remove} ${X}"`));
  check("add row with Read-only / Denied + Add", /data-workspace="add"[\s\S]*workspace-mode-ro[\s\S]*workspace-mode-deny[\s\S]*workspace-add-row/.test(h));
  check("no admin-only sentence under b", !h.includes(T.adminOnlyAdds));
  check("effective line b verbatim", h.includes(esc(LINE_B)));
  check("lower Everything else -> default_mode ro", JSON.stringify(workspaceDefaultModeBody("ro")) === JSON.stringify({ default_mode: "ro" }) && JSON.stringify(workspaceDefaultModeBody("rw")) === JSON.stringify({ default_mode: null }));
  check("add a denied folder", JSON.stringify(workspaceAddRowBody(stateB(), " /tmp/x ", "deny")) === JSON.stringify({ folders: [{ path: "/tmp/x", mode: "deny" }] }));
  check("remove an account row", JSON.stringify(workspaceRemoveRowBody(stateB([{ path: X, mode: "ro" }]), X)) === JSON.stringify({ folders: [] }));
}
// Unavailable / loading / error.
check("loading", html({ state: null, onPut: async () => {} }).includes('data-workspace="loading"'));
check("load error shown verbatim", html({ state: null, loadError: "Sign in first.", onPut: async () => {} }).includes(">Sign in first.<"));
{
  const h = html({ state: stateA(), unavailableReason: "Connect to your gateway first.", onPut: async () => {} });
  const btns = [...h.matchAll(/<button[^>]*workspace-mode-[^>]*>/g)].map((m) => m[0]);
  check("unavailable: every mode button aria-disabled + reason", btns.length > 0 && btns.every((b) => /aria-disabled="true"/.test(b)) && h.includes("Connect to your gateway first."));
}
// Automation mode.
{
  const eff = stateA().effective;
  const follows = workspaceSelectionView(eff, null);
  check("automation follows: every effective ro/rw folder ON", follows.rows.length === 2 && follows.rows.every((r) => r.mode !== "deny") && follows.follows === true);
  check("automation follows: gateway summary", follows.summary === LINE_A);
  const pinned = workspaceSelectionView(eff, [AR, SEC]);
  check("automation stale/denied stored entry is not a row", !pinned.rows.some((r) => r.path === SEC));
  check("automation toggle stores only offered folders", JSON.stringify(workspaceSelectionAfterToggle(pinned, P, true)) === JSON.stringify([P, AR]));
  check("automation enabling a non-offered folder stores nothing new", JSON.stringify(workspaceSelectionAfterToggle(pinned, SEC, true)) === JSON.stringify([AR]));
  check("automation line in the gateway format", pinned.summary === "Deny everything, allow listed workspaces · Shared workspace (rw) · /archive (ro)", pinned.summary);
  const h = html({ mode: "automation", effective: eff, selection: [AR], onSelectionChange: () => {} });
  check("automation: shared always on", h.includes('data-workspace="shared-always"'));
  check("automation: switches = the account's folders", [...h.matchAll(/role="switch"/g)].length === 2);
  check("automation: Use this account's folders while a set is stored", h.includes('data-action="workspace-follow-account"') && h.includes(esc(T.automationUseAccount)));
  check("automation: no add row, no admin sentence", !h.includes('data-workspace="add"') && !h.includes(T.adminOnlyAdds));
  check("automation help", h.includes(esc(T.automationHelp)));
  const hr = html({ mode: "automation", subject: "run", effective: eff, selection: null, onSelectionChange: () => {} });
  check("run launch help (same rows)", hr.includes(esc(T.runHelp)) && hr.includes(esc(T.automationFollows)) && !hr.includes('data-action="workspace-follow-account"'));
}
// Client + refusal.
{
  check("route for me (relative, same-origin proxy)", workspacePolicyPath() === "api/gateway/workspace/policy/me", workspacePolicyPath());
  check("route for tenant:user with the console's base", workspacePolicyPath("default:alice", "/api/gateway/") === "/api/gateway/workspace/policy/default%3Aalice");
  const calls = [];
  const client = workspaceChooserClient(async (path, init) => {
    calls.push([path, init.method, init.body]);
    return { ok: true, ...stateA() };
  }, "bob");
  const loaded = await client.load();
  check("client load", loaded.effective.shared_workspace === SHARED && calls[0][0] === "api/gateway/workspace/policy/bob" && calls[0][1] === "GET");
  await client.put({ folders: [{ path: AR, mode: "deny" }] });
  check("client put", calls[1][1] === "PUT" && JSON.stringify(calls[1][2]) === JSON.stringify({ folders: [{ path: AR, mode: "deny" }] }));
  for (const [name, mutate] of [
    ["pre-round-9 answer", () => ({ ok: true, policy: { mode: "whitelist" } })],
    ["no posture", () => { const s = stateA(); delete s.effective.posture; return s; }],
    ["no folder modes", () => { const s = stateA(); s.gateway.folders = [{ path: P }]; return s; }],
    ["no summary", () => { const s = stateA(); delete s.effective.summary; return s; }],
  ]) {
    let threw = "";
    try { await workspaceChooserClient(async () => mutate()).load(); } catch (e) { threw = e.message; }
    check(`client refuses loudly: ${name}`, /round-9 workspace model/.test(threw), threw);
  }
  check("refusal keeps the gateway sentence + Not saved.", workspaceRefusal(new Error("A rule cannot raise /archive above read-only")) === "A rule cannot raise /archive above read-only. Not saved.");
}
// Wording table (every client copies it verbatim).
{
  const expected = {
    title: "Workspaces", postureAllowedOnly: "Deny everything, allow listed workspaces", postureAnyExceptDenied: "Allow everything, refuse listed workspaces", addPlaceholder: "Add a workspace path",
    allowedTitle: "Allowed workspaces", deniedTitle: "Refused workspaces",
    sharedLabel: "Shared workspace", sharedState: "Always on", accessRead: "Read-only", accessReadWrite: "Read & write", accessDenied: "Refused",
    everythingElse: "Everything else", notSaved: "Not saved.",
  };
  for (const [k, v] of Object.entries(expected)) check(`text.${k}`, T[k] === v, T[k]);
  check("no retired wording", !Object.values(T).some((v) => /Other sessions|Allow any|trust|Never allowed/i.test(v)));
  check("vocabulary: workspaces, never folders", !Object.values(T).some((v) => /folder/i.test(v)), Object.values(T).filter((v) => /folder/i.test(v)).join(" | "));
}
check("css block", /af-workspace:begin[\s\S]*\.af-workspace__always[\s\S]*af-workspace:end/.test(css));
check("css: paths wrap (no horizontal scroll at 390 px)", /\.af-workspace__path\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));

console.log(`check_workspace_chooser: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
