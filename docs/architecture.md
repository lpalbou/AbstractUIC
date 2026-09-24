# Architecture

AbstractUIC is a **multi-package repository**: each folder at the repo root is an independently-consumable package.

Ecosystem context (external):
- AbstractFramework: https://github.com/lpalbou/AbstractFramework
- AbstractCore: https://github.com/lpalbou/abstractcore
- AbstractRuntime: https://github.com/lpalbou/abstractruntime

This document stays intentionally close to the code: package boundaries, exports, and contracts are backed by entrypoints/types in `src/` and by `exports` metadata in each `*/package.json`. References to the broader AbstractFramework ecosystem (AbstractCore / AbstractRuntime) are for context — AbstractUIC does not import those packages directly.

## High-level overview

- **React packages** ship **compiled ESM + type declarations** from `dist/` (see `exports` in each `package.json`). Source lives in `src/` and is built with `tsc`.
- **`@abstractframework/monitor-gpu`** and **`@abstractframework/monitor-memory`** ship **JavaScript** (`monitor-gpu/src`, `monitor-memory/src`) and register custom elements.
- **`@abstractframework/app-server`** ships Node.js JavaScript (`app-server/src`) with no runtime dependencies.
- Styling is shipped as plain CSS and exposed as package exports (e.g. `@abstractframework/panel-chat/panel_chat.css`).
- **Console islands** are a repository build output of `ui-kit` (`ui-kit/islands/`), not an npm export: one self-contained script for pages that are not React apps. See [Console islands](./console-islands.md).

## Packages and their consumers

The AbstractFramework apps consume the packages from npm (or as workspace links). The
AbstractGateway console is served from Python without an npm build, so it vendors generated
copies of the kit instead: the theme stylesheet and the console islands bundle.

```mermaid
flowchart LR
  subgraph UIC["AbstractUIC packages"]
    UIKIT["ui-kit<br/>components + theme.css"]
    ISL["ui-kit console islands<br/>af-console-islands.js<br/>(repository build output)"]
    CHAT["panel-chat"]
    APPSRV["app-server"]
    MON["monitor-flow / monitor-active-memory<br/>monitor-gpu / monitor-memory"]
  end

  UIKIT -->|"build_islands.mjs (esbuild)"| ISL

  subgraph Apps["AbstractFramework apps (React)"]
    FLOWAPP["AbstractFlow"]
    CODE["AbstractCode web"]
    CONT["AbstractContinuum"]
    ENT["AbstractEntity"]
    OBS["AbstractObserver"]
  end

  subgraph GW["AbstractGateway console (HTML served from Python)"]
    CONSOLE["console page"]
  end

  UIKIT --> FLOWAPP & CODE & CONT & ENT & OBS
  CHAT --> CODE & CONT & ENT & OBS
  MON --> FLOWAPP & CODE & OBS
  APPSRV -->|"app server (Node)"| CONT & ENT & OBS
  UIKIT -->|"theme.css (vendored copy)"| CONSOLE
  ISL -->|"window.AfConsoleIslands (vendored copy)"| CONSOLE
```

Monitor usage per app: AbstractFlow uses all four monitors; AbstractCode web uses
`monitor-flow` and `monitor-gpu`; AbstractObserver uses `monitor-flow`, `monitor-active-memory`
and `monitor-gpu`.

## Package dependency graph

```mermaid
flowchart LR
  subgraph AbstractUIC
    UIKIT["@abstractframework/ui-kit"]
    CHAT["@abstractframework/panel-chat"]
    APPSRV["@abstractframework/app-server"]
    FLOW["@abstractframework/monitor-flow"]
    AMX["@abstractframework/monitor-active-memory"]
    GPU["@abstractframework/monitor-gpu"]
    MEM["@abstractframework/monitor-memory"]
  end

  CHAT -->|"imports Icon"| UIKIT
  AMX -->|"peer dep"| ReactFlow["reactflow (peer dependency)"]
  FLOW -->|"peer dep"| React["react / react-dom (peer dependency)"]
  CHAT -->|"peer dep"| React
  UIKIT -->|"peer dep"| React
  AMX -->|"peer dep"| React
  APPSRV -->|"node:http only (no deps)"| Node["Node.js >= 18"]
```

Evidence:
- `panel-chat/src/chat_message_card.tsx` imports `Icon` from `@abstractframework/ui-kit`.
- `monitor-active-memory/package.json` declares `reactflow` (and `react` / `react-dom`) as peer dependencies.

## Runtime data flow

AbstractUIC components are designed to be **host-driven**: hosts provide data and callbacks; the packages do not import host code.

```mermaid
flowchart TD
  Runtime["AbstractRuntime"]
  Core["AbstractCore"]
  Host["Host app (AbstractFlow / AbstractObserver / etc.)"]

  Runtime -->|"runs / steps / trace records"| Host
  Core -->|"memory / KG assertions"| Host

  Host -->|"TraceItem[] (or build_agent_trace)"| FlowPanel["monitor-flow: AgentCyclesPanel"]
  Host -->|"KgAssertion[] + onQuery() (optional)"| AMXPanel["monitor-active-memory: KgActiveMemoryExplorer"]
  Host -->|"ChatMessage[] + callbacks"| ChatUI["panel-chat: ChatThread / ChatComposer / ChatMessageCard"]

  Host -->|"register + attach <monitor-gpu>"| GPUWidget["monitor-gpu: <monitor-gpu>"]
  GPUWidget -->|"GET /api/gateway/host/metrics/gpu"| Metrics["AbstractGateway (metrics endpoints)"]

  Host -->|"register + attach <monitor-memory>"| MemWidget["monitor-memory: <monitor-memory>"]
  MemWidget -->|"GET /api/gateway/host/metrics/memory"| Metrics
```

Evidence:
- `monitor-flow/src/AgentCyclesPanel.tsx` consumes `TraceItem[]` and groups cycles by `step.effect.type === "llm_call"`.
- `monitor-flow/src/agent_cycles_adapter.ts` exports `build_agent_trace(...)` to adapt ledger-like records into `TraceItem[]`.
- `monitor-active-memory/src/KgActiveMemoryExplorer.tsx` consumes `items: KgAssertion[]` and optionally calls `onQuery(params)`.
- `monitor-gpu/src/gpu_metrics_api.js` and `monitor-memory/src/memory_metrics_api.js` build/fetch the metrics URLs and attach Bearer auth headers.
- No direct dependency on AbstractCore/AbstractRuntime: see the absence of such dependencies in `*/package.json`.

## Contracts & types (what you pass in)

### Knowledge graph / active memory (`monitor-active-memory`)

- `KgAssertion` / `KgQueryParams` / `KgQueryResult`: `monitor-active-memory/src/types.ts`
- Graph utilities: `monitor-active-memory/src/graph.ts`
- Main component + callback contracts: `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`

### Agent traces (`monitor-flow`)

- `TraceItem` / `TraceStep`: `monitor-flow/src/AgentCyclesPanel.tsx`
- Ledger adapter: `monitor-flow/src/agent_cycles_adapter.ts`

### Chat (`panel-chat`)

- `ChatMessage`, `ChatAttachment`, `ChatStat`: `panel-chat/src/chat_message_card.tsx`
- `ChatThread` / `ChatComposer`: `panel-chat/src/chat_thread.tsx`, `panel-chat/src/chat_composer.tsx`

### GPU metrics (`monitor-gpu`)

The widget expects JSON that can be interpreted by `extractUtilizationGpuPct(payload)`:

- `payload.utilization_gpu_pct` (number) **or**
- `payload.gpus[][].utilization_gpu_pct` (numbers; averaged)

See: `monitor-gpu/src/gpu_metrics_api.js` and `monitor-gpu/src/monitor_gpu_widget.js`.

### Host memory metrics (`monitor-memory`)

The widget expects JSON that can be interpreted by `extractMemoryUsage(payload)` — the memory object directly or nested under `memory`:

- `ram.percent`, or `ram.used_bytes` / `ram.total_bytes` (used derivable from `total_bytes - available_bytes`)
- `device.backend` + `device.allocated_bytes` / `device.total_bytes` (allocated derivable from `total_bytes - free_bytes`)

A `404` or `supported: false` reply marks the endpoint unsupported and stops polling.

See: `monitor-memory/src/memory_metrics_api.js` and `monitor-memory/src/monitor_memory_widget.js`.

## Gateway connection flow (`app-server` + `ui-kit`)

Apps that talk to an AbstractGateway use the shared two-part connection surface: the
`app-server` session proxy on the app's own origin, and the `ui-kit` modal + hook in the
browser. The browser never holds the Gateway token.

```mermaid
sequenceDiagram
  participant B as Browser (useGatewayConnection + GatewayConnectModal)
  participant A as App server (createGatewaySessionProxy)
  participant G as AbstractGateway

  B->>A: GET /api/connection/gateway (boot probe)
  A-->>B: { connected: false }
  Note over B: hook resolves "disconnected" → modal auto-opens
  B->>A: POST /api/connection/gateway { url, user, token }
  A->>G: verify token (/me)
  G-->>A: principal
  A-->>B: Set-Cookie (HttpOnly session + CSRF) — token discarded
  Note over B: sign-in success → modal self-closes
  B->>A: /api/gateway/* (cookies + x-abstract-csrf)
  A->>G: proxied with server-held session
```

- Contract details (auto-open rules, blocking vs dismissable, probe-once): see the
  [Adoption guide](./adoption-guide.md) and `ui-kit/README.md`.
- Evidence: `app-server/src/gateway_session_proxy.js`, `ui-kit/src/use_gateway_connection.ts`,
  `ui-kit/src/gateway_connect_modal.tsx`.

## Console islands (`ui-kit`)

The console islands expose the kit's `AfTopBarActions` and `AfAppearanceDialog` to a page that
is not a React app, through a prop-driven global API.

```mermaid
flowchart LR
  SRC["ui-kit/src/*<br/>AfTopBarActions, AfAppearanceDialog,<br/>theme.ts, typography.ts"]
  ENTRY["ui-kit/islands/console_islands.tsx"]
  BUILD["scripts/build_islands.mjs<br/>(esbuild, IIFE, React bundled)"]
  OUT["islands/dist/af-console-islands.js"]
  CHECK["scripts/check_islands.mjs<br/>(npm test)"]
  PAGE["Host page<br/>script tag + theme.css"]
  API["window.AfConsoleIslands<br/>mountTopBar / mountAppearance / applyAppearance"]

  SRC --> ENTRY --> BUILD --> OUT
  OUT --> CHECK
  OUT --> PAGE --> API
```

- The host owns all state and calls `handle.update(props)` when it changes.
- `apiVersion` (`"1"`) versions the island API; `kitVersion` records the `ui-kit` version the
  bundle was built from.
- The bundle carries no CSS; the host also serves `theme.css`.

Details, API and examples: [Console islands](./console-islands.md).

## Styling & theming

- `@abstractframework/ui-kit` provides CSS variables + theme classes in `ui-kit/src/theme.css` (exported as `@abstractframework/ui-kit/theme.css`) — 21 themes; see [Theming](./theming.md) for the token vocabulary and adoption rules.
- Other packages use those variables where available, but include fallbacks (e.g. `var(--ui-border-1, rgba(...))`).
- Non-CSS consumers can use the generated `ui-kit/palette_seeds.json` (4-token reduction per theme).

See also: [Getting started](./getting-started.md) for integration + required CSS.

## Related docs

- Getting started: [Getting started](./getting-started.md)
- API reference: [API reference](./api.md)
- Console islands: [Console islands](./console-islands.md)
- Theming: [Theming](./theming.md)
- FAQ: [FAQ](./faq.md)
- Troubleshooting: [Troubleshooting](./troubleshooting.md)
- Docs index: [Docs index](./README.md)
- Development: [Development](./development.md)
- Package docs: see the table in the root [`README.md`](../README.md)
