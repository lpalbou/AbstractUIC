/*
 * PhaseCapabilityMatrix core: framework-free validation, cell-view resolution
 * and patch bookkeeping for the gateway-owned entity configuration object
 * (plans/entity-config-object.md, commons c679/c682/c685 contract).
 *
 * Why a separate module with ZERO imports: the gateway console is
 * served-generated HTML that cannot import a React build. If this logic lived
 * inside the component, the console would re-derive it and drift (the exact
 * bug class the config-object wave exists to kill). React apps use the thin
 * wrapper in phase_capability_matrix.tsx; the console consumes the compiled
 * dist JS of THIS module — one implementation of resolution/patch semantics.
 *
 * Design pins (from the consensus thread):
 * - PATCH UNIT = CELL (phase x capability). Absent = untouched. Explicit deny
 *   is distinct from clear-to-default, or a matrix UI misrepresents the model.
 * - The UI renders SERVER truth (per-cell provenance/availability/reason) and
 *   never re-derives policy client-side.
 * - structurally_unavailable and trust_gated(blocked) cells are never
 *   interactive (a toggle there is a phantom promise the door refuses).
 * - trust_gated(requires_review): enabling IS the operator's approval act —
 *   interactive, but rendered as an approval, never a plain on-toggle.
 * - schema_version gate: unknown MAJOR versions refuse loudly (a grant-rendering
 *   UI misreading a breaking schema change misrenders SECURITY state).
 * - GRANTABLE and EXECUTABLE are two axes (observer c702, sleep precedent):
 *   a cell may hold a REAL, editable grant that no executor consumes yet
 *   ("standing config", the ruled config-for-the-future behavior). That is
 *   `executable: false` on an otherwise interactive cell — never conflated
 *   with structurally_unavailable, which means "cannot be granted at all".
 *
 * AGGREGATION PIN for the gateway (observer c702, runtime None-vs-() model):
 * cell patches apply per cell; when every assigned cell of a phase has been
 * cleared, the stored phase section folds to ABSENT (= defaults), never to a
 * materialized empty list (tools: [] means DENY-ALL, a different word).
 */
export const MATRIX_SCHEMA_VERSION = 1;
function is_record(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
const AVAILABILITIES = [
    "granted",
    "denied",
    "structurally_unavailable",
    "trust_gated",
];
const TRUST_STATES = ["attachable", "requires_review", "blocked"];
const PROVENANCES = ["default", "operator", "structural"];
const VALID_OPS = ["grant", "deny", "clear"];
/**
 * Object keys that collide with the JS prototype chain. A hostile payload
 * declaring a phase named "__proto__" would otherwise write through the
 * cells map's prototype instead of an own property.
 */
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);
function validate_cell(raw, where) {
    if (!is_record(raw))
        return { ok: false, reason: `${where}: cell is not an object` };
    const availability = String(raw.availability || "");
    if (!AVAILABILITIES.includes(availability)) {
        return { ok: false, reason: `${where}: unknown availability "${availability}"` };
    }
    const provenance = String(raw.provenance || "");
    if (!PROVENANCES.includes(provenance)) {
        return { ok: false, reason: `${where}: unknown provenance "${provenance}"` };
    }
    let trust_state;
    if (availability === "trust_gated") {
        const ts = String(raw.trust_state || "");
        if (!TRUST_STATES.includes(ts)) {
            return { ok: false, reason: `${where}: trust_gated cell without a valid trust_state ("${ts}")` };
        }
        trust_state = ts;
    }
    // Booleans refuse non-boolean PRESENCE loudly, like the enums above do:
    // a serializer emitting "true" (string) must never silently read as false —
    // the operator's stored word would render as "Default" and the no-op
    // collapse in applyCellAction would misfire (0008, adversary F20). Absent
    // keys keep their documented defaults.
    for (const key of ["assigned", "resolved_value", "executable"]) {
        const v = raw[key];
        if (v !== undefined && typeof v !== "boolean") {
            return { ok: false, reason: `${where}: "${key}" is present but not a boolean` };
        }
    }
    return {
        ok: true,
        cell: {
            assigned: raw.assigned === true,
            resolved_value: raw.resolved_value === true,
            provenance: provenance,
            availability: availability,
            executable: raw.executable !== false,
            reason: typeof raw.reason === "string" ? raw.reason : undefined,
            trust_state,
        },
    };
}
/**
 * Validate a server payload. Unknown MAJOR schema versions refuse loudly —
 * the caller renders the refusal as a labeled degraded view, never a guess.
 * Unknown EXTRA fields anywhere are tolerated (additive evolution is free).
 */
export function validateMatrixPayload(raw) {
    if (!is_record(raw))
        return { ok: false, reason: "payload is not an object" };
    const version = raw.schema_version;
    if (typeof version !== "number" || !Number.isFinite(version)) {
        return { ok: false, reason: "payload has no numeric schema_version" };
    }
    if (Math.floor(version) !== MATRIX_SCHEMA_VERSION) {
        return {
            ok: false,
            reason: `unsupported schema_version ${version} (this build understands ${MATRIX_SCHEMA_VERSION}); refusing to render grant state from an unknown schema`,
        };
    }
    if (!Array.isArray(raw.phases) || raw.phases.length === 0) {
        return { ok: false, reason: "payload has no phases" };
    }
    if (!Array.isArray(raw.sections)) {
        return { ok: false, reason: "payload has no sections" };
    }
    const phases = [];
    const phase_ids = new Set();
    for (const p of raw.phases) {
        if (!is_record(p) || typeof p.id !== "string" || !p.id.trim()) {
            return { ok: false, reason: "phase without a string id" };
        }
        const id = p.id.trim();
        if (RESERVED_IDS.has(id))
            return { ok: false, reason: `reserved phase id "${id}"` };
        if (phase_ids.has(id))
            return { ok: false, reason: `duplicate phase id "${id}"` };
        phase_ids.add(id);
        phases.push({
            id,
            label: typeof p.label === "string" ? p.label : undefined,
            hint: typeof p.hint === "string" ? p.hint : undefined,
        });
    }
    const sections = [];
    const section_ids = new Set();
    for (const s of raw.sections) {
        if (!is_record(s) || typeof s.id !== "string" || !s.id.trim()) {
            return { ok: false, reason: "section without a string id" };
        }
        const sid = s.id.trim();
        if (section_ids.has(sid))
            return { ok: false, reason: `duplicate section id "${sid}"` };
        section_ids.add(sid);
        if (!Array.isArray(s.items))
            return { ok: false, reason: `section "${sid}" has no items array` };
        const items = [];
        const item_ids = new Set();
        for (const it of s.items) {
            if (!is_record(it) || typeof it.id !== "string" || !it.id.trim()) {
                return { ok: false, reason: `section "${sid}": item without a string id` };
            }
            const iid = it.id.trim();
            if (item_ids.has(iid))
                return { ok: false, reason: `section "${sid}": duplicate item id "${iid}"` };
            item_ids.add(iid);
            // cells may be OMITTED (an all-absent row is expressible) but a present
            // non-object is a malformed payload — refuse loudly, never coerce.
            if (it.cells !== undefined && !is_record(it.cells)) {
                return { ok: false, reason: `section "${sid}" item "${iid}": cells is not an object` };
            }
            // Null prototype: a phase id like "constructor" must always be an own
            // property write, never a prototype-chain surprise.
            const cells = Object.create(null);
            const raw_cells = is_record(it.cells) ? it.cells : {};
            for (const [phase_id, raw_cell] of Object.entries(raw_cells)) {
                if (!phase_ids.has(phase_id)) {
                    // A cell for a phase the payload does not declare is a server bug;
                    // refusing beats silently dropping grant state.
                    return { ok: false, reason: `section "${sid}" item "${iid}": cell for undeclared phase "${phase_id}"` };
                }
                const checked = validate_cell(raw_cell, `section "${sid}" item "${iid}" phase "${phase_id}"`);
                if (!checked.ok)
                    return checked;
                cells[phase_id] = checked.cell;
            }
            items.push({
                id: iid,
                label: typeof it.label === "string" ? it.label : undefined,
                description: typeof it.description === "string" ? it.description : undefined,
                cells,
            });
        }
        sections.push({ id: sid, label: typeof s.label === "string" ? s.label : undefined, items });
    }
    return { ok: true, payload: { schema_version: MATRIX_SCHEMA_VERSION, phases, sections } };
}
function pending_for(patches, section, item, phase) {
    for (const p of patches) {
        if (p.section === section && p.item === item && p.phase === phase)
            return p.op;
    }
    return null;
}
/**
 * Resolve what one cell should render as, given the server payload and the
 * pending (unsaved) patch list. Pure; both the React wrapper and the served
 * console call this instead of re-deriving. Linear scans are deliberate:
 * entity configs are tens of rows x a handful of phases — if a consumer ever
 * renders thousands of cells, add an indexed resolve-all pass then, not now.
 */
export function resolveCellView(payload, patches, section_id, item_id, phase_id) {
    const section = payload.sections.find((s) => s.id === section_id);
    const item = section?.items.find((i) => i.id === item_id);
    const cell = item ? item.cells[phase_id] || null : null;
    const pending = pending_for(patches, section_id, item_id, phase_id);
    if (!cell) {
        // Server said nothing about this phase for this item: render unavailable,
        // never invent a toggle for state the server did not declare.
        return {
            cell: null,
            pending: null,
            effective_value: false,
            interactive: false,
            approval_required: false,
            standing_config: false,
            reason: "not declared by the server for this phase",
            control: { kind: "absent" },
        };
    }
    const structurally_blocked = cell.availability === "structurally_unavailable" ||
        (cell.availability === "trust_gated" && cell.trust_state === "blocked");
    let effective = cell.resolved_value;
    if (pending === "grant")
        effective = true;
    else if (pending === "deny")
        effective = false;
    else if (pending === "clear") {
        // Clearing reverts to the server default. When the resolution source was
        // the DEFAULT (or STRUCTURE, which wins regardless of the operator word),
        // the displayed value is already that truth. When the OPERATOR's word was
        // the resolution source, removing it reveals a default only the server
        // knows — honest display is indeterminate (null), never a guessed off.
        effective = cell.provenance === "operator" ? null : cell.resolved_value;
    }
    const approval_required = cell.availability === "trust_gated" && cell.trust_state === "requires_review";
    const effective_value = structurally_blocked ? false : effective;
    let control;
    if (structurally_blocked) {
        control = {
            kind: "blocked",
            blocked_kind: cell.availability === "trust_gated" ? "trust" : "structural",
        };
    }
    else if (approval_required && effective_value !== true) {
        control = { kind: "approval" };
    }
    else {
        control = {
            kind: "tristate",
            options: ["grant", "clear", "deny"],
            active_op: pending !== null ? pending : cell.assigned ? (cell.resolved_value ? "grant" : "deny") : "clear",
        };
    }
    return {
        cell,
        pending,
        effective_value,
        interactive: !structurally_blocked,
        approval_required,
        standing_config: !structurally_blocked && cell.executable === false,
        reason: cell.reason || (structurally_blocked ? cell.availability : null),
        control,
    };
}
/**
 * Apply one operator act to the pending patch list. Replace-per-cell
 * semantics; ops that restate the SERVER state (e.g. clear on an unassigned
 * cell) drop the pending entry instead of storing a no-op. Refuses acts on
 * non-interactive cells (returns the list unchanged) so a broken caller
 * cannot queue a patch the door would refuse.
 */
export function applyCellAction(payload, patches, patch) {
    const view = resolveCellView(payload, patches, patch.section, patch.item, patch.phase);
    if (!view.cell || !view.interactive)
        return patches;
    const rest = patches.filter((p) => !(p.section === patch.section && p.item === patch.item && p.phase === patch.phase));
    const cell = view.cell;
    if (patch.op === "clear") {
        // Clear = "remove my word". If the server has no stored word either,
        // there is nothing to send.
        if (!cell.assigned)
            return rest;
        return [...rest, patch];
    }
    // grant/deny that restates an already-ASSIGNED server word of the same value
    // is a no-op (nothing to save); matching a DEFAULT is still a real act —
    // it stores the operator's word where only a default existed. The collapse
    // applies ONLY when the operator's word IS the resolution source: on an
    // assigned cell resolved structurally, resolved_value is the structure's
    // value, not the stored word, so restating is still a real change (adversary
    // finding 2026-07-11).
    const same_as_server = cell.assigned &&
        cell.provenance === "operator" &&
        cell.resolved_value === (patch.op === "grant");
    if (same_as_server)
        return rest;
    return [...rest, patch];
}
/**
 * Drop pending patches that no longer target a live, actionable cell in the
 * CURRENT payload (adversary finding 2026-07-11: after a payload refresh an
 * orphaned patch was invisible in the grid yet still counted as an unsaved
 * change and still transmitted on save). Call on every payload change;
 * serializeCellPatches applies the same filter as defense in depth.
 */
export function reconcilePatches(payload, patches) {
    const seen = new Set();
    const out = [];
    for (const p of patches) {
        // Externally supplied lists (restored drafts, test fixtures, broken
        // callers) are validated like server payloads: an op outside the enum
        // must never reach the wire (0008 — applyCellAction only mints valid
        // ops, so dropping here matches this filter's orphan-drop contract).
        if (!is_record(p) || !VALID_OPS.includes(p.op))
            continue;
        const key = `${p.section}\u0000${p.item}\u0000${p.phase}`;
        if (seen.has(key))
            continue; // first wins, matching pending_for's read
        seen.add(key);
        const view = resolveCellView(payload, [], p.section, p.item, p.phase);
        if (!view.cell || !view.interactive)
            continue;
        out.push(p);
    }
    return out;
}
/**
 * Wire shape for the HTTP PATCH: cell-scoped entries only, absent = untouched.
 * The gateway applies each entry independently; there is no whole-document
 * write anywhere in this flow. Requires the CURRENT payload so orphaned/stale
 * patches (cells gone or no longer actionable after a refresh) are filtered
 * and duplicates deduped before anything reaches the wire.
 */
export function serializeCellPatches(payload, patches) {
    return {
        schema_version: MATRIX_SCHEMA_VERSION,
        patches: reconcilePatches(payload, patches).map((p) => ({
            section: p.section,
            item: p.item,
            phase: p.phase,
            op: p.op,
        })),
    };
}
