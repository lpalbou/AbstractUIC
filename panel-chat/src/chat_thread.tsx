import React, { useEffect, useMemo, useRef, useState } from "react";

import "./panel_chat.css";

import { ChatMessageCard, type ChatMessage, type ChatMessageCardProps } from "./chat_message_card";

export type ChatThreadProps = {
  messages: ChatMessage[];
  className?: string;
  empty?: React.ReactNode;
  autoScroll?: boolean;
  autoScrollThresholdPx?: number;
  messageProps?: Omit<ChatMessageCardProps, "message">;
};

function is_near_bottom(el: HTMLElement, thresholdPx: number): boolean {
  const thr = Math.max(0, Math.trunc(thresholdPx));
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= thr;
}

export function ChatThread(props: ChatThreadProps): React.ReactElement {
  const threshold = typeof props.autoScrollThresholdPx === "number" && Number.isFinite(props.autoScrollThresholdPx) ? props.autoScrollThresholdPx : 120;
  const auto = props.autoScroll !== false;
  const list_ref = useRef<HTMLDivElement | null>(null);
  const bottom_ref = useRef<HTMLDivElement | null>(null);
  const [stick, set_stick] = useState(true);

  const msgs = useMemo(() => (Array.isArray(props.messages) ? props.messages : []), [props.messages]);

  useEffect(() => {
    if (!auto) return;
    const el = list_ref.current;
    if (!el) return;
    const on_scroll = () => {
      set_stick(is_near_bottom(el, threshold));
    };
    el.addEventListener("scroll", on_scroll, { passive: true });
    on_scroll();
    return () => el.removeEventListener("scroll", on_scroll);
  }, [auto, threshold]);

  useEffect(() => {
    if (!auto) return;
    if (!stick) return;
    bottom_ref.current?.scrollIntoView({ block: "end" });
  }, [auto, stick, msgs.length]);

  return (
    <div ref={list_ref} className={["pc-chat-thread", props.className].filter(Boolean).join(" ")}>
      {!msgs.length ? props.empty || null : null}
      {msgs.map((m, idx) => (
        <ChatMessageCard key={String(m.id || "") || String(m.ts || "") + ":" + String(m.role || "") + ":" + idx} message={m} {...(props.messageProps || {})} />
      ))}
      <div ref={bottom_ref} />
    </div>
  );
}

export default ChatThread;
