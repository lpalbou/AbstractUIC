#!/usr/bin/env node
/**
 * Automations v1 canonical fixtures (contract F, CONTRACTS rev 2; C13).
 *
 * - Every fixture validates against the contract shapes transcribed below:
 *   required keys present, types right, UNKNOWN KEYS REJECTED.
 * - Coverage: every contract error code with its HTTP status; both v1 trigger
 *   sources; every automation command type; quiet / notified / failed /
 *   waiting / manual / retried occurrences; attention oldest-first.
 * - Cross-fixture consistency (ids, attention items, waits, command paths).
 * - The client's parser turns every errors.json body into the expected
 *   ApiError.
 * - CHECKSUMS.sha256 matches the fixture bytes (the Assistant vendors
 *   byte-identical copies; the root check_identity_sync.py compares them).
 *   `--write` regenerates it after an intended fixture change.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "fixtures", "automations");
const FILES = ["attention.json", "commands.json", "errors.json", "list.json", "occurrences.json", "trigger-sources.json"];
const WRITE = process.argv.includes("--write");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- checksums -------------------------------------------------------------------
const present = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
check("fixture set is exactly the six contract files", eq(present, FILES), JSON.stringify(present));
const sums = FILES.map((f) => `${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}`).join("\n") + "\n";
const sumsPath = join(dir, "CHECKSUMS.sha256");
if (WRITE) {
  writeFileSync(sumsPath, sums);
  console.log(`check_automation_fixtures: wrote ${sumsPath}`);
}
let recorded = "";
try {
  recorded = readFileSync(sumsPath, "utf8");
} catch {
  recorded = "";
}
check("CHECKSUMS.sha256 matches the fixture bytes (run with --write after an intended change)", recorded === sums, recorded ? "drift" : "missing");

const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const fx = Object.fromEntries(FILES.map((f) => [f, load(f)]));
for (const f of FILES) check(`${f} ends with one newline`, readFileSync(join(dir, f), "utf8").endsWith("}\n"));

// --- shape DSL ----------------------------------------------------------------------
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const GATEWAY_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DURATION = /^[1-9][0-9]*[smhd]$/;
const t = {
  str: (v) => typeof v === "string" || "string",
  nonempty: (v) => (typeof v === "string" && v.length > 0) || "non-empty string",
  int: (v) => Number.isInteger(v) || "integer",
  pos: (v) => (Number.isInteger(v) && v >= 1) || "integer >= 1",
  nonneg: (v) => (Number.isInteger(v) && v >= 0) || "integer >= 0",
  bool: (v) => typeof v === "boolean" || "boolean",
  ts: (v) => (typeof v === "string" && TS.test(v) && !Number.isNaN(Date.parse(v))) || "UTC RFC3339 timestamp",
  uuid: (v) => (typeof v === "string" && UUID.test(v)) || "UUID",
  duration: (v) => (typeof v === "string" && DURATION.test(v)) || "duration",
  object: (v) => (v !== null && typeof v === "object" && !Array.isArray(v)) || "JSON object",
  lit: (...vals) => (v) => vals.includes(v) || `one of ${JSON.stringify(vals)}`,
  re: (re) => (v) => (typeof v === "string" && re.test(v)) || `matches ${re}`,
  nullable: (s) => ({ nullable: s }),
  opt: (s) => ({ opt: s }),
  arr: (s, max) => ({ arr: s, max }),
};
function validate(value, schema, path, errs) {
  if (schema && schema.nullable) {
    if (value === null) return;
    return validate(value, schema.nullable, path, errs);
  }
  if (schema && schema.arr) {
    if (!Array.isArray(value)) return errs.push(`${path}: expected array`);
    if (schema.max !== undefined && value.length > schema.max) errs.push(`${path}: more than ${schema.max} items`);
    value.forEach((v, i) => validate(v, schema.arr, `${path}[${i}]`, errs));
    return;
  }
  if (typeof schema === "function") {
    const r = schema(value);
    if (r !== true) errs.push(`${path}: expected ${r}, got ${JSON.stringify(value)}`);
    return;
  }
  // object schema: exact keys
  if (value === null || typeof value !== "object" || Array.isArray(value)) return errs.push(`${path}: expected object`);
  for (const k of Object.keys(value)) if (!(k in schema)) errs.push(`${path}.${k}: unknown field`);
  for (const [k, s] of Object.entries(schema)) {
    if (s && s.opt) {
      if (k in value) validate(value[k], s.opt, `${path}.${k}`, errs);
    } else if (!(k in value)) errs.push(`${path}.${k}: missing`);
    else validate(value[k], s, `${path}.${k}`, errs);
  }
}
const shape = (name, value, schema) => {
  const errs = [];
  validate(value, schema, name, errs);
  check(`shape ${name}`, errs.length === 0, errs.slice(0, 5).join("; "));
};

const Notify = t.nullable({ title: t.nonempty, body: t.str });
const ScheduleConfig = { start_at: t.opt(t.ts), every: t.opt(t.duration), until: t.opt(t.ts), count: t.opt(t.pos), anchor: t.opt(t.ts) };
const TriggerBinding = { binding_id: t.uuid, source_id: t.nonempty, source_version: t.pos, config: t.object };
const AttentionItem = { kind: t.lit("notify", "failure"), automation_id: t.uuid, run_id: t.uuid, index: t.pos, at: t.ts, title: t.nonempty, body: t.opt(t.str), cursor: t.re(/^att1:\d+$/) };
const WaitKind = t.lit("ask_user", "tool_approval", "event");
const anyJson = () => true;
const AttentionWait = { run_id: t.uuid, wait_key: t.nonempty, kind: WaitKind, reason: t.nonempty, index: t.pos, prompt: t.opt(t.str), choices: t.opt(t.arr(t.nonempty)), details: t.opt(anyJson) };
const AutomationSummary = {
  automation_id: t.uuid,
  title: (v) => (typeof v === "string" && v.length > 0 && v.length <= 120) || "title 1..120",
  status: t.lit("active", "paused", "completed", "failed", "archived"),
  trigger: TriggerBinding,
  context_mode: t.lit("independent", "growing"),
  next_fire_at: t.opt(t.ts),
  occurrence_count: t.nonneg,
  last_occurrence: t.opt({ run_id: t.uuid, index: t.pos, status: t.nonempty, attempts: t.pos, fired_at: t.ts, finished_at: t.opt(t.ts), excerpt: t.str, notify: Notify }),
  attention: { pending_waits: t.nonneg, unread: t.bool, unseen_count: t.nonneg, cursor: t.re(/^att1:\d+$/), items: t.arr(AttentionItem, 20), waits: t.arr(AttentionWait, 20) },
  legacy: t.bool,
  revision: t.nullable(t.pos),
  updated_at: t.ts,
  capabilities: t.arr(t.nonempty),
  session_kind: t.lit("automation"),
};
const OccurrenceRow = {
  run_id: t.uuid,
  index: t.pos,
  attempts: t.pos,
  fired_at: t.ts,
  finished_at: t.opt(t.ts),
  status: t.lit("completed", "failed", "cancelled", "running", "waiting"),
  trigger: { source_id: t.nonempty, summary: t.nonempty },
  user_turn: t.nonempty,
  answer: t.str,
  notify: Notify,
  failure: t.opt({ reason_code: t.nonempty, message: t.nonempty, attempts: t.pos }),
  artifacts: t.arr({ artifact_id: t.nonempty, name: t.nonempty, mime_type: t.nonempty, url: t.re(/^\/api\/gateway\//) }),
  waits: t.arr({ run_id: t.uuid, wait_key: t.nonempty, kind: WaitKind, reason: t.nonempty, prompt: t.opt(t.str), choices: t.opt(t.arr(t.nonempty)), details: t.opt(anyJson) }),
  ledger_url: t.re(/^\/api\/gateway\/runs\/[0-9a-f-]{36}\/ledger$/),
  workspace_url: t.opt(t.re(/^\/api\/gateway\//)),
};
const TriggerSourceEntry = {
  id: t.nonempty,
  version: t.pos,
  label: t.nonempty,
  config_schema: t.object,
  event_schema: t.object,
  capabilities: { kind: t.lit("time", "manual", "event") },
  available: t.bool,
  unavailable_reason: t.opt(t.str),
};
const Receipt = { command_id: t.nonempty, accepted: t.bool, duplicate: t.bool, seq: t.nonneg };
const ErrorDetail = { reason_code: t.nonempty, message: t.nonempty, field: t.opt(t.nonempty), command_id: t.opt(t.nonempty) };
const Page = (item) => ({ items: t.arr(item), next_cursor: t.nullable(t.nonempty) });

shape("list.json", fx["list.json"], Page(AutomationSummary));
shape("occurrences.json", fx["occurrences.json"], Page(OccurrenceRow));
shape("attention.json", fx["attention.json"], Page(AttentionItem));
shape("trigger-sources.json", fx["trigger-sources.json"], { items: t.arr(TriggerSourceEntry) });
shape("errors.json", fx["errors.json"], { items: t.arr({ name: t.nonempty, request: { method: t.lit("GET", "POST", "PATCH"), path: t.re(/^\/api\/gateway\//), body: t.nullable(t.object) }, status: t.lit(401, 403, 404, 409, 422), body: { detail: ErrorDetail } }) });
const CommandBody = { command_id: t.nonempty, type: t.lit("automation.pause", "automation.resume", "automation.run_now", "automation.stop_current", "automation.archive"), payload: t.opt(t.object) };
const ReviseBody = { command_id: t.nonempty, expected_revision: t.opt(t.pos), changes: { title: t.opt(t.nonempty), target: t.opt(t.object), trigger: t.opt({ source_id: t.nonempty, source_version: t.pos, config: t.object }), context: t.opt({ mode: t.lit("independent", "growing") }), policy: t.opt(t.object) } };
const ResumeBody = { command_id: t.nonempty, run_id: t.uuid, type: t.lit("resume"), payload: { wait_key: t.nonempty, payload: t.object }, client_id: t.opt(t.nonempty) };
const ROUTES = [
  [/^\/api\/gateway\/automations\/[0-9a-f-]{36}$/, "PATCH", ReviseBody, Receipt],
  [/^\/api\/gateway\/automations\/[0-9a-f-]{36}\/commands$/, "POST", CommandBody, Receipt],
  [/^\/api\/gateway\/automations\/[0-9a-f-]{36}\/seen$/, "POST", { attention_cursor: t.re(/^att1:\d+$/) }, { attention_cursor: t.re(/^att1:\d+$/) }],
  [/^\/api\/gateway\/automations\/[0-9a-f-]{36}\/discuss$/, "POST", { request_id: t.nonempty, occurrence_index: t.pos, prompt: t.nonempty }, { session_id: t.re(/^discussion-session:/), run_id: t.uuid, session_kind: t.lit("discussion"), workspace_root: t.re(/^\//), mounted_workspace: t.re(/^\//) }],
  [/^\/api\/gateway\/commands$/, "POST", ResumeBody, { accepted: t.bool, duplicate: t.bool, seq: t.nonneg }],
];
for (const [i, c] of fx["commands.json"].items.entries()) {
  shape(`commands.json[${i}] envelope`, c, { name: t.nonempty, request: { method: t.lit("POST", "PATCH"), path: t.nonempty, body: t.object }, status: t.lit(200), response: t.object });
  const route = ROUTES.find(([re, m]) => re.test(c.request.path) && m === c.request.method);
  check(`commands.json[${i}] (${c.name}) is a known route`, !!route, `${c.request.method} ${c.request.path}`);
  if (!route) continue;
  shape(`commands.json[${i}] (${c.name}) request`, c.request.body, route[2]);
  shape(`commands.json[${i}] (${c.name}) response`, c.response, route[3]);
  if (route[3] === Receipt) check(`commands.json[${i}] receipt echoes command_id`, c.response.command_id === c.request.body.command_id);
}
for (const s of fx["list.json"].items) {
  if (s.trigger.source_id === "schedule") shape(`schedule config of ${s.title}`, s.trigger.config, ScheduleConfig);
}

// --- coverage ------------------------------------------------------------------------
const CODES = {
  unauthorized: 401,
  forbidden: 403,
  automation_not_found: 404,
  occurrence_not_found: 404,
  revision_conflict: 409,
  automation_busy: 409,
  invalid_state: 409,
  identity_conflict: 409,
  invalid_request: 422,
  invalid_definition: 422,
  unsupported_feature: 422,
  unknown_trigger_source: 422,
};
const errItems = fx["errors.json"].items;
const seenCodes = new Set(errItems.map((e) => e.body.detail.reason_code));
check("errors.json: every contract code has a body", Object.keys(CODES).every((c) => seenCodes.has(c)), JSON.stringify([...seenCodes]));
check("errors.json: no code outside the contract", [...seenCodes].every((c) => c in CODES));
check("errors.json: both resume-payload mismatches (by kind)", ["tool_approval", "ask_user"].every((k) => errItems.some((e) => e.request.path === "/api/gateway/commands" && e.body.detail.reason_code === "invalid_request" && e.body.detail.message.includes(`waits for ${k}`))));
for (const e of errItems) check(`errors.json: ${e.body.detail.reason_code} is HTTP ${CODES[e.body.detail.reason_code]}`, e.status === CODES[e.body.detail.reason_code], String(e.status));
check("errors.json: no cursor_expired (removed in rev 2)", !JSON.stringify(errItems).includes("cursor_expired"));

const sources = fx["trigger-sources.json"].items;
check("trigger sources: schedule@1 and manual@1", eq(sources.map((s) => `${s.id}@${s.version}`), ["schedule@1", "manual@1"]));
const sched = sources.find((s) => s.id === "schedule");
check("schedule@1 schema: the five config fields, closed", eq(Object.keys(sched.config_schema.properties).sort(), ["anchor", "count", "every", "start_at", "until"]) && sched.config_schema.additionalProperties === false);
check("schedule@1 schema: duration pattern", sched.config_schema.properties.every.pattern === "^[1-9][0-9]*[smhd]$");
// Decided (review 42 F1): the envelope payload is the runtime's {tick, scheduled_at, coalesced?}; fired_at is on the envelope.
check("schedule@1 event payload = {tick, scheduled_at, coalesced?}", eq(Object.keys(sched.event_schema.properties).sort(), ["coalesced", "scheduled_at", "tick"]) && eq(sched.event_schema.required, ["tick", "scheduled_at"]) && sched.event_schema.additionalProperties === false);
check("schedule@1 coalesced = {first_tick, last_tick, missed_count}", eq(Object.keys(sched.event_schema.properties.coalesced.properties).sort(), ["first_tick", "last_tick", "missed_count"]) && eq(sched.event_schema.properties.coalesced.required, ["first_tick", "last_tick", "missed_count"]));
check("schedule@1 payload has no fired_at / scheduled_for / coalesced_from", !["fired_at", "scheduled_for", "coalesced_from"].some((k) => k in sched.event_schema.properties));
check("schedule@1 schema: no tz field in v1", !("tz" in sched.config_schema.properties) && !("timezone" in sched.config_schema.properties));
check("manual@1 schema: empty closed config", eq(sources.find((s) => s.id === "manual").config_schema, { type: "object", additionalProperties: false, properties: {} }));

const list = fx["list.json"].items;
check("list: three automations + the legacy row, legacy last", list.length === 4 && list.filter((s) => s.legacy).length === 1 && list[3].legacy === true);
const legacy = list[3];
check("legacy row: capabilities [legacy], revision null, binding_id + last_occurrence", eq(legacy.capabilities, ["legacy"]) && legacy.revision === null && UUID.test(legacy.trigger.binding_id) && !!legacy.last_occurrence);
for (const s of list) {
  const want = s.legacy ? ["legacy"] : ["archived", "completed", "failed"].includes(s.status) ? ["discuss"] : ["revise", "pause", "resume", "run_now", "stop_current", "archive", "discuss"];
  check(`${s.title}: capabilities are the gateway's for status ${s.status}`, eq(s.capabilities, want), JSON.stringify(s.capabilities));
}
// Gateway timestamp format everywhere in the responses (microseconds, +00:00).
const stamps = [];
const collect = (v, k) => {
  if (Array.isArray(v)) return v.forEach((x) => collect(x, k));
  if (v && typeof v === "object") return Object.entries(v).forEach(([kk, vv]) => collect(vv, kk));
  if (typeof v === "string" && ["fired_at", "finished_at", "at", "updated_at", "next_fire_at", "start_at", "anchor", "until"].includes(k)) stamps.push(v);
};
collect([fx["list.json"], fx["occurrences.json"], fx["attention.json"]]);
check("every response timestamp is in the gateway format (.ffffff+00:00)", stamps.length > 30 && stamps.every((v) => GATEWAY_TS.test(v)), stamps.find((v) => !GATEWAY_TS.test(v)));
const byTitle = Object.fromEntries(list.map((s) => [s.title, s]));
const news = byTitle["AI news monitor"], mail = byTitle["Inbox triage"], jour = byTitle["Weekly journal monitor"];
for (const s of list.filter((x) => !x.legacy)) check(`${s.title}: trigger config key order is the gateway's (start_at, anchor, every…)`, eq(Object.keys(s.trigger.config).slice(0, 3), ["start_at", "anchor", "every"]));
check("list: news monitor every 8h independent active", news && news.trigger.config.every === "8h" && news.context_mode === "independent" && news.status === "active");
check("list: inbox triage every 30m growing with typed pending waits (ask_user + tool_approval)", mail && mail.trigger.config.every === "30m" && mail.context_mode === "growing" && mail.attention.pending_waits === 2 && eq(mail.attention.waits.map((w) => w.kind), ["ask_user", "tool_approval"]));
check("list: weekly journal monitor every 7d, paused", jour && jour.trigger.config.every === "7d" && jour.status === "paused" && !("next_fire_at" in jour));
for (const s of list) {
  check(`${s.title}: unread == unseen_count > 0`, s.attention.unread === s.attention.unseen_count > 0);
  check(`${s.title}: v1 anchor == start_at`, s.trigger.config.anchor === undefined || s.trigger.config.anchor === s.trigger.config.start_at);
  const seqs = s.attention.items.map((i) => Number(i.cursor.slice(5)));
  check(`${s.title}: attention items oldest first`, seqs.every((v, i) => i === 0 || v > seqs[i - 1]));
  check(`${s.title}: summary cursor >= every item cursor`, seqs.every((v) => v <= Number(s.attention.cursor.slice(5))));
}

const occ = fx["occurrences.json"].items;
check("occurrences: one page for the inbox triage, all 7", occ.length === mail.occurrence_count);
check("occurrences: indices 1..N, unique", eq(occ.map((o) => o.index).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]));
const kinds = {
  quiet: occ.some((o) => o.status === "completed" && o.notify === null && !o.waits.length),
  notify: occ.some((o) => o.notify !== null && o.artifacts.length > 0),
  retried: occ.some((o) => o.status === "completed" && o.attempts > 1),
  manual: occ.some((o) => o.trigger.source_id === "manual" && o.user_turn.startsWith("[Trigger manual@1 ")),
  failed: occ.some((o) => o.status === "failed" && o.attempts === 3),
  waiting: occ.some((o) => o.status === "waiting" && !("finished_at" in o) && o.waits.some((w) => w.kind === "ask_user" && Array.isArray(w.choices))),
  "tool_approval wait with details": occ.some((o) => o.waits.some((w) => w.kind === "tool_approval" && Array.isArray(w.details) && w.details.length > 0)),
};
for (const [k, v] of Object.entries(kinds)) check(`occurrences cover ${k}`, v);
const failedRows = occ.filter((o) => o.status === "failed");
check("a failed row carries the gateway's `failure`", failedRows.length > 0 && failedRows.every((o) => o.failure && o.failure.reason_code === "occurrence_failed" && o.failure.attempts === o.attempts));
check("failure attention body = the failure message, title '<automation> failed'", failedRows.every((o) => { const a = fx["attention.json"].items.find((x) => x.index === o.index); return a && a.kind === "failure" && a.body === o.failure.message && a.title === `${mail.title} failed`; }));
check("`failure` only on failed rows", occ.filter((o) => o.status !== "failed").every((o) => !("failure" in o)));
const startMs = Date.parse(mail.trigger.config.start_at);
for (const o of occ) {
  // Decided wording (review 42 F3).
  if (o.trigger.source_id === "schedule") {
    const tick = (Date.parse(o.fired_at) - startMs) / 1800000;
    check(`occurrence #${o.index}: summary "schedule: every 30 minutes (UTC), tick ${tick}"`, o.trigger.summary === `schedule: every 30 minutes (UTC), tick ${tick}`, o.trigger.summary);
  } else {
    check(`occurrence #${o.index}: summary "manual: run now (<command_id>)"`, /^manual: run now \([^()\s]+\)$/.test(o.trigger.summary), o.trigger.summary);
  }
  check(`occurrence #${o.index}: user_turn is the rendered trigger line`, o.user_turn.startsWith(`[Trigger ${o.trigger.source_id}@1 · occurrence ${o.index} · fired ${o.fired_at}]\n`));
  check(`occurrence #${o.index}: ledger_url names its run`, o.ledger_url === `/api/gateway/runs/${o.run_id}/ledger`);
  for (const w of o.waits) {
    // A flow-level question waits on the occurrence run; a tool approval may wait on a descendant (the agent sub-run).
    check(`occurrence #${o.index}: ${w.kind} wait reason is "user" (kind carries the type)`, w.reason === "user");
    if (w.kind === "ask_user") check(`occurrence #${o.index}: ask_user wait is on the occurrence run`, w.run_id === o.run_id && w.wait_key === `user:${o.run_id}:ask`);
    if (w.kind === "tool_approval") {
      check(`occurrence #${o.index}: tool_approval wait on a descendant run`, w.run_id !== o.run_id);
      shape(`occurrence #${o.index} tool_approval details`, w.details, t.arr({ name: t.nonempty, arguments: t.object, call_id: t.opt(t.nonempty) }));
      check(`occurrence #${o.index}: tool_approval has no choices`, !("choices" in w));
    }
  }
}
const last = occ.reduce((a, b) => (b.index > a.index ? b : a));
check("inbox summary.last_occurrence is the newest occurrence", mail.last_occurrence.run_id === last.run_id && mail.last_occurrence.index === last.index);
check("inbox summary waits == the waiting occurrence's typed waits + index", eq(mail.attention.waits, last.waits.map((w) => ({ ...w, index: last.index }))));
check("inbox pending_waits counts every wait", mail.attention.pending_waits === last.waits.length);

const att = fx["attention.json"].items;
check("attention.json == inbox summary attention items (same page)", eq(att, mail.attention.items));
check("attention.json covers notify and failure", eq(att.map((a) => a.kind).sort(), ["failure", "notify"]));
for (const a of att) {
  const o = occ.find((x) => x.index === a.index);
  check(`attention #${a.index} points at its occurrence`, o && o.run_id === a.run_id && a.automation_id === mail.automation_id);
  if (a.kind === "notify") check(`attention #${a.index} notify title from the output`, o && o.notify && o.notify.title === a.title);
  if (a.kind === "failure") check(`attention #${a.index} failure is a failed occurrence`, o && o.status === "failed");
}
check("no quiet occurrence has an attention item", occ.filter((o) => o.notify === null && o.status !== "failed").every((o) => !att.some((a) => a.index === o.index)));

const cmds = fx["commands.json"].items;
const allWaits = occ.flatMap((o) => o.waits);
const ANSWER = { ask_user: ["response"], tool_approval: ["approved"], event: ["payload"] };
const resumes = cmds.filter((c) => c.request.path === "/api/gateway/commands");
check("commands: a resume for each pending wait kind in the fixtures", eq([...new Set(resumes.map((c) => allWaits.find((w) => w.wait_key === c.request.body.payload.wait_key)?.kind))].sort(), [...new Set(allWaits.map((w) => w.kind))].sort()));
for (const c of resumes) {
  const w = allWaits.find((x) => x.wait_key === c.request.body.payload.wait_key);
  check(`resume "${c.name}": run_id + answer keys follow the wait's kind`, !!w && c.request.body.run_id === w.run_id && eq(Object.keys(c.request.body.payload.payload), ANSWER[w.kind]));
}
check("commands: the repeat receipt is the gateway's (accepted:false, duplicate:true)", cmds.some((c) => c.response.duplicate === true && c.response.accepted === false));
const ids = new Set(list.map((s) => s.automation_id));
const automationCmds = cmds.filter((c) => c.request.path.startsWith("/api/gateway/automations/") && /\/commands$|[0-9a-f]$/.test(c.request.path));
check("commands cover every automation command type + revise", eq([...new Set(automationCmds.map((c) => c.request.body.type ?? "revise"))].sort(), ["automation.archive", "automation.pause", "automation.resume", "automation.run_now", "automation.stop_current", "revise"]));
const disc = cmds.find((c) => c.request.path.endsWith("/discuss"));
check("discuss: own writable workspace differs from the mounted automation folder", disc && disc.response.workspace_root !== disc.response.mounted_workspace && disc.response.mounted_workspace.includes(mail.automation_id.slice(0, 8)));
check("commands cover seen and discuss", cmds.some((c) => c.request.path.endsWith("/seen")) && cmds.some((c) => c.request.path.endsWith("/discuss")));
for (const c of automationCmds) {
  const m = /^\/api\/gateway\/automations\/([0-9a-f-]{36})(\/commands)?$/.exec(c.request.path);
  check(`command ${c.name}: path names a listed automation`, m && ids.has(m[1]), c.request.path);
  check(`command ${c.name}: PATCH on the automation, POST on /commands`, m && (c.request.method === "PATCH") === !m[2]);
}
const rev = cmds.find((c) => c.request.method === "PATCH");
check("revise expected_revision == the automation's revision", rev.request.body.expected_revision === list.find((s) => rev.request.path.endsWith(s.automation_id)).revision);

// --- the client parses every error body ----------------------------------------------
const { parseApiError } = await import(join(here, "..", "dist", "index.js"));
check("export parseApiError", typeof parseApiError === "function");
for (const e of errItems) {
  const d = e.body.detail;
  const want = { status: e.status, code: d.reason_code, message: d.message, ...(d.field ? { field: d.field } : {}), ...(d.command_id ? { command_id: d.command_id } : {}) };
  check(`parseApiError(${d.reason_code})`, eq(parseApiError(e.status, e.body), want), JSON.stringify(parseApiError(e.status, e.body)));
}

if (failures) {
  console.error(`check_automation_fixtures: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_fixtures: OK (${checks} checks, ${FILES.length} fixtures)`);
