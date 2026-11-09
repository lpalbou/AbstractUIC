# @abstractframework/panel-chat

Chat UI for AbstractFramework apps: the one chat surface (`WorkflowChat` over a transport-injected
`WorkflowSessionController`), questions and approvals with one wording set, attachments and
generated media, a chat's tool policy stored on the gateway, the Docs assistant and the app
assistant, the workspace browser and file preview, and the thread, message cards, composer and
lightweight Markdown/JSON renderers they are built from. Each job has one component, composed on
the gateway's contracts and customized through props and slots
([ADR 0001](../docs/adr/0001_shared_primitives_composed_on_gateway_contracts.md); the job table is
the [Adoption guide](../docs/adoption-guide.md)).

## Peer dependencies

Declared in `panel-chat/package.json`:

- `react@^18`, `react-dom@^18`
- `@abstractframework/ui-kit` `^0.9.15` (icons, the responsive tokens, `AfFileViewer` / relative time for the workspace browser and `FileViewer`, `AfAudioPlayer` for audio previews and chat media, `AfDrawerSystem` panels, and the session tool-policy client types). Upgrade the two packages together: panel-chat 0.8.1 needs ui-kit `^0.9.13` (AbstractUIC 0.10.1 ships ui-kit 0.9.14).

## Install

- Workspace: add a dependency on `@abstractframework/panel-chat`
- npm: `npm i @abstractframework/panel-chat`

## Exported API

See `panel-chat/src/index.ts` for the authoritative export list. Common entry points:

- Components: `ChatThread`, `ChatComposer`, `ChatMessageCard`, `ChatMessageContent`
- Docs assistant: `DocsAssistantDrawer` (the console's and every app's, on the gateway's docs-qa workflow; see below)
- App assistant: `AssistantPanel` (injected `ask` transport; see below)
- Controlled workflow surface: `WorkflowChat`, `WorkflowInteractionPanel` and the `WorkflowInteraction` union
- Transport-injected runtime: `WorkflowSessionController`, `useWorkflowSession`, `WorkflowTransport`,
  `workflowPendingInteraction`, `resolveWorkflowEventTarget`
- Live replies: `llmDeltaFromSse`, `validateLlmDeltaEvent`, `isLlmDeltaEnd`,
  `describeStreamUnavailable`, `streamRepliesRuntime`, `LLM_DELTA_EVENT`, `LLM_DELTA_END_EVENT`
  (see [Live replies](#live-replies-streaming))
- File drop and paste: `onFiles` on `WorkflowChat`; helpers `droppedFiles`, `pastedFiles`,
  `folderRefusal`, `dragCarriesFiles`, `draggedFileCount`, `dropZoneLabel`, `pastedFileName`,
  `DragPresence`
- Renderers: `Markdown` (with `sameOriginImage` as the default image rule for `images="link"`), `JsonViewer`
- Files (0.3.1): `WorkspaceBrowser` (rows: name, size, generated date, download icon; a click previews the file in place; the root once as a short name with Open folder / Copy path icons; `fileActions` for host actions), `FileViewer` (ui-kit `AfFileViewer` + `Markdown`; audio files play in the kit's waveform `AfAudioPlayer`), `useWorkspaceFilePreview` (bounded loader through the host's `fetchGateway`; images, audio and PDF as object URLs)
- Tool and run evidence: `ToolActivity`, `ToolActivityGroup`, `toolArguments`, `toolPreview`,
  `toolSandbox`, `ToolSandboxLine` (the command sandbox of a call from the ledger's
  `output.sandbox`: one line such as `Sandbox: macOS sandbox-exec · 3 workspaces enforced` or
  `Sandbox: none — refused`, then the enforced paths; `ToolActivity` shows it in the detail),
  `workflowProgress`, `workflowEvidence`, `foldWorkflowTools`, `historyRecords`,
  `statDetail`, `StatDetailPanel`
- Types: `ChatMessage`, `ChatLiveReply`, `ChatAttachment`, `ChatMessageLevel`, `ChatStat`,
  `LlmDelta`, `LlmDeltaEnd`, `StreamRepliesMode`, `WorkflowSessionSnapshot`
- Utils: `chatToMarkdown`, `copyText`, `downloadTextFile`, `tryParseJson`
- One chat surface: `WorkflowChat` `steer` / `toolbar` / `attachmentItems`,
  `ComposerAttachmentChips`, `useAttachmentUploads` (see [One chat surface](#one-chat-surface))
- Questions and approvals: `presentInteraction`, `WORKFLOW_INTERACTION_LABELS`,
  `ReplayInteraction` (see [Questions and approvals](#questions-and-approvals))
- Replay view (0.6.0): `WorkflowTransport.replayView`, `createReplayViewTransport`,
  `applyDelta`, `ReplayViewFold`, `SseParser`, `projectReplayView`, `workflowSourceLabel` (see
  [Replay view](#replay-view-the-gateways-reconstruction))
- A chat's tool policy on the gateway: the `WorkflowSessionController` option `sessionToolPolicy`
  (a ui-kit `SessionToolPolicyClient`), `sessionPolicyStatus()`, `toolPolicyDecision`,
  `toolPolicyDecisionText`, `sessionPolicyClampedText` (see
  [Session tool policy](#session-tool-policy-stored-on-the-gateway))
- Drawer-system panels: `docsAssistantPanel`, `DocsAssistantPanelContent`, `assistantDrawerPanel`
  (see [Docs assistant](#docs-assistant) and [App assistant](#app-assistant))
- Generated media: `ChatMedia` kind `"file"` and audio `transcript`,
  `chatMediaFromArtifact`, `chatMediaForArtifacts`, `WorkflowTransport.resolveArtifact`
  (see [Attachments and generated media](#attachments-and-generated-media))
- Automations: `ScheduleThisAction` (a "Schedule this…" button for a chat header slot) and
  `FromAutomationBadge` — see [Automations](../docs/automations.md#panel-chat-pieces)
- `@` mentions: `ChatComposer` / `WorkflowChat` `mentionCandidates`, `mentions` / `onMentionsChange`,
  `mentionNotice`, `mentionSessionKey`, `mentionStatus`, `mentionsUnavailable`; `onSend` carries
  `{text, mentions}`; helpers `mentionSendPayload`, `mentionResend`, `mentionsAfterSend`,
  `mentionsStoppedError`, `unsentMentionsOf`, `uniqueMentions` (see
  [Mentioning entities and agents](#mentioning-entities-and-agents))
- Who answered: `ChatMessage.author` (`ChatAuthor`), `chatAuthorOf`, `chatAuthorView`, `ChatAuthorMark`
  (see [Who answered](#who-answered))

## Usage (typical)

```tsx
import React, { useState } from "react";
import { ChatThread, ChatComposer, type ChatMessage } from "@abstractframework/panel-chat";

export function ChatView() {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <>
      <ChatThread messages={messages} autoScroll />
      <ChatComposer value={value} onChange={setValue} onSubmit={() => setMessages((m) => [...m, { role: "user", content: value }])} />
    </>
  );
}
```

### The composer

`ChatComposer` is a rounded multiline box with a circular Send button. It starts
at two rows, honors an explicit `rows`, grows for several lines, then scrolls
within a viewport cap; it also grows on browsers without native `field-sizing`
support. Pass `variant="legacy"` to `ChatComposer`, or `composerVariant="legacy"`
to `WorkflowChat`, for the flat three-row layout with a text Send button.
`variant="compact"` is accepted as an alias of the default.

Slots: `leading` renders above the field (attachment chips), `actions` renders on
the left of the action row, `trailingActions` renders on the right beside Send
(voice controls, Stop), and `overlay` covers the box (a drop zone). Pass `onAttach`
and the composer renders the Attach button itself (`attachLabel`, `attachDisabled`,
`attachPending`); `WorkflowChat` wires its `onAttach` and `composerTrailingActions`
the same way. `submitKey="mod-enter"` keeps chats that submit with Ctrl/Cmd+Enter;
`canSubmit` lets a host enable Send for an attachment-only payload; `textareaId`
and `ariaDescribedBy` connect a host label and help text to the field.

Send and busy labels remain the button's accessible name. Enter
submits, Shift+Enter adds a line, and IME composition does not submit. Switching
the variant preserves the controlled draft and the textarea node; the host still
owns submission, attachments and failed-send recovery.

### Mentioning entities and agents

Pass `mentionCandidates(query)` and the composer lets the person mention someone by name:
typing `@` opens a list of the names your host returns, and a pick becomes a chip. The kit
sends nothing itself; your host posts each mention (on AbstractGateway,
`POST /api/gateway/sessions/{session_id}/mentions`, one at a time, in `index` order) and writes
the sentences the composer shows. Without `mentionCandidates` the composer has no list and no
chips. `ChatComposer` takes the props below. `WorkflowChat` takes `mentionCandidates`,
`mentionNotice`, `mentionSessionKey`, `mentionStatus` and `mentionsUnavailable`, keeps the chips
itself, and hands them to `onSend(draft, {signal, mentions})` and `steer.onSteer(text, mode, {mentions})`.

| `ChatComposer` prop | What it does |
|---|---|
| `mentionCandidates?: (query) => Promise<ChatMentionCandidate[]>` | The names to offer for the text typed after `@` (for example the entities `GET /api/gateway/entities` returns for the account). It is called as the person types, so cache the source in the host. |
| `mentions?: ChatMention[]`, `onMentionsChange?(mentions)` | Controlled chips. Omit `mentions` to let the composer keep them. |
| `onSend?: (send: ChatComposerSend) => void \| Promise<unknown>` | Send with the picks: `{text, mentions: [{id, name, kind, index}]}`, `text` exactly as typed, `mentions` in pick order, `index` the gateway's `mention_index` (0, 1, …). Wins over `onSubmit`. |
| `mentionNotice?(candidate) => string \| null` | The sentence shown under a chip the first time its name is picked in this conversation, such as "Castor will read this conversation's history." |
| `mentionSessionKey?: string` | The conversation that "first time" counts in (the session id); a new key starts over. |
| `mentionStatus?: string \| null` | Your sentence about the last mentions sent ("Castor is in another conversation."), shown above the field until you clear it. |
| `mentionsUnavailable?: string \| null` | Your sentence when mentions cannot be used here, such as "This gateway does not offer mentions yet." Typing `@` then shows it instead of names, no new chip can be picked, and chips picked earlier are not sent. |

A candidate is `ChatMentionCandidate = {id, name, kind: "entity" | "agent", avatar?: {style, color} | null, hint?}`
(`hint` is a short second line in the list). `usableCandidates(value)` keeps the rows that have an
id, a name and a known kind, each once.

**The list.** It opens when the `@` starts the text or follows a space and only non-space characters
sit between it and the caret (`mentionTriggerAt`), so `me@host` does not open it; it follows at most
`MENTION_QUERY_MAX` (48) characters. Arrow keys move, Enter or Tab picks, Escape closes the list
only, and the pointer works too; at phone width the list spans the composer. While the names load
it reads "Looking for names…" and Enter waits instead of sending the typed `@…` as text. It also
reads "The names could not be loaded.", "No name matches “cas”.", "No one to mention here." or, when
every match is already a chip, "Already mentioned."

**Chips.** A pick replaces the typed `@query` with a chip bound to that candidate (`@Castor`, with
Remove), never editable text, and each name is one chip. An `@` that was not picked stays plain
text: the kit never reads `@` out of the text on send.

**What happens to the chips when a send settles.** The chips a send carried are removed once
`onSend` returns or its promise resolves; a throw or a rejection keeps them all. A send whose
mentions stopped partway (an entity could not answer) names the chips to keep as `unsentMentions`
on the value it resolves with or the error it rejects with (build the error with
`mentionsStoppedError(sentence, unsent)`): only those stay, ready for the resend. Chips picked
while a send is in flight are not that send's, so they stay when it settles. A steer that resolves
naming `unsentMentions` keeps the words in the draft as well. With controlled `mentions` you apply
these rules yourself with the same helpers.

```tsx
<WorkflowChat
  messages={snapshot.messages}
  draft={draft}
  onDraftChange={setDraft}
  mentionCandidates={async (query) => matchNames(await loadEntityNames(), query)}
  mentionNotice={(c) => (c.kind === "entity" ? `${c.name} will read this conversation's history.` : null)}
  mentionSessionKey={sessionId}
  mentionStatus={mentionStatus}
  mentionsUnavailable={routeMissing ? "This gateway does not offer mentions yet." : null}
  onSend={async (text, { signal, mentions }) => {
    const turn = await startTurn(text, signal);
    // Ask each mention in order, the next once the previous answered.
    const outcome = await askMentions(sessionId, text, uniqueMentions(mentions), { repeatOf: turn, signal });
    if (outcome.stopped) throw mentionsStoppedError(outcome.sentence, outcome.unsent);
    setDraft("");
  }}
/>
```

Here `loadEntityNames`, `matchNames`, `startTurn` and `askMentions` are your host's code.

Helpers for hosts:

- `mentionSendPayload(text, mentions)` builds the send; `uniqueMentions(mentions)` keeps each name
  once, the first keeping its place and `index`.
- `unsentMentionsOf(settled)` reads `unsentMentions` from a value or an error (null when it names
  none); `mentionsStoppedError(sentence, unsent)` builds that error.
- `mentionsAfterSend(now, sent, keep?)` returns the chips once a send settled (the send's chips go,
  except `keep`; chips picked meanwhile stay).
- `mentionResend(pending, text, mentions)`: after a stop, keep `pending: MentionResend` =
  `{text, repeatOf, unsent}`. When the person sends the same words again (trimmed) with chips, it
  returns the mentions to ask: only those chips, each once, an unsent chip with its first `index`,
  a chip added since numbered after them. Any other words return null: a new message. Your host
  then asks only those, with the same `repeat_of`, and starts no new turn.
- `mentionTriggerAt`, `applyMentionPick`, `addMention`, `removeMention`, `mentionKey`,
  `moveMentionActive`, `usableCandidates`, `MENTION_QUERY_MAX`.
- Types: `ChatComposerSend`, `ChatMention`, `ChatMentionCandidate`, `ChatMentionKind`,
  `ChatMentionSent`, `ChatMentionsUnsent`, `MentionResend`, `MentionTrigger`.

### Who answered

`ChatMessage.author?: ChatAuthor | null` takes the gateway's turn author unchanged:
`ChatAuthor = {kind: "entity" | "agent" | "person", name, entity_id, identity_ref, avatar: {style, color} | null}`,
every field present (null when unknown). On an assistant-side message the header shows the
author's mark, its name and a small kind tag ("entity" or "agent"; none for a person). An entity's
mark is its orb, drawn by ui-kit's `ActivityAvatar` in its design and colour, or its initial on a
disc tinted by its colour when it has no design; an agent shows the agent mark. Without an author
(null or absent, as from an older gateway) the header is unchanged: `title || "Agent"` and no mark.
User messages ignore `author`. `projectReplayView` carries each view message's `author` through.

- `chatAuthorOf(value)` returns a `ChatAuthor` or null; an unknown kind is refused, so the card
  renders as it does without an author. `chatAvatarLookOf(value)` reads a look.
- `chatAuthorView(author, title?)` returns what the header shows, `{name, tag, mark, look, initial}`,
  or null without an author; the name falls back to `title`, then "Entity", "Agent" or "Someone".
- `ChatAuthorMark({mark, look?, initial?, size, className?})` draws the same mark for your own
  surfaces (a session list, a header). It is decorative: the name beside it is the accessible text.
- Types: `ChatAuthor`, `ChatAuthorKind`, `ChatAuthorMarkKind`, `ChatAuthorView`, `ChatAvatarLook`,
  `ChatAuthorMarkProps`.

Apps that vendor `src/conversation.ts` get `ChatComposer`, `mentionSendPayload`, `mentionResend`,
`mentionsStoppedError`, `uniqueMentions`, `unsentMentionsOf`, the mention types, `chatAuthorOf`,
`chatAuthorView`, `ChatAuthorMark` and the author types from that entry.

## Docs assistant

`DocsAssistantDrawer` (0.4.0) is the ONE Docs assistant: the AbstractGateway console mounts it
through the islands bundle (`mountDocsAssistant`) and every app mounts it in React, opened from the
top bar's `docs` slot (book icon). Pass `source: { app, name }` (`app` = `gateway` or the app id),
the host's `fetchGateway(path, init)` (relative `api/gateway/...` paths with the host's
credentials) and `connected`. It reads the app's llms.txt from `GET api/gateway/docs/corpus?app=<id>`,
uploads attachments to the conversation's session, offers the kit dictation microphone beside Send when the gateway transcribes (the transcript lands in the draft), starts the gateway's shipped `docs-qa` workflow
(`{prompt, docs, app}`, `use_session_history`, `context.attachments`), grows the reply from the run's
`llm.delta` frames while polling the run, and shows the completed `output.response`. User messages
sit on the right and answers on the left with Markdown, code, JSON, links and copy; the header
has an icon-only **New conversation** and close; one footer line names the grounding. Keep it
mounted while closed. No corpus is an error message, never an ungrounded answer.

```tsx
<DocsAssistantDrawer open={open} onClose={close} source={{ app: "code", name: "AbstractCode" }}
  fetchGateway={(path, init) => fetch(path, { ...init, credentials: "same-origin" })} connected={connected} />
```

In the kit's `AfDrawerSystem` (or `AfAppShell`'s `drawers`), mount the same conversation as a
panel: `docsAssistantPanel(source, fetchGateway, { connected })` returns an `AfDrawerPanel` (drawer
mode, kept alive) whose header actions (Past conversations, New conversation) sit in the panel
header; toggle it from the top bar's `docs` button by making `"docs"` the active panel.

## App assistant

`AssistantPanel` is the docs Q&A surface an app places in the kit's `AfDrawer`
(opened from `AfTopBarActions`). It never fetches: pass an `ask(question, { signal, history })`
transport that returns a `Promise<string>` or an `AsyncIterable<string>` of deltas. Optional
props: `assistantName`, `suggestions`, `emptyState`, `placeholder`, `blockedNotice` (disables
the composer and shows the notice, e.g. while disconnected) and a controlled
`messages` / `onMessagesChange` pair. See the
[Adoption guide](../docs/adoption-guide.md). In an `AfDrawerSystem`, `assistantDrawerPanel({ ask,
assistantName })` returns it as a kept-alive drawer-mode panel.

## Workflow chat

`WorkflowChat` is a controlled, presentation-only surface for hosts that own
their own gateway/workflow protocol. Supply `messages`, `draft`,
`onDraftChange`, and async `onSend`; the component retains the draft when a
send fails and presents an actionable retry. `busy` and `onCancel` add a stop
control. `disabled` gives observers a read-only transcript without hiding a
pending interaction. `onFiles(files)` turns on dropping files on the chat and
pasting them into the message field; folders are refused with a visible
message, and upload, size policy and attachment chips (`attachments`) stay with
the host.

Use `interaction` for a pending `WorkflowInteraction`: `ask-user` supports
choices and optional free text, `tool-approval` provides approve/deny actions,
and `event-wait` sends a host-defined payload. The callbacks are injected: the
component never starts or resumes a workflow itself. Its optional `artifactFetch` transport
performs authenticated attachment reads only; execution remains host-owned.

`renderMarkdown` is passed through to each `ChatThread` message card. Use it
when the host owns a sanitizer or a richer Markdown renderer; the chat surface
does not make a separate unsafe rendering path.

The composer is controlled. Clear `draft` in the host only after `onSend`
resolves; a rejected callback retains it and the component offers a retry.
Set `sendWhileBusy` to permit an explicit queue/steer mode during a running
workflow while retaining the Stop control. Otherwise `busy` disables sending.

For hosts that need a reusable gateway-facing controller, `WorkflowSessionController`
and `useWorkflowSession` consume an injected `WorkflowTransport`. They retain no
gateway URL, bearer token, or browser persistence. Pass a non-secret `authScopeKey`
that changes on sign-in/out or account switching to reset the controller safely.

`useWorkflowSession({ transport, runId, authScopeKey })` returns `{ controller,
snapshot }`. `transport` owns requests, SSE parsing, and ephemeral credentials;
the controller owns no URL, header, localStorage, or bearer token. The snapshot
contains lifecycle `status`, optional workflow-provided `displayStatus`, folded
messages, records, a pending raw wait, and connection/error state. Render
`workflowPendingInteraction(snapshot)`, not the raw `snapshot.interaction`: a
tool approval the controller has already granted under the host's
`toolApprovalPolicy` (or an accepted Allow) sets `snapshot.toolApprovalGranted`,
is presented as running tools, and must not show an approval card. See
[`examples/workflow_assistant.tsx`](examples/workflow_assistant.tsx) for a small
embedded consumer that maps raw waits to `WorkflowInteraction`. Its required
`onSend(message)` prop remains host-owned: it may start, steer, or durably queue
a turn, but the shared component never invents an event or command vocabulary.
Event waits use `resolveWorkflowEventTarget(rawWait, records, run)` to recover
the exact canonical scope from matching ledger evidence; an ambiguous wait is
shown as unavailable rather than guessed.

### One chat surface

`WorkflowChat` is the one chat surface (ADR 0001, backlog 0030). Steering, attachment chips,
the toolbar and per-message slots are props; each control appears only when the host injects it.

```tsx
const uploads = useAttachmentUploads({ upload: (file) => gateway.attachmentsUpload(sessionId, file), maxBytes: policy.maxAttachmentBytes });

<WorkflowChat
  messages={snapshot.messages}
  draft={draft}
  onDraftChange={setDraft}
  busy={running}
  onSend={async (text, { signal }) => { await startTurn(text, uploads.attached, signal); uploads.clear(); setDraft(""); }}
  onCancel={(signal) => controller.cancel()}
  steer={{ onSteer: (text, mode) => (mode === "queue" ? queueNextTurn(text) : submitSteer({ runId, guidance: text })), modes: ["guide", "queue"] }}
  onFiles={(files) => void uploads.add(files)}
  attachmentItems={uploads.items}
  onRemoveAttachment={uploads.remove}
  onRetryAttachment={uploads.retry}
  toolbar={{ onNewSession: newSession, exportTranscript: { filename: "conversation.md" }, copyTranscript: true }}
  messageProps={{ renderFooter: (m) => (m.detail ? <TurnBadge detail={m.detail} /> : null), variant: (m) => (m.role === "system" ? "hint" : undefined) }}
  interaction={presentInteraction(workflowPendingInteraction(snapshot), controller, { sessionPolicy: true, onDefer: hide })}
/>
```

- **Steer / Queue.** With `steer`, the composer stays usable while `busy`: the send
  button reads **Steer** (mode `"guide"`) or **Queue** (mode `"queue"`); with both modes a
  **Guide this run / Queue next turn** switch appears. The host posts the text (ui-kit
  `submitSteer` posts `inject_guidance`) or queues it. The status line says "Queued (seq N).
  Delivers at the run's next loop boundary." (or, with `parked`, "delivers at its next wake")
  only for an accepted steer; `accepted:false` is shown as a refusal and the draft stays. An
  accepted steer clears the draft through `onDraftChange("")`.
- **Typed attachment chips.** `attachmentItems` renders one chip per file with its state in
  words: Waiting, Uploading, attached (with its size), refused (both sizes) or failed (the
  gateway's words, with Retry). Send refuses while a chip is not attached. `useAttachmentUploads`
  is AbstractCode's upload queue: refused over `maxBytes` before any request, three uploads at
  once, Retry, Remove (a late result for a removed chip is dropped), `clear()` after a send.
  The `attachments` ReactNode slot remains for hosts with their own chips. Pass
  `onRemoveAttachment` with `attachmentItems` (a refused chip blocks Send until removed); the
  host owns any `thumbnail` object URLs and revokes them.
- **Toolbar.** `toolbar` renders **New chat**, **Clear**, **Copy** and **Export** in the header
  row next to `header`. Copy and Export carry the transcript as Markdown (`chatToMarkdown`; tool
  rows and live bubbles are left out).
- **Per-message slots.** `messageProps.renderFooter(m)` renders under a card (e.g. a per-turn
  detail badge); `messageProps.variant(m)` returning `"hint"` renders the message as one discreet
  line (system notes such as "Rejoined the open visit"); returning `"caption"` renders only the
  message's content (Markdown, media, files and attachments, without header, copy, speaker,
  reasoning, stats or footer), as the Avatar view's live line and findings do.
- **Stop that aborts.** `onSend(draft, { signal })`: Stop aborts that signal and calls
  `onCancel(signal)` with it, so a request/response host stops its fetch (an aborted send is not
  reported as a failure). When no send is in flight (a ledger host), `onCancel` gets a signal
  aborted at the same moment.

### Questions and approvals

`presentInteraction(wait, controller, options)` maps a runtime wait to the `interaction`
control, with ONE wording set (`WORKFLOW_INTERACTION_LABELS`, ADR 0001 §5, backlog 0032).
A tool approval offers exactly three decisions (operator ruling 2026-11-07: "Deny, Allow (this
tool), Allow All (ALL tools). but the scope is ONLY FOR THIS SESSION"); a dismissal defers, never
denies. Nothing the card does changes the app's default tool settings.

| Decision | Label | Offered when | What it does |
|---|---|---|---|
| Deny | Deny | always | `resume {approved: false}`: refuses this request |
| Allow | Allow | always | `sessionPolicy` + gateway mode: this request's tools for the rest of this session (`approveToolsForSession`), then `resume {approved: true}`; otherwise this request only |
| Allow All | Allow All | `sessionPolicy` + gateway mode | every tool for the rest of this session (`approveAllForSession`), then `resume {approved: true}` |
| Decide later | Decide later | `onDefer` | nothing (the run keeps waiting) |
| Answer | Submit / a choice button | always (free text when `allow_free_text`) | `resume {response}` |
| Continue without answering | Continue without answering | `allowSkip` | `resume {response: ""}` |
| Keep waiting | Keep waiting | `onDefer` | nothing |

- The card keeps its title ("1 action needs permission"), the calls in words ("Run the command
  …") and the **Review full tool arguments (JSON)** disclosure; the reach of Allow and Allow All
  is on their tooltips, never in a paragraph.
- Without a session grant (no `sessionPolicy`, or a gateway that cannot keep one) one line says
  so: "Allow covers this request only." or "This gateway cannot keep a choice for the session, so
  Allow covers this request only." Allow All is not offered then.
- `working` (with `workingLabel`) shows `WorkingDots`, three dots rising in turn at the transcript's tail,
  while the assistant works on a reply; pass the run state (for example
  `workflowProgress(snapshot).tone === "working"`). Hidden while an interaction waits on the person;
  static under reduced motion. `WorkingDots` is exported for other surfaces.
- The default message (0.9.1) is the web Assistant's compact card: small name, time in the interface
  font, no avatar tile. Apps override the `pc-chat-*` classes only to differ on purpose.
- Removed in 0.9.0: `onPermissionsAll`, `approveAllScope`, `onAllowForSession`,
  `approveAllDisabledReason`, `remember`, and `sessionPolicy: { toolsetOf, ask, maxRiskRank }`
  (now `sessionPolicy: true`); on the panel, `onApproveForSession`, `approveKinds`,
  `denyOptions`, `broadScopeSummary`, `approveAllDescription`, `approveForSessionDescription`,
  `policySummary`, `notCovered`, `disabledReason` and `remember`.
- `WorkflowInteractionPanel` `variant="card"` is the compact form for served-state lists (a
  "Needs you" board, an inbox): same decisions and callbacks, detail behind **Review**.
- `presentInteraction` also accepts a `ReplayInteraction`: the shape of
  `replay_view_v1.interaction` (kind, run_id, wait_key, step_id, seq, prompt, choices,
  allow_free_text, details, tool_calls, activity_id, command, answer_payload). With a replay
  view transport the controller's own interaction comes from the view (see
  [Replay view](#replay-view-the-gateways-reconstruction)); an `event` interaction is answered
  with the view's resume `command` (`controller.answerEvent(payload)`), not by deriving an event
  route.

#### Session tool policy (stored on the gateway)

With the session tool policy (contract v1; gateway routes
`GET/PUT/POST/DELETE /api/gateway/sessions/{session_id}/tool-policy`), Allow and Allow All are
stored for the session (the gateway's session) and the runtime runs the covered calls of every run
of the session with no approval wait. It needs an AbstractGateway that advertises
`capabilities.session_tool_policy.supported` in `GET discovery/capabilities`; on a gateway that
does not, Allow covers the shown request only and Allow All is not offered.

```ts
// Only when GET discovery/capabilities serves capabilities.session_tool_policy.supported === true.
const controller = new WorkflowSessionController(transport, { sessionToolPolicy: policyClientFor(sessionId) });
// The capability read failed: say so (mode "unavailable"); no client at all = "local-fallback".
controller.setSessionToolPolicyClient(null, { reason: "Could not read the gateway's capabilities (HTTP 502)." });
// Re-present on every snapshot change: the mode is the controller's, never a prop.
const interaction = presentInteraction(workflowPendingInteraction(snapshot), controller, { sessionPolicy: true });
```

- **One source for the mode:** `presentInteraction` reads `controller.sessionPolicyStatus()`
  (mode, reason, stored policy), so a control always does what it says.
- **Order:** Allow (`approveToolsForSession`: `{approve:{tools:[<this request's tools>]}}`) and
  Allow All (`approveAllForSession`: `{approve:{all:true}}`) write the policy FIRST, then answer
  the shown wait `{approved:true}` (the policy never answers a wait that already exists). A
  failed write answers nothing. When the write succeeds but the shown request changed meanwhile
  (or the session was closed), the error says the tool policy was saved and that request was not
  answered. The card sends no `ask`: Allow All means every tool the gateway authorizes for you.
- **What the gateway stores:** `all` is expanded when it is written to the tools the gateway
  authorizes for the caller at that moment; a tool enabled later is not covered. Approvals never
  reach automation runs, runs that read text other people wrote, or entity visits (the gateway's
  `scope` words); a deny reaches every run of the session.
- **Not covered:** what the gateway did not store (`clamped`) is in `snapshot.sessionPolicyClamped`
  and `onSessionPolicy`, and the decision's outcome says "Not covered: send_email (not authorized)".
- **Older gateway** (`supported` absent or false, or no client): `sessionPolicyMode` is
  `"local-fallback"`; Allow answers the shown request and the card says so in one line.
- **Capability read failed:** `sessionPolicyMode` is `"unavailable"` with `sessionPolicyReason`;
  no session grant is offered or made; Allow and Deny answer the shown request.
- **Deny for the session:** the controller keeps `denyToolForSession` / `denyKindForSession` /
  `approveKindForSession` for hosts that expose them elsewhere (never on the card). A deny is sent
  with the policy's current revision (read first when unknown); a 409 says "Someone changed this
  chat's policy; re-read" and refreshes it. When the stored policy denies a tool of a later batch,
  the card names it and Allow reports "The gateway refuses <tool>: denied by this session's
  policy", never a success.
- **Merge only adds:** a write never narrows or re-expands an earlier `all`/kinds. Undoing an
  approve is a reset (`resetSessionPolicy`, DELETE), never a merge. A reset is revision-guarded:
  the controller reads first when it has no revision (the policy's, or ui-kit's client
  `revision` of its last answer, which also covers "no policy yet") and calls `reset(revision)`.
  With no revision at all, a deny or a reset is refused with a labeled error ("This chat's policy
  was not changed/reset: …"), never skipped silently; a client's own refusal (ui-kit's
  `SessionToolPolicyRevisionError`) is shown the same way.
- **Same shape as ui-kit:** `SessionToolPolicyClient` here is the structural twin of ui-kit's
  (`reset(ifRevision?) → {revision?, scope?}`); `scripts/types/session_policy_twin.ts` fails `tsc`
  if either drifts.
- **Root session:** the grant is read from the run tree's ROOT session, so the client must be
  bound to the root run's `session_id`. A wait on a child run is answered on the child, and the
  policy is written to the root session; a client bound to another session, or a root session
  not known yet, is refused before any write.
- **Ledger:** `abstract.tool_policy_decision` renders as one line, "Allowed by this chat's
  policy (set by admin at …)" or "Denied by this chat's policy", never as a question; the
  covered tool rows say so too. A record with no identifiable call adds nothing.

### Attachments and generated media

`ChatMessage.media` items render under the message text (backlog 0031):

- `image`, `video`: inline; `audio`: the kit's waveform player, with `transcript` (speech to
  text) as a collapsible **Transcript** caption; music rides on audio.
- `file`: a document row (name, size) that opens the shared `AfFileViewer` inline behind
  **Open** (nothing loads before), or calls `messageProps.onOpenMedia(item)` when the host has
  its own opener. Text kinds (markdown, code, json, text) need `text`; without it the viewer
  says so and offers the raw link instead of an empty preview. **Raw links and security:** pass
  the gateway's content URL (`.../artifacts/{id}/content`, served with `CSP: sandbox` + nosniff)
  as `href`. A `blob:`/`data:` URL carries the app's origin and none of those headers, so it is
  used as the raw link only for an ALLOWLIST of inert types (pdf, JSON, plain text, Markdown,
  CSV/TSV, common source-code text types, raster images, concrete audio/video subtypes, no
  wildcard; `objectUrlRawLinkSafe`,
  `fileRawLink`) and never for HTML, SVG, XML, XSL or any unlisted type, whatever the host
  passes. The guard trusts the declared type: `contentType` must be the type the object URL's
  Blob was created with. On top of that, every `blob:`/`data:` raw link is a download
  (`download="<name>"`: saved, never opened in the browser), since a browser that cannot play a
  media type may render it as a document; a gateway `href` opens in a new tab. An
  opened Markdown file follows the chat's `images` policy (default `"link"`: no remote image
  loads) or the host's `renderMarkdown`. `onOpenMedia` receives the item with sanitized sources.
- Sources come from the host (object URLs it fetched with its credentials), never from model
  text. `WorkflowTransport.resolveArtifact?(runId, artifactId)` is the transport's hook for
  that (`GET runs/{id}/artifacts/{artifact_id}` metadata + `/content` bytes);
  `chatMediaFromArtifact(resolved)` picks the kind from the gateway's `content_type`
  (image/audio/video inline, everything else a file with the host's `text` when it read one;
  SVG never rendered) and
  `chatMediaForArtifacts(runId, ids, resolve)` resolves a message's `artifactIds` (it rejects
  when one cannot be resolved).
- Not done yet: the controller does not fold `$artifact` refs or generated-media ledger events
  into `message.media` by itself; a host fills `media` with the helpers above.

### Replay view: the gateway's reconstruction

AbstractGateway 0.17.0 serves the run tree's replay view (`replay_view_v1`, AbstractRuntime
0.15.0 `abstractruntime.replay`): `GET runs/{id}/view` (ETag = cursor token, 304 on
`If-None-Match`, `?at=<token>`) and `GET runs/{id}/view/stream` (SSE: one `view`, then `delta`
frames, `done`; reconnect with `Last-Event-ID`). It is the one reconstruction of a run: status,
the person-facing interaction (wherever in the tree it waits) with its resume `command`,
messages with provenance, one activity per node execution, artifacts, usage.

A host opts in by adding `replayView` to its `WorkflowTransport`:

```ts
import { createReplayViewTransport, type WorkflowTransport } from "@abstractframework/panel-chat";
import { gatewayApiPath } from "@abstractframework/ui-kit";

const transport: WorkflowTransport = {
  ...ledgerTransport, // getRun, getHistory, getLedger, streamLedger, submitCommand as before
  replayView: createReplayViewTransport({
    // `path` is relative to the gateway API ("runs/<id>/view"); add the host's credentials.
    fetch: (path, init) => fetch(gatewayApiPath(path), { ...init, credentials: "include" }),
  }),
};
```

With it, `WorkflowSessionController.load(runId)`:

- shows every turn of the conversation (0.6.2): the earlier turns, as the runtime selects them
  (`listSessionTurns(runId)`: a small `GET runs/{id}/history_bundle?include_session=true`), each
  from its own `GET /view`, oldest first, before the loaded turn; finished turns are kept per
  conversation across loads; an open or unreadable earlier turn and a failed listing are labeled;
- reads `GET runs/{id}/view` and `GET runs/{id}` (for `paused`), then follows `/view/stream`
  from the view's ETag; every frame is folded with `applyDelta` (a port of the runtime's
  `apply_delta`) and projected with `projectReplayView` into the same snapshot the components
  already render (`messages`, `interaction`, `status`, `displayStatus`, tool rows, Stop states);
- answers through `POST commands` with the view's command (`approve`, `resume`, `answerEvent`);
- opens the root's ledger stream only for live reply text (`llm.delta`, which the view does not
  carry), from the view's cursor; its records are ignored;
- does not read the history bundle or ledger pages, folds no records (`snapshot.records` stays
  empty) and has no timed `GET runs/{id}` poll;
- labels the snapshot: `source: "replay_view"`, `view` = the folded view.

Without `replayView`, or when the gateway answers that it has no such route (FastAPI's
`404 Not Found` or a 405, probed once per transport; `advertised: false` skips the probe), the
controller keeps its ledger fold and says so: `source: "ledger_fold"` with `sourceReason`
(`workflowSourceLabel(snapshot)` gives one line to show). Any other failure of the view read is
a load error, never a silent fallback. AbstractGateway 0.17.0 does not list the view in
`GET discovery/capabilities`; a host that reads a future `capabilities.replay_view` passes it
as `advertised`.

Not in the view yet (gaps, filed upstream): the kill switch's attribution (`killed_by`), so a
forced stop reads as "Stopped"; a tool call's command sandbox; per-call model timings
(`gen_time`, prefill) in the statistics; an EVENT wait without a prompt (`signal`) is not a
person-facing interaction there, so no "Send event" control is offered for it.

`replay_view.ts` exports the pieces for hosts that render other views of a run: `applyDelta`,
`ReplayViewFold` (drops a repeated or older frame after a reconnect), `SseParser`,
`parseCursorToken`, `createReplayViewTransport`, `projectReplayView`. They are checked against
a real gateway: `scripts/check_replay_view.mjs` folds the 15 conformance cases of AbstractRuntime
0.15.0 as captured from AbstractGateway 0.17.0 (`scripts/fixtures/replay_view/`, regenerated by
`scripts/regen_replay_view_fixtures.py`) and requires the folded view to serialize to the exact
bytes of `GET /view` after every record.

Measured on a 2,997-record run tree (4 runs, 495 tool approvals; scratch AbstractGateway
0.17.0, SQLite stores, loopback): opening the conversation took 3 requests and 1.21 MB with the
view against 509 requests and 5.60 MB with the ledger fold; first render 17 ms against 147 ms
(median of 5, warm), 123 ms against 166 ms on a freshly started gateway.

### Messages from the replay view

`WorkflowChat` also offers an optional `avatarConversation` presentation. Omit it to keep
the existing transcript. Pass `{sessionKey, avatar, ...conversationSnapshot(snapshot)}`;
the host supplies the avatar React node and keeps its existing draft, attachments,
steer/queue, cancellation and interaction callbacks. `AvatarConversation` is also available
standalone with `messages` and an `interaction` slot. Only explicit typed `public_update`,
answer/final/question messages, explicit host question outcomes and user input enter its public history. It never displays
tool rows, reasoning, untyped assistant text or unvalidated live deltas. Both replay and
ledger folding preserve public update identity, run, iteration, `sourceCallIds` and the
actor's own type, `kind`: `"finding"` for a fact or piece of evidence it established,
`"progress"` for what it is doing (event `kind`, replay `update_kind`; an update without it is
progress). The view uses the type as given and never infers it from the text.

The view is one column that fits its container above the composer: the avatar takes the
height that is left, then its status, any open question or approval, one live line, the
answer, and the actions (the host's `voiceControl` and `playbackControl`; buttons are at
least 44 px). Nothing in the view sits under the composer or auto-cycles. An open question or
approval keeps its full height, pinned at the top of the view, and what follows it (live line,
answer, actions) scrolls when the view is short; it is never taller than the view, so on a very
short view its context (why, targets, details) scrolls inside it while its heading and buttons
stay on screen.

The live line is the latest public update of the current turn (or a question or question
outcome), replaced as soon as a new one arrives: `conversationLive(messages)` returns
`{ line, answers, personKey }` for the messages after the person's latest message (accepted
mid-run guidance does not start a turn). It is rendered by `ChatMessageCard` with
`variant: "caption"`, so Markdown, links, media and files display as in the conversation,
three lines at most. Clicking it (a real button covers the closed line, named by its text) holds
it open in full, moves focus to its actions and offers **Reply to this**
(public updates only) and **Latest**, which returns to following. `onReplyContext` gives the
held update; the person's next message (`personKey` changes) ends the reply and the line
follows again. `conversationReply` quotes a held public update and rejects cross-run guidance
context. The host still submits replies through its normal execution path. For composed runs,
pass only the current authoritative run tree as `conversationReply`’s optional fourth
argument; this permits replying to the actual actor child while refusing historical or
unrelated runs. While a question or approval is open it is shown once, pinned above the line
with its controls (`conversationLive(messages, { pinnedRequest: true })` leaves questions out).
When the answer arrives after the last update, the line gives way to the answer: normal
messages through the shared renderer (its text, and a files row when there is one), each shown
once, announced politely, scrolling in place when long, with a visual completion cue on them. Private reasoning and statistics never reach the view.

**Findings** accumulate what the actor reported as `kind: "finding"` across the
conversation's runs, the newest last (`conversationFindings(messages)`). Each is a compact card
(two lines) that opens to its full text and its sources: the results it cited
(`sourceCallIds`) that the conversation holds, shown by their `url`, `file_path`, `path` or
`query` argument (a cited call with none of these is not listed), never by call id, tool name or
command. On a view at least 720 px wide the panel floats beside
the avatar; on a narrower view it is a bottom sheet the person opens with **Findings** and
closes with **Close** or Escape; the sheet takes focus when it opens and gives it back to
**Findings** when it closes, and it closes by itself when the view becomes wide enough for the
floating panel. An open finding closes with a click on its text or Escape. With no findings there
is no panel and no button. The view
re-renders a card only when its finding changes.

`useAvatarConversationPreferences(ownerScope)` persists chat/avatar mode and independent
visual/audio preferences for permissions, questions and completion; use an account-scoped
key. Default mode is chat; visual and audio cues are both on (`DEFAULT_CONVERSATION_CUES`).
Hosts expose these preferences in their own settings, never inside the Avatar view. `onCue` receives fresh foreground attention
revisions only. Optional `playConversationCue` plays a local earcon and rejects unsupported
or blocked playback. The host should report those errors. Optional `narrate`/`onNarrate`
request speech for newly observed public updates through the host's voice stack. Initial
history, reconnects, reading, recording and session switches never replay queued speech.
`onInterruptSpeech` runs before holding the line, opening the findings, voice and session cleanup.
Use `playbackControl` for pause/resume/silence actions, separately from `voiceControl`
which interrupts old speech before capture. `onAttendedChange` lets hosts suppress their
existing final-answer narration while the person holds the line, reads the findings sheet or
writes a draft. Fresh question and
approval cues remain eligible while reading; ordinary narration stays silent.
Explicit host-authenticated `user_guidance` receipts preserve accepted human corrections
in public history. An accepted receipt does not mean the assistant adopted the correction. The
component neither records audio nor starts TTS or a network request itself. Listening is
labeled as unsubmitted input; permission decisions remain the existing explicit controls.

A pending question or approval keeps its actual controls ahead of the live line,
with a smaller avatar while the request is open. Standalone `AvatarConversation` hosts
should pass `interactionId` for that actual request, or `""` when it is absent or deferred.
Omitting the prop treats a supplied interaction as active. `WorkflowChat`
forwards the current interaction identity. Long request content scrolls inside the
request; the decision buttons stay reachable.

In Avatar mode, permissions use ordinary action and destination language with labeled
decision icons. The assistant’s public explanation appears under “Why I’m asking” when
it is bound to this exact request. Missing explanations are stated explicitly. This
view does not show tool names, argument JSON or standing permission settings.
Provide `avatarConversation.onTechnicalView` to open your existing detailed view from
“Review details”. Unknown actions require detailed review before they can be allowed.
Standalone hosts use `WorkflowInteractionPanel variant="conversation"` with
`publicApprovalRequest(calls, wait.details.public_action, runId)` as the interaction’s
`publicRequest`; `onReviewTechnical` opens their detailed view. The ordinary panel
retains its full technical presentation and permission choices.

Optional browser checks are `scripts/check_avatar_conversation_browser.mjs` for the live
line, the findings panel and sheet, rendering and the view's geometry above the composer (1440 and 400 px, dark and
light), `scripts/check_avatar_requests_browser.mjs` for request visibility on desktop/phone and `scripts/check_compact_composer_browser.mjs` for input
growth, keyboard gates, draft recovery and action slots. They accept an installed
Playwright module through `PANEL_CHAT_PLAYWRIGHT_MODULE` and an optional browser through
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

`ChatMessage` carries a `replay_view_v1.messages[]` item (`projectReplayView` applies this
mapping; a `final` that `repeats` an answer is shown once, the open question's own message is
left to its card):

| replay `role` / `kind` | `ChatMessage` |
|---|---|
| `user` / `prompt` | `{ role: "user", kind: "prompt", content: text }` |
| `assistant` / `answer` (`final: true` when it is also the run's final answer) | `{ role: "assistant", kind: "answer", content: text }` |
| `assistant` / `final` (a final answer that repeats no earlier answer) | `{ role: "assistant", kind: "final", content: text }` |
| `assistant` / `question` | `{ role: "assistant", kind: "question", content: text }` (the open question itself comes from `interaction`) |
| `user` / `answer` | `{ role: "user", kind: "answer", content: text }` |
| `system` / `event` | `{ role: "system", kind: "event", content: text, level }` (use `variant: "hint"` for one-line notes) |

Every item maps `id` → `id`, `run_id` → `runId`, `artifact_ids` → `artifactIds` (resolve them
with `chatMediaForArtifacts`).

### Live replies (streaming)

When a run streams its model replies, the gateway sends two extra events on the
run's ledger stream: `llm.delta` (a piece of reply text, or with `snapshot: true`
the whole text so far) and `llm.delta_end` (the model call ended). They carry no
`id:` line. The controller shows them as a growing assistant bubble:

- To receive them, the host transport passes these frames to the optional sixth
  argument of `streamLedger(runId, after, onStep, signal, onOpen, onDelta)` and
  never to `onStep`. They must not move the ledger cursor or the `Last-Event-ID`
  used to reconnect. `llmDeltaFromSse(eventName, data)` returns the validated
  event for a delta frame, `null` for any other frame, and throws for a
  malformed one. A transport that does not pass `onDelta` keeps working: each
  reply then appears when it is complete.
- One bubble per model call (`live:<runId>:<callId>` in `snapshot.messages`,
  with a `live` field). Reasoning is shown in a collapsed "Thinking" block,
  never mixed into the reply text. A reply from a sub-run carries a
  "sub-agent · <node>" caption. The text is re-rendered at most every 60 ms
  (`liveRenderIntervalMs` controller option; 0 renders every frame); the
  latest text always lands at the end of the interval.
- The bubble goes away when the call's ledger record or the run's assistant
  message arrives, so a reply is never shown twice, and it never comes back for
  that call. A call that failed or was cancelled leaves a short note instead.
  A call the runtime had to run again (`llm.delta_end` with `reason:
  "cancelled"`, `detail: "reinvoked"`) is not a stop: its bubble is replaced by
  "Reply restarted: the model call was interrupted and is running again.", and
  the new call (`<step_id>:reinvoke`) streams in its own bubble.
  When the root run ends in any state (even with no output and no
  `llm.delta_end`), every live bubble of the turn closes, sub-agents included;
  when a sub-run ends, its bubbles close. When the controller stops following
  a stream (sign-out, reconnect limit), the bubbles it delivered close too.
  A call the gateway could not stream (`reason: "unavailable"`) adds one note
  per run and cause, for example "This reply is not streamed: this step asks
  the model for structured output."
- Each reconnect clears the live bubbles of that stream; the gateway's
  snapshots bring the current text back.

`WorkflowChat` renders a live bubble with a small "streaming" indicator. Its
`streamReplies` prop (`"gateway_default"`, `"on"` or `"off"`) holds the host's
"Stream replies" choice; the widget does not start runs, so the host puts it in
the start-run input with `streamRepliesRuntime(mode)`:

| `streamReplies` | Run input |
| --- | --- |
| `"on"` | `_runtime.stream: true` |
| `"off"` | `_runtime.stream: false` |
| `"gateway_default"` (or omitted) | `_runtime.stream` not set: the gateway setting `agents.streaming_default` decides |

```ts
const input = { prompt, _runtime: { ...streamRepliesRuntime(streamReplies) } };
```

## Message footer

Every message card renders one meta line, the same in every app (and mirrored by the AbstractAssistant desktop):
the **stamp** (`formatMessageStamp`: `12:46 AM` today, `Yesterday · 10:52 PM`, `Oct 21 · 10:52 PM`,
`Oct 21, 2025 · 10:52 PM` another year; the full date on hover; re-rendered at local midnight), the **speaker** on
every assistant message when you pass `onSpeakToggle` (always visible; dimmed and `aria-disabled` with its reason
while the reply streams or when it has no text; the Docs assistant has no read-aloud path yet, backlog 0063),
and **copy**. The stat chips of a workflow turn (tokens, tools, files changed, duration) each open the structured
`StatDetailPanel`, never a native multi-line tooltip. The full spec is in
[docs/api.md, Message footer](../docs/api.md#message-footer); `scripts/check_message_footer.mjs` pins it.

## Rendering rules

`ChatMessageContent` auto-detects JSON (via `tryParseJson` in `panel-chat/src/utils.ts`) and renders:

- JSON ⇒ `JsonViewer`
- otherwise ⇒ `Markdown` (or your `renderMarkdown` override)

Images in chat messages: `ChatMessageCard` renders the Markdown of every
message except the user's own with `images="link"`. An image then loads only
when `inlineImage(src)` accepts it — by default `sameOriginImage`: the source
resolved against `document.baseURI` must be http(s) on the page's own origin,
so a relative path (the kit's own `api/gateway/…` workspace content route,
which resolves under an app mounted at `/apps/<id>/`), a root-relative path
or an absolute same-origin URL loads. Every other image, including `//host/…`,
`javascript:` and `data:`, is shown as a link "image: <alt>" and never fetched, so
model-written text cannot make the browser call a remote URL. Pass
`images="inline"` (or your own `inlineImage`) through `messageProps` to change
it. `Markdown` used on its own keeps `images="inline"` as its default.

Markdown is intentionally minimal and implemented in `panel-chat/src/markdown.tsx` (headings 1–5, code fences, lists, tables, blockquotes, hr, emphasis, and optional highlighting).

## Styling & theming

- Import CSS in your app entrypoint (recommended):
  - `import "@abstractframework/panel-chat/panel_chat.css";`
  - `import "@abstractframework/ui-kit/theme.css";` (shared tokens)

### Responsive layout

- The chat thread (`pc-thread`), composer (`pc-composer`) and workflow chat / assistant panel
  (`pc-chat`) are query containers, so they adapt to the pane they sit in:
  - below 360 px of pane width, bubbles use the full width, tool rows stack and approval buttons
    stack full width;
  - on phones, tool rows also stack below 480 px of viewport;
  - a 420 px desktop drawer keeps the regular layout.
- The composer textarea grows with its content from `rows` lines (CSS `field-sizing`) up to 40 % of
  the viewport, and the composer clears the home indicator.
- On touch screens, buttons, icon buttons, tool rows, workspace rows and the JSON viewer's expandable
  lines are at least 44 px, and the composer textarea uses 16 px text.
- The tokens come from ui-kit 0.3 (`--tap-min`, `--vh-full`, `--safe-bottom`, `--reading-max`,
  `--font-size-input`). Every use has a fallback, so ui-kit 0.2 still renders.
- A container needs its width from its parent (block layout, stretch or `flex: 1`).

See [Responsive layout](../docs/responsive.md). `scripts/check_responsive.mjs` pins these rules.

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)

### Docs assistant speech

`DocsAssistantDrawer` and `docsAssistantPanel` show a speaker on assistant replies
when the Gateway has a configured speech route. Playback uses that reply’s run
and the host’s authenticated `fetchGateway` for synthesis and its audio artifact.
Click the speaker to play, pause or resume. Opening history does not autoplay.
Pass `voicePreferences` to use the app’s speech override, output device and volume;
omit it to follow Gateway defaults. A kept-alive rail panel should pass
`visible: false` while hidden to stop playback.

### Message files, clickable links and structured tool results

`WorkflowChat` uses the shared `ChatMessageCard`, `ToolActivity` and `ToolActivityGroup`.
Pass `artifactFetch` (the host's authenticated app-origin fetch), `attachmentScope` (a non-secret
account plus conversation identity), and `attachmentRun={{runId, output}}` for the active run.
The chat displays user and assistant artifact references on the originating message, restoring
submitted user files from `input_data` on older replay views. Explicit file-only outputs get an
assistant card; historical file-only replies omitted by old views are restored from authorized
run snapshots. Settled historical lookups are cached per scope; failed reads expose Retry.
Only attachment/output fields are inspected, excluding scratchpad and internal state artifacts.

Metadata and input reads are bounded to four concurrent requests; file bytes load only on
activation. Switching account/conversation cancels pending previews and downloads. Real files
open in the shared `AfModal` / `FileViewer`, including images, audio, video, PDF, JSON and text.
Text previews stop at 1 MiB; media/PDF previews stop at 25 MiB even without a size header.
Larger or unsupported files retain an explicit Download action. HTML/SVG/XML render as inert
source. Closing the modal aborts reads and revokes its object URLs; Escape returns focus.
Metadata failures keep the named file disabled with Retry until classification succeeds.
No credentials are put in a rendered file URL.

Opaque `artifactIds` remain replay evidence, never automatic attachment chips. The shared
projection uses explicit file/media provenance and the owning run, rejecting scratchpad,
provider traces, session/history/transcript branches and unlisted refs. Input/output recovery
reads only declared attachment fields; requested JSON files remain eligible. Metadata tagged
as internal offloads is suppressed. Files carried by a repeated final are merged into the
visible answer. The conversation compatibility snapshot exports `useWorkflowSession` too, so
both browser clients use this projection rather than an older installed controller.

Bare HTTP(S) and `www` links are clickable in Markdown, JSON strings and tool parameter/result
text. Whole URLs remain intact during highlighting; links open a separate tab with
`noopener noreferrer`. Tool results that contain a JSON object/array serialized as a string use
the same structured JSON viewer as object-valued results, including search tools.

Run `node scripts/check_message_files_links.mjs` after building. Browser checks:
`CHAT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_message_files_browser.mjs`.
