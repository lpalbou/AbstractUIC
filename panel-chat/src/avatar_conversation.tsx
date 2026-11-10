import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChatMessageCard, speakButtonView, type ChatMessage, type ChatMessageCardProps } from "./chat_message_card.js";
import { Icon } from "@abstractframework/ui-kit";
import type { WorkflowConnection } from "./workflow_runtime.js";
import { TextLinks } from "./text_links.js";
import type { WorkflowToolActivity } from "./workflow_evidence.js";
import { DEFAULT_CONVERSATION_CUES, conversationCueStep, conversationFindings, conversationLive, conversationNarrationStep, conversationMessages, conversationState, type AvatarConversationState, type ConversationAttention, type ConversationCue, type ConversationCueCursor, type ConversationCuePreferences, type ConversationFinding } from "./conversation_model.js";

export type AvatarConversationOptions = {
  /** Stable conversation identity, not the identity of each individual turn. */
  sessionKey: string;
  /** Host renders its own avatar, animation and accessible name. */
  avatar: React.ReactNode;
  status?: AvatarConversationState;
  listening?: boolean;
  speaking?: boolean;
  connection?: WorkflowConnection;
  /** Snapshot/history reconstruction is a silent baseline, even if the stream is connected. */
  replaying?: boolean;
  attention?: ConversationAttention | null;
  /** Cue channels per attention kind; both on by default. Hosts edit them in their settings, never inside this view. */
  preferences?: ConversationCuePreferences;
  onPreferencesChange?: (preferences: ConversationCuePreferences) => void;
  /** Foreground fresh-revision cues only. The host owns sounds/haptics. */
  onCue?: (cue: ConversationCue) => void;
  /** Explicit opt-in; the host owns its existing speech stack and handles errors. */
  narrate?: boolean;
  onNarrate?: (message: ChatMessage) => void;
  /** Called before voice, reply, reading a held line or the findings, or session reset. */
  onInterruptSpeech?: () => void;
  onReplyContext?: (message: ChatMessage | null) => void;
  /** Hosts use this to suppress their existing automatic final speech while the person reads or replies. */
  onAttendedChange?: (attended: boolean) => void;
  voiceControl?: React.ReactNode;
  /** Playback actions do not trigger the microphone interruption hook. */
  playbackControl?: React.ReactNode;
  /** Open the host's detailed conversation; does not answer a pending request. */
  onTechnicalView?: () => void;
};
export type AvatarConversationProps = AvatarConversationOptions & {
  messages: ChatMessage[];
  /** Existing authoritative question or approval controls, supplied by the host. */
  interaction?: React.ReactNode;
  /** Exact currently rendered request; an empty ID means the host deferred it. */
  interactionId?: string;
  /** Draft editing or other host-owned attention: silences narration and non-essential cues. The live line keeps updating. */
  attended?: boolean;
  /** Shared message rendering (live line, answer, findings), with private reasoning removed before presentation. */
  messageProps?: Omit<ChatMessageCardProps, "message">;
};
const labels: Record<AvatarConversationState, string> = {
  idle: "Ready", working: "Working", paused: "Paused — work resumes only when you continue", listening: "Listening — your words have not been submitted", speaking: "Speaking", question: "A question for you", approval: "Permission required", completed: "Completed", failed: "Work stopped", connecting: "Connecting…", disconnected: "Connection interrupted",
};

/**
 * Optional public presentation: the avatar, its status, ONE live line (the latest public update,
 * replaced as new ones arrive), any open question or approval pinned above it, the turn's answer
 * shown once as a message, and the findings the actor reported so far beside the avatar (a sheet
 * the person opens on a narrow screen). No model, microphone, network or permission side effects.
 */
export function AvatarConversation(props: AvatarConversationProps): React.ReactElement {
  // Keyed child resets history/selection state immediately on a conversation switch.
  return <AvatarConversationSession key={props.sessionKey} {...props} />;
}

type CardProps = Pick<ChatMessageCardProps, "renderMarkdown" | "images" | "inlineImage" | "onOpenMedia" | "jsonCollapseAfterDepth" | "renderMentionCard">;
const contentOnly = () => "caption" as const;
/** Content only (the shared renderer: Markdown, links, media, files), re-rendered only when its message or renderer changes. */
const ContentCard = React.memo(function ContentCard(props: CardProps & { message: ChatMessage }): React.ReactElement {
  return <ChatMessageCard {...props} showCopy={false} variant={contentOnly} />;
});
const cardProps = (shared?: Omit<ChatMessageCardProps, "message">): CardProps => ({ renderMarkdown: shared?.renderMarkdown, images: shared?.images, inlineImage: shared?.inlineImage, onOpenMedia: shared?.onOpenMedia, jsonCollapseAfterDepth: shared?.jsonCollapseAfterDepth, renderMentionCard: shared?.renderMentionCard });
/** A click on a link or control inside opened content acts on that element, not on the content. */
const ownClick = (event: React.SyntheticEvent): boolean => !(event.target as Element).closest?.("a, button, input, textarea, select, summary, video, audio");
/** What a cited result reads in plain words: its address, file or query; nothing else is shown. */
const SOURCE_FIELDS = ["url", "file_path", "path", "query"];
function sourceText(tool: WorkflowToolActivity): string {
  const args = tool.arguments && typeof tool.arguments === "object" && !Array.isArray(tool.arguments) ? tool.arguments as Record<string, unknown> : {};
  const value = SOURCE_FIELDS.map((field) => args[field]).find((v) => typeof v === "string" && v.trim());
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Content that opens on click. While closed, a real button covers it (so its links are never
 * nested inside a button) and is named by the content; once open, the content's own links work.
 */
function Expandable(props: { className: string; open: boolean; onOpen: () => void; openerRef?: React.Ref<HTMLButtonElement>; children: React.ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">): React.ReactElement {
  const { className, open, onOpen, openerRef, children, ...rest } = props;
  const id = useId();
  return <div {...rest} className={`${className} pc-avatar-conversation__expandable`} data-open={open || undefined}>
    <div id={id}>{children}</div>
    {open ? null : <button ref={openerRef} type="button" className="pc-avatar-conversation__opener" aria-expanded={false} aria-labelledby={id} onClick={onOpen} />}
  </div>;
}

/** One finding: its text (shortened until opened) and, when opened, the results it cited. */
const FindingCard = React.memo(function FindingCard(props: CardProps & { finding: ConversationFinding; onOpen: () => void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const reopen = useRef(false);
  const { finding, onOpen, ...card } = props;
  useEffect(() => {
    if (open) body.current?.focus();
    else if (reopen.current) { reopen.current = false; opener.current?.focus(); }
  }, [open]);
  const close = () => { reopen.current = true; setOpen(false); };
  const sources = finding.sources.map((tool) => ({ id: tool.id, text: sourceText(tool) })).filter((source) => source.text);
  return <div ref={body} className="pc-avatar-conversation__finding" data-open={open || undefined} tabIndex={open ? -1 : undefined}
    onClick={(event) => { if (open && ownClick(event)) close(); }}
    onKeyDown={(event) => { if (open && event.key === "Escape") { event.stopPropagation(); close(); } }}>
    <Expandable className="pc-avatar-conversation__finding-text" open={open} openerRef={opener} onOpen={() => { onOpen(); setOpen(true); }}>
      <ContentCard {...card} message={finding.message} />
    </Expandable>
    {open && sources.length ? <ul className="pc-avatar-conversation__sources" aria-label="Sources">
      {sources.map((source) => <li key={source.id}><TextLinks text={source.text} /></li>)}
    </ul> : null}
  </div>;
}, (a, b) => a.finding.message === b.finding.message && a.finding.sources.length === b.finding.sources.length && a.finding.sources.every((tool, i) => tool === b.finding.sources[i])
  && a.onOpen === b.onOpen && a.renderMarkdown === b.renderMarkdown && a.images === b.images && a.inlineImage === b.inlineImage && a.onOpenMedia === b.onOpenMedia && a.jsonCollapseAfterDepth === b.jsonCollapseAfterDepth);

/** The width at which Findings float beside the avatar instead of opening as a sheet (panel_chat.css). */
const FLOATING_FINDINGS_WIDTH = 720;

function AvatarConversationSession(props: AvatarConversationProps): React.ReactElement {
  // A held line stays in place, opened, until the person chooses Latest; otherwise the line follows.
  const [held, setHeld] = useState<ChatMessage | null>(null);
  const [replying, setReplying] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const preferences = props.preferences || DEFAULT_CONVERSATION_CUES;
  const messages = useMemo(() => conversationMessages(props.messages), [props.messages]);
  const hasRequest = Boolean(props.interaction) && (props.interactionId === undefined || Boolean(props.interactionId));
  const live = useMemo(() => conversationLive(props.messages, { pinnedRequest: hasRequest }), [props.messages, hasRequest]);
  const findings = useMemo(() => conversationFindings(props.messages), [props.messages]);
  const attended = Boolean(props.attended || held || (findingsOpen && findings.length));
  useEffect(() => { props.onAttendedChange?.(attended); return () => props.onAttendedChange?.(false); }, [attended, props.onAttendedChange]);
  const state = conversationState(props);
  const cursor = useRef<ConversationCueCursor | null>(null);
  const narrationCursor = useRef<ConversationCueCursor | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    return () => { callbacks.current.onInterruptSpeech?.(); callbacks.current.onReplyContext?.(null); };
  }, []);
  useEffect(() => {
    if (props.listening) callbacks.current.onInterruptSpeech?.();
  }, [props.listening]);
  // The person's next message (a new turn or guidance) ends a reply to a held line: follow again.
  const personKey = useRef(live.personKey);
  useEffect(() => {
    if (personKey.current === live.personKey) return;
    personKey.current = live.personKey;
    setHeld(null);
    setReplying((was) => { if (was) callbacks.current.onReplyContext?.(null); return false; });
  }, [live.personKey]);
  useEffect(() => {
    const connected = !props.replaying && (!props.connection || props.connection === "connected" || props.status === "completed" || props.status === "failed") && (typeof document === "undefined" || document.visibilityState !== "hidden");
    const next = conversationCueStep(cursor.current, { sessionKey: props.sessionKey, connected, attended, attention: props.attention, preferences });
    cursor.current = next.cursor;
    if (next.cue) props.onCue?.(next.cue);
  }, [props.sessionKey, props.connection, props.status, props.replaying, props.attention, props.onCue, attended, preferences]);
  useEffect(() => {
    const connected = !props.replaying && (!props.connection || props.connection === "connected" || props.status === "completed" || props.status === "failed") && (typeof document === "undefined" || document.visibilityState !== "hidden");
    const next = conversationNarrationStep(narrationCursor.current, { sessionKey: props.sessionKey, connected, attended, enabled: Boolean(props.narrate) && props.status !== "paused", listening: props.listening, messages });
    narrationCursor.current = next.cursor;
    if (next.message) { props.onInterruptSpeech?.(); props.onNarrate?.(next.message); }
  }, [messages, props.sessionKey, props.connection, props.replaying, props.status, props.narrate, props.listening, props.onNarrate, props.onInterruptSpeech, attended]);

  // Stable, so memoized finding cards always reach the host's current callback.
  const interrupt = useCallback(() => callbacks.current.onInterruptSpeech?.(), []);
  const line = held || live.line;
  const section = useRef<HTMLElement | null>(null);
  const liveArea = useRef<HTMLDivElement | null>(null);
  const lineActions = useRef<HTMLDivElement | null>(null);
  const toggle = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  // Focus follows the person: into the held line's actions, and back to the line only when they
  // choose Latest (never when their own message ends the hold: focus stays where they typed).
  const focusLine = useRef(false);
  useEffect(() => {
    if (held) lineActions.current?.querySelector("button")?.focus();
    else if (focusLine.current) (liveArea.current?.querySelector<HTMLElement>(".pc-avatar-conversation__opener") || liveArea.current)?.focus();
    focusLine.current = false;
  }, [held]);
  const hold = () => { if (!line) return; interrupt(); setHeld(line); };
  const reply = () => { if (!held) return; interrupt(); setReplying(true); props.onReplyContext?.(held); };
  const latest = () => { focusLine.current = true; setHeld(null); if (replying) { setReplying(false); props.onReplyContext?.(null); } };
  // The sheet takes focus when opened and returns it to Findings when closed.
  useEffect(() => { if (findingsOpen) closeButton.current?.focus(); }, [findingsOpen]);
  const openFindings = () => { interrupt(); setFindingsOpen(true); };
  const closeFindings = () => { setFindingsOpen(false); toggle.current?.focus(); };
  // Findings float on a wide view: a sheet left open on a narrow one closes when the view widens.
  useEffect(() => {
    const el = section.current;
    if (!findingsOpen || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width >= FLOATING_FINDINGS_WIDTH) setFindingsOpen(false); });
    observer.observe(el);
    return () => observer.disconnect();
  }, [findingsOpen]);
  const attention = props.attention && preferences[props.attention.kind].visual ? props.attention : null;
  const card = cardProps(props.messageProps);
  const { renderFooter: _footer, ...answerProps } = props.messageProps || {};
  const lineSpeech = line?.kind === "public_update" && props.messageProps?.onSpeakToggle
    ? speakButtonView(props.messageProps.getSpeakState?.(line) || "idle") : null;
  return <section ref={section} className="pc-avatar-conversation" aria-label="Avatar conversation" data-state={state} data-has-request={hasRequest || undefined} data-compact={hasRequest || undefined}
    data-has-findings={findings.length ? "" : undefined} data-findings-open={findings.length && findingsOpen ? "" : undefined}
    onKeyDown={(event) => { if (event.key === "Escape" && findingsOpen && findings.length) closeFindings(); }}>
    <div className="pc-avatar-conversation__presence">
      <div className="pc-avatar-conversation__scene">{props.avatar}</div>
      <p className="pc-avatar-conversation__status" role="status">{labels[state]}</p>
    </div>
    {findings.length ? <aside className="pc-avatar-conversation__findings" aria-label="Findings">
      <div className="pc-avatar-conversation__findings-head">
        <h2>Findings</h2>
        <button ref={closeButton} type="button" className="pc-avatar-conversation__findings-close" onClick={closeFindings}>Close</button>
      </div>
      <ol>{findings.map((finding) => <li key={finding.key}><FindingCard {...card} finding={finding} onOpen={interrupt} /></li>)}</ol>
    </aside> : null}
    {attention && attention.kind !== "completion" && !hasRequest ? <p className="pc-avatar-conversation__attention" data-kind={attention.kind}>
      {attention.kind === "approval" ? "An explicit decision is required. Waiting never grants permission." : attention.importance === "essential" ? "Your answer is required. I will keep waiting." : "Your input is welcome."}
      {attention.kind === "question" && attention.importance === "clarification" ? <> {attention.deadline && Number.isFinite(Date.parse(attention.deadline)) ? <>Answer by <time dateTime={attention.deadline}>{new Date(attention.deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>. </> : null}{attention.fallback ? `Without an answer: ${attention.fallback}` : ""}</> : null}
    </p> : null}
    {hasRequest ? <div className="pc-avatar-conversation__request">{props.interaction}</div> : null}
    <div ref={liveArea} className="pc-avatar-conversation__live" aria-live={attended ? "off" : "polite"} tabIndex={-1}>
      {line ? <Expandable key={line.id || line.content} className="pc-avatar-conversation__line" open={Boolean(held)} onOpen={hold}>
        <ContentCard {...card} message={line} />
      </Expandable> : null}
      {line && lineSpeech ? <button type="button" className="pc-chat-icon-btn" aria-label={lineSpeech.title} title={lineSpeech.title}
        onClick={() => props.messageProps?.onSpeakToggle?.(line)}>
        <Icon key={lineSpeech.icon} name={lineSpeech.icon} size={22} className={lineSpeech.spinning ? "pc-chat-speak-spinner" : undefined} />
      </button> : null}
      {held ? <div ref={lineActions} className="pc-avatar-conversation__line-actions">
        {held.kind === "public_update" ? <button type="button" aria-pressed={replying} onClick={reply}>Reply to this</button> : null}
        <button type="button" onClick={latest}>Latest</button>
      </div> : null}
    </div>
    {live.answers.length ? <div className="pc-avatar-conversation__answer" aria-live={attended ? "off" : "polite"} data-attention={attention?.kind === "completion" ? "completion" : undefined}>
      {live.answers.map((answer) => <ChatMessageCard key={answer.id || answer.content} {...answerProps} message={answer} />)}
    </div> : null}
    {!hasRequest ? props.interaction : null}
    <div className="pc-avatar-conversation__actions">
      {findings.length ? <button ref={toggle} type="button" className="pc-avatar-conversation__findings-toggle" aria-expanded={findingsOpen} onClick={() => (findingsOpen ? closeFindings() : openFindings())}>Findings</button> : null}
      {props.voiceControl ? <span onPointerDownCapture={interrupt} onKeyDownCapture={(event) => { if (event.key === "Enter" || event.key === " ") interrupt(); }}>{props.voiceControl}</span> : null}
      {props.playbackControl}
    </div>
  </section>;
}
