# Development

This repo is intentionally lightweight. Most React packages build with `tsc` into `dist/` (see `*/package.json` scripts).

## Repo layout

Each package is a folder at the repo root:

- `ui-kit/`
- `panel-chat/`
- `monitor-flow/`
- `monitor-active-memory/`
- `monitor-gpu/`

## Typical workflow (React packages)

1. Install workspace deps at the repo root (workspaces): `npm install`
2. Build the package(s) you’re editing:
   - one-off: `cd <package> && npm run build`
   - watch: `cd <package> && npm run build -- --watch`
3. Consume the package from your host app (workspace link / file dependency / published package) and validate behavior.

## Tests

Only `@abstractframework/monitor-gpu` currently has automated tests:

```bash
cd monitor-gpu
npm test
```

## Docs (when you change behavior)

- Keep docs anchored to the code (exports in `*/src/index.*`, contracts in `src/`).
- If you changed documentation, regenerate `llms-full.txt`:

```bash
python scripts/generate-llms-full.py
```

## Related docs

- Contributing: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- Getting started: [Getting started](./getting-started.md)
- Architecture: [Architecture](./architecture.md)
- Docs index: [Docs index](./README.md)
