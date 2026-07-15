import { jsxs as _jsxs, Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
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
import { PHASE_DESCRIPTORS, RULED_PHASES, reconcilePhaseList, } from "./phase_radio_core.js";
export function AfPhaseRadio({ phase, slots = {}, phases, onVocabularyDrift, ariaLabel = "Current phase (visit / work / personal / sleep)", className = "", }) {
    const { phases: order, dropped } = React.useMemo(() => reconcilePhaseList(phases ?? [...RULED_PHASES]), 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phases ? phases.join("|") : ""]);
    const driftRef = React.useRef("");
    React.useEffect(() => {
        const key = dropped.join("|");
        if (key && key !== driftRef.current) {
            driftRef.current = key;
            onVocabularyDrift?.(dropped);
        }
    }, [dropped, onVocabularyDrift]);
    const active = typeof phase === "string" && RULED_PHASES.includes(phase)
        ? phase
        : null;
    return (_jsx("span", { className: `af-phase-radio ${className}`.trim(), role: "radiogroup", "aria-label": ariaLabel, children: order.map((p) => {
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
            return (_jsx("button", { type: "button", className: classes, "data-phase": p, role: "radio", "aria-checked": isActive, disabled: slot.disabled || slot.busy, title: slot.title ?? d.defaultTitle, onClick: slot.onSelect, children: slot.busy ? (_jsxs("span", { className: "af-phase-radio__label", children: [d.glyph, " \u2026"] })) : (_jsx("span", { className: "af-phase-radio__label", children: slot.label ?? (_jsxs(_Fragment, { children: [d.glyph, " ", d.label] })) })) }, p));
        }) }));
}
