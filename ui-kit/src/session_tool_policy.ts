// A chat's tool policy on the gateway (session tool policy contract v1, 2026-10-27):
// a durable, server-side "approve these tools / kinds / everything", "deny these", "keep asking
// for these" for one `session_id`. The runtime consults it BEFORE it decides to wait for an
// approval, so a covered call runs with no wait and a denied call is refused with no wait.
//
// Routes (all under /api/gateway, the caller's own plane):
//   GET    sessions/{id}/tool-policy   → {session_id, policy | null}
//   PUT    sessions/{id}/tool-policy   → replace          → {session_id, policy}
//   POST   sessions/{id}/tool-policy   → merge (union)    → {session_id, policy}
//   DELETE sessions/{id}/tool-policy   → reset            → {session_id, policy: null, revision}
// Feature gate: `GET discovery/capabilities` → capabilities.session_tool_policy.supported === true.
// On an older gateway the key is absent: the client keeps its local behaviour and SAYS so; a
// client built here with `supported: false` rejects every call with SESSION_TOOL_POLICY_UNSUPPORTED,
// so no caller can silently fall through to "saved".
//
// Bridge with the tool layers (backlog 0033): `sessionPolicyFromLayer` / `layerFromSessionPolicy`.
//
// WORDING: the user-facing noun is "chat" ("Allow for this chat", ADR 0001 §5, panel-chat); the code
// and the gateway say "session". Every sentence a person reads here says "chat".
//
// REVISIONS (review B1): every answer's revision is kept — GET's top-level `revision` (also with
// `policy: null`), PUT/POST `policy.revision`, DELETE's `revision` — so a host can guard EVERY write
// (`if_revision` on PUT, `reset(ifRevision)` → `DELETE ?if_revision=`). Contract v1 amendment
// requested (GET top-level revision; DELETE ?if_revision): both are served by the gateway
// implementation (routes/session_tool_policy.py get_session_tool_policy / delete_session_tool_policy)
// but not yet named by contract v1.
import { sessionToolPolicyRoute, SESSION_ID_PATTERN, gatewayApiPath } from "./gateway_paths.js";
import { normalizeToolMode, type ToolCatalogItem, type ToolMode, type ToolModeLayer } from "./tool_plan.js";

/** PUT / POST body (contract v1 §3). */
export type SessionToolPolicyBody = {
  approve?: { tools?: string[]; kinds?: string[]; all?: boolean; max_risk_rank?: number };
  deny?: { tools?: string[]; kinds?: string[] };
  ask?: string[];
  client?: string;
  if_revision?: number;
};

/** The stored, effective policy (contract v1 §3). `approve` / `deny` map each effective tool name
 * to the selector that put it there ("tool", "kind:<id>", "all"). */
export type SessionToolPolicy = {
  version: number;
  session_id: string;
  revision: number;
  approve: Record<string, string>;
  deny: Record<string, string>;
  ask: string[];
  request?: unknown;
  clamped?: { selector: string; name: string; reason: string }[];
  set_by?: { tenant_id?: string; user_id?: string; client?: string };
  set_at?: string;
  /** Where approve and deny apply, in the gateway's words (contract v1 revised §3). The implementation
   * serves it at the top level of every answer as `{approve, deny}` (gateway routes/session_tool_policy.py
   * :104, :115, :152; session_tool_policy.py:226-230 SCOPE); the kit copies it here untouched and never
   * composes it. */
  scope?: SessionToolPolicyScope;
};

/** The served `scope`: one sentence each for where approve and where deny apply. */
export type SessionToolPolicyScope = { approve?: string; deny?: string };

export type SessionToolPolicyClient = {
  supported: boolean;
  sessionId: string;
  get(): Promise<SessionToolPolicy | null>;
  replace(body: SessionToolPolicyBody): Promise<SessionToolPolicy>;
  merge(body: SessionToolPolicyBody): Promise<SessionToolPolicy>;
  /** `ifRevision` guards the reset (`DELETE ?if_revision=`; contract v1 amendment requested). */
  reset(ifRevision?: number): Promise<{ revision?: number; scope?: SessionToolPolicyScope }>;
};

/** The client this module builds: also the revision of the gateway's last answer (GET top-level
 * `revision` even with no policy, PUT/POST `policy.revision`, DELETE `revision`); undefined until an
 * answer carried one. A 409 does not move it: the host re-reads. */
export type SessionToolPolicyRevisionedClient = SessionToolPolicyClient & {
  readonly revision: number | undefined;
  /** The `scope` of the last answer (also with no policy), untouched; undefined when not served. */
  readonly scope: SessionToolPolicyScope | undefined;
};

/** `capabilities.session_tool_policy` as served (contract v1 §3). */
export type SessionToolPolicyCapability = {
  supported: boolean;
  version?: number;
  endpoint?: string;
  methods?: string[];
  approve?: string[];
  deny?: string[];
  ask?: boolean;
  record?: string;
  /** Why it is not supported, in the gateway's words. Served by the gateway implementation
   * (session_tool_policy.py `capability()`: `{supported: false, reason}`), not named by contract v1. */
  reason?: string;
};

/** The request function the host injects (its own credentials and base URL). It resolves with the
 * parsed JSON body and REJECTS on a non-2xx answer with a value carrying the status and the parsed
 * body (`{status, body}`, `{status, detail}` or an Error with those properties). */
export type SessionToolPolicyRequest = (
  path: string,
  init: { method: "GET" | "PUT" | "POST" | "DELETE"; body?: unknown },
) => Promise<unknown>;

/** The words every call of an unsupported client rejects with (and a UI can show). */
export const SESSION_TOOL_POLICY_UNSUPPORTED = "The gateway cannot store chat tool policies";
/** The words of a write the kit refuses because it could not be guarded by a revision. */
export const SESSION_TOOL_POLICY_NO_REVISION = "The gateway did not return a policy revision; refusing an unguarded write";

export class SessionToolPolicyUnsupportedError extends Error {
  readonly code = "unsupported";
  constructor() {
    super(`${SESSION_TOOL_POLICY_UNSUPPORTED} (it does not advertise capabilities.session_tool_policy).`);
    this.name = "SessionToolPolicyUnsupportedError";
  }
}

/** A write the kit refuses: no revision to guard it with (never an unguarded overwrite). */
export class SessionToolPolicyRevisionError extends Error {
  readonly code = "no_revision";
  constructor(detail?: string) {
    super(`${SESSION_TOOL_POLICY_NO_REVISION}${detail ? ` (${detail})` : ""}.`);
    this.name = "SessionToolPolicyRevisionError";
  }
}

/** 409 `{reason_code: "revision_conflict"}`: the policy changed since `if_revision` (another client). */
export class SessionToolPolicyConflictError extends Error {
  readonly code = "revision_conflict";
  /** The stored revision the gateway reported, when it did. */
  readonly revision?: number;
  constructor(message: string, revision?: number) {
    super(message || "This chat's tool policy was changed elsewhere. Reload it and try again.");
    this.name = "SessionToolPolicyConflictError";
    if (typeof revision === "number") this.revision = revision;
  }
}

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The `capabilities.session_tool_policy` object of a `GET discovery/capabilities` answer (or of its
 * `capabilities` object), or null when the gateway does not advertise it (an older gateway). */
export function sessionToolPolicyCapability(payload: unknown): SessionToolPolicyCapability | null {
  const body = obj(payload);
  const caps = obj(body?.capabilities) ?? body;
  const c = obj(caps?.session_tool_policy);
  if (!c) return null;
  return {
    supported: c.supported === true,
    ...(typeof c.version === "number" ? { version: c.version } : {}),
    ...(str(c.endpoint) ? { endpoint: str(c.endpoint) } : {}),
    ...(Array.isArray(c.methods) ? { methods: strList(c.methods) } : {}),
    ...(Array.isArray(c.approve) ? { approve: strList(c.approve) } : {}),
    ...(Array.isArray(c.deny) ? { deny: strList(c.deny) } : {}),
    ...(typeof c.ask === "boolean" ? { ask: c.ask } : {}),
    ...(str(c.record) ? { record: str(c.record) } : {}),
    ...(str(c.reason) ? { reason: str(c.reason) } : {}),
  };
}

const nameMap = (v: unknown): Record<string, string> | null => {
  const m = obj(v);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const [k, sel] of Object.entries(m)) if (typeof sel === "string") out[k] = sel;
  return out;
};

/** A served policy, checked: fails loudly on a missing field (never a half-read policy). */
export function asSessionToolPolicy(value: unknown): SessionToolPolicy {
  const p = obj(value);
  const approve = nameMap(p?.approve);
  const deny = nameMap(p?.deny);
  if (!p || typeof p.version !== "number" || typeof p.revision !== "number" || typeof p.session_id !== "string" || !approve || !deny || !Array.isArray(p.ask))
    throw new Error("The gateway answered without a chat tool policy (policy.version, revision, session_id, approve, deny, ask).");
  const clamped = Array.isArray(p.clamped)
    ? p.clamped.map(obj).filter((c): c is Row => Boolean(c)).map((c) => ({ selector: String(c.selector ?? ""), name: String(c.name ?? ""), reason: String(c.reason ?? "") }))
    : undefined;
  const setBy = obj(p.set_by);
  return {
    version: p.version,
    session_id: p.session_id,
    revision: p.revision,
    approve,
    deny,
    ask: strList(p.ask),
    ...("request" in p ? { request: p.request } : {}),
    ...(clamped ? { clamped } : {}),
    ...(setBy
      ? {
          set_by: {
            ...(typeof setBy.tenant_id === "string" ? { tenant_id: setBy.tenant_id } : {}),
            ...(typeof setBy.user_id === "string" ? { user_id: setBy.user_id } : {}),
            ...(typeof setBy.client === "string" ? { client: setBy.client } : {}),
          },
        }
      : {}),
    ...(typeof p.set_at === "string" ? { set_at: p.set_at } : {}),
  };
}

/** The served `scope` (`{approve, deny}` sentences), or undefined when absent or not that shape. */
export function sessionToolPolicyScope(value: unknown): SessionToolPolicyScope | undefined {
  const v = obj(value);
  if (!v) return undefined;
  const out: SessionToolPolicyScope = {};
  if (typeof v.approve === "string" && v.approve.trim()) out.approve = v.approve;
  if (typeof v.deny === "string" && v.deny.trim()) out.deny = v.deny;
  return out.approve || out.deny ? out : undefined;
}

function conflictOf(error: unknown): SessionToolPolicyConflictError | null {
  const e = obj(error) ?? (error instanceof Error ? (error as unknown as Row) : undefined);
  if (!e) return null;
  const body = obj(e.body);
  const detail = obj(e.detail) ?? obj(body?.detail) ?? body;
  const code = str(detail?.reason_code) || str(e.reason_code);
  if (code !== "revision_conflict" && !(e.status === 409 && !code)) return null;
  const rev = detail?.revision;
  return new SessionToolPolicyConflictError(str(detail?.message), typeof rev === "number" ? rev : undefined);
}

/**
 * The four routes for one chat (session). `sessionId` must be the run tree's ROOT session (contract
 * v1 revised §4.2: the runtime reads the grant of the root session; a child started with another
 * session id does not borrow it).
 * POST (`merge`) only ADDS: it never narrows and never re-expands an earlier all / kinds (revised §3);
 * anything that removes or narrows (a tool going Auto → Ask, a removal) is a guarded PUT (`replace`). `capability` is `sessionToolPolicyCapability(...)` of the
 * connected gateway; `supported` is true only when it says `supported: true`, and every call of an
 * unsupported client rejects with SessionToolPolicyUnsupportedError. `opts.client` names the app as
 * provenance (`client` in the body unless the body has its own). A 409 revision conflict rejects
 * with SessionToolPolicyConflictError; `clamped` is passed through untouched.
 */
export function createSessionToolPolicyClient(
  request: SessionToolPolicyRequest,
  sessionId: string,
  capability: SessionToolPolicyCapability | null | undefined,
  opts: { client?: string } = {},
): SessionToolPolicyRevisionedClient {
  const sid = String(sessionId ?? "");
  if (!SESSION_ID_PATTERN.test(sid)) throw new Error(`A session id is 1-256 characters [A-Za-z0-9_.:-], not only dots, got ${JSON.stringify(sid)}.`);
  const supported = capability?.supported === true;
  const path = gatewayApiPath(sessionToolPolicyRoute(sid));
  let revision: number | undefined;
  let scope: SessionToolPolicyScope | undefined;
  // The top-level `scope` rides on the policy (untouched) and is kept for "no policy" answers too.
  const withScope = (policy: SessionToolPolicy): SessionToolPolicy => (scope ? { ...policy, scope } : policy);
  const call = async (method: "GET" | "PUT" | "POST" | "DELETE", body?: unknown, query = ""): Promise<Row | undefined> => {
    if (!supported) throw new SessionToolPolicyUnsupportedError();
    // A gateway that lists its methods and leaves one out does not get it (review L5).
    if (capability?.methods && !capability.methods.includes(method))
      throw new Error(`${SESSION_TOOL_POLICY_UNSUPPORTED} with ${method} (the gateway advertises ${capability.methods.join(", ")}).`);
    try {
      return obj(await request(`${path}${query}`, body === undefined ? { method } : { method, body }));
    } catch (error) {
      throw conflictOf(error) ?? error;
    }
  };
  const withClient = (body: SessionToolPolicyBody): SessionToolPolicyBody =>
    opts.client && body.client === undefined ? { ...body, client: opts.client } : body;
  const written = (answer: Row | undefined): SessionToolPolicy => {
    const policy = asSessionToolPolicy(answer?.policy);
    revision = policy.revision;
    scope = sessionToolPolicyScope(answer?.scope);
    return withScope(policy);
  };
  return {
    supported,
    sessionId: sid,
    get revision() {
      return revision;
    },
    get scope() {
      return scope;
    },
    async get() {
      const answer = await call("GET");
      if (!answer || !("policy" in answer)) throw new Error("The gateway answered without `policy` for this chat.");
      const policy = answer.policy === null ? null : asSessionToolPolicy(answer.policy);
      // GET's top-level `revision` (contract v1 amendment requested) also covers "no policy yet".
      revision = typeof answer.revision === "number" ? answer.revision : policy ? policy.revision : undefined;
      scope = sessionToolPolicyScope(answer.scope);
      return policy ? withScope(policy) : null;
    },
    replace: async (body) => written(await call("PUT", withClient(body))),
    merge: async (body) => written(await call("POST", withClient(body))),
    async reset(ifRevision?: number) {
      if (ifRevision !== undefined && !Number.isInteger(ifRevision)) throw new Error(`reset(ifRevision) takes an integer revision, got ${JSON.stringify(ifRevision)}.`);
      // `DELETE ?if_revision=` (contract v1 amendment requested).
      const answer = await call("DELETE", undefined, ifRevision === undefined ? "" : `?if_revision=${ifRevision}`);
      revision = typeof answer?.revision === "number" ? answer.revision : undefined;
      scope = sessionToolPolicyScope(answer?.scope);
      // DELETE's `policy` is null: its top-level scope rides next to the revision.
      return { ...(revision === undefined ? {} : { revision }), ...(scope ? { scope } : {}) };
    },
  };
}

/**
 * A session layer as a policy body (PUT, a REPLACE). Mapping, for offered catalog tools with a
 * canonical mode:   auto → approve.tools · ask → ask · off → deny.tools
 * Deny reaches EVERY run of the session, automations and untrusted-input runs included, and wins over a
 * wait shown earlier and answered later; approve never reaches automation, untrusted-input or
 * entity-visit runs (contract v1 revised §4.3/3b).
 * Limit: `deny` REFUSES a call with no wait ("Denied by this conversation's tool policy", the runtime's words), which is
 * stricter than "not offered"; the run's own ceiling (`allowed_tools` from planRunTools) still keeps
 * off tools out of the run, so the deny entry only matters for runs started elsewhere in the session.
 *
 * `base` = the policy last read (review B2): a REPLACE must not erase what this editor cannot see.
 * - Entries for names this catalog does not offer (an MCP server down, a toolset disabled for now,
 *   a tool only another client lists) are carried unchanged: approve and deny entries set by tool
 *   name, and `ask` names. A lost deny is the dangerous direction.
 * - The request's selectors are carried unchanged: `approve.kinds`, `approve.all`,
 *   `approve.max_risk_rank`, `deny.kinds` (the gateway re-expands them at write time).
 * - An offered tool covered by a carried selector (served as "kind:<id>" / "all") whose mode here is
 *   Ask is put in `ask` (ask beats approve on the gateway). `all` / `kinds` include the tools whose
 *   destination the model chooses (fetch_url, browser_probe, send_email; revised §3): a layer that
 *   sets them to Ask always emits them in `ask`, which keeps them asking under any approve; `inherited` (the modes the session layer
 *   inherits) decides a tool the layer leaves out. A tool denied by a `deny.kinds` selector stays
 *   denied: the editor cannot lift a kind (the gateway's deny always wins).
 */
export function sessionPolicyFromLayer(
  layer: ToolModeLayer | null | undefined,
  catalog: readonly ToolCatalogItem[],
  opts: { base?: SessionToolPolicy | null; inherited?: Readonly<Record<string, ToolMode>> } = {},
): SessionToolPolicyBody {
  const approve = new Set<string>();
  const deny = new Set<string>();
  const ask = new Set<string>();
  const offered = new Set(catalog.filter((t) => t.offered).map((t) => t.name));
  const layerMode = (name: string): ToolMode | undefined =>
    layer && Object.prototype.hasOwnProperty.call(layer, name) ? normalizeToolMode(layer[name]) : undefined;
  for (const name of offered) {
    const mode = layerMode(name);
    if (mode === "auto") approve.add(name);
    else if (mode === "off") deny.add(name);
    else if (mode === "ask") ask.add(name);
  }
  const base = opts.base;
  const body: SessionToolPolicyBody = {};
  if (base) {
    for (const [name, sel] of Object.entries(base.approve)) if (!offered.has(name) && sel === "tool") approve.add(name);
    for (const [name, sel] of Object.entries(base.deny)) if (!offered.has(name) && sel === "tool") deny.add(name);
    for (const name of base.ask) if (!offered.has(name)) ask.add(name);
    for (const [name, sel] of Object.entries(base.approve)) {
      if (!offered.has(name) || sel === "tool") continue;
      const mode = layerMode(name) ?? opts.inherited?.[name];
      if (mode === "ask") ask.add(name);
    }
    const req = obj(base.request);
    const a = obj(req?.approve);
    const d = obj(req?.deny);
    if (Array.isArray(a?.kinds) && a!.kinds.length) body.approve = { kinds: strList(a!.kinds) };
    if (a?.all === true) body.approve = { ...(body.approve || {}), all: true };
    if (typeof a?.max_risk_rank === "number") body.approve = { ...(body.approve || {}), max_risk_rank: a.max_risk_rank };
    if (Array.isArray(d?.kinds) && d!.kinds.length) body.deny = { kinds: strList(d!.kinds) };
  }
  const sorted = (v: Set<string>) => [...v].sort();
  return {
    approve: { tools: sorted(approve), ...(body.approve || {}) },
    deny: { tools: sorted(deny), ...(body.deny || {}) },
    ask: sorted(ask),
  };
}

/** The body changes nothing: no tool, no selector, no ask (a REPLACE with it equals a reset). */
export function sessionPolicyBodyIsEmpty(body: SessionToolPolicyBody): boolean {
  return (
    !body.approve?.tools?.length && !body.approve?.kinds?.length && body.approve?.all !== true &&
    !body.deny?.tools?.length && !body.deny?.kinds?.length && !body.ask?.length
  );
}

/**
 * A served policy as a session layer over the catalog: approve → auto, deny → off (deny wins),
 * ask → ask (keeps asking even under approve). The gateway serves `approve` / `deny` already
 * EXPANDED to tool names (a `kind:<id>` or `all` selector is the value, the tool the key), so every
 * name maps whatever its selector; the kit never re-expands a selector against today's catalog (a
 * tool enabled after an `all` / `kinds` write is not covered: it asks, contract v1 §3). Names the
 * catalog does not offer are left out.
 */
export function layerFromSessionPolicy(policy: SessionToolPolicy | null | undefined, catalog: readonly ToolCatalogItem[]): ToolModeLayer {
  const out: Record<string, ToolMode> = {};
  if (!policy) return out;
  const offered = new Set(catalog.filter((t) => t.offered).map((t) => t.name));
  for (const name of Object.keys(policy.approve)) if (offered.has(name)) out[name] = "auto";
  for (const name of policy.ask) if (offered.has(name)) out[name] = "ask";
  for (const name of Object.keys(policy.deny)) if (offered.has(name)) out[name] = "off";
  return out;
}

/** "Not covered: send_email (not_authorized)" per clamped entry (the gateway's own reason codes). */
export function sessionPolicyClampedLines(policy: SessionToolPolicy | null | undefined): string[] {
  return (policy?.clamped || []).map((c) => `Not covered: ${c.name}${c.selector && c.selector !== "tools" ? ` (${c.selector})` : ""} (${c.reason})`);
}
