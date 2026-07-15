/**
 * AfPhaseRadio — the shared four-position phase radio (backlog 0027;
 * entity's shared-yes c2000; absorbed from abstractentity's shipped
 * controls strip).
 *
 * THE CONTRACT (from abstractentity/spec/entity_phases.json invariants,
 * consumed as prose — the artifact itself is never imported by UI code):
 * - ONE-ACTIVE-PHASE: `phase` is the server-derived current phase; exactly
 *   one position renders pushed. null = no position pushed (awake-idle /
 *   unknown) — the surrounding chip carries the honest word, this component
 *   simply pushes nothing.
 * - PAYLOAD-DRIVEN: the component renders what it is given. It never
 *   derives phase client-side; `phase` and per-slot facts (armed, alarm,
 *   disabled reasons) come from the consumer's one derived state machine.
 * - ARMED ≠ IN-PHASE: `armed` renders as its own underline dot on a
 *   position, never as a pushed state.
 * - ALARM is the loudest pixel: color + text + border all move (the
 *   consumer supplies the alarm label — e.g. "alive · NO GRANT").
 * - Honest affordances: disabled positions REQUIRE an explanatory title
 *   (radios without an entry surface say why, never fake clickability).
 * - A11y: role=radiogroup / role=radio + aria-checked; "current phase"
 *   wording; one primary label per control (synonyms in tooltips only).
 */
import React from "react";
import {
  AfPhase,
  PHASE_DESCRIPTORS,
  RULED_PHASES,
  reconcilePhaseList,
} from "./phase_radio_core.js";

export interface AfPhaseSlot {
  /** Override the button label (default: glyph + phase word). The alarm
   * label should carry the alarm words themselves. */
  label?: React.ReactNode;
  /** Tooltip. REQUIRED in practice for disabled slots (honest affordances);
   * falls back to the descriptor's spec-derived default. */
  title?: string;
  disabled?: boolean;
  /** Click intent — the consumer owns act semantics (fresh reads, refusal
   * rendering); absent = the position is display-only. */
  onSelect?: () => void;
  /** Standing grant dot (armed ≠ in-phase). */
  armed?: boolean;
  /** Loudest-pixel state; supply the label words with it. */
  alarm?: boolean;
  /** In-flight act: renders the busy glyph and disables the button. */
  busy?: boolean;
  /** Process-axis intensity (entity c2110 — the three operator-reviewed
   * personal sub-states, phase-agnostic by design):
   *   "active"     pushed at full tint (default when pushed);
   *   "resting"    the phase is CURRENT but its process idles between
   *                ticks — pushed, dimmer;
   *   "suppressed" the process is alive but this phase is NOT current —
   *                unpushed with a faint standing tint (never reads as
   *                pushed; radio semantics hold).
   * Rendered by the kit so the sub-state vocabulary stays one-sourced. */
  variant?: "active" | "resting" | "suppressed";
}

export interface AfPhaseRadioProps {
  /** Server-derived current phase key, or null for none-pushed. Unknown
   * strings are treated as null (strict vocabulary — see core). */
  phase: AfPhase | string | null | undefined;
  slots?: Partial<Record<AfPhase, AfPhaseSlot>>;
  /** Optional gateway-derived phase order; defaults to the ruled four.
   * Entries outside the ruled vocabulary are dropped and surfaced via
   * `onVocabularyDrift` (render a #FALLBACK line — drift stays visible). */
  phases?: readonly string[];
  onVocabularyDrift?: (dropped: string[]) => void;
  ariaLabel?: string;
  className?: string;
}

export function AfPhaseRadio({
  phase,
  slots = {},
  phases,
  onVocabularyDrift,
  ariaLabel = "Current phase (visit / work / personal / sleep)",
  className = "",
}: AfPhaseRadioProps): React.ReactElement {
  const { phases: order, dropped } = React.useMemo(
    () => reconcilePhaseList(phases ?? [...RULED_PHASES]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phases ? phases.join("|") : ""]
  );
  const driftRef = React.useRef("");
  React.useEffect(() => {
    const key = dropped.join("|");
    if (key && key !== driftRef.current) {
      driftRef.current = key;
      onVocabularyDrift?.(dropped);
    }
  }, [dropped, onVocabularyDrift]);

  const active =
    typeof phase === "string" && (RULED_PHASES as readonly string[]).includes(phase)
      ? (phase as AfPhase)
      : null;

  return (
    <span className={`af-phase-radio ${className}`.trim()} role="radiogroup" aria-label={ariaLabel}>
      {order.map((p) => {
        const d = PHASE_DESCRIPTORS[p];
        const slot = slots[p] ?? {};
        const isActive = active === p;
        // variant semantics: resting only modifies a PUSHED position;
        // suppressed only an UNPUSHED one (radio truth beats the hint —
        // a stale consumer flag can never fake or hide the current phase).
        const resting = isActive && slot.variant === "resting";
        const suppressed = !isActive && slot.variant === "suppressed";
        const classes = [
          "af-phase-radio__btn",
          isActive ? "af-phase-radio__btn--on" : "",
          resting ? "af-phase-radio__btn--resting" : "",
          suppressed ? "af-phase-radio__btn--suppressed" : "",
          slot.alarm ? "af-phase-radio__btn--alarm" : "",
          slot.armed ? "af-phase-radio__btn--armed" : "",
          slot.busy ? "af-phase-radio__btn--busy" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={p}
            type="button"
            className={classes}
            data-phase={p}
            role="radio"
            aria-checked={isActive}
            disabled={slot.disabled || slot.busy}
            title={slot.title ?? d.defaultTitle}
            onClick={slot.onSelect}
          >
            {slot.busy ? (
              <span className="af-phase-radio__label">{d.glyph} …</span>
            ) : (
              <span className="af-phase-radio__label">
                {slot.label ?? (
                  <>
                    {d.glyph} {d.label}
                  </>
                )}
              </span>
            )}
          </button>
        );
      })}
    </span>
  );
}
