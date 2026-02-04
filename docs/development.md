# Development

This repo is intentionally lightweight: packages are meant to be edited in place and consumed by host applications.

## Repo layout

Each package is a folder at the repo root:

- `ui-kit/`
- `panel-chat/`
- `monitor-flow/`
- `monitor-active-memory/`
- `monitor-gpu/`

## Typical workflow (React packages)

1. Link the package into your host app via workspaces (pnpm/yarn/npm) or `file:` dependency.
2. Let the host bundler compile TS/TSX + CSS imports.
3. Validate behavior in the host app (HMR).

## Tests

Only `@abstractutils/monitor-gpu` currently has automated tests:

```bash
cd monitor-gpu
npm test
```

## Related docs

- Getting started: [`docs/getting-started.md`](./getting-started.md)
- Architecture: [`docs/architecture.md`](./architecture.md)
