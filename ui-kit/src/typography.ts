export type FontScaleOption = { id: string; label: string; scale: number };

export type HeaderDensityOption = { id: string; label: string; density: number };

export const FONT_SCALES: FontScaleOption[] = [
  { id: "sm", label: "Small", scale: 0.9 },
  { id: "md", label: "Medium", scale: 1 },
  { id: "lg", label: "Large", scale: 1.1 },
  { id: "xl", label: "Extra Large", scale: 1.2 },
];

export const HEADER_DENSITIES: HeaderDensityOption[] = [
  { id: "compact", label: "Compact", density: 0.85 },
  { id: "standard", label: "Standard", density: 1 },
  { id: "spacious", label: "Spacious", density: 1.2 },
];

export function getFontScaleSpec(font_scale_id: string): FontScaleOption {
  const id = String(font_scale_id || "").trim();
  return FONT_SCALES.find((x) => x.id === id) || FONT_SCALES[1];
}

export function getHeaderDensitySpec(header_density_id: string): HeaderDensityOption {
  const id = String(header_density_id || "").trim();
  return HEADER_DENSITIES.find((x) => x.id === id) || HEADER_DENSITIES[1];
}

export function applyTypography(opts: { font_scale?: string; header_density?: string }): void {
  try {
    const root = document.documentElement;
    const font = getFontScaleSpec(opts.font_scale || "md");
    const header = getHeaderDensitySpec(opts.header_density || "standard");
    root.style.setProperty("--font-scale", String(font.scale));
    root.style.setProperty("--header-density", String(header.density));
  } catch {
    // ignore
  }
}
