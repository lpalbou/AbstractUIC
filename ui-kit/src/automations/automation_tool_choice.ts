// What an automation's runs may do with each tool, and the Edit form's ONE tools choice
// (spec E): "Run without asking" · "Ask before each" · "Choose per tool".
//
// The runtime's rule this mirrors (abstractruntime automations/controller.py): a definition with
// a named `policy.tool_policy` runs through `apply_named_tool_policy` (listed Auto tools run,
// every other candidate asks, the target's tool list is the ceiling) and its `tool_approval` is
// not read; without one, `tool_approval: "auto"` grants the run's tools and `"ask"` asks for each.
import type { ToolCatalogItem, ToolMode } from "../tool_plan.js";
import { automationToolSelection } from "./tool_selection.js";
import type { AutomationNamedToolPolicy, JsonObject, ToolApprovalPolicy } from "./types.js";

export type AutomationToolChoice = ToolApprovalPolicy | "per_tool";

/** The definition fields the tool reading needs (a subset of `AutomationDefinition`). */
export type AutomationToolDefinition = {
  target: { input_data: JsonObject };
  policy: { tool_approval: ToolApprovalPolicy; tool_policy?: unknown };
};

const names = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))].sort() : []);

/** The definition's named policy, canonical (sorted, unique); null when it has none. */
export function namedToolPolicyOf(definition: { policy?: { tool_policy?: unknown } } | null | undefined): AutomationNamedToolPolicy | null {
  const raw = definition?.policy?.tool_policy;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as { auto_approve_tools?: unknown; require_approval_tools?: unknown };
  return { auto_approve_tools: names(p.auto_approve_tools), require_approval_tools: names(p.require_approval_tools) };
}

/** The choice the definition makes today: "per_tool" when it carries a named policy, else its `tool_approval`. */
export function automationToolChoice(definition: Pick<AutomationToolDefinition, "policy">): AutomationToolChoice {
  return namedToolPolicyOf(definition) ? "per_tool" : definition.policy.tool_approval;
}

/**
 * What each catalog tool does for the automation's runs: Off when the gateway does not offer it
 * or it is not among the automation's tools (`automationToolSelection`; null = the flow's own
 * tools, every offered tool); else, with a named policy, as listed (Auto / Ask) and Ask when
 * unmentioned; without one, `all` when given (the Edit form's "all Auto" / "all Ask" pre-fill),
 * else the definition's `tool_approval`.
 */
export function automationToolModes(catalog: readonly ToolCatalogItem[], definition: AutomationToolDefinition, all?: ToolApprovalPolicy): Record<string, ToolMode> {
  const list = automationToolSelection(definition.target.input_data);
  const named = namedToolPolicyOf(definition);
  const out: Record<string, ToolMode> = {};
  for (const t of catalog) {
    if (!t.offered || (list && !list.includes(t.name))) out[t.name] = "off";
    else if (named) out[t.name] = named.auto_approve_tools.includes(t.name) && !named.require_approval_tools.includes(t.name) ? "auto" : "ask";
    else out[t.name] = all ?? definition.policy.tool_approval;
  }
  return out;
}

/** The named policy of per-tool modes: Auto tools, Ask tools (sorted); Off tools are in neither. */
export function namedToolPolicyFromModes(modes: Readonly<Record<string, ToolMode>>): AutomationNamedToolPolicy {
  const pick = (m: ToolMode) => Object.keys(modes).filter((k) => modes[k] === m).sort();
  return { auto_approve_tools: pick("auto"), require_approval_tools: pick("ask") };
}

/** The tools that are on (Auto or Ask), sorted: the automation's tool list for a per-tool choice. */
export function toolsOnOf(modes: Readonly<Record<string, ToolMode>>): string[] {
  return Object.keys(modes).filter((k) => modes[k] === "auto" || modes[k] === "ask").sort();
}

const sameModes = (a: Readonly<Record<string, ToolMode>>, b: Readonly<Record<string, ToolMode>>): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

/**
 * The Edit form's tools values for a per-tool choice. Modes equal to the pre-fill = untouched:
 * nothing is written (`toolPolicy` undefined, the approval and tool list as they were). Otherwise
 * the named policy, `toolApproval` "ask" when any tool asks (else "auto"), and the tool list: the
 * tools left on when that set differs from the pre-fill's, else the list as it was. An automation
 * WITHOUT a tool list (it runs its flow's own tools) gets the tools left on written: the selection
 * replaces the flow's own set (the Edit form says so before any change).
 */
export function perToolRevise(
  modes: Readonly<Record<string, ToolMode>>,
  prefill: Readonly<Record<string, ToolMode>>,
  initial: { toolApproval: ToolApprovalPolicy; tools: string[] | null },
): { toolPolicy?: AutomationNamedToolPolicy; toolApproval: ToolApprovalPolicy; tools: string[] | null } {
  if (sameModes(modes, prefill)) return { toolApproval: initial.toolApproval, tools: initial.tools };
  const toolPolicy = namedToolPolicyFromModes(modes);
  const on = toolsOnOf(modes);
  const onBefore = toolsOnOf(prefill);
  return {
    toolPolicy,
    toolApproval: toolPolicy.require_approval_tools.length ? "ask" : "auto",
    // An automation without a tool list runs its flow's own tools, which no host can read: a per-tool
    // choice then REPLACES them with this selection (the form says so), never a silent widening of a
    // list that was kept.
    tools: initial.tools !== null && JSON.stringify(on) === JSON.stringify(onBefore) ? initial.tools : on,
  };
}
