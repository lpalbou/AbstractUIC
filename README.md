# AbstractUIC

Reusable UI packages for AbstractFramework clients: React components, small Web Components, a Node.js Gateway session proxy, and console islands for pages that are not React apps.

> Packages are ESM and ship CSS alongside JS. See `docs/getting-started.md` for required CSS imports and Next.js notes.

AbstractUIC is **UI-only**: hosts provide data + callbacks; the packages don’t import host code. The only packages that perform network requests by default are `@abstractframework/monitor-gpu` and `@abstractframework/monitor-memory` (each polls a metrics endpoint; see `monitor-gpu/src/gpu_metrics_api.js` and `monitor-memory/src/memory_metrics_api.js`).

## AbstractFramework ecosystem

AbstractUIC is part of the broader [AbstractFramework](https://github.com/lpalbou/AbstractFramework) ecosystem:

- **AbstractCore** (core logic/types): https://github.com/lpalbou/abstractcore
- **AbstractRuntime** (runtime/orchestration): https://github.com/lpalbou/abstractruntime

AbstractUIC does **not** depend on AbstractCore/AbstractRuntime directly (see the absence of such dependencies in `*/package.json`). Instead, host apps (AbstractFlow / AbstractObserver / etc.) integrate with those layers and pass the resulting data into these UI components (see package contracts in `monitor-flow/src/AgentCyclesPanel.tsx`, `monitor-active-memory/src/types.ts`, `panel-chat/src/chat_message_card.tsx`).

## Documentation

- Getting started (entrypoint): [`docs/getting-started.md`](./docs/getting-started.md)
- Adoption guide (which component for which job): [`docs/adoption-guide.md`](./docs/adoption-guide.md)
- Theming & design tokens: [`docs/theming.md`](./docs/theming.md)
- API reference: [`docs/api.md`](./docs/api.md)
- FAQ: [`docs/faq.md`](./docs/faq.md)
- Architecture (includes diagrams): [`docs/architecture.md`](./docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](./docs/troubleshooting.md)
- Console islands (kit components for non-React pages): [`docs/console-islands.md`](./docs/console-islands.md)
- Docs index: [`docs/README.md`](./docs/README.md)
- Agent-oriented docs: [`llms.txt`](./llms.txt) (index) and [`llms-full.txt`](./llms-full.txt) (generated, offline-friendly)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Security: [`SECURITY.md`](./SECURITY.md)
- Acknowledgments: [`ACKNOWLEDGMENTS.md`](./ACKNOWLEDGMENTS.md)

## Packages

| Package | Purpose | Docs |
|---|---|---|
| `@abstractframework/ui-kit` | Theme tokens (21 themes), inputs (`AfSelect`, provider/model pickers), Gateway connect modal + connection hook, top bar / drawer / appearance dialog, About dialog + AbstractFramework identity helpers, tool policy editor, phase capability matrix, critical action dialog, steer composer, disclosure list, chips, icons, voice hook (streaming TTS + push-to-talk); console islands for non-React pages (repository build) | [`ui-kit/README.md`](./ui-kit/README.md) |
| `@abstractframework/panel-chat` | Chat thread + message cards + composer + markdown/json rendering, app assistant panel, workflow chat with live (streamed) replies | [`panel-chat/README.md`](./panel-chat/README.md) |
| `@abstractframework/app-server` | Node gateway-session proxy for app servers (token → HttpOnly cookie exchange, CSRF, URL pinning, forwarded client address) | [`app-server/README.md`](./app-server/README.md) |
| `@abstractframework/monitor-flow` | Agent-cycle trace viewer + ledger adapter | [`monitor-flow/README.md`](./monitor-flow/README.md) |
| `@abstractframework/monitor-active-memory` | Knowledge Graph + Active Memory explorer (ReactFlow) | [`monitor-active-memory/README.md`](./monitor-active-memory/README.md) |
| `@abstractframework/monitor-gpu` | GPU utilization widget (`<monitor-gpu>`) polling a metrics endpoint | [`monitor-gpu/README.md`](./monitor-gpu/README.md) |
| `@abstractframework/monitor-memory` | Host RAM + device memory widget (`<monitor-memory>`) polling a metrics endpoint | [`monitor-memory/README.md`](./monitor-memory/README.md) |

## Context

[AbstractFramework](https://github.com/lpalbou/AbstractFramework) is a workflow/runtime system with multiple host UX layers. AbstractUIC packages are host-driven UI building blocks used by those clients (no host imports; data + callbacks flow in from the host).

## Install

Packages are published independently. Install only the package(s) you need:

```bash
# chat
npm i @abstractframework/panel-chat @abstractframework/ui-kit

# agent traces
npm i @abstractframework/monitor-flow

# active memory explorer (requires reactflow peer dep)
npm i @abstractframework/monitor-active-memory reactflow

# gpu widget (web component)
npm i @abstractframework/monitor-gpu

# host memory widget (web component)
npm i @abstractframework/monitor-memory

# app-origin gateway session proxy
npm i @abstractframework/app-server
```

## Quickstart (React)

Import theme tokens once, then import the CSS for the package(s) you use (see [`docs/getting-started.md`](./docs/getting-started.md) for details and Next.js notes). Minimal example (chat):

```tsx
import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";

import { ChatComposer, ChatThread } from "@abstractframework/panel-chat";
```

## Development

- Install + build workspaces: `npm install && npm run build`
- Run tests: `npm test` (runs each workspace's test rig)
- React packages are typically validated via a host app that links them in a workspace (HMR).

See [`docs/development.md`](./docs/development.md).

## License

MIT (see [`LICENSE`](./LICENSE)).
