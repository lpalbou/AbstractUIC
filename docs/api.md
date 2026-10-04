# API Reference

This page is a **practical map** of what each package exports and how you typically integrate it.

Source of truth:
- React packages: exports in `*/src/index.ts` (compiled to `dist/` on publish; see `*/package.json`)
- GPU widget: exports in `monitor-gpu/src/index.js` (types in `monitor-gpu/src/index.d.ts`)
- Host memory widget: exports in `monitor-memory/src/index.js` (types in `monitor-memory/src/index.d.ts`)
- Gateway session proxy: exports in `app-server/src/index.js` (types in `app-server/src/index.d.ts`)

If you’re starting from scratch, read [Getting started](./getting-started.md) first (it covers install options and required CSS imports).

For ecosystem context (AbstractFramework / AbstractCore / AbstractRuntime) and the host-driven data flow, see [Architecture](./architecture.md).

## Shared integration notes (React packages)

- All React packages are ESM (`"type": "module"`) and declare `react@^18` / `react-dom@^18` as peer dependencies (see each `*/package.json`).
- **CSS is shipped as a separate export and must be imported by the host app** (do this in your app entrypoint, especially for Next.js).
- **Same-origin requests use RELATIVE paths** (`api/gateway/…`, `api/connection/gateway`), so an app served under a base path (AbstractGateway's `/apps/<id>/`, a reverse-proxy prefix) reaches its own server. The page URL must end with `/` (the app servers' mounts guarantee it). The one source is ui-kit's `gateway_paths.ts`: `GATEWAY_API_PATH`, `GATEWAY_CONNECTION_PATH`, `gatewayApiPath(route)`, `joinBaseUrl(baseUrl, path)` and `gatewayResourcePath(serverUrl)` (a gateway-rooted URL from the gateway's data, e.g. an automation's `ledger_url` or artifact URL, mapped to the app-relative path; open it with panel-chat `openGatewayResource(fetchGateway, url, { name, mode? })`, never as a raw href). Every requesting piece keeps an explicit override: `connectionPath` (`GatewayConnectModal`, `useGatewayConnection`, `fetchGatewayConnection` / `signInGateway` / `signOutGateway`), `commandsPath` (`SteerComposer`, `submitSteer`), `baseUrl` (`createAutomationsClient`, the monitors' `base-url`), `endpoint` (monitors) and `fetchGateway` (panel-chat `WorkspaceBrowser`). `scripts/check_relative_urls.mjs` (run by the root `npm test`) fails on any root-absolute same-origin literal in the browser packages' sources and builds.

CSS entrypoints (files live in each package’s `src/`):

```ts
import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";
import "@abstractframework/monitor-flow/agent_cycles.css";
import "@abstractframework/monitor-active-memory/styles.css";
import "reactflow/dist/style.css"; // only when using monitor-active-memory
```

## `@abstractframework/ui-kit`

Purpose: shared **theme tokens** + small UI primitives used by other packages and host apps.

- Primary exports: `ui-kit/src/index.ts`
- CSS: `@abstractframework/ui-kit/theme.css` (file: `ui-kit/src/theme.css`)

Key exports (authoritative list: `ui-kit/src/index.ts`):
- Theme: `THEMES`, `THEME_SPECS`, `applyTheme()`, `getThemeSpec()`, `themeClassName()` — see [Theming](./theming.md)
- Typography: `FONT_SCALES`, `HEADER_DENSITIES`, `applyTypography()`, `getFontScaleSpec()`, `getHeaderDensitySpec()`
- Responsive: `AF_BREAKPOINTS` (`{ xs: 480, sm: 768, md: 1024, lg: 1440 }`), `AF_MEDIA` (the media query strings), `useAfMedia(query)`, `installViewportVars()` (sets `--vv-height` / `--keyboard-inset`, returns a cleanup), `viewportVarsFrom(innerHeight, { height, offsetTop, scale })` and the `AfVisualViewportSample` type — see [Responsive layout](./responsive.md)
- Inputs: `AfSelect`, `ThemeSelect`, `ProviderModelSelect`, `ProviderModelPicker` (gateway-default mode + provider→models cascade, injected transports), `FontScaleSelect`, `HeaderDensitySelect`, `ToolPolicyEditor`, `MultiSelect`
- MTP: `SpeculationSelect`, `speculationCapability()`, `normalizeSpeculationValue()`,
  `speculationSelection()`, `speculationFromSelection()` and `SpeculationValue` /
  `SpeculationCapability` types. Enable `ProviderModelPicker`'s `enableSpeculation` for text
  routes; its injected `fetchModelCapabilities(model, provider)` returns the Gateway payload.
  `inheritLabel` names the inherit choice of the reasoning and MTP selects (default
  "Workflow / Gateway default"; a host without workflows says "Gateway default").
  `optionsInDefaultMode={false}` takes the gateway default whole: reasoning and MTP appear only
  once a custom provider/model is chosen (for hosts that store them only with a pinned model,
  such as an entity's mind).
- Voice: `VoiceSettings` (provider + model + voice from the Gateway catalog, "Gateway default"
  first). Host props: `intro` (`null` hides the paragraph), `delivery` (speed / quality /
  instructions, default on), `showReset`, `defaultHint` (names what the gateway default is) and
  `voiceDefaultLabel` (the voice select's unset choice).
- Gateway connection: `GatewayConnectModal` + `useGatewayConnection()` (the connection state machine: boot probe, auto-open on resolved disconnect, self-close on sign-in), plus helpers `fetchGatewayConnection()`, `signInGateway()`, `signOutGateway()`, `gatewayStatusBadge()`, `normalizeGatewayUrl()`; `GatewaySessionSignInCard` is the underlying form card.
- Phase capability matrix: `PhaseCapabilityMatrix` + a framework-free core (`validateMatrixPayload()`, `resolveCellView()`, `applyCellAction()`, `reconcilePatches()`, `serializeCellPatches()`)
- Critical actions: `CriticalActionDialog` + core (`resolveCriticalActionGate()`, `normalizeCriticalActionFacts()`)
- Run steering: `SteerComposer` + `submitSteer()` (idempotent command ids, CSRF candidates)
- Lists & badges: `DisclosureList` (tree list, roving tabindex), `AfChip` / `AfChipButton`
- Rail drawer (0.8.0): `AfRailDrawer` — the vertical rail drawer lifted from AbstractEntity's side tabs and Continuum Teams' drawer rail: an icon rail (role `tablist`, vertical; 44 px icons with tooltips; Up/Down/Home/End) at the right edge of the host's content area; a click opens that panel beside the rail, the open icon (or the panel's collapse button) folds it back; the rail always stays. Docked from 1024 px (in the layout flow; width resizable by pointer — mouse, pen, touch with pointer capture — and by keyboard on a `separator`, persisted under `storageKey`), floating below (backdrop, Escape folds it with the consumed-event rule, focus returns to the icon). Panels visited once stay mounted. Props: `items: AfRailItem[]` (`id`, `label`, `icon`, `badge?`, `hint?`, `content`, `headerActions?`), `active`, `onActiveChange(id | null)`, `ariaLabel`, `storageKey?`, `defaultWidth?`/`minWidth?`/`maxWidth?`, `overlay?`, `idBase?` (ids `<idBase>-tab-<id>` / `<idBase>-panel-<id>`). The host's container needs `position: relative`. Pure rules: `railDrawerToggle()`, `railDrawerClampWidth()`, `railDrawerKeyWidth()`, `railDrawerNextIndex()`, `AF_RAIL_WIDTH`.
- File viewer (0.8.0): `AfFileViewer` — one preview for every client: header (name with the path as tooltip, size, generated date relative with the exact time on hover, extra `actions`, Download and close icons) and a body by kind (`fileViewerKind(name, contentType)`: Markdown through the host's `renderMarkdown` — panel-chat `FileViewer` wires its `Markdown` —, code highlighted by `AfCodeBlock`, JSON pretty-printed, images, audio (kind `"audio"` for mp3, wav, ogg, oga, opus, m4a, aac, flac, weba or any `audio/*` type, played by `AfAudioPlayer`), PDF in an `<object>`, plain text; SVG and HTML show as source, never rendered). Presentational: the host passes text (`fileViewerNeedsText(kind)`) or an object URL (images, audio, PDF). `formatFileSize()`.
- Audio player (0.8.0): `AfAudioPlayer` (`src`, `name?`, `peaks?`, `className?`) — the shared audio viewer: play/pause, a waveform you click or drag to seek, elapsed / total time. The waveform is decoded from `src` with the Web Audio API (pass `peaks` to skip decoding); when decoding is unavailable or fails, the bars stay flat with the reason in the waveform's tooltip and playback still works. Keyboard: the waveform is a `slider` (Left/Right ±5 s, Home/End, Space/Enter play or pause). Pure helpers: `audioPeaks(samples, bars?)` (normalised 0..1 per bar), `formatAudioTime(seconds)` (`"1:03"`, `"--:--"` when unknown), `audioSeekTime(x, width, duration)`, `AUDIO_WAVEFORM_BARS` (72).
- Code highlighting (0.8.0): `AfCodeBlock` (`text`, `language` = a file name or a language, `lineNumbers?`) — wraps long lines, never scrolls sideways; `highlightCode(text, codeLanguage(name))` is a dependency-free lexer (comment / string / number / keyword tokens; joining the tokens returns the input).
- Settings rows (0.8.0): `AfSettingsGroup` (titled card; `variant="flat"` inside another card; `aside` for e.g. "Revision 4"), `AfSettingRow` (label + one-line help left, control right; wraps in a narrow panel), `AfOverrideRow` — the "Gateway default unless overridden" row: summary (`Gateway default · x` or `<override> — <owner>`), **Change** opens the editor in place, **Use gateway default** only while overridden.
- Workspace folders (0.8.1): `WorkspaceChooser` — the one folder chooser of the console's per-account modal, AbstractCode and the AbstractAssistant (which copies `WORKSPACE_CHOOSER_TEXT` verbatim). It renders what the gateway's round-9 workspace API answers: **Shared workspace** (always on, never a switch), **Allowed folders** (one switch per `available_folders` entry, off until turned on; an entry the gateway marks `never_allowed` is shown unavailable), **My folders** (rows + **Add**, only while `own_folders_allowed`; otherwise one sentence says why) and "Agents may use: <summary>". Account mode: `<WorkspaceChooser state={GET /workspace/policy/{account} answer} onPut={(body) => …} />`, one PUT per change (`{enabled_folders}` or `{own_folders}`), a rejected PUT shows the error's message + "Not saved.". Automation mode: `<WorkspaceChooser mode="automation" effective={…} selection={string[] | null} onSelectionChange={…} />` — the automation's stored set (`input_data.workspace_allowed_paths`) chosen among the account's effective folders, `null` = follows the account. `workspaceChooserClient(request, account = "me", base = GATEWAY_API_PATH)` wraps GET/PUT and refuses an answer without the round-9 model. Round 9 amendments: a posture badge (`effective.posture`: "Only allowed folders" / "Any folder except denied"), ONE list with the inline add row, never-allowed chips, the "any folder" note (`effective.any_folder`) and a Read-only / Read & write permission per folder row (`mode` "ro"/"rw"; lower, never raise; shared = Read & write). No policy logic: only folders the gateway lists can become switches (`check_workspace_chooser.mjs`).
- Voice section (0.8.0): `AfVoiceSection` — the Assistant's Settings → Voice layout, four groups: **Engines** (Text → speech, Speech → text as `AfOverrideRow`s), **Output** (output device where `audioOutputSelectable()`, with a **Test** chime on the chosen speaker; Reply volume), **Microphone** (input device; **Test** records 3 s with a live level meter and plays it back, or says why it could not: blocked, no device, device gone, in use, silence; Spoken language, which rides on transcription requests and skips detection; Input level 50–150 % where Web Audio allows) and **Replies** (Read aloud switch; Voice latency from `VOICE_LATENCY_OPTIONS`, only when the gateway advertises `quality_preset`). Device names appear after one microphone permission (**Show names**). Safari cannot choose a speaker: the picker stays on System default and says so. Required prop `fetchDefaults: () => Promise<VoiceDefaults>` (`GET /api/gateway/voice/defaults`, the gateway's `output.voice` / `input.voice` routes) is the only source of "Gateway default · provider / model" ("not set" / "unknown" otherwise); `defaults` passes them when the host already holds them. Value `VoiceClientPreferences` (`VoicePreferences` + `stt_provider`, `stt_model`, `stt_language`, `output_device`, `input_device`, `input_gain`, `reply_volume`, `read_aloud`); `voiceTtsRequest()` / `voiceSttRequest()` pick what a request carries (`voiceSttRequest` sends `language`). `nested` renders its sub-sections flat. Helpers (`voice_devices.ts`): `voiceDefaultSummary`, `sttRouteText`, `transcribingLine`, `microphoneErrorSentence`, `listVoiceDevices`, `unlockDeviceLabels`, `recordSample`, `playTestTone`, `playOnDevice`.
- Relative time (0.8.0): `formatRelativeTime(ts, nowMs)` ("just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then "Oct 2"; future "in 14 h"), `formatExactTime(ts)` ("Oct 2, 2026, 14:05"), `formatShortDate(ts, nowMs)`, `timeValueMs(ts)` — deterministic (the caller passes now), no seconds, no year within the same year.
- Icons (0.8.0): `cog` (the usual settings gear; `settings` stays the sliders glyph), `activity` and `unarchive` (archive box with an up arrow).
- App chrome: `AfTopBarActions` (assistant → appearance → about → extras → connection pill; `about={{ identity, versions?, onOpen?, label? }}` adds the About button and dialog), `AfDrawer` (non-modal, keeps children mounted; `side="left"`, `backdrop`; full width below 768 px), `AfAppearanceDialog` + `useAppearanceSettings()` / `appearanceStorageKey()` / `APPEARANCE_DEFAULTS`
- About (0.8.0): `AfAbout` (inline card: `identity`, `versions?`, `titleId?`, `action?`, `className?`) and `AfAboutDialog` (`open`, `onClose`, `identity`, `versions?`; modal, Escape and a click outside close it, Close button in the heading row). The card shows the app's name and version, the AbstractFramework and AbstractGateway versions, six links (Website, Source, Docs, Issues, Feedback, and Contact as a mailto) and the copyright and licence line — never a package list. `versions: AfAboutVersions` = `{ framework?, frameworkNote?, gateway?, gatewayNote? }`; a missing version shows its note, else "not reported" / "not connected". `aboutVersionsFromGateway(payload | null, error?)` builds it from `GET /api/gateway/about` (only the framework and gateway versions are read; "not installed on the gateway host" when the gateway reports no framework; "unavailable (reason)" on failure). Helpers `aboutLinks(identity)`, `aboutVersionFacts(versions)`.
- Identity: `appIdentity(id, version): AppIdentity` (throws on an unknown id), `frameworkIdentity(): FrameworkIdentity`, `knownAppIds()`, `aboutRows(identity, extra?): AboutRow[]` (the ordered About rows, same as the Python `abstractcore.utils.identity.about_fields`), `gatewayVersionRows(payload: GatewayAboutPayload | null, error?: string): AboutRow[]` (the connected gateway's version rows from `GET /api/gateway/about`) — both kept for parity with the Python twins; the About card does not render rows; types `AppIdentity`, `FrameworkIdentity`, `AboutRow`, `GatewayAboutPayload`. See [About dialog and identity](../ui-kit/README.md#about-dialog-and-identity)
- CSRF helpers: `readGatewayCsrfToken()`, `readGatewayCsrfTokens()`
- Voice: `useGatewayVoice()` (TTS playback incl. streaming with pause/resume, push-to-talk capture; injected transports) + `streamTtsJsonl()`. Options `output_device_id` (playback through `AudioContext.setSinkId`), `input_device_id` (records from that microphone; a missing device fails with a sentence, never another microphone), `volume`, `input_gain`, `stop_on_pointerup: false` (tap-to-start / tap-to-stop hosts stop recording themselves); returns `voice_ptt_since` (for "Transcribing… 12 s · faster-whisper / large-v3"); `transcribe` may return `{ text, provider, model }`; every failure becomes one sentence; `VoiceSettings` (catalog-driven voice preferences form)
- Cognition and phase surfaces: `AfPhaseRadio` (+ `RULED_PHASES`, `PHASE_DESCRIPTORS`, `normalizePhase()`, `reconcilePhaseList()`), `AfCognitionBloom` (+ bloom core: `createBloomState()`, `tickBloom()`, `drawBloomFrame()`, …), `AfConductGauge` (+ `conductAxes()`), `AfMemoryHintChip`
- Automations: `AutomationPanel` (one automation: controls, runs as chat pairs, typed wait answers), `AfScheduleDialog` (create an automation on a fixed UTC interval, once, or when an email arrives; "Email result" and result recipients), the email fields `AfEmailTriggerFields` / `AfEmailOptionsFields` / `AfEmailSetupNotice`, `createAutomationsClient()` (one method per Gateway automation route, errors thrown as `AutomationApiError`), plus the pure presentation rules, retry-safe id helpers and the contract types. The complete list is in [Automations: Exports](./automations.md#exports)
- Modal and account rows: `AfModal`, `bindAfModal()` (+ `afModalTabTarget()`, `afModalFocusables()`, `AF_MODAL_FOCUSABLE`), the helper floors `HELPER_MIN_PX`, `HELPER_MIN_TOUCH_PX`, `HELPER_TOUCH_MEDIA` — see [Modal, account rows, grouped navigation](./modal.md)
- On/off settings and forms: `AfSwitch`, `AfSwitchInput` (a native `role="switch"` checkbox for uncontrolled forms) (+ `afSwitchNextState()`, `afSwitchIsActionable()`), `AfTabs` (+ `afTabsNextIndex()`), the guards `findVerbToggleLabels(source)` and `checkLabelScale(root)` (+ `LABEL_SCALE_SELECTOR`) — see [On/off settings](./state-toggles.md)
- Workflow picker: `WorkflowPicker` (the one workflow chooser of every client: "Gateway default", then the groups "Shared" and "Mine", each entry with its version as a small detail line; no toggles), `useExecutableWorkflows({ interfaceId, request? | gatewayBaseUrl?, allVersions?, enabled?, reloadKey? })` (fetches `GET /api/gateway/bundles?executable_for=<interface>` with the app's own auth), `WorkflowPickerListbox`, and the pure core `executableWorkflowsPath()`, `parseExecutableWorkflows()` (throws `WorkflowPickerContractError` when the gateway ignores `executable_for`: no echo, an item without `owner`/`shipped`, an entrypoint that does not declare the interface), `workflowPickerGroups()`, `workflowPickerRows()`, `WORKFLOW_PICKER_DEFAULT` (`"@default"`), `WORKFLOW_PICKER_EMPTY`. The picker lists exactly what the gateway returns: which workflows a person sees is the gateway's availability rule (admins decide what is shared with users; users also see their own), never a client switch. Two modes: per interface (`interfaceId="abstractcode.agent.v1"`, for an app that runs one interface) and any interface (`interfaceId={null}`, for a launcher such as AbstractObserver: `GET /api/gateway/bundles`, every entrypoint that declares an interface, the interfaces as the detail line, `defaultInterface` names the interface "Gateway default" stands for); helpers `workflowPickerPath()`, `allWorkflowsPath()`, `parseWorkflowListing()`.
- Ids and non-secure contexts: `randomId()` (v4 UUID over plain http too), `uuidV4FromBytes()`, `insecureContextReason(feature)` — see [Non-secure contexts](./state-toggles.md#non-secure-contexts)
- Icons: `Icon`, `IconName` (~45 glyphs, 24-grid and 16-grid families; `play`, `stop`, `folder`, `file`, `archive`, `unarchive`, `clock` added for automations)
- Palette seeds: `@abstractframework/ui-kit/palette_seeds.json` (generated 4-token palette per theme)

See: [`ui-kit/README.md`](../ui-kit/README.md) and the [Adoption guide](./adoption-guide.md).

### Console islands (repository build, not an npm export)

`ui-kit/islands/console_islands.tsx` builds into `ui-kit/islands/dist/af-console-islands.js`, a
self-contained script that defines `window.AfConsoleIslands` (`apiVersion` `"2"`, `kitVersion`,
`themes`, `fontScales`, `headerDensities`, `mountTopBar(el, props)`,
`mountAppearance(el, props)`, `mountAbout(el, props)`, `appIdentity(id, version)`,
`aboutVersionsFromGateway(payload, error?)`, `applyAppearance(settings)`). Build it with
`npm run build:islands -w @abstractframework/ui-kit`. It is not included in the npm tarball.
Full reference: [Console islands](./console-islands.md).

`SpeculationSelect` consumes `execution.speculation` from the host capability payload. It
offers inheritance (`undefined`), Off (`false`), and only advertised depths. Explicit depths
serialize as `{mode: "native_mtp", num_draft_tokens: n, require_acceleration: true}`. It shows
readiness/reload reasons and preserves unavailable saved choices; it never infers support
from model names, performs network requests, downloads artifacts, or loads a model. Hosts
own persistence and provider/model/endpoint-scoped discovery.

## `@abstractframework/panel-chat`

Purpose: chat-thread UI primitives with lightweight Markdown/JSON rendering.

- Primary exports: `panel-chat/src/index.ts`
- CSS: `@abstractframework/panel-chat/panel_chat.css` (file: `panel-chat/src/panel_chat.css`)

Components:
- `DocsAssistantDrawer` (0.4.0) — the Docs assistant of the console and every app: kit drawer + panel-chat thread (user right, assistant left; Markdown, code, JSON, links, images per the image policy; copy), attachments (`attachments/upload` to the conversation's session → `context.attachments`), streaming (`llm.delta` on `runs/{id}/ledger/stream`), Stop, icon-only New conversation and close, one-line grounding footer. Props `open`, `onClose`, `source: { app, name }`, `fetchGateway`, `connected`, `suggestions?`, `placeholder?`, `width?`, `topOffset?`, `className?`. Grounding: `GET api/gateway/docs/corpus?app=<id>` → the shipped `docs-qa` workflow (`DOCS_QA_WORKFLOW`); one gateway session per conversation. Exports `DocsAssistantPanel` (stateless view), `makeDocsQaAsk`, `docsQaStartBody`, `docsCorpusPath`, `docsAnswerFromRun`, `docsReplayNote`, `newDocsSessionId`, `sseFrames`
- `AssistantPanel` (docs Q&A surface with an injected `ask(question, { signal, history })` transport returning a Promise or an AsyncIterable of deltas; never fetches)
- `WorkflowChat` + `WorkflowInteractionPanel` (controlled workflow chat and pending `ask-user` / `tool-approval` / `event-wait` interactions; `streamReplies?: "gateway_default" | "on" | "off"`); `WorkflowSessionController`, `useWorkflowSession`, `workflowPendingInteraction()`, `resolveWorkflowEventTarget()` (injected `WorkflowTransport`)
- Live replies: `WorkflowTransport.streamLedger(runId, after, onStep, signal, onOpen?, onDelta?)` — `onDelta(event: LlmDelta | LlmDeltaEnd)` receives the gateway's `llm.delta` / `llm.delta_end` frames (never the ledger cursor); `llmDeltaFromSse(eventName, data)`, `validateLlmDeltaEvent(value, eventName?)`, `isLlmDeltaEnd()`, `describeStreamUnavailable(detail?)`, `streamRepliesRuntime(mode)` (→ the `_runtime.stream` run-input entry), the event-name constants `LLM_DELTA_EVENT` / `LLM_DELTA_END_EVENT`; types `LlmDelta`, `LlmDeltaEnd`, `LlmDeltaEvent`, `LlmDeltaChannel`, `LlmDeltaEndReason`, `LlmStreamUnavailableDetail`, `StreamRepliesMode`; controller option `liveRenderIntervalMs` (default 60, also on `useWorkflowSession`). See [panel-chat README](../panel-chat/README.md#live-replies-streaming)
- File drop and paste: `WorkflowChat`'s `onFiles(files)` turns on the drop zone and paste-to-attach (folders are refused with a visible message); the pure helpers behind it are exported too: `dragCarriesFiles()`, `draggedFileCount()`, `dropZoneLabel()`, `droppedFiles()`, `folderRefusal()`, `pastedFileName()`, `pastedFiles()`, `DragPresence` (see `panel-chat/src/file_drop.ts`)
- `ToolActivity`, `ToolActivityGroup` (tool-call rendering), `StatDetailPanel` + `statDetail()` (token/time/tool statistics)
- `ChatThread` (thread container; renders a list of messages)
- `ChatMessageCard` (single message rendering; `message.title` names the speaker — assistants
  render their entity/agent name when provided, falling back to "Agent")
- `ChatMessageContent` (message body renderer; JSON autodetect + Markdown)
- `ChatComposer` (composer input + submit handling; IME-safe Enter)
- Automations: `ScheduleThisAction` (a "Schedule this…" header action) and `FromAutomationBadge` (a "from automation <title> · #<n>" marker); listed with their types in [Automations: Exports](./automations.md#exports)
- `presentInteraction(wait, controller, { records?, currentRun?, onPermissionsAll? })` — the one mapping from a runtime wait (`workflowPendingInteraction(snapshot)`) to the `WorkflowChat` `interaction` control: tool approval (targets via `ToolActivityGroup`, full arguments behind a disclosure; Allow once / Deny, plus "Allow all enabled tools" only with `onPermissionsAll`), question (`ask_user`, choices and free text) and event wait (routed with `resolveWorkflowEventTarget`, refused when unroutable); subworkflow waits are `null`. Types `PresentInteractionOptions`, `InteractionController`
- `WorkspaceBrowser` — a run's folder on the gateway host through the CONTRACTS §W routes (`GET /runs/{id}/workspace`, `/workspace/files`, `/workspace/content`): the root once as its short name (`workspaceShortName`; full path on hover) with **Open folder** (`onOpenFolder`, offered only when `workspaceCanOpenFolder`) and **Copy path** icons, breadcrumbs, folders first, then per file: name, size, generated date (relative, exact on hover) and a Download icon; "N entries hidden by the gateway's workspace rules". A click on a file previews it IN PLACE with `FileViewer` (0.3.1: no "Open" button; `fileActions(entry)` adds host actions such as "Attach"), or `onSelectFile` + `selectedPath` hand the selection to a host preview. Files are fetched with the host's credentials, never linked. Props: `fetchGateway(path, init)`, `runId` (an automation's id browses the automation's folder), `title`, `note?`, `onClose?`, `refreshKey?`, `className?`, `fileActions?`, `onOpenFolder?`, `copyText?`, `nowMs?`. Hook-free `WorkspaceBrowserView` and helpers: `loadWorkspaceView()`, `loadRunWorkspace()`, `listWorkspaceFolder()`, `readWorkspaceFile()`, `parseWorkspaceListing()` (malformed answers throw), `gatewayResponseError()`, `tabOpenPlan()`, `workspaceInfoUrl()` / `workspaceFilesUrl()` / `workspaceContentUrl()`, `workspaceCrumbs()`, `workspaceParent()`, `sortWorkspaceEntries()`, `workspaceHiddenNote()`, `formatBytes()`; types `GatewayFetch`, `RunWorkspace`, `WorkspaceEntry`, `WorkspaceListing`, `WorkspaceBrowserProps`, `WorkspaceBrowserViewProps`
- `FileViewer` (0.3.1) — ui-kit `AfFileViewer` with panel-chat's `Markdown`; `useWorkspaceFilePreview(fetchGateway, runId, entry, refreshKey?)` loads one workspace file for it (a bounded Range read of at most `PREVIEW_TEXT_LIMIT` = 1 MiB for text kinds, an object URL for images, audio and PDF up to `PREVIEW_BLOB_LIMIT`, nothing for binaries; audio plays in the kit's `AfAudioPlayer`) and `filePreviewViewerProps(state)` maps the result; `readBoundedText()`, `responseTotal()`, `partialPreviewNote()`, `safeMarkdownImages()` (Markdown images only from the run's workspace)

Renderers:
- `Markdown` (lightweight Markdown with real nested lists, marker progression, fenced code
  blocks incl. inside lists; `images?: "inline" | "link"` + `inlineImage?(src)`, default rule
  `sameOriginImage()` (exported); types `MarkdownProps`, `MarkdownImages`; see `panel-chat/src/markdown.tsx`). `ChatMessageCard` uses `images="link"`
  for every message except the user's own.
- `JsonViewer` (collapsible tree; honors `collapseAfterDepth`; auto-parses JSON strings)

Types:
- `ChatMessage` (message model rendered by `ChatThread` and `ChatMessageCard`; optional `live: ChatLiveReply` (`callId`, `reasoning`, `caption?`) marks a reply still being streamed), `ChatLiveReply`, `ChatAttachment`, `ChatMessageLevel`, `ChatStat` (see `panel-chat/src/chat_message_card.tsx`)

Utilities:
- `tryParseJson()` (drives JSON autodetection in `ChatMessageContent`)
- `chatToMarkdown()`, `copyText()`, `downloadTextFile()`
- Workflow evidence: `workflowProgress()`, `workflowEvidence()`, `foldWorkflowTools()`, `historyRecords()`, `toolArguments()`, `toolPreview()`

Customization point:
- `ChatMessageContent` supports `renderMarkdown?: (markdown: string) => React.ReactElement` (see `panel-chat/src/message_content.tsx`).

See: [`panel-chat/README.md`](../panel-chat/README.md) and [FAQ](./faq.md) (search for “panel-chat”).

## `@abstractframework/app-server`

Purpose: the server side every browser app shares: serving under the gateway's
`/apps/<id>/` (mount), the launch flags, the local gateway pointer, and the **gateway session
proxy** (the server-side half of the connection surface — pairs with
`GatewayConnectModal`/`useGatewayConnection`).

- Mount: `createMountedHandler({appId}, handler)`, `requestContext(req)` →
  `{clientAddress, clientIsLoopback, basePath, proto, host, forwarded}` (forwarded headers
  believed from a loopback peer only), `injectShell(html, {basePath, config})`,
  `appPath`, `cookiePath`, `serializeCookie`, `parseCookies` (first value wins),
  `setIdentityHeader` (`X-AbstractFramework-App: <id>; mount=1`), `rejectUpgrade`,
  `validateBasePath`, `MountRequestError`. See
  [`app-server/README.md`](../app-server/README.md#serving-under-the-gateway-appsid).
- Flags: `parseAppFlags` / `parseAppFlagsOrExit` (`--gateway-url` with `--gateway`/`--url`
  aliases, `--port`, `--host`, `--help`; env only as legacy alias).
- Gateway pointer: `resolveGatewayUrl`, `createGatewayUrlResolver`, `readGatewayPointer`
  (`~/.abstractframework/gateway.json`; shared cases in
  `ui-kit/scripts/fixtures/gateway_pointer/`).
- Session proxy: `createGatewaySessionProxy(options)`, `normalizeGatewayUrl()` (see `app-server/src/index.js`, types in `app-server/src/index.d.ts`)
- What it does: exchanges a Gateway user token for HttpOnly session cookies
  (`POST /api/connection/gateway`), proxies `/api/gateway/*` with the server-held session,
  enforces CSRF on mutating requests, pins the Gateway URL for non-loopback clients, and strips
  credential-bearing headers in both directions. Tokens never rest in the browser. Every call
  to the Gateway carries `X-Forwarded-For` set to the browser's address
  (`requestContext(req).clientAddress`; written once, never appended) and
  `X-AbstractFramework-App-Proxy: <appId>` (a client-supplied value is dropped). A connection
  whose socket address cannot be determined gets `400`.
- Options (`GatewaySessionProxyOptions`): `appId` (required, `[a-z0-9-]+`; names the cookies and
  the `x-<appId>-csrf` header), `defaultGatewayUrl` (else `ABSTRACTGATEWAY_URL`, else
  `http://127.0.0.1:8080`), `connectionPath` (default `/api/connection/gateway`), `proxyPrefix`
  (default `/api/`), `gatewayTimeoutMs` (default 4000), and `allowRemoteConfigEnvVars` /
  `allowUrlCookieEnvVars` / `trustProxyEnvVars` (extra environment variable names honored beside
  the built-in `ABSTRACTGATEWAY_*` and `<APPID>_*` ones). See
  [`app-server/README.md`](../app-server/README.md#options).
- Tests: `npm --workspace app-server test` (dependency-free; runs
  the session proxy, mount and flags/pointer tests against stub gateways and the fixture app).

See: [Adoption guide](./adoption-guide.md) for the full connection-surface contract.

## `@abstractframework/monitor-flow`

Purpose: inspect **agent execution cycles** from trace/ledger-like records.

- Primary exports: `monitor-flow/src/index.ts`
- CSS: `@abstractframework/monitor-flow/agent_cycles.css` (file: `monitor-flow/src/agent_cycles.css`)

Components:
- `AgentCyclesPanel` (main UI)

Types:
- `TraceItem`, `TraceStep` (see `monitor-flow/src/AgentCyclesPanel.tsx`)

Adapter:
- `build_agent_trace(ledgerItems, { run_id })` to turn “ledger-like” items into `TraceItem[]` (see `monitor-flow/src/agent_cycles_adapter.ts`)
- Types: `LedgerRecordItem`, `StepRecordLike`, `AgentTraceBuildResult`

See: [`monitor-flow/README.md`](../monitor-flow/README.md) and [Architecture](./architecture.md) for the host-driven data flow.

## `@abstractframework/monitor-active-memory`

Purpose: ReactFlow-based explorer for **Knowledge Graph assertions** (`KgAssertion`) and derived **Active Memory** text.

- Primary exports: `monitor-active-memory/src/index.ts`
- CSS: `@abstractframework/monitor-active-memory/styles.css` (file: `monitor-active-memory/src/styles.css`)
- Peer dep: `reactflow@^11` (see `monitor-active-memory/package.json`)

Component:
- `KgActiveMemoryExplorer` (+ `KgActiveMemoryExplorerProps`)

Host contracts:
- Types: `KgAssertion`, `KgQueryParams`, `KgQueryResult`, `MemoryScope`, `RecallLevel` (see `monitor-active-memory/src/types.ts`)
- The component calls `onQuery(params)` when the user runs a query / expands neighborhoods (see `monitor-active-memory/src/KgActiveMemoryExplorer.tsx`).

Graph/layout utilities (for advanced hosts):
- `buildKgGraph()`, `shortestPath()`, `buildKgLayout()`
- Force simulation helpers: `initForceSimulation()`, `stepForceSimulation()`, `forceSimulationEnergy()`, `forceSimulationPositions()`

See: [`monitor-active-memory/README.md`](../monitor-active-memory/README.md) and [FAQ](./faq.md) (search for “monitor-active-memory”).

## `@abstractframework/monitor-gpu`

Purpose: dependency-free GPU utilization widget implemented as a **Custom Element**.

- Primary exports: `monitor-gpu/src/index.js`
- Types: `monitor-gpu/src/index.d.ts`

Registration + custom element:
- `registerMonitorGpuWidget()` defines `<monitor-gpu>` (see `monitor-gpu/src/monitor_gpu_widget.js`)
- `MonitorGpuElement` typing is declared in `monitor-gpu/src/index.d.ts` (includes `mode: "full" | "icon"`)

Imperative controller:
- `createMonitorGpuWidget(target, options)` returns `MonitorGpuWidgetController` (start/stop/destroy; update options)

Low-level helpers (backend integration):
- `makeGpuMetricsUrl()`, `fetchHostGpuMetrics()`
- `buildAuthHeaders()`, `resolveBearerToken()`
- `extractUtilizationGpuPct(payload)` (supported payload formats documented in `monitor-gpu/README.md`)

See: [`monitor-gpu/README.md`](../monitor-gpu/README.md) for the backend contract and security notes.

## `@abstractframework/monitor-memory`

Purpose: dependency-free host RAM + device (GPU/accelerator) memory meter implemented as a **Custom Element**.

- Primary exports: `monitor-memory/src/index.js`
- Types: `monitor-memory/src/index.d.ts`

Registration + custom element:
- `registerMonitorMemoryWidget()` defines `<monitor-memory>` (see `monitor-memory/src/monitor_memory_widget.js`)
- `MonitorMemoryElement` typing is declared in `monitor-memory/src/index.d.ts` (includes `mode: "full" | "icon"`)

Imperative controller:
- `createMonitorMemoryWidget(target, options)` returns `MonitorMemoryWidgetController` (start/stop/destroy; update options; `unsupported` verdict)

Low-level helpers (backend integration):
- `makeMemoryMetricsUrl()`, `fetchHostMemoryMetrics()`
- `buildAuthHeaders()`, `resolveBearerToken()`
- `extractMemoryUsage(payload)` (supported payload formats documented in `monitor-memory/README.md`)

See: [`monitor-memory/README.md`](../monitor-memory/README.md) for the backend contract, unsupported-endpoint behavior, and security notes.

## Related docs

- Getting started: [Getting started](./getting-started.md)
- FAQ: [FAQ](./faq.md)
- Architecture (diagrams): [Architecture](./architecture.md)
- Console islands: [Console islands](./console-islands.md)
- Automations: [Automations](./automations.md)
- Troubleshooting: [Troubleshooting](./troubleshooting.md)
- Docs index: [Docs index](./README.md)
- Security policy: [`SECURITY.md`](../SECURITY.md)

Automation creation and editing accept `availableTools` to show `AutomationToolsPicker`. Its value is `null` for workflow defaults or a list of enabled names; `[]` disables all tools. `automationToolSelection()` intersects saved tools with their runtime ceiling, and `withAutomationTools()` updates both tool fields while preserving other inputs.

`AutomationWorkflowPicker` reuses the shared workflow menu for automation targets.
Pass `workflowPickerOptions` to `AutomationPanel` to enable workflow changes and
provide its Gateway `request` function for required-input checks, or supply
`prepareTarget` to reuse a host’s schema validator. `AfScheduleDialog.workflowPicker`
accepts the creation form’s picker. Changing workflows retains portable agent settings;
workflow-specific inputs use the new workflow’s defaults.
