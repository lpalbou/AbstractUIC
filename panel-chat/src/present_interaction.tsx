// Runtime waits → the controls `WorkflowChat` / `WorkflowInteractionPanel`
// render. One mapping for every client (AbstractCode web, the Observer's
// automation discussions, …) so a tool approval, a question or an event wait
// looks and answers the same everywhere. Moved here from AbstractCode web
// (`workspace/interaction.tsx`), which the Observer had copied in part.
import { resolveWorkflowEventTarget } from "./event_target.js";
import { JsonViewer } from "./json_viewer.js";
import { ToolActivityGroup } from "./tool_activity.js";
import { sessionPolicyClampedText } from "./tool_policy.js";
import { WORKFLOW_INTERACTION_LABELS, type WorkflowInteraction, type WorkflowInteractionRemember, type WorkflowToolApprovalInteraction } from "./workflow_interaction.js";
import type { ServerRecord, SessionPolicyMode, SessionToolPolicy, SessionToolPolicyClamp, WorkflowRecord, WorkflowSessionController, WorkflowWaitInteraction } from "./workflow_runtime.js";

/**
 * The served, tree-resolved pending interaction of the replay view
 * (`replay_view_v1.interaction`: the newest person-facing open wait in the
 * run tree, with a ready `command`).
 *
 * THIS IS A SEAM, NOT A DATA PATH: no gateway on `main` serves it yet (there
 * is no `GET /runs/{id}/view` and no `/view/stream`; the view is WIP on
 * abstractruntime `feat/replay-view`, root backlog 0993). Today's data path
 * stays the ledger fold + served `runs/{id}.waiting`
 * (`WorkflowSessionController` / `useWorkflowSession`). `presentInteraction`
 * accepts this shape so the panel does not change when the view ships; this
 * package never fetches a `/view` route.
 *
 * Shape as written by `ReplayView._interaction_of` (abstractruntime
 * `replay/view.py`): `details` has `tool_calls` stripped (they are top-level),
 * and `kind` is one of the person-facing kinds.
 */
export type ReplayInteraction = {
  kind: "tool_approval" | "ask_user";
  run_id: string;
  wait_key: string;
  step_id?: string | null;
  seq?: number | null;
  prompt?: string | null;
  choices?: unknown[] | null;
  allow_free_text?: boolean | null;
  details?: Record<string, unknown> | null;
  tool_calls?: unknown[] | null;
  activity_id?: string | null;
  command?: { type: "resume"; run_id: string; payload: { wait_key: string } };
};

/** True for a `replay_view_v1.interaction` (it has `run_id` + `wait_key`, a raw wait has `runId` + `wait`). */
export function isReplayInteraction(value: unknown): value is ReplayInteraction {
  const v = value as Record<string, unknown> | null;
  return Boolean(v && typeof v === "object" && typeof v.run_id === "string" && typeof v.wait_key === "string" && !("wait" in v));
}

/** The raw runtime wait a replay interaction stands for (same control, same target). */
export function replayInteractionWait(interaction: ReplayInteraction): WorkflowWaitInteraction {
  const details: Record<string, unknown> = { ...(interaction.details || {}) };
  if (interaction.kind === "tool_approval") {
    details.kind = "tool_approval";
    details.tool_calls = Array.isArray(interaction.tool_calls) ? interaction.tool_calls : [];
  }
  const wait: Record<string, unknown> = { wait_key: interaction.wait_key, reason: interaction.kind === "ask_user" ? "user" : "tool_approval", details };
  if (interaction.prompt != null) wait.prompt = interaction.prompt;
  if (Array.isArray(interaction.choices)) wait.choices = interaction.choices;
  if (typeof interaction.allow_free_text === "boolean") wait.allow_free_text = interaction.allow_free_text;
  return { runId: interaction.run_id, wait, ...(interaction.step_id ? { stepId: interaction.step_id } : {}) };
}

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
  /**
   * Where the "Allow all enabled tools" policy is kept, in the host's words
   * ("for this Gateway account", "in this browser"). Only the host knows; the
   * default sentence asserts no scope (backlog 0032: AbstractCode said
   * "Gateway account" over per-browser storage).
   */
  approveAllScope?: string;
  /**
   * Offer "Allow for this chat": approves this batch, then the host turns on
   * its chat-scoped grant (e.g. a session-level tool policy it applies to
   * every run of this conversation with `setToolApprovalPolicy`). The host
   * owns the scope because a chat spans several runs: the controller's own
   * `allowAllToolsForRun` ends with the run. Omit it and the button is not
   * offered.
   */
  onAllowForSession?: () => Promise<void>;
  /** Why the broad grants cannot be offered for this batch (rendered disabled, reason visible). */
  approveAllDisabledReason?: string;
  /** Host-owned per-tool "remember" checkbox for this batch's tool names. */
  remember?: (toolNames: string[]) => WorkflowInteractionRemember | null | undefined;
  /** "Decide later" / "Keep waiting": the host dismisses the control. Nothing is sent. */
  onDefer?: () => void | Promise<unknown>;
  /** Offer "Continue without answering" on a question: resumes with an empty answer. */
  allowSkip?: boolean;
  /**
   * The conversation's tool policy (session tool policy contract v1). With
   * `mode: "gateway"` (from `snapshot.sessionPolicyMode`): "Allow for this chat"
   * writes `{approve:{all:true}}` to the gateway THEN answers the shown wait,
   * and each toolset of the batch gets "Allow all <toolset> tools for this
   * chat" (`{approve:{kinds:[toolset]}}`). `toolsetOf(name)` maps a tool to the
   * `toolset` of its `GET discovery/tools` row; a call carrying `toolset` wins;
   * a tool with neither gets no kind button. `clamped`
   * (`snapshot.sessionPolicyClamped`) renders "Not covered: …". With
   * `mode: "local-fallback"` the local grant stays (the host's
   * `onAllowForSession`, else the controller's run-scoped grant) and a labeled
   * line says the gateway cannot store conversation policies.
   */
  sessionPolicy?: {
    mode: SessionPolicyMode;
    toolsetOf?: (toolName: string) => string | undefined;
    clamped?: readonly SessionToolPolicyClamp[];
    /** Contract `approve.max_risk_rank` for "Allow for this chat" (default: unset). */
    maxRiskRank?: number;
  };
};

/** The controller methods the controls call. */
export type InteractionController = Pick<WorkflowSessionController, "approve" | "approveWithPolicyChange" | "resume" | "emitEvent"> &
  Partial<Pick<WorkflowSessionController, "approveAllForSession" | "approveKindForSession">>;

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
    const onPermissionsAll = options.onPermissionsAll;
    const onAllowForSession = options.onAllowForSession;
    const scope = String(options.approveAllScope || "").trim();
    const remember = options.remember?.(names) || undefined;
    const L = WORKFLOW_INTERACTION_LABELS;
    // The host's chat-scoped grant (pre-session-policy path, kept as-is).
    const hostChatGrant = onAllowForSession
      ? {
          approveForSessionLabel: L.allowForChat,
          approveForSessionDescription: "Allow for this chat approves this batch and the enabled tools for the rest of this conversation. Unchecked tools stay unavailable; questions still need your answer.",
          onApproveForSession: async () => {
            let grant: Promise<void> | undefined;
            await controller.approveWithPolicyChange(target, () => {
              grant = onAllowForSession();
            });
            // The batch is approved; a failed chat-wide grant is shown, never swallowed.
            if (grant)
              await grant.catch((error: unknown) => {
                throw new Error(`This batch was allowed, but "Allow for this chat" could not be turned on: ${error instanceof Error ? error.message : String(error)}`);
              });
          },
        }
      : {};
    let sessionFields: Partial<WorkflowToolApprovalInteraction> = hostChatGrant;
    const policy = options.sessionPolicy;
    if (policy) {
      const approveAllForSession = controller.approveAllForSession;
      const approveKindForSession = controller.approveKindForSession;
      if (typeof approveAllForSession !== "function" || typeof approveKindForSession !== "function")
        throw new Error("presentInteraction: sessionPolicy needs a controller with approveAllForSession / approveKindForSession (WorkflowSessionController).");
      const covered = (result: SessionToolPolicy | null) => {
        const note = sessionPolicyClampedText(result?.clamped);
        return note ? { outcomeNote: note } : undefined;
      };
      const notCovered = sessionPolicyClampedText(policy.clamped);
      if (policy.mode === "gateway") {
        // Toolsets come from the wait's calls (`toolset`) or the host's
        // `GET discovery/tools` rows (`toolsetOf`); an unknown one is never guessed.
        const toolsets = [
          ...new Set(
            calls
              .map((call: any) => String(call?.toolset || "").trim() || String(policy.toolsetOf?.(String(call?.name || "")) || "").trim())
              .filter(Boolean),
          ),
        ] as string[];
        sessionFields = {
          approveForSessionLabel: L.allowForChat,
          approveForSessionDescription:
            "Allow for this chat approves this batch and stores a policy for this conversation on the gateway: later tool calls of every run of this conversation run without asking, until the policy is reset. Tools the gateway does not authorize stay uncovered.",
          onApproveForSession: async () => covered(await approveAllForSession.call(controller, target, policy.maxRiskRank !== undefined ? { maxRiskRank: policy.maxRiskRank } : {})),
          approveKinds: toolsets.map((kind) => ({
            kind,
            label: L.allowKindForChat(kind),
            onApprove: async () => covered(await approveKindForSession.call(controller, target, kind)),
          })),
          ...(notCovered ? { notCovered } : {}),
        };
      } else {
        // No silent hedge: the local grant is labeled with its real scope.
        sessionFields = onAllowForSession
          ? { ...hostChatGrant, scopeNote: L.localChatPolicyNote }
          : {
              approveForSessionLabel: L.allowForChat,
              onApproveForSession: async () => {
                await approveAllForSession.call(controller, target, {});
              },
              scopeNote: L.localRunPolicyNote,
            };
      }
    }
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
      approveLabel: WORKFLOW_INTERACTION_LABELS.allowOnce,
      denyLabel: WORKFLOW_INTERACTION_LABELS.deny,
      approveAllLabel: onPermissionsAll ? WORKFLOW_INTERACTION_LABELS.allowAll : undefined,
      approveAllDescription: onPermissionsAll
        ? `Sets permissions: all${scope ? ` ${scope}` : ""}, including future turns. Unchecked tools stay unavailable; explicit Ask overrides and Gateway restrictions remain enforced. Questions still need your answer.`
        : undefined,
      ...sessionFields,
      ...(options.approveAllDisabledReason ? { disabledReason: options.approveAllDisabledReason } : {}),
      ...(remember ? { remember } : {}),
      ...(options.onDefer ? { onDefer: options.onDefer } : {}),
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
  const askTarget = { runId: raw.runId, waitKey: String(wait.wait_key || ""), stepId: raw.stepId };
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
        await controller.resume(answer, askTarget);
      },
      ...(options.allowSkip
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
