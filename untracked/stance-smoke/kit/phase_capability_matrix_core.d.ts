export declare const MATRIX_SCHEMA_VERSION = 1;
export type MatrixProvenance = "default" | "operator" | "structural";
export type MatrixAvailability = "granted" | "denied" | "structurally_unavailable" | "trust_gated";
export type MatrixTrustState = "attachable" | "requires_review" | "blocked";
export type MatrixCell = {
    /** True when the operator has an explicit stored word on this cell. */
    assigned: boolean;
    /** Effective resolved grant after server-side resolution. */
    resolved_value: boolean;
    /** Where the resolved value comes from (server-declared, never re-derived). */
    provenance: MatrixProvenance;
    availability: MatrixAvailability;
    /**
     * Second axis, distinct from availability (observer c702): false = the
     * grant is REAL and editable but no executor consumes it yet ("standing
     * config", e.g. sleep tools before the sleep pass gains tool use).
     * Absent = true.
     */
    executable?: boolean;
    /** Server-verbatim human-readable reason (structural / trust); displayed, never mapped. */
    reason?: string;
    /** Only meaningful when availability === "trust_gated" (skill cells). */
    trust_state?: MatrixTrustState;
};
export type MatrixItem = {
    id: string;
    label?: string;
    description?: string;
    /** Keyed by phase id. A missing phase key renders as unavailable (server omitted it). */
    cells: Record<string, MatrixCell>;
};
export type MatrixSection = {
    id: string;
    label?: string;
    items: MatrixItem[];
};
export type MatrixPhase = {
    id: string;
    label?: string;
    /** Optional server-supplied hint (e.g. the personal phase's "brake = enabled + grant"). */
    hint?: string;
};
export type MatrixPayload = {
    schema_version: number;
    phases: MatrixPhase[];
    sections: MatrixSection[];
};
export type MatrixCellOp = "grant" | "deny" | "clear";
export type MatrixCellPatch = {
    section: string;
    item: string;
    phase: string;
    op: MatrixCellOp;
};
export type MatrixValidation = {
    ok: true;
    payload: MatrixPayload;
} | {
    ok: false;
    reason: string;
};
/**
 * Validate a server payload. Unknown MAJOR schema versions refuse loudly —
 * the caller renders the refusal as a labeled degraded view, never a guess.
 * Unknown EXTRA fields anywhere are tolerated (additive evolution is free).
 */
export declare function validateMatrixPayload(raw: unknown): MatrixValidation;
/**
 * The ONE control decision both consumers render from. Adversary finding
 * (2026-07-11): exposing bare interactive/approval booleans let a consumer
 * (the served console) build a plain toggle over a requires_review cell —
 * silently discharging an approval. The discriminated control kind makes the
 * unsafe rendering unrepresentable: consumers switch on `kind`, never
 * reconstruct the decision from raw cell fields.
 */
export type MatrixCellControl = {
    kind: "absent";
} | {
    kind: "blocked";
    blocked_kind: "structural" | "trust";
} | {
    kind: "approval";
} | {
    kind: "tristate";
    options: MatrixCellOp[];
    active_op: MatrixCellOp;
};
export type MatrixCellView = {
    /** Server cell, or null when the server omitted this phase for the item. */
    cell: MatrixCell | null;
    /** Pending (unsaved) operator op on this cell, if any. */
    pending: MatrixCellOp | null;
    /**
     * Value the UI should display as effective right now (pending wins).
     * NULL = honestly indeterminate: a pending `clear` on an operator-resolved
     * cell reverts to a server default the client cannot know until saved —
     * asserting on/off there would hide a grant (never re-derive policy).
     */
    effective_value: boolean | null;
    /** Whether the operator can act on this cell at all. */
    interactive: boolean;
    /**
     * True when the only honest affordance is an explicit approval act
     * (trust_gated + requires_review): enabling IS the approval.
     */
    approval_required: boolean;
    /**
     * True when the grant is real/editable but no executor consumes it yet
     * (cell.executable === false): render a "standing config" cue, keep edits.
     */
    standing_config: boolean;
    /** Server-verbatim reason to display for non-interactive / gated cells. */
    reason: string | null;
    /** The rendering decision (see MatrixCellControl). */
    control: MatrixCellControl;
};
/**
 * Resolve what one cell should render as, given the server payload and the
 * pending (unsaved) patch list. Pure; both the React wrapper and the served
 * console call this instead of re-deriving. Linear scans are deliberate:
 * entity configs are tens of rows x a handful of phases — if a consumer ever
 * renders thousands of cells, add an indexed resolve-all pass then, not now.
 */
export declare function resolveCellView(payload: MatrixPayload, patches: MatrixCellPatch[], section_id: string, item_id: string, phase_id: string): MatrixCellView;
/**
 * Apply one operator act to the pending patch list. Replace-per-cell
 * semantics; ops that restate the SERVER state (e.g. clear on an unassigned
 * cell) drop the pending entry instead of storing a no-op. Refuses acts on
 * non-interactive cells (returns the list unchanged) so a broken caller
 * cannot queue a patch the door would refuse.
 */
export declare function applyCellAction(payload: MatrixPayload, patches: MatrixCellPatch[], patch: MatrixCellPatch): MatrixCellPatch[];
/**
 * Drop pending patches that no longer target a live, actionable cell in the
 * CURRENT payload (adversary finding 2026-07-11: after a payload refresh an
 * orphaned patch was invisible in the grid yet still counted as an unsaved
 * change and still transmitted on save). Call on every payload change;
 * serializeCellPatches applies the same filter as defense in depth.
 */
export declare function reconcilePatches(payload: MatrixPayload, patches: MatrixCellPatch[]): MatrixCellPatch[];
export type MatrixPatchDocument = {
    schema_version: number;
    patches: MatrixCellPatch[];
};
/**
 * Wire shape for the HTTP PATCH: cell-scoped entries only, absent = untouched.
 * The gateway applies each entry independently; there is no whole-document
 * write anywhere in this flow. Requires the CURRENT payload so orphaned/stale
 * patches (cells gone or no longer actionable after a refresh) are filtered
 * and duplicates deduped before anything reaches the wire.
 */
export declare function serializeCellPatches(payload: MatrixPayload, patches: MatrixCellPatch[]): MatrixPatchDocument;
//# sourceMappingURL=phase_capability_matrix_core.d.ts.map