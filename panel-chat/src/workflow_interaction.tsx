import React, { useEffect, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";
import { submitWorkflowInteraction, type WorkflowInteractionSubmission } from "./workflow_interaction_core.js";

/** A value supplied by a user-facing workflow interaction. */
export type WorkflowInteractionChoice = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type WorkflowInteractionBase = {
  /** Stable identifier from the host's workflow state. */
  id: string;
  /** Short label shown above the interaction. */
  title?: string;
  /** Supporting context; never interpreted as transport data by this package. */
  description?: React.ReactNode;
};

export type WorkflowAskUserInteraction = WorkflowInteractionBase & {
  kind: "ask-user";
  prompt: React.ReactNode;
  choices?: WorkflowInteractionChoice[];
  /** Defaults to true. Set false for a choice-only question. */
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  submitLabel?: string;
  /** The host persists or forwards the answer. */
  onSubmit: (answer: string) => void | Promise<unknown>;
};

export type WorkflowToolApprovalInteraction = WorkflowInteractionBase & {
  kind: "tool-approval";
  toolName: string;
  /** Human-readable detail, such as a redacted argument summary. */
  detail?: React.ReactNode;
  approveLabel?: string;
  denyLabel?: string;
  onApprove: () => void | Promise<unknown>;
  onDeny: () => void | Promise<unknown>;
  /** Optional broader consent. Host must describe its exact scope visibly. */
  onApproveAll?: () => void | Promise<unknown>;
  approveAllLabel?: string;
  approveAllDescription?: string;
};

export type WorkflowEventWaitInteraction = WorkflowInteractionBase & {
  kind: "event-wait";
  eventName?: string;
  prompt: React.ReactNode;
  payloadLabel?: string;
  payloadPlaceholder?: string;
  initialPayload?: string;
  sendLabel?: string;
  /** The host decides how this payload resumes the waiting workflow. */
  onSend: (payload: string) => void | Promise<unknown>;
};

/**
 * A presentation-only workflow pause. The host owns routing, persistence,
 * and resume protocols; this union only describes the user decision to show.
 */
export type WorkflowInteraction = WorkflowAskUserInteraction | WorkflowToolApprovalInteraction | WorkflowEventWaitInteraction;

export type WorkflowInteractionPanelProps = {
  interaction: WorkflowInteraction;
  disabled?: boolean;
  onError?: (error: unknown) => void;
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.trim() || "Unknown error";
}

function ActionError(props: { message: string; onRetry: () => void; disabled: boolean }): React.ReactElement {
  return (
    <div className="pc-workflow-interaction__error" role="alert">
      <span>Could not complete that action: {props.message}</span>
      <button type="button" className="pc-workflow-interaction__retry" onClick={props.onRetry} disabled={props.disabled}>
        Try again
      </button>
    </div>
  );
}

/** Renders a single workflow wait without taking ownership of its transport. */
export function WorkflowInteractionPanel(props: WorkflowInteractionPanelProps): React.ReactElement {
  const interaction = props.interaction;
  const [freeText, setFreeText] = useState("");
  const [payload, setPayload] = useState(() => (interaction.kind === "event-wait" ? interaction.initialPayload || "" : ""));
  const [pending, setPending] = useState<WorkflowInteractionSubmission | null>(null);
  const [settled, setSettled] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [failure, setFailure] = useState<{ submission: WorkflowInteractionSubmission; message: string } | null>(null);
  const interactionKey = `${interaction.kind}:${interaction.id}`;
  const activeKeyRef = useRef(interactionKey);
  const inFlightRef = useRef(false);
  const settledRef = useRef(false);
  const mountedRef = useRef(true);
  const sequenceRef = useRef(0);

  // Reset refs in render, not only an effect: two clicks in the same browser
  // turn must never slip through while React is batching the next paint.
  if (activeKeyRef.current !== interactionKey) {
    activeKeyRef.current = interactionKey;
    inFlightRef.current = false;
    settledRef.current = false;
    sequenceRef.current += 1;
  }
  const disabled = Boolean(props.disabled) || pending !== null || settled || inFlightRef.current || settledRef.current;

  const run = async (submission: WorkflowInteractionSubmission, callback: () => void | Promise<unknown>) => {
    if (Boolean(props.disabled) || inFlightRef.current || settledRef.current) return;
    const requestKey = interactionKey;
    const sequence = ++sequenceRef.current;
    inFlightRef.current = true;
    setFailure(null);
    setOutcome("");
    setPending(submission);
    try {
      await callback();
      if (!mountedRef.current || activeKeyRef.current !== requestKey || sequenceRef.current !== sequence) return;
      // The host is responsible for removing/replacing the wait. Until it
      // does, a locally accepted action cannot be submitted a second time.
      settledRef.current = true;
      setSettled(true);
      setOutcome("Response sent. Waiting for the workflow to continue.");
    } catch (error) {
      if (!mountedRef.current || activeKeyRef.current !== requestKey || sequenceRef.current !== sequence) return;
      setFailure({ submission, message: errorMessage(error) });
      setOutcome("The action failed. You can try again.");
      props.onError?.(error);
    } finally {
      if (!mountedRef.current || activeKeyRef.current !== requestKey || sequenceRef.current !== sequence) return;
      inFlightRef.current = false;
      setPending(null);
    }
  };

  // A new wait must not inherit an answer typed for the previous one.
  useEffect(() => {
    setFreeText("");
    setPayload(interaction.kind === "event-wait" ? interaction.initialPayload || "" : "");
    setFailure(null);
    setPending(null);
    setSettled(false);
    setOutcome("");
  }, [interactionKey]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sequenceRef.current += 1;
      inFlightRef.current = false;
    };
  }, []);

  const retry = () => {
    if (!failure) return;
    void run(failure.submission, () => submitWorkflowInteraction(interaction, failure.submission));
  };

  return (
    <section className="pc-workflow-interaction" aria-labelledby={`pc-workflow-interaction-${interactionKey}`}>
      <div className="pc-workflow-interaction__heading">
        <Icon name={interaction.kind === "tool-approval" ? "warning" : interaction.kind === "event-wait" ? "history" : "info"} size={16} />
        <div>
          <h3 tabIndex={-1} id={`pc-workflow-interaction-${interactionKey}`}>{interaction.title || (interaction.kind === "tool-approval" ? "Tool approval required" : "Input required")}</h3>
          {interaction.description ? <div className="pc-workflow-interaction__description">{interaction.description}</div> : null}
        </div>
      </div>

      {interaction.kind === "ask-user" ? (
        <div className="pc-workflow-interaction__body">
          <div className="pc-workflow-interaction__prompt">{interaction.prompt}</div>
          {interaction.choices?.length ? (
            <div className="pc-workflow-interaction__choices" aria-label="Choices">
              {interaction.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="pc-workflow-interaction__choice"
                  disabled={disabled || choice.disabled}
                  onClick={() => void run({ kind: "choice", answer: choice.id }, () => interaction.onSubmit(choice.id))}
                >
                  <span>{choice.label}</span>
                  {choice.description ? <small>{choice.description}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
          {interaction.allowFreeText !== false ? (
            <div className="pc-workflow-interaction__entry">
              <textarea
                key={`${interactionKey}:text`}
                aria-label="Response"
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                placeholder={interaction.freeTextPlaceholder || "Type a response"}
                rows={2}
                disabled={disabled}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  if (freeText.trim()) void run({ kind: "free-text", answer: freeText }, () => interaction.onSubmit(freeText));
                }}
              />
              <button type="button" className="pc-btn" disabled={disabled || !freeText.trim()} onClick={() => void run({ kind: "free-text", answer: freeText }, () => interaction.onSubmit(freeText))}>
                {pending?.kind === "free-text" ? "Sending…" : interaction.submitLabel || "Submit"}
              </button>
            </div>
          ) : null}
        </div>
      ) : interaction.kind === "tool-approval" ? (
        <div className="pc-workflow-interaction__body">
          <div className="pc-workflow-interaction__prompt">Allow <strong>{interaction.toolName}</strong> to run?</div>
          {interaction.detail ? <div className="pc-workflow-interaction__detail">{interaction.detail}</div> : null}
          <div className="pc-workflow-interaction__buttons">
            <button type="button" className="pc-workflow-interaction__deny" disabled={disabled} onClick={() => void run({ kind: "deny" }, interaction.onDeny)}>
              {pending?.kind === "deny" ? "Denying…" : interaction.denyLabel || "Deny"}
            </button>
            <button type="button" className="pc-btn" disabled={disabled} onClick={() => void run({ kind: "approve" }, interaction.onApprove)}>
              {pending?.kind === "approve" ? "Approving…" : interaction.approveLabel || "Approve"}
            </button>
            {interaction.onApproveAll ? <button type="button" className="pc-workflow-interaction__allow-all" disabled={disabled} onClick={() => void run({ kind: "approve-all" }, interaction.onApproveAll!)}>{pending?.kind === "approve-all" ? "Approving…" : interaction.approveAllLabel || "Allow all"}</button> : null}
          </div>
          {interaction.onApproveAll && interaction.approveAllDescription ? <p className="pc-workflow-interaction__scope">{interaction.approveAllDescription}</p> : null}
        </div>
      ) : (
        <div className="pc-workflow-interaction__body">
          <div className="pc-workflow-interaction__prompt">{interaction.prompt}</div>
          <label className="pc-workflow-interaction__entry">
            <span>{interaction.payloadLabel || (interaction.eventName ? `Payload for ${interaction.eventName}` : "Event payload")}</span>
            <textarea
              key={`${interactionKey}:payload`}
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              placeholder={interaction.payloadPlaceholder || "Enter payload"}
              rows={2}
              aria-label={interaction.payloadLabel || (interaction.eventName ? `Payload for ${interaction.eventName}` : "Event payload")}
              disabled={disabled}
            />
          </label>
          <div className="pc-workflow-interaction__buttons">
            <button type="button" className="pc-btn" disabled={disabled} onClick={() => void run({ kind: "event", payload }, () => interaction.onSend(payload))}>
              {pending?.kind === "event" ? "Sending…" : interaction.sendLabel || "Send event"}
            </button>
          </div>
        </div>
      )}
      {failure ? <ActionError message={failure.message} onRetry={retry} disabled={disabled} /> : null}
      <div className="pc-workflow-interaction__outcome" aria-live="polite">{outcome}</div>
    </section>
  );
}

export default WorkflowInteractionPanel;
