# Proposed: K8 — Steer composer shows "Queue" while a question is pending

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
While an `ask_user` question waits, the steer composer offers "Queue" (it used to say "Waiting for you"). The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
When the interaction is a question, the composer answers it (or says "Waiting for you"), never "Queue".

## Acceptance criteria
- [ ] A check per interaction kind on the composer label.
- [ ] The adopting app's local workaround is deleted.
