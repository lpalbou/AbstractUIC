import type { WorkflowInteraction } from "./workflow_interaction.js";

/** Snapshot of the exact decision the user attempted. Kept separate from
 * mutable input state so retry never silently substitutes a newer value. */
export type WorkflowInteractionSubmission =
  | { kind: "choice" | "free-text"; answer: string }
  | { kind: "approve" | "deny" | "approve-all" }
  | { kind: "event"; payload: string };

/** Invoke the host callback for a previously captured interaction decision. */
export function submitWorkflowInteraction(interaction: WorkflowInteraction, submission: WorkflowInteractionSubmission): void | Promise<unknown> {
  if (interaction.kind === "ask-user") {
    if (submission.kind === "choice" || submission.kind === "free-text") return interaction.onSubmit(submission.answer);
    throw new Error("Invalid submission for ask-user interaction");
  }
  if (interaction.kind === "tool-approval") {
    if (submission.kind === "approve") return interaction.onApprove();
    if (submission.kind === "deny") return interaction.onDeny();
    if (submission.kind === "approve-all" && interaction.onApproveAll) return interaction.onApproveAll();
    throw new Error("Invalid submission for tool-approval interaction");
  }
  if (submission.kind === "event") return interaction.onSend(submission.payload);
  throw new Error("Invalid submission for event-wait interaction");
}
