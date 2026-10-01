import React, { useEffect, useMemo, useRef, useState } from "react";

import { ChatMessageCard, type ChatMessage, type ChatMessageCardProps } from "./chat_message_card.js";
import { ToolActivityGroup } from "./tool_activity.js";

export type ChatThreadProps = {
  messages: ChatMessage[];
  className?: string;
  empty?: React.ReactNode;
  autoScroll?: boolean;
  autoScrollThresholdPx?: number;
  /** Optional content after messages, kept inside the same scroll surface. */
  after?: React.ReactNode;
  /** A stable identity for `after`, so newly presented content can follow
   * normal auto-scroll intent without treating arbitrary React nodes as data. */
  afterKey?: string | number | null;
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
  const groups = useMemo(() => {
    const out: ChatMessage[][] = [];
    for (const message of msgs) {
      const last = out[out.length - 1];
      if (message.toolActivity && last?.[0]?.toolActivity && last[0].runId === message.runId) last.push(message);
      else out.push([message]);
    }
    return out;
  }, [msgs]);

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

  // Re-stick on CONTENT growth, not just message count: a streaming answer
  // mutates a message's content and grows below the fold. ANY message's
  // growth moves the bottom (tool/status cards update in place too), so the
  // signature sums every content length.
  const content_signature = useMemo(() => {
    let total = 0;
    for (const m of msgs) {
      total += String(m.content ?? "").length;
      // Generated media arriving (a src filled in) moves the bottom too.
      if (Array.isArray(m.media)) for (const item of m.media) total += String(item?.src ?? "").length + 1;
    }
    return `${msgs.length}:${total}:${String(props.afterKey ?? "")}`;
  }, [msgs, props.afterKey]);

  useEffect(() => {
    if (!auto) return;
    if (!stick) return;
    // Own only this scroll surface. scrollIntoView also scrolls enclosing
    // hidden-overflow app shells, moving headers offscreen after tool growth.
    const list = list_ref.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [auto, stick, content_signature]);

  // An inline image/video/audio grows AFTER its message rendered (decode,
  // metadata): follow it when the reader is at the bottom. Load events do not
  // bubble, so the thread listens in the capture phase.
  useEffect(() => {
    if (!auto) return;
    const list = list_ref.current;
    if (!list) return;
    const follow = () => {
      if (stick) list.scrollTop = list.scrollHeight;
    };
    list.addEventListener("load", follow, true);
    list.addEventListener("loadedmetadata", follow, true);
    return () => {
      list.removeEventListener("load", follow, true);
      list.removeEventListener("loadedmetadata", follow, true);
    };
  }, [auto, stick]);

  return (
    <div ref={list_ref} className={["pc-chat-thread", props.className].filter(Boolean).join(" ")}>
      {!msgs.length ? props.empty || null : null}
      {groups.map((group, idx) => {
        const m = group[0];
        const key = String(m.id || "") || String(m.ts || "") + ":" + String(m.role || "") + ":" + idx;
        return m.toolActivity ? <ToolActivityGroup key={key} tools={group.map(message => message.toolActivity!)} showCopy={props.messageProps?.showCopy} /> : <ChatMessageCard key={key} message={m} {...(props.messageProps || {})} />;
      })}
      {props.after}
      <div ref={bottom_ref} />
    </div>
  );
}

export default ChatThread;
