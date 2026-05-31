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
