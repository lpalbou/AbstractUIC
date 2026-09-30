/*
 * checkLabelScale(root): the browser-side type-scale guard (DESIGN §3,
 * docs/state-toggles.md "Type scale guard"). Labels, switch labels and field
 * captions sit at body size: computed font-size <= 15px and font-weight <= 600.
 * It returns every rendered element that breaks that, so a Playwright test can
 * assert `[]` after rendering a settings panel:
 *
 *   const hits = await page.evaluate(() => window.checkLabelScale(document));
 *
 * (inject the function, or call it from app code in a dev check). Pairs with
 * the source-side `findVerbToggleLabels(source)` guard.
 */

export type LabelScaleHit = {
  element: Element;
  /** A short CSS-ish path for the report ("label.af-gateway-signin__checkbox"). */
  selector: string;
  text: string;
  fontSize: number;
  fontWeight: number;
};

export type LabelScaleOptions = {
  /** Largest allowed computed font-size in px (default 15). */
  maxFontSizePx?: number;
  /** Heaviest allowed computed font-weight (default 600). */
  maxWeight?: number;
  /** Smallest allowed computed font-size in px for helper text (default 13; DESIGN §3 / §12.1). */
  minHelperFontSizePx?: number;
  /** Helper-text elements checked against the lower bound (default HELPER_SCALE_SELECTOR). */
  helperSelector?: string;
  /** Elements to check (default LABEL_SCALE_SELECTOR). */
  selector?: string;
  /** Also check elements that are not rendered (display:none, no boxes). Default false. */
  includeHidden?: boolean;
  /** getComputedStyle source (default globalThis.getComputedStyle). */
  getComputedStyle?: (el: Element) => { fontSize: string; fontWeight: string };
};

/** Every label-like element: form labels, switch labels, field captions. */
export const LABEL_SCALE_SELECTOR = [
  "label",
  ".af-switch__label",
  ".af-form__label",
  ".af-gateway-signin__label",
  ".af-gateway-signin__checkbox",
  ".af-field-caption",
  "[data-af-caption]",
].join(", ");

/** Helper text: switch descriptions and reasons, form help, field hints. Never below 13 px. */
export const HELPER_SCALE_SELECTOR = [".af-switch__desc", ".af-switch__reason", ".af-form__help", ".af-field-help", "[data-af-help]"].join(", ");

function weightOf(value: string): number {
  const v = String(value || "").trim().toLowerCase();
  if (v === "bold" || v === "bolder") return 700;
  if (v === "normal" || v === "lighter" || v === "") return 400;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 400;
}

function describe(el: Element): string {
  const tag = el.tagName ? el.tagName.toLowerCase() : "?";
  const cls = typeof el.getAttribute === "function" ? String(el.getAttribute("class") || "").trim() : "";
  return cls ? `${tag}.${cls.split(/\s+/).join(".")}` : tag;
}

/** Every label / `.af-switch__label` / field caption under `root` rendered above 15px or heavier than 600, and every helper text under 13px. */
export function checkLabelScale(root: ParentNode, options: LabelScaleOptions = {}): LabelScaleHit[] {
  const maxSize = options.maxFontSizePx ?? 15;
  const maxWeight = options.maxWeight ?? 600;
  const cs =
    options.getComputedStyle ??
    ((el: Element) => (globalThis as unknown as { getComputedStyle: (e: Element) => CSSStyleDeclaration }).getComputedStyle(el));
  const minHelper = options.minHelperFontSizePx ?? 13;
  const hits: LabelScaleHit[] = [];
  const visible = (el: Element) => options.includeHidden || typeof (el as HTMLElement).getClientRects !== "function" || (el as HTMLElement).getClientRects().length > 0;
  const nodes = Array.from(root.querySelectorAll(options.selector ?? LABEL_SCALE_SELECTOR));
  for (const el of nodes) {
    if (!visible(el)) continue;
    const style = cs(el);
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    const fontWeight = weightOf(style.fontWeight);
    if (fontSize > maxSize + 0.01 || fontWeight > maxWeight) {
      hits.push({ element: el, selector: describe(el), text: String(el.textContent || "").trim().slice(0, 80), fontSize, fontWeight });
    }
  }
  // Too SMALL is a defect too: helper text under 13 px is unreadable on a phone.
  for (const el of Array.from(root.querySelectorAll(options.helperSelector ?? HELPER_SCALE_SELECTOR))) {
    if (!visible(el)) continue;
    if (el.classList && el.classList.contains("af-switch__reason--hidden")) continue;
    const style = cs(el);
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    if (fontSize > 0 && fontSize < minHelper - 0.01) {
      hits.push({ element: el, selector: describe(el), text: String(el.textContent || "").trim().slice(0, 80), fontSize, fontWeight: weightOf(style.fontWeight) });
    }
  }
  return hits;
}
