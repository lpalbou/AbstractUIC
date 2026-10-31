import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessageCard, type ChatMessage, type ChatMessageCardProps } from "./chat_message_card.js";
import type { WorkflowConnection } from "./workflow_runtime.js";
import { DEFAULT_CONVERSATION_CUES, conversationCueStep, conversationNarrationStep, conversationMessages, conversationPages, conversationState, type AvatarConversationState, type ConversationAttention, type ConversationCue, type ConversationCueCursor, type ConversationCuePreferences } from "./conversation_model.js";

export type AvatarConversationOptions = {
  /** Stable conversation identity, not the identity of each individual turn. */
  sessionKey: string;
  /** Host renders its own avatar, animation and accessible name. */
  avatar: React.ReactNode;
  status?: AvatarConversationState;
  listening?: boolean;
  speaking?: boolean;
  connection?: WorkflowConnection;
  attention?: ConversationAttention | null;
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
  voiceControl?: React.ReactNode;
};
export type AvatarConversationProps = AvatarConversationOptions & {
  messages: ChatMessage[];
  /** Existing authoritative question or approval controls, supplied by the host. */
  interaction?: React.ReactNode;
  /** Draft editing or other host-owned attention freezes rolling captions. */
  attended?: boolean;
  /** Shared final/attachment rendering, with private reasoning removed before presentation. */
  messageProps?: Omit<ChatMessageCardProps, "message">;
};
const labels: Record<AvatarConversationState, string> = {
  idle: "Ready", working: "Working", listening: "Listening — your words have not been submitted", speaking: "Speaking", question: "A question for you", approval: "Permission required", completed: "Completed", failed: "Work stopped", disconnected: "Connection interrupted",
};

/** Optional public presentation. No model, microphone, network or permission side effects. */
export function AvatarConversation(props: AvatarConversationProps): React.ReactElement {
  // Keyed child resets reading/selection state immediately on a conversation switch.
  return <AvatarConversationSession key={props.sessionKey} {...props} />;
}

function AvatarConversationSession(props: AvatarConversationProps): React.ReactElement {
  const [history, setHistory] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [localPreferences, setLocalPreferences] = useState(DEFAULT_CONVERSATION_CUES);
  const preferences = props.preferences || localPreferences;
  const messages = useMemo(() => conversationMessages(props.messages), [props.messages]);
  const latest = [...messages].reverse().find((m) => m.role === "assistant") || null;
  const attended = Boolean(props.attended || history || paused || hovered || focused || selected);
  const [shown, setShown] = useState(latest);
  const [page, setPage] = useState(0);
  const pages = useMemo(() => conversationPages(shown?.content || ""), [shown?.content]);
  const state = conversationState(props);
  const cursor = useRef<ConversationCueCursor | null>(null);
  const narrationCursor = useRef<ConversationCueCursor | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    return () => { callbacks.current.onInterruptSpeech?.(); callbacks.current.onReplyContext?.(null); };
  }, []);
  useEffect(() => {
    if (!attended) { setShown(latest); setPage(0); }
  }, [latest, attended]);
  useEffect(() => {
    if (attended || page >= pages.length - 1) return;
    const timer = setTimeout(() => setPage((p) => p + 1), Math.max(6500, (pages[page]?.length || 0) * 55));
    return () => clearTimeout(timer);
  }, [attended, page, pages]);
  useEffect(() => {
    const connected = (!props.connection || props.connection === "connected") && (typeof document === "undefined" || document.visibilityState !== "hidden");
    const next = conversationCueStep(cursor.current, { sessionKey: props.sessionKey, connected, attended, attention: props.attention, preferences });
    cursor.current = next.cursor;
    if (next.cue) props.onCue?.(next.cue);
  }, [props.sessionKey, props.connection, props.attention, props.onCue, attended, preferences]);
  useEffect(() => {
    const connected = (!props.connection || props.connection === "connected") && (typeof document === "undefined" || document.visibilityState !== "hidden");
    const next = conversationNarrationStep(narrationCursor.current, { sessionKey: props.sessionKey, connected, attended, enabled: Boolean(props.narrate), listening: props.listening, messages });
    narrationCursor.current = next.cursor;
    if (next.message) { props.onInterruptSpeech?.(); props.onNarrate?.(next.message); }
  }, [messages, props.sessionKey, props.connection, props.narrate, props.listening, props.onNarrate, props.onInterruptSpeech, attended]);

  const interrupt = () => props.onInterruptSpeech?.();
  const follow = () => {
    setHistory(false); setPaused(false); setSelected(null); setShown(latest); setPage(0);
    props.onReplyContext?.(null);
  };
  const preference = (kind: ConversationAttention["kind"], channel: "visual" | "audio", checked: boolean) => {
    const next = { ...preferences, [kind]: { ...preferences[kind], [channel]: checked } };
    setLocalPreferences(next); props.onPreferencesChange?.(next);
  };
  const visibleAttention = props.attention && preferences[props.attention.kind].visual;
  return <section className="pc-avatar-conversation" aria-label="Avatar conversation" data-state={state}>
    <div className="pc-avatar-conversation__scene">{props.avatar}</div>
    <p className="pc-avatar-conversation__status" role="status">{labels[state]}</p>
    {visibleAttention ? <p className="pc-avatar-conversation__attention" data-kind={props.attention!.kind}>
      {props.attention!.kind === "approval" ? "An explicit decision is required. Waiting never grants permission." : props.attention!.kind === "completion" ? "The result is ready in conversation history." : props.attention!.importance === "essential" ? "Your answer is required. I will keep waiting." : "Your input is welcome."}
      {props.attention!.kind === "question" && props.attention!.importance === "clarification" ? <> {props.attention!.deadline ? `Answer by ${props.attention!.deadline}. ` : ""}{props.attention!.fallback ? `Without an answer: ${props.attention!.fallback}` : ""}</> : null}
    </p> : null}
    <div className="pc-avatar-conversation__captions" tabIndex={0} aria-label="Public subtitles" aria-live={attended ? "off" : "polite"}
      onPointerDown={(event) => { if (event.pointerType === "touch") { interrupt(); setPaused(true); } }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
      <p>{pages[page] || "Public updates and replies will appear here."}</p>
      {pages.length > 1 ? <div className="pc-avatar-conversation__pages">
        <button type="button" disabled={page === 0} onClick={() => { interrupt(); setPaused(true); setPage((p) => Math.max(0, p - 1)); }}>Previous subtitle</button>
        <span>{page + 1} / {pages.length}</span>
        <button type="button" disabled={page === pages.length - 1} onClick={() => { interrupt(); setPaused(true); setPage((p) => Math.min(pages.length - 1, p + 1)); }}>Next subtitle</button>
      </div> : null}
    </div>
    <div className="pc-avatar-conversation__actions">
      <button type="button" aria-pressed={paused} onClick={() => { interrupt(); setPaused((v) => !v); }}>{paused ? "Resume subtitles" : "Pause subtitles"}</button>
      <button type="button" aria-expanded={history} onClick={() => { interrupt(); setHistory((v) => !v); }}>Conversation history</button>
      {attended ? <button type="button" onClick={follow}>Return to latest</button> : null}
      {props.voiceControl ? <span onPointerDownCapture={interrupt} onKeyDownCapture={(event) => { if (event.key === "Enter" || event.key === " ") interrupt(); }}>{props.voiceControl}</span> : null}
    </div>
    {history ? <ol className="pc-avatar-conversation__history" aria-label="Public conversation history">
      {messages.map((m, i) => <li key={`${m.runId || ""}:${m.id || i}`}>
        <strong>{m.role === "user" ? "You" : m.kind === "public_update" ? "Public update" : "Reply"}</strong>
        <ChatMessageCard {...props.messageProps} message={{ ...m, reasoning: undefined, live: undefined, toolActivity: undefined }} />
        {m.publicUpdate?.sourceCallIds.length ? <details><summary>Sources</summary><ul>{m.publicUpdate.sourceCallIds.map((id) => <li key={id}>{id}</li>)}</ul></details> : null}
        <button type="button" aria-pressed={selected === m} onClick={() => { interrupt(); setSelected(m); setShown(m); setPage(0); props.onReplyContext?.(m); }}>Reply to this</button>
      </li>)}
    </ol> : null}
    {selected ? <p className="pc-avatar-conversation__reply-context">Replying to the selected exchange. <button type="button" onClick={follow}>Clear reply context</button></p> : null}
    {props.interaction}
    <details className="pc-avatar-conversation__preferences"><summary>Conversation cues</summary>
      <p>Cues apply while this conversation is open. Audio plays only when the host provides it.</p>
      {(["approval", "question", "completion"] as const).map((kind) => <fieldset key={kind}><legend>{kind === "approval" ? "Permission requests" : kind === "question" ? "Questions" : "Completion"}</legend>
        {(["visual", "audio"] as const).map((channel) => <label key={channel}><input type="checkbox" checked={preferences[kind][channel]} onChange={(event) => preference(kind, channel, event.target.checked)} />{channel === "visual" ? "Visual cue" : "Audio cue"}</label>)}
      </fieldset>)}
    </details>
  </section>;
}
