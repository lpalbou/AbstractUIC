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
- `@abstractframework/ui-kit` `^0.9.0` (icons, the responsive tokens, `AfFileViewer` / relative time for the workspace browser and `FileViewer`, `AfAudioPlayer` for audio previews and chat media, `AfDrawerSystem` panels, and the session tool-policy client types). Upgrade the two packages together: panel-chat 0.5.0 needs ui-kit 0.9.0.

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

## Docs assistant

`DocsAssistantDrawer` (0.4.0) is the ONE Docs assistant: the AbstractGateway console mounts it
through the islands bundle (`mountDocsAssistant`) and every app mounts it in React, opened from the
top bar's `docs` slot (book icon). Pass `source: { app, name }` (`app` = `gateway` or the app id),
the host's `fetchGateway(path, init)` (relative `api/gateway/...` paths with the host's
credentials) and `connected`. It reads the app's llms.txt from `GET api/gateway/docs/corpus?app=<id>`,
uploads attachments to the conversation's session, starts the gateway's shipped `docs-qa` workflow
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
component never fetches, polls, or resumes a workflow itself.

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
  interaction={presentInteraction(workflowPendingInteraction(snapshot), controller, { onPermissionsAll, approveAllScope: "in this browser", onDefer: hide })}
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
  line (system notes such as "Rejoined the open visit").
- **Stop that aborts.** `onSend(draft, { signal })`: Stop aborts that signal and calls
  `onCancel(signal)` with it, so a request/response host stops its fetch (an aborted send is not
  reported as a failure). When no send is in flight (a ledger host), `onCancel` gets a signal
  aborted at the same moment.

### Questions and approvals

`presentInteraction(wait, controller, options)` maps a runtime wait to the `interaction`
control, with ONE wording set (`WORKFLOW_INTERACTION_LABELS`, ADR 0001 §5, backlog 0032).
The native AbstractAssistant (Qt, iPhone) is the reference: deny / allow once / allow for
this chat / allow all, and a dismissal defers, never denies.

| Decision | Label | Offered when | What it sends |
|---|---|---|---|
| Deny | Deny | always | `resume {approved: false}` |
| Allow once | Allow once | always | `resume {approved: true}` for this batch |
| Allow for this chat | Allow for this chat | `onAllowForSession` | this batch, then the host's chat-scoped grant |
| Allow all enabled tools | Allow all enabled tools | `onPermissionsAll` | this batch, then the host's standing policy |
| Decide later | Decide later | `onDefer` | nothing (the run keeps waiting) |
| Answer | Submit / a choice button | always (free text when `allow_free_text`) | `resume {response}` |
| Continue without answering | Continue without answering | `allowSkip` | `resume {response: ""}` |
| Keep waiting | Keep waiting | `onDefer` | nothing |

- The allow-all sentence names no storage scope by default; pass `approveAllScope` with the
  host's truth ("for this Gateway account", "in this browser").
- `remember(toolNames)` returns a host-worded per-tool checkbox (`{label, checked, onChange}`).
- `approveAllDisabledReason` renders the broad grants disabled with the reason visible.
- `WorkflowInteractionPanel` `variant="card"` is the compact form for served-state lists (a
  "Needs you" board, an inbox): same decisions and callbacks, detail behind **Review**.
- `presentInteraction` also accepts a `ReplayInteraction`: the shape of
  `replay_view_v1.interaction` (kind, run_id, wait_key, step_id, seq, prompt, choices,
  allow_free_text, details, tool_calls, activity_id, command). It is a typed seam only: no
  gateway on `main` serves the replay view yet, panel-chat never fetches a `/view` route, and
  today's data path stays the controller's ledger fold + served `waiting`.

#### Session tool policy (stored on the gateway)

With the session tool policy (contract v1; gateway routes
`GET/PUT/POST/DELETE /api/gateway/sessions/{session_id}/tool-policy`), "Allow for this chat" is
stored for the chat (the gateway's session) and the runtime runs the covered calls of every run of
the chat with no approval wait. It needs an AbstractGateway that advertises
`capabilities.session_tool_policy.supported` in `GET discovery/capabilities`; on a gateway that
does not, the controller keeps the labeled local grant below.

```ts
// Only when GET discovery/capabilities serves capabilities.session_tool_policy.supported === true.
const controller = new WorkflowSessionController(transport, { sessionToolPolicy: policyClientFor(sessionId) });
// The capability read failed: say so (mode "unavailable"); no client at all = "local-fallback".
controller.setSessionToolPolicyClient(null, { reason: "Could not read the gateway's capabilities (HTTP 502)." });
// Re-present on every snapshot change: the mode is the controller's, never a prop.
const interaction = presentInteraction(workflowPendingInteraction(snapshot), controller, {
  sessionPolicy: { toolsetOf: (name) => toolsetByName[name], ask: toolsSetToAsk },
});
```

- **One source for the mode:** `presentInteraction` reads `controller.sessionPolicyStatus()`
  (mode, reason, `clamped`), so a control always says what its click does.
- **Order:** "Allow for this chat" (`approveAllForSession`: `{approve:{all:true}}`) and
  "Allow all <toolset> tools for this chat" (`approveKindForSession`: `{approve:{kinds}}`)
  write the policy FIRST, then answer the shown wait `{approved:true}` (the policy never
  answers a wait that already exists). A failed write answers nothing. When the write
  succeeds but the shown request changed meanwhile (or the chat was closed), the error says
  the chat's tool policy was saved and that request was not answered.
- **Ask:** `sessionPolicy.ask` (the person's explicit Ask tools) is sent on every write, so a
  broad approve never overrides them.
- **Toolsets** come from the call's `toolset`, else the host's `toolsetOf(name)` (the `toolset`
  of the tool's `GET discovery/tools` row). A tool with neither gets no kind button.
- **Not covered:** what the gateway did not store (`clamped`) is in `snapshot.sessionPolicyClamped`
  and `onSessionPolicy`, shows after the decision, and on the next approval as
  "Not covered: send_email (not authorized)".
- **Older gateway** (`supported` absent or false, or no client): `sessionPolicyMode` is
  `"local-fallback"`; the previous local grant stays and says what it does: **Allow for this run**
  with "Allowed until this run ends, in this browser only — the gateway cannot store chat
  policies." (or **Allow for this chat** with "Allowed for this chat in this browser only — …"
  when the host passes its own `onAllowForSession`).
- **Capability read failed:** `sessionPolicyMode` is `"unavailable"` with `sessionPolicyReason`;
  no chat grant is offered or made ("Allow for this chat is unavailable: <reason> Allow once
  still works."); Allow once and Deny work as always.
- **Deny for the chat:** under **More**, "Always deny <tool> in this chat" and "Always deny
  <toolset> tools in this chat" (`denyToolForSession` / `denyKindForSession`). Before the click
  and in its confirmation the panel says what a deny reaches: every run of this chat,
  automations and runs that read other people's text included, until reset; a request shown
  before it is refused even if approved later. A deny is sent with the policy's current
  revision (read first when unknown); a 409 says "Someone changed this chat's policy; re-read"
  and refreshes it. When the stored policy denies a tool of a later batch, the panel names it
  and "Allow once" reports "The gateway refuses <tool>: denied by this chat's policy", never a
  success.
- **Where it applies:** every policy response carries the gateway's `scope` words
  (`{approve, deny}`, top-level). The panel shows them exactly as served, after a decision
  ("Applies: …") and in the policy summary line; without them it says "The gateway did not say
  where this grant applies." (the kit never composes that sentence). The client must carry the
  response's `scope` onto the policy it returns (`SessionToolPolicy.scope`).
- **What "all" includes:** `all` and kinds include tools whose destination the model picks
  (`fetch_url`, `browser_probe`, `send_email`) on purpose; only the Ask list keeps them asking.
  The description says so: with no Ask list, "Nothing is set to Ask, so … are included"; with
  one, "Tools set to Ask keep asking: …". A host with no Ask list sends no `ask`.
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

### Messages from the replay view

`ChatMessage` can carry a `replay_view_v1.messages[]` item, so `messages` can come from the
replay view once a gateway serves it (no route on `main` yet; panel-chat never fetches one).
The shape below is the WIP `ReplayView` of abstractruntime `feat/replay-view` and may move
before it ships:

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
