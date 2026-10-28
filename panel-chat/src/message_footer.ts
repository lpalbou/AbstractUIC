/**
 * The message footer SPEC (operator QA 2026-10-28, AbstractUIC 0.8.4; backlog 0062).
 *
 * One spec for every chat surface of the framework. The web apps render it through
 * `ChatMessageCard` (never a local twin); the AbstractAssistant desktop mirrors it in its
 * own Qt bubble (it differs today: "Yesterday 10:52 PM" without the separator, a zero-padded
 * day "Oct 01", no year form, the raw text for a malformed stamp; its owner aligns it).
 * Exception until backlog 0063: the Docs assistant has no read-aloud path, so its answers
 * carry no speaker. A message's meta line holds, in this order:
 *
 *  1. STAMP: `formatMessageStamp(ts, now)`, in the reader's locale and time zone:
 *       - today              -> the time only               "12:46 AM"
 *       - yesterday          -> "Yesterday · " + time        "Yesterday · 10:52 PM"
 *       - earlier this year  -> short month, day · time      "Oct 21 · 10:52 PM"
 *       - another year       -> month, day, year · time      "Oct 21, 2025 · 10:52 PM"
 *     (a future day, e.g. clock skew, uses the dated form). "Today"/"yesterday" are the
 *     reader's calendar days, not 24 h windows; an open card re-renders at local midnight
 *     (`useLocalDay`). The full date and time is the stamp's hover text (`messageStampTitle`).
 *     A missing or malformed timestamp shows no stamp, never "Invalid Date"; an ISO string or
 *     epoch milliseconds are accepted, and a bare date ("2026-10-27") is that local day.
 *  2. SPEAKER: on EVERY assistant message whenever the host has a read-aloud path (the
 *     card's `onSpeakToggle`), always visible (never hover-only), on every assistant
 *     message kind (answers, questions, warnings, a reply from history, a reply that
 *     carries media). Its states are `speakButtonView` (speaker / spinner while the
 *     first audio is generated / Pause / Resume). While the reply is still streaming,
 *     or when the message has no text to read, the speaker stays in place DISABLED with
 *     its reason as the hover text ("Read aloud when the reply is finished", "No text to
 *     read aloud"; `aria-disabled`, still focusable), so the row never jumps and the reader
 *     sees the feature exists.
 *     User and system messages carry no speaker; a tool-activity row and a one-line
 *     system hint are not messages and carry no meta line.
 *  3. COPY: on every card unless the host passes `showCopy={false}`; always visible.
 *
 * Under the body, the STAT CHIPS of a workflow turn (`message.statistics`): tokens, tools,
 * files changed, duration. Every chip opens the structured `StatDetailPanel` on hover or
 * keyboard focus (title, headline, sections, footnote; `statDetail()`), never a native
 * multi-line `title` tooltip. A value the ledger did not report reads "not reported",
 * never 0. Labels are readable words (ADR 0043): file names, counts, durations; no ids.
 *
 * Checked by `panel-chat/scripts/check_message_footer.mjs` (red when the date is dropped
 * for a message not from today, when the speaker disappears from an assistant message of
 * a TTS host, or when a stat chip falls back to a plain `title`).
 */

import { useSyncExternalStore } from "react";

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function toDate(ts: string | number | Date | null | undefined): Date | null {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === "string" && !ts.trim()) return null;
  if (typeof ts === "string") {
    // A date without a time ("2026-10-27") is that calendar day where the reader is, not UTC midnight.
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ts.trim());
    if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  }
  const d = ts instanceof Date ? new Date(ts.getTime()) : new Date(typeof ts === "string" ? ts.trim() : ts);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * The message stamp: the time today, "Yesterday · <time>", "<Mon D> · <time>" earlier this
 * year, "<Mon D, YYYY> · <time>" another year. "" for a missing or malformed timestamp.
 * `locales` defaults to the reader's (undefined = the runtime's default locale).
 */
export function formatMessageStamp(
  ts: string | number | Date | null | undefined,
  now: Date = new Date(),
  locales?: string | string[],
): string {
  const d = toDate(ts);
  if (!d) return "";
  const time = d.toLocaleTimeString(locales, { hour: "2-digit", minute: "2-digit" });
  const day = startOfDay(d);
  const today = startOfDay(now);
  if (day === today) return time;
  const yesterday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (day === yesterday) return `Yesterday · ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(locales, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${date} · ${time}`;
}

/** The stamp's hover text: the full date and time ("Tuesday, October 21, 2026 at 10:52 PM"). "" when malformed. */
export function messageStampTitle(ts: string | number | Date | null | undefined, locales?: string | string[]): string {
  const d = toDate(ts);
  if (!d) return "";
  return d.toLocaleString(locales, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The stamp's machine-readable form for `<time dateTime>` (ISO 8601). "" when malformed. */
export function messageStampIso(ts: string | number | Date | null | undefined): string {
  const d = toDate(ts);
  return d ? d.toISOString() : "";
}

/** The reader's calendar day, as a key: a card re-derives its stamp when the day changes. */
export function localDayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

// One shared timer for every mounted card: it fires just after local midnight and notifies them.
const dayListeners = new Set<() => void>();
let dayTimer: ReturnType<typeof setTimeout> | null = null;
function armDayTimer(): void {
  if (dayTimer !== null || !dayListeners.size || typeof setTimeout !== "function") return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  // Capped at an hour so a suspended laptop or a clock change catches up soon after waking.
  dayTimer = setTimeout(() => {
    dayTimer = null;
    for (const listener of [...dayListeners]) listener();
    armDayTimer();
  }, Math.min(Math.max(1000, next.getTime() - now.getTime()), 3600000));
}
function subscribeDay(listener: () => void): () => void {
  dayListeners.add(listener);
  armDayTimer();
  return () => {
    dayListeners.delete(listener);
    if (!dayListeners.size && dayTimer !== null) {
      clearTimeout(dayTimer);
      dayTimer = null;
    }
  };
}
const currentDay = () => localDayKey();

/** The reader's calendar day (`localDayKey`); the component re-renders when it changes (local midnight). */
export function useLocalDay(): string {
  return useSyncExternalStore(subscribeDay, currentDay, currentDay);
}
