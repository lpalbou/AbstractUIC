/*
 * af_modal_core — the framework-free behaviour behind AfModal, shared with
 * plain-HTML hosts (the gateway console binds it through the console islands:
 * `AfConsoleIslands.bindModal(backdrop, { onClose })`).
 *
 * bindAfModal(backdrop, options) makes an `.af-modal-backdrop` element behave
 * as a modal dialog until the returned release() is called:
 * - focus moves inside (the element with [data-af-autofocus] / [autofocus],
 *   else the first focusable in the body, else the first focusable, else the
 *   dialog itself) and returns to the opener on release;
 * - Tab / Shift+Tab stay inside the dialog (focus trap);
 * - Escape closes (only the TOPMOST bound modal; an event another layer
 *   already consumed — defaultPrevented — is ignored);
 * - a click on the backdrop itself closes (press AND release on the backdrop,
 *   so a text selection dragged out of the dialog never closes it);
 * - <html> gets `af-modal-open` (page scroll locked) while any modal is bound.
 * Nothing here renders: the markup contract is in docs/modal.md.
 */

export const AF_MODAL_FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "summary",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

type FocusableLike = { focus: (opts?: { preventScroll?: boolean }) => void };

/** Where Tab should move focus inside a trap, or null to let the browser move it. */
export function afModalTabTarget<T>(focusables: readonly T[], active: T | null, shiftKey: boolean, activeInside: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!activeInside) return shiftKey ? last : first;
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}

/**
 * True when `el` sits in the content of a closed <details> (its own <summary> stays reachable).
 * Browsers skip that content on Tab, but Chromium still gives it client rects, so the rect test
 * below does not catch it — a trap that counted it let Tab leave the dialog from the last summary.
 */
function insideClosedDetails(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.tagName.toUpperCase() !== "DETAILS" || p.hasAttribute("open")) continue;
    const ownSummary = el.tagName.toUpperCase() === "SUMMARY" && el.parentElement === p;
    if (!ownSummary) return true;
  }
  return false;
}

/** Every focusable element inside `root`, in DOM order, skipping hidden / inert subtrees and closed <details> content. */
export function afModalFocusables(root: ParentNode): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(AF_MODAL_FOCUSABLE));
  return all.filter((el) => {
    if (typeof el.closest === "function" && el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    if (insideClosedDetails(el)) return false;
    if (typeof el.getClientRects === "function" && el.getClientRects().length === 0) return false;
    return true;
  });
}

export type BindAfModalOptions = {
  /** Called on Escape, on a backdrop click and never otherwise; the host decides to close. */
  onClose: () => void;
  /** Close on Escape (default true). */
  closeOnEscape?: boolean;
  /** Close on a click on the backdrop (default true). */
  closeOnBackdrop?: boolean;
  /** Element to focus first (default: [data-af-autofocus] / [autofocus] / first focusable in the body). */
  initialFocus?: HTMLElement | null;
  /** Lock the page scroll with html.af-modal-open (default true). */
  lockScroll?: boolean;
  /** Document to bind (default: the backdrop's ownerDocument). */
  document?: Document;
};

const stacks = new WeakMap<Document, Element[]>();

/** Make `backdrop` (an `.af-modal-backdrop` holding one `.af-modal`) modal. Returns release(). */
export function bindAfModal(backdrop: HTMLElement, options: BindAfModalOptions): () => void {
  const doc: Document = options.document || backdrop.ownerDocument;
  const dialog: HTMLElement = (backdrop.querySelector(".af-modal") as HTMLElement | null) || backdrop;
  const opener = doc.activeElement as (Element & Partial<FocusableLike>) | null;
  const stack = stacks.get(doc) || [];
  stacks.set(doc, stack);
  stack.push(backdrop);
  const lock = options.lockScroll !== false;
  if (lock) doc.documentElement.classList.add("af-modal-open");

  const focusFirst = () => {
    const body = dialog.querySelector(".af-modal__body");
    const target =
      options.initialFocus ||
      (dialog.querySelector("[data-af-autofocus], [autofocus]") as HTMLElement | null) ||
      (body ? afModalFocusables(body)[0] : undefined) ||
      afModalFocusables(dialog)[0] ||
      dialog;
    if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };
  focusFirst();

  const isTop = () => stack[stack.length - 1] === backdrop;
  const onKey = (e: KeyboardEvent) => {
    if (!isTop()) return;
    if (e.key === "Escape" || e.key === "Esc") {
      if (e.defaultPrevented || options.closeOnEscape === false) return;
      e.preventDefault();
      options.onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = afModalFocusables(dialog);
    const active = doc.activeElement as HTMLElement | null;
    const inside = !!active && dialog.contains(active);
    if (focusables.length === 0) {
      e.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const target = afModalTabTarget(focusables, active, e.shiftKey, inside && active !== dialog);
    if (target) {
      e.preventDefault();
      target.focus({ preventScroll: true });
    }
  };
  // Focus that escapes by other means (a click outside, a programmatic focus) comes back.
  const onFocusIn = (e: FocusEvent) => {
    if (!isTop()) return;
    const t = e.target as Node | null;
    if (t && !dialog.contains(t)) focusFirst();
  };
  let pressedOnBackdrop = false;
  const onDown = (e: Event) => {
    pressedOnBackdrop = e.target === backdrop;
  };
  const onClick = (e: Event) => {
    const hit = e.target === backdrop && pressedOnBackdrop;
    pressedOnBackdrop = false;
    if (!hit || !isTop() || options.closeOnBackdrop === false) return;
    options.onClose();
  };
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("focusin", onFocusIn, true);
  backdrop.addEventListener("mousedown", onDown);
  backdrop.addEventListener("click", onClick);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("focusin", onFocusIn, true);
    backdrop.removeEventListener("mousedown", onDown);
    backdrop.removeEventListener("click", onClick);
    const i = stack.lastIndexOf(backdrop);
    if (i >= 0) stack.splice(i, 1);
    if (lock && stack.length === 0) doc.documentElement.classList.remove("af-modal-open");
    if (opener && typeof opener.focus === "function" && (opener as Node).isConnected !== false) opener.focus({ preventScroll: true });
  };
}
