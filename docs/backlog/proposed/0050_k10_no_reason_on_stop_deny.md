# Proposed: K10 — No reason on Stop / Deny

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
Stop and Deny send no reason, so the transcript and the ledger cannot say why. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
An optional reason field on Stop and Deny, carried in the command payload.

## Acceptance criteria
- [ ] The reason reaches the ledger record; a check.
- [ ] The adopting app's local workaround is deleted.
