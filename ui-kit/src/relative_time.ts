// Deterministic relative and exact times for every client (ui-kit 0.6.0).
//
// "Deterministic" = the caller passes `nowMs`; nothing here reads the clock,
// so a list renders the same text in a test, a screenshot and the browser.
// No seconds, and no year unless the date is in another year than `nowMs`.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A timestamp as epoch ms: ISO text, epoch seconds (< 1e12) or epoch ms; NaN when unreadable. */
export function timeValueMs(ts: string | number | Date | null | undefined): number {
  if (ts === null || ts === undefined || ts === "") return NaN;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return Number.isFinite(ts) ? (ts < 1e12 ? ts * 1000 : ts) : NaN;
  const text = String(ts).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return timeValueMs(Number(text));
  return Date.parse(text);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "Oct 2" (same year as `nowMs`) or "Oct 2, 2025". Local time. */
export function formatShortDate(ts: string | number | Date | null | undefined, nowMs: number): string {
  const ms = timeValueMs(ts);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? "" : `, ${d.getFullYear()}`}`;
}

/** "Oct 2, 2026, 14:05" — the exact local time for a tooltip (never seconds). */
export function formatExactTime(ts: string | number | Date | null | undefined): string {
  const ms = timeValueMs(ts);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Relative to `nowMs`: "just now", "5 min ago", "3 h ago", "yesterday",
 * "4 days ago", then the short date ("Oct 2") from a week on. Future times
 * read "in 5 min", "in 14 h", "in 3 days" ("due now" within a minute).
 * Unreadable input → "".
 */
export function formatRelativeTime(ts: string | number | Date | null | undefined, nowMs: number): string {
  const ms = timeValueMs(ts);
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return "";
  const delta = nowMs - ms;
  if (delta < 0) {
    const ahead = -delta;
    if (ahead < MINUTE) return "due now";
    if (ahead < HOUR) return `in ${Math.round(ahead / MINUTE)} min`;
    if (ahead < DAY) return `in ${Math.round(ahead / HOUR)} h`;
    const days = Math.round(ahead / DAY);
    return days < 7 ? `in ${days} ${days === 1 ? "day" : "days"}` : formatShortDate(ms, nowMs);
  }
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} min ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)} h ago`;
  const days = Math.floor(delta / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatShortDate(ms, nowMs);
}
