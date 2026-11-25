import React from "react";
import { Icon } from "./icon.js";
import { formatExactTime, formatRelativeTime } from "./relative_time.js";
import { CompactActivityCard } from "./compact_activity_card.js";

export interface SessionCardProps {
  sessionId: string;
  title: string;
  selected?: boolean;
  unread?: boolean;
  needsAttention?: boolean;
  working?: boolean;
  turnCount?: number | null;
  toolCount?: number | null;
  countsPartial?: boolean;
  updatedAt?: string | number | null;
  nowMs: number;
  onOpen: () => void;
  onArchive?: () => void;
  /**
   * Optional rename: a Rename action beside archive and F2 on the row edit the name in place.
   * Called with the trimmed name, at most 120 characters ("" clears it), never for an unchanged
   * one. A returned promise keeps the input read-only until it settles; a rejection keeps the
   * typed text in the open input (the host shows the error). Omitted: the card is unchanged.
   */
  onRename?: (title: string) => void | Promise<void>;
  /** Told when the rename editor opens (true) and closes, after any pending save (false). */
  onRenameEditingChange?: (editing: boolean) => void;
  /** The id of the host's element saying why the last rename was refused (input described by it, marked invalid). */
  renameErrorId?: string;
  archiveDisabled?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Compact, controlled conversation card. Reading, transport, archive confirmation and renaming belong to the host. */
export function SessionCard(p: SessionCardProps): React.ReactElement {
  const status = [p.needsAttention ? "Needs you" : "", p.unread ? "New messages" : "", p.working ? "Working" : ""].filter(Boolean).join(". ");
  const count = (n: number | null | undefined) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const stamp = formatRelativeTime(p.updatedAt, p.nowMs);
  const number = (n: number) => `${p.countsPartial ? "≥" : ""}${n}`;
  const label = (n: number, word: string) => `${p.countsPartial ? "At least " : ""}${n} ${word}${n === 1 ? "" : "s"}`;
  const description = [status, count(p.turnCount) ? label(p.turnCount!, "turn") : "", count(p.toolCount) && p.toolCount! > 0 ? label(p.toolCount!, "tool call") : "", stamp].filter(Boolean).join(". ");
  return <CompactActivityCard {...p} description={description} openAttributes={{ "data-session-id": p.sessionId }} metadata={<>
        {count(p.turnCount) && <span aria-label={label(p.turnCount!, "turn")} title={label(p.turnCount!, "turn")}><Icon name="chat" size={14} /><span aria-hidden="true">{number(p.turnCount!)}</span></span>}
        {count(p.toolCount) && p.toolCount! > 0 && <span aria-label={label(p.toolCount!, "tool call")} title={label(p.toolCount!, "tool call")}><Icon name="wrench" size={14} /><span aria-hidden="true">{number(p.toolCount!)}</span></span>}
        {p.needsAttention ? <span className="af-session-card__attention">Needs you</span> : stamp && <span className="af-session-card__time" title={formatExactTime(p.updatedAt)}><Icon name="clock" size={14} /><span>{stamp}</span></span>}
      </>} />;
}
