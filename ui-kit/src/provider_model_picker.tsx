// ProviderModelPicker — the WIRED provider/model control (operator directive
// 2026-07-13 17:28, absorbed from continuum's kit-shaped copy on the c1551
// ask; abstractflow's PropertiesPanel carries the original pattern).
//
// Contract:
// - "Gateway default" is the DEFAULT mode: empty provider+model = the
//   gateway picks its configured defaults for the task. Zero discovery
//   provider/model listing traffic in this mode. Optional reasoning discovery
//   may inspect the effective default without pinning it into the value.
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
import {
  ProviderModelSelect,
  type ProviderOption,
} from "./provider_model_select.js";
import { AfSelect } from "./af_select.js";
import { SpeculationSelect } from "./speculation_select.js";
import type { SpeculationValue } from "./speculation_control.js";

export type ProviderModelPickerValue = {
  /** Empty strings = gateway default (the default mode). */
  provider: string;
  model: string;
  reasoning?: string;
  speculation?: SpeculationValue;
};

export type ProviderModelPickerProps = {
  value: ProviderModelPickerValue;
  onChange: (next: ProviderModelPickerValue) => void;

  /** Injected transports. Return shapes are normalized defensively. */
  fetchProviders: () => Promise<ProviderOption[]>;
  fetchModels: (provider: string) => Promise<string[]>;
  /** Optional model-aware reasoning control. No guessed model-name heuristics. */
  fetchModelCapabilities?: (
    model: string,
    provider: string,
  ) => Promise<unknown>;
  /** Used for capability discovery only; empty values still inherit server defaults. */
  effectiveDefault?: { provider: string; model: string };
  reasoningLabel?: string;
  /** Enable only for text routes; uses execution capability, never model names. */
  enableSpeculation?: boolean;

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

export function ProviderModelPicker(
  props: ProviderModelPickerProps,
): React.ReactElement {
  const disabled = props.disabled === true;
  const value = props.value || { provider: "", model: "" };
  const empty =
    !String(value.provider || "").trim() && !String(value.model || "").trim();
  const [custom, setCustom] = useState(!empty);
  const isDefault = empty && !custom;
  const previousEmpty = useRef(empty);
  useEffect(() => {
    if (empty && !previousEmpty.current) setCustom(false);
    previousEmpty.current = empty;
  }, [empty]);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  // One-shot lazy provider load on first entry into custom mode; a mounted
  // guard is not enough — StrictMode double-runs effects (the connection
  // hook's booted-ref lesson).
  // Generation counter drops stale async results (a slow models fetch for
  // provider A must not land after the user picked provider B — the same
  // class fixed twice today in the voice/connection hooks).
  const fetchers = useRef(props);
  fetchers.current = props;

  useEffect(() => {
    if (isDefault || disabled) return;
    let alive = true;
    setProvidersLoading(true);
    void (async () => {
      try {
        const res = await fetchers.current.fetchProviders();
        if (!alive) return;
        setProviders(Array.isArray(res) ? res : []);
        setProvidersError("");
      } catch (e: any) {
        if (!alive) return;
        setProviders([]);
        setProvidersError(
          `#FALLBACK provider discovery failed: ${String(e?.message || e)}`,
        );
      } finally {
        if (alive) setProvidersLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isDefault, disabled]);

  const providerName = String(value.provider || "").trim();
  useEffect(() => {
    if (!providerName || disabled) {
      setModels([]);
      setModelsError("");
      setModelsLoading(false);
      return;
    }
    let alive = true;
    setModels([]);
    setModelsLoading(true);
    setModelsError("");
    void (async () => {
      try {
        const res = await fetchers.current.fetchModels(providerName);
        if (!alive) return;
        setModels(Array.isArray(res) ? res : []);
      } catch (e: any) {
        if (!alive) return;
        setModels([]);
        setModelsError(
          `#FALLBACK model discovery failed: ${String(e?.message || e)}`,
        );
      } finally {
        if (alive) setModelsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [providerName, disabled]);

  // A configured-but-undiscovered provider/model stays selectable (older
  // config, discovery lane blind spots).
  const providerOptions = useMemo(() => {
    const out = [...providers];
    if (providerName && !out.some((p) => p.name === providerName))
      out.unshift({ name: providerName });
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
  const effectiveProvider =
    providerName || props.effectiveDefault?.provider || "";
  const effectiveModel =
    modelName || (!providerName ? props.effectiveDefault?.model : "") || "";
  const [reasoning, setReasoning] = useState<{
    levels: string[];
    error: string;
    loading: boolean;
  }>({ levels: [], error: "", loading: false });
  const hasCapabilities = Boolean(props.fetchModelCapabilities);
  const [capabilityPayload, setCapabilityPayload] = useState<unknown>();
  useEffect(() => {
    let alive = true;
    setCapabilityPayload(undefined);
    setReasoning({
      levels: [],
      error: "",
      loading: hasCapabilities && Boolean(effectiveModel),
    });
    if (!hasCapabilities || !effectiveModel || disabled) return;
    void fetchers.current.fetchModelCapabilities!(
      effectiveModel,
      effectiveProvider,
    )
      .then((payload: any) => {
        if (!alive) return;
        if (payload?.error) throw new Error(String(payload.error));
        setCapabilityPayload(payload);
        const caps = payload?.capabilities || payload || {};
        const values = caps.reasoning_levels || caps.thinking_levels;
        const levels = Array.isArray(values)
          ? [
              ...new Set(
                values.filter(
                  (v): v is string =>
                    typeof v === "string" && Boolean(v.trim()),
                ),
              ),
            ]
          : [];
        if (
          !levels.length &&
          caps.thinking_support === true &&
          caps.thinking_control?.prompt_disable_token
        )
          levels.push("off", "auto");
        setReasoning({ levels, error: "", loading: false });
      })
      .catch((error) => {
        if (alive)
          setReasoning({
            levels: [],
            error: `Reasoning options unavailable: ${String(error?.message || error)}`,
            loading: false,
          });
      });
    return () => {
      alive = false;
    };
  }, [effectiveProvider, effectiveModel, hasCapabilities, disabled]);

  return (
    <div className={`af-pmp${props.className ? ` ${props.className}` : ""}`}>
      <div className="af-pmp__seg" role="tablist" aria-label="Provider mode">
        <button
          type="button"
          role="tab"
          aria-selected={isDefault}
          className={`af-pmp__seg-btn${isDefault ? " is-active" : ""}`}
          onClick={() => {
            setCustom(false);
            props.onChange({
              ...value,
              provider: "",
              model: "",
              ...(hasCapabilities ? { reasoning: "" } : {}),
            });
          }}
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
            setCustom(true);
          }}
          disabled={disabled}
        >
          {customLabel}
        </button>
      </div>

      {isDefault ? (
        <div className="af-pmp__hint">
          {props.defaultHint ||
            "The gateway picks its configured default provider and model for this task."}
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
          onChange={(next) =>
            props.onChange({
              ...value,
              provider: next.provider,
              model: next.model,
              ...(hasCapabilities ? { reasoning: "" } : {}),
            })
          }
        />
      )}
      {hasCapabilities && (reasoning.levels.length > 0 || value.reasoning) ? (
        <div className="af-pmp__reasoning">
          <label>{props.reasoningLabel || "Reasoning effort"}</label>
          <AfSelect
            ariaLabel={props.reasoningLabel || "Reasoning effort"}
            placeholder="Workflow / Gateway default"
            value={value.reasoning || ""}
            options={[
              { value: "", label: "Workflow / Gateway default" },
              ...reasoning.levels.map((level) => ({
                value: level,
                label: level,
              })),
              ...(value.reasoning && !reasoning.levels.includes(value.reasoning)
                ? [
                    {
                      value: value.reasoning,
                      label: `${value.reasoning} (saved; not advertised)`,
                    },
                  ]
                : []),
            ]}
            disabled={disabled || reasoning.loading}
            onChange={(next) => props.onChange({ ...value, reasoning: next })}
          />
        </div>
      ) : null}
      {reasoning.error ? (
        <div role="status" className="af-pmp__hint">
          {reasoning.error}
        </div>
      ) : null}
      {props.enableSpeculation ? <SpeculationSelect value={value.speculation}
        onChange={speculation => props.onChange({ ...value, speculation })}
        capabilities={capabilityPayload} disabled={disabled} loading={reasoning.loading}
        error={reasoning.error ? reasoning.error.replace("Reasoning options", "MTP options") : undefined} /> : null}
    </div>
  );
}
