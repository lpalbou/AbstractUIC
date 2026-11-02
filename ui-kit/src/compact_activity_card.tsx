import React from "react";
import { Icon } from "./icon.js";

/** Shared visual shell. Hosts own navigation, receipts, policies and confirmations. */
export function CompactActivityCard(p: {
  title: string;
  description: string;
  selected?: boolean;
  unread?: boolean;
  needsAttention?: boolean;
  working?: boolean;
  failed?: boolean;
  disabled?: boolean;
  archiveDisabled?: boolean;
  archiveTitle?: string;
  className?: string;
  openAttributes?: Record<string, string>;
  metadata: React.ReactNode;
  onOpen: () => void;
  onArchive?: () => void;
}): React.ReactElement {
  const marker = p.needsAttention ? "attention" : p.working ? "working" : p.failed ? "failed" : p.unread ? "unread" : "";
  return <div className={`af-session-card${p.className ? ` ${p.className}` : ""}`} data-selected={p.selected || undefined}
    data-unread={p.unread || undefined} data-attention={p.needsAttention || undefined} data-working={p.working || undefined} data-failed={p.failed || undefined}>
    <button type="button" className="af-session-card__open" {...p.openAttributes} disabled={p.disabled}
      aria-current={p.selected ? "page" : undefined} aria-label={`${p.title}${p.description ? `. ${p.description}` : ""}`} onClick={p.onOpen}>
      <span className="af-session-card__heading">
        {marker && <span className={`af-session-card__marker is-${marker}`} aria-hidden="true" />}
        <span className="af-session-card__title" title={p.title}>{p.title}</span>
      </span>
      <span className="af-session-card__meta">{p.metadata}</span>
    </button>
    {p.onArchive && <button type="button" className="af-session-card__archive" aria-label={`Archive ${p.title}`} title={p.archiveTitle || "Archive conversation"}
      disabled={p.disabled || p.archiveDisabled} onClick={p.onArchive}><Icon name="archive" size={14} /></button>}
  </div>;
}
