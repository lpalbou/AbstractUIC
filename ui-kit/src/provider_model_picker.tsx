// ProviderModelPicker — the WIRED provider/model control (operator directive
// 2026-07-13 17:28, absorbed from continuum's kit-shaped copy on the c1551
// ask; abstractflow's PropertiesPanel carries the original pattern).
//
// Contract:
// - "Gateway default" is the DEFAULT mode: empty provider+model = the
//   gateway picks its configured defaults for the task. Zero discovery
//   traffic in this mode.
// - Custom mode: provider dropdown (lazy-fetched on first entry) -> picking
//   a provider refetches its model list -> model dropdown.
// - Transport is INJECTED (fetchProviders/fetchModels) — the kit never bakes
//   an app's proxy path or client (the useGatewayVoice precedent). Flow
//   wraps /api/providers, continuum wraps /api/gateway/discovery/*.
// - Degraded discovery renders a labeled #FALLBACK line, never a crash
//   (Array.isArray guard — the 2026-02-14 abstractflow crash class lives in
//   the consumers' fetchers; this component guards its own inputs too).
//
// The presentational half is the existing ProviderModelSelect — this file
// adds mode + cascade + fetch state only.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProviderModelSelect, type ProviderOption } from "./provider_model_select.js";

export type ProviderModelPickerValue = {
  /** Empty strings = gateway default (the default mode). */
  provider: string;
  model: string;
};

export type ProviderModelPickerProps = {
  value: ProviderModelPickerValue;
  onChange: (next: ProviderModelPickerValue) => void;

  /** Injected transports. Return shapes are normalized defensively. */
  fetchProviders: () => Promise<ProviderOption[]>;
  fetchModels: (provider: string) => Promise<string[]>;

  disabled?: boolean;
  /** Copy describing what the gateway default applies to (task family). */
  defaultHint?: string;
  defaultModeLabel?: string;
  customModeLabel?: string;
  providerLabel?: string;
  modelLabel?: string;
  className?: string;
  /** Allow free-typed provider/model names in custom mode (default true —
   * a configured-but-undiscovered provider must stay reachable). */
  allowCustom?: boolean;
};

export function ProviderModelPicker(props: ProviderModelPickerProps): React.ReactElement {
  const disabled = props.disabled === true;
  const value = props.value || { provider: "", model: "" };
  const isDefault = !String(value.provider || "").trim() && !String(value.model || "").trim();

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  // One-shot lazy provider load on first entry into custom mode; a mounted
  // guard is not enough — StrictMode double-runs effects (the connection
  // hook's booted-ref lesson).
  const providersLoaded = useRef(false);
  // Generation counter drops stale async results (a slow models fetch for
  // provider A must not land after the user picked provider B — the same
  // class fixed twice today in the voice/connection hooks).
  const fetchGen = useRef(0);

  useEffect(() => {
    if (isDefault || disabled || providersLoaded.current) return;
    providersLoaded.current = true;
    const gen = ++fetchGen.current;
    setProvidersLoading(true);
    void (async () => {
      try {
        const res = await props.fetchProviders();
        if (fetchGen.current !== gen) return;
        setProviders(Array.isArray(res) ? res : []);
        setProvidersError("");
      } catch (e: any) {
        if (fetchGen.current !== gen) return;
        setProviders([]);
        setProvidersError(`#FALLBACK provider discovery failed: ${String(e?.message || e)}`);
      } finally {
        if (fetchGen.current === gen) setProvidersLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDefault, disabled]);

  const providerName = String(value.provider || "").trim();
  useEffect(() => {
    if (!providerName || disabled) {
      setModels([]);
      setModelsError("");
      return;
    }
    const gen = ++fetchGen.current;
    setModelsLoading(true);
    setModelsError("");
    void (async () => {
      try {
        const res = await props.fetchModels(providerName);
        if (fetchGen.current !== gen) return;
        setModels(Array.isArray(res) ? res : []);
      } catch (e: any) {
        if (fetchGen.current !== gen) return;
        setModels([]);
        setModelsError(`#FALLBACK model discovery failed: ${String(e?.message || e)}`);
      } finally {
        if (fetchGen.current === gen) setModelsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerName, disabled]);

  // A configured-but-undiscovered provider/model stays selectable (older
  // config, discovery lane blind spots).
  const providerOptions = useMemo(() => {
    const out = [...providers];
    if (providerName && !out.some((p) => p.name === providerName)) out.unshift({ name: providerName });
    return out;
  }, [providers, providerName]);

  const modelName = String(value.model || "").trim();
  const modelOptions = useMemo(() => {
    const out = [...models];
    if (modelName && !out.includes(modelName)) out.unshift(modelName);
    return out;
  }, [models, modelName]);

  const defaultLabel = props.defaultModeLabel || "Gateway default";
  const customLabel = props.customModeLabel || "Custom";

  return (
    <div className={`af-pmp${props.className ? ` ${props.className}` : ""}`}>
      <div className="af-pmp__seg" role="tablist" aria-label="Provider mode">
        <button
          type="button"
          role="tab"
          aria-selected={isDefault}
          className={`af-pmp__seg-btn${isDefault ? " is-active" : ""}`}
          onClick={() => props.onChange({ provider: "", model: "" })}
          disabled={disabled}
        >
          {defaultLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isDefault}
          className={`af-pmp__seg-btn${!isDefault ? " is-active" : ""}`}
          onClick={() => {
            if (isDefault) props.onChange({ provider: providerOptions[0]?.name || "", model: "" });
          }}
          disabled={disabled}
        >
          {customLabel}
        </button>
      </div>

      {isDefault ? (
        <div className="af-pmp__hint">
          {props.defaultHint || "The gateway picks its configured default provider and model for this task."}
        </div>
      ) : (
        <ProviderModelSelect
          provider={providerName}
          model={modelName}
          providers={providerOptions}
          models={modelOptions}
          disabled={disabled}
          loadingProviders={providersLoading}
          loadingModels={modelsLoading}
          providerError={providersError || undefined}
          modelError={modelsError || undefined}
          providerLabel={props.providerLabel}
          modelLabel={props.modelLabel}
          allowGatewayDefault={false}
          allowCustomProvider={props.allowCustom !== false}
          allowCustomModel={props.allowCustom !== false}
          onChange={(next) => props.onChange({ provider: next.provider, model: next.model })}
        />
      )}
    </div>
  );
}
