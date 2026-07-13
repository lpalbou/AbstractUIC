# Planned: guard extensions (component token consumption, swatch parity) + missing test rigs

## Metadata
- Created: 2026-07-11
- Status: Planned
- Completed: N/A
- Area: ui-kit/scripts, panel-chat, monitor-flow, monitor-active-memory test wiring

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The 2026-07-11 review proved the theme-token guard is good at what it pins
(invariants A-D all held under attack) and blind to the classes that actually
bit that night: component CSS consuming tokens NO theme defines (phantom
tokens, F3), raw literals in kit component blocks (F2), and theme.ts swatches
drifting from theme.css values (F19). Structurally: root `npm test` reaches
only ui-kit + monitor-gpu; panel-chat, monitor-flow, monitor-active-memory
have no test script at all.

## Current code reality
- `ui-kit/scripts/check_theme_tokens.mjs` parses theme.css theme blocks only.
- `ui-kit/src/theme.ts:8-41` — 21×6 swatch hexes duplicating CSS values,
  cross-checked for group (invariant D) but never for values.
- panel-chat/monitor-flow/monitor-active-memory `package.json`: no `test`.
- Pure-function candidates already isolated: panel-chat markdown parser,
  monitor-flow `build_agent_trace` (dedup/ordering feeds 3 apps), theme.ts
  applyTheme class handling.

## Problem
The guard cannot catch the bug classes we just paid for, and three of five
packages are structurally untestable from the root.

## What we want to do
1. Guard invariant E: every `var(--x[, fallback])` consumed in any package CSS
   resolves to a token defined in theme.css (:root or a theme block), with an
   explicit allowlist for deliberate consumer-supplied hooks.
2. Guard invariant F: raw hex/rgba in non-fallback position inside ui-kit
   component CSS blocks fails (fallbacks stay legal — they are the
   consumer-without-theme path).
3. Swatch parity: theme.ts swatches vs the theme's bg tokens.
4. Test scripts + first dependency-free `.mjs` rigs for panel-chat (markdown
   parser) and monitor-flow (build_agent_trace), wired into workspace test.

## Validation
Each new invariant verified to FAIL on the pre-0002-fix file states (seeded
bugs), pass after — the check_theme_tokens precedent.

## Progress checklist
- [ ] Invariant E (consumption resolution)
- [ ] Invariant F (literal positions)
- [ ] Swatch parity check
- [ ] panel-chat + monitor-flow test scripts and first rigs
