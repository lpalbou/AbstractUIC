import React from "react";
export type AfSelectOption = {
    value: string;
    label: string;
    group?: string;
    disabled?: boolean;
    reason?: string;
};
export type AfSelectProps = {
    value: string;
    options: AfSelectOption[];
    placeholder?: string;
    disabled?: boolean;
    loading?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    allowCustom?: boolean;
    clearable?: boolean;
    minPopoverWidth?: number;
    variant?: "pin" | "panel";
    className?: string;
    triggerClassName?: string;
    /** Accessible name for the combobox (screen readers announce it; pair with `id` + a visible label where possible). */
    ariaLabel?: string;
    /** DOM id for the trigger so a visible <label htmlFor=...> can name the control. */
    id?: string;
    /**
     * When the current value is not among the options, synthesize an option for
     * it so the selection stays visible/pickable (absorbed from the AbstractFlow
     * fork; opt-in so existing consumers keep their behavior).
     */
    includeValueOption?: boolean;
    /** Fired when the popover opens (absorbed from the AbstractFlow fork: lazy option loading). */
    onOpen?: () => void;
    customOptionLabel?: (value: string) => string;
    validateCustomValue?: (value: string, context: {
        options: AfSelectOption[];
    }) => string | null | undefined;
    onChange: (value: string) => void;
    renderOption?: (opt: AfSelectOption, state: {
        selected: boolean;
        highlighted: boolean;
    }) => React.ReactNode;
    renderValue?: (opt: AfSelectOption | null, value: string) => React.ReactNode;
};
export declare function AfSelect({ value, options, placeholder, disabled, loading, searchable, searchPlaceholder, allowCustom, clearable, minPopoverWidth, variant, className, triggerClassName, ariaLabel, id, includeValueOption, onOpen, customOptionLabel, validateCustomValue, onChange, renderOption, renderValue, }: AfSelectProps): React.ReactElement;
export default AfSelect;
//# sourceMappingURL=af_select.d.ts.map