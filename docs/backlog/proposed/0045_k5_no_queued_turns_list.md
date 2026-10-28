# Proposed: K5 — No queued-turns list

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
Turns queued while a run is busy are not listed by the kit. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
A queued-turns list (view, remove, reorder optional) bound to the controller's queue.

## Acceptance criteria
- [ ] Queued turns visible and removable in the kit; Code deletes its own list.
- [ ] The adopting app's local workaround is deleted.
