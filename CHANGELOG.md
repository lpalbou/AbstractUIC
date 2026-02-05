# Changelog

All notable changes to AbstractUIC are documented in this file.

This project is a **multi-package repository**; versions are currently kept in sync across packages.

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
