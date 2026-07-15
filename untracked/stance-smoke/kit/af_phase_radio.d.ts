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
import { AfPhase } from "./phase_radio_core.js";
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
export declare function AfPhaseRadio({ phase, slots, phases, onVocabularyDrift, ariaLabel, className, }: AfPhaseRadioProps): React.ReactElement;
//# sourceMappingURL=af_phase_radio.d.ts.map