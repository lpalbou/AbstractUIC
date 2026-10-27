// AfDrawerSystem — the app shell's side panels (ADR 0001 §1 + §6, backlog 0036).
//
// Generalises AfRailDrawer (which is now a thin wrapper over this): panels on
// the RIGHT and/or the LEFT edge of the host content, each side with an
// optional rail of tabs (icons, or vertical text labels) and one open panel.
//
// - Panels are OPAQUE (ADR 0001 §6): `{id, label, icon, content}` plus layout
//   flags; the system never inspects `content`. `fill` removes the body's
//   padding and scrolling so a canvas (a flow diagram, a memory graph) owns
//   its viewport; `--af-panel-w` and `onResize(id, width)` let it refit.
// - mode "rail" = a tab in the side's rail; mode "drawer" = no tab, opened by
//   the host (the top bar's docs / assistant buttons) into the same area.
// - Docked (above `overlayBelow`, default the `md` breakpoint): in the layout
//   flow, resizable by pointer and keyboard (separator), width persisted PER
//   PANEL. Overlay (below): floats over the content with a backdrop; Escape
//   or a backdrop tap collapses it; focus moves in and back to the opener.
// - Keep-alive: "visited" (default) mounts a panel on first open and keeps it
//   (hidden); "always" mounts it at once (ReactFlow-like state survives).
// - Each panel renders inside its own error boundary (default on): one panel
//   throwing shows a labeled failure in THAT panel only.
// - One kit-owned storage key holds the widths and the open panel per side;
//   the open panel is persisted and restored only while docked (an overlay
//   restored on load would cover the content).
// - `request` ("id#nonce", AbstractEntity's controlled tab request) opens a
//   panel from elsewhere; a new nonce re-requests the same id.
// - `topOffset` ("auto" = `var(--af-topbar-h)`, published by AfTopBarActions)
//   anchors the OVERLAY panel to the viewport under the app header.
//
// Every rule lives in a pure `railDrawer*` helper (scripts/check_rail_viewer.mjs
// drives them without a DOM).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icon.js";
import { AF_MEDIA, useAfMedia } from "./responsive.js";

export type AfDrawerSide = "left" | "right";

/** One panel of a rail / drawer system. */
export type AfRailItem = {
  id: string;
  /** Short label: the tab's tooltip, accessible name and the panel title. */
  label: string;
  icon: IconName;
  /** A small count or dot on the tab (number → count, true → dot). */
  badge?: number | boolean;
  /** Extra tooltip text after the label (e.g. "3 running"). */
  hint?: string;
  content: React.ReactNode;
  /** Header actions of this panel (before the collapse button). */
  headerActions?: React.ReactNode;
};

export type AfDrawerPanel = AfRailItem & {
  /** Edge (default "right"). */
  side?: AfDrawerSide;
  /** "rail" (default) = a tab in the rail; "drawer" = no tab, opened by the host. */
  mode?: "rail" | "drawer";
  /** "visited" (default) = mounted on first open, then kept; "always" = mounted at once. */
  keepAlive?: "always" | "visited";
  /** Wrap the panel in its own error boundary (default true). */
  errorBoundary?: boolean;
  /** No padding, no scrolling: the content owns the panel's viewport (canvas panels). */
  fill?: boolean;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
};

/** The open panel: one id for the whole system, or one per side. */
export type AfDrawerActive = string | null | { left?: string | null; right?: string | null };

export type AfDrawerSystemProps = {
  panels: AfDrawerPanel[];
  active: AfDrawerActive;
  /** `side` = where the change happened (a single-id host may ignore it). */
  onActiveChange: (id: string | null, side: AfDrawerSide) => void;
  /** Accessible name of the rail(s) ("Workspace panels"). */
  ariaLabel: string;
  /** One localStorage key: widths per panel + the open panel per side (docked only). Omit = not persisted. */
  storageKey?: string;
  /** Media query under which panels float (default AF_MEDIA.md, < 1024 px). */
  overlayBelow?: string;
  /** Force overlay (true) or docked (false); wins over `overlayBelow`. */
  overlay?: boolean;
  /** Anchor the overlay panel under the app header: "auto" = `--af-topbar-h`, or px. */
  topOffset?: "auto" | number;
  /** Rail tabs: icons (default) or vertical text labels. */
  railLabelStyle?: "icon" | "vertical-text";
  /** Opens a panel from elsewhere: "id" or "id#nonce" (a new nonce re-requests). */
  request?: string | null;
  /** A panel's width changed (drag end, keyboard). */
  onResize?: (id: string, width: number) => void;
  /** Restore the stored open panel on mount while docked (default true). */
  restoreActive?: boolean;
  /** Prefix for element ids (default "af-rail"). Must be unique on the page. */
  idBase?: string;
  className?: string;
  /** The host content; required when there are LEFT panels (it sits between the sides). */
  children?: React.ReactNode;
};

export const AF_RAIL_WIDTH = { min: 300, max: 960, default: 420, step: 16, bigStep: 64 } as const;

/** The width clamped to [min, max] (non-finite → `fallback`). */
export function railDrawerClampWidth(width: number, min: number = AF_RAIL_WIDTH.min, max: number = AF_RAIL_WIDTH.max, fallback: number = AF_RAIL_WIDTH.default): number {
  if (!Number.isFinite(width)) return Math.min(max, Math.max(min, fallback));
  return Math.round(Math.min(max, Math.max(min, width)));
}

/**
 * The separator's keyboard rule. A RIGHT panel sits left of its rail, so
 * ArrowLeft widens it; a LEFT panel sits right of its rail, so ArrowRight
 * widens it. Shift moves a big step; Home = min, End = max. Null for other keys.
 */
export function railDrawerKeyWidth(width: number, key: string, shift: boolean, min: number = AF_RAIL_WIDTH.min, max: number = AF_RAIL_WIDTH.max, side: AfDrawerSide = "right"): number | null {
  const step = shift ? AF_RAIL_WIDTH.bigStep : AF_RAIL_WIDTH.step;
  const widen = side === "left" ? "ArrowRight" : "ArrowLeft";
  const narrow = side === "left" ? "ArrowLeft" : "ArrowRight";
  if (key === widen) return railDrawerClampWidth(width + step, min, max);
  if (key === narrow) return railDrawerClampWidth(width - step, min, max);
  if (key === "Home") return min;
  if (key === "End") return max;
  return null;
}

/** The width after a pointer drag of `dx` px (positive = rightwards). */
export function railDrawerDragWidth(startWidth: number, dx: number, side: AfDrawerSide, min: number = AF_RAIL_WIDTH.min, max: number = AF_RAIL_WIDTH.max): number {
  return railDrawerClampWidth(side === "left" ? startWidth + dx : startWidth - dx, min, max);
}

/** Rail focus movement: Up/Down wrap, Home/End jump; null for other keys. */
export function railDrawerNextIndex(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** What a click on a rail tab asks: open it, or collapse when it is already open. */
export function railDrawerToggle(active: string | null, id: string): string | null {
  return active === id ? null : id;
}

export function railDrawerSide(panel: Pick<AfDrawerPanel, "side">): AfDrawerSide {
  return panel.side === "left" ? "left" : "right";
}

/** The open panel id on `side` (an id naming a panel of another side, or no panel, is null). */
export function railDrawerActiveFor(active: AfDrawerActive, side: AfDrawerSide, panels: ReadonlyArray<Pick<AfDrawerPanel, "id" | "side">>): string | null {
  const id = active === null || active === undefined ? null : typeof active === "string" ? active : active[side] ?? null;
  if (!id) return null;
  const panel = panels.find((p) => p.id === id);
  return panel && railDrawerSide(panel) === side ? id : null;
}

/** `active` with `side` set to `id`, in the same shape (a single id stays a single id). */
export function railDrawerSetActive(active: AfDrawerActive, side: AfDrawerSide, id: string | null): AfDrawerActive {
  if (active !== null && typeof active === "object") return { ...active, [side]: id };
  return id;
}

/** "files#3" → {id: "files", nonce: "3"}; "files" → {id: "files", nonce: ""}; empty → null. */
export function railDrawerParseRequest(request: string | null | undefined): { id: string; nonce: string } | null {
  const raw = String(request || "");
  if (!raw) return null;
  const at = raw.indexOf("#");
  const id = at < 0 ? raw : raw.slice(0, at);
  return id ? { id, nonce: at < 0 ? "" : raw.slice(at + 1) } : null;
}

/** Whether a panel's content is mounted: the open one, "always" panels, and visited "visited" panels. */
export function railDrawerMounted(panel: Pick<AfDrawerPanel, "id" | "keepAlive">, activeId: string | null, visited: ReadonlySet<string>): boolean {
  return panel.id === activeId || panel.keepAlive === "always" || visited.has(panel.id);
}

export type AfDrawerStored = { widths: Record<string, number>; active: { left?: string | null; right?: string | null }; legacyWidth?: number };

/**
 * Parse the stored state: `{"v":1,"widths":{id:px},"active":{"right":id},"legacy":px}`;
 * a bare number (AfRailDrawer ≤ 0.8.9 stored one width) becomes every panel's
 * width (`legacyWidth`, kept as `"legacy"` on every write so a panel that has
 * no width of its own keeps it); anything unreadable is empty.
 */
export function railDrawerReadStored(raw: string | null | undefined): AfDrawerStored {
  const empty: AfDrawerStored = { widths: {}, active: {} };
  const text = String(raw ?? "").trim();
  if (!text) return empty;
  if (/^\d+(\.\d+)?$/.test(text)) return { ...empty, legacyWidth: Number(text) };
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== "object" || Array.isArray(o)) return empty;
    const widths: Record<string, number> = {};
    if (o.widths && typeof o.widths === "object") for (const [k, v] of Object.entries(o.widths)) if (typeof v === "number" && Number.isFinite(v)) widths[k] = v;
    const active: AfDrawerStored["active"] = {};
    if (o.active && typeof o.active === "object") {
      for (const side of ["left", "right"] as const) {
        const v = (o.active as Record<string, unknown>)[side];
        if (typeof v === "string" || v === null) active[side] = v;
      }
    }
    const legacy = typeof o.legacy === "number" && Number.isFinite(o.legacy) ? o.legacy : undefined;
    return legacy === undefined ? { widths, active } : { widths, active, legacyWidth: legacy };
  } catch {
    return empty;
  }
}

export function railDrawerWriteStored(stored: AfDrawerStored): string {
  return JSON.stringify({ v: 1, widths: stored.widths, active: stored.active, ...(stored.legacyWidth !== undefined ? { legacy: stored.legacyWidth } : {}) });
}

/** A panel's width: stored for it, else the legacy single width, else its default; clamped to its bounds. */
export function railDrawerPanelWidth(stored: AfDrawerStored, panel: Pick<AfDrawerPanel, "id" | "minWidth" | "maxWidth" | "defaultWidth">, defaults?: { min?: number; max?: number; width?: number }): number {
  const min = panel.minWidth ?? defaults?.min ?? AF_RAIL_WIDTH.min;
  const max = panel.maxWidth ?? defaults?.max ?? AF_RAIL_WIDTH.max;
  const fallback = panel.defaultWidth ?? defaults?.width ?? AF_RAIL_WIDTH.default;
  const value = stored.widths[panel.id] ?? stored.legacyWidth;
  return railDrawerClampWidth(value ?? fallback, min, max, fallback);
}

/** The open panel to restore on `side`: only while docked, only a panel that still exists there. */
export function railDrawerStoredActive(stored: AfDrawerStored, side: AfDrawerSide, overlay: boolean, panels: ReadonlyArray<Pick<AfDrawerPanel, "id" | "side">>): string | null {
  if (overlay) return null;
  const id = stored.active[side];
  if (!id) return null;
  const panel = panels.find((p) => p.id === id);
  return panel && railDrawerSide(panel) === side ? id : null;
}

/** The CSS `top` of an anchored overlay ("auto" = the published top-bar height); undefined = not anchored. */
export function railDrawerTopOffset(topOffset: "auto" | number | undefined): string | undefined {
  if (topOffset === "auto") return "var(--af-topbar-h, 0px)";
  if (typeof topOffset === "number" && Number.isFinite(topOffset)) return `${Math.max(0, Math.round(topOffset))}px`;
  return undefined;
}

// ------------------------------------------------------------ panel header slot

/**
 * Where a panel's own header actions go. undefined = not inside a drawer
 * system (AfPanelHeaderActions renders in place); null = the slot is not
 * mounted yet (renders nothing until it is).
 */
const AfPanelHeaderSlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Header actions rendered from INSIDE a panel's content (state stays with the
 * content): inside AfDrawerSystem they appear in the panel's header, before
 * the collapse button; elsewhere they render in place.
 */
export function AfPanelHeaderActions(props: { children?: React.ReactNode }): React.ReactElement | null {
  const slot = useContext(AfPanelHeaderSlot);
  if (slot === undefined) return <>{props.children}</>;
  if (slot === null) return null;
  return createPortal(props.children, slot);
}

// ------------------------------------------------------------ error boundary

type BoundaryProps = {
  label: string;
  /** "panel" (default) = the labeled notice + Try again; "inline" = a small warning icon (panel header actions). */
  variant?: "panel" | "inline";
  children?: React.ReactNode;
};
type BoundaryState = { error: Error | null };

/** One panel's error boundary: a failure shows a labeled notice in that panel only. */
export class AfPanelErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.variant === "inline") {
      const text = `The ${this.props.label} panel's actions stopped: ${error.message || "unknown error"}`;
      return (
        <span className="af-rail__error-inline" role="img" aria-label={text} data-af-tip={text} data-panel-error="actions">
          <Icon name="warning" size={16} />
        </span>
      );
    }
    return (
      <div className="af-rail__error" role="alert" data-panel-error="">
        <p className="af-rail__error-text">
          The {this.props.label} panel stopped: {error.message || "unknown error"}
        </p>
        <button type="button" className="af-rail__error-retry" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

// ------------------------------------------------------------ one side

function readStored(key: string | undefined): AfDrawerStored {
  if (!key || typeof window === "undefined") return { widths: {}, active: {} };
  try {
    return railDrawerReadStored(window.localStorage.getItem(key));
  } catch {
    return { widths: {}, active: {} };
  }
}

function writeStored(key: string | undefined, stored: AfDrawerStored): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, railDrawerWriteStored(stored));
  } catch {
    /* in-memory state still applies */
  }
}

function PanelSection(props: {
  panel: AfDrawerPanel;
  idBase: string;
  open: boolean;
  mounted: boolean;
  overlay: boolean;
  side: AfDrawerSide;
  onCollapse: () => void;
}): React.ReactElement {
  const { panel } = props;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const body = props.mounted ? panel.content : null;
  return (
    <section
      id={`${props.idBase}-panel-${panel.id}`}
      role="tabpanel"
      aria-labelledby={panel.mode === "drawer" ? undefined : `${props.idBase}-tab-${panel.id}`}
      aria-label={panel.mode === "drawer" ? panel.label : undefined}
      className="af-rail__section"
      data-panel={panel.id}
      hidden={!props.open}
    >
      <header className="af-rail__head">
        <h2 className="af-rail__title">{panel.label}</h2>
        <span className="af-rail__head-actions">
          {panel.headerActions === undefined || panel.headerActions === null ? null : panel.errorBoundary === false ? (
            panel.headerActions
          ) : (
            <AfPanelErrorBoundary label={panel.label} variant="inline">
              {panel.headerActions}
            </AfPanelErrorBoundary>
          )}
          <span className="af-rail__head-slot" ref={setSlot} />
          <button
            type="button"
            className="af-rail__icon-btn"
            data-action="collapse-panel"
            aria-label={`Collapse ${panel.label}`}
            title="Collapse"
            onClick={props.onCollapse}
          >
            <Icon name={props.overlay ? "x" : "chevronRight"} size={16} />
          </button>
        </span>
      </header>
      <div className={`af-rail__body${panel.fill ? " af-rail__body--fill" : ""}`} data-fill={panel.fill ? "" : undefined}>
        <AfPanelHeaderSlot.Provider value={slot}>
          {panel.errorBoundary === false ? body : <AfPanelErrorBoundary label={panel.label}>{body}</AfPanelErrorBoundary>}
        </AfPanelHeaderSlot.Provider>
      </div>
    </section>
  );
}

function DrawerSide(props: {
  side: AfDrawerSide;
  panels: AfDrawerPanel[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  overlay: boolean;
  width: (panel: AfDrawerPanel) => number;
  setWidth: (panel: AfDrawerPanel, width: number, final: boolean) => void;
  ariaLabel: string;
  idBase: string;
  railLabelStyle: "icon" | "vertical-text";
  top?: string;
  className?: string;
}): React.ReactElement {
  const { side, panels, activeId, overlay, onActiveChange } = props;
  const activePanel = panels.find((p) => p.id === activeId) || null;
  const railPanels = panels.filter((p) => p.mode !== "drawer");
  const [visited, setVisited] = useState<Set<string>>(() => new Set(activeId ? [activeId] : []));
  const railRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startX: number; startW: number; pointerId: number } | null>(null);
  const width = activePanel ? props.width(activePanel) : AF_RAIL_WIDTH.default;
  const widthRef = useRef(width);
  widthRef.current = width;
  const min = activePanel?.minWidth ?? AF_RAIL_WIDTH.min;
  const max = activePanel?.maxWidth ?? AF_RAIL_WIDTH.max;

  useEffect(() => {
    if (activeId) setVisited((prev) => (prev.has(activeId) ? prev : new Set([...prev, activeId])));
  }, [activeId]);

  // Overlay: Escape collapses (topmost layer only), focus moves in and back.
  // Keyed on the open panel's ID (panel objects are often rebuilt every render).
  const openId = activePanel ? activePanel.id : null;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  useEffect(() => {
    if (!overlay || !openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onActiveChangeRef.current(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, openId]);
  useEffect(() => {
    if (!overlay) return;
    if (openId) {
      if (!openerRef.current && typeof document !== "undefined") openerRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus({ preventScroll: true });
    } else {
      const opener = openerRef.current;
      openerRef.current = null;
      const focused = typeof document !== "undefined" ? document.activeElement : null;
      if (opener && (!focused || focused === document.body || panelRef.current?.contains(focused))) opener.focus?.();
    }
  }, [overlay, openId]);

  const onRailKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || []);
    const current = buttons.findIndex((b) => b === document.activeElement);
    const next = railDrawerNextIndex(buttons.length, current < 0 ? 0 : current, e.key);
    if (next === null) return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  const onSeparatorKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!activePanel) return;
    const next = railDrawerKeyWidth(widthRef.current, e.key, e.shiftKey, min, max, side);
    if (next === null) return;
    e.preventDefault();
    props.setWidth(activePanel, next, true);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = { startX: e.clientX, startW: widthRef.current, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !activePanel) return;
    props.setWidth(activePanel, railDrawerDragWidth(d.startW, e.clientX - d.startX, side, min, max), false);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (activePanel) props.setWidth(activePanel, widthRef.current, true);
  };

  const open = Boolean(activePanel);
  const vertical = props.railLabelStyle === "vertical-text";
  const anchored = overlay && props.top !== undefined;
  const style = {
    "--af-rail-panel-width": `${width}px`,
    "--af-panel-w": `${width}px`,
    ...(props.top !== undefined ? { "--af-drawers-top": props.top } : {}),
  } as React.CSSProperties;
  const rail =
    railPanels.length > 0 ? (
      <div ref={railRef} className="af-rail__rail" role="tablist" aria-orientation="vertical" aria-label={props.ariaLabel} onKeyDown={onRailKey}>
        {railPanels.map((item) => {
          const selected = item.id === activeId;
          const tip = `${selected ? `Collapse ${item.label}` : item.label}${item.hint ? ` · ${item.hint}` : ""}`;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${props.idBase}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${props.idBase}-panel-${item.id}`}
              aria-label={item.label}
              title={tip}
              className={`af-rail__tab${vertical ? " af-rail__tab--text" : ""}${selected ? " is-active" : ""}`}
              data-rail={item.id}
              onClick={(e) => {
                openerRef.current = e.currentTarget;
                onActiveChange(railDrawerToggle(activeId, item.id));
              }}
            >
              {vertical ? (
                <span className="af-rail__vlabel" aria-hidden="true">
                  {item.label}
                </span>
              ) : (
                <Icon name={item.icon} size={19} />
              )}
              {typeof item.badge === "number" && item.badge > 0 ? (
                <span className="af-rail__badge" aria-hidden="true">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : item.badge === true ? (
                <span className="af-rail__dot" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div
      className={`af-rail${side === "left" ? " af-rail--left" : ""}${open ? " af-rail--open" : " af-rail--collapsed"}${overlay ? " af-rail--overlay" : " af-rail--docked"}${anchored ? " af-rail--anchored" : ""}${rail ? "" : " af-rail--no-rail"}${vertical ? " af-rail--vertical-text" : ""}${props.className ? ` ${props.className}` : ""}`}
      style={style}
      data-active={activeId || ""}
      data-side={side}
    >
      {side === "left" ? rail : null}
      {overlay && open ? <div className="af-rail__backdrop" aria-hidden="true" onClick={() => onActiveChange(null)} /> : null}
      <div className="af-rail__panel-wrap" hidden={!open} style={!overlay && open ? { width } : undefined}>
        {!overlay && open ? (
          <div
            className="af-rail__resize"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize the ${activePanel?.label || ""} panel`}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={width}
            tabIndex={0}
            title="Drag to resize"
            onKeyDown={onSeparatorKey}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ) : null}
        <div
          ref={panelRef}
          className="af-rail__panel"
          role={overlay ? "dialog" : undefined}
          aria-label={overlay ? activePanel?.label : undefined}
          tabIndex={overlay ? -1 : undefined}
        >
          {panels.map((panel) => (
            <PanelSection
              key={panel.id}
              panel={panel}
              idBase={props.idBase}
              open={panel.id === activeId}
              mounted={railDrawerMounted(panel, activeId, visited)}
              overlay={overlay}
              side={side}
              onCollapse={() => onActiveChange(null)}
            />
          ))}
        </div>
      </div>
      {side === "right" ? rail : null}
    </div>
  );
}

// ------------------------------------------------------------ the system

export function AfDrawerSystem(props: AfDrawerSystemProps): React.ReactElement {
  const narrow = useAfMedia(props.overlayBelow || AF_MEDIA.md);
  const overlay = props.overlay ?? narrow;
  const idBase = props.idBase || "af-rail";
  const { panels, onActiveChange, storageKey } = props;
  const [stored, setStored] = useState<AfDrawerStored>(() => readStored(storageKey));
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const onResizeRef = useRef(props.onResize);
  onResizeRef.current = props.onResize;

  const left = panels.filter((p) => railDrawerSide(p) === "left");
  const right = panels.filter((p) => railDrawerSide(p) === "right");
  const activeLeft = railDrawerActiveFor(props.active, "left", panels);
  const activeRight = railDrawerActiveFor(props.active, "right", panels);

  const width = useCallback((panel: AfDrawerPanel) => railDrawerPanelWidth(stored, panel), [stored]);
  const setWidth = useCallback(
    (panel: AfDrawerPanel, w: number, final: boolean) => {
      const next: AfDrawerStored = { ...storedRef.current, widths: { ...storedRef.current.widths, [panel.id]: railDrawerPanelWidth({ widths: { [panel.id]: w }, active: {} }, panel) } };
      storedRef.current = next;
      setStored(next);
      if (final) {
        writeStored(storageKey, next);
        onResizeRef.current?.(panel.id, next.widths[panel.id]);
      }
    },
    [storageKey],
  );

  // Restore the stored open panel once, while docked (never an overlay over the content).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (props.restoreActive === false) return;
    for (const side of ["left", "right"] as const) {
      const current = side === "left" ? activeLeft : activeRight;
      const want = railDrawerStoredActive(storedRef.current, side, overlay, panels);
      if (!current && want) onActiveChange(want, side);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the open panel per side while docked (an overlay session never overwrites it).
  const persistedOnce = useRef(false);
  useEffect(() => {
    if (!persistedOnce.current) {
      persistedOnce.current = true;
      return;
    }
    if (overlay || !storageKey) return;
    const next: AfDrawerStored = { ...storedRef.current, active: { left: activeLeft, right: activeRight } };
    storedRef.current = next;
    writeStored(storageKey, next);
  }, [activeLeft, activeRight, overlay, storageKey]);

  // A controlled request ("id#nonce") opens its panel.
  useEffect(() => {
    const req = railDrawerParseRequest(props.request);
    if (!req) return;
    const panel = panels.find((p) => p.id === req.id);
    if (!panel) return;
    const side = railDrawerSide(panel);
    if ((side === "left" ? activeLeft : activeRight) !== req.id) onActiveChange(req.id, side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.request]);

  const top = overlay ? railDrawerTopOffset(props.topOffset) : undefined;
  const railLabelStyle = props.railLabelStyle || "icon";
  const sideNode = (side: AfDrawerSide, list: AfDrawerPanel[], activeId: string | null) =>
    list.length ? (
      <DrawerSide
        side={side}
        panels={list}
        activeId={activeId}
        onActiveChange={(id) => onActiveChange(id, side)}
        overlay={overlay}
        width={width}
        setWidth={setWidth}
        ariaLabel={left.length && right.length ? `${props.ariaLabel} (${side})` : props.ariaLabel}
        idBase={idBase}
        railLabelStyle={railLabelStyle}
        top={top}
        className={props.children === undefined ? props.className : undefined}
      />
    ) : null;

  // Without children and without left panels the markup is exactly AfRailDrawer's (one .af-rail).
  if (props.children === undefined && !left.length) return sideNode("right", right, activeRight) || <></>;
  return (
    <div className={`af-drawers${overlay ? " af-drawers--overlay" : ""}${props.className ? ` ${props.className}` : ""}`}>
      {sideNode("left", left, activeLeft)}
      <div className="af-drawers__main">{props.children}</div>
      {sideNode("right", right, activeRight)}
    </div>
  );
}

export default AfDrawerSystem;
