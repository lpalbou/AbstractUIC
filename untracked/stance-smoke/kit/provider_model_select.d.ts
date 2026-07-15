import React from "react";
export type ProviderOption = {
    name: string;
    display_name?: string;
};
export type ProviderModelSelectProps = {
    provider: string;
    model: string;
    providers: ProviderOption[];
    models: string[];
    onChange: (next: {
        provider: string;
        model: string;
    }) => void;
    disabled?: boolean;
    layout?: "stack" | "row";
    className?: string;
    selectClassName?: string;
    allowGatewayDefault?: boolean;
    gatewayDefaultLabel?: string;
    providerLabel?: string;
    modelLabel?: string;
    providerPlaceholder?: string;
    modelPlaceholder?: string;
    loadingProviders?: boolean;
    loadingModels?: boolean;
    providerError?: string;
    modelError?: string;
    allowCustomProvider?: boolean;
    allowCustomModel?: boolean;
};
export declare function ProviderModelSelect(props: ProviderModelSelectProps): React.ReactElement;
//# sourceMappingURL=provider_model_select.d.ts.map