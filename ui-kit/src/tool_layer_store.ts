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
import { normalizeToolMode, type ToolCatalogItem, type ToolMode, type ToolModeDialect, type ToolModeLayer } from "./tool_plan.js";
import { layerFromSessionPolicy, sessionPolicyFromLayer, SESSION_TOOL_POLICY_UNSUPPORTED, type SessionToolPolicy, type SessionToolPolicyClient } from "./session_tool_policy.js";

/** The words a host shows next to an editor backed by this store. */
export const TOOL_LAYER_STORE_WHERE = "Saved in this browser";
/** The words for a session layer the gateway stores (the conversation's tool policy). */
export const TOOL_LAYER_GATEWAY_WHERE = "Saved for this conversation on the gateway";
/** Said when the gateway was asked and cannot store a conversation's policy (an older gateway). */
export const TOOL_LAYER_BROWSER_FALLBACK = `${SESSION_TOOL_POLICY_UNSUPPORTED}, so this conversation's tool choices stay in this browser and ask on the gateway until this browser approves them.`;

/** Where a layer lives, in words: `where` is the frame's label, `note` why it is not the gateway. */
export type ToolLayerStorage = { kind: "gateway" | "browser"; where: string; note?: string };
/** A loaded or saved session layer: the layer, where it lives, and the gateway's policy when it is there. */
export type SessionLayerState = { storage: ToolLayerStorage; layer: ToolModeLayer; policy: SessionToolPolicy | null };

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
  /** Save it there (PUT, guarded by the last revision read: a 409 rejects with
   * SessionToolPolicyConflictError). An empty layer resets (DELETE). The answer is the gateway's
   * effective policy as a layer (after its clamp). */
  saveSession(sessionId: string, layer: ToolModeLayer | null, catalog: readonly ToolCatalogItem[]): Promise<SessionLayerState>;
  /** "Use my defaults": DELETE the conversation's policy, or remove the browser entry. */
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
  const browser = (note?: string): ToolLayerStorage => ({ kind: "browser", where: TOOL_LAYER_STORE_WHERE, ...(note ? { note } : {}) });
  const clientFor = (sessionId: string): { client: SessionToolPolicyClient | null; storage: ToolLayerStorage } => {
    const client = opts.sessionPolicy?.(sessionId) ?? null;
    if (client?.supported === true) return { client, storage: { kind: "gateway", where: TOOL_LAYER_GATEWAY_WHERE } };
    return { client: null, storage: browser(client ? TOOL_LAYER_BROWSER_FALLBACK : undefined) };
  };
  const fromPolicy = (sessionId: string, storage: ToolLayerStorage, policy: SessionToolPolicy | null, catalog: readonly ToolCatalogItem[]): SessionLayerState => {
    if (policy) revisions.set(sessionId, policy.revision);
    else revisions.delete(sessionId);
    return { storage, layer: layerFromSessionPolicy(policy, catalog), policy };
  };
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
      return fromPolicy(sessionId, storage, await client.get(), catalog);
    },
    async saveSession(sessionId, layer, catalog) {
      const { client, storage } = clientFor(sessionId);
      if (!client) {
        store.writeSession(sessionId, layer);
        return { storage, layer: store.readSession(sessionId), policy: null };
      }
      const body = sessionPolicyFromLayer(layer, catalog);
      if (!body.approve?.tools?.length && !body.deny?.tools?.length && !body.ask?.length) return store.resetSession(sessionId);
      const rev = revisions.get(sessionId);
      return fromPolicy(sessionId, storage, await client.replace(rev === undefined ? body : { ...body, if_revision: rev }), catalog);
    },
    async resetSession(sessionId) {
      const { client, storage } = clientFor(sessionId);
      if (!client) {
        store.writeSession(sessionId, null);
        return { storage, layer: {}, policy: null };
      }
      await client.reset();
      return fromPolicy(sessionId, storage, null, []);
    },
  };
  return store;
}
