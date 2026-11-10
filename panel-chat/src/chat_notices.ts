/**
 * What a reply formed, shown as badges under its words (AbstractRuntime turn notices,
 * 2026-11-09). The runtime serves the reply WITHOUT its bracket markers
 * ("[kept in diary - …]", "[learned: "…"]") and, beside it, a structured list:
 *
 *   [{kind: "diary"|"question"|"lesson"|"interest"|"realization",
 *     record_id: <graph id of the formed record> | null,
 *     title: <as formed; "" while it is still being written>,
 *     text?: <his words, whole>,
 *     visibility?: "private",        a private diary entry: title "" and no words
 *     staged?: true}]                a visit-lane election that forms at the visit's close
 *                                    (record_id null until then)
 *
 * The kit never reads a marker out of the text: a badge exists only for a served notice.
 * This module is pure (no DOM, no React): `chatNoticesOf` reads a served list, `chatNoticeView`
 * says what one badge shows. `ChatNoticeBadges` (chat_notice_badges.tsx) renders the row.
 */
import type { IconName } from "@abstractframework/ui-kit";

/** The kinds the runtime serves today. Another kind still renders, with its own word. */
export type ChatNoticeKind = "diary" | "question" | "lesson" | "interest" | "realization";

/** One structured turn notice, as served (snake_case kept: the host hands it back to its gateway). */
export type ChatNotice = {
  kind: ChatNoticeKind | (string & {});
  /** The graph id of the formed record; null while it is staged for the visit's close. */
  record_id: string | null;
  /** The title as formed ("" while it is still being written, and for a private entry). */
  title: string;
  /** His words, whole (absent for a private entry and for most diary entries). */
  text?: string;
  /** "private": a private diary entry; it carries no words. */
  visibility?: string;
  /** A visit-lane lesson, interest or realization that forms at the visit's close. */
  staged?: boolean;
};

export const CHAT_NOTICE_KINDS: readonly ChatNoticeKind[] = ["diary", "question", "lesson", "interest", "realization"];

const ICONS: Record<ChatNoticeKind, IconName> = {
  diary: "book",
  question: "chat",
  lesson: "check",
  interest: "activity",
  realization: "sparkle",
};

/** The words for the badge's own sentences (exported so hosts and checks use the same ones). */
export const CHAT_NOTICE_WORDS = {
  group: "Kept from this reply",
  private: "private diary entry",
  staged: "forming…",
  /** The staged word in a badge's accessible name (no ellipsis glyph for a screen reader to say). */
  stagedSpoken: "forming",
  privateNote: "A private diary entry: its words are not shown in the conversation.",
  stagedNote: "Forming: it is kept when the visit closes.",
  close: "Close",
} as const;

/**
 * The notices of a served list (a reply's `notices` / `reply_notices`): only notice-shaped
 * items (an object with a `kind`), the runtime's own rule (`history_bundle.turn_notices_of`); a
 * list of plain strings (an operator log) is not this list. Fields are copied as served, never
 * derived from text.
 */
export function chatNoticesOf(raw: unknown): ChatNotice[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatNotice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const kind = typeof r.kind === "string" ? r.kind.trim().toLowerCase() : "";
    if (!kind) continue;
    const id = typeof r.record_id === "string" && r.record_id.trim() ? r.record_id.trim() : null;
    const notice: ChatNotice = { kind, record_id: id, title: typeof r.title === "string" ? r.title : "" };
    if (typeof r.text === "string") notice.text = r.text;
    if (typeof r.visibility === "string" && r.visibility.trim()) notice.visibility = r.visibility.trim();
    if (r.staged === true) notice.staged = true;
    out.push(notice);
  }
  return out;
}

/** What one badge says. */
export type ChatNoticeView = {
  key: string;
  kind: string;
  /** The kind's word ("diary", "lesson", …). */
  word: string;
  icon: IconName;
  /** After the word: the title; "private diary entry"; else his words (whole; the badge shows
   *  their first words, the panel all of them); "" = the word alone. */
  label: string;
  /** The label is his words (the title is still empty). */
  fromText: boolean;
  private: boolean;
  /** Forms at the visit's close (no record yet). */
  staged: boolean;
  /** The badge's accessible name: words only (his line breaks read as spaces, no glyph). */
  ariaLabel: string;
};

export function chatNoticeView(notice: ChatNotice, index = 0): ChatNoticeView {
  const kind = String(notice.kind || "").trim().toLowerCase();
  const known = (CHAT_NOTICE_KINDS as readonly string[]).includes(kind) ? (kind as ChatNoticeKind) : null;
  const word = known || kind.replace(/_/g, " ");
  const isPrivate = String(notice.visibility || "").trim().toLowerCase() === "private";
  const staged = notice.staged === true;
  const title = String(notice.title || "").trim();
  const text = typeof notice.text === "string" ? notice.text.trim() : "";
  const label = isPrivate ? (kind === "diary" ? CHAT_NOTICE_WORDS.private : `private ${word}`) : title || text;
  const fromText = !isPrivate && !title && Boolean(text);
  const Word = word.charAt(0).toUpperCase() + word.slice(1);
  const spoken = label.split(/\s+/).filter(Boolean).join(" ");
  return {
    key: `${index}:${kind}:${notice.record_id || ""}`,
    kind,
    word,
    icon: isPrivate ? "lock" : known ? ICONS[known] : "info",
    label,
    fromText,
    private: isPrivate,
    staged,
    ariaLabel: `${Word}${spoken ? `: ${spoken}` : ""}${staged ? ` (${CHAT_NOTICE_WORDS.stagedSpoken})` : ""}`,
  };
}

