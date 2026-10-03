#!/usr/bin/env node
/**
 * automationTiming() — the automation card/header line (round 4, DESIGN §3):
 *   "every 24 h · last 3 h ago · next in 14 h"
 * Deterministic (injected now), compact units, no year, no seconds, "never" without a run.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = process.env.TIMING_LINE_DIST || join(root, "dist");
const mod = await import(join(dist, "automations", "timing_line.js"));
const { automationTiming, compactDuration, compactCadence, lastRunText, nextRunText } = mod;
if (!process.env.TIMING_LINE_DIST) {
  const kit = await import(join(dist, "index.js"));
  for (const name of ["automationTiming", "compactDuration", "compactCadence"]) {
    if (typeof kit[name] !== "function") {
      console.error(`  FAIL index.js does not export ${name}`);
      process.exit(1);
    }
  }
}

let failures = 0;
let checks = 0;
function eq(name, got, want) {
  checks += 1;
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failures += 1;
  console.error(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const NOW = Date.parse("2026-10-03T12:00:00Z");
const H = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const schedule = (every) => ({ binding_id: "b", source_id: "schedule", source_version: 1, config: every === undefined ? { start_at: iso(NOW + H) } : { every } });

// The operator's example, exactly.
eq(
  "example line",
  automationTiming(
    { trigger: schedule("24h"), last_occurrence: { finished_at: iso(NOW - 3 * H - 59_000), fired_at: iso(NOW - 4 * H) }, current_occurrence: null, next_fire_at: iso(NOW + 14 * H + 20 * 60_000) },
    NOW,
  ).line,
  "every 24 h · last 3 h ago · next in 14 h",
);
// No run yet: "never"; nothing scheduled: the next part is omitted.
eq("never", automationTiming({ trigger: schedule("8h"), current_occurrence: null }, NOW).line, "every 8 h · last never");
eq("manual", automationTiming({ trigger: { binding_id: "b", source_id: "manual", source_version: 1, config: {} }, current_occurrence: null }, NOW).line, "manual · last never");
eq("email", compactCadence({ binding_id: "b", source_id: "email.received", source_version: 1, config: {} }), "on new email");
eq("once", compactCadence(schedule(undefined)), "once");
// Fired but not finished yet uses fired_at; an occurrence in flight says so.
eq("fired only", lastRunText({ last_occurrence: { fired_at: iso(NOW - 5 * 60_000) } }, NOW), "last 5 min ago");
// A pending approval is not "running": waiting since the occurrence fired, or no run part.
eq("waiting", lastRunText({ attention: { pending_waits: 1 }, current_occurrence: { index: 4, run_id: "r", attempt: 1, status: "running" }, last_occurrence: { index: 4, fired_at: iso(NOW - 5 * 60_000) } }, NOW), "waiting since 5 min");
eq("waiting, unknown start", automationTiming({ trigger: schedule("24h"), attention: { pending_waits: 2 }, current_occurrence: { index: 4, run_id: "r", attempt: 1, status: "running" }, last_occurrence: { index: 3, fired_at: iso(NOW - H) }, next_fire_at: iso(NOW + 2 * H) }, NOW).line, "every 24 h · next in 2 h");
eq("running without waits", lastRunText({ attention: { pending_waits: 0 }, current_occurrence: { index: 4, run_id: "r", attempt: 1, status: "running" } }, NOW), "running now");
eq("future last (skew)", lastRunText({ last_occurrence: { fired_at: iso(NOW + 3 * H) } }, NOW), "last <1 min ago");
eq("running", lastRunText({ current_occurrence: { index: 3, run_id: "r", attempt: 1, status: "running" }, last_occurrence: { fired_at: iso(NOW - H) } }, NOW), "running now");
// Next: due / absent / unparsable.
eq("due", nextRunText({ next_fire_at: iso(NOW + 30_000) }, NOW), "next due now");
eq("past due", nextRunText({ next_fire_at: iso(NOW - 10 * 60_000) }, NOW), "next due now");
eq("no next", nextRunText({}, NOW), null);
eq("bad ts", nextRunText({ next_fire_at: "soon" }, NOW), null);
// Units: rounded down; 24 h stays hours; days from 48 h; no seconds anywhere.
eq("<1 min", compactDuration(59_000), "<1 min");
eq("min", compactDuration(59 * 60_000 + 59_000), "59 min");
eq("h", compactDuration(23 * H + 59 * 60_000), "23 h");
eq("24 h", compactDuration(24 * H), "24 h");
eq("47 h", compactDuration(47 * H + 59 * 60_000), "47 h");
eq("2 d", compactDuration(48 * H), "2 d");
eq("40 d", compactDuration(40 * 24 * H), "40 d");
eq("every hour", compactCadence(schedule("1h")), "every hour");
eq("every 30 min", compactCadence(schedule("30m")), "every 30 min");
eq("seconds as minutes", compactCadence(schedule("120s")), "every 2 min");
eq("every 7 d", compactCadence(schedule("7d")), "every 7 d");
// Determinism: the same input and now give the same line; nothing reads the clock.
const realNow = Date.now;
Date.now = () => { throw new Error("automationTiming read the clock"); };
try {
  const a = automationTiming({ trigger: schedule("2h"), last_occurrence: { fired_at: iso(NOW - 2 * 24 * H - 5 * H) }, current_occurrence: null, next_fire_at: iso(NOW + 90 * 60_000) }, NOW).line;
  eq("deterministic", a, "every 2 h · last 2 d ago · next in 1 h");
  for (const line of [a]) {
    checks += 1;
    if (/\b20\d\d\b|\bsec|\d+ ?s\b/.test(line)) { failures += 1; console.error(`  FAIL year/seconds in ${line}`); }
  }
} finally {
  Date.now = realNow;
}

if (failures) {
  console.error(`check_timing_line: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_timing_line: ${checks} checks passed`);
