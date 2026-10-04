#!/usr/bin/env node
/**
 * ui-kit 0.8.1 (round 9): WorkspaceChooser — the shared folder model.
 *
 * Over the compiled dist (renderToStaticMarkup, no jsdom), like check_about:
 * 1. The shared workspace is ALWAYS shown, first, "Always on", never a switch.
 * 2. One switch per folder the GATEWAY lists (account: available_folders with
 *    their stored state; automation: the account's effective extras). A folder
 *    the admin did not allow never becomes a switch, and no PUT body / stored
 *    set built by the kit can contain it.
 * 3. "My folders" rows + Add only while own_folders_allowed; otherwise the
 *    sentence saying why (and the inactive sentence when own folders are kept).
 * 4. The effective line is the gateway's summary, prefixed "Agents may use:".
 * 5. Refusal = the gateway's sentence + "Not saved."; the wording table is
 *    the one every client copies.
 * Mutation-checked: dropping the shared row, the own-folders gate, or letting
 * a non-offered folder into a body turns this red.
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
  workspaceSelectionView,
  workspaceSelectionAfterToggle,
  workspaceExtraBody,
  workspaceAddOwnBody,
  workspaceRemoveOwnBody,
  workspacePolicyPath,
  workspaceChooserClient,
  workspaceRefusal,
} = kit;

const SHARED = "/srv/gw/workspaces";
const A = "/data/projects";
const B = "/data/notes";
const OWN = "/home/alice/thesis";
const DENIED = "/etc/secrets";

const effective = (over = {}) => ({
  account: "default:alice",
  shared_workspace: SHARED,
  folders: [
    { path: SHARED, source: "shared" },
    { path: A, source: "allowed" },
  ],
  available_folders: [
    { path: A, enabled: true },
    { path: B, enabled: false },
  ],
  own_folders_allowed: false,
  own_folders_inactive: false,
  never_allowed: [DENIED],
  launch_folder_trust: true,
  summary: "Shared workspace + 1 folder. Never: 1 folder.",
  ...over,
});
const state = (effOver = {}, policyOver = {}) => ({
  policy: { account: "default:alice", enabled_folders: [A], own_folders: [], ...policyOver },
  effective: effective(effOver),
});

const esc = (s) => s.replace(/'/g, "&#x27;");
const html = (props) => renderToStaticMarkup(React.createElement(WorkspaceChooser, props));
const switches = (h) => [...h.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
const label = (s) => (/aria-label="([^"]*)"/.exec(s) || [])[1];
const checked = (s) => /aria-checked="true"/.test(s);

// 1-2. Account mode, any folder NOT allowed.
{
  const h = html({ state: state(), onPut: async () => {} });
  check("title", h.includes(`>${T.title}<`));
  check("shared row present", h.includes('data-setting="workspace-shared"') && h.includes(SHARED), h);
  check("shared says Always on", h.includes('data-workspace="shared-always"') && h.includes(`>${T.sharedState}<`));
  check("shared row comes before every switch", h.indexOf('data-setting="workspace-shared"') < h.indexOf('role="switch"'));
  const sw = switches(h);
  check("one switch per admin-allowed folder", sw.length === 2, String(sw.length));
  check("switch A is ON (stored)", sw.some((s) => label(s) === A && checked(s)));
  check("switch B is OFF (default)", sw.some((s) => label(s) === B && !checked(s)));
  check("shared workspace is never a switch", !sw.some((s) => label(s) === SHARED));
  check("never-allowed folder is never a switch", !h.includes(DENIED));
  check("effective line = gateway summary", h.includes(`<strong>${T.effectivePrefix}</strong> Shared workspace + 1 folder. Never: 1 folder.`), h);
  check("own rows hidden while any folder is not allowed", !h.includes('data-workspace="own-add"') && !h.includes('data-workspace="own"'));
  check("why-hidden sentence", h.includes('data-workspace="own-hidden"') && h.includes(T.ownHidden));
  check("allowed help", h.includes(T.allowedHelp));
}
// A listed folder the gateway marks never allowed: shown, not switchable, with the reason.
{
  const h = html({ state: state({ available_folders: [{ path: A, enabled: false, never_allowed: true }, { path: B, enabled: false }] }), onPut: async () => {} });
  const sw = switches(h);
  const a = sw.find((s) => label(s) === A) || "";
  check("never-allowed listed folder is unavailable", /aria-disabled="true"/.test(a) && h.includes(T.neverAllowed), a);
  check("other folder stays switchable", !/aria-disabled/.test(sw.find((s) => label(s) === B) || "x aria-disabled"));
}
// Inactive own folders (allow_any_folder turned off by the admin).
{
  const h = html({ state: state({ own_folders_inactive: true }, { own_folders: [OWN] }), onPut: async () => {} });
  check("inactive sentence when own folders are kept", h.includes(T.ownInactive) && !h.includes('data-workspace="own"'));
}
// 3. Any folder allowed: My folders rows + Add.
{
  const h = html({ state: state({ own_folders_allowed: true, folders: [{ path: SHARED, source: "shared" }, { path: OWN, source: "own" }] }, { own_folders: [OWN] }), onPut: async () => {} });
  check("own row shown", h.includes(`data-workspace="own" data-path="${OWN}"`), h);
  check("own row has a Remove icon button", h.includes(`aria-label="${T.remove} ${OWN}"`));
  check("Add field + button", h.includes('data-workspace="own-add"') && h.includes('data-action="workspace-add-own"'));
  check("own title + help", h.includes(`>${T.ownTitle}<`) && h.includes(T.ownHelp));
  check("no why-hidden sentence", !h.includes(T.ownHidden));
}
{
  const h = html({ state: state({ own_folders_allowed: true }), onPut: async () => {} });
  check("own empty sentence", h.includes(T.ownEmpty));
}
// No allowed folders.
{
  const h = html({ state: state({ available_folders: [] }), onPut: async () => {} });
  check("no allowed folders sentence", h.includes(T.allowedEmpty) && switches(h).length === 0);
}
// Loading / load error / unavailable.
check("loading", html({ state: null, onPut: async () => {} }).includes('data-workspace="loading"'));
check("load error shown verbatim", html({ state: null, loadError: "Sign in first.", onPut: async () => {} }).includes(">Sign in first.<"));
{
  const h = html({ state: state(), unavailableReason: "Connect to your gateway first.", onPut: async () => {} });
  check("unavailable: switches aria-disabled with the reason", switches(h).every((s) => /aria-disabled="true"/.test(s)) && h.includes("Connect to your gateway first."));
}

// 2. Bodies only ever carry offered folders (the admin's allowance).
{
  const v = workspaceAccountView(state());
  check("toggle B on -> enabled_folders [A,B]", JSON.stringify(workspaceExtraBody(v, B, true)) === JSON.stringify({ enabled_folders: [A, B] }));
  check("toggle A off -> []", JSON.stringify(workspaceExtraBody(v, A, false)) === JSON.stringify({ enabled_folders: [] }));
  check("a folder the admin did not allow cannot be enabled", !workspaceExtraBody(v, DENIED, true).enabled_folders.includes(DENIED), JSON.stringify(workspaceExtraBody(v, DENIED, true)));
  const st = state({ own_folders_allowed: true }, { own_folders: [OWN] });
  check("add own appends", JSON.stringify(workspaceAddOwnBody(st, " /x/y ")) === JSON.stringify({ own_folders: [OWN, "/x/y"] }));
  check("remove own", JSON.stringify(workspaceRemoveOwnBody(st, OWN)) === JSON.stringify({ own_folders: [] }));
}

// Automation mode: the stored set, within the account's effective folders.
{
  const eff = effective({ folders: [{ path: SHARED, source: "shared" }, { path: A, source: "allowed" }, { path: OWN, source: "own" }] });
  const follows = workspaceSelectionView(eff, null);
  check("automation follows: every effective extra ON", follows.extras.every((r) => r.on) && follows.extras.length === 2 && follows.follows === true);
  check("automation follows: gateway summary", follows.summary === eff.summary);
  check("automation never offers an admin-allowed folder the account has not switched on", !follows.extras.some((r) => r.path === B));
  const pinned = workspaceSelectionView(eff, [OWN, DENIED]);
  check("automation stale/denied stored entry is not a row", !pinned.extras.some((r) => r.path === DENIED));
  const next = workspaceSelectionAfterToggle(pinned, A, true);
  check("automation toggle stores only offered folders", JSON.stringify(next) === JSON.stringify([A, OWN]), JSON.stringify(next));
  check("automation enabling a non-offered folder stores nothing new", JSON.stringify(workspaceSelectionAfterToggle(pinned, B, true)) === JSON.stringify([OWN]));
  check("automation summary formatted like the gateway line", pinned.summary === "Private session folder + Shared workspace (workspaces) + 1 folder." && workspaceSelectionView(eff, []).summary === "Private session folder + Shared workspace (workspaces).", pinned.summary);
  const h = html({ mode: "automation", effective: eff, selection: [OWN], onSelectionChange: () => {} });
  check("automation: shared always on", h.includes('data-workspace="shared-always"'));
  check("automation: switches = account's effective extras", switches(h).length === 2 && !h.includes(`aria-label="${B}"`));
  check("automation: Use this account's folders while a set is stored", h.includes('data-action="workspace-follow-account"') && h.includes(esc(T.automationUseAccount)));
  check("automation: no own rows, sentence instead", !h.includes('data-workspace="own-add"') && h.includes(esc(T.automationOwnHidden)));
  check("automation help", h.includes(esc(T.automationHelp)));
  const hr = html({ mode: "automation", subject: "run", effective: eff, selection: null, onSelectionChange: () => {} });
  check("run launch help (same rows)", hr.includes(esc(T.runHelp)) && switches(hr).length === 2);
  const hf = html({ mode: "automation", effective: eff, selection: null, onSelectionChange: () => {} });
  check("automation follows: sentence, no reset", hf.includes(esc(T.automationFollows)) && !hf.includes('data-action="workspace-follow-account"'));
}

// Client + refusal.
{
  check("route for me (relative, same-origin proxy)", workspacePolicyPath() === "api/gateway/workspace/policy/me", workspacePolicyPath());
  check("route for tenant:user with the console's base", workspacePolicyPath("default:alice", "/api/gateway/") === "/api/gateway/workspace/policy/default%3Aalice");
  const calls = [];
  const client = workspaceChooserClient(async (path, init) => {
    calls.push([path, init.method, init.body]);
    return { ok: true, ...state() };
  }, "bob");
  const loaded = await client.load();
  check("client load", loaded.effective.shared_workspace === SHARED && calls[0][0] === "api/gateway/workspace/policy/bob" && calls[0][1] === "GET");
  await client.put({ enabled_folders: [A] });
  check("client put", calls[1][1] === "PUT" && JSON.stringify(calls[1][2]) === JSON.stringify({ enabled_folders: [A] }));
  let threw = "";
  try {
    await workspaceChooserClient(async () => ({ ok: true, policy: { mode: "whitelist" } })).load();
  } catch (e) {
    threw = e.message;
  }
  check("client refuses a pre-round-9 answer loudly", /round-9 workspace model/.test(threw), threw);
  check("refusal keeps the gateway sentence + Not saved.", workspaceRefusal(new Error("Folder /etc/secrets is never allowed")) === "Folder /etc/secrets is never allowed. Not saved.");
}

// Wording table (every client copies it verbatim).
{
  const expected = {
    title: "Workspace folders",
    sharedLabel: "Shared workspace",
    sharedState: "Always on",
    allowedTitle: "Allowed folders",
    ownTitle: "My folders",
    effectivePrefix: "Agents may use:",
    notSaved: "Not saved.",
  };
  for (const [k, v] of Object.entries(expected)) check(`text.${k}`, T[k] === v, T[k]);
}
{
  const h = html({ state: state({ own_folders_allowed: true }, { own_folders: [OWN] }), onPut: async () => {} });
  const btn = (/<button[^>]*data-action="workspace-remove-own"[^>]*>/.exec(h) || [""])[0];
  check("remove: kit tooltip, no native title", btn.includes(`data-af-tip="${T.remove} ${OWN}"`) && !/ title=/.test(btn), btn);
}
check("css block", /af-workspace:begin[\s\S]*\.af-workspace__always[\s\S]*af-workspace:end/.test(css));
check("css: paths wrap (no horizontal scroll at 390 px)", /\.af-workspace__path\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));

console.log(`check_workspace_chooser: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
