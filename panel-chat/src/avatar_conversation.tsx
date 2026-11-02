import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessageCard, type ChatMessage, type ChatMessageCardProps } from "./chat_message_card.js";
import type { WorkflowConnection } from "./workflow_runtime.js";
import { DEFAULT_CONVERSATION_CUES, type ConversationCaption, conversationCaptions, conversationCueStep, conversationLabel, conversationNarrationStep, conversationMessages, conversationState, type AvatarConversationState, type ConversationAttention, type ConversationCue, type ConversationCueCursor, type ConversationCuePreferences } from "./conversation_model.js";

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
  /** Called before voice, reply, reading history, or session reset. */
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
  /** Draft editing or other host-owned attention: silences narration and non-essential cues. Captions keep rolling. */
  attended?: boolean;
  /** Shared message rendering (captions and history), with private reasoning removed before presentation. */
  messageProps?: Omit<ChatMessageCardProps, "message">;
};
const labels: Record<AvatarConversationState, string> = {
  idle: "Ready", working: "Working", paused: "Paused — work resumes only when you continue", listening: "Listening — your words have not been submitted", speaking: "Speaking", question: "A question for you", approval: "Permission required", completed: "Completed", failed: "Work stopped", connecting: "Connecting…", disconnected: "Connection interrupted",
};

/**
 * Optional public presentation: the avatar, its status, the current turn's public messages as
 * realtime rolling captions (newest at the bottom, never cycling), any open question or
 * approval, and the person's actions (history, voice, playback), all above the host's composer.
 * No model, microphone, network or permission side effects.
 */
export function AvatarConversation(props: AvatarConversationProps): React.ReactElement {
  // Keyed child resets history/selection state immediately on a conversation switch.
  return <AvatarConversationSession key={props.sessionKey} {...props} />;
}

const captionVariant = () => "caption" as const;
type CaptionCardProps = Pick<ChatMessageCardProps, "message" | "renderMarkdown" | "images" | "inlineImage" | "onOpenMedia" | "jsonCollapseAfterDepth">;
/** Captions are content only (the shared renderer, caption variant), re-rendered only when their message or renderer changes. */
const CaptionCard = React.memo(function CaptionCard(props: CaptionCardProps): React.ReactElement {
  return <ChatMessageCard {...props} showCopy={false} variant={captionVariant} />;
});

function AvatarConversationSession(props: AvatarConversationProps): React.ReactElement {
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const preferences = props.preferences || DEFAULT_CONVERSATION_CUES;
  const messages = useMemo(() => conversationMessages(props.messages), [props.messages]);
  const hasRequest = Boolean(props.interaction) && (props.interactionId === undefined || Boolean(props.interactionId));
  // Captions whose message did not change keep their object, so their card is not re-rendered.
  const previousCaptions = useRef<ConversationCaption[]>([]);
  const captions = useMemo(() => (previousCaptions.current = conversationCaptions(props.messages, { pinnedRequest: hasRequest }, previousCaptions.current)), [props.messages, hasRequest]);
  const attended = Boolean(props.attended || history || selected);
  useEffect(() => { props.onAttendedChange?.(attended); return () => props.onAttendedChange?.(false); }, [attended, props.onAttendedChange]);
  const state = conversationState(props);
  const cursor = useRef<ConversationCueCursor | null>(null);
  const narrationCursor = useRef<ConversationCueCursor | null>(null);
  const captionList = useRef<HTMLOListElement | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    return () => { callbacks.current.onInterruptSpeech?.(); callbacks.current.onReplyContext?.(null); };
  }, []);
  useEffect(() => {
    if (props.listening) callbacks.current.onInterruptSpeech?.();
  }, [props.listening]);
  // Realtime roll: each new caption enters at the bottom and pushes older ones up. A caption
  // taller than the area (a long final answer) is shown from its first line instead.
  const newest = captions.length ? captions[captions.length - 1].key : "";
  // An edge fades while text continues past it: older captions above, more lines below (a long
  // answer, or after scrolling back). A long newest caption shown from its first line keeps that
  // line unfaded.
  const measureEdges = (box: HTMLElement) => {
    const last = box.lastElementChild as HTMLElement | null;
    const top = box.scrollTop > 1 && !(last && Math.abs(last.offsetTop - box.scrollTop) <= 1);
    const bottom = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
    setEdges((old) => (old.top === top && old.bottom === bottom ? old : { top, bottom }));
  };
  useEffect(() => {
    const box = captionList.current;
    if (!box) return;
    const last = box.lastElementChild as HTMLElement | null;
    if (last) box.scrollTop = last.offsetHeight > box.clientHeight ? last.offsetTop : box.scrollHeight;
    measureEdges(box);
  }, [newest, history, captions.length]);
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

  const interrupt = () => props.onInterruptSpeech?.();
  const clearReply = () => { setSelected(null); props.onReplyContext?.(null); };
  const attention = props.attention && preferences[props.attention.kind].visual ? props.attention : null;
  const shared = props.messageProps;
  return <section className="pc-avatar-conversation" aria-label="Avatar conversation" data-state={state} data-has-request={hasRequest || undefined} data-compact={hasRequest || history || undefined}>
    <div className="pc-avatar-conversation__presence">
      <div className="pc-avatar-conversation__scene">{props.avatar}</div>
      <p className="pc-avatar-conversation__status" role="status">{labels[state]}</p>
    </div>
    {attention && attention.kind !== "completion" && !hasRequest ? <p className="pc-avatar-conversation__attention" data-kind={attention.kind}>
      {attention.kind === "approval" ? "An explicit decision is required. Waiting never grants permission." : attention.importance === "essential" ? "Your answer is required. I will keep waiting." : "Your input is welcome."}
      {attention.kind === "question" && attention.importance === "clarification" ? <> {attention.deadline && Number.isFinite(Date.parse(attention.deadline)) ? <>Answer by <time dateTime={attention.deadline}>{new Date(attention.deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>. </> : null}{attention.fallback ? `Without an answer: ${attention.fallback}` : ""}</> : null}
    </p> : null}
    {hasRequest ? <div className="pc-avatar-conversation__request">{props.interaction}</div> : null}
    {history ? <ol className="pc-avatar-conversation__history" aria-label="Public conversation history" tabIndex={0}>
      {messages.map((m, i) => <li key={`${m.runId || ""}:${m.id || i}`}>
        <strong>{conversationLabel(m)}</strong>
        <ChatMessageCard {...props.messageProps} message={{ ...m, reasoning: undefined, live: undefined, toolActivity: undefined }} />
        {m.publicUpdate ? <button type="button" aria-pressed={selected === m} onClick={() => { interrupt(); setSelected(m); setHistory(false); props.onReplyContext?.(m); }}>Reply to this</button> : null}
      </li>)}
    </ol> : <ol ref={captionList} className="pc-avatar-conversation__captions" aria-label="Public subtitles" aria-live={attended ? "off" : "polite"} tabIndex={0}
      data-scrolled={edges.top || undefined} data-more={edges.bottom || undefined} onScroll={(event) => measureEdges(event.currentTarget)}>
      {captions.map((caption, i) => <li key={caption.key} data-kind={caption.kind}
        data-attention={attention?.kind === "completion" && caption.kind === "answer" && i === captions.length - 1 ? "completion" : undefined}>
        <CaptionCard message={caption.message} renderMarkdown={shared?.renderMarkdown} images={shared?.images} inlineImage={shared?.inlineImage} onOpenMedia={shared?.onOpenMedia} jsonCollapseAfterDepth={shared?.jsonCollapseAfterDepth} />
      </li>)}
    </ol>}
    {selected ? <p className="pc-avatar-conversation__reply-context">Replying to the selected exchange. <button type="button" onClick={clearReply}>Clear reply context</button></p> : null}
    {!hasRequest ? props.interaction : null}
    <div className="pc-avatar-conversation__actions">
      <button type="button" aria-expanded={history} onClick={() => { interrupt(); setHistory((v) => !v); }}>Conversation history</button>
      {props.voiceControl ? <span onPointerDownCapture={interrupt} onKeyDownCapture={(event) => { if (event.key === "Enter" || event.key === " ") interrupt(); }}>{props.voiceControl}</span> : null}
      {props.playbackControl}
    </div>
  </section>;
}
