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
| `ui-kit/islands/console_islands.tsx` | Entry point and API (`mountTopBar`, `mountAppearance`, `mountAbout`, `bindModal`, `appIdentity`, `applyAppearance`) |
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
- `mountTopBar`, `mountAppearance`, `mountAbout`, `bindModal`, `appIdentity` and `applyAppearance` are
  functions, and `appIdentity` returns the gateway's identity and throws for an unknown id;
- `apiVersion` is `"2"` and `kitVersion` equals the `ui-kit` `package.json` version;
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
  console.log(islands.apiVersion, islands.kitVersion); // "2", e.g. "0.8.0"
</script>
```

Serve both files from your own origin; the paths above are examples.

## API reference (`apiVersion` "2")

`window.AfConsoleIslands` exposes:

| Member | Type | Description |
| --- | --- | --- |
| `apiVersion` | `"2"` | Islands API contract version |
| `kitVersion` | `string` | `ui-kit` version the bundle was built from |
| `themes` | `ThemeSpec[]` | The kit's theme list (`THEME_SPECS`) |
| `fontScales` | array | `FONT_SCALES` options |
| `headerDensities` | array | `HEADER_DENSITIES` options |
| `mountTopBar(el, props)` | `IslandHandle` | Mounts `AfTopBarActions` into `el` |
| `mountAppearance(el, props)` | `IslandHandle` | Mounts `AfAppearanceDialog` into `el` |
| `mountAbout(el, props)` | `IslandHandle` | Mounts `AfAboutDialog` into `el` (kit 0.1.12+) |
| `bindModal(backdrop, options)` | `() => void` | Makes a plain-HTML `.af-modal-backdrop` modal (focus in, Tab trap, focus return, Escape / backdrop click call `options.onClose`, page scroll lock); returns `release()` (kit 0.4.0+) |
| `mountWorkspaceChooser(el, props)` | `IslandHandle` | Mounts the kit `WorkspaceChooser` (`level`, `state`, `save`): the console's **Eligible workspaces** modal (`level: "gateway"`) and each account's Workspaces modal (`level: "account"`) (kit 0.8.2, round 11) |
| `workspaceChooserText` | `object` | The WorkspaceChooser's wording table (`WORKSPACE_CHOOSER_TEXT`), e.g. the modal title `gatewayTitle` "Eligible workspaces" (kit 0.8.2) |
| `workspaceAsState(answer, level)` | `object` | Turns a `GET/PUT /workspace/policy[/{account}]` answer into the chooser's `state`; throws on an older answer (kit 0.8.2) |
| `bindTooltips(root?, options?)` | `() => void` | The kit tooltip on every `[data-af-tip]` element under `root` (default the document): 150 ms delay, keyboard focus, hoverable, Escape hides, kept inside the viewport; delegated, bind once; returns `release()` (kit 0.8.x, round 9; [modal.md](./modal.md#tooltip)) |
| `appIdentity(id, version)` | `AppIdentity` | Identity facts for an AbstractFramework app; throws for an unknown id (kit 0.1.12+) |
| `aboutVersionsFromGateway(payload, error?)` | `AfAboutVersions` | The About card's framework and gateway versions from a `GET /api/gateway/about` body, or `(null, reason)` after a failed request (kit 0.8.0+) |
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
    versions?: AfAboutVersions;          // framework + gateway versions (apiVersion "2")
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

Renders the shared compact About card in a modal dialog: the application name and version, the
AbstractFramework and AbstractGateway versions, one row of links (Website, Source, Docs, Issues,
Feedback, and Contact as a mailto) and the copyright and licence line. It never lists packages.
Links open in a new tab; Escape, the Close button or a click outside closes it.

```ts
type AfAboutVersions = {
  framework?: string | null; // AbstractFramework version
  frameworkNote?: string;    // shown when framework is missing, e.g. "not installed on the gateway host"
  gateway?: string | null;   // AbstractGateway version
  gatewayNote?: string;      // shown when gateway is missing, e.g. "unavailable (HTTP 503)"
};

type AboutIslandProps = {
  open: boolean;
  onClose: () => void;
  identity: AppIdentity;      // islands.appIdentity("abstractgateway", version)
  versions?: AfAboutVersions; // or islands.aboutVersionsFromGateway(body)
};
```

A missing version shows its note, otherwise "not reported" (framework) or "not connected"
(gateway).

Use `mountAbout` when your About entry lives outside the top bar. When you pass `about` to
`mountTopBar`, the cluster renders the About button and owns the dialog itself, so you do not
need `mountAbout`.

### `mountProviderModelPicker(el, props)` and `mountVoiceSettings(el, props)`

The kit's shared provider + model picker (`ProviderModelPicker`: "Gateway default" | Custom,
reasoning, MTP) and voice picker (`VoiceSettings`) for plain-HTML hosts, with the components' own
props. Transports are injected: `fetchProviders()`, `fetchModels(provider)` and
`fetchModelCapabilities(model, provider)` for the picker, `fetchCatalog(provider, model)` for the
voice picker. The host keeps the value and calls `update(props)` after each change. The gateway
console's entity Manage, Mind & voice tab uses both.

### `bindModal(backdrop, options)`

Gives your own modal markup (the `af-modal` classes of `theme.css`) the kit's modal behaviour. It
does not render anything: show the backdrop, bind, and call the returned `release()` before you
hide it again.

```ts
type BindModalOptions = {
  onClose: () => void;           // Escape or a click on the backdrop
  closeOnEscape?: boolean;       // default true
  closeOnBackdrop?: boolean;     // default true
  initialFocus?: HTMLElement | null;
};
```

Markup and a complete example: [Modal, account rows, grouped navigation](./modal.md).

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
- `apiVersion` `"2"` (kit 0.8.0): the About props (`mountAbout`, and `about` on `mountTopBar`)
  take `versions` (`AfAboutVersions`) instead of `extraRows`. A host written for `"1"` that still
  passes `extraRows` must switch to `versions`; `extraRows` is not rendered.
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
