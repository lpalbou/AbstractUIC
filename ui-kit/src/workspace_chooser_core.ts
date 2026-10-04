// WorkspaceChooser core (ui-kit 0.8.1, round 9): the folder model every
// client shows — the admin allows, the account fine-tunes within it.
//
// The GATEWAY decides everything (R9 WORKSPACE API, abstractgateway):
//   GET  api/gateway/workspace/policy/{account}  -> {policy, gateway, effective}
//   PUT  api/gateway/workspace/policy/{account}  {enabled_folders?, own_folders?}
//        -> the same shape; a refused folder -> 4xx with a sentence.
// `{account}` is `me` (the caller), `user` or `tenant:user` (admin).
//
// This module holds NO policy logic: no path validation, no clamp, no deny
// check. It turns what the gateway answered into rows, and a click on a row
// into the PUT body the gateway will accept or refuse. A folder can only
// appear as a switch when the gateway listed it (available_folders for an
// account, effective folders for an automation), so a client cannot offer a
// folder the admin did not allow.
import { GATEWAY_API_PATH } from "./gateway_paths.js";

/** One effective folder: the shared workspace, an admin-allowed folder switched on, or one of the account's own. */
/** Folder permission (round 9 correction): the account may lower the admin's mode, never raise it. */
export type WorkspaceAccess = "ro" | "rw";

export type WorkspaceFolder = { path: string; source: "shared" | "allowed" | "own" | string; mode: WorkspaceAccess };

/** A stored folder row (account policy). */
export type WorkspaceRow = { path: string; mode?: WorkspaceAccess };

/** EFFECTIVE, as GET /workspace/effective/{account} and the policy reads answer it. */
export type WorkspaceEffective = {
  account?: string;
  shared_workspace: string;
  folders: WorkspaceFolder[];
  /** `mode` = the admin's ceiling; `enabled_mode` = this account's mode (null when off). */
  available_folders: { path: string; mode: WorkspaceAccess; enabled: boolean; enabled_mode: WorkspaceAccess | null; never_allowed?: boolean }[];
  own_folders_allowed: boolean;
  own_folders_inactive?: boolean;
  never_allowed?: string[];
  launch_folder_trust?: boolean;
  /** The gateway's one line ("Private session folder + Shared workspace (work) + 2 folders…"). */
  summary: string;
  /** The gateway's posture (round 9 amendments): deny by default, or allow by default except never-allowed folders. */
  posture: WorkspacePosture;
  /** True: this account's agents may use any folder except never-allowed ones (posture any_except_denied, no own folders listed). */
  any_folder: boolean;
};

export type WorkspacePosture = "allowed_only" | "any_except_denied";

/** ACCOUNT POLICY (stored): `enabled_folders` ⊆ the admin's allowed folders, `own_folders` only while any folder is allowed. */
export type WorkspaceAccountPolicy = { account?: string; enabled_folders: WorkspaceRow[]; own_folders: WorkspaceRow[] };

/** GET/PUT /workspace/policy/{account} answer. */
export type WorkspaceAccountState = { policy: WorkspaceAccountPolicy; effective: WorkspaceEffective };

/**
 * The ONE wording table. The console (per-account modal), AbstractCode and
 * the AbstractAssistant (Qt; abstractassistant/ui/settings/workspace_text.py
 * carries a verbatim copy, checked by its tests) show exactly these strings.
 */
export const WORKSPACE_CHOOSER_TEXT = {
  title: "Workspace folders",
  postureAllowedOnly: "Only allowed folders",
  postureAnyExceptDenied: "Any folder except denied",
  postureAllowedOnlyHelp: "Agents may use the shared workspace and the folders turned on here, nothing else.",
  postureAnyExceptDeniedHelp: "Agents may use any folder except the never-allowed ones, or only the folders added here.",
  anyFolderNote: "No folders added: agents may use any folder except the never-allowed ones. Adding a folder narrows them to the folders listed.",
  neverTitle: "Never allowed",
  accessLabel: "Permission",
  accessRead: "Read-only",
  accessReadWrite: "Read & write",
  accessCeiling: "The gateway admin allows read only.",
  foldersTitle: "Folders",
  help: "The folders agents may use. The shared workspace is always on; other folders the gateway admin allows can be turned on.",
  sharedLabel: "Shared workspace",
  sharedState: "Always on",
  sharedHelp: "Every agent can always use it. Each conversation also keeps a private folder of its own.",
  neverAllowed: "Never allowed on this gateway.",
  allowedTitle: "Allowed folders",
  allowedHelp: "Allowed by the gateway admin. Off until turned on.",
  allowedEmpty: "The gateway admin has not allowed other folders.",
  ownTitle: "My folders",
  ownHelp: "Added by this account (the gateway allows any folder except denied).",
  ownHidden: "Folders of your own can be added when the gateway admin chooses Any folder except denied.",
  ownInactive: "Your own folders are kept but unused until the gateway admin chooses Any folder except denied again.",
  ownPlaceholder: "/absolute/path/to/folder",
  add: "Add",
  remove: "Remove",
  effectivePrefix: "Agents may use:",
  saved: "Saved",
  notSaved: "Not saved.",
  // An automation keeps its own set, within the account's folders.
  automationHelp: "The folders this automation's runs may use, chosen among this account's folders.",
  runHelp: "The folders this run may use, chosen among this account's folders.",
  automationFollows: "Follows this account's folders.",
  automationUseAccount: "Use this account's folders",
  automationOwnHidden: "Add folders of your own in the account's workspace settings.",
} as const;

export type WorkspaceChooserText = typeof WORKSPACE_CHOOSER_TEXT;

/** The last path segment (the row's name); the full path is shown under it. */
export function workspaceFolderName(path: string): string {
  const parts = String(path || "").split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(path || "");
}

/** `blocked`: the gateway marks this folder never allowed (shown, not switchable). */
export type WorkspaceChooserRow = { path: string; name: string; on: boolean; blocked?: boolean; access: WorkspaceAccess; ceiling: WorkspaceAccess };

export type WorkspaceChooserView = {
  posture: WorkspacePosture;
  /** The gateway's never-allowed folders (shown as chips). */
  never: string[];
  shared: { path: string; name: string };
  /** Switch rows: account mode = the admin's allowed folders; automation mode = the account's effective extras. */
  extras: WorkspaceChooserRow[];
  /** "My folders" rows (account mode only). */
  own: { visible: boolean; rows: string[]; note: string | null };
  /** The permission of each own folder (from effective.folders). */
  ownAccess: Record<string, WorkspaceAccess>;
  /** Account mode: the account currently reaches any folder except never-allowed ones. */
  anyFolder: boolean;
  /** The one effective line, without the prefix. */
  summary: string;
  /** Automation mode: the automation stores no set and follows the account. */
  follows: boolean;
};

/** Account mode: the account's own policy (Assistant settings, Code conversations, the console's per-account modal). */
export function workspaceAccountView(state: WorkspaceAccountState): WorkspaceChooserView {
  const eff = state.effective;
  const ownStored = Array.isArray(state.policy?.own_folders) ? state.policy.own_folders : [];
  return {
    posture: eff.posture,
    never: eff.never_allowed || [],
    shared: { path: eff.shared_workspace, name: workspaceFolderName(eff.shared_workspace) },
    extras: (eff.available_folders || []).map((f) => ({ path: f.path, name: workspaceFolderName(f.path), on: f.enabled === true, access: f.enabled_mode ?? f.mode, ceiling: f.mode, ...(f.never_allowed === true ? { blocked: true } : {}) })),
    ownAccess: Object.fromEntries(ownStored.map((r) => [r.path, r.mode ?? "rw"])),
    own: {
      visible: eff.own_folders_allowed === true,
      rows: eff.own_folders_allowed === true ? ownStored.map((r) => r.path) : [],
      note: eff.own_folders_allowed === true ? null : eff.own_folders_inactive && ownStored.length ? WORKSPACE_CHOOSER_TEXT.ownInactive : WORKSPACE_CHOOSER_TEXT.ownHidden,
    },
    summary: eff.summary,
    anyFolder: eff.any_folder === true,
    follows: false,
  };
}

/** The display line for an automation's chosen set (formatting only; the gateway's own line template). */
export function workspaceSelectionSummary(count: number, sharedName = ""): string {
  const shared = sharedName ? `Shared workspace (${sharedName})` : "Shared workspace";
  return `Private session folder + ${shared}${count ? ` + ${count} folder${count === 1 ? "" : "s"}` : ""}.`;
}

/**
 * Automation mode: the definition stores its chosen folders
 * (`input_data.workspace_allowed_paths`); `selection === null` = nothing
 * stored, the runs follow the account's effective folders.
 */
export function workspaceSelectionView(effective: WorkspaceEffective, selection: string[] | null): WorkspaceChooserView {
  const offeredFolders = (effective.folders || []).filter((f) => f.source !== "shared");
  const offered = offeredFolders.map((f) => f.path);
  const chosen = new Set(selection ?? offered);
  const extras = offeredFolders.map((f) => ({ path: f.path, name: workspaceFolderName(f.path), on: chosen.has(f.path), access: f.mode, ceiling: f.mode }));
  return {
    posture: effective.posture,
    never: effective.never_allowed || [],
    shared: { path: effective.shared_workspace, name: workspaceFolderName(effective.shared_workspace) },
    extras,
    own: { visible: false, rows: [], note: WORKSPACE_CHOOSER_TEXT.automationOwnHidden },
    ownAccess: {},
    anyFolder: false,
    summary: selection === null ? effective.summary : workspaceSelectionSummary(extras.filter((r) => r.on).length, workspaceFolderName(effective.shared_workspace)),
    follows: selection === null,
  };
}

/**
 * The automation's next stored set after one switch: built from the ROWS
 * shown (so only folders the gateway offered can ever be stored; a stale
 * entry that is no longer offered drops out).
 */
export function workspaceSelectionAfterToggle(view: WorkspaceChooserView, path: string, on: boolean): string[] {
  return view.extras.filter((r) => (r.path === path ? on : r.on)).map((r) => r.path);
}

/** The posture's badge and sentence. */
export function workspacePostureText(posture: WorkspacePosture): { label: string; help: string } {
  return posture === "any_except_denied"
    ? { label: WORKSPACE_CHOOSER_TEXT.postureAnyExceptDenied, help: WORKSPACE_CHOOSER_TEXT.postureAnyExceptDeniedHelp }
    : { label: WORKSPACE_CHOOSER_TEXT.postureAllowedOnly, help: WORKSPACE_CHOOSER_TEXT.postureAllowedOnlyHelp };
}

/** PUT bodies for the account policy: whole rows; the gateway validates every folder and mode. */
export function workspaceExtraBody(view: WorkspaceChooserView, path: string, on: boolean): { enabled_folders: WorkspaceRow[] } {
  return {
    enabled_folders: view.extras
      .filter((r) => (r.path === path ? on : r.on))
      .map((r) => (r.path === path && on && !r.on ? { path: r.path } : { path: r.path, mode: r.access })),
  };
}
/** PUT body for one folder's permission (Read-only / Read & write); the gateway refuses raising above the admin's mode. */
export function workspaceAccessBody(view: WorkspaceChooserView, state: WorkspaceAccountState, path: string, mode: WorkspaceAccess): { enabled_folders: WorkspaceRow[] } | { own_folders: WorkspaceRow[] } {
  if (view.extras.some((r) => r.path === path)) {
    return { enabled_folders: view.extras.filter((r) => r.on).map((r) => ({ path: r.path, mode: r.path === path ? mode : r.access })) };
  }
  return { own_folders: state.policy.own_folders.map((r) => ({ path: r.path, mode: r.path === path ? mode : r.mode ?? "rw" })) };
}
export function workspaceAccessLabel(mode: WorkspaceAccess): string {
  return mode === "ro" ? WORKSPACE_CHOOSER_TEXT.accessRead : WORKSPACE_CHOOSER_TEXT.accessReadWrite;
}
export function workspaceAddOwnBody(state: WorkspaceAccountState, path: string): { own_folders: WorkspaceRow[] } {
  return { own_folders: [...state.policy.own_folders, { path: String(path).trim() }] };
}
export function workspaceRemoveOwnBody(state: WorkspaceAccountState, path: string): { own_folders: WorkspaceRow[] } {
  return { own_folders: state.policy.own_folders.filter((r) => r.path !== path) };
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

const isMode = (m: unknown): m is WorkspaceAccess => m === "ro" || m === "rw";
/** Stored rows as the gateway answers them ({path, mode}); a bare string is a row without a mode. */
function rows(value: unknown): WorkspaceRow[] {
  return (Array.isArray(value) ? value : []).flatMap((r: any): WorkspaceRow[] =>
    typeof r === "string" ? [{ path: r }] : r && typeof r.path === "string" ? [{ path: r.path, ...(isMode(r.mode) ? { mode: r.mode } : {}) }] : [],
  );
}

function asState(value: unknown): WorkspaceAccountState {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const e = v.effective;
  if (!e || typeof e !== "object" || typeof e.shared_workspace !== "string" || (e.posture !== "allowed_only" && e.posture !== "any_except_denied") || typeof e.any_folder !== "boolean" || !(e.available_folders || []).every((f: any) => f && isMode(f.mode) && (f.enabled_mode === null || isMode(f.enabled_mode))) || !(e.folders || []).every((f: any) => f && isMode(f.mode))) {
    // Fail loudly: an older gateway (no R9 workspace model) must not render an empty chooser.
    throw new Error("The gateway answered without a workspace policy (it needs the round-9 workspace model).");
  }
  const policy = v.policy && typeof v.policy === "object" ? v.policy : {};
  return {
    policy: {
      account: policy.account,
      enabled_folders: rows(policy.enabled_folders),
      own_folders: rows(policy.own_folders),
    },
    effective: v.effective as WorkspaceEffective,
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
