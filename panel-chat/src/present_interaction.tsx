// Runtime waits → the controls `WorkflowChat` / `WorkflowInteractionPanel`
// render. One mapping for every client (AbstractCode web, the Observer's
// automation discussions, …) so a tool approval, a question or an event wait
// looks and answers the same everywhere. Moved here from AbstractCode web
// (`workspace/interaction.tsx`), which the Observer had copied in part.
import { resolveWorkflowEventTarget } from "./event_target.js";
import { JsonViewer } from "./json_viewer.js";
import { ToolCallWordsList } from "@abstractframework/ui-kit";
import { toolArguments } from "./tool_activity.js";
import { sessionPolicyClampedText } from "./tool_policy.js";
import { WORKFLOW_INTERACTION_LABELS, type WorkflowInteraction } from "./workflow_interaction.js";
import type { ServerRecord, SessionToolPolicy, WorkflowRecord, WorkflowSessionController, WorkflowWaitInteraction } from "./workflow_runtime.js";
import type { ReplayViewInteraction } from "./replay_view.js";
import { replayInteractionWait } from "./replay_view_projection.js";
import { publicApprovalRequest } from "./public_approval.js";

/**
 * The served, tree-resolved pending interaction of the replay view
 * (`replay_view_v1.interaction`: the newest person-facing open wait in the
 * run tree, with a ready `command`). `WorkflowSessionController` reads it from
 * `GET runs/{id}/view` and its stream when the host transport provides
 * `replayView` (see `replay_view.ts`); `presentInteraction` accepts it as well
 * as a raw wait. Shape as written by `ReplayView._interaction_of`
 * (abstractruntime 0.15.0 `replay/view.py`): `details` has `tool_calls`
 * stripped (they are top-level).
 */
export type ReplayInteraction = ReplayViewInteraction;

/** True for a `replay_view_v1.interaction` (it has `run_id` + `wait_key`, a raw wait has `runId` + `wait`). */
export function isReplayInteraction(value: unknown): value is ReplayInteraction {
  const v = value as Record<string, unknown> | null;
  return Boolean(v && typeof v === "object" && typeof v.run_id === "string" && typeof v.wait_key === "string" && !("wait" in v));
}

/** The raw runtime wait a replay interaction stands for (same control, same target). */
export { replayInteractionWait };

export type PresentInteractionOptions = {
  /** The session's records: an event wait is routed from them (`resolveWorkflowEventTarget`). */
  records?: WorkflowRecord[];
  /** The run the wait belongs to, when the host has it. */
  currentRun?: ServerRecord | null;
  /** "Decide later" / "Keep waiting": the host dismisses the control. Nothing is sent. */
  onDefer?: () => void | Promise<unknown>;
  /** Offer "Continue without answering" on a question: resumes with an empty answer. */
  allowSkip?: boolean;
  /**
   * A tool approval offers exactly Deny, Allow and Allow All (operator ruling 2026-11-07).
   * `sessionPolicy: true` makes Allow and Allow All last for the rest of this session, on the
   * gateway's session tool policy (contract v1). The MODE is the controller's
   * (`controller.sessionPolicyStatus()`), never a host prop, so the card always does what it says:
   * - `"gateway"`: Allow writes `{approve:{tools:[<this request's tools>]}}`, Allow All writes
   *   `{approve:{all:true}}`, each THEN answers the shown wait. Nothing else is written: never
   *   the app's default tool settings.
   * - `"local-fallback"` / `"unavailable"`: no session grant exists; Allow answers this request
   *   only, one line says so, and Allow All is not offered.
   * Without it (a host with no conversation session, e.g. an automation's discussion: the
   * session grant never reaches automation runs), Allow answers this request only, said in one
   * line. Re-present on every snapshot change (the mode can change).
   */
  sessionPolicy?: boolean;
};

/** The controller methods the controls call. */
export type InteractionController = Pick<WorkflowSessionController, "approve" | "resume" | "emitEvent"> &
  Partial<Pick<WorkflowSessionController, "approveToolsForSession" | "approveAllForSession" | "sessionPolicyStatus" | "answerEvent">>;

/**
 * Converts a runtime wait into a control, or null when the wait is not one a
 * person answers here (e.g. a subworkflow wait: never a question).
 */
export function presentInteraction(
  input: WorkflowWaitInteraction | ReplayInteraction | null,
  controller: InteractionController,
  options: PresentInteractionOptions = {},
): WorkflowInteraction | null {
  if (!input) return null;
  const raw: WorkflowWaitInteraction = isReplayInteraction(input) ? replayInteractionWait(input) : input;
  const wait = raw.wait as Record<string, any>;
  const id = `${raw.runId}:${wait.wait_key}:${raw.stepId || ""}`;
  const details = wait.details || {};
  if (details.mode === "approval_required" || details.kind === "tool_approval") {
    const calls: any[] = Array.isArray(details.tool_calls) ? details.tool_calls : [];
    const target = { runId: raw.runId, waitKey: String(wait.wait_key || ""), stepId: raw.stepId };
    const names = [...new Set(calls.map((call: any) => String(call?.name || "tool")))];
    const L = WORKFLOW_INTERACTION_LABELS;
    const tools = names.join(", ") || "the requested tools";
    const answerOnce = async () => {
      await controller.approve(true, target);
    };
    // Allow and Allow All: the session's grant on the gateway, or this request only.
    let onApprove: () => Promise<unknown> = answerOnce;
    let onApproveAll: (() => Promise<unknown>) | undefined;
    let scopeNote: string | undefined = L.allowThisRequestNote;
    // Tools of this batch the session's stored policy denies: the gateway refuses them even if allowed.
    let refusedByPolicy: string[] = [];
    if (options.sessionPolicy) {
      const approveToolsForSession = controller.approveToolsForSession;
      const approveAllForSession = controller.approveAllForSession;
      const sessionPolicyStatus = controller.sessionPolicyStatus;
      if (typeof approveToolsForSession !== "function" || typeof approveAllForSession !== "function" || typeof sessionPolicyStatus !== "function")
        throw new Error("presentInteraction: sessionPolicy needs a WorkflowSessionController (approveToolsForSession, approveAllForSession, sessionPolicyStatus).");
      const status = sessionPolicyStatus.call(controller);
      if (status.mode === "gateway") {
        const stored = status.policy;
        refusedByPolicy = stored ? names.filter((name) => Object.prototype.hasOwnProperty.call(stored.deny || {}, name)) : [];
        // What the gateway did not store (`clamped`) is said after the click, never dropped.
        const covered = (result: SessionToolPolicy | null) => {
          const notCovered = sessionPolicyClampedText(result?.clamped);
          return notCovered ? { outcomeNote: notCovered } : undefined;
        };
        onApprove = async () => {
          const result = await approveToolsForSession.call(controller, target, names);
          // Sent, but not a success: the session's policy denies these, and deny wins (contract §4.3).
          return refusedByPolicy.length ? { outcomeNote: `The gateway refuses ${refusedByPolicy.join(", ")}: denied by this session's policy.` } : covered(result);
        };
        onApproveAll = async () => covered(await approveAllForSession.call(controller, target, {}));
        scopeNote = undefined;
      } else {
        scopeNote = L.noSessionGrantNote;
      }
    }
    return {
      id,
      kind: "tool-approval",
      title: `${calls.length || "Requested"} ${calls.length === 1 ? "action needs" : "actions need"} permission`,
      toolName: tools,
      publicRequest: publicApprovalRequest(calls, details.public_action, raw.runId),
      detail: (
        <div className="pc-approval-summary">
          {/* The calls in words (the kit's ToolCallWordsList, ui-kit tool_call_words), the same
              card as the automation panel's and the Assistant's; the exact arguments stay one click away. */}
          <ToolCallWordsList
            calls={calls.map((call: any) => {
              const args = toolArguments(call?.arguments);
              return { name: String(call?.name || "tool"), arguments: args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : null };
            })}
            label="Tool calls to approve"
            heading="The assistant wants to use these tools:"
          />
          <details>
            <summary>Review full tool arguments (JSON)</summary>
            <JsonViewer value={calls.length ? calls : details} />
          </details>
        </div>
      ),
      approveLabel: L.allow,
      denyLabel: L.deny,
      ...(onApproveAll ? { approveTitle: L.allowTitle(tools), approveAllLabel: L.allowAll, approveAllTitle: L.allowAllTitle, onApproveAll } : {}),
      ...(scopeNote ? { scopeNote } : {}),
      ...(refusedByPolicy.length
        ? { deniedNote: `Denied by this session's policy: ${refusedByPolicy.join(", ")}. The gateway refuses ${refusedByPolicy.length === 1 ? "it" : "them"} even if allowed.` }
        : {}),
      ...(options.onDefer ? { onDefer: options.onDefer } : {}),
      onApprove,
      onDeny: async () => {
        await controller.approve(false, target);
      },
    };
  }
  const askTarget = { runId: raw.runId, waitKey: String(wait.wait_key || ""), stepId: raw.stepId };
  const question = details.question && typeof details.question === "object" && details.question.purpose === "conversation" ? details.question : null;
  const essential = question?.importance === "essential";
  const clarification = question?.importance === "clarification";
  const deadlineTime = typeof question?.deadline === "string" && Number.isFinite(Date.parse(question.deadline))
    ? new Date(question.deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  if (wait.reason === "user" || wait.reason === "ask_user")
    return {
      id,
      kind: "ask-user",
      title: essential ? "Your answer is required" : clarification ? "A clarification for you" : "A question for you",
      ...(essential ? { description: "This question needs your answer. I will keep waiting; silence does not grant permission." } : clarification ? { description: `${deadlineTime ? `Answer by ${deadlineTime}. ` : ""}${question.fallback ? `Without an answer: ${String(question.fallback)}` : ""}` } : {}),
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
        await controller.resume(answer, askTarget);
      },
      ...(options.allowSkip && !question
        ? {
            onSkip: async () => {
              await controller.resume("", askTarget);
            },
          }
        : {}),
      ...(options.onDefer ? { onDefer: options.onDefer } : {}),
    };
  const key = String(wait.wait_key || "");
  if (wait.reason === "event" || key.startsWith("evt:")) {
    // The replay view names the answer: its `command` resumes this wait with the payload
    // (`answer_payload: "{payload}"`). No event route is derived from records.
    const command = raw.command;
    if (command) {
      const answerEvent = controller.answerEvent;
      if (typeof answerEvent !== "function") throw new Error("presentInteraction: an event wait from the replay view needs a WorkflowSessionController (answerEvent).");
      const eventTarget = { runId: raw.runId, waitKey: key, stepId: raw.stepId };
      return {
        id,
        kind: "event-wait",
        title: "Waiting for your input",
        eventName: key,
        prompt: String(wait.prompt || "This workflow is waiting for an event."),
        description: Array.isArray(wait.choices) && wait.choices.length ? `Expected: ${wait.choices.map((choice: unknown) => (typeof choice === "object" && choice !== null ? String((choice as any).label ?? (choice as any).value ?? "") : String(choice))).join(", ")}` : "The data you send resumes this wait.",
        initialPayload: "{}",
        payloadLabel: "Event data (JSON)",
        sendLabel: "Send",
        onSend: async (text) => {
          await answerEvent.call(controller, JSON.parse(text || "{}"), eventTarget);
        },
      };
    }
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
