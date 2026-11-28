/*
 * AfSegmented — the kit's choice of ONE among 2 to 4 exclusive options (a switch is yes/no; five
 * or more is a select). A radio group drawn as one inset track whose chosen segment is raised:
 * it reads as a choice, never as a button (an action is filled or tinted, see `.af-btn`).
 *
 * Keyboard (WAI-ARIA radio group): one tab stop (roving tabindex: the chosen option, else the
 * first enabled one); Arrow Left/Up and Arrow Right/Down choose the previous / next enabled
 * option (wrapping) and move focus to it; Home / End choose the first / last; Space and Enter
 * choose the focused one. Hook-free: the kit checks render it by calling it.
 *
 * Markup:
 *   <div class="af-seg" role="radiogroup" aria-label="…">
 *     <button type="button" role="radio" class="af-seg__opt" aria-checked="true" tabindex="0">…</button>
 *     …
 *   </div>
 */
import React from "react";
import { Icon, type IconName } from "./icon.js";

export type AfSegmentedOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
};

export type AfSegmentedProps<T extends string = string> = {
  /** 2 to 4 options; any other count throws (five or more is a select, one is not a choice). */
  options: ReadonlyArray<AfSegmentedOption<T>>;
  /** The chosen value; null = none chosen yet (the first enabled option is the tab stop). */
  value: T | null;
  onChange: (next: T) => void;
  /** Accessible name of the group (or `labelledBy`). */
  ariaLabel?: string;
  labelledBy?: string;
  disabled?: boolean;
  /** `data-action` on the group (clients and tests find it by this). */
  action?: string;
  className?: string;
  /** Options share the width (default true); false = each as wide as its label. */
  fill?: boolean;
};

export const AF_SEGMENTED_MIN = 2;
export const AF_SEGMENTED_MAX = 4;

/**
 * The option a key moves to (pure; shared with the checks): the index to choose, or null when the
 * key does nothing. `current` is the focused option's index (-1 when none).
 */
export function afSegmentedMove(enabled: ReadonlyArray<boolean>, current: number, key: string): number | null {
  const n = enabled.length;
  const live = enabled.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  if (!live.length) return null;
  if (key === "Home") return live[0];
  if (key === "End") return live[live.length - 1];
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (!step) return null;
  for (let k = 1; k <= n; k += 1) {
    const i = (((current + step * k) % n) + n) % n;
    if (enabled[i]) return i;
  }
  return null;
}

/** The option that holds the group's one tab stop: the chosen one, else the first enabled one. */
export function afSegmentedTabStop<T extends string>(options: ReadonlyArray<AfSegmentedOption<T>>, value: T | null, disabled = false): number {
  const chosen = options.findIndex((o) => o.value === value && !o.disabled && !disabled);
  if (chosen >= 0) return chosen;
  return options.findIndex((o) => !o.disabled && !disabled);
}

export function AfSegmented<T extends string = string>(props: AfSegmentedProps<T>): React.ReactElement {
  const { options, value, disabled = false } = props;
  if (options.length < AF_SEGMENTED_MIN || options.length > AF_SEGMENTED_MAX) {
    throw new Error(`AfSegmented takes ${AF_SEGMENTED_MIN} to ${AF_SEGMENTED_MAX} options, not ${options.length}: use a switch for yes/no, a select for more.`);
  }
  const stop = afSegmentedTabStop(options, value, disabled);
  const enabled = options.map((o) => !o.disabled && !disabled);
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled || disabled) return;
    if (o.value !== value) props.onChange(o.value);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = afSegmentedMove(enabled, i, e.key);
    if (next === null) return;
    e.preventDefault();
    choose(next);
    const group = e.currentTarget.parentElement;
    const target = group ? (group.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next] ?? null) : null;
    target?.focus();
  };
  const cls = ["af-seg", props.fill === false ? "" : "af-seg--fill", disabled ? "is-disabled" : "", props.className || ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role="radiogroup" aria-label={props.ariaLabel} aria-labelledby={props.labelledBy} aria-disabled={disabled ? "true" : undefined} data-action={props.action} data-count={options.length}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            className={`af-seg__opt${checked ? " is-checked" : ""}`}
            aria-checked={checked ? "true" : "false"}
            tabIndex={i === stop ? 0 : -1}
            disabled={o.disabled || disabled}
            data-value={o.value}
            onClick={() => choose(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.icon ? <Icon name={o.icon} size={14} className="af-seg__icon" /> : null}
            {/* The non-colour cue of the chosen option. */}
            {checked && !o.icon ? <Icon name="check" size={13} className="af-seg__check" /> : null}
            <span className="af-seg__label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default AfSegmented;
