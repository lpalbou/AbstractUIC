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

/** Read/check-shaped call names (verification-SHAPED — the deeds-lane
 * vocabulary; a name match is never a truth claim). */
// Verification-SHAPED call names. Word-boundary match, not prefix-anchored
// (entity dm#56: `web_search` — the single most common lookup on live
// entities — missed the old ^search_ prefix rule, so a 10-search turn
// read RIG 0/10 "verify-shaped"). A verb counts wherever it sits in the
// snake_case name; write/act verbs never match by construction.
const VERIFY_SHAPED = /(^|_)(read|list|search|get|fetch|skim|head|stat|check|verify|analyze|open|lookup|query|probe)(_|$)/;

const rel = (v: number, med: number | undefined): number | null =>
  typeof med === "number" && med > 0 ? Math.max(0, Math.min(1, v / (2 * med))) : null;

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

export function conductAxes(
  facts: ConductFacts | null | undefined,
  tools: ConductToolCall[] | null | undefined,
  baseline: ConductBaseline | null | undefined,
): ConductAxis[] {
  const f = facts || {};
  const t = tools || [];
  const b = baseline || {};
  const axes: ConductAxis[] = [];

  // EFF — think time + output volume vs session baseline
  {
    const has = typeof f.think_ms === "number" || typeof f.tokens_out === "number";
    if (!has) {
      axes.push({ id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: null, text: "—", reason: "no timing/volume fact this turn" });
    } else {
      const parts: (number | null)[] = [];
      if (typeof f.think_ms === "number") parts.push(rel(f.think_ms, b.think_ms));
      if (typeof f.tokens_out === "number") parts.push(rel(f.tokens_out, b.tokens_out));
      const usable = parts.filter((x): x is number => x !== null);
      const text = [
        typeof f.think_ms === "number" ? fmtMs(f.think_ms) : null,
        typeof f.tokens_out === "number" ? `${Math.round(f.tokens_out)}tk` : null,
      ].filter(Boolean).join(" · ");
      axes.push(
        usable.length
          ? { id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: usable.reduce((a, x) => a + x, 0) / usable.length, text }
          : { id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: null, text, reason: "first turns — no session baseline yet" },
      );
    }
  }

  // ACT — tool rounds/calls (+ failure ticks)
  {
    const rounds = typeof f.tool_rounds === "number" ? f.tool_rounds : t.length ? undefined : undefined;
    const calls = t.length;
    const fails = t.filter((x) => x.ok === false).length;
    if (rounds === undefined && calls === 0) {
      axes.push({ id: "action", code: "ACT", label: "action", color: "#5eead4", value: typeof f.tool_rounds === "number" ? 0 : null, text: typeof f.tool_rounds === "number" ? "no tools this turn" : "—", reason: typeof f.tool_rounds === "number" ? undefined : "no tool facts this turn" });
    } else {
      const v = rel(rounds ?? calls, b.tool_rounds);
      const text = `${rounds ?? calls} round${(rounds ?? calls) === 1 ? "" : "s"}${calls ? ` · ${calls} call${calls === 1 ? "" : "s"}` : ""}${fails ? ` · ${fails} fail` : ""}`;
      axes.push(
        v !== null
          ? { id: "action", code: "ACT", label: "action", color: "#5eead4", value: v, text, marks: fails }
          : { id: "action", code: "ACT", label: "action", color: "#5eead4", value: null, text, reason: "first turns — no session baseline yet", marks: fails },
      );
    }
  }

  // ATT — memories recalled (+ formed)
  {
    if (typeof f.memories_recalled !== "number") {
      axes.push({ id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: null, text: "—", reason: "no recall fact this turn" });
    } else {
      const v = rel(f.memories_recalled, b.memories_recalled);
      const formed = typeof f.memories_formed === "number" && f.memories_formed > 0 ? ` · +${f.memories_formed} formed` : "";
      const text = `${f.memories_recalled} recalled${formed}`;
      axes.push(
        v !== null
          ? { id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: v, text }
          : { id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: null, text, reason: "first turns — no session baseline yet" },
      );
    }
  }

  // RIG — verification-shaped share of calls + retry-after-failure
  {
    if (!t.length) {
      axes.push({ id: "rigor", code: "RIG", label: "rigor", color: "#c084dd", value: null, text: "no calls to read", reason: "rigor reads call names — zero calls this turn" });
    } else {
      const verify = t.filter((x) => VERIFY_SHAPED.test(x.name || "")).length;
      let retries = 0;
      for (let i = 1; i < t.length; i++) {
        if (t[i - 1].ok === false && t[i].name === t[i - 1].name) retries++;
      }
      const share = verify / t.length;
      const text = `${verify}/${t.length} verify-shaped${retries ? ` · ${retries} retr${retries === 1 ? "y" : "ies"}` : ""}`;
      axes.push({ id: "rigor", code: "RIG", label: "rigor", color: "#c084dd", value: share, text, marks: retries });
    }
  }

  return axes;
}

/** Running-median helper for consumers building session baselines: returns
 * the median of the last `window` finite values. */
export function runningMedian(values: Array<number | undefined | null>, window = 12): number | undefined {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).slice(-window);
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
