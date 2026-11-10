import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatAuthorMark } from "./author_mark.js";
import type { ChatAvatarLook } from "./chat_author.js";
import {
  MENTION_TOKEN_OPEN,
  mentionKey,
  mentionTokenParts,
  mentionTokensPlain,
  type ChatMentionKind,
  type ChatMessageMention,
} from "./mentions.js";

/**
 * A mention chip's face, the same in the composer and in a message: the entity's orb (or the
 * agent's mark) over the "@", then the name. The "@" stays in the words (transparent), so a
 * selection copies "@Name"; the mark is not selectable (in a message its initial is drawn, not
 * written: `drawnInitial`). Only the composer's name carries
 * `data-mention-kind` (`.pc-mention-chip__name[data-mention-kind]` = the chips in the composer,
 * which hosts read); a message's chip carries its kind on the chip itself.
 */
export function mentionChipFace(m: { kind: ChatMentionKind; name: string; avatar?: ChatAvatarLook | null }, where: "composer" | "message" = "composer"): React.ReactNode {
  return (
    <>
      <span className="pc-mention-chip__at">@<span className="pc-mention-chip__mark"><ChatAuthorMark mark={m.kind} look={m.avatar} initial={m.name} size={14} {...(where === "message" ? { drawnInitial: true } : {})} /></span></span>
      <span className="pc-mention-chip__name" {...(where === "composer" ? { "data-mention-kind": m.kind } : {})}>{m.name}</span>
    </>
  );
}

/** How long the pointer (or the keyboard focus) rests on a chip before its card shows. */
export const MENTION_CARD_REST_MS = 150;
/** The pointer may cross from the chip to its card (and back) within this time. */
const MENTION_CARD_GRACE_MS = 120;
const CARD_GAP = 6;
const VIEWPORT_MARGIN = 8;
// Placement runs before paint in a browser; the server has no layout.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type MentionCardPlacement = { top: number; left: number; side: "below" | "above" };

/**
 * Where a chip's card goes (viewport pixels, `position: fixed`): below the chip, its left edge
 * on the chip's, kept 8 px inside the viewport; above the chip only when it does not fit below
 * and does above; neither: as low as it fits.
 */
export function mentionCardPlacement(
  anchor: { top: number; left: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): MentionCardPlacement {
  const below = anchor.bottom + CARD_GAP;
  const above = anchor.top - CARD_GAP - size.height;
  const fitsBelow = below + size.height <= viewport.height - VIEWPORT_MARGIN;
  const side = !fitsBelow && above >= VIEWPORT_MARGIN ? "above" : "below";
  const top = side === "above" ? above : Math.max(VIEWPORT_MARGIN, Math.min(below, viewport.height - VIEWPORT_MARGIN - size.height));
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, viewport.width - VIEWPORT_MARGIN - size.width));
  return { top, left, side };
}

export type ChatMentionChipProps = {
  /** The mention as the message carries it ({id, name, kind, index, start}, `avatar` optional). */
  mention: ChatMessageMention;
  /**
   * The host's card for this mention (e.g. the entity's card from its roster), shown in a small
   * popover below the chip after a 150 ms rest on it (pointer or keyboard focus); it goes on
   * leave, blur or Escape. Called only then; null shows nothing. Absent: the chip is words only.
   */
  renderCard?: (mention: ChatMessageMention) => React.ReactNode | null;
};

/** A mention inside a message's words: the composer's chip, without the ×. */
export function ChatMentionChip(props: ChatMentionChipProps): React.ReactElement {
  const m = props.mention;
  const hover = typeof props.renderCard === "function";
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MentionCardPlacement | null>(null);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Escape from inside the card gives the focus back to the chip without showing the card again.
  const refocused = useRef(false);
  const id = `pc-mention-card-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const stop = (timer: { current: ReturnType<typeof setTimeout> | null }) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = useCallback(() => {
    stop(rest);
    stop(grace);
    setOpen(false);
  }, []);
  const arm = () => {
    stop(grace);
    if (open || rest.current !== null) return;
    rest.current = setTimeout(() => {
      rest.current = null;
      setOpen(true);
    }, MENTION_CARD_REST_MS);
  };
  const leaveSoon = () => {
    stop(rest);
    stop(grace);
    grace.current = setTimeout(() => {
      grace.current = null;
      setOpen(false);
    }, MENTION_CARD_GRACE_MS);
  };
  useEffect(() => () => { stop(rest); stop(grace); }, []);
  const inside = (node: EventTarget | null, ...boxes: Array<HTMLElement | null>) =>
    Boolean(node) && boxes.some((box) => Boolean(box && box.contains(node as Node)));

  const content = open && hover ? props.renderCard!(m) : null;
  const shown = content !== null && content !== undefined && content !== false;

  useBeforePaint(() => {
    if (!shown) {
      setPos(null);
      return;
    }
    if (typeof window === "undefined") return;
    const place = () => {
      const chip = chipRef.current;
      const card = cardRef.current;
      if (!chip || !card) return;
      setPos(mentionCardPlacement(chip.getBoundingClientRect(), { width: card.offsetWidth, height: card.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // The host's card may grow once its data is in.
    const observer = typeof ResizeObserver === "undefined" || !cardRef.current ? null : new ResizeObserver(place);
    if (observer && cardRef.current) observer.observe(cardRef.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [shown]);

  useEffect(() => {
    if (!shown || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only this press: a drawer around the chat stays open.
      e.preventDefault();
      if (inside(document.activeElement, cardRef.current)) {
        refocused.current = true;
        chipRef.current?.focus();
      }
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shown, close]);

  const card = shown ? (
    <div
      ref={cardRef}
      id={id}
      className="pc-mention-card"
      role="group"
      aria-label={m.name}
      data-side={pos?.side}
      onMouseEnter={() => stop(grace)}
      onMouseLeave={leaveSoon}
      onBlur={(e) => { if (!inside(e.relatedTarget, cardRef.current, chipRef.current)) close(); }}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {content}
    </div>
  ) : null;

  return (
    <>
      <span
        ref={chipRef}
        className="pc-mention-chip pc-mention-chip--inline pc-mention-chip--message"
        data-mention-key={mentionKey(m)}
        data-mention-kind={m.kind}
        {...(hover
          ? {
              tabIndex: 0,
              "aria-describedby": shown ? id : undefined,
              onMouseEnter: arm,
              onMouseLeave: leaveSoon,
              onFocus: () => {
                if (refocused.current) refocused.current = false;
                else arm();
              },
              onBlur: (e: React.FocusEvent<HTMLSpanElement>) => { if (!inside(e.relatedTarget, cardRef.current)) close(); },
              onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => { if (e.key === "Escape" && (open || rest.current !== null)) close(); },
            }
          : {})}
      >
        {mentionChipFace(m, "message")}
      </span>
      {card && typeof document !== "undefined" ? createPortal(card, document.body) : card}
    </>
  );
}

/**
 * The rendered words of a message (`node`, a Markdown tree whose text carried a token for each
 * placed mention: `mentionTokenText`) with each token turned into its chip (`chip`). A token
 * that lands anywhere but in the words (a code block's code, an attribute) gets its "@Name"
 * back. Elements without a token are returned as they were.
 */
export function withMentionChips(
  node: React.ReactNode,
  placed: readonly ChatMessageMention[],
  chip: (mention: ChatMessageMention, key: string) => React.ReactNode,
): React.ReactNode {
  const walk = (value: React.ReactNode, key: string | undefined): React.ReactNode => {
    if (typeof value === "string") {
      if (!value.includes(MENTION_TOKEN_OPEN)) return value;
      const parts = mentionTokenParts(value).map((p, i) => (typeof p === "number" ? (placed[p] ? chip(placed[p], `${key ?? "m"}:${i}`) : null) : p));
      return React.createElement(React.Fragment, key === undefined ? null : { key }, ...parts);
    }
    if (Array.isArray(value)) {
      let changed = false;
      const out = value.map((child, i) => {
        const next = walk(child as React.ReactNode, `mt${i}`);
        if (next !== child) changed = true;
        return next;
      });
      return changed ? out : value;
    }
    if (React.isValidElement(value)) {
      const props = value.props as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      let changed = false;
      let children: React.ReactNode = props.children as React.ReactNode;
      for (const [name, prop] of Object.entries(props)) {
        if (name === "children") {
          const next = walk(prop as React.ReactNode, undefined);
          if (next !== prop) { children = next; changed = true; }
        } else if (typeof prop === "string" && prop.includes(MENTION_TOKEN_OPEN)) {
          patch[name] = mentionTokensPlain(prop, placed);
          changed = true;
        }
      }
      if (!changed) return value;
      // Children go back as arguments, as the element was written (no list-key warnings).
      return "children" in props
        ? React.cloneElement(value, patch, ...(Array.isArray(children) ? children : [children]))
        : React.cloneElement(value, patch);
    }
    return value;
  };
  return walk(node, undefined);
}
