// AfTimeZonePicker (round 16, R16.1 A2): the account's time zone, a kit
// searchable combobox over the IANA names the GATEWAY serves (the
// preferences answer's `time_zone.choices`) — never a list guessed from the
// browser. The first option is "Gateway default (<zone>)" (= null: follow the
// gateway's host zone); label and help are the gateway's (`time_zone.label`,
// `time_zone.help`). It holds no state: the host PUTs `{time_zone}` on change
// (no Save) and re-renders with the answer.
import React from "react";
import { AfSelect, type AfSelectOption } from "./af_select.js";
import { AfTooltip } from "./af_tooltip.js";
import { SCHEDULE_TEXT } from "./automations/panel_core.js";

/** The `time_zone` block of `GET /api/gateway/accounts/{me|id}/preferences` ("R16.1 API — FINAL" (4)). */
export type TimeZonePreference = {
  value: string | null;
  gateway_default: string;
  effective: string;
  label: string;
  help: string;
  choices: string[];
};

/** "Gateway default (Europe/Paris)" first (value ""), then the served IANA names in the gateway's order. */
export function timeZoneOptions(block: Pick<TimeZonePreference, "gateway_default" | "choices">): AfSelectOption[] {
  return [{ value: "", label: SCHEDULE_TEXT.time_zone_default.replace("{time_zone}", block.gateway_default) }, ...block.choices.map((z) => ({ value: z, label: z }))];
}

export type AfTimeZonePickerProps = {
  block: TimeZonePreference;
  /** `null` = follow the gateway default. */
  onChange(next: string | null): void;
  disabled?: boolean;
  /** DOM id of the trigger (pairs with the visible label). */
  id: string;
  /** Inline state after a change ("Saved." / "Not saved. <sentence>"). */
  note?: { ok: boolean; text: string } | null;
};

export function AfTimeZonePicker(props: AfTimeZonePickerProps): React.ReactElement {
  const b = props.block;
  if (!Array.isArray(b.choices) || typeof b.gateway_default !== "string") throw new Error("AfTimeZonePicker: the preferences answer has no time_zone block (R16.1 preferences seam).");
  return (
    <div className="af-tz-picker" data-time-zone-preference={b.value ?? ""}>
      <div className="af-tz-picker__head">
        <label className="af-tz-picker__label" htmlFor={props.id}>
          {b.label}
        </label>
        {b.help ? (
          <AfTooltip content={b.help}>
            <span className="af-tz-picker__help" tabIndex={0} aria-label={b.help}>
              ?
            </span>
          </AfTooltip>
        ) : null}
      </div>
      <div className="af-tz-picker__control">
        <AfSelect
          id={props.id}
          value={b.value ?? ""}
          options={timeZoneOptions(b)}
          searchable
          searchPlaceholder={SCHEDULE_TEXT.time_zone_search}
          ariaLabel={b.label}
          disabled={props.disabled}
          onChange={(v: string) => props.onChange(v ? v : null)}
        />
        {props.note ? (
          <span className={`af-tz-picker__note ${props.note.ok ? "is-ok" : "is-error"}`} role="status" aria-live="polite">
            {props.note.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
