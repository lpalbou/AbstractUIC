# Publishing (Maintainers)

Each folder is an npm package and can be published independently.

## Pre-flight

- Ensure README + docs links are correct (root `README.md` + per-package `README.md`).
- Ensure `repository` metadata points to this repo (`https://github.com/lpalbou/AbstractUIC`).
- Ensure peer dependency ranges are valid semver (avoid `workspace:*` in published metadata).
- Ensure `dist/` is produced (React packages build via `tsc`; see each package’s `prepublishOnly`).

## Suggested release steps

The tagged workflow does the publishing; these steps prepare the tag it needs.

1. Bump the version of each package that changed (packages are versioned
   independently; an unchanged package keeps its published version):
   `npm version <x.y.z> -w <package> --no-git-tag-version`. Then bump the private
   root `package.json` to the release version; the tag names the root version.
1. Bump the `@abstractframework/ui-kit` range in `panel-chat/package.json`
   (`peerDependencies` + `devDependencies`) — `npm version` does not touch it.
1. Promote the `## Unreleased` section of [`CHANGELOG.md`](../CHANGELOG.md) to
   `## <x.y.z> - <YYYY-MM-DD>`. The release workflow reads this exact heading to
   build the GitHub release notes, so the version and format must match.
1. Build packages (optional preflight): `npm run build`
1. Run package tests:
   - `npm test` (root; runs every workspace's tests)
1. Dry-run the package tarballs: `npm run pack:dry`
1. Commit, then push the commit **before** the tag so CI runs on it.
1. Tag and push: `git tag v<x.y.z> && git push origin v<x.y.z>`

Pushing a `v*` tag runs `release.yml`, which re-runs build/test/pack, verifies
the tag matches the root `package.json` version, publishes every package whose
version is not yet on npm (a version already on the registry is skipped), and
creates the GitHub release. A tag whose version does not match the committed root
`package.json` fails the `Validate tag version` step and publishes
nothing — retag the bumped commit rather than editing the tag's history.

`workflow_dispatch` runs the same job without the tag-version check and skips any
version already on the registry; it is the repair path for a partially completed
release.

To publish a single package by hand:

```bash
cd <package>
npm publish --access public --provenance
```

Notes:
- Scoped packages are private by default; `--access public` is required for public release.
- React packages publish compiled output from `dist/` and expose CSS as separate exports (see each package’s `exports`).
- npm trusted publishing should be configured for each package with repository `lpalbou/AbstractUIC`, workflow `release.yml`, and environment `npm`.
- Publish order is `ui-kit`, then `monitor-active-memory`, `monitor-flow`,
  `monitor-gpu`, `panel-chat`, then `app-server` and `monitor-memory`. The last two
  have no dependents in this repository, so they go last to keep a first-time
  bootstrap (below) off the critical path.

## Bootstrapping a brand-new package

npm trusted publishing cannot create a package name — configuring a trusted
publisher requires the package to already exist
([`npm trust` prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/),
[npm/cli#8544](https://github.com/npm/cli/issues/8544)). So the first publish of
a new package must be token-authenticated:

1. `npm login` (or export a granular access token with publish rights).
1. `cd <package> && npm publish --access public`
1. On npmjs.com, open the package's settings → Trusted Publisher and add
   repository `lpalbou/AbstractUIC`, workflow `release.yml`, environment `npm`.
   Configurations created after 2026-05-20 must explicitly allow an action, so
   select "publish" (`npm trust github <package> --repo lpalbou/AbstractUIC
   --file release.yml --env npm --allow-publish`).

For a package that does not exist on the registry yet, `release.yml` still
attempts the publish (so the registry's answer is in the log) and turns a refusal
into a warning instead of failing the release.

## Related docs

- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)
- Contributing: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- Getting started: [Getting started](./getting-started.md)
- Architecture: [Architecture](./architecture.md)
