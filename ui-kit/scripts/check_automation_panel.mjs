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
  if (node.type === AutomationReviseForm) return walk(harness(AutomationReviseForm).render(node.props), visit);
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
// The "Active" state toggle (operator 2026-09-30): aria-pressed, aria-disabled when unavailable.
const toggle = (html) => button(html, "active");
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
  check("scheduled pairs show the decided summary wording", chunks[0].includes("schedule: every 30 minutes (UTC), tick 0") && chunks[6].includes("schedule: every 30 minutes (UTC), tick 5"));
  check("#5 badged Failed after 3 attempts", chunks[4].includes(">Failed after 3 attempts<"));
  const f5 = occ.find((o) => o.index === 5).failure;
  check("#5 renders its failure: reason_code, message, after N attempts", chunks[4].includes(`<div class="af-auto-failure" data-failure="${f5.reason_code}"><strong>${f5.reason_code}</strong>: ${esc(f5.message)}`) && chunks[4].includes(`(after ${f5.attempts} attempts)`));
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
  check("tool_approval wait: group labelled, kind label, tool call listed with its arguments", chunks[6].includes('data-wait-kind="tool_approval"') && chunks[6].includes(">Approval needed</span>") && chunks[6].includes(`<code class="af-auto-wait__tool">${tw.details[0].name}</code>`) && chunks[6].includes(esc(JSON.stringify(tw.details[0].arguments, null, 2))));
  check("tool_approval wait: Approve and Deny, no free text", enabled(chunks[6], "wait-approve") && enabled(chunks[6], "wait-deny") && (chunks[6].match(/aria-label="Your answer"/g) || []).length === 1);
  check("no wait controls on other occurrences", chunks.filter((c, i) => i !== 6).every((c) => !c.includes("af-auto-wait")));
  check("every pair has expandable run details with Open run ledger (and no raw ledger href)", chunks.every((c) => c.includes("<details class=\"af-auto-occ__details\"><summary>Run details</summary>") && c.includes('data-action="open-run"') && !/href="\/api\//.test(c)));
  check("Discuss labelled as a fork at this occurrence (own workspace, automation files read-only)", mailHtml.includes(`<span>${esc(DISCUSS_LABEL)}</span></button>`) && DISCUSS_LABEL === "Discuss — fork at this occurrence (own workspace, automation files read-only)");
  check("no stale 'read-only workspace' wording", !mailHtml.includes("read-only workspace") && !mailHtml.includes("forked session"));
  check("Discuss disabled on the waiting occurrence only", chunks.every((c, i) => (/data-action="discuss" disabled=""/.test(c)) === (i === 6)));
  check("header: every 30 minutes (UTC), growing, next run", mailHtml.includes(">every 30 minutes (UTC)</dd>") && mailHtml.includes("Growing — each run sees the previous runs") && mailHtml.includes('data-fact="next">2026-09-27 07:00 UTC (in 25 min)</dd>'));
  check("header: attention 2 unseen + 2 waiting, notable", mailHtml.includes('class="is-notable">2 unseen · 2 waiting for you</dd>'));
  check("attention strip lists both items oldest first", mailHtml.indexOf('data-cursor="att1:1"') > 0 && mailHtml.indexOf('data-cursor="att1:2"') > mailHtml.indexOf('data-cursor="att1:1"'));
  check("attention strip lists the pending wait", mailHtml.includes("af-auto__attention-item--wait"));
  check("controls: Active toggle pressed and available; run now disabled while an occurrence waits; stop current enabled", toggleOn(mailHtml) && toggleAvailable(mailHtml) && !enabled(mailHtml, "run_now") && enabled(mailHtml, "stop_current"));
  check("controls: no Pause/Resume verb buttons, the toggle is labelled Active", noVerbPair(mailHtml) && /data-action="active"[^>]*>.*?<span class="af-switch__label">Active<\/span><\/span><\/button>/.test(mailHtml));
  check("controls: labelled toolbar", mailHtml.includes('role="toolbar" aria-label="Automation controls"'));
  check("section labelled by the title, aria-busy false", /<section class="af-auto" aria-labelledby="([^"]+)" aria-busy="false" data-text-rendering="unformatted">/.test(mailHtml) && /<h2 class="af-auto__title" id="[^"]+" tabindex="-1">Inbox triage<\/h2>/.test(mailHtml));
  check("all occurrences loaded → no load-more", button(mailHtml, "load-more") === null);
}

// --- News monitor: every 8 hours, load more ---------------------------------------------
{
  const html = panel({ summary: news, occurrences: [] });
  check("news: every 8 hours (UTC)", html.includes(">every 8 hours (UTC)</dd>"));
  check("news: independent", html.includes("Independent — each run starts fresh"));
  check("news: next run (absolute + relative, from next_fire_at)", html.includes('data-fact="next">2026-09-27 08:00 UTC (in 1 h 25 min)</dd>'));
  check("news: nothing in flight → no 'Now' fact", !html.includes('data-fact="current"'));
  const ws = (/<dd data-fact="workspace"[^]*?<\/dd>/.exec(html) || [""])[0];
  check("news: workspace shown, folder icon + whole path (no control without onOpenWorkspace)", ws.startsWith('<dd data-fact="workspace" class="af-auto__workspace"><span class="af-auto__path af-auto__path--static"><svg') && ws.replace(/<[^>]+>/g, "") === news.workspace_root && button(html, "open-workspace") === null);
  check("news: the path wraps at its separators (<wbr> after each /), text unchanged", ws.includes("/<wbr/>") && ws.includes("-<wbr/>"));
  check("news: attention quiet", html.includes('data-fact="attention">nothing new</dd>') && !html.includes("af-auto__attention\""));
  check("news: Active switch on and available, run now enabled, stop current disabled", toggleOn(html) && toggleAvailable(html) && enabled(html, "run_now") && !enabled(html, "stop_current"));
  check("news: load more (6 more)", enabled(html, "load-more") && html.includes("Load earlier occurrences (6 more)"));
  check("news: no occurrences text", html.includes("No occurrences yet."));
}

// --- current_occurrence / next_fire_at (runtime 64ee72a) --------------------------------------
{
  check("mail: 'Run #7 running' from current_occurrence", mailHtml.includes('<dt>Now</dt><dd data-fact="current" class="is-notable">Run #7 running</dd>'));
  check("mail: next run shown WHILE an occurrence runs (active + scheduled)", mailHtml.includes('data-fact="next">2026-09-27 07:00 UTC (in 25 min)'));
  // Never inferred from last_occurrence: a waiting last occurrence with current_occurrence null shows nothing in flight.
  const stale = panel({ summary: { ...mail, current_occurrence: null }, occurrences: [] });
  check("no 'Now' when current_occurrence is null, even if last_occurrence is waiting", mail.last_occurrence.status === "waiting" && !stale.includes('data-fact="current"'));
  check("controls follow current_occurrence, not last_occurrence (run now on, stop off)", enabled(stale, "run_now") && !enabled(stale, "stop_current"));
  const flying = panel({ summary: { ...news, current_occurrence: { index: 7, run_id: news.last_occurrence.run_id, attempt: 2, status: "backoff" } }, occurrences: [] });
  check("in-flight occurrence on a row whose last occurrence is completed → Now + stop enabled", flying.includes(">Run #7 waiting to retry (attempt 3)</dd>") && enabled(flying, "stop_current") && !enabled(flying, "run_now"));
  const L = kit.currentOccurrenceLabel;
  check("labels: running / starting / attempt / none", L(mail) === "Run #7 running" && L({ current_occurrence: { index: 3, run_id: "r", attempt: 1, status: "admitted" } }) === "Run #3 starting" && L({ current_occurrence: { index: 3, run_id: "r", attempt: 2, status: "running" } }) === "Run #3 running (attempt 2)" && L(news) === null && L({}) === null);
  const R = kit.relativeIn;
  check("relativeIn: min / h / d / due", R("2026-09-27T06:36:00Z", NOW) === "in 1 min" && R("2026-09-27T09:35:00Z", NOW) === "in 3 h" && R("2026-09-29T08:35:00Z", NOW) === "in 2 d 2 h" && R("2026-09-27T06:00:00Z", NOW) === "due now");
  check("paused: no next run time, no Now", jour.current_occurrence === null && panel({ summary: jour }).includes('data-fact="next">none while paused</dd>'));
}

// --- Journal (paused): run now while paused ------------------------------------------
{
  const html = panel({ summary: jour, occurrences: [] });
  check("journal: every 7 days (UTC) · 12 runs max", html.includes(">every 7 days (UTC) · 12 runs max</dd>"));
  check("journal: Active toggle plain (paused) and available; no Pause/Resume buttons", !toggleOn(html) && toggleAvailable(html) && noVerbPair(html) && /data-action="active"[^>]*aria-checked="false"/.test(html));
  check("journal: RUN NOW ENABLED WHILE PAUSED", enabled(html, "run_now"));
  check("journal: paused hint says run now keeps it paused", html.includes("Run now works and keeps it paused."));
  check("journal: next run none while paused", html.includes(">none while paused</dd>"));
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
  check("discuss form help text is the exact shared sentence (file-tools-only mount; shell not sandboxed)", dhtml.includes(esc("Starts a new session that forks this automation at #2 with its full history (runs 1–2). It works in its own writable workspace; the automation's files are mounted read-only for the file tools (shell commands are not sandboxed), and nothing is written back into the automation's session.")) && dhtml.includes(`aria-label="${esc(DISCUSS_LABEL)}, from occurrence 2"`), dhtml.slice(0, 400));
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
  check("header: folder button on the Workspace fact", hbtn.length === 1 && find(hbtn[0], (n) => n.type === "svg").length === 1 && hbtn[0].props["aria-label"] === `Browse the automation's folder ${news.workspace_root}`);
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
  const f = React.createElement(AutomationReviseForm, { summary: news, busy: false, errors: [], onSubmit: (v) => submitted.push(v), onCancel() {} });
  const html = renderToStaticMarkup(f);
  check("edit form: headed Edit automation; title, interval, context fields labelled", /<form class="af-auto__revise" aria-labelledby="([^"]+)"><h3 class="af-auto__form-title" id="\1"><svg[^]*<\/svg> Edit automation<\/h3>/.test(html) && html.includes('name="title"') && html.includes('aria-label="Interval amount"') && html.includes('<legend>Repeat every (UTC)</legend>') && html.includes('value="growing"'));
  const vals = { title: "News (6h)", every_amount: "6", every_unit: "h", context: "growing" };
  submitted.push(parts.readReviseForm({ elements: { namedItem: (k) => (k in vals ? { value: vals[k] } : null) } }, kit.reviseFormFrom(news)));
  check("edit form reads its fields", eq(submitted[0], { title: "News (6h)", every: "6h", context: "growing", growingMaxTokens: 50000, prompt: null, toolApproval: null, notifyEmail: null, emailRecipients: null }), JSON.stringify(submitted[0]));
  check("edit form without a definition offers no task / tools", !html.includes('name="prompt"') && !html.includes('name="tool_approval"'));
  check("edit form: Save changes + Cancel, with icons; never 'revision'", /data-action="edit-save"[^>]*><svg[^]*?<span>Save changes<\/span>/.test(html) && /data-action="edit-cancel"[^>]*><svg[^]*?<span>Cancel<\/span>/.test(html) && !/Revis|revision/.test(html));
  // With the committed definition: the task and tool approval are editable too.
  const def = { target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Search the AI news.", provider: "p", model: "m" } }, policy: { tool_approval: "auto" } };
  const sub2 = [];
  const f2 = React.createElement(AutomationReviseForm, { summary: news, definition: def, busy: false, errors: [], onSubmit: (v) => sub2.push(v), onCancel() {} });
  const html2 = renderToStaticMarkup(f2);
  check("edit form + definition: task prefilled, tools radios", /<textarea[^>]*name="prompt"[^>]*>Search the AI news.<\/textarea>/.test(html2) && /name="tool_approval" checked="" value="auto"/.test(html2) && html2.includes('value="ask"'));
  const vals2 = { title: news.title, every_amount: "8", every_unit: "h", context: "independent", prompt: "Search the AI news, twice.", tool_approval: "ask" };
  sub2.push(parts.readReviseForm({ elements: { namedItem: (k) => (k in vals2 ? { value: vals2[k] } : null) } }, kit.reviseFormFrom(news, def)));
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
  check("manual trigger summary", kit.triggerSummary({ source_id: "manual", source_version: 1, config: {} }) === "manual runs only");
  const all = [mailHtml, panel({ summary: news }), panel({ summary: jour })].join("");
  check("no calendar/local wording anywhere", !/daily|local time| local\b|o'clock/i.test(all));
}

// --- create request (AfScheduleDialog's builder) -------------------------------------------
{
  const target = { flow_id: "@default", interface: "abstractcode.agent.v1" };
  const r = kit.buildCreateRequest({ prompt: "Check ACME share price\nNotify if it moved 2%.", when: { kind: "every", amount: 5, unit: "m" }, context: "independent" }, { target, requestId: "req-1" });
  check("every 5 minutes, first run now", r.ok && eq(r.body, { request_id: "req-1", title: "Check ACME share price", target: { flow_id: "@default", interface: "abstractcode.agent.v1", input_data: { prompt: "Check ACME share price\nNotify if it moved 2%." } }, trigger: { source_id: "schedule", source_version: 1, config: { every: "5m" } }, context: { mode: "independent" }, policy: { tool_approval: "auto" } }), JSON.stringify(r));
  const askPolicy = kit.buildCreateRequest({ prompt: "x", when: { kind: "every", amount: 5, unit: "m" }, context: "independent", toolApproval: "ask" }, { target, requestId: "r" });
  check("D1: toolApproval ask → policy.tool_approval ask", askPolicy.ok && eq(askPolicy.body.policy, { tool_approval: "ask" }));
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
  // R13.2: no disclosure anywhere in the dialog; title and limits are a visible fieldset.
  check("dialog: no disclosure (no details/summary, no Advanced)", !/<details|<summary|>Advanced</.test(html));
  check("dialog: visible Title and limits fieldset with title, first run, stop after, stop at", html.includes('data-field="limits"><legend>Title and limits</legend>') && html.includes("Defaults to the task&#x27;s first line") && html.includes("First run at (UTC; empty = now)") && html.includes("Stop after this many runs") && html.includes("Stop at (UTC)"));
  check("dialog: no Workspaces section without the host slot", !html.includes('data-field="workspaces"') && !html.includes("<legend>Workspaces</legend>"));
  const ws = dlg({ workspaces: React.createElement("div", { id: "host-workspaces" }, "chooser") });
  check("dialog: Workspaces slot = visible fieldset after Tools, before Mailbox", /data-field="workspaces"><legend>Workspaces<\/legend><div id="host-workspaces">chooser<\/div><\/fieldset>/.test(ws) && ws.indexOf('data-field="tool-approval"') < ws.indexOf('data-field="workspaces"') && ws.indexOf('data-field="workspaces"') < ws.indexOf('data-field="email"'));
  check("dialog: Workspaces slot sends nothing itself (no workspace in the markup outside the slot)", ws.split("host-workspaces").length === 2);
  check("dialog: no calendar/local wording", !/daily|local time| local\b/i.test(html));
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
  check("waiting row: Discuss reason is visible", mailHtml.includes(">Available once this occurrence finishes.</span>"));
}

// --- F5: visible reasons for disabled controls (aria-describedby) --------------------------
{
  const html = panel({ summary: mail, occurrences: occ });
  const b = button(html, "run_now");
  const ref = (/aria-describedby="([^"]+)"/.exec(b) || [])[1];
  check("disabled Run now references a reason", !!ref, b);
  check("…and the reason is VISIBLE, compact and muted (tooltips on disabled buttons are unreliable)", ref && new RegExp(`<p class="af-auto__reasons"><svg[^]*?</svg><span id="${ref.replace(/[:]/g, "\\:")}">Run now: An occurrence is in progress.</span>`).test(html) && !/af-auto__reasons af-auto__sr-only/.test(html), ref);
  check("enabled controls carry no reason", !/aria-describedby/.test(button(html, "active")) && !/aria-describedby/.test(button(html, "edit")) && !/title="(Already|Nothing|Working|The automation)/.test(button(html, "active")));
  check("the disabled control's reason is also its tooltip (first line, then the hint)", /<button[^>]*data-action="run_now"[^>]*title="An occurrence is in progress.\n/.test(html));
  const busy = panel({ summary: news, occurrences: [], busy: true });
  check("busy: one shared reason line for all controls", busy.includes("Active, Run now, Stop current, Edit, Archive: Working…"));
  const fake = (sel) => ({ querySelector: (q) => sel[q] ?? null });
  const mk = (name, disabled = false) => ({ name, disabled, focus() {} });
  const { pickFocusTarget } = await import(join(here, "..", "dist", "automations", "panel_core.js"));
  check("pickFocusTarget skips a disabled opener → notice", pickFocusTarget(fake({ a: mk("a", true), b: mk("b") }), ["a", "b"]).name === "b");
  check("pickFocusTarget: none → null", pickFocusTarget(fake({}), ["a"]) === null && pickFocusTarget(null, ["a"]) === null);
  check("title is a focus fallback", /<h2 class="af-auto__title" id="[^"]+" tabindex="-1">/.test(html));
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
  // F6: /seen acknowledged only after success; retried on the next render with a new summary.
  const calls6 = [];
  let fail = true;
  const props = { summary: mail, occurrences: occ, triggerSources: sources, busy: false, ...handlers, newId: () => "x", onSeen: (c) => { calls6.push(c); return fail ? Promise.reject(new TypeError("offline")) : Promise.resolve(); } };
  const h = harness(AutomationPanel);
  h.render(props);
  await flush();
  h.render(props);
  await flush();
  check("F6: failed /seen is not retried on the same summary (no loop)", eq(calls6, ["att1:2"]), JSON.stringify(calls6));
  fail = false;
  const again = { ...props, summary: { ...mail } };
  h.render(again);
  await flush();
  check("F6: retried on the next render with a new summary", eq(calls6, ["att1:2", "att1:2"]));
  h.render({ ...props, summary: { ...mail } });
  await flush();
  check("F6: once acknowledged, not sent again", calls6.length === 2);
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
  evForm.props.onSubmit(sub("price=101"));
  check("D1: event with invalid JSON sends nothing and reports", got.length === n && errs.length === 1 && errs[0].includes("not valid JSON"));
  check("D1: event form has a labelled JSON field", renderToStaticMarkup(form(ev)).includes('aria-label="Event payload (JSON)"'));
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
  check("the bar leads with the Active switch", all.length === 5 && /^<button type="button" role="switch"[^>]*data-action="active"/.test(all[0]), all[0]);
  const btns = all.filter((b) => !/role="switch"/.test(b));
  check("every control button starts with its icon, then its label", btns.length === 4 && btns.every((b) => /^<button\b[^>]*><svg\b[^]*<\/svg><span>[^<]+<\/span><\/button>$/.test(b)), btns.join("\n"));
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
  const vals = { title: jour.title, every_amount: "7", every_unit: "d", context: jour.context_mode, prompt: "Summarise the week in three bullets.", tool_approval: "auto" };
  find(tree, (n) => n.type === "form")[0].props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: (k) => (k in vals ? { value: vals[k] } : null) } } });
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
  const form3 = find(tree3, (n) => n.type === "form")[0];
  const titleInput = find(tree3, (n) => n.type === "input" && n.props.name === "title")[0];
  check("an open form keeps the values it opened with across a refresh", titleInput && titleInput.props.defaultValue === jour.title, titleInput && titleInput.props.defaultValue);
  const vals3 = { title: jour.title, every_amount: "7", every_unit: "d", context: jour.context_mode, prompt: "Summarise the week, briefly.", tool_approval: "auto" };
  form3.props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: (k) => (k in vals3 ? { value: vals3[k] } : null) } } });
  await flush();
  check("save after a concurrent rename: expected_revision is the revision the form opened with", staleSent.length === 1 && staleSent[0].expected === jour.revision, JSON.stringify(staleSent));
  check("save after a concurrent rename: no title change (the rename is not reverted)", staleSent.length === 1 && !("title" in staleSent[0].changes) && staleSent[0].changes.target && staleSent[0].changes.target.input_data.prompt === "Summarise the week, briefly.", JSON.stringify(staleSent));
  // Closing and reopening takes a fresh snapshot.
  h3.render({ ...refreshed, editOpen: false }, root);
  const reopened = h3.render(refreshed, root);
  const t4 = find(reopened, (n) => n.type === "input" && n.props.name === "title")[0];
  check("reopening the form starts from the current automation", t4 && t4.props.defaultValue === "Renamed elsewhere");
}

// --- real gateway formats ----------------------------------------------------------------------
{
  check("formatUtc: gateway +00:00 with microseconds", kit.formatUtc("2026-09-27T10:14:55.865625+00:00") === "2026-09-27 10:14:55 UTC");
  check("formatUtc: whole minute with microseconds", kit.formatUtc("2026-09-27T07:00:00.412307+00:00") === "2026-09-27 07:00 UTC");
  check("formatUtc: Z form still works", kit.formatUtc("2026-09-27T08:00:00Z") === "2026-09-27 08:00 UTC");
  check("formatUtc: other offsets normalised to UTC", kit.formatUtc("2026-09-27T10:00:00.000000+02:00") === "2026-09-27 08:00 UTC");
  check("fixture fired_at renders as UTC", mailHtml.includes("fired 2026-09-27 04:00 UTC"));
  const leg = panel({ summary: legacyRow, occurrences: [] });
  check("real legacy row: marker, every control disabled with the legacy reason", leg.includes("Legacy schedule") && ["run_now", "stop_current", "edit", "archive"].every((a) => !enabled(leg, a)) && !toggleAvailable(leg) && leg.includes("Legacy schedule: managed with its existing controls."));
  check("real legacy row: every hour (UTC), no revision", leg.includes(">every hour (UTC)</dd>") && !leg.includes('data-fact="revision"'));
  const tw = occ.find((o) => o.index === 7).waits.find((x) => x.kind === "tool_approval");
  check("real tool_approval wait has no prompt → the panel's own sentence", !("prompt" in tw) && mailHtml.includes("A tool call needs your approval."));
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
  const block = (html.match(/<details class="af-auto__definition"[\s\S]*?<\/details>/) || [""])[0];
  check("definition: collapsed card, chevron + icon + 'Definition' + its revision", /^<details class="af-auto__definition" data-definition-revision="1"><summary><svg[^]*?<\/svg><svg[^]*?<\/svg><span class="af-auto__definition-title">Definition<\/span><span class="af-auto__definition-meta">revision 1<\/span><\/summary>/.test(block), block.slice(0, 300));
  check("definition: target workflow", block.includes('data-def="target"><code>basic-agent@0.1.0:main</code>'));
  check("definition: trigger source + label + config", block.includes('data-def="trigger">schedule@1 · every 8 hours (UTC)') && block.includes(esc(JSON.stringify(news.trigger.config, null, 2))));
  check("definition: context", block.includes('data-def="context">Independent — each run starts fresh'));
  check("definition: tool approval auto", block.includes('data-def="tool_approval">Run without asking (auto)'));
  check("definition: retry policy", block.includes('data-def="retry">3 attempts, backoff 30s ×2 up to 10m'));
  check("definition: revision", block.includes('data-def="revision">1</dd>'));
  const ask = panel({ summary: news, occurrences: [], definition: { ...definition, revision: 3, policy: { ...definition.policy, tool_approval: "ask" } } });
  check("definition: tool approval ask + new revision", ask.includes('data-def="tool_approval">Ask before each tool call (ask)') && ask.includes('<span class="af-auto__definition-meta">revision 3</span>'));
  check("definition: absent prop → no block", !panel({ summary: news, occurrences: [] }).includes("af-auto__definition"));
  check("definition: right under the controls (one click away)", html.indexOf("</header>") < html.indexOf('role="toolbar"') && html.indexOf('role="toolbar"') < html.indexOf("af-auto__definition") && html.indexOf("af-auto__definition") < html.indexOf("af-auto__timeline") + (html.includes("af-auto__timeline") ? 0 : html.length));
  check("definition: replaced by the Edit form while it is open", !panel({ summary: news, occurrences: [], definition, editOpen: true }).includes('class="af-auto__definition"') && panel({ summary: news, occurrences: [], definition, editOpen: true }).includes('class="af-auto__revise"'));
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
    "Triage my **inbox**.",
  ];
  check("renderText gets every user_turn, answer, notify body, wait prompt, attention body and the definition task", want.every((t) => seen.includes(t)), JSON.stringify(want.filter((t) => !seen.includes(t)).slice(0, 2)));
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
  const active = { ...news, status: "active", context_mode: "independent", next_fire_at: "2026-09-27T08:00:00.108652+00:00" };
  check("controlHint(run_now) adds the next scheduled time (formatUtc)", controlHint("run_now", active) === `${rn}\nNext scheduled run: 2026-09-27 08:00 UTC.`, controlHint("run_now", active));
  check("controlHint(run_now) adds the Growing line only for growing", controlHint("run_now", { ...active, context_mode: "growing" }).endsWith(`\n${RUN_NOW_GROWING_LINE}`) && !controlHint("run_now", active).includes("Growing"));
  check("controlHint(run_now) without next_fire_at (paused/manual) = the static hint", controlHint("run_now", { ...active, next_fire_at: undefined }) === rn);
  check("controlHint(other) = its static hint", ids.filter((i) => i !== "run_now").every((i) => controlHint(i, active) === CONTROL_HINTS[i]));
  // The bar: every control's tooltip and aria-description is its hint.
  const html = panel({ summary: active, occurrences: [] });
  const b = button(html, "run_now");
  const want = esc(controlHint("run_now", active));
  check("Run now button: title = hint", b && b.includes(`title="${want}"`), b);
  check("Run now button: aria-description = hint", b && b.includes(`aria-description="${want}"`), b);
  check("every bar control carries its hint", [["active", "active"], ["stop_current", "stop_current"], ["edit", "revise"], ["archive", "archive"]].every(([a, id]) => (button(html, a) || "").includes(`aria-description="${esc(CONTROL_HINTS[id])}"`)));
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

