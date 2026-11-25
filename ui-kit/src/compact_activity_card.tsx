import React from "react";
import { Icon } from "./icon.js";

/** The longest name the rename input accepts (the Gateway stores at most this many characters). */
const TITLE_MAX_LENGTH = 120;

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
  /**
   * Optional rename. When set, a Rename action (beside archive), F2 on the row and a double-click
   * on the title swap the title for a one-line input outside the open button. Enter calls this
   * with the trimmed text ("" = the host clears the name); an unchanged name makes no call.
   * Escape, or focus leaving the input, cancels. While a returned promise is pending the input is
   * disabled; on rejection it stays open with the typed text and the host shows the error.
   */
  onRename?: (title: string) => void | Promise<void>;
}): React.ReactElement {
  const marker = p.needsAttention ? "attention" : p.working ? "working" : p.failed ? "failed" : p.unread ? "unread" : "";
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const openRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const baseline = React.useRef("");
  const busy = React.useRef(false);
  const alive = React.useRef(true);
  const returnFocus = React.useRef(false);
  const active = React.useRef(false);
  const renamable = Boolean(p.onRename) && !p.disabled;
  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  React.useEffect(() => {
    if (editing && !renamable && !busy.current) leave(false);
  }, [editing, renamable]);
  React.useEffect(() => {
    const input = inputRef.current;
    if (editing && input) {
      // The browser's own value (line breaks already stripped) is what "unchanged" compares to.
      baseline.current = input.value.trim();
      input.focus();
      input.select();
    } else if (!editing && returnFocus.current) {
      returnFocus.current = false;
      openRef.current?.focus();
    }
  }, [editing]);
  React.useEffect(() => {
    // A refused rename re-enables the input: the typed text is still there, focus goes back to it.
    if (editing && !pending) inputRef.current?.focus();
  }, [pending]);
  const startEdit = () => {
    if (!renamable || editing) return;
    active.current = true;
    setEditing(true);
  };
  const leave = (focusRow: boolean) => {
    if (!active.current) return;
    active.current = false;
    returnFocus.current = focusRow;
    setEditing(false);
  };
  const commit = () => {
    if (busy.current || !p.onRename) return;
    const value = (inputRef.current?.value ?? "").trim();
    if (value === baseline.current) return leave(true);
    let result: void | Promise<void>;
    try {
      result = p.onRename(value);
    } catch {
      return; // Refused at once: the input stays open with the typed text.
    }
    if (!result || typeof (result as Promise<void>).then !== "function") return leave(true);
    busy.current = true;
    setPending(true);
    const settle = (ok: boolean) => {
      busy.current = false;
      if (!alive.current) return;
      setPending(false);
      if (ok) leave(true);
    };
    (result as Promise<void>).then(() => settle(true), () => settle(false));
  };
  // Nothing typed or clicked inside the editor reaches the row, the list or the page.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div className={`af-session-card${p.className ? ` ${p.className}` : ""}`} data-selected={p.selected || undefined}
    data-unread={p.unread || undefined} data-attention={p.needsAttention || undefined} data-working={p.working || undefined} data-failed={p.failed || undefined}
    onKeyDown={p.onRename ? (event) => { if (event.key === "F2" && !editing) { event.preventDefault(); startEdit(); } } : undefined}>
    {editing ? <div className="af-session-card__edit" onKeyDown={stop} onKeyUp={stop} onKeyPress={stop} onClick={stop} onDoubleClick={stop} onMouseDown={stop} onPointerDown={stop}>
      <span className="af-session-card__heading">
        {pending ? <span className="af-session-card__marker is-working" aria-hidden="true" /> : marker && <span className={`af-session-card__marker is-${marker}`} aria-hidden="true" />}
        <input ref={inputRef} type="text" className="af-session-card__title-input" defaultValue={p.title} maxLength={TITLE_MAX_LENGTH}
          aria-label="Rename conversation" dir="auto" autoComplete="off" enterKeyHint="done" disabled={pending} aria-busy={pending || undefined}
          onKeyDown={(event) => {
            // Enter while an input method composes a character belongs to the input method.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") { event.preventDefault(); commit(); }
            else if (event.key === "Escape") { event.preventDefault(); if (!busy.current) leave(true); }
          }}
          onBlur={(event) => {
            // A pending save keeps the editor; so does the window losing focus (the input keeps it).
            if (!active.current || busy.current || document.activeElement === event.currentTarget) return;
            leave(false);
          }} />
      </span>
      <span className="af-session-card__meta">{p.metadata}</span>
    </div> : <button ref={openRef} type="button" className="af-session-card__open" {...p.openAttributes} disabled={p.disabled}
      aria-current={p.selected ? "page" : undefined} aria-keyshortcuts={p.onRename ? "F2" : undefined} aria-label={`${p.title}${p.description ? `. ${p.description}` : ""}`} onClick={p.onOpen}>
      <span className="af-session-card__heading">
        {marker && <span className={`af-session-card__marker is-${marker}`} aria-hidden="true" />}
        <span className="af-session-card__title" title={p.title} dir={p.onRename ? "auto" : undefined}
          onDoubleClick={p.onRename ? (event) => { event.preventDefault(); startEdit(); } : undefined}>{p.title}</span>
      </span>
      <span className="af-session-card__meta">{p.metadata}</span>
    </button>}
    {p.onRename && !editing && <button type="button" className="af-session-card__rename" aria-label={`Rename ${p.title}`} title="Rename conversation" aria-keyshortcuts="F2"
      disabled={p.disabled} onClick={startEdit}><Icon name="edit" size={14} /></button>}
    {p.onArchive && !editing && <button type="button" className="af-session-card__archive" aria-label={`Archive ${p.title}`} title={p.archiveTitle || "Archive conversation"}
      disabled={p.disabled || p.archiveDisabled} onClick={p.onArchive}><Icon name="archive" size={14} /></button>}
  </div>;
}
