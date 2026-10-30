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
 * Structured content uses data-af-tip-content plus a plain-text fallback.
 * DOM nodes are created with textContent only; caller HTML is never rendered.
 * Theming: theme.css `af-tooltip` block, active surface/text/border tokens.
 */

export type AfTooltipRect = { top: number; left: number; right: number; bottom: number };
export type AfTooltipPlacement = { top: number; left: number; side: "top" | "bottom" };

/** Default show delay (ms) for hover and keyboard focus. */
export const AF_TOOLTIP_DELAY_MS = 150;
/** The attribute that carries an anchor's sentence. */
export const AF_TOOLTIP_ATTR = "data-af-tip";

/** Structured, non-interactive information; plain strings remain the short-tooltip API. */
export type AfTooltipContent = {
  title: string;
  description?: string;
  facts?: Array<{ label: string; value: string; tone?: "muted" | "success" | "warning" | "danger" }>;
  sections?: Array<{ label: string; items: string[] }>;
  note?: string;
};
export const AF_TOOLTIP_CONTENT_ATTR = "data-af-tip-content";

/** Accessible fallback, also useful to non-structured hosts. */
export function afTooltipText(content: string | AfTooltipContent): string {
  if (typeof content === "string") return content.trim();
  return [content.title, content.description,
    ...(content.facts || []).map(f => `${f.label}: ${f.value}`),
    ...(content.sections || []).flatMap(s => [s.label, ...s.items]), content.note,
  ].filter(Boolean).join("\n");
}

/** Attribute values for React or string-markup hosts (HTML hosts escape these values). */
export function afTooltipAttributes(content: string | AfTooltipContent): Record<string, string> {
  const attrs: Record<string, string> = { [AF_TOOLTIP_ATTR]: afTooltipText(content) };
  if (typeof content !== "string") attrs[AF_TOOLTIP_CONTENT_ATTR] = JSON.stringify(content);
  return attrs;
}

function structured(value: unknown): value is AfTooltipContent {
  if (!value || typeof value !== "object") return false;
  const v = value as AfTooltipContent;
  return typeof v.title === "string" && !!v.title.trim()
    && [v.description, v.note].every(x => x === undefined || typeof x === "string")
    && (v.facts === undefined || Array.isArray(v.facts) && v.facts.every(f => f && typeof f.label === "string" && typeof f.value === "string"))
    && (v.sections === undefined || Array.isArray(v.sections) && v.sections.every(s => s && typeof s.label === "string" && Array.isArray(s.items) && s.items.every(x => typeof x === "string")));
}

/** All children are text nodes/elements, never parsed caller markup. */
function renderContent(doc: Document, tip: HTMLElement, content: string | AfTooltipContent): void {
  tip.textContent = "";
  tip.removeAttribute("data-structured");
  const add = (parent: HTMLElement, tag: string, cls: string, text?: string) => {
    const node = doc.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
  };
  if (typeof content === "string") {
    const paragraphs = content.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (paragraphs.length <= 1) tip.textContent = content;
    else for (const text of paragraphs) add(tip, "p", "af-tooltip__paragraph", text);
    return;
  }
  tip.setAttribute("data-structured", "true");
  add(tip, "div", "af-tooltip__title", content.title);
  if (content.description) add(tip, "p", "af-tooltip__description", content.description);
  if (content.facts?.length) {
    const facts = add(tip, "dl", "af-tooltip__facts");
    for (const fact of content.facts) {
      const row = add(facts, "div", "af-tooltip__fact");
      add(row, "dt", "af-tooltip__label", fact.label);
      const val = add(row, "dd", "af-tooltip__value", fact.value);
      if (fact.tone && ["muted", "success", "warning", "danger"].includes(fact.tone)) val.setAttribute("data-tone", fact.tone);
    }
  }
  for (const section of content.sections || []) {
    if (!section.items.length) continue;
    const group = add(tip, "div", "af-tooltip__section");
    if (section.label) add(group, "div", "af-tooltip__section-title", section.label);
    const list = add(group, "ul", "af-tooltip__list");
    for (const item of section.items) add(list, "li", "af-tooltip__item", item);
  }
  if (content.note) add(tip, "p", "af-tooltip__note", content.note);
}

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

function tipOf(el: Element | null): string | AfTooltipContent {
  if (!el) return "";
  const raw = el.getAttribute(AF_TOOLTIP_CONTENT_ATTR);
  if (raw) {
    try { const value: unknown = JSON.parse(raw); if (structured(value)) return value; } catch { /* use the explicit fallback */ }
    console.warn("#FALLBACK: invalid structured tooltip; using its plain-text fallback");
  }
  return String(el.getAttribute(AF_TOOLTIP_ATTR) || "").trim();
}

function anchorFrom(target: EventTarget | null, root: Node): HTMLElement | null {
  const el = target as Element | null;
  if (!el || typeof (el as Element).closest !== "function") return null;
  const a = el.closest(`[${AF_TOOLTIP_ATTR}]`) as HTMLElement | null;
  if (!a || !root.contains(a) || !afTooltipText(tipOf(a))) return null;
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
    const content = tipOf(el);
    const text = afTooltipText(content);
    if (!text || el.isConnected === false) return;
    anchor = el;
    renderContent(doc, tip, content);
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
  const onScrollOrResize = (e: Event) => { if (e.type === "scroll" && tip.contains(e.target as Node)) return; hide(); };

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
