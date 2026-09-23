/**
 * A minimal, real embedding of the controlled chat + injected runtime.
 *
 * The host supplies `WorkflowTransport`; it can use fetch, a desktop bridge,
 * or a test double. Keep credentials in that transport's request scope — this
 * component and the runtime controller intentionally do not persist tokens.
 */
import React, { useMemo, useState } from "react";
import {
  JsonViewer,
  WorkflowChat,
  resolveWorkflowEventTarget,
  useWorkflowSession,
  workflowPendingInteraction,
  type ServerRecord,
  type WorkflowInteraction,
  type WorkflowSessionController,
  type WorkflowTransport,
  type WorkflowWaitInteraction,
  type WorkflowRecord,
} from "@abstractframework/panel-chat";

import "@abstractframework/panel-chat/panel_chat.css";
import "@abstractframework/ui-kit/theme.css";

export type WorkflowAssistantExampleProps = {
  /** The host-owned adapter for GET history/ledger, SSE, and commands. */
  transport: WorkflowTransport;
  runId: string;
  /** A user/session id or monotonically increasing auth generation, never a token. */
  authScopeKey: string | number;
  /** The host starts, steers, or queues a turn through its own durable protocol. */
  onSend: (message: string) => Promise<void>;
  /** Hosts may refresh their non-secret auth scope after an authenticated failure. */
  onAuthError?: (error: unknown) => void;
  disabled?: boolean;
};

function record(value: unknown): ServerRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ServerRecord : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function waitToInteraction(
  waitState: WorkflowWaitInteraction | null,
  controller: WorkflowSessionController,
  records: WorkflowRecord[],
  currentRun: ServerRecord | null,
): WorkflowInteraction | null {
  if (!waitState) return null;
  const wait = waitState.wait;
  const details = record(wait.details);
  const waitKey = string(wait.wait_key) || waitState.runId;
  const reason = string(wait.reason).toLowerCase();
  const kind = string(details.kind).toLowerCase();

  if (details.mode === "approval_required" || kind === "tool_approval" || reason === "tool_approval") {
    const calls = Array.isArray(details.tool_calls) ? details.tool_calls.map(record) : [];
    return {
      kind: "tool-approval",
      id: waitKey,
      title: "Tool approval required",
      toolName: calls.map((call) => string(call.name)).filter(Boolean).join(", ") || "requested tool",
      detail: <JsonViewer value={calls.length ? calls : details} />,
      onApprove: () => controller.approve(true),
      onDeny: () => controller.approve(false),
    };
  }

  if (reason === "event" || kind === "event") {
    const routing = resolveWorkflowEventTarget(waitState, records, currentRun);
    const target = routing.target;
    return {
      kind: "event-wait",
      id: waitKey,
      title: target ? "Workflow event required" : "Event routing unavailable",
      eventName: target?.name,
      prompt: string(wait.prompt) || (target ? `Provide JSON data for “${target.name}”.` : "This event cannot be sent safely."),
      description: target ? "Send the event to the exact scope requested by this wait." : routing.error,
      onSend: (payloadText) => {
        if (!target) return Promise.reject(new Error(routing.error));
        return controller.emitEvent(eventPayload(target, payloadText));
      },
    };
  }

  if (!["user", "ask_user"].includes(reason)) return null;
  const choices = Array.isArray(wait.choices)
    ? wait.choices.map(record).map((choice, index) => ({
        id: string(choice.id) || string(choice.value) || String(index),
        label: string(choice.label) || string(choice.title) || string(choice.value) || `Choice ${index + 1}`,
        description: string(choice.description) || undefined,
      }))
    : undefined;
  return {
    kind: "ask-user",
    id: waitKey,
    title: "Response required",
    prompt: string(wait.prompt) || "Provide a response to continue.",
    choices,
    allowFreeText: wait.allow_free_text !== false,
    onSubmit: (answer) => controller.resume(answer),
  };
}

function eventPayload(target: { name: string; scope: string; scopeId: string }, payloadText: string): Record<string, unknown> {
  let payload: unknown;
  try { payload = JSON.parse(payloadText || "{}"); } catch { throw new Error("Event data must be valid JSON."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Event data must be a JSON object.");
  const event: Record<string, unknown> = { name: target.name, scope: target.scope, payload };
  if (target.scope === "session") event.session_id = target.scopeId;
  else if (target.scope === "workflow") event.workflow_id = target.scopeId;
  else if (target.scope === "run") event.run_id = target.scopeId;
  return event;
}

export function WorkflowAssistantExample(props: WorkflowAssistantExampleProps): React.ReactElement {
  const [draft, setDraft] = useState("");
  const { controller, snapshot } = useWorkflowSession({
    transport: props.transport,
    runId: props.runId,
    authScopeKey: props.authScopeKey,
    onAuthError: props.onAuthError,
  });
  // A tool batch the controller already granted is running work, not a card.
  const pending = workflowPendingInteraction(snapshot);
  const interaction = useMemo(() => waitToInteraction(pending, controller, snapshot.records, snapshot.run), [pending, snapshot.records, snapshot.run, controller]);
  const busy = !["idle", "completed", "failed", "cancelled"].includes(snapshot.status);

  return (
    <WorkflowChat
      messages={snapshot.messages}
      draft={draft}
      onDraftChange={setDraft}
      onSend={async (message) => {
        // Clear only after the host durably accepts its own turn protocol; a
        // failed callback leaves the controlled draft visible for retry.
        await props.onSend(message);
        setDraft("");
      }}
      busy={busy}
      busyLabel={snapshot.status === "waiting" ? "Waiting for you" : "Working…"}
      onCancel={() => controller.cancel()}
      disabled={props.disabled}
      interaction={interaction}
      header={<span>{snapshot.displayStatus || snapshot.status}</span>}
      footer={snapshot.error ? <span role="status">{snapshot.error}</span> : null}
      emptyState="Start a workflow conversation."
    />
  );
}
