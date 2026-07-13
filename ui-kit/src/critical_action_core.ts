/*
 * CriticalActionDialog core: framework-free confirm-gate decision logic.
 *
 * The dialog's contract is "facts, not vibes" (laurent c595: an embedding
 * change invalidates every stored vector and must carry a proper warning +
 * explicit approval). The confirm button's enablement is a pure decision so
 * dependency-free node tests can pin it without rendering React, and so a
 * served-HTML console could reuse the same gate.
 */

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
export function normalizeCriticalActionFacts(raw: unknown): CriticalActionFacts | null {
  if (typeof raw !== "object" || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const consequence = String(rec.consequence || "").trim();
  if (!consequence) return null;
  const rows: CriticalActionFact[] = [];
  if (Array.isArray(rec.facts)) {
    for (const f of rec.facts) {
      if (typeof f !== "object" || f === null) continue;
      const fr = f as Record<string, unknown>;
      const label = String(fr.label ?? "").trim();
      const value = String(fr.value ?? "").trim();
      if (!label && !value) continue;
      rows.push({ label, value });
    }
  }
  return { facts: rows, consequence };
}

function has_real_facts(facts: CriticalActionFacts | null | undefined): boolean {
  return normalizeCriticalActionFacts(facts) !== null;
}

/**
 * Decide whether the confirm action is available and how it must be labeled.
 * Order matters: busy blocks everything; missing facts block unless the
 * consumer explicitly opted into labeled degraded proceed; the typed phrase
 * (when opted in) gates last.
 */
export function resolveCriticalActionGate(input: CriticalActionGateInput): CriticalActionGate {
  if (input.busy) {
    return { confirmEnabled: false, disabledReason: "Action in progress.", degraded: false, degradedLabel: null };
  }

  const facts_ok = has_real_facts(input.facts);
  if (!facts_ok && !input.allowDegradedProceed) {
    return {
      confirmEnabled: false,
      disabledReason:
        "#FALLBACK: the server did not supply blast-radius facts for this action; confirmation is disabled (facts, not vibes).",
      degraded: true,
      degradedLabel: null,
    };
  }

  const phrase = String(input.confirmPhrase || "").trim();
  if (phrase) {
    const typed = String(input.typedText || "").trim();
    if (typed !== phrase) {
      return {
        confirmEnabled: false,
        disabledReason: `Type "${phrase}" to enable confirmation.`,
        degraded: !facts_ok,
        degradedLabel: !facts_ok ? "Proceed without server facts (#FALLBACK)" : null,
      };
    }
  }

  return {
    confirmEnabled: true,
    disabledReason: null,
    degraded: !facts_ok,
    degradedLabel: !facts_ok ? "Proceed without server facts (#FALLBACK)" : null,
  };
}
