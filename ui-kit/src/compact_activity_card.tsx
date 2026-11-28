import React from "react";
import { Icon } from "./icon.js";

/** The longest name the rename input offers and sends, in characters (code points), as the Gateway stores. */
const TITLE_MAX = 120;
const cut = (text: string) => Array.from(text).slice(0, TITLE_MAX).join("");

/** The rename editor: closed, open, or waiting for the host's answer (the input then reads only). */
type Edit = { phase: "idle"; focusRow?: boolean } | { phase: "editing" | "pending"; initial: string; select?: boolean };

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
  /** Optional host button beside the row's actions (an automation's Restart); hidden while renaming. */
  action?: React.ReactNode;
  /**
   * Optional rename. When set, a Rename action (beside archive) and F2 on the row swap the title
   * for a one-line input outside the open button. Enter calls this with the trimmed text (at most
   * 120 characters; "" = the host clears the name); an unchanged name makes no call. Escape, or
   * focus leaving the input, cancels. While a returned promise is pending the input reads only;
   * on rejection it stays open with the typed text and the host shows the error.
   */
  onRename?: (title: string) => void | Promise<void>;
  /** Told when the rename editor opens (true) and when it closes, after any pending save (false). */
  onRenameEditingChange?: (editing: boolean) => void;
  /** The id of the host's element saying why the last rename was refused: described and marked invalid. */
  renameErrorId?: string;
}): React.ReactElement {
  const marker = p.needsAttention ? "attention" : p.working ? "working" : p.failed ? "failed" : p.unread ? "unread" : "";
  const [edit, setEdit] = React.useState<Edit>({ phase: "idle" });
  const openRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const renamable = Boolean(p.onRename) && !p.disabled;
  const open = edit.phase !== "idle";
  // Focus moves only when it is in the editor, or was dropped on the page by the editor closing:
  // never away from a control the person moved to meanwhile.
  const focusIsOurs = () => {
    const active = document.activeElement;
    return !active || active === document.body || active === inputRef.current;
  };
  React.useEffect(() => {
    const input = inputRef.current;
    if (edit.phase === "editing" && input) {
      if (edit.select) {
        input.focus();
        input.select();
      } else if (focusIsOurs()) input.focus();
    } else if (edit.phase === "idle" && edit.focusRow && focusIsOurs()) openRef.current?.focus();
  }, [edit]);
  React.useEffect(() => {
    // Withdrawn (or the card disabled) while open: the editor closes, once any pending save settled.
    if (edit.phase === "editing" && !renamable) setEdit({ phase: "idle" });
  }, [edit, renamable]);
  React.useEffect(() => {
    if (!open) return;
    p.onRenameEditingChange?.(true);
    return () => p.onRenameEditingChange?.(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const startEdit = () => {
    // The input strips line breaks from its value, so "unchanged" compares with what it shows.
    if (renamable && !open) setEdit({ phase: "editing", initial: cut(p.title).replace(/[\r\n]+/g, ""), select: true });
  };
  const leave = (focusRow: boolean) => setEdit((cur) => (cur.phase === "editing" ? { phase: "idle", focusRow } : cur));
  const commit = () => {
    if (edit.phase !== "editing" || !p.onRename) return;
    const value = cut((inputRef.current?.value ?? "").trim());
    if (value === edit.initial.trim()) return leave(true);
    let result: void | Promise<void>;
    try {
      result = p.onRename(value);
    } catch {
      return; // Refused at once: the input stays open with the typed text.
    }
    if (!result || typeof (result as Promise<void>).then !== "function") return leave(true);
    const initial = edit.initial;
    setEdit({ phase: "pending", initial });
    (result as Promise<void>).then(
      () => setEdit((cur) => (cur.phase === "pending" ? { phase: "idle", focusRow: true } : cur)),
      () => setEdit((cur) => (cur.phase === "pending" ? { phase: "editing", initial } : cur)),
    );
  };
  // Nothing typed or clicked inside the editor reaches the row, the list or the page.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div className={`af-session-card${p.className ? ` ${p.className}` : ""}`} data-selected={p.selected || undefined}
    data-unread={p.unread || undefined} data-attention={p.needsAttention || undefined} data-working={p.working || undefined} data-failed={p.failed || undefined}
    onKeyDown={p.onRename ? (event) => {
      // A held Enter that closed the editor must not go on to open the conversation.
      if (event.key === "Enter" && event.repeat && !open) { event.preventDefault(); return; }
      if (event.key === "F2" && !open && !event.repeat && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); startEdit(); }
    } : undefined}>
    {open ? <div className="af-session-card__edit" onKeyDown={stop} onKeyUp={stop} onKeyPress={stop} onClick={stop} onDoubleClick={stop} onMouseDown={stop} onPointerDown={stop}>
      <span className="af-session-card__heading">
        {edit.phase === "pending" ? <span className="af-session-card__marker is-working" aria-hidden="true" /> : marker && <span className={`af-session-card__marker is-${marker}`} aria-hidden="true" />}
        <RenameInput inputRef={inputRef} initial={edit.initial} pending={edit.phase === "pending"} description={p.description} errorId={p.renameErrorId}
          onKeyDown={(event) => {
            // Enter while an input method composes a character belongs to the input method; a held Enter repeats nothing.
            if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return;
            if (event.key === "Enter") { event.preventDefault(); commit(); }
            else if (event.key === "Escape") { event.preventDefault(); leave(true); }
          }}
          onBlur={(event) => {
            // The window losing focus keeps the editor (the input keeps it); a pending save keeps it too.
            if (document.activeElement === event.currentTarget) return;
            leave(false);
          }} />
      </span>
      {/* The counts' labels are on the open button; here they are said once, as the input's description. */}
      <span className="af-session-card__meta" aria-hidden="true">{p.metadata}</span>
    </div> : <button ref={openRef} type="button" className="af-session-card__open" {...p.openAttributes} disabled={p.disabled}
      aria-current={p.selected ? "page" : undefined} aria-keyshortcuts={p.onRename ? "F2" : undefined} aria-label={`${p.title}${p.description ? `. ${p.description}` : ""}`} onClick={p.onOpen}>
      <span className="af-session-card__heading">
        {marker && <span className={`af-session-card__marker is-${marker}`} aria-hidden="true" />}
        <span className="af-session-card__title" title={p.title} dir={p.onRename ? "auto" : undefined}>{p.title}</span>
      </span>
      <span className="af-session-card__meta">{p.metadata}</span>
    </button>}
    {p.action && !open ? p.action : null}
    {p.onRename && !open && <button type="button" className="af-session-card__rename" aria-label={`Rename ${p.title}`} title="Rename conversation" aria-keyshortcuts="F2"
      disabled={p.disabled} onClick={startEdit}><Icon name="edit" size={14} /></button>}
    {p.onArchive && !open && <button type="button" className="af-session-card__archive" aria-label={`Archive ${p.title}`} title={p.archiveTitle || "Archive conversation"}
      disabled={p.disabled || p.archiveDisabled} onClick={p.onArchive}><Icon name="archive" size={14} /></button>}
  </div>;
}

function RenameInput(p: {
  inputRef: React.RefObject<HTMLInputElement>;
  initial: string;
  pending: boolean;
  description: string;
  errorId?: string;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  onBlur: React.FocusEventHandler<HTMLInputElement>;
}): React.ReactElement {
  const id = React.useId();
  return <>
    <input ref={p.inputRef} type="text" className="af-session-card__title-input" defaultValue={p.initial} maxLength={TITLE_MAX}
      aria-label="Rename conversation" dir="auto" autoComplete="off" enterKeyHint="done"
      readOnly={p.pending} aria-busy={p.pending || undefined}
      aria-describedby={[p.description ? id : "", p.errorId || ""].filter(Boolean).join(" ") || undefined}
      aria-invalid={p.errorId ? true : undefined}
      onKeyDown={p.onKeyDown} onBlur={p.onBlur} />
    {p.description ? <span id={id} hidden>{p.description}</span> : null}
  </>;
}
