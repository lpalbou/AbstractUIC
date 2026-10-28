# Proposed: K3 — The controller does not cover Code's `stream_replies.ts` notes

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
Notes Code folds from the reply stream (`stream_replies.ts`) have no equivalent in `WorkflowSessionController`, so the file stays. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
Add the note kinds to the controller's snapshot (or take them from the replay view once 0040 lands, preferred to avoid a second fold); Code deletes `stream_replies.ts`.

## Acceptance criteria
- [ ] No reply-stream fold left in Code (grep).
- [ ] The adopting app's local workaround is deleted.
