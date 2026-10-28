# Proposed: K7 — `useWorkflowSession` has no `sessionToolPolicy` option

## Metadata
- Created: 2026-10-28
- Status: Proposed (kit gap found by adoption; one item per gap)
- Completed: N/A
- Area: panel-chat
- Found by: AbstractCode web, Assistant web adoption of the kit 0.7.0 primitives
- Source: `untracked/ui-primitives/report.md` §6g (AbstractFramework root); release follow-up §6h
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)

## ADR status
- Governing ADRs: ADR 0001 (apps customize through props, slots and theme tokens, never by forking)
- ADR impact: none

## Current understanding
Both apps set the session tool-policy client in an effect after the hook is created (race on the first wait). The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
A `sessionToolPolicy` option on `useWorkflowSession`, applied before the first run.

## Acceptance criteria
- [ ] Both apps pass it as an option; the effect is deleted; a check that the first wait sees the policy.
- [ ] The adopting app's local workaround is deleted.
