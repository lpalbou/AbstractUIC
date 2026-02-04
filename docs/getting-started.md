# Getting Started

AbstractUIC is a small set of **UI packages** (React components + one Web Component). Each top-level folder in this repo is an independently-consumable package.

If you’re new here, you typically:

1. Pick the package(s) you need
2. Ensure your app can **transpile TS/TSX dependencies** (React packages export `./src/index.ts`)
3. Import the required CSS (theme tokens, and ReactFlow styles if applicable)

## Pick a package

| Package | Use when you need… | Primary exports (source of truth) |
|---|---|---|
| `@abstractuic/ui-kit` | Shared theme tokens + small UI primitives (selects/icons) | `ui-kit/src/index.ts` |
| `@abstractuic/panel-chat` | Chat thread + message UI + markdown/json rendering | `panel-chat/src/index.ts` |
| `@abstractuic/monitor-flow` | Agent “cycles” trace viewer + ledger adapter | `monitor-flow/src/index.ts` |
| `@abstractuic/monitor-active-memory` | Knowledge Graph + Active Memory explorer (ReactFlow) | `monitor-active-memory/src/index.ts` |
| `@abstractutils/monitor-gpu` | GPU utilization histogram widget (`<monitor-gpu>`) | `monitor-gpu/src/index.js` |

## Requirements

- React packages declare `react@^18` and `react-dom@^18` as peer dependencies (see each `*/package.json`).
- `@abstractuic/monitor-active-memory` also declares `reactflow@^11` as a peer dependency.
- React packages export TS/TSX from `src/` (see each package’s `exports` field), so your bundler must transpile them.

## Install / integrate

This repo does not currently ship a “single install”. Common options:

- **Workspace** (recommended): add this repo as a workspace in your host, then depend on the packages by name.
- **Vendor**: copy the package folder(s) you need (keep `package.json` + `src/`) and install peer deps listed in that `package.json`.

Maintainers: see [`docs/publishing.md`](./publishing.md).

## CSS you must import

Import theme tokens once (recommended):

```ts
import "@abstractuic/ui-kit/src/theme.css";
```

If you use `@abstractuic/monitor-active-memory`, also import ReactFlow base styles in your app:

```ts
import "reactflow/dist/style.css";
```

## Quick examples

### Chat (`@abstractuic/panel-chat`)

```tsx
import React, { useState } from "react";
import { ChatComposer, ChatThread, type ChatMessage } from "@abstractuic/panel-chat";

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

### Agent cycles (`@abstractuic/monitor-flow`)

```tsx
import { AgentCyclesPanel, build_agent_trace } from "@abstractuic/monitor-flow";

const { items } = build_agent_trace(ledgerItems, { run_id: "run_123" });
<AgentCyclesPanel items={items} />;
```

Cycles are segmented when `step.effect.type === "llm_call"` (see `monitor-flow/src/AgentCyclesPanel.tsx`).

### Active Memory explorer (`@abstractuic/monitor-active-memory`)

```tsx
import { KgActiveMemoryExplorer, type KgAssertion } from "@abstractuic/monitor-active-memory";

const items: KgAssertion[] = [];

<KgActiveMemoryExplorer
  items={items}
  onQuery={async (params) => {
    // Host decides how to fetch/search KG assertions.
    return { ok: true, items: [], active_memory_text: "" };
  }}
/>;
```

### GPU widget (`@abstractutils/monitor-gpu`)

```js
import { registerMonitorGpuWidget } from "@abstractutils/monitor-gpu";

registerMonitorGpuWidget();
const el = document.createElement("monitor-gpu");
el.baseUrl = "http://localhost:8080"; // optional; defaults to same-origin
el.token = "your-gateway-token"; // or: el.getToken = async () => "..."
el.tickMs = 1500;
el.historySize = 20;
el.mode = "icon"; // "full" | "icon"
document.body.appendChild(el);
```

## Next.js note (transpiling)

If you install these packages into `node_modules`, Next.js often needs `transpilePackages` because the React packages export TS/TSX from `src/`:

```js
// next.config.js
module.exports = {
  transpilePackages: ["@abstractuic/ui-kit", "@abstractuic/panel-chat", "@abstractuic/monitor-flow", "@abstractuic/monitor-active-memory"],
};
```

## Next docs

- Architecture + diagrams: [`docs/architecture.md`](./architecture.md)
- Development workflow: [`docs/development.md`](./development.md)
- Publishing (maintainers): [`docs/publishing.md`](./publishing.md)

