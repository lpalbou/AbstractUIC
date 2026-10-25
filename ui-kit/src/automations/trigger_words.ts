// A trigger in the words a person reads (UX review 2026-10-25, defect #2: "When feed.item@1").
//
// One helper for every client: the automation list, the panel header, the Observer's Board and
// state line, the New-automation form ("Use the flow's trigger: …"). Source ids and versions never
// reach this text. The words name what the person set up, by its NAME: a feed or a webhook by the
// label of its trigger connection (`GET /api/gateway/triggers/connections`), a mailbox by its
// address (`GET /api/gateway/me/email/accounts`), a schedule by the gateway's own sentence in the
// account's time zone (the summary's served `schedule_rule_text`; the kit composes no calendar
// sentence). AbstractFlow's `automationChoice.ts` says the same sentences for a flow's defaults.
//
// Structure only: the words come from typed fields (source ids, config keys, labels the person
// typed), never from reading event or model text.
import type { JsonObject, Mailbox, TriggerConnection } from "./types.js";

/** The words this module writes (one place, so clients and checks agree). */
export const TRIGGER_WORDS_TEXT = {
  manual: "By hand",
  schedule: "On a schedule",
  something: "When something arrives",
  listening: "Listening",
  main_mailbox: "your main mailbox",
} as const;

type TriggerLike = { source_id?: string; source_version?: number; config?: JsonObject | Record<string, unknown> | null; connection_id?: string | null } | null | undefined;

/** The kind of thing a connection source delivers (by its source id: `feed.item`, `webhook.received`). */
export function connectionKind(sourceId: string | null | undefined): "feed" | "webhook" | "other" {
  const s = String(sourceId || "");
  if (s.startsWith("feed")) return "feed";
  if (s.startsWith("webhook")) return "webhook";
  return "other";
}

/** "When Release notes has a new item" / "When CI hook is called" / "When Orders sends something". */
export function connectionSentence(label: string, sourceId: string | null | undefined): string {
  const kind = connectionKind(sourceId);
  if (kind === "feed") return `When ${label} has a new item`;
  if (kind === "webhook") return `When ${label} is called`;
  return `When ${label} sends something`;
}

/** The connection a binding reads: `config.connection_id` (the stored binding) or a flow default's top-level `connection_id`. */
export function triggerConnectionId(trigger: TriggerLike): string {
  if (!trigger) return "";
  const config = (trigger.config ?? {}) as Record<string, unknown>;
  const cid = typeof config.connection_id === "string" ? config.connection_id : typeof trigger.connection_id === "string" ? trigger.connection_id : "";
  return cid.trim();
}

/** True for a trigger fed by something that arrives (a mailbox, a feed, a webhook): it has no clock and no "next run". */
export function isEventTrigger(trigger: TriggerLike): boolean {
  if (!trigger) return false;
  const source = String(trigger.source_id || "");
  if (source === "schedule" || source === "manual" || !source) return false;
  return true;
}

/** A mailbox for a person: its address, else "your main mailbox" (the primary) or the name the person gave it. */
export function mailboxName(account: unknown, mailboxes?: readonly Mailbox[] | null): string {
  const raw = typeof account === "string" ? account.trim() : "";
  const id = !raw || raw === "self" ? "default" : raw;
  const box = (mailboxes ?? []).find((m) => m.account_id === id) ?? (id === "default" ? (mailboxes ?? []).find((m) => m.primary) : undefined);
  if (box?.address) return box.address;
  return id === "default" ? TRIGGER_WORDS_TEXT.main_mailbox : id;
}

/** The connection a binding reads, when the person's list has it. */
export function connectionOf(trigger: TriggerLike, connections?: readonly TriggerConnection[] | null): TriggerConnection | null {
  const cid = triggerConnectionId(trigger);
  if (!cid) return null;
  return (connections ?? []).find((c) => c.connection_id === cid) ?? null;
}

/** What the trigger listens to, named ("Release notes", "me@example.org"); "" for a schedule or by hand. */
export function triggerSourceName(trigger: TriggerLike, connections?: readonly TriggerConnection[] | null, mailboxes?: readonly Mailbox[] | null): string {
  if (!trigger || !isEventTrigger(trigger)) return "";
  const source = String(trigger.source_id || "");
  if (source.startsWith("email")) return mailboxName((trigger.config as Record<string, unknown> | null | undefined)?.account, mailboxes);
  const conn = connectionOf(trigger, connections);
  if (conn?.label) return conn.label;
  const kind = connectionKind(source);
  return kind === "feed" ? "A feed" : kind === "webhook" ? "A webhook" : "A connection";
}

/**
 * The trigger in one sentence for a person:
 * - a schedule: the gateway's served `schedule_rule_text` ("Every day at 08:00 (Europe/Paris)"),
 *   else "On a schedule" (never `schedule@2`);
 * - by hand: "By hand";
 * - mail: "When mail arrives in me@example.org" (the mailbox's address; "your main mailbox");
 * - a feed: "When Release notes has a new item"; a webhook: "When CI hook is called" (the
 *   connection's label; "a feed" / "a webhook" while the list is not known);
 * - anything else that arrives: "When something arrives".
 */
export function triggerWords(
  trigger: TriggerLike,
  connections?: readonly TriggerConnection[] | null,
  mailboxes?: readonly Mailbox[] | null,
  served?: { schedule_rule_text?: string | null } | null,
): string {
  if (!trigger) return "";
  const source = String(trigger.source_id || "");
  if (source === "schedule") {
    const text = served?.schedule_rule_text;
    return typeof text === "string" && text.trim() ? text.trim() : TRIGGER_WORDS_TEXT.schedule;
  }
  if (source === "manual") return TRIGGER_WORDS_TEXT.manual;
  if (source.startsWith("email")) return `When mail arrives in ${mailboxName((trigger.config as Record<string, unknown> | null | undefined)?.account, mailboxes)}`;
  const cid = triggerConnectionId(trigger);
  if (cid) {
    const conn = connectionOf(trigger, connections);
    const kind = connectionKind(source);
    const label = conn?.label || (kind === "feed" ? "a feed" : kind === "webhook" ? "a webhook" : "a connection");
    return connectionSentence(label, source);
  }
  return TRIGGER_WORDS_TEXT.something;
}

// --- when something happened, in words ---------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function zoned(ms: number, timeZone: string): { day: string; clock: string; label: string } {
  // A PAST instant (when something arrived, when a run started) shown in the automation's served
  // zone: never a next run, never the browser's zone (check_schedule_when allows this file only).
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const [, mm, dd] = day.split("-");
  const label = `${Number(dd)} ${MONTHS[Number(mm) - 1] ?? mm}`;
  return { day, clock, label };
}

function validZone(timeZone: string | null | undefined): string | null {
  const z = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!z) return null;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: z });
    return z;
  } catch {
    return null;
  }
}

/**
 * A past instant for a person, in the automation's served time zone (the summary's `time_zone`):
 * "15:13" (today, `clock` style) or "today 15:13" (`day` style), "yesterday 15:13", "25 Oct 15:13".
 * Without a usable zone it reads in UTC and says so ("today 13:13 UTC"): the kit never guesses
 * the browser's zone. "" for a missing or unreadable time. `nowMs` decides what "today" is.
 */
export function whenWords(iso: string | null | undefined, opts: { timeZone?: string | null; nowMs?: number; style?: "clock" | "day" } = {}): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const zone = validZone(opts.timeZone);
  const tz = zone ?? "UTC";
  const suffix = zone ? "" : " UTC";
  const now = opts.nowMs ?? Date.now();
  const at = zoned(t, tz);
  const today = zoned(now, tz).day;
  const yesterday = zoned(now - 86_400_000, tz).day;
  if (at.day === today) return `${opts.style === "day" ? "today " : ""}${at.clock}${suffix}`;
  if (at.day === yesterday) return `yesterday ${at.clock}${suffix}`;
  return `${at.label} ${at.clock}${suffix}`;
}

// --- what arrived (an occurrence's `input_data.event`) --------------------------------------

/** The card above an occurrence's task: "Release notes · 1 new item: “Release 0.13” · 15:13". */
export type OccurrenceEventCard = {
  /** What it came from: the connection's label, the mailbox's address. */
  source: string;
  /** "1 new item: “Release 0.13”", "2 new messages: “Invoice”", "1 call". */
  what: string;
  /** When it arrived ("15:13", "yesterday 15:13"). */
  at: string;
  /** The same in one line ("·" separated). */
  text: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function quoted(s: string): string {
  return s ? `: “${s}”` : "";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The card for an occurrence fed by something that arrived, from its `input_data.event` (the
 * CloudEvent the runtime hands the run: `type` "abstract.<source>.v<n>", `time`, `data`). For a
 * feed: the count of new items and the first item's title (`data.events[0].data.title`, else its
 * `subject`); a webhook: the count of calls (and the first call's subject); mail: the count of
 * messages and the first subject. Null for a schedule tick, a manual run, or an event this does
 * not know (the occurrence then shows its raw text as before).
 */
export function occurrenceEventCard(
  event: unknown,
  ctx: { trigger?: TriggerLike; connections?: readonly TriggerConnection[] | null; mailboxes?: readonly Mailbox[] | null; timeZone?: string | null; nowMs?: number } = {},
): OccurrenceEventCard | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const e = event as Record<string, unknown>;
  const type = str(e.type);
  const m = /^abstract\.(.+)\.v(\d+)$/.exec(type);
  const source_id = m ? m[1] : "";
  if (!source_id || source_id === "schedule" || source_id === "manual") return null;
  const data = e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : {};
  const at = whenWords(str(e.time), { timeZone: ctx.timeZone, nowMs: ctx.nowMs });
  let source = "";
  let what = "";
  if (source_id.startsWith("email")) {
    const messages = Array.isArray(data.messages) ? (data.messages as Array<Record<string, unknown>>) : [];
    const n = typeof data.count === "number" ? data.count : messages.length;
    if (!n) return null;
    source = mailboxName((ctx.trigger?.config as Record<string, unknown> | null | undefined)?.account, ctx.mailboxes);
    what = `${plural(n, "new message", "new messages")}${quoted(str(messages[0]?.subject))}`;
  } else {
    const events = Array.isArray(data.events) ? (data.events as Array<Record<string, unknown>>) : [];
    const n = typeof data.count === "number" ? data.count : events.length;
    if (!n) return null;
    const first = events[0] && typeof events[0] === "object" ? events[0] : {};
    const firstData = first.data && typeof first.data === "object" && !Array.isArray(first.data) ? (first.data as Record<string, unknown>) : {};
    const cid = str(data.connection_id) || str(e.connectionid);
    const binding = { source_id, config: { connection_id: cid } };
    const conn = connectionOf(cid ? binding : ctx.trigger, ctx.connections);
    const kind = connectionKind(source_id);
    source = conn?.label || triggerSourceName(cid ? binding : ctx.trigger ?? binding, ctx.connections, ctx.mailboxes);
    if (kind === "webhook") what = `${plural(n, "call", "calls")}${quoted(str(first.subject))}`;
    else if (kind === "feed") what = `${plural(n, "new item", "new items")}${quoted(str(firstData.title) || str(first.subject))}`;
    else what = `${plural(n, "new event", "new events")}${quoted(str(first.subject))}`;
  }
  return { source, what, at, text: [source, what, at].filter(Boolean).join(" · ") };
}
