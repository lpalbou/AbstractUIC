import React from "react";
import { type FontScaleOption, type HeaderDensityOption } from "./typography.js";
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
export declare function FontScaleSelect(props: FontScaleSelectProps): React.ReactElement;
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
export declare function HeaderDensitySelect(props: HeaderDensitySelectProps): React.ReactElement;
export default FontScaleSelect;
//# sourceMappingURL=typography_select.d.ts.map