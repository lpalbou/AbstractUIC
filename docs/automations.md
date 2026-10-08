# Automations

An **automation** runs a workflow on a trigger — "every 8 hours", "every day at 08:00",
"every Mon and Fri at 07:30", "monthly on the last day", "once at Fri 9 Oct 08:00", or by
hand — and keeps every run readable as a chat. AbstractGateway owns
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
- **Schedules (`schedule@2`)** — the kit writes every schedule as `schedule@2` with a `kind`:
  **Repeat** `{kind: "every", every, start_at?, count?, until?}` is a fixed UTC interval
  (`^[1-9][0-9]*[smhd]$`, exactly as `schedule@1`: "every 24 hours (UTC)"); **Daily**
  `{kind: "daily", at: "HH:MM"}`, **Weekly** `{kind: "weekly", days: ["mon", …], at}` and
  **Monthly** `{kind: "monthly", day: 1..31 | "last", at}` run at that wall-clock time in the
  automation's time zone, across daylight-saving changes (a day the month does not have runs on
  its last day); **Once** `{kind: "once", at: "YYYY-MM-DDTHH:MM"}` is a wall time in that zone.
  The kit never sends a `time_zone`: the Gateway stamps the owner's account time zone (the
  `time_zone` preference, default the Gateway host's zone) and keeps it on revisions.
  Existing `schedule@1` automations keep their meaning and wording.
- **Served schedule facts** — the Gateway computes when an automation runs next and words its
  rule; every client shows those values and computes neither. Each summary carries `time_zone`,
  `schedule_rule_text` ("Every Mon and Fri at 07:30 (Europe/Paris)"), `schedule_text` (the
  rule + " · next Fri 9 Oct 07:30"), and, while a run is scheduled, `next_run_at` (UTC) and
  `next_run_local` (the same instant with the zone's offset, e.g. `2026-10-09T07:30:00+02:00`).
  `POST /api/gateway/automations/schedule-preview` answers the same for a trigger before it is
  saved, plus `first_run_sentence` ("Runs every Mon and Fri at 07:30 (Europe/Paris), first run
  Fri 9 Oct 07:30.").
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

Occurrences read as a **chat**: each run's trigger turn and answer turn is the shared
`ChatMessageCard` (a user card titled "Trigger", an assistant card titled "Automation", with the
card's copy button), and every other text — notify bodies, wait prompts, attention bodies, the
definition's task — goes through the same content renderer as the chat (Markdown with tables and
code, JSON autodetect, remote images as links). ui-kit cannot import panel-chat (panel-chat
depends on ui-kit), so the panel takes two seams, `renderTurn(turn)` and `renderText(text)`, and
panel-chat ships the pairing. Use one of:

```tsx
import { AutomationPanelWithMarkdown, automationRenderers } from "@abstractframework/panel-chat";

<AutomationPanelWithMarkdown {...props} />              // the panel with the chat rendering wired
<AutomationPanel {...automationRenderers} {...props} />  // same thing, spread onto the kit panel
```

Pass `messageProps` to `AutomationPanelWithMarkdown` to expose the shared chat actions on
occurrence cards, including narration controls and their loading/playback state. The host supplies
the voice transport through `useGatewayVoice`; streamed audio can play before synthesis completes.

The automation header identifies its target workflow. To offer a workflow picker in Edit, provide
`definition` and `workflowPickerOptions`. A target revision keeps portable agent settings, tool
selection and result-email recipients, and loads the selected workflow's input defaults. Hosts
with a custom preparation step can provide `prepareTarget`.

`renderTurn` receives an `AutomationTurn`: `{kind: "trigger" | "answer", role: "user" |
"assistant", text, index, runId}`; without it a turn's text goes through `renderText`. Without
`renderText` the panel falls back to escaped plain text and marks itself
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
  onOpenWorkspace={(runId) => showFolder(runId)}  // e.g. panel-chat's WorkspaceBrowser for that run
  onOpenResource={(r) => openGatewayResource(fetchGateway, r.url, { name: r.name })}  // ledger JSON, artifacts
  editOpen={editing}                // optional: the host drives the Edit form (e.g. a list row's Edit)
  onEditOpenChange={setEditing}
  {...automationRenderers}          // from @abstractframework/panel-chat: the chat's rendering
/>
```

The panel is controlled: it holds only view state (which form is open, the last notice) and
renders what you pass. Optional props: `definition` (the `definition` of `GET /automations/{id}`;
when given, the panel adds a collapsed "Definition" card and the Edit form also edits the task
and tool approval), `renderText` and `renderTurn` (required in practice; see above),
`onOpenWorkspace(runId)` and `onOpenResource(resource)` (see below), `editOpen` /
`onEditOpenChange(open)` (see [Edit](#edit)), `newId` (the id source for retry-safe ids, default
`crypto.randomUUID`) and `className`.

### What it shows

- **Header** — title, state as a word then an icon ("Active ▶", "Paused ⏸"; Completed,
  Failed and Archived likewise — `AutomationStateLabel`, the one rendering every client uses), trigger (every schedule — Repeat
  with its bounds, calendar, once, `schedule@1` rows too — is the served `schedule_rule_text`
  verbatim: "Every 8 hours (UTC)", "Every day at 08:00 (Europe/Paris)"; "manual runs only"), context, "Now: Run #7
  running" (only from `summary.current_occurrence`, never inferred from the last occurrence;
  "starting" while admitted, "waiting to retry" in backoff), next run as
  "2026-10-09 08:00 Europe/Paris (in 14 h)" (`nextRunLabel`: the served `next_run_local` cut to
  date and time — no clock or zone arithmetic — plus the relative time to the served
  `next_run_at`; an active scheduled automation carries them even while a run is in progress;
  "none while paused" when paused), run count, the automation's workspace folder (`workspace_root`: a folder icon and the
  whole path, wrapping at its `/`, `-` and `_` separators; the whole chip is a button calling
  `onOpenWorkspace(automation_id)` when that prop is given — an automation's id is its
  controller run), attention
  ("2 unseen · 1 waiting for you"), revision, and a "Legacy schedule" marker for rows the Gateway
  projects from older `scheduled:*` roots. When the Gateway does not list the automation's trigger
  source, or lists it with `available: false`, the header says so.
- **Definition** (only with the `definition` prop) — a collapsed card right under the controls
  ("Definition · revision N", one click to open): target workflow, task, trigger source and
  config, context, tools (`tool_approval` auto / ask), retry policy and revision. The Edit form
  takes its place while it is open.
- **Needs attention** — the unseen notify and failure items, then the pending waits, labelled by
  kind ("Question for you", "Approval needed", "Waiting for an event").
- **Occurrences** — one chat pair per run, oldest first. Quiet runs are subdued; notified, failed,
  waiting and running runs carry a badge ("Notified", "Failed after 3 attempts", "Waiting for you",
  "Running"). A run that succeeded after retries reads "completed after 2 attempts". A failed run
  shows its `failure` (`reason_code`, message, "after N attempts"). The answer turn lists the
  run's artifacts. Each pair has **Run details** (run id, attempts, "Open run ledger" through
  `onOpenRun`, a **Ledger (JSON)** button, and a **Workspace** button calling
  `onOpenWorkspace(run_id)` when the Gateway reports a workspace for the run and the host passes
  the prop).
- **Gateway links are never raw hrefs.** The Gateway sends `ledger_url`, `workspace_url` and
  `artifacts[].url` rooted at ITS origin (`/api/gateway/runs/…`); as links they would bypass an
  app's credentials under `/apps/<id>/` and a standalone app's proxy (and fail in token mode). The
  artifact names and the Ledger (JSON) button call `onOpenResource(resource)`
  (`GatewayResource`: `kind` "ledger" / "artifact", the server's `url`, a file `name`,
  `mimeType`, `runId`); a rejection shows as the panel's error. Without the prop, artifacts are
  plain names and there is no ledger JSON button. panel-chat's `openGatewayResource(fetchGateway,
  url, { name, mode? })` is the implementation: ui-kit `gatewayResourcePath(url)` maps the
  server string to the app-relative path (anything that is not a gateway API path throws), the
  host's `fetchGateway` fetches it, and `tabOpenPlan` decides how it opens (HTML and other active
  content as source text). `AutomationPanelWithMarkdown` wires it when given `fetchGateway`.
- **Paused** — a hint reads "Paused: scheduled runs are skipped. Run now works and keeps it
  paused."
- **Load earlier occurrences** appears while fewer rows than `summary.occurrence_count` are
  loaded; it calls `onLoadMore`.

### Controls

The controls bar leads with an **Active** switch (`AfSwitch`: on = the automation runs on its
schedule, off = paused), followed by Run now, Stop current, Edit and Archive, each an icon then
its label (`CONTROL_LABELS`, `CONTROL_ICONS` — hosts use the same names and glyphs for their own row
actions). `summary.capabilities` says what you may do (the Edit control is the `revise`
capability); the status says what applies at this moment:

| Control | Enabled when | Sends |
| --- | --- | --- |
| Active (switch) | status `active` or `paused`, with the capability of the transition (`pause` when on, `resume` when off) | `automation.pause` when on, `automation.resume` when off (`activeToggleCommand(summary)`) |
| Run now | status `active` or `paused`, and `current_occurrence` is `null` | `automation.run_now` (while paused it runs once; the automation stays paused) |
| Stop current | `current_occurrence` is not `null` (admitted, running — including waiting for you — or backing off) | `automation.stop_current` |
| Edit | always (subject to capability and status below) | opens the Edit form; Save calls `onRevise(changes, revision)` |
| Archive | always (subject to capability and status below) | `automation.archive`, after an in-panel confirmation |
| Unarchive (0.8.0) | status `archived` and the `unarchive` capability; shown in place of Archive on an archived automation | `automation.unarchive` (the automation comes back paused; one that had already finished or failed keeps that status) |

Every control except Unarchive is disabled while `busy`, on a legacy row, without the matching
capability, or on an archived automation; Unarchive is disabled while `busy`, on a legacy row,
without the `unarchive` capability, or when the automation is not archived (AbstractGateway
answers `409 invalid_state` to `automation.unarchive` on an automation that is not archived). The
Active switch is also unavailable once the automation has ended. An
unavailable switch stays focusable and names its reason. The reasons show as one compact muted line under the buttons ("Run
now, Stop current: Nothing is running. · …"), linked to each disabled button with
`aria-describedby` and repeated as the first line of its tooltip (a tooltip alone is unreliable
on a disabled button).

Each control's tooltip (`title`) and `aria-description` say what it does (`CONTROL_HINTS`,
`controlHint(id, summary)`). Run now's hint states its effect on the schedule:

> Run it once now, without waiting for the schedule.
> The schedule does not move: the next scheduled run keeps its time, or starts right after this
> run if its time comes first.
> Does not count toward a run limit. Works while paused; it stays paused.
> Not available while a run is in progress.

`controlHint("run_now", summary)` adds "Next scheduled run: 2026-10-09 08:00 Europe/Paris." when
the summary carries a served next run (`next_run_local`), and "Growing context: later runs see this run in their history."
for a Growing automation. In detail, a manual run:

- never moves the schedule: the next scheduled time stays where it was;
- delays, never drops, a scheduled time it overlaps: that run starts as soon as the manual run
  ends (several missed times coalesce into one run, as after any long run);
- is not counted by a schedule's run limit (`count`), and it cannot start once that limit is
  reached (the automation has ended);
- runs while paused, and the automation stays paused;
- is refused while a run is in progress or another manual run is waiting to start (there is no
  queue);
- in a Growing automation, is a turn of the automation's conversation, so later runs see it.

The names, hints and the run-now glyph live in one file, `ui-kit/src/automations/automation_controls.json`,
which `CONTROL_LABELS`, `CONTROL_HINTS`, `RUN_NOW_ONE_LINE` (a one-line form for terminal help
rows) and `RUN_NOW_GLYPH` (the `playCircle` markup, for clients that draw it without React) read.
Clients that cannot import the kit vendor that file byte-identical; the AbstractFramework
repository's `scripts/check_identity_sync.py` fails when a copy drifts.

The result of an action, named by the new state ("Automation paused.", "Automation active.",
"Run requested.", "Stop requested.", "Saved; applies from the next run.")
shows next to the buttons for `NOTICE_MS` (5 s) with a dismiss control, then clears. Errors stay
until dismissed or replaced.

- **Discuss — fork at this occurrence (own workspace, automation files read-only)** needs the
  `discuss` capability, is off for
  legacy rows, and is available once the run has finished (also on an archived automation).
- When the archive confirmation, the Edit form or a discuss form closes, focus returns to the
  control that opened it (else to the notice, else to the title).

### Edit

The Edit control opens a form prefilled from the automation, with its first field focused:

| Field | From | Sent as |
| --- | --- | --- |
| Title | `summary.title` | `changes.title` |
| Workflow | `definition.target` (with `workflowPickerOptions`) | `changes.target`, prepared with the selected workflow's defaults |
| Task | `definition.target.input_data.prompt` (only with `definition`, when it is text) | `changes.target`: the definition's `bundle_ref` and `flow_id`, its `input_data` with the new `prompt` (the Gateway re-applies its run protections) |
| Repeat every (UTC) | the schedule's `every` (only for an interval schedule) | `changes.trigger` with the rest of the schedule config kept |
| When (Daily · Weekly · Monthly) | a `schedule@2` calendar rule (only for one) | `changes.trigger` with the new rule, the automation's `time_zone`, `count` and `until` kept; the line under it is the Gateway's `first_run_sentence` and "in Europe/Paris (this automation's time zone)" |
| Context | `summary.context_mode` | `changes.context` |
| Tool selection | the target's enabled tools (with `availableTools`) | revised target tool selection; empty disables tools, workflow defaults restores inheritance |
| Tool approval | `definition.policy.tool_approval` (only with `definition`) | `changes.policy.tool_approval` |

The form works on the automation as it was when the form opened: a refresh meanwhile (a host's
poll) changes neither its values nor what Save compares against. Save sends only the fields
changed since the form opened, once, with THAT revision as `expected_revision`, so a concurrent
change by another client is refused (`revision_conflict`, "The automation changed since this view
loaded…") instead of silently reverted; close and reopen the form to edit the new version. A
successful save closes the form; Cancel or Escape closes it. The workspace folder is the Gateway's
and is not editable. The change applies from the next run.

By default the panel keeps the form's open state itself. A host that has its own Edit control (a
list row, a menu) passes `editOpen` and `onEditOpenChange`: the form is open exactly while
`editOpen` is `true`; the panel's Edit button asks `onEditOpenChange(true)`, and Cancel and a
successful save ask `onEditOpenChange(false)`. The form never opens on an automation that cannot
be edited (archived, legacy, or without the `revise` capability), whatever `editOpen` says.

A host that draws its own header and controls passes `hideHeader`: the panel then omits its
header (title, facts) and its controls bar and starts at the definition and the occurrences; the
section is named by the automation's title. AbstractCode does this: its header carries the Active
switch, the timing line (`automationTiming()`), Run now, Stop, Edit and Archive.

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
  emailStatus={myEmail}               // automations.getMyEmail(); null/undefined = not set up
  onOpenMyEmail={() => openConsole("users")}  // optional: makes "open My email" a button
  previewSchedule={automations.previewSchedule}  // required: the Gateway's line for calendar/once rules
  onOpenPreferences={openAccountPreferences}  // optional: "Change in preferences" next to the time zone
/>
```

The dialog is modal (focus trapped, Escape closes, focus returns to the opener) and holds these
sections:

- **What** — your workflow picker (a slot; it sets `target`) and the task, sent as
  `target.input_data.prompt`.
- **When** — **Repeat** every N minutes, hours or days, with presets from "every 5 minutes" to
  "every 7 days" (a fixed UTC interval); **Daily** at HH:MM; **Weekly** on the days you pick (day chips that show
  their state: on = tinted with a check mark) at HH:MM; **Monthly** on day 1 to 31 or "last" at
  HH:MM; **Once at…** a date and time; or **When an email arrives** (see
  [Email automations](#email-automations)). For every schedule kind (Repeat with its first run,
  max runs and stop at included) the line under the section is the Gateway's own sentence (`previewSchedule` → `first_run_sentence`, asked
  250 ms after the last change, the latest answer wins; "Checking the schedule…" meanwhile; a
  refusal shows the Gateway's sentence), for example "Runs every 24 hours (UTC), first run now.";
  Daily, Weekly, Monthly and Once add the time zone as a line — "in Europe/Paris (your
  account's time zone)" — carrying a kit tooltip, and **Change in preferences** when the host
  passes `onOpenPreferences`. The zone is changed only in the account preferences, never in the
  dialog. Switching kinds keeps what you picked (Weekly → Monthly → Weekly keeps the days).
- **Context** — Independent or Growing.
- **Tools** — "Run without asking" (the default, `policy.tool_approval: "auto"`) shows the
  consent line **"Tools run without asking (you approve them now by creating this automation)"**,
  followed by the `targetTools` names when you pass them. "Ask me before each tool call"
  (`"ask"`) makes every tool call wait for approval in the automation's timeline.
  Pass `availableTools` to include the shared searchable tool selector, with `initialTools`
  for a saved selection. An explicit empty list disables tools; `null` uses workflow defaults.
- **Email** — **Email result** and **Recipients** (see
  [Email automations](#email-automations)).
- **Workspaces** — shown when the host passes the `workspaces` slot: the host renders the
  `WorkspaceChooser` at the run level (`level="run"`, the gateway's dry run as `effective`,
  **Use my default** = no payload) and merges the value into `target.input_data.workspace` in its
  `onSubmit`. The gateway stores it on the definition and clamps it to the eligible workspaces at
  each run. The dialog itself sends nothing workspace-shaped.
- **Title and limits** — title (default: the task's first line, at most 120 characters); for
  Repeat the first run at; for Repeat and the calendar rules stop after N runs and stop at. These
  date fields are read as UTC.

Every section is visible: the dialog has no disclosure.

Submitting calls `onSubmit(body)` with a complete `CreateAutomationRequest`. The dialog mints one
`request_id` per distinct request body: retrying the same request after a transport failure
reuses it; an edited request, or a request after a definitive answer, gets a new id (reusing an
id with a different body would be an `identity_conflict`). Return the client's promise from
`onSubmit` so the dialog can tell a transport failure from an answer. The same builder is
exported as `buildCreateRequest(form, {target, requestId})`, which returns `{ok: true, body}` or
`{ok: false, errors}`; `TOOL_APPROVAL_CONSENT` holds the consent line for hosts with their own
create UI.

### Email automations

The Gateway reads each user's own mailbox (runtime trigger `email.received@1`). The dialog offers three email options, and only when
`GET /api/gateway/me/email` (`automations.getMyEmail()`, passed as `emailStatus`) reports
`effective_enabled: true` — the account is connected, the user's own switch is on and an
administrator allows it. Otherwise the options are disabled and the dialog shows **"Connect a
mailbox first — open My email"**; with `onOpenMyEmail` the last words are a button (the Gateway console's
My email is in its Users tab, `/console#users`). An unknown status (not loaded, or the call
failed) counts as not set up, and nothing email-shaped is ever sent without a usable account.

- **When an email arrives** — the trigger `{source_id: "email.received", source_version: 1}`.
  Typed filters only, no patterns: from these addresses (`filter.from_in`), from these domains
  (`from_domain_in`), sent to these addresses (`to_in`), subject contains (`subject_contains`, one
  literal line) and attachments any / only with / only without (`has_attachment`). List fields
  take commas or new lines; each entry is checked as a plain address or domain and a wrong entry
  is named. **Check for new mail every** defaults to 1 hour when the target runs a model
  (`uses_model: true`, the dialog's default; `targetUsesModel={false}` for a model-free target
  gives 60 s); the shortest interval is 60 seconds, and the dialog states that rule. **At most
  this many emails per run** (`max_batch`, 1–1000, default 100): the rest wait for the next run.
  Each email is read once by the automation; mail that arrived before it was created, or while it
  was paused, is not processed. The Tools section adds that incoming mail is data, never
  instructions, and that link-opening tools (`fetch_url`, `browser_probe`) always ask.
- **Email result** emails every completed run’s full result.
- **Recipients** appears when Email result is enabled: **Only me** (default) or
  **Me and these addresses**. Recipients are stored in `notify.recipients`;
  this setting does not grant email-tool permissions. The mailbox recipient policy still applies.

The Edit form offers the same interval (for an email trigger), **Email result** and the
result recipients when the host passes the committed definition; without a usable account an
option already on can be turned off, never on. A new interval drops the old `start_at`, so the
revised trigger starts from now and never re-reads mail. The definition card lists **Notify** and
**Recipients**. Hosts with their own create form (the Observer's Launch → Automate) render the same
fields with `AfEmailTriggerFields`, `AfEmailOptionsFields` and `AfEmailSetupNotice`, and build the
body with `buildCreateRequest({..., trigger: "email", email, notifyEmail, emailRecipients})`. The
words live in `automation_controls.json` under `email` (`EMAIL_TEXT`), which the Assistant vendors.

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
| `getMyEmail()` | `GET /api/gateway/me/email` → `MyEmailStatus` (`configured`, `effective_enabled`, `address`, …; never a secret) |

- **Ids**: `command_id` and `request_id` are minted only when you do not pass one. Pass the same
  id to retry a request safely.
- **Command types**: `automation.pause`, `automation.resume`, `automation.run_now`,
  `automation.stop_current`, `automation.archive`, `automation.unarchive` (0.8.0). Revisions go through `reviseAutomation`.
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
  without `renderText` / `renderTurn`), `automationRenderers` (`{renderText, renderTurn}`),
  `renderAutomationText(text)` and `renderAutomationTurn(turn)` (+ `AUTOMATION_TURN_TITLES`)
  wire the kit's `AutomationPanel` to the chat (`ChatMessageCard` per turn,
  `ChatMessageContent` for other text, images as links).
- `WorkspaceBrowser` browses a run's folder on the gateway host (list, open, download) through
  the host's credentialed `fetchGateway(path, init)`; give it `runId = automation_id` for the
  automation's folder, a discussion's run id for the discussion's own folder. See
  [API: panel-chat](./api.md#abstractframeworkpanel-chat).
- `presentInteraction(wait, controller, options?)` turns a discussion's pending wait into the
  `WorkflowChat` control (tool approval, question, event).

## Time zone preference

`AfTimeZonePicker` is the account's time zone in a settings page or a preferences modal: a kit
searchable combobox over the IANA names the Gateway serves (`GET /api/gateway/accounts/me/preferences`
→ `time_zone.choices`, never a list from the browser), "Gateway default (Europe/Paris)" first
(= `null`, follow the Gateway host's zone), with the Gateway's own label and help as a kit
tooltip. It holds no state: the host sends `PUT …/preferences` `{"time_zone": "<IANA>" | null}`
on change (no Save) and shows "Saved." or "Not saved." with the Gateway's sentence through the
`note` prop. A preferences answer without the `time_zone` block throws — the picker never guesses.

```tsx
<AfTimeZonePicker id="tz" block={answer.time_zone} onChange={(zone) => save({ time_zone: zone })} note={note} />
```

The Gateway console mounts the same component as the island `AfConsoleIslands.mountTimeZonePicker`.

## Fixtures contract

`ui-kit/scripts/fixtures/automations/` holds the Gateway's wire shapes that every automations
client tests against:

| File | Route | Content |
| --- | --- | --- |
| `list.json` | `GET /api/gateway/automations` | Four automations (active growing, active independent, paused, and a `schedule@2` daily rule in Europe/Paris) and a legacy row; every row carries the served schedule facts |
| `occurrences.json` | `GET …/{id}/occurrences` | Quiet runs, a notify with an artifact, a success after a retry, a manual run, a failure after 3 attempts, and a run waiting on an `ask_user` and a `tool_approval` wait |
| `attention.json` | `GET …/{id}/attention` | Unseen items, oldest first |
| `trigger-sources.json` | `GET /api/gateway/trigger-sources` | `schedule@1`, `schedule@2` and `manual@1` |
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
`scripts/check_automation_badges.mjs` and `check_automation_markdown.mjs`.

## Exports

From `@abstractframework/ui-kit` (source: `ui-kit/src/automations/`):

- **Components**: `AutomationPanel` (`AutomationPanelProps`), `AutomationStateLabel` (state
  word then icon), `AfScheduleDialog` (`AfScheduleDialogProps`), `AfEmailSetupNotice`,
  `AfEmailTriggerFields`, `AfEmailOptionsFields` (with their `…Props`), `CONTROL_LABELS`,
  `CONTROL_ICONS` and `CONTROL_HINTS` (each control's name, kit icon and tooltip),
  `controlHint()`, `RUN_NOW_ONE_LINE`, `RUN_NOW_NEXT_RUN_LINE`, `RUN_NOW_GROWING_LINE`,
  `RUN_NOW_GLYPH`, `DISCUSS_LABEL`,
  `STATUS_LABELS`, `STATUS_ICONS`, `plainTextRenderer` (the fallback), types `RenderText`,
  `RenderTurn`, `AutomationTurn`.
- **When editor and time zone** (round 16): `AfCalendarRuleFields` (Daily / Weekly day chips /
  Monthly day + time), `AfServedSchedule` (the Gateway's `first_run_sentence` with the
  time-zone line, loading and error states), `AfTimeZoneLine`, `useSchedulePreview()`
  (debounced, latest answer wins; `PreviewSchedule`, `PreviewState`), `CalendarRuleState` with
  `calendarRuleOf()`, `withCalendarRule()`, `calendarStateOf()`, `DEFAULT_CALENDAR_STATE`,
  `calendarWhenOf()`, `AfTimeZonePicker` (`TimeZonePreference`, `timeZoneOptions()`,
  `TIME_ZONE_GATEWAY_DEFAULT`).
- **Client**: `createAutomationsClient()`, `AutomationApiError`, `parseApiError()`,
  `AUTOMATIONS_PATH`, `TRIGGER_SOURCES_PATH`, `MY_EMAIL_PATH`, `SCHEDULE_PREVIEW_PATH`
  (`previewSchedule(trigger)`); types `AutomationsClient`,
  `AutomationsClientOptions`, `ListAutomationsQuery`, `PageQuery`.
- **Presentation rules** (pure functions, no React): `automationControls()`
  (`ControlId`, `ControlState`), `activeToggleCommand()`, `CONTROL_COMMANDS`, `occurrenceViews()` (`OccurrenceView`,
  `OccurrenceTone`), `attentionAckCursor()`, `attentionLabel()`, `triggerSummary()`,
  `scheduleLabel()`, `intervalLabel()`, `contextLabel()`, `formatUtc()`, `parseDuration()`,
  `reviseFormFrom()` and `reviseChanges()` (`ReviseForm`, `ReviseDefinition`), `buildCreateRequest()` (`ScheduleForm`, `ScheduleWhen`),
  `SCHEDULE_PRESETS`, `TOOL_APPROVAL_CONSENT`; schedules: `scheduleConfigFrom()`,
  `scheduleTriggerFrom()`, `schedulePreview()` (the Repeat sentence; "" for a served kind),
  `calendarConfigFrom()`, `calendarWhenFrom()`, `isScheduleV2()`, `isCalendarWhen()`,
  `isServedPreviewWhen()`, `servedRuleText()`, `formatServedLocal()`, `nextRunLabel()`,
  `timeZoneLine()`, `SCHEDULE_TEXT` (the `schedule` wording of `automation_controls.json`),
  `CALENDAR_DAYS`, `CALENDAR_KINDS`, `SCHEDULE_VERSION`, `WALL_TIME_RE`, `WALL_DATETIME_RE`.
- **Timing line** (pure, deterministic: the caller passes `nowMs`): `automationTiming()`
  returns `{cadence, last, next, line}` for a card or header, e.g.
  `Every 24 hours (UTC) · last 3 h ago · next in 14 h` (a schedule's cadence is the served
  `schedule_rule_text`, every kind; the next part is relative to the served `next_run_at`) — compact units rounded down (`<1 min`, `N min`,
  `N h` below 48 h, `N d`), no year, no seconds, `last never` before the first run,
  `running now` while an occurrence executes, `waiting since 5 min` while it waits for an approval or answer, no next part when nothing is scheduled.
  Parts: `compactCadence()`, `lastRunText()`, `nextRunText()`, `compactDuration()`.
- **Email** (pure): `emailUsable()`, `emailTriggerConfigFrom()` (`EmailTriggerForm`,
  `EmailAttachmentFilter`, `DEFAULT_EMAIL_TRIGGER_FORM`), `emailTriggerLabel()`,
  `isEmailTrigger()`, `emailDefaultEvery()`, `emailAllowedRecipientsFrom()`,
  `emailRecipientsFormFrom()`, `emailRecipientsLabel()` (`EmailRecipientsForm`,
  `DEFAULT_EMAIL_RECIPIENTS`), `notifyFor()`, `notifyEmails()`, `notifyLabel()`,
  `parseEntryList()`, `isPlainAddress()`, `isPlainDomain()`, `EMAIL_TEXT`,
  `EMAIL_TRIGGER_SOURCE_ID`, `EMAIL_TRIGGER_SOURCE_VERSION`, `EMAIL_DEFAULT_EVERY_MODEL`,
  `EMAIL_DEFAULT_EVERY_NO_MODEL`, `EMAIL_MIN_EVERY_SECONDS`, `EMAIL_DEFAULT_MAX_BATCH`,
  `EMAIL_MAX_BATCH`.
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
  `EmailReceivedConfig`, `EmailFilter`, `EmailEventPayload`, `AutomationNotify`,
  `NotifyChannel`, `MyEmailStatus`,
  `Duration`, `Timestamp`, `Page`, `ApiError`, `ApiErrorCode`.

From `@abstractframework/panel-chat` (sources: `panel-chat/src/automation_badges.tsx`,
`automation_markdown.tsx`): `ScheduleThisAction` (`ScheduleThisActionProps`, `ScheduleSeed`),
`FromAutomationBadge` (`FromAutomationBadgeProps`), `fromAutomationText()`,
`AutomationPanelWithMarkdown`, `automationRenderers`, `renderAutomationText()`,
`renderAutomationTurn()`, `AUTOMATION_TURN_TITLES`.

## Related docs

- [Architecture: Automations](./architecture.md#automations-ui-kit--panel-chat) — how the apps, the kit and the Gateway routes connect
- [API reference](./api.md) — the export map per package
- [FAQ](./faq.md#automations-does-the-kit-poll-or-schedule-anything) and [Troubleshooting](./troubleshooting.md#automations-the-panel-shows-an-error-or-a-control-stays-disabled)
- [Development: shared contracts](./development.md#shared-contracts-with-other-repositories)
- [Docs index](./README.md)

## Growing context limit

Choose **Growing** to set **Max growing context (tokens)** when creating or editing an
automation. The default is 50,000; enter `30000` for a 30,000-token history budget.
The limit is hidden for **Independent** runs. Changing it affects subsequent occurrences;
already admitted occurrences retain their history for retries. History retains whole turns,
including the newest turn even when that turn alone exceeds the budget.

The API field is `context.growing.max_tokens`, a positive integer. Existing definitions
that omit it retain the 50,000-token default.
