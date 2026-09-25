# @abstractframework/ui-kit

Shared theme tokens and UI components for AbstractFramework apps. The kit owns the theme system
used by every AbstractFramework UI and the shared app chrome (connection surface, top-right
action cluster, drawer, appearance dialog).

This package provides:

- **Theme tokens** (CSS variables + 21 theme classes): `@abstractframework/ui-kit/theme.css`
- **Theme + typography helpers**: `applyTheme(...)`, `applyTypography(...)`, `THEME_SPECS`
- **Common inputs**: `AfSelect`, `ThemeSelect`, `ProviderModelSelect`, `ProviderModelPicker`,
  `SpeculationSelect`, `ToolPolicyEditor`, `VoiceSettings`
- **Gateway connection UI**: `GatewayConnectModal`, `useGatewayConnection()`,
  `GatewaySessionSignInCard`
- **App chrome**: `AfTopBarActions`, `AfDrawer`, `AfAppearanceDialog` + `useAppearanceSettings()`,
  `AfAboutDialog`
- **Identity**: `appIdentity(id, version)`, `frameworkIdentity()`, `aboutRows(...)` — the
  AbstractFramework facts every About screen shows
- **Run and policy surfaces**: `PhaseCapabilityMatrix`, `CriticalActionDialog`, `SteerComposer`,
  `DisclosureList`, `AfChip`, `AfPhaseRadio`, cognition gauges
- **Voice**: `useGatewayVoice()` (streaming TTS + push-to-talk)
- **Icons**: `Icon` (used by `@abstractframework/panel-chat`)
- **Palette seeds**: `@abstractframework/ui-kit/palette_seeds.json` for non-CSS consumers
- **Console islands** (repository build, not in the npm package): the kit components as one
  script for pages that are not React apps — see [Console islands](#console-islands)

## Install

- npm: `npm i @abstractframework/ui-kit`
- Workspace: add a dependency on `@abstractframework/ui-kit`

Peer dependencies: `react@^18` and `react-dom@^18`.

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
import { ThemeSelect, Icon, ToolPolicyEditor, GatewayConnectModal } from "@abstractframework/ui-kit";
```

The authoritative export list is `ui-kit/src/index.ts`; the grouped map is in the
[API reference](../docs/api.md#abstractframeworkui-kit).

### Gateway session sign-in

`GatewaySessionSignInCard` renders the shared Gateway browser-session sign-in card. Host apps
own the network calls and session storage; the component only collects the Gateway URL
(optional), user id, token and remember-browser state, and calls the callbacks you provide.
Most apps use it through `GatewayConnectModal` (below).

### Tool policy editor

`ToolPolicyEditor` renders the shared allowlist + approve/ask picker for gateway tools. It has no
deny mode: a tool is denied by removing it from the allowlist. Pass `toolMode` (and optional
`toolModeLabel` / `toolModeDetail`) to surface the gateway tool execution mode in a banner.

The default approve/ask classification is exposed as `TOOL_POLICY_DEFAULTS` (mirrors the
AbstractRuntime `ToolApprovalPolicy` defaults).

### Native MTP control

`SpeculationSelect` is the shared inheritance / Off / depth selector. Pass the execution host's
complete model-capability payload as `capabilities`; only depths advertised under
`execution.speculation.supported_depths` are offered. Missing capability data is shown as
unknown, not guessed from a model name. Saved unavailable selections remain visible.

`ProviderModelPicker` includes this control when `enableSpeculation` is true; supply its usual
provider-aware capability transport. The `speculation` value is absent for inheritance, `false`
for Off, or a native-MTP object with `require_acceleration: true` for an explicit depth. Apps own
preference storage and omit inherited values from requests. Neither component loads models or
downloads heads.

## Gateway connection surface contract

Use `GatewayConnectModal` for connect/disconnect UX. It pairs with the session proxy in
`@abstractframework/app-server`.

- It is a **centered modal** over a dimmed, blurred backdrop (the kit's `.af-connect-overlay`
  provides both), never an inline settings block.
- The **Gateway URL is always visible** (the modal passes `showGatewayUrl`). If you embed
  `GatewaySessionSignInCard` inside your own modal, pass `showGatewayUrl` yourself.
- **Tokens never rest client-side**: the proxy exchanges the token for HttpOnly cookies. Do not
  add localStorage or bearer-token fallbacks in apps.
- **Auto-open on a resolved disconnect**: when the app resolves as disconnected, the connect
  modal is the first screen. It never auto-opens over the loading state or a live session; a
  later sign-out re-arms it. Choose one variant per app: `blocking` (no dismiss; apps with no
  offline surface) or `dismissable` (dismissable once per signed-out episode; apps with a
  degraded-but-usable surface keep a banner or badge as re-entry).
- **Connected follows the session probe, not data**: the session probe
  (`/api/connection/gateway`) is the only gate for leaving "Connecting…". Data fetches fill their
  panels in after the flip, in parallel, so a slow list degrades its own panel rather than first
  paint.
- **Probe once**: apps that probe at boot pass the result to the modal via `initialStatus` so
  opening it does not re-probe; the modal refreshes itself after sign-in or sign-out.
- **Use the hook**: `useGatewayConnection({ appName, variant: "blocking" | "dismissable" })` owns
  the whole state machine (probe once at boot, auto-open only on a resolved disconnect, close on
  sign-in success, stay open on sign-out, re-arm per signed-out episode). Spread its
  `modalProps` into `GatewayConnectModal` rather than re-implementing the machine.
- **Mid-session losses do not auto-open** under `dismissable`: only boot-resolved disconnects and
  sign-out episodes open the modal. A live session that drops mid-use (expiry, gateway restart, a
  transient probe failure) surfaces through the pill or badge. Opt into auto-opening with
  `autoOpenMidSession: true`. `blocking` apps always auto-open.

## Unified top-right corner

Every app renders the same upper-right cluster: assistant button → appearance button → About
button → app extras → connection pill, always rightmost.

```tsx
const conn = useGatewayConnection({ appName: "My App", variant: "dismissable" });
const [appearance, setAppearance] = useAppearanceSettings("my-app", { legacyKey: "myapp_ui_v1" });

<AfTopBarActions
  assistant={{ open: drawerOpen, onToggle: () => setDrawerOpen((v) => !v) }}
  appearance={{ onOpen: () => setAppearanceOpen(true) }}
  about={{ identity: appIdentity("abstractflow", APP_VERSION) }}
  connection={{ phase: conn.phase, signingOut: conn.signingOut,
                onConnect: conn.openModal, onDisconnect: () => void conn.signOut() }}
/>
<AfDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Assistant" title="Assistant">
  <AssistantPanel ask={myTransport} blockedNotice={conn.connected ? undefined : "Connect to use the assistant."} />
</AfDrawer>
<AfAppearanceDialog open={appearanceOpen} onClose={() => setAppearanceOpen(false)}
                    value={appearance} onChange={setAppearance} />
<GatewayConnectModal {...conn.modalProps} />
```

Rules:

- The connection pill renders the hook's `phase` (`loading` | `connected` | `disconnected`),
  never a boolean. `signingOut` / `signOutError` are the in-flight and error channels.
- `AfDrawer` is non-modal and keeps its children mounted when closed (`display:none` + `inert`),
  so drawers can host long-running work. ESC handling respects `defaultPrevented`; the connect
  modal sits above drawers (z-order tokens `--z-drawer` < `--z-connect-modal` < `--z-popover`).
- `AssistantPanel` (in `@abstractframework/panel-chat`) never fetches: the
  `ask(question, { signal, history })` transport is injected and may return a Promise or an
  AsyncIterable of deltas.
- Appearance persistence is per app via `useAppearanceSettings(appId)` (key
  `af_appearance_<appId>_v1`, migrates a `legacyKey` once); storage failures fall back to
  in-memory state.

## About dialog and identity

Every AbstractFramework app shows the same About facts: the app name and version, "Part of
AbstractFramework", the author, the copyright and licence line, and links to the website, source,
documentation, issue tracker and feedback page, plus the contact e-mail. They come from one
canonical descriptor that the kit ships as `abstractframework_identity.json`; the rows match the
Python `abstractcore.utils.identity.about_fields`, so web, desktop and terminal apps agree.

Add About to the top bar with one prop:

```tsx
import { AfTopBarActions, appIdentity, gatewayVersionRows, type AboutRow } from "@abstractframework/ui-kit";

const identity = appIdentity("abstractflow", APP_VERSION); // throws for an unknown id
const [gatewayRows, setGatewayRows] = useState<AboutRow[]>([]);
const refreshGatewayRows = () =>
  fetchJson("/api/gateway/about").then(
    (body) => setGatewayRows(gatewayVersionRows(body)),
    (err) => setGatewayRows(gatewayVersionRows({ error: String(err?.message || err) })),
  );

<AfTopBarActions
  about={{ identity, extraRows: gatewayRows, onOpen: refreshGatewayRows }}
  connection={...}
/>
```

- `appIdentity(id, version)` takes the distribution name in lower case (`knownAppIds()` lists
  them) and your app's own version. An unknown id throws: an app must not invent identity facts.
- `extraRows` is an array of `[label, value]` pairs appended after the standard rows. For the
  connected gateway, build them with `gatewayVersionRows(...)` from the body of
  `GET /api/gateway/about`, or from `{ error }` when the request fails. The kit never fetches
  versions; `onOpen` runs each time the dialog opens, which is a good moment to refresh them.
- `gatewayVersionRows` gives every app the same rows: `Gateway` (`AbstractGateway <version>`),
  `Gateway framework` (`AbstractFramework <version>`, or `not installed on the gateway host`), then
  `Gateway package <name>` for each other reported package, sorted by name (packages without a
  version are left out). On an error, or a body without an `abstractgateway` version, it returns
  the single row `Gateway` → `unavailable (<reason>)`.
- The dialog opens external links in a new tab (`rel="noopener noreferrer"`), shows the contact
  address as text with a `mailto:` link, keeps Tab and Shift+Tab inside the dialog while it is
  open, and closes on Escape, a click outside, or Close.
- Use `<AfAboutDialog open onClose identity extraRows />` directly when your About entry lives
  somewhere else (a menu, a settings page), and `aboutRows(identity, extra)` when you render the
  rows yourself.

### CSS public API (non-React consumers)

The `.af-topbar-*` and `.af-drawer-*` class families are stable public API, so a server-rendered
page can render its own HTML against them:

```html
<div class="af-topbar" role="group" aria-label="App actions">
  <button class="af-topbar__btn" aria-label="Open assistant">…svg…</button>
  <button class="af-topbar__btn" aria-label="Appearance">…svg…</button>
  <span class="af-topbar__identity" title="Signed in as alice">alice</span>
  <button class="af-topbar__pill af-topbar__pill--connected">
    <span class="af-topbar__dot af-topbar__dot--connected"></span>
    <span class="af-topbar__pill-label">Disconnect</span>
  </button>
</div>
<div class="af-drawer af-drawer--open" role="complementary" style="width:420px">
  <div class="af-drawer__header">
    <div class="af-drawer__title">Assistant</div>
    <div class="af-drawer__header-actions"><button class="af-drawer__close">×</button></div>
  </div>
  <div class="af-drawer__body">…</div>
</div>
```

- Pill modifiers: `--connected | --disconnected | --loading` (the dot matches).
- `.af-topbar__identity` is a quiet one-line text item (secondary color, ellipsized past 24
  characters), for example the signed-in identity.
- Closed drawer: remove `--open` and set `display:none`.

## Console islands

A page that is not a React app can mount the real `AfTopBarActions`, `AfAppearanceDialog` and
`AfAboutDialog` through the console islands: one self-contained script (React included) that defines
`window.AfConsoleIslands` with `mountTopBar(el, props)`, `mountAppearance(el, props)`,
`mountAbout(el, props)`, `appIdentity(id, version)` and `applyAppearance(settings)`. The
AbstractGateway console uses it.

The bundle is built from a repository checkout and is **not** part of the npm package:

```bash
npm run build:islands -w @abstractframework/ui-kit   # writes ui-kit/islands/dist/af-console-islands.js
node ui-kit/scripts/check_islands.mjs                # rebuilds and verifies the API
```

The page must also load `theme.css`. API, props and examples: [Console islands](../docs/console-islands.md).

## DisclosureList integration notes

- **Window-level keyboard handlers must yield to the list**: if your app has window-level
  arrow-key navigation, skip it while `document.activeElement` is inside `.af-disclosure`;
  otherwise each arrow press moves twice (once in your handler, once in the list's roving
  tabindex).
- **Theming the chevron: exclude the spacer**: consumer-scoped rules such as
  `.your-scope .af-disclosure__chevron` outweigh the kit's spacer transparency and paint a
  button on non-expandable rows. Theme via
  `.af-disclosure__chevron:not(.af-disclosure__chevron--spacer)`.

## Theme system

The kit owns the theme system for every AbstractFramework UI: `theme.css` (21 themes),
`THEME_SPECS`, `useAppearanceSettings` (per-app persistence + no-flash first paint), and the
switcher surfaces (`AfAppearanceDialog`, `ThemeSelect`, `FontScaleSelect`,
`HeaderDensitySelect`). Apps use these rather than forking them:

1. React apps import `theme.css`, the hook and the dialog.
2. Surfaces that cannot install npm packages (the AbstractGateway console) serve a generated,
   verbatim copy of `theme.css` checked against the kit in their own test suite, and mount the
   [console islands](#console-islands) for the interactive controls.
3. Native (Qt) surfaces are out of scope; terminals and other non-CSS consumers can use
   `palette_seeds.json`.

See [Theming](../docs/theming.md) for the token vocabulary and adoption rules.

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Adoption guide: [`docs/adoption-guide.md`](../docs/adoption-guide.md)
- Theming: [`docs/theming.md`](../docs/theming.md)
- Console islands: [`docs/console-islands.md`](../docs/console-islands.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)
- Repo docs index: [`docs/README.md`](../docs/README.md)
