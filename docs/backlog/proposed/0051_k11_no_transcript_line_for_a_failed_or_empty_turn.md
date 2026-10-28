# Proposed: K11 — No transcript line for a failed or empty turn

## Metadata
- Created: 2026-10-28
- Status: Proposed (kit gap found by adoption; one item per gap)
- Completed: N/A
- Area: panel-chat
- Found by: Assistant web adoption of the kit 0.7.0 primitives
- Source: `untracked/ui-primitives/report.md` §6g (AbstractFramework root); release follow-up §6h
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)

## ADR status
- Governing ADRs: ADR 0001 (apps customize through props, slots and theme tokens, never by forking)
- ADR impact: none

## Current understanding
A turn that fails or ends with no reply leaves nothing in the transcript. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
A transcript line for failed and empty turns, with the failure reason when the run has one.

## Acceptance criteria
- [ ] A check per terminal state with no reply.
- [ ] The adopting app's local workaround is deleted.
