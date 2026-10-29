# Filter bar (`AfFilterBar`)

One compact, aligned filter bar for a searchable list: a first line with the search field and its
on/off filters, then one row per facet with the facet's label in a fixed left column and its
chips in the second column. It replaces ad-hoc rows of pill chips that wrap under their own label.

Operator design finding (2026-10-29, the AbstractGateway console's Models page): one bar from the
kit; one chip size with the counts in muted small text; one row per facet with the label in a
fixed column and the chips wrapping under the chips, never under the label; the search field and
its toggle on the same first line; no stray toggles.

```
[Catalog | Hugging Face] [Search ............................] [o Fits this computer]   96 of 96 models
QUANTIZATION   (All) (4-bit 186) (8-bit 128) (Other 161) | [o Every quant]
PROVIDER       (All) (Ollama 94) (MLX 123) (Hugging Face 205) (LM Studio 46) (MLX images & video 4)
               (Diffusers 2) (Supertonic 1)
CAPABILITY     (All) (Text 253) (Thinking 136) (Tools 253) (Vision 75)
```

## React

```tsx
import { AfFilterBar, AfSwitch } from "@abstractframework/ui-kit";

<AfFilterBar
  ariaLabel="Filter the model catalog"
  scope={{ label: "Search in", value: mode, options: [{ value: "catalog", label: "Catalog" }, { value: "hf", label: "Hugging Face" }], onChange: setMode }}
  search={{ value: q, onChange: setQ, ariaLabel: "Search the model catalog", placeholder: "Search by model" }}
  toggles={<AfSwitch variant="sm" label="Fits this computer" checked={fits} onChange={setFits} />}
  end={<span>{shown} of {total} models</span>}
  facets={[
    { id: "quant", label: "Quantization", value: quant, options: [{ value: "all", label: "All" }, { value: "4bit", label: "4-bit", count: 186 }] },
  ]}
  trailing={{ quant: <AfSwitch variant="sm" label="Every quant" checked={every} onChange={setEvery} /> }}
  onSelect={(facetId, value) => setFilter(facetId, value)}
  sticky
/>
```

| Prop | Type | Meaning |
| --- | --- | --- |
| `facets` | `AfFilterFacet[]` | `{ id, label, value, options: [{ value, label, count?, disabled?, title? }], disabled? }`, one row each |
| `onSelect` | `(facetId, value) => void` | A chip was clicked |
| `scope` | `{ label, options, value, onChange } \| null` | Optional segmented switch that leads the first line |
| `search` | `{ value, onChange, ariaLabel, placeholder?, onSubmit?, submitLabel? } \| null` | The search field; Enter calls `onSubmit`; `submitLabel` adds a button |
| `toggles` | `ReactNode` | On/off filters beside the field: `AfSwitch variant="sm"` |
| `end` | `ReactNode` | The first line's end: the count, the filters in words, actions |
| `trailing` | `Record<facetId, ReactNode>` | A control that belongs to one facet, after its chips |
| `ariaLabel` | `string` | The first line's `role="search"` name (default "Filters") |
| `sticky` / `stuck` | `boolean` | The first line stays at the top of the scroller; `stuck` (the host measures it) gives it its own bottom edge |

The component is hook-free: the host owns every value. `AfFilterFacetRow` renders one row for
hosts that lay rows out themselves.

## Plain HTML (the console path)

The chip, facet-row and scope markup has ONE source, `ui-kit/src/af_filter_bar_core.ts`, which
the React component renders. Plain-HTML hosts call the same functions: `afFilterFacetsHtml(facets,
trailing?)`, `afFilterFacetHtml(facet, trailingHtml?)`, `afFilterScopeHtml({label, options,
value})` and `afFilterScopeButtonsHtml(options, value)` (exported by the package and, for pages
that are not React apps, by the console islands as `filterBarFacetsHtml`, `filterBarScopeHtml`
and `filterBarScopeButtonsHtml`). They escape every label, value and title; `trailing` markup is
the host's and is inserted as given.

The markup contract:

```html
<div class="af-filterbar [af-filterbar--sticky] [af-filterbar--stuck]">
  <div class="af-filterbar__lead" role="search" aria-label="Filter the model catalog">
    <div class="af-filterbar__scope" role="group" aria-label="Search in">
      <button type="button" class="af-filterbar__scope-btn" data-af-scope="catalog" aria-pressed="true">Catalog</button>
      <button type="button" class="af-filterbar__scope-btn" data-af-scope="hf" aria-pressed="false">Hugging Face</button>
    </div>
    <div class="af-filterbar__line">
      <input type="search" class="af-filterbar__search" aria-label="…" enterkeyhint="search">
      <button type="button" class="af-filterbar__submit" [hidden]>Search</button>
      <span class="af-filterbar__toggles"><!-- af-switch af-switch--sm (or af-switch--native) --></span>
    </div>
    <div class="af-filterbar__end"><!-- count, actions --></div>
  </div>
  <div class="af-filterbar__facets">
    <div class="af-filterbar__facet" role="group" aria-label="Quantization" data-af-facet-row="quant">
      <span class="af-filterbar__label" aria-hidden="true">Quantization</span>
      <div class="af-filterbar__chips">
        <button type="button" class="af-chip af-chip--neutral af-chip--button af-filterbar__chip"
                data-af-facet="quant" data-af-value="4bit" aria-pressed="false" aria-label="4-bit, 186">
          <span class="af-chip__label">4-bit</span><span class="af-filterbar__count" aria-hidden="true">186</span>
        </button>
        <span class="af-filterbar__trailing"><!-- a control of this facet --></span>
      </div>
    </div>
  </div>
</div>
```

A host listens for clicks on `[data-af-facet]` (read `data-af-value`) and `[data-af-scope]`.
A chip whose count is 0 carries `af-filterbar__chip--zero` (muted, dashed); a facet that cannot be
used now (`disabled`) carries `af-filterbar__facet--disabled` and disables every chip.

## Layout rules (theme.css `af-filterbar:begin` .. `af-filterbar:end`)

- **First line**: `.af-filterbar__line` holds the field and the toggles and never wraps; the field
  shrinks first. The scope switch leads; the end slot closes the line (`margin-left: auto`) and
  moves to its own line when the width runs out.
- **Facet rows**: a grid of `var(--af-filterbar-label-w)` (7rem; 6rem below 480 px) and
  `minmax(0, 1fr)`. The label is one line in column 1 with the chip height as its line box, so it
  aligns with the first chip row; the chips wrap inside column 2. No width query stacks the label
  over the chips.
- **Chips**: the kit chip (`af-chip--button`: its hue recipe and its touch hit area) at one size,
  `--af-filterbar-chip-h` (28 px). Pressed = the accent hue. The count is `--text-muted`,
  `--font-size-xs`, tabular figures.
- **Sticky**: `af-filterbar--sticky` makes the wrapper `display: contents`, so the first line
  sticks to the scroller (`top: var(--af-filterbar-top)`) while the facet rows scroll away. In
  that mode both parts are items of the host's layout: cancel the host's gap between them.
- **Touch** (`pointer: coarse`): the pills keep their geometry with an invisible 44 px hit area;
  the field is 44 px with 16 px text. On a phone with a touch screen the submit button is hidden:
  the keyboard's search key submits (`enterkeyhint="search"`), so the field keeps its room.

`ui-kit/scripts/check_filter_bar.mjs` pins the markup, the one-source rule and these CSS rules.
