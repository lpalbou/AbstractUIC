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
// - FOCUS (backlog 0036): on open, focus moves into the drawer (its first
//   focusable control, else the panel); on close, it returns to the element
//   that had it before, when focus was inside the drawer (AbstractCode's
//   useDrawerFocus, absorbed). `manageFocus={false}` opts out.
// - `topOffset: "auto"` = under the app header: `var(--af-topbar-h)`, which
//   AfTopBarActions publishes (no app-side measuring).
import React, { useEffect, useRef } from "react";

const DRAWER_FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Where focus goes when a drawer opens: an element marked `data-autofocus`,
 * else the first text field (an assistant's composer), else the first
 * focusable control of the body, else the drawer itself. On a touch screen
 * (`coarse`) a text field is skipped: focusing it would raise the soft
 * keyboard over the drawer the person only meant to open.
 */
export function drawerFocusTarget(el: HTMLElement | null, coarse = false): HTMLElement | null {
  if (!el) return null;
  const body = el.querySelector<HTMLElement>(".af-drawer__body") || el;
  const auto = body.querySelector<HTMLElement>("[data-autofocus]");
  if (auto) return auto;
  if (coarse) return el;
  return body.querySelector<HTMLElement>("textarea:not(:disabled)") || body.querySelector<HTMLElement>(DRAWER_FOCUSABLE) || el;
}

function coarsePointer(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** The CSS `top` of a drawer: "auto" = the published top-bar height; a number = px; none = 0. */
export function drawerTop(topOffset: number | "auto" | undefined): string | number {
  if (topOffset === "auto") return "var(--af-topbar-h, 0px)";
  return typeof topOffset === "number" && Number.isFinite(topOffset) ? topOffset : 0;
}

export type AfDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the drawer region. */
  label: string;
  /** Panel width (px). Default 420. Below 768px viewport (the `sm` breakpoint) the drawer is full-width via CSS. */
  width?: number;
  /** Distance from the viewport top (px) — set to your header height so the
   * drawer opens BELOW the app header instead of covering the top-bar
   * cluster (flow's layout). "auto" = the height AfTopBarActions publishes
   * (`--af-topbar-h`). Default 0 (full height). */
  topOffset?: number | "auto";
  /** Move focus in on open and back to the opener on close (default true). */
  manageFocus?: boolean;
  /** Close on ESC (default true). The handler honors the consumed-event convention. */
  closeOnEscape?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Optional header row; when absent, provide your own inside children. */
  title?: React.ReactNode;
  /** Extra header actions rendered before the close button. */
  headerActions?: React.ReactNode;
  /** Edge the drawer opens from (default "right"). "left" suits a navigation
   * sidebar that becomes a drawer below the `md` breakpoint (1024px). */
  side?: "left" | "right";
  /** Render a dimmed backdrop behind the open drawer; a tap on it closes the
   * drawer. Use it where the drawer REPLACES a docked sidebar on narrow
   * screens (overlay mode). Default false: the drawer stays non-modal. */
  backdrop?: boolean;
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

  const opener = useRef<HTMLElement | null>(null);
  const manageFocus = props.manageFocus !== false;
  const focusMounted = useRef(false);
  useEffect(() => {
    // A drawer that is open at page load does not take the focus; only an opening does.
    if (!focusMounted.current) {
      focusMounted.current = true;
      return;
    }
    if (!manageFocus || typeof document === "undefined") return;
    const el = panelRef.current;
    if (props.open) {
      opener.current = document.activeElement as HTMLElement | null;
      if (el && el.contains(document.activeElement)) return;
      // After the drawer becomes visible (display/inert flip in this commit).
      const id = window.setTimeout(() => {
        drawerFocusTarget(el, coarsePointer())?.focus({ preventScroll: true });
      }, 0);
      return () => window.clearTimeout(id);
    }
    const back = opener.current;
    opener.current = null;
    const focused = document.activeElement;
    if (back && back.isConnected && (!focused || focused === document.body || (el && el.contains(focused)))) back.focus?.({ preventScroll: true });
    return undefined;
  }, [props.open, manageFocus]);

  // inert is not yet in React's TS dom types everywhere — set it imperatively.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (props.open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [props.open]);

  return (
    <>
    {props.backdrop && props.open ? <div className="af-drawer-backdrop" aria-hidden="true" onClick={props.onClose} style={{ top: drawerTop(props.topOffset) }} /> : null}
    <div
      ref={panelRef}
      className={`af-drawer${props.side === "left" ? " af-drawer--left" : ""}${props.topOffset ? " af-drawer--offset" : ""}${props.open ? " af-drawer--open" : ""}${props.className ? ` ${props.className}` : ""}`}
      style={{ width: props.width || 420, top: drawerTop(props.topOffset), display: props.open ? undefined : "none" }}
      role="complementary"
      aria-label={props.label}
      aria-hidden={props.open ? undefined : true}
      tabIndex={-1}
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
    </>
  );
}

export default AfDrawer;
