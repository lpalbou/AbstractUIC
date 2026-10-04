// WorkspaceChooser core (ui-kit 0.8.2, round 11 — DESIGN "R11.1 FINAL"):
// ONE workspace model, four levels, the same words everywhere.
//
//   gateway  the admin's ELIGIBLE set: a posture ("Deny everything, allow
//            listed workspaces" | "Allow everything, refuse listed
//            workspaces"), the default mode of everything else, and rows
//            whose mode is the CAP (Read-only | Read & write | Refused).
//   account  an account's own subset (humans and entities): the same two
//            postures applied within the eligible set, rows <= the cap.
//            configured:false = follow the gateway policy as it is.
//   session  one conversation's subset, stored on the session in the
//            gateway (every app opening it sees the same choice).
//            configured:false = the account default.
//   run      a one-off run without a session (Flow run window, Observer
//            launch, an automation definition): the same rows, nothing is
//            PUT by the kit — the host keeps the value (the start body's
//            `workspace`, or null = "Use my default") and passes the
//            gateway's dry-run answer as the effective workspaces.
//
// There is NO shared workspace: a run's private workspace is automatic and
// always read & write; everything else is a listed (or unlisted, posture b)
// workspace.
//
// The GATEWAY decides everything (R11 WORKSPACE API — FINAL, abstractgateway):
//   GET/PUT api/gateway/workspace/policy               -> {policy: {posture, default_mode, folders, builtin_refused, summary}}
//   GET/PUT api/gateway/workspace/policy/{account|me}  -> {policy: {account, configured, posture, default_mode, folders}, effective, can_edit}
//   GET/PUT api/gateway/sessions/{id}/workspaces       -> {policy: {session_id, configured, ...}, account_default, effective}
//   POST    api/gateway/workspace/effective/me {workspace} -> the effective shape (dry run, no write; the run level)
//   effective = {posture, default_mode, folders: [{path, mode, cap, source}], summary, gateway_summary}
// A refusal answers 400 {detail: {reason: "workspace_refused", message, path}};
// the kit shows `message` + "Not saved.".
//
// This module holds NO policy logic: no path validation, no clamp, no cap
// computation. Caps come from the gateway's `effective.folders[].cap`; the
// effective line and the gateway line are the gateway's own strings.
import { GATEWAY_API_PATH } from "./gateway_paths.js";

/** Read-only, Read & write, or Refused. */
export type WorkspaceMode = "ro" | "rw" | "deny";
/** The mode of everything not listed (posture b). */
export type WorkspaceAccess = "ro" | "rw";
export type WorkspacePosture = "allowed_only" | "any_except_denied";
export type WorkspaceLevel = "gateway" | "account" | "session" | "run";

/** One listed workspace. At the gateway level the mode is the CAP. */
export type WorkspaceRule = { path: string; mode: WorkspaceMode };

/** The policy read at one level (GET answer). `configured` is absent at the gateway level. */
export type WorkspacePolicy = {
  account?: string;
  configured?: boolean;
  posture: WorkspacePosture;
  default_mode: WorkspaceAccess;
  folders: WorkspaceRule[];
  /** Gateway level, admins only: paths the gateway always refuses (its data folder, credentials). */
  builtin_refused?: string[];
  /** Gateway level: the ceiling line (= every effective answer's gateway_summary). */
  summary?: string;
};

export type WorkspaceEffectiveRow = { path: string; mode: WorkspaceMode; cap: WorkspaceMode; source: "gateway" | "account" | "session" | string };

/** What applies (server-computed). `summary` and `gateway_summary` are shown verbatim. */
export type WorkspaceEffective = {
  posture: WorkspacePosture;
  default_mode: WorkspaceAccess;
  folders: WorkspaceEffectiveRow[];
  /** e.g. "Deny everything, allow listed workspaces · /Users/me/Pictures (rw) · /Users/me/Documents (ro)". */
  summary: string;
  /** The admin ceiling line, same format. */
  gateway_summary: string;
};

/**
 * Everything the chooser renders. `effective` is required below the gateway
 * level (caps, the effective line, the gateway line); the gateway level reads
 * its line from `policy.summary`. `can_edit: false` = shown, not changeable.
 */
export type WorkspaceChooserState = { policy: WorkspacePolicy; effective: WorkspaceEffective | null; can_edit?: boolean };

/** The run level's value: the start body's `workspace` (null = "Use my default"). */
export type WorkspaceRunValue = { posture: WorkspacePosture; default_mode: WorkspaceAccess; folders: WorkspaceRule[] };

/**
 * The ONE body every change sends (a full replacement, never a patch):
 * gateway {posture, default_mode, folders}; account/session/run
 * {configured: true, posture, default_mode, folders} or {configured: false}.
 */
export type WorkspacePayload =
  | { configured: false }
  | { configured?: true; posture: WorkspacePosture; default_mode: WorkspaceAccess; folders: WorkspaceRule[] };

/**
 * The ONE wording table. The console (islands `workspaceChooserText`),
 * AbstractCode, Observer, Flow and the AbstractAssistant (Qt;
 * abstractassistant/ui/settings/workspace_folders.py carries a verbatim copy,
 * diffed key by key in the gate) show exactly these strings. One key per
 * line, double-quoted (the parity script reads this block).
 */
export const WORKSPACE_CHOOSER_TEXT = {
  title: "Workspaces",
  gatewayTitle: "Eligible workspaces",
  gatewayHelp: "The workspaces accounts may choose from, and the most each one allows.",
  accountHelp: "The workspaces this account's agents use, among the eligible ones.",
  sessionHelp: "The workspaces this conversation uses, among the eligible ones.",
  runHelp: "The workspaces this run uses, among the eligible ones.",
  gatewayPrefix: "Gateway:",
  postureLabel: "Workspaces agents may use",
  postureAllowedOnly: "Deny everything, allow listed workspaces",
  postureAllowedOnlyHelp: "Agents may only work in the listed workspaces.",
  postureAnyExceptDenied: "Allow everything, refuse listed workspaces",
  postureAnyExceptDeniedHelp: "Agents may work in any workspace except the refused ones.",
  accessLabel: "Permission",
  accessRead: "Read-only",
  accessReadWrite: "Read & write",
  accessDenied: "Refused",
  capReadOnly: "The gateway allows this workspace read-only",
  capRefused: "The gateway refuses this workspace",
  everythingElse: "Everything else",
  allowedTitle: "Allowed workspaces",
  deniedTitle: "Refused workspaces",
  builtinRefused: "Always refused: the gateway's own data and credentials",
  emptyAllowed: "No workspace is listed: agents only use their private workspace.",
  privateNote: "The private workspace of each run is always available, read & write.",
  addPlaceholder: "Add a workspace path",
  add: "Add",
  choose: "Choose…",
  remove: "Remove",
  followGateway: "Follow the gateway policy",
  followGatewayHelp: "On: this account gets exactly what the gateway allows.",
  useDefault: "Use my default",
  useDefaultHelp: "On: the account's default workspaces apply.",
  locked: "These workspaces can be seen here but not changed.",
  loading: "Loading…",
  saved: "Saved",
  notSaved: "Not saved.",
} as const;

export type WorkspaceChooserText = typeof WORKSPACE_CHOOSER_TEXT;
const T = WORKSPACE_CHOOSER_TEXT;

export function workspacePostureLabel(posture: WorkspacePosture): string {
  return posture === "any_except_denied" ? T.postureAnyExceptDenied : T.postureAllowedOnly;
}
export function workspacePostureHelp(posture: WorkspacePosture): string {
  return posture === "any_except_denied" ? T.postureAnyExceptDeniedHelp : T.postureAllowedOnlyHelp;
}
export function workspaceModeLabel(mode: WorkspaceMode): string {
  return mode === "ro" ? T.accessRead : mode === "deny" ? T.accessDenied : T.accessReadWrite;
}
export function workspaceLevelHelp(level: WorkspaceLevel): string {
  return level === "gateway" ? T.gatewayHelp : level === "account" ? T.accountHelp : level === "session" ? T.sessionHelp : T.runHelp;
}

/** One row as shown. */
export type WorkspaceChooserRow = {
  path: string;
  mode: WorkspaceMode;
  /** The gateway's cap for this path (from effective.folders[].cap); null = none known / gateway level. */
  cap: WorkspaceMode | null;
  /** Modes that can be picked here. */
  allowed: WorkspaceMode[];
  /** Why a mode cannot be picked (the kit tooltip): per mode, or absent. */
  reasons: Partial<Record<WorkspaceMode, string>>;
  /** A gateway built-in refusal: fixed, no controls. */
  builtin: boolean;
  /** Can be changed / removed now. */
  editable: boolean;
};

export type WorkspaceChooserView = {
  level: WorkspaceLevel;
  posture: WorkspacePosture;
  /** account/session/run: configured:false (following the level above). Gateway: always false. */
  following: boolean;
  rows: WorkspaceChooserRow[];
  /** Posture b: the mode of everything not listed. */
  everythingElse: { mode: WorkspaceAccess; editable: boolean } | null;
  /** The add row is offered. */
  canAdd: boolean;
  /** "Gateway: <gateway_summary>" (hidden at the gateway level). */
  gatewayLine: string | null;
  /** The effective line, verbatim (the gateway level shows the ceiling line itself). */
  summary: string;
  /** can_edit false: shown, not changeable. */
  locked: boolean;
};

const ORDER: Record<WorkspaceMode, number> = { deny: 0, ro: 1, rw: 2 };
const MODES: WorkspaceMode[] = ["rw", "ro", "deny"];

/** The modes at or below the gateway's cap, and why the others are not offered. Cap null = all. */
export function workspaceModesUnderCap(cap: WorkspaceMode | null): { allowed: WorkspaceMode[]; reasons: Partial<Record<WorkspaceMode, string>> } {
  if (cap === null) return { allowed: [...MODES], reasons: {} };
  const reason = cap === "deny" ? T.capRefused : T.capReadOnly;
  const allowed = MODES.filter((m) => ORDER[m] <= ORDER[cap]);
  const reasons: Partial<Record<WorkspaceMode, string>> = {};
  for (const m of MODES) if (!allowed.includes(m)) reasons[m] = reason;
  return { allowed, reasons };
}

/** The rows and lines the chooser shows for one level. */
export function workspaceChooserView(level: WorkspaceLevel, state: WorkspaceChooserState): WorkspaceChooserView {
  const { policy } = state;
  const effective = state.effective;
  if (level === "gateway" ? typeof policy.summary !== "string" : !effective) {
    throw new Error(level === "gateway" ? "The gateway workspace policy has no summary line." : `A ${level}-level workspace chooser needs the gateway's effective workspaces.`);
  }
  const following = level !== "gateway" && policy.configured === false;
  const locked = state.can_edit === false;
  const caps = new Map((effective?.folders ?? []).map((f) => [f.path, f.cap] as const));
  // Following: show what applies (the level above, as the gateway computed it), read-only.
  const eff = effective as WorkspaceEffective;
  const source: WorkspaceRule[] = following ? eff.folders.map((f) => ({ path: f.path, mode: f.mode })) : policy.folders;
  const posture = following ? eff.posture : policy.posture;
  const defaultMode = following ? eff.default_mode : policy.default_mode;
  const editable = !following && !locked;
  const rows: WorkspaceChooserRow[] = source.map((r) => {
    const cap = level === "gateway" ? null : caps.get(r.path) ?? null;
    const { allowed, reasons } = workspaceModesUnderCap(cap);
    return { path: r.path, mode: r.mode, cap, allowed, reasons, builtin: false, editable };
  });
  if (level === "gateway") {
    for (const path of policy.builtin_refused ?? []) {
      rows.push({ path, mode: "deny", cap: null, allowed: [], reasons: {}, builtin: true, editable: false });
    }
  }
  return {
    level,
    posture,
    following,
    rows,
    everythingElse: posture === "any_except_denied" ? { mode: defaultMode, editable } : null,
    canAdd: editable,
    gatewayLine: level === "gateway" ? null : `${T.gatewayPrefix} ${eff.gateway_summary}`,
    summary: level === "gateway" ? (policy.summary as string) : eff.summary,
    locked,
  };
}

/** The mode a newly added workspace starts with: refused under posture b; allowed under a — Read & write for the admin, Read-only below (never above a cap). */
export function workspaceNewRowMode(level: WorkspaceLevel, posture: WorkspacePosture): WorkspaceMode {
  if (posture === "any_except_denied") return "deny";
  return level === "gateway" ? "rw" : "ro";
}

function body(level: WorkspaceLevel, p: Pick<WorkspacePolicy, "posture" | "default_mode" | "folders">): WorkspacePayload {
  const out = { posture: p.posture, default_mode: p.default_mode, folders: p.folders.map((r) => ({ path: r.path, mode: r.mode })) };
  return level === "gateway" ? out : { configured: true, ...out };
}

/** Change one row's mode. */
export function workspaceModePayload(level: WorkspaceLevel, policy: WorkspacePolicy, path: string, mode: WorkspaceMode): WorkspacePayload {
  return body(level, { ...policy, folders: policy.folders.map((r) => (r.path === path ? { path, mode } : r)) });
}
/** Change the posture (rows kept). */
export function workspacePosturePayload(level: WorkspaceLevel, policy: WorkspacePolicy, posture: WorkspacePosture): WorkspacePayload {
  return body(level, { ...policy, posture });
}
/** Change the mode of everything else (posture b). */
export function workspaceDefaultModePayload(level: WorkspaceLevel, policy: WorkspacePolicy, mode: WorkspaceAccess): WorkspacePayload {
  return body(level, { ...policy, default_mode: mode });
}
/** Add a workspace (trimmed; the gateway checks the path and answers its sentence when it refuses it). */
export function workspaceAddPayload(level: WorkspaceLevel, policy: WorkspacePolicy, path: string, mode?: WorkspaceMode): WorkspacePayload {
  const p = String(path).trim();
  return body(level, { ...policy, folders: [...policy.folders, { path: p, mode: mode ?? workspaceNewRowMode(level, policy.posture) }] });
}
/** Remove a workspace. */
export function workspaceRemovePayload(level: WorkspaceLevel, policy: WorkspacePolicy, path: string): WorkspacePayload {
  return body(level, { ...policy, folders: policy.folders.filter((r) => r.path !== path) });
}
/**
 * The follow switch ("Follow the gateway policy" / "Use my default"): ON =
 * {configured:false}; OFF = start from what applies now (the gateway's
 * effective answer, verbatim) as this level's own rows.
 */
export function workspaceFollowPayload(state: WorkspaceChooserState, follow: boolean): WorkspacePayload {
  if (follow) return { configured: false };
  const e = state.effective;
  if (!e) throw new Error("The follow switch needs the gateway's effective workspaces.");
  return { configured: true, posture: e.posture, default_mode: e.default_mode, folders: e.folders.map((f) => ({ path: f.path, mode: f.mode })) };
}

// ---- Routes + a thin client (the console passes base "/api/gateway"; apps use the relative default).
function trimBase(base: string): string {
  let b = String(base || "");
  while (b.endsWith("/")) b = b.slice(0, -1);
  return b;
}
export type WorkspaceTarget = { level: "gateway" } | { level: "account"; account?: string } | { level: "session"; session: string; account?: string };

/** The policy route of a level (`me` = the caller; a session of another account: admins pass `account`). */
export function workspacePolicyPath(target: WorkspaceTarget, base: string = GATEWAY_API_PATH): string {
  const b = trimBase(base);
  if (target.level === "gateway") return `${b}/workspace/policy`;
  if (target.level === "account") return `${b}/workspace/policy/${encodeURIComponent(target.account || "me")}`;
  if (!target.session) throw new Error("A session-level workspace chooser needs the session id.");
  return `${b}/sessions/${encodeURIComponent(target.session)}/workspaces${target.account ? `?account=${encodeURIComponent(target.account)}` : ""}`;
}
/** The dry-run route of the run level: POST {workspace: value | null} -> the effective workspaces, nothing stored. */
export function workspaceDryRunPath(account = "me", base: string = GATEWAY_API_PATH): string {
  return `${trimBase(base)}/workspace/effective/${encodeURIComponent(account)}`;
}

/** A host's request: (path, method, JSON body) -> parsed JSON; throws on 4xx/5xx (see workspaceErrorSentence). */
export type WorkspaceRequest = (path: string, init: { method: "GET" | "PUT" | "POST"; body?: unknown }) => Promise<unknown>;

const isMode = (m: unknown): m is WorkspaceMode => m === "ro" || m === "rw" || m === "deny";
const isAccess = (m: unknown): m is WorkspaceAccess => m === "ro" || m === "rw";
const isPosture = (p: unknown): p is WorkspacePosture => p === "allowed_only" || p === "any_except_denied";
const isRules = (v: unknown): boolean => Array.isArray(v) && v.every((r: any) => r && typeof r.path === "string" && isMode(r.mode));
const OLD_MODEL = "The gateway answered with an older workspace model (it needs the round-11 workspace API).";

/** The `policy` of an answer, checked (fails loudly on a missing field or an older model). */
export function workspaceAsPolicy(value: unknown, level: WorkspaceLevel): WorkspacePolicy {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const v = (raw.policy && typeof raw.policy === "object" ? raw.policy : {}) as Record<string, any>;
  if ("shared_workspace" in v || "shared_workspace" in raw) throw new Error(OLD_MODEL);
  const ok =
    isPosture(v.posture) && isAccess(v.default_mode) && isRules(v.folders) &&
    (level === "gateway" ? typeof v.summary === "string" : typeof v.configured === "boolean") &&
    (v.builtin_refused === undefined || (Array.isArray(v.builtin_refused) && v.builtin_refused.every((p: unknown) => typeof p === "string")));
  if (!ok) throw new Error(`The gateway answered without a workspace policy (policy.posture, default_mode, folders, ${level === "gateway" ? "summary" : "configured"}). ${OLD_MODEL}`);
  return {
    ...(typeof v.account === "string" ? { account: v.account } : {}),
    ...(level === "gateway" ? { summary: v.summary as string } : { configured: v.configured as boolean }),
    posture: v.posture,
    default_mode: v.default_mode,
    folders: v.folders.map((r: any) => ({ path: r.path, mode: r.mode })),
    ...(Array.isArray(v.builtin_refused) ? { builtin_refused: [...v.builtin_refused] } : {}),
  };
}
/** An effective answer (or an answer's `effective`), checked. */
export function workspaceAsEffective(value: unknown): WorkspaceEffective {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  if ("shared_workspace" in v) throw new Error(OLD_MODEL);
  const ok =
    isPosture(v.posture) && isAccess(v.default_mode) && typeof v.summary === "string" && typeof v.gateway_summary === "string" &&
    Array.isArray(v.folders) && v.folders.every((f: any) => f && typeof f.path === "string" && isMode(f.mode) && isMode(f.cap));
  if (!ok) throw new Error(`The gateway answered without the effective workspaces (posture, default_mode, folders with cap, summary, gateway_summary). ${OLD_MODEL}`);
  return { posture: v.posture, default_mode: v.default_mode, folders: v.folders.map((f: any) => ({ path: f.path, mode: f.mode, cap: f.cap, source: f.source })), summary: v.summary, gateway_summary: v.gateway_summary };
}
/** A level's GET/PUT answer -> the chooser state. */
export function workspaceAsState(value: unknown, level: WorkspaceLevel): WorkspaceChooserState {
  const policy = workspaceAsPolicy(value, level);
  const raw = value as Record<string, any>;
  return {
    policy,
    effective: level === "gateway" ? null : workspaceAsEffective(raw.effective),
    ...(typeof raw.can_edit === "boolean" ? { can_edit: raw.can_edit } : {}),
  };
}

/** A thin client over one level's route (apps bake no paths). load/save answer the full state. */
export function workspaceChooserClient(request: WorkspaceRequest, target: WorkspaceTarget, base: string = GATEWAY_API_PATH) {
  const path = workspacePolicyPath(target, base);
  return {
    path,
    load: async (): Promise<WorkspaceChooserState> => workspaceAsState(await request(path, { method: "GET" }), target.level),
    save: async (payload: WorkspacePayload): Promise<WorkspaceChooserState> => workspaceAsState(await request(path, { method: "PUT", body: payload }), target.level),
  };
}
/** The run level's dry run: what a run would get with this value (null = session > account > gateway). */
export function workspaceDryRun(request: WorkspaceRequest, account = "me", base: string = GATEWAY_API_PATH) {
  const path = workspaceDryRunPath(account, base);
  return async (workspace: WorkspaceRunValue | null, session?: string): Promise<WorkspaceEffective> =>
    workspaceAsEffective(await request(path, { method: "POST", body: session ? { workspace, session } : { workspace } }));
}

/**
 * The gateway's sentence from a refusal: an Error's message, or a 400 body
 * `{detail: {reason, message, path}}` / `{detail: "<sentence>"}` / `{message}`.
 */
export function workspaceErrorSentence(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const v = (error && typeof error === "object" ? error : {}) as Record<string, any>;
  const d = v.detail;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  if (typeof d === "string") return d;
  if (typeof v.message === "string") return v.message;
  return "";
}

/** A refusal for the row ("<gateway sentence> Not saved."). */
export function workspaceRefusal(error: unknown): string {
  const sentence = workspaceErrorSentence(error).trim() || "The gateway refused the change.";
  return `${sentence}${/[.!?]$/.test(sentence) ? "" : "."} ${T.notSaved}`;
}
