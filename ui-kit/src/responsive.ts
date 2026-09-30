// Responsive contract shared by every AbstractFramework browser app
// (responsive workstream 2026-09-30; DESIGN.md sections 1 and 4).
//
// CSS custom properties cannot be used inside @media, so the breakpoint
// VALUES are the contract: theme.css, the apps and the gateway console use
// these literal numbers. Keep this file, theme.css's "Responsive tokens"
// block and the design document in lockstep.
import { useEffect, useState } from "react";

/** Upper bounds (exclusive, CSS px) of the named width ranges; xl is >= lg. */
export const AF_BREAKPOINTS = { xs: 480, sm: 768, md: 1024, lg: 1440 } as const;

/** Media query strings for the named ranges and input axes (desktop-first, max-width). */
export const AF_MEDIA = {
  /** phone portrait (< 480) */
  xs: "(max-width: 479.98px)",
  /** below tablet (< 768): sheets instead of centered dialogs, single pane */
  sm: "(max-width: 767.98px)",
  /** below laptop (< 1024): side panes become drawers */
  md: "(max-width: 1023.98px)",
  /** below wide (< 1440): at most two docked panes */
  lg: "(max-width: 1439.98px)",
  /** wide screens (>= 1440) */
  xl: "(min-width: 1440px)",
  /** phone landscape: thin chrome, full-height sheets */
  short: "(max-height: 500px)",
  /** touch: 44px targets, 16px inputs, comfortable density */
  touch: "(pointer: coarse)",
  /** never hide actions behind hover */
  noHover: "(hover: none)",
} as const;

function matches(query: string): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/**
 * Subscribe to a media query (SSR-safe: false on the server). Prefer CSS; use
 * this only when the DOM itself must differ (a docked sidebar vs. a drawer).
 */
export function useAfMedia(query: string): boolean {
  const [value, setValue] = useState<boolean>(() => matches(query));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setValue(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return value;
}

let viewportCleanup: (() => void) | null = null;

/** The subset of `window.visualViewport` the viewport variables depend on. */
export type AfVisualViewportSample = { height: number; offsetTop: number; scale: number };

/**
 * Pure rule behind `installViewportVars()` (exported for tests).
 * - Keyboard at scale 1: `--vv-height` is the visible height and
 *   `--keyboard-inset` the layout px hidden at the bottom.
 * - Pinch-zoomed (scale > 1.01): the visual viewport is a magnified window
 *   onto the page, not a smaller page — the shell keeps the layout viewport
 *   height and there is no inset (a zoomed page must never shrink the shell).
 */
export function viewportVarsFrom(innerHeight: number, vv: AfVisualViewportSample): { vvHeight: number; keyboardInset: number } {
  const layout = Math.max(0, Math.round(innerHeight));
  if (!(vv.scale <= 1.01)) return { vvHeight: layout, keyboardInset: 0 };
  const height = Math.max(0, Math.min(layout, Math.round(vv.height)));
  const inset = Math.max(0, Math.round(innerHeight - vv.height - Math.max(0, vv.offsetTop)));
  return { vvHeight: height, keyboardInset: inset };
}

/**
 * Mirror the VISUAL viewport into CSS variables on <html> (rule:
 * `viewportVarsFrom`; a pinch-zoomed page keeps the full layout height):
 * - `--vv-height`: the visible height in px (shrinks under the iOS keyboard,
 *   which `dvh` does not track on iOS Safari);
 * - `--keyboard-inset`: px of the layout viewport hidden at the bottom (the
 *   on-screen keyboard), 0 when none.
 * Idempotent: a second call returns the same cleanup. No-op without
 * `window.visualViewport` (the variables then stay unset / 0px from theme.css).
 */
export function installViewportVars(): () => void {
  if (viewportCleanup) return viewportCleanup;
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  const root = document.documentElement;
  let frame = 0;
  const apply = () => {
    frame = 0;
    const { vvHeight, keyboardInset } = viewportVarsFrom(window.innerHeight, { height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale || 1 });
    root.style.setProperty("--vv-height", `${vvHeight}px`);
    root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
  };
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };
  apply();
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("orientationchange", schedule);
  viewportCleanup = () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    window.removeEventListener("orientationchange", schedule);
    if (frame) window.cancelAnimationFrame(frame);
    root.style.removeProperty("--vv-height");
    root.style.removeProperty("--keyboard-inset");
    viewportCleanup = null;
  };
  return viewportCleanup;
}
