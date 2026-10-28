import React, { useEffect, useMemo, useRef, useState } from "react";

import { AfAudioPlayer, Icon, fileViewerKind, fileViewerNeedsText, formatFileSize, type IconName } from "@abstractframework/ui-kit";

import { fileRawLink, isLocalObjectUrl } from "./chat_media.js";
import { FileViewer } from "./file_viewer.js";
import { ChatMessageContent } from "./message_content.js";
import type { MarkdownImages } from "./markdown.js";
import { copyText } from "./utils.js";
import { ToolActivity } from "./tool_activity.js";
import type { WorkflowStatistics, WorkflowToolActivity } from "./workflow_evidence.js";
import { StatChip, formatDuration, statDetail, type StatDetail } from "./stat_detail.js";
import { formatMessageStamp, messageStampIso, messageStampTitle, useLocalDay } from "./message_footer.js";

export type ChatMessageLevel = "info" | "warn" | "error";

export type ChatMessage = {
  id?: string;
  role: string;
  content: string;
  ts?: string;
  title?: string;
  level?: ChatMessageLevel;
  /**
   * e.g. report_bug, report_feature. A `replay_view_v1.messages[]` item's
   * kind (prompt, answer, question, event, ...) maps here unchanged; see the
   * README's "Messages from the replay view" mapping.
   */
  kind?: string;
  toolActivity?: WorkflowToolActivity;
  statistics?: WorkflowStatistics;
  runId?: string;
  /**
   * Present while this assistant reply is still being streamed by the model
   * (see `WorkflowSessionController`). The card shows a streaming indicator,
   * and the model's reasoning in a collapsed "Thinking" block.
   */
  live?: ChatLiveReply;
  /**
   * The model's reasoning for a FINISHED reply, shown collapsed under
   * "Thinking" like a live reply's (hosts that do not stream, e.g. a one-shot
   * generation, still have reasoning to show).
   */
  reasoning?: string;
  /** Generated media shown inline under the message text (images, audio, video). */
  media?: ChatMedia[];
  /** Per-message stat chips (e.g. "1.2s · 24 tok"); a card's `stats` prop wins. */
  stats?: ChatStat[];
  /** Per-message attachment chips (e.g. the files a question carried); a
   * card's `attachments` prop wins. */
  attachments?: ChatAttachment[];
  /**
   * Artifact ids this message carries (`replay_view_v1.messages[].artifact_ids`,
   * or `$artifact` refs a host folded). Data only: a host resolves them into
   * `media` / `attachments` (e.g. with a transport's `resolveArtifact`).
   */
  artifactIds?: string[];
};

/**
 * One generated media item. `src` is supplied by the HOST (typically a
 * `blob:` URL of a gateway artifact it fetched with the session), never
 * parsed out of model text; `href` is the raw file link shown beside it.
 * Music rides on `audio`.
 */
export type ChatMedia = {
  id?: string;
  /**
   * `"file"`: a document (pdf, markdown, code, json, text, or a video/audio/
   * image file named as such) shown in the shared `AfFileViewer`, inline
   * behind an "Open" toggle or in the host's opener (`onOpenMedia`).
   */
  kind: "image" | "audio" | "video" | "file";
  /** Object URL / same-origin path of the bytes. A text file may give `text` instead. */
  src: string;
  /** Accessible name / link text, e.g. "Generated image". */
  label?: string;
  /** Link to the raw file (opens in a new tab). */
  href?: string;
  /** Audio: the speech-to-text transcript, shown as a collapsible caption. */
  transcript?: string;
  /** File: its name (with `contentType`, decides how it is shown). */
  name?: string;
  contentType?: string;
  size?: number;
  /** File, text kinds (markdown/code/json/text): the text the host read. */
  text?: string;
};

/** Streaming state of a live assistant reply. `content` holds the visible text only. */
export type ChatLiveReply = {
  callId: string;
  /** Reasoning text, shown collapsed and never mixed into `content`. */
  reasoning: string;
  /** Who is writing, when it is not the conversation's own agent (e.g. "sub-agent · researcher"). */
  caption?: string;
  /** The indicator's text while the reply is pending. Default "streaming";
   *  a one-shot host says what it waits for (e.g. "generating image"). */
  label?: string;
};

export type ChatAttachment = {
  id?: string;
  label: string;
  target?: string; // client/server/repo/etc
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
};

export type ChatStat = {
  id?: string;
  label: string;
  /** A ONE-line hint. A multi-line explanation is a `detail` (the message footer spec:
   *  every workflow chip opens the structured panel, never a native multi-line tooltip). */
  title?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** Structured detail (tokens / time / tools). When present the chip opens
   *  a hover/focus panel instead of a native one-line `title`. */
  detail?: StatDetail;
};

/** The workflow stat chips (2026-09-22 rework). The native `title` held one
 *  or two lines ("Input: 5,996 · Output: 423"); the ledger carries the cache
 *  split, measured TTFT, generation rate, speculation and per-tool timing.
 *  `statDetail` (pure, see stat_detail.tsx) folds them into sections; the
 *  chip renders them as a structured panel. Absent metrics read "not
 *  reported", never 0. */
function workflowStats(metrics: WorkflowStatistics): ChatStat[] {
  const tokens = metrics.totalTokens !== undefined ? statDetail("tokens", metrics) : null;
  const tools = statDetail("tools", metrics);
  const time = metrics.durationMs !== undefined ? statDetail("time", metrics) : null;
  return [
    ...(tokens ? [{ label: `${metrics.totalTokens!.toLocaleString()} tokens`, detail: tokens }] : []),
    { label: `${metrics.toolCalls} ${metrics.toolCalls === 1 ? "tool" : "tools"}`, detail: tools },
    ...(metrics.changedFiles.length ? [{ label: `${metrics.changedFiles.length} ${metrics.changedFiles.length === 1 ? "file" : "files"} changed`, detail: statDetail("files", metrics) }] : []),
    // One duration format across the chat (the stat panel, the tool rows, this chip): "4.2s", "3m 35s".
    ...(time ? [{ label: formatDuration(metrics.durationMs), detail: time }] : []),
  ];
}

type RoleUI = { label: string; icon: IconName; variant: string };

function _role_ui(m: ChatMessage): RoleUI {
  const role = String(m.role || "").trim().toLowerCase() || "system";
  const kind = String(m.kind || "").trim().toLowerCase();
  const lvl = String(m.level || "").trim().toLowerCase();

  if (role === "system" && kind === "report_bug") {
    return { label: String(m.title || "").trim() || "Bug report", icon: "warning", variant: "report_bug" };
  }
  if (role === "system" && kind === "report_feature") {
    return { label: String(m.title || "").trim() || "Feature request", icon: "check", variant: "report_feature" };
  }

  // Speaker identity over role literal (operator fix 2026-07-13): hosts pass
  // the speaker's name/handle as message.title (entity chat passes the entity
  // name); the role words are only the fallback when no identity was supplied.
  if (role === "user") return { label: String(m.title || "").trim() || "You", icon: "user", variant: "user" };
  if (role === "assistant") return { label: String(m.title || "").trim() || "Agent", icon: "bot", variant: "assistant" };

  const sys_label = String(m.title || "").trim() || (lvl === "error" ? "Error" : lvl === "warn" ? "Warning" : "System");
  const sys_icon: IconName = lvl === "error" ? "error" : lvl === "warn" ? "warning" : "info";
  const sys_variant = lvl === "error" ? "error" : lvl === "warn" ? "warn" : "status";
  return { label: sys_label, icon: sys_icon, variant: sys_variant };
}

const MEDIA_SCHEMES = new Set(["blob:", "data:", "http:", "https:"]);

/** A host-supplied media source: blob/data/http(s) or a same-origin path. */
function mediaSource(src: string): string | undefined {
  const value = String(src || "").trim();
  if (!value) return undefined;
  try {
    const base = typeof window !== "undefined" && window.location ? window.location.href : "http://same-origin.invalid/";
    return MEDIA_SCHEMES.has(new URL(value, base).protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** A document in the chat: a compact row that opens the shared file viewer
 * inline (or the host's opener). Nothing loads until it is opened. */
/**
 * A raw-file link. A browser-local URL (blob:/data:) is a DOWNLOAD named after
 * the file: it is saved, never navigated, so no script can run whatever its
 * type (a browser that cannot play a media type may render its blob as a
 * document; review N1d). A gateway URL (served with `CSP: sandbox`) opens in a
 * new tab as before.
 */
function rawLinkProps(href: string, name: string): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  return isLocalObjectUrl(href) ? { href, download: name || "file" } : { href, target: "_blank", rel: "noopener noreferrer" };
}

type MediaMarkdownPolicy = {
  renderMarkdown?: (markdown: string) => React.ReactElement;
  images?: MarkdownImages;
  inlineImage?: (src: string) => boolean;
};

function ChatMediaFile({ item, onOpen, markdown }: { item: ChatMedia; onOpen?: (item: ChatMedia) => void; markdown: MediaMarkdownPolicy }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const src = mediaSource(item.src);
  const name = String(item.name || item.label || "").trim() || "File";
  // A file keeps a way out: its raw link, or the host's object URL for an inert
  // type only. A blob:/data: URL of HTML/SVG/XML would run on the app's origin
  // without the gateway's sandbox headers (review N1): never linked.
  const href = fileRawLink({ href: item.href ? mediaSource(item.href) : undefined, src, contentType: item.contentType, name: item.name || item.label });
  const kind = fileViewerKind(name, item.contentType);
  const needsText = fileViewerNeedsText(kind);
  const hasText = typeof item.text === "string";
  if (!src && !href && !hasText) return null;
  const size = formatFileSize(item.size);
  const label = String(item.label || "").trim() || name;
  return (
    <figure className="pc-chat-media__item pc-chat-media__item--file" data-file-kind={kind}>
      <div className="pc-chat-media__file-row">
        <Icon name="file" size={14} />
        <span className="pc-chat-media__file-name" title={name}>
          {label}
        </span>
        {size ? <span className="pc-chat-media__file-size">{size}</span> : null}
        {onOpen ? (
          <button
            type="button"
            className="pc-chat-media__file-open"
            data-action="open-file"
            // The opener gets the item as the kit would render it: sanitized sources only.
            onClick={() => onOpen({ ...item, src: src || "", ...(href ? { href } : { href: undefined }) })}
          >
            Open
          </button>
        ) : (
          <button type="button" className="pc-chat-media__file-open" data-action="toggle-file" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Open"}
          </button>
        )}
        {href ? (
          <a className="pc-chat-media__link" {...rawLinkProps(href, String(item.name || "").trim() || label)}>
            Raw file
          </a>
        ) : null}
      </div>
      {open && !onOpen ? (
        <FileViewer
          className="pc-chat-media__viewer"
          name={name}
          kind={kind}
          contentType={item.contentType}
          sizeBytes={item.size}
          status={needsText && !hasText ? "error" : "ready"}
          error={needsText && !hasText ? (href ? "No preview text was supplied for this file; open the raw file." : "No preview text was supplied for this file.") : undefined}
          // The chat's image policy reaches a Markdown file too (default "link":
          // a generated document must not make the browser fetch remote images).
          markdownImages={markdown.images || "link"}
          {...(markdown.inlineImage ? { inlineImage: markdown.inlineImage } : {})}
          {...(markdown.renderMarkdown ? { renderMarkdown: markdown.renderMarkdown } : {})}
          {...(hasText ? { text: item.text } : {})}
          {...(src && !needsText ? { url: src } : {})}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </figure>
  );
}

function ChatMediaItem({ item, onOpenFile, markdown }: { item: ChatMedia; onOpenFile?: (item: ChatMedia) => void; markdown?: MediaMarkdownPolicy }): React.ReactElement | null {
  const [failed, setFailed] = useState(false);
  if (item.kind === "file") return <ChatMediaFile item={item} onOpen={onOpenFile} markdown={markdown || {}} />;
  const src = mediaSource(item.src);
  const href = item.href ? mediaSource(item.href) : undefined;
  const kind = item.kind === "image" || item.kind === "audio" || item.kind === "video" ? item.kind : null;
  if (!kind || (!src && !href)) return null;
  const noun = kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio";
  const label = String(item.label || "").trim() || `Generated ${noun.toLowerCase()}`;
  const onError = () => setFailed(true);
  return (
    <figure className={`pc-chat-media__item pc-chat-media__item--${kind}`}>
      {src && kind === "image" ? <img className="pc-chat-media__image" src={src} alt={label} loading="lazy" onError={onError} /> : null}
      {src && kind === "video" ? <video className="pc-chat-media__video" src={src} controls playsInline preload="metadata" aria-label={label} onError={onError} /> : null}
      {src && kind === "audio" ? <AfAudioPlayer className="pc-chat-media__audio" src={src} name={label} /> : null}
      {kind === "audio" && String(item.transcript || "").trim() ? (
        <details className="pc-chat-media__transcript">
          <summary>Transcript</summary>
          <p className="pc-chat-media__transcript-text">{String(item.transcript).trim()}</p>
        </details>
      ) : null}
      {failed ? (
        <div className="pc-chat-media__error" role="note">
          {noun} could not be decoded by this browser{href ? "; open the raw file with the link." : "."}
        </div>
      ) : null}
      {href ? (
        <figcaption className="pc-chat-media__caption">
          <a className="pc-chat-media__link" {...rawLinkProps(href, String(item.name || "").trim() || label)}>
            {label}
          </a>
        </figcaption>
      ) : null}
    </figure>
  );
}

export type ChatMessageCardProps = {
  message: ChatMessage;
  className?: string;
  renderMarkdown?: (markdown: string) => React.ReactElement;
  attachments?: ChatAttachment[];
  stats?: ChatStat[];
  onSpeakToggle?: (message: ChatMessage) => void;
  getSpeakState?: (message: ChatMessage) => SpeakState;
  showCopy?: boolean;
  jsonCollapseAfterDepth?: number;
  /**
   * Image loading in the message's Markdown. Default: `"link"` for every
   * message except the user's own (model- and workflow-written text cannot
   * make the browser fetch a remote URL; only images `inlineImage` accepts,
   * by default same-origin ones, load), `"inline"` for user messages.
   * Ignored when `renderMarkdown` is set (the host renderer decides).
   */
  images?: MarkdownImages;
  inlineImage?: (src: string) => boolean;
  /**
   * Per-message slot rendered under the card (after attachments and stats),
   * e.g. a per-turn detail badge. Return null for nothing.
   */
  renderFooter?: (message: ChatMessage) => React.ReactNode;
  /**
   * Per-message presentation. `"hint"` renders the message as one discreet
   * line (no avatar, header or copy): a system note such as "Rejoined the
   * open visit". `undefined` keeps the full card.
   */
  variant?: (message: ChatMessage) => "hint" | undefined;
  /** Host opener for `media` items of kind `"file"` (e.g. a side drawer).
   * Without it the file opens inline in the shared viewer. */
  onOpenMedia?: (item: ChatMedia) => void;
};

/** The read-aloud state a host reports for a message (`useGatewayVoice().tts_playback.status`). */
export type SpeakState = "idle" | "loading" | "playing" | "paused";

/**
 * What the message's speaker button shows for a read-aloud state: the spinner ONLY while the
 * first audio is being generated ("loading"); once audio plays, Pause; paused, Play; else the
 * speaker. A host that keeps "loading" while audio plays is wrong: `useGatewayVoice` turns
 * "playing" as the first segment starts (check_voice_stream.mjs).
 */
export function speakButtonView(state: SpeakState): { icon: IconName; title: string; spinning: boolean } {
  if (state === "loading") return { icon: "loader", title: "Generating audio…", spinning: true };
  if (state === "playing") return { icon: "pause", title: "Pause", spinning: false };
  if (state === "paused") return { icon: "play", title: "Resume", spinning: false };
  return { icon: "speaker", title: "Speak (TTS)", spinning: false };
}

/**
 * One chat message. Its meta line (stamp, speaker, copy) and stat chips follow the message
 * footer spec in `message_footer.ts` (the one spec every web app and the desktop follow):
 *  - stamp: `formatMessageStamp` (time today; "Yesterday · 10:52 PM"; "Oct 21 · 10:52 PM");
 *  - speaker: on every assistant message when `onSpeakToggle` is given, always visible;
 *    disabled with its reason while streaming or without text, never dropped;
 *  - copy: always visible unless `showCopy === false`;
 *  - stat chips: each opens the structured `StatDetailPanel`, never a multi-line `title`.
 */
export function ChatMessageCard(props: ChatMessageCardProps): React.ReactElement {
  const m = props.message;
  const role_ui = useMemo(() => _role_ui(m), [m.kind, m.level, m.role, m.title]);
  // A host may pass an ISO string or epoch milliseconds; a malformed one renders no stamp, never "Invalid Date".
  const raw_ts = m.ts as unknown as string | number | undefined;
  // Re-derived when the reader's calendar day changes ("10:52 PM" becomes "Yesterday · 10:52 PM"):
  // `useLocalDay` re-renders the card at local midnight.
  const day_key = useLocalDay();
  const time_label = useMemo(() => formatMessageStamp(raw_ts), [raw_ts, day_key]);
  const time_title = useMemo(() => messageStampTitle(raw_ts), [raw_ts]);
  const time_iso = useMemo(() => messageStampIso(raw_ts), [raw_ts]);

  const [copy_state, set_copy_state] = useState<"idle" | "copied" | "failed">("idle");
  const copy_timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copy_timer.current !== null) window.clearTimeout(copy_timer.current);
    };
  }, []);

  const live = m.live;
  // The speaker is PERMANENT on an assistant message of a TTS host (footer spec): it is
  // disabled, never dropped, while the reply streams or when there is no text to read.
  const show_speaker = typeof props.onSpeakToggle === "function" && role_ui.variant === "assistant";
  const speak_blocked = !show_speaker ? "" : live ? "Read aloud when the reply is finished" : !String(m.content || "").trim() ? "No text to read aloud" : "";
  const can_speak = show_speaker && !speak_blocked;
  const speak_state = can_speak ? props.getSpeakState?.(m) || "idle" : "idle";
  const speak = speakButtonView(speak_state);
  const show_copy = props.showCopy !== false;

  const attachments = Array.isArray(props.attachments) ? props.attachments : Array.isArray(m.attachments) ? m.attachments : [];
  const metrics = m.statistics;
  const own_stats = m.stats;
  const stats: ChatStat[] = useMemo(
    () => (Array.isArray(props.stats) ? props.stats : Array.isArray(own_stats) ? own_stats : metrics ? workflowStats(metrics) : []),
    [props.stats, own_stats, metrics],
  );
  const media = Array.isArray(m.media) ? m.media : [];
  const reasoning = live ? String(live.reasoning || "") : String(m.reasoning || "");
  const has_text = Boolean(String(m.content || "").trim());

  if (m.toolActivity) return <ToolActivity tool={m.toolActivity} showCopy={props.showCopy} />;
  const footer = props.renderFooter ? props.renderFooter(m) : null;
  // A session-policy decision (contract §5) is an activity line, never a card.
  if (props.variant?.(m) === "hint" || m.kind === "tool_policy_decision") {
    const level = String(m.level || "").trim().toLowerCase();
    return (
      <div
        className={["pc-chat-hint", level === "warn" || level === "error" ? `pc-chat-hint--${level}` : "", props.className].filter(Boolean).join(" ")}
        role="note"
        data-variant="hint"
      >
        <span className="pc-chat-hint__text">{String(m.content || "")}</span>
        {footer != null && footer !== false ? <div className="pc-chat-footer">{footer}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={["pc-chat-item", `pc-chat-item--${role_ui.variant}`, live ? "pc-chat-item--live" : "", props.className].filter(Boolean).join(" ")}
      {...(live ? { "aria-busy": true } : {})}
    >
      <div className="pc-chat-header">
        <div className="pc-chat-avatar" aria-hidden="true">
          <Icon name={role_ui.icon} size={14} />
        </div>
        <span className="pc-chat-role">{role_ui.label}</span>
        {live ? (
          <span className="pc-chat-live-indicator" title={live.label ? `Pending: ${live.label}` : "The reply is still being written"}>
            <span className="pc-chat-live-dot" aria-hidden="true" />
            {live.label || "streaming"}
          </span>
        ) : null}
        {live?.caption ? <span className="pc-chat-live-caption">{live.caption}</span> : null}
        <span className="pc-chat-header-spacer" />
        {time_label ? (
          <time className="pc-chat-time" dateTime={time_iso || undefined} title={time_title || undefined}>
            {time_label}
          </time>
        ) : null}
        <div className="pc-chat-header-actions">
          {show_speaker ? (
            <button
              className="pc-chat-icon-btn"
              type="button"
              aria-label={speak_blocked || speak.title}
              title={speak_blocked || speak.title}
              data-speak-state={speak_blocked ? "unavailable" : speak_state}
              // aria-disabled, not `disabled`: the button stays focusable so its reason is reachable.
              {...(speak_blocked ? { "aria-disabled": true } : {})}
              onClick={can_speak ? () => props.onSpeakToggle?.(m) : undefined}
            >
              {/* Keyed per icon: the spinning element is replaced (never re-used) once audio starts. */}
              <Icon key={speak.icon} name={speak.icon} size={22} className={speak.spinning ? "pc-chat-speak-spinner" : undefined} />
            </button>
          ) : null}
          {show_copy ? (
            <button
              className={`pc-chat-icon-btn ${copy_state !== "idle" ? `pc-chat-icon-btn--${copy_state}` : ""}`.trim()}
              type="button"
              aria-label="Copy message"
              title={copy_state === "idle" ? "Copy" : copy_state === "copied" ? "Copied" : "Copy failed"}
              onClick={async () => {
                const ok = await copyText(String(m.content || ""));
                set_copy_state(ok ? "copied" : "failed");
                if (copy_timer.current !== null) window.clearTimeout(copy_timer.current);
                copy_timer.current = window.setTimeout(() => set_copy_state("idle"), 900);
              }}
            >
              <Icon name="copy" size={22} />
            </button>
          ) : null}
        </div>
      </div>

      {reasoning.trim() ? (
        <details className="pc-chat-thinking">
          <summary>Thinking</summary>
          <div className="pc-chat-thinking-body">{reasoning}</div>
        </details>
      ) : null}

      {has_text || (!live && !media.length) ? (
        <div className="pc-chat-body">
          <ChatMessageContent
            text={String(m.content || "")}
            renderMarkdown={props.renderMarkdown}
            jsonCollapseAfterDepth={props.jsonCollapseAfterDepth}
            images={props.images || (role_ui.variant === "user" ? "inline" : "link")}
            inlineImage={props.inlineImage}
          />
        </div>
      ) : null}

      {media.length ? (
        <div className="pc-chat-media">
          {media.slice(0, 24).map((item, idx) => (
            <ChatMediaItem
              key={item.id || `${item.kind}:${item.src}:${idx}`}
              item={item}
              onOpenFile={props.onOpenMedia}
              markdown={{ renderMarkdown: props.renderMarkdown, images: props.images, inlineImage: props.inlineImage }}
            />
          ))}
        </div>
      ) : null}

      {attachments.length ? (
        <div className="pc-chat-attachments" aria-label="Attachments">
          {attachments.slice(0, 24).map((a, idx) => {
            const label = String(a.label || "").trim() || "attachment";
            const target = String(a.target || "").trim();
            const title = String(a.title || "").trim();
            const disabled = Boolean(a.disabled) || typeof a.onClick !== "function";
            return (
              <button
                key={a.id || `${label}:${idx}`}
                type="button"
                className="pc-chat-attachment-chip"
                title={title || label}
                onClick={disabled ? undefined : a.onClick}
                disabled={disabled}
              >
                <Icon name="paperclip" size={14} />
                {target ? <span className={`pc-chat-attachment-target pc-chat-attachment-target--${target}`}>{target}</span> : null}
                <span className="pc-chat-attachment-name">{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {stats.length ? (
        <div className="pc-chat-stats" aria-label="Stats">
          {stats.slice(0, 12).map((s, idx) => {
            const label = String(s.label || "").trim();
            if (!label) return null;
            if (s.detail)
              return <StatChip key={s.id || `${label}:${idx}`} label={label} detail={s.detail} icon={s.icon} onClick={s.onClick} />;
            const title = String(s.title || "").trim();
            const clickable = typeof s.onClick === "function";
            const StatElement = clickable ? "button" : "span";
            return (
              <StatElement
                key={s.id || `${label}:${idx}`}
                {...(clickable ? { type: "button" as const } : {})}
                className={["pc-chat-stat", clickable ? "pc-chat-stat--clickable" : ""].filter(Boolean).join(" ")}
                title={title || undefined}
                onClick={clickable ? () => s.onClick?.() : undefined}
              >
                {s.icon ? <span className="pc-chat-stat-icon" aria-hidden="true">{s.icon}</span> : null}
                <span className="pc-chat-stat-label">{label}</span>
              </StatElement>
            );
          })}
        </div>
      ) : null}

      {footer != null && footer !== false ? <div className="pc-chat-footer">{footer}</div> : null}
    </div>
  );
}

export default ChatMessageCard;
