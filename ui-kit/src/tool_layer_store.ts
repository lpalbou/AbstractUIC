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
import { normalizeToolMode, type ToolMode, type ToolModeDialect, type ToolModeLayer } from "./tool_plan.js";

/** The words a host shows next to an editor backed by this store. */
export const TOOL_LAYER_STORE_WHERE = "Saved in this browser";
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
  return {
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
  };
}
