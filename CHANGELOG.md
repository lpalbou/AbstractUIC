# Changelog

All notable changes to AbstractUIC are documented in this file.

This project is a **multi-package repository**. Since 0.1.10 each package is versioned
independently: a package is bumped only when it changes. A release heading names the
repository tag (the private root `package.json` version) and lists the package versions it
ships.

## Unreleased (kit round 3, to ship as ui-kit 0.3.2)

### ui-kit

- Fixed: native `<select>` elements reach 44 px on touch in WebKit / iOS Safari (it ignores
  `min-height` on a native-appearance select): on coarse pointers single-choice selects get
  `appearance: none`, `min-height: var(--tap-min)`, the 16 px input font, `max-width: 100%` and a
  redrawn chevron (`--af-select-chevron`), at (0,1,1) specificity so apps' element-level resets do not
  erase the chevron and their class-scoped rules still win; list boxes keep the native look (16 px font).
  Kit selects (`.af-auto`, `.af-schedule`, `.af-appearance`, `.af-tool-policy`, `.af-voice-settings`)
  restate the chevron, padding, height and font over their own class rules.
- Fixed: `.af-disclosure__content` clips on the inline axis only on touch, so an interactive chip's
  44 px hit area is no longer cut (a tap just above/below the chip selected the row); the disclosure
  chevron gets a 44 px `::after` hit area.
- Fixed: `installViewportVars()` ignored `visualViewport.scale`: a 2x pinch-zoom halved `--vv-height`
  and reported a 426 px `--keyboard-inset` with no keyboard, shrinking app shells. A pinch-zoomed page
  (scale > 1.01) now keeps the layout viewport height and no inset; the keyboard at scale 1 keeps its
  inset (offsetTop honoured). The rule is exported as `viewportVarsFrom()`; `check_viewport_vars.mjs`
  pins 7 cases.
- Fixed: kit sheets (sign-in, critical, appearance, about, schedule, `.af-sheet`) and centred dialog
  overlays pad the bottom by `--keyboard-inset`, sheets are `border-box`, and `.af-drawer` sits above the
  keyboard (`bottom: var(--keyboard-inset)`), so pinned action rows and drawer composers stay visible
  with the keyboard up.
- Added: `--af-select-chevron` lives in the base (first) `:root` token block, so the gateway and core
  consoles, whose theme sync copies only that block, receive it by name.
- Added: `check_responsive.mjs` section H (red on the 0.3.1 CSS: 4 failures).

## 0.3.1 - Unreleased (branch feat/responsive, kit round 2)

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.3.1 | updated (patch: touch-target and touch-text fixes measured by the apps) |
| `@abstractframework/panel-chat` | 0.2.1 | updated (patch: JSON viewer touch targets); peer range unchanged |
| `@abstractframework/monitor-active-memory` | 0.2.0 | updated (minor: container-based layout, touch sizes) |

### ui-kit 0.3.1

- Fixed: touch minimums now apply to INTERACTIVE boxes only. Chips (`.af-chip--button`,
  `.af-chip__remove`) keep their pill geometry and get an invisible 44 px `::after` hit area (a
  44 px-tall chip read as an oval button); non-interactive chips, badges, pills and facts get none.
- Fixed: on coarse pointers the About dialog links, link-styled buttons (`.af-auto__linkbtn`, the
  email notice link), checkbox/radio rows (sign-in "Keep this browser signed in", `.af-email__check`,
  every `label > input[type=checkbox|radio]` in `.af-auto` / `.af-schedule`, `.af-tool-row__check`)
  are 44 px rows; the top-bar pill is at least 44x44.
- Fixed: the `AfSelect` panel trigger (also in the model settings' MTP depth) uses `--control-h` on
  touch; the `.af-select--panel` 34 px pin had higher specificity. Pin selects (`.af-select--pin`,
  canvas nodes) are exempt.
- Changed: on touch the automations panel, the critical dialog's consequence / fallback statement
  and the About links use `--font-size-body` (14 px floor; apps may override the token, see
  DESIGN.md §2.3). Secondary lines stay `--font-size-sm`.
- Fixed: desktop panes keep the 0.2.0 look. Container rules now fire only where the 0.2.0 layout
  genuinely broke: the automations panel's definition grid and buttons stack below 400 px (was 520 px:
  a 470 px Code pane lost its two-column grid); the sign-in form stacks below 320 px of card content
  width (was 560/680 px: it stacked inside a 420 px desktop drawer), plus a `767.98px` viewport rule so
  phones keep the stacked form they had in 0.2.0. Verified pixel-identical to 0.2.0 at 1512x982 with the
  automation panel at 470/420 px and the sign-in card in a 420 px drawer.
- Added: `check_responsive.mjs` sections F and G (interactive-only minimums, select, chips hit area,
  44 px rows, primary text), red on the 0.3.0 CSS.

### panel-chat 0.2.1

- Fixed: on coarse pointers the JSON viewer's disclosure lines are padded to 44 px rows and its
  string toggles are 44x44 (only interactive lines grow).
- Fixed: desktop panes keep the 0.2.0 look. The transcript, composer and approval-card container
  rules fire below 360 px of pane width (were 420/560 px, which changed a 420 px desktop drawer); the
  approval buttons no longer stretch between 360 and 560 px. Phones keep 0.2.0's stacked tool rows
  through the `479.98px` viewport fallback.

### monitor-active-memory 0.2.0

- Changed: a `.amx-host` query container wraps the explorer; `.amx-left { min-width: 420px }` is gone
  (`min-width: 0`); the graph / details split stacks below 820 px of the explorer's own width (was a
  1080 px viewport query) and the toolbar grid below 560 px (was 720 px).
- Fixed: the floating controls panel's grid uses `minmax(0, 1fr)` columns with full-width fields and
  wrapping labels, so no label extends past the panel (open or closed); the open panel is a query
  container (`amx-controls`) that stacks its grids below 420 px.
- Changed: 44 px controls and 16 px fields on coarse pointers.

## 0.3.0 - Unreleased (branch feat/responsive)

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.3.0 | updated (minor: responsive layer) |
| `@abstractframework/panel-chat` | 0.2.0 | updated (minor: responsive layer); accepts ui-kit `^0.1.14 \|\| ^0.2.0 \|\| ^0.3.0` |

### ui-kit 0.3.0: responsive layer (responsive workstream 2026-09-30)

- Added: one breakpoint contract for every app — `xs` < 480, `sm` < 768, `md` < 1024, `lg` < 1440,
  `xl` >= 1440 (max-width queries ending in `.98px`), the `short` axis `(max-height: 500px)` and
  `touch` `(pointer: coarse)`; JS `AF_BREAKPOINTS`, `AF_MEDIA`, `useAfMedia(query)`.
- Added: tokens `--font-size-2xl`, `--font-size-body`, `--font-size-input`, `--font-size-code`,
  `--space-1..6`, `--gutter`, `--tap-min`, `--control-h`, `--row-pad-y`, `--row-pad-x`,
  `--control-pad-x`, `--vh-full`, `--safe-top/right/bottom/left`, `--keyboard-inset`,
  `--content-max`, `--reading-max`, `--form-max`, `--drawer-w`. On coarse pointers `--tap-min` is
  44 px and body / input / code text never go below 14 / 16 / 12 px whatever the font scale;
  `data-density="dense|comfortable"` on `<html>` overrides the density tokens.
- Added: `installViewportVars()` mirrors the visual viewport into `--vv-height` and
  `--keyboard-inset` (the iOS keyboard, which `dvh` does not track).
- Added: `html { text-size-adjust: 100% }` — no mobile text inflation when a layout is wider than
  the phone (the cause of Observer's oversized text on phones).
- Changed: `--font-size-xl` is fluid (`clamp(16px, 14px + 0.4vw, 18px)` × `--font-scale`); it
  reaches 18 px at about 1000 px wide, so desktop windows are unchanged. Sizes up to `lg` stay fixed.
- Changed: the kit's dialogs (connect/sign-in, critical action, appearance, about, schedule) pad
  the safe areas and become bottom sheets below 768 px or under 500 px tall, with the action row
  pinned to the bottom; below 480 px their actions stack full width.
- Changed: the sign-in card, the dialogs, the automations panel and the tool policy editor adapt
  to their own width through container queries (`af-signin`, `af-dialog`, `af-auto`,
  `af-tool-policy`); the old `520px` / `680px` viewport queries are gone (the sign-in form now
  stacks inside a 420 px drawer on a desktop too).
- Changed: `AfDrawer` is full width below 768 px (was 680 px) and pads the safe areas; added
  `side="left"`, `backdrop` (a dimmed backdrop that closes the drawer on tap) and the
  `.af-drawer-backdrop` / `.af-drawer--left` / `.af-drawer--offset` classes; `.af-drawer__body`
  is a query container (`af-drawer`).
- Changed: on coarse pointers every kit control reaches 44 px (icon buttons in both axes) and the
  automation form's fields use 16 px text (iOS no longer zooms on focus); the connection pill keeps
  only its dot below 480 px (its accessible name is unchanged).
- Added: `.af-table-wrap`, `.af-sheet-overlay` / `.af-sheet` helpers; `scripts/check_responsive.mjs`
  pins the breakpoint set, tokens, touch floors and containers (red on 0.2.0's theme.css).

### panel-chat 0.2.0: responsive layer

- Changed: `.pc-chat-thread` is a query container (`pc-thread`): below 560 px of thread width the
  tool rows stack (was a 600 px viewport query, kept as a 480 px fallback outside a thread);
  below 420 px bubbles use the full width. Bubbles cap at `--reading-max` (86ch fallback).
  The generated `transcript.css` carries the same change (class set unchanged).
- Changed: `.pc-workflow-chat` / `.pc-assistant` are containers (`pc-chat`): approval and
  ask-user buttons share the row below 560 px and stack full width below 360 px; long details wrap.
- Changed: `ChatComposer` passes `rows` as `--pc-composer-rows`; the textarea grows with its
  content (CSS `field-sizing: content`) from `rows` lines up to 40 % of the viewport. The
  composer is a container (`pc-composer`); its action row wraps; the composer clears the home
  indicator (`--safe-bottom`).
- Changed: on coarse pointers the composer textarea is at least 16 px (it used `--font-size-lg`)
  and buttons, icon buttons, tool rows and workspace rows reach 44 px.
- Changed: `.pc-ws__entries` and `.pc-json-viewer__tree` scroll or wrap inside their pane.
- Changed: Markdown table cells use `overflow-wrap: break-word`, so a narrow table scrolls in
  its wrapper instead of breaking words mid-token.

## 0.2.0 - 2026-09-30

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.2.0 | updated (minor: email automations) |
| `@abstractframework/panel-chat` | 0.1.21 | peer range only: accepts ui-kit `^0.1.14 \|\| ^0.2.0` |

### ui-kit 0.2.0: email automations in the shared form (framework backlog 0992 WP6)

- Added: **When an email arrives** in `AfScheduleDialog` — the runtime trigger `email.received@1`
  with typed filters only (from these addresses / domains, sent to these addresses, subject
  contains, attachments), **Check for new mail every** (1 hour by default when the target runs a
  model, 60 s without one — `targetUsesModel`; never under 60 s, and the dialog states the rule)
  and **At most this many emails per run** (`max_batch`, 1–1000, default 100). List entries are
  checked as plain addresses or domains and a wrong entry is named.
- Added: **Email me the result** (`notify.channels: ["console", "email"]`) and **May send email
  without asking to: Only me / Me and these addresses** (`policy.email_allowed_recipients`,
  `["self", ...]`). Defaults send nothing (the server defaults: console, `["self"]`).
- Added: the options are offered only when `GET /api/gateway/me/email` reports
  `effective_enabled`; otherwise the dialog and the Edit form show **"Email isn't set up — open My
  email"** (`emailStatus`, `onOpenMyEmail`), and nothing email-shaped is sent. The client gains
  `getMyEmail()` (`MY_EMAIL_PATH`).
- Added: the Edit form edits an email trigger's interval (the old `start_at` is dropped so the
  revised trigger never re-reads mail), Email me the result and the allowed recipients; the
  definition card lists Notify and May email; `triggerSummary` reads email triggers.
- Added: `AfEmailTriggerFields`, `AfEmailOptionsFields`, `AfEmailSetupNotice` for hosts with their
  own create form, the pure rules (`emailTriggerConfigFrom`, `emailAllowedRecipientsFrom`,
  `notifyFor`, `emailUsable`, …) and the types (`EmailReceivedConfig`, `EmailFilter`,
  `AutomationNotify`, `MyEmailStatus`; `AutomationDefinition.schema_version` 1 | 2).
- Changed: `automation_controls.json` gains an `email` section (the form's words, `EMAIL_TEXT`);
  the Assistant and the Code TUI vendor it byte for byte. `ReviseForm` gains `notifyEmail` and
  `emailRecipients` (`null` without a definition).
- Added: `scripts/check_automation_email.mjs` (in `npm test`), red before this change.

### panel-chat 0.1.21: accepts ui-kit 0.2.0

- Changed: the `@abstractframework/ui-kit` peer (and dev) range is `^0.1.14 || ^0.2.0`; with the
  old `^0.1.14` an app installing ui-kit 0.2.0 next to panel-chat 0.1.20 fails npm's peer check.
  No code change.

## 0.1.17 - 2026-09-29

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/panel-chat` | 0.1.20 | updated |

### panel-chat 0.1.20: the approval gate is the same in every client

- Fixed: a conversation whose root run is parked on its agent loop (`subworkflow:<child>`) while
  that child asks for a tool approval showed the gate only in the client that started the turn.
  A client opening the same conversation later (`WorkflowSessionController.load`) folded the
  child's waiting record from the history bundle, then replaced it with the root's own durable
  wait — a delegation, never a question — so it showed "Running a tool write_file", a Steer
  composer and no Allow/Deny, while the run waited (operator report, 2026-09-29, a remote
  Safari vs. the gateway machine's Safari and a phone on the same run). A delegation wait now
  never displaces a person-facing wait (`interactionWith`), a child's durable `waiting`
  (`GET /runs/{child}`) is adopted when the bundle's window or a reconnect lost the record
  (`adoptDurableWait`), and a wait a ledger `resume` record already answered is never re-opened
  from a snapshot read in between (the runtime appends the record before it saves the run).
- Fixed: the transcript's tool row for a parked batch read "Running" when the waiting record's
  `effect.payload.tool_calls` was the ledger's `$slim` pointer to the STARTED record (the store
  writes it that way; `GET /ledger`, the history bundle and the SSE tail all serve it). The fold
  now takes the calls from the wait itself when the payload holds none, so the row says
  "Approval needed" in every client.
- Added: `scripts/check_approval_sync.mjs` (in `npm test`) with a redacted live capture
  (`scripts/fixtures/run_approval_subrun.json`): a fresh client, the originating client across the
  root lifecycle poll, durable state alone, a replayed root delegation record, another client's
  resume clearing the gate, and the `$slim` fold — red before this fix.

## 0.1.16 - 2026-09-28

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.16 | updated |
| `@abstractframework/panel-chat` | 0.1.19 | unchanged (its `^0.1.14` range takes ui-kit 0.1.16; `AutomationPanelWithMarkdown` renders the kit's panel, so it shows the new hints) |
| `@abstractframework/app-server` | 0.1.12 | unchanged |
| `@abstractframework/monitor-memory` | 0.1.10 | unchanged |
| `@abstractframework/monitor-gpu` | 0.1.10 | unchanged |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### ui-kit 0.1.16: one shared "Run now" hint and glyph

- Added: every automation control carries a tooltip (`title`) and `aria-description` saying what
  it does (`CONTROL_HINTS`, `controlHint(id, summary)`). Run now's says it runs once now instead of
  waiting, that the next scheduled run keeps its time (or starts right after this run if its time
  comes first), that it does not count toward a run limit, works while paused (which stays paused)
  and is not available while a run is in progress; with the summary it adds the next scheduled
  time and, for a Growing automation, that later runs see it in their history. A disabled
  control's tooltip keeps its reason as the first line.
- Added: `ui-kit/src/automations/automation_controls.json`, the one canonical file for the
  controls' names, hints, `RUN_NOW_ONE_LINE` and the run-now glyph (`RUN_NOW_GLYPH`, the
  `playCircle` markup). `CONTROL_LABELS` and `CONTROL_HINTS` read it; clients that cannot import
  the kit vendor it byte-identical (root `scripts/check_identity_sync.py`).

## 0.1.15 - 2026-09-28

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.15 | updated |
| `@abstractframework/panel-chat` | 0.1.19 | unchanged (its `^0.1.14` range takes ui-kit 0.1.15; `AutomationPanelWithMarkdown` passes the new props through) |
| `@abstractframework/app-server` | 0.1.12 | updated (pointer reader hardening) |
| `@abstractframework/monitor-memory` | 0.1.10 | unchanged |
| `@abstractframework/monitor-gpu` | 0.1.10 | unchanged |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### app-server 0.1.12

- Fixed: the local gateway pointer reader (`readGatewayPointer`) opens with `O_NONBLOCK`, so a
  FIFO planted at `~/.abstractframework/gateway.json` is refused as "not a regular file" instead
  of hanging the app's launch; and it refuses a file over 64 KiB unread ("it is larger than 64
  KiB (N bytes)"; `POINTER_MAX_BYTES`) — a pointer is a few hundred bytes. Same rules as the
  Python readers (AbstractAssistant, AbstractCode).

### ui-kit 0.1.15: AutomationPanel — Edit edits

Operator report 2026-09-28 (Observer 0.1.14): "when i click 'edit' … it does NOTHING. i have to
go to the right and click revise… edit => i can edit right now."

- Added: `editOpen` / `onEditOpenChange(open)` on `AutomationPanel` (optional, controlled). A host
  with its own Edit control opens the panel's Edit form directly; the panel's Edit button asks
  `onEditOpenChange(true)`, Cancel/Escape and a successful save ask `false`. Opening focuses the
  form's first field. Without the props the panel keeps the state itself, as before. The form
  never opens on an automation that cannot be edited (archived, legacy, no `revise` capability).
- Changed: the Revise control is **Edit** everywhere (`data-action="edit"`; the form's buttons
  `edit-save` "Save changes" / `edit-cancel` "Cancel"). The `revise` capability and `onRevise`
  are unchanged.
- Added: with the `definition` prop the Edit form also edits the **task**
  (`target.input_data.prompt`, sent as `changes.target` = the definition's `bundle_ref` /
  `flow_id` and its `input_data` with the new prompt) and **tool approval**
  (`changes.policy.tool_approval`). `reviseFormFrom(summary, definition?)` and
  `reviseChanges(summary, form, definition?)` take the definition; type `ReviseDefinition`.
- Added: every panel action button is a kit icon then its label (controls, Edit form, archive
  confirmation, wait answers, run details, Discuss, load earlier). `CONTROL_LABELS` and
  `CONTROL_ICONS` are exported so hosts name and draw their row actions the same way.
- Changed: action feedback shows next to the buttons for `NOTICE_MS` (5 s) with a dismiss
  control, then clears (was a line left under the panel). The panel's own errors are dismissible.
  Disabled-control reasons are one compact muted line (reasons joined by "·") and each disabled
  button's tooltip, still linked with `aria-describedby`.
- Fixed (release gate): the Edit form snapshots the automation when it opens. Its values, the
  diff base and `expected_revision` come from that snapshot, so a poll refreshing the panel after
  another client renamed the automation no longer turns a save into a silent revert of the rename
  (`changes.title` = the old title with the NEW revision); the save is refused with
  `revision_conflict` instead.
- Changed: the workspace fact is one control — folder icon + the whole path, wrapping at its
  separators, the whole chip opening `onOpenWorkspace`.
- Changed: the Definition is a card right under the controls ("Definition · revision N"); the
  Edit form takes its place while open.

## 0.1.14 - 2026-09-28

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.14 | updated |
| `@abstractframework/panel-chat` | 0.1.19 | updated (requires `ui-kit` `^0.1.14`) |
| `@abstractframework/app-server` | 0.1.11 | updated |
| `@abstractframework/monitor-memory` | 0.1.10 | updated |
| `@abstractframework/monitor-gpu` | 0.1.10 | updated |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### All browser packages: relative same-origin URLs

- Changed (affects hosts that relied on rooted defaults): every same-origin default is RELATIVE —
  `api/connection/gateway`, `api/gateway/commands`, `api/gateway/automations`,
  `api/gateway/trigger-sources`, `api/gateway/runs/{id}/workspace…`,
  `api/gateway/host/metrics/{gpu,memory}` — never rooted at `/`. Apps are now served under a base
  path (AbstractGateway's `/apps/<id>/`); a rooted default escaped the app's base and missed its
  server. Hosts that relied on the old rooted defaults pass the explicit override
  (`connectionPath`, `commandsPath`, `baseUrl`, `endpoint`, `fetchGateway`). The page URL must end
  with `/`.
- Added: `scripts/check_relative_urls.mjs`, run last by the root `npm test` (and `npm run
  check:urls`): fails on any root-absolute same-origin literal (`/api/`, `/assets/`, `/apps/`) in
  the sources and built output of ui-kit (incl. the console islands bundle), panel-chat and the
  monitors, and when a build directory is missing. No allowlist.

### app-server 0.1.11

- Added: serving under the gateway's `/apps/<id>/` (`mount.js`): `createMountedHandler` (sets the
  `X-AbstractFramework-App: <id>; mount=1` identity header the gateway requires before it serves
  an app), `requestContext(req)` (base path from `X-Forwarded-Prefix`, the browser's address from
  `X-Forwarded-For`, proto and host — believed ONLY from a loopback socket peer; a malformed
  forwarded header or an unknown peer is a 400 `MountRequestError`), `injectShell` (`<base href>`
  and `base_path` in `window.__ABSTRACT_UI_CONFIG__`), `appPath`, `cookiePath`,
  `serializeCookie` / `parseCookies` (cookies at `Path=<basePath>/`, first value wins),
  `rejectUpgrade` and helpers. `test/fixtures/mount_app.mjs` is a runnable mount-capable app.
- Added: the shared launch flags (`parseAppFlags`, `parseAppFlagsOrExit`, `appUsage`,
  `FlagError`): `--gateway-url <url>` (aliases `--gateway`, `--url`), `--port`, `--host` (default
  `127.0.0.1`), `--help`, plus app-specific flags. Environment variables are legacy aliases below
  every flag.
- Added: the local gateway pointer reader (`readGatewayPointer`, `resolveGatewayUrl`,
  `createGatewayUrlResolver`, `gatewayPointerPath`): `~/.abstractframework/gateway.json`
  (schema 1, loopback URL only, owned by the current user) and the one precedence — flag, legacy
  environment, saved login (except the old built-in `http://127.0.0.1:8080`), pointer, built-in
  default. Reader cases are shared by every language in
  `ui-kit/scripts/fixtures/gateway_pointer/` (pinned by `CHECKSUMS.sha256`).
- Changed: `createGatewaySessionProxy` — `defaultGatewayUrl` accepts a resolver; without one the
  proxy uses `ABSTRACTGATEWAY_URL` (legacy), else the pointer, else `http://127.0.0.1:8080`, and
  re-reads the pointer when the gateway refuses a connection. `X-Forwarded-For` to the Gateway is
  the browser's address (behind the gateway's loopback proxy, the address it forwarded). Mounted
  under a base path, session cookies carry `Path=<basePath>/`; sign-out clears that path and `/`.
- Security: a browser may choose its own Gateway URL (or have its URL cookie honoured) only when
  its address is loopback AND the `Host` header names loopback (and `X-Forwarded-Host`, when a
  loopback proxy sends one) — a DNS-rebinding page resolving to 127.0.0.1 is refused. The
  `Secure` cookie flag follows `X-Forwarded-Proto` from a loopback peer only. The app's own CSRF
  headers (`x-<appId>-csrf`, `x-abstract-csrf`) are checked locally and never forwarded to the
  Gateway.
- Security: `requestContext(req).clientIsLoopback` — THE field for every app-local privileged
  check — is true only when the client address is loopback AND the request names a loopback host
  (new `hostIsLoopback`: the raw `Host`, and `X-Forwarded-Host` from a loopback peer, are
  `localhost`, `*.localhost`, `::1` or a `127.x` IP literal, never a DNS name). A socket from
  127.0.0.1 with `Host: evil.example` (DNS rebinding) is not local. The session proxy's
  browser-chosen-URL rule reads the same field. Also exported: `isLoopbackHostname`.
- Security: the pointer reader opens the file with `O_NOFOLLOW` and checks the OPENED file
  (`fstat`: a regular file owned by the current user, no group/world write bit), so a symlink is
  refused and the file cannot be swapped between the check and the read.
- Docs: apps under the gateway's `/apps/*` and the gateway console share ONE origin, one trust
  domain: cookie `Path` scoping picks which cookie a request carries, it is not isolation.

### ui-kit 0.1.14

- Added: `gateway_paths.ts`, the one source for same-origin routes: `GATEWAY_API_PATH`,
  `GATEWAY_CONNECTION_PATH`, `gatewayApiPath(route)` and `joinBaseUrl(baseUrl, path)` (both refuse
  a rooted argument). `createAutomationsClient({ baseUrl })` joins with it: "" keeps requests
  relative to the page; `http://host:8080` and `https://host/prefix/` prefix them.
- Changed: `AutomationPanel` no longer renders `ledger_url` or `artifacts[].url` as hrefs (they
  are rooted at the gateway and bypassed the app's session under `/apps/<id>/` and a standalone
  app's proxy). Added `onOpenResource(resource)` (`GatewayResource`: `kind` ledger/artifact, the
  server's `url`, `name`, `mimeType`, `runId`): artifact names and a **Ledger (JSON)** button call
  it; without it artifacts are plain names and there is no ledger JSON button. Added
  `gatewayResourcePath(serverUrl)` (gateway-rooted → app-relative; anything else throws, as does a
  `.`/`..` segment, plain or percent-encoded, and an encoded slash or backslash, so a server
  string cannot step out of the API base). The
  contract fixtures are unchanged: the gateway keeps sending rooted paths; the client maps them.
- Added: `AutomationStateLabel` renders an automation's state as the word then an icon
  ("Active ▶", "Paused ⏸"; Completed, Failed and Archived likewise) — the one rendering every
  client uses. `STATUS_LABELS` (the words) and `STATUS_ICONS` (the icons) are exported.
  `AutomationPanel`'s header uses it instead of the bare word.
- Added: icons `play`, `stop`, `folder`, `file`, `archive` and `clock` (24-grid, stroke 2;
  `play` and `stop` solid like `pause`). The console islands bundle includes them.
- Added: `AutomationPanel` `onOpenWorkspace(runId)`: a folder button on the header's Workspace
  fact (called with the automation id, which is its controller run) and a **Workspace** button in
  each run's details (called with that run's id). Changed: the run details no longer link to the
  raw workspace route — that link showed JSON and failed in token mode (no bearer token); without
  `onOpenWorkspace` no folder control is shown.
- Added: `AutomationPanel` `renderTurn(turn)` seam (`AutomationTurn`: `kind` trigger/answer,
  `role`, `text`, `index`, `runId`; type `RenderTurn`), so a host renders each occurrence turn as
  its chat message card; without it the turn's text goes through `renderText` as before.
- Added: canonical gateway pointer fixtures `scripts/fixtures/gateway_pointer/` (`cases.json`,
  valid / malformed / non-loopback / wrong-schema files, `CHECKSUMS.sha256`): the case table every
  pointer reader tests against (app-server here; other apps vendor byte-identical copies).

### panel-chat 0.1.19

- Changed: the `@abstractframework/ui-kit` peer range is now `^0.1.14` (`renderTurn`,
  `onOpenResource`, `gatewayResourcePath` and the new icons ship in ui-kit 0.1.14).
- Changed: `AutomationPanelWithMarkdown` / `automationRenderers` render each occurrence turn as
  the shared `ChatMessageCard` (a user card titled "Trigger", an assistant card titled
  "Automation", with the copy button; remote images as links on both). New exports
  `renderAutomationTurn()` and `AUTOMATION_TURN_TITLES`; `automationRenderers` is now
  `{renderText, renderTurn}`. `AutomationPanelWithMarkdown` takes a `fetchGateway` prop, which
  wires `onOpenResource` through `openGatewayResource`.
- Added: `openGatewayResource(fetchGateway, url, { name, mode? })` (fetch a gateway resource
  through the host, open it with `tabOpenPlan`) and `deliverBlob(blob, name, mode)`.
- Added: `WorkspaceBrowser` (moved from AbstractObserver): browse a run's folder on the gateway
  host — breadcrumbs, folders first, sizes, entries hidden by the gateway's rules counted — and
  open or download files, fetched through the host's credentialed `fetchGateway(path, init)`
  (works in token mode and on a remote gateway). HTML, SVG, XML and other text open as plain
  text: a blob URL runs with the app's origin, so a model-written page must never execute
  there. `onSelectFile` / `selectedPath` let a host with its own preview (AbstractCode) use it.
  Hook-free `WorkspaceBrowserView` and helpers (`loadWorkspaceView`, `parseWorkspaceListing`
  — malformed answers fail loudly — `tabOpenPlan`, URL builders and formatters) are exported.
- Added: `presentInteraction(wait, controller, options?)` (moved from AbstractCode web): the one
  mapping from a runtime wait to the `WorkflowChat` control — tool approval (Allow all only with
  `options.onPermissionsAll`), question, event wait (refused when it cannot be routed).
- Fixed: `sameOriginImage` (the default image rule for `images="link"`, used by
  `ChatMessageCard`) accepts RELATIVE paths such as the kit's own `api/gateway/…` workspace content
  routes: a source is resolved against `document.baseURI` and loads only when it is http(s) on
  the page's own origin, so it works for an app mounted at `/apps/<id>/` without the host
  rewriting paths to absolute URLs. Protocol-relative `//host` and `/\host`, other origins and
  ports, and `javascript:` / `data:` / `blob:` / `file:` sources stay links (or are dropped).
  `Markdown` now parses relative image sources (links keep their existing rule). Without a
  document (server rendering), a source that starts with a scheme (`http:evil.com/x.png`) is
  refused: it is never a relative path.

### monitor-gpu 0.1.10 and monitor-memory 0.1.10

- Changed: the default `endpoint` is the RELATIVE `api/gateway/host/metrics/gpu` /
  `api/gateway/host/metrics/memory`, resolved under the page's base path (an app served at
  `/apps/<id>/`) or under `base-url` when set. Pass an explicit `endpoint` to keep a rooted path.

## 0.1.13 - 2026-09-27

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.13 | updated |
| `@abstractframework/panel-chat` | 0.1.18 | updated (requires `ui-kit` `^0.1.13`) |
| `@abstractframework/app-server` | 0.1.10 | unchanged |
| `@abstractframework/monitor-memory` | 0.1.9 | unchanged |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-gpu` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### ui-kit 0.1.13

- Added: `AutomationPanel` shows and manages one AbstractGateway automation — its trigger
  ("every 8 hours (UTC)"), context, next run, run count and attention; Pause / Resume, Run now
  (also while paused; the automation stays paused), Stop current, Revise… and Archive… (confirmed
  in the panel), each disabled control with a visible reason; its runs as chat pairs, quiet runs
  subdued and notified, failed (reason, message, attempts) and waiting runs badged; Discuss forks
  the automation at a run with its full history, in its own writable workspace with the
  automation's files mounted read-only for the file tools — shell commands are not sandboxed by
  the mount (`DiscussResponse.workspace_root` / `mounted_workspace`). Attention is acknowledged up to the last displayed
  item, after `/seen` succeeds.
- Added: `AutomationSummary.workspace_root`, `current_occurrence` (`CurrentOccurrence`: index, run id,
  attempt, `admitted` / `running` / `backoff`, or `null`) and `next_fire_at` also while a run is in
  progress. The panel shows "Run #N running" only from `current_occurrence` (Stop current / Run now
  follow it, never the last occurrence), the next run with "in …" only from `next_fire_at`
  (`nowMs` prop for the clock), and the workspace folder.
- Added: `AutomationPanel` renders user turns, answers, notify bodies, wait prompts, attention
  bodies and the definition's task through its `renderText` prop — pass the chat's renderer from
  panel-chat. Without it the panel shows escaped plain text and marks itself
  `data-text-rendering="unformatted"`.
- Added: typed wait answers in `AutomationPanel` — `ask_user` → `{response}` (choices or free
  text), `tool_approval` → the tool calls with their arguments and Approve / Deny
  (`{approved}`), `event` → a JSON payload (`{payload}`); other kinds point to the run.
- Added: `AfScheduleDialog` creates an automation: the task, a fixed UTC interval (presets from
  every 5 minutes to every 7 days) or one UTC date and time, independent or growing context, and
  tool approval — "Run without asking" by default, with the consent line "Tools run without
  asking (you approve them now by creating this automation)", or "Ask me before each tool call".
- Added: `createAutomationsClient()` — one method per `/api/gateway/automations` and
  `/api/gateway/trigger-sources` route, injected `fetch`, Gateway errors thrown as
  `AutomationApiError` (`code` = `reason_code`), unexpected answers as `invalid_response`.
- Added: retry-safe ids — the panel and the dialog mint one `command_id` / `request_id` per user
  action and reuse it when the same action is retried after a transport failure (`ActionIds`).
- Added: the pure presentation rules, wait helpers and contract types behind these components; the
  full list is in [docs/automations.md](docs/automations.md#exports).
- Added: canonical automation fixtures `ui-kit/scripts/fixtures/automations/*.json`, generated
  from real Gateway output and pinned by `CHECKSUMS.sha256`, with the
  `check_automation_fixtures`, `check_automation_client` and `check_automation_panel` checks in
  `npm test`. AbstractAssistant vendors byte-identical copies.

### panel-chat 0.1.18

- Changed: the `@abstractframework/ui-kit` peer range is now `^0.1.13` (the automation
  components below import `AutomationPanel`, which ships in ui-kit 0.1.13).
- Added: `ScheduleThisAction` ("Schedule this…" for a chat header slot; hands the host a
  `ScheduleSeed`) and `FromAutomationBadge` ("from automation <title> · #<n>"). Neither performs
  requests.
- Fixed: `Markdown` — a `## heading`, a code fence or a `>` quote on the line right after text
  (no blank line) now starts its own block, as in CommonMark, instead of staying literal text in
  the paragraph. Chat messages and automation trigger turns (`[Trigger …]` + the task) both
  benefit; lists and tables already interrupted a paragraph.
- Added: `AutomationPanelWithMarkdown`, `automationRenderers` and `renderAutomationText` — the
  ui-kit `AutomationPanel` wired to the chat's renderer (`ChatMessageContent`: Markdown tables and
  code, JSON, remote images as links), so automation runs read exactly like chats.

## 0.1.12 - 2026-09-26

| Package | Version | Change |
| --- | --- | --- |
| `@abstractframework/ui-kit` | 0.1.12 | updated |
| `@abstractframework/panel-chat` | 0.1.17 | updated (requires `ui-kit` `^0.1.10`) |
| `@abstractframework/app-server` | 0.1.10 | updated |
| `@abstractframework/monitor-memory` | 0.1.9 | unchanged |
| `@abstractframework/monitor-flow` | 0.1.9 | unchanged |
| `@abstractframework/monitor-gpu` | 0.1.9 | unchanged |
| `@abstractframework/monitor-active-memory` | 0.1.9 | unchanged |

### app-server 0.1.10

- Changed: every request the gateway session proxy sends to the Gateway on behalf of a browser
  (proxied `/api/*` calls, sign-in, sign-out and the status probe) carries
  `X-Forwarded-For: <socket address of the browser connection>`. A client-supplied
  `X-Forwarded-For` is replaced, never passed through or appended; client `Forwarded` and
  `X-Real-IP` headers are dropped. The Gateway trusts this header only from a loopback proxy and
  uses it to tell whether the browser runs on the Gateway's machine. A connection whose socket
  address is unknown is refused with 400.
- Added: every request the proxy sends to the Gateway carries
  `X-AbstractFramework-App-Proxy: <appId>`; a client-supplied value of that header is dropped.

### panel-chat 0.1.17

- Changed (affects every consumer): images in chat messages written by the model or a workflow
  (assistant and system messages, final and live) no longer load from other sites.
  `ChatMessageCard` renders their Markdown with the new `images="link"` mode: an image loads only
  when it is same-origin (a root-relative path such as a gateway workspace content route, or an
  absolute URL on the page's origin); every other image, including `//host/…`, shows as a link
  "image: <alt>". The user's own messages and `Markdown` used on its own keep inline images. Opt
  back in with `messageProps={{ images: "inline" }}` or a custom `inlineImage(src)`. New exports:
  `sameOriginImage()`, `MarkdownImages`, `MarkdownProps`.
- Added: live replies. When a run streams its model replies, `WorkflowSessionController` shows
  each model call as a growing assistant bubble (`live:<runId>:<callId>`) with a "streaming"
  indicator, the model's reasoning in a collapsed "Thinking" block and a "sub-agent · <node>"
  caption for sub-runs. The call's ledger record or the run's assistant message replaces the
  bubble (never two copies, never recreated); a failed or cancelled call leaves a short note; a
  call the runtime ran again (`reason: "cancelled"`, `detail: "reinvoked"`) leaves a neutral
  "Reply restarted" note and its new call streams in a new bubble; a
  call the gateway could not stream adds one note per run and cause. When the root run ends in any
  state every live bubble of the turn closes (sub-agents included), a sub-run's end closes its
  own, and a stream the controller stops following closes the bubbles it delivered. Each stream
  reconnect clears its live bubbles before the gateway's snapshots. Out-of-order and duplicate
  frames are dropped; malformed frames show an error; a `truncated` field is ignored. Live text is
  re-rendered at most every 60 ms (controller option `liveRenderIntervalMs`, also on
  `useWorkflowSession`; 0 renders every frame).
- Added: `WorkflowTransport.streamLedger` takes an optional sixth argument
  `onDelta(event: LlmDelta | LlmDeltaEnd)`. Host SSE readers pass the `llm.delta` and
  `llm.delta_end` frames to it, never to `onStep`, and never move the ledger cursor with them.
  Existing transports keep working (replies then appear when complete).
- Added: `llmDeltaFromSse()`, `validateLlmDeltaEvent()`, `isLlmDeltaEnd()`,
  `describeStreamUnavailable()`, `streamRepliesRuntime()` and the `LlmDelta`, `LlmDeltaEnd`,
  `LlmDeltaEvent`, `LlmDeltaChannel`, `LlmDeltaEndReason`, `LlmStreamUnavailableDetail`,
  `StreamRepliesMode`, `ChatLiveReply` and `WorkflowSessionControllerOptions` types.
- Added: `WorkflowChat` `streamReplies?: "gateway_default" | "on" | "off"`; hosts map it to the
  run input with `streamRepliesRuntime()` (`_runtime.stream: true` / `false` / unset).

### ui-kit 0.1.12

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
- Changed: the architecture page adds diagrams for live replies and the About/identity flow; the
  `app-server` README documents the proxy options and environment switches; the API reference,
  FAQ, troubleshooting and adoption guide cover live replies, same-origin images in chat, the
  About dialog and the forwarded client address.

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
