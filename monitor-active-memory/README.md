# @abstractuic/monitor-active-memory

Reusable React components to **explore Knowledge Graph (KG) assertions** and the derived **Active Memory** block.

Designed to be used by:
- `abstractflow/web/frontend`
- future clients: `abstractobserver`, `abstractcode/web`, etc.

## Key features
- Graph view (nodes/edges derived from assertion `{subject,predicate,object}`)
- Pattern + semantic query controls (when provided an `onQuery` callback)
- Highlighting (matches + selected path)
- Shortest-path search between two entities/ideas (BFS on the currently loaded graph)
- Active Memory panel (`active_memory_text`)

## Exported API
- `KgActiveMemoryExplorer`
- `buildKgGraph`, `shortestPath` (utilities)
- Types: `KgAssertion`, `KgQueryParams`, `KgQueryResult`

