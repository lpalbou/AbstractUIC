export type FontScaleOption = {
    id: string;
    label: string;
    scale: number;
};
export type HeaderDensityOption = {
    id: string;
    label: string;
    density: number;
};
export declare const FONT_SCALES: FontScaleOption[];
export declare const HEADER_DENSITIES: HeaderDensityOption[];
export declare function getFontScaleSpec(font_scale_id: string): FontScaleOption;
export declare function getHeaderDensitySpec(header_density_id: string): HeaderDensityOption;
export declare function applyTypography(opts: {
    font_scale?: string;
    header_density?: string;
}): void;
//# sourceMappingURL=typography.d.ts.map