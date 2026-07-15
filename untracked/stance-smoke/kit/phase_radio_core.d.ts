/**
 * phase_radio_core — framework-free half of AfPhaseRadio (backlog 0027).
 *
 * Vocabulary: the RULED four phases (decision:phase-vocabulary v4 —
 * visit / work / personal / sleep; laurent 13:28 four-position radio,
 * 13:46 totality). The canonical machine-readable graph lives in
 * abstractentity/spec/entity_phases.json and is NEVER imported here — per
 * its own consumption contract (and uic c1478), UI surfaces render
 * gateway-DERIVED wire payloads verbatim; a library import would turn spec
 * versioning into lockstep UI releases. This module carries only the ruled
 * KEYS and their display defaults; anything outside the ruled set
 * normalizes to null and the radio honestly renders no position pushed.
 * RULED (laurent 2026-07-15 17:28, spec v4 / decision:no-awake-idle-node):
 * AWAKE is a STATE, never a phase — an alive entity is always in exactly
 * one of the four; a null here is a runtime COVERAGE GAP ("between phases —
 * the runtime has not settled it yet"), never a fifth position. The radio's
 * no-position rendering is therefore the correct honest display for it.
 */
export declare const RULED_PHASES: readonly ["visit", "work", "personal", "sleep"];
export type AfPhase = (typeof RULED_PHASES)[number];
export interface PhaseDescriptor {
    id: AfPhase;
    /** ONE primary label (spec UI contract: synonyms live in tooltips only). */
    label: string;
    glyph: string;
    /** Default tooltip when the consumer supplies none. Uses "current phase"
     * wording per the spec's UI contract. */
    defaultTitle: string;
}
export declare const PHASE_DESCRIPTORS: Record<AfPhase, PhaseDescriptor>;
/**
 * Normalize a wire value to a ruled phase key or null. STRICT by design:
 * the marker contract says phase KEYS travel on the wire ("visit", not
 * "visiting"); folding synonyms or state-axis words here would be a second
 * copy of vocabulary logic (the diary_type-clamp lesson). Unknown/absent
 * values render as "no position pushed" — honest, never guessed.
 */
export declare function normalizePhase(value: unknown): AfPhase | null;
/**
 * Validate a gateway-derived phase list against the ruled set. Returns the
 * usable ordered list plus the names it had to drop (consumers surface the
 * drops as a #FALLBACK line — drift between a server payload and the ruled
 * vocabulary must be visible, never silently absorbed).
 */
export declare function reconcilePhaseList(payload: unknown): {
    phases: AfPhase[];
    dropped: string[];
};
//# sourceMappingURL=phase_radio_core.d.ts.map