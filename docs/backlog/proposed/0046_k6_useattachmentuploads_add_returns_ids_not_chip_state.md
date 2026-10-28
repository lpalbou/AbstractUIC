# Proposed: K6 — `useAttachmentUploads.add` returns ids, not chip state

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
`add` returns ids, so a host that needs the new chips' state (progress, error) must re-read the hook. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
`add` returns the created chip states (ids kept for compatibility).

## Acceptance criteria
- [ ] Typed return; a check on the returned state.
- [ ] The adopting app's local workaround is deleted.
