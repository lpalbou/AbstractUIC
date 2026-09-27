#!/usr/bin/env node
/**
 * AutomationPanel + AfScheduleDialog (contract G) over the canonical fixtures.
 *
 * renderToStaticMarkup over the compiled dist (no jsdom), like check_about:
 * - occurrences render as CHAT PAIRS (trigger turn, then answer turn), oldest
 *   first whatever the page order; quiet ticks subdued and unbadged; failures,
 *   waits and notify prominent; the wait carries an answer control;
 * - controls' enabled states per status (run now enabled while PAUSED),
 *   capabilities, legacy, archived and busy;
 * - the hook-free pieces are called directly and their handlers invoked, so
 *   the wiring to onCommand / onAnswerWait / onDiscuss / onOpenRun / onRevise
 *   is proven, not just the markup;
 * - pure rules: labels ("every 8 hours (UTC)", never calendar wording),
 *   revise diff, attention ack cursor (last DISPLAYED item), error texts,
 *   the create-request builder.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));
const kit = await import(join(here, "..", "dist", "index.js"));
const parts = await import(join(here, "..", "dist", "automations", "AutomationPanel.js"));
const { AutomationPanel, AfScheduleDialog, DISCUSS_LABEL } = kit;
const { AutomationControlsBar, AutomationReviseForm, OccurrencePair, AutomationHeader } = parts;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

for (const [name, v] of Object.entries({ AutomationPanel, AfScheduleDialog, AutomationControlsBar, AutomationReviseForm, OccurrencePair, AutomationHeader })) check(`export ${name}`, typeof v === "function");

const list = fx("list.json").items;
const [news, mail, jour] = list;
const occ = fx("occurrences.json").items;
const sources = fx("trigger-sources.json").items;
const calls = [];
const rec = (name) => (...args) => {
  calls.push([name, ...args]);
  return Promise.resolve(name === "onDiscuss" ? { session_id: "s", run_id: "r" } : name === "onSeen" || name === "onAnswerWait" ? undefined : { command_id: "c", accepted: true, duplicate: false, seq: 1 });
};
const handlers = { onRevise: rec("onRevise"), onCommand: rec("onCommand"), onDiscuss: rec("onDiscuss"), onSeen: rec("onSeen"), onLoadMore: rec("onLoadMore"), onOpenRun: rec("onOpenRun"), onAnswerWait: rec("onAnswerWait") };
const panel = (props) => renderToStaticMarkup(React.createElement(AutomationPanel, { triggerSources: sources, occurrences: [], busy: false, ...handlers, ...props }));

// Tiny element-tree helpers for the hook-free pieces.
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node !== "object") return;
  if (typeof node.type === "function") return walk(node.type(node.props), visit);
  visit(node);
  walk(node.props && node.props.children, visit);
}
const find = (tree, pred) => {
  const out = [];
  walk(tree, (n) => pred(n) && out.push(n));
  return out;
};
const byAction = (tree, action) => find(tree, (n) => n.props && n.props["data-action"] === action);
const button = (html, action) => {
  const m = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`).exec(html);
  return m ? m[0] : null;
};
const enabled = (html, action) => {
  const b = button(html, action);
  return b !== null && !/ disabled=""/.test(b);
};

// --- Inbox triage: chat pairs, quiet vs notable, the wait ------------------------------
const mailHtml = panel({ summary: mail, occurrences: occ });
{
  const lis = [...mailHtml.matchAll(/<li class="af-auto-occ af-auto-occ--([a-z]+)" data-index="(\d+)" data-tone="([a-z]+)"/g)];
  check("seven occurrence pairs", lis.length === 7, String(lis.length));
  check("chronological (page is newest first)", eq(lis.map((m) => Number(m[2])), [1, 2, 3, 4, 5, 6, 7]), JSON.stringify(lis.map((m) => m[2])));
  const tone = Object.fromEntries(lis.map((m) => [Number(m[2]), m[1]]));
  check("tones: quiet 1,3,4,6; notified 2; failed 5; waiting 7", eq(tone, { 1: "quiet", 2: "notified", 3: "quiet", 4: "quiet", 5: "failed", 6: "quiet", 7: "waiting" }), JSON.stringify(tone));
  const chunks = mailHtml.split('<li class="af-auto-occ ').slice(1);
  chunks.forEach((c, i) => {
    const t = c.indexOf('data-turn="trigger"'), a = c.indexOf('data-turn="answer"');
    check(`pair ${i + 1}: trigger turn then answer turn`, t > 0 && a > t);
  });
  for (const i of [1, 3, 4, 6]) check(`quiet #${i} carries no badge`, !chunks[i - 1].includes("af-auto-badge"));
  check("#2 badged Notified with its notify title + artifact link", chunks[1].includes("af-auto-badge--notified\">Notified<") && chunks[1].includes("<strong>2 urgent emails</strong>") && chunks[1].includes('href="/api/gateway/runs/') && chunks[1].includes("triage-2026-09-27T0430Z.md"));
  check("#3 says completed after 2 attempts", chunks[2].includes("completed after 2 attempts"));
  check("#4 is the manual run", chunks[3].includes("manual run") && chunks[3].includes("[Trigger manual@1 · occurrence 4"));
  check("#5 badged Failed after 3 attempts", chunks[4].includes(">Failed after 3 attempts<") && chunks[4].includes("No answer: the run failed."));
  const w = occ.find((o) => o.index === 7).waits[0];
  check("#7 badged Waiting for you", chunks[6].includes(">Waiting for you<"));
  check("#7 wait prompt rendered", chunks[6].includes(esc(w.prompt)));
  check("#7 one button per choice", w.choices.every((c) => chunks[6].includes(`data-action="wait-choice">${esc(c)}</button>`)));
  check("#7 free-text answer control, labelled", chunks[6].includes('aria-label="Your answer"') && chunks[6].includes('data-action="wait-answer"'));
  check("wait form labelled by its prompt", /<form class="af-auto-wait" data-wait-key="ask_user:reply-landlord" aria-labelledby="[^"]+-prompt"/.test(chunks[6]));
  check("no wait controls on other occurrences", chunks.filter((c, i) => i !== 6).every((c) => !c.includes("af-auto-wait")));
  check("every pair has an expandable ledger link", chunks.every((c) => c.includes("<details class=\"af-auto-occ__details\"><summary>Run details</summary>") && c.includes('data-action="open-run"') && /href="\/api\/gateway\/runs\/[0-9a-f-]{36}\/ledger"/.test(c)));
  check("Discuss labelled as a forked session with a read-only workspace", mailHtml.includes(`>${esc(DISCUSS_LABEL)}</button>`) && DISCUSS_LABEL === "Discuss — forked session, read-only workspace");
  check("Discuss disabled on the waiting occurrence only", chunks.every((c, i) => (/data-action="discuss" disabled=""/.test(c)) === (i === 6)));
  check("header: every 30 minutes (UTC), growing, next run", mailHtml.includes(">every 30 minutes (UTC)</dd>") && mailHtml.includes("Growing — each run sees the previous runs") && mailHtml.includes(">2026-09-27 07:00 UTC</dd>"));
  check("header: attention 2 unseen + 1 waiting, notable", mailHtml.includes('class="is-notable">2 unseen · 1 waiting for you</dd>'));
  check("attention strip lists both items oldest first", mailHtml.indexOf('data-cursor="att1:1"') > 0 && mailHtml.indexOf('data-cursor="att1:2"') > mailHtml.indexOf('data-cursor="att1:1"'));
  check("attention strip lists the pending wait", mailHtml.includes("af-auto__attention-item--wait"));
  check("controls: pause enabled; run now disabled while an occurrence waits; stop current enabled", enabled(mailHtml, "pause") && !enabled(mailHtml, "run_now") && enabled(mailHtml, "stop_current"));
  check("controls: resume not offered while active", button(mailHtml, "resume") === null);
  check("controls: labelled toolbar", mailHtml.includes('role="toolbar" aria-label="Automation controls"'));
  check("section labelled by the title, aria-busy false", /<section class="af-auto" aria-labelledby="([^"]+)" aria-busy="false">/.test(mailHtml) && /<h2 class="af-auto__title" id="[^"]+">Inbox triage<\/h2>/.test(mailHtml));
  check("all occurrences loaded → no load-more", button(mailHtml, "load-more") === null);
}

// --- News monitor: every 8 hours, load more ---------------------------------------------
{
  const html = panel({ summary: news, occurrences: [] });
  check("news: every 8 hours (UTC)", html.includes(">every 8 hours (UTC)</dd>"));
  check("news: independent", html.includes("Independent — each run starts fresh"));
  check("news: next run", html.includes(">2026-09-27 08:00 UTC</dd>"));
  check("news: attention quiet", html.includes('data-fact="attention">nothing new</dd>') && !html.includes("af-auto__attention\""));
  check("news: pause + run now enabled, stop current disabled", enabled(html, "pause") && enabled(html, "run_now") && !enabled(html, "stop_current"));
  check("news: load more (6 more)", enabled(html, "load-more") && html.includes("Load earlier occurrences (6 more)"));
  check("news: no occurrences text", html.includes("No occurrences yet."));
}

// --- Journal (paused): run now while paused ------------------------------------------
{
  const html = panel({ summary: jour, occurrences: [] });
  check("journal: every 7 days (UTC) · 12 runs max", html.includes(">every 7 days (UTC) · 12 runs max</dd>"));
  check("journal: Resume offered and enabled; Pause not offered", enabled(html, "resume") && button(html, "pause") === null);
  check("journal: RUN NOW ENABLED WHILE PAUSED", enabled(html, "run_now"));
  check("journal: paused hint says run now keeps it paused", html.includes("Run now works and keeps it paused."));
  check("journal: next run none while paused", html.includes(">none while paused</dd>"));
  check("journal: status chip Paused", html.includes('af-auto__status--paused">Paused<'));
  check("journal: revise + archive enabled", enabled(html, "revise") && enabled(html, "archive"));
}

// --- busy / archived / legacy / capabilities / unknown source ---------------------------
{
  const ids = ["pause", "run_now", "stop_current", "revise", "archive"];
  const busy = panel({ summary: mail, occurrences: occ, busy: true });
  check("busy: every control disabled", ids.every((a) => !enabled(busy, a)));
  check("busy: aria-busy", busy.includes('aria-busy="true"'));
  check("busy: wait answer disabled", !enabled(busy, "wait-answer") && !enabled(busy, "wait-choice"));
  const archived = panel({ summary: { ...news, status: "archived" }, occurrences: [] });
  check("archived: every control disabled", ids.every((a) => !enabled(archived, a)));
  const legacy = panel({ summary: { ...news, legacy: true, revision: null }, occurrences: [] });
  check("legacy: marker, no revision, controls disabled", legacy.includes("Legacy schedule") && !legacy.includes('data-fact="revision"') && ids.every((a) => !enabled(legacy, a)));
  const nocaps = panel({ summary: { ...jour, capabilities: ["resume"] }, occurrences: [] });
  check("capabilities gate: only resume", enabled(nocaps, "resume") && !enabled(nocaps, "run_now") && !enabled(nocaps, "archive"));
  const ended = panel({ summary: { ...news, status: "completed" }, occurrences: [] });
  check("completed: pause/run now disabled, archive enabled", !enabled(ended, "pause") && !enabled(ended, "run_now") && enabled(ended, "archive"));
  const gone = panel({ summary: news, occurrences: [], triggerSources: sources.filter((s) => s.id !== "schedule") });
  check("unknown trigger source is stated", gone.includes("does not list the trigger source schedule@1"));
  const off = panel({ summary: news, occurrences: [], triggerSources: sources.map((s) => (s.id === "schedule" ? { ...s, available: false, unavailable_reason: "entry point failed" } : s)) });
  check("unavailable trigger source is stated", off.includes("schedule@1 is unavailable: entry point failed"));
}

// --- error display: every code maps to a specific sentence --------------------------------
for (const e of fx("errors.json").items) {
  const d = e.body.detail;
  const err = kit.parseApiError(e.status, e.body);
  const text = kit.apiErrorText(err);
  check(`error text for ${d.reason_code} is specific`, text.title === kit.API_ERROR_TEXT[d.reason_code] && !text.title.includes(d.reason_code));
  const html = panel({ summary: news, occurrences: [], error: err });
  check(`error ${d.reason_code} shown as an alert`, html.includes(`role="alert" data-code="${d.reason_code}"`) && html.includes(esc(text.title)) && html.includes(esc(d.message)));
}
check("unknown code falls back to a generic sentence naming it", kit.apiErrorText({ status: 500, code: "boom", message: "m" }).title.includes("boom"));

// --- handlers: controls bar ----------------------------------------------------------------
{
  calls.length = 0;
  const cmds = [];
  let asked = 0, cancelled = 0, toggled = 0;
  const bar = (summary, extra = {}) =>
    AutomationControlsBar({ summary, occurrences: [], busy: false, confirmingArchive: false, reviseOpen: false, onCommand: (t) => cmds.push(t), onToggleRevise: () => toggled++, onAskArchive: () => asked++, onCancelArchive: () => cancelled++, ...extra });
  const j = bar(jour);
  byAction(j, "resume")[0].props.onClick();
  byAction(j, "run_now")[0].props.onClick();
  byAction(j, "revise")[0].props.onClick();
  byAction(j, "archive")[0].props.onClick();
  check("resume → automation.resume; run now → automation.run_now", eq(cmds, ["automation.resume", "automation.run_now"]), JSON.stringify(cmds));
  check("revise toggles the form; archive only ASKS (no command yet)", toggled === 1 && asked === 1 && cmds.length === 2);
  const confirm = bar(jour, { confirmingArchive: true });
  check("archive confirmation is in the page", byAction(confirm, "archive-confirm").length === 1 && renderToStaticMarkup(confirm).includes("Its history stays readable"));
  byAction(confirm, "archive-cancel")[0].props.onClick();
  check("Keep it cancels without a command", cancelled === 1 && cmds.length === 2);
  byAction(confirm, "archive-confirm")[0].props.onClick();
  check("confirm sends automation.archive", cmds.at(-1) === "automation.archive");
  byAction(bar(news), "pause")[0].props.onClick();
  check("pause → automation.pause", cmds.at(-1) === "automation.pause");
  byAction(bar(mail, { occurrences: occ }), "stop_current")[0].props.onClick();
  check("stop current → automation.stop_current", cmds.at(-1) === "automation.stop_current");
  check("no confirm box unless asked", byAction(bar(jour), "archive-confirm").length === 0);
}

// --- handlers: occurrence pair ------------------------------------------------------------
{
  const views = kit.occurrenceViews(occ);
  const got = [];
  const pair = (index, extra = {}) =>
    OccurrencePair({
      view: views.find((v) => v.row.index === index),
      busy: false,
      discussOpen: false,
      onOpenRun: (r) => got.push(["open", r]),
      onAnswerWait: (r, k, p) => got.push(["answer", r, k, p]),
      onDiscussOpen: (i) => got.push(["discuss-open", i]),
      onDiscussCancel: () => got.push(["discuss-cancel"]),
      onDiscussSubmit: (i, p) => got.push(["discuss", i, p]),
      ...extra,
    });
  const row7 = occ.find((o) => o.index === 7);
  const w = row7.waits[0];
  const p7 = pair(7);
  byAction(p7, "wait-choice")[0].props.onClick();
  check("choice → onAnswerWait(run, wait_key, {response: choice})", eq(got.at(-1), ["answer", row7.run_id, w.wait_key, { response: w.choices[0] }]));
  const form = find(p7, (n) => n.type === "form" && n.props["data-wait-key"] === w.wait_key)[0];
  const fakeSubmit = (value, name) => ({ preventDefault() {}, currentTarget: { elements: { namedItem: (k) => (k === name ? { value } : null) } } });
  form.props.onSubmit(fakeSubmit("  Tuesday is fine  ", "response"));
  check("free text → trimmed {response}", eq(got.at(-1), ["answer", row7.run_id, w.wait_key, { response: "Tuesday is fine" }]));
  const before = got.length;
  form.props.onSubmit(fakeSubmit("   ", "response"));
  check("blank answer sends nothing", got.length === before);
  const row2 = occ.find((o) => o.index === 2);
  byAction(pair(2), "open-run")[0].props.onClick();
  check("open run → onOpenRun(run_id)", eq(got.at(-1), ["open", row2.run_id]));
  byAction(pair(2), "discuss")[0].props.onClick();
  check("discuss → opens the form for #2", eq(got.at(-1), ["discuss-open", 2]));
  const open2 = pair(2, { discussOpen: true });
  const dform = find(open2, (n) => n.type === "form" && n.props.className === "af-auto-discuss")[0];
  dform.props.onSubmit(fakeSubmit("Draft the reply to Clara.", "prompt"));
  check("discuss submit → onDiscuss(2, prompt)", eq(got.at(-1), ["discuss", 2, "Draft the reply to Clara."]));
  const dhtml = renderToStaticMarkup(open2);
  check("discuss form says fork + read-only + never changes the automation", dhtml.includes("never changes the automation") && dhtml.includes("read-only") && dhtml.includes(`aria-label="${esc(DISCUSS_LABEL)}, from occurrence 2"`));
}

// --- revise -------------------------------------------------------------------------------
{
  const reviseRef = fx("commands.json").items.find((c) => c.request.method === "PATCH").request.body;
  const form = { title: news.title, every: "6h", context: "independent" };
  check("revise 8h → 6h == the commands.json PATCH changes", eq(kit.reviseChanges(news, form), reviseRef.changes), JSON.stringify(kit.reviseChanges(news, form)));
  check("revise: nothing changed → null", kit.reviseChanges(news, { title: news.title, every: "8h", context: "independent" }) === null);
  check("revise: title + context only", eq(kit.reviseChanges(mail, { title: "Inbox", every: "30m", context: "independent" }), { title: "Inbox", context: { mode: "independent" } }));
  check("revise: blank title rejected", eq(kit.reviseChanges(news, { title: " ", every: "8h", context: "independent" }), { errors: ["Title is required."] }));
  check("revise: bad interval rejected", "errors" in kit.reviseChanges(news, { title: news.title, every: "0h", context: "independent" }));
  const submitted = [];
  const f = AutomationReviseForm({ summary: news, busy: false, errors: [], onSubmit: (v) => submitted.push(v), onCancel() {} });
  const html = renderToStaticMarkup(f);
  check("revise form: title, interval, context fields labelled", html.includes('aria-label="Revise automation"') && html.includes('name="title"') && html.includes('aria-label="Interval amount"') && html.includes('<legend>Repeat every (UTC)</legend>') && html.includes('value="growing"'));
  const formEl = find(f, (n) => n.type === "form")[0];
  const vals = { title: "News (6h)", every_amount: "6", every_unit: "h", context: "growing" };
  formEl.props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: (k) => (k in vals ? { value: vals[k] } : null) } } });
  check("revise form reads its fields", eq(submitted[0], { title: "News (6h)", every: "6h", context: "growing" }), JSON.stringify(submitted[0]));
}

// --- attention ack: the last DISPLAYED item, never the summary's latest -----------------
{
  check("ack cursor for the inbox = last displayed item", kit.attentionAckCursor(mail) === "att1:2");
  check("nothing displayed → no ack", kit.attentionAckCursor(news) === null);
  const items = Array.from({ length: 20 }, (_, i) => ({ ...mail.attention.items[0], cursor: `att1:${i + 1}` }));
  const many = { ...mail, attention: { ...mail.attention, unseen_count: 25, cursor: "att1:25", items } };
  check("25 unseen, 20 shown → ack att1:20, not att1:25", kit.attentionAckCursor(many) === "att1:20");
}

// --- labels: fixed intervals, UTC, never calendar wording ---------------------------------
{
  const L = kit.scheduleLabel;
  check("label 24h", L({ every: "24h" }) === "every 24 hours (UTC)");
  check("label 1h", L({ every: "1h" }) === "every hour (UTC)");
  check("label 5m", L({ every: "5m" }) === "every 5 minutes (UTC)");
  check("label 7d", L({ every: "7d" }) === "every 7 days (UTC)");
  check("label once", L({ start_at: "2026-09-28T08:00:00Z" }) === "once at 2026-09-28 08:00 UTC");
  check("label until", L({ every: "2m", until: "2026-09-28T00:00:00Z" }) === "every 2 minutes (UTC) · until 2026-09-28 00:00 UTC");
  check("manual trigger summary", kit.triggerSummary({ source_id: "manual", source_version: 1, config: {} }) === "manual runs only");
  const all = [mailHtml, panel({ summary: news }), panel({ summary: jour })].join("");
  check("no calendar/local wording anywhere", !/daily|local time| local\b|o'clock/i.test(all));
}

// --- create request (AfScheduleDialog's builder) -------------------------------------------
{
  const target = { flow_id: "@default", interface: "abstractcode.agent.v1" };
  const r = kit.buildCreateRequest({ prompt: "Check ACME share price\nNotify if it moved 2%.", when: { kind: "every", amount: 5, unit: "m" }, context: "independent" }, { target, requestId: "req-1" });
  check("every 5 minutes, first run now", r.ok && eq(r.body, { request_id: "req-1", title: "Check ACME share price", target: { flow_id: "@default", interface: "abstractcode.agent.v1", input_data: { prompt: "Check ACME share price\nNotify if it moved 2%." } }, trigger: { source_id: "schedule", source_version: 1, config: { every: "5m" } }, context: { mode: "independent" } }), JSON.stringify(r));
  const g = kit.buildCreateRequest({ prompt: "Triage", when: { kind: "every", amount: 30, unit: "m" }, context: "growing", title: "Inbox triage", startAt: "2026-09-27T04:00", count: 48, until: "2026-09-28T04:00" }, { target: { bundle_ref: "inbox@1.0.0", flow_id: "main", input_data: { folder: "INBOX" } }, requestId: "req-2" });
  check("advanced: start/count/until as UTC, input_data merged", g.ok && eq(g.body.trigger.config, { every: "30m", start_at: "2026-09-27T04:00:00Z", count: 48, until: "2026-09-28T04:00:00Z" }) && eq(g.body.target.input_data, { folder: "INBOX", prompt: "Triage" }) && g.body.context.mode === "growing" && g.body.title === "Inbox triage");
  const once = kit.buildCreateRequest({ prompt: "Ping", when: { kind: "once", at: "2026-09-28T08:00" }, context: "independent" }, { target, requestId: "r" });
  check("once at → start_at only (no every)", once.ok && eq(once.body.trigger.config, { start_at: "2026-09-28T08:00:00Z" }));
  const bad = kit.buildCreateRequest({ prompt: " ", when: { kind: "once", at: "" }, context: "independent" }, { target: null, requestId: "r" });
  check("missing target/prompt/time → reasons, no body", !bad.ok && bad.errors.length === 3, JSON.stringify(bad));
  check("no tz field ever", !JSON.stringify([r, g, once]).includes("tz"));
}

// --- AfScheduleDialog render -----------------------------------------------------------------
{
  const dlg = (p) => renderToStaticMarkup(React.createElement(AfScheduleDialog, { open: true, onClose() {}, target: null, onSubmit() {}, newRequestId: () => "rid", ...p }));
  const html = dlg({ initialPrompt: "Monitor memory usage", workflowPicker: React.createElement("div", { id: "host-picker" }, "picker") });
  check("dialog: modal, labelled", html.includes('role="dialog" aria-modal="true" aria-labelledby=') && html.includes(">Schedule a task<"));
  check("dialog: What with host picker slot + prompt", html.includes("<legend>What</legend>") && html.includes('id="host-picker"') && html.includes(">Monitor memory usage</textarea>") && html.includes("Choose what to run."));
  check("dialog: When (UTC) presets incl. every 24 hours", html.includes("<legend>When (UTC)</legend>") && ["every 5 minutes", "every 30 minutes", "every hour", "every 8 hours", "every 24 hours", "every 7 days"].every((l) => html.includes(`>${l}</button>`)));
  check("dialog: default preview every 24 hours (UTC), first run now", html.includes("Runs every 24 hours (UTC), first run now."));
  check("dialog: once-at option", html.includes("Once at…"));
  check("dialog: context Independent/Growing", /<input type="radio" name="[^"]+" checked="" value="independent"\/>/.test(html) && /<input type="radio" name="[^"]+" value="growing"\/>/.test(html));
  check("dialog: Advanced disclosure with title", html.includes("<summary>Advanced</summary>") && html.includes("Defaults to the task&#x27;s first line"));
  check("dialog: no calendar/local wording", !/daily|local time| local\b/i.test(html));
  const err = dlg({ error: kit.parseApiError(422, fx("errors.json").items.find((e) => e.body.detail.reason_code === "invalid_definition").body) });
  check("dialog: shows an API error", err.includes('data-code="invalid_definition"'));
  check("dialog closed renders nothing", renderToStaticMarkup(React.createElement(AfScheduleDialog, { open: false, onClose() {}, target: null, onSubmit() {} })) === "");
}

// --- CSS ships in theme.css ------------------------------------------------------------------
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
for (const cls of [".af-auto", ".af-auto-occ--quiet", ".af-auto-occ--failed", ".af-auto-occ--waiting", ".af-auto-occ--notified", ".af-auto-turn--trigger", ".af-auto__confirm", ".af-auto-wait", ".af-schedule"]) {
  check(`css ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls},`));
}

if (failures) {
  console.error(`check_automation_panel: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_panel: OK (${checks} checks)`);
