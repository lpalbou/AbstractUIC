import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@abstractframework/ui-kit";

import {
  ChatMessageCard,
  type ChatMessage,
  type ChatMessageCardProps,
} from "./chat_message_card.js";
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
  /**
   * Opens the thread with the message `messageId` at the TOP of the scroll surface instead of
   * sticking to the bottom (an automation opened on its newest run, or on what needs the person).
   * Decided ONCE per `key` (e.g. the automation's id): the first render that carries the message
   * places it; nothing scrolls the thread after that (new messages, content growth, a later
   * change of `messageId`) until the person scrolls to the bottom themselves, which brings back
   * the usual following. A message that never arrives leaves the thread where it is. Absent = the
   * thread sticks to the bottom, exactly as before (the markup is the same either way).
   */
  openAt?: { key: string; messageId: string } | null;
  /**
   * Earlier messages exist that the host has not loaded (an automation's older runs): a "load
   * earlier" control at the top of the thread, and the person's own scroll to the top asks for
   * them too (`onLoad`, never while `loading`). Once they are in (the first message changed), the
   * thread keeps the person's place: what they were reading stays where it was. Absent = no
   * control (the markup is the same as before).
   */
  earlier?: { label: string; loading?: boolean; loadingLabel?: string; onLoad: () => void } | null;
};

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The jump buttons' words (panel-chat's own chat strings; operator 2026-11-28). */
export const CHAT_JUMP_WORDS = { start: "Go to the beginning", end: "Go to the latest" } as const;
/** How long the jump buttons stay after the person stops scrolling. */
export const CHAT_JUMP_HIDE_MS = 1400;

type JumpRect = { top: number; bottom: number; left: number; right: number };

/**
 * How far to lift the jump buttons (px) so they never cover a message's own actions (copy,
 * speaker, the footer's buttons): above every action box they would overlap, lowest first, as long
 * as they stay below `limitTop` (the scroll surface's top); 0 when nothing is under them. Pure.
 */
export function chatJumpLift(stack: JumpRect, actions: readonly JumpRect[], limitTop: number, gap = 6): number {
  const height = stack.bottom - stack.top;
  let lift = 0;
  const sorted = [...actions].sort((a, b) => b.bottom - a.bottom);
  for (let pass = 0; pass < sorted.length + 1; pass++) {
    const top = stack.top - lift;
    const bottom = stack.bottom - lift;
    const hit = sorted.find((a) => a.right > stack.left - gap && a.left < stack.right + gap && a.bottom > top - gap && a.top < bottom + gap);
    if (!hit) return lift;
    const next = stack.bottom - hit.top + gap;
    if (stack.bottom - next - height < limitTop) return lift;
    lift = next;
  }
  return lift;
}

function is_near_bottom(el: HTMLElement, thresholdPx: number): boolean {
  const thr = Math.max(0, Math.trunc(thresholdPx));
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= thr;
}

export function ChatThread(props: ChatThreadProps): React.ReactElement {
  const threshold =
    typeof props.autoScrollThresholdPx === "number" &&
    Number.isFinite(props.autoScrollThresholdPx)
      ? props.autoScrollThresholdPx
      : 120;
  const auto = props.autoScroll !== false;
  const list_ref = useRef<HTMLDivElement | null>(null);
  const bottom_ref = useRef<HTMLDivElement | null>(null);
  const open_at = props.openAt ?? null;
  const [stick, set_stick] = useState(() => !open_at);
  // The opening placed (its key), and the offset the thread set itself (its scroll event is not
  // the person's).
  const placed_ref = useRef<string | null>(null);
  const own_scroll_ref = useRef<number | null>(null);
  // Following the bottom is held from the placement until the person scrolls to the bottom (a
  // ref: the effects of the placement's own commit still see the old `stick`).
  const hold_ref = useRef(false);
  // "Load earlier": the latest control (the scroll listener reads it), and the place to keep while
  // the earlier messages arrive (the first message then, and the distance to the bottom).
  const earlier = props.earlier ?? null;
  const earlier_ref = useRef(earlier);
  earlier_ref.current = earlier;
  const keep_ref = useRef<{ first: string; from_bottom: number } | null>(null);
  // The last ask by the person's scroll: scroll events come faster than `loading` arrives, and a
  // failed load must not be asked again on every event at the top.
  const last_ask_ref = useRef(0);
  const request_earlier = (by_scroll = false) => {
    const e = earlier_ref.current;
    const list = list_ref.current;
    if (!e || e.loading || !list) return;
    const now = Date.now();
    if (by_scroll && now - last_ask_ref.current < 1500) return;
    last_ask_ref.current = now;
    const first = Array.isArray(props.messages) && props.messages.length ? String(props.messages[0].id ?? "") : "";
    keep_ref.current = { first, from_bottom: list.scrollHeight - list.scrollTop };
    e.onLoad();
  };
  const request_earlier_ref = useRef(request_earlier);
  request_earlier_ref.current = request_earlier;
  // The jump buttons (beginning / latest): drawn once the person first scrolls, shown while they
  // scroll and a moment after, kept while pointed at or focused.
  const [jump, set_jump] = useState({ mounted: false, visible: false, top: false, bottom: false, lift: 0, seq: 0 });
  const jump_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jump_held_ref = useRef(false);
  const stack_ref = useRef<HTMLDivElement | null>(null);
  const hide_jump_later = () => {
    if (jump_timer_ref.current) clearTimeout(jump_timer_ref.current);
    jump_timer_ref.current = setTimeout(() => {
      if (!jump_held_ref.current) set_jump((j) => (j.visible ? { ...j, visible: false } : j));
    }, CHAT_JUMP_HIDE_MS);
  };
  const show_jump = (el: HTMLElement) => {
    const top = el.scrollTop <= 4;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
    set_jump((j) => ({ ...j, mounted: true, visible: true, top, bottom, seq: j.seq + 1 }));
    hide_jump_later();
  };
  const show_jump_ref = useRef(show_jump);
  show_jump_ref.current = show_jump;
  useEffect(() => () => {
    if (jump_timer_ref.current) clearTimeout(jump_timer_ref.current);
  }, []);

  const msgs = useMemo(
    () => (Array.isArray(props.messages) ? props.messages : []),
    [props.messages],
  );
  const groups = useMemo(() => {
    // A session-policy decision is a note on the tool group it covers, not an
    // item of its own: it joins the FIRST group of its run (wherever it
    // arrived), and stays a standalone line only when the run has no group.
    const toolRuns = new Set<string>();
    for (const message of msgs) if (message.toolActivity && message.runId) toolRuns.add(message.runId);
    const attachable = (message: ChatMessage) =>
      message.kind === "tool_policy_decision" && !message.toolActivity && Boolean(message.runId) && toolRuns.has(message.runId!);
    const out: ChatMessage[][] = [];
    for (const message of msgs) {
      if (attachable(message)) continue;
      const last = out[out.length - 1];
      if (
        message.toolActivity &&
        last?.[0]?.toolActivity &&
        last[0].runId === message.runId
      )
        last.push(message);
      else out.push([message]);
    }
    const notes = new Map<ChatMessage[], string[]>();
    for (const message of msgs) {
      if (!attachable(message)) continue;
      const home = out.find((group) => group[0].toolActivity && group[0].runId === message.runId);
      if (!home) continue;
      const list = notes.get(home) || [];
      const text = String(message.content || "").trim();
      if (text && !list.includes(text)) list.push(text);
      notes.set(home, list);
    }
    return out.map((group) => ({ group, notes: notes.get(group) || [] }));
  }, [msgs]);

  useEffect(() => {
    if (!auto) return;
    const el = list_ref.current;
    if (!el) return;
    // `event`: a real scroll (the listener); the first call below only reads where the thread is.
    const on_scroll = (event?: Event) => {
      if (own_scroll_ref.current !== null && el.scrollTop === own_scroll_ref.current) {
        own_scroll_ref.current = null;
        return;
      }
      own_scroll_ref.current = null;
      if (event) show_jump_ref.current(el);
      // The person scrolled to the top: the earlier messages, as the control would.
      if (el.scrollTop <= 24 && earlier_ref.current) request_earlier_ref.current(true);
      const near = is_near_bottom(el, threshold);
      if (near) hold_ref.current = false;
      set_stick(near);
    };
    el.addEventListener("scroll", on_scroll, { passive: true });
    // An opening at a message waits for the person's own scroll before following the bottom.
    if (!open_at) on_scroll();
    return () => el.removeEventListener("scroll", on_scroll);
  }, [auto, threshold]);

  // The opening at a message (`openAt`), once per key: its group's element (each group renders one
  // element, in order, before `after`) goes to the top of this scroll surface.
  const open_key = open_at?.key ?? null;
  const open_id = open_at?.messageId ?? null;
  useBeforePaint(() => {
    if (open_key === null || open_id === null || placed_ref.current === open_key) return;
    const list = list_ref.current;
    if (!list) return;
    const idx = groups.findIndex(({ group }) => group.some((m) => m.id === open_id));
    // The "load earlier" control, when shown, is the surface's first child.
    const target = idx >= 0 ? (list.children[idx + (earlier ? 1 : 0)] as HTMLElement | undefined) : undefined;
    if (!target) return;
    placed_ref.current = open_key;
    hold_ref.current = true;
    set_stick(false);
    list.scrollTop += target.getBoundingClientRect().top - list.getBoundingClientRect().top;
    own_scroll_ref.current = list.scrollTop;
    // A thread too short to scroll can never be scrolled to its bottom by the person: it follows
    // what arrives below, as before.
    if (list.scrollHeight <= list.clientHeight + 1) {
      hold_ref.current = false;
      set_stick(true);
    }
  }, [open_key, open_id, groups]);

  // The earlier messages are in (the first message changed): the place the person was reading is
  // kept, by its distance to the bottom (what was below did not move).
  const first_id = msgs.length ? String(msgs[0].id ?? "") : "";
  useBeforePaint(() => {
    const keep = keep_ref.current;
    const list = list_ref.current;
    if (!keep || !list) return;
    if (first_id === keep.first) {
      if (!earlier) keep_ref.current = null;
      return;
    }
    keep_ref.current = null;
    list.scrollTop = Math.max(0, list.scrollHeight - keep.from_bottom);
    own_scroll_ref.current = list.scrollTop;
  }, [first_id, earlier]);

  // Re-stick on CONTENT growth, not just message count: a streaming answer
  // mutates a message's content and grows below the fold. ANY message's
  // growth moves the bottom (tool/status cards update in place too), so the
  // signature sums every content length.
  const content_signature = useMemo(() => {
    let total = 0;
    for (const m of msgs) {
      total += String(m.content ?? "").length;
      for (const file of m.artifactRefs || [])
        total += file.id.length + (file.name?.length || 0) + 1;
      total += (m.artifactIds?.length || 0) + (m.attachments?.length || 0) + (m.notices?.length || 0);
      // Generated media arriving (a src filled in) moves the bottom too.
      if (Array.isArray(m.media))
        for (const item of m.media) total += String(item?.src ?? "").length + 1;
    }
    return `${msgs.length}:${total}:${String(props.afterKey ?? "")}`;
  }, [msgs, props.afterKey]);

  useEffect(() => {
    if (!auto) return;
    if (!stick || hold_ref.current) return;
    // Own only this scroll surface. scrollIntoView also scrolls enclosing
    // hidden-overflow app shells, moving headers offscreen after tool growth.
    const list = list_ref.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
      // The thread's own following: not the person's scroll (no jump buttons for it).
      own_scroll_ref.current = list.scrollTop;
    }
  }, [auto, stick, content_signature]);

  // An inline image/video/audio grows AFTER its message rendered (decode,
  // metadata): follow it when the reader is at the bottom. Load events do not
  // bubble, so the thread listens in the capture phase.
  useEffect(() => {
    if (!auto) return;
    const list = list_ref.current;
    if (!list) return;
    const follow = () => {
      if (stick && !hold_ref.current) {
        list.scrollTop = list.scrollHeight;
        own_scroll_ref.current = list.scrollTop;
      }
    };
    list.addEventListener("load", follow, true);
    list.addEventListener("loadedmetadata", follow, true);
    return () => {
      list.removeEventListener("load", follow, true);
      list.removeEventListener("loadedmetadata", follow, true);
    };
  }, [auto, stick]);

  // The jump buttons never cover a message's own actions: measured after each show.
  useBeforePaint(() => {
    const list = list_ref.current;
    const stack = stack_ref.current;
    if (!jump.visible || !list || !stack || typeof stack.getBoundingClientRect !== "function") return;
    const r = stack.getBoundingClientRect();
    const base = { top: r.top + jump.lift, bottom: r.bottom + jump.lift, left: r.left, right: r.right };
    const actions = Array.from(list.querySelectorAll(".pc-chat-header-actions, .pc-chat-footer button, .pc-chat-footer summary, .pc-chat-attachments button")).map((a) => a.getBoundingClientRect()).filter((a) => a.width > 0 && a.height > 0);
    const lift = Math.round(chatJumpLift(base, actions, list.getBoundingClientRect().top + 8));
    if (lift !== jump.lift) set_jump((j) => ({ ...j, lift }));
  }, [jump.seq, jump.visible]);
  const jump_to = (where: "start" | "end") => {
    const list = list_ref.current;
    if (!list) return;
    const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = where === "start" ? 0 : list.scrollHeight;
    if (typeof list.scrollTo === "function") list.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    else list.scrollTop = top;
  };
  const hold_jump = () => {
    jump_held_ref.current = true;
    if (jump_timer_ref.current) clearTimeout(jump_timer_ref.current);
    set_jump((j) => (j.visible ? j : { ...j, visible: true }));
  };
  const release_jump = () => {
    jump_held_ref.current = false;
    hide_jump_later();
  };

  return (
    <div
      ref={list_ref}
      className={["pc-chat-thread", props.className].filter(Boolean).join(" ")}
    >
      {!msgs.length ? props.empty || null : null}
      {earlier ? (
        <div className="pc-chat-earlier">
          <button type="button" className="pc-chat-earlier__button" data-action="load-earlier" disabled={Boolean(earlier.loading)} aria-busy={earlier.loading ? true : undefined} onClick={() => request_earlier()}>
            {earlier.loading ? earlier.loadingLabel || earlier.label : earlier.label}
          </button>
        </div>
      ) : null}
      {groups.map(({ group, notes }, idx) => {
        const m = group[0];
        const key =
          String(m.id || "") ||
          String(m.ts || "") + ":" + String(m.role || "") + ":" + idx;
        return m.toolActivity ? (
          <ToolActivityGroup
            key={key}
            tools={group.map((message) => message.toolActivity!)}
            notes={notes}
            statistics={group[group.length - 1].statistics}
            showCopy={props.messageProps?.showCopy}
          />
        ) : (
          <ChatMessageCard
            key={key}
            message={m}
            {...(props.messageProps || {})}
          />
        );
      })}
      {props.after}
      <div ref={bottom_ref} />
      {jump.mounted ? (
        <div className="pc-chat-jump" data-visible={jump.visible ? "true" : "false"} style={{ ["--pc-jump-lift" as string]: `${jump.lift}px` } as React.CSSProperties}>
          <div ref={stack_ref} className="pc-chat-jump__stack" onPointerEnter={hold_jump} onPointerLeave={release_jump} onFocus={hold_jump} onBlur={release_jump}>
            <button type="button" className="pc-chat-jump__button" data-action="jump-start" aria-label={CHAT_JUMP_WORDS.start} title={CHAT_JUMP_WORDS.start} hidden={jump.top} onClick={() => jump_to("start")}>
              <Icon name="chevronDown" size={16} className="pc-chat-jump__up" />
            </button>
            <button type="button" className="pc-chat-jump__button" data-action="jump-end" aria-label={CHAT_JUMP_WORDS.end} title={CHAT_JUMP_WORDS.end} hidden={jump.bottom} onClick={() => jump_to("end")}>
              <Icon name="chevronDown" size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ChatThread;
