import React, { useEffect, useRef, useState } from "react";

import { Icon } from "@abstractframework/ui-kit";
import { submitWorkflowInteraction, type WorkflowInteractionSubmission } from "./workflow_interaction_core.js";
import type { PublicApprovalRequest } from "./public_approval.js";

/**
 * The ONE wording set for questions and approvals (ADR 0001 §5, backlog 0032).
 * A tool approval offers exactly three decisions (operator ruling 2026-11-07:
 * "Deny, Allow (this tool), Allow All (ALL tools). but the scope is ONLY FOR THIS
 * SESSION"): Deny refuses this request; Allow allows the requested tool for the rest
 * of this session; Allow All allows every tool for the rest of this session. None of
 * them changes the app's default tool settings. A dismissal ("Decide later") defers,
 * never denies. Hosts relabel through props only when the job itself differs.
 */
export const WORKFLOW_INTERACTION_LABELS = {
  deny: "Deny",
  allow: "Allow",
  allowAll: "Allow All",
  /** Tooltips of the two allow buttons: what each one reaches. */
  allowTitle: (tools: string) => `Allow ${tools} for the rest of this session`,
  allowAllTitle: "Allow every tool for the rest of this session",
  /** No session grant here (the host did not ask for one, or the gateway cannot keep it). */
  allowThisRequestNote: "Allow covers this request only.",
  noSessionGrantNote: "This gateway cannot keep a choice for the session, so Allow covers this request only.",
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
  /** Ordinary action/targets and an explicitly batch-bound public explanation. */
  publicRequest?: PublicApprovalRequest;
  /** Human-readable detail, such as a redacted argument summary. */
  detail?: React.ReactNode;
  /** Default "Allow". */
  approveLabel?: string;
  /** Tooltip of Allow (what it reaches). */
  approveTitle?: string;
  /** Default "Deny". */
  denyLabel?: string;
  /** "Allow": the requested tool(s), for the rest of this session when the host keeps a
   * session grant (`presentInteraction` with `sessionPolicy`), else this request only. */
  onApprove: () => void | Promise<unknown>;
  /** "Deny": refuses this request. */
  onDeny: () => void | Promise<unknown>;
  /** "Allow All": every tool, for the rest of this session. Offered only when injected. */
  onApproveAll?: () => void | Promise<unknown>;
  approveAllLabel?: string;
  /** Tooltip of Allow All (what it reaches). */
  approveAllTitle?: string;
  /** "Decide later": dismiss without deciding. A dismissal is never a deny:
   * nothing is sent and the run keeps waiting. Offered only when injected. */
  onDefer?: () => void | Promise<unknown>;
  deferLabel?: string;
  /** One short line under the decisions, only when Allow cannot reach the session
   * (e.g. `WORKFLOW_INTERACTION_LABELS.noSessionGrantNote`). */
  scopeNote?: string;
  /** Tools of this batch the session's stored policy denies: the gateway refuses them even if allowed. */
  deniedNote?: string;
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
   * `"conversation"`: public action/targets/purpose with labeled decision icons;
   * technical arguments and standing policy choices stay in the host's detailed view.
   */
  variant?: "panel" | "card" | "conversation";
  /** Switch the host to its existing technical view; this never submits a decision. */
  onReviewTechnical?: () => void;
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
  const conversation = props.variant === "conversation";
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
      const result = await callback();
      if (!mountedRef.current || activeKeyRef.current !== requestKey || sequenceRef.current !== sequence) return;
      // The host is responsible for removing/replacing the wait. Until it
      // does, a locally accepted action cannot be submitted a second time.
      settledRef.current = true;
      setSettled(true);
      // A callback may report what its decision did not cover (a session
      // policy's `clamped` names): shown, never dropped.
      const note = result && typeof result === "object" && typeof (result as { outcomeNote?: unknown }).outcomeNote === "string" ? String((result as { outcomeNote: string }).outcomeNote) : "";
      setOutcome(conversation ? `Your choice was sent. I’m waiting for work to continue.${note ? " Some actions may still be blocked by your saved permissions; review the details if needed." : ""}` : `Response sent. Waiting for the workflow to continue.${note ? ` ${note}` : ""}`);
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

  const title = conversation && interaction.kind === "tool-approval" ? interaction.publicRequest?.question || "May I take this next step?" : interaction.title || (interaction.kind === "tool-approval" ? "Tool approval required" : "Input required");
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
  } else if (interaction.kind === "tool-approval" && conversation) {
    const request = interaction.publicRequest;
    const needsReview = !request || request.reviewRequired;
    body = <div className="pc-workflow-interaction__body pc-public-approval">
      <div className="pc-public-approval__context" key={interactionKey}>
      <div className="pc-public-approval__reason">
        <p className="pc-public-approval__reason-label">Why I’m asking</p>
        <p>{request?.explanation?.text || "The reason for this request isn’t available here."}</p>
      </div>
      {request?.actions.length ? <ul className="pc-public-approval__targets" aria-label="What this will do" data-uniform={request.actions.every((a) => a.kind === request.actions[0].kind) && !["write", "edit", "unknown"].includes(request.actions[0].kind) || undefined}>
        {request.actions.map((action, index) => <li key={index}>
          <Icon name={action.kind === "page" || action.kind === "search" ? "book" : action.kind === "write" || action.kind === "edit" ? "edit" : action.kind === "folder" ? "folder" : action.kind === "unknown" ? "info" : "file"} size={20} />
          <span><span className="pc-public-approval__action">{action.label}</span>{action.target ? <span className="pc-public-approval__target">{action.target}</span> : null}</span>
        </li>)}
      </ul> : null}
      {needsReview ? <p className="pc-public-approval__note">I can’t describe this request clearly here. Review the details before allowing it.</p> : null}
      </div>
      <div className="pc-workflow-interaction__buttons pc-public-approval__buttons">
        {deferButton(interaction.onDefer, interaction.deferLabel || L.decideLater)}
        <button type="button" className="pc-workflow-interaction__deny" data-decision="deny" disabled={disabled} onClick={() => void run({ kind: "deny" }, interaction.onDeny)}><Icon name="x" size={18} />{pending?.kind === "deny" ? "Declining…" : interaction.denyLabel || L.deny}</button>
        {!needsReview ? <button type="button" className="pc-btn" data-decision="approve" disabled={disabled} title={interaction.approveTitle} onClick={() => void run({ kind: "approve" }, interaction.onApprove)}><Icon name="check" size={18} />{pending?.kind === "approve" ? "Allowing…" : interaction.approveLabel || L.allow}</button> : null}
        {!needsReview && interaction.onApproveAll ? <button type="button" className="pc-workflow-interaction__allow-all" data-decision="approve-all" disabled={disabled} title={interaction.approveAllTitle} onClick={() => void run({ kind: "approve-all" }, interaction.onApproveAll!)}><Icon name="wrench" size={18} />{pending?.kind === "approve-all" ? "Allowing…" : interaction.approveAllLabel || L.allowAll}</button> : null}
        {props.onReviewTechnical ? <button type="button" className="pc-public-approval__review" disabled={disabled} onClick={props.onReviewTechnical}><Icon name="list" size={18} />Review details</button> : null}
      </div>
      {needsReview && !props.onReviewTechnical ? <p className="pc-public-approval__note">Switch to the conversation’s detailed view to review this request.</p> : null}
      {interaction.scopeNote ? <p className="pc-public-approval__note" role="note">{interaction.scopeNote}</p> : null}
      {interaction.deniedNote ? <p className="pc-public-approval__note" role="note">Some of these actions are blocked by this session’s permissions. Allow cannot override that choice. Review details to see what is blocked.</p> : null}
    </div>;
  } else if (interaction.kind === "tool-approval") {
    // Exactly three decisions (operator ruling 2026-11-07): Deny, Allow (this tool), Allow All
    // (every tool), the two allows for the rest of this session. No other grant, no scope prose.
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
          <button type="button" className="pc-btn" data-decision="approve" disabled={disabled} title={interaction.approveTitle} onClick={() => void run({ kind: "approve" }, interaction.onApprove)}>
            {pending?.kind === "approve" ? "Allowing…" : interaction.approveLabel || L.allow}
          </button>
          {interaction.onApproveAll ? (
            <button type="button" className="pc-workflow-interaction__allow-all" data-decision="approve-all" disabled={disabled} title={interaction.approveAllTitle} onClick={() => void run({ kind: "approve-all" }, interaction.onApproveAll!)}>
              {pending?.kind === "approve-all" ? "Allowing…" : interaction.approveAllLabel || L.allowAll}
            </button>
          ) : null}
        </div>
        {interaction.scopeNote ? (
          <p className="pc-workflow-interaction__scope-note" role="note" data-scope-note="">
            {interaction.scopeNote}
          </p>
        ) : null}
        {interaction.deniedNote ? (
          <p className="pc-workflow-interaction__unavailable" role="note" data-denied-note="">
            {interaction.deniedNote}
          </p>
        ) : null}
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
      className={["pc-workflow-interaction", card ? "pc-workflow-interaction--card" : "", conversation ? "pc-workflow-interaction--conversation" : ""].filter(Boolean).join(" ")}
      data-variant={props.variant || "panel"}
      aria-labelledby={`pc-workflow-interaction-${interactionKey}`}
    >
      <div className="pc-workflow-interaction__heading">
        <Icon name={interaction.kind === "tool-approval" ? conversation ? "lock" : "warning" : interaction.kind === "event-wait" ? "history" : "info"} size={card ? 14 : 16} />
        <div>
          <h3 className={conversation && interaction.kind === "tool-approval" ? "pc-workflow-interaction__prompt" : undefined} tabIndex={-1} id={`pc-workflow-interaction-${interactionKey}`}>{title}</h3>
          {interaction.description && !(conversation && interaction.kind === "tool-approval") ? <div className="pc-workflow-interaction__description">{interaction.description}</div> : null}
        </div>
      </div>
      {body}
      {failure ? <ActionError message={conversation ? "Your choice could not be sent." : failure.message} onRetry={retry} disabled={disabled} /> : null}
      <div className="pc-workflow-interaction__outcome" aria-live="polite">{outcome}</div>
    </section>
  );
}

export default WorkflowInteractionPanel;
