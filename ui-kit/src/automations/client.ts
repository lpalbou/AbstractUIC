// Automations v1 client — one method per gateway route (contract F).
//
// Transport-agnostic: the host injects `fetch` (and any auth/CSRF headers), so
// the same module serves a browser app behind the app-server proxy, a direct
// gateway URL, or a test stub. No React, no CSS, no timers: callers poll FULL
// pages themselves (v1 has no change cursor; `changed_since` is never sent).
//
// Every non-2xx answer must carry the automation error envelope
// `{"detail": {"reason_code", "message", "field"?, "command_id"?}}` and is
// thrown as an `AutomationApiError` whose `code` is `detail.reason_code`. A
// non-2xx without that envelope, or a 2xx that is not JSON, throws
// `invalid_response` — never a silent success.
import { gatewayApiPath, joinBaseUrl } from "../gateway_paths.js";
import type {
  ApiError,
  AutomationChanges,
  AutomationCommandType,
  AutomationDetail,
  AutomationStatus,
  AutomationSummary,
  AttentionItem,
  CommandReceipt,
  CreateAutomationRequest,
  CreateAutomationResponse,
  DiscussResponse,
  JsonObject,
  MyEmailStatus,
  OccurrenceRow,
  Page,
  TriggerSourceEntry,
} from "./types.js";

/** Relative (see gateway_paths.ts): resolved under the page's base, or under `baseUrl`. */
export const AUTOMATIONS_PATH = gatewayApiPath("automations");
export const TRIGGER_SOURCES_PATH = gatewayApiPath("trigger-sources");
/** The signed-in user's own email account (framework backlog 0992 C2). */
export const MY_EMAIL_PATH = gatewayApiPath("me/email");

export class AutomationApiError extends Error implements ApiError {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  readonly command_id?: string;
  constructor(error: ApiError) {
    super(error.message);
    this.name = "AutomationApiError";
    this.status = error.status;
    this.code = error.code;
    if (error.field !== undefined) this.field = error.field;
    if (error.command_id !== undefined) this.command_id = error.command_id;
  }
}

/**
 * Parse an error body into an `ApiError`. Only the contract envelope yields
 * its `reason_code`; any other shape is `invalid_response` (status kept).
 */
export function parseApiError(status: number, body: unknown): ApiError {
  const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    if (typeof d.reason_code === "string" && d.reason_code && typeof d.message === "string") {
      const out: ApiError = { status, code: d.reason_code, message: d.message };
      if (typeof d.field === "string") out.field = d.field;
      if (typeof d.command_id === "string") out.command_id = d.command_id;
      return out;
    }
  }
  return { status, code: "invalid_response", message: `The gateway answered HTTP ${status} without an automation error envelope.` };
}

export type AutomationsClientOptions = {
  /** Injected transport (window.fetch, a proxy-aware wrapper, or a test stub). */
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Base URL the relative API paths are joined to ("http://host:8080", "https://host/prefix/"); "" (default) = relative to the page. */
  baseUrl?: string;
  /** Extra headers per request (auth, CSRF). */
  headers?: () => Record<string, string>;
  /** Id source for `command_id` / `request_id` when the caller gives none. */
  newId?: () => string;
};

export type ListAutomationsQuery = { status?: AutomationStatus; cursor?: string; limit?: number };
export type PageQuery = { cursor?: string; limit?: number };

export type AutomationsClient = {
  listAutomations(query?: ListAutomationsQuery): Promise<Page<AutomationSummary>>;
  getAutomation(automationId: string): Promise<AutomationDetail>;
  createAutomation(body: CreateAutomationRequest): Promise<CreateAutomationResponse>;
  reviseAutomation(
    automationId: string,
    request: { changes: AutomationChanges; expected_revision?: number; command_id?: string },
  ): Promise<CommandReceipt>;
  sendAutomationCommand(
    automationId: string,
    request: { type: AutomationCommandType; payload?: JsonObject; command_id?: string },
  ): Promise<CommandReceipt>;
  listOccurrences(automationId: string, query?: PageQuery): Promise<Page<OccurrenceRow>>;
  discuss(automationId: string, request: { occurrence_index: number; prompt: string; request_id?: string }): Promise<DiscussResponse>;
  markSeen(automationId: string, attentionCursor: string): Promise<{ attention_cursor: string }>;
  listAttention(automationId: string, query?: PageQuery): Promise<Page<AttentionItem>>;
  listTriggerSources(): Promise<{ items: TriggerSourceEntry[] }>;
  /**
   * `GET /api/gateway/me/email`: whether the user has a usable email account
   * (decides whether the form offers "When an email arrives", "Email me the
   * result" and allowed recipients). Never carries a secret.
   */
  getMyEmail(): Promise<MyEmailStatus>;
};

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

function defaultId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c || typeof c.randomUUID !== "function") throw new Error("automations client: crypto.randomUUID is unavailable; pass options.newId");
  return c.randomUUID();
}

export function createAutomationsClient(options: AutomationsClientOptions): AutomationsClient {
  const newId = options.newId ?? defaultId;
  const one = (id: string) => `${AUTOMATIONS_PATH}/${encodeURIComponent(id)}`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json", ...(options.headers ? options.headers() : {}) };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await options.fetch(joinBaseUrl(options.baseUrl, path), init);
    const text = await res.text();
    let data: unknown = undefined;
    let parsed = false;
    if (text) {
      try {
        data = JSON.parse(text);
        parsed = true;
      } catch {
        parsed = false;
      }
    }
    if (!res.ok) throw new AutomationApiError(parseApiError(res.status, data));
    if (!parsed || data === null || typeof data !== "object") {
      throw new AutomationApiError({ status: res.status, code: "invalid_response", message: `The gateway answered ${method} ${path} with a body that is not a JSON object.` });
    }
    return data as T;
  }

  return {
    listAutomations: (q = {}) => call("GET", `${AUTOMATIONS_PATH}${query({ status: q.status, cursor: q.cursor, limit: q.limit })}`),
    getAutomation: (id) => call("GET", one(id)),
    createAutomation: (body) => call("POST", AUTOMATIONS_PATH, body),
    reviseAutomation: (id, r) =>
      call("PATCH", one(id), {
        command_id: r.command_id ?? newId(),
        ...(r.expected_revision !== undefined ? { expected_revision: r.expected_revision } : {}),
        changes: r.changes,
      }),
    sendAutomationCommand: (id, r) =>
      call("POST", `${one(id)}/commands`, { command_id: r.command_id ?? newId(), type: r.type, ...(r.payload !== undefined ? { payload: r.payload } : {}) }),
    listOccurrences: (id, q = {}) => call("GET", `${one(id)}/occurrences${query({ cursor: q.cursor, limit: q.limit })}`),
    discuss: (id, r) =>
      call("POST", `${one(id)}/discuss`, { request_id: r.request_id ?? newId(), occurrence_index: r.occurrence_index, prompt: r.prompt }),
    markSeen: (id, cursor) => call("POST", `${one(id)}/seen`, { attention_cursor: cursor }),
    listAttention: (id, q = {}) => call("GET", `${one(id)}/attention${query({ cursor: q.cursor, limit: q.limit })}`),
    listTriggerSources: () => call("GET", TRIGGER_SOURCES_PATH),
    getMyEmail: () => call("GET", MY_EMAIL_PATH),
  };
}
