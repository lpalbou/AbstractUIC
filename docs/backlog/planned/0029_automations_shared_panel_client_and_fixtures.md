# Planned: Automations — shared client module, `AutomationPanel`, canonical fixtures

## Metadata
- Created: 2026-09-26
- Status: Planned
- Completed: N/A
- Area: ui-kit (client module, `AutomationPanel`, fixtures) + panel-chat (header-slot action, badge)
- Design: untracked/design/automations-PLAN.md (2026-09-26)
- Mission: U (abstractuic) of the Automations v1 wave; owns contract G

## ADR status
- Governing ADRs: None (AbstractUIC has no ADR system; see `recurrent/backlog-and-adr-hygiene.md`)
- ADR impact: None

## Summary
Ship the presentation half of Automations v1: a non-visual client module that
wraps the gateway's `/automations` and `/trigger-sources` routes, a controlled
`AutomationPanel` that renders one automation (definition, status, occurrences
as a chat, commands, waits, discuss), two small panel-chat pieces (a
"Schedule this…" action for a chat header and a "from automation" badge), and
the canonical JSON fixtures every v1 client (Observer web, Assistant Qt) tests
against. The kit renders server truth and forwards intent through callbacks;
it holds no execution authority.

## Why
Operator constraints (verbatim, `untracked/design/astra/DIALOGUE.md`):
- "who say schedule, trigger etc say we need to have clear visual and
  management of those."
- "we need also to be able to alter the automation (eg change intervals,
  pause it, resume it, change the conditions, etc), as well as to dialogue
  with the context created by that automation"
- "we also need to see the steps, what is done at each step - that's why a
  chat representation of an automated task is not a bad thing either, where
  you see the automated task triggered at some point, and the answer that
  comes with it."
- "when dialoguing with it however, it's more like a fork on that context at
  that time and it should not affect the normal process of the automated task."

PLAN §1: "**Visible and manageable.** Users can inspect results and steps,
edit definitions, pause/resume, run manually, stop current work and archive."
and "**Conversation representation.** Each occurrence contributes a
trigger/task turn and answer."

Operator rulings (2026-09-26) that amend the PLAN for this item:
- Ruling 6: "App breadth for v1: **Observer and Assistant only.** Code WUI/TUI
  and the console inventory move to the phase after v1."
- Ruling 4: "**Discuss is NOT read-only and NOT tool-restricted.** A discussion
  is a new durable runtime session, forked/seeded from the automation's
  conversation through the chosen occurrence, replayable like any session,
  with the target's normal tools. Isolation means only that it never writes
  back into the automation's session/context (a fork)." The panel therefore
  presents Discuss as "start a forked session", never as a read-only or
  reader-tools mode.

Two v1 clients render the same automation. One presentation contract plus
one fixture set keeps the Observer panel and the Assistant's Qt view from
drifting — the same reason `AfAboutDialog` and `gateway_version_rows.json`
exist.

## Current code reality (verified in source 2026-09-26, HEAD f1b3e00)
- panel-chat already has host slots: `panel-chat/src/workflow_chat.tsx:37-41`
  (`blockedNotice`, `emptyState`, `header`, `footer`, `composerExtras`, all
  `React.ReactNode`). A "Schedule this…" action fits `header` with no
  `WorkflowChat` API change.
- `WorkflowChat` has ONE consumer today: `abstractcode/web/src/workspace/app.tsx`
  (Code WUI, out of v1 by ruling 6). The Observer imports panel-chat for
  `Markdown`, `JsonViewer`, `AssistantPanel`, `tryParseJson`, `copyText` —
  not `WorkflowChat`. So the header action and badge must be standalone
  exported components; wiring them into `WorkflowChat` hosts is Code WUI work
  after v1.
- ui-kit has no session-list, schedule, trigger or automation component
  (grep of `ui-kit/src` and `panel-chat/src` for
  `sessionlist|session_list|schedul|automation|trigger.?source|occurrence`:
  only unrelated hits — a render-scheduling comment in
  `use_gateway_voice.ts:241` and the tool-approval "occurrence" key in
  `panel-chat/src/workflow_runtime.ts:268-533`).
- ui-kit already performs gateway fetches in a non-React helper
  (`fetchGatewayConnection` in `gateway_connect_modal.tsx`, used by
  `use_gateway_connection.ts:31`), so a fetch-based client module in ui-kit
  has precedent.
- ui-kit tests are node scripts over the compiled `dist`
  (`ui-kit/package.json` `test`: `check_*.mjs`, `renderToStaticMarkup`, no
  jsdom); there is no `ui-kit/tests/` directory and no `.tsx` test runner.
  Contract fixtures live in `ui-kit/scripts/fixtures/` (today:
  `gateway_version_rows.json`).
- How the v1 apps consume the kit today:
  - Observer (`abstractobserver/package.json`): the only `@abstractframework/*`
    dependency is `@abstractframework/app-server ^0.1.10`. It still uses
    ui-kit and panel-chat (9 and 8 source files import them) through SOURCE
    ALIASES to the sibling checkout: `vite.config.ts:70-74`,
    `tsconfig.json:19-27`, `vitest.config.cjs:25-35` all resolve
    `@abstractframework/ui-kit` to `../abstractuic/ui-kit/src`.
    `abstractobserver/src/ui/about.ts:3` imports `appIdentity` /
    `gatewayVersionRows` from ui-kit this way.
  - Assistant (Python/Qt): does not consume ui-kit. It renders About from
    `abstractcore.utils.identity` (`abstractassistant/ui/settings/pages.py:1473-1485`).
- Precedent for shared component + vendored fixtures: `AfAboutDialog`
  (`ui-kit/src/about.tsx:92`) + `appIdentity` (`ui-kit/src/identity.ts:62`),
  checked by `ui-kit/scripts/check_about.mjs`; the descriptor is vendored
  byte-identical and the root `scripts/check_identity_sync.py` fails on drift,
  including the ui-kit-canonical fixture `ui-kit/scripts/fixtures/gateway_version_rows.json`
  and its copies in abstractcore and the gateway console-tui.

## Scope — In
1. **Client module** `ui-kit/src/automations_client.ts` — framework-free (no
   React, no CSS), injected `fetch` and base path, one method per PLAN
   contract F route: `listAutomations`, `getAutomation`, `createAutomation`,
   `reviseAutomation` (PATCH), `sendCommand`, `listOccurrences`, `discuss`,
   `markSeen`, `listTriggerSources`. Types `AutomationSummary`,
   `AutomationDefinition`, `OccurrenceRow`, `TriggerSource`, `TriggerBinding`,
   `CommandReceipt`, `Page<T>`, `ApiError` transcribed from contract F.
   Errors parse `{error:{code,message,field?,command_id?}}` into one typed
   `ApiError`; unknown shapes throw (no silent success). `command_id` /
   `request_id` are generated by the client and returned to the caller so a
   retry reuses them. Kept dependency-free so it can move into the proposed
   gateway-client package (0025) without API change.
2. **`AutomationPanel`** `ui-kit/src/automation_panel.tsx` (+ pure
   `automation_panel_core.ts`, the kit's `*_core.ts` pattern), controlled,
   props verbatim from contract G:

   ```typescript
   AutomationPanelProps = {
    summary: AutomationSummary; definition?: AutomationDefinition;
    occurrences: OccurrenceRow[]; triggerSources: TriggerSource[];
    busy:boolean; error?:ApiError;
    onRevise(changes,expectedRevision):Promise<CommandReceipt>;
    onCommand(type,payload?):Promise<CommandReceipt>;
    onDiscuss(index,prompt):Promise<{session_id:string;run_id:string}>;
    onSeen(attentionCursor):Promise<void>;
    onLoadMore():void; onOpenRun(runId):void;
    onAnswerWait(runId,waitKey,payload):Promise<void>;
   }
   ```

   Renders: header (title, status, trigger summary, context mode, next fire,
   occurrence count, legacy marker); command bar (Pause / Resume / Run now /
   Stop current / Archive) enabled from `summary.capabilities` and status —
   the server decides, the panel never invents availability; revise form
   (title, trigger config from the selected `TriggerSource.config_schema`,
   context mode) sending `expected_revision`; occurrence transcript — one
   trigger/task turn (`user_turn`, trigger summary, `fired_at`) and one answer
   turn per `OccurrenceRow`, with status, artifacts, pending waits (answerable
   via `onAnswerWait`), "Open run" (`onOpenRun`, ledger) and "Discuss from
   here" (`onDiscuss`, labelled as a forked session per ruling 4); quiet
   (`notify:false`) occurrences stay visible but carry no attention styling;
   failures and waits always carry it. `onSeen` fires with
   `summary.attention.cursor` once the newest row is shown. Every `ApiError`
   code from contract F maps to a visible message (409 `revision_conflict`
   offers reload; `automation_busy` / `invalid_state` name the state).
   Accessible: real buttons, `aria-busy`, labelled regions, keyboard reachable,
   token-driven across all kit themes (contrast audit stays `--strict` green).
3. **panel-chat pieces** (standalone exports; fit the `header` slot at
   `workflow_chat.tsx:39`): `ScheduleThisAction` — a button that hands the
   host the current chat's workflow/target and prompt (`onSchedule(seed)`);
   the host opens its create flow. `FromAutomationBadge` — a turn/session
   badge "from automation <title> · #<index>" with an optional `onOpen`.
   Neither performs requests.
4. **Fixtures** (canonical in this repo):
   `ui-kit/scripts/fixtures/automations/{list,occurrences,trigger-sources,commands,errors}.json`
   — the PLAN's `fixtures/automations/` placed in the existing contract-fixture
   directory that the root sync check already reads. `list` = a
   `Page<AutomationSummary>` covering active / paused / archived / failed /
   legacy; `occurrences` = a `Page<OccurrenceRow>` with quiet success, failure,
   pending wait, artifacts and a manual run; `trigger-sources` = schedule@1 +
   manual@1 (+ one `available:false`); `commands` = accepted, duplicate and
   rejected receipts per command type; `errors` = one body per contract F
   error code with its HTTP status. Checksum-shared with the Qt Assistant: the
   copy under `abstractassistant/tests/fixtures/automations/` is added to the
   root `scripts/check_identity_sync.py` fixture groups (root/framework seat
   and Assistant seat own those edits; U raises the ask).

## Scope — Out (v1)
- Code WUI wiring (`WorkflowChat` host in `abstractcode/web`) and Code TUI
  (ruling 6); console inventory (ruling 6).
- Any execution, scheduling or polling logic in the kit (hosts poll via the
  client; the panel is controlled).
- A session-list/switcher component (apps own navigation; revisit when a
  second web client needs it).
- Discuss tool/workspace settings (runtime/gateway; workspace question is open
  with the operator).
- Rich calendar/cron editing, event triggers, automatic summaries (v2/v3).

## Observer adoption (decision)
The Observer ADOPTS the kit `AutomationPanel` and client module; it does not
mirror the fixtures into its own component. It takes them the way it already
takes `appIdentity` / `AfAboutDialog`: through the sibling-source aliases
(`vite.config.ts:73`, `tsconfig.json:25`, `vitest.config.cjs:28`). Its
`src/ui/automations.test.tsx` (mission O) loads the canonical fixtures from
`../abstractuic/ui-kit/scripts/fixtures/automations/` via the same alias
root. Whether the Observer also declares `@abstractframework/ui-kit` in
`package.json` is the Observer/V seats' call; it is not required for the build
as configured today. The Assistant (Qt) mirrors the presentation contract in
Qt and pins itself to the fixtures through the checksum copy.

## Seams
- U reads G's route/response schemas and error codes. Until the gateway ships
  them, the source is PLAN contract F; once `abstractgateway` lands the routes,
  U re-reads the live schemas and real response examples and regenerates the
  fixtures from them (fixture = observed gateway output, not hand-written
  hope). A mismatch is raised to the gateway seat, not papered over with an
  optional field.
- U owns the presentation contract (contract G props + fixtures) that O
  (Observer) and A (Assistant) consume. Prop or fixture changes are
  semver-meaningful for ui-kit and are announced to both seats.
- Discuss semantics come from ruling 4 (forked session, normal tools); the
  panel labels, never enforces.

## Tests
- PLAN names `ui-kit/tests/automation_panel.test.tsx`. ui-kit has no
  `tests/` directory or `.tsx` runner (tests are `scripts/check_*.mjs` over
  `dist`), so the deliverable follows the repo convention:
  - `ui-kit/scripts/check_automation_panel.mjs`: `automation_panel_core`
    (command availability from capabilities/status, turn derivation per
    occurrence, attention rules for quiet/failed/waiting rows, error-code →
    message for every code in `errors.json`) plus `renderToStaticMarkup` of
    `AutomationPanel` over every fixture (roles, labels, disabled states,
    Discuss labelled as a fork, legacy marker).
  - `ui-kit/scripts/check_automation_fixtures.mjs`: every fixture parses,
    matches the transcribed contract F shapes, rejects unknown fields, and
    covers every status, command type and error code; the client module's
    parsers accept each fixture and turn each `errors.json` body into the
    expected `ApiError` (injected fetch stub).
  - panel-chat: `scripts/check_automation_badges.mjs` for `ScheduleThisAction`
    and `FromAutomationBadge`.
  - All three wired into the workspace `npm test` chain. Each check is proven
    by deleting what it checks once and watching it fail.
  If an interactive (click/keyboard) rig is required instead, that is a
  dev-dependency decision (vitest + jsdom) recorded before building.

## Definition of Done
- Client module, `AutomationPanel`, panel-chat action/badge exported and
  typed in `dist`; contract G props match this item verbatim.
- Fixtures regenerated from real gateway responses once G ships; checksum copy
  in the Assistant registered in the root sync check and green.
- `npm test` green at the workspace root, strict contrast audit included.
- Observer renders the panel from the kit against the fixtures (mission O
  test), the Assistant's test consumes the same fixture bytes.
- Docs: `docs/api.md` and the ui-kit README describe the client module, the
  panel and the fixtures (coredoc pass); CHANGELOG entry; ui-kit and
  panel-chat minor bumps staged, not published (release needs the operator's
  explicit go).

## Dependencies
- G (gateway routes) for real data and final fixtures; U can start now from
  PLAN contract F fixtures and must re-verify against the shipped gateway.
- Root/framework seat for adding the fixture group to
  `scripts/check_identity_sync.py`; Assistant seat for the vendored copy.

## Related
- abstractframework backlog 0928 (Automations v1 root item)
- 0025 (proposed non-visual gateway-client package; the client module stays
  liftable into it)
- 0027 / `AfAboutDialog` (server-truth-renders and vendored-fixture precedent)

## Progress checklist
- [x] Contract F types + client module + fixture validation check
- [x] `automation_panel_core.ts` + `AutomationPanel` + check script (as `src/automations/panel_core.ts`)
- [x] panel-chat `ScheduleThisAction` / `FromAutomationBadge` + check
- [ ] Fixtures regenerated from the shipped gateway; Assistant copy registered
- [ ] Observer consumption confirmed by mission O
- [ ] Docs + CHANGELOG; version bumps staged (docs/automations.md + CHANGELOG Unreleased done 2026-09-27; bumps await the operator)

## Contracts pass (2026-09-27)

Final contracts: untracked/design/automations-CONTRACTS.md (root repo; rev 2 with Astra turn-6 amendments 1–11). They supersede the contract text copied above; earlier text is kept as history. Concrete changes for this item:

- `ApiError.code` comes from `detail.reason_code`; `errors.json` adds 401 `unauthorized`, 403 `forbidden`, 422 `invalid_request`; `cursor_expired` removed.
- New canonical fixture `attention.json` (a `Page<AttentionItem>`, oldest unseen first); summaries carry `attention.unseen_count/items/waits`, `attempts`, `notify:null|{title,body}`. The five+1 fixtures are byte-shared with the Assistant; the root seat adds one sync group per file.
- `onSeen` receives the cursor of the last DISPLAYED attention item, never the summary's latest.
- Client drops `changed_since`; `listAttention` added; base path `/api/gateway`.
- Cadence text is fixed-interval ("every 24 hours"), never "daily at HH:MM local"; Discuss labelled "forked session, read-only workspace".

## Progress (2026-09-27, mission U)

Implemented from contract F/G (rev 2), local commits, no version bump. Files: `ui-kit/src/automations/`
(`types.ts`, `client.ts`, `panel_core.ts`, `AutomationPanel.tsx`, `AfScheduleDialog.tsx`), fixtures
`ui-kit/scripts/fixtures/automations/` (+ `CHECKSUMS.sha256`, `README.md`), checks
`check_automation_{fixtures,client,panel}.mjs` and panel-chat `check_automation_badges.mjs` in `npm test`,
`docs/automations.md`. Path note: the orchestrator's mission brief placed the client at
`src/automations/client.ts` (contract G text: `src/automations_client.ts`); consumers import from the kit index,
so the export names are the seam. Remaining: regenerate fixtures from the shipped gateway (G), the Assistant's
vendored copy + root sync groups (A, root), Observer adoption (O).
