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
import assert from "node:assert/strict";
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
const byTitle = Object.fromEntries(list.map((s) => [s.title, s]));
const news = byTitle["AI news monitor"], mail = byTitle["Inbox triage"], jour = byTitle["Weekly journal monitor"];
const legacyRow = list.find((s) => s.legacy);
const occ = fx("occurrences.json").items;
const sources = fx("trigger-sources.json").items;
const calls = [];
const rec = (name) => (...args) => {
  calls.push([name, ...args]);
  return Promise.resolve(name === "onDiscuss" ? { session_id: "s", run_id: "r" } : name === "onSeen" || name === "onAnswerWait" ? undefined : { command_id: "c", accepted: true, duplicate: false, seq: 1 });
};
const handlers = { onRevise: rec("onRevise"), onCommand: rec("onCommand"), onDiscuss: rec("onDiscuss"), onSeen: rec("onSeen"), onLoadMore: rec("onLoadMore"), onOpenRun: rec("onOpenRun"), onAnswerWait: rec("onAnswerWait") };
const NOW = Date.parse("2026-09-27T06:35:00Z");
const panel = (props) => renderToStaticMarkup(React.createElement(AutomationPanel, { triggerSources: sources, occurrences: [], busy: false, nowMs: NOW, ...handlers, ...props }));

// Tiny element-tree helpers for the hook-free pieces.
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node !== "object") return;
  if (node.type === AutomationReviseForm || node.type === kit.AfModal) {
    visit(node);
    return walk(harness(node.type).render(node.props), visit);
  }
  if (node.type?.name === "VisibleContentMarker") return visit(node);
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
// The Edit form's own element tree (function components left unrendered: their props are asserted).
const shallowAll = (node, pred, out = []) => {
  if (Array.isArray(node)) { for (const n of node) shallowAll(n, pred, out); return out; }
  if (!node || typeof node !== "object" || !node.props) return out;
  if (pred(node)) out.push(node);
  shallowAll(node.props.children, pred, out);
  return out;
};
// Drives one Edit form under the hook harness: its state persists across renders.
function editHarness(props) {
  const h = harness(AutomationReviseForm, false);
  let tree = h.render(props);
  const api = {
    get tree() { return tree; },
    rerender(next) { if (next) props = { ...props, ...next }; tree = h.render(props); return tree; },
    el: (pred) => shallowAll(tree, pred)[0],
    all: (pred) => shallowAll(tree, pred),
    type(name, value) { api.el((n) => n.props.name === name).props.onChange({ target: { value } }); api.rerender(); },
    action: (a) => api.el((n) => n.props["data-action"] === a),
    form: () => api.el((n) => n.type === "form"),
    save() { api.form().props.onSubmit({ preventDefault() {} }); api.rerender(); },
  };
  return api;
}
const button = (html, action) => {
  const m = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`).exec(html);
  return m ? m[0] : null;
};
// The "Active" state toggle (operator 2026-09-30): aria-pressed, aria-disabled when unavailable.
const toggle = (html) => button(html, "active");
// One chip of the header's row (spec G): its text and its tooltip (the whole fact), or null.
const chip = (html, fact) => {
  const m = new RegExp(`<li class="af-auto__chip" data-fact="${fact}">([\\s\\S]*?)</li>`).exec(html);
  if (!m) return null;
  return { text: m[1].replace(/<[^>]+>/g, ""), title: (/title="([^"]*)"/.exec(m[1]) || [])[1] ?? "", tone: (/af-chip--(neutral|warning|error|success|info|accent|muted)/.exec(m[1]) || [])[1] ?? "", html: m[1] };
};
const toggleOn = (html) => /role="switch"[^>]*aria-checked="true"/.test(toggle(html) || "");
const toggleAvailable = (html) => toggle(html) !== null && !/aria-disabled="true"/.test(toggle(html));
const noVerbPair = (html) => button(html, "pause") === null && button(html, "resume") === null;
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
  check("#2 badged Notified with its notify title + artifact (a plain name: no host opener given)", chunks[1].includes("af-auto-badge--notified\">Notified<") && chunks[1].includes("<strong>2 urgent emails</strong>") && chunks[1].includes('<span class="af-auto-artifact__name">triage-2026-09-27.md</span>'));
  check("no server-supplied gateway URL is ever an href (ledger, artifact, workspace)", !/href="\/api\//.test(mailHtml) && !mailHtml.includes('data-action="open-ledger-json"'));
  check("#3 says completed after 2 attempts", chunks[2].includes("completed after 2 attempts"));
  check("#4 is the manual run (decided summary wording)", chunks[3].includes(esc(occ.find((o) => o.index === 4).trigger.summary)) && /manual: run now \([0-9a-f-]{36}\)/.test(chunks[3]) && chunks[3].includes("[Trigger manual@1 · occurrence 4"));
  check("scheduled pairs show the decided summary wording", chunks[0].includes("schedule: Every 30 minutes (UTC), tick 0") && chunks[6].includes("schedule: Every 30 minutes (UTC), tick 5"));
  check("#5 badged Failed after 3 attempts", chunks[4].includes(">Failed after 3 attempts<"));
  const f5 = occ.find((o) => o.index === 5).failure;
  // The reason in words, never the reason code (operator 2026-10-29); the code stays a data attribute.
  check("#5 renders its failure: the reason in words, message, after N attempts", chunks[4].includes(`<div class="af-auto-failure" data-failure="${f5.reason_code}"><strong>${esc(kit.failureReasonWords(f5.reason_code))}</strong>: ${esc(f5.message)}`) && chunks[4].includes(`(after ${f5.attempts} attempts)`) && !chunks[4].includes(`<strong>${f5.reason_code}</strong>`));
  check("failure words: known and unknown codes", kit.failureReasonWords("occurrence_failed") === "The run failed" && kit.failureReasonWords("timed_out") === "The run timed out" && kit.failureReasonWords("quota_exceeded") === "Quota exceeded" && kit.failureReasonWords("") === "The run failed");
  check("failure block only on the failed pair", chunks.filter((c, i) => i !== 4).every((c) => !c.includes("af-auto-failure")));
  const noFailure = panel({ summary: mail, occurrences: occ.map((o) => { const { failure, ...rest } = o; return rest; }) });
  check("a failed row without `failure` still says it failed", noFailure.includes("No answer: the run failed.") && !noFailure.includes("af-auto-failure"));
  const w = occ.find((o) => o.index === 7).waits.find((x) => x.kind === "ask_user");
  const tw = occ.find((o) => o.index === 7).waits.find((x) => x.kind === "tool_approval");
  check("#7 badged Waiting for you", chunks[6].includes(">Waiting for you<"));
  check("#7 wait prompt rendered", chunks[6].includes(esc(w.prompt)));
  check("#7 one button per choice", w.choices.every((c) => chunks[6].includes(`data-action="wait-choice">${esc(c)}</button>`)));
  check("#7 free-text answer control, labelled", chunks[6].includes('aria-label="Your answer"') && chunks[6].includes('data-action="wait-answer"'));
  check("ask_user wait form labelled by its prompt", chunks[6].includes(`<form class="af-auto-wait af-auto-wait--ask_user" data-wait-key="${w.wait_key}" data-wait-kind="ask_user" aria-labelledby="`));
  // The call in words (operator QA 2026-10-29): its sentence, its tool on the chip's tooltip, no JSON.
  const twWords = kit.describeToolCall(tw.details[0]);
  // Operator ruling 2026-10-29: the bold first line labels the group (the card's only bold), each call one bullet in words, no JSON.
  check("tool_approval wait: bold first line labels the group, tool call listed in words", chunks[6].includes('data-wait-kind="tool_approval"') && /<div class="af-auto-wait af-auto-wait--tool_approval"[^>]*aria-labelledby="([^"]+)"[\s\S]*?<p class="af-toolwords__heading" id="\1"><strong>/.test(chunks[6]) && chunks[6].includes(`data-tool="${tw.details[0].name}"`) && chunks[6].includes(`title="${tw.details[0].name}">${esc(twWords.verb)}</span>`) && !chunks[6].includes(esc(JSON.stringify(tw.details[0].arguments, null, 2))), twWords.sentence);
  check("tool_approval wait: Approve and Deny, no free text", enabled(chunks[6], "wait-approve") && enabled(chunks[6], "wait-deny") && (chunks[6].match(/aria-label="Your answer"/g) || []).length === 1);
  check("no wait controls on other occurrences", chunks.filter((c, i) => i !== 6).every((c) => !c.includes("af-auto-wait")));
  check("every pair has expandable run details with Open run ledger (and no raw ledger href)", chunks.every((c) => c.includes("<details class=\"af-auto-occ__details\"><summary>Run details</summary>") && c.includes('data-action="open-run"') && !/href="\/api\//.test(c)));
  check("Discuss labelled in plain words (the fork's details are its hint)", mailHtml.includes(`<span>${esc(DISCUSS_LABEL)}</span></button>`) && DISCUSS_LABEL === "Discuss this run");
  check("no stale 'read-only workspace' wording", !mailHtml.includes("read-only workspace") && !mailHtml.includes("forked session"));
  check("Discuss disabled on the waiting occurrence only", chunks.every((c, i) => (/data-action="discuss" disabled=""/.test(c)) === (i === 6)));
  check("header: the served rule (Every 30 minutes (UTC)), builds on earlier runs, next run relative with the full date in its tooltip", chip(mailHtml, "trigger")?.text === "Every 30 minutes (UTC)" && chip(mailHtml, "context")?.text === "Builds on earlier runs" && chip(mailHtml, "next")?.text === "Next in 25 min" && chip(mailHtml, "next")?.title === "Next run: 2026-09-27 09:00 Europe/Paris (in 25 min)", JSON.stringify([chip(mailHtml, "trigger"), chip(mailHtml, "next")]));
  // Operator 2026-11-27: the header shows the parameters; runs and attention are not parameters (the
  // unread count is the list's).
  check("header: no attention chip and no runs chip (not parameters)", chip(mailHtml, "attention") === null && chip(mailHtml, "count") === null, JSON.stringify(chip(mailHtml, "attention")));
  check("header: one header, no fold, no labelled rows (spec G)", !/<header class="af-auto__head">[\s\S]*?<details/.test(mailHtml.split("</header>")[0] + "</header>") && !mailHtml.includes("<dt>Attention</dt>") && !mailHtml.includes("<dt>Runs</dt>") && !mailHtml.includes("<dt>Context</dt>") && !mailHtml.includes("<dt>Now</dt>"));
  check("attention strip lists both items oldest first", mailHtml.indexOf('data-cursor="att1:1"') > 0 && mailHtml.indexOf('data-cursor="att1:2"') > mailHtml.indexOf('data-cursor="att1:1"'));
  check("attention strip lists the pending wait", mailHtml.includes("af-auto__attention-item--wait"));
  check("controls: Active toggle pressed and available; run now disabled while an occurrence waits; stop current enabled", toggleOn(mailHtml) && toggleAvailable(mailHtml) && !enabled(mailHtml, "run_now") && enabled(mailHtml, "stop_current"));
  check("controls: no Pause/Resume verb buttons, the toggle is labelled Active", noVerbPair(mailHtml) && /data-action="active"[^>]*>.*?<span class="af-switch__label">Active<\/span><\/span><\/button>/.test(mailHtml));
  check("controls: labelled toolbar", mailHtml.includes('role="toolbar" aria-label="Automation controls"'));
  check("section labelled by the title, aria-busy false", /<section class="af-auto" aria-labelledby="([^"]+)" aria-busy="false" data-text-rendering="unformatted">/.test(mailHtml) && /<h2 class="af-auto__title" id="[^"]+" tabindex="-1" title="Inbox triage">Inbox triage<\/h2>/.test(mailHtml));
  check("all occurrences loaded → no load-more", button(mailHtml, "load-more") === null);
}

// --- News monitor: every 8 hours, load more ---------------------------------------------
{
  const html = panel({ summary: news, occurrences: [] });
  check("news: the served rule Every 8 hours (UTC)", chip(html, "trigger")?.text === "Every 8 hours (UTC)" && chip(html, "trigger")?.title === "When it runs: Every 8 hours (UTC)");
  check("news: starts fresh", chip(html, "context")?.text === "Starts fresh" && chip(html, "context")?.title === "Each run starts fresh.");
  check("news: next run (relative from next_run_at; the served next_run_local cut in the tooltip)", chip(html, "next")?.text === "Next in 1 h 25 min" && chip(html, "next")?.title === "Next run: 2026-09-27 10:00 Europe/Paris (in 1 h 25 min)", JSON.stringify(chip(html, "next")));
  // R16.1 A4: the header shows the SERVED next run: a changed gateway value changes the display, and
  // next_fire_at alone (no served next_run_*) shows nothing scheduled.
  check("news: a different served next_run_local/at changes the Next run chip", chip(panel({ summary: { ...news, next_run_local: "2026-09-27T11:30:00+02:00", next_run_at: "2026-09-27T09:30:00+00:00" } }), "next")?.title === "Next run: 2026-09-27 11:30 Europe/Paris (in 2 h 55 min)");
  check("news: next_fire_at without the served fields = no Next run chip (never computed)", chip(panel({ summary: { ...news, next_run_local: undefined, next_run_at: undefined } }), "next") === null);
  check("news: nothing in flight → no 'Now' fact", !html.includes('data-fact="current"'));
  // UX review 2026-10-25 #4: no folder path, revision or workflow id in the header (they are under Details).
  check("news: no folder path, revision or target id in the header without onOpenWorkspace", !html.includes('data-fact="workspace"') && !html.includes(news.workspace_root) && !html.includes('data-fact="revision"') && !html.includes('data-fact="workflow"') && button(html, "open-workspace") === null);
  const wpath = renderToStaticMarkup(React.createElement(parts.WrappingPath, { path: news.workspace_root }));
  check("WrappingPath: the path wraps at its separators (<wbr> after each /), text unchanged", wpath.includes("/<wbr/>") && wpath.includes("-<wbr/>") && wpath.replace(/<[^>]+>/g, "") === news.workspace_root);
  check("news: the flow's name when the host gives it (Flow), never the target id", chip(panel({ summary: news, workflowName: "Release digest" }), "workflow")?.text === "Release digest");
  check("news: attention quiet = no attention chip", chip(html, "attention") === null && !html.includes("af-auto__attention\""));
  check("news: no runs chip (the runs count is not a parameter)", chip(html, "count") === null, JSON.stringify(chip(html, "count")));
  check("news: Active switch on and available, ONE Run now button (no Stop while nothing runs)", toggleOn(html) && toggleAvailable(html) && enabled(html, "run_now") && button(html, "stop_current") === null);
  check("news: load more (6 more)", enabled(html, "load-more") && html.includes("Load earlier runs (6 more)"));
  check("news: no runs text", html.includes("No runs yet."));
}

// --- current_occurrence / next_fire_at (runtime 64ee72a) --------------------------------------
{
  check("mail: a run in flight (current_occurrence) → the ONE button is Stop", enabled(mailHtml, "stop_current") && button(mailHtml, "run_now") === null && !mailHtml.includes('data-fact="current"'));
  check("mail: next run shown WHILE an occurrence runs (active + scheduled)", chip(mailHtml, "next")?.title === "Next run: 2026-09-27 09:00 Europe/Paris (in 25 min)");
  // Never inferred from last_occurrence: a waiting last occurrence with current_occurrence null shows nothing in flight.
  const stale = panel({ summary: { ...mail, current_occurrence: null }, occurrences: [] });
  check("no 'Now' when current_occurrence is null, even if last_occurrence is waiting", mail.last_occurrence.status === "waiting" && !stale.includes('data-fact="current"'));
  check("controls follow current_occurrence, not last_occurrence (run now on, stop off)", enabled(stale, "run_now") && !enabled(stale, "stop_current"));
  const flying = panel({ summary: { ...news, current_occurrence: { index: 7, run_id: news.last_occurrence.run_id, attempt: 2, status: "backoff" } }, occurrences: [] });
  check("in-flight occurrence on a row whose last occurrence is completed → Stop enabled, no Run now", enabled(flying, "stop_current") && button(flying, "run_now") === null);
  const L = kit.currentOccurrenceLabel;
  check("labels: running / starting / attempt / none", L(mail) === "Run #7 running" && L({ current_occurrence: { index: 3, run_id: "r", attempt: 1, status: "admitted" } }) === "Run #3 starting" && L({ current_occurrence: { index: 3, run_id: "r", attempt: 2, status: "running" } }) === "Run #3 running (attempt 2)" && L(news) === null && L({}) === null);
  const R = kit.relativeIn;
  check("relativeIn: min / h / d / due", R("2026-09-27T06:36:00Z", NOW) === "in 1 min" && R("2026-09-27T09:35:00Z", NOW) === "in 3 h" && R("2026-09-29T08:35:00Z", NOW) === "in 2 d 2 h" && R("2026-09-27T06:00:00Z", NOW) === "due now");
  check("paused: no Next run chip, no Now", jour.current_occurrence === null && chip(panel({ summary: jour }), "next") === null);
}

// --- Journal (paused): run now while paused ------------------------------------------
{
  const html = panel({ summary: jour, occurrences: [] });
  check("journal: the served rule with its bounds, verbatim", chip(html, "trigger")?.text === esc(jour.schedule_rule_text) && jour.schedule_rule_text.includes("12 runs max"));
  check("journal: Active toggle plain (paused) and available; no Pause/Resume buttons", !toggleOn(html) && toggleAvailable(html) && noVerbPair(html) && /data-action="active"[^>]*aria-checked="false"/.test(html));
  check("journal: RUN NOW ENABLED WHILE PAUSED", enabled(html, "run_now"));
  check("journal: no paused hint line (spec G: only reasons a person can act on); Run now's tooltip says it", !html.includes("Run now works and keeps it paused.") && (button(html, "run_now") || "").includes("title="));
  check("journal: no Next run chip while paused", chip(html, "next") === null);
  check("journal: status chip reads the word Paused then the pause icon", html.includes('af-auto__status--paused" data-state="paused"><span class="af-auto__status-word">Paused</span><svg'));
  check("journal: edit + archive enabled", enabled(html, "edit") && enabled(html, "archive"));
}

// --- busy / archived / legacy / capabilities / unknown source ---------------------------
{
  const ids = ["run_now", "stop_current", "edit", "archive"];
  const busy = panel({ summary: mail, occurrences: occ, busy: true });
  check("busy: every control disabled", ids.every((a) => !enabled(busy, a)) && !toggleAvailable(busy) && toggleOn(busy));
  check("busy: aria-busy", busy.includes('aria-busy="true"'));
  check("busy: wait answer disabled", !enabled(busy, "wait-answer") && !enabled(busy, "wait-choice"));
  const archived = panel({ summary: { ...news, status: "archived" }, occurrences: [] });
  check("archived: every control disabled", ids.every((a) => !enabled(archived, a)) && !toggleAvailable(archived));
  const legacy = panel({ summary: { ...news, legacy: true, revision: null }, occurrences: [] });
  check("legacy: marker, no revision, controls disabled", legacy.includes("Legacy schedule") && !legacy.includes('data-fact="revision"') && ids.every((a) => !enabled(legacy, a)) && !toggleAvailable(legacy));
  const nocaps = panel({ summary: { ...jour, capabilities: ["resume"] }, occurrences: [] });
  check("capabilities gate: only resume -> the paused toggle is available", toggleAvailable(nocaps) && !toggleOn(nocaps) && !enabled(nocaps, "run_now") && !enabled(nocaps, "archive"));
  const nopause = panel({ summary: { ...news, capabilities: ["resume", "run_now"] }, occurrences: [] });
  check("capabilities gate: active without pause -> toggle unavailable, reason named", !toggleAvailable(nopause) && toggleOn(nopause) && /Active[^:<]*: Not permitted for this automation\./.test(nopause));
  const ended = panel({ summary: { ...news, status: "completed" }, occurrences: [] });
  check("completed: toggle unavailable (reason), run now disabled, archive enabled", !toggleAvailable(ended) && !toggleOn(ended) && ended.includes("The automation has ended.") && !enabled(ended, "run_now") && enabled(ended, "archive"));
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
  const ev = { preventDefault() {} };
  byAction(j, "active")[0].props.onClick(ev);
  byAction(j, "run_now")[0].props.onClick();
  byAction(j, "edit")[0].props.onClick();
  byAction(j, "archive")[0].props.onClick();
  check("Active toggle on a paused automation → automation.resume; run now → automation.run_now", eq(cmds, ["automation.resume", "automation.run_now"]), JSON.stringify(cmds));
  check("Edit toggles the form; archive only ASKS (no command yet)", toggled === 1 && asked === 1 && cmds.length === 2);
  const confirm = bar(jour, { confirmingArchive: true });
  check("archive confirmation is in the page", byAction(confirm, "archive-confirm").length === 1 && renderToStaticMarkup(confirm).includes("Its history stays readable"));
  byAction(confirm, "archive-cancel")[0].props.onClick();
  check("Keep it cancels without a command", cancelled === 1 && cmds.length === 2);
  byAction(confirm, "archive-confirm")[0].props.onClick();
  check("confirm sends automation.archive", cmds.at(-1) === "automation.archive");
  byAction(bar(news), "active")[0].props.onClick(ev);
  check("Active toggle on an active automation → automation.pause", cmds.at(-1) === "automation.pause");
  const before = cmds.length;
  byAction(bar({ ...news, status: "completed" }), "active")[0].props.onClick(ev);
  byAction(bar(news, { busy: true }), "active")[0].props.onClick(ev);
  check("Active toggle sends nothing while unavailable or busy", cmds.length === before);
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
      discuss: { enabled: true },
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
  check("discuss form help text is the exact shared sentence (file-tools-only mount; shell not sandboxed)", dhtml.includes(esc("Starts a new conversation from run #2 with the automation's whole history (runs 1–2). It works in its own folder; the automation's files can be read but not changed (by the file tools; shell commands are not sandboxed), and nothing is written back into the automation.")) && dhtml.includes(`aria-label="${esc(DISCUSS_LABEL)}, from run 2"`), dhtml.slice(0, 400));
}

// --- state label: WORD then ICON, one rendering for every client (operator 2026-09-28) --------
{
  const { AutomationStateLabel, STATUS_LABELS, STATUS_ICONS, Icon } = kit;
  check("exports STATUS_LABELS / STATUS_ICONS / AutomationStateLabel", typeof AutomationStateLabel === "function" && STATUS_LABELS && STATUS_ICONS);
  const want = { active: ["Active", "play"], paused: ["Paused", "pause"], completed: ["Completed", "check"], failed: ["Failed", "error"], archived: ["Archived", "archive"] };
  for (const [status, [word, icon]] of Object.entries(want)) {
    const html = renderToStaticMarkup(React.createElement(AutomationStateLabel, { status }));
    const iconHtml = renderToStaticMarkup(React.createElement(Icon, { name: icon, size: 11, className: "af-auto__status-icon" }));
    check(`state ${status}: "${word}" then the ${icon} icon`, STATUS_LABELS[status] === word && STATUS_ICONS[status] === icon && html === `<span class="af-auto__status af-auto__status--${status}" data-state="${status}"><span class="af-auto__status-word">${word}</span>${iconHtml}</span>`, html);
  }
  const odd = renderToStaticMarkup(React.createElement(AutomationStateLabel, { status: "hibernating" }));
  check("unknown state: raw word, no icon", odd.includes(">hibernating</span></span>") && !odd.includes("<svg"));
  check("panel header uses the label (Active + play icon)", mailHtml.includes('<span class="af-auto__status-word">Active</span><svg'));
}

// --- kit icons added for automations: drawn, distinct, 24-grid -------------------------------
{
  const names = ["play", "stop", "folder", "file", "archive", "clock"];
  const svgs = names.map((name) => renderToStaticMarkup(React.createElement(kit.Icon, { name })));
  svgs.forEach((svg, i) => check(`icon ${names[i]} draws on the 24-grid`, /<(path|rect|circle)\b/.test(svg) && svg.includes('viewBox="0 0 24 24"'), svg));
  check("new icons are distinct from each other and from pause/history", new Set([...svgs, ...["pause", "history"].map((name) => renderToStaticMarkup(React.createElement(kit.Icon, { name })))]).size === names.length + 2);
}

// --- onOpenWorkspace: the folder controls (never a bare JSON link) ---------------------------------
{
  const opened = [];
  const hdr = AutomationHeader({ summary: news, triggerSources: sources, nowMs: NOW, onOpenWorkspace: (id) => opened.push(id) });
  const hbtn = byAction(hdr, "open-workspace");
  check("header: the Files chip is a button with a folder icon (no path in the person's view)", hbtn.length === 1 && find(hbtn[0], (n) => n.type === "svg").length === 1 && hbtn[0].props["aria-label"] === "Browse the automation's files" && !String(hbtn[0].props.title).includes(news.workspace_root));
  hbtn[0].props.onClick();
  check("header folder → onOpenWorkspace(automation_id)", eq(opened, [news.automation_id]));
  const views = kit.occurrenceViews(occ);
  const row2 = occ.find((o) => o.index === 2);
  const mk = (extra) =>
    OccurrencePair({ view: views.find((v) => v.row.index === 2), busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, ...extra });
  const bare = renderToStaticMarkup(mk({}));
  check("run details: no workspace control without onOpenWorkspace, and no bare JSON link", row2.workspace_url && !bare.includes('data-action="open-workspace"') && !bare.includes(`href="${row2.workspace_url}"`));
  const withWs = mk({ onOpenWorkspace: (id) => opened.push(id) });
  const rbtn = byAction(withWs, "open-workspace");
  check("run details: Workspace button with a folder icon", rbtn.length === 1 && find(rbtn[0], (n) => n.type === "svg").length === 1);
  rbtn[0].props.onClick();
  check("run Workspace → onOpenWorkspace(occurrence run_id)", eq(opened.at(-1), row2.run_id));
  const noUrl = views.find((v) => v.row.index === 2);
  const noUrlPair = OccurrencePair({ view: { ...noUrl, row: { ...noUrl.row, workspace_url: null } }, busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, onOpenWorkspace() {} });
  check("run details: no Workspace button when the gateway reports none", byAction(noUrlPair, "open-workspace").length === 0);
  const full = panel({ summary: mail, occurrences: occ, onOpenWorkspace() {} });
  check("panel threads onOpenWorkspace to the header and every run with a workspace", (full.match(/data-action="open-workspace"/g) || []).length === 1 + occ.filter((o) => o.workspace_url).length);
}

// --- onOpenResource: gateway files open through the host, never as raw hrefs ------------------
{
  const opened = [];
  const views = kit.occurrenceViews(occ);
  const row2 = occ.find((o) => o.index === 2);
  const art = row2.artifacts[0];
  const mk = (extra) =>
    OccurrencePair({ view: views.find((v) => v.row.index === 2), busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, ...extra });
  const bare = renderToStaticMarkup(mk({}));
  check("without onOpenResource: artifact is a plain name, no ledger JSON link, no href", bare.includes(`<span class="af-auto-artifact__name">${art.name}</span>`) && !bare.includes("open-ledger-json") && !bare.includes("open-artifact") && !/<a [^>]*href=/.test(bare));
  const tree = mk({ onOpenResource: (r) => opened.push(r) });
  const html = renderToStaticMarkup(tree);
  check("with onOpenResource: buttons, still no href", byAction(tree, "open-artifact").length === 1 && byAction(tree, "open-ledger-json").length === 1 && !/<a [^>]*href=/.test(html));
  byAction(tree, "open-artifact")[0].props.onClick();
  byAction(tree, "open-ledger-json")[0].props.onClick();
  check("artifact → onOpenResource(the server's url, name, type, run)", eq(opened[0], { kind: "artifact", url: art.url, name: art.name, mimeType: art.mime_type, runId: row2.run_id }), JSON.stringify(opened[0]));
  check("ledger → onOpenResource(the server's ledger_url, a file name)", eq(opened[1], { kind: "ledger", url: row2.ledger_url, name: `run-${row2.run_id}-ledger.json`, runId: row2.run_id }), JSON.stringify(opened[1]));
  const full = panel({ summary: mail, occurrences: occ, onOpenResource() {} });
  check("panel threads onOpenResource to every run (one ledger button each) and every artifact", (full.match(/data-action="open-ledger-json"/g) || []).length === occ.length && (full.match(/data-action="open-artifact"/g) || []).length === occ.reduce((n, o) => n + o.artifacts.length, 0) && !/href="\/api\//.test(full));
}

// --- renderTurn: occurrence turns through the host's chat card ---------------------------------
{
  const turns = [];
  const renderTurn = (t) => {
    turns.push(t);
    return React.createElement("article", { className: "stub-card", "data-role": t.role, "data-kind": t.kind }, t.text.slice(0, 12));
  };
  const views = kit.occurrenceViews(occ);
  const row2 = occ.find((o) => o.index === 2);
  const html = renderToStaticMarkup(OccurrencePair({ view: views.find((v) => v.row.index === 2), busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, renderTurn, renderText: () => React.createElement("i", null, "TEXT") }));
  check("renderTurn gets the trigger turn (user) then the answer turn (assistant)", eq(turns, [
    { kind: "trigger", role: "user", text: row2.user_turn, index: 2, runId: row2.run_id },
    { kind: "answer", role: "assistant", text: row2.answer, index: 2, runId: row2.run_id },
  ]), JSON.stringify(turns));
  check("turn cards replace the text renderer; meta line kept; card class set", (html.match(/af-auto-turn__text"><article class="stub-card"/g) || []).length === 2 && !html.includes('af-auto-turn__text"><i>TEXT</i>') && html.includes('class="af-auto-turn af-auto-turn--trigger af-auto-turn--card" data-turn="trigger"><div class="af-auto-turn__meta"'));
  const plain = renderToStaticMarkup(OccurrencePair({ view: views.find((v) => v.row.index === 2), busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, renderText: () => React.createElement("i", null, "TEXT") }));
  check("without renderTurn: text renderer, no card class", (plain.match(/af-auto-turn__text"><i>TEXT<\/i>/g) || []).length === 2 && !plain.includes("af-auto-turn--card"));
  turns.length = 0;
  const full = panel({ summary: mail, occurrences: occ, renderTurn });
  check("panel threads renderTurn to every occurrence (one trigger turn each, one answer turn per answer)", turns.filter((t) => t.kind === "trigger").length === occ.length && turns.filter((t) => t.kind === "answer").length === occ.filter((o) => o.answer).length && full.includes("stub-card"));
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
  const f = React.createElement(AutomationReviseForm, { summary: news, busy: false, errors: [], onSubmit: (v) => submitted.push(v), onCancel() {}, previewSchedule: async () => ({}) });
  const html = renderToStaticMarkup(f);
  check("edit form: headed Edit automation; title, interval, memory labelled; no (UTC) label", /<form class="af-auto__revise" data-presentation="inline" aria-labelledby="([^"]+)"[^>]*><h3 class="af-auto__form-title" id="\1"><svg[^]*<\/svg> Edit automation<\/h3>/.test(html) && html.includes('name="title"') && html.includes('aria-label="Interval amount"') && html.includes('data-action="memory"') && html.includes(">Builds on earlier runs<") && !html.includes("Repeat every (UTC)"));
  // The form is controlled: type, switch, save (the values it hands over are what reviseChanges sends).
  const ed = editHarness({ summary: news, busy: false, errors: [], onSubmit: (v) => submitted.push(v), onCancel() {}, previewSchedule: async () => ({}) });
  ed.type("title", "News (6h)");
  ed.el((n) => n.type === kit.AfEveryFields).props.onAmount("6");
  ed.rerender();
  ed.el((n) => n.props.action === "memory").props.onChange(true);
  ed.rerender();
  ed.save();
  check("edit form submits its fields", submitted.length === 1 && submitted[0].title === "News (6h)" && submitted[0].every === "6h" && submitted[0].context === "growing" && submitted[0].growingMaxTokens === 50000 && submitted[0].prompt === null && submitted[0].toolApproval === null, JSON.stringify(submitted[0]));
  check("…and those are the changes a save sends", eq(kit.reviseChanges(news, submitted[0]), { title: "News (6h)", trigger: { source_id: "schedule", source_version: 1, config: { ...news.trigger.config, every: "6h" } }, context: { mode: "growing" } }), JSON.stringify(kit.reviseChanges(news, submitted[0])));
  check("edit form without a definition offers no task / tools", !html.includes('name="prompt"') && !html.includes('data-action="tool-choice"'));
  check("edit form: Save changes + Cancel, with icons; never 'revision'", /data-action="edit-save"[^>]*><svg[^]*?<span>Save changes<\/span>/.test(html) && /data-action="edit-cancel"[^>]*><svg[^]*?<span>Cancel<\/span>/.test(html) && !/Revis|revision/.test(html));
  // With the committed definition: the task and tool approval are editable too.
  const def = { target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Search the AI news.", provider: "p", model: "m" } }, policy: { tool_approval: "auto" } };
  const sub2 = [];
  const f2 = React.createElement(AutomationReviseForm, { summary: news, definition: def, busy: false, errors: [], onSubmit: (v) => sub2.push(v), onCancel() {}, previewSchedule: async () => ({}) });
  const html2 = renderToStaticMarkup(f2);
  check("edit form + definition: task prefilled, tools choice (auto chosen, ask offered)", /<textarea[^>]*name="prompt"[^>]*>Search the AI news.<\/textarea>/.test(html2) && /aria-checked="true"[^>]*data-value="auto"/.test(html2) && /aria-checked="false"[^>]*data-value="ask"/.test(html2));
  const ed2 = editHarness({ summary: news, definition: def, busy: false, errors: [], onSubmit: (v) => sub2.push(v), onCancel() {}, previewSchedule: async () => ({}) });
  ed2.type("prompt", "Search the AI news, twice.");
  ed2.el((n) => n.props.action === "tool-choice").props.onChange("ask");
  ed2.rerender();
  ed2.save();
  check("edit form + definition reads task and tools", sub2[0].prompt === "Search the AI news, twice." && sub2[0].toolApproval === "ask", JSON.stringify(sub2[0]));
  const ch = kit.reviseChanges(news, sub2[0], def);
  check("new task → changes.target = the definition's target, input_data kept, prompt replaced", eq(ch.target, { bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Search the AI news, twice.", provider: "p", model: "m" } }), JSON.stringify(ch));
  check("new tool approval → changes.policy.tool_approval only", eq(ch.policy, { tool_approval: "ask" }) && eq(Object.keys(ch).sort(), ["policy", "target"]));
  check("same task (whitespace aside) → no target change", kit.reviseChanges(news, { ...kit.reviseFormFrom(news, def), prompt: " Search the AI news. " }, def) === null);
  check("blank task rejected", eq(kit.reviseChanges(news, { ...kit.reviseFormFrom(news, def), prompt: "  " }, def), { errors: ["Task is required."] }));
  check("no definition → prompt/tools ignored", kit.reviseChanges(news, { ...kit.reviseFormFrom(news), prompt: "x", toolApproval: "ask" }) === null);

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
  check("manual trigger summary", kit.triggerSummary({ source_id: "manual", source_version: 1, config: {} }) === "By hand");
  const all = [mailHtml, panel({ summary: news }), panel({ summary: jour })].join("");
  check("no calendar/local wording anywhere", !/daily|local time| local\b|o'clock/i.test(all));
}

// --- create request (AfScheduleDialog's builder) -------------------------------------------
{
  const target = { flow_id: "@default", interface: "abstractcode.agent.v1" };
  const r = kit.buildCreateRequest({ prompt: "Check ACME share price\nNotify if it moved 2%.", when: { kind: "every", amount: 5, unit: "m" }, context: "independent" }, { target, requestId: "req-1" });
  check("every 5 minutes, first run now", r.ok && eq(r.body, { request_id: "req-1", title: "Check ACME share price", target: { flow_id: "@default", interface: "abstractcode.agent.v1", input_data: { prompt: "Check ACME share price\nNotify if it moved 2%." } }, trigger: { source_id: "schedule", source_version: 2, config: { kind: "every", every: "5m" } }, context: { mode: "independent" }, policy: { tool_approval: "auto" } }), JSON.stringify(r));
  const askPolicy = kit.buildCreateRequest({ prompt: "x", when: { kind: "every", amount: 5, unit: "m" }, context: "independent", toolApproval: "ask" }, { target, requestId: "r" });
  check("D1: toolApproval ask → policy.tool_approval ask", askPolicy.ok && eq(askPolicy.body.policy, { tool_approval: "ask" }));
  const g = kit.buildCreateRequest({ prompt: "Triage", when: { kind: "every", amount: 30, unit: "m" }, context: "growing", title: "Inbox triage", startAt: "2026-09-27T04:00", count: 48, until: "2026-09-28T04:00" }, { target: { bundle_ref: "inbox@1.0.0", flow_id: "main", input_data: { folder: "INBOX" } }, requestId: "req-2" });
  check("advanced: start/count/until as UTC, input_data merged", g.ok && eq(g.body.trigger.config, { kind: "every", every: "30m", start_at: "2026-09-27T04:00:00Z", count: 48, until: "2026-09-28T04:00:00Z" }) && eq(g.body.target.input_data, { folder: "INBOX", prompt: "Triage" }) && g.body.context.mode === "growing" && g.body.title === "Inbox triage");
  const once = kit.buildCreateRequest({ prompt: "Ping", when: { kind: "once", at: "2026-09-28T08:00" }, context: "independent" }, { target, requestId: "r" });
  check("once at → schedule@2 {kind: once, at} (a wall time; the gateway converts it in the account zone)", once.ok && eq(once.body.trigger, { source_id: "schedule", source_version: 2, config: { kind: "once", at: "2026-09-28T08:00" } }));
  // R16.1 A5: the calendar rules (schedule@2), no time_zone sent (the gateway fills the owner's).
  const cal = (when, extra = {}) => kit.buildCreateRequest({ prompt: "Brief me", when, context: "independent", ...extra }, { target, requestId: "r" });
  const daily = cal({ kind: "daily", at: "08:00" });
  check("daily → {kind: daily, at}", daily.ok && eq(daily.body.trigger, { source_id: "schedule", source_version: 2, config: { kind: "daily", at: "08:00" } }), JSON.stringify(daily));
  const weekly = cal({ kind: "weekly", days: ["fri", "mon", "fri"], at: "07:30" }, { count: 10, until: "2026-12-31T23:00" });
  check("weekly → days Monday-first, de-duplicated; max runs and stop at kept", weekly.ok && eq(weekly.body.trigger.config, { kind: "weekly", days: ["mon", "fri"], at: "07:30", count: 10, until: "2026-12-31T23:00:00Z" }), JSON.stringify(weekly));
  const monthly = cal({ kind: "monthly", day: "last", at: "18:00" });
  check("monthly last → {kind: monthly, day: last, at}", monthly.ok && eq(monthly.body.trigger.config, { kind: "monthly", day: "last", at: "18:00" }));
  check("monthly 31 → day 31 (the gateway clamps short months)", eq(cal({ kind: "monthly", day: 31, at: "09:00" }).body.trigger.config, { kind: "monthly", day: 31, at: "09:00" }));
  const noDays = cal({ kind: "weekly", days: [], at: "07:30" });
  check("weekly without a day → the kit sentence, no body", !noDays.ok && eq(noDays.errors, [kit.SCHEDULE_TEXT.error_days]));
  const badAt = cal({ kind: "daily", at: "25:00" });
  check("daily with an impossible time → the kit sentence", !badAt.ok && eq(badAt.errors, [kit.SCHEDULE_TEXT.error_at]));
  const badDay = cal({ kind: "monthly", day: 32, at: "09:00" });
  check("monthly day 32 → the kit sentence", !badDay.ok && eq(badDay.errors, [kit.SCHEDULE_TEXT.error_day]));
  check("calendar/once preview is the gateway's (the kit returns no sentence)", ["daily", "weekly", "monthly"].every((k) => kit.schedulePreview({ prompt: "", when: kit.calendarWhenOf(k, {}), context: "independent" }) === "") && kit.schedulePreview({ prompt: "", when: { kind: "once", at: "2026-10-09T08:00" }, context: "independent" }) === "");
  check("Repeat's line is the gateway's too (the kit returns no sentence)", kit.schedulePreview({ prompt: "", when: { kind: "every", amount: 24, unit: "h" }, context: "independent" }) === "");
  const bad = kit.buildCreateRequest({ prompt: " ", when: { kind: "once", at: "" }, context: "independent" }, { target: null, requestId: "r" });
  check("missing target/prompt/time → reasons, no body", !bad.ok && bad.errors.length === 3, JSON.stringify(bad));
  check("no time zone sent by the kit (the gateway fills the owner's)", !/"tz"|time_zone/.test(JSON.stringify([r, g, once])));
}

// --- AfScheduleDialog render -----------------------------------------------------------------
{
  const previewSchedule = async () => { throw new Error("SSR never previews"); };
  const dlg = (p) => renderToStaticMarkup(React.createElement(AfScheduleDialog, { open: true, onClose() {}, target: null, onSubmit() {}, newRequestId: () => "rid", previewSchedule, ...p }));
  const html = dlg({ initialPrompt: "Monitor memory usage", workflowPicker: React.createElement("div", { id: "host-picker" }, "picker") });
  check("dialog: modal, labelled", html.includes('role="dialog" aria-modal="true" aria-labelledby=') && html.includes(">Schedule a task<"));
  check("dialog: What with host picker slot + prompt", html.includes("<legend>What</legend>") && html.includes('id="host-picker"') && html.includes(">Monitor memory usage</textarea>") && html.includes("Choose what to run."));
  check("dialog: When (the kind select's label) + presets incl. every 24 hours", /<label class="af-auto__field af-edit__field" for="[^"]+"><span>When<\/span><select[^>]*name="schedule_kind"/.test(html) && ["every 5 minutes", "every 30 minutes", "every hour", "every 8 hours", "every 24 hours", "every 7 days"].every((l) => html.includes(`>${l}</button>`)));
  check("dialog: the default Repeat line waits for the gateway (no kit sentence)", !html.includes("Runs every 24 hours (UTC)") && (html.includes('data-preview="loading"') || html.includes('data-preview="idle"')));
  check("dialog: once-at option", html.includes("Once at…"));
  check("dialog: context Independent/Growing", /<input type="radio" name="[^"]+" checked="" value="independent"\/>/.test(html) && /<input type="radio" name="[^"]+" value="growing"\/>/.test(html));
  // R13.2: no disclosure anywhere in the dialog; title and limits are a visible fieldset.
  check("dialog: no disclosure (no details/summary, no Advanced)", !/<details|<summary|>Advanced</.test(html));
  check("dialog: visible Title and limits fieldset with title, first run, stop after, stop at", html.includes('data-field="limits"><legend>Title and limits</legend>') && html.includes("Defaults to the task&#x27;s first line") && html.includes("First run at (UTC; empty = now)") && html.includes("Stop after this many runs") && html.includes("Stop at (UTC)"));
  check("dialog: no Workspaces section without the host slot", !html.includes('data-field="workspaces"'));
  const ws = dlg({ workspaces: React.createElement("div", { id: "host-workspaces" }, "chooser") });
  check("dialog: Workspaces slot = visible group (one heading: the chooser's) after Tools, before Mailbox", /data-field="workspaces" role="group" aria-label="Workspaces"><div id="host-workspaces">chooser<\/div><\/div>/.test(ws) && !ws.includes("<legend>Workspaces</legend>") && ws.indexOf('data-field="tool-approval"') < ws.indexOf('data-field="workspaces"') && ws.indexOf('data-field="workspaces"') < ws.indexOf('data-field="email"'));
  check("dialog: Workspaces slot sends nothing itself (no workspace in the markup outside the slot)", ws.split("host-workspaces").length === 2);
  check("dialog: the six kinds in order (Repeat, Daily, Weekly, Monthly, Once at…, email)", (() => { const at = ["every", "daily", "weekly", "monthly", "once", "email"].map((v) => html.indexOf(`value="${v}"`)); return at.every((i, k) => i > 0 && (k === 0 || i > at[k - 1])); })() && ["Repeat", "Daily", "Weekly", "Monthly", "Once at…"].every((w) => new RegExp(`<option value="[a-z]+"( selected="")?>${w}</option>`).test(html)) && !/role="radiogroup" aria-label="Schedule kind"/.test(html));
  check("dialog: no calendar sentence composed by the kit (served only)", !/Every day at|every day at|Monthly on|Every Mon/.test(html));
  const err = dlg({ error: kit.parseApiError(422, fx("errors.json").items.find((e) => e.body.detail.reason_code === "invalid_definition").body) });
  check("dialog: shows an API error", err.includes('data-code="invalid_definition"'));
  check("dialog closed renders nothing", renderToStaticMarkup(React.createElement(AfScheduleDialog, { open: false, onClose() {}, target: null, onSubmit() {} })) === "");
}

// --- F4: Discuss honours the `discuss` capability and legacy -------------------------------
{
  const discussEnabled = (html) => [...html.matchAll(/<button[^>]*data-action="discuss"[^>]*>/g)].map((m) => !/ disabled=""/.test(m[0]));
  const nocap = panel({ summary: { ...mail, capabilities: mail.capabilities.filter((c) => c !== "discuss") }, occurrences: occ });
  check("no `discuss` capability → every Discuss disabled", discussEnabled(nocap).every((e) => !e) && discussEnabled(nocap).length === 7);
  check("no `discuss` capability → visible reason", nocap.includes("Discussion is not permitted for this automation."));
  const legacyRows = panel({ summary: { ...mail, legacy: true, revision: null, capabilities: ["legacy"] }, occurrences: occ });
  check("legacy → every Discuss disabled with a reason", discussEnabled(legacyRows).every((e) => !e) && legacyRows.includes("Legacy schedule: discussion is not available."));
  const archivedRows = panel({ summary: { ...mail, status: "archived" }, occurrences: occ });
  check("archived keeps Discuss on finished occurrences", eq(discussEnabled(archivedRows), [true, true, true, true, true, true, false]));
  check("waiting row: Discuss reason is visible", mailHtml.includes(">Available once this run finishes.</span>"));
}

// --- F5: reasons for disabled controls (aria-describedby + tooltip; spec G: no visible line) ------
{
  const html = panel({ summary: { ...news, status: "completed" }, occurrences: occ });
  const b = button(html, "run_now");
  const ref = (/aria-describedby="([^"]+)"/.exec(b) || [])[1];
  check("disabled Run now references a reason", !!ref, b);
  check("…the reason is read by assistive tech, not drawn as a line (spec G: a reason line only for what a person can act on)", ref && new RegExp(`<p class="af-auto__reasons af-auto__sr-only"><span id="${ref.replace(/[:]/g, "\\:")}">[^<]*Run now[^<]*: The automation has ended.</span>`).test(html), ref);
  check("enabled controls carry no reason", !/aria-describedby/.test(button(html, "edit")) && !/title="(Already|Nothing|Working)/.test(button(html, "edit")));
  check("the disabled control's reason is also its tooltip (first line, then the hint)", /<button[^>]*data-action="run_now"[^>]*title="The automation has ended.\n/.test(html));
  check("no 'Nothing is running' anywhere (the ONE Run now / Stop button)", !panel({ summary: news, occurrences: occ }).includes("Nothing is running"));
  const busy = panel({ summary: news, occurrences: [], busy: true });
  check("busy: one shared reason for all controls", busy.includes("Active, Run now, Edit, Archive: Working…"));
  const fake = (sel) => ({ querySelector: (q) => sel[q] ?? null });
  const mk = (name, disabled = false) => ({ name, disabled, focus() {} });
  const { pickFocusTarget } = await import(join(here, "..", "dist", "automations", "panel_core.js"));
  check("pickFocusTarget skips a disabled opener → notice", pickFocusTarget(fake({ a: mk("a", true), b: mk("b") }), ["a", "b"]).name === "b");
  check("pickFocusTarget: none → null", pickFocusTarget(fake({}), ["a"]) === null && pickFocusTarget(null, ["a"]) === null);
  check("title is a focus fallback", /<h2 class="af-auto__title" id="[^"]+" tabindex="-1"[^>]*>/.test(html));
}

// A persisted custom budget survives hydration, unrelated edits and mode changes.
{
  const summary = { ...mail, growing_max_tokens: 30000 };
  const form = kit.reviseFormFrom(summary);
  check("custom growing limit hydrated", form.growingMaxTokens === 30000);
  check("unchanged custom limit is a no-op", kit.reviseChanges(summary, form) === null);
  check("budget-only revision", eq(kit.reviseChanges(summary, { ...form, growingMaxTokens: 20000 }), { context: { mode: "growing", growing: { max_tokens: 20000 } } }));
  check("title-only edit preserves limit", eq(kit.reviseChanges(summary, { ...form, title: "Renamed" }), { title: "Renamed" }));
  check("independent mode remembers limit", eq(kit.reviseChanges(summary, { ...form, context: "independent" }), { context: { mode: "independent", growing: { max_tokens: 30000 } } }));
  const create = { prompt: "Check", when: { kind: "every", amount: 1, unit: "h" }, context: "growing", growingMaxTokens: 30000 };
  const opts = { target: { bundle_ref: "b", flow_id: "f", input_data: {} }, requestId: "limit" };
  const built = kit.buildCreateRequest(create, opts);
  check("creation sends custom limit", built.ok && eq(built.body.context, { mode: "growing", growing: { max_tokens: 30000 } }));
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    check(`invalid growing budget ${value}`, !kit.buildCreateRequest({ ...create, growingMaxTokens: value }, opts).ok);
    check(`invalid revised budget ${value}`, "errors" in kit.reviseChanges(summary, { ...form, growingMaxTokens: value }));
  }
  const html = renderToStaticMarkup(React.createElement(AutomationReviseForm, { summary, busy: false, errors: [], onSubmit() {}, onCancel() {} }));
  check("edit renders saved budget", /name="growing_max_tokens"[^>]*value="30000"/.test(html));
}

// --- F6 / F7 pure trackers ------------------------------------------------------------------
{
  const t = new kit.SeenAckTracker();
  const s1 = {}, s2 = {}, s3 = {};
  check("seen: first render sends", t.next("A|att1:2", s1) === "A|att1:2");
  check("seen: in flight → not resent", t.next("A|att1:2", s1) === null);
  t.failed("A|att1:2", s1);
  check("seen: failure NOT acknowledged", t.acknowledged === null);
  check("seen: same summary after the failure → no retry loop", t.next("A|att1:2", s1) === null);
  check("seen: next render with a new summary → retried", t.next("A|att1:2", s2) === "A|att1:2");
  t.succeeded("A|att1:2");
  check("seen: acknowledged only after success", t.acknowledged === "A|att1:2" && t.next("A|att1:2", s3) === null);
  check("seen: a newer cursor is sent", t.next("A|att1:3", s3) === "A|att1:3");
  let k = 0;
  const ids = new kit.ActionIds(() => `id-${++k}`);
  const a = ids.idFor("command:automation.run_now");
  ids.settle("command:automation.run_now", { ok: false, error: new TypeError("Failed to fetch") });
  check("ids: transport failure → retry reuses the id", ids.idFor("command:automation.run_now") === a);
  ids.settle("command:automation.run_now", { ok: false, error: { status: 0, code: "invalid_response", message: "x" } });
  check("ids: unreadable answer → still reused", ids.idFor("command:automation.run_now") === a);
  ids.settle("command:automation.run_now", { ok: true });
  const b2 = ids.idFor("command:automation.run_now");
  check("ids: after success → a new action gets a new id", b2 !== a);
  ids.settle("command:automation.run_now", { ok: false, error: kit.parseApiError(409, { detail: { reason_code: "automation_busy", message: "busy" } }) });
  check("ids: after a gateway answer (409) → new id", ids.idFor("command:automation.run_now") !== b2);
  check("ids: distinct actions never share an id", ids.idFor("command:automation.pause") !== ids.idFor("command:automation.run_now"));
}

// --- hook harness: the panel's own wiring (F5, F6, F7) ---------------------------------------
// Drives the real AutomationPanel / AfScheduleDialog with a minimal hooks
// dispatcher (React 18 internals) so state, effects and handlers run in node.
function harness(Component, runEffects = true) {
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const slots = [];
  let i = 0;
  const D = {
    useState(init) { const k = i++; if (!(k in slots)) slots[k] = { v: typeof init === "function" ? init() : init }; const c = slots[k]; return [c.v, (nv) => { c.v = typeof nv === "function" ? nv(c.v) : nv; }]; },
    useRef(init) { const k = i++; if (!(k in slots)) slots[k] = { current: init }; return slots[k]; },
    useId() { const k = i++; if (!(k in slots)) slots[k] = `:h${k}:`; return slots[k]; },
    useEffect(fn, deps) { const k = i++; const prev = slots[k]; if (!prev || !deps || deps.some((d, j) => !Object.is(d, prev.deps[j]))) { slots[k] = { deps }; pending.push(fn); } },
  };
  let pending = [];
  return {
    render(props, root) {
      i = 0; pending = [];
      internals.ReactCurrentDispatcher.current = D;
      let tree;
      try { tree = Component(props); } finally { internals.ReactCurrentDispatcher.current = null; }
      if (root && tree && tree.ref) tree.ref.current = root;
      if (runEffects) for (const fn of pending) fn();
      return tree;
    },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
// The panel with its Details dialog opened (the header's Details button), as markup: the page, then the dialog.
function withDetailsOpen(props) {
  const h = harness(AutomationPanel, false);
  const full = { triggerSources: sources, occurrences: [], busy: false, nowMs: NOW, ...handlers, ...props };
  byAction(h.render(full), "details")[0].props.onClick();
  const tree = h.render(full);
  const m = find(tree, (n) => n.type === kit.AfModal && n.props.open)[0];
  return m ? renderToStaticMarkup(React.createElement("div", null, m.props.children)) : "";
}
{
  // F7: one command_id per user action, reused on retry after a transport failure.
  const seen = [];
  const sent = [];
  let mode = "transport";
  let n = 0;
  const props = {
    summary: jour, occurrences: [], triggerSources: sources, busy: false, ...handlers,
    newId: () => `cmd-${++n}`,
    onSeen: async (c) => { seen.push(c); },
    onCommand: (type, payload, meta) => { sent.push([type, payload, meta]); return mode === "transport" ? Promise.reject(new TypeError("Failed to fetch")) : mode === "busy" ? Promise.reject(kit.parseApiError(409, { detail: { reason_code: "automation_busy", message: "b" } })) : Promise.resolve({ command_id: meta.command_id, accepted: true, duplicate: false, seq: 1 }); },
  };
  const h = harness(AutomationPanel);
  const click = async (action) => { byAction(h.render(props), action)[0].props.onClick(); await flush(); };
  await click("run_now");
  await click("run_now");
  check("F7: retry after a transport failure reuses the command_id", sent.length === 2 && sent[0][2].command_id === "cmd-1" && sent[1][2].command_id === "cmd-1", JSON.stringify(sent));
  check("F7: onCommand(type, undefined, {command_id})", sent[0][0] === "automation.run_now" && sent[0][1] === undefined);
  mode = "ok";
  await click("run_now");
  await click("run_now");
  check("F7: after success the next click is a new action", sent[2][2].command_id === "cmd-1" && sent[3][2].command_id === "cmd-2", JSON.stringify(sent.map((x) => x[2].command_id)));
  mode = "busy";
  await click("run_now");
  await click("run_now");
  check("F7: after a gateway 409 the next click gets a new id", sent[4][2].command_id !== sent[5][2].command_id);
}
{
  // F6: a background render never reads. Visible items advance only a contiguous prefix.
  const calls6 = [];
  let fail = true;
  const props = { summary: mail, occurrences: occ, triggerSources: sources, busy: false, ...handlers, newId: () => "x", onSeen: (c) => { calls6.push(c); return fail ? Promise.reject(new TypeError("offline")) : Promise.resolve(); } };
  const h = harness(AutomationPanel);
  let tree = h.render(props);
  await flush();
  check("F6: mounting never acknowledges unseen items", calls6.length === 0);
  const markerMap = new Map();
  walk(tree, (node) => { if (node.type?.name === "VisibleContentMarker") markerMap.set(node.props.contentKey, node); });
  const markers = [...markerMap.values()];
  check("F6: every attention item has a consumption marker", markers.length === mail.attention.items.length);
  markers[1].props.onConsume(); h.render(props); await flush();
  check("F6: seeing a later item cannot skip the oldest unread one", calls6.length === 0);
  markers[0].props.onConsume(); h.render(props); await flush();
  h.render(props); await flush();
  check("F6: failed /seen is not retried on the same summary (no loop)", eq(calls6, ["att1:2"]), JSON.stringify(calls6));
  fail = false;
  h.render({ ...props, summary: { ...mail } }); await flush();
  check("F6: consumed prefix retried with a fresh summary", eq(calls6, ["att1:2", "att1:2"]));
  h.render({ ...props, summary: { ...mail } }); await flush();
  check("F6: once acknowledged, not sent again", calls6.length === 2);
  h.render({ ...props, summary: { ...mail, automation_id: "another-owner" } }); await flush();
  check("F6: switching automation resets visible consumption", calls6.length === 2);
}

{
  // F5: focus moves back to the opener when archive / revise / discuss close.
  const asked = [];
  const focused = [];
  const root = { querySelector: (q) => { asked.push(q); return q.includes("data-action") ? { disabled: false, focus: () => focused.push(q) } : null; } };
  const props = { summary: jour, occurrences: occ, triggerSources: sources, busy: false, ...handlers, newId: () => "x", onCommand: async () => ({}), onRevise: async () => ({}), onDiscuss: async () => ({ session_id: "s", run_id: "r" }) };
  const h = harness(AutomationPanel);
  byAction(h.render(props, root), "archive")[0].props.onClick();
  byAction(h.render(props, root), "archive-cancel")[0].props.onClick();
  h.render(props, root);
  check("F5: archive cancel → focus the Archive control", focused.at(-1) === '[data-action="archive"]', JSON.stringify(focused));
  byAction(h.render(props, root), "archive")[0].props.onClick();
  byAction(h.render(props, root), "archive-confirm")[0].props.onClick();
  await flush();
  h.render(props, root);
  check("F5: archive confirmed → focus moves (opener, else notice, else title)", focused.at(-1) === '[data-action="archive"]' && focused.length === 2);
  byAction(h.render(props, root), "edit")[0].props.onClick();
  byAction(h.render(props, root), "edit-cancel")[0].props.onClick();
  h.render(props, root);
  check("F5: edit cancel → focus the Edit control", focused.at(-1) === '[data-action="edit"]');
  byAction(h.render(props, root), "discuss").find((n) => !n.props.disabled).props.onClick();
  byAction(h.render(props, root), "discuss-cancel")[0].props.onClick();
  h.render(props, root);
  check("F5: discuss cancel → focus that row's Discuss", focused.at(-1) === '[data-index="1"] [data-action="discuss"]', focused.at(-1));
  const none = { querySelector: (q) => (asked.push(q), q === ".af-auto__title" ? { focus: () => focused.push("title") } : null) };
  byAction(h.render(props, none), "edit")[0].props.onClick();
  byAction(h.render(props, none), "edit-cancel")[0].props.onClick();
  h.render(props, none);
  check("F5: fallback to the title when the opener is gone", focused.at(-1) === "title");
  check("F5: fallback order = opener, notice, title", eq(asked.slice(-3), ['[data-action="edit"]', ".af-auto__notice", ".af-auto__title"]), JSON.stringify(asked.slice(-3)));
}
{
  // F7 in the dialog: one request_id per distinct request.
  let n = 0;
  const bodies = [];
  let outcome = "transport";
  const props = { open: true, onClose() {}, target: { flow_id: "@default", interface: "abstractcode.agent.v1" }, newRequestId: () => `req-${++n}`, onSubmit: (b) => { bodies.push(b); return outcome === "transport" ? Promise.reject(new TypeError("offline")) : Promise.resolve({}); } };
  const h = harness(AfScheduleDialog, false);
  const textarea = (tree) => find(tree, (x) => x.type === "textarea")[0];
  const submit = async () => { find(h.render(props), (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} }); await flush(); };
  textarea(h.render(props)).props.onChange({ target: { value: "Monitor memory usage every 2 minutes" } });
  await submit();
  await submit();
  check("dialog: retry after a transport failure reuses request_id", bodies.length === 2 && bodies[0].request_id === "req-1" && bodies[1].request_id === "req-1", JSON.stringify(bodies.map((b) => b.request_id)));
  textarea(h.render(props)).props.onChange({ target: { value: "Monitor memory usage every 5 minutes" } });
  await submit();
  check("dialog: an edited request gets a new request_id (no identity_conflict)", bodies[2].request_id === "req-2");
  outcome = "ok";
  await submit();
  await submit();
  check("dialog: after success the same request is a new action", bodies[3].request_id === "req-2" && bodies[4].request_id === "req-3");
}

// --- D1: typed waits — the answer payload follows `kind`, never the text -------------------
{
  const row7 = occ.find((o) => o.index === 7);
  const tw = row7.waits.find((x) => x.kind === "tool_approval");
  const got = [];
  const errs = [];
  const form = (wait) => parts.WaitAnswerForm({ wait, busy: false, idBase: "b", onAnswerWait: (r, k, p) => got.push([r, k, p]), onWaitError: (m) => errs.push(m) });
  const t = form(tw);
  byAction(t, "wait-approve")[0].props.onClick();
  check("D1: Approve → {approved: true} on the tool wait's own run", eq(got.at(-1), [tw.run_id, tw.wait_key, { approved: true }]));
  byAction(t, "wait-deny")[0].props.onClick();
  check("D1: Deny → {approved: false}", eq(got.at(-1), [tw.run_id, tw.wait_key, { approved: false }]));
  check("D1: waitToolCalls parses the fixture details", eq(kit.waitToolCalls(tw), tw.details));
  check("D1: waitToolCalls rejects malformed details", kit.waitToolCalls({ kind: "tool_approval", details: [{ arguments: {} }] }) === null && kit.waitToolCalls({ kind: "tool_approval", details: { name: "x" } }) === null);
  check("D1: waitToolCalls is null for other kinds", kit.waitToolCalls({ kind: "ask_user", details: tw.details }) === null);
  const noDetails = renderToStaticMarkup(form({ ...tw, details: undefined }));
  check("D1: tool wait without details says so, still answerable", noDetails.includes("did not list the tool calls") && noDetails.includes('data-action="wait-approve"'));
  // A text that LOOKS like an approval question on an ask_user wait stays {response}.
  const lookalike = { run_id: row7.run_id, wait_key: "k", kind: "ask_user", reason: "user", prompt: "Approve tool call send_email?", choices: ["Approve"] };
  byAction(form(lookalike), "wait-choice")[0].props.onClick();
  check("D1: never inferred from text — an ask_user asking to 'Approve' answers {response}", eq(got.at(-1), [row7.run_id, "k", { response: "Approve" }]));
  check("D1: ask_user has no Approve/Deny", byAction(form(lookalike), "wait-approve").length === 0);
  const ev = { run_id: row7.run_id, wait_key: "event:price", kind: "event", reason: "event", prompt: "Waiting for the price feed" };
  const evForm = find(form(ev), (n) => n.type === "form")[0];
  const sub = (v) => ({ preventDefault() {}, currentTarget: { elements: { namedItem: (k) => (k === "payload" ? { value: v } : null) } } });
  evForm.props.onSubmit(sub(' {"price": 101.5} '));
  check("D1: event → {payload: parsed JSON}", eq(got.at(-1), [row7.run_id, "event:price", { payload: { price: 101.5 } }]));
  const n = got.length;
  evForm.props.onSubmit(sub('{"price": '));
  check("D1: event data that starts like JSON but is not valid sends nothing and reports", got.length === n && errs.length === 1 && errs[0].includes("not valid"));
  // A described input, not raw JSON (operator 2026-10-29): words are sent as the event's text.
  evForm.props.onSubmit(sub(" the signed contract arrived "));
  check("D1: words are sent as the event's text", eq(got.at(-1), [row7.run_id, "event:price", { payload: { text: "the signed contract arrived" } }]));
  evForm.props.onSubmit(sub("   "));
  check("D1: an empty event asks for words", errs.at(-1) === "Say what happened, in a few words.");
  const evHtml = renderToStaticMarkup(form(ev));
  check("D1: event form asks what happened, in words", evHtml.includes('aria-label="What happened"') && evHtml.includes("in a few words") && !evHtml.includes("JSON"));
  const unknown = renderToStaticMarkup(form({ ...ev, kind: "webhook" }));
  check("D1: unknown kind is shown, not answered", unknown.includes("cannot be answered here") && !/data-action="wait-/.test(unknown));
  check("D1: attention strip labels waits by kind", mailHtml.includes('data-wait-kind="tool_approval">Approval needed</span>') && mailHtml.includes('data-wait-kind="ask_user">Question for you</span>'));
  // Dialog: policy default auto with the consent line; ask on request.
  const dlgHtml = renderToStaticMarkup(React.createElement(AfScheduleDialog, { open: true, onClose() {}, target: null, onSubmit() {}, newRequestId: () => "r", targetTools: ["fetch_url", "execute_command"] }));
  check("D1: dialog defaults to Run without asking", /checked="" value="auto"\/> Run without asking/.test(dlgHtml));
  check("D1: dialog states the consent line with the tool list", dlgHtml.includes(`${esc(kit.TOOL_APPROVAL_CONSENT)}: fetch_url, execute_command.`) && kit.TOOL_APPROVAL_CONSENT === "Tools run without asking (you approve them now by creating this automation)");
  check("D1: dialog offers Ask", dlgHtml.includes('value="ask"/> Ask me before each tool call'));
  const bodies = [];
  const h = harness(AfScheduleDialog, false);
  const dprops = { open: true, onClose() {}, target: { flow_id: "@default", interface: "abstractcode.agent.v1" }, newRequestId: () => "rq", onSubmit: (b) => { bodies.push(b); return Promise.resolve(); } };
  find(h.render(dprops), (x) => x.type === "textarea")[0].props.onChange({ target: { value: "Monitor memory" } });
  find(h.render(dprops), (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
  check("D1: dialog submits policy.tool_approval auto by default", bodies[0] && eq(bodies[0].policy, { tool_approval: "auto" }));
  find(h.render(dprops), (x) => x.type === "input" && x.props.value === "ask")[0].props.onChange();
  find(h.render(dprops), (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
  check("D1: dialog submits ask when chosen", bodies[1] && eq(bodies[1].policy, { tool_approval: "ask" }));
  const askHtml = renderToStaticMarkup(h.render(dprops));
  check("D1: consent line hidden under ask", !askHtml.includes(esc(kit.TOOL_APPROVAL_CONSENT)));
}

// --- Edit (operator 2026-09-28): one name, icons, opened by the host, saved in place ----------
{
  check("CONTROL_LABELS: the revise control is called Edit", kit.CONTROL_LABELS.revise === "Edit" && !Object.values(kit.CONTROL_LABELS).some((l) => /revis/i.test(l)));
  check("CONTROL_ICONS: one kit icon per control", eq(Object.keys(kit.CONTROL_ICONS).sort(), Object.keys(kit.CONTROL_LABELS).sort()) && Object.values(kit.CONTROL_ICONS).every((n) => typeof n === "string" && n));
  const html = panel({ summary: mail, occurrences: occ });
  const toolbar = (/<div class="af-auto__controls" role="toolbar"[^]*?<\/div>/.exec(html) || [""])[0];
  const all = [...toolbar.matchAll(/<button\b[^>]*>[^]*?<\/button>/g)].map((m) => m[0]);
  // The Active state switch leads the bar; it is a switch (track + thumb), not an action button.
  check("the bar leads with the Active switch: Active · Stop (a run is in flight) · Edit · Archive", all.length === 4 && /^<button type="button" role="switch"[^>]*data-action="active"/.test(all[0]) && /data-action="stop_current"/.test(all[1]) && /data-action="edit"/.test(all[2]) && /data-action="archive"/.test(all[3]), all.map((b) => b.slice(0, 90)).join("\n"));
  const btns = all.filter((b) => !/role="switch"/.test(b));
  check("every control button starts with its icon, then its label, and is named by its label", btns.length === 3 && btns.every((b) => /^<button\b[^>]*aria-label="[^"]+"[^>]*><svg\b[^]*<\/svg><span>[^<]+<\/span><\/button>$/.test(b)), btns.join("\n"));
  const withDef = panel({ summary: news, occurrences: [], definition: { schema_version: 1, revision: 1, title: news.title, controller: { bundle_ref: "c@1", flow_id: "controller" }, target: { workflow_id: "w@1:main", bundle_ref: "w@1", flow_id: "main", input_data: { prompt: "Do it." } }, trigger: news.trigger, context: { mode: "independent" }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 1, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" }, session_id: "s", created_at: "x", archived_at: null } });
  const defBar = [...((/<div class="af-auto__controls" role="toolbar"[^]*?<\/div>/.exec(withDef) || [""])[0]).matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
  check("with a definition: Active · Run now · Edit · Details · Archive, Run now the primary (spec G)", eq(defBar, ["active", "run_now", "edit", "details", "archive"]) && /class="af-auto__btn af-auto__btn--primary" data-action="run_now"/.test(withDef), JSON.stringify(defBar));
  check("no ⋯ menu in the header", !withDef.split("</header>")[0].includes("⋯") && !/aria-haspopup="menu"/.test(withDef.split("</header>")[0]));
  check("the Edit control reads Edit (data-action=edit)", /data-action="edit"[^>]*><svg[^]*?<span>Edit<\/span>/.test(toolbar) && !/Revise/.test(html));
  const allButtons = [...html.matchAll(/<button\b[^>]*>[^]*?<\/button>/g)].map((m) => m[0]).filter((b) => !/data-action="wait-choice"/.test(b) && !/role="switch"/.test(b));
  check("every action button in the panel carries an icon (wait choices are the choice text)", allButtons.every((b) => /^<button\b[^>]*>(<svg\b|<span[^>]*><svg\b)/.test(b) || /af-auto__linkbtn/.test(b)), allButtons.filter((b) => !/^<button\b[^>]*><svg\b/.test(b)).join("\n").slice(0, 400));

  // Controlled: the host opens the form; the panel asks through onEditOpenChange.
  const definition = { schema_version: 1, revision: jour.revision, title: jour.title, controller: { bundle_ref: "c@1", flow_id: "controller" },
    target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Summarise the week." } },
    trigger: jour.trigger, context: { mode: jour.context_mode, growing: {} }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" },
    session_id: "s", workspace_root: "/w", created_at: "2026-09-25T08:00:00Z", archived_at: null };
  check("editOpen=true → the form is open, prefilled (title, task)", /class="af-auto__revise"/.test(panel({ summary: jour, definition, editOpen: true })) && panel({ summary: jour, definition, editOpen: true }).includes(">Summarise the week.</textarea>"));
  check("editOpen=true → the Edit control reads pressed", /data-action="edit"[^>]*aria-pressed="true"/.test(panel({ summary: jour, definition, editOpen: true })));
  check("editOpen=false → no form", !panel({ summary: jour, definition, editOpen: false }).includes('class="af-auto__revise"'));
  check("editOpen=true on an archived automation → no form", !panel({ summary: { ...jour, status: "archived" }, definition, editOpen: true }).includes('class="af-auto__revise"'));
  check("editOpen=true while busy keeps the form (a save in flight)", panel({ summary: jour, definition, editOpen: true, busy: true }).includes('class="af-auto__revise"'));

  const asked = [];
  const revised = [];
  const focused = [];
  const root = { querySelector: (q) => (q === '.af-auto__revise [name="title"]' ? { disabled: false, focus: () => focused.push(q), scrollIntoView() {} } : null) };
  const props = { summary: jour, definition, occurrences: [], triggerSources: sources, busy: false, ...handlers, newId: () => "cmd-e1",
    editOpen: false, onEditOpenChange: (o) => asked.push(o),
    onRevise: (changes, expected, meta) => { revised.push({ changes, expected, meta }); return Promise.resolve({ command_id: meta.command_id, accepted: true, duplicate: false, seq: 1 }); } };
  const h = harness(AutomationPanel);
  byAction(h.render(props, root), "edit")[0].props.onClick();
  check("controlled: the Edit button asks the host to open (and does not open by itself)", eq(asked, [true]) && !renderToStaticMarkup(h.render(props, root)).includes('class="af-auto__revise"'));
  const open = { ...props, editOpen: true };
  const tree = h.render(open, root);
  check("opening focuses the form's first field", focused.includes('.af-auto__revise [name="title"]'));
  check("the panel opens the form in the kit's modal (backdrop click does not close it)", (() => { const m = find(tree, (n) => n.type === kit.AfModal && n.props.open && n.props.closeOnBackdrop === false)[0]; return m && m.props.closeOnBackdrop === false && find(tree, (n) => n.type === AutomationReviseForm)[0].props.presentation === "dialog"; })());
  // The form hands the panel what the person edited (the form's own checks drive the typing).
  find(tree, (n) => n.type === AutomationReviseForm)[0].props.onSubmit({ ...kit.reviseFormFrom(jour, definition), prompt: "Summarise the week in three bullets." });
  await flush();
  check("Save → ONE onRevise(changes, expected_revision = summary.revision, {command_id})", revised.length === 1 && revised[0].expected === jour.revision && revised[0].meta.command_id === "cmd-e1" && eq(revised[0].changes, { target: { bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Summarise the week in three bullets." } } }), JSON.stringify(revised));
  check("…then asks the host to close the form", eq(asked, [true, false]));
  const after = renderToStaticMarkup(h.render(open, root));
  check("…and says so next to the buttons, with a dismiss control", /<span class="af-auto__notice af-auto__notice--on" role="status" tabindex="-1"><svg[^]*<span class="af-auto__notice-text">Saved; applies from the next run.<\/span><button[^>]*data-action="dismiss-notice"/.test(after));
  byAction(h.render(open, root), "dismiss-notice")[0].props.onClick();
  check("dismiss clears the notice (the live region stays, empty)", /<span class="af-auto__notice" role="status" tabindex="-1"><\/span>/.test(renderToStaticMarkup(h.render(open, root))));
  byAction(h.render(open, root), "edit-cancel")[0].props.onClick();
  check("Cancel asks the host to close", eq(asked, [true, false, false]));
  check("NOTICE_MS: action feedback is brief", typeof parts.NOTICE_MS === "number" && parts.NOTICE_MS > 0 && parts.NOTICE_MS <= 8000);

  // Uncontrolled (no editOpen): the Edit button toggles the panel's own form.
  const h2 = harness(AutomationPanel);
  const own = { ...props, editOpen: undefined, onEditOpenChange: undefined };
  byAction(h2.render(own, root), "edit")[0].props.onClick();
  check("uncontrolled: Edit opens the form", renderToStaticMarkup(h2.render(own, root)).includes('class="af-auto__revise"'));

  // Gate blocker 2026-09-28: a refresh while the form is open must not turn a save into a silent revert.
  // Another client renames the automation (revision +1); the host's 30 s poll re-renders the panel with
  // the new summary/definition; the user saves a task change. The diff base and expected_revision are
  // the ones the form OPENED with: no title change is sent, and the old revision makes the gateway
  // refuse with revision_conflict instead of reverting the rename.
  const staleSent = [];
  const h3 = harness(AutomationPanel);
  const base3 = { ...props, editOpen: true, onEditOpenChange() {}, newId: () => "cmd-stale",
    onRevise: (changes, expected, meta) => { staleSent.push({ changes, expected, meta }); return Promise.resolve({ command_id: meta.command_id, accepted: true, duplicate: false, seq: 1 }); } };
  h3.render(base3, root);
  const renamed = { ...jour, title: "Renamed elsewhere", revision: jour.revision + 1 };
  const refreshed = { ...base3, summary: renamed, definition: { ...definition, title: "Renamed elsewhere", revision: jour.revision + 1 } };
  const tree3 = h3.render(refreshed, root);
  const form3 = find(tree3, (n) => n.type === AutomationReviseForm)[0];
  const titleInput = find(tree3, (n) => n.type === "input" && n.props.name === "title")[0];
  check("an open form keeps the values it opened with across a refresh", titleInput && titleInput.props.value === jour.title && form3.props.summary === jour, titleInput && titleInput.props.value);
  form3.props.onSubmit({ ...kit.reviseFormFrom(form3.props.summary, form3.props.definition), prompt: "Summarise the week, briefly." });
  await flush();
  check("save after a concurrent rename: expected_revision is the revision the form opened with", staleSent.length === 1 && staleSent[0].expected === jour.revision, JSON.stringify(staleSent));
  check("save after a concurrent rename: no title change (the rename is not reverted)", staleSent.length === 1 && !("title" in staleSent[0].changes) && staleSent[0].changes.target && staleSent[0].changes.target.input_data.prompt === "Summarise the week, briefly.", JSON.stringify(staleSent));
  // Closing and reopening takes a fresh snapshot.
  h3.render({ ...refreshed, editOpen: false }, root);
  const reopened = h3.render(refreshed, root);
  const t4 = find(reopened, (n) => n.type === "input" && n.props.name === "title")[0];
  check("reopening the form starts from the current automation", t4 && t4.props.value === "Renamed elsewhere");
}

// --- real gateway formats ----------------------------------------------------------------------
{
  check("formatUtc: gateway +00:00 with microseconds", kit.formatUtc("2026-09-27T10:14:55.865625+00:00") === "2026-09-27 10:14:55 UTC");
  check("formatUtc: whole minute with microseconds", kit.formatUtc("2026-09-27T07:00:00.412307+00:00") === "2026-09-27 07:00 UTC");
  check("formatUtc: Z form still works", kit.formatUtc("2026-09-27T08:00:00Z") === "2026-09-27 08:00 UTC");
  check("formatUtc: other offsets normalised to UTC", kit.formatUtc("2026-09-27T10:00:00.000000+02:00") === "2026-09-27 08:00 UTC");
  // Times in the person's zone with the kit's date rule (operator 2026-10-29), not UTC stamps.
  const firedRow = occ.find((o) => o.fired_at && o.fired_at.startsWith("2026-09-27T04:00"));
  const firedWords = kit.whenWords(firedRow.fired_at, { timeZone: mail.time_zone, nowMs: NOW, style: "day" });
  check("no UTC stamp anywhere on the panel (titles and the Needs attention list included)", !/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})? UTC/.test(mailHtml), (mailHtml.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})? UTC/) || [])[0]);
  check("Needs attention: run numbers and times in words", !mail.attention.items.length || mail.attention.items.every((it) => mailHtml.includes(`Run #${it.index} · ${esc(kit.whenWords(it.at, { timeZone: mail.time_zone, nowMs: NOW, style: "day" }))}`)));
  check("fired time in the person's zone (kit date rule)", firedWords && mailHtml.includes(`fired ${esc(firedWords)}`) && !mailHtml.includes("fired 2026-09-27 04:00 UTC"), firedWords);
  const leg = panel({ summary: legacyRow, occurrences: [] });
  check("real legacy row: marker, every control disabled with the legacy reason", leg.includes("Legacy schedule") && ["run_now", "stop_current", "edit", "archive"].every((a) => !enabled(leg, a)) && !toggleAvailable(leg) && leg.includes("Legacy schedule: managed with its existing controls."));
  check("real legacy row: the served rule, no revision", chip(leg, "trigger")?.text === "Every hour (UTC)" && !leg.includes('data-fact="revision"'));
  const tw = occ.find((o) => o.index === 7).waits.find((x) => x.kind === "tool_approval");
  check("real tool_approval wait has no prompt → the card's bold first line", !("prompt" in tw) && mailHtml.includes(`<strong>${kit.TOOL_APPROVAL_HEADING}</strong>`));
}

// --- definition block (the optional `definition` prop is rendered) ----------------------------
{
  // Shape of GET /automations/{id} → definition as the gateway returns it (capture at 5161785).
  const definition = {
    schema_version: 1, revision: 1, title: news.title,
    controller: { bundle_ref: "abstractframework.automation-controller@1.0.0", flow_id: "controller" },
    target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Search the AI news." } },
    trigger: news.trigger, context: { mode: "independent", growing: {} },
    policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" },
    session_id: "s", workspace_root: "/w", created_at: "2026-09-25T08:00:00.108652+00:00", archived_at: null,
  };
  const html = panel({ summary: news, occurrences: [], definition });
  const blockOf = (def, extra) => renderToStaticMarkup(React.createElement(parts.AutomationDefinitionBlock, { definition: def, served: news, ...extra }));
  const block = blockOf(definition);
  check("definition: a plain list (spec G: no fold), the revision inside", /^<div class="af-auto__definition" data-definition-revision="1"><dl class="af-auto__facts">/.test(block) && !/<details|<summary/.test(block), block.slice(0, 200));
  check("definition: the flow with its version", block.includes('<dt>Flow</dt><dd data-def="target"><code>basic-agent@0.1.0:main</code>'));
  // The trigger in words; its exact configuration shown as such (no disclosure), never the source id.
  check("definition: trigger in words, then its exact configuration", block.includes('data-def="trigger">Every 8 hours (UTC)') && !block.includes("schedule@1") && /<dt>Exact configuration<\/dt><dd data-def="trigger_config"><pre class="af-auto__json">/.test(block) && block.includes(esc(JSON.stringify(news.trigger.config, null, 2))));
  check("definition: context", block.includes('data-def="context">Independent — each run starts fresh'));
  check("definition: tool approval auto", block.includes('data-def="tool_approval">Run without asking<'));
  check("definition: retry policy", block.includes('data-def="retry">3 attempts, backoff 30s ×2 up to 10m'));
  check("definition: revision", block.includes('data-def="revision">1</dd>'));
  check("definition: the host's workspaces rule when given", blockOf(definition, { workspaces: "Your default folders" }).includes('<dt>Workspaces</dt><dd data-def="workspaces">Your default folders</dd>') && !block.includes('data-def="workspaces"'));
  const ask = blockOf({ ...definition, revision: 3, policy: { ...definition.policy, tool_approval: "ask" } });
  check("definition: tool approval ask + new revision", ask.includes('data-def="tool_approval">Ask before each tool call<') && ask.includes('data-def="revision">3</dd>'));
  check("definition: absent prop → no Details button, no block", !panel({ summary: news, occurrences: [] }).includes("af-auto__definition") && button(panel({ summary: news, occurrences: [] }), "details") === null);
  check("definition: not drawn in the panel until Details is pressed", !html.includes("af-auto__definition") && button(html, "details") !== null && /aria-haspopup="dialog"/.test(button(html, "details")));
  // Details opens the kit's modal with the list (the harness renders the panel's hooks).
  const hd = harness(AutomationPanel, false);
  const dprops = { summary: news, occurrences: [], definition, triggerSources: sources, busy: false, nowMs: NOW, ...handlers };
  byAction(hd.render(dprops), "details")[0].props.onClick();
  const dtree = hd.render(dprops);
  const dmodal = find(dtree, (n) => n.type === kit.AfModal && n.props.open)[0];
  const dhtml = dmodal ? renderToStaticMarkup(React.createElement("div", null, dmodal.props.children)) : "";
  check("Details → the kit's modal, titled by the automation, holding the inspection list", !!dmodal && String(dmodal.props.title).includes(news.title) && dhtml.includes('data-def="trigger_config"') && dhtml.includes('data-def="revision"'), dhtml.slice(0, 120));
  dmodal?.props.onClose();
  check("Details closes", !find(hd.render(dprops), (n) => n.type === kit.AfModal && n.props.open).length);
  check("definition: the Edit form opens without the Details list", panel({ summary: news, occurrences: [], definition, editOpen: true }).includes('class="af-auto__revise"'));
}

// --- text rendering seam (operator ruling: the SHARED chat renderer, never plain text) -------
{
  const r2 = occ.find((o) => o.index === 2);
  check("fixture #2 answer is markdown (heading + table + fenced JSON)", r2.answer.includes("## ") && r2.answer.includes("|---|") && r2.answer.includes("```json"));
  // Without a renderer: escaped plain text, visibly marked for the host.
  check("no renderText → section marked unformatted", mailHtml.includes('data-text-rendering="unformatted"'));
  check("no renderText → fallback blocks marked data-unformatted", (mailHtml.match(/<div class="af-auto-text" data-unformatted="true">/g) || []).length >= 7);
  const evil = panel({ summary: mail, occurrences: [{ ...r2, answer: "<script>alert(1)</script> **x**" }] });
  check("fallback escapes markup (no script element)", !evil.includes("<script>") && evil.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  // With a renderer: every text field goes through it.
  const seen = [];
  const spy = (text) => { seen.push(text); return React.createElement("div", { className: "spy-rendered" }, "R"); };
  const definition = { schema_version: 1, revision: 1, title: mail.title, controller: { bundle_ref: "abstractframework.automation-controller@1.0.0", flow_id: "controller" },
    target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Triage my **inbox**." } },
    trigger: mail.trigger, context: { mode: "growing", growing: {} }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" },
    session_id: "s", workspace_root: "/w", created_at: mail.trigger.config.start_at, archived_at: null };
  const rich = panel({ summary: mail, occurrences: occ, definition, renderText: spy });
  const want = [
    ...occ.map((o) => o.user_turn),
    ...occ.filter((o) => o.answer).map((o) => o.answer),
    ...occ.filter((o) => o.notify && o.notify.body).map((o) => o.notify.body),
    ...occ.flatMap((o) => o.waits).filter((w) => w.prompt).map((w) => w.prompt),
    ...mail.attention.items.filter((i) => i.body).map((i) => i.body),
    ...mail.attention.waits.filter((w) => w.prompt).map((w) => w.prompt),
  ];
  check("the header's Task chip: the task's first line as written (clipped by CSS), whole in its tooltip; no task paragraph", chip(rich, "task")?.text === "Triage my **inbox**." && chip(rich, "task")?.title === "Task: Triage my **inbox**." && !rich.includes('class="af-auto__task"'), JSON.stringify(chip(rich, "task")));
  check("renderText gets every user_turn, answer, notify body, wait prompt and attention body", want.every((t) => seen.includes(t)), JSON.stringify(want.filter((t) => !seen.includes(t)).slice(0, 2)));
  check("the ask_user wait prompt itself goes through renderText", /<div class="af-auto-wait__prompt" id="[^"]+"><span class="af-auto-wait__kind">Question for you<\/span><div class="spy-rendered">R<\/div><\/div>/.test(rich));
  check("renderText output is what the panel shows", (rich.match(/class="spy-rendered"/g) || []).length === seen.length);
  check("with renderText → section marked rich, nothing unformatted", rich.includes('data-text-rendering="rich"') && !rich.includes("data-unformatted"));
  check("the answer is never ALSO printed raw", !rich.includes("|---|") && !rich.includes("## 2 emails"));
  check("export plainTextRenderer", typeof kit.plainTextRenderer === "function");
}

// --- Control hints: ONE canonical definition (operator 2026-09-28, "Run now" tooltip) ----------
{
  const { CONTROL_HINTS, CONTROL_LABELS, CONTROL_ICONS, RUN_NOW_GLYPH, RUN_NOW_ONE_LINE, RUN_NOW_NEXT_RUN_LINE, RUN_NOW_GROWING_LINE, controlHint, Icon } = kit;
  const spec = JSON.parse(readFileSync(join(here, "..", "src", "automations", "automation_controls.json"), "utf8"));
  const ids = ["active", "pause", "resume", "run_now", "stop_current", "revise", "archive", "unarchive", "discuss"];
  check("hints: exported", typeof controlHint === "function" && CONTROL_HINTS && RUN_NOW_GLYPH && typeof RUN_NOW_ONE_LINE === "string");
  check("hints: one per control, no more", eq(Object.keys(CONTROL_HINTS).sort(), [...ids].sort()) && eq(Object.keys(CONTROL_LABELS).sort(), [...ids].sort()));
  check("hints/labels/lines ARE the canonical automation_controls.json", eq(CONTROL_HINTS, spec.hints) && eq(CONTROL_LABELS, spec.labels) && RUN_NOW_ONE_LINE === spec.run_now_one_line && RUN_NOW_NEXT_RUN_LINE === spec.run_now_next_run_line && RUN_NOW_GROWING_LINE === spec.run_now_growing_line);
  // The runtime facts the Run now hint states (abstractruntime 0.7.1 commands/controller/schedule + tests).
  const rn = CONTROL_HINTS.run_now;
  check("run now hint: runs now instead of later", rn.startsWith("Run it once now, without waiting for the schedule."));
  check("run now hint: the next scheduled run keeps its time, or follows this run", rn.includes("the next scheduled run keeps its time, or starts right after this run if its time comes first"));
  check("run now hint: no run-limit count, allowed while paused, refused while busy", rn.includes("Does not count toward a run limit.") && rn.includes("Works while paused; it stays paused.") && rn.includes("Not available while a run is in progress."));
  // Dynamic parts.
  const active = { ...news, status: "active", context_mode: "independent" };
  check("controlHint(run_now) adds the SERVED next run (next_run_local cut, in the automation's zone)", controlHint("run_now", active) === `${rn}\nNext scheduled run: 2026-09-27 10:00 Europe/Paris.`, controlHint("run_now", active));
  check("controlHint(run_now) adds the Growing line only for growing", controlHint("run_now", { ...active, context_mode: "growing" }).endsWith(`\n${RUN_NOW_GROWING_LINE}`) && !controlHint("run_now", active).includes("Growing"));
  check("controlHint(run_now) without a served next run (paused/manual) = the static hint", controlHint("run_now", { ...active, next_run_local: undefined }) === rn);
  check("controlHint(other) = its static hint", ids.filter((i) => i !== "run_now").every((i) => controlHint(i, active) === CONTROL_HINTS[i]));
  // The bar: every control's tooltip and aria-description is its hint.
  const html = panel({ summary: active, occurrences: [] });
  const b = button(html, "run_now");
  const want = esc(controlHint("run_now", active));
  check("Run now button: title = hint", b && b.includes(`title="${want}"`), b);
  check("Run now button: aria-description = hint", b && b.includes(`aria-description="${want}"`), b);
  const flyingHtml = panel({ summary: { ...active, current_occurrence: { index: 1, run_id: "r", attempt: 1, status: "running" } }, occurrences: [] });
  check("every bar control carries its hint", [["active", "active"], ["edit", "revise"], ["archive", "archive"]].every(([a, id]) => (button(html, a) || "").includes(`aria-description="${esc(CONTROL_HINTS[id])}"`)) && (button(flyingHtml, "stop_current") || "").includes(`aria-description="${esc(CONTROL_HINTS.stop_current)}"`));
  const pausedHtml = panel({ summary: { ...active, status: "paused", next_fire_at: undefined }, occurrences: [] });
  check("the paused Active switch carries its hint", (button(pausedHtml, "active") || "").includes(`title="${esc(CONTROL_HINTS.active)}"`));
  const occHtml = panel({ summary: mail, occurrences: occ });
  check("Discuss carries its hint", (button(occHtml, "discuss") || "").includes(`title="${esc(CONTROL_HINTS.discuss)}"`));
  // The icon: the kit's playCircle, and the vendorable glyph is exactly what <Icon> draws.
  check("run now icon is the shared playCircle", CONTROL_ICONS.run_now === "playCircle" && RUN_NOW_GLYPH.name === "playCircle");
  const iconSvg = renderToStaticMarkup(React.createElement(Icon, { name: "playCircle" }));
  const inner = (/^<svg[^>]*>([^]*)<\/svg>$/.exec(iconSvg) || [])[1];
  check("RUN_NOW_GLYPH.svg is <Icon name=playCircle>'s markup", inner === RUN_NOW_GLYPH.svg, `${inner} vs ${RUN_NOW_GLYPH.svg}`);
  check("RUN_NOW_GLYPH viewBox/stroke match <Icon>", iconSvg.includes(`viewBox="${RUN_NOW_GLYPH.view_box}"`) && iconSvg.includes(`stroke-width="${RUN_NOW_GLYPH.stroke_width}"`));
  const btnMarkup = (new RegExp(`<button[^>]*data-action="run_now"[^>]*>([^]*?)</button>`).exec(html) || [])[1] || "";
  check("the Run now button draws that glyph", btnMarkup.includes(RUN_NOW_GLYPH.svg));
  // The attention badge (operator 2026-10-29): the glyph IS <Icon name=inbox>, the words are the spec's.
  const { ATTENTION_GLYPH, ATTENTION_TEXT, attentionBadgeTooltip: attentionTooltip, attentionBadgeLabel } = kit;
  const inboxSvg = renderToStaticMarkup(React.createElement(Icon, { name: "inbox" }));
  const inboxInner = (/^<svg[^>]*>([^]*)<\/svg>$/.exec(inboxSvg) || [])[1];
  check("ATTENTION_GLYPH is <Icon name=inbox>'s markup", ATTENTION_GLYPH && ATTENTION_GLYPH.name === "inbox" && inboxInner === ATTENTION_GLYPH.svg, `${inboxInner} vs ${ATTENTION_GLYPH && ATTENTION_GLYPH.svg}`);
  check("ATTENTION_GLYPH viewBox/stroke match <Icon>", inboxSvg.includes(`viewBox="${ATTENTION_GLYPH.view_box}"`) && inboxSvg.includes(`stroke-width="${ATTENTION_GLYPH.stroke_width}"`));
  check("ATTENTION_TEXT is the canonical spec", eq(ATTENTION_TEXT, spec.attention));
  check("attentionTooltip: one line per count, then the hint", attentionTooltip(1, 2) === "1 conversation is waiting for you\n2 new results from your automations\nClick to open it.", attentionTooltip(1, 2));
  check("attentionTooltip: plural waits, one result", attentionTooltip(3, 1) === "3 conversations are waiting for you\n1 new result from your automations\nClick to open it.");
  check("attentionTooltip: nothing waits -> empty", attentionTooltip(0, 0) === "");
  check("attentionBadgeLabel", attentionBadgeLabel(3) === "3 waiting for you" && attentionBadgeLabel(0) === "");
}

// --- CSS ships in theme.css ------------------------------------------------------------------
const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
for (const cls of [".af-auto__path", ".af-auto__notice--on", ".af-auto__actionbar", ".af-auto__definition-chevron", ".af-auto__definition > summary", ".af-auto__json", ".af-auto__reasons", ".af-auto-failure", ".af-auto", ".af-auto-occ--quiet", ".af-auto-occ--failed", ".af-auto-occ--waiting", ".af-auto-occ--notified", ".af-auto-turn--trigger", ".af-auto__confirm", ".af-auto-wait", ".af-schedule"]) {
  check(`css ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls},`));
}

// hideHeader (round 4): the host draws its own header and controls (AbstractCode); the panel
// keeps the definition and the occurrences and is named by the automation's title.
{
  const full = panel({ summary: news, occurrences: occ });
  const bare = panel({ summary: news, occurrences: occ, hideHeader: true });
  check("default panel keeps its header", full.includes("af-auto__head") && full.includes('data-action="run_now"'));
  check("hideHeader drops the header", !bare.includes("af-auto__head") && !bare.includes("af-auto__title"));
  check("hideHeader drops the controls", !bare.includes('data-action="run_now"') && !bare.includes('data-action="archive"') && !bare.includes("af-auto__controls"));
  const sectionTag = bare.slice(0, bare.indexOf(">") + 1);
  check("hideHeader names the section by the title", sectionTag.includes(`aria-label="${news.title}"`) && !sectionTag.includes("aria-labelledby"), sectionTag);
}

// The attention rule (operator 2026-10-29): an automation opens at what needs the person: the first
// unresolved wait's card in the thread, else the run of the oldest unseen result. `attentionTarget`
// is checked against a stand-in root, and its selectors against the panel's real markup.
{
  const { attentionTarget, ATTENTION_FOCUS_MS } = kit;
  const calls = [];
  const root = (found) => ({ querySelector: (sel) => { calls.push(sel); return found[sel] ?? null; } });
  const waitEl = { id: "wait" }, runEl = { id: "run3" };
  check("attention: the first wait card wins", attentionTarget(root({ ".af-auto-occ .af-auto-wait": waitEl, '.af-auto-occ[data-index="3"]': runEl }), 3) === waitEl);
  check("attention: else the oldest unseen result's run", attentionTarget(root({ '.af-auto-occ[data-index="3"]': runEl }), 3) === runEl);
  check("attention: nothing waits and nothing is new", attentionTarget(root({}), undefined) === null && attentionTarget(null, 3) === null);
  check("attention: the outline lasts a moment", ATTENTION_FOCUS_MS > 1000 && ATTENTION_FOCUS_MS < 5000);
  // The selectors match what the panel renders: a wait card inside a run, and each run's data-index.
  const occAll = fx("occurrences.json").items;
  const html = panel({ summary: fx("list.json").items[0], occurrences: occAll });
  check("attention: a wait card is rendered inside a run (.af-auto-occ .af-auto-wait)", /<li class="af-auto-occ[^"]*"[^>]*>(?:(?!<\/li>)[\s\S])*class="af-auto-wait/.test(html));
  check("attention: runs carry data-index", /<li class="af-auto-occ[^"]*" data-index="\d+"/.test(html));
  const theme = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
  check("attention: the outline and the wait card's standard text colour are styled", theme.includes(".af-auto .is-attention-focus") && /\.af-auto-wait \{[^}]*color: var\(--text-primary\)/.test(theme));
}

// --- the automation's model: one mapping, the Edit form's Model field, the Details row ----------
{
  const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);
  const same = (a, b) => stable(a) === stable(b);
  const MTP3 = { mode: "native_mtp", num_draft_tokens: 3, require_acceleration: true };
  // AbstractCode web's automation settings write, transcribed for the model keys only
  // (abstractcode web/src/workspace/automation_settings.ts:59-62 setOrDelete, :70-87 provider/model,
  // thinking, speculation and the emptied `_runtime`). The kit's mapping must write exactly this.
  const codeWebWrite = (input, prefs) => {
    const setOrDelete = (t, k, v) => { if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) delete t[k]; else t[k] = v; };
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {});
    const next = obj(input);
    const runtime = obj(next._runtime);
    const both = Boolean(prefs.provider && prefs.model);
    setOrDelete(next, "provider", both ? prefs.provider : "");
    setOrDelete(next, "model", both ? prefs.model : "");
    setOrDelete(runtime, "provider", both ? prefs.provider : "");
    setOrDelete(runtime, "model", both ? prefs.model : "");
    setOrDelete(runtime, "thinking", prefs.reasoning);
    setOrDelete(runtime, "speculation", prefs.speculation);
    if (Object.keys(runtime).length) next._runtime = runtime;
    else delete next._runtime;
    return next;
  };
  const inputs = [
    {},
    { prompt: "Task" },
    { prompt: "Task", provider: "mlx", model: "gone-27B", _runtime: { provider: "mlx", model: "gone-27B", thinking: "high", speculation: MTP3 } },
    { prompt: "Task", _runtime: { provider: "mlx", model: "gone-27B" } },
    { prompt: "Task", provider: "mlx", model: "gone-27B", _runtime: { provider: "mlx", model: "gone-27B", thinking: "high", allowed_tools: ["read_file"] } },
    { prompt: "Task", _runtime: {} },
    { prompt: "Task", _runtime: { speculation: false } },
    // Stored as some writer left them: kept as is, never normalized (AbstractCode writes them back raw).
    { prompt: "Task", _runtime: { provider: "mlx", model: "m", speculation: { mode: "native_mtp", num_draft_tokens: 3 }, thinking: "high " } },
    { prompt: "Task", _runtime: { speculation: { mode: "off" } } },
    { prompt: "Task", provider: "a", _runtime: { model: "b" } },
  ];
  const values = [
    { provider: "", model: "" },
    { provider: "ollama", model: "qwen3" },
    { provider: "ollama", model: "qwen3", reasoning: "low" },
    { provider: "ollama", model: "qwen3", reasoning: "high", speculation: MTP3 },
    { provider: "ollama", model: "qwen3", speculation: false },
    { provider: "", model: "", reasoning: "medium" },
    { provider: "", model: "", reasoning: "", speculation: false },
    { provider: "mlx", model: "m", reasoning: "high ", speculation: { mode: "native_mtp", num_draft_tokens: 3 } },
  ];
  let parity = 0;
  for (const input of inputs) for (const value of values) {
    const frozen = JSON.stringify(input);
    const kitOut = kit.withAutomationModel(input, value);
    const codeOut = codeWebWrite(input, value);
    check(`model write == AbstractCode web's (${frozen} + ${JSON.stringify(value)})`, same(kitOut, codeOut), `${stable(kitOut)} != ${stable(codeOut)}`);
    check(`model write never mutates its input (${frozen})`, JSON.stringify(input) === frozen);
    check(`model round trip (${JSON.stringify(value)})`, same(kit.automationModelFrom(kitOut), { provider: value.provider, model: value.model, ...(value.reasoning ? { reasoning: value.reasoning } : {}), ...(value.speculation !== undefined ? { speculation: value.speculation } : {}) }), stable(kit.automationModelFrom(kitOut)));
    parity += 1;
  }
  check("model parity matrix ran", parity === inputs.length * values.length);
  // Back to the default: every model key goes, at both levels; an emptied `_runtime` goes too.
  const pinned = inputs[2];
  const cleared = kit.withAutomationModel(pinned, { provider: "", model: "" });
  check("default removes every model key at both levels and the emptied _runtime", same(cleared, { prompt: "Task" }), stable(cleared));
  const keepsTools = kit.withAutomationModel(inputs[4], { provider: "", model: "" });
  check("default keeps the rest of _runtime", same(keepsTools, { prompt: "Task", _runtime: { allowed_tools: ["read_file"] } }), stable(keepsTools));
  check("no key is ever written as \"\"", !JSON.stringify(kit.withAutomationModel(pinned, { provider: "", model: "", reasoning: "" })).includes('""'));
  let threw = "";
  try { kit.withAutomationModel(pinned, { provider: "ollama", model: "" }); } catch (e) { threw = e.message; }
  check("half a pair throws in the mapping", threw === "Choose both a provider and a model, or use the gateway default.", threw);
  // Reading: top level first, else _runtime, only as a pair.
  check("read: top-level pair", same(kit.automationModelFrom({ provider: "a", model: "b", _runtime: { provider: "x", model: "y" } }), { provider: "a", model: "b" }));
  check("read: _runtime pair", same(kit.automationModelFrom({ _runtime: { provider: "x", model: "y", thinking: "high", speculation: false } }), { provider: "x", model: "y", reasoning: "high", speculation: false }));
  check("read: half a pair reads as nothing chosen", same(kit.automationModelFrom({ provider: "a", _runtime: { thinking: "low" } }), { provider: "", model: "", reasoning: "low" }));
  check("read: nothing", same(kit.automationModelFrom(undefined), { provider: "", model: "" }) && same(kit.automationModelFrom({}), { provider: "", model: "" }));

  // reviseFormFrom / reviseChanges.
  const definition = { target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: pinned }, policy: { tool_approval: "auto" } };
  const form = kit.reviseFormFrom(news, definition);
  check("reviseFormFrom fills the model", same(form.model, { provider: "mlx", model: "gone-27B", reasoning: "high", speculation: MTP3 }), stable(form.model));
  check("reviseFormFrom without a definition: model null", kit.reviseFormFrom(news).model === null);
  check("no model change → null", kit.reviseChanges(news, form, definition) === null);
  check("model not offered (undefined) → null", kit.reviseChanges(news, { ...form, model: undefined }, definition) === null);
  const chosen = { provider: "ollama", model: "qwen3" };
  const ch = kit.reviseChanges(news, { ...form, model: chosen }, definition);
  check("new model → changes.target with the model written by the mapping", same(ch, { target: { bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: kit.withAutomationModel(pinned, chosen) } }), stable(ch));
  check("new model drops the old reasoning/MTP (the picker resets them)", !("thinking" in ch.target.input_data._runtime) && !("speculation" in ch.target.input_data._runtime));
  const toDefault = kit.reviseChanges(news, { ...form, model: { provider: "", model: "" } }, definition);
  check("back to the default removes every model key", same(toDefault.target.input_data, { prompt: "Task" }), stable(toDefault));
  const half = kit.reviseChanges(news, { ...form, model: { provider: "ollama", model: "" } }, definition);
  check("half a pair is a form error, not a throw", same(half, { errors: ["Choose both a provider and a model, or use the gateway default."] }), stable(half));
  const rawDef = { ...definition, target: { ...definition.target, input_data: inputs[7] } };
  const rawForm = kit.reviseFormFrom(news, rawDef);
  check("a stored MTP value is read as stored", same(rawForm.model.speculation, { mode: "native_mtp", num_draft_tokens: 3 }) && rawForm.model.reasoning === "high ", stable(rawForm.model));
  check("…and an unchanged model sends nothing", kit.reviseChanges(news, rawForm, rawDef) === null);
  const rawReasoning = kit.reviseChanges(news, { ...rawForm, model: { ...rawForm.model, reasoning: "low" } }, rawDef);
  check("…and a reasoning change keeps the stored MTP value as is", same(rawReasoning.target.input_data._runtime.speculation, { mode: "native_mtp", num_draft_tokens: 3 }), stable(rawReasoning));
  // Composition: task, tools, model in one save; then a workflow change keeps the model with its reasoning/MTP.
  const both = kit.reviseChanges(news, { ...form, prompt: "New task", tools: ["read_file"], model: { provider: "ollama", model: "qwen3", reasoning: "low", speculation: false } }, definition);
  const bi = both.target.input_data;
  check("task + tools + model in one save", bi.prompt === "New task" && same(bi.tools, ["read_file"]) && same(bi._runtime.allowed_tools, ["read_file"]) && bi.provider === "ollama" && bi.model === "qwen3" && bi._runtime.provider === "ollama" && bi._runtime.model === "qwen3" && bi._runtime.thinking === "low" && bi._runtime.speculation === false, stable(bi));
  const moved = kit.reviseChanges(news, { ...form, prompt: "New task", target: { bundle_ref: "other@2", flow_id: "agent" }, model: { provider: "ollama", model: "qwen3", reasoning: "low", speculation: MTP3 } }, definition);
  const mi = moved.target.input_data;
  check("workflow change keeps the chosen model, reasoning and MTP", moved.target.bundle_ref === "other@2" && mi.prompt === "New task" && mi.provider === "ollama" && mi.model === "qwen3" && same(mi._runtime, { provider: "ollama", model: "qwen3", thinking: "low", speculation: MTP3 }), stable(moved));
  const movedDefault = kit.reviseChanges(news, { ...form, target: { bundle_ref: "other@2", flow_id: "agent" }, model: { provider: "", model: "" } }, definition);
  check("workflow change + default model: no model key survives", same(movedDefault.target.input_data, { prompt: "Task" }), stable(movedDefault));

  // The Edit form: the Model field only with modelPickerOptions AND a definition.
  const transport = kit.createGatewayModelTransport(async () => ({ items: [] }));
  const opts = { fetchProviders: transport.fetchProviders, fetchModels: transport.fetchModels, fetchModelCapabilities: transport.fetchModelCapabilities };
  const formHtml = (props) => renderToStaticMarkup(React.createElement(AutomationReviseForm, { summary: news, busy: false, errors: [], onSubmit() {}, onCancel() {}, ...props }));
  const withField = formHtml({ definition, modelPickerOptions: opts });
  check("Model field with options + definition: the Model section", /data-section="model"[^>]*>[^]*?<h3 class="af-edit__section-title"[^>]*>Model<\/h3>[^]*?<div class="af-edit__field af-edit__model" data-field="model"><div class="af-pmp af-pmp--compact/.test(withField), withField.slice(withField.indexOf('data-field="model"') - 40, withField.indexOf('data-field="model"') + 200));
  check("Model section right after What it does (Title, Task), before Schedule", withField.indexOf('name="prompt"') < withField.indexOf('data-field="model"') && withField.indexOf('data-field="model"') < withField.indexOf('data-section="schedule"'));
  check("Model field: default named plainly", withField.includes("Workflow / Gateway default"));
  check("no Model field without options", !formHtml({ definition }).includes('data-field="model"'));
  check("no Model field without a definition", !formHtml({ modelPickerOptions: opts }).includes('data-field="model"'));
  check("Model field: host wording for the default", formHtml({ definition, modelPickerOptions: { ...opts, defaultModeLabel: "Gateway default" } }).includes("Gateway default") && !formHtml({ definition, modelPickerOptions: { ...opts, defaultModeLabel: "Gateway default" } }).includes("Workflow / Gateway default"));
  {
    const at = withField.indexOf('data-field="model"');
    const end = at < 0 ? -1 : withField.indexOf("</section>", at);
    check("Model field: no jargon (and the field is there to read)", at >= 0 && end > at && !/\bpin|input_data|definition|revision/i.test(withField.slice(at, end)), `at=${at} end=${end}`);
  }
  // Submitting: the picker's value reaches ReviseForm.model only when the options were passed.
  // A save needs a change: every submit below also renames (a title change never touches the target).
  const submitWith = (props, pick, meta) => {
    const out = [];
    const ed = editHarness({ summary: news, busy: false, errors: [], onSubmit: (v) => out.push(v), onCancel() {}, previewSchedule: async () => ({}), definition, ...props });
    const picker = ed.el((n) => n.type === kit.ProviderModelPicker);
    if (pick && picker) { picker.props.onChange(pick, meta); ed.rerender(); }
    const saveBefore = ed.action("edit-save").props.disabled;
    ed.type("title", "Renamed");
    ed.save();
    return { out: out[0], picker, saveBefore };
  };
  const sent = submitWith({ modelPickerOptions: opts }, { provider: "ollama", model: "qwen3" });
  check("the picker is controlled, disabled while busy, configured like Code web", sent.picker && sent.picker.props.layout === "compact" && sent.picker.props.optionsDisclosure === true && sent.picker.props.enableSpeculation === true && sent.picker.props.disabled === false && same(sent.picker.props.value, form.model));
  check("submitted ReviseForm.model = the picker's value", same(sent.out.model, { provider: "ollama", model: "qwen3" }), stable(sent.out));
  check("…and saves as a target change", kit.reviseChanges(news, sent.out, definition)?.target?.input_data?._runtime?.model === "qwen3");
  // The rule: the model is sent iff at least one NON-automatic onChange happened. On mount the picker
  // clears a stored level the model rules out with `{automatic: true}`: that alone sends nothing.
  const automatic = submitWith({ modelPickerOptions: opts }, { ...form.model, reasoning: "" }, { automatic: true });
  check("an automatic clean-up alone sends no target (and enables no Save)", automatic.saveBefore === true && same(automatic.out.model, form.model) && kit.reviseChanges(news, automatic.out, definition)?.target === undefined, stable(automatic.out.model));
  check("…while a model the person chose enables Save at once", sent.saveBefore === false);
  const chosenByHand = submitWith({ modelPickerOptions: opts }, { ...form.model, reasoning: "" });
  check("a change the person made (no pointer event needed) is sent", chosenByHand.out.model.reasoning === "" && kit.reviseChanges(news, chosenByHand.out, definition)?.target?.input_data?._runtime?.thinking === undefined && "target" in kit.reviseChanges(news, chosenByHand.out, definition), stable(chosenByHand.out.model));
  {
    // Looking without choosing: the field has no pointer/key tracking at all, so opening "Reasoning &
    // speed", focusing or pressing keys reaches the form only through onChange, and none happened.
    const out = [];
    const ed = editHarness({ summary: news, busy: false, errors: [], onSubmit: (v) => out.push(v), onCancel() {}, previewSchedule: async () => ({}), definition, modelPickerOptions: opts });
    const field = ed.el((n) => n.props["data-field"] === "model");
    const handlers = Object.keys(field.props).filter((k) => /^on[A-Z]/.test(k));
    check("the Model field tracks no pointer or key events", handlers.length === 0, handlers.join(","));
    ed.el((n) => n.type === kit.ProviderModelPicker).props.onChange({ ...form.model, reasoning: "" }, { automatic: true });
    ed.rerender();
    ed.type("title", "Renamed");
    ed.save();
    check("looking, then the automatic clean-up: a title-only save sends no target", out.length === 1 && kit.reviseChanges(news, out[0], definition)?.target === undefined && kit.reviseChanges(news, out[0], definition)?.title === "Renamed");
    ed.el((n) => n.type === kit.ProviderModelPicker).props.onChange({ ...form.model, provider: "ollama", model: "qwen3", reasoning: "" });
    ed.rerender();
    ed.el((n) => n.type === kit.ProviderModelPicker).props.onChange({ ...form.model, reasoning: "" }, { automatic: true });
    ed.rerender();
    ed.save();
    check("after a choice, a later automatic clean-up is part of what is sent", same(out[1].model, { ...form.model, reasoning: "" }), stable(out[1]?.model));
  }
  check("the form passes the model error sentences from the words file (no raw #FALLBACK line)", same(sent.picker.props.errorWords, kit.AUTOMATION_EDIT_WORDS.edit.model_errors));
  check("the form passes the warning sentence", sent.picker.props.savedUnavailableText === "The gateway does not list this model. Runs may fail until you choose another one.");
  check("…and the label suffix, both from the words file", sent.picker.props.savedUnavailableText === kit.AUTOMATION_EDIT_WORDS.edit.model_not_listed && sent.picker.props.savedUnavailableSuffix === kit.AUTOMATION_EDIT_WORDS.edit.model_not_listed_suffix && sent.picker.props.savedUnavailableSuffix === "(not listed)", String(sent.picker.props.savedUnavailableSuffix));
  // Escape: a control that handled it (an open dropdown closing) keeps the form; otherwise it cancels.
  {
    let cancelled = 0;
    const tree = editHarness({ summary: news, busy: false, errors: [], onSubmit() {}, onCancel: () => { cancelled += 1; }, previewSchedule: async () => ({}), definition, modelPickerOptions: opts }).tree;
    tree.props.onKeyDown({ key: "Escape", defaultPrevented: true, preventDefault() {} });
    check("Escape handled by a dropdown does not cancel the form", cancelled === 0);
    tree.props.onKeyDown({ key: "Escape", defaultPrevented: false, preventDefault() {} });
    check("Escape on the form cancels it", cancelled === 1);
  }
  const notOffered = submitWith({}, null);
  check("without options ReviseForm.model is absent", !("model" in notOffered.out) && !notOffered.picker, stable(notOffered.out));
  const busyTree = harness(AutomationReviseForm, false).render({ summary: news, busy: true, errors: [], onSubmit() {}, previewSchedule: async () => ({}), definition, modelPickerOptions: opts });
  check("the picker is disabled while busy", shallowAll(busyTree, (n) => n.type === kit.ProviderModelPicker)[0]?.props.disabled === true);

  // The Details row.
  const details = (input, extra) => {
    const html = withDetailsOpen({ summary: news, ...extra, definition: { schema_version: 1, revision: 1, title: news.title, controller: { bundle_ref: "c@1", flow_id: "controller" }, target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: input }, trigger: news.trigger, context: { mode: "independent" }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" }, session_id: "s", created_at: "2026-09-25T08:00:00Z", archived_at: null } });
    return (html.match(/<dd data-def="model">([^<]*)<\/dd>/) || [null, null])[1];
  };
  check("Details: Model row after Task", (() => { const html = withDetailsOpen({ summary: news, definition: { schema_version: 1, revision: 1, title: news.title, controller: { bundle_ref: "c@1", flow_id: "controller" }, target: { workflow_id: "w", bundle_ref: "b@1", flow_id: "main", input_data: { prompt: "Do it." } }, trigger: news.trigger, context: { mode: "independent" }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 1, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" }, session_id: "s", created_at: "x", archived_at: null } }); return html.indexOf('data-def="prompt"') < html.indexOf('data-def="model"') && html.indexOf('data-def="model"') < html.indexOf('data-def="trigger"'); })());
  check("Details: pinned model in words", details(pinned) === "mlx / gone-27B · reasoning high · MTP depth 3", details(pinned));
  check("Details: MTP off", details({ _runtime: { provider: "a", model: "b", speculation: false } }) === "a / b · MTP off", details({ _runtime: { provider: "a", model: "b", speculation: false } }));
  // Every stored MTP shape check_speculation.mjs lists, read through normalizeSpeculationValue.
  for (const [shape, words] of [
    [{ mode: "off" }, "a / b · MTP off"],
    [{ mode: "native_mtp", num_draft_tokens: 2 }, "a / b · MTP depth 2"],
    [true, "a / b"],
    ["native_mtp", "a / b"],
    [{ mode: "native_mtp" }, "a / b"],
    [{ mode: "native_mtp", num_draft_tokens: true }, "a / b"],
    [{ mode: "native_mtp", num_draft_tokens: 2.5 }, "a / b"],
  ]) check(`Details: stored MTP ${JSON.stringify(shape)}`, details({ _runtime: { provider: "a", model: "b", speculation: shape } }) === words, details({ _runtime: { provider: "a", model: "b", speculation: shape } }));
  check("Details: default + stored MTP off", details({ _runtime: { speculation: { mode: "off" } } }) === "Workflow / Gateway default · MTP off", details({ _runtime: { speculation: { mode: "off" } } }));
  // The panel passes modelPickerOptions down to its Edit form.
  {
    const fullDef = { schema_version: 1, revision: news.revision, title: news.title, controller: { bundle_ref: "c@1", flow_id: "controller" }, target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: pinned }, trigger: news.trigger, context: { mode: "independent" }, policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "auto" }, session_id: "s", created_at: "x", archived_at: null };
    const open = panel({ summary: news, definition: fullDef, editOpen: true, modelPickerOptions: opts });
    check("panel: Edit open with modelPickerOptions shows the Model field", open.includes('class="af-auto__revise"') && open.includes('data-field="model"'));
    check("panel: Edit open without modelPickerOptions shows none", !panel({ summary: news, definition: fullDef, editOpen: true }).includes('data-field="model"'));
  }
  check("Details: nothing chosen", details({ prompt: "x" }) === "Workflow / Gateway default", details({ prompt: "x" }));
  check("Details: nothing chosen, reasoning set", details({ _runtime: { thinking: "low" } }) === "Workflow / Gateway default · reasoning low", details({ _runtime: { thinking: "low" } }));
  check("Details: the host's wording for the default", details({}, { modelPickerOptions: { ...opts, defaultModeLabel: "Gateway default" } }) === "Gateway default");
}

// --- A run reads as trigger, then response, once (operator 2026-11-27: the notification repeated
// the answer). And the Context button (onOpenContext), and one "running" on a run in progress.
{
  const W = kit.AUTOMATION_EDIT_WORDS;
  const task = "Write today's digest.";
  const base = { run_id: "rn", index: 5, attempts: 1, fired_at: "2026-09-27T06:00:00Z", finished_at: "2026-09-27T06:01:00Z", status: "completed", trigger: { source_id: "schedule", summary: "schedule" }, user_turn: `[Trigger schedule@1 · occurrence 5 · fired 2026-09-27T06:00:00Z]\n${task}`, answer: "# Digest\n\nThree things happened.", notify: null, artifacts: [], waits: [], ledger_url: "/api/gateway/runs/rn/ledger" };
  const pairOf = (row, extra = {}) => renderToStaticMarkup(OccurrencePair({ view: kit.occurrenceViews([row])[0], busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, task, nowMs: NOW, ...extra }));
  const count = (html, s) => html.split(s).length - 1;
  const same = pairOf({ ...base, notify: { title: "Evolution of AI", body: `  ${base.answer}\n` } });
  check("notify = answer (after trimming): the answer shows once, no notify block", count(same, "Three things happened.") === 1 && !same.includes('data-notify="true"') && !same.includes("Evolution of AI"), same);
  check("…the Notified badge stays", same.includes("af-auto-badge--notified"));
  check("notifyShown: same text → false", kit.notifyShown({ notify: { title: "t", body: " x " }, answer: "x" }) === false);
  const differs = pairOf({ ...base, notify: { title: "2 urgent", body: "Reply to Clara." } });
  const answerAt = differs.indexOf('class="af-auto-turn__text"', differs.indexOf('data-turn="answer"'));
  check("notify differs: the message that was sent shows AFTER the answer, labelled", differs.includes('data-notify="true"') && differs.indexOf('data-notify="true"') > answerAt && answerAt > 0 && differs.includes(`<span class="af-auto-notify__label">${W.run.notify_sent}</span>`) && differs.includes("<strong>2 urgent</strong>") && differs.includes("Reply to Clara."), differs);
  check("…the label is in the words file", W.run.notify_sent === "The message that was sent");
  const noAnswer = pairOf({ ...base, answer: "", notify: { title: "Heads up", body: "Something changed." } });
  check("no answer: the notify block stays", noAnswer.includes('data-notify="true"') && noAnswer.includes("Something changed.") && kit.notifyShown({ notify: { title: "Heads up", body: "Something changed." }, answer: "  " }) === true);
  const titleOnly = { notify: { title: "Done.", body: "" }, answer: "Done." };
  check("a notification without a body compares its title", kit.notifyShown(titleOnly) === false && kit.notifyShown({ ...titleOnly, answer: "Other." }) === true);
  const noNotify = pairOf(base);
  check("no notify: no block, the answer once", !noNotify.includes('data-notify="true"') && count(noNotify, "Three things happened.") === 1 && kit.notifyShown(base) === false);

  // Context: one button in the trigger turn, and then no "What the agent received".
  const seen = [];
  const pairTree = OccurrencePair({ view: kit.occurrenceViews([base])[0], busy: false, discuss: { enabled: true }, discussOpen: false, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {}, task, nowMs: NOW, onOpenContext: (r) => seen.push(r) });
  const withCtx = renderToStaticMarkup(pairTree);
  const trig = withCtx.slice(withCtx.indexOf('data-turn="trigger"'), withCtx.indexOf('data-turn="answer"'));
  check("onOpenContext: ONE Context button, in the trigger turn, a real kit button with an icon", count(withCtx, 'data-action="open-context"') === 1 && trig.includes('data-action="open-context"') && /<button type="button" class="af-btn af-btn--quiet af-auto-context-btn"/.test(trig) && trig.includes("af-btn__icon") && trig.includes(`<span>${W.context.button}</span>`), trig);
  check("onOpenContext: no 'What the agent received' disclosure (one way to look)", !withCtx.includes("af-auto-received") && !withCtx.includes(parts.RECEIVED_LABEL));
  const findBtn = (n) => {
    if (!n || typeof n !== "object") return null;
    if (Array.isArray(n)) { for (const c of n) { const f = findBtn(c); if (f) return f; } return null; }
    if (n.props?.["data-action"] === "open-context") return n;
    return findBtn(n.props?.children);
  };
  findBtn(pairTree)?.props.onClick();
  check("the Context button hands the run's own id and index", eq(seen, [{ runId: "rn", index: 5 }]), JSON.stringify(seen));
  const withoutCtx = pairOf(base);
  check("without onOpenContext: the disclosure as before, no Context button", withoutCtx.includes(`<summary>${parts.RECEIVED_LABEL}</summary>`) && !withoutCtx.includes('data-action="open-context"'));
  check("the Context words", W.context.button === "Context" && W.context.button_hint === "What this run was given");
  const panelCtx = panel({ summary: mail, occurrences: occ, onOpenContext() {} });
  check("panel: onOpenContext reaches every run", count(panelCtx, 'data-action="open-context"') === new Set(occ.map((o) => o.run_id)).size && !panelCtx.includes("af-auto-received"), String(count(panelCtx, 'data-action="open-context"')));

  // G3: a run in progress says "running" once — the live line, no "Running…" placeholder under it.
  const running = { ...base, status: "running", answer: "", finished_at: undefined };
  const current = { index: 5, run_id: "rn", attempt: 1, status: "running", live: { started_at: "2026-09-27T06:00:00Z", state: "thinking", tool: null, attempt: 1, steps_done: 2 } };
  const live = pairOf(running, { current });
  check("running with the live line: no 'Running…' placeholder", live.includes("af-auto-live") && !live.includes("Running…"), live);
  const noLive = pairOf(running);
  check("running without a live line: the placeholder as before", noLive.includes("Running…"));
}

if (failures) {
  console.error(`check_automation_panel: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_panel: OK (${checks} checks)`);


// Tool selection revisions preserve unrelated inputs and distinguish defaults from deny-all.
{
  const { withAutomationTools, automationToolSelection } = await import("../dist/automations/tool_selection.js");
  const input = { prompt: "Find prices", model: "chosen", tools: ["read_file"], _runtime: { allowed_tools: ["read_file"], model: "chosen" } };
  const disabled = withAutomationTools(input, []);
  assert(JSON.stringify(disabled.tools) === "[]" && JSON.stringify(disabled._runtime.allowed_tools) === "[]", "empty means no tools");
  const inherited = withAutomationTools(input, null);
  assert(!("tools" in inherited) && !("allowed_tools" in inherited._runtime), "defaults clear only tool overrides");
  assert(inherited.model === "chosen" && inherited._runtime.model === "chosen", "tool edits preserve model");
  assert(automationToolSelection(inherited) === null, "omitted tools inherit");
  assert(input.tools[0] === "read_file", "editing does not mutate the definition");
}

{
  const { reviseFormFrom, reviseChanges } = kit;
  const definition = { target: { bundle_ref: "agent@1", flow_id: "main", input_data: { prompt: "Old task", model: "selected", tools: ["read_file"], _runtime: { model: "selected", allowed_tools: ["read_file"] } } }, policy: { tool_approval: "auto" } };
  const form = reviseFormFrom(news, definition);
  const changed = reviseChanges(news, { ...form, prompt: "New task", tools: [] }, definition);
  assert.deepEqual(changed.target.input_data.tools, []);
  assert.deepEqual(changed.target.input_data._runtime.allowed_tools, []);
  assert.equal(changed.target.input_data.prompt, "New task");
  assert.equal(changed.target.input_data.model, "selected");
  assert.equal(reviseChanges(news, form, definition), null);
  const defaults = reviseChanges(news, { ...form, tools: null }, definition);
  assert.equal(Object.hasOwn(defaults.target.input_data, "tools"), false);
}

assert.deepEqual(kit.automationToolSelection({ tools: ["read_file", "write_file"], _runtime: { allowed_tools: ["read_file"] } }), ["read_file"]);
assert.deepEqual(kit.automationToolSelection({ tools: ["read_file"], _runtime: { allowed_tools: [] } }), []);

{
  const definition = {
    target: { bundle_ref: "old@1", flow_id: "agent", input_data: { prompt: "Original task", tools: [], model: "chosen", workspace_root: "/old-session", custom_pin: "old-only", context: { task: "stale" }, _runtime: { allowed_tools: [], model: "chosen", tool_policy: { auto_approve_tools: ["write_file"] } } } },
    policy: { tool_approval: "ask" }, notify: { channels: ["console", "email"], recipients: ["self", "colleague@example.com"] },
  };
  const form = kit.reviseFormFrom(news, definition);
  const changed = kit.reviseChanges(news, { ...form, target: { bundle_ref: "new@2", flow_id: "agent" }, prompt: "New task" }, definition);
  assert.equal(changed.target.bundle_ref, "new@2");
  assert.equal(changed.target.input_data.prompt, "New task");
  assert.deepEqual(changed.target.input_data.tools, []);
  assert.equal(changed.target.input_data.model, "chosen");
  for (const key of ["workspace_root", "context", "custom_pin"]) assert(!(key in changed.target.input_data));
  assert(!("tool_policy" in changed.target.input_data._runtime));
  assert(!("notify" in changed), "workflow edits must preserve existing external recipients");
  assert.equal(kit.reviseChanges(news, { ...form, target: { bundle_ref: "old@1", flow_id: "agent" } }, definition), null);
}

{
  const target = { bundle_ref: "test@1", flow_id: "main", input_data: { prompt: "Task", tools: [] } };
  const options = { request: async () => ({ input_data_schema: { properties: { prompt: { type: "string" }, ticket: { type: "string" } }, required: ["prompt", "ticket"] } }) };
  await assert.rejects(kit.prepareAutomationTarget(target, options), /additional inputs: ticket/);
  const prepared = await kit.prepareAutomationTarget(target, { request: async () => ({ input_data_schema: { properties: { prompt: {}, ticket: { default: "default-ticket" } }, required: ["prompt", "ticket"] } }) });
  assert.equal(prepared.input_data.ticket, "default-ticket");
  assert.equal(prepared.input_data.prompt, "Task");
  assert.deepEqual(prepared.input_data.tools, []);
  await assert.rejects(kit.prepareAutomationTarget(target, { request: async () => ({}) }), /does not report/);
}

