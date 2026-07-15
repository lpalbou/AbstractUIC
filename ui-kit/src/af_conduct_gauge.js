import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
 * AfConductGauge — slot (b) of the Cognitive Monitor pair (operator ruling
 * 2026-07-15 23:41: two widgets side by side — (a) the mood/state bloom,
 * (b) focus/efforts/attention/rigor).
 *
 * Four concentric arcs (EFF/ACT/ATT/RIG) from MECHANICAL facts only —
 * the data a thin client already has per turn (entity c2469 constraints).
 * Square, defaults to 190px, same theming rules as AfCognitionBloom.
 * Absent fact = absent arc with the reason; session baselines are the
 * consumer's own history (runningMedian helper exported from the core).
 */
import { useEffect, useRef } from "react";
import { conductAxes, } from "./cognition_conduct_core";
export function AfConductGauge(props) {
    const canvasRef = useRef(null);
    const axesRef = useRef([]);
    const targetRef = useRef([0, 0, 0, 0]);
    const shownRef = useRef([0, 0, 0, 0]);
    const onAxesRef = useRef(props.onAxes);
    onAxesRef.current = props.onAxes;
    useEffect(() => {
        const axes = conductAxes(props.facts, props.tools || [], props.baseline);
        axesRef.current = axes;
        targetRef.current = axes.map((a) => (a.value === null ? 0 : a.value));
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
        const loop = () => {
            const now = performance.now();
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            // critically-damped-ish ease toward targets (no overshoot)
            for (let i = 0; i < 4; i++) {
                const d = targetRef.current[i] - shownRef.current[i];
                shownRef.current[i] += reduced ? d : d * Math.min(1, dt * 6);
            }
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
                draw(ctx, rect.width, rect.height, axesRef.current, shownRef.current);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    const size = props.size ?? 190;
    return (_jsxs("div", { className: ["af-conduct-gauge", props.className || ""].filter(Boolean).join(" "), children: [_jsx("canvas", { ref: canvasRef, className: "af-conduct-gauge__canvas", style: { width: size, height: size }, role: "img", "aria-label": "Conduct gauge: effort, action, attention, rigor \u2014 mechanical facts, session-relative" }), props.note ? _jsx("div", { className: "af-conduct-gauge__note", children: props.note }) : null] }));
}
function draw(ctx, w, h, axes, shown) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2;
    const start = -Math.PI * 0.75; // arcs sweep 270°, gap at the bottom
    const sweep = Math.PI * 1.5;
    const ringW = Math.max(6, R * 0.11);
    const gap = Math.max(3, R * 0.045);
    ctx.font = `${Math.max(8, R * 0.1)}px ui-monospace, Menlo, monospace`;
    axes.forEach((a, i) => {
        const r = R - ringW / 2 - 2 - i * (ringW + gap);
        // rail
        ctx.strokeStyle = "rgba(148,163,184,0.14)";
        ctx.lineWidth = ringW;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, start + sweep);
        ctx.stroke();
        if (a.value !== null) {
            const v = Math.max(0, Math.min(1, shown[i]));
            if (v > 0.005) {
                ctx.strokeStyle = a.color;
                ctx.beginPath();
                ctx.arc(cx, cy, r, start, start + sweep * v);
                ctx.stroke();
            }
            else {
                // an honest zero: a small dot at the arc start (present, empty)
                ctx.fillStyle = a.color;
                ctx.beginPath();
                ctx.arc(cx + Math.cos(start) * r, cy + Math.sin(start) * r, ringW * 0.32, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        else {
            // unreadable: dashed hint, never a filled arc
            ctx.setLineDash([2, 5]);
            ctx.strokeStyle = "rgba(148,163,184,0.28)";
            ctx.beginPath();
            ctx.arc(cx, cy, r, start, start + sweep * 0.12);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // failure/retry ticks at the arc end
        if (a.marks && a.value !== null) {
            for (let k = 0; k < Math.min(4, a.marks); k++) {
                const ang = start + sweep * Math.max(0.02, Math.min(1, shown[i])) + 0.09 + k * 0.09;
                ctx.fillStyle = "#e05555";
                ctx.beginPath();
                ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, ringW * 0.22, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // code label in the bottom gap, one per ring
        ctx.fillStyle = a.value === null ? "rgba(148,163,184,0.55)" : a.color;
        const lx = cx - R * 0.62 + i * R * 0.42;
        ctx.fillText(a.code, lx, cy + R * 0.92);
    });
}
export default AfConductGauge;
