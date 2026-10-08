#!/usr/bin/env node
/**
 * Round 16 (R16.1 A4/A5/A2): the calendar "When" editor, the served schedule line, the
 * time-zone line and picker, and the served next run — over the compiled dist (no jsdom).
 *
 * - wording IS automation_controls.json → schedule (vendored byte for byte by the Assistant
 *   and the Code TUI);
 * - day chips are state-showing toggles (aria-pressed + a check mark rule in theme.css);
 * - the line under When for Once/Daily/Weekly/Monthly is the GATEWAY's first_run_sentence,
 *   verbatim, with "in <zone> (your account's time zone)" + the kit tooltip + the preferences
 *   link; loading and error states say so (the error is the gateway's sentence);
 * - the Edit form edits a schedule@2 calendar rule and keeps the binding's time_zone;
 * - formatServedLocal CUTS the served string (no clock or zone arithmetic);
 * - AfTimeZonePicker lists ONLY the served IANA choices, "Gateway default (<zone>)" first;
 * - nothing in the kit sources computes a next run (grep).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const parts = await import(join(root, "dist", "automations", "AutomationPanel.js"));
const fx = (f) => JSON.parse(readFileSync(join(here, "fixtures", "automations", f), "utf8"));
const spec = JSON.parse(readFileSync(join(root, "src", "automations", "automation_controls.json"), "utf8"));

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
const h = React.createElement;
const ssr = (el) => renderToStaticMarkup(el);
const T = kit.SCHEDULE_TEXT;

check("SCHEDULE_TEXT IS automation_controls.json → schedule", eq(T, spec.schedule));
check("schedule wording: the six kind labels", T.kind_every === "Repeat" && T.kind_daily === "Daily" && T.kind_weekly === "Weekly" && T.kind_monthly === "Monthly" && T.kind_once === "Once at…" && spec.email.trigger_label === "When an email arrives");
check("days Monday-first", eq(kit.CALENDAR_DAYS, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) && eq(Object.keys(T.days), kit.CALENDAR_DAYS));

// --- calendar rule fields -------------------------------------------------------------------------
const fields = (value) => ssr(h(kit.AfCalendarRuleFields, { value, onChange() {}, idBase: "t" }));
const weekly = fields({ kind: "weekly", days: ["mon", "wed"], at: "07:30" });
const pressed = [...weekly.matchAll(/aria-pressed="(true|false)"[^>]*>.*?data-day="(\w+)"/g)].map((m) => [m[2], m[1]]);
check("weekly: seven day chips, state shown (Mon, Wed pressed; the rest not)", eq(pressed, [["mon", "true"], ["tue", "false"], ["wed", "true"], ["thu", "false"], ["fri", "false"], ["sat", "false"], ["sun", "false"]]), JSON.stringify(pressed));
check("weekly: chips are buttons labelled with the kit day words", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].every((d) => weekly.includes(`>${d}</span>`)) && weekly.includes(`aria-label="${T.days_legend}"`));
check("weekly: time input HH:MM with the kit label", weekly.includes('type="time"') && weekly.includes('value="07:30"') && weekly.includes(`aria-label="${T.time_label}"`));
const css = readFileSync(join(root, "src", "theme.css"), "utf8");
check("theme.css: a pressed day chip draws a check mark (non-colour cue)", /\.af-schedule__day\[aria-pressed="true"\]::before\s*\{\s*content:\s*"\\2713"/.test(css));
const monthly = fields({ kind: "monthly", day: "last", at: "18:00" });
check("monthly: day select 1..31 + last, last selected", (monthly.match(/<option /g) || []).length === 32 && monthly.includes(`<option value="last" selected="">${T.last_day}</option>`) && monthly.includes(`>${T.day_label}</label>`));
const daily = fields({ kind: "daily", at: "08:00" });
check("daily: only the time (no day chips, no day select)", !daily.includes("data-day=") && !daily.includes("<select") && daily.includes('value="08:00"'));
check("calendarWhenOf keeps the time and days across kinds", eq(kit.calendarWhenOf("weekly", { at: "06:15" }), { kind: "weekly", at: "06:15", days: ["mon"] }) && eq(kit.calendarWhenOf("monthly", { at: "06:15" }), { kind: "monthly", at: "06:15", day: 1 }) && eq(kit.calendarWhenOf("daily", {}), { kind: "daily", at: "08:00" }));

// Kind switches keep what was picked (live-drive finding: Weekly → Monthly → Weekly lost the days).
{
  let st = kit.DEFAULT_CALENDAR_STATE;
  st = kit.withCalendarRule(st, { kind: "weekly", days: ["mon", "fri"], at: "07:30" });
  st = kit.withCalendarRule(st, { kind: "monthly", day: "last", at: "07:30" });
  check("calendar state: Weekly → Monthly → Weekly keeps the days, the day and the time", eq(kit.calendarRuleOf("weekly", st), { kind: "weekly", at: "07:30", days: ["mon", "fri"] }) && eq(kit.calendarRuleOf("monthly", st), { kind: "monthly", at: "07:30", day: "last" }) && eq(kit.calendarRuleOf("daily", st), { kind: "daily", at: "07:30" }));
  check("calendar state: an emptied day set stays empty (the kit then says why)", eq(kit.calendarRuleOf("weekly", kit.withCalendarRule(st, { kind: "weekly", days: [], at: "07:30" })).days, []));
  check("calendar state of a stored rule", eq(kit.calendarStateOf({ kind: "monthly", day: 31, at: "09:00" }), { at: "09:00", days: ["mon"], day: 31 }));
}

// --- the served line -----------------------------------------------------------------------------
const preview = { trigger: { source_id: "schedule", source_version: 2, config: { kind: "daily", at: "08:00", time_zone: "Europe/Paris" } }, time_zone: "Europe/Paris", schedule_rule_text: "Every day at 08:00 (Europe/Paris)", schedule_text: "Every day at 08:00 (Europe/Paris) · next Fri 9 Oct 08:00", next_run_at: "2026-10-09T06:00:00+00:00", next_run_local: "2026-10-09T08:00:00+02:00", first_run_sentence: "Runs every day at 08:00 (Europe/Paris), first run Fri 9 Oct 08:00." };
const ok = ssr(h(kit.AfServedSchedule, { state: { phase: "ok", description: preview }, onOpenPreferences() {} }));
check("served: the gateway's first_run_sentence verbatim", ok.includes(`data-preview="served">${esc(preview.first_run_sentence)}</p>`));
check("served: the time-zone line from the served zone", ok.includes(`>${esc(kit.timeZoneLine("Europe/Paris"))}</span>`) && kit.timeZoneLine("Europe/Paris") === "in Europe/Paris (your account's time zone)");
check("served: the kit tooltip on the zone line (data-af-tip, focusable)", ok.includes(`data-af-tip="${esc(T.time_zone_hint)}"`) && /tabindex="0"[^>]*class="af-schedule__tz-text"|class="af-schedule__tz-text"[^>]*tabindex="0"/i.test(ok));
check("served: a link button to the preferences (no editing in the dialog)", ok.includes(`>${T.time_zone_change}</button>`) && !ok.includes("<select"));
check("served: a different served sentence changes the line (mutant guard)", ssr(h(kit.AfServedSchedule, { state: { phase: "ok", description: { ...preview, first_run_sentence: "Runs X." } } })).includes(">Runs X.</p>"));
const noLink = ssr(h(kit.AfServedSchedule, { state: { phase: "ok", description: preview } }));
check("served: without onOpenPreferences no link", !noLink.includes(T.time_zone_change));
const auto = ssr(h(kit.AfServedSchedule, { state: { phase: "ok", description: preview }, whose: "automation", onOpenPreferences() {} }));
check("served (Edit form): this automation's zone, no preferences link", auto.includes(esc("in Europe/Paris (this automation's time zone)")) && !auto.includes(T.time_zone_change));
check("loading: the kit's describing line", ssr(h(kit.AfServedSchedule, { state: { phase: "loading" } })).includes(`data-preview="loading">${T.describing}</p>`));
check("idle (incomplete rule): Incomplete schedule.", ssr(h(kit.AfServedSchedule, { state: { phase: "idle" } })).includes(`>${T.incomplete}</p>`));
const err = ssr(h(kit.AfServedSchedule, { state: { phase: "error", message: "time_zone 'Mars/Base' is not an IANA time zone." } }));
check("error: the gateway's sentence, as an alert", err.includes('role="alert"') && err.includes("time_zone &#x27;Mars/Base&#x27; is not an IANA time zone."));

// --- served next run + rule text -------------------------------------------------------------------
check("formatServedLocal CUTS the served ISO (date + wall time + zone)", kit.formatServedLocal("2026-10-09T08:00:00+02:00", "Europe/Paris") === "2026-10-09 08:00 Europe/Paris" && kit.formatServedLocal("2026-03-29T03:30:00.5+02:00", "Europe/Paris") === "2026-03-29 03:30 Europe/Paris");
check("formatServedLocal: an unexpected shape is shown raw, never re-computed", kit.formatServedLocal("soon", "UTC") === "soon" && kit.formatServedLocal(undefined, "UTC") === "");
const list = fx("list.json").items;
const brief = list.find((s) => s.title === "Morning briefing");
const NOW = Date.parse("2026-09-27T06:35:00Z");
check("nextRunLabel: served local + relative", kit.nextRunLabel(brief, NOW) === "2026-09-28 08:00 Europe/Paris (in 23 h 25 min)", kit.nextRunLabel(brief, NOW));
check("nextRunLabel: paused / nothing scheduled", kit.nextRunLabel({ status: "paused" }, NOW) === "none while paused" && kit.nextRunLabel({ status: "active", next_fire_at: brief.next_fire_at }, NOW) === "none scheduled");
check("triggerSummary(schedule@2) = served schedule_rule_text verbatim", kit.triggerSummary(brief.trigger, brief) === "Every day at 08:00 (Europe/Paris)");
check("triggerSummary(schedule@2) without served text = the literal source", kit.triggerSummary(brief.trigger, {}) === "schedule@2");
check("triggerSummary(schedule@2 every) = the kit's Repeat family (same words as a v1 row)", kit.triggerSummary({ source_id: "schedule", source_version: 2, config: { kind: "every", every: "8h", count: 3 } }, { schedule_rule_text: "Every 8 hours (UTC) · 3 runs max" }) === "every 8 hours (UTC) · 3 runs max");
check("timing line of the daily row", kit.automationTiming(brief, NOW).line === "Every day at 08:00 (Europe/Paris) · last 33 min ago · next in 23 h", kit.automationTiming(brief, NOW).line);
const header = ssr(h(parts.AutomationHeader, { summary: brief, triggerSources: fx("trigger-sources.json").items, nowMs: NOW }));
check("header: When = served rule, Next run = served local, schedule@2 is a listed source", header.includes('data-fact="trigger">Every day at 08:00 (Europe/Paris)</dd>') && header.includes('data-fact="next">2026-09-28 08:00 Europe/Paris (in 23 h 25 min)</dd>') && !header.includes("does not list the trigger source"));

// --- Edit form: the calendar rule -----------------------------------------------------------------
const def = { context: { mode: "independent", growing: {} }, target: { bundle_ref: "b@1", flow_id: "main", input_data: { prompt: "Brief me" } }, policy: { tool_approval: "auto" } };
const form = kit.reviseFormFrom(brief, def);
check("reviseFormFrom: the calendar rule of a schedule@2 row", eq(form.calendar, { kind: "daily", at: "08:00" }) && form.every === null);
const moved = kit.reviseChanges(brief, { ...form, calendar: { kind: "weekly", days: ["sat", "mon"], at: "09:15" } }, def);
check("reviseChanges: a new rule keeps the binding's time_zone", eq(moved, { trigger: { source_id: "schedule", source_version: 2, config: { kind: "weekly", days: ["mon", "sat"], at: "09:15", time_zone: "Europe/Paris" } } }), JSON.stringify(moved));
const limited = { ...brief, trigger: { ...brief.trigger, config: { ...brief.trigger.config, count: 5, until: "2026-12-31T23:00:00+00:00" } } };
check("reviseChanges: the limits (max runs, stop at) are kept with the new rule", eq(kit.reviseChanges(limited, { ...form, calendar: { kind: "daily", at: "09:00" } }, def).trigger.config, { kind: "daily", at: "09:00", time_zone: "Europe/Paris", count: 5, until: "2026-12-31T23:00:00+00:00" }));
check("reviseChanges: an unchanged rule changes nothing", kit.reviseChanges(brief, form, def) === null);
check("reviseChanges: an invalid rule says why", eq(kit.reviseChanges(brief, { ...form, calendar: { kind: "weekly", days: [], at: "09:15" } }, def), { errors: [T.error_days] }));
const editHtml = ssr(h(parts.AutomationReviseForm, { summary: brief, definition: def, busy: false, errors: [], onSubmit() {}, previewSchedule: async () => preview }));
check("Edit form: the calendar fieldset (kinds + time) instead of Repeat every", editHtml.includes('data-field="calendar"') && editHtml.includes(`<legend>${T.legend}</legend>`) && editHtml.includes('checked="" value="daily"') && !editHtml.includes("Repeat every (UTC)"));

// --- time-zone picker -----------------------------------------------------------------------------
const block = { value: null, gateway_default: "Europe/Paris", effective: "Europe/Paris", label: "Time zone", help: "Daily, weekly and monthly automations run on this clock.", choices: ["America/Los_Angeles", "Europe/Paris", "UTC"] };
check("timeZoneOptions: Gateway default (<zone>) first (= null), then the served names only", eq(kit.timeZoneOptions(block), [{ value: kit.TIME_ZONE_GATEWAY_DEFAULT, label: "Gateway default (Europe/Paris)" }, ...block.choices.map((z) => ({ value: z, label: z }))]));
const picker = ssr(h(kit.AfTimeZonePicker, { block, id: "tz", onChange() {} }));
check("picker: the gateway's label (for the trigger) and help (kit tooltip)", picker.includes('for="tz">Time zone</label>') && picker.includes(`data-af-tip="${esc(block.help)}"`));
check("picker: shows the gateway default while unset", picker.includes("Gateway default (Europe/Paris)"));
check("picker: a set zone is shown", ssr(h(kit.AfTimeZonePicker, { block: { ...block, value: "UTC" }, id: "tz", onChange() {} })).includes(">UTC<"));
let threw = false;
try { ssr(h(kit.AfTimeZonePicker, { block: { label: "Time zone" }, id: "tz", onChange() {} })); } catch { threw = true; }
check("picker: a missing time_zone block fails loudly (no hedge)", threw);
check("picker: note line", ssr(h(kit.AfTimeZonePicker, { block, id: "tz", onChange() {}, note: { ok: false, text: "Not saved. Unknown zone." } })).includes('role="status" aria-live="polite">Not saved. Unknown zone.</span>'));

// --- grep: no client-side next-run arithmetic in the kit sources -----------------------------------
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n)) files.push(p); } };
walk(join(root, "src"));
const offenders = files.filter((f) => {
  const src = readFileSync(f, "utf8");
  // A next run built from the trigger: anchor/start_at + k*every, or a wall time turned into a Date.
  return /next_fire_at|nextFire|anchor\s*\+|start_at\)\s*\+|\+\s*every|setHours\(|setUTCHours\(|Intl\.DateTimeFormat\(|getTimezoneOffset|resolvedOptions\(\)\.timeZone/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").replace(/next_fire_at\?: Timestamp;/, ""));
});
check("grep: no kit source computes a next run, reads next_fire_at, or guesses the browser zone", offenders.length === 0, offenders.join(", "));

if (failures) {
  console.error(`check_schedule_when: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_schedule_when: ${checks} checks passed`);
