#!/usr/bin/env node
/**
 * session_tool_policy.ts (ui-primitives session-policy-kit): a conversation's tool policy on the
 * gateway (session tool policy contract v1) and its bridge to the tool layers (backlog 0033).
 * - capability parsing (`capabilities.session_tool_policy`; absent = an older gateway → null);
 * - the four routes and their bodies (a fake request records them), `client` provenance, the
 *   session id rule, a malformed answer refused, `clamped` passed through untouched;
 * - 409 revision_conflict surfaced as SessionToolPolicyConflictError (with the stored revision);
 * - an unsupported client rejects EVERY call with "The gateway cannot store conversation policies"
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
check("DELETE resets → {revision}", j(calls.at(-1)) === j(["api/gateway/sessions/s-123/tool-policy", "DELETE", undefined]) && reset.revision === 7, j(reset));
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
check("the label", SESSION_TOOL_POLICY_UNSUPPORTED === "The gateway cannot store conversation policies");

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

// ---------------------------------------------------------------- the store: gateway vs browser
{
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const id = toolIdentityKey({ gatewayUrl: "https://gw", userId: "u" });
  const log = [];
  let stored = null;
  const fakeGateway = async (path, init) => {
    log.push([init.method, init.body]);
    if (init.method === "GET") return { session_id: "s-1", policy: stored };
    if (init.method === "DELETE") { stored = null; return { session_id: "s-1", policy: null, revision: 3 }; }
    stored = { version: 1, session_id: "s-1", revision: (stored?.revision ?? 1) + 1, approve: Object.fromEntries((init.body.approve?.tools || []).map((n) => [n, "tool"])), deny: Object.fromEntries((init.body.deny?.tools || []).map((n) => [n, "tool"])), ask: init.body.ask || [], clamped: [] };
    return { session_id: "s-1", policy: stored };
  };
  const gw = createToolLayerStore(id, { storage, sessionPolicy: (sid) => createSessionToolPolicyClient(fakeGateway, sid, CAP, { client: "abstractcode" }) });
  check("gateway storage when supported, labeled", j(gw.sessionStorage("s-1")) === j({ kind: "gateway", where: TOOL_LAYER_GATEWAY_WHERE }) && TOOL_LAYER_GATEWAY_WHERE === "Saved for this conversation on the gateway");
  const loaded = await gw.loadSession("s-1", catalog);
  check("load reads the gateway (GET)", log.at(-1)[0] === "GET" && j(loaded.layer) === "{}" && loaded.policy === null && loaded.storage.kind === "gateway");
  const saved = await gw.saveSession("s-1", { fetch_url: "auto", execute_command: "off" }, catalog);
  check("save PUTs the mapped body", log.at(-1)[0] === "PUT" && j(log.at(-1)[1]) === j({ approve: { tools: ["fetch_url"] }, deny: { tools: ["execute_command"] }, ask: [], client: "abstractcode" }), j(log.at(-1)));
  check("the answer is the gateway's effective layer + policy", j(saved.layer) === j({ fetch_url: "auto", execute_command: "off" }) && saved.policy?.revision === 2);
  await gw.saveSession("s-1", { fetch_url: "auto" }, catalog);
  check("the next save is guarded by the last revision", log.at(-1)[1]?.if_revision === 2, j(log.at(-1)));
  check("nothing written to the browser", ![...mem.keys()].some((k) => k.startsWith("af.tools.session.")));
  const r = await gw.resetSession("s-1");
  check("Use my defaults → DELETE", log.at(-1)[0] === "DELETE" && j(r.layer) === "{}" && r.policy === null);
  await gw.saveSession("s-1", { fetch_url: "auto" }, catalog);
  const n = log.length;
  await gw.saveSession("s-1", {}, catalog);
  check("an empty layer resets (DELETE), never PUTs an empty policy", log.length === n + 1 && log.at(-1)[0] === "DELETE", j(log.slice(n)));
  const conflicted = createToolLayerStore(id, { storage, sessionPolicy: (sid) => createSessionToolPolicyClient(async () => { throw { status: 409, body: { detail: { reason_code: "revision_conflict", revision: 8 } } }; }, sid, CAP) });
  check("a 409 surfaces through saveSession", (await rejects(conflicted.saveSession("s-1", { fetch_url: "auto" }, catalog))) instanceof SessionToolPolicyConflictError);

  const older = createToolLayerStore(id, { storage, sessionPolicy: (sid) => createSessionToolPolicyClient(fakeGateway, sid, null) });
  const st = older.sessionStorage("s-2");
  check("an older gateway: browser storage, labeled, with the fallback note", st.kind === "browser" && st.where === TOOL_LAYER_STORE_WHERE && st.note === TOOL_LAYER_BROWSER_FALLBACK && /cannot store conversation policies/.test(st.note), j(st));
  const m = log.length;
  const b = await older.saveSession("s-2", { fetch_url: "auto" }, catalog);
  check("…saves in this browser and never calls the gateway", log.length === m && b.storage.kind === "browser" && j(older.readSession("s-2")) === j({ fetch_url: "auto" }) && j((await older.loadSession("s-2", catalog)).layer) === j({ fetch_url: "auto" }));
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
