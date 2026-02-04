# Publishing (Maintainers)

Each folder is an npm package and can be published independently.

## Pre-flight

- Ensure README + docs links are correct (root `README.md` + per-package `README.md`).
- Ensure `repository` metadata points to this repo (`https://github.com/lpalbou/AbstractUIC`).
- Ensure peer dependency ranges are valid semver (avoid `workspace:*` in published metadata).

## Suggested release steps

1. Bump versions in each `*/package.json` you plan to publish.
2. Run package tests:
   - `cd monitor-gpu && npm test`
3. Dry-run the package tarball (optional): `npm pack` inside each package.
4. Publish from the package directory:

```bash
cd <package>
npm publish --access public
```

Notes:
- Scoped packages are private by default; `--access public` is required for public release.
- React packages currently ship TS/TSX source (`exports -> ./src/index.ts`). If you need wider compatibility (Node/SSR without transpilation), add a build step before publishing.

## Related docs

- Getting started: [`docs/getting-started.md`](./getting-started.md)
- Architecture: [`docs/architecture.md`](./architecture.md)
