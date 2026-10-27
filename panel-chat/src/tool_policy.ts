/**
 * Session tool policy decisions in the ledger (contract v1 §5): the record
 * `abstract.tool_policy_decision` says a call ran (or was refused) because of
 * the conversation's stored policy. It is an ACTIVITY, never a question: no
 * wait, no `waiting` record and no resume exist for these calls.
 */
import { formatExactTime } from "@abstractframework/ui-kit";

/** Why a tool call ran without asking, or was refused without asking. */
export type WorkflowToolPolicyProvenance = {
  decision: "auto_approved" | "denied";
  /** `"session_policy"` (contract v1). */
  source?: string;
  /** The selector that covered the call (`"tool"`, `"kind:web"`, `"all"`). */
  matched?: string;
  revision?: number;
  /** Who set the policy (`set_by.user_id`, else `set_by.client`). */
  setBy?: string;
  setAt?: string;
};

type Rec = Record<string, unknown>;
const obj = (value: unknown): Rec | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null);
const str = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/** The decision carried by an `abstract.tool_policy_decision` payload, or null when it is not one. */
export function toolPolicyDecision(payload: Rec | null): { provenance: WorkflowToolPolicyProvenance; calls: { callId: string; name: string; matched?: string }[] } | null {
  const decision = str(payload?.decision);
  if (decision !== "auto_approved" && decision !== "denied") return null;
  const policy = obj(payload?.policy);
  const setBy = obj(policy?.set_by);
  const who = str(setBy?.user_id) || str(setBy?.client);
  const revision = typeof policy?.revision === "number" ? policy.revision : undefined;
  const provenance: WorkflowToolPolicyProvenance = {
    decision,
    ...(str(payload?.source) ? { source: str(payload?.source) } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...(who ? { setBy: who } : {}),
    ...(str(policy?.set_at) ? { setAt: str(policy?.set_at) } : {}),
  };
  const calls = (Array.isArray(payload?.tool_calls) ? payload!.tool_calls as unknown[] : [])
    .map((row) => obj(row))
    .filter((row): row is Rec => Boolean(row && str(row.call_id)))
    .map((row) => ({ callId: str(row.call_id), name: str(row.name), ...(str(row.matched) ? { matched: str(row.matched) } : {}) }));
  // A decision about no identifiable call is not shown (it would attach to nothing).
  if (!calls.length) return null;
  return { provenance, calls };
}

/** "Allowed by this chat's policy (set by admin at Oct 27, 2026, 10:00)" / "Denied by this chat's policy".
 * One noun for the scope across the kit (ADR 0001 §5): "chat". */
export function toolPolicyDecisionText(provenance: WorkflowToolPolicyProvenance): string {
  if (provenance.decision === "denied") return "Denied by this chat's policy";
  const at = provenance.setAt ? formatExactTime(provenance.setAt) : "";
  const by = provenance.setBy ? `set by ${provenance.setBy}` : "";
  const detail = [by, at ? `at ${at}` : ""].filter(Boolean).join(" ");
  return `Allowed by this chat's policy${detail ? ` (${detail})` : ""}`;
}

/** "Not covered: send_email (not authorized); nope (unknown kind)" from a write's `clamped` list ("" when empty). */
export function sessionPolicyClampedText(clamped: readonly { selector?: string; name?: string; reason?: string }[] | null | undefined): string {
  const groups = new Map<string, string[]>();
  for (const row of clamped || []) {
    const name = str(row?.name);
    if (!name) continue;
    const reason = str(row?.reason).replace(/_/g, " ") || "not stored";
    groups.set(reason, [...(groups.get(reason) || []), name]);
  }
  if (!groups.size) return "";
  return `Not covered: ${[...groups].map(([reason, names]) => `${names.join(", ")} (${reason})`).join("; ")}`;
}
