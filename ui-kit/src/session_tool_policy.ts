// A conversation's tool policy on the gateway (session tool policy contract v1, 2026-10-27):
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
};

export type SessionToolPolicyClient = {
  supported: boolean;
  sessionId: string;
  get(): Promise<SessionToolPolicy | null>;
  replace(body: SessionToolPolicyBody): Promise<SessionToolPolicy>;
  merge(body: SessionToolPolicyBody): Promise<SessionToolPolicy>;
  reset(): Promise<{ revision?: number }>;
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
export const SESSION_TOOL_POLICY_UNSUPPORTED = "The gateway cannot store conversation policies";

export class SessionToolPolicyUnsupportedError extends Error {
  readonly code = "unsupported";
  constructor() {
    super(`${SESSION_TOOL_POLICY_UNSUPPORTED} (it does not advertise capabilities.session_tool_policy).`);
    this.name = "SessionToolPolicyUnsupportedError";
  }
}

/** 409 `{reason_code: "revision_conflict"}`: the policy changed since `if_revision` (another client). */
export class SessionToolPolicyConflictError extends Error {
  readonly code = "revision_conflict";
  /** The stored revision the gateway reported, when it did. */
  readonly revision?: number;
  constructor(message: string, revision?: number) {
    super(message || "This conversation's tool policy was changed elsewhere. Reload it and try again.");
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
    throw new Error("The gateway answered without a conversation tool policy (policy.version, revision, session_id, approve, deny, ask).");
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
 * The four routes for one conversation. `capability` is `sessionToolPolicyCapability(...)` of the
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
): SessionToolPolicyClient {
  const sid = String(sessionId ?? "");
  if (!SESSION_ID_PATTERN.test(sid)) throw new Error(`A session id is 1-256 characters [A-Za-z0-9_.:-], got ${JSON.stringify(sid)}.`);
  const supported = capability?.supported === true;
  const path = gatewayApiPath(sessionToolPolicyRoute(sid));
  const call = async (method: "GET" | "PUT" | "POST" | "DELETE", body?: unknown): Promise<Row | undefined> => {
    if (!supported) throw new SessionToolPolicyUnsupportedError();
    try {
      return obj(await request(path, body === undefined ? { method } : { method, body }));
    } catch (error) {
      throw conflictOf(error) ?? error;
    }
  };
  const withClient = (body: SessionToolPolicyBody): SessionToolPolicyBody =>
    opts.client && body.client === undefined ? { ...body, client: opts.client } : body;
  const written = (answer: Row | undefined): SessionToolPolicy => asSessionToolPolicy(answer?.policy);
  return {
    supported,
    sessionId: sid,
    async get() {
      const answer = await call("GET");
      if (!answer || !("policy" in answer)) throw new Error("The gateway answered without `policy` for this conversation.");
      return answer.policy === null ? null : asSessionToolPolicy(answer.policy);
    },
    replace: async (body) => written(await call("PUT", withClient(body))),
    merge: async (body) => written(await call("POST", withClient(body))),
    async reset() {
      const answer = await call("DELETE");
      return typeof answer?.revision === "number" ? { revision: answer.revision } : {};
    },
  };
}

/**
 * A session layer as a policy body (PUT). Mapping, for offered catalog tools with a canonical mode:
 *   auto → approve.tools · ask → ask · off → deny.tools
 * Limit: `deny` REFUSES a call with no wait ("Denied by this conversation's tool policy"), which is
 * stricter than "not offered"; the run's own ceiling (`allowed_tools` from planRunTools) still keeps
 * off tools out of the run, so the deny entry only matters for runs started elsewhere in the session.
 * Names the catalog does not offer are left out (the gateway would clamp an approval of them).
 */
export function sessionPolicyFromLayer(layer: ToolModeLayer | null | undefined, catalog: readonly ToolCatalogItem[]): SessionToolPolicyBody {
  const approve: string[] = [];
  const deny: string[] = [];
  const ask: string[] = [];
  for (const item of [...catalog].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!item.offered || !layer || !Object.prototype.hasOwnProperty.call(layer, item.name)) continue;
    const mode = normalizeToolMode(layer[item.name]);
    if (mode === "auto") approve.push(item.name);
    else if (mode === "off") deny.push(item.name);
    else if (mode === "ask") ask.push(item.name);
  }
  return { approve: { tools: approve }, deny: { tools: deny }, ask };
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
