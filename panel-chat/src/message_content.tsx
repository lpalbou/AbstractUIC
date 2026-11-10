import React, { useMemo } from "react";

import { JsonViewer } from "./json_viewer.js";
import { Markdown, type MarkdownImages } from "./markdown.js";
import { ChatMentionChip, withMentionChips } from "./mention_chip.js";
import { mentionKey, mentionTokenText, messageMentionsPlaced, type ChatMessageMention } from "./mentions.js";
import { tryParseJson } from "./utils.js";

const seamsLogged = new Set<string>();
/** A mention the card cannot draw as a chip: said once, loudly (#SEAM), never dropped silently. */
function mentionSeam(reason: string, text: string, mentions: readonly unknown[]): void {
  for (const m of mentions) {
    const key = m && typeof m === "object" ? `${mentionKey(m as ChatMessageMention)}@${String((m as ChatMessageMention).start)}` : String(m);
    const seen = `${reason}\u0000${key}\u0000${text}`;
    if (seamsLogged.has(seen)) continue;
    if (seamsLogged.size >= 500) seamsLogged.clear();
    seamsLogged.add(seen);
    console.error(`#SEAM panel-chat: ${reason}; its words stay plain text.`, m);
  }
}

export function ChatMessageContent(props: {
  text: string;
  className?: string;
  renderMarkdown?: (markdown: string) => React.ReactElement;
  jsonCollapseAfterDepth?: number;
  /** Passed to `Markdown` (default `"inline"` here; chat cards pass `"link"` for non-user messages). */
  images?: MarkdownImages;
  inlineImage?: (src: string) => boolean;
  /**
   * The message's mentions ({id, name, kind, index, start}): each one whose "@Name" sits at its
   * `start` in `text` is drawn as the composer's chip, in place. One without a valid `start`
   * keeps its plain words (logged once as `#SEAM`). Drawn by the kit's Markdown only (not with
   * `renderMarkdown`, not in a JSON message).
   */
  mentions?: readonly ChatMessageMention[];
  /** The host's card for a mention chip, shown after a 150 ms rest on it (`ChatMentionChip`). */
  renderMentionCard?: (mention: ChatMessageMention) => React.ReactNode | null;
}): React.ReactElement {
  const text = String(props.text ?? "");
  // Memoized on text: an unmemoized parse gives the viewer a new object
  // identity per parent render, re-folding a tree the user expanded
  // (adversary find 2026-07-12).
  const parsed = useMemo(() => tryParseJson(text), [text]);
  const cls = ["pc-chat-content", props.className].filter(Boolean).join(" ");
  const where = useMemo(() => (props.mentions?.length ? messageMentionsPlaced(text, props.mentions) : null), [text, props.mentions]);
  if (where?.unplaced.length) mentionSeam("a message mention has no valid start (its \"@Name\" is not at mentions[].start in the text)", text, where.unplaced);

  if (parsed !== null) {
    if (where?.placed.length) mentionSeam("a JSON message cannot draw mention chips", text, where.placed);
    return (
      <div className={cls}>
        <JsonViewer value={parsed} collapseAfterDepth={props.jsonCollapseAfterDepth} />
      </div>
    );
  }

  if (props.renderMarkdown) {
    if (where?.placed.length) mentionSeam("mention chips are drawn by the kit's Markdown, not by a host renderMarkdown", text, where.placed);
    return <div className={cls}>{props.renderMarkdown(text)}</div>;
  }

  const placed = where?.placed ?? [];
  const tokens = placed.length ? mentionTokenText(text, placed) : null;
  if (placed.length && tokens === null) mentionSeam("the message text holds the characters the chips are placed with (U+FDD0/U+FDD1)", text, placed);
  if (tokens !== null) {
    // `Markdown` is a plain function (no hooks): its tree is walked to put each chip in place.
    const tree = Markdown({ text: tokens, images: props.images, inlineImage: props.inlineImage });
    return (
      <div className={cls}>
        {withMentionChips(tree, placed, (m, key) => <ChatMentionChip key={key} mention={m} renderCard={props.renderMentionCard} />)}
      </div>
    );
  }

  return (
    <div className={cls}>
      <Markdown text={text} images={props.images} inlineImage={props.inlineImage} />
    </div>
  );
}
