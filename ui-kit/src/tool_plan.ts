// Tool selection, the pure half (ADR 0001, backlog 0033): which tools a run
// is offered and which of them ask first, from the gateway's catalog and the
// person's choices. No React, no transport: the component (ToolModeEditor)
// and every host that starts a run use these functions, so the rules below
// hold in one place.
//
// VOCABULARY. The canonical modes are `off | ask | auto`:
// - off:  the tool is not offered to the run;
// - ask:  the run asks before each call;
// - auto: the tool runs without asking.
// The word "approve" means AUTO in the kit v1 / desktop dialect
// (ToolPolicyEditor, abstractassistant/ui/settings/pages.py) and ASK in the
// entity-visit / iPhone dialect (routes/session_tools.py:56-62). It is
// normalized only at the edges (`normalizeToolMode(v, dialect)`); a bare
// "approve" with no dialect is refused (undefined), never guessed.
//
// THE FIVE RULES (each pinned by scripts/check_tool_plan.mjs):
// 1. A layer never offers a tool the gateway did not offer.
// 2. Layers are SPARSE (only differences from the layer below), so a tool the
//    gateway adds later follows the gateway's default (the watch model, not
//    the iPhone's full replacement map).
// 3. A diff equal to the inherited mode is deleted.
// 4. `tool_policy` is always sent once any layer holds a choice, so the
//    gateway's stored grant (tool_grants.py:248-297, injected only when the
//    client sent no `_runtime.tool_policy` key) never silently replaces an
//    explicit choice.
// 5. With no choice in any layer, `tool_policy` is omitted (and a stale key
//    removed) so the gateway's grant applies.

export type ToolMode = "off" | "ask" | "auto";
export const TOOL_MODES: readonly ToolMode[] = ["off", "ask", "auto"];

/** Where a non-canonical spelling comes from: "entity" (entity visits, the iPhone: approve = ask) or
 * "desktop" (the desktop app and ToolPolicyEditor v1: approve = auto, disabled = off). */
export type ToolModeDialect = "entity" | "desktop";

/** The canonical mode of a value, or undefined when it is not one. "approve" needs its dialect. */
export function normalizeToolMode(value: unknown, dialect?: ToolModeDialect): ToolMode | undefined {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "off" || v === "ask" || v === "auto") return v;
  if (v === "approve") return dialect === "entity" ? "ask" : dialect === "desktop" ? "auto" : undefined;
  if (v === "disabled" && dialect === "desktop") return "off";
  return undefined;
}

/** The spelling a dialect's wire takes for a canonical mode (the inverse edge of normalizeToolMode). */
export function toolModeInDialect(mode: ToolMode, dialect: ToolModeDialect): string {
  if (dialect === "entity") return mode === "ask" ? "approve" : mode;
  return mode === "auto" ? "approve" : mode === "off" ? "disabled" : "ask";
}

/** A server-reported state of a tool, shown as a badge (the server's words, never derived). */
export type ToolStateBadge = {
  label: string;
  tooltip?: string;
  tone?: "ok" | "warn" | "danger";
};

export type ToolCatalogItem = {
  name: string;
  description?: string;
  whenToUse?: string;
  /** The gateway's group (`toolset`); "other" when blank. */
  toolset: string;
  /** The gateway offers it to runs: `enabled !== false && available !== false`. */
  offered: boolean;
  /** off when not offered, else the served `approval_default` ("auto" → auto, anything else → ask). */
  gatewayDefault: ToolMode;
  riskRank?: number;
  riskTier?: string;
  /** The model chooses where the output goes (a URL, a recipient): never reached by bulk Auto or Approve all. */
  modelControlledDestination?: boolean;
  /** A per-call check may lower one call (`risk_refiner`): kept out of the always-ask list. */
  refined?: boolean;
  /** The gateway's reason the tool is off (`why_disabled`, else `enable_gate`). */
  whyDisabled?: string;
  /** The gateway's note on its approval default (`approval_note`, e.g. clamped to ask). */
  approvalNote?: string;
  state?: ToolStateBadge;
};

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function int(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

/**
 * The served catalog of `GET discovery/tools` (routes/gateway.py:15568-15668) as ToolCatalogItems.
 * Throws when the answer has no `items[]` (a broken answer must not read as "no tools").
 *
 * - `approval_default: "auto"|"ask"` is the served field (gateway.py:15615-15640; disabled rows are
 *   clamped to ask at tool_catalog.py:349-355; MCP rows are "ask" at gateway.py:15634-15642).
 *   `default_approval` (kit v1 spelling, "approve" = auto) is read as an alias only when the served
 *   field is absent.
 * - `available` is NOT served today (only `enabled`); `offered = enabled !== false && available !== false`
 *   keeps working unchanged if the gateway starts serving it (the Swift client already reads it).
 * - The sandbox badge is the gateway's own words: `sandbox` + `sandboxed` per row and
 *   `command_sandbox.sentence` (gateway.py:15645-15651, command_sandbox.py:158-190).
 */
export function normalizeToolCatalog(payload: unknown): ToolCatalogItem[] {
  const body = obj(payload);
  const items = body?.items;
  if (!Array.isArray(items)) {
    const why = str(body?.error);
    throw new Error(`The gateway's tool catalog has no items${why ? `: ${why}` : ""}.`);
  }
  const sandbox = obj(body?.command_sandbox);
  const sentence = str(sandbox?.sentence);
  const seen = new Set<string>();
  const out: ToolCatalogItem[] = [];
  for (const raw of items) {
    const row = obj(raw);
    const name = str(row?.name);
    if (!row || !name || seen.has(name)) continue;
    seen.add(name);
    const offered = row.enabled !== false && row.available !== false;
    const served = str(row.approval_default).toLowerCase();
    const alias = normalizeToolMode(row.default_approval, "desktop");
    const approval: ToolMode = served ? (served === "auto" ? "auto" : "ask") : alias === "auto" ? "auto" : "ask";
    const risk = obj(row.risk);
    const riskRank = int(row.risk_rank) ?? int(risk?.rank);
    const riskTier = str(row.risk_tier) || str(risk?.tier);
    const badgeLabel = str(row.sandbox);
    const state: ToolStateBadge | undefined =
      badgeLabel && typeof row.sandboxed === "boolean"
        ? {
            label: badgeLabel,
            ...(sentence ? { tooltip: sentence } : {}),
            tone: row.sandboxed ? "ok" : str(sandbox?.state) === "unsandboxed" ? "danger" : "warn",
          }
        : undefined;
    const why = str(row.why_disabled) || str(row.enable_gate);
    out.push({
      name,
      ...(str(row.description) ? { description: str(row.description) } : {}),
      ...(str(row.when_to_use) ? { whenToUse: str(row.when_to_use) } : {}),
      toolset: str(row.toolset) || "other",
      offered,
      gatewayDefault: offered ? approval : "off",
      ...(riskRank !== undefined ? { riskRank } : {}),
      ...(riskTier ? { riskTier } : {}),
      ...(row.model_controlled_destination === true ? { modelControlledDestination: true } : {}),
      ...(row.risk_refiner !== undefined && row.risk_refiner !== null ? { refined: true } : {}),
      ...(!offered && why ? { whyDisabled: why } : {}),
      ...(str(row.approval_note) ? { approvalNote: str(row.approval_note) } : {}),
      ...(state ? { state } : {}),
    });
  }
  out.sort((a, b) => (a.toolset === b.toolset ? a.name.localeCompare(b.name) : a.toolset.localeCompare(b.toolset)));
  return out;
}

/** One layer's choices: ONLY the tools whose mode differs from the layer below (sparse). */
export type ToolModeLayer = Readonly<Record<string, ToolMode>>;
/** The person's layers on top of the gateway: the app's defaults, then this conversation's changes. */
export type ToolLayers = { app?: ToolModeLayer | null; session?: ToolModeLayer | null };
export type ToolModeSource = "gateway" | "app" | "session";
export type ResolvedToolMode = {
  mode: ToolMode;
  /** The layer that set `mode`. */
  source: ToolModeSource;
  /** What the tool would be without the layer that set it (the "Default: X" of its row). */
  inherited: ToolMode;
};

function layerMode(layer: ToolModeLayer | null | undefined, name: string): ToolMode | undefined {
  if (!layer || !Object.prototype.hasOwnProperty.call(layer, name)) return undefined;
  return normalizeToolMode(layer[name]);
}

/** Every catalog tool's mode through the layers: session ?? app ?? gateway; a tool the gateway does
 * not offer is off whatever the layers say (rule 1). */
export function resolveToolModes(catalog: readonly ToolCatalogItem[], layers: ToolLayers = {}): Record<string, ResolvedToolMode> {
  const out: Record<string, ResolvedToolMode> = {};
  for (const item of catalog) {
    if (!item.offered) {
      out[item.name] = { mode: "off", source: "gateway", inherited: "off" };
      continue;
    }
    const gateway = item.gatewayDefault;
    const app = layerMode(layers.app, item.name);
    const session = layerMode(layers.session, item.name);
    if (session !== undefined) out[item.name] = { mode: session, source: "session", inherited: app ?? gateway };
    else if (app !== undefined) out[item.name] = { mode: app, source: "app", inherited: gateway };
    else out[item.name] = { mode: gateway, source: "gateway", inherited: gateway };
  }
  return out;
}

/** What an editor of `layer` inherits, per tool: the gateway's defaults under the app layer, the
 * app's resolved modes under the session layer. */
export function inheritedToolModes(catalog: readonly ToolCatalogItem[], layers: ToolLayers, layer: "app" | "session"): Record<string, ToolMode> {
  const below = resolveToolModes(catalog, layer === "app" ? {} : { app: layers.app });
  const out: Record<string, ToolMode> = {};
  for (const [name, r] of Object.entries(below)) out[name] = r.mode;
  return out;
}

/** Set one tool's mode in a sparse layer. A mode equal to the inherited one deletes the diff (rule 3);
 * a tool the gateway does not offer is never written (rule 1). */
export function setToolMode(layer: ToolModeLayer | null | undefined, item: ToolCatalogItem, mode: ToolMode, inherited: ToolMode): ToolModeLayer {
  const next: Record<string, ToolMode> = { ...(layer || {}) };
  if (!item.offered) {
    delete next[item.name];
    return next;
  }
  if (mode === inherited) delete next[item.name];
  else next[item.name] = mode;
  return next;
}

/** Bulk Auto reaches tools that read or make changes (risk rank 1-2) and whose destination the
 * assistant does not choose; the others are set to Auto one at a time (watch, desktop). */
export const BULK_AUTO_MAX_RANK = 2;
export function bulkAutoReaches(item: ToolCatalogItem): boolean {
  return item.offered && (item.riskRank ?? 4) <= BULK_AUTO_MAX_RANK && item.modelControlledDestination !== true;
}

/** Set a group's tools to one mode. Auto reaches only `bulkAutoReaches` tools; `skipped` names the
 * offered tools it left as they were. */
export function setGroupToolMode(
  layer: ToolModeLayer | null | undefined,
  items: readonly ToolCatalogItem[],
  mode: ToolMode,
  inherited: Readonly<Record<string, ToolMode>>,
): { layer: ToolModeLayer; skipped: string[] } {
  let next: ToolModeLayer = { ...(layer || {}) };
  const skipped: string[] = [];
  for (const item of items) {
    if (!item.offered) continue;
    if (mode === "auto" && !bulkAutoReaches(item)) {
      skipped.push(item.name);
      continue;
    }
    next = setToolMode(next, item, mode, inherited[item.name] ?? item.gatewayDefault);
  }
  return { layer: next, skipped };
}

/** Any layer holds a choice. An empty layer is the same as none ("Use the gateway's"). */
export function hasToolChoices(layers: ToolLayers = {}): boolean {
  return [layers.app, layers.session].some((l) => Boolean(l) && Object.keys(l as object).length > 0);
}

export type RunToolPolicy = { auto_approve_tools: string[]; require_approval_tools: string[] };
export type RunToolPlan = {
  /** `input_data.tools`: every tool not off. */
  tools: string[];
  /** `input_data._runtime.allowed_tools`: the run's ceiling (the same names). */
  allowed_tools: string[];
  /** `input_data._runtime.tool_policy`: present once any layer holds a choice (rules 4 and 5). */
  tool_policy?: RunToolPolicy;
  /** The resolved approval split, also when `tool_policy` is omitted (client-side approvers). */
  approval: { auto: string[]; ask: string[] };
};

/**
 * What a run receives. `ceiling` is the workflow's own `_runtime.allowed_tools` (a ceiling, never an
 * override: abstractcode's intersectToolPermissions): a tool outside it is off. A `refined` tool
 * stays offered but is kept out of `require_approval_tools` (its per-call check must stay on).
 */
export function planRunTools(
  catalog: readonly ToolCatalogItem[],
  layers: ToolLayers = {},
  opts: { ceiling?: readonly string[] | null } = {},
): RunToolPlan {
  const modes = resolveToolModes(catalog, layers);
  const ceiling = Array.isArray(opts.ceiling) ? new Set(opts.ceiling) : null;
  const tools: string[] = [];
  const auto: string[] = [];
  const ask: string[] = [];
  for (const item of [...catalog].sort((a, b) => a.name.localeCompare(b.name))) {
    const mode = ceiling && !ceiling.has(item.name) ? "off" : modes[item.name].mode;
    if (mode === "off") continue;
    tools.push(item.name);
    if (mode === "auto") auto.push(item.name);
    else if (!item.refined) ask.push(item.name);
  }
  return {
    tools,
    allowed_tools: [...tools],
    ...(hasToolChoices(layers) ? { tool_policy: { auto_approve_tools: [...auto], require_approval_tools: [...ask] } } : {}),
    approval: { auto, ask },
  };
}

type JsonObject = Record<string, unknown>;

/** `input_data` with the plan's tools: `tools`, `_runtime.allowed_tools`, and `_runtime.tool_policy`
 * when the plan has one, else that key removed (its mere presence suppresses the gateway's grant,
 * tool_grants.py:258-262). Never mutates its input. */
export function withRunTools(input_data: JsonObject | null | undefined, plan: RunToolPlan): JsonObject {
  const base: JsonObject = { ...(input_data || {}) };
  const runtime: JsonObject = { ...(obj(base._runtime) || {}) };
  runtime.allowed_tools = [...plan.allowed_tools];
  if (plan.tool_policy)
    runtime.tool_policy = {
      auto_approve_tools: [...plan.tool_policy.auto_approve_tools],
      require_approval_tools: [...plan.tool_policy.require_approval_tools],
    };
  else delete runtime.tool_policy;
  return { ...base, tools: [...plan.tools], _runtime: runtime };
}

/** panel-chat's `WorkflowToolApprovalPolicy` (workflow_runtime.ts:52): the tools a run may use and
 * those the client approves for the person. */
export type WorkflowToolApprovalPolicyShape = { enabledTools: string[]; autoApproveTools: string[] };
export function toWorkflowApprovalPolicy(plan: RunToolPlan): WorkflowToolApprovalPolicyShape {
  return { enabledTools: [...plan.tools], autoApproveTools: [...plan.approval.auto] };
}

/**
 * "Allow all enabled tools" (the watch rule, AppModel.swift:719-741): after approving `call` (the
 * tool names of the approved wait), trust every tool on Ask up to risk rank max(2, the call's
 * highest rank), never an outreach tool nor one whose destination the model chooses, plus the
 * call's own tools (but outreach). Off and unknown tools are never trusted. Returns the new trust
 * list (sorted, `prev` kept).
 */
export function trustAfterApproveAll(
  catalog: readonly ToolCatalogItem[],
  modes: Readonly<Record<string, ToolMode | ResolvedToolMode>>,
  call: readonly string[],
  prev: readonly string[] = [],
): string[] {
  const byName = new Map(catalog.map((t) => [t.name, t]));
  const modeOf = (name: string): ToolMode | undefined => {
    const m = modes[name];
    return typeof m === "string" ? m : m?.mode;
  };
  const approved = Math.max(BULK_AUTO_MAX_RANK, ...call.map((n) => byName.get(n)?.riskRank ?? 4));
  const out = new Set(prev);
  for (const t of catalog) {
    if (!t.offered || modeOf(t.name) !== "ask") continue;
    if (t.riskTier === "outreach" || t.modelControlledDestination === true) continue;
    if ((t.riskRank ?? 4) <= approved) out.add(t.name);
  }
  for (const n of call) {
    const t = byName.get(n);
    if (!t || !t.offered || t.riskTier === "outreach") continue;
    const m = modeOf(n);
    if (m && m !== "off") out.add(n);
  }
  return [...out].sort();
}

/** A tool-approval wait the client may answer for the person: every call is a known tool that runs
 * on Auto, or on Ask and trusted by an Approve all. */
export function approvalCovered(
  modes: Readonly<Record<string, ToolMode | ResolvedToolMode>>,
  trust: readonly string[],
  call: readonly string[],
): boolean {
  if (!call.length) return false;
  return call.every((n) => {
    const m = modes[n];
    const mode = typeof m === "string" ? m : m?.mode;
    return mode === "auto" || (mode === "ask" && trust.includes(n));
  });
}
