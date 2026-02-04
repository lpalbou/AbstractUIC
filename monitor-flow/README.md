# @abstractuic/monitor-flow

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

- Workspace: add a dependency on `@abstractuic/monitor-flow`
- npm (once published): `npm i @abstractuic/monitor-flow`

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
import { AgentCyclesPanel } from "@abstractuic/monitor-flow";

<AgentCyclesPanel items={items} />;
```

If you have “ledger-like” records, adapt them with `build_agent_trace`:

```tsx
import { AgentCyclesPanel, build_agent_trace } from "@abstractuic/monitor-flow";

const { items } = build_agent_trace(ledgerItems, { run_id: "run_123" });
<AgentCyclesPanel items={items} />;
```

## Styling

The panel imports `monitor-flow/src/agent_cycles.css` and uses shared UI token CSS variables where present (see `@abstractuic/ui-kit/src/theme.css`).

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
