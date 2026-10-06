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
- **App chrome**: `AfTopBarActions`, `AfDrawer`, `AfRailDrawer` (vertical icon rail at the right
  edge, panel beside it, resizable, collapses to icons), `AfAppearanceDialog` +
  `useAppearanceSettings()`, `AfAbout` / `AfAboutDialog` (the compact About card)
- **Files**: `AfFileViewer` (Markdown via the host renderer, highlighted code, JSON, images,
  audio, PDF, text; size/date header; download), `AfCodeBlock` / `highlightCode()` and
  `AfAudioPlayer` (the shared waveform audio player)
- **Settings rows**: `AfSettingsGroup`, `AfSettingRow`, `AfOverrideRow` ("Gateway default" unless
  overridden), `AfVoiceSection` (the Assistant's Voice layout)
- **Time**: `formatRelativeTime(ts, nowMs)`, `formatExactTime(ts)` — deterministic, no seconds
- **Identity**: `appIdentity(id, version)`, `frameworkIdentity()`, `knownAppIds()`,
  `aboutRows(...)`, `gatewayVersionRows(...)` — the AbstractFramework facts every About screen
  shows
- **Run and policy surfaces**: `PhaseCapabilityMatrix`, `CriticalActionDialog`, `SteerComposer`,
  `DisclosureList`, `AfChip`, `AfPhaseRadio`, cognition gauges
- **Voice**: `useGatewayVoice()` (streaming TTS + push-to-talk)
- **Automations**: `AutomationPanel`, `AfScheduleDialog` (schedule and email triggers, Email me the
  result, allowed recipients), `createAutomationsClient()` and the canonical Gateway fixtures — see [Automations](../docs/automations.md)
- **Modal and account rows**: `AfModal` (large dialog over a blurred backdrop, full-screen sheet on
  phones), `bindAfModal()`, the `af-row--admin|user|entity` tints, `af-kind-chip`, `af-nav-group` /
  `af-nav-footer` — see [Modal, account rows, grouped navigation](../docs/modal.md)
- **On/off settings and forms**: `AfSwitch` / `AfSwitchInput` (a switch labelled by the feature),
  `AfTabs`, the `af-form` / `af-card` / `af-tabs` styles, and the guards `findVerbToggleLabels()`
  and `checkLabelScale()` — see [On/off settings](../docs/state-toggles.md)
- **Plain http**: `randomId()` (a v4 UUID in every browser context) and
  `insecureContextReason(feature)` — see [Non-secure contexts](../docs/state-toggles.md#non-secure-contexts)
- **Icons**: `Icon`, `ICON_NAMES` (65 monochrome glyphs; every name and the contact sheet: [docs/icons.md](../docs/icons.md); used by `@abstractframework/panel-chat`)
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
A tool may carry `state: { label, tooltip?, tone? }` — a server-reported state shown as a badge
under its name, with the server's sentence in the kit tooltip (AbstractCode passes the gateway's
command-sandbox state of process-spawning tools). The kit shows what it is given and never derives
a state.

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
  Below 768 px it is full width; `side="left"` opens it from the left edge and `backdrop` adds a
  dimmed backdrop that closes it on tap (use both where a docked sidebar becomes a drawer).
- `AfRailDrawer` is the vertical rail drawer (AbstractEntity / Continuum Teams pattern): put it at
  the right end of a `position: relative` content row. Docked from 1024 px (the panel takes its
  width in the flow; drag or arrow-key the separator; `storageKey` remembers it), floating below
  (backdrop, Escape folds it). The rail is a vertical `tablist`; clicking the open icon folds the
  panel back to the icons. Panels visited once stay mounted.

```tsx
<div style={{ display: "flex", position: "relative", minHeight: 0 }}>
  <main style={{ flex: 1, minWidth: 0 }}>…</main>
  <AfRailDrawer ariaLabel="Workspace panels" storageKey="myapp.rail.width" active={panel} onActiveChange={setPanel}
    items={[{ id: "files", label: "Files", icon: "folder", content: <Files /> },
            { id: "settings", label: "Settings", icon: "cog", content: <Settings /> }]} />
</div>
```
- `AssistantPanel` (in `@abstractframework/panel-chat`) never fetches: the
  `ask(question, { signal, history })` transport is injected and may return a Promise or an
  AsyncIterable of deltas.
- Appearance persistence is per app via `useAppearanceSettings(appId)` (key
  `af_appearance_<appId>_v1`, migrates a `legacyKey` once); storage failures fall back to
  in-memory state.

## About dialog and identity

Every AbstractFramework app shows the same compact About card: the app's name and version, the
AbstractFramework and AbstractGateway versions, one row of links (Website, Source, Docs, Issues,
Feedback, and Contact as a `mailto:`) and the copyright and licence line. It never lists
packages. The identity facts come from one canonical descriptor that the kit ships as
`abstractframework_identity.json` (a byte-identical copy of `identity/abstractframework.json` in
the [AbstractFramework repository](https://github.com/lpalbou/AbstractFramework)); AbstractCore's
`abstractcore.utils.identity.about_card_html` renders the same card in Python, so web apps and the
consoles agree.

Add About to the top bar with one prop:

```tsx
import { AfTopBarActions, aboutVersionsFromGateway, appIdentity, type AfAboutVersions } from "@abstractframework/ui-kit";

const identity = appIdentity("abstractflow", APP_VERSION); // throws for an unknown id
const [versions, setVersions] = useState<AfAboutVersions>({ gatewayNote: "checking…" });
const refreshVersions = () =>
  fetchJson("/api/gateway/about").then(
    (body) => setVersions(aboutVersionsFromGateway(body)),
    (err) => setVersions(aboutVersionsFromGateway(null, String(err?.message || err))),
  );

<AfTopBarActions
  about={{ identity, versions, onOpen: refreshVersions }}
  connection={...}
/>
```

- `appIdentity(id, version)` takes the distribution name in lower case (`knownAppIds()` lists
  them) and your app's own version. An unknown id throws: an app must not invent identity facts.
- `versions` is `{ framework?, frameworkNote?, gateway?, gatewayNote? }`. A missing version shows
  its note, otherwise "not reported" (framework) or "not connected" (gateway). Build it with
  `aboutVersionsFromGateway(body)` from the body of `GET /api/gateway/about`: only the framework
  and gateway versions are read (the payload's package list is ignored), a missing framework says
  "not installed on the gateway host", and a body without a string gateway version says
  "unavailable (the gateway did not report its version)". After a failed request use
  `aboutVersionsFromGateway(null, reason)` ("unavailable (<reason>)"). The kit never fetches;
  `onOpen` runs each time the dialog opens, a good moment to refresh the versions.
- The dialog keeps Tab and Shift+Tab inside itself while it is open, closes on Escape, a click
  outside, or the Close button in its heading row, and returns focus to the About button.
- Use `<AfAboutDialog open onClose identity versions />` when your About entry lives somewhere
  else (a menu), or the inline `<AfAbout identity versions />` card on a settings page.
  `aboutLinks(identity)` and `aboutVersionFacts(versions)` expose the card's links and facts.
- `aboutRows(identity, extra)` and `gatewayVersionRows(payload, error)` remain available for
  apps that list About facts as rows (they match the Python `about_fields` and
  `gateway_version_rows`, checked against `scripts/fixtures/gateway_version_rows.json`); the About
  card does not render rows.

## Voice settings

`AfVoiceSection` renders a client's Settings → Voice page in four groups: **Engines**
(Text → speech, Speech → text), **Output** (output device with **Test**, Reply volume),
**Microphone** (input device with **Test** and a live level meter, Spoken language, Input level)
and **Replies** (Read aloud, Voice latency). Everything reads "Gateway default" until the user
overrides it; the host stores the overrides.

```tsx
<AfVoiceSection
  value={prefs}
  onChange={setPrefs}
  fetchCatalog={(provider, model) => gatewayJson(voiceCatalogPath(provider, model))}
  fetchDefaults={() => gatewayJson("/api/gateway/voice/defaults")}
  overrideOwner="this app"
/>
```

- `fetchDefaults` is required: "Gateway default · provider / model" comes only from the gateway's
  voice defaults (`VoiceDefaults`: `tts` and `stt` routes), "not set" when the administrator set
  none, "unknown" when the gateway could not be asked. Pass `defaults` when you already hold them.
- Device names appear after one microphone permission (**Show names**). Safari does not let a page
  choose the output device: the picker stays on System default and says so.
- Send what the user chose with `voiceTtsRequest(prefs)` / `voiceSttRequest(prefs)`, and play or
  record through `useGatewayVoice({ output_device_id, input_device_id, volume, input_gain })`.
- `gatewayJson` and `voiceCatalogPath` above stand for your own authenticated transport.

## Audio player

`AfAudioPlayer` is the one audio viewer of every client (AbstractFlow artifacts, `AfFileViewer`
audio files, panel-chat media):

```tsx
<AfAudioPlayer src={objectUrl} name="speech.wav" />
```

- `src` is a URL the browser can play: an object URL of bytes you fetched with your own
  credentials, or a same-origin URL. `name` labels the controls; `peaks` (0..1 per bar) skips
  decoding; `className` styles the wrapper.
- The waveform is decoded from `src` with the Web Audio API. When decoding is unavailable or
  fails, the bars stay flat with the reason in the waveform's tooltip, and playback still works.
- Click or drag the waveform to seek. It is a keyboard `slider`: Left/Right move ±5 s, Home/End
  jump to the start or end, Space/Enter play or pause.
- Pure helpers: `audioPeaks(samples, bars?)`, `formatAudioTime(seconds)`,
  `audioSeekTime(x, width, duration)`, `AUDIO_WAVEFORM_BARS`.

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

## Responsive layout

`theme.css` adapts the kit components to phones, tablets, resized windows and narrow panes. A
regular desktop window keeps the desktop look.

- **Breakpoints** (literal values, desktop-first):
  - `xs` `(max-width: 479.98px)`, `sm` `(max-width: 767.98px)`, `md` `(max-width: 1023.98px)`,
    `lg` `(max-width: 1439.98px)`, `xl` `(min-width: 1440px)`;
  - `(max-height: 500px)` for phone landscape and `(pointer: coarse)` for touch;
  - in JavaScript: `AF_BREAKPOINTS`, `AF_MEDIA`, `useAfMedia(query)`.
- **Touch sizes**: on touch screens every interactive kit control is at least 44 px
  (`--tap-min`) and form fields use 16 px text (`--font-size-input`), so iOS does not zoom on focus.
  Native single-choice selects drop the native appearance there and show the
  `--af-select-chevron` arrow. Interactive chips keep their shape with an invisible 44 px hit area.
- **Sheets and drawers**:
  - below 768 px wide or 500 px tall the kit dialogs become bottom sheets with the action row pinned,
    and they stay above the on-screen keyboard;
  - `.af-sheet-overlay` / `.af-sheet` give app dialogs the same behaviour;
  - `AfDrawer` is full width below 768 px and accepts `side="left"` and `backdrop`.
- **Container queries**: the sign-in card (`af-signin`), dialogs (`af-dialog`), automations
  (`af-auto`), tool policy editor (`af-tool-policy`) and drawer body (`af-drawer`) adapt to their
  own width. The narrow layouts start only where the desktop layout no longer fits.
- **Viewport helpers**: `installViewportVars()` keeps `--vv-height` and `--keyboard-inset` in step
  with the visual viewport (the on-screen keyboard; a pinch-zoomed page keeps its full height).
  `--vh-full` and `--safe-*` cover full-height shells and the notch.
- **Tokens**: `--space-1..6`, `--gutter`, `--tap-min`, `--control-h`, density tokens
  (`data-density` on `<html>`), `--content-max`, `--reading-max`, `--form-max`, `--drawer-w`, and the
  text roles `--font-size-body` / `-input` / `-code` / `-2xl`.
- **Font sizes**: the user's font scale comes first, then the 16 px form-field floor, then your app's
  own density, then the kit's touch floors. The kit applies those floors only to its own reading
  surfaces.

See [Responsive layout](../docs/responsive.md) for the full contract and how to adopt it in your
app. `scripts/check_responsive.mjs` and `scripts/check_viewport_vars.mjs` pin it.

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Adoption guide: [`docs/adoption-guide.md`](../docs/adoption-guide.md)
- Theming: [`docs/theming.md`](../docs/theming.md)
- Modal, account rows, grouped navigation: [`docs/modal.md`](../docs/modal.md)
- On/off settings, forms, tabs: [`docs/state-toggles.md`](../docs/state-toggles.md)
- Console islands: [`docs/console-islands.md`](../docs/console-islands.md)
- Automations: [`docs/automations.md`](../docs/automations.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)
- Repo docs index: [`docs/README.md`](../docs/README.md)
