import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@abstractframework/ui-kit";

import { ChatAuthorMark } from "./author_mark.js";
import {
  MENTION_CLIPBOARD_TYPE,
  mentionAtCaret,
  mentionClipboard,
  mentionEnd,
  mentionKey,
  mentionPickEdit,
  mentionSelection,
  mentionSendPayload,
  mentionsAfterEdit,
  mentionsAfterSend,
  mentionsFromClipboard,
  mentionsInText,
  mentionsWithInserted,
  mentionTriggerAt,
  moveMentionActive,
  unsentMentionsOf,
  usableCandidates,
  type ChatComposerSend,
  type ChatMention,
  type ChatMentionCandidate,
} from "./mentions.js";

const NO_MENTIONS: ChatMention[] = [];
/** The chips the person can undo back to: the text and its chips after each edit (newest last). */
const HISTORY_MAX = 200;
/**
 * The field's own text styles a mirror must share to lay out its words exactly where the field
 * draws them (the chips are drawn by a mirror over the field: see `ChatComposer`).
 */
const MIRROR_STYLE = [
  "font-family", "font-size", "font-weight", "font-style", "font-variant", "font-stretch", "font-kerning",
  "font-feature-settings", "font-variation-settings", "font-optical-sizing", "line-height", "letter-spacing",
  "word-spacing", "text-indent", "text-transform", "text-align", "text-rendering", "tab-size", "white-space",
  "word-break", "overflow-wrap", "hyphens", "direction", "unicode-bidi", "padding-top", "padding-right",
  "padding-bottom", "padding-left", "color", "-webkit-font-smoothing",
];
const sameChips = (a: readonly ChatMention[], b: readonly ChatMention[]) =>
  a.length === b.length && a.every((m, i) => mentionKey(m) === mentionKey(b[i]) && m.start === b[i].start);
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
   * Send with the picked mentions: `{text, mentions: [{id, name, kind, index, start}]}`. `text` is
   * the message as shown, each chip written as "@" + its name; `mentions` are the chips in text
   * order, `index` 0, 1, … (the gateway's `mention_index`) and `start` where the chip's "@Name"
   * sits in `text`. Wins over `onSubmit`. Uncontrolled chips are cleared once it returns (or its
   * promise resolves); a throw or a rejection keeps them.
   */
  onSend?: (send: ChatComposerSend) => void | Promise<unknown>;
  /**
   * `@` mentions. Typing `@` opens a list of the names this returns for the query typed after
   * it (the HOST decides the source, e.g. `GET /entities`; it is called as the person types, so
   * cache in the host). A pick puts a chip bound to that candidate in the text, in place of the
   * typed `@query`; an `@` that was not picked stays plain text. Absent: no list and no chips.
   */
  mentionCandidates?: (query: string) => Promise<ChatMentionCandidate[]>;
  /**
   * Controlled chips, each with `start` (where its "@Name" sits in `value`); `onMentionsChange`
   * gets them in text order after every edit. A chip whose "@Name" is not at its `start` is not
   * in the message (not drawn, not sent) until the text holds it there again (a draft the host
   * restores after a failed send); the person's next edit drops it. Omit to let the composer keep them.
   */
  mentions?: ChatMention[];
  onMentionsChange?: (mentions: ChatMention[]) => void;
  /**
   * The sentence shown above the field the first time a name is picked in this conversation
   * (e.g. "Castor will read this conversation's history"), while its chip is in the text. The
   * host writes it; null = none.
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
  /** Runs first; a `preventDefault()` here (e.g. pasted files) keeps the composer's own paste out. */
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
  // The chips in the text right now (each one's "@Name" at its `start`), in text order.
  const inText = mentionsOn ? mentionsInText(String(props.value ?? ""), mentions) : NO_MENTIONS;
  const overlay = inText.length > 0;
  // The text the chips are placed against: the field's value as of the last render or edit.
  const textRef = useRef(String(props.value ?? ""));
  textRef.current = String(props.value ?? "");
  const history = useRef<Array<{ text: string; mentions: ChatMention[] }>>([]);
  const remember = (text: string, chips: ChatMention[]) => {
    const h = history.current;
    const last = h[h.length - 1];
    if (last && last.text === text && sameChips(last.mentions, chips)) return;
    h.push({ text, mentions: chips });
    if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
  };
  // A pick or a paste of chips in flight: the chips its text brings, placed at `at` once it lands.
  const pendingInsert = useRef<{ at: number; mentions: ChatMention[] } | null>(null);
  const composingRef = useRef(false);
  const [composing, setComposing] = useState(false);
  const lastCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  // An `@` that is a chip's own is not one being typed.
  const typed = mentionsOn && focused && !disabled && caret !== null ? mentionTriggerAt(props.value, caret) : null;
  const trigger = typed && !inText.some((m) => typed.start >= (m.start as number) && typed.start < mentionEnd(m)) ? typed : null;
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
  const loaded: MentionsFound = query === null ? NOTHING_FOUND : found.query === query ? found : { query, items: found.items, status: "loading" };
  // A name already in the text is not offered again (one chip per name and message).
  const pickedKeys = new Set(inText.map(mentionKey));
  const shown: MentionsFound = { ...loaded, items: loaded.items.filter((c) => !pickedKeys.has(mentionKey(c))) };
  const alreadyPicked = loaded.items.length > 0 && shown.items.length === 0;
  const activeIndex = shown.items.length ? Math.min(Math.max(active, 0), shown.items.length - 1) : -1;
  const listId = `${useId()}mentions`;
  const optionId = (i: number) => `${listId}-${i}`;

  // First pick of a name in this conversation: the host's sentence above the field.
  const noticed = useRef<{ key: string | undefined; seen: Set<string> }>({ key: props.mentionSessionKey, seen: new Set() });
  if (noticed.current.key !== props.mentionSessionKey) noticed.current = { key: props.mentionSessionKey, seen: new Set() };
  const [notices, setNotices] = useState<Array<{ key: string; text: string }>>([]);
  useEffect(() => { if (!mentions.length && notices.length) setNotices([]); }, [mentions.length, notices.length]);
  const chipKeys = new Set(inText.map(mentionKey));
  const visibleNotices = notices.filter((n) => chipKeys.has(n.key));

  const pendingCaret = useRef<number | null>(null);
  useCaretEffect(() => {
    const element = textarea.current;
    if (pendingCaret.current === null || !element) return;
    const at = Math.min(pendingCaret.current, element.value.length);
    pendingCaret.current = null;
    element.setSelectionRange(at, at);
  }, [props.value]);

  /**
   * The chips once the person's edit turned the text into `next` (`caret`: where the caret is
   * now). A pick or a paste in flight places its own chips; an undo or a redo brings back the
   * chips that text had; any other edit keeps, moves or drops the chips around it.
   */
  const edited = (next: string, caretNow: number | null, inputType: string) => {
    const prev = textRef.current;
    const now = mentionsRef.current;
    remember(prev, mentionsInText(prev, now));
    const pending = pendingInsert.current;
    pendingInsert.current = null;
    let chips: ChatMention[];
    const back = inputType === "historyUndo" || inputType === "historyRedo"
      ? [...history.current].reverse().find((h) => h.text === next)
      : undefined;
    if (back) chips = mentionsInText(next, back.mentions);
    else chips = mentionsAfterEdit(prev, next, now, caretNow);
    if (pending) chips = mentionsWithInserted(next, chips, pending.at, pending.mentions);
    textRef.current = next;
    remember(next, chips);
    if (!sameChips(now, chips)) setMentions(chips);
  };

  /**
   * Types `text` over the field's selection as the person would (the browser's own editing
   * command, so undo and redo hold it), bringing `chips` (placed relative to its start). Without
   * that command (a server render, a test harness) the composer writes the text itself.
   */
  const typeIn = (text: string, chips: ChatMention[], range: { from: number; to: number }, caretAfter?: number) => {
    const element = textarea.current;
    if (element && typeof document !== "undefined" && typeof document.execCommand === "function") {
      if (document.activeElement !== element) element.focus();
      pendingInsert.current = { at: range.from, mentions: chips };
      let typedIn = false;
      if (document.activeElement === element) {
        element.setSelectionRange(range.from, range.to);
        try { typedIn = document.execCommand(text ? "insertText" : "delete", false, text); } catch { typedIn = false; }
      }
      if (typedIn && pendingInsert.current === null) {
        if (typeof caretAfter === "number" && caretAfter !== element.selectionEnd) element.setSelectionRange(caretAfter, caretAfter);
        setCaret(element.selectionEnd);
        return;
      }
      pendingInsert.current = null;
    }
    const value = textRef.current;
    const next = value.slice(0, range.from) + text + value.slice(range.to);
    const at = typeof caretAfter === "number" ? caretAfter : range.from + text.length;
    pendingInsert.current = { at: range.from, mentions: chips };
    edited(next, range.from + text.length, "insertText");
    pendingCaret.current = at;
    setCaret(at);
    latest.current.onChange(next);
  };

  const pick = (candidate: ChatMentionCandidate) => {
    if (!trigger) return;
    const at = textarea.current ? textarea.current.selectionStart : caret ?? props.value.length;
    const edit = mentionPickEdit(textRef.current, trigger, at, candidate);
    const key = mentionKey(candidate);
    const noticeText = noticed.current.seen.has(key) ? "" : String(props.mentionNotice?.(candidate) || "").trim();
    noticed.current.seen.add(key);
    if (noticeText) setNotices((prev) => [...prev.filter((n) => n.key !== key), { key, text: noticeText }]);
    typeIn(edit.insert, [{ ...candidate, start: 0 }], { from: edit.from, to: edit.to }, edit.caret);
  };

  // The caret never rests inside a chip: it steps over it, and a selection takes chips whole.
  const keepOffChips = (element: HTMLTextAreaElement) => {
    const from = lastCaret.current;
    lastCaret.current = element.selectionEnd;
    if (composingRef.current || !inText.length) return;
    const kept = mentionSelection(element.value, mentionsRef.current, element.selectionStart, element.selectionEnd, from);
    if (kept.start === element.selectionStart && kept.end === element.selectionEnd) return;
    element.setSelectionRange(kept.start, kept.end, element.selectionDirection || "none");
    lastCaret.current = kept.end;
  };

  // A click or a touch settles the caret after its own events (a textarea's selection lands on
  // `selectionchange`, which React's onSelect does not follow there): the document's event too.
  const keepOff = useRef(keepOffChips);
  keepOff.current = keepOffChips;
  useEffect(() => {
    if (!overlay || typeof document === "undefined") return;
    const onSelection = () => { const element = textarea.current; if (element && document.activeElement === element) keepOff.current(element); };
    document.addEventListener("selectionchange", onSelection, true);
    return () => document.removeEventListener("selectionchange", onSelection, true);
  }, [overlay]);

  // A copy that holds chips carries them (MENTION_CLIPBOARD_TYPE) beside its plain text.
  const copyChips = (e: React.ClipboardEvent<HTMLTextAreaElement>, cut: boolean) => {
    const element = e.currentTarget;
    const from = element.selectionStart;
    const to = element.selectionEnd;
    if (!mentionsOn || from === to || !e.clipboardData) return;
    const data = mentionClipboard(element.value, mentionsRef.current, from, to);
    if (!data) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", element.value.slice(from, to));
    e.clipboardData.setData(MENTION_CLIPBOARD_TYPE, data);
    if (cut && !disabled) typeIn("", [], { from, to });
  };

  // ---- the chips in the text: a mirror of the field draws them where their words are ---------
  // The field stays a <textarea> (native typing, IME, undo, mobile keyboards). While chips are in
  // the text, its glyphs are transparent and a mirror over it (same box, same text styles, same
  // words, pointer-transparent) draws the text with each chip styled in place.
  const mirror = useRef<HTMLDivElement | null>(null);
  const placeMirror = useCallback(() => {
    const element = textarea.current;
    const layer = mirror.current;
    if (!element || !layer || typeof getComputedStyle !== "function") return;
    const style = getComputedStyle(element);
    for (const name of MIRROR_STYLE) layer.style.setProperty(name, style.getPropertyValue(name));
    // Exact (fractional) geometry: offsetTop/clientWidth round to whole pixels, and half a pixel
    // moves every glyph. The box is the field's padding box, less any scrollbar.
    const parent = layer.offsetParent as HTMLElement | null;
    const box = element.getBoundingClientRect();
    const origin = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
    const [bl, br, bt, bb] = [px("border-left-width"), px("border-right-width"), px("border-top-width"), px("border-bottom-width")];
    const barX = Math.max(0, element.offsetWidth - element.clientWidth - Math.round(bl + br));
    const barY = Math.max(0, element.offsetHeight - element.clientHeight - Math.round(bt + bb));
    layer.style.left = `${box.left - origin.left - (parent ? parent.clientLeft : 0) + bl}px`;
    layer.style.top = `${box.top - origin.top - (parent ? parent.clientTop : 0) + bt}px`;
    layer.style.width = `${box.width - bl - br - barX}px`;
    layer.style.height = `${box.height - bt - bb - barY}px`;
    layer.scrollTop = element.scrollTop;
    layer.scrollLeft = element.scrollLeft;
  }, []);
  useCaretEffect(() => { if (overlay) placeMirror(); });
  useEffect(() => {
    const element = textarea.current;
    if (!overlay || !element) return;
    element.addEventListener("scroll", placeMirror);
    window.addEventListener("resize", placeMirror);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(placeMirror);
    observer?.observe(element);
    return () => { observer?.disconnect(); element.removeEventListener("scroll", placeMirror); window.removeEventListener("resize", placeMirror); };
  }, [overlay, placeMirror]);
  const mirrorDescription = `${useId()}mentioned`;
  const mirrorText = (() => {
    if (!overlay) return null;
    const value = String(props.value ?? "");
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const m of inText) {
      const start = m.start as number;
      if (start > at) parts.push(value.slice(at, start));
      parts.push(
        <span key={mentionKey(m)} className="pc-mention-chip pc-mention-chip--inline" data-mention-key={mentionKey(m)} data-mention-kind={m.kind}>
          <span className="pc-mention-chip__at">@<span className="pc-mention-chip__mark"><ChatAuthorMark mark={m.kind} look={m.avatar} initial={m.name} size={14} /></span></span>
          <span className="pc-mention-chip__name" data-mention-kind={m.kind}>{m.name}</span>
        </span>,
      );
      at = mentionEnd(m);
    }
    if (at < value.length) parts.push(value.slice(at));
    // A last empty line (text ending in a newline) is a line the field draws too.
    if (value.endsWith("\n")) parts.push("\u200b");
    return parts;
  })();

  const submit = () => {
    const p = latest.current;
    if (!p.onSend) { p.onSubmit?.(); return; }
    // While mentions are unavailable (an older gateway) the chips already picked are not sent.
    const held = mentionsOn ? mentionsRef.current : NO_MENTIONS;
    const usable = mentionsOn && !String(p.mentionsUnavailable || "").trim();
    const result = p.onSend(mentionSendPayload(p.value, usable ? held : NO_MENTIONS));
    if (p.mentions !== undefined || !mentionsOn) return;
    // This send's chips go once it is through (chips picked meanwhile stay); a send that
    // stopped partway keeps the `unsentMentions` it names, and a failed send keeps them all.
    const settle = (settled: unknown, failed: boolean) => {
      const keep = unsentMentionsOf(settled);
      if (failed && keep === null) return;
      setMentions(mentionsAfterSend(mentionsRef.current, held, keep ?? []));
    };
    if (result && typeof (result as Promise<unknown>).then === "function")
      void (result as Promise<unknown>).then(
        (value) => settle(value, false),
        (reason) => { settle(reason, true); throw reason; },
      );
    else settle(result, false);
  };

  // The host's sentences above the field (the chips themselves are in the text).
  const mentionLines = mentionsOn && (mentionStatus || visibleNotices.length || (unavailable && inText.length)) ? (
    <div className="pc-mention-notices">
      {mentionStatus ? (
        <div className="pc-mention-notice pc-mention-notice--status" role="status">
          <Icon name="info" size={13} />
          <span>{mentionStatus}</span>
        </div>
      ) : null}
      {visibleNotices.map((n) => (
        <div key={n.key} className="pc-mention-notice" role="status">
          <Icon name="info" size={13} />
          <span>{n.text}</span>
        </div>
      ))}
      {unavailable && inText.length ? (
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
              : alreadyPicked
                ? "Already mentioned."
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
      {mentionLines}
      <textarea
        id={props.textareaId}
        ref={setTextarea}
        className={["pc-composer__textarea", props.textareaClassName].filter(Boolean).join(" ")}
        value={props.value}
        onChange={(e) => {
          if (mentionsOn) {
            const field = e.target;
            const at = typeof field.selectionEnd === "number" ? field.selectionEnd : field.selectionStart;
            setCaret(typeof field.selectionStart === "number" ? field.selectionStart : null);
            edited(field.value, typeof at === "number" ? at : null, String((e.nativeEvent as InputEvent | undefined)?.inputType || ""));
          }
          props.onChange(e.target.value);
        }}
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
        aria-describedby={[props.ariaDescribedBy, overlay ? mirrorDescription : ""].filter(Boolean).join(" ") || undefined}
        {...(mentionsOn
          ? {
              "aria-autocomplete": "list" as const,
              ...(open && shown.items.length ? { "aria-controls": listId } : {}),
              ...(open && activeIndex >= 0 ? { "aria-activedescendant": optionId(activeIndex) } : {}),
              ...(overlay ? { "data-mention-overlay": "" } : {}),
              ...(overlay && composing ? { "data-composing": "" } : {}),
              onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => { keepOffChips(e.currentTarget); setCaret(e.currentTarget.selectionStart); },
              onFocus: (e: React.FocusEvent<HTMLTextAreaElement>) => { setFocused(true); setCaret(e.currentTarget.selectionStart); },
              onBlur: () => setFocused(false),
              onCopy: (e: React.ClipboardEvent<HTMLTextAreaElement>) => copyChips(e, false),
              onCut: (e: React.ClipboardEvent<HTMLTextAreaElement>) => copyChips(e, true),
              onCompositionStart: () => { composingRef.current = true; setComposing(true); },
              onCompositionEnd: () => { composingRef.current = false; setComposing(false); },
            }
          : {})}
        disabled={disabled}
        autoFocus={Boolean(props.autoFocus)}
        onPaste={(e) => {
          props.onPaste?.(e);
          if (e.defaultPrevented || !mentionsOn || !e.clipboardData) return;
          // Only chips this composer copied come back as chips; any other text is plain text.
          const plain = e.clipboardData.getData("text/plain");
          const chips = mentionsFromClipboard(e.clipboardData.getData(MENTION_CLIPBOARD_TYPE), plain);
          if (!chips) return;
          e.preventDefault();
          const field = e.currentTarget;
          typeIn(plain, chips, { from: field.selectionStart, to: field.selectionEnd });
        }}
        onKeyDown={(e) => {
          // Backspace just after a chip (Delete just before one) takes the whole chip: the chip
          // is selected and the key's own deletion removes it (one undo step, as typed).
          if (mentionsOn && (e.key === "Backspace" || e.key === "Delete") && !(e.nativeEvent.isComposing || e.keyCode === 229)) {
            const field = e.currentTarget;
            if (field && field.selectionStart === field.selectionEnd) {
              const chip = mentionAtCaret(field.value, mentionsRef.current, field.selectionStart, e.key === "Backspace" ? "before" : "after");
              if (chip) field.setSelectionRange(chip.start as number, mentionEnd(chip));
            }
          }
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
            // The names are still loading: Enter waits for them (it would send the typed `@…` as
            // text, with no mention). Escape closes the list; then Enter sends.
            if (e.key === "Enter" && !e.shiftKey && !unavailable && shown.status === "loading") {
              e.preventDefault();
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
      {overlay ? (
        <div ref={mirror} className="pc-composer__mirror" aria-hidden="true" data-composing={composing ? "" : undefined}>
          {mirrorText}
        </div>
      ) : null}
      {overlay ? (
        <span id={mirrorDescription} className="pc-sr-only">{inText.map((m) => `mention: ${m.name}`).join(", ")}</span>
      ) : null}
      {mentionList}
      {props.overlay}
    </div>
  );
});
