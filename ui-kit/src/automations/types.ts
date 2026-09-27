// Automations v1 — wire shapes of the gateway façade (contract F, CONTRACTS rev 2)
// and the panel's error type (contract G). Transcribed, not invented: the
// canonical examples are `ui-kit/scripts/fixtures/automations/*.json`, and
// `scripts/check_automation_fixtures.mjs` validates them against the key sets
// below (unknown fields are rejected there, as the contract requires).

/** `^[1-9][0-9]*[smhd]$` — fixed UTC interval (s=1, m=60, h=3600, d=86400 s; no DST). */
export type Duration = string;
/** UTC RFC3339 timestamp. The gateway emits `2026-09-27T08:00:00.412307+00:00`; `Z` is accepted too. */
export type Timestamp = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type Page<T> = { items: T[]; next_cursor: string | null };

/** `schedule@1` configuration. Without `every` the automation runs once at `start_at`. */
export type ScheduleConfig = {
  start_at?: Timestamp;
  every?: Duration;
  until?: Timestamp;
  count?: number;
  anchor?: Timestamp;
};

export type TriggerBinding = { binding_id: string; source_id: string; source_version: number; config: JsonObject };
/** A trigger as a client writes it (the server mints `binding_id`). */
export type TriggerSpec = { source_id: string; source_version: number; config: JsonObject };
export type TriggerEnvelope = {
  event_id: string;
  source_id: string;
  source_version: number;
  fired_at: Timestamp;
  payload: JsonObject;
  binding_id: string;
};

/**
 * `schedule@1` envelope payload (the runtime's shape; `fired_at` is on the
 * envelope itself). `coalesced` is present when missed ticks were folded
 * into this admission.
 */
export type ScheduleEventPayload = {
  tick: number;
  scheduled_at: Timestamp;
  coalesced?: { first_tick: number; last_tick: number; missed_count: number };
};
/** `manual@1` envelope payload. */
export type ManualEventPayload = { command_id: string };

export type TriggerSourceKind = "time" | "manual" | "event";
export type TriggerSource = {
  id: string;
  version: number;
  label: string;
  config_schema: JsonObject;
  event_schema: JsonObject;
  capabilities: { kind: TriggerSourceKind };
};
/** A row of `GET /api/gateway/trigger-sources`. */
export type TriggerSourceEntry = TriggerSource & { available: boolean; unavailable_reason?: string };

export type AutomationStatus = "active" | "paused" | "completed" | "failed" | "archived";
export type ContextMode = "independent" | "growing";
export type Notify = { title: string; body: string };

export type AttentionItem = {
  kind: "notify" | "failure";
  automation_id: string;
  run_id: string;
  index: number;
  at: Timestamp;
  title: string;
  body?: string;
  /** `att1:<seq>` — acknowledge THIS (the last displayed item), never the summary's latest. */
  cursor: string;
};
/**
 * Waits are TYPED (decision D1); clients choose the answer payload by `kind`,
 * never from the prompt text:
 * - `ask_user` → `{response: string}` (a choice or free text)
 * - `tool_approval` → `{approved: boolean}`; `details` = the tool calls to approve
 * - `event` → `{payload: JSON}`
 */
export type WaitKind = "ask_user" | "tool_approval" | "event";
/** One tool call awaiting approval (`details` of a `tool_approval` wait). */
export type ToolCallToApprove = { name: string; arguments: JsonObject; call_id?: string };
export type WaitAnswer = { response: string } | { approved: boolean; tool_ids?: string[] } | { payload: Json };
/** A pending wait as the summary lists it (the occurrence's wait plus its `index`). */
export type AttentionWait = { run_id: string; wait_key: string; kind: WaitKind; reason: string; index: number; prompt?: string; choices?: string[]; details?: Json };
export type AutomationAttention = {
  pending_waits: number;
  unread: boolean;
  unseen_count: number;
  cursor: string;
  /** At most 20, OLDEST unseen first. */
  items: AttentionItem[];
  /** At most 20. */
  waits: AttentionWait[];
};

export type LastOccurrence = {
  run_id: string;
  index: number;
  status: string;
  attempts: number;
  fired_at: Timestamp;
  finished_at?: Timestamp;
  excerpt: string;
  notify: Notify | null;
};

/** The occurrence in flight (`admitted` → `running`; `backoff` between retry attempts). */
export type CurrentOccurrence = { index: number; run_id: string; attempt: number; status: "admitted" | "running" | "backoff" };

export type AutomationSummary = {
  automation_id: string;
  title: string;
  status: AutomationStatus;
  trigger: TriggerBinding;
  context_mode: ContextMode;
  /** The automation's folder (= `definition.workspace_root`). Legacy rows carry it only when the wrapper recorded one. */
  workspace_root?: string;
  /**
   * Next scheduled fire time of an ACTIVE scheduled automation — also while an
   * occurrence runs. Absent for paused, archived, manual-only or exhausted ones.
   */
  next_fire_at?: Timestamp;
  /** Always present on automation rows (`null` when nothing is in flight); absent on legacy rows. */
  current_occurrence?: CurrentOccurrence | null;
  occurrence_count: number;
  last_occurrence?: LastOccurrence;
  attention: AutomationAttention;
  legacy: boolean;
  revision: number | null;
  updated_at: Timestamp;
  capabilities: string[];
  session_kind: "automation";
};

export type OccurrenceArtifact = { artifact_id: string; name: string; mime_type: string; url: string };
export type OccurrenceWait = { run_id: string; wait_key: string; kind: WaitKind; reason: string; prompt?: string; choices?: string[]; details?: Json };
/** Why an occurrence failed, after its last attempt (the gateway emits it on failed rows). */
export type OccurrenceFailure = { reason_code: string; message: string; attempts: number };
export type OccurrenceRow = {
  run_id: string;
  index: number;
  attempts: number;
  fired_at: Timestamp;
  finished_at?: Timestamp;
  status: string;
  trigger: { source_id: string; summary: string };
  user_turn: string;
  answer: string;
  notify: Notify | null;
  failure?: OccurrenceFailure;
  artifacts: OccurrenceArtifact[];
  waits: OccurrenceWait[];
  ledger_url: string;
  workspace_url?: string;
};

export type CommandReceipt = { command_id: string; accepted: boolean; duplicate: boolean; seq: number };

export type AutomationCommandType =
  | "automation.pause"
  | "automation.resume"
  | "automation.run_now"
  | "automation.stop_current"
  | "automation.archive";

/** Contract A `_meta.automation` (the latest committed revision). */
export type AutomationDefinition = {
  schema_version: 1;
  revision: number;
  title: string;
  controller: { bundle_ref: string; flow_id: string };
  target: { workflow_id: string; bundle_ref: string; flow_id: string; input_data: JsonObject };
  trigger: TriggerBinding;
  context: { mode: ContextMode; growing: JsonObject };
  policy: {
    serial: true;
    misfire: "coalesce";
    failure: "continue";
    retry: { max_attempts: number; backoff: { initial: Duration; factor: number; max: Duration } };
    tool_approval: ToolApprovalPolicy;
  };
  session_id: string;
  workspace_root: string;
  created_at: Timestamp;
  archived_at: Timestamp | null;
};
export type AutomationDetail = { definition: AutomationDefinition; active_revision: number; summary: AutomationSummary };

/** Create target: a concrete bundle flow, or the server-resolved default agent. */
export type AutomationTarget =
  | { bundle_ref: string; flow_id: string; input_data?: JsonObject }
  | { flow_id: "@default"; interface: string; input_data?: JsonObject };

export type RetryPolicy = { max_attempts?: number; backoff?: { initial?: Duration; factor?: number; max?: Duration } };
/**
 * Decision D1: `"auto"` (default) = tools run without asking — creating the
 * automation is the consent; `"ask"` = each tool call waits for approval.
 */
export type ToolApprovalPolicy = "auto" | "ask";
export type AutomationPolicyInput = { retry?: RetryPolicy; tool_approval?: ToolApprovalPolicy };

/** Body of `POST /api/gateway/automations`. */
export type CreateAutomationRequest = {
  request_id: string;
  title: string;
  target: AutomationTarget;
  trigger: TriggerSpec;
  context?: { mode: ContextMode };
  policy?: AutomationPolicyInput;
};
export type CreateAutomationResponse = { automation_id: string; revision: number; summary: AutomationSummary };

/** `changes` of `PATCH /api/gateway/automations/{id}`. */
export type AutomationChanges = {
  title?: string;
  target?: AutomationTarget;
  trigger?: TriggerSpec;
  context?: { mode: ContextMode };
  policy?: AutomationPolicyInput;
};

/**
 * `POST …/discuss`: a fork at the occurrence carrying the automation's whole
 * timeline 1..N. `workspace_root` = the discussion's OWN writable folder;
 * `mounted_workspace` = the automation's folder, mounted READ-ONLY.
 */
export type DiscussResponse = { session_id: string; run_id: string; session_kind: "discussion"; workspace_root: string; mounted_workspace: string };

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "automation_not_found"
  | "occurrence_not_found"
  | "revision_conflict"
  | "automation_busy"
  | "invalid_state"
  | "identity_conflict"
  | "invalid_request"
  | "invalid_definition"
  | "unsupported_feature"
  | "unknown_trigger_source";

/** Contract G. `code` = `detail.reason_code` of the error envelope. */
export type ApiError = { status: number; code: string; message: string; field?: string; command_id?: string };
