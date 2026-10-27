import React from "react";
import { AfSelect, type AfSelectOption } from "./af_select.js";

export type ProviderOption = {
  name: string;
  display_name?: string;
};

function normalize_provider_options(items: ProviderOption[]): ProviderOption[] {
  const seen = new Set<string>();
  const out: ProviderOption[] = [];
  for (const it of items || []) {
    if (!it || typeof it !== "object") continue;
    const name = String(it.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, display_name: typeof it.display_name === "string" ? it.display_name : undefined });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function normalize_models(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of items || []) {
    const s = String(m || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  out.sort();
  return out;
}

export type ProviderModelSelectProps = {
  provider: string;
  model: string;
  providers: ProviderOption[];
  models: string[];
  /** What a model is shown as (e.g. "Qwen/…-Base (clones)"); absent = its id. */
  modelDisplayNames?: Record<string, string>;
  onChange: (next: { provider: string; model: string }) => void;

  disabled?: boolean;
  layout?: "stack" | "row";
  className?: string;
  selectClassName?: string;

  allowGatewayDefault?: boolean; // enables empty option
  gatewayDefaultLabel?: string;
  providerLabel?: string;
  modelLabel?: string;
  providerPlaceholder?: string;
  modelPlaceholder?: string;
  loadingProviders?: boolean;
  loadingModels?: boolean;
  providerError?: string;
  modelError?: string;
  allowCustomProvider?: boolean;
  allowCustomModel?: boolean;
  /** ui-primitives (tools-models): a current provider/model the discovered list no longer has stays
   * selectable, labeled "(saved)" once its list has loaded without an error. `true` marks any such
   * value; `{provider, model}` marks only those stored values (a value typed now is not "saved"). */
  markSaved?: boolean | { provider?: string; model?: string };
  /** The provider / model comes from a connected pin (a flow node): shown, not editable. */
  providerPinned?: boolean;
  modelPinned?: boolean;
};

/** The words a field fed by a connected pin shows instead of its control. */
export const PINNED_FIELD_TEXT = "Provided by connected pin";

export function ProviderModelSelect(props: ProviderModelSelectProps): React.ReactElement {
  const disabled = props.disabled === true;
  const layout = props.layout || "stack";
  const allow_gateway_default = props.allowGatewayDefault !== false;
  const gateway_default_label = String(props.gatewayDefaultLabel || "(gateway default)");

  const provider_label = String(props.providerLabel || "Provider");
  const model_label = String(props.modelLabel || "Model");
  const provider_placeholder = String(props.providerPlaceholder || "(select)");
  const model_placeholder = String(props.modelPlaceholder || "(select)");

  const provider_value = String(props.provider || "").trim();
  const model_value = String(props.model || "").trim();

  const providers = normalize_provider_options(props.providers);
  const models = normalize_models(props.models);
  const savedOnly = typeof props.markSaved === "object" ? props.markSaved : null;
  const saved = (v: string, field: "provider" | "model", loading: boolean | undefined, error: string | undefined) =>
    props.markSaved && !loading && !error && (!savedOnly || savedOnly[field] === v) ? `${v} (saved)` : v;

  const provider_disabled = disabled || Boolean(props.loadingProviders);
  const model_disabled = disabled || Boolean(props.loadingModels);

  const provider_options: AfSelectOption[] = [
    ...(allow_gateway_default ? [{ value: "", label: gateway_default_label } satisfies AfSelectOption] : []),
    ...providers.map((p) => ({ value: p.name, label: p.display_name ? `${p.display_name} (${p.name})` : p.name })),
    ...(props.markSaved && provider_value && !providers.some((p) => p.name === provider_value)
      ? [{ value: provider_value, label: saved(provider_value, "provider", props.loadingProviders, props.providerError) }]
      : []),
  ];

  const model_options: AfSelectOption[] = [
    ...(allow_gateway_default ? [{ value: "", label: gateway_default_label } satisfies AfSelectOption] : []),
    ...models.map((m) => ({ value: m, label: props.modelDisplayNames?.[m] || m })),
    ...(props.markSaved && model_value && !models.includes(model_value)
      ? [{ value: model_value, label: saved(model_value, "model", props.loadingModels, props.modelError) }]
      : []),
  ];
  const pinned = (label: string, value: string) => (
    <div className="af-pmp__pinned" data-pinned={label}>
      <span className="af-pmp__pinned-text">{PINNED_FIELD_TEXT}</span>
      {value ? <span className="mono muted"> · {value}</span> : null}
    </div>
  );

  return (
    <div
      className={props.className}
      style={
        layout === "row"
          ? { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start" }
          : { display: "flex", flexDirection: "column", gap: "10px" }
      }
    >
      <div style={layout === "row" ? { flex: "1 1 260px", minWidth: 240 } : undefined}>
        <label>{provider_label}</label>
        {props.providerPinned ? pinned("provider", provider_value) : <AfSelect
          value={provider_value}
          options={provider_options}
          placeholder={allow_gateway_default ? gateway_default_label : provider_placeholder}
          disabled={provider_disabled}
          loading={Boolean(props.loadingProviders)}
          searchable
          allowCustom={props.allowCustomProvider === true}
          clearable={allow_gateway_default}
          variant="panel"
          triggerClassName={props.selectClassName}
          ariaLabel={provider_label}
          onChange={(next_provider) => props.onChange({ provider: String(next_provider || "").trim(), model: "" })}
        />}
        {props.loadingProviders ? <div className="mono muted" style={{ fontSize: "12px", marginTop: "6px" }}>Loading providers…</div> : null}
        {props.providerError ? (
          <div className="mono" style={{ color: "var(--error)", fontSize: "12px", marginTop: "6px" }}>
            {props.providerError}
          </div>
        ) : null}
      </div>

      <div style={layout === "row" ? { flex: "1 1 260px", minWidth: 240 } : undefined}>
        <label>{model_label}</label>
        {props.modelPinned ? pinned("model", model_value) : <AfSelect
          value={model_value}
          options={model_options}
          placeholder={allow_gateway_default ? gateway_default_label : model_placeholder}
          disabled={model_disabled}
          loading={Boolean(props.loadingModels)}
          searchable
          allowCustom={props.allowCustomModel === true}
          clearable={allow_gateway_default}
          variant="panel"
          triggerClassName={props.selectClassName}
          ariaLabel={model_label}
          onChange={(next_model) => props.onChange({ provider: provider_value, model: String(next_model || "").trim() })}
        />}
        {props.loadingModels ? <div className="mono muted" style={{ fontSize: "12px", marginTop: "6px" }}>Loading models…</div> : null}
        {props.modelError ? (
          <div className="mono" style={{ color: "var(--error)", fontSize: "12px", marginTop: "6px" }}>
            {props.modelError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
