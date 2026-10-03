// AfRailDrawer — the vertical rail drawer (ui-kit 0.6.0).
//
// Lifted from AbstractEntity's SideTabs (src/drawer.tsx) and Continuum Teams'
// team drawer rail, with their gaps closed: a narrow ICON rail on the right
// edge of the host's content area; clicking an icon opens that panel beside
// the rail; clicking the open icon (or the panel's collapse button) collapses
// back to the bare rail. The rail never goes away.
//
// - Docked (≥ 1024 px by default): the panel is in the layout flow; its width
//   is resizable by pointer (mouse, pen, touch: pointer capture) and by
//   keyboard on the separator (Arrow keys ±16 px, Shift ±64, Home/End);
//   the width persists under `storageKey`.
// - Overlay (< 1024 px): the panel floats over the content beside the rail
//   with a backdrop; Escape or a backdrop tap collapses it; focus moves into
//   the panel and back to the icon that opened it.
// - Rail: role=tablist (vertical), Up/Down/Home/End move focus, Enter/Space
//   open; every icon is ≥ 44 px square with a tooltip and an accessible name.
// - KEEP-ALIVE: a panel visited once stays mounted (hidden) so unfinished
//   edits and long-running work survive switching panels.
// - Escape follows the consumed-event convention of AfDrawer / AfModal.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icon.js";
import { AF_MEDIA, useAfMedia } from "./responsive.js";

export type AfRailItem = {
  id: string;
  /** Short label: the icon's tooltip, accessible name and the panel title. */
  label: string;
  icon: IconName;
  /** A small count or dot on the icon (number → count, true → dot). */
  badge?: number | boolean;
  /** Extra tooltip text after the label (e.g. "3 running"). */
  hint?: string;
  content: React.ReactNode;
  /** Header actions of this panel (before the collapse button). */
  headerActions?: React.ReactNode;
};

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

export const AF_RAIL_WIDTH = { min: 300, max: 960, default: 420, step: 16, bigStep: 64 } as const;

/** The width clamped to [min, max] (non-finite → `fallback`). */
export function railDrawerClampWidth(width: number, min: number = AF_RAIL_WIDTH.min, max: number = AF_RAIL_WIDTH.max, fallback: number = AF_RAIL_WIDTH.default): number {
  if (!Number.isFinite(width)) return Math.min(max, Math.max(min, fallback));
  return Math.round(Math.min(max, Math.max(min, width)));
}

/**
 * The separator's keyboard rule. The panel sits LEFT of the rail, so
 * ArrowLeft widens and ArrowRight narrows; Shift moves a big step; Home = min,
 * End = max. Returns null for any other key.
 */
export function railDrawerKeyWidth(width: number, key: string, shift: boolean, min: number = AF_RAIL_WIDTH.min, max: number = AF_RAIL_WIDTH.max): number | null {
  const step = shift ? AF_RAIL_WIDTH.bigStep : AF_RAIL_WIDTH.step;
  if (key === "ArrowLeft") return railDrawerClampWidth(width + step, min, max);
  if (key === "ArrowRight") return railDrawerClampWidth(width - step, min, max);
  if (key === "Home") return min;
  if (key === "End") return max;
  return null;
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

/** What a click on a rail icon asks: open it, or collapse when it is already open. */
export function railDrawerToggle(active: string | null, id: string): string | null {
  return active === id ? null : id;
}

function readWidth(key: string | undefined, fallback: number, min: number, max: number): number {
  if (!key) return railDrawerClampWidth(fallback, min, max);
  try {
    const raw = Number.parseInt(window.localStorage.getItem(key) || "", 10);
    if (Number.isFinite(raw)) return railDrawerClampWidth(raw, min, max, fallback);
  } catch {
    /* storage unavailable: the default width */
  }
  return railDrawerClampWidth(fallback, min, max);
}

export function AfRailDrawer(props: AfRailDrawerProps): React.ReactElement {
  const min = props.minWidth ?? AF_RAIL_WIDTH.min;
  const max = props.maxWidth ?? AF_RAIL_WIDTH.max;
  const idBase = props.idBase || "af-rail";
  const narrow = useAfMedia(AF_MEDIA.md);
  const overlay = props.overlay ?? narrow;
  const [width, setWidth] = useState<number>(() => (typeof window === "undefined" ? railDrawerClampWidth(props.defaultWidth ?? AF_RAIL_WIDTH.default, min, max) : readWidth(props.storageKey, props.defaultWidth ?? AF_RAIL_WIDTH.default, min, max)));
  const widthRef = useRef(width);
  widthRef.current = width;
  const [visited, setVisited] = useState<Set<string>>(() => new Set(props.active ? [props.active] : []));
  const railRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startX: number; startW: number; pointerId: number } | null>(null);
  const activeItem = props.items.find((item) => item.id === props.active) || null;
  const { onActiveChange } = props;

  useEffect(() => {
    if (props.active) setVisited((prev) => (prev.has(props.active as string) ? prev : new Set([...prev, props.active as string])));
  }, [props.active]);

  const persist = useCallback(
    (w: number) => {
      if (!props.storageKey) return;
      try {
        window.localStorage.setItem(props.storageKey, String(Math.round(w)));
      } catch {
        /* in-memory width still applies */
      }
    },
    [props.storageKey],
  );

  // Overlay: Escape collapses (topmost layer only), focus moves in and back.
  useEffect(() => {
    if (!overlay || !activeItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onActiveChange(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, activeItem, onActiveChange]);
  useEffect(() => {
    if (!overlay) return;
    if (activeItem) panelRef.current?.focus({ preventScroll: true });
    else if (openerRef.current && document.activeElement && panelRef.current?.contains(document.activeElement)) openerRef.current.focus();
  }, [overlay, activeItem]);

  const onRailKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || []);
    const current = buttons.findIndex((b) => b === document.activeElement);
    const next = railDrawerNextIndex(buttons.length, current < 0 ? 0 : current, e.key);
    if (next === null) return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  const onSeparatorKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = railDrawerKeyWidth(widthRef.current, e.key, e.shiftKey, min, max);
    if (next === null) return;
    e.preventDefault();
    setWidth(next);
    persist(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = { startX: e.clientX, startW: widthRef.current, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // The panel is LEFT of the rail: moving left widens it.
    setWidth(railDrawerClampWidth(d.startW + (d.startX - e.clientX), min, max));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    persist(widthRef.current);
  };

  const open = Boolean(activeItem);
  return (
    <div
      className={`af-rail${open ? " af-rail--open" : " af-rail--collapsed"}${overlay ? " af-rail--overlay" : " af-rail--docked"}${props.className ? ` ${props.className}` : ""}`}
      style={{ "--af-rail-panel-width": `${width}px` } as React.CSSProperties}
      data-active={props.active || ""}
    >
      {overlay && open ? <div className="af-rail__backdrop" aria-hidden="true" onClick={() => onActiveChange(null)} /> : null}
      <div
        className="af-rail__panel-wrap"
        hidden={!open}
        style={!overlay && open ? { width } : undefined}
      >
        {!overlay && open ? (
          <div
            className="af-rail__resize"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize the ${activeItem?.label || ""} panel`}
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
          aria-label={overlay ? activeItem?.label : undefined}
          tabIndex={overlay ? -1 : undefined}
        >
          {props.items.map((item) => (
            <section
              key={item.id}
              id={`${idBase}-panel-${item.id}`}
              role="tabpanel"
              aria-labelledby={`${idBase}-tab-${item.id}`}
              className="af-rail__section"
              data-panel={item.id}
              hidden={item.id !== props.active}
            >
              <header className="af-rail__head">
                <h2 className="af-rail__title">{item.label}</h2>
                <span className="af-rail__head-actions">
                  {item.headerActions}
                  <button
                    type="button"
                    className="af-rail__icon-btn"
                    data-action="collapse-panel"
                    aria-label={`Collapse ${item.label}`}
                    title="Collapse"
                    onClick={() => onActiveChange(null)}
                  >
                    <Icon name={overlay ? "x" : "chevronRight"} size={16} />
                  </button>
                </span>
              </header>
              <div className="af-rail__body">{visited.has(item.id) || item.id === props.active ? item.content : null}</div>
            </section>
          ))}
        </div>
      </div>
      <div ref={railRef} className="af-rail__rail" role="tablist" aria-orientation="vertical" aria-label={props.ariaLabel} onKeyDown={onRailKey}>
        {props.items.map((item) => {
          const selected = item.id === props.active;
          const tip = `${selected ? `Collapse ${item.label}` : item.label}${item.hint ? ` · ${item.hint}` : ""}`;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${idBase}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${idBase}-panel-${item.id}`}
              aria-label={item.label}
              title={tip}
              className={`af-rail__tab${selected ? " is-active" : ""}`}
              data-rail={item.id}
              onClick={(e) => {
                openerRef.current = e.currentTarget;
                onActiveChange(railDrawerToggle(props.active, item.id));
              }}
            >
              <Icon name={item.icon} size={19} />
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
    </div>
  );
}
