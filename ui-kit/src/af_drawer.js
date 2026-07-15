import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// AfDrawer — the shared right-edge drawer primitive (unified top-bar
// consensus, plans/unified-top-bar.md 2026-07-13).
//
// Invariants (behavior contract statements 9-13):
// - NON-MODAL: the app stays interactive beside an open drawer.
// - KEEP-ALIVE: closed = display:none + inert, NEVER unmounted — drawers
//   host long-running work (flow's assistant loop died on a conditional
//   unmount once; that lesson is now structural).
// - ESC closes the TOPMOST layer only: a consumed event (defaultPrevented)
//   belongs to a layer above; when this drawer consumes it, layers below
//   (other drawers) ignore it. The connect modal follows the same
//   convention and sits ABOVE drawers (z-order tokens in theme.css).
// - The drawer neither closes nor loses state at disconnect; the connect
//   modal covers it.
import { useEffect, useRef } from "react";
export function AfDrawer(props) {
    const closeOnEscape = props.closeOnEscape !== false;
    const panelRef = useRef(null);
    useEffect(() => {
        if (!props.open || !closeOnEscape)
            return;
        const onKey = (e) => {
            if (e.key !== "Escape" || e.defaultPrevented)
                return;
            e.preventDefault();
            props.onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.open, closeOnEscape, props.onClose]);
    // inert is not yet in React's TS dom types everywhere — set it imperatively.
    useEffect(() => {
        const el = panelRef.current;
        if (!el)
            return;
        if (props.open)
            el.removeAttribute("inert");
        else
            el.setAttribute("inert", "");
    }, [props.open]);
    return (_jsxs("div", { ref: panelRef, className: `af-drawer${props.open ? " af-drawer--open" : ""}${props.className ? ` ${props.className}` : ""}`, style: { width: props.width || 420, top: props.topOffset || 0, display: props.open ? undefined : "none" }, role: "complementary", "aria-label": props.label, "aria-hidden": props.open ? undefined : true, children: [props.title !== undefined ? (_jsxs("div", { className: "af-drawer__header", children: [_jsx("div", { className: "af-drawer__title", children: props.title }), _jsxs("div", { className: "af-drawer__header-actions", children: [props.headerActions, _jsx("button", { type: "button", className: "af-drawer__close", "aria-label": "Close panel", onClick: props.onClose, children: "\u00D7" })] })] })) : null, _jsx("div", { className: "af-drawer__body", children: props.children })] }));
}
export default AfDrawer;
