// AfAppearanceDialog + useAppearanceSettings — the shared appearance surface
// (unified top-bar consensus, plans/unified-top-bar.md 2026-07-13).
//
// Scope = theme + font scale + header density (flow's shipped
// AppearanceModal scope — the reference; theme-only would regress it).
// The dialog is CONTROLLED and offers REGISTERED themes only (the entity
// app's graph canvas reads tokens at RAF time — an arbitrary token set can
// render an invisible graph).
//
// Persistence is APP-OWNED. useAppearanceSettings(appId) is the optional
// helper: documented key `af_appearance_<appId>_v1`, one-time migration
// from a legacy key, storage failures degrade to in-memory (private
// browsing must never crash or error-toast — contract statement 8).
import React, { useEffect, useMemo, useState } from "react";
import { applyTheme } from "./theme.js";
import { applyTypography } from "./typography.js";
import { ThemeSelect } from "./theme_select.js";
import { FontScaleSelect, HeaderDensitySelect } from "./typography_select.js";

export type AppearanceSettings = {
  theme: string;
  font_scale: string;
  header_density: string;
};

export const APPEARANCE_DEFAULTS: AppearanceSettings = {
  theme: "dark",
  font_scale: "md",
  header_density: "standard",
};

function normalizeSettings(raw: unknown): AppearanceSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    theme: typeof o.theme === "string" && o.theme ? o.theme : APPEARANCE_DEFAULTS.theme,
    font_scale: typeof o.font_scale === "string" && o.font_scale ? o.font_scale : APPEARANCE_DEFAULTS.font_scale,
    header_density:
      typeof o.header_density === "string" && o.header_density ? o.header_density : APPEARANCE_DEFAULTS.header_density,
  };
}

export function appearanceStorageKey(appId: string): string {
  return `af_appearance_${appId}_v1`;
}

/**
 * Per-app appearance persistence. Reads `af_appearance_<appId>_v1` (falling
 * back to `legacyKey` once, migrating it forward), applies theme+typography
 * on mount and on every change, and persists best-effort.
 */
export function useAppearanceSettings(
  appId: string,
  options?: { legacyKey?: string; defaults?: Partial<AppearanceSettings> }
): [AppearanceSettings, (next: AppearanceSettings) => void] {
  const key = appearanceStorageKey(appId);
  const defaults = useMemo(
    () => ({ ...APPEARANCE_DEFAULTS, ...(options?.defaults || {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(options?.defaults || {})]
  );

  const [settings, setSettings] = useState<AppearanceSettings>(() => {
    let initial = defaults;
    try {
      const raw = localStorage.getItem(key) ?? (options?.legacyKey ? localStorage.getItem(options.legacyKey) : null);
      if (raw) initial = normalizeSettings({ ...defaults, ...JSON.parse(raw) });
    } catch {
      // storage denied/corrupt: in-memory defaults, never crash (statement 8)
    }
    // Apply SYNCHRONOUSLY in the initializer, not only in the effect — the
    // effect runs after first paint and ships a default-theme flash on every
    // load (flow's adoption lesson 4, c1678).
    try {
      applyTheme(initial.theme);
      applyTypography({ font_scale: initial.font_scale, header_density: initial.header_density });
    } catch {
      // non-browser render (SSR): the effect applies on mount instead
    }
    return initial;
  });

  useEffect(() => {
    applyTheme(settings.theme);
    applyTypography({ font_scale: settings.font_scale, header_density: settings.header_density });
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      // in-memory only — deliberate silence (statement 8)
    }
  }, [key, settings]);

  return [settings, setSettings];
}

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
export function AfAppearanceDialog(props: AfAppearanceDialogProps): React.ReactElement | null {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div className="af-appearance-overlay" onClick={props.onClose} role="presentation">
      <div
        className="af-appearance"
        role="dialog"
        aria-modal="true"
        aria-label={props.title || "Appearance"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="af-appearance__title">{props.title || "Appearance"}</div>
        <div className="af-appearance__note">{props.note || "Stored locally in this browser, per app."}</div>

        <div className="af-appearance__grid">
          <label className="af-appearance__label">Theme</label>
          <ThemeSelect value={props.value.theme} onChange={(theme) => props.onChange({ ...props.value, theme })} />

          <label className="af-appearance__label">Font size</label>
          <FontScaleSelect
            value={props.value.font_scale}
            onChange={(font_scale) => props.onChange({ ...props.value, font_scale })}
          />

          <label className="af-appearance__label">Header size</label>
          <HeaderDensitySelect
            value={props.value.header_density}
            onChange={(header_density) => props.onChange({ ...props.value, header_density })}
          />
        </div>

        <div className="af-appearance__actions">
          <button type="button" className="af-appearance__close" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default AfAppearanceDialog;
