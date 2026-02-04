# @abstractuic/ui-kit

Shared theme tokens + small UI primitives used across AbstractUIC packages and host apps.

This package provides:

- **Theme tokens** (CSS variables + theme classes): `ui-kit/src/theme.css`
- **Theme + typography helpers**: `applyTheme(...)`, `applyTypography(...)`
- **Common inputs**: `AfSelect`, `ThemeSelect`, `ProviderModelSelect`, etc.
- **Icons**: `Icon` (used by `@abstractuic/panel-chat`)

## Install / peer dependencies

This is a React package with peer dependencies on `react@^18` and `react-dom@^18` (see `ui-kit/package.json`).

## Install

- Workspace: add a dependency on `@abstractuic/ui-kit`
- npm (once published): `npm i @abstractuic/ui-kit`

## Usage

Import the theme tokens once in your app:

```ts
import "@abstractuic/ui-kit/src/theme.css";
```

Apply a theme at runtime (optional):

```ts
import { applyTheme } from "@abstractuic/ui-kit";

applyTheme("dark"); // sets a `theme-*` class on <html>
```

Use UI components:

```tsx
import { ThemeSelect, Icon } from "@abstractuic/ui-kit";
```

## Exported API

See `ui-kit/src/index.ts` for the authoritative export list.

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- Repo docs index: [`docs/README.md`](../docs/README.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
