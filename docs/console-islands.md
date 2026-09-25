# Console Islands (`@abstractframework/ui-kit`)

The console islands let a page that is **not a React app** mount the kit's real React
components. They are built from `@abstractframework/ui-kit` sources into one self-contained
browser script that defines a small global API, `window.AfConsoleIslands`.

The AbstractGateway console (HTML served from Python) is the consumer: it uses the islands for
its top-right action cluster (connect/disconnect pill, appearance button, About button, extras),
its appearance dialog (theme, font scale, header density) and its About dialog, so the console renders the same
components as the React apps.

This page is a deep dive for the `ui-kit` package. For the package overview see
[`ui-kit/README.md`](../ui-kit/README.md); for how the islands fit among the other packages and
their consumers see [Architecture](./architecture.md).

## What the islands are (and are not)

- **A build output, not an npm export.** The bundle, `ui-kit/islands/dist/af-console-islands.js`,
  is produced from the repository and is not part of the published `@abstractframework/ui-kit`
  tarball. If you install the package from npm, you get the React components, `theme.css` and
  `palette_seeds.json`; build the islands from a checkout of this repository.
- **Self-contained.** The bundle is a minified IIFE that includes React 18 and React DOM. The page
  needs no module loader and no other script: load it with a plain `<script>` tag.
- **JavaScript only.** The bundle ships no CSS. The page must also load the kit stylesheet
  (`ui-kit/src/theme.css`), which styles the `af-topbar__*` cluster, the appearance dialog and
  every theme.
- **Prop-driven.** The host owns all state. Each mount returns a handle; call `update(props)`
  whenever your state changes. No React knowledge is needed on the host side.

Source files:

| File | Role |
| --- | --- |
| `ui-kit/islands/console_islands.tsx` | Entry point and API (`mountTopBar`, `mountAppearance`, `mountAbout`, `appIdentity`, `applyAppearance`) |
| `ui-kit/islands/tsconfig.json` | Type-check configuration for the entry (`noEmit`) |
| `ui-kit/scripts/build_islands.mjs` | esbuild bundler; writes `islands/dist/af-console-islands.js` |
| `ui-kit/scripts/check_islands.mjs` | Rebuilds the bundle and verifies it loads as a plain script |

## Build and check

From the repository root, install the workspace dependencies once (`npm install`; `esbuild` is a
`ui-kit` dev dependency), then:

```bash
# Build the bundle into ui-kit/islands/dist/af-console-islands.js
npm run build:islands -w @abstractframework/ui-kit

# Fail if the bundle on disk differs from a fresh build
node ui-kit/scripts/build_islands.mjs --check

# Rebuild, then load the bundle in a sandbox and verify its API
node ui-kit/scripts/check_islands.mjs
```

`npm test` in `ui-kit` (and therefore the root `npm test`) type-checks the islands entry
(`tsc -p islands/tsconfig.json`) and runs `check_islands.mjs`. The check verifies that:

- evaluating the bundle defines `AfConsoleIslands`;
- `mountTopBar`, `mountAppearance`, `mountAbout`, `appIdentity` and `applyAppearance` are
  functions, and `appIdentity` returns the gateway's identity and throws for an unknown id;
- `apiVersion` is `"1"` and `kitVersion` equals the `ui-kit` `package.json` version;
- `themes` has one entry per theme in `THEME_SPECS`;
- the bundle starts with the `/*! @abstractframework/ui-kit <version> console islands` banner.

## Loading the bundle

```html
<link rel="stylesheet" href="/static/theme.css" />
<div id="topbar"></div>
<div id="appearance"></div>
<script src="/static/af-console-islands.js"></script>
<script>
  const islands = window.AfConsoleIslands;
  console.log(islands.apiVersion, islands.kitVersion); // "1", e.g. "0.1.12"
</script>
```

Serve both files from your own origin; the paths above are examples.

## API reference (`apiVersion` "1")

`window.AfConsoleIslands` exposes:

| Member | Type | Description |
| --- | --- | --- |
| `apiVersion` | `"1"` | Islands API contract version |
| `kitVersion` | `string` | `ui-kit` version the bundle was built from |
| `themes` | `ThemeSpec[]` | The kit's theme list (`THEME_SPECS`) |
| `fontScales` | array | `FONT_SCALES` options |
| `headerDensities` | array | `HEADER_DENSITIES` options |
| `mountTopBar(el, props)` | `IslandHandle` | Mounts `AfTopBarActions` into `el` |
| `mountAppearance(el, props)` | `IslandHandle` | Mounts `AfAppearanceDialog` into `el` |
| `mountAbout(el, props)` | `IslandHandle` | Mounts `AfAboutDialog` into `el` (kit 0.1.12+) |
| `appIdentity(id, version)` | `AppIdentity` | Identity facts for an AbstractFramework app; throws for an unknown id (kit 0.1.12+) |
| `applyAppearance(settings)` | `void` | Applies a theme and typography settings to the document |

Every mount returns `{ update(props), unmount() }`. Mounting into a missing element throws
`AfConsoleIslands: mount target missing`.

### `mountTopBar(el, props)`

Renders the shared top-right cluster: assistant button, appearance button, extras, then the
connection pill (always rightmost).

```ts
type TopBarIslandProps = {
  assistant?: { open: boolean; onToggle: () => void; label?: string } | null; // omit/null hides it
  appearance?: { onOpen: () => void; label?: string } | null;                 // omit/null hides it
  about?: {                                                                   // omit/null hides it (kit 0.1.12+)
    identity: AppIdentity;               // from islands.appIdentity("abstractgateway", version)
    extraRows?: Array<[string, string]>; // e.g. package versions from GET /about
    onOpen?: () => void;                 // runs each time the About dialog opens
    label?: string;
  } | null;
  extras?: Array<{
    id: string;          // becomes the element id
    label: string;       // aria-label / tooltip
    icon?: IconName;     // defaults to "settings"
    text?: string;       // plain text instead of an icon button (e.g. the signed-in identity)
    hidden?: boolean;
    pressed?: boolean;   // sets aria-pressed and the active style
    onClick?: () => void;
  }>;
  connection: {
    phase: "loading" | "connected" | "disconnected";
    signingOut?: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
  };
};
```

A text extra renders as `<span class="af-topbar__identity">`: one line, secondary text color,
ellipsized past 24 characters.

### `mountAppearance(el, props)`

Renders the shared appearance dialog (theme, font scale, header density).

```ts
type AppearanceIslandProps = {
  open: boolean;
  value: { theme: string; font_scale: string; header_density: string };
  onChange: (next: { theme: string; font_scale: string; header_density: string }) => void;
  onClose: () => void;
  title?: string;
  note?: string;
};
```

The dialog does not persist anything: store `value` yourself, then call
`applyAppearance(next)` and `handle.update({ ...props, value: next })` from `onChange`.

### `mountAbout(el, props)`

Renders the shared About dialog: the application name and version, "Part of AbstractFramework",
author, copyright and licence, website, source, documentation, "Report an issue", "Give feedback"
and the contact e-mail, followed by your `extraRows`. Links open in a new tab.

```ts
type AboutIslandProps = {
  open: boolean;
  onClose: () => void;
  identity: AppIdentity;               // islands.appIdentity("abstractgateway", version)
  extraRows?: Array<[string, string]>; // e.g. [["abstractcore", "2.15.2"]]
  title?: string;                      // defaults to "About <app name>"
};
```

Use `mountAbout` when your About entry lives outside the top bar. When you pass `about` to
`mountTopBar`, the cluster renders the About button and owns the dialog itself, so you do not
need `mountAbout`.

### `appIdentity(id, version)`

Returns `{ id, name, version, website, repo, docs, issues, feedback }` for an AbstractFramework
application id (`"abstractgateway"`, `"abstractflow"`, …). It throws for an id the kit does not
know, so a typo fails loudly instead of rendering invented facts.

### `applyAppearance(settings)`

Applies the kit theme class to `<html>` (`applyTheme`, default `"dark"`) and the typography
settings (`applyTypography`). Accepts a partial `{ theme, font_scale, header_density }`.

## Example

```js
const islands = window.AfConsoleIslands;
let appearance = { theme: "dark", font_scale: "md", header_density: "standard" };
islands.applyAppearance(appearance);

let dialogProps;
const dialog = islands.mountAppearance(document.getElementById("appearance"), (dialogProps = {
  open: false,
  value: appearance,
  onClose: () => dialog.update((dialogProps = { ...dialogProps, open: false })),
  onChange: (next) => {
    appearance = next;
    islands.applyAppearance(next);
    dialog.update((dialogProps = { ...dialogProps, value: next }));
  },
}));

const topBar = islands.mountTopBar(document.getElementById("topbar"), {
  appearance: { onOpen: () => dialog.update((dialogProps = { ...dialogProps, open: true })) },
  extras: [{ id: "identity", label: "Signed in as alice", text: "alice" }],
  connection: { phase: "connected", onConnect: () => {}, onDisconnect: () => signOut() },
});

// Later, when the session state changes:
topBar.update({
  connection: { phase: "disconnected", onConnect: () => openSignIn(), onDisconnect: () => {} },
});
```

Use the values in `islands.fontScales` and `islands.headerDensities` for valid
`font_scale` / `header_density` ids.

## Versioning

- `apiVersion` changes only when the island API changes incompatibly; check it before mounting.
  Additive members keep the same `apiVersion` and are marked with the kit version that
  introduced them (for example `mountAbout`, kit 0.1.12); check `kitVersion` if you load a bundle
  you did not build yourself.
- `kitVersion` identifies the `ui-kit` release the bundle was built from. Rebuild the bundle
  after upgrading the kit sources; a consumer that vendors the bundle should rebuild and re-vendor
  it whenever any kit source that feeds it changes (`ui-kit/src/*`, `ui-kit/islands/*`,
  `ui-kit/scripts/build_islands.mjs`).

## Related docs

- [Architecture](./architecture.md): packages, consumers and the islands build path
- [API reference](./api.md): `AfTopBarActions`, `AfAppearanceDialog` and the theme helpers
- [Theming](./theming.md): theme tokens and the `theme.css` stylesheet the islands rely on
- [Troubleshooting](./troubleshooting.md): stale or missing islands bundle
- [`ui-kit/README.md`](../ui-kit/README.md): package overview and the `af-topbar` CSS API
