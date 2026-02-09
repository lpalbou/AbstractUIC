# Security Policy

We take security seriously and appreciate responsible disclosure.

## Scope

This policy covers all packages in this repository (`ui-kit/`, `panel-chat/`, `monitor-flow/`, `monitor-active-memory/`, `monitor-gpu/`).

Examples of issues to report:
- Injection/XSS risks in text rendering (e.g. Markdown/JSON renderers in `panel-chat/src/markdown.tsx`, `monitor-flow/src/Markdown.tsx`)
- Token leakage, auth header mistakes, or unsafe cross-origin usage in `@abstractframework/monitor-gpu` (`monitor-gpu/src/gpu_metrics_api.js`)

## Reporting a vulnerability

Preferred: use GitHub’s private vulnerability reporting for this repository (Security → “Report a vulnerability”). This keeps the report private while we investigate and prepare a fix.

If private reporting is not available, contact the maintainer via GitHub and **avoid creating a public issue** for sensitive reports.

Please include:
- A clear description of the issue and potential impact
- Steps to reproduce (ideally a minimal PoC)
- Affected package(s) and version(s) (`*/package.json`)
- Any relevant logs, screenshots, or environment details

## Disclosure expectations

- Please do not publicly disclose the issue until we’ve had a chance to release a fix (or agree on a timeline).
- Do not include secrets (tokens, private URLs, internal hostnames) in reports.

## Security notes for users

- `@abstractframework/monitor-gpu` supports Bearer token auth. Avoid putting tokens in URLs and prefer HTTPS in production.
- See security notes in `monitor-gpu/README.md` and integration guidance in [`docs/getting-started.md`](./docs/getting-started.md).

## Related docs

- Getting started: [`docs/getting-started.md`](./docs/getting-started.md)
- API reference: [`docs/api.md`](./docs/api.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
