# Getting Started

AbstractUIC is a small set of **UI packages** (React components + one Web Component). Each top-level folder in this repo is an independently-consumable package.

If you’re new here, you typically:

1. Pick the package(s) you need
2. Install them (from npm, or from source/workspaces)
3. Import the required CSS (theme tokens + per-package styles; and ReactFlow styles if applicable)

For a package-by-package export map, see [`docs/api.md`](./api.md).

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

This repo does not ship a “single install”. Common options:

- **npm** (recommended for external consumers): install the package(s) you need once published.
- **Workspace / source**: add this repo as a workspace in your host, or vendor the package folder(s).
  - Workspace: build the packages you change (`npm run build`, see [`docs/development.md`](./development.md)).
  - Vendored sources: if you consume TypeScript sources directly, your toolchain must transpile TS/TSX dependencies.

Maintainers: see [`docs/publishing.md`](./publishing.md).

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

- API reference: [`docs/api.md`](./api.md)
- FAQ: [`docs/faq.md`](./faq.md)
- Architecture + diagrams: [`docs/architecture.md`](./architecture.md)
- Development workflow: [`docs/development.md`](./development.md)
- Publishing (maintainers): [`docs/publishing.md`](./publishing.md)
