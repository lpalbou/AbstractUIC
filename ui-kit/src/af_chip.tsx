/*
 * AfChip / AfChipButton — the shared badge/chip family.
 *
 * Built to the AMENDED contract (commons c1116): the kit owns TONES +
 * geometry + ONE derivation recipe; name→tone maps are CONSUMER data (the
 * kit deliberately does not know what "shared" or "current" mean — flow's
 * shipped tone choices stay verbatim in flow's map).
 *
 * Derivation recipe (the measured AA recipe from the AgentCyclesPanel work):
 *   background = color-mix(hue 12%, transparent)
 *   border     = color-mix(hue 35%, transparent)
 *   text       = color-mix(hue 45%, var(--text-primary) 55%)
 * 45%/55% recovers >= 4.5:1 at small sizes on Nord-class muted palettes;
 * there is NO filled variant — solid semantic backgrounds failed AA on 7/21
 * themes and the contract forbids reintroducing them.
 *
 * `tone="custom"` is the token-routed escape hatch that keeps entity/priority
 * hues from re-forking: the hue must arrive as a var() reference to a theme
 * token (e.g. "var(--entity-bond)"); raw hex/rgb values are REFUSED (chip
 * renders neutral) so one-off colors cannot creep past the theme system.
 *
 * Split by interaction reality: AfChip is a span (static label, optional
 * remove button child); AfChipButton is a real <button> root carrying
 * aria-pressed / aria-expanded. One root cannot honestly host observer's
 * removable chips AND flow's clickable family badge.
 */
import React from "react";

export type AfChipTone = "neutral" | "muted" | "accent" | "info" | "success" | "warning" | "error" | "custom";

const TONE_HUES: Record<Exclude<AfChipTone, "custom">, string> = {
  neutral: "var(--text-secondary)",
  muted: "var(--text-muted)",
  accent: "var(--accent)",
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--error)",
};

/** var() theme-token references only — the anti-refork ratchet. */
const VAR_REF = /^var\(--[a-z0-9-]+\)$/i;

export function afChipHue(tone: AfChipTone | undefined, hue: string | undefined): string {
  const t = tone || "neutral";
  if (t === "custom") {
    const raw = String(hue || "").trim();
    if (VAR_REF.test(raw)) return raw;
    // Refuse raw colors: fall back to the neutral hue so a bad value renders
    // legibly instead of silently minting an off-theme color.
    return TONE_HUES.neutral;
  }
  return TONE_HUES[t] || TONE_HUES.neutral;
}

type ChipCommonProps = {
  tone?: AfChipTone;
  /** Only read when tone="custom"; must be a var(--token) reference. */
  hue?: string;
  size?: "sm" | "md";
  title?: string;
  className?: string;
  children: React.ReactNode;
};

function chipClass(base: string, props: ChipCommonProps, extra?: string): string {
  return [
    base,
    `${base}--${props.tone || "neutral"}`,
    props.size === "sm" ? `${base}--sm` : "",
    extra || "",
    props.className || "",
  ]
    .filter(Boolean)
    .join(" ");
}

function chipStyle(props: ChipCommonProps): React.CSSProperties {
  return { ["--af-chip-hue" as string]: afChipHue(props.tone, props.hue) };
}

export type AfChipProps = ChipCommonProps & {
  /** Renders a small remove button inside the chip (observer's removable chips). */
  onRemove?: () => void;
  removeLabel?: string;
};

export function AfChip(props: AfChipProps): React.ReactElement {
  return (
    <span className={chipClass("af-chip", props, props.onRemove ? "af-chip--removable" : "")} style={chipStyle(props)} title={props.title}>
      <span className="af-chip__label">{props.children}</span>
      {props.onRemove ? (
        <button
          type="button"
          className="af-chip__remove"
          aria-label={props.removeLabel || "Remove"}
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove?.();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

export type AfChipButtonProps = ChipCommonProps & {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Toggle chips (filter pills): rendered as aria-pressed. */
  pressed?: boolean;
  /** Disclosure chips (flow's family badge): rendered as aria-expanded. */
  expanded?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

export function AfChipButton(props: AfChipButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={chipClass("af-chip", props, "af-chip--button")}
      style={chipStyle(props)}
      title={props.title}
      onClick={props.onClick}
      aria-pressed={typeof props.pressed === "boolean" ? props.pressed : undefined}
      aria-expanded={typeof props.expanded === "boolean" ? props.expanded : undefined}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
    >
      <span className="af-chip__label">{props.children}</span>
    </button>
  );
}

export default AfChip;
