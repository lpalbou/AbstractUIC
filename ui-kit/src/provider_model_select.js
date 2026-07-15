import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AfSelect } from "./af_select.js";
function normalize_provider_options(items) {
    const seen = new Set();
    const out = [];
    for (const it of items || []) {
        if (!it || typeof it !== "object")
            continue;
        const name = String(it.name || "").trim();
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        out.push({ name, display_name: typeof it.display_name === "string" ? it.display_name : undefined });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
}
function normalize_models(items) {
    const seen = new Set();
    const out = [];
    for (const m of items || []) {
        const s = String(m || "").trim();
        if (!s || seen.has(s))
            continue;
        seen.add(s);
        out.push(s);
    }
    out.sort();
    return out;
}
export function ProviderModelSelect(props) {
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
    const provider_options = [
        ...(allow_gateway_default ? [{ value: "", label: gateway_default_label }] : []),
        ...providers.map((p) => ({ value: p.name, label: p.display_name ? `${p.display_name} (${p.name})` : p.name })),
    ];
    const model_options = [
        ...(allow_gateway_default ? [{ value: "", label: gateway_default_label }] : []),
        ...models.map((m) => ({ value: m, label: m })),
    ];
    return (_jsxs("div", { className: props.className, style: layout === "row"
            ? { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start" }
            : { display: "flex", flexDirection: "column", gap: "10px" }, children: [_jsxs("div", { style: layout === "row" ? { flex: "1 1 260px", minWidth: 240 } : undefined, children: [_jsx("label", { children: provider_label }), _jsx(AfSelect, { value: provider_value, options: provider_options, placeholder: allow_gateway_default ? gateway_default_label : provider_placeholder, disabled: provider_disabled, loading: Boolean(props.loadingProviders), searchable: true, allowCustom: props.allowCustomProvider === true, clearable: allow_gateway_default, variant: "panel", triggerClassName: props.selectClassName, ariaLabel: provider_label, onChange: (next_provider) => props.onChange({ provider: String(next_provider || "").trim(), model: "" }) }), props.loadingProviders ? _jsx("div", { className: "mono muted", style: { fontSize: "12px", marginTop: "6px" }, children: "Loading providers\u2026" }) : null, props.providerError ? (_jsx("div", { className: "mono", style: { color: "var(--error)", fontSize: "12px", marginTop: "6px" }, children: props.providerError })) : null] }), _jsxs("div", { style: layout === "row" ? { flex: "1 1 260px", minWidth: 240 } : undefined, children: [_jsx("label", { children: model_label }), _jsx(AfSelect, { value: model_value, options: model_options, placeholder: allow_gateway_default ? gateway_default_label : model_placeholder, disabled: model_disabled, loading: Boolean(props.loadingModels), searchable: true, allowCustom: props.allowCustomModel === true, clearable: allow_gateway_default, variant: "panel", triggerClassName: props.selectClassName, ariaLabel: model_label, onChange: (next_model) => props.onChange({ provider: provider_value, model: String(next_model || "").trim() }) }), props.loadingModels ? _jsx("div", { className: "mono muted", style: { fontSize: "12px", marginTop: "6px" }, children: "Loading models\u2026" }) : null, props.modelError ? (_jsx("div", { className: "mono", style: { color: "var(--error)", fontSize: "12px", marginTop: "6px" }, children: props.modelError })) : null] })] }));
}
