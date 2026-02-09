# Contributing

Thanks for helping improve AbstractUIC.

AbstractUIC is a **multi-package repo**: each top-level folder is an npm package. The code is the source of truth; docs should stay anchored to exports and contracts in `src/`.

This repo is part of the [AbstractFramework](https://github.com/lpalbou/AbstractFramework) ecosystem (see also: AbstractCore https://github.com/lpalbou/abstractcore and AbstractRuntime https://github.com/lpalbou/abstractruntime). Keep public contracts host-driven and avoid coupling packages to specific host implementations.

## Quick start

Requirements:
- Node.js `>=18` (see `engines` in each package)
- npm (workspaces are used at the repo root)

```bash
npm install
```

Build all packages that provide a build script:

```bash
npm run build
```

Run tests (only `@abstractframework/monitor-gpu` currently has automated tests):

```bash
npm test
```

## Development workflow

Most React packages build with `tsc` into `dist/`:
- One-off: `cd <package> && npm run build`
- Watch: `cd <package> && npm run build -- --watch`

See [`docs/development.md`](./docs/development.md).

## Documentation expectations

Documentation entrypoints:
- Root overview: [`README.md`](./README.md)
- Next step: [`docs/getting-started.md`](./docs/getting-started.md)

When changing docs:
- Keep language concise and user-facing.
- Prefer “source-of-truth” references like `*/src/index.ts`, `*/src/types.ts`, or the relevant implementation file.
- Ensure cross-links remain correct (docs should reference other relevant docs).
- If you change public exports, update `docs/api.md` and the relevant package `README.md`.

LLM docs:
- `llms.txt` is a short index for agents.
- `llms-full.txt` is generated. Update it after doc changes:

```bash
python scripts/generate-llms-full.py
```

## Making changes

1. Create a branch and keep PRs focused.
2. Update or add docs when you change runtime behavior or public exports.
3. Verify:
   - `npm run build`
   - `npm test`
4. If you bump versions, also update [`CHANGELOG.md`](./CHANGELOG.md).

## Related docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Architecture (diagrams): [`docs/architecture.md`](./docs/architecture.md)
- Publishing (maintainers): [`docs/publishing.md`](./docs/publishing.md)
- Security policy: [`SECURITY.md`](./SECURITY.md)
