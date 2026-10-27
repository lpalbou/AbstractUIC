// The gateway's text-model routes, the pure half of the provider/model/
// reasoning/MTP picker (ADR 0001, backlog 0034). One reading of each route for
// every app (it replaces abstractcode model_discovery.ts:27-41, abstractflow
// useExecutionCapabilities.ts:4-11 and AuthoringAssistantDrawer.tsx:535-546).
// No React. The transport is built over an INJECTED request function: the kit
// never fetches on its own authority.
import type { ProviderOption } from "./provider_model_select.js";
import { normalizeSpeculationValue, type SpeculationValue } from "./speculation_control.js";
import {
  GATEWAY_CAPABILITIES_ROUTE,
  GATEWAY_CAPABILITY_DEFAULTS_ROUTE,
  GATEWAY_MODEL_CAPABILITIES_ROUTE,
  GATEWAY_PROVIDERS_ROUTE,
  gatewayApiPath,
  gatewayProviderModelsRoute,
} from "./gateway_paths.js";

/** What "Gateway default" resolves to for text generation. null = the gateway has none configured. */
export type GatewayModelDefault = {
  provider: string;
  model: string;
  reasoning?: string;
  speculation?: SpeculationValue;
  /** The route row's `source` (e.g. "abstractcore.capability_defaults"). */
  source?: string;
} | null;

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * The gateway's text default from `GET config/capability-defaults` (routes/gateway.py:27748-27765):
 * provider/model from the first configured row of `output.text` then `input.text` (AbstractCore
 * stores the text route under `input.text` and serves `output.text` derived from it,
 * abstractgateway core_config.py:95-100); the default reasoning is `routes[output.text].reasoning`;
 * the default MTP is `routes[input.text].options.speculation` (the declared authority,
 * routes/gateway.py:18977). Throws when the answer has no `routes[]`; null when no row is configured.
 */
export function gatewayTextDefault(payload: unknown): GatewayModelDefault {
  const rows = obj(payload)?.routes;
  if (!Array.isArray(rows)) throw new Error("The gateway's capability defaults have no routes.");
  const row = (key: string): Row | undefined =>
    rows.map(obj).find((r) => r && str(r.key) === key && str(r.source) !== "not_configured");
  const out = row("output.text");
  const stored = row("input.text");
  const pick = [out, stored].find((r) => r && str(r.provider) && str(r.model));
  if (!pick) return null;
  const reasoning = str(out?.reasoning) || str(stored?.reasoning);
  const speculation = normalizeSpeculationValue(obj(stored?.options)?.speculation ?? obj(out?.options)?.speculation);
  return {
    provider: str(pick.provider),
    model: str(pick.model),
    ...(reasoning ? { reasoning } : {}),
    ...(speculation !== undefined ? { speculation } : {}),
    ...(str(pick.source) ? { source: str(pick.source) } : {}),
  };
}

/** "ollama / qwen3 · reasoning high · MTP depth 3" (what the default resolves to, in words). */
export function gatewayDefaultSummary(value: GatewayModelDefault): string {
  if (!value) return "";
  const parts = [`${value.provider} / ${value.model}`];
  if (value.reasoning) parts.push(`reasoning ${value.reasoning}`);
  if (value.speculation === false) parts.push("MTP off");
  else if (value.speculation) parts.push(`MTP depth ${value.speculation.num_draft_tokens}`);
  return parts.join(" · ");
}

/** "Gateway default · ollama / qwen3[ · reasoning r][ · MTP depth n]", or just the label when unknown. */
export function gatewayDefaultLabel(value: GatewayModelDefault, label = "Gateway default"): string {
  const summary = gatewayDefaultSummary(value);
  return summary ? `${label} · ${summary}` : label;
}

/** The run-start reasoning ladder the gateway advertises (`discovery/capabilities` →
 * capabilities.contracts.common.runs.start.thinking_control.values, routes/gateway.py:18965-18972).
 * [] when not advertised: the kit never hardcodes a ladder. */
export function reasoningLadderFrom(payload: unknown): string[] {
  const caps = obj(obj(payload)?.capabilities) ?? obj(payload);
  const values = obj(obj(obj(obj(obj(caps?.contracts)?.common)?.runs)?.start)?.thinking_control)?.values;
  return Array.isArray(values) ? [...new Set(values.map(str).filter(Boolean))] : [];
}

/** A provider row of `GET discovery/providers` (routes/gateway.py:20322-20472; items carry
 * `id`/`provider` + `label`, gateway.py:16701-16725) as the picker's option. */
function providerOption(raw: unknown): ProviderOption | null {
  if (typeof raw === "string") return raw.trim() ? { name: raw.trim() } : null;
  const r = obj(raw);
  const name = str(r?.id) || str(r?.provider) || str(r?.name);
  if (!name) return null;
  const label = str(r?.label) || str(r?.display_name);
  return label && label !== name ? { name, display_name: label } : { name };
}

export type GatewayRequest = (path: string) => Promise<unknown>;

export type GatewayModelTransport = {
  fetchProviders: () => Promise<ProviderOption[]>;
  fetchModels: (provider: string) => Promise<string[]>;
  fetchModelCapabilities: (model: string, provider: string) => Promise<unknown>;
  fetchGatewayDefault: () => Promise<GatewayModelDefault>;
  fetchReasoningLadder: () => Promise<string[]>;
};

/**
 * The picker's transport over the host's request function (`request(path)` resolves a RELATIVE
 * gateway API path, "api/gateway/…", through the host's client: credentials, base URL). Errors the
 * gateway reports with an empty list are thrown, so the picker shows its labeled #FALLBACK line.
 */
export function createGatewayModelTransport(request: GatewayRequest): GatewayModelTransport {
  return {
    async fetchProviders() {
      const body = obj(await request(gatewayApiPath(`${GATEWAY_PROVIDERS_ROUTE}?include_models=false`)));
      const items = Array.isArray(body?.items) ? body!.items.map(providerOption).filter((p): p is ProviderOption => Boolean(p)) : [];
      if (!items.length && str(body?.error)) throw new Error(str(body?.error));
      return items;
    },
    async fetchModels(provider: string) {
      const body = obj(await request(gatewayApiPath(`${gatewayProviderModelsRoute(provider)}?capability_route=output.text`)));
      const raw = Array.isArray(body?.models) ? body!.models : Array.isArray(body?.items) ? body!.items : [];
      const models = [...new Set(raw.map((m) => (typeof m === "string" ? m.trim() : str(obj(m)?.id))).filter(Boolean))];
      if (!models.length && str(body?.error)) throw new Error(str(body?.error));
      return models;
    },
    async fetchModelCapabilities(model: string, provider: string) {
      const q = new URLSearchParams({ model_name: model });
      if (provider) q.set("provider", provider);
      return request(gatewayApiPath(`${GATEWAY_MODEL_CAPABILITIES_ROUTE}?${q.toString()}`));
    },
    async fetchGatewayDefault() {
      return gatewayTextDefault(await request(gatewayApiPath(GATEWAY_CAPABILITY_DEFAULTS_ROUTE)));
    },
    async fetchReasoningLadder() {
      return reasoningLadderFrom(await request(gatewayApiPath(GATEWAY_CAPABILITIES_ROUTE)));
    },
  };
}

export type RunModelValue = {
  provider?: string;
  model?: string;
  reasoning?: string;
  speculation?: SpeculationValue;
};

/**
 * `input_data` with the picker's choice (folds abstractcode catalog.ts:692-724 and
 * abstractassistant/web run_input.ts:98-109): `_runtime.{provider, model}` only as a pair (a half
 * pin throws: the host must not start a run on half a choice), `_runtime.thinking` when a reasoning
 * level is chosen, `_runtime.speculation` when MTP is chosen (false = Off). An unset field is the
 * gateway default and its key is REMOVED (a stale value would pin the run). `topLevelPins: true`
 * also writes top-level `provider`/`model` (only for a flow that declares those inputs). Never
 * mutates its input.
 */
export function withRunModel(
  input_data: Record<string, unknown> | null | undefined,
  value: RunModelValue | null | undefined,
  opts: { topLevelPins?: boolean } = {},
): Record<string, unknown> {
  const provider = str(value?.provider);
  const model = str(value?.model);
  if (Boolean(provider) !== Boolean(model))
    throw new Error("Choose both a provider and a model, or use the gateway default.");
  const out: Record<string, unknown> = { ...(input_data || {}) };
  const runtime: Record<string, unknown> = { ...(obj(out._runtime) || {}) };
  const put = (target: Record<string, unknown>, key: string, v: unknown) => {
    if (v === undefined || v === "") delete target[key];
    else target[key] = v;
  };
  put(runtime, "provider", provider);
  put(runtime, "model", model);
  put(runtime, "thinking", str(value?.reasoning));
  put(runtime, "speculation", normalizeSpeculationValue(value?.speculation));
  if (opts.topLevelPins) {
    put(out, "provider", provider);
    put(out, "model", model);
  }
  out._runtime = runtime;
  return out;
}
