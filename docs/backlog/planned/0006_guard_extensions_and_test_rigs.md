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
- Pins waiting to migrate IN (2026-07-17): continuum holds 3 renderer pins
  for panel-chat's markdown table parsing (blank-line table, paragraph-
  interrupting table, pipe-in-prose stays prose) in THEIR suite
  (abstractcontinuum src/ui/markdown_render.test.tsx) because panel-chat has
  no rig — move them into the panel-chat test script when it exists
  (continuum dm, owner-review 2026-07-17).

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
- [x] Invariant E (consumption resolution) — live in check_theme_tokens.mjs
      (invariants A-E hold in the gate; caught its first real bug within days
      of landing: the AfMemoryHintChip draft's undeclared tokens, 2026-07-16)
- [ ] Invariant F (literal positions) — not built (no literal-position scan in
      any script as of 2026-07-18)
- [ ] Swatch parity check — theme.ts swatches still unchecked against
      theme.css values (generate_palette_seeds checks palette_seeds.json
      parity, a different artifact)
- [x] panel-chat + monitor-flow test scripts and first rigs — 2026-07-18:
      `panel-chat/scripts/check_panel_chat.mjs` (markdown table/list/fence
      pins incl. continuum's 3 migrated table pins; JsonViewer
      collapseAfterDepth measurable-fold contract; ChatMessageCard date guard
      + title-over-role) and `monitor-flow/scripts/check_monitor_flow.mjs`
      (build_agent_trace dedup/ordering/grouping incl. the
      auto-label-never-filters regression; JsonViewer twin contract;
      package-owned toolbar class stability). Both run against COMPILED dist
      via react-dom/server renderToStaticMarkup (existing devDeps, no jsdom);
      wired as each package's `test` script, so the root `npm test` now
      reaches 6 of 6 workspaces. The panel-chat rig's first run caught a REAL
      packaging bug: ui-kit's af_cognition_bloom.tsx imported
      ./cognition_bloom_core WITHOUT the .js extension — bare-Node ESM
      consumers of the kit dist crashed on module resolution (bundlers
      resolve extensionless, which is why every prior gate was green).
