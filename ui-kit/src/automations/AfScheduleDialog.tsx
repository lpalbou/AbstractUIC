// AfScheduleDialog — create an automation: What (the host's workflow picker +
// the task prompt), When (`schedule@1`: once at a UTC time, or every N
// minutes/hours/days), Context (independent / growing), Advanced (first run,
// max runs, stop at, title). It builds the `POST /api/gateway/automations`
// body and hands it to `onSubmit`; the host sends it (see ./client.ts).
//
// Wording is fixed-interval UTC ("every 24 hours (UTC)"), never calendar
// wording such as "daily at 08:00 local": schedule@1 has no time zone.
// ONE request id per distinct request: a retry of the same request after a
// transport failure reuses it (the gateway answers idempotently); an edited
// request, or one after a definitive answer, gets a new id (never an
// identity_conflict from reusing an id with a different body).
import React, { useEffect, useId, useRef, useState } from "react";
import { trapTabKey } from "../about.js";
import {
  ActionIds,
  apiErrorText,
  buildCreateRequest,
  SCHEDULE_PRESETS,
  schedulePreview,
  mintUuid,
  type ScheduleForm,
} from "./panel_core.js";
import type { ApiError, AutomationTarget, ContextMode, CreateAutomationRequest } from "./types.js";

export type AfScheduleDialogProps = {
  open: boolean;
  onClose(): void;
  /** The target chosen in the host's picker (null until one is chosen). */
  target: AutomationTarget | null;
  /** Slot for the host's workflow picker (it sets `target`). */
  workflowPicker?: React.ReactNode;
  initialPrompt?: string;
  initialTitle?: string;
  onSubmit(body: CreateAutomationRequest): void | Promise<unknown>;
  busy?: boolean;
  error?: ApiError;
  /**
   * Id source for `request_id` (default `crypto.randomUUID`). Return a
   * Promise from `onSubmit` so a transport failure keeps the id for a retry.
   */
  newRequestId?: () => string;
  title?: string;
};

type UnitKey = "m" | "h" | "d";

export function AfScheduleDialog(props: AfScheduleDialogProps): React.ReactElement | null {
  const titleId = useId();
  const base = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLTextAreaElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  const [prompt, setPrompt] = useState(props.initialPrompt ?? "");
  const [kind, setKind] = useState<"every" | "once">("every");
  const [amount, setAmount] = useState("24");
  const [unit, setUnit] = useState<UnitKey>("h");
  const [onceAt, setOnceAt] = useState("");
  const [context, setContext] = useState<ContextMode>("independent");
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

  if (!props.open) return null;

  const form: ScheduleForm = {
    prompt,
    when: kind === "once" ? { kind: "once", at: onceAt } : { kind: "every", amount: Number(amount), unit },
    context,
    title,
    ...(kind === "every" && startAt ? { startAt } : {}),
    ...(kind === "every" && count.trim() ? { count: Number(count) } : {}),
    ...(kind === "every" && until ? { until } : {}),
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
    const signature = JSON.stringify(probe.body);
    const body = { ...probe.body, request_id: ids.idFor(signature) };
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
            <legend>When (UTC)</legend>
            <div className="af-auto__row" role="radiogroup" aria-label="Schedule kind">
              <label>
                <input type="radio" name={id("kind")} value="every" checked={kind === "every"} onChange={() => setKind("every")} /> Repeat
              </label>
              <label>
                <input type="radio" name={id("kind")} value="once" checked={kind === "once"} onChange={() => setKind("once")} /> Once at…
              </label>
            </div>
            {kind === "every" ? (
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
                  <span>Every</span>
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
                <span>Run once at (UTC)</span>
                <input id={id("once")} type="datetime-local" value={onceAt} onChange={(e) => setOnceAt(e.target.value)} />
              </label>
            )}
            <p className="af-schedule__preview" aria-live="polite" data-preview="true">
              {preview ? `Runs ${preview}.` : "Incomplete schedule."}
            </p>
          </fieldset>

          <fieldset className="af-auto__field">
            <legend>Context</legend>
            <label>
              <input type="radio" name={id("ctx")} value="independent" checked={context === "independent"} onChange={() => setContext("independent")} /> Independent — each run starts fresh
            </label>
            <label>
              <input type="radio" name={id("ctx")} value="growing" checked={context === "growing"} onChange={() => setContext("growing")} /> Growing — each run sees the previous runs
            </label>
          </fieldset>

          <details className="af-schedule__advanced">
            <summary>Advanced</summary>
            <label className="af-auto__field" htmlFor={id("title")}>
              <span>Title</span>
              <input id={id("title")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the task's first line" />
            </label>
            {kind === "every" ? (
              <>
                <label className="af-auto__field" htmlFor={id("start")}>
                  <span>First run at (UTC; empty = now)</span>
                  <input id={id("start")} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </label>
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
          </details>

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
