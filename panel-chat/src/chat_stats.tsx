import React from "react";
import type { WorkflowStatistics } from "./workflow_evidence.js";
import { StatChip, formatDuration, statDetail, type StatDetail } from "./stat_detail.js";

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
export function workflowStats(metrics: WorkflowStatistics): ChatStat[] {
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

/** A turn's stat chips (a message card's, or a tools-only turn's under its tool group). */
export function ChatStatsRow({ stats }: { stats: ChatStat[] }): React.ReactElement {
  return (
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
  );
}
