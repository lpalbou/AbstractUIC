/*
 * PhaseCapabilityMatrix: thin React wrapper over phase_capability_matrix_core.
 *
 * Renders the gateway-owned entity config object's phase x capability grid.
 * All resolution/patch semantics live in the framework-free core (the served
 * gateway console consumes the same compiled logic); this file is DOM only —
 * it switches on the core's MatrixCellControl decision and never reconstructs
 * interactivity/approval from raw cell fields (adversary pin 2026-07-11).
 */
import React, { useMemo } from "react";
import {
  applyCellAction,
  reconcilePatches,
  resolveCellView,
  validateMatrixPayload,
  type MatrixCellOp,
  type MatrixCellPatch,
  type MatrixCellView,
  type MatrixPayload,
} from "./phase_capability_matrix_core.js";

export type PhaseCapabilityMatrixProps = {
  /** Raw payload from the gateway (validated here; refusals render labeled). */
  payload: unknown;
  /** Pending (unsaved) cell patches — owned by the consumer. */
  patches: MatrixCellPatch[];
  /** Emits the full pending patch list after each operator act. */
  onPatchesChange: (next: MatrixCellPatch[]) => void;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
};

function op_button_label(op: MatrixCellOp): string {
  if (op === "grant") return "Grant";
  if (op === "deny") return "Deny";
  return "Default";
}

type CellControlProps = {
  view: MatrixCellView;
  /** Accessible context: which capability + phase this cell edits. */
  cellLabel: string;
  disabled: boolean;
  onAct: (op: MatrixCellOp) => void;
};

function CellControl(props: CellControlProps): React.ReactElement {
  const { view, disabled } = props;
  const control = view.control;

  if (control.kind === "absent") {
    return (
      <div className="af-matrix__cell is-absent" title={view.reason || undefined}>
        <span className="af-matrix__cell-mark">—</span>
      </div>
    );
  }

  if (control.kind === "blocked") {
    return (
      <div className={`af-matrix__cell is-unavailable is-${control.blocked_kind}`}>
        <span className="af-matrix__cell-mark">✕</span>
        <span className="af-matrix__cell-note">
          {control.blocked_kind === "trust" ? "blocked" : "structural"}
        </span>
        {view.reason ? <span className="af-matrix__cell-reason">{view.reason}</span> : null}
      </div>
    );
  }

  if (control.kind === "approval") {
    // requires_review: the enable IS the approval act — one explicit button,
    // never a plain on-toggle that silently discharges an approval.
    return (
      <div className="af-matrix__cell is-review">
        <span className="af-matrix__cell-note">needs review</span>
        <button
          type="button"
          className="af-matrix__approve-btn"
          disabled={disabled}
          onClick={() => props.onAct("grant")}
          aria-label={`Approve and enable: ${props.cellLabel}`}
        >
          Approve &amp; enable
        </button>
        {view.reason ? <span className="af-matrix__cell-reason">{view.reason}</span> : null}
      </div>
    );
  }

  const cell = view.cell!;
  const effective_label =
    view.effective_value === null ? "server default (unknown until saved)" : view.effective_value ? "on" : "off";

  return (
    <div
      className={`af-matrix__cell ${view.effective_value === null ? "is-indeterminate" : view.effective_value ? "is-on" : "is-off"} ${view.pending ? "is-pending" : ""}`.trim()}
      title={view.reason || undefined}
    >
      <div className="af-matrix__tristate" role="group" aria-label={props.cellLabel}>
        {control.options.map((op) => (
          <button
            key={op}
            type="button"
            aria-pressed={control.active_op === op}
            className={`af-matrix__tri-btn is-${op} ${control.active_op === op ? "is-active" : ""}`.trim()}
            disabled={disabled}
            onClick={() => props.onAct(op)}
          >
            {op_button_label(op)}
          </button>
        ))}
      </div>
      <div className="af-matrix__cell-meta">
        <span className={`af-matrix__prov is-${cell.provenance}`}>
          {view.pending ? "pending" : cell.provenance}
        </span>
        <span className="af-matrix__value-mark">{effective_label}</span>
        {view.standing_config ? (
          <span className="af-matrix__standing" title={view.reason || "grant is stored; no executor consumes it yet"}>
            standing config
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PhaseCapabilityMatrix(props: PhaseCapabilityMatrixProps): React.ReactElement {
  const disabled = props.disabled === true;
  const validation = useMemo(() => validateMatrixPayload(props.payload), [props.payload]);

  // Orphaned patches (cells gone after a payload refresh) are dropped from
  // every view, the count, and — via serializeCellPatches — the wire.
  const patches = useMemo(
    () => (validation.ok ? reconcilePatches(validation.payload, props.patches) : props.patches),
    [validation, props.patches]
  );

  if (!validation.ok) {
    // Refusal is a labeled degraded view, never a guess at grant state.
    return (
      <div className={`af-matrix af-matrix--refused ${props.className || ""}`.trim()}>
        <div className="af-matrix__title">{props.title || "Phase capabilities"}</div>
        <div className="af-matrix__refusal">
          Cannot render capability state: {validation.reason}
        </div>
      </div>
    );
  }

  const payload: MatrixPayload = validation.payload;

  const act = (section: string, item: string, phase: string, op: MatrixCellOp) => {
    if (disabled) return;
    const next = applyCellAction(payload, patches, { section, item, phase, op });
    props.onPatchesChange(next);
  };

  return (
    <div className={`af-matrix ${props.className || ""}`.trim()}>
      <div className="af-matrix__header">
        <div className="af-matrix__title">{props.title || "Phase capabilities"}</div>
        {props.subtitle ? <div className="af-matrix__subtitle">{props.subtitle}</div> : null}
        {patches.length > 0 ? (
          <div className="af-matrix__pending-note">
            {patches.length} unsaved change{patches.length === 1 ? "" : "s"} (cell-scoped; untouched cells are never written)
          </div>
        ) : null}
      </div>
      <div className="af-matrix__scroll">
        <table className="af-matrix__table">
          <thead>
            <tr>
              <th className="af-matrix__corner" />
              {payload.phases.map((phase) => (
                <th key={phase.id} className="af-matrix__phase" title={phase.hint || undefined}>
                  <span className="af-matrix__phase-label">{phase.label || phase.id}</span>
                  {phase.hint ? <span className="af-matrix__phase-hint">{phase.hint}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          {payload.sections.map((section) => (
            <tbody key={section.id} className="af-matrix__section">
              <tr className="af-matrix__section-row">
                <th className="af-matrix__section-label" colSpan={payload.phases.length + 1}>
                  {section.label || section.id}
                </th>
              </tr>
              {section.items.map((item) => (
                <tr key={item.id} className="af-matrix__item-row">
                  <th className="af-matrix__item" title={item.description || undefined}>
                    <span className="af-matrix__item-name">{item.label || item.id}</span>
                  </th>
                  {payload.phases.map((phase) => {
                    const view = resolveCellView(payload, patches, section.id, item.id, phase.id);
                    return (
                      <td key={phase.id} className="af-matrix__cell-td">
                        <CellControl
                          view={view}
                          cellLabel={`${item.label || item.id} — ${phase.label || phase.id}`}
                          disabled={disabled}
                          onAct={(op) => act(section.id, item.id, phase.id, op)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {section.items.length === 0 ? (
                <tr>
                  <td className="af-matrix__empty" colSpan={payload.phases.length + 1}>
                    No entries in this section.
                  </td>
                </tr>
              ) : null}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

export default PhaseCapabilityMatrix;
