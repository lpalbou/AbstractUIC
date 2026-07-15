import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessageCard } from "./chat_message_card.js";
function is_near_bottom(el, thresholdPx) {
    const thr = Math.max(0, Math.trunc(thresholdPx));
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining <= thr;
}
export function ChatThread(props) {
    const threshold = typeof props.autoScrollThresholdPx === "number" && Number.isFinite(props.autoScrollThresholdPx) ? props.autoScrollThresholdPx : 120;
    const auto = props.autoScroll !== false;
    const list_ref = useRef(null);
    const bottom_ref = useRef(null);
    const [stick, set_stick] = useState(true);
    const msgs = useMemo(() => (Array.isArray(props.messages) ? props.messages : []), [props.messages]);
    useEffect(() => {
        if (!auto)
            return;
        const el = list_ref.current;
        if (!el)
            return;
        const on_scroll = () => {
            set_stick(is_near_bottom(el, threshold));
        };
        el.addEventListener("scroll", on_scroll, { passive: true });
        on_scroll();
        return () => el.removeEventListener("scroll", on_scroll);
    }, [auto, threshold]);
    // Re-stick on CONTENT growth, not just message count: a streaming answer
    // mutates a message's content and grows below the fold. ANY message's
    // growth moves the bottom (tool/status cards update in place too), so the
    // signature sums every content length.
    const content_signature = useMemo(() => {
        let total = 0;
        for (const m of msgs)
            total += String(m.content ?? "").length;
        return `${msgs.length}:${total}`;
    }, [msgs]);
    useEffect(() => {
        if (!auto)
            return;
        if (!stick)
            return;
        bottom_ref.current?.scrollIntoView({ block: "end" });
    }, [auto, stick, content_signature]);
    return (_jsxs("div", { ref: list_ref, className: ["pc-chat-thread", props.className].filter(Boolean).join(" "), children: [!msgs.length ? props.empty || null : null, msgs.map((m, idx) => (_jsx(ChatMessageCard, { message: m, ...(props.messageProps || {}) }, String(m.id || "") || String(m.ts || "") + ":" + String(m.role || "") + ":" + idx))), _jsx("div", { ref: bottom_ref })] }));
}
export default ChatThread;
