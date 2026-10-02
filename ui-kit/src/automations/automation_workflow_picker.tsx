import React from "react";
import { WorkflowPicker, type WorkflowPickerProps } from "../workflow_picker.js";
import type { AutomationTarget } from "./types.js";
import { automationTargetValue } from "./target_selection.js";

export type AutomationWorkflowPickerOptions = Omit<WorkflowPickerProps, "value" | "onChange">;
export function AutomationWorkflowPicker(props: { target: AutomationTarget; options: AutomationWorkflowPickerOptions; onChange(target: AutomationTarget): void }): React.ReactElement {
  const value = automationTargetValue(props.target);
  return <div className="af-auto__field"><span>Workflow</span><WorkflowPicker {...props.options}
    ariaLabel="Automation workflow" value={value} currentLabel={{ name: value }}
    onChange={(next, entry) => props.onChange(next === "@default"
      ? { flow_id: "@default", interface: props.options.interfaceId || props.options.defaultInterface || "abstractcode.agent.v1" }
      : { bundle_ref: `${entry!.bundleId}@${entry!.bundleVersion}`, flow_id: entry!.flowId })} /></div>;
}
