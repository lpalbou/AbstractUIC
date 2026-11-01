// Cloud provider cards — the logic (ui-kit, operator finding 2026-10-29: "where do I configure the
// cloud engines?"). ONE card per cloud provider AbstractCore supports, an API-key field and a
// readable check ("Key works · 48 models", or one sentence saying why not). The SAME cards in the
// gateway's setup guide and its Providers tab (`CloudProviderCards`, islands
// `mountCloudProviderCards`); this module is everything that is not rendering, so the console's
// other key flow (Default models → "Or use an API key") calls the same functions.
//
// The rules, each pinned by scripts/check_cloud_providers.mjs:
// - the provider list is AbstractCore's registry as the gateway serves it (GET discovery/providers:
//   the items with `local_provider: false`), never a list kept here;
// - a key is CHECKED before anything is stored: POST config/provider-endpoint-profiles/discover-models
//   {provider_family, api_key} stores nothing; `saveCheckedKey` refuses a key that was not checked OK;
// - an existing connection is NEVER overwritten: the new connection gets a fresh id (`<family>-key`,
//   `<family>-key-2`, …) and is POSTed with `create_only: true` (the gateway answers 409 for a taken
//   id; the save then takes the next id once);
// - the key is never rendered and never kept after the save; connections show a fingerprint only.
// - ONE action per card (operator 2026-10-29): Connect (Reconnect when the provider already has a
//   connection) checks the key and, only when it works, saves it: "Connected · 48 models", or the
//   reason, with nothing stored.
// - simpler cards (operator 2026-11-01): a card shows its status ("Not connected", or a clear
//   "Connected · 48 models") and ONE button, Connect or Edit; both open a modal that
//   tests the connection and saves it. Edit updates THAT connection in place (PUT, the stored key
//   kept unless a new one is typed: `updateConnection`), and Disconnect removes it (DELETE:
//   `removeConnection`); a connection set in AbstractCore's config or the environment is neither
//   updated nor removed from here (a typed key becomes a NEW gateway connection instead).
// - OpenAI-compatible endpoints: AbstractCore's `openai-compatible` provider with a base URL. A preset
//   card (OVH AI Endpoints) fixes the URL; the generic card takes a name, a base URL and a key, which
//   covers Mistral, Groq, Together, Fireworks, DeepSeek, xAI, Google… through their /v1 URLs.

import { GATEWAY_API_PATH } from "./gateway_paths.js";

export type CloudProvider = { id: string; name: string; description: string };

export type CloudConnection = {
  id: string;
  family: string;
  name: string;
  keySet: boolean;
  /** The gateway's fingerprint of the stored key (never the key). */
  fingerprint: string;
  enabled: boolean;
  /** From AbstractCore's config or the environment, not a gateway connection (`managed: false`). */
  configured: boolean;
  /** The connection's base URL ("" = the provider's default). */
  baseUrl: string;
  /** Models the gateway last discovered for it (`discovered_model_count`; 0 = not known). */
  modelCount: number;
};

/** What a card connects: a native AbstractCore provider, a preset OpenAI-compatible service, or any
 *  OpenAI-compatible endpoint (generic: the person gives the name and the base URL). */
export type CloudCard = {
  id: string;
  name: string;
  /** The provider family sent to the gateway (`openai`, …, or `openai-compatible`). */
  family: string;
  kind: "native" | "preset" | "generic";
  /** A preset's fixed base URL; "" for a native or the generic card. */
  baseUrl: string;
  /** A preset: the documentation the URL comes from. */
  docs: string;
  /** The Base URL field: "none" (the provider's own), "preset" (fixed, read-only: OVH) or
   *  "required" (the person gives the endpoint: the generic card, System One). */
  baseUrlField: "none" | "preset" | "required";
  /** Placeholder of a required Base URL field. */
  baseUrlPlaceholder: string;
  /** "optional" when the provider works without a key (AbstractCore `authentication_required: false`). */
  apiKey: "required" | "optional";
};

/** Native providers whose endpoint is USER-SUPPLIED (AbstractCore needs `base_url=` for them), with
 *  whether a key is optional. System One: "the systemone provider needs base_url=: the host that
 *  serves POST /v1/systemone" (abstractcore/providers/typesafe_provider.py), registry
 *  `authentication_required=False`. A native not listed here uses the provider's own endpoint. */
export const NATIVE_ENDPOINT_RULES: Readonly<Record<string, { baseUrl: "required"; placeholder: string; apiKey: "required" | "optional" }>> = {
  systemone: { baseUrl: "required", placeholder: "http://127.0.0.1:8000", apiKey: "optional" },
};

/** OpenAI-compatible services with their OWN card and a preset base URL. */
export const OPENAI_COMPATIBLE_PRESETS: readonly CloudCard[] = [
  {
    id: "ovh",
    name: "OVH AI Endpoints",
    family: "openai-compatible",
    kind: "preset",
    // "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1 is the base endpoint used to call AI Endpoints
    // models" (OVHcloud docs, AI Endpoints catalog API guide, updated July 31, 2026; read 2026-10-29).
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    docs: "https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-catalog-api",
    baseUrlField: "preset",
    baseUrlPlaceholder: "",
    apiKey: "required",
  },
];

export const GENERIC_COMPATIBLE_CARD: CloudCard = {
  id: "openai-compatible",
  name: "Other OpenAI-compatible endpoint",
  family: "openai-compatible",
  kind: "generic",
  baseUrl: "",
  docs: "",
  baseUrlField: "required",
  baseUrlPlaceholder: "https://api.mistral.ai/v1",
  apiKey: "required",
};

/** The answer of POST …/discover-models (gateway 0.20+: `error_kind`, redacted `error`). */
export type KeyCheckAnswer = {
  ok?: boolean;
  models?: unknown;
  error?: unknown;
  error_kind?: unknown;
};

export type KeyCheckResult = {
  ok: boolean;
  family: string;
  modelCount: number;
  models: string[];
  /** The one sentence the card shows ("Key works · 48 models" or why not). */
  sentence: string;
};

export type CloudRequest = (path: string, init: { method: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown }) => Promise<unknown>;

export const CLOUD_PROVIDER_TEXT = {
  title: "Cloud providers",
  lede: "Paste a provider's API key to use its models; the key stays on this gateway.",
  keyLabel: "API key",
  keyOptionalLabel: "API key (optional)",
  nameLabel: "Name",
  baseUrlLabel: "Base URL",
  connect: "Connect",
  reconnect: "Reconnect",
  connecting: "Connecting…",
  check: "Check the key",
  checking: "Checking the key…",
  save: "Save the key",
  saveAnother: "Save as a new connection",
  saving: "Saving…",
  baseUrlFirst: "Enter the endpoint's base URL, for example https://api.example.com/v1.",
  keyOptionalHint: "Only if the endpoint asks for one.",
  genericHint: "Any service with an OpenAI-compatible /v1 API: Mistral, Groq, Together, Fireworks, DeepSeek, xAI, Google…",
  notConnected: "Not connected",
  pasteFirst: "Paste the API key first.",
  loading: "Loading the cloud providers…",
  none: "This gateway's AbstractCore lists no cloud provider.",
  editedAfterCheck: "The key changed since it was checked: check it again.",
  edit: "Edit",
  connectTitle: "Connect",
  editTitle: "Edit",
  test: "Test connection",
  testing: "Testing…",
  saveModal: "Save",
  cancel: "Cancel",
  disconnect: "Disconnect",
  disconnecting: "Disconnecting…",
  keep: "Keep it",
  keyKeepHint: "Leave empty to keep the stored key; paste a new key to replace it.",
  keyConfiguredHint: "This key comes from AbstractCore's configuration or the environment. Paste a key to add a gateway connection; the configured one stays.",
  configuredNoRemove: "Set in AbstractCore's configuration or the environment: remove it there.",
  connectionLabel: "Connection",
  newEndpoint: "New endpoint",
  nothingChanged: "Nothing changed.",
  nameRequired: "Name is required.",
  disconnected: "Disconnected.",
  saved: "Saved.",
} as const;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** AbstractCore's cloud providers from GET discovery/providers: `local_provider === false`, registry
 *  rows only (a gateway connection listed there carries `provider_endpoint_profile`). Registry order. */
export function cloudProvidersFromDiscovery(payload: unknown): CloudProvider[] {
  const items = (payload && typeof payload === "object" ? (payload as any).items : null) as unknown;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: CloudProvider[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const row = it as Record<string, unknown>;
    const id = str(row.name).toLowerCase();
    if (!id || seen.has(id) || row.local_provider !== false || row.provider_endpoint_profile) continue;
    seen.add(id);
    out.push({ id, name: str(row.display_name) || id, description: str(row.description) });
  }
  return out;
}

/** GET config/provider-endpoint-profiles → connections (keys as fingerprints only). */
export function connectionsFromProfiles(payload: unknown): CloudConnection[] {
  const rows = payload && typeof payload === "object" && Array.isArray((payload as any).profiles)
    ? ((payload as any).profiles as unknown[])
    : Array.isArray(payload) ? (payload as unknown[]) : [];
  const out: CloudConnection[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const p = r as Record<string, unknown>;
    const id = str(p.id) || str(p.profile_id);
    if (!id) continue;
    out.push({
      id,
      family: str(p.provider_family).toLowerCase(),
      name: str(p.display_name) || id,
      keySet: p.api_key_set === true,
      fingerprint: str(p.api_key_fingerprint).slice(0, 8),
      enabled: p.enabled !== false,
      configured: p.managed === false || p.synthetic === true,
      baseUrl: str(p.base_url),
      modelCount: typeof p.discovered_model_count === "number" && p.discovered_model_count > 0 ? Math.floor(p.discovered_model_count) : 0,
    });
  }
  return out;
}

export function connectionsFor(family: string, connections: CloudConnection[]): CloudConnection[] {
  return connections.filter((c) => c.family === family);
}

/** "Not connected" | "Connected · key 1a2b3c4d" | "Connected · no key" | "3 connections". */
export function connectionStatus(family: string, connections: CloudConnection[]): string {
  const mine = connectionsFor(family, connections);
  if (!mine.length) return CLOUD_PROVIDER_TEXT.notConnected;
  if (mine.length > 1) return `${mine.length} connections`;
  const c = mine[0];
  return c.keySet ? `Connected · key ${c.fingerprint || "set"}` : "Connected · no key";
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const d = err && typeof err === "object" ? (err as any).detail : null;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  if (typeof d === "string") return d;
  return "";
}

/** The card's sentence for a key check: the gateway's answer, or the error the request threw. */
export function keyCheckResult(provider: Pick<CloudProvider, "id" | "name">, answer: KeyCheckAnswer | null, thrown?: unknown): KeyCheckResult {
  const name = provider.name || provider.id;
  const base = { family: provider.id, modelCount: 0, models: [] as string[] };
  if (thrown !== undefined) {
    const why = errorMessage(thrown);
    return { ...base, ok: false, sentence: `The key could not be checked${why ? `: ${why.replace(/\.$/, "")}` : ""}.` };
  }
  const models = Array.isArray(answer?.models) ? (answer!.models as unknown[]).map(str).filter(Boolean) : [];
  if (models.length) return { ...base, ok: true, modelCount: models.length, models, sentence: `Key works · ${plural(models.length, "model")}` };
  const error = str(answer?.error).replace(/\.$/, "");
  const kind = str(answer?.error_kind) || (error ? "other" : "no_models");
  const sentence =
    kind === "auth" ? `${name} refused this key. Check that it was copied in full and is still active.`
    : kind === "rate_limited" ? `${name} is limiting requests for this account right now (rate limit or credits), so the key could not be checked. Try again in a minute.`
    : kind === "unreachable" ? `The gateway could not reach ${name}${error ? ` (${error})` : ""}. Check this computer's internet connection.`
    : kind === "no_models" ? `${name} answered but lists no model for this key, so it cannot be used yet.`
    : `${name} did not accept the check${error ? `: ${error}` : ""}.`;
  return { ...base, ok: false, sentence };
}

/** The first free id of `<stem>`, `<stem>-2`, … (a virtual `endpoint:<id>` counts as taken). */
export function freshIdFromStem(stem: string, takenIds: Iterable<string>): string {
  const taken = new Set([...takenIds].map((t) => String(t).toLowerCase().replace(/^endpoint:/, "")));
  const base = String(stem || "endpoint").toLowerCase();
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The first free id of `<family>-key`, `<family>-key-2`, … (a virtual `endpoint:<id>` counts as taken). */
export function freshConnectionId(family: string, takenIds: Iterable<string>): string {
  return freshIdFromStem(`${family}-key`, takenIds);
}

/** A connection id stem from a name: "OVH AI Endpoints" → "ovh-ai-endpoints" (the gateway's id alphabet). */
export function slugId(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "endpoint";
}

export function connectionName(provider: Pick<CloudProvider, "id" | "name">, id: string): string {
  const m = /-key-(\d+)$/.exec(id);
  return `${provider.name || provider.id} (API key${m ? ` ${m[1]}` : ""})`;
}

export type SaveScope = "gateway" | "user";

/** The POST body of a new connection: create_only, so a taken id is a 409, never an overwrite. */
export function connectionCreateBody(provider: Pick<CloudProvider, "id" | "name">, id: string, apiKey: string, scope: SaveScope = "gateway", extra?: { family?: string; baseUrl?: string; displayName?: string }) {
  return {
    id,
    display_name: extra?.displayName || connectionName(provider, id),
    provider_family: extra?.family || provider.id,
    api_key: apiKey,
    base_url: extra?.baseUrl || "",
    scope,
    capabilities: ["text"],
    create_only: true,
  };
}

/** "https://Host/v1/" → "https://host/v1": how a preset recognises its own connections. */
export function normalizeBaseUrl(url: string): string {
  const u = String(url || "").trim().replace(/\/+$/, "");
  const m = /^(https?:\/\/[^/]+)(.*)$/i.exec(u);
  return m ? m[1].toLowerCase() + m[2] : u;
}

/** A base URL a person typed: http(s) with a host, else "". */
export function validBaseUrl(url: string): string {
  const u = String(url || "").trim();
  return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(u) ? u.replace(/\/+$/, "") : "";
}

const LOCAL_HOST = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i;

/** The cards: AbstractCore's native cloud providers, then (when its registry has `openai-compatible`)
 *  the preset OpenAI-compatible services and the generic endpoint card. */
export function cloudCardsFromDiscovery(payload: unknown): CloudCard[] {
  const natives: CloudCard[] = cloudProvidersFromDiscovery(payload).map((p) => {
    const rule = Object.prototype.hasOwnProperty.call(NATIVE_ENDPOINT_RULES, p.id) ? NATIVE_ENDPOINT_RULES[p.id] : null;
    return { id: p.id, name: p.name, family: p.id, kind: "native", baseUrl: "", docs: "", baseUrlField: rule ? rule.baseUrl : "none", baseUrlPlaceholder: rule ? rule.placeholder : "", apiKey: rule ? rule.apiKey : "required" };
  });
  const items = (payload && typeof payload === "object" ? (payload as any).items : null) as unknown;
  const compatible = Array.isArray(items) && items.some((it) => it && typeof it === "object" && str((it as any).name).toLowerCase() === "openai-compatible" && !(it as any).provider_endpoint_profile);
  return compatible ? [...natives, ...OPENAI_COMPATIBLE_PRESETS, GENERIC_COMPATIBLE_CARD] : natives;
}

/** The connections a card shows: its family's (native), its base URL's (preset), or the other
 *  OpenAI-compatible cloud endpoints (generic; a server on this computer is a local engine's). */
export function cardConnections(card: CloudCard, connections: CloudConnection[]): CloudConnection[] {
  if (card.kind === "native") return connectionsFor(card.family, connections);
  const compat = connections.filter((c) => c.family === "openai-compatible");
  if (card.kind === "preset") return compat.filter((c) => normalizeBaseUrl(c.baseUrl) === normalizeBaseUrl(card.baseUrl));
  const presetUrls = new Set(OPENAI_COMPATIBLE_PRESETS.map((p) => normalizeBaseUrl(p.baseUrl)));
  return compat.filter((c) => c.baseUrl && !presetUrls.has(normalizeBaseUrl(c.baseUrl)) && !LOCAL_HOST.test(c.baseUrl));
}

/** The card's state line: "Not connected", "Connected" (a generic card names its endpoint:
 *  "Connected · Mistral"), or "N connections". With `counts` (connection id → models found by a
 *  test of the stored key) or the gateway's own `discovered_model_count`, a single connection adds
 *  " · 48 models". No key fingerprint on the card: the Edit modal shows it. */
export function cardStatus(card: CloudCard, connections: CloudConnection[], counts?: Readonly<Record<string, number>>): string {
  const mine = cardConnections(card, connections);
  const base = !mine.length ? CLOUD_PROVIDER_TEXT.notConnected
    : card.kind === "generic" ? (mine.length === 1 ? `Connected · ${mine[0].name}` : `${mine.length} endpoints connected`)
    : mine.length > 1 ? `${mine.length} connections`
    : "Connected";
  if (mine.length !== 1) return base;
  const n = (counts && counts[mine[0].id]) || mine[0].modelCount;
  return n > 0 ? `${base} · ${plural(n, "model")}` : base;
}

/** The connection Edit opens first: a gateway connection before one from AbstractCore's config. */
export function cardEditTarget(card: CloudCard, connections: CloudConnection[]): CloudConnection | null {
  const mine = cardConnections(card, connections);
  return mine.find((c) => !c.configured) || mine[0] || null;
}

export type CheckedKey = {
  family: string;
  apiKey: string;
  baseUrl?: string;
  result: KeyCheckResult;
  /** Set when the STORED key of this connection was tested (no key typed). */
  connectionId?: string;
};

export type SavedConnection = { id: string; provider: string; name: string; virtualProvider: string };

export type ConnectResult = { ok: boolean; sentence: string; saved?: SavedConnection };

const statusOf = (err: unknown): number => Number(err && typeof err === "object" ? (err as any).status : 0) || 0;

type Target = Pick<CloudProvider, "id" | "name"> & Partial<Pick<CloudCard, "family" | "kind" | "baseUrl" | "baseUrlField" | "apiKey">>;
const familyOf = (t: Target) => t.family || t.id;
const isCompatible = (t: Target) => familyOf(t) === "openai-compatible";
/** The target is reached at a base URL: OpenAI-compatible (preset or typed), or a native whose
 *  endpoint is user-supplied (NATIVE_ENDPOINT_RULES). */
const needsUrl = (t: Target) => isCompatible(t) || t.baseUrlField === "required" || (!t.baseUrlField && Object.prototype.hasOwnProperty.call(NATIVE_ENDPOINT_RULES, familyOf(t)));
const keyOptional = (t: Target) => t.apiKey === "optional" || (!t.apiKey && !isCompatible(t) && Object.prototype.hasOwnProperty.call(NATIVE_ENDPOINT_RULES, familyOf(t)) && NATIVE_ENDPOINT_RULES[familyOf(t)].apiKey === "optional");

/**
 * The gateway client of the cards (and of the console's Default models key flow). `request` is the
 * host's JSON request (cookie session + CSRF), rejecting a non-2xx answer with an Error carrying
 * `status`. Paths are under `base` (default "api/gateway", relative; a host passes its own prefix).
 */
export function cloudProvidersClient(request: CloudRequest, base: string = GATEWAY_API_PATH) {
  const root = String(base || GATEWAY_API_PATH).replace(/\/+$/, "");
  const path = (r: string) => `${root}/${r}`;
  const listConnections = async () => connectionsFromProfiles(await request(path("config/provider-endpoint-profiles"), { method: "GET" }));
  const fail = (t: Target, apiKey: string, sentence: string): CheckedKey => ({ family: familyOf(t), apiKey, result: { ok: false, family: familyOf(t), modelCount: 0, models: [], sentence } });
  const client = {
    listProviders: async () => cloudProvidersFromDiscovery(await request(path("discovery/providers"), { method: "GET" })),
    listCards: async () => cloudCardsFromDiscovery(await request(path("discovery/providers"), { method: "GET" })),
    listConnections,
    /** Check a pasted key as a DRAFT: nothing is stored. An OpenAI-compatible target needs its base
     *  URL (a preset's own, or `baseUrl`). */
    async checkKey(target: Target, apiKey: string, baseUrl?: string): Promise<CheckedKey> {
      const key = String(apiKey || "").trim();
      const family = familyOf(target);
      const url = needsUrl(target) ? validBaseUrl(target.baseUrl || baseUrl || "") : "";
      if (needsUrl(target) && !url) return fail(target, key, CLOUD_PROVIDER_TEXT.baseUrlFirst);
      if (!key && !keyOptional(target)) return fail(target, "", CLOUD_PROVIDER_TEXT.pasteFirst);
      const body: Record<string, string> = { provider_family: family };
      if (key) body.api_key = key;
      if (url) body.base_url = url;
      try {
        const answer = (await request(path("config/provider-endpoint-profiles/discover-models"), { method: "POST", body })) as KeyCheckAnswer;
        const result = keyCheckResult({ id: family, name: target.name }, answer);
        // No key sent (a provider whose key is optional): it is the endpoint that works.
        if (!key && result.ok) result.sentence = result.sentence.replace(/^Key works/, "Connection works");
        return { family, apiKey: key, baseUrl: url || undefined, result };
      } catch (err) {
        return { family, apiKey: key, baseUrl: url || undefined, result: keyCheckResult({ id: family, name: target.name }, null, err) };
      }
    },
    /** Store a key that was checked OK as a NEW connection (fresh id, create_only). `name` names a
     *  generic endpoint's connection (default: its host). */
    async saveCheckedKey(target: Target, checked: CheckedKey | null, scope: SaveScope = "gateway", name?: string): Promise<SavedConnection> {
      const family = familyOf(target);
      if (!checked || !checked.result.ok || checked.family !== family || (!checked.apiKey && !keyOptional(target)) || (needsUrl(target) && !checked.baseUrl) || (!checked.apiKey && checked.connectionId))
        throw new Error("Check the key first: only a key that works is saved.");
      const compat = isCompatible(target);
      const host = needsUrl(target) ? (/^https?:\/\/([^/:]+)/i.exec(checked.baseUrl || "") || [])[1] || "" : "";
      // A native reached at a typed URL (System One) is named after its host: "System One endpoint (127.0.0.1)".
      const urlNative = !compat && needsUrl(target);
      const label = compat ? (target.kind === "generic" ? (String(name || "").trim() || host || "OpenAI-compatible endpoint") : target.name) : urlNative ? `${target.name || family} (${host || "endpoint"})` : "";
      // The generic card's ids are prefixed (`compat-mistral`) so a typed name never shadows a native
      // provider id (a "openai" endpoint); ids saved before keep their names.
      const stem = compat ? (target.kind === "generic" ? `compat-${slugId(label)}` : slugId(label)) : urlNative ? `${family}-endpoint` : `${family}-key`;
      const taken = (await listConnections()).map((c) => c.id);
      for (let attempt = 0; attempt < 2; attempt++) {
        const id = freshIdFromStem(stem, taken);
        const n = /-(\d+)$/.exec(id.slice(stem.length));
        const displayName = compat || urlNative ? `${label}${n ? ` ${n[1]}` : ""}` : connectionName(target, id);
        try {
          await request(path("config/provider-endpoint-profiles"), {
            method: "POST",
            body: connectionCreateBody(target, id, checked.apiKey, scope, { family, baseUrl: checked.baseUrl || "", displayName }),
          });
          return { id, provider: family, name: displayName, virtualProvider: `endpoint:${id}` };
        } catch (err) {
          if (statusOf(err) !== 409 || attempt) throw err;
          taken.push(id); // someone took it meanwhile: the next id, never that one
        }
      }
      throw new Error("No free connection id.");
    },
    /** The modal's Test: a typed key is checked as a draft (`checkKey`); with NO key typed and an
     *  existing `connection`, its stored key is tested (discover-models `profile_id`; a connection
     *  from AbstractCore's config is tested through the provider's configured key). Nothing stored. */
    async checkConnection(target: Target, input: { apiKey?: string; baseUrl?: string; connection?: CloudConnection | null }): Promise<CheckedKey> {
      const key = String(input.apiKey || "").trim();
      const conn = input.connection || null;
      if (key || !conn) return client.checkKey(target, key, input.baseUrl);
      const family = familyOf(target);
      const url = needsUrl(target) ? validBaseUrl(target.baseUrl || input.baseUrl || conn.baseUrl || "") : "";
      if (needsUrl(target) && !url) return fail(target, "", CLOUD_PROVIDER_TEXT.baseUrlFirst);
      const body: Record<string, string> = { provider_family: family };
      if (!conn.configured) body.profile_id = conn.id;
      if (url) body.base_url = url;
      let result: KeyCheckResult;
      try {
        result = keyCheckResult({ id: family, name: target.name }, (await request(path("config/provider-endpoint-profiles/discover-models"), { method: "POST", body })) as KeyCheckAnswer);
      } catch (err) {
        result = keyCheckResult({ id: family, name: target.name }, null, err);
      }
      return { family, apiKey: "", baseUrl: url || undefined, result, connectionId: conn.id };
    },
    /** Edit: update THIS gateway connection in place (PUT). Only what changed is sent: a new key
     *  (checked OK first; no key = the stored one stays), a new base URL (checked with it), a new
     *  name. A connection from AbstractCore's config is never updated here. */
    async updateConnection(target: Target, connection: CloudConnection, checked: CheckedKey | null, change: { name?: string } = {}): Promise<SavedConnection> {
      if (connection.configured) throw new Error(CLOUD_PROVIDER_TEXT.configuredNoRemove);
      const family = familyOf(target);
      const body: Record<string, string> = {};
      const name = String(change.name || "").trim();
      if (name && name !== connection.name) body.display_name = name;
      if (checked) {
        if (!checked.result.ok || checked.family !== family || (!checked.apiKey && checked.connectionId !== connection.id))
          throw new Error("Test the connection first: only a connection that works is saved.");
        if (checked.apiKey) body.api_key = checked.apiKey;
        if (checked.baseUrl && normalizeBaseUrl(checked.baseUrl) !== normalizeBaseUrl(connection.baseUrl)) body.base_url = checked.baseUrl;
      }
      if (!Object.keys(body).length) throw new Error(CLOUD_PROVIDER_TEXT.nothingChanged);
      await request(path(`config/provider-endpoint-profiles/${encodeURIComponent(connection.id)}`), { method: "PUT", body });
      return { id: connection.id, provider: family, name: body.display_name || connection.name, virtualProvider: `endpoint:${connection.id}` };
    },
    /** Disconnect: remove THIS gateway connection (DELETE). A connection from AbstractCore's
     *  config or the environment is not removable here. */
    async removeConnection(connection: CloudConnection): Promise<void> {
      if (connection.configured) throw new Error(CLOUD_PROVIDER_TEXT.configuredNoRemove);
      await request(path(`config/provider-endpoint-profiles/${encodeURIComponent(connection.id)}`), { method: "DELETE" });
    },
    /** ONE action: check the key and, only if it works, save it as a new connection.
     *  "Connected · 48 models", or the reason (nothing stored). */
    async connect(target: Target, input: { apiKey: string; baseUrl?: string; name?: string }, scope: SaveScope = "gateway"): Promise<ConnectResult> {
      const checked = await client.checkKey(target, input.apiKey, input.baseUrl);
      if (!checked.result.ok) return { ok: false, sentence: checked.result.sentence };
      try {
        const saved = await client.saveCheckedKey(target, checked, scope, input.name);
        return { ok: true, sentence: connectedSentence(checked.result.modelCount), saved };
      } catch (err) {
        return { ok: false, sentence: `The key works but was not saved: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
  return client;
}

/** "Connected · 48 models". */
export function connectedSentence(modelCount: number): string {
  return `Connected · ${plural(modelCount, "model")}`;
}

export type CloudProvidersClient = ReturnType<typeof cloudProvidersClient>;

/** "Saved as OpenAI (API key 2). …" — the card's line after a save. */
export function savedSentence(saved: SavedConnection): string {
  return `Saved as ${saved.name}. Choose its models in Default models; the key is never shown again.`;
}
