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
npm --workspace monitor-memory test
```

The React packages test with small Node scripts (`ui-kit/scripts/check_*.mjs`,
`panel-chat/scripts/check_*.mjs`), run in order by each package's `npm test`; the first failing
script names the problem. `app-server` and the Web Components have a `test/` folder.

### Shared contracts with other repositories

Some checks pin behavior that other AbstractFramework repositories share:

- `ui-kit/src/abstractframework_identity.json` is a byte-identical copy of
  `identity/abstractframework.json` in the AbstractFramework repository, which verifies every
  vendored copy. Update it by copying the file, never by editing it here.
- `ui-kit/scripts/fixtures/gateway_version_rows.json` holds the cases that
  `gatewayVersionRows` and its Python twin `abstractcore.utils.identity.gateway_version_rows`
  must both satisfy (`ui-kit/scripts/check_about.mjs` runs them). Change the helper, the fixture
  and the Python twin together.

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
