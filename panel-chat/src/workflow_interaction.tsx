import React, { useEffect, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";
import { submitWorkflowInteraction, type WorkflowInteractionSubmission } from "./workflow_interaction_core.js";

/**
 * The ONE wording set for questions and approvals (ADR 0001 §5, backlog 0032).
 * The native AbstractAssistant (Qt approval sheet, iPhone inbox) is the
 * reference for the decision model: deny / allow once / allow for this chat /
 * allow all enabled tools, and a dismissal that defers, never denies. Hosts
 * relabel through props only when the job itself differs.
 */
export const WORKFLOW_INTERACTION_LABELS = {
  deny: "Deny",
  allowOnce: "Allow once",
  allowForChat: "Allow for this chat",
  allowAll: "Allow all enabled tools",
  decideLater: "Decide later",
  submit: "Submit",
  skip: "Continue without answering",
  keepWaiting: "Keep waiting",
  sendEvent: "Send event",
} as const;

/** A value supplied by a user-facing workflow interaction. */
export type WorkflowInteractionChoice = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

/**
 * A host-owned "remember this decision" checkbox (per tool). The host supplies
 * the label because only it knows where the choice is stored ("Always allow
 * write_file in this browser"); the kit never asserts a scope on its own.
 */
export type WorkflowInteractionRemember = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
  /** Rendered as buttons; a click answers with the choice id. */
  choices?: WorkflowInteractionChoice[];
  /** Defaults to true. Set false for a choice-only question. */
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  submitLabel?: string;
  /** The host persists or forwards the answer. */
  onSubmit: (answer: string) => void | Promise<unknown>;
  /** "Continue without answering": the run resumes with an empty answer.
   * Offered only when the host injects it. */
  onSkip?: () => void | Promise<unknown>;
  skipLabel?: string;
  /** "Keep waiting": close/dismiss without answering. The run stays parked;
   * nothing is sent. Offered only when the host injects it. */
  onDefer?: () => void | Promise<unknown>;
  deferLabel?: string;
};

export type WorkflowToolApprovalInteraction = WorkflowInteractionBase & {
  kind: "tool-approval";
  toolName: string;
  /** Human-readable detail, such as a redacted argument summary. */
  detail?: React.ReactNode;
  /** Default "Allow once". */
  approveLabel?: string;
  /** Default "Deny". */
  denyLabel?: string;
  /** "Allow once": this batch only. */
  onApprove: () => void | Promise<unknown>;
  onDeny: () => void | Promise<unknown>;
  /** "Allow for this chat": approves this batch and auto-approves the enabled
   * tools for the rest of this conversation. Offered only when injected. */
  onApproveForSession?: () => void | Promise<unknown>;
  approveForSessionLabel?: string;
  /** Visible scope sentence for the session grant. */
  approveForSessionDescription?: string;
  /** "Allow all enabled tools": the broader standing policy. Host must
   * describe its exact scope visibly (`approveAllDescription`). */
  onApproveAll?: () => void | Promise<unknown>;
  approveAllLabel?: string;
  approveAllDescription?: string;
  /** "Decide later": dismiss without deciding. A dismissal is never a deny:
   * nothing is sent and the run keeps waiting. Offered only when injected. */
  onDefer?: () => void | Promise<unknown>;
  deferLabel?: string;
  /** Per-tool "remember" checkbox, owned and worded by the host. */
  remember?: WorkflowInteractionRemember;
  /** Why the broad grants (for this chat / all enabled tools) cannot be
   * offered for this batch. They render disabled with this reason visible. */
  disabledReason?: string;
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
  /**
   * `"panel"` (default): the full panel under a chat transcript.
   * `"card"`: a compact card for served-state lists (a "Needs you" board, an
   * inbox): same decisions and callbacks, detail folded behind "Review".
   */
  variant?: "panel" | "card";
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

const L = WORKFLOW_INTERACTION_LABELS;

/** Renders a single workflow wait without taking ownership of its transport. */
export function WorkflowInteractionPanel(props: WorkflowInteractionPanelProps): React.ReactElement {
  const interaction = props.interaction;
  const card = props.variant === "card";
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

  // Defer ("Decide later" / "Keep waiting") sends nothing and never settles:
  // the run keeps waiting and the decision stays available until the host
  // hides the panel.
  const defer = async (callback: () => void | Promise<unknown>) => {
    if (Boolean(props.disabled) || inFlightRef.current || settledRef.current) return;
    const requestKey = interactionKey;
    try {
      await callback();
      if (!mountedRef.current || activeKeyRef.current !== requestKey) return;
      setFailure(null);
      setOutcome(interaction.kind === "tool-approval" ? "Left for later. Nothing was sent; the run keeps waiting for this decision." : "Left for later. Nothing was sent; the run keeps waiting for your answer.");
    } catch (error) {
      if (!mountedRef.current || activeKeyRef.current !== requestKey) return;
      setOutcome(`Could not leave this for later: ${errorMessage(error)}`);
      props.onError?.(error);
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

  const title = interaction.title || (interaction.kind === "tool-approval" ? "Tool approval required" : "Input required");
  const deferButton = (onDefer: (() => void | Promise<unknown>) | undefined, label: string) =>
    onDefer ? (
      <button type="button" className="pc-workflow-interaction__defer" data-decision="defer" disabled={disabled} onClick={() => void defer(onDefer)}>
        {label}
      </button>
    ) : null;

  let body: React.ReactNode;
  if (interaction.kind === "ask-user") {
    body = (
      <div className="pc-workflow-interaction__body">
        <div className="pc-workflow-interaction__prompt">{interaction.prompt}</div>
        {interaction.choices?.length ? (
          <div className="pc-workflow-interaction__choices" aria-label="Choices">
            {interaction.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="pc-workflow-interaction__choice"
                data-decision="choice"
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
              rows={card ? 1 : 2}
              disabled={disabled}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                event.preventDefault();
                if (freeText.trim()) void run({ kind: "free-text", answer: freeText }, () => interaction.onSubmit(freeText));
              }}
            />
            <button type="button" className="pc-btn" data-decision="submit" disabled={disabled || !freeText.trim()} onClick={() => void run({ kind: "free-text", answer: freeText }, () => interaction.onSubmit(freeText))}>
              {pending?.kind === "free-text" ? "Sending…" : interaction.submitLabel || L.submit}
            </button>
          </div>
        ) : null}
        {interaction.onSkip || interaction.onDefer ? (
          <div className="pc-workflow-interaction__buttons pc-workflow-interaction__buttons--secondary">
            {deferButton(interaction.onDefer, interaction.deferLabel || L.keepWaiting)}
            {interaction.onSkip ? (
              <button type="button" className="pc-workflow-interaction__skip" data-decision="skip" disabled={disabled} onClick={() => void run({ kind: "skip" }, interaction.onSkip!)}>
                {pending?.kind === "skip" ? "Continuing…" : interaction.skipLabel || L.skip}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  } else if (interaction.kind === "tool-approval") {
    const reason = String(interaction.disabledReason || "").trim();
    const broadDisabled = disabled || Boolean(reason);
    body = (
      <div className="pc-workflow-interaction__body">
        <div className="pc-workflow-interaction__prompt">Allow <strong>{interaction.toolName}</strong> to run?</div>
        {interaction.detail ? (
          card ? (
            <details className="pc-workflow-interaction__review">
              <summary>Review</summary>
              <div className="pc-workflow-interaction__detail">{interaction.detail}</div>
            </details>
          ) : (
            <div className="pc-workflow-interaction__detail">{interaction.detail}</div>
          )
        ) : null}
        <div className="pc-workflow-interaction__buttons">
          {deferButton(interaction.onDefer, interaction.deferLabel || L.decideLater)}
          <button type="button" className="pc-workflow-interaction__deny" data-decision="deny" disabled={disabled} onClick={() => void run({ kind: "deny" }, interaction.onDeny)}>
            {pending?.kind === "deny" ? "Denying…" : interaction.denyLabel || L.deny}
          </button>
          <button type="button" className="pc-btn" data-decision="approve" disabled={disabled} onClick={() => void run({ kind: "approve" }, interaction.onApprove)}>
            {pending?.kind === "approve" ? "Allowing…" : interaction.approveLabel || L.allowOnce}
          </button>
          {interaction.onApproveForSession ? (
            <button type="button" className="pc-workflow-interaction__allow-session" data-decision="approve-session" disabled={broadDisabled} title={reason || undefined} onClick={() => void run({ kind: "approve-session" }, interaction.onApproveForSession!)}>
              {pending?.kind === "approve-session" ? "Allowing…" : interaction.approveForSessionLabel || L.allowForChat}
            </button>
          ) : null}
          {interaction.onApproveAll ? (
            <button type="button" className="pc-workflow-interaction__allow-all" data-decision="approve-all" disabled={broadDisabled} title={reason || undefined} onClick={() => void run({ kind: "approve-all" }, interaction.onApproveAll!)}>
              {pending?.kind === "approve-all" ? "Allowing…" : interaction.approveAllLabel || L.allowAll}
            </button>
          ) : null}
        </div>
        {interaction.remember ? (
          <label className="pc-workflow-interaction__remember">
            <input type="checkbox" checked={interaction.remember.checked} disabled={disabled} onChange={(event) => interaction.remember!.onChange(event.target.checked)} />
            <span>{interaction.remember.label}</span>
          </label>
        ) : null}
        {reason && (interaction.onApproveAll || interaction.onApproveForSession) ? <p className="pc-workflow-interaction__unavailable" role="note">{reason}</p> : null}
        {!reason && interaction.onApproveForSession && interaction.approveForSessionDescription ? <p className="pc-workflow-interaction__scope">{interaction.approveForSessionDescription}</p> : null}
        {!reason && interaction.onApproveAll && interaction.approveAllDescription ? <p className="pc-workflow-interaction__scope">{interaction.approveAllDescription}</p> : null}
      </div>
    );
  } else {
    body = (
      <div className="pc-workflow-interaction__body">
        <div className="pc-workflow-interaction__prompt">{interaction.prompt}</div>
        <label className="pc-workflow-interaction__entry">
          <span>{interaction.payloadLabel || (interaction.eventName ? `Payload for ${interaction.eventName}` : "Event payload")}</span>
          <textarea
            key={`${interactionKey}:payload`}
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder={interaction.payloadPlaceholder || "Enter payload"}
            rows={card ? 1 : 2}
            aria-label={interaction.payloadLabel || (interaction.eventName ? `Payload for ${interaction.eventName}` : "Event payload")}
            disabled={disabled}
          />
        </label>
        <div className="pc-workflow-interaction__buttons">
          <button type="button" className="pc-btn" data-decision="send-event" disabled={disabled} onClick={() => void run({ kind: "event", payload }, () => interaction.onSend(payload))}>
            {pending?.kind === "event" ? "Sending…" : interaction.sendLabel || L.sendEvent}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={["pc-workflow-interaction", card ? "pc-workflow-interaction--card" : ""].filter(Boolean).join(" ")}
      data-variant={card ? "card" : "panel"}
      aria-labelledby={`pc-workflow-interaction-${interactionKey}`}
    >
      <div className="pc-workflow-interaction__heading">
        <Icon name={interaction.kind === "tool-approval" ? "warning" : interaction.kind === "event-wait" ? "history" : "info"} size={card ? 14 : 16} />
        <div>
          <h3 tabIndex={-1} id={`pc-workflow-interaction-${interactionKey}`}>{title}</h3>
          {interaction.description && !card ? <div className="pc-workflow-interaction__description">{interaction.description}</div> : null}
        </div>
      </div>
      {body}
      {failure ? <ActionError message={failure.message} onRetry={retry} disabled={disabled} /> : null}
      <div className="pc-workflow-interaction__outcome" aria-live="polite">{outcome}</div>
    </section>
  );
}

export default WorkflowInteractionPanel;
