# FAQ

This FAQ is written for first-time users integrating AbstractUIC packages into a host app. The **source of truth is the code** (exports in `*/src/index.*` and contracts/types in `src/`).

## Contents

- [What is AbstractUIC?](#what-is-abstractuic)
- [Which package should I use?](#which-package-should-i-use)
- [Do I install a single package or multiple?](#do-i-install-a-single-package-or-multiple)
- [Why do I need a bundler / transpilation?](#why-do-i-need-a-bundler--transpilation)
- [Do you support Next.js?](#do-you-support-nextjs)
- [Do I need to import CSS manually?](#do-i-need-to-import-css-manually)
- [Are these components SSR-safe?](#are-these-components-ssr-safe)
- [How do I theme the UI?](#how-do-i-theme-the-ui)
- [panel-chat: How do I plug in my own Markdown renderer?](#panel-chat-how-do-i-plug-in-my-own-markdown-renderer)
- [panel-chat: How is JSON detected?](#panel-chat-how-is-json-detected)
- [monitor-flow: What trace format does AgentCyclesPanel expect?](#monitor-flow-what-trace-format-does-agentcyclespanel-expect)
- [monitor-active-memory: How does querying work?](#monitor-active-memory-how-does-querying-work)
- [monitor-active-memory: Does it persist layouts?](#monitor-active-memory-does-it-persist-layouts)
- [monitor-gpu: What backend payload does it expect?](#monitor-gpu-what-backend-payload-does-it-expect)
- [monitor-gpu: How do I set auth and CORS safely?](#monitor-gpu-how-do-i-set-auth-and-cors-safely)
- [Where are the tests?](#where-are-the-tests)
- [Is this published to npm?](#is-this-published-to-npm)

## What is AbstractUIC?

AbstractUIC is a **multi-package repository**: each top-level folder is an npm package (see each `*/package.json`). Most packages are React components; one package (`@abstractframework/monitor-gpu`) is a dependency-free Web Component.

Start here: [`docs/getting-started.md`](./getting-started.md).

See also:
- API reference: [`docs/api.md`](./api.md)
- Architecture (diagrams): [`docs/architecture.md`](./architecture.md)

## Which package should I use?

Use the table in [`docs/getting-started.md`](./getting-started.md) to pick a package by use-case.

Authoritative exports:

- `@abstractframework/ui-kit`: `ui-kit/src/index.ts`
- `@abstractframework/panel-chat`: `panel-chat/src/index.ts`
- `@abstractframework/monitor-flow`: `monitor-flow/src/index.ts`
- `@abstractframework/monitor-active-memory`: `monitor-active-memory/src/index.ts`
- `@abstractframework/monitor-gpu`: `monitor-gpu/src/index.js`

## Do I install a single package or multiple?

There is no “all-in-one” package. Install only what you need.

Common combos:

- Chat UI: `@abstractframework/panel-chat` + `@abstractframework/ui-kit` (icons + shared tokens)
- Monitoring: `@abstractframework/monitor-flow` + `@abstractframework/ui-kit`
- KG explorer: `@abstractframework/monitor-active-memory` (+ `reactflow` peer dependency)

## Why do I need a bundler / transpilation?

All packages are ESM (`"type": "module"`). In web apps, you typically use a bundler to handle ESM and CSS imports.

If you consume TypeScript sources directly (vendored source), your toolchain must also transpile TS/TSX dependencies (example for Next.js: `transpilePackages`, see [`docs/getting-started.md`](./getting-started.md)).

## Do you support Next.js?

Yes. In practice:

- import global CSS from your app entrypoint (`app/layout.tsx` or `pages/_app.tsx`)
- client-only rendering for DOM-dependent components (see SSR question below)
- if you consume TypeScript sources directly, use `transpilePackages` (see [`docs/getting-started.md`](./getting-started.md))

## Do I need to import CSS manually?

Usually yes:

- Import theme tokens once (recommended): `import "@abstractframework/ui-kit/theme.css";` (file: `ui-kit/src/theme.css`)
- Import per-package styles for the packages you use:
  - `import "@abstractframework/panel-chat/panel_chat.css";`
  - `import "@abstractframework/monitor-flow/agent_cycles.css";`
  - `import "@abstractframework/monitor-active-memory/styles.css";`
- If you use `@abstractframework/monitor-active-memory`, import ReactFlow base styles in your app: `import "reactflow/dist/style.css";`

See: [`docs/getting-started.md`](./getting-started.md).

## Are these components SSR-safe?

Not universally.

Several components/utilities reference browser APIs such as `window`, `document`, `navigator`, or `localStorage` (examples: copy-to-clipboard helpers, layout persistence, DOM measurements). In SSR frameworks, render these components client-side (or behind dynamic import / “use client” boundaries).

## How do I theme the UI?

1. Import tokens once: `@abstractframework/ui-kit/theme.css`
2. Choose a theme class (e.g. `theme-dark`, `theme-light`, `theme-catppuccin-mocha`, …) or call the helper:

```ts
import { applyTheme } from "@abstractframework/ui-kit";

applyTheme("dark"); // applies a `theme-*` class to <html>
```

See: `ui-kit/src/theme.ts` and `ui-kit/src/theme.css`.

## panel-chat: How do I plug in my own Markdown renderer?

Use `renderMarkdown` on `ChatMessageContent` (or pass it through `ChatMessageCard` via `messageProps` in `ChatThread`).

Source of truth: `panel-chat/src/message_content.tsx` (`renderMarkdown?: (markdown: string) => React.ReactElement`).

## panel-chat: How is JSON detected?

`ChatMessageContent` calls `tryParseJson(text)` and renders:

- JSON ⇒ `JsonViewer`
- otherwise ⇒ `Markdown` (or `renderMarkdown` override)

Source of truth: `panel-chat/src/message_content.tsx` and `panel-chat/src/utils.ts`.

## monitor-flow: What trace format does AgentCyclesPanel expect?

`AgentCyclesPanel` consumes `TraceItem[]` and starts a new cycle when `step.effect.type === "llm_call"`.

Source of truth:

- `monitor-flow/src/AgentCyclesPanel.tsx` (types + cycle segmentation)
- `monitor-flow/src/agent_cycles_adapter.ts` (`build_agent_trace(...)` to adapt ledger-like records)

## monitor-active-memory: How does querying work?

Querying is host-driven:

- Provide `onQuery(params: KgQueryParams) => Promise<KgQueryResult>`
- The component calls it when the user runs a query or expands a neighborhood

Source of truth: `monitor-active-memory/src/KgActiveMemoryExplorer.tsx` (`onQuery`, `queryMode`, `onItemsReplace`).

## monitor-active-memory: Does it persist layouts?

Yes (in the browser): per-view layouts can be saved to `localStorage` under key `abstractuic_amx_saved_layouts_v1`.

Source of truth: `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`.

## monitor-gpu: What backend payload does it expect?

The widget treats the payload as “supported” unless `supported === false` and extracts utilization via `extractUtilizationGpuPct(payload)`:

- `payload.utilization_gpu_pct` (number) **or**
- `payload.gpus[][].utilization_gpu_pct` (numbers; averaged)

Source of truth: `monitor-gpu/src/gpu_metrics_api.js` and `monitor-gpu/src/monitor_gpu_widget.js`.

## monitor-gpu: How do I set auth and CORS safely?

- Provide auth via `el.token = "..."` or `el.getToken = async () => "..."` (the widget sends `Authorization: Bearer <token>`)
- Do not pass tokens in URLs
- For cross-origin usage, configure your backend’s allowed origins (see security notes in `monitor-gpu/README.md`)

Source of truth: `monitor-gpu/src/gpu_metrics_api.js` (`buildAuthHeaders`) and `monitor-gpu/src/monitor_gpu_widget.js`.

## Where are the tests?

Only `@abstractframework/monitor-gpu` currently includes automated tests:

```bash
cd monitor-gpu
npm test
```

See: `monitor-gpu/test/`.

## Is this published to npm?

Each package is an npm package (has its own `package.json`). Whether a package is available on npm depends on your release process.

Maintainers: see [`docs/publishing.md`](./publishing.md).
