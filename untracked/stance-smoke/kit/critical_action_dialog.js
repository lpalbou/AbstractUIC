import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/*
 * CriticalActionDialog: confirmation surface for actions with irreversible
 * blast radius (embedding model change / reembed is the motivating case).
 *
 * Contract (commons c679 point 4 + laurent c595):
 * - The dialog states server FACTS, not vibes: the blast-radius consequence
 *   sentence (+ optional rows) is server-supplied and required for an enabled
 *   confirm. Missing facts => confirm disabled with a labeled #FALLBACK,
 *   unless the consumer explicitly opts into labeled degraded proceed.
 * - Typed-confirm is strictly OPT-IN (ceremony-is-not-honesty ruling): one
 *   approval click is the default; a typed phrase only when the consumer
 *   passes confirmPhrase.
 * - Server JSON is never trusted structurally: rendering goes through
 *   normalizeCriticalActionFacts (adversary finding 2026-07-11 — a facts
 *   object without a rows array crashed the render before the gate mattered).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { normalizeCriticalActionFacts, resolveCriticalActionGate, } from "./critical_action_core.js";
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
export function CriticalActionDialog(props) {
    const [typed, setTyped] = useState("");
    const card_ref = useRef(null);
    const restore_ref = useRef(null);
    // Reset the typed phrase when the dialog closes OR retargets to a different
    // action while open (a phrase typed for action A must never pre-arm action
    // B — the previous !open guard made the retarget deps dead code).
    useEffect(() => {
        setTyped("");
    }, [props.open, props.confirmPhrase, props.actionLabel, props.title]);
    // Focus restoration: remember the opener while open, give focus back on
    // close. Keyed on `open` ONLY — an inline onCancel prop must not trigger a
    // mid-open restore on every re-render.
    useEffect(() => {
        if (!props.open)
            return;
        restore_ref.current = document.activeElement || null;
        return () => {
            const restore = restore_ref.current;
            if (restore && typeof restore.focus === "function")
                restore.focus();
        };
    }, [props.open]);
    // Escape-to-cancel + Tab containment (keyboard/AT users must not land
    // behind the scrim of an irreversible-action dialog). Escape is gated on
    // !busy: while the action runs the Cancel button is disabled, and an
    // irreversible-action surface must not keep a keyboard side-door to the
    // same (refused) dismissal (0008 fix, adversary F14).
    useEffect(() => {
        if (!props.open)
            return;
        const on_key = (e) => {
            if (e.key === "Escape") {
                if (props.busy !== true)
                    props.onCancel();
                return;
            }
            if (e.key !== "Tab")
                return;
            const card = card_ref.current;
            if (!card)
                return;
            const focusables = Array.from(card.querySelectorAll(FOCUSABLE));
            if (focusables.length === 0)
                return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (e.shiftKey) {
                if (active === first || !card.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            }
            else if (active === last || !card.contains(active)) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener("keydown", on_key);
        return () => window.removeEventListener("keydown", on_key);
    }, [props.open, props.onCancel, props.busy]);
    // Normalize BEFORE render: server JSON, not the TS type, is the truth here.
    const facts = useMemo(() => normalizeCriticalActionFacts(props.facts), [props.facts]);
    if (!props.open)
        return null;
    const gate = resolveCriticalActionGate({
        facts: props.facts,
        allowDegradedProceed: props.allowDegradedProceed === true,
        confirmPhrase: props.confirmPhrase,
        typedText: typed,
        busy: props.busy === true,
    });
    return (_jsx("div", { className: "af-critical__overlay", role: "presentation", 
        /* Scrim click is the same dismissal as Escape/Cancel: gated on !busy. */
        onClick: props.busy === true ? undefined : props.onCancel, children: _jsxs("div", { ref: card_ref, className: `af-critical ${props.className || ""}`.trim(), role: "dialog", "aria-modal": "true", "aria-label": props.title, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "af-critical__title", children: props.title }), facts ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "af-critical__consequence", children: facts.consequence }), facts.facts.length > 0 ? (_jsx("dl", { className: "af-critical__facts", children: facts.facts.map((f, i) => (_jsxs(React.Fragment, { children: [_jsx("dt", { children: f.label }), _jsx("dd", { children: f.value })] }, `${f.label}-${i}`))) })) : null] })) : (_jsxs("div", { className: "af-critical__fallback", children: ["#FALLBACK: the server did not supply blast-radius facts for this action.", props.allowDegradedProceed
                            ? " Proceeding is possible but degraded — the consequences are unverified."
                            : " Confirmation is disabled."] })), props.children, props.confirmPhrase ? (_jsxs("label", { className: "af-critical__phrase", children: [_jsxs("span", { children: ["Type ", _jsx("code", { children: props.confirmPhrase }), " to confirm"] }), _jsx("input", { type: "text", value: typed, onChange: (e) => setTyped(e.target.value), disabled: props.busy === true, autoFocus: true })] })) : null, props.error ? _jsx("div", { className: "af-critical__error", children: props.error }) : null, !gate.confirmEnabled && gate.disabledReason && !props.error ? (_jsx("div", { className: "af-critical__disabled-reason", children: gate.disabledReason })) : null, _jsxs("div", { className: "af-critical__actions", children: [_jsx("button", { type: "button", className: "af-critical__cancel", onClick: props.onCancel, disabled: props.busy === true, autoFocus: !props.confirmPhrase, children: "Cancel" }), _jsx("button", { type: "button", className: `af-critical__confirm ${gate.degraded ? "is-degraded" : ""}`.trim(), onClick: props.onConfirm, disabled: !gate.confirmEnabled, children: props.busy ? "Working…" : gate.degraded && gate.degradedLabel ? gate.degradedLabel : props.actionLabel })] })] }) }));
}
export default CriticalActionDialog;
