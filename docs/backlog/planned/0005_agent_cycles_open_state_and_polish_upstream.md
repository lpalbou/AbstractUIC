# Planned: AgentCyclesPanel — user-owned open state + flow polish-CSS upstream

## Metadata
- Created: 2026-07-11
- Status: Planned
- Completed: N/A
- Area: monitor-flow (AgentCyclesPanel.tsx, agent_cycles.css)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
AgentCyclesPanel just became the single owner of the think/act/observe stage
rendering across flow, observer, and abstractcode (2026-07-11 stage-tint
handoff). Two residuals from the same review wave: adversary B F6 (live-run
read disruption) and adversary A opportunity #5 (the deliberately-kept flow
polish fork, offered for upstreaming by the flow seat in the DM thread).

## Current code reality (verified in source 2026-07-11)
- `AgentCyclesPanel.tsx:721-723` — cycle `<details open={defaultOpenLatest &&
  c.index === cycles.length}>` with no onToggle state: when cycle N+1 streams
  in, cycle N's `open` prop flips true→false and React collapses it under the
  reader. The component already implements the correct pattern for steps
  (TraceStepCard keeps `is_open` state via onToggle, `:447-448,536-538`).
- Flow still carries ~44 selectors of `.agent-cycle`/`.agent-trace` polish
  (hover/transition/metric badges, index.css ~4160-4560) that the other two
  consumers do not get — the flow seat offered this block for upstreaming
  (dm:flow--uic seq 4).

## Problem
Live agent runs collapse the cycle a user is reading in all three consumer
apps; and the shared panel renders with less polish everywhere except flow.

## What we want to do
Mirror the TraceStepCard open-state pattern on cycles (initialize from
defaultOpenLatest, user owns it afterwards); take flow's polish block into
agent_cycles.css (second deletion round in flow, coordinated — their tree).

## Validation
- Manual: live run in flow's run modal — expand an old cycle, let a new cycle
  arrive, reading position survives.
- Visual parity spot-check across the three consumers after the CSS move;
  flow deletes its block and stays green (tsc + vitest + token guard).

## Progress checklist
- [ ] Cycle open-state ownership
- [ ] Polish CSS upstreamed + flow deletion round (flow seat)
