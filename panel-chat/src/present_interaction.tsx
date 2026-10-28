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
import type { ServerRecord, SessionToolPolicy, WorkflowRecord, WorkflowSessionController, WorkflowWaitInteraction } from "./workflow_runtime.js";
import type { ReplayViewInteraction } from "./replay_view.js";
import { replayInteractionWait } from "./replay_view_projection.js";

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
   * Turn on the chat's tool policy controls (session tool policy contract v1).
   * The MODE is the controller's (`controller.sessionPolicyStatus()`), never a
   * host prop, so the controls always say what the click will do:
   * - `"gateway"`: "Allow for this chat" writes `{approve:{all:true}}` THEN answers
   *   the shown wait; each toolset of the batch gets "Allow all <toolset> tools for
   *   this chat" (`{approve:{kinds:[toolset]}}`). `toolsetOf(name)` maps a tool to the
   *   `toolset` of its `GET discovery/tools` row; a call carrying `toolset` wins; a
   *   tool with neither gets no kind button. The controller's `clamped` renders
   *   "Not covered: …".
   * - `"local-fallback"`: the host's `onAllowForSession` ("Allow for this chat",
   *   labeled browser-only), else the controller's run-scoped grant ("Allow for this
   *   run", labeled).
   * - `"unavailable"`: no chat grant; the reason is shown; Allow once still works.
   * Re-present on every snapshot change (the mode can change).
   */
  sessionPolicy?: {
    toolsetOf?: (toolName: string) => string | undefined;
    /** The person's explicit Ask tools: sent on every write so a broad approve never overrides them. */
    ask?: readonly string[];
    /** Contract `approve.max_risk_rank` for "Allow for this chat" (default: unset). */
    maxRiskRank?: number;
  };
};

/** The controller methods the controls call. */
export type InteractionController = Pick<WorkflowSessionController, "approve" | "approveWithPolicyChange" | "resume" | "emitEvent"> &
  Partial<Pick<WorkflowSessionController, "approveAllForSession" | "approveKindForSession" | "denyToolForSession" | "denyKindForSession" | "sessionPolicyStatus" | "answerEvent">>;

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
          approveForSessionDescription: "Allow for this chat approves this batch and the enabled tools for the rest of this chat. Unchecked tools stay unavailable; questions still need your answer.",
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
    // Tools of this batch the chat's stored policy denies (gateway mode): the gateway refuses them even if allowed once.
    let refusedByPolicy: string[] = [];
    const policy = options.sessionPolicy;
    if (policy) {
      const approveAllForSession = controller.approveAllForSession;
      const approveKindForSession = controller.approveKindForSession;
      const denyToolForSession = controller.denyToolForSession;
      const denyKindForSession = controller.denyKindForSession;
      const sessionPolicyStatus = controller.sessionPolicyStatus;
      if (
        typeof approveAllForSession !== "function" ||
        typeof approveKindForSession !== "function" ||
        typeof denyToolForSession !== "function" ||
        typeof denyKindForSession !== "function" ||
        typeof sessionPolicyStatus !== "function"
      )
        throw new Error("presentInteraction: sessionPolicy needs a WorkflowSessionController (approveAllForSession, approveKindForSession, denyToolForSession, denyKindForSession, sessionPolicyStatus).");
      const status = sessionPolicyStatus.call(controller);
      const ask = policy.ask ? [...policy.ask] : undefined;
      // Where the grant applies: the gateway's words, exactly as served; never composed here.
      const applies = (stored: SessionToolPolicy | null | undefined, which: "approve" | "deny") => {
        const words = String(stored?.scope?.[which] || "").trim();
        return words ? `Applies: ${words}` : L.noScopeNote;
      };
      const covered = (result: SessionToolPolicy | null) => ({
        outcomeNote: [sessionPolicyClampedText(result?.clamped), applies(result, "approve")].filter(Boolean).join(" "),
      });
      const denied = (result: SessionToolPolicy | null) => ({ outcomeNote: `${L.denyForChatNote} ${applies(result, "deny")}` });
      const notCovered = sessionPolicyClampedText(status.clamped);
      if (status.mode === "unavailable") {
        sessionFields = { scopeNote: L.unavailablePolicyNote(status.reason || "") };
      } else if (status.mode === "gateway") {
        // Toolsets come from the wait's calls (`toolset`) or the host's
        // `GET discovery/tools` rows (`toolsetOf`); an unknown one is never guessed.
        const toolsets = [
          ...new Set(
            calls
              .map((call: any) => String(call?.toolset || "").trim() || String(policy.toolsetOf?.(String(call?.name || "")) || "").trim())
              .filter(Boolean),
          ),
        ] as string[];
        // all/kinds include tools whose destination the model chooses, on purpose (contract §3);
        // only the person's Ask list keeps them asking. Say which.
        const askNames = (ask || []).map((name) => String(name).trim()).filter(Boolean);
        const asking = askNames.length
          ? `Tools set to Ask keep asking: ${askNames.join(", ")}.`
          : "Nothing is set to Ask, so tools that reach destinations the model picks (fetch_url, browser_probe, send_email) are included.";
        const stored = status.policy;
        refusedByPolicy = stored ? names.filter((name) => Object.prototype.hasOwnProperty.call(stored.deny || {}, name)) : [];
        sessionFields = {
          approveForSessionLabel: L.allowForChat,
          // The real button labels, never a "<toolset>" placeholder (release-closing polish).
          approveForSessionDescription: `${[L.allowForChat, ...toolsets.map((kind) => L.allowKindForChat(kind))].map((label) => `“${label}”`).join(" and ")} ${toolsets.length ? "approve this batch and store" : "approves this batch and stores"} a policy for this chat on the gateway: later tool calls of every run of this chat run without asking, until the policy is reset. ${asking} Tools the gateway does not authorize stay uncovered.`,
          onApproveForSession: async () =>
            covered(await approveAllForSession.call(controller, target, { ...(policy.maxRiskRank !== undefined ? { maxRiskRank: policy.maxRiskRank } : {}), ...(ask ? { ask } : {}) })),
          approveKinds: toolsets.map((kind) => ({
            kind,
            label: L.allowKindForChat(kind),
            onApprove: async () => covered(await approveKindForSession.call(controller, target, kind, ask ? { ask } : {})),
          })),
          denyOptions: [
            ...names.map((name) => ({
              key: `tool:${name}`,
              label: L.denyToolForChat(name),
              onDeny: async () => denied(await denyToolForSession.call(controller, target, name, ask ? { ask } : {})),
            })),
            ...toolsets.map((kind) => ({
              key: `kind:${kind}`,
              label: L.denyKindForChat(kind),
              onDeny: async () => denied(await denyKindForSession.call(controller, target, kind, ask ? { ask } : {})),
            })),
          ],
          ...(refusedByPolicy.length
            ? { deniedNote: `Denied by this chat's policy: ${refusedByPolicy.join(", ")}. The gateway refuses ${refusedByPolicy.length === 1 ? "it" : "them"} even if allowed once.` }
            : {}),
          ...(stored
            ? {
                policySummary: `This chat's policy: ${Object.keys(stored.approve || {}).length} tools allowed without asking, ${Object.keys(stored.deny || {}).length} denied. ${applies(stored, "approve")}`,
              }
            : {}),
          ...(notCovered ? { notCovered } : {}),
        };
      } else {
        // No silent hedge: the local grant is labeled with its real scope.
        sessionFields = onAllowForSession
          ? { ...hostChatGrant, scopeNote: L.localChatPolicyNote }
          : {
              // The grant ends with the run: the button says so (ADR 0001 §5).
              approveForSessionLabel: L.allowForRun,
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
        // Sent, but not a success: the chat's policy denies these, and deny wins (contract §4.3).
        return refusedByPolicy.length ? { outcomeNote: `The gateway refuses ${refusedByPolicy.join(", ")}: denied by this chat's policy.` } : undefined;
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
