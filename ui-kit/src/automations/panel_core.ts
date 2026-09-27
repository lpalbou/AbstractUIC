// Pure presentation rules for the automation panel and the schedule dialog
// (the kit's `*_core.ts` pattern: no React, checked directly by
// scripts/check_automation_panel.mjs). Everything here reads STRUCTURE only —
// statuses, notify objects, waits, config fields — never model prose.
import type {
  ApiError,
  AutomationChanges,
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

// --- controls ---------------------------------------------------------------

export type ControlId = "pause" | "resume" | "run_now" | "stop_current" | "revise" | "archive" | "discuss";
export type ControlState = { enabled: boolean; reason?: string };
export const CONTROL_COMMANDS: Record<Exclude<ControlId, "revise" | "discuss">, string> = {
  pause: "automation.pause",
  resume: "automation.resume",
  run_now: "automation.run_now",
  stop_current: "automation.stop_current",
  archive: "automation.archive",
};

const IN_PROGRESS = new Set(["running", "waiting", "backoff"]);

/** True while an occurrence is running or waiting (server: `pending_occurrence ≠ null`). */
export function occurrenceInProgress(summary: AutomationSummary, occurrences: OccurrenceRow[] = []): boolean {
  if (summary.last_occurrence && IN_PROGRESS.has(summary.last_occurrence.status)) return true;
  return occurrences.some((o) => IN_PROGRESS.has(o.status));
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
  return {
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

export type ReviseForm = { title: string; every: string | null; context: ContextMode };

export function reviseFormFrom(summary: AutomationSummary): ReviseForm {
  const every = summary.trigger.source_id === "schedule" ? (summary.trigger.config as ScheduleConfig).every : undefined;
  return { title: summary.title, every: typeof every === "string" ? every : null, context: summary.context_mode };
}

/**
 * Only the fields that changed. A new interval keeps the rest of the schedule
 * config (the server mints a new binding and re-anchors so no past tick fires).
 * Returns `{errors}` when the form is invalid, `null` when nothing changed.
 */
export function reviseChanges(summary: AutomationSummary, form: ReviseForm): AutomationChanges | null | { errors: string[] } {
  const errors: string[] = [];
  const changes: AutomationChanges = {};
  const title = form.title.trim();
  if (!title) errors.push("Title is required.");
  else if (title.length > 120) errors.push("Title is at most 120 characters.");
  else if (title !== summary.title) changes.title = title;
  const before = reviseFormFrom(summary);
  if (form.every !== before.every && form.every !== null) {
    if (!parseDuration(form.every)) errors.push("Interval must be a whole number of minutes, hours or days.");
    else changes.trigger = { source_id: summary.trigger.source_id, source_version: summary.trigger.source_version, config: { ...summary.trigger.config, every: form.every } };
  }
  if (form.context !== summary.context_mode) changes.context = { mode: form.context };
  if (errors.length) return { errors };
  return Object.keys(changes).length ? changes : null;
}

// --- schedule dialog -----------------------------------------------------------

export type ScheduleWhen = { kind: "once"; at: string } | { kind: "every"; amount: number; unit: "m" | "h" | "d" };
export type ScheduleForm = {
  prompt: string;
  when: ScheduleWhen;
  context: ContextMode;
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
  const { config, errors: whenErrors } = scheduleConfigFrom(form);
  errors.push(...whenErrors);
  if (errors.length || !opts.target) return { ok: false, errors };
  const target = { ...opts.target, input_data: { ...(opts.target.input_data ?? {}), prompt } } as AutomationTarget;
  return {
    ok: true,
    body: {
      request_id: opts.requestId,
      title,
      target,
      trigger: { source_id: "schedule", source_version: 1, config: config as JsonObject },
      context: { mode: form.context },
      policy: { tool_approval: form.toolApproval ?? "auto" },
    },
  };
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
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c || typeof c.randomUUID !== "function") throw new Error("crypto.randomUUID is unavailable; pass newId");
  return c.randomUUID();
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
