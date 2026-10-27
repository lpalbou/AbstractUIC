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
| Provider + model pickers (+ reasoning, MTP) | `ProviderModelPicker` (`layout="compact"` for node panels, `pinned` for connected pins) over `createGatewayModelTransport(request)`; `withRunModel` for the run input | "Gateway default" is first and named (`fetchGatewayDefault`: "Gateway default · ollama / qwen3"); the reasoning ladder comes from the gateway (`reasoningLadder`), never a client list or a model-name rule; saved values stay visible "(saved)" |
| App top bar + About | `AfTopBarActions` with `connection={useGatewayConnection(...)}`, `identity="menu"`, `appearance={{ value, onChange }}`, `about={{ identity: appIdentity(id, version), fetch: fetchGateway }}` (or `AfAboutDialog` / inline `AfAbout` directly) | Order is the kit's (extras · docs · assistant · appearance · about · identity · pill); the cluster owns the Appearance and About dialogs and GETs `api/gateway/about` on open — delete app-local about fetchers; identity facts come from the kit's descriptor; the card shows no package list; `about.extra` for host controls inside the dialog |
| Who is signed in | `AfTopBarActions` `identity="badge" \| "menu"` (+ `principalFromConnection`, `principalLabel`) | Reads `status.gateway.principal` (the gateway's `/me`), only while the pill is connected; shows the user id (tenant only when not `default`) and the gateway host in the kit tooltip; the menu's **Disconnect** = the pill's (`signOut()`, then your `onSignOut` state wipe only when the disconnect happened; a failure shows "Disconnect failed" beside the pill). The gateway serves no display name / e-mail / avatar |
| Provider + model pickers | `ProviderModelPicker` (mode toggle + cascade) or `ProviderModelSelect` (plain pair) | Picker's "Gateway default" mode is the default; transports injected (`fetchProviders`/`fetchModels`) |
| App shell (header + top-right cluster + side panels + nav) | `AfAppShell` (`topBar`, `drawers`, `nav`, children) | Composition of the rows below; the header publishes `--af-topbar-h` so every `topOffset: "auto"` drawer opens under it — delete app-side header measurers |
| Theme/typography pickers | `ThemeSelect`, `FontScaleSelect`, `HeaderDensitySelect` | Persisted user settings; see [Theming](./theming.md) |
| Tool allowlist + approval editor | `ToolModeEditor` + `tool_plan` helpers (`normalizeToolCatalog`, `planRunTools`, `withRunTools`) + `createToolLayerStore` | Off / Ask / Auto per tool; the gateway's `approval_default` is the default; app and session layers hold only differences; `allowListOnly` for allowlist pins. `ToolPolicyEditor` is deprecated (one minor). The chat layer lives on the gateway when it advertises `session_tool_policy` (`createSessionToolPolicyClient` + `createToolLayerStore({sessionPolicy})`), else in this browser, and the editor says which |
| Phase × capability grid | `PhaseCapabilityMatrix` (+ framework-free core) | Payload-driven: render the server's `MatrixPayload`, never re-derive policy client-side |
| Irreversible-action confirmation | `CriticalActionDialog` (+ `resolveCriticalActionGate`) | Server-supplied facts required to enable confirm; typed-confirm is opt-in |
| Steer a live run | `SteerComposer` (+ `submitSteer`) | Idempotent `command_id`, CSRF-token candidates, honest `accepted:false` handling |
| Expandable tree/list panes | `DisclosureList` | Dual-key selection, path-keyed expansion, `role=tree` keyboard nav, badge rail |
| Badges / chips / toggles | `AfChip`, `AfChipButton` | Tone variants with AA-derived colors; custom hues via `var(--token)` |
| Icons | `Icon` | ~45 glyphs, 24-grid and 16-grid families |
| Chat UI (thread, cards, composer) | `WorkflowChat` (`@abstractframework/panel-chat`) | Markdown with real nested lists; JSON auto-detect; `message.title` names the speaker. One surface (backlog 0030): `steer` (Steer / Queue while busy, honest "Queued (seq N)"), `toolbar` (New chat / Clear / Copy / Export, each only when injected), `messageProps.renderFooter` / `variant: "hint"` (per-message badge, one-line system notes), `onSend(draft, {signal})` + `onCancel(signal)` so Stop aborts a request/response host. Add a prop here instead of forking the thread |
| Live (streamed) replies | `WorkflowSessionController` / `useWorkflowSession` + a transport whose `streamLedger` passes `onDelta`; `WorkflowChat` `streamReplies` + `streamRepliesRuntime()` | Deltas never move the ledger cursor; the ledger record replaces the live bubble. See [panel-chat live replies](../panel-chat/README.md#live-replies-streaming). Pending questions come from the same controller (ledger + served `waiting`), never a local fold |
| Docs assistant (Q&A on the app's own docs) | `DocsAssistantDrawer` (panel-chat) toggled by `AfTopBarActions` `docs`, or `docsAssistantPanel(source, fetchGateway, { connected })` in `AfDrawerSystem` | Grounding is the gateway's server corpus `GET api/gateway/docs/corpus?app=<id>` (each app's own build `llms.txt`, relayed by the gateway) → the shipped `docs-qa` workflow (`DOCS_QA_WORKFLOW`); one gateway session per conversation; the host injects `fetchGateway`. No `llms.txt?raw` import in the app |
| App assistant (an app's own Q&A, e.g. Continuum's advisor) | `AssistantPanel` (panel-chat) in `AfDrawer`, or `assistantDrawerPanel({ ask, assistantName })` in `AfDrawerSystem`, toggled by `AfTopBarActions` `assistant` | Transport injected (`ask(question, { signal, history })`), never fetches |
| Questions and approvals | `presentInteraction(wait, controller, options)` → `WorkflowChat` `interaction` (or `WorkflowInteractionPanel`, `variant="card"` for "Needs you" lists and inboxes) | One wording set (`WORKFLOW_INTERACTION_LABELS`): Deny / Allow once / Allow for this chat / Allow all enabled tools; Decide later and Keep waiting send nothing (a dismissal never denies); Continue without answering resumes empty. Each broader option appears only when the host injects it; the allow-all scope sentence is the host's (`approveAllScope`), never assumed. Accepts a `replay_view_v1.interaction` (`ReplayInteraction`) once a gateway serves it. Session tool policy: inject a `SessionToolPolicyClient` when `capabilities.session_tool_policy.supported` and pass `sessionPolicy: { toolsetOf, ask }` (the mode is the controller's): "Allow for this chat" and "Allow all <toolset> tools for this chat" are stored on the gateway (written before the wait is answered, with the person's Ask tools); on an older gateway the local grant reads "Allow for this run" and is labeled; a failed capability read offers no chat grant and says why |
| Attachments and generated media | Composer: `WorkflowChat` `attachmentItems` + `useAttachmentUploads`. Messages: `ChatMessage.media` (`image` / `audio` with `transcript` / `video` / `file`), filled with `chatMediaFromArtifact` from the transport's `resolveArtifact` | Chips name their state (Waiting, Uploading, refused with both sizes, failed with the gateway's words and Retry); Send refuses while one is not attached. Files open in the shared `AfFileViewer`; speech-to-text shows as a **Transcript** caption; music rides on audio. The host fetches with its own credentials |
| App assistant (docs Q&A drawer) | `AssistantPanel` (panel-chat) in `AfDrawer` via `AfTopBarActions` | Transport injected. THE shared transport (docs-qa@0.1.0, tenant_catalog): `POST /runs/start {registry_scope:"tenant_catalog", bundle_id:"docs-qa", bundle_version:"0.1.0", flow_id:"docsqa001", input_data:{question, history, docs:<llms.txt text>, app}}`, answer on `output.response` — grounded on YOUR docs only, cites sections, says honestly when docs don't answer. `import docs from "./llms.txt?raw"` remains the recommended docs source (build-time, versioned) |
| Markdown / JSON rendering | `Markdown`, `JsonViewer` (panel-chat) | Also exported standalone |
| TTS playback + push-to-talk | `useGatewayVoice` (+ `streamTtsJsonl`) | Injected `tts`/`tts_stream`/`transcribe` functions; streaming with pause/resume; output and input device, volume and input level options |
| Voice settings page | `AfVoiceSection` (+ `useVoicePreferences(storageKey)`, `useVoiceDefaults(fetchDefaults)`) | Pass `fetchDefaults` (`GET /api/gateway/voice/defaults`): "Gateway default · provider / model" comes only from it; the host stores the overrides (`useVoicePreferences`: same-tab and cross-tab sync). Pass `voiceLibrary` (`design` → `POST voice/design`, `clone` → multipart `POST voice/clones`, `list` / `rename` / `remove` / `share` over `voice/clones[/{id}]` and `voice/clones/{id}/deploy`; `createVoice` is its alias) to let people create and manage their own voices, `fetchLanguages` (`GET voice/languages`), `previewVoice` (**Play sample**). `rows={{tts: false}}` + `ttsSlot` where the host owns the voice (an entity); `rows.mute` / `rows.capture` only where the host honours `reply_muted` / `capture_mode` / `auto_send` (`useGatewayVoice({...gatewayVoiceOptions(prefs), ...})`) |
| Voice output controls | `AfVoiceOutput` | Output device + **Test**, Reply volume, **Mute**; the same rows the section shows, alone wherever voice settings appear |
| Voice input controls | `AfVoiceInput` | Input device + **Test**, live level meter (`levelSource={voice}`: only the meter re-renders while the user speaks), Input level, **Show names** |
| Microphone button | `AfVoiceMicButton` | **Hold to talk** / **Tap to talk** (the hook's `capture_mode`), live meter, "Recording… 3 s", "Transcribing… · route"; the host decides what a transcript does (`onTranscript`, `auto_send`) |
| Compact settings rows | `AfSettingsGroup`, `AfSettingRow`, `AfOverrideRow` | "Gateway default" until the user overrides it; **Use gateway default** returns to it |
| Side panels on a vertical icon rail | `AfRailDrawer` | Docked from 1024 px, floating below; resizable, width persisted under `storageKey` |
| File preview | `AfFileViewer` (ui-kit) or `FileViewer` + `useWorkspaceFilePreview` (panel-chat, for run workspace files) | Markdown, highlighted code, JSON, images, audio, video, PDF, text; the host fetches with its own credentials |
| Side panels (rail tabs, docs/assistant drawers, left palette, canvas panels) | `AfDrawerSystem` | Panels are opaque `{id, label, icon, content}` + `side`, `mode`, `keepAlive`, `errorBoundary`, `fill`; docked from 1024 px, floating below; per-panel widths and the open panel (docked only) under ONE `storageKey`; `railLabelStyle: "vertical-text"`; `request: "id#nonce"`. Delete app-local side-tab rails, active-panel persistence and error boundaries |
| Side panels on a vertical icon rail (existing callers) | `AfRailDrawer` | A thin wrapper over `AfDrawerSystem`; new code uses `AfDrawerSystem` |
| Audio playback | `AfAudioPlayer` | Waveform player: click or drag to seek, keyboard slider |
| Relative and exact times | `formatRelativeTime(ts, nowMs)`, `formatExactTime(ts)` | Deterministic: the caller passes now; exact time on hover |
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
- **The Gateway sees the real browser address**: the app-server proxy sets `X-Forwarded-For` to
  the browser connection's socket address and adds `X-AbstractFramework-App-Proxy: <appId>` on
  every Gateway-bound request; client-supplied values are replaced or dropped. An app that runs
  its own proxy follows the same rules.

### About dialog

- Every app shows the same About facts through the kit: `appIdentity(id, version)` with the
  app's real version (an unknown id throws), plus `gatewayVersionRows(payload | null, error?)`
  for the connected Gateway (fetched from `GET /api/gateway/about` when the dialog opens).
- See [`ui-kit/README.md`](../ui-kit/README.md#about-dialog-and-identity).

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
[Theming](./theming.md). For phones, tablets and narrow panes, use the shared breakpoints, touch
sizes and viewport helpers described in [Responsive layout](./responsive.md), and keep
`var(--tap-min)` and `var(--font-size-input)` when you override a kit control's height or font.

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
  seeds parity, About and identity checks, theme contrast, console islands); the publish hook
  runs the same chain.
- Pages that vendor the [console islands](./console-islands.md) bundle rebuild and re-vendor it
  when the kit changes.

## Related docs

- [Getting started](./getting-started.md) — install + CSS imports
- [Theming](./theming.md) — token vocabulary + migration path
- [API reference](./api.md) — export maps per package
- [Architecture](./architecture.md) — package boundaries + data flow
- [Console islands](./console-islands.md) — the kit components for non-React pages
- [Troubleshooting](./troubleshooting.md) — symptoms and fixes
