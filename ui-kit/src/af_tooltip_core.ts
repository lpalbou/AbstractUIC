/*
 * af_tooltip_core — the kit's tooltip, framework-free, shared by React apps
 * (AfTooltip / useAfTooltips) and plain-HTML hosts (the gateway console binds
 * it through the console islands: `AfConsoleIslands.bindTooltips(document)`).
 *
 * Markup contract: any element with a `data-af-tip="<sentence>"` attribute
 * gets the tooltip. Icon buttons keep their own `aria-label` (the accessible
 * name); they carry NO `title` (a native tooltip would show twice).
 *
 * bindAfTooltips(root, options) delegates on `root` (a Document or an
 * Element) until the returned release() is called:
 * - pointer hover on an anchor shows the tooltip after `delayMs` (150 ms);
 *   touch hovers are ignored (a tap acts, it does not explain);
 * - KEYBOARD focus shows it after the same delay (focus that follows a
 *   pointer press does not — `:focus-visible` semantics, with a last-input
 *   tracker where the selector is unsupported);
 * - it hides when the pointer leaves the anchor (unless it moves onto the
 *   tooltip itself: the tooltip is hoverable), on blur, on any press, on
 *   scroll, on resize, and on Escape (Escape is taken at the window in the
 *   capture phase and marked defaultPrevented ONLY when a tooltip was
 *   visible, so an enclosing modal stays open for that one press);
 * - ONE tooltip element per document (`.af-tooltip`, role="tooltip",
 *   position: fixed, appended to <body>) is reused; its text is set with
 *   textContent (never HTML). While shown, the anchor gets
 *   aria-describedby -> the tooltip when the sentence differs from the
 *   anchor's aria-label (the same words are not read twice);
 * - placement (afTooltipPlacement): above the anchor, centred, flipped
 *   below when it does not fit above, clamped 8 px inside the viewport, so
 *   it never widens the page and is never clipped by an ancestor's overflow;
 * - the anchor's sentence is read when the tooltip SHOWS (a re-rendered
 *   label is picked up), and an anchor removed meanwhile shows nothing.
 * Theming: theme.css `af-tooltip` block (inverse surface from the active
 * theme's tokens: readable in every light and dark theme).
 */

export type AfTooltipRect = { top: number; left: number; right: number; bottom: number };
export type AfTooltipPlacement = { top: number; left: number; side: "top" | "bottom" };

/** Default show delay (ms) for hover and keyboard focus. */
export const AF_TOOLTIP_DELAY_MS = 150;
/** The attribute that carries an anchor's sentence. */
export const AF_TOOLTIP_ATTR = "data-af-tip";

/** Where a tooltip of `size` goes for an anchor at `anchor` in a `viewport` (gap 6 px, margin 8 px). */
export function afTooltipPlacement(
  anchor: AfTooltipRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = 8,
): AfTooltipPlacement {
  let side: "top" | "bottom" = "top";
  let top = anchor.top - gap - size.height;
  if (top < margin) {
    const below = anchor.bottom + gap;
    // Flip only when it fits below (or fits better there than above).
    if (below + size.height <= viewport.height - margin || viewport.height - anchor.bottom > anchor.top) {
      top = below;
      side = "bottom";
    }
  }
  const centre = (anchor.left + anchor.right) / 2;
  let left = centre - size.width / 2;
  left = Math.max(margin, Math.min(left, viewport.width - margin - size.width));
  top = Math.max(margin, Math.min(top, viewport.height - margin - size.height));
  return { top: Math.round(top), left: Math.round(left), side };
}

export type BindAfTooltipsOptions = {
  /** Show delay for hover and keyboard focus (default 150 ms). */
  delayMs?: number;
};

let tooltipSeq = 0;

function tipOf(el: Element | null): string {
  if (!el) return "";
  return String(el.getAttribute(AF_TOOLTIP_ATTR) || "").trim();
}

function anchorFrom(target: EventTarget | null, root: Node): HTMLElement | null {
  const el = target as Element | null;
  if (!el || typeof (el as Element).closest !== "function") return null;
  const a = el.closest(`[${AF_TOOLTIP_ATTR}]`) as HTMLElement | null;
  if (!a || !root.contains(a) || !tipOf(a)) return null;
  return a;
}

/** Bind the kit tooltip to every `[data-af-tip]` element under `root`. Returns release(). */
export function bindAfTooltips(root: Document | Element, options: BindAfTooltipsOptions = {}): () => void {
  if (!root) throw new Error("bindAfTooltips: a root (document or element) is required");
  const doc: Document = ((root as Document).nodeType === 9 ? root : (root as Element).ownerDocument) as Document;
  const win = (doc.defaultView || (globalThis as unknown as Window)) as Window;
  const delay = typeof options.delayMs === "number" && options.delayMs >= 0 ? options.delayMs : AF_TOOLTIP_DELAY_MS;

  tooltipSeq += 1;
  const tip = doc.createElement("div");
  tip.className = "af-tooltip";
  tip.setAttribute("role", "tooltip");
  const tipId = `af-tooltip-${tooltipSeq}`;
  tip.setAttribute("id", tipId);
  tip.hidden = true;
  (doc.body || doc.documentElement).appendChild(tip);

  let anchor: HTMLElement | null = null; // the anchor whose tooltip is shown
  let pending: HTMLElement | null = null; // the anchor waiting for its delay
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let keyboard = false; // last input was a key (for :focus-visible fallback)
  let describedBefore: string | null = null;

  const clearShow = () => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    pending = null;
  };
  const clearHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  };
  const place = () => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const m = tip.getBoundingClientRect();
    const p = afTooltipPlacement(r, { width: m.width, height: m.height }, { width: win.innerWidth, height: win.innerHeight });
    tip.style.top = `${p.top}px`;
    tip.style.left = `${p.left}px`;
    tip.setAttribute("data-side", p.side);
  };
  const hide = () => {
    clearShow();
    clearHide();
    if (!anchor) return;
    const described = String(anchor.getAttribute("aria-describedby") || "").split(/\s+/);
    if (described.includes(tipId)) {
      if (describedBefore) anchor.setAttribute("aria-describedby", describedBefore);
      else anchor.removeAttribute("aria-describedby");
    }
    describedBefore = null;
    anchor = null;
    tip.hidden = true;
    tip.textContent = "";
  };
  const show = (el: HTMLElement) => {
    clearShow();
    clearHide();
    if (anchor && anchor !== el) hide();
    const text = tipOf(el);
    if (!text || el.isConnected === false) return;
    anchor = el;
    tip.textContent = text;
    tip.hidden = false;
    const aria = String(el.getAttribute("aria-label") || "").trim();
    if (aria !== text) {
      const prev = el.getAttribute("aria-describedby");
      describedBefore = prev && prev !== tipId ? prev : null;
      el.setAttribute("aria-describedby", describedBefore ? `${describedBefore} ${tipId}` : tipId);
    }
    place();
  };
  const schedule = (el: HTMLElement) => {
    clearHide();
    if (anchor === el) return;
    if (pending === el) return;
    clearShow();
    pending = el;
    showTimer = setTimeout(() => {
      const target = pending;
      showTimer = null;
      pending = null;
      if (target) show(target);
    }, delay);
  };
  const scheduleHide = () => {
    clearShow();
    if (!anchor) return;
    clearHide();
    // A short grace so the pointer can move from the anchor onto the tooltip.
    hideTimer = setTimeout(hide, 100);
  };
  const isKeyboardFocus = (el: HTMLElement): boolean => {
    try {
      if (typeof el.matches === "function") return el.matches(":focus-visible");
    } catch {
      /* selector unsupported: fall back to the last-input tracker */
    }
    return keyboard;
  };

  const onOver = (e: Event) => {
    const pe = e as PointerEvent;
    if (pe.pointerType === "touch") return;
    if (tip.contains(e.target as Node)) {
      clearHide();
      return;
    }
    const a = anchorFrom(e.target, root as Node);
    if (a) schedule(a);
  };
  const onOut = (e: Event) => {
    const pe = e as PointerEvent;
    const to = (pe.relatedTarget as Node | null) || null;
    if (to && (tip.contains(to) || (anchor && anchor.contains(to)) || (pending && pending.contains(to)))) return;
    if (pending && !anchor) {
      clearShow();
      return;
    }
    if (anchor) scheduleHide();
  };
  const onTipOut = (e: Event) => {
    const to = ((e as PointerEvent).relatedTarget as Node | null) || null;
    if (to && (tip.contains(to) || (anchor && anchor.contains(to)))) return;
    scheduleHide();
  };
  const onFocusIn = (e: Event) => {
    const a = anchorFrom(e.target, root as Node);
    if (!a) return;
    if (isKeyboardFocus(a)) schedule(a);
  };
  const onFocusOut = (e: Event) => {
    const a = anchorFrom(e.target, root as Node);
    if (a && (a === anchor || a === pending)) hide();
  };
  const onPress = () => {
    keyboard = false;
    hide();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Esc") {
      if (anchor) {
        e.preventDefault();
        hide();
      } else {
        clearShow();
      }
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboard = true;
  };
  const onScrollOrResize = () => hide();

  const r = root as Node;
  r.addEventListener("pointerover", onOver);
  r.addEventListener("pointerout", onOut);
  r.addEventListener("focusin", onFocusIn);
  r.addEventListener("focusout", onFocusOut);
  tip.addEventListener("pointerover", onOver);
  tip.addEventListener("pointerout", onTipOut);
  doc.addEventListener("pointerdown", onPress, true);
  win.addEventListener("keydown", onKey as EventListener, true);
  win.addEventListener("scroll", onScrollOrResize, true);
  win.addEventListener("resize", onScrollOrResize);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    hide();
    r.removeEventListener("pointerover", onOver);
    r.removeEventListener("pointerout", onOut);
    r.removeEventListener("focusin", onFocusIn);
    r.removeEventListener("focusout", onFocusOut);
    tip.removeEventListener("pointerover", onOver);
    tip.removeEventListener("pointerout", onTipOut);
    doc.removeEventListener("pointerdown", onPress, true);
    win.removeEventListener("keydown", onKey as EventListener, true);
    win.removeEventListener("scroll", onScrollOrResize, true);
    win.removeEventListener("resize", onScrollOrResize);
    if (tip.parentNode) tip.parentNode.removeChild(tip);
  };
}

// One shared binding per document for React hosts (AfTooltip / useAfTooltips):
// reference-counted, released when the last user unmounts.
const shared = new WeakMap<Document, { count: number; release: () => void }>();

/** Acquire the document-wide tooltip binding (ref-counted). Returns release(). */
export function acquireAfTooltips(doc: Document): () => void {
  let entry = shared.get(doc);
  if (!entry) {
    entry = { count: 0, release: bindAfTooltips(doc) };
    shared.set(doc, entry);
  }
  entry.count += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const e = shared.get(doc);
    if (!e) return;
    e.count -= 1;
    if (e.count <= 0) {
      e.release();
      shared.delete(doc);
    }
  };
}
