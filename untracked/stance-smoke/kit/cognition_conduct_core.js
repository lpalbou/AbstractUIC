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
/** Read/check-shaped call names (verification-SHAPED — the deeds-lane
 * vocabulary; a name match is never a truth claim). */
// Verification-SHAPED call names. Word-boundary match, not prefix-anchored
// (entity dm#56: `web_search` — the single most common lookup on live
// entities — missed the old ^search_ prefix rule, so a 10-search turn
// read RIG 0/10 "verify-shaped"). A verb counts wherever it sits in the
// snake_case name; write/act verbs never match by construction.
const VERIFY_SHAPED = /(^|_)(read|list|search|get|fetch|skim|head|stat|check|verify|analyze|open|lookup|query|probe)(_|$)/;
/** Whether one call NAME is verification-shaped (the RIG vocabulary) —
 * exported so renderers can mark the individual calls (the stance's ringed
 * stroke tips) with the SAME rule the share is computed from. */
export function isVerifyShaped(name) {
    return VERIFY_SHAPED.test(name || "");
}
const rel = (v, med) => typeof med === "number" && med > 0 ? Math.max(0, Math.min(1, v / (2 * med))) : null;
function fmtMs(ms) {
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    const s = ms / 1000;
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}
export function conductAxes(facts, tools, baseline) {
    const f = facts || {};
    const t = tools || [];
    const b = baseline || {};
    const axes = [];
    // EFF — think time + output volume vs session baseline
    {
        const has = typeof f.think_ms === "number" || typeof f.tokens_out === "number";
        if (!has) {
            axes.push({ id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: null, text: "—", short: "—", reason: "no timing/volume fact this turn" });
        }
        else {
            const parts = [];
            if (typeof f.think_ms === "number")
                parts.push(rel(f.think_ms, b.think_ms));
            if (typeof f.tokens_out === "number")
                parts.push(rel(f.tokens_out, b.tokens_out));
            const usable = parts.filter((x) => x !== null);
            const text = [
                typeof f.think_ms === "number" ? fmtMs(f.think_ms) : null,
                typeof f.tokens_out === "number" ? `${Math.round(f.tokens_out)}tk` : null,
            ].filter(Boolean).join(" · ");
            const short = typeof f.think_ms === "number" ? fmtMs(f.think_ms) : `${Math.round(f.tokens_out)}tk`;
            axes.push(usable.length
                ? { id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: usable.reduce((a, x) => a + x, 0) / usable.length, text, short }
                : { id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: null, text, short, reason: "first turns — no session baseline yet" });
        }
    }
    // ACT — tool rounds/calls (+ failure ticks)
    {
        const rounds = typeof f.tool_rounds === "number" ? f.tool_rounds : undefined;
        const calls = t.length;
        const fails = t.filter((x) => x.ok === false).length;
        if (rounds === undefined && calls === 0) {
            // Reachable only with NO tool fact at all: a present-but-zero
            // tool_rounds is a number, so the honest zero ("0 rounds", value 0)
            // renders through the else branch below.
            axes.push({ id: "action", code: "ACT", label: "action", color: "#5eead4", value: null, text: "—", short: "—", reason: "no tool facts this turn" });
        }
        else {
            const v = rel(rounds ?? calls, b.tool_rounds);
            const text = `${rounds ?? calls} round${(rounds ?? calls) === 1 ? "" : "s"}${calls ? ` · ${calls} call${calls === 1 ? "" : "s"}` : ""}${fails ? ` · ${fails} fail` : ""}`;
            const short = `${rounds ?? calls}${fails ? `·${fails}✕` : ""}`;
            axes.push(v !== null
                ? { id: "action", code: "ACT", label: "action", color: "#5eead4", value: v, text, short, marks: fails }
                : { id: "action", code: "ACT", label: "action", color: "#5eead4", value: null, text, short, reason: "first turns — no session baseline yet", marks: fails });
        }
    }
    // ATT — memories recalled (+ formed)
    {
        if (typeof f.memories_recalled !== "number") {
            axes.push({ id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: null, text: "—", short: "—", reason: "no recall fact this turn" });
        }
        else {
            const v = rel(f.memories_recalled, b.memories_recalled);
            const formedN = typeof f.memories_formed === "number" && f.memories_formed > 0 ? f.memories_formed : 0;
            const text = `${f.memories_recalled} recalled${formedN ? ` · +${formedN} formed` : ""}`;
            const short = `${f.memories_recalled}${formedN ? `+${formedN}` : ""}`;
            axes.push(v !== null
                ? { id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: v, text, short }
                : { id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: null, text, short, reason: "first turns — no session baseline yet" });
        }
    }
    // RIG — verification-shaped share of calls + retry-after-failure
    {
        if (!t.length) {
            axes.push({ id: "rigor", code: "RIG", label: "rigor", color: "#c084dd", value: null, text: "no calls to read", short: "—", reason: "rigor reads call names — zero calls this turn" });
        }
        else {
            const verify = t.filter((x) => isVerifyShaped(x.name)).length;
            let retries = 0;
            for (let i = 1; i < t.length; i++) {
                if (t[i - 1].ok === false && t[i].name === t[i - 1].name)
                    retries++;
            }
            const share = verify / t.length;
            const text = `${verify}/${t.length} verify-shaped${retries ? ` · ${retries} retr${retries === 1 ? "y" : "ies"}` : ""}`;
            axes.push({ id: "rigor", code: "RIG", label: "rigor", color: "#c084dd", value: share, text, short: `${verify}/${t.length}`, marks: retries });
        }
    }
    return axes;
}
/** Running-median helper for consumers building session baselines: returns
 * the median of the last `window` finite values. */
export function runningMedian(values, window = 12) {
    const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v)).slice(-window);
    if (!xs.length)
        return undefined;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}
