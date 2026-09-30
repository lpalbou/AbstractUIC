/*
 * AfModal — the kit's large modal dialog (Email, Logs, any "open a panel over
 * the page" surface). One scroll per surface: on desktop the BODY scrolls
 * between a fixed header and footer; below 768 px the dialog is a full-screen
 * sheet whose one scroller is the sheet itself (theme.css `af-modal` block).
 *
 * Behaviour (af_modal_core.bindAfModal, shared with plain-HTML hosts): focus
 * moves in and returns to the opener, Tab is trapped, Escape and a backdrop
 * click call onClose, the page behind does not scroll.
 *
 * Markup (plain-HTML hosts render exactly this; docs/modal.md):
 *
 *   <div class="af-modal-backdrop">
 *     <div class="af-modal" role="dialog" aria-modal="true" aria-labelledby="<id>-title">
 *       <div class="af-modal__header">
 *         <h2 class="af-modal__title" id="<id>-title">Email — alice</h2>
 *         <button type="button" class="af-modal__close" aria-label="Close">×</button>
 *       </div>
 *       <div class="af-modal__body">…</div>
 *       [<div class="af-modal__footer">[<p class="af-modal__footer-note">…</p>] buttons</div>]
 *     </div>
 *   </div>
 */
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { bindAfModal } from "./af_modal_core.js";

export type AfModalProps = {
  open: boolean;
  /** Escape, the close button and a backdrop click call this; the host sets open=false. */
  onClose: () => void;
  /** Heading text; also the dialog's accessible name. */
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Footer row content (buttons); omitted = no footer. */
  footer?: React.ReactNode;
  /** A short muted note at the start of the footer (e.g. the source of a list). */
  footerNote?: React.ReactNode;
  /** "default" = min(960px, 100vw - 32px); "narrow" = min(560px, 100vw - 32px). */
  size?: "default" | "narrow";
  /** Accessible name of the close button (default "Close"). */
  closeLabel?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /** Element to focus first (default: [data-af-autofocus] / first focusable in the body). */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** id of an element that describes the dialog (aria-describedby). */
  describedBy?: string;
  /** Render into document.body (default true in a browser). */
  portal?: boolean;
  /** Base id (default: React useId). The title is `${id}-title`. */
  id?: string;
  className?: string;
};

export function AfModal(props: AfModalProps): React.ReactElement | null {
  const autoId = useId().replace(/:/g, "");
  const id = props.id || `af-modal-${autoId}`;
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  // Bound once per open: an inline onClose must not re-bind (and re-focus) on every render.
  useEffect(() => {
    if (!props.open || !backdropRef.current) return;
    return bindAfModal(backdropRef.current, {
      onClose: () => onCloseRef.current(),
      closeOnEscape: props.closeOnEscape !== false,
      closeOnBackdrop: props.closeOnBackdrop !== false,
      initialFocus: props.initialFocusRef ? props.initialFocusRef.current : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  if (!props.open) return null;
  const node = (
    <div className="af-modal-backdrop" ref={backdropRef}>
      <div
        className={`af-modal${props.size === "narrow" ? " af-modal--narrow" : ""}${props.className ? ` ${props.className}` : ""}`}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={props.describedBy}
      >
        <div className="af-modal__header">
          <h2 className="af-modal__title" id={`${id}-title`}>
            {props.title}
          </h2>
          <button type="button" className="af-modal__close" aria-label={props.closeLabel || "Close"} onClick={() => onCloseRef.current()}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="af-modal__body">{props.children}</div>
        {props.footer !== undefined || props.footerNote !== undefined ? (
          <div className="af-modal__footer">
            {props.footerNote !== undefined ? <p className="af-modal__footer-note">{props.footerNote}</p> : null}
            {props.footer}
          </div>
        ) : null}
      </div>
    </div>
  );
  const usePortal = props.portal !== false && typeof document !== "undefined" && !!document.body;
  return usePortal ? createPortal(node, document.body) : node;
}

export default AfModal;
