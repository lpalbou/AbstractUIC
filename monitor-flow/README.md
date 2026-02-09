# @abstractframework/monitor-flow

React components to inspect **agent execution cycles** (think → act → observe) from per-effect trace records.

## What you get

Authoritative exports live in `monitor-flow/src/index.ts`:

- `AgentCyclesPanel` (+ types `TraceItem`, `TraceStep`)
- `JsonViewer`
- `build_agent_trace` (+ `LedgerRecordItem`, `StepRecordLike`)

## Peer dependencies

Declared in `monitor-flow/package.json`:

- `react@^18`, `react-dom@^18`

## Install

- Workspace: add a dependency on `@abstractframework/monitor-flow`
- npm: `npm i @abstractframework/monitor-flow`

## Expected data

`AgentCyclesPanel` expects `TraceItem[]` (see `monitor-flow/src/AgentCyclesPanel.tsx`):

```ts
type TraceItem = {
  id: string;
  runId: string;
  nodeId: string;
  ts?: string;
  status: string;
  step: Record<string, unknown>;
};
```

Cycles start whenever `step.effect.type === "llm_call"` (see the cycle builder in `monitor-flow/src/AgentCyclesPanel.tsx`).

## Usage

If you already have `TraceItem[]`, pass it directly:

```tsx
import { AgentCyclesPanel } from "@abstractframework/monitor-flow";

<AgentCyclesPanel items={items} />;
```

If you have “ledger-like” records, adapt them with `build_agent_trace`:

```tsx
import { AgentCyclesPanel, build_agent_trace } from "@abstractframework/monitor-flow";

const { items } = build_agent_trace(ledgerItems, { run_id: "run_123" });
<AgentCyclesPanel items={items} />;
```

## Styling

Import CSS in your app entrypoint (recommended):

- `import "@abstractframework/monitor-flow/agent_cycles.css";`
- `import "@abstractframework/ui-kit/theme.css";` (shared tokens)

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
