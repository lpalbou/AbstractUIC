import React, { useMemo } from "react";
import { AfSelect } from "./af_select";
import { THEME_SPECS, type ThemeSpec } from "./theme";

export type ThemeSelectProps = {
  value: string;
  onChange: (theme_id: string) => void;
  themes?: ThemeSpec[];
  disabled?: boolean;
  variant?: "panel" | "pin";
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  showSwatches?: boolean;
};

function theme_group_label(group: ThemeSpec["group"]): string {
  return group === "light" ? "Light" : "Dark";
}

export function ThemeSelect(props: ThemeSelectProps): React.ReactElement {
  const themes = props.themes && props.themes.length ? props.themes : THEME_SPECS;
  const show_swatches = props.showSwatches !== false;
  const variant = props.variant || "panel";

  const by_id = useMemo(() => {
    const out: Record<string, ThemeSpec> = {};
    for (const t of themes) out[t.id] = t;
    return out;
  }, [themes]);

  const options = useMemo(() => {
    return themes.map((t) => ({ value: t.id, label: t.label, group: theme_group_label(t.group) }));
  }, [themes]);

  return (
    <AfSelect
      value={props.value}
      options={options}
      placeholder={props.placeholder || "Select theme…"}
      disabled={props.disabled === true}
      searchable
      allowCustom={false}
      clearable={false}
      variant={variant}
      className={props.className}
      triggerClassName={props.triggerClassName}
      onChange={(next) => props.onChange(String(next || "").trim())}
      renderValue={(_opt, value) => {
        const id = String(value || "").trim();
        const spec = by_id[id];
        const label = spec?.label || id || (props.placeholder || "Select theme…");
        const sw = spec?.swatches || null;
        const placeholder = !id;
        return (
          <span className="af-theme-value">
            <span className={`af-theme-label ${placeholder ? "af-theme-label--placeholder" : ""}`.trim()}>{label}</span>
            {show_swatches && sw ? (
              <span className="af-theme-swatches" aria-hidden="true">
                {sw.map((c, i) => (
                  <span key={`${id}:${i}`} className="af-theme-swatch" style={{ background: c }} />
                ))}
              </span>
            ) : null}
          </span>
        );
      }}
      renderOption={(opt, state) => {
        const id = String(opt.value || "").trim();
        const spec = by_id[id];
        const sw = spec?.swatches || null;
        return (
          <>
            <span className="af-theme-option-label">{opt.label}</span>
            <span className="af-theme-option-right">
              {show_swatches && sw ? (
                <span className="af-theme-swatches" aria-hidden="true">
                  {sw.map((c, i) => (
                    <span key={`${id}:${i}`} className="af-theme-swatch" style={{ background: c }} />
                  ))}
                </span>
              ) : null}
              {state.selected ? <span className="af-select-check">✓</span> : null}
            </span>
          </>
        );
      }}
    />
  );
}

export default ThemeSelect;
