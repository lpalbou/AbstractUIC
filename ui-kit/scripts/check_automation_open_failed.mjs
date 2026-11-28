#!/usr/bin/env node
/**
 * AutomationPanel, automations wave part K2 (no DOM; the compiled dist):
 * - open on the latest run (spec B): each run row carries `data-run-id`; the opening is decided
 *   ONCE per automation (a later render with new rows, a wait that arrives later, never scrolls
 *   again); what needs the person wins over the newest run's start (or, for a short last run, the
 *   list at its end with that run whole); "Load earlier runs" puts the first run row showing back
 *   at the top it had in the scroll area (by its run id);
 * - the live line in the row of the run in progress, and nothing new without `live`;
 * - a failed automation (spec D): its controls with and without the capabilities, the Active
 *   switch off and enabled sending resume, the header's explanation and served reason.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));
const kit = await import(join(here, "..", "dist", "index.js"));
const parts = await import(join(here, "..", "dist", "automations", "AutomationPanel.js"));
const WORDS = kit.AUTOMATION_EDIT_WORDS;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const h = React.createElement;
const list = fx("list.json").items;
const occ = fx("occurrences.json").items;
const sources = fx("trigger-sources.json").items;
const mail = list.find((s) => s.title === "Inbox triage");
const news = list.find((s) => s.title === "AI news monitor");
const NOW = Date.parse("2026-09-27T06:35:00Z");
const noop = () => Promise.resolve({ command_id: "c", accepted: true, duplicate: false, seq: 1 });
const handlers = { onRevise: noop, onCommand: noop, onDiscuss: async () => ({ session_id: "s", run_id: "r" }), onSeen: async () => {}, onLoadMore() {}, onOpenRun() {}, onAnswerWait: async () => {}, previewSchedule: async () => ({}) };
const panelHtml = (props) => renderToStaticMarkup(h(kit.AutomationPanel, { triggerSources: sources, occurrences: [], busy: false, nowMs: NOW, ...handlers, ...props }));

// The panel under a stand-in dispatcher: the root element is a stand-in too, set before effects run.
function harness(Component) {
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const slots = [];
  let i = 0;
  let pending = [];
  const D = {
    useState(init) { const k = i++; if (!(k in slots)) slots[k] = { v: typeof init === "function" ? init() : init }; const c = slots[k]; return [c.v, (nv) => { c.v = typeof nv === "function" ? nv(c.v) : nv; }]; },
    useRef(init) { const k = i++; if (!(k in slots)) slots[k] = { current: init }; return slots[k]; },
    useId() { const k = i++; if (!(k in slots)) slots[k] = `:h${k}:`; return slots[k]; },
    useEffect(fn, deps) { const k = i++; const prev = slots[k]; if (!prev || !deps || deps.some((d, j) => !Object.is(d, prev.deps[j]))) { slots[k] = { deps }; pending.push(fn); } },
  };
  return {
    render(props, root) {
      i = 0;
      pending = [];
      internals.ReactCurrentDispatcher.current = D;
      let tree;
      try { tree = Component(props); } finally { internals.ReactCurrentDispatcher.current = null; }
      if (root && tree && tree.ref) tree.ref.current = root;
      for (const fn of pending) fn();
      return tree;
    },
  };
}
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node !== "object") return;
  visit(node);
  walk(node.props && node.props.children, visit);
}
const byAction = (tree, action) => {
  const out = [];
  walk(tree, (n) => n.props && n.props["data-action"] === action && out.push(n));
  return out;
};

// --- B: run rows carry their run id ------------------------------------------------------------
{
  const html = panelHtml({ summary: mail, occurrences: occ });
  const ids = [...html.matchAll(/<li class="af-auto-occ[^"]*" data-index="\d+" data-tone="[a-z]+" data-run-id="([^"]+)"/g)].map((m) => m[1]);
  check("every run row carries data-run-id", ids.length === occ.length && occ.every((o) => ids.includes(o.run_id)), JSON.stringify(ids));
  // NEWEST_RUN_SELECTOR against the real markup: the rows are the timeline's own children, oldest
  // first, so its last child is the newest run.
  check("the newest-run selector names the timeline's rows", kit.NEWEST_RUN_SELECTOR === ".af-auto__timeline > li.af-auto-occ:last-child" && /<ol class="af-auto__timeline" aria-label="Runs"><li class="af-auto-occ/.test(html) && html.trimEnd().endsWith("</li></ol></section>"));
  const indexes = [...html.matchAll(/<li class="af-auto-occ[^"]*" data-index="(\d+)"/g)].map((m) => Number(m[1]));
  check("…and its last row is the newest run", indexes.at(-1) === Math.max(...occ.map((o) => o.index)) && indexes.every((n, i) => i === 0 || n > indexes[i - 1]), JSON.stringify(indexes));
}

// --- B: where an opening lands -----------------------------------------------------------------
const stubRoot = (rows, extra = {}) => ({
  querySelector: (sel) => extra[sel] ?? (sel === "li.af-auto-occ" ? rows[0] ?? null : sel === kit.NEWEST_RUN_SELECTOR ? rows.at(-1) ?? null : null),
});
const el = (id) => {
  const e = { id, scrolled: [], classes: new Set(), scrollIntoView(o) { e.scrolled.push(o); }, classList: { add: (c) => e.classes.add(c), remove: (c) => e.classes.delete(c) } };
  return e;
};
{
  const r1 = el("run1"), r2 = el("run2"), r3 = el("run3"), wait = el("wait");
  check("newest run = the last row (runs are oldest first)", kit.newestRunRow(stubRoot([r1, r2, r3])) === r3 && kit.newestRunRow(stubRoot([])) === null && kit.newestRunRow(null) === null);
  const t1 = kit.openingTarget(stubRoot([r1, r2, r3]), undefined);
  check("nothing needs the person → the newest run's start", t1?.el === r3 && t1.reason === "latest", JSON.stringify(t1 && { id: t1.el.id, reason: t1.reason }));
  const t2 = kit.openingTarget(stubRoot([r1, r2, r3], { ".af-auto-occ .af-auto-wait": wait }), undefined);
  check("a wait to answer wins over the newest run", t2?.el === wait && t2.reason === "attention");
  const t3 = kit.openingTarget(stubRoot([r1, r2, r3], { '.af-auto-occ[data-index="2"]': r2 }), 2);
  check("else the oldest unseen result wins over the newest run", t3?.el === r2 && t3.reason === "attention");
  check("no run on screen → nowhere", kit.openingTarget(stubRoot([]), undefined) === null);
}
{
  const o = new kit.OpeningOnce();
  check("once: not while the runs load (none shown, some counted)", o.decide("a", 0, 5) === false);
  check("once: decided on the first render that shows them", o.decide("a", 3, 5) === true);
  check("once: a later render with new rows does not decide again", o.decide("a", 4, 6) === false && o.decide("a", 4, 6) === false);
  check("once: another automation is a new opening", o.decide("b", 2, 2) === true);
  check("once: an automation without runs is decided at once, with nothing to do", o.decide("c", 0, 0) === false && o.decide("c", 1, 1) === false);
}
{
  // The panel itself: the opening scrolls once, the newest run's start, no outline; a refresh with a
  // new run (and later a wait) never scrolls again.
  const rows = occ.slice(0, 3).map((o) => ({ ...o, waits: [] }));
  const summary = { ...news, occurrence_count: rows.length, attention: { ...news.attention, items: [], waits: [], pending_waits: 0, unseen_count: 0 } };
  const r = [el("a"), el("b"), el("c")];
  let root = stubRoot(r);
  const panel = harness(kit.AutomationPanel);
  const props = { summary, occurrences: rows, triggerSources: sources, busy: false, nowMs: NOW, ...handlers };
  panel.render(props, root);
  check("panel: the opening puts the newest run's start at the top", isDeepStrictEqual(r[2].scrolled, [{ block: "start" }]) && !r[0].scrolled.length && !r[1].scrolled.length, JSON.stringify(r.map((x) => x.scrolled)));
  check("panel: the newest run is not outlined (nothing needs the person)", !r[2].classes.has("is-attention-focus"));
  const more = [...rows, { ...rows[0], run_id: "new-run", index: 99 }];
  const r4 = el("d");
  root = stubRoot([...r, r4], { ".af-auto-occ .af-auto-wait": el("late-wait") });
  panel.render({ ...props, occurrences: more, summary: { ...summary, occurrence_count: 4 } }, root);
  check("panel: a refresh with a new run and a late wait never scrolls again", r4.scrolled.length === 0 && r[2].scrolled.length === 1);
  // Another automation opens on what needs the person, outlined.
  const wait = el("w");
  const other = harness(kit.AutomationPanel);
  other.render({ ...props, summary: { ...summary, automation_id: "other" } }, stubRoot(r, { ".af-auto-occ .af-auto-wait": wait }));
  check("panel: a wait to answer is where it opens, outlined", wait.scrolled.length === 1 && wait.classes.has("is-attention-focus"));
  // openAt "none": the host decides; the panel never scrolls.
  const quiet = el("q");
  harness(kit.AutomationPanel).render({ ...props, openAt: "none" }, stubRoot([quiet]));
  check("panel: openAt none never scrolls", quiet.scrolled.length === 0);
  // Runs still loading: nothing yet, then the first render that shows them.
  const late = el("late");
  const loading = harness(kit.AutomationPanel);
  loading.render({ ...props, occurrences: [] }, stubRoot([]));
  loading.render(props, stubRoot([el("x"), late]));
  check("panel: runs that load later are where it opens (once)", late.scrolled.length === 1);
}
{
  // "Load earlier runs" keeps what the person looks at in place, by anchor.
  const place = (runId, top, bottom) => ({ runId, top, bottom });
  const rowsAt = [place("a", 10, 45), place("b", 120, 400), place("c", 400, 900)];
  check("anchor: the first run row showing in the scroll area, its top relative to the area", isDeepStrictEqual(kit.visibleRunAnchor(rowsAt, 50, 550), { runId: "b", offset: 70 }), JSON.stringify(kit.visibleRunAnchor(rowsAt, 50, 550)));
  check("anchor: a row cut by the area's top counts (it shows)", isDeepStrictEqual(kit.visibleRunAnchor(rowsAt, 30, 550), { runId: "a", offset: -20 }));
  check("anchor: none when no row shows", kit.visibleRunAnchor(rowsAt, 1000, 1500) === null && kit.visibleRunAnchor([], 0, 500) === null);
  check("anchored: the row back at the offset it had", kit.anchoredScrollTop(300, 412, 70, 3000, 500) === 642);
  check("anchored: never past what the content allows", kit.anchoredScrollTop(300, 5000, 0, 3000, 500) === 2500 && kit.anchoredScrollTop(300, -900, 0, 3000, 500) === 0 && kit.anchoredScrollTop(0, 300, 0, 400, 500) === 0);
  // The opening's rule (spec B), the same helper with offset 0 — scrollIntoView({block: "start"}) on
  // the newest run clamps the same way: its start at the top when the content allows…
  check("opening: the newest run's start at the top when the content allows", kit.anchoredScrollTop(0, 1800, 0, 3000, 500) === 1800);
  // …otherwise the list is at its end and a SHORT newest run shows whole: scroll area 500 px, the
  // content 3000 px, the newest (last) run 2800-2950 px with 50 px of list padding under it.
  const end = kit.anchoredScrollTop(0, 2800, 0, 3000, 500);
  check("opening: a short last run → the list at its end, the run fully visible", end === 2500 && 2800 - end >= 0 && 2950 - end <= 500, String(end));
  const node = (overflowY, scrollHeight, clientHeight, parentElement = null) => ({ overflowY, scrollHeight, clientHeight, scrollTop: 0, parentElement });
  const page = node("visible", 0, 0);
  const scroller = node("auto", 2000, 600, page);
  const clipped = node("hidden", 2000, 600, scroller);
  const short = node("auto", 300, 600, clipped);
  const row = node("visible", 50, 50, short);
  const style = (n) => ({ overflowY: n.overflowY });
  check("restore: the nearest ancestor that scrolls and overflows", kit.scrollParentOf(row, style, page) === scroller);
  check("restore: else the document's scrolling element", kit.scrollParentOf(node("visible", 1, 1, node("visible", 5, 5)), style, page) === page);
  // The panel: the click remembers the first row showing (b, 70 px under the area's top); the
  // earlier rows land, the button above shrinks and the area itself moves up 18 px; b is found again
  // by its run id (a new element) and put back 70 px under the area's top.
  const rows = occ.slice(0, 2);
  const summary = { ...news, occurrence_count: 5 };
  const doc = { scrollingElement: null, documentElement: null };
  let boxTop = 50;
  const box = { scrollTop: 300, scrollHeight: 3000, clientHeight: 500, clientTop: 0, overflowY: "auto", parentElement: null, isConnected: true, ownerDocument: doc, getBoundingClientRect: () => ({ top: boxTop }) };
  const li = (runId, top, bottom) => ({ runId, getAttribute: (n) => (n === "data-run-id" ? runId : null), getBoundingClientRect: () => ({ top, bottom }), parentElement: box, ownerDocument: doc, scrollIntoView() {}, classList: { add() {}, remove() {} } });
  let shown = [li("a", 10, 45), li("b", 120, 400)];
  const root = { querySelector: (sel) => (sel === kit.NEWEST_RUN_SELECTOR ? shown.at(-1) : null), querySelectorAll: (sel) => (sel === "li.af-auto-occ[data-run-id]" ? shown : []) };
  globalThis.getComputedStyle = (n) => ({ overflowY: n.overflowY ?? "visible" });
  let loads = 0;
  const panel = harness(kit.AutomationPanel);
  const props = { summary, occurrences: rows, triggerSources: sources, busy: false, nowMs: NOW, ...handlers, onLoadMore: () => { loads += 1; } };
  const tree = panel.render(props, root);
  byAction(tree, "load-more")[0].props.onClick();
  check("restore: the button still asks the host for the earlier runs", loads === 1);
  panel.render(props, root);
  check("restore: nothing moves before the earlier rows arrive", box.scrollTop === 300);
  // Three earlier rows (360 px) above, the button 18 px shorter, the area 18 px higher: b's top is
  // 120 + 360 - 18 - 18 = 444, i.e. 412 px under the area's top (32).
  boxTop = 32;
  shown = [li("e1", -400, -300), li("e2", -300, -200), li("e3", -200, -100), li("a", 334, 369), li("b", 444, 724)];
  panel.render({ ...props, occurrences: [...occ.slice(2, 5), ...rows] }, root);
  check("restore: the anchor row has the top it had in the scroll area", box.scrollTop === 642, String(box.scrollTop));
  panel.render({ ...props, occurrences: [...occ.slice(2, 6), ...rows] }, root);
  check("restore: once only", box.scrollTop === 642);
  delete globalThis.getComputedStyle;
}

// --- C: the live line in the row of the run in progress -----------------------------------------
{
  // The fixture's run in progress (#7, waiting on its wait) is the summary's current occurrence.
  const running = occ.find((o) => o.run_id === mail.current_occurrence.run_id);
  const rows = occ;
  const liveVal = { started_at: "2026-09-27T06:32:46+00:00", state: "tool", tool: { name: "web_search", arguments: { query: "AI news" } }, attempt: 1, steps_done: 7 };
  // In backoff the runtime stores the attempt about to run (controller.py retry_scheduled): shown as served.
  const backoffHtml = panelHtml({ summary: { ...mail, current_occurrence: { index: running.index, run_id: running.run_id, attempt: 2, status: "backoff" } }, occurrences: rows });
  check("backoff: the in-progress row says it waits to retry", (backoffHtml.match(/class="af-auto-live"/g) || []).length === 1 && backoffHtml.includes(">Waiting to retry (attempt 2)</span>"));
  const base = { ...mail, current_occurrence: { index: running.index, run_id: running.run_id, attempt: 1, status: "running" } };
  const plain = panelHtml({ summary: base, occurrences: rows });
  const withLive = panelHtml({ summary: { ...base, current_occurrence: { ...base.current_occurrence, live: liveVal } }, occurrences: rows });
  check("no live: no live line", !plain.includes("af-auto-live"));
  const runRow = new RegExp(`<li class="af-auto-occ[^"]*" data-index="\\d+" data-tone="[a-z]+" data-run-id="${running.run_id}"(?:(?!</li>)[\\s\\S])*`).exec(withLive)?.[0] ?? "";
  check("live: the line is in the in-progress run's row", runRow.includes('class="af-auto-live"') && runRow.includes("2:14</span> · Search the web for AI news") && runRow.includes("7 steps so far"), runRow.slice(0, 400));
  check("live: only that row has it", (withLive.match(/class="af-auto-live"/g) || []).length === 1);
  check("live: under the answer's badge line", /af-auto-turn__meta">(?:(?!<\/div>)[\s\S])*<\/div><div class="af-auto-live"/.test(runRow));
  const elsewhere = panelHtml({ summary: { ...base, current_occurrence: { ...base.current_occurrence, run_id: null, live: liveVal } }, occurrences: rows });
  check("live: a current occurrence without a run yet draws no line", !elsewhere.includes("af-auto-live"));
  const plainRow = new RegExp(`<li class="af-auto-occ[^"]*" data-index="\\d+" data-tone="[a-z]+" data-run-id="${running.run_id}"(?:(?!</li>)[\\s\\S])*`).exec(plain)?.[0] ?? "";
  const emptyOfRun = /<div class="af-auto-turn__empty">[^<]*<\/div>/.exec(plainRow)?.[0] ?? "";
  // G3: with the live line the run says "running" once: the "Running…" placeholder is gone too.
  check("no live: the markup is as before (only the live line, which replaces the Running… placeholder, differs)", withLive.replace(/<div class="af-auto-live"(?:(?!<\/div>)[\s\S])*<\/div>/, "") === plain.replace(emptyOfRun, "") && emptyOfRun !== "" && !runRow.includes("af-auto-turn__empty"), emptyOfRun);
  // A live this kit cannot word never takes the panel down: the row reads as without a live (spec C).
  for (const [what, broken] of [["an unknown state", { ...liveVal, state: "dreaming" }], ["a tool state without its call", { ...liveVal, tool: null }], ["an unreadable started_at", { ...liveVal, started_at: "soon" }]]) {
    let out = null;
    try {
      out = panelHtml({ summary: { ...base, current_occurrence: { ...base.current_occurrence, live: broken } }, occurrences: rows });
    } catch (e) {
      out = `THREW ${e.message}`;
    }
    check(`${what}: the panel renders the row as today`, out === plain, String(out).slice(0, 120));
  }
}

// --- C: a run in progress is said once ("Running", not "Running running") -----------------------
{
  const base = { ...occ.find((o) => o.status === "completed"), waits: [], notify: null, failure: null, answer: "", finished_at: null };
  const pairOf = (row, current = null) => {
    const view = kit.occurrenceViews([row])[0];
    return { view, html: renderToStaticMarkup(h(parts.OccurrencePair, { view, busy: false, discuss: { enabled: true }, discussOpen: false, current, nowMs: NOW, onOpenRun() {}, onAnswerWait() {}, onDiscussOpen() {}, onDiscussCancel() {}, onDiscussSubmit() {} })) };
  };
  const running = pairOf({ ...base, status: "running" });
  check("running: the badge says Running, the status is not said again", running.view.badge === "Running" && running.view.statusText === "" && running.html.includes(">Running</span>") && !running.html.includes("af-auto-turn__status") && !/>\s*running\s*</.test(running.html), running.html.slice(0, 600));
  const backoff = pairOf({ ...base, status: "backoff" }, { index: base.index, run_id: base.run_id, attempt: 2, status: "backoff" });
  check("backoff: Running, then the retry sentence once, never the raw status", backoff.view.statusText === "" && !/>[^<]*backoff/.test(backoff.html) && (backoff.html.match(/Waiting to retry \(attempt 2\)/g) || []).length === 1, backoff.html.slice(0, 600));
  const done = pairOf({ ...base, attempts: 2 });
  check("a finished run keeps its status text", done.view.statusText === "completed after 2 attempts" && done.html.includes('<span class="af-auto-turn__status">completed after 2 attempts</span>'));
}

// --- D: a paused automation says why, when the gateway paused it ------------------------------
{
  const head = (s) => renderToStaticMarkup(h(parts.AutomationHeader, { summary: s, triggerSources: sources, nowMs: NOW }));
  const why = "Paused after a run could not start: its workflow (python-digest) is no longer installed. Choose an installed one in Edit, then turn it back on.";
  const paused = { ...news, status: "paused", section: "paused" };
  const withWhy = head({ ...paused, paused_reason: why });
  check("paused + reason: the sentence, as served, as the header's warning note (spec G: the reason line)", withWhy.includes(`<div class="af-auto__note af-auto__note--warning af-auto__notice-line" role="note" data-fact="paused_reason">`) && withWhy.includes(`<span>${why}</span>`) && kit.automationPausedNote({ ...paused, paused_reason: why }) === why, withWhy);
  check("paused without a reason: no line", !head(paused).includes("paused_reason") && head(paused) === head({ ...paused, paused_reason: "  " }));
  check("not paused: no line, even with a stale reason", !head({ ...news, paused_reason: why }).includes("paused_reason") && kit.automationPausedNote({ ...news, status: "active", paused_reason: why }) === null);
}

// --- D: a failed automation -------------------------------------------------------------------
{
  const caps = ["revise", "resume", "archive", "discuss"];
  const failed = { ...news, status: "failed", section: "failed", capabilities: caps, current_occurrence: null, next_run_at: undefined, next_run_local: undefined };
  const c = kit.automationControls(failed);
  check("failed + capabilities: Edit, Resume, Archive enabled", c.revise.enabled && c.resume.enabled && c.archive.enabled, JSON.stringify(c));
  check("failed + capabilities: the Active switch is enabled", c.active.enabled === true, JSON.stringify(c.active));
  check("failed: Run now, Stop, Pause stay off (not listed)", !c.run_now.enabled && !c.stop_current.enabled && !c.pause.enabled);
  check("failed: the switch sends resume", kit.activeToggleCommand(failed) === "automation.resume");
  const bar = parts.AutomationControlsBar({ summary: failed, occurrences: [], busy: false, confirmingArchive: false, reviseOpen: false, onCommand() {}, onToggleRevise() {}, onAskArchive() {}, onCancelArchive() {} });
  const sent = [];
  let sw = null;
  walk(bar, (n) => { if (n.props?.action === "active") sw = n; });
  check("failed: the switch is OFF and enabled", sw && sw.props.checked === false && sw.props.unavailableReason === null, JSON.stringify(sw && { checked: sw.props.checked, why: sw.props.unavailableReason }));
  let sw2 = null;
  walk(parts.AutomationControlsBar({ summary: failed, occurrences: [], busy: false, confirmingArchive: false, reviseOpen: false, onCommand: (t) => sent.push(t), onToggleRevise() {}, onAskArchive() {}, onCancelArchive() {} }), (n) => { if (n.props?.action === "active") sw2 = n; });
  sw2.props.onChange(true);
  check("failed: turning it on sends resume", isDeepStrictEqual(sent, ["automation.resume"]), JSON.stringify(sent));
  check("failed: busy disables everything", !kit.automationControls(failed, [], true).active.enabled && !kit.automationControls(failed, [], true).resume.enabled);
  // An older gateway: a failed automation lists only discuss (or archive); nothing changes.
  const older = { ...failed, section: undefined, capabilities: ["archive", "discuss"] };
  const o = kit.automationControls(older);
  check("older gateway: the switch reads ended, as before", !o.active.enabled && o.active.reason === "The automation has ended.", JSON.stringify(o.active));
  check("older gateway: no resume, no edit", !o.resume.enabled && o.resume.reason === "Not permitted for this automation." && !o.revise.enabled);
  check("older gateway: archive as listed", o.archive.enabled);
  // A completed automation never becomes revivable.
  const done = kit.automationControls({ ...news, status: "completed", capabilities: ["archive", "discuss", "resume"] });
  check("completed: still ended", !done.active.enabled && done.active.reason === "The automation has ended." && !done.resume.enabled);
  // The header.
  const head = (s) => renderToStaticMarkup(h(parts.AutomationHeader, { summary: s, triggerSources: sources, nowMs: NOW }));
  const withReason = head({ ...failed, failed_reason: "Its flow is no longer installed. Choose another one." });
  check("header: a served reason alone, as served (a whole sentence, no prefix, never the explanation too)", withReason.includes(`data-fact="failed"`) && !withReason.includes(WORDS.failed.explain) && withReason.includes('<span data-fact="failed_reason">Its flow is no longer installed. Choose another one.</span>') && !withReason.includes("It stopped:") && !("reason_prefix" in WORDS.failed), withReason);
  check("header: the note says the reason once (the pure rule: explain is null when a reason is served)", kit.automationFailedNote({ ...failed, failed_reason: "Its flow is no longer installed. Choose another one." })?.explain === null);
  const noReason = head(failed);
  check("header: the explanation alone when no reason is served", noReason.includes(WORDS.failed.explain) && !noReason.includes('data-fact="failed_reason"'));
  const olderHead = head(older);
  check("header: an older gateway's failed automation reads as before", !olderHead.includes('data-fact="failed"') && olderHead === head({ ...older, failed_reason: "" }));
  check("header: an active automation has no failed line", !head(news).includes('data-fact="failed"') && kit.automationFailedNote(news) === null);
  check("header: a served reason without resume still says why", kit.automationFailedNote({ ...older, failed_reason: "Stopped by the runtime." })?.reason === "Stopped by the runtime." && kit.automationFailedNote({ ...older, failed_reason: "Stopped by the runtime." })?.explain === null);
}

// --- the notice always carries the button that fixes it (operator 2026-11-28) ---------------------
{
  const caps = ["revise", "resume", "archive", "discuss"];
  const failed = { ...news, status: "failed", section: "failed", capabilities: caps, current_occurrence: null, next_run_at: undefined, next_run_local: undefined, failed_reason: "It stopped on 7 Nov while starting run #38.", failed_detail: "Effect failed after 1 attempts: Workflow 'x' not found in registry" };
  const sent = [];
  const head = (s, extra = {}) => renderToStaticMarkup(h(parts.AutomationHeader, { summary: s, triggerSources: sources, nowMs: NOW, onNoticeAction: (a) => sent.push(a), ...extra }));
  const n = kit.automationNotice(failed);
  check("failed + resume: the notice's action is Restart, sending automation.resume", n?.fact === "failed" && n.action?.kind === "command" && n.action.command === "automation.resume" && n.action.label === WORDS.failed.restart && n.action.hint === WORDS.failed.restart_hint, JSON.stringify(n));
  const html = head(failed);
  check("failed: ONE notice with the sentence and a filled Restart button in it", (html.match(/role="note"/g) || []).length === 1 && /data-fact="failed"[^>]*>.*It stopped on 7 Nov while starting run #38\..*<button type="button" class="af-auto__btn af-auto__btn--primary af-auto__notice-btn" data-action="notice-restart"[^>]*>.*<span>Restart<\/span><\/button><\/div>/.test(html), html.slice(html.indexOf("af-auto__failed")));
  check("failed: the raw error never in the header", !html.includes("not found in registry"));
  check("failed: no button without a host action", !head(failed, { onNoticeAction: undefined }).includes("notice-restart"));
  check("failed without resume listed: the sentence, no button", !head({ ...failed, capabilities: ["archive", "discuss"] }).includes("notice-restart") && kit.automationNotice({ ...failed, capabilities: ["archive", "discuss"] })?.action === null);
  const busyHtml = head(failed, { noticeState: { busy: true } });
  check("sending: the button is busy and disabled", /data-action="notice-restart" disabled="" aria-busy="true"/.test(busyHtml), busyHtml.slice(busyHtml.indexOf("notice-restart") - 120, busyHtml.indexOf("notice-restart") + 80));
  const refused = head(failed, { noticeState: { error: "This automation is archived." } });
  check("refused: the gateway's sentence in the notice, the button still there", /data-fact="failed"[^>]*>.*data-fact="notice_error">This automation is archived\.<\/span>.*data-action="notice-restart"/.test(refused));
  const done = head({ ...failed, status: "active", next_run_at: "2026-09-28T06:00:00Z", next_run_local: "2026-09-28T08:00:00" }, { noticeState: { done: "Back on. Next run: x." } });
  check("done: the confirmation line, no failed notice", done.includes('data-fact="notice_done"') && done.includes("Back on. Next run: x.") && !done.includes('data-fact="failed"'));
  // Paused with a served reason: Edit at the Flow section when the flow is missing, else Turn back on.
  const paused = { ...news, status: "paused", capabilities: ["revise", "resume", "archive"], paused_reason: "Paused: its flow is no longer installed." };
  const pe = kit.automationNotice({ ...paused, flow_missing: true }, new Set(["what"]));
  check("paused + flow missing: Edit at the Flow section", pe?.action?.kind === "edit" && pe.action.section === "what", JSON.stringify(pe));
  check("paused + flow missing, form not shown: no button", kit.automationNotice({ ...paused, flow_missing: true })?.action === null);
  const pr = kit.automationNotice(paused);
  check("paused + reason: Turn back on (resume)", pr?.action?.kind === "command" && pr.action.command === "automation.resume" && pr.action.label === WORDS.failed.turn_on);
  check("paused without a reason: no notice", kit.automationNotice({ ...paused, paused_reason: undefined }) === null);
  const ar = kit.automationNotice({ ...news, status: "archived", capabilities: ["unarchive"] });
  check("archived + unarchive: Unarchive", ar?.fact === "archived" && ar.action?.kind === "command" && ar.action.command === "automation.unarchive");
  check("archived without unarchive: the line, no button", kit.automationNotice({ ...news, status: "archived", capabilities: [] })?.action === null);
  check("active: no notice", kit.automationNotice(news) === null);
  // Details: the raw error under "Technical details", selectable.
  const dlg = parts.AutomationDetailsDialog({ open: true, onClose() {}, summary: failed, children: null });
  let tech = null;
  walk(dlg, (x) => { if (x.props?.["data-fact"] === "failed_detail") tech = x; });
  const techHtml = tech ? renderToStaticMarkup(tech) : "";
  check("Details: Technical details with the raw error", techHtml.includes(WORDS.failed.technical) && techHtml.includes("<pre class=\"af-auto__technical-text\">Effect failed after 1 attempts"), techHtml);
  // The hook: one id per action (reused after a transport failure), busy, refusal, done.
  const calls = [];
  let reply = () => Promise.reject({ status: 0, code: "network", message: "fetch failed" });
  let mint = 0;
  const ids = new kit.ActionIds(() => `id-${++mint}`);
  const Host = (p) => kit.useAutomationNoticeAction(p.summary, ids, (type, payload, meta) => { calls.push({ type, meta }); return reply(); }, () => calls.push("edit"), NOW);
  const hh = harness(Host);
  let r = hh.render({ summary: failed });
  r.onAction(n.action);
  r = hh.render({ summary: failed });
  check("hook: busy while sent", r.state.busy === true);
  await new Promise((res) => setTimeout(res, 0));
  r = hh.render({ summary: failed });
  check("hook: a transport failure shows its sentence, the button stays", r.state.error === "fetch failed" && !r.state.busy && !r.state.done);
  reply = () => Promise.resolve({ accepted: true });
  r.onAction(n.action);
  await new Promise((res) => setTimeout(res, 0));
  r = hh.render({ summary: { ...failed, status: "active", next_run_at: "2026-09-28T06:00:00Z", next_run_local: "2026-09-28T08:00:00" } });
  check("hook: sends automation.resume with the SAME id on the retry", calls.length === 2 && calls.every((c) => c.type === "automation.resume") && calls[0].meta.command_id === calls[1].meta.command_id, JSON.stringify(calls));
  check("hook: done says Back on and the served next run", typeof r.state.done === "string" && r.state.done.startsWith("Back on. Next run: ") && r.state.done.includes("(in "), r.state.done);
  check("hook: done says only Back on while the summary is not served active yet", hh.render({ summary: failed }).state.done === WORDS.failed.back_on);
  r.onAction({ kind: "edit", section: "what" });
  check("hook: Edit opens the form", calls.at(-1) === "edit");
}

if (failures) {
  console.error(`check_automation_open_failed: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_automation_open_failed: OK (${checks} checks: open on the latest run, live line in the panel, a run in progress said once, failed and paused automations)`);
