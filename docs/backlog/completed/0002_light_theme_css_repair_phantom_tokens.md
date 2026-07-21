# Completed: light-theme CSS repair — phantom tokens, JSON syntax colors, sign-in card, toolbar class

## Metadata
- Created: 2026-07-11
- Status: Completed
- Completed: 2026-07-17 (work landed across the 2026-07-13/16 sessions; tree-verified and moved here 2026-07-17 after the seat respawn)
- Area: ui-kit theme.css, panel-chat/panel_chat.css, monitor-flow/agent_cycles.css

## ADR status
- Governing ADRs: None
- ADR impact: None

## Context
The 2026-07-11 adversary review (findings F2, F3, F9, F13) found the library's
worst user-visible defects are light-theme breakage from three causes: raw
dark literals in component CSS, VSCode-dark JSON token colors, and tokens
consumed with `var(--x, fallback)` where `--x` is defined in NO theme (the
fallback always wins). The existing `check_theme_tokens.mjs` guard cannot see
any of these (it parses theme blocks only, never component consumption).

## Current code reality
- `ui-kit/src/theme.css:136-193` — GatewaySessionSignInCard hardcodes a dark
  navy gradient + `rgba(9,14,29,.76)` inputs + `color:#fff` buttons while text
  colors are themed: near-black-on-navy title and invisible typed text on all
  six light themes. Observer already overrides parts of it in its entity.css
  (consumer-override evidence). This card is the auth entry point of flow AND
  observer.
- `panel-chat/src/panel_chat.css:216-290` + `monitor-flow/src/agent_cycles.css:423-427`
  — JSON token colors are VSCode-dark literals (`#9cdcfe/#ce9178/#b5cea8/#569cd6`),
  ~1.5:1 on light themes.
- Phantom tokens: `--ui-text-muted`, `--ui-link`, `--ui-text-1` are consumed in
  panel_chat.css but defined nowhere (grep across kit + all consumer repos);
  white fallbacks make string-fold carets white-on-white on light themes.
- `monitor-flow/src/JsonViewer.tsx:240,247` — toolbar buttons use flow-only
  `.modal-button` class: unstyled UA buttons in observer/abstractcode.
- `theme.css:1438-1443` — `.af-select-custom-error` colored `var(--accent)`:
  validation errors render green on everforest.

## Problem
Three apps' core surfaces (auth modal, every JSON/ledger view, chat threads)
are unreadable or broken on the six light themes the kit itself ships.

## What we want to do
Tokenize the sign-in card; define semantic JSON syntax tokens (dark + light
sets) and consume them in both CSS files; define or substitute the phantom
tokens; give monitor-flow's toolbar a package-owned class; error color for
custom-value errors. Then extend the guard so this class cannot reship
(see 0006).

## Scope / Non-goals
Scope: CSS + token definitions only; no component API changes.
Non-goals: redesigning the sign-in card branding (keep the cyan identity,
express it through tokens with dark-theme values preserved verbatim).

## Validation
- Manual matrix: signin card + JSON viewer + chat thread on `light`,
  `solarized-light`, `everforest-light`, `one-light` + 2 dark themes.
- Contrast: measured ≥4.5:1 for body-size text on light primary/secondary
  surfaces (the entity-token precedent: measured, not eyeballed).
- `npm test` green incl. the 0006 guard extension once it lands.

## Progress checklist
- [x] JSON syntax token set (:root dark + grouped light block) — `--syntax-key/string/number/keyword` at theme.css:72-75 (dark), :464-467 (light block), plus per-theme overrides (nord, dracula, …) where the shared set fell under 4.5:1
- [x] panel_chat.css + agent_cycles.css consume them (literals kept only as `var(…, fallback)` for theme-less consumers); phantom tokens `--ui-text-muted`/`--ui-link`/`--ui-text-1` gone (workspace grep clean)
- [x] Sign-in card tokenized — accent-tinted primary button (solid-accent mathematically cannot hold 4.5:1 across 21 themes, measured note at theme.css:399), `--ui-*` surfaces, placeholder harmonization
- [x] monitor-flow toolbar class — package-owned `.json-viewer__btn` (agent_cycles.css:450, comment names the fix)
- [x] af-select custom-error → `--error` (theme.css:1615)

## Completion notes
Validation as shipped: `audit_theme_contrast.mjs --strict` in the kit gate
measures the syntax tokens against `--bg-secondary` per theme (20 themes
clean, no pair under 3:1, strict OK); the 0006 guard extension (Invariant E,
consumption resolution) is live in `check_theme_tokens.mjs` and caught its
first real bug within days (undeclared tokens in the AfMemoryHintChip draft,
2026-07-16). Visual matrix was exercised through the untracked stance-smoke
harness during the fable5 sessions.
