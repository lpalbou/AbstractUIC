# Changelog

All notable changes to AbstractUIC are documented in this file.

This project is a **multi-package repository**. Since 0.1.10 each package is versioned
independently: a package is bumped only when it changes. A release heading names the
repository tag (the private root `package.json` version) and lists the package versions it
ships.

## Unreleased

### app-server 0.1.10 (unreleased)

- Changed: every request the gateway session proxy sends to the Gateway on behalf of a browser
  (proxied `/api/*` calls, sign-in, sign-out and the status probe) carries
  `X-Forwarded-For: <socket address of the browser connection>`. A client-supplied
  `X-Forwarded-For` is replaced, never passed through or appended; client `Forwarded` and
  `X-Real-IP` headers are dropped. The Gateway trusts this header only from a loopback proxy and
  uses it to tell whether the browser runs on the Gateway's machine. A connection whose socket
  address is unknown is refused with 400.

### ui-kit 0.1.12 (unreleased)

- Added: one About dialog for every AbstractFramework app. `AfAboutDialog` shows the application
  name and version, "Part of AbstractFramework", author, copyright and licence, website, source,
  documentation, "Report an issue", "Give feedback" and the contact e-mail, plus app-specific
  `extraRows` (for example gateway package versions). Links open in a new tab; Escape, a click
  outside or Close dismisses it.
- Added: `AfTopBarActions` accepts `about={{ identity, extraRows?, onOpen?, label? }}` and renders
  an About button between the appearance button and the app extras.
- Added: identity helpers `appIdentity(id, version)` (throws for an unknown application id),
  `frameworkIdentity()`, `knownAppIds()` and `aboutRows(identity, extra?)`, backed by the
  AbstractFramework identity descriptor shipped with the kit. The rows match the Python
  `abstractcore.utils.identity.about_fields`.
- Added: `gatewayVersionRows(payload, error?)` and the `GatewayAboutPayload` type: the connected
  gateway's About rows (`Gateway`, `Gateway framework`, then `Gateway package <name>` sorted by
  name), or one `Gateway: unavailable (<reason>)` row when the request failed or the gateway did
  not report a version. Only string values count as versions. The rows match the Python
  `abstractcore.utils.identity.gateway_version_rows`.
- Added: in `AfAboutDialog`, every `http(s)://` URL inside a row value is a link (new tab,
  `rel="noopener noreferrer"`), including the framework website in "Part of"; only the Contact row
  is a `mailto:` link. Same rules as the Python `abstractcore.utils.identity.about_html`.
- Added: `AfAboutDialog` keeps Tab and Shift+Tab inside the dialog while it is open and names
  itself by its title (`aria-labelledby`).
- Added: console islands `mountAbout(el, props)`, `appIdentity(id, version)` and an `about` prop
  on `mountTopBar`. `apiVersion` stays `"1"` (additive change).

### Documentation

- Added: [Console islands](docs/console-islands.md) (the `window.AfConsoleIslands` API, build and
  check commands, and how pages load the bundle), [Troubleshooting](docs/troubleshooting.md) and
  `CODE_OF_CONDUCT.md`.
- Changed: the architecture page shows which AbstractFramework apps consume each package and how
  the islands bundle is built; the API reference lists the app chrome (`AfTopBarActions`,
  `AfDrawer`, `AfAppearanceDialog`), `AssistantPanel` and the workflow chat exports; the
  `ui-kit` and `panel-chat` READMEs cover the console islands and `AssistantPanel`.

## 0.1.11 - 2026-09-24

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.11 | updated |
| `@abstractframework/panel-chat` | 0.1.16 | unchanged |
| `@abstractframework/app-server` | 0.1.9 | unchanged |
| `@abstractframework/monitor-memory` | 0.1.9 | unchanged |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-gpu` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### ui-kit 0.1.11

- Added: console islands. `islands/console_islands.tsx` wraps the kit's
  `AfTopBarActions` and `AfAppearanceDialog` (with `ThemeSelect`) in a tiny
  prop-driven API (`window.AfConsoleIslands.mountTopBar(el, props)`,
  `mountAppearance(el, props)`, `applyAppearance(settings)`, each mount
  returning `{update, unmount}`) for hosts that are not React apps.
  `npm run build:islands` (`scripts/build_islands.mjs`, esbuild, new dev
  dependency) bundles it with React into one self-contained IIFE,
  `islands/dist/af-console-islands.js`; `npm test` type-checks the entry and
  runs `scripts/check_islands.mjs` (build + load as a plain script + API and
  theme-list checks). The AbstractGateway console vendors this bundle and
  checks it against the kit sources. The bundle is a build output and is
  not part of the npm tarball; the islands sources ship in the repository
  only. See [Console islands](docs/console-islands.md).
- Added: `.af-topbar__identity`, the quiet one-line style for a plain-text
  extra in the top bar (the signed-in identity).

## 0.1.10 - 2026-09-23

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.10 | updated |
| `@abstractframework/panel-chat` | 0.1.16 | updated (requires `ui-kit` `^0.1.10`) |
| `@abstractframework/app-server` | 0.1.9 | first npm publish |
| `@abstractframework/monitor-memory` | 0.1.9 | first npm publish |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-gpu` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### ui-kit 0.1.10

- Added: `SpeculationSelect` and the pure native-MTP helpers
  (`speculationCapability()`, `normalizeSpeculationValue()`, `speculationSelection()`,
  `speculationFromSelection()`, `SpeculationValue`, `SpeculationCapability`). The selector is
  driven by the host's model-capability payload (`execution.speculation`): inheritance,
  explicit Off and only the advertised depths are offered; readiness and unavailable saved
  selections stay visible; nothing is inferred from model names.
- Added: `ProviderModelPicker` accepts `enableSpeculation` to show the speculation control for
  text routes, using its injected capability transport.
- Added: `VoiceSettings`, a catalog-driven voice preferences form (provider, model, voice,
  profile, speed, quality preset, instructions) with an injected catalog transport.
- Changed: `useGatewayVoice` exposes `cancel_voice_ptt_recording()` to discard a recording,
  pending microphone permission or transcription when its owner changes, and a superseded
  text-to-speech stream no longer starts playing late.

### panel-chat 0.1.16

- Added: `WorkflowChat`, a controlled, presentation-only chat surface for workflow hosts
  (`messages`, `draft`, async `onSend` with retained draft and retry on failure, `busy` /
  `onCancel` Stop control, `sendWhileBusy`, read-only `disabled` mode, `renderMarkdown`), and
  `WorkflowInteractionPanel` for pending `ask-user`, `tool-approval` and `event-wait`
  interactions.
- Added: `WorkflowSessionController` and `useWorkflowSession`, a gateway-facing controller
  that consumes an injected `WorkflowTransport` and keeps no URL, credential or browser
  persistence; `authScopeKey` resets it on sign-in changes. See
  [`panel-chat/examples/workflow_assistant.tsx`](panel-chat/examples/workflow_assistant.tsx).
- Added: granted tool approvals are running work, not a question. Under a standing
  permission (or an accepted Allow) `snapshot.toolApprovalGranted` is set, the batch's tools
  are presented as running and `workflowProgress` reports "Running N tools".
  `workflowPendingInteraction(snapshot)` returns the wait a host should render as a question.
- Added: Stop states from ledger evidence. `WorkflowSessionSnapshot.stop`
  (`WorkflowStopState`) reports `stopping`, `stopped` (root cancelled and every started model
  call terminated) or `forced` (gateway kill switch); `WorkflowChat` `stopState` shows
  "Stopping…" and then the outcome where the Stop button was.
- Added: drag-and-drop and paste to attach. `WorkflowChat` `onFiles(files)` and
  `attachments`; a drop zone over the composer; folders, drops outside the chat and a
  disabled chat are refused with a visible message; pasted screenshots and files attach
  (Office selections still paste as text); a polite live region announces the target.
  `ChatComposer` gains `leading`, `overlay` and `onPaste`; pure helpers are exported from
  `file_drop.ts` (`DragPresence`, `droppedFiles`, `pastedFiles`, `folderRefusal`, …).
- Added: structured detail panels for the message-card chips (tokens / tools / time) via
  `StatDetailPanel` and the pure `statDetail(kind, statistics)`: per-call token and cache
  figures, measured time-to-first-token, prefill and generation rates, speculation, tool
  batches and failure classes. Absent metrics read "not reported", never 0.
- Added: `workflowEvidence`, `foldWorkflowTools`, `historyRecords`, `ToolActivity`,
  `ToolActivityGroup`, `workflowProgress` and `resolveWorkflowEventTarget` (event waits
  recover their canonical scope from ledger evidence; an ambiguous wait is shown as
  unavailable rather than guessed).
- Fixed: the duration chip's prompt-processing line pairs each call's prompt time with the
  tokens it actually processed, so a prompt-cache hit no longer shows a rate computed over
  restored tokens.
- Changed: the `@abstractframework/ui-kit` peer range is now `^0.1.10`.

### app-server 0.1.9 and monitor-memory 0.1.9

- First publication on npm of `@abstractframework/app-server` (the app-origin gateway session
  proxy, `createGatewaySessionProxy`) and `@abstractframework/monitor-memory` (host memory
  meter web component). Apps no longer need a `file:` reference to this repository.
- monitor-memory's tarball now includes its README.

### Release process

- The release workflow publishes `app-server`, checks the tag against the root version only
  (packages are versioned independently) and skips versions already on npm.

## 0.1.9 - 2026-08-29

### Added (2026-08-27)

- New package `@abstractframework/monitor-memory` (v0.1.8, in sync with the
  monorepo): a dependency-free `<monitor-memory>` Custom Element plus an
  imperative controller that renders compact host RAM + device (GPU/
  accelerator) memory meters and polls a Bearer-secured metrics endpoint
  (default `GET /api/gateway/host/metrics/memory`, tick 5000 ms, minimum
  1000 ms; `full` and `icon` modes). `extractMemoryUsage` accepts flat or
  `memory`-nested payloads and reads RAM percent (or derives it from
  used/total bytes) and device allocated/total bytes. Honest degradation: a
  404 or `supported:false` reply shows `N/A` and stops polling (changing the
  endpoint clears the verdict and resumes); 401/403 stops until a token is
  set; 429 backs off 30 s. Ships `node --test` coverage
  (`monitor-memory/test/`), registered in the root workspaces, and themable
  via `--monitor-memory-*` CSS custom properties.

### Added (2026-07-22 — backlog 0028 / gateway card-015)

- `@abstractframework/panel-chat` exports `./transcript.css`: the standalone
  dialogue-transcript slice (`.pc-chat-thread` + the `.pc-chat-item` bubble
  family — 31 classes, no React, no content styles). GENERATED, never forked:
  `scripts/extract_transcript_slice.mjs` extracts the marked region of
  `panel_chat.css` verbatim and prepends a machine-derived token contract
  (every consumed custom property, all with fallbacks — the file works
  themeless and maps onto console vars); the package test gate runs `--check`
  and fails on drift. Single-file consumers (gateway console, future embeds)
  vendor THIS file instead of hand-copying the block.

### Changed (2026-07-19 — backlog 0003 dedupe half)

- One clipboard helper per package (was four copies): panel-chat's
  `json_viewer` now imports the canonical `utils.copyText` (its private copy
  was the weaker variant — no off-screen textarea positioning, no result);
  monitor-flow's two byte-identical private copies collapsed into
  `src/copy_text.ts` with the canonical semantics. Cross-package unification
  deliberately deferred: monitor-flow must not gain a panel-chat dependency
  for one function — it rides the 0003 one-source viewer decision.
- panel-chat: dead `PanelChatMessage` type export removed (`types.ts`
  deleted). Zero importers across observer/flow/abstractcode-web verified;
  `ChatMessage` (chat_message_card) is the live message type.

### Added (2026-07-18 — backlog 0006 test rigs; 0008 closed)

- panel-chat and monitor-flow now have real test rigs, so the root
  `npm test` reaches ALL SIX workspaces: `panel-chat/scripts/check_panel_chat.mjs`
  (markdown table/list/fence pins — including the three table pins migrated
  in from continuum's suite — the JsonViewer collapseAfterDepth
  measurable-fold contract, ChatMessageCard timestamp guard and
  title-over-role) and `monitor-flow/scripts/check_monitor_flow.mjs`
  (build_agent_trace ordering/dedup/grouping incl. the
  auto-label-never-filters regression, the JsonViewer twin contract, and the
  package-owned toolbar-class stability assertion). Both run against the
  compiled dist via react-dom/server renderToStaticMarkup — existing
  devDependencies only, no jsdom.
- `ui-kit/scripts/check_matrix_wrapper.mjs` in the kit gate: the
  PhaseCapabilityMatrix WRAPPER's DOM decisions are now pinned (labeled
  refusal view that renders no grant state, requires_review approval control
  with an accessible act label, trust-blocked cells render zero buttons,
  absent mark, tristate aria-pressed, pending-count note, orphaned patches
  never count as unsaved changes).

### Fixed (2026-07-18)

- ui-kit: `af_cognition_bloom.tsx` imported `./cognition_bloom_core` WITHOUT
  the `.js` extension — bare-Node ESM consumers of the kit dist crashed with
  ERR_MODULE_NOT_FOUND on any import that reached the index re-exports
  (bundlers resolve extensionless specifiers, which is why every prior gate
  was green). Found by the new panel-chat rig's first run — the exact
  publish-only breakage class 0007 named.
- monitor-active-memory: the KG explorer's graph canvas is now FORCED-DARK
  BY DECLARATION (backlog 0008 decision): `.amx-graph` carries its own dark
  ground (#0c1222, color-scheme dark) so the dark-space node/edge/label
  literals never sit on a light host surface; the panel chrome around the
  canvas consumes theme tokens (error/warning text, divider) with the prior
  literals as fallbacks.

### Fixed (2026-07-17 — backlog 0007/0008 targeted fixes)

- Packaging (0007): the four React packages (`ui-kit`, `panel-chat`,
  `monitor-flow`, `monitor-active-memory`) now declare a `default` condition
  in their `exports` maps (monitor-gpu precedent) so CJS-context consumers
  (`require()`, Jest without ESM) resolve instead of
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Verified by createRequire resolution
  against all five packages.
- Packaging (0007): `monitor-gpu/src/index.d.ts` now declares the FULL
  runtime export surface — `HistoryBuffer`, `makeGpuMetricsUrl`,
  `resolveBearerToken`, `buildAuthHeaders`, `extractUtilizationGpuPct`,
  `fetchHostGpuMetrics` (+ `GpuMetricsResult`) were exported but undeclared,
  so TS consumers got compile errors on working runtime imports. Verified by
  a strict tsc check importing all nine symbols.
- `PhaseCapabilityMatrix` core (0008, F20): `assigned`/`resolved_value`/
  `executable` now refuse non-boolean PRESENCE loudly like the enum fields do
  (a serializer emitting `"true"` silently read as false — the operator's
  stored word rendered as "Default" and the no-op collapse misfired); absent
  keys keep their defaults. `reconcilePatches`/`serializeCellPatches` validate
  `op ∈ {grant, deny, clear}` and drop malformed entries so externally
  supplied patch lists (restored drafts, broken callers) never reach the wire
  with an unknown op. New seeded-bug checks in `check_matrix_core.mjs`.
- `CriticalActionDialog` (0008, F14): Escape and scrim-click are now gated on
  `!busy` — while the action runs the Cancel button is disabled, and an
  irreversible-action surface must not keep a keyboard/pointer side-door to
  the same refused dismissal.
- `ToolPolicyEditor` (0008, F10/F21): checkbox rows, approval selects and the
  filter input carry accessible names (forty anonymous checkboxes before);
  the segmented mode switch is a `role="group"` with `aria-pressed` buttons
  (was `role="tablist"` misuse); and selection writes never prune names for
  tools not yet loaded — an early click before async tool discovery completed
  used to erase prior selections (Select none clears only what the user can
  see; undiscovered names are preserved).
- monitor-flow CSS contract (0007, closed same evening): `AgentCyclesPanel`
  no longer self-imports `agent_cycles.css` — the ONE family rule holds
  (hosts import CSS as an explicit package export). Decided with the flow
  seat (option a); removal landed only after all three consumers (flow,
  observer, abstractcode/web) shipped their explicit import with receipts,
  so no consumer ever rendered unstyled. Fixes bundler-less ESM consumption
  of the panel (a bare CSS import in dist was a syntax error outside
  bundlers).
- panel-chat markdown (continuum-contributed, owner-reviewed): a table
  header+separator now interrupts a paragraph (GitHub behavior, same rule as
  the existing list interrupt) — assistant status tables emitted directly
  after a prose line rendered as piped prose before. Regression pins live in
  continuum's suite until panel-chat grows its rig (0006 notes the
  migration).
- ui-kit `Icon` (continuum-contributed, owner-reviewed): `thumbsUpFilled`/
  `thumbsDownFilled` closed-silhouette twins for pressed/standing vote
  states — coordinates byte-identical to the stroke thumbs so toggling never
  shifts a pixel; open stroke outlines can never solidify via CSS fill.

### Added

- UI Kit `SteerComposer`: the shared "speak to a live run" input (hooks plan
  H4). Posts `inject_guidance` to `/api/gateway/commands` through the
  app-origin proxy (CSRF twin attached; `submit` injectable for direct-bearer
  apps), reports queue truth honestly ("Queued (seq N)" — delivery is the
  `abstract.steer_seen` ledger ack consumers already render), and surfaces
  the parked-run delivery semantics (steers do not wake runs). Entity-visit
  403 refusals render verbatim per the H5 rite contract.
- UI Kit `DisclosureList`: the shared expandable-rows list on the amended
  contract (c1116 + flow's two amendments): dual-key `{entityId, rowKey}`
  selection (row = keyboard/aria anchor, entity = preview; same-entity
  siblings get a `data-entity-selected` echo, never a second ring),
  controlled per-row-path expansion over consumer-supplied VISIBLE rows,
  flat-with-depth row model, `role=tree` + roving tabindex, Enter/dblclick
  activation, Home/End + typeahead, `scrollOnSelect` + `scrollToRow` handle,
  muted `hint` slot (name-collision disambiguation) and the
  `.af-disclosure__rail` badge-rail overflow fade.
- UI Kit `AfChip` / `AfChipButton`: the shared chip family. Kit owns tones +
  geometry + ONE derivation recipe (bg 12% hue, border 35%, text mixed 45%
  hue / 55% `--text-primary` — the measured AA recipe); no filled variant by
  contract; `tone="custom"` accepts only `var(--token)` hue references (raw
  colors refused → neutral) so app hues cannot re-fork the theme system.
  Split by interaction reality: `AfChip` (span + optional remove button) vs
  `AfChipButton` (real button with `aria-pressed`/`aria-expanded`).
- UI Kit `Icon`: seven nav glyphs contributed by continuum (c1126) — `board`,
  `inbox`, `server`, `agent`, `playCircle`, `list`, `gear` — rendered from
  their native 16-grid (stroke 1.4) so the paths stay verbatim.
- UI Kit `useGatewayVoice`: the shared voice hook absorbed from the
  observer/continuum byte-similar copies before first divergence. Contract
  change: the two gateway calls are INJECTED (`tts: (text) =>
  Promise<ArrayBuffer>`, `transcribe: (blob, mime) => Promise<string>`) so
  the kit stays transport-free; return shape kept verbatim for mechanical
  adoption. NEW streaming half (operator item 3): optional `tts_stream`
  yields WAV segments that play as synthesis progresses (segment-queue
  player with pause/resume across segments; never auto-resumes while
  user-paused), plus `streamTtsJsonl` — the ready-made transport for the
  gateway's `/runs/{run_id}/voice/tts/stream` JSON-Lines endpoint
  (`audio_b64` segments, terminal done/cancelled, error events thrown).
- UI Kit `GatewayConnectModal` `initialStatus` prop: apps that probed the
  connection at boot seed the modal so opening it does not re-probe (the
  modal still refreshes after sign-in/out). Part of the 10-15s connect
  incident fold; the README connection contract now also pins the rule the
  incident proved — connected state flips on probe-ok, data fetches fill in
  AFTER and never gate first paint.
- UI Kit `palette_seeds.json`: generated 4-token reduction of every kit theme
  (`name → {primary, surface, secondary, muted}` hex) derived from
  `src/theme.css` by `scripts/generate_palette_seeds.mjs`. Ships in the npm
  package (`@abstractframework/ui-kit/palette_seeds.json`) as a parity fixture
  for terminal-side theme registries (the abstractcode TUI coordination,
  option (a) upgrade path) — a consumer CI can assert its palettes match kit
  truth without a runtime or build dependency. The generator refuses non-hex
  seed values loudly, resolves the real CSS cascade (`:root` defaults +
  grouped light block + own theme block in source order), and `--check` mode
  is wired into the ui-kit `test` chain so the committed artifact can never
  drift from `theme.css`.

### Fixed

- `AfPhaseRadio` focus ring was INVISIBLE: `:focus-visible` referenced
  `--accent-primary`, a token that exists nowhere in the kit, so the whole
  outline declaration was invalid at computed-value time (observer's
  keyboard-focus probe, commons c2160; entity had already adopted the
  component at both call sites). Fixed to `var(--accent)`, and the theme
  token guard gained invariant E: every fallback-less `var(--x)` reference
  in `theme.css` must resolve to a declared token — `var(--x, fallback)`
  stays exempt as the consumer-supplied-token escape hatch. Verified the
  guard fails on the pre-fix CSS and passes post-fix.
- Theme contrast wave (operator directive 2026-07-13 18:30, fable5 themes
  adversary + mechanical WCAG audit over all 20 theme blocks): 62 failing
  token pairs fixed hue-preserving across 18 themes — muted text unreadable
  on cards (18 themes, worst tokyo-night 2.35:1 and everforest-light 2.42:1),
  status colors under 4.5:1 on cards (nord error 2.46:1, rose-pine-dawn
  warning 2.23:1, solarized-light success/warning/info ~3.1:1, and more),
  light-theme text-secondary misses, and per-theme syntax overrides for the
  five dark themes whose lighter code backgrounds dropped the shared
  VSCode-dark set under 4.5:1 (nord, gruvbox, dracula, everforest-dark,
  solarized-dark). Both everforest themes had accent === success (actions
  indistinguishable from confirmations) — accents moved to in-family aqua
  hues. All `*-subtle`/`*-border` rgba twins re-synced to the new base
  colors (63 declarations; the token-integrity guard caught the follow-
  through). Palette seeds regenerated. New guard:
  `ui-kit/scripts/audit_theme_contrast.mjs` (full report + `--strict` gate
  failing under 3.0 or on duplicate roles) wired into `npm test`.
- Consumer literal tokenization (theme audit follow-through): panel-chat's
  quote bar, attention highlight, and composer focus ring now ride
  `--info`/`--warning-*`/`--accent-*` (the hardcoded blues/ambers washed out
  on light themes); monitor-flow's white-alpha overlays and code-block
  background now ride `--ui-surface-1`/`--ui-border-2`/
  `--ui-overlay-bg-hover`/`--ui-code-block-bg` (10 declarations).

### Documentation

- Coredoc refresh (operator directive 2026-07-13 18:30): two new deep dives —
  `docs/theming.md` (token vocabulary, 21-theme system, adoption/migration
  rules for host apps, palette seeds, guard scripts) and
  `docs/adoption-guide.md` (which shared component for which job, the
  cross-app contracts: connection surface, server-truth rendering, labeled
  fallbacks, absorption protocol, versioning discipline). README package
  table now includes `app-server` and the current ui-kit inventory;
  `docs/api.md` export maps refreshed (connection hook, matrix core, steer,
  disclosure, chips, voice, ProviderModelPicker, app-server section);
  `docs/architecture.md` gained the gateway connection sequence diagram and
  app-server in the dependency graph; `llms.txt` updated and `llms-full.txt`
  regenerated (all local links verified; fixed the misspelled
  ACKNOWLEDGMENTS links).

### Added

- Unified top-right corner (operator directive 2026-07-13 20:02; consensus
  plan `plans/unified-top-bar.md` on the hub fs after 3 fable5 design
  adversaries + 3 owner discussion cycles): `AfTopBarActions` (assistant →
  appearance → extras → Disconnect pill; renders the connection hook's
  3-state phase, never a boolean), `AfDrawer` (right-edge, non-modal,
  keep-alive — closed = display:none + inert, never unmounted; layered ESC
  via the consumed-event convention; `topOffset` for below-header layouts;
  full-width under 680px), `AfAppearanceDialog` + `useAppearanceSettings`
  (theme + font scale + header density; per-app key
  `af_appearance_<appId>_v1` with one-time legacy migration; storage
  failures degrade silently to in-memory), `AssistantPanel` (in
  panel-chat — the dependency direction forbids a ui-kit chat panel):
  injected `ask(question, {signal, history})` transport supporting
  Promise or streaming AsyncIterable, `#FALLBACK` error cards in-thread,
  blocked-state notice while disconnected, suggestions/empty state. Icons:
  `sparkle`, `contrast`, `logout`. Z-order tokens `--z-drawer` <
  `--z-connect-modal` < `--z-popover` (connect overlay now consumes the
  token). Hook hardening from the design adversaries: `signingOut` +
  `signOutError` channels on `useGatewayConnection` (a dead app-server no
  longer swallows a failed sign-out silently) and the connect modal's ESC
  honors `defaultPrevented`. The `.af-topbar-*`/`.af-drawer-*` class
  families are documented public API for non-React consumers (gateway
  console). Live-verified 7/7 in headless Chrome (cluster render, assistant
  ask round-trip, theme switch + persistence, disconnect→modal-reopens,
  drawer state surviving disconnect).

- `ProviderModelPicker` (operator directive 2026-07-13 17:28, absorbed from
  continuum's kit-shaped copy per the c1551 ask; flow's PropertiesPanel
  carries the original pattern): mode toggle where "Gateway default" is the
  DEFAULT (empty provider+model = the gateway picks per task; zero discovery
  traffic) and Custom cascades provider → models. Transport is injected
  (`fetchProviders`/`fetchModels`) so each app wraps its own proxy path; a
  generation counter drops stale async results (a slow models fetch for
  provider A never lands after picking provider B); configured-but-
  undiscovered provider/model values stay selectable; degraded discovery
  renders a labeled `#FALLBACK` line. Presentational half reuses
  `ProviderModelSelect` (searchable `AfSelect`s). `.af-pmp` styles ride the
  shared transition/reduced-motion block.

### Security

- `@abstractframework/app-server` gateway session proxy: the local-vs-remote
  safety gate (which unlocks browser-supplied gateway URLs) derived from the
  client-controlled `Host` header — a LAN peer reaching an all-interfaces
  bind could send `Host: localhost`, unlock the remote-config path, and make
  the proxy relay `http.request` to an attacker-chosen origin with the
  browser's session/CSRF cookies attached (SSRF + session-scoped request
  forgery; HIGH, reported by entity c1768, confirmed live-exposed fleet-wide
  by agency c1770, amplified in continuum's hub proxy per c1769). Fixed: the
  gate now derives from `req.socket.remoteAddress` — the connection's real
  transport peer, which the client cannot forge (IPv4-mapped IPv6
  unwrapped); `x-forwarded-host` stays behind the existing trusted-proxy
  opt-in. Explicit `*_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG` still wins for
  deployments behind their own access control. Regression tests: a
  non-loopback peer spoofing `Host: localhost` gets the cookie gateway URL
  ignored (pinned to default, not relayed) and cannot POST a remote
  `gateway_url` (403); a genuine loopback peer keeps the dev posture. When
  proxy headers are trusted (`*_TRUST_PROXY_HEADERS`) the socket peer is the
  reverse proxy, so there is no socket-derived unlock — those deployments
  must set the explicit opt-in (code's mirror point c1772). App owners
  should also default-bind 127.0.0.1 in their launchers (per-app
  precondition close).

### Fixed

- Late-adversary fold (2026-07-14 — nine adversaries whose full reports
  landed after their trail salvages; the six findings the trails had NOT
  carried): `useGatewayConnection.signOut` now invalidates pre-signout
  probes FIRST (a stale "connected" answer landing after the DELETE made
  the follow-up probe's true signed-out answer the one dropped — phantom
  connected over cleared cookies); `SteerComposer` resets status on
  `runId` change and generation-guards in-flight sends (a "Queued (seq N)"
  badge could survive a run switch and stamp the wrong run); the connect
  modal marks its `initialStatus` seed consumed on the FIRST open
  unconditionally (an open during the loading phase shifted seed
  consumption to the second open, resurrecting the stale-seed class);
  markdown paragraphs are now interrupted by list lines (CommonMark —
  "intro:\n- a\n- b" with no blank line rendered the bullets as prose);
  `palette_seeds.json` `secondary` remapped `--bg-secondary` → `--info`
  (the TUI consumer's "secondary" is a bright second accent; parity on a
  background token was unsatisfiable — remapped before any consumer wrote
  a parity test, artifact regenerated); `.af-chip` gained a neutral
  default `--af-chip-hue` (class-only consumers rendered borderless).

- Design review wave (2026-07-13, two fable5 design adversaries — aesthetics
  + layout/responsiveness — plus a whole-package code/logic audit; several
  died mid-report, findings salvaged from trails and all folded):
  AESTHETICS — kit buttons gained hover/active feedback (sign-in, steer
  send, critical actions; panel-chat already had it — the inconsistency read
  cheap); one shared 120ms micro-transition across interactive kit
  components with a prefers-reduced-motion guard; sign-in card weight
  discipline (labels 800→600, buttons 800→700 — six elements at 800 left no
  hierarchy); critical dialog title base→lg (must outrank the consequence
  box). LAYOUT — sign-in form's fixed 150px label column collapses to
  stacked labels under 520px (drawers left ~180px for the gateway URL);
  tool-policy control row stacks under 520px; modal/dialog max-heights use
  dvh with vh fallback (mobile URL bars); iOS coarse-pointer inputs clamp to
  ≥16px (focus auto-zoom at 375px); critical-dialog fact values wrap
  (overflow-wrap) instead of escaping; select options clamp to the real
  viewport; overscroll-behavior: contain on modal/dialog/options/thread
  scrollers; panel select trigger height→min-height (font-scale growth).
  CODE/LOGIC (whole-package audit) — voice: pause during stream starvation
  computed a garbage offset from a stale timestamp and skipped most of the
  next segment on resume (offset now only computed while a source plays);
  resume during starvation renders "playing" (audio auto-continues — a stuck
  "paused" label was dishonest); the non-stream TTS path joined the
  generation guard (a stop mid-decode can no longer resurrect state or
  surface a stale error); PTT busy guard reads through a ref (stale closure
  in recorder onstop). Connection hook: onStatusChange reads through a ref
  (in-flight refresh delivered to a callback one render behind). Proxy:
  request-side hop-by-hop headers stripped (response side already was),
  connection-endpoint bodies capped at 64KB, CSRF comparison is
  constant-time. Markdown: spaced thematic breaks ("- - -") render as hr,
  not a list. DisclosureList: keydown on a non-selectable row moves to the
  NEAREST focusable neighbor (was jumping to first/last); a growing
  typeahead buffer keeps the current row while it still matches. Recorded,
  not built: --header-density is not consumed by the newer components
  (design decision pending); the select positioner's available-space
  max-height lives TSX-side.
- Input/placeholder font harmonization (operator fix 2026-07-13, verbatim
  "the grey text you show in the input panel at the bottom … the font is
  terrible"): the chat composer textarea fell to the browser's default
  monospace form font because no `font-family` was set — it (and every kit
  input found by the same sweep) now uses the app stack explicitly
  (`--font-sans`; the typed-confirm phrase input gets `--font-mono`
  deliberately), and a kit-wide `::placeholder` rule renders placeholders at
  `--text-muted` with full opacity (Firefox dims by default). The
  SteerComposer default placeholder shortened ("Steer this run…" — delivery
  semantics live in the status line, not the placeholder).
- B5 login/auth contract (operator bug wave 2026-07-13, uic lead): after a
  SUCCESSFUL sign-in the connect modal now closes itself (self-close belt
  survives no-op `onClose` consumers) — the stay-open behavior was
  sign-OUT's design and, applied to sign-in, parked a "Signed in." modal
  over the app in every consumer that didn't wire the close. New
  `useGatewayConnection` hook makes the whole connection state machine
  shared code instead of per-app prose: probe-once boot, auto-open only on
  RESOLVED disconnect (never unknown/loading, never over a live session),
  close on the transition to connected (a connected→connected status echo
  from an explicitly opened modal never closes it), stay-open on sign-out,
  re-arm per signed-out episode, `initialStatus` dedupe threading.
  Live-verified end-to-end in headless Chrome against the test-app + stub
  gateway: signed-out boot auto-opens → real modal sign-in → modal closes
  itself + app renders → reload shows the app with no modal → sign-out
  keeps the modal open (4/4 transitions). Adversary folds (state-machine
  audit): the hook's `onClose` reads phase through a ref — in the sign-in
  batch the render-closure phase was stale ("disconnected") and silently
  marked the episode dismissed, killing the NEXT session expiry's auto-open
  (the one transition the happy-path chrome run cannot see); a status
  generation counter drops stale in-flight probe answers so a slow probe
  started before a sign-in can never overwrite the connected status.
  Consumer folds: `signOut()` verb (observer's settings-page datum) and the
  synchronous-delivery pin on `refresh()`.
- Adversarial-review folds on the component wave (2026-07-13, four fable5
  audits): `DisclosureList` row ids can no longer throw on lone-surrogate
  row keys (code-point fallback) and scroll-on-select now fires when a
  selected row is revealed later; `SteerComposer` treats a 200 with
  `accepted:false` as a refusal (never "Queued") and `submitSteer` retries
  the proxy's `csrf_required` refusal across all `*_gateway_csrf` cookie
  candidates with one idempotent command_id (localhost apps on different
  ports share a cookie jar, so the sender cannot know which twin pairs with
  this app's session); `GatewayConnectModal` honors `initialStatus` only on
  the FIRST open (a reopen probes fresh — the seed may predate a sign-out
  made elsewhere); `useGatewayVoice` reads its callbacks through a ref so
  async completions never fire stale closures; markdown list regions now
  BREAK on code fences (a fenced block inside a list rendered garbled inline
  code); nested list markers follow the GitHub/ChatGPT progression
  (decimal→alpha→roman, disc→circle→square) and list indents use
  `margin-inline-start` (RTL); ui-kit `prepublishOnly` runs the full test
  chain so a stale `palette_seeds.json` or token violation can never
  publish.
- Panel Chat markdown renderer now builds REAL nested lists (operator
  incident 2026-07-13, entity chat screenshot): the old list path flattened
  every region into one `<ol>`/`<ul>`, so documents mixing `1.` items with
  indented `-` sub-bullets rendered flat and a marker switch mid-region was
  swallowed into the wrong list type. Lists are parsed into a tree
  (`parseListItemLine`/`buildListTree`): bullets `-`/`*`/`+`, ordered
  `1.`/`1)`, tabs = 4 spaces, deeper indent nests under the previous item,
  a marker-type switch at the SAME indent starts a sibling list, indented
  continuation lines fold into their item, ordered start numbers are
  preserved. Nested lists get tight vertical spacing in `panel_chat.css`.
- Panel Chat `ChatMessageCard` header now honors `message.title` as the
  speaker identity for user and assistant roles ("You"/"Agent" are only the
  fallback when no identity is supplied) — entity replies show the entity's
  name instead of the role literal.

- UI Kit `PhaseCapabilityMatrix`: the phase × capability grid for the
  gateway-owned entity configuration object (config-object consensus plan,
  2026-07-11). Fully payload-driven — phases and sections arrive as ordered
  lists with server-supplied `label`/`hint`, so a new phase never needs a
  component release. Cell model carries server truth verbatim
  (`assigned`/`resolved_value`/`provenance`/`availability`/`reason`,
  `trust_state` for skill cells, and an `executable` axis distinct from
  availability so "standing config" grants — real but with no executor yet —
  stay editable). Edits emit cell-scoped patches only (`grant`/`deny`/`clear`;
  absent = untouched; explicit deny distinct from clear-to-default), so the
  component cannot express a whole-document write. All resolution/patch logic
  lives in a framework-free core module (`phase_capability_matrix_core.ts`)
  whose compiled output the served gateway console can consume directly; the
  React wrapper is DOM-only and renders from the core's single
  `MatrixCellControl` decision (absent | blocked | approval | tristate) so a
  consumer cannot rebuild a plain toggle over a requires-review cell. Unknown
  schema-version majors refuse loudly with a labeled degraded view.
- UI Kit `CriticalActionDialog`: confirmation surface for irreversible
  actions (embedding change / reembed). Server-supplied blast-radius facts
  are required for an enabled confirm; missing facts disable it with a
  labeled `#FALLBACK` unless the consumer explicitly opts into labeled
  degraded proceed; typed-confirm is strictly opt-in (ceremony-is-not-honesty
  ruling). Server JSON is normalized before render
  (`normalizeCriticalActionFacts`), Escape cancels, Tab is contained within
  the dialog, and focus returns to the opener on close.
- Dependency-free node test suite for both cores
  (`ui-kit/scripts/check_matrix_core.mjs`, 68 assertions) wired into the
  ui-kit `test` script; runs against the compiled `dist` artifact the
  consumers actually import. Pins the adversarial-review findings: stale
  patches are reconciled out after a payload refresh (and filtered from the
  wire), a pending clear on an operator-resolved cell displays as honestly
  indeterminate rather than a guessed "off", restating a stored word
  collapses only when the operator's word is the resolution source,
  reserved/`__proto__` phase ids refuse, `cells: null` refuses while omitted
  `cells` stays legal, and facts without a rows array render safely.

- `@abstractframework/monitor-flow` `AgentCyclesPanel` now owns the per-stage
  tinting of the agent think → act → observe loop (think=info, act=warning,
  observe=success), keyed on a `data-stage` attribute contract typed as a
  closed union in the component. Previously the tint CSS lived in AbstractFlow
  only, so other consumers (Observer, AbstractCode) rendered the loop as
  undifferentiated gray pills. Stage text mixes 45% hue / 55% `--text-primary`,
  which recovers ≥4.5:1 contrast at 11px on Nord-class muted palettes (55%
  did not); the lowest-contrast pastel themes (everforest-light) remain
  limited by their own `--text-primary` ceiling at any tint ratio, and the
  stage name stays readable as pill text regardless.
- UI Kit ships the `observer-night` theme (the Observer entity app's warm
  amber / deep blue-black palette) so kit components rendered inside the
  entity view match its chrome.
- UI Kit theme token integrity guard (`ui-kit/scripts/check_theme_tokens.mjs`,
  wired as the workspace `test` script): every theme that redefines a base
  semantic color must define hue-matched `-subtle`/`-border` derivatives —
  pins the leak class found by the 2026-07-11 adversarial review.
- Entity-semantic tokens (`--entity-identity/-memory/-diary/-standing/-scar/
  -bond/-accent`) join the UI Kit as the one source for summoned-entity
  surfaces (c594 contract with the observer seat). Dark values adopt the
  Observer entity app's shipped palette verbatim; light themes get darkened
  variants measured to hold ≥4.5:1 on every light theme's primary and
  secondary backgrounds and ≥3:1 as marks on tertiary surfaces (a scar red
  that vanishes on light would break the one-visual-language goal). These
  are mark colors by contract — entity-colored labels pair the mark with
  `--text-primary` text, and the warm identity/bond/accent family is never
  distinguished by color alone (bond keeps a ≥1.2x luminance gap from
  identity so the pair survives red-green color-vision deficiency). The
  integrity guard pins full-set coverage on the dark default, every light
  theme (CSS `color-scheme` or `theme.ts` group — the two sources are
  cross-checked), and any theme block partially overriding the set.

### Fixed

- Known-debt drift-class sweep (filed 2026-07-11): `ToolPolicyEditor`'s tool
  mode banner tones (`is-warn`/`is-danger`/`is-info`) derived from hardcoded
  Tailwind hues instead of the theme's `--warning`/`--error`/`--info` tokens,
  and `ProviderModelSelect` error text carried a raw red literal — both now
  token-driven. `ToolSpec` additionally accepts a server-declared
  `default_approval` ("approve" | "ask") which takes precedence over the kit's
  hardcoded runtime-defaults mirror; the mirror is now explicitly labeled a
  `#FALLBACK` for gateways that do not serve per-tool defaults (client-copied
  defaults rot — server truth preferred).
- `theme-solarized-light` was the only theme missing the semantic
  `--*-subtle`/`--*-border` token set, so the default dark theme's blue-family
  rgba values leaked into its cream palette wherever those tokens are consumed
  (stage pills, tool badges, ToolPolicyEditor's enabled-row accent border).
- Default (`:root`) `--success/--warning/--error` subtle + border literals
  carried Tailwind hues that did not match the base colors; aligned to one hue
  family per color role. `monitor-flow` and `panel-chat` fallback literals
  aligned to the same values (the tool badge previously carried a third,
  unrelated blue; one panel-chat background was a raw literal, now a proper
  token fallback).
- `monitor-flow` base stage pill derives from `--ui-pill-bg`/`--ui-pill-border`
  theme tokens instead of hardcoded white-alpha values, restoring correct
  rendering on light themes.

## 0.1.8 - 2026-06-14

### Fixed

- Improved the shared JSON viewer used by `@abstractframework/monitor-flow` and
  `@abstractframework/panel-chat` with a better default fold depth, fold-all
  controls, and correct wrapping for long structured output.
- Extended `@abstractframework/panel-chat` Markdown rendering so links and
  images render as first-class rich content instead of plain text.

## 0.1.7 - 2026-05-31

### Added

- UI Kit exports the shared Gateway browser-session sign-in card used by Gateway Console and thin clients.

### Changed

- Synchronized all AbstractUIC workspace package versions and updated `@abstractframework/panel-chat` to depend on `@abstractframework/ui-kit@^0.1.7`.

## 0.1.6 - 2026-05-26

### Added

- UI Kit exports `GatewaySessionSignInCard`, a shared Gateway user-token browser-session sign-in card for React thin clients.
- UI Kit `AfSelect` supports disabled options, disabled custom values with reason text, and custom option labels for dense editor selectors.

### Fixed

- UI Kit select popovers stop wheel-event propagation and style disabled options plus inline custom-value validation messages.

## 0.1.5 - 2026-05-12

### Fixed

- Correct `/monitor-flow` package exports so published consumers can resolve the bundled `agent_cycles.css` from `dist`.
- Use Node 24 in CI/release workflows for npm trusted publishing compatibility.

## 0.1.4 - 2026-05-12

### Fixed

- React package dist output is now usable as published ESM: relative runtime imports emit `.js` specifiers, and `@abstractframework/monitor-flow` copies `agent_cycles.css` into `dist`.
- `@abstractframework/panel-chat` now targets `@abstractframework/ui-kit@^0.1.4`.

### Added

- GitHub Actions CI for install, build, tests, and package dry-runs.
- GitHub Actions npm release workflow using trusted publishing/provenance, publishing packages in dependency order.

## 0.1.3 - 2026-02-05

### Fixed

- `@abstractframework/panel-chat` Markdown renderer now supports headings up to level 5 (`#####`) (see `panel-chat/src/markdown.tsx` + `panel-chat/src/panel_chat.css`).

## 0.1.2 - 2026-02-05

### Changed

- Documentation polish pass for public release (clearer entrypoints, tighter cross-links, and more actionable install guidance).
- Version bump to reflect the documentation release across packages.

## 0.1.1 - 2026-02-04

### Added

- User-facing documentation set and navigation:
  - `docs/getting-started.md` (entrypoint after `README.md`)
  - `docs/architecture.md` (includes Mermaid diagrams)
  - `docs/api.md` (package API map)
  - `docs/faq.md`
  - `docs/development.md`, `docs/publishing.md`, `docs/README.md`
- LLM-oriented docs: `llms.txt` and generated `llms-full.txt` (`scripts/generate-llms-full.py`).

### Changed

- React packages publish **compiled ESM + type declarations** from `dist/` (see `main` / `types` / `exports` in each package’s `package.json`).
- CSS is shipped as explicit package exports and must be imported by the host app:
  - `@abstractframework/ui-kit/theme.css`
  - `@abstractframework/panel-chat/panel_chat.css`
  - `@abstractframework/monitor-flow/agent_cycles.css`
  - `@abstractframework/monitor-active-memory/styles.css`
- `@abstractframework/monitor-gpu` custom element supports `mode: "full" | "icon"` (runtime + types).
- Docs are polished for first-time users (clear entrypoints, cross-links, and npm install examples).

## 0.1.0

- Initial repository snapshot (packages + baseline docs).

## Related docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Publishing (maintainers): [`docs/publishing.md`](./docs/publishing.md)
