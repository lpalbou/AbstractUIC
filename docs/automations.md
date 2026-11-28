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

## An automation as a chat: `AutomationHeaderCard` + `AutomationChat`

An automation reads like a chat: the trigger is the user message, the run's response is the
assistant message. Hosts mount two pieces, one above the other:

```tsx
import { AutomationHeaderCard } from "@abstractframework/ui-kit";
import { AutomationChat, renderAutomationText } from "@abstractframework/panel-chat";

<AutomationHeaderCard {...headerProps} renderText={renderAutomationText} />   // the header, its own card
<AutomationChat summary={summary} occurrences={rows} fetchGateway={fetchGateway} messageProps={voiceProps}
  onLoadEarlier={loadMore} onTalk={(text, index) => discuss(index, text)} readRunContext={reader}
  onAnswerWait={answerWait} onSeen={markSeen} renderSent={(row) => <WhereItWent run={row.run_id} />} />
```

**`AutomationHeaderCard`** (ui-kit) is the header as one card with its own surface and edge and a
gap below it. Row 1: the title (the row's whole width up to the state badge) and the state badge.
Row 2: the buttons on their own row (Active switch, ONE Run now / Stop, Edit, Details, Archive; on a
narrow pane they stay ONE row, each at least 44 px on a touch screen: the switch shows its state
alone, its label kept for assistive technology; the secondary ones show their icon, each keeps its
name as its accessible name and its hint as tooltip; Run now / Stop takes the room left and shows
its icon alone when that room is too small for its words; a button that ever wraps keeps its size).
Row 3: the
parameters as chips: Task (its first line; whole in the tooltip), Flow, Schedule, Next run, Memory,
Model, Tools, Results, the host's chip (`headerChip`, AbstractObserver's Workspaces) and Files. A
chip whose section the Edit form shows opens the Edit dialog **at that section**
(`AutomationReviseForm` `openSection`; the sections are `automationEditSections(summary, definition,
{modelPicker})`); Next run is never editable. Runs and attention are not parameters: the unread count
stays on the list. A reason line only for what a person can act on (failed, paused with its reason,
archived). On a narrow pane (under 560 px) the chips are ONE row that scrolls sideways inside the
card, its right edge faded. On a touch screen every button and chip is a 44 px target (a chip keeps
its compact pill; its hit area grows). A chip asks `onEditOpenChange(true, section)`, so a host that
edits on its own page opens its editor at that section; the Edit button asks `onEditOpenChange(true)`.
The props are
`AutomationPanel`'s header half (`summary`, `definition`, `occurrences`, `triggerSources`, `busy`,
`error`, `onRevise`, `onCommand`, the Edit form's options, `workflowName`, `headerChip`,
`onOpenWorkspace`, `editOpen`/`onEditOpenChange`); the ids and notices are the panel's. A host keeps
it at the top of its pane while the thread scrolls under it.

**`AutomationChat`** (panel-chat) is the shared `WorkflowChat` thread, as it is. Each run is two
messages (`automationChatMessages(rows, {current, inputs})`):

- a **user message** titled "Task": the run's `task` as the gateway serves it (the task as written for
  that run, no frame). Without one, the run's `user_turn` without its first line ONLY when that line
  is, character for character, the runtime's frame rebuilt from the row (`automationTriggerFrame`:
  `[Trigger {source_id}@{source_version} · occurrence {index} · fired {fired_at}]`); a gateway that
  does not serve `trigger.source_version` keeps the user_turn whole (`automationRunTask`). Stamped when
  it fired; its footer says "Run #33 · on schedule" and, with `readRunContext`, **Context** (the
  run's `RunContextDialog`). The files the run was handed are its chips.
- an **assistant message** titled "Assistant": the answer, stamped when it finished, with the card's
  speaker (the host's `messageProps`), copy, Markdown and the run's files as chips. A run in progress
  is the card's working state with the live line (`AutomationLiveLine`) in its footer. A failed run
  is the card's error level ("Failed"): the answer's words when there are some (and nothing after
  them), else the served reason. A stopped run, or one that finished without a written answer,
  is a quiet hint line. A run waiting on the person has no answer yet: the thread's own question /
  approval panel asks (`automationWaitInteraction`, one wait at a time, the oldest first; answered
  through `onAnswerWait`).
- Under the answer, small: "New" while the result is unseen (it counts as seen once on screen in the
  focused window: `onSeen(cursor)`, the consumed oldest-first prefix), the host's one line saying
  where the result went (`renderSent(row)`), and "The message that was sent" only when it differs
  from the answer.

A per-message side read that fails (the files a run was handed, the host's "where it went") shows
nothing on the message: never raw error text, an HTTP status or a JSON body. A run the gateway no
longer has is not an error the person can act on; the gateway serves such a run as failed with a
reason sentence, which is its failure card.

The thread opens at the first unseen answer, else at the newest run's task (`automationOpening`,
decided once per automation). There is no block above the thread. Earlier runs load from the thread's
own "Earlier runs (N more)" control or the person's scroll to the top (`ChatThread` `earlier`), and
the person's place is kept. A composer ("Talk about its latest run") only when the host passes
`onTalk(text, index)`; a host that draws its header inside the chat passes `header`. The chat has
no day separator: each card's stamp says its day ("Yesterday · 08:13 PM", "Nov 10 · 12:06 AM").

## AutomationPanel

For hosts on a frozen snapshot (AbstractCode web). New hosts mount the two pieces above.

Occurrences read as a **chat**: each run's trigger turn and answer turn is the shared
`ChatMessageCard` (a user card titled "Trigger", an assistant card titled "Automation", with the
card's copy button), and every other text — notify bodies, wait prompts, attention bodies, the
definition's task — goes through the same content renderer as the chat (Markdown with tables and
code, JSON autodetect, remote images as links). ui-kit cannot import panel-chat (panel-chat
depends on ui-kit), so the panel takes two seams, `renderTurn(turn)` and `renderText(text)`, and
panel-chat ships the pairing. Use one of:

```tsx
import { AutomationPanelWithMarkdown, automationRenderers } from "@abstractframework/panel-chat";

<AutomationPanelWithMarkdown {...props} fetchGateway={fetchGateway} messageProps={voiceProps} />  // mount THIS
<AutomationPanel {...automationRenderers} {...props} />  // the older pairing: the turns as before (no card chrome)
```

Hosts mount the wrapper. It sets `turnChrome="card"`: a run's trigger and answer ARE the shared chat
message — the time is inside each card (the card's own stamp, in the reader's zone and locale), the
speaker appears on the answer when the host passes its voice props (`messageProps`: `onSpeakToggle` +
`getSpeakState`, the same props the host gives its chat; the transport is `useGatewayVoice`), copy and
Markdown are the card's, the run's files are the card's chips (with `fetchGateway`: the trigger's
from the run's inputs — `GET runs/{id}/input_data`, the chat's `submittedArtifacts` rule — and the
answer's from the run's `artifacts`, less what the run was handed; storage offloads are hidden by
their metadata, `internalArtifactMetadata`), and a run in progress is the card's own working state
with the live line in its footer. The frame around the two cards is the automation's: the run line
("Run #21 · run by hand", the automation-zone time as its tooltip, the Context button on it), the
status badge, wait forms, the unseen marker, Run details and "Discuss this run". The wrapper also
takes `answerFooter(turn)` (drawn under each answer card, in the frame: AbstractObserver's "After
the run") and `readRunContext` (`{input_data(runId), run(runId)}`: each run line's **Context**
button opens panel-chat's `RunContextDialog`). The spread pairing and a bare panel without
`turnChrome` render exactly as before.

The automation header identifies its target workflow. To offer a workflow picker in Edit, provide
`definition` and `workflowPickerOptions`. To let people change the model an automation runs on,
provide `definition` and `modelPickerOptions` (see the Model row under [Edit](#edit)). A target revision keeps portable agent settings, tool
selection and result-email recipients, and loads the selected workflow's input defaults. Hosts
with a custom preparation step can provide `prepareTarget`.

`renderTurn` receives an `AutomationTurn`: `{kind: "trigger" | "answer", role: "user" |
"assistant", text, index, runId}`, and in card chrome also `chrome: "card"`, `ts` (`fired_at` for
the trigger, `finished_at` for the answer), `live` (`{current, nowMs?}` on the answer of a run in
progress; the panel then calls `renderTurn` for it too) and `artifacts` (the run's, on the answer);
without `renderTurn` a turn's text goes through `renderText`. Without
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
when given, the header shows the task and gains the **Details** button, and the Edit form also
edits the task and tool approval), `turnChrome` (`"card"`, see above), `headerChip`
(`AutomationHeaderChip`: `{label, title?, onClick}`, the host's chip at the end of the header's row —
AbstractObserver's Workspaces chip, opening its chooser in the kit's modal), `triggerConnections` and `mailboxes` (the client's `listTriggerConnections()`
and `listMailboxes()`: the trigger then reads by name, "When Release notes has a new item", "When
mail arrives in me@example.org"), `occurrenceEvents` (each run's `input_data.event` by run id, read
by the host from `GET /runs/{id}/input_data`: the "what arrived" card), `workflowName` (the flow's
name for a person, shown as **Flow**), `renderText` and `renderTurn` (required in practice; see above),
`onOpenWorkspace(runId)` and `onOpenResource(resource)` (see below), `onOpenContext({runId, index})`
(each run's **Context** button, see [What it shows](#what-it-shows)), `editOpen` /
`onEditOpenChange(open)` (see [Edit](#edit)), `newId` (the id source for retry-safe ids, default
`crypto.randomUUID`) and `className`.

### What it shows

- **Header** — ONE header, no folds (`AutomationHeader`). Line 1: the title, the state as a word
  then an icon ("Active ▶", "Paused ⏸"; Completed, Failed and Archived likewise —
  `AutomationStateLabel`, the one rendering every client uses), a "Legacy schedule" marker for rows
  the Gateway projects from older `scheduled:*` roots, and the buttons, each with an icon and a
  tooltip (no "⋯" menu): the **Active** switch · ONE **Run now** / **Stop** button (Stop while the
  served `current_occurrence` exists; Run now, the filled primary, otherwise) · **Edit** ·
  **Details** (with a `definition`) · **Archive…** (Unarchive when archived). On a narrow pane Edit,
  Details and Archive show their icon only (each keeps its name as accessible name, its hint as tooltip), the switch its state
  alone, and Run now / Stop its icon alone when the row has no room for its words: one row. Line 2: the task
  (`definition.target.input_data.prompt`), at most two lines, whole in its tooltip and in Details.
  Line 3: one row of chips (the kit's `AfChip` / `AfChipButton`, one height, an icon each, the whole
  fact in the tooltip): **flow** (`workflowName`) · **when** (`triggerWords()`: every schedule is the
  served `schedule_rule_text` verbatim, "Every 8 hours (UTC)"; "By hand"; "When mail arrives in
  me@example.org"; never a source id — a warning chip when the Gateway does not list the trigger
  source) · **next run** ("Next in 14 h", only when the Gateway serves `next_run_at` and
  `next_run_local`; the tooltip is `nextRunLabel`: "Next run: 2026-10-09 08:00 Europe/Paris (in 14
  h)") · **runs** ("21 runs") · **memory** ("Builds on earlier runs", its budget in the tooltip;
  "Starts fresh") · **model** (only when one is chosen) · **attention** ("2 unseen · 1 waiting for
  you", warning tone, only when non-zero) · **Files** (a chip calling
  `onOpenWorkspace(automation_id)` when that prop is given; the path is under Details) · the host's
  `headerChip`. Not shown any more: "Attention: nothing new", "Runs: 21", the Context sentence,
  "Now". A reason line appears only for what a person can act on: a **failed** (stopped)
  automation that can be restarted shows two lines with its Restart button: "This automation hit
  a problem and has not restarted by itself. You can restart it now." (`failed.explain`), then, on
  its own line, the served `failed_reason` verbatim (a plain fact, such as "It stopped on 7 Nov
  while starting run #38."). The explanation shows on exactly the button's condition
  (`automationControls(summary).resume.enabled`, and a host that handles the notice's action);
  without the button the served reason alone (the explanation would promise a restart nobody can
  do); `automationFailedNote(summary)` returns `{explain, reason}` or null; a
  **paused** automation's served `paused_reason` (`automationPausedNote(summary)`, warning tone); an
  **archived** one's "Archived: it does not run. Its history stays readable." Why a button is
  disabled is its tooltip and its `aria-describedby` text, never a visible line.
- **The notice carries the button that fixes it** (`automationNotice(summary, editSections)`, one
  piece for the three cases; `AutomationNoticeLine` draws it): a **failed** automation's lines
  (`text`, then `reason` on its own line) with a filled **Restart** button (`failed.restart`, tooltip `failed.restart_hint`) when the
  Gateway lists `resume`; a **paused** one with a served `paused_reason`: **Edit** opening the Edit
  dialog at the Flow section when `flow_missing` is true, otherwise **Turn back on**; an
  **archived** one: **Unarchive** when listed. Restart and Turn back on send `automation.resume`,
  Unarchive `automation.unarchive`, through the host's `onCommand` with the header's command ids
  (`useAutomationNoticeAction`: one id per action, reused on a retry after a transport failure).
  While it is sent the button is busy; a refusal shows the Gateway's own sentence in the notice,
  the button still there; success replaces the notice for 5 s with "Back on. Next run: …" (the
  served next run). The Active switch still sends the same command. The raw error a stopped
  automation died on (`failed_detail`) is never in the notice: it is under Details,
  "Technical details", as selectable text.
- **Details** (only with the `definition` prop) — the header's Details button opens the kit's
  modal (`AutomationDetailsDialog` around `AutomationDefinitionBlock`, a plain list, no fold): the
  flow with its version, task, model ("ollama / qwen3 · reasoning high · MTP depth 3", or "Workflow
  / Gateway default"), the trigger in words and its exact configuration (and a mailbox trigger's
  filters in words), context, tools (`tool_approval` auto / ask, or "Choose per tool"), where
  results go and recipients, retry policy, the automation's folder (whole path, wrapping at its
  separators), the workspaces rule (the host's `headerChip` label) and revision.
- **Needs attention** — the unseen notify and failure items, then the pending waits, labelled by
  kind ("Question for you", "Approval needed", "Waiting for an event").
- **Runs** — one chat pair per run, oldest first. The meta line reads "Run #3 · on schedule ·
  today 08:00" (the time in the automation's served zone; the Gateway's trigger summary and the
  UTC time are its tooltip); in card chrome it reads "Run #3 · on schedule" (the time is in the
  cards) with the Context button on it. A run fed by something that arrived shows a card above its task —
  "Release notes · 1 new item: “Release 0.13” · 15:13" (`occurrenceEventCard()` of the run's
  `input_data.event`); when the run's text carries the automation's task verbatim, the turn shows
  the task alone and the whole text the agent received (trigger header, framed events, JSON)
  sits behind **What the agent received**. When the host passes `onOpenContext`, each run's trigger
  turn shows ONE **Context** button instead (a quiet kit button with an icon; called with the run's
  own `runId` and its `index`) and no **What the agent received**: the host shows what the run was
  given (AbstractObserver: the earlier runs carried in, the trigger message as the agent received
  it). Hosts that do not pass it are unchanged. The response is shown once, in the answer bubble: a
  run's `notify` whose text (its body, else its title) is the answer's, both trimmed and compared
  exactly, is a delivery fact only (the "Notified" badge says it; `notifyShown(row)` is the rule);
  a notify that differs, or one on a run with no answer, shows AFTER the answer, labelled "The
  message that was sent" (`run.notify_sent`). Quiet runs are subdued; notified, failed,
  waiting and running runs carry a badge ("Notified", "Failed after 3 attempts", "Waiting for you",
  "Running"; the status is not repeated beside it). The row of the run in progress (`summary.current_occurrence.run_id`) carries its
  **live line** under the badge (see [Opening and the live line](#opening-and-the-live-line)); with
  the line shown, the "Running…" / "Waiting for your answer." placeholder is not (the run is said once). Every
  row carries `data-index` and `data-run-id`. A run that succeeded after retries reads "completed after 2 attempts". A failed run
  shows its `failure` (`reason_code`, message, "after N attempts"). The answer turn lists the
  run's artifacts (in card chrome they are the answer card's chips instead). Each pair has **Run details** (run id, attempts, "Open run ledger" through
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
- **Paused** — Run now's tooltip says a manual run works while paused and keeps it paused (no
  separate hint line).
- **Load earlier runs** appears while fewer rows than `summary.occurrence_count` are
  loaded; it calls `onLoadMore`. What the person looks at stays in place, by anchor: the click
  remembers the first run row showing in the scroll area (`scrollParentOf()`: the nearest ancestor
  that scrolls, else the page; `visibleRunAnchor()`) and its top there; once the earlier rows
  arrive, the scroll is set so that same row (`data-run-id`) has the same top
  (`anchoredScrollTop()`), whatever the button above it did meanwhile. The rows above it can keep
  changing height after that (late content: a host's "what arrived" cards, images), so the anchor is
  re-applied from a `ResizeObserver` on the run list until the person scrolls (wheel, touch, a key, a
  press on the scroll area or its scrollbar) or `EARLIER_HOLD_MS` (1 s) has passed, then disconnected.

### Opening and the live line

**Where it opens** (`openAt`, default `"attention"`; `"none"` = the host decides): decided ONCE
per opening, that is per automation the panel is given (`OpeningOnce`), on the first render that
shows its runs. What needs the person comes first, as before (the first unanswered wait's card,
else the run of the oldest unseen result, outlined for `ATTENTION_FOCUS_MS`); otherwise the START
of the newest run goes to the top of the scroll area (`openingTarget()`, `newestRunRow()`,
`NEWEST_RUN_SELECTOR`), not outlined. When the content cannot scroll that far (a short newest run,
last), the list is at its end and that run shows whole; no spacer is added (`anchoredScrollTop()`
with offset 0 states the rule; `scrollIntoView({block: "start"})` clamps the same way). A refresh, new rows, a live-line change or a wait that
arrives later never scroll again. An automation with no run is decided at once, with nothing to
scroll to.

**The live line** of a run in progress, under its "Running" badge: `2:14 · Search the web for AI
news` and, once a tool call ended, `7 steps so far`. The Gateway folds what the run does into
`summary.current_occurrence.live` (`AutomationLive`: `started_at`, `state` `starting` | `thinking`
| `tool` | `waiting`, `tool` = `{name, arguments}` while `state` is `tool`, `attempt`,
`steps_done`) on `GET /automations/{id}` only, never on the list. Between attempts it serves no
`live`: `current_occurrence.status` `"backoff"` reads "Waiting to retry (attempt 2)" (the served
`attempt`: in backoff the runtime already stores the attempt about to run; the header's "Now" says the same) and `"admitted"` reads "Starting…" (its `run_id`
is still null, so no row shows it). `automationLiveWords(current)` returns `{elapsedFrom, text,
steps}` (or null: nothing in flight, or a running occurrence the Gateway serves no `live` for,
which reads "Running" as before); a tool is the tool-call words' sentence without its options
(`describeToolCall`: verb, lead and key). A `live` the kit cannot word (an unknown `state`, a `tool`
state without its call, an unreadable `started_at`) is null too: the row reads "Running" as without a
`live`, never a guessed line and never an error that takes the panel down. `AutomationLiveLine` (`{current, nowMs?}`) renders
it: the elapsed time (`liveElapsed()`: `m:ss`, `h:mm:ss` past an hour, clamped at zero) ticks
every second on the client, the line's two rows are reserved so nothing below moves, and it is
not a live region. Other hosts (the Assistant web's "Working…" message, through `WorkflowChat`
`messageProps.renderFooter`) render the same component.

**Refresh.** The panel polls nothing. While the open automation has a `current_occurrence`, re-read
it every 3 s while the page is visible: `automationRefreshMs(summary, hostMs, visible)` returns
`LIVE_REFRESH_MS` (3000) then, else your own cadence `hostMs`.

### Controls

The controls bar leads with an **Active** switch (`AfSwitch`: on = the automation runs on its
schedule, off = paused), followed by Run now, Stop current, Edit and Archive, each an icon then
its label (`CONTROL_LABELS`, `CONTROL_ICONS` — hosts use the same names and glyphs for their own row
actions). `summary.capabilities` says what you may do (the Edit control is the `revise`
capability); the status says what applies at this moment:

| Control | Enabled when | Sends |
| --- | --- | --- |
| Active (switch) | status `active` or `paused`, with the capability of the transition (`pause` when on, `resume` when off); status `failed` when `resume` is listed (off, enabled: "turn it back on") | `automation.pause` when on, `automation.resume` when off or failed (`activeToggleCommand(summary)`) |
| Run now | status `active` or `paused`, and `current_occurrence` is `null` | `automation.run_now` (while paused it runs once; the automation stays paused) |
| Stop current | `current_occurrence` is not `null` (admitted, running — including waiting for you — or backing off) | `automation.stop_current` |
| Edit | always (subject to capability and status below) | opens the Edit form; Save calls `onRevise(changes, revision)` |
| Archive | always (subject to capability and status below) | `automation.archive`, after an in-panel confirmation |
| Unarchive (0.8.0) | status `archived` and the `unarchive` capability; shown in place of Archive on an archived automation | `automation.unarchive` (the automation comes back paused; one that had already finished or failed keeps that status) |

Every control except Unarchive is disabled while `busy`, on a legacy row, without the matching
capability, or on an archived automation; Unarchive is disabled while `busy`, on a legacy row,
without the `unarchive` capability, or when the automation is not archived (AbstractGateway
answers `409 invalid_state` to `automation.unarchive` on an automation that is not archived). The
Active switch is also unavailable once the automation has ended. A **failed** automation (it
stopped) accepts exactly what its `capabilities` list (AbstractGateway: `revise`, `resume`,
`archive`, `discuss`): Edit, Archive and Resume are enabled, and the Active switch is off and
enabled and sends `automation.resume` (the Gateway returns it active, re-armed from the resume).
A failed automation whose capabilities list none of these (an older Gateway) reads "The automation
has ended." as before. An
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

The Edit control opens `AutomationReviseForm` (`AutomationEditForm.tsx`) in the kit's modal: about 820 px
wide over a blurred backdrop, the form scrolling under its header, its action bar pinned at the bottom; a
full-screen sheet on a phone. A click on the backdrop does not close it. The Title field takes the first focus.
A host that shows the form permanently (a settings pane, AbstractCode's Workflow panel) renders the same form
inline (`presentation="inline"`, the default).

The form is a column of section cards, in this order, each a title row (an icon and the title) and at most one
hint line; a section whose options the host does not pass is absent:

| Section | Holds | Sent as |
| --- | --- | --- |
| What it does | **Title** (`summary.title`); **Task** (`definition.target.input_data.prompt`, only with `definition`, when it is text); **Flow** (with `definition` and `workflowPickerOptions`) | `changes.title`; `changes.target` (the definition's `bundle_ref` and `flow_id`, its `input_data` with the new `prompt`); a new flow: `changes.target` prepared with the chosen workflow's defaults |
| Model | `automationModelFrom(definition.target.input_data)` (only with `definition` and `modelPickerOptions`) | `changes.target` with `withAutomationModel()`; composes with a task, tool and flow change in the same save |
| Schedule | **When** (a select: Repeat · Daily · Weekly · Monthly; never "Once") and the rule's fields; an email trigger shows its check interval; an automation started by an event says "This automation starts on an event, not on a schedule." | `changes.trigger` (see below) |
| Memory | the switch **Builds on earlier runs** (`summary.context_mode` growing) and, when on, **Reads up to (tokens of its earlier runs)** | `changes.context` |
| Tools | ONE choice: **Run without asking** · **Ask before each** · **Choose per tool** (only with `definition`; the third only with `toolCatalog`) | `changes.policy` (see below), and the tool lists when a tool is turned off or on |
| Results | **Email result** and, when on, **Recipients** (Only me · Me and these addresses) (only with `definition`) | `changes.notify` |

Save stays disabled until something changed: the form is controlled and rebuilds, on each change, the
`ReviseForm` it would submit, so "changed" is exactly `reviseChanges(...) !== null`, the same rule the save
sends. Cancel, Escape and the dialog's × close at once when nothing changed; with changes they ask "Discard
your changes?" in the action bar: **Keep editing** or **Discard changes**. An open dropdown that handles Escape
keeps the form. The words are the words file's (`AUTOMATION_EDIT_WORDS.edit`).

**Schedule.** The same kind: a new interval keeps the rest of the config, a new calendar rule keeps the
automation's `time_zone`, `count` and `until`. A change of kind (Repeat to Daily / Weekly / Monthly and back,
or away from a stored Once) writes `schedule@2` with the new rule plus the kept `time_zone`, `count` and
`until`; `start_at` and `anchor` are never carried, so the Gateway re-anchors from the save: the first run is
the next calendar occurrence, or one interval after the save. Unchanged, the section shows the served
`schedule_text`; changed, the Gateway's preview of the trigger the save writes (`previewSchedule`): a calendar
rule's `schedule_text` (rule and next run) under "in Europe/Paris (this automation's time zone)", a Repeat
rule's `schedule_rule_text` and "First run: one interval after you save." The kind control is the one
the create dialog uses too (`AfScheduleKind`, a select: six kinds, so never a radio row), and the interval is the dialog's **Every** control
(`AfEveryFields`).

**Tools.** The rule of the runtime: a definition with a named `policy.tool_policy` runs by it (its listed
Auto tools run, every other tool of the run asks) and its `tool_approval` is not read. **Run without asking**
and **Ask before each** write only `policy.tool_approval`, and remove a named policy the automation had
(`tool_policy: null`; the Gateway merges `policy`). **Choose per tool** opens the kit's `ToolModeEditor`
(compact) over the host's `toolCatalog`, as the automation's layer over the Gateway's own modes (so its
"Default: …" chips name the Gateway's default truthfully). It starts from what actually runs: the named
policy when there is one (listed as listed, unmentioned = Ask, not among the automation's tools = Off), else,
with a tool list, all Auto or all Ask from the current choice (`automationToolModes()`). An automation
WITHOUT a tool list runs its flow's own tools (the agent node's `tools`, which no host can read: neither the
catalog nor the workflow list carries them), so the editor starts, as the Assistant's New form does, from the
Gateway's defaults (`inheritedToolModes(catalog, {}, "session")`) and says "Choosing per tool replaces the
flow's own tools with this selection."; any change then writes the selection as the tool list, never a silent
widening of a list that was kept. It writes the named policy, `tool_approval` "ask" when any tool asks (else
"auto"), and the tool lists (`tools`, `_runtime.allowed_tools`) when a tool was turned off or on (or, as said,
when there was no list). Untouched = nothing written: opening Choose per tool, or switching away and back,
sends nothing. Escape in its search box clears the search and goes no further. Without `toolCatalog`, an
automation with a named policy shows the two plain choices with none chosen; choosing one removes the policy.
The kit's reader for other hosts: `automationToolChoice(definition)`, `automationToolModes(catalog,
definition, all?)`, `namedToolPolicyOf()`, `perToolRevise()`.

**A flow that is not installed.** When the summary says `flow_missing` (whatever the status: the Gateway pauses
such an automation with a `paused_reason`), the Flow field reads "python-digest (not installed)", the section
says "This flow is no longer installed. Choose another one to save.", and Save stays disabled until another
flow is chosen (a save that resends a missing flow is refused); the note goes once another flow is chosen. A
host that passes no `workflowPickerOptions` gets only "This flow is no longer installed." (nothing to choose
with there).

**Hosts.** Props beyond the panel's: `presentation` ("inline" | "dialog"; the dialog needs `onCancel`),
`heading` (null hides it), `submitLabel`, `toolCatalog`, and for a host that wraps the form with its own
controls (the Assistant web: its Active switch, a title that follows the task) `title` / `onTitleChange` and
`task` / `onTaskChange` (controlled values: the host holds them, the form shows them and saves them) and
`hostChanged` (the host has an unsaved change of its own: Save is enabled and leaving asks). The tool list is
edited per tool through `toolCatalog` (the form has no `availableTools`; the panel's `availableTools` prop is
no longer read). The panel passes its own `toolCatalog` prop down.

The three kinds of things on the form never look alike: fields are inset (darker than their card, a thin
border, a focus ring); choices are a switch, `AfSegmented` (2 to 4 options) or a select (5 or more); actions are
`.af-btn` buttons, the primary one (Save) filled with the theme's accent (dimmed, still filled, while
disabled), the secondary one (Cancel, Keep editing) raised, `--danger` (Discard changes) tinted with the error
colour. Focus rings are `--info`, never the accent (red in several themes, which would read as an error).
After **Keep editing** focus returns to Cancel. A mail check without a stored interval starts on the email
default (hourly when it runs a model, else 60 s), and an automation run by hand says "This automation runs
only when someone presses Run now." The Details card reads "Choose per tool" for a named per-tool policy. See [API](./api.md).

The Model field is the kit's `ProviderModelPicker` (compact, with **Reasoning & speed** folded)
over `modelPickerOptions`: `fetchProviders`, `fetchModels`, `fetchModelCapabilities`,
`fetchGatewayDefault`, `reasoningLadder`, `defaultModeLabel` and `defaultHint`
(`AutomationModelPickerOptions`; a `createGatewayModelTransport(request)` provides the four fetchers,
and `reasoningLadder` is the list its `fetchReasoningLadder()` returns). Its first
choice reads "Workflow / Gateway default": with no model chosen, a run uses the workflow's own model
when the workflow declares one, else the Gateway's default. A host whose workflows declare none can
pass `defaultModeLabel: "Gateway default"` (the Details row uses the same words). When the
Gateway's model list for the saved provider loaded, is not empty, and does not contain the saved
model (an exact match), the field shows the warning "The gateway does not list this model. Runs may
fail until you choose another one." and the saved model reads "(not listed)". It says nothing while
the list loads, after it failed, or when the list is empty (a provider that is stopped or has no key
can answer an empty list). Choosing a provider without a model is refused with "Choose both a
provider and a model, or use the gateway default." The model is part of a save only after a change
the person made in the field: the picker's own clean-up of a stored reasoning level or MTP depth the
model rules out (`onChange` with `{automatic: true}`) does not turn a title-only edit into a model
change.

`automationModelFrom(input)` and `withAutomationModel(input, value)` are the one mapping of where
the choice is stored (`AutomationModelValue`: `{provider, model, reasoning?, speculation?}`, the
picker's value; empty provider and model = none chosen): the pair at `provider`/`model` and
`_runtime.provider`/`_runtime.model` (read from the top level first, used only as a pair),
reasoning at `_runtime.thinking`, MTP at `_runtime.speculation`, values written as given. An unset value removes its key at
both levels, an emptied `_runtime` is removed, and the input is never mutated; these are the keys
AbstractCode's automation settings write.

The form works on the automation as it was when the form opened: a refresh meanwhile (a host's
poll) changes neither its values nor what Save compares against. Save sends only the fields
changed since the form opened, once, with THAT revision as `expected_revision`, so a concurrent
change by another client is refused (`revision_conflict`, "The automation changed since this view
loaded…") instead of silently reverted; close and reopen the form to edit the new version. A
successful save closes the form; Cancel or Escape closes it (asking first when something changed). A save the
Gateway refuses is said inside the dialog too. The workspace folder is the Gateway's
and is not editable. The change applies from the next run.

By default the panel keeps the form's open state itself. A host that has its own Edit control (a
list row, a menu) passes `editOpen` and `onEditOpenChange`: the form is open exactly while
`editOpen` is `true`; the panel's Edit button asks `onEditOpenChange(true)`, and Cancel and a
successful save ask `onEditOpenChange(false)`. The form never opens on an automation that cannot
be edited (archived, legacy, or without the `revise` capability), whatever `editOpen` says.

A host that draws its own header and controls passes `hideHeader`: the panel then omits its
header (title, buttons, chips, the Details dialog) and starts at the occurrences; the section is
named by the automation's title. AbstractCode does this: its header carries the Active
switch, the timing line (`automationTiming()`), Run now, Stop, Edit and Archive.

### Attention and `/seen`

Loading or mounting the panel never acknowledges attention. A shared content marker waits
250 ms at the end of a notice or its loaded answer, in the focused, visible document and without
an obscuring surface. The panel calls `onSeen(cursor)` only for the consecutive oldest-first
prefix of attention items consumed this way. Scrolling to a later result cannot clear earlier
unseen notices. It never sends `summary.attention.cursor` merely because that summary loaded.

A cursor counts as acknowledged only after `onSeen` resolves. A failed call is retried on the
next render carrying a fresh `summary` object (the next poll), never in a local retry loop.
Changing automations resets consumption and cancels pending visibility timers. Human waits
remain live until answered; a seen receipt does not authorize or resolve them.

Conversation and automation markers use the same visibility implementation. Published-package
consumers receive the fix with the UI kit; compatibility snapshots also include the canonical
`automation_panel.js` implementation for clients whose installed peer predates this behavior.

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

## List groups: Failed and Paused

A list of automations draws the main list, then **Failed · N** and **Paused · N**, each a fold.
"Failed" means the automation itself stopped; an active automation whose last run failed stays in
the main list with its red mark. Folding Failed is the "hide failed automations" option.

```tsx
import { automationGroups, AutomationGroupFold, readAutomationGroupOpen, writeAutomationGroupOpen } from "@abstractframework/ui-kit";

const groups = automationGroups(page.items, page);   // {active, failed, paused}: {rows, count}
const [failedOpen, setFailedOpen] = useState(() => readAutomationGroupOpen("observer", "failed"));

<ul>{groups.active.rows.map(row)}</ul>
<AutomationGroupFold group="failed" count={groups.failed.count} open={failedOpen}
  onToggle={(open) => { setFailedOpen(open); writeAutomationGroupOpen("observer", "failed", open); }}>
  <ul>{groups.failed.rows.map(row)}</ul>
</AutomationGroupFold>
```

- `automationGroups(rows, page?)` keeps the served order and decides nothing else: a row is in
  Failed when `section === "failed"` or `status === "failed"`, in Paused when `section ===
  "paused"` (a Gateway that serves no `section` has no Paused group, as before), and every other
  row (`completed`, and archived rows when the host shows them) is in `active`. Failed and Paused
  count the served `failed_automations_count` / `paused_automations_count`, else their rows; a group
  with no rows counts 0.
- `AutomationGroupFold` (`AutomationGroupFoldProps`: `group` `"failed"` | `"paused"`, `count`,
  `open`, `onToggle(open)`, `children`, `className`) is absent at zero; its header button
  (`aria-expanded`, `aria-controls`, `data-action="fold-failed"`) reads `automationGroupLabel()`
  ("Failed · 2", "Paused · 3"); the host's rows show only while it is open. Controlled: the host
  holds `open`. Its header is the kit's ONE generic fold header, `AfFoldToggle`
  (`AfFoldToggleProps`: `open`, `onToggle()`, `controls`, `className`, `chevronClassName`, `icon`,
  `action`, `title`, `children`), which hosts' own list disclosures wrap too (AbstractObserver's
  `ListDisclosure`).
- `readAutomationGroupOpen(app, group, storage?)` / `writeAutomationGroupOpen(app, group, open,
  storage?)` remember the person's choice per app and group in `localStorage`
  (`automationGroupOpenKey()`); blocked storage reads the default, `AUTOMATION_GROUP_DEFAULT_OPEN`:
  Failed open, Paused folded.

## Shared words

`ui-kit/src/automations/automation_edit_words.json` holds the words every client says when editing
an automation, for its Failed group and for the live line (`AUTOMATION_EDIT_WORDS`, typed as
`AutomationEditWords`). The kit's Model field reads its sentences from it ("Workflow / Gateway
default", "The gateway does not list this model. …", "(not listed)", "Choose both a provider and a
model, or use the gateway default."), and the whole Edit form reads its own from it: section titles and
hints, field labels, the tools choices, the apply note, the Discard question, "(not installed)",
"First run: one interval after you save.", "Title is required." / "Task is required." (`reviseChanges`;
a title has no length limit: a stored title of any length shows whole and an untouched form saves nothing)
and the model discovery sentences (`edit.model_errors`, handed to the picker as `errorWords`; the Failed
fold's `groups.remember_failed` is there for hosts too). `run.notify_sent` labels a sent message that is
not the answer; `context.*` are the words of a run's **Context** (the button, its tooltip, and the host's
view of what the run was given: `title`, `loading`, `failed`, `builds_on`, `builds_on_no_numbers`,
`starts_fresh`, `count_differs`, `instructions`, `system`, `context_task`, `earlier`, `from_task`,
`from_answer`, `trigger`, `details`, `model`, `tools`, `no_tools`, `raw`). Clients that cannot import the kit (the Qt Assistant) vendor
it byte for byte, with a byte-identity test of their own. A new client-visible word goes in this
file first; existing words are never renamed. Schedule words stay in `automation_controls.json`.

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
- **Title and limits** — title (default: the task's first line, cut at 120 characters; a title you
  type has no length limit); for
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
| `listAutomations({status?, cursor?, limit?})` → `AutomationsPage` (rows with `section` and `last_activity_at`, plus `paused_automations_count`, `archived_automations_count`) | `GET /api/gateway/automations` |
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
- A 401 without that envelope throws `code: "unauthorized"`, with the refusal's own sentence as
  the message: the app server's proxy answers `{"detail": "Gateway sign-in required"}` when the
  browser has no session, and the Gateway's `/apps/<id>/` mount answers
  `{"reason": "app_sign_in_required", "message": "Open <App> from the gateway console to sign in."}`
  once the app's session ended (a password change ends every other session of the account). Both
  refuse before the Gateway's automation routes run.
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

- `AutomationChat` (`AutomationChatProps`), `automationChatMessages(rows, {current, inputs})`,
  `automationWaitInteraction(rows, answer)`, `automationTaskMessageId(runId)`,
  `automationAnswerMessageId(runId)`, `AUTOMATION_NOTE_KIND`: an automation's runs as the shared chat
  thread (see "An automation as a chat" above).
- `AutomationPanelWithMarkdown` (`AutomationPanelWithMarkdownProps` = `AutomationPanelProps`
  without `renderText` / `renderTurn` / `turnChrome`, plus `fetchGateway`, `messageProps`,
  `answerFooter(turn)`, `readRunContext`), `automationRenderers` (`{renderText, renderTurn}`),
  `renderAutomationText(text)` and `renderAutomationTurn(turn)` (+ `AUTOMATION_TURN_TITLES`)
  wire the kit's `AutomationPanel` to the chat (`ChatMessageCard` per turn,
  `ChatMessageContent` for other text, images as links). A card-chrome turn renders as
  `AutomationTurnCard` (its message: `automationTurnMessage(turn, inputs)`; the run's handed files:
  `runInputFiles(fetch, runId)`, read once per run).
- `RunContextDialog` (`target`, `read`, `onClose`, `runIndex?`), `RunContextBody`, `runContextView()`,
  `runContextSummarySentence()`, `carriedMessage()` — the **Context** of a run (moved from
  AbstractObserver): the window's receipt in one sentence, the earlier runs carried in as chat cards
  (labelled "The task · Run #3" when the message's `metadata.run_id` is a run the host numbers; the
  history window's "older messages were left out" marker from the message's `history_window`), this
  run's trigger message as the agent received it, the model and tools, and the raw inputs in the
  chat's `JsonViewer`.
- `WorkspaceBrowser` browses a run's folder on the gateway host (list, open, download) through
  the host's credentialed `fetchGateway(path, init)`; give it `runId = automation_id` for the
  automation's folder, a discussion's run id for the discussion's own folder. See
  [API: panel-chat](./api.md#abstractframeworkpanel-chat).
- `presentInteraction(wait, controller, options?)` turns a discussion's pending wait into the
  `WorkflowChat` control (tool approval, question, event).
- `WorkflowChat` / `ChatThread` `openAt={{key, messageId}}` (panel-chat 0.9.16) opens a thread of an
  automation's runs at a message instead of at the bottom: the newest run's first ("Task") message,
  or the one that needs the person. Decided once per `key` (the automation's id): the first render
  that carries the message puts it at the top of the thread; nothing scrolls the thread after that
  until the person scrolls to the bottom themselves, which brings the usual following back. Absent,
  every chat is as before (the markup is the same either way). The live line goes in the run's
  "Working…" message through `messageProps.renderFooter` with ui-kit's `AutomationLiveLine`.

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

Shared case files live next to them (new cases are new files; the six contract files and
`CHECKSUMS.sha256` stay as they are): `automation_model_cases.json` holds the read and write cases
of the model mapping (`automationModelFrom` / `withAutomationModel`), which every port (TypeScript,
Python) passes; `check_automation_model_cases.mjs` runs them all.

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
`check_automation_panel.mjs` (rendering, handlers and the pure rules), `check_automation_model_cases.mjs`
(the shared model cases), `check_automation_groups_live.mjs` (words, list groups and folds, the live
line, the refresh delay), `check_automation_open_failed.mjs` (opening on the latest run, the live
line in the panel, a failed automation's controls and header), and panel-chat's
`scripts/check_automation_badges.mjs`, `check_automation_markdown.mjs` and `check_chat_open_at.mjs`.

## Exports

From `@abstractframework/ui-kit` (source: `ui-kit/src/automations/`):

- **The header card and the chat's rules**: `AutomationHeaderCard` (`AutomationHeaderCardProps`),
  `automationEditSections()` (`AutomationEditSection`), `automationRunTask()`,
  `automationTriggerFrame()`, `automationOpening()`, `unseenRuns()`, `VisibleContentMarker`.
- **Components**: `AutomationPanel` (`AutomationPanelProps`), `AutomationStateLabel` (state
  word then icon), `AfScheduleDialog` (`AfScheduleDialogProps`), `AfEmailSetupNotice`,
  `AfEmailTriggerFields`, `AfEmailOptionsFields` (with their `…Props`), `CONTROL_LABELS`,
  `CONTROL_ICONS` and `CONTROL_HINTS` (each control's name, kit icon and tooltip),
  `controlHint()`, `RUN_NOW_ONE_LINE`, `RUN_NOW_NEXT_RUN_LINE`, `RUN_NOW_GROWING_LINE`,
  `RUN_NOW_GLYPH`, `DISCUSS_LABEL` ("Discuss this run"), `RECEIVED_LABEL`, `notifyShown()`,
  `STATUS_LABELS`, `STATUS_ICONS`, `plainTextRenderer` (the fallback), types `RenderText`,
  `RenderTurn`, `AutomationTurn`; `AutomationLiveLine` (`AutomationLiveLineProps`),
  `AutomationGroupFold` (`AutomationGroupFoldProps`), `AfFoldToggle` (`AfFoldToggleProps`), `automationFailedNote()`,
  `automationPausedNote()`, `OPENING_HOLD_MS`, type `AutomationHeaderChip`;
  `AutomationReviseForm` (`AutomationReviseFormProps`, `AutomationModelPickerOptions`), `automationModelWords()`.
- **Edit form pieces**: `AfScheduleKind` (`ScheduleKindOption`; the one select of the create dialog and Edit),
  `AfEveryFields` (`EveryUnit`, `EVERY_UNITS`), `editScheduleKinds()`; the tools reader `automationToolChoice()`
  (`AutomationToolChoice`), `automationToolModes()`, `namedToolPolicyOf()`, `namedToolPolicyFromModes()`,
  `toolsOnOf()`, `perToolRevise()`; type `AutomationNamedToolPolicy`. `AfSegmented` lives with the kit's controls.
- **Opening** (spec "open on the latest run"): `openingTarget()`, `newestRunRow()`,
  `NEWEST_RUN_SELECTOR`, `OpeningOnce`, `attentionTarget()`, `ATTENTION_FOCUS_MS`,
  `scrollParentOf()`, `visibleRunAnchor()` (`RunRowPlace`), `anchoredScrollTop()`, `EARLIER_HOLD_MS`.
- **List groups and live line** (pure): `automationGroups()` (`AutomationGroups`, `AutomationGroup`,
  `AutomationGroupId`, `AutomationFoldGroup`), `automationGroupLabel()`,
  `readAutomationGroupOpen()`, `writeAutomationGroupOpen()`, `automationGroupOpenKey()`,
  `AUTOMATION_GROUP_DEFAULT_OPEN`, `automationLiveWords()` (`AutomationLiveWords`),
  `liveElapsed()`, `automationRefreshMs()`, `LIVE_REFRESH_MS`, `AUTOMATION_EDIT_WORDS`
  (`AutomationEditWords`).
- **When editor and time zone** (round 16): `AfCalendarRuleFields` (Daily / Weekly day chips /
  Monthly day + time), `AfServedSchedule` (the Gateway's `first_run_sentence` with the
  time-zone line, loading and error states), `AfTimeZoneLine`, `useSchedulePreview()`
  (debounced, latest answer wins; `PreviewSchedule`, `PreviewState`), `CalendarRuleState` with
  `calendarRuleOf()`, `withCalendarRule()`, `calendarStateOf()`, `DEFAULT_CALENDAR_STATE`,
  `calendarWhenOf()`, `AfTimeZonePicker` (`TimeZonePreference`, `timeZoneOptions()`,
  `TIME_ZONE_GATEWAY_DEFAULT`).
- **Client**: `createAutomationsClient()`, `AutomationApiError`, `parseApiError()`,
  `AUTOMATIONS_PATH`, `TRIGGER_SOURCES_PATH`, `MY_EMAIL_PATH`, `SCHEDULE_PREVIEW_PATH`
  (`previewSchedule(trigger)`), `TRIGGER_CONNECTIONS_PATH` (`listTriggerConnections()`),
  `MY_MAILBOXES_PATH` (`listMailboxes()`); types `AutomationsClient`, `TriggerConnection`, `Mailbox`,
  `AutomationsClientOptions`, `ListAutomationsQuery`, `PageQuery`.
- **Presentation rules** (pure functions, no React): `automationControls()`
  (`ControlId`, `ControlState`), `activeToggleCommand()`, `CONTROL_COMMANDS`, `occurrenceViews()` (`OccurrenceView`,
  `OccurrenceTone`), `attentionAckCursor()`, `attentionLabel()`, `triggerSummary()` (= `triggerWords()`),
  triggers in words: `triggerWords(trigger, connections, mailboxes, served)`, `triggerSourceName()`,
  `mailboxName()`, `connectionSentence()`, `connectionKind()`, `isEventTrigger()`,
  `occurrenceEventCard()` (`OccurrenceEventCard`), `whenWords()` (a past instant in the served
  zone: "15:13", "today 15:13", "yesterday 15:13"), `TRIGGER_WORDS_TEXT`, `NEXT_RUN_WORDS`,
  `scheduleLabel()`, `intervalLabel()`, `contextLabel()`, `formatUtc()`, `parseDuration()`,
  `reviseFormFrom()` and `reviseChanges()` (`ReviseForm`, `ReviseDefinition`), `automationModelFrom()` and
  `withAutomationModel()` (`AutomationModelValue`), `buildCreateRequest()` (`ScheduleForm`, `ScheduleWhen`),
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
  `AutomationStatus`, `AutomationSection`, `AutomationLive`, `AutomationLiveState`,
  `CurrentOccurrence`, `AutomationAttention`, `AttentionItem`, `AttentionWait`,
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
`renderAutomationTurn()`, `AUTOMATION_TURN_TITLES`, `AutomationTurnCard`, `automationTurnMessage()`,
`runInputFiles()`; `run_context.tsx`: `RunContextDialog`, `RunContextBody`, `runContextView()`,
`runContextSummarySentence()`, `carriedMessage()` (types `RunContextReader`, `RunContextTarget`,
`RunContextData`, `RunContextState`, `RunContextSummary`, `CarriedMessage`); `internalArtifactMetadata()`.

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
