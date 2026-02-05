# Publishing (Maintainers)

Each folder is an npm package and can be published independently.

## Pre-flight

- Ensure README + docs links are correct (root `README.md` + per-package `README.md`).
- Ensure `repository` metadata points to this repo (`https://github.com/lpalbou/AbstractUIC`).
- Ensure peer dependency ranges are valid semver (avoid `workspace:*` in published metadata).
- Ensure `dist/` is produced (React packages build via `tsc`; see each package’s `prepublishOnly`).

## Suggested release steps

1. Bump versions in each `*/package.json` you plan to publish (this repo currently keeps versions in sync).
1. Update [`CHANGELOG.md`](../CHANGELOG.md) with what changed.
1. Install workspace deps at repo root: `npm install`
1. Build packages (optional preflight): `npm run build`
1. Run package tests:
   - `cd monitor-gpu && npm test`
1. Dry-run the package tarball (optional): `npm pack` inside each package.
1. Publish from the package directory:

```bash
cd <package>
npm publish --access public
```

Notes:
- Scoped packages are private by default; `--access public` is required for public release.
- React packages publish compiled output from `dist/` and expose CSS as separate exports (see each package’s `exports`).

## Related docs

- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)
- Contributing: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- Getting started: [Getting started](./getting-started.md)
- Architecture: [Architecture](./architecture.md)
