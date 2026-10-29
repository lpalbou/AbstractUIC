# 0074 — One filter bar: search and toggles on one line, one row of chips per facet

**Status**: completed (2026-10-29, unreleased; in a PR, not done until merged, released and verified) · **Priority**: P1
· **Created**: 2026-10-29
**Cross-package**: the AbstractGateway console's Models page (Catalog and Hugging Face modes) and the setup guide's model
catalog adopt it (gateway PR). The console vendors a released kit, so until a kit release carries this block it renders
the documented markup and carries a verbatim copy of the `af-filterbar` CSS, pinned by its tests.

## Why (operator design finding, 2026-10-29)
The Models page's filters "look bad": rows of pill chips (Quantization, Provider, Capability, Status) that flow side by
side and wrap under their own label, chips of different heights (44 px ovals on phones), the "Fits this computer" and
"Every quant" switches loose on the search line.

## What shipped
- `AfFilterBar` (`ui-kit/src/af_filter_bar.tsx`): a first line (optional scope switch, the search field with its
  toggles on ONE line, optional submit, the end slot for the count) and one row per facet: the label in a FIXED column
  (`--af-filterbar-label-w`), the chips in the second column where they wrap. `trailing` puts a control of one facet
  after its chips. `sticky` / `stuck` keep the first line under the header.
- One markup source for React and plain HTML (`ui-kit/src/af_filter_bar_core.ts`): `afFilterFacetsHtml`,
  `afFilterFacetHtml`, `afFilterChipHtml`, `afFilterScopeHtml`, `afFilterScopeButtonsHtml`; the islands expose the
  facet and scope functions (additive, apiVersion "2").
- Chips reuse the kit chip (`af-chip af-chip--button`: hue recipe, touch hit area) at one size (28 px); the count is
  muted small text; pressed is the accent hue; a zero count is dashed and muted.
- `theme.css` block `af-filterbar:begin` .. `af-filterbar:end`; docs `docs/filter-bar.md`.
- Check: `check_filter_bar.mjs` (markup, React == plain HTML, escaping, the CSS rules behind each of the operator's
  words). Mutation-checked: removing the fixed label column, the chips' wrap, the line's `nowrap`, the count's muted
  colour, or adding a phone rule that stacks the label each turn it red.
