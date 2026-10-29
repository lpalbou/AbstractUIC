/*
 * AfFilterBar core — the filter bar's markup, hook-free and DOM-free.
 *
 * Operator design finding (2026-10-29, the gateway console's Models page): "rows of pill
 * chips" that wrapped under their own label, chips of three heights, the toggles scattered.
 * The ruled shape: ONE compact, aligned bar. A first line (an optional scope switch, the
 * search field with its on/off filters beside it, the result count at the end) and one row
 * per facet: the facet's label in a FIXED left column, its chips in the right column, where
 * they wrap (never under the label). Every chip has the same size; its count is muted small
 * text.
 *
 * This module is the ONE source of the chip, facet-row and scope markup. `AfFilterBar`
 * (af_filter_bar.tsx) renders exactly these elements and classes; plain-HTML hosts (the
 * AbstractGateway console) call these functions through the console islands
 * (`AfConsoleIslands.filterBarFacetsHtml` / `filterBarScopeHtml`) or write the documented
 * markup (docs/filter-bar.md). The CSS lives in theme.css between `af-filterbar:begin` and
 * `af-filterbar:end`.
 *
 * Chips reuse the kit chip (`af-chip af-chip--button`, its hue recipe and its touch hit
 * area); `af-filterbar__chip` only fixes the size and turns the hue to the accent when
 * pressed. A host listens for clicks on `[data-af-facet]` (the chip's facet id) with
 * `data-af-value` (the option value), and on `[data-af-scope]` for the scope switch.
 */

export type AfFilterOption = {
  value: string;
  label: string;
  /** Muted small number after the label (what the view would show with this chip on). null/undefined: none. */
  count?: number | null;
  disabled?: boolean;
  /** Tooltip text. */
  title?: string;
};

export type AfFilterFacet = {
  /** The facet id, written on every chip as `data-af-facet`. */
  id: string;
  /** The left-column label ("Quantization"); also the row's accessible group name. */
  label: string;
  /** The selected option value. */
  value: string;
  options: AfFilterOption[];
  /** The whole facet cannot be used now (every chip disabled). */
  disabled?: boolean;
};

export type AfFilterScopeOption = { value: string; label: string };

export const AF_FILTER_FACET_ATTR = "data-af-facet";
export const AF_FILTER_VALUE_ATTR = "data-af-value";
export const AF_FILTER_SCOPE_ATTR = "data-af-scope";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

function hasCount(count: number | null | undefined): count is number {
  return typeof count === "number" && Number.isFinite(count);
}

/** The chip's class list: the kit chip + the filter bar's fixed size (+ `--zero` for an empty result). */
export function afFilterChipClass(option: AfFilterOption): string {
  return ["af-chip", "af-chip--neutral", "af-chip--button", "af-filterbar__chip", option.count === 0 ? "af-filterbar__chip--zero" : ""]
    .filter(Boolean)
    .join(" ");
}

/** The chip's accessible name: "4-bit, 186" (the visible count is aria-hidden so it is not read glued to the label). */
export function afFilterChipName(option: AfFilterOption): string {
  return hasCount(option.count) ? `${option.label}, ${option.count}` : option.label;
}

/** One chip, as HTML. */
export function afFilterChipHtml(facet: AfFilterFacet, option: AfFilterOption): string {
  const pressed = option.value === facet.value && !facet.disabled;
  const disabled = Boolean(facet.disabled || option.disabled);
  return (
    `<button type="button" class="${afFilterChipClass(option)}" ${AF_FILTER_FACET_ATTR}="${esc(facet.id)}" ${AF_FILTER_VALUE_ATTR}="${esc(option.value)}"` +
    ` aria-pressed="${pressed ? "true" : "false"}" aria-label="${esc(afFilterChipName(option))}"` +
    (option.title ? ` title="${esc(option.title)}"` : "") +
    (disabled ? ` disabled=""` : "") +
    `><span class="af-chip__label">${esc(option.label)}</span>` +
    (hasCount(option.count) ? `<span class="af-filterbar__count" aria-hidden="true">${esc(option.count)}</span>` : "") +
    `</button>`
  );
}

/** The facet row's class list. */
export function afFilterFacetClass(facet: AfFilterFacet): string {
  return facet.disabled ? "af-filterbar__facet af-filterbar__facet--disabled" : "af-filterbar__facet";
}

/**
 * One facet row, as HTML: the label in the fixed column, the chips in the wrapping column.
 * `trailingHtml` (trusted host markup, e.g. a small `af-switch`) ends the chips column after
 * a divider: a control that belongs to this facet ("Every quant" beside the quantization chips).
 */
export function afFilterFacetHtml(facet: AfFilterFacet, trailingHtml?: string): string {
  return (
    `<div class="${afFilterFacetClass(facet)}" role="group" aria-label="${esc(facet.label)}" data-af-facet-row="${esc(facet.id)}">` +
    `<span class="af-filterbar__label" aria-hidden="true">${esc(facet.label)}</span>` +
    `<div class="af-filterbar__chips">` +
    facet.options.map((option) => afFilterChipHtml(facet, option)).join("") +
    (trailingHtml ? `<span class="af-filterbar__trailing">${trailingHtml}</span>` : "") +
    `</div></div>`
  );
}

/** Every facet row, as HTML (the content of `.af-filterbar__facets`). `trailing` maps a facet id to its trailing markup. */
export function afFilterFacetsHtml(facets: AfFilterFacet[], trailing?: Record<string, string>): string {
  return facets.map((facet) => afFilterFacetHtml(facet, trailing ? trailing[facet.id] : undefined)).join("");
}

/** The scope switch's buttons, as HTML (the content of `.af-filterbar__scope`). */
export function afFilterScopeButtonsHtml(options: AfFilterScopeOption[], value: string): string {
  return options
    .map(
      (option) =>
        `<button type="button" class="af-filterbar__scope-btn" ${AF_FILTER_SCOPE_ATTR}="${esc(option.value)}" aria-pressed="${option.value === value ? "true" : "false"}">${esc(option.label)}</button>`,
    )
    .join("");
}

/** The whole scope switch ("Catalog | Hugging Face"), as HTML. */
export function afFilterScopeHtml(scope: { label: string; options: AfFilterScopeOption[]; value: string }): string {
  return `<div class="af-filterbar__scope" role="group" aria-label="${esc(scope.label)}">${afFilterScopeButtonsHtml(scope.options, scope.value)}</div>`;
}
