# AbstractUIC Documentation

AbstractUIC is a set of **UI packages** for AbstractFramework clients: React components, two
dependency-free Web Components (`<monitor-gpu>`, `<monitor-memory>`), a Node.js Gateway session
proxy, and the `ui-kit` console islands for pages that are not React apps.

AbstractUIC is part of the [AbstractFramework](https://github.com/lpalbou/AbstractFramework) ecosystem. It is the UI layer used by host apps that typically integrate with **AbstractRuntime** and **AbstractCore** (see the ecosystem overview in the root [`README.md`](../README.md) and the diagrams in [`architecture.md`](./architecture.md)).

## Start here

- **Getting started**: [`getting-started.md`](./getting-started.md) — install, required CSS imports, first examples, Next.js notes
- **API reference**: [`api.md`](./api.md) — export map per package
- **Architecture**: [`architecture.md`](./architecture.md) — package boundaries, consumers, data flow, the Gateway connection flow, live replies and the About/identity flow (with diagrams)
- **FAQ**: [`faq.md`](./faq.md) — recurring questions and limits
- **Troubleshooting**: [`troubleshooting.md`](./troubleshooting.md) — symptoms, checks and fixes

## Topic deep dives

- **Adoption guide**: [`adoption-guide.md`](./adoption-guide.md) — which shared component for which job, and the contracts apps follow
- **Theming & design tokens**: [`theming.md`](./theming.md) — token vocabulary, the 21 themes, migration rules for host apps
- **Console islands**: [`console-islands.md`](./console-islands.md) — the `window.AfConsoleIslands` bundle built from `ui-kit` for non-React pages (AbstractGateway console): API, build and check
- **Local development**: [`development.md`](./development.md) — workspace build, tests, contracts shared with other repositories, docs regeneration
- **Publishing (maintainers)**: [`publishing.md`](./publishing.md) — versioning, tag-driven release workflow, first publish of a new package
- Legacy stub (kept for old links): [`installation.md`](./installation.md) — points to Getting started

## Repo docs / policies

- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)
- Contributing: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- Security: [`SECURITY.md`](../SECURITY.md)
- Acknowledgments: [`ACKNOWLEDGMENTS.md`](../ACKNOWLEDGMENTS.md)
- Agent-oriented docs: [`llms.txt`](../llms.txt) (index) and [`llms-full.txt`](../llms-full.txt) (generated)
- License: [`LICENSE`](../LICENSE)

## Package docs

- UI tokens, themes, inputs, Gateway connection UI, top bar/drawer/appearance, About dialog and identity, console islands: [`ui-kit/README.md`](../ui-kit/README.md)
- Chat primitives (thread, composer, markdown/json renderers, assistant panel, workflow chat, live replies): [`panel-chat/README.md`](../panel-chat/README.md)
- App-origin Gateway session proxy: [`app-server/README.md`](../app-server/README.md)
- Agent-cycle trace viewer (LLM/tool/observe): [`monitor-flow/README.md`](../monitor-flow/README.md)
- KG + Active Memory explorer (ReactFlow): [`monitor-active-memory/README.md`](../monitor-active-memory/README.md)
- GPU widget (custom element + imperative API): [`monitor-gpu/README.md`](../monitor-gpu/README.md)
- Host memory widget (custom element + imperative API): [`monitor-memory/README.md`](../monitor-memory/README.md)
