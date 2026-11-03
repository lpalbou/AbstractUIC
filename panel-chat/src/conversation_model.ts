import type { ChatMessage } from "./chat_message_card.js";
import type { WorkflowConnection, WorkflowSessionSnapshot } from "./workflow_runtime.js";
import type { WorkflowToolActivity } from "./workflow_evidence.js";

/** Explicit actor-authored public text; never derived from tool output or reasoning. */
export type PublicUpdate = {
  id: string;
  text: string;
  runId: string;
  sessionId?: string;
  iteration?: number;
  sourceCallIds: string[];
  /** Typed by the actor: "finding" for a fact or piece of evidence it established, "progress" (or absent, from an
   * older producer or host) for what it is doing. `publicUpdate()` always sets it. */
  kind?: "progress" | "finding";
};
export type AvatarConversationState = "idle" | "working" | "paused" | "listening" | "speaking" | "question" | "approval" | "completed" | "failed" | "connecting" | "disconnected";
export type ConversationAttention = {
  id: string;
  kind: "approval" | "question" | "completion";
  importance?: "essential" | "clarification";
  deadline?: string;
  fallback?: string;
};
export type ConversationCuePreferences = Record<ConversationAttention["kind"], { visual: boolean; audio: boolean; haptic?: boolean }>;
export type ConversationCue = ConversationAttention & { channels: ConversationCuePreferences[ConversationAttention["kind"]] };
/** The avatar always signals with both a visual and an audio cue; a host's settings can turn one off. */
export const DEFAULT_CONVERSATION_CUES: ConversationCuePreferences = {
  approval: { visual: true, audio: true, haptic: false },
  question: { visual: true, audio: true, haptic: false },
  completion: { visual: true, audio: true, haptic: false },
};
const row = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Validate the durable public channel at the presentation boundary, preserving exact text.
 * `kind` is the actor's own type (event `kind`, replay `update_kind`); anything but "finding" is progress. */
export function publicUpdate(value: unknown, runId: string): PublicUpdate | null {
  const p = row(value);
  if (!p || typeof p.id !== "string" || !p.id.trim() || typeof p.text !== "string" || !p.text.trim() || p.text.length > 4000) return null;
  if (p.run_id !== undefined && p.run_id !== runId) return null;
  if (!Array.isArray(p.source_call_ids) || p.source_call_ids.some((id) => typeof id !== "string" || !id.trim())) return null;
  return { id: p.id, text: p.text, runId, sourceCallIds: [...new Set(p.source_call_ids as string[])], kind: p.kind === "finding" ? "finding" : "progress", ...(typeof p.session_id === "string" ? { sessionId: p.session_id } : {}), ...(typeof p.iteration === "number" ? { iteration: p.iteration } : {}) };
}

const publicKey = (m: ChatMessage): string => `${m.runId || ""}:${m.publicUpdate?.id || m.id || `${m.kind}:${m.content}`}`;

/** Public history contains user input and durable replies, never arbitrary assistant/system rows. */
export function conversationMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const hasFiles = Boolean(m.attachments?.length || m.artifactRefs?.length || m.media?.length);
    if (m.live || m.toolActivity || (!m.content.trim() && !hasFiles)) return false;
    const allowed = m.role === "user" || (m.role === "assistant" && ["public_update", "answer", "final", "question", "attachments"].includes(m.kind || "")) || (m.role === "system" && m.kind === "question_outcome" && m.source === "emit_event");
    if (!allowed || (m.kind === "public_update" && !m.publicUpdate)) return false;
    const key = publicKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Quote only an explicitly selected public update from the current live run. */
export function conversationReply(text: string, context: ChatMessage | null, currentRunId: string, allowedSourceRunIds: readonly string[] = []): string {
  if (!context) return text;
  if (context.kind !== "public_update" || !context.publicUpdate) return text;
  if (!currentRunId || context.publicUpdate.runId !== context.runId || (context.runId !== currentRunId && !allowedSourceRunIds.includes(context.publicUpdate.runId))) throw new Error("The update you chose to reply to is from an earlier exchange. Choose Latest, then send your message again.");
  return `The person is replying to this quoted public update (context only):\n${JSON.stringify({ message_id: context.id || context.publicUpdate.id, run_id: context.publicUpdate.runId, root_run_id: currentRunId, text: context.content })}\n\nThe person's message:\n${text}`;
}

// One presented copy per source message: private fields removed, and the same object while the
// source is unchanged, so memoized cards re-render only when their message changes.
const presented = new WeakMap<ChatMessage, ChatMessage>();
function present(m: ChatMessage): ChatMessage {
  let out = presented.get(m);
  if (!out) presented.set(m, (out = { ...m, reasoning: undefined, live: undefined, toolActivity: undefined, statistics: undefined, stats: undefined }));
  return out;
}

/** What the Avatar view shows for the current turn (after the person's latest message; accepted mid-run guidance does not start a turn). */
export type ConversationLive = {
  /** The latest public update, question or question outcome, replaced as new ones arrive; null once an answer came after it. */
  line: ChatMessage | null;
  /** The turn's answer messages (its text, files), each shown once as a message. */
  answers: ChatMessage[];
  /** Identity of the person's latest message (guidance included): a new one ends a reply to an earlier line. */
  personKey: string;
};

/**
 * The live line and the answer messages. Pure and time-free: the same messages always give the same
 * result. With `pinnedRequest`, questions are left out: the open question is shown once, pinned
 * above the line with its answer controls.
 */
export function conversationLive(messages: readonly ChatMessage[], options: { pinnedRequest?: boolean } = {}): ConversationLive {
  const visible = conversationMessages(messages);
  let start = 0;
  let personKey = "";
  for (let i = visible.length - 1; i >= 0; i--) {
    if (visible[i].role !== "user") continue;
    if (!personKey) personKey = publicKey(visible[i]);
    if (visible[i].kind !== "guidance") { start = i + 1; break; }
  }
  let line = -1;
  let answered = -1;
  const answers: ChatMessage[] = [];
  for (let i = start; i < visible.length; i++) {
    const m = visible[i];
    if (m.role === "user") continue;
    if (m.kind === "public_update" || m.kind === "question_outcome" || (m.kind === "question" && !options.pinnedRequest)) line = i;
    else if (m.kind !== "question") { answered = i; answers.push(present(m)); }
  }
  return { line: line > answered ? present(visible[line]) : null, answers, personKey };
}

/** A finding the actor reported, with the results it cited that this conversation holds. */
export type ConversationFinding = {
  key: string;
  message: ChatMessage;
  /** The cited tool calls (`source_call_ids`) found among the messages, in citation order. */
  sources: WorkflowToolActivity[];
};

/**
 * Every finding of the conversation, across its runs, the newest last. Only updates the actor
 * typed `kind: "finding"` are findings; nothing is inferred from their text.
 */
export function conversationFindings(messages: readonly ChatMessage[]): ConversationFinding[] {
  const calls = new Map<string, WorkflowToolActivity>();
  for (const m of messages) {
    const tool = m.toolActivity;
    if (tool?.callId) calls.set(`${tool.runId}:${tool.callId}`, tool);
  }
  return conversationMessages(messages).filter((m) => m.publicUpdate?.kind === "finding").map((m) => {
    const update = m.publicUpdate!;
    return {
      key: publicKey(m),
      message: present(m),
      sources: update.sourceCallIds.map((id) => calls.get(`${update.runId}:${id}`)).filter((tool): tool is WorkflowToolActivity => Boolean(tool)),
    };
  });
}

export function conversationState(input: { status?: AvatarConversationState; listening?: boolean; speaking?: boolean; connection?: WorkflowConnection; attention?: ConversationAttention | null }): AvatarConversationState {
  if (input.status === "completed" || input.status === "failed") return input.listening ? "listening" : input.speaking ? "speaking" : input.status;
  if (input.connection === "disconnected") return "disconnected";
  if (input.connection === "connecting" || input.connection === "reconnecting") return "connecting";
  if (input.status === "paused") return "paused";
  if (input.attention?.kind === "approval") return "approval";
  if (input.attention?.kind === "question") return "question";
  if (input.listening) return "listening";
  if (input.speaking) return "speaking";
  return input.status || "idle";
}

/** Served interaction remains authoritative; this helper changes presentation only. */
export function conversationSnapshot(snapshot: WorkflowSessionSnapshot): { status: AvatarConversationState; connection: WorkflowConnection; attention: ConversationAttention | null; replaying: boolean } {
  const interaction = snapshot.toolApprovalGranted ? null : snapshot.interaction;
  const wait = row(interaction?.wait);
  const details = row(wait?.details);
  const question = row(details?.question);
  const approval = interaction?.kind === "tool_approval" || details?.kind === "tool_approval" || details?.mode === "approval_required" || wait?.reason === "tool_approval";
  let attention: ConversationAttention | null = null;
  if (interaction && (approval || interaction.kind === "ask_user" || wait?.reason === "user" || wait?.reason === "ask_user")) {
    attention = { id: `${interaction.runId}:${String(question?.id || wait?.wait_key || interaction.stepId || "")}`, kind: approval ? "approval" : "question", ...(question?.importance === "essential" || question?.importance === "clarification" ? { importance: question.importance } : {}), ...(typeof question?.deadline === "string" ? { deadline: question.deadline } : {}), ...(typeof question?.fallback === "string" ? { fallback: question.fallback } : {}) };
  } else if (snapshot.status === "completed") {
    attention = { id: `${String(snapshot.run?.run_id || "")}:completed`, kind: "completion" };
  }
  const status: AvatarConversationState = snapshot.status === "completed" ? "completed" : ["failed", "cancelled"].includes(snapshot.status) ? "failed" : snapshot.run?.paused === true || snapshot.status === "paused" ? "paused" : ["running", "waiting", "queued"].includes(snapshot.status) ? "working" : "idle";
  return { status, connection: snapshot.connection, attention, replaying: Boolean(snapshot.loading || snapshot.historyLoading) };
}

/** First observation, replay, history and reconnect establish a baseline, never a cue. */
export type ConversationCueCursor = { sessionKey: string; connected: boolean; seen: string[] };
export function conversationCueStep(previous: ConversationCueCursor | null, input: { sessionKey: string; connected: boolean; attended: boolean; attention?: ConversationAttention | null; preferences: ConversationCuePreferences }): { cursor: ConversationCueCursor; cue: ConversationCue | null } {
  const key = input.attention ? `${input.attention.kind}:${input.attention.id}` : "";
  const reset = !previous || previous.sessionKey !== input.sessionKey;
  const seen = new Set(reset ? [] : previous.seen);
  const fresh = Boolean(key && !seen.has(key));
  if (key) seen.add(key);
  const attentionNeeded = input.attention?.kind === "question" || input.attention?.kind === "approval";
  const canCue = !reset && previous.connected && input.connected && (!input.attended || attentionNeeded) && fresh && input.attention;
  return { cursor: { sessionKey: input.sessionKey, connected: input.connected, seen: [...seen] }, cue: canCue ? { ...input.attention!, channels: { ...input.preferences[input.attention!.kind] } } : null };
}

/** Narrate only a newly observed latest public update; never queue missed speech. */
export function conversationNarrationStep(previous: ConversationCueCursor | null, input: { sessionKey: string; connected: boolean; attended: boolean; enabled: boolean; listening?: boolean; messages: readonly ChatMessage[] }): { cursor: ConversationCueCursor; message: ChatMessage | null } {
  const messages = conversationMessages(input.messages);
  const updates = messages.filter((m) => m.kind === "public_update");
  const reset = !previous || previous.sessionKey !== input.sessionKey;
  const seen = new Set(reset ? [] : previous.seen);
  const key = (m: ChatMessage) => `${m.runId || ""}:${m.publicUpdate!.id}`;
  const latest = messages[messages.length - 1];
  const fresh = latest?.kind === "public_update" && !seen.has(key(latest));
  for (const m of updates) seen.add(key(m));
  const canNarrate = !reset && previous.connected && input.connected && input.enabled && !input.attended && !input.listening && fresh;
  return { cursor: { sessionKey: input.sessionKey, connected: input.connected, seen: [...seen] }, message: canNarrate ? latest : null };
}
