#!/usr/bin/env node
/**
 * session_tool_policy.ts (ui-primitives session-policy-kit): a chat's tool policy on the
 * gateway (session tool policy contract v1) and its bridge to the tool layers (backlog 0033).
 * - capability parsing (`capabilities.session_tool_policy`; absent = an older gateway → null);
 * - the four routes and their bodies (a fake request records them), `client` provenance, the
 *   session id rule, a malformed answer refused, `clamped` passed through untouched;
 * - 409 revision_conflict surfaced as SessionToolPolicyConflictError (with the stored revision);
 * - an unsupported client rejects EVERY call with "The gateway cannot store chat tool policies"
 *   and never reaches the gateway;
 * - layer ↔ policy: auto → approve.tools, ask → ask, off → deny.tools, and back (selector values
 *   "tool" / "kind:<id>" / "all" all map; deny wins; ask keeps asking under approve);
 * - the store's session layer: the gateway when the client is supported (GET / PUT with
 *   if_revision / DELETE on reset, an empty layer resets), else this browser, labeled, with the
 *   fallback note when the gateway was asked and cannot.
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
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };
const {
  sessionToolPolicyCapability, createSessionToolPolicyClient, sessionPolicyFromLayer, layerFromSessionPolicy,
  sessionPolicyClampedLines, SESSION_TOOL_POLICY_UNSUPPORTED, SessionToolPolicyConflictError, SessionToolPolicyUnsupportedError,
  normalizeToolCatalog, planRunTools, createToolLayerStore, toolIdentityKey, TOOL_LAYER_GATEWAY_WHERE, TOOL_LAYER_STORE_WHERE,
  TOOL_LAYER_BROWSER_FALLBACK, sessionToolPolicyRoute,
} = kit;

// ---------------------------------------------------------------- capability
const CAP = { supported: true, version: 1, endpoint: "/api/gateway/sessions/{session_id}/tool-policy", methods: ["GET", "PUT", "POST", "DELETE"], approve: ["tools", "kinds", "all", "max_risk_rank"], deny: ["tools", "kinds"], ask: true, record: "abstract.tool_policy_decision" };
check("capability from GET discovery/capabilities", j(sessionToolPolicyCapability({ capabilities: { session_tool_policy: CAP } })) === j(CAP), j(sessionToolPolicyCapability({ capabilities: { session_tool_policy: CAP } })));
check("capability from the capabilities object", sessionToolPolicyCapability({ session_tool_policy: CAP })?.supported === true);
check("an older gateway (key absent) → null", sessionToolPolicyCapability({ capabilities: { runs: {} } }) === null && sessionToolPolicyCapability(null) === null);
const off = sessionToolPolicyCapability({ capabilities: { session_tool_policy: { supported: false, reason: "abstractruntime has no session tool policy" } } });
check("supported:false kept with its reason", off?.supported === false && off?.reason === "abstractruntime has no session tool policy");
check("supported must be exactly true", sessionToolPolicyCapability({ session_tool_policy: { supported: "yes" } })?.supported === false);

// ---------------------------------------------------------------- the four routes
const POLICY = {
  version: 1, session_id: "s-123", revision: 5,
  approve: { fetch_url: "tool", skim_url: "kind:web", web_search: "kind:web", read_file: "all" },
  deny: { execute_command: "tool" },
  ask: ["send_email"],
  request: { approve: { tools: ["fetch_url"], kinds: ["web"] } },
  clamped: [{ selector: "tools", name: "send_email", reason: "not_authorized" }, { selector: "kinds", name: "nope", reason: "unknown_kind" }],
  set_by: { tenant_id: "default", user_id: "admin", client: "panel-chat" },
  set_at: "2026-10-27T10:00:00+00:00",
};
const calls = [];
let answer = null;
const request = async (path, init) => {
  calls.push([path, init.method, init.body]);
  if (typeof answer === "function") return answer(path, init);
  return answer;
};
check("route", sessionToolPolicyRoute("s-123") === "sessions/s-123/tool-policy");
for (const bad of ["", "a/b", "a b", "x".repeat(257), "../x", "a%2f"])
  check(`session id refused: ${j(bad).slice(0, 20)}`, (() => { try { createSessionToolPolicyClient(request, bad, CAP); return false; } catch { return true; } })());
const client = createSessionToolPolicyClient(request, "s-123", CAP, { client: "abstractcode" });
check("supported client", client.supported === true && client.sessionId === "s-123");
answer = { session_id: "s-123", policy: POLICY };
const got = await client.get();
check("GET the route", j(calls.at(-1)) === j(["api/gateway/sessions/s-123/tool-policy", "GET", undefined]), j(calls.at(-1)));
check("clamped passed through untouched", j(got.clamped) === j(POLICY.clamped) && j(got.approve) === j(POLICY.approve) && got.revision === 5 && j(got.set_by) === j(POLICY.set_by) && got.set_at === POLICY.set_at && j(got.request) === j(POLICY.request));
answer = { session_id: "s-123", policy: null, revision: 6 };
check("no policy → null", (await client.get()) === null);
answer = { session_id: "s-123", policy: POLICY };
await client.replace({ approve: { tools: ["fetch_url"] }, if_revision: 4 });
check("PUT replaces, with client provenance", j(calls.at(-1)) === j(["api/gateway/sessions/s-123/tool-policy", "PUT", { approve: { tools: ["fetch_url"] }, if_revision: 4, client: "abstractcode" }]), j(calls.at(-1)));
await client.merge({ approve: { kinds: ["web"], max_risk_rank: 2 }, client: "mine" });
check("POST merges; a body's own client wins", j(calls.at(-1)) === j(["api/gateway/sessions/s-123/tool-policy", "POST", { approve: { kinds: ["web"], max_risk_rank: 2 }, client: "mine" }]), j(calls.at(-1)));
answer = { session_id: "s-123", policy: null, revision: 7 };
const reset = await client.reset();
check("DELETE resets → {revision}", j(calls.at(-1)) === j(["api/gateway/sessions/s-123/tool-policy", "DELETE", undefined]) && j(reset) === j({ revision: 7 }), j(reset));
answer = { session_id: "s-123", policy: { approve: {} } };
check("a malformed policy is refused, never half-read", (await rejects(client.replace({}))) instanceof Error);
answer = { session_id: "s-123" };
check("an answer without `policy` is refused", (await rejects(client.get())) instanceof Error);

// ---------------------------------------------------------------- 409 revision_conflict
answer = async () => { throw { status: 409, body: { detail: { reason_code: "revision_conflict", message: "revision 9 != 4", revision: 9 } } }; };
const conflict = await rejects(client.replace({ if_revision: 4 }));
check("409 → SessionToolPolicyConflictError with the stored revision", conflict instanceof SessionToolPolicyConflictError && conflict.code === "revision_conflict" && conflict.revision === 9 && /revision 9/.test(conflict.message), String(conflict));
answer = async () => { throw Object.assign(new Error("HTTP 409"), { status: 409, detail: { reason_code: "revision_conflict" } }); };
check("409 from an Error with detail", (await rejects(client.merge({}))) instanceof SessionToolPolicyConflictError);
const other = { status: 422, body: { detail: { reason_code: "invalid_request", message: "unknown key" } } };
answer = async () => { throw other; };
check("other refusals pass through unchanged", (await rejects(client.replace({}))) === other);

// ---------------------------------------------------------------- unsupported: every call rejects, labeled
for (const cap of [null, undefined, off]) {
  const n = calls.length;
  const c = createSessionToolPolicyClient(request, "s-1", cap);
  const errs = await Promise.all([rejects(c.get()), rejects(c.replace({})), rejects(c.merge({})), rejects(c.reset())]);
  check(`unsupported (${j(cap)?.slice(0, 20)}): every call rejects with the label`, c.supported === false && errs.every((e) => e instanceof SessionToolPolicyUnsupportedError && e.message.startsWith(SESSION_TOOL_POLICY_UNSUPPORTED)), errs.map(String).join(" | "));
  check("…and never reaches the gateway", calls.length === n);
}
check("the label (chat, ADR 0001 §5)", SESSION_TOOL_POLICY_UNSUPPORTED === "The gateway cannot store chat tool policies");

// ---------------------------------------------------------------- layer ↔ policy
const catalog = normalizeToolCatalog({ items: [
  { name: "fetch_url", toolset: "web", enabled: true, approval_default: "ask", risk_rank: 2 },
  { name: "skim_url", toolset: "web", enabled: true, approval_default: "ask", risk_rank: 1 },
  { name: "web_search", toolset: "web", enabled: true, approval_default: "auto", risk_rank: 1 },
  { name: "read_file", toolset: "files", enabled: true, approval_default: "auto", risk_rank: 1 },
  { name: "execute_command", toolset: "system", enabled: true, approval_default: "ask", risk_rank: 4 },
  { name: "send_email", toolset: "email", enabled: true, approval_default: "ask", risk_rank: 3 },
  { name: "send_telegram_message", toolset: "telegram", enabled: false, approval_default: "ask" },
] });
const layer = { fetch_url: "auto", execute_command: "off", send_email: "ask", send_telegram_message: "auto", gone: "auto", read_file: "approve" };
const body = sessionPolicyFromLayer(layer, catalog);
check("layer → body: auto → approve.tools, off → deny.tools, ask → ask (offered, canonical only)", j(body) === j({ approve: { tools: ["fetch_url"] }, deny: { tools: ["execute_command"] }, ask: ["send_email"] }), j(body));
check("an empty layer → an empty body", j(sessionPolicyFromLayer({}, catalog)) === j({ approve: { tools: [] }, deny: { tools: [] }, ask: [] }));
const back = layerFromSessionPolicy(POLICY, catalog);
check("policy → layer: tool, kind:web and all selectors → auto; deny → off; ask → ask", j(back) === j({ fetch_url: "auto", skim_url: "auto", web_search: "auto", read_file: "auto", send_email: "ask", execute_command: "off" }), j(back));
const both = layerFromSessionPolicy({ ...POLICY, approve: { execute_command: "all", send_email: "kind:email" }, deny: { execute_command: "tool" }, ask: ["send_email"] }, catalog);
check("deny wins over approve; ask keeps asking under approve", both.execute_command === "off" && both.send_email === "ask", j(both));
check("not-offered and unknown names are left out", !("send_telegram_message" in layerFromSessionPolicy({ ...POLICY, approve: { send_telegram_message: "all", gone: "tool" } }, catalog)));
check("no policy → empty layer", j(layerFromSessionPolicy(null, catalog)) === "{}");
// Round trip: what the store PUTs for a layer comes back as that layer (the gateway echoes the names).
const echo = { ...POLICY, approve: Object.fromEntries(body.approve.tools.map((n) => [n, "tool"])), deny: Object.fromEntries(body.deny.tools.map((n) => [n, "tool"])), ask: body.ask, clamped: [] };
check("round trip layer → body → policy → layer", j(layerFromSessionPolicy(echo, catalog)) === j({ fetch_url: "auto", send_email: "ask", execute_command: "off" }), j(layerFromSessionPolicy(echo, catalog)));
check("deny's limit: the run ceiling still excludes an off tool", !planRunTools(catalog, { session: { execute_command: "off" } }).allowed_tools.includes("execute_command"));
check("clamped lines", j(sessionPolicyClampedLines(POLICY)) === j(["Not covered: send_email (not_authorized)", "Not covered: nope (kinds) (unknown_kind)"]), j(sessionPolicyClampedLines(POLICY)));

// ---------------------------------------------------------------- review L1 / L2 / L5
{
  answer = { session_id: "s-123", policy: { version: 1, session_id: "s-123", revision: 2, approve: {}, ask: [] } };
  check("L1 a policy without deny is refused", (await rejects(client.get())) instanceof Error);
  answer = { session_id: "s-123", policy: { version: 1, session_id: "s-123", revision: 2, approve: {}, deny: {}, ask: "send_email" } };
  check("L1 a policy whose ask is not a list is refused", (await rejects(client.get())) instanceof Error);
  answer = { session_id: "s-123", policy: { version: 1, session_id: "s-123", revision: 2, deny: {}, ask: [] } };
  check("L1 a policy without approve is refused", (await rejects(client.get())) instanceof Error);
  for (const dots of [".", "..", "...", "%2E%2E"])
    check(`L2 a dot-only id is refused: ${dots}`, (() => { try { createSessionToolPolicyClient(request, dots, CAP); return false; } catch { return true; } })() && (() => { try { sessionToolPolicyRoute(dots); return false; } catch { return true; } })());
  check("L2 dots inside an id stay allowed", sessionToolPolicyRoute("a.b..c") === "sessions/a.b..c/tool-policy" && sessionToolPolicyRoute(".x") === "sessions/.x/tool-policy");
  const n = calls.length;
  const noDelete = createSessionToolPolicyClient(request, "s-9", { ...CAP, methods: ["GET", "PUT", "POST"] });
  check("L5 a method the gateway does not advertise is not sent", /cannot store chat tool policies with DELETE/.test(String((await rejects(noDelete.reset()))?.message)) && calls.length === n);
}

// ---------------------------------------------------------------- scope (contract v1 revised §3), served words untouched
// The implementation's shape: top level of every answer, {approve, deny} (gateway session_tool_policy.py:226-230).
const SCOPE = { approve: "every run of this conversation (turns and their delegated child runs), except automation runs, runs that read text other people wrote, and entity visits", deny: "every run of this conversation, automation runs and untrusted-input runs included" };
{
  const c = createSessionToolPolicyClient(async (path, init) => (init.method === "DELETE" ? { session_id: "s-1", policy: null, revision: 3, scope: SCOPE } : init.method === "GET" ? { session_id: "s-1", policy: answer === "null" ? null : { ...POLICY, session_id: "s-1" }, revision: 2, scope: SCOPE } : { session_id: "s-1", policy: { ...POLICY, session_id: "s-1" } }), "s-1", CAP);
  answer = "x";
  const p = await c.get();
  check("scope passed onto the policy untouched", j(p.scope) === j(SCOPE) && j(c.scope) === j(SCOPE), j(p.scope));
  answer = "null";
  check("scope kept when there is no policy", (await c.get()) === null && j(c.scope) === j(SCOPE));
  const put = await c.replace({});
  check("an answer without scope: none (never composed)", put.scope === undefined && c.scope === undefined, j(put.scope));
  const del = await c.reset();
  check("DELETE's scope kept and returned next to its revision", j(c.scope) === j(SCOPE) && j(del) === j({ revision: 3, scope: SCOPE }), j(del));
  check("a malformed scope is ignored", kit.sessionToolPolicyScope("words") === undefined && kit.sessionToolPolicyScope({ approve: 3 }) === undefined && j(kit.sessionToolPolicyScope({ deny: "d" })) === j({ deny: "d" }));
}

// ---------------------------------------------------------------- revisions (review B1): every answer's revision is kept
{
  const seen = [];
  let r = 0;
  const c = createSessionToolPolicyClient(async (path, init) => {
    seen.push(`${init.method} ${path.split("tool-policy")[1] || ""}${init.body && "if_revision" in init.body ? ` if_revision=${init.body.if_revision}` : ""}`);
    if (init.method === "GET") return { session_id: "s-1", policy: null, revision: r };
    if (init.method === "DELETE") { r += 1; return { session_id: "s-1", policy: null, revision: r }; }
    r += 1;
    return { session_id: "s-1", policy: { ...POLICY, session_id: "s-1", revision: r } };
  }, "s-1", CAP);
  check("no answer yet → no revision", c.revision === undefined);
  r = 4;
  await c.get();
  check("GET's top-level revision kept with policy: null", c.revision === 4, String(c.revision));
  await c.replace({});
  check("PUT's policy.revision kept", c.revision === 5);
  await c.reset(5);
  check("reset(ifRevision) → DELETE ?if_revision=", seen.at(-1) === "DELETE ?if_revision=5" && c.revision === 6, j(seen));
  await c.reset();
  check("reset() without a revision sends no query", seen.at(-1) === "DELETE ");
  check("reset refuses a non-integer revision", (await rejects(c.reset(1.5))) instanceof Error);
}

// ---------------------------------------------------------------- the store: gateway vs browser, races, carried entries
// A fake gateway with the runtime store's revision semantics (monotonic, kept across DELETE; if_revision
// checked on PUT and DELETE) and FastAPI 409 bodies, the review's race.mjs model.
function fakeGateway({ topLevelRevision = true } = {}) {
  const g = { rev: 0, row: null, log: [], scope: SCOPE };
  g.request = async (path, init) => {
    const q = new URL(`http://x/${path}`).searchParams;
    g.log.push([init.method, init.body, q.get("if_revision")]);
    const guard = (want) => {
      if (want !== undefined && want !== null && Number(want) !== g.rev)
        throw { status: 409, body: { detail: { reason_code: "revision_conflict", message: `revision is ${g.rev}`, revision: g.rev } } };
    };
    const sc = g.scope ? { scope: g.scope } : {};
    if (init.method === "GET") return topLevelRevision ? { session_id: "s1", policy: g.row, revision: g.rev, ...sc } : { session_id: "s1", policy: g.row, ...sc };
    if (init.method === "DELETE") { guard(q.get("if_revision") ?? undefined); g.rev += 1; g.row = null; return { session_id: "s1", policy: null, revision: g.rev, ...sc }; }
    guard(init.body.if_revision);
    g.rev += 1;
    const sel = (b, key) => {
      const out = Object.fromEntries((b?.tools || []).map((n) => [n, "tool"]));
      for (const k of b?.kinds || []) for (const t of catalog.filter((x) => x.offered && x.toolset === k)) out[t.name] ??= `kind:${k}`;
      if (key === "approve" && b?.all) for (const t of catalog.filter((x) => x.offered)) out[t.name] ??= "all";
      return out;
    };
    g.row = { version: 1, session_id: "s1", revision: g.rev, approve: sel(init.body.approve, "approve"), deny: sel(init.body.deny, "deny"), ask: init.body.ask || [], request: init.body, clamped: [] };
    return { session_id: "s1", policy: g.row, ...sc };
  };
  g.client = (opts = {}) => createSessionToolPolicyClient(g.request, "s1", CAP, opts);
  g.other = () => createSessionToolPolicyClient(g.request, "s1", CAP, { client: "other" });
  return g;
}
const memStore = () => {
  const mem = new Map();
  return { mem, storage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
};
const id = toolIdentityKey({ gatewayUrl: "https://gw", userId: "u" });
{
  const g = fakeGateway();
  const { mem, storage } = memStore();
  const A = createToolLayerStore(id, { storage, sessionPolicy: () => g.client({ client: "abstractcode" }) });
  check("gateway storage when supported, labeled", j(A.sessionStorage("s1")) === j({ kind: "gateway", where: TOOL_LAYER_GATEWAY_WHERE }) && TOOL_LAYER_GATEWAY_WHERE === "Saved for this chat on the gateway");
  check("never an unguarded write: a save before any read is refused", (await rejects(A.saveSession("s1", { fetch_url: "auto" }, catalog))) instanceof kit.SessionToolPolicyRevisionError && g.log.length === 0);
  check("…and a reset before any read", (await rejects(A.resetSession("s1"))) instanceof kit.SessionToolPolicyRevisionError && g.log.length === 0);
  const loaded = await A.loadSession("s1", catalog);
  check("the store carries the served scope, also with no policy", j(loaded.scope) === j(SCOPE), j(loaded.scope));
  check("load reads the gateway (GET)", g.log.at(-1)[0] === "GET" && j(loaded.layer) === "{}" && loaded.policy === null && loaded.storage.kind === "gateway");
  const saved = await A.saveSession("s1", { fetch_url: "auto", execute_command: "off" }, catalog);
  check("save PUTs the mapped body, guarded by the null read's revision", g.log.at(-1)[0] === "PUT" && j(g.log.at(-1)[1]) === j({ approve: { tools: ["fetch_url"] }, deny: { tools: ["execute_command"] }, ask: [], if_revision: 0, client: "abstractcode" }), j(g.log.at(-1)));
  check("the answer is the gateway's effective layer + policy", j(saved.layer) === j({ fetch_url: "auto", execute_command: "off" }) && saved.policy?.revision === 1);
  await A.saveSession("s1", { fetch_url: "auto" }, catalog);
  check("the next save is guarded by the last revision", g.log.at(-1)[1]?.if_revision === 1, j(g.log.at(-1)));
  check("nothing written to the browser", ![...mem.keys()].some((k) => k.startsWith("af.tools.session.")));
  const r = await A.resetSession("s1");
  check("Use my defaults → a guarded DELETE", g.log.at(-1)[0] === "DELETE" && g.log.at(-1)[2] === "2" && j(r.layer) === "{}" && r.policy === null, j(g.log.at(-1)));
  await A.saveSession("s1", { fetch_url: "auto" }, catalog);
  check("after a reset, the next save is guarded by the DELETE's revision", g.log.at(-1)[1]?.if_revision === 3, j(g.log.at(-1)));
  const n = g.log.length;
  await A.saveSession("s1", {}, catalog);
  check("an empty layer resets (a guarded DELETE), never PUTs an empty policy", g.log.length === n + 1 && g.log.at(-1)[0] === "DELETE" && g.log.at(-1)[2] === "4", j(g.log.slice(n)));
}
// The three races of review B1: each must 409, and the other client's policy must survive.
const race = async (label, setup) => {
  const g = fakeGateway();
  const A = createToolLayerStore(id, { storage: memStore().storage, sessionPolicy: () => g.client() });
  const act = await setup(g, A);
  const err = await rejects(act());
  check(`B1 ${label}: 409 surfaced`, err instanceof SessionToolPolicyConflictError, String(err));
  check(`B1 ${label}: the other client's deny survives`, Boolean(g.row?.deny?.execute_command), j(g.row));
};
await race("A read no policy, B wrote, A saves", async (g, A) => {
  await A.loadSession("s1", catalog);
  await g.other().replace({ deny: { tools: ["execute_command"] } });
  return () => A.saveSession("s1", { fetch_url: "auto" }, catalog);
});
await race("A reset, B wrote, A saves", async (g, A) => {
  await A.loadSession("s1", catalog);
  await A.saveSession("s1", { fetch_url: "auto" }, catalog);
  await A.resetSession("s1");
  await g.other().replace({ deny: { tools: ["execute_command"] } });
  return () => A.saveSession("s1", { fetch_url: "auto" }, catalog);
});
await race("A read a policy, B wrote, A clears its layer (DELETE)", async (g, A) => {
  await g.other().replace({ approve: { tools: ["fetch_url"] } });
  await A.loadSession("s1", catalog);
  await g.other().replace({ deny: { tools: ["execute_command"] } });
  return () => A.saveSession("s1", {}, catalog);
});
{
  const g = fakeGateway();
  const A = createToolLayerStore(id, { storage: memStore().storage, sessionPolicy: () => g.client() });
  await A.loadSession("s1", catalog);
  await g.other().replace({ deny: { tools: ["execute_command"] } });
  const err = await rejects(A.saveSession("s1", { fetch_url: "auto" }, catalog));
  check("control: a stale non-null read 409s, with the stored revision", err instanceof SessionToolPolicyConflictError && err.revision === 1);
  await A.loadSession("s1", catalog);
  check("after a re-read the save goes through", (await A.saveSession("s1", { fetch_url: "auto", execute_command: "off" }, catalog)).policy?.revision === 2);
}
{
  const g = fakeGateway({ topLevelRevision: false });
  const A = createToolLayerStore(id, { storage: memStore().storage, sessionPolicy: () => g.client() });
  await A.loadSession("s1", catalog);
  const err = await rejects(A.saveSession("s1", { fetch_url: "auto" }, catalog));
  check("a gateway that serves no revision for 'no policy': the write is refused, labeled", err instanceof kit.SessionToolPolicyRevisionError && /did not return a policy revision; refusing an unguarded write/.test(err.message) && !g.log.some((x) => x[0] === "PUT"), String(err));
}
// Review B2: a REPLACE from the editor keeps what this catalog cannot see.
{
  const g = fakeGateway();
  const A = createToolLayerStore(id, { storage: memStore().storage, sessionPolicy: () => g.client() });
  await g.other().replace({ deny: { tools: ["mcp_delete_all", "send_telegram_message"] }, approve: { tools: ["fetch_url", "other_client_tool"], kinds: ["web"], max_risk_rank: 2 }, ask: ["mcp_search"] });
  const s0 = await A.loadSession("s1", catalog);
  await A.saveSession("s1", { ...s0.layer, send_email: "ask" }, catalog);
  const sent = g.log.at(-1)[1];
  check("B2 a deny of a tool the catalog does not list survives an unrelated edit", Boolean(g.row.deny.mcp_delete_all) && sent.deny.tools.includes("mcp_delete_all"), j(g.row.deny));
  check("B2 a deny of a tool the catalog does not offer survives", Boolean(g.row.deny.send_telegram_message));
  check("B2 another client's approval of an unlisted tool survives", sent.approve.tools.includes("other_client_tool"));
  check("B2 an unlisted ask survives", sent.ask.includes("mcp_search") && sent.ask.includes("send_email"), j(sent.ask));
  check("B2 the request's selectors are carried unchanged", j(sent.approve.kinds) === j(["web"]) && sent.approve.max_risk_rank === 2, j(sent.approve));
  const s1 = await A.loadSession("s1", catalog);
  await A.saveSession("s1", { ...s1.layer, skim_url: "ask" }, catalog);
  check("B2 a kind-covered tool set to Ask is put in ask (ask beats approve)", g.log.at(-1)[1].ask.includes("skim_url") && j(g.log.at(-1)[1].approve.kinds) === j(["web"]));
  const s2 = await A.loadSession("s1", catalog);
  const { skim_url, ...rest } = s2.layer;
  await A.saveSession("s1", rest, catalog, { inherited: { skim_url: "ask" } });
  check("B2 …also when the layer leaves it to an inherited Ask", g.log.at(-1)[1].ask.includes("skim_url"), j(g.log.at(-1)[1]));
  const allBody = sessionPolicyFromLayer({}, catalog, { base: { ...POLICY, approve: {}, deny: {}, ask: [], request: { approve: { all: true } } } });
  check("B2 approve.all is carried", allBody.approve.all === true && !kit.sessionPolicyBodyIsEmpty(allBody));
  check("an empty body is empty", kit.sessionPolicyBodyIsEmpty(sessionPolicyFromLayer({}, catalog)));
}
// Contract v1 revised §3: POST merge only adds; a narrowing save is a guarded PUT, never POST.
{
  const g = fakeGateway();
  const A = createToolLayerStore(id, { storage: memStore().storage, sessionPolicy: () => g.client() });
  await A.loadSession("s1", catalog);
  await A.saveSession("s1", { fetch_url: "auto", web_search: "auto" }, catalog);
  await A.saveSession("s1", { fetch_url: "ask" }, catalog);
  const narrowing = g.log.at(-1);
  check("a narrowing save (auto → ask, a removal) is a guarded PUT", narrowing[0] === "PUT" && narrowing[1].ask.includes("fetch_url") && !narrowing[1].approve.tools.includes("web_search") && narrowing[1].if_revision === 1, j(narrowing));
  await A.saveSession("s1", { fetch_url: "ask", read_file: "auto" }, catalog);
  await A.resetSession("s1");
  check("the store never issues POST", !g.log.some((x) => x[0] === "POST"), j(g.log.map((x) => x[0])));
}
// Contract v1 revised §3: all/kinds include model-chosen-destination tools; Ask keeps them asking.
{
  const base = { ...POLICY, approve: { fetch_url: "all", send_email: "all", read_file: "all" }, deny: {}, ask: [], request: { approve: { all: true } } };
  const b = sessionPolicyFromLayer({ fetch_url: "ask", send_email: "ask", read_file: "auto" }, catalog, { base });
  check("model-chosen-destination tools at Ask are always in ask under approve.all", b.ask.includes("fetch_url") && b.ask.includes("send_email") && b.approve.all === true, j(b));
  const left = sessionPolicyFromLayer({ read_file: "auto" }, catalog, { base, inherited: { fetch_url: "ask", send_email: "ask" } });
  check("…also when they inherit Ask", left.ask.includes("fetch_url") && left.ask.includes("send_email"), j(left));
}

// The browser fallback, labeled.
{
  const g = fakeGateway();
  const { storage } = memStore();
  const older = createToolLayerStore(id, { storage, sessionPolicy: (sid) => createSessionToolPolicyClient(g.request, sid, null) });
  const st = older.sessionStorage("s-2");
  check("an older gateway: browser storage, labeled, with the fallback note", st.kind === "browser" && st.where === TOOL_LAYER_STORE_WHERE && st.note === TOOL_LAYER_BROWSER_FALLBACK && /cannot store chat tool policies, so this chat's tool choices are kept in this browser\./.test(st.note), j(st));
  check("…the note is about storage, not enforcement (review L4)", !/approve|ask on the gateway/.test(st.note));
  const b = await older.saveSession("s-2", { fetch_url: "auto" }, catalog);
  check("…saves in this browser and never calls the gateway", g.log.length === 0 && b.storage.kind === "browser" && j(older.readSession("s-2")) === j({ fetch_url: "auto" }) && j((await older.loadSession("s-2", catalog)).layer) === j({ fetch_url: "auto" }));
  await older.resetSession("s-2");
  check("…and resets there", j(older.readSession("s-2")) === "{}");
  const plain = createToolLayerStore(id, { storage });
  check("no client at all: browser, no note", j(plain.sessionStorage("s-3")) === j({ kind: "browser", where: TOOL_LAYER_STORE_WHERE }));
}

if (failures) {
  console.error(`check_session_tool_policy: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_session_tool_policy: OK (${checks} checks)`);
