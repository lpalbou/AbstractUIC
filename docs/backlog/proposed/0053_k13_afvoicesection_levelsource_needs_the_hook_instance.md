# Proposed: K13 — `AfVoiceSection.levelSource` needs the hook instance

## Metadata
- Created: 2026-10-28
- Status: Proposed (kit gap found by adoption; one item per gap)
- Completed: N/A
- Area: ui-kit
- Found by: Assistant web adoption of the kit 0.7.0 primitives
- Source: `untracked/ui-primitives/report.md` §6g (AbstractFramework root); release follow-up §6h
- Root link: AbstractFramework backlog 1055 (shared UI primitives track)

## ADR status
- Governing ADRs: ADR 0001 (apps customize through props, slots and theme tokens, never by forking)
- ADR impact: none

## Current understanding
`levelSource` takes the voice hook instance, so a host must thread it through instead of using `subscribe_level`. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
Accept the `subscribe_level` function (or the meter's source) directly; keep the instance form as an adapter.

## Acceptance criteria
- [ ] A host mounts the level meter without the hook instance; a check.
- [ ] The adopting app's local workaround is deleted.
