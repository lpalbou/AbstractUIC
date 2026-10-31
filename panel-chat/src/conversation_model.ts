import type { ChatMessage } from "./chat_message_card.js";
import type { WorkflowConnection, WorkflowSessionSnapshot } from "./workflow_runtime.js";

/** Explicit actor-authored public text; never derived from tool output or reasoning. */
export type PublicUpdate = {
  id: string;
  text: string;
  runId: string;
  sessionId?: string;
  iteration?: number;
  sourceCallIds: string[];
};
export type AvatarConversationState = "idle" | "working" | "listening" | "speaking" | "question" | "approval" | "completed" | "failed" | "disconnected";
export type ConversationAttention = {
  id: string;
  kind: "approval" | "question" | "completion";
  importance?: "essential" | "clarification";
  deadline?: string;
  fallback?: string;
};
export type ConversationCuePreferences = Record<ConversationAttention["kind"], { visual: boolean; audio: boolean; haptic?: boolean }>;
export type ConversationCue = ConversationAttention & { channels: ConversationCuePreferences[ConversationAttention["kind"]] };
export const DEFAULT_CONVERSATION_CUES: ConversationCuePreferences = {
  approval: { visual: true, audio: false, haptic: false },
  question: { visual: true, audio: false, haptic: false },
  completion: { visual: true, audio: false, haptic: false },
};
const row = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Validate the durable public channel at the presentation boundary, preserving exact text. */
export function publicUpdate(value: unknown, runId: string): PublicUpdate | null {
  const p = row(value);
  if (!p || typeof p.id !== "string" || !p.id.trim() || typeof p.text !== "string" || !p.text.trim() || p.text.length > 4000) return null;
  if (p.run_id !== undefined && p.run_id !== runId) return null;
  if (!Array.isArray(p.source_call_ids) || p.source_call_ids.some((id) => typeof id !== "string" || !id.trim())) return null;
  return { id: p.id, text: p.text, runId, sourceCallIds: [...new Set(p.source_call_ids as string[])], ...(typeof p.session_id === "string" ? { sessionId: p.session_id } : {}), ...(typeof p.iteration === "number" ? { iteration: p.iteration } : {}) };
}

/** Public history contains user input and durable replies, never arbitrary assistant/system rows. */
export function conversationMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    if (m.live || m.toolActivity || !m.content.trim()) return false;
    const allowed = m.role === "user" || (m.role === "assistant" && ["public_update", "answer", "final", "question"].includes(m.kind || ""));
    if (!allowed || (m.kind === "public_update" && !m.publicUpdate)) return false;
    const key = `${m.runId || ""}:${m.publicUpdate?.id || m.id || `${m.kind}:${m.content}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Quote only an explicitly selected public update from the current live run. */
export function conversationReply(text: string, context: ChatMessage | null, currentRunId: string): string {
  if (!context) return text;
  if (context.kind !== "public_update" || !context.publicUpdate) return text;
  if (!currentRunId || context.runId !== currentRunId || context.publicUpdate.runId !== currentRunId) throw new Error("The selected public update belongs to another run. Return to the latest exchange before guiding this run.");
  return `The person is replying to this quoted public update (context only):\n${JSON.stringify({ message_id: context.id || context.publicUpdate.id, run_id: currentRunId, text: context.content })}\n\nThe person's message:\n${text}`;
}

/** Subtitle pages preserve words and punctuation; full text remains in history. */
export function conversationPages(text: string, max = 180): string[] {
  const words = text.trim().split(/\s+/);
  const pages: string[] = [];
  let page = "";
  for (const word of words) {
    if (page && page.length + word.length + 1 > max) { pages.push(page); page = ""; }
    page += `${page ? " " : ""}${word}`;
  }
  if (page) pages.push(page);
  return pages;
}

export function conversationState(input: { status?: AvatarConversationState; listening?: boolean; speaking?: boolean; connection?: WorkflowConnection; attention?: ConversationAttention | null }): AvatarConversationState {
  if (input.connection && !["connected", "idle"].includes(input.connection)) return "disconnected";
  if (input.attention?.kind === "approval") return "approval";
  if (input.attention?.kind === "question") return "question";
  if (input.listening) return "listening";
  if (input.speaking) return "speaking";
  return input.status || "idle";
}

/** Served interaction remains authoritative; this helper changes presentation only. */
export function conversationSnapshot(snapshot: WorkflowSessionSnapshot): { status: AvatarConversationState; connection: WorkflowConnection; attention: ConversationAttention | null } {
  const interaction = snapshot.toolApprovalGranted ? null : snapshot.interaction;
  const wait = row(interaction?.wait);
  const details = row(wait?.details);
  const question = row(details?.question);
  const approval = interaction?.kind === "tool_approval" || details?.kind === "tool_approval" || wait?.reason === "tool_approval";
  let attention: ConversationAttention | null = null;
  if (interaction && (approval || interaction.kind === "ask_user" || wait?.reason === "user")) {
    attention = { id: `${interaction.runId}:${String(question?.id || wait?.wait_key || interaction.stepId || "")}`, kind: approval ? "approval" : "question", ...(question?.importance === "essential" || question?.importance === "clarification" ? { importance: question.importance } : {}), ...(typeof question?.deadline === "string" ? { deadline: question.deadline } : {}), ...(typeof question?.fallback === "string" ? { fallback: question.fallback } : {}) };
  } else if (snapshot.status === "completed") {
    attention = { id: `${String(snapshot.run?.run_id || "")}:completed`, kind: "completion" };
  }
  const status: AvatarConversationState = snapshot.status === "completed" ? "completed" : ["failed", "cancelled"].includes(snapshot.status) ? "failed" : ["running", "waiting", "queued"].includes(snapshot.status) ? "working" : "idle";
  return { status, connection: snapshot.connection, attention };
}

/** First observation, replay, history and reconnect establish a baseline, never a cue. */
export type ConversationCueCursor = { sessionKey: string; connected: boolean; seen: string[] };
export function conversationCueStep(previous: ConversationCueCursor | null, input: { sessionKey: string; connected: boolean; attended: boolean; attention?: ConversationAttention | null; preferences: ConversationCuePreferences }): { cursor: ConversationCueCursor; cue: ConversationCue | null } {
  const key = input.attention ? `${input.attention.kind}:${input.attention.id}` : "";
  const reset = !previous || previous.sessionKey !== input.sessionKey;
  const seen = new Set(reset ? [] : previous.seen);
  const fresh = Boolean(key && !seen.has(key));
  if (key) seen.add(key);
  const canCue = !reset && previous.connected && input.connected && !input.attended && fresh && input.attention;
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
