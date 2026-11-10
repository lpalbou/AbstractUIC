/**
 * `@` mentions in the composer ("@entity from any chat window", operator 2026-11-08; inline in
 * the text, operator 2026-11-10).
 *
 * A mention is STRUCTURED: the person types `@`, picks a name from a list the HOST feeds
 * (`mentionCandidates`), and the pick puts a chip bound to that candidate INTO the text, where the
 * `@query` was. The chip's text is its display form, `@` + the name ("@Castor"); the chip itself
 * is the candidate plus `start`, where that text sits. The kit never reads `@` out of the text
 * (no-heuristics ruling): an `@name` that was not picked (typed, or pasted from elsewhere) stays
 * plain text. The only text rule here is the input-time trigger (an `@` the person is typing at
 * the caret opens the list), the same rule as any completion popup.
 *
 * The serialization a send carries (`mentionSendPayload`):
 *   text      the message as shown, each chip written as "@" + its name, e.g.
 *             "Hi @Castor how are you doing ?"
 *   mentions  the chips in TEXT order: {id, name, kind, index, start}, where
 *             index = 0, 1, 2… (the chip's place among the message's mentions, the gateway's
 *                     `mention_index`), and
 *             start = the UTF-16 offset of its "@Name" in `text`, so
 *                     text.slice(start, start + name.length + 1) === "@" + name.
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

/**
 * A chip in the composer: the candidate it was picked from, and `start`, the UTF-16 offset of its
 * "@Name" in the composer's text. A chip whose "@Name" is not at `start` (no `start`, or the text
 * changed under it) is not in the message: it is not drawn and not sent.
 */
export type ChatMention = ChatMentionCandidate & { start?: number };

/** A mention as sent: `index` is its place among the message's mentions in text order (0, 1, …),
 * the gateway's `mention_index`; `start` is where its "@Name" sits in the sent text (the composer
 * always sets it). */
export type ChatMentionSent = { id: string; name: string; kind: ChatMentionKind; index: number; start?: number };

/** What a send carries: the text as shown (each chip as "@Name"), and its mentions in text order. */
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

/** The text once a pick REMOVES the typed `@query`, and where the caret goes (the chips-above
 * composer up to panel-chat 0.9.11; the composer now uses `mentionPickEdit`). */
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

/** A send: the text as shown and the chips that are in it, in text order, numbered (`index`) and
 * placed (`start`). A chip not in the text (`mentionsInText`) is not sent. */
export function mentionSendPayload(text: string, mentions: readonly ChatMention[]): ChatComposerSend {
  const value = String(text ?? "");
  return {
    text: value,
    mentions: mentionsInText(value, mentions).map((m, index) => ({ id: m.id, name: m.name, kind: m.kind, index, start: m.start as number })),
  };
}

// ---- chips in the text ------------------------------------------------------------------

/** A chip's text in the message: "@" and its name, the display form ("@Castor"). */
export function mentionText(m: Pick<ChatMentionCandidate, "name">): string {
  return `@${m.name}`;
}

function startOf(m: { start?: unknown }): number | null {
  const s = m.start;
  return typeof s === "number" && Number.isInteger(s) && s >= 0 ? s : null;
}

/** Where a chip's "@Name" ends in the text (`start` + its length). */
export function mentionEnd(m: ChatMention): number {
  return (startOf(m) ?? 0) + mentionText(m).length;
}

/**
 * The chips that are in `text`: each one's "@Name" sits at its `start`. In text order, each name
 * once; of two that overlap, the earlier one.
 */
export function mentionsInText<M extends ChatMention>(text: string, mentions: readonly M[]): M[] {
  const value = String(text ?? "");
  const placed = mentions
    .filter((m) => { const s = startOf(m); return s !== null && value.startsWith(mentionText(m), s); })
    .sort((a, b) => (a.start as number) - (b.start as number));
  const out: M[] = [];
  const seen = new Set<string>();
  let end = 0;
  for (const m of placed) {
    const key = mentionKey(m);
    if (seen.has(key) || (m.start as number) < end) continue;
    seen.add(key);
    out.push(m);
    end = mentionEnd(m);
  }
  return out;
}

/** The span an edit changed: `[start, prevEnd)` of the old text became `[start, nextEnd)` of the new. */
export type MentionEditSpan = { start: number; prevEnd: number; nextEnd: number };

/**
 * What changed between `prev` and `next`. `caret` (where the caret is in `next` right after the
 * edit) anchors the end of the change when the text after it is unchanged: typing "@" just before
 * a chip "@Castor" is then an insertion before the chip, never one inside it.
 */
export function mentionEditSpan(prev: string, next: string, caret?: number | null): MentionEditSpan {
  const a = String(prev ?? "");
  const b = String(next ?? "");
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p += 1;
  if (typeof caret === "number" && Number.isInteger(caret) && caret >= 0 && caret <= b.length) {
    const tail = b.length - caret;
    if (tail <= a.length && a.endsWith(b.slice(caret))) {
      const start = Math.min(p, a.length - tail, caret);
      return { start, prevEnd: a.length - tail, nextEnd: caret };
    }
  }
  let s = 0;
  while (s < max - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s += 1;
  return { start: p, prevEnd: a.length - s, nextEnd: b.length - s };
}

/**
 * The chips once the person edited `prev` into `next`: a chip before the change stays, one after
 * it moves with the text, and one the change touched is gone (deleted, typed over, or cut into:
 * its remaining letters are plain text). Only chips that were in `prev` are carried.
 */
export function mentionsAfterEdit<M extends ChatMention>(prev: string, next: string, mentions: readonly M[], caret?: number | null): M[] {
  const span = mentionEditSpan(prev, next, caret);
  const delta = span.nextEnd - span.prevEnd;
  const out: M[] = [];
  for (const m of mentionsInText(prev, mentions)) {
    const start = m.start as number;
    if (mentionEnd(m) <= span.start) out.push(m);
    else if (start >= span.prevEnd) out.push(delta ? { ...m, start: start + delta } : m);
  }
  return mentionsInText(next, out);
}

/**
 * `mentions` plus `added` (chips with `start` relative to `at`, e.g. pasted), placed in `text` at
 * `at`. A name already in the text is not added twice (the pasted one stays plain text).
 */
export function mentionsWithInserted<M extends ChatMention>(text: string, mentions: readonly M[], at: number, added: readonly M[]): M[] {
  const here = mentionsInText(text, mentions);
  const keys = new Set(here.map(mentionKey));
  const placed = added.filter((m) => !keys.has(mentionKey(m))).map((m) => ({ ...m, start: at + (startOf(m) ?? 0) }));
  return mentionsInText(text, [...here, ...placed]);
}

/** A pick: the chip's "@Name" replaces the typed `@query` (`from`..`to`), with one space after it
 * unless a space follows; `caret` goes after that space. */
export type MentionPickEdit = { from: number; to: number; insert: string; text: string; caret: number };

export function mentionPickEdit(text: string, trigger: MentionTrigger, caret: number, candidate: Pick<ChatMentionCandidate, "name">): MentionPickEdit {
  const value = String(text ?? "");
  const from = Math.max(0, Math.min(trigger.start, value.length));
  const to = Math.max(from, Math.min(Math.trunc(Number(caret) || 0), value.length));
  const spaced = isSpace(value.charAt(to));
  const insert = mentionText(candidate) + (spaced ? "" : " ");
  return { from, to, insert, text: value.slice(0, from) + insert + value.slice(to), caret: from + insert.length + (spaced ? 1 : 0) };
}

/** The chip that ends at `caret` ("before": what Backspace deletes) or starts there ("after":
 * what Delete deletes), or null. */
export function mentionAtCaret<M extends ChatMention>(text: string, mentions: readonly M[], caret: number, side: "before" | "after"): M | null {
  return mentionsInText(text, mentions).find((m) => (side === "before" ? mentionEnd(m) === caret : m.start === caret)) ?? null;
}

/**
 * The selection kept off the inside of chips. A caret inside a chip goes to the edge it moved
 * across (`from`, the caret one step before) or else the nearer one; a range that cuts a chip
 * grows to cover it whole.
 */
export function mentionSelection(text: string, mentions: readonly ChatMention[], start: number, end: number, from?: number | null): { start: number; end: number } {
  let s = start;
  let e = end;
  for (const m of mentionsInText(text, mentions)) {
    const a = m.start as number;
    const b = mentionEnd(m);
    if (s === e) {
      if (s <= a || s >= b) continue;
      const nearer = s - a <= b - s ? a : b;
      const to = typeof from === "number" && Math.abs(s - from) === 1 ? (from <= a ? b : from >= b ? a : nearer) : nearer;
      return { start: to, end: to };
    }
    if (s > a && s < b) s = a;
    if (e > a && e < b) e = b;
  }
  return { start: s, end: e };
}

/** The clipboard type that carries chips between copies and pastes of the composer. */
export const MENTION_CLIPBOARD_TYPE = "application/x-abstractframework-mentions+json";

/** What a copy of `text[from, to)` puts on the clipboard under `MENTION_CLIPBOARD_TYPE`: the
 * chips wholly inside it, `start` relative to `from`; null when it holds none. */
export function mentionClipboard(text: string, mentions: readonly ChatMention[], from: number, to: number): string | null {
  const value = String(text ?? "");
  const inside = mentionsInText(value, mentions).filter((m) => (m.start as number) >= from && mentionEnd(m) <= to);
  if (!inside.length) return null;
  return JSON.stringify({
    v: 1,
    text: value.slice(from, to),
    mentions: inside.map((m) => ({ id: m.id, name: m.name, kind: m.kind, ...(m.avatar ? { avatar: m.avatar } : {}), ...(m.hint ? { hint: m.hint } : {}), start: (m.start as number) - from })),
  });
}

/**
 * The chips a paste brings: only those a copy of this composer put on the clipboard
 * (`mentionClipboard`), and only when the pasted plain text is exactly what that copy held
 * (`start` relative to the paste). Anything else is plain text: an "@name" is never read out of it.
 */
export function mentionsFromClipboard(data: string | null | undefined, plain: string): ChatMention[] | null {
  if (!data) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const box = parsed as { v?: unknown; text?: unknown; mentions?: unknown };
  if (box.v !== 1 || typeof box.text !== "string" || box.text !== plain || !Array.isArray(box.mentions)) return null;
  const out: ChatMention[] = [];
  for (const raw of box.mentions) {
    const [candidate] = usableCandidates([raw]);
    const start = raw && typeof raw === "object" ? startOf(raw as { start?: unknown }) : null;
    if (!candidate || start === null || !plain.startsWith(mentionText(candidate), start)) continue;
    out.push({ ...candidate, start });
  }
  const placed = mentionsInText(plain, out);
  return placed.length ? placed : null;
}

/**
 * A send whose mentions stopped partway (an entity could not answer, a call failed): the chips
 * NOT answered (the failed one and those after it) are what the composer keeps for a resend.
 * A host's `onSend` / `onSteer` names them as `unsentMentions` on what it settles with: the
 * value it resolves, or the error it rejects with (`mentionsStoppedError`).
 */
export type ChatMentionsUnsent = { unsentMentions: ChatMentionSent[] };

/** The chips a settled send names to keep (`unsentMentions` on its value or its error);
 * null when it names none (an array, empty included, is a choice). */
export function unsentMentionsOf(settled: unknown): ChatMentionSent[] | null {
  if (!settled || typeof settled !== "object") return null;
  const list = (settled as { unsentMentions?: unknown }).unsentMentions;
  if (!Array.isArray(list)) return null;
  return list.filter((m): m is ChatMentionSent => Boolean(m) && typeof m === "object" && typeof (m as ChatMentionSent).id === "string" && ((m as ChatMentionSent).kind === "entity" || (m as ChatMentionSent).kind === "agent"));
}

/** The error a host rejects a send with when its mentions stopped partway: the sentence to show
 * and the chips to keep (`unsentMentions`). */
export function mentionsStoppedError(sentence: string, unsent: readonly ChatMentionSent[]): Error & ChatMentionsUnsent {
  return Object.assign(new Error(sentence), { unsentMentions: unsent.map((m) => ({ ...m })) });
}

/**
 * The chips once a send settled. `sent`: the chips the composer held when it sent. Those are
 * removed, except the ones `keep` names (a send that stopped partway keeps its unsent chips for
 * the resend). Chips picked WHILE the send was in flight are not the send's and stay, in order.
 */
export function mentionsAfterSend(
  now: readonly ChatMention[],
  sent: readonly Pick<ChatMentionCandidate, "kind" | "id">[],
  keep: readonly Pick<ChatMentionCandidate, "kind" | "id">[] = [],
): ChatMention[] {
  const gone = new Set(sent.map(mentionKey));
  for (const m of keep) gone.delete(mentionKey(m));
  return now.filter((m) => !gone.has(mentionKey(m)));
}

/**
 * What a send stopped partway leaves for the resend: its words, the person's own turn they were
 * sent with (`repeat_of`; null when none), and the mentions not answered, with their first `index`.
 */
export type MentionResend = { text: string; repeatOf: string | null; unsent: ChatMentionSent[] };

/**
 * The mentions to ask when a send RESENDS `pending`, or null when it is a new message.
 * A resend = the same words (trimmed) with at least one chip: it asks ONLY those chips, each
 * entity once, with the same `repeat_of` and never a new turn of the person (the host's rule).
 * A chip that was unsent keeps its first index; a chip added since is numbered after them.
 */
export function mentionResend(
  pending: MentionResend | null | undefined,
  text: string,
  mentions: readonly ChatMentionSent[],
): ChatMentionSent[] | null {
  if (!pending || !mentions.length || String(text ?? "").trim() !== String(pending.text ?? "").trim()) return null;
  const first = new Map(pending.unsent.map((m) => [mentionKey(m), m.index]));
  let next = pending.unsent.reduce((top, m) => Math.max(top, m.index + 1), 0);
  const seen = new Set<string>();
  const out: ChatMentionSent[] = [];
  for (const m of mentions) {
    const key = mentionKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: m.id, name: m.name, kind: m.kind, index: first.get(key) ?? next++, ...(typeof m.start === "number" ? { start: m.start } : {}) });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** A message's mentions, each name once: the first occurrence keeps its place and index. */
export function uniqueMentions<M extends Pick<ChatMentionCandidate, "kind" | "id">>(mentions: readonly M[]): M[] {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = mentionKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
