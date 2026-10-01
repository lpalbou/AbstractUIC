/*
 * Workflow picker — the pure half (no React): the request path, the parser of
 * the gateway's answer, and the grouping the picker renders.
 *
 * Which workflows a client may offer is decided by the GATEWAY, never by the
 * client (operator ruling 2026-10-01, DESIGN-v3 §5): an app asks
 * `GET /api/gateway/bundles?executable_for=<interface>` and lists exactly what
 * comes back — bundles with an entrypoint declaring the interface the app runs,
 * that the signed-in person may run (an admin's availability rules for shared
 * workflows, plus the person's own). There is no client-side "show all" path:
 * nothing here widens or narrows the list.
 *
 * The parser FAILS LOUDLY on a gateway that does not honour the contract
 * (no `executable_for` echo, an item without `owner`, an entrypoint that does
 * not declare the interface): such a gateway would hand the app workflows it
 * cannot run, and the picker would show them silently.
 */

/** The persisted choice "whatever the gateway's default workflow for this app is". */
export const WORKFLOW_PICKER_DEFAULT = "@default";

/** The sentence an empty list shows. */
export const WORKFLOW_PICKER_EMPTY = "No workflows available for this app — ask your admin.";

export type WorkflowPickerGroupId = "shared" | "mine";

/** Group headings (owner from the API: gateway → Shared, the caller → Mine). */
export const WORKFLOW_PICKER_GROUP_LABELS: Record<WorkflowPickerGroupId, string> = {
  shared: "Shared",
  mine: "Mine",
};

/** One runnable choice: a bundle version's entrypoint that declares the interface. */
export type WorkflowPickerEntry = {
  /** `bundle_id@bundle_version:flow_id` (the gateway's `workflow_id`). */
  value: string;
  bundleId: string;
  bundleVersion: string;
  flowId: string;
  name: string;
  description: string;
  registryScope: string;
  group: WorkflowPickerGroupId;
  shipped: boolean;
  /** The entrypoint's declared interfaces, as listed (always include the requested one). */
  interfaces: string[];
};

export type WorkflowPickerDefault =
  | { status: "ok"; name: string; bundleId: string; bundleVersion: string; flowId: string; workflowId: string }
  | { status: "unavailable"; reason: string };

export type ExecutableWorkflows = {
  interfaceId: string;
  entries: WorkflowPickerEntry[];
  gatewayDefault: WorkflowPickerDefault;
};

/** Thrown when the gateway's answer breaks the `executable_for` contract. */
export class WorkflowPickerContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowPickerContractError";
  }
}

/** The request path (relative to the gateway API, i.e. after `api/gateway/`). */
export function executableWorkflowsPath(interfaceId: string, options: { allVersions?: boolean } = {}): string {
  const id = String(interfaceId || "").trim();
  if (!id) throw new Error("executableWorkflowsPath needs the interface the app runs (e.g. abstractcode.agent.v1).");
  return `bundles?executable_for=${encodeURIComponent(id)}${options.allVersions ? "&all_versions=true" : ""}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const UPDATE = "update the gateway";

/** The gateway default for this interface, from `default_agent_workflows[<interface>]`. */
function defaultFrom(body: Record<string, unknown>, interfaceId: string): WorkflowPickerDefault {
  const defaults = record(body.default_agent_workflows);
  if (!defaults) return { status: "unavailable", reason: "the gateway does not report a default workflow" };
  const row = record(defaults[interfaceId]);
  if (!row) {
    const why = text(record(record(body.default_agent_workflows_unavailable)?.[interfaceId])?.reason);
    return { status: "unavailable", reason: why || `no default workflow for ${interfaceId}` };
  }
  const bundleId = text(row.bundle_id);
  const flowId = text(row.flow_id);
  if (!bundleId || !flowId) return { status: "unavailable", reason: "the gateway's default workflow is missing its bundle or flow" };
  const bundleVersion = text(row.bundle_version);
  return {
    status: "ok",
    name: text(row.name) || flowId,
    bundleId,
    bundleVersion,
    flowId,
    workflowId: text(row.workflow_id) || `${bundleId}${bundleVersion ? `@${bundleVersion}` : ""}:${flowId}`,
  };
}

/**
 * Parse `GET /bundles?executable_for=<interface>`. Throws
 * {@link WorkflowPickerContractError} when the answer is not an
 * executable-for listing of that interface.
 */
export function parseExecutableWorkflows(envelope: unknown, interfaceId: string): ExecutableWorkflows {
  const body = record(envelope);
  if (!body) throw new WorkflowPickerContractError("The gateway's workflow list is not a JSON object.");
  const echoed = text(body.executable_for);
  if (echoed !== interfaceId)
    throw new WorkflowPickerContractError(
      echoed
        ? `The gateway listed workflows for ${echoed}, not ${interfaceId}.`
        : `This gateway does not filter workflows per app (no executable_for in its answer): ${UPDATE}.`,
    );
  if (!Array.isArray(body.items)) throw new WorkflowPickerContractError("The gateway's workflow list has no items.");
  const entries: WorkflowPickerEntry[] = [];
  for (const raw of body.items) {
    const item = record(raw);
    const bundleId = text(item?.bundle_id);
    if (!item || !bundleId) throw new WorkflowPickerContractError("The gateway listed a workflow without a bundle id.");
    const owner = record(item.owner);
    const kind = text(owner?.kind);
    if (kind !== "gateway" && kind !== "user")
      throw new WorkflowPickerContractError(`The gateway did not say who owns ${bundleId} (owner missing): ${UPDATE}.`);
    if (typeof item.shipped !== "boolean")
      throw new WorkflowPickerContractError(`The gateway did not say whether ${bundleId} ships with it (shipped missing): ${UPDATE}.`);
    const bundleVersion = text(item.bundle_version);
    const entrypoints = Array.isArray(item.entrypoints) ? item.entrypoints : [];
    for (const rawEp of entrypoints) {
      const ep = record(rawEp);
      const flowId = text(ep?.flow_id);
      if (!ep || !flowId) continue;
      const interfaces = Array.isArray(ep.interfaces) ? ep.interfaces.map(text).filter(Boolean) : [];
      // Never filtered here: the gateway already did. An entrypoint that does
      // not declare the interface means the gateway ignored the contract.
      if (!interfaces.includes(interfaceId))
        throw new WorkflowPickerContractError(
          `The gateway offered ${bundleId}:${flowId}, which does not declare ${interfaceId}: ${UPDATE}.`,
        );
      entries.push({
        value: text(ep.workflow_id) || `${bundleId}${bundleVersion ? `@${bundleVersion}` : ""}:${flowId}`,
        bundleId,
        bundleVersion,
        flowId,
        name: text(ep.name) || text(record(item.metadata)?.name) || bundleId,
        description: text(ep.description) || text(item.description),
        registryScope: text(item.registry_scope) || "private",
        group: kind === "user" ? "mine" : "shared",
        shipped: item.shipped,
        interfaces,
      });
    }
  }
  return { interfaceId, entries, gatewayDefault: defaultFrom(body, interfaceId) };
}

export type WorkflowPickerGroup = { id: WorkflowPickerGroupId; label: string; entries: WorkflowPickerEntry[] };

/** Shared first, then Mine; an empty group is not rendered. Order inside a group: name, then newest version first. */
export function workflowPickerGroups(entries: readonly WorkflowPickerEntry[]): WorkflowPickerGroup[] {
  const order = (a: WorkflowPickerEntry, b: WorkflowPickerEntry) =>
    a.name.localeCompare(b.name) || b.bundleVersion.localeCompare(a.bundleVersion, undefined, { numeric: true }) || a.value.localeCompare(b.value);
  return (["shared", "mine"] as const)
    .map((id) => ({ id, label: WORKFLOW_PICKER_GROUP_LABELS[id], entries: entries.filter((e) => e.group === id).sort(order) }))
    .filter((g) => g.entries.length > 0);
}

/** The small detail line of an entry: its version (and flow when the bundle offers several). */
export function workflowEntryDetail(entry: WorkflowPickerEntry, all: readonly WorkflowPickerEntry[] = []): string {
  const siblings = all.filter((e) => e.bundleId === entry.bundleId && e.bundleVersion === entry.bundleVersion);
  const version = entry.bundleVersion ? `@${entry.bundleVersion}` : "";
  return siblings.length > 1 ? `${version} · ${entry.flowId}`.trim() : version;
}

/** The default entry: label "Gateway default", detail = what it resolves to (or why it can't). */
export function gatewayDefaultDetail(state: WorkflowPickerDefault | null): string {
  if (!state) return "";
  if (state.status === "unavailable") return state.reason;
  return `${state.name}${state.bundleVersion ? ` @${state.bundleVersion}` : ""}`;
}

/** Keyboard: the next highlighted index for a key in a list of `count` options (null = not a navigation key). */
export function workflowPickerNextIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(count - 1, current + 1);
  if (key === "ArrowUp") return current < 0 ? count - 1 : Math.max(0, current - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** One rendered option (the default entry has `entry: null`). */
export type WorkflowPickerRow = { key: string; value: string; name: string; detail: string; group: WorkflowPickerGroupId | null; entry: WorkflowPickerEntry | null };

/** Every option in display order: "Gateway default" (when offered), then Shared, then Mine. */
export function workflowPickerRows(data: ExecutableWorkflows | null, showDefault = true): WorkflowPickerRow[] {
  const entries = data?.entries ?? [];
  const out: WorkflowPickerRow[] = [];
  if (showDefault)
    out.push({ key: "default", value: WORKFLOW_PICKER_DEFAULT, name: "Gateway default", detail: gatewayDefaultDetail(data?.gatewayDefault ?? null), group: null, entry: null });
  for (const g of workflowPickerGroups(entries))
    for (const e of g.entries) out.push({ key: e.value, value: e.value, name: e.name, detail: workflowEntryDetail(e, entries), group: g.id, entry: e });
  return out;
}
