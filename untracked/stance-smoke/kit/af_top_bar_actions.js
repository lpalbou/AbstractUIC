import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Icon } from "./icon.js";
export function AfTopBarActions(props) {
    const { connection } = props;
    const phase = connection.phase;
    const signingOut = connection.signingOut === true;
    const pillLabel = signingOut
        ? "Signing out…"
        : phase === "connected"
            ? "Disconnect"
            : phase === "loading"
                ? "Connecting…"
                : "Connect";
    const pillTitle = phase === "connected" ? "Disconnect from gateway" : phase === "loading" ? "Checking gateway session…" : "Connect to gateway";
    return (_jsxs("div", { className: `af-topbar${props.className ? ` ${props.className}` : ""}`, role: "group", "aria-label": "App actions", children: [props.assistant ? (_jsx("button", { type: "button", className: `af-topbar__btn${props.assistant.open ? " is-active" : ""}`, "aria-pressed": props.assistant.open, "aria-label": props.assistant.label || "Open assistant", title: props.assistant.label || "Assistant", onClick: props.assistant.onToggle, children: _jsx(Icon, { name: "sparkle", size: 16 }) })) : null, props.appearance ? (_jsx("button", { type: "button", className: "af-topbar__btn", "aria-label": props.appearance.label || "Appearance (theme and typography)", title: props.appearance.label || "Appearance", onClick: props.appearance.onOpen, children: _jsx(Icon, { name: "contrast", size: 16 }) })) : null, props.extraActions, _jsxs("button", { type: "button", className: `af-topbar__pill af-topbar__pill--${phase}`, onClick: phase === "connected" ? connection.onDisconnect : connection.onConnect, disabled: signingOut, title: pillTitle, "aria-label": pillTitle, children: [_jsx("span", { className: `af-topbar__dot af-topbar__dot--${phase}`, "aria-hidden": "true" }), _jsx("span", { className: "af-topbar__pill-label", children: pillLabel })] })] }));
}
export default AfTopBarActions;
