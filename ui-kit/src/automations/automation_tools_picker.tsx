import React from "react";
import { MultiSelect } from "../multi_select.js";

export function AutomationToolsPicker(props: {
  availableTools: string[];
  value: string[] | null;
  onChange(value: string[] | null): void;
  disabled?: boolean;
}): React.ReactElement {
  return <div className="af-auto__field" data-field="tool-selection">
    <label><input type="checkbox" checked={props.value === null} disabled={props.disabled}
      onChange={e => props.onChange(e.target.checked ? null : [])} /> Use workflow default tools</label>
    {props.value !== null ? <MultiSelect options={props.availableTools} value={props.value}
      disabled={props.disabled} placeholder="No tools enabled" onChange={props.onChange} /> : null}
    <p className="af-auto__hint">Choose which tools this automation can use. An empty selection disables tools. Gateway restrictions always apply.</p>
  </div>;
}
