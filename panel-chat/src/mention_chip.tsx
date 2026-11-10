import React from "react";

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
 * selection copies "@Name"; the mark is not selectable.
 */
export function mentionChipFace(m: { kind: ChatMentionKind; name: string; avatar?: ChatAvatarLook | null }): React.ReactNode {
  return (
    <>
      <span className="pc-mention-chip__at">@<span className="pc-mention-chip__mark"><ChatAuthorMark mark={m.kind} look={m.avatar} initial={m.name} size={14} /></span></span>
      <span className="pc-mention-chip__name" data-mention-kind={m.kind}>{m.name}</span>
    </>
  );
}

export type ChatMentionChipProps = {
  /** The mention as the message carries it ({id, name, kind, index, start}, `avatar` optional). */
  mention: ChatMessageMention;
};

/** A mention inside a message's words: the composer's chip, without the ×. */
export function ChatMentionChip(props: ChatMentionChipProps): React.ReactElement {
  const m = props.mention;
  return (
    <span className="pc-mention-chip pc-mention-chip--inline pc-mention-chip--message" data-mention-key={mentionKey(m)} data-mention-kind={m.kind}>
      {mentionChipFace(m)}
    </span>
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
