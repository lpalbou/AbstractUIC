# @abstractframework/ui-kit

Shared theme tokens + small UI primitives used across AbstractUIC packages and host apps.

This package provides:

- **Theme tokens** (CSS variables + theme classes): `ui-kit/src/theme.css`
- **Theme + typography helpers**: `applyTheme(...)`, `applyTypography(...)`
- **Common inputs**: `AfSelect`, `ThemeSelect`, `ProviderModelSelect`, `ToolPolicyEditor`, etc.
- **Gateway session UI**: `GatewaySessionSignInCard` for the shared user/token browser-session sign-in form used by thin clients.
- **Icons**: `Icon` (used by `@abstractframework/panel-chat`)

## Install / peer dependencies

This is a React package with peer dependencies on `react@^18` and `react-dom@^18` (see `ui-kit/package.json`).

## Install

- Workspace: add a dependency on `@abstractframework/ui-kit`
- npm: `npm i @abstractframework/ui-kit`

## Usage

Import the theme tokens once in your app:

```ts
import "@abstractframework/ui-kit/theme.css";
```

Apply a theme at runtime (optional):

```ts
import { applyTheme } from "@abstractframework/ui-kit";

applyTheme("dark"); // sets a `theme-*` class on <html>
```

Use UI components:

```tsx
import { ThemeSelect, Icon, ToolPolicyEditor, GatewaySessionSignInCard } from "@abstractframework/ui-kit";
```

### Gateway session sign-in

`GatewaySessionSignInCard` renders the shared Gateway browser-session sign-in
card. Host apps own the network calls and session storage; the component only
collects Gateway URL (optional), user id, token, and remember-browser state, and
calls the callbacks you provide.

### Tool policy editor

`ToolPolicyEditor` renders the shared allowlist + approve/ask picker for gateway tools. It intentionally **does not** include a deny mode; tools are denied by removing them from the allowlist. Pass `toolMode` (and optional `toolModeLabel`/`toolModeDetail`) to surface the gateway tool execution mode in a prominent banner.

The default approve/ask classification is exposed as `TOOL_POLICY_DEFAULTS` (mirrors the AbstractRuntime `ToolApprovalPolicy` defaults).

## Exported API

See `ui-kit/src/index.ts` for the authoritative export list.

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Repo docs index: [`docs/README.md`](../docs/README.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)


## Gateway connection surface contract

Use `GatewayConnectModal` for connect/disconnect UX (pairs with
`@abstractframework/app-server`'s session proxy). The contract, per the
maintainer's 2026-07-12 ruling:

- It is a **centered modal** over a dimmed + blurred backdrop (the kit's
  `.af-connect-overlay` provides both) — never an inline settings block.
- The **Gateway URL is always visible** (the modal passes `showGatewayUrl`).
  If you embed `GatewaySessionSignInCard` inside your own modal, you must
  pass `showGatewayUrl` yourself.
- **Tokens never rest client-side**: the proxy exchanges the token for
  HttpOnly cookies. Do not add localStorage/bearer fallbacks in apps.
- **Auto-open on disconnect (maintainer ruling 2026-07-12)**: when the app
  RESOLVES disconnected, the connect modal IS the first screen — never a
  banner pointing at a Connect button. Never auto-open over the
  unknown/loading state or a live session; a later sign-out re-arms it.
  One knob per app: BLOCKING (no dismiss — apps with no offline surface,
  e.g. flow) vs DISMISSABLE once per signed-out episode (apps with a
  degraded-but-usable surface keep the banner/badge as re-entry, e.g.
  continuum). Both variants are live consumers of this contract.
- **Connected state flips on probe-ok, never on data (10-15s connect
  incident, 2026-07-13)**: the session probe (`/api/connection/gateway`,
  one upstream `/me` echo, sub-millisecond on localhost) is the ONLY gate
  for leaving "Connecting…". Data fetches (runs/bundles/tools/providers
  lists) fill their surfaces in AFTER the flip, in parallel — a slow list
  must degrade its own panel, never pin first paint. The measured whale
  was a serialized runs listing (2.2-7.9s) gating an app's connected
  state while every stack request answered in <1ms.
- **Probe once**: apps that probe at boot pass the result to the modal via
  `initialStatus` so opening it does not re-probe; the modal refreshes
  itself after sign-in/out (those change the answer).
