// Where the person's tool layers live until the gateway stores them (gateway
// gaps 3 and 4: no per-app or per-session tool route yet). One kit-standard
// localStorage convention for every app, keyed by the gateway identity so two
// accounts on one browser never share choices:
//   af.tools.app.<interface>.<identity>        the app layer (sparse diffs)
//   af.tools.session.<identity>.<session_id>   one conversation's changes (newest 100 kept)
// The values are canonical sparse layers `{"modes": {name: "off"|"ask"|"auto"}}`.
//
// It is browser storage: the UI says so ("Saved in this browser"), never "saved
// for this Gateway account" (that would be a server promise this is not).
//
// ui-primitives (session-policy-kit): the SESSION layer moves to the gateway when it can store it
// (session tool policy contract v1): given `sessionPolicy(sessionId)` returning a client with
// `supported`, loadSession / saveSession / resetSession read and write the conversation's policy
// (GET, PUT, DELETE on "Use my defaults"); otherwise they use this browser and say so
// (`storage.kind: "browser"`, with a note when the gateway was asked and cannot).
// The session id is the run tree's ROOT session (the runtime reads the root's grant, contract v1
// revised §4.2). Writes are PUT (replace) and DELETE only, both revision-guarded: never POST, because
// a merge only adds and cannot express a narrowing save (Auto → Ask, a removal).
import { normalizeToolMode, type ToolCatalogItem, type ToolMode, type ToolModeDialect, type ToolModeLayer } from "./tool_plan.js";
import {
  layerFromSessionPolicy,
  sessionPolicyBodyIsEmpty,
  sessionPolicyFromLayer,
  SessionToolPolicyRevisionError,
  SESSION_TOOL_POLICY_UNSUPPORTED,
  type SessionToolPolicy,
  type SessionToolPolicyClient,
  type SessionToolPolicyScope,
} from "./session_tool_policy.js";

/** The words a host shows next to an editor backed by this store. */
export const TOOL_LAYER_STORE_WHERE = "Saved in this browser";
/** The words for a session layer the gateway stores (the chat's tool policy). "Chat" is the
 * user-facing noun of that scope ("Allow for this chat", ADR 0001 §5). */
export const TOOL_LAYER_GATEWAY_WHERE = "Saved for this chat on the gateway";
/** Said when the gateway was asked and cannot store a chat's policy (an older gateway). A fact about
 * STORAGE only (review L4): the choices take effect only where the host applies the browser layer
 * itself (planRunTools / toWorkflowApprovalPolicy); the gateway does not know them. */
export const TOOL_LAYER_BROWSER_FALLBACK = `${SESSION_TOOL_POLICY_UNSUPPORTED}, so this chat's tool choices are kept in this browser.`;

/** Where a layer lives, in words: `where` is the frame's label, `note` why it is not the gateway. */
export type ToolLayerStorage = { kind: "gateway" | "browser"; where: string; note?: string };
/** A loaded or saved session layer: the layer, where it lives, the gateway's policy when it is there,
 * and the gateway's `scope` words (also with no policy; undefined when not served). */
export type SessionLayerState = { storage: ToolLayerStorage; layer: ToolModeLayer; policy: SessionToolPolicy | null; scope?: SessionToolPolicyScope };

/** Conversations kept per identity (the watch keeps the newest 100 too, ToolPrefs.swift). */
export const TOOL_SESSION_LAYERS_MAX = 100;

/** abstractcode's identity tuple (workspace/app_state.ts:28-38): `[gateway_url, tenant, runtime, user || "session"]`. */
export function toolIdentityKey(id: { gatewayUrl?: string; tenantId?: string; runtimeId?: string; userId?: string }): string {
  const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return JSON.stringify([t(id.gatewayUrl), t(id.tenantId), t(id.runtimeId), t(id.userId) || "session"]);
}

/** getItem/setItem/removeItem, plus `key`/`length` (as localStorage has) to rebuild a lost index. */
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "key" | "length">>;

export type ToolLayerStore = {
  readonly identityKey: string;
  appKey(interfaceId: string): string;
  sessionKey(sessionId: string): string;
  readApp(interfaceId: string): ToolModeLayer;
  /** An empty or null layer removes the entry ("Use the gateway's"). */
  writeApp(interfaceId: string, layer: ToolModeLayer | null): void;
  readSession(sessionId: string): ToolModeLayer;
  /** An empty or null layer removes the entry ("Use my defaults"). Keeps the newest 100. */
  writeSession(sessionId: string, layer: ToolModeLayer | null): void;
  /** Stored conversation ids, newest first. */
  sessions(): string[];
  /** Where this conversation's layer lives: the gateway when `sessionPolicy` gives a supported client. */
  sessionStorage(sessionId: string): ToolLayerStorage;
  /** The conversation's layer from where it lives (GET of its policy on the gateway). */
  loadSession(sessionId: string, catalog: readonly ToolCatalogItem[]): Promise<SessionLayerState>;
  /** Save it there: a PUT guarded by the revision of the last read or reset (`if_revision`; a 409
   * rejects with SessionToolPolicyConflictError: re-read). Entries this catalog does not offer and the
   * request's kinds / all / max_risk_rank selectors are carried from the last read
   * (sessionPolicyFromLayer `base`). A body that changes nothing resets (a guarded DELETE). Never
   * unguarded: with no known revision (never loaded, or a gateway that serves none) it rejects with
   * SessionToolPolicyRevisionError. The answer is the gateway's effective policy as a layer.
   * `inherited`: the modes the session layer inherits (for tools a carried selector covers). */
  saveSession(
    sessionId: string,
    layer: ToolModeLayer | null,
    catalog: readonly ToolCatalogItem[],
    opts?: { inherited?: Readonly<Record<string, ToolMode>> },
  ): Promise<SessionLayerState>;
  /** "Use my defaults": a guarded DELETE of the chat's policy (same revision rule), or remove the
   * browser entry. */
  resetSession(sessionId: string): Promise<SessionLayerState>;
};

function clean(layer: unknown, dialect?: ToolModeDialect, dropped?: string[]): Record<string, ToolMode> {
  const modes = layer && typeof layer === "object" ? (layer as Record<string, unknown>) : {};
  const out: Record<string, ToolMode> = {};
  for (const [name, v] of Object.entries(modes)) {
    const m = normalizeToolMode(v, dialect);
    if (name.trim() && m) out[name.trim()] = m;
    else if (name.trim()) dropped?.push(name.trim());
  }
  return out;
}

export type ToolLayerStoreOptions = {
  storage?: StorageLike | null;
  /** The dialect of values another writer stored ("approve" is ask for "entity", auto for "desktop").
   * Without it a stored "approve" cannot be read and is reported through `onDropped`. */
  dialect?: ToolModeDialect;
  /** Told when a stored entry's values could not be read (non-canonical, no dialect): the storage
   * key and the tool names dropped, so the host can say so ("2 saved tool choices could not be read"). */
  onDropped?: (key: string, names: string[]) => void;
  /** The conversation's policy client (createSessionToolPolicyClient) for a session id, when the host
   * has a gateway connection. A client with `supported: false` keeps the layer in this browser and
   * the storage says why (TOOL_LAYER_BROWSER_FALLBACK). */
  sessionPolicy?: (sessionId: string) => SessionToolPolicyClient | null | undefined;
};

export function createToolLayerStore(identityKey: string, opts: ToolLayerStoreOptions = {}): ToolLayerStore {
  const identity = String(identityKey || "").trim();
  if (!identity) throw new Error("createToolLayerStore needs the gateway identity (toolIdentityKey).");
  const storage = (): StorageLike | null => {
    if (opts.storage !== undefined) return opts.storage;
    try {
      return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
    } catch {
      return null;
    }
  };
  const get = (key: string): unknown => {
    try {
      const raw = storage()?.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  };
  const set = (key: string, value: unknown | null) => {
    try {
      const s = storage();
      if (!s) return;
      if (value === null) s.removeItem(key);
      else s.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or blocked storage: the choice lasts this page only */
    }
  };
  const indexKey = `af.tools.sessions.${identity}`;
  const appKey = (interfaceId: string) => {
    const i = String(interfaceId || "").trim();
    if (!i) throw new Error("The app layer needs the app's interface id.");
    return `af.tools.app.${i}.${identity}`;
  };
  const sessionKey = (sessionId: string) => {
    const s = String(sessionId || "").trim();
    if (!s) throw new Error("The session layer needs a session id.");
    return `af.tools.session.${identity}.${s}`;
  };
  const sessionPrefix = `af.tools.session.${identity}.`;
  // The index orders conversations (newest first). When it is missing or unreadable, it is rebuilt
  // from the stored keys (order unknown, kept after), so no entry is orphaned past the 100 cap.
  const sessions = (): string[] => {
    const v = get(indexKey);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && Boolean(x));
    const s = storage();
    const out: string[] = [];
    try {
      const n = typeof s?.length === "number" ? s.length : 0;
      for (let i = 0; i < n; i += 1) {
        const k = s?.key?.(i);
        if (k && k.startsWith(sessionPrefix)) out.push(k.slice(sessionPrefix.length));
      }
    } catch {
      /* storage without enumeration: nothing to rebuild from */
    }
    return out;
  };
  const read = (key: string): ToolModeLayer => {
    const dropped: string[] = [];
    const layer = clean((get(key) as { modes?: unknown } | undefined)?.modes, opts.dialect, dropped);
    if (dropped.length) opts.onDropped?.(key, dropped);
    return layer;
  };
  const revisions = new Map<string, number>();
  const policies = new Map<string, SessionToolPolicy | null>();
  // The revision of a client's last answer: the revisioned client's own (GET top-level, DELETE), else
  // the policy's (a structural twin client exposes only that).
  const revisionOf = (client: SessionToolPolicyClient, policy: SessionToolPolicy | null): number | undefined => {
    const r = (client as { revision?: unknown }).revision;
    return typeof r === "number" ? r : policy ? policy.revision : undefined;
  };
  const guard = (sessionId: string): number => {
    const rev = revisions.get(sessionId);
    if (rev === undefined)
      throw new SessionToolPolicyRevisionError(policies.has(sessionId) ? "the last read carried none" : "load this chat's policy before saving it");
    return rev;
  };
  const browser = (note?: string): ToolLayerStorage => ({ kind: "browser", where: TOOL_LAYER_STORE_WHERE, ...(note ? { note } : {}) });
  const clientFor = (sessionId: string): { client: SessionToolPolicyClient | null; storage: ToolLayerStorage } => {
    const client = opts.sessionPolicy?.(sessionId) ?? null;
    if (client?.supported === true) return { client, storage: { kind: "gateway", where: TOOL_LAYER_GATEWAY_WHERE } };
    return { client: null, storage: browser(client ? TOOL_LAYER_BROWSER_FALLBACK : undefined) };
  };
  const fromPolicy = (
    sessionId: string,
    storage: ToolLayerStorage,
    policy: SessionToolPolicy | null,
    catalog: readonly ToolCatalogItem[],
    revision: number | undefined,
    scope: SessionToolPolicyScope | undefined,
  ): SessionLayerState => {
    if (revision === undefined) revisions.delete(sessionId);
    else revisions.set(sessionId, revision);
    policies.set(sessionId, policy);
    return { storage, layer: layerFromSessionPolicy(policy, catalog), policy, ...(scope ? { scope } : {}) };
  };
  const scopeOf = (client: SessionToolPolicyClient, policy: SessionToolPolicy | null): SessionToolPolicyScope | undefined =>
    (client as { scope?: SessionToolPolicyScope }).scope ?? policy?.scope;
  const store: ToolLayerStore = {
    identityKey: identity,
    appKey,
    sessionKey,
    readApp: (i) => read(appKey(i)),
    writeApp(i, layer) {
      const modes = clean(layer);
      set(appKey(i), Object.keys(modes).length ? { modes } : null);
    },
    readSession: (s) => read(sessionKey(s)),
    writeSession(s, layer) {
      const id = String(s || "").trim();
      const modes = clean(layer);
      const empty = !Object.keys(modes).length;
      set(sessionKey(id), empty ? null : { modes });
      const order = sessions().filter((x) => x !== id);
      if (!empty) order.unshift(id);
      for (const old of order.splice(TOOL_SESSION_LAYERS_MAX)) set(sessionKey(old), null);
      set(indexKey, order.length ? order : null);
    },
    sessions,
    sessionStorage: (sessionId) => clientFor(sessionId).storage,
    async loadSession(sessionId, catalog) {
      const { client, storage } = clientFor(sessionId);
      if (!client) return { storage, layer: store.readSession(sessionId), policy: null };
      const policy = await client.get();
      return fromPolicy(sessionId, storage, policy, catalog, revisionOf(client, policy), scopeOf(client, policy));
    },
    async saveSession(sessionId, layer, catalog, saveOpts = {}) {
      const { client, storage } = clientFor(sessionId);
      if (!client) {
        store.writeSession(sessionId, layer);
        return { storage, layer: store.readSession(sessionId), policy: null };
      }
      const body = sessionPolicyFromLayer(layer, catalog, { base: policies.get(sessionId) ?? null, inherited: saveOpts.inherited });
      if (sessionPolicyBodyIsEmpty(body)) return store.resetSession(sessionId);
      const policy = await client.replace({ ...body, if_revision: guard(sessionId) });
      return fromPolicy(sessionId, storage, policy, catalog, revisionOf(client, policy), scopeOf(client, policy));
    },
    async resetSession(sessionId) {
      const { client, storage } = clientFor(sessionId);
      if (!client) {
        store.writeSession(sessionId, null);
        return { storage, layer: {}, policy: null };
      }
      const answer = await client.reset(guard(sessionId));
      // DELETE answers the new revision (contract v1 §3): the next write is guarded by it.
      return fromPolicy(sessionId, storage, null, [], typeof answer.revision === "number" ? answer.revision : revisionOf(client, null), scopeOf(client, null));
    },
  };
  return store;
}
