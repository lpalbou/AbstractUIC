#!/usr/bin/env node
/**
 * Automations wave, kit part K2 (no DOM; renderToStaticMarkup over the compiled dist):
 * - the shared words file is exported, typed, and the source of the words it now provides;
 * - list groups: Failed by `section` and by `status`, Paused by `section` only, served counts,
 *   zero = absent fold; the fold header, its toggle and the remembered per-app open state;
 * - the live line of a run in progress: every state, no `live`, the elapsed clamp, a tool worded
 *   through `describeToolCall`, the steps line, a live it cannot word = nothing; the refresh delay.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { find, mountHook } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const WORDS = JSON.parse(readFileSync(join(here, "..", "src", "automations", "automation_edit_words.json"), "utf8"));
const list = JSON.parse(readFileSync(join(here, "fixtures", "automations", "list.json"), "utf8")).items;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

// --- words ------------------------------------------------------------------------------------
check("the words are exported as the file says", isDeepStrictEqual(kit.AUTOMATION_EDIT_WORDS, WORDS));
for (const name of ["automationGroups", "automationGroupLabel", "readAutomationGroupOpen", "writeAutomationGroupOpen", "AutomationGroupFold", "automationLiveWords", "liveElapsed", "automationRefreshMs", "AutomationLiveLine"])
  check(`export ${name}`, typeof kit[name] === "function");

// --- groups -----------------------------------------------------------------------------------
const row = (id, status, section) => ({ ...list[1], automation_id: id, title: id, status, ...(section === undefined ? {} : { section }) });
{
  const rows = [row("a1", "active", "active"), row("f1", "failed", "failed"), row("a2", "completed", "active"), row("p1", "paused", "paused"), row("f2", "failed", "failed"), row("x1", "archived", "archived")];
  const g = kit.automationGroups(rows, { failed_automations_count: 5, paused_automations_count: 4 });
  const ids = (grp) => grp.rows.map((r) => r.automation_id);
  check("failed by section, in the served order", isDeepStrictEqual(ids(g.failed), ["f1", "f2"]), JSON.stringify(ids(g.failed)));
  check("completed stays in the main list; archived rows the host shows too", isDeepStrictEqual(ids(g.active), ["a1", "a2", "x1"]), JSON.stringify(ids(g.active)));
  check("paused by section", isDeepStrictEqual(ids(g.paused), ["p1"]));
  check("counts: the served counts for Failed and Paused, the rows for the main list", g.failed.count === 5 && g.paused.count === 4 && g.active.count === 3, JSON.stringify([g.failed.count, g.paused.count, g.active.count]));
  const unserved = kit.automationGroups(rows);
  check("counts: the rows when the gateway serves none", unserved.failed.count === 2 && unserved.paused.count === 1);
  const junk = kit.automationGroups(rows, { failed_automations_count: -1, paused_automations_count: "4" });
  check("counts: a served count that is not a whole number ≥ 0 is not one", junk.failed.count === 2 && junk.paused.count === 1);
}
{
  // An older gateway: no `section` at all. A failed automation is still in Failed (its status); no
  // Paused group (as before: every other row in the main list).
  const older = [row("a", "active"), row("f", "failed"), row("p", "paused")];
  const g = kit.automationGroups(older, { paused_automations_count: 1 });
  check("older gateway: failed by status", g.failed.rows.length === 1 && g.failed.rows[0].automation_id === "f" && g.failed.count === 1, JSON.stringify(g.failed));
  check("older gateway: no Paused group, the paused row in the main list", g.paused.rows.length === 0 && g.paused.count === 0 && g.active.rows.map((r) => r.automation_id).join() === "a,p");
  check("a failed status wins over another section", kit.automationGroups([row("q", "failed", "active")]).failed.rows.length === 1);
}
{
  const none = kit.automationGroups([row("a", "active", "active")], { failed_automations_count: 3, paused_automations_count: 2 });
  check("zero rows = count 0 whatever was served (the fold is absent)", none.failed.count === 0 && none.paused.count === 0);
  check("labels: {section} · {count} from the words file", kit.automationGroupLabel("failed", 2) === "Failed · 2" && kit.automationGroupLabel("paused", 3) === "Paused · 3");
  const absent = html(h(kit.AutomationGroupFold, { group: "failed", count: 0, open: true, onToggle() {} }, h("ul", null, h("li", null, "x"))));
  check("the fold is absent at zero", absent === "", absent);
  const open = html(h(kit.AutomationGroupFold, { group: "failed", count: 2, open: true, onToggle() {} }, h("ul", { className: "rows" }, h("li", null, "f1"))));
  check("open fold: the header button, its label and the host's rows", open.includes('data-section="failed"') && open.includes('aria-expanded="true"') && open.includes(">Failed · 2<") && open.includes('<ul class="rows"><li>f1</li></ul>'), open);
  const controls = /aria-controls="([^"]+)"/.exec(open)?.[1];
  check("open fold: the button controls the body", Boolean(controls) && open.includes(`id="${controls}"`));
  const shut = html(h(kit.AutomationGroupFold, { group: "paused", count: 3, open: false, onToggle() {} }, h("li", null, "p1")));
  check("closed fold: the header only", shut.includes('aria-expanded="false"') && shut.includes(">Paused · 3<") && !shut.includes("p1"), shut);
  // The header asks the host for the other state.
  const asked = [];
  const fold = mountHook(kit.AutomationGroupFold, { group: "failed", count: 1, open: true, onToggle: (v) => asked.push(v) });
  // Spec H: the fold's header IS the kit's one generic fold header (AfFoldToggle).
  const toggleOf = () => find(fold.current, (n) => n.type === kit.AfFoldToggle && n.props.action === "fold-failed");
  check("the fold's header is the kit's AfFoldToggle", Boolean(toggleOf()) && typeof kit.AfFoldToggle === "function");
  toggleOf().props.onToggle();
  fold.rerender({ open: false });
  toggleOf().props.onToggle();
  check("pressing the header asks for the other state", isDeepStrictEqual(asked, [false, true]), JSON.stringify(asked));
  const bare = html(h(kit.AfFoldToggle, { open: false, onToggle() {}, controls: "b1", action: "x" }, "Label"));
  check("AfFoldToggle: a button with aria-expanded, aria-controls, a chevron and the label", /^<button type="button" class="af-fold-toggle" data-action="x" aria-expanded="false" aria-controls="b1"><svg[^]*<\/svg>Label<\/button>$/.test(bare), bare);
}
{
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
  };
  const s = mem();
  check("defaults: Failed open, Paused folded", kit.readAutomationGroupOpen("observer", "failed", s) === true && kit.readAutomationGroupOpen("observer", "paused", s) === false);
  kit.writeAutomationGroupOpen("observer", "failed", false, s);
  check("the choice is remembered", kit.readAutomationGroupOpen("observer", "failed", s) === false);
  check("…per app", kit.readAutomationGroupOpen("assistant", "failed", s) === true);
  check("…per group", kit.readAutomationGroupOpen("observer", "paused", s) === false && s.m.size === 1);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  check("blocked storage reads the default and never throws", kit.readAutomationGroupOpen("x", "failed", blocked) === true && (kit.writeAutomationGroupOpen("x", "failed", false, blocked), true));
  check("no storage at all reads the default", kit.readAutomationGroupOpen("x", "paused", null) === false);
}

// --- live line ---------------------------------------------------------------------------------
const START = "2026-11-27T10:00:00+00:00";
const T0 = Date.parse(START);
const live = (extra) => ({ started_at: START, state: "thinking", tool: null, attempt: 1, steps_done: 0, ...extra });
const running = (l, extra) => ({ index: 7, run_id: "r7", attempt: 1, status: "running", ...(l ? { live: l } : {}), ...extra });
{
  const words = (l) => kit.automationLiveWords(running(l));
  check("starting", words(live({ state: "starting" })).text === WORDS.live.starting);
  check("thinking", words(live({ state: "thinking" })).text === WORDS.live.thinking);
  check("waiting", words(live({ state: "waiting" })).text === WORDS.live.waiting);
  // Between attempts the gateway serves no live: the occurrence's status says it, with the attempt
  // about to run AS SERVED (the runtime stores the next attempt in backoff: controller.py retry_scheduled).
  const retry = kit.automationLiveWords({ index: 7, run_id: "r7", attempt: 2, status: "backoff" });
  check("backoff: waiting to retry, the served (next) attempt, no clock", retry?.text === "Waiting to retry (attempt 2)" && retry.elapsedFrom === null && retry.steps === null, JSON.stringify(retry));
  check("backoff: the same attempt number as the header", kit.currentOccurrenceLabel({ current_occurrence: { index: 7, run_id: "r7", attempt: 2, status: "backoff" } }).endsWith("(attempt 2)"));
  const admitted = kit.automationLiveWords({ index: 8, run_id: null, attempt: 1, status: "admitted" });
  check("admitted: starting, no clock", admitted?.text === WORDS.live.starting && admitted.elapsedFrom === null, JSON.stringify(admitted));
  check("no live while running: nothing (the row reads Running as before)", kit.automationLiveWords(running(null)) === null);
  check("no occurrence: nothing", kit.automationLiveWords(null) === null && kit.automationLiveWords(undefined) === null);
  const tool = { name: "web_search", arguments: { query: "AI news", num_results: 5 } };
  const w = kit.describeToolCall(tool);
  const toolText = words(live({ state: "tool", tool })).text;
  check("a tool is worded through describeToolCall (without its options)", toolText === [w.verb, w.lead, w.key].filter(Boolean).join(" ") && toolText === "Search the web for AI news", toolText);
  check("an unknown tool reads by its name", words(live({ state: "tool", tool: { name: "mcp::notes::find_page", arguments: {} } })).text === "Find page");
  check("elapsedFrom = started_at", words(live({})).elapsedFrom === T0);
  check("no steps line at 0", words(live({ steps_done: 0 })).steps === null);
  check("1 step so far", words(live({ steps_done: 1 })).steps === WORDS.live.steps_one);
  check("7 steps so far", words(live({ steps_done: 7 })).steps === "7 steps so far");
  // A live this kit cannot word is nothing (the row reads "Running" as without one), never a throw.
  const quiet = (l) => {
    try {
      return words(l) === null;
    } catch {
      return false;
    }
  };
  check("an unknown state: nothing, no throw", quiet(live({ state: "dreaming" })));
  check("retry is not a live state (the gateway serves backoff instead): nothing", quiet(live({ state: "retry" })));
  check("state tool without its call: nothing", quiet(live({ state: "tool", tool: null })));
  check("an unreadable started_at: nothing", quiet(live({ started_at: "soon" })));
  check("…and the line renders nothing for them", ["dreaming", "retry"].every((state) => html(h(kit.AutomationLiveLine, { current: running(live({ state })) })) === "") && html(h(kit.AutomationLiveLine, { current: running(live({ started_at: "soon" })) })) === "");
}
{
  check("elapsed m:ss", kit.liveElapsed(T0, T0 + 134_000) === "2:14");
  check("elapsed 0:00 at the start", kit.liveElapsed(T0, T0) === "0:00");
  check("elapsed h:mm:ss past an hour", kit.liveElapsed(T0, T0 + 3_725_000) === "1:02:05", kit.liveElapsed(T0, T0 + 3_725_000));
  check("elapsed clamped at zero (a client clock behind the gateway's)", kit.liveElapsed(T0, T0 - 90_000) === "0:00");
  const line = html(h(kit.AutomationLiveLine, { current: running(live({ state: "tool", tool: { name: "fetch_url", arguments: { url: "https://example.org/a" } }, steps_done: 3 })), nowMs: T0 + 134_000 }));
  check("the line: elapsed · what it does, then the steps", line.includes('data-live-state="tool"') && line.includes('<span class="af-auto-live__elapsed">2:14</span> · Fetch the page example.org/a') && line.includes('<span class="af-auto-live__steps">3 steps so far</span>'), line);
  const noSteps = html(h(kit.AutomationLiveLine, { current: running(live({})), nowMs: T0 + 5_000 }));
  check("the line without steps", noSteps.includes("0:05</span> · Thinking…") && !noSteps.includes("af-auto-live__steps"), noSteps);
  const backoff = html(h(kit.AutomationLiveLine, { current: { index: 7, run_id: "r7", attempt: 2, status: "backoff" }, nowMs: T0 }));
  check("the line between attempts: words only, no clock", backoff.includes('data-live-state="backoff"') && backoff.includes(">Waiting to retry (attempt 2)</span>") && !backoff.includes("af-auto-live__elapsed"), backoff);
  check("no live while running: no line at all", html(h(kit.AutomationLiveLine, { current: running(null) })) === "");
  check("not a live region (a ticking clock would be read out every second)", !line.includes("aria-live") && !line.includes('role="status"'));
  const css = readFileSync(join(here, "..", "src", "theme.css"), "utf8");
  const rule = /\.af-auto-live \{([^}]*)\}/.exec(css)?.[1] ?? "";
  const fold = /\.af-auto-group__toggle \{([^}]*)\}/.exec(css)?.[1] ?? "";
  check("the fold's toggle has its own size from the kit's scale (never the host's)", /font-size:\s*var\(--font-size-sm\)/.test(fold), fold.trim().slice(0, 80));
  check("the line's two rows are reserved (no shift when it changes)", /min-height:\s*calc\(2 \* 1\.4em\)/.test(rule) && /line-height:\s*1\.4/.test(rule), rule);
  check("its rows never wrap", /\.af-auto-live__now,\s*\.af-auto-live__steps \{[^}]*white-space: nowrap/.test(css));
}
{
  const running = { current_occurrence: { index: 3, run_id: "r", attempt: 1, status: "running" } };
  check("refresh: 3 s while a run is in progress and the page is visible", kit.automationRefreshMs(running, 30_000, true) === 3000 && kit.LIVE_REFRESH_MS === 3000);
  check("refresh: the host's own cadence when hidden", kit.automationRefreshMs(running, 30_000, false) === 30_000);
  check("refresh: the host's own cadence when nothing runs", kit.automationRefreshMs({ current_occurrence: null }, 30_000, true) === 30_000 && kit.automationRefreshMs(null, 15_000, true) === 15_000);
}

if (failures) {
  console.error(`check_automation_groups_live: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check_automation_groups_live: OK (${checks} checks: words, list groups and folds, live line, refresh delay)`);
