#!/usr/bin/env node
/**
 * gateway_models.ts (ui-primitives tools-models, backlog 0034): one reading of the gateway's
 * text-model routes for every app.
 * - gatewayTextDefault: provider/model from `output.text` then `input.text` (configured rows only),
 *   reasoning from `routes[output.text].reasoning`, MTP from `routes[input.text].options.speculation`
 *   (routes/gateway.py:18977); null when nothing is configured; throws on a missing routes[].
 * - the default named in words; the reasoning ladder read from discovery/capabilities, never hardcoded;
 * - createGatewayModelTransport: the exact relative routes, the served provider rows, gateway errors
 *   thrown (so the picker shows its #FALLBACK line);
 * - withRunModel: `_runtime.{provider, model, thinking, speculation}`, a half pin throws, top-level
 *   pins only when asked, an inherited field's stale key removed, input never mutated.
 * Run after `npm run build`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const j = (v) => JSON.stringify(v);
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(String(e.message)) : true; } };
const { gatewayTextDefault, gatewayDefaultSummary, gatewayDefaultLabel, reasoningLadderFrom, createGatewayModelTransport, withRunModel } = kit;

// ---------------------------------------------------------------- gatewayTextDefault
// The served shape (core manager.py get_capability_default): output.text is derived from input.text.
const payload = {
  routes: [
    { key: "input.image", provider: "mlx", model: "vision", source: "abstractcore.capability_defaults" },
    { key: "output.text", provider: "ollama", model: "qwen3", reasoning: "high", source: "abstractcore.capability_defaults", derived_from: "input.text" },
    { key: "input.text", provider: "ollama", model: "qwen3", reasoning: "high", options: { speculation: { mode: "native_mtp", num_draft_tokens: 3 } }, source: "abstractcore.capability_defaults" },
  ],
};
const d = gatewayTextDefault(payload);
check("provider/model", d?.provider === "ollama" && d?.model === "qwen3", j(d));
check("reasoning from output.text", d?.reasoning === "high");
check("MTP from input.text options", j(d?.speculation) === j({ mode: "native_mtp", num_draft_tokens: 3, require_acceleration: true }), j(d?.speculation));
check("source kept", d?.source === "abstractcore.capability_defaults");
check("not_configured rows are skipped", gatewayTextDefault({ routes: [{ key: "output.text", source: "not_configured", provider: "x", model: "y" }, { key: "input.text", provider: "lmstudio", model: "m" }] })?.provider === "lmstudio");
check("only input.text configured still resolves", j(gatewayTextDefault({ routes: [{ key: "input.text", provider: "p", model: "m" }] })) === j({ provider: "p", model: "m" }));
check("no configured text route → null", gatewayTextDefault({ routes: [{ key: "output.text", source: "not_configured" }] }) === null);
check("a half row is not a default", gatewayTextDefault({ routes: [{ key: "output.text", provider: "p" }] }) === null);
check("MTP off is kept", gatewayTextDefault({ routes: [{ key: "input.text", provider: "p", model: "m", options: { speculation: false } }] })?.speculation === false);
check("missing routes[] throws", throws(() => gatewayTextDefault({ error: "x" }), /no routes/) && throws(() => gatewayTextDefault(null)));
check("summary in words", gatewayDefaultSummary(d) === "ollama / qwen3 · reasoning high · MTP depth 3", gatewayDefaultSummary(d));
check("label names the default", gatewayDefaultLabel(d) === "Gateway default · ollama / qwen3 · reasoning high · MTP depth 3");
check("label when unknown", gatewayDefaultLabel(null) === "Gateway default" && gatewayDefaultLabel(null, "Default") === "Default");
check("MTP off in words", gatewayDefaultSummary({ provider: "p", model: "m", speculation: false }) === "p / m · MTP off");

// ---------------------------------------------------------------- reasoning ladder (served, never hardcoded)
const caps = { capabilities: { contracts: { common: { runs: { start: { thinking_control: { values: ["none", "minimal", "low", "medium", "high", "xhigh", "low", ""] } } } } } } };
check("ladder from discovery/capabilities", j(reasoningLadderFrom(caps)) === j(["none", "minimal", "low", "medium", "high", "xhigh"]), j(reasoningLadderFrom(caps)));
check("no ladder advertised → []", j(reasoningLadderFrom({ capabilities: {} })) === "[]" && j(reasoningLadderFrom(null)) === "[]");

// ---------------------------------------------------------------- transport
const seen = [];
const answers = {
  "api/gateway/discovery/providers?include_models=false": { items: [{ id: "ollama", label: "Ollama", provider: "ollama", name: "Ollama" }, { id: "lmstudio", label: "lmstudio", provider: "lmstudio" }, "openai", {}] },
  "api/gateway/discovery/providers/lm%20studio/models?capability_route=output.text": { models: ["b", "a", "a", ""] },
  "api/gateway/discovery/providers/items/models?capability_route=output.text": { items: [{ id: "x" }, { id: "y" }] },
  "api/gateway/discovery/models/capabilities?model_name=qwen3&provider=ollama": { model: "qwen3", capabilities: { reasoning_levels: ["low"] } },
  "api/gateway/config/capability-defaults": payload,
  "api/gateway/discovery/capabilities": caps,
  "api/gateway/discovery/providers/broken/models?capability_route=output.text": { models: [], error: "connection refused" },
};
const transport = createGatewayModelTransport(async (path) => {
  seen.push(path);
  if (!(path in answers)) throw new Error(`unexpected path ${path}`);
  return answers[path];
});
const providers = await transport.fetchProviders();
check("providers: id + label", j(providers) === j([{ name: "ollama", display_name: "Ollama" }, { name: "lmstudio" }, { name: "openai" }]), j(providers));
check("models: encoded provider, output.text route", j(await transport.fetchModels("lm studio")) === j(["b", "a"]));
check("models: item rows", j(await transport.fetchModels("items")) === j(["x", "y"]));
check("capabilities: model_name + provider", (await transport.fetchModelCapabilities("qwen3", "ollama"))?.model === "qwen3");
check("default via capability-defaults", (await transport.fetchGatewayDefault())?.model === "qwen3");
check("ladder via discovery/capabilities", (await transport.fetchReasoningLadder()).length === 6);
let refused = "";
try { await transport.fetchModels("broken"); } catch (e) { refused = e.message; }
check("a gateway error with no models is thrown", refused === "connection refused", refused);
check("every request is relative to the gateway API", seen.every((p) => p.startsWith("api/gateway/")), j(seen));
check("route constants", kit.GATEWAY_PROVIDERS_ROUTE === "discovery/providers" && kit.GATEWAY_CAPABILITY_DEFAULTS_ROUTE === "config/capability-defaults" && kit.GATEWAY_MODEL_CAPABILITIES_ROUTE === "discovery/models/capabilities" && kit.GATEWAY_TOOLS_ROUTE === "discovery/tools" && kit.GATEWAY_CAPABILITIES_ROUTE === "discovery/capabilities");
check("provider models route needs a provider", throws(() => kit.gatewayProviderModelsRoute(" ")) && kit.gatewayProviderModelsRoute("a/b") === "discovery/providers/a%2Fb/models");

// ---------------------------------------------------------------- withRunModel
{
  const input = { prompt: "hi", _runtime: { stream: true } };
  const out = withRunModel(input, { provider: "ollama", model: "qwen3", reasoning: "high", speculation: { mode: "native_mtp", num_draft_tokens: 2 } });
  check("_runtime provider/model/thinking/speculation", out._runtime.provider === "ollama" && out._runtime.model === "qwen3" && out._runtime.thinking === "high" && j(out._runtime.speculation) === j({ mode: "native_mtp", num_draft_tokens: 2, require_acceleration: true }) && out._runtime.stream === true, j(out));
  check("no top-level pins unless the flow declares them", !("provider" in out) && !("model" in out));
  const pins = withRunModel(input, { provider: "ollama", model: "qwen3" }, { topLevelPins: true });
  check("top-level pins when asked", pins.provider === "ollama" && pins.model === "qwen3");
  check("a half pin throws", throws(() => withRunModel({}, { provider: "ollama", model: "" }), /both a provider and a model/) && throws(() => withRunModel({}, { model: "m" })));
  check("never mutates its input", j(input) === j({ prompt: "hi", _runtime: { stream: true } }));
  const stale = { provider: "old", model: "old", _runtime: { provider: "old", model: "old", thinking: "low", speculation: false, stream: false } };
  const inherit = withRunModel(stale, { provider: "", model: "" }, { topLevelPins: true });
  check("gateway default removes stale keys", !("provider" in inherit._runtime) && !("model" in inherit._runtime) && !("thinking" in inherit._runtime) && !("speculation" in inherit._runtime) && !("provider" in inherit) && inherit._runtime.stream === false, j(inherit));
  check("MTP off is sent as false", withRunModel({}, { speculation: false })._runtime.speculation === false);
  check("no value at all is the gateway default", j(withRunModel({ a: 1 }, null)) === j({ a: 1, _runtime: {} }));
}

if (failures) {
  console.error(`check_gateway_models: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_gateway_models: OK (${checks} checks)`);
