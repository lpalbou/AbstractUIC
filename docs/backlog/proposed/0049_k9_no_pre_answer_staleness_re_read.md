# Proposed: K9 — No pre-answer staleness re-read

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
Answering a wait does not re-read whether another client already answered it, so a stale card can send a second answer (refused by the gateway, but the person sees an error). The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
Re-read the interaction (or the view's `interaction`, 0040) before sending; a stale card closes with "Answered on another device".

## Acceptance criteria
- [ ] A two-client check: the second answer is never sent.
- [ ] The adopting app's local workaround is deleted.
