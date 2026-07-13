# 0022 — Pin/node color vocabulary as kit tokens

- **State**: proposed
- **Owner**: uic (token definitions) + flow/observer (consumption)
- **Source**: framework-wide ownership census, fable5 adversary 2026-07-13 (evening pass)

## Problem

The flow-graph pin/node category colors are hardcoded per app and have ALREADY drifted:
`abstractflow/types/nodes.ts` (~133 hex) + `types/flow.ts` (~46) define the palette flow-side;
`abstractobserver/pin_legend.tsx` (~17 hex) carries a second copy whose pin-type list is
outdated relative to flow's. Two legends, two palettes, no shared source.

## Proposal

Promote a `--pin-*` / node-category token family into `theme.css` (dark + light variants,
same contrast discipline as the entity tokens). Flow and observer consume tokens; the drifted
legend converges on flow's current type list.

## Acceptance

- Token family in `theme.css` with per-theme light variants; guard extended.
- Flow + observer asks filed; both legends render from tokens; drift test possible (both
  read the same source).
