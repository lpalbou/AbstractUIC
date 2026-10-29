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

// 3 + 5. The component, driven.
{
  const g = fakeGateway();
  const saves = [];
  const card = mountHook(CloudProviderCards, { request: g.request, base: "/api/gateway", onSaved: (s) => saves.push(s), onConfigure: () => {} });
  await card.settle();
  const tree = () => card.current;
  const articles = () => findAll(tree(), (n) => n.props && n.props["data-cloud-provider"]);
  check("1 one card per cloud provider", JSON.stringify(articles().map((a) => a.props["data-cloud-provider"])) === JSON.stringify(["anthropic", "openai", "openrouter", "portkey"]), articles().map((a) => a.props["data-cloud-provider"]));
  const inCard = (id, pred) => find(articles().find((a) => a.props["data-cloud-provider"] === id), pred);
  const input = (id) => inCard(id, (n) => n.type === "input");
  const button = (id, action) => inCard(id, (n) => n.type === "button" && n.props["data-action"] === action);
  const line = (id) => inCard(id, (n) => n.props && "data-cloud-line" in n.props).props.children;
  const status = (id) => inCard(id, (n) => n.props && "data-cloud-status" in n.props).props.children;
  check("5 the key field is a password field, not autofilled", input("openai").props.type === "password" && input("openai").props.autoComplete === "off");
  check("5 status from the gateway's fingerprint", status("openai") === "Connected · key feedbeef" && status("anthropic") === "Not connected", [status("openai"), status("anthropic")]);
  check("3 no Save before a check", !button("openai", "save") && !!button("openai", "check"));
  check("More settings opens the host's editor", !!button("openai", "configure"));
  button("openai", "check").props.onClick();
  await card.settle();
  check("3 an empty field is not sent", line("openai") === T.pasteFirst && !g.calls.some((c) => c.path.endsWith("discover-models")));
  input("openai").props.onChange({ target: { value: KEY } });
  card.render();
  button("openai", "check").props.onClick();
  await card.settle();
  check("2 the card reads Key works · 48 models", line("openai") === "Key works · 48 models", line("openai"));
  check("3 nothing stored by the check", !g.calls.some((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles")));
  check("4 a connected provider saves as a NEW connection", button("openai", "save")?.props.children === T.saveAnother);
  // Editing the key after the check drops it: Save is gone until it is checked again.
  input("openai").props.onChange({ target: { value: KEY + "x" } });
  card.render();
  check("3 an edited key must be checked again", !button("openai", "save") && !!button("openai", "check"));
  input("openai").props.onChange({ target: { value: KEY } });
  card.render();
  button("openai", "check").props.onClick();
  await card.settle();
  button("openai", "save").props.onClick();
  await card.settle();
  const post = g.calls.filter((c) => c.method === "POST" && c.path.endsWith("/provider-endpoint-profiles"));
  check("4 the card's save is create_only with a fresh id", post.length === 1 && post[0].body.id === "openai-key-2" && post[0].body.create_only === true, post);
  check("5 the field is emptied and the check dropped after the save", input("openai").props.value === "" && !button("openai", "save"));
  check("5 saved line", line("openai") === "Saved as OpenAI (API key 2). Choose its models in Default models; the key is never shown again.", line("openai"));
  check("onSaved tells the host", saves.length === 1 && saves[0].id === "openai-key-2");
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, tree()));
  check("5 the key is nowhere in the rendered cards", !html.includes(KEY) && !html.includes(KEY.slice(0, 12)));
  check("5 status refreshed after the save (2 connections)", status("openai") === "2 connections", status("openai"));
  // A refused key: one sentence, no Save.
  const g2 = fakeGateway({ kind: "auth" });
  const c2 = mountHook(CloudProviderCards, { request: g2.request });
  await c2.settle();
  const a2 = () => findAll(c2.current, (n) => n.props && n.props["data-cloud-provider"] === "openrouter")[0];
  find(a2(), (n) => n.type === "input").props.onChange({ target: { value: KEY } });
  c2.render();
  find(a2(), (n) => n.type === "button" && n.props["data-action"] === "check").props.onClick();
  await c2.settle();
  check("2 a refused key says why on its card", find(a2(), (n) => n.props && "data-cloud-line" in n.props).props.children === "OpenRouter refused this key. Check that it was copied in full and is still active.");
  check("3 a refused key offers no Save", !find(a2(), (n) => n.type === "button" && n.props["data-action"] === "save"));
}

if (failures) {
  console.error(`check_cloud_providers: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_cloud_providers: OK (${checks} checks: registry list, readable check, check before save, create-only fresh ids, key never rendered)`);
