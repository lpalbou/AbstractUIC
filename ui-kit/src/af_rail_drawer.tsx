// AfRailDrawer — the vertical rail drawer (ui-kit 0.6.0), now a thin
// back-compat wrapper over AfDrawerSystem (ui-primitives "shell", backlog 0036).
//
// A narrow ICON rail on the right edge of the host's content area; clicking
// an icon opens that panel beside the rail; clicking the open icon (or the
// panel's collapse button) collapses back to the bare rail. Docked ≥ 1024 px
// (resizable by pointer and keyboard, width persisted under `storageKey`),
// overlay below (backdrop, Escape, focus in/out), vertical tablist rail,
// keep-alive once visited. New code: use AfDrawerSystem (left side, vertical
// text tabs, keepAlive "always", error boundaries, per-panel widths, the
// open panel persisted, a request nonce, `fill` canvas panels).
//
// Storage: the key now holds AfDrawerSystem's JSON; a bare number written by
// ≤ 0.8.9 is read as every panel's width (no width is lost on upgrade).
import React from "react";
import { AfDrawerSystem, type AfRailItem } from "./af_drawer_system.js";

export {
  AF_RAIL_WIDTH,
  railDrawerClampWidth,
  railDrawerKeyWidth,
  railDrawerNextIndex,
  railDrawerToggle,
  type AfRailItem,
} from "./af_drawer_system.js";

export type AfRailDrawerProps = {
  items: AfRailItem[];
  /** The open panel, or null = collapsed to the rail. */
  active: string | null;
  onActiveChange: (id: string | null) => void;
  /** Accessible name of the rail ("Workspace panels"). */
  ariaLabel: string;
  /** localStorage key for the docked width (omit = not persisted). */
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Force overlay (true) or docked (false); default: overlay below 1024 px. */
  overlay?: boolean;
  /** Prefix for element ids (default "af-rail"). Must be unique on the page. */
  idBase?: string;
  className?: string;
};

export function AfRailDrawer(props: AfRailDrawerProps): React.ReactElement {
  const panels = props.items.map((item) => ({ ...item, defaultWidth: props.defaultWidth, minWidth: props.minWidth, maxWidth: props.maxWidth }));
  return (
    <AfDrawerSystem
      panels={panels}
      active={props.active}
      onActiveChange={(id) => props.onActiveChange(id)}
      ariaLabel={props.ariaLabel}
      storageKey={props.storageKey}
      overlay={props.overlay}
      idBase={props.idBase}
      className={props.className}
      restoreActive={false}
    />
  );
}
