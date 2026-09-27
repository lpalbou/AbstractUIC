# Automations

An **automation** runs a workflow on a trigger — "every 8 hours", "every 30 minutes", "once at
2026-09-28 08:00 UTC", or by hand — and keeps every run readable as a chat. AbstractGateway owns
the execution (its `/api/gateway/automations` routes, backed by AbstractRuntime). AbstractUIC
ships the shared presentation and the typed client that every app uses to show and manage
automations:

| Piece | Package | What it does |
| --- | --- | --- |
| `AutomationPanel` | `ui-kit` | One automation: its definition, its controls, its runs as chat pairs, and the answers to runs that wait for you |
| `AfScheduleDialog` | `ui-kit` | Creates an automation; builds the `POST /api/gateway/automations` body |
| `createAutomationsClient()` | `ui-kit` | One method per Gateway automation route; injected `fetch`; typed errors |
| `ScheduleThisAction` | `panel-chat` | A "Schedule this…" button for a chat header slot |
| `FromAutomationBadge` | `panel-chat` | A "from automation <title> · #<n>" marker for a message or session |
| Canonical fixtures | `ui-kit/scripts/fixtures/automations/` | The Gateway's wire shapes that every client tests against |

The components never schedule, poll or execute anything. Your host fetches with the client,
passes server truth to the components, and forwards the intent they report through callbacks.
For how the pieces connect to the Gateway, see the [Automations flow](./architecture.md#automations-ui-kit--panel-chat)
in the architecture page; for the export list in context, see the [API reference](./api.md).

## Concepts

- **Occurrence** — one run of the automation (a child run). It reads as two chat turns: the
  **trigger turn** (the trigger line, such as `schedule: every 8 hours (UTC), tick 12`, followed
  by the task) and the **answer turn**.
- **Quiet and notable runs** — runs are quiet by default. A run is notable when its output
  carries `notify`, when it failed after its last retry, or when it waits for a person. Quiet
  runs stay visible, subdued and unbadged.
- **Context** — *independent*: each run starts fresh. *growing*: each run sees the previous
  runs, like turns of one conversation.
- **Fixed UTC intervals** — `schedule@1` knows `start_at`, `every` (`^[1-9][0-9]*[smhd]$`),
  `until` and `count`. Every label reads "every 24 hours (UTC)", never "daily at 08:00 local":
  schedules carry no time zone. Without `every`, the automation runs once at `start_at`.
- **Tool approval** — `policy.tool_approval` is `"auto"` by default: an unattended run cannot
  ask a person at every tick, so its tools run without asking, and creating the automation is the
  consent. `"ask"` makes every tool call wait for approval in the automation's timeline.
  Questions a flow asks with `ask_user` wait for a person in both modes.
- **Typed waits** — every wait carries a `kind`, and the answer follows the kind, never the
  prompt text (see [Answering a wait](#answering-a-wait)).
- **Discuss** — forks the automation at one occurrence: a new session carrying the automation's
  whole timeline (runs 1..N). It works in its own writable workspace; the automation's folder is
  mounted read-only **for the file tools only** — shell commands (`execute_command`, …) are not
  sandboxed by the mount and could change the automation's folder. Nothing is written back into
  the automation's session. The response names both folders (`workspace_root`,
  `mounted_workspace`). The panel's help text says the same: "Starts a new session that forks
  this automation at #N with its full history (runs 1–N). It works in its own writable workspace;
  the automation's files are mounted read-only for the file tools (shell commands are not
  sandboxed), and nothing is written back into the automation's session."
- **Trigger envelope** — a `schedule@1` run's envelope payload is `{tick, scheduled_at,
  coalesced?: {first_tick, last_tick, missed_count}}` (`ScheduleEventPayload`; `coalesced`
  appears when missed ticks were folded into one run); `fired_at` is on the envelope itself.
  A `manual@1` run carries `{command_id}` (`ManualEventPayload`).

## AutomationPanel

Occurrence text is rendered with the **same renderer as the chat** (Markdown with tables and
code, JSON autodetect, remote images as links): the user turn, the answer, notify bodies, wait
prompts, attention bodies and the definition's task. ui-kit cannot import panel-chat
(panel-chat depends on ui-kit), so the panel takes a `renderText(text)` prop and panel-chat
ships the pairing. Use one of:

```tsx
import { AutomationPanelWithMarkdown, automationRenderers } from "@abstractframework/panel-chat";

<AutomationPanelWithMarkdown {...props} />              // the panel with the chat renderer wired
<AutomationPanel {...automationRenderers} {...props} />  // same thing, spread onto the kit panel
```

Without `renderText` the panel falls back to escaped plain text and marks itself
`data-text-rendering="unformatted"` (each block `data-unformatted="true"`), so a host that
forgot the renderer is visible in the DOM.

```tsx
import { AutomationPanel } from "@abstractframework/ui-kit";
import "@abstractframework/ui-kit/theme.css";

<AutomationPanel
  summary={summary}                 // AutomationSummary (a row of the list page)
  occurrences={rows}                // OccurrenceRow[] (any page order; rendered oldest first)
  triggerSources={sources}          // items of GET /api/gateway/trigger-sources
  busy={pending}
  error={lastError}                 // ApiError | undefined
  onCommand={(type, payload, meta) =>
    automations.sendAutomationCommand(id, { type: type as AutomationCommandType, payload, command_id: meta?.command_id })}
  onRevise={(changes, rev, meta) =>
    automations.reviseAutomation(id, { changes, expected_revision: rev ?? undefined, command_id: meta?.command_id })}
  onDiscuss={(index, prompt, meta) =>
    automations.discuss(id, { occurrence_index: index, prompt, request_id: meta?.request_id })}
  onSeen={(cursor) => automations.markSeen(id, cursor).then(() => undefined)}
  onLoadMore={loadOlderPage}
  onOpenRun={(runId) => openLedger(runId)}
  onAnswerWait={(runId, waitKey, payload) => resumeWait(runId, waitKey, payload)}
  {...automationRenderers}          // from @abstractframework/panel-chat: the chat's renderer
/>
```

The panel is controlled: it holds only view state (which form is open, the last notice) and
renders what you pass. Optional props: `definition` (the `definition` of `GET /automations/{id}`;
when given, the panel adds a collapsed "Definition" block), `renderText` (required in practice;
see above), `newId` (the id source for retry-safe ids, default
`crypto.randomUUID`) and `className`.

### What it shows

- **Header** — title, status, trigger ("every 8 hours (UTC)", "once at 2026-09-28 08:00 UTC",
  "manual runs only"), context, next run ("none while paused" when paused), run count, attention
  ("2 unseen · 1 waiting for you"), revision, and a "Legacy schedule" marker for rows the Gateway
  projects from older `scheduled:*` roots. When the Gateway does not list the automation's trigger
  source, or lists it with `available: false`, the header says so.
- **Definition** (only with the `definition` prop) — a collapsed "Definition (revision N)"
  block: target workflow, trigger source and config, context, tools (`tool_approval` auto / ask),
  retry policy and revision.
- **Needs attention** — the unseen notify and failure items, then the pending waits, labelled by
  kind ("Question for you", "Approval needed", "Waiting for an event").
- **Occurrences** — one chat pair per run, oldest first. Quiet runs are subdued; notified, failed,
  waiting and running runs carry a badge ("Notified", "Failed after 3 attempts", "Waiting for you",
  "Running"). A run that succeeded after retries reads "completed after 2 attempts". A failed run
  shows its `failure` (`reason_code`, message, "after N attempts"). The answer turn lists the
  run's artifacts. Each pair has **Run details** (run id, attempts, "Open run ledger" through
  `onOpenRun`, the ledger JSON link, the workspace link when the Gateway sends one).
- **Paused** — a hint reads "Paused: scheduled runs are skipped. Run now works and keeps it
  paused."
- **Load earlier occurrences** appears while fewer rows than `summary.occurrence_count` are
  loaded; it calls `onLoadMore`.

### Controls

Pause / Resume, Run now, Stop current, Revise… and Archive…. `summary.capabilities` says what
you may do; the status says what applies at this moment:

| Control | Enabled when | Sends |
| --- | --- | --- |
| Pause | status `active` | `automation.pause` |
| Resume | status `paused` | `automation.resume` |
| Run now | status `active` or `paused`, and no run in progress | `automation.run_now` (while paused it runs once; the automation stays paused) |
| Stop current | a run is running, waiting or backing off | `automation.stop_current` |
| Revise… | always (subject to capability and status below) | `onRevise(changes, revision)` |
| Archive… | always (subject to capability and status below) | `automation.archive`, after an in-panel confirmation |

Every control is disabled while `busy`, on a legacy row, without the matching capability, or on
an archived automation. Each disabled control shows its reason next to the controls ("Run now:
An occurrence is in progress."), linked to the button with `aria-describedby`.

- **Revise** edits the title, the interval and the context. Only changed fields are sent, with
  `expected_revision`; a new interval keeps the rest of the schedule. The change applies from the
  next run.
- **Discuss — fork at this occurrence (own workspace, automation files read-only)** needs the
  `discuss` capability, is off for
  legacy rows, and is available once the run has finished (also on an archived automation).
- When the archive confirmation, the revise form or a discuss form closes, focus returns to the
  control that opened it (else to the notice, else to the title).

### Attention and `/seen`

After showing the attention items, the panel calls `onSeen(cursor)` with the cursor of the **last
displayed** item, never `summary.attention.cursor`, so items it did not show stay unseen. A
cursor counts as acknowledged only after `onSeen` resolves. A failed call is retried on the next
render that brings a new `summary` object (your next poll), never in a loop.

### Answering a wait

The panel renders each wait by its `kind` and calls `onAnswerWait(runId, waitKey, payload)` with
the payload that kind expects:

| `kind` | What the panel shows | `payload` |
| --- | --- | --- |
| `ask_user` | The question, one button per choice, and a free-text answer | `{response: "<choice or text>"}` |
| `tool_approval` | The tool calls with their arguments (`details`: `[{name, arguments, call_id?}]`), **Approve** and **Deny** | `{approved: true}` or `{approved: false}` |
| `event` | A JSON payload field; invalid JSON is refused with a message | `{payload: <JSON>}` |
| any other | The wait, with "open the run"; it is not answered here | — |

The Gateway resumes a wait through `POST /api/gateway/commands` with `type: "resume"` and
`payload: {wait_key, payload}` on the waiting run; `commands.json` in the fixtures holds the
exact request for each kind. After the host's promise resolves the panel shows "Answer sent.";
a rejection is shown as an error.

### Retry-safe ids

The panel mints **one id per user action** and passes it as the last callback argument:
`{command_id}` for `onCommand` and `onRevise`, `{request_id}` for `onDiscuss`. Forward it to
the client. When a request fails in transport (no Gateway answer, or an answer that is not the
error envelope), the same action again reuses the same id, so the Gateway answers idempotently
(a repeat returns `accepted: false, duplicate: true`). After a success or a Gateway error the
next click is a new action with a new id. The same rule is exported as `ActionIds` (with
`isDefinitiveError`) for hosts that build their own controls.

### Errors

Every error code maps to one sentence (`apiErrorText()` / `API_ERROR_TEXT`), shown with the
Gateway's own message, for example `revision_conflict` → "The automation changed since this view
loaded. Reload it, then try again."

## AfScheduleDialog

```tsx
import { AfScheduleDialog } from "@abstractframework/ui-kit";

<AfScheduleDialog
  open={open}
  onClose={() => setOpen(false)}
  workflowPicker={<MyWorkflowPicker onChange={setTarget} />}
  target={target}                     // {bundle_ref, flow_id} | {flow_id: "@default", interface}
  targetTools={toolNames}             // optional: listed under the consent line
  initialPrompt={chatPrompt}
  onSubmit={(body) => automations.createAutomation(body)}
  busy={creating}
  error={createError}
/>
```

The dialog is modal (focus trapped, Escape closes, focus returns to the opener) and holds these
sections:

- **What** — your workflow picker (a slot; it sets `target`) and the task, sent as
  `target.input_data.prompt`.
- **When (UTC)** — **Repeat** every N minutes, hours or days, with presets from "every 5
  minutes" to "every 7 days", or **Once at…** a UTC date and time. A preview line reads, for
  example, "Runs every 24 hours (UTC), first run now."
- **Context** — Independent or Growing.
- **Tools** — "Run without asking" (the default, `policy.tool_approval: "auto"`) shows the
  consent line **"Tools run without asking (you approve them now by creating this automation)"**,
  followed by the `targetTools` names when you pass them. "Ask me before each tool call"
  (`"ask"`) makes every tool call wait for approval in the automation's timeline.
- **Advanced** — title (default: the task's first line, at most 120 characters), first run at,
  stop after N runs, stop at. Date fields are read as UTC.

Submitting calls `onSubmit(body)` with a complete `CreateAutomationRequest`. The dialog mints one
`request_id` per distinct request body: retrying the same request after a transport failure
reuses it; an edited request, or a request after a definitive answer, gets a new id (reusing an
id with a different body would be an `identity_conflict`). Return the client's promise from
`onSubmit` so the dialog can tell a transport failure from an answer. The same builder is
exported as `buildCreateRequest(form, {target, requestId})`, which returns `{ok: true, body}` or
`{ok: false, errors}`; `TOOL_APPROVAL_CONSENT` holds the consent line for hosts with their own
create UI.

## The client

```ts
import { createAutomationsClient, AutomationApiError } from "@abstractframework/ui-kit";

const automations = createAutomationsClient({
  fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
  baseUrl: "",                        // same origin; or "http://127.0.0.1:8080"
  headers: () => ({ "x-abstract-csrf": csrfToken }),
});

const page = await automations.listAutomations({ limit: 50 });
const occ = await automations.listOccurrences(page.items[0].automation_id, { limit: 20 });
await automations.sendAutomationCommand(id, { type: "automation.run_now" });
```

Options: `fetch` (required; `window.fetch`, a proxy-aware wrapper or a test stub), `baseUrl`
(default `""`, same origin), `headers()` (auth or CSRF headers per request) and `newId()` (the
id source; default `crypto.randomUUID`).

| Method | Route |
| --- | --- |
| `listAutomations({status?, cursor?, limit?})` | `GET /api/gateway/automations` |
| `getAutomation(id)` | `GET /api/gateway/automations/{id}` |
| `createAutomation(body)` | `POST /api/gateway/automations` |
| `reviseAutomation(id, {changes, expected_revision?, command_id?})` | `PATCH /api/gateway/automations/{id}` |
| `sendAutomationCommand(id, {type, payload?, command_id?})` | `POST /api/gateway/automations/{id}/commands` |
| `listOccurrences(id, {cursor?, limit?})` | `GET /api/gateway/automations/{id}/occurrences` |
| `listAttention(id, {cursor?, limit?})` | `GET /api/gateway/automations/{id}/attention` |
| `discuss(id, {occurrence_index, prompt, request_id?})` | `POST /api/gateway/automations/{id}/discuss` → `{session_id, run_id, session_kind: "discussion", workspace_root, mounted_workspace}` |
| `markSeen(id, attentionCursor)` | `POST /api/gateway/automations/{id}/seen` |
| `listTriggerSources()` | `GET /api/gateway/trigger-sources` |

- **Ids**: `command_id` and `request_id` are minted only when you do not pass one. Pass the same
  id to retry a request safely.
- **Command types**: `automation.pause`, `automation.resume`, `automation.run_now`,
  `automation.stop_current`, `automation.archive`. Revisions go through `reviseAutomation`.
- **Polling**: the Automations API has no change cursor. Poll complete pages; the client never
  sends `changed_since`.
- **Wait answers** are not part of this client: send them through your existing Gateway command
  path (see [Answering a wait](#answering-a-wait)).

### Error handling

Every non-2xx answer from the Gateway carries `{"detail": {"reason_code", "message", "field"?,
"command_id"?}}`. The client throws it as an `AutomationApiError` with `status`, `code` (the
`reason_code`), `message`, and `field` / `command_id` when present:

```ts
try {
  await automations.reviseAutomation(id, { changes, expected_revision: summary.revision ?? undefined });
} catch (e) {
  if (e instanceof AutomationApiError && e.code === "revision_conflict") reload();
  else throw e;
}
```

- A non-2xx answer without that envelope, or a 2xx answer that is not a JSON object, throws an
  `AutomationApiError` with `code: "invalid_response"` — never a silent success.
- Transport failures (the `fetch` promise rejects) propagate unchanged.
- `parseApiError(status, body)` is exported for hosts with their own transport.

| HTTP | `reason_code` |
| --- | --- |
| 401 / 403 | `unauthorized`, `forbidden` |
| 404 | `automation_not_found` (also for another principal's automation), `occurrence_not_found` |
| 409 | `revision_conflict`, `automation_busy`, `invalid_state`, `identity_conflict` |
| 422 | `invalid_request` (including malformed JSON), `invalid_definition`, `unsupported_feature`, `unknown_trigger_source` |

## panel-chat pieces

```tsx
import { ScheduleThisAction, FromAutomationBadge } from "@abstractframework/panel-chat";

<WorkflowChat header={<ScheduleThisAction seed={{ prompt, target }} onSchedule={openScheduleDialog} />} … />
<FromAutomationBadge title="Inbox triage" index={7} onOpen={() => openAutomation(id)} />
```

- `ScheduleThisAction` hands `onSchedule(seed)` the `ScheduleSeed` you gave it (`prompt`,
  `title`, `target`, all optional); open `AfScheduleDialog` with it. Props: `disabled`, `label`
  (default "Schedule this…"), `className`.
- `FromAutomationBadge` reads "from automation <title> · #<index>" (`fromAutomationText()`
  builds the same string); with `onOpen` it renders as a button.

Neither piece performs requests or holds state.

- `AutomationPanelWithMarkdown` (`AutomationPanelWithMarkdownProps` = `AutomationPanelProps`
  without `renderText`), `automationRenderers` (`{renderText}`) and `renderAutomationText(text)`
  wire the kit's `AutomationPanel` to the chat renderer (`ChatMessageContent`, images as links).

## Fixtures contract

`ui-kit/scripts/fixtures/automations/` holds the Gateway's wire shapes that every automations
client tests against:

| File | Route | Content |
| --- | --- | --- |
| `list.json` | `GET /api/gateway/automations` | Three automations (active growing, active independent, paused) and a legacy row |
| `occurrences.json` | `GET …/{id}/occurrences` | Quiet runs, a notify with an artifact, a success after a retry, a manual run, a failure after 3 attempts, and a run waiting on an `ask_user` and a `tool_approval` wait |
| `attention.json` | `GET …/{id}/attention` | Unseen items, oldest first |
| `trigger-sources.json` | `GET /api/gateway/trigger-sources` | `schedule@1` and `manual@1` |
| `commands.json` | revise, `…/commands`, `…/seen`, `…/discuss`, `POST /api/gateway/commands` | Exact request and response per route, including a duplicate command and the wait answers by kind |
| `errors.json` | every automation route | The error bodies with their HTTP status, covering every contract error code |

The files are generated from real Gateway output and curated: ids, texts and times form one
readable scenario, while every field, key order and value format (timestamps such as
`2026-09-27T04:00:00.412307+00:00`, wait keys, receipts) is the Gateway's. `formatUtc()` shows
such a timestamp as `2026-09-27 04:00 UTC` and accepts the `Z` form too. The folder's
`README.md` details each file.

**Who reads them.** The kit's checks run against these bytes. AbstractObserver reads them from
its sibling checkout (its checks and its development stub server). AbstractAssistant vendors
byte-identical copies in `tests/basic/fixtures/automations/`, and the AbstractFramework
repository's `scripts/check_identity_sync.py` fails when a copy drifts. `CHECKSUMS.sha256` pins
the bytes of the six JSON files.

**Regenerating them.** A fixture change is a contract change for every client:

1. Capture the routes' answers from a running AbstractGateway (every route above, including the
   error answers), and curate the scenario without changing any field, key order or value format.
2. Run `node ui-kit/scripts/check_automation_fixtures.mjs --write` to rewrite
   `CHECKSUMS.sha256`, then `npm --workspace ui-kit test`. The check rejects unknown keys,
   requires every error code, command type and trigger source as well as quiet, notified,
   failed, waiting, manual and retried runs, and verifies cross-file consistency.
3. Copy the six JSON files and `CHECKSUMS.sha256` into AbstractAssistant's
   `tests/basic/fixtures/automations/`, then run `python scripts/check_identity_sync.py` from the
   AbstractFramework repository.

**Checks** (part of `npm test`): `ui-kit/scripts/check_automation_fixtures.mjs` (shapes,
coverage, checksums), `check_automation_client.mjs` (paths, bodies, error parsing),
`check_automation_panel.mjs` (rendering, handlers and the pure rules), and panel-chat's
`scripts/check_automation_badges.mjs`.

## Exports

From `@abstractframework/ui-kit` (source: `ui-kit/src/automations/`):

- **Components**: `AutomationPanel` (`AutomationPanelProps`), `AfScheduleDialog`
  (`AfScheduleDialogProps`), `DISCUSS_LABEL`, `plainTextRenderer` (the fallback), type
  `RenderText`.
- **Client**: `createAutomationsClient()`, `AutomationApiError`, `parseApiError()`,
  `AUTOMATIONS_PATH`, `TRIGGER_SOURCES_PATH`; types `AutomationsClient`,
  `AutomationsClientOptions`, `ListAutomationsQuery`, `PageQuery`.
- **Presentation rules** (pure functions, no React): `automationControls()`
  (`ControlId`, `ControlState`), `CONTROL_COMMANDS`, `occurrenceViews()` (`OccurrenceView`,
  `OccurrenceTone`), `attentionAckCursor()`, `attentionLabel()`, `triggerSummary()`,
  `scheduleLabel()`, `intervalLabel()`, `contextLabel()`, `formatUtc()`, `parseDuration()`,
  `reviseChanges()` (`ReviseForm`), `buildCreateRequest()` (`ScheduleForm`, `ScheduleWhen`),
  `SCHEDULE_PRESETS`, `TOOL_APPROVAL_CONSENT`.
- **Waits**: `waitToolCalls()`, `parseEventPayload()`, `WAIT_KIND_LABELS`.
- **Errors**: `apiErrorText()`, `API_ERROR_TEXT`, `isApiError()`.
- **Retry-safe ids and acknowledgement**: `ActionIds`, `isDefinitiveError()`, `SeenAckTracker`.
- **Contract types**: `AutomationSummary`, `AutomationDetail`, `AutomationDefinition`,
  `AutomationStatus`, `AutomationAttention`, `AttentionItem`, `AttentionWait`,
  `LastOccurrence`, `OccurrenceRow`, `OccurrenceWait`, `OccurrenceFailure`,
  `OccurrenceArtifact`, `Notify`, `WaitKind`, `WaitAnswer`, `ToolCallToApprove`,
  `ToolApprovalPolicy`, `AutomationPolicyInput`, `RetryPolicy`, `ContextMode`,
  `AutomationTarget`, `AutomationChanges`, `AutomationCommandType`, `CommandReceipt`,
  `CreateAutomationRequest`, `CreateAutomationResponse`, `DiscussResponse`, `TriggerBinding`,
  `TriggerSpec`, `TriggerEnvelope`, `TriggerSource`, `TriggerSourceEntry`,
  `TriggerSourceKind`, `ScheduleConfig`, `ScheduleEventPayload`, `ManualEventPayload`,
  `Duration`, `Timestamp`, `Page`, `ApiError`, `ApiErrorCode`.

From `@abstractframework/panel-chat` (source: `panel-chat/src/automation_badges.tsx`):
`ScheduleThisAction` (`ScheduleThisActionProps`, `ScheduleSeed`), `FromAutomationBadge`
(`FromAutomationBadgeProps`), `fromAutomationText()`.

## Related docs

- [Architecture: Automations](./architecture.md#automations-ui-kit--panel-chat) — how the apps, the kit and the Gateway routes connect
- [API reference](./api.md) — the export map per package
- [FAQ](./faq.md#automations-does-the-kit-poll-or-schedule-anything) and [Troubleshooting](./troubleshooting.md#automations-the-panel-shows-an-error-or-a-control-stays-disabled)
- [Development: shared contracts](./development.md#shared-contracts-with-other-repositories)
- [Docs index](./README.md)
