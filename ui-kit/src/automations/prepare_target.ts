import type { AutomationTarget, JsonObject } from "./types.js";
import type { AutomationWorkflowPickerOptions } from "./automation_workflow_picker.js";

/** Validate required pins before switching an existing automation; no hidden input editor. */
export async function prepareAutomationTarget(target: AutomationTarget, options: AutomationWorkflowPickerOptions): Promise<AutomationTarget> {
  const entry = target.flow_id === "@default" ? options.workflows?.data?.gatewayDefault : null;
  const ref = "bundle_ref" in target ? target.bundle_ref : entry?.status === "ok" ? `${entry.bundleId}@${entry.bundleVersion}` : "";
  const flow = target.flow_id !== "@default" ? target.flow_id : entry?.status === "ok" ? entry.flowId : "";
  if (!ref || !flow || !options.request) throw new Error("Workflow inputs could not be checked. Refresh the workflow list and try again.");
  const at = ref.lastIndexOf("@");
  const bundle = at < 0 ? ref : ref.slice(0, at), version = at < 0 ? "" : ref.slice(at + 1);
  const raw = await options.request(`bundles/${encodeURIComponent(bundle)}/flows/${encodeURIComponent(flow)}/input_schema${version ? `?bundle_version=${encodeURIComponent(version)}` : ""}`, { signal: new AbortController().signal }) as any;
  const schema = raw?.input_data_schema || raw;
  if (!schema || typeof schema !== "object" || !schema.properties) throw new Error("This workflow does not report its input requirements. Choose another workflow.");
  const input: JsonObject = { ...(raw.defaults || {}) };
  for (const [key, field] of Object.entries(schema.properties) as Array<[string, any]>) if (field && "default" in field) input[key] = field.default;
  Object.assign(input, target.input_data || {});
  const missing = (Array.isArray(schema.required) ? schema.required : []).filter((key: string) => input[key] === undefined);
  if (missing.length) throw new Error(`This workflow needs additional inputs: ${missing.join(", ")}. Configure a new automation from that workflow's input form, or choose a compatible workflow.`);
  return { ...target, input_data: input };
}
