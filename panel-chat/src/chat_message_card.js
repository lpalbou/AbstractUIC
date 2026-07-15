import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@abstractframework/ui-kit";
import { ChatMessageContent } from "./message_content.js";
import { copyText } from "./utils.js";
function _role_ui(m) {
    const role = String(m.role || "").trim().toLowerCase() || "system";
    const kind = String(m.kind || "").trim().toLowerCase();
    const lvl = String(m.level || "").trim().toLowerCase();
    if (role === "system" && kind === "report_bug") {
        return { label: String(m.title || "").trim() || "Bug report", icon: "warning", variant: "report_bug" };
    }
    if (role === "system" && kind === "report_feature") {
        return { label: String(m.title || "").trim() || "Feature request", icon: "check", variant: "report_feature" };
    }
    // Speaker identity over role literal (operator fix 2026-07-13): hosts pass
    // the speaker's name/handle as message.title (entity chat passes the entity
    // name); the role words are only the fallback when no identity was supplied.
    if (role === "user")
        return { label: String(m.title || "").trim() || "You", icon: "user", variant: "user" };
    if (role === "assistant")
        return { label: String(m.title || "").trim() || "Agent", icon: "bot", variant: "assistant" };
    const sys_label = String(m.title || "").trim() || (lvl === "error" ? "Error" : lvl === "warn" ? "Warning" : "System");
    const sys_icon = lvl === "error" ? "error" : lvl === "warn" ? "warning" : "info";
    const sys_variant = lvl === "error" ? "error" : lvl === "warn" ? "warn" : "status";
    return { label: sys_label, icon: sys_icon, variant: sys_variant };
}
export function ChatMessageCard(props) {
    const m = props.message;
    const role_ui = useMemo(() => _role_ui(m), [m.kind, m.level, m.role, m.title]);
    const ts = String(m.ts || "").trim();
    const time_label = useMemo(() => {
        if (!ts)
            return "";
        const d = new Date(ts);
        // A malformed timestamp must render as no timestamp, never "Invalid Date".
        if (!Number.isFinite(d.getTime()))
            return "";
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }, [ts]);
    const [copy_state, set_copy_state] = useState("idle");
    const copy_timer = useRef(null);
    useEffect(() => {
        return () => {
            if (copy_timer.current !== null)
                window.clearTimeout(copy_timer.current);
        };
    }, []);
    const can_speak = typeof props.onSpeakToggle === "function" && role_ui.variant === "assistant" && Boolean(String(m.content || "").trim());
    const speak_state = can_speak ? props.getSpeakState?.(m) || "idle" : "idle";
    const speak_icon = speak_state === "loading" ? "loader" : speak_state === "playing" ? "pause" : "speaker";
    const speak_title = speak_state === "loading"
        ? "Generating audio…"
        : speak_state === "playing"
            ? "Pause"
            : speak_state === "paused"
                ? "Resume"
                : "Speak (TTS)";
    const show_copy = props.showCopy !== false;
    const attachments = Array.isArray(props.attachments) ? props.attachments : [];
    const stats = Array.isArray(props.stats) ? props.stats : [];
    return (_jsxs("div", { className: ["pc-chat-item", `pc-chat-item--${role_ui.variant}`, props.className].filter(Boolean).join(" "), children: [_jsxs("div", { className: "pc-chat-header", children: [_jsx("div", { className: "pc-chat-avatar", "aria-hidden": "true", children: _jsx(Icon, { name: role_ui.icon, size: 14 }) }), _jsx("span", { className: "pc-chat-role", children: role_ui.label }), _jsx("span", { className: "pc-chat-header-spacer" }), time_label ? _jsx("span", { className: "pc-chat-time", children: time_label }) : null, _jsxs("div", { className: "pc-chat-header-actions", children: [can_speak ? (_jsx("button", { className: "pc-chat-icon-btn", type: "button", "aria-label": speak_title, title: speak_title, onClick: () => props.onSpeakToggle?.(m), children: _jsx(Icon, { name: speak_icon, size: 22 }) })) : null, show_copy ? (_jsx("button", { className: `pc-chat-icon-btn ${copy_state !== "idle" ? `pc-chat-icon-btn--${copy_state}` : ""}`.trim(), type: "button", "aria-label": "Copy message", title: copy_state === "idle" ? "Copy" : copy_state === "copied" ? "Copied" : "Copy failed", onClick: async () => {
                                    const ok = await copyText(String(m.content || ""));
                                    set_copy_state(ok ? "copied" : "failed");
                                    if (copy_timer.current !== null)
                                        window.clearTimeout(copy_timer.current);
                                    copy_timer.current = window.setTimeout(() => set_copy_state("idle"), 900);
                                }, children: _jsx(Icon, { name: "copy", size: 22 }) })) : null] })] }), _jsx("div", { className: "pc-chat-body", children: _jsx(ChatMessageContent, { text: String(m.content || ""), renderMarkdown: props.renderMarkdown, jsonCollapseAfterDepth: props.jsonCollapseAfterDepth }) }), attachments.length ? (_jsx("div", { className: "pc-chat-attachments", "aria-label": "Attachments", children: attachments.slice(0, 24).map((a, idx) => {
                    const label = String(a.label || "").trim() || "attachment";
                    const target = String(a.target || "").trim();
                    const title = String(a.title || "").trim();
                    const disabled = Boolean(a.disabled) || typeof a.onClick !== "function";
                    return (_jsxs("button", { type: "button", className: "pc-chat-attachment-chip", title: title || label, onClick: disabled ? undefined : a.onClick, disabled: disabled, children: [_jsx(Icon, { name: "paperclip", size: 14 }), target ? _jsx("span", { className: `pc-chat-attachment-target pc-chat-attachment-target--${target}`, children: target }) : null, _jsx("span", { className: "pc-chat-attachment-name", children: label })] }, a.id || `${label}:${idx}`));
                }) })) : null, stats.length ? (_jsx("div", { className: "pc-chat-stats", "aria-label": "Stats", children: stats.slice(0, 12).map((s, idx) => {
                    const label = String(s.label || "").trim();
                    if (!label)
                        return null;
                    const title = String(s.title || "").trim();
                    const clickable = typeof s.onClick === "function";
                    return (_jsxs("button", { type: "button", className: ["pc-chat-stat", clickable ? "pc-chat-stat--clickable" : ""].filter(Boolean).join(" "), title: title || undefined, onClick: clickable ? () => s.onClick?.() : undefined, disabled: !clickable, children: [s.icon ? _jsx("span", { className: "pc-chat-stat-icon", "aria-hidden": "true", children: s.icon }) : null, _jsx("span", { className: "pc-chat-stat-label", children: label })] }, s.id || `${label}:${idx}`));
                }) })) : null] }));
}
export default ChatMessageCard;
