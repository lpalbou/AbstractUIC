# API Reference

This page is a **practical map** of what each package exports and how you typically integrate it.

Source of truth:
- React packages: exports in `*/src/index.ts` (compiled to `dist/` on publish; see `*/package.json`)
- GPU widget: exports in `monitor-gpu/src/index.js` (types in `monitor-gpu/src/index.d.ts`)

If you’re starting from scratch, read [Getting started](./getting-started.md) first (it covers install options and required CSS imports).

For ecosystem context (AbstractFramework / AbstractCore / AbstractRuntime) and the host-driven data flow, see [Architecture](./architecture.md).

## Shared integration notes (React packages)

- All React packages are ESM (`"type": "module"`) and declare `react@^18` / `react-dom@^18` as peer dependencies (see each `*/package.json`).
- **CSS is shipped as a separate export and must be imported by the host app** (do this in your app entrypoint, especially for Next.js).

CSS entrypoints (files live in each package’s `src/`):

```ts
import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";
import "@abstractframework/monitor-flow/agent_cycles.css";
import "@abstractframework/monitor-active-memory/styles.css";
import "reactflow/dist/style.css"; // only when using monitor-active-memory
```

## `@abstractframework/ui-kit`

Purpose: shared **theme tokens** + small UI primitives used by other packages and host apps.

- Primary exports: `ui-kit/src/index.ts`
- CSS: `@abstractframework/ui-kit/theme.css` (file: `ui-kit/src/theme.css`)

Key exports (authoritative list: `ui-kit/src/index.ts`):
- Theme: `THEMES`, `THEME_SPECS`, `applyTheme()`, `getThemeSpec()`, `themeClassName()` — see [Theming](./theming.md)
- Typography: `FONT_SCALES`, `HEADER_DENSITIES`, `applyTypography()`, `getFontScaleSpec()`, `getHeaderDensitySpec()`
- Inputs: `AfSelect`, `ThemeSelect`, `ProviderModelSelect`, `ProviderModelPicker` (gateway-default mode + provider→models cascade, injected transports), `FontScaleSelect`, `HeaderDensitySelect`, `ToolPolicyEditor`
- Gateway connection: `GatewayConnectModal` + `useGatewayConnection()` (the connection state machine: boot probe, auto-open on resolved disconnect, self-close on sign-in), plus helpers `fetchGatewayConnection()`, `signInGateway()`, `signOutGateway()`, `gatewayStatusBadge()`, `normalizeGatewayUrl()`; `GatewaySessionSignInCard` is the underlying form card.
- Phase capability matrix: `PhaseCapabilityMatrix` + a framework-free core (`validateMatrixPayload()`, `resolveCellView()`, `applyCellAction()`, `reconcilePatches()`, `serializeCellPatches()`)
- Critical actions: `CriticalActionDialog` + core (`resolveCriticalActionGate()`, `normalizeCriticalActionFacts()`)
- Run steering: `SteerComposer` + `submitSteer()` (idempotent command ids, CSRF candidates)
- Lists & badges: `DisclosureList` (tree list, roving tabindex), `AfChip` / `AfChipButton`
- Voice: `useGatewayVoice()` (TTS playback incl. streaming with pause/resume, push-to-talk capture; injected transports) + `streamTtsJsonl()`
- Icons: `Icon`, `IconName` (~40 glyphs, 24-grid and 16-grid families)

See: [`ui-kit/README.md`](../ui-kit/README.md) and the [Adoption guide](./adoption-guide.md).

## `@abstractframework/panel-chat`

Purpose: chat-thread UI primitives with lightweight Markdown/JSON rendering.

- Primary exports: `panel-chat/src/index.ts`
- CSS: `@abstractframework/panel-chat/panel_chat.css` (file: `panel-chat/src/panel_chat.css`)

Components:
- `ChatThread` (thread container; renders a list of messages)
- `ChatMessageCard` (single message rendering; `message.title` names the speaker — assistants
  render their entity/agent name when provided, falling back to "Agent")
- `ChatMessageContent` (message body renderer; JSON autodetect + Markdown)
- `ChatComposer` (composer input + submit handling; IME-safe Enter)

Renderers:
- `Markdown` (lightweight Markdown with real nested lists, marker progression, fenced code
  blocks incl. inside lists; see `panel-chat/src/markdown.tsx`)
- `JsonViewer` (collapsible tree; honors `collapseAfterDepth`; auto-parses JSON strings)

Types:
- `PanelChatMessage` (generic message model used by `ChatThread`)
- `ChatMessage`, `ChatAttachment`, `ChatMessageLevel`, `ChatStat` (see `panel-chat/src/chat_message_card.tsx`)

Utilities:
- `tryParseJson()` (drives JSON autodetection in `ChatMessageContent`)
- `chatToMarkdown()`, `copyText()`, `downloadTextFile()`

Customization point:
- `ChatMessageContent` supports `renderMarkdown?: (markdown: string) => React.ReactElement` (see `panel-chat/src/message_content.tsx`).

See: [`panel-chat/README.md`](../panel-chat/README.md) and [FAQ](./faq.md) (search for “panel-chat”).

## `@abstractframework/app-server`

Purpose: Node.js **gateway session proxy** for app servers (the server-side half of the
connection surface — pairs with `GatewayConnectModal`/`useGatewayConnection`).

- Exports: `createGatewaySessionProxy(options)`, `normalizeGatewayUrl()` (see `app-server/src/index.js`, types in `app-server/src/index.d.ts`)
- What it does: exchanges a Gateway user token for HttpOnly session cookies
  (`POST /api/connection/gateway`), proxies `/api/gateway/*` with the server-held session,
  enforces CSRF on mutating requests, pins the Gateway URL for non-loopback clients, and strips
  credential-bearing headers in both directions. Tokens never rest in the browser.
- Tests: `node --test app-server/test/gateway_session_proxy.test.mjs` (dependency-free; includes
  a stub gateway).

See: [Adoption guide](./adoption-guide.md) for the full connection-surface contract.

## `@abstractframework/monitor-flow`

Purpose: inspect **agent execution cycles** from trace/ledger-like records.

- Primary exports: `monitor-flow/src/index.ts`
- CSS: `@abstractframework/monitor-flow/agent_cycles.css` (file: `monitor-flow/src/agent_cycles.css`)

Components:
- `AgentCyclesPanel` (main UI)

Types:
- `TraceItem`, `TraceStep` (see `monitor-flow/src/AgentCyclesPanel.tsx`)

Adapter:
- `build_agent_trace(ledgerItems, { run_id })` to turn “ledger-like” items into `TraceItem[]` (see `monitor-flow/src/agent_cycles_adapter.ts`)
- Types: `LedgerRecordItem`, `StepRecordLike`, `AgentTraceBuildResult`

See: [`monitor-flow/README.md`](../monitor-flow/README.md) and [Architecture](./architecture.md) for the host-driven data flow.

## `@abstractframework/monitor-active-memory`

Purpose: ReactFlow-based explorer for **Knowledge Graph assertions** (`KgAssertion`) and derived **Active Memory** text.

- Primary exports: `monitor-active-memory/src/index.ts`
- CSS: `@abstractframework/monitor-active-memory/styles.css` (file: `monitor-active-memory/src/styles.css`)
- Peer dep: `reactflow@^11` (see `monitor-active-memory/package.json`)

Component:
- `KgActiveMemoryExplorer` (+ `KgActiveMemoryExplorerProps`)

Host contracts:
- Types: `KgAssertion`, `KgQueryParams`, `KgQueryResult`, `MemoryScope`, `RecallLevel` (see `monitor-active-memory/src/types.ts`)
- The component calls `onQuery(params)` when the user runs a query / expands neighborhoods (see `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`).

Graph/layout utilities (for advanced hosts):
- `buildKgGraph()`, `shortestPath()`, `buildKgLayout()`
- Force simulation helpers: `initForceSimulation()`, `stepForceSimulation()`, `forceSimulationEnergy()`, `forceSimulationPositions()`

See: [`monitor-active-memory/README.md`](../monitor-active-memory/README.md) and [FAQ](./faq.md) (search for “monitor-active-memory”).

## `@abstractframework/monitor-gpu`

Purpose: dependency-free GPU utilization widget implemented as a **Custom Element**.

- Primary exports: `monitor-gpu/src/index.js`
- Types: `monitor-gpu/src/index.d.ts`

Registration + custom element:
- `registerMonitorGpuWidget()` defines `<monitor-gpu>` (see `monitor-gpu/src/monitor_gpu_widget.js`)
- `MonitorGpuElement` typing is declared in `monitor-gpu/src/index.d.ts` (includes `mode: "full" | "icon"`)

Imperative controller:
- `createMonitorGpuWidget(target, options)` returns `MonitorGpuWidgetController` (start/stop/destroy; update options)

Low-level helpers (backend integration):
- `makeGpuMetricsUrl()`, `fetchHostGpuMetrics()`
- `buildAuthHeaders()`, `resolveBearerToken()`
- `extractUtilizationGpuPct(payload)` (supported payload formats documented in `monitor-gpu/README.md`)

See: [`monitor-gpu/README.md`](../monitor-gpu/README.md) for the backend contract and security notes.

## Related docs

- Getting started: [Getting started](./getting-started.md)
- FAQ: [FAQ](./faq.md)
- Architecture (diagrams): [Architecture](./architecture.md)
- Docs index: [Docs index](./README.md)
- Security policy: [`SECURITY.md`](../SECURITY.md)
