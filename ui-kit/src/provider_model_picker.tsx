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
//
// ui-primitives (tools-models, backlog 0034, ADR 0001 §4): the gateway default
// is NAMED ("Gateway default · ollama / qwen3 · reasoning high · MTP depth 3")
// from the injected `fetchGatewayDefault`, which also drives capability
// discovery; `reasoningLadder` (served, never hardcoded) with levels the model
// does not advertise disabled; `unknownReasoning: "allow-override"` (set
// anyway); `layout: "compact"` (selects with the default as first option);
// `pinned` fields ("Provided by connected pin"); a saved value the gateway no
// longer lists stays visible as "(saved)". No model-name heuristics.
import React, { useEffect, useRef, useState } from "react";
import {
  PINNED_FIELD_TEXT,
  ProviderModelSelect,
  type ProviderOption,
} from "./provider_model_select.js";
import { AfSelect, type AfSelectOption } from "./af_select.js";
import { SpeculationSelect } from "./speculation_select.js";
import type { SpeculationValue } from "./speculation_control.js";
import { gatewayDefaultLabel, type GatewayModelDefault } from "./gateway_models.js";

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
  /** Model ids, or `{id, label}` records (the label is what the list shows, e.g. "<id> (clones)"). */
  fetchModels: (provider: string) => Promise<Array<string | { id: string; label?: string }>>;
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
  /** Label of the "inherit" choice in the reasoning and MTP selects
   * (default "Workflow / Gateway default"). A host without a workflow layer,
   * e.g. an entity's mind, says "Gateway default". */
  inheritLabel?: string;
  /** Show reasoning and MTP while on the gateway default (default true).
   * false = the gateway default is taken whole (its own reasoning/MTP) and
   * the two selects appear only for a custom provider/model — for hosts that
   * can store those options only together with a pinned model. */
  optionsInDefaultMode?: boolean;

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

  /** What "Gateway default" resolves to (createGatewayModelTransport().fetchGatewayDefault). Named in
   * the default choice, and used for capability discovery when `effectiveDefault` is absent. */
  fetchGatewayDefault?: () => Promise<GatewayModelDefault>;
  /** The run-start reasoning ladder the gateway advertises (reasoningLadderFrom(discovery/capabilities)).
   * Given: the select lists it, levels the model does not advertise are disabled (not hidden). */
  reasoningLadder?: readonly string[];
  /** The model's reasoning support is unknown (no served facts): "hide" (default) the select, or
   * "allow-override": locked until "Set anyway", then the ladder (needs `reasoningLadder`). */
  unknownReasoning?: "hide" | "allow-override";
  /** "segmented" (default): Gateway default | Custom. "compact": provider/model selects whose first
   * option is the gateway default (flow node panels). */
  layout?: "segmented" | "compact";
  /** Fields fed by a connected pin: shown as "Provided by connected pin", not editable. */
  pinned?: { provider?: boolean; model?: boolean; reasoning?: boolean; speculation?: boolean };
};

/** Shown when the reasoning facts of the selected model are unknown and the host allows an override. */
export const PICKER_REASONING_UNKNOWN = "The gateway does not say which reasoning levels this model supports.";
export const PICKER_REASONING_OVERRIDE = "Set anyway";

/** What the user reads when the gateway cannot describe the selected model (the cause goes under Technical details). */
export const PICKER_DISCOVERY_UNAVAILABLE = "Reasoning and MTP choices appear when the gateway can describe the selected model.";
export const PICKER_REASONING_UNAVAILABLE = "Reasoning choices appear when the gateway can describe the selected model.";

export function ProviderModelPicker(
  props: ProviderModelPickerProps,
): React.ReactElement {
  const disabled = props.disabled === true;
  const value = props.value || { provider: "", model: "" };
  const empty =
    !String(value.provider || "").trim() && !String(value.model || "").trim();
  const compact = props.layout === "compact";
  const pins = props.pinned || {};
  const pinnedRoute = Boolean(pins.provider || pins.model);
  const [custom, setCustom] = useState(!empty);
  // Compact (and a pinned route) always shows the selects; "Gateway default" is their first option.
  const showSelects = compact || pinnedRoute || !(empty && !custom);
  const isDefault = empty && (compact || pinnedRoute || !custom);
  const previousEmpty = useRef(empty);
  useEffect(() => {
    if (empty && !previousEmpty.current) setCustom(false);
    previousEmpty.current = empty;
  }, [empty]);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
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

  // The named default. Re-read whenever the host hands a new `fetchGatewayDefault` (a sign-in, an
  // identity change): pass a stable function (useCallback keyed by the identity). States: resolved
  // (named), none (the gateway has no default configured), unusable (the gateway's own warnings),
  // error (could not be read: the reason is shown, never a silent plain label).
  type DefaultState = { status: "idle" | "loading" | "resolved" | "none" | "unusable" | "error"; value: GatewayModelDefault; message: string };
  const [defaultState, setDefaultState] = useState<DefaultState>({ status: "idle", value: null, message: "" });
  const fetchDefault = props.fetchGatewayDefault;
  useEffect(() => {
    if (!fetchDefault || disabled) return;
    let alive = true;
    const put = (next: DefaultState) =>
      setDefaultState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    setDefaultState((prev) => (prev.status === "idle" ? { ...prev, status: "loading" } : prev));
    void fetchDefault()
      .then((d) => {
        if (!alive) return;
        if (!d) put({ status: "none", value: null, message: "" });
        else if (d.warnings?.length) put({ status: "unusable", value: d, message: d.warnings.join(" ") });
        else put({ status: "resolved", value: d, message: "" });
      })
      .catch((e: any) => {
        if (alive) put({ status: "error", value: null, message: String(e?.message || e) });
      });
    return () => {
      alive = false;
    };
  }, [fetchDefault, disabled]);
  const gatewayDefault = defaultState.status === "resolved" ? defaultState.value : null;
  // "(saved)" marks only what the picker was mounted with (a stored choice), never a value typed now.
  const mountedRoute = useRef({ provider: String(value.provider || "").trim(), model: String(value.model || "").trim() });

  useEffect(() => {
    if (!showSelects || pins.provider || disabled) return;
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
  }, [showSelects, pins.provider, disabled]);

  const providerName = String(value.provider || "").trim();
  useEffect(() => {
    if (!providerName || disabled || pins.model) {
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
        const ids: string[] = [];
        const labels: Record<string, string> = {};
        for (const item of Array.isArray(res) ? res : []) {
          const id = typeof item === "string" ? item : String(item?.id || "");
          if (!id) continue;
          ids.push(id);
          if (typeof item !== "string" && item?.label && item.label !== id) labels[id] = String(item.label);
        }
        setModels(ids);
        setModelNames(labels);
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
  }, [providerName, disabled, pins.model]);

  // A configured-but-undiscovered provider/model stays selectable (older
  // config, discovery lane blind spots), labeled "(saved)" by
  // ProviderModelSelect `markSaved` once its list has loaded.
  const modelName = String(value.model || "").trim();

  const defaultLabel = props.defaultModeLabel || "Gateway default";
  const defaultLine =
    defaultState.status === "none" ? `${defaultLabel} · none configured` : gatewayDefaultLabel(gatewayDefault, defaultLabel);
  const customLabel = props.customModeLabel || "Custom";
  const discoveryDefault =
    props.effectiveDefault ||
    (defaultState.value ? { provider: defaultState.value.provider, model: defaultState.value.model } : undefined);
  const effectiveProvider = providerName || discoveryDefault?.provider || "";
  const effectiveModel =
    modelName || (!providerName ? discoveryDefault?.model : "") || "";
  const [reasoning, setReasoning] = useState<{
    levels: string[];
    /** The served `thinking_support` (undefined = not said). */
    support?: boolean;
    error: string;
    loading: boolean;
  }>({ levels: [], error: "", loading: false });
  const [overrideUnknown, setOverrideUnknown] = useState(false);
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
        const support = typeof caps.thinking_support === "boolean" ? caps.thinking_support : undefined;
        setReasoning({ levels, support, error: "", loading: false });
      })
      .catch((error) => {
        if (alive)
          setReasoning({
            levels: [],
            error: String(error?.message || error),
            loading: false,
          });
      });
    return () => {
      alive = false;
    };
  }, [effectiveProvider, effectiveModel, hasCapabilities, disabled]);
  useEffect(() => setOverrideUnknown(false), [effectiveProvider, effectiveModel]);

  const inherit = props.inheritLabel || "Workflow / Gateway default";
  const reasoningInherit =
    isDefault && gatewayDefault?.reasoning ? `${inherit} (${gatewayDefault.reasoning})` : inherit;
  const showOptions = !isDefault || props.optionsInDefaultMode !== false;
  const ladder = props.reasoningLadder ? [...new Set(props.reasoningLadder.filter((v) => typeof v === "string" && v.trim()))] : null;
  // Served facts only: levels advertised → supported; thinking_support false → unsupported; else unknown.
  const reasoningState: "loading" | "supported" | "unsupported" | "unknown" = reasoning.loading
    ? "loading"
    : reasoning.levels.length || reasoning.support === true
      ? "supported"
      : reasoning.support === false
        ? "unsupported"
        : "unknown";
  const allowOverride = props.unknownReasoning === "allow-override" && Boolean(ladder?.length);
  const saved = String(value.reasoning || "").trim();
  let reasoningOptions: AfSelectOption[] = [];
  let reasoningLocked = false;
  if (!ladder) {
    reasoningOptions = reasoning.levels.map((level) => ({ value: level, label: level }));
  } else if (reasoningState === "supported" || reasoningState === "loading") {
    const advertised = reasoning.levels;
    const all = [...ladder, ...advertised.filter((l) => !ladder.includes(l))];
    reasoningOptions = all.map((level) =>
      !advertised.length || advertised.includes(level)
        ? { value: level, label: level }
        : { value: level, label: level, disabled: true, reason: "This model does not advertise it" },
    );
  } else if (reasoningState === "unknown" && allowOverride) {
    reasoningLocked = !overrideUnknown;
    reasoningOptions = ladder.map((level) => ({ value: level, label: level }));
  }
  if (saved && !reasoningOptions.some((o) => o.value === saved))
    reasoningOptions.push({ value: saved, label: `${saved} (saved)` });
  const showReasoning =
    (hasCapabilities || allowOverride) &&
    (reasoningOptions.length > 0 || (reasoningState === "unknown" && allowOverride));

  return (
    <div
      className={`af-pmp${compact ? " af-pmp--compact" : ""}${props.className ? ` ${props.className}` : ""}`}
      data-gateway-default={fetchDefault ? defaultState.status : undefined}
    >
      {compact || pinnedRoute ? null : <div className="af-pmp__seg" role="tablist" aria-label="Provider mode">
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
          title={defaultLine}
          data-default-choice=""
        >
          {defaultLine}
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
      </div>}

      {defaultState.status === "error" || defaultState.status === "unusable" ? (
        <div role="status" className="af-pmp__hint" data-gateway-default-problem={defaultState.status}>
          {defaultState.status === "error"
            ? `The gateway's default could not be read: ${defaultState.message}`
            : `Gateway warning: ${defaultState.message}`}
        </div>
      ) : null}
      {!showSelects ? (
        <div className="af-pmp__hint">
          {props.defaultHint ||
            "The gateway picks its configured default provider and model for this task."}
        </div>
      ) : (
        <ProviderModelSelect
          provider={providerName}
          model={modelName}
          providers={providers}
          models={models}
          modelDisplayNames={modelNames}
          markSaved={mountedRoute.current}
          providerPinned={pins.provider}
          modelPinned={pins.model}
          disabled={disabled}
          loadingProviders={providersLoading}
          loadingModels={modelsLoading}
          providerError={providersError || undefined}
          modelError={modelsError || undefined}
          providerLabel={props.providerLabel}
          modelLabel={props.modelLabel}
          allowGatewayDefault={compact}
          gatewayDefaultLabel={compact ? defaultLine : undefined}
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
      {showOptions && pins.reasoning ? (
        <div className="af-pmp__reasoning">
          <label>{props.reasoningLabel || "Reasoning effort"}</label>
          <div className="af-pmp__pinned" data-pinned="reasoning">{PINNED_FIELD_TEXT}</div>
        </div>
      ) : showOptions && showReasoning ? (
        <div className="af-pmp__reasoning" data-reasoning-state={reasoningState}>
          <label>{props.reasoningLabel || "Reasoning effort"}</label>
          <AfSelect
            ariaLabel={props.reasoningLabel || "Reasoning effort"}
            placeholder={reasoningInherit}
            value={value.reasoning || ""}
            options={[{ value: "", label: reasoningInherit }, ...reasoningOptions]}
            disabled={disabled || reasoning.loading || reasoningLocked}
            onChange={(next) => props.onChange({ ...value, reasoning: next })}
          />
          {reasoningState === "unknown" && allowOverride ? (
            <div className="af-pmp__hint" data-reasoning-unknown="">
              {PICKER_REASONING_UNKNOWN}{" "}
              <label className="af-pmp__override">
                <input
                  type="checkbox"
                  checked={overrideUnknown}
                  disabled={disabled}
                  onChange={(e) => {
                    setOverrideUnknown(e.target.checked);
                    if (!e.target.checked && value.reasoning) props.onChange({ ...value, reasoning: "" });
                  }}
                />{" "}
                {PICKER_REASONING_OVERRIDE}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      {showOptions && props.enableSpeculation && pins.speculation ? (
        <div className="af-pmp__speculation">
          <label>MTP depth</label>
          <div className="af-pmp__pinned" data-pinned="speculation">{PINNED_FIELD_TEXT}</div>
        </div>
      ) : showOptions && props.enableSpeculation ? <SpeculationSelect value={value.speculation} inheritLabel={inherit}
        onChange={speculation => props.onChange({ ...value, speculation })}
        capabilities={capabilityPayload} disabled={disabled} loading={reasoning.loading}
        hideNote={Boolean(reasoning.error)} /> : null}
      {showOptions && reasoning.error ? (
        // One plain sentence for the user; the gateway's own cause stays available
        // under Technical details (and in the console), never as the main text.
        <div role="status" className="af-pmp__hint" data-discovery="unavailable">
          {props.enableSpeculation ? PICKER_DISCOVERY_UNAVAILABLE : PICKER_REASONING_UNAVAILABLE}
          <details className="af-pmp__details">
            <summary>Technical details</summary>
            <span>{reasoning.error}</span>
          </details>
        </div>
      ) : null}
    </div>
  );
}
