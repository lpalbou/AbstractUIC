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
const VERIFY_SHAPED = /^(read_|list_|search_|get_|fetch_|skim_|head_|stat_|check_|verify_|analyze_|open_|diary_list|diary_read)/;
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
            axes.push({ id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: null, text: "—", reason: "no timing/volume fact this turn" });
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
            axes.push(usable.length
                ? { id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: usable.reduce((a, x) => a + x, 0) / usable.length, text }
                : { id: "effort", code: "EFF", label: "effort", color: "#e7b45a", value: null, text, reason: "first turns — no session baseline yet" });
        }
    }
    // ACT — tool rounds/calls (+ failure ticks)
    {
        const rounds = typeof f.tool_rounds === "number" ? f.tool_rounds : t.length ? undefined : undefined;
        const calls = t.length;
        const fails = t.filter((x) => x.ok === false).length;
        if (rounds === undefined && calls === 0) {
            axes.push({ id: "action", code: "ACT", label: "action", color: "#5eead4", value: typeof f.tool_rounds === "number" ? 0 : null, text: typeof f.tool_rounds === "number" ? "no tools this turn" : "—", reason: typeof f.tool_rounds === "number" ? undefined : "no tool facts this turn" });
        }
        else {
            const v = rel(rounds ?? calls, b.tool_rounds);
            const text = `${rounds ?? calls} round${(rounds ?? calls) === 1 ? "" : "s"}${calls ? ` · ${calls} call${calls === 1 ? "" : "s"}` : ""}${fails ? ` · ${fails} fail` : ""}`;
            axes.push(v !== null
                ? { id: "action", code: "ACT", label: "action", color: "#5eead4", value: v, text, marks: fails }
                : { id: "action", code: "ACT", label: "action", color: "#5eead4", value: null, text, reason: "first turns — no session baseline yet", marks: fails });
        }
    }
    // ATT — memories recalled (+ formed)
    {
        if (typeof f.memories_recalled !== "number") {
            axes.push({ id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: null, text: "—", reason: "no recall fact this turn" });
        }
        else {
            const v = rel(f.memories_recalled, b.memories_recalled);
            const formed = typeof f.memories_formed === "number" && f.memories_formed > 0 ? ` · +${f.memories_formed} formed` : "";
            const text = `${f.memories_recalled} recalled${formed}`;
            axes.push(v !== null
                ? { id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: v, text }
                : { id: "attention", code: "ATT", label: "attention", color: "#6ea8d8", value: null, text, reason: "first turns — no session baseline yet" });
        }
    }
    // RIG — verification-shaped share of calls + retry-after-failure
    {
        if (!t.length) {
            axes.push({ id: "rigor", code: "RIG", label: "rigor", color: "#c084dd", value: null, text: "no calls to read", reason: "rigor reads call names — zero calls this turn" });
        }
        else {
            const verify = t.filter((x) => VERIFY_SHAPED.test(x.name || "")).length;
            let retries = 0;
            for (let i = 1; i < t.length; i++) {
                if (t[i - 1].ok === false && t[i].name === t[i - 1].name)
                    retries++;
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
export function runningMedian(values, window = 12) {
    const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v)).slice(-window);
    if (!xs.length)
        return undefined;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}
