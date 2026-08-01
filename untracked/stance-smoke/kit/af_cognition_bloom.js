import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
 * AfCognitionBloom — the Cognitive Monitor panel (words + effort).
 *
 * Co-designed with the entity seat (commons c2229→c2238;
 * decision:cognitive-monitor-contract-v1). Two diagrams, one data honesty:
 * the BLOOM shows what the words EXPRESS (nine registers incl. GRAVITY,
 * morph-gated breath, optional valence vignette); the EFFORT column shows
 * mechanical conduct facts (a different data class — deliberately not a
 * second bloom; absent field = absent row).
 *
 * Consumers: cognition-monitor pages (reference) + abstractentity chat tab
 * (second consumer — the absorb trigger). The entity app overlays its own
 * DOM 3-letter codes via labels={false}; codes ship in the core registers.
 */
import { useEffect, useRef } from "react";
import { createBloomState, drawBloomFrame, effortRows, setBloomTargets, tickBloom, } from "./cognition_bloom_core.js";
export function AfCognitionBloom(props) {
    const canvasRef = useRef(null);
    const stateRef = useRef(createBloomState());
    const readingRef = useRef(props.onReading);
    const optsRef = useRef(props.options || {});
    readingRef.current = props.onReading;
    optsRef.current = props.options || {};
    useEffect(() => {
        setBloomTargets(stateRef.current, props.scores || {});
    }, [props.scores]);
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
            const dt = (now - last) / 1000;
            last = now;
            tickBloom(stateRef.current, dt);
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
                ctx.clearRect(0, 0, rect.width, rect.height);
                const opts = { ...optsRef.current };
                if (reduced)
                    opts.reducedMotion = true;
                const reading = drawBloomFrame(ctx, rect.width, rect.height, stateRef.current, opts);
                readingRef.current?.(reading);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    const rows = effortRows(props.effort);
    const size = props.size ?? 260;
    return (_jsxs("div", { className: ["af-cognition-bloom", props.className || ""].filter(Boolean).join(" "), children: [_jsx("canvas", { ref: canvasRef, className: "af-cognition-bloom__canvas", style: { width: size, height: size }, role: "img", "aria-label": "Cognitive monitor bloom: expressed-register reading of the words (never a felt state)" }), rows.length > 0 ? (_jsxs("div", { className: "af-cognition-bloom__effort", "aria-label": "Effort facts (mechanical conduct)", children: [rows.map((r) => (_jsxs("div", { className: "af-cognition-bloom__effort-row", children: [_jsx("span", { className: "af-cognition-bloom__effort-label", children: r.label }), _jsx("span", { className: "af-cognition-bloom__effort-value", children: r.text })] }, r.key))), props.effortNote ? _jsx("div", { className: "af-cognition-bloom__effort-note", children: props.effortNote }) : null] })) : null] }));
}
export default AfCognitionBloom;
