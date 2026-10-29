# Console Islands (`@abstractframework/ui-kit`)

The console islands let a page that is **not a React app** mount the kit's real React
components. They are built from `@abstractframework/ui-kit` sources into one self-contained
browser script that defines a small global API, `window.AfConsoleIslands`.

The AbstractGateway console (HTML served from Python) is the consumer: it uses the islands for
its top-right action cluster (connect/disconnect pill, appearance button, About button, extras),
its appearance dialog (theme, font scale, header density), its About dialog, the Docs assistant,
the Sandbox chat and the entity's model and voice pickers, so the console renders the same
components as the React apps. The bundle also carries the app shell's drawer system, the tool
editor and the whole voice section for console pages that adopt them.

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
| `ui-kit/islands/console_islands.tsx` | Entry point and API (`window.AfConsoleIslands`: every member of the [API reference](#api-reference-apiversion-2)) |
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
| `mountSandboxChat(el, props)` | `IslandHandle` | Mounts the Sandbox chat: panel-chat's thread and composer (`messages`, `draft`, `onDraftChange`, `onSend`, attachments, drop and paste) with voice through `useGatewayVoice` (kit 0.4.0) |
| `mountProviderModelPicker(el, props)` | `IslandHandle` | Mounts the kit `ProviderModelPicker` with its own props (kit 0.4.0; see [below](#mountprovidermodelpickerel-props-and-mountvoicesettingsel-props)) |
| `mountVoiceSettings(el, props)` | `IslandHandle` | Mounts the kit `VoiceSettings` voice picker; its props carry `voiceLibrary` and `previewVoice` (kit 0.4.0; library and sample 0.9.0) |
| `mountToolModeEditor(el, props)` | `IslandHandle` | Mounts the kit `ToolModeEditor` over a served `GET /api/gateway/discovery/tools` answer (kit 0.9.0; see [below](#mounttoolmodeeditorel-props)) |
| `mountDocsAssistant(el, props)` | `IslandHandle` | Mounts panel-chat's `DocsAssistantDrawer` (the same Docs assistant every app mounts; the console passes `source: {app: "gateway", name: "AbstractGateway"}` and its own `fetchGateway`); keep it mounted while closed (kit 0.8.0, round 8) |
| `islandConnectionStatus(connection)` | `GatewayConnectionState \| null` | The status the top bar's identity reads: `connection.status`, else the console's `me` body on this origin; null unless `phase` is `"connected"` (kit 0.9.0, backlog 0036) |
| `mountDrawerSystem(el, props)` | `IslandHandle` | Mounts the kit `AfDrawerSystem`; each panel's content is a host element (`element`) moved into the panel and kept alive (kit 0.9.0, backlog 0036) |
| `bindMenu(button, menu, options?)` | `() => void` | Makes a plain-HTML button open an `.af-menu__list` (menu-button semantics, arrow keys, Escape and outside press close, focus return, flips at the viewport edge); returns `release()` (kit 0.4.0; [modal.md](./modal.md)) |
| `bindModal(backdrop, options)` | `() => void` | Makes a plain-HTML `.af-modal-backdrop` modal (focus in, Tab trap, focus return, Escape / backdrop click call `options.onClose`, page scroll lock); returns `release()` (kit 0.4.0+) |
| `mountWorkspaceChooser(el, props)` | `IslandHandle` | Mounts the kit `WorkspaceChooser` (`level`, `state`, `save`): the console's **Eligible workspaces** modal (`level: "gateway"`) and each account's Workspaces modal (`level: "account"`) (kit 0.8.3, round 11) |
| `mountVoiceSection(el, props)` | `IslandHandle` | Mounts the kit `AfVoiceSection` (the whole voice settings: Engines, Output, Microphone, Replies) with the component's own props (`fetchCatalog`, `fetchDefaults`, `voiceLibrary`, `fetchLanguages`, `previewVoice`, `rows`, …) (kit 0.9.0, backlog 0035) |
| `mountTimeZonePicker(el, props)` | `IslandHandle` | Mounts the kit `AfTimeZonePicker` (`block` = the preferences answer's `time_zone`, `id`, `onChange(zone \| null)`, `disabled`, `note`): the time zone row of the console's Accounts → Preferences modal (kit 0.8.7, round 16) |
| `mountCloudProviderCards(el, props)` | `IslandHandle` | Mounts the kit `CloudProviderCards`: one card per cloud provider AbstractCore supports natively (`GET discovery/providers`, `local_provider: false`), then OVH AI Endpoints (an OpenAI-compatible preset) and "Other OpenAI-compatible endpoint" (Name, Base URL, API key). ONE action per card, **Connect** (**Reconnect** when it has a connection): the key is checked and, only when it works, saved as a NEW connection (`create_only`): "Connected · 48 models" or the reason. Props: `request(path, {method, body})`, `base` (the console passes its absolute API prefix), `scope`, `onSaved(saved)`, `refreshKey`, `heading` (kit 0.9.9; Connect, presets and the generic card: kit 0.9.10) |
| `cloudProviders` | `object` | The cards' logic for a host's own key flow: `client(request, base)` (`listProviders`, `listCards`, `listConnections`, `checkKey`, `saveCheckedKey`, `connect`), `keyCheckResult`, `freshConnectionId`, `text` (kit 0.9.9; `listCards`/`connect`: 0.9.10) |
| `brandMarks` | `object` | Engines' and providers' official marks: `html(id, name?)` (inline `<span class="af-brand-mark">` with the SVG, or the documented text badge), `info(id)`, `cardIds` (kit 0.9.9; [icons.md](./icons.md#brand-marks)) |
| `workspaceChooserText` | `object` | The WorkspaceChooser's wording table (`WORKSPACE_CHOOSER_TEXT`), e.g. the modal title `gatewayTitle` "Eligible workspaces" (kit 0.8.3) |
| `workspaceAsState(answer, level)` | `object` | Turns a `GET/PUT /workspace/policy[/{account}]` answer into the chooser's `state`; throws on an older answer (kit 0.8.3) |
| `bindTooltips(root?, options?)` | `() => void` | The kit tooltip on every `[data-af-tip]` element under `root` (default the document): 150 ms delay, keyboard focus, hoverable, Escape hides, kept inside the viewport; delegated, bind once; returns `release()` (kit 0.8.x, round 9; [modal.md](./modal.md#tooltip)) |
| `filterBarFacetsHtml(facets, trailing?)` | `string` | The filter bar's facet rows as HTML: the same chips and rows `AfFilterBar` renders, escaped ([filter-bar.md](./filter-bar.md); kit after 0.9.8) |
| `filterBarScopeHtml(scope)` / `filterBarScopeButtonsHtml(options, value)` | `string` | The filter bar's scope switch ("Catalog \| Hugging Face"), whole or its buttons (kit after 0.9.8) |
| `appIdentity(id, version)` | `AppIdentity` | Identity facts for an AbstractFramework app; throws for an unknown id (kit 0.1.12+) |
| `aboutVersionsFromGateway(payload, error?)` | `AfAboutVersions` | The About card's framework and gateway versions from a `GET /api/gateway/about` body, or `(null, reason)` after a failed request (kit 0.8.0+) |
| `applyAppearance(settings)` | `void` | Applies a theme and typography settings to the document |

Every mount returns `{ update(props), unmount() }`. Mounting into a missing element throws
`AfConsoleIslands: mount target missing`.

### `mountTopBar(el, props)`

Renders the shared top-right cluster in the kit's enforced order: extras · docs · assistant ·
appearance · about · account (always rightmost). Signed in with `identity` on, the account is ONE
button (person icon, name, connection light) whose menu holds Signed in as / Gateway / Copy user
id / Disconnect; otherwise (connecting, signed out, `identity` off) the connection pill holds that
place. The four pieces every app shares (docs, appearance, About, account) are the kit's: change
one in the kit and every app and the console change with it (operator ruling 2026-10-29).

```ts
type TopBarIslandProps = {
  docs?: { open: boolean; onToggle: () => void; label?: string } | null;      // the Docs assistant (book icon)
  assistant?: { open: boolean; onToggle: () => void; label?: string } | null; // omit/null hides it
  appearance?: { onOpen: () => void; label?: string } | null;                 // omit/null hides it
  about?: {                                                                   // omit/null hides it (kit 0.1.12+)
    identity: AppIdentity;               // from islands.appIdentity("abstractgateway", version)
    versions?: AfAboutVersions;          // framework + gateway versions (apiVersion "2")
    onOpen?: () => void;                 // runs each time the About dialog opens
    label?: string;
    extra?: HTMLElement | null;          // a page-owned element shown under the links (see below)
  } | null;
  extras?: Array<{
    id: string;          // becomes the element id
    label: string;       // aria-label / tooltip
    icon?: IconName;     // defaults to "settings"
    text?: string;       // plain text instead of an icon button (kept for compatibility; use `identity`)
    hidden?: boolean;
    pressed?: boolean;   // sets aria-pressed and the active style
    onClick?: () => void;
  }>;
  // Who is signed in, left of the pill (shell, backlog 0036): "badge" = icon + "<user>"
  // ("<tenant>/<user>" when the tenant is not "default"); "menu" = the same, opening
  // "Signed in as … / Gateway <host>", Copy user id, Disconnect (= onDisconnect).
  // Rendered only while phase is "connected" (islandConnectionStatus).
  identity?: "badge" | "menu" | null;
  connection: {
    phase: "loading" | "connected" | "disconnected";
    signingOut?: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    status?: GatewayConnectionState | null; // an app behind app-server: the connection probe's body
    signOutError?: string | null;           // shown as "Disconnect failed" beside the pill
    me?: { ok?: boolean; principal?: {...}; auth?: {...}; routing?: {...} } | null; // the console: its own GET /api/gateway/me body
  };
};
```

The console replaces its `extras: [{ id: "island-identity", text: "<tenant>/<user>" }]` with
`identity: "menu"` and `connection.me: <the /api/gateway/me body it already holds>`; the identity is
read from `me.principal` (no display name, e-mail or avatar: the gateway serves none).

A text extra renders as `<span class="af-topbar__identity">`: one line, secondary text color,
ellipsized past 24 characters.

### `mountDocsAssistant(el, props)`

Mounts panel-chat's `DocsAssistantDrawer` (`open`, `onClose`, `source: {app, name}`,
`fetchGateway`, `connected`, `suggestions?`, `placeholder?`, `width?`, `topOffset?` (a number or
`"auto"` = under the top bar), `className?`). Grounding is the gateway's corpus
(`GET api/gateway/docs/corpus?app=gateway` for the console). Keep it mounted with `open: false`
so the conversation survives closing.

### `mountDrawerSystem(el, props)`

Mounts the kit `AfDrawerSystem` (see [API](./api.md)). Panels are `{id, label, icon, element,
side?, mode?, keepAlive?, errorBoundary?, fill?, badge?, hint?, minWidth?, maxWidth?,
defaultWidth?}`: `element` is a DOM element the page owns, moved (never cloned) into the panel
body. `main?` is the element between the sides (required with left panels). The host owns
`active` and calls `handle.update({...props, active})` from `onActiveChange(id, side)`.

```js
const props = {
  panels: [{ id: "jobs", label: "Jobs", icon: "activity", element: document.getElementById("jobs-pane") }],
  active: null,
  onActiveChange: (id) => { props.active = id; handle.update({ ...props }); },
  ariaLabel: "Console panels",
  storageKey: "abstractgateway.console.drawers.v1",
};
const handle = islands.mountDrawerSystem(document.getElementById("af-drawers-root"), props);
```

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
  extra?: HTMLElement | null; // a page-owned element shown under the links (see below)
};
```

`extra` (on `mountAbout` and on `mountTopBar`'s `about`; additive, apiVersion stays `"2"`) carries
host content into the kit dialog, such as the console's "Check for updates / Update / Restart"
section. The island moves the element (never a clone) into the dialog while it is open and puts it
back where it was (same parent, same position) when the dialog closes, so the page's own script can
still find it by id and update it while the dialog is closed. Keep it in a hidden container of the
page. Rule and check: `hostElementInto` / `hostElementEffect` in `islands/console_islands.tsx`,
`scripts/check_top_bar_set.mjs`.

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
console's entity Manage, Mind & voice tab uses both. The voice picker's props include
`voiceLibrary` (create, list, rename, delete and share the gateway's voices: **Manage voices**)
and `previewVoice` (choosing a voice plays it; a play/stop toggle beside the voice select, kit 0.9.1); `mountVoiceSection(el, props)` mounts the whole
`AfVoiceSection` the same way (kit 0.9.0).

The picker also takes the props added by backlog 0034 (`fetchGatewayDefault`, `reasoningLadder`,
`unknownReasoning`, `layout: "compact"`, `pinned`); see [API](./api.md). The console's Defaults
modal and Sandbox selects (hardcoded reasoning and MTP ladders) can move onto it with a
`reasoningLadder` read from `GET /api/gateway/discovery/capabilities`.

### `mountToolModeEditor(el, props)`

The kit's tool editor (`ToolModeEditor`: Off / Ask / Auto per tool, grouped by toolset) for
plain-HTML hosts, with the component's props. `catalog` takes the served
`GET /api/gateway/discovery/tools` answer as is (the island renders `ToolModeEditorForPayload`:
the kit's `normalizeToolCatalog`, the answer's `catalog_warnings` shown, and "Tools unavailable: …"
in place for a broken or failed answer, never a throw) or already-normalized items.
The host keeps `value` (the layer's sparse diffs) and calls `update(props)` after each `onChange`.
It is meant for a console page over the gateway's tool settings.

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
