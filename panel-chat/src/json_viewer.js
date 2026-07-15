import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
const FOLDED_DEPTH = 3;
const UNFOLDED_DEPTH = Number.MAX_SAFE_INTEGER;
function isJsonObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isJsonArray(value) {
    return Array.isArray(value);
}
function copyStringForJson(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
async function copyText(text) {
    const value = String(text || "");
    if (!value)
        return;
    try {
        await navigator.clipboard.writeText(value);
    }
    catch {
        const el = document.createElement("textarea");
        el.value = value;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
    }
}
function Token({ kind, children, }) {
    return _jsx("span", { className: `pc-json-token ${kind}`, children: children });
}
function JsonStringValue(props) {
    const rendered = JSON.stringify(props.value);
    const collapsible = rendered.length > 96 || rendered.includes("\\n") || rendered.includes("\\r") || rendered.includes("\\t");
    const [open, setOpen] = useState(!collapsible || props.expansionMode === "unfolded");
    useEffect(() => {
        if (!collapsible)
            return;
        setOpen(props.expansionMode === "unfolded");
    }, [collapsible, props.expansionMode, props.expansionVersion]);
    if (!collapsible)
        return _jsx(Token, { kind: "string", children: rendered });
    return (_jsxs("span", { className: `pc-json-string ${open ? "open" : "collapsed"}`, children: [_jsx("button", { type: "button", className: "pc-json-string__toggle", onClick: () => setOpen((v) => !v), "aria-label": open ? "Collapse string value" : "Expand string value", "aria-expanded": open, children: open ? "▾" : "▸" }), open ? (_jsx("span", { className: "pc-json-token string pc-json-string__value", children: rendered })) : (_jsxs("button", { type: "button", className: "pc-json-string__preview", onClick: () => setOpen(true), "aria-label": "Expand string value", children: [_jsx("span", { className: "pc-json-token string pc-json-string__preview_text", children: rendered }), _jsx("span", { className: "pc-json-string__suffix", children: "(...)" })] }))] }));
}
function renderPrimitive(value, expansionMode, expansionVersion) {
    if (value === null)
        return _jsx(Token, { kind: "null", children: "null" });
    if (typeof value === "string")
        return _jsx(JsonStringValue, { value: value, expansionMode: expansionMode, expansionVersion: expansionVersion });
    if (typeof value === "number")
        return _jsx(Token, { kind: "number", children: String(value) });
    if (typeof value === "boolean")
        return _jsx(Token, { kind: "boolean", children: value ? "true" : "false" });
    return _jsx(Token, { kind: "string", children: JSON.stringify(String(value)) });
}
function countSummary(value) {
    if (isJsonArray(value))
        return value.length === 1 ? "1 item" : `${value.length} items`;
    if (isJsonObject(value))
        return Object.keys(value).length === 1 ? "1 key" : `${Object.keys(value).length} keys`;
    return "";
}
function JsonNode(props) {
    const { label, value, depth, collapseAfterDepth, expansionMode, expansionVersion, trailingComma } = props;
    const indentPx = depth * 14;
    const isObject = isJsonObject(value);
    const isArray = isJsonArray(value);
    const isContainer = isObject || isArray;
    const defaultOpen = depth < collapseAfterDepth;
    const [open, setOpen] = useState(defaultOpen);
    useEffect(() => {
        setOpen(defaultOpen);
    }, [defaultOpen, expansionVersion]);
    const prefix = label ? (_jsxs(_Fragment, { children: [_jsx(Token, { kind: "key", children: JSON.stringify(label) }), ": "] })) : null;
    if (!isContainer) {
        return (_jsxs("div", { className: "pc-json-viewer__line", style: { paddingLeft: indentPx }, children: [prefix, renderPrimitive(value, expansionMode, expansionVersion), trailingComma ? "," : ""] }));
    }
    const containerOpen = isArray ? "[" : "{";
    const containerClose = isArray ? "]" : "}";
    const summaryText = countSummary(value);
    const summaryValue = open ? `${containerOpen}` : `${containerOpen}…${containerClose}${summaryText ? `  (${summaryText})` : ""}`;
    const entries = isArray
        ? value.map((v, i) => ({ key: String(i), label: undefined, value: v }))
        : Object.entries(value).map(([k, v]) => ({ key: k, label: k, value: v }));
    return (_jsxs("details", { className: "pc-json-viewer__details", open: open, onToggle: (e) => setOpen(e.currentTarget.open), children: [_jsxs("summary", { className: "pc-json-viewer__summary", style: { paddingLeft: indentPx }, children: [prefix, _jsx("span", { className: "pc-json-viewer__caret", "aria-hidden": "true", children: open ? "▾" : "▸" }), _jsx("span", { className: "pc-json-viewer__punct", children: summaryValue }), !open && trailingComma ? _jsx("span", { className: "pc-json-viewer__punct", children: "," }) : null] }), open ? (_jsx("div", { className: "pc-json-viewer__children", children: entries.length === 0 ? (_jsxs("div", { className: "pc-json-viewer__line", style: { paddingLeft: indentPx }, children: [_jsx("span", { className: "pc-json-viewer__punct", children: containerClose }), trailingComma ? "," : ""] })) : (_jsxs(_Fragment, { children: [entries.map((e, idx) => {
                            const isLast = idx === entries.length - 1;
                            return (_jsx(JsonNode, { label: e.label, value: e.value, depth: depth + 1, collapseAfterDepth: collapseAfterDepth, expansionMode: expansionMode, expansionVersion: expansionVersion, trailingComma: !isLast }, `${depth}:${label || "root"}:${e.key}`));
                        }), _jsxs("div", { className: "pc-json-viewer__line", style: { paddingLeft: indentPx }, children: [_jsx("span", { className: "pc-json-viewer__punct", children: containerClose }), trailingComma ? "," : ""] })] })) })) : null] }));
}
function tryParseJsonString(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return value;
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return value;
        }
    }
    return value;
}
export function JsonViewer(props) {
    const { value, className, showCopy = true } = props;
    const [expansion, setExpansion] = useState({ mode: "folded", version: 0 });
    // collapseAfterDepth is the consumer's folded-mode depth; it was accepted
    // and silently ignored until 2026-07-11 (adversary find) — honor it.
    const foldedDepth = typeof props.collapseAfterDepth === "number" && (Number.isFinite(props.collapseAfterDepth) || props.collapseAfterDepth === Infinity) && props.collapseAfterDepth >= 0
        ? (props.collapseAfterDepth === Infinity ? Number.MAX_SAFE_INTEGER : Math.trunc(props.collapseAfterDepth))
        : FOLDED_DEPTH;
    const collapseAfterDepth = expansion.mode === "unfolded" ? UNFOLDED_DEPTH : foldedDepth;
    // A string value that IS serialized JSON renders as its parsed tree
    // (parity with the monitor-flow/flow viewers; copy still copies the
    // original string verbatim).
    const displayValue = useMemo(() => (typeof value === "string" ? tryParseJsonString(value) : value), [value]);
    const copyValue = useMemo(() => copyStringForJson(value), [value]);
    const cls = ["pc-json-viewer", className].filter(Boolean).join(" ");
    useEffect(() => {
        setExpansion((prev) => ({ mode: "folded", version: prev.version + 1 }));
    }, [displayValue]);
    const toggleExpansion = () => {
        setExpansion((prev) => ({
            mode: prev.mode === "unfolded" ? "folded" : "unfolded",
            version: prev.version + 1,
        }));
    };
    return (_jsxs("div", { className: cls, children: [_jsxs("div", { className: "pc-json-viewer__toolbar", children: [_jsx("button", { type: "button", className: "pc-btn pc-json-viewer__toggle-all", onClick: toggleExpansion, "aria-expanded": expansion.mode === "unfolded", children: expansion.mode === "unfolded" ? "Fold all" : "Unfold all" }), showCopy ? (_jsx("button", { type: "button", className: "pc-btn pc-json-viewer__copy", onClick: () => void copyText(copyValue), children: "Copy" })) : null] }), _jsx("div", { className: "pc-json-viewer__tree", role: "tree", "aria-label": "JSON viewer", children: _jsx(JsonNode, { value: displayValue, depth: 0, collapseAfterDepth: collapseAfterDepth, expansionMode: expansion.mode, expansionVersion: expansion.version, trailingComma: false }) })] }));
}
