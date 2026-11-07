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
 *     fingerprint only;
 *  7. Edit updates THAT connection in place (PUT, only what changed; a stored key tested by its id)
 *     and Disconnect is ONE DELETE; a connection from AbstractCore's config is neither;
 *  8. the simpler cards (operator 2026-11-01): every card draws its brand mark (never initials), ONE
 *     button, Connect when nothing is stored and Edit when a connection exists (a connected card
 *     without Edit is red), no field on a card; the Connect / Edit modal: fields per provider (Name
 *     first on the generic card, Base URL on the OpenAI-compatible cards, the key masked), Test
 *     connection, Save (never untested), Cancel, Disconnect with a confirmation;
 *  9. a native whose endpoint is user-supplied (NATIVE_ENDPOINT_RULES: System One) gets a required,
 *     editable Base URL and an optional key; its test and save carry that URL.
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
function fakeGateway({ taken = ["openai-key"], conflictOnce = false, models = many(48), kind, rows: extra = [] } = {}) {
  const calls = [];
  const ids = new Set(taken);
  // The stored connections, as GET config/provider-endpoint-profiles lists them (fingerprints only).
  const rows = new Map(taken.map((id) => [id, { id, provider_family: id.split("-")[0], api_key_set: true, api_key_fingerprint: "feedbeef00" }]));
  for (const r of extra) { rows.set(r.id, r); ids.add(r.id); }
  let conflict = conflictOnce;
  const request = async (path, init) => {
    calls.push({ path, method: init.method, body: init.body === undefined ? undefined : JSON.parse(JSON.stringify(init.body)) });
    if (path.endsWith("/discovery/providers")) return DISCOVERY;
    if (path.endsWith("/discover-models")) return kind ? { ok: false, models: [], error_kind: kind } : { ok: true, models };
    if (path.endsWith("/config/provider-endpoint-profiles") && init.method === "GET") return { profiles: [...rows.values()] };
    if (path.endsWith("/config/provider-endpoint-profiles") && init.method === "POST") {
      const id = init.body.id;
      if (conflict || ids.has(id)) {
        conflict = false;
        ids.add(id);
        throw Object.assign(new Error("A provider connection named that already exists"), { status: 409 });
      }
      ids.add(id);
      rows.set(id, { id, provider_family: init.body.provider_family, display_name: init.body.display_name, base_url: init.body.base_url, api_key_set: true, api_key_fingerprint: "c0ffee0011" });
      return { ok: true, profile: { id, api_key_set: true, api_key_fingerprint: "c0ffee00" } };
    }
    const one = /\/config\/provider-endpoint-profiles\/([^/]+)$/.exec(path);
    if (one && init.method === "PUT") {
      const id = decodeURIComponent(one[1]);
      if (!rows.has(id)) throw Object.assign(new Error("Endpoint profile not found"), { status: 404 });
      const r = rows.get(id);
      if (init.body.display_name) r.display_name = init.body.display_name;
      if (init.body.base_url) r.base_url = init.body.base_url;
      if (init.body.api_key) r.api_key_fingerprint = "5eed5eed00";
      return { ok: true, profile: r };
    }
    if (one && init.method === "DELETE") {
      const id = decodeURIComponent(one[1]);
      if (!rows.delete(id)) throw Object.assign(new Error("Endpoint profile not found"), { status: 404 });
      ids.delete(id);
      return { ok: true, deleted: true };
    }
    throw new Error(`unexpected ${init.method} ${path}`);
  };
  return { calls, request, rows };
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
  check("6 the generic card", GENERIC.kind === "generic" && GENERIC.family === "openai-compatible" && GENERIC.name === "OpenAI-compatible endpoint");
  check("6 connected sentence", connectedSentence(48) === "Connected · 48 models" && connectedSentence(1) === "Connected · 1 model");
  check("6 slug ids", slugId("OVH AI Endpoints") === "ovh-ai-endpoints" && slugId("  ") === "endpoint");
  check("6 base URL validation", validBaseUrl("https://api.mistral.ai/v1/") === "https://api.mistral.ai/v1" && validBaseUrl("api.mistral.ai") === "" && validBaseUrl("ftp://x") === "");
  const conns = kit.connectionsFromProfiles({ profiles: [
    { id: "ovh-ai-endpoints", provider_family: "openai-compatible", base_url: ovh.baseUrl + "/", api_key_set: true, api_key_fingerprint: "0badc0de99" },
    { id: "mistral", provider_family: "openai-compatible", display_name: "Mistral", base_url: "https://api.mistral.ai/v1", api_key_set: true },
    { id: "vllm", provider_family: "openai-compatible", base_url: "http://127.0.0.1:8000/v1" },
  ] });
  check("6 OVH card status from its base URL", cardStatus(ovh, conns) === "Connected", cardStatus(ovh, conns));
  check("6 generic card: other cloud endpoints only (not OVH, not a local server)", cardStatus(GENERIC, conns) === "Connected · Mistral", cardStatus(GENERIC, conns));
}

// 7. Edit in place and Disconnect (operator 2026-11-01), the client: a stored key is tested by its
// connection id, an update sends only what changed (PUT, never a POST), a removal is ONE DELETE, and
// a connection from AbstractCore's config is never updated or removed from here.
{
  const { cardEditTarget } = kit;
  const g = fakeGateway({ rows: [{ id: "openai", provider_family: "openai", api_key_set: true, api_key_fingerprint: "abcdef1234", managed: false, synthetic: true, discovered_model_count: 12 }] });
  const client = cloudProvidersClient(g.request, "/api/gateway");
  const conns = await client.listConnections();
  const managed = conns.find((c) => c.id === "openai-key");
  const configured = conns.find((c) => c.id === "openai");
  const oaCard = { id: "openai", name: "OpenAI", family: "openai", kind: "native", baseUrl: "", docs: "" };
  check("7 a config connection is flagged, with its model count", configured.configured === true && configured.modelCount === 12 && managed.configured === false && managed.modelCount === 0);
  check("7 Edit opens the gateway connection before the config one", cardEditTarget(oaCard, conns).id === "openai-key");
  check("7 status adds the models found (single connection)", cardStatus(oaCard, [managed], { "openai-key": 48 }) === "Connected · 48 models" && cardStatus(oaCard, [configured]) === "Connected · 12 models", [cardStatus(oaCard, [managed], { "openai-key": 48 }), cardStatus(oaCard, [configured])]);
  check("7 status: no count, no suffix; several connections, no count", cardStatus(oaCard, [managed]) === "Connected" && cardStatus(oaCard, conns, { "openai-key": 48 }) === "2 connections");
  g.calls.length = 0;
  const stored = await client.checkConnection(oa, { apiKey: "", connection: managed });
  check("7 Test with no key typed tests the STORED key by its id (no api_key sent)", g.calls.length === 1 && JSON.stringify(g.calls[0].body) === JSON.stringify({ provider_family: "openai", profile_id: "openai-key" }) && stored.result.ok && stored.connectionId === "openai-key", g.calls);
  const cfg = await client.checkConnection(oa, { apiKey: "", connection: configured });
  check("7 a config connection is tested through the provider's configured key (no profile_id)", JSON.stringify(g.calls[1].body) === JSON.stringify({ provider_family: "openai" }) && cfg.result.ok, g.calls[1]);
  g.calls.length = 0;
  let refused = 0;
  for (const [conn, checked] of [[managed, null], [managed, { ...stored, result: { ...stored.result, ok: false } }], [managed, { ...stored, connectionId: "other" }], [configured, stored]]) {
    try { await client.updateConnection(oa, conn, checked); } catch { refused += 1; }
  }
  check("7 update refuses nothing-changed / a failed test / another connection's test / a config connection", refused === 4 && g.calls.length === 0, [refused, g.calls]);
  let same = "";
  try { await client.updateConnection(oa, managed, stored); } catch (err) { same = err.message; }
  check("7 the stored key tested again and nothing changed: refused, nothing sent", same === T.nothingChanged && !g.calls.some((c) => c.method === "PUT"), same);
  const typed = await client.checkConnection(oa, { apiKey: KEY, connection: managed });
  g.calls.length = 0;
  const upd = await client.updateConnection(oa, managed, typed);
  check("7 a new key: ONE PUT of that connection with the key only (never a POST, never scope)", g.calls.length === 1 && g.calls[0].method === "PUT" && g.calls[0].path === "/api/gateway/config/provider-endpoint-profiles/openai-key" && JSON.stringify(g.calls[0].body) === JSON.stringify({ api_key: KEY }) && upd.id === "openai-key", g.calls);
  g.calls.length = 0;
  let cfgRemoved = true;
  try { await client.removeConnection(configured); } catch { cfgRemoved = false; }
  check("7 a config connection is not removable here (no request)", !cfgRemoved && g.calls.length === 0);
  await client.removeConnection(managed);
  check("7 Disconnect = ONE DELETE of that connection", g.calls.length === 1 && g.calls[0].method === "DELETE" && g.calls[0].path === "/api/gateway/config/provider-endpoint-profiles/openai-key", g.calls);
}
// The "nothing changed" refusal above threw before any request; prove it said so.
{
  const g = fakeGateway();
  const client = cloudProvidersClient(g.request);
  const [managed] = await client.listConnections();
  let why = "";
  try { await client.updateConnection(oa, managed, null); } catch (err) { why = err.message; }
  check("7 nothing changed is said, not sent", why === T.nothingChanged && !g.calls.some((c) => c.method === "PUT"), why);
}

// 8. The component, driven: simpler cards (mark, name, ONE status, ONE button: Connect or Edit) and
// the Connect / Edit modal (AfModal: fields per provider, Test connection, Save, Cancel, Disconnect).
const { AfModal, brandMarkInfo } = kit;
const WITH_DECISION = { items: [...WITH_COMPAT.items,
  { name: "typesafe", display_name: "TypeSafe (Jev)", local_provider: false, authentication_required: true },
  { name: "systemone", display_name: "System One-compatible endpoint", local_provider: false, authentication_required: false }] };
function gw(opts = {}) {
  const g = fakeGateway(opts);
  const inner = g.request;
  g.request = async (path, init) => (path.endsWith("/discovery/providers") ? (g.calls.push({ path, method: init.method }), WITH_DECISION) : inner(path, init));
  return g;
}
function drive(c) {
  const tree = () => c.current;
  const articles = () => findAll(tree(), (n) => n.props && n.props["data-cloud-provider"]);
  const article = (id) => articles().find((a) => a.props["data-cloud-provider"] === id);
  const buttons = (id) => findAll(article(id), (n) => n.type === "button");
  const status = (id) => find(article(id), (n) => n.props && "data-cloud-status" in n.props).props.children;
  const modal = () => find(tree(), (n) => n.type === AfModal);
  const body = (pred) => find(modal().props.children, pred);
  const bodyAll = (pred) => findAll(modal().props.children, pred);
  const foot = (action) => find(modal().props.footer, (n) => n.type === "button" && n.props["data-action"] === action);
  const field = (type) => body((n) => n.type === "input" && n.props.type === type);
  const line = () => body((n) => n.props && "data-cloud-modal-line" in n.props).props.children;
  const type = (t, value) => { field(t).props.onChange({ target: { value } }); c.render(); };
  const click = async (action) => { foot(action).props.onClick(); await c.settle(); };
  const open = async (id) => { buttons(id)[0].props.onClick(); await c.settle(); };
  // Background discoveries chain several awaits: settle until the tree stops changing.
  c.settleAll = async () => { for (let i = 0; i < 6; i += 1) await c.settle(); };
  // Every text a card renders outside its badge (the name and the button excepted).
  const cardTexts = (id) => findAll(article(id), (n) => n.props && typeof n.props.children === "string" && n.type !== "h4" && n.type !== "button" && !("data-cloud-status" in n.props)).map((n) => n.props.children).filter((t) => t.trim());
  return { tree, articles, article, buttons, status, cardTexts, modal, body, bodyAll, foot, field, line, type, click, open };
}
{
  const g = gw();
  const saves = [];
  const c = mountHook(CloudProviderCards, { request: g.request, base: "/api/gateway", onSaved: (s) => saves.push(s) });
  await c.settle();
  const d = drive(c);
  const ids = d.articles().map((a) => a.props["data-cloud-provider"]);
  check("8 brand cards first (registry order, then the presets), the two compatible cards LAST in order", JSON.stringify(ids) === JSON.stringify(["anthropic", "openai", "openrouter", "portkey", "typesafe", ...PRESETS.map((p) => p.id), "openai-compatible", "systemone"]), ids);
  check("8 the last two cards: OpenAI-compatible endpoint, then System One-compatible endpoint", JSON.stringify(d.articles().slice(-2).map((a) => find(a, (n) => n.type === "h4").props.children)) === JSON.stringify(["OpenAI-compatible endpoint", "System One-compatible endpoint"]), d.articles().slice(-2).map((a) => a.props["data-cloud-provider"]));
  // A card without artwork is red: every card's mark is official artwork, a kit glyph or a documented badge.
  for (const id of ids) {
    const mark = find(d.article(id), (n) => n.props && n.props.id === id && n.props.name !== undefined && typeof n.type === "function");
    check(`8 ${id}: the card draws its brand mark, never initials`, !!mark && brandMarkInfo(id).kind !== "unknown", brandMarkInfo(id).kind);
  }
  check("8 TypeSafe has its artwork and System One the server glyph", brandMarkInfo("typesafe").kind === "icon" && brandMarkInfo("systemone").kind === "glyph");
  check("8 ONE button per card, no field on any card", ids.every((id) => d.buttons(id).length === 1 && !findAll(d.article(id), (n) => n.type === "input" || n.type === "select").length), ids.map((id) => d.buttons(id).length));
  // A connected card without Edit is red.
  const actionOf = (id) => d.buttons(id)[0].props["data-action"];
  check("8 Connect when nothing is stored, Edit when a connection exists", actionOf("anthropic") === "connect" && d.buttons("anthropic")[0].props.children === T.connect && actionOf("openai") === "edit" && d.buttons("openai")[0].props.children === T.edit, ids.map(actionOf));
  check("8 every connected card offers Edit, every other Connect", ids.every((id) => (d.status(id) === T.notConnected) === (actionOf(id) === "connect")), ids.map((id) => [id, d.status(id), actionOf(id)]));
  check("8 a CLEAR connected badge (green dot) vs a quiet Not connected", d.article("openai").props.className.includes("is-connected") && !!find(d.article("openai"), (n) => n.props && n.props.className === "af-cloud-card__dot") && !find(d.article("anthropic"), (n) => n.props && n.props.className === "af-cloud-card__dot"));
  await c.settleAll();
  // Every connected card shows its model count: ONE background discovery of the stored connection.
  const bg = (id) => g.calls.filter((x) => x.path.endsWith("discover-models") && x.body && x.body.profile_id === id);
  check("15 a connected row without a count triggers exactly ONE discovery (its stored connection, never a key)", bg("openai-key").length === 1 && !("api_key" in bg("openai-key")[0].body), g.calls.filter((x) => x.path.endsWith("discover-models")));
  check("15 the count lands in the badge", d.status("openai") === "Connected · 48 models" && d.status("anthropic") === T.notConnected, [d.status("openai"), d.status("anthropic")]);
  c.render();
  await c.settleAll();
  check("15 a re-render does not query again", bg("openai-key").length === 1);
  const FP = /\bkey\b|[0-9a-f]{8}/i;
  check("8 no card badge shows a key fingerprint", ids.every((id) => !FP.test(d.status(id))), ids.map(d.status));
  check("8 no modal until a button is pressed", !d.modal());

  // Connect Anthropic: the modal, a key-only form, Test, then Save.
  await d.open("anthropic");
  check("8 Connect opens the modal titled Connect <provider>", !!d.modal() && d.modal().props.title === "Connect Anthropic" && d.modal().props.open === true, d.modal() && d.modal().props.title);
  check("8 the key field is uncontrolled: no value, no defaultValue (never a DOM attribute)", !("value" in d.field("password").props) && !("defaultValue" in d.field("password").props));
  check("8 a native provider asks for the API key only (masked, not autofilled)", !!d.field("password") && !d.field("url") && !d.field("text") && d.field("password").props.autoComplete === "off");
  check("8 Connect offers no Disconnect", !d.foot("disconnect") && !!d.foot("test") && !!d.foot("save") && !!d.foot("cancel"));
  const before = g.calls.length;
  await d.click("save");
  check("8 an empty key is not sent", d.line() === T.pasteFirst && g.calls.length === before, d.line());
  d.type("password", KEY);
  await d.click("test");
  // The modal's own requests (background count discoveries of stored connections, `profile_id`, excluded).
  const posts = () => g.calls.filter((x) => x.method === "POST" && !(x.body && x.body.profile_id && !x.body.api_key)).map((x) => (x.path.endsWith("discover-models") ? "check" : "save"));
  check("8 Test checks the key and stores nothing", JSON.stringify(posts()) === JSON.stringify(["check"]) && d.line() === "Key works · 48 models", [posts(), d.line()]);
  await d.click("save");
  check("8 Save after a passing Test saves without testing again", JSON.stringify(posts()) === JSON.stringify(["check", "save"]), posts());
  const created = g.calls.filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles")).pop();
  check("8 a new connection: fresh id, create_only", created.body.id === "anthropic-key" && created.body.create_only === true && created.body.api_key === KEY, created.body);
  check("8 the modal closes once saved and the key is forgotten", !d.modal());
  check("8 the card now shows Connected with the models found, and Edit", d.status("anthropic") === "Connected · 48 models" && actionOf("anthropic") === "edit", [d.status("anthropic"), actionOf("anthropic")]);
  check("8 the badge is the card's ONLY status: no line repeats it (or anything else)", ids.every((id) => !d.cardTexts(id).length && !findAll(d.article(id), (n) => n.props && "data-cloud-line" in n.props).length), ids.map((id) => [id, d.cardTexts(id)]));
  check("8 onSaved tells the host", saves.length === 1 && saves[0].id === "anthropic-key");
  check("8 the key is nowhere in the rendered cards", !renderToStaticMarkup(React.createElement(React.Fragment, null, d.tree())).includes(KEY.slice(0, 12)));

  // Save without a Test: it tests first, then saves (nothing stored untested).
  await d.open("openrouter");
  d.type("password", KEY);
  const n0 = posts().length;
  await d.click("save");
  check("8 Save without a Test tests BEFORE it stores", JSON.stringify(posts().slice(n0)) === JSON.stringify(["check", "save"]), posts().slice(n0));

  // Edit OpenAI (stored as openai-key): the stored key stays unless replaced; PUT, never POST.
  await d.open("openai");
  check("8 Edit opens Edit <provider>", d.modal().props.title === "Edit OpenAI");
  check("8 Edit: the key field is empty, with the keep-or-replace hint", !("value" in d.field("password").props) && !("defaultValue" in d.field("password").props) && !!d.body((n) => n.props && n.props.children === T.keyKeepHint), d.field("password").props.value);
  check("8 Edit offers Disconnect", !!d.foot("disconnect"));
  check("8 the Edit modal shows the stored key's fingerprint", d.field("password").props.placeholder === "Stored key feedbeef", d.field("password").props.placeholder);
  const c0 = g.calls.length;
  await d.click("test");
  const t1 = g.calls.slice(c0);
  check("8 Edit Test with no key tests the STORED key (profile_id, no api_key)", t1.length === 1 && t1[0].body.profile_id === "openai-key" && !("api_key" in t1[0].body), t1);
  await d.click("save");
  check("8 Edit Save with nothing changed says so and sends nothing", d.line() === T.nothingChanged && !g.calls.some((x) => x.method === "PUT"), d.line());
  d.type("password", KEY);
  check("8 a typed key drops the earlier test's sentence", d.line() === "");
  await d.click("save");
  const put = g.calls.filter((x) => x.method === "PUT");
  check("8 Edit Save with a new key: tested, then ONE PUT of openai-key with the key only", put.length === 1 && put[0].path.endsWith("/provider-endpoint-profiles/openai-key") && JSON.stringify(put[0].body) === JSON.stringify({ api_key: KEY }) && g.calls[g.calls.indexOf(put[0]) - 1].path.endsWith("discover-models"), put);
  check("8 Edit never creates a connection", g.calls.filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles") && x.body.provider_family === "openai").length === 0);
  check("8 the modal closed, the card shows Connected", !d.modal() && d.status("openai") === "Connected · 48 models", d.status("openai"));

  // Disconnect: a confirmation, then ONE DELETE; the card goes back to Connect.
  await d.open("openai");
  await d.click("disconnect");
  check("8 Disconnect asks first (nothing sent)", !!find(d.modal().props.footer, (n) => n.props && "data-cloud-confirm" in n.props) && !g.calls.some((x) => x.method === "DELETE"));
  await d.click("keep");
  check("8 Keep it backs out", !find(d.modal().props.footer, (n) => n.props && "data-cloud-confirm" in n.props) && !!d.foot("disconnect"));
  await d.click("disconnect");
  await d.click("disconnect-confirm");
  const del = g.calls.filter((x) => x.method === "DELETE");
  check("8 confirmed: ONE DELETE of that connection", del.length === 1 && del[0].path.endsWith("/provider-endpoint-profiles/openai-key"), del);
  check("8 the card is back to Not connected / Connect, with no other line", !d.modal() && d.status("openai") === T.notConnected && actionOf("openai") === "connect" && !d.cardTexts("openai").length, [d.status("openai"), actionOf("openai"), d.cardTexts("openai")]);

  // Cancel closes without a request.
  await d.open("portkey");
  d.type("password", KEY);
  const c1 = g.calls.length;
  await d.click("cancel");
  check("8 Cancel closes and sends nothing", !d.modal() && g.calls.length === c1);

  // OVH: its preset Base URL shown read-only, the key; saved with that URL.
  const ovh = PRESETS.find((p) => p.id === "ovh");
  await d.open("ovh");
  check("8 OVH: Base URL (its preset, read-only) and API key", d.field("url").props.value === ovh.baseUrl && d.field("url").props.readOnly === true && !!d.field("password") && !d.field("text"));
  d.type("password", KEY);
  await d.click("save");
  const ovhCheck = g.calls.filter((x) => x.path.endsWith("discover-models")).pop();
  const ovhSave = g.calls.filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles")).pop();
  check("8 OVH: checked and saved as openai-compatible at its preset URL", ovhCheck.body.base_url === ovh.baseUrl && ovhSave.body.id === "ovh-ai-endpoints" && ovhSave.body.base_url === ovh.baseUrl && ovhSave.body.provider_family === "openai-compatible", [ovhCheck.body, ovhSave.body]);

  // The generic card: Name FIRST, Base URL, API key.
  await d.open("openai-compatible");
  const order = d.bodyAll((n) => n.type === "input").map((n) => n.props.type);
  check("8 generic: Name first, then Base URL, then API key", JSON.stringify(order) === JSON.stringify(["text", "url", "password"]), order);
  d.type("password", KEY);
  const c2 = g.calls.length;
  await d.click("save");
  check("8 generic without a base URL: a sentence, nothing sent", d.line() === T.baseUrlFirst && g.calls.length === c2, d.line());
  d.type("text", "Mistral");
  d.type("url", "https://api.mistral.ai/v1/");
  await d.click("save");
  const genSave = g.calls.filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles")).pop();
  check("8 generic: the Name is the connection's id stem", genSave.body.id === "compat-mistral" && genSave.body.display_name === "Mistral" && genSave.body.base_url === "https://api.mistral.ai/v1", genSave.body);
  check("8 generic: Connected · Mistral, then Edit", d.status("openai-compatible") === "Connected · Mistral · 48 models" && actionOf("openai-compatible") === "edit", d.status("openai-compatible"));
  // Edit the endpoint: its name prefilled; a rename alone is a PUT of the name, no test, no key.
  await d.open("openai-compatible");
  const sel = d.body((n) => n.type === "select");
  check("8 generic Edit: pick the endpoint or add a new one", !!sel && findAll(sel, (n) => n.type === "option").map((o) => o.props.value).join(",") === "compat-mistral,", sel && findAll(sel, (n) => n.type === "option").map((o) => o.props.value));
  check("8 generic Edit: Name and Base URL prefilled", d.field("text").props.value === "Mistral" && d.field("url").props.value === "https://api.mistral.ai/v1");
  d.type("text", "  ");
  const cN = g.calls.length;
  await d.click("save");
  check("8 generic Edit with the Name cleared: Name is required (nothing sent)", d.line() === T.nameRequired && g.calls.length === cN, d.line());
  d.type("text", "Mistral EU");
  const c3 = g.calls.length;
  await d.click("save");
  await c.settleAll();
  const ren = g.calls.slice(c3).filter((x) => x.method !== "GET" && !(x.body && x.body.profile_id));
  const rediscovered = g.calls.slice(c3).filter((x) => x.path.endsWith("discover-models") && x.body && x.body.profile_id === "compat-mistral");
  check("15 a save without a test invalidates the count: discovered again, once", rediscovered.length === 1 && g.calls.indexOf(rediscovered[0]) > g.calls.findIndex((x, i) => i >= c3 && x.method === "PUT"), rediscovered);
  check("8 a rename alone: ONE PUT of the name (no test, no key)", ren.length === 1 && ren[0].method === "PUT" && JSON.stringify(ren[0].body) === JSON.stringify({ display_name: "Mistral EU" }), ren);
  // New endpoint from the Edit modal: Connect mode, empty fields.
  await d.open("openai-compatible");
  d.body((n) => n.type === "select").props.onChange({ target: { value: "" } });
  c.render();
  check("8 New endpoint switches to Connect with empty fields", d.modal().props.title === "Connect OpenAI-compatible endpoint" && d.field("text").props.value === "" && d.field("url").props.value === "" && !d.foot("disconnect"));
  // A server that takes no key (operator 2026-11-07: LM Studio on another machine): the key field
  // says optional, and Test and Save both go through without one.
  check("8 generic: the key field says optional", !!d.body((n) => n.type === "label" && n.props.children === T.keyOptionalLabel));
  d.type("text", "theforge");
  d.type("url", "http://192.168.1.7:1234/v1");
  const cK = g.calls.length;
  await d.click("test");
  const keylessTest = g.calls.slice(cK).find((x) => x.path.endsWith("discover-models"));
  check("8 generic without a key: Test asks the server, no key sent", !!keylessTest && !("api_key" in keylessTest.body) && keylessTest.body.base_url === "http://192.168.1.7:1234/v1", keylessTest && keylessTest.body);
  await d.click("save");
  const keylessSave = g.calls.slice(cK).filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles")).pop();
  check("8 generic without a key: Save creates the connection", !!keylessSave && keylessSave.body.id === "compat-theforge" && keylessSave.body.base_url === "http://192.168.1.7:1234/v1" && !keylessSave.body.api_key, keylessSave && keylessSave.body);

  // System One (a native whose endpoint is USER-SUPPLIED, key optional): the general rule from
  // NATIVE_ENDPOINT_RULES, not a branch. A System One modal without its Base URL field is red.
  const so = kit.cloudCardsFromDiscovery(WITH_DECISION).find((x) => x.id === "systemone");
  const fields = (id) => { const x = kit.cloudCardsFromDiscovery(WITH_DECISION).find((y) => y.id === id); return `${x.baseUrlField}/${x.apiKey}`; };
  check("9 endpoint rules: System One required/optional, OVH preset, generic key optional, natives none", fields("systemone") === "required/optional" && fields("ovh") === "preset/required" && fields("openai-compatible") === "required/optional" && fields("anthropic") === "none/required" && fields("typesafe") === "none/required", ["systemone", "ovh", "openai-compatible", "anthropic", "typesafe"].map(fields));
  check("9 System One's placeholder is a local endpoint", so.baseUrlPlaceholder === "http://127.0.0.1:8000");
  await d.open("systemone");
  check("9 System One: a Base URL field, editable, required, with its placeholder", !!d.field("url") && d.field("url").props.readOnly === false && d.field("url").props.required === true && d.field("url").props.placeholder === "http://127.0.0.1:8000", d.field("url") && d.field("url").props);
  check("9 System One: no Name field; the key field says optional", !d.field("text") && !!d.field("password") && !!d.body((n) => n.type === "label" && n.props.children === T.keyOptionalLabel));
  const s0 = g.calls.length;
  await d.click("save");
  check("9 System One without a Base URL: a sentence, nothing sent", d.line() === T.baseUrlFirst && g.calls.length === s0, d.line());
  d.type("url", "http://127.0.0.1:8000/");
  await d.click("save");
  const soCheck = g.calls.filter((x) => x.path.endsWith("discover-models")).pop();
  const soSave = g.calls.filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles")).pop();
  check("9 System One without a key: tested at its Base URL through discover-models (no api_key)", JSON.stringify(soCheck.body) === JSON.stringify({ provider_family: "systemone", base_url: "http://127.0.0.1:8000" }), soCheck.body);
  check("9 System One: saved as a new connection with that Base URL", soSave.body.id === "systemone-endpoint" && soSave.body.provider_family === "systemone" && soSave.body.base_url === "http://127.0.0.1:8000" && soSave.body.display_name === "System One-compatible endpoint (127.0.0.1)" && soSave.body.create_only === true, soSave.body);
  check("9 System One now offers Edit", d.buttons("systemone")[0].props["data-action"] === "edit" && !d.modal());
  await d.open("systemone");
  check("9 System One Edit: its Base URL prefilled", d.field("url").props.value === "http://127.0.0.1:8000");
  d.type("url", "https://decide.example.net");
  const s1 = g.calls.length;
  await d.click("save");
  const soEdit = g.calls.slice(s1).filter((x) => x.method !== "GET");
  check("9 System One Edit of the URL: tested by its id at the NEW URL, then ONE PUT of base_url", soEdit.length === 2 && soEdit[0].body.profile_id === "systemone-endpoint" && soEdit[0].body.base_url === "https://decide.example.net" && soEdit[1].method === "PUT" && JSON.stringify(soEdit[1].body) === JSON.stringify({ base_url: "https://decide.example.net" }), soEdit);
}
{
  // Only a test of the STORED key adds a model count to the card; a typed, unsaved key does not.
  // The background discovery of the stored connection fails here: the card stays "Connected".
  const g = gw();
  let storedFails = true;
  const inner = g.request;
  g.request = async (path, init) => (path.endsWith("discover-models") && init.body.profile_id && storedFails
    ? (g.calls.push({ path, method: init.method, body: init.body }), { ok: false, models: [], error_kind: "unreachable", error: "timed out" })
    : inner(path, init));
  const c = mountHook(CloudProviderCards, { request: g.request });
  await c.settle();
  const d = drive(c);
  await c.settleAll();
  check("15 a failed discovery leaves Connected alone (no error on the card)", d.status("openai") === "Connected" && !d.cardTexts("openai").length, [d.status("openai"), d.cardTexts("openai")]);
  await d.open("openai");
  d.type("password", KEY);
  await d.click("test");
  check("10 a typed, unsaved key's test leaves the card as it was", d.line() === "Key works · 48 models" && d.status("openai") === "Connected", d.status("openai"));
  await d.click("cancel");
  check("10 and so does Cancel", d.status("openai") === "Connected", d.status("openai"));
  storedFails = false;
  await d.open("openai");
  await d.click("test");
  check("10 a test of the STORED key adds its model count", d.status("openai") === "Connected · 48 models", d.status("openai"));
  await d.click("cancel");
}
{
  // A row whose gateway row already carries discovered_model_count: no call, the count shows at once.
  const g = gw({ taken: [], rows: [{ id: "openrouter-key", provider_family: "openrouter", api_key_set: true, api_key_fingerprint: "1234567890", discovered_model_count: 12 }] });
  const c = mountHook(CloudProviderCards, { request: g.request });
  for (let i = 0; i < 6; i += 1) await c.settle();
  const d = drive(c);
  check("15 the gateway's own count is used, no discovery call", d.status("openrouter") === "Connected · 12 models" && !g.calls.some((x) => x.path.endsWith("discover-models")), [d.status("openrouter"), g.calls.filter((x) => x.path.endsWith("discover-models"))]);
}
{
  // Five connected cards without a count: at most 3 discoveries at once; "Connected · …" while pending.
  const rows = ["anthropic", "openai", "openrouter", "portkey", "typesafe"].map((f) => ({ id: `${f}-key`, provider_family: f, api_key_set: true, api_key_fingerprint: "abcdef0123" }));
  const g = gw({ taken: [], rows });
  let running = 0;
  let peak = 0;
  const waiting = [];
  const inner = g.request;
  g.request = async (path, init) => {
    if (!path.endsWith("discover-models")) return inner(path, init);
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => waiting.push(r));
    running -= 1;
    return inner(path, init);
  };
  const c = mountHook(CloudProviderCards, { request: g.request });
  for (let i = 0; i < 6; i += 1) await c.settle();
  const d = drive(c);
  check("15 at most 3 discoveries at once", running === 3 && peak === 3, [running, peak]);
  check("15 pending cards read Connected · … (a quiet ellipsis)", rows.every((r) => d.status(r.provider_family) === "Connected · …"), rows.map((r) => d.status(r.provider_family)));
  while (waiting.length) { waiting.shift()(); for (let i = 0; i < 4; i += 1) await c.settle(); }
  check("15 every connected card then shows its count, one call each", rows.every((r) => d.status(r.provider_family) === "Connected · 48 models") && peak === 3 && g.calls.filter((x) => x.path.endsWith("discover-models")).length === 5, [rows.map((r) => d.status(r.provider_family)), peak]);
}
{
  // While a save is in flight the modal cannot be closed (Cancel disabled; ×, Escape, backdrop ignored).
  const g = gw();
  let release;
  const gate = new Promise((r) => { release = r; });
  const inner = g.request;
  g.request = async (path, init) => {
    if (init.method === "POST" && path.endsWith("/provider-endpoint-profiles")) await gate;
    return inner(path, init);
  };
  const c = mountHook(CloudProviderCards, { request: g.request });
  await c.settle();
  const d = drive(c);
  await d.open("anthropic");
  d.type("password", KEY);
  d.foot("save").props.onClick();
  await c.settle();
  check("11 saving: Cancel is disabled", d.foot("cancel").props.disabled === true);
  d.modal().props.onClose();
  c.render();
  check("11 saving: ×, Escape and the backdrop (onClose) do not close the modal", !!d.modal());
  release();
  await c.settle();
  check("11 once saved the modal closes", !d.modal() && d.status("anthropic").startsWith("Connected"));
}
{
  // A failed connections load is cleared once a later load works.
  const g = gw();
  let fail = true;
  const inner = g.request;
  g.request = async (path, init) => {
    if (fail && init.method === "GET" && path.endsWith("/config/provider-endpoint-profiles")) throw new Error("Gateway restarting");
    return inner(path, init);
  };
  const c = mountHook(CloudProviderCards, { request: g.request, refreshKey: 0 });
  await c.settle();
  const alert = () => find(c.current, (n) => n.props && n.props.role === "alert");
  check("12 a failed load is said", !!alert() && /could not be loaded: Gateway restarting/.test(alert().props.children));
  fail = false;
  c.rerender({ refreshKey: 1 });
  await c.settle();
  check("12 a later successful load clears it", !alert());
}
{
  // The disconnect confirmation honours the host's `disabled` too.
  const g = gw();
  const c = mountHook(CloudProviderCards, { request: g.request });
  await c.settle();
  const d = drive(c);
  await d.open("openai");
  await d.click("disconnect");
  c.rerender({ disabled: true });
  check("13 the disconnect confirmation is disabled when the host disables the cards", d.foot("disconnect-confirm").props.disabled === true);
}
{
  // The generic card's ids are prefixed, so a typed name never shadows a native provider id.
  const g = fakeGateway({ taken: [] });
  const client = cloudProvidersClient(g.request);
  const checked = await client.checkKey(GENERIC, KEY, "https://api.openai.com/v1");
  const saved = await client.saveCheckedKey(GENERIC, checked, "gateway", "OpenAI");
  check("14 a generic endpoint named OpenAI is compat-openai, never openai", saved.id === "compat-openai" && saved.name === "OpenAI", saved);
}
{
  // A refused key: the reason in the modal, nothing stored, the key kept to fix it.
  const g = gw({ kind: "auth" });
  const c = mountHook(CloudProviderCards, { request: g.request });
  await c.settle();
  const d = drive(c);
  await d.open("openrouter");
  d.type("password", KEY);
  await d.click("save");
  check("8 a refused key says why in the modal", d.line() === "OpenRouter refused this key. Check that it was copied in full and is still active.", d.line());
  check("8 nothing stored on a failed test", !g.calls.some((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles")) && !!d.modal());
  const c9 = g.calls.length;
  await d.click("test");
  check("8 the typed key is kept (in its ref) to fix and test again", g.calls.slice(c9).some((x) => x.path.endsWith("discover-models") && x.body.api_key === KEY));
}
{
  // A connection from AbstractCore's config: Edit, no Disconnect, a typed key adds a gateway connection.
  const g = gw({ taken: [], rows: [{ id: "anthropic", provider_family: "anthropic", api_key_set: true, api_key_fingerprint: "0123456789", managed: false, synthetic: true }] });
  const c = mountHook(CloudProviderCards, { request: g.request });
  await c.settle();
  const d = drive(c);
  await c.settleAll();
  check("8 a config key shows as Connected with Edit", d.status("anthropic") === "Connected · 48 models" && d.buttons("anthropic")[0].props["data-action"] === "edit");
  await d.open("anthropic");
  check("8 config connection: no Disconnect, says where it is set", !d.foot("disconnect") && !!d.body((n) => n.props && "data-cloud-configured" in n.props) && !!d.body((n) => n.props && n.props.children === T.keyConfiguredHint));
  const c0 = g.calls.length;
  await d.click("save");
  check("8 config connection: Save without a key asks for one (nothing sent)", d.line() === T.pasteFirst && g.calls.length === c0, d.line());
  d.type("password", KEY);
  await d.click("save");
  const created = g.calls.filter((x) => x.method === "POST" && x.path.endsWith("/provider-endpoint-profiles"));
  check("8 config connection + a typed key: a NEW gateway connection, never a PUT", created.length === 1 && created[0].body.id === "anthropic-key" && created[0].body.create_only === true && !g.calls.some((x) => x.method === "PUT"), created);
}
{
  // The rendered modal (AfModal markup): a dialog titled for its provider, masked key, labelled fields.
  const g = gw();
  const c = mountHook(CloudProviderCards, { request: g.request });
  await c.settle();
  const d = drive(c);
  await d.open("openai-compatible");
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, d.tree()));
  check("8 the modal renders as the kit's AfModal dialog", html.includes('role="dialog"') && html.includes('aria-modal="true"') && html.includes("af-modal--narrow") && html.includes("af-cloud-modal") && html.includes(">Connect OpenAI-compatible endpoint</h2>"));
  check("8 every field is labelled", ["name", "url", "key"].every((f) => html.includes(`for="af-cloud-${f}-openai-compatible"`) && html.includes(`id="af-cloud-${f}-openai-compatible"`)));
  check("8 the key field is a password field", /<input id="af-cloud-key-openai-compatible" type="password"/.test(html));
}

if (failures) {
  console.error(`check_cloud_providers: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_cloud_providers: OK (${checks} checks: registry list, presets + generic compatible card, ONE Connect/Edit button per card with its mark, the Connect/Edit modal, test before save, create-only fresh ids, edit in place, disconnect, key never rendered)`);
