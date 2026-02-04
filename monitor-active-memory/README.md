# @abstractframework/monitor-active-memory

ReactFlow-based explorer for **Knowledge Graph assertions** (`KgAssertion`) and the derived **Active Memory** text.

## What you get

- `KgActiveMemoryExplorer` component (see `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`)
- Graph/layout utilities (see `monitor-active-memory/src/graph.ts`):
  - `buildKgGraph`, `shortestPath`
  - `buildKgLayout` + force-layout helpers (`initForceSimulation`, `stepForceSimulation`, …)
- Types / contracts (see `monitor-active-memory/src/types.ts`):
  - `KgAssertion`, `KgQueryParams`, `KgQueryResult`

## Peer dependencies

Declared in `monitor-active-memory/package.json`:

- `react@^18`, `react-dom@^18`
- `reactflow@^11`

## Install

- Workspace: add a dependency on `@abstractframework/monitor-active-memory`
- npm (once published): `npm i @abstractframework/monitor-active-memory`

## Usage

```tsx
import { KgActiveMemoryExplorer, type KgAssertion } from "@abstractframework/monitor-active-memory";

const items: KgAssertion[] = [];

export function MemoryView() {
  return (
    <KgActiveMemoryExplorer
      title="Active Memory"
      items={items}
      activeMemoryText=""
      onQuery={async (params) => {
        // Your host decides how to fetch/search KG assertions.
        return { ok: true, items: [], active_memory_text: "" };
      }}
    />
  );
}
```

## Key props (host integration points)

Authoritative prop types live in `monitor-active-memory/src/KgActiveMemoryExplorer.tsx` (`KgActiveMemoryExplorerProps`).

- `items: KgAssertion[]` (required)
- `activeMemoryText?: string`
- `onQuery?: (params: KgQueryParams) => Promise<KgQueryResult>` (enables the query UI)
- `queryMode?: "override" | "replace"` (how query results interact with `items`)
- `onItemsReplace?: (items, meta) => void` (used when `queryMode === "replace"`)
- `onOpenSpan?` / `onOpenTranscript?` (optional host navigation hooks)

## Layout persistence

The component can persist per-view layouts in `localStorage` under key `abstractuic_amx_saved_layouts_v1` (see `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`).

## CSS

- Import CSS in your app entrypoint (recommended):

```ts
import "@abstractframework/monitor-active-memory/styles.css";
import "@abstractframework/ui-kit/theme.css"; // shared tokens (optional but recommended)
```

- ReactFlow base styles are **not** included. In your app:

```ts
import "reactflow/dist/style.css";
```

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
