# FAQ

This FAQ is written for first-time users integrating AbstractUIC packages into a host app. The **source of truth is the code** (exports in `*/src/index.*` and contracts/types in `src/`).

## Contents

- [What is AbstractUIC?](#what-is-abstractuic)
- [How does this relate to AbstractCore and AbstractRuntime?](#how-does-this-relate-to-abstractcore-and-abstractruntime)
- [Which package should I use?](#which-package-should-i-use)
- [Do I install a single package or multiple?](#do-i-install-a-single-package-or-multiple)
- [Why do I need a bundler / transpilation?](#why-do-i-need-a-bundler--transpilation)
- [Do you support Next.js?](#do-you-support-nextjs)
- [Do I need to import CSS manually?](#do-i-need-to-import-css-manually)
- [Are these components SSR-safe?](#are-these-components-ssr-safe)
- [How do I theme the UI?](#how-do-i-theme-the-ui)
- [panel-chat: How do I plug in my own Markdown renderer?](#panel-chat-how-do-i-plug-in-my-own-markdown-renderer)
- [panel-chat: How is JSON detected?](#panel-chat-how-is-json-detected)
- [panel-chat: How do I show replies while the model writes them?](#panel-chat-how-do-i-show-replies-while-the-model-writes-them)
- [panel-chat: Why do images in assistant messages show as links?](#panel-chat-why-do-images-in-assistant-messages-show-as-links)
- [ui-kit: How do I add the About dialog?](#ui-kit-how-do-i-add-the-about-dialog)
- [monitor-flow: What trace format does AgentCyclesPanel expect?](#monitor-flow-what-trace-format-does-agentcyclespanel-expect)
- [monitor-active-memory: How does querying work?](#monitor-active-memory-how-does-querying-work)
- [monitor-active-memory: Does it persist layouts?](#monitor-active-memory-does-it-persist-layouts)
- [monitor-gpu: What backend payload does it expect?](#monitor-gpu-what-backend-payload-does-it-expect)
- [monitor-gpu: How do I set auth and CORS safely?](#monitor-gpu-how-do-i-set-auth-and-cors-safely)
- [Can I use the kit components on a page that is not a React app?](#can-i-use-the-kit-components-on-a-page-that-is-not-a-react-app)
- [Where are the tests?](#where-are-the-tests)
- [Is this published to npm?](#is-this-published-to-npm)

## What is AbstractUIC?

AbstractUIC is a **multi-package repository**: each top-level folder is an npm package (see each `*/package.json`). Most packages are React components; two packages (`@abstractframework/monitor-gpu` and `@abstractframework/monitor-memory`) are dependency-free Web Components, and `@abstractframework/app-server` is a Node.js Gateway session proxy.

Start here: [Getting started](./getting-started.md).

See also:
- API reference: [API reference](./api.md)
- Architecture (diagrams): [Architecture](./architecture.md)

## How does this relate to AbstractCore and AbstractRuntime?

AbstractUIC is the **UI layer** for AbstractFramework host apps. It does not depend on AbstractCore/AbstractRuntime directly (see the absence of such dependencies in `*/package.json`).

In practice, host apps integrate with:
- **AbstractRuntime** (runs/steps/traces) and pass trace-like items to `@abstractframework/monitor-flow` (see `monitor-flow/src/AgentCyclesPanel.tsx`, `monitor-flow/src/agent_cycles_adapter.ts`).
- **AbstractCore** (memory/KG types) and pass assertions/query callbacks to `@abstractframework/monitor-active-memory` (see `monitor-active-memory/src/types.ts`, `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`).

See also: [Architecture](./architecture.md) (data-flow diagram) and the ecosystem overview in the root [`README.md`](../README.md).

## Which package should I use?

Use the table in [Getting started](./getting-started.md) to pick a package by use-case.

Authoritative exports:

- `@abstractframework/ui-kit`: `ui-kit/src/index.ts`
- `@abstractframework/panel-chat`: `panel-chat/src/index.ts`
- `@abstractframework/monitor-flow`: `monitor-flow/src/index.ts`
- `@abstractframework/monitor-active-memory`: `monitor-active-memory/src/index.ts`
- `@abstractframework/monitor-gpu`: `monitor-gpu/src/index.js`
- `@abstractframework/monitor-memory`: `monitor-memory/src/index.js`
- `@abstractframework/app-server`: `app-server/src/index.js`

## Do I install a single package or multiple?

Packages are meant to be installed individually — install only what you need.

Common combos:

- Chat UI: `@abstractframework/panel-chat` + `@abstractframework/ui-kit` (icons + shared tokens)
- Monitoring: `@abstractframework/monitor-flow` + `@abstractframework/ui-kit`
- KG explorer: `@abstractframework/monitor-active-memory` (+ `reactflow` peer dependency)

## Why do I need a bundler / transpilation?

All packages are ESM (`"type": "module"`). In web apps, you typically use a bundler to handle ESM and CSS imports.

If you consume TypeScript sources directly (vendored source), your toolchain must also transpile TS/TSX dependencies (example for Next.js: `transpilePackages`, see [Getting started](./getting-started.md)).

## Do you support Next.js?

Yes. In practice:

- import global CSS from your app entrypoint (`app/layout.tsx` or `pages/_app.tsx`)
- client-only rendering for DOM-dependent components (see SSR question below)
- if you consume TypeScript sources directly, use `transpilePackages` (see [Getting started](./getting-started.md))

## Do I need to import CSS manually?

Usually yes:

- Import theme tokens once (recommended): `import "@abstractframework/ui-kit/theme.css";` (file: `ui-kit/src/theme.css`)
- Import per-package styles for the packages you use:
  - `import "@abstractframework/panel-chat/panel_chat.css";`
  - `import "@abstractframework/monitor-flow/agent_cycles.css";`
  - `import "@abstractframework/monitor-active-memory/styles.css";`
- If you use `@abstractframework/monitor-active-memory`, import ReactFlow base styles in your app: `import "reactflow/dist/style.css";`

See: [Getting started](./getting-started.md).

## Are these components SSR-safe?

Many components can be used in SSR apps, but some utilities/components reference browser APIs such as `window`, `document`, `navigator`, or `localStorage` (examples: copy-to-clipboard helpers, layout persistence, DOM measurements).

In SSR frameworks, render these components client-side (for example behind a dynamic import or a “use client” boundary). If you see errors like `window is not defined`, it’s a signal that a component needs to run in the browser.

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

## panel-chat: How do I show replies while the model writes them?

Pass the Gateway's `llm.delta` / `llm.delta_end` frames to the `onDelta` argument of your
transport's `streamLedger`, and put the user's choice in the start-run input with
`streamRepliesRuntime(mode)` (`_runtime.stream`). `WorkflowSessionController` then shows a live
bubble per model call and replaces it with the final message. A transport without `onDelta`
still works; replies appear when complete.

See: [panel-chat live replies](../panel-chat/README.md#live-replies-streaming) and
[Architecture: Live replies](./architecture.md#live-replies-panel-chat).

## panel-chat: Why do images in assistant messages show as links?

`ChatMessageCard` renders assistant and system messages with `images="link"`: an image loads only
when `inlineImage(src)` accepts it, by default `sameOriginImage` (a root-relative path or a URL
on the page's own origin). Other images show as a link "image: <alt>", so model-written text
cannot make the browser fetch a remote URL. To change it, pass `images: "inline"` or your own
`inlineImage` through `messageProps`.

Source of truth: `panel-chat/src/markdown.tsx` and `panel-chat/src/chat_message_card.tsx`.

## ui-kit: How do I add the About dialog?

Pass `about={{ identity: appIdentity("<app id>", APP_VERSION), extraRows, onOpen }}` to
`AfTopBarActions`. Build `extraRows` for the connected Gateway with `gatewayVersionRows(body)`
from `GET /api/gateway/about`, or `gatewayVersionRows(null, reason)` when the request fails.
`knownAppIds()` lists the accepted ids.

See: [`ui-kit/README.md`](../ui-kit/README.md#about-dialog-and-identity).

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

## Can I use the kit components on a page that is not a React app?

Yes, in two ways:

- **Console islands**: build `ui-kit/islands/dist/af-console-islands.js` from a repository checkout and load it with a `<script>` tag; `window.AfConsoleIslands` mounts the real top bar, appearance dialog and About dialog with a prop-driven API. It is not part of the npm package. See [Console islands](./console-islands.md).
- **CSS only**: the `.af-topbar-*` and `.af-drawer-*` classes in `theme.css` are stable public API for server-rendered HTML (see [`ui-kit/README.md`](../ui-kit/README.md#css-public-api-non-react-consumers)).

## Where are the tests?

Each workspace ships its own test rig; run them all from the repo root:

```bash
npm test
```

Or a single package's, e.g. `npm --workspace monitor-gpu test` (see `monitor-gpu/test/`, `monitor-memory/test/`, `app-server/test/` and the `scripts/check_*.mjs` checks in `ui-kit/` and `panel-chat/`).

## Is this published to npm?

Yes — each folder is an independently published npm package (see `*/package.json` for package names and versions).

Quick check:

```bash
npm view @abstractframework/ui-kit version
```

Maintainers: see [Publishing](./publishing.md).

## Related docs

- Docs index: [Docs index](./README.md)
- Getting started: [Getting started](./getting-started.md)
- API reference: [API reference](./api.md)
- Architecture: [Architecture](./architecture.md)
- Troubleshooting: [Troubleshooting](./troubleshooting.md)
