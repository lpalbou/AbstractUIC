// The entity card's words (ui-kit EntityCard; gateway backlog 1012, `GET /entities/{name}/tile`).
//
// The gateway serves closed kinds and the entity's own texts; every word a person reads on an
// entity card is decided HERE, once, for every app (Observer's Board, Entity's home grid...).
// Rules (operator 2026-11-07): plain words, no event names ("identity changed", "session closed"),
// no ids, no unit abbreviations ("tk"), no provider jargon. A kind this module does not know is not
// shown (never a raw snake_case word). Deterministic: the caller passes `nowMs`.

import { formatExactTime, formatRelativeTime, formatShortDate, timeValueMs } from "./relative_time.js";

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

/** How long, in plain words: "a moment", "5 min", "3 h", "4 days", "3 months", "2 years". */
export function entityDurationWords(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < MINUTE) return "a moment";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h`;
  const days = Math.floor(ms / DAY);
  if (days < 60) return plural(days, "day");
  if (days < 730) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

const PHASE_WORDS: Record<EntityTilePhase, string> = {
  sleep: "Asleep",
  visit: "In a visit",
  personal: "On its own time",
  work: "Working on a task",
  stopped: "Stopped",
};

/** The card's "now" line: what it is doing, busy this instant, and for how long.
 * e.g. "Asleep · for 3 months", "On its own time · busy now · for 12 min", "Asleep, dreaming". */
export function entityNowWords(now: EntityTile["now"] | null | undefined, nowMs: number): { label: string; busy: boolean; since: string; exact: string } {
  if (!now) return { label: "", busy: false, since: "", exact: "" };
  const base = PHASE_WORDS[now.phase] ?? "";
  const label = now.phase === "sleep" && now.detail === "dreaming" ? `${base}, dreaming` : base;
  const at = timeValueMs(now.since);
  const since = Number.isFinite(at) && label ? `for ${entityDurationWords(Math.max(0, nowMs - at))}` : "";
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

/** "3 h ago" etc. for a dated fact (re-exported wording of the kit's relative time). */
export function entityWhenWords(at: string | null | undefined, nowMs: number): string {
  return formatRelativeTime(at, nowMs);
}

/** The words a screen reader hears for the whole card (one sentence per fact). */
export function entityCardSummary(tile: EntityTile, nowMs: number): string {
  const now = entityNowWords(tile.now, nowMs);
  const parts = [
    tile.name,
    [now.label, now.busy ? "busy now" : "", now.since].filter(Boolean).join(", "),
    entityTroubleWords(tile.now?.trouble, nowMs),
    tile.into_lately?.[0]?.text ? `Into lately: ${tile.into_lately[0].text}` : "",
    entityMomentWords(tile.last_moment) ? `${entityMomentWords(tile.last_moment)} ${entityWhenWords(tile.last_moment?.at, nowMs)}` : "",
  ];
  return parts.filter(Boolean).join(". ");
}
