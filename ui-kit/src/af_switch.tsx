/*
 * AfSwitch — the ONE control for a persistent on/off setting.
 *
 * Operator rule (2026-09-30): an on/off setting is a STATE control labelled by
 * the FEATURE ("Email", "Agent email tools", "Start at login"), a true switch
 * (track + thumb) clearly highlighted when ON and plain when OFF. It never
 * carries a verb label ("Turn on", "Email off", "Enable X"): a label naming
 * the action a click would perform reads as the CURRENT state half the time,
 * which is exactly the confusion the rule removes. One-shot actions (Rotate,
 * Delete, Restart) stay ordinary buttons.
 *
 * Markup contract (vanilla consoles render the same markup; the CSS lives in
 * theme.css between the `af-switch:begin` / `af-switch:end` markers):
 *
 *   <button type="button" role="switch" class="af-switch" aria-checked="true|false"
 *           [aria-disabled="true" aria-describedby="<reason id>"] [aria-busy="true"]>
 *     <span class="af-switch__track" aria-hidden="true"><span class="af-switch__thumb"></span></span>
 *     <span class="af-switch__text">
 *       <span class="af-switch__label">Email</span>
 *       [<span class="af-switch__desc">What it does</span>]
 *     </span>
 *   </button>
 *   [<span id="<reason id>" class="af-switch__reason">Needs a connected mailbox</span>]
 *
 * Variants: `af-switch--row` (settings row: text left, switch right, full
 * width) and `af-switch--sm` (compact, for table rows; still 44 px on touch).
 *
 * ON is shown three ways, so it survives colour blindness and every theme:
 * the thumb slides right and carries a check mark (position + shape), the
 * track fills with the accent and glows (colour + light), the label turns
 * bold (weight).
 *
 * UNAVAILABLE (e.g. agent email tools while no mailbox is connected) is not
 * `disabled`: a disabled button cannot take focus, so keyboard and screen
 * reader users would never reach the reason. It is `aria-disabled="true"`,
 * stays focusable, ignores clicks, and names the reason through
 * aria-describedby (visible text unless `reasonVisible={false}`, plus `title`
 * for hover).
 */
import React from "react";

export type AfSwitchProps = {
  /** The FEATURE name ("Email", "Start at login"). Never a verb phrase. */
  label: React.ReactNode;
  /** Current state: true = ON. */
  checked: boolean;
  /** Called with the requested new state. Not called while unavailable or busy. */
  onChange?: (next: boolean) => void;
  /** One line under the label saying what the setting does (row variant mostly). */
  description?: React.ReactNode;
  /** Why the setting cannot be changed now. A non-empty reason makes the switch unavailable. */
  unavailableReason?: string | null;
  /** Show the reason as text after the control (default true); otherwise it is hover/aria only. */
  reasonVisible?: boolean;
  /**
   * The id of a reason node the caller already renders (a shared "why" line,
   * a table cell). When set, an unavailable switch points aria-describedby at
   * it and renders no reason node of its own.
   */
  describedBy?: string;
  /** What the setting does, as the tooltip and aria-description (when there is no visible description). */
  hint?: string;
  /** A save is in flight: the switch keeps its current state and ignores clicks. */
  busy?: boolean;
  /** "row": text left, switch right, full width. "sm": compact (table rows). */
  variant?: "inline" | "row" | "sm";
  /** Accessible name when `label` is not plain text. */
  ariaLabel?: string;
  className?: string;
  id?: string;
  /** `data-action` on the button (clients and tests find controls by it). */
  action?: string;
};

/** True when the switch can be changed now (pure; shared with the checks). */
export function afSwitchIsActionable(props: Pick<AfSwitchProps, "unavailableReason" | "busy">): boolean {
  return !String(props.unavailableReason || "").trim() && !props.busy;
}

/** The state a click requests, or null when the click must be ignored. */
export function afSwitchNextState(props: Pick<AfSwitchProps, "checked" | "unavailableReason" | "busy">): boolean | null {
  return afSwitchIsActionable(props) ? !props.checked : null;
}

let reasonSeq = 0;

export function AfSwitch(props: AfSwitchProps): React.ReactElement {
  const { label, checked, onChange, description, reasonVisible = true, describedBy, hint, busy = false, variant = "inline", ariaLabel, className, id, action } = props;
  const reason = String(props.unavailableReason || "").trim();
  const unavailable = Boolean(reason);
  // Hook-free on purpose (kit checks render components by calling them): an
  // id is minted only when an unavailable switch has neither `describedBy`
  // nor `id` to derive one from.
  const reasonId = describedBy || (id ? `${id}-reason` : unavailable ? `af-switch-reason-${++reasonSeq}` : undefined);
  const cls = [
    "af-switch",
    variant === "row" ? "af-switch--row" : variant === "sm" ? "af-switch--sm" : "",
    unavailable ? "af-switch--unavailable" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = afSwitchNextState({ checked, unavailableReason: reason, busy });
    if (next === null) {
      e.preventDefault();
      return;
    }
    onChange?.(next);
  };
  const button = (
    <button
      type="button"
      role="switch"
      id={id}
      className={cls}
      data-action={action}
      aria-checked={checked ? "true" : "false"}
      aria-disabled={unavailable ? "true" : undefined}
      aria-describedby={unavailable ? reasonId : undefined}
      aria-busy={busy ? "true" : undefined}
      aria-label={ariaLabel}
      aria-description={description ? undefined : hint}
      title={unavailable ? (hint ? `${reason}\n${hint}` : reason) : hint}
      onClick={onClick}
    >
      <span className="af-switch__track" aria-hidden="true">
        <span className="af-switch__thumb" />
      </span>
      <span className="af-switch__text">
        <span className="af-switch__label">{label}</span>
        {description ? <span className="af-switch__desc">{description}</span> : null}
      </span>
    </button>
  );
  if (!unavailable || describedBy) return button;
  return (
    <span className={variant === "row" ? "af-switch-wrap af-switch-wrap--row" : "af-switch-wrap"}>
      {button}
      <span id={reasonId} className={reasonVisible ? "af-switch__reason" : "af-switch__reason af-switch__reason--hidden"}>
        {reason}
      </span>
    </span>
  );
}
