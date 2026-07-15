import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Icons drawn on continuum's 16x16 grid (stroke 1.4) vs the kit's 24-grid (stroke 2). */
const GRID_16 = new Set(["board", "inbox", "server", "agent", "playCircle", "list", "gear"]);
function paths(name) {
    switch (name) {
        case "chat":
            return _jsx("path", { d: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" });
        case "plus":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 5v14" }), _jsx("path", { d: "M5 12h14" })] }));
        case "history":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M12 7v5l3 3" })] }));
        case "refresh":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M21 12a9 9 0 0 0-15.5-6.4L3 8" }), _jsx("path", { d: "M3 3v5h5" }), _jsx("path", { d: "M3 12a9 9 0 0 0 15.5 6.4L21 16" }), _jsx("path", { d: "M21 21v-5h-5" })] }));
        case "settings":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M4 6h16" }), _jsx("circle", { cx: "8", cy: "6", r: "2" }), _jsx("path", { d: "M4 12h16" }), _jsx("circle", { cx: "16", cy: "12", r: "2" }), _jsx("path", { d: "M4 18h16" }), _jsx("circle", { cx: "10", cy: "18", r: "2" })] }));
        case "user":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "8", r: "4" }), _jsx("path", { d: "M4 21a8 8 0 0 1 16 0" })] }));
        case "bot":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 2v3" }), _jsx("rect", { x: "5", y: "6", width: "14", height: "14", rx: "3" }), _jsx("circle", { cx: "9", cy: "13", r: "1", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "15", cy: "13", r: "1", fill: "currentColor", stroke: "none" }), _jsx("path", { d: "M9 17h6" })] }));
        case "paperclip":
            return (_jsx("path", { d: "M21.44 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" }));
        case "mic":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" }), _jsx("path", { d: "M19 11a7 7 0 0 1-14 0" }), _jsx("path", { d: "M12 18v4" }), _jsx("path", { d: "M8 22h8" })] }));
        case "speaker":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M11 5L6 9H2v6h4l5 4V5z" }), _jsx("path", { d: "M15.5 8.5a5 5 0 0 1 0 7" }), _jsx("path", { d: "M18 6a9 9 0 0 1 0 12" })] }));
        case "pause":
            return (_jsxs(_Fragment, { children: [_jsx("rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", fill: "currentColor", stroke: "none" }), _jsx("rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", fill: "currentColor", stroke: "none" })] }));
        case "terminal":
            return (_jsxs(_Fragment, { children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2", ry: "2" }), _jsx("path", { d: "M7 9l3 3-3 3" }), _jsx("path", { d: "M12 15h5" })] }));
        case "edit":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 20h9" }), _jsx("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" })] }));
        case "download":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), _jsx("path", { d: "M7 10l5 5 5-5" }), _jsx("path", { d: "M12 15V3" })] }));
        case "loader":
            return _jsx("path", { d: "M21 12a9 9 0 1 1-3.3-6.9" });
        case "info":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 16v-4" }), _jsx("circle", { cx: "12", cy: "8", r: "0.75", fill: "currentColor", stroke: "none" })] }));
        case "warning":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 3l10 18H2L12 3z" }), _jsx("path", { d: "M12 9v4" }), _jsx("circle", { cx: "12", cy: "17", r: "0.75", fill: "currentColor", stroke: "none" })] }));
        case "error":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M15 9l-6 6" }), _jsx("path", { d: "M9 9l6 6" })] }));
        case "copy":
            return (_jsxs(_Fragment, { children: [_jsx("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }), _jsx("path", { d: "M5 15V5a2 2 0 0 1 2-2h10" })] }));
        case "check":
            return _jsx("path", { d: "M20 6L9 17l-5-5" });
        case "x":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M18 6L6 18" }), _jsx("path", { d: "M6 6l12 12" })] }));
        case "chevronDown":
            return _jsx("path", { d: "M6 9l6 6 6-6" });
        case "chevronRight":
            return _jsx("path", { d: "M9 18l6-6-6-6" });
        case "trash":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M3 6h18" }), _jsx("path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }), _jsx("path", { d: "M6 6l1 16h10l1-16" }), _jsx("path", { d: "M10 11v6" }), _jsx("path", { d: "M14 11v6" })] }));
        case "send":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M22 2L11 13" }), _jsx("path", { d: "M22 2L15 22l-4-9-9-4 20-7z" })] }));
        case "board":
            return (_jsxs(_Fragment, { children: [_jsx("rect", { x: "1.5", y: "2", width: "3.6", height: "12", rx: "1" }), _jsx("rect", { x: "6.2", y: "2", width: "3.6", height: "8.5", rx: "1" }), _jsx("rect", { x: "10.9", y: "2", width: "3.6", height: "5.5", rx: "1" })] }));
        case "inbox":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M2 9.5 L4 3.5 h8 l2 6" }), _jsx("path", { d: "M2 9.5 v3 h12 v-3" }), _jsx("path", { d: "M2 9.5 h3.4 l1 1.6 h3.2 l1-1.6 H14" })] }));
        case "server":
            return (_jsxs(_Fragment, { children: [_jsx("rect", { x: "2", y: "2.5", width: "12", height: "4.6", rx: "1.2" }), _jsx("rect", { x: "2", y: "8.9", width: "12", height: "4.6", rx: "1.2" }), _jsx("circle", { cx: "4.6", cy: "4.8", r: "0.8", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "4.6", cy: "11.2", r: "0.8", fill: "currentColor", stroke: "none" })] }));
        case "agent":
            return (_jsxs(_Fragment, { children: [_jsx("rect", { x: "3", y: "4.5", width: "10", height: "8", rx: "2" }), _jsx("path", { d: "M8 4.5V2.2" }), _jsx("circle", { cx: "8", cy: "1.8", r: "0.9", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "5.8", cy: "8.4", r: "0.9", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "10.2", cy: "8.4", r: "0.9", fill: "currentColor", stroke: "none" })] }));
        case "playCircle":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "8", cy: "8", r: "6.2" }), _jsx("path", { d: "M6.5 5.6 L11 8 L6.5 10.4 Z", fill: "currentColor", stroke: "none" })] }));
        case "list":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M2.5 4h11" }), _jsx("path", { d: "M2.5 8h11" }), _jsx("path", { d: "M2.5 12h7" })] }));
        case "gear":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "8", cy: "8", r: "2.2" }), _jsx("path", { d: "M8 1.6v2" }), _jsx("path", { d: "M8 12.4v2" }), _jsx("path", { d: "M1.6 8h2" }), _jsx("path", { d: "M12.4 8h2" }), _jsx("path", { d: "M3.5 3.5l1.4 1.4" }), _jsx("path", { d: "M11.1 11.1l1.4 1.4" }), _jsx("path", { d: "M12.5 3.5l-1.4 1.4" }), _jsx("path", { d: "M4.9 11.1l-1.4 1.4" })] }));
        case "sparkle":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" }), _jsx("path", { d: "M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" })] }));
        case "contrast":
            return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M12 3a9 9 0 0 1 0 18z", fill: "currentColor", stroke: "none" })] }));
        case "logout":
            return (_jsxs(_Fragment, { children: [_jsx("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }), _jsx("path", { d: "M16 17l5-5-5-5" }), _jsx("path", { d: "M21 12H9" })] }));
        default:
            return null;
    }
}
export function Icon({ name, size = 16, className, title, ...props }) {
    const aria_hidden = title ? undefined : true;
    const is16 = GRID_16.has(name);
    return (_jsxs("svg", { width: size, height: size, viewBox: is16 ? "0 0 16 16" : "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: is16 ? 1.4 : 2, strokeLinecap: "round", strokeLinejoin: "round", className: className, "aria-hidden": aria_hidden, role: title ? "img" : "presentation", ...props, children: [title ? _jsx("title", { children: title }) : null, paths(name)] }));
}
