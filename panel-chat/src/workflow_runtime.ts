/**
 * Transport-injected durable workflow session state.
 *
 * This deliberately knows ledger shapes, but not HTTP, gateway URLs, cookies,
 * or React presentation.  Hosts supply those through WorkflowTransport.
 */
import type { ChatMessage } from "./chat_message_card.js";
import { foldWorkflowTools, workflowEvidence, historyRecords, type WorkflowToolActivity } from "./workflow_evidence.js";
import { describeStreamUnavailable, isLlmDeltaEnd, validateLlmDeltaEvent, type LlmDelta, type LlmDeltaEnd } from "./llm_delta.js";

export type ServerRecord = Record<string, unknown>;

export type WorkflowRecord = { cursor: number; record: ServerRecord; runId: string };

export type GatewayCommand = {
  command_id: string;
  run_id: string;
  type: string;
  payload: Record<string, unknown>;
  client_id?: string;
};

export type WorkflowTransport = {
  getRun(runId: string, signal?: AbortSignal): Promise<ServerRecord>;
  /** Usually a RunHistoryBundle.  Other observer-shaped history values are tolerated. */
  getHistory(runId: string, signal?: AbortSignal): Promise<unknown>;
  getLedger(runId: string, after: number, signal?: AbortSignal): Promise<unknown>;
  /**
   * Resolve when the source closes; call onStep in strictly received order.
   * `onOpen` is optional for existing transports. Invoke it only after the
   * stream response is genuinely usable, never as an auth/connect intent.
   *
   * `onDelta` is optional (transports written before live replies keep
   * working; the chat then shows each reply when it is complete). A transport
   * that supports live replies dispatches every SSE frame named `llm.delta`
   * or `llm.delta_end` to `onDelta` with its parsed `data:` payload
   * (`llmDeltaFromSse(event, data)` does the name check and validation) and
   * never to `onStep`. Those frames carry no `id:` and must not move the
   * ledger cursor or the `Last-Event-ID` used to reconnect.
   */
  streamLedger(runId: string, after: number, onStep: (item: unknown) => void, signal: AbortSignal, onOpen?: () => void, onDelta?: (event: LlmDelta | LlmDeltaEnd) => void): Promise<void>;
  submitCommand(command: GatewayCommand, signal?: AbortSignal): Promise<unknown>;
};

/** Raw runtime wait; presentation code may map this to its own UI union. */
export type WorkflowWaitInteraction = {
  runId: string;
  wait: ServerRecord;
  stepId?: string;
};
export type WorkflowApprovalTarget = { runId: string; waitKey: string; stepId?: string };
export type WorkflowToolApprovalPolicy = { enabledTools: readonly string[]; autoApproveTools: readonly string[] };

export type WorkflowConnection = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

export type WorkflowSessionSnapshot = {
  messages: ChatMessage[];
  records: WorkflowRecord[];
  run: ServerRecord | null;
  interaction: WorkflowWaitInteraction | null;
  /** Authoritative root-run lifecycle from GET /runs/{id}; never inferred
   * from an individual completed ledger step. */
  status: string;
  /** Optional human-facing status emitted by `abstract.status` events. */
  displayStatus: string;
  loading: boolean;
  error: string | null;
  connection: WorkflowConnection;
  /** Browser/controller-local consent only; never persisted or a policy bypass. */
  autoApproveTools?: boolean;
  /**
   * True when `interaction` is a tool approval this controller has already
   * approved (automatically under the standing permission, or an accepted
   * Allow), or will approve in this same update. The raw wait is kept for
   * command routing, but it is running work, not a question: hosts must not
   * render an approval card or "Approval needed" for it (see
   * `workflowPendingInteraction`). Never true for questions, event waits,
   * denials, or batches outside the current permission.
   */
  toolApprovalGranted?: boolean;
  /**
   * Where a Stop stands, from LEDGER EVIDENCE only (never a browser timer):
   * `stopping` from the moment this client asks until the gateway proves the
   * model call ended; `stopped` once the root run is cancelled and no
   * `llm_call` step of the tree is still open (every started step has a
   * terminal record — the runtime writes `cancelled` with `cancelled_by`);
   * `forced` when the gateway's kill switch wrote its `abstract.status`
   * record (`killed_by: "kill_switch"`), whose text is the label.
   * Null when this client never asked to stop and nothing was forced.
   */
  stop?: WorkflowStopState | null;
};

export type WorkflowStopPhase = "stopping" | "stopped" | "forced";
export type WorkflowStopState = { phase: WorkflowStopPhase; label: string; record?: ServerRecord };

/** The wait a host should present as a question, or null. A tool approval
 * this client has already granted is presented as running tools instead. */
export function workflowPendingInteraction(snapshot: Pick<WorkflowSessionSnapshot, "interaction" | "toolApprovalGranted">): WorkflowWaitInteraction | null {
  return snapshot.toolApprovalGranted ? null : snapshot.interaction;
}

type Subscriber = () => void;

/** One model reply being streamed, keyed by `${runId}:${callId}`. Sequence
 * numbers are tracked per channel; -1 means nothing received yet. `via` is
 * the run whose stream delivered it (a root stream also carries sub-runs). */
type LiveReply = {
  runId: string;
  callId: string;
  nodeId: string;
  via: string;
  text: string;
  reasoning: string;
  seq: { content: number; reasoning: number };
};

export type WorkflowSessionControllerOptions = {
  onAuthError?: (error: unknown) => void;
  clientId?: string;
  /**
   * Minimum time between two re-renders of live (streamed) reply text, in
   * milliseconds. Default 60: every frame still updates the reply state, but
   * the transcript (and its Markdown) is re-rendered at most this often; the
   * latest text is always rendered at the end of the interval. 0 renders every
   * frame.
   */
  liveRenderIntervalMs?: number;
};

const EMPTY: WorkflowSessionSnapshot = {
  messages: [], records: [], run: null, interaction: null,
  status: "idle", displayStatus: "", loading: false, error: null, connection: "idle", toolApprovalGranted: false, stop: null,
};

function object(value: unknown): ServerRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ServerRecord : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function statusOf(run: ServerRecord | null): string {
  return text(run?.status).toLowerCase() || "unknown";
}

function terminal(status: string): boolean {
  return ["completed", "failed", "cancelled"].includes(status.toLowerCase());
}

function authError(error: unknown): boolean {
  const value = object(error);
  const status = Number(value?.status ?? value?.statusCode);
  return status === 401 || status === 403;
}

function statusCode(error: unknown): number {
  const value = object(error);
  return Number(value?.status ?? value?.statusCode);
}

function stablePayload(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    const row = object(item);
    if (!row) return item;
    const out: ServerRecord = {};
    for (const key of Object.keys(row).sort()) out[key] = normalize(row[key]);
    return out;
  };
  try { return JSON.stringify(normalize(value)); } catch { return "[unserializable]"; }
}

function messageText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const obj = object(value);
  if (!obj) return "";
  for (const key of ["answer", "response", "message", "text", "content", "output"]) {
    const candidate = obj[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function displayValue(value: unknown): string {
  const plain = messageText(value);
  if (plain) return plain;
  const obj = object(value);
  if (!obj && !Array.isArray(value)) return "";
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}

/** Extract only a gateway-supplied user prompt from public input/history. */
function promptFromInput(input: ServerRecord | null): string {
  if (!input) return "";
  for (const key of ["prompt", "request", "task", "message", "query", "input"]) {
    const value = text(input[key]);
    if (value) return value;
  }
  const context = object(input.context);
  for (const key of ["task", "message"]) {
    const value = text(context?.[key]);
    if (value) return value;
  }
  const messages = array(context?.messages);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = object(messages[index]);
    if (text(message?.role).toLowerCase() !== "user") continue;
    const value = text(message?.content);
    if (value) return value;
  }
  return "";
}

function waitFromRecord(record: ServerRecord): ServerRecord | null {
  const result = object(record.result);
  return object(result?.wait);
}

function effect(record: ServerRecord): ServerRecord { return object(record.effect) || {}; }

function runIdFrom(record: ServerRecord, fallback: string): string {
  return text(record.run_id) || fallback;
}

function recordTimestamp(record: ServerRecord): string | undefined {
  return text(record.ended_at) || text(record.started_at) || undefined;
}

function subRunIds(record: ServerRecord): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => { const id = text(value); if (id) out.add(id); };
  const result = object(record.result);
  add(result?.sub_run_id); add(result?.subRunId); add(result?.child_run_id);
  const eff = effect(record); const payload = object(eff.payload);
  if (text(eff.type) === "start_subworkflow") { add(payload?.sub_run_id); add(payload?.subRunId); add(payload?.child_run_id); }
  const wait = waitFromRecord(record);
  const details = object(wait?.details);
  add(details?.sub_run_id); add(details?.subRunId); add(details?.child_run_id);
  const key = text(wait?.wait_key);
  if (key.startsWith("subworkflow:")) add(key.slice("subworkflow:".length));
  return [...out];
}

/** Pure, small state controller usable by browser, desktop, or test harnesses. */
export class WorkflowSessionController {
  private snapshot: WorkflowSessionSnapshot = { ...EMPTY };
  private subscribers = new Set<Subscriber>();
  private controller: AbortController | null = null;
  private generation = 0;
  private rootRunId = "";
  private cursors = new Map<string, number>();
  private seenRecords = new Set<string>();
  private seenMessages = new Set<string>();
  private watchedRuns = new Set<string>();
  private childCatchUpAttempts = new Map<string, number>();
  private runStates = new Map<string, ServerRecord>();
  /** Authoritative terminal snapshots for historical session roots only. */
  private historicalRuns = new Map<string, ServerRecord | null>();
  private historicalRunFailures = new Map<string, { missing: boolean; detail: string }>();
  private commandIds = new Map<string, string>();
  private toolActivities = new Map<string, WorkflowToolActivity>();
  private historicalEvidence = new Map<string, ReturnType<typeof workflowEvidence>>();
  private approvedWaits = new Set<string>();
  /** Tool-approval occurrences this client has sent `approved: true` for
   * (automatic: at dispatch; manual: after acknowledgement). */
  private grantedToolWaits = new Set<string>();
  private approvalEpoch = 0;
  private toolApprovalPolicy: WorkflowToolApprovalPolicy | null = null;
  private toolApprovalSuspended = false;
  private toolApprovalStopped = false;
  private displayStatusAt = -Infinity;
  /** Stop evidence (see `WorkflowSessionSnapshot.stop`). */
  private stopRequested = false;
  private stopFollowing = false;
  private openLlmSteps = new Set<string>();
  private forcedStop: ServerRecord | null = null;
  /** Live (streamed) replies still open, keyed by `${runId}:${callId}`. */
  private liveReplies = new Map<string, LiveReply>();
  /** Calls whose live reply has ended (delta_end, terminal llm_call record,
   * or the run's assistant message): later deltas for them are ignored. */
  private closedLiveCalls = new Set<string>();
  private liveDirty = new Set<string>();
  private liveRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLiveRender = -Infinity;
  private readonly liveRenderIntervalMs: number;

  public constructor(private readonly transport: WorkflowTransport, private readonly options: WorkflowSessionControllerOptions = {}) {
    const interval = options.liveRenderIntervalMs ?? 60;
    if (typeof interval !== "number" || !Number.isFinite(interval) || interval < 0) throw new Error(`liveRenderIntervalMs must be a non-negative number of milliseconds, got ${JSON.stringify(options.liveRenderIntervalMs)}`);
    this.liveRenderIntervalMs = interval;
  }

  subscribe(listener: Subscriber): () => void { this.subscribers.add(listener); return () => this.subscribers.delete(listener); }
  getSnapshot(): WorkflowSessionSnapshot { return this.snapshot; }

  reset(): void {
    this.toolApprovalSuspended = false;
    this.toolApprovalStopped = false;
    this.approvalEpoch += 1;
    this.displayStatusAt = -Infinity;
    this.stopRequested = false; this.stopFollowing = false; this.openLlmSteps.clear(); this.forcedStop = null;
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.rootRunId = ""; this.cursors.clear(); this.seenRecords.clear(); this.seenMessages.clear(); this.watchedRuns.clear(); this.childCatchUpAttempts.clear(); this.runStates.clear(); this.historicalRuns.clear(); this.historicalRunFailures.clear(); this.commandIds.clear();
    this.toolActivities.clear(); this.historicalEvidence.clear(); this.approvedWaits.clear(); this.grantedToolWaits.clear();
    this.liveReplies.clear(); this.closedLiveCalls.clear(); this.liveDirty.clear(); this.lastLiveRender = -Infinity;
    if (this.liveRenderTimer) { clearTimeout(this.liveRenderTimer); this.liveRenderTimer = null; }
    this.set({ ...EMPTY });
  }

  dispose(): void { this.reset(); this.subscribers.clear(); }

  async load(runId: string): Promise<void> {
    const id = text(runId);
    this.reset();
    if (!id) return;
    const generation = ++this.generation;
    const abort = new AbortController();
    this.controller = abort;
    this.rootRunId = id;
    this.set({ ...this.snapshot, loading: true, status: "loading", error: null, connection: "connecting" });
    try {
      const [run, history] = await Promise.all([this.transport.getRun(id, abort.signal), this.transport.getHistory(id, abort.signal)]);
      if (!this.live(generation)) return;
      const liveRun = object(run);
      const currentWait = object(liveRun?.waiting);
      const runStatus = statusOf(liveRun);
      // History is chronological transcript evidence. Fold it before the
      // authoritative terminal root snapshot, whose final output belongs at
      // the end even when GET /runs wins the initial request race.
      await this.ingestHistory(history, id, generation);
      if (!this.live(generation)) return;
      this.set({
        ...this.snapshot,
        run: liveRun,
        status: runStatus,
        loading: false,
        ...(currentWait && !terminal(runStatus) ? { interaction: { runId: id, wait: currentWait, ...(this.snapshot.interaction?.runId === id && text(this.snapshot.interaction.wait.wait_key) === text(currentWait.wait_key) ? { stepId: this.snapshot.interaction.stepId } : {}) } } : {}),
      });
      if (liveRun) this.updateRunState(id, liveRun);
      if (currentWait) for (const child of subRunIds({ result: { wait: currentWait } })) if (child !== id) void this.catchUpAndWatch(child, generation);
      await this.catchUpAndWatch(id, generation);
      // Ledger streams intentionally stay open while a workflow is parked.
      // Gateway lifecycle commands (pause/resume/cancel) can update only the
      // root-run metadata, so an SSE message is not guaranteed to follow.
      // Keep that authority fresh without making client intent look applied.
      void this.pollRootLifecycle(id, generation);
    } catch (error) {
      if (!abort.signal.aborted && this.live(generation)) this.fail(error);
    }
  }

  async sendCommand(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    // Stop consent immediately on user cancellation intent, even while the
    // Gateway is still converging to its authoritative terminal snapshot.
    if (type === "cancel") {
      this.toolApprovalStopped = true; this.revokeToolApproval();
      // "Stopping…" is this client's own request; only ledger evidence moves
      // it on to stopped/forced (recomputeStop).
      this.stopRequested = true; this.recomputeStop();
    }
    // A response/event may address a parked child.  Lifecycle control always
    // belongs to the session root, otherwise cancelling a parent leaves the
    // actual conversation alive behind a subworkflow wait.
    const resumeWaitKey = text(payload.wait_key);
    // A resume attached to a concrete wait follows that interaction, which
    // can belong to a child run. A lifecycle resume without a wait_key must
    // control the root run, even while an unrelated child is waiting.
    const runId = type === "resume"
      ? (resumeWaitKey ? this.interactionRunId() || this.rootRunId : this.rootRunId)
      : type === "emit_event" ? this.interactionRunId() || this.rootRunId : this.rootRunId;
    if (!runId) throw new Error("No workflow run is loaded");
    // A loop may reuse the same wait_key in a new ledger step before the old
    // acknowledgement arrives. Retry identity belongs to the occurrence.
    const occurrence = type === "resume" && resumeWaitKey ? this.snapshot.interaction?.stepId || "" : "";
    const stable = `${runId}\u0000${type}\u0000${occurrence}\u0000${stablePayload(payload)}`;
    let commandId = this.commandIds.get(stable);
    if (!commandId) { commandId = this.newCommandId(); this.commandIds.set(stable, commandId); }
    const generation = this.generation;
    const signal = this.controller?.signal;
    try {
      const response = await this.transport.submitCommand({ command_id: commandId, run_id: runId, type, payload, ...(this.options.clientId ? { client_id: this.options.clientId } : {}) }, signal);
      // A delayed command completion for a reset, replaced run, or switched
      // auth scope belongs to that old controller generation. It can still be
      // returned to the caller, but must not alter current dedupe/lifecycle UI.
      if (!this.live(generation)) return response;
      const body = object(response);
      if (body && body.accepted === false) {
        // A refused cancel stopped nothing: never leave "Stopping…" behind it.
        if (type === "cancel") { this.stopRequested = false; this.recomputeStop(); }
        throw new Error(text(body.detail) || "Gateway did not accept the command");
      }
      // A completed acknowledgement has made this command durable. Retrying
      // a later, identical lifecycle action must create a fresh intent; only
      // ambiguous failures keep their command id for safe retry.
      this.commandIds.delete(stable);
      // Do not optimistically mutate the lifecycle. An acknowledgement only
      // authorizes a command; the authoritative GET may still say waiting.
      // This refresh shortens pause/cancel convergence while the bounded poll
      // below covers gateways that commit metadata after acknowledging.
      if (runId === this.rootRunId && ["pause", "resume", "cancel"].includes(type)) void this.refreshRunState(runId, generation);
      return response;
    } catch (error) {
      if (this.live(generation)) this.fail(error, false);
      throw error;
    }
  }

  resume(response: string): Promise<unknown> {
    const interaction = this.requireInteraction();
    return this.sendCommand("resume", { wait_key: text(interaction.wait.wait_key), payload: { response } });
  }

  approve(approved: boolean, target?: WorkflowApprovalTarget): Promise<unknown> {
    const interaction = this.requireInteraction();
    if (terminal(this.snapshot.status)) throw new Error("This run has already ended.");
    if (target && (interaction.runId !== target.runId || text(interaction.wait.wait_key) !== target.waitKey || (target.stepId !== undefined && interaction.stepId !== target.stepId))) throw new Error("This approval request has changed. Review the current request before deciding.");
    if (approved && this.toolApprovalPolicy && !this.toolCallsMatch(interaction, this.toolApprovalPolicy.enabledTools)) throw new Error("This request includes an unavailable or unselected tool. It cannot be authorized. Deny this request or stop the run and change Tools settings.");
    const generation = this.generation;
    return this.sendCommand("resume", { wait_key: text(interaction.wait.wait_key), payload: { approved: Boolean(approved) } }).then(result => {
      if (!this.live(generation)) return result;
      const key = this.occurrenceKey(interaction);
      this.approvedWaits.add(key);
      // An accepted Allow is a decision already made: the batch is running
      // work from here on, not a question, until its ledger resume lands.
      if (approved && this.isToolApproval(interaction) && !this.grantedToolWaits.has(key)) {
        this.grantedToolWaits.add(key);
        this.set({ ...this.snapshot });
      }
      return result;
    });
  }

  async approveWithPolicyChange(target: WorkflowApprovalTarget, onApproved: () => void): Promise<void> {
    const generation = this.generation;
    const epoch = this.approvalEpoch;
    if (!this.isToolApproval(this.requireInteraction())) throw new Error("This is not a tool approval request.");
    await this.approve(true, target);
    // Consent belongs to the identity/run that displayed the request. Stop,
    // revocation, a policy edit or auth reset wins over a delayed response.
    if (!this.live(generation) || epoch !== this.approvalEpoch || this.toolApprovalStopped || terminal(this.snapshot.status)) return;
    onApproved();
  }

  async allowAllToolsForRun(target: WorkflowApprovalTarget): Promise<void> {
    const generation = this.generation;
    const epoch = this.approvalEpoch;
    const interaction = this.requireInteraction();
    if (!this.isToolApproval(interaction)) throw new Error("This is not a tool approval request.");
    await this.approve(true, target);
    if (!this.live(generation) || epoch !== this.approvalEpoch || terminal(this.snapshot.status)) return;
    this.approvedWaits.add(`${target.runId}:${target.waitKey}${interaction.stepId ? `:${interaction.stepId}` : ""}`);
    this.set({ ...this.snapshot, autoApproveTools: true });
  }

  revokeToolApproval(): void { this.approvalEpoch += 1; this.toolApprovalSuspended = true; this.set({ ...this.snapshot, autoApproveTools: false }); }

  /** Host-owned persistent permissions, intersected with current availability.
   * This is configuration, not a blanket grant and cannot enable a tool. */
  setToolApprovalPolicy(policy: WorkflowToolApprovalPolicy | null): void {
    if (stablePayload(policy) === stablePayload(this.toolApprovalPolicy)) return;
    this.approvalEpoch += 1;
    this.toolApprovalSuspended = false;
    this.toolApprovalPolicy = policy ? { enabledTools: [...policy.enabledTools], autoApproveTools: [...policy.autoApproveTools] } : null;
    // Re-present the current wait under the new policy (and approve it when
    // it is now covered: `set` runs the automatic approver last).
    this.set({ ...this.snapshot });
  }

  private occurrenceKey(interaction: WorkflowWaitInteraction): string {
    return `${interaction.runId}:${text(interaction.wait.wait_key)}${interaction.stepId ? `:${interaction.stepId}` : ""}`;
  }

  /** Whether the automatic approver answers `interaction` in `snapshot`
   * (ignoring its own once-per-occurrence dedupe). Single source for both
   * the approver and the presentation flag, so they cannot disagree. */
  private coveredByStandingPermission(snapshot: WorkflowSessionSnapshot, interaction: WorkflowWaitInteraction | null): interaction is WorkflowWaitInteraction {
    if (snapshot.loading || this.toolApprovalStopped || this.toolApprovalSuspended || (!this.toolApprovalPolicy && !snapshot.autoApproveTools) || terminal(snapshot.status) || snapshot.run?.paused === true || snapshot.status === "paused" || !interaction || !this.isToolApproval(interaction)) return false;
    if (this.toolApprovalPolicy && (!this.toolCallsMatch(interaction, this.toolApprovalPolicy.enabledTools) || !this.toolCallsMatch(interaction, this.toolApprovalPolicy.autoApproveTools))) return false;
    return Boolean(text(interaction.wait.wait_key));
  }

  /** Presentation of a controller snapshot: a granted tool approval shows
   * its calls as running, never as "need approval". Raw statuses stay in
   * `toolActivities`, so a failed automatic approval reverts exactly. */
  private present(next: WorkflowSessionSnapshot): WorkflowSessionSnapshot {
    const interaction = next.interaction;
    // Granted = approval already sent, or about to be sent by the automatic
    // approver in this very update (covered and not yet attempted). A failed
    // or denied attempt is in approvedWaits but not grantedToolWaits.
    // While a run is still loading, the approver deliberately waits for the
    // authoritative current wait; the same covered batch is approved as soon
    // as loading ends, so it is presented as running meanwhile, not a card.
    const key = interaction ? this.occurrenceKey(interaction) : "";
    const granted = Boolean(interaction && this.isToolApproval(interaction) && (this.grantedToolWaits.has(key) || (!this.approvedWaits.has(key) && this.coveredByStandingPermission({ ...next, loading: false }, interaction))));
    if (!granted && !this.snapshot.toolApprovalGranted && !next.toolApprovalGranted) return next.toolApprovalGranted === false ? next : { ...next, toolApprovalGranted: false };
    let changed = false;
    const messages = next.messages.map((message) => {
      const tool = message.toolActivity;
      if (!tool || this.toolActivities.get(tool.id)?.status !== "waiting") return message;
      const status = granted && tool.runId === interaction?.runId ? "running" : "waiting";
      if (tool.status === status) return message;
      changed = true;
      return this.toolMessage({ ...tool, status });
    });
    return { ...next, toolApprovalGranted: granted, ...(changed ? { messages } : {}) };
  }

  private toolCallsMatch(interaction: WorkflowWaitInteraction, names: readonly string[]): boolean {
    const calls = array(object(interaction.wait.details)?.tool_calls);
    return calls.length > 0 && calls.every(call => {
      const name = text(object(call)?.name);
      return Boolean(name) && names.includes(name);
    });
  }

  private isToolApproval(interaction: WorkflowWaitInteraction): boolean {
    const details = object(interaction.wait.details);
    return details?.mode === "approval_required" || details?.kind === "tool_approval";
  }

  private autoApproveCurrentWait(): void {
    const interaction = this.snapshot.interaction;
    if (!this.coveredByStandingPermission(this.snapshot, interaction)) return;
    const target = { runId: interaction.runId, waitKey: text(interaction.wait.wait_key), stepId: interaction.stepId };
    const key = this.occurrenceKey(interaction);
    if (this.approvedWaits.has(key)) return;
    this.approvedWaits.add(key);
    // Committed from this point: the approval command is dispatched below.
    // Revocation after dispatch cannot recall it, so the batch stays running.
    this.grantedToolWaits.add(key);
    const generation = this.generation;
    const epoch = this.approvalEpoch;
    void this.approve(true, target).catch(error => {
      if (!this.live(generation)) return;
      // Nothing was granted: the batch is a question again (card returns).
      this.grantedToolWaits.delete(key);
      if (epoch !== this.approvalEpoch) { this.set({ ...this.snapshot }); return; }
      this.toolApprovalSuspended = true;
      this.set({ ...this.snapshot, autoApproveTools: false });
      this.fail(error, false);
    });
  }

  emitEvent(payload: Record<string, unknown>): Promise<unknown> { return this.sendCommand("emit_event", payload); }
  cancel(): Promise<unknown> { return this.sendCommand("cancel", {}); }

  private requireInteraction(): WorkflowWaitInteraction {
    if (!this.snapshot.interaction) throw new Error("This workflow is not waiting for input");
    if (!text(this.snapshot.interaction.wait.wait_key)) throw new Error("The workflow wait has no wait_key");
    return this.snapshot.interaction;
  }

  private interactionRunId(): string { return this.snapshot.interaction?.runId || ""; }
  private live(generation: number): boolean { return generation === this.generation && !this.controller?.signal.aborted; }
  private set(snapshot: WorkflowSessionSnapshot): void {
    this.snapshot = this.present(snapshot);
    for (const listener of this.subscribers) listener();
    this.autoApproveCurrentWait();
  }

  private async catchUpAndWatch(runId: string, generation: number): Promise<void> {
    if (!this.live(generation) || this.watchedRuns.has(runId)) return;
    this.watchedRuns.add(runId);
    try {
      if (runId !== this.rootRunId) {
        try {
          const run = object(await this.transport.getRun(runId, this.controller?.signal));
          if (!this.live(generation)) return;
          if (run) this.updateRunState(runId, run);
        } catch (error) {
          if (!this.live(generation)) return;
          if (authError(error)) throw error;
          // Ledger replay can still reveal a child while its snapshot store
          // catches up, but never hide failed reads from the host.
          this.fail(error, false);
        }
      }
      await this.catchUp(runId, generation);
      if (!this.live(generation) || terminal(statusOf(this.runStates.get(runId) || null))) return;
      this.childCatchUpAttempts.delete(runId);
      void this.watch(runId, generation);
    } catch (error) {
      if (!this.live(generation)) return;
      // A child discovery can arrive before its ledger becomes readable. Do
      // not leave a permanent watched marker or an unhandled void rejection:
      // expose the transient error and retry a bounded number of times.
      this.watchedRuns.delete(runId);
      if (runId === this.rootRunId) throw error;
      if (authError(error)) { this.fail(error); return; }
      const attempts = (this.childCatchUpAttempts.get(runId) || 0) + 1;
      this.childCatchUpAttempts.set(runId, attempts);
      this.fail(error, false);
      if (attempts >= 5) return;
      await this.waitForRetry(Math.min(2000, 150 * 2 ** (attempts - 1)));
      if (this.live(generation)) void this.catchUpAndWatch(runId, generation);
    }
  }

  private async catchUp(runId: string, generation: number): Promise<void> {
    for (let page = 0; page < 100 && this.live(generation); page += 1) {
      const after = this.cursors.get(runId) || 0;
      const pageValue = await this.transport.getLedger(runId, after, this.controller?.signal);
      // Aborting HTTP is best-effort: transports may already have resolved a
      // buffered response. Check again before mutating the active session.
      if (!this.live(generation)) return;
      const pageObj = object(pageValue);
      const items = Array.isArray(pageValue) ? pageValue : array(pageObj?.items);
      for (const item of items) this.ingestItem(runId, item);
      const next = Number(pageObj?.next_after);
      if (!items.length || !Number.isFinite(next) || next <= after) break;
      this.cursors.set(runId, next);
    }
  }

  /** Follow one run's stream until it ends or this controller stops
   * following it; either way no live reply that stream delivered survives. */
  private async watch(runId: string, generation: number): Promise<void> {
    try {
      await this.followStream(runId, generation);
    } finally {
      if (this.live(generation)) this.closeLiveRepliesVia(runId);
    }
  }

  private async followStream(runId: string, generation: number): Promise<void> {
    let attempt = 0;
    while (this.live(generation) && !terminal(statusOf(this.runStates.get(runId) || null))) {
      const after = this.cursors.get(runId) || 0;
      this.set({ ...this.snapshot, connection: attempt ? "reconnecting" : "connecting" });
      try {
        let streamConnected = false;
        const markStreamConnected = () => {
          if (!this.live(generation) || streamConnected) return;
          streamConnected = true;
          // Polling is only lifecycle convergence. A usable SSE response or
          // received ledger item is the evidence this actual stream healed.
          this.set({ ...this.snapshot, connection: "connected", error: null });
        };
        // Every (re)connect starts from the gateway's snapshots: drop the live
        // text this stream delivered before, so nothing is shown twice.
        this.dropLiveRepliesVia(runId);
        await this.transport.streamLedger(runId, after, (item) => {
          if (!this.live(generation)) return;
          markStreamConnected();
          this.ingestItem(runId, item);
        }, this.controller!.signal, markStreamConnected, (event) => {
          if (!this.live(generation)) return;
          markStreamConnected();
          this.ingestDelta(runId, event);
        });
        if (!this.live(generation)) return;
        await this.catchUp(runId, generation);
        if (!this.live(generation)) return;
        const run = object(await this.transport.getRun(runId, this.controller?.signal));
        if (!this.live(generation)) return;
        if (run) this.updateRunState(runId, run);
        attempt += 1;
      } catch (error) {
        if (!this.live(generation)) return;
        attempt += 1;
        this.fail(error, false);
        // An auth switch cannot heal by retrying the same credentials. The
        // host receives the error and recreates the controller with a new
        // non-secret authScopeKey when the principal changes.
        if (authError(error)) {
          this.set({ ...this.snapshot, connection: "disconnected" });
          return;
        }
      }
      if (attempt >= 5 || !this.live(generation)) break;
      await this.waitForRetry(Math.min(2000, 150 * 2 ** (attempt - 1)));
    }
    if (!this.live(generation)) return;
    if (terminal(statusOf(this.runStates.get(runId) || null))) {
      this.set({ ...this.snapshot, connection: "disconnected" });
      return;
    }
    this.set({
      ...this.snapshot,
      connection: "disconnected",
      error: this.snapshot.error || "Ledger stream reconnect limit reached. Reconnect the workflow to continue.",
    });
  }

  private async ingestHistory(history: unknown, fallbackRunId: string, generation: number): Promise<void> {
    const bundle = object(history);
    if (!bundle) return;
    // Session turns contain the originating user prompt. Fold those first so
    // replay does not put a current-run answer ahead of the question it
    // answers. Current-run answers remain ledger-owned below: treating the
    // shelf answer as a final would overwrite it with structured run.output.
    const session = object(bundle.session);
    const turns = array(session?.turns).map(object).filter((turn): turn is ServerRecord => Boolean(turn));
    await this.hydrateHistoricalSessionRuns(turns, fallbackRunId, generation);
    if (!this.live(generation)) return;
    for (const row of turns) {
      const turnRunId = text(row?.run_id) || fallbackRunId;
      this.ingestSessionTurn(row, fallbackRunId, turnRunId !== fallbackRunId ? this.historicalRuns.get(turnRunId) || null : null);
    }
    // A just-started run can predate the best-effort session shelf. Its root
    // bundle carries a filtered authoritative input; place it before ledger
    // replies so an answer cannot precede the question on replay.
    const userMessageId = `turn:${fallbackRunId}:user`;
    if (!this.seenMessages.has(userMessageId)) {
      const prompt = promptFromInput(object(bundle.input_data));
      if (prompt) this.addMessage({ id: userMessageId, role: "user", content: prompt });
    }
    // `history_bundle.run` is a replay snapshot and may be older than the
    // GET /runs/{id} read that began this load. It never owns lifecycle
    // state; only the current run read can declare a root terminal state.
    const ledgers = object(bundle.ledgers);
    if (ledgers) for (const [runId, ledger] of Object.entries(ledgers)) {
      const row = object(ledger);
      for (const item of array(row?.items)) this.ingestItem(runId, item);
    }
  }

  private ingestSessionTurn(turn: ServerRecord | null, fallbackRunId: string, historicalRun: ServerRecord | null): void {
    if (!turn) return;
    const runId = text(turn.run_id) || fallbackRunId;
    const input = object(turn.input_data) || object(turn.input) || {};
    // Session history's public turn contract is `{prompt, answer}`. Tolerate
    // older input-shaped turns too, but never invent a user message.
    const prompt = text(turn.prompt) || promptFromInput(input);
    if (prompt) this.addMessage({ id: `turn:${runId}:user`, role: "user", content: prompt, ts: text(turn.created_at) || undefined });
    const failure = this.historicalRunFailures.get(runId);
    if (failure) {
      const saved = text(turn.answer) || messageText(turn.output);
      const state = failure.missing ? "is unavailable because the run no longer exists" : "could not be restored";
      const fallback = saved ? ` Saved reply (not verified as the final result): ${saved}` : "";
      this.addMessage({ id: `history:${runId}:unavailable`, role: "system", level: "warn", title: "History", content: `The final output for an earlier turn ${state}.${fallback}` });
      return;
    }
    const authoritative = historicalRun && terminal(statusOf(historicalRun)) ? displayValue(historicalRun.output) : "";
    const answer = authoritative || (historicalRun ? text(turn.answer) || messageText(turn.output) : "");
    const evidence = this.historicalEvidence.get(runId);
    for (const tool of evidence?.tools || []) this.upsertTool(tool);
    if (answer) this.addRunAssistantMessage(runId, { id: `final:${runId}`, role: "assistant", content: answer, runId, statistics: evidence?.statistics, ts: text(turn.updated_at) || undefined });
  }

  /** Fetch only returned prior session roots, with bounded fan-out. */
  private async hydrateHistoricalSessionRuns(turns: ServerRecord[], currentRunId: string, generation: number): Promise<void> {
    const ids = [...new Set(turns.map((turn) => text(turn.run_id)).filter((runId) => runId && runId !== currentRunId && !this.historicalRuns.has(runId) && !this.historicalRunFailures.has(runId)))];
    if (!ids.length || !this.live(generation)) return;
    let next = 0;
    let stopForAuth = false;
    const worker = async () => {
      while (!stopForAuth && this.live(generation)) {
        const runId = ids[next++];
        if (!runId) return;
        try {
          const run = object(await this.transport.getRun(runId, this.controller?.signal));
          if (!this.live(generation)) return;
          if (run) {
            this.historicalRuns.set(runId, run);
            try {
              const history = await this.transport.getHistory(runId, this.controller?.signal);
              if (!this.live(generation)) return;
              this.historicalEvidence.set(runId, workflowEvidence(historyRecords(history)));
            } catch (error) {
              if (!this.live(generation)) return;
              if (authError(error)) throw error;
              this.fail(new Error(`Earlier turn activity could not be restored: ${error instanceof Error ? error.message : String(error)}`), false);
            }
          }
          else {
            this.historicalRuns.set(runId, null);
            this.historicalRunFailures.set(runId, { missing: false, detail: "gateway returned an invalid historical run snapshot" });
          }
        } catch (error) {
          if (!this.live(generation)) return;
          const missing = statusCode(error) === 404;
          this.historicalRuns.set(runId, null);
          this.historicalRunFailures.set(runId, { missing, detail: error instanceof Error ? error.message : text(object(error)?.detail) || "request failed" });
          if (authError(error)) {
            stopForAuth = true;
            this.fail(error);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()));
    if (stopForAuth && this.live(generation)) {
      for (const runId of ids) {
        if (!this.historicalRuns.has(runId) && !this.historicalRunFailures.has(runId)) {
          this.historicalRuns.set(runId, null);
          this.historicalRunFailures.set(runId, { missing: false, detail: "authorization expired before this historical run could be restored" });
        }
      }
    }
  }

  private ingestItem(fallbackRunId: string, item: unknown): void {
    const envelope = object(item);
    const raw = object(envelope?.record) || envelope;
    if (!raw) return;
    const runId = runIdFrom(raw, fallbackRunId);
    const cursorRaw = Number(envelope?.cursor);
    const cursor = Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : (this.cursors.get(runId) || 0) + 1;
    const key = `${runId}:${cursor}`;
    if (this.seenRecords.has(key)) return;
    this.seenRecords.add(key); this.cursors.set(runId, Math.max(this.cursors.get(runId) || 0, cursor));
    this.set({ ...this.snapshot, records: [...this.snapshot.records, { cursor, record: raw, runId }] });
    this.foldRecord(runId, raw, key);
    if (this.snapshot.messages.some((message) => message.id === `final:${this.rootRunId}`)) {
      const statistics = workflowEvidence(this.snapshot.records).statistics;
      this.set({ ...this.snapshot, messages: this.snapshot.messages.map((message) => message.id === `final:${this.rootRunId}` ? { ...message, statistics } : message) });
    }
    for (const child of subRunIds(raw)) if (child !== runId) void this.catchUpAndWatch(child, this.generation);
  }

  private foldRecord(runId: string, record: ServerRecord, key: string): void {
    const eff = effect(record); const effectType = text(eff.type).toLowerCase(); const result = object(record.result);
    const recStatus = text(record.status).toLowerCase(); const timestamp = recordTimestamp(record);
    this.foldStopEvidence(runId, record, effectType, recStatus);
    if (["llm_call", "tool_calls"].includes(effectType) && ["started", "running"].includes(recStatus)) {
      const at = Date.parse(timestamp || "");
      if (!Number.isFinite(at) || at >= this.displayStatusAt) {
        if (Number.isFinite(at)) this.displayStatusAt = at;
        if (this.snapshot.displayStatus) this.set({ ...this.snapshot, displayStatus: "" });
      }
    }
    if (effectType === "answer_user" && recStatus === "completed") {
      const content = displayValue(result) || displayValue(object(eff.payload));
      // answer_user can be an intermediate conversational turn (the fixture
      // deliberately emits one before an ask_user wait), so it must never
      // consume the root's single authoritative terminal-final identity.
      if (content) this.addRunAssistantMessage(runId, { id: `answer:${runId}:${key}`, role: "assistant", content, ts: timestamp });
    }
    // Reserved durable host UX events. `abstractcode.*` is retained as the
    // migration alias specified by ADR-0017; unknown events remain trace-only.
    if (effectType === "emit_event" && recStatus === "completed") {
      const payload = object(eff.payload) || {};
      const emitted = object(result);
      const name = text(payload.name) || text(emitted?.name);
      const eventPayload = payload.payload !== undefined ? payload.payload : emitted?.payload;
      if (["abstract.message", "abstractcode.message"].includes(name)) {
          const content = displayValue(eventPayload);
        if (content) {
          const levelRaw = text(object(eventPayload)?.level).toLowerCase();
          const level = levelRaw === "error" ? "error" : ["warn", "warning"].includes(levelRaw) ? "warn" : "info";
          this.addMessage({ id: `event:${runId}:${key}`, role: "system", title: "Workflow", content, level, ts: timestamp });
        }
      }
      if (["abstract.status", "abstractcode.status"].includes(name)) {
        const statusPayload = object(eventPayload);
        const value = statusPayload ? statusPayload.status ?? statusPayload.text ?? statusPayload.value : eventPayload;
        const at = Date.parse(timestamp || "");
        if (!terminal(this.snapshot.status) && typeof value === "string" && (!Number.isFinite(at) || at >= this.displayStatusAt)) {
          if (Number.isFinite(at)) this.displayStatusAt = at;
          this.set({ ...this.snapshot, displayStatus: value.trim() });
        }
      }
      if (["abstract.tool_execution", "abstractcode.tool_execution", "abstract.tool_result", "abstractcode.tool_result"].includes(name)) {
        const content = displayValue(eventPayload);
        if (content) this.addMessage({ id: `event:${runId}:${key}`, role: "system", title: "Tool activity", content, ts: timestamp });
      }
    }
    // Publish the wait BEFORE folding its tool calls, so no snapshot ever
    // shows a covered batch's calls as "need approval" without the wait
    // that lets presentation mark them granted/running.
    const waiting = waitFromRecord(record);
    if (recStatus === "waiting" && waiting && !terminal(this.snapshot.status) && !terminal(statusOf(this.runStates.get(runId) || null))) this.set({ ...this.snapshot, interaction: { runId, wait: waiting, ...(text(record.step_id) ? { stepId: text(record.step_id) } : {}) } });
    if (effectType === "tool_calls") for (const tool of foldWorkflowTools(this.toolActivities, { runId, cursor: this.cursors.get(runId) || 0, record })) this.upsertTool(tool);
    // Only a ledger-confirmed resume/completion clears this UI gate.  A 202
    // command acceptance alone is intentionally not enough.
    if (effectType === "resume" && result?.resumed === true && this.snapshot.interaction?.runId === runId) {
      this.set({ ...this.snapshot, interaction: null });
      void this.refreshRunState(runId, this.generation);
    }
  }

  /** Ledger evidence for the Stop states: open model calls and forced stops. */
  private foldStopEvidence(runId: string, record: ServerRecord, effectType: string, recStatus: string): void {
    let changed = false;
    if (effectType === "llm_call") {
      const stepId = text(record.step_id);
      if (stepId) {
        const stepKey = `${runId}:${stepId}`;
        if (recStatus === "started") { this.openLlmSteps.add(stepKey); changed = true; }
        else if (["completed", "failed", "cancelled", "waiting"].includes(recStatus)) changed = this.openLlmSteps.delete(stepKey) || changed;
        // The durable record of the call replaces its live text.
        if (["completed", "failed", "cancelled"].includes(recStatus)) this.closeLiveReply(stepKey);
      }
    }
    if (effectType === "emit_event" && recStatus === "completed") {
      const payload = object(effect(record).payload) || {};
      const emitted = object(record.result);
      const name = text(payload.name) || text(emitted?.name);
      const eventPayload = object(payload.payload !== undefined ? payload.payload : emitted?.payload);
      // The gateway kill switch's attribution record (stop_kill_switch.py).
      if (name === "abstract.status" && text(eventPayload?.killed_by) === "kill_switch") { this.forcedStop = eventPayload; changed = true; }
    }
    if (changed) this.recomputeStop();
  }

  private recomputeStop(): void {
    let next: WorkflowStopState | null = null;
    if (this.forcedStop) {
      next = { phase: "forced", label: text(this.forcedStop.text) || "Stop forced: inference killed", record: this.forcedStop };
    } else if (this.stopRequested) {
      const cancelled = this.snapshot.status === "cancelled";
      next = cancelled && this.openLlmSteps.size === 0 ? { phase: "stopped", label: "Stopped" } : { phase: "stopping", label: "Stopping…" };
    }
    const current = this.snapshot.stop || null;
    if (current?.phase !== next?.phase || current?.label !== next?.label) this.set({ ...this.snapshot, stop: next });
    // The root is terminal (so its stream closed) but a model call of the tree
    // has not been proven stopped: keep reading the ledgers until it is.
    if (next?.phase === "stopping" && this.snapshot.status === "cancelled") void this.followStop(this.generation);
  }

  /** Ledger catch-up while a cancelled tree still has an open model call. Ends
   * on evidence (stopped/forced) or when this controller is reset; the state
   * itself only ever changes through `foldStopEvidence`. */
  private async followStop(generation: number): Promise<void> {
    if (this.stopFollowing) return;
    this.stopFollowing = true;
    try {
      let delay = 500;
      let ownError: string | null = null;
      while (this.live(generation) && this.snapshot.stop?.phase === "stopping") {
        await this.waitForRetry(delay);
        if (!this.live(generation)) return;
        const runs = [this.rootRunId, ...[...this.watchedRuns].filter((id) => id !== this.rootRunId)];
        let failed = false;
        for (const id of runs) {
          try { await this.catchUp(id, generation); } catch (error) {
            // A transient read failure (network, a gateway restarted by its
            // operator): keep following; the error is shown meanwhile.
            failed = true;
            if (this.live(generation)) { this.fail(error, false); ownError = this.snapshot.error; }
          }
        }
        // Clear only the read error THIS loop raised, once the gateway answers again.
        if (!failed && ownError && this.snapshot.error === ownError) { this.set({ ...this.snapshot, error: null }); ownError = null; }
        delay = Math.min(5000, delay * 2);
      }
    } finally {
      if (this.generation === generation) this.stopFollowing = false;
    }
  }

  private addMessage(message: ChatMessage): void {
    const id = text(message.id) || `${message.role}:${message.content}:${message.ts || ""}`;
    if (this.seenMessages.has(id)) return;
    this.seenMessages.add(id); this.set({ ...this.snapshot, messages: [...this.snapshot.messages, { ...message, id }] });
  }

  private toolMessage(tool: WorkflowToolActivity): ChatMessage {
    return { id: `tool:${tool.id}`, role: "system", kind: "tool_activity", title: "Tool activity", runId: tool.runId, toolActivity: tool, content: JSON.stringify({ tool: tool.name, status: tool.status, arguments: tool.arguments, output: tool.output, error: tool.error }, null, 2), ts: tool.endedAt || tool.startedAt };
  }

  private upsertTool(tool: WorkflowToolActivity): void {
    const message = this.toolMessage(tool);
    const index = this.snapshot.messages.findIndex((item) => item.id === message.id);
    if (index < 0) { this.addMessage(message); return; }
    const messages = [...this.snapshot.messages]; messages[index] = message;
    this.set({ ...this.snapshot, messages });
  }

  /** Session history is a fallback; durable answer_user and terminal output
   * are authoritative. Suppress only an exact duplicate for the same run. */
  private addRunAssistantMessage(runId: string, message: ChatMessage): void {
    // The durable reply replaces any live text of the same run: never two copies.
    this.closeLiveRepliesOfRun(runId);
    const answerPrefix = `answer:${runId}:`;
    const finalId = `final:${runId}`;
    if (this.snapshot.messages.some((existing) => existing.role === "assistant" && existing.content === message.content && (existing.id === finalId || String(existing.id || "").startsWith(answerPrefix)))) return;
    this.addMessage(message);
  }

  /**
   * Fold one `llm.delta` / `llm.delta_end` event delivered by the stream of
   * `streamRunId`. A snapshot replaces the channel's text (unless it is older
   * than what is shown); a live delta is appended only when its `seq` is
   * higher than the last one of its channel, so duplicates and out-of-order
   * frames are dropped. A call whose durable record or reply is already here
   * never gets a bubble again. A malformed event is reported as an error.
   */
  private ingestDelta(streamRunId: string, raw: unknown): void {
    let event: LlmDelta | LlmDeltaEnd;
    try { event = validateLlmDeltaEvent(raw); } catch (error) { this.fail(error, false); return; }
    const key = `${event.run_id}:${event.call_id}`;
    if (isLlmDeltaEnd(event)) {
      if (event.reason === "unavailable") { this.noteStreamUnavailable(event); return; }
      this.closeLiveReply(key, event.reason === "completed" ? undefined : event.reason);
      return;
    }
    // A finished run (or finished turn) takes no live text: its closed-call
    // keys are pruned when it ends, so this check is what keeps them closed.
    if (this.closedLiveCalls.has(key) || this.runEnded(event.run_id) || this.runEnded(this.rootRunId)) return;
    const reply = this.liveReplies.get(key) || { runId: event.run_id, callId: event.call_id, nodeId: event.node_id || "", via: streamRunId, text: "", reasoning: "", seq: { content: -1, reasoning: -1 } };
    const field = event.channel === "reasoning" ? "reasoning" : "text";
    const last = reply.seq[event.channel];
    if (event.snapshot) {
      if (event.seq < last) return;
      reply[field] = event.text;
    } else {
      if (event.seq <= last) return;
      reply[field] += event.text;
    }
    reply.seq[event.channel] = event.seq;
    reply.via = streamRunId;
    this.liveReplies.set(key, reply);
    this.liveDirty.add(key);
    this.scheduleLiveRender();
  }

  private runEnded(runId: string): boolean { return terminal(statusOf(this.runStates.get(runId) || null)); }

  /** Render changed live replies now, or at the end of the current interval. */
  private scheduleLiveRender(): void {
    if (this.liveRenderTimer) return;
    const wait = this.lastLiveRender + this.liveRenderIntervalMs - Date.now();
    if (wait <= 0) { this.renderLiveReplies(); return; }
    this.liveRenderTimer = setTimeout(() => { this.liveRenderTimer = null; this.renderLiveReplies(); }, wait);
  }

  private renderLiveReplies(): void {
    this.lastLiveRender = Date.now();
    if (!this.liveDirty.size) return;
    const messages = [...this.snapshot.messages];
    for (const key of this.liveDirty) {
      const reply = this.liveReplies.get(key);
      if (!reply) continue;
      const message = this.liveMessage(reply);
      const index = messages.findIndex((item) => item.id === message.id);
      if (index < 0) messages.push(message); else messages[index] = message;
    }
    this.liveDirty.clear();
    this.set({ ...this.snapshot, messages });
  }

  private liveMessage(reply: LiveReply): ChatMessage {
    const subAgent = reply.runId !== this.rootRunId;
    return {
      id: `live:${reply.runId}:${reply.callId}`, role: "assistant", content: reply.text, runId: reply.runId,
      live: { callId: reply.callId, reasoning: reply.reasoning, ...(subAgent ? { caption: `sub-agent · ${reply.nodeId || reply.runId}` } : {}) },
    };
  }

  /** End a live reply: remove its bubble, or replace it with a short note
   * when the stream ended because the call failed or was cancelled. */
  private closeLiveReply(key: string, reason?: "failed" | "cancelled"): void {
    this.closedLiveCalls.add(key);
    const reply = this.liveReplies.get(key);
    if (!reply) return;
    this.liveReplies.delete(key);
    this.liveDirty.delete(key);
    const id = `live:${reply.runId}:${reply.callId}`;
    const index = this.snapshot.messages.findIndex((item) => item.id === id);
    if (index < 0) return;
    const messages = [...this.snapshot.messages];
    if (reason) {
      const noteId = `live-end:${reply.runId}:${reply.callId}`;
      this.seenMessages.add(noteId);
      messages[index] = { id: noteId, role: "system", level: "warn", title: "Reply", runId: reply.runId, content: reason === "failed" ? "The reply stopped because the model call failed." : "The reply stopped because the model call was cancelled." };
    } else messages.splice(index, 1);
    this.set({ ...this.snapshot, messages });
  }

  /** A call ran without streaming: one note per run and cause, never a bubble. */
  private noteStreamUnavailable(event: LlmDeltaEnd): void {
    const key = `${event.run_id}:${event.call_id}`;
    this.closeLiveReply(key);
    this.addMessage({ id: `stream-unavailable:${event.run_id}:${event.detail || "unknown"}`, role: "system", level: "info", title: "Reply", runId: event.run_id, content: describeStreamUnavailable(event.detail) });
  }

  private closeLiveRepliesOfRun(runId: string): void {
    for (const reply of [...this.liveReplies.values()]) if (reply.runId === runId) this.closeLiveReply(`${reply.runId}:${reply.callId}`);
  }

  /** Close the live replies a stream delivered (the controller stopped following it). */
  private closeLiveRepliesVia(streamRunId: string, reason?: "failed" | "cancelled"): void {
    for (const reply of [...this.liveReplies.values()]) if (reply.via === streamRunId || reply.runId === streamRunId) this.closeLiveReply(`${reply.runId}:${reply.callId}`, reason);
  }

  /**
   * A run reached a terminal state: close its live replies (for the root, every
   * live reply of the turn, sub-agents included) whether or not their
   * `llm.delta_end` arrived, then forget its closed-call keys. Later frames for
   * it are refused by the terminal-run check in `ingestDelta`.
   */
  private endLiveRepliesOfRun(runId: string, status: string): void {
    const reason = status === "failed" || status === "cancelled" ? status : undefined;
    if (runId === this.rootRunId) {
      for (const reply of [...this.liveReplies.values()]) this.closeLiveReply(`${reply.runId}:${reply.callId}`, reason);
      this.closedLiveCalls.clear();
      return;
    }
    this.closeLiveRepliesVia(runId, reason);
    for (const key of [...this.closedLiveCalls]) if (key.startsWith(`${runId}:`)) this.closedLiveCalls.delete(key);
  }

  /** Forget (without closing) the live replies a stream delivered; its
   * reconnect snapshots bring the current text back. */
  private dropLiveRepliesVia(streamRunId: string): void {
    const dropped = new Set<string>();
    for (const [key, reply] of this.liveReplies) if (reply.via === streamRunId) { this.liveReplies.delete(key); this.liveDirty.delete(key); dropped.add(`live:${reply.runId}:${reply.callId}`); }
    if (dropped.size) this.set({ ...this.snapshot, messages: this.snapshot.messages.filter((message) => !dropped.has(String(message.id))) });
  }

  private fail(error: unknown, setConnection = true): void {
    if (authError(error)) { this.approvalEpoch += 1; this.toolApprovalStopped = true; this.toolApprovalSuspended = true; this.options.onAuthError?.(error); }
    this.set({ ...this.snapshot, error: error instanceof Error ? error.message : text(object(error)?.detail) || String(error), ...(authError(error) ? { autoApproveTools: false } : {}), ...(setConnection ? { connection: "disconnected" as const } : {}) });
  }

  private newCommandId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    return `workflow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private updateRunState(runId: string, run: ServerRecord): void {
    this.runStates.set(runId, run);
    if (terminal(statusOf(run))) this.endLiveRepliesOfRun(runId, statusOf(run));
    if (runId !== this.rootRunId) {
      if (terminal(statusOf(run)) && this.snapshot.interaction?.runId === runId) this.set({ ...this.snapshot, interaction: null });
      return;
    }
    const status = statusOf(run);
    const done = terminal(status);
    // A terminal RunState is the sole authority for a generic workflow final.
    // Visual `on_flow_end` ledger rows can have `effect: null`, while normal
    // tool/node rows often have a misleading `result.output`; folding either
    // ledger shape as a final loses structured results or emits false ones.
    if (done) {
      const content = displayValue(run.output);
      if (content) this.upsertFinal(runId, content, recordTimestamp(run));
    }
    this.set({ ...this.snapshot, run, status, ...(done ? { interaction: null, autoApproveTools: false, displayStatus: "" } : {}) });
    if (this.stopRequested || this.forcedStop) this.recomputeStop();
  }

  private upsertFinal(runId: string, content: string, ts?: string): void {
    this.closeLiveRepliesOfRun(runId);
    const id = `final:${runId}`;
    this.seenMessages.add(id);
    const message: ChatMessage = { id, role: "assistant", content, ts, runId, statistics: workflowEvidence(this.snapshot.records).statistics };
    const index = this.snapshot.messages.findIndex((existing) => existing.id === id || (String(existing.id || "").startsWith(`answer:${runId}:`) && existing.content === content));
    if (index < 0) {
      this.set({ ...this.snapshot, messages: [...this.snapshot.messages, message] });
      return;
    }
    const messages = [...this.snapshot.messages];
    messages[index] = message;
    this.set({ ...this.snapshot, messages });
  }

  private async refreshRunState(runId: string, generation: number): Promise<void> {
    try {
      const run = object(await this.transport.getRun(runId, this.controller?.signal));
      if (run && this.live(generation)) this.updateRunState(runId, run);
    } catch (error) {
      // A later stream reconnect will refresh again; never convert a
      // ledger-confirmed resume into a synthetic terminal/failure state.
      if (this.live(generation)) this.fail(error, false);
    }
  }

  /**
   * SSE is the source for ledger records, not an exhaustive lifecycle feed.
   * In particular a parked event wait can remain connected while another
   * actor pauses it or cancels its root. Poll only the root metadata at a
   * modest cadence; AbortController + generation prevent stale completions
   * from an old run or auth scope changing the current snapshot.
   */
  private async pollRootLifecycle(runId: string, generation: number): Promise<void> {
    while (this.live(generation) && this.rootRunId === runId && !terminal(statusOf(this.runStates.get(runId) || null))) {
      await this.waitForRetry(2000);
      if (!this.live(generation) || this.rootRunId !== runId || terminal(statusOf(this.runStates.get(runId) || null))) return;
      try {
        const run = object(await this.transport.getRun(runId, this.controller?.signal));
        if (run && this.live(generation) && this.rootRunId === runId) this.updateRunState(runId, run);
      } catch (error) {
        if (!this.live(generation)) return;
        // Retrying an expired identity forever cannot recover. Tell the host
        // once and let its authScopeKey recreate the controller.
        if (authError(error)) { this.fail(error); return; }
        // The open ledger stream may remain healthy. Surface a recoverable
        // lifecycle-read failure without falsely declaring it disconnected.
        this.fail(error, false);
      }
    }
  }

  private waitForRetry(delayMs: number): Promise<void> {
    const signal = this.controller?.signal;
    if (!signal || signal.aborted) return Promise.resolve();
    const activeSignal: AbortSignal = signal;
    return new Promise((resolve) => {
      const timer = setTimeout(done, delayMs);
      const onAbort = () => { clearTimeout(timer); done(); };
      function done() {
        activeSignal.removeEventListener("abort", onAbort);
        resolve();
      }
      activeSignal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
