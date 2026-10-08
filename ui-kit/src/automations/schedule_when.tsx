// The calendar part of the "When" editor (round 16, R16.1), shared by
// AfScheduleDialog and the Edit form: Daily at HH:MM · Weekly (day chips,
// state-showing toggles) at HH:MM · Monthly on day N (1–31 or "last") at
// HH:MM; the time-zone line (shown, never edited here: it is the account's
// preference, or the automation's own zone); and the gateway's own sentence
// for the rule (the describe route's `schedule_text`, served — the kit never
// composes a calendar sentence or computes a next run).
import React, { useEffect, useRef, useState } from "react";
import { AfChipButton } from "../af_chip.js";
import { AfTooltip } from "../af_tooltip.js";
import {
  CALENDAR_DAYS,
  type CalendarKind,
  SCHEDULE_TEXT,
  type ScheduleWhen,
  timeZoneLine,
} from "./panel_core.js";
import type { ApiError, CalendarDay, SchedulePreview, TriggerSpec } from "./types.js";

export type CalendarWhen = Extract<ScheduleWhen, { kind: CalendarKind }>;

/** Default rule values when a person switches to a calendar kind. */
export const DEFAULT_CALENDAR_AT = "08:00";
export const DEFAULT_CALENDAR_DAYS: ReadonlyArray<CalendarDay> = ["mon"];

/** The rule of `kind` keeping the time (and days / day) already chosen. */
export function calendarWhenOf(kind: CalendarKind, previous: { at?: string; days?: CalendarDay[]; day?: number | "last" }): CalendarWhen {
  const at = previous.at || DEFAULT_CALENDAR_AT;
  if (kind === "weekly") return { kind, at, days: previous.days && previous.days.length ? previous.days : [...DEFAULT_CALENDAR_DAYS] };
  if (kind === "monthly") return { kind, at, day: previous.day ?? 1 };
  return { kind, at };
}

/**
 * What a person chose for the calendar fields, kept across kind switches (Weekly → Monthly →
 * Weekly keeps the picked days; Daily → Monthly keeps the time). The rule sent is
 * `calendarRuleOf(kind, state)`; an emptied day set stays empty (the kit then says why).
 */
export type CalendarRuleState = { at: string; days: CalendarDay[]; day: number | "last" };
export const DEFAULT_CALENDAR_STATE: CalendarRuleState = { at: DEFAULT_CALENDAR_AT, days: [...DEFAULT_CALENDAR_DAYS], day: 1 };

export function calendarRuleOf(kind: CalendarKind, state: CalendarRuleState): CalendarWhen {
  if (kind === "weekly") return { kind, at: state.at, days: [...state.days] };
  if (kind === "monthly") return { kind, at: state.at, day: state.day };
  return { kind, at: state.at };
}

/** The state after the fields changed one rule (only that rule's own fields move). */
export function withCalendarRule(state: CalendarRuleState, rule: CalendarWhen): CalendarRuleState {
  return { ...state, at: rule.at, ...(rule.kind === "weekly" ? { days: [...rule.days] } : {}), ...(rule.kind === "monthly" ? { day: rule.day } : {}) };
}

/** The state of a stored rule (the Edit form's starting point). */
export function calendarStateOf(rule: CalendarWhen): CalendarRuleState {
  return withCalendarRule(DEFAULT_CALENDAR_STATE, rule);
}

const MONTH_DAYS: ReadonlyArray<string> = [...Array.from({ length: 31 }, (_, i) => String(i + 1)), "last"];

/** The fields of one calendar rule (controlled). */
export function AfCalendarRuleFields(props: { value: CalendarWhen; onChange(next: CalendarWhen): void; idBase: string; disabled?: boolean }): React.ReactElement {
  const v = props.value;
  const toggleDay = (d: CalendarDay) => {
    if (v.kind !== "weekly") return;
    const has = v.days.includes(d);
    props.onChange({ ...v, days: CALENDAR_DAYS.filter((x) => (x === d ? !has : v.days.includes(x))) });
  };
  return (
    <div className="af-schedule__calendar" data-calendar-kind={v.kind}>
      {v.kind === "weekly" ? (
        <div className="af-auto__row af-schedule__days" role="group" aria-label={SCHEDULE_TEXT.days_legend}>
          <span>{SCHEDULE_TEXT.days_legend}</span>
          {CALENDAR_DAYS.map((d) => (
            <AfChipButton key={d} className="af-schedule__day" pressed={v.days.includes(d)} disabled={props.disabled} onClick={() => toggleDay(d)} tone="accent">
              <span data-day={d}>{SCHEDULE_TEXT.days[d]}</span>
            </AfChipButton>
          ))}
        </div>
      ) : null}
      <div className="af-auto__row">
        {v.kind === "monthly" ? (
          <>
            <label htmlFor={`${props.idBase}-month-day`}>{SCHEDULE_TEXT.day_label}</label>
            <select
              id={`${props.idBase}-month-day`}
              name="calendar_day"
              value={String(v.day)}
              disabled={props.disabled}
              onChange={(e) => props.onChange({ ...v, day: e.target.value === "last" ? "last" : Number(e.target.value) })}
            >
              {MONTH_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === "last" ? SCHEDULE_TEXT.last_day : d}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label htmlFor={`${props.idBase}-at`}>{SCHEDULE_TEXT.at_label}</label>
        <input
          id={`${props.idBase}-at`}
          name="calendar_at"
          type="time"
          step={60}
          required
          value={v.at}
          disabled={props.disabled}
          aria-label={SCHEDULE_TEXT.time_label}
          onChange={(e) => props.onChange({ ...v, at: e.target.value.slice(0, 5) })}
        />
      </div>
    </div>
  );
}

/**
 * "in Europe/Paris (your account's time zone)" with the kit tooltip, and a
 * link to the account preferences (the only place the zone changes) when the
 * host passes `onOpenPreferences`.
 */
export function AfTimeZoneLine(props: { timeZone: string; whose?: "account" | "automation"; onOpenPreferences?: () => void }): React.ReactElement {
  return (
    <p className="af-schedule__tz" data-time-zone={props.timeZone}>
      <AfTooltip content={SCHEDULE_TEXT.time_zone_hint}>
        <span tabIndex={0} className="af-schedule__tz-text">
          {timeZoneLine(props.timeZone, props.whose ?? "account")}
        </span>
      </AfTooltip>
      {props.onOpenPreferences && (props.whose ?? "account") === "account" ? (
        <>
          {" · "}
          <AfTooltip content={SCHEDULE_TEXT.time_zone_change_hint}>
            <button type="button" className="af-auto__link af-schedule__tz-change" onClick={props.onOpenPreferences}>
              {SCHEDULE_TEXT.time_zone_change}
            </button>
          </AfTooltip>
        </>
      ) : null}
    </p>
  );
}

export type PreviewSchedule = (trigger: TriggerSpec) => Promise<SchedulePreview>;
export type PreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ok"; description: SchedulePreview }
  | { phase: "error"; message: string };

function errorMessage(e: unknown): string {
  const err = e as Partial<ApiError> & { message?: unknown };
  return typeof err?.message === "string" && err.message ? err.message : String(e);
}

/**
 * The gateway's description of `trigger` (debounced, latest request wins).
 * `null` trigger = nothing to describe (incomplete rule, or not a calendar kind).
 */
export function useSchedulePreview(trigger: TriggerSpec | null, describe: PreviewSchedule, delayMs = 250): PreviewState {
  const key = trigger ? JSON.stringify(trigger) : "";
  const [state, setState] = useState<PreviewState>({ phase: "idle" });
  const seq = useRef(0);
  const describeRef = useRef(describe);
  describeRef.current = describe;
  useEffect(() => {
    const mine = ++seq.current;
    if (!key) {
      setState({ phase: "idle" });
      return;
    }
    setState({ phase: "loading" });
    const timer = setTimeout(() => {
      describeRef.current(JSON.parse(key) as TriggerSpec).then(
        (description) => {
          if (seq.current === mine) setState({ phase: "ok", description });
        },
        (e) => {
          if (seq.current === mine) setState({ phase: "error", message: errorMessage(e) });
        },
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [key, delayMs]);
  return state;
}

/** The served sentence lines (and the time-zone line) of a calendar rule. */
export function AfServedSchedule(props: { state: PreviewState; whose?: "account" | "automation"; onOpenPreferences?: () => void; incompleteText?: string; /** false for Repeat (a fixed UTC interval): no time-zone line. */ showZone?: boolean }): React.ReactElement {
  const st = props.state;
  if (st.phase === "ok") {
    return (
      <>
        {props.showZone === false ? null : <AfTimeZoneLine timeZone={st.description.time_zone} whose={props.whose} onOpenPreferences={props.onOpenPreferences} />}
        <p className="af-schedule__preview" aria-live="polite" data-preview="served">
          {st.description.first_run_sentence}
        </p>
      </>
    );
  }
  if (st.phase === "error")
    return (
      <p className="af-schedule__preview af-auto__warn" role="alert" data-preview="error">
        {st.message}
      </p>
    );
  return (
    <p className="af-schedule__preview" aria-live="polite" data-preview={st.phase}>
      {st.phase === "loading" ? SCHEDULE_TEXT.describing : props.incompleteText ?? SCHEDULE_TEXT.incomplete}
    </p>
  );
}
