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

export type CloudRequest = (path: string, init: { method: "GET" | "POST"; body?: unknown }) => Promise<unknown>;

export const CLOUD_PROVIDER_TEXT = {
  title: "Cloud providers",
  lede: "Use models from a cloud account: paste its API key, check it, then save it. The key stays on the gateway and is never shown again.",
  keyLabel: "API key",
  check: "Check the key",
  checking: "Checking the key…",
  save: "Save the key",
  saveAnother: "Save as a new connection",
  saving: "Saving…",
  more: "More settings",
  notConnected: "Not connected",
  pasteFirst: "Paste the API key first.",
  loading: "Loading the cloud providers…",
  none: "This gateway's AbstractCore lists no cloud provider.",
  editedAfterCheck: "The key changed since it was checked: check it again.",
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

/** The first free id of `<family>-key`, `<family>-key-2`, … (a virtual `endpoint:<id>` counts as taken). */
export function freshConnectionId(family: string, takenIds: Iterable<string>): string {
  const taken = new Set([...takenIds].map((t) => String(t).toLowerCase().replace(/^endpoint:/, "")));
  const stem = `${family}-key`;
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

export function connectionName(provider: Pick<CloudProvider, "id" | "name">, id: string): string {
  const m = /-key-(\d+)$/.exec(id);
  return `${provider.name || provider.id} (API key${m ? ` ${m[1]}` : ""})`;
}

export type SaveScope = "gateway" | "user";

/** The POST body of a new connection: create_only, so a taken id is a 409, never an overwrite. */
export function connectionCreateBody(provider: Pick<CloudProvider, "id" | "name">, id: string, apiKey: string, scope: SaveScope = "gateway") {
  return {
    id,
    display_name: connectionName(provider, id),
    provider_family: provider.id,
    api_key: apiKey,
    base_url: "",
    scope,
    capabilities: ["text"],
    create_only: true,
  };
}

export type CheckedKey = { family: string; apiKey: string; result: KeyCheckResult };

export type SavedConnection = { id: string; provider: string; name: string; virtualProvider: string };

const statusOf = (err: unknown): number => Number(err && typeof err === "object" ? (err as any).status : 0) || 0;

/**
 * The gateway client of the cards (and of the console's Default models key flow). `request` is the
 * host's JSON request (cookie session + CSRF), rejecting a non-2xx answer with an Error carrying
 * `status`. Paths are under `base` (default "api/gateway", relative; a host passes its own prefix).
 */
export function cloudProvidersClient(request: CloudRequest, base: string = GATEWAY_API_PATH) {
  const root = String(base || GATEWAY_API_PATH).replace(/\/+$/, "");
  const path = (r: string) => `${root}/${r}`;
  const listConnections = async () => connectionsFromProfiles(await request(path("config/provider-endpoint-profiles"), { method: "GET" }));
  return {
    listProviders: async () => cloudProvidersFromDiscovery(await request(path("discovery/providers"), { method: "GET" })),
    listConnections,
    /** Check a pasted key as a DRAFT: nothing is stored. */
    async checkKey(provider: Pick<CloudProvider, "id" | "name">, apiKey: string): Promise<CheckedKey> {
      const key = String(apiKey || "").trim();
      if (!key) return { family: provider.id, apiKey: "", result: { ok: false, family: provider.id, modelCount: 0, models: [], sentence: CLOUD_PROVIDER_TEXT.pasteFirst } };
      try {
        const answer = (await request(path("config/provider-endpoint-profiles/discover-models"), {
          method: "POST",
          body: { provider_family: provider.id, api_key: key },
        })) as KeyCheckAnswer;
        return { family: provider.id, apiKey: key, result: keyCheckResult(provider, answer) };
      } catch (err) {
        return { family: provider.id, apiKey: key, result: keyCheckResult(provider, null, err) };
      }
    },
    /** Store a key that was checked OK as a NEW connection (fresh id, create_only). */
    async saveCheckedKey(provider: Pick<CloudProvider, "id" | "name">, checked: CheckedKey | null, scope: SaveScope = "gateway"): Promise<SavedConnection> {
      if (!checked || !checked.result.ok || checked.family !== provider.id || !checked.apiKey)
        throw new Error("Check the key first: only a key that works is saved.");
      const taken = (await listConnections()).map((c) => c.id);
      for (let attempt = 0; attempt < 2; attempt++) {
        const id = freshConnectionId(provider.id, taken);
        try {
          await request(path("config/provider-endpoint-profiles"), { method: "POST", body: connectionCreateBody(provider, id, checked.apiKey, scope) });
          return { id, provider: provider.id, name: connectionName(provider, id), virtualProvider: `endpoint:${id}` };
        } catch (err) {
          if (statusOf(err) !== 409 || attempt) throw err;
          taken.push(id); // someone took it meanwhile: the next id, never that one
        }
      }
      throw new Error("No free connection id.");
    },
  };
}

export type CloudProvidersClient = ReturnType<typeof cloudProvidersClient>;

/** "Saved as OpenAI (API key 2). …" — the card's line after a save. */
export function savedSentence(saved: SavedConnection): string {
  return `Saved as ${saved.name}. Choose its models in Default models; the key is never shown again.`;
}
