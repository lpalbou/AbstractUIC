import React from "react";
import { type ThemeSpec } from "./theme.js";
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
export declare function ThemeSelect(props: ThemeSelectProps): React.ReactElement;
export default ThemeSelect;
//# sourceMappingURL=theme_select.d.ts.map