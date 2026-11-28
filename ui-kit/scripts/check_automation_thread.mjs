#!/usr/bin/env node
/**
 * An automation read as a chat (operator 2026-11-27), the kit's half (no DOM; the compiled dist):
 * - the run's user message (`automationRunTask`): the served `task`; else the `user_turn` without its
 *   frame line ONLY when that line is, character for character, the frame rebuilt from the row
 *   (`automationTriggerFrame`, the runtime's `_render_prompt`); a row without every piece keeps it;
 * - where the thread opens (`automationOpening`): the first unseen result among the loaded runs,
 *   else the newest run;
 * - the header (`AutomationHeader`, `AutomationHeaderCard`): row 1 title + state, row 2 the buttons,
 *   row 3 the parameters as chips; a chip whose section the Edit form shows opens it there; Next run
 *   is never editable; no runs or attention chip; an automation that cannot be edited has no
 *   editable chip; the Edit form opened at a section says so (`data-open-section`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { find, mountHook } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));
const kit = await import(join(here, "..", "dist", "index.js"));
const parts = await import(join(here, "..", "dist", "automations", "AutomationPanel.js"));
const h = React.createElement;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

// --- the run's user message ---------------------------------------------------------------------
const fired = "2026-10-14T23:06:22.996015+00:00";
const base = { index: 6, fired_at: fired, trigger: { source_id: "schedule", summary: "schedule: every 24h", source_version: 1 } };
const frame = `[Trigger schedule@1 · occurrence 6 · fired ${fired}]`;
check("frame: rebuilt from the row's own fields, as the runtime writes it", kit.automationTriggerFrame(base) === frame, kit.automationTriggerFrame(base));
check("frame: none without the served source_version (never guessed)", kit.automationTriggerFrame({ ...base, trigger: { source_id: "schedule", summary: "s" } }) === null);
check("frame: none without a fired_at or an index", kit.automationTriggerFrame({ ...base, fired_at: "" }) === null && kit.automationTriggerFrame({ ...base, index: 1.5 }) === null);
const task = "Summarise the news.\nKeep it short.";
check("task: the served task wins, as written", kit.automationRunTask({ ...base, task, user_turn: `${frame}\nsomething else` }).text === task && kit.automationRunTask({ ...base, task, user_turn: "" }).from === "task");
check("task: no served task, the frame line equal to the rebuilt one → removed", kit.automationRunTask({ ...base, user_turn: `${frame}\n${task}` }).text === task && kit.automationRunTask({ ...base, user_turn: `${frame}\n${task}` }).from === "user_turn_unframed");
check("task: an empty served task falls back to the user_turn", kit.automationRunTask({ ...base, task: "", user_turn: `${frame}\n${task}` }).text === task);
check("task: a frame line that differs by one character stays (exact match only)", kit.automationRunTask({ ...base, user_turn: `${frame.replace("occurrence 6", "occurrence 7")}\n${task}` }).text.startsWith("[Trigger"));
check("task: without source_version the user_turn stays whole (said in the reply)", kit.automationRunTask({ ...base, trigger: { source_id: "schedule", summary: "s" }, user_turn: `${frame}\n${task}` }).text === `${frame}\n${task}`);
check("task: a turn that is only the frame → empty (the thread then says the trigger)", kit.automationRunTask({ ...base, user_turn: frame }).text === "");

// --- where it opens ---------------------------------------------------------------------------
const rows = [3, 1, 2].map((i) => ({ index: i, run_id: `r${i}` }));
const att = (indexes) => ({ attention: { items: indexes.map((i) => ({ index: i, cursor: `att1:${i}` })) } });
check("opening: the first unseen loaded run", JSON.stringify(kit.automationOpening(att([2, 3]), rows)) === JSON.stringify({ runId: "r2", at: "unseen" }));
check("opening: an unseen run not loaded is skipped for the next one", JSON.stringify(kit.automationOpening(att([0, 3]), rows)) === JSON.stringify({ runId: "r3", at: "unseen" }));
check("opening: nothing unseen → the newest run", JSON.stringify(kit.automationOpening(att([]), rows)) === JSON.stringify({ runId: "r3", at: "newest" }));
check("opening: no run → null", kit.automationOpening(att([1]), []) === null);
check("unseen runs: by index, their cursors, oldest first", JSON.stringify([...kit.unseenRuns(att([2, 3]))]) === JSON.stringify([[2, "att1:2"], [3, "att1:3"]]));

// --- the header ---------------------------------------------------------------------------------
const list = fx("list.json").items;
const mail = list.find((s) => s.title === "Inbox triage");
const sources = fx("trigger-sources.json").items;
const definition = {
  schema_version: 2, revision: 1, title: mail.title, controller: { bundle_ref: "c@1", flow_id: "controller" },
  target: { workflow_id: "basic-agent@0.1.0:main", bundle_ref: "basic-agent@0.1.0", flow_id: "main", input_data: { prompt: "Triage my inbox.\nThen file it." } },
  trigger: mail.trigger, context: { mode: "growing", growing: {} },
  policy: { serial: true, misfire: "coalesce", failure: "continue", retry: { max_attempts: 3, backoff: { initial: "30s", factor: 2, max: "10m" } }, tool_approval: "ask" },
  notify: { channels: ["console"] }, session_id: "s", workspace_root: "/w", created_at: mail.trigger.config.start_at, archived_at: null,
};
const sections = kit.automationEditSections(mail, definition, { modelPicker: true });
check("edit sections: what, schedule, memory always; model with a picker; tools with a definition", ["what", "schedule", "memory", "model", "tools"].every((x) => sections.has(x)), [...sections]);
check("edit sections: no model without a picker, no model or tools without a definition", !kit.automationEditSections(mail, definition, { modelPicker: false }).has("model") && !kit.automationEditSections(mail, null, { modelPicker: true }).has("tools"));
const NOW = Date.parse("2026-09-27T06:35:00Z");
const header = (extra) => renderToStaticMarkup(h(parts.AutomationHeader, { summary: mail, definition, triggerSources: sources, nowMs: NOW, controls: h("div", { className: "spy-controls" }), ...extra }));
const chipOf = (html, fact) => {
  const m = new RegExp(`<li class="af-auto__chip" data-fact="${fact}">([\\s\\S]*?)</li>`).exec(html);
  return m ? { button: /<button/.test(m[1]), action: (/data-action="([^"]+)"/.exec(m[1]) || [])[1] ?? null, title: (/title="([^"]*)"/.exec(m[1]) || [])[1] ?? "" } : null;
};
const plain = header({});
const order = [...plain.matchAll(/<(?:div|ul) class="(af-auto__titlebar|af-auto__actionrow|af-auto__chips)"/g)].map((m) => m[1]);
check("header: row 1 title + state, row 2 the buttons, row 3 the chips", JSON.stringify(order) === JSON.stringify(["af-auto__titlebar", "af-auto__actionrow", "af-auto__chips"]), order);
check("header: the buttons are on their own row (not in the title's)", /<div class="af-auto__actionrow"><div class="spy-controls">/.test(plain) && !/af-auto__titlebar">[^]*?spy-controls[^]*?<\/div><div class="af-auto__actionrow"/.test(plain));
check("header: the parameters, no runs or attention chip", ["task", "trigger", "next", "context", "model", "tools", "results"].every((f) => chipOf(plain, f)) && !chipOf(plain, "count") && !chipOf(plain, "attention"), ["task", "trigger", "next", "context", "model", "tools", "results"].filter((f) => !chipOf(plain, f)));
check("header: the Task chip is the task's first line, whole in its tooltip", plain.includes('<span class="af-auto__chip-text">Triage my inbox.</span>') && chipOf(plain, "task").title === "Task: Triage my inbox.&#10;Then file it." || chipOf(plain, "task").title === "Task: Triage my inbox.\nThen file it.", chipOf(plain, "task"));
check("header: without onEditSection no chip opens the form", !/data-action="edit-/.test(plain));
const editing = header({ editSections: sections, onEditSection: () => {} });
const actions = Object.fromEntries(["task", "trigger", "next", "context", "model", "tools", "results"].map((f) => [f, chipOf(editing, f)?.action ?? null]));
check("header: each chip opens its section; Next run stays plain", JSON.stringify(actions) === JSON.stringify({ task: "edit-what", trigger: "edit-schedule", next: null, context: "edit-memory", model: "edit-model", tools: "edit-tools", results: "edit-results" }), actions);
check("header: an editable chip's tooltip says it can be changed", chipOf(editing, "trigger").title.endsWith(kit.AUTOMATION_EDIT_WORDS.header.change_hint), chipOf(editing, "trigger").title);
const some = header({ editSections: new Set(["what"]), onEditSection: () => {} });
check("header: a section the form does not show is a plain chip", chipOf(some, "task").button && !chipOf(some, "trigger").button && !chipOf(some, "results").button);

// --- the header card -----------------------------------------------------------------------------
const rec = () => () => Promise.resolve({ command_id: "c", accepted: true, duplicate: false, seq: 1 });
const card = (extra) => renderToStaticMarkup(h(kit.AutomationHeaderCard, { summary: mail, definition, occurrences: [], triggerSources: sources, busy: false, nowMs: NOW, onRevise: rec(), onCommand: rec(), previewSchedule: async () => ({}), ...extra }));
const cardHtml = card({});
check("card: its own section (af-auto-headcard) holding ONE header", /^<section class="af-auto af-auto-headcard"/.test(cardHtml) && (cardHtml.match(/<header class="af-auto__head">/g) || []).length === 1);
const bar = [...cardHtml.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]).filter((a) => !a.startsWith("edit-"));
check("card: the controls bar in row 2: Active, ONE Run now / Stop, Edit, Details, Archive", JSON.stringify(bar) === JSON.stringify(["active", mail.current_occurrence ? "stop_current" : "run_now", "edit", "details", "archive"]) && /<div class="af-auto__actionrow"><div class="af-auto__controls-wrap">/.test(cardHtml), bar);
check("card: editable chips open the Edit form at their section", /data-action="edit-schedule"/.test(cardHtml) && /data-action="edit-what"/.test(cardHtml));
check("card: no run, no occurrence frame, no unseen block in it", !cardHtml.includes("af-auto-occ") && !cardHtml.includes("af-auto__attention") && !cardHtml.includes("af-auto__timeline"));
const archived = card({ summary: { ...mail, status: "archived" } });
check("card: an archived automation has no editable chip, and says it is archived", !/data-action="edit-/.test(archived) && archived.includes('data-fact="archived"'));

// A host that edits on its own page (controlled, editOpen false) learns WHICH section a chip asked
// for: onEditOpenChange(true, section); the Edit button still asks (true) alone.
{
  const asked = [];
  const t = mountHook(kit.AutomationHeaderCard, { summary: mail, definition, occurrences: [], triggerSources: sources, busy: false, nowMs: NOW, onRevise: rec(), onCommand: rec(), previewSchedule: async () => ({}), editOpen: false, onEditOpenChange: (...args) => asked.push(args) });
  const head = find(t.current, (n) => n.type === parts.AutomationHeader);
  head.props.onEditSection("schedule");
  t.render();
  find(t.current, (n) => n.type === parts.AutomationHeader).props.controls.props.onToggleRevise();
  check("card: a chip asks onEditOpenChange(true, its section); the Edit button asks (true) alone", JSON.stringify(asked) === JSON.stringify([[true, "schedule"], [true]]), asked);
}

// --- the Edit form opened at a section ---------------------------------------------------------
const form = renderToStaticMarkup(h(kit.AutomationReviseForm, { summary: mail, definition, busy: false, errors: [], onSubmit() {}, previewSchedule: async () => ({}), openSection: "memory" }));
check("edit form: opened at a section says which (data-open-section)", form.includes('data-open-section="memory"') && form.includes('data-section="memory"'));
check("edit form: without it, no data-open-section", !renderToStaticMarkup(h(kit.AutomationReviseForm, { summary: mail, definition, busy: false, errors: [], onSubmit() {}, previewSchedule: async () => ({}) })).includes("data-open-section"));

if (failures) {
  console.error(`check_automation_thread: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_automation_thread: OK (${checks} checks: the run's task, the opening, the header card, chips that edit)`);
