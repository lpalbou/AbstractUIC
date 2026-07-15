import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from "react";
import { AfSelect } from "./af_select.js";
import { THEME_SPECS } from "./theme.js";
function theme_group_label(group) {
    return group === "light" ? "Light" : "Dark";
}
export function ThemeSelect(props) {
    const themes = props.themes && props.themes.length ? props.themes : THEME_SPECS;
    const show_swatches = props.showSwatches !== false;
    const variant = props.variant || "panel";
    const by_id = useMemo(() => {
        const out = {};
        for (const t of themes)
            out[t.id] = t;
        return out;
    }, [themes]);
    const options = useMemo(() => {
        return themes.map((t) => ({ value: t.id, label: t.label, group: theme_group_label(t.group) }));
    }, [themes]);
    return (_jsx(AfSelect, { value: props.value, options: options, placeholder: props.placeholder || "Select theme…", disabled: props.disabled === true, searchable: true, allowCustom: false, clearable: false, variant: variant, className: props.className, triggerClassName: props.triggerClassName, onChange: (next) => props.onChange(String(next || "").trim()), renderValue: (_opt, value) => {
            const id = String(value || "").trim();
            const spec = by_id[id];
            const label = spec?.label || id || (props.placeholder || "Select theme…");
            const sw = spec?.swatches || null;
            const placeholder = !id;
            return (_jsxs("span", { className: "af-theme-value", children: [_jsx("span", { className: `af-theme-label ${placeholder ? "af-theme-label--placeholder" : ""}`.trim(), children: label }), show_swatches && sw ? (_jsx("span", { className: "af-theme-swatches", "aria-hidden": "true", children: sw.map((c, i) => (_jsx("span", { className: "af-theme-swatch", style: { background: c } }, `${id}:${i}`))) })) : null] }));
        }, renderOption: (opt, state) => {
            const id = String(opt.value || "").trim();
            const spec = by_id[id];
            const sw = spec?.swatches || null;
            return (_jsxs(_Fragment, { children: [_jsx("span", { className: "af-theme-option-label", children: opt.label }), _jsxs("span", { className: "af-theme-option-right", children: [show_swatches && sw ? (_jsx("span", { className: "af-theme-swatches", "aria-hidden": "true", children: sw.map((c, i) => (_jsx("span", { className: "af-theme-swatch", style: { background: c } }, `${id}:${i}`))) })) : null, state.selected ? _jsx("span", { className: "af-select-check", children: "\u2713" }) : null] })] }));
        } }));
}
export default ThemeSelect;
