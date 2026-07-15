import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
 * PhaseCapabilityMatrix: thin React wrapper over phase_capability_matrix_core.
 *
 * Renders the gateway-owned entity config object's phase x capability grid.
 * All resolution/patch semantics live in the framework-free core (the served
 * gateway console consumes the same compiled logic); this file is DOM only —
 * it switches on the core's MatrixCellControl decision and never reconstructs
 * interactivity/approval from raw cell fields (adversary pin 2026-07-11).
 */
import { useMemo } from "react";
import { applyCellAction, reconcilePatches, resolveCellView, validateMatrixPayload, } from "./phase_capability_matrix_core.js";
function op_button_label(op) {
    if (op === "grant")
        return "Grant";
    if (op === "deny")
        return "Deny";
    return "Default";
}
function CellControl(props) {
    const { view, disabled } = props;
    const control = view.control;
    if (control.kind === "absent") {
        return (_jsx("div", { className: "af-matrix__cell is-absent", title: view.reason || undefined, children: _jsx("span", { className: "af-matrix__cell-mark", children: "\u2014" }) }));
    }
    if (control.kind === "blocked") {
        return (_jsxs("div", { className: `af-matrix__cell is-unavailable is-${control.blocked_kind}`, children: [_jsx("span", { className: "af-matrix__cell-mark", children: "\u2715" }), _jsx("span", { className: "af-matrix__cell-note", children: control.blocked_kind === "trust" ? "blocked" : "structural" }), view.reason ? _jsx("span", { className: "af-matrix__cell-reason", children: view.reason }) : null] }));
    }
    if (control.kind === "approval") {
        // requires_review: the enable IS the approval act — one explicit button,
        // never a plain on-toggle that silently discharges an approval.
        return (_jsxs("div", { className: "af-matrix__cell is-review", children: [_jsx("span", { className: "af-matrix__cell-note", children: "needs review" }), _jsx("button", { type: "button", className: "af-matrix__approve-btn", disabled: disabled, onClick: () => props.onAct("grant"), "aria-label": `Approve and enable: ${props.cellLabel}`, children: "Approve & enable" }), view.reason ? _jsx("span", { className: "af-matrix__cell-reason", children: view.reason }) : null] }));
    }
    const cell = view.cell;
    const effective_label = view.effective_value === null ? "server default (unknown until saved)" : view.effective_value ? "on" : "off";
    return (_jsxs("div", { className: `af-matrix__cell ${view.effective_value === null ? "is-indeterminate" : view.effective_value ? "is-on" : "is-off"} ${view.pending ? "is-pending" : ""}`.trim(), title: view.reason || undefined, children: [_jsx("div", { className: "af-matrix__tristate", role: "group", "aria-label": props.cellLabel, children: control.options.map((op) => (_jsx("button", { type: "button", "aria-pressed": control.active_op === op, className: `af-matrix__tri-btn is-${op} ${control.active_op === op ? "is-active" : ""}`.trim(), disabled: disabled, onClick: () => props.onAct(op), children: op_button_label(op) }, op))) }), _jsxs("div", { className: "af-matrix__cell-meta", children: [_jsx("span", { className: `af-matrix__prov is-${cell.provenance}`, children: view.pending ? "pending" : cell.provenance }), _jsx("span", { className: "af-matrix__value-mark", children: effective_label }), view.standing_config ? (_jsx("span", { className: "af-matrix__standing", title: view.reason || "grant is stored; no executor consumes it yet", children: "standing config" })) : null] })] }));
}
export function PhaseCapabilityMatrix(props) {
    const disabled = props.disabled === true;
    const validation = useMemo(() => validateMatrixPayload(props.payload), [props.payload]);
    // Orphaned patches (cells gone after a payload refresh) are dropped from
    // every view, the count, and — via serializeCellPatches — the wire.
    const patches = useMemo(() => (validation.ok ? reconcilePatches(validation.payload, props.patches) : props.patches), [validation, props.patches]);
    if (!validation.ok) {
        // Refusal is a labeled degraded view, never a guess at grant state.
        return (_jsxs("div", { className: `af-matrix af-matrix--refused ${props.className || ""}`.trim(), children: [_jsx("div", { className: "af-matrix__title", children: props.title || "Phase capabilities" }), _jsxs("div", { className: "af-matrix__refusal", children: ["Cannot render capability state: ", validation.reason] })] }));
    }
    const payload = validation.payload;
    const act = (section, item, phase, op) => {
        if (disabled)
            return;
        const next = applyCellAction(payload, patches, { section, item, phase, op });
        props.onPatchesChange(next);
    };
    return (_jsxs("div", { className: `af-matrix ${props.className || ""}`.trim(), children: [_jsxs("div", { className: "af-matrix__header", children: [_jsx("div", { className: "af-matrix__title", children: props.title || "Phase capabilities" }), props.subtitle ? _jsx("div", { className: "af-matrix__subtitle", children: props.subtitle }) : null, patches.length > 0 ? (_jsxs("div", { className: "af-matrix__pending-note", children: [patches.length, " unsaved change", patches.length === 1 ? "" : "s", " (cell-scoped; untouched cells are never written)"] })) : null] }), _jsx("div", { className: "af-matrix__scroll", children: _jsxs("table", { className: "af-matrix__table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "af-matrix__corner" }), payload.phases.map((phase) => (_jsxs("th", { className: "af-matrix__phase", title: phase.hint || undefined, children: [_jsx("span", { className: "af-matrix__phase-label", children: phase.label || phase.id }), phase.hint ? _jsx("span", { className: "af-matrix__phase-hint", children: phase.hint }) : null] }, phase.id)))] }) }), payload.sections.map((section) => (_jsxs("tbody", { className: "af-matrix__section", children: [_jsx("tr", { className: "af-matrix__section-row", children: _jsx("th", { className: "af-matrix__section-label", colSpan: payload.phases.length + 1, children: section.label || section.id }) }), section.items.map((item) => (_jsxs("tr", { className: "af-matrix__item-row", children: [_jsx("th", { className: "af-matrix__item", title: item.description || undefined, children: _jsx("span", { className: "af-matrix__item-name", children: item.label || item.id }) }), payload.phases.map((phase) => {
                                            const view = resolveCellView(payload, patches, section.id, item.id, phase.id);
                                            return (_jsx("td", { className: "af-matrix__cell-td", children: _jsx(CellControl, { view: view, cellLabel: `${item.label || item.id} — ${phase.label || phase.id}`, disabled: disabled, onAct: (op) => act(section.id, item.id, phase.id, op) }) }, phase.id));
                                        })] }, item.id))), section.items.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "af-matrix__empty", colSpan: payload.phases.length + 1, children: "No entries in this section." }) })) : null] }, section.id)))] }) })] }));
}
export default PhaseCapabilityMatrix;
