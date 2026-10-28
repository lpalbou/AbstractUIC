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
- Inputs: `AfSelect`, `ThemeSelect`, `ProviderModelSelect`, `ProviderModelPicker` (gateway-default mode + provider→models cascade, injected transports), `FontScaleSelect`, `HeaderDensitySelect`, `ToolModeEditor` (tool selection, below), `ToolPolicyEditor` (deprecated for one minor in favour of `ToolModeEditor`; reads the served `approval_default` first, `default_approval` as an alias, and renders a row decided by `TOOL_POLICY_DEFAULTS` with the "Kit default" label; a tool's optional `state` = a server-reported badge with the kit tooltip; `toolPolicySelectionToLayer(selection, catalog)` converts its value to a sparse app layer), `MultiSelect`
- MTP: `SpeculationSelect`, `speculationCapability()`, `normalizeSpeculationValue()`,
  `speculationSelection()`, `speculationFromSelection()` and `SpeculationValue` /
  `SpeculationCapability` types. Enable `ProviderModelPicker`'s `enableSpeculation` for text
  routes; its injected `fetchModelCapabilities(model, provider)` returns the Gateway payload.
  `inheritLabel` names the inherit choice of the reasoning and MTP selects (default
  "Workflow / Gateway default"; a host without workflows says "Gateway default").
  `optionsInDefaultMode={false}` takes the gateway default whole: reasoning and MTP appear only
  once a custom provider/model is chosen (for hosts that store them only with a pinned model,
  such as an entity's mind).
  Picker props added by backlog 0034 (all optional, existing props unchanged):
  `fetchGatewayDefault: () => Promise<GatewayModelDefault>` names the default: the default
  choice reads "Gateway default · {provider} / {model}[ · reasoning {r}][ · MTP depth n]", and
  the fetched default drives capability discovery when `effectiveDefault` is absent; it is read
  again whenever the host passes a new function (pass a stable `useCallback` keyed by the
  identity, so a sign-in re-reads it); "none configured" reads "Gateway default · none
  configured", an unreadable default (a throw, or `{ok: false, errors}`) reads "Gateway default"
  with "The gateway's default could not be read: …", and a default the gateway warns about
  (`warnings`) is not named: its warning is shown instead; `reasoningLadder: string[]` (from `discovery/capabilities`,
  `reasoningLadderFrom`; never hardcoded) lists the ladder with the levels the model does not
  advertise disabled, not hidden; `unknownReasoning: "hide" | "allow-override"` (default "hide")
  — with "allow-override" and a ladder, a model with no served reasoning facts shows the select
  locked with a **Set anyway** checkbox; a model that serves `thinking_support: false` shows no
  select; `layout: "segmented" | "compact"` — compact drops the Gateway default | Custom segment
  for provider/model selects whose first option is the named default, providers listed at once
  (node panels); `pinned: {provider?, model?, reasoning?, speculation?}` shows "Provided by
  connected pin" (`PINNED_FIELD_TEXT`) instead of those controls. A saved provider, model,
  reasoning level or MTP depth the gateway no longer lists stays selectable as "x (saved)" — only
  the value the picker was mounted with, never a value typed now, never while that list failed
  (`ProviderModelSelect` `markSaved: boolean | {provider?, model?}`, `providerPinned`, `modelPinned`). MTP choices keep
  `require_acceleration: true` (the gateway console's Defaults modal writes `strict=false`; not
  aligned here).
- Tool selection (backlog 0033, ADR 0001): `ToolModeEditor` edits ONE sparse layer of tool
  modes `off | ask | auto` ("Off / Ask / Auto"; `labels` relabels) on top of what it inherits.
  Props: `catalog` (from `normalizeToolCatalog`), `layer: "app" | "session"`, `value` (this
  layer's diffs), `inherited` (`inheritedToolModes(catalog, layers, layer)`; missing = the
  gateway default), `onChange(next)`, `onReset?` (shown while the layer holds a diff: "Use the
  gateway's" for the app layer, "Use my defaults" for the session layer), `allowListOnly?` (Off /
  On; On keeps the inherited approval), `disabled?`, `toolMode?` / `toolModeLabel?` /
  `toolModeDetail?` / `note?` (the ToolPolicyEditor banner), `warnings?` (the catalog's, in the
  gateway's words), `savedWhere?` (e.g.
  `TOOL_LAYER_STORE_WHERE`), and `rowLabel?` / `rowHelp?` / `open?` / `onToggle?` to frame it in
  an `AfOverrideRow` ("Gateway default · n tools on, m without asking", "<n> tools changed — this
  app | this chat", "Your defaults — this app" for a session over changed app defaults).
  Rows are grouped by `toolset` with a group control (Mixed when its tools differ; group Auto
  reaches only risk rank ≤ 2 tools whose destination the model does not choose, and says so:
  `BULK_AUTO_CAP_SENTENCE`), a search box, risk and state badges, the gateway's reason for a tool
  it does not offer, and a "Default: X" chip on a row that overrides the layer below.
  `ToolModeEditorForPayload` takes the served answer as `catalog` (normalizes it, shows
  `catalog_warnings`, renders "Tools unavailable: …" for a broken or failed answer; the console
  island uses it). A row counts as changed (frame summary, chip) only when its mode differs from
  what it inherits, the same rule the run plan uses.
  Pure helpers (`tool_plan.ts`): `normalizeToolCatalog(payload)` (`GET discovery/tools`; throws
  without `items[]` and on the gateway's failure answer `{items: [], error}`;
  `toolCatalogWarnings(payload)` returns `catalog_warnings`; `offered = enabled !== false && available !== false`; `gatewayDefault` from
  the served `approval_default`; a row without it gets `defaultUnserved: true`, Ask assumed, and the editor says so), `normalizeToolMode(v, "entity" | "desktop")` ("approve" is ask
  in the entity dialect and auto in the desktop / kit v1 dialect; refused without a dialect),
  `toolModeInDialect`, `resolveToolModes(catalog, {app, session})` → `{mode, source, inherited}`,
  `setToolMode` / `setGroupToolMode` (a diff equal to the inherited mode is deleted),
  `BULK_AUTO_MAX_RANK` (2), `bulkAutoReaches`, `effectiveToolLayers(catalog, layers)` (only the
  canonical modes of offered tools that differ from what their layer inherits: a key for a removed
  or not-offered tool, a bare "approve", or a diff the gateway's default caught up with is no
  choice), `hasToolChoices(catalog, layers)`, `planRunTools(catalog, layers,
  {ceiling})` → `{tools, allowed_tools, tool_policy?, approval}`, `withRunTools(input_data,
  plan)` (writes `tools`, `_runtime.allowed_tools`, and `_runtime.tool_policy` once any layer
  holds a choice; with none, the key is omitted and a stale one removed so the gateway's stored
  grant applies), `toWorkflowApprovalPolicy(plan)` (panel-chat `{enabledTools,
  autoApproveTools}`), `trustAfterApproveAll(catalog, modes, call, prev)` (the watch rule: tools
  on Ask up to rank max(2, the call's rank), never outreach nor a model-chosen destination),
  `approvalCovered(modes, trust, call)`. Storage until the gateway serves tool layers:
  `createToolLayerStore(toolIdentityKey({gatewayUrl, tenantId, runtimeId, userId}))` →
  `readApp/writeApp(interfaceId)` (`af.tools.app.<interface>.<identity>`),
  `readSession/writeSession(sessionId)` (`af.tools.session.<identity>.<session_id>`, newest
  `TOOL_SESSION_LAYERS_MAX` = 100; a lost or corrupt index is rebuilt from the stored keys),
  `sessions()`; options `dialect` (read another writer's "approve") and `onDropped(key, names)`
  (told when stored values could not be read); it is browser storage ("Saved in this
  browser"), never "saved for this Gateway account".
- A chat's tool policy on the gateway (0.9.0, session tool policy contract v1;
  `session_tool_policy.ts`): the gateway stores "approve these tools / kinds / everything",
  "deny these", "keep asking for these" per `session_id`, and the runtime applies it BEFORE any
  approval wait (a covered call runs with no wait, a denied call is refused with no wait). Deny
  reaches every run of the session, automations and untrusted-input runs included; approve never
  reaches automation, untrusted-input or entity-visit runs. The session id is the run tree's ROOT
  session (the runtime reads the root's grant). The user-facing noun is "chat" (ADR 0001 §5).
  `sessionToolPolicyCapability(payload)` reads `capabilities.session_tool_policy` of
  `GET discovery/capabilities` (null on an older gateway). `createSessionToolPolicyClient(request,
  sessionId, capability, {client})` → `SessionToolPolicyClient` `{supported, sessionId, get(),
  replace(body), merge(body), reset()}` over `GET | PUT | POST | DELETE
  sessions/{session_id}/tool-policy` (`sessionToolPolicyRoute`; the id must match
  `SESSION_ID_PATTERN`, 1-256 `[A-Za-z0-9_.:-]`, never only dots). The client keeps the revision of
  every answer (`client.revision`: GET's top-level `revision` also with no policy, PUT/POST
  `policy.revision`, DELETE `revision`) and the served `scope` (`client.scope`, also copied onto the
  policy untouched: `{approve, deny}` sentences, never composed); `reset(ifRevision?)` sends
  `DELETE ?if_revision=` (GET's top-level revision and DELETE's `if_revision`). POST (`merge`) only ADDS (it never
  narrows nor re-expands an earlier all / kinds); a method the capability does not list is not sent. `request(path, {method, body})` is the host's
  (credentials, base URL) and rejects with `{status, body}` / `{status, detail}` on an error; a 409
  `revision_conflict` rejects with `SessionToolPolicyConflictError` (`revision` = the stored one);
  `clamped` is passed through untouched; `supported` is true only for `supported: true`, and an
  unsupported client rejects every call with `SessionToolPolicyUnsupportedError` ("The gateway
  cannot store chat tool policies", `SESSION_TOOL_POLICY_UNSUPPORTED`). Types:
  `SessionToolPolicyBody`, `SessionToolPolicy`, `SessionToolPolicyCapability`.
  Bridge: `sessionPolicyFromLayer(layer, catalog, {base, inherited})` maps a session layer to a PUT
  body (auto → `approve.tools`, ask → `ask`, off → `deny.tools` for offered tools). With `base` (the
  policy last read) it carries what this catalog cannot see: approve / deny / ask entries of tools it
  does not offer (an MCP server down, a toolset disabled for now) and the request's `approve.kinds`,
  `approve.all`, `approve.max_risk_rank`, `deny.kinds`; a tool a carried selector covers is put in
  `ask` when its mode here (or `inherited`) is Ask. `all` / `kinds` include model-chosen-destination
  tools (fetch_url, browser_probe, send_email); at Ask they are always in `ask`.
  `sessionPolicyBodyIsEmpty(body)`. Limit: `deny` refuses a call
  with no wait, which is stricter than "not offered"; the run's own ceiling (`allowed_tools` from
  `planRunTools`) still keeps off tools out of the run. `layerFromSessionPolicy(policy, catalog)`
  maps back (approve → auto, deny → off and wins, ask → ask); the gateway serves `approve` / `deny`
  already expanded to tool names (the selector "tool", "kind:<id>" or "all" is the value), so the kit
  never re-expands a selector against today's catalog: a tool enabled after an `all` / `kinds` write
  is not covered and keeps asking. `sessionPolicyClampedLines(policy)` ("Not covered: send_email
  (not_authorized)"), `policySetLine(policy)` ("Set by admin (panel-chat) on …").
  `createToolLayerStore(identity, {sessionPolicy: (sessionId) => client})`: `sessionStorage(id)`,
  `loadSession(id, catalog)`, `saveSession(id, layer, catalog, {inherited})` and `resetSession(id)`
  go through a supported client and answer `{storage, layer, policy, scope}` with the gateway's
  effective layer. Every write is guarded: a PUT with `if_revision` and a DELETE with
  `?if_revision=` from the last read or reset (a 409 rejects with `SessionToolPolicyConflictError`:
  re-read); with no known revision (never loaded, or none served) the store refuses with
  `SessionToolPolicyRevisionError` ("The gateway did not return a policy revision; refusing an
  unguarded write"). Saves carry the last read's uncatalogued entries and selectors; a body that
  changes nothing resets. The store never POSTs: a merge cannot narrow. Without a supported client
  the layer stays in this browser (`storage.kind: "browser"`, "Saved in this browser"), and when the
  gateway was asked and cannot, `storage.note` says so (`TOOL_LAYER_BROWSER_FALLBACK`, a fact about
  storage: the choices apply only where the host applies the browser layer itself).
  `ToolModeEditor` `storage` (its `where` replaces `savedWhere`: "Saved for this chat on the gateway"
  / "Saved in this browser", plus the note), `policy` (clamped entries, who set it and when) and
  `scope` ("Approve applies to: …" / "Deny applies to: …" as served, else "The gateway did not say
  where this policy applies"); a gateway-stored chat also reads `TOOL_SESSION_OFF_HELP` ("Off =
  denied for every run of this chat, automations included"). Approve-all trust (`trustAfterApproveAll`) is for the browser fallback only: with a
  supported gateway, "Allow all" writes the policy (`merge`) first and then answers the shown wait.
- Gateway model routes (backlog 0034, `gateway_models.ts`): `gatewayTextDefault(payload)`
  (`GET config/capability-defaults`: provider/model of `output.text` then `input.text`, reasoning
  `routes[output.text].reasoning`, MTP `routes[input.text].options.speculation`; null when none is
  configured; throws without `routes[]` and on `{ok: false, errors}`; the gateway's `warnings` ride
  along as `warnings`), `gatewayDefaultSummary` / `gatewayDefaultLabel`,
  `reasoningLadderFrom(payload)` (`GET discovery/capabilities`), `createGatewayModelTransport(request)`
  → `{fetchProviders, fetchModels, fetchModelCapabilities, fetchGatewayDefault,
  fetchReasoningLadder}` over the host's `request(relativePath)`, and `withRunModel(input_data,
  value, {topLevelPins})` (`_runtime.{provider, model, thinking, speculation}`; a half pin
  throws; an inherited field's stale key is removed; top-level `provider`/`model` only with
  `topLevelPins`). Route constants: `GATEWAY_TOOLS_ROUTE`, `GATEWAY_PROVIDERS_ROUTE`,
  `GATEWAY_MODEL_CAPABILITIES_ROUTE`, `GATEWAY_CAPABILITY_DEFAULTS_ROUTE`,
  `GATEWAY_CAPABILITIES_ROUTE`, `gatewayProviderModelsRoute(provider)`.
- Voice: `VoiceSettings` (provider + model + voice from the Gateway catalog, grouped into Your voices / Engine voices / Shared voices (built-in and administrator-shared) with a language filter (voices with no language restriction always pass), and an optional `createVoice` panel (`VoiceCreation`: `design`, `clone`; a recording's language is detected unless chosen) that creates a voice through the gateway and selects it; "Gateway default"
  first). Host props: `intro` (`null` hides the paragraph), `delivery` (speed / quality /
  instructions, default on), `showReset`, `defaultHint` (names what the gateway default is) and
  `voiceDefaultLabel` (the voice select's unset choice). 0.9.0 (backlog 0035): `voiceLibrary`
  (`VoiceLibrary` = `VoiceCreation` & `{ list?, rename?, remove?, share? }` over `GET voice/clones`,
  `PATCH` / `DELETE voice/clones/{voice_id}` and `POST voice/clones/{voice_id}/deploy`; supersedes
  `createVoice`, which stays as an alias) adds **Manage voices** (`VoiceLibraryPanel`: the voices
  that can change, built-in ones are read-only and not listed; **Rename**, **Delete** asked twice,
  **Share** where the host injects `share`, i.e. for an administrator; a refusal is the gateway's
  sentence); The speech model list shows a cloning checkpoint (AbstractVoice `tts_model_details_by_provider`, role `"cloning"`,
  e.g. Qwen3-TTS Base) as "<id> (clones)" (0.9.2). `previewVoice(prefs, text?, opts?) => Promise<ArrayBuffer>` makes **choosing a voice play
  it** (host-injected: every gateway TTS route needs a run or an entity), played on
  `previewOn` (`{deviceId, volume}`): one play/stop toggle sits at the right of the voice select
  (play restarts from 0, stop stops and rewinds; busy while the sample is on its way, a click then
  cancels it), a newer choice aborts the older sample through `opts.signal` (pass it to the
  request) so fast choices never queue audio, a choice waits `VOICE_SAMPLE_DEBOUNCE_MS` (200 ms) so
  going through voices starts one synthesis, the voice just heard replays from its cached sample, and a failure is one line under the row (0.9.1;
  replaces 0.9.0's **Play sample** button); `recordFrom` (`{deviceId, gain}`) is the microphone
  `CreateVoicePanel`'s **Record** uses ("From a recording": **Record** / **Stop** beside the file
  picker, a live level meter, at most `VOICE_RECORDING_MAX_MS`, silence refused);
  `CreateVoicePanel.cloneRoute` (`{provider, model}`) names the cloning engine the clone request
  carries (`VoiceCreation.clone` accepts `provider` / `model`; absent = the gateway's default).
  One language label table: `VOICE_LANGUAGE_LABELS`; `voiceLanguagesFromAnswer(answer, kind,
  provider?)` reads a `GET voice/languages` answer; `voiceRecordId(record)`.
- Gateway connection: `GatewayConnectModal` + `useGatewayConnection()` (the connection state machine: boot probe, auto-open on resolved disconnect, self-close on sign-in), plus helpers `fetchGatewayConnection()`, `signInGateway()`, `signOutGateway()`, `gatewayStatusBadge()` (reads `GatewayConnectionState.gateway_status`, app-server 0.1.13: 0 "Gateway at <host> did not answer — is it running?", 502/503/504 "Gateway unavailable", other 5xx "Gateway error", other 4xx "check the gateway URL", 401/403 or no field "Session rejected — sign in again"; ui-kit 0.9.3), `normalizeGatewayUrl()`; `GatewaySessionSignInCard` is the underlying form card. `GatewayConnectionState.gateway` is the gateway's `GET /api/gateway/me` body relayed by the app server: `principal` (`GatewayPrincipalPayload`: `user_id`, `tenant_id`, `roles`, `scopes`, `token_fingerprint`, `runtime_id`, `source`, `admin`), `auth` (`mode`, `user_auth_enabled`), `routing` (`mode`, `one_user_one_runtime`). The hook's behaviour is pinned by `check_gateway_connection.mjs`.
- Signed-in principal (0.9.0, backlog 0036): `principalFromConnection(status)` → `AfPrincipal | null` (`userId`, `tenantId?`, `runtimeId?`, `roles?`, `scopes?`, `source?`, `admin?`; `displayName?` / `email?` / `avatarUrl?` are typed for a host that has them: the gateway serves none), null unless the status is connected (`isGatewayConnected`); `principalLabel(p)` — the one wording: display name, else user id, prefixed `tenant/` only when the tenant is not `default` (`AF_DEFAULT_TENANT`); `gatewayHostLabel(gateway_url)`.
- Phase capability matrix: `PhaseCapabilityMatrix` + a framework-free core (`validateMatrixPayload()`, `resolveCellView()`, `applyCellAction()`, `reconcilePatches()`, `serializeCellPatches()`)
- Critical actions: `CriticalActionDialog` + core (`resolveCriticalActionGate()`, `normalizeCriticalActionFacts()`)
- Run steering: `SteerComposer` + `submitSteer()` (idempotent command ids, CSRF candidates)
- Lists & badges: `DisclosureList` (tree list, roving tabindex), `AfChip` / `AfChipButton`
- Rail drawer (0.8.0): `AfRailDrawer` — the vertical rail drawer lifted from AbstractEntity's side tabs and Continuum Teams' drawer rail: an icon rail (role `tablist`, vertical; 44 px icons with tooltips; Up/Down/Home/End) at the right edge of the host's content area; a click opens that panel beside the rail, the open icon (or the panel's collapse button) folds it back; the rail always stays. Docked from 1024 px (in the layout flow; width resizable by pointer — mouse, pen, touch with pointer capture — and by keyboard on a `separator`, persisted under `storageKey`), floating below (backdrop, Escape folds it with the consumed-event rule, focus returns to the icon). Panels visited once stay mounted. Props: `items: AfRailItem[]` (`id`, `label`, `icon`, `badge?`, `hint?`, `content`, `headerActions?`), `active`, `onActiveChange(id | null)`, `ariaLabel`, `storageKey?`, `defaultWidth?`/`minWidth?`/`maxWidth?`, `overlay?`, `idBase?` (ids `<idBase>-tab-<id>` / `<idBase>-panel-<id>`). The host's container needs `position: relative`. Pure rules: `railDrawerToggle()`, `railDrawerClampWidth()`, `railDrawerKeyWidth()`, `railDrawerNextIndex()`, `AF_RAIL_WIDTH`. Since the shell work (backlog 0036) it is a thin wrapper over `AfDrawerSystem` (same markup; a numeric width stored by 0.8.9 and earlier is read as every panel's width).
- Drawer system (0.9.0, backlog 0036): `AfDrawerSystem` — the app's side panels, generalising `AfRailDrawer`. Panels (`AfDrawerPanel` = `AfRailItem` + `side?: "right" | "left"`, `mode?: "rail" | "drawer"` (drawer = no rail tab, opened by the host, e.g. the top bar's docs button), `keepAlive?: "visited" | "always"`, `errorBoundary?` (default true: a panel that throws shows "The <label> panel stopped: <reason>" with **Try again**, the other panels keep working), `fill?` (no padding, no scrolling: a canvas owns the viewport), `minWidth?`/`maxWidth?`/`defaultWidth?`) are OPAQUE: the system never inspects `content` (ADR 0001 §6), so a flow-diagram or memory-graph panel (backlog 0037, 0038) mounts without an API change. Props: `panels`, `active` (one id, or `{left, right}`), `onActiveChange(id | null, side)`, `ariaLabel`, `storageKey?` (ONE key: each panel's width and, while docked only, the open panel per side), `overlayBelow?` (media query, default `AF_MEDIA.md`), `overlay?`, `topOffset?: "auto" | number` (anchors the overlay under the app header; `"auto"` = `var(--af-topbar-h)`), `railLabelStyle?: "icon" | "vertical-text"`, `request?` (`"id#nonce"`: opens a panel; a new nonce re-requests), `onResize?(id, width)`, `restoreActive?`, `idBase?`, `className?`, `children` (the content between the sides; required with left panels). Each side publishes `--af-panel-w`. A panel's `headerActions` sit in their own small boundary (a failure shows a warning icon, not a broken header). `AfPanelHeaderActions` renders header actions from inside a panel's content (portal into the panel header; in place elsewhere). Pure rules: `railDrawerActiveFor`, `railDrawerSetActive`, `railDrawerParseRequest`, `railDrawerMounted`, `railDrawerReadStored` / `railDrawerWriteStored`, `railDrawerPanelWidth`, `railDrawerStoredActive`, `railDrawerTopOffset`, `railDrawerDragWidth`, `railDrawerKeyWidth(width, key, shift, min, max, side)` (`check_rail_viewer.mjs`).
- App shell (0.9.0, backlog 0036): `AfAppShell` (`topBar` = `AfTopBarActionsProps` + `brand?: {mark?, name, href?}` + `leading?`; `drawers?` = `AfDrawerSystemProps` (topOffset defaults to `"auto"`); `nav?: {label, content, open?, onOpenChange?, width?}` docked from 1024 px, an `AfDrawer` (left, backdrop, under the header) below it; `children` = the content). The header carries `data-af-topbar` (`check_app_shell.mjs`).
- File viewer (0.8.0): `AfFileViewer` — one preview for every client: header (name with the path as tooltip, size, generated date relative with the exact time on hover, extra `actions`, Download and close icons) and a body by kind (`fileViewerKind(name, contentType)`: Markdown through the host's `renderMarkdown` — panel-chat `FileViewer` wires its `Markdown` —, code highlighted by `AfCodeBlock`, JSON pretty-printed, images, audio (kind `"audio"` for mp3, wav, ogg, oga, opus, m4a, aac, flac, weba or any `audio/*` type, played by `AfAudioPlayer`), video (0.9.0: kind `"video"` for mp4, m4v, webm, mov, ogv, mkv or any `video/*` type except `video/mp2t`, the browser's own controls; the file NAME decides before a media Content-Type, so `.ts` served as `video/mp2t` stays code), PDF in an `<object>`, plain text; SVG and HTML show as source, never rendered). Presentational: the host passes text (`fileViewerNeedsText(kind)`) or an object URL (images, audio, video, PDF). `formatFileSize()`.
- Audio player (0.8.0): `AfAudioPlayer` (`src`, `name?`, `peaks?`, `className?`) — the shared audio viewer: play/pause, a waveform you click or drag to seek, elapsed / total time. The waveform is decoded from `src` with the Web Audio API (pass `peaks` to skip decoding); when decoding is unavailable or fails, the bars stay flat with the reason in the waveform's tooltip and playback still works. Keyboard: the waveform is a `slider` (Left/Right ±5 s, Home/End, Space/Enter play or pause). Pure helpers: `audioPeaks(samples, bars?)` (normalised 0..1 per bar), `formatAudioTime(seconds)` (`"1:03"`, `"--:--"` when unknown), `audioSeekTime(x, width, duration)`, `AUDIO_WAVEFORM_BARS` (72).
- Code highlighting (0.8.0): `AfCodeBlock` (`text`, `language` = a file name or a language, `lineNumbers?`) — wraps long lines, never scrolls sideways; `highlightCode(text, codeLanguage(name))` is a dependency-free lexer (comment / string / number / keyword tokens; joining the tokens returns the input).
- Settings rows (0.8.0): `AfSettingsGroup` (titled card; `variant="flat"` inside another card; `aside` for e.g. "Revision 4"), `AfSettingRow` (label + one-line help left, control right; wraps in a narrow panel), `AfOverrideRow` — the "Gateway default unless overridden" row: summary (`Gateway default · x` or `<override> — <owner>`), **Change** opens the editor in place, **Use gateway default** only while overridden.
- Workspaces (0.8.3, round 11): `WorkspaceChooser` — the one workspace chooser of the console (Accounts → **Eligible workspaces** and each account's modal), AbstractCode, Observer, Flow (the Assistant copies `WORKSPACE_CHOOSER_TEXT` verbatim). One component, four levels through `level`: `"gateway"` (the admin's eligible set; a row's mode is its cap), `"account"` (an account's default, humans and entities), `"session"` (one conversation's subset, stored on the session by the gateway) and `"run"` (a one-off run without a session: nothing is PUT; the host keeps the value). There is no shared workspace: a run's private workspace is automatic and always Read & write. It shows, top to bottom: **Gateway: <gateway_summary>** verbatim (not at the gateway level); **Follow the gateway policy** (account) or **Use my default** (session, run) as a state-showing switch — ON sends `{configured: false}`, OFF starts from what applies now; the posture as a segmented control ("Deny everything, allow listed workspaces" / "Allow everything, refuse listed workspaces"); **Allowed workspaces** / **Refused workspaces** rows, each `path · Read & write | Read-only | Refused · remove` (a mode above the gateway's cap, read from `effective.folders[].cap`, stays focusable but `aria-disabled` with the kit tooltip "The gateway allows this workspace read-only"; the remove icon's tooltip is "Remove <path>"); **Everything else** under the second posture; the **Add a workspace path** row (+ **Choose…** when the host passes `choose`); the effective line verbatim; an optional `footer`. Every change is ONE call, never a Save button: stored levels `<WorkspaceChooser level="gateway"|"account"|"session" state={workspaceAsState(answer, level)} save={(payload) => …} />` (payload = the full body `{configured: true, posture, default_mode, folders}` or `{configured: false}`; at the gateway level `{posture, default_mode, folders}`; a `save` that resolves with a chooser state is shown at once); run level `<WorkspaceChooser level="run" value={WorkspaceRunValue | null} effective={dry-run answer} onChange={(next | null) => …} />`. A rejection shows the gateway's sentence + "Not saved." under the control. Helpers: `workspaceChooserClient(request, {level, account?, session?}, base = GATEWAY_API_PATH)` → `{path, load(), save(payload)}` over `GET/PUT /workspace/policy`, `/workspace/policy/{account|me}`, `/sessions/{id}/workspaces`; `workspaceDryRun(request, account = "me")` → `POST /workspace/effective/{account} {workspace}`; `workspaceAsState` / `workspaceAsPolicy` / `workspaceAsEffective` refuse an older answer (one carrying `shared_workspace`, or missing `configured`, `cap`, `summary`, `gateway_summary`) loudly; `effective.default_mode` may be `null` under "Deny everything, allow listed workspaces" (the follow switch then sends the policy read's own `default_mode`); `workspaceErrorSentence` reads an `Error`, `{detail: {message}}`, `{detail: "…"}` or `{message}`. No policy logic: no path checks, no clamp, no cap computation (`check_workspace_chooser.mjs`).
- Voice section (0.8.0): `AfVoiceSection` — the Assistant's Settings → Voice layout, four groups: **Engines** (Text → speech, Speech → text as `AfOverrideRow`s), **Output** (output device where `audioOutputSelectable()`, with a **Test** chime on the chosen speaker; Reply volume), **Microphone** (input device; **Test** records 3 s with a live level meter and plays it back, or says why it could not: blocked, no device, device gone, in use, silence; Spoken language, which rides on transcription requests and skips detection; Input level 50–150 % where Web Audio allows) and **Replies** (Read aloud switch; Voice latency from `VOICE_LATENCY_OPTIONS`, only when the gateway advertises `quality_preset`). Device names appear after one microphone permission (**Show names**). Safari cannot choose a speaker: the picker stays on System default and says so. Required prop `fetchDefaults: () => Promise<VoiceDefaults>` (`GET /api/gateway/voice/defaults`, the gateway's `output.voice` / `input.voice` routes) is the only source of "Gateway default · provider / model" ("not set" / "unknown" otherwise); `defaults` passes them when the host already holds them. Value `VoiceClientPreferences` (`VoicePreferences` + `stt_provider`, `stt_model`, `stt_language`, `output_device`, `input_device`, `input_gain`, `reply_volume`, `read_aloud`); `voiceTtsRequest()` / `voiceSttRequest()` pick what a request carries (`voiceSttRequest` sends `language`). `nested` renders its sub-sections flat. `createVoice` (a `VoiceCreation`) adds "Create a voice" under the voice select. Helpers (`voice_devices.ts`): `voiceDefaultSummary`, `sttRouteText`, `transcribingLine`, `microphoneErrorSentence`, `listVoiceDevices`, `unlockDeviceLabels`, `recordSample`, `playTestTone`, `playOnDevice`.
  0.9.0 (backlog 0035): the **Output** and **Microphone** groups are the standalone `AfVoiceOutput` and `AfVoiceInput` below. New props: `rows?: AfVoiceSectionRows` (`tts`, `stt`, `output`, `microphone`, `replies` default shown; `mute` and `capture` default hidden, shown only where the host honours them; an entity that speaks with its own voice passes `{tts: false}`), `ttsSlot?: ReactNode` (a host-owned voice picker shown in Engines in place of the Text → speech row), `voiceLibrary?: VoiceLibrary` (wins over `createVoice`), `previewVoice?(prefs, text?, opts?)` (choosing a voice plays it, with the play/stop toggle; played on the chosen speaker at the reply volume), `fetchLanguages?(kind, provider?) => Promise<string[]>` (`GET voice/languages?kind=stt&provider=`: Spoken language lists the transcription engine's languages, the override's else the gateway default's; failed or open = the kit table; a saved language outside the list stays as "(saved)"), `captureDefaults?` (what an unset `capture_mode` / `auto_send` means in this host), `levelSource?` (the `voice` from `useGatewayVoice`: the Microphone meter moves during a real recording; only the meter re-renders). A muted preference always shows **Unmute**, even where the Mute row is not opted in. New `VoiceClientPreferences` keys: `reply_muted`, `capture_mode` (`"hold"` | `"toggle"`), `auto_send`; with `rows.capture` the Microphone group shows **Microphone button** (Hold to talk / Tap to talk, `VOICE_CAPTURE_OPTIONS`) and **Send what you say automatically**. `voiceCaptureMode(value | prefs)` is the one reading of `capture_mode` (anything but `"toggle"` is hold). `gatewayVoiceOptions(prefs)` maps the preferences to the hook's `output_device_id`, `volume`, `muted`, `input_device_id`, `input_gain`, `capture_mode`. `VOICE_LANGUAGE_OPTIONS` now lists the kit's 15 languages (`VOICE_LANGUAGE_LABELS`).
- Voice OUT (0.9.0, backlog 0035): `AfVoiceOutput` — output device picker with a **Test** chime on the chosen speaker (Safari: System default, says why: `SAFARI_OUTPUT_NOTE`), **Reply volume** slider and **Mute** (`reply_muted`; the volume is kept; the Test still plays; **Unmute** is always shown while muted). Controlled and standalone (no section around it): `value` (`VoiceOutputValue` or the whole preferences; `onChange` returns it merged), `onChange`, `listDevices?`, `outputSelectable?`, `showMute?` (default true; ignored while muted), `unavailableReason?`, `devicesKey?` (re-read the device list), `labels?` (`device`, `volume`, `test`), `className?`.
- Voice IN (0.9.0, backlog 0035): `AfVoiceInput` — input device picker, a live level meter (`AfVoiceLevelMeter`, `role=meter`: the Test's level while the Test records, else the host's real recording level from `levelSource`, or a `level` the host holds), **Test** (3 s from the chosen microphone, played back on `playOn`), **Show names**, **Input level** 50–150 % where Web Audio allows. Controlled and standalone: `value` (`VoiceInputValue` or the whole preferences), `onChange`, `levelSource?`, `level?`, `listDevices?`, `playOn?` (`{deviceId, volume}`), `onDevicesChanged?`, `unavailableReason?`, `labels?` (`device`, `gain`, `test`), `className?`. `clampInputGain(v)`.
- Microphone button (0.9.0, backlog 0035): `AfVoiceMicButton` (`voice: GatewayVoice`, `mode: "hold" | "toggle"`, `routeText?`, `onTranscript?(text, info)`, `label?`, `unavailableReason?`, `showStatus?`, `className?`) — one wording (`VOICE_MIC_TEXT`): **Hold to talk** → "Recording — release to send" (a tap shorter than `MIN_RECORDING_MS` is discarded with a hint; leaving the page mid-hold sends nothing; Space / Enter hold too) or **Tap to talk** → "Recording — tap to stop"; a live level meter while recording; "Recording… 3 s" / `transcribingLine` beside it. `mode` is read with `voiceCaptureMode` (a stored, stale or foreign value is hold: it never crashes the page). The hook must be created with the same `capture_mode`; a mismatch, or `onTranscript` without the hook's listener, renders the button disabled with the reason (`data-voice-mic-error`) and logs a console error, never a render error; `onTranscript` subscribes through `voice.add_transcript_listener`; unmounting while recording cancels it.
- Voice preferences and defaults (0.9.0, backlog 0035): `useVoicePreferences(storageKey | null)` → `[prefs, setPrefs]` kept in localStorage under `storageKey`, in sync across the page's components with the same key and across the app's tabs (`storage` event); `null` = in memory only. `loadVoicePreferences(key)`, `saveVoicePreferences(key, prefs)`. `useVoiceDefaults(fetchDefaults | null, key?)` → `{value, failed, reload}`: `GET voice/defaults` once per `key` (another gateway or account), nothing without a gateway; pass `value` to `AfVoiceSection.defaults`.
- Voice routes (0.9.0, `gateway_paths.ts`): `GATEWAY_VOICE_ROUTES` (`defaults`, `voices`, `languages`, `clones`, `design`, `compatibility`), `voiceClonePath(id)`, `voiceCloneDeployPath(id)`, `runVoiceTtsPath(runId, stream?)`, `runTranscribePath(runId)`, `entityVoicePath(name, "" | "tts" | "tts/stream")` — relative to the gateway API: wrap with `gatewayApiPath()`.
- Live level (0.9.0, backlog 0035): `AfVoiceLevelMeter` (`source?`, `level?`, `label?`, `origin?`, `inline?`, `className?`) and `useVoiceLevel(source)` subscribe to `voice.subscribe_level`, so only the meter re-renders while the user speaks (`VoiceLevelSource`). `recordSample` honours an abort at every step: an abort before the microphone has opened closes it as the stream arrives and rejects with `recordingAbortError()` (`name: "AbortError"`).
- Relative time (0.8.0): `formatRelativeTime(ts, nowMs)` ("just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then "Oct 2"; future "in 14 h"), `formatExactTime(ts)` ("Oct 2, 2026, 14:05"), `formatShortDate(ts, nowMs)`, `timeValueMs(ts)` — deterministic (the caller passes now), no seconds, no year within the same year.
- Icons (0.8.0): `cog` (the usual settings gear; `settings` stays the sliders glyph), `activity` and `unarchive` (archive box with an up arrow).
- App chrome: `AfTopBarActions` — the top-right cluster, in this enforced order: app `extraActions` · docs · assistant · appearance · about · identity · connection pill (always rightmost; pinned by `check_app_shell.mjs`). `connection` takes `useGatewayConnection()`'s return value (preferred: the pill and the identity menu's **Disconnect** both call its `signOut()`, then the host's `onSignOut?` ONLY when `signOut()` resolved true, i.e. the session is gone; its `signOutError` shows as "Disconnect failed" beside the pill) or the legacy `AfTopBarConnection` `{phase, signingOut?, onConnect, onDisconnect, status?, signOutError?}` (then `onDisconnect` alone runs; `onSignOut` is ignored). One verb for ending the session: pill Connect / Connecting… / Disconnect / Disconnecting… (`topBarPillText`; accessible name "Disconnect from gateway"), menu item **Disconnect**. `identity?: "badge" | "menu" | false` — who is signed in (`principalLabel`), immediately left of the pill, only while the phase is connected, explained by the kit tooltip (`data-af-tip`, no native title); `"menu"` = an `AfMenu` whose header says "Signed in as …" and "Gateway <host>", items **Copy user id** (only where the clipboard API exists) and **Disconnect**. `appearance` = `{onOpen, label?}` (host dialog) or `{value, onChange, label?, title?, note?}` (the cluster renders `AfAppearanceDialog`). `about={{ identity, versions?, fetch?, extra?, onOpen?, label? }}` adds the About button and dialog; with `fetch` (the host's gateway fetch, `AfGatewayFetch`) and no `versions` the cluster GETs `api/gateway/about` each time the dialog opens (`fetchAboutVersions`, "checking…" while in flight, "unavailable (HTTP 401)" on failure; an answer after close is dropped); `extra` is host content in the dialog. The cluster publishes `--af-topbar-h` (its header's bottom edge, viewport-relative; updated on the header's resize, window resize and scroll; removed on unmount unless another publisher wrote it since; `useAfTopBarHeight`, `publishHeight={false}` opts out). `AfDrawer` (non-modal, keeps children mounted; `side="left"`, `backdrop`; full width below 768 px; `topOffset: number | "auto"`; **behaviour change**: focus now moves in on open — `[data-autofocus]`, else the first text field (skipped on touch screens, so no soft keyboard), else the first control, else the drawer — and back to the opener on close when focus was inside; `manageFocus={false}` opts out), `AfAppearanceDialog` + `useAppearanceSettings()` / `appearanceStorageKey()` / `APPEARANCE_DEFAULTS`. `AfMenu` takes an optional non-interactive `header` and a kit tooltip `tip`. `useGatewayConnection().signOut()` now resolves `true` when the session is gone, `false` otherwise (never rejects).
- About (0.8.0): `AfAbout` (inline card: `identity`, `versions?`, `titleId?`, `action?`, `extra?` (host content under the links, e.g. the console's update and restart controls), `className?`) and `AfAboutDialog` (`open`, `onClose`, `identity`, `versions?`, `extra?`; modal, Escape and a click outside close it, Close button in the heading row). The card shows the app's name and version, the AbstractFramework and AbstractGateway versions, six links (Website, Source, Docs, Issues, Feedback, and Contact as a mailto) and the copyright and licence line — never a package list. `versions: AfAboutVersions` = `{ framework?, frameworkNote?, gateway?, gatewayNote? }`; a missing version shows its note, else "not reported" / "not connected". `aboutVersionsFromGateway(payload | null, error?)` builds it from `GET /api/gateway/about` (only the framework and gateway versions are read; "not installed on the gateway host" when the gateway reports no framework; "unavailable (reason)" on failure). Helpers `aboutLinks(identity)`, `aboutVersionFacts(versions)`, `fetchAboutVersions(fetchGateway)` (never throws), `ABOUT_VERSIONS_CHECKING`.
- Identity: `appIdentity(id, version): AppIdentity` (throws on an unknown id), `frameworkIdentity(): FrameworkIdentity`, `knownAppIds()`, `aboutRows(identity, extra?): AboutRow[]` (the ordered About rows, same as the Python `abstractcore.utils.identity.about_fields`), `gatewayVersionRows(payload: GatewayAboutPayload | null, error?: string): AboutRow[]` (the connected gateway's version rows from `GET /api/gateway/about`) — both kept for parity with the Python twins; the About card does not render rows; types `AppIdentity`, `FrameworkIdentity`, `AboutRow`, `GatewayAboutPayload`. See [About dialog and identity](../ui-kit/README.md#about-dialog-and-identity)
- CSRF helpers: `readGatewayCsrfToken()`, `readGatewayCsrfTokens()`
- Voice: `useGatewayVoice()` (TTS playback incl. streaming with pause/resume, push-to-talk capture; injected transports) + `streamTtsJsonl()`. Options `output_device_id` (playback through `AudioContext.setSinkId`), `input_device_id` (records from that microphone; a missing device fails with a sentence, never another microphone), `volume`, `muted` (0.9.0: gain 0 at once, also for a reply that is playing; the volume is kept), `input_gain`, `capture_mode` (0.9.0: `"toggle"` = tap to start / tap to stop, no pointerup stop; default `"hold"`), `stop_on_pointerup: false` (wins over `capture_mode`; tap-to-start / tap-to-stop hosts stop recording themselves); returns `voice_ptt_since` (for "Transcribing… 12 s · faster-whisper / large-v3"), `subscribe_level(fn)` (0.9.0: the live microphone level 0..1 while recording, as a subscription, so the hook's owner never re-renders for it), `voice_capture_mode` and `add_transcript_listener(fn)` (0.9.0); a stop or cancel while the microphone is still opening closes it as the stream arrives; `transcribe` may return `{ text, provider, model }`; every failure becomes one sentence; `VoiceSettings` (catalog-driven voice preferences form)
- Cognition and phase surfaces: `AfPhaseRadio` (+ `RULED_PHASES`, `PHASE_DESCRIPTORS`, `normalizePhase()`, `reconcilePhaseList()`), `AfCognitionBloom` (+ bloom core: `createBloomState()`, `tickBloom()`, `drawBloomFrame()`, …), `AfConductGauge` (+ `conductAxes()`), `AfMemoryHintChip`
- Automations: `AutomationPanel` (one automation: controls, runs as chat pairs, typed wait answers), `AfScheduleDialog` (create an automation: Repeat on a fixed UTC interval, Daily / Weekly / Monthly at a time of day in the account's time zone, once, or when an email arrives — the Gateway's own sentence for calendar rules through `previewSchedule`; "Email result" and result recipients), `AfTimeZonePicker` (the account time zone, over the Gateway's IANA list), the email fields `AfEmailTriggerFields` / `AfEmailOptionsFields` / `AfEmailSetupNotice`, `createAutomationsClient()` (one method per Gateway automation route, errors thrown as `AutomationApiError`), plus the pure presentation rules, retry-safe id helpers and the contract types. The complete list is in [Automations: Exports](./automations.md#exports)
- Modal and account rows: `AfModal`, `bindAfModal()` (+ `afModalTabTarget()`, `afModalFocusables()`, `AF_MODAL_FOCUSABLE`), the helper floors `HELPER_MIN_PX`, `HELPER_MIN_TOUCH_PX`, `HELPER_TOUCH_MEDIA` — see [Modal, account rows, grouped navigation](./modal.md)
- On/off settings and forms: `AfSwitch`, `AfSwitchInput` (a native `role="switch"` checkbox for uncontrolled forms) (+ `afSwitchNextState()`, `afSwitchIsActionable()`), `AfTabs` (+ `afTabsNextIndex()`), the guards `findVerbToggleLabels(source)` and `checkLabelScale(root)` (+ `LABEL_SCALE_SELECTOR`) — see [On/off settings](./state-toggles.md)
- Workflow picker: `WorkflowPicker` (the one workflow chooser of every client: "Gateway default", then the groups "Shared" and "Mine", each entry with its version as a small detail line; no toggles), `useExecutableWorkflows({ interfaceId, request? | gatewayBaseUrl?, allVersions?, enabled?, reloadKey? })` (fetches `GET /api/gateway/bundles?executable_for=<interface>` with the app's own auth), `WorkflowPickerListbox`, and the pure core `executableWorkflowsPath()`, `parseExecutableWorkflows()` (throws `WorkflowPickerContractError` when the gateway ignores `executable_for`: no echo, an item without `owner`/`shipped`, an entrypoint that does not declare the interface), `workflowPickerGroups()`, `workflowPickerRows()`, `WORKFLOW_PICKER_DEFAULT` (`"@default"`), `WORKFLOW_PICKER_EMPTY`. The picker lists exactly what the gateway returns: which workflows a person sees is the gateway's availability rule (admins decide what is shared with users; users also see their own), never a client switch. Two modes: per interface (`interfaceId="abstractcode.agent.v1"`, for an app that runs one interface) and any interface (`interfaceId={null}`, for a launcher such as AbstractObserver: `GET /api/gateway/bundles`, every entrypoint that declares an interface, the interfaces as the detail line, `defaultInterface` names the interface "Gateway default" stands for); helpers `workflowPickerPath()`, `allWorkflowsPath()`, `parseWorkflowListing()`.
- Ids and non-secure contexts: `randomId()` (v4 UUID over plain http too), `uuidV4FromBytes()`, `insecureContextReason(feature)` — see [Non-secure contexts](./state-toggles.md#non-secure-contexts)
- Icons: `Icon`, `IconName`, `ICON_NAMES` (65 glyphs, 24-grid and 16-grid families; 0.8.6 adds `image`, `video`, `camera`, `music`, `database`, `branch`, `loop`, `variable`, `minus`, `divide`, `function`, `zoomIn`, `zoomOut`, `fitView`, `lock`). Every name, the style rules and the contact sheet: [Icons](./icons.md)
- Palette seeds: `@abstractframework/ui-kit/palette_seeds.json` (generated 4-token palette per theme)

See: [`ui-kit/README.md`](../ui-kit/README.md) and the [Adoption guide](./adoption-guide.md).

### Console islands (repository build, not an npm export)

`ui-kit/islands/console_islands.tsx` builds into `ui-kit/islands/dist/af-console-islands.js`, a
self-contained script that defines `window.AfConsoleIslands` (`apiVersion` `"2"`, `kitVersion`,
`themes`, `fontScales`, `headerDensities`, `mountTopBar(el, props)`,
`mountAppearance(el, props)`, `mountAbout(el, props)`, `appIdentity(id, version)`,
`aboutVersionsFromGateway(payload, error?)`, `applyAppearance(settings)`, `mountDocsAssistant(el, props)`,
`mountDrawerSystem(el, props)`, `islandConnectionStatus(connection)`, `mountSandboxChat(el, props)`,
`mountProviderModelPicker(el, props)`, `mountToolModeEditor(el, props)`, `mountVoiceSettings(el, props)`,
`mountVoiceSection(el, props)`, `mountWorkspaceChooser(el, props)`, `mountTimeZonePicker(el, props)`,
`bindModal`, `bindMenu`, `bindTooltips`, …). Build it with
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
- `DocsAssistantDrawer` (0.4.0) — the Docs assistant of the console and every app: kit drawer + panel-chat thread (user right, assistant left; Markdown, code, JSON, links, images per the image policy; copy), attachments (`attachments/upload` to the conversation's session → `context.attachments`), streaming (`llm.delta` on `runs/{id}/ledger/stream`), Stop, icon-only New conversation and close, one-line grounding footer. Props `open`, `onClose`, `source: { app, name }`, `fetchGateway`, `connected`, `suggestions?`, `placeholder?`, `width?`, `topOffset?`, `className?`. Grounding: `GET api/gateway/docs/corpus?app=<id>` → the shipped `docs-qa` workflow (`DOCS_QA_WORKFLOW`); one gateway session per conversation. `topOffset` also takes `"auto"`; `manageFocus` (default false: the drawer keeps its earlier focus behaviour) opts into the kit drawer's focus handling. In an `AfDrawerSystem`: `docsAssistantPanel(source, fetchGateway, { connected, suggestions?, placeholder?, ask?, id?, label?, mode?, side?, defaultWidth? })` returns an `AfDrawerPanel` (drawer mode, kept alive) whose content, `DocsAssistantPanelContent`, is the same conversation with its header actions in the panel header (0.9.0, backlog 0036). Exports `DocsAssistantPanel` (stateless view), `makeDocsQaAsk`, `docsQaStartBody`, `docsCorpusPath`, `docsAnswerFromRun`, `docsReplayNote`, `newDocsSessionId`, `sseFrames`
- `AssistantPanel` (docs Q&A surface with an injected `ask(question, { signal, history })` transport returning a Promise or an AsyncIterable of deltas; never fetches); `assistantDrawerPanel({ ask, assistantName?, …, id?, label?, icon?, mode?, side?, defaultWidth? })` returns it as an `AfDrawerPanel` (drawer mode, kept alive) for an app assistant such as Continuum's advisor (0.9.0, backlog 0036)
- `WorkflowChat` + `WorkflowInteractionPanel` (controlled workflow chat and pending `ask-user` / `tool-approval` / `event-wait` interactions; `streamReplies?: "gateway_default" | "on" | "off"`); `WorkflowSessionController`, `useWorkflowSession`, `workflowPendingInteraction()`, `resolveWorkflowEventTarget()` (injected `WorkflowTransport`)
- One chat surface (0.5.0, backlog 0030; ADR 0001): `WorkflowChat` also takes
  - `steer?: ChatSteer` (`{ onSteer(text, mode) → Promise<{accepted, seq?, duplicate?}>, modes?: ("guide"|"queue")[], parked? }`): while `busy` the send button reads **Steer** (or **Queue**; with both modes a **Guide this run / Queue next turn** switch), the host posts it (ui-kit `submitSteer`), and the status line says "Queued (seq N). Delivers at the run's next loop boundary." only for an accepted steer (`accepted:false` is shown as a refusal and the draft stays);
  - typed chips `attachmentItems?: ComposerAttachment[]` (`{id, name, size?, state: "queued"|"uploading"|"attached"|"refused"|"failed", thumbnailUrl?, error?}`) with `onRemoveAttachment(id)` / `onRetryAttachment(id)`; Send refuses while a chip is not attached (`unattachedSendBlock`). The `attachments` ReactNode slot stays as the escape hatch. `useAttachmentUploads({ upload, maxBytes?, concurrency?, thumbnail? })` → `{ items, attached, add, remove, retry, clear, sendBlock, announcement }` (AbstractCode's upload queue: refusal over the gateway's `maxAttachmentBytes` before any request, 3 uploads in flight, the gateway's words on a failure, Retry); `ComposerAttachmentChips`; helpers `uploadRefusal()`, `uploadFailure()`, `uploadAnnouncement()`, `runBounded()`, `UPLOAD_CONCURRENCY`;
  - `toolbar?: ChatToolbar` (`{ onNewSession?, onClear?, exportTranscript?: {filename, heading?} | false, copyTranscript? }`): **New chat**, **Clear**, **Copy**, **Export** in the header row, each only when injected (Copy/Export use `chatToMarkdown`);
  - `messageProps.renderFooter?(m)` (per-message slot under the card) and `messageProps.variant?(m) → "hint"` (a system note as one discreet line); `messageProps.onOpenMedia?(item)` (host opener for file media);
  - `onSend(draft, { signal })` and `onCancel(signal)`: Stop aborts the in-flight send's `AbortSignal` and hands it to `onCancel` (a request/response host ties its fetch to it).
  - Types `ChatSteer`, `ChatSteerMode`, `ChatSteerResult`, `ChatToolbar`, `ComposerAttachment`, `ComposerAttachmentState`, `UseAttachmentUploadsOptions`, `AttachmentUploads`, `ComposerAttachmentChipsProps`
- Live replies: `WorkflowTransport.streamLedger(runId, after, onStep, signal, onOpen?, onDelta?)` — `onDelta(event: LlmDelta | LlmDeltaEnd)` receives the gateway's `llm.delta` / `llm.delta_end` frames (never the ledger cursor); `llmDeltaFromSse(eventName, data)`, `validateLlmDeltaEvent(value, eventName?)`, `isLlmDeltaEnd()`, `describeStreamUnavailable(detail?)`, `streamRepliesRuntime(mode)` (→ the `_runtime.stream` run-input entry), the event-name constants `LLM_DELTA_EVENT` / `LLM_DELTA_END_EVENT`; types `LlmDelta`, `LlmDeltaEnd`, `LlmDeltaEvent`, `LlmDeltaChannel`, `LlmDeltaEndReason`, `LlmStreamUnavailableDetail`, `StreamRepliesMode`; controller option `liveRenderIntervalMs` (default 60, also on `useWorkflowSession`). See [panel-chat README](../panel-chat/README.md#live-replies-streaming)
- File drop and paste: `WorkflowChat`'s `onFiles(files)` turns on the drop zone and paste-to-attach (folders are refused with a visible message); the pure helpers behind it are exported too: `dragCarriesFiles()`, `draggedFileCount()`, `dropZoneLabel()`, `droppedFiles()`, `folderRefusal()`, `pastedFileName()`, `pastedFiles()`, `DragPresence` (see `panel-chat/src/file_drop.ts`)
- `ToolActivity`, `ToolActivityGroup` (tool-call rendering; a process-spawning call shows its command-sandbox line first in its detail), `toolSandbox(result)` + `ToolSandboxLine` (the line `Sandbox: <label> · N workspaces enforced` / `Sandbox: none — refused` and the enforced paths, from the ledger's `output.sandbox`), `StatDetailPanel` + `statDetail()` (token/time/tool statistics), `formatDuration(ms)` (the chat's one duration format, "4.2s" / "3m 26s"; 0.6.1). A tool row whose `WorkflowToolActivity.approvalWait` is set (the call waited for the person's decision: the replay view's `wait.kind == "tool_approval"` with an `outcome`, or the ledger's `waiting` approval row) reads "3m 26s incl. approval wait" (0.6.1)
- `ChatThread` (thread container; renders a list of messages)
- `ChatMessageCard` (single message rendering; `message.title` names the speaker — assistants
  render their entity/agent name when provided, falling back to "Agent")
- `ChatMessageContent` (message body renderer; JSON autodetect + Markdown)
- `ChatComposer` (composer input + submit handling; IME-safe Enter)
- Automations: `ScheduleThisAction` (a "Schedule this…" header action) and `FromAutomationBadge` (a "from automation <title> · #<n>" marker); listed with their types in [Automations: Exports](./automations.md#exports)
- `presentInteraction(wait, controller, { records?, currentRun?, onPermissionsAll?, approveAllScope?, onAllowForSession?, approveAllDisabledReason?, remember?, onDefer?, allowSkip? })` — the one mapping from a runtime wait (`workflowPendingInteraction(snapshot)`) to the `WorkflowChat` `interaction` control: tool approval (targets via `ToolActivityGroup`, full arguments behind a disclosure; Allow once / Deny, plus "Allow for this chat" only with `onAllowForSession`, "Allow all enabled tools" only with `onPermissionsAll` — its scope sentence names no storage scope unless the host passes `approveAllScope`, e.g. "for this Gateway account" —, "Decide later" only with `onDefer`, a per-tool remember checkbox only with `remember(toolNames)`), question (`ask_user`, choices as buttons and free text; "Continue without answering" with `allowSkip` resumes with an empty answer, "Keep waiting" with `onDefer`) and event wait (routed with `resolveWorkflowEventTarget`, refused when unroutable); subworkflow waits are `null`. The first argument may also be a `ReplayInteraction` (the shape of `replay_view_v1.interaction`) — it produces the same control as the raw wait (`isReplayInteraction()`, `replayInteractionWait()`); a wait that carries the view's `command` (`WorkflowWaitInteraction.command`, `kind`) and is an event is answered with `controller.answerEvent(payload, target)` (the view's resume command), never through an event route. A tool approval with a broad grant carries `broadScopeSummary` (one always-visible line; the full scope sentences go in the "What the broader choices allow" disclosure and the buttons' tooltips; 0.6.1). Types `PresentInteractionOptions`, `InteractionController` (adds optional `answerEvent`), `ReplayInteraction`
- Replay view (0.6.0, backlog 0040; root 0993, runtime 0854; AbstractGateway >= 0.17.0 `GET runs/{id}/view` + `/view/stream`): `WorkflowTransport.replayView?: ReplayViewTransport` (`{advertised?, getView(runId, {ifNoneMatch?, at?, signal?}) → {notModified, view?, etag, bytes}, streamView(runId, {lastEventId?, signal, onOpen?, onFrame}) → {bytes}}`), built over the host's gateway fetch by `createReplayViewTransport({ fetch(path, init), advertised? })` (`path` relative to the gateway API). With it the controller renders from the view: one `GET /view` + `GET runs/{id}`, then `/view/stream` from the ETag (`Last-Event-ID` = the last applied frame), no history bundle, no ledger pages, no record fold, no timed poll; the root's ledger stream only for live reply text. Snapshot `source: "replay_view" | "ledger_fold"`, `sourceReason` (why not the view: no `replayView` in the transport, `advertised: false`, or the gateway's route-missing 404/405, probed once per transport; any other failure is a load error), `view` (the folded view); `workflowSourceLabel(snapshot)`. Client pieces: `applyDelta(view, delta)` (port of AbstractRuntime 0.15.0 `apply_delta`), `ReplayViewFold` (`adopt(view, etag)`, `apply(frame) → "view"|"delta"|"duplicate"|"stale"|"done"|"ignored"`: a repeated or older frame is not applied), `SseParser`, `parseCursorToken()`, `compareReplayOrder()`, `ReplayViewUnavailableError`, `projectReplayView(view) → {messages, tools, interaction, status, displayStatus, openLlmCalls, endedLlmCalls, runStatus, statistics}`, `replayToolActivities()`, `replayStatistics()`, `toolActivityMessage()`, constants `REPLAY_VIEW_VERSION`, `REPLAY_SCALAR_KEYS`, `REPLAY_LIST_KEYS`; types `ReplayView`, `ReplayViewDelta`, `ReplayViewCursor`, `ReplayViewRun`, `ReplayViewMessage`, `ReplayViewActivity`, `ReplayViewToolCall`, `ReplayViewInteraction`, `ReplayViewTransport`, `ReplayViewFetch`, `ReplayViewRead`, `ReplayViewStreamOptions`, `ReplayViewHttpError`, `ReplayFoldOutcome`, `SseFrame`, `ReplayProjection`, `WorkflowSessionSource`. Checked against the gateway: the 15 conformance cases captured from AbstractGateway 0.17.0 fold to the exact bytes of `GET /view` after every record (`panel-chat/scripts/check_replay_view.mjs`). See the [README](../panel-chat/README.md#replay-view-the-gateways-reconstruction)
- Session tool policy (0.5.0, backlog 0032; session tool policy contract v1, served by a gateway that advertises `capabilities.session_tool_policy`): `WorkflowSessionControllerOptions.sessionToolPolicy?: SessionToolPolicyClient` (`{supported, sessionId, get, replace, merge, reset}`; host-injected only when `GET discovery/capabilities` serves `capabilities.session_tool_policy.supported === true`), `setSessionToolPolicyClient(client | null, {reason?})` (null + reason = the capability read failed), `onSessionPolicy(policy, clamped)`; methods `approveAllForSession(target, {maxRiskRank?, ask?})`, `approveKindForSession(target, kind, {ask?})`, `denyKindForSession()`, `denyToolForSession()` (write the policy FIRST with the person's `ask` tools, then answer the shown wait; no panel control for the deny methods), `resetSessionPolicy()`, `loadSessionPolicy()`, `sessionPolicyMode()`, `sessionPolicyStatus()`; snapshot `sessionPolicyMode` (`"gateway"` / `"local-fallback"` / `"unavailable"`), `sessionPolicyReason`, `sessionPolicy`, `sessionPolicyClamped`. `presentInteraction` option `sessionPolicy: {toolsetOf?, ask?, maxRiskRank?}`; the mode comes from the controller (kind buttons only for toolsets present; "Always deny … in this chat" under More with its reach stated; the served `scope` words shown as "Applies: …" or "The gateway did not say where this grant applies."; a tool the stored policy denies is named and "Allow once" reports the gateway's refusal; local fallback "Allow for this run", labeled; unavailable: no chat grant, reason shown). Writes go to the root run's session only; denies and resets carry the current revision (`reset(ifRevision)`, read first when unknown; none → a labeled refusal); a 409 asks to re-read. `SessionToolPolicyClient` is ui-kit's shape exactly (`reset(ifRevision?) → {revision?, scope?}`). `SessionToolPolicy.scope?: {approve?, deny?}` (the response's top-level `scope`, carried by the client). Ledger `abstract.tool_policy_decision` → activity line + `WorkflowToolActivity.policy`. Types `SessionToolPolicy`, `SessionToolPolicyBody`, `SessionToolPolicyClamp`, `SessionToolPolicyClient`, `SessionPolicyMode`, `SessionPolicyStatus`, `SessionToolPolicyScope`, `WorkflowToolPolicyProvenance`; helpers `toolPolicyDecision()`, `toolPolicyDecisionText()`, `sessionPolicyClampedText()`
- Questions and approvals (0.5.0, backlog 0032): `WORKFLOW_INTERACTION_LABELS` is the one wording set (Deny / Allow once / Allow for this chat / Allow all enabled tools / Decide later; Submit / Continue without answering / Keep waiting). `WorkflowToolApprovalInteraction` adds `onApproveForSession?`, `onDefer?` (a dismissal sends nothing and never denies), `remember?: {label, checked, onChange}` (`WorkflowInteractionRemember`; the host words the scope), `disabledReason?` (the broad grants render disabled with the reason visible); its default labels are now "Allow once" / "Allow all enabled tools" (were "Approve" / "Allow all"). `WorkflowAskUserInteraction` adds `onSkip?` and `onDefer?`. `WorkflowInteractionPanel` takes `variant?: "panel" | "card"` (the compact card for "Needs you" lists and inboxes: same decisions, detail behind **Review**)
- `WorkspaceBrowser` — a run's folder on the gateway host through the CONTRACTS §W routes (`GET /runs/{id}/workspace`, `/workspace/files`, `/workspace/content`): the root once as its short name (`workspaceShortName`; full path on hover) with **Open folder** (`onOpenFolder`, offered only when `workspaceCanOpenFolder`) and **Copy path** icons, breadcrumbs, folders first, then per file: name, size, generated date (relative, exact on hover) and a Download icon; "N entries hidden by the gateway's workspace rules". A click on a file previews it IN PLACE with `FileViewer` (0.3.1: no "Open" button; `fileActions(entry)` adds host actions such as "Attach"), or `onSelectFile` + `selectedPath` hand the selection to a host preview. Files are fetched with the host's credentials, never linked. Props: `fetchGateway(path, init)`, `runId` (an automation's id browses the automation's folder), `title`, `note?`, `onClose?`, `refreshKey?`, `className?`, `fileActions?`, `onOpenFolder?`, `copyText?`, `nowMs?`. Hook-free `WorkspaceBrowserView` and helpers: `loadWorkspaceView()`, `loadRunWorkspace()`, `listWorkspaceFolder()`, `readWorkspaceFile()`, `parseWorkspaceListing()` (malformed answers throw), `gatewayResponseError()`, `tabOpenPlan()`, `workspaceInfoUrl()` / `workspaceFilesUrl()` / `workspaceContentUrl()`, `workspaceCrumbs()`, `workspaceParent()`, `sortWorkspaceEntries()`, `workspaceHiddenNote()`, `formatBytes()`; types `GatewayFetch`, `RunWorkspace`, `WorkspaceEntry`, `WorkspaceListing`, `WorkspaceBrowserProps`, `WorkspaceBrowserViewProps`
- `FileViewer` (0.3.1) — ui-kit `AfFileViewer` with panel-chat's `Markdown`; `useWorkspaceFilePreview(fetchGateway, runId, entry, refreshKey?)` loads one workspace file for it (a bounded Range read of at most `PREVIEW_TEXT_LIMIT` = 1 MiB for text kinds, an object URL for images, audio, video and PDF up to `PREVIEW_BLOB_LIMIT`, nothing for binaries; audio plays in the kit's `AfAudioPlayer`) and `filePreviewViewerProps(state)` maps the result (`FileViewer` also takes `markdownImages`, `inlineImage` and a host `renderMarkdown`); `readBoundedText()`, `responseTotal()`, `partialPreviewNote()`, `safeMarkdownImages()` (Markdown images only from the run's workspace)

Renderers:
- `Markdown` (lightweight Markdown with real nested lists, marker progression, fenced code
  blocks incl. inside lists; `images?: "inline" | "link"` + `inlineImage?(src)`, default rule
  `sameOriginImage()` (exported); types `MarkdownProps`, `MarkdownImages`; see `panel-chat/src/markdown.tsx`). `ChatMessageCard` uses `images="link"`
  for every message except the user's own.
- `JsonViewer` (collapsible tree; honors `collapseAfterDepth`; auto-parses JSON strings)

Types:
- `ChatMessage` (message model rendered by `ChatThread` and `ChatMessageCard`; optional `live: ChatLiveReply` (`callId`, `reasoning`, `caption?`) marks a reply still being streamed; `kind?` and `artifactIds?` carry a `replay_view_v1.messages[]` item's kind and `artifact_ids`, see the [README mapping](../panel-chat/README.md#messages-from-the-replay-view)), `ChatLiveReply`, `ChatAttachment`, `ChatMessageLevel`, `ChatStat` (see `panel-chat/src/chat_message_card.tsx`)
- `ChatMedia` (0.5.0, backlog 0031): `kind` is `"image" | "audio" | "video" | "file"`; a `"file"` (`name`, `contentType`, `size?`, `text?` for text kinds) opens in the shared `AfFileViewer` inline behind **Open** (nothing loads before) or in the host's `onOpenMedia`; audio takes `transcript?` (speech-to-text, shown as a collapsible **Transcript** caption); music rides on audio. `WorkflowTransport.resolveArtifact?(runId, artifactId, signal?) → ResolvedArtifact` (`{src, contentType, name?, size?}`, the host reads `GET runs/{id}/artifacts/{artifact_id}` and `/content`) with `chatMediaFromArtifact(resolved, extra?)` (image/audio/video inline, everything else a file; its raw link is the host's `href` — pass the gateway's sandboxed content URL — or the object URL for an allowlist of inert types only, always as a download link (concrete subtypes, no wildcard; never HTML/SVG/XML/XSL or an unlisted type; `contentType` must be the Blob's type): `fileRawLink()`, `objectUrlRawLinkSafe()`, `isLocalObjectUrl()`; SVG never rendered) and `chatMediaForArtifacts(runId, ids, resolve)` (rejects when one cannot be resolved). The controller does not yet fold `$artifact` refs or generated-media ledger events into `message.media` itself

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
