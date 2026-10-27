# Proposed: a viewer panel for the semantic temporal memory graph (AbstractMemory)

## Metadata
- Created: 2026-10-27
- Status: Proposed (designed for by 0036; do not build yet — operator instruction)
- Completed: N/A
- Area: `monitor-active-memory` (exists: `KgActiveMemoryExplorer`) extended, or a sibling package, mounted as an `AfDrawerSystem` panel
- Root link: AbstractFramework backlog 1055 (memory graph consolidation track); AbstractMemory ADR and items (being written)

## ADR status
- Governing ADRs: ADR 0001 (§6, §2)
- ADR impact: none

## Context
AbstractNote's graph logic is moving into AbstractMemory as the one semantic temporal memory graph with ledger
provenance (root 1055). `KgActiveMemoryExplorer` (`monitor-active-memory/src/KgActiveMemoryExplorer.tsx`) already
renders an active-memory graph and is used by Flow (`KgActiveMemoryPanel.tsx:26`) and Observer
(`mindmap_panel.tsx:898`); Note has its own 1027-line `Graph.tsx` canvas. A shared viewer would take the
AbstractMemory graph contract (nodes, edges, time, provenance to ledger records) and render it in any app's drawer.

## What 0036 guarantees so this mounts without an API change
Same as 0037: opaque panel, `fill`, `keepAlive: "always"`, resize signal.

## Promotion criteria
- AbstractMemory's graph read contract (route and payload) is served by the gateway on `main`.
- Note's graph needs are listed against `KgActiveMemoryExplorer` so one component covers both.

## Non-goals
Building before the AbstractMemory contract exists; editing memory from the viewer.
