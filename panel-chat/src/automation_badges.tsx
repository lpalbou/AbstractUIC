// Automations v1 — two standalone chat pieces (no requests, no state).
//
// - ScheduleThisAction: a "Schedule this…" button for a chat header slot
//   (e.g. `WorkflowChat`'s `header`). It hands the host a seed (the chat's
//   target and prompt); the host opens its create flow (ui-kit
//   `AfScheduleDialog`) and sends the request.
// - FromAutomationBadge: marks a message or session that an automation
//   produced: "from automation <title> · #<index>", optionally clickable.
import React from "react";
import { Icon } from "@abstractframework/ui-kit";

/** What the host knows about the chat being scheduled (all optional). */
export type ScheduleSeed = {
  prompt?: string;
  title?: string;
  /** The chat's target, in the create-request shape (`{bundle_ref, flow_id}` or `{flow_id:"@default", interface}`). */
  target?: { flow_id: string; bundle_ref?: string; interface?: string; input_data?: Record<string, unknown> };
};

export type ScheduleThisActionProps = {
  seed: ScheduleSeed;
  onSchedule(seed: ScheduleSeed): void;
  disabled?: boolean;
  /** Defaults to "Schedule this…". */
  label?: string;
  className?: string;
};

export function ScheduleThisAction(props: ScheduleThisActionProps): React.ReactElement {
  const label = props.label ?? "Schedule this…";
  return (
    <button
      type="button"
      className={`pc-btn pc-schedule-this${props.className ? ` ${props.className}` : ""}`}
      disabled={props.disabled}
      aria-label={label}
      title="Run this task on a schedule"
      onClick={() => props.onSchedule(props.seed)}
    >
      <Icon name="history" size={14} />
      <span>{label}</span>
    </button>
  );
}

export type FromAutomationBadgeProps = {
  /** The automation's title. */
  title: string;
  /** Occurrence index, when the message belongs to one occurrence. */
  index?: number;
  /** Open the automation (makes the badge a button). */
  onOpen?(): void;
  className?: string;
};

/** "from automation <title> · #<index>". */
export function fromAutomationText(title: string, index?: number): string {
  return `from automation ${title}${typeof index === "number" ? ` · #${index}` : ""}`;
}

export function FromAutomationBadge(props: FromAutomationBadgeProps): React.ReactElement {
  const text = fromAutomationText(props.title, props.index);
  const cls = `pc-from-automation${props.className ? ` ${props.className}` : ""}`;
  if (props.onOpen) {
    return (
      <button type="button" className={`${cls} pc-from-automation--button`} onClick={props.onOpen} title="Open the automation">
        <Icon name="history" size={12} />
        <span>{text}</span>
      </button>
    );
  }
  return (
    <span className={cls}>
      <Icon name="history" size={12} />
      <span>{text}</span>
    </span>
  );
}
