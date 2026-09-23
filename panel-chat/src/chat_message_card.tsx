import React, { useEffect, useMemo, useRef, useState } from "react";

import { Icon, type IconName } from "@abstractframework/ui-kit";

import { ChatMessageContent } from "./message_content.js";
import { copyText } from "./utils.js";
import { ToolActivity } from "./tool_activity.js";
import type { WorkflowStatistics, WorkflowToolActivity } from "./workflow_evidence.js";
import { StatChip, statDetail, type StatDetail } from "./stat_detail.js";

export type ChatMessageLevel = "info" | "warn" | "error";

export type ChatMessage = {
  id?: string;
  role: string;
  content: string;
  ts?: string;
  title?: string;
  level?: ChatMessageLevel;
  kind?: string; // e.g. report_bug, report_feature
  toolActivity?: WorkflowToolActivity;
  statistics?: WorkflowStatistics;
  runId?: string;
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
    ...(metrics.changedFiles.length ? [{ label: `${metrics.changedFiles.length} ${metrics.changedFiles.length === 1 ? "file" : "files"} changed`, title: metrics.changedFiles.join("\n") }] : []),
    ...(time ? [{ label: `${(metrics.durationMs! / 1000).toFixed(metrics.durationMs! < 10000 ? 1 : 0)}s`, detail: time }] : []),
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

export type ChatMessageCardProps = {
  message: ChatMessage;
  className?: string;
  renderMarkdown?: (markdown: string) => React.ReactElement;
  attachments?: ChatAttachment[];
  stats?: ChatStat[];
  onSpeakToggle?: (message: ChatMessage) => void;
  getSpeakState?: (message: ChatMessage) => "idle" | "loading" | "playing" | "paused";
  showCopy?: boolean;
  jsonCollapseAfterDepth?: number;
};

export function ChatMessageCard(props: ChatMessageCardProps): React.ReactElement {
  const m = props.message;
  const role_ui = useMemo(() => _role_ui(m), [m.kind, m.level, m.role, m.title]);
  const ts = String(m.ts || "").trim();
  const time_label = useMemo(() => {
    if (!ts) return "";
    const d = new Date(ts);
    // A malformed timestamp must render as no timestamp, never "Invalid Date".
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [ts]);

  const [copy_state, set_copy_state] = useState<"idle" | "copied" | "failed">("idle");
  const copy_timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copy_timer.current !== null) window.clearTimeout(copy_timer.current);
    };
  }, []);

  const can_speak = typeof props.onSpeakToggle === "function" && role_ui.variant === "assistant" && Boolean(String(m.content || "").trim());
  const speak_state = can_speak ? props.getSpeakState?.(m) || "idle" : "idle";
  const speak_icon: IconName = speak_state === "loading" ? "loader" : speak_state === "playing" ? "pause" : "speaker";
  const speak_title =
    speak_state === "loading"
      ? "Generating audio…"
      : speak_state === "playing"
        ? "Pause"
        : speak_state === "paused"
          ? "Resume"
          : "Speak (TTS)";
  const show_copy = props.showCopy !== false;

  const attachments = Array.isArray(props.attachments) ? props.attachments : [];
  const metrics = m.statistics;
  const stats: ChatStat[] = useMemo(
    () => (Array.isArray(props.stats) ? props.stats : metrics ? workflowStats(metrics) : []),
    [props.stats, metrics],
  );

  if (m.toolActivity) return <ToolActivity tool={m.toolActivity} showCopy={props.showCopy} />;

  return (
    <div className={["pc-chat-item", `pc-chat-item--${role_ui.variant}`, props.className].filter(Boolean).join(" ")}>
      <div className="pc-chat-header">
        <div className="pc-chat-avatar" aria-hidden="true">
          <Icon name={role_ui.icon} size={14} />
        </div>
        <span className="pc-chat-role">{role_ui.label}</span>
        <span className="pc-chat-header-spacer" />
        {time_label ? <span className="pc-chat-time">{time_label}</span> : null}
        <div className="pc-chat-header-actions">
          {can_speak ? (
            <button
              className="pc-chat-icon-btn"
              type="button"
              aria-label={speak_title}
              title={speak_title}
              onClick={() => props.onSpeakToggle?.(m)}
            >
              <Icon name={speak_icon} size={22} />
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

      <div className="pc-chat-body">
        <ChatMessageContent text={String(m.content || "")} renderMarkdown={props.renderMarkdown} jsonCollapseAfterDepth={props.jsonCollapseAfterDepth} />
      </div>

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
    </div>
  );
}

export default ChatMessageCard;
