import React from "react";
import { ActivityAvatar, Icon } from "@abstractframework/ui-kit";

import type { ChatAuthorMarkKind, ChatAvatarLook } from "./chat_author.js";

export type ChatAuthorMarkProps = {
  mark: ChatAuthorMarkKind;
  /** The entity's look: a design draws its orb (the kit's `ActivityAvatar`, the renderer the
   * Entity app's identity uses); a colour alone tints the initial disc. */
  look?: ChatAvatarLook | null;
  /** The disc's letter for an entity without a design. */
  initial?: string;
  size: number;
  className?: string;
};

/**
 * The small mark beside an author's name: an entity's orb (its AbstractAvatar design in its
 * colour, still), its initial disc without a design, the agent's mark, or a person. Decorative:
 * the name next to it is the accessible text.
 */
export function ChatAuthorMark(props: ChatAuthorMarkProps): React.ReactElement {
  const color = props.mark === "entity" ? props.look?.color || undefined : undefined;
  const style = { width: props.size, height: props.size, ...(color ? { "--warning": color, "--af-entity-color": color } : {}) } as React.CSSProperties;
  const className = ["pc-author-mark", `pc-author-mark--${props.mark}`, props.className].filter(Boolean).join(" ");
  if (props.mark === "entity" && props.look?.style) {
    return (
      <span className={`${className} pc-author-mark--orb`} style={style} aria-hidden="true" data-design={props.look.style}>
        {/* A still portrait (the listening pose at a mid level draws every design's shape, as the
          * kit's EntityCard orb does); `key` re-creates the renderer when the colour changes. */}
        <ActivityAvatar key={color || ""} design={props.look.style} pose="listening" level={0.5} size={props.size} animated={false} quality="high" />
      </span>
    );
  }
  if (props.mark === "entity") {
    return (
      <span className={`${className} pc-author-mark--plain`} style={{ ...style, fontSize: Math.max(9, Math.round(props.size * 0.5)) }} aria-hidden="true">
        {(props.initial || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className={className} style={style} aria-hidden="true">
      <Icon name={props.mark === "agent" ? "bot" : "user"} size={Math.max(10, Math.round(props.size * 0.6))} />
    </span>
  );
}
