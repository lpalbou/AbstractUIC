# Changelog

All notable changes to AbstractUIC are documented in this file.

This project is a **multi-package repository**; versions are currently kept in sync across packages.

## Unreleased

### Added

- `@abstractframework/monitor-flow` `AgentCyclesPanel` now owns the per-stage
  tinting of the agent think → act → observe loop (think=info, act=warning,
  observe=success), keyed on a `data-stage` attribute contract typed as a
  closed union in the component. Previously the tint CSS lived in AbstractFlow
  only, so other consumers (Observer, AbstractCode) rendered the loop as
  undifferentiated gray pills. Stage text mixes 45% hue / 55% `--text-primary`
  so muted palettes (Nord, pastel light themes) keep ≥4.5:1 contrast at 11px.
- UI Kit ships the `observer-night` theme (the Observer entity app's warm
  amber / deep blue-black palette) so kit components rendered inside the
  entity view match its chrome.
- UI Kit theme token integrity guard (`ui-kit/scripts/check_theme_tokens.mjs`,
  wired as the workspace `test` script): every theme that redefines a base
  semantic color must define hue-matched `-subtle`/`-border` derivatives —
  pins the leak class found by the 2026-07-11 adversarial review.

### Fixed

- `theme-solarized-light` was the only theme missing the semantic
  `--*-subtle`/`--*-border` token set, so the default dark theme's blue-family
  rgba values leaked into its cream palette wherever those tokens are consumed
  (stage pills, tool badges, ToolPolicyEditor states).
- Default (`:root`) `--success/--warning/--error` subtle + border literals
  carried Tailwind hues that did not match the base colors; aligned to one hue
  family per color role. `monitor-flow` fallback literals aligned to the same
  values (the tool badge previously carried a third, unrelated blue).
- `monitor-flow` base stage pill derives from `--ui-pill-bg`/`--ui-pill-border`
  theme tokens instead of hardcoded white-alpha values, restoring correct
  rendering on light themes.

## 0.1.8 - 2026-06-14

### Fixed

- Improved the shared JSON viewer used by `@abstractframework/monitor-flow` and
  `@abstractframework/panel-chat` with a better default fold depth, fold-all
  controls, and correct wrapping for long structured output.
- Extended `@abstractframework/panel-chat` Markdown rendering so links and
  images render as first-class rich content instead of plain text.

## 0.1.7 - 2026-05-31

### Added

- UI Kit exports the shared Gateway browser-session sign-in card used by Gateway Console and thin clients.

### Changed

- Synchronized all AbstractUIC workspace package versions and updated `@abstractframework/panel-chat` to depend on `@abstractframework/ui-kit@^0.1.7`.

## 0.1.6 - 2026-05-26

### Added

- UI Kit exports `GatewaySessionSignInCard`, a shared Gateway user-token browser-session sign-in card for React thin clients.
- UI Kit `AfSelect` supports disabled options, disabled custom values with reason text, and custom option labels for dense editor selectors.

### Fixed

- UI Kit select popovers stop wheel-event propagation and style disabled options plus inline custom-value validation messages.

## 0.1.5 - 2026-05-12

### Fixed

- Correct `/monitor-flow` package exports so published consumers can resolve the bundled `agent_cycles.css` from `dist`.
- Use Node 24 in CI/release workflows for npm trusted publishing compatibility.

## 0.1.4 - 2026-05-12

### Fixed

- React package dist output is now usable as published ESM: relative runtime imports emit `.js` specifiers, and `@abstractframework/monitor-flow` copies `agent_cycles.css` into `dist`.
- `@abstractframework/panel-chat` now targets `@abstractframework/ui-kit@^0.1.4`.

### Added

- GitHub Actions CI for install, build, tests, and package dry-runs.
- GitHub Actions npm release workflow using trusted publishing/provenance, publishing packages in dependency order.

## 0.1.3 - 2026-02-05

### Fixed

- `@abstractframework/panel-chat` Markdown renderer now supports headings up to level 5 (`#####`) (see `panel-chat/src/markdown.tsx` + `panel-chat/src/panel_chat.css`).

## 0.1.2 - 2026-02-05

### Changed

- Documentation polish pass for public release (clearer entrypoints, tighter cross-links, and more actionable install guidance).
- Version bump to reflect the documentation release across packages.

## 0.1.1 - 2026-02-04

### Added

- User-facing documentation set and navigation:
  - `docs/getting-started.md` (entrypoint after `README.md`)
  - `docs/architecture.md` (includes Mermaid diagrams)
  - `docs/api.md` (package API map)
  - `docs/faq.md`
  - `docs/development.md`, `docs/publishing.md`, `docs/README.md`
- LLM-oriented docs: `llms.txt` and generated `llms-full.txt` (`scripts/generate-llms-full.py`).

### Changed

- React packages publish **compiled ESM + type declarations** from `dist/` (see `main` / `types` / `exports` in each package’s `package.json`).
- CSS is shipped as explicit package exports and must be imported by the host app:
  - `@abstractframework/ui-kit/theme.css`
  - `@abstractframework/panel-chat/panel_chat.css`
  - `@abstractframework/monitor-flow/agent_cycles.css`
  - `@abstractframework/monitor-active-memory/styles.css`
- `@abstractframework/monitor-gpu` custom element supports `mode: "full" | "icon"` (runtime + types).
- Docs are polished for first-time users (clear entrypoints, cross-links, and npm install examples).

## 0.1.0

- Initial repository snapshot (packages + baseline docs).

## Related docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Publishing (maintainers): [`docs/publishing.md`](./docs/publishing.md)
