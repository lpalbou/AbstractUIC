// The entity card's words (ui-kit EntityCard; gateway backlog 1012, `GET /entities/{name}/tile`).
//
// The gateway serves closed kinds and the entity's own texts; every word a person reads on an
// entity card is decided HERE, once, for every app (Observer's Board, Entity's home grid...).
// Rules (operator 2026-11-07): plain words, no event names ("identity changed", "session closed"),
// no ids, no unit abbreviations ("tk"), no provider jargon. A kind this module does not know is not
// shown (never a raw snake_case word). Deterministic: the caller passes `nowMs`.

import { formatExactTime, formatShortDate, timeValueMs } from "./relative_time.js";

/** The ruled phase words, plus "stopped" (the kill switch: no phase is active). */
export type EntityTilePhase = "sleep" | "visit" | "personal" | "work" | "stopped";

/** The tile payload (`GET /entities/{name}/tile`, tile_version 1). */
export type EntityTile = {
  tile_version: number;
  name: string;
  slug: string;
  look: { style: string | null; color: string | null } | null;
  born: string | null;
  age_days: number | null;
  mind: { model: string; source?: string } | null;
  now: {
    phase: EntityTilePhase;
    /** The operator state under the phase (awake / asleep / paused); "awake" under phase sleep is
     * the resting default (nothing running), read as "Resting". */
    state?: string | null;
    detail: "resting" | "dreaming" | "bounded" | null;
    busy: boolean;
    since: string | null;
    trouble: { kind: string; at: string | null } | null;
  };
  into_lately: Array<{ text: string; at: string | null; explored?: boolean }>;
  on_its_mind: { kind: "problem" | "question"; text: string; at: string | null } | null;
  latest_lesson: { text: string; at: string | null } | null;
  last_moment: { kind: string; at: string | null; to?: string; change?: string } | null;
  counts: { open_questions?: number; open_problems?: number; lessons?: number; interests?: number; sleeps?: number | null };
  as_of_seq?: number;
  read_at?: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How long, in plain words (no abbreviations): "1 minute", "5 minutes", "3 hours", "4 days",
 * "3 months", "2 years"; "" under a minute. */
export function entityDurationWords(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE) return "";
  if (ms < HOUR) return plural(Math.floor(ms / MINUTE), "minute");
  if (ms < DAY) return plural(Math.floor(ms / HOUR), "hour");
  const days = Math.floor(ms / DAY);
  if (days < 60) return plural(days, "day");
  if (days < 730) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

const PHASE_WORDS: Record<EntityTilePhase, string> = {
  sleep: "Asleep",
  visit: "In a visit",
  personal: "On its own time",
  work: "Working",
  stopped: "Stopped",
};

/** The card's "now" line: what it is doing, busy this instant, and for how long.
 * e.g. "Asleep · for 3 months", "On its own time · busy now · for 12 minutes", "Asleep, dreaming",
 * "Resting · just now" (awake with nothing running: the resting default). */
export function entityNowWords(now: EntityTile["now"] | null | undefined, nowMs: number): { label: string; busy: boolean; since: string; exact: string } {
  if (!now) return { label: "", busy: false, since: "", exact: "" };
  const resting = now.phase === "sleep" && now.state === "awake";
  const base = resting ? "Resting" : PHASE_WORDS[now.phase] ?? "";
  const label = now.phase === "sleep" && now.detail === "dreaming" && !resting ? `${base}, dreaming` : base;
  const at = timeValueMs(now.since);
  const lasted = Number.isFinite(at) ? entityDurationWords(Math.max(0, nowMs - at)) : "";
  const since = !label || !Number.isFinite(at) ? "" : lasted ? `for ${lasted}` : "just now";
  return { label, busy: Boolean(now.busy) && now.phase !== "stopped", since, exact: since ? `Since ${formatExactTime(now.since)}` : "" };
}

/** The one trouble a card warns about, or "" when there is none (or one this kit cannot name). */
export function entityTroubleWords(trouble: EntityTile["now"]["trouble"] | null | undefined, nowMs: number): string {
  if (!trouble) return "";
  if (trouble.kind === "own_time_failed") {
    const when = formatShortDate(trouble.at, nowMs);
    return `Its own time stopped after repeated failures${when ? ` (${when})` : ""}`;
  }
  return "";
}

const PHASE_NOUNS: Record<string, string> = { visit: "a visit", work: "work", personal: "its own time", sleep: "sleep" };

/** A moment in words, or "" for a kind this kit does not show. */
export function entityMomentWords(moment: EntityTile["last_moment"] | null | undefined): string {
  if (!moment) return "";
  switch (moment.kind) {
    case "summon":
      return "A visit began";
    case "session_closed":
      return "A visit ended";
    case "sleep":
      return "Fell asleep";
    case "wake":
      return "Woke up";
    case "pause":
      return "Was stopped";
    case "personal_started":
      return "Began its own time";
    case "personal_stop_requested":
      return "Was asked to end its own time";
    case "personal_frozen":
      return "Its own time was cut off";
    case "phase_changed":
      return moment.to && PHASE_NOUNS[moment.to] ? `Moved to ${PHASE_NOUNS[moment.to]}` : "";
    case "substrate_changed":
      return "Its mind changed to another model";
    case "night_voice":
      return "Told a dream";
    case "work_order_changed":
      return moment.change === "set" ? "Was given a mission" : moment.change === "cleared" ? "Its mission ended" : "Its mission changed";
    case "task_inbox_changed":
      return "Its tasks changed";
    case "identity_changed":
      return "Its look or voice changed";
    default:
      return "";
  }
}

/** "Born today", "1 day old", "45 days old", "3 months old", "2 years old". */
export function entityAgeWords(ageDays: number | null | undefined): string {
  if (typeof ageDays !== "number" || !Number.isFinite(ageDays) || ageDays < 0) return "";
  if (ageDays < 1) return "Born today";
  return `${entityDurationWords(ageDays * DAY)} old`;
}

/** The counts a person reads, non-zero ones only: "33 lessons learned", "78 open questions"... */
export function entityCountsWords(counts: EntityTile["counts"] | null | undefined): string[] {
  if (!counts) return [];
  const n = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : 0);
  const out: string[] = [];
  if (n(counts.lessons)) out.push(`${plural(n(counts.lessons), "lesson")} learned`);
  if (n(counts.open_problems)) out.push(`${plural(n(counts.open_problems), "open problem")}`);
  if (n(counts.open_questions)) out.push(`${plural(n(counts.open_questions), "open question")}`);
  if (n(counts.sleeps)) out.push(plural(n(counts.sleeps), "sleep"));
  return out;
}

/** When a dated fact happened, without abbreviations: "just now", "12 minutes ago", "3 hours ago",
 * "yesterday", "4 days ago", then the date ("Aug 2"). */
export function entityWhenWords(at: string | number | null | undefined, nowMs: number): string {
  const ms = timeValueMs(at);
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return "";
  const delta = Math.max(0, nowMs - ms);
  if (delta < MINUTE) return "just now";
  if (delta < DAY) return `${entityDurationWords(delta)} ago`;
  const days = Math.floor(delta / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatShortDate(ms, nowMs);
}

/** The accessible name of the card's head (the link or button that opens the entity): who and
 * what it is doing now. The body is read after it, so nothing is said twice. */
export function entityCardSummary(tile: EntityTile, nowMs: number): string {
  const now = entityNowWords(tile.now, nowMs);
  return [tile.name, [now.label, now.busy ? "busy now" : "", now.since].filter(Boolean).join(", ")].filter(Boolean).join(". ");
}
