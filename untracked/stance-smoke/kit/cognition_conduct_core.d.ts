/**
 * cognition_conduct_core — framework-free half of AfConductGauge: the
 * slot-(b) Cognitive Monitor widget (operator ruling 2026-07-15 23:41:
 * "TWO widgets side by side — (a) the mood/state bloom, (b) focus, efforts,
 * attention, rigor").
 *
 * Design constraints (entity c2469): square ~190px beside AfCognitionBloom,
 * per-turn LIVE, fed ONLY by mechanical facts a thin client has today —
 * tokens in/out, think wall-time, tool rounds + per-call names/ok,
 * memories recalled/formed. NO per-cycle step texts required (v1 needs no
 * new gateway data).
 *
 * THE FOUR READS (each an arc; grade-A mechanical, labeled):
 *   EFF effort    — think time + output volume, vs the session's own
 *                   running baseline (relative read, never absolute).
 *   ACT action    — tool rounds/calls this turn (+ failure ticks).
 *   ATT attention — memories recalled into context (+ formed as text).
 *   RIG rigor     — verification-SHAPED share of calls (read/check-class)
 *                   + retry-after-failure; never "verified truth".
 *
 * HONESTY RULES (the house set): absent fact = absent arc (never a
 * zero-faked reading); no baseline yet = value text without a filled arc
 * ("first turns — no baseline"); rigor is act-shaped vocabulary over call
 * NAMES, labeled as such; baselines are the CONSUMER's session history
 * (the component never invents one).
 */
export interface ConductFacts {
    tokens_in?: number;
    tokens_out?: number;
    /** Client-measured wall time is acceptable; consumers label it. */
    think_ms?: number;
    tool_rounds?: number;
    memories_recalled?: number;
    memories_formed?: number;
}
export interface ConductToolCall {
    name: string;
    ok?: boolean;
}
/** Session-relative baselines — medians of the consumer's own turn history.
 * All optional: a missing baseline downgrades that arc to text-only. */
export interface ConductBaseline {
    think_ms?: number;
    tokens_out?: number;
    tool_rounds?: number;
    memories_recalled?: number;
}
export type ConductAxisId = "effort" | "action" | "attention" | "rigor";
export interface ConductAxis {
    id: ConductAxisId;
    code: string;
    label: string;
    color: string;
    /** Arc fill in [0,1], or null when unreadable (absent fact / no baseline
     * where one is required). */
    value: number | null;
    /** Short human value text ("4.2s · 380tk", "3 rounds · 1 fail", "—"). */
    text: string;
    /** Present when the arc is null — the reason, rendered not hidden. */
    reason?: string;
    /** Extra marks (failure ticks, formed count). */
    marks?: number;
}
export declare function conductAxes(facts: ConductFacts | null | undefined, tools: ConductToolCall[] | null | undefined, baseline: ConductBaseline | null | undefined): ConductAxis[];
/** Running-median helper for consumers building session baselines: returns
 * the median of the last `window` finite values. */
export declare function runningMedian(values: Array<number | undefined | null>, window?: number): number | undefined;
//# sourceMappingURL=cognition_conduct_core.d.ts.map