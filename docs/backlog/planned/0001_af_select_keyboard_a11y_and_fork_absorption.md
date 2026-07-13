# Planned: AfSelect keyboard operability, listbox semantics, and flow-fork absorption

## Metadata
- Created: 2026-07-11
- Status: Planned
- Completed: N/A
- Area: ui-kit (`af_select.tsx`), consumers: abstractflow, abstractobserver, abstractcode/web

## ADR status
- Governing ADRs: None (no ADR system in this repo yet)
- ADR impact: None

## Context
AfSelect is the highest-leverage component in the library: ThemeSelect,
ProviderModelSelect, FontScaleSelect, and HeaderDensitySelect all delegate to
it, and AbstractFlow additionally carries a ~340-line diverged fork
(`abstractflow/src/components/inputs/AfSelect.tsx`) that rides the kit's
`.af-select-*` CSS while shipping forked logic (~40 call sites).
Found by the 2026-07-11 two-adversary review (findings F1, F7, F8).

## Current code reality
- `ui-kit/src/af_select.tsx:168-177` — trigger keydown handles only
  Enter/Space (toggle) and ArrowDown (open). The popover key handler lives on
  the portal div/search input; with `searchable={false}` nothing is focused,
  so ArrowUp/ArrowDown/Enter/Escape do nothing once open (verified in source
  2026-07-11). Both typography selects pass `searchable={false}`.
- No `role="option"`/`aria-selected`/`aria-activedescendant`; popover is
  `role="listbox"` with zero options in the a11y tree; no `ariaLabel` prop;
  clear affordance is a `span role="button" tabIndex={-1}` nested inside the
  trigger `<button>` (invalid interactive nesting).
- Flow's fork has features the kit lacks (`onOpen` lazy-load, inject current
  value as an option when absent, loading-value display); the kit has features
  the fork lacks (groups, renderOption/renderValue, className).

## Problem
Keyboard users cannot pick an option in any non-searchable select anywhere in
the framework; screen readers hear nameless comboboxes with nothing navigable;
and every kit-side fix misses Flow's densest UI because of the fork.

## What we want to do
One combobox implementation that is keyboard-complete and AT-correct, with the
fork's three features absorbed so Flow can delete its copy.

## Requirements
1. Keyboard: while open — ArrowUp/Down move highlight, Home/End jump,
   Enter picks, Escape closes, Tab closes; works with and without search.
2. ARIA: `role="option"` + `aria-selected` + stable ids +
   `aria-activedescendant`; `ariaLabel`/`labelId` passthrough; clear control
   becomes a real focusable button outside the trigger button.
3. Absorb fork features: `onOpen`, current-value injection, loading-value
   display (additive props; existing consumers unchanged).
4. Flow migration + fork deletion coordinated with the flow seat (their tree,
   their tests).

## Scope / Non-goals
Scope: `af_select.tsx`, its theme.css block, wrapper selects, tests.
Non-goals: AfMultiSelect unification (deliberately different UX per app);
visual redesign.

## Validation
- New dependency-free interaction tests where extractable (highlight/index
  logic as pure helpers) + a documented manual keyboard script per wrapper.
- Flow suite green after migration; kit `npm test` green.

## Progress checklist
- [ ] Keyboard model (trigger-routed handler, open state)
- [ ] ARIA option semantics + naming props
- [ ] Clear-control restructure
- [ ] Fork-feature absorption (onOpen, value injection, loading display)
- [ ] Flow migration + fork deletion (with flow seat)
