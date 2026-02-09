# Getting Started

AbstractUIC is a small set of **UI packages** (React components + one Web Component). Each top-level folder in this repo is an independently-consumable package.

AbstractUIC is part of the [AbstractFramework](https://github.com/lpalbou/AbstractFramework) ecosystem:
- **AbstractCore**: https://github.com/lpalbou/abstractcore
- **AbstractRuntime**: https://github.com/lpalbou/abstractruntime

Host apps typically get their data from AbstractRuntime/AbstractCore, then pass it into these UI components as props/callbacks (see the package contracts referenced throughout the docs).

If you’re new here, you typically:

1. Pick the package(s) you need
2. Install them (from npm, or from source/workspaces)
3. Import the required CSS (theme tokens + per-package styles; and ReactFlow styles if applicable)

For a package-by-package export map, see the [API reference](./api.md).

## Pick a package

| Package | Use when you need… | Primary exports (source of truth) |
|---|---|---|
| `@abstractframework/ui-kit` | Shared theme tokens + small UI primitives (selects/icons) | `ui-kit/src/index.ts` |
| `@abstractframework/panel-chat` | Chat thread + message UI + markdown/json rendering | `panel-chat/src/index.ts` |
| `@abstractframework/monitor-flow` | Agent “cycles” trace viewer + ledger adapter | `monitor-flow/src/index.ts` |
| `@abstractframework/monitor-active-memory` | Knowledge Graph + Active Memory explorer (ReactFlow) | `monitor-active-memory/src/index.ts` |
| `@abstractframework/monitor-gpu` | GPU utilization histogram widget (`<monitor-gpu>`) | `monitor-gpu/src/index.js` |

## Requirements

- React packages declare `react@^18` and `react-dom@^18` as peer dependencies (see each `*/package.json`).
- `@abstractframework/monitor-active-memory` also declares `reactflow@^11` as a peer dependency.
- Packages are ESM (`"type": "module"`). In web apps, use a bundler that can consume ESM and CSS.

## Install / integrate

Packages are designed to be installed **individually** (install only what you need). Common options:

- **npm** (recommended for external consumers): install the package(s) you need from the registry.
- **Workspace / source**: add this repo as a workspace in your host app, or vendor the package folder(s).
  - Workspace: build the packages you change (`npm run build`, see [Development](./development.md)).
  - Vendored sources: if you consume TypeScript sources directly, your toolchain must transpile TS/TSX dependencies.

Maintainers: see [Publishing](./publishing.md).

### Install from npm

Install only what you need:

```bash
# chat
npm i @abstractframework/panel-chat @abstractframework/ui-kit

# agent traces
npm i @abstractframework/monitor-flow

# active memory explorer (requires reactflow peer dep)
npm i @abstractframework/monitor-active-memory reactflow

# gpu widget (web component)
npm i @abstractframework/monitor-gpu
```

## CSS you must import

Import theme tokens once (recommended):

```ts
import "@abstractframework/ui-kit/theme.css";
```

Import per-package styles for the packages you use:

```ts
import "@abstractframework/panel-chat/panel_chat.css";
import "@abstractframework/monitor-flow/agent_cycles.css";
import "@abstractframework/monitor-active-memory/styles.css";
```

If you use `@abstractframework/monitor-active-memory`, also import ReactFlow base styles in your app:

```ts
import "reactflow/dist/style.css";
```

## Quick examples

### Chat (`@abstractframework/panel-chat`)

```tsx
import React, { useState } from "react";
import { ChatComposer, ChatThread, type ChatMessage } from "@abstractframework/panel-chat";

export function ChatView() {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <>
      <ChatThread messages={messages} autoScroll />
      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={() => {
          const content = value.trim();
          if (!content) return;
          setMessages((m) => [...m, { role: "user", content }]);
          setValue("");
        }}
      />
    </>
  );
}
```

### Agent cycles (`@abstractframework/monitor-flow`)

```tsx
import { AgentCyclesPanel, build_agent_trace } from "@abstractframework/monitor-flow";

const { items } = build_agent_trace(ledgerItems, { run_id: "run_123" });
<AgentCyclesPanel items={items} />;
```

Cycles are segmented when `step.effect.type === "llm_call"` (see `monitor-flow/src/AgentCyclesPanel.tsx`).

### Active Memory explorer (`@abstractframework/monitor-active-memory`)

```tsx
import { KgActiveMemoryExplorer, type KgAssertion } from "@abstractframework/monitor-active-memory";

const items: KgAssertion[] = [];

<KgActiveMemoryExplorer
  items={items}
  onQuery={async (params) => {
    // Host decides how to fetch/search KG assertions.
    return { ok: true, items: [], active_memory_text: "" };
  }}
/>;
```

### GPU widget (`@abstractframework/monitor-gpu`)

```js
import { registerMonitorGpuWidget } from "@abstractframework/monitor-gpu";

registerMonitorGpuWidget();
const el = document.createElement("monitor-gpu");
el.baseUrl = "http://localhost:8080"; // optional; defaults to same-origin
el.token = "your-gateway-token"; // or: el.getToken = async () => "..."
el.tickMs = 1500;
el.historySize = 20;
el.mode = "icon"; // "full" | "icon"
document.body.appendChild(el);
```

## Next.js notes

- Import global CSS from your app entrypoint (e.g. `app/layout.tsx` or `pages/_app.tsx`), not from deep component files.
- Client-only: several components touch browser APIs (`window`, `document`, `navigator`, `localStorage`). Render them in client components.
- If you consume TypeScript sources directly (workspace/vendored), Next.js may need `transpilePackages`.

```js
// next.config.js
module.exports = {
  transpilePackages: ["@abstractframework/ui-kit", "@abstractframework/panel-chat", "@abstractframework/monitor-flow", "@abstractframework/monitor-active-memory"],
};
```

## Next docs

- [API reference](./api.md)
- [FAQ](./faq.md)
- [Architecture](./architecture.md)
- [Development](./development.md)
- [Publishing (maintainers)](./publishing.md)
