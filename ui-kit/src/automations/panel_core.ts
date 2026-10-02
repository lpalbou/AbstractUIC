import { automationToolSelection, withAutomationTools } from "./tool_selection.js";
import { automationTargetValue, retargetAutomationInput } from "./target_selection.js";
// Pure presentation rules for the automation panel and the schedule dialog
// (the kit's `*_core.ts` pattern: no React, checked directly by
// scripts/check_automation_panel.mjs). Everything here reads STRUCTURE only —
// statuses, notify objects, waits, config fields — never model prose.
import controlsSpec from "./automation_controls.json" with { type: "json" };
import { randomId } from "../random_id.js";
import type {
  ApiError,
  AutomationChanges,
  AutomationNotify,
  EmailFilter,
  EmailReceivedConfig,
  MyEmailStatus,
  AutomationSummary,
  AutomationTarget,
  ContextMode,
  CreateAutomationRequest,
  JsonObject,
  OccurrenceRow,
  Json,
  OccurrenceWait,
  AttentionWait,
  ScheduleConfig,
  ToolApprovalPolicy,
  ToolCallToApprove,
  TriggerBinding,
} from "./types.js";

export const DURATION_RE = /^([1-9][0-9]*)([smhd])$/;
export type DurationUnit = "s" | "m" | "h" | "d";
const UNIT_WORDS: Record<DurationUnit, [string, string]> = {
  s: ["second", "seconds"],
  m: ["minute", "minutes"],
  h: ["hour", "hours"],
  d: ["day", "days"],
};

export function parseDuration(value: unknown): { amount: number; unit: DurationUnit } | null {
  if (typeof value !== "string") return null;
  const m = DURATION_RE.exec(value);
  return m ? { amount: Number(m[1]), unit: m[2] as DurationUnit } : null;
}

/** "every 8 hours" / "every hour" — fixed UTC intervals, never calendar wording. */
export function intervalLabel(every: string): string {
  const d = parseDuration(every);
  if (!d) return `every ${every}`;
  const [one, many] = UNIT_WORDS[d.unit];
  return d.amount === 1 ? `every ${one}` : `every ${d.amount} ${many}`;
}

/** `2026-09-27T08:00:00Z` → `2026-09-27 08:00 UTC` (seconds shown only when non-zero). */
export function formatUtc(ts: string | undefined | null): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  const iso = new Date(t).toISOString();
  const secs = iso.slice(17, 19);
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}${secs === "00" ? "" : `:${secs}`} UTC`;
}

/** `schedule@1` config → "every 8 hours (UTC)", "once at 2026-09-27 08:00 UTC", + bounds. */
export function scheduleLabel(config: ScheduleConfig | JsonObject): string {
  const c = config as ScheduleConfig;
  if (typeof c.every !== "string") return c.start_at ? `once at ${formatUtc(c.start_at)}` : "once, now";
  const parts = [`${intervalLabel(c.every)} (UTC)`];
  if (typeof c.count === "number") parts.push(`${c.count} ${c.count === 1 ? "run" : "runs"} max`);
  if (typeof c.until === "string") parts.push(`until ${formatUtc(c.until)}`);
  return parts.join(" · ");
}

export function triggerSummary(trigger: Pick<TriggerBinding, "source_id" | "source_version" | "config">): string {
  if (trigger.source_id === "schedule" && trigger.source_version === 1) return scheduleLabel(trigger.config);
  if (trigger.source_id === "manual" && trigger.source_version === 1) return "manual runs only";
  if (isEmailTrigger(trigger)) return emailTriggerLabel(trigger.config);
  return `${trigger.source_id}@${trigger.source_version}`;
}

export function contextLabel(mode: ContextMode): string {
  return mode === "growing" ? "Growing — each run sees the previous runs" : "Independent — each run starts fresh";
}

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  archived: "Archived",
};

// --- email.received@1 (framework backlog 0992 WP6) ---------------------------------

/** Wording shared with the clients that vendor `automation_controls.json` (the Assistant, the Code TUI). */
export const EMAIL_TEXT: Readonly<Record<string, string>> = (controlsSpec as { email: Record<string, string> }).email;
export const EMAIL_TRIGGER_SOURCE_ID = "email.received";
export const EMAIL_TRIGGER_SOURCE_VERSION = 1;
/** `uses_model` true (the default: the target runs a model on new mail) → one run an hour at most. */
export const EMAIL_DEFAULT_EVERY_MODEL = "1h";
/** `uses_model` false (fetch + typed filters, no model) → checked every 60 s. */
export const EMAIL_DEFAULT_EVERY_NO_MODEL = "60s";
export const EMAIL_MIN_EVERY_SECONDS = 60;
export const EMAIL_DEFAULT_MAX_BATCH = 100;
export const EMAIL_MAX_BATCH = 1000;
/** The runtime's caps (`triggers/email_received.py`). */
export const EMAIL_MAX_FILTER_ENTRIES = 200;
export const EMAIL_MAX_SUBJECT_CONTAINS = 200;
export const EMAIL_MAX_ALLOWED_RECIPIENTS = 50;

export function isEmailTrigger(trigger: Pick<TriggerBinding, "source_id" | "source_version"> | null | undefined): boolean {
  return !!trigger && trigger.source_id === EMAIL_TRIGGER_SOURCE_ID && trigger.source_version === EMAIL_TRIGGER_SOURCE_VERSION;
}

/**
 * True only when the user's account can be used now (`GET /me/email` →
 * `effective_enabled`: connected, the user's switch on, allowed by the
 * administrator). Unknown (null / not loaded / the call failed) is NOT usable:
 * the form then shows "Connect a mailbox first — open My email" instead of the
 * email options.
 */
export function emailUsable(status: MyEmailStatus | null | undefined): boolean {
  return !!status && status.effective_enabled === true;
}

/**
 * Entries of a typed list field: split on commas, semicolons and white space,
 * trimmed, lower-cased, de-duplicated (order kept). Structure only — the
 * entries are then checked one by one as plain addresses or domains.
 */
export function parseEntryList(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

const ADDRESS_FORBIDDEN = /[\s<>,;:"()[\]]/;
/** `name@example.test` — the runtime's plain-address rule (one "@", no display name, no brackets). */
export function isPlainAddress(value: string): boolean {
  const a = value.trim().toLowerCase();
  const at = a.indexOf("@");
  if (at <= 0 || at === a.length - 1) return false;
  const domain = a.slice(at + 1);
  return !domain.includes("@") && !ADDRESS_FORBIDDEN.test(a);
}
/** `example.test` — the runtime's domain rule (no "@", at least one dot, no pattern characters). */
export function isPlainDomain(value: string): boolean {
  const d = value.trim().toLowerCase();
  return !!d && !d.includes("@") && d.includes(".") && !d.startsWith(".") && !d.endsWith(".") && !/[\s<>,;:"()[\]/*]/.test(d);
}

export type EmailAttachmentFilter = "any" | "yes" | "no";
/** The "When an email arrives" fields. List fields are the raw text the user typed. */
export type EmailTriggerForm = {
  /** Does the target run a model on new mail? Decides the default interval (1 h vs 60 s). */
  usesModel: boolean;
  /** `null` = the default for `usesModel`. */
  every: { amount: number; unit: "m" | "h" | "d" } | null;
  /** `null` = the default (100). */
  maxBatch: number | null;
  fromIn: string;
  fromDomainIn: string;
  toIn: string;
  subjectContains: string;
  hasAttachment: EmailAttachmentFilter;
};
export const DEFAULT_EMAIL_TRIGGER_FORM: EmailTriggerForm = {
  usesModel: true,
  every: null,
  maxBatch: null,
  fromIn: "",
  fromDomainIn: "",
  toIn: "",
  subjectContains: "",
  hasAttachment: "any",
};

/** "1h" when the target runs a model, else "60s". */
export function emailDefaultEvery(usesModel: boolean): string {
  return usesModel ? EMAIL_DEFAULT_EVERY_MODEL : EMAIL_DEFAULT_EVERY_NO_MODEL;
}

function durationSeconds(every: string): number | null {
  const d = parseDuration(every);
  if (!d) return null;
  return d.amount * { s: 1, m: 60, h: 3600, d: 86400 }[d.unit];
}

function listField(text: string, label: string, ok: (v: string) => boolean, kind: string, errors: string[]): string[] | null {
  const items = parseEntryList(text);
  if (!items.length) return null;
  const bad = items.filter((v) => !ok(v));
  if (bad.length) errors.push(`${label}: ${bad.join(", ")} ${bad.length === 1 ? "is not" : "are not"} ${kind}.`);
  if (items.length > EMAIL_MAX_FILTER_ENTRIES) errors.push(`${label}: at most ${EMAIL_MAX_FILTER_ENTRIES} entries.`);
  return items;
}

/** The `email.received@1` config (explicit `uses_model`, `every`, `max_batch`; `filter` only when set), or the reasons it is invalid. */
export function emailTriggerConfigFrom(form: EmailTriggerForm): { config: EmailReceivedConfig; errors: string[] } {
  const errors: string[] = [];
  const config: EmailReceivedConfig = { uses_model: form.usesModel };
  if (form.every === null) config.every = emailDefaultEvery(form.usesModel);
  else if (!Number.isInteger(form.every.amount) || form.every.amount < 1) errors.push("The check interval must be a whole number of at least 1.");
  else config.every = `${form.every.amount}${form.every.unit}`;
  if (config.every !== undefined && (durationSeconds(config.every) ?? 0) < EMAIL_MIN_EVERY_SECONDS) errors.push("The check interval is at least 60 seconds.");
  if (form.maxBatch === null) config.max_batch = EMAIL_DEFAULT_MAX_BATCH;
  else if (!Number.isInteger(form.maxBatch) || form.maxBatch < 1 || form.maxBatch > EMAIL_MAX_BATCH) errors.push(`At most this many emails per run: a whole number from 1 to ${EMAIL_MAX_BATCH}.`);
  else config.max_batch = form.maxBatch;
  const filter: EmailFilter = {};
  const fromIn = listField(form.fromIn, EMAIL_TEXT.from_in, isPlainAddress, "an email address", errors);
  if (fromIn) filter.from_in = fromIn;
  const domains = listField(form.fromDomainIn, EMAIL_TEXT.from_domain_in, isPlainDomain, "a domain like example.com", errors);
  if (domains) filter.from_domain_in = domains;
  const toIn = listField(form.toIn, EMAIL_TEXT.to_in, isPlainAddress, "an email address", errors);
  if (toIn) filter.to_in = toIn;
  const subject = form.subjectContains.trim();
  if (subject) {
    if (subject.length > EMAIL_MAX_SUBJECT_CONTAINS || /[\r\n]/.test(subject)) errors.push(`${EMAIL_TEXT.subject_contains}: one line of at most ${EMAIL_MAX_SUBJECT_CONTAINS} characters.`);
    else filter.subject_contains = subject;
  }
  if (form.hasAttachment === "yes") filter.has_attachment = true;
  else if (form.hasAttachment === "no") filter.has_attachment = false;
  if (Object.keys(filter).length) config.filter = filter;
  return { config, errors };
}

/** "when an email arrives · from a@x.test, x.test · subject contains “invoice” · checked every hour · up to 100 per run". */
export function emailTriggerLabel(config: EmailReceivedConfig | JsonObject): string {
  const c = config as EmailReceivedConfig;
  const f = (c.filter ?? {}) as EmailFilter;
  const parts = ["when an email arrives"];
  const from = [...(f.from_in ?? []), ...(f.from_domain_in ?? [])];
  if (from.length) parts.push(`from ${from.join(", ")}`);
  if (f.to_in && f.to_in.length) parts.push(`to ${f.to_in.join(", ")}`);
  if (typeof f.subject_contains === "string" && f.subject_contains) parts.push(`subject contains “${f.subject_contains}”`);
  if (f.has_attachment === true) parts.push("with attachments");
  if (f.has_attachment === false) parts.push("without attachments");
  const every = typeof c.every === "string" ? c.every : emailDefaultEvery(c.uses_model !== false);
  parts.push(`checked ${intervalLabel(every)}`);
  const batch = typeof c.max_batch === "number" ? c.max_batch : EMAIL_DEFAULT_MAX_BATCH;
  parts.push(`up to ${batch} per run`);
  return parts.join(" · ");
}

/** Allowed recipients as the form holds them. */
export type EmailRecipientsForm = { mode: "self" | "list"; addresses: string };
export const DEFAULT_EMAIL_RECIPIENTS: EmailRecipientsForm = { mode: "self", addresses: "" };

/**
 * `notify.recipients` from the form: `["self"]` for "only me",
 * `["self", ...addresses]` for "me and these addresses" (at least one).
 */
export function emailAllowedRecipientsFrom(form: EmailRecipientsForm): { recipients: string[]; errors: string[] } {
  if (form.mode === "self") return { recipients: ["self"], errors: [] };
  const errors: string[] = [];
  const items = parseEntryList(form.addresses).filter((a) => a !== "self");
  if (!items.length) errors.push("Name at least one address the automation may email, or choose Only me.");
  const bad = items.filter((a) => !isPlainAddress(a));
  if (bad.length) errors.push(`${EMAIL_TEXT.recipients_list}: ${bad.join(", ")} ${bad.length === 1 ? "is not an email address" : "are not email addresses"}.`);
  if (items.length + 1 > EMAIL_MAX_ALLOWED_RECIPIENTS) errors.push(`At most ${EMAIL_MAX_ALLOWED_RECIPIENTS - 1} addresses.`);
  return { recipients: ["self", ...items], errors };
}

/** The form's view of a stored result-recipient list (absent = only me). */
export function emailRecipientsFormFrom(list: string[] | null | undefined): EmailRecipientsForm {
  const extra = (list ?? []).filter((a) => a !== "self");
  return extra.length ? { mode: "list", addresses: extra.join(", ") } : { mode: "self", addresses: "" };
}

/** "Only me" / "Me and boss@example.test". */
export function emailRecipientsLabel(list: string[] | null | undefined): string {
  const extra = (list ?? ["self"]).filter((a) => a !== "self");
  return extra.length ? `Me and ${extra.join(", ")}` : "Only me";
}

/** `notify` for "Email result": `["console", "email"]` when on, the default `["console"]` when off. */
export function notifyFor(emailMe: boolean, recipients: string[] = ["self"]): AutomationNotify {
  return { channels: emailMe ? ["console", "email"] : ["console"], ...(recipients.some((r) => r !== "self") ? { recipients } : {}) };
}
export function notifyEmails(notify: AutomationNotify | null | undefined): boolean {
  return !!notify && Array.isArray(notify.channels) && notify.channels.includes("email");
}
export function notifyLabel(notify: AutomationNotify | null | undefined): string {
  return notifyEmails(notify) ? "In the console and by email" : "In the console";
}

// --- controls ---------------------------------------------------------------

export type ControlId = "active" | "pause" | "resume" | "run_now" | "stop_current" | "revise" | "archive" | "discuss";
export type ControlState = { enabled: boolean; reason?: string };
export const CONTROL_COMMANDS: Record<Exclude<ControlId, "active" | "revise" | "discuss">, string> = {
  pause: "automation.pause",
  resume: "automation.resume",
  run_now: "automation.run_now",
  stop_current: "automation.stop_current",
  archive: "automation.archive",
};

const IN_PROGRESS = new Set(["running", "waiting", "backoff"]);

/**
 * True while an occurrence is in flight — from the server's
 * `summary.current_occurrence` only (its `pending_occurrence`), never inferred
 * from `last_occurrence` or the rows. Legacy rows (no field) → false.
 */
export function occurrenceInProgress(summary: AutomationSummary, _occurrences: OccurrenceRow[] = []): boolean {
  return summary.current_occurrence != null;
}

/** "Run #7 running", "Run #7 starting", "Run #7 waiting to retry (attempt 2)"; null when nothing is in flight. */
export function currentOccurrenceLabel(summary: AutomationSummary): string | null {
  const c = summary.current_occurrence;
  if (!c) return null;
  const attempt = c.attempt > 1 ? ` (attempt ${c.attempt})` : "";
  if (c.status === "backoff") return `Run #${c.index} waiting to retry (attempt ${c.attempt + 1})`;
  if (c.status === "admitted") return `Run #${c.index} starting${attempt}`;
  return `Run #${c.index} running${attempt}`;
}

/** "in 25 min", "in 3 h 5 min", "in 2 d 4 h", "due now" — from `next_fire_at` only. */
export function relativeIn(ts: string, nowMs: number): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "";
  const min = Math.round((t - nowMs) / 60000);
  if (min <= 0) return "due now";
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `in ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `in ${d} d${h % 24 ? ` ${h % 24} h` : ""}`;
}

/**
 * Which controls are enabled. The server decides what the principal may do
 * (`summary.capabilities`); the status decides which of them apply now. Run
 * now stays enabled while paused (it does not resume). `busy` disables all.
 * Discuss needs the `discuss` capability and is off for legacy rows; it stays
 * available on an archived automation (its history is kept).
 */
export function automationControls(
  summary: AutomationSummary,
  occurrences: OccurrenceRow[] = [],
  busy = false,
): Record<ControlId, ControlState> {
  const caps = new Set(summary.capabilities);
  const st = summary.status;
  const running = occurrenceInProgress(summary, occurrences);
  const gate = (id: ControlId, ok: boolean, reason: string): ControlState => {
    if (busy) return { enabled: false, reason: "Working…" };
    if (summary.legacy) return { enabled: false, reason: "Legacy schedule: managed with its existing controls." };
    if (!caps.has(id)) return { enabled: false, reason: "Not permitted for this automation." };
    if (st === "archived") return { enabled: false, reason: "Archived: history is kept, nothing runs." };
    return ok ? { enabled: true } : { enabled: false, reason };
  };
  const live = st === "active" || st === "paused";
  // The "Active" state toggle (operator 2026-09-30: a persistent on/off
  // setting is a pressed/plain toggle, never a Pause/Resume verb swap). It
  // needs the capability of the transition a click would request.
  const toggleCap: ControlId = st === "active" ? "pause" : "resume";
  const active: ControlState = busy
    ? { enabled: false, reason: "Working…" }
    : summary.legacy
      ? { enabled: false, reason: "Legacy schedule: managed with its existing controls." }
      : st === "archived"
        ? { enabled: false, reason: "Archived: history is kept, nothing runs." }
        : !live
          ? { enabled: false, reason: "The automation has ended." }
          : caps.has(toggleCap)
            ? { enabled: true }
            : { enabled: false, reason: "Not permitted for this automation." };
  return {
    active,
    pause: gate("pause", st === "active", st === "paused" ? "Already paused." : "The automation has ended."),
    resume: gate("resume", st === "paused", st === "active" ? "Already running on schedule." : "The automation has ended."),
    run_now: gate("run_now", live && !running, running ? "An occurrence is in progress." : "The automation has ended."),
    stop_current: gate("stop_current", running, "Nothing is running."),
    revise: gate("revise", true, ""),
    archive: gate("archive", true, ""),
    discuss: busy
      ? { enabled: false, reason: "Working…" }
      : summary.legacy
        ? { enabled: false, reason: "Legacy schedule: discussion is not available." }
        : caps.has("discuss")
          ? { enabled: true }
          : { enabled: false, reason: "Discussion is not permitted for this automation." },
  };
}

/** The command the "Active" toggle sends from this state: pause when active, resume when paused. */
export function activeToggleCommand(summary: Pick<AutomationSummary, "status">): string {
  return summary.status === "active" ? CONTROL_COMMANDS.pause : CONTROL_COMMANDS.resume;
}

// --- occurrences as chat pairs -------------------------------------------------

export type OccurrenceTone = "quiet" | "notified" | "failed" | "waiting" | "running";
export type OccurrenceView = {
  row: OccurrenceRow;
  tone: OccurrenceTone;
  /** Failures, waits and explicit notify are notable; everything else is quiet. */
  notable: boolean;
  badge: string | null;
  statusText: string;
  canDiscuss: boolean;
};

export function occurrenceTone(row: OccurrenceRow): OccurrenceTone {
  if (row.status === "failed") return "failed";
  if (row.waits.length > 0 || row.status === "waiting") return "waiting";
  if (row.notify !== null) return "notified";
  if (row.status === "running" || row.status === "backoff") return "running";
  return "quiet";
}

/** Chronological (oldest first) chat pairs, whatever the page order. */
export function occurrenceViews(rows: OccurrenceRow[]): OccurrenceView[] {
  return [...rows]
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      const tone = occurrenceTone(row);
      const attempts = `${row.attempts} ${row.attempts === 1 ? "attempt" : "attempts"}`;
      const badge =
        tone === "failed" ? `Failed after ${attempts}` : tone === "waiting" ? "Waiting for you" : tone === "notified" ? "Notified" : tone === "running" ? "Running" : null;
      const statusText = row.status === "completed" && row.attempts > 1 ? `completed after ${attempts}` : row.status;
      return { row, tone, notable: tone === "failed" || tone === "waiting" || tone === "notified", badge, statusText, canDiscuss: !IN_PROGRESS.has(row.status) };
    });
}

// --- attention ---------------------------------------------------------------

/**
 * The cursor to acknowledge after showing `summary.attention.items`: the LAST
 * DISPLAYED item's, never `attention.cursor` (items beyond the 20 shown stay
 * unseen). Null when nothing is displayed.
 */
export function attentionAckCursor(summary: AutomationSummary): string | null {
  const items = summary.attention.items;
  return items.length ? items[items.length - 1].cursor : null;
}

export function attentionLabel(summary: AutomationSummary): string {
  const a = summary.attention;
  const parts: string[] = [];
  if (a.unseen_count > 0) parts.push(`${a.unseen_count} unseen`);
  if (a.pending_waits > 0) parts.push(`${a.pending_waits} waiting for you`);
  return parts.length ? parts.join(" · ") : "nothing new";
}

// --- errors ------------------------------------------------------------------

export const API_ERROR_TEXT: Record<string, string> = {
  unauthorized: "Sign in to the gateway to manage automations.",
  forbidden: "You are not allowed to do this with automations.",
  automation_not_found: "This automation does not exist (or is not yours).",
  occurrence_not_found: "That occurrence does not exist.",
  revision_conflict: "The automation changed since this view loaded. Reload it, then try again.",
  automation_busy: "An occurrence is already running or queued. Wait for it to finish.",
  invalid_state: "The automation's current state does not allow this.",
  identity_conflict: "This request id was already used for a different request.",
  invalid_request: "The gateway rejected the request as malformed.",
  invalid_definition: "The automation definition is not valid.",
  unsupported_feature: "The gateway does not support this yet.",
  unknown_trigger_source: "The gateway does not know this trigger source.",
  invalid_response: "The gateway gave an unexpected answer.",
  invalid_payload: "That answer could not be sent.",
};

/** One visible sentence per error code, plus the server's own message. */
export function apiErrorText(error: ApiError): { title: string; detail: string } {
  return { title: API_ERROR_TEXT[error.code] ?? `The gateway refused the request (${error.code}).`, detail: error.message };
}

export function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "number" && typeof v.code === "string" && typeof v.message === "string";
}

// --- revise ------------------------------------------------------------------

/**
 * The Edit form's values. `prompt` and `toolApproval` exist only when the
 * committed definition is known (`GET /automations/{id}` → `definition`) and
 * its target carries a text `input_data.prompt`; otherwise they are `null`
 * and the form does not offer them.
 */
export type ReviseForm = {
  target?: AutomationTarget;
  title: string;
  every: string | null;
  context: ContextMode;
  growingMaxTokens?: number;
  prompt?: string | null;
  toolApproval?: ToolApprovalPolicy | null;
  tools?: string[] | null;
  /** "Email result" (`notify.channels` has "email"); `null` without a definition. */
  notifyEmail?: boolean | null;
  /** `notify.recipients`; `null` without a definition. */
  emailRecipients?: EmailRecipientsForm | null;
};

/** The committed definition fields the Edit form reads (a subset of `AutomationDefinition`). */
export type ReviseDefinition = {
  context?: { mode: ContextMode; growing?: JsonObject };
  target: { bundle_ref: string; flow_id: string; input_data: JsonObject };
  policy: { tool_approval: ToolApprovalPolicy; email_allowed_recipients?: string[] };
  notify?: AutomationNotify;
};

export function reviseFormFrom(summary: AutomationSummary, definition?: ReviseDefinition | null): ReviseForm {
  const t = summary.trigger;
  const every = t.source_id === "schedule" || isEmailTrigger(t) ? (t.config as { every?: unknown }).every : undefined;
  const prompt = definition ? (definition.target.input_data as { prompt?: unknown }).prompt : undefined;
  return {
    title: summary.title,
    every: typeof every === "string" ? every : null,
    context: summary.context_mode,
    growingMaxTokens: Number(definition?.context?.growing?.max_tokens ?? summary.growing_max_tokens ?? DEFAULT_GROWING_MAX_TOKENS),
    prompt: typeof prompt === "string" ? prompt : null,
    toolApproval: definition ? definition.policy.tool_approval : null,
    tools: automationToolSelection(definition?.target.input_data),
    notifyEmail: definition ? notifyEmails(definition.notify) : null,
    emailRecipients: definition ? emailRecipientsFormFrom(definition.notify?.recipients) : null,
  };
}

/**
 * Only the fields that changed. A new interval keeps the rest of the trigger
 * config (the server mints a new binding and re-anchors so no past tick
 * fires); for `email.received@1` the old `start_at` is dropped so the new
 * binding starts from now and never re-reads mail. A new task keeps the
 * definition's target (`bundle_ref`, `flow_id`) and the rest of its
 * `input_data`; the gateway re-applies its run protections to it
 * (`PATCH /automations/{id}` resolves `changes.target` like a creation). A new
 * tool approval sends only that `policy` field (the server merges policy);
 * "Email result" and its recipients send `notify`.
 * Returns `{errors}` when the form is invalid, `null` when nothing changed.
 */
export function reviseChanges(summary: AutomationSummary, form: ReviseForm, definition?: ReviseDefinition | null): AutomationChanges | null | { errors: string[] } {
  const errors: string[] = [];
  const changes: AutomationChanges = {};
  const title = form.title.trim();
  if (!title) errors.push("Title is required.");
  else if (title.length > 120) errors.push("Title is at most 120 characters.");
  else if (title !== summary.title) changes.title = title;
  const before = reviseFormFrom(summary, definition);
  if (form.every !== before.every && form.every !== null) {
    const email = isEmailTrigger(summary.trigger);
    if (!parseDuration(form.every)) errors.push("Interval must be a whole number of minutes, hours or days.");
    else if (email && (durationSeconds(form.every) ?? 0) < EMAIL_MIN_EVERY_SECONDS) errors.push("The check interval is at least 60 seconds.");
    else {
      const config: JsonObject = { ...summary.trigger.config, every: form.every };
      if (email) delete config.start_at;
      changes.trigger = { source_id: summary.trigger.source_id, source_version: summary.trigger.source_version, config };
    }
  }
  const maxTokens = form.context === "growing" ? form.growingMaxTokens ?? before.growingMaxTokens! : before.growingMaxTokens!;
  if (!validGrowingMaxTokens(maxTokens)) errors.push(GROWING_MAX_TOKENS_ERROR);
  if (form.context !== summary.context_mode || maxTokens !== before.growingMaxTokens) {
    changes.context = automationContext(form.context, maxTokens);
  }
  if (definition && typeof before.prompt === "string" && typeof form.prompt === "string" && form.prompt.trim() !== before.prompt.trim()) {
    const prompt = form.prompt.trim();
    if (!prompt) errors.push("Task is required.");
    else changes.target = { bundle_ref: definition.target.bundle_ref, flow_id: definition.target.flow_id, input_data: { ...definition.target.input_data, prompt } };
  }
  if (definition && form.tools !== undefined && JSON.stringify(form.tools) !== JSON.stringify(before.tools)) {
    const target = changes.target || { bundle_ref: definition.target.bundle_ref, flow_id: definition.target.flow_id, input_data: definition.target.input_data };
    changes.target = { ...target, input_data: withAutomationTools(target.input_data || {}, form.tools) };
  }
  if (definition && form.toolApproval && form.toolApproval !== before.toolApproval) changes.policy = { tool_approval: form.toolApproval };
  if (definition && typeof form.notifyEmail === "boolean") {
    const next = emailAllowedRecipientsFrom(form.notifyEmail ? form.emailRecipients ?? DEFAULT_EMAIL_RECIPIENTS : before.emailRecipients ?? DEFAULT_EMAIL_RECIPIENTS);
    const prev = emailAllowedRecipientsFrom(before.emailRecipients ?? DEFAULT_EMAIL_RECIPIENTS).recipients;
    if (next.errors.length) errors.push(...next.errors);
    else if (form.notifyEmail !== before.notifyEmail || JSON.stringify(next.recipients) !== JSON.stringify(prev)) changes.notify = notifyFor(form.notifyEmail, next.recipients);
  }
  if (errors.length) return { errors };
  if (definition && form.target && automationTargetValue(form.target) !== automationTargetValue(definition.target)) {
    const currentInput = changes.target?.input_data || definition.target.input_data;
    changes.target = { ...form.target, input_data: retargetAutomationInput(currentInput) };
  }
  return Object.keys(changes).length ? changes : null;
}

// History replay keeps whole turns, including an oversized newest turn.
export const DEFAULT_GROWING_MAX_TOKENS = 50_000;
export const GROWING_CONTEXT_HELP = "Limits history carried into the next run, keeping recent whole turns. The newest turn is kept even if oversized. New messages and tool results can grow context beyond this budget.";
const GROWING_MAX_TOKENS_ERROR = "Max growing context must be a positive whole number of tokens.";
function validGrowingMaxTokens(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function automationContext(mode: ContextMode, maxTokens: number) {
  return { mode, ...(maxTokens !== DEFAULT_GROWING_MAX_TOKENS ? { growing: { max_tokens: maxTokens } } : {}) };
}

// --- schedule dialog -----------------------------------------------------------

export type ScheduleWhen = { kind: "once"; at: string } | { kind: "every"; amount: number; unit: "m" | "h" | "d" };
export type ScheduleForm = {
  prompt: string;
  /** `"schedule"` (default): `when` decides; `"email"`: `email.received@1` from `email` (then `when` is ignored). */
  trigger?: "schedule" | "email";
  /** The "When an email arrives" fields (default `DEFAULT_EMAIL_TRIGGER_FORM`). */
  email?: EmailTriggerForm;
  /** "Email result": `notify.channels` `["console", "email"]`. Off (default) sends no `notify` (the server default, console). */
  notifyEmail?: boolean;
  /** Allowed recipients; "only me" (default) sends nothing (the server default, `["self"]`). */
  emailRecipients?: EmailRecipientsForm;
  when: ScheduleWhen;
  context: ContextMode;
  growingMaxTokens?: number;
  /** `"auto"` (default): tools run without asking; `"ask"`: each tool call waits for approval. */
  toolApproval?: ToolApprovalPolicy;
  /** Advanced (all optional). Datetimes are `YYYY-MM-DDTHH:MM` read as UTC. */
  title?: string;
  startAt?: string;
  count?: number;
  until?: string;
};

export const SCHEDULE_PRESETS: ReadonlyArray<{ label: string; when: ScheduleWhen }> = [
  { label: "every 5 minutes", when: { kind: "every", amount: 5, unit: "m" } },
  { label: "every 30 minutes", when: { kind: "every", amount: 30, unit: "m" } },
  { label: "every hour", when: { kind: "every", amount: 1, unit: "h" } },
  { label: "every 8 hours", when: { kind: "every", amount: 8, unit: "h" } },
  { label: "every 24 hours", when: { kind: "every", amount: 24, unit: "h" } },
  { label: "every 7 days", when: { kind: "every", amount: 7, unit: "d" } },
];

/** `YYYY-MM-DDTHH:MM[:SS]` (a datetime-local value) read as UTC → RFC3339, or null. */
export function utcFromLocalInput(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const ts = `${m[1]}T${m[2]}${m[3] ?? ":00"}Z`;
  return Number.isNaN(Date.parse(ts)) ? null : ts;
}

/** Default title: the prompt's first line, at most 120 characters. */
export function defaultTitle(prompt: string): string {
  const first = prompt.trim().split("\n")[0].trim();
  return first.length > 120 ? `${first.slice(0, 119)}…` : first;
}

export function scheduleConfigFrom(form: ScheduleForm): { config: ScheduleConfig; errors: string[] } {
  const errors: string[] = [];
  const config: ScheduleConfig = {};
  if (form.when.kind === "once") {
    const at = utcFromLocalInput(form.when.at);
    if (!at) errors.push("Pick the date and time (UTC) to run once.");
    else config.start_at = at;
    return { config, errors };
  }
  const n = form.when.amount;
  if (!Number.isInteger(n) || n < 1) errors.push("The interval must be a whole number of at least 1.");
  else config.every = `${n}${form.when.unit}`;
  if (form.startAt) {
    const s = utcFromLocalInput(form.startAt);
    if (!s) errors.push("First run must be a date and time (UTC).");
    else config.start_at = s;
  }
  if (form.count !== undefined) {
    if (!Number.isInteger(form.count) || form.count < 1) errors.push("Maximum runs must be a whole number of at least 1.");
    else config.count = form.count;
  }
  if (form.until) {
    const u = utcFromLocalInput(form.until);
    if (!u) errors.push("Stop at must be a date and time (UTC).");
    else config.until = u;
  }
  return { config, errors };
}

/** Human line under the When section, e.g. "every 24 hours (UTC), first run now". */
export function schedulePreview(form: ScheduleForm): string {
  if (form.trigger === "email") {
    const built = emailTriggerConfigFrom(form.email ?? DEFAULT_EMAIL_TRIGGER_FORM);
    return built.errors.length ? "" : emailTriggerLabel(built.config);
  }
  const { config, errors } = scheduleConfigFrom(form);
  if (errors.length) return "";
  const label = scheduleLabel(config);
  if (form.when.kind === "once") return label;
  return `${label}, first run ${config.start_at ? `at ${formatUtc(config.start_at)}` : "now"}`;
}

/** The `POST /api/gateway/automations` body, or the reasons it cannot be built yet. */
export function buildCreateRequest(
  form: ScheduleForm,
  opts: { target: AutomationTarget | null | undefined; requestId: string },
): { ok: true; body: CreateAutomationRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!opts.target) errors.push("Choose what to run.");
  const prompt = form.prompt.trim();
  if (!prompt) errors.push("Write the task to run.");
  const title = (form.title ?? "").trim() || defaultTitle(prompt);
  if (title.length > 120) errors.push("Title is at most 120 characters.");
  const email = form.trigger === "email";
  const built = email ? emailTriggerConfigFrom(form.email ?? DEFAULT_EMAIL_TRIGGER_FORM) : scheduleConfigFrom(form);
  errors.push(...built.errors);
  const recipients = form.notifyEmail && form.emailRecipients && form.emailRecipients.mode === "list" ? emailAllowedRecipientsFrom(form.emailRecipients) : null;
  if (recipients) errors.push(...recipients.errors);
  const maxTokens = form.growingMaxTokens ?? DEFAULT_GROWING_MAX_TOKENS;
  if (form.context === "growing" && !validGrowingMaxTokens(maxTokens)) errors.push(GROWING_MAX_TOKENS_ERROR);
  if (errors.length || !opts.target) return { ok: false, errors };
  const target = { ...opts.target, input_data: { ...(opts.target.input_data ?? {}), prompt } } as AutomationTarget;
  const body: CreateAutomationRequest = {
    request_id: opts.requestId,
    title,
    target,
    trigger: email
      ? { source_id: EMAIL_TRIGGER_SOURCE_ID, source_version: EMAIL_TRIGGER_SOURCE_VERSION, config: built.config as JsonObject }
      : { source_id: "schedule", source_version: 1, config: built.config as JsonObject },
    context: automationContext(form.context, form.context === "growing" ? maxTokens : DEFAULT_GROWING_MAX_TOKENS),
    policy: { tool_approval: form.toolApproval ?? "auto" },
  };
  if (form.notifyEmail === true) body.notify = notifyFor(true, recipients?.recipients);
  return { ok: true, body };
}

/** The consent line shown wherever an automation is created with `tool_approval: "auto"` (decision D1). */
export const TOOL_APPROVAL_CONSENT = "Tools run without asking (you approve them now by creating this automation)";

// --- typed waits (decision D1) ---------------------------------------------------

/**
 * The tool calls of a `tool_approval` wait, validated structurally
 * (`[{name, arguments, call_id?}]`); null for another kind or malformed details.
 */
export function waitToolCalls(wait: Pick<OccurrenceWait | AttentionWait, "kind" | "details">): ToolCallToApprove[] | null {
  if (wait.kind !== "tool_approval" || !Array.isArray(wait.details)) return null;
  const out: ToolCallToApprove[] = [];
  for (const c of wait.details as Json[]) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return null;
    const call = c as { [k: string]: Json };
    if (typeof call.name !== "string" || !call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) return null;
    if (call.call_id !== undefined && typeof call.call_id !== "string") return null;
    out.push({ name: call.name, arguments: call.arguments as JsonObject, ...(typeof call.call_id === "string" ? { call_id: call.call_id } : {}) });
  }
  return out;
}

/** An `event` wait's answer from the typed JSON text: `{payload}` or the parse error. */
export function parseEventPayload(text: string): { ok: true; payload: Json } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: false, error: "Enter a JSON payload." };
  try {
    return { ok: true, payload: JSON.parse(t) as Json };
  } catch (e) {
    return { ok: false, error: `The payload is not valid JSON (${e instanceof Error ? e.message : String(e)}).` };
  }
}

export const WAIT_KIND_LABELS: Record<string, string> = {
  ask_user: "Question for you",
  tool_approval: "Approval needed",
  event: "Waiting for an event",
};

// --- retry-safe ids (one per user action) ------------------------------------

/**
 * One id per user action. `idFor(signature)` returns the id already minted
 * for that exact action while its outcome is unknown (a transport failure),
 * so a retry reuses it and the gateway answers idempotently. A definitive
 * answer (success, or an error the gateway returned) settles it: the next
 * action gets a new id.
 */
export class ActionIds {
  private open = new Map<string, string>();
  constructor(private readonly mint: () => string) {}
  idFor(signature: string): string {
    let id = this.open.get(signature);
    if (id === undefined) {
      id = this.mint();
      this.open.set(signature, id);
    }
    return id;
  }
  /** `outcome` = the resolved value or the thrown error of the request. */
  settle(signature: string, outcome: { ok: true } | { ok: false; error: unknown }): void {
    if (outcome.ok || isDefinitiveError(outcome.error)) this.open.delete(signature);
  }
}

/** A gateway-returned error is definitive; a transport failure or an unreadable answer is not. */
export function isDefinitiveError(error: unknown): boolean {
  return isApiError(error) && error.status > 0 && error.code !== "invalid_response";
}

export function mintUuid(): string {
  return randomId();
}

// --- /seen acknowledgement ------------------------------------------------------

/**
 * Acknowledge a cursor only after `/seen` succeeded. A failed call is retried
 * on the next render that carries new data (`token` = the summary object the
 * host passed), never in a loop on the panel's own error re-render.
 */
export class SeenAckTracker {
  private acked: string | null = null;
  private inflight: string | null = null;
  private failedKey: string | null = null;
  private failedToken: unknown = undefined;
  /** The key to send now, or null. Marks it in flight. */
  next(key: string | null, token: unknown): string | null {
    if (!key || key === this.acked || key === this.inflight) return null;
    if (key === this.failedKey && token === this.failedToken) return null;
    this.inflight = key;
    return key;
  }
  succeeded(key: string): void {
    if (this.inflight === key) this.inflight = null;
    this.acked = key;
    this.failedKey = null;
  }
  failed(key: string, token: unknown): void {
    if (this.inflight === key) this.inflight = null;
    this.failedKey = key;
    this.failedToken = token;
  }
  get acknowledged(): string | null {
    return this.acked;
  }
}

// --- focus after a form closes ----------------------------------------------------

type Focusable = { focus(): void; disabled?: boolean };
/** The first enabled element matching one of `selectors` (in order) under `root`. */
export function pickFocusTarget(root: { querySelector(sel: string): unknown } | null, selectors: string[]): Focusable | null {
  if (!root) return null;
  for (const sel of selectors) {
    const el = root.querySelector(sel) as Focusable | null;
    if (el && el.disabled !== true && typeof el.focus === "function") return el;
  }
  return null;
}
