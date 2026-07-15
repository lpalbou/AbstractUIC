export type CriticalActionFact = {
    label: string;
    value: string;
};
export type CriticalActionFacts = {
    /** Server-supplied blast-radius rows (e.g. stored-vector count, recompute cost). */
    facts: CriticalActionFact[];
    /** The server's consequence sentence (e.g. the invalidation statement). */
    consequence: string;
};
export type CriticalActionGateInput = {
    /** Facts from the server; null/undefined when an older gateway omits them. */
    facts: CriticalActionFacts | null | undefined;
    /**
     * Explicit consumer opt-in to proceed WITHOUT server facts. Degraded mode is
     * labeled; it is never the silent default.
     */
    allowDegradedProceed: boolean;
    /** Typed-confirm phrase (strictly OPT-IN per the ceremony-is-not-honesty ruling). */
    confirmPhrase: string | null | undefined;
    /** What the operator typed so far (empty when no phrase is required). */
    typedText: string;
    busy: boolean;
};
export type CriticalActionGate = {
    confirmEnabled: boolean;
    /** Human-readable reason the confirm is disabled (null when enabled). */
    disabledReason: string | null;
    /** True when proceeding would be a labeled degraded (#FALLBACK) act. */
    degraded: boolean;
    /** Label the confirm button honestly in degraded mode. */
    degradedLabel: string | null;
};
/**
 * Normalize server-supplied facts into a shape that is safe to RENDER.
 * Returns null when the payload does not meet the floor: a non-empty
 * consequence sentence (the server's own statement of what this action does).
 * Fact rows are supporting data — malformed rows are dropped, a missing rows
 * array normalizes to [] (the consequence is the load-bearing fact; whether a
 * given action also needs rows is the server's call, stated in its sentence).
 * Adversary finding 2026-07-11: the dialog previously trusted the TypeScript
 * type over untyped server JSON and crashed on facts without a rows array.
 */
export declare function normalizeCriticalActionFacts(raw: unknown): CriticalActionFacts | null;
/**
 * Decide whether the confirm action is available and how it must be labeled.
 * Order matters: busy blocks everything; missing facts block unless the
 * consumer explicitly opted into labeled degraded proceed; the typed phrase
 * (when opted in) gates last.
 */
export declare function resolveCriticalActionGate(input: CriticalActionGateInput): CriticalActionGate;
//# sourceMappingURL=critical_action_core.d.ts.map