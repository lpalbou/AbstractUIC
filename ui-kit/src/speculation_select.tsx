import React from "react";
import { AfSelect } from "./af_select.js";
import { speculationCapability, speculationSelection, speculationFromSelection, type SpeculationValue } from "./speculation_control.js";
import { usableSpeculation } from "./model_options.js";

/** Shown when no capability card says the selected model supports MTP. */
export const SPECULATION_UNKNOWN = "MTP is offered when the gateway confirms this model supports it.";
export const SPECULATION_UNSUPPORTED = "This model does not support MTP.";

/** Read-only discovery plus request intent; never loads/downloads a model.
 * Operator rule 2026-11-07: Off and the depths are offered only when the capability card of the
 * SELECTED model says MTP is supported; otherwise the control is disabled on the gateway default,
 * says why, and a saved value is not shown as chosen (the host sends it only through
 * `usableSpeculation` / `resolveSendableModelOptions`, which drop it). */
export function SpeculationSelect(props: {
  value?: SpeculationValue;
  onChange: (value: SpeculationValue | undefined) => void;
  capabilities?: unknown;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  inheritLabel?: string;
  /** The host shows one shared note instead (e.g. discovery unavailable for reasoning AND MTP). */
  hideNote?: boolean;
}): React.ReactElement {
  const caps = speculationCapability(props.capabilities);
  const supported = caps?.supported === true;
  const selected = supported ? speculationSelection(usableSpeculation(props.value, props.capabilities)) : "";
  const advertised = supported ? caps!.supported_depths.map(String) : [];
  const inherited = supported ? speculationSelection(caps?.default) : "";
  const inherit = props.inheritLabel || "Workflow / Gateway default";
  const inheritCaption = inherited ? `${inherit} (${inherited === "off" ? "Off" : `depth ${inherited}`})` : inherit;
  const note = props.error || (props.loading ? "Checking whether this model supports MTP…" : !caps
    ? SPECULATION_UNKNOWN
    : !caps.supported ? caps.message || SPECULATION_UNSUPPORTED
    : caps.message || (caps.requires_reload ? "Model reload required before MTP can run."
      : caps.ready === false ? "MTP is supported but not ready on this instance."
      : caps.ready === null ? "MTP support verified; loaded-instance readiness is unknown." : ""));
  // The gateway's own reason code stays readable under Technical details, never as the main text.
  const detail = !props.error && !props.loading && caps?.reason ? caps.reason : "";
  return <div className="af-pmp__speculation" data-speculation={props.loading ? "loading" : supported ? "supported" : caps ? "unsupported" : "unknown"}>
    <label>MTP depth</label>
    <AfSelect ariaLabel="MTP depth" value={selected} placeholder={inheritCaption}
      disabled={props.disabled || props.loading || !supported}
      options={[
        { value: "", label: inheritCaption },
        ...(supported ? [{ value: "off", label: "Off" }] : []),
        ...advertised.map(value => ({ value, label: `Depth ${value}` })),
      ]}
      onChange={value => props.onChange(speculationFromSelection(value))} />
    {note && !props.hideNote ? <div role="status" className="af-pmp__hint">{note}{detail ? <details className="af-pmp__details">
      <summary>Technical details</summary><span>{detail}</span></details> : null}</div> : null}
  </div>;
}
