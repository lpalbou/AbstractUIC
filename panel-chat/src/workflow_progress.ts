import type {
  WorkflowSessionSnapshot,
  WorkflowRecord,
} from "./workflow_runtime.js";
import { workflowEvidence } from "./workflow_evidence.js";

const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export type WorkflowProgress = {
  label: string;
  detail: string;
  tone: "working" | "waiting" | "success" | "error" | "neutral";
  startedAt?: string;
  toolCalls: number;
  totalTokens?: number;
};

/** Presentation from evidence, never a replacement for authoritative run state. */
export function workflowProgress(
  snapshot: Pick<
    WorkflowSessionSnapshot,
    | "status"
    | "loading"
    | "connection"
    | "error"
    | "interaction"
    | "records"
    | "run"
    | "displayStatus"
  > &
    Partial<Pick<WorkflowSessionSnapshot, "toolApprovalGranted">>,
): WorkflowProgress {
  const { tools, statistics } = workflowEvidence(snapshot.records);
  const base = {
    toolCalls: statistics.toolCalls,
    totalTokens: statistics.totalTokens,
    startedAt: String(snapshot.run?.created_at || "") || undefined,
  };
  const result = (
    label: string,
    detail: string,
    tone: WorkflowProgress["tone"],
  ): WorkflowProgress => ({ ...base, label, detail, tone });
  if (snapshot.loading)
    return result(
      "Loading conversation",
      "Restoring saved activity",
      "neutral",
    );
  if (["completed", "failed", "cancelled"].includes(snapshot.status))
    return result(
      snapshot.status === "completed"
        ? "Completed"
        : snapshot.status === "failed"
          ? "Run failed"
          : "Stopped",
      "",
      snapshot.status === "failed"
        ? "error"
        : snapshot.status === "completed"
          ? "success"
          : "neutral",
    );
  // A dropped LEDGER STREAM is not a dropped gateway. `watch()` keeps polling
  // `catchUp()`/`getRun()` over REST after the stream gives up, so the run
  // really is progressing and the answer really does arrive — announcing
  // "Disconnected" over a working run reads as "the app is offline" and was
  // the most confusing thing on the screen. Say what is actually degraded,
  // and only claim disconnection when nothing is arriving at all: the run has
  // stopped advancing (no records) or the transport reported an error.
  if (
    snapshot.connection === "reconnecting" ||
    snapshot.connection === "disconnected"
  ) {
    const stalled = !snapshot.records?.length || Boolean(snapshot.error);
    if (stalled)
      return result(
        snapshot.connection === "reconnecting" ? "Reconnecting" : "Disconnected",
        String(snapshot.error || "Live activity is unavailable"),
        "waiting",
      );
    // Degraded, not down: fall through to the run's real state (Working,
    // Approval needed, …) so the strip keeps describing the RUN.
  }
  if (snapshot.status === "paused" || snapshot.run?.paused === true)
    return result("Paused", "Resume when you’re ready", "waiting");
  const wait = object(snapshot.interaction?.wait),
    details = object(wait.details);
  const toolApproval =
    details.kind === "tool_approval" || details.mode === "approval_required";
  // A batch this client already granted (standing permission or an accepted
  // Allow) is running work: never "Approval needed" while it executes.
  const granted = toolApproval && snapshot.toolApprovalGranted === true;
  if (toolApproval && !granted)
    return result(
      "Approval needed",
      "Review the tool requests below",
      "waiting",
    );
  // A tool approval's wait reason is "user" too; it is never a question.
  if (!toolApproval && ["user", "ask_user"].includes(wait.reason))
    return result(
      "Your answer is needed",
      String(wait.prompt || "The workflow has a question for you"),
      "waiting",
    );
  if (
    !toolApproval &&
    (wait.reason === "event" || String(wait.wait_key || "").startsWith("evt:"))
  )
    return result(
      "Waiting for an event",
      String(wait.prompt || "Listening for the workflow’s trigger"),
      "waiting",
    );
  const running = tools.filter(
    (tool) =>
      tool.status === "running" ||
      (granted &&
        tool.status === "waiting" &&
        tool.runId === snapshot.interaction?.runId),
  );
  // (The waiting record itself carries the calls, so a granted batch's tools
  // are in `records` as waiting; once they complete, fall through to the
  // normal Working/Thinking wording until the ledger resume clears the wait.)
  if (running.length)
    return result(
      running.length === 1
        ? "Running a tool"
        : `Running ${running.length} tools`,
      [...new Set(running.map((tool) => tool.name))].join(" · "),
      "working",
    );
  // Fold per-step identity so a replayed STARTED row cannot supersede completion.
  const steps = new Map<string, WorkflowRecord>();
  for (const entry of snapshot.records) {
    const key = `${entry.runId}:${entry.record.step_id || entry.record.idempotency_key || entry.cursor}`;
    const previous = steps.get(key);
    if (
      previous &&
      ["completed", "failed"].includes(String(previous.record.status))
    )
      continue;
    steps.set(key, entry);
  }
  const llm = [...steps.values()]
    .reverse()
    .find(
      (entry) =>
        object(entry.record.effect).type === "llm_call" &&
        ["started", "running"].includes(String(entry.record.status)),
    );
  if (llm) return result("Thinking", "Generating the next response", "working");
  // Status events are advisory. Lifecycle words from helpers are not root-run truth.
  const custom = snapshot.displayStatus.trim();
  const meaningful =
    !/^(completed|complete|done|finished|ready|success|succeeded|failed|running|working|waiting|thinking|idle|paused|stopped|cancelled)$/i.test(
      custom,
    ) && !custom.startsWith("{")
      ? custom
      : "";
  const last = tools[tools.length - 1];
  return result(
    snapshot.status === "idle" ? "Ready" : "Working",
    meaningful ||
      (last
        ? `Last tool: ${last.name} · ${last.status === "failed" ? "failed" : last.status === "completed" ? "done" : "waiting"}`
        : "Following the workflow"),
    snapshot.status === "idle" ? "neutral" : "working",
  );
}
