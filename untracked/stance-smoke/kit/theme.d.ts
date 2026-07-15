export type ThemeOption = {
    id: string;
    label: string;
};
export type ThemeSpec = ThemeOption & {
    group: "dark" | "light";
    swatches: string[];
};
export declare const THEME_SPECS: ThemeSpec[];
export declare const THEMES: ThemeOption[];
export declare function getThemeSpec(theme_id: string): ThemeSpec | undefined;
export declare function themeClassName(theme_id: string): string;
export declare function applyTheme(theme_id: string): void;
//# sourceMappingURL=theme.d.ts.map