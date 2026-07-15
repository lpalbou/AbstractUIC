import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
export const ChatComposer = React.forwardRef(function ChatComposer(props, ref) {
    const rows = typeof props.rows === "number" && Number.isFinite(props.rows) ? Math.max(1, Math.trunc(props.rows)) : 3;
    const disabled = Boolean(props.disabled);
    const busy = Boolean(props.busy);
    const can_submit = !disabled && !busy && Boolean(String(props.value || "").trim());
    return (_jsxs("div", { className: ["pc-composer", props.className].filter(Boolean).join(" "), children: [_jsx("textarea", { ref: ref, className: ["pc-composer__textarea", props.textareaClassName].filter(Boolean).join(" "), value: props.value, onChange: (e) => props.onChange(e.target.value), rows: rows, spellCheck: false, autoCorrect: "off", autoCapitalize: "off", autoComplete: "off", placeholder: props.placeholder || "", disabled: disabled, autoFocus: Boolean(props.autoFocus), onKeyDown: (e) => {
                    if (e.key !== "Enter" || e.shiftKey)
                        return;
                    // Committing an IME composition with Enter must never send the
                    // message (CJK input); nativeEvent.isComposing covers the commit
                    // keystroke itself, keyCode 229 covers older engines.
                    if (e.nativeEvent.isComposing || e.keyCode === 229)
                        return;
                    e.preventDefault();
                    // Enter honors the same gate as the Send button — the busy/empty
                    // contract is the component's, not something every consumer must
                    // re-implement around a keyboard side door.
                    if (!can_submit)
                        return;
                    props.onSubmit();
                } }), _jsxs("div", { className: "pc-composer__row", children: [_jsx("div", { className: "pc-composer__actions", children: props.actions }), _jsx("button", { type: "button", className: props.sendButtonClassName || "pc-btn", disabled: !can_submit, onClick: () => props.onSubmit(), children: busy ? props.busyLabel || "Thinking…" : props.sendLabel || "Send" })] })] }));
});
