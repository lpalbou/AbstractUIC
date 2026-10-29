#!/usr/bin/env node
/**
 * Cloud provider cards (operator finding 2026-10-29: "where do I configure the cloud engines?").
 * Over the compiled dist, DOM-free (hook_harness drives the component; renderToStaticMarkup reads it):
 *  1. the provider list is the gateway's AbstractCore registry rows with local_provider false — never
 *     a local engine, never a gateway connection row, never a list kept in the kit;
 *  2. the readable check: "Key works · 48 models", or one sentence per failure kind;
 *  3. a key is CHECKED before anything is stored: Check POSTs discover-models only; Save is refused
 *     for an unchecked, failed or edited key, with no request;
 *  4. an existing connection is NEVER overwritten: a fresh id, `create_only: true`, a 409 moves to the
 *     next id (never the same one), and no PUT is ever sent;
 *  5. the key is never rendered once saved (field emptied, check dropped), connections show a
 *     fingerprint only.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mountHook, find, findAll } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const { CloudProviderCards, cloudProvidersClient, cloudProvidersFromDiscovery, connectionStatus, connectionsFromProfiles, freshConnectionId, keyCheckResult, CLOUD_PROVIDER_TEXT: T } = kit;

// The gateway's GET discovery/providers, as AbstractCore 2.31 answers it (alphabetical), plus a
// gateway connection row (it carries provider_endpoint_profile).
const DISCOVERY = {
  items: [
    { name: "anthropic", display_name: "Anthropic", local_provider: false, authentication_required: true },
    { name: "huggingface", display_name: "HuggingFace", local_provider: true },
    { name: "lmstudio", display_name: "LMStudio", local_provider: true },
    { name: "mlx", display_name: "MLX", local_provider: true },
    { name: "ollama", display_name: "Ollama", local_provider: true },
    { name: "openai", display_name: "OpenAI", local_provider: false, authentication_required: true },
    { name: "openai-compatible", display_name: "OpenAI-Compatible", local_provider: true },
    { name: "openrouter", display_name: "OpenRouter", local_provider: false, authentication_required: true },
    { name: "portkey", display_name: "Portkey", local_provider: false, authentication_required: false },
    { name: "vllm", display_name: "vLLM", local_provider: true },
    { name: "endpoint:openai-key", display_name: "OpenAI (API key)", local_provider: false, provider_endpoint_profile: { id: "openai-key" } },
  ],
};
const KEY = "sk-proj-kitcheck-" + "9".repeat(20);

// 1. The list.
const providers = cloudProvidersFromDiscovery(DISCOVERY);
check("1 cloud providers = the registry's non-local rows, in its order", JSON.stringify(providers.map((p) => p.id)) === JSON.stringify(["anthropic", "openai", "openrouter", "portkey"]), providers.map((p) => p.id));
check("1 names are AbstractCore's display names", providers.map((p) => p.name).join(",") === "Anthropic,OpenAI,OpenRouter,Portkey");
check("1 a payload without items lists nothing (no built-in fallback list)", cloudProvidersFromDiscovery({}).length === 0 && cloudProvidersFromDiscovery(null).length === 0);

// 2. Sentences.
const oa = { id: "openai", name: "OpenAI" };
const many = (n) => Array.from({ length: n }, (_, i) => `m${i}`);
check("2 ok: Key works · 48 models", keyCheckResult(oa, { ok: true, models: many(48) }).sentence === "Key works · 48 models");
check("2 ok: 1 model (singular)", keyCheckResult(oa, { ok: true, models: ["x"] }).sentence === "Key works · 1 model");
check("2 ok carries the count", keyCheckResult(oa, { models: many(3) }).ok === true && keyCheckResult(oa, { models: many(3) }).modelCount === 3);
const why = (kind, error) => keyCheckResult(oa, { ok: false, models: [], error_kind: kind, error }).sentence;
check("2 auth", why("auth", "Error code: 401 [key]") === "OpenAI refused this key. Check that it was copied in full and is still active.", why("auth"));
check("2 rate limited says the key was not checked", /rate limit or credits\), so the key could not be checked/.test(why("rate_limited")), why("rate_limited"));
check("2 unreachable names the provider and the reason", why("unreachable", "Connection timed out.") === "The gateway could not reach OpenAI (Connection timed out). Check this computer's internet connection.", why("unreachable", "Connection timed out."));
check("2 no models", why("no_models") === "OpenAI answered but lists no model for this key, so it cannot be used yet.", why("no_models"));
check("2 other quotes the provider", why("other", "Bad gateway") === "OpenAI did not accept the check: Bad gateway.", why("other", "Bad gateway"));
check("2 a thrown request error is a sentence", keyCheckResult(oa, null, new Error("Admin principal required.")).sentence === "The key could not be checked: Admin principal required.");
check("2 a failure is never ok", why("auth") && keyCheckResult(oa, { models: [], error_kind: "auth" }).ok === false);

// Fresh ids and the status line.
check("4 fresh id: first", freshConnectionId("openai", []) === "openai-key");
check("4 fresh id: skips taken (endpoint: counts)", freshConnectionId("openai", ["openai-key", "endpoint:openai-key-2", "OPENAI-KEY-3"]) === "openai-key-4");
const conns = connectionsFromProfiles({ profiles: [
  { id: "openai-key", provider_family: "openai", display_name: "OpenAI (API key)", api_key_set: true, api_key_fingerprint: "1a2b3c4d5e6f" },
  { id: "or-1", provider_family: "openrouter", api_key_set: true, api_key_fingerprint: "aa" },
  { id: "or-2", provider_family: "openrouter", api_key_set: false },
] });
check("5 status: fingerprint only (8 chars)", connectionStatus("openai", conns) === "Connected · key 1a2b3c4d", connectionStatus("openai", conns));
check("5 status: not connected", connectionStatus("anthropic", conns) === T.notConnected);
check("5 status: several", connectionStatus("openrouter", conns) === "2 connections");

// 3 + 4. The client against a recording fake gateway.
function fakeGateway({ taken = ["openai-key"], conflictOnce = false, models = many(48), kind } = {}) {
  const calls = [];
  const ids = new Set(taken);
  let conflict = conflictOnce;
  const request = async (path, init) => {
    calls.push({ path, method: init.method, body: init.body === undefined ? undefined : JSON.parse(JSON.stringify(init.body)) });
    if (path.endsWith("/discovery/providers")) return DISCOVERY;
    if (path.endsWith("/discover-models")) return kind ? { ok: false, models: [], error_kind: kind } : { ok: true, models };
    if (path.endsWith("/config/provider-endpoint-profiles") && init.method === "GET")
      return { profiles: [...ids].map((id) => ({ id, provider_family: id.split("-")[0], api_key_set: true, api_key_fingerprint: "feedbeef00" })) };
    if (path.endsWith("/config/provider-endpoint-profiles") && init.method === "POST") {
      const id = init.body.id;
      if (conflict || ids.has(id)) {
        conflict = false;
        ids.add(id);
        throw Object.assign(new Error("A provider connection named that already exists"), { status: 409 });
      }
      ids.add(id);
      return { ok: true, profile: { id, api_key_set: true, api_key_fingerprint: "c0ffee00" } };
    }
    throw new Error(`unexpected ${init.method} ${path}`);
  };
  return { calls, request };
}

{
  const g = fakeGateway();
  const client = cloudProvidersClient(g.request, "/api/gateway");
  const listed = await client.listProviders();
  check("1 the client reads GET discovery/providers", g.calls[0].path === "/api/gateway/discovery/providers" && listed.length === 4);
  g.calls.length = 0;
  const checked = await client.checkKey(oa, `  ${KEY}  `);
  check("3 check = ONE POST discover-models {provider_family, api_key}", g.calls.length === 1 && g.calls[0].method === "POST" && g.calls[0].path === "/api/gateway/config/provider-endpoint-profiles/discover-models"
    && JSON.stringify(g.calls[0].body) === JSON.stringify({ provider_family: "openai", api_key: KEY }), g.calls);
  check("3 check result", checked.result.ok && checked.result.sentence === "Key works · 48 models");
  g.calls.length = 0;
  let refused = 0;
  for (const bad of [null, { ...checked, result: { ...checked.result, ok: false } }, { ...checked, family: "anthropic" }, { ...checked, apiKey: "" }]) {
    try { await client.saveCheckedKey(oa, bad); } catch { refused += 1; }
  }
  check("3 save refuses an unchecked / failed / other-provider / empty key", refused === 4);
  check("3 a refused save sends nothing", g.calls.length === 0, g.calls);
  const saved = await client.saveCheckedKey(oa, checked);
  const posts = g.calls.filter((c) => c.method === "POST");
  check("4 save: GET the connections, then ONE create_only POST with a fresh id", g.calls[0].method === "GET" && posts.length === 1 && posts[0].body.id === "openai-key-2" && posts[0].body.create_only === true, g.calls);
  check("4 save body", JSON.stringify(posts[0].body) === JSON.stringify({ id: "openai-key-2", display_name: "OpenAI (API key 2)", provider_family: "openai", api_key: KEY, base_url: "", scope: "gateway", capabilities: ["text"], create_only: true }), posts[0].body);
  check("4 saved names its virtual provider", saved.virtualProvider === "endpoint:openai-key-2" && saved.name === "OpenAI (API key 2)");
  check("4 never a PUT", !g.calls.some((c) => c.method === "PUT"));
}
{
  // Someone took the id between the list and the POST: the 409 moves to the NEXT id.
  const g = fakeGateway({ taken: [], conflictOnce: true });
  const client = cloudProvidersClient(g.request);
  const checked = await client.checkKey(oa, KEY);
  const saved = await client.saveCheckedKey(oa, checked, "user");
  const ids = g.calls.filter((c) => c.method === "POST" && c.path.endsWith("provider-endpoint-profiles")).map((c) => c.body.id);
  check("4 a 409 retries with the next id, never the same one", JSON.stringify(ids) === JSON.stringify(["openai-key", "openai-key-2"]) && saved.id === "openai-key-2", ids);
  check("4 relative default base", g.calls[0].path === "api/gateway/config/provider-endpoint-profiles/discover-models", g.calls[0].path);
  check("4 the host's scope is sent", g.calls.filter((c) => c.method === "POST").pop().body.scope === "user");
}

// 6. OpenAI-compatible endpoints: the preset card(s) and the generic card, AbstractCore's
// `openai-compatible` provider with a base URL.
const { cloudCardsFromDiscovery, cardStatus, OPENAI_COMPATIBLE_PRESETS: PRESETS, GENERIC_COMPATIBLE_CARD: GENERIC, connectedSentence, slugId, validBaseUrl } = kit;
const WITH_COMPAT = { items: [...DISCOVERY.items, { name: "openai-compatible", display_name: "OpenAI-Compatible", local_provider: true }] };
{
  const cards = cloudCardsFromDiscovery(WITH_COMPAT);
  check("6 cards: natives, then the presets, then the generic card", JSON.stringify(cards.map((c) => c.id)) === JSON.stringify(["anthropic", "openai", "openrouter", "portkey", ...PRESETS.map((p) => p.id), "openai-compatible"]), cards.map((c) => c.id));
  check("6 no compatible cards when AbstractCore has no openai-compatible provider", cloudCardsFromDiscovery({ items: DISCOVERY.items.filter((i) => i.name !== "openai-compatible") }).every((c) => c.kind === "native"));
  const ovh = PRESETS.find((p) => p.id === "ovh");
  check("6 OVH AI Endpoints is a preset with an https base URL and its documentation", !!ovh && ovh.kind === "preset" && ovh.family === "openai-compatible" && /^https:\/\/[^/]+\/v1$/.test(ovh.baseUrl) && /^https:\/\//.test(ovh.docs), ovh);
  check("6 the generic card", GENERIC.kind === "generic" && GENERIC.family === "openai-compatible" && GENERIC.name === "Other OpenAI-compatible endpoint");
  check("6 connected sentence", connectedSentence(48) === "Connected · 48 models" && connectedSentence(1) === "Connected · 1 model");
  check("6 slug ids", slugId("OVH AI Endpoints") === "ovh-ai-endpoints" && slugId("  ") === "endpoint");
  check("6 base URL validation", validBaseUrl("https://api.mistral.ai/v1/") === "https://api.mistral.ai/v1" && validBaseUrl("api.mistral.ai") === "" && validBaseUrl("ftp://x") === "");
  const conns = kit.connectionsFromProfiles({ profiles: [
    { id: "ovh-ai-endpoints", provider_family: "openai-compatible", base_url: ovh.baseUrl + "/", api_key_set: true, api_key_fingerprint: "0badc0de99" },
    { id: "mistral", provider_family: "openai-compatible", display_name: "Mistral", base_url: "https://api.mistral.ai/v1", api_key_set: true },
    { id: "vllm", provider_family: "openai-compatible", base_url: "http://127.0.0.1:8000/v1" },
  ] });
  check("6 OVH card status from its base URL", cardStatus(ovh, conns) === "Connected · key 0badc0de", cardStatus(ovh, conns));
  check("6 generic card: other cloud endpoints only (not OVH, not a local server)", cardStatus(GENERIC, conns) === "Connected · Mistral", cardStatus(GENERIC, conns));
}

// 3 + 5. The component, driven: ONE action per card (Connect / Reconnect).
function gw({ taken = ["openai-key"], kind, models = many(48) } = {}) {
  const g = fakeGateway({ taken, kind, models });
  const inner = g.request;
  g.request = async (path, init) => (path.endsWith("/discovery/providers") ? (g.calls.push({ path, method: init.method }), WITH_COMPAT) : inner(path, init));
  return g;
}
{
  const g = gw();
  const saves = [];
  const card = mountHook(CloudProviderCards, { request: g.request, base: "/api/gateway", onSaved: (s) => saves.push(s) });
  await card.settle();
  const tree = () => card.current;
  const articles = () => findAll(tree(), (n) => n.props && n.props["data-cloud-provider"]);
  const ids = articles().map((a) => a.props["data-cloud-provider"]);
  check("1 one card per native provider, the presets, the generic card", JSON.stringify(ids) === JSON.stringify(["anthropic", "openai", "openrouter", "portkey", ...PRESETS.map((p) => p.id), "openai-compatible"]), ids);
  const inCard = (id, pred) => find(articles().find((a) => a.props["data-cloud-provider"] === id), pred);
  const input = (id, type = "password") => inCard(id, (n) => n.type === "input" && n.props.type === type);
  const buttons = (id) => findAll(articles().find((a) => a.props["data-cloud-provider"] === id), (n) => n.type === "button");
  const button = (id) => inCard(id, (n) => n.type === "button" && n.props["data-action"] === "connect");
  const line = (id) => inCard(id, (n) => n.props && "data-cloud-line" in n.props).props.children;
  const status = (id) => inCard(id, (n) => n.props && "data-cloud-status" in n.props).props.children;
  check("3 ONE action per card", ids.every((id) => buttons(id).length === 1 && buttons(id)[0].props["data-action"] === "connect"), ids.map((id) => buttons(id).length));
  check("3 Connect on a provider without a connection, Reconnect on one with", button("anthropic").props.children === T.connect && button("openai").props.children === T.reconnect, [button("anthropic").props.children, button("openai").props.children]);
  check("5 the key field is a password field, not autofilled", input("openai").props.type === "password" && input("openai").props.autoComplete === "off");
  check("5 status from the gateway's fingerprint", status("openai") === "Connected · key feedbeef" && status("anthropic") === "Not connected", [status("openai"), status("anthropic")]);
  // An empty key is not sent.
  button("anthropic").props.onClick();
  await card.settle();
  check("3 an empty field is not sent", line("anthropic") === T.pasteFirst && !g.calls.some((c) => c.path.endsWith("discover-models")));
  // Connect = check, then (only because it worked) save.
  input("anthropic").props.onChange({ target: { value: KEY } });
  card.render();
  button("anthropic").props.onClick();
  await card.settle();
  const order = g.calls.filter((c) => c.method === "POST").map((c) => (c.path.endsWith("discover-models") ? "check" : "save"));
  check("3 Connect checks the key BEFORE it stores it", JSON.stringify(order) === JSON.stringify(["check", "save"]), order);
  const post = g.calls.filter((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles"));
  check("4 a new connection: fresh id, create_only, never a PUT", post.length === 1 && post[0].body.id === "anthropic-key" && post[0].body.create_only === true && !g.calls.some((c) => c.method === "PUT"), post);
  check("2 the line reads Connected · 48 models", line("anthropic") === "Connected · 48 models", line("anthropic"));
  check("5 the field is emptied once connected", input("anthropic").props.value === "");
  check("onSaved tells the host", saves.length === 1 && saves[0].id === "anthropic-key");
  check("3 the card now offers Reconnect", button("anthropic").props.children === T.reconnect);
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, tree()));
  check("5 the key is nowhere in the rendered cards", !html.includes(KEY) && !html.includes(KEY.slice(0, 12)));
  // Reconnect on OpenAI (connected as openai-key): a NEW connection, the existing one untouched.
  input("openai").props.onChange({ target: { value: KEY } });
  card.render();
  button("openai").props.onClick();
  await card.settle();
  const openaiPost = g.calls.filter((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles")).pop();
  check("4 Reconnect saves openai-key-2, never overwrites openai-key", openaiPost.body.id === "openai-key-2" && openaiPost.body.create_only === true, openaiPost.body);
  // The OVH preset: its base URL, no URL field.
  const ovh = PRESETS.find((p) => p.id === "ovh");
  check("6 the OVH card shows its preset URL and asks only for the key", !inCard("ovh", (n) => n.type === "input" && n.props.type === "url") && !!input("ovh"), ids);
  input("ovh").props.onChange({ target: { value: KEY } });
  card.render();
  button("ovh").props.onClick();
  await card.settle();
  const ovhCheck = g.calls.filter((c) => c.path.endsWith("discover-models")).pop();
  const ovhSave = g.calls.filter((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles")).pop();
  check("6 OVH: checked as openai-compatible at its preset URL", ovhCheck.body.provider_family === "openai-compatible" && ovhCheck.body.base_url === ovh.baseUrl, ovhCheck.body);
  check("6 OVH: saved as a new openai-compatible connection with that URL", ovhSave.body.id === "ovh-ai-endpoints" && ovhSave.body.base_url === ovh.baseUrl && ovhSave.body.display_name === ovh.name && ovhSave.body.create_only === true, ovhSave.body);
  // The generic card: Name, Base URL, key; a missing or bad URL is not sent.
  check("6 the generic card has Name, Base URL and API key", !!input("openai-compatible", "text") && !!input("openai-compatible", "url") && !!input("openai-compatible"));
  const before = g.calls.length;
  input("openai-compatible").props.onChange({ target: { value: KEY } });
  card.render();
  button("openai-compatible").props.onClick();
  await card.settle();
  check("6 no base URL: a sentence, nothing sent", line("openai-compatible") === T.baseUrlFirst && g.calls.length === before, line("openai-compatible"));
  input("openai-compatible", "text").props.onChange({ target: { value: "Mistral" } });
  input("openai-compatible", "url").props.onChange({ target: { value: "https://api.mistral.ai/v1/" } });
  card.render();
  button("openai-compatible").props.onClick();
  await card.settle();
  const genCheck = g.calls.filter((c) => c.path.endsWith("discover-models")).pop();
  const genSave = g.calls.filter((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles")).pop();
  check("6 generic: checked at the typed URL", genCheck.body.provider_family === "openai-compatible" && genCheck.body.base_url === "https://api.mistral.ai/v1", genCheck.body);
  check("6 generic: saved under its name", genSave.body.id === "mistral" && genSave.body.display_name === "Mistral" && genSave.body.base_url === "https://api.mistral.ai/v1" && genSave.body.create_only === true, genSave.body);
  check("6 generic: fields emptied once connected", input("openai-compatible", "url").props.value === "" && input("openai-compatible").props.value === "");
  // A refused key: the reason, nothing stored.
  const g2 = gw({ kind: "auth" });
  const c2 = mountHook(CloudProviderCards, { request: g2.request });
  await c2.settle();
  const a2 = () => findAll(c2.current, (n) => n.props && n.props["data-cloud-provider"] === "openrouter")[0];
  find(a2(), (n) => n.type === "input").props.onChange({ target: { value: KEY } });
  c2.render();
  find(a2(), (n) => n.type === "button").props.onClick();
  await c2.settle();
  check("2 a refused key says why on its card", find(a2(), (n) => n.props && "data-cloud-line" in n.props).props.children === "OpenRouter refused this key. Check that it was copied in full and is still active.");
  check("3 nothing stored on a failed check", !g2.calls.some((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles")), g2.calls);
  check("3 the key stays in the field to fix it", find(a2(), (n) => n.type === "input").props.value === KEY);
}

if (failures) {
  console.error(`check_cloud_providers: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_cloud_providers: OK (${checks} checks: registry list, presets + generic compatible card, one Connect action, check before save, create-only fresh ids, key never rendered)`);
