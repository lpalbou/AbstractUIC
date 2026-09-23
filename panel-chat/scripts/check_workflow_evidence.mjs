import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workflowEvidence } from "../dist/workflow_evidence.js";
import { WorkflowSessionController } from "../dist/workflow_runtime.js";
const row = (cursor, record, runId = "root") => ({ runId, cursor, record });
const effect = (calls) => ({
  type: "tool_calls",
  payload: { tool_calls: calls },
});
const call = {
  name: "write_file",
  call_id: "0",
  runtime_call_id: "stable",
  arguments: { file_path: "src/main.ts", content: "safe" },
};
const records = [
  row(1, {
    step_id: "s1",
    status: "started",
    started_at: "2026-09-20T10:00:00Z",
    effect: effect([call]),
  }),
  row(2, { step_id: "s1", status: "waiting", effect: effect([call]) }),
  row(3, {
    step_id: "s2",
    status: "completed",
    ended_at: "2026-09-20T10:00:02Z",
    effect: { type: "tool_calls", payload: { $slim: true } },
    result: { results: [{ ...call, success: true, output: "Written" }] },
  }),
  row(4, {
    step_id: "s3",
    status: "completed",
    effect: effect([
      { ...call, runtime_call_id: "another", name: "read_file" },
    ]),
    result: { results: [{ call_id: "0", success: true, output: "contents" }] },
  }),
  row(5, {
    step_id: "llm",
    status: "completed",
    effect: { type: "llm_call" },
    result: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
  }),
  row(
    1,
    {
      step_id: "llm",
      status: "completed",
      ended_at: "2026-09-20T10:00:05Z",
      effect: { type: "llm_call" },
      result: {
        usage: { input_tokens: 25, output_tokens: 5, total_tokens: 30 },
      },
    },
    "child",
  ),
];
let evidence = workflowEvidence([...records, ...records]);
assert.equal(
  evidence.tools.length,
  2,
  "start/wait/resume share runtime identity; model id 0 does not collapse cycles",
);
assert.equal(evidence.tools[0].output, "Written");
assert.equal(evidence.tools[0].arguments.file_path, "src/main.ts");
// The strict shape is the contract: a field appears ONLY when a record
// reported it. This fixture carries no `gen_time`, `performance` or
// `prompt_cache`, so none of the measured-detail fields may show up here —
// that absence is what proves the chips never invent a zero. `toolBreakdown`
// is unconditional because it is derived from the tool rows themselves.
// 0.1.11 extends it ON PURPOSE: one `modelCalls` row per call (no model,
// provider, cache, TTFT or speculation keys — none were reported), and the
// tool batch timing derived from write_file's own started→completed rows
// (10:00:00 → 10:00:02). That call parked on a decision (status "waiting"),
// so its time is flagged as including the approval wait. read_file's row
// carries no timestamps, so it has no `ms` — not 0.
assert.deepEqual(evidence.statistics, {
  llmCalls: 2,
  toolCalls: 2,
  inputTokens: 125,
  outputTokens: 55,
  totalTokens: 180,
  changedFiles: ["src/main.ts"],
  durationMs: 5000,
  modelCalls: [
    { runId: "root", stepId: "llm", inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    { runId: "child", stepId: "llm", inputTokens: 25, outputTokens: 5, totalTokens: 30 },
  ],
  toolBatches: 1,
  toolTimeMs: 2000,
  toolTimeIncludesApproval: true,
  slowestToolBatch: { ms: 2000, calls: 1, tools: ["write_file"] },
  toolBreakdown: {
    read_file: { calls: 1, failed: 0 },
    write_file: { calls: 1, failed: 0, ms: 2000 },
  },
});
evidence = workflowEvidence([
  row(1, {
    status: "completed",
    effect: effect([
      call,
      { ...call, call_id: "1", runtime_call_id: "second" },
    ]),
    result: {
      results: [{ call_id: "0", success: false, error: "permission denied" }],
    },
  }),
]);
assert.equal(
  evidence.tools[0].status,
  "failed",
  "partial results fall back to unique call id",
);
assert.equal(evidence.tools[0].error, "permission denied");
assert.equal(
  evidence.statistics.changedFiles.length,
  0,
  "failed calls never claim file mutations",
);
evidence = workflowEvidence([
  row(1, {
    status: "completed",
    effect: { type: "llm_call" },
    result: { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 99 } },
  }),
]);
assert.equal(evidence.statistics.totalTokens, 99);
assert.equal(
  evidence.statistics.inputTokens,
  undefined,
  "splitless usage is not reported as zero",
);
// Prefill honesty under a cache restore (operator turn 4105ce55, 2026-09-22).
// mlx-vlm's prompt_tokens_per_second divides the WHOLE prompt (restored
// tokens included) by the prompt time, so 5,899 ÷ 1,813.33 is the measured
// 3.25 s prompt phase — but "1,813 tok/s" is not the speed of anything: only
// 1,803 tokens were computed, at 554 tok/s. The chip must carry that rate.
const measuredTurn = (metadata) =>
  row(1, {
    status: "completed",
    effect: { type: "llm_call" },
    result: {
      usage: { prompt_tokens: 5899, completion_tokens: 184 },
      gen_time: 8830.6,
      metadata,
    },
  });
evidence = workflowEvidence([
  measuredTurn({
    performance: {
      prompt_tokens_per_second: 1813.3318004768453,
      generation_tokens_per_second: 37.47395662368145,
    },
    prompt_cache: { cached_tokens: 4096, fed_tokens: 1803, outcome: "hit_restore" },
  }),
]);
assert.equal(Math.round(evidence.statistics.prefillMs), 3253, "prompt phase = tokens ÷ provider rate");
assert.equal(evidence.statistics.prefillNewTokens, 1803, "new tokens = fed, not the whole prompt");
assert.equal(
  Math.round(evidence.statistics.prefillNewTokensPerSecond),
  554,
  "effective prefill rate is over the tokens actually computed",
);
assert.equal(Math.round(evidence.statistics.promptTokensPerSecond), 1813, "provider rate is kept, labelled");
// A speed WITHOUT a cache split cannot claim an effective rate: absent, not 0.
evidence = workflowEvidence([
  measuredTurn({
    performance: { prompt_tokens_per_second: 1813.33, generation_tokens_per_second: 37.47 },
  }),
]);
assert.equal(Math.round(evidence.statistics.prefillMs), 3253);
assert.equal(evidence.statistics.prefillNewTokens, undefined, "no cache split → no new-token count");
assert.equal(
  evidence.statistics.prefillNewTokensPerSecond,
  undefined,
  "no cache split → no effective rate invented",
);
// A fully restored prompt is a real measurement: 0 new tokens, 0 tok/s.
evidence = workflowEvidence([
  measuredTurn({
    performance: { prompt_tokens_per_second: 20000 },
    prompt_cache: { cached_tokens: 5899, fed_tokens: 0, outcome: "hit_restore" },
  }),
]);
assert.equal(evidence.statistics.prefillNewTokens, 0);
assert.equal(evidence.statistics.prefillNewTokensPerSecond, 0);

// ---------------------------------------------------------------------------
// REAL LEDGER FIXTURES (panel-chat 0.1.11). Trimmed rows of the operator's
// runs (scripts/fixtures, extracted by untracked/missionF/extract_fixture.py):
//   run_8d2ce83f — the screenshot turn: 1 call, warm cache (hit_restore),
//                  native MTP, TTFT from abstract.progress, no tools.
//   run_081d8daa — 4 calls (cold, hit_restore, cold, cold), 3 approval-gated
//                  tool batches (web_search ×3, fetch_url ×5 with 4 failures,
//                  fetch_url ×5).
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
{
  const s = workflowEvidence(fixture("run_8d2ce83f")).statistics;
  assert.equal(s.totalTokens, 6419);
  assert.equal(s.modelCalls.length, 1, "one row per completed model call");
  const [c] = s.modelCalls;
  assert.equal(c.ttftMs, 2144, "TTFT comes from the abstract.progress ttft_s of the SAME step");
  assert.equal(c.promptSource, "ttft");
  assert.equal(c.promptMs, 2144, "measured TTFT wins over the 1,277 ms rate quotient");
  assert.equal(Math.round(c.promptNewTokensPerSecond), 190, "408 fed tokens ÷ 2.144 s");
  assert.equal(c.generationMs, 14587 - 2144, "generation = gen_time − TTFT");
  assert.equal(Math.round(s.generationPhaseTokensPerSecond), 34);
  assert.equal(c.cachedTokens, 5588);
  assert.equal(c.fedTokens, 408);
  assert.equal(c.cacheOutcome, "hit_restore");
  assert.equal(c.cacheBackend, "mlx_vlm_apc");
  assert.equal(c.model, "Jundot/Qwen3.8-Flash-Next-oQ4e-mtp");
  assert.equal(c.provider, "mlx");
  assert.deepEqual(s.speculation, {
    calls: 1,
    used: 1,
    modes: ["native_mtp"],
    draftKinds: ["mtp"],
    acceptedTokens: 220,
    draftedTokens: 408,
    rounds: 204,
    draftLengths: [2],
    acceptanceRate: 220 / 408,
  });
  assert.equal(s.durationMs, 15942, "wall clock spans the parent and its child runs");
  assert.equal(s.toolTimeMs, undefined, "no tools → no tool time (absent, not 0)");
  assert.equal(s.reasoningTokens, undefined, "usage carried no reasoning count → absent");
  // Existing field semantics are unchanged for other consumers.
  assert.equal(Math.round(s.prefillMs), 1277, "prefillMs keeps its rate-quotient meaning");
  assert.equal(Math.round(s.prefillNewTokensPerSecond), 319);
}
{
  const s = workflowEvidence(fixture("run_081d8daa")).statistics;
  assert.equal(s.llmCalls, 4);
  assert.deepEqual(
    s.modelCalls.map((c) => [c.inputTokens, c.cachedTokens, c.fedTokens, c.outputTokens, c.cacheOutcome]),
    [
      [7016, 0, 7016, 205, "cold"],
      [10566, 7015, 3551, 553, "hit_restore"],
      [13139, 0, 13139, 424, "cold"],
      [15497, 0, 15497, 1665, "cold"],
    ],
    "per-call rows in start order",
  );
  assert.deepEqual(s.modelCalls.map((c) => c.ttftMs), [11323, 13259, 29537, 37371]);
  assert.equal(s.ttftCalls, 4);
  assert.equal(s.promptPhaseMs, 91490);
  assert.equal(s.speculation.acceptedTokens, 1638);
  assert.equal(s.speculation.draftedTokens, 2418);
  assert.equal(s.toolCalls, 13);
  assert.equal(s.toolsFailed, 4);
  assert.equal(s.toolBatches, 3, "calls issued together share one timing");
  assert.equal(s.toolTimeMs, 2399 + 2829 + 1868);
  assert.equal(s.toolTimeIncludesApproval, true, "every batch waited on approval");
  assert.deepEqual(s.slowestToolBatch, { ms: 2829, calls: 5, tools: ["fetch_url"] });
  assert.deepEqual(s.toolBreakdown, {
    web_search: { calls: 3, failed: 0, ms: 2399 },
    fetch_url: { calls: 10, failed: 4, ms: 2829 + 1868, errors: { empty_content: 2, bot_challenge: 2 } },
  });
}
// A batch that mixes tools cannot be split: no per-tool ms, a shared count.
{
  const s = workflowEvidence([
    row(1, {
      step_id: "mix",
      status: "completed",
      started_at: "2026-09-20T10:00:00Z",
      ended_at: "2026-09-20T10:00:03Z",
      effect: effect([
        { name: "read_file", call_id: "0", runtime_call_id: "a" },
        { name: "list_files", call_id: "1", runtime_call_id: "b" },
      ]),
      result: {
        results: [
          { runtime_call_id: "a", success: true, output: "x" },
          { runtime_call_id: "b", success: false, error: "boom", output: '{"error_class":"not_found"}' },
        ],
      },
    }),
  ]).statistics;
  assert.deepEqual(s.toolBreakdown, {
    read_file: { calls: 1, failed: 0, sharedBatches: 1 },
    list_files: { calls: 1, failed: 1, sharedBatches: 1, errors: { not_found: 1 } },
  });
  assert.equal(s.toolTimeMs, 3000);
  assert.equal(s.toolTimeIncludesApproval, undefined, "an ungated batch is not flagged");
}
// Without a progress event the prompt phase falls back to the rate quotient,
// labelled as such; reasoning tokens are folded when the usage carries them.
{
  const s = workflowEvidence([
    row(1, {
      step_id: "x",
      status: "completed",
      effect: { type: "llm_call" },
      result: {
        usage: { prompt_tokens: 1000, completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 40 } },
        gen_time: 5000,
        metadata: { performance: { prompt_tokens_per_second: 500, generation_tokens_per_second: 25 } },
      },
    }),
  ]).statistics;
  const [c] = s.modelCalls;
  assert.equal(c.promptSource, "rate");
  assert.equal(c.promptMs, 2000);
  assert.equal(c.ttftMs, undefined, "no TTFT event → no TTFT invented");
  assert.equal(s.ttftCalls, undefined);
  assert.equal(c.generationMs, 4000, "output ÷ provider generation rate");
  assert.equal(c.promptNewTokensPerSecond, undefined, "no cache split → no new-token rate");
  assert.equal(s.reasoningTokens, 40);
  assert.equal(s.speculation, undefined);
}
const controller = new WorkflowSessionController({
  getRun: async () => ({ run_id: "root", status: "completed", output: "Done" }),
  getHistory: async () => ({
    ledgers: {
      root: {
        items: [
          ...records.filter((item) => item.runId === "root"),
          row(6, {
            status: "completed",
            effect: { type: "answer_user" },
            result: { message: "Done" },
          }),
        ],
      },
      child: { items: records.filter((item) => item.runId === "child") },
    },
  }),
  getLedger: async () => ({ items: [] }),
  streamLedger: async () => {},
  submitCommand: async () => ({}),
});
await controller.load("root");
const messages = controller.getSnapshot().messages;
assert.equal(
  messages.filter((message) => message.content === "Done").length,
  1,
  "answer_user promotes to final without duplicate",
);
assert.equal(
  messages.find((message) => message.id === "final:root").statistics
    .totalTokens,
  180,
);
controller.dispose();
console.log(
  "workflow evidence: tool lifecycle, partial failure, replay, child usage, final dedupe OK",
);
