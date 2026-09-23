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

### Native MTP control

`SpeculationSelect` is the shared inheritance / Off / depth selector. Pass the execution
host's complete model-capability payload as `capabilities`; only depths advertised under
`execution.speculation.supported_depths` are offered. Missing capability data is shown as
unknown, not guessed from a model name. Saved unavailable selections remain visible.

`ProviderModelPicker` includes this control when `enableSpeculation` is true; supply its
usual provider-aware capability transport. The `speculation` value is absent for inheritance,
`false` for Off, or a native-MTP object with `require_acceleration: true` for an explicit
depth. Apps own preference storage and omit inherited values from requests. Neither
component loads models or downloads heads. See the [API reference](../docs/api.md).

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
- **The state machine is code, not prose (B5, 2026-07-13)**: use
  `useGatewayConnection({ appName, variant: "blocking" | "dismissable" })`
  and spread `modalProps` into `GatewayConnectModal`. The hook owns the
  whole contract — probe once at boot, auto-open only on a RESOLVED
  disconnect, close on sign-in success (the modal also self-closes; after a
  successful sign-in the APP is the confirmation, never a parked modal),
  stay open on sign-out, re-arm per signed-out episode. Do not hand-roll
  this machine in apps; the drift is exactly what shipped the
  signed-in-but-modal-parked bug across consumers.
- **Mid-session losses don't auto-open (continuum c2528, 2026-07-16)**:
  under `dismissable`, only boot-resolved disconnects and sign-out episodes
  auto-open the modal. A LIVE session resolving away mid-use (expiry,
  gateway restart, one transient probe blip) surfaces through the pill/badge
  instead of a screen-covering modal over whatever the operator is typing.
  Opt back into the old behavior per app with `autoOpenMidSession: true`.
  Blocking apps always auto-open (no offline surface exists).

## Unified top-right corner (plans/unified-top-bar.md)

Every app renders the same upper-right cluster (operator directive
2026-07-13): assistant button → appearance button → app extras →
Disconnect pill, always rightmost.

```tsx
const conn = useGatewayConnection({ appName: "My App", variant: "dismissable" });
const [appearance, setAppearance] = useAppearanceSettings("my-app", { legacyKey: "myapp_ui_v1" });

<AfTopBarActions
  assistant={{ open: drawerOpen, onToggle: () => setDrawerOpen((v) => !v) }}
  appearance={{ onOpen: () => setAppearanceOpen(true) }}
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

Rules (the behavior contract lives in the consensus doc):

- The connection pill renders the hook's PHASE (three states) — never a
  boolean. `signingOut`/`signOutError` are the in-flight/error channels.
- `AfDrawer` is non-modal and KEEPS ITS CHILDREN MOUNTED when closed
  (`display:none` + `inert`) — drawers host long-running work. ESC follows
  the consumed-event convention (`defaultPrevented`); the connect modal
  sits above drawers (z-order tokens `--z-drawer` < `--z-connect-modal` <
  `--z-popover`).
- `AssistantPanel` (in `@abstractframework/panel-chat`) never fetches: the
  `ask(question, {signal, history})` transport is injected and may return a
  Promise or an AsyncIterable of deltas. Docs Q&A must never route through
  entity chat (a visit is billable and forms memories).
- Appearance persistence is per app via `useAppearanceSettings(appId)`
  (key `af_appearance_<appId>_v1`, migrates a `legacyKey` once); storage
  failures degrade to in-memory silently.

### CSS public API (non-React consumers)

The `.af-topbar-*` and `.af-drawer-*` families are stable public API — a
server-rendered page (the gateway console) can render its own HTML to them:

```html
<div class="af-topbar" role="group" aria-label="App actions">
  <button class="af-topbar__btn" aria-label="Open assistant">…svg…</button>
  <button class="af-topbar__btn" aria-label="Appearance">…svg…</button>
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

Pill modifiers: `--connected | --disconnected | --loading` (dot matches).
Closed drawer = remove `--open`, set `display:none`.

## DisclosureList integration notes

- **Global keyboard handlers must yield to the list** (flow's integration
  find, c1343): if your app has window-level arrow-key navigation, gate it
  on `document.activeElement` not being inside `.af-disclosure`, or every
  arrow press double-moves (once in your handler, once in the list's roving
  tabindex).
- **Theming the chevron: exclude the spacer** (flow's specificity find,
  c1355): consumer-scoped rules (`.your-scope .af-disclosure__chevron`)
  outweigh the kit's spacer transparency and paint a phantom button on
  non-expandable rows. Theme via
  `.af-disclosure__chevron:not(.af-disclosure__chevron--spacer)` — the kit
  keeps unthemed consumers safe, but a consumer restyle must carry the
  `:not()`.


### Theme-system ownership (operator directive 2026-07-15)

The kit OWNS the theme system for every AbstractFramework UI: `theme.css`
(21 themes), `THEME_SPECS`, `useAppearanceSettings` (per-app persistence +
no-flash first paint), and the switcher surfaces (`AfAppearanceDialog`,
`ThemeSelect`, `TypographySelect`, `FontScaleSelect`, `HeaderDensitySelect`).
Apps never fork these. Compliance tiers: (1) React apps import theme.css +
the hook + the dialog; (2) non-npm surfaces serve a GENERATED verbatim copy
drift-pinned in their own suite (the gateway console pattern —
`console_theme_sync.py`); (3) native surfaces (Qt) are out of scope.
Adoption matrix + orchestration: docs/backlog/planned/0026 (uic tree).
