# Adoption Guide for App Developers

This page tells you, for each common UI job in an AbstractFramework app, which shared component
to use and what contract it expects. Use it before building something app-local: if the job is
listed here, the shared component is the supported path; if it isn't, see
[Requesting a component](#requesting-a-component-or-absorbing-yours).

All components are **host-driven**: you provide data and callbacks; components never import your
app code or fetch on their own (injected transports are the pattern where networking is needed).

## Which component for which job

| Job | Use | Notes |
|---|---|---|
| Connect the browser to a Gateway | `useGatewayConnection` + `GatewayConnectModal` (+ `@abstractframework/app-server` proxy) | The whole connection state machine is the hook — do not hand-roll it (see below) |
| Server-side session proxy | `@abstractframework/app-server` (`createGatewaySessionProxy`) | Token→HttpOnly-cookie exchange, CSRF, URL pinning; tokens never rest client-side |
| Searchable select / combobox | `AfSelect` | Keyboard nav + ARIA built in; `variant="panel"` for forms |
| Provider + model pickers | `ProviderModelPicker` (mode toggle + cascade) or `ProviderModelSelect` (plain pair) | Picker's "Gateway default" mode is the default; transports injected (`fetchProviders`/`fetchModels`) |
| Theme/typography pickers | `ThemeSelect`, `FontScaleSelect`, `HeaderDensitySelect` | Persisted user settings; see [Theming](./theming.md) |
| Tool allowlist + approval editor | `ToolPolicyEditor` | Server-declared `default_approval` wins; `TOOL_POLICY_DEFAULTS` is the labeled fallback |
| Phase × capability grid | `PhaseCapabilityMatrix` (+ framework-free core) | Payload-driven: render the server's `MatrixPayload`, never re-derive policy client-side |
| Irreversible-action confirmation | `CriticalActionDialog` (+ `resolveCriticalActionGate`) | Server-supplied facts required to enable confirm; typed-confirm is opt-in |
| Steer a live run | `SteerComposer` (+ `submitSteer`) | Idempotent `command_id`, CSRF-token candidates, honest `accepted:false` handling |
| Expandable tree/list panes | `DisclosureList` | Dual-key selection, path-keyed expansion, `role=tree` keyboard nav, badge rail |
| Badges / chips / toggles | `AfChip`, `AfChipButton` | Tone variants with AA-derived colors; custom hues via `var(--token)` |
| Icons | `Icon` | ~40 glyphs, 24-grid and 16-grid families |
| Chat UI (thread, cards, composer) | `@abstractframework/panel-chat` | Markdown with real nested lists; JSON auto-detect; `message.title` names the speaker |
| App assistant (docs Q&A drawer) | `AssistantPanel` (panel-chat) in `AfDrawer` via `AfTopBarActions` | Transport injected. THE shared transport (docs-qa@0.1.0, tenant_catalog): `POST /runs/start {registry_scope:"tenant_catalog", bundle_id:"docs-qa", bundle_version:"0.1.0", flow_id:"docsqa001", input_data:{question, history, docs:<llms.txt text>, app}}`, answer on `output.response` — grounded on YOUR docs only, cites sections, says honestly when docs don't answer. `import docs from "./llms.txt?raw"` remains the recommended docs source (build-time, versioned) |
| Markdown / JSON rendering | `Markdown`, `JsonViewer` (panel-chat) | Also exported standalone |
| TTS playback + push-to-talk | `useGatewayVoice` (+ `streamTtsJsonl`) | Injected `tts`/`tts_stream`/`transcribe` functions; streaming with pause/resume |
| Agent cycle traces | `AgentCyclesPanel` + `build_agent_trace` (monitor-flow) | Adapter turns ledger-like records into `TraceItem[]` |
| KG / active-memory explorer | `KgActiveMemoryExplorer` (monitor-active-memory) | ReactFlow peer dep |
| GPU utilization widget | `<monitor-gpu>` (monitor-gpu) | Dependency-free custom element |
| Host RAM + device memory widget | `<monitor-memory>` (monitor-memory) | Dependency-free custom element |

## Contracts you must follow

These rules keep app behavior consistent across the framework.

### Gateway connection surface

- The connect surface is a **centered modal** over a dimmed, blurred backdrop — never an inline
  settings block. The **Gateway URL is always visible**.
- **Tokens never rest client-side**: the app-server proxy exchanges the token for HttpOnly
  cookies. No localStorage/bearer fallbacks in apps.
- **Auto-open on resolved disconnect**: when the app knows it is disconnected, the modal is the
  first screen. Two variants: `blocking` (apps with no offline surface) or `dismissable` once
  per signed-out episode (apps that degrade usefully).
- **Connected flips on probe-ok, never on data**: the session probe is the only gate for leaving
  "Connecting…"; data fetches fill their panels in after, in parallel. A slow list degrades its
  own panel, never first paint.
- **Use the hook**: `useGatewayConnection({ appName, variant })` owns this machine (probe once at
  boot, auto-open rules, self-close on sign-in, stay-open on sign-out, re-arm per episode).
  Spread its `modalProps` into `GatewayConnectModal`. Hand-rolled variants drift.
- **Remote Gateway configuration is decided by the socket peer, not the Host header**: the
  app-server proxy decides local-vs-remote from `req.socket.remoteAddress`. A `Host: localhost`
  header from a LAN peer does not unlock browser-supplied Gateway URLs, and a genuine loopback
  peer passes regardless of its Host header. Behind a trusted reverse proxy, remote
  configuration requires the explicit opt-in (`ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG`
  or the app-prefixed variant). Tests of this gate should assert on the socket peer.

### Server truth renders, clients never re-derive

Payload-driven components (`PhaseCapabilityMatrix`, `CriticalActionDialog` facts,
`ToolPolicyEditor` defaults, chat `tools_ran`) render what the server sent. If a value is
missing, render the labeled degraded state (`#FALLBACK`) — do not compute a client-side guess.

### Degradations are labeled

When a discovery/fetch fails, components render a visible `#FALLBACK …` line rather than
crashing or silently emptying. Keep that convention in your app surfaces too: the label makes
degraded states easy to spot and diagnose.

### Styling

Consume the theme tokens; never hardcode palette colors. The full rules live in
[Theming](./theming.md).

## Requesting a component (or absorbing yours)

The kit absorbs proven app components rather than speculating:

1. **Build kit-shaped locally** if you need something now: no app business logic, payload-driven
   props, tokens-only styling, snake_case file names. Say so in your tree (a header comment
   naming the absorption intent helps).
2. **Open a request** (a GitHub issue on AbstractUIC) with the props shape and the file path of
   your copy.
3. **The kit ships the shared version**, usually generalizing transports into injected functions
   and absorbing the best variant of each feature.
4. **Delete your copy on adoption** so one source remains.

## Versioning discipline

- Pin the kit version and rebuild your bundle when you bump it: a previously built bundle keeps
  serving the old kit code. Hard-reload open tabs after a rebuild.
- `npm test` in `ui-kit` runs the full guard chain (build, matrix cores, theme tokens, palette
  seeds parity, theme contrast, console islands); the publish hook runs the same chain.
- Pages that vendor the [console islands](./console-islands.md) bundle rebuild and re-vendor it
  when the kit changes.

## Related docs

- [Getting started](./getting-started.md) — install + CSS imports
- [Theming](./theming.md) — token vocabulary + migration path
- [API reference](./api.md) — export maps per package
- [Architecture](./architecture.md) — package boundaries + data flow
- [Console islands](./console-islands.md) — the kit components for non-React pages
- [Troubleshooting](./troubleshooting.md) — symptoms and fixes
