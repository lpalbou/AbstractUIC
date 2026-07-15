import React from "react";
export type AppearanceSettings = {
    theme: string;
    font_scale: string;
    header_density: string;
};
export declare const APPEARANCE_DEFAULTS: AppearanceSettings;
export declare function appearanceStorageKey(appId: string): string;
/**
 * Per-app appearance persistence. Reads `af_appearance_<appId>_v1` (falling
 * back to `legacyKey` once, migrating it forward), applies theme+typography
 * on mount and on every change, and persists best-effort.
 */
export declare function useAppearanceSettings(appId: string, options?: {
    legacyKey?: string;
    defaults?: Partial<AppearanceSettings>;
}): [AppearanceSettings, (next: AppearanceSettings) => void];
export type AfAppearanceDialogProps = {
    open: boolean;
    onClose: () => void;
    value: AppearanceSettings;
    onChange: (next: AppearanceSettings) => void;
    title?: string;
    /** Shown under the title; defaults to the storage honesty line. */
    note?: string;
};
/** The shared appearance dialog (theme + font scale + header density). */
export declare function AfAppearanceDialog(props: AfAppearanceDialogProps): React.ReactElement | null;
export default AfAppearanceDialog;
//# sourceMappingURL=appearance.d.ts.map