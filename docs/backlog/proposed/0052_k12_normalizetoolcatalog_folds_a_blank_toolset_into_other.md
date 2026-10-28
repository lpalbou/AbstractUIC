# Proposed: K12 — `normalizeToolCatalog` folds a blank toolset into "other"

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
A tool with a blank toolset lands in "other", which hides that the gateway served no toolset. The adopting app kept its own code instead of forking the kit (ADR 0001); this item removes the reason.

## Chosen route
Keep blank as its own labeled group ("No toolset") or surface a catalog warning; never merge into "other" silently.

## Acceptance criteria
- [ ] A check on a blank-toolset catalog.
- [ ] The adopting app's local workaround is deleted.
