#!/usr/bin/env node
/**
 * Automations v1 client (ui-kit/src/automations/client.ts) against contract F:
 * exact method + path + JSON body per route (commands.json requests are the
 * reference), ids minted only when absent, no `changed_since`, and error
 * parsing from `detail.reason_code` (errors.json) — unknown shapes throw
 * `invalid_response`, never a silent success.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));
const kit = await import(join(here, "..", "dist", "index.js"));
const { createAutomationsClient, AutomationApiError, AUTOMATIONS_PATH, TRIGGER_SOURCES_PATH } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check("exports", typeof createAutomationsClient === "function" && typeof AutomationApiError === "function");
check("paths", AUTOMATIONS_PATH === "/api/gateway/automations" && TRIGGER_SOURCES_PATH === "/api/gateway/trigger-sources");

/** Stub transport: records calls, answers `reply(url, init)` → {status, body|text}. */
function stub(reply = () => ({ status: 200, body: {} })) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const r = reply(url, init);
    const text = "text" in r ? r.text : JSON.stringify(r.body);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text };
  };
  return { fetch, calls };
}
let n = 0;
const newId = () => `gen-${++n}`;

const list = fx("list.json");
const byTitle = Object.fromEntries(list.items.map((s) => [s.title, s]));
const news = byTitle["AI news monitor"], mail = byTitle["Inbox triage"], jour = byTitle["Weekly journal monitor"];

// --- commands.json: exact requests -----------------------------------------------------
const clientRoutes = fx("commands.json").items.filter((c) => c.request.path.startsWith("/api/gateway/automations/"));
check("commands.json: every client route present (revise, commands, seen, discuss)", ["PATCH", "/commands", "/seen", "/discuss"].every((k) => clientRoutes.some((c) => (k === "PATCH" ? c.request.method === k : c.request.path.endsWith(k)))));
for (const c of clientRoutes) {
  const s = stub(() => ({ status: 200, body: c.response }));
  const client = createAutomationsClient({ fetch: s.fetch, newId });
  const id = c.request.path.split("/")[4];
  const b = c.request.body;
  const got =
    c.request.method === "PATCH"
      ? await client.reviseAutomation(id, { changes: b.changes, expected_revision: b.expected_revision, command_id: b.command_id })
      : c.request.path.endsWith("/seen")
        ? await client.markSeen(id, b.attention_cursor)
        : c.request.path.endsWith("/discuss")
          ? await client.discuss(id, { occurrence_index: b.occurrence_index, prompt: b.prompt, request_id: b.request_id })
          : await client.sendAutomationCommand(id, { type: b.type, command_id: b.command_id });
  const call = s.calls[0];
  check(`${c.name}: method`, call.method === c.request.method, call.method);
  check(`${c.name}: path`, call.url === c.request.path, call.url);
  check(`${c.name}: body (exact, key order included)`, eq(call.body, b), JSON.stringify(call.body));
  check(`${c.name}: receipt returned`, eq(got, c.response));
  check(`${c.name}: JSON content-type`, call.headers["content-type"] === "application/json");
}

// --- every other route -------------------------------------------------------------------
{
  const s = stub((url) => ({ status: 200, body: url.includes("trigger-sources") ? fx("trigger-sources.json") : url.includes("/attention") ? fx("attention.json") : url.includes("/occurrences") ? fx("occurrences.json") : list }));
  const c = createAutomationsClient({ fetch: s.fetch, newId, baseUrl: "http://127.0.0.1:18900/", headers: () => ({ authorization: "Bearer t" }) });
  const page = await c.listAutomations();
  check("listAutomations returns the page", eq(page, list));
  await c.listAutomations({ status: "paused", cursor: "c1", limit: 20 });
  await c.getAutomation(news.automation_id);
  await c.listOccurrences(mail.automation_id, { limit: 50 });
  await c.listAttention(mail.automation_id, { cursor: "att1:1" });
  await c.listTriggerSources();
  await c.markSeen(mail.automation_id, "att1:2");
  await c.discuss(mail.automation_id, { occurrence_index: 2, prompt: "Draft the reply to Clara." });
  await c.discuss(mail.automation_id, { occurrence_index: 2, prompt: "again", request_id: "req-keep" });
  const body = { request_id: "req-1", title: "Inbox triage", target: { flow_id: "@default", interface: "abstractcode.agent.v1", input_data: { prompt: "Triage" } }, trigger: { source_id: "schedule", source_version: 1, config: { every: "30m" } }, context: { mode: "growing" } };
  await c.createAutomation(body);
  await c.sendAutomationCommand(jour.automation_id, { type: "automation.run_now" });
  await c.reviseAutomation(news.automation_id, { changes: { title: "News" } });
  const B = "http://127.0.0.1:18900/api/gateway";
  const expected = [
    ["GET", `${B}/automations`, undefined],
    ["GET", `${B}/automations?status=paused&cursor=c1&limit=20`, undefined],
    ["GET", `${B}/automations/${news.automation_id}`, undefined],
    ["GET", `${B}/automations/${mail.automation_id}/occurrences?limit=50`, undefined],
    ["GET", `${B}/automations/${mail.automation_id}/attention?cursor=att1%3A1`, undefined],
    ["GET", `${B}/trigger-sources`, undefined],
    ["POST", `${B}/automations/${mail.automation_id}/seen`, { attention_cursor: "att1:2" }],
    ["POST", `${B}/automations/${mail.automation_id}/discuss`, { request_id: "gen-1", occurrence_index: 2, prompt: "Draft the reply to Clara." }],
    ["POST", `${B}/automations/${mail.automation_id}/discuss`, { request_id: "req-keep", occurrence_index: 2, prompt: "again" }],
    ["POST", `${B}/automations`, body],
    ["POST", `${B}/automations/${jour.automation_id}/commands`, { command_id: "gen-2", type: "automation.run_now" }],
    ["PATCH", `${B}/automations/${news.automation_id}`, { command_id: "gen-3", changes: { title: "News" } }],
  ];
  check("route count", s.calls.length === expected.length, String(s.calls.length));
  expected.forEach(([m, u, b], i) => {
    const call = s.calls[i] || {};
    check(`route ${i}: ${m} ${u.replace(B, "")}`, call.method === m && call.url === u && eq(call.body, b), `${call.method} ${call.url} ${JSON.stringify(call.body)}`);
  });
  check("GETs carry no body and no content-type", s.calls.filter((c) => c.method === "GET").every((c) => c.body === undefined && !("content-type" in c.headers)));
  check("host headers merged into every request", s.calls.every((c) => c.headers.authorization === "Bearer t" && c.headers.accept === "application/json"));
  check("never sends changed_since", s.calls.every((c) => !c.url.includes("changed_since")));
  check("ids come from newId only when absent", n === 3);
}
{
  // Automation ids are path-encoded (a hostile id cannot traverse routes).
  const s = stub();
  await createAutomationsClient({ fetch: s.fetch, newId }).getAutomation("../runs");
  check("id is URL-encoded", s.calls[0].url === "/api/gateway/automations/..%2Fruns", s.calls[0].url);
}
{
  // Default id source is crypto.randomUUID.
  const s = stub(() => ({ status: 200, body: { command_id: "x", accepted: true, duplicate: false, seq: 1 } }));
  await createAutomationsClient({ fetch: s.fetch }).sendAutomationCommand(news.automation_id, { type: "automation.pause" });
  check("default command_id is a UUID", /^[0-9a-f-]{36}$/.test(s.calls[0].body.command_id), s.calls[0].body.command_id);
}

// --- errors ------------------------------------------------------------------------------
async function thrown(p) {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
}
for (const e of fx("errors.json").items) {
  const s = stub(() => ({ status: e.status, body: e.body }));
  const err = await thrown(createAutomationsClient({ fetch: s.fetch, newId }).getAutomation(news.automation_id));
  const d = e.body.detail;
  check(`error ${d.reason_code}: AutomationApiError`, err instanceof AutomationApiError && err instanceof Error);
  check(`error ${d.reason_code}: code/status/message`, err && err.code === d.reason_code && err.status === e.status && err.message === d.message, err && `${err.code} ${err.status}`);
  check(`error ${d.reason_code}: field/command_id`, err && err.field === d.field && err.command_id === d.command_id);
  check(`error ${d.reason_code}: is an ApiError for the panel`, kit.isApiError(err));
}
const odd = [
  ["FastAPI string detail", 404, { detail: "Not Found" }],
  ["legacy error envelope", 409, { error: { code: "revision_conflict", message: "x" } }],
  ["validation list", 422, { detail: [{ loc: ["body"], msg: "x" }] }],
  ["HTML 502", 502, null, "<html>bad gateway</html>"],
  ["empty 500", 500, null, ""],
];
for (const [name, status, body, text] of odd) {
  const s = stub(() => (text !== undefined ? { status, text } : { status, body }));
  const err = await thrown(createAutomationsClient({ fetch: s.fetch, newId }).listAutomations());
  check(`${name} → invalid_response ${status}`, err instanceof AutomationApiError && err.code === "invalid_response" && err.status === status, err && `${err.code}`);
}
for (const [name, text] of [["2xx non-JSON", "ok"], ["2xx empty", ""], ["2xx JSON null", "null"]]) {
  const s = stub(() => ({ status: 200, text }));
  const err = await thrown(createAutomationsClient({ fetch: s.fetch, newId }).listTriggerSources());
  check(`${name} throws invalid_response`, err instanceof AutomationApiError && err.code === "invalid_response");
}
{
  const boom = new Error("network down");
  const err = await thrown(createAutomationsClient({ fetch: async () => { throw boom; }, newId }).listAutomations());
  check("transport errors propagate unchanged", err === boom);
}

if (failures) {
  console.error(`check_automation_client: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_client: OK (${checks} checks)`);
