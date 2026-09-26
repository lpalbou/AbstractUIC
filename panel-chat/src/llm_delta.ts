/**
 * Live model-reply deltas on the gateway's run ledger stream.
 *
 * The gateway sends two extra SSE event names on `GET /runs/{id}/ledger/stream`
 * when a run streams its replies (`_runtime.stream`). They carry NO `id:`
 * line: they are volatile and never move the ledger cursor.
 *
 *   event: llm.delta      data: {kind, run_id, root_run_id, parent_run_id, node_id, call_id, seq, text, channel, snapshot}
 *   event: llm.delta_end  data: {kind, run_id, root_run_id, parent_run_id, node_id, call_id, seq, reason, detail?}
 *
 * `run_id` is the run that called the model; a stream subscribed to a root
 * run also carries its sub-runs' deltas (`parent_run_id` is null for a root).
 *
 * `call_id` is the `step_id` of the run's `llm_call` ledger step. A
 * `snapshot: true` delta (sent on subscribe/reconnect, or when the gateway
 * coalesced frames for a slow reader) carries the whole text so far for its
 * channel. The durable `llm_call` terminal record (written before the
 * `llm.delta_end`) and the run's assistant message replace the live text.
 * There is one `llm.delta_end` per model-call attempt (a retry gets a fresh
 * `call_id`), including calls that ran without streaming, so an end for a
 * call that sent no delta is normal. `reason: "unavailable"` says why a call
 * was not streamed (`detail`). `<think>` blocks are already split out by the
 * server into the `reasoning` channel. Extra fields (such as a legacy
 * `truncated`) are tolerated and ignored.
 */

export type LlmDeltaChannel = "content" | "reasoning";

export type LlmDelta = {
  kind?: "llm.delta";
  run_id: string;
  root_run_id?: string;
  /** Null (or absent) for a root run's own model call. */
  parent_run_id?: string | null;
  node_id?: string;
  call_id: string;
  seq: number;
  text: string;
  channel: LlmDeltaChannel;
  snapshot: boolean;
};

export type LlmDeltaEndReason = "completed" | "failed" | "cancelled" | "unavailable";

/** Why a call was not streamed (`reason: "unavailable"`); other strings may appear. */
export type LlmStreamUnavailableDetail = "structured_output" | "remote_core" | "provider_cannot_stream" | "sink_error" | "usage_unavailable";

export type LlmDeltaEnd = {
  kind?: "llm.delta_end";
  run_id: string;
  root_run_id?: string;
  parent_run_id?: string | null;
  node_id?: string;
  call_id: string;
  seq: number;
  reason: LlmDeltaEndReason;
  /** Present with `reason: "unavailable"`. */
  detail?: LlmStreamUnavailableDetail | string;
};

export type LlmDeltaEvent = LlmDelta | LlmDeltaEnd;

export const LLM_DELTA_EVENT = "llm.delta" as const;
export const LLM_DELTA_END_EVENT = "llm.delta_end" as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function seqOf(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** True for a validated `llm.delta_end` payload (as opposed to an `llm.delta`). */
export function isLlmDeltaEnd(event: LlmDeltaEvent): event is LlmDeltaEnd {
  return "reason" in event;
}

/**
 * Validate one delta payload (the parsed `data:` of an `llm.delta` or
 * `llm.delta_end` frame). Throws an Error naming the problem for a payload
 * that does not match the contract; it never guesses a missing field.
 */
export function validateLlmDeltaEvent(value: unknown, eventName?: string): LlmDeltaEvent {
  const row = record(value);
  const kind = row?.kind;
  const label = eventName || (typeof kind === "string" && kind ? kind : row && "reason" in row ? LLM_DELTA_END_EVENT : LLM_DELTA_EVENT);
  const bad = (why: string): never => { throw new Error(`Malformed ${label} event from the gateway: ${why}`); };
  if (eventName !== undefined && eventName !== LLM_DELTA_EVENT && eventName !== LLM_DELTA_END_EVENT) bad(`unknown event name ${JSON.stringify(eventName)}`);
  if (!row) return bad("the payload is not an object");
  if (kind !== undefined && kind !== LLM_DELTA_EVENT && kind !== LLM_DELTA_END_EVENT) bad(`unknown kind ${JSON.stringify(kind)}`);
  if (kind !== undefined && eventName !== undefined && kind !== eventName) bad(`kind ${JSON.stringify(kind)} does not match the event name`);
  if (!nonEmpty(row.run_id)) bad("run_id is missing");
  if (!nonEmpty(row.call_id)) bad("call_id is missing");
  if (!seqOf(row.seq)) bad("seq is not a non-negative integer");
  const isEnd = (eventName || kind) ? (eventName || kind) === LLM_DELTA_END_EVENT : "reason" in row;
  if (row.root_run_id !== undefined && !nonEmpty(row.root_run_id)) bad("root_run_id is not a run id");
  if (row.parent_run_id !== undefined && row.parent_run_id !== null && !nonEmpty(row.parent_run_id)) bad("parent_run_id is neither a run id nor null");
  const common = {
    run_id: row.run_id as string,
    ...(nonEmpty(row.root_run_id) ? { root_run_id: row.root_run_id } : {}),
    ...(row.parent_run_id !== undefined ? { parent_run_id: row.parent_run_id as string | null } : {}),
    ...(nonEmpty(row.node_id) ? { node_id: row.node_id } : {}),
    call_id: row.call_id as string,
    seq: row.seq as number,
  };
  if (isEnd) {
    if (!["completed", "failed", "cancelled", "unavailable"].includes(String(row.reason))) bad(`unknown reason ${JSON.stringify(row.reason)}`);
    if (row.detail !== undefined && row.detail !== null && typeof row.detail !== "string") bad("detail is not a string");
    return { kind: LLM_DELTA_END_EVENT, ...common, reason: row.reason as LlmDeltaEndReason, ...(nonEmpty(row.detail) ? { detail: row.detail } : {}) };
  }
  if (typeof row.text !== "string") bad("text is not a string");
  if (row.channel !== "content" && row.channel !== "reasoning") bad(`unknown channel ${JSON.stringify(row.channel)}`);
  if (typeof row.snapshot !== "boolean") bad("snapshot is not a boolean");
  return {
    kind: LLM_DELTA_EVENT,
    ...common,
    text: row.text as string,
    channel: row.channel as LlmDeltaChannel,
    snapshot: row.snapshot as boolean,
  };
}

/**
 * For host SSE readers: turn one received frame into a delta event, or
 * `null` when the frame is not a delta (then it is a ledger item, handled as
 * before). `data` may be the raw `data:` string or an already parsed value.
 *
 *   const delta = llmDeltaFromSse(frame.event, frame.data);
 *   if (delta) { onDelta?.(delta); continue; } // never touch the ledger cursor
 *
 * Throws for a malformed delta frame (see `validateLlmDeltaEvent`).
 */
export function llmDeltaFromSse(eventName: string, data: unknown): LlmDeltaEvent | null {
  if (eventName !== LLM_DELTA_EVENT && eventName !== LLM_DELTA_END_EVENT) return null;
  let value = data;
  if (typeof data === "string") {
    try { value = JSON.parse(data); } catch { throw new Error(`Malformed ${eventName} event from the gateway: data is not JSON`); }
  }
  return validateLlmDeltaEvent(value, eventName);
}

/** The widget's "Stream replies" choice. */
export type StreamRepliesMode = "gateway_default" | "on" | "off";

/**
 * The run-input `_runtime` entries for a `StreamRepliesMode`:
 * `"on"` → `{ stream: true }`, `"off"` → `{ stream: false }`,
 * `"gateway_default"` → `{}` (leave `_runtime.stream` unset so the gateway's
 * `agents.streaming_default` setting decides). Merge the result into the
 * `_runtime` object of the start-run input.
 */
export function streamRepliesRuntime(mode: StreamRepliesMode): { stream?: boolean } {
  if (mode === "on") return { stream: true };
  if (mode === "off") return { stream: false };
  if (mode === "gateway_default") return {};
  throw new Error(`Unknown streamReplies mode ${JSON.stringify(mode)}; use "gateway_default", "on" or "off"`);
}

const UNAVAILABLE_REASONS: Record<LlmStreamUnavailableDetail, string> = {
  structured_output: "this step asks the model for structured output",
  remote_core: "the model runs on a remote AbstractCore server",
  provider_cannot_stream: "the model provider cannot stream",
  sink_error: "the gateway could not relay the live text",
  usage_unavailable: "the provider does not report token usage while streaming",
};

/** One line explaining an `llm.delta_end` with `reason: "unavailable"`. */
export function describeStreamUnavailable(detail?: string): string {
  const why = detail ? UNAVAILABLE_REASONS[detail as LlmStreamUnavailableDetail] || `the gateway reported "${detail}"` : "the gateway gave no reason";
  return `This reply is not streamed: ${why}. It appears when it is complete.`;
}
