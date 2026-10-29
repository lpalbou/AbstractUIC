/*
 * AfFilterBar — ONE compact, aligned filter bar (operator design finding 2026-10-29).
 *
 *   [scope switch] [search ............] [submit] [toggles]            [end: count, actions]
 *   QUANTIZATION   (All) (4-bit 186) (8-bit 128) (Other 161) | [trailing]
 *   PROVIDER       (All) (Ollama 94) (MLX 123) (Hugging Face 205) (LM Studio 46)
 *                  (Diffusers 2) ...                      <- chips wrap under the chips
 *
 * - The first line holds the search field and its on/off filters together (they never wrap
 *   apart); the optional scope switch leads it and the `end` slot (count, actions) closes it.
 * - One row per facet: the label in a FIXED column (`--af-filterbar-label-w`), the chips in
 *   the second column where they wrap. Chips are the kit chip at one fixed size; counts are
 *   muted small text.
 * - `sticky`: the first line stays at the top of the scroller while the facet rows scroll
 *   away (the wrapper becomes `display: contents`, so the two parts are items of the host's
 *   layout); `stuck` (the host measures it) gives the line its own bottom edge and shadow.
 *
 * Hook-free: the host owns every value. The chip, row and scope markup come from
 * af_filter_bar_core.ts (plain-HTML hosts call the same functions). Markup contract and CSS:
 * docs/filter-bar.md; theme.css `af-filterbar:begin` .. `af-filterbar:end`.
 */
import React from "react";
import {
  afFilterChipClass,
  afFilterChipName,
  afFilterFacetClass,
  type AfFilterFacet,
  type AfFilterOption,
  type AfFilterScopeOption,
} from "./af_filter_bar_core.js";

export type AfFilterBarSearch = {
  value: string;
  onChange: (value: string) => void;
  /** The field's accessible name ("Search the model catalog"). */
  ariaLabel: string;
  placeholder?: string;
  /** Enter (and the submit button, when `submitLabel` is set) calls this. */
  onSubmit?: (value: string) => void;
  /** Shows a submit button after the field ("Search"). Hidden on phones: the keyboard's search key submits. */
  submitLabel?: string;
};

export type AfFilterBarScope = {
  /** The switch's group name ("Search in"). */
  label: string;
  options: AfFilterScopeOption[];
  value: string;
  onChange: (value: string) => void;
};

export type AfFilterBarProps = {
  facets: AfFilterFacet[];
  onSelect: (facetId: string, value: string) => void;
  scope?: AfFilterBarScope | null;
  search?: AfFilterBarSearch | null;
  /** On/off filters beside the search field: `AfSwitch variant="sm"` (or the native `AfSwitchInput`). */
  toggles?: React.ReactNode;
  /** The first line's end: the result count, the filters in words, actions. */
  end?: React.ReactNode;
  /** A control that belongs to one facet, after its chips (facet id -> node). */
  trailing?: Record<string, React.ReactNode>;
  /** The first line's search landmark name (default "Filters"). */
  ariaLabel?: string;
  sticky?: boolean;
  stuck?: boolean;
  className?: string;
};

function Chip(props: { facet: AfFilterFacet; option: AfFilterOption; onSelect: AfFilterBarProps["onSelect"] }): React.ReactElement {
  const { facet, option, onSelect } = props;
  const pressed = option.value === facet.value && !facet.disabled;
  const counted = typeof option.count === "number" && Number.isFinite(option.count);
  return (
    <button
      type="button"
      className={afFilterChipClass(option)}
      data-af-facet={facet.id}
      data-af-value={option.value}
      aria-pressed={pressed ? "true" : "false"}
      aria-label={afFilterChipName(option)}
      title={option.title}
      disabled={Boolean(facet.disabled || option.disabled)}
      onClick={() => onSelect(facet.id, option.value)}
    >
      <span className="af-chip__label">{option.label}</span>
      {counted ? (
        <span className="af-filterbar__count" aria-hidden="true">
          {option.count}
        </span>
      ) : null}
    </button>
  );
}

/** One facet row (exported for hosts that lay rows out themselves). */
export function AfFilterFacetRow(props: { facet: AfFilterFacet; onSelect: AfFilterBarProps["onSelect"]; trailing?: React.ReactNode }): React.ReactElement {
  const { facet, onSelect, trailing } = props;
  return (
    <div className={afFilterFacetClass(facet)} role="group" aria-label={facet.label} data-af-facet-row={facet.id}>
      <span className="af-filterbar__label" aria-hidden="true">
        {facet.label}
      </span>
      <div className="af-filterbar__chips">
        {facet.options.map((option) => (
          <Chip key={option.value} facet={facet} option={option} onSelect={onSelect} />
        ))}
        {trailing ? <span className="af-filterbar__trailing">{trailing}</span> : null}
      </div>
    </div>
  );
}

export function AfFilterBar(props: AfFilterBarProps): React.ReactElement {
  const { facets, onSelect, scope, search, toggles, end, trailing, ariaLabel, sticky, stuck, className } = props;
  const cls = ["af-filterbar", sticky ? "af-filterbar--sticky" : "", stuck ? "af-filterbar--stuck" : "", className || ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="af-filterbar__lead" role="search" aria-label={ariaLabel || "Filters"}>
        {scope ? (
          <div className="af-filterbar__scope" role="group" aria-label={scope.label}>
            {scope.options.map((option) => (
              <button
                key={option.value}
                type="button"
                className="af-filterbar__scope-btn"
                data-af-scope={option.value}
                aria-pressed={option.value === scope.value ? "true" : "false"}
                onClick={() => scope.onChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {search || toggles ? (
          <div className="af-filterbar__line">
            {search ? (
              <input
                type="search"
                className="af-filterbar__search"
                value={search.value}
                placeholder={search.placeholder}
                aria-label={search.ariaLabel}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                onChange={(e) => search.onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && search.onSubmit) {
                    e.preventDefault();
                    search.onSubmit(e.currentTarget.value);
                  }
                }}
              />
            ) : null}
            {search && search.submitLabel && search.onSubmit ? (
              <button type="button" className="af-filterbar__submit" onClick={() => search.onSubmit?.(search.value)}>
                {search.submitLabel}
              </button>
            ) : null}
            {toggles ? <span className="af-filterbar__toggles">{toggles}</span> : null}
          </div>
        ) : null}
        {end ? <div className="af-filterbar__end">{end}</div> : null}
      </div>
      <div className="af-filterbar__facets">
        {facets.map((facet) => (
          <AfFilterFacetRow key={facet.id} facet={facet} onSelect={onSelect} trailing={trailing ? trailing[facet.id] : undefined} />
        ))}
      </div>
    </div>
  );
}

export default AfFilterBar;
