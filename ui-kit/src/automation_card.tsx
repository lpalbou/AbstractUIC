import React from "react";
import { CompactActivityCard } from "./compact_activity_card.js";
import { Icon } from "./icon.js";
import type { AutomationSummary } from "./automations/types.js";

/** Same facts as the Watch ScheduleLine; never derives a scheduled fire time. */
export function automationCardSchedule(s: AutomationSummary): string {
  const config = s.trigger.config;
  if (typeof config.every === "string") {
    const match = /^([1-9][0-9]*)([smhd])$/.exec(config.every);
    if (match) {
      const seconds = Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]] || 1);
      if (Number.isSafeInteger(seconds)) {
        for (const [size, unit] of [[86400, "d"], [3600, "h"], [60, "m"], [1, "s"]] as const)
          if (seconds % size === 0) return `${seconds / size}${unit}`;
      }
    }
  }
  if (s.trigger.source_id === "schedule") {
    const words: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", once: "Once" };
    return words[String(config.kind)] || (s.trigger.source_version === 1 && !config.every ? "Once" : s.schedule_rule_text || "Schedule");
  }
  if (s.trigger.source_id.startsWith("email")) return "Email";
  if (s.trigger.source_id === "manual") return "Manual";
  return s.trigger_text || s.schedule_rule_text || "Event";
}

/** A duration UNTIL a gateway-served time, matching the Watch's compact countdown. */
export function automationCardNext(at: string | undefined, nowMs: number): string {
  const ms = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return "";
  const seconds = Math.floor((ms - nowMs) / 1000);
  if (seconds <= 30) return "now";
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (seconds < 172800) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export interface AutomationCardProps {
  summary: AutomationSummary;
  selected?: boolean;
  nowMs: number;
  onOpen: () => void;
  onArchive?: () => void;
  archiveDisabled?: boolean;
  archiveTitle?: string;
  disabled?: boolean;
  className?: string;
}

/** Controlled Watch-style automation row. Pause/resume belongs in the editor, not the list. */
export function AutomationCard(p: AutomationCardProps): React.ReactElement {
  const s = p.summary;
  const pending = s.attention.pending_waits > 0;
  const unseen = Math.max(0, s.attention.unseen_count);
  const working = Boolean(s.current_occurrence) && !pending;
  const failed = s.last_occurrence?.status === "failed" || s.status === "failed";
  const cadence = automationCardSchedule(s);
  const nextAt = s.next_run_at;
  const next = s.status === "active" ? automationCardNext(nextAt, p.nowMs) : "";
  const state = s.status === "paused" ? "Paused" : s.status === "archived" ? "Archived" : s.status === "failed" ? "Failed" : s.status === "completed" ? "Ended" : "";
  const count = Number.isSafeInteger(s.occurrence_count) && s.occurrence_count >= 0 ? s.occurrence_count : null;
  const rule = s.trigger_text || s.schedule_rule_text || cadence;
  const description = [pending ? "Needs you" : working ? "Running" : "", failed ? "Last run failed" : "", unseen ? `${unseen} new results` : "",
    count !== null ? `Ran ${count} ${count === 1 ? "time" : "times"}` : "", state || rule, next ? `Next run ${next === "now" ? "due now" : `in ${next}`}` : ""].filter(Boolean).join(". ");
  return <CompactActivityCard title={s.title || "Automation"} description={description} selected={p.selected}
    className={`af-automation-card${p.className ? ` ${p.className}` : ""}`} unread={unseen > 0 || s.attention.unread} needsAttention={pending} working={working} failed={failed}
    openAttributes={{ "data-automation-id": s.automation_id, "data-status": s.status }} disabled={p.disabled}
    onOpen={p.onOpen} onArchive={p.onArchive} archiveDisabled={p.archiveDisabled} archiveTitle={p.archiveTitle || "Archive automation"}
    metadata={<>
      {count !== null && <span data-field="runs" title={`Ran ${count} times`} aria-label={`${count} runs`}><Icon name="loop" size={14} /><span aria-hidden="true">{count}</span></span>}
      <span className="af-automation-card__schedule" data-field="cadence" title={rule} aria-label={state || rule}>
        <Icon name={s.status === "paused" ? "pause" : state ? "stop" : "clock"} size={14} /><span aria-hidden="true">{state || cadence}</span>
      </span>
      {next && <span data-field="next" title={`Next run: ${nextAt}`} aria-label={`Next run ${next === "now" ? "due now" : `in ${next}`}`}><Icon name="playCircle" size={14} /><span aria-hidden="true">{next}</span></span>}
      {pending && <span className="af-session-card__attention">Needs you</span>}
      {unseen > 0 && <span className="af-automation-card__unseen" aria-label={`${unseen} new results`} title={`${unseen} new results`}>{unseen}</span>}
    </>} />;
}
