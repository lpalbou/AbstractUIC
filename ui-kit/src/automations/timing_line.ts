// The one compact timing line of an automation card / header:
//   "every 24 h · last 3 h ago · next in 14 h"
// Deterministic: the caller passes `nowMs`; no locale, no year, no seconds.
// Reads STRUCTURE only (trigger config, occurrence timestamps, next_fire_at).
import { isEmailTrigger, parseDuration } from "./panel_core.js";
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

const UNIT: Record<string, [string, string]> = {
  s: ["second", "s"],
  m: ["minute", "min"],
  h: ["hour", "h"],
  d: ["day", "d"],
};

/** The trigger in two or three words: "every 24 h", "every hour", "once", "manual", "on new email". */
export function compactCadence(trigger: AutomationSummary["trigger"]): string {
  if (trigger.source_id === "schedule") {
    const every = (trigger.config as { every?: unknown }).every;
    const d = parseDuration(every);
    if (!d) return typeof every === "string" ? `every ${every}` : "once";
    // A seconds interval that is whole minutes reads in minutes (no seconds on screen).
    if (d.unit === "s" && d.amount % 60 === 0) return compactCadence({ ...trigger, config: { every: `${d.amount / 60}m` } });
    const [one, short] = UNIT[d.unit];
    return d.amount === 1 ? `every ${one}` : `every ${d.amount} ${short}`;
  }
  if (trigger.source_id === "manual") return "manual";
  if (isEmailTrigger(trigger)) return "on new email";
  return trigger.source_id;
}

function parsed(ts: string | undefined | null): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
}

/** "last 3 h ago" / "last <1 min ago" / "running now" (an occurrence in flight) / "last never". */
export function lastRunText(s: Pick<AutomationSummary, "last_occurrence" | "current_occurrence">, nowMs: number): string {
  if (s.current_occurrence) return "running now";
  const last = s.last_occurrence;
  const t = parsed(last?.finished_at) ?? parsed(last?.fired_at);
  if (t === null) return "last never";
  // A run stamped after `nowMs` (clock skew between gateway and viewer) reads as just now.
  return `last ${compactDuration(Math.max(0, nowMs - t))} ago`;
}

/** "next in 14 h" / "next due now"; null when nothing is scheduled (paused, manual, finished). */
export function nextRunText(s: Pick<AutomationSummary, "next_fire_at">, nowMs: number): string | null {
  const t = parsed(s.next_fire_at);
  if (t === null) return null;
  if (t - nowMs < MINUTE) return "next due now";
  return `next in ${compactDuration(t - nowMs)}`;
}

export type AutomationTiming = { cadence: string; last: string; next: string | null; line: string };

/** The three facts and the joined line ("·" separated; the next part is omitted when none). */
export function automationTiming(
  s: Pick<AutomationSummary, "trigger" | "last_occurrence" | "current_occurrence" | "next_fire_at">,
  nowMs: number,
): AutomationTiming {
  const cadence = compactCadence(s.trigger);
  const last = lastRunText(s, nowMs);
  const next = nextRunText(s, nowMs);
  return { cadence, last, next, line: [cadence, last, next].filter(Boolean).join(" · ") };
}
