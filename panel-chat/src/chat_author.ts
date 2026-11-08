/**
 * Who wrote a turn ("@entity from any chat window", operator 2026-11-08).
 *
 * `ChatAuthor` is the gateway's turn-surface shape, kept field for field so a host passes it
 * through unchanged: `{kind, name, entity_id, identity_ref, avatar: {style, color}}`, every
 * field present (null when unknown, never omitted). A message without an author (an older
 * gateway) renders exactly as before: the header shows `message.title || "Agent"` and no tile.
 *
 * DOM-free: the card and the composer's mention list share these rules; checked by
 * `scripts/check_mentions.mjs`.
 */

export type ChatAuthorKind = "entity" | "agent" | "person";

/** An identity look (framework ADR 0052): the AbstractAvatar design and its colour. */
export type ChatAvatarLook = { style: string | null; color: string | null };

export type ChatAuthor = {
  kind: ChatAuthorKind;
  name: string | null;
  entity_id: string | null;
  identity_ref: string | null;
  avatar: ChatAvatarLook | null;
};

const KINDS: readonly ChatAuthorKind[] = ["entity", "agent", "person"];

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}

/** A look, or null when it carries neither a design nor a colour. */
export function chatAvatarLookOf(value: unknown): ChatAvatarLook | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const style = text(v.style);
  const color = text(v.color);
  return style || color ? { style, color } : null;
}

/**
 * The author a wire value names, or null for anything that is not one (absent, null, an
 * unknown kind). Unknown kinds are refused, never guessed: the card then renders as today.
 */
export function chatAuthorOf(value: unknown): ChatAuthor | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const kind = typeof v.kind === "string" ? (v.kind.trim().toLowerCase() as ChatAuthorKind) : null;
  if (!kind || !KINDS.includes(kind)) return null;
  return { kind, name: text(v.name), entity_id: text(v.entity_id), identity_ref: text(v.identity_ref), avatar: chatAvatarLookOf(v.avatar) };
}

/** What a mark draws: the entity's design (or its initial disc), the agent's mark, a person. */
export type ChatAuthorMarkKind = "entity" | "agent" | "person";

export type ChatAuthorView = {
  /** The name shown in the header. */
  name: string;
  /** The small kind tag beside the name ("entity" / "agent"); none for a person. */
  tag: "entity" | "agent" | null;
  mark: ChatAuthorMarkKind;
  /** The entity's look when it has one (a design draws the orb; a colour alone tints the disc). */
  look: ChatAvatarLook | null;
  /** The disc's letter when there is no design. */
  initial: string;
};

const FALLBACK_NAME: Record<ChatAuthorKind, string> = { entity: "Entity", agent: "Agent", person: "Someone" };

/**
 * The header of an assistant-side message with an author: its name (the author's, else the
 * host's `title`, else the kind's word), its kind tag and its mark. Null without an author,
 * so the card keeps today's header.
 */
export function chatAuthorView(author: ChatAuthor | null | undefined, title?: string | null): ChatAuthorView | null {
  const a = chatAuthorOf(author);
  if (!a) return null;
  const name = a.name || text(title) || FALLBACK_NAME[a.kind];
  return {
    name,
    tag: a.kind === "person" ? null : a.kind,
    mark: a.kind,
    look: a.kind === "entity" ? a.avatar : null,
    initial: name.charAt(0).toUpperCase(),
  };
}
