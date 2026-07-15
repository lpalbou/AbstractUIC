import React from "react";
import { type ProviderOption } from "./provider_model_select.js";
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
export declare function ProviderModelPicker(props: ProviderModelPickerProps): React.ReactElement;
//# sourceMappingURL=provider_model_picker.d.ts.map