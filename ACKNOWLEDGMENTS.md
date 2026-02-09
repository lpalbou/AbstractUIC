# Acknowledgments

AbstractUIC is built on top of excellent open-source projects and the broader web ecosystem.

AbstractUIC packages intentionally keep runtime dependencies minimal: React packages rely on peer dependencies, and the repo does not ship third-party runtime dependencies under `dependencies` in `*/package.json` (only `peerDependencies` / `devDependencies`).

## Open-source foundations (direct dependencies)

- **React** + **React DOM** for UI composition (`react`, `react-dom`)
  - Used as peer dependencies by the React packages (see `ui-kit/package.json`, `panel-chat/package.json`, `monitor-flow/package.json`, `monitor-active-memory/package.json`).
- **ReactFlow** for graph visualization (`reactflow`)
  - Used by `@abstractframework/monitor-active-memory` (see `monitor-active-memory/package.json`).
- **TypeScript** for authoring, type-checking, and build output (`typescript`)
  - Used to compile React packages from `src/` into `dist/` via `tsc` (see `*/package.json` scripts and `tsconfig.base.json`).
- **DefinitelyTyped** for TypeScript type definitions (`@types/react`, `@types/react-dom`)
  - Used during development (see `*/package.json` dev dependencies).

## Tooling and standards we rely on

- **Node.js** runtime and built-in test runner (`node --test`) for `@abstractframework/monitor-gpu` tests (see `monitor-gpu/package.json`).
- **Web Platform APIs** (Custom Elements, Shadow DOM, Fetch) for the GPU widget implementation (`monitor-gpu/src/monitor_gpu_widget.js`, `monitor-gpu/src/gpu_metrics_api.js`).
- **Mermaid** diagrams in documentation (rendered by GitHub / Markdown tooling; see `docs/architecture.md`).

## Thanks

Thanks to contributors and to the AbstractFramework community for shaping real-world requirements and feedback.

## Related docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
