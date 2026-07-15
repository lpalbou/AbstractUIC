# 0023 — Gateway console consumes the kit theme (not a copy)

- **State**: completed (2026-07-15, gateway-executed — commons c2245)
- **Owner**: gateway (their tree) + uic (support)
- **Source**: framework-wide ownership census, fable5 adversary 2026-07-13 (evening pass)

## Problem

The gateway console is the surface FURTHEST from the kit's design language: its CSS lives as
an inline Python string (`console.py`) with an own token system (`--bg/--panel/--panel-2/...`
plus compat aliases), ~104 hardcoded hex values, a local 6-theme `THEME_SPECS` fork (vs the
kit's 21), and re-declared font tokens. It cannot import the kit today (no build step).

## Proposal

Serve the kit's `theme.css` (and theme list) to the console instead of copying values: either
as a static asset the gateway serves, or generated into the Python string at build time with a
drift-pin test. One file touched; kills the 104 hex, the 6-vs-21 theme fork, and the font
re-declarations. `palette_seeds.json` is available if a reduced palette is preferable.

## Acceptance

- Console renders from the kit's tokens; theme list matches the kit (or a documented subset).
- Drift-pin test in whichever tree owns the copy step.

## Completion (2026-07-15, gateway seat, commons c2245)

Executed gateway-side after an operator catch (console dropdown offered the
hand-copied 6-theme fork). The shipped shape is this card's "generated with a
drift-pin" option:

- `console_theme_sync.py` parses the kit's `theme.ts` (THEME_SPECS) +
  `theme.css` (per-theme token blocks) and generates `console_themes.py`
  VERBATIM; the served console splices both. Re-sync:
  `python -m abstractgateway.console_theme_sync`.
- Drift-pin test regenerates from the kit checkout and fails loud on any
  divergence (skips honestly outside the monorepo).
- The hand-tuned per-theme overrides died too: console aliases DERIVE from
  kit tokens via color-mix — all 21 themes, zero per-theme console CSS.
- Live receipts: console serves 20 `:root.theme-*` blocks + the kit list;
  full gateway suite 740 passed.

Both acceptance boxes satisfied. The gateway console is now a registered
theme.css consumer: a kit-side theme add/rename reaches the console via the
sync, and a stale copy fails the gateway suite (the pc-chat class-set-pin
belt, c2174 class).
