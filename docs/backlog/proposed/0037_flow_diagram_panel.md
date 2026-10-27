# Proposed: a sharable flow diagram panel (read-only AbstractFlow view for Observer and others)

## Metadata
- Created: 2026-10-27
- Status: Proposed (designed for by 0036; do not build yet — operator instruction)
- Completed: N/A
- Area: new kit sibling package (like `monitor-active-memory`), mounted as an `AfDrawerSystem` panel
- Root link: AbstractFramework backlog 1055

## ADR status
- Governing ADRs: ADR 0001 (§6 panels are opaque; §2 composed on the gateway's contracts)
- ADR impact: none

## Context
AbstractFlow's `Canvas` (`abstractflow/src/components/Canvas.tsx`, 1607 lines) binds the editor's global
`useFlowStore`, so it cannot be mounted elsewhere. Observer shows runs of flows with no diagram; the future
visual app designer composes on workflows (ADR 0001 context). A read-only `FlowDiagram {nodes, edges,
highlight?}` in a kit sibling package would give every app the same picture of a workflow, and a run's
`activities[]` from `replay_view_v1` could light up the executed path.

## What 0036 guarantees so this mounts without an API change
- A panel is `{id, label, icon, content, keepAlive: "always", fill: true}`; the drawer system never inspects it.
- `fill` removes padding and scrolling so ReactFlow owns its viewport; `onResize(id, width)` / `--af-panel-w`
  let the diagram refit on drag; `keepAlive: "always"` keeps the ReactFlow state alive.
- A `detach` capability (pop into `AfModal size="wide"`) is designed but not promised.

## Promotion criteria
- Observer (or another consumer) asks for the diagram; the Flow seat agrees to a store-free diagram component
  (the editor stays in Flow).
- A fixture: one `.flow` document and the expected node/edge projection.

## Non-goals
Editing; replacing Flow's editor.
