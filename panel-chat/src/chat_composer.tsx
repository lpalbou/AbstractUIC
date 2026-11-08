import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AfChip, Icon } from "@abstractframework/ui-kit";

import { ChatAuthorMark } from "./author_mark.js";
import {
  addMention,
  applyMentionPick,
  mentionKey,
  mentionSendPayload,
  mentionTriggerAt,
  moveMentionActive,
  removeMention,
  usableCandidates,
  type ChatComposerSend,
  type ChatMention,
  type ChatMentionCandidate,
} from "./mentions.js";

const NO_MENTIONS: ChatMention[] = [];
type MentionsFound = { query: string; items: ChatMentionCandidate[]; status: "loading" | "ready" | "error" };
const NOTHING_FOUND: MentionsFound = { query: "", items: [], status: "loading" };
// Caret placement after a pick runs before paint in a browser; the server has no layout.
const useCaretEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Rounded multiline is the shared default; `legacy` restores the former flat layout. */
export type ChatComposerVariant = "compact" | "legacy";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Send (Enter or the button). `onSend` wins when given. */
  onSubmit?: () => void;
  /**
   * Send with the picked mentions: `{text, mentions: [{id, name, kind, index}]}`, mentions in
   * the order they were picked. Wins over `onSubmit`. Uncontrolled chips are cleared once it
   * returns (or its promise resolves); a throw or a rejection keeps them.
   */
  onSend?: (send: ChatComposerSend) => void | Promise<unknown>;
  /**
   * `@` mentions. Typing `@` opens a list of the names this returns for the query typed after
   * it (the HOST decides the source, e.g. `GET /entities`; it is called as the person types, so
   * cache in the host). A pick becomes a chip bound to that candidate; an `@` that was not
   * picked stays plain text. Absent: no list and no chips (today's composer).
   */
  mentionCandidates?: (query: string) => Promise<ChatMentionCandidate[]>;
  /** Controlled chips. Omit to let the composer keep them. */
  mentions?: ChatMention[];
  onMentionsChange?: (mentions: ChatMention[]) => void;
  /**
   * The sentence shown under a chip the first time its name is picked in this conversation
   * (e.g. "Castor will read this conversation's history"). The host writes it; null = none.
   */
  mentionNotice?: (candidate: ChatMentionCandidate) => string | null | undefined;
  /** The conversation "the first time" counts in (e.g. the session id); a new key starts over. */
  mentionSessionKey?: string;
  /**
   * The host's sentence when mentions cannot be used here (e.g. an older gateway without the
   * mentions route: "This gateway does not offer mentions yet"). Typing `@` then shows this
   * sentence instead of names (no new chip), and it stays under any chips already picked.
   */
  mentionsUnavailable?: string | null;
  /**
   * A sentence the host shows about the last mentions it sent (e.g. "Castor is in another
   * conversation."); shown above the field, with or without chips, until the host clears it.
   */
  mentionStatus?: string | null;
  /** Omit for the shared rounded multiline composer; `legacy` restores the former layout. */
  variant?: ChatComposerVariant;
  placeholder?: string;
  /** Accessible name for the message field. Falls back to its placeholder. */
  ariaLabel?: string;
  textareaId?: string;
  ariaDescribedBy?: string;
  disabled?: boolean;
  busy?: boolean;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  textareaClassName?: string;
  sendButtonClassName?: string;
  sendLabel?: string;
  busyLabel?: string;
  /** Host eligibility for attachment-only or other valid payloads. Busy/disabled still win. */
  canSubmit?: boolean;
  /** Preserve multiline-first chats that submit with Ctrl/Cmd+Enter. */
  submitKey?: "enter" | "mod-enter";
  actions?: React.ReactNode;
  /**
   * The primary round button turns into Stop (compact variant): an arrow-to-square
   * morph, same size and place. `active` = Stop right now; `stopping` = the stop
   * was asked and is settling (aria-busy). Absent = the button is only ever Send.
   */
  stop?: { active: boolean; stopping?: boolean; onStop: () => void; label?: string };
  /** Controls next to Send, such as a microphone. */
  trailingActions?: React.ReactNode;
  /** Shared attachment control; the host owns its file chooser and upload lifecycle. */
  onAttach?: () => void;
  attachLabel?: string;
  attachDisabled?: boolean;
  attachPending?: boolean;
  /** Rendered inside the composer box above the textarea (e.g. attachment chips). */
  leading?: React.ReactNode;
  /** Absolutely positioned layer over the composer box (e.g. a drop zone). */
  overlay?: React.ReactNode;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
};

export const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
  props: ChatComposerProps,
  ref
): React.ReactElement {
  const compact = props.variant !== "legacy";
  const rows = typeof props.rows === "number" && Number.isFinite(props.rows) ? Math.max(1, Math.trunc(props.rows)) : compact ? 2 : 3;
  const disabled = Boolean(props.disabled);
  const busy = Boolean(props.busy);
  const can_submit = !disabled && !busy && (props.canSubmit ?? Boolean(String(props.value || "").trim()));
  const stopSpec = compact ? props.stop : undefined;
  const stopMode = Boolean(stopSpec?.active);
  const stopping = stopMode && Boolean(stopSpec?.stopping);
  const sendLabel = busy ? props.busyLabel || "Thinking…" : props.sendLabel || "Send";
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const fallbackSizing = useRef(false);
  const setTextarea = useCallback((element: HTMLTextAreaElement | null) => {
    textarea.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  }, [ref]);
  const resizeTextarea = useCallback(() => {
    const element = textarea.current;
    if (!element || !fallbackSizing.current) return;
    element.style.height = "0px";
    const cap = parseFloat(getComputedStyle(element).maxHeight);
    element.style.height = `${Math.min(element.scrollHeight, Number.isFinite(cap) ? cap : Infinity)}px`;
  }, []);

  // Field sizing is native where available. Compact retains multiline growth
  // on other engines, including after its containing pane is resized.
  useEffect(() => {
    const element = textarea.current;
    if (!compact || !element || (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content"))) return;
    fallbackSizing.current = true;
    resizeTextarea();
    window.addEventListener("resize", resizeTextarea);
    let width = element.clientWidth;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resizeTextarea(); }
    });
    observer?.observe(element);
    return () => { fallbackSizing.current = false; observer?.disconnect(); window.removeEventListener("resize", resizeTextarea); element.style.removeProperty("height"); };
  }, [compact, resizeTextarea]);
  useEffect(() => { resizeTextarea(); }, [props.value, rows, resizeTextarea]);

  // ---- @ mentions (off unless the host feeds names) ------------------------------------
  const mentionsOn = typeof props.mentionCandidates === "function";
  const controlledMentions = props.mentions !== undefined;
  const [ownMentions, setOwnMentions] = useState<ChatMention[]>(NO_MENTIONS);
  const mentions = mentionsOn ? (controlledMentions ? props.mentions || NO_MENTIONS : ownMentions) : NO_MENTIONS;
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  const setMentions = useCallback((next: ChatMention[]) => {
    mentionsRef.current = next;
    if (latest.current.mentions === undefined) setOwnMentions(next);
    latest.current.onMentionsChange?.(next);
  }, []);
  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const trigger = mentionsOn && focused && !disabled && caret !== null ? mentionTriggerAt(props.value, caret) : null;
  const open = Boolean(trigger) && trigger?.start !== dismissedAt;
  const unavailable = mentionsOn ? String(props.mentionsUnavailable || "").trim() : "";
  const mentionStatus = mentionsOn ? String(props.mentionStatus || "").trim() : "";
  // Unavailable: the list says why and the host's feed is not asked.
  const query = open && trigger && !unavailable ? trigger.query : null;
  // Escape closes the list for THIS `@`; a new `@` (or moving off it) opens it again.
  useEffect(() => { if (dismissedAt !== null && trigger?.start !== dismissedAt) setDismissedAt(null); }, [trigger?.start, dismissedAt]);
  const [found, setFound] = useState<MentionsFound>(NOTHING_FOUND);
  const [active, setActive] = useState(0);
  const loadSeq = useRef(0);
  useEffect(() => {
    if (query === null) { loadSeq.current += 1; setFound(NOTHING_FOUND); return; }
    const seq = ++loadSeq.current;
    setActive(0);
    let pending: Promise<unknown>;
    try { pending = Promise.resolve(latest.current.mentionCandidates?.(query)); }
    catch (reason) { pending = Promise.reject(reason); }
    pending.then(
      (items) => { if (seq === loadSeq.current) setFound({ query, items: usableCandidates(items), status: "ready" }); },
      () => { if (seq === loadSeq.current) setFound({ query, items: [], status: "error" }); },
    );
  }, [query]);
  // While the names for a new query load, the previous names stay (no flicker per keystroke).
  const shown: MentionsFound = query === null ? NOTHING_FOUND : found.query === query ? found : { query, items: found.items, status: "loading" };
  const activeIndex = shown.items.length ? Math.min(Math.max(active, 0), shown.items.length - 1) : -1;
  const listId = `${useId()}mentions`;
  const optionId = (i: number) => `${listId}-${i}`;

  // First pick of a name in this conversation: the host's sentence under the chips.
  const noticed = useRef<{ key: string | undefined; seen: Set<string> }>({ key: props.mentionSessionKey, seen: new Set() });
  if (noticed.current.key !== props.mentionSessionKey) noticed.current = { key: props.mentionSessionKey, seen: new Set() };
  const [notices, setNotices] = useState<Array<{ key: string; text: string }>>([]);
  useEffect(() => { if (!mentions.length && notices.length) setNotices([]); }, [mentions.length, notices.length]);
  const chipKeys = new Set(mentions.map(mentionKey));
  const visibleNotices = notices.filter((n) => chipKeys.has(n.key));

  const pendingCaret = useRef<number | null>(null);
  useCaretEffect(() => {
    const element = textarea.current;
    if (pendingCaret.current === null || !element) return;
    const at = Math.min(pendingCaret.current, element.value.length);
    pendingCaret.current = null;
    element.setSelectionRange(at, at);
  }, [props.value]);

  const pick = (candidate: ChatMentionCandidate) => {
    if (!trigger) return;
    const at = textarea.current ? textarea.current.selectionStart : caret ?? props.value.length;
    const next = applyMentionPick(props.value, trigger, at);
    pendingCaret.current = next.caret;
    setCaret(next.caret);
    props.onChange(next.text);
    const key = mentionKey(candidate);
    const noticeText = noticed.current.seen.has(key) ? "" : String(props.mentionNotice?.(candidate) || "").trim();
    noticed.current.seen.add(key);
    if (noticeText) setNotices((prev) => [...prev.filter((n) => n.key !== key), { key, text: noticeText }]);
    setMentions(addMention(mentionsRef.current, candidate));
  };

  const submit = () => {
    const p = latest.current;
    if (!p.onSend) { p.onSubmit?.(); return; }
    const result = p.onSend(mentionSendPayload(p.value, mentionsOn ? mentionsRef.current : NO_MENTIONS));
    if (p.mentions !== undefined || !mentionsOn) return;
    const clear = () => setOwnMentions(NO_MENTIONS);
    if (result && typeof (result as Promise<unknown>).then === "function") void (result as Promise<unknown>).then(clear);
    else clear();
  };

  const mentionChips = mentionsOn && (mentions.length || mentionStatus) ? (
    <div className="pc-mention-chips" role="group" aria-label="Mentioned">
      {mentionStatus ? (
        <div className="pc-mention-notice pc-mention-notice--status" role="status">
          <Icon name="info" size={13} />
          <span>{mentionStatus}</span>
        </div>
      ) : null}
      {mentions.map((m) => (
        <AfChip
          key={mentionKey(m)}
          tone="accent"
          className="pc-mention-chip"
          title={m.kind === "entity" ? `${m.name} (entity)` : `${m.name} (agent)`}
          {...(disabled ? {} : { onRemove: () => setMentions(removeMention(mentionsRef.current, mentionKey(m))), removeLabel: `Remove ${m.name}` })}
        >
          <ChatAuthorMark mark={m.kind} look={m.avatar} initial={m.name} size={14} />
          <span className="pc-mention-chip__name" data-mention-kind={m.kind}>@{m.name}</span>
        </AfChip>
      ))}
      {visibleNotices.map((n) => (
        <div key={n.key} className="pc-mention-notice" role="status">
          <Icon name="info" size={13} />
          <span>{n.text}</span>
        </div>
      ))}
      {unavailable && mentions.length ? (
        <div className="pc-mention-notice pc-mention-notice--unavailable" role="status">
          <Icon name="warning" size={13} />
          <span>{unavailable}</span>
        </div>
      ) : null}
    </div>
  ) : null;

  const mentionList = open && unavailable ? (
    <div className="pc-mention-popover" data-status="unavailable">
      <div className="pc-mention-empty" role="status">{unavailable}</div>
    </div>
  ) : open ? (
    <div className="pc-mention-popover" data-status={shown.status}>
      {shown.items.length ? (
        <ul id={listId} className="pc-mention-list" role="listbox" aria-label="Mention someone">
          {shown.items.map((c, i) => (
            <li
              key={mentionKey(c)}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className="pc-mention-option"
              data-kind={c.kind}
              // The field keeps the focus (and the caret) while the pointer picks.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
            >
              <ChatAuthorMark mark={c.kind} look={c.avatar} initial={c.name} size={22} />
              <span className="pc-mention-option__text">
                <span className="pc-mention-option__name">{c.name}</span>
                {c.hint ? <span className="pc-mention-option__hint">{c.hint}</span> : null}
              </span>
              <span className="pc-mention-option__kind">{c.kind}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pc-mention-empty" role="status">
          {shown.status === "loading"
            ? "Looking for names…"
            : shown.status === "error"
              ? "The names could not be loaded."
              : shown.query
                ? `No name matches “${shown.query}”.`
                : "No one to mention here."}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={["pc-composer", compact ? "pc-composer--compact" : "", props.className].filter(Boolean).join(" ")}>
      {props.leading}
      {mentionChips}
      <textarea
        id={props.textareaId}
        ref={setTextarea}
        className={["pc-composer__textarea", props.textareaClassName].filter(Boolean).join(" ")}
        value={props.value}
        onChange={(e) => { if (mentionsOn) setCaret(e.target.selectionStart); props.onChange(e.target.value); }}
        rows={rows}
        // The textarea auto-grows (CSS field-sizing) from `rows` lines up to a
        // viewport-relative cap; the row count reaches the CSS as a variable.
        style={{ ["--pc-composer-rows" as string]: String(rows) } as React.CSSProperties}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        placeholder={props.placeholder || ""}
        aria-label={props.ariaLabel || props.placeholder || "Message"}
        aria-describedby={props.ariaDescribedBy}
        {...(mentionsOn
          ? {
              "aria-autocomplete": "list" as const,
              ...(open && shown.items.length ? { "aria-controls": listId } : {}),
              ...(open && activeIndex >= 0 ? { "aria-activedescendant": optionId(activeIndex) } : {}),
              onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => setCaret(e.currentTarget.selectionStart),
              onFocus: (e: React.FocusEvent<HTMLTextAreaElement>) => { setFocused(true); setCaret(e.currentTarget.selectionStart); },
              onBlur: () => setFocused(false),
            }
          : {})}
        disabled={disabled}
        autoFocus={Boolean(props.autoFocus)}
        onPaste={props.onPaste}
        onKeyDown={(e) => {
          if (open && !(e.nativeEvent.isComposing || e.keyCode === 229)) {
            const count = shown.items.length;
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && count) {
              e.preventDefault();
              setActive(moveMentionActive(activeIndex, count, e.key === "ArrowDown" ? 1 : -1));
              return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && activeIndex >= 0) {
              e.preventDefault();
              pick(shown.items[activeIndex]);
              return;
            }
            if (e.key === "Escape") {
              // Closes the list only (a drawer around the chat stays open).
              e.preventDefault();
              e.stopPropagation();
              setDismissedAt(trigger ? trigger.start : null);
              return;
            }
          }
          if (e.key !== "Enter" || e.shiftKey) return;
          if (props.submitKey === "mod-enter" && !e.ctrlKey && !e.metaKey) return;
          // Committing an IME composition with Enter must never send the
          // message (CJK input); nativeEvent.isComposing covers the commit
          // keystroke itself, keyCode 229 covers older engines.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          // Enter honors the same gate as the Send button — the busy/empty
          // contract is the component's, not something every consumer must
          // re-implement around a keyboard side door.
          if (!can_submit) return;
          submit();
        }}
      />

      <div className="pc-composer__row">
        <div className="pc-composer__actions">
          {props.onAttach ? <button type="button" className={compact ? "pc-composer__icon-action" : "pc-composer__icon-action pc-workflow-chat__icon-button"} aria-label={props.attachLabel || "Attach files"} data-af-tip={props.attachLabel || "Attach files"} aria-busy={props.attachPending || undefined} disabled={disabled || props.attachDisabled || props.attachPending} onClick={props.onAttach}>
            <Icon name={props.attachPending ? "loader" : compact ? "plus" : "paperclip"} size={16} />
            <span className={compact ? "pc-sr-only" : undefined}>{props.attachPending ? "Attaching…" : props.attachLabel || "Attach"}</span>
          </button> : null}
          {props.actions}
        </div>
        {props.trailingActions ? <div className="pc-composer__trailing">{props.trailingActions}</div> : null}
        <button
          type="button"
          className={[props.sendButtonClassName || "pc-btn", compact ? "pc-composer__send--compact" : ""].filter(Boolean).join(" ")}
          aria-label={compact ? (stopMode ? stopSpec?.label || "Stop" : sendLabel) : undefined}
          data-af-tip={compact ? (stopMode ? (stopping ? "Stopping…" : stopSpec?.label || "Stop") : sendLabel) : undefined}
          aria-busy={compact ? (stopMode ? stopping : busy) : undefined}
          data-mode={stopSpec ? (stopping ? "stopping" : stopMode ? "stop" : "send") : undefined}
          disabled={stopMode ? disabled || stopping : !can_submit}
          onClick={() => (stopMode ? stopSpec?.onStop() : submit())}
        >
          {compact ? (
            stopSpec ? (
              <span className="pc-composer__morph" aria-hidden="true">
                <Icon name="send" size={17} />
                <Icon name="stop" size={17} />
                <Icon name="loader" size={17} />
              </span>
            ) : (
              <Icon name={busy ? "loader" : "send"} size={17} />
            )
          ) : sendLabel}
        </button>
      </div>
      {mentionList}
      {props.overlay}
    </div>
  );
});
