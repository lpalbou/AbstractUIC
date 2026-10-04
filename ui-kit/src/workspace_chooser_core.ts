// WorkspaceChooser core (ui-kit 0.8.1, round 9 FINAL wording): the folder
// model every client shows. Two dimensions only:
//   WHAT — the gateway's posture: (a) "Only allowed folders" (everything
//          denied, the listed folders allowed) or (b) "Any folder except
//          denied" (everything allowed at ONE default mode, the listed
//          folders denied or with their own mode). The shared workspace is
//          always in, Read & write.
//   HOW  — per folder, Read-only or Read & write (or Denied), granular.
// Accounts narrow only: lower a folder to Read-only, deny it, or lower the
// default mode (b) to Read-only. Never raise.
//
// The GATEWAY decides everything (R9 WORKSPACE API — FINAL, abstractgateway):
//   GET api/gateway/workspace/policy/{account} -> {policy: {account, default_mode, folders}, gateway, effective}
//   PUT api/gateway/workspace/policy/{account}    {default_mode?: "ro"|null, folders?: [{path, mode: "ro"|"deny"}]}
//       -> the same shape; a refused change -> 4xx with a sentence.
// `{account}` is `me` (the caller), `user` or `tenant:user` (admin).
//
// This module holds NO policy logic: no path validation, no clamp, no deny
// check. It turns what the gateway answered into rows, and a click into the
// PUT body the gateway accepts or refuses; the effective line is the
// gateway's own `summary`, shown verbatim.
import { GATEWAY_API_PATH } from "./gateway_paths.js";

/** A folder rule: Read-only, Read & write, or Denied. */
export type WorkspaceMode = "ro" | "rw" | "deny";
/** The posture's default for unlisted folders (b), or a folder's access. */
export type WorkspaceAccess = "ro" | "rw";
export type WorkspacePosture = "allowed_only" | "any_except_denied";

/** A folder rule row (gateway or account). */
export type WorkspaceRule = { path: string; mode: WorkspaceMode };

/** GATEWAY POLICY (the admin's). */
export type WorkspaceGatewayPolicy = {
  shared_workspace: string;
  posture: WorkspacePosture;
  /** The mode of every unlisted folder under any_except_denied. */
  default_mode: WorkspaceAccess;
  folders: WorkspaceRule[];
};

/** ACCOUNT POLICY (stored; narrows only). */
export type WorkspaceAccountPolicy = { account?: string; default_mode: "ro" | null; folders: { path: string; mode: "ro" | "deny" }[] };

/** EFFECTIVE (server-computed; what enforcement reads). */
export type WorkspaceEffective = {
  account?: string;
  posture: WorkspacePosture;
  /** Effective default for unlisted folders; null under allowed_only. */
  default_mode: WorkspaceAccess | null;
  shared_workspace: string;
  folders: { path: string; mode: WorkspaceMode; source: "shared" | "gateway" | "account" | string }[];
  /** The one line, verbatim: "Only allowed folders · Shared workspace (rw) · /data/project (rw) · /archive (ro)". */
  summary: string;
};

/** GET/PUT /workspace/policy/{account} answer. */
export type WorkspaceAccountState = { policy: WorkspaceAccountPolicy; gateway: WorkspaceGatewayPolicy; effective: WorkspaceEffective };

/**
 * The ONE wording table. The console (gateway + per-account modals, through
 * the islands' `workspaceChooserText`), AbstractCode, Observer, Flow and the
 * AbstractAssistant (Qt; abstractassistant/ui/settings/workspace_folders.py
 * carries a verbatim copy) show exactly these strings.
 */
export const WORKSPACE_CHOOSER_TEXT = {
  title: "Workspace folders",
  help: "Which folders agents may use, and how.",
  postureAllowedOnly: "Only allowed folders",
  postureAnyExceptDenied: "Any folder except denied",
  sharedLabel: "Shared workspace",
  sharedState: "Always on",
  accessLabel: "Permission",
  accessRead: "Read-only",
  accessReadWrite: "Read & write",
  accessDenied: "Denied",
  accessCeiling: "The gateway admin allows read only.",
  everythingElse: "Everything else",
  foldersTitle: "Folders",
  policyTitle: "Gateway policy",
  adminOnlyAdds: "Under Only allowed folders, only the gateway admin can add folders.",
  addPlaceholder: "/absolute/path/to/folder",
  add: "Add",
  remove: "Remove",
  saved: "Saved",
  notSaved: "Not saved.",
  // An automation (or one run) keeps its own set, within the account's folders.
  automationHelp: "The folders this automation's runs may use, chosen among this account's folders.",
  runHelp: "The folders this run may use, chosen among this account's folders.",
  automationFollows: "Follows this account's folders.",
  automationUseAccount: "Use this account's folders",
} as const;

export type WorkspaceChooserText = typeof WORKSPACE_CHOOSER_TEXT;

/** The last path segment; the full path is shown with it. */
export function workspaceFolderName(path: string): string {
  const parts = String(path || "").split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(path || "");
}

export function workspacePostureLabel(posture: WorkspacePosture): string {
  return posture === "any_except_denied" ? WORKSPACE_CHOOSER_TEXT.postureAnyExceptDenied : WORKSPACE_CHOOSER_TEXT.postureAllowedOnly;
}

export function workspaceModeLabel(mode: WorkspaceMode): string {
  return mode === "ro" ? WORKSPACE_CHOOSER_TEXT.accessRead : mode === "deny" ? WORKSPACE_CHOOSER_TEXT.accessDenied : WORKSPACE_CHOOSER_TEXT.accessReadWrite;
}

/** One row of the chooser: the admin's rule, what applies now, the choices an account has. */
export type WorkspaceChooserRow = {
  path: string;
  name: string;
  /** "gateway" = listed by the admin; "account" = added by this account (posture b). */
  origin: "gateway" | "account";
  /** The admin's mode for this path (account rows: the posture default). */
  adminMode: WorkspaceMode;
  /** What applies now. */
  mode: WorkspaceMode;
  /** The modes an account may pick here (narrowing only); empty = fixed. */
  choices: WorkspaceMode[];
};

export type WorkspaceChooserView = {
  posture: WorkspacePosture;
  shared: { path: string; name: string };
  rows: WorkspaceChooserRow[];
  /** Posture b: the default mode for everything else, and the account's choices. */
  everythingElse: { mode: WorkspaceAccess; choices: WorkspaceAccess[] } | null;
  /** Posture b: the account may add rows (deny or read-only a folder). */
  canAdd: boolean;
  /** The gateway's line, verbatim. */
  summary: string;
  /** Automation mode: nothing stored, the runs follow the account. */
  follows: boolean;
};

const ORDER: Record<WorkspaceMode, number> = { deny: 0, ro: 1, rw: 2 };
/** The narrowing choices at and below a ceiling: rw -> rw, ro, deny; ro -> ro, deny; deny -> fixed. */
function narrowing(ceiling: WorkspaceMode): WorkspaceMode[] {
  if (ceiling === "deny") return [];
  return (["rw", "ro", "deny"] as WorkspaceMode[]).filter((m) => ORDER[m] <= ORDER[ceiling]);
}

/** Account mode: the account's own narrowing (Assistant settings, Code conversations, the console's per-account modal). */
export function workspaceAccountView(state: WorkspaceAccountState): WorkspaceChooserView {
  const gw = state.gateway;
  const eff = state.effective;
  const accountRules = new Map(state.policy.folders.map((r) => [r.path, r.mode] as const));
  const effMode = new Map(eff.folders.map((f) => [f.path, f.mode] as const));
  const rows: WorkspaceChooserRow[] = gw.folders.map((r) => ({
    path: r.path,
    name: workspaceFolderName(r.path),
    origin: "gateway",
    adminMode: r.mode,
    mode: effMode.get(r.path) ?? accountRules.get(r.path) ?? r.mode,
    choices: narrowing(r.mode),
  }));
  const listed = new Set(gw.folders.map((r) => r.path));
  if (gw.posture === "any_except_denied") {
    for (const r of state.policy.folders) {
      if (listed.has(r.path)) continue;
      rows.push({ path: r.path, name: workspaceFolderName(r.path), origin: "account", adminMode: gw.default_mode, mode: effMode.get(r.path) ?? r.mode, choices: narrowing(gw.default_mode).filter((m) => m !== "rw") });
    }
  }
  return {
    posture: gw.posture,
    shared: { path: eff.shared_workspace, name: workspaceFolderName(eff.shared_workspace) },
    rows,
    everythingElse:
      gw.posture === "any_except_denied" ? { mode: (eff.default_mode ?? gw.default_mode) as WorkspaceAccess, choices: gw.default_mode === "rw" ? ["rw", "ro"] : [] } : null,
    canAdd: gw.posture === "any_except_denied",
    summary: eff.summary,
    follows: false,
  };
}

type AccountRule = { path: string; mode: "ro" | "deny" };

/** PUT body for one row's choice. Choosing the admin's mode removes the account's rule (Read & write is never stored). */
export function workspaceModeBody(state: WorkspaceAccountState, row: Pick<WorkspaceChooserRow, "path" | "adminMode" | "origin">, mode: WorkspaceMode): { folders: AccountRule[] } {
  const others = state.policy.folders.filter((r) => r.path !== row.path);
  if (mode === "rw" || (row.origin === "gateway" && mode === row.adminMode)) return { folders: others };
  return { folders: [...others, { path: row.path, mode }] };
}
/** PUT body for "Everything else" (posture b): Read-only lowers the default, Read & write follows the admin. */
export function workspaceDefaultModeBody(mode: WorkspaceAccess): { default_mode: "ro" | null } {
  return { default_mode: mode === "ro" ? "ro" : null };
}
/** PUT body adding an account row (posture b): a folder denied or read-only. */
export function workspaceAddRowBody(state: WorkspaceAccountState, path: string, mode: "ro" | "deny"): { folders: AccountRule[] } {
  return { folders: [...state.policy.folders, { path: String(path).trim(), mode }] };
}
/** PUT body removing an account row. */
export function workspaceRemoveRowBody(state: WorkspaceAccountState, path: string): { folders: AccountRule[] } {
  return { folders: state.policy.folders.filter((r) => r.path !== path) };
}

/** The display line for an automation's chosen set (the gateway's line format). */
export function workspaceSelectionSummary(effective: WorkspaceEffective, chosen: string[]): string {
  const modes = new Map(effective.folders.map((f) => [f.path, f.mode] as const));
  return [workspacePostureLabel(effective.posture), "Shared workspace (rw)", ...chosen.map((p) => `${p} (${modes.get(p) ?? "rw"})`)].join(" · ");
}

/**
 * Automation mode: the definition stores its chosen folders
 * (`input_data.workspace_allowed_paths`, which only narrows); `selection ===
 * null` = nothing stored, the runs follow the account's effective folders.
 * Rows = the account's effective ro/rw folders (never a denied one).
 */
export function workspaceSelectionView(effective: WorkspaceEffective, selection: string[] | null): WorkspaceChooserView {
  const offered = effective.folders.filter((f) => f.source !== "shared" && f.mode !== "deny");
  const chosen = new Set(selection ?? offered.map((f) => f.path));
  const rows: WorkspaceChooserRow[] = offered.map((f) => ({
    path: f.path,
    name: workspaceFolderName(f.path),
    origin: "gateway",
    adminMode: f.mode,
    mode: chosen.has(f.path) ? f.mode : "deny",
    choices: [],
  }));
  return {
    posture: effective.posture,
    shared: { path: effective.shared_workspace, name: workspaceFolderName(effective.shared_workspace) },
    rows,
    everythingElse: null,
    canAdd: false,
    summary: selection === null ? effective.summary : workspaceSelectionSummary(effective, offered.filter((f) => chosen.has(f.path)).map((f) => f.path)),
    follows: selection === null,
  };
}

/** The automation's next stored set after one row: built from the ROWS shown (only offered folders can be stored). */
export function workspaceSelectionAfterToggle(view: WorkspaceChooserView, path: string, on: boolean): string[] {
  return view.rows.filter((r) => (r.path === path ? on : r.mode !== "deny")).map((r) => r.path);
}

/**
 * The gateway route for an account's policy (`me` = the caller). Relative by
 * default (the kit's same-origin convention, GATEWAY_API_PATH); a host whose
 * API lives elsewhere passes its own base (the console: "/api/gateway").
 */
export function workspacePolicyPath(account = "me", base: string = GATEWAY_API_PATH): string {
  let b = String(base || "");
  while (b.endsWith("/")) b = b.slice(0, -1);
  return `${b}/workspace/policy/${encodeURIComponent(account)}`;
}

/** A host's request: (path as built by workspacePolicyPath, method, JSON body) -> parsed JSON; throws Error(sentence) on 4xx/5xx. */
export type WorkspaceRequest = (path: string, init: { method: "GET" | "PUT"; body?: unknown }) => Promise<unknown>;

const isMode = (m: unknown): m is WorkspaceMode => m === "ro" || m === "rw" || m === "deny";
const isAccess = (m: unknown): m is WorkspaceAccess => m === "ro" || m === "rw";
const isPosture = (p: unknown): p is WorkspacePosture => p === "allowed_only" || p === "any_except_denied";
const isRules = (v: unknown): boolean => Array.isArray(v) && v.every((r: any) => r && typeof r.path === "string" && isMode(r.mode));

function asState(value: unknown): WorkspaceAccountState {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const e = v.effective;
  const g = v.gateway;
  const p = v.policy;
  const ok =
    !!e && typeof e.shared_workspace === "string" && isPosture(e.posture) && (e.default_mode === null || isAccess(e.default_mode)) && isRules(e.folders) && typeof e.summary === "string" &&
    !!g && typeof g.shared_workspace === "string" && isPosture(g.posture) && isAccess(g.default_mode) && isRules(g.folders) &&
    !!p && (p.default_mode === null || p.default_mode === "ro" || p.default_mode === undefined) && isRules(p.folders ?? []);
  // Fail loudly: an older gateway (no round-9 FINAL model) must not render an empty chooser.
  if (!ok) throw new Error("The gateway answered without a workspace policy (it needs the round-9 workspace model).");
  return {
    policy: { account: p.account, default_mode: p.default_mode ?? null, folders: (p.folders ?? []).filter((r: any) => r.mode === "ro" || r.mode === "deny") },
    gateway: g as WorkspaceGatewayPolicy,
    effective: e as WorkspaceEffective,
  };
}

/** A thin client over the R9 routes for one account. Every write answers the new state. */
export function workspaceChooserClient(request: WorkspaceRequest, account = "me", base: string = GATEWAY_API_PATH) {
  const path = workspacePolicyPath(account, base);
  return {
    load: async (): Promise<WorkspaceAccountState> => asState(await request(path, { method: "GET" })),
    put: async (body: Record<string, unknown>): Promise<WorkspaceAccountState> => asState(await request(path, { method: "PUT", body })),
  };
}

/** A refusal's sentence for the row ("<gateway sentence> Not saved."). */
export function workspaceRefusal(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const sentence = raw.trim() || "The gateway refused the change.";
  return `${sentence}${/[.!?]$/.test(sentence) ? "" : "."} ${WORKSPACE_CHOOSER_TEXT.notSaved}`;
}
