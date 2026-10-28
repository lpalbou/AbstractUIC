/**
 * `replay_view_v1` -> what the chat renders: the transcript (`ChatMessage[]`), the tool rows,
 * the pending interaction, the status. Pure: no fetch, no state. `WorkflowSessionController`
 * uses it when the gateway serves the replay view; hosts that hold a view themselves can call
 * it directly.
 *
 * Mapping (panel-chat README "Messages from the replay view"):
 * - `messages[]` -> `ChatMessage` (`id`, `runId`, `kind`, `artifactIds`; `ts` = the item's time).
 *   A `final` that `repeats` an earlier answer is shown once (the answer carries the turn's
 *   statistics). The open question's own message is not repeated above its card.
 * - `activities[]` of kind `tool` -> one tool row per call (`ToolActivityGroup`), statuses as
 *   served (`denied` shows as a failed call with its reason); kind `tool_policy` -> the
 *   "Tool policy" line. Other kinds (llm, subworkflow, timer, answer, event_wait) are not
 *   transcript items.
 * - `interaction` -> a `WorkflowWaitInteraction` carrying the view's `command` (answering goes
 *   through `POST commands` with it).
 */
import type { ChatMessage } from "./chat_message_card.js";
import type { WorkflowStatistics, WorkflowToolActivity } from "./workflow_evidence.js";
import type { WorkflowWaitInteraction } from "./workflow_runtime.js";
import { toolPolicyDecisionText, type WorkflowToolPolicyProvenance } from "./tool_policy.js";
import { compareReplayOrder, type ReplayView, type ReplayViewActivity, type ReplayViewInteraction, type ReplayViewMessage, type ReplayViewToolCall } from "./replay_view.js";

type Row = Record<string, unknown>;
const str = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const obj = (value: unknown): Row | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null);
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const FILE_TOOLS = new Set(["write_file", "create_file", "save_file", "edit_file", "update_file", "replace_in_file", "delete_file", "remove_file", "move_file", "rename_file", "copy_file"]);

/**
 * The served interaction as a raw runtime wait (same control, same target). `command` and
 * `kind` ride along: an `event` interaction is answered with its resume command, never by
 * re-deriving an event route.
 */
export function replayInteractionWait(interaction: ReplayViewInteraction): WorkflowWaitInteraction {
  const details: Record<string, unknown> = { ...(interaction.details || {}) };
  if (interaction.kind === "tool_approval") {
    details.kind = "tool_approval";
    details.tool_calls = Array.isArray(interaction.tool_calls) ? interaction.tool_calls : [];
  }
  const reason = interaction.kind === "ask_user" ? "user" : interaction.kind === "event" ? "event" : "tool_approval";
  const wait: Record<string, unknown> = { wait_key: interaction.wait_key, reason, details };
  if (interaction.prompt != null) wait.prompt = interaction.prompt;
  if (Array.isArray(interaction.choices)) wait.choices = interaction.choices;
  if (typeof interaction.allow_free_text === "boolean") wait.allow_free_text = interaction.allow_free_text;
  return {
    runId: interaction.run_id,
    wait,
    ...(interaction.step_id ? { stepId: interaction.step_id } : {}),
    kind: interaction.kind,
    ...(interaction.command ? { command: interaction.command } : {}),
  };
}

function toolStatus(call: ReplayViewToolCall, activity: ReplayViewActivity): WorkflowToolActivity["status"] {
  const s = str(call.status || activity.status).toLowerCase();
  if (s === "completed") return "completed";
  if (s === "waiting") return "waiting";
  if (s === "running" || s === "started" || s === "pending") return "running";
  return "failed"; // failed, denied, cancelled, partly_denied
}

function callPolicy(call: ReplayViewToolCall): WorkflowToolPolicyProvenance | undefined {
  const decision = obj(call.policy_decision);
  const kind = str(decision?.decision);
  if (kind !== "auto_approved" && kind !== "denied") return undefined;
  const setBy = obj(decision?.set_by);
  const who = str(setBy?.user_id) || str(setBy?.client);
  return {
    decision: kind,
    ...(str(call.decided_by) ? { source: str(call.decided_by) } : {}),
    ...(str(call.matched) ? { matched: str(call.matched) } : {}),
    ...(typeof decision?.revision === "number" ? { revision: decision.revision as number } : {}),
    ...(who ? { setBy: who } : {}),
    ...(str(decision?.set_at) ? { setAt: str(decision?.set_at) } : {}),
  };
}

function errorText(call: ReplayViewToolCall, status: string): string | undefined {
  if (typeof call.error === "string" && call.error.trim()) return call.error.trim();
  const e = obj(call.error);
  if (e) return str(e.message) || str(e.detail) || JSON.stringify(e);
  if (status === "denied") return "Denied";
  if (status === "cancelled") return "Cancelled";
  return undefined;
}

/** One tool row per call of a `tool` activity. */
export function replayToolActivities(activity: ReplayViewActivity): WorkflowToolActivity[] {
  const calls = Array.isArray(activity.tool_calls) ? activity.tool_calls : [];
  return calls.map((call, index) => {
    const status = toolStatus(call, activity);
    const served = str(call.status || activity.status).toLowerCase();
    const policy = callPolicy(call);
    const error = status === "failed" ? errorText(call, served) : undefined;
    return {
      id: `${activity.id}:${str(call.id) || index}`,
      runId: activity.run_id,
      name: str(call.name) || "tool",
      ...(call.arguments !== undefined ? { arguments: call.arguments } : {}),
      ...(call.output !== undefined ? { output: call.output } : {}),
      status,
      ...(status === "completed" ? { success: true } : status === "failed" ? { success: false } : {}),
      ...(error ? { error } : {}),
      ...(str(activity.started_at) ? { startedAt: str(activity.started_at) } : {}),
      ...(str(activity.ended_at) ? { endedAt: str(activity.ended_at) } : {}),
      // A person decided (the view sets `outcome` only once every call of the batch is decided,
      // AbstractRuntime replay/view.py:1050-1051); a wait cut short by the run's end has none.
      ...(activity.wait?.kind === "tool_approval" && activity.wait.outcome ? { approvalWait: true } : {}),
      ...(str(call.id) ? { callId: str(call.id) } : {}),
      ...(policy ? { policy } : {}),
    };
  });
}

/** The transcript row of a tool call (the controller's own shape, shared). */
export function toolActivityMessage(tool: WorkflowToolActivity): ChatMessage {
  return { id: `tool:${tool.id}`, role: "system", kind: "tool_activity", title: "Tool activity", runId: tool.runId, toolActivity: tool, content: JSON.stringify({ tool: tool.name, status: tool.status, arguments: tool.arguments, output: tool.output, error: tool.error }, null, 2), ts: tool.endedAt || tool.startedAt };
}

function policyLine(activity: ReplayViewActivity): ChatMessage | null {
  const decision = str(activity.decision);
  if (decision !== "auto_approved" && decision !== "denied") return null;
  const policy = obj(activity.policy);
  const setBy = obj(policy?.set_by);
  const who = str(setBy?.user_id) || str(setBy?.client);
  const provenance: WorkflowToolPolicyProvenance = {
    decision,
    ...(str(activity.source) ? { source: str(activity.source) } : {}),
    ...(typeof policy?.revision === "number" ? { revision: policy.revision as number } : {}),
    ...(who ? { setBy: who } : {}),
    ...(str(policy?.set_at) ? { setAt: str(policy?.set_at) } : {}),
  };
  return { id: `policy:${activity.id}`, role: "system", kind: "tool_policy_decision", title: "Tool policy", runId: activity.run_id, content: toolPolicyDecisionText(provenance), ts: str(activity.started_at) || undefined };
}

/** The turn's statistics from the view: `usage`, the tool calls, the files they changed, the span of its activities. */
export function replayStatistics(view: ReplayView): WorkflowStatistics {
  const usage = obj(view.usage) || {};
  const files = new Set<string>();
  let toolCalls = 0;
  let llm = 0;
  let start = Infinity;
  let end = -Infinity;
  for (const a of view.activities || []) {
    const s = Date.parse(str(a.started_at));
    const e = Date.parse(str(a.ended_at));
    if (Number.isFinite(s)) start = Math.min(start, s);
    if (Number.isFinite(e)) end = Math.max(end, e);
    if (a.kind === "llm") llm += 1;
    if (a.kind !== "tool") continue;
    for (const call of a.tool_calls || []) {
      toolCalls += 1;
      if (str(call.status) !== "completed" || !FILE_TOOLS.has(str(call.name))) continue;
      const args = obj(call.arguments) || {};
      const path = str(args.destination) || str(args.destination_path) || str(args.file_path) || str(args.path) || str(args.filename);
      if (path) files.add(path);
    }
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const out: WorkflowStatistics = { llmCalls: num(usage.llm_calls) ?? llm, toolCalls, changedFiles: [...files] };
  if (num(usage.input_tokens) !== undefined) out.inputTokens = num(usage.input_tokens);
  if (num(usage.output_tokens) !== undefined) out.outputTokens = num(usage.output_tokens);
  if (num(usage.total_tokens) !== undefined) out.totalTokens = num(usage.total_tokens);
  if (Number.isFinite(start) && Number.isFinite(end)) out.durationMs = Math.max(0, end - start);
  return out;
}

export type ReplayProjection = {
  /** Transcript in the view's order: messages, tool rows and policy lines interleaved. */
  messages: ChatMessage[];
  /** Every tool row (also inside `messages`), by id. */
  tools: WorkflowToolActivity[];
  interaction: WorkflowWaitInteraction | null;
  status: string;
  displayStatus: string;
  /** `${run_id}:${step_id}` of model calls still running (Stop evidence). */
  openLlmCalls: string[];
  /** `${run_id}:${step_id}` of model calls that ended (their live text is replaced). */
  endedLlmCalls: string[];
  /** Runs of the tree and their status. */
  runStatus: Map<string, string>;
  statistics: WorkflowStatistics;
};

function messageOf(m: ReplayViewMessage, statistics: WorkflowStatistics | undefined): ChatMessage {
  const ts = Array.isArray(m.order) && typeof m.order[0] === "string" && m.order[0] ? (m.order[0] as string) : undefined;
  const level = str(m.level).toLowerCase();
  return {
    id: m.id,
    role: m.role,
    kind: m.kind,
    content: m.text,
    runId: m.run_id,
    ...(ts ? { ts } : {}),
    ...(m.role === "system" ? { title: "Workflow", level: level === "error" ? "error" : level === "warn" || level === "warning" ? "warn" : "info" } : {}),
    ...(Array.isArray(m.artifact_ids) && m.artifact_ids.length ? { artifactIds: [...m.artifact_ids] } : {}),
    ...(statistics ? { statistics } : {}),
  } as ChatMessage;
}

/** Project a whole view. */
export function projectReplayView(view: ReplayView): ReplayProjection {
  const root = view.root_run_id;
  const statistics = replayStatistics(view);
  const interaction = view.interaction ? replayInteractionWait(view.interaction) : null;
  const openQuestion = view.interaction ? `${view.interaction.run_id}:${view.interaction.step_id || ""}:question` : "";
  const finalOfRoot = (view.messages || []).find((m) => m.id === `${root}:final`);
  const statsOn = finalOfRoot ? (finalOfRoot.repeats || finalOfRoot.id) : "";
  type Item = { order?: unknown[]; id: string; message: ChatMessage };
  const items: Item[] = [];
  for (const m of view.messages || []) {
    if (m.kind === "final" && m.repeats) continue;
    if (m.kind === "question" && m.id === openQuestion) continue;
    items.push({ order: m.order, id: m.id, message: messageOf(m, m.id === statsOn ? statistics : undefined) });
  }
  const tools: WorkflowToolActivity[] = [];
  const openLlmCalls: string[] = [];
  const endedLlmCalls: string[] = [];
  for (const a of view.activities || []) {
    if (a.kind === "tool") {
      const rows = replayToolActivities(a);
      tools.push(...rows);
      rows.forEach((tool, i) => items.push({ order: [...(a.order || []), i], id: `${a.id}:${i}`, message: toolActivityMessage(tool) }));
    } else if (a.kind === "tool_policy") {
      const line = policyLine(a);
      if (line) items.push({ order: a.order, id: a.id, message: line });
    } else if (a.kind === "llm") {
      for (const step of a.step_ids || []) (TERMINAL.has(a.status) ? endedLlmCalls : openLlmCalls).push(`${a.run_id}:${step}`);
    }
  }
  items.sort((x, y) => compareReplayOrder(x, y));
  const runStatus = new Map((view.runs || []).map((r) => [r.run_id, str(r.status).toLowerCase()]));
  const status = str(view.status).toLowerCase() || "unknown";
  return {
    messages: items.map((x) => x.message),
    tools,
    interaction: TERMINAL.has(status) ? null : interaction,
    status,
    displayStatus: str(view.display_status),
    openLlmCalls,
    endedLlmCalls,
    runStatus,
    statistics,
  };
}
