import React, { useMemo } from "react";
import { AfSelect } from "./af_select";
import { FONT_SCALES, HEADER_DENSITIES, type FontScaleOption, type HeaderDensityOption } from "./typography";

export type FontScaleSelectProps = {
  value: string;
  onChange: (font_scale_id: string) => void;
  scales?: FontScaleOption[];
  disabled?: boolean;
  variant?: "panel" | "pin";
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
};

export function FontScaleSelect(props: FontScaleSelectProps): React.ReactElement {
  const scales = props.scales && props.scales.length ? props.scales : FONT_SCALES;
  const variant = props.variant || "panel";

  const options = useMemo(() => {
    return scales.map((s) => ({ value: s.id, label: s.label }));
  }, [scales]);

  return (
    <AfSelect
      value={props.value}
      options={options}
      placeholder={props.placeholder || "Font size…"}
      disabled={props.disabled === true}
      searchable={false}
      allowCustom={false}
      clearable={false}
      variant={variant}
      className={props.className}
      triggerClassName={props.triggerClassName}
      onChange={(next) => props.onChange(String(next || "").trim())}
    />
  );
}

export type HeaderDensitySelectProps = {
  value: string;
  onChange: (header_density_id: string) => void;
  densities?: HeaderDensityOption[];
  disabled?: boolean;
  variant?: "panel" | "pin";
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
};

export function HeaderDensitySelect(props: HeaderDensitySelectProps): React.ReactElement {
  const densities = props.densities && props.densities.length ? props.densities : HEADER_DENSITIES;
  const variant = props.variant || "panel";

  const options = useMemo(() => {
    return densities.map((d) => ({ value: d.id, label: d.label }));
  }, [densities]);

  return (
    <AfSelect
      value={props.value}
      options={options}
      placeholder={props.placeholder || "Header size…"}
      disabled={props.disabled === true}
      searchable={false}
      allowCustom={false}
      clearable={false}
      variant={variant}
      className={props.className}
      triggerClassName={props.triggerClassName}
      onChange={(next) => props.onChange(String(next || "").trim())}
    />
  );
}

export default FontScaleSelect;

