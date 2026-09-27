# Automations (v1)

An **automation** runs a workflow on a trigger — "every 8 hours", "every 30
minutes", "once at 2026-09-28 08:00 UTC", or by hand — and keeps every run
readable as a chat. The Gateway owns the execution (its `/api/gateway/automations`
routes, backed by AbstractRuntime); AbstractUIC ships the shared presentation:

| Piece | Package | What it does |
| --- | --- | --- |
| `createAutomationsClient()` | `ui-kit` | One method per Gateway route; injected `fetch`; typed errors |
| `AutomationPanel` | `ui-kit` | One automation: definition, controls, occurrences as chat pairs |
| `AfScheduleDialog` | `ui-kit` | Create an automation; builds the `POST /automations` body |
| `ScheduleThisAction` | `panel-chat` | "Schedule this…" button for a chat header slot |
| `FromAutomationBadge` | `panel-chat` | "from automation <title> · #<n>" marker for a message or session |
| Canonical fixtures | `ui-kit/scripts/fixtures/automations/` | The shared wire shapes every client tests against |

Nothing here schedules, polls or executes. The host fetches, the components
render server truth and forward intent through callbacks.

## Vocabulary

- **Occurrence** — one run of the automation (a child run). It reads as two chat
  turns: the **trigger turn** (`[Trigger schedule@1 · occurrence 3 · fired …]`
  followed by the task) and the **answer turn**.
- **Quiet / notable** — occurrences are quiet by default. One is notable only
  when its output carries `notify`, when it failed after its last retry, or when
  it waits for a person. Quiet occurrences stay visible, subdued and unbadged.
- **Context** — *independent*: each run starts fresh. *growing*: each run sees the
  previous runs, like turns of one conversation.
- **Typed waits** — every wait carries `kind`, and the answer follows the kind,
  never the prompt text: `ask_user` → `{response}` (a choice or free text),
  `tool_approval` → `{approved: true|false}` (its `details` list the tool calls
  `[{name, arguments, call_id?}]`), `event` → `{payload}` (JSON).
- **Tool approval policy** — `policy.tool_approval` is `"auto"` by default:
  an unattended run cannot ask a person every tick, so the tools run without
  asking and creating the automation is the consent. `"ask"` makes every tool
  call wait for approval in the timeline. Flow-level `ask_user` questions wait
  for a person in both modes.
- **Trigger envelope** — a `schedule@1` occurrence's envelope payload is
  `{tick, scheduled_at, coalesced?: {first_tick, last_tick, missed_count}}`
  (`ScheduleEventPayload`); `fired_at` is on the envelope itself. `manual@1`
  carries `{command_id}`.
- **Schedules are fixed UTC intervals.** `schedule@1` knows `start_at`, `every`
  (`^[1-9][0-9]*[smhd]$`), `until`, `count`. Every UI says "every 24 hours
  (UTC)", never "daily at 08:00 local": there is no time zone in v1.
- **Discuss** — starts a *forked* session seeded with the automation's
  conversation up to an occurrence. It never writes back into the automation,
  and the automation's workspace is mounted read-only.

## Client

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

| Method | Route |
| --- | --- |
| `listAutomations({status?, cursor?, limit?})` | `GET /api/gateway/automations` |
| `getAutomation(id)` | `GET /api/gateway/automations/{id}` |
| `createAutomation(body)` | `POST /api/gateway/automations` |
| `reviseAutomation(id, {changes, expected_revision?, command_id?})` | `PATCH /api/gateway/automations/{id}` |
| `sendAutomationCommand(id, {type, payload?, command_id?})` | `POST /api/gateway/automations/{id}/commands` |
| `listOccurrences(id, {cursor?, limit?})` | `GET /api/gateway/automations/{id}/occurrences` |
| `listAttention(id, {cursor?, limit?})` | `GET /api/gateway/automations/{id}/attention` |
| `discuss(id, {occurrence_index, prompt, request_id?})` | `POST /api/gateway/automations/{id}/discuss` |
| `markSeen(id, attentionCursor)` | `POST /api/gateway/automations/{id}/seen` |
| `listTriggerSources()` | `GET /api/gateway/trigger-sources` |

- `command_id` / `request_id` are minted with `crypto.randomUUID()` (or
  `options.newId`) only when you do not pass one. Pass the same id to retry a
  request safely.
- Command types: `automation.pause`, `automation.resume`, `automation.run_now`,
  `automation.stop_current`, `automation.archive`. Revise goes through
  `reviseAutomation`.
- **Polling**: v1 has no change cursor. Poll complete pages; the client never
  sends `changed_since` (the Gateway answers it with 422 `unsupported_feature`).
- **Errors**: every non-2xx carries `{"detail": {"reason_code", "message",
  "field"?, "command_id"?}}` and is thrown as `AutomationApiError` (`status`,
  `code` = `reason_code`, `message`, `field?`, `command_id?`). A non-2xx without
  that envelope, or a 2xx that is not a JSON object, throws with
  `code: "invalid_response"`. Transport failures propagate unchanged.
  `parseApiError(status, body)` is exported for hosts with their own transport.

| HTTP | `reason_code` |
| --- | --- |
| 401 / 403 | `unauthorized`, `forbidden` |
| 404 | `automation_not_found` (also another principal's automation), `occurrence_not_found` |
| 409 | `revision_conflict`, `automation_busy`, `invalid_state`, `identity_conflict` |
| 422 | `invalid_request` (incl. malformed JSON), `invalid_definition`, `unsupported_feature`, `unknown_trigger_source` |

## AutomationPanel

```tsx
import { AutomationPanel } from "@abstractframework/ui-kit";
import "@abstractframework/ui-kit/theme.css";

<AutomationPanel
  summary={summary}                 // AutomationSummary (from the list page)
  occurrences={rows}                // OccurrenceRow[] (any page order; rendered oldest first)
  triggerSources={sources}          // GET /trigger-sources items
  busy={pending}
  error={lastError}                 // ApiError | undefined
  onCommand={(type, payload, meta) => automations.sendAutomationCommand(id, { type, payload, command_id: meta?.command_id })}
  onRevise={(changes, rev, meta) => automations.reviseAutomation(id, { changes, expected_revision: rev ?? undefined, command_id: meta?.command_id })}
  onDiscuss={(index, prompt, meta) => automations.discuss(id, { occurrence_index: index, prompt, request_id: meta?.request_id })}
  onSeen={(cursor) => automations.markSeen(id, cursor).then(() => undefined)}
  onLoadMore={loadOlderPage}
  onOpenRun={(runId) => openLedger(runId)}
  onAnswerWait={(runId, waitKey, payload) => resumeWait(runId, waitKey, payload)}
/>
```

What it renders:

- **Header** — title, status, trigger summary ("every 8 hours (UTC)"), context
  mode, next run, run count, attention ("2 unseen · 1 waiting for you"),
  revision, a legacy marker for old `scheduled:*` roots. A trigger source the
  Gateway does not list (or lists `available:false`) is stated.
- **Controls** — Pause / Resume, Run now, Stop current, Revise…, Archive….
  `summary.capabilities` says what the principal may do; the status says what
  applies now. Run now stays enabled while paused (it runs once and the
  automation stays paused). Stop current is enabled while an occurrence runs or
  waits. Archive asks for confirmation inside the panel. `busy` disables all.
  Every disabled control has a visible reason ("Run now: An occurrence is in
  progress."), linked to the button with `aria-describedby`.
- **Retry-safe ids** — the panel mints ONE id per user action and passes it as
  the last callback argument (`{command_id}` for `onCommand` / `onRevise`,
  `{request_id}` for `onDiscuss`). When the request failed in transport (no
  gateway answer), the same click again reuses that id, so the gateway answers
  idempotently; after a success or a gateway error the next click is a new
  action with a new id. Forward the id to the client. The dialog does the same
  for `request_id`, per distinct request body (an edited request never reuses
  an id, which would be an `identity_conflict`).
- **Focus** — when the archive confirmation, the revise form or a discuss form
  closes, focus returns to the control that opened it (else the notice, else
  the title).
- **Revise** — title, interval, context; only changed fields are sent, with
  `expected_revision`. A new interval keeps the rest of the schedule.
- **Attention** — the unseen notify/failure items and the pending waits. After
  showing them the panel calls `onSeen(cursor)` with the **last displayed**
  item's cursor, never `summary.attention.cursor`, so items it did not show stay
  unseen. A cursor counts as acknowledged only after `onSeen` resolves; a failed
  call is retried on the next render that brings a new summary (your next poll),
  never in a loop.
- **Occurrences** — one chat pair each; quiet ones subdued, notified / failed /
  waiting ones badged. Waits render by `kind`: `ask_user` with its choices and
  a free-text answer (`{response}`); `tool_approval` with the tool calls and
  their arguments listed and **Approve** / **Deny** (`{approved: true|false}`);
  `event` with a JSON payload field (`{payload}`; invalid JSON is refused with
  a message); an unknown kind is shown with "open the run", never answered. The
  attention strip labels waits the same way ("Approval needed", "Question for
  you"). A failed pair shows its `failure` (`reason_code`,
  message, "after N attempts") when the gateway sends it. The trigger line shows
  `trigger.summary` as the gateway words it (`schedule: every 8 hours (UTC),
  tick 12`, `manual: run now (<command_id>)`). Each pair has "Run details" (run id, attempts, `onOpenRun`,
  ledger link, workspace link) and **Discuss — forked session, read-only
  workspace**. Discuss needs the `discuss` capability, is off for legacy rows,
  and is available once the occurrence has finished (also on an archived
  automation). "Load earlier occurrences" appears while fewer rows than
  `occurrence_count` are loaded.

Every error code maps to one sentence (`apiErrorText()` / `API_ERROR_TEXT`),
shown with the Gateway's own message.

## AfScheduleDialog

```tsx
<AfScheduleDialog
  open={open}
  onClose={() => setOpen(false)}
  workflowPicker={<MyWorkflowPicker onChange={setTarget} />}
  target={target}                     // {bundle_ref, flow_id} | {flow_id:"@default", interface}
  initialPrompt={chatPrompt}
  onSubmit={(body) => automations.createAutomation(body)}
  busy={creating}
  error={createError}
/>
```

- **What** — the host's picker (slot) and the task prompt (sent as
  `target.input_data.prompt`).
- **When (UTC)** — Repeat every N minutes / hours / days (presets from every 5
  minutes to every 7 days), or Once at a UTC date and time.
- **Context** — Independent or Growing.
- **Tools** — "Run without asking" (default, `policy.tool_approval: "auto"`),
  shown with the consent line "Tools run without asking (you approve them now
  by creating this automation)" followed by `targetTools` when the host passes
  the target's tool names; or "Ask me before each tool call" (`"ask"`).
- **Advanced** — title (default: the task's first line), first run at, stop
  after N runs, stop at.

The request id is minted once per opening, so a retry after an error is
idempotent. The pure builder is exported as `buildCreateRequest(form, {target,
requestId})`.

## panel-chat pieces

```tsx
import { ScheduleThisAction, FromAutomationBadge } from "@abstractframework/panel-chat";

<WorkflowChat header={<ScheduleThisAction seed={{ prompt, target }} onSchedule={openScheduleDialog} />} … />
<FromAutomationBadge title="Inbox triage" index={7} onOpen={() => openAutomation(id)} />
```

Neither performs requests. No v1 host wires them yet.

## Fixture contract

Timestamps arrive as the gateway emits them (`2026-09-27T04:00:00.412307+00:00`);
`formatUtc()` shows them as `2026-09-27 04:00 UTC` (and accepts the `Z` form).

`ui-kit/scripts/fixtures/automations/` holds `list.json`, `occurrences.json`,
`attention.json`, `trigger-sources.json`, `commands.json` and `errors.json`: the
shared shapes of the Gateway routes, generated from real Gateway output and
curated (see its `README.md`). The Observer reads
these files through its source alias; the Assistant vendors byte-identical
copies, and the root `scripts/check_identity_sync.py` fails on drift.
`CHECKSUMS.sha256` pins the bytes; `node ui-kit/scripts/check_automation_fixtures.mjs
--write` regenerates it after an intended change.

Checks (part of `npm test`): `check_automation_fixtures.mjs` (shapes, coverage,
checksums), `check_automation_client.mjs` (paths, bodies, errors),
`check_automation_panel.mjs` (render + handlers + pure rules), and panel-chat's
`check_automation_badges.mjs`.
