// The one compact timing line of an automation card / header:
//   "every 24 h · last 3 h ago · next in 14 h"
// Deterministic: the caller passes `nowMs`; no locale, no year, no seconds.
// Reads STRUCTURE only (trigger config, occurrence timestamps) and the
// gateway's SERVED schedule facts (round 16): a calendar rule reads as the
// summary's `schedule_text`, the next run comes from `next_run_at` — the kit
// never computes when an automation runs next.
import { isEmailTrigger, servedRuleText } from "./panel_core.js";
import type { AutomationSummary } from "./types.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A span as one compact unit, rounded DOWN: under a minute "<1 min", then
 * "N min" (< 60 min), "N h" (< 48 h, so a day reads "24 h"), "N d".
 */
export function compactDuration(ms: number): string {
  const span = Math.abs(ms);
  if (!Number.isFinite(span)) return "";
  if (span < MINUTE) return "<1 min";
  if (span < HOUR) return `${Math.floor(span / MINUTE)} min`;
  if (span < 2 * DAY) return `${Math.floor(span / HOUR)} h`;
  return `${Math.floor(span / DAY)} d`;
}


/**
 * The trigger part of the line: a schedule (schedule@1 or @2, any kind, bounds included) is the
 * gateway's `schedule_rule_text` verbatim ("Every 24 hours (UTC)", "Every day at 08:00
 * (Europe/Paris)"); otherwise "manual" or "on new email".
 */
export function compactCadence(trigger: AutomationSummary["trigger"], served?: Pick<AutomationSummary, "schedule_rule_text"> | null): string {
  // Every schedule row reads the gateway's own words (schedule_rule_text), bounds included.
  if (trigger.source_id === "schedule") return servedRuleText(served, trigger.source_version);
  if (trigger.source_id === "manual") return "manual";
  if (isEmailTrigger(trigger)) return "on new email";
  return trigger.source_id;
}

function parsed(ts: string | undefined | null): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
}

/**
 * "last 3 h ago" / "last <1 min ago" / "running now" (an occurrence executing) / "last never".
 * While an approval or question is pending (`attention.pending_waits`) an occurrence in flight is
 * not running: "waiting since 5 min" from its fired time, or "" (no run part) when that is unknown.
 */
export function lastRunText(s: Pick<AutomationSummary, "last_occurrence" | "current_occurrence"> & { attention?: Pick<AutomationSummary["attention"], "pending_waits"> }, nowMs: number): string {
  if (s.current_occurrence && (s.attention?.pending_waits ?? 0) > 0) {
    const same = s.last_occurrence && s.last_occurrence.index === s.current_occurrence.index ? parsed(s.last_occurrence.fired_at) : null;
    return same === null ? "" : `waiting since ${compactDuration(Math.max(0, nowMs - same))}`;
  }
  if (s.current_occurrence) return "running now";
  const last = s.last_occurrence;
  const t = parsed(last?.finished_at) ?? parsed(last?.fired_at);
  if (t === null) return "last never";
  // A run stamped after `nowMs` (clock skew between gateway and viewer) reads as just now.
  return `last ${compactDuration(Math.max(0, nowMs - t))} ago`;
}

/** "next in 14 h" / "next due now" from the served `next_run_at`; null when nothing is scheduled (paused, manual, finished). */
export function nextRunText(s: Pick<AutomationSummary, "next_run_at">, nowMs: number): string | null {
  const t = parsed(s.next_run_at);
  if (t === null) return null;
  if (t - nowMs < MINUTE) return "next due now";
  return `next in ${compactDuration(t - nowMs)}`;
}

export type AutomationTiming = { cadence: string; last: string; next: string | null; line: string };

/** The three facts and the joined line ("·" separated; the next part is omitted when none). */
export function automationTiming(
  s: Pick<AutomationSummary, "trigger" | "last_occurrence" | "current_occurrence" | "next_run_at" | "schedule_rule_text"> & { attention?: Pick<AutomationSummary["attention"], "pending_waits"> },
  nowMs: number,
): AutomationTiming {
  const cadence = compactCadence(s.trigger, s);
  const last = lastRunText(s, nowMs);
  const next = nextRunText(s, nowMs);
  return { cadence, last, next, line: [cadence, last, next].filter(Boolean).join(" · ") };
}
