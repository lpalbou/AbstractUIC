# Proposed: K2 — No `runStatus` primitive

## Metadata
- Created: 2026-10-28
- Status: Proposed (kit gap found by adoption; one item per gap)
- Completed: N/A
- Area: panel-chat
- Found by: AbstractCode web adoption of the kit 0.7.0 primitives
- Source: `untracked/ui-primitives/report.md` §6g (AbstractFramework root); release follow-up §6h
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)

## ADR status
- Governing ADRs: ADR 0001 (apps customize through props, slots and theme tokens, never by forking)
- ADR impact: none

## Current understanding
The kit has no run status bar, so Code keeps its own `RunStatusBar`. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
A `runStatus` surface fed by the controller snapshot (and later by `replay_view_v1` status, 0040), with slots for app extras; Code deletes `RunStatusBar`.

## Acceptance criteria
- [ ] Code's status bar comes from the kit; a check per status state.
- [ ] The adopting app's local workaround is deleted.
