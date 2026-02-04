# AbstractUIC

Reusable UI packages for AbstractFramework clients (React components + a small Web Component).

> Most React packages export **TypeScript/TSX source** via `exports -> ./src/index.ts`, so consumers must transpile them (see `docs/getting-started.md`).

## Documentation

- Getting started: [`docs/getting-started.md`](./docs/getting-started.md)
- Architecture (includes diagrams): [`docs/architecture.md`](./docs/architecture.md)
- Docs index: [`docs/README.md`](./docs/README.md)

## Packages

| Package | Purpose | Docs |
|---|---|---|
| `@abstractuic/ui-kit` | Theme tokens (CSS variables) + small UI primitives (selects/icons) | [`ui-kit/README.md`](./ui-kit/README.md) |
| `@abstractuic/panel-chat` | Chat thread + message cards + composer + markdown/json rendering | [`panel-chat/README.md`](./panel-chat/README.md) |
| `@abstractuic/monitor-flow` | Agent-cycle trace viewer + ledger adapter | [`monitor-flow/README.md`](./monitor-flow/README.md) |
| `@abstractuic/monitor-active-memory` | Knowledge Graph + Active Memory explorer (ReactFlow) | [`monitor-active-memory/README.md`](./monitor-active-memory/README.md) |
| `@abstractutils/monitor-gpu` | GPU utilization widget (`<monitor-gpu>`) polling a metrics endpoint | [`monitor-gpu/README.md`](./monitor-gpu/README.md) |

## Context

[AbstractFramework](https://github.com/lpalbou/abstractframework) is a workflow/runtime system with multiple host UX layers. AbstractUIC packages are host-driven UI building blocks used by those clients (no host imports; data + callbacks flow in from the host).

## Quickstart (React)

See [`docs/getting-started.md`](./docs/getting-started.md) for bundler + CSS notes. Minimal usage:

```tsx
import "@abstractuic/ui-kit/src/theme.css";
// Only if you use @abstractuic/monitor-active-memory (ReactFlow):
import "reactflow/dist/style.css";

import { ChatThread } from "@abstractuic/panel-chat";
import { AgentCyclesPanel } from "@abstractuic/monitor-flow";
import { KgActiveMemoryExplorer } from "@abstractuic/monitor-active-memory";
```

## Development

- React packages are typically validated via a host app that links them in a workspace (HMR).
- GPU widget tests: `cd monitor-gpu && npm test`

See [`docs/development.md`](./docs/development.md).

## License

MIT (see [`LICENSE`](./LICENSE)).
