/**
 * `@` mentions in the composer ("@entity from any chat window", operator 2026-11-08).
 *
 * A mention is STRUCTURED: the person types `@`, picks a name from a list the HOST feeds
 * (`mentionCandidates`), and the pick becomes a chip bound to that candidate. The kit never
 * reads `@` out of the text on send (no-heuristics ruling): an `@` that was not picked stays
 * plain text. The only text rule here is the input-time trigger (an `@` the person is typing
 * at the caret opens the list), the same rule as any completion popup.
 *
 * DOM-free; checked by `scripts/check_mentions.mjs`.
 */

import type { ChatAvatarLook } from "./chat_author.js";

export type ChatMentionKind = "entity" | "agent";

/** One name the host offers (e.g. from `GET /entities`). */
export type ChatMentionCandidate = {
  id: string;
  name: string;
  kind: ChatMentionKind;
  avatar?: ChatAvatarLook | null;
  /** A short second line in the list (e.g. "your research partner"). */
  hint?: string;
};

/** A chip in the composer: the candidate it was picked from. */
export type ChatMention = ChatMentionCandidate;

/** A mention as sent: `index` is its position among the message's mentions (0, 1, …),
 * the gateway's `mention_index`. */
export type ChatMentionSent = { id: string; name: string; kind: ChatMentionKind; index: number };

/** What a send carries: the text exactly as typed, and the picked mentions in order. */
export type ChatComposerSend = { text: string; mentions: ChatMentionSent[] };

/** The `@` being typed at the caret: where it starts and what follows it. */
export type MentionTrigger = { start: number; query: string };

/** The longest query the list follows; past it the `@` is just text. */
export const MENTION_QUERY_MAX = 48;

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\u00a0";
}

/**
 * The `@` the person is typing at `caret`, or null. It opens the list when it starts the
 * text or follows a space, and nothing but non-space characters sit between it and the
 * caret ("me@host" and "@ " do not open it).
 */
export function mentionTriggerAt(text: string, caret: number): MentionTrigger | null {
  const value = String(text || "");
  const end = Math.max(0, Math.min(Math.trunc(Number(caret) || 0), value.length));
  for (let i = end - 1; i >= 0 && end - i - 1 <= MENTION_QUERY_MAX; i -= 1) {
    const ch = value.charAt(i);
    if (isSpace(ch)) return null;
    if (ch === "@") {
      if (i > 0 && !isSpace(value.charAt(i - 1))) return null;
      return { start: i, query: value.slice(i + 1, end) };
    }
  }
  return null;
}

/** The text once a pick replaces the typed `@query`, and where the caret goes. */
export function applyMentionPick(text: string, trigger: MentionTrigger, caret: number): { text: string; caret: number } {
  const value = String(text || "");
  const end = Math.max(trigger.start, Math.min(Math.trunc(Number(caret) || 0), value.length));
  let after = value.slice(end);
  const before = value.slice(0, trigger.start);
  // "hi @cas there" -> "hi there": one space, not two; "@cas hi" -> "hi".
  if ((before === "" || before.endsWith(" ")) && after.startsWith(" ")) after = after.slice(1);
  return { text: before + after, caret: before.length };
}

export function mentionKey(m: Pick<ChatMentionCandidate, "kind" | "id">): string {
  return `${m.kind}:${m.id}`;
}

/** The chips once `candidate` is picked: appended, once (a second pick of the same name is a no-op). */
export function addMention(list: readonly ChatMention[], candidate: ChatMentionCandidate): ChatMention[] {
  const key = mentionKey(candidate);
  if (list.some((m) => mentionKey(m) === key)) return [...list];
  return [...list, { ...candidate }];
}

export function removeMention(list: readonly ChatMention[], key: string): ChatMention[] {
  return list.filter((m) => mentionKey(m) !== key);
}

/** A send: the text as typed and the chips in the order they appear (picked), numbered. */
export function mentionSendPayload(text: string, mentions: readonly ChatMention[]): ChatComposerSend {
  return {
    text: String(text ?? ""),
    mentions: mentions.map((m, index) => ({ id: m.id, name: m.name, kind: m.kind, index })),
  };
}

/** The highlighted option after an arrow key: wraps at both ends; -1 when the list is empty. */
export function moveMentionActive(active: number, count: number, delta: number): number {
  if (count <= 0) return -1;
  if (active < 0) return delta < 0 ? count - 1 : 0;
  return (((active + delta) % count) + count) % count;
}

/** Candidates the list can show: an id, a name and a known kind; the rest are dropped. */
export function usableCandidates(value: unknown): ChatMentionCandidate[] {
  if (!Array.isArray(value)) return [];
  const out: ChatMentionCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id.trim() : "";
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const kind = c.kind === "entity" || c.kind === "agent" ? c.kind : null;
    if (!id || !name || !kind) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hint = typeof c.hint === "string" && c.hint.trim() ? c.hint.trim() : undefined;
    const avatar = c.avatar && typeof c.avatar === "object" ? (c.avatar as ChatAvatarLook) : undefined;
    out.push({ id, name, kind, ...(avatar ? { avatar } : {}), ...(hint ? { hint } : {}) });
  }
  return out;
}
