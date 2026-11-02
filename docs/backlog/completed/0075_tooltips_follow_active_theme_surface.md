# 0075-abstractuic: [IMPROVEMENT] Tooltips follow the active theme surface

> Package: abstractuic
> Type: improvement
> Created: 2026-10-30
> Status: completed
> Completed: 2026-10-30
> Release: unreleased (Gateway local adoption deployed)
> Priority: P1
> Labels: ux, theme, seat-framework
> Work-item id: abstractuic-0075
> Owner: framework
> Thread: unavailable (Agora connection refused; direct operator request)
> Hub refs: none

## Scope and current code reality

Operator rejects the white inverse tooltip in the dark console. The canonical
`.af-tooltip` in `ui-kit/src/theme.css` currently uses text-primary as background
and bg-primary as text. Change the shared primitive to theme surface/text/border
tokens, preserving placement, accessibility, timing and viewport bounds. Update
the tooltip contract/checks and verify real light/dark rendering in Gateway 0992.
No per-app override, runtime API change or new ADR. Agora connection refused.

## Acceptance criteria

- [x] Requested visual/interaction changes implemented through existing contracts.
- [x] Focused checks and visible browser evidence retained.
- [x] Scoped implementation committed and local console redeployed/verified.

## Delivery and validation

Shared kit implementation `fe951fd`: `.af-tooltip` uses `--bg-secondary`,
`--text-primary` and `--ui-border-2`. Placement/timing/accessibility are preserved.
Contract docs and source guard updated. 42 tooltip checks, CSS balance, 21 theme
blocks, 16 polish checks and strict contrast checks across all 20 named themes
passed. No per-app tooltip override was added.

Gateway adoption `a352234b` regenerated component CSS and theme provenance.
Live dark/light hover verification found actual tooltip background/text
`rgb(22,33,62)` / `rgb(238,238,238)` and `rgb(255,255,255)` / `rgb(15,23,42)`;
themed border present. Healthy local redeploy and mobile layout checked.
Cross-repo evidence: `abstractgateway/design/compact-models-0992/REVIEW.md`,
`validation.json`, `tooltip-dark.png` and `tooltip-light.png` (Gateway 0992).
138 catalog/wizard + 122 Resources browser checks passed. This completes the
local implementation/adoption; registry publication was not requested.
No remaining implementation work or ADR impact. Agora connection refused.
