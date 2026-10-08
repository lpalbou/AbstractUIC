import { AutomationToolsPicker } from "./automation_tools_picker.js";
import { automationToolSelection, withAutomationTools } from "./tool_selection.js";
// AfScheduleDialog — create an automation: What (the host's workflow picker +
// the task prompt), When (Repeat — `schedule@1` every N minutes/hours/days,
// fixed UTC interval; Daily / Weekly / Monthly at HH:MM — `schedule@2`
// calendar rules in the account's time zone, shown as a line with a link to
// the preferences, never edited here; Once at a UTC time; or
// `email.received@1`: when an email arrives, with typed filters, a check
// interval and a max batch), Context (independent /
// growing), Tools, Email (Email result, allowed recipients — offered
// only when `GET /me/email` says the account is usable, otherwise "Connect
// a mailbox first — open My email"), Workspaces (the host's slot: the
// WorkspaceChooser at the run level; the host merges the value into
// `target.input_data.workspace`), Title and limits (title, first run, max
// runs, stop at) — every section visible, no disclosure. It builds the `POST /api/gateway/automations`
// body and hands it to `onSubmit`; the host sends it (see ./client.ts).
//
// Every schedule's sentence (Repeat included, with its bounds) is the GATEWAY's (`previewSchedule` → the
// describe route's `schedule_text` + `next_run_local`): the kit never composes
// a calendar sentence nor computes a next run.
// ONE request id per distinct request: a retry of the same request after a
// transport failure reuses it (the gateway answers idempotently); an edited
// request, or one after a definitive answer, gets a new id (never an
// identity_conflict from reusing an id with a different body).
import React, { useEffect, useId, useRef, useState } from "react";
import { trapTabKey } from "../about.js";
import { AfEmailOptionsFields, AfEmailSetupNotice, AfEmailTriggerFields } from "./email_fields.js";
import { AfCalendarRuleFields, AfServedSchedule, type CalendarRuleState, calendarRuleOf, DEFAULT_CALENDAR_STATE, type PreviewSchedule, useSchedulePreview, withCalendarRule } from "./schedule_when.js";
import {
  ActionIds,
  DEFAULT_GROWING_MAX_TOKENS,
  GROWING_CONTEXT_HELP,
  apiErrorText,
  buildCreateRequest,
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_EMAIL_TRIGGER_FORM,
  EMAIL_TEXT,
  emailUsable,
  type EmailRecipientsForm,
  type EmailTriggerForm,
  SCHEDULE_PRESETS,
  SCHEDULE_TEXT,
  type CalendarKind,
  schedulePreview,
  scheduleTriggerFrom,
  mintUuid,
  TOOL_APPROVAL_CONSENT,
  type ScheduleForm,
} from "./panel_core.js";
import type { ApiError, AutomationTarget, ContextMode, CreateAutomationRequest, MyEmailStatus, ToolApprovalPolicy } from "./types.js";

export type AfScheduleDialogProps = {
  open: boolean;
  onClose(): void;
  /** The target chosen in the host's picker (null until one is chosen). */
  target: AutomationTarget | null;
  /** Slot for the host's workflow picker (it sets `target`). */
  workflowPicker?: React.ReactNode;
  /**
   * Slot for the host's Workspaces section (the WorkspaceChooser at the run
   * level, which titles itself "Workspaces"), shown as a visible group after
   * Tools (no second heading). The host
   * keeps the value and merges it into `target.input_data.workspace` in its
   * `onSubmit`; the dialog sends nothing workspace-shaped itself.
   */
  workspaces?: React.ReactNode;
  initialPrompt?: string;
  /** The target's tool names, listed under the consent line (from the host's picker). */
  targetTools?: string[];
  availableTools?: string[];
  initialTools?: string[] | null;
  initialTitle?: string;
  onSubmit(body: CreateAutomationRequest): void | Promise<unknown>;
  busy?: boolean;
  error?: ApiError;
  /**
   * Id source for `request_id` (default `randomId()`: crypto.randomUUID, else getRandomValues). Return a
   * Promise from `onSubmit` so a transport failure keeps the id for a retry.
   */
  newRequestId?: () => string;
  title?: string;
  /**
   * `GET /api/gateway/me/email` (the client's `getMyEmail()`). Email options
   * are offered only when it says the account is usable; null/undefined
   * (unknown, not loaded, or the call failed) shows "Connect a mailbox first —
   * open My email" instead.
   */
  emailStatus?: MyEmailStatus | null;
  /** Opens the gateway console's My email; without it "open My email" is plain text. */
  onOpenMyEmail?: () => void;
  /** Does the target run a model on new mail? (default true: an hourly check by default; false: every 60 s). */
  targetUsesModel?: boolean;
  /**
   * The gateway's dry-run description of a schedule (the client's
   * `previewSchedule`): Daily / Weekly / Monthly show ITS sentence, next run
   * and time zone. Required — the kit has no calendar wording of its own.
   */
  previewSchedule: PreviewSchedule;
  /** Opens the account preferences (where the time zone changes); without it the time-zone line has no link. */
  onOpenPreferences?: () => void;
};

type UnitKey = "m" | "h" | "d";
type WhenKind = "every" | CalendarKind | "once" | "email";

export function AfScheduleDialog(props: AfScheduleDialogProps): React.ReactElement | null {
  const titleId = useId();
  const base = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLTextAreaElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  const initialTools = props.initialTools ?? automationToolSelection(props.target?.input_data);
  const [toolState, setToolState] = useState({ open: props.open, value: initialTools });
  // Snapshot on opening, before paint. Later catalog refreshes must not
  // change a checkbox while the person is interacting with the form.
  if (toolState.open !== props.open) setToolState({ open: props.open, value: initialTools });
  const selectedTools = toolState.value;
  const setSelectedTools = (value: string[] | null) => setToolState(previous => ({ ...previous, value }));
  const [prompt, setPrompt] = useState(props.initialPrompt ?? "");
  const [kind, setKind] = useState<WhenKind>("every");
  // The calendar fields, kept across kind switches (Weekly → Monthly → Weekly keeps the days).
  const [rule, setRule] = useState<CalendarRuleState>(DEFAULT_CALENDAR_STATE);
  const calendar = calendarRuleOf(kind === "weekly" || kind === "monthly" ? kind : "daily", rule);
  const [email, setEmail] = useState<EmailTriggerForm>(DEFAULT_EMAIL_TRIGGER_FORM);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [recipients, setRecipients] = useState<EmailRecipientsForm>(DEFAULT_EMAIL_RECIPIENTS);
  const [amount, setAmount] = useState("24");
  const [unit, setUnit] = useState<UnitKey>("h");
  const [onceAt, setOnceAt] = useState("");
  const [growingMaxTokens, setGrowingMaxTokens] = useState(String(DEFAULT_GROWING_MAX_TOKENS));
  const [context, setContext] = useState<ContextMode>("independent");
  const [toolApproval, setToolApproval] = useState<ToolApprovalPolicy>("auto");
  const [title, setTitle] = useState(props.initialTitle ?? "");
  const [startAt, setStartAt] = useState("");
  const [count, setCount] = useState("");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const idsRef = useRef<ActionIds | null>(null);
  if (!idsRef.current) idsRef.current = new ActionIds(() => (props.newRequestId ?? mintUuid)());

  useEffect(() => {
    if (!props.open) return;
    const restore = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      trapTabKey(e, cardRef.current, document.activeElement);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (restore && typeof restore.focus === "function") restore.focus();
    };
  }, [props.open]);

  // The gateway describes a complete calendar rule (debounced; hooks run before the early return).
  // Every schedule kind's line is the GATEWAY's (schedule-preview): Repeat with its bounds too.
  const servedKind = props.open && kind !== "email";
  const whenNow = kind === "once" ? { kind: "once" as const, at: onceAt } : kind === "daily" || kind === "weekly" || kind === "monthly" ? calendar : { kind: "every" as const, amount: Number(amount), unit };
  const limitsForm = {
    ...(kind === "every" && startAt ? { startAt } : {}),
    ...(kind !== "once" && count.trim() ? { count: Number(count) } : {}),
    ...(kind !== "once" && until ? { until } : {}),
  };
  const previewed = useSchedulePreview(
    servedKind ? scheduleTriggerFrom({ prompt: "", context: "independent", when: whenNow, ...limitsForm }).trigger : null,
    props.previewSchedule,
  );

  if (!props.open) return null;

  const usable = emailUsable(props.emailStatus);
  // Email options exist only with a usable account: nothing email-shaped is sent otherwise.
  const emailKind = kind === "email" && usable;
  // An email choice made while the account was usable falls back to Repeat if it stops being usable.
  const shownKind = kind === "email" && !usable ? "every" : kind;
  const calendarKind = shownKind === "daily" || shownKind === "weekly" || shownKind === "monthly";
  const pickKind = (next: WhenKind) => setKind(next);
  const form: ScheduleForm = {
    prompt,
    when: kind === "once" ? { kind: "once", at: onceAt } : calendarKind ? calendar : { kind: "every", amount: Number(amount), unit },
    ...(emailKind ? { trigger: "email" as const, email: { ...email, usesModel: props.targetUsesModel !== false } } : {}),
    ...(usable && notifyEmail ? { notifyEmail: true } : {}),
    ...(usable && recipients.mode === "list" ? { emailRecipients: recipients } : {}),
    context,
    growingMaxTokens: Number(growingMaxTokens),
    toolApproval,
    title,
    ...(shownKind === "every" && startAt ? { startAt } : {}),
    // Max runs / stop at apply to Repeat and the calendar rules.
    ...((shownKind === "every" || calendarKind) && count.trim() ? { count: Number(count) } : {}),
    ...((shownKind === "every" || calendarKind) && until ? { until } : {}),
  };
  const preview = schedulePreview(form);
  const busy = props.busy === true;
  const errText = props.error ? apiErrorText(props.error) : null;
  const id = (s: string) => `${base}-${s}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const probe = buildCreateRequest(form, { target: props.target, requestId: "" });
    if (!probe.ok) {
      setErrors(probe.errors);
      return;
    }
    setErrors([]);
    const ids = idsRef.current as ActionIds;
    const prepared = props.availableTools === undefined ? probe.body : {
      ...probe.body, target: { ...probe.body.target, input_data: withAutomationTools(probe.body.target.input_data || {}, selectedTools) },
    };
    const signature = JSON.stringify(prepared);
    const body = { ...prepared, request_id: ids.idFor(signature) };
    Promise.resolve(props.onSubmit(body)).then(
      () => ids.settle(signature, { ok: true }),
      (error) => ids.settle(signature, { ok: false, error }),
    );
  };

  return (
    <div className="af-appearance-overlay af-schedule-overlay" onClick={props.onClose} role="presentation">
      <div ref={cardRef} className="af-appearance af-schedule" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="af-appearance__title" id={titleId}>
          {props.title ?? "Schedule a task"}
        </div>
        <form className="af-schedule__form" onSubmit={submit} aria-busy={busy}>
          <fieldset className="af-auto__field">
            <legend>What</legend>
            {props.workflowPicker ? <div className="af-schedule__picker">{props.workflowPicker}</div> : null}
            {!props.target ? <p className="af-auto__hint">Choose what to run.</p> : null}
            <label className="af-auto__field" htmlFor={id("prompt")}>
              <span>Task</span>
              <textarea id={id("prompt")} ref={firstRef} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Check the price of ACME shares and notify me if it moved more than 2%." required />
            </label>
          </fieldset>

          <fieldset className="af-auto__field">
            <legend>{SCHEDULE_TEXT.legend}</legend>
            <div className="af-auto__row" role="radiogroup" aria-label="Schedule kind">
              <label>
                <input type="radio" name={id("kind")} value="every" checked={shownKind === "every"} onChange={() => pickKind("every")} /> {SCHEDULE_TEXT.kind_every}
              </label>
              <label>
                <input type="radio" name={id("kind")} value="daily" checked={kind === "daily"} onChange={() => pickKind("daily")} /> {SCHEDULE_TEXT.kind_daily}
              </label>
              <label>
                <input type="radio" name={id("kind")} value="weekly" checked={kind === "weekly"} onChange={() => pickKind("weekly")} /> {SCHEDULE_TEXT.kind_weekly}
              </label>
              <label>
                <input type="radio" name={id("kind")} value="monthly" checked={kind === "monthly"} onChange={() => pickKind("monthly")} /> {SCHEDULE_TEXT.kind_monthly}
              </label>
              <label>
                <input type="radio" name={id("kind")} value="once" checked={kind === "once"} onChange={() => pickKind("once")} /> {SCHEDULE_TEXT.kind_once}
              </label>
              <label>
                <input type="radio" name={id("kind")} value="email" checked={emailKind} disabled={!usable} onChange={() => pickKind("email")} /> {EMAIL_TEXT.trigger_label}
              </label>
            </div>
            {!usable ? <AfEmailSetupNotice status={props.emailStatus} onOpenMyEmail={props.onOpenMyEmail} /> : null}
            {emailKind ? (
              <AfEmailTriggerFields value={{ ...email, usesModel: props.targetUsesModel !== false }} onChange={setEmail} idBase={base} />
            ) : calendarKind ? (
              <AfCalendarRuleFields value={calendar} onChange={(next) => setRule((prev) => withCalendarRule(prev, next))} idBase={base} disabled={busy} />
            ) : shownKind === "every" ? (
              <>
                <div className="af-auto__row af-schedule__presets" role="group" aria-label="Presets">
                  {SCHEDULE_PRESETS.map((p) =>
                    p.when.kind === "every" ? (
                      <button
                        key={p.label}
                        type="button"
                        className="af-auto__btn af-auto__btn--quiet"
                        aria-pressed={Number(amount) === p.when.amount && unit === p.when.unit}
                        onClick={() => {
                          if (p.when.kind !== "every") return;
                          setAmount(String(p.when.amount));
                          setUnit(p.when.unit);
                        }}
                      >
                        {p.label}
                      </button>
                    ) : null,
                  )}
                </div>
                <div className="af-auto__row">
                  <span>{SCHEDULE_TEXT.every_label}</span>
                  <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Interval amount" />
                  <select value={unit} onChange={(e) => setUnit(e.target.value as UnitKey)} aria-label="Interval unit">
                    <option value="m">minutes</option>
                    <option value="h">hours</option>
                    <option value="d">days</option>
                  </select>
                </div>
              </>
            ) : (
              <label className="af-auto__field" htmlFor={id("once")}>
                <span>{SCHEDULE_TEXT.once_label}</span>
                <input id={id("once")} type="datetime-local" value={onceAt} onChange={(e) => setOnceAt(e.target.value)} />
              </label>
            )}
            {shownKind !== "email" ? (
              // Repeat is a fixed UTC interval: no account time-zone line for it.
              <AfServedSchedule state={previewed} onOpenPreferences={props.onOpenPreferences} showZone={shownKind !== "every"} />
            ) : (
              <p className="af-schedule__preview" aria-live="polite" data-preview="true">
                {preview ? `Runs ${preview}.` : emailKind ? "Incomplete email trigger." : SCHEDULE_TEXT.incomplete}
              </p>
            )}
          </fieldset>

          <fieldset className="af-auto__field">
            <legend>Context</legend>
            <label>
              <input type="radio" name={id("ctx")} value="independent" checked={context === "independent"} onChange={() => setContext("independent")} /> Independent — each run starts fresh
            </label>
            <label>
              <input type="radio" name={id("ctx")} value="growing" checked={context === "growing"} onChange={() => setContext("growing")} /> Growing — each run sees the previous runs
            </label>
            {context === "growing" ? <label className="af-auto__field">
              <span>Max growing context (tokens)</span>
              <input type="number" min={1} step={1} required disabled={busy} value={growingMaxTokens} onChange={(e) => setGrowingMaxTokens(e.target.value)} />
              <span className="af-auto__hint">{GROWING_CONTEXT_HELP}</span>
            </label> : null}
          </fieldset>

          <fieldset className="af-auto__field" data-field="tool-approval">
            <legend>Tools</legend>
            {props.availableTools !== undefined ? <AutomationToolsPicker availableTools={props.availableTools} value={selectedTools} onChange={setSelectedTools} disabled={busy} /> : null}
            <label>
              <input type="radio" name={id("tools")} value="auto" checked={toolApproval === "auto"} onChange={() => setToolApproval("auto")} /> Run without asking
            </label>
            <label>
              <input type="radio" name={id("tools")} value="ask" checked={toolApproval === "ask"} onChange={() => setToolApproval("ask")} /> Ask me before each tool call (the run waits for you)
            </label>
            {emailKind ? (
              <p className="af-auto__hint" data-email-rule="untrusted">
                {EMAIL_TEXT.untrusted_hint}
              </p>
            ) : null}
            {toolApproval === "auto" ? (
              <p className="af-schedule__consent" data-consent="true">
                {TOOL_APPROVAL_CONSENT}
                {props.targetTools && props.targetTools.length ? `: ${props.targetTools.join(", ")}.` : "."}
              </p>
            ) : (
              <p className="af-auto__hint">Each tool call waits for your approval in the automation's timeline.</p>
            )}
          </fieldset>

          {props.workspaces ? (
            // The chooser titles its own group ("Workspaces"): no second heading here.
            <div className="af-auto__field" data-field="workspaces" role="group" aria-label="Workspaces">
              {props.workspaces}
            </div>
          ) : null}

          <fieldset className="af-auto__field" data-field="email">
            <legend>Mailbox</legend>
            {!usable ? <AfEmailSetupNotice status={props.emailStatus} onOpenMyEmail={props.onOpenMyEmail} /> : null}
            <AfEmailOptionsFields
              notifyEmail={usable && notifyEmail}
              onNotifyEmailChange={setNotifyEmail}
              recipients={usable ? recipients : DEFAULT_EMAIL_RECIPIENTS}
              onRecipientsChange={setRecipients}
              disabled={!usable}
              idBase={base}
            />
          </fieldset>

          <fieldset className="af-auto__field" data-field="limits">
            <legend>Title and limits</legend>
            <label className="af-auto__field" htmlFor={id("title")}>
              <span>Title</span>
              <input id={id("title")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the task's first line" />
            </label>
            {shownKind === "every" || calendarKind ? (
              <>
                {shownKind === "every" ? (
                  <label className="af-auto__field" htmlFor={id("start")}>
                    <span>First run at (UTC; empty = now)</span>
                    <input id={id("start")} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                  </label>
                ) : null}
                <label className="af-auto__field" htmlFor={id("count")}>
                  <span>Stop after this many runs</span>
                  <input id={id("count")} type="number" min={1} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
                </label>
                <label className="af-auto__field" htmlFor={id("until")}>
                  <span>Stop at (UTC)</span>
                  <input id={id("until")} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
              </>
            ) : null}
          </fieldset>

          {errors.length ? (
            <ul className="af-auto__form-errors" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          {errText ? (
            <div className="af-auto__error" role="alert" data-code={props.error?.code}>
              <strong>{errText.title}</strong> <span>{errText.detail}</span>
            </div>
          ) : null}
          <div className="af-appearance__actions af-auto__row">
            <button type="button" className="af-auto__btn" onClick={props.onClose}>
              Cancel
            </button>
            <button type="submit" className="af-auto__btn af-auto__btn--primary" disabled={busy}>
              Create automation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AfScheduleDialog;
