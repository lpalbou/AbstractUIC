import React from "react";
import { AfSelect } from "./af_select.js";
import { speculationCapability, speculationSelection, speculationFromSelection, type SpeculationValue } from "./speculation_control.js";

/** Read-only discovery plus request intent; never loads/downloads a model. */
export function SpeculationSelect(props: {
  value?: SpeculationValue;
  onChange: (value: SpeculationValue | undefined) => void;
  capabilities?: unknown;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  inheritLabel?: string;
}): React.ReactElement {
  const caps = speculationCapability(props.capabilities);
  const selected = speculationSelection(props.value);
  const advertised = caps?.supported_depths.map(String) || [];
  const inherited = speculationSelection(caps?.default);
  const inherit = props.inheritLabel || "Workflow / Gateway default";
  const inheritCaption = inherited ? `${inherit} (${inherited === "off" ? "Off" : `depth ${inherited}`})` : inherit;
  const note = props.error || (props.loading ? "Checking MTP capability…" : !caps
    ? "MTP capability unknown; no depth is assumed."
    : caps.reason || (caps.requires_reload ? "Model reload required before MTP can run."
      : caps.ready === false ? "MTP is supported but not ready on this instance."
      : caps.ready === null && caps.supported ? "MTP support verified; loaded-instance readiness is unknown."
      : !caps.supported ? "MTP is not supported on this model/backend." : ""));
  return <div className="af-pmp__speculation">
    <label>MTP depth</label>
    <AfSelect ariaLabel="MTP depth" value={selected} placeholder={inheritCaption}
      disabled={props.disabled || props.loading}
      options={[
        { value: "", label: inheritCaption },
        { value: "off", label: "Off" },
        ...advertised.map(value => ({ value, label: `Depth ${value}` })),
        ...(selected && selected !== "off" && !advertised.includes(selected)
          ? [{ value: selected, label: `Depth ${selected} (saved; not available)` }] : []),
      ]}
      onChange={value => props.onChange(speculationFromSelection(value))} />
    {note ? <div role="status" className="af-pmp__hint">{note}</div> : null}
  </div>;
}
