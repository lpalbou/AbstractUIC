# 0024 — Tokenize abstractentity's entity.css

- **State**: proposed
- **Owner**: entity (their tree) + uic (support)
- **Source**: framework-wide ownership census, fable5 adversary 2026-07-13 (evening pass)

## Problem

`abstractentity/src/entity.css` re-declares its own vocabulary (`--bg/--bg-panel/--bg-raise/
--line/--text/--text-dim`) plus the seven entity-semantic tokens as literals (~191 hex in
entity.css + ~23 in graph_canvas), with ~10 literal font stacks (incl. "SF Mono" — the macOS
Qt lesson says that alias is unreliable) and a hardcoded `applyTheme("observer-night")` with
no user switching. A drift-pin test exists against the kit but tests value-copies, not
consumption.

## Proposal

Map the local vocabulary onto kit tokens (`--bg`→`--bg-primary`, `--bg-panel`→`--bg-secondary`,
`--bg-raise`→`--bg-tertiary` — the kit's `observer-night` theme already carries those exact
values), swap the entity-semantic literals for the kit's `--entity-*` tokens (they exist for
exactly this), replace literal font stacks with `--font-sans`/`--font-mono`, and offer
`ThemeSelect`. The drift-pin test upgrades into actual single-sourcing.

## Acceptance

- entity.css consumes kit tokens; hex count drops to app-specific colors only.
- Theme switching available (or a documented decision to stay pinned).
