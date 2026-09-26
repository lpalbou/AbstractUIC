# @abstractframework/panel-chat

Chat UI primitives for AbstractFramework-style UIs: thread rendering, message cards, a composer, and lightweight Markdown/JSON rendering.

## Peer dependencies

Declared in `panel-chat/package.json`:

- `react@^18`, `react-dom@^18`
- `@abstractframework/ui-kit` (icons used by `ChatMessageCard`)

## Install

- Workspace: add a dependency on `@abstractframework/panel-chat`
- npm: `npm i @abstractframework/panel-chat`

## Exported API

See `panel-chat/src/index.ts` for the authoritative export list. Common entry points:

- Components: `ChatThread`, `ChatComposer`, `ChatMessageCard`, `ChatMessageContent`
- App assistant: `AssistantPanel` (injected `ask` transport; see below)
- Controlled workflow surface: `WorkflowChat` and the `WorkflowInteraction` union
- Transport-injected runtime: `WorkflowSessionController`, `useWorkflowSession`, and `WorkflowTransport`
- Renderers: `Markdown`, `JsonViewer`
- Tool and run evidence: `ToolActivity`, `ToolActivityGroup`, `toolArguments`, `toolPreview`,
  `workflowProgress`, `workflowEvidence`, `foldWorkflowTools`, `historyRecords`,
  `statDetail`, `StatDetailPanel`
- Types: `ChatMessage`, `ChatAttachment`, `ChatMessageLevel`, `ChatStat`
- Utils: `chatToMarkdown`, `copyText`, `downloadTextFile`, `tryParseJson`

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

## App assistant

`AssistantPanel` is the docs Q&A surface an app places in the kit's `AfDrawer`
(opened from `AfTopBarActions`). It never fetches: pass an `ask(question, { signal, history })`
transport that returns a `Promise<string>` or an `AsyncIterable<string>` of deltas. Optional
props: `assistantName`, `suggestions`, `emptyState`, `placeholder`, `blockedNotice` (disables
the composer and shows the notice, e.g. while disconnected) and a controlled
`messages` / `onMessagesChange` pair. See the
[Adoption guide](../docs/adoption-guide.md) for the shared docs Q&A transport.

## Workflow chat

`WorkflowChat` is a controlled, presentation-only surface for hosts that own
their own gateway/workflow protocol. Supply `messages`, `draft`,
`onDraftChange`, and async `onSend`; the component retains the draft when a
send fails and presents an actionable retry. `busy` and `onCancel` add a stop
control. `disabled` gives observers a read-only transcript without hiding a
pending interaction.

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
  "sub-agent · <node>" caption. If the gateway reports that earlier text was
  dropped, the bubble says "Earlier text was dropped by the gateway."
- The bubble goes away when the call's ledger record or the run's assistant
  message arrives, so a reply is never shown twice, and it never comes back for
  that call. A call that failed or was cancelled leaves a short note instead.
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

Markdown is intentionally minimal and implemented in `panel-chat/src/markdown.tsx` (headings 1–5, code fences, lists, tables, blockquotes, hr, emphasis, and optional highlighting).

## Styling & theming

- Import CSS in your app entrypoint (recommended):
  - `import "@abstractframework/panel-chat/panel_chat.css";`
  - `import "@abstractframework/ui-kit/theme.css";` (shared tokens)

## Related docs

- Getting started: [`docs/getting-started.md`](../docs/getting-started.md)
- API reference: [`docs/api.md`](../docs/api.md)
- Architecture: [`docs/architecture.md`](../docs/architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](../docs/troubleshooting.md)
