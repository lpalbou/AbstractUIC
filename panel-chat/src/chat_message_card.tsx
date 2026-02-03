import React, { useMemo, useState } from "react";

import "./panel_chat.css";

import { Icon, type IconName } from "@abstractuic/ui-kit";

import { ChatMessageContent } from "./message_content";
import { copyText } from "./utils";

export type ChatMessageLevel = "info" | "warn" | "error";

export type ChatMessage = {
  id?: string;
  role: string;
  content: string;
  ts?: string;
  title?: string;
  level?: ChatMessageLevel;
  kind?: string; // e.g. report_bug, report_feature
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
};

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

  if (role === "user") return { label: "You", icon: "user", variant: "user" };
  if (role === "assistant") return { label: "Agent", icon: "bot", variant: "assistant" };

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
  const time_label = ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  const [copy_state, set_copy_state] = useState<"idle" | "copied" | "failed">("idle");

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
  const stats = Array.isArray(props.stats) ? props.stats : [];

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
                window.setTimeout(() => set_copy_state("idle"), 900);
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
            const title = String(s.title || "").trim();
            const clickable = typeof s.onClick === "function";
            return (
              <button
                key={s.id || `${label}:${idx}`}
                type="button"
                className={["pc-chat-stat", clickable ? "pc-chat-stat--clickable" : ""].filter(Boolean).join(" ")}
                title={title || undefined}
                onClick={clickable ? () => s.onClick?.() : undefined}
                disabled={!clickable}
              >
                {s.icon ? <span className="pc-chat-stat-icon" aria-hidden="true">{s.icon}</span> : null}
                <span className="pc-chat-stat-label">{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default ChatMessageCard;
