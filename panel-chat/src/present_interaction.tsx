// Runtime waits → the controls `WorkflowChat` / `WorkflowInteractionPanel`
// render. One mapping for every client (AbstractCode web, the Observer's
// automation discussions, …) so a tool approval, a question or an event wait
// looks and answers the same everywhere. Moved here from AbstractCode web
// (`workspace/interaction.tsx`), which the Observer had copied in part.
import React from "react";

import { resolveWorkflowEventTarget } from "./event_target.js";
import { JsonViewer } from "./json_viewer.js";
import { ToolActivityGroup } from "./tool_activity.js";
import type { WorkflowInteraction } from "./workflow_interaction.js";
import type { ServerRecord, WorkflowRecord, WorkflowSessionController, WorkflowWaitInteraction } from "./workflow_runtime.js";

export type PresentInteractionOptions = {
  /** The session's records: an event wait is routed from them (`resolveWorkflowEventTarget`). */
  records?: WorkflowRecord[];
  /** The run the wait belongs to, when the host has it. */
  currentRun?: ServerRecord | null;
  /**
   * Offer "Allow all enabled tools" on a tool approval: approves the batch,
   * then the host switches its tool policy to all (`permissions: all`).
   * Omit it and only Allow once / Deny are offered.
   */
  onPermissionsAll?: () => Promise<void>;
};

/** The controller methods the controls call. */
export type InteractionController = Pick<WorkflowSessionController, "approve" | "approveWithPolicyChange" | "resume" | "emitEvent">;

/**
 * Converts a runtime wait into a control, or null when the wait is not one a
 * person answers here (e.g. a subworkflow wait: never a question).
 */
export function presentInteraction(
  raw: WorkflowWaitInteraction | null,
  controller: InteractionController,
  options: PresentInteractionOptions = {},
): WorkflowInteraction | null {
  if (!raw) return null;
  const wait = raw.wait as Record<string, any>;
  const id = `${raw.runId}:${wait.wait_key}:${raw.stepId || ""}`;
  const details = wait.details || {};
  if (details.mode === "approval_required" || details.kind === "tool_approval") {
    const calls: any[] = Array.isArray(details.tool_calls) ? details.tool_calls : [];
    const target = { runId: raw.runId, waitKey: String(wait.wait_key || ""), stepId: raw.stepId };
    const names = [...new Set(calls.map((call: any) => String(call?.name || "tool")))];
    const onPermissionsAll = options.onPermissionsAll;
    return {
      id,
      kind: "tool-approval",
      title: `${calls.length || "Requested"} ${calls.length === 1 ? "action needs" : "actions need"} permission`,
      toolName: names.join(", ") || "the requested tools",
      description: "Review the targets below. Allow once approves this batch only.",
      detail: (
        <div className="pc-approval-summary">
          <ToolActivityGroup
            tools={calls.map((call: any, index: number) => ({
              id: String(call?.call_id || call?.id || index),
              runId: raw.runId,
              name: call?.name || "Tool",
              arguments: call?.arguments,
              status: "waiting" as const,
            }))}
          />
          <details>
            <summary>Review full tool arguments (JSON)</summary>
            <JsonViewer value={calls.length ? calls : details} />
          </details>
        </div>
      ),
      approveLabel: "Allow once",
      denyLabel: "Deny",
      approveAllLabel: onPermissionsAll ? "Allow all enabled tools" : undefined,
      approveAllDescription: onPermissionsAll
        ? "Sets permissions: all for this Gateway account, including future turns. Unchecked tools stay unavailable; explicit Ask overrides and Gateway restrictions remain enforced. Questions still need your answer."
        : undefined,
      onApproveAll: onPermissionsAll
        ? async () => {
            await controller.approveWithPolicyChange(target, () => {
              void onPermissionsAll();
            });
          }
        : undefined,
      onApprove: async () => {
        await controller.approve(true, target);
      },
      onDeny: async () => {
        await controller.approve(false, target);
      },
    };
  }
  if (wait.reason === "user" || wait.reason === "ask_user")
    return {
      id,
      kind: "ask-user",
      title: "A question for you",
      prompt: String(wait.prompt || details.prompt || "How would you like to continue?"),
      allowFreeText: wait.allow_free_text !== false,
      choices: (Array.isArray(wait.choices) ? wait.choices : []).map((choice: any) =>
        typeof choice === "object" && choice !== null
          ? {
              id: String(choice.value ?? choice.id ?? choice.label),
              label: String(choice.label ?? choice.text ?? choice.value ?? choice.id),
              description: choice.description,
            }
          : { id: String(choice), label: String(choice) },
      ),
      onSubmit: async (answer) => {
        await controller.resume(answer);
      },
    };
  const key = String(wait.wait_key || "");
  if (wait.reason === "event" || key.startsWith("evt:")) {
    const routing = resolveWorkflowEventTarget(raw, options.records || [], options.currentRun ?? null);
    const target = routing.target;
    const eventName = target?.name || "";
    return {
      id,
      kind: "event-wait",
      title: target ? "Waiting for an event" : "Event routing unavailable",
      eventName,
      prompt: String(wait.prompt || `This workflow will continue when “${eventName || "its trigger"}” arrives.`),
      description: target ? "You can also send the expected event here." : `This event cannot be sent safely. ${routing.error}`,
      initialPayload: "{}",
      payloadLabel: "Event data (JSON)",
      sendLabel: "Send event",
      onSend: async (text) => {
        if (!target) throw new Error(routing.error);
        const payload = JSON.parse(text || "{}");
        const event: Record<string, unknown> = { name: target.name, scope: target.scope, payload };
        if (target.scope === "session") event.session_id = target.scopeId;
        else if (target.scope === "workflow") event.workflow_id = target.scopeId;
        else if (target.scope === "run") event.run_id = target.scopeId;
        await controller.emitEvent(event);
      },
    };
  }
  return null;
}
