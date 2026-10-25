import React from "react";
import { WorkflowPicker, type WorkflowPickerProps } from "../workflow_picker.js";
import type { AutomationTarget } from "./types.js";
import { automationTargetValue } from "./target_selection.js";

export type AutomationWorkflowPickerOptions = Omit<WorkflowPickerProps, "value" | "onChange">;
export function AutomationWorkflowPicker(props: { target: AutomationTarget; options: AutomationWorkflowPickerOptions; onChange(target: AutomationTarget): void }): React.ReactElement {
  const value = automationTargetValue(props.target);
  return <div className="af-auto__field"><span>Flow</span><WorkflowPicker {...props.options}
    ariaLabel="Automation flow" value={value} currentLabel={{ name: flowNameOf(value, props.options) }}
    onChange={(next, entry) => props.onChange(next === "@default"
      ? { flow_id: "@default", interface: props.options.interfaceId || props.options.defaultInterface || "abstractcode.agent.v1" }
      : { bundle_ref: `${entry!.bundleId}@${entry!.bundleVersion}`, flow_id: entry!.flowId })} /></div>;
}

/**
 * The flow's name for a value the list may not carry as such (another version): the listed
 * entry of the same bundle and flow, else the bundle's id without its version and flow hash
 * ("Python-digest", never "Python-digest@0.0.0:92abf314"; UX re-review #5).
 */
export function flowNameOf(value: string, options: Pick<AutomationWorkflowPickerOptions, "workflows">): string {
  const entries = options.workflows?.data?.entries ?? [];
  const exact = entries.find((e) => e.value === value);
  if (exact) return exact.name;
  const at = value.indexOf("@");
  const colon = value.lastIndexOf(":");
  const bundle = at > 0 ? value.slice(0, at) : colon > 0 ? value.slice(0, colon) : value;
  const flow = colon > 0 ? value.slice(colon + 1) : "";
  return entries.find((e) => e.bundleId === bundle && (!flow || e.flowId === flow))?.name || bundle || value;
}
