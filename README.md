# AbstractUIC

**Reusable UI components for AbstractFramework host applications.**

This repository contains framework-agnostic, composable UI components that power observability, monitoring, and interaction interfaces across multiple AbstractFramework hosts:

- **AbstractFlow** (visual workflow editor)
- **AbstractObserver** (observability UI for gateway/runtime)
- **AbstractCode** (CLI/TUI host)
- Future hosts and third-party integrations

## Context

The [AbstractFramework](https://github.com/lpalbou/abstractframework) is a durable workflow system with portable authoring (VisualFlow JSON), durable execution (AbstractRuntime kernel), and multiple host UX layers. These UI components bridge runtime/gateway telemetry and user-facing interfaces, enabling consistent observability across hosts without tight coupling.

## Packages

### 1. `@abstractuic/monitor-active-memory`
**Knowledge Graph & Active Memory Explorer**

React components for exploring KG assertions (triples) and the derived Active Memory block.

- **Tech**: React 18, ReactFlow 11
- **Features**:
  - Graph view (nodes/edges from `{subject, predicate, object}`)
  - Pattern + semantic query controls
  - Shortest-path search (BFS)
  - Highlighting (matches + selected paths)
  - Active Memory text panel

Used by AbstractFlow and AbstractObserver to inspect memory state during workflow execution.

[→ Full README](./monitor-active-memory/README.md)

---

### 2. `@abstractuic/monitor-flow`
**Agent Cycles & Flow Monitoring**

React components for monitoring agent execution cycles (LLM call → tool calls → observe).

- **Tech**: React 18
- **Features**:
  - `AgentCyclesPanel`: groups effect steps into cycles
  - Compact, inspectable view of agent reasoning traces
  - JSON viewer and Markdown renderer for payloads

Used by AbstractFlow and AbstractObserver to visualize runtime ledger events and agent scratchpads.

[→ Full README](./monitor-flow/README.md)

---

### 3. `@abstractutils/monitor-gpu`
**GPU Utilization Widget**

Lightweight, dependency-free GPU histogram widget. Polls AbstractGateway's secured metrics endpoint.

- **Tech**: Vanilla JavaScript, Web Components
- **Features**:
  - Custom element `<monitor-gpu>`
  - Bearer token auth (`Authorization: Bearer <token>`)
  - Mini histogram with configurable history size and tick rate
  - No external dependencies

Used in AbstractFlow/AbstractObserver dashboards to monitor GPU utilization during local LLM inference.

[→ Full README](./monitor-gpu/README.md)

---

### 4. `@abstractuic/panel-chat`
**Chat Panel Utilities**

Shared chat rendering and export helpers.

- **Tech**: React 18
- **Exports**:
  - `ChatMessageContent`: auto-detects JSON vs Markdown and renders appropriately
  - `chatToMarkdown`: exports chat transcript as Markdown
  - `copyText`, `downloadTextFile`: browser utilities for export UX

Extracted from AbstractCode; reusable across any chat-based UI in the framework.

[→ Full README](./panel-chat/README.md)

---

## Tech Stack

| Package | Language | Framework | Testing |
|---------|----------|-----------|---------|
| `monitor-active-memory` | TypeScript | React 18 + ReactFlow 11 | - |
| `monitor-flow` | TypeScript | React 18 | - |
| `monitor-gpu` | JavaScript | Vanilla (Web Components) | Node.js test runner |
| `panel-chat` | TypeScript | React 18 | - |

**Peer dependencies**: React-based packages expect `react@^18.0.0` and `react-dom@^18.0.0` to be provided by the consuming host.

## Usage

Each package is designed to be consumed directly from source (ESM) by host bundlers (Vite, Webpack, etc.):

```json
{
  "dependencies": {
    "@abstractuic/monitor-active-memory": "workspace:*",
    "@abstractuic/monitor-flow": "workspace:*",
    "@abstractutils/monitor-gpu": "workspace:*",
    "@abstractuic/panel-chat": "workspace:*"
  }
}
```

Example (React):
```tsx
import { KgActiveMemoryExplorer } from "@abstractuic/monitor-active-memory";
import { AgentCyclesPanel } from "@abstractuic/monitor-flow";
import { ChatMessageContent } from "@abstractuic/panel-chat";
```

Example (GPU widget):
```js
import { registerMonitorGpuWidget } from "@abstractutils/monitor-gpu";

registerMonitorGpuWidget();
const el = document.createElement("monitor-gpu");
el.baseUrl = "http://localhost:8080";
el.token = await getGatewayToken();
document.body.appendChild(el);
```

See individual package READMEs for detailed API documentation.

## Design Principles

1. **Framework-agnostic**: Components depend only on runtime/gateway contracts (ledger, metrics API), not on specific host implementations.
2. **Source-based**: Published as ESM source (not pre-bundled) for optimal tree-shaking and host integration.
3. **Peer dependencies**: React-based components expect the host to provide React 18+ (avoid version conflicts).
4. **Small, focused**: Each package solves one problem (KG exploration, flow monitoring, GPU metrics, chat rendering).
5. **No circular dependencies**: Components may depend on AbstractFramework runtime/gateway APIs but never import from host apps.

## Development

This is a multi-package repository within the AbstractFramework workspace (separate Git repos, separate PyPI/npm packages).

**To test changes:**
- React components: consumed by host apps via workspace links (Vite HMR)
- GPU widget: run `npm test` in `monitor-gpu/`

**No build step required**: Host bundlers consume source directly.

## License

MIT

## Author

Laurent-Philippe Albou
