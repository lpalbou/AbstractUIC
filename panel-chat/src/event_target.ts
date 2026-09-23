import type { ServerRecord, WorkflowRecord, WorkflowWaitInteraction } from "./workflow_runtime.js";

export type WorkflowEventScope = "session" | "workflow" | "run" | "global";

export type WorkflowEventTarget = {
  name: string;
  scope: WorkflowEventScope;
  scopeId: string;
  sessionId?: string;
  workflowId?: string;
  runId?: string;
};

export type WorkflowEventTargetResolution =
  | { target: WorkflowEventTarget; error?: never }
  | { target: null; error: string };

type EventEvidence = {
  scope: string;
  name: string;
  scopeId: string;
  sessionId: string;
  workflowId: string;
  runId: string;
};

function object(value: unknown): ServerRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ServerRecord : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function scope(value: string): WorkflowEventScope | null {
  return ["session", "workflow", "run", "global"].includes(value) ? value as WorkflowEventScope : null;
}

function evidence(value: ServerRecord | null): EventEvidence {
  return {
    scope: text(value?.scope).toLowerCase(),
    name: text(value?.name) || text(value?.event_name),
    scopeId: text(value?.scope_id) || text(value?.scopeId),
    sessionId: text(value?.session_id) || text(value?.sessionId),
    workflowId: text(value?.workflow_id) || text(value?.workflowId),
    runId: text(value?.run_id) || text(value?.runId),
  };
}

function matchingEvidence(raw: WorkflowWaitInteraction, records: WorkflowRecord[]): EventEvidence[] {
  const wait = raw.wait;
  const key = text(wait.wait_key);
  const out = [evidence(wait), evidence(object(wait.details))];
  for (const entry of records) {
    if (entry.runId !== raw.runId) continue;
    const record = entry.record;
    const result = object(record.result);
    const storedWait = object(result?.wait);
    const effect = object(record.effect);
    const payload = object(effect?.payload);
    if (text(storedWait?.wait_key) !== key && text(payload?.wait_key) !== key) continue;
    out.push(evidence(record), evidence(payload), evidence(object(payload?.details)), evidence(storedWait), evidence(object(storedWait?.details)));
  }
  return out;
}

function idFor(scopeName: WorkflowEventScope, row: EventEvidence): string {
  if (row.scopeId) return row.scopeId;
  if (scopeName === "session") return row.sessionId;
  if (scopeName === "workflow") return row.workflowId;
  if (scopeName === "run") return row.runId;
  return "global";
}

function target(scopeName: WorkflowEventScope, scopeId: string, name: string): WorkflowEventTarget {
  return {
    scope: scopeName,
    scopeId,
    name,
    ...(scopeName === "session" ? { sessionId: scopeId } : {}),
    ...(scopeName === "workflow" ? { workflowId: scopeId } : {}),
    ...(scopeName === "run" ? { runId: scopeId } : {}),
  };
}

function decodeWithKnownId(key: string, scopeName: WorkflowEventScope, scopeId: string): WorkflowEventTarget | null {
  if (!scopeId) return null;
  const prefix = `evt:${scopeName}:${scopeId}:`;
  if (!key.startsWith(prefix)) return null;
  const name = key.slice(prefix.length);
  return name ? target(scopeName, scopeId, name) : null;
}

/**
 * Resolves an event target only from the exact durable wait key plus matching
 * wait-record evidence. Event keys intentionally permit colons in scope IDs
 * and names, so splitting them is unsafe. The result is suitable to hand to
 * an emit-event transport; a failure is deliberately explicit and fail-closed.
 */
export function resolveWorkflowEventTarget(
  raw: WorkflowWaitInteraction | null,
  records: WorkflowRecord[] = [],
  currentRun?: ServerRecord | null,
): WorkflowEventTargetResolution {
  if (!raw) return { target: null, error: "No event wait is available." };
  const key = text(raw.wait.wait_key);
  const scopeMatch = /^evt:(session|workflow|run|global):/.exec(key);
  if (!scopeMatch) return { target: null, error: "The gateway did not provide a canonical event wait key." };
  const keyScope = scope(scopeMatch[1]);
  if (!keyScope) return { target: null, error: "The event wait uses an unsupported scope." };

  const facts = matchingEvidence(raw, Array.isArray(records) ? records : []);
  // A structured `{scope, name}` payload is the strongest proof. Derive the
  // full middle scope ID by exact prefix/suffix, preserving embedded colons.
  const proven = new Map<string, WorkflowEventTarget>();
  for (const fact of facts) {
    const factScope = scope(fact.scope);
    if (!factScope || !fact.name) continue;
    if (factScope !== keyScope) return { target: null, error: "Event metadata conflicts with the canonical wait scope." };
    const prefix = `evt:${factScope}:`;
    const suffix = `:${fact.name}`;
    if (!key.startsWith(prefix) || !key.endsWith(suffix) || key.length <= prefix.length + suffix.length) {
      return { target: null, error: "Event metadata does not exactly match the canonical wait key." };
    }
    const scopeId = key.slice(prefix.length, -suffix.length);
    const declaredId = idFor(factScope, fact);
    if (declaredId && declaredId !== scopeId) return { target: null, error: "Event metadata conflicts with the canonical wait target." };
    const resolved = target(factScope, scopeId, fact.name);
    proven.set(`${resolved.scope}\u0000${resolved.scopeId}\u0000${resolved.name}`, resolved);
  }
  if (proven.size > 1) return { target: null, error: "Multiple event targets match this wait; routing is unavailable." };
  if (proven.size === 1) return { target: [...proven.values()][0] };

  // The active run and the exact matching ledger record can still provide a
  // canonical scope ID. This is safe only when that full ID forms the exact
  // prefix, leaving the entire remaining suffix as the event name.
  const ids = new Set<string>();
  if (keyScope === "run") ids.add(raw.runId);
  if (keyScope === "global") ids.add("global");
  for (const fact of facts) {
    const value = idFor(keyScope, fact);
    if (value) ids.add(value);
  }
  const currentMatches = text(currentRun?.run_id) === raw.runId;
  if (currentMatches) {
    const current = evidence(currentRun || null);
    const value = idFor(keyScope, current);
    if (value) ids.add(value);
  }
  const decoded = [...ids].map((scopeId) => decodeWithKnownId(key, keyScope, scopeId)).filter((item): item is WorkflowEventTarget => Boolean(item));
  const unique = new Map(decoded.map((item) => [`${item.scope}\u0000${item.scopeId}\u0000${item.name}`, item]));
  if (unique.size === 1) return { target: [...unique.values()][0] };
  if (unique.size > 1) return { target: null, error: "The event key is ambiguous for the available scope metadata." };
  return { target: null, error: "The gateway did not provide enough canonical event routing metadata." };
}
