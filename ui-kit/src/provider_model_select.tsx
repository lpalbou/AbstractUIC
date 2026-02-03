import React from "react";
import { AfSelect, type AfSelectOption } from "./af_select";

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
};

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

  const provider_disabled = disabled || Boolean(props.loadingProviders);
  const model_disabled = disabled || Boolean(props.loadingModels);

  const provider_options: AfSelectOption[] = [
    ...(allow_gateway_default ? [{ value: "", label: gateway_default_label } satisfies AfSelectOption] : []),
    ...providers.map((p) => ({ value: p.name, label: p.display_name ? `${p.display_name} (${p.name})` : p.name })),
  ];

  const model_options: AfSelectOption[] = [
    ...(allow_gateway_default ? [{ value: "", label: gateway_default_label } satisfies AfSelectOption] : []),
    ...models.map((m) => ({ value: m, label: m })),
  ];

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
        <AfSelect
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
          onChange={(next_provider) => props.onChange({ provider: String(next_provider || "").trim(), model: "" })}
        />
        {props.loadingProviders ? <div className="mono muted" style={{ fontSize: "12px", marginTop: "6px" }}>Loading providers…</div> : null}
        {props.providerError ? (
          <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "12px", marginTop: "6px" }}>
            {props.providerError}
          </div>
        ) : null}
      </div>

      <div style={layout === "row" ? { flex: "1 1 260px", minWidth: 240 } : undefined}>
        <label>{model_label}</label>
        <AfSelect
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
          onChange={(next_model) => props.onChange({ provider: provider_value, model: String(next_model || "").trim() })}
        />
        {props.loadingModels ? <div className="mono muted" style={{ fontSize: "12px", marginTop: "6px" }}>Loading models…</div> : null}
        {props.modelError ? (
          <div className="mono" style={{ color: "rgba(239, 68, 68, 0.9)", fontSize: "12px", marginTop: "6px" }}>
            {props.modelError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
