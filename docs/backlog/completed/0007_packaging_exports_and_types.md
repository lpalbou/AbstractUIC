# Completed: packaging — exports default conditions, monitor-gpu d.ts completeness, CSS self-import

## Metadata
- Created: 2026-07-11
- Status: Completed
- Completed: 2026-07-17 (default conditions + gpu d.ts + CSS-contract decision all closed same day; receipts c2775/c2901)
- Area: all five package.json files, monitor-gpu/index.d.ts, monitor-flow CSS contract

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
Adversary B (2026-07-11) surfaced the structural fact that makes packaging
bugs invisible: all three consumer apps alias `@abstractframework/*` to the
packages' `src/` in their vite configs, so published exports maps and dist
artifacts have ZERO in-tree consumers — they are exercised only by external
npm users, exactly who packaging exists for. Findings F12, F22.

## Current code reality
- ui-kit, panel-chat, monitor-flow, monitor-active-memory exports maps declare
  only `types` + `import` (no `default`): CJS-context consumers (Jest without
  ESM, `require()`) get ERR_PACKAGE_PATH_NOT_EXPORTED. monitor-gpu does it
  right (`default` present) — the in-family precedent.
- `monitor-gpu/src/index.js` exports six runtime symbols; `index.d.ts`
  declares only part of them — TS consumers of the tested API get compile
  errors on working runtime imports.
- `monitor-flow/src/AgentCyclesPanel.tsx:3` self-imports `./agent_cycles.css`
  (survives into dist) while the family contract (CHANGELOG 0.1.1) says CSS is
  an explicit package export imported by the host: works under Vite, breaks
  non-bundler ESM consumers, contradicts the documented rule.

## Problem
Publish-only breakage: the first external consumer with a CJS toolchain or a
bundler-less ESM setup hits errors no in-tree build can reveal.

## What we want to do
Add `default` conditions to the four React packages; complete monitor-gpu's
d.ts to the real export surface; resolve the monitor-flow CSS contract (either
remove the self-import and document host-import for the panel, or change the
documented contract deliberately — one rule for the family, not two).

## Validation
- `npm pack` per package + a scratch consumer (`node -e "require(...)"` and
  ESM import) against the packed tarballs.
- `tsc` against monitor-gpu's d.ts importing all six symbols.

## Progress checklist
- [x] default conditions × 4 (2026-07-17: ui-kit, panel-chat, monitor-flow,
      monitor-active-memory — `default` beside `import`, both pointing at the
      ESM entry, the monitor-gpu precedent; verified by createRequire
      resolution against all five packages)
- [x] monitor-gpu d.ts completeness (2026-07-17: HistoryBuffer + the five
      gpu_metrics_api functions + GpuMetricsResult declared; verified by a
      strict tsc check importing all nine runtime symbols)
- [x] monitor-flow CSS contract decision + fix — DECIDED 2026-07-17: option
      (a), one family rule (hosts import CSS explicitly), per flow's answer
      (c2831) + uic adoption (c2833). All three consumers shipped the explicit
      one-liner with receipts (flow c2831, code c2835, observer c2889); the
      self-import was REMOVED from AgentCyclesPanel.tsx the same evening
      (comment at the old site names the rule + receipts), monitor-flow build
      green, dist verified import-free. Zero unstyled window for any consumer.
