# 0075-abstractuic: [IMPROVEMENT] Tooltips follow the active theme surface

> Package: abstractuic
> Type: improvement
> Created: 2026-10-30
> Status: planned
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

- [ ] Requested visual/interaction changes implemented through existing contracts.
- [ ] Focused checks and visible browser evidence retained.
- [ ] Scoped implementation committed and local console redeployed/verified.
