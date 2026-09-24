# Development

This repo is intentionally lightweight. Most React packages build with `tsc` into `dist/` (see `*/package.json` scripts).

## Repo layout

Each package is a folder at the repo root:

- `ui-kit/` (also holds the console islands sources in `ui-kit/islands/`)
- `panel-chat/`
- `app-server/`
- `monitor-flow/`
- `monitor-active-memory/`
- `monitor-gpu/`
- `monitor-memory/`

## Typical workflow (React packages)

1. Install workspace deps at the repo root (workspaces): `npm install`
2. Build the package(s) you’re editing:
   - one-off: `cd <package> && npm run build`
   - watch: `cd <package> && npm run build -- --watch`
3. Consume the package from your host app (workspace link / file dependency / published package) and validate behavior.

## Console islands

The `ui-kit` console islands bundle is built separately from the package build:

```bash
npm run build:islands -w @abstractframework/ui-kit
node ui-kit/scripts/check_islands.mjs
```

The output (`ui-kit/islands/dist/`) is ignored by git and excluded from the npm tarball. See
[Console islands](./console-islands.md).

## Tests

Run every workspace's test rig from the repo root:

```bash
npm test
```

Or a single package's, e.g.:

```bash
cd monitor-memory
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
- Troubleshooting: [Troubleshooting](./troubleshooting.md)
- Docs index: [Docs index](./README.md)
