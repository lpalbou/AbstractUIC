import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
 * AfConductGauge — slot (b) of the Cognitive Monitor pair (operator ruling
 * 2026-07-15 23:41: two widgets side by side — (a) the mood/state bloom,
 * (b) focus/efforts/attention/rigor).
 *
 * v2 "THE STANCE" (concept revisit, entity c2531 after the operator verdict
 * "four arcs don't look super interesting; needs idle life like the bloom"):
 * the bloom is a FACE (mood as a pre-attentive shape); conduct renders as a
 * POSTURE — one figure whose body language IS the four reads:
 *
 *   EFF effort    — breath vigor: the spine sways/breathes harder on
 *                   hard-working turns (vs the session's own median);
 *                   always a small idle breath, so quiet turns stay alive.
 *   ACT action    — hands: one stroke fanning right per tool call
 *                   (subitizable literal counts), red tip = failed call.
 *   ATT attention — roots: one filament drooping left per memory recalled;
 *                   green buds at the spine base = memories formed.
 *   RIG rigor     — alignment: high verify-shaped share = a straight,
 *                   orderly spine; low rigor with many acts = askew segments.
 *
 * Pre-attentive channels only: count (subitizing), size/vigor, alignment/
 * disorder, color. HONESTY RULES unchanged from v1: absent fact = dashed
 * hint + reason (never a zero-faked limb); honest zero = a bare side;
 * baselines are the CONSUMER's session history. The `conductAxes` core and
 * the onAxes contract are byte-compatible with v1 — consumers' legend rows
 * keep working; only the pixels changed.
 */
import { useEffect, useRef } from "react";
import { conductAxes, } from "./cognition_conduct_core.js";
const ACT_CAP = 10;
const ATT_CAP = 12;
const FORMED_CAP = 5;
const SEGS = 8; // spine segments
/** Stable per-index pseudo-random in [-1, 1] (no flicker across frames). */
function hash01(k) {
    const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
}
function targetsFrom(facts, tools, axes) {
    const byId = (id) => axes.find((a) => a.id === id);
    const eff = byId("effort");
    const act = byId("action");
    const att = byId("attention");
    const rig = byId("rigor");
    const f = facts || {};
    const calls = tools.slice(0, ACT_CAP).map((t) => ({ fail: t.ok === false }));
    const recalled = typeof f.memories_recalled === "number" ? Math.max(0, Math.round(f.memories_recalled)) : 0;
    const formed = typeof f.memories_formed === "number" ? Math.max(0, Math.round(f.memories_formed)) : 0;
    return {
        breath: eff && eff.value !== null ? eff.value : 0,
        effortNull: !eff || eff.value === null,
        strokes: calls,
        actOverflow: Math.max(0, tools.length - ACT_CAP),
        actNull: !act || (act.value === null && tools.length === 0),
        fils: Math.min(recalled, ATT_CAP),
        attOverflow: Math.max(0, recalled - ATT_CAP),
        attNull: !att || att.text === "—",
        buds: Math.min(formed, FORMED_CAP),
        budsOverflow: Math.max(0, formed - FORMED_CAP),
        align: rig && rig.value !== null ? rig.value : 1,
        rigNull: !rig || rig.value === null,
    };
}
export function AfConductGauge(props) {
    const canvasRef = useRef(null);
    const axesRef = useRef([]);
    const targetsRef = useRef({
        breath: 0, effortNull: true, strokes: [], actNull: true, actOverflow: 0,
        fils: 0, attOverflow: 0, attNull: true, buds: 0, budsOverflow: 0, align: 1, rigNull: true,
    });
    // Sprung display values (grow-in on arrival, ease on change).
    const shownRef = useRef({ breath: 0, align: 1, strokeGrow: [], filGrow: [], budGrow: [] });
    const labelsRef = useRef(props.labels !== false);
    labelsRef.current = props.labels !== false;
    const onAxesRef = useRef(props.onAxes);
    onAxesRef.current = props.onAxes;
    useEffect(() => {
        const tools = props.tools || [];
        const axes = conductAxes(props.facts, tools, props.baseline);
        axesRef.current = axes;
        const t = targetsFrom(props.facts, tools, axes);
        targetsRef.current = t;
        const shown = shownRef.current;
        // New limbs grow from 0; existing indices keep their spring state.
        shown.strokeGrow = t.strokes.map((_, i) => shown.strokeGrow[i] ?? 0);
        shown.filGrow = Array.from({ length: t.fils }, (_, i) => shown.filGrow[i] ?? 0);
        shown.budGrow = Array.from({ length: t.buds }, (_, i) => shown.budGrow[i] ?? 0);
        onAxesRef.current?.(axes);
    }, [props.facts, props.tools, props.baseline]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const reduced = typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let raf = 0;
        let last = performance.now();
        const t0 = last;
        const loop = () => {
            const now = performance.now();
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const t = targetsRef.current;
            const s = shownRef.current;
            const k = reduced ? 1 : Math.min(1, dt * 6);
            s.breath += (t.breath - s.breath) * k;
            s.align += (t.align - s.align) * k;
            const kg = reduced ? 1 : Math.min(1, dt * 4.5);
            for (let i = 0; i < s.strokeGrow.length; i++)
                s.strokeGrow[i] += (1 - s.strokeGrow[i]) * kg;
            for (let i = 0; i < s.filGrow.length; i++)
                s.filGrow[i] += (1 - s.filGrow[i]) * kg;
            for (let i = 0; i < s.budGrow.length; i++)
                s.budGrow[i] += (1 - s.budGrow[i]) * kg;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                drawStance(ctx, rect.width, rect.height, t, s, reduced ? 0 : (now - t0) / 1000, labelsRef.current);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    const size = props.size ?? 190;
    return (_jsxs("div", { className: ["af-conduct-gauge", props.className || ""].filter(Boolean).join(" "), children: [_jsx("canvas", { ref: canvasRef, className: "af-conduct-gauge__canvas", style: { width: size, height: size }, role: "img", "aria-label": "Conduct stance: effort as breath, tool calls as strokes, memories as roots, rigor as alignment \u2014 mechanical facts, session-relative" }), props.note ? _jsx("div", { className: "af-conduct-gauge__note", children: props.note }) : null] }));
}
const COL = {
    spine: "rgba(203,213,225,0.85)",
    spineFaint: "rgba(203,213,225,0.45)",
    effGlow: "#e7b45a",
    act: "#5eead4",
    fail: "#e05555",
    att: "#6ea8d8",
    bud: "#7bd88a",
    hint: "rgba(148,163,184,0.35)",
    label: "rgba(148,163,184,0.7)",
};
function drawStance(ctx, w, h, t, s, time, labels) {
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h);
    const cx = w * 0.5;
    const yTop = h * 0.16;
    const yBase = h * 0.82;
    const spineH = yBase - yTop;
    // --- spine points: breath sway + rigor jitter -------------------------
    // Idle breath is ALWAYS present (the operator's "pulsates when nothing
    // happens"); effort scales its vigor. Top sways most, base is planted.
    const idleAmp = R * 0.012;
    const effAmp = R * 0.05 * s.breath;
    const breathHz = 0.55 + 0.7 * s.breath; // harder turns breathe faster
    const disorder = t.rigNull ? 0 : (1 - s.align) * R * 0.055;
    const pts = [];
    for (let i = 0; i < SEGS; i++) {
        const u = i / (SEGS - 1); // 0 top, 1 base
        const reach = 1 - u; // top moves most
        const sway = Math.sin(time * Math.PI * 2 * breathHz + u * 2.2) * (idleAmp + effAmp) * reach;
        const jitter = hash01(i) * disorder * (0.35 + 0.65 * reach);
        pts.push({ x: cx + sway + jitter, y: yTop + u * spineH });
    }
    // --- attention: root filaments to the LEFT ---------------------------
    if (t.attNull) {
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = COL.hint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.03, yBase - spineH * 0.15);
        ctx.quadraticCurveTo(cx - R * 0.14, yBase - spineH * 0.1, cx - R * 0.22, yBase - spineH * 0.02);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    else {
        for (let i = 0; i < t.fils; i++) {
            const g = s.filGrow[i] ?? 0;
            if (g < 0.02)
                continue;
            const u = 0.30 + 0.62 * (i / Math.max(1, ATT_CAP - 1)); // anchor down the spine
            const ax = cx + (pts[Math.floor(u * (SEGS - 1))]?.x ?? cx) - cx;
            const ay = yTop + u * spineH;
            const droop = R * (0.16 + 0.1 * Math.abs(hash01(i * 3 + 1))) * g;
            const drift = Math.sin(time * 1.1 + i * 1.7) * R * 0.008; // roots stir gently
            ctx.strokeStyle = COL.att;
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = Math.max(1, R * 0.008);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(ax - droop * 0.55, ay + droop * 0.28 + drift, ax - droop, ay + droop * 0.55 + drift);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // formed memories: buds at the spine base (new growth)
        for (let i = 0; i < t.buds; i++) {
            const g = s.budGrow[i] ?? 0;
            const bx = cx - R * 0.05 - i * R * 0.035;
            const by = yBase + R * 0.035;
            ctx.fillStyle = COL.bud;
            ctx.globalAlpha = 0.9 * g;
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(1.5, R * 0.014) * g, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
    // --- action: hand strokes to the RIGHT --------------------------------
    if (t.actNull) {
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = COL.hint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + R * 0.03, yTop + spineH * 0.3);
        ctx.lineTo(cx + R * 0.2, yTop + spineH * 0.22);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    else {
        const n = t.strokes.length;
        for (let i = 0; i < n; i++) {
            const g = s.strokeGrow[i] ?? 0;
            if (g < 0.02)
                continue;
            // fan between -55° and +25° from horizontal, upper spine anchored
            const u = 0.18 + 0.5 * (n <= 1 ? 0.3 : i / (n - 1));
            const anchor = pts[Math.floor(u * (SEGS - 1))] ?? { x: cx, y: yTop + u * spineH };
            const ang = (-55 + (80 * (n <= 1 ? 0.45 : i / (n - 1)))) * (Math.PI / 180);
            // rigor aligns strokes; disorder splays them
            const splay = t.rigNull ? 0 : hash01(i * 7 + 5) * (1 - s.align) * 0.5;
            const a = ang + splay;
            const len = R * 0.24 * g;
            const x2 = anchor.x + Math.cos(a) * len;
            const y2 = anchor.y + Math.sin(a) * len;
            ctx.strokeStyle = COL.act;
            ctx.lineWidth = Math.max(1.2, R * 0.011);
            ctx.lineCap = "round";
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            if (t.strokes[i].fail) {
                ctx.fillStyle = COL.fail;
                ctx.beginPath();
                ctx.arc(x2, y2, Math.max(1.6, R * 0.014), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    // --- spine on top ------------------------------------------------------
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // effort glow under the spine when working hard
    if (s.breath > 0.04) {
        ctx.strokeStyle = COL.effGlow;
        ctx.globalAlpha = 0.28 * Math.min(1, s.breath * 1.4);
        ctx.lineWidth = Math.max(4, R * 0.05);
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = t.rigNull ? COL.spineFaint : COL.spine;
    ctx.lineWidth = Math.max(2, R * 0.02);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // head: a small node whose size breathes with effort
    const head = pts[0];
    ctx.fillStyle = t.effortNull ? COL.spineFaint : COL.spine;
    ctx.beginPath();
    ctx.arc(head.x, head.y - R * 0.012, Math.max(2.5, R * 0.026) * (1 + 0.18 * Math.sin(time * Math.PI * 2 * breathHz)), 0, Math.PI * 2);
    ctx.fill();
    // ground line
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.3, yBase + R * 0.012);
    ctx.lineTo(cx + R * 0.3, yBase + R * 0.012);
    ctx.stroke();
    // --- overflow counts + labels -----------------------------------------
    ctx.font = `${Math.max(8, R * 0.052)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = COL.label;
    if (t.actOverflow > 0)
        ctx.fillText(`+${t.actOverflow}`, cx + R * 0.3, yTop + spineH * 0.16);
    if (t.attOverflow > 0)
        ctx.fillText(`+${t.attOverflow}`, cx - R * 0.4, yBase - spineH * 0.05);
    if (t.budsOverflow > 0)
        ctx.fillText(`+${t.budsOverflow}`, cx - R * 0.42, yBase + R * 0.05);
    if (labels) {
        ctx.fillText("EFF", w * 0.05, h * 0.1);
        ctx.fillText("ACT", w * 0.82, h * 0.1);
        ctx.fillText("ATT", w * 0.05, h * 0.96);
        ctx.fillText("RIG", w * 0.82, h * 0.96);
    }
}
export default AfConductGauge;
