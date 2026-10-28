# Proposed: K1 — `AfAppShell` cannot host AbstractCode's layout

## Metadata
- Created: 2026-10-28
- Status: Proposed (kit gap found by adoption; one item per gap)
- Completed: N/A
- Area: app_shell
- Found by: AbstractCode web adoption of the kit 0.7.0 primitives
- Source: `untracked/ui-primitives/report.md` §6g (AbstractFramework root); release follow-up §6h
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)

## ADR status
- Governing ADRs: ADR 0001 (apps customize through props, slots and theme tokens, never by forking)
- ADR impact: none

## Current understanding
`AfAppShell` assumes the header spans the window; Code has a full-height sidebar with the brand beside the header, and on phone-landscape its header is `display: contents`, which `useAfTopBarHeight` measures as 0. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
A `layout` option (or slot) for a full-height leading sidebar beside the header, and a top-bar height that measures the cluster, not a `display: contents` box; Code adopts `AfAppShell` and deletes its own shell wrapper.

## Acceptance criteria
- [ ] Code renders through `AfAppShell` with its sidebar; `--af-topbar-h` correct in phone-landscape (a check red at 0).
- [ ] The adopting app's local workaround is deleted.
