import type { WorkflowRecord, ServerRecord } from "./workflow_runtime.js";

export type WorkflowToolActivity = {
  id: string;
  runId: string;
  name: string;
  arguments?: unknown;
  output?: unknown;
  status: "running" | "waiting" | "completed" | "failed";
  success?: boolean;
  error?: string;
  startedAt?: string;
  endedAt?: string;
};
export type WorkflowStatistics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  llmCalls: number;
  toolCalls: number;
  changedFiles: string[];
  durationMs?: number;
  // Measured detail, summed across the turn's model calls. Every field is
  // OPTIONAL and is emitted only when a record actually reported it: a local
  // MLX stack reports `performance` on a minority of calls, and zero is a
  // claim ("no cache was reused") that unreported data does not support.
  /** Milliseconds inside model calls (`result.gen_time`). The rest of
   *  `durationMs` is orchestration, tools and model load. */
  genTimeMs?: number;
  /** Model calls that reported `gen_time`. */
  timedCalls?: number;
  /** Prompt-phase milliseconds: prompt tokens ÷ the provider's prompt rate.
   *  That quotient IS the provider's measured prompt time (mlx-vlm divides
   *  the whole prompt, restored tokens included, by the time to the first
   *  token), so the duration is honest even when a cache restore is in play. */
  prefillMs?: number;
  /** Token-generation (decode) seconds, same derivation. */
  decodeMs?: number;
  /** Prompt-processing speed, tokens/second, averaged over reporting calls.
   *  PROVIDER RATE: it counts every prompt token, restored ones included, so
   *  on a cache hit it overstates what was computed (defect 2026-09-22: a turn
   *  that computed 1,803 new tokens in 3.25 s read "1,813 tok/s" because 4,096
   *  restored tokens were in the numerator). Prefer `prefillNewTokensPerSecond`. */
  promptTokensPerSecond?: number;
  /** Prompt tokens actually computed in the timed prefill (fed, not restored),
   *  summed over calls that reported BOTH a prompt rate and a cache split. */
  prefillNewTokens?: number;
  /** Prefill speed over `prefillNewTokens` only: Σ fed ÷ Σ prompt time across
   *  those same calls. The honest rate whenever tokens were restored. */
  prefillNewTokensPerSecond?: number;
  /** Generation speed, tokens/second, averaged over reporting calls. */
  generationTokensPerSecond?: number;
  /** Model calls that reported a `performance` block. */
  measuredSpeedCalls?: number;
  /** Prompt tokens served from cache instead of recomputed. */
  cachedTokens?: number;
  /** Prompt tokens actually fed to the model. */
  fedTokens?: number;
  /** Model calls that reported a `prompt_cache` block. */
  measuredCacheCalls?: number;
  /** Distinct `prompt_cache.outcome` values seen (hit_restore, rebuilt, …). */
  cacheOutcomes?: string[];
  /** Calls that finished with an error. Counted from terminal rows only. */
  toolsFailed?: number;
  /** Calls still parked on a decision (approval gating) — NOT failures. */
  toolsWaiting?: number;
  /** Calls in flight. */
  toolsRunning?: number;
  /** Per-tool tally, so the chip can say WHICH tools ran and which failed.
   *  `ms` is the wall time of the batches in which this tool ran ALONE (a
   *  batch runs its calls together, so a batch shared with another tool
   *  cannot be split honestly — it is counted in `sharedBatches` instead).
   *  `errors` tallies the failure class (`error_class`) when the tool's
   *  result carried one. */
  toolBreakdown?: Record<
    string,
    { calls: number; failed: number; ms?: number; sharedBatches?: number; errors?: Record<string, number> }
  >;

  // --- structured detail (2026-09-22, panel-chat 0.1.11) -----------------
  // Same rule as above: every field is emitted only when a record reported
  // the value it is built from.
  /** One row per completed model call, in start order. */
  modelCalls?: WorkflowModelCall[];
  /** Distinct model ids / providers that served the turn's calls. */
  models?: string[];
  providers?: string[];
  /** Reasoning/thinking tokens, when the usage block carries them. */
  reasoningTokens?: number;
  /** Distinct prompt-cache backends (`prompt_cache.backend`). */
  cacheBackends?: string[];
  /** Σ measured time-to-first-token (`abstract.progress` `ttft_s`). */
  ttftMs?: number;
  /** Calls whose TTFT was measured (the rest fall back to the rate quotient). */
  ttftCalls?: number;
  /** Prompt phase per call — the measured TTFT when present, else
   *  prompt tokens ÷ provider prompt rate — summed. */
  promptPhaseMs?: number;
  promptPhaseCalls?: number;
  /** Tokens actually computed (fed) in those prompt phases, and the rate
   *  over them: Σ fed ÷ Σ prompt phase, over calls that reported both. */
  promptPhaseNewTokens?: number;
  promptPhaseTokensPerSecond?: number;
  /** Generation phase per call — `gen_time` − TTFT when both were measured,
   *  else output ÷ provider generation rate — summed, with Σ output ÷ Σ
   *  phase as the rate. */
  generationPhaseMs?: number;
  generationPhaseTokens?: number;
  generationPhaseTokensPerSecond?: number;
  /** Speculative decoding (MTP / draft model), summed over reporting calls. */
  speculation?: WorkflowSpeculation;
  /** Σ wall time of the turn's finished tool batches (calls issued together
   *  share one timing). */
  toolTimeMs?: number;
  toolBatches?: number;
  /** True when at least one timed batch waited on an approval: its time
   *  includes the human, not only the tool. */
  toolTimeIncludesApproval?: boolean;
  /** The slowest finished batch. */
  slowestToolBatch?: { ms: number; calls: number; tools: string[] };
};

/** Speculative decoding for the turn (mlx-vlm `metadata.speculation`). */
export type WorkflowSpeculation = {
  /** Calls that reported a speculation block, and how many used it. */
  calls: number;
  used: number;
  modes?: string[];
  draftKinds?: string[];
  acceptedTokens?: number;
  draftedTokens?: number;
  /** Σ accepted ÷ Σ drafted. */
  acceptanceRate?: number;
  rounds?: number;
  /** Distinct `num_draft_tokens` (tokens proposed per round). */
  draftLengths?: number[];
};

/** One model call, folded from its completed `llm_call` record plus the
 *  `abstract.progress` events that share its step. */
export type WorkflowModelCall = {
  runId: string;
  stepId?: string;
  startedAt?: string;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  fedTokens?: number;
  cacheOutcome?: string;
  cacheBackend?: string;
  genTimeMs?: number;
  /** Measured time to first token. */
  ttftMs?: number;
  /** Prompt phase: `ttftMs` when measured ("ttft"), else prompt tokens ÷
   *  provider prompt rate ("rate"). */
  promptMs?: number;
  promptSource?: "ttft" | "rate";
  /** Fed tokens ÷ prompt phase. */
  promptNewTokensPerSecond?: number;
  /** Provider rates, as reported. */
  promptTokensPerSecond?: number;
  generationTokensPerSecond?: number;
  generationMs?: number;
  speculation?: {
    mode?: string;
    used?: boolean;
    draftKind?: string;
    acceptedTokens?: number;
    draftedTokens?: number;
    acceptanceRate?: number;
    rounds?: number;
    draftLength?: number;
  };
};
const obj = (value: any): ServerRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const rows = (value: unknown): ServerRecord[] =>
  Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const uid = (value: ServerRecord): string =>
  str(value.runtime_call_id || value.call_uid);
const cid = (value: ServerRecord): string => str(value.call_id || value.id);

/** Fold execution evidence, never model call ids across cycles. Mutates only its supplied map. */
export function foldWorkflowTools(
  state: Map<string, WorkflowToolActivity>,
  entry: WorkflowRecord,
): WorkflowToolActivity[] {
  const rec = entry.record,
    effect = obj(rec.effect);
  if (effect.type !== "tool_calls") return [];
  const result = obj(rec.result),
    calls = rows(obj(effect.payload).tool_calls),
    results = rows(result.results);
  const source = calls.length ? calls : results;
  const changed: WorkflowToolActivity[] = [];
  source.forEach((call, index) => {
    let matches = uid(call)
      ? results.filter((row) => uid(row) === uid(call))
      : [];
    if (
      !matches.length &&
      cid(call) &&
      calls.filter((row) => cid(row) === cid(call)).length === 1
    )
      matches = results.filter((row) => cid(row) === cid(call));
    const output = !calls.length
      ? call
      : matches.length === 1
        ? matches[0]
        : calls.length === results.length
          ? results[index]
          : {};
    const identity =
      uid(call) ||
      uid(output) ||
      `${str(rec.idempotency_key) || str(rec.step_id) || entry.cursor}:${index}`;
    const id = `${entry.runId}:${identity}`,
      previous = state.get(id);
    const name = str(call.name || output.name) || previous?.name;
    if (!name) return;
    const completed = rec.status === "completed" || rec.status === "failed";
    const failed =
      rec.status === "failed" ||
      output.success === false ||
      Boolean(output.error);
    const args = call.arguments ?? output.arguments ?? previous?.arguments;
    const activity: WorkflowToolActivity = {
      ...previous,
      id,
      runId: entry.runId,
      name,
      arguments: args,
      status: completed
        ? failed
          ? "failed"
          : "completed"
        : rec.status === "waiting"
          ? "waiting"
          : "running",
      ...(typeof output.success === "boolean"
        ? { success: output.success }
        : {}),
      ...(output.output !== undefined || output.result !== undefined
        ? { output: output.output ?? output.result }
        : {}),
      ...(output.error ? { error: String(output.error) } : {}),
      startedAt: previous?.startedAt || str(rec.started_at) || undefined,
      endedAt: completed
        ? str(rec.ended_at) || previous?.endedAt
        : previous?.endedAt,
    };
    // A replayed STARTED row cannot roll a proven terminal result backwards.
    if (
      previous &&
      ["completed", "failed"].includes(previous.status) &&
      !completed
    )
      return;
    state.set(id, activity);
    changed.push(activity);
  });
  return changed;
}
/** A finite non-negative number, or undefined. Unlike `count` it does NOT
 *  truncate: speeds and millisecond durations are fractional. */
function num(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean")
    return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function count(value: any, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = value?.[key];
    if (
      raw === undefined ||
      raw === null ||
      raw === "" ||
      typeof raw === "boolean"
    )
      continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return undefined;
}
function argsObject(value: unknown): ServerRecord {
  if (typeof value === "string") {
    try {
      return obj(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return obj(value);
}
function addDistinct<T>(list: T[] | undefined, value: T | undefined | ""): T[] | undefined {
  if (value === undefined || value === "") return list;
  const out = list || [];
  if (!out.includes(value)) out.push(value);
  return out;
}
/** Reasoning/thinking tokens under the spellings providers use. */
function reasoningCount(usage: ServerRecord): number | undefined {
  return (
    count(usage, ["reasoning_tokens", "thinking_tokens"]) ??
    count(obj(usage.completion_tokens_details), ["reasoning_tokens"]) ??
    count(obj(usage.output_tokens_details), ["reasoning_tokens"])
  );
}
/** The failure class a tool result carried (`error_class`), if any. Outputs
 *  are objects or serialized JSON strings; nothing is inferred from prose. */
function errorClass(output: unknown): string {
  const value = obj(typeof output === "string" && output.trim().startsWith("{") ? argsObject(output) : output);
  return str(value.error_class);
}
type Progress = { ttftS?: number; provider?: string; model?: string };
/** `abstract.progress` (kind "llm") facts per `${runId}:${step_id}`. They
 *  are emitted as separate ledger rows, before OR after the call completes,
 *  so they are indexed in a first pass. */
function progressIndex(records: WorkflowRecord[]): Map<string, Progress> {
  const index = new Map<string, Progress>();
  for (const entry of records) {
    const rec = entry.record;
    if (obj(rec.effect).type !== "emit_event") continue;
    const result = obj(rec.result);
    if (str(result.name) !== "abstract.progress") continue;
    const payload = obj(result.payload);
    if (str(payload.kind) !== "llm" || !str(payload.step_id)) continue;
    const key = `${str(payload.run_id) || entry.runId}:${str(payload.step_id)}`;
    const row = index.get(key) || {};
    const ttft = num(payload.ttft_s);
    if (ttft !== undefined) row.ttftS = ttft;
    row.provider = row.provider || str(payload.provider) || undefined;
    row.model = row.model || str(payload.model) || undefined;
    index.set(key, row);
  }
  return index;
}
export function workflowEvidence(records: WorkflowRecord[]): {
  tools: WorkflowToolActivity[];
  statistics: WorkflowStatistics;
} {
  const tools = new Map<string, WorkflowToolActivity>(),
    seen = new Set<string>(),
    files = new Set<string>();
  const statistics: WorkflowStatistics = {
    llmCalls: 0,
    toolCalls: 0,
    changedFiles: [],
  };
  let start = Infinity,
    end = -Infinity;
  let incompleteSplit = false;
  // Prefill work paired with its own prompt time (see prefillNewTokens).
  let newPrefillTokens = 0,
    newPrefillMs = 0;
  let promptPhaseNewMs = 0;
  const progress = progressIndex(records);
  const calls: WorkflowModelCall[] = [];
  // Tool activity ids that ever parked on a decision: their batch time
  // includes the wait for approval, and the tooltip must say so.
  const waited = new Set<string>();
  for (const entry of records) {
    const rec = entry.record;
    const key = `${entry.runId}:${rec.step_id || entry.cursor}:${rec.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const raw of [rec.started_at, rec.ended_at]) {
      const at = Date.parse(str(raw));
      if (Number.isFinite(at)) {
        start = Math.min(start, at);
        end = Math.max(end, at);
      }
    }
    for (const activity of foldWorkflowTools(tools, entry))
      if (activity.status === "waiting") waited.add(activity.id);
    if (obj(rec.effect).type !== "llm_call" || rec.status !== "completed")
      continue;
    statistics.llmCalls += 1;
    const result = obj(rec.result),
      nested = obj(result.output);
    const usage = obj(
      result.usage ||
        result.token_usage ||
        result.tokens ||
        nested.usage ||
        nested.token_usage ||
        nested.tokens,
    );
    const input = count(usage, [
      "input_tokens",
      "prompt_tokens",
      "prompt",
      "input",
      "in",
    ]);
    const output = count(usage, [
      "output_tokens",
      "completion_tokens",
      "completion",
      "output",
      "out",
    ]);
    const total =
      count(usage, ["total_tokens", "total"]) ??
      (input !== undefined || output !== undefined
        ? (input || 0) + (output || 0)
        : undefined);
    if (
      total !== undefined &&
      (input === undefined || output === undefined || input + output !== total)
    )
      incompleteSplit = true;
    if (input !== undefined)
      statistics.inputTokens = (statistics.inputTokens || 0) + input;
    if (output !== undefined)
      statistics.outputTokens = (statistics.outputTokens || 0) + output;
    if (total !== undefined)
      statistics.totalTokens = (statistics.totalTokens || 0) + total;

    // --- measured detail -------------------------------------------------
    // `gen_time` is the model call itself; `durationMs` is the whole turn.
    // The difference is orchestration, tool execution and model load, and it
    // is frequently a third of the turn — the single wall-clock chip hid it.
    const genTime = num(result.gen_time ?? nested.gen_time);
    if (genTime !== undefined) {
      statistics.genTimeMs = (statistics.genTimeMs || 0) + genTime;
      statistics.timedCalls = (statistics.timedCalls || 0) + 1;
    }
    const metadata = obj(result.metadata || nested.metadata);
    const performance = obj(metadata.performance);
    const promptTps = num(performance.prompt_tokens_per_second);
    const generationTps = num(performance.generation_tokens_per_second);
    const promptCache = obj(metadata.prompt_cache);
    const cached = num(promptCache.cached_tokens);
    const fed = num(promptCache.fed_tokens);
    if (promptTps !== undefined || generationTps !== undefined) {
      statistics.measuredSpeedCalls = (statistics.measuredSpeedCalls || 0) + 1;
      // Speeds are averaged over the calls that reported them; the phase
      // TIMES are summed, because each call spends its own prefill/decode.
      if (promptTps !== undefined && promptTps > 0) {
        statistics.promptTokensPerSecond =
          (statistics.promptTokensPerSecond || 0) + promptTps;
        if (input !== undefined) {
          const promptMs = (input / promptTps) * 1000;
          statistics.prefillMs = (statistics.prefillMs || 0) + promptMs;
          // The provider rate divides the WHOLE prompt (restored tokens
          // included) by the prompt time, so on a cache hit it is not the
          // speed anything was computed at. Pair this call's prompt time
          // with the tokens it actually fed, and only when it reported both.
          if (fed !== undefined) {
            newPrefillTokens += fed;
            newPrefillMs += promptMs;
          }
        }
      }
      if (generationTps !== undefined && generationTps > 0) {
        statistics.generationTokensPerSecond =
          (statistics.generationTokensPerSecond || 0) + generationTps;
        if (output !== undefined)
          statistics.decodeMs =
            (statistics.decodeMs || 0) + (output / generationTps) * 1000;
      }
    }
    if (cached !== undefined || fed !== undefined) {
      statistics.measuredCacheCalls = (statistics.measuredCacheCalls || 0) + 1;
      statistics.cachedTokens = (statistics.cachedTokens || 0) + (cached || 0);
      statistics.fedTokens = (statistics.fedTokens || 0) + (fed || 0);
      const outcome = str(promptCache.outcome);
      if (outcome) {
        const seenOutcomes = statistics.cacheOutcomes || [];
        if (!seenOutcomes.includes(outcome)) seenOutcomes.push(outcome);
        statistics.cacheOutcomes = seenOutcomes;
      }
    }

    // --- per-call row -----------------------------------------------------
    const stepId = str(rec.step_id) || undefined;
    const facts = (stepId && progress.get(`${entry.runId}:${stepId}`)) || {};
    const route = obj(result.route);
    const call: WorkflowModelCall = { runId: entry.runId };
    if (stepId) call.stepId = stepId;
    if (str(rec.started_at)) call.startedAt = str(rec.started_at);
    const model = str(result.model || nested.model) || str(route.model) || facts.model;
    const provider =
      str(route.provider) || str(obj(metadata._provider_request).provider) || facts.provider || str(result.provider);
    if (model) call.model = model;
    if (provider) call.provider = provider;
    if (model) statistics.models = addDistinct(statistics.models, model);
    if (provider) statistics.providers = addDistinct(statistics.providers, provider);
    // Same honesty rule as the turn totals: a split that does not add up to
    // the reported total is not shown as a split.
    if (total === undefined || (input !== undefined && output !== undefined && input + output === total)) {
      if (input !== undefined) call.inputTokens = input;
      if (output !== undefined) call.outputTokens = output;
    }
    if (total !== undefined) call.totalTokens = total;
    const reasoning = reasoningCount(usage);
    if (reasoning !== undefined) {
      call.reasoningTokens = reasoning;
      statistics.reasoningTokens = (statistics.reasoningTokens || 0) + reasoning;
    }
    if (cached !== undefined) call.cachedTokens = cached;
    if (fed !== undefined) call.fedTokens = fed;
    if (str(promptCache.outcome)) call.cacheOutcome = str(promptCache.outcome);
    if (str(promptCache.backend)) {
      call.cacheBackend = str(promptCache.backend);
      statistics.cacheBackends = addDistinct(statistics.cacheBackends, call.cacheBackend);
    }
    if (genTime !== undefined) call.genTimeMs = genTime;
    if (promptTps !== undefined && promptTps > 0) call.promptTokensPerSecond = promptTps;
    if (generationTps !== undefined && generationTps > 0) call.generationTokensPerSecond = generationTps;
    // Prompt phase: the measured TTFT is the truth (it includes cache
    // restore and scheduling that the provider's own prompt timer omits);
    // the rate quotient is the fallback, labelled by `promptSource`.
    if (facts.ttftS !== undefined) {
      call.ttftMs = facts.ttftS * 1000;
      call.promptMs = call.ttftMs;
      call.promptSource = "ttft";
      statistics.ttftMs = (statistics.ttftMs || 0) + call.ttftMs;
      statistics.ttftCalls = (statistics.ttftCalls || 0) + 1;
    } else if (call.promptTokensPerSecond !== undefined && input !== undefined) {
      call.promptMs = (input / call.promptTokensPerSecond) * 1000;
      call.promptSource = "rate";
    }
    if (call.promptMs !== undefined) {
      statistics.promptPhaseMs = (statistics.promptPhaseMs || 0) + call.promptMs;
      statistics.promptPhaseCalls = (statistics.promptPhaseCalls || 0) + 1;
      if (fed !== undefined && call.promptMs > 0) {
        call.promptNewTokensPerSecond = fed / (call.promptMs / 1000);
        statistics.promptPhaseNewTokens = (statistics.promptPhaseNewTokens || 0) + fed;
        promptPhaseNewMs += call.promptMs;
      }
    }
    if (call.ttftMs !== undefined && genTime !== undefined && genTime >= call.ttftMs)
      call.generationMs = genTime - call.ttftMs;
    else if (call.generationTokensPerSecond !== undefined && output !== undefined)
      call.generationMs = (output / call.generationTokensPerSecond) * 1000;
    if (call.generationMs !== undefined && output !== undefined) {
      statistics.generationPhaseMs = (statistics.generationPhaseMs || 0) + call.generationMs;
      statistics.generationPhaseTokens = (statistics.generationPhaseTokens || 0) + output;
    }
    const spec = obj(metadata.speculation);
    if (Object.keys(spec).length) {
      const row: NonNullable<WorkflowModelCall["speculation"]> = {};
      if (str(spec.mode)) row.mode = str(spec.mode);
      if (typeof spec.used === "boolean") row.used = spec.used;
      if (str(spec.draft_kind)) row.draftKind = str(spec.draft_kind);
      const accepted = count(spec, ["accepted_tokens"]),
        drafted = count(spec, ["drafted_tokens"]),
        rounds = count(spec, ["rounds"]),
        draftLength = count(spec, ["num_draft_tokens"]);
      if (accepted !== undefined) row.acceptedTokens = accepted;
      if (drafted !== undefined) row.draftedTokens = drafted;
      if (accepted !== undefined && drafted) row.acceptanceRate = accepted / drafted;
      if (rounds !== undefined) row.rounds = rounds;
      if (draftLength !== undefined) row.draftLength = draftLength;
      call.speculation = row;
      const agg: WorkflowSpeculation = statistics.speculation || (statistics.speculation = { calls: 0, used: 0 });
      agg.calls += 1;
      if (row.used) agg.used += 1;
      if (row.mode) agg.modes = addDistinct(agg.modes, row.mode);
      if (row.draftKind) agg.draftKinds = addDistinct(agg.draftKinds, row.draftKind);
      if (accepted !== undefined && drafted !== undefined) {
        agg.acceptedTokens = (agg.acceptedTokens || 0) + accepted;
        agg.draftedTokens = (agg.draftedTokens || 0) + drafted;
      }
      if (rounds !== undefined) agg.rounds = (agg.rounds || 0) + rounds;
      if (draftLength !== undefined) agg.draftLengths = addDistinct(agg.draftLengths, draftLength);
    }
    calls.push(call);
  }
  if (calls.length) {
    // Start order when every row carries a start; otherwise ledger order.
    if (calls.every((call) => call.startedAt))
      calls.sort((a, b) => Date.parse(a.startedAt!) - Date.parse(b.startedAt!));
    statistics.modelCalls = calls;
  }
  if (promptPhaseNewMs > 0 && statistics.promptPhaseNewTokens !== undefined)
    statistics.promptPhaseTokensPerSecond = statistics.promptPhaseNewTokens / (promptPhaseNewMs / 1000);
  if (statistics.generationPhaseMs && statistics.generationPhaseTokens !== undefined)
    statistics.generationPhaseTokensPerSecond =
      statistics.generationPhaseTokens / (statistics.generationPhaseMs / 1000);
  if (statistics.speculation?.draftedTokens)
    statistics.speculation.acceptanceRate =
      (statistics.speculation.acceptedTokens || 0) / statistics.speculation.draftedTokens;
  // Averages, once: the accumulators above hold sums.
  if (statistics.measuredSpeedCalls) {
    if (statistics.promptTokensPerSecond !== undefined)
      statistics.promptTokensPerSecond /= statistics.measuredSpeedCalls;
    if (statistics.generationTokensPerSecond !== undefined)
      statistics.generationTokensPerSecond /= statistics.measuredSpeedCalls;
  }
  // Only from calls that reported both a rate and a cache split; a call that
  // fed nothing (fully restored) is a real 0 tok/s over 0 tokens, not a gap.
  if (newPrefillMs > 0) {
    statistics.prefillNewTokens = newPrefillTokens;
    statistics.prefillNewTokensPerSecond =
      newPrefillTokens / (newPrefillMs / 1000);
  }
  const batches = new Map<string, { ms: number; calls: number; names: Map<string, number>; waited: boolean }>();
  for (const tool of tools.values()) {
    // Pending work is counted separately: a call still waiting on YOUR
    // approval has not run, and must not be filed under failures.
    if (tool.status === "waiting") {
      statistics.toolsWaiting = (statistics.toolsWaiting || 0) + 1;
      continue;
    }
    if (tool.status === "running") {
      statistics.toolsRunning = (statistics.toolsRunning || 0) + 1;
      continue;
    }
    if (!["completed", "failed"].includes(tool.status)) continue;
    statistics.toolCalls += 1;
    const failedCall = tool.status === "failed";
    if (failedCall) statistics.toolsFailed = (statistics.toolsFailed || 0) + 1;
    const byName = statistics.toolBreakdown || (statistics.toolBreakdown = {});
    const row = byName[tool.name] || (byName[tool.name] = { calls: 0, failed: 0 });
    row.calls += 1;
    if (failedCall) {
      row.failed += 1;
      const failure = errorClass(tool.output);
      if (failure) (row.errors || (row.errors = {}))[failure] = (row.errors?.[failure] || 0) + 1;
    }
    // Calls issued together share one ledger row, hence one start and end:
    // that pair (per run) identifies the batch.
    const began = Date.parse(str(tool.startedAt)),
      ended = Date.parse(str(tool.endedAt));
    if (Number.isFinite(began) && Number.isFinite(ended) && ended >= began) {
      const batchKey = `${tool.runId}|${tool.startedAt}|${tool.endedAt}`;
      const batch = batches.get(batchKey) || { ms: ended - began, calls: 0, names: new Map<string, number>(), waited: false };
      batch.calls += 1;
      batch.names.set(tool.name, (batch.names.get(tool.name) || 0) + 1);
      if (waited.has(tool.id)) batch.waited = true;
      batches.set(batchKey, batch);
    }
    if (tool.success !== true) continue;
    // Conservative proof only: shell text and arbitrary output are not file-change evidence.
    if (
      ![
        "write_file",
        "create_file",
        "save_file",
        "edit_file",
        "update_file",
        "replace_in_file",
        "delete_file",
        "remove_file",
        "move_file",
        "rename_file",
        "copy_file",
      ].includes(tool.name)
    )
      continue;
    const args = argsObject(tool.arguments);
    const path = str(
      args.destination ||
        args.destination_path ||
        args.file_path ||
        args.path ||
        args.filename,
    );
    if (path) files.add(path);
  }
  for (const batch of batches.values()) {
    statistics.toolBatches = (statistics.toolBatches || 0) + 1;
    statistics.toolTimeMs = (statistics.toolTimeMs || 0) + batch.ms;
    if (batch.waited) statistics.toolTimeIncludesApproval = true;
    const names = [...batch.names.keys()].sort();
    if (!statistics.slowestToolBatch || batch.ms > statistics.slowestToolBatch.ms)
      statistics.slowestToolBatch = { ms: batch.ms, calls: batch.calls, tools: names };
    const row = statistics.toolBreakdown?.[names[0]];
    if (names.length === 1 && row) row.ms = (row.ms || 0) + batch.ms;
    else
      for (const name of names) {
        const shared = statistics.toolBreakdown?.[name];
        if (shared) shared.sharedBatches = (shared.sharedBatches || 0) + 1;
      }
  }
  statistics.changedFiles = [...files];
  if (incompleteSplit) {
    delete statistics.inputTokens;
    delete statistics.outputTokens;
  }
  if (Number.isFinite(start) && Number.isFinite(end))
    statistics.durationMs = Math.max(0, end - start);
  return { tools: [...tools.values()], statistics };
}

export function historyRecords(history: unknown): WorkflowRecord[] {
  const ledgers = obj(obj(history).ledgers);
  return Object.entries(ledgers).flatMap(([runId, ledger]) =>
    rows(obj(ledger).items).map((item, index) => ({
      runId,
      cursor: Number(item.cursor) || index + 1,
      record: Object.keys(obj(item.record)).length ? obj(item.record) : item,
    })),
  );
}
