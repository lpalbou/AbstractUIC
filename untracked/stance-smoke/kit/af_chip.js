import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TONE_HUES = {
    neutral: "var(--text-secondary)",
    muted: "var(--text-muted)",
    accent: "var(--accent)",
    info: "var(--info)",
    success: "var(--success)",
    warning: "var(--warning)",
    error: "var(--error)",
};
/** var() theme-token references only — the anti-refork ratchet. */
const VAR_REF = /^var\(--[a-z0-9-]+\)$/i;
export function afChipHue(tone, hue) {
    const t = tone || "neutral";
    if (t === "custom") {
        const raw = String(hue || "").trim();
        if (VAR_REF.test(raw))
            return raw;
        // Refuse raw colors: fall back to the neutral hue so a bad value renders
        // legibly instead of silently minting an off-theme color.
        return TONE_HUES.neutral;
    }
    return TONE_HUES[t] || TONE_HUES.neutral;
}
function chipClass(base, props, extra) {
    return [
        base,
        `${base}--${props.tone || "neutral"}`,
        props.size === "sm" ? `${base}--sm` : "",
        extra || "",
        props.className || "",
    ]
        .filter(Boolean)
        .join(" ");
}
function chipStyle(props) {
    return { ["--af-chip-hue"]: afChipHue(props.tone, props.hue) };
}
export function AfChip(props) {
    return (_jsxs("span", { className: chipClass("af-chip", props, props.onRemove ? "af-chip--removable" : ""), style: chipStyle(props), title: props.title, children: [_jsx("span", { className: "af-chip__label", children: props.children }), props.onRemove ? (_jsx("button", { type: "button", className: "af-chip__remove", "aria-label": props.removeLabel || "Remove", onClick: (e) => {
                    e.stopPropagation();
                    props.onRemove?.();
                }, children: _jsxs("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.6", strokeLinecap: "round", children: [_jsx("path", { d: "M18 6L6 18" }), _jsx("path", { d: "M6 6l12 12" })] }) })) : null] }));
}
export function AfChipButton(props) {
    return (_jsx("button", { type: "button", className: chipClass("af-chip", props, "af-chip--button"), style: chipStyle(props), title: props.title, onClick: props.onClick, "aria-pressed": typeof props.pressed === "boolean" ? props.pressed : undefined, "aria-expanded": typeof props.expanded === "boolean" ? props.expanded : undefined, "aria-label": props.ariaLabel, disabled: props.disabled, tabIndex: props.tabIndex, children: _jsx("span", { className: "af-chip__label", children: props.children }) }));
}
export default AfChip;
