// AfDrawer — the shared right-edge drawer primitive (unified top-bar
// consensus, plans/unified-top-bar.md 2026-07-13).
//
// Invariants (behavior contract statements 9-13):
// - NON-MODAL: the app stays interactive beside an open drawer.
// - KEEP-ALIVE: closed = display:none + inert, NEVER unmounted — drawers
//   host long-running work (flow's assistant loop died on a conditional
//   unmount once; that lesson is now structural).
// - ESC closes the TOPMOST layer only: a consumed event (defaultPrevented)
//   belongs to a layer above; when this drawer consumes it, layers below
//   (other drawers) ignore it. The connect modal follows the same
//   convention and sits ABOVE drawers (z-order tokens in theme.css).
// - The drawer neither closes nor loses state at disconnect; the connect
//   modal covers it.
import React, { useEffect, useRef } from "react";

export type AfDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the drawer region. */
  label: string;
  /** Panel width (px). Default 420. Below 680px viewport the drawer is full-width via CSS. */
  width?: number;
  /** Distance from the viewport top (px) — set to your header height so the
   * drawer opens BELOW the app header instead of covering the top-bar
   * cluster (flow's layout). Default 0 (full height). */
  topOffset?: number;
  /** Close on ESC (default true). The handler honors the consumed-event convention. */
  closeOnEscape?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Optional header row; when absent, provide your own inside children. */
  title?: React.ReactNode;
  /** Extra header actions rendered before the close button. */
  headerActions?: React.ReactNode;
};

export function AfDrawer(props: AfDrawerProps): React.ReactElement {
  const closeOnEscape = props.closeOnEscape !== false;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, closeOnEscape, props.onClose]);

  // inert is not yet in React's TS dom types everywhere — set it imperatively.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (props.open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [props.open]);

  return (
    <div
      ref={panelRef}
      className={`af-drawer${props.open ? " af-drawer--open" : ""}${props.className ? ` ${props.className}` : ""}`}
      style={{ width: props.width || 420, top: props.topOffset || 0, display: props.open ? undefined : "none" }}
      role="complementary"
      aria-label={props.label}
      aria-hidden={props.open ? undefined : true}
    >
      {props.title !== undefined ? (
        <div className="af-drawer__header">
          <div className="af-drawer__title">{props.title}</div>
          <div className="af-drawer__header-actions">
            {props.headerActions}
            <button type="button" className="af-drawer__close" aria-label="Close panel" onClick={props.onClose}>
              ×
            </button>
          </div>
        </div>
      ) : null}
      <div className="af-drawer__body">{props.children}</div>
    </div>
  );
}

export default AfDrawer;
